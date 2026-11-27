import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { createApp } from '../src/app.js';
import Owner from '../src/models/Owner.js';
import Resident from '../src/models/Resident.js';
import Room from '../src/models/Room.js';
import Complaint from '../src/models/Complaint.js';
import ComplaintEvent from '../src/models/ComplaintEvent.js';
import RoomChangeRequest from '../src/models/RoomChangeRequest.js';
import LeaveRequest, { LeaveScheduleLock } from '../src/models/LeaveRequest.js';
import PaymentClaim from '../src/models/PaymentClaim.js';
import Notice from '../src/models/Notice.js';
import Notification from '../src/models/Notification.js';
import RentRecord from '../src/models/RentRecord.js';
import ElectricityBill from '../src/models/ElectricityBill.js';
import Attendance from '../src/models/Attendance.js';
import CommunityMessage from '../src/models/CommunityMessage.js';
import { notificationEvent } from '../src/models/notificationOutbox.js';
import { deliverPendingNotifications, prepareDueReminder } from '../src/services/notificationDeliveryService.js';
import generateToken, { generateResidentToken } from '../src/utils/generateToken.js';
import { todayIST } from '../src/utils/dates.js';
import { appendPaymentAtomically } from '../src/services/billingService.js';

test('notification events select fixed roles and internal paths; no arbitrary navigation targets', () => {
  const id = new mongoose.Types.ObjectId();
  assert.equal(notificationEvent('complaint_created', id, id, 'Title', 'Message').recipientRole, 'owner');
  assert.equal(notificationEvent('payment_approved', id, id, 'Title', 'Message').path, '/resident/payments');
  assert.equal(notificationEvent('notice_published', id, [], 'Title', 'Message'), null);
  assert.throws(() => notificationEvent('unknown', id, id, 'Title', 'Message'), /Unsupported/);
});

test('Phase 8A private notifications, business events and durable retry on disposable MongoDB', { timeout: 180000 }, async (t) => {
  const previousSecret = process.env.JWT_SECRET; process.env.JWT_SECRET = 'phase8a-disposable-secret-'.repeat(3);
  let mongo, server;
  t.after(async () => {
    if (server) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    await mongoose.disconnect(); await mongo?.stop();
    if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
  });
  // No dotenv, production connection, seed scripts, external scheduler or frontend server.
  mongo = await MongoMemoryReplSet.create({ binary: { version: '8.0.17', downloadDir: fileURLToPath(new URL('../../tmp/mongodb-binaries/', import.meta.url)) }, replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri(), { dbName: 'phase8a_test_' + randomUUID().replaceAll('-', '') });
  await Promise.all([Owner, Resident, Room, Complaint, ComplaintEvent, RoomChangeRequest, LeaveRequest, LeaveScheduleLock,
    PaymentClaim, Notice, Notification, RentRecord, ElectricityBill, Attendance, CommunityMessage].map((Model) => Model.init()));
  const [owner, otherOwner] = await Owner.create([
    { name: 'Owner A', email: 'a@phase8a.test', password: 'OwnerPass123!', pgName: 'Same PG Name' },
    { name: 'Owner B', email: 'b@phase8a.test', password: 'OwnerPass123!', pgName: 'Same PG Name' },
  ]);
  const [room, target, otherRoom] = await Room.create([
    { owner: owner._id, roomNumber: '101', capacity: 20, monthlyRent: 4000 },
    { owner: owner._id, roomNumber: '202', capacity: 2, monthlyRent: 5000 },
    { owner: otherOwner._id, roomNumber: '101', capacity: 10, monthlyRent: 4000 },
  ]);
  const passwordHash = await bcrypt.hash('ResidentPass123!', 4), authFields = { passwordHash, loginEnabled: true, accountStatus: 'active', monthlyRent: 4000 };
  const [resident, peer, foreign, disabled, departed, firstLogin] = await Resident.create([
    { ...authFields, owner: owner._id, room: room._id, fullName: 'Resident A', phone: '9800000000' },
    { ...authFields, owner: owner._id, room: room._id, fullName: 'Resident Peer', phone: '9800000001' },
    { ...authFields, owner: otherOwner._id, room: otherRoom._id, fullName: 'Foreign Resident', phone: '9800000000' },
    { ...authFields, owner: owner._id, room: room._id, fullName: 'Disabled Resident', phone: '9800000002', loginEnabled: false, accountStatus: 'disabled' },
    { ...authFields, owner: owner._id, room: room._id, fullName: 'Departed Resident', phone: '9800000003', status: 'Left' },
    { ...authFields, owner: owner._id, room: room._id, fullName: 'First Login Resident', phone: '9800000004', passwordChangeRequired: true },
  ]);
  const ownerToken = generateToken(owner._id), otherToken = generateToken(otherOwner._id), residentToken = generateResidentToken(resident), peerToken = generateResidentToken(peer), foreignToken = generateResidentToken(foreign);
  const today = todayIST(), month = today.slice(0, 7), date = (offset) => { const value = new Date(today + 'T12:00:00Z'); value.setUTCDate(value.getUTCDate() + offset); return value.toISOString().slice(0, 10); };
  const rent = await RentRecord.create({ owner: owner._id, resident: resident._id, room: room._id, month, amountDue: 4000, dueDate: new Date(date(5) + 'T23:59:59+05:30'), payments: [{ amount: 1000, method: 'Cash' }] });
  const electricity = await ElectricityBill.create({ owner: owner._id, room: room._id, month, previousReading: 0, currentReading: 100, ratePerUnit: 8, dueDate: rent.dueDate });
  await Attendance.create({ owner: owner._id, resident: resident._id, room: room._id, date: today, status: 'Present' });
  await CommunityMessage.create({ owner: owner._id, sender: owner._id, senderRole: 'owner', senderName: owner.name, text: 'Existing public greeting' });
  const preserved = async () => ({ attendance: await Attendance.collection.find({}).toArray(), community: await CommunityMessage.collection.find({}).toArray(), electricity: await ElectricityBill.collection.find({}).toArray() });
  const before = await preserved();
  server = createApp({ NODE_ENV: 'development' }).listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/api';
  const request = async (method, path, body, token = residentToken) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) }, ...(body !== undefined && { body: JSON.stringify(body) }) });
    const result = await response.json();
    assert.doesNotMatch(JSON.stringify(result), /passwordHash|sessionVersion|normalizedPhone|notificationEvents|eventKey|@phase8a\.test/);
    return { status: response.status, ...result };
  };
  const list = async (token = residentToken, query = '') => {
    const result = await request('GET', '/notifications' + query, undefined, token); assert.equal(result.status, 200); return result.data;
  };
  const count = async (token = residentToken) => { const result = await request('GET', '/notifications/unread-count', undefined, token); assert.equal(result.status, 200); return result.data.unreadCount; };
  const notificationsFor = (entityId, type) => Notification.find({ relatedEntityId: entityId, ...(type && { type }) }).lean();
  const complaintDraft = { title: 'Bathroom repair', description: 'PRIVATE complaint details', category: 'Maintenance', priority: 'High' };
  let complaint, foreignComplaint, roomRequest, rejectedRoomRequest, leave, rejectedLeave, payment, rejectedPayment;

  await t.test('new complaints notify only their authenticated PG owner, with audit-backed entity links', async () => {
    assert.equal(await count(ownerToken), 0);
    const result = await request('POST', '/resident/complaints', { ...complaintDraft, owner: otherOwner._id, resident: peer._id, recipient: otherOwner._id });
    assert.equal(result.status, 201); complaint = result.data;
    const created = await notificationsFor(complaint.id, 'complaint_created'); assert.equal(created.length, 1);
    assert.equal(String(created[0].owner), String(owner._id)); assert.equal(String(created[0].recipient), String(owner._id)); assert.equal(created[0].recipientRole, 'owner');
    assert.equal(created[0].path, '/requests'); assert.equal(created[0].readAt, null); assert.ok(created[0].createdAt instanceof Date);
    assert.equal(await count(residentToken), 0); assert.equal(await count(peerToken), 0); assert.equal(await count(otherToken), 0);
    const foreignResult = await request('POST', '/resident/complaints', { ...complaintDraft, title: 'FOREIGN PRIVATE COMPLAINT' }, foreignToken);
    assert.equal(foreignResult.status, 201); foreignComplaint = foreignResult.data;
    assert.equal(await count(otherToken), 1); assert.doesNotMatch(JSON.stringify(await list(ownerToken)), /FOREIGN PRIVATE COMPLAINT/);
  });
  await t.test('complaint status changes and owner responses notify only the complainant', async () => {
    const status = await request('PATCH', `/complaints/${complaint.id}/status`, { status: 'In Progress' }, ownerToken); assert.equal(status.status, 200);
    const response = await request('POST', `/complaints/${complaint.id}/comments`, { text: 'A technician will visit today.' }, ownerToken); assert.equal(response.status, 201);
    assert.deepEqual((await list()).notifications.map((item) => item.type).sort(), ['complaint_response', 'complaint_status_updated']);
    assert.equal(await count(peerToken), 0); assert.equal(await count(foreignToken), 0);
    const total = await Notification.countDocuments();
    assert.equal((await request('PATCH', `/complaints/${complaint.id}/status`, { status: 'In Progress' }, ownerToken)).status, 409);
    assert.equal((await request('POST', `/complaints/${complaint.id}/comments`, { text: 'Not my resident' }, otherToken)).status, 404);
    assert.equal((await request('POST', `/resident/complaints/${complaint.id}/comments`, { text: 'Resident follow-up' })).status, 201);
    assert.equal(await Notification.countDocuments(), total);
  });
  await t.test('room requests and idempotent approval create one notification per event without changing rent', async () => {
    const result = await request('POST', '/resident/room-change-requests', { targetRoom: target._id, reason: 'Closer to the study area' }); assert.equal(result.status, 201); roomRequest = result.data;
    assert.equal((await notificationsFor(roomRequest.id, 'room_change_requested')).length, 1);
    assert.equal((await request('POST', '/resident/room-change-requests', { targetRoom: target._id, reason: 'Duplicate pending request' })).status, 409);
    assert.equal((await request('PATCH', `/room-change-requests/${roomRequest.id}/decision`, { decision: 'Approved' }, otherToken)).status, 404);
    for (let index = 0; index < 2; index++) assert.equal((await request('PATCH', `/room-change-requests/${roomRequest.id}/decision`, { decision: 'Approved' }, ownerToken)).status, 200);
    assert.equal((await notificationsFor(roomRequest.id, 'room_change_approved')).length, 1);
    const updated = await Resident.findById(resident._id); assert.equal(String(updated.room), String(target._id)); assert.equal(updated.monthlyRent, 4000);
    assert.equal((await RentRecord.findById(rent._id)).amountDue, 4000); assert.equal((await RentRecord.findById(rent._id)).balance, 3000);
  });
  await t.test('failed room approvals emit nothing; actual rejection notifies the correct resident', async () => {
    const result = await request('POST', '/resident/room-change-requests', { targetRoom: target._id, reason: 'A quieter available room' }, peerToken); assert.equal(result.status, 201); rejectedRoomRequest = result.data;
    await Room.updateOne({ _id: target._id }, { $set: { capacity: 1 } });
    assert.equal((await request('PATCH', `/room-change-requests/${rejectedRoomRequest.id}/decision`, { decision: 'Approved' }, ownerToken)).status, 409);
    assert.equal((await notificationsFor(rejectedRoomRequest.id, 'room_change_approved')).length, 0);
    assert.equal((await request('PATCH', `/room-change-requests/${rejectedRoomRequest.id}/decision`, { decision: 'Rejected', decisionNote: 'No longer vacant' }, ownerToken)).status, 200);
    const rejected = await notificationsFor(rejectedRoomRequest.id, 'room_change_rejected'); assert.equal(rejected.length, 1); assert.equal(String(rejected[0].recipient), String(peer._id));
    assert.equal(String((await Resident.findById(peer._id)).room), String(room._id));
  });
  await t.test('leave creation, approval and rejection reuse finalized history and reject duplicate decisions', async () => {
    const submit = async (from, token) => request('POST', '/resident/leave-requests', { fromDate: date(from), toDate: date(from + 1), reason: 'Visiting family' }, token);
    const result = await submit(2, residentToken); assert.equal(result.status, 201); leave = result.data;
    assert.equal((await notificationsFor(leave.id, 'leave_requested')).length, 1);
    assert.equal((await submit(2, residentToken)).status, 409);
    assert.equal((await request('PATCH', `/leave-requests/${leave.id}/decision`, { decision: 'Approved' }, ownerToken)).status, 200);
    assert.equal((await request('PATCH', `/leave-requests/${leave.id}/decision`, { decision: 'Approved' }, ownerToken)).status, 409);
    assert.equal((await notificationsFor(leave.id, 'leave_approved')).length, 1);
    const peerLeave = await submit(5, peerToken); assert.equal(peerLeave.status, 201); rejectedLeave = peerLeave.data;
    assert.equal((await request('PATCH', `/leave-requests/${rejectedLeave.id}/decision`, { decision: 'Rejected', response: 'Please choose another date' }, ownerToken)).status, 200);
    assert.equal((await notificationsFor(rejectedLeave.id, 'leave_rejected')).length, 1);
    const cancelled = await submit(9, residentToken); assert.equal(cancelled.status, 201);
    assert.equal((await request('POST', `/resident/leave-requests/${cancelled.data.id}/cancel`, {})).status, 200);
    assert.equal((await request('PATCH', `/leave-requests/${cancelled.data.id}/decision`, { decision: 'Approved' }, ownerToken)).status, 409);
    assert.equal((await notificationsFor(cancelled.data.id)).length, 1);
  });
  await t.test('payment claims notify owners; only verified approval notifies residents and records one payment', async () => {
    const draft = { billType: 'Rent', billId: rent._id, amount: 100, utr: 'PHASE8APAY0001', paymentDate: today };
    const result = await request('POST', '/resident/payments/claims', draft); assert.equal(result.status, 201); payment = result.data;
    assert.equal((await notificationsFor(payment.id, 'payment_claim_submitted')).length, 1);
    assert.equal((await request('POST', '/resident/payments/claims', draft)).status, 409);
    assert.equal((await RentRecord.findById(rent._id)).balance, 3000);
    assert.equal((await request('POST', `/payment-claims/${payment.id}/approve`, { verifiedReceipt: false }, ownerToken)).status, 400);
    assert.equal((await request('POST', `/payment-claims/${payment.id}/approve`, { verifiedReceipt: true }, otherToken)).status, 404);
    assert.equal((await notificationsFor(payment.id, 'payment_approved')).length, 0);
    assert.equal((await request('POST', `/payment-claims/${payment.id}/approve`, { verifiedReceipt: true }, ownerToken)).status, 200);
    assert.equal((await request('POST', `/payment-claims/${payment.id}/approve`, { verifiedReceipt: true }, ownerToken)).status, 409);
    assert.equal((await notificationsFor(payment.id, 'payment_approved')).length, 1);
    const paid = await RentRecord.findById(rent._id); assert.equal(paid.balance, 2900); assert.equal(paid.payments.filter((item) => item.requestId === 'claim-' + payment.id).length, 1);
    const second = await request('POST', '/resident/payments/claims', { ...draft, utr: 'PHASE8APAY0002', amount: 200 }); assert.equal(second.status, 201); rejectedPayment = second.data;
    assert.equal((await request('POST', `/payment-claims/${rejectedPayment.id}/reject`, { reason: 'Not received' }, ownerToken)).status, 200);
    assert.equal((await request('POST', `/payment-claims/${rejectedPayment.id}/reject`, {}, ownerToken)).status, 409);
    assert.equal((await notificationsFor(rejectedPayment.id, 'payment_rejected')).length, 1); assert.equal((await RentRecord.findById(rent._id)).balance, 2900);
    const third = await request('POST', '/resident/payments/claims', { ...draft, utr: 'PHASE8APAY0003' }); assert.equal(third.status, 201);
    await appendPaymentAtomically(RentRecord, owner._id, rent._id, { amount: 2850, method: 'Cash', requestId: 'phase8a-other-owner-payment' });
    assert.equal((await request('POST', `/payment-claims/${third.data.id}/approve`, { verifiedReceipt: true }, ownerToken)).status, 409);
    assert.equal((await notificationsFor(third.data.id, 'payment_approved')).length, 0); assert.equal((await RentRecord.findById(rent._id)).balance, 50);
  });
  await t.test('new notices notify the fixed active PG audience, without duplicates on edit or pin', async () => {
    const result = await request('POST', '/community/notices', { title: 'Water maintenance', body: 'Water will be restored by noon.' }, ownerToken); assert.equal(result.status, 201);
    const notice = result.data, entries = await notificationsFor(notice.id, 'notice_published');
    assert.deepEqual(entries.map((item) => String(item.recipient)).sort(), [resident, peer, firstLogin].map((item) => String(item._id)).sort());
    for (const item of entries) { assert.equal(item.recipientRole, 'resident'); assert.equal(String(item.owner), String(owner._id)); }
    assert.equal((await request('PUT', `/community/notices/${notice.id}`, { title: 'Updated maintenance', body: 'Water is restored.' }, ownerToken)).status, 200);
    assert.equal((await request('PATCH', `/community/notices/${notice.id}/pin`, { pinned: true }, ownerToken)).status, 200);
    assert.equal((await notificationsFor(notice.id)).length, 3);
    assert.equal((await request('POST', '/community/notices', { title: 'Resident cannot publish', body: 'Forbidden' })).status, 403);
    const expired = await request('POST', '/community/notices', { title: 'Expired notice', body: 'Old announcement', expiresAt: '2000-01-01T00:00:00Z' }, ownerToken); assert.equal(expired.status, 201);
    assert.equal((await notificationsFor(expired.data.id)).length, 0);
  });
  await t.test('rolled-back audits never publish events or retain complaints after a failed transaction', async () => {
    const beforeComplaints = await Complaint.countDocuments(), beforeEvents = await ComplaintEvent.countDocuments(), beforeNotifications = await Notification.countDocuments();
    const save = ComplaintEvent.prototype.save;
    const failure = t.mock.method(ComplaintEvent.prototype, 'save', async function (options) { await save.call(this, options); throw new Error('Injected audit failure'); });
    try { assert.equal((await request('POST', '/resident/complaints', { ...complaintDraft, title: 'Aborted private complaint' })).status, 500); }
    finally { failure.mock.restore(); }
    await deliverPendingNotifications(owner._id);
    assert.equal(await Complaint.countDocuments(), beforeComplaints); assert.equal(await ComplaintEvent.countDocuments(), beforeEvents); assert.equal(await Notification.countDocuments(), beforeNotifications);
  });
  await t.test('delivery failures preserve successful business actions and retry from durable audit data', async () => {
    const failure = t.mock.method(Notification, 'bulkWrite', async () => { throw new Error('Injected notification storage outage'); });
    let result;
    try { result = await request('POST', '/resident/complaints', { ...complaintDraft, title: 'Deferred delivery complaint' }); assert.equal(result.status, 201); }
    finally { failure.mock.restore(); }
    assert.ok(await Complaint.exists({ _id: result.data.id })); assert.equal((await notificationsFor(result.data.id)).length, 0);
    const pending = await ComplaintEvent.findOne({ complaint: result.data.id }).select('+notificationEvents').lean(); assert.equal(pending.notificationEvents.length, 1);
    await list(ownerToken);
    assert.equal((await notificationsFor(result.data.id, 'complaint_created')).length, 1);
    const recovered = await ComplaintEvent.findById(pending._id).select('+notificationEvents').lean(); assert.equal(recovered.notificationEvents.length, 0);
  });
  await t.test('partial fanout and concurrent retries do not duplicate notifications or reset read timestamps', async () => {
    const bulkWrite = Notification.bulkWrite.bind(Notification);
    const failure = t.mock.method(Notification, 'bulkWrite', async (operations, options) => { await bulkWrite(operations.slice(0, 1), options); throw new Error('Injected partial fanout'); });
    let result;
    try { result = await request('POST', '/community/notices', { title: 'Deferred PG announcement', body: 'Retry-safe delivery.' }, ownerToken); assert.equal(result.status, 201); }
    finally { failure.mock.restore(); }
    let rows = await notificationsFor(result.data.id); assert.equal(rows.length, 1);
    const first = rows[0], readAt = new Date(); await Notification.updateOne({ _id: first._id }, { $set: { readAt } });
    // Later joiners were not in the publishing audience and receive no historical alert.
    const late = await Resident.create({ ...authFields, owner: owner._id, room: room._id, fullName: 'Later Resident', phone: '9800000005' });
    await Promise.all([deliverPendingNotifications(owner._id), deliverPendingNotifications(owner._id), deliverPendingNotifications(owner._id)]);
    rows = await notificationsFor(result.data.id); assert.equal(rows.length, 3); assert.equal(new Set(rows.map((item) => String(item.recipient))).size, 3);
    assert.ok(!rows.some((item) => String(item.recipient) === String(late._id)));
    const original = await Notification.findById(first._id); assert.equal(original.readAt.getTime(), readAt.getTime()); assert.equal(original.createdAt.getTime(), first.createdAt.getTime());
    assert.ok(!(await Notice.findById(result.data.id)).notificationEvents);
  });
  await t.test('pagination, unread count and marking one/all read are private and idempotent', async () => {
    const mine = await list(residentToken, '?limit=2&page=1'); assert.equal(mine.notifications.length, 2); assert.ok(mine.pagination.hasMore);
    const next = await list(residentToken, '?limit=2&page=2'); assert.equal(next.notifications.length, 2);
    assert.equal(new Set([...mine.notifications, ...next.notifications].map((item) => item.id)).size, 4);
    for (const entry of [...mine.notifications, ...next.notifications]) { assert.equal(entry.recipientId, String(resident._id)); assert.equal(entry.recipientRole, 'resident'); assert.equal(entry.pgId, String(owner._id)); }
    const originalCount = await count(), id = mine.notifications.find((item) => !item.read)?.id; assert.ok(id);
    const marked = await request('PATCH', `/notifications/${id}/read`, { recipient: peer._id, owner: otherOwner._id }); assert.equal(marked.status, 200); assert.equal(marked.data.read, true);
    assert.equal(await count(), originalCount - 1);
    const again = await request('PATCH', `/notifications/${id}/read`, {}); assert.equal(again.status, 200); assert.equal(again.data.readAt, marked.data.readAt);
    const peerBefore = await count(peerToken), ownerBefore = await count(ownerToken), foreignBefore = await count(otherToken);
    const all = await request('PATCH', '/notifications/read-all?recipient=' + peer._id + '&owner=' + otherOwner._id, {}); assert.equal(all.status, 200); assert.equal(all.data.updated, originalCount - 1);
    assert.equal(await count(), 0); assert.equal((await list(residentToken, '?unread=true')).notifications.length, 0);
    assert.equal((await request('PATCH', '/notifications/read-all', {})).data.updated, 0);
    assert.equal(await count(peerToken), peerBefore); assert.equal(await count(ownerToken), ownerBefore); assert.equal(await count(otherToken), foreignBefore);
    await request('PATCH', '/notifications/read-all', {}, ownerToken); assert.equal(await count(ownerToken), 0); assert.equal(await count(otherToken), foreignBefore);
  });
  await t.test('JWT roles, inactive sessions, cross-user IDs and PG overrides cannot expose or change private notifications', async () => {
    const otherUser = (await list(peerToken)).notifications[0], otherPg = (await list(otherToken)).notifications[0]; assert.ok(otherUser && otherPg);
    for (const id of [otherUser.id, otherPg.id]) assert.equal((await request('PATCH', `/notifications/${id}/read`, {})).status, 404);
    const forged = await list(residentToken, '?owner=' + otherOwner._id + '&recipient=' + peer._id + '&recipientRole=owner');
    assert.ok(forged.notifications.every((item) => item.recipientId === String(resident._id) && item.pgId === String(owner._id)));
    assert.equal((await request('GET', '/notifications', undefined, null)).status, 401);
    assert.equal((await request('PATCH', '/notifications/read-all', {}, null)).status, 401);
    const badRole = jwt.sign({ id: String(owner._id), role: 'admin' }, process.env.JWT_SECRET);
    assert.equal((await request('GET', '/notifications', undefined, badRole)).status, 403);
    for (const [account, status] of [[disabled, 401], [departed, 401], [firstLogin, 403]]) assert.equal((await request('GET', '/notifications', undefined, generateResidentToken(account))).status, status);
    const stale = jwt.sign({ id: String(resident._id), role: 'resident', pgId: String(owner._id), version: 99 }, process.env.JWT_SECRET);
    assert.equal((await request('GET', '/notifications', undefined, stale)).status, 401);
    for (const query of ['page=0', 'page=-1', 'limit=101', 'unread=other', 'page[$ne]=1']) assert.equal((await request('GET', '/notifications?' + query)).status, 400);
    assert.equal((await request('PATCH', '/notifications/invalid/read', {})).status, 400);
    assert.equal((await request('POST', '/notifications', { recipient: peer._id, title: 'Fake message' })).status, 404);
  });
  await t.test('future due reminders use real private bills, stay hidden until available and deduplicate occurrences', async () => {
    const availableAt = new Date(Date.now() + 86400000), args = { owner: owner._id, resident: resident._id, billType: 'Rent', billId: rent._id, availableAt };
    const beforeCount = await count();
    await prepareDueReminder(args); await prepareDueReminder(args);
    const entries = await notificationsFor(rent._id, 'rent_due'); assert.equal(entries.length, 1); assert.match(entries[0].message, /₹50/);
    assert.equal(await count(), beforeCount); assert.ok(!(await list()).notifications.some((item) => item.id === String(entries[0]._id)));
    assert.equal((await request('PATCH', `/notifications/${entries[0]._id}/read`, {})).status, 404);
    await prepareDueReminder({ ...args, resident: peer._id, billType: 'Electricity', billId: electricity._id });
    const shared = await notificationsFor(electricity._id, 'bill_due'); assert.equal(shared.length, 1); assert.match(shared[0].message, /shared-room electricity/); assert.match(shared[0].message, /₹800/);
    await assert.rejects(prepareDueReminder({ ...args, resident: peer._id }), /Outstanding bill not found/);
    await assert.rejects(prepareDueReminder({ ...args, owner: otherOwner._id }), /Active resident not found/);
    await assert.rejects(prepareDueReminder({ ...args, resident: disabled._id }), /Active resident not found/);
    await assert.rejects(prepareDueReminder({ ...args, availableAt: new Date('invalid') }), /Invalid reminder/);
    assert.equal((await RentRecord.findById(rent._id)).balance, 50);
  });
  await t.test('all required event types exist and notification reads preserve attendance, chat and financial history', async () => {
    const types = await Notification.distinct('type');
    for (const type of ['complaint_created', 'complaint_status_updated', 'complaint_response', 'room_change_requested', 'room_change_approved', 'room_change_rejected',
      'leave_requested', 'leave_approved', 'leave_rejected', 'payment_claim_submitted', 'payment_approved', 'payment_rejected', 'notice_published', 'rent_due', 'bill_due']) assert.ok(types.includes(type), type);
    assert.deepEqual(await preserved(), before);
    const paid = await RentRecord.findById(rent._id); assert.equal(paid.payments.filter((item) => item.requestId === 'claim-' + payment.id).length, 1);
    assert.equal((await LeaveRequest.findById(leave.id)).history.length, 2);
    assert.equal((await Complaint.findById(complaint.id)).status, 'In Progress');
    assert.equal((await PaymentClaim.findById(payment.id)).status, 'Approved'); assert.equal((await PaymentClaim.findById(rejectedPayment.id)).status, 'Rejected');
    assert.doesNotMatch(JSON.stringify(await list()), /PRIVATE complaint details|FOREIGN PRIVATE COMPLAINT/);
  });
});
