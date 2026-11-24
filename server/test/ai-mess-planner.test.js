import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { GoogleGenAI } from '@google/genai';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import { createApp } from '../src/app.js';
import Owner from '../src/models/Owner.js';
import Room from '../src/models/Room.js';
import Resident from '../src/models/Resident.js';
import MessMenu from '../src/models/MessMenu.js';
import { aiMenuRateLimit } from '../src/routes/messMenuRoutes.js';
import { createMenuPlanner, plannerInput, plannerSchema, validatePlannerOutput, offsetDate } from '../src/utils/aiMessPlanner.js';
import { todayIST } from '../src/utils/dates.js';
import generateToken, { generateResidentToken } from '../src/utils/generateToken.js';
import { fixturePlan, fixtureMeal } from './helpers/aiMessFixtures.js';
import { generateMessPlan } from '../src/controllers/aiMessMenuController.js';

const input = (extra = {}) => plannerInput({ mode: 'daily', date: todayIST(), meal: 'breakfast', diet: 'vegetarian', preference: 'healthy', prompt: 'Poha mat dena', ...extra });
const fakeService = (generate, extra = {}) => createMenuPlanner({ env: { GEMINI_API_KEY: 'disposable-sdk-test-key', GEMINI_MODEL: 'gemini-3.6-flash' },
  createClient: () => ({ models: { generateContent: generate } }), ...extra });

test('installed official Google SDK sends JSON schema, fixed model and bounded generation without automatic continuation', async () => {
  const config = input(); let wire;
  const planner = createMenuPlanner({ env: { GEMINI_API_KEY: 'disposable-sdk-test-key' }, createClient: (options) => new GoogleGenAI({ ...options, httpOptions: { ...options.httpOptions,
    fetch: async (url, init) => { wire = { url: String(url), body: JSON.parse(init.body) }; return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(fixturePlan(config)) }] }, finishReason: 'STOP' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }); },
  } }) });
  const result = await planner.generate(config, []);
  assert.equal(result.suggestions.length, 3); assert.match(wire.url, /gemini-3\.6-flash:generateContent/);
  assert.equal(wire.body.generationConfig.responseMimeType, 'application/json');
  assert.ok(wire.body.generationConfig.responseJsonSchema); assert.equal(wire.body.generationConfig.maxOutputTokens, 2400);
});
test('schema validates daily ideas, exact 3/7-day coverage and vegetarian restrictions', () => {
  for (const days of [3, 7]) { const config = input({ mode: 'weekly', days }); const plan = fixturePlan(config); assert.equal(validatePlannerOutput(JSON.stringify(plan), config).days.length, days);
    plan.meals[4].date = plan.meals[0].date; assert.throws(() => validatePlannerOutput(JSON.stringify(plan), config)); }
  const config = input(), raw = fixturePlan(config);
  assert.equal(validatePlannerOutput(JSON.stringify(raw), config).suggestions.length, 3);
  for (const items of [['Chicken curry'], ['Egg bhurji'], ['मछली फ्राई'], ['Mutton biryani']]) { raw.suggestions[0].items = items; assert.throws(() => validatePlannerOutput(JSON.stringify(raw), config), /Vegetarian Only/); }
  raw.suggestions[0].vegetarian = false;
  assert.equal(validatePlannerOutput(JSON.stringify(raw), input({ diet: 'nonVegetarian' })).suggestions[0].vegetarian, false);
  for (const value of ['not-json', '{}', 'x'.repeat(64001), JSON.stringify({ suggestions: [], warnings: [] })]) assert.throws(() => validatePlannerOutput(value, config));
  for (const change of [{ date: '2026-13-01' }, { days: 8, mode: 'weekly' }, { prompt: 'x'.repeat(1501) }, { budget: -1 }, { budget: Infinity }, { diet: 'unknown' }, { avoid: ['x'.repeat(121)] }]) assert.throws(() => input(change), { statusCode: 400 });
});
test('compact weekly schema generates 12/28 meals in one call and retains all preferences and history', async () => {
  for (const days of [3, 7]) for (const diet of ['vegetarian', 'nonVegetarian']) for (const preference of ['healthy', 'budget', 'highProtein']) {
    const config = input({ mode: 'weekly', days, diet, preference, budget: 150, prompt: 'हल्का खाना; avoid poha, high protein chahiye' });
    const history = [{ date: offsetDate(config.date, -1), meals: { breakfast: ['Recent Idli'], lunch: ['Dal'], eveningSnacks: ['Fruit'], dinner: ['Roti'] } }];
    let calls = 0, captured;
    const service = fakeService(async (request) => { calls++; captured = request; return { text: JSON.stringify(fixturePlan(config)), candidates: [{ finishReason: 'STOP' }] }; });
    const result = await service.generate(config, history);
    assert.equal(calls, 1); assert.equal(result.days.length, days);
    assert.equal(result.days.flatMap((day) => Object.keys(day.meals)).length, days * 4);
    assert.deepEqual(result.days.map((day) => day.date), Array.from({ length: days }, (_, index) => offsetDate(config.date, index)));
    assert.deepEqual(JSON.parse(captured.contents), { request: config, recentMenus: history });
    assert.match(captured.config.systemInstruction, /concise food names/);
    assert.ok(JSON.stringify(plannerSchema(config)).length < 700);
    assert.doesNotMatch(JSON.stringify(captured.config.responseJsonSchema), /minItems|maxItems|minLength|maxLength|explanation|ingredientNotes/);
  }
});

test('weekly validator rejects missing, duplicate, wrong-date, wrong-meal and malformed rows without filling meals', () => {
  const config = input({ mode: 'weekly', days: 7 });
  const valid = fixturePlan(config);
  const reversed = validatePlannerOutput(JSON.stringify({ ...valid, meals: [...valid.meals].reverse() }), config);
  assert.equal(reversed.days.length, 7); assert.equal(reversed.days[0].date, config.date);
  for (const corrupt of [
    (plan) => plan.meals.pop(),
    (plan) => plan.meals.push({ ...plan.meals[0] }),
    (plan) => { plan.meals[1] = { ...plan.meals[0] }; },
    (plan) => { plan.meals[0].date = offsetDate(config.date, 7); },
    (plan) => { plan.meals[0].date = '2026-02-30'; },
    (plan) => { plan.meals[0].meal = 'brunch'; },
    (plan) => { plan.meals[0].items = []; },
    (plan) => { plan.meals[0].items = ['   ']; },
    (plan) => { plan.meals[0].items = ['x'.repeat(121)]; },
    (plan) => { plan.meals[0].items = Array(9).fill('Dosa'); },
    (plan) => { delete plan.meals[0].vegetarian; },
    (plan) => { plan.meals[0].vegetarian = 'true'; },
    (plan) => { plan.meals[0].servingTime = '08:00'; },
    (plan) => { plan.warnings = Array(7).fill('Warning'); },
  ]) { const malformed = fixturePlan(config); corrupt(malformed); assert.throws(() => validatePlannerOutput(JSON.stringify(malformed), config), { code: 'GEMINI_INVALID_RESPONSE' }); }
  for (const item of ['Egg curry', 'मछली फ्राई', 'Chicken curry']) {
    const malformed = fixturePlan(config); malformed.meals[0].items = [item];
    assert.throws(() => validatePlannerOutput(JSON.stringify(malformed), config), { code: 'GEMINI_DIET_MISMATCH' });
    malformed.meals[0].vegetarian = false;
    assert.equal(validatePlannerOutput(JSON.stringify(malformed), { ...config, diet: 'nonVegetarian' }).days[0].meals.breakfast.vegetarian, false);
  }
});

test('provider failures, missing credentials, timeouts and malformed responses return safe actionable errors', async () => {
  await assert.rejects(createMenuPlanner({ env: {} }).generate(input(), []), { statusCode: 503, code: 'AI_NOT_CONFIGURED', message: 'AI Menu Planner is not configured.' });
  for (const [status, expected, code, message] of [[401, 503, 'GEMINI_INVALID_KEY', /rejected the API key/], [403, 503, 'GEMINI_ACCESS_DENIED', /access was rejected/],
    [400, 502, 'GEMINI_INVALID_REQUEST', /generation request/], [429, 429, 'GEMINI_QUOTA_EXCEEDED', /quota/], [503, 503, 'GEMINI_UNAVAILABLE', /unavailable/],
    [404, 502, 'GEMINI_MODEL_UNAVAILABLE', /GEMINI_MODEL/], [500, 502, 'GEMINI_REQUEST_FAILED', /request failed/]]) {
    await assert.rejects(fakeService(async () => { throw Object.assign(new Error('private-key-must-not-leak'), { status }); }).generate(input(), []),
      (error) => error.statusCode === expected && error.providerStatus === status && error.code === code && message.test(error.message) && !error.message.includes('private-key'));
  }
  const invalidKey = Object.assign(new Error(JSON.stringify({ error: { code: 400, message: 'private-key-must-not-leak', details: [{ reason: 'API_KEY_INVALID' }] } })), { status: 400 });
  await assert.rejects(fakeService(async () => { throw invalidKey; }).generate(input(), []), { statusCode: 503, code: 'GEMINI_INVALID_KEY', providerStatus: 400 });
  for (const [cause, code] of [[{ code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' }, 'GEMINI_TLS_ERROR'], [{ code: 'CERT_HAS_EXPIRED' }, 'GEMINI_TLS_ERROR'],
    [{ code: 'ENOTFOUND' }, 'GEMINI_NETWORK_ERROR'], [{ code: 'ECONNRESET' }, 'GEMINI_NETWORK_ERROR'], [{ code: 'UND_ERR_CONNECT_TIMEOUT' }, 'GEMINI_TIMEOUT']]) {
    const connectionError = new TypeError('private-key-must-not-leak', { cause });
    await assert.rejects(fakeService(async () => { throw connectionError; }).generate(input(), []), (error) => error.code === code && error.providerStatus === undefined && !error.message.includes('private-key'));
  }
  await assert.rejects(fakeService(async () => { throw new TypeError('fetch failed'); }).generate(input(), []), { code: 'GEMINI_NETWORK_ERROR' });
  await assert.rejects(fakeService(async () => { throw new TypeError('private-key-must-not-leak'); }).generate(input(), []), { code: 'GEMINI_REQUEST_FAILED' });
  await assert.rejects(fakeService(() => new Promise(() => {}), { timeoutMs: 15 }).generate(input(), []), { statusCode: 504, code: 'GEMINI_TIMEOUT' });
  await assert.rejects(fakeService(async () => ({ text: 'broken' })).generate(input(), []), { statusCode: 502, code: 'GEMINI_INVALID_RESPONSE' });
  const schemaError = Object.assign(new Error(JSON.stringify({ error: { code: 400, status: 'INVALID_ARGUMENT', message: 'The specified schema produces a constraint that has too many states for serving. private-key-must-not-leak' } })), { status: 400 });
  await assert.rejects(fakeService(async () => { throw schemaError; }).generate(input({ mode: 'weekly', days: 7 }), []),
    (error) => error.code === 'GEMINI_SCHEMA_TOO_COMPLEX' && error.providerStatus === 400 && !error.message.includes('private-key'));
  await assert.rejects(fakeService(async () => ({ text: '{"meals":[', candidates: [{ finishReason: 'MAX_TOKENS' }] })).generate(input({ mode: 'weekly', days: 7 }), []),
    { statusCode: 502, code: 'GEMINI_OUTPUT_TRUNCATED' });
});
test('transient 503 retries use exponential backoff, identical requests and no overlapping SDK calls', { timeout: 15000 }, async () => {
  const config = input({ mode: 'weekly', days: 7 });
  const calls = []; let active = 0, maxActive = 0;
  const planner = createMenuPlanner({ env: { GEMINI_API_KEY: 'disposable-sdk-test-key' }, createClient: (options) => new GoogleGenAI({ ...options, httpOptions: { ...options.httpOptions,
    fetch: async (url, init) => {
      active++; maxActive = Math.max(maxActive, active); calls.push({ time: Date.now(), body: init.body });
      try {
        if (calls.length < 3) return new Response(JSON.stringify({ error: { code: 503, status: 'UNAVAILABLE', message: 'Temporary provider unavailability' } }), { status: 503 });
        return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(fixturePlan(config)) }] }, finishReason: 'STOP' }] }), { status: 200 });
      } finally { active--; }
    },
  } }) });
  const result = await planner.generate(config, []);
  assert.equal(result.days.length, 7); assert.equal(calls.length, 3); assert.equal(maxActive, 1);
  assert.equal(calls[0].body, calls[1].body); assert.equal(calls[1].body, calls[2].body);
  assert.ok(calls[1].time - calls[0].time >= 1900); assert.ok(calls[2].time - calls[1].time >= 3900);
});

test('transient 503 retries stop after three upstream failures with a sanitized provider error', { timeout: 15000 }, async () => {
  let calls = 0;
  const planner = fakeService(async () => { calls++; throw Object.assign(new Error('private-key-must-not-leak'), { status: 503 }); });
  await assert.rejects(planner.generate(input({ mode: 'weekly', days: 7 }), []),
    (error) => error.code === 'GEMINI_UNAVAILABLE' && error.providerStatus === 503 && !error.message.includes('private-key'));
  assert.equal(calls, 3);
});

test('transient 503 retries do not retry other statuses, internal errors, network failures or malformed output', async () => {
  for (const failure of [
    ...[400, 401, 403, 404, 408, 429, 500, 502, 504].map((status) => Object.assign(new Error('provider failure'), { status })),
    Object.assign(new Error('network failure'), { code: 'ECONNRESET' }),
    Object.assign(new Error('internal failure'), { statusCode: 503, code: 'INTERNAL_ERROR' }),
  ]) {
    let calls = 0;
    const service = fakeService(async () => { calls++; throw failure; });
    await assert.rejects(service.generate(input(), [])); assert.equal(calls, 1);
  }
  let calls = 0;
  await assert.rejects(fakeService(async () => { calls++; return { text: '{}' }; }).generate(input(), []), { code: 'GEMINI_INVALID_RESPONSE' });
  assert.equal(calls, 1);
});

test('transient 503 retries stop during backoff when cancelled or when the total timeout expires', async () => {
  for (const cancel of [true, false]) {
    let calls = 0;
    const controller = new AbortController();
    const service = fakeService(async () => {
      calls++; if (cancel) setTimeout(() => controller.abort(), 20);
      throw Object.assign(new Error('provider unavailable'), { status: 503 });
    }, { timeoutMs: cancel ? 1000 : 30 });
    await assert.rejects(service.generate(input(), [], controller.signal));
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(calls, 1);
  }
});

test('controller exposes only sanitized provider error codes and actual provider status', async (t) => {
  const query = { select() { return this; }, sort() { return this; }, limit() { return this; }, async lean() { return []; } };
  t.mock.method(MessMenu, 'find', () => query);
  for (const [service, expectedStatus, code, providerStatus] of [
    [createMenuPlanner({ env: {} }), 503, 'AI_NOT_CONFIGURED', undefined],
    [fakeService(async () => { throw Object.assign(new Error('private-key-must-not-leak'), { status: 404 }); }), 502, 'GEMINI_MODEL_UNAVAILABLE', 404],
  ]) {
    const req = { body: input(), owner: { _id: new mongoose.Types.ObjectId() }, app: { locals: { messAIPlanner: service } } };
    const res = { writableEnded: false, once() {}, removeListener() {}, status(status) { this.statusCode = status; return this; }, json(body) { this.body = body; this.writableEnded = true; return this; } };
    await generateMessPlan(req, res, (error) => { throw error; });
    assert.equal(res.statusCode, expectedStatus); assert.equal(res.body.code, code); assert.equal(res.body.providerStatus, providerStatus);
    assert.doesNotMatch(JSON.stringify(res.body), /private-key|disposable-sdk-test-key/);
  }
});

test('owner AI workflow isolates PG context, limits requests and saves only explicitly approved menus in disposable MongoDB', { timeout: 120000 }, async (t) => {
  const previousSecret = process.env.JWT_SECRET; process.env.JWT_SECRET = 'isolated-ai-menu-auth-'.repeat(3);
  let mongo, server;
  t.after(async () => { if (server) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }); await mongoose.disconnect(); await mongo?.stop();
    if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret; });
  mongo = await MongoMemoryServer.create({ binary: { version: '8.0.17', downloadDir: fileURLToPath(new URL('../../tmp/mongodb-binaries/', import.meta.url)) }, instance: { dbName: `ai_mess_${randomUUID().replaceAll('-', '')}` } });
  await mongoose.connect(mongo.getUri()); await Promise.all([Owner.init(), Room.init(), Resident.init(), MessMenu.init()]);
  const [owner, foreign] = await Owner.create([
    { name: 'Owner', email: 'owner@ai-mess.test', pgName: 'Test PG', password: 'OwnerPassword123!' },
    { name: 'Foreign', email: 'foreign@ai-mess.test', pgName: 'Test PG', password: 'OwnerPassword123!' },
  ]);
  const room = await Room.create({ owner: owner._id, roomNumber: '101', capacity: 1, monthlyRent: 5000 });
  const resident = await Resident.create({ owner: owner._id, room: room._id, fullName: 'PRIVATE_RESIDENT', phone: '9800000001', monthlyRent: 5000, accountStatus: 'active', loginEnabled: true });
  const today = todayIST(), meals = { breakfast: { items: ['Recent Idli'], servingTime: '08:00', notes: 'PRIVATE_HISTORY_NOTE' } };
  await MessMenu.create([
    { owner: owner._id, date: offsetDate(today, -14), meals }, { owner: owner._id, date: offsetDate(today, -1), meals },
    { owner: owner._id, date: offsetDate(today, -15), meals: { breakfast: { items: ['TOO_OLD'], servingTime: '08:00' } } },
    { owner: foreign._id, date: offsetDate(today, -1), meals: { breakfast: { items: ['FOREIGN_DISH'], servingTime: '08:00' } } },
    { owner: owner._id, date: today, meals },
  ]);
  const original = await MessMenu.collection.find({}).toArray();
  let captured, calls = 0;
  const app = createApp({ NODE_ENV: 'production', CLIENT_URL: 'https://test.example' });
  app.locals.messAIPlanner = fakeService(async (request) => { calls++; captured = request; return { text: JSON.stringify(fixturePlan(JSON.parse(request.contents).request, 'Recent Idli')) }; });
  server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  const ownerToken = generateToken(owner._id), residentToken = generateResidentToken(resident), foreignToken = generateToken(foreign._id);
  const request = async (method, path, body, token = ownerToken) => { const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) }, ...(body !== undefined && { body: JSON.stringify(body) }) }); return { status: response.status, ...await response.json() }; };
  const plan = (body = input(), token) => request('POST', '/mess-menus/ai/plan', body, token);
  const reset = () => aiMenuRateLimit.resetKey(`mess-ai:${owner._id}`);
  await t.test('owner only; resident/missing sessions are rejected without a provider call', async () => {
    assert.equal((await plan(input(), residentToken)).status, 403); assert.equal((await plan(input(), null)).status, 401); assert.equal(calls, 0);
  });
  await t.test('recent history is exactly fourteen days, tenant-scoped and excludes personal details/notes', async () => {
    const result = await plan({ ...input(), owner: String(foreign._id), pgId: String(foreign._id) }); assert.equal(result.status, 200);
    const context = JSON.parse(captured.contents); assert.deepEqual(context.recentMenus.map((menu) => menu.date), [offsetDate(today, -14), offsetDate(today, -1)]);
    assert.deepEqual(Object.keys(context.recentMenus[0].meals), ['breakfast']);
    assert.doesNotMatch(captured.contents, /FOREIGN_DISH|TOO_OLD|PRIVATE_|9800000001|pgId|owner/);
    assert.match(captured.config.systemInstruction, /Hindi, English or Hinglish/); assert.equal(context.request.prompt, 'Poha mat dena');
    const other = await plan(input(), foreignToken); assert.equal(other.status, 200); assert.match(captured.contents, /FOREIGN_DISH/); assert.doesNotMatch(captured.contents, /Recent Idli/);
    assert.deepEqual(await MessMenu.collection.find({}).toArray(), original);
  });
  await t.test('daily, three-day and seven-day plans do not save anything; exact repeats warn', async () => {
    reset(); for (const config of [input(), input({ mode: 'weekly', days: 3 }), input({ mode: 'weekly', days: 7 })]) { const result = await plan(config); assert.equal(result.status, 200); assert.equal(result.data.days?.length || result.data.suggestions.length, config.mode === 'weekly' ? config.days : 3); }
    const repeated = fixturePlan(input()); repeated.suggestions[0] = fixtureMeal('Recent Idli');
    assert.match(validatePlannerOutput(JSON.stringify(repeated), input(), [{ meals: { breakfast: ['Recent Idli'] } }]).warnings.join(' '), /repeat/);
    assert.deepEqual(await MessMenu.collection.find({}).toArray(), original);
  });
  await t.test('missing key and invalid provider responses retain clear errors in production mode', async () => {
    reset(); const saved = app.locals.messAIPlanner;
    app.locals.messAIPlanner = createMenuPlanner({ env: {} }); assert.equal((await plan()).message, 'AI Menu Planner is not configured.');
    app.locals.messAIPlanner = fakeService(async () => ({ text: '{}' })); assert.equal((await plan()).status, 502);
    app.locals.messAIPlanner = saved;
  });
  await t.test('per-owner rate limit and duplicate in-flight calls avoid extra provider usage', async () => {
    reset(); const before = calls;
    for (let index = 0; index < 6; index++) assert.equal((await plan()).status, 200);
    assert.equal((await plan()).status, 429); assert.equal(calls - before, 6);
    reset(); const saved = app.locals.messAIPlanner; let release;
    app.locals.messAIPlanner = fakeService(() => new Promise((resolve) => { release = () => resolve({ text: JSON.stringify(fixturePlan(input())) }); }));
    const first = plan(); while (!release) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal((await plan()).status, 409); release(); assert.equal((await first).status, 200); app.locals.messAIPlanner = saved;
  });
  await t.test('existing APIs save only owner-approved content and preserve omitted serving times; resident sees it', async () => {
    const approved = await request('PUT', `/mess-menus/${today}`, { meals: { breakfast: { items: ['Approved Dosa'], notes: 'Owner reviewed' } } });
    assert.equal(approved.status, 200); assert.equal(approved.data.meals.breakfast.servingTime, '08:00');
    assert.equal((await request('GET', `/mess-menus/${today}`)).data.meals.breakfast.items[0], 'Approved Dosa');
    assert.equal((await request('GET', '/resident/mess-menus/today', undefined, residentToken)).data.menu.meals.breakfast.items[0], 'Approved Dosa');
    assert.equal((await request('PUT', `/mess-menus/${today}`, { meals: {} }, residentToken)).status, 403);
    assert.equal((await request('PUT', `/mess-menus/${today}`, { meals: {} }, foreignToken)).status, 404);
    assert.equal(await MessMenu.countDocuments({}), original.length);
  });
});
