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
import ElectricityBill from '../src/models/ElectricityBill.js';
import generateToken, { generateResidentToken } from '../src/utils/generateToken.js';

test('Phase 5B settings and read-only financial UI support on disposable MongoDB', { timeout: 120000 }, async (t) => {
  const secret = process.env.JWT_SECRET; process.env.JWT_SECRET = 'phase5b-disposable-secret-'.repeat(3);
  let mongo, server;
  t.after(async () => {
    if (server) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    await mongoose.disconnect(); await mongo?.stop();
    if (secret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = secret;
  });
  mongo = await MongoMemoryServer.create({ binary: { version: '8.0.17', downloadDir: fileURLToPath(new URL('../../tmp/mongodb-binaries/', import.meta.url)) }, instance: { dbName: 'phase5b_test_' + randomUUID().replaceAll('-', '') } });
  await mongoose.connect(mongo.getUri());
  await Promise.all([Owner.init(), Room.init(), Resident.init(), RentRecord.init(), ElectricityBill.init()]);
  const [owner, other] = await Owner.create([{ name: 'Owner A', email: 'a@phase5b.test', password: 'OwnerPass123!', pgName: 'Same PG' }, { name: 'Owner B', email: 'b@phase5b.test', password: 'OwnerPass123!', pgName: 'Same PG', upiId: 'other@bank' }]);
  const [room, otherRoom] = await Room.create([{ owner: owner._id, roomNumber: '101', capacity: 3, monthlyRent: 5000 }, { owner: other._id, roomNumber: '101', capacity: 3, monthlyRent: 5000 }]);
  const passwordHash = await bcrypt.hash('ResidentPass123!', 4), base = { monthlyRent: 5000, loginEnabled: true, accountStatus: 'active', passwordHash };
  const [resident, peer, foreign] = await Resident.create([{ ...base, owner: owner._id, room: room._id, fullName: 'Resident A', phone: '9876543210' }, { ...base, owner: owner._id, room: room._id, fullName: 'Peer', phone: '9876543211' }, { ...base, owner: other._id, room: otherRoom._id, fullName: 'Foreign', phone: '9876543210' }]);
  const dueDate = new Date('2026-11-05T18:29:59Z');
  const rent = await RentRecord.create({ owner: owner._id, resident: resident._id, room: room._id, month: '2026-11', amountDue: 5000, dueDate, payments: [{ amount: 5000, method: 'Cash', paidOn: dueDate, note: 'PRIVATE_OWNER_NOTE' }] });
  await RentRecord.create({ owner: other._id, resident: foreign._id, room: otherRoom._id, month: '2026-11', amountDue: 9000, dueDate });
  await ElectricityBill.create({ owner: owner._id, room: room._id, month: '2026-11', previousReading: 0, currentReading: 100, ratePerUnit: 8, dueDate, payments: [{ amount: 300, method: 'UPI', paidOn: dueDate, note: 'OTHER_RESIDENT_UTR' }] });
  const ownerToken = generateToken(owner._id), otherToken = generateToken(other._id), residentToken = generateResidentToken(resident), peerToken = generateResidentToken(peer), foreignToken = generateResidentToken(foreign);
  server = createApp({ NODE_ENV: 'development' }).listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  const url = 'http://127.0.0.1:' + server.address().port + '/api';
  const call = async (method, path, body, token = residentToken) => { const response = await fetch(url + path, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) }, ...(body !== undefined && { body: JSON.stringify(body) }) }); return { status: response.status, ...await response.json() }; };

  await t.test('UPI is absent until configured, owner-only settings validate and isolate changes', async () => {
    assert.equal((await call('GET', '/resident/payments/details')).data.upiId, null);
    for (const upiId of ['bad', 'owner@bank&pa=evil@bank', { $ne: null }]) assert.equal((await call('PATCH', '/settings', { upiId }, ownerToken)).status, 400);
    assert.equal((await call('PATCH', '/settings', { upiId: ' resident@bank ' })).status, 403);
    const saved = await call('PATCH', '/settings', { upiId: ' owner@bank ' }, ownerToken); assert.equal(saved.status, 200); assert.equal(saved.data.owner.upiId, 'owner@bank');
    assert.equal((await call('GET', '/settings', undefined, otherToken)).data.owner.upiId, 'other@bank');
    const details = await call('GET', '/resident/payments/details?owner=' + other._id); assert.equal(details.data.upiId, 'owner@bank');
    assert.deepEqual(Object.keys(details.data).sort(), ['payeeName', 'pgName', 'upiId']);
    assert.equal((await call('GET', '/resident/payments/details', undefined, foreignToken)).data.upiId, 'other@bank');
  });
  await t.test('monthly history includes settled personal payments and only aggregates shared room electricity', async () => {
    const response = await call('GET', '/resident/payments/history?month=2026-11'); assert.equal(response.status, 200);
    const personal = response.data.find((row) => row.billType === 'Rent'), power = response.data.find((row) => row.billType === 'Electricity');
    assert.equal(personal.id, String(rent._id)); assert.equal(personal.balance, 0); assert.equal(personal.payments[0].amount, 5000);
    assert.equal(power.amountPaid, 300); assert.equal(power.balance, 500); assert.equal(power.payments, undefined);
    assert.doesNotMatch(JSON.stringify(response), /PRIVATE_OWNER_NOTE|OTHER_RESIDENT_UTR|passwordHash|sessionVersion/);
    assert.deepEqual((await call('GET', '/resident/payments/history?month=2026-11', undefined, peerToken)).data.map((row) => row.billType), ['Electricity']);
    assert.equal((await call('GET', '/resident/payments/history?month=2026-10')).data.length, 0);
    assert.equal((await call('GET', '/resident/payments/history?month[$ne]=x')).status, 400);
    const foreignHistory = await call('GET', '/resident/payments/history?month=2026-11', undefined, foreignToken); assert.equal(foreignHistory.data.length, 1); assert.equal(foreignHistory.data[0].amountDue, 9000);
  });
  await t.test('read support rejects owners, unauthenticated and inactive residents without changing bills', async () => {
    const snapshot = await RentRecord.findById(rent._id).lean();
    for (const path of ['/resident/payments/details', '/resident/payments/history']) {
      assert.equal((await call('GET', path, undefined, ownerToken)).status, 403);
      assert.equal((await call('GET', path, undefined, null)).status, 401);
    }
    await Resident.updateOne({ _id: resident._id }, { $set: { accountStatus: 'disabled' } });
    assert.equal((await call('GET', '/resident/payments/history')).status, 401);
    assert.equal((await call('GET', '/resident/payments/details')).status, 401);
    assert.deepEqual(await RentRecord.findById(rent._id).lean(), snapshot);
    assert.equal((await call('PATCH', '/settings', { upiId: '' }, ownerToken)).status, 200);
  });
});
