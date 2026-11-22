import { test, expect } from '@playwright/test';

const owner = { id: '111111111111111111111111', name: 'Owner A', pgName: 'Test PG', role: 'owner', email: 'owner@example.test' };
const resident = { id: '222222222222222222222222', fullName: 'Resident A', pgId: owner.id, pgName: owner.pgName, role: 'resident', room: { id: '333333333333333333333333', roomNumber: '101' }, passwordChangeRequired: false };
const id = '444444444444444444444444', stamp = '2026-11-20T08:00:00.000Z';
const original = { id: `complaint:${id}`, sourceType: 'complaint', sourceId: id, category: 'Private Issue', title: 'Private bathroom repair', description: 'This sensitive detail stays inside the private request history.', priority: 'High', status: 'In Progress', createdAt: stamp,
  resident: { id: resident.id, name: resident.fullName }, room: { number: '101', bedNumber: 'A1' }, details: { originalCategory: 'Maintenance' }, ownerResponse: '',
  responses: [{ ownerName: resident.fullName, actorRole: 'resident', message: 'Status: New → Open', type: 'Created', createdAt: stamp }, { ownerName: owner.name, actorRole: 'owner', message: 'We are arranging a repair.', type: 'Comment', createdAt: stamp }] };
const foreignId = '555555555555555555555555';
const foreign = { ...structuredClone(original), id: `complaint:${foreignId}`, sourceId: foreignId, title: 'Foreign tenant issue', description: 'This belongs to another resident.', resident: { id: '666666666666666666666666', name: 'Resident B' }, room: { number: '202', bedNumber: 'B1' } };

async function setup(page, ownerView) {
  const state = { requests: [structuredClone(original), structuredClone(foreign)], writes: [] };
  await page.addInitScript((token) => localStorage.setItem('pg_token', token), ownerView ? 'owner-token' : 'resident-token');
  await page.route('**/api/**', async (route) => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname.slice(4), method = req.method();
    const isOwner = req.headers().authorization === 'Bearer owner-token';
    const reply = (data, status = 200, message = 'Saved') => route.fulfill({ status, json: { success: status < 400, ...(status < 400 ? { data, message } : { message: data }) } });
    if (path === '/auth/session') return reply(isOwner ? { owner } : { role: 'resident', resident });
    if (path === '/residents') return reply([]);
    if (path === '/notifications/unread-count') return reply({ unreadCount: 0 });
    if (['/requests', '/resident/requests'].includes(path) && method === 'GET') {
      const visible = state.requests.filter((request) => isOwner || request.resident.id === resident.id);
      return reply({ requests: visible, pagination: { page: 1, limit: 20, total: visible.length, totalPages: 1, hasMore: false } });
    }
    const detailMatch = path.match(/^(?:\/resident)?\/requests\/complaint\/([^/]+)$/);
    if (detailMatch && method === 'GET') {
      const request = state.requests.find((item) => item.sourceId === detailMatch[1]);
      if (!request || (!isOwner && request.resident.id !== resident.id)) return reply('Request not found', 404);
      return reply(request);
    }
    if (path === `/complaints/${id}/comments` && method === 'POST') {
      state.writes.push({ path, body: req.postDataJSON() });
      state.requests[0].responses.push({ ownerName: isOwner ? owner.name : resident.fullName, actorRole: isOwner ? 'owner' : 'resident', message: req.postDataJSON().text, createdAt: stamp });
      return reply(state.requests[0], 201, 'Comment added');
    }
    if (path === `/resident/complaints/${id}/comments` && method === 'POST') {
      state.writes.push({ path, body: req.postDataJSON() });
      state.requests[0].responses.push({ ownerName: resident.fullName, actorRole: 'resident', message: req.postDataJSON().text, createdAt: stamp });
      return reply(state.requests[0], 201, 'Comment added');
    }
    if (path === `/complaints/${id}/status` && method === 'PATCH' && isOwner) {
      state.writes.push({ path, body: req.postDataJSON() }); state.requests[0].status = req.postDataJSON().status; return reply(state.requests[0]);
    }
    return reply({});
  });
  return state;
}

test('resident accesses legacy private complaint history from My Requests', async ({ page }) => {
  const state = await setup(page, false);
  await page.goto('/resident/requests');
  await page.getByLabel('Filter my requests by category').selectOption('Private Issue');
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByText('Foreign tenant issue', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Request details', exact: true });
  await expect(dialog.getByRole('heading', { name: 'Private bathroom repair', exact: true })).toBeVisible();
  await expect(dialog.getByText('This sensitive detail stays inside the private request history.', { exact: true })).toBeVisible();
  await expect(dialog.locator('li').filter({ hasText: 'We are arranging a repair.' })).toBeVisible();
  await dialog.getByLabel('Comment', { exact: true }).fill('The leak is still present.');
  const commentRequestPromise = page.waitForRequest((request) => request.method() === 'POST'
    && new URL(request.url()).pathname.endsWith(`/resident/complaints/${id}/comments`));
  await dialog.getByRole('button', { name: 'Add comment', exact: true }).click();
  const commentRequest = await commentRequestPromise;
  expect(commentRequest.postDataJSON()).toEqual({ text: 'The leak is still present.' });
  await expect.poll(() => state.writes.length).toBe(1);
  expect(state.writes.at(-1)).toEqual({ path: `/resident/complaints/${id}/comments`, body: { text: 'The leak is still present.' } });
});

test('owner reviews private complaint history and resolves through the Requests section', async ({ page }) => {
  const state = await setup(page, true);
  await page.goto('/requests');
  await expect(page.getByText('Foreign tenant issue', { exact: true })).toBeVisible();
  await page.getByRole('article').filter({ hasText: 'Private bathroom repair' }).getByRole('button', { name: 'Details', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Request details', exact: true });
  await expect(dialog.getByText('Resident A · Room 101 · Bed A1', { exact: true })).toBeVisible();
  await dialog.getByLabel('Status', { exact: true }).selectOption('Resolved');
  await dialog.getByLabel('Private reply', { exact: true }).fill('Repair is complete.');
  const statusResponse = page.waitForResponse((response) => response.request().method() === 'PATCH' && new URL(response.url()).pathname === `/api/complaints/${id}/status`);
  await dialog.getByRole('button', { name: 'Save private update', exact: true }).click();
  await statusResponse;
  await expect.poll(() => state.writes.length).toBe(2);
  expect(state.writes.map((write) => write.path)).toEqual([`/complaints/${id}/comments`, `/complaints/${id}/status`]);
  expect(state.requests[0].status).toBe('Resolved');
});
