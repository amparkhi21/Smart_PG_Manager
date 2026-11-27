import { test, expect } from '@playwright/test';

const owner = { id: '111111111111111111111111', name: 'Owner A', pgName: 'Test PG', role: 'owner', email: 'owner@example.test' };
const resident = { id: '222222222222222222222222', fullName: 'Resident A', pgId: owner.id, pgName: owner.pgName, role: 'resident', room: { id: '333333333333333333333333', roomNumber: '101' }, passwordChangeRequired: false };

async function setup(page, token) {
  await page.addInitScript((value) => localStorage.setItem('pg_token', value), token);
  await page.route('**/api/**', async (route) => {
    const request = route.request(), path = new URL(request.url()).pathname.slice(4);
    const isResident = request.headers().authorization === 'Bearer resident-token';
    const reply = (data) => route.fulfill({ status: 200, json: { success: true, data } });
    if (path === '/auth/session') return reply(isResident ? { role: 'resident', resident } : { owner });
    if (path === '/residents') return reply([]);
    if (path === '/requests' || path === '/resident/requests') return reply({ requests: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasMore: false } });
    if (path === '/notifications/unread-count') return reply({ count: 0 });
    return reply({});
  });
}

test('owner legacy complaint, leave, payment and room-change URLs redirect to Requests', async ({ page }) => {
  await setup(page, 'owner-token');
  for (const path of ['/complaints', '/leave-requests', '/payment-requests', '/room-change-requests']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/requests$/);
    await expect(page.getByRole('heading', { name: 'Requests', exact: true })).toBeVisible();
  }
});

test('resident legacy complaint, leave and room-change URLs redirect to My Requests', async ({ page }) => {
  await setup(page, 'resident-token');
  for (const path of ['/resident/complaints', '/resident/leave-requests', '/resident/room-change-requests']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/resident\/requests$/);
    await expect(page.getByRole('heading', { name: 'My Requests', exact: true })).toBeVisible();
  }
});
