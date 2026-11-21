import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import { createApp } from '../src/app.js';
import Owner from '../src/models/Owner.js';
import Resident from '../src/models/Resident.js';
import Room from '../src/models/Room.js';
import Attendance from '../src/models/Attendance.js';
import RentRecord from '../src/models/RentRecord.js';
import ElectricityBill from '../src/models/ElectricityBill.js';
import { normalizePhone, pgCode } from '../src/utils/residentAuth.js';

// No dotenv, external URI, seeding or production connection is used by this suite.
test('Phase 1 authentication and legacy workflows on disposable MongoDB', { timeout: 300000 }, async (t) => {
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'isolated-phase1-test-secret-'.repeat(3);
  const mongod = await MongoMemoryServer.create({
    binary: { version: '8.0.17', downloadDir: fileURLToPath(new URL('../../tmp/mongodb-binaries/', import.meta.url)) },
    instance: { dbName: `phase1_test_${randomUUID().replaceAll('-', '')}` },
  });
  let server;
  t.after(async () => {
    if (server) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    await mongoose.disconnect();
    await mongod.stop();
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });
  await mongoose.connect(mongod.getUri());
  await Promise.all([Owner.init(), Resident.init(), Room.init(), Attendance.init(), RentRecord.init(), ElectricityBill.init()]);
  server = createApp({ NODE_ENV: 'production', CLIENT_URL: 'https://isolated.example.test' }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let requestNumber = 0;
  const request = async (method, path, body, token) => {
    requestNumber += 1;
    const response = await fetch(`${base}${path}`, {
      method, headers: { 'Content-Type': 'application/json',
        // Separate test clients; the existing limiter has its own regression test.
        'X-Forwarded-For': `198.51.${Math.floor(requestNumber / 200)}.${requestNumber % 200 + 1}`,
        ...(token && { Authorization: `Bearer ${token}` }) },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    const data = await response.json();
    assert.doesNotMatch(JSON.stringify(data), /passwordHash|\$2[aby]\$|sessionVersion/);
    return { status: response.status, ...data };
  };
  let ownerA, ownerB, tokenA, tokenB, roomA, roomA2, roomB, residentA, residentB, legacyId, residentToken, beforeReset;
  let historicalRent, historicalAttendance, historicalBill;
  const temp = 'Temporary123!';
  const permanent = 'Personal456!';
  const loginBody = (overrides = {}) => ({ pgName: 'Shared Hostel', pgCode: ownerA.pgCode, roomNumber: '101', phone: '9876543210', password: temp, ...overrides });

  await t.test('owner registration/login ignore injected roles and retain the v1 response shape', async () => {
    for (const [email, suffix] of [['owner-a@example.test', 'A'], ['owner-b@example.test', 'B']]) {
      const result = await request('POST', '/auth/register', { name: `Owner ${suffix}`, email, password: 'OwnerPass123!', pgName: 'Shared Hostel', role: 'resident' });
      assert.equal(result.status, 201);
      assert.equal(result.data.owner.role, 'owner');
      if (suffix === 'A') { ownerA = result.data.owner; tokenA = result.data.token; }
      else { ownerB = result.data.owner; tokenB = result.data.token; }
      const login = await request('POST', '/auth/login', { email, password: 'OwnerPass123!' });
      assert.equal(login.status, 200);
      assert.equal(login.data.owner.id, result.data.owner.id);
    }
    assert.notEqual(ownerA.pgCode, ownerB.pgCode);
    const legacyToken = jwt.sign({ id: ownerA.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    assert.equal((await request('GET', '/auth/me', undefined, legacyToken)).status, 200);
    assert.equal((await request('GET', '/dashboard', undefined, legacyToken)).status, 200);
    const stored = await Owner.findById(ownerA.id).select('+password');
    assert.notEqual(stored.password, 'OwnerPass123!');
    assert.equal(await stored.comparePassword('OwnerPass123!'), true);
    for (const [email, password] of [['missing@example.test', 'wrong'], ['owner-a@example.test', 'wrong']]) {
      const result = await request('POST', '/auth/login', { email, password });
      assert.equal(result.status, 401); assert.equal(result.message, 'Invalid email or password');
    }
  });
  await t.test('existing owner room and dashboard APIs remain tenant scoped', async () => {
    roomA = (await request('POST', '/rooms', { roomNumber: '101', capacity: 6, monthlyRent: 5000 }, tokenA)).data;
    roomA2 = (await request('POST', '/rooms', { roomNumber: '102', capacity: 4, monthlyRent: 5000 }, tokenA)).data;
    roomB = (await request('POST', '/rooms', { roomNumber: '101', capacity: 4, monthlyRent: 6000 }, tokenB)).data;
    assert.equal((await request('GET', `/rooms/${roomA._id}`, undefined, tokenB)).status, 404);
    assert.equal((await request('GET', '/rooms', undefined, tokenA)).data.length, 2);
    assert.equal((await request('GET', '/dashboard', undefined, tokenA)).status, 200);
  });
  await t.test('legacy resident documents with duplicate phones survive and can be edited', async () => {
    const result = await Resident.collection.insertOne({ owner: new mongoose.Types.ObjectId(ownerA.id), room: new mongoose.Types.ObjectId(roomA._id), fullName: 'Legacy Resident', phone: '9876543210', joiningDate: new Date('2025-01-01'), monthlyRent: 4500, status: 'Active' });
    legacyId = String(result.insertedId);
    historicalRent = await RentRecord.create({ owner: ownerA.id, resident: legacyId, room: roomA._id, month: '2026-11', amountDue: 4500, dueDate: new Date('2026-11-05'), payments: [{ amount: 1000, paidOn: new Date('2026-11-01'), method: 'Cash' }] });
    historicalAttendance = await Attendance.create({ owner: ownerA.id, resident: legacyId, room: roomA._id, date: '2026-11-01', status: 'Present' });
    historicalBill = await ElectricityBill.create({ owner: ownerA.id, room: roomA._id, month: '2026-11', previousReading: 10, currentReading: 20, ratePerUnit: 8, dueDate: new Date('2026-11-05'), payments: [{ amount: 20, method: 'Cash' }] });
    await Resident.collection.insertOne({ owner: new mongoose.Types.ObjectId(ownerA.id), room: new mongoose.Types.ObjectId(roomA._id), fullName: 'Legacy Duplicate', phone: '9876543210', joiningDate: new Date('2025-02-01'), monthlyRent: 4000, status: 'Active' });
    const resultEdit = await request('PUT', `/residents/${legacyId}`, { fullName: 'Legacy Resident Updated' }, tokenA);
    assert.equal(resultEdit.status, 200);
    assert.equal(resultEdit.data.loginEnabled, false);
    assert.equal((await request('GET', '/residents', undefined, tokenA)).data.length, 2);
  });
  await t.test('owner enables authentication on the existing resident without duplicating records', async () => {
    const total = await Resident.countDocuments();
    const result = await request('PATCH', `/residents/${legacyId}/login-access`, { loginEnabled: true, temporaryPassword: temp, owner: ownerB.id, role: 'owner' }, tokenA);
    assert.equal(result.status, 200); residentA = result.data;
    assert.equal(residentA._id, legacyId); assert.equal(residentA.owner, ownerA.id);
    assert.equal(residentA.accountStatus, 'active'); assert.equal(residentA.passwordChangeRequired, true);
    assert.equal(await Resident.countDocuments(), total);
    const stored = await Resident.findById(legacyId).select('+passwordHash');
    assert.equal(stored.normalizedPhone, '+919876543210'); assert.equal(await bcrypt.compare(temp, stored.passwordHash), true);
    assert.equal(stored.toJSON().passwordHash, undefined); assert.equal(stored.toObject().passwordHash, undefined);
    assert.equal((await Resident.findById(legacyId)).passwordHash, undefined);
  });
  await t.test('owner creates login accounts, multiple residents share rooms, and phone uniqueness is per PG', async () => {
    const roommate = await request('POST', '/residents', { room: roomA._id, fullName: 'Roommate', phone: '9876543211', monthlyRent: 5000, loginEnabled: true, temporaryPassword: temp }, tokenA);
    assert.equal(roommate.status, 201);
    const otherPG = await request('POST', '/residents', { room: roomB._id, fullName: 'Other PG Resident', phone: '+91 98765-43210', monthlyRent: 6000, loginEnabled: true, temporaryPassword: temp }, tokenB);
    assert.equal(otherPG.status, 201); residentB = otherPG.data;
    const duplicates = await request('POST', '/residents', { room: roomA._id, fullName: 'Duplicate Account', phone: '+919876543210', monthlyRent: 5000, loginEnabled: true, temporaryPassword: temp }, tokenA);
    assert.equal(duplicates.status, 409);
    const noPassword = await request('POST', '/residents', { room: roomA._id, fullName: 'Missing Password', phone: '9876543212', loginEnabled: true }, tokenA);
    assert.equal(noPassword.status, 400);
    const roommateLogin = await request('POST', '/auth/resident/login', loginBody({ phone: '9876543211' }));
    assert.equal(roommateLogin.status, 200);
    assert.notEqual(roommateLogin.data.resident.id, legacyId);
  });
  await t.test('duplicate PG names require code without exposing a PG directory; valid PG credentials are isolated', async () => {
    const ambiguous = await request('POST', '/auth/resident/login', loginBody({ pgCode: '' }));
    assert.equal(ambiguous.status, 401);
    const success = await request('POST', '/auth/resident/login', loginBody({ phone: '+91 (98765) 43210' }));
    assert.equal(success.status, 200); residentToken = success.data.token;
    assert.equal(success.data.resident.id, legacyId);
    assert.ok(success.data.resident.firstLoginAt); assert.ok(success.data.resident.lastLoginAt);
    const otherPG = await request('POST', '/auth/resident/login', loginBody({ pgCode: ownerB.pgCode }));
    assert.equal(otherPG.data.resident.id, residentB._id);
    assert.equal(otherPG.data.resident.pgCode, ownerB.pgCode);
    assert.equal((await request('POST', '/auth/resident/login', loginBody({ pgName: 'Incorrect name' }))).status, 401);
  });
  await t.test('all invalid credentials, malformed input, unknown PGs and disabled logins use generic errors', async () => {
    let expected;
    for (const body of [loginBody({ password: 'wrong' }), loginBody({ phone: '9999999999' }), loginBody({ roomNumber: '999' }), loginBody({ pgName: 'Unknown', pgCode: '' }), loginBody({ pgCode: 'malformed' }), loginBody({ phone: { $ne: null } }), {}, loginBody({ pgName: { $ne: null } })]) {
      const result = await request('POST', '/auth/resident/login', body);
      assert.equal(result.status, 401); expected ||= result.message; assert.equal(result.message, expected);
    }
    assert.equal((await request('POST', '/auth/resident/register', {})).status, 404);
  });
  await t.test('resident tokens cannot access any owner management API and owners cannot use resident APIs', async () => {
    for (const path of ['/auth/me', '/dashboard', '/rooms', '/residents', `/residents/${residentB._id}/profile`, '/attendance', '/rent', '/electricity', '/settings', '/reminders/activity', '/reports?month=2026-11']) {
      assert.equal((await request('GET', path, undefined, residentToken)).status, 403, path);
    }
    assert.equal((await request('POST', '/residents', { room: roomA._id }, residentToken)).status, 403);
    assert.equal((await request('GET', '/resident/profile', undefined, tokenA)).status, 403);
    for (const [method, path, body] of [['GET', `/residents/${legacyId}`, undefined], ['PATCH', `/residents/${legacyId}/login-access`, { loginEnabled: false }], ['POST', `/residents/${legacyId}/reset-password`, { temporaryPassword: temp }], ['PUT', `/residents/${legacyId}`, { room: roomB._id }]]) {
      assert.equal((await request(method, path, body, tokenB)).status, 404);
    }
    assert.equal((await request('PUT', `/residents/${legacyId}`, { room: roomB._id }, tokenA)).status, 404);
  });
  await t.test('first login is restricted until password change; old tokens and temporary passwords stop working', async () => {
    assert.equal((await request('GET', '/resident/dashboard', undefined, residentToken)).status, 403);
    const session = await request('GET', '/auth/session', undefined, residentToken);
    assert.equal(session.data.resident.passwordChangeRequired, true);
    assert.equal((await request('POST', '/auth/resident/change-password', { currentPassword: 'wrong', newPassword: permanent }, residentToken)).status, 400);
    assert.equal((await request('POST', '/auth/resident/change-password', { currentPassword: temp, newPassword: temp }, residentToken)).status, 400);
    const changed = await request('POST', '/auth/resident/change-password', { currentPassword: temp, newPassword: permanent, residentId: residentB._id }, residentToken);
    assert.equal(changed.status, 200); beforeReset = residentToken; residentToken = changed.data.token;
    assert.equal(changed.data.resident.passwordChangeRequired, false);
    assert.equal((await request('GET', '/auth/session', undefined, beforeReset)).status, 401);
    assert.equal((await request('GET', '/resident/dashboard', undefined, residentToken)).status, 200);
    const me = await request('GET', `/resident/profile?residentId=${residentB._id}&pgId=${ownerB.id}`, undefined, residentToken);
    assert.equal(me.data.resident.id, legacyId); assert.equal(me.data.resident.pgCode, ownerA.pgCode);
    assert.equal((await request('POST', '/auth/resident/login', loginBody())).status, 401);
    assert.equal((await request('POST', '/auth/resident/login', loginBody({ password: permanent }))).status, 200);
  });
  await t.test('owner reset invalidates sessions and requires first-login password change again', async () => {
    const result = await request('POST', `/residents/${legacyId}/reset-password`, { temporaryPassword: 'ResetPass789!' }, tokenA);
    assert.equal(result.status, 200);
    assert.equal((await request('GET', '/auth/session', undefined, residentToken)).status, 401);
    assert.equal((await request('POST', '/auth/resident/login', loginBody({ password: permanent }))).status, 401);
    const login = await request('POST', '/auth/resident/login', loginBody({ password: 'ResetPass789!' }));
    assert.equal(login.status, 200); residentToken = login.data.token;
    assert.equal(login.data.resident.passwordChangeRequired, true);
  });
  await t.test('disable and re-enable cannot resurrect a previously issued session', async () => {
    assert.equal((await request('PATCH', `/residents/${legacyId}/login-access`, { loginEnabled: false }, tokenA)).status, 200);
    assert.equal((await request('GET', '/auth/resident/me', undefined, residentToken)).status, 401);
    assert.equal((await request('POST', '/auth/resident/login', loginBody({ password: 'ResetPass789!' }))).status, 401);
    assert.equal((await request('PATCH', `/residents/${legacyId}/login-access`, { loginEnabled: true }, tokenA)).status, 200);
    assert.equal((await request('GET', '/auth/resident/me', undefined, residentToken)).status, 401);
    const login = await request('POST', '/auth/resident/login', loginBody({ password: 'ResetPass789!' })); residentToken = login.data.token;
    assert.equal(login.status, 200);
  });
  await t.test('room reassignment changes valid login room without replacing resident or account', async () => {
    const previousToken = residentToken;
    assert.equal((await request('PUT', `/residents/${legacyId}`, { room: roomA2._id }, tokenA)).status, 200);
    assert.equal((await request('GET', '/auth/resident/me', undefined, previousToken)).status, 401);
    assert.equal((await request('POST', '/auth/resident/login', loginBody({ password: 'ResetPass789!' }))).status, 401);
    const login = await request('POST', '/auth/resident/login', loginBody({ password: 'ResetPass789!', roomNumber: '102' }));
    assert.equal(login.status, 200); residentToken = login.data.token;
    assert.equal(login.data.resident.id, legacyId); assert.equal(login.data.resident.room.roomNumber, '102');
    const firstDate = login.data.resident.firstLoginAt;
    const again = await request('POST', '/auth/resident/login', loginBody({ password: 'ResetPass789!', roomNumber: '102' }));
    assert.equal(again.data.resident.firstLoginAt, firstDate);
  });
  await t.test('financial, payment and attendance history survive enabling accounts, moves and leaving', async () => {
    const rent = historicalRent;
    const attendance = historicalAttendance;
    const before = rent.toObject();
    assert.equal((await request('GET', '/rent?month=2026-11', undefined, tokenA)).status, 200);
    assert.equal((await request('GET', '/attendance?date=2026-11-01', undefined, tokenA)).status, 200);
    assert.equal((await request('GET', '/electricity?month=2026-11', undefined, tokenA)).status, 200);
    assert.deepEqual((await ElectricityBill.findById(historicalBill._id)).payments.toObject(), historicalBill.payments.toObject());
    assert.equal((await request('PATCH', `/residents/${legacyId}/leave`, {}, tokenA)).status, 200);
    assert.equal((await request('GET', '/auth/resident/me', undefined, residentToken)).status, 401);
    assert.equal((await request('POST', '/auth/resident/login', loginBody({ password: 'ResetPass789!', roomNumber: '102' }))).status, 401);
    assert.equal((await request('PATCH', `/residents/${legacyId}/login-access`, { loginEnabled: true }, tokenA)).status, 409);
    const savedRent = await RentRecord.findById(rent._id);
    assert.equal(String(savedRent.room), roomA._id);
    assert.deepEqual(savedRent.payments.toObject(), before.payments);
    assert.ok(await Attendance.findById(attendance._id));
    assert.equal((await request('DELETE', `/residents/${legacyId}`, undefined, tokenA)).status, 409);
  });
  await t.test('phone normalization and stable PG codes are deterministic', () => {
    for (const phone of ['9876543210', '919876543210', '+91 98765-43210', '+91 (98765) 43210']) assert.equal(normalizePhone(phone), '+919876543210');
    assert.equal(normalizePhone('+14155552671'), '+14155552671');
    assert.equal(normalizePhone({ $ne: null }), null);
    assert.equal(pgCode(ownerA.id), ownerA.pgCode);
  });
});
