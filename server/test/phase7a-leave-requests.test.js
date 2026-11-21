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
import LeaveRequest, { LeaveScheduleLock, leaveDurationDays } from '../src/models/LeaveRequest.js';
import RentRecord from '../src/models/RentRecord.js';
import ElectricityBill from '../src/models/ElectricityBill.js';
import Attendance from '../src/models/Attendance.js';
import CommunityMessage from '../src/models/CommunityMessage.js';
import Notice from '../src/models/Notice.js';
import generateToken, { generateResidentToken } from '../src/utils/generateToken.js';
import { todayIST } from '../src/utils/dates.js';

await test('leave duration uses inclusive calendar days and Indian midnight rather than the device date', (t) => {
  assert.equal(leaveDurationDays('2026-12-31', '2027-01-02'), 3);
  assert.equal(leaveDurationDays('2028-02-28', '2028-03-01'), 3);
  assert.equal(leaveDurationDays('2026-11-20', '2026-11-20'), 1);
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-20T18:29:59Z') });
  assert.equal(todayIST(), '2026-11-20'); t.mock.timers.tick(1000); assert.equal(todayIST(), '2026-11-21');
});

test('Phase 7A leave requests, decision races and preserved records on disposable MongoDB', { timeout: 180000 }, async (t) => {
  const previousSecret = process.env.JWT_SECRET; process.env.JWT_SECRET = 'phase7a-disposable-secret-'.repeat(3);
  let mongo, server;
  t.after(async () => {
    if (server) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    await mongoose.disconnect(); await mongo?.stop();
    if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
  });
  // Only a new local replica-set database. No dotenv, production URI or seed scripts.
  mongo = await MongoMemoryReplSet.create({ binary: { version: '8.0.17', downloadDir: fileURLToPath(new URL('../../tmp/mongodb-binaries/', import.meta.url)) }, replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri(), { dbName: 'phase7a_test_' + randomUUID().replaceAll('-', '') });
  await Promise.all([Owner.init(), Room.init(), Resident.init(), LeaveRequest.init(), LeaveScheduleLock.init(), RentRecord.init(), ElectricityBill.init(), Attendance.init(), CommunityMessage.init(), Notice.init()]);
  const [owner, otherOwner] = await Owner.create([{ name: 'Owner A', email: 'a@phase7a.test', password: 'OwnerPass123!', pgName: 'Same PG' }, { name: 'Owner B', email: 'b@phase7a.test', password: 'OwnerPass123!', pgName: 'Same PG' }]);
  const [room, nextRoom, otherRoom] = await Room.create([{ owner: owner._id, roomNumber: '101', capacity: 20, monthlyRent: 4000 }, { owner: owner._id, roomNumber: '202', capacity: 20, monthlyRent: 5000 }, { owner: otherOwner._id, roomNumber: '101', capacity: 20, monthlyRent: 4000 }]);
  const passwordHash = await bcrypt.hash('ResidentPass123!', 4);
  const residents = await Resident.create(Array.from({ length: 6 }, (_, index) => ({ owner: index === 2 ? otherOwner._id : owner._id, room: index === 2 ? otherRoom._id : room._id,
    fullName: 'Resident ' + index, phone: String(9800000000 + index), monthlyRent: 4000, passwordHash, loginEnabled: true, accountStatus: 'active' })));
  const [resident, peer, foreign, validationResident, racer, otherRacer] = residents;
  const tokens = residents.map(generateResidentToken), [residentToken, peerToken, foreignToken, validationToken, raceToken, otherRaceToken] = tokens;
  const ownerToken = generateToken(owner._id), foreignOwnerToken = generateToken(otherOwner._id);
  const today = todayIST(), date = (offset) => { const value = new Date(today + 'T12:00:00Z'); value.setUTCDate(value.getUTCDate() + offset); return value.toISOString().slice(0, 10); };
  await RentRecord.create({ owner: owner._id, resident: resident._id, room: room._id, month: today.slice(0, 7), amountDue: 4000, dueDate: new Date(), payments: [{ amount: 1000, method: 'Cash' }] });
  await ElectricityBill.create({ owner: owner._id, room: room._id, month: today.slice(0, 7), previousReading: 0, currentReading: 100, ratePerUnit: 8, dueDate: new Date(), payments: [{ amount: 100, method: 'Cash' }] });
  await Attendance.create({ owner: owner._id, resident: resident._id, room: room._id, date: today, status: 'Present' });
  await CommunityMessage.create({ owner: owner._id, sender: owner._id, senderRole: 'owner', senderName: owner.name, text: 'Public greeting' });
  await Notice.create({ owner: owner._id, title: 'Public notice', body: 'Opening hours' });
  const unchanged = async () => Object.fromEntries(await Promise.all([RentRecord, ElectricityBill, Attendance, Room, CommunityMessage, Notice].map(async (Model) => [Model.modelName, await Model.collection.find({}).toArray()])));
  const before = await unchanged(), residentsBefore = await Resident.collection.find({}).toArray();
  server = createApp({ NODE_ENV: 'development' }).listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/api';
  const request = async (method, path, body, token = residentToken) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) }, ...(body !== undefined && { body: JSON.stringify(body) }) });
    const result = await response.json(); assert.doesNotMatch(JSON.stringify(result), /passwordHash|sessionVersion|normalizedPhone|@phase7a\.test/);
    return { status: response.status, ...result };
  };
  const root = '/resident/leave-requests', ownerRoot = '/leave-requests';
  const submit = (from = 1, to = 3, token = residentToken, extra = {}) => request('POST', root, { fromDate: date(from), toDate: date(to), reason: 'PRIVATE_LEAVE_REASON: visiting family.', ...extra }, token);
  const decide = (id, decision, response = '', token = ownerToken) => request('PATCH', `${ownerRoot}/${id}/decision`, { decision, response }, token);
  const cancel = (id, token = residentToken) => request('POST', `${root}/${id}/cancel`, {}, token);
  let own, peers, foreignRequest, adjacent;

  await t.test('active residents submit pending requests with trusted ownership, room and Indian dates', async () => {
    const result = await submit(1, 3, residentToken, { owner: otherOwner._id, resident: peer._id, room: otherRoom._id, status: 'Approved', emergencyContact: '+91 (98765) 43210' });
    assert.equal(result.status, 201); own = result.data;
    assert.equal(own.pgId, String(owner._id)); assert.equal(own.resident.id, String(resident._id)); assert.equal(own.room.roomNumber, '101');
    assert.equal(own.fromDate, date(1)); assert.equal(own.toDate, date(3)); assert.equal(own.durationDays, 3); assert.equal(own.status, 'Pending');
    assert.equal(own.emergencyContact, '+919876543210'); assert.equal(own.history.length, 1); assert.equal(result.event.status, 'Pending'); assert.ok(result.event.id); assert.equal(result.event.leaveRequestId, own.id);
    const peerResult = await submit(1, 3, peerToken), otherResult = await submit(1, 3, foreignToken);
    assert.equal(peerResult.status, 201); assert.equal(otherResult.status, 201); peers = peerResult.data; foreignRequest = otherResult.data;
    assert.equal(peers.emergencyContact, null);
  });
  await t.test('JWT roles, private request access and PG boundaries cannot be overridden by client IDs', async () => {
    for (const token of [peerToken, foreignToken]) assert.equal((await request('GET', `${root}/${own.id}`, undefined, token)).status, 404);
    assert.equal((await cancel(peers.id)).status, 404); assert.equal((await cancel(foreignRequest.id)).status, 404);
    assert.equal((await request('GET', `${ownerRoot}/${own.id}`, undefined, foreignOwnerToken)).status, 404);
    assert.equal((await decide(own.id, 'Approved', '', foreignOwnerToken)).status, 404);
    assert.equal((await request('GET', ownerRoot)).status, 403); assert.equal((await decide(own.id, 'Approved', '', residentToken)).status, 403);
    assert.equal((await request('GET', root, undefined, ownerToken)).status, 403); assert.equal((await submit(10, 12, ownerToken)).status, 403);
    assert.equal((await request('GET', root, undefined, null)).status, 401);
    const mine = await request('GET', root + '?resident=' + peer._id + '&owner=' + otherOwner._id);
    assert.deepEqual(mine.data.requests.map((value) => value.id), [own.id]);
  });
  await t.test('inclusive overlap checks cover pending and approved requests while adjacent days remain available', async () => {
    for (const [from, to] of [[1, 3], [2, 2], [2, 4], [1, 5], [3, 5]]) assert.equal((await submit(from, to)).status, 409);
    const result = await submit(4, 4); assert.equal(result.status, 201); adjacent = result.data; assert.equal(adjacent.durationDays, 1);
    const approved = await decide(own.id, 'Approved', 'Enjoy your visit.');
    assert.equal(approved.status, 200); assert.equal(approved.data.status, 'Approved'); assert.ok(approved.data.decidedAt);
    assert.deepEqual(approved.data.history.map((event) => event.status), ['Pending', 'Approved']); assert.equal(approved.data.history[1].actor.role, 'owner');
    assert.equal(approved.data.response, 'Enjoy your visit.'); assert.equal((await submit(2, 2)).status, 409);
    assert.equal((await decide(own.id, 'Approved')).status, 409); assert.equal((await decide(own.id, 'Rejected')).status, 409); assert.equal((await cancel(own.id)).status, 409);
  });
  await t.test('only pending requests can be cancelled or rejected, and both outcomes release dates with preserved history', async () => {
    const cancelled = await cancel(adjacent.id); assert.equal(cancelled.status, 200); assert.equal(cancelled.data.status, 'Cancelled'); assert.ok(cancelled.data.cancelledAt);
    assert.deepEqual(cancelled.data.history.map((event) => event.status), ['Pending', 'Cancelled']);
    assert.equal((await cancel(adjacent.id)).status, 409); assert.equal((await decide(adjacent.id, 'Approved')).status, 409);
    const replacement = await submit(4, 4); assert.equal(replacement.status, 201);
    const rejected = await decide(replacement.data.id, 'Rejected', 'Please choose another date.');
    assert.equal(rejected.status, 200); assert.equal(rejected.data.response, 'Please choose another date.'); assert.equal(rejected.data.history.length, 2);
    assert.equal((await decide(replacement.data.id, 'Approved')).status, 409); assert.equal((await cancel(replacement.data.id)).status, 409);
    assert.equal((await submit(4, 4)).status, 201);
  });
  await t.test('owner status, date-window and resident filters and pagination are scoped to the PG', async () => {
    const approved = await request('GET', ownerRoot + '?status=Approved&resident=' + resident._id + '&date=' + date(2), undefined, ownerToken);
    assert.deepEqual(approved.data.requests.map((value) => value.id), [own.id]);
    const day = await request('GET', ownerRoot + '?date=' + date(3), undefined, ownerToken); assert.equal(day.data.pagination.total, 2);
    const filtered = await request('GET', ownerRoot + '?fromDate=' + date(3) + '&toDate=' + date(4), undefined, ownerToken);
    assert.equal(filtered.data.pagination.total, 5);
    assert.equal((await request('GET', ownerRoot + '?resident=' + foreign._id, undefined, ownerToken)).data.pagination.total, 0);
    const ids = []; let page = 1, data;
    do { const result = await request('GET', ownerRoot + '?limit=2&page=' + page++, undefined, ownerToken); assert.equal(result.status, 200); data = result.data; ids.push(...data.requests.map((row) => row.id)); } while (data.pagination.hasMore);
    assert.equal(ids.length, 5); assert.equal(new Set(ids).size, 5); assert.ok(!ids.includes(foreignRequest.id));
    assert.equal((await request('GET', ownerRoot, undefined, foreignOwnerToken)).data.pagination.total, 1);
  });
  await t.test('dates, reason, contact, status and query validation reject invalid input', async () => {
    const invalid = [{ fromDate: date(-1), toDate: date(1) }, { fromDate: date(3), toDate: date(2) }, { fromDate: '2026-02-30' }, { toDate: '2026-13-01' },
      { fromDate: date(1) + 'T00:00:00Z' }, { fromDate: [date(1)] }, { toDate: date(400) }, { reason: ' ' }, { reason: 'x'.repeat(2001) }, { emergencyContact: 'bad phone' }, { emergencyContact: { $ne: null } }];
    for (const bad of invalid) assert.equal((await submit(10, 12, validationToken, bad)).status, 400, JSON.stringify(bad));
    for (const query of ['date=2026-02-30', 'fromDate[$ne]=x', 'resident[$ne]=x', 'status=Open', 'page=0', 'limit=101', 'date=' + date(1) + '&fromDate=' + date(1), 'fromDate=' + date(3) + '&toDate=' + date(1)]) assert.equal((await request('GET', ownerRoot + '?' + query, undefined, ownerToken)).status, 400);
    assert.equal((await request('GET', root + '/not-an-id')).status, 400);
    assert.equal((await decide(peers.id, 'Pending')).status, 400); assert.equal((await decide(peers.id, 'Rejected', 'x'.repeat(1001))).status, 400);
    assert.equal((await submit(10, 11, validationToken, { emergencyContact: '' })).status, 201);
    assert.equal((await submit(12, 13, validationToken, { emergencyContact: null })).status, 201);
  });
  await t.test('concurrent first submissions, repeated decisions and approval versus cancellation cannot both succeed', async () => {
    const submissions = await Promise.all([submit(20, 22, raceToken), submit(20, 22, raceToken)]);
    assert.deepEqual(submissions.map((result) => result.status).sort(), [201, 409]);
    const id = submissions.find((result) => result.status === 201).data.id;
    assert.equal(await LeaveRequest.countDocuments({ resident: racer._id }), 1); assert.equal(await LeaveScheduleLock.countDocuments({ resident: racer._id }), 1);
    const decisions = await Promise.all([decide(id, 'Approved'), decide(id, 'Rejected')]);
    assert.deepEqual(decisions.map((result) => result.status).sort(), [200, 409]); assert.equal((await request('GET', `${root}/${id}`, undefined, raceToken)).data.history.length, 2);
    const next = await submit(40, 42, validationToken); assert.equal(next.status, 201);
    const raced = await Promise.all([cancel(next.data.id, validationToken), decide(next.data.id, 'Approved')]);
    assert.deepEqual(raced.map((result) => result.status).sort(), [200, 409]);
    const final = (await request('GET', `${root}/${next.data.id}`, undefined, validationToken)).data;
    assert.ok(['Approved', 'Cancelled'].includes(final.status)); assert.equal(final.history.length, 2);
  });
  await t.test('approval rechecks legacy overlaps before finalizing a request', async () => {
    const pending = await submit(30, 32, otherRaceToken); assert.equal(pending.status, 201);
    await LeaveRequest.create({ owner: owner._id, resident: otherRacer._id, residentName: otherRacer.fullName, room: room._id, roomNumber: '101', fromDate: date(31), toDate: date(33), durationDays: 3, reason: 'Legacy approved record', status: 'Approved' });
    assert.equal((await decide(pending.data.id, 'Approved')).status, 409);
    assert.equal((await request('GET', `${root}/${pending.data.id}`, undefined, otherRaceToken)).data.status, 'Pending');
    assert.equal((await decide(pending.data.id, 'Rejected')).status, 200);
  });
  await t.test('leave operations never change attendance, billing, resident status, room management or public group records', async () => {
    assert.deepEqual(await unchanged(), before); assert.deepEqual(await Resident.collection.find({}).toArray(), residentsBefore);
    const community = await request('GET', '/community/messages', undefined, ownerToken); assert.doesNotMatch(JSON.stringify(community), /PRIVATE_LEAVE_REASON|emergencyContact/);
  });
  await t.test('room changes and departure retain leave history while inactive residents cannot create or cancel', async () => {
    await Resident.updateOne({ _id: resident._id }, { $set: { room: nextRoom._id } });
    const existing = await request('GET', `${root}/${own.id}`); assert.equal(existing.status, 200); assert.equal(existing.data.room.roomNumber, '101');
    const moved = await submit(50, 51); assert.equal(moved.status, 201); assert.equal(moved.data.room.roomNumber, '202');
    const active = { status: 'Active', loginEnabled: true, accountStatus: 'active', passwordChangeRequired: false, sessionVersion: peer.sessionVersion };
    for (const [change, status] of [[{ status: 'Left' }, 401], [{ accountStatus: 'disabled' }, 401], [{ loginEnabled: false }, 401], [{ passwordChangeRequired: true }, 403], [{ sessionVersion: peer.sessionVersion + 1 }, 401]]) {
      await Resident.updateOne({ _id: peer._id }, { $set: { ...active, ...change } });
      assert.equal((await submit(60, 61, peerToken)).status, status); assert.equal((await cancel(peers.id, peerToken)).status, status);
    }
    const departed = await Resident.findById(resident._id); departed.status = 'Left'; await departed.save();
    assert.equal((await request('GET', `${root}/${own.id}`)).status, 401);
    const retained = await request('GET', `${ownerRoot}/${own.id}`, undefined, ownerToken); assert.equal(retained.status, 200); assert.equal(retained.data.room.roomNumber, '101'); assert.equal(retained.data.history.length, 2);
    assert.equal((await decide(moved.data.id, 'Rejected', 'Resident has left')).status, 200);
    assert.deepEqual(await unchanged(), before);
  });
});
