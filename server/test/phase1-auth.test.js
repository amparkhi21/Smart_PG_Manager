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

test('Owner-provisioned resident authentication is individual, bed-bound and tenant-scoped', { timeout: 300000 }, async (t) => {
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'isolated-resident-auth-test-secret-'.repeat(3);
  const mongod = await MongoMemoryServer.create({
    binary: { version: '8.0.17', downloadDir: fileURLToPath(new URL('../../tmp/mongodb-binaries/', import.meta.url)) },
    instance: { dbName: `resident_auth_${randomUUID().replaceAll('-', '')}` },
  });
  let server;
  t.after(async () => {
    if (server) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    await mongoose.disconnect(); await mongod.stop();
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
        'X-Forwarded-For': `198.51.${Math.floor(requestNumber / 200)}.${requestNumber % 200 + 1}`,
        ...(token && { Authorization: `Bearer ${token}` }) },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    const data = await response.json();
    assert.doesNotMatch(JSON.stringify(data), /passwordHash|\$2[aby]\$|sessionVersion|Temporary123/);
    return { status: response.status, ...data };
  };
  const register = async (suffix) => request('POST', '/auth/register', {
    name: `Owner ${suffix}`, email: `owner-${suffix.toLowerCase()}@example.test`, password: 'OwnerPass123!', pgName: 'Shared Hostel', role: 'resident',
  });
  const registeredA = await register('A'), registeredB = await register('B');
  assert.equal(registeredA.status, 201); assert.equal(registeredB.status, 201);
  const ownerA = registeredA.data.owner, ownerB = registeredB.data.owner;
  const tokenA = registeredA.data.token, tokenB = registeredB.data.token;
  assert.equal(Object.hasOwn(ownerA, 'pgCode'), false);
  await Owner.updateOne({ _id: ownerA.id }, { address: '12 North Road, Jaipur' });
  await Owner.updateOne({ _id: ownerB.id }, { address: '44 Lake Street, Jaipur' });
  const rooms = await Promise.all([
    request('POST', '/rooms', { roomNumber: '101', capacity: 2, monthlyRent: 5000, bedNumbers: ['A-1', 'A-2'] }, tokenA),
    request('POST', '/rooms', { roomNumber: '102', capacity: 1, monthlyRent: 5000, bedNumbers: ['B-1'] }, tokenA),
    request('POST', '/rooms', { roomNumber: '101', capacity: 2, monthlyRent: 6000, bedNumbers: ['A-1', 'A-2'] }, tokenB),
  ]);
  const [roomA, roomA2, roomB] = rooms.map((result) => result.data);
  let residentA, residentB, residentToken, residentId;
  const temporary = 'Temporary123!', permanent = 'Personal456!';
  const credentials = (owner, roomNumber, bedNumber, password) => ({
    ownerId: owner.id, pgName: owner.pgName, roomNumber, bedNumber, password,
  });

  await t.test('duplicate hostel names are selectable by descriptive address without a public PG code', async () => {
    const choices = await request('GET', '/auth/resident/hostels?name=Shared%20Hostel');
    assert.equal(choices.status, 200);
    assert.deepEqual(new Set(choices.data.hostels.map((hostel) => hostel.address)), new Set(['12 North Road, Jaipur', '44 Lake Street, Jaipur']));
    assert.equal(choices.data.hostels.some((hostel) => Object.hasOwn(hostel, 'pgCode')), false);
    assert.equal((await request('GET', '/settings', undefined, tokenA)).data.owner.pgCode, undefined);
  });

  await t.test('owner creates a resident with a bed and temporary password; duplicate beds and missing passwords fail', async () => {
    const created = await request('POST', '/residents', {
      room: roomA._id, bedNumber: 'A-1', fullName: 'Resident A', phone: '9876543210', monthlyRent: 5000,
      loginEnabled: true, temporaryPassword: temporary,
    }, tokenA);
    assert.equal(created.status, 201); residentA = created.data; residentId = residentA._id;
    assert.equal(residentA.bedNumber, 'A-1'); assert.equal(residentA.passwordChangeRequired, true);
    assert.doesNotMatch(JSON.stringify(created), new RegExp(temporary));
    const stored = await Resident.findById(residentId).select('+passwordHash');
    assert.notEqual(stored.passwordHash, temporary); assert.equal(await bcrypt.compare(temporary, stored.passwordHash), true);
    assert.equal(stored.bedAssignments.at(-1).bedNumber, 'A-1');
    assert.equal((await request('POST', '/residents', {
      room: roomA._id, bedNumber: 'A-1', fullName: 'Duplicate bed', phone: '9876543211', loginEnabled: true, temporaryPassword: temporary,
    }, tokenA)).status, 409);
    assert.equal((await request('POST', '/residents', {
      room: roomA._id, bedNumber: 'A-2', fullName: 'Missing password', phone: '9876543212', loginEnabled: true,
    }, tokenA)).status, 400);
    assert.equal((await request('POST', '/residents', {
      room: roomA._id, fullName: 'Missing bed', phone: '9876543212', loginEnabled: false,
    }, tokenA)).status, 400);
    assert.equal(await Resident.countDocuments({ owner: ownerA.id }), 1);
  });

  await t.test('login identifies the exact PG, room, bed and individual password with generic failures', async () => {
    const created = await request('POST', '/residents', {
      room: roomB._id, bedNumber: 'A-1', fullName: 'Resident B', phone: '9876543210', loginEnabled: true, temporaryPassword: temporary,
    }, tokenB);
    assert.equal(created.status, 201); residentB = created.data;
    const success = await request('POST', '/auth/resident/login', credentials(ownerA, '101', 'A-1', temporary));
    assert.equal(success.status, 200); residentToken = success.data.token;
    assert.equal(success.data.resident.id, residentId); assert.equal(success.data.resident.pgId, ownerA.id);
    assert.equal(success.data.resident.passwordChangeRequired, true);
    const otherTenant = await request('POST', '/auth/resident/login', credentials(ownerB, '101', 'A-1', temporary));
    assert.equal(otherTenant.status, 200); assert.equal(otherTenant.data.resident.id, residentB._id);
    const attempts = await Promise.all([
      request('POST', '/auth/resident/login', credentials(ownerA, '101', 'A-2', temporary)),
      request('POST', '/auth/resident/login', credentials(ownerA, '101', 'A-1', 'WrongPass123!')),
      request('POST', '/auth/resident/login', credentials(ownerB, '101', 'A-1', 'WrongPass123!')),
      request('POST', '/auth/resident/login', credentials(ownerA, '999', 'A-1', temporary)),
    ]);
    assert.deepEqual(new Set(attempts.map((attempt) => attempt.status)), new Set([401]));
    assert.equal(new Set(attempts.map((attempt) => attempt.message)).size, 1);
  });

  await t.test('first login cannot access protected data until password change; new password works later', async () => {
    assert.equal((await request('GET', '/resident/dashboard', undefined, residentToken)).status, 403);
    const session = await request('GET', '/auth/session', undefined, residentToken);
    assert.equal(session.data.resident.passwordChangeRequired, true);
    assert.equal((await request('POST', '/auth/resident/change-password', { currentPassword: temporary, newPassword: temporary }, residentToken)).status, 400);
    const changed = await request('POST', '/auth/resident/change-password', { currentPassword: temporary, newPassword: permanent }, residentToken);
    assert.equal(changed.status, 200); assert.equal(changed.data.resident.passwordChangeRequired, false);
    assert.equal((await request('GET', '/auth/session', undefined, residentToken)).status, 401);
    residentToken = changed.data.token;
    assert.equal((await request('GET', '/resident/dashboard', undefined, residentToken)).status, 200);
    assert.equal((await request('POST', '/auth/resident/login', credentials(ownerA, '101', 'A-1', temporary))).status, 401);
    assert.equal((await request('POST', '/auth/resident/login', credentials(ownerA, '101', 'A-1', permanent))).status, 200);
  });

  await t.test('owner reset replaces the password, forces another change and invalidates sessions', async () => {
    const reset = await request('POST', `/residents/${residentId}/reset-password`, { temporaryPassword: 'ResetPass789!' }, tokenA);
    assert.equal(reset.status, 200);
    assert.equal((await request('GET', '/auth/resident/me', undefined, residentToken)).status, 401);
    assert.equal((await request('POST', '/auth/resident/login', credentials(ownerA, '101', 'A-1', permanent))).status, 401);
    const login = await request('POST', '/auth/resident/login', credentials(ownerA, '101', 'A-1', 'ResetPass789!'));
    assert.equal(login.status, 200); assert.equal(login.data.resident.passwordChangeRequired, true); residentToken = login.data.token;
    const beforeDisable = await Resident.findById(residentId).select('+passwordHash');
    await request('PATCH', `/residents/${residentId}/login-access`, { loginEnabled: false }, tokenA);
    assert.equal((await request('GET', '/auth/resident/me', undefined, residentToken)).status, 401);
    await request('PATCH', `/residents/${residentId}/login-access`, { loginEnabled: true }, tokenA);
    const reenabled = await Resident.findById(residentId).select('+passwordHash');
    assert.equal(reenabled.passwordHash, beforeDisable.passwordHash);
    assert.equal(reenabled.passwordChangeRequired, true);
  });

  await t.test('bed moves change login coordinates; resident and owner access stay isolated', async () => {
    const beforeMove = residentToken;
    const moved = await request('PUT', `/residents/${residentId}`, { room: roomA2._id, bedNumber: 'B-1' }, tokenA);
    assert.equal(moved.status, 200); assert.equal(moved.data.bedNumber, 'B-1');
    assert.equal((await request('GET', '/auth/resident/me', undefined, beforeMove)).status, 401);
    assert.equal((await request('POST', '/auth/resident/login', credentials(ownerA, '101', 'A-1', 'ResetPass789!'))).status, 401);
    const movedLogin = await request('POST', '/auth/resident/login', credentials(ownerA, '102', 'B-1', 'ResetPass789!'));
    assert.equal(movedLogin.status, 200); assert.equal(movedLogin.data.resident.id, residentId);
    for (const path of ['/rooms', '/residents', '/dashboard', '/settings']) {
      assert.equal((await request('GET', path, undefined, movedLogin.data.token)).status, 403, path);
    }
    assert.equal((await request('GET', '/resident/profile', undefined, tokenA)).status, 403);
    assert.equal((await request('GET', `/residents/${residentId}`, undefined, tokenB)).status, 404);
    assert.equal((await request('PUT', `/residents/${residentId}`, { room: roomB._id, bedNumber: 'A-1' }, tokenA)).status, 404);
  });

  await t.test('legacy resident with an active password remains usable and historical records remain intact', async () => {
    const legacyId = new mongoose.Types.ObjectId();
    const legacyHash = await bcrypt.hash('LegacyPass123!', 4);
    await Resident.collection.insertOne({
      _id: legacyId, owner: new mongoose.Types.ObjectId(ownerA.id), room: new mongoose.Types.ObjectId(roomA._id),
      bedNumber: 'A-2', fullName: 'Legacy Resident', phone: '9876543219', normalizedPhone: '+919876543219',
      joiningDate: new Date('2025-01-01'), monthlyRent: 4500, status: 'Active', loginEnabled: true,
      accountStatus: 'active', passwordHash: legacyHash, sessionVersion: 0, passwordChangeRequired: false,
    });
    const rent = await RentRecord.create({ owner: ownerA.id, resident: legacyId, room: roomA._id, month: '2026-11', amountDue: 4500, dueDate: new Date('2026-11-05'), payments: [{ amount: 1000, paidOn: new Date('2026-11-01'), method: 'Cash' }] });
    const attendance = await Attendance.create({ owner: ownerA.id, resident: legacyId, room: roomA._id, date: '2026-11-01', status: 'Present' });
    const bill = await ElectricityBill.create({ owner: ownerA.id, room: roomA._id, month: '2026-11', previousReading: 10, currentReading: 20, ratePerUnit: 8, dueDate: new Date('2026-11-05'), payments: [{ amount: 20, method: 'Cash' }] });
    const login = await request('POST', '/auth/resident/login', credentials(ownerA, '101', 'A-2', 'LegacyPass123!'));
    assert.equal(login.status, 200); assert.equal(login.data.resident.passwordChangeRequired, false);
    assert.equal(await Resident.countDocuments({ _id: legacyId }), 1);
    assert.ok(await RentRecord.findById(rent._id)); assert.ok(await Attendance.findById(attendance._id));
    assert.deepEqual((await ElectricityBill.findById(bill._id)).payments.toObject(), bill.payments.toObject());
  });

  await t.test('owner creation/login remain role-safe and resident endpoints retain generic invalid credentials', async () => {
    const login = await request('POST', '/auth/login', { email: 'owner-a@example.test', password: 'OwnerPass123!' });
    assert.equal(login.status, 200); assert.equal(login.data.owner.role, 'owner');
    const legacyToken = jwt.sign({ id: ownerA.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    assert.equal((await request('GET', '/dashboard', undefined, legacyToken)).status, 200);
    for (const body of [{}, credentials(ownerA, '101', 'A-1', 'wrong')]) {
      const result = await request('POST', '/auth/resident/login', body);
      assert.equal(result.status, 401); assert.equal(result.message, 'Invalid resident details. Check your hostel, room, bed and password.');
    }
  });
});
