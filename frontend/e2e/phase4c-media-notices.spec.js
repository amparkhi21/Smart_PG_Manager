import { test, expect } from '@playwright/test';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4v5ThPwAG7wKkCcxydAAAAABJRU5ErkJggg==', 'base64');
const owner = { id: '111111111111111111111111', name: 'Owner A', pgName: 'Test PG', role: 'owner', email: 'owner@example.test' };
const resident = { id: '222222222222222222222222', fullName: 'Resident A', pgId: owner.id, pgName: owner.pgName, role: 'resident', passwordChangeRequired: false };
const stamp = '2026-11-20T08:00:00.000Z';
const notice = () => ({ id: '333333333333333333333333', pgId: owner.id, title: 'Water maintenance', body: 'Please store water.', pinned: true, expiresAt: null, createdAt: stamp, updatedAt: stamp, isExpired: false, isNew: true });
async function setup(page, { ownerView = false, notices = [], messages = [], failNotices = false } = {}) {
  const token = ownerView ? 'owner-token' : 'resident-token';
  const state = { notices, messages, writes: [], imageReads: [], reads: false, failNotices, uploads: 0 };
  await page.clock.setFixedTime(new Date('2026-11-20T09:00:00.000Z'));
  await page.addInitScript((value) => localStorage.setItem('pg_token', value), token);
  await page.route((url) => url.origin === 'http://127.0.0.1:4179' && url.pathname.startsWith('/api/'), async (route) => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname.slice(4), method = req.method();
    const reply = (data, status = 200, message = 'Saved') => route.fulfill({ status, json: status >= 400 ? { success: false, message: data } : { success: true, data, message } });
    if (path === '/auth/session') return reply(ownerView ? { owner } : { role: 'resident', resident });
    if (path === '/community/messages' && method === 'GET') return reply({ pgId: owner.id, messages: state.messages.map((item) => ({ ...item, canDelete: ownerView || item.sender.id === resident.id })).reverse(), hasMore: false, nextCursor: null });
    if (path === '/community/images' && method === 'POST') {
      state.uploads++; state.writes.push({ method, path, contentType: req.headers()['content-type'], bytes: req.postDataBuffer() });
      const message = { id: '444444444444444444444444', pgId: owner.id, sender: ownerView ? { id: owner.id, name: owner.name, role: 'owner' } : { id: resident.id, name: resident.fullName, role: 'resident' }, text: '', kind: 'message', createdAt: stamp, canDelete: true, image: { id: '555555555555555555555555', contentType: 'image/png', size: PNG.length } };
      state.messages.push(message); return reply(message, 201, 'Photo shared');
    }
    if (path.startsWith('/community/images/') && method === 'GET') { state.imageReads.push(req.headers().authorization); return route.fulfill({ status: 200, contentType: 'image/png', body: PNG }); }
    if (path.startsWith('/community/messages/') && method === 'DELETE') { state.writes.push({ method, path }); state.messages = state.messages.filter((item) => item.id !== path.split('/').at(-1)); return reply({}, 200, 'Message deleted'); }
    if (path === '/community/notices' && method === 'GET') {
      if (state.failNotices) return reply('Notices temporarily unavailable', 503);
      return reply({ pgId: owner.id, notices: state.notices.map((item) => ({ ...item, isNew: !ownerView && !state.reads })), readThrough: '2026-11-20T09:00:00.000Z' });
    }
    if (path === '/community/notices/read' && method === 'POST') { state.reads = true; state.writes.push({ method, path, body: req.postDataJSON() }); return reply({}, 200, 'Notices marked as read'); }
    if (path === '/community/notices' && method === 'POST') {
      const body = req.postDataJSON(); state.writes.push({ method, path, body });
      state.notices.push({ ...notice(), ...body, id: '666666666666666666666666', isNew: false }); return reply(state.notices.at(-1), 201, 'Notice published');
    }
    if (path.startsWith('/community/notices/')) {
      const id = path.split('/')[3], item = state.notices.find((value) => value.id === id);
      state.writes.push({ method, path, ...(method !== 'DELETE' && { body: req.postDataJSON() }) });
      if (method === 'DELETE') state.notices = state.notices.filter((value) => value.id !== id);
      else Object.assign(item, req.postDataJSON());
      return reply(item, 200, method === 'DELETE' ? 'Notice deleted' : 'Notice updated');
    }
    return reply('Unexpected test endpoint', 404);
  });
  return state;
}

test('owner creates, edits, pins and deletes notices with an Indian expiry date', async ({ page }) => {
  const state = await setup(page, { ownerView: true });
  await page.goto('/notice-board');
  await expect(page.getByText('No notices yet', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Notice Board', exact: true })).toHaveAttribute('href', '/notice-board');
  await page.getByRole('button', { name: 'Create notice', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Title', { exact: true }).fill('Dinner update');
  await dialog.getByLabel('Notice text', { exact: true }).fill('Dinner starts at 8 PM.');
  await dialog.getByLabel('Expiry date (optional)', { exact: true }).fill('2026-12-01');
  await dialog.getByLabel('Pin to top', { exact: true }).check();
  await dialog.getByRole('button', { name: 'Save notice', exact: true }).click();
  const card = page.getByRole('article', { name: 'Dinner update', exact: true });
  await expect(card.getByText('Pinned', { exact: true })).toBeVisible();
  expect(state.writes[0].body.expiresAt).toBe('2026-12-01T23:59:59.999+05:30');
  await card.getByRole('button', { name: 'Edit notice', exact: true }).click();
  await dialog.getByLabel('Notice text', { exact: true }).fill('Dinner starts at 8:30 PM.');
  await dialog.getByRole('button', { name: 'Save notice', exact: true }).click();
  await expect(card.getByText('Dinner starts at 8:30 PM.', { exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'Unpin notice', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Pin notice', exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'Delete notice', exact: true }).click();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click(); expect(state.notices).toHaveLength(1);
  await card.getByRole('button', { name: 'Delete notice', exact: true }).click();
  await dialog.getByRole('button', { name: 'Delete notice', exact: true }).click();
  await expect(page.getByText('No notices yet', { exact: true })).toBeVisible(); expect(state.notices).toHaveLength(0);
});

test('resident reads new notices, shares a private photo and deletes only their own image on mobile', async ({ page }) => {
  const ownerPhoto = { id: '777777777777777777777777', pgId: owner.id, sender: { id: owner.id, name: owner.name, role: 'owner' }, text: '', kind: 'message', createdAt: stamp, image: { id: '888888888888888888888888', contentType: 'image/png', size: PNG.length } };
  const state = await setup(page, { notices: [notice()], messages: [ownerPhoto] });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/resident/notices');
  await expect(page.getByRole('article').getByText('New', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Create notice|Edit notice|Delete notice|Pin notice/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Mark notices as read', exact: true }).click();
  await expect(page.getByRole('article').getByText('New', { exact: true })).toHaveCount(0); expect(state.reads).toBe(true);
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('navigation', { name: 'Resident navigation' }).getByRole('link', { name: 'Community', exact: true }).click();
  const other = page.locator('[data-message-id="777777777777777777777777"]');
  await expect(other.getByRole('img')).toHaveAttribute('src', /^blob:/);
  await expect(other.getByRole('button', { name: 'Delete message' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Share photo', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Share a community photo', exact: true });
  await dialog.getByLabel('Photo', { exact: true }).setInputFiles({ name: 'bad.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
  await expect(dialog.getByRole('alert')).toHaveText('Choose a JPG, PNG or WebP photo.');
  await expect(dialog.getByRole('button', { name: 'Share photo', exact: true })).toBeDisabled();
  await dialog.getByLabel('Photo', { exact: true }).setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: PNG });
  await dialog.getByRole('button', { name: 'Share photo', exact: true }).evaluate((button) => { button.click(); button.click(); });
  const own = page.locator('[data-message-id="444444444444444444444444"]');
  await expect(own.getByRole('img')).toHaveAttribute('src', /^blob:/); expect(state.uploads).toBe(1);
  expect(state.writes.find((item) => item.path === '/community/images').bytes.equals(PNG)).toBe(true);
  expect(state.imageReads.every((token) => token === 'Bearer resident-token')).toBe(true);
  await own.getByRole('button', { name: 'Delete message', exact: true }).click();
  await page.getByRole('dialog', { name: 'Delete this message?', exact: true }).getByRole('button', { name: 'Delete message', exact: true }).click();
  await expect(own).toHaveCount(0); expect(state.messages).toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('notice loading errors retry successfully and owner can remove a resident photo', async ({ page }) => {
  const photo = { id: '999999999999999999999999', pgId: owner.id, sender: { id: resident.id, name: resident.fullName, role: 'resident' }, text: '', kind: 'message', createdAt: stamp, image: { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', contentType: 'image/png', size: PNG.length } };
  const state = await setup(page, { ownerView: true, failNotices: true, messages: [photo] });
  await page.goto('/notice-board');
  await expect(page.getByText('Notices temporarily unavailable', { exact: true })).toBeVisible(); state.failNotices = false;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByText('No notices yet', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Community', exact: true }).click();
  const card = page.locator('[data-message-id="999999999999999999999999"]');
  await expect(card.getByRole('img')).toHaveAttribute('src', /^blob:/);
  await card.getByRole('button', { name: 'Delete message', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete message', exact: true }).click();
  await expect(card).toHaveCount(0); expect(state.messages).toHaveLength(0);
});
