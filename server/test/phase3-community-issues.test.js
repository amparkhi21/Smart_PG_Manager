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
import CommunityMessage from '../src/models/CommunityMessage.js';
import Complaint from '../src/models/Complaint.js';
import ComplaintEvent from '../src/models/ComplaintEvent.js';
import GeneralRequest from '../src/models/GeneralRequest.js';
import generateToken, { generateResidentToken } from '../src/utils/generateToken.js';

test('Phase 3 PG community issues and private complaint history stay tenant-scoped', { timeout: 120000 }, async (t) => {
  const previousSecret = process.env.JWT_SECRET; process.env.JWT_SECRET = 'phase3-community-test-secret-'.repeat(2);
  let mongo, server;
  t.after(async () => {
    if (server) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    await mongoose.disconnect(); await mongo?.stop();
    if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
  });
  mongo = await MongoMemoryServer.create({ binary: { version: '8.0.17', downloadDir: fileURLToPath(new URL('../../tmp/mongodb-binaries/', import.meta.url)) }, instance: { dbName: `phase3_community_${randomUUID().replaceAll('-', '')}` } });
  await mongoose.connect(mongo.getUri());
  await Promise.all([Owner.init(), Room.init(), Resident.init(), CommunityMessage.init(), Complaint.init(), ComplaintEvent.init(), GeneralRequest.init()]);
  const [owner, foreignOwner] = await Owner.create([
    { name: 'Owner A', email: 'owner-a@phase3.test', pgName: 'Same PG', password: 'OwnerPass123!' },
    { name: 'Owner B', email: 'owner-b@phase3.test', pgName: 'Same PG', password: 'OwnerPass123!' },
  ]);
  const [room, foreignRoom] = await Room.create([
    { owner: owner._id, roomNumber: '101', capacity: 4, monthlyRent: 4000 },
    { owner: foreignOwner._id, roomNumber: '101', capacity: 4, monthlyRent: 4000 },
  ]);
  const passwordHash = await bcrypt.hash('ResidentPass123!', 4);
  const [resident, peer, foreign] = await Resident.create([
    { owner: owner._id, room: room._id, fullName: 'Resident A', phone: '9876543210', monthlyRent: 4000, passwordHash, loginEnabled: true, accountStatus: 'active' },
    { owner: owner._id, room: room._id, fullName: 'Resident Peer', phone: '9876543211', monthlyRent: 4000, passwordHash, loginEnabled: true, accountStatus: 'active' },
    { owner: foreignOwner._id, room: foreignRoom._id, fullName: 'Foreign Resident', phone: '9876543212', monthlyRent: 4000, passwordHash, loginEnabled: true, accountStatus: 'active' },
  ]);
  const issue = await Complaint.create({ owner: owner._id, resident: resident._id, residentName: resident.fullName, residentRoomNumber: '101', room: room._id,
    roomNumber: '101', title: 'PRIVATE historical issue', description: 'Private history must not enter Community.', category: 'Maintenance', priority: 'High', status: 'In Progress' });
  await ComplaintEvent.create([
    { owner: owner._id, complaint: issue._id, resident: resident._id, actor: resident._id, actorRole: 'resident', actorName: resident.fullName, type: 'Created', toStatus: 'Open' },
    { owner: owner._id, complaint: issue._id, resident: resident._id, actor: owner._id, actorRole: 'owner', actorName: owner.name, type: 'Comment', text: 'We are arranging a repair.' },
  ]);
  const ownerToken = generateToken(owner._id), foreignOwnerToken = generateToken(foreignOwner._id);
  const residentToken = generateResidentToken(resident), peerToken = generateResidentToken(peer), foreignToken = generateResidentToken(foreign);
  server = createApp({ NODE_ENV: 'development' }).listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  const root = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, path, body, token = residentToken) => {
    const response = await fetch(root + path, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) }, ...(body !== undefined && { body: JSON.stringify(body) }) });
    return { status: response.status, ...(await response.json()) };
  };

  const created = await call('POST', '/community/issues', { category: 'Water Problem', title: 'Water pressure is low', description: 'Water pressure has dropped across the floor.' });
  assert.equal(created.status, 201); assert.equal(created.data.status, 'Open'); assert.equal(created.data.roomNumber, '101');
  const ownDetail = await call('GET', `/community/issues/${created.data.id}`);
  assert.equal(ownDetail.status, 200); assert.equal(ownDetail.data.roomNumber, '101');
  assert.equal((await call('GET', `/community/issues/${created.data.id}`, undefined, peerToken)).data.roomNumber, undefined);
  assert.equal((await call('GET', '/community/issues?category=Water%20Problem&status=Open')).data.issues.length, 1);
  assert.equal((await call('GET', '/community/issues?category=Food%20/%20Mess')).data.issues.length, 0);
  assert.equal((await call('POST', `/community/issues/${created.data.id}/comments`, { text: 'I can confirm this too.' }, peerToken)).status, 201);
  assert.equal((await call('POST', `/community/issues/${created.data.id}/comments`, { text: 'We are looking into this.' }, ownerToken)).status, 201);
  assert.equal((await call('PATCH', `/community/issues/${created.data.id}/status`, { status: 'Resolved' })).status, 403);
  assert.equal((await call('DELETE', `/community/issues/${created.data.id}`, undefined, residentToken)).status, 403);
  assert.equal((await call('GET', `/community/issues/${created.data.id}`, undefined, foreignToken)).status, 404);
  assert.equal((await call('GET', '/community/issues', undefined, foreignOwnerToken)).data.pagination.total, 0);
  const resolved = await call('PATCH', `/community/issues/${created.data.id}/status`, { status: 'Resolved' }, ownerToken);
  assert.equal(resolved.status, 200); assert.equal(resolved.data.status, 'Resolved');
  assert.equal((await call('GET', '/community/issues?status=Resolved', undefined, ownerToken)).data.issues.length, 1);
  assert.equal((await call('GET', `/community/issues/${created.data.id}`, undefined, ownerToken)).data.comments.length, 2);
  assert.equal((await call('DELETE', `/community/issues/${created.data.id}`, undefined, foreignOwnerToken)).status, 404);

  const privateList = await call('GET', '/requests?category=Private%20Issue', undefined, ownerToken);
  assert.equal(privateList.data.pagination.total, 1); assert.equal(privateList.data.requests[0].sourceType, 'complaint');
  const privateDetail = await call('GET', `/resident/requests/complaint/${issue._id}`, undefined, residentToken);
  assert.equal(privateDetail.status, 200); assert.equal(privateDetail.data.responses.length, 2);
  assert.match(privateDetail.data.responses[1].message, /arranging a repair/);
  assert.equal((await call('GET', `/resident/requests/complaint/${issue._id}`, undefined, peerToken)).status, 404);
  assert.equal((await call('GET', `/requests/complaint/${issue._id}`, undefined, foreignOwnerToken)).status, 404);
  const chat = await call('GET', '/community/messages', undefined, ownerToken);
  const publicIssues = await call('GET', '/community/issues', undefined, ownerToken);
  assert.doesNotMatch(JSON.stringify([chat, publicIssues]), /PRIVATE historical issue|Private history must not enter Community/);
});
