import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { createApp } from '../src/app.js';
import Owner from '../src/models/Owner.js';
import Room from '../src/models/Room.js';
import Resident from '../src/models/Resident.js';
import RoomChangeRequest from '../src/models/RoomChangeRequest.js';
import RentRecord from '../src/models/RentRecord.js';
import Attendance from '../src/models/Attendance.js';
import ElectricityBill from '../src/models/ElectricityBill.js';
import generateToken, { generateResidentToken } from '../src/utils/generateToken.js';
import { currentMonthIST, todayIST } from '../src/utils/dates.js';

test('Phase 2B room requests, approval races and preserved history on isolated MongoDB', { timeout: 180000 }, async (t) => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'phase2b-isolated-test-secret-'.repeat(3);
  let database, server;
  t.after(async () => {
    if (server) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    await mongoose.disconnect(); await database?.stop();
    if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
  });
  database = await MongoMemoryReplSet.create({ binary: { version: '8.0.17', downloadDir: fileURLToPath(new URL('../../tmp/mongodb-binaries/', import.meta.url)) }, replSet: { count: 1 } });
  await mongoose.connect(database.getUri(), { dbName: `phase2b_test_${randomUUID().replaceAll('-', '')}` });
  await Promise.all([Owner.init(), Room.init(), Resident.init(), RoomChangeRequest.init(), RentRecord.init(), Attendance.init(), ElectricityBill.init()]);
  const [owner, foreignOwner] = await Owner.create([
    { name: 'Owner', email: 'owner@phase2b.test', pgName: 'Same PG', password: 'OwnerPass123!' },
    { name: 'Foreign Owner', email: 'foreign@phase2b.test', pgName: 'Same PG', password: 'OwnerPass123!' },
  ]);
  const [source, target, foreignRoom] = await Room.create([
    { owner: owner._id, roomNumber: '101', capacity: 20, monthlyRent: 4000 },
    { owner: owner._id, roomNumber: '201', capacity: 1, monthlyRent: 9000 },
    { owner: foreignOwner._id, roomNumber: '999', capacity: 2, monthlyRent: 8000 },
  ]);
  const hash = await bcrypt.hash('ResidentPass123!', 4);
  let personNumber = 0, roomNumber = 300;
  const person = async () => {
    personNumber += 1;
    const resident = await Resident.create({ owner: owner._id, room: source._id, fullName: `Resident ${personNumber}`, phone: String(9800000000 + personNumber), monthlyRent: 4000,
      loginEnabled: true, accountStatus: 'active', passwordHash: hash, firstLoginAt: new Date() });
    return { resident, token: generateResidentToken(resident) };
  };
  const emptyRoom = () => Room.create({ owner: owner._id, roomNumber: String(++roomNumber), capacity: 1, monthlyRent: 12000 });
  const a = await person(), b = await person();
  const month = currentMonthIST();
  await RentRecord.create({ owner: owner._id, resident: a.resident._id, room: source._id, month, amountDue: 4000, dueDate: new Date(), payments: [{ amount: 1000, method: 'Cash' }] });
  await Attendance.create({ owner: owner._id, resident: a.resident._id, room: source._id, date: todayIST(), status: 'Present' });
  await ElectricityBill.create({ owner: owner._id, room: source._id, month, previousReading: 0, currentReading: 100, ratePerUnit: 8, dueDate: new Date(), payments: [{ amount: 100 }] });
  const history = async () => ({ rent: await RentRecord.collection.find({}).toArray(), attendance: await Attendance.collection.find({}).toArray(), bills: await ElectricityBill.collection.find({}).toArray() });
  const historyBefore = await history();
  const accountBefore = await Resident.findById(a.resident._id).select('+passwordHash').lean();
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
  const ask = (actor, room, extra = {}) => request('POST', '/resident/room-change-requests', { targetRoom: String(room._id), reason: 'Need a quieter room for study', ...extra }, actor.token);
  const decide = (id, decision = 'Approved', decisionNote = '') => request('PATCH', `/room-change-requests/${id}/decision`, { decision, decisionNote });
  let firstId;

  await t.test('resident requests validate vacancy, bind identities and enforce one pending request', async () => {
    assert.equal((await ask(a, source)).status, 400);
    assert.equal((await ask(a, foreignRoom)).status, 404);
    assert.equal((await ask(a, target, { reason: ' ' })).status, 400);
    const created = await ask(a, target, { owner: foreignOwner._id, resident: b.resident._id, status: 'Approved' });
    assert.equal(created.status, 201); firstId = created.data.id;
    const stored = await RoomChangeRequest.findById(firstId);
    assert.equal(String(stored.owner), String(owner._id)); assert.equal(String(stored.resident), String(a.resident._id)); assert.equal(stored.status, 'Pending');
    const duplicates = await Promise.all([ask(a, target), ask(a, target)]);
    assert.deepEqual(duplicates.map((result) => result.status), [409, 409]);
    assert.equal(await RoomChangeRequest.countDocuments({ resident: a.resident._id, status: 'Pending' }), 1);
    assert.equal((await request('GET', '/resident/room-change-requests', undefined, b.token)).data.requests.length, 0);
    assert.equal((await request('GET', '/room-change-requests', undefined, foreignToken)).data.requests.length, 0);
    assert.equal((await request('PATCH', `/room-change-requests/${firstId}/decision`, { decision: 'Approved' }, foreignToken)).status, 404);
    assert.equal((await request('PATCH', `/room-change-requests/${firstId}/decision`, { decision: 'Approved' }, a.token)).status, 403);
    assert.equal((await request('GET', '/room-change-requests', undefined, a.token)).status, 403);
    assert.equal((await request('GET', '/resident/room-change-requests', undefined, ownerToken)).status, 403);
    assert.equal((await request('POST', '/resident/room-change-requests', { targetRoom: String(target._id), reason: 'Valid reason' }, null)).status, 401);
  });
  await t.test('duplicate approvals move once, retain the resident account and preserve rent and history', async () => {
    const results = await Promise.all([decide(firstId), decide(firstId)]);
    assert.deepEqual(results.map((result) => result.status), [200, 200]);
    assert.equal(await Resident.countDocuments({ owner: owner._id, room: target._id, status: 'Active' }), 1);
    const after = await Resident.findById(a.resident._id).select('+passwordHash').lean();
    for (const field of ['passwordHash', 'phone', 'monthlyRent', 'sessionVersion', 'loginEnabled']) assert.deepEqual(after[field], accountBefore[field]);
    assert.equal(String(after.room), String(target._id));
    assert.equal((await request('GET', '/resident/profile', undefined, a.token)).data.resident.room.roomNumber, target.roomNumber);
    assert.equal((await request('GET', '/resident/room-change-requests', undefined, a.token)).data.requests[0].status, 'Approved');
    assert.equal((await decide(firstId, 'Rejected', 'Changed my mind')).status, 409);
    assert.equal((await ask(b, target)).status, 409);
    assert.deepEqual(await history(), historyBefore);
  });
  await t.test('concurrent approvals for the final bed cannot overbook', async () => {
    const room = await emptyRoom(), c = await person(), d = await person();
    const cRequest = await ask(c, room), dRequest = await ask(d, room);
    const results = await Promise.all([decide(cRequest.data.id), decide(dRequest.data.id)]);
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
    assert.equal(await Resident.countDocuments({ owner: owner._id, room: room._id, status: 'Active' }), 1);
    const loser = results[0].status === 409 ? cRequest : dRequest;
    assert.equal((await decide(loser.data.id, 'Rejected', 'The room is now full')).status, 200);
  });
  await t.test('approval races with owner admissions, capacity edits and deletion remain safe', async () => {
    const room = await emptyRoom();
    room.bedNumbers = ['B1']; await room.save();
    const actor = await person(), submitted = await ask(actor, room, { targetBedNumber: 'B1' });
    const admission = { room: String(room._id), bedNumber: 'B1', fullName: 'Owner Admission', phone: '9799999999', monthlyRent: 7000 };
    const results = await Promise.all([decide(submitted.data.id), request('POST', '/residents', admission)]);
    assert.deepEqual(results.map((result) => result.status).sort(), results[0].status === 200 ? [200, 409] : [201, 409]);
    assert.equal(await Resident.countDocuments({ owner: owner._id, room: room._id, status: 'Active' }), 1);
    assert.equal(await Resident.countDocuments({ owner: owner._id, room: room._id, bedNumber: 'B1', status: 'Active' }), 1);
    const capRoom = await emptyRoom(), capActor = await person();
    capRoom.capacity = 2; await capRoom.save();
    await Resident.create({ owner: owner._id, room: capRoom._id, fullName: 'Existing Occupant', phone: '9799999998', monthlyRent: 4000 });
    const capRequest = await ask(capActor, capRoom);
    const capacityResults = await Promise.all([decide(capRequest.data.id), request('PUT', `/rooms/${capRoom._id}`, { capacity: 1 })]);
    assert.deepEqual(capacityResults.map((result) => result.status).sort(), [200, 409]);
    assert.ok(await Resident.countDocuments({ owner: owner._id, room: capRoom._id, status: 'Active' }) <= (await Room.findById(capRoom._id)).capacity);
    const deleteTarget = await emptyRoom(), deleteActor = await person(), deleteRequest = await ask(deleteActor, deleteTarget);
    const deletionResults = await Promise.all([decide(deleteRequest.data.id), request('DELETE', `/rooms/${deleteTarget._id}`)]);
    assert.deepEqual(deletionResults.map((result) => result.status).sort(), [200, 409]);
    const assigned = await Resident.findById(deleteActor.resident._id);
    if (!(await Room.exists({ _id: deleteTarget._id }))) assert.equal(String(assigned.room), String(source._id));
  });
  await t.test('stale or inactive residents cannot be moved; rejection is final and scoped', async () => {
    const room = await emptyRoom(), alternative = await emptyRoom(), actor = await person(), submitted = await ask(actor, room);
    assert.equal((await request('PUT', `/rooms/${alternative._id}`, { bedNumbers: ['B1'] })).status, 200);
    assert.equal((await request('PUT', `/residents/${actor.resident._id}`, { room: String(alternative._id), bedNumber: 'B1' })).status, 200);
    assert.equal((await decide(submitted.data.id)).status, 409);
    assert.equal((await decide(submitted.data.id, 'Rejected')).status, 400);
    assert.equal((await decide(submitted.data.id, 'Rejected', 'Your room was already reassigned')).status, 200);
    assert.equal((await decide(submitted.data.id)).status, 409);
    const disabled = await person(), disabledRequest = await ask(disabled, room);
    assert.equal((await request('PUT', `/residents/${disabled.resident._id}`, { loginEnabled: false })).status, 200);
    assert.equal((await decide(disabledRequest.data.id)).status, 409);
    assert.equal((await ask(disabled, alternative)).status, 401);
    assert.deepEqual(await history(), historyBefore);
  });
});
