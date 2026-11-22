import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { createApp } from '../src/app.js';
import Owner from '../src/models/Owner.js';
import Room from '../src/models/Room.js';
import Resident from '../src/models/Resident.js';
import RentRecord from '../src/models/RentRecord.js';
import Attendance from '../src/models/Attendance.js';
import ElectricityBill from '../src/models/ElectricityBill.js';
import generateToken from '../src/utils/generateToken.js';

test('owner bed editing safely configures legacy rooms and preserves resident accounts', { timeout: 120000 }, async (t) => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'isolated-bed-editing-test-secret-'.repeat(3);
  let database, server;
  t.after(async () => {
    if (server) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    await mongoose.disconnect(); await database?.stop();
    if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
  });
  database = await MongoMemoryReplSet.create({
    binary: { version: '8.0.17', downloadDir: fileURLToPath(new URL('../../tmp/mongodb-binaries/', import.meta.url)) },
    replSet: { count: 1 },
  });
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
