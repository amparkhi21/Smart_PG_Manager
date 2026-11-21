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
import RentRecord from '../src/models/RentRecord.js';
import Attendance from '../src/models/Attendance.js';
import EmergencyContact, { normalizeContactPhone } from '../src/models/EmergencyContact.js';
import generateToken, { generateResidentToken } from '../src/utils/generateToken.js';

test('emergency phones normalize standard numbers and retain short helplines safely', () => {
  for (const [input, expected] of [['98765 43210', '+919876543210'], ['91-9876543210', '+919876543210'], ['+44 (7911) 123456', '+447911123456'], ['112', '112'], ['1-0-1', '101']]) assert.equal(normalizeContactPhone(input), expected);
  for (const input of [null, 112, {}, '12', '000', '+112', '1234567', 'tel:112', '112;123', '+919876543210#', 'javascript:alert(1)', '1'.repeat(51)]) assert.equal(normalizeContactPhone(input), null);
});

test('Phase 7C emergency contact CRUD and authorization on disposable MongoDB', { timeout: 120000 }, async (t) => {
  const previousSecret = process.env.JWT_SECRET; process.env.JWT_SECRET = 'phase7c-local-test-secret-'.repeat(3);
  let mongo, server;
  t.after(async () => {
    if (server) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    await mongoose.disconnect(); await mongo?.stop();
    if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
  });
  mongo = await MongoMemoryServer.create({ binary: { version: '8.0.17', downloadDir: fileURLToPath(new URL('../../tmp/mongodb-binaries/', import.meta.url)) } });
  await mongoose.connect(mongo.getUri(), { dbName: 'phase7c_test_' + randomUUID().replaceAll('-', '') });
  await Promise.all([Owner.init(), Room.init(), Resident.init(), EmergencyContact.init(), RentRecord.init(), Attendance.init()]);
  const [owner, otherOwner] = await Owner.create([
    { name: 'Owner A', email: 'a@phase7c.test', password: 'OwnerPass123!', pgName: 'Same PG Name' },
    { name: 'Owner B', email: 'b@phase7c.test', password: 'OwnerPass123!', pgName: 'Same PG Name' },
  ]);
  const [room, otherRoom] = await Room.create([{ owner: owner._id, roomNumber: '101', monthlyRent: 4000, capacity: 10 }, { owner: otherOwner._id, roomNumber: '101', monthlyRent: 5000, capacity: 10 }]);
  const passwordHash = await bcrypt.hash('ResidentPass123!', 4);
  const [resident, peer, foreignResident] = await Resident.create([0, 1, 2].map((index) => ({ owner: index === 2 ? otherOwner._id : owner._id, room: index === 2 ? otherRoom._id : room._id,
    fullName: 'Resident ' + index, phone: String(9700000000 + index), monthlyRent: 4000, passwordHash, loginEnabled: true, accountStatus: 'active' })));
  await RentRecord.create({ owner: owner._id, resident: resident._id, room: room._id, month: '2026-11', amountDue: 4000, dueDate: new Date(), payments: [{ amount: 1000, method: 'Cash' }] });
  await Attendance.create({ owner: owner._id, resident: resident._id, room: room._id, date: '2026-11-20', status: 'Present' });
  const snapshot = async () => Object.fromEntries(await Promise.all([Owner, Room, Resident, RentRecord, Attendance].map(async (Model) => [Model.modelName, await Model.collection.find({}).toArray()])));
  const before = await snapshot();
  const ownerToken = generateToken(owner._id), otherToken = generateToken(otherOwner._id), residentToken = generateResidentToken(resident), peerToken = generateResidentToken(peer), foreignToken = generateResidentToken(foreignResident);
  server = createApp({ NODE_ENV: 'development' }).listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/api';
  const request = async (method, path, body, token = ownerToken) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) }, ...(body !== undefined && { body: JSON.stringify(body) }) });
    const result = await response.json(); assert.doesNotMatch(JSON.stringify(result), /passwordHash|sessionVersion|normalizedPhone|@phase7c\.test/);
    return { status: response.status, ...result };
  };
  const root = '/emergency-contacts', residentRoot = '/resident/emergency-contacts';
  const draft = { name: ' Caretaker (Night) ', category: 'Caretaker', phone: '+91 (98765) 43210', description: ' Ground floor ', priority: false };
  let contact, helpline, foreign;

  await t.test('owners create normalized contacts with trusted PG ownership and priority sorting', async () => {
    assert.equal((await request('GET', root)).data.contacts.length, 0);
    const result = await request('POST', root, { ...draft, owner: otherOwner._id, _id: otherOwner._id, createdAt: '2000-01-01' });
    assert.equal(result.status, 201); contact = result.data;
    assert.equal(contact.name, 'Caretaker (Night)'); assert.equal(contact.phone, '+919876543210'); assert.equal(contact.description, 'Ground floor');
    assert.equal(String((await EmergencyContact.findById(contact.id)).owner), String(owner._id)); assert.notEqual(contact.id, String(otherOwner._id));
    assert.ok(!('owner' in contact)); assert.notEqual(contact.createdAt, '2000-01-01T00:00:00.000Z');
    const priority = await request('POST', root, { name: 'Priority Helpline', category: 'Medical', phone: '112', priority: true });
    assert.equal(priority.status, 201); helpline = priority.data; assert.equal(helpline.description, '');
    const other = await request('POST', root, { ...draft, name: 'FOREIGN PG PRIVATE CONTACT' }, otherToken); assert.equal(other.status, 201); foreign = other.data;
    assert.deepEqual((await request('GET', root)).data.contacts.map((row) => row.id), [helpline.id, contact.id]);
  });
  await t.test('active residents and owners see only their PG even with matching PG names or forged filters', async () => {
    for (const token of [residentToken, peerToken]) {
      const result = await request('GET', residentRoot + '?owner=' + otherOwner._id + '&pgId=' + otherOwner._id, undefined, token);
      assert.equal(result.status, 200); assert.deepEqual(result.data.contacts.map((row) => row.id), [helpline.id, contact.id]);
      assert.doesNotMatch(JSON.stringify(result), /FOREIGN PG PRIVATE CONTACT/);
    }
    for (const [path, token] of [[root, otherToken], [residentRoot, foreignToken]]) assert.deepEqual((await request('GET', path, undefined, token)).data.contacts.map((row) => row.id), [foreign.id]);
  });
  await t.test('search and category filters escape regex and validate structured query inputs', async () => {
    const filtered = await request('GET', root + '?search=' + encodeURIComponent('(Night)') + '&category=Caretaker');
    assert.deepEqual(filtered.data.contacts.map((row) => row.id), [contact.id]);
    assert.equal((await request('GET', root + '?search=' + encodeURIComponent('.*'))).count, 0);
    assert.deepEqual((await request('GET', residentRoot + '?category=Medical', undefined, residentToken)).data.contacts.map((row) => row.id), [helpline.id]);
    for (const query of ['category=Invalid', 'search=' + 'x'.repeat(101), 'search[$ne]=x', 'category[$ne]=x']) assert.equal((await request('GET', root + '?' + query)).status, 400);
  });
  await t.test('roles, unauthenticated requests and cross-PG mutations are rejected', async () => {
    assert.equal((await request('GET', root, undefined, null)).status, 401);
    assert.equal((await request('GET', residentRoot, undefined, null)).status, 401);
    assert.equal((await request('GET', root, undefined, residentToken)).status, 403);
    assert.equal((await request('GET', residentRoot, undefined, ownerToken)).status, 403);
    for (const [method, suffix, body] of [['POST', '', draft], ['PUT', '/' + contact.id, draft], ['DELETE', '/' + contact.id, undefined]]) {
      assert.equal((await request(method, root + suffix, body, residentToken)).status, 403);
      assert.equal((await request(method, residentRoot + suffix, body, residentToken)).status, 403);
    }
    assert.equal((await request('PUT', root + '/' + contact.id, draft, otherToken)).status, 404);
    assert.equal((await request('DELETE', root + '/' + contact.id, undefined, otherToken)).status, 404);
    assert.equal((await request('DELETE', root + '/not-an-id')).status, 400);
  });
  await t.test('invalid text, categories, phone numbers and priority types never create or alter records', async () => {
    const invalid = [{ name: '' }, { name: 123 }, { name: 'x'.repeat(101) }, { category: 'Unknown' }, { phone: 112 }, { phone: 'tel:112' }, { phone: '112;123' }, { phone: { $ne: null } }, { description: 'x'.repeat(1001) }, { description: null }, { priority: 'true' }, { priority: 1 }];
    const count = await EmergencyContact.countDocuments();
    for (const extra of invalid) {
      assert.equal((await request('POST', root, { ...draft, ...extra })).status, 400);
      assert.equal((await request('PUT', root + '/' + contact.id, { ...draft, ...extra })).status, 400);
    }
    assert.equal(await EmergencyContact.countDocuments(), count); assert.equal((await EmergencyContact.findById(contact.id)).name, contact.name);
  });
  await t.test('owner edits preserve ownership, normalize phones and can clear priority and descriptions', async () => {
    const result = await request('PUT', root + '/' + helpline.id, { name: 'On-call Medical', category: 'Medical', phone: '+44 (7911) 123456', description: '', priority: false, owner: otherOwner._id });
    assert.equal(result.status, 200); assert.equal(result.data.phone, '+447911123456'); assert.equal(result.data.priority, false); assert.equal(result.data.description, '');
    assert.equal(String((await EmergencyContact.findById(helpline.id)).owner), String(owner._id));
    assert.equal((await request('PUT', root + '/' + new mongoose.Types.ObjectId(), draft)).status, 404);
  });
  await t.test('disabled, departed, stale sessions and first-login residents cannot read contacts', async () => {
    for (const [change, status] of [[{ loginEnabled: false }, 401], [{ accountStatus: 'disabled' }, 401], [{ status: 'Left' }, 401], [{ sessionVersion: 1 }, 401], [{ passwordChangeRequired: true }, 403]]) {
      await Resident.collection.updateOne({ _id: resident._id }, { $set: change });
      assert.equal((await request('GET', residentRoot, undefined, residentToken)).status, status);
      await Resident.collection.updateOne({ _id: resident._id }, { $set: { loginEnabled: true, accountStatus: 'active', status: 'Active', sessionVersion: 0, passwordChangeRequired: false } });
    }
    assert.equal((await request('GET', residentRoot, undefined, residentToken)).status, 200);
  });
  await t.test('deletion removes only the selected contact and leaves resident and financial records unchanged', async () => {
    assert.equal((await request('DELETE', root + '/' + contact.id)).status, 200);
    assert.equal((await request('DELETE', root + '/' + contact.id)).status, 404);
    assert.equal(await EmergencyContact.countDocuments({ owner: otherOwner._id }), 1);
    assert.equal((await request('GET', residentRoot, undefined, residentToken)).data.contacts.some((row) => row.id === contact.id), false);
    assert.deepEqual(await snapshot(), before);
  });
});
