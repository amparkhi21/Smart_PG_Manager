import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import { createApp } from '../src/app.js';
import Owner from '../src/models/Owner.js';
import Room from '../src/models/Room.js';
import Resident from '../src/models/Resident.js';
import CommunityMessage from '../src/models/CommunityMessage.js';
import { MESSAGE_MAX_LENGTH } from '../src/constants.js';
import generateToken, { generateResidentToken } from '../src/utils/generateToken.js';

test('Phase 4A private community API on disposable MongoDB', { timeout: 120000 }, async (t) => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'phase4a-disposable-secret-'.repeat(3);
  let mongo, server;
  t.after(async () => {
    if (server) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    await mongoose.disconnect(); await mongo?.stop();
    if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
  });
  // No dotenv, production URI or seed scripts; all records belong to this disposable database.
  mongo = await MongoMemoryServer.create({
    binary: { version: '8.0.17', downloadDir: fileURLToPath(new URL('../../tmp/mongodb-binaries/', import.meta.url)) },
    instance: { dbName: 'phase4a_test_' + randomUUID().replaceAll('-', '') },
  });
  await mongoose.connect(mongo.getUri());
  await Promise.all([Owner.init(), Room.init(), Resident.init(), CommunityMessage.init()]);
  const [owner, otherOwner] = await Owner.create([
    { name: 'Owner A', email: 'a@phase4a.test', password: 'OwnerPass123!', pgName: 'Same PG Name' },
    { name: 'Owner B', email: 'b@phase4a.test', password: 'OwnerPass123!', pgName: 'Same PG Name' },
  ]);
  const [room, otherRoom] = await Room.create([
    { owner: owner._id, roomNumber: '101', capacity: 4, monthlyRent: 4000 },
    { owner: otherOwner._id, roomNumber: '101', capacity: 4, monthlyRent: 4000 },
  ]);
  const passwordHash = await bcrypt.hash('ResidentPass123!', 4);
  const residentFields = { monthlyRent: 4000, passwordHash, loginEnabled: true, accountStatus: 'active' };
  const [resident, peer, foreignResident, rateResident] = await Resident.create([
    { ...residentFields, owner: owner._id, room: room._id, fullName: 'Resident A', phone: '9876543210' },
    { ...residentFields, owner: owner._id, room: room._id, fullName: 'Resident Peer', phone: '9876543211' },
    { ...residentFields, owner: otherOwner._id, room: otherRoom._id, fullName: 'Foreign Resident', phone: '9876543210' },
    { ...residentFields, owner: owner._id, room: room._id, fullName: 'Rate Resident', phone: '9876543212' },
  ]);
  const ownerToken = generateToken(owner._id), foreignOwnerToken = generateToken(otherOwner._id);
  const residentToken = generateResidentToken(resident), peerToken = generateResidentToken(peer);
  const foreignToken = generateResidentToken(foreignResident), rateToken = generateResidentToken(rateResident);
  server = createApp({ NODE_ENV: 'development' }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/api/community/messages';
  const request = async (method = 'GET', suffix = '', body, token = ownerToken) => {
    const response = await fetch(base + suffix, { method,
      headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    const result = await response.json();
    assert.doesNotMatch(JSON.stringify(result), /passwordHash|sessionVersion|occupancyRevision|normalizedPhone|@phase4a\.test/);
    return { status: response.status, headers: response.headers, ...result };
  };
  let ownMessage, ownerMessage, announcement, foreignMessage;

  await t.test('owners and active residents automatically access only their PG community with valid role sessions', async () => {
    for (const token of [ownerToken, residentToken, peerToken, foreignOwnerToken, foreignToken]) {
      const result = await request('GET', '', undefined, token);
      assert.equal(result.status, 200); assert.deepEqual(result.data.messages, []);
      assert.equal(result.data.nextCursor, null); assert.equal(result.data.hasMore, false);
      assert.equal(result.data.pgId, [foreignOwnerToken, foreignToken].includes(token) ? String(otherOwner._id) : String(owner._id));
    }
    assert.equal((await request('GET', '', undefined, null)).status, 401);
    assert.equal((await request('GET', '', undefined, jwt.sign({ id: String(resident._id), role: 'resident', pgId: String(otherOwner._id), version: resident.sessionVersion }, process.env.JWT_SECRET))).status, 401);
    assert.equal((await request('GET', '', undefined, jwt.sign({ id: String(owner._id), role: 'admin' }, process.env.JWT_SECRET))).status, 403);
    assert.equal((await request('GET', '', undefined, jwt.sign({ id: String(owner._id), role: 'owner' }, 'different-secret'))).status, 401);
    assert.equal((await request('GET', '', undefined, jwt.sign({ id: String(owner._id), role: 'owner' }, process.env.JWT_SECRET, { expiresIn: -1 }))).status, 401);
  });

  await t.test('text posts and owner announcements store authenticated sender, role, timestamp and PG without client spoofing', async () => {
    ownerMessage = await request('POST', '', { text: 'Welcome to the community' });
    assert.equal(ownerMessage.status, 201); assert.equal(ownerMessage.data.sender.role, 'owner');
    ownMessage = await request('POST', '', { text: '  Hello everyone\nHappy to be here  ', owner: otherOwner._id, pgId: otherOwner._id,
      sender: foreignResident._id, senderRole: 'owner', senderName: 'Spoofed', createdAt: '2000-01-01T00:00:00Z' }, residentToken);
    assert.equal(ownMessage.status, 201);
    assert.equal(ownMessage.data.text, 'Hello everyone\nHappy to be here');
    assert.deepEqual(ownMessage.data.sender, { id: String(resident._id), name: resident.fullName, role: 'resident' });
    assert.equal(ownMessage.data.pgId, String(owner._id)); assert.equal(ownMessage.data.canDelete, true);
    assert.ok(Number.isFinite(Date.parse(ownMessage.data.createdAt))); assert.notEqual(ownMessage.data.createdAt, '2000-01-01T00:00:00Z');
    assert.equal((await request('POST', '', { text: 'Fake announcement', kind: 'announcement' }, residentToken)).status, 403);
    announcement = await request('POST', '', { text: 'Water maintenance tomorrow', kind: 'announcement' });
    assert.equal(announcement.status, 201); assert.equal(announcement.data.kind, 'announcement');
    foreignMessage = await request('POST', '', { text: 'Foreign PG private message' }, foreignToken);
    assert.equal(foreignMessage.status, 201);
    const ownHistory = await request('GET', '?owner=' + otherOwner._id + '&pgId=' + otherOwner._id, undefined, peerToken);
    assert.equal(ownHistory.data.messages.length, 3);
    assert.ok(ownHistory.data.messages.every((message) => message.pgId === String(owner._id) && !message.canDelete));
    assert.ok(!ownHistory.data.messages.some((message) => message.id === foreignMessage.data.id));
    assert.equal((await request('GET', '', undefined, foreignOwnerToken)).data.messages.length, 1);
    assert.equal(String((await CommunityMessage.findById(ownMessage.data.id)).owner), String(owner._id));
  });

  await t.test('residents delete only their messages; owners moderate only their PG without changing resident records', async () => {
    const before = await Resident.find().lean();
    assert.equal((await request('DELETE', '/' + ownMessage.data.id, undefined, peerToken)).status, 404);
    assert.equal((await request('DELETE', '/' + ownMessage.data.id, undefined, foreignOwnerToken)).status, 404);
    assert.equal((await request('DELETE', '/' + ownerMessage.data.id, undefined, residentToken)).status, 404);
    assert.equal((await request('DELETE', '/' + announcement.data.id, undefined, residentToken)).status, 404);
    assert.equal((await request('DELETE', '/' + foreignMessage.data.id)).status, 404);
    assert.equal((await request('DELETE', '/' + ownMessage.data.id, undefined, residentToken)).status, 200);
    assert.equal((await request('DELETE', '/' + ownMessage.data.id, undefined, residentToken)).status, 404);
    const inappropriate = await request('POST', '', { text: 'Message to moderate' }, peerToken);
    assert.equal(inappropriate.status, 201);
    assert.equal((await request('DELETE', '/' + inappropriate.data.id)).status, 200);
    assert.equal((await request('DELETE', '/' + announcement.data.id)).status, 200);
    assert.ok(await CommunityMessage.exists({ _id: foreignMessage.data.id, owner: otherOwner._id }));
    assert.deepEqual(await Resident.find().lean(), before);
  });

  await t.test('bounded history uses stable timestamp/ID cursors across same-time posts, insertions and deleted cursor messages', async () => {
    const stamp = new Date(Date.now() + 60000);
    const history = await CommunityMessage.insertMany(Array.from({ length: 6 }, (_, index) => ({
      owner: owner._id, sender: resident._id, senderRole: 'resident', senderName: resident.fullName,
      text: 'History ' + index, createdAt: stamp, updatedAt: stamp,
    })));
    const expected = (await CommunityMessage.find({ owner: owner._id }).sort({ createdAt: -1, _id: -1 })).map((message) => String(message._id));
    let page = await request('GET', '?limit=2');
    assert.equal(page.status, 200); assert.equal(page.count, 2); assert.equal(page.data.hasMore, true);
    const ids = page.data.messages.map((message) => message.id);
    await CommunityMessage.create({ owner: owner._id, sender: owner._id, senderRole: 'owner', senderName: owner.name,
      text: 'New while scrolling', createdAt: new Date(stamp.getTime() + 1000) });
    assert.equal((await request('DELETE', '/' + ids.at(-1))).status, 200);
    while (page.data.hasMore) {
      page = await request('GET', '?limit=2&before=' + encodeURIComponent(page.data.nextCursor));
      assert.equal(page.status, 200); assert.ok(page.count <= 2);
      ids.push(...page.data.messages.map((message) => message.id));
    }
    assert.deepEqual(ids, expected); assert.equal(new Set(ids).size, ids.length); assert.equal(page.data.nextCursor, null);
    assert.equal((await request('GET', '?limit=100')).status, 200);
    const peerHistory = await request('GET', '', undefined, peerToken);
    assert.equal(peerHistory.data.messages.find((message) => message.id === String(history[0]._id))?.canDelete, false);
  });

  await t.test('invalid text, message kinds, IDs, pagination and operator-shaped input are rejected', async () => {
    const before = await CommunityMessage.countDocuments();
    for (const body of [{}, { text: '' }, { text: '   \n ' }, { text: null }, { text: { $ne: null } }, { text: ['Hello'] },
      { text: 'x'.repeat(MESSAGE_MAX_LENGTH + 1) }, { text: 'Hello', kind: 'admin' }, { text: 'Hello', kind: ['announcement'] }]) {
      assert.equal((await request('POST', '', body)).status, 400);
    }
    for (const query of ['limit=0', 'limit=101', 'limit=-1', 'limit=1.5', 'limit=1e2', 'limit[$gt]=0', 'before[$ne]=x', 'before=not-a-cursor', 'before=' + 'x'.repeat(161)]) {
      assert.equal((await request('GET', '?' + query)).status, 400);
    }
    assert.equal((await request('DELETE', '/not-an-id')).status, 400);
    assert.equal(await CommunityMessage.countDocuments(), before);
    const maximum = await request('POST', '', { text: 'x'.repeat(MESSAGE_MAX_LENGTH) });
    assert.equal(maximum.status, 201); assert.equal(maximum.data.text.length, MESSAGE_MAX_LENGTH);
  });

  await t.test('inactive, disabled, departed, password-change-required and invalidated residents cannot read, post or delete', async () => {
    const active = { loginEnabled: true, accountStatus: 'active', status: 'Active', passwordChangeRequired: false, sessionVersion: peer.sessionVersion };
    for (const [change, expectedStatus] of [
      [{ accountStatus: 'disabled' }, 401], [{ loginEnabled: false }, 401], [{ status: 'Left' }, 401],
      [{ passwordChangeRequired: true }, 403], [{ sessionVersion: peer.sessionVersion + 1 }, 401],
    ]) {
      // Bypass save hooks to independently verify every authentication guard with the original token.
      await Resident.updateOne({ _id: peer._id }, { $set: { ...active, ...change } });
      assert.equal((await request('GET', '', undefined, peerToken)).status, expectedStatus);
      assert.equal((await request('POST', '', { text: 'Blocked message' }, peerToken)).status, expectedStatus);
      assert.equal((await request('DELETE', '/' + ownerMessage.data.id, undefined, peerToken)).status, expectedStatus);
    }
    await Resident.updateOne({ _id: peer._id }, { $set: { ...active, status: 'Left' } });
    assert.equal((await request('GET', '', undefined, generateResidentToken(await Resident.findById(peer._id)))).status, 401);
    assert.equal(await CommunityMessage.countDocuments({ text: 'Blocked message' }), 0);
    assert.equal((await request()).status, 200);
  });

  await t.test('posting is limited per authenticated member and does not block reads or other members sharing an IP', async () => {
    for (let index = 0; index < 20; index++) assert.equal((await request('POST', '', { text: 'Rate test ' + index }, rateToken)).status, 201);
    const limited = await request('POST', '', { text: 'Too many' }, rateToken);
    assert.equal(limited.status, 429); assert.equal(limited.success, false);
    assert.ok(Number(limited.headers.get('retry-after')) > 0);
    assert.equal(await CommunityMessage.countDocuments({ sender: rateResident._id }), 20);
    assert.equal((await request('GET', '', undefined, rateToken)).status, 200);
    assert.equal((await request('POST', '', { text: 'Another member is unaffected' }, residentToken)).status, 201);
  });
});
