import { test, expect } from '@playwright/test';

const TODAY = '2026-11-21', FUTURE = '2026-11-22';
const owner = { id: '111111111111111111111111', name: 'Owner A', role: 'owner', pgName: 'Test PG', email: 'owner@example.test' };
const resident = { id: '222222222222222222222222', role: 'resident', fullName: 'Resident A', pgName: owner.pgName, passwordChangeRequired: false };
const meals = () => ({
  breakfast: { items: ['Idli', 'Tea'], servingTime: '08:00-09:00', notes: 'Freshly prepared' },
  lunch: { items: ['Rice', 'Dal'], servingTime: '13:00', notes: '' },
  eveningSnacks: { items: ['Fruit'], servingTime: '17:00', notes: '' },
  dinner: { items: [], servingTime: '', notes: '' },
});

async function setup(page, { token = 'owner-token', scheduled = [], failSave = false, failToday = false } = {}) {
  const state = { menus: new Map(scheduled.map((menu) => [menu.date, menu])), writes: [], reads: [], failSave, failToday };
  await page.clock.setFixedTime(new Date('2026-11-20T18:45:00Z'));
  await page.addInitScript((value) => localStorage.setItem('pg_token', value), token);
  await page.route((url) => url.origin === 'http://127.0.0.1:4179' && url.pathname.startsWith('/api/'), async (route) => {
    const req = route.request(), path = new URL(req.url()).pathname.slice(4), method = req.method();
    const reply = (data, status = 200, message) => route.fulfill({ status, json: status >= 400 ? { success: false, message: data } : { success: true, data, ...(message && { message }) } });
    if (path === '/auth/session') return reply(token === 'owner-token' ? { owner } : { role: 'resident', resident });
    if (method === 'GET') state.reads.push(path);
    if (path === '/resident/mess-menus/today') return state.failToday ? reply('Menu service unavailable', 503) : reply({ date: TODAY, menu: state.menus.get(TODAY) || null });
    if (path === '/resident/mess-menus/upcoming') return reply({ date: TODAY, menus: [...state.menus.values()].filter((menu) => menu.date > TODAY).sort((a, b) => a.date.localeCompare(b.date)) });
    if (path === '/mess-menus' && method === 'POST') {
      const body = req.postDataJSON(); state.writes.push({ method, body });
      if (state.failSave) return reply('Menu could not be saved', 503);
      if (state.menus.has(body.date)) return reply('A mess menu already exists for this date', 409);
      state.menus.set(body.date, { id: body.date, ...body });
      return reply(state.menus.get(body.date), 201, 'Mess menu created');
    }
    if (path.startsWith('/mess-menus/')) {
      const date = path.split('/').at(-1);
      if (!state.menus.has(date)) return reply('Mess menu not found', 404);
      if (method === 'GET') return reply(state.menus.get(date));
      state.writes.push({ method, date, ...(method === 'PUT' && { body: req.postDataJSON() }) });
      if (method === 'PUT') {
        if (state.failSave) return reply('Menu could not be saved', 503);
        state.menus.set(date, { ...state.menus.get(date), meals: req.postDataJSON().meals });
        return reply(state.menus.get(date), 200, 'Mess menu updated');
      }
      if (method === 'DELETE') { state.menus.delete(date); return reply(null, 200, 'Mess menu deleted'); }
    }
    return reply('Unexpected test endpoint', 404);
  });
  return state;
}

test('owner validates, confirms, creates, edits, schedules and deletes menus on desktop and mobile', async ({ page }) => {
  const state = await setup(page);
  await page.goto('/mess-management');
  await expect(page.getByRole('heading', { name: 'Mess Management', exact: true })).toBeVisible();
  await expect(page.getByLabel('Menu date', { exact: true })).toHaveValue(TODAY);
  await expect(page.getByRole('link', { name: 'Mess Management', exact: true })).toHaveAttribute('href', '/mess-management');
  await page.getByRole('button', { name: 'Add menu', exact: true }).click();
  const editor = page.getByRole('dialog').filter({ has: page.locator('form') });
  await editor.locator('#breakfast-items').fill('  Poha\nTea  ');
  await editor.getByRole('button', { name: 'Save menu', exact: true }).click();
  await expect(editor.getByText('Add a serving time for this meal.', { exact: true })).toBeVisible();
  expect(state.writes).toHaveLength(0);
  await editor.locator('#breakfast-servingTime').fill('08:00-09:00');
  await editor.locator('#breakfast-notes').fill('Freshly prepared');
  await editor.getByRole('button', { name: 'Save menu', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Publish menu?', exact: true });
  await expect(confirmation).toBeVisible(); expect(state.writes).toHaveLength(0);
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(editor.locator('#breakfast-items')).toHaveValue('  Poha\nTea  ');
  await editor.getByRole('button', { name: 'Save menu', exact: true }).click();
  await page.getByRole('dialog', { name: 'Publish menu?', exact: true }).getByRole('button', { name: 'Save menu', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Breakfast', exact: true }).getByText('Poha', { exact: true })).toBeVisible();
  expect(state.writes[0]).toEqual({ method: 'POST', body: { date: TODAY, meals: { breakfast: { items: ['Poha', 'Tea'], servingTime: '08:00-09:00', notes: 'Freshly prepared' }, lunch: { items: [], servingTime: '', notes: '' }, eveningSnacks: { items: [], servingTime: '', notes: '' }, dinner: { items: [], servingTime: '', notes: '' } } } });
  await page.getByRole('button', { name: 'Edit menu', exact: true }).click();
  await editor.locator('#breakfast-items').fill('Dosa');
  await editor.getByRole('button', { name: 'Save menu', exact: true }).click();
  await page.getByRole('dialog', { name: 'Save menu changes?', exact: true }).getByRole('button', { name: 'Save menu', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Breakfast', exact: true }).getByText('Dosa', { exact: true })).toBeVisible();
  expect(state.menus.get(TODAY).meals.breakfast.items).toEqual(['Dosa']);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.getByLabel('Menu date', { exact: true }).fill(FUTURE);
  await page.getByRole('button', { name: 'Add menu', exact: true }).click();
  await editor.locator('#eveningSnacks-items').fill('Samosa');
  await editor.locator('#eveningSnacks-servingTime').fill('17:00');
  await editor.getByRole('button', { name: 'Save menu', exact: true }).click();
  await page.getByRole('dialog', { name: 'Publish menu?', exact: true }).getByRole('button', { name: 'Save menu', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Snacks', exact: true }).getByText('Samosa', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Delete menu', exact: true }).click();
  await page.getByRole('dialog', { name: 'Delete this menu?', exact: true }).getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(state.menus.has(FUTURE)).toBe(true);
  await page.getByRole('button', { name: 'Delete menu', exact: true }).click();
  await page.getByRole('dialog', { name: 'Delete this menu?', exact: true }).getByRole('button', { name: 'Delete menu', exact: true }).click();
  await expect(page.getByText('No menu planned yet', { exact: true })).toBeVisible();
  expect(state.menus.has(FUTURE)).toBe(false); expect(state.menus.has(TODAY)).toBe(true);
  const primary = page.getByRole('navigation', { name: 'Main navigation', exact: true });
  const mess = primary.getByRole('link', { name: 'Mess Management', exact: true });
  await expect(mess).toBeVisible();
  await expect(mess).toHaveText('Mess');
  await expect(mess).toHaveAttribute('href', '/mess-management');
  await primary.getByRole('button', { name: 'More', exact: true }).click();
  const more = page.getByRole('dialog', { name: 'More', exact: true });
  await expect(more.getByRole('link', { name: 'Mess Management', exact: true })).toHaveCount(0);
  await more.getByRole('link', { name: 'Attendance', exact: true }).click();
  await expect(more).toHaveCount(0);
  await expect(page).toHaveURL(/\/attendance$/);
  await mess.click();
  await expect(page).toHaveURL(/\/mess-management$/);
  await expect(page.getByRole('heading', { name: 'Mess Management', exact: true })).toBeVisible();
});

test('failed owner saves retain the draft and do not display an unsaved menu', async ({ page }) => {
  const state = await setup(page, { failSave: true });
  await page.goto('/mess-management');
  await page.getByRole('button', { name: 'Add menu', exact: true }).click();
  const editor = page.getByRole('dialog').filter({ has: page.locator('form') });
  await editor.locator('#lunch-items').fill('Rice'); await editor.locator('#lunch-servingTime').fill('13:00');
  await editor.getByRole('button', { name: 'Save menu', exact: true }).click();
  await page.getByRole('dialog', { name: 'Publish menu?', exact: true }).getByRole('button', { name: 'Save menu', exact: true }).click();
  await expect(editor.getByRole('alert')).toHaveText('Menu could not be saved');
  await expect(editor.locator('#lunch-items')).toHaveValue('Rice');
  await expect(editor.getByRole('button', { name: 'Save menu', exact: true })).toBeEnabled();
  expect(state.menus.size).toBe(0);
});

test('resident menus are read-only, handle errors and empty dates, and fit a mobile viewport', async ({ page }) => {
  const state = await setup(page, { token: 'resident-token', failToday: true, scheduled: [{ id: 'future', date: FUTURE, meals: meals() }] });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/resident/mess-menu');
  const today = page.getByRole('region', { name: "Today's menu", exact: true });
  const upcoming = page.getByRole('region', { name: 'Upcoming menus', exact: true });
  await expect(today.getByText('Menu service unavailable', { exact: true })).toBeVisible();
  await expect(upcoming.getByRole('article', { name: 'Breakfast', exact: true }).getByText('Idli', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Upcoming menu date', { exact: true })).toHaveValue(FUTURE);
  await expect(upcoming.getByRole('article', { name: 'Dinner', exact: true }).getByText('No food items announced yet.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Save menu|Edit menu|Delete menu|Add menu/ })).toHaveCount(0);
  state.failToday = false;
  await today.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(today.getByText("Today's menu is on its way", { exact: true })).toBeVisible();
  state.menus.set(TODAY, { id: 'today', date: TODAY, meals: meals() });
  await page.getByRole('button', { name: 'Refresh menus', exact: true }).click();
  await expect(today.getByRole('article', { name: 'Breakfast', exact: true }).getByText('08:00 – 09:00', { exact: true })).toBeVisible();
  await expect(today.getByText('21 Nov 2026 · IST', { exact: true })).toBeVisible();
  expect(state.writes).toHaveLength(0);
  expect(state.reads.every((path) => path.startsWith('/resident/mess-menus/'))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Resident navigation' }).getByRole('link', { name: 'Mess Menu', exact: true })).toHaveAttribute('href', '/resident/mess-menu');
  state.menus.delete(FUTURE);
  await page.getByRole('link', { name: 'Mess Menu', exact: true }).click();
  await page.getByRole('button', { name: 'Refresh menus', exact: true }).click();
  await expect(upcoming.getByText(/^More meals coming/)).toBeVisible();
});
