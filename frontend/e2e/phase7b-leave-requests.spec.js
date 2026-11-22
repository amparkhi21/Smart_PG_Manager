import { test, expect } from '@playwright/test';

const owner = { id: '111111111111111111111111', name: 'Owner A', pgName: 'Test PG', role: 'owner', email: 'owner@example.test' };
const resident = { id: '222222222222222222222222', fullName: 'Resident A', pgId: owner.id, pgName: owner.pgName, role: 'resident', room: { id: '333333333333333333333333', roomNumber: '101' }, passwordChangeRequired: false };
const stamp = '2026-11-21T08:00:00.000Z';
function leave(index, extra = {}) {
  const id = String(index).padStart(24, '0');
  return { id, pgId: owner.id, resident: { id: resident.id, fullName: resident.fullName }, room: resident.room, fromDate: '2026-11-25', toDate: '2026-11-27', durationDays: 3, reason: 'PRIVATE leave to visit family', emergencyContact: null, status: 'Pending', response: '', createdAt: stamp, updatedAt: stamp, decidedAt: null, cancelledAt: null, ...extra };
}
const unified = (request) => ({ id: `leave:${request.id}`, sourceType: 'leave', sourceId: request.id,
  category: 'Leave Request', title: `Leave · ${request.fromDate} to ${request.toDate}`, description: request.reason, priority: 'Normal',
  status: request.status, createdAt: request.createdAt, ownerResponse: request.response || '',
  resident: { id: request.resident.id, name: request.resident.fullName },
  room: { id: request.room.id, number: request.room.roomNumber || '101', bedNumber: request.resident.bedNumber || null },
  details: { fromDate: request.fromDate, toDate: request.toDate, durationDays: request.durationDays, emergencyContact: request.emergencyContact } });

async function setup(page, { ownerView = false, rows = [], failList = false, overlap = false, conflict = false } = {}) {
  const state = { rows, reads: [], writes: [], failList, overlap, conflict };
  await page.clock.setFixedTime(new Date('2026-11-20T18:45:00Z'));
  await page.addInitScript((token) => { if (!localStorage.getItem('pg_token')) localStorage.setItem('pg_token', token); }, ownerView ? 'owner-token' : 'resident-token');
  await page.route((url) => url.origin === 'http://127.0.0.1:4179' && url.pathname.startsWith('/api/'), async (route) => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname.slice(4), method = req.method(), isOwner = req.headers().authorization === 'Bearer owner-token';
    const reply = (data, status = 200, message = 'Saved') => route.fulfill({ status, json: status >= 400 ? { success: false, message: data } : { success: true, data, message } });
    if (path === '/auth/session') return reply(isOwner ? { owner } : { role: 'resident', resident });
    if (path === '/residents' && method === 'GET') return reply([]);
    if ((path === '/requests' || path === '/resident/requests') && method === 'GET') {
      const params = Object.fromEntries(url.searchParams); state.reads.push({ path, params });
      if (isOwner && state.failList) return reply('Leave requests unavailable', 503);
      const filtered = state.rows.filter((row) => (isOwner || row.resident.id === resident.id)
        && (!params.category || params.category === 'Leave Request') && (!params.status || row.status === params.status));
      const pageNumber = Number(params.page || 1), limit = Number(params.limit || 20), start = (pageNumber - 1) * limit;
      return reply({ requests: filtered.slice(start, start + limit).map(unified), pagination: { page: pageNumber, limit, total: filtered.length, totalPages: Math.ceil(filtered.length / limit), hasMore: start + limit < filtered.length } });
    }
    const detailMatch = path.match(/^(?:\/resident)?\/requests\/leave\/([^/]+)$/);
    if (detailMatch && method === 'GET') {
      const row = state.rows.find((item) => item.id === detailMatch[1] && (isOwner || item.resident.id === resident.id));
      return row ? reply(unified(row)) : reply('Leave request not found', 404);
    }
    if (method !== 'GET') state.writes.push({ method, path, body: req.postDataJSON() });
    if (path === '/resident/leave-requests' && method === 'POST' && !isOwner) {
      if (state.overlap) return reply('These dates overlap an existing Pending or Approved leave request', 409);
      const body = req.postDataJSON(), row = leave(999, { ...body, durationDays: (Date.parse(body.toDate) - Date.parse(body.fromDate)) / 86400000 + 1 });
      state.rows.unshift(row); return reply(row, 201, 'Leave request submitted');
    }
    const cancelMatch = path.match(/^\/resident\/leave-requests\/([^/]+)\/cancel$/);
    if (cancelMatch && method === 'POST' && !isOwner) {
      const row = state.rows.find((value) => value.id === cancelMatch[1] && value.resident.id === resident.id);
      if (!row) return reply('Leave request not found', 404);
      if (row.status !== 'Pending') return reply('This leave request has already been finalized', 409);
      row.status = 'Cancelled'; row.cancelledAt = stamp; return reply(row, 200, 'Leave request cancelled');
    }
    const decisionMatch = path.match(/^\/leave-requests\/([^/]+)\/decision$/);
    if (decisionMatch && method === 'PATCH' && isOwner) {
      const row = state.rows.find((value) => value.id === decisionMatch[1]);
      if (!row) return reply('Leave request not found', 404);
      if (state.conflict) { row.status = 'Approved'; return reply('This leave request has already been finalized', 409); }
      if (row.status !== 'Pending') return reply('This leave request has already been finalized', 409);
      row.status = req.postDataJSON().decision; row.response = req.postDataJSON().response; row.decidedAt = stamp;
      return reply(row, 200, 'Leave request ' + row.status.toLowerCase());
    }
    return reply('Unexpected or wrong-role endpoint', 404);
  });
  return state;
}

async function chooseLeaveRequest(page) {
  await page.getByRole('button', { name: 'New request', exact: true }).click();
  const chooser = page.getByRole('dialog', { name: 'Choose request type', exact: true });
  await chooser.getByLabel('Request category', { exact: true }).selectOption('Leave Request');
  await chooser.getByRole('button', { name: 'Continue', exact: true }).click();
}

test('resident validates Indian dates, submits once, views request details and cancels a pending leave', async ({ page }) => {
  const state = await setup(page); await page.goto('/resident/requests');
  await expect(page.getByText('No requests yet', { exact: true })).toBeVisible();
  await chooseLeaveRequest(page);
  let dialog = page.getByRole('dialog', { name: 'Request leave', exact: true });
  await expect(dialog.getByLabel('From Date', { exact: true })).toHaveValue('2026-11-21');
  await dialog.getByLabel('From Date', { exact: true }).fill('2026-11-25'); await dialog.getByLabel('To Date', { exact: true }).fill('2026-11-24');
  await dialog.getByRole('button', { name: 'Submit leave request', exact: true }).click();
  await expect(dialog.getByText('Choose an end date on or after the start date.', { exact: true })).toBeVisible(); expect(state.writes).toHaveLength(0);
  await dialog.getByLabel('To Date', { exact: true }).fill('2026-11-27'); await dialog.getByLabel('Reason', { exact: true }).fill('Visiting family');
  await dialog.getByLabel('Emergency Contact (optional)', { exact: true }).fill('+91 (98765) 43210');
  await expect(dialog.getByText('Duration: 3 days', { exact: true })).toBeVisible();
  const createResponse = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/resident/leave-requests');
  await dialog.getByRole('button', { name: 'Submit leave request', exact: true }).evaluate((button) => { button.click(); button.click(); });
  await createResponse;
  await expect.poll(() => state.writes.length).toBe(1);
  expect(state.writes[0].body).toEqual({ fromDate: '2026-11-25', toDate: '2026-11-27', reason: 'Visiting family', emergencyContact: '+919876543210' });
  const card = page.getByRole('article'); await expect(card.getByText('Pending', { exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'Details', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Request details', exact: true });
  await expect(dialog.getByText('Visiting family', { exact: true })).toBeVisible(); await expect(dialog.getByText(/3 day\(s\)/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel pending request', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Cancel this request?', exact: true });
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click(); expect(state.rows[0].status).toBe('Pending');
  await dialog.getByRole('button', { name: 'Cancel pending request', exact: true }).click();
  const cancelResponse = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/leave-requests/000000000000000000000999/cancel'));
  await page.getByRole('dialog', { name: 'Cancel this request?', exact: true }).getByRole('button', { name: 'Cancel request', exact: true }).click();
  await cancelResponse;
  await expect.poll(() => state.rows[0].status).toBe('Cancelled');
  await expect(card.getByText('Cancelled', { exact: true })).toBeVisible();
  expect(state.writes.filter((write) => write.path.endsWith('/cancel'))).toHaveLength(1);
});

test('owner approves and rejects with optional remarks and cannot repeat decisions', async ({ page }) => {
  const state = await setup(page, { ownerView: true, rows: [leave(1), leave(2, { resident: { id: '444444444444444444444444', fullName: 'Resident B' }, reason: 'Examination leave' })] });
  await page.goto('/requests');
  await page.getByLabel('Filter by status', { exact: true }).selectOption('Pending');
  const first = page.getByRole('article').filter({ hasText: resident.fullName });
  await first.getByRole('button', { name: 'Details', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Request details', exact: true });
  await dialog.getByRole('button', { name: 'Approve', exact: true }).click();
  await dialog.getByLabel('Reply or reason (optional)', { exact: true }).fill('Approved. Travel safely.');
  const approvalResponse = page.waitForResponse((response) => response.request().method() === 'PATCH' && new URL(response.url()).pathname.endsWith('/leave-requests/000000000000000000000001/decision'));
  await dialog.getByRole('button', { name: 'Confirm approved', exact: true }).click(); await approvalResponse;
  await expect.poll(() => state.writes.length).toBe(1);
  await expect(first).toHaveCount(0);
  expect(state.writes[0]).toEqual({ method: 'PATCH', path: '/leave-requests/' + leave(1).id + '/decision', body: { decision: 'Approved', response: 'Approved. Travel safely.' } });
  const second = page.getByRole('article').filter({ hasText: 'Resident B' });
  await second.getByRole('button', { name: 'Details', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Request details', exact: true });
  await dialog.getByRole('button', { name: 'Reject', exact: true }).click();
  const rejectionResponse = page.waitForResponse((response) => response.request().method() === 'PATCH' && new URL(response.url()).pathname.endsWith('/leave-requests/000000000000000000000002/decision'));
  await dialog.getByRole('button', { name: 'Confirm rejected', exact: true }).click(); await rejectionResponse;
  await expect.poll(() => state.writes.length).toBe(2);
  await expect(page.getByText('No requests found', { exact: true })).toBeVisible();
  await page.getByLabel('Filter by status', { exact: true }).selectOption('Approved');
  await expect(first.getByText('Owner response: Approved. Travel safely.', { exact: true })).toBeVisible();
  await first.getByRole('button', { name: 'Details', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Request details', exact: true });
  await expect(dialog.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Reject', exact: true })).toHaveCount(0);
  expect(state.writes[1].body.response).toBe('');
});

test('resident pagination and overlap errors use unified requests while the mobile form retains its data', async ({ page }) => {
  const rows = Array.from({ length: 21 }, (_, index) => leave(index + 1, { reason: index === 20 ? 'Unique off-page leave' : 'Family visit ' + index, status: index % 4 === 0 ? 'Approved' : index % 4 === 1 ? 'Rejected' : index % 4 === 2 ? 'Cancelled' : 'Pending' }));
  const state = await setup(page, { rows, overlap: true }); await page.setViewportSize({ width: 360, height: 800 }); await page.goto('/resident/requests');
  await page.getByRole('navigation', { name: 'Request pages', exact: true }).getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('article').getByText('Unique off-page leave', { exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Request pages', exact: true })).toContainText('Page 2 of 2');
  expect(state.reads.some((read) => read.params.limit === '20' && read.params.page === '2')).toBe(true);
  await chooseLeaveRequest(page);
  const dialog = page.getByRole('dialog', { name: 'Request leave', exact: true });
  await dialog.getByLabel('Reason', { exact: true }).fill('Conflicting visit');
  const overlapResponse = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/resident/leave-requests');
  await dialog.getByRole('button', { name: 'Submit leave request', exact: true }).click(); await overlapResponse;
  await expect(dialog.getByRole('alert')).toHaveText('These dates overlap an existing Pending or Approved leave request');
  await expect(dialog.getByLabel('Reason', { exact: true })).toHaveValue('Conflicting visit');
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Resident navigation' }).getByRole('link', { name: 'My Requests', exact: true })).toHaveAttribute('href', '/resident/requests');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(state.reads.every((read) => read.path === '/resident/requests')).toBe(true);
});

test('owner handles loading failures and finalized-request conflicts without duplicate writes', async ({ page }) => {
  const state = await setup(page, { ownerView: true, rows: [leave(1)], failList: true, conflict: true }); await page.goto('/requests');
  await expect(page.getByText('Leave requests unavailable', { exact: true })).toBeVisible(); state.failList = false;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await page.getByRole('article').getByRole('button', { name: 'Details', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Request details', exact: true });
  await dialog.getByRole('button', { name: 'Approve', exact: true }).click();
  const conflictResponse = page.waitForResponse((response) => response.request().method() === 'PATCH' && new URL(response.url()).pathname.endsWith('/leave-requests/000000000000000000000001/decision'));
  await dialog.getByRole('button', { name: 'Confirm approved', exact: true }).click(); await conflictResponse;
  await expect(dialog.getByRole('alert')).toHaveText('This leave request has already been finalized');
  await expect(dialog.getByText('Approved', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Confirm approved', exact: true })).toHaveCount(0);
  await expect.poll(() => state.writes.length).toBe(1);
});
