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
import RentRecord from '../../server/src/models/RentRecord.js';
import Attendance from '../../server/src/models/Attendance.js';
import ElectricityBill from '../../server/src/models/ElectricityBill.js';
import RoomChangeRequest from '../../server/src/models/RoomChangeRequest.js';
import generateToken from '../../server/src/utils/generateToken.js';

const runningUi = process.env.RESIDENT_BED_RUNNING_UI === '1';
const uiOrigin = runningUi ? 'http://localhost:5173' : 'http://127.0.0.1:4181';
const personalPassword = 'RiyaPersonal123!', temporaryPassword = 'NewTemporary123!';
let database, apiServer, vite, apiOrigin, browserApiOrigin, owner, ownerToken, riya, legacyRoom, newRoom, destination;
let originalSecret, historyBefore, riyaBefore;
const history = async () => ({
  rent: await RentRecord.collection.find({}).toArray(), attendance: await Attendance.collection.find({}).toArray(),
  bills: await ElectricityBill.collection.find({}).toArray(), requests: await RoomChangeRequest.collection.find({}).toArray(),
});

test.beforeAll(async () => {
  test.setTimeout(120000);
  originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'isolated-real-browser-bed-secret-'.repeat(3);
  // Never load .env, server.js, seed.js, or a supplied database URI.
  database = await MongoMemoryReplSet.create({
    binary: { version: '8.0.17', downloadDir: fileURLToPath(new URL('../../tmp/mongodb-binaries/', import.meta.url)) },
    replSet: { count: 1 },
  });
  await mongoose.connect(database.getUri(), { dbName: `browser_beds_${randomUUID().replaceAll('-', '')}` });
  await Promise.all([Owner.init(), Room.init(), Resident.init(), RentRecord.init(), Attendance.init(), ElectricityBill.init(), RoomChangeRequest.init()]);
  owner = await Owner.create({ name: 'Isolated Owner', email: 'owner@real-bed.test', password: 'OwnerPassword123!',
    pgName: 'Isolated Bed Hostel', address: '12 Test Road' });
  ownerToken = generateToken(owner._id);
  [legacyRoom, newRoom, destination] = await Room.create([
    { owner: owner._id, roomNumber: '301', capacity: 1, monthlyRent: 5000 },
    { owner: owner._id, roomNumber: '302', capacity: 3, monthlyRent: 6500 },
    { owner: owner._id, roomNumber: '303', capacity: 2, monthlyRent: 7500, bedNumbers: ['B1', 'B2'] },
  ]);
  riya = await Resident.create({ owner: owner._id, room: legacyRoom._id, fullName: 'Riya', phone: '9876543210',
    monthlyRent: 4500, joiningDate: new Date('2025-01-05'), passwordHash: await bcrypt.hash(personalPassword, 4),
    loginEnabled: true, accountStatus: 'active', passwordChangeRequired: false,
    emergencyContact: { name: 'Parent', phone: '9876543299' } });
  await RentRecord.create({ owner: owner._id, resident: riya._id, room: legacyRoom._id, month: '2026-11', amountDue: 4500,
    dueDate: new Date('2026-11-05'), payments: [{ amount: 1000, method: 'Cash' }] });
  await Attendance.create({ owner: owner._id, resident: riya._id, room: legacyRoom._id, date: '2026-11-01', status: 'Present' });
  await ElectricityBill.create({ owner: owner._id, room: legacyRoom._id, month: '2026-11', previousReading: 0,
    currentReading: 100, ratePerUnit: 8, dueDate: new Date('2026-11-05'), payments: [{ amount: 100 }] });
  riyaBefore = await Resident.findById(riya._id).select('+passwordHash').lean();
  historyBefore = await history();
  apiServer = createApp({ NODE_ENV: 'development', CLIENT_URL: uiOrigin }).listen(0, '127.0.0.1');
  await new Promise((resolve) => apiServer.once('listening', resolve));
  apiOrigin = `http://127.0.0.1:${apiServer.address().port}`;
  browserApiOrigin = runningUi ? 'http://localhost:5000' : apiOrigin;
  if (runningUi) {
    const response = await fetch(`${uiOrigin}/src/api/client.js`);
    const source = await response.text();
    if (!response.ok || !source.includes('http://localhost:5000/api')) throw new Error('Unexpected running frontend API configuration');
    return;
  }
  const output = fileURLToPath(new URL('../../tmp/resident-browser-dist/', import.meta.url));
  const frontend = {
    root: fileURLToPath(new URL('../', import.meta.url)), configFile: false, envFile: false,
    plugins: [react(), tailwindcss()],
    mode: 'test', logLevel: 'warn',
    define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify(`${apiOrigin}/api`) },
    build: { outDir: output, emptyOutDir: true },
    preview: { host: '127.0.0.1', port: 4181, strictPort: true },
  };
  if (!output.startsWith(fileURLToPath(new URL('../../tmp/', import.meta.url)))) throw new Error('Unsafe test build path');
  // Build once before opening the browser, so dev transforms cannot block the API/test worker.
  await build(frontend);
  vite = await preview(frontend);
});

test.afterAll(async () => {
  if (vite) await new Promise((resolve) => { vite.httpServer.close(resolve); vite.httpServer.closeAllConnections(); });
  if (apiServer) await new Promise((resolve) => { apiServer.close(resolve); apiServer.closeAllConnections(); });
  await mongoose.disconnect(); await database?.stop();
  if (originalSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = originalSecret;
});

async function isolateContext(context) {
  // The running Vite frontend stays unchanged. Proxy its API traffic to the
  // real disposable server; never transmit a request to the user's Atlas API.
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (runningUi && url.origin === browserApiOrigin && url.pathname.startsWith('/api/')) {
      return route.fetch({ url: `${apiOrigin}${url.pathname}${url.search}`, maxRedirects: 0 })
        .then((response) => route.fulfill({ response }))
        .catch(() => route.abort().catch(() => {}));
    }
    return url.origin === uiOrigin || url.origin === apiOrigin ? route.continue() : route.abort();
  });
}

test.beforeEach(async ({ context, page }) => {
  await isolateContext(context);
  await page.addInitScript((token) => localStorage.setItem('pg_token', token), ownerToken);
});

async function save(page, dialog, method, path) {
  const response = page.waitForResponse((res) => res.url() === `${browserApiOrigin}/api${path}` && res.request().method() === method, { timeout: 90000 });
  await dialog.getByRole('button', { name: method === 'POST' ? 'Add resident' : 'Save changes', exact: true }).click();
  const result = await response;
  expect(result.ok(), JSON.stringify(await result.json())).toBe(true);
  await expect(dialog).toHaveCount(0);
  return result.request().postDataJSON();
}

async function configure(page, dialog, number, labels) {
  const beds = dialog.getByRole('group', { name: `Create beds for room ${number}`, exact: true });
  const edit = dialog.getByRole('button', { name: 'Edit bed labels', exact: true });
  await expect.poll(async () => Boolean(await beds.count() || await edit.count())).toBe(true);
  if (!await beds.count()) await edit.click();
  for (const [index, label] of labels.entries()) await beds.getByLabel(`Bed label ${index + 1}`, { exact: true }).fill(label);
  const room = await Room.findOne({ owner: owner._id, roomNumber: number });
  const response = page.waitForResponse((res) => res.url() === `${browserApiOrigin}/api/rooms/${room._id}` && res.request().method() === 'PUT');
  await beds.getByRole('button', { name: /Create Bed B1|Create Beds|Save bed labels/, exact: true }).click();
  const saved = await response;
  expect(saved.ok(), JSON.stringify(await saved.json())).toBe(true);
  expect(saved.request().postDataJSON()).toEqual({ bedNumbers: labels });
  expect((await Room.findById(room._id).lean()).bedNumbers).toEqual(labels);
}

async function checkReload(page, name, roomId, bed) {
  await page.reload();
  await page.getByRole('button', { name: `Edit ${name}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: `Edit ${name}`, exact: true });
  await expect(dialog.getByLabel('Room Number', { exact: true })).toHaveValue(String(roomId));
  await expect(dialog.getByLabel('Bed Number', { exact: true })).toHaveValue(bed);
  return dialog;
}

async function residentLogin(page, number, bed, password) {
  await page.goto(`${uiOrigin}/resident/login`);
  await page.getByLabel('Hostel / PG Name', { exact: true }).fill(owner.pgName);
  const hostels = page.waitForResponse((res) => res.url().includes('/api/auth/resident/hostels') && res.ok());
  await page.getByLabel('Hostel / PG Name', { exact: true }).press('Tab'); await hostels;
  await page.getByLabel('Room Number', { exact: true }).fill(number);
  await page.getByLabel('Bed Number', { exact: true }).fill(bed);
  await page.getByLabel('Resident Password', { exact: true }).fill(password);
  const response = page.waitForResponse((res) => res.url() === `${browserApiOrigin}/api/auth/resident/login`);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  const result = await response; expect(result.ok(), JSON.stringify(await result.json())).toBe(true);
}

test('4: Riya can save contact details in her full room before any beds are configured', async ({ page }) => {
  await page.goto(`${uiOrigin}/residents`);
  await page.getByRole('button', { name: 'Edit Riya', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit Riya', exact: true });
  await dialog.getByLabel('Email', { exact: true }).fill('riya-updated@isolated.test');
  const payload = await save(page, dialog, 'PUT', `/residents/${riya._id}`);
  expect(payload).not.toHaveProperty('bedNumber'); expect(payload).not.toHaveProperty('room');
  expect(payload).not.toHaveProperty('temporaryPassword'); expect(payload).not.toHaveProperty('loginEnabled');
  const saved = await Resident.findById(riya._id).select('+passwordHash').lean();
  expect(saved.email).toBe('riya-updated@isolated.test'); expect(saved.bedNumber).toBeUndefined();
  expect(saved.passwordHash).toBe(riyaBefore.passwordHash);
  expect(await Resident.countDocuments({ room: legacyRoom._id, status: 'Active' })).toBe(1);
  await checkReload(page, 'Riya', legacyRoom._id, '');
});

test('1/6: Riya creates and saves B1 inline in her full legacy room, then reloads without data loss', async ({ page, browser }) => {
  await page.goto(`${uiOrigin}/residents`);
  await page.getByRole('button', { name: 'Edit Riya', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit Riya', exact: true });
  await expect(dialog.getByLabel('Room Number', { exact: true })).toHaveValue(String(legacyRoom._id));
  await expect(dialog.locator(`#room option[value="${legacyRoom._id}"]`)).toBeEnabled();
  await configure(page, dialog, '301', ['B1']);
  expect((await Resident.findById(riya._id)).bedNumber).toBeUndefined();
  await dialog.getByLabel('Bed Number', { exact: true }).selectOption('B1');
  await save(page, dialog, 'PUT', `/residents/${riya._id}`);
  await checkReload(page, 'Riya', legacyRoom._id, 'B1');
  const stored = await Resident.findById(riya._id).select('+passwordHash').lean();
  for (const field of ['passwordHash', 'monthlyRent', 'phone', 'joiningDate', 'emergencyContact', 'loginEnabled', 'passwordChangeRequired']) expect(stored[field]).toEqual(riyaBefore[field]);
  expect(stored.bedNumber).toBe('B1'); expect(String(stored.room)).toBe(String(legacyRoom._id));
  expect(await Resident.countDocuments({ room: legacyRoom._id, status: 'Active' })).toBe(1);
  expect((await Room.findById(legacyRoom._id)).capacity).toBe(1);
  expect(await history()).toEqual(historyBefore);
  const guest = await browser.newContext();
  try {
    await isolateContext(guest);
    const student = await guest.newPage();
    await residentLogin(student, '301', 'B1', personalPassword);
    await expect(student).toHaveURL(`${uiOrigin}/resident/dashboard`);
  } finally { await guest.close(); }
});

test('2/3/5/6: add, reload, change bed and room, reject duplicate beds, and log in', async ({ page, browser, request }) => {
  await page.goto(`${uiOrigin}/residents`);
  await page.getByRole('button', { name: 'Add resident', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Add a resident', exact: true });
  await expect(dialog.getByLabel('Bed Number', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Bed Number', { exact: true })).toBeDisabled();
  await dialog.getByLabel('Room Number', { exact: true }).selectOption(String(newRoom._id));
  await dialog.getByLabel('Full name', { exact: true }).fill('New Resident');
  await dialog.getByLabel('Phone number', { exact: true }).fill('9876543211');
  await dialog.getByLabel('Enable resident login').check();
  await dialog.getByLabel('Temporary login password', { exact: true }).fill(temporaryPassword);
  await configure(page, dialog, '302', ['B1', 'B2', 'B3']);
  await expect(dialog.getByLabel('Full name', { exact: true })).toHaveValue('New Resident');
  await expect(dialog.getByLabel('Temporary login password', { exact: true })).toHaveValue(temporaryPassword);
  await dialog.getByLabel('Bed Number', { exact: true }).selectOption('B1');
  await save(page, dialog, 'POST', '/residents');
  const added = await Resident.findOne({ owner: owner._id, phone: '9876543211' }).select('+passwordHash').lean();
  expect(added.bedNumber).toBe('B1'); expect(String(added.room)).toBe(String(newRoom._id));
  expect(added.passwordChangeRequired).toBe(true); expect(await bcrypt.compare(temporaryPassword, added.passwordHash)).toBe(true);
  dialog = await checkReload(page, 'New Resident', newRoom._id, 'B1');
  await dialog.getByLabel('Bed Number', { exact: true }).selectOption('B2');
  await save(page, dialog, 'PUT', `/residents/${added._id}`);
  dialog = await checkReload(page, 'New Resident', newRoom._id, 'B2');
  await dialog.getByLabel('Room Number', { exact: true }).selectOption(String(destination._id));
  await dialog.getByLabel('Bed Number', { exact: true }).selectOption('B1');
  await dialog.getByLabel('Email', { exact: true }).fill('new-resident@isolated.test');
  await save(page, dialog, 'PUT', `/residents/${added._id}`);
  await checkReload(page, 'New Resident', destination._id, 'B1');
  const changed = await Resident.findById(added._id).select('+passwordHash').lean();
  expect(changed.passwordHash).toBe(added.passwordHash); expect(changed.monthlyRent).toBe(added.monthlyRent);
  expect(changed.passwordChangeRequired).toBe(true); expect(changed.email).toBe('new-resident@isolated.test');
  expect(changed.bedAssignments.map((entry) => entry.bedNumber)).toEqual(['B1', 'B2', 'B1']);
  expect(await Resident.countDocuments({ room: newRoom._id, status: 'Active' })).toBe(0);
  expect(await Resident.countDocuments({ room: destination._id, status: 'Active' })).toBe(1);
  const duplicate = await request.post(`${apiOrigin}/api/residents`, { headers: { Authorization: `Bearer ${ownerToken}` },
    data: { room: String(destination._id), bedNumber: 'b1', fullName: 'Duplicate', phone: '9876543212', loginEnabled: false } });
  expect(duplicate.status()).toBe(409);
  expect(await Resident.countDocuments({ owner: owner._id, phone: '9876543212' })).toBe(0);
  const guest = await browser.newContext();
  try {
    await isolateContext(guest);
    const student = await guest.newPage();
    await residentLogin(student, '303', 'B1', temporaryPassword);
    await expect(student).toHaveURL(`${uiOrigin}/resident/change-password`);
    await student.getByLabel('Temporary password', { exact: true }).fill(temporaryPassword);
    await student.getByLabel('New password', { exact: true }).fill('NewPersonalPassword123!');
    await student.getByLabel('Confirm new password', { exact: true }).fill('NewPersonalPassword123!');
    await student.getByRole('button', { name: 'Save password', exact: true }).click();
    await expect(student).toHaveURL(`${uiOrigin}/resident/dashboard`);
    const activated = await Resident.findById(added._id).select('+passwordHash').lean();
    expect(activated.passwordChangeRequired).toBe(false);
    expect(await bcrypt.compare('NewPersonalPassword123!', activated.passwordHash)).toBe(true);
  } finally { await guest.close(); }
});

test('inline bed creation uses committed API data when a subsequent room-list fetch is unavailable', async ({ page, context }) => {
  const room = await Room.create({ owner: owner._id, roomNumber: '304', capacity: 1, monthlyRent: 5000 });
  await page.goto(`${uiOrigin}/residents`);
  await page.getByRole('button', { name: 'Add resident', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a resident', exact: true });
  await dialog.getByLabel('Room Number', { exact: true }).selectOption(String(room._id));
  await dialog.getByLabel('Full name', { exact: true }).fill('Configuration Retry');
  await dialog.getByLabel('Phone number', { exact: true }).fill('9876543213');
  await dialog.getByLabel('Enable resident login').check();
  await dialog.getByLabel('Temporary login password', { exact: true }).fill(temporaryPassword);
  const unavailableRead = (route) => route.abort('connectionfailed');
  // Only fail a redundant read; PUTs, resident saves and all database operations remain real.
  await context.route(`${browserApiOrigin}/api/rooms`, unavailableRead);
  await configure(page, dialog, '304', ['B1']);
  expect((await Room.findById(room._id)).bedNumbers).toEqual(['B1']);
  const beds = dialog.getByLabel('Bed Number', { exact: true });
  await expect(beds).toBeEnabled(); await beds.selectOption('B1');
  await expect(dialog.getByLabel('Full name', { exact: true })).toHaveValue('Configuration Retry');
  await save(page, dialog, 'POST', '/residents');
  const created = await Resident.findOne({ owner: owner._id, phone: '9876543213' }).lean();
  expect(created.bedNumber).toBe('B1'); expect(String(created.room)).toBe(String(room._id));
  await context.unroute(`${browserApiOrigin}/api/rooms`, unavailableRead);
  await checkReload(page, 'Configuration Retry', room._id, 'B1');
  expect(await Resident.countDocuments({ room: room._id, status: 'Active' })).toBe(1);
});

test('reconfiguring beds clears a removed selection and saves the newly selected label', async ({ page }) => {
  const room = await Room.create({ owner: owner._id, roomNumber: '305', capacity: 2, monthlyRent: 5000, bedNumbers: ['B1', 'B2'] });
  await page.goto(`${uiOrigin}/residents`);
  await page.getByRole('button', { name: 'Add resident', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a resident', exact: true });
  await dialog.getByLabel('Room Number', { exact: true }).selectOption(String(room._id));
  await dialog.getByLabel('Bed Number', { exact: true }).selectOption('B1');
  await dialog.getByLabel('Full name', { exact: true }).fill('Reconfigured Resident');
  await dialog.getByLabel('Phone number', { exact: true }).fill('9876543214');
  await configure(page, dialog, '305', ['X1', 'X2']);
  await expect(dialog.getByLabel('Bed Number', { exact: true })).toHaveValue('');
  await dialog.getByRole('button', { name: 'Add resident', exact: true }).click();
  await expect(dialog.locator('#bedNumber-error')).toHaveText('Choose a bed in this room');
  expect(await Resident.countDocuments({ room: room._id })).toBe(0);
  await dialog.getByLabel('Bed Number', { exact: true }).selectOption('X2');
  await save(page, dialog, 'POST', '/residents');
  const created = await Resident.findOne({ owner: owner._id, phone: '9876543214' }).lean();
  expect(created.bedNumber).toBe('X2');
  await checkReload(page, 'Reconfigured Resident', room._id, 'X2');
});

test('a bed occupied after the form loads is rejected by the real API and the owner can recover', async ({ page, request }) => {
  const room = await Room.create({ owner: owner._id, roomNumber: '306', capacity: 2, monthlyRent: 5000, bedNumbers: ['B1', 'B2'] });
  await page.goto(`${uiOrigin}/residents`);
  await page.getByRole('button', { name: 'Add resident', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a resident', exact: true });
  await dialog.getByLabel('Room Number', { exact: true }).selectOption(String(room._id));
  await dialog.getByLabel('Bed Number', { exact: true }).selectOption('B1');
  await dialog.getByLabel('Full name', { exact: true }).fill('Stale Availability');
  await dialog.getByLabel('Phone number', { exact: true }).fill('9876543215');
  const competitor = await request.post(`${apiOrigin}/api/residents`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
    data: { room: String(room._id), bedNumber: 'B1', fullName: 'Bed Occupant', phone: '9876543216' },
  });
  expect(competitor.status()).toBe(201);
  const rejected = page.waitForResponse((res) => res.url() === `${browserApiOrigin}/api/residents` && res.request().method() === 'POST');
  await dialog.getByRole('button', { name: 'Add resident', exact: true }).click();
  expect((await rejected).status()).toBe(409);
  await expect(dialog.getByRole('alert')).toContainText('already assigned');
  expect(await Resident.countDocuments({ owner: owner._id, phone: '9876543215' })).toBe(0);
  expect(await Resident.countDocuments({ room: room._id, status: 'Active' })).toBe(1);
  await dialog.getByLabel('Bed Number', { exact: true }).selectOption('B2');
  await save(page, dialog, 'POST', '/residents');
  await checkReload(page, 'Stale Availability', room._id, 'B2');
  expect(await Resident.countDocuments({ room: room._id, status: 'Active' })).toBe(2);
});

test('inline creation shows real API errors and preserves existing legacy bed assignments', async ({ page }) => {
  const room = await Room.create({ owner: owner._id, roomNumber: '307', capacity: 2, monthlyRent: 5000 });
  const legacy = await Resident.create({ owner: owner._id, room: room._id, bedNumber: 'Existing',
    fullName: 'Legacy Occupant', phone: '9876543217', monthlyRent: 5000 });
  await page.goto(`${uiOrigin}/residents`);
  await page.getByRole('button', { name: 'Add resident', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a resident', exact: true });
  await dialog.getByLabel('Room Number', { exact: true }).selectOption(String(room._id));
  await dialog.getByLabel('Full name', { exact: true }).fill('Inline Error Recovery');
  await dialog.getByLabel('Phone number', { exact: true }).fill('9876543218');
  const beds = dialog.getByRole('group', { name: 'Create beds for room 307', exact: true });
  await expect(beds.getByLabel('Bed label 1', { exact: true })).toHaveValue('Existing');
  await expect(beds.getByLabel('Bed label 2', { exact: true })).toHaveValue('B1');
  await beds.getByLabel('Bed label 1', { exact: true }).fill('X1');
  await beds.getByLabel('Bed label 2', { exact: true }).fill('x1');
  await beds.getByRole('button', { name: 'Create Beds', exact: true }).click();
  await expect(beds.getByRole('alert')).toContainText('unique');
  await beds.getByLabel('Bed label 2', { exact: true }).fill('X2');
  const rejected = page.waitForResponse((res) => res.url() === `${browserApiOrigin}/api/rooms/${room._id}` && res.request().method() === 'PUT');
  await beds.getByRole('button', { name: 'Create Beds', exact: true }).click();
  expect((await rejected).status()).toBe(409);
  await expect(beds.getByRole('alert')).toContainText('assigned to an active resident');
  expect((await Resident.findById(legacy._id)).bedNumber).toBe('Existing');
  expect((await Room.findById(room._id)).bedNumbers).toBeUndefined();
  await expect(dialog.getByLabel('Full name', { exact: true })).toHaveValue('Inline Error Recovery');
  await configure(page, dialog, '307', ['Existing', 'B1']);
  await dialog.getByLabel('Bed Number', { exact: true }).selectOption('B1');
  await save(page, dialog, 'POST', '/residents');
  await checkReload(page, 'Inline Error Recovery', room._id, 'B1');
  expect(await Resident.countDocuments({ room: room._id, status: 'Active' })).toBe(2);
});
