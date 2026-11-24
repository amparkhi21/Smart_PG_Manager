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
const panel = (page) => page.getByRole('dialog', { name: 'AI Menu Planner', exact: true });
async function open(page) { await page.getByRole('button', { name: 'AI Menu Ideas', exact: true }).click(); await expect(panel(page)).toBeVisible(); }
async function generate(page) { await panel(page).getByRole('button', { name: 'Generate ideas', exact: true }).click(); await expect(panel(page).getByRole('region', { name: 'AI menu preview', exact: true })).toBeVisible(); }
async function confirmSave(page, editor, confirmation, date) {
  await editor.getByRole('button', { name: 'Save menu', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: confirmation, exact: true }); await expect(dialog).toBeVisible();
  const response = page.waitForResponse((response) => response.request().method() === (confirmation === 'Publish menu?' ? 'POST' : 'PUT') && response.url().startsWith(`${apiOrigin}/api/mess-menus`));
  await dialog.getByRole('button', { name: 'Save menu', exact: true }).click(); expect((await response).status()).toBe(confirmation === 'Publish menu?' ? 201 : 200);
  await expect(dialog).toHaveCount(0); expect(await MessMenu.findOne({ owner: owner._id, date })).not.toBeNull();
}

test('daily ideas regenerate, preview without writes, require overwrite confirmation and persist for owner/resident', async ({ page }) => {
  await open(page); await panel(page).getByLabel('Custom instructions', { exact: true }).fill('Kal breakfast mein healthy suggest karo. Poha mat dena.');
  await panel(page).getByLabel('Per-person budget (₹, optional)', { exact: true }).fill('40'); await generate(page);
  await expect(panel(page).getByRole('article')).toHaveCount(3); expect(lastInput.prompt).toContain('Poha mat dena'); expect(lastInput.budget).toBe(40);
  expect((await MessMenu.findOne({ owner: owner._id, date: today })).meals.breakfast.items).toEqual(['Original breakfast']);
  await panel(page).getByRole('button', { name: 'Regenerate suggestion 1', exact: true }).click();
  await expect(panel(page).getByRole('article', { name: 'Suggestion 1', exact: true })).toContainText('Regenerated Dosa 1'); expect(calls).toBe(2);
  await panel(page).getByRole('article', { name: 'Suggestion 1', exact: true }).getByRole('button', { name: 'Use This Menu', exact: true }).click();
  const editor = page.getByRole('dialog', { name: /^Edit menu/ }); await expect(editor.getByText(/A saved menu exists/)).toBeVisible();
  await expect(editor.locator('#breakfast-servingTime')).toHaveValue(times.breakfast); await expect(editor.locator('#lunch-items')).toHaveValue('Original lunch');
  await editor.locator('#breakfast-items').fill('Owner approved dosa\nChutney');
  await editor.getByRole('button', { name: 'Save menu', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Overwrite saved menu?', exact: true }); await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await MessMenu.findOne({ owner: owner._id, date: today })).meals.breakfast.items).toEqual(['Original breakfast']);
  await confirmSave(page, editor, 'Overwrite saved menu?', today); await page.reload();
  await expect(page.getByText('Owner approved dosa', { exact: true })).toBeVisible();
  const saved = await MessMenu.findOne({ owner: owner._id, date: today }); expect(saved.meals.breakfast.servingTime).toBe(times.breakfast); expect(saved.meals.lunch.items).toEqual(['Original lunch']);
  await page.evaluate((token) => localStorage.setItem('pg_token', token), residentToken); await page.goto(`${origin}/resident/mess-menu`);
  await expect(page.getByText('Owner approved dosa', { exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: 'AI Menu Ideas', exact: true })).toHaveCount(0);
});

test('seven-day preview edits and regenerates one meal, applies only selected days and preserves configured times', async ({ page }) => {
  const tomorrow = offsetDate(today, 1), second = offsetDate(today, 2);
  await open(page); await panel(page).getByRole('tab', { name: 'Weekly Planner', exact: true }).click();
  await panel(page).getByLabel('Start date', { exact: true }).fill(tomorrow); await generate(page);
  await expect(panel(page).getByRole('article')).toHaveCount(7);
  await expect(panel(page).locator('textarea[id^="ai-20"]')).toHaveCount(28);
  for (let index = 0; index < 7; index++) await expect(panel(page).getByRole('article', { name: `Menu ${offsetDate(tomorrow, index)}`, exact: true })).toHaveCount(1);
  const firstDay = panel(page).getByRole('article', { name: `Menu ${tomorrow}`, exact: true });
  await firstDay.getByLabel('Breakfast', { exact: true }).fill('Edited weekly upma\nFruit');
  await firstDay.getByRole('button', { name: `Regenerate Lunch for ${tomorrow}`, exact: true }).click();
  await expect(firstDay.getByLabel('Lunch', { exact: true })).toHaveValue('Regenerated Dosa 1\nChutney');
  await expect(firstDay.getByLabel('Breakfast', { exact: true })).toHaveValue('Edited weekly upma\nFruit'); expect(calls).toBe(2);
  await firstDay.getByRole('checkbox').check(); await panel(page).getByRole('article', { name: `Menu ${second}`, exact: true }).getByRole('checkbox').check();
  expect(await MessMenu.countDocuments({ owner: owner._id })).toBe(1);
  const lastDinner = panel(page).getByRole('article', { name: `Menu ${offsetDate(tomorrow, 6)}`, exact: true }).getByLabel('Dinner', { exact: true });
  const originalDinner = await lastDinner.inputValue(); await lastDinner.fill('');
  await expect(panel(page).getByRole('button', { name: 'Review selected days (2)', exact: true })).toBeDisabled();
  await expect(panel(page).getByRole('alert')).toContainText('Complete all four meals');
  await lastDinner.fill(originalDinner);
  await panel(page).getByRole('button', { name: 'Review selected days (2)', exact: true }).click();
  let editor = page.getByRole('dialog', { name: /^Add menu/ }); await expect(editor.locator('#breakfast-items')).toHaveValue('Edited weekly upma\nFruit');
  for (const key of Object.keys(times)) await expect(editor.locator(`#${key}-servingTime`)).toHaveValue(times[key]);
  const originalLunch = await editor.locator('#lunch-items').inputValue(); await editor.locator('#lunch-items').fill('');
  await editor.getByRole('button', { name: 'Save menu', exact: true }).click();
  await expect(editor.getByText('Complete this meal before saving the weekly plan.', { exact: true })).toBeVisible();
  expect(await MessMenu.findOne({ owner: owner._id, date: tomorrow })).toBeNull();
  await editor.locator('#lunch-items').fill(originalLunch);
  await confirmSave(page, editor, 'Publish menu?', tomorrow);
  editor = page.getByRole('dialog', { name: /^Add menu/ }); await expect(editor).toBeVisible(); expect(await MessMenu.findOne({ owner: owner._id, date: second })).toBeNull();
  await confirmSave(page, editor, 'Publish menu?', second);
  expect(await MessMenu.countDocuments({ owner: owner._id })).toBe(3);
  for (let day = 3; day <= 7; day++) expect(await MessMenu.findOne({ owner: owner._id, date: offsetDate(today, day) })).toBeNull();
  await page.reload(); await page.getByLabel('Menu date', { exact: true }).fill(second);
  await expect(page.getByText('AI Idli breakfast 2', { exact: true })).toBeVisible();
  await page.evaluate((token) => localStorage.setItem('pg_token', token), residentToken); await page.goto(`${origin}/resident/mess-menu`);
  await expect(page.getByText('Edited weekly upma', { exact: true })).toBeVisible();
  await page.getByLabel('Upcoming menu date', { exact: true }).selectOption(second); await expect(page.getByText('AI Idli breakfast 2', { exact: true })).toBeVisible();
});

test('missing key and provider errors are actionable while manual menu editing remains available', async ({ page }) => {
  app.locals.messAIPlanner = createMenuPlanner({ env: {} }); await open(page);
  await panel(page).getByRole('button', { name: 'Generate ideas', exact: true }).click(); await expect(panel(page).getByRole('alert')).toContainText('AI Menu Planner is not configured.');
  await panel(page).getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Edit menu', exact: true }).click(); await expect(page.getByRole('dialog', { name: /^Edit menu/ }).locator('#breakfast-items')).toHaveValue('Original breakfast');
  await page.getByRole('dialog', { name: /^Edit menu/ }).getByRole('button', { name: 'Cancel', exact: true }).click();
  app.locals.messAIPlanner = planner(); providerMode = 'quota'; await open(page);
  await panel(page).getByRole('button', { name: 'Generate ideas', exact: true }).click(); await expect(panel(page).getByRole('alert')).toContainText('quota');
  providerMode = 'malformed'; await panel(page).getByRole('button', { name: 'Generate ideas', exact: true }).click(); await expect(panel(page).getByRole('alert')).toContainText('invalid menu');
  providerMode = ''; await generate(page); await expect(panel(page).getByRole('article')).toHaveCount(3);
  expect(await MessMenu.countDocuments({ owner: owner._id })).toBe(1);
});

test('mobile three-day planner fits viewport and duplicate Generate/Save clicks issue one request', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 }); await open(page);
  await panel(page).getByRole('tab', { name: 'Weekly Planner', exact: true }).click(); await panel(page).getByLabel('Duration', { exact: true }).selectOption('3');
  delay = 150;
  await panel(page).getByRole('button', { name: 'Generate ideas', exact: true }).evaluate((button) => { button.click(); button.click(); });
  await expect(panel(page).getByRole('article')).toHaveCount(3); expect(calls).toBe(1);
  await expect(panel(page).locator('textarea[id^="ai-20"]')).toHaveCount(12);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await panel(page).evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth)).toBe(true);
  await panel(page).getByRole('article').first().getByRole('checkbox').check(); await panel(page).getByRole('button', { name: 'Review selected days (1)', exact: true }).click();
  const editor = page.getByRole('dialog', { name: /^Edit menu/ }); await editor.getByRole('button', { name: 'Save menu', exact: true }).click();
  let writes = 0; page.on('request', (request) => { if (request.method() === 'PUT' && request.url() === `${apiOrigin}/api/mess-menus/${today}`) writes++; });
  const confirmation = page.getByRole('dialog', { name: 'Overwrite saved menu?', exact: true });
  await confirmation.getByRole('button', { name: 'Save menu', exact: true }).evaluate((button) => { button.click(); button.click(); });
  await expect(confirmation).toHaveCount(0); expect(writes).toBe(1);
  expect((await MessMenu.findOne({ owner: owner._id, date: today })).meals.breakfast.servingTime).toBe(times.breakfast);
  await page.screenshot({ path: fileURLToPath(new URL('../../tmp/ai-mess-mobile.png', import.meta.url)), fullPage: true });
});

test('weekly provider failures never show an incomplete preview or write menus and allow an explicit retry', async ({ page }) => {
  await open(page); await panel(page).getByRole('tab', { name: 'Weekly Planner', exact: true }).click();
  for (const [failure, code, message] of [
    ['schema', 'GEMINI_SCHEMA_TOO_COMPLEX', 'response schema'], ['quota', 'GEMINI_QUOTA_EXCEEDED', 'quota'],
    ['truncated', 'GEMINI_OUTPUT_TRUNCATED', 'before completing'], ['incomplete', 'GEMINI_INVALID_RESPONSE', 'invalid menu'],
    ['duplicate', 'GEMINI_INVALID_RESPONSE', 'invalid menu'], ['malformed', 'GEMINI_INVALID_RESPONSE', 'invalid menu'],
  ]) {
    aiMenuRateLimit.resetKey(`mess-ai:${owner._id}`); providerMode = failure;
    const response = page.waitForResponse((response) => response.url().endsWith('/api/mess-menus/ai/plan'));
    await panel(page).getByRole('button', { name: 'Generate ideas', exact: true }).click();
    expect((await (await response).json()).code).toBe(code);
    await expect(panel(page).getByRole('alert')).toContainText(message);
    await expect(panel(page).getByRole('alert')).not.toContainText('private-key');
    await expect(panel(page).getByRole('region', { name: 'AI menu preview', exact: true })).toHaveCount(0);
    expect(await MessMenu.countDocuments({ owner: owner._id })).toBe(1);
  }
  aiMenuRateLimit.resetKey(`mess-ai:${owner._id}`); providerMode = ''; await generate(page);
  await expect(panel(page).getByRole('article')).toHaveCount(7); expect(calls).toBe(7);
  expect(await MessMenu.countDocuments({ owner: owner._id })).toBe(1);
});

test('real Gemini seven-day response renders all 28 editable meals locally without publication', async ({ page }) => {
  test.skip(process.env.AI_MESS_REAL_GEMINI !== '1', 'Opt-in: one configured free-tier generation with at most two transient-503 retries.');
  test.setTimeout(120000);
  const require = createRequire(new URL('../../server/package.json', import.meta.url));
  const configured = require('dotenv').parse(readFileSync(new URL('../../server/.env', import.meta.url)));
  const env = { GEMINI_API_KEY: configured.GEMINI_API_KEY, GEMINI_MODEL: configured.GEMINI_MODEL };
  const { GoogleGenAI } = require('@google/genai');
  const statuses = [], upstream = []; let realCalls = 0, finishReason, usage, generationRequests = 0, writes = 0;
  const started = Date.now();
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path === '/api/mess-menus/ai/plan' && request.method() === 'POST') generationRequests++;
    if (/^\/api\/mess-menus(?:\/\d{4}-\d{2}-\d{2})?$/.test(path) && ['POST', 'PUT', 'DELETE'].includes(request.method())) writes++;
  });
  app.locals.messAIPlanner = createMenuPlanner({ env, createClient(options) {
    const client = new GoogleGenAI({ ...options, httpOptions: { ...options.httpOptions, fetch: async (...args) => {
      const response = await fetch(...args); statuses.push(response.status);
      const record = { attempt: statuses.length, providerHost: new URL(String(args[0])).hostname, httpStatus: response.status, elapsedMs: Date.now() - started };
      if (!response.ok) {
        let payload; try { payload = await response.clone().json(); } catch { /* Never expose an unstructured error body. */ }
        const provider = payload?.error;
        if (typeof provider?.status === 'string' && /^[A-Z_]{1,60}$/.test(provider.status)) record.providerCode = provider.status;
        if (typeof provider?.message === 'string') record.providerMessage = provider.message
          .split(env.GEMINI_API_KEY?.trim() || '__no_key__').join('[REDACTED]').replace(/AIza[\w-]+/g, '[REDACTED]').slice(0, 1000);
      }
      upstream.push(record);
      console.log(`GEMINI_UPSTREAM ${JSON.stringify(record)}`);
      return response;
    } } });
    return { models: { async generateContent(request) {
      realCalls++; const response = await client.models.generateContent(request);
      finishReason = response.candidates?.[0]?.finishReason; usage = response.usageMetadata; return response;
    } } };
  } });
  const before = await MessMenu.collection.find({}).toArray();
  const start = offsetDate(today, 1);
  await page.setViewportSize({ width: 1280, height: 1000 });
  await open(page); await panel(page).getByRole('tab', { name: 'Weekly Planner', exact: true }).click();
  await panel(page).getByLabel('Start date', { exact: true }).fill(start);
  const pending = page.waitForResponse((response) => response.url().endsWith('/api/mess-menus/ai/plan'), { timeout: 65000 });
  await panel(page).getByRole('button', { name: 'Generate ideas', exact: true }).evaluate((button) => { button.click(); button.click(); });
  const response = await pending;
  const body = await response.json();
  if (response.status() !== 200) {
    await expect(panel(page).getByRole('alert')).toContainText(body.message);
    await expect(panel(page).getByRole('region', { name: 'AI menu preview', exact: true })).toHaveCount(0);
    expect(await MessMenu.collection.find({}).toArray()).toEqual(before);
    expect(generationRequests).toBe(1); expect(writes).toBe(0);
    const safe = { result: 'FAIL', httpStatus: response.status(), providerHttpStatuses: statuses, upstream, providerCalls: realCalls,
      generationRequests, databaseUnchanged: true, publicationRequests: writes, code: body.code, providerStatus: body.providerStatus, message: body.message };
    writeFileSync(new URL('../../tmp/ai-mess-real-verification.json', import.meta.url), JSON.stringify(safe, null, 2));
    throw new Error(`Real Gemini verification failed: ${JSON.stringify(safe)}`);
  }
  await expect(panel(page).getByRole('article')).toHaveCount(7);
  await expect(panel(page).locator('textarea[id^="ai-20"]')).toHaveCount(28);
  const dates = Array.from({ length: 7 }, (_, index) => offsetDate(start, index));
  expect(body.data.days.map((day) => day.date)).toEqual(dates);
  for (const date of dates) {
    const day = panel(page).getByRole('article', { name: `Menu ${date}`, exact: true });
    for (const label of ['Breakfast', 'Lunch', 'Snacks', 'Dinner']) {
      const meal = day.getByLabel(label, { exact: true });
      await meal.scrollIntoViewIfNeeded(); await expect(meal).toBeVisible(); await expect(meal).toBeEditable();
      expect((await meal.inputValue()).trim().length).toBeGreaterThan(0);
    }
    await day.screenshot({ path: fileURLToPath(new URL(`../../tmp/ai-mess-real-${date}.png`, import.meta.url)) });
  }
  expect(realCalls).toBe(statuses.length); expect(realCalls).toBeGreaterThanOrEqual(1); expect(realCalls).toBeLessThanOrEqual(3);
  expect(statuses.at(-1)).toBe(200); expect(statuses.slice(0, -1).every((status) => status === 503)).toBe(true);
  expect(generationRequests).toBe(1); expect(writes).toBe(0); expect(finishReason).toBe('STOP');
  const firstMeal = panel(page).getByRole('article', { name: `Menu ${start}`, exact: true }).getByLabel('Breakfast', { exact: true });
  const original = await firstMeal.inputValue(); await firstMeal.fill(`${original}\nOwner edit`); await expect(firstMeal).toHaveValue(`${original}\nOwner edit`); await firstMeal.fill(original);
  expect(await MessMenu.collection.find({}).toArray()).toEqual(before);
  const verification = { result: 'PASS', model: body.data.model, providerHttpStatuses: statuses, upstream, providerCalls: realCalls, generationRequests, publicationRequests: writes, finishReason,
    dayCount: body.data.days.length, mealCount: 28, dates, allMealsVisibleAndEditable: true, databaseUnchanged: true, usage };
  writeFileSync(new URL('../../tmp/ai-mess-real-verification.json', import.meta.url), JSON.stringify(verification, null, 2));
  console.log(`REAL_GEMINI_VERIFIED ${JSON.stringify(verification)}`);
});
