import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { MongoMemoryReplSet, MongoMemoryServer } from 'mongodb-memory-server-core';
import { createApp } from '../src/app.js';
import Owner from '../src/models/Owner.js';
import Room from '../src/models/Room.js';
import Resident from '../src/models/Resident.js';
import RentRecord from '../src/models/RentRecord.js';
import Attendance from '../src/models/Attendance.js';
import ElectricityBill from '../src/models/ElectricityBill.js';
import generateToken from '../src/utils/generateToken.js';

// Run each topology in its own process so the real sign-in rate limiter has a
// separate client budget: RESIDENT_BED_TOPOLOGY=standalone selects the fallback.
const standalone = process.env.RESIDENT_BED_TOPOLOGY === 'standalone';
test(`owner bed editing safely configures legacy rooms and preserves resident accounts (${standalone ? 'standalone' : 'replica set'})`, { timeout: 180000 }, async (t) => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'isolated-bed-editing-test-secret-'.repeat(3);
  let database, server;
  t.after(async () => {
    if (server) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    await mongoose.disconnect(); await database?.stop();
    if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
  });
  const binary = { version: '8.0.17', downloadDir: fileURLToPath(new URL('../../tmp/mongodb-binaries/', import.meta.url)) };
  database = standalone
    ? await MongoMemoryServer.create({ binary })
    : await MongoMemoryReplSet.create({ binary, replSet: { count: 1 } });
  await mongoose.connect(database.getUri(), { dbName: `bed_editing_${randomUUID().replaceAll('-', '')}` });
  await Promise.all([Owner.init(), Room.init(), Resident.init(), RentRecord.init(), Attendance.init(), ElectricityBill.init()]);
  const [owner, foreignOwner] = await Owner.create([
    { name: 'Owner', pgName: 'Same Hostel', email: 'owner@bed-editing.test', password: 'OwnerPass123!' },
    { name: 'Foreign', pgName: 'Same Hostel', email: 'foreign@bed-editing.test', password: 'OwnerPass123!' },
  ]);
  const [legacyRoom, fullRoom, foreignRoom] = await Room.create([
    { owner: owner._id, roomNumber: '301', capacity: 1, monthlyRent: 5000 },
    { owner: owner._id, roomNumber: '302', capacity: 3, bedNumbers: ['B1', 'B2', 'B3'], monthlyRent: 6000 },
    { owner: foreignOwner._id, roomNumber: '301', capacity: 1, bedNumbers: ['B1'], monthlyRent: 7000 },
  ]);
  const password = 'PersonalBedPassword123!', passwordHash = await bcrypt.hash(password, 4);
  let number = 0;
  const person = (room, bedNumber) => Resident.create({
    owner: room.owner, room: room._id, ...(bedNumber && { bedNumber }), fullName: `Resident ${++number}`,
    phone: String(9800000000 + number), monthlyRent: 4500, passwordHash, loginEnabled: true,
    accountStatus: 'active', passwordChangeRequired: false,
  });
  const legacy = await person(legacyRoom), own = await person(fullRoom, 'B1');
  await person(fullRoom, 'b2'); // Older stored casing must still reserve the configured B2 slot.
  const unassigned = await person(fullRoom), foreign = await person(foreignRoom, 'B1');
  await RentRecord.create({ owner: owner._id, resident: legacy._id, room: legacyRoom._id, month: '2026-11',
    amountDue: 4500, dueDate: new Date('2026-11-05'), payments: [{ amount: 1000, method: 'Cash' }] });
  await Attendance.create({ owner: owner._id, resident: legacy._id, room: legacyRoom._id, date: '2026-11-01', status: 'Present' });
  await ElectricityBill.create({ owner: owner._id, room: legacyRoom._id, month: '2026-11', previousReading: 0,
    currentReading: 100, ratePerUnit: 8, dueDate: new Date('2026-11-05'), payments: [{ amount: 100 }] });
  const history = async () => ({ rent: await RentRecord.collection.find({}).toArray(),
    attendance: await Attendance.collection.find({}).toArray(), bills: await ElectricityBill.collection.find({}).toArray() });
  const historyBefore = await history();
  const ownerToken = generateToken(owner._id), foreignToken = generateToken(foreignOwner._id);
  server = createApp({ NODE_ENV: 'development' }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const request = async (method, path, body, token = ownerToken) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    const result = await response.json();
    assert.doesNotMatch(JSON.stringify(result), /passwordHash|sessionVersion|occupancyRevision/);
    return { status: response.status, ...result };
  };
  const login = (room, bedNumber) => request('POST', '/auth/resident/login', {
    ownerId: String(room.owner), pgName: owner.pgName, roomNumber: room.roomNumber, bedNumber, password,
  }, null);
  const stored = (resident) => Resident.findById(resident._id).select('+passwordHash').lean();
  const occupancy = (room) => Resident.countDocuments({ owner: room.owner, room: room._id, status: 'Active' });

  await t.test('new rooms have explicit beds and capacity edits must match configured slots', async () => {
    const created = await request('POST', '/rooms', { roomNumber: '401', capacity: 2, monthlyRent: 5000 });
    assert.equal(created.status, 201); assert.deepEqual(created.data.bedNumbers, ['B1', 'B2']);
    assert.equal((await request('PUT', `/rooms/${created.data._id}`, { capacity: 3 })).status, 400);
    for (const bedNumbers of [[], ['B1'], ['B1', 'b1']]) {
      assert.equal((await request('PUT', `/rooms/${created.data._id}`, { bedNumbers })).status, 400);
    }
    assert.equal((await request('PUT', `/rooms/${created.data._id}`, { capacity: 3, bedNumbers: ['B1', 'B2', 'B3'] })).status, 200);
  });
  await t.test('profile edits in a full legacy room need no bed assignment and preserve the account', async () => {
    const before = await stored(legacy);
    const saved = await request('PUT', `/residents/${legacy._id}`, { room: String(legacyRoom._id), fullName: 'Updated Legacy Resident', email: 'updated@legacy.test' });
    assert.equal(saved.status, 200);
    const after = await stored(legacy);
    assert.equal(after.fullName, 'Updated Legacy Resident'); assert.equal(after.email, 'updated@legacy.test');
    assert.equal(after.bedNumber, undefined); assert.equal(after.bedAssignments.length, 0);
    for (const field of ['passwordHash', 'monthlyRent', 'loginEnabled', 'accountStatus', 'passwordChangeRequired', 'phone', 'sessionVersion']) assert.deepEqual(after[field], before[field]);
    assert.equal(await occupancy(legacyRoom), 1);
    assert.deepEqual(await history(), historyBefore);
    assert.equal((await request('PUT', `/residents/${legacy._id}`, { bedNumber: '' })).status, 400);
    assert.equal((await request('PUT', `/rooms/${legacyRoom._id}`, { bedNumbers: ['B1'] })).status, 200);
    assert.equal((await request('PUT', `/residents/${legacy._id}`, { email: 'later@legacy.test' })).status, 200);
    assert.equal((await stored(legacy)).bedNumber, undefined);
    // Keep the following configuration test on an unconfigured legacy room.
    await Room.updateOne({ _id: legacyRoom._id }, { $unset: { bedNumbers: 1 } });
  });
  await t.test('configuring an occupied legacy room never assigns or changes residents automatically', async () => {
    const before = await Resident.collection.findOne({ _id: legacy._id });
    assert.equal((await request('PUT', `/rooms/${legacyRoom._id}`, { bedNumbers: ['B1'] }, foreignToken)).status, 404);
    assert.equal((await request('PUT', `/rooms/${legacyRoom._id}`, { bedNumbers: ['B1'] }, null)).status, 401);
    assert.equal((await request('PUT', `/rooms/${legacyRoom._id}`, { capacity: 1, bedNumbers: ['B1'] })).status, 200);
    assert.deepEqual(await Resident.collection.findOne({ _id: legacy._id }), before);
    assert.equal(await occupancy(legacyRoom), 1);
  });
  await t.test('a legacy resident receives a bed in its full room without replacing password or history', async () => {
    const before = await stored(legacy);
    const assigned = await request('PUT', `/residents/${legacy._id}`, { room: String(legacyRoom._id), bedNumber: 'b1' });
    assert.equal(assigned.status, 200); assert.equal(assigned.data.bedNumber, 'B1');
    const after = await stored(legacy);
    for (const field of ['passwordHash', 'monthlyRent', 'loginEnabled', 'accountStatus', 'passwordChangeRequired', 'phone']) assert.deepEqual(after[field], before[field]);
    assert.equal(String(after.room), String(legacyRoom._id)); assert.equal(after.bedAssignments.length, 1);
    assert.equal(await occupancy(legacyRoom), 1);
    const session = await login(legacyRoom, 'B1');
    assert.equal(session.status, 200); assert.equal(session.data.resident.id, String(legacy._id));
    assert.equal((await request('GET', '/resident/profile', undefined, session.data.token)).status, 200);
    assert.equal((await request('PUT', `/residents/${legacy._id}`, { bedNumber: 'B1' })).status, 200);
    assert.equal((await stored(legacy)).bedAssignments.length, 1);
    assert.equal(await Resident.countDocuments({ _id: legacy._id }), 1);
  });
  await t.test('editing and changing an own bed in a full room keeps occupancy and invalidates stale coordinates', async () => {
    const before = await stored(own);
    assert.equal((await request('PUT', `/residents/${own._id}`, { room: String(fullRoom._id), bedNumber: 'B1', fullName: 'Edited Resident' })).status, 200);
    const session = await login(fullRoom, 'B1'); assert.equal(session.status, 200);
    assert.equal((await request('PUT', `/residents/${own._id}`, { room: String(fullRoom._id), bedNumber: 'B3' })).status, 200);
    assert.equal((await request('GET', '/auth/resident/me', undefined, session.data.token)).status, 401);
    assert.equal((await login(fullRoom, 'B1')).status, 401);
    const next = await login(fullRoom, 'B3'); assert.equal(next.status, 200);
    assert.equal(next.data.resident.id, String(own._id));
    const after = await stored(own);
    assert.equal(after.passwordHash, before.passwordHash); assert.equal(after.monthlyRent, before.monthlyRent);
    assert.equal(after.passwordChangeRequired, before.passwordChangeRequired);
    assert.equal(after.bedAssignments.length, 2); assert.ok(after.bedAssignments[0].releasedAt);
    assert.equal(after.bedAssignments[1].bedNumber, 'B3'); assert.equal(await occupancy(fullRoom), 3);
    assert.equal((await stored(unassigned)).bedNumber, undefined);
  });
  await t.test('case-insensitive duplicate assignments and removal of occupied beds are rejected without mutation', async () => {
    const before = await stored(own);
    assert.equal((await request('PUT', `/residents/${own._id}`, { bedNumber: 'B2' })).status, 409);
    assert.deepEqual(await stored(own), before);
    const roomBefore = await Room.findById(fullRoom._id).lean();
    assert.equal((await request('PUT', `/rooms/${fullRoom._id}`, { capacity: 2, bedNumbers: ['B1', 'B2'] })).status, 409);
    assert.equal((await request('PUT', `/rooms/${fullRoom._id}`, { bedNumbers: ['B1', 'B2', 'X'] })).status, 409);
    assert.deepEqual(await Room.findById(fullRoom._id).lean(), roomBefore);
  });
  await t.test('concurrent moves cannot claim the same bed even when another capacity slot is free', async () => {
    const source = await Room.create({ owner: owner._id, roomNumber: '501', capacity: 2, monthlyRent: 5000 });
    const target = await Room.create({ owner: owner._id, roomNumber: '502', capacity: 2, bedNumbers: ['B1', 'B2'], monthlyRent: 5000 });
    const first = await person(source), second = await person(source);
    const results = await Promise.all([first, second].map((resident) => request('PUT', `/residents/${resident._id}`, { room: String(target._id), bedNumber: 'B1' })));
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
    assert.equal(await occupancy(target), 1); assert.equal(await occupancy(source), 1);
    assert.equal(await Resident.countDocuments({ room: target._id, bedNumber: 'B1', status: 'Active' }), 1);
  });
  await t.test('room moves require configured beds and never silently clear an existing assignment', async () => {
    const target = await Room.create({ owner: owner._id, roomNumber: '503', capacity: 2, monthlyRent: 6000 });
    const before = await stored(legacy);
    const rejected = await request('PUT', `/residents/${legacy._id}`, { room: String(target._id) });
    assert.equal(rejected.status, 400); assert.match(rejected.message, /Configure bed numbers/);
    assert.deepEqual(await stored(legacy), before); assert.equal(await occupancy(target), 0);
    assert.equal((await request('PUT', `/rooms/${target._id}`, { bedNumbers: ['B1', 'B2'] })).status, 200);
    const missingBed = await request('PUT', `/residents/${legacy._id}`, { room: String(target._id) });
    assert.equal(missingBed.status, 400); assert.deepEqual(await stored(legacy), before);
  });
  await t.test('new residents save, reload, edit beds and rooms, and log in without resetting their password', async () => {
    const created = await request('POST', '/rooms', { roomNumber: '504', capacity: 2, monthlyRent: 6000 });
    const target = await request('POST', '/rooms', { roomNumber: '505', capacity: 2, monthlyRent: 7000 });
    const credentials = { loginEnabled: true, temporaryPassword: 'NewTemporary123!' };
    const saved = await request('POST', '/residents', {
      room: created.data._id, bedNumber: 'b1', fullName: 'New Resident', phone: '9777777701', ...credentials,
    });
    assert.equal(saved.status, 201);
    const added = await stored(saved.data);
    assert.equal(added.bedNumber, 'B1'); assert.equal(added.passwordChangeRequired, true);
    assert.equal(await bcrypt.compare(credentials.temporaryPassword, added.passwordHash), true);
    let reloaded = await request('GET', `/residents/${added._id}`);
    assert.equal(reloaded.data.room._id, created.data._id); assert.equal(reloaded.data.bedNumber, 'B1');
    assert.equal((await request('PUT', `/residents/${added._id}`, { bedNumber: 'B2' })).status, 200);
    reloaded = await request('GET', `/residents/${added._id}`); assert.equal(reloaded.data.bedNumber, 'B2');
    assert.equal((await request('PUT', `/residents/${added._id}`, { room: target.data._id, bedNumber: 'B1', email: 'edited@isolated.test', loginEnabled: true })).status, 200);
    reloaded = await request('GET', `/residents/${added._id}`);
    assert.equal(reloaded.data.room._id, target.data._id); assert.equal(reloaded.data.bedNumber, 'B1');
    const edited = await stored(added);
    for (const field of ['passwordHash', 'monthlyRent', 'loginEnabled', 'accountStatus', 'passwordChangeRequired']) assert.deepEqual(edited[field], added[field]);
    assert.equal(edited.email, 'edited@isolated.test');
    assert.deepEqual(edited.bedAssignments.map((entry) => entry.bedNumber), ['B1', 'B2', 'B1']);
    assert.equal(await Resident.countDocuments({ room: created.data._id, status: 'Active' }), 0);
    const session = await request('POST', '/auth/resident/login', { ownerId: String(owner._id), pgName: owner.pgName,
      roomNumber: '505', bedNumber: 'B1', password: credentials.temporaryPassword }, null);
    assert.equal(session.status, 200); assert.equal(session.data.resident.passwordChangeRequired, true);
    assert.equal((await request('GET', '/resident/profile', undefined, session.data.token)).status, 403);
    const changedPassword = await request('POST', '/auth/resident/change-password', {
      currentPassword: credentials.temporaryPassword, newPassword: 'PersonalPassword456!',
    }, session.data.token);
    assert.equal(changedPassword.status, 200);
    assert.equal((await request('GET', '/resident/profile', undefined, changedPassword.data.token)).status, 200);
    assert.equal((await stored(added)).passwordChangeRequired, false);
  });
  await t.test('concurrent admissions cannot duplicate a bed or exceed room capacity', async () => {
    const room = await request('POST', '/rooms', { roomNumber: '506', capacity: 2, monthlyRent: 5000 });
    const add = (phone, bedNumber) => request('POST', '/residents', { room: room.data._id, bedNumber, phone, fullName: 'Concurrent Resident' });
    const results = await Promise.all([add('9777777702', 'B1'), add('9777777703', 'b1')]);
    assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
    assert.equal((await add('9777777704', 'B2')).status, 201);
    assert.equal((await add('9777777705', 'B2')).status, 409);
    assert.equal(await Resident.countDocuments({ room: room.data._id, status: 'Active' }), 2);
    const rooms = await request('GET', '/rooms');
    const occupancy = rooms.data.find((item) => item._id === room.data._id);
    assert.equal(occupancy.currentResidents, 2); assert.equal(occupancy.capacity, 2);
  });
  await t.test('conflicting legacy bed claims require manual resolution and never select an ambiguous login', async () => {
    const room = await Room.create({ owner: owner._id, roomNumber: '601', capacity: 2, bedNumbers: ['B1', 'B2'], monthlyRent: 5000 });
    const first = await person(room, 'B1'), second = await person(room, 'b1');
    const before = await stored(first);
    const conflict = await request('PUT', `/rooms/${room._id}`, { bedNumbers: ['B1', 'B2'] });
    assert.equal(conflict.status, 409); assert.match(conflict.message, /manually/);
    assert.equal((await login(room, 'B1')).status, 401); assert.deepEqual(await stored(first), before);
    assert.equal((await request('PUT', `/residents/${second._id}`, { bedNumber: 'B2' })).status, 200);
    assert.equal((await request('PUT', `/rooms/${room._id}`, { bedNumbers: ['B1', 'B2'] })).status, 200);
    assert.equal((await login(room, 'B1')).status, 200);
  });
  await t.test('room references and resident edits remain owner-scoped and all financial history survives', async () => {
    assert.equal((await request('PUT', `/residents/${legacy._id}`, { room: String(foreignRoom._id), bedNumber: 'B1' })).status, 404);
    assert.equal((await request('PUT', `/residents/${foreign._id}`, { bedNumber: 'B1' })).status, 404);
    assert.equal((await request('PUT', `/residents/${legacy._id}`, { bedNumber: 'B1' }, foreignToken)).status, 404);
    assert.equal(String((await stored(legacy)).room), String(legacyRoom._id));
    assert.deepEqual(await history(), historyBefore);
  });
});
