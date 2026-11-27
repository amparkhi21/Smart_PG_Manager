import { test, expect } from '@playwright/test';

const owner = { id: '111111111111111111111111', name: 'Owner A', pgName: 'Test PG', role: 'owner', email: 'owner@example.test' };
const room = { _id: '333333333333333333333333', roomNumber: '101', capacity: 3, currentResidents: 1, monthlyRent: 5000, bedNumbers: ['B1', 'B2', 'B3'] };
const resident = { id: '222222222222222222222222', fullName: 'Resident A', pgId: owner.id, pgName: owner.pgName, role: 'resident',
  room: { id: room._id, roomNumber: room.roomNumber }, bedNumber: 'B1', phone: '9800000001', email: 'resident@example.test',
  ownerPhone: '+91 (98000) 00099', joiningDate: '2026-01-01', monthlyRent: 5000, accountStatus: 'active', loginEnabled: true, passwordChangeRequired: false };
const person = (id, extra = {}) => ({ ...structuredClone(resident), _id: id, owner: owner.id, room: structuredClone(room), status: 'Active',
  emergencyContact: { name: 'Parent A', phone: '+919800000002' }, ...extra });

async function setup(page, extra = {}) {
  const state = { ownerView: false, rows: [person(resident.id)], writes: [], reads: [], unexpected: [], failList: false, failSave: false, ...extra };
  await page.addInitScript((token) => {
    localStorage.setItem('pg_token', token);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => { window.copiedPhone = text; } } });
  }, state.ownerView ? 'owner-token' : 'resident-token');
  await page.route((url) => url.origin === 'http://127.0.0.1:4179' && url.pathname.startsWith('/api/'), async (route) => {
    const req = route.request(), path = new URL(req.url()).pathname.slice(4), method = req.method();
    const reply = (data, status = 200) => route.fulfill({ status, json: status >= 400 ? { success: false, message: data } : { success: true, data } });
    const isOwner = req.headers().authorization === 'Bearer owner-token';
    if (path === '/auth/session') return reply(isOwner ? { owner } : { role: 'resident', resident });
    if (path === '/notifications/unread-count') return reply({ unreadCount: 0 });
    if (method === 'GET') state.reads.push(path); else state.writes.push({ method, path, body: req.postData() ? req.postDataJSON() : null });
    if (path === '/resident/profile' && !isOwner) return reply({ role: 'resident', resident });
    if (path === '/residents' && method === 'GET' && isOwner) {
      if (state.failList) return reply('Contacts are temporarily unavailable', 503);
      const rows = state.rows.filter((row) => row.owner === owner.id);
      return reply(state.duplicateRows && rows.length ? [...rows, rows[0]] : rows);
    }
    if (path === '/rooms' && method === 'GET' && isOwner) return reply([room]);
    if (path === `/rooms/${room._id}` && method === 'GET' && isOwner) {
      return reply({ ...room, residents: state.rows.filter((row) => row.owner === owner.id && row.status === 'Active' && row.room._id === room._id), recentBills: [] });
    }
    if (path.startsWith('/residents/') && method === 'PUT' && isOwner) {
      const row = state.rows.find((value) => value._id === path.split('/')[2] && value.owner === owner.id);
      if (!row) return reply('Resident not found', 404);
      if (state.failSave) return reply('Unable to save resident. Please try again.', 503);
      const payload = req.postDataJSON();
      Object.assign(row, { ...payload, ...(payload.emergencyContact && { emergencyContact: { ...row.emergencyContact, ...payload.emergencyContact } }) });
      return reply(row);
    }
    state.unexpected.push({ path, method });
    return reply('Unexpected or wrong-role endpoint', 404);
  });
  return state;
}

const contacts = (page) => page.getByRole('list', { name: 'Resident contacts', exact: true });
const rowFor = (page, name) => contacts(page).getByRole('listitem').filter({ has: page.getByRole('link', { name, exact: true }) });
const noOverflow = async (page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

test('owner contacts deduplicate residents, search phones and rooms, validate parent edits and persist without changing login or assignment', async ({ page }) => {
  const original = person(resident.id);
  const state = await setup(page, { ownerView: true, duplicateRows: true, rows: [original,
    person('444444444444444444444444', { fullName: 'Legacy Resident', phone: '9800000004', email: '', emergencyContact: undefined, bedNumber: undefined }),
    person('555555555555555555555555', { fullName: 'Former Resident', status: 'Left', phone: '9800000005', emergencyContact: { phone: '9800000055' } }),
    person('666666666666666666666666', { fullName: 'FOREIGN RESIDENT', owner: '999999999999999999999999' }),
  ] });
  const protectedFields = Object.fromEntries(['room', 'bedNumber', 'loginEnabled', 'accountStatus', 'joiningDate', 'phone'].map((key) => [key, structuredClone(original[key])]));
  await page.goto('/emergency-contacts');
  await expect(page.getByRole('heading', { name: 'Resident Contacts', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Resident Contacts', exact: true }).first()).toHaveAttribute('href', '/emergency-contacts');
  await expect(contacts(page).getByRole('listitem')).toHaveCount(3);
  await expect(page.getByText('FOREIGN RESIDENT', { exact: true })).toHaveCount(0);
  await expect(rowFor(page, 'Legacy Resident').getByText('Not provided', { exact: true })).toHaveCount(2);
  await expect(rowFor(page, 'Former Resident').getByRole('button', { name: 'Edit Former Resident', exact: true })).toHaveCount(0);
  const row = rowFor(page, resident.fullName);
  await expect(row.getByRole('link', { name: /personal phone/ })).toHaveAttribute('href', 'tel:9800000001');
  await expect(row.getByRole('link', { name: /parent phone/ })).toHaveAttribute('href', 'tel:+919800000002');
  await expect(row.getByRole('link', { name: resident.email, exact: true })).toHaveAttribute('href', `mailto:${resident.email}`);
  await row.getByRole('button', { name: /Copy Resident A's personal phone/ }).click();
  await expect.poll(() => page.evaluate(() => window.copiedPhone)).toBe('9800000001');
  const search = page.getByRole('searchbox', { name: 'Search resident contacts', exact: true });
  for (const term of ['  RESIDENT A ', '+91 (98000) 00002']) {
    await search.fill(term); await expect(contacts(page).getByRole('listitem')).toHaveCount(1); await expect(row).toBeVisible();
  }
  await search.fill('101'); await expect(contacts(page).getByRole('listitem')).toHaveCount(3);
  await search.fill('no match'); await expect(page.getByText('No matching residents', { exact: true })).toBeVisible();
  await search.fill('');
  await row.getByRole('button', { name: 'Edit Resident A', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit Resident A', exact: true });
  await dialog.getByLabel("Parent's Phone Number", { exact: true }).fill('112;123');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog.getByText('Enter a valid phone number', { exact: true })).toBeVisible(); expect(state.writes).toHaveLength(0);
  await dialog.getByLabel("Parent's Phone Number", { exact: true }).fill('+91 (98000) 00066');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click(); expect(state.writes).toHaveLength(0);
  await row.getByRole('button', { name: 'Edit Resident A', exact: true }).click();
  await expect(dialog.getByLabel("Parent's Phone Number", { exact: true })).toHaveValue('+919800000002');
  await dialog.getByLabel("Parent's Phone Number", { exact: true }).fill('+91 (98000) 00066');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click(); await expect(dialog).toHaveCount(0);
  expect(state.writes).toEqual([{ method: 'PUT', path: `/residents/${resident.id}`, body: { fullName: resident.fullName, monthlyRent: 5000, email: resident.email, emergencyContact: { phone: '+919800000066' } } }]);
  for (const [key, value] of Object.entries(protectedFields)) expect(original[key]).toEqual(value);
  expect(original.emergencyContact.name).toBe('Parent A');
  await page.reload(); await expect(row.getByRole('link', { name: /parent phone/ })).toHaveAttribute('href', 'tel:+919800000066');
  await row.getByRole('button', { name: /Copy Resident A's parent phone/ }).click();
  await expect.poll(() => page.evaluate(() => window.copiedPhone)).toBe('+919800000066');
  expect(state.unexpected).toEqual([]);
});

test('resident legacy contacts redirect to a read-only personal profile with owner dialing and current mobile navigation', async ({ page }) => {
  const state = await setup(page);
  await page.setViewportSize({ width: 360, height: 800 }); await page.goto('/resident/emergency-contacts');
  await expect(page).toHaveURL(/\/resident\/profile$/);
  await expect(page.getByRole('heading', { name: 'My Profile', exact: true })).toBeVisible();
  const profile = page.locator('main dl');
  for (const value of [resident.fullName, resident.phone, resident.email]) await expect(profile.getByText(value, { exact: true })).toBeVisible();
  await expect(profile.getByRole('link', { name: resident.ownerPhone, exact: true })).toHaveAttribute('href', 'tel:+919800000099');
  await expect(page.getByText('Contact your owner to update your personal information or room assignment.', { exact: true })).toBeVisible();
  await expect(page.locator('main input, main select, main textarea')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Add contact|Edit |Delete |Save changes/ })).toHaveCount(0);
  await page.reload(); await expect(page).toHaveURL(/\/resident\/profile$/);
  await expect(profile.getByText(resident.fullName, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  const nav = page.getByRole('navigation', { name: 'Resident navigation', exact: true });
  await expect(nav.getByRole('link', { name: 'Emergency Contacts', exact: true })).toHaveCount(0);
  const profileLink = nav.getByRole('link', { name: 'My Profile', exact: true });
  await expect(profileLink).toHaveAttribute('href', '/resident/profile'); await profileLink.click();
  await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('link', { name: 'Change password', exact: true })).toHaveAttribute('href', '/resident/change-password');
  await noOverflow(page); expect(state.writes).toEqual([]);
  expect(state.reads.length).toBeGreaterThan(0); expect(state.reads.every((path) => path === '/resident/profile')).toBe(true);
  expect(state.unexpected).toEqual([]);
});

test('mobile Resident Contacts recovers from load/save failures, retains the draft, retries and uses the current More link', async ({ page }) => {
  const state = await setup(page, { ownerView: true, failList: true, failSave: true });
  await page.setViewportSize({ width: 360, height: 800 }); await page.goto('/emergency-contacts');
  await expect(page.getByText('Contacts are temporarily unavailable', { exact: true })).toBeVisible();
  state.failList = false; await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await rowFor(page, resident.fullName).getByRole('button', { name: 'Edit Resident A', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit Resident A', exact: true });
  await dialog.getByLabel('Email', { exact: true }).fill('updated@example.test');
  await dialog.getByLabel("Parent's Phone Number", { exact: true }).fill('9800000066');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Unable to save resident. Please try again.');
  await expect(dialog.getByLabel('Email', { exact: true })).toHaveValue('updated@example.test');
  await expect(dialog.getByLabel("Parent's Phone Number", { exact: true })).toHaveValue('9800000066');
  expect(state.writes).toHaveLength(1); expect(state.rows[0].email).toBe(resident.email);
  state.failSave = false;
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click(); await expect(dialog).toHaveCount(0);
  expect(state.writes).toHaveLength(2); expect(state.writes[1]).toEqual(state.writes[0]);
  const row = rowFor(page, resident.fullName);
  await expect(row.getByRole('link', { name: 'updated@example.test', exact: true })).toHaveAttribute('href', 'mailto:updated@example.test');
  await expect(row.getByRole('link', { name: /parent phone/ })).toHaveAttribute('href', 'tel:9800000066');
  await page.reload(); await expect(row.getByRole('link', { name: /parent phone/ })).toHaveAttribute('href', 'tel:9800000066');
  await page.getByRole('button', { name: 'More', exact: true }).click();
  const more = page.getByRole('dialog', { name: 'More', exact: true });
  await expect(more.getByRole('link', { name: 'Resident Contacts', exact: true })).toHaveAttribute('href', '/emergency-contacts');
  await more.getByRole('link', { name: 'Resident Contacts', exact: true }).click(); await expect(more).toHaveCount(0);
  await expect(page).toHaveURL(/\/emergency-contacts$/); await noOverflow(page);
  expect(state.unexpected).toEqual([]);
});
