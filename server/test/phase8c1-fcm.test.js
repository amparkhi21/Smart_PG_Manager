import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { createApp } from '../src/app.js';
import Owner from '../src/models/Owner.js';
import Room from '../src/models/Room.js';
import Resident from '../src/models/Resident.js';
import Complaint from '../src/models/Complaint.js';
import ComplaintEvent from '../src/models/ComplaintEvent.js';
import RentRecord from '../src/models/RentRecord.js';
import PaymentClaim from '../src/models/PaymentClaim.js';
import Notification, { NOTIFICATION_TARGETS } from '../src/models/Notification.js';
import PushDevice from '../src/models/PushDevice.js';
import PushDelivery from '../src/models/PushDelivery.js';
import { firebaseProvider, firebaseStatus } from '../src/config/firebase.js';
import { encryptPushToken, decryptPushToken, tokenHash } from '../src/utils/pushTokens.js';
import { dispatchPushNotifications, waitForPushDeliveries } from '../src/utils/pushNotifications.js';
import generateToken, { generateResidentToken } from '../src/utils/generateToken.js';
import { todayIST } from '../src/utils/dates.js';

test('Firebase stays disabled without explicit environment configuration; no default credential fallback', () => {
  assert.deepEqual(firebaseStatus({}), { enabled: false, configured: false, missing: ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY', 'FCM_TOKEN_ENCRYPTION_KEY'] });
  assert.equal(firebaseStatus({ FCM_ENABLED: 'true', FCM_TOKEN_ENCRYPTION_KEY: 'invalid' }).configured, false);
  assert.equal(firebaseProvider.get(), null);
});

test('Phase 8C1 mocked Firebase, encrypted device registration and private durable delivery', { timeout: 180000 }, async (t) => {
  const saved = { JWT_SECRET: process.env.JWT_SECRET, FCM_ENABLED: process.env.FCM_ENABLED, FCM_TOKEN_ENCRYPTION_KEY: process.env.FCM_TOKEN_ENCRYPTION_KEY };
  process.env.JWT_SECRET = 'phase8c1-local-disposable-secret-'.repeat(3); process.env.FCM_ENABLED = 'false'; process.env.FCM_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  let mongo, server, messaging = null;
  // All SDK access goes through this mock. No Firebase credential or real project is used.
  const providerMock = t.mock.method(firebaseProvider, 'get', () => messaging);
  t.after(async () => {
    await waitForPushDeliveries(); messaging = null;
    if (server) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    await mongoose.disconnect(); await mongo?.stop(); providerMock.mock.restore();
    for (const [name, value] of Object.entries(saved)) if (value === undefined) delete process.env[name]; else process.env[name] = value;
  });
  mongo = await MongoMemoryReplSet.create({ binary: { version: '8.0.17', downloadDir: fileURLToPath(new URL('../../tmp/mongodb-binaries/', import.meta.url)) }, replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri(), { dbName: 'phase8c1_test_' + randomUUID().replaceAll('-', '') });
  await Promise.all([Owner, Room, Resident, Complaint, ComplaintEvent, RentRecord, PaymentClaim, Notification, PushDevice, PushDelivery].map((Model) => Model.init()));
  const [owner, otherOwner] = await Owner.create([
    { name: 'Owner A', email: 'a@phase8c1.test', password: 'OwnerPass123!', pgName: 'Same PG' },
    { name: 'Owner B', email: 'b@phase8c1.test', password: 'OwnerPass123!', pgName: 'Same PG' },
  ]);
  const [room, foreignRoom] = await Room.create([{ owner: owner._id, roomNumber: '101', capacity: 10, monthlyRent: 4000 }, { owner: otherOwner._id, roomNumber: '101', capacity: 10, monthlyRent: 4000 }]);
  const passwordHash = await bcrypt.hash('ResidentPass123!', 4), fields = { passwordHash, monthlyRent: 4000, loginEnabled: true, accountStatus: 'active' };
  const [resident, peer, foreign, disabled] = await Resident.create([
    { ...fields, owner: owner._id, room: room._id, fullName: 'Resident A', phone: '9750000000' },
    { ...fields, owner: owner._id, room: room._id, fullName: 'Resident Peer', phone: '9750000001' },
    { ...fields, owner: otherOwner._id, room: foreignRoom._id, fullName: 'Foreign Resident', phone: '9750000009' },
    { ...fields, owner: owner._id, room: room._id, fullName: 'Disabled Resident', phone: '9750000002', loginEnabled: false, accountStatus: 'disabled' },
  ]);
  const ownerToken = generateToken(owner._id), otherToken = generateToken(otherOwner._id), residentToken = generateResidentToken(resident), peerToken = generateResidentToken(peer), foreignToken = generateResidentToken(foreign);
  const tokens = Object.fromEntries(['ownerA', 'ownerB', 'residentA', 'foreign', 'rotatedA', 'newerA', 'peer'].map((name) => [name, 'TEST_FCM_' + name + '_' + 'abcdef0123456789'.repeat(4)]));
  server = createApp({ NODE_ENV: 'development' }).listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/api';
  const request = async (method, path, body, token = ownerToken) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) }, ...(body !== undefined && { body: JSON.stringify(body) }) });
    const data = await response.json(), serialized = JSON.stringify(data);
    assert.doesNotMatch(serialized, /tokenHash|tokenCiphertext|tokenIv|tokenTag|passwordHash|notificationEvents|pushEligible|pushHandled/);
    for (const value of Object.values(tokens)) assert.ok(!serialized.includes(value));
    return { status: response.status, ...data };
  };
  const register = (deviceId, token, accountToken = ownerToken, extra = {}) => request('POST', '/notifications/devices', { deviceId, token, platform: 'android', ...extra }, accountToken);
  const persist = async (type, account, extra = {}) => {
    const role = NOTIFICATION_TARGETS[type][0], id = new mongoose.Types.ObjectId();
    return Notification.create({ _id: id, owner: role === 'owner' ? account._id : account.owner, recipientRole: role, recipient: account._id,
      eventKey: `${type}:${id}`, type, title: 'PRIVATE_TITLE_SHOULD_NOT_BE_PUSHED', message: 'PRIVATE_UTR_AMOUNT_AND_COMPLAINT_TEXT',
      relatedEntityId: new mongoose.Types.ObjectId(), path: NOTIFICATION_TARGETS[type][1], pushEligible: true, availableAt: new Date(), ...extra });
  };
  const collect = () => { const calls = []; messaging = { send: async (payload) => { calls.push(payload); return 'mock-message-id'; } }; return calls; };
  let deviceA, deviceB, residentDevice, foreignDevice, firstEvent;

  await t.test('owner and resident registration supports multiple devices without exposing tokens or trusting client identity', async () => {
    const a = await register('owner-installation-0001', tokens.ownerA, ownerToken, { owner: otherOwner._id, recipient: resident._id, recipientRole: 'resident' }); assert.equal(a.status, 200); deviceA = a.data;
    const b = await register('owner-installation-0002', tokens.ownerB); assert.equal(b.status, 200); deviceB = b.data;
    const r = await register('resident-installation-01', tokens.residentA, residentToken); assert.equal(r.status, 200); residentDevice = r.data;
    const f = await register('foreign-installation-01', tokens.foreign, otherToken); assert.equal(f.status, 200); foreignDevice = f.data;
    assert.equal(await PushDevice.countDocuments({ owner: owner._id, recipientRole: 'owner' }), 2);
    const raw = await PushDevice.collection.findOne({ _id: new mongoose.Types.ObjectId(deviceA.id) });
    assert.equal(String(raw.owner), String(owner._id)); assert.equal(raw.recipientRole, 'owner'); assert.equal(String(raw.recipient), String(owner._id));
    assert.equal(raw.tokenHash, tokenHash(tokens.ownerA)); assert.equal(decryptPushToken(raw), tokens.ownerA); assert.ok(!JSON.stringify(raw).includes(tokens.ownerA));
    assert.throws(() => decryptPushToken({ ...raw, owner: otherOwner._id })); assert.throws(() => decryptPushToken({ ...raw, deviceId: 'different-installation' }));
    const hidden = await PushDevice.findById(deviceA.id); assert.equal(hidden.tokenCiphertext, undefined); assert.equal(hidden.tokenHash, undefined);
    const repeat = await register('owner-installation-0001', tokens.ownerA); assert.equal(repeat.data.id, deviceA.id); assert.equal(await PushDevice.countDocuments(), 4);
  });
  await t.test('cross-account token binding and foreign unregister operations cannot cross PG or resident boundaries', async () => {
    assert.equal((await register('another-installation-01', tokens.ownerA, otherToken)).status, 409);
    assert.equal((await register('owner-installation-0001', tokens.peer, peerToken)).status, 409);
    assert.equal((await request('DELETE', '/notifications/devices/' + deviceA.id, undefined, otherToken)).status, 404);
    assert.equal((await request('DELETE', '/notifications/devices/' + residentDevice.id, undefined, peerToken)).status, 404);
    assert.equal((await request('DELETE', '/notifications/devices/' + foreignDevice.id)).status, 404);
    assert.equal(await PushDevice.countDocuments(), 4);
  });
  await t.test('authentication, inactive sessions and malformed device inputs are rejected; missing encryption fails closed', async () => {
    assert.equal((await register('valid-installation-123', tokens.peer, null)).status, 401);
    assert.equal((await register('valid-installation-123', tokens.peer, generateResidentToken(disabled))).status, 401);
    const badRole = jwt.sign({ id: String(owner._id), role: 'admin' }, process.env.JWT_SECRET);
    assert.equal((await register('valid-installation-123', tokens.peer, badRole)).status, 403);
    const stale = jwt.sign({ id: String(resident._id), role: 'resident', pgId: String(owner._id), version: 99 }, process.env.JWT_SECRET);
    assert.equal((await register('valid-installation-123', tokens.peer, stale)).status, 401);
    for (const extra of [{ deviceId: '../bad' }, { deviceId: {} }, { token: 'short' }, { token: 'invalid token with spaces' }, { token: { $ne: null } }, { token: 'x'.repeat(4097) }, { platform: 'web' }]) assert.equal((await register('valid-installation-123', tokens.peer, ownerToken, extra)).status, 400);
    const encryptionKey = process.env.FCM_TOKEN_ENCRYPTION_KEY; delete process.env.FCM_TOKEN_ENCRYPTION_KEY;
    try { assert.equal((await register('valid-installation-123', tokens.peer)).status, 503); }
    finally { process.env.FCM_TOKEN_ENCRYPTION_KEY = encryptionKey; }
    assert.equal(await PushDevice.countDocuments(), 4);
  });
  await t.test('every existing event type sends only to matching PG/role/account devices and concurrent drains deduplicate', async () => {
    const types = ['complaint_created', 'complaint_status_updated', 'complaint_response', 'room_change_requested', 'room_change_approved', 'room_change_rejected',
      'leave_requested', 'leave_approved', 'leave_rejected', 'payment_claim_submitted', 'payment_approved', 'payment_rejected', 'notice_published'];
    const events = [];
    for (const type of types) events.push(await persist(type, NOTIFICATION_TARGETS[type][0] === 'owner' ? owner : resident));
    firstEvent = events[0]; await persist('complaint_created', otherOwner);
    const calls = collect();
    await Promise.all([dispatchPushNotifications({ owner: owner._id }), dispatchPushNotifications({ owner: owner._id }), dispatchPushNotifications({ owner: owner._id })]);
    const expected = types.reduce((sum, type) => sum + (NOTIFICATION_TARGETS[type][0] === 'owner' ? 2 : 1), 0);
    assert.equal(calls.length, expected); assert.equal(new Set(calls.map((call) => `${call.data.notificationId}:${call.token}`)).size, expected);
    for (const call of calls) {
      assert.equal(call.data.pgId, String(owner._id)); assert.ok([tokens.ownerA, tokens.ownerB, tokens.residentA].includes(call.token));
      assert.equal(call.data.recipientId, call.data.recipientRole === 'owner' ? String(owner._id) : String(resident._id));
      assert.equal(call.android.notification.tag, 'notification-' + call.data.notificationId); assert.ok(call.data.path.startsWith('/'));
      assert.doesNotMatch(JSON.stringify({ notification: call.notification, data: call.data }), /PRIVATE_TITLE|PRIVATE_UTR|AMOUNT_AND/);
    }
    assert.equal(await PushDelivery.countDocuments({ owner: owner._id, status: 'sent' }), expected);
    await dispatchPushNotifications({ owner: owner._id }); assert.equal(calls.length, expected);
  });
  await t.test('token refresh updates encryption but never replays an attempted event for the same installation', async () => {
    const rotated = await register('owner-installation-0001', tokens.rotatedA); assert.equal(rotated.data.id, deviceA.id);
    await Notification.updateOne({ _id: firstEvent._id }, { $set: { pushHandled: false } });
    const calls = collect(); await dispatchPushNotifications({ owner: owner._id }); assert.equal(calls.length, 0);
    const device = await PushDevice.findById(deviceA.id).select('+tokenCiphertext +tokenIv +tokenTag'); assert.equal(decryptPushToken(device), tokens.rotatedA);
  });
  await t.test('expired/invalid Firebase tokens are removed while a concurrent refreshed token survives an old failure', async () => {
    const event = await persist('payment_claim_submitted', owner), calls = [];
    messaging = { send: async (payload) => { calls.push(payload); if (payload.token === tokens.ownerB) throw Object.assign(new Error('secret token must not be logged ' + payload.token), { code: 'messaging/registration-token-not-registered' }); return 'mock-ok'; } };
    await dispatchPushNotifications({ owner: owner._id }); assert.equal(calls.length, 2); assert.equal(await PushDevice.countDocuments({ _id: deviceB.id }), 0);
    assert.equal((await PushDelivery.findOne({ notification: event._id, device: deviceB.id })).errorCode, 'messaging/registration-token-not-registered');
    const next = await persist('complaint_created', owner);
    messaging = { send: async () => {
      const current = await PushDevice.findById(deviceA.id); const encrypted = encryptPushToken(tokens.newerA, current);
      await PushDevice.updateOne({ _id: deviceA.id }, { $set: encrypted, $inc: { revision: 1 } });
      throw Object.assign(new Error('old token expired'), { code: 'messaging/invalid-registration-token' });
    } };
    await dispatchPushNotifications({ owner: owner._id }); assert.ok(await PushDevice.exists({ _id: deviceA.id }));
    assert.equal((await PushDelivery.findOne({ notification: next._id })).status, 'failed');
  });
  await t.test('inactive, departed, stale-session and moved-PG residents are blocked again immediately before send', async () => {
    for (const [index, change] of [{ loginEnabled: false }, { status: 'Left' }, { sessionVersion: 1 }, { owner: otherOwner._id }].entries()) {
      messaging = null;
      const registered = await register('resident-recheck-' + String(index).padStart(4, '0'), tokens.residentA, residentToken);
      // The first registration replaces the existing installation only after explicitly unregistering it.
      if (registered.status === 409) {
        await PushDevice.deleteMany({ owner: owner._id, recipientRole: 'resident', recipient: resident._id });
        assert.equal((await register('resident-recheck-' + String(index).padStart(4, '0'), tokens.residentA, residentToken)).status, 200);
      } else assert.equal(registered.status, 200);
      const event = await persist('leave_approved', resident);
      try {
        await Resident.collection.updateOne({ _id: resident._id }, { $set: change });
        const calls = collect(); await dispatchPushNotifications({ owner: owner._id }); assert.equal(calls.length, 0);
        assert.equal((await PushDelivery.findOne({ notification: event._id })).status, 'skipped');
      } finally {
        await Resident.collection.updateOne({ _id: resident._id }, { $set: { owner: owner._id, status: 'Active', loginEnabled: true, accountStatus: 'active', passwordChangeRequired: false, sessionVersion: 0 } });
      }
    }
  });
  await t.test('unregistering revokes delivery; another PG can only unregister its own device', async () => {
    messaging = null;
    const r = await register('resident-final-device-01', tokens.residentA, residentToken); assert.equal(r.status, 200);
    const event = await persist('room_change_approved', resident);
    assert.equal((await request('DELETE', '/notifications/devices/' + r.data.id, undefined, foreignToken)).status, 404);
    assert.equal((await request('DELETE', '/notifications/devices/' + r.data.id, undefined, residentToken)).status, 200);
    const calls = collect(); await dispatchPushNotifications({ owner: owner._id }); assert.equal(calls.length, 0);
    assert.equal(await PushDelivery.countDocuments({ notification: event._id }), 0);
    assert.equal((await request('DELETE', '/notifications/devices/invalid')).status, 400);
  });
  await t.test('Firebase unavailable leaves in-app reads working; read, stale, future and pre-registration events do not push', async () => {
    messaging = null;
    const pending = await persist('complaint_created', owner);
    await dispatchPushNotifications({ owner: owner._id }); assert.equal(await PushDelivery.countDocuments({ notification: pending._id }), 0);
    const result = await request('GET', '/notifications'); assert.equal(result.status, 200); assert.ok(result.data.notifications.some((item) => item.id === String(pending._id)));
    await waitForPushDeliveries();
    await Notification.updateOne({ _id: pending._id }, { $set: { readAt: new Date() } });
    const stale = await persist('complaint_created', owner, { createdAt: new Date(Date.now() - 2 * 86400000) });
    const future = await persist('complaint_created', owner, { availableAt: new Date(Date.now() + 86400000) });
    const historical = await persist('complaint_created', owner, { pushEligible: false });
    const beforeDevice = await persist('payment_approved', peer); await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal((await register('peer-new-installation-01', tokens.peer, peerToken)).status, 200);
    const calls = collect(); await dispatchPushNotifications({ owner: owner._id }); assert.equal(calls.length, 0);
    for (const event of [pending, stale, future, historical, beforeDevice]) assert.equal(await PushDelivery.countDocuments({ notification: event._id }), 0);
  });
  await t.test('SDK timeouts are bounded, record sanitized failures and never repeat an ambiguous send', async () => {
    const event = await persist('complaint_created', owner); let calls = 0;
    messaging = { send: async () => { calls++; return new Promise(() => {}); } };
    await dispatchPushNotifications({ owner: owner._id, timeoutMs: 15 });
    const delivery = await PushDelivery.findOne({ notification: event._id }); assert.equal(delivery.status, 'failed'); assert.equal(delivery.errorCode, 'push/timeout');
    await Notification.updateOne({ _id: event._id }, { $set: { pushHandled: false } });
    await dispatchPushNotifications({ owner: owner._id, timeoutMs: 15 }); assert.equal(calls, 1);
  });
  await t.test('persisted complaint/payment events remain successful while an SDK send is pending or fails', async () => {
    messaging = null;
    assert.equal((await register('resident-business-device', tokens.residentA, residentToken)).status, 200);
    let rejectSend;
    messaging = { send: () => new Promise((resolve, reject) => { rejectSend = () => reject(Object.assign(new Error('SECRET_TOKEN_NEVER_LOGGED'), { code: 'messaging/internal-error' })); }) };
    const complaint = await request('POST', '/resident/complaints', { title: 'Actual private repair', description: 'The lock needs repair.', category: 'Maintenance' }, residentToken);
    assert.equal(complaint.status, 201); assert.ok(await Complaint.exists({ _id: complaint.data.id }));
    for (let index = 0; !rejectSend && index < 100; index++) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(typeof rejectSend, 'function'); rejectSend(); await waitForPushDeliveries();
    const entry = await Notification.findOne({ relatedEntityId: complaint.data.id }); assert.ok(entry); assert.equal((await PushDelivery.findOne({ notification: entry._id })).status, 'failed');
    const calls = []; messaging = { send: async (payload) => { calls.push(payload); throw Object.assign(new Error('SECRET_TOKEN_NEVER_LOGGED'), { code: 'messaging/internal-error' }); } };
    const today = todayIST(), rent = await RentRecord.create({ owner: owner._id, resident: resident._id, room: room._id, month: today.slice(0, 7), amountDue: 4000, dueDate: new Date() });
    const claim = await request('POST', '/resident/payments/claims', { billType: 'Rent', billId: rent._id, amount: 100, utr: 'FCMTESTCLAIM123', paymentDate: today }, residentToken); assert.equal(claim.status, 201);
    const approved = await request('POST', `/payment-claims/${claim.data.id}/approve`, { verifiedReceipt: true }); assert.equal(approved.status, 200);
    await waitForPushDeliveries();
    const paid = await RentRecord.findById(rent._id); assert.equal(paid.balance, 3900); assert.equal(paid.payments.filter((payment) => payment.requestId === 'claim-' + claim.data.id).length, 1);
    assert.ok(calls.length >= 2); assert.equal((await request('GET', '/notifications', undefined, residentToken)).status, 200); await waitForPushDeliveries();
    messaging = null;
    const before = await Notification.countDocuments();
    assert.equal((await request('POST', '/resident/complaints', { title: 'Forbidden room', description: 'Must fail', category: 'Water', room: foreignRoom._id }, residentToken)).status, 404);
    assert.equal(await Notification.countDocuments(), before);
  });
});
