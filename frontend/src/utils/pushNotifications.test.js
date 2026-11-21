import test from 'node:test';
import assert from 'node:assert/strict';
import { pushPreferenceKey, validPushNotification } from './pushNotifications.js';

const identity = { enabled: true, role: 'resident', id: '222222222222222222222222', pgId: '111111111111111111111111' };
const payload = { notificationId: '444444444444444444444444', type: 'complaint_response', path: '/resident/complaints',
  relatedEntityId: '333333333333333333333333', recipientRole: 'resident', recipientId: identity.id, pgId: identity.pgId };

test('push taps require the exact authenticated account, PG and approved destination', () => {
  assert.equal(validPushNotification(payload, identity).target.path, '/resident/complaints');
  for (const change of [{ recipientId: '555555555555555555555555' }, { recipientRole: 'owner' },
    { pgId: '555555555555555555555555' }, { path: 'https://example.com' }, { notificationId: '../x' }]) {
    assert.equal(validPushNotification({ ...payload, ...change }, identity), null);
  }
  assert.equal(validPushNotification(payload, { ...identity, enabled: false }), null);
});

test('push taps accept only the existing supported notification destinations', () => {
  const supported = [
    ['owner', 'complaint_created', '/complaints'], ['owner', 'payment_claim_submitted', '/payment-requests'],
    ['owner', 'leave_requested', '/leave-requests'], ['owner', 'room_change_requested', '/room-change-requests'],
    ['resident', 'complaint_response', '/resident/complaints'], ['resident', 'payment_approved', '/resident/payments'],
    ['resident', 'leave_approved', '/resident/leave-requests'], ['resident', 'room_change_approved', '/resident/room-change-requests'],
    ['resident', 'notice_published', '/resident/notices'],
  ];
  for (const [role, type, path] of supported) {
    const account = { ...identity, role };
    const result = validPushNotification({ ...payload, recipientRole: role, type, path }, account);
    assert.equal(result.target.path, path);
  }
  assert.equal(validPushNotification({ ...payload, type: 'unknown' }, identity), null);
});

test('push preferences are isolated by authenticated role, PG and account', () => {
  assert.notEqual(pushPreferenceKey('owner:pg:owner'), pushPreferenceKey('resident:pg:resident'));
});
