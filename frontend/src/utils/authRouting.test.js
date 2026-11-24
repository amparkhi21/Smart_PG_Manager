import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionHome, ownerReturnPath } from './authRouting.js';
import { backAction } from '../native/backNavigation.js';
import { RESIDENT_NAV } from './residentNav.js';
import { NAV, MOBILE_PRIMARY } from './nav.js';

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
test('resident navigation includes personal attendance and omits retired menus', () => {
  assert.deepEqual(RESIDENT_NAV.map((item) => item.label), ['Dashboard', 'My Room', 'Room Availability', 'My Requests', 'My Attendance', 'Mess Menu', 'Community', 'My Bills & Payments', 'Notice Board', 'My Profile', 'Settings']);
  assert.equal(RESIDENT_NAV.find((item) => item.label === 'My Attendance').to, '/resident/attendance');
  assert.equal(new Set(RESIDENT_NAV.map((item) => item.to)).size, RESIDENT_NAV.length);
});
test('owner desktop and mobile navigation keep all fifteen destinations in order without duplicates', () => {
  assert.deepEqual(NAV.map(({ label }) => label), ['Dashboard', 'Rooms', 'Residents', 'Mess Management', 'Attendance', 'Community', 'Notice Board', 'Rent Management', 'Electricity Bills', 'Requests', 'Payment History', 'Resident Contacts', 'Reports', 'Reminders', 'Settings']);
  assert.equal(new Set(NAV.map(({ to }) => to)).size, 15);
  const mobile = [...NAV.filter(({ to }) => MOBILE_PRIMARY.includes(to)), ...NAV.filter(({ to }) => !MOBILE_PRIMARY.includes(to))];
  assert.deepEqual(mobile, NAV);
});
