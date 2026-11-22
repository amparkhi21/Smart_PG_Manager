import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionHome, ownerReturnPath } from './authRouting.js';
import { backAction } from '../native/backNavigation.js';
import { RESIDENT_NAV } from './residentNav.js';

test('session landing depends on the authenticated role and first-login state', () => {
  assert.equal(sessionHome({ owner: { id: 'legacy-owner' } }), '/');
  assert.equal(sessionHome({ resident: { passwordChangeRequired: true } }), '/resident/change-password');
  assert.equal(sessionHome({ resident: { passwordChangeRequired: false } }), '/resident/dashboard');
});
test('owner return routes keep bookmarks and reject cross-role or external destinations', () => {
  for (const path of ['/rooms', '/residents/123', '/rent', '/attendance', '/']) assert.equal(ownerReturnPath(path), path);
  for (const path of ['/resident/dashboard', '/resident/change-password', '/owner/login', '//evil.test', 'https://evil.test', '/login', undefined]) assert.equal(ownerReturnPath(path), '/');
});
test('Android back handles resident roots, deep links and owner aliases', () => {
  for (const path of ['/owner/login', '/resident/login', '/resident/dashboard', '/resident/change-password']) assert.equal(backAction(path, 3), 'minimize');
  assert.equal(backAction('/resident/profile', 0), 'resident-home');
  assert.equal(backAction('/resident/profile', 2), 'back');
  assert.equal(backAction('/owner/register', 0), 'owner-login');
});
test('future resident modules have no interactive route until implemented', () => {
  assert.equal(RESIDENT_NAV.length, 13);
  assert.deepEqual(RESIDENT_NAV.filter((item) => item.to).map((item) => item.label), ['Dashboard', 'My Room', 'Room Availability', 'My Requests', 'Mess Menu', 'Community', 'My Bills & Payments', 'Notice Board', 'Emergency Contacts', 'Notifications', 'My Profile', 'Settings']);
  assert.equal(RESIDENT_NAV.filter((item) => !item.to).length, 1);
});
