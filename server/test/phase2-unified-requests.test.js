import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import { createApp } from '../src/app.js';
import Owner from '../src/models/Owner.js';
import Room from '../src/models/Room.js';
import Resident from '../src/models/Resident.js';
import GeneralRequest from '../src/models/GeneralRequest.js';
import PaymentClaim from '../src/models/PaymentClaim.js';
import RoomChangeRequest from '../src/models/RoomChangeRequest.js';
import LeaveRequest from '../src/models/LeaveRequest.js';
import generateToken, { generateResidentToken } from '../src/utils/generateToken.js';

test('Phase 2 unified requests aggregate existing workflows and isolate resident and owner access', { timeout: 120000 }, async (t) => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'phase2-unified-requests-test-secret-'.repeat(2);
  let mongo, server;
  t.after(async () => {
    if (server) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    await mongoose.disconnect(); await mongo?.stop();
    if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
  });
  mongo = await MongoMemoryServer.create({
    binary: { version: '8.0.17', downloadDir: fileURLToPath(new URL('../../tmp/mongodb-binaries/', import.meta.url)) },
    instance: { dbName: `phase2_requests_${randomUUID().replaceAll('-', '')}` },
  });
  await mongoose.connect(mongo.getUri());
  await Promise.all([Owner.init(), Room.init(), Resident.init(), GeneralRequest.init(), PaymentClaim.init(), RoomChangeRequest.init(), LeaveRequest.init()]);
  const [owner, otherOwner] = await Owner.create([
    { name: 'Owner A', email: 'owner-a@phase2.test', pgName: 'Same PG', password: 'OwnerPass123!' },
    { name: 'Owner B', email: 'owner-b@phase2.test', pgName: 'Same PG', password: 'OwnerPass123!' },
  ]);
  const [room, nextRoom, otherRoom] = await Room.create([
    { owner: owner._id, roomNumber: '101', capacity: 2, monthlyRent: 4000 },
    { owner: owner._id, roomNumber: '102', capacity: 2, monthlyRent: 4500 },
    { owner: otherOwner._id, roomNumber: '101', capacity: 2, monthlyRent: 4000 },
  ]);
  const passwordHash = await bcrypt.hash('ResidentPass123!', 4);
  const [resident, peer, foreign] = await Resident.create([
    { owner: owner._id, room: room._id, fullName: 'Resident A', phone: '9876543210', monthlyRent: 4000, passwordHash, loginEnabled: true, accountStatus: 'active' },
    { owner: owner._id, room: room._id, fullName: 'Resident Peer', phone: '9876543211', monthlyRent: 4000, passwordHash, loginEnabled: true, accountStatus: 'active' },
    { owner: otherOwner._id, room: otherRoom._id, fullName: 'Foreign Resident', phone: '9876543212', monthlyRent: 4000, passwordHash, loginEnabled: true, accountStatus: 'active' },
  ]);
  const [payment, roomChange, leave] = await Promise.all([
    PaymentClaim.create({ owner: owner._id, resident: resident._id, room: room._id, bill: new mongoose.Types.ObjectId(), billType: 'Rent', month: '2026-11', amount: 1000, utr: '456789012345', paymentDate: new Date(), status: 'Pending Verification' }),
    RoomChangeRequest.create({ owner: owner._id, resident: resident._id, residentName: resident.fullName, fromRoom: room._id, toRoom: nextRoom._id, fromRoomNumber: room.roomNumber, toRoomNumber: nextRoom.roomNumber, reason: 'Need a quieter room' }),
    LeaveRequest.create({ owner: owner._id, resident: resident._id, residentName: resident.fullName, room: room._id, roomNumber: room.roomNumber, fromDate: '2026-12-01', toDate: '2026-12-02', durationDays: 2, reason: 'Family visit' }),
  ]);
  const ownerToken = generateToken(owner._id), foreignOwnerToken = generateToken(otherOwner._id);
  const residentToken = generateResidentToken(resident), peerToken = generateResidentToken(peer), foreignToken = generateResidentToken(foreign);
  server = createApp({ NODE_ENV: 'development' }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const root = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, path, body, token = ownerToken) => {
    const response = await fetch(root + path, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) }, ...(body !== undefined && { body: JSON.stringify(body) }) });
    return { status: response.status, ...(await response.json()) };
  };

  const created = await call('POST', '/resident/requests', {
    category: 'Maintenance', title: 'Leaking tap', description: 'The bathroom tap has been leaking since yesterday.', priority: 'High',
    owner: otherOwner._id, resident: peer._id, status: 'Resolved',
  }, residentToken);
  assert.equal(created.status, 201);
  assert.equal(created.data.status, 'Open');
  assert.equal(String((await GeneralRequest.findById(created.data.sourceId)).resident), String(resident._id));

  const all = await call('GET', '/requests?limit=2');
  assert.equal(all.status, 200);
  assert.equal(all.data.pagination.total, 4);
  assert.equal(all.data.requests.length, 2);
  const residentList = await call('GET', '/resident/requests?limit=10', undefined, residentToken);
  assert.equal(residentList.data.pagination.total, 4);
  assert.deepEqual(new Set(residentList.data.requests.map((item) => item.sourceType)), new Set(['payment', 'room-change', 'leave', 'general']));
  const peerList = await call('GET', '/resident/requests', undefined, peerToken);
  assert.equal(peerList.data.pagination.total, 0);
  assert.equal((await call('GET', `/resident/requests/general/${created.data.sourceId}`, undefined, peerToken)).status, 404);
  assert.equal((await call('GET', `/resident/requests/payment/${payment._id}`, undefined, foreignToken)).status, 404);
  assert.equal((await call('GET', '/requests', undefined, foreignOwnerToken)).data.pagination.total, 0);
  assert.equal((await call('GET', `/requests/leave/${leave._id}`, undefined, foreignOwnerToken)).status, 404);
  assert.equal((await call('PATCH', `/requests/payment/${payment._id}`, { status: 'Approved' })).status, 404);

  const replied = await call('PATCH', `/requests/general/${created.data.sourceId}`, { response: 'A plumber will visit today.', status: 'In Progress' });
  assert.equal(replied.status, 200);
  const residentDetail = await call('GET', `/resident/requests/general/${created.data.sourceId}`, undefined, residentToken);
  assert.equal(residentDetail.data.status, 'In Progress');
  assert.equal(residentDetail.data.responses[0].message, 'A plumber will visit today.');
  assert.equal((await call('PATCH', `/requests/general/${created.data.sourceId}`, { status: 'Resolved' }, foreignOwnerToken)).status, 404);
  assert.equal(String(roomChange.owner), String(owner._id));
});
