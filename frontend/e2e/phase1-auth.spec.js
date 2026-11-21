import { test, expect } from '@playwright/test';

const owner = { id: '111111111111111111111111', role: 'owner', name: 'Test Owner', email: 'owner@example.test', pgName: 'Test Hostel', pgCode: 'PG-111111111111111111111111', currency: '₹' };
const room = { _id: '222222222222222222222222', roomNumber: '101', monthlyRent: 5000, capacity: 4, currentResidents: 1, status: 'Occupied' };
const resident = { id: '333333333333333333333333', fullName: 'Test Resident', role: 'resident', phone: '+919876543210', email: '', room: { id: room._id, roomNumber: '101' }, pgName: owner.pgName, pgCode: owner.pgCode, joiningDate: '2026-01-05', loginEnabled: true, status: 'Active', accountStatus: 'active', firstLoginAt: '2026-11-19T10:00:00.000Z', lastLoginAt: '2026-11-19T10:00:00.000Z', passwordChangeRequired: false };

async function mockAPI(page, { temporary = false, expired = false, outage = false, loginError = false } = {}) {
  const state = { resident: { ...resident, passwordChangeRequired: temporary }, expired, outage, writes: [], calls: [],
    rooms: [room], residents: [{ ...resident, _id: resident.id, room, monthlyRent: 5000, accountStatus: 'unconfigured', loginEnabled: false }],
    residentQueries: [], creations: [], portalError: '',
    finance: { month: '2026-11', monthlyRent: 5000, pendingDues: 1250, paymentDueDate: '2026-11-05T18:29:59.000Z',
      currentBill: { amountDue: 5000, amountPaid: 3750, balance: 1250, dueDate: '2026-11-05T18:29:59.000Z', status: 'Partially Paid' } },
    attendance: { month: '2026-11', throughDate: '2026-11-19', Present: 17, Absent: 1, 'On Leave': 1, recordedDays: 19 } };
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ contentType: 'text/css', body: '' }));
  await page.route((url) => url.origin === 'http://127.0.0.1:4179' && url.pathname.startsWith('/api/'), async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.slice(4);
    const token = req.headers().authorization;
    state.calls.push(path);
    const fulfill = (data, status = 200) => route.fulfill({ status, json: status >= 400 ? { success: false, message: data } : { success: true, data } });
    if (path === '/auth/session') {
      if (state.outage) return fulfill('Service unavailable', 503);
      if (state.expired) return fulfill('Session expired', 401);
      return token?.includes('owner-token') ? fulfill({ owner }) : fulfill({ role: 'resident', resident: state.resident });
    }
    if (path === '/auth/login' || path === '/auth/register') return fulfill({ owner, token: 'owner-token' });
    if (path === '/auth/resident/login') return loginError ? fulfill('Invalid resident credentials', 401) : fulfill({ role: 'resident', resident: state.resident, token: 'resident-token' });
    if (path === '/auth/resident/change-password') {
      state.resident.passwordChangeRequired = false;
      return fulfill({ role: 'resident', resident: state.resident, token: 'resident-token-changed' });
    }
    if (path === '/resident/dashboard' || path === '/resident/profile') {
      if (state.portalError) return fulfill(state.portalError, 503);
      return fulfill({ role: 'resident', resident: { ...state.resident, monthlyRent: state.finance.monthlyRent },
        ...(path === '/resident/dashboard' && { finance: state.finance, attendance: state.attendance }) });
    }
    if (path === '/rooms') return fulfill(state.rooms);
    if (path === '/residents' && req.method() === 'GET') {
      const params = Object.fromEntries(new URL(req.url()).searchParams);
      state.residentQueries.push(params);
      return fulfill(state.residents.filter((person) => (!params.status || person.status === params.status)
        && (!params.room || person.room._id === params.room)
        && (!params.search || `${person.fullName} ${person.phone}`.toLowerCase().includes(params.search.toLowerCase()))));
    }
    if (path === '/residents' && req.method() === 'POST') {
      const payload = req.postDataJSON(); state.creations.push(payload);
      const { temporaryPassword, ...saved } = payload;
      const created = { ...saved, _id: '444444444444444444444444', room: state.rooms.find((item) => item._id === payload.room), status: 'Active', accountStatus: payload.loginEnabled ? 'active' : 'unconfigured' };
      state.residents.push(created); return fulfill(created);
    }
    if (path.startsWith('/residents/') && req.method() === 'PUT') {
      const payload = req.postDataJSON(); state.writes.push(payload);
      const person = state.residents.find((item) => item._id === path.split('/')[2]);
      const { temporaryPassword, ...saved } = payload;
      Object.assign(person, saved, { room: state.rooms.find((item) => item._id === payload.room),
        accountStatus: payload.loginEnabled ? 'active' : 'disabled', passwordChangeRequired: !!temporaryPassword || person.passwordChangeRequired });
      return fulfill(person);
    }
    if (path === '/dashboard') return fulfill({ rooms: { total: 1, occupied: 1, vacant: 0, totalBeds: 4, occupiedBeds: 1 }, residents: { active: 1 }, rent: { billed: 0, collected: 0, pending: 0 }, electricity: { billed: 0, collected: 0, pending: 0 }, outstanding: { rent: 0, electricity: 0, total: 0 }, recentPayments: [], pendingRent: [], upcomingDeadlines: [] });
    return fulfill('Unexpected test endpoint', 404);
  });
  return state;
}

const storedToken = (page) => page.evaluate(() => localStorage.getItem('pg_token'));
async function seedToken(page, token) {
  await page.addInitScript((value) => localStorage.setItem('pg_token', value), token);
}
async function residentLogin(page) {
  await page.goto('/resident/login');
  await page.getByLabel('Hostel / PG Name', { exact: true }).fill('Test Hostel');
  await page.getByLabel('Room Number', { exact: true }).fill('101');
  await page.getByLabel('Phone Number', { exact: true }).fill('9876543210');
  await page.getByLabel('Password', { exact: true }).fill('Temporary123!');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
}

test('role picker, Change Role, accessible password visibility and mobile widths', async ({ page }, testInfo) => {

await mockAPI(page);
await page.setViewportSize({ width: 360, height: 900 });
await page.goto('/', { waitUntil: 'domcontentloaded' });

for (const width of [360, 768, 1280]) {
  await page.setViewportSize({ width, height: 900 });

  await expect(
    page.getByRole('heading', {
      name: 'Welcome to Smart PG Manager'
    })
  ).toBeVisible();

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);

  if (width !== 768) {
    await page.screenshot({
      path: testInfo.outputPath(`role-selection-${width}.png`),
      fullPage: true
    });
  }
}
  await page.getByRole('link', { name: "I'm an Owner" }).click();
  await expect(page).toHaveURL(/\/owner\/login$/);
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await page.getByRole('link', { name: 'Change Role' }).click();
  await page.getByRole('link', { name: "I'm a Resident / Student" }).click();
  await page.getByLabel('Password', { exact: true }).fill('Temporary123!');
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password' }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password');
  await expect(page.getByRole('link', { name: 'Create an account' })).toHaveCount(0);
});

test('first login is enforced across routes and refresh, then the new session persists and logs out', async ({ page }) => {
  await mockAPI(page, { temporary: true });
  await residentLogin(page);
  await expect(page).toHaveURL(/\/resident\/change-password$/);
  await page.goto('/resident/dashboard');
  await expect(page).toHaveURL(/\/resident\/change-password$/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Set your own password' })).toBeVisible();
  await page.getByLabel('Temporary password', { exact: true }).fill('Temporary123!');
  await page.getByLabel('New password', { exact: true }).fill('Personal456!');
  await page.getByLabel('Confirm new password', { exact: true }).fill('Personal456!');
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page).toHaveURL(/\/resident\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Welcome, Test Resident' })).toBeVisible();
  expect(await storedToken(page)).toBe('resident-token-changed');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome, Test Resident' })).toBeVisible();
  await page.getByRole('button', { name: 'Logout', exact: true }).first().click();
  await expect(page).toHaveURL(/\/resident\/login$/); expect(await storedToken(page)).toBeNull();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Welcome, Test Resident' })).toHaveCount(0);
});

test('resident sessions cannot open owner pages and profile uses authenticated data only', async ({ page }) => {
  const state = await mockAPI(page);
  await seedToken(page, 'resident-token');
  await page.goto('/rooms', { waitUntil: 'commit' }); await expect(page).toHaveURL(/\/resident\/dashboard$/);
  expect(state.calls).not.toContain('/rooms');
  await page.goto('/resident/profile', { waitUntil: 'commit' });
  await expect(page.getByRole('heading', { name: 'My Profile' })).toBeVisible();
  await expect(page.getByText('+919876543210', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 360, height: 800 });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  const residentNav = page.getByRole('navigation', { name: 'Resident navigation' });
  const paymentsLink = residentNav.getByRole('link', { name: 'My Bills & Payments', exact: true });
  await expect(paymentsLink).toHaveAttribute('href', '/resident/payments');
  await paymentsLink.click();
  await expect(page).toHaveURL(/\/resident\/payments$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('existing owner bookmarks, login, account enablement and cross-role redirects work', async ({ page }) => {
  const state = await mockAPI(page);
  await page.goto('/rooms'); await expect(page).toHaveURL(/\/owner\/login$/);
  await page.getByLabel('Email', { exact: true }).fill('owner@example.test');
  await page.getByLabel('Password', { exact: true }).fill('OwnerPass123!');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(/\/rooms$/);
  await page.goto('/residents');
  await page.getByRole('button', { name: 'Edit Test Resident', exact: true }).click();
  await page.getByLabel('Enable resident login').check();
  await page.getByLabel('Temporary login password', { exact: true }).fill('Temporary123!');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect.poll(() => state.writes.length).toBe(1);
  expect(state.writes[0]).toMatchObject({ loginEnabled: true, temporaryPassword: 'Temporary123!', fullName: 'Test Resident' });
  await page.goto('/resident/profile'); await expect(page).toHaveURL('http://127.0.0.1:4179/');
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
});

test('expired sessions clear tokens, while a transient outage preserves the saved session', async ({ page }) => {
  const state = await mockAPI(page, { outage: true });
  await seedToken(page, 'resident-token');
  await page.goto('/resident/profile');
  await expect(page.getByText('Service unavailable', { exact: true })).toBeVisible();
  expect(await storedToken(page)).toBe('resident-token');
  state.outage = false; state.expired = true;
  await page.reload(); await expect(page).toHaveURL(/\/resident\/login$/);
  expect(await storedToken(page)).toBeNull();
});

test('resident login failures show an error and permit a retry', async ({ page }) => {
  await mockAPI(page, { loginError: true });
  await residentLogin(page);
  await expect(page.getByRole('alert')).toHaveText('Invalid resident credentials');
  await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeEnabled();
});

test('owner resident account filters combine with search and room; PG code copies on desktop and mobile', async ({ page }) => {
  const state = await mockAPI(page);
  const secondRoom = { ...room, _id: '555555555555555555555555', roomNumber: '202' };
  state.rooms.push(secondRoom);
  state.residents[0].email = 'resident@example.test';
  state.residents.push(
    { ...state.residents[0], _id: '666666666666666666666666', fullName: 'Enabled Resident', room: secondRoom, accountStatus: 'active', loginEnabled: true },
    { ...state.residents[0], _id: '777777777777777777777777', fullName: 'Disabled Resident', accountStatus: 'disabled' },
  );
  // This is a legacy record with no authentication fields yet.
  delete state.residents[0].accountStatus;
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      async writeText(text) { window.copiedPgCode = text; },
    } });
  });
  await seedToken(page, 'owner-token'); await page.goto('/residents');
  const heading = page.getByRole('heading', { name: 'Residents', exact: true });
  await expect(heading).toBeVisible();
  await expect(page.getByText(owner.pgCode, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Copy PG code', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.copiedPgCode)).toBe(owner.pgCode);
  await expect(page.getByText('PG code copied', { exact: true })).toBeVisible();
  const accountFilter = page.getByLabel('Filter by account status', { exact: true });
  await accountFilter.selectOption('unconfigured');
  await expect(page.getByText('Test Resident', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Enabled Resident', { exact: true })).toHaveCount(0);
  await accountFilter.selectOption('active');
  await expect(page.getByText('Enabled Resident', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Test Resident', { exact: true })).toHaveCount(0);
  await page.getByLabel('Search by name or phone').fill('Enabled');
  await expect.poll(() => state.residentQueries.some((params) => params.search === 'Enabled')).toBe(true);
  await page.getByLabel('Filter by room', { exact: true }).selectOption(secondRoom._id);
  await expect.poll(() => state.residentQueries.some((params) => params.search === 'Enabled' && params.room === secondRoom._id)).toBe(true);
  await accountFilter.selectOption('disabled');
  await expect(page.getByText('No residents match', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(accountFilter).toHaveValue('');
  await expect(page.getByLabel('Filter by room', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Search by name or phone')).toHaveValue('');
  await expect(page.getByText('Disabled Resident', { exact: true }).first()).toBeVisible();
  await accountFilter.selectOption('disabled');
  await expect(page.getByText('Enabled Resident', { exact: true })).toHaveCount(0);
  await expect(page.locator('tbody').getByText('Login disabled', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 360, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('Clipboard denied'); }; });
  await page.getByRole('button', { name: 'Copy PG code', exact: true }).click();
  await expect(page.getByText('Could not access the clipboard. Select and copy the PG code manually.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy PG code', exact: true })).toBeEnabled();
});

test('owner resident accounts can be added, reset, disabled and re-enabled through existing forms', async ({ page }) => {
  const state = await mockAPI(page);
  state.residents[0].accountStatus = 'active'; state.residents[0].loginEnabled = true;
  await seedToken(page, 'owner-token'); await page.goto('/residents');
  await page.getByRole('button', { name: 'Add resident', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Copy PG code', exact: true })).toBeVisible();
  await dialog.getByLabel('Room', { exact: true }).selectOption(room._id);
  await dialog.getByLabel('Full name', { exact: true }).fill('New Resident');
  await dialog.getByLabel('Phone number', { exact: true }).fill('9876543211');
  await dialog.getByLabel('Email', { exact: true }).fill('new@example.test');
  await dialog.getByLabel('Enable resident login').check();
  await dialog.getByLabel('Temporary login password', { exact: true }).fill('Temporary123!');
  await dialog.getByRole('button', { name: 'Add resident', exact: true }).click();
  await expect.poll(() => state.creations.length).toBe(1);
  expect(state.creations[0]).toMatchObject({ fullName: 'New Resident', phone: '9876543211', email: 'new@example.test', room: room._id, loginEnabled: true, temporaryPassword: 'Temporary123!', monthlyRent: 5000 });
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit Test Resident', exact: true }).click();
  await expect(dialog.getByText('First login', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Last successful login', { exact: true })).toBeVisible();
  await dialog.getByLabel('Reset temporary password', { exact: true }).fill('ResetPass456!');
  await dialog.getByLabel('Enable resident login').uncheck();
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect.poll(() => state.writes.length).toBe(1);
  expect(state.writes[0]).toMatchObject({ loginEnabled: false, temporaryPassword: 'ResetPass456!' });
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit Test Resident', exact: true }).click();
  await expect(dialog.getByLabel('Reset temporary password', { exact: true })).toHaveValue('');
  await dialog.getByLabel('Enable resident login').check();
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect.poll(() => state.writes.length).toBe(2);
  expect(state.writes[1].loginEnabled).toBe(true);
  expect(state.writes[1]).not.toHaveProperty('temporaryPassword');
});

test('resident portal displays API rent and attendance, refreshes profile and supports mobile navigation', async ({ page }) => {
  const state = await mockAPI(page);
  state.finance.monthlyRent = 6150; state.finance.pendingDues = 4321.75;
  const dashboardResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.origin === 'http://127.0.0.1:4179' && url.pathname === '/api/resident/dashboard' && response.request().method() === 'GET';
  });
  await seedToken(page, 'resident-token'); await page.goto('/resident/dashboard', { waitUntil: 'commit' });
  expect((await dashboardResponse).status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Welcome, Test Resident' })).toBeVisible();
  const rentSummary = page.getByRole('region', { name: 'Rent and dues' });
  await expect(rentSummary.getByText(/6,150$/)).toBeVisible();
  await expect(rentSummary.getByText(/4,321\.75$/)).toBeVisible();
  await expect(rentSummary.getByText('5 Nov 2026', { exact: true })).toBeVisible();
  const attendanceSummary = page.getByRole('region', { name: 'My attendance summary' });
  for (const [label, count] of [['Present', '17'], ['Absent', '1'], ['On leave', '1'], ['Recorded days', '19']]) {
    await expect(attendanceSummary.getByText(label, { exact: true }).locator('..').locator('dd')).toHaveText(count);
  }
  state.finance.pendingDues = 789;
  await rentSummary.getByRole('button', { name: 'Refresh summary' }).click();
  await expect(rentSummary.getByText(/789$/)).toBeVisible();
  state.resident.email = 'fresh-profile@example.test';
  await page.getByRole('main').getByRole('link', { name: 'My Profile', exact: true }).click();
  await expect(page.getByText('fresh-profile@example.test', { exact: true })).toBeVisible();
  await expect(page.getByText('+919876543210', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Change password', exact: true })).toBeVisible();
  expect(state.calls).toContain('/resident/dashboard'); expect(state.calls).toContain('/resident/profile');
  expect(state.calls).not.toContain('/rent'); expect(state.calls).not.toContain('/attendance');
  await page.setViewportSize({ width: 360, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  expect(await page.evaluate(async () => (await import('/src/native/backNavigation.js')).dismissTopLayer())).toBe(true);
  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  const residentNav = page.getByRole('navigation', { name: 'Resident navigation' });
  await expect(residentNav.getByRole('link', { name: 'My Bills & Payments', exact: true }))
    .toHaveAttribute('href', '/resident/payments');
  await residentNav.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome, Test Resident' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('resident portal handles missing records and request failures without invented billing or attendance', async ({ page }) => {
  const state = await mockAPI(page);
  state.finance.currentBill = null; state.finance.pendingDues = 0; state.finance.paymentDueDate = null;
  Object.assign(state.attendance, { Present: 0, Absent: 0, 'On Leave': 0, recordedDays: 0 });
  await seedToken(page, 'resident-token'); await page.goto('/resident/dashboard');
  await expect(page.getByText('No rent bill has been issued for November 2026.', { exact: true })).toBeVisible();
  await expect(page.getByText('No pending rent', { exact: true })).toBeVisible();
  await expect(page.getByText('No attendance has been recorded for you this month.', { exact: true })).toBeVisible();
  state.portalError = 'Summary unavailable';
  await page.getByRole('button', { name: 'Refresh summary' }).click();
  await expect(page.getByText('Summary unavailable', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Rent and dues' })).toHaveCount(0);
  expect(await storedToken(page)).toBe('resident-token');
  state.portalError = '';
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Rent and dues' })).toBeVisible();
  state.portalError = 'Profile unavailable';
  await page.getByRole('main').getByRole('link', { name: 'My Profile', exact: true }).click();
  await expect(page.getByText('Profile unavailable', { exact: true })).toBeVisible();
  state.portalError = '';
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByText('+919876543210', { exact: true })).toBeVisible();
});
