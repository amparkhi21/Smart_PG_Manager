import { test, expect } from '@playwright/test';

const owner = { id: '111111111111111111111111', name: 'Owner A', pgName: 'Test PG', role: 'owner', email: 'owner@example.test' };
const resident = { id: '222222222222222222222222', fullName: 'Resident A', pgId: owner.id, pgName: owner.pgName, role: 'resident', room: { id: '333333333333333333333333', roomNumber: '101' }, passwordChangeRequired: false };
const stamp = '2026-11-21T08:00:00.000Z';
const activity = (id, status, ownerActor = false, response = '') => ({ id: `${id}-${status}`, status, response, actor: ownerActor ? { id: owner.id, name: owner.name, role: 'owner' } : { id: resident.id, name: resident.fullName, role: 'resident' }, createdAt: stamp });
function leave(index, extra = {}) {
  const id = String(index).padStart(24, '0');
  const data = { id, pgId: owner.id, resident: { id: resident.id, fullName: resident.fullName }, room: resident.room, fromDate: '2026-11-25', toDate: '2026-11-27', durationDays: 3, reason: 'PRIVATE leave to visit family', emergencyContact: null, status: 'Pending', response: '', createdAt: stamp, updatedAt: stamp, decidedAt: null, cancelledAt: null, ...extra };
  data.history = [activity(id, 'Pending')]; if (data.status !== 'Pending') data.history.push(activity(id, data.status, data.status !== 'Cancelled', data.response));
  return data;
}
async function setup(page, { ownerView = false, rows = [], failList = false, overlap = false, conflict = false } = {}) {
  const state = { rows, reads: [], writes: [], failList, overlap, conflict };
  await page.clock.setFixedTime(new Date('2026-11-20T18:45:00Z'));
  await page.addInitScript((token) => { if (!localStorage.getItem('pg_token')) localStorage.setItem('pg_token', token); }, ownerView ? 'owner-token' : 'resident-token');
  await page.route((url) => url.origin === 'http://127.0.0.1:4179' && url.pathname.startsWith('/api/'), async (route) => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname.slice(4), method = req.method(), isOwner = req.headers().authorization === 'Bearer owner-token';
    const reply = (data, status = 200, message = 'Saved') => route.fulfill({ status, json: status >= 400 ? { success: false, message: data } : { success: true, data, message } });
    if (path === '/auth/session') return reply(isOwner ? { owner } : { role: 'resident', resident });
    const base = isOwner ? '/leave-requests' : '/resident/leave-requests';
    if (!path.startsWith(base)) return reply('Unexpected or wrong-role endpoint', 404);
    if (method === 'GET') state.reads.push({ path, params: Object.fromEntries(url.searchParams) }); else state.writes.push({ method, path, body: req.postDataJSON() });
    if (path === base && method === 'GET') {
      if (state.failList) return reply('Leave requests unavailable', 503);
      const filtered = state.rows.filter((row) => (isOwner || row.resident.id === resident.id) && (!url.searchParams.get('status') || row.status === url.searchParams.get('status')) && (!url.searchParams.get('date') || (row.fromDate <= url.searchParams.get('date') && row.toDate >= url.searchParams.get('date'))));
      const page = Number(url.searchParams.get('page') || 1), limit = Number(url.searchParams.get('limit') || 20);
      return reply({ requests: filtered.slice((page - 1) * limit, page * limit), pagination: { page, limit, total: filtered.length, totalPages: Math.ceil(filtered.length / limit), hasMore: page * limit < filtered.length } });
    }
    if (path === base && method === 'POST' && !isOwner) {
      if (state.overlap) return reply('These dates overlap an existing Pending or Approved leave request', 409);
      const body = req.postDataJSON(), row = leave(999, { ...body, durationDays: (Date.parse(body.toDate) - Date.parse(body.fromDate)) / 86400000 + 1 }); state.rows.unshift(row);
      return reply(row, 201, 'Leave request submitted');
    }
    const [id, action] = path.slice(base.length + 1).split('/'), row = state.rows.find((value) => value.id === id && (isOwner || value.resident.id === resident.id));
    if (!row) return reply('Leave request not found', 404);
    if (method === 'GET') return reply(row);
    if (state.conflict) { row.status = 'Approved'; return reply('This leave request has already been finalized', 409); }
    if (row.status !== 'Pending') return reply('This leave request has already been finalized', 409);
    if (action === 'cancel' && method === 'POST' && !isOwner) { row.status = 'Cancelled'; row.cancelledAt = stamp; }
    else if (action === 'decision' && method === 'PATCH' && isOwner) { row.status = req.postDataJSON().decision; row.response = req.postDataJSON().response; row.decidedAt = stamp; }
    else return reply('Unsupported action', 404);
    row.history.push(activity(row.id, row.status, isOwner, row.response)); return reply(row, 200, 'Leave request ' + row.status.toLowerCase());
  });
  return state;
}

test('resident validates Indian dates, submits once, views private history and confirms pending cancellation', async ({ page }) => {
  const state = await setup(page); await page.goto('/resident/leave-requests');
  await expect(page.getByText('No leave requests yet', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Request leave', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Request leave', exact: true });
  await expect(dialog.getByLabel('From Date', { exact: true })).toHaveValue('2026-11-21');
  await dialog.getByLabel('From Date', { exact: true }).fill('2026-11-25'); await dialog.getByLabel('To Date', { exact: true }).fill('2026-11-24');
  await dialog.getByRole('button', { name: 'Submit leave request', exact: true }).click();
  await expect(dialog.getByText('Choose an end date on or after the start date.', { exact: true })).toBeVisible(); expect(state.writes).toHaveLength(0);
  await dialog.getByLabel('To Date', { exact: true }).fill('2026-11-27'); await dialog.getByLabel('Reason', { exact: true }).fill('Visiting family');
  await dialog.getByLabel('Emergency Contact (optional)', { exact: true }).fill('+91 (98765) 43210');
  await expect(dialog.getByText('Duration: 3 days', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Submit leave request', exact: true }).evaluate((button) => { button.click(); button.click(); });
  dialog = page.getByRole('dialog', { name: 'Leave request history', exact: true });
  await expect(dialog.getByRole('list', { name: 'Leave request activity', exact: true }).getByText('Pending', { exact: true })).toBeVisible();
  expect(state.writes).toHaveLength(1); expect(state.writes[0].body).toEqual({ fromDate: '2026-11-25', toDate: '2026-11-27', reason: 'Visiting family', emergencyContact: '+919876543210' });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  const card = page.getByRole('article'); await expect(card.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
  await card.getByRole('button', { name: 'Cancel request', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Cancel this leave request?', exact: true });
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click(); expect(state.rows[0].status).toBe('Pending');
  await card.getByRole('button', { name: 'Cancel request', exact: true }).click();
  await confirm.getByRole('button', { name: 'Cancel leave request', exact: true }).evaluate((button) => { button.click(); button.click(); });
  await expect(card.getByText('Cancelled', { exact: true })).toBeVisible(); await expect(card.getByRole('button', { name: 'Cancel request', exact: true })).toHaveCount(0);
  expect(state.writes.filter((write) => write.path.endsWith('/cancel'))).toHaveLength(1);
});

test('owner approves and rejects with optional remarks, sees history and cannot repeat decisions', async ({ page }) => {
  const state = await setup(page, { ownerView: true, rows: [leave(1), leave(2, { resident: { id: '444444444444444444444444', fullName: 'Resident B' }, reason: 'Examination leave' })] });
  await page.goto('/leave-requests');
  await expect(page.getByRole('link', { name: 'Leave Management', exact: true })).toHaveAttribute('href', '/leave-requests');
  await page.getByLabel('Filter leave requests by status', { exact: true }).selectOption('Pending');
  const first = page.getByRole('article').filter({ hasText: resident.fullName });
  await first.getByRole('button', { name: 'Approve', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Approve leave request', exact: true });
  await dialog.getByLabel('Remarks (optional)', { exact: true }).fill('Approved. Travel safely.');
  await dialog.getByRole('button', { name: 'Confirm approval', exact: true }).evaluate((button) => { button.click(); button.click(); });
  await expect(first).toHaveCount(0);
  expect(state.writes[0]).toEqual({ method: 'PATCH', path: '/leave-requests/' + leave(1).id + '/decision', body: { decision: 'Approved', response: 'Approved. Travel safely.' } });
  await page.getByRole('article').getByRole('button', { name: 'Reject', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Reject leave request', exact: true });
  await dialog.getByRole('button', { name: 'Confirm rejection', exact: true }).click();
  await expect(page.getByText('No leave requests match', { exact: true })).toBeVisible();
  await page.getByLabel('Filter leave requests by status', { exact: true }).selectOption('Approved');
  await expect(first.getByText('Owner response: Approved. Travel safely.', { exact: true })).toBeVisible();
  await expect(first.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
  await first.getByRole('button', { name: 'View history', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('list', { name: 'Leave request activity', exact: true }).getByText('Approved. Travel safely.', { exact: true })).toBeVisible();
  expect(state.writes).toHaveLength(2); expect(state.writes[1].body.response).toBe('');
});

test('resident pagination and full search use private APIs; overlap errors retain the mobile form', async ({ page }) => {
  const rows = Array.from({ length: 21 }, (_, index) => leave(index + 1, { reason: index === 20 ? 'Unique off-page leave' : 'Family visit ' + index, status: index % 4 === 0 ? 'Approved' : index % 4 === 1 ? 'Rejected' : index % 4 === 2 ? 'Cancelled' : 'Pending' }));
  const state = await setup(page, { rows, overlap: true }); await page.setViewportSize({ width: 360, height: 800 }); await page.goto('/resident/leave-requests');
  await page.getByRole('navigation', { name: 'Leave request pages', exact: true }).getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('article').getByText('Unique off-page leave', { exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search leave requests', exact: true }).fill('unique 101');
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('navigation', { name: 'Leave request pages', exact: true })).toContainText('1 requests');
  expect(state.reads.some((read) => read.params.limit === '100')).toBe(true); expect(state.reads.every((read) => !('search' in read.params))).toBe(true);
  await page.getByRole('button', { name: 'Request leave', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Request leave', exact: true });
  await dialog.getByLabel('Reason', { exact: true }).fill('Conflicting visit');
  await dialog.getByRole('button', { name: 'Submit leave request', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('These dates overlap an existing Pending or Approved leave request');
  await expect(dialog.getByLabel('Reason', { exact: true })).toHaveValue('Conflicting visit');
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Resident navigation' }).getByRole('link', { name: 'Leave Requests', exact: true })).toHaveAttribute('href', '/resident/leave-requests');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(state.reads.every((read) => read.path.startsWith('/resident/leave-requests'))).toBe(true);
});

test('owner handles loading failures and finalized-request conflicts without duplicate writes', async ({ page }) => {
  const state = await setup(page, { ownerView: true, rows: [leave(1)], failList: true, conflict: true }); await page.goto('/leave-requests');
  await expect(page.getByText('Leave requests unavailable', { exact: true })).toBeVisible(); state.failList = false;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await page.getByRole('article').getByRole('button', { name: 'Approve', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm approval', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('This leave request has already been finalized');
  await expect(page.getByRole('dialog')).toHaveCount(0); await expect(page.getByRole('article').getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
  expect(state.writes).toHaveLength(1);
});
