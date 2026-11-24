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
import Attendance from '../src/models/Attendance.js';
import EmergencyContact from '../src/models/EmergencyContact.js';
import Notification from '../src/models/Notification.js';
import RentRecord from '../src/models/RentRecord.js';
import generateToken, { generateResidentToken } from '../src/utils/generateToken.js';

test('resident contacts, personal attendance and notifications persist safely in isolated MongoDB', { timeout: 180000 }, async (t) => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'disposable-portal-feature-tests-'.repeat(3);
  let database, server;
  t.after(async () => {
    if (server) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    await mongoose.disconnect(); await database?.stop();
    if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
  });
  // No .env, external database URI, startup module or production seed is used.
  database = await MongoMemoryReplSet.create({
    binary: { version: '8.0.17', downloadDir: fileURLToPath(new URL('../../tmp/mongodb-binaries/', import.meta.url)) },
    replSet: { count: 1 },
  });
  await mongoose.connect(database.getUri(), { dbName: `portal_features_${randomUUID().replaceAll('-', '')}` });
  await Promise.all([Owner.init(), Room.init(), Resident.init(), Attendance.init(), Notification.init(), EmergencyContact.init()]);
  const [owner, otherOwner] = await Owner.create([
    { name: 'Owner', pgName: 'Test PG', phone: '9800000099', email: 'owner@portal.test', password: 'OwnerPassword123!' },
    { name: 'Other Owner', pgName: 'Other PG', email: 'other@portal.test', password: 'OwnerPassword123!' },
  ]);
  const [room, oldRoom, otherRoom] = await Room.create([
    { owner: owner._id, roomNumber: '101', capacity: 10, monthlyRent: 5000, bedNumbers: Array.from({ length: 10 }, (_, index) => `B${index + 1}`) },
    { owner: owner._id, roomNumber: '102', capacity: 2, monthlyRent: 5000 },
    { owner: otherOwner._id, roomNumber: '999', capacity: 1, monthlyRent: 7000 },
  ]);
  const password = 'ResidentPassword123!', passwordHash = await bcrypt.hash(password, 4);
  const resident = await Resident.create({ owner: owner._id, room: room._id, bedNumber: 'B1', fullName: 'Asha', phone: '9800000001',
    email: 'asha@portal.test', monthlyRent: 5000, joiningDate: new Date('2026-09-09T20:00:00Z'),
    emergencyContact: { name: 'Parent', phone: '9800000088' }, passwordHash, loginEnabled: true, accountStatus: 'active' });
  const legacy = await Resident.create({ owner: owner._id, room: room._id, fullName: 'Legacy', phone: '9800000002', monthlyRent: 5000, joiningDate: new Date('2026-08-01') });
  const roommate = await Resident.create({ owner: owner._id, room: room._id, bedNumber: 'B2', fullName: 'Roommate', phone: '9800000003', monthlyRent: 5000, joiningDate: new Date('2026-08-01'), passwordHash, loginEnabled: true, accountStatus: 'active' });
  const foreign = await Resident.create({ owner: otherOwner._id, room: otherRoom._id, fullName: 'Foreign', phone: '9800000004', monthlyRent: 7000 });
  const record = (person, date, status, override = {}) => ({ owner: person.owner, resident: person._id, room: person.room, date, status, ...override });
  await Attendance.create([
    record(resident, '2026-09-09', 'Absent'), record(resident, '2026-09-10', 'Present', { room: oldRoom._id }),
    record(resident, '2026-09-12', 'Absent'), record(resident, '2026-09-15', 'Present'), record(resident, '2026-09-16', 'On Leave'),
    record(roommate, '2026-09-11', 'Absent'), record(foreign, '2026-09-12', 'Absent'),
    record(resident, '2026-08-31', 'Absent'), record(resident, '2026-10-01', 'On Leave'),
    // Even a malformed historical tenant association must not become visible.
    record(resident, '2026-09-20', 'Absent', { owner: otherOwner._id }),
  ]);
  await EmergencyContact.create({ owner: owner._id, name: 'Existing caretaker', category: 'Caretaker', phone: '9800000077' });
  await RentRecord.create({ owner: owner._id, resident: resident._id, room: room._id, month: '2026-09', amountDue: 5000,
    dueDate: new Date('2026-09-05'), payments: [{ amount: 1000, method: 'Cash' }] });
  const history = async () => ({ attendance: await Attendance.collection.find({}).toArray(),
    contacts: await EmergencyContact.collection.find({}).toArray(), rent: await RentRecord.collection.find({}).toArray() });
  const originalHistory = await history();
  const originalResident = await Resident.findById(resident._id).select('+passwordHash').lean();
  const ownerToken = generateToken(owner._id), otherToken = generateToken(otherOwner._id);
  const residentToken = generateResidentToken(resident);
  server = createApp({ NODE_ENV: 'development' }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const request = async (method, path, body, token = ownerToken) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    return { status: response.status, ...await response.json() };
  };

  await t.test('directory exposes existing contact fields once and isolates owners', async () => {
    const list = await request('GET', '/residents');
    assert.equal(list.status, 200); assert.equal(list.data.length, 3);
    assert.equal(new Set(list.data.map((row) => row._id)).size, 3);
    const contact = list.data.find((row) => row._id === String(resident._id));
    assert.equal(contact.phone, resident.phone); assert.equal(contact.email, resident.email);
    assert.equal(contact.emergencyContact.phone, '9800000088'); assert.equal(contact.room.roomNumber, '101');
    assert.doesNotMatch(JSON.stringify(list), /passwordHash|sessionVersion/);
    const others = await request('GET', '/residents', undefined, otherToken);
    assert.deepEqual(others.data.map((row) => row._id), [String(foreign._id)]);
    assert.equal((await request('GET', `/residents/${resident._id}`, undefined, otherToken)).status, 404);
    assert.equal((await request('PUT', `/residents/${resident._id}`, { emergencyContact: { phone: '9800000011' } }, otherToken)).status, 404);
    assert.equal((await request('GET', '/residents', undefined, residentToken)).status, 403);
  });
  await t.test('parent edits persist without changing password, login identity, sessions or assignments', async () => {
    const saved = await request('PUT', `/residents/${resident._id}`, { emergencyContact: { phone: '+44 (20) 7946-0958' } });
    assert.equal(saved.status, 200); assert.equal(saved.data.emergencyContact.phone, '+442079460958');
    const reloaded = await request('GET', `/residents/${resident._id}`);
    assert.equal(reloaded.data.emergencyContact.phone, '+442079460958'); assert.equal(reloaded.data.emergencyContact.name, 'Parent');
    const stored = await Resident.findById(resident._id).select('+passwordHash').lean();
    for (const key of ['passwordHash', 'normalizedPhone', 'sessionVersion', 'loginEnabled', 'accountStatus', 'room', 'bedNumber', 'joiningDate']) {
      assert.deepEqual(stored[key], originalResident[key], key);
    }
    assert.equal((await request('GET', '/resident/profile', undefined, residentToken)).status, 200);
    const login = await request('POST', '/auth/resident/login', { ownerId: String(owner._id), pgName: owner.pgName, roomNumber: '101', bedNumber: 'B1', password }, null);
    assert.equal(login.status, 200);
    for (const phone of ['not-a-number', '1234', '+000000000000', { value: '9800000000' }, false, null, 0]) {
      assert.equal((await request('PUT', `/residents/${resident._id}`, { emergencyContact: { phone } })).status, 400);
    }
    assert.equal((await request('GET', `/residents/${resident._id}`)).data.emergencyContact.phone, '+442079460958');
  });
  await t.test('legacy residents stay editable without parent numbers and new residents retain parent numbers', async () => {
    await Resident.collection.updateOne({ _id: legacy._id }, { $set: { emergencyContact: null } });
    assert.equal((await request('PUT', `/residents/${legacy._id}`, { emergencyContact: { phone: '9800000022' } })).status, 200);
    assert.equal((await request('GET', `/residents/${legacy._id}`)).data.emergencyContact.phone, '9800000022');
    assert.equal((await request('PUT', `/residents/${legacy._id}`, { fullName: 'Legacy Updated', emergencyContact: { phone: '' } })).status, 200);
    assert.equal((await request('GET', `/residents/${legacy._id}`)).data.fullName, 'Legacy Updated');
    const added = await request('POST', '/residents', { room: String(room._id), bedNumber: 'B3', fullName: 'New Resident', phone: '9800000005', emergencyContact: { phone: '+1 (212) 555-0123' } });
    assert.equal(added.status, 201);
    assert.equal((await request('GET', `/residents/${added.data._id}`)).data.emergencyContact.phone, '+12125550123');
  });
  await t.test('personal attendance clamps to IST joining date, follows prior rooms and ignores caller identities', async () => {
    const response = await request('GET', `/resident/attendance?month=2026-09&resident=${foreign._id}&owner=${otherOwner._id}&residentId=${roommate._id}`, undefined, residentToken);
    assert.equal(response.status, 200); assert.equal(response.data.joiningDate, '2026-09-10');
    assert.deepEqual(response.data.records.map(({ date }) => date), ['2026-09-10', '2026-09-12', '2026-09-15', '2026-09-16']);
    assert.deepEqual(response.data.summary, { Present: 2, Absent: 1, 'On Leave': 1, recordedDays: 3, percentage: 66.67 });
    assert.equal((await request('GET', '/resident/attendance?month=2026-08', undefined, residentToken)).data.records.length, 0);
    const onlyLeave = (await request('GET', '/resident/attendance?month=2026-10', undefined, residentToken)).data;
    assert.equal(onlyLeave.summary.percentage, null); assert.equal(onlyLeave.summary.Absent, 0);
    const empty = (await request('GET', '/resident/attendance?month=2026-07', undefined, residentToken)).data;
    assert.equal(empty.records.length, 0); assert.equal(empty.summary.recordedDays, 0); assert.equal(empty.summary.percentage, null);
    const own = await request('GET', '/resident/attendance?month=2026-09', undefined, generateResidentToken(roommate));
    assert.deepEqual(own.data.records.map(({ date }) => date), ['2026-09-11']);
    assert.equal(own.data.summary.percentage, 0);
    for (const month of ['2026-13', 'invalid', '2099-01']) assert.equal((await request('GET', `/resident/attendance?month=${month}`, undefined, residentToken)).status, 400);
  });
  await t.test('unauthorized accounts cannot read or write attendance; owner marking still persists', async () => {
    assert.equal((await request('GET', '/resident/attendance', undefined, null)).status, 401);
    assert.equal((await request('GET', '/resident/attendance')).status, 403);
    assert.equal((await request('GET', '/resident/attendance', undefined, generateResidentToken(legacy))).status, 401);
    await Resident.updateOne({ _id: roommate._id }, { $set: { passwordChangeRequired: true } });
    assert.equal((await request('GET', '/resident/attendance', undefined, generateResidentToken(roommate))).status, 403);
    await Resident.updateOne({ _id: roommate._id }, { $set: { passwordChangeRequired: false, loginEnabled: false } });
    assert.equal((await request('GET', '/resident/attendance', undefined, generateResidentToken(roommate))).status, 401);
    const payload = { date: '2026-09-17', records: [{ resident: String(resident._id), status: 'Present' }] };
    assert.equal((await request('PUT', '/attendance', payload, residentToken)).status, 403);
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal((await request(method, '/resident/attendance', payload, residentToken)).status, 404);
    const before = await history(); assert.deepEqual(before, originalHistory);
    assert.equal((await request('PUT', '/attendance', payload)).status, 200);
    assert.equal((await request('GET', '/attendance?date=2026-09-17')).data.find((row) => String(row.resident._id) === String(resident._id)).status, 'Present');
    const own = await request('GET', '/resident/attendance?month=2026-09', undefined, residentToken);
    assert.equal(own.data.summary.Present, 3); assert.equal(own.data.summary.percentage, 75);
    assert.equal(await Attendance.countDocuments({ resident: resident._id, date: '2026-09-09' }), 1);
    const profile = await request('GET', '/resident/profile', undefined, residentToken);
    assert.equal(profile.data.resident.ownerPhone, '9800000099');
  });
  await t.test('notification history/read actions remain scoped and preserve saved records', async () => {
    const makeNotification = (person, index) => ({ owner: person.owner, recipientRole: 'resident', recipient: person._id,
      type: 'notice_published', title: `Update ${index}`, message: 'Existing notification', path: '/resident/notices',
      eventKey: `portal-test-${index}`, relatedEntityId: new mongoose.Types.ObjectId(), createdAt: new Date(`2026-09-${String(index + 1).padStart(2, '0')}T00:00:00Z`), availableAt: new Date('2026-01-01') });
    const notifications = await Notification.create(Array.from({ length: 23 }, (_, index) => makeNotification(resident, index)));
    const foreignNotification = await Notification.create(makeNotification(foreign, 0));
    assert.equal((await request('GET', '/notifications/unread-count', undefined, residentToken)).data.unreadCount, 23);
    const first = await request('GET', '/notifications?page=1&limit=20', undefined, residentToken);
    const older = await request('GET', '/notifications?page=2&limit=20', undefined, residentToken);
    assert.equal(first.data.notifications.length, 20); assert.equal(older.data.notifications.length, 3);
    assert.equal((await request('PATCH', `/notifications/${foreignNotification._id}/read`, {}, residentToken)).status, 404);
    assert.equal((await request('PATCH', `/notifications/${notifications[0]._id}/read`, {}, residentToken)).status, 200);
    assert.ok((await Notification.findById(notifications[0]._id)).readAt);
    assert.equal((await request('GET', '/notifications/unread-count', undefined, residentToken)).data.unreadCount, 22);
    assert.equal((await request('PATCH', '/notifications/read-all', {}, residentToken)).data.updated, 22);
    assert.equal(await Notification.countDocuments({}), 24); assert.equal((await Notification.findById(foreignNotification._id)).readAt, null);
    assert.deepEqual((await history()).contacts, originalHistory.contacts);
    assert.deepEqual((await history()).rent, originalHistory.rent);
    await EmergencyContact.create([
      { owner: owner._id, name: 'Saved PG owner', category: 'PG Owner', phone: '9800000066' },
      { owner: otherOwner._id, name: 'Foreign PG owner', category: 'PG Owner', phone: '9800000055', priority: true },
    ]);
    await Owner.updateOne({ _id: owner._id }, { $unset: { phone: 1 } });
    const fallbackProfile = await request('GET', '/resident/profile', undefined, residentToken);
    assert.equal(fallbackProfile.data.resident.ownerPhone, '+919800000066');
    assert.equal(await EmergencyContact.countDocuments({}), 3);
  });
});
