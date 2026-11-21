import { test, expect } from '@playwright/test';

const owner = { id: '111111111111111111111111', name: 'Owner A', pgName: 'Test PG', role: 'owner', email: 'owner@example.test' };
const resident = { id: '222222222222222222222222', fullName: 'Resident A', pgId: owner.id, pgName: owner.pgName, role: 'resident', room: { id: '333333333333333333333333', roomNumber: '101' }, passwordChangeRequired: false };
const stamp = '2026-11-20T08:00:00.000Z';
function complaint(index, extra = {}) {
  return { id: String(index).padStart(24, '0'), pgId: owner.id, resident: { id: resident.id, fullName: resident.fullName, roomNumberAtCreation: '101' }, room: null,
    title: 'Complaint ' + index, description: 'PRIVATE complaint description ' + index, category: 'Maintenance', priority: 'High', status: 'Open', resolutionNote: '', resolvedAt: null, reopenedAt: null, createdAt: stamp, updatedAt: stamp, lastActivityAt: stamp, ...extra };
}
function event(complaintId, index, extra = {}) { return { id: 'event-' + index, complaintId, pgId: owner.id, residentId: resident.id, actor: { id: resident.id, role: 'resident', name: resident.fullName }, type: 'Created', text: '', fromStatus: null, toStatus: 'Open', createdAt: stamp, ...extra }; }
async function setup(page, { ownerView = false, rows = [], failList = false, failWrite = false } = {}) {
  const state = { rows, histories: new Map(rows.map((row) => [row.id, [event(row.id, 0)]])), reads: [], writes: [], failList, failWrite };
  await page.addInitScript((token) => { if (!localStorage.getItem('pg_token')) localStorage.setItem('pg_token', token); }, ownerView ? 'owner-token' : 'resident-token');
  await page.route((url) => url.origin === 'http://127.0.0.1:4179' && url.pathname.startsWith('/api/'), async (route) => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname.slice(4), method = req.method(), isOwner = req.headers().authorization === 'Bearer owner-token';
    const reply = (data, status = 200, message = 'Saved') => route.fulfill({ status, json: status >= 400 ? { success: false, message: data } : { success: true, data, message } });
    if (path === '/auth/session') return reply(isOwner ? { owner } : { role: 'resident', resident });
    if (method === 'GET') state.reads.push({ path, params: Object.fromEntries(url.searchParams) });
    if (path === '/resident/rooms') return reply({ rooms: [{ id: resident.room.id, roomNumber: '101' }] });
    const base = isOwner ? '/complaints' : '/resident/complaints';
    if (!path.startsWith(base)) return reply('Unexpected or wrong-role endpoint', 404);
    const pageNumber = Number(url.searchParams.get('page') || 1), limit = Number(url.searchParams.get('limit') || 20);
    const paged = (items, key) => ({ [key]: items.slice((pageNumber - 1) * limit, pageNumber * limit), pagination: { page: pageNumber, limit, total: items.length, totalPages: Math.ceil(items.length / limit), hasMore: pageNumber * limit < items.length } });
    if (method !== 'GET') state.writes.push({ method, path, body: req.postDataJSON() });
    if (state.failWrite && method !== 'GET') return reply('Too many complaint updates. Please wait a minute and try again.', 429);
    if (path === base && method === 'GET') {
      if (state.failList) return reply('Complaints unavailable', 503);
      const filtered = state.rows.filter((row) => (isOwner || row.resident.id === resident.id) && ['status', 'category', 'priority'].every((field) => !url.searchParams.get(field) || row[field] === url.searchParams.get(field)));
      return reply(paged(filtered, 'complaints'));
    }
    if (path === base && method === 'POST') {
      const body = req.postDataJSON(), row = complaint(999, { ...body, room: body.room ? { id: body.room, roomNumber: '101' } : null });
      state.rows.unshift(row); state.histories.set(row.id, [event(row.id, 0)]); return reply(row, 201, 'Complaint submitted privately to your PG owner');
    }
    const tail = path.slice(base.length + 1).split('/'), row = state.rows.find((value) => value.id === tail[0] && (isOwner || value.resident.id === resident.id));
    if (!row) return reply('Complaint not found', 404);
    const history = state.histories.get(row.id);
    if (method === 'GET') return reply(tail[1] === 'history' ? paged(history, 'events') : row);
    const body = req.postDataJSON(), actor = isOwner ? { id: owner.id, role: 'owner', name: owner.name } : { id: resident.id, role: 'resident', name: resident.fullName };
    if (tail[1] === 'comments') history.push(event(row.id, history.length, { type: 'Comment', actor, text: body.text, toStatus: null }));
    else if (tail[1] === 'status' && isOwner && method === 'PATCH') { const fromStatus = row.status; row.status = body.status; row.resolutionNote = body.resolutionNote || ''; row.resolvedAt = row.status === 'Resolved' ? stamp : null; history.push(event(row.id, history.length, { type: 'Status Changed', actor, fromStatus, toStatus: row.status, text: body.resolutionNote || '' })); }
    else if (tail[1] === 'reopen' && !isOwner && method === 'POST') { if (row.status !== 'Resolved') return reply('Only a resolved complaint can be reopened', 409); row.status = 'Open'; row.resolvedAt = null; row.resolutionNote = ''; row.reopenedAt = stamp; history.push(event(row.id, history.length, { type: 'Reopened', actor, fromStatus: 'Resolved', toStatus: 'Open' })); }
    else return reply('Unsupported action', 404);
    return reply(row, tail[1] === 'comments' ? 201 : 200, tail[1] === 'comments' ? 'Comment added' : 'Complaint updated');
  });
  return state;
}

test('resident validates and creates a private complaint, comments, views owner history and reopens a resolution', async ({ page }) => {
  const state = await setup(page);
  await page.goto('/resident/complaints');
  await expect(page.getByText('No complaints yet', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Create complaint', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Create a complaint', exact: true });
  await dialog.getByRole('button', { name: 'Submit complaint', exact: true }).click();
  await expect(dialog.getByText('Enter a title of 1 to 120 characters.', { exact: true })).toBeVisible(); expect(state.writes).toHaveLength(0);
  await dialog.getByLabel('Title', { exact: true }).fill('Wi-Fi stops working');
  await dialog.getByLabel('Description', { exact: true }).fill('PRIVATE: the connection drops every evening.');
  await dialog.getByLabel('Category', { exact: true }).selectOption('Wi-Fi');
  await dialog.getByLabel('Priority', { exact: true }).selectOption('Urgent');
  await expect(dialog.getByLabel('Room (optional)', { exact: true })).toBeEnabled();
  await dialog.getByLabel('Room (optional)', { exact: true }).selectOption(resident.room.id);
  await dialog.getByRole('button', { name: 'Submit complaint', exact: true }).evaluate((button) => { button.click(); button.click(); });
  dialog = page.getByRole('dialog', { name: 'Complaint details', exact: true });
  await expect(dialog.getByRole('heading', { name: 'Wi-Fi stops working', exact: true })).toBeVisible();
  expect(state.writes).toHaveLength(1); expect(state.writes[0].body.room).toBe(resident.room.id);
  await expect(dialog.getByRole('button', { name: 'Update status', exact: true })).toHaveCount(0);
  await dialog.getByLabel('Follow-up comment', { exact: true }).fill('It is still dropping today.');
  await dialog.getByRole('button', { name: 'Add comment', exact: true }).click();
  await expect(dialog.getByRole('region', { name: 'Complaint activity', exact: true }).getByText('It is still dropping today.', { exact: true })).toBeVisible();
  const row = state.rows[0]; row.status = 'Resolved'; row.resolutionNote = 'Router replaced'; row.resolvedAt = stamp;
  state.histories.get(row.id).push(event(row.id, 2, { actor: { id: owner.id, name: owner.name, role: 'owner' }, type: 'Status Changed', fromStatus: 'Open', toStatus: 'Resolved', text: 'Router replaced' }));
  await dialog.getByRole('button', { name: 'Refresh activity', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Reopen complaint', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Reopen complaint', exact: true }).click();
  await page.getByRole('dialog', { name: 'Reopen this complaint?', exact: true }).getByRole('button', { name: 'Reopen complaint', exact: true }).click();
  await expect(dialog.getByRole('region', { name: 'Complaint information', exact: true }).getByText('Open', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Complaint reopened', { exact: true })).toBeVisible();
  expect(state.writes.every((write) => write.path.startsWith('/resident/complaints'))).toBe(true);
  expect(state.reads.every((read) => !read.path.includes('community'))).toBe(true);
});

test('owner sees accurate summary counts, searches beyond page one, resolves and responds with paginated activity', async ({ page }) => {
  const rows = Array.from({ length: 21 }, (_, index) => complaint(index + 1, index === 20 ? { title: 'Hidden water issue', category: 'Water', priority: 'Urgent' } : index === 0 ? { status: 'Resolved' } : index === 1 ? { status: 'In Progress' } : {}));
  const state = await setup(page, { ownerView: true, rows });
  const target = rows.at(-1);
  state.histories.set(target.id, Array.from({ length: 21 }, (_, index) => event(target.id, index, { type: index ? 'Comment' : 'Created', text: index ? 'Past follow-up ' + index : '' })));
  await page.goto('/complaints');
  const summary = page.getByRole('region', { name: 'Complaint summary', exact: true });
  await expect(summary.getByRole('button', { name: 'Open 19', exact: true })).toBeVisible();
  await expect(summary.getByRole('button', { name: 'In Progress 1', exact: true })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Hidden water issue', exact: true })).toHaveCount(0);
  await page.getByRole('navigation', { name: 'Complaint list pages', exact: true }).getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Hidden water issue', exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search complaints', exact: true }).fill('hidden 101');
  await expect(page.getByRole('navigation', { name: 'Complaint list pages', exact: true })).toContainText('1 complaints');
  await expect(page.getByRole('region', { name: 'Complaint list', exact: true }).getByRole('article')).toHaveCount(1);
  expect(state.reads.some((read) => read.path === '/complaints' && read.params.limit === '100')).toBe(true);
  expect(state.reads.every((read) => !('search' in read.params))).toBe(true);
  await page.getByLabel('Filter complaints by category', { exact: true }).selectOption('Water');
  await page.getByRole('article', { name: 'Hidden water issue', exact: true }).getByRole('button', { name: 'View complaint', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Complaint details', exact: true });
  const history = dialog.getByRole('region', { name: 'Complaint activity', exact: true });
  await history.getByRole('navigation', { name: 'Complaint history pages', exact: true }).getByRole('button', { name: 'Next', exact: true }).click();
  await expect(history.getByText('Past follow-up 20', { exact: true })).toBeVisible();
  await dialog.getByLabel('New status', { exact: true }).selectOption('Resolved');
  await dialog.getByLabel('Resolution note (optional)', { exact: true }).fill('Water supply restored.');
  await dialog.getByRole('button', { name: 'Update status', exact: true }).click();
  await expect(dialog.getByRole('region', { name: 'Complaint information', exact: true }).getByText('Resolved', { exact: true })).toBeVisible();
  await dialog.getByLabel('Owner response', { exact: true }).fill('Please let us know if it happens again.');
  await dialog.getByRole('button', { name: 'Send response', exact: true }).click();
  await expect(history.getByText('Please let us know if it happens again.', { exact: true })).toBeVisible();
  expect(state.writes.find((write) => write.method === 'PATCH').body).toEqual({ status: 'Resolved', resolutionNote: 'Water supply restored.' });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(summary.getByRole('button', { name: 'Resolved 2', exact: true })).toBeVisible();
});

test('mobile complaint pages handle failed loads and writes, retain comments and expose resident navigation', async ({ page }) => {
  const state = await setup(page, { rows: [complaint(1)], failList: true });
  await page.setViewportSize({ width: 360, height: 800 }); await page.goto('/resident/complaints');
  await expect(page.getByText('Complaints unavailable', { exact: true })).toBeVisible(); state.failList = false;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await page.getByRole('button', { name: 'View complaint', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Complaint details', exact: true });
  await dialog.getByLabel('Follow-up comment', { exact: true }).fill('Please check this tomorrow.'); state.failWrite = true;
  await dialog.getByRole('button', { name: 'Add comment', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Too many complaint updates. Please wait a minute and try again.');
  await expect(dialog.getByLabel('Follow-up comment', { exact: true })).toHaveValue('Please check this tomorrow.');
  await expect(dialog.getByRole('button', { name: 'Add comment', exact: true })).toBeEnabled();
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
  await page.getByLabel('Filter complaints by status', { exact: true }).selectOption('Resolved');
  await expect(page.getByText('No complaints match', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Resident navigation' }).getByRole('link', { name: 'My Complaints', exact: true })).toHaveAttribute('href', '/resident/complaints');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
