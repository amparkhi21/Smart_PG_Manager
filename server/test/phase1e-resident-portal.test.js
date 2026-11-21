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
import RentRecord from '../src/models/RentRecord.js';
import Attendance from '../src/models/Attendance.js';
import generateToken, { generateResidentToken } from '../src/utils/generateToken.js';
import { todayIST, dueDateFor } from '../src/utils/dates.js';

test('Phase 1E resident dashboard and profile use isolated, resident-scoped data', { timeout: 120000 }, async (t) => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'phase1e-isolated-test-secret-'.repeat(3);
  let mongo, server;
  t.after(async () => {
    if (server) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    await mongoose.disconnect(); await mongo?.stop();
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });
  // Never load .env or connect to a supplied/production database URI.
  mongo = await MongoMemoryServer.create({
    binary: { version: '8.0.17', downloadDir: fileURLToPath(new URL('../../tmp/mongodb-binaries/', import.meta.url)) },
    instance: { dbName: `phase1e_test_${randomUUID().replaceAll('-', '')}` },
  });
  await mongoose.connect(mongo.getUri());
  await Promise.all([Owner.init(), Room.init(), Resident.init(), RentRecord.init(), Attendance.init()]);
  const [owner, otherOwner] = await Owner.create([
    { name: 'Owner A', email: 'a@phase1e.test', password: 'OwnerPassword123!', pgName: 'Same PG Name' },
    { name: 'Owner B', email: 'b@phase1e.test', password: 'OwnerPassword123!', pgName: 'Same PG Name' },
  ]);
  const [oldRoom, currentRoom, otherRoom] = await Room.create([
    { owner: owner._id, roomNumber: '101', monthlyRent: 5000, capacity: 4 },
    { owner: owner._id, roomNumber: '102', monthlyRent: 5500, capacity: 4 },
    { owner: otherOwner._id, roomNumber: '101', monthlyRent: 9000, capacity: 4 },
  ]);
  const passwordHash = await bcrypt.hash('IsolatedResident123!', 4);
  const account = { joiningDate: new Date('2025-01-01'), loginEnabled: true, accountStatus: 'active', passwordHash, passwordChangeRequired: false };
  const [self, roommate, foreign, empty] = await Resident.create([
    { ...account, owner: owner._id, room: currentRoom._id, fullName: 'My Resident', phone: '9876543210', email: 'self@phase1e.test', monthlyRent: 5500 },
    { ...account, owner: owner._id, room: currentRoom._id, fullName: 'Private Roommate', phone: '9876543211', monthlyRent: 7000 },
    { ...account, owner: otherOwner._id, room: otherRoom._id, fullName: 'Private Other PG', phone: '9876543210', monthlyRent: 9000 },
    { ...account, owner: owner._id, room: oldRoom._id, fullName: 'No Records Yet', phone: '9876543212', monthlyRent: 5000 },
  ]);
  const today = todayIST(), month = today.slice(0, 7), day = Number(today.slice(8));
  const monthOffset = (offset) => {
    const date = new Date(`${month}-01T12:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + offset);
    return date.toISOString().slice(0, 7);
  };
  const baseRent = { owner: owner._id, resident: self._id, room: oldRoom._id };
  await RentRecord.create([
    { ...baseRent, month, amountDue: 5000, dueDate: dueDateFor(month), payments: [{ amount: 1000, method: 'Cash', note: 'Private payment note' }] },
    { ...baseRent, month: monthOffset(-1), amountDue: 4500, dueDate: dueDateFor(monthOffset(-1)), payments: [{ amount: 4000 }] },
    { ...baseRent, month: monthOffset(-2), amountDue: 3000, dueDate: dueDateFor(monthOffset(-2)), payments: [{ amount: 3000 }] },
    { ...baseRent, resident: roommate._id, month, amountDue: 70000, dueDate: dueDateFor(month) },
    { ...baseRent, owner: otherOwner._id, resident: foreign._id, room: otherRoom._id, month, amountDue: 90000, dueDate: dueDateFor(month) },
    // A mismatched legacy reference must not bypass the owner predicate.
    { ...baseRent, owner: otherOwner._id, month: monthOffset(-3), amountDue: 80000, dueDate: dueDateFor(monthOffset(-3)) },
  ]);
  const baseAttendance = { owner: owner._id, resident: self._id, room: oldRoom._id };
  await Attendance.create([
    { ...baseAttendance, date: `${month}-01`, status: 'Present', note: 'Private attendance note' },
    { ...baseAttendance, date: `${month}-02`, status: 'Absent' },
    { ...baseAttendance, date: `${month}-03`, status: 'On Leave' },
    { ...baseAttendance, date: `${monthOffset(-1)}-01`, status: 'Present' },
    { ...baseAttendance, date: day < 28 ? `${month}-28` : `${monthOffset(1)}-01`, status: 'Present' },
    { ...baseAttendance, resident: roommate._id, date: `${month}-01`, status: 'Present' },
    { ...baseAttendance, owner: otherOwner._id, resident: foreign._id, room: otherRoom._id, date: `${month}-01`, status: 'Present' },
    { ...baseAttendance, owner: otherOwner._id, date: `${month}-04`, status: 'Present' },
  ]);
  const rentBefore = await RentRecord.collection.find({}).toArray();
  const attendanceBefore = await Attendance.collection.find({}).toArray();
  const selfToken = generateResidentToken(self), otherToken = generateResidentToken(foreign);
  server = createApp({ NODE_ENV: 'development' }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const request = async (path, token = selfToken) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const body = await response.json();
    assert.doesNotMatch(JSON.stringify(body), /passwordHash|sessionVersion|Private payment note|Private attendance note/);
    return { status: response.status, ...body };
  };

  await t.test('dashboard uses current assigned rent, historical unpaid dues and personal monthly attendance', async () => {
    const result = await request('/resident/dashboard');
    assert.equal(result.status, 200);
    assert.equal(result.data.resident.id, String(self._id));
    assert.equal(result.data.resident.room.roomNumber, '102');
    assert.equal(result.data.finance.monthlyRent, 5500);
    assert.equal(result.data.finance.pendingDues, 4500);
    assert.equal(result.data.finance.paymentDueDate, dueDateFor(monthOffset(-1)).toISOString());
    assert.equal(result.data.finance.currentBill.amountDue, 5000);
    assert.equal(result.data.finance.currentBill.amountPaid, 1000);
    assert.equal(result.data.finance.currentBill.balance, 4000);
    assert.equal(result.data.attendance.month, month);
    assert.equal(result.data.attendance.throughDate, today);
    assert.equal(result.data.attendance.Present, 1);
    assert.equal(result.data.attendance.Absent, day >= 2 ? 1 : 0);
    assert.equal(result.data.attendance['On Leave'], day >= 3 ? 1 : 0);
    assert.equal(result.data.attendance.recordedDays, Math.min(day, 3));
    assert.doesNotMatch(JSON.stringify(result.data), /Private Roommate|Private Other PG|payments|requestId/);
  });
  await t.test('dashboard and profile ignore injected resident/owner/PG IDs and isolate duplicate PG names', async () => {
    const injection = `?residentId=${foreign._id}&resident=${roommate._id}&owner=${otherOwner._id}&pgId=${otherOwner._id}&month=${monthOffset(-1)}`;
    for (const endpoint of ['/resident/dashboard', '/resident/profile']) {
      const result = await request(endpoint + injection);
      assert.equal(result.status, 200); assert.equal(result.data.resident.id, String(self._id));
      assert.equal(result.data.resident.email, 'self@phase1e.test');
      assert.equal(result.data.resident.monthlyRent, 5500);
      assert.equal(result.data.resident.pgCode, `PG-${String(owner._id).toUpperCase()}`);
    }
    const foreignDashboard = await request('/resident/dashboard', otherToken);
    assert.equal(foreignDashboard.data.resident.id, String(foreign._id));
    assert.equal(foreignDashboard.data.finance.pendingDues, 90000);
    assert.equal((await request('/resident/dashboard', generateToken(owner._id))).status, 403);
    assert.equal((await request('/rent', selfToken)).status, 403);
    assert.equal((await request('/auth/me', generateToken(owner._id))).status, 200);
  });
  await t.test('missing billing and attendance return actual empty results without invented due dates', async () => {
    const result = await request('/resident/dashboard', generateResidentToken(empty));
    assert.equal(result.status, 200);
    assert.equal(result.data.finance.monthlyRent, 5000);
    assert.equal(result.data.finance.pendingDues, 0);
    assert.equal(result.data.finance.currentBill, null);
    assert.equal(result.data.finance.paymentDueDate, null);
    assert.equal(result.data.attendance.recordedDays, 0);
    assert.equal(result.data.attendance.Present, 0);
  });
  await t.test('portal reads do not modify rent, payments or attendance', async () => {
    assert.deepEqual(await RentRecord.collection.find({}).toArray(), rentBefore);
    assert.deepEqual(await Attendance.collection.find({}).toArray(), attendanceBefore);
  });
  await t.test('password-change restrictions, disabled accounts and revoked sessions also protect financial summaries', async () => {
    empty.passwordChangeRequired = true; await empty.save();
    assert.equal((await request('/resident/dashboard', generateResidentToken(empty))).status, 403);
    assert.equal((await request('/resident/profile', generateResidentToken(empty))).status, 403);
    self.loginEnabled = false; await self.save();
    assert.equal((await request('/resident/dashboard', selfToken)).status, 401);
    self.loginEnabled = true; await self.save();
    assert.equal((await request('/resident/profile', selfToken)).status, 401);
    assert.equal((await request('/resident/dashboard', null)).status, 401);
  });
});
