import { test, expect } from '@playwright/test';

const owner = { id: '111111111111111111111111', name: 'Owner A', pgName: 'Test PG', role: 'owner', email: 'owner@example.test' };
const resident = { id: '222222222222222222222222', fullName: 'Resident A', pgId: owner.id, pgName: owner.pgName, role: 'resident', room: { id: '333333333333333333333333', roomNumber: '101' }, passwordChangeRequired: false };
const contact = (index, extra = {}) => ({ id: String(index).padStart(24, '0'), name: 'Medical Desk', category: 'Medical', phone: '112', description: 'Available around the clock', priority: true, pgId: owner.id, ...extra });

async function setup(page, extra = {}) {
  const state = { ownerView: false, rows: [], writes: [], reads: [], failList: false, failSave: false, ...extra };
  await page.addInitScript((token) => {
    localStorage.setItem('pg_token', token);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => { window.copiedPhone = text; } } });
  }, state.ownerView ? 'owner-token' : 'resident-token');
  await page.route((url) => url.origin === 'http://127.0.0.1:4179' && url.pathname.startsWith('/api/'), async (route) => {
    const req = route.request(), path = new URL(req.url()).pathname.slice(4), method = req.method();
    const reply = (data, status = 200, message = '') => route.fulfill({ status, json: status >= 400 ? { success: false, message: data } : { success: true, data, message } });
    if (path === '/auth/session') return reply(state.ownerView ? { owner } : { role: 'resident', resident });
    const base = state.ownerView ? '/emergency-contacts' : '/resident/emergency-contacts';
    if (!path.startsWith(base)) return reply('Unexpected or wrong-role endpoint', 404);
    if (method === 'GET') state.reads.push(path); else state.writes.push({ method, path, body: req.postData() ? req.postDataJSON() : null });
    if (method === 'GET' && path === base) {
      if (state.failList) return reply('Contacts are temporarily unavailable', 503);
      return reply({ contacts: state.rows.filter((row) => row.pgId === owner.id).sort((a, b) => Number(b.priority) - Number(a.priority) || a.name.localeCompare(b.name)) });
    }
    if (!state.ownerView) return reply('Emergency contacts are read-only for residents', 403);
    if (state.failSave) return reply('Unable to save contact. Please try again.', 503);
    if (method === 'POST' && path === base) { const row = contact(999, req.postDataJSON()); state.rows.push(row); return reply(row, 201, 'Emergency contact added'); }
    const id = path.slice(base.length + 1), row = state.rows.find((value) => value.id === id && value.pgId === owner.id);
    if (!row) return reply('Emergency contact not found', 404);
    if (method === 'PUT') { Object.assign(row, req.postDataJSON()); return reply(row, 200, 'Emergency contact updated'); }
    if (method === 'DELETE') { state.rows = state.rows.filter((value) => value.id !== row.id); return reply(null, 200, 'Emergency contact deleted'); }
    return reply('Unsupported action', 404);
  });
  return state;
}

test('owner validates, adds once, edits priority, searches, filters and confirms contact deletion', async ({ page }) => {
  const state = await setup(page, { ownerView: true }); await page.goto('/emergency-contacts');
  await expect(page.getByRole('link', { name: 'Emergency Contacts', exact: true })).toHaveAttribute('href', '/emergency-contacts');
  await expect(page.getByText('No emergency contacts yet', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add contact', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Add emergency contact', exact: true });
  await dialog.getByLabel('Contact Name', { exact: true }).fill('Security Desk');
  await dialog.getByLabel('Role / Category', { exact: true }).selectOption('Security');
  await dialog.getByLabel('Phone Number', { exact: true }).fill('112;123');
  await dialog.getByRole('button', { name: 'Save contact', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Enter a valid phone number or a 3–6 digit helpline.'); expect(state.writes).toHaveLength(0);
  await dialog.getByLabel('Phone Number', { exact: true }).fill('98765 43210');
  await dialog.getByLabel('Description (optional)', { exact: true }).fill('Main gate');
  await dialog.getByLabel('Mark as priority', { exact: true }).check();
  await dialog.getByRole('button', { name: 'Save contact', exact: true }).evaluate((button) => { button.click(); button.click(); });
  let card = page.getByRole('article', { name: 'Security Desk', exact: true });
  await expect(card.getByText('Priority', { exact: true })).toBeVisible();
  expect(state.writes).toHaveLength(1); expect(state.writes[0].body.phone).toBe('+919876543210');
  await card.getByRole('button', { name: 'Edit Security Desk', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Edit emergency contact', exact: true });
  await dialog.getByLabel('Contact Name', { exact: true }).fill('Night Security'); await dialog.getByLabel('Mark as priority', { exact: true }).uncheck();
  await dialog.getByRole('button', { name: 'Save contact', exact: true }).click();
  card = page.getByRole('article', { name: 'Night Security', exact: true }); await expect(card).toBeVisible(); await expect(card.getByText('Priority', { exact: true })).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Search emergency contacts', exact: true }).fill('no match'); await expect(page.getByText('No matching contacts', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await page.getByLabel('Filter contacts by category', { exact: true }).selectOption('Medical'); await expect(card).toHaveCount(0);
  await page.getByLabel('Filter contacts by category', { exact: true }).selectOption('Security'); await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Delete Night Security', exact: true }).click();
  let confirmation = page.getByRole('dialog', { name: 'Delete emergency contact?', exact: true });
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click(); expect(state.writes).toHaveLength(2);
  await card.getByRole('button', { name: 'Delete Night Security', exact: true }).click();
  await confirmation.getByRole('button', { name: 'Delete contact', exact: true }).evaluate((button) => { button.click(); button.click(); });
  await expect(card).toHaveCount(0); expect(state.writes.filter((write) => write.method === 'DELETE')).toHaveLength(1);
});

test('resident mobile contacts are read-only, PG-scoped, dialable and copyable with priority highlights', async ({ page }) => {
  const state = await setup(page, { rows: [contact(1), contact(2, { name: 'Caretaker', category: 'Caretaker', phone: '+919876543210', description: 'Ground floor', priority: false }), contact(3, { name: 'FOREIGN SECRET CONTACT', pgId: '999999999999999999999999' })] });
  await page.setViewportSize({ width: 360, height: 800 }); await page.goto('/resident/emergency-contacts');
  const cards = page.getByRole('article'); await expect(cards).toHaveCount(2);
  await expect(cards.first().getByText('Priority', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Call Medical Desk', exact: true })).toHaveAttribute('href', 'tel:112');
  await expect(page.getByRole('link', { name: 'Call Caretaker', exact: true })).toHaveAttribute('href', 'tel:+919876543210');
  await page.getByRole('button', { name: 'Copy number for Medical Desk', exact: true }).click();
  await expect(page.getByText('Phone number copied', { exact: true })).toBeVisible(); expect(await page.evaluate(() => window.copiedPhone)).toBe('112');
  await expect(page.getByRole('button', { name: /Add contact|Edit |Delete / })).toHaveCount(0); await expect(page.getByText('FOREIGN SECRET CONTACT', { exact: true })).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Search emergency contacts', exact: true }).fill('ground'); await expect(cards).toHaveCount(1);
  await page.getByLabel('Filter contacts by category', { exact: true }).selectOption('Medical'); await expect(page.getByText('No matching contacts', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Emergency Contacts', exact: true })).toHaveAttribute('href', '/resident/emergency-contacts');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(state.writes).toHaveLength(0); expect(state.reads.every((path) => path === '/resident/emergency-contacts')).toBe(true);
});

test('load and save failures show friendly feedback and keep the owner mobile draft', async ({ page }) => {
  const state = await setup(page, { ownerView: true, failList: true, failSave: true });
  await page.setViewportSize({ width: 360, height: 800 }); await page.goto('/emergency-contacts');
  await expect(page.getByText('Contacts are temporarily unavailable', { exact: true })).toBeVisible();
  state.failList = false; await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByText('No emergency contacts yet', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add contact', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add emergency contact', exact: true });
  await dialog.getByLabel('Contact Name', { exact: true }).fill('Fire Helpdesk'); await dialog.getByLabel('Role / Category', { exact: true }).selectOption('Fire');
  await dialog.getByLabel('Phone Number', { exact: true }).fill('101'); await dialog.getByRole('button', { name: 'Save contact', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Unable to save contact. Please try again.');
  await expect(dialog.getByLabel('Contact Name', { exact: true })).toHaveValue('Fire Helpdesk'); await expect(dialog.getByLabel('Phone Number', { exact: true })).toHaveValue('101');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true); expect(state.writes).toHaveLength(1);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'More', exact: true }).click(); await expect(page.getByRole('dialog', { name: 'More', exact: true }).getByRole('link', { name: 'Contacts', exact: true })).toHaveAttribute('href', '/emergency-contacts');
});
