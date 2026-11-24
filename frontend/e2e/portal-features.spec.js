import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build, preview } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import mongoose from '../../server/node_modules/mongoose/index.js';
import bcrypt from '../../server/node_modules/bcryptjs/index.js';
import { MongoMemoryReplSet } from '../../server/node_modules/mongodb-memory-server-core/lib/index.js';
import { createApp } from '../../server/src/app.js';
import Owner from '../../server/src/models/Owner.js';
import Room from '../../server/src/models/Room.js';
import Resident from '../../server/src/models/Resident.js';
import Attendance from '../../server/src/models/Attendance.js';
import EmergencyContact from '../../server/src/models/EmergencyContact.js';
import Notification from '../../server/src/models/Notification.js';
import Notice from '../../server/src/models/Notice.js';
import Complaint from '../../server/src/models/Complaint.js';
import generateToken, { generateResidentToken } from '../../server/src/utils/generateToken.js';

const uiOrigin = 'http://127.0.0.1:4183';
const labels = ['Dashboard', 'Rooms', 'Residents', 'Mess Management', 'Attendance', 'Community', 'Notice Board', 'Rent Management', 'Electricity Bills', 'Requests', 'Payment History', 'Resident Contacts', 'Reports', 'Reminders', 'Settings'];
const paths = ['/', '/rooms', '/residents', '/mess-management', '/attendance', '/community', '/notice-board', '/rent', '/electricity', '/requests', '/payments', '/emergency-contacts', '/reports', '/reminders', '/settings'];
let database, apiServer, vite, apiOrigin, owner, otherOwner, resident, roommate, room, ownerToken, otherToken, residentToken, notice, complaint, originalSecret, credentials, oldContacts;

test.beforeAll(async () => {
  test.setTimeout(180000);
  originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'isolated-portal-browser-secret-'.repeat(3);
  // Deliberately bypass local env files and every external database/service.
  database = await MongoMemoryReplSet.create({
    binary: { version: '8.0.17', downloadDir: fileURLToPath(new URL('../../tmp/mongodb-binaries/', import.meta.url)) },
    replSet: { count: 1 },
  });
  await mongoose.connect(database.getUri(), { dbName: `portal_browser_${randomUUID().replaceAll('-', '')}` });
  await Promise.all([Owner.init(), Room.init(), Resident.init(), Attendance.init(), Notification.init(), Notice.init(), Complaint.init(), EmergencyContact.init()]);
  [owner, otherOwner] = await Owner.create([
    { name: 'Portal Owner', pgName: 'Isolated Portal PG', phone: '9800000099', email: 'owner@browser-portal.test', password: 'OwnerPassword123!' },
    { name: 'Other Owner', pgName: 'Foreign PG', email: 'foreign@browser-portal.test', password: 'OwnerPassword123!' },
  ]);
  room = await Room.create({ owner: owner._id, roomNumber: '101', capacity: 4, bedNumbers: ['B1', 'B2', 'B3', 'B4'], monthlyRent: 5000 });
  const foreignRoom = await Room.create({ owner: otherOwner._id, roomNumber: '999', capacity: 1, monthlyRent: 7000 });
  const passwordHash = await bcrypt.hash('PersonalPassword123!', 4);
  resident = await Resident.create({ owner: owner._id, room: room._id, bedNumber: 'B1', fullName: 'Asha Resident', phone: '9800000001', email: 'asha@browser-portal.test', monthlyRent: 5000,
    joiningDate: new Date('2026-09-09T20:00:00Z'), emergencyContact: { name: 'Asha Parent', phone: '9800000088' }, passwordHash, loginEnabled: true, accountStatus: 'active' });
  roommate = await Resident.create({ owner: owner._id, room: room._id, fullName: 'Legacy Resident', phone: '9800000002', monthlyRent: 5000, joiningDate: new Date('2026-08-01') });
  await Resident.create({ owner: otherOwner._id, room: foreignRoom._id, fullName: 'FOREIGN PRIVATE CONTACT', phone: '9800000003', monthlyRent: 7000 });
  const attendance = (date, status, extra = {}) => ({ owner: owner._id, resident: resident._id, room: room._id, date, status, ...extra });
  await Attendance.create([attendance('2026-09-09', 'Absent'), attendance('2026-09-10', 'Present'), attendance('2026-09-12', 'Absent'),
    attendance('2026-09-15', 'Present'), attendance('2026-09-16', 'On Leave'), attendance('2026-09-11', 'Absent', { resident: roommate._id })]);
  await EmergencyContact.create({ owner: owner._id, name: 'Stored caretaker', phone: '9800000077', category: 'Caretaker' });
  oldContacts = await EmergencyContact.collection.find({}).toArray();
  notice = await Notice.create({ owner: owner._id, title: 'Saved water supply notice', body: 'Water supply resumes at noon.' });
  complaint = await Complaint.create({ owner: owner._id, resident: resident._id, room: room._id, residentName: resident.fullName,
    residentRoomNumber: room.roomNumber, category: 'Maintenance', title: 'Existing repair request', description: 'The door needs repair.' });
  const notifications = [];
  for (const role of ['owner', 'resident']) for (let index = 1; index <= 23; index++) notifications.push({
    owner: owner._id, recipientRole: role, recipient: role === 'owner' ? owner._id : resident._id,
    eventKey: `browser-${role}-${index}`, type: role === 'owner' ? 'complaint_created' : 'notice_published',
    title: `${role} update ${index}`, message: 'A saved notification.', relatedEntityId: role === 'owner' ? complaint._id : notice._id,
    path: role === 'owner' ? '/requests' : '/resident/notices', createdAt: new Date(Date.UTC(2026, 8, index)), availableAt: new Date('2026-01-01'),
  });
  await Notification.create(notifications);
  credentials = await Resident.findById(resident._id).select('+passwordHash').lean();
  ownerToken = generateToken(owner._id); otherToken = generateToken(otherOwner._id); residentToken = generateResidentToken(resident);
  apiServer = createApp({ NODE_ENV: 'development', CLIENT_URL: uiOrigin }).listen(0, '127.0.0.1');
  await new Promise((resolve) => apiServer.once('listening', resolve));
  apiOrigin = `http://127.0.0.1:${apiServer.address().port}`;
  const output = fileURLToPath(new URL('../../tmp/portal-browser-dist/', import.meta.url));
  if (!output.startsWith(fileURLToPath(new URL('../../tmp/', import.meta.url)))) throw new Error('Unsafe browser build directory');
  const config = {
    root: fileURLToPath(new URL('../', import.meta.url)), configFile: false, envFile: false, plugins: [react(), tailwindcss()],
    mode: 'test', logLevel: 'warn', define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify(`${apiOrigin}/api`) },
    build: { outDir: output, emptyOutDir: true }, preview: { host: '127.0.0.1', port: 4183, strictPort: true },
  };
  await build(config); vite = await preview(config);
});

test.afterAll(async () => {
  if (vite) await new Promise((resolve) => { vite.httpServer.close(resolve); vite.httpServer.closeAllConnections(); });
  if (apiServer) await new Promise((resolve) => { apiServer.close(resolve); apiServer.closeAllConnections(); });
  await mongoose.disconnect(); await database?.stop();
  if (originalSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = originalSecret;
});

test.beforeEach(async ({ context, page }) => {
  // Fail closed: the browser cannot reach production APIs, FCM or remote assets.
  await context.route('**/*', (route) => [uiOrigin, apiOrigin].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort());
  await page.addInitScript((token) => localStorage.setItem('pg_token', token), ownerToken);
});
const contacts = (page) => page.getByRole('list', { name: 'Resident contacts', exact: true });
const notificationPanel = (page) => page.getByRole('dialog', { name: 'Notifications', exact: true });
const noOverflow = async (page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

test('contacts search, parent edit/reload and legacy forms persist real data and preserve login', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(`${uiOrigin}/emergency-contacts`);
  await expect(page.getByRole('heading', { name: 'Resident Contacts', exact: true })).toBeVisible();
  await expect(contacts(page).getByRole('listitem')).toHaveCount(2);
  await expect(page.getByText('FOREIGN PRIVATE CONTACT', { exact: true })).toHaveCount(0);
  const row = contacts(page).getByRole('listitem').filter({ hasText: 'Asha Resident' });
  await expect(row.getByRole('link', { name: /Call Asha Resident's personal phone/ })).toHaveAttribute('href', 'tel:9800000001');
  await expect(row.getByRole('link', { name: 'asha@browser-portal.test', exact: true })).toBeVisible();
  await expect(row.getByRole('link', { name: /Call Asha Resident's parent phone/ })).toHaveAttribute('href', 'tel:9800000088');
  await row.getByRole('button', { name: /Copy Asha Resident's personal phone/ }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('9800000001');
  const search = page.getByLabel('Search resident contacts', { exact: true });
  for (const term of ['Asha', '9800000001']) { await search.fill(term); await expect(contacts(page).getByRole('listitem')).toHaveCount(1); }
  await search.fill('101'); await expect(contacts(page).getByRole('listitem')).toHaveCount(2);
  await search.fill('no such resident'); await expect(page.getByText('No matching residents', { exact: true })).toBeVisible(); await search.clear();
  await page.getByRole('button', { name: 'Edit Asha Resident', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit Asha Resident', exact: true });
  await dialog.getByLabel("Parent's Phone Number", { exact: true }).fill('bad phone');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog.getByText('Enter a valid phone number', { exact: true })).toBeVisible();
  await dialog.getByLabel("Parent's Phone Number", { exact: true }).fill('+91 (98000) 00066');
  const saved = page.waitForResponse((response) => response.url() === `${apiOrigin}/api/residents/${resident._id}` && response.request().method() === 'PUT');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click(); expect((await saved).status()).toBe(200);
  await expect(dialog).toHaveCount(0);
  await expect(row.getByRole('link', { name: /Call Asha Resident's parent phone/ })).toHaveAttribute('href', 'tel:+919800000066');
  await page.reload(); await expect(contacts(page).getByRole('listitem').filter({ hasText: 'Asha Resident' }).getByRole('link', { name: /parent phone/ })).toHaveAttribute('href', 'tel:+919800000066');
  const stored = await Resident.findById(resident._id).select('+passwordHash').lean();
  for (const key of ['passwordHash', 'normalizedPhone', 'sessionVersion', 'loginEnabled', 'accountStatus', 'room', 'bedNumber', 'joiningDate']) expect(stored[key]).toEqual(credentials[key]);
  const legacy = contacts(page).getByRole('listitem').filter({ hasText: 'Legacy Resident' }); await expect(legacy.getByText('Not provided', { exact: true })).toHaveCount(2);
  await legacy.getByRole('button', { name: 'Edit Legacy Resident', exact: true }).click();
  const legacyDialog = page.getByRole('dialog', { name: 'Edit Legacy Resident', exact: true });
  await expect(legacyDialog.getByLabel("Parent's Phone Number", { exact: true })).toHaveValue('');
  const legacySave = page.waitForResponse((response) => response.url() === `${apiOrigin}/api/residents/${roommate._id}` && response.request().method() === 'PUT');
  await legacyDialog.getByRole('button', { name: 'Save changes', exact: true }).click(); expect((await legacySave).status()).toBe(200);
  expect((await Resident.findById(roommate._id)).bedNumber).toBeUndefined();
  expect(await EmergencyContact.collection.find({}).toArray()).toEqual(oldContacts);
});

test('a different owner has only its own contacts', async ({ page }) => {
  await page.addInitScript((token) => localStorage.setItem('pg_token', token), otherToken);
  await page.goto(`${uiOrigin}/emergency-contacts`);
  await expect(contacts(page).getByRole('listitem')).toHaveCount(1);
  await expect(contacts(page).getByText('FOREIGN PRIVATE CONTACT', { exact: true })).toBeVisible();
  await expect(page.getByText('asha@browser-portal.test', { exact: true })).toHaveCount(0);
});

test('all fifteen owner sidebar links open existing pages in exact order with header bell', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${uiOrigin}/emergency-contacts`);
  const sidebar = page.locator('aside nav');
  await expect(sidebar.getByRole('link')).toHaveText(labels);
  expect(await sidebar.getByRole('link').evaluateAll((links) => links.map((link) => link.getAttribute('href')))).toEqual(paths);
  for (let index = 0; index < labels.length; index++) {
    await sidebar.getByRole('link', { name: labels[index], exact: true }).click();
    await expect(page).toHaveURL(`${uiOrigin}${paths[index]}`);
    await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();
    await expect(page.locator('main h1').first()).toBeVisible();
    await expect(page.locator('main').getByRole('button', { name: 'Try again', exact: true })).toHaveCount(0);
  }
  await expect(page.getByRole('link', { name: 'Notifications', exact: true })).toHaveCount(0);
});

test('owner mobile primary shortcuts and More keep requested order and contacts fit the screen', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 }); await page.goto(`${uiOrigin}/emergency-contacts`);
  await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible(); await noOverflow(page);
  const primary = page.getByRole('navigation', { name: 'Main navigation', exact: true });
  expect(await primary.getByRole('link').evaluateAll((links) => links.map((link) => link.getAttribute('aria-label')))).toEqual(labels.slice(0, 4));
  await primary.getByRole('button', { name: 'More', exact: true }).click();
  const more = page.getByRole('dialog', { name: 'More', exact: true }); await expect(more.getByRole('link')).toHaveText(labels.slice(4));
  expect(await more.getByRole('link').evaluateAll((links) => links.map((link) => link.getAttribute('href')))).toEqual(paths.slice(4));
  await noOverflow(page); await more.getByRole('link', { name: 'Attendance', exact: true }).click(); await expect(page).toHaveURL(`${uiOrigin}/attendance`);
  await primary.getByRole('button', { name: 'More', exact: true }).click(); await more.getByRole('link', { name: 'Resident Contacts', exact: true }).click();
  await expect(page).toHaveURL(`${uiOrigin}/emergency-contacts`); await expect(contacts(page).getByRole('listitem')).toHaveCount(2);
});

for (const role of ['owner', 'resident']) test(`${role} header supports recent/history pages, read persistence, destinations and legacy redirects`, async ({ page }) => {
  const isOwner = role === 'owner', token = isOwner ? ownerToken : residentToken;
  await page.addInitScript((value) => localStorage.setItem('pg_token', value), token);
  await page.setViewportSize(isOwner ? { width: 1440, height: 1000 } : { width: 360, height: 800 });
  await page.goto(`${uiOrigin}${isOwner ? '/emergency-contacts' : '/resident/profile'}`);
  await expect(page.getByLabel('23 unread notifications', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Notifications', exact: true }).click();
  const panel = notificationPanel(page); await expect(panel.getByRole('article')).toHaveCount(5);
  await panel.getByRole('button', { name: 'View all notifications', exact: true }).click();
  await expect(panel.getByRole('article')).toHaveCount(20); await noOverflow(page);
  await panel.getByRole('button', { name: 'Older notifications', exact: true }).click();
  await expect(panel.getByText('Page 2 of 2', { exact: true })).toBeVisible(); await expect(panel.getByRole('article')).toHaveCount(3);
  await panel.getByRole('button', { name: `Mark ${role} update 1 as read`, exact: true }).click();
  await expect(page.getByLabel('22 unread notifications', { exact: true })).toBeVisible();
  const saved = await Notification.findOne({ recipientRole: role, title: `${role} update 1` }); expect(saved.readAt).not.toBeNull();
  await panel.getByRole('button', { name: `${role} update 2`, exact: true }).click();
  const detail = page.getByRole('dialog', { name: isOwner ? 'Request details' : 'PG notice', exact: true }); await expect(detail).toBeVisible();
  if (isOwner) { await expect(detail.getByRole('heading', { name: 'Existing repair request', exact: true })).toBeVisible(); await detail.getByRole('button', { name: 'Close', exact: true }).click(); }
  else { await expect(detail.getByText('Water supply resumes at noon.', { exact: true })).toBeVisible(); await detail.getByRole('button', { name: 'Open Notice Board', exact: true }).click(); await expect(page).toHaveURL(`${uiOrigin}/resident/notices`); }
  await page.goto(`${uiOrigin}${isOwner ? '/notifications' : '/resident/notifications'}`);
  await expect(page).toHaveURL(`${uiOrigin}${isOwner ? '/' : '/resident/dashboard'}`);
  await expect(notificationPanel(page).getByRole('region', { name: 'Notification list', exact: true })).toBeVisible();
  await notificationPanel(page).getByRole('button', { name: 'Mark All as Read', exact: true }).click();
  await expect(page.getByLabel(/\d+ unread notifications/)).toHaveCount(0);
  await page.reload(); await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();
  expect(await Notification.countDocuments({ recipientRole: role })).toBe(23);
  expect(await Notification.countDocuments({ recipientRole: role, readAt: null })).toBe(0);
});

test('resident attendance shows only recorded personal dates since IST joining date and filters months', async ({ page }) => {
  await page.addInitScript((token) => localStorage.setItem('pg_token', token), residentToken);
  await page.goto(`${uiOrigin}/resident/attendance`);
  await expect(page.getByRole('heading', { name: 'My Attendance', exact: true })).toBeVisible();
  const attendanceRequest = page.waitForRequest((request) => new URL(request.url()).pathname === '/api/resident/attendance' && new URL(request.url()).searchParams.get('month') === '2026-09');
  await page.getByLabel('Attendance month', { exact: true }).fill('2026-09');
  const query = new URL((await attendanceRequest).url()).searchParams; expect([...query.keys()]).toEqual(['month']);
  await expect(page.getByText('66.67%', { exact: true })).toBeVisible();
  const records = page.getByRole('region', { name: 'Your attendance records', exact: true }); await expect(records.getByRole('listitem')).toHaveCount(4);
  expect(await records.locator('time').evaluateAll((dates) => dates.map((date) => date.getAttribute('dateTime')))).toEqual(['2026-09-10', '2026-09-12', '2026-09-15', '2026-09-16']);
  await expect(page.getByRole('button', { name: 'Previous month', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Next month', exact: true }).click(); await expect(page.getByLabel('Attendance month', { exact: true })).toHaveValue('2026-10');
  await expect(page.getByText('No attendance recorded', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Previous month', exact: true }).click(); await expect(page.getByText('66.67%', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 360, height: 800 }); await noOverflow(page);
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await expect(page.getByRole('link', { name: 'My Attendance', exact: true })).toHaveAttribute('href', '/resident/attendance');
  await expect(page.getByRole('link', { name: 'Emergency Contacts', exact: true })).toHaveCount(0); await expect(page.getByRole('link', { name: 'Notifications', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'My Profile', exact: true }).click();
  await expect(page.getByRole('link', { name: '9800000099', exact: true })).toHaveAttribute('href', 'tel:9800000099');
  await page.goto(`${uiOrigin}/resident/emergency-contacts`); await expect(page).toHaveURL(`${uiOrigin}/resident/profile`);
  expect(await Attendance.countDocuments({})).toBe(6); expect(await EmergencyContact.collection.find({}).toArray()).toEqual(oldContacts);
});
