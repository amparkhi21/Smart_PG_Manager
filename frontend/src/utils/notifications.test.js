import test from 'node:test';
import assert from 'node:assert/strict';
import { belongsToNotificationAccount, fetchNotificationRecord, notificationBadge, notificationIdentity, notificationPage, notificationTarget, notificationTypeLabel } from './notifications.js';

const owner = { id: '111111111111111111111111' }, resident = { id: '222222222222222222222222', pgCode: 'PG-' + owner.id.toUpperCase() };
const entityId = '333333333333333333333333';
const item = (extra = {}) => ({ id: '444444444444444444444444', recipientRole: 'resident', recipientId: resident.id, pgId: owner.id,
  type: 'complaint_response', path: '/resident/complaints', relatedEntityId: entityId, title: 'Owner response', message: 'An update', createdAt: '2026-11-21T10:00:00Z', read: false, ...extra });

test('notification identity supports real session PG codes and disables first-login or incomplete sessions', () => {
  assert.equal(notificationIdentity(owner, null).pgId, owner.id);
  assert.equal(notificationIdentity(null, resident).pgId, owner.id);
  assert.equal(notificationIdentity(null, { ...resident, pgId: owner.id }).enabled, true);
  assert.equal(notificationIdentity(null, { ...resident, passwordChangeRequired: true }).enabled, false);
  assert.equal(notificationIdentity(null, { id: resident.id }).enabled, false);
  assert.notEqual(notificationIdentity(owner, null).key, notificationIdentity(null, resident).key);
});
test('notification records must match both recipient and PG, including the account role', () => {
  const identity = notificationIdentity(null, resident);
  assert.equal(belongsToNotificationAccount(item(), identity), true);
  for (const extra of [{ recipientId: owner.id }, { pgId: entityId }, { recipientRole: 'owner' }]) assert.equal(belongsToNotificationAccount(item(extra), identity), false);
});
test('only exact type-specific application paths and valid entity IDs can be opened', () => {
  assert.equal(notificationTarget(item(), 'resident').kind, 'complaint');
  for (const path of ['https://evil.test', '//evil.test', '/resident/complaints?next=evil', '/resident/complaints#x', '/resident/complaints/', '/resident/%63omplaints', '/complaints', '/resident/payments', '/resident/../complaints', 'javascript:alert(1)', '\\evil.test', null]) assert.equal(notificationTarget(item({ path }), 'resident'), null);
  assert.equal(notificationTarget(item(), 'owner'), null);
  assert.equal(notificationTarget(item({ relatedEntityId: '../anything' }), 'resident'), null);
  assert.equal(notificationTarget(item({ type: '__proto__' }), 'resident'), null);
});
test('every backend notification type maps to the permitted owner or resident module', () => {
  const groups = [
    ['owner', '/complaints', ['complaint_created']], ['resident', '/resident/complaints', ['complaint_status_updated', 'complaint_response']],
    ['owner', '/room-change-requests', ['room_change_requested']], ['resident', '/resident/room-change-requests', ['room_change_approved', 'room_change_rejected']],
    ['owner', '/leave-requests', ['leave_requested']], ['resident', '/resident/leave-requests', ['leave_approved', 'leave_rejected']],
    ['owner', '/payment-requests', ['payment_claim_submitted']], ['resident', '/resident/payments', ['payment_approved', 'payment_rejected', 'rent_due', 'bill_due']],
    ['resident', '/resident/notices', ['notice_published']],
  ];
  for (const [role, path, types] of groups) for (const type of types) assert.equal(notificationTarget(item({ type, path }), role).path, path);
});
test('notification pages reject foreign or malformed data and sort newest first without mutating the response', () => {
  const identity = notificationIdentity(null, resident), older = item(), newer = item({ id: '555555555555555555555555', createdAt: '2026-11-21T11:00:00Z', read: true });
  const data = { notifications: [older, newer], pagination: { page: 1, totalPages: 1 } };
  assert.deepEqual(notificationPage(data, identity).notifications, [newer, older]); assert.deepEqual(data.notifications, [older, newer]);
  for (const extra of [{ pgId: entityId }, { recipientId: owner.id }, { recipientRole: 'owner' }, { createdAt: 'invalid' }, { title: {} }, { id: 'invalid' }]) assert.throws(() => notificationPage({ ...data, notifications: [item(extra)] }, identity), /could not be verified/);
  assert.throws(() => notificationPage({ notifications: [] }, identity), /could not be verified/);
});
test('notification badges cap visually without losing exact counts and types remain readable', () => {
  assert.equal(notificationBadge(8), '8'); assert.equal(notificationBadge(99), '99'); assert.equal(notificationBadge(123), '99+');
  assert.equal(notificationTypeLabel('payment_claim_submitted'), 'Payment claim submitted'); assert.equal(notificationTypeLabel(null), 'Update');
});
test('complaint and leave links use existing role-scoped detail APIs', async () => {
  const calls = [], api = { get: async (path) => { calls.push(path); return { data: { data: { id: entityId } } }; } };
  await fetchNotificationRecord(api, item(), 'resident');
  await fetchNotificationRecord(api, item({ type: 'leave_requested', path: '/leave-requests' }), 'owner');
  assert.deepEqual(calls, [`/resident/complaints/${entityId}`, `/leave-requests/${entityId}`]);
  await assert.rejects(fetchNotificationRecord(api, item({ path: '/settings' }), 'resident'), /available application link/); assert.equal(calls.length, 2);
});
test('room, payment and notice links use only supported list APIs and reject unavailable records', async () => {
  const calls = [], api = { get: async (path, config) => { calls.push([path, config.params]); return { data: { data: path === '/payment-claims' || path === '/resident/payments/claims' ? [{ id: entityId }] : { requests: [{ id: entityId }], notices: [{ id: entityId }] } } }; } };
  await fetchNotificationRecord(api, item({ type: 'room_change_approved', path: '/resident/room-change-requests' }), 'resident');
  await fetchNotificationRecord(api, item({ type: 'payment_claim_submitted', path: '/payment-requests' }), 'owner');
  await fetchNotificationRecord(api, item({ type: 'notice_published', path: '/resident/notices' }), 'resident');
  assert.deepEqual(calls, [['/resident/room-change-requests', undefined], ['/payment-claims', { limit: 100 }], ['/community/notices', undefined]]);
  await assert.rejects(fetchNotificationRecord({ get: async () => ({ data: { data: { notices: [] } } }) }, item({ type: 'notice_published', path: '/resident/notices' }), 'resident'), /no longer available/);
});
test('due reminders can open recorded bills without exposing any other resident financial records', async () => {
  const calls = [], bill = { id: entityId, billType: 'Rent' };
  const api = { get: async (path) => { calls.push(path); return { data: { data: path.endsWith('/bills') ? [] : [bill] } }; } };
  const result = await fetchNotificationRecord(api, item({ type: 'rent_due', path: '/resident/payments' }), 'resident');
  assert.equal(result.record, bill); assert.deepEqual(calls, ['/resident/payments/bills', '/resident/payments/history']);
  await assert.rejects(fetchNotificationRecord(api, item({ type: 'bill_due', path: '/resident/payments' }), 'resident'), /no longer available/);
});
