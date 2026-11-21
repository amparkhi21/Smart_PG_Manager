import { test, expect } from '@playwright/test';

const owner = { id: '111111111111111111111111', name: 'Owner A', role: 'owner', email: 'owner@example.test', pgName: 'Test PG' };
const source = { id: '222222222222222222222222', roomNumber: '101', floor: '1', roomType: 'Shared', airConditioning: 'AC', amenities: ['Wi-Fi'], monthlyRent: 4000, capacity: 4, occupiedBeds: 2, availableBeds: 2, status: 'Partially Occupied' };
const target = { ...source, id: '333333333333333333333333', roomNumber: '201', monthlyRent: 9000, capacity: 1, occupiedBeds: 0, availableBeds: 1, status: 'Vacant' };
const resident = { id: '444444444444444444444444', role: 'resident', fullName: 'Resident A', pgName: owner.pgName, phone: '+919876543210', email: '', room: { id: source.id, roomNumber: source.roomNumber }, joiningDate: '2026-01-01', accountStatus: 'active', loginEnabled: true, passwordChangeRequired: false };
const pendingRequest = () => ({ id: '555555555555555555555555', fromRoom: { id: source.id, roomNumber: '101' }, toRoom: { id: target.id, roomNumber: '201' }, reason: 'A quieter room for studying', status: 'Pending', createdAt: '2026-11-20T09:00:00Z', decisionNote: '', decidedAt: null, resident: { id: resident.id, fullName: resident.fullName } });

async function mockApi(page, { pending = false, fullOnSubmit = false } = {}) {
  const state = { requests: pending ? [pendingRequest()] : [], room: { ...resident.room }, submissions: [], decisions: [], fullOnSubmit };
  await page.route((url) => url.origin === 'http://127.0.0.1:4179' && url.pathname.startsWith('/api/'), async (route) => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname.slice(4);
    const ownerSession = req.headers().authorization?.includes('owner-token');
    const reply = (data, status = 200, message) => route.fulfill({ status, json: status >= 400 ? { success: false, message: data } : { success: true, data, ...(message && { message }) } });
    if (path === '/auth/session') return reply(ownerSession ? { owner } : { role: 'resident', resident: { ...resident, room: state.room } });
    if (path === '/resident/rooms') return reply({ currentRoomId: state.room.id, rooms: [source, target], filters: { floors: ['1'], roomTypes: ['Shared'] } });
    if (path === '/resident/my-room') return reply({ room: { ...(state.room.id === target.id ? { ...target, occupiedBeds: 1, availableBeds: 0, status: 'Full' } : source), assignedMonthlyRent: 4000 } });
    if (path === '/resident/room-change-requests' && req.method() === 'POST') {
      if (state.fullOnSubmit) return reply('This room is now full', 409);
      state.submissions.push(req.postDataJSON()); state.requests.push(pendingRequest());
      return reply(state.requests.at(-1), 201, 'Room change requested');
    }
    if ((path === '/resident/room-change-requests' || path === '/room-change-requests') && req.method() === 'GET') {
      const status = url.searchParams.get('status');
      return reply({ requests: state.requests.filter((request) => !status || request.status === status) });
    }
    if (path.startsWith('/room-change-requests/') && req.method() === 'PATCH') {
      const body = req.postDataJSON(); state.decisions.push(body);
      const request = state.requests[0]; request.status = body.decision; request.decisionNote = body.decisionNote; request.decidedAt = '2026-11-20T10:00:00Z';
      if (body.decision === 'Approved') state.room = { id: target.id, roomNumber: target.roomNumber };
      return reply(request, 200, `Room change ${body.decision.toLowerCase()}`);
    }
    return reply('Unexpected test endpoint', 404);
  });
  return state;
}

async function initialSession(page, token, path) {
  await page.addInitScript((value) => { if (!localStorage.getItem('pg_token')) localStorage.setItem('pg_token', value); }, token);
  await page.goto(path);
}
async function switchSession(page, token, path) {
  await page.evaluate((value) => localStorage.setItem('pg_token', value), token); await page.goto(path);
}

test('Phase 2B resident requests a vacant room, owner approves, resident sees the decision without logout', async ({ page }) => {
  const state = await mockApi(page);
  await initialSession(page, 'resident-token', '/resident/rooms');
  await expect(page.getByRole('article', { name: 'Room 101', exact: true }).getByRole('button', { name: 'Request Room Change', exact: true })).toHaveCount(0);
  await page.getByRole('article', { name: 'Room 201', exact: true }).getByRole('button', { name: 'Request Room Change', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('New room', { exact: true })).toHaveValue(target.id);
  await dialog.getByLabel('Reason for room change', { exact: true }).fill('A quieter room for studying');
  await dialog.getByRole('button', { name: 'Submit request', exact: true }).click();
  await expect(page).toHaveURL(/\/resident\/room-change-requests$/);
  await expect(page.locator('article').getByText('Pending', { exact: true })).toBeVisible();
  expect(state.submissions).toEqual([{ targetRoom: target.id, reason: 'A quieter room for studying' }]);
  await switchSession(page, 'owner-token', '/room-change-requests');
  await expect(page.getByRole('heading', { name: 'Resident A', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Owner response', { exact: true }).fill('Move confirmed');
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm approval', exact: true }).click();
  await expect.poll(() => state.decisions.length).toBe(1);
  expect(state.decisions[0]).toEqual({ decision: 'Approved', decisionNote: 'Move confirmed' });
  await switchSession(page, 'resident-token', '/resident/room-change-requests');
  await expect(page.locator('article').getByText('Approved', { exact: true })).toBeVisible();
  await expect(page.getByText('Owner response: Move confirmed', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'My Room', exact: true }).click();
  const room = page.getByRole('article', { name: 'Room 201', exact: true });
  await expect(room.getByText('Your monthly rent', { exact: true }).locator('..').locator('dd')).toHaveText(/4,000/);
  expect(await page.evaluate(() => localStorage.getItem('pg_token'))).toBe('resident-token');
  await page.setViewportSize({ width: 360, height: 800 });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('navigation', { name: 'Resident navigation' }).getByRole('link', { name: 'Room Change Requests', exact: true }).click();
  await expect(page.locator('article').getByText('Approved', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Phase 2B resident handles a room becoming full without losing the session or creating a request', async ({ page }) => {
  const state = await mockApi(page, { fullOnSubmit: true });
  await initialSession(page, 'resident-token', '/resident/rooms');
  await page.getByRole('button', { name: 'Request Room Change', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Reason for room change', { exact: true }).fill('A quieter room for studying');
  await page.getByRole('dialog').getByRole('button', { name: 'Submit request', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('This room is now full');
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Submit request', exact: true })).toBeEnabled();
  expect(state.requests).toHaveLength(0);
  expect(await page.evaluate(() => localStorage.getItem('pg_token'))).toBe('resident-token');
});

test('Phase 2B owner rejects with a reason and does not change the room', async ({ page }) => {
  const state = await mockApi(page, { pending: true });
  await initialSession(page, 'owner-token', '/room-change-requests');
  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Owner response', { exact: true }).fill('Room reserved for maintenance');
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm rejection', exact: true }).click();
  await expect.poll(() => state.decisions.length).toBe(1);
  expect(state.decisions[0].decision).toBe('Rejected');
  expect(state.room.id).toBe(source.id);
  await page.getByLabel('Filter room change requests', { exact: true }).selectOption('Rejected');
  await expect(page.getByText('Owner response: Room reserved for maintenance', { exact: true })).toBeVisible();
});
