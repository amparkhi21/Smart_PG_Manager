import { test, expect } from '@playwright/test';

// Real Capacitor JS adapter, simulated native bridge, synthetic API only.
const owner = { id: '111111111111111111111111', name: 'Android Owner', pgName: 'Test Hostel', email: 'android@example.test', role: 'owner' };
const resident = { id: '222222222222222222222222', fullName: 'Android Resident', pgId: owner.id, pgName: owner.pgName,
  role: 'resident', joiningDate: '2026-01-01', room: { id: '333333333333333333333333', roomNumber: '101' }, bedNumber: 'B1', passwordChangeRequired: false };

async function setup(page, role = 'owner') {
  const writes = [];
  const origin = new URL(test.info().project.use.baseURL).origin;
  await page.setViewportSize({ width: 360, height: 800 });
  await page.addInitScript(({ role }) => {
    const calls = [], listeners = new Map();
    const emit = (plugin, event, payload = {}) => {
      for (const item of listeners.values()) if (item.plugin === plugin && item.event === event) item.callback(payload);
    };
    window.__android = { calls, emit };
    window.androidBridge = {};
    window.Capacitor = {
      PluginHeaders: ['SmartPgNative', 'PushNotifications'].map(name => ({ name, methods:
        ['getToken', 'ready', 'minimizeApp', 'getPushConfiguration', 'openExternal', 'copyText', 'checkPermissions', 'requestPermissions', 'register', 'unregister', 'removeListener']
          .map(name => ({ name, rtype: 'promise' })).concat({ name: 'addListener', rtype: 'callback' }) })),
      async nativePromise(plugin, method, options = {}) {
        calls.push({ plugin, method, options });
        if (method === 'getToken') return { token: `${role}-synthetic-token` };
        if (method === 'getPushConfiguration') return { firebaseConfigured: true };
        if (method === 'checkPermissions') return { receive: 'prompt' };
        if (method === 'requestPermissions') return { receive: 'granted' };
        if (method === 'register') setTimeout(() => emit(plugin, 'registration', { value: 'synthetic-fcm-device-registration-token' }), 0);
        if (method === 'removeListener') listeners.delete(options.callbackId);
        return {};
      },
      nativeCallback(plugin, method, options, callback) {
        const id = String(calls.length + listeners.size);
        listeners.set(id, { plugin, event: options.eventName, callback });
        return id;
      },
    };
  }, { role });
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const path = url.pathname.slice(4);
    if (req.method() !== 'GET') writes.push(path);
    const reply = data => route.fulfill({ json: { success: true, data } });
    if (path === '/auth/session') return reply(role === 'resident' ? { resident } : { owner });
    if (path === '/settings') return reply({ owner });
    if (path === '/residents') return reply([{ _id: resident.id, fullName: resident.fullName, phone: '9800000001', emergencyContact: { phone: '9800000002' }, room: { roomNumber: '101' }, status: 'Active' }]);
    if (path === '/notifications/unread-count') return reply({ unreadCount: 3 });
    if (path === '/notifications') return reply({ notifications: [], pagination: { page: 1, limit: 5, total: 0, totalPages: 0, hasMore: false } });
    if (path === '/notifications/devices') return reply({ id: '444444444444444444444444' });
    if (path === '/resident/attendance') return reply({ summary: { Present: 2, Absent: 1, percentage: 66.67, recordedDays: 3 }, records: [{ date: '2026-11-01', status: 'Present' }] });
    return route.fulfill({ status: 404, json: { success: false, message: 'Unexpected synthetic endpoint' } });
  });
  return writes;
}
const back = page => page.evaluate(() => window.__android.emit('SmartPgNative', 'backButton'));
const noOverflow = async page => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

test('Android contacts use native clipboard and dialer; Back dismisses the notification and More sheets', async ({ page }) => {
  const writes = await setup(page);
  await page.goto('/emergency-contacts');
  await expect(page.getByRole('heading', { name: 'Resident Contacts', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/native-android/);
  await page.getByRole('button', { name: /Copy Android Resident's personal phone/ }).click();
  await expect.poll(() => page.evaluate(() => window.__android.calls.filter(c => c.method === 'copyText').map(c => c.options.text))).toEqual(['9800000001']);
  await page.getByRole('link', { name: /Call Android Resident's personal phone/ }).click();
  await expect.poll(() => page.evaluate(() => window.__android.calls.filter(c => c.method === 'openExternal').map(c => c.options.url))).toEqual(['tel:9800000001']);
  await expect(page.getByLabel('3 unread notifications', { exact: true })).toBeVisible();
  for (const name of ['Notifications', 'More']) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('dialog', { name, exact: true })).toBeVisible();
    await noOverflow(page);
    await back(page);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/emergency-contacts$/);
  }
  expect(writes).toEqual([]);
});

test('Android resident attendance fits narrow screens and Back dismisses navigation before returning home', async ({ page }) => {
  await setup(page, 'resident');
  await page.goto('/resident/attendance');
  await expect(page.getByText('66.67%', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 640 });
  await noOverflow(page);
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await back(page);
  await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await back(page);
  await expect(page).toHaveURL(/\/resident\/dashboard$/);
  await back(page);
  await expect.poll(() => page.evaluate(() => window.__android.calls.some(c => c.method === 'minimizeApp'))).toBe(true);
});

test('Android safe areas and keyboard protect controls; push requests permission only on opt-in', async ({ page }) => {
  const writes = await setup(page);
  await page.goto('/settings');
  const toggle = page.getByRole('checkbox', { name: 'Enable Push Notifications', exact: true });
  await expect.poll(() => page.evaluate(() => window.__android.calls.filter(c => c.plugin === 'PushNotifications').map(c => c.method)), { timeout: 20000 }).toContain('checkPermissions');
  await expect(toggle).toBeEnabled();
  expect(await page.evaluate(() => window.__android.calls.some(c => c.method === 'requestPermissions'))).toBe(false);
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--safe-area-inset-top', '24px');
    document.documentElement.style.setProperty('--safe-area-inset-bottom', '32px');
  });
  expect(await page.locator('.app-header').evaluate(el => getComputedStyle(el).paddingTop)).toBe('24px');
  expect(await page.locator('.mobile-bottom-nav').evaluate(el => getComputedStyle(el).paddingBottom)).toBe('32px');
  await page.locator('main input').first().focus();
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, 'height', { configurable: true, get: () => 440 });
    window.visualViewport.dispatchEvent(new Event('resize'));
  });
  await expect(page.locator('html')).toHaveClass(/keyboard-open/);
  await expect(page.locator('.mobile-bottom-nav')).toBeHidden();
  await page.evaluate(() => {
    document.activeElement.blur(); delete window.visualViewport.height;
    window.visualViewport.dispatchEvent(new Event('resize'));
  });
  await expect(page.locator('html')).not.toHaveClass(/keyboard-open/);
  await toggle.click();
  await expect(page.getByText('This device is registered. Delivery also requires Firebase Admin credentials on the server.', { exact: true })).toBeVisible();
  expect(writes.filter(path => path === '/notifications/devices')).toHaveLength(1);
  await noOverflow(page);
});
