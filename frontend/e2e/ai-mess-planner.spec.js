import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { build, preview } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import mongoose from '../../server/node_modules/mongoose/index.js';
import { MongoMemoryServer } from '../../server/node_modules/mongodb-memory-server-core/lib/index.js';
import { createApp } from '../../server/src/app.js';
import Owner from '../../server/src/models/Owner.js';
import Room from '../../server/src/models/Room.js';
import Resident from '../../server/src/models/Resident.js';
import MessMenu from '../../server/src/models/MessMenu.js';
import { createMenuPlanner, offsetDate } from '../../server/src/utils/aiMessPlanner.js';
import { aiMenuRateLimit } from '../../server/src/routes/messMenuRoutes.js';
import { todayIST } from '../../server/src/utils/dates.js';
import generateToken, { generateResidentToken } from '../../server/src/utils/generateToken.js';
import { fixturePlan } from '../../server/test/helpers/aiMessFixtures.js';

const origin = 'http://127.0.0.1:4185';
const times = { breakfast: '08:00-09:00', lunch: '13:00', eveningSnacks: '17:00', dinner: '20:00' };
let mongo, apiServer, ui, apiOrigin, app, owner, resident, ownerToken, residentToken, today, originalSecret, residentBefore;
let calls, lastInput, providerMode, delay;
const mealSet = () => Object.fromEntries(Object.entries(times).map(([key, servingTime]) => [key, { items: [`Original ${key}`], servingTime, notes: 'Configured meal' }]));
const planner = () => createMenuPlanner({ env: { GEMINI_API_KEY: 'disposable-browser-key' }, createClient: () => ({ models: { generateContent: async (request) => {
  calls++; const input = JSON.parse(request.contents).request; lastInput = input;
  if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
  if (providerMode === 'quota') throw Object.assign(new Error('test quota'), { status: 429 });
  if (providerMode === 'schema') throw Object.assign(new Error(JSON.stringify({ error: { status: 'INVALID_ARGUMENT', message: 'The specified schema produces a constraint that has too many states for serving. private-key-must-not-leak' } })), { status: 400 });
  if (providerMode === 'malformed') return { text: '{}' };
  if (providerMode === 'truncated') return { text: '{"meals":[', candidates: [{ finishReason: 'MAX_TOKENS' }] };
  if (providerMode === 'incomplete') { const plan = fixturePlan(input); plan.meals.pop(); return { text: JSON.stringify(plan) }; }
  if (providerMode === 'duplicate') { const plan = fixturePlan(input); plan.meals[1] = { ...plan.meals[0] }; return { text: JSON.stringify(plan) }; }
  return { text: JSON.stringify(fixturePlan(input, input.mode === 'meal' ? 'Regenerated Dosa' : 'AI Idli')) };
} } }) });

test.beforeAll(async () => {
  test.setTimeout(180000); originalSecret = process.env.JWT_SECRET; process.env.JWT_SECRET = 'isolated-ai-browser-secret-'.repeat(3);
  // Never load dotenv/server startup or connect to an external database/provider.
  mongo = await MongoMemoryServer.create({ binary: { version: '8.0.17', downloadDir: fileURLToPath(new URL('../../tmp/mongodb-binaries/', import.meta.url)) }, instance: { dbName: `ai_mess_browser_${randomUUID().replaceAll('-', '')}` } });
  await mongoose.connect(mongo.getUri()); await Promise.all([Owner.init(), Room.init(), Resident.init(), MessMenu.init()]);
  owner = await Owner.create({ name: 'Mess Owner', email: 'owner@ai-browser.test', pgName: 'Isolated AI Mess PG', password: 'OwnerPassword123!' });
  const room = await Room.create({ owner: owner._id, roomNumber: '101', capacity: 1, monthlyRent: 5000 });
  resident = await Resident.create({ owner: owner._id, room: room._id, fullName: 'Isolated Resident', phone: '9800000001', monthlyRent: 5000, accountStatus: 'active', loginEnabled: true });
  residentBefore = await Resident.collection.findOne({ _id: resident._id });
  ownerToken = generateToken(owner._id); residentToken = generateResidentToken(resident); today = todayIST();
  app = createApp({ NODE_ENV: 'development', CLIENT_URL: origin }); app.locals.messAIPlanner = planner();
  apiServer = app.listen(0, '127.0.0.1'); await new Promise((resolve) => apiServer.once('listening', resolve)); apiOrigin = `http://127.0.0.1:${apiServer.address().port}`;
  const output = fileURLToPath(new URL('../../tmp/ai-mess-browser-dist/', import.meta.url));
  if (!output.startsWith(fileURLToPath(new URL('../../tmp/', import.meta.url)))) throw new Error('Unsafe test build path');
  const config = { root: fileURLToPath(new URL('../', import.meta.url)), configFile: false, envFile: false,
    plugins: [react(), tailwindcss()], mode: 'test', logLevel: 'warn', define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify(`${apiOrigin}/api`) },
    build: { outDir: output, emptyOutDir: true }, preview: { host: '127.0.0.1', port: 4185, strictPort: true } };
  await build(config); ui = await preview(config);
});
test.afterAll(async () => {
  if (ui) await new Promise((resolve) => { ui.httpServer.close(resolve); ui.httpServer.closeAllConnections(); });
  if (apiServer) await new Promise((resolve) => { apiServer.close(resolve); apiServer.closeAllConnections(); });
  await mongoose.disconnect(); await mongo?.stop(); if (originalSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = originalSecret;
});
test.beforeEach(async ({ context, page }) => {
  calls = 0; lastInput = null; providerMode = ''; delay = 0; app.locals.messAIPlanner = planner(); aiMenuRateLimit.resetKey(`mess-ai:${owner._id}`);
  await MessMenu.deleteMany({ owner: owner._id }); // Disposable test DB only.
  await MessMenu.create({ owner: owner._id, date: today, meals: mealSet() });
  await context.route('**/*', (route) => [origin, apiOrigin].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort());
  await page.addInitScript((token) => { if (!localStorage.getItem('pg_token')) localStorage.setItem('pg_token', token); }, ownerToken);
  await page.goto(`${origin}/mess-management`); await expect(page.getByRole('heading', { name: 'Mess Management', exact: true })).toBeVisible();
});
test.afterEach(async () => { expect(await Resident.collection.findOne({ _id: resident._id })).toEqual(residentBefore); });
const panel = (page) => page.getByRole('dialog', { name: 'AI Daily Menu Ideas', exact: true });
async function open(page) { await page.getByRole('button', { name: 'AI Menu Ideas', exact: true }).click(); await expect(panel(page)).toBeVisible(); }
async function generate(page) { await panel(page).getByRole('button', { name: 'Generate ideas', exact: true }).click(); await expect(panel(page).getByRole('region', { name: 'AI menu preview', exact: true })).toBeVisible(); }
async function confirmSave(page, editor, confirmation, date) {
  await editor.getByRole('button', { name: 'Save menu', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: confirmation, exact: true }); await expect(dialog).toBeVisible();
  const response = page.waitForResponse((response) => response.request().method() === (confirmation === 'Publish menu?' ? 'POST' : 'PUT') && response.url().startsWith(`${apiOrigin}/api/mess-menus`));
  await dialog.getByRole('button', { name: 'Save menu', exact: true }).click(); expect((await response).status()).toBe(confirmation === 'Publish menu?' ? 201 : 200);
  await expect(dialog).toHaveCount(0); expect(await MessMenu.findOne({ owner: owner._id, date })).not.toBeNull();
}

test('individual Daily Ideas still regenerate and save only an approved meal with existing times', async ({ page }) => {
  await open(page); await panel(page).getByLabel('Meal', { exact: true }).selectOption('breakfast');
  await panel(page).getByLabel('Custom instructions', { exact: true }).fill('Kal breakfast mein healthy suggest karo. Poha mat dena.');
  await panel(page).getByLabel('Per-person meal budget (₹, optional)', { exact: true }).fill('40'); await generate(page);
  await expect(panel(page).getByRole('article')).toHaveCount(3); expect(lastInput.budgetScope).toBe('meal'); expect(lastInput.budget).toBe(40);
  await panel(page).getByRole('button', { name: 'Regenerate suggestion 1', exact: true }).click();
  await expect(panel(page).getByRole('article', { name: 'Suggestion 1', exact: true })).toContainText('Regenerated Dosa 1'); expect(calls).toBe(2);
  await panel(page).getByRole('article', { name: 'Suggestion 1', exact: true }).getByRole('button', { name: 'Use This Menu', exact: true }).click();
  const editor = page.getByRole('dialog', { name: /^Edit menu/ }); await expect(editor.getByText(/A saved menu exists/)).toBeVisible();
  await expect(editor.locator('#breakfast-servingTime')).toHaveValue(times.breakfast); await expect(editor.locator('#lunch-items')).toHaveValue('Original lunch');
  await editor.locator('#breakfast-items').fill('Owner approved dosa\nChutney');
  await confirmSave(page, editor, 'Overwrite saved menu?', today); await page.reload();
  await expect(page.getByText('Owner approved dosa', { exact: true })).toBeVisible();
  const saved = await MessMenu.findOne({ owner: owner._id, date: today }); expect(saved.meals.lunch.items).toEqual(['Original lunch']);
  expect(saved.meals.breakfast.servingTime).toBe(times.breakfast);
  await page.evaluate((token) => localStorage.setItem('pg_token', token), residentToken); await page.goto(`${origin}/resident/mess-menu`);
  await expect(page.getByText('Owner approved dosa', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'AI Menu Ideas', exact: true })).toHaveCount(0);
});

test('All Meals offers daily-only options, edits and regenerates each card, confirms overwrite and persists to both portals', async ({ page }) => {
  const before = await MessMenu.collection.find({}).toArray();
  await open(page);
  expect(await panel(page).getByLabel('Meal', { exact: true }).locator('option').allTextContents()).toEqual(['All Meals', 'Breakfast', 'Lunch', 'Snacks', 'Dinner']);
  await expect(panel(page).getByRole('tab', { name: 'Weekly Planner', exact: true })).toHaveCount(0);
  await expect(panel(page).getByLabel('Duration', { exact: true })).toHaveCount(0);
  await panel(page).getByLabel('Preference', { exact: true }).selectOption('highProtein');
  await panel(page).getByLabel('Per-person daily budget (₹, optional)', { exact: true }).fill('150');
  await panel(page).getByLabel('Custom instructions', { exact: true }).fill('हल्का खाना. High protein chahiye; poha mat dena.');
  await generate(page); await expect(panel(page).getByRole('article')).toHaveCount(4);
  expect(lastInput.date).toBe(today); expect(lastInput.days).toBe(1); expect(lastInput.budgetScope).toBe('day'); expect(lastInput.preference).toBe('highProtein');
  const labels = { breakfast: 'Breakfast', lunch: 'Lunch', eveningSnacks: 'Snacks', dinner: 'Dinner' };
  for (const [key, label] of Object.entries(labels)) {
    const card = panel(page).getByRole('article', { name: label, exact: true });
    const otherValues = {};
    for (const other of Object.values(labels).filter((value) => value !== label)) otherValues[other] = await panel(page).getByLabel(`${other} food items`, { exact: true }).inputValue();
    await card.getByRole('button', { name: `Regenerate ${label}`, exact: true }).click();
    await expect(card.getByLabel(`${label} food items`, { exact: true })).toHaveValue('Regenerated Dosa 1\nChutney');
    expect(lastInput.meal).toBe(key); expect(lastInput.budgetScope).toBe('day'); expect(lastInput.budget).toBe(150);
    for (const [other, value] of Object.entries(otherValues)) await expect(panel(page).getByLabel(`${other} food items`, { exact: true })).toHaveValue(value);
    await card.getByRole('button', { name: `Edit ${label}`, exact: true }).click();
    await card.getByLabel(`${label} food items`, { exact: true }).fill(`Owner approved ${key}\nChutney`);
    await card.getByRole('button', { name: `Done editing ${label}`, exact: true }).click();
  }
  expect(calls).toBe(5); expect(await MessMenu.collection.find({}).toArray()).toEqual(before);
  const dinner = panel(page).getByRole('article', { name: 'Dinner', exact: true });
  await dinner.getByRole('button', { name: 'Edit Dinner', exact: true }).click(); await dinner.getByLabel('Dinner food items', { exact: true }).fill('');
  await expect(panel(page).getByRole('button', { name: 'Use All Meals', exact: true })).toBeDisabled();
  await dinner.getByLabel('Dinner food items', { exact: true }).fill('Owner approved dinner\nChutney');
  await panel(page).getByRole('button', { name: 'Use All Meals', exact: true }).click();
  const editor = page.getByRole('dialog', { name: /^Edit menu/ });
  for (const key of Object.keys(labels)) {
    await expect(editor.locator(`#${key}-items`)).toHaveValue(`Owner approved ${key}\nChutney`);
    await expect(editor.locator(`#${key}-servingTime`)).toHaveValue(times[key]);
  }
  await editor.locator('#lunch-items').fill(''); await editor.getByRole('button', { name: 'Save menu', exact: true }).click();
  await expect(editor.getByText('Complete this meal before saving the AI day menu.', { exact: true })).toBeVisible();
  await editor.locator('#lunch-items').fill('Owner approved lunch\nChutney');
  await editor.getByRole('button', { name: 'Save menu', exact: true }).click();
  await page.getByRole('dialog', { name: 'Overwrite saved menu?', exact: true }).getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await MessMenu.collection.find({}).toArray()).toEqual(before);
  await confirmSave(page, editor, 'Overwrite saved menu?', today); await page.reload();
  for (const key of Object.keys(labels)) await expect(page.getByText(`Owner approved ${key}`, { exact: true })).toBeVisible();
  const saved = await MessMenu.findOne({ owner: owner._id, date: today });
  for (const key of Object.keys(labels)) { expect(saved.meals[key].items).toEqual([`Owner approved ${key}`, 'Chutney']); expect(saved.meals[key].servingTime).toBe(times[key]); }
  await page.evaluate((token) => localStorage.setItem('pg_token', token), residentToken); await page.goto(`${origin}/resident/mess-menu`);
  for (const key of Object.keys(labels)) await expect(page.getByText(`Owner approved ${key}`, { exact: true })).toBeVisible();
  expect(await MessMenu.countDocuments({ owner: owner._id })).toBe(1);
});

test('mobile All Meals generates once, inherits serving times for a new date and reloads the saved menu', async ({ page }) => {
  const tomorrow = offsetDate(today, 1);
  await page.setViewportSize({ width: 360, height: 800 }); await open(page);
  await panel(page).getByLabel('Target menu date', { exact: true }).fill(tomorrow);
  await panel(page).getByLabel('Food type', { exact: true }).selectOption('nonVegetarian');
  await panel(page).getByLabel('Preference', { exact: true }).selectOption('budget'); delay = 100;
  await panel(page).getByRole('button', { name: 'Generate ideas', exact: true }).evaluate((button) => { button.click(); button.click(); });
  await expect(panel(page).getByRole('article')).toHaveCount(4); expect(calls).toBe(1);
  expect(lastInput.date).toBe(tomorrow); expect(lastInput.diet).toBe('nonVegetarian'); expect(lastInput.preference).toBe('budget');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await panel(page).evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth)).toBe(true);
  await panel(page).getByRole('button', { name: 'Use All Meals', exact: true }).click();
  const editor = page.getByRole('dialog', { name: /^Add menu/ });
  for (const key of Object.keys(times)) await expect(editor.locator(`#${key}-servingTime`)).toHaveValue(times[key]);
  expect(await MessMenu.findOne({ owner: owner._id, date: tomorrow })).toBeNull();
  await confirmSave(page, editor, 'Publish menu?', tomorrow); await page.reload();
  await page.getByLabel('Menu date', { exact: true }).fill(tomorrow);
  for (const key of Object.keys(times)) await expect(page.getByText(`AI Idli ${key}`, { exact: true })).toBeVisible();
  await page.evaluate((token) => localStorage.setItem('pg_token', token), residentToken); await page.goto(`${origin}/resident/mess-menu`);
  await page.getByLabel('Upcoming menu date', { exact: true }).selectOption(tomorrow);
  for (const key of Object.keys(times)) await expect(page.getByText(`AI Idli ${key}`, { exact: true })).toBeVisible();
  await page.screenshot({ path: fileURLToPath(new URL('../../tmp/ai-all-meals-mobile.png', import.meta.url)), fullPage: true });
});

test('All Meals provider failures never fabricate cards or publish menus and allow a safe explicit retry', async ({ page }) => {
  const before = await MessMenu.collection.find({}).toArray(); await open(page);
  for (const [failure, code] of [['schema', 'GEMINI_SCHEMA_TOO_COMPLEX'], ['quota', 'GEMINI_QUOTA_EXCEEDED'], ['truncated', 'GEMINI_OUTPUT_TRUNCATED'], ['incomplete', 'GEMINI_INVALID_RESPONSE'], ['duplicate', 'GEMINI_INVALID_RESPONSE'], ['malformed', 'GEMINI_INVALID_RESPONSE']]) {
    aiMenuRateLimit.resetKey(`mess-ai:${owner._id}`); providerMode = failure;
    const pending = page.waitForResponse((response) => response.url().endsWith('/api/mess-menus/ai/plan'));
    await panel(page).getByRole('button', { name: 'Generate ideas', exact: true }).click();
    expect((await (await pending).json()).code).toBe(code);
    await expect(panel(page).getByRole('alert')).toBeVisible(); await expect(panel(page).getByRole('alert')).not.toContainText('private-key');
    await expect(panel(page).getByRole('region', { name: 'AI menu preview', exact: true })).toHaveCount(0);
    expect(await MessMenu.collection.find({}).toArray()).toEqual(before);
  }
  aiMenuRateLimit.resetKey(`mess-ai:${owner._id}`); providerMode = ''; await generate(page);
  await expect(panel(page).getByRole('article')).toHaveCount(4); expect(await MessMenu.collection.find({}).toArray()).toEqual(before);
});

test('All Meals timeout recovery releases the owner request and never shows a partial menu', async ({ page }) => {
  let attempts = 0;
  app.locals.messAIPlanner = createMenuPlanner({ env: { GEMINI_API_KEY: 'disposable-browser-key' }, timeoutMs: 35,
    createClient: () => ({ models: { generateContent: async (request) => {
      attempts++; return attempts === 1 ? new Promise(() => {}) : { text: JSON.stringify(fixturePlan(JSON.parse(request.contents).request)) };
    } } }) });
  const before = await MessMenu.collection.find({}).toArray(); await open(page);
  const pending = page.waitForResponse((response) => response.url().endsWith('/api/mess-menus/ai/plan'));
  await panel(page).getByRole('button', { name: 'Generate ideas', exact: true }).click();
  const response = await pending; expect(response.status()).toBe(504);
  const error = await response.json(); expect(error.timing.timeoutSource).toBe('planner_deadline');
  await expect(panel(page).getByRole('alert')).toContainText('Gemini timed out');
  await expect(panel(page).getByRole('article')).toHaveCount(0);
  await generate(page); await expect(panel(page).getByRole('article')).toHaveCount(4);
  expect(attempts).toBe(2); expect(await MessMenu.collection.find({}).toArray()).toEqual(before);
});

test('real Gemini All Meals generates exactly four meals for one date without publication', async ({ page }) => {
  test.skip(process.env.AI_MESS_REAL_GEMINI !== '1', 'Opt-in: one real daily All Meals request with bounded transient-503 retries.');
  test.setTimeout(210000);
  const require = createRequire(new URL('../../server/package.json', import.meta.url));
  const configured = require('dotenv').parse(readFileSync(new URL('../../server/.env', import.meta.url)));
  const env = { GEMINI_API_KEY: configured.GEMINI_API_KEY, GEMINI_MODEL: configured.GEMINI_MODEL };
  const { GoogleGenAI } = require('@google/genai'); const upstream = []; let realCalls = 0, generationRequests = 0, writes = 0;
  app.locals.messAIPlanner = createMenuPlanner({ env, createClient(options) {
    const client = new GoogleGenAI({ ...options, httpOptions: { ...options.httpOptions, fetch: async (...args) => {
      const started = Date.now(); const response = await fetch(...args);
      const record = { httpStatus: response.status, elapsedMs: Date.now() - started, host: new URL(String(args[0])).hostname };
      if (!response.ok) {
        let payload; try { payload = await response.clone().json(); } catch {}
        if (typeof payload?.error?.status === 'string' && /^[A-Z_]{1,60}$/.test(payload.error.status)) record.code = payload.error.status;
        if (typeof payload?.error?.message === 'string') record.message = payload.error.message.split(env.GEMINI_API_KEY?.trim() || '__no_key__').join('[REDACTED]').replace(/AIza[\w-]+/g, '[REDACTED]').slice(0, 1000);
      }
      upstream.push(record); console.log(`ALL_MEALS_UPSTREAM ${JSON.stringify(record)}`); return response;
    } } });
    return { models: { async generateContent(request) { realCalls++; return client.models.generateContent(request); } } };
  } });
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path === '/api/mess-menus/ai/plan' && request.method() === 'POST') generationRequests++;
    if (/^\/api\/mess-menus(?:\/\d{4}-\d{2}-\d{2})?$/.test(path) && ['POST', 'PUT', 'DELETE'].includes(request.method())) writes++;
  });
  const before = await MessMenu.collection.find({}).toArray();
  await page.setViewportSize({ width: 1280, height: 1000 }); await open(page);
  const pending = page.waitForResponse((response) => response.url().endsWith('/api/mess-menus/ai/plan'), { timeout: 165000 });
  await panel(page).getByRole('button', { name: 'Generate ideas', exact: true }).click();
  const response = await pending; const body = await response.json();
  const report = { result: response.status() === 200 ? 'PENDING_UI' : 'FAIL', httpStatus: response.status(), model: body.data?.model || env.GEMINI_MODEL,
    upstream, realCalls, generationRequests, publicationRequests: writes, timing: body.data?.timing || body.timing, code: body.code, providerStatus: body.providerStatus, message: body.message };
  writeFileSync(new URL('../../tmp/ai-all-meals-real-verification.json', import.meta.url), JSON.stringify(report, null, 2));
  expect(await MessMenu.collection.find({}).toArray()).toEqual(before); expect(writes).toBe(0); expect(generationRequests).toBe(1);
  if (response.status() !== 200) throw new Error(`Real All Meals failed: ${JSON.stringify(report)}`);
  expect(body.data.model).toBe('gemini-3.6-flash'); expect(body.data.date).toBe(today);
  expect(Object.keys(body.data.meals)).toEqual(['breakfast', 'lunch', 'eveningSnacks', 'dinner']);
  await expect(panel(page).getByRole('article')).toHaveCount(4);
  for (const [key, label] of Object.entries({ breakfast: 'Breakfast', lunch: 'Lunch', eveningSnacks: 'Snacks', dinner: 'Dinner' })) {
    const card = panel(page).getByRole('article', { name: label, exact: true }); const meal = body.data.meals[key];
    expect(meal.vegetarian).toBe(true); expect(meal.items.length).toBeGreaterThan(0);
    const field = card.getByLabel(`${label} food items`, { exact: true }); await field.scrollIntoViewIfNeeded(); await expect(field).toBeVisible();
    await expect(field).toHaveValue(meal.items.join('\n')); await card.getByRole('button', { name: `Edit ${label}`, exact: true }).click(); await expect(field).toBeEditable();
    await card.screenshot({ path: fileURLToPath(new URL(`../../tmp/ai-all-meals-real-${key}.png`, import.meta.url)) });
  }
  expect(realCalls).toBeLessThanOrEqual(3);
  Object.assign(report, { result: 'PASS', date: body.data.date, totalValidMeals: 4, allFourVisibleAndEditable: true, vegetarianOnlyValidated: true, databaseUnchanged: true });
  writeFileSync(new URL('../../tmp/ai-all-meals-real-verification.json', import.meta.url), JSON.stringify(report, null, 2));
  console.log(`REAL_ALL_MEALS_VERIFIED ${JSON.stringify(report)}`);
});
