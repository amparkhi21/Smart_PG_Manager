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
import Complaint from '../src/models/Complaint.js';
import ComplaintEvent from '../src/models/ComplaintEvent.js';
import CommunityMessage from '../src/models/CommunityMessage.js';
import Notice from '../src/models/Notice.js';
import RentRecord from '../src/models/RentRecord.js';
import generateToken, { generateResidentToken } from '../src/utils/generateToken.js';

test('Phase 6A private complaints and atomic status history on disposable MongoDB', { timeout: 180000 }, async (t) => {
  const previousSecret = process.env.JWT_SECRET; process.env.JWT_SECRET = 'phase6a-disposable-secret-'.repeat(3);
  let mongo, server;
  t.after(async () => {
    if (server) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    await mongoose.disconnect(); await mongo?.stop();
    if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
  });
  // Replica set transactions, isolated database, cached local binary; no production URI or seed scripts.
  mongo = await MongoMemoryReplSet.create({ binary: { version: '8.0.17', downloadDir: fileURLToPath(new URL('../../tmp/mongodb-binaries/', import.meta.url)) }, replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri(), { dbName: 'phase6a_test_' + randomUUID().replaceAll('-', '') });
  await Promise.all([Owner.init(), Room.init(), Resident.init(), Complaint.init(), ComplaintEvent.init(), CommunityMessage.init(), Notice.init(), RentRecord.init()]);
  const [owner, foreignOwner] = await Owner.create([
    { name: 'Owner A', email: 'a@phase6a.test', password: 'OwnerPass123!', pgName: 'Same PG' },
    { name: 'Owner B', email: 'b@phase6a.test', password: 'OwnerPass123!', pgName: 'Same PG' },
  ]);
  const [room, nextRoom, foreignRoom] = await Room.create([
    { owner: owner._id, roomNumber: '101', capacity: 4, monthlyRent: 4000 },
    { owner: owner._id, roomNumber: '202', capacity: 4, monthlyRent: 5000 },
    { owner: foreignOwner._id, roomNumber: '101', capacity: 4, monthlyRent: 4000 },
  ]);
  const passwordHash = await bcrypt.hash('ResidentPass123!', 4), fields = { monthlyRent: 4000, loginEnabled: true, accountStatus: 'active', passwordHash };
  const [resident, peer, foreign] = await Resident.create([
    { ...fields, owner: owner._id, room: room._id, fullName: 'Resident A', phone: '9876543210' },
    { ...fields, owner: owner._id, room: room._id, fullName: 'Resident Peer', phone: '9876543211' },
    { ...fields, owner: foreignOwner._id, room: foreignRoom._id, fullName: 'Foreign Resident', phone: '9876543210' },
  ]);
  await CommunityMessage.create({ owner: owner._id, sender: owner._id, senderRole: 'owner', senderName: owner.name, text: 'Public PG greeting' });
  await Notice.create({ owner: owner._id, title: 'Public PG notice', body: 'Opening hours' });
  await RentRecord.create({ owner: owner._id, resident: resident._id, room: room._id, month: '2026-11', amountDue: 4000, dueDate: new Date(), payments: [{ amount: 1000, method: 'Cash' }] });
  const preserved = async () => ({ rent: await RentRecord.collection.find({}).toArray(), community: await CommunityMessage.collection.find({}).toArray(), notices: await Notice.collection.find({}).toArray(), rooms: await Room.collection.find({}).toArray() });
  const before = await preserved();
  const ownerToken = generateToken(owner._id), foreignOwnerToken = generateToken(foreignOwner._id), residentToken = generateResidentToken(resident), peerToken = generateResidentToken(peer), foreignToken = generateResidentToken(foreign);
  server = createApp({ NODE_ENV: 'development' }).listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/api';
  const request = async (method, path, body, token = residentToken) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) }, ...(body !== undefined && { body: JSON.stringify(body) }) });
    const result = await response.json();
    assert.doesNotMatch(JSON.stringify(result), /passwordHash|sessionVersion|normalizedPhone|@phase6a\.test/);
    return { status: response.status, ...result };
  };
  const path = (id) => '/resident/complaints/' + id, ownerPath = (id) => '/complaints/' + id;
  const draft = { title: 'Bathroom door needs repair', description: 'PRIVATE_COMPLAINT_SECRET: the lock has jammed.', category: 'Maintenance', priority: 'High', room: String(room._id) };
  let own, theirs, otherPg;

  await t.test('residents create private complaints with trusted ownership and optional PG-scoped room snapshots', async () => {
    const result = await request('POST', '/resident/complaints', { ...draft, owner: foreignOwner._id, resident: peer._id, status: 'Resolved' });
    assert.equal(result.status, 201); own = result.data;
    assert.equal(own.pgId, String(owner._id)); assert.equal(own.resident.id, String(resident._id)); assert.equal(own.resident.fullName, resident.fullName);
    assert.equal(own.status, 'Open'); assert.equal(own.room.id, String(room._id)); assert.equal(own.room.roomNumber, '101');
    assert.equal(result.event.type, 'Created'); assert.equal(result.event.actor.role, 'resident'); assert.equal(result.event.toStatus, 'Open'); assert.ok(result.event.id);
    const peerResult = await request('POST', '/resident/complaints', { title: 'Drinking water issue', description: 'Please check the dispenser.', category: 'Water' }, peerToken);
    assert.equal(peerResult.status, 201); theirs = peerResult.data; assert.equal(theirs.room, null); assert.equal(theirs.priority, 'Medium');
    const foreignResult = await request('POST', '/resident/complaints', { title: 'Food quality', description: 'Please review dinner quality.', category: 'Food', priority: 'Urgent' }, foreignToken);
    assert.equal(foreignResult.status, 201); otherPg = foreignResult.data;
    assert.equal((await request('POST', '/resident/complaints', { ...draft, room: String(foreignRoom._id) })).status, 404);
  });
  await t.test('private detail, history and write access reject roommates, other PGs and wrong roles', async () => {
    for (const token of [peerToken, foreignToken]) for (const suffix of ['', '/history']) assert.equal((await request('GET', path(own.id) + suffix, undefined, token)).status, 404);
    assert.equal((await request('POST', path(theirs.id) + '/comments', { text: 'Unauthorized comment' })).status, 404);
    assert.equal((await request('POST', path(otherPg.id) + '/reopen', {})).status, 404);
    for (const suffix of ['', '/history']) assert.equal((await request('GET', ownerPath(own.id) + suffix, undefined, foreignOwnerToken)).status, 404);
    assert.equal((await request('PATCH', ownerPath(own.id) + '/status', { status: 'Resolved' }, foreignOwnerToken)).status, 404);
    assert.equal((await request('POST', ownerPath(own.id) + '/comments', { text: 'Unauthorized response' }, foreignOwnerToken)).status, 404);
    assert.equal((await request('GET', '/complaints')).status, 403);
    assert.equal((await request('GET', '/resident/complaints', undefined, ownerToken)).status, 403);
    assert.equal((await request('PATCH', ownerPath(own.id) + '/status', { status: 'Resolved' })).status, 403);
    assert.equal((await request('PATCH', path(own.id) + '/status', { status: 'Resolved' })).status, 404);
    assert.equal((await request('GET', '/resident/complaints', undefined, null)).status, 401);
    const listed = await request('GET', '/resident/complaints?resident=' + peer._id + '&owner=' + foreignOwner._id);
    assert.deepEqual(listed.data.complaints.map((complaint) => complaint.id), [own.id]);
  });
  await t.test('owner responses, status changes, resolution notes and resident reopening produce timestamped history', async () => {
    assert.equal((await request('POST', path(own.id) + '/comments', { text: 'The lock is still stuck.' })).status, 201);
    assert.equal((await request('POST', ownerPath(own.id) + '/comments', { text: 'A technician will visit today.' }, ownerToken)).status, 201);
    assert.equal((await request('POST', path(own.id) + '/reopen', {})).status, 409);
    assert.equal((await request('PATCH', ownerPath(own.id) + '/status', { status: 'In Progress' }, ownerToken)).status, 200);
    const resolved = await request('PATCH', ownerPath(own.id) + '/status', { status: 'Resolved', resolutionNote: 'Lock replaced and tested.' }, ownerToken);
    assert.equal(resolved.status, 200); assert.equal(resolved.data.resolutionNote, 'Lock replaced and tested.'); assert.ok(resolved.data.resolvedAt);
    const reopened = await request('POST', path(own.id) + '/reopen', { text: 'The replacement is jamming again.' });
    assert.equal(reopened.status, 200); assert.equal(reopened.data.status, 'Open'); assert.equal(reopened.data.resolvedAt, null); assert.ok(reopened.data.reopenedAt);
    assert.equal((await request('POST', path(own.id) + '/reopen', {})).status, 409);
    const history = await request('GET', path(own.id) + '/history');
    assert.deepEqual(history.data.events.map((event) => event.type), ['Created', 'Comment', 'Comment', 'Status Changed', 'Status Changed', 'Reopened']);
    assert.deepEqual(history.data.events.filter((event) => event.toStatus).map((event) => event.toStatus), ['Open', 'In Progress', 'Resolved', 'Open']);
    assert.equal(history.data.events[4].text, 'Lock replaced and tested.');
    for (const event of history.data.events) { assert.equal(event.complaintId, own.id); assert.equal(event.pgId, String(owner._id)); assert.ok(Number.isFinite(Date.parse(event.createdAt))); }
  });
  await t.test('owner filtering and complaint/history pagination remain PG-scoped and bounded', async () => {
    const filtered = await request('GET', '/complaints?status=Open&category=Maintenance&priority=High&resident=' + resident._id, undefined, ownerToken);
    assert.deepEqual(filtered.data.complaints.map((complaint) => complaint.id), [own.id]);
    assert.equal((await request('GET', '/complaints?resident=' + foreign._id, undefined, ownerToken)).data.pagination.total, 0);
    const first = await request('GET', '/complaints?page=1&limit=1', undefined, ownerToken), second = await request('GET', '/complaints?page=2&limit=1', undefined, ownerToken);
    assert.equal(first.count, 1); assert.equal(first.data.pagination.total, 2); assert.equal(first.data.pagination.hasMore, true);
    assert.equal(second.data.pagination.hasMore, false); assert.notEqual(first.data.complaints[0].id, second.data.complaints[0].id);
    const events = [];
    for (let page = 1; page <= 3; page++) {
      const result = await request('GET', path(own.id) + '/history?limit=2&page=' + page);
      assert.equal(result.status, 200); assert.equal(result.count, 2); assert.equal(result.data.pagination.total, 6); events.push(...result.data.events.map((event) => event.id));
    }
    assert.equal(new Set(events).size, 6);
    assert.equal((await request('GET', '/complaints', undefined, foreignOwnerToken)).data.complaints.length, 1);
  });
  await t.test('validation rejects oversized text, unsupported enums, malformed references and query operators', async () => {
    for (const bad of [{ title: ' ' }, { title: 'x'.repeat(121) }, { description: '' }, { description: 'x'.repeat(5001) }, { category: 'Public' }, { category: ['Water'] }, { priority: 'Critical' }, { room: { $ne: null } }, { title: { $ne: null } }]) assert.equal((await request('POST', '/resident/complaints', { ...draft, ...bad })).status, 400);
    for (const text of ['', ' ', 'x'.repeat(2001), { $ne: null }]) assert.equal((await request('POST', path(own.id) + '/comments', { text })).status, 400);
    for (const query of ['page=0', 'limit=101', 'limit=1.5', 'status[$ne]=x', 'resident[$ne]=x', 'category=Public', 'priority=Critical']) assert.equal((await request('GET', '/complaints?' + query, undefined, ownerToken)).status, 400);
    assert.equal((await request('GET', path('invalid-id'))).status, 400);
    assert.equal((await request('PATCH', ownerPath(own.id) + '/status', { status: 'Closed' }, ownerToken)).status, 400);
    assert.equal((await request('PATCH', ownerPath(own.id) + '/status', { status: 'Resolved', resolutionNote: 'x'.repeat(2001) }, ownerToken)).status, 400);
    assert.equal((await request('PATCH', ownerPath(own.id) + '/status', { status: 'In Progress', resolutionNote: 'Premature resolution' }, ownerToken)).status, 400);
  });
  await t.test('concurrent resolution produces one status event and event-write failures roll back the complaint change', async () => {
    const eventCount = await ComplaintEvent.countDocuments({ complaint: own.id });
    const results = await Promise.all([request('PATCH', ownerPath(own.id) + '/status', { status: 'Resolved', resolutionNote: 'Fixed again.' }, ownerToken), request('PATCH', ownerPath(own.id) + '/status', { status: 'Resolved', resolutionNote: 'Fixed again.' }, ownerToken)]);
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
    assert.equal(await ComplaintEvent.countDocuments({ complaint: own.id }), eventCount + 1);
    const originalSave = ComplaintEvent.prototype.save, snapshot = await Complaint.findById(own.id).lean(), total = await Complaint.countDocuments();
    try {
      ComplaintEvent.prototype.save = async function () { throw new Error('Simulated audit write failure'); };
      assert.equal((await request('PATCH', ownerPath(own.id) + '/status', { status: 'Open' }, ownerToken)).status, 500);
      assert.equal((await request('POST', '/resident/complaints', draft, peerToken)).status, 500);
    } finally { ComplaintEvent.prototype.save = originalSave; }
    assert.deepEqual(await Complaint.findById(own.id).lean(), snapshot); assert.equal(await Complaint.countDocuments(), total);
    assert.equal(await ComplaintEvent.countDocuments({ complaint: own.id }), eventCount + 1);
  });
  await t.test('room moves retain private access and original room details; departure retains owner-visible complaints', async () => {
    await Resident.updateOne({ _id: resident._id }, { $set: { room: nextRoom._id } });
    const moved = await request('GET', path(own.id)); assert.equal(moved.status, 200); assert.equal(moved.data.room.roomNumber, '101'); assert.equal(moved.data.resident.roomNumberAtCreation, '101');
    assert.equal((await request('POST', path(own.id) + '/comments', { text: 'Please retain this issue after my room move.' })).status, 201);
    const departed = await Resident.findById(resident._id); departed.status = 'Left'; await departed.save();
    assert.equal((await request('GET', path(own.id))).status, 401);
    const kept = await request('GET', ownerPath(own.id), undefined, ownerToken); assert.equal(kept.status, 200); assert.equal(kept.data.resident.fullName, resident.fullName);
    assert.equal((await request('POST', ownerPath(own.id) + '/comments', { text: 'Owner follow-up after departure.' }, ownerToken)).status, 201);
    assert.ok((await request('GET', ownerPath(own.id) + '/history', undefined, ownerToken)).data.events.length >= 8);
  });
  await t.test('disabled, inactive, departed, invalidated and first-login residents cannot submit or update', async () => {
    const active = { status: 'Active', loginEnabled: true, accountStatus: 'active', passwordChangeRequired: false, sessionVersion: peer.sessionVersion };
    for (const [change, status] of [[{ accountStatus: 'disabled' }, 401], [{ loginEnabled: false }, 401], [{ status: 'Left' }, 401], [{ sessionVersion: peer.sessionVersion + 1 }, 401], [{ passwordChangeRequired: true }, 403]]) {
      await Resident.updateOne({ _id: peer._id }, { $set: { ...active, ...change } });
      assert.equal((await request('POST', '/resident/complaints', draft, peerToken)).status, status);
      assert.equal((await request('POST', path(theirs.id) + '/comments', { text: 'Blocked' }, peerToken)).status, status);
      assert.equal((await request('POST', path(theirs.id) + '/reopen', {}, peerToken)).status, status);
    }
    assert.equal((await request('GET', ownerPath(theirs.id), undefined, ownerToken)).status, 200);
  });
  await t.test('private complaints never enter Community or notices and leave payments and room management untouched', async () => {
    const community = await request('GET', '/community/messages', undefined, ownerToken);
    const notices = await request('GET', '/community/notices', undefined, ownerToken);
    assert.doesNotMatch(JSON.stringify([community, notices]), /PRIVATE_COMPLAINT_SECRET|Bathroom door|technician/);
    assert.deepEqual(await preserved(), before);
    assert.equal(await Complaint.countDocuments(), 3);
  });
});
