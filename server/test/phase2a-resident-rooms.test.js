import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import { createApp } from '../src/app.js';
import Owner from '../src/models/Owner.js';
import Room from '../src/models/Room.js';
import Resident from '../src/models/Resident.js';
import generateToken, { generateResidentToken } from '../src/utils/generateToken.js';

test('Phase 2A resident room information and vacancy on disposable MongoDB', { timeout: 120000 }, async (t) => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'isolated-phase2a-secret-'.repeat(3);
  let mongo, server;
  t.after(async () => {
    if (server) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    await mongoose.disconnect(); await mongo?.stop();
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });
  // No dotenv, external database URI, production data or seed scripts.
  mongo = await MongoMemoryServer.create({
    binary: { version: '8.0.17', downloadDir: fileURLToPath(new URL('../../tmp/mongodb-binaries/', import.meta.url)) },
    instance: { dbName: `phase2a_test_${randomUUID().replaceAll('-', '')}` },
  });
  await mongoose.connect(mongo.getUri());
  await Promise.all([Owner.init(), Room.init(), Resident.init()]);
  const [owner, foreignOwner] = await Owner.create([
    { name: 'Owner A', email: 'owner-a@phase2a.test', password: 'OwnerPass123!', pgName: 'Shared PG Name' },
    { name: 'Owner B', email: 'owner-b@phase2a.test', password: 'OwnerPass123!', pgName: 'Shared PG Name' },
  ]);
  const [assigned, full, vacant, legacy, foreignRoom] = await Room.create([
    { owner: owner._id, roomNumber: '101', floor: '1', roomType: 'Shared', airConditioning: 'AC', amenities: ['Wi-Fi', 'Wardrobe'], capacity: 3, monthlyRent: 5000, notes: 'OWNER_ONLY_NOTE', lastMeterReading: 999 },
    { owner: owner._id, roomNumber: '102', floor: '1', roomType: 'Single', airConditioning: 'Non-AC', amenities: ['Fan'], capacity: 1, monthlyRent: 4500 },
    { owner: owner._id, roomNumber: '201', floor: '2', roomType: 'Studio', airConditioning: 'AC', amenities: [], capacity: 2, monthlyRent: 6500 },
    { owner: owner._id, roomNumber: '202', floor: '2', capacity: 1, monthlyRent: 3500 },
    { owner: foreignOwner._id, roomNumber: '999', floor: 'PRIVATE_FLOOR', roomType: 'PRIVATE_TYPE', amenities: ['PRIVATE_AMENITY'], capacity: 2, monthlyRent: 99999 },
  ]);
  const passwordHash = await bcrypt.hash('IsolatedResident123!', 4);
  const [self, disabledRoommate, occupant, left, overA, overB, foreign, badReference] = await Resident.create([
    { owner: owner._id, room: assigned._id, fullName: 'PRIVATE_SELF', phone: '9876543210', email: 'private@phase2a.test', monthlyRent: 4200, loginEnabled: true, accountStatus: 'active', passwordHash },
    { owner: owner._id, room: assigned._id, fullName: 'PRIVATE_DISABLED_ROOMMATE', phone: '9876543211', monthlyRent: 5000, loginEnabled: false },
    { owner: owner._id, room: full._id, fullName: 'PRIVATE_OCCUPANT', phone: '9876543212', monthlyRent: 4500 },
    { owner: owner._id, room: vacant._id, fullName: 'PRIVATE_LEFT_RESIDENT', phone: '9876543213', monthlyRent: 6500, status: 'Left' },
    // Older databases can contain over-capacity rooms. Do not invent negative beds.
    { owner: owner._id, room: legacy._id, fullName: 'PRIVATE_OVER_A', phone: '9876543214', monthlyRent: 3500 },
    { owner: owner._id, room: legacy._id, fullName: 'PRIVATE_OVER_B', phone: '9876543215', monthlyRent: 3500 },
    { owner: foreignOwner._id, room: foreignRoom._id, fullName: 'PRIVATE_OTHER_PG', phone: '9876543210', monthlyRent: 99999, loginEnabled: true, accountStatus: 'active', passwordHash },
    { owner: foreignOwner._id, room: assigned._id, fullName: 'PRIVATE_BAD_REFERENCE', phone: '9876543216', monthlyRent: 99999 },
  ]);
  const residentToken = generateResidentToken(self), ownerToken = generateToken(owner._id);
  const roomsBefore = await Room.collection.find({}).toArray();
  const residentsBefore = await Resident.collection.find({}).toArray();
  server = createApp({ NODE_ENV: 'development' }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const request = async (method, path, token = residentToken, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
      ...(body !== undefined && method !== 'GET' && { body: JSON.stringify(body) }),
    });
    return { status: response.status, ...(await response.json()) };
  };
  const assertPrivate = (result) => {
    const text = JSON.stringify(result);
    assert.doesNotMatch(text, /PRIVATE_|OWNER_ONLY_NOTE|passwordHash|sessionVersion|lastMeterReading|residents|recentBills|payments|email|phone/);
    for (const person of [self, disabledRoommate, occupant, left, overA, overB, foreign, badReference]) assert.ok(!text.includes(String(person._id)));
    assert.ok(!text.includes(String(foreignRoom._id)));
  };

  await t.test('My Room shows saved metadata, actual occupancy and the resident own agreed rent', async () => {
    const result = await request('GET', `/resident/my-room?room=${foreignRoom._id}&owner=${foreignOwner._id}`);
    assert.equal(result.status, 200); assertPrivate(result);
    assert.deepEqual(result.data.room, {
      id: String(assigned._id), roomNumber: '101', floor: '1', roomType: 'Shared', airConditioning: 'AC', amenities: ['Wi-Fi', 'Wardrobe'],
      monthlyRent: 5000, assignedMonthlyRent: 4200, capacity: 3, occupiedBeds: 2, availableBeds: 1, beds: [], bedNumber: null, status: 'Partially Occupied',
    });
  });
  await t.test('availability includes only this PG, counts disabled logins, excludes left residents and handles legacy metadata', async () => {
    const result = await request('GET', `/resident/rooms?pgId=${foreignOwner._id}&owner=${foreignOwner._id}`);
    assert.equal(result.status, 200); assertPrivate(result); assert.equal(result.count, 4);
    assert.deepEqual(result.data.filters, { floors: ['1', '2'], roomTypes: ['Shared', 'Single', 'Studio'] });
    assert.deepEqual(result.data.rooms.map((room) => [room.roomNumber, room.occupiedBeds, room.availableBeds, room.status]), [
      ['101', 2, 1, 'Partially Occupied'], ['102', 1, 0, 'Full'], ['201', 0, 2, 'Vacant'], ['202', 2, 0, 'Full'],
    ]);
    const savedLegacy = result.data.rooms.find((room) => room.id === String(legacy._id));
    assert.equal(savedLegacy.roomType, null); assert.equal(savedLegacy.airConditioning, null); assert.deepEqual(savedLegacy.amenities, []);
    assert.ok(result.data.rooms.every((room) => !Object.hasOwn(room, 'assignedMonthlyRent')));
    const otherPG = await request('GET', '/resident/rooms', generateResidentToken(foreign));
    assert.equal(otherPG.count, 1); assert.equal(otherPG.data.rooms[0].roomNumber, '999');
  });
  await t.test('search, floor, room type and vacancy filters combine without losing available filter options', async () => {
    for (const [query, expected] of [
      ['availability=Vacant', ['201']], ['availability=Full', ['102', '202']],
      ['availability=Partially%20Occupied', ['101']], ['floor=2', ['201', '202']],
      ['roomType=Shared&floor=1&availability=Partially%20Occupied&search=10', ['101']],
      ['search=sTuDiO', ['201']], ['search=%5B', []], ['roomType=Studio&floor=1', []],
    ]) {
      const result = await request('GET', `/resident/rooms?${query}`);
      assert.equal(result.status, 200); assertPrivate(result);
      assert.deepEqual(result.data.rooms.map((room) => room.roomNumber), expected);
      assert.deepEqual(result.data.filters.floors, ['1', '2']);
      assert.deepEqual(result.data.filters.roomTypes, ['Shared', 'Single', 'Studio']);
    }
    for (const query of ['search[$ne]=x', 'floor[$ne]=x', 'roomType[$ne]=x', 'availability=Occupied']) {
      assert.equal((await request('GET', `/resident/rooms?${query}`)).status, 400);
    }
  });
  await t.test('resident routes are read-only and do not mutate existing room or resident records', async () => {
    for (const path of ['/resident/my-room', '/resident/rooms']) {
      assert.equal((await request('GET', path, null)).status, 401);
      assert.equal((await request('GET', path, ownerToken)).status, 403);
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal((await request(method, path, residentToken, { capacity: 20, room: foreignRoom._id })).status, 404);
    }
    for (const [method, path] of [['GET', '/rooms'], ['POST', '/rooms'], ['PUT', `/rooms/${assigned._id}`], ['DELETE', `/rooms/${assigned._id}`]]) {
      assert.equal((await request(method, path, residentToken, { roomNumber: 'HACK', capacity: 20, monthlyRent: 0 })).status, 403);
    }
    assert.deepEqual(await Room.collection.find({}).toArray(), roomsBefore);
    assert.deepEqual(await Resident.collection.find({}).toArray(), residentsBefore);
  });
  await t.test('owner room create/edit, legacy Android payloads and capacity protection remain compatible', async () => {
    const created = await request('POST', '/rooms', ownerToken, { roomNumber: '301', floor: '3', roomType: 'Suite', airConditioning: 'AC', amenities: ['Wi-Fi', 'Desk'], monthlyRent: 8000, capacity: 2, owner: foreignOwner._id });
    assert.equal(created.status, 201); assert.equal(created.data.owner, String(owner._id));
    assert.equal(created.data.airConditioning, 'AC'); assert.deepEqual(created.data.amenities, ['Wi-Fi', 'Desk']);
    const changed = await request('PUT', `/rooms/${created.data._id}`, ownerToken, { roomType: 'Standard', airConditioning: null, amenities: [] });
    assert.equal(changed.status, 200); assert.equal(changed.data.airConditioning, null); assert.deepEqual(changed.data.amenities, []);
    const legacyCreate = await request('POST', '/rooms', ownerToken, { roomNumber: '302', monthlyRent: 4000, capacity: 2 });
    assert.equal(legacyCreate.status, 201); assert.equal(legacyCreate.data.roomType, undefined); assert.equal(legacyCreate.data.airConditioning, undefined);
    assert.equal((await request('PUT', `/rooms/${assigned._id}`, ownerToken, { capacity: 1 })).status, 409);
    assert.equal((await request('DELETE', `/rooms/${full._id}`, ownerToken)).status, 409);
    assert.equal((await request('GET', `/rooms/${full._id}`, ownerToken)).data.status, 'Occupied');
    assert.equal((await request('PUT', `/rooms/${assigned._id}`, generateToken(foreignOwner._id), { roomType: 'Changed' })).status, 404);
    for (const payload of [{ airConditioning: 'Maybe' }, { roomType: { $ne: '' } }, { amenities: 'Desk' }, { amenities: [''] }, { amenities: Array(31).fill('Desk') }]) {
      assert.equal((await request('PUT', `/rooms/${created.data._id}`, ownerToken, payload)).status, 400);
    }
  });
  await t.test('first-login requirements and deactivated sessions protect both new room endpoints', async () => {
    disabledRoommate.loginEnabled = true; disabledRoommate.accountStatus = 'active'; disabledRoommate.passwordChangeRequired = true; disabledRoommate.passwordHash = passwordHash;
    await disabledRoommate.save();
    const temporaryToken = generateResidentToken(disabledRoommate);
    for (const path of ['/resident/my-room', '/resident/rooms']) assert.equal((await request('GET', path, temporaryToken)).status, 403);
    self.loginEnabled = false; await self.save();
    for (const path of ['/resident/my-room', '/resident/rooms']) assert.equal((await request('GET', path)).status, 401);
  });
});
