import { test, expect } from '@playwright/test';

const owner = { id: '111111111111111111111111', name: 'Owner A', pgName: 'Test PG', role: 'owner', email: 'owner@example.test' };
const resident = { id: '222222222222222222222222', fullName: 'Resident A', pgId: owner.id, pgName: owner.pgName, role: 'resident', room: { id: '333333333333333333333333', roomNumber: '101' }, passwordChangeRequired: false };
const entityId = '444444444444444444444444';
function notification(index, ownerView = false, extra = {}) {
  return { id: String(index).padStart(24, '0'), pgId: owner.id, recipientRole: ownerView ? 'owner' : 'resident', recipientId: ownerView ? owner.id : resident.id,
    type: ownerView ? 'complaint_created' : 'notice_published', path: ownerView ? '/complaints' : '/resident/notices', relatedEntityId: entityId,
    title: 'Update ' + index, message: 'A private account update ' + index, createdAt: new Date(Date.UTC(2026, 10, 21, 8, index)).toISOString(), read: false, readAt: null, ...extra };
}
async function setup(page, extra = {}) {
  const complaint = { id: `complaint:${entityId}`, sourceType: 'complaint', sourceId: entityId, pgId: owner.id, category: 'Private Issue', title: 'Bathroom repair', description: 'The bathroom lock needs attention.', priority: 'High', status: 'Open', createdAt: '2026-11-21T08:00:00Z', ownerResponse: '',
    resident: { id: resident.id, name: resident.fullName }, room: { id: resident.room.id, number: '101', bedNumber: null }, details: { originalCategory: 'Maintenance' },
    responses: [{ ownerName: resident.fullName, actorRole: 'resident', type: 'Comment', message: 'The existing private history remains visible.', createdAt: '2026-11-21T08:05:00Z' }] };
  const state = { ownerView: false, rows: [], writes: [], requestWrites: [], reads: [], complaint, countReads: 0, failList: false, failCount: false, failWrite: false, expired: false, bypassScope: false, missing: false, ...extra };
  await page.addInitScript((token) => localStorage.setItem('pg_token', token), state.ownerView ? 'owner-token' : 'resident-token');
  await page.route((url) => url.origin === 'http://127.0.0.1:4179' && url.pathname.startsWith('/api/'), async (route) => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname.slice(4), method = req.method(), isOwner = req.headers().authorization === 'Bearer owner-token';
    const reply = (data, status = 200) => route.fulfill({ status, json: status >= 400 ? { success: false, message: data } : { success: true, data, message: 'Updated' } });
    if (state.expired) return reply('Your session has expired. Please log in again', 401);
    if (path === '/auth/session') return reply(state.ownerView ? { owner } : { role: 'resident', resident });
    state.reads.push({ path, method, query: Object.fromEntries(url.searchParams) });
    const scoped = state.rows.filter((row) => row.pgId === owner.id && row.recipientId === (state.ownerView ? owner.id : resident.id) && row.recipientRole === (state.ownerView ? 'owner' : 'resident'));
    if (path === '/notifications/unread-count') { state.countReads++; return state.failCount ? reply('Unread count is temporarily unavailable', 503) : reply({ unreadCount: scoped.filter((row) => !row.read).length }); }
    if (path === '/notifications' && method === 'GET') {
      if (state.failList) return reply('Notifications are temporarily unavailable', 503);
      const rows = (state.bypassScope ? state.rows : scoped).filter((row) => url.searchParams.get('unread') !== 'true' || !row.read).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const page = Number(url.searchParams.get('page') || 1), limit = Number(url.searchParams.get('limit') || 20);
      return reply({ notifications: rows.slice((page - 1) * limit, page * limit), pagination: { page, limit, total: rows.length, totalPages: Math.ceil(rows.length / limit), hasMore: page * limit < rows.length } });
    }
    if (path.startsWith('/notifications/') && method === 'PATCH') {
      state.writes.push(path); if (state.failWrite) return reply('Could not update notifications. Please try again.', 503);
      if (path === '/notifications/read-all') { const unread = scoped.filter((row) => !row.read); unread.forEach((row) => { row.read = true; row.readAt = new Date().toISOString(); }); return reply({ updated: unread.length }); }
      const id = path.split('/')[2], row = scoped.find((value) => value.id === id);
      if (!row) return reply('Notification not found', 404);
      row.read = true; row.readAt ||= new Date().toISOString(); return reply(row);
    }
    if (path === `/requests/complaint/${entityId}` && method === 'GET') {
      if (!state.ownerView || !isOwner || state.complaint.pgId !== owner.id || state.missing) return reply('Complaint not found', 404);
      return reply(state.complaint);
    }
    if (path === `/complaints/${entityId}/comments` && method === 'POST') {
      if (!state.ownerView || !isOwner || state.complaint.pgId !== owner.id) return reply('Complaint not found', 404);
      const body = req.postDataJSON(); state.requestWrites.push({ method, path, body });
      state.complaint.responses.push({ ownerName: owner.name, actorRole: 'owner', type: 'Comment', message: body.text, createdAt: '2026-11-21T08:10:00Z' });
      return reply(state.complaint);
    }
    if (path === `/complaints/${entityId}/status` && method === 'PATCH') {
      if (!state.ownerView || !isOwner || state.complaint.pgId !== owner.id) return reply('Complaint not found', 404);
      const body = req.postDataJSON(); state.requestWrites.push({ method, path, body }); state.complaint.status = body.status;
      return reply(state.complaint);
    }
    if (path === '/community/notices') return reply({ pgId: owner.id, notices: state.missing ? [] : [{ id: entityId, title: 'Water supply update', body: 'Water supply resumes at noon.', pinned: false, isNew: false, isExpired: false, createdAt: '2026-11-21T08:00:00Z', updatedAt: '2026-11-21T08:00:00Z', expiresAt: null }], readThrough: '2026-11-21T08:00:00Z' });
    return reply('Unexpected endpoint ' + path, 404);
  });
  return state;
}

test('owner bell, read actions, All/Unread filters and older pages stay synchronized', async ({ page }) => {
  const state = await setup(page, { ownerView: true, rows: Array.from({ length: 23 }, (_, index) => notification(index + 1, true)) }); await page.goto('/notifications');
  await expect(page.getByRole('link', { name: 'Notifications', exact: true })).toHaveAttribute('href', '/notifications');
  await expect(page.getByLabel('23 unread notifications', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Notifications', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Notifications', exact: true }); await expect(panel.getByRole('article')).toHaveCount(5); await expect(panel.getByRole('article').first()).toHaveAccessibleName('Update 23');
  await page.keyboard.press('Escape'); await expect(panel).toHaveCount(0);
  const feed = page.getByRole('region', { name: 'Notification list', exact: true }); await expect(feed.getByRole('article')).toHaveCount(20);
  await feed.getByRole('button', { name: 'Unread', exact: true }).click();
  await feed.getByRole('button', { name: 'Mark Update 23 as read', exact: true }).evaluate((button) => { button.click(); button.click(); });
  await expect(page.getByLabel('22 unread notifications', { exact: true })).toBeVisible(); await expect(feed.getByRole('article', { name: 'Update 23', exact: true })).toHaveCount(0);
  expect(state.writes.filter((path) => path.endsWith('/read'))).toHaveLength(1);
  await feed.getByRole('button', { name: 'Older notifications', exact: true }).click(); await expect(feed.getByText('Page 2 of 2', { exact: true })).toBeVisible(); await expect(feed.getByRole('article')).toHaveCount(2);
  await feed.getByRole('button', { name: 'Mark All as Read', exact: true }).click(); await expect(feed.getByText('You’re all caught up', { exact: true })).toBeVisible();
  await expect(page.getByLabel(/\d+ unread notifications/)).toHaveCount(0);
  await feed.getByRole('button', { name: 'All', exact: true }).click(); await expect(feed.getByRole('article')).toHaveCount(20); await expect(feed.getByRole('article').first().getByText('Read', { exact: true })).toBeVisible();
  expect(state.writes.filter((path) => path.endsWith('/read-all'))).toHaveLength(1);
});

test('resident mobile bell opens a real notice, validates its module link and supports navigation', async ({ page }) => {
  await setup(page, { rows: [notification(1)] }); await page.setViewportSize({ width: 360, height: 800 }); await page.goto('/resident/notifications');
  await expect(page.getByLabel('1 unread notifications', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Notifications', exact: true }).click();
  await page.getByRole('dialog', { name: 'Notifications', exact: true }).getByRole('button', { name: 'Update 1', exact: true }).click();
  const detail = page.getByRole('dialog', { name: 'PG notice', exact: true }); await expect(detail.getByText('Water supply resumes at noon.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await detail.getByRole('button', { name: 'Open Notice Board', exact: true }).click(); await expect(page).toHaveURL(/\/resident\/notices$/);
  await expect(page.getByRole('article', { name: 'Water supply update', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click(); await expect(page.getByRole('link', { name: 'Notifications', exact: true })).toHaveAttribute('href', '/resident/notifications');
  await page.getByRole('link', { name: 'Notifications', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Notifications', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Notifications', exact: true }).click(); await page.getByRole('button', { name: 'View all notifications', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Notifications', exact: true })).toHaveCount(0);
});

test('owner notification opens the existing private complaint details and response controls', async ({ page }) => {
  const state = await setup(page, { ownerView: true, rows: [notification(1, true)] }); await page.goto('/notifications');
  await page.getByRole('button', { name: 'Update 1', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Request details', exact: true });
  await expect(dialog.getByRole('heading', { name: 'Bathroom repair', exact: true })).toBeVisible();
  await expect(dialog.locator('li').filter({ hasText: 'The existing private history remains visible.' })).toBeVisible();
  const reply = dialog.getByLabel('Private reply', { exact: true }); await expect(reply).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Save private update', exact: true })).toBeDisabled();
  await reply.fill('The repair is scheduled for tomorrow.');
  await expect(dialog.getByRole('button', { name: 'Save private update', exact: true })).toBeEnabled();
  const responseRequest = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === `/api/complaints/${entityId}/comments`);
  await dialog.getByRole('button', { name: 'Save private update', exact: true }).click(); await responseRequest;
  await expect.poll(() => state.requestWrites.length).toBe(1);
  expect(state.requestWrites[0]).toEqual({ method: 'POST', path: `/complaints/${entityId}/comments`, body: { text: 'The repair is scheduled for tomorrow.' } });
  expect(state.reads.some((read) => read.path === `/requests/complaint/${entityId}`)).toBe(true);
  expect(state.reads.some((read) => read.path.startsWith('/resident/requests'))).toBe(false);
  await expect(dialog).toHaveCount(0); await expect(page.getByLabel(/\d+ unread notifications/)).toHaveCount(0);
});

test('foreign payloads remain hidden and unsafe notification links never navigate or fetch unrelated APIs', async ({ page }) => {
  const own = notification(1, false, { path: 'https://evil.example/steal' }), foreign = notification(2, false, { title: 'FOREIGN PRIVATE TITLE', recipientId: entityId, pgId: entityId });
  const state = await setup(page, { rows: [own, foreign], bypassScope: true }); await page.goto('/resident/notifications');
  const feed = page.getByRole('region', { name: 'Notification list', exact: true });
  await expect(feed.getByText('Notifications could not be verified for this account. Please refresh.', { exact: true })).toBeVisible(); await expect(page.getByText('FOREIGN PRIVATE TITLE', { exact: true })).toHaveCount(0);
  state.bypassScope = false; await feed.getByRole('button', { name: 'Try again', exact: true }).click(); await feed.getByRole('button', { name: 'Update 1', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('This notification does not have an available application link.', { exact: true })).toBeVisible(); await expect(page).toHaveURL(/\/resident\/notifications$/);
  expect(state.reads.every((read) => read.path.startsWith('/notifications'))).toBe(true);
});

test('load/write errors recover, missing records are friendly and session expiry clears private UI', async ({ page }) => {
  const state = await setup(page, { rows: [notification(1)], failList: true, failCount: true, failWrite: true, missing: true }); await page.goto('/resident/notifications');
  const feed = page.getByRole('region', { name: 'Notification list', exact: true });
  await expect(feed.getByText('Notifications are temporarily unavailable', { exact: true })).toBeVisible();
  await expect(page.getByText('Unread count is temporarily unavailable', { exact: false })).toBeVisible();
  state.failList = false; state.failCount = false; await feed.getByRole('button', { name: 'Try again', exact: true }).click(); await page.getByRole('button', { name: 'Retry unread count', exact: true }).click();
  await feed.getByRole('button', { name: 'Mark Update 1 as read', exact: true }).click(); await expect(feed.getByRole('alert')).toHaveText('Could not update notifications. Please try again.');
  await expect(feed.getByRole('article').getByText('Unread', { exact: true })).toBeVisible();
  state.failWrite = false; await feed.getByRole('button', { name: 'Update 1', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('This related item is no longer available in this view.', { exact: true })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  state.expired = true; await page.evaluate(() => window.dispatchEvent(new Event('app:resume'))); await expect(page).toHaveURL(/\/resident\/login$/);
  await expect(page.getByText('A private account update 1', { exact: true })).toHaveCount(0); expect(await page.evaluate(() => localStorage.getItem('pg_token'))).toBeNull();
});

test('unread badges refresh on the polling interval and native app resume without resetting older pages', async ({ page }) => {
  await page.clock.install();
  const state = await setup(page, { ownerView: true, rows: Array.from({ length: 21 }, (_, index) => notification(index + 1, true)) }); await page.goto('/notifications');
  await expect(page.getByLabel('21 unread notifications', { exact: true })).toBeVisible();
  const feed = page.getByRole('region', { name: 'Notification list', exact: true }); await feed.getByRole('button', { name: 'Older notifications', exact: true }).click(); await expect(feed.getByText('Page 2 of 2', { exact: true })).toBeVisible();
  state.rows.push(notification(22, true)); await page.clock.runFor(60000); await expect(page.getByLabel('22 unread notifications', { exact: true })).toBeVisible(); await expect(feed.getByText('Page 2 of 2', { exact: true })).toBeVisible();
  state.rows.push(notification(23, true)); await page.evaluate(() => window.dispatchEvent(new Event('app:resume'))); await expect(page.getByLabel('23 unread notifications', { exact: true })).toBeVisible();
  await expect(feed.getByText('Page 2 of 2', { exact: true })).toBeVisible(); expect(state.countReads).toBeGreaterThanOrEqual(3);
});
