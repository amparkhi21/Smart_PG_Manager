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
import { createMenuPlanner, plannerInput, plannerSchema, validatePlannerOutput, offsetDate, GEMINI_ATTEMPT_TIMEOUT_MS, GEMINI_PLAN_TIMEOUT_MS } from '../src/utils/aiMessPlanner.js';
import { todayIST } from '../src/utils/dates.js';
import generateToken, { generateResidentToken } from '../src/utils/generateToken.js';
import { fixturePlan, fixtureMeal } from './helpers/aiMessFixtures.js';
import { generateMessPlan } from '../src/controllers/aiMessMenuController.js';
import { setImmediate as flush } from 'node:timers/promises';

const realTimeout = setTimeout;

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
test('schema validates individual daily ideas, All Meals coverage and vegetarian restrictions', () => {
  const all = input({ meal: 'all' }); const plan = fixturePlan(all);
  assert.equal(Object.keys(validatePlannerOutput(JSON.stringify(plan), all).meals).length, 4);
  plan.meals[1].date = offsetDate(all.date, 1); assert.throws(() => validatePlannerOutput(JSON.stringify(plan), all));
  const config = input(), raw = fixturePlan(config);
  assert.equal(validatePlannerOutput(JSON.stringify(raw), config).suggestions.length, 3);
  for (const items of [['Chicken curry'], ['Egg bhurji'], ['मछली फ्राई'], ['Mutton biryani']]) { raw.suggestions[0].items = items; assert.throws(() => validatePlannerOutput(JSON.stringify(raw), config), /Vegetarian Only/); }
  raw.suggestions[0].vegetarian = false;
  assert.equal(validatePlannerOutput(JSON.stringify(raw), input({ diet: 'nonVegetarian' })).suggestions[0].vegetarian, false);
  for (const value of ['not-json', '{}', 'x'.repeat(64001), JSON.stringify({ suggestions: [], warnings: [] })]) assert.throws(() => validatePlannerOutput(value, config));
  for (const change of [{ date: '2026-13-01' }, { days: 8, mode: 'weekly' }, { prompt: 'x'.repeat(1501) }, { budget: -1 }, { budget: Infinity }, { diet: 'unknown' }, { avoid: ['x'.repeat(121)] }]) assert.throws(() => input(change), { statusCode: 400 });
});
test('All Meals generates four meals for one date in one call and retains preferences, daily budget and history', async () => {
  for (const diet of ['vegetarian', 'nonVegetarian']) for (const preference of ['healthy', 'budget', 'highProtein']) {
    const config = input({ meal: 'all', diet, preference, budget: 150, prompt: 'हल्का खाना; avoid poha, high protein chahiye' });
    const history = [{ date: offsetDate(config.date, -1), meals: { breakfast: ['Recent Idli'], lunch: ['Dal'], eveningSnacks: ['Fruit'], dinner: ['Roti'] } }];
    let calls = 0, captured;
    const service = fakeService(async (request) => { calls++; captured = request; return { text: JSON.stringify(fixturePlan(config)), candidates: [{ finishReason: 'STOP' }] }; });
    const result = await service.generate(config, history);
    assert.equal(calls, 1); assert.equal(Object.keys(result.meals).length, 4);
    assert.equal(result.date, config.date); assert.equal(config.days, 1); assert.equal(config.budgetScope, 'day');
    assert.deepEqual(JSON.parse(captured.contents), { request: config, recentMenus: history });
    assert.match(captured.config.systemInstruction, /concise food names/); assert.match(captured.config.systemInstruction, /total for ALL FOUR meals/);
    assert.ok(JSON.stringify(plannerSchema(config)).length < 700);
    assert.doesNotMatch(JSON.stringify(captured.config.responseJsonSchema), /minItems|maxItems|minLength|maxLength|explanation|ingredientNotes/);
  }
});

test('All Meals validator rejects missing, duplicate, wrong-date, wrong-meal and malformed rows without filling meals', () => {
  const config = input({ meal: 'all' });
  const valid = fixturePlan(config);
  const reversed = validatePlannerOutput(JSON.stringify({ ...valid, meals: [...valid.meals].reverse() }), config);
  assert.equal(Object.keys(reversed.meals).length, 4); assert.equal(reversed.date, config.date);
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
    assert.equal(validatePlannerOutput(JSON.stringify(malformed), { ...config, diet: 'nonVegetarian' }).meals.breakfast.vegetarian, false);
  }
});

test('All Meals rejects multi-day requests and keeps daily budget scope during individual regeneration', async () => {
  for (const change of [{ mode: 'weekly', days: 3 }, { mode: 'weekly', days: 7 }, { meal: 'all', days: 7 },
    { mode: 'meal', meal: 'all' }, { meal: 'all', budgetScope: 'meal' }, { budgetScope: 'unknown' }]) assert.throws(() => input(change), { statusCode: 400 });
  const config = input({ mode: 'meal', meal: 'lunch', budget: 150, budgetScope: 'day' });
  let captured;
  const result = await fakeService(async (request) => { captured = request; return { text: JSON.stringify(fixturePlan(config)) }; }).generate(config, []);
  assert.equal(result.suggestions.length, 1);
  assert.equal(JSON.parse(captured.contents).request.budgetScope, 'day'); assert.match(captured.config.systemInstruction, /reasonable share/);
  assert.equal(input({ budget: 40 }).budgetScope, 'meal');
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
  await assert.rejects(fakeService(async () => { throw schemaError; }).generate(input({ meal: 'all' }), []),
    (error) => error.code === 'GEMINI_SCHEMA_TOO_COMPLEX' && error.providerStatus === 400 && !error.message.includes('private-key'));
  await assert.rejects(fakeService(async () => ({ text: '{"meals":[', candidates: [{ finishReason: 'MAX_TOKENS' }] })).generate(input({ meal: 'all' }), []),
    { statusCode: 502, code: 'GEMINI_OUTPUT_TRUNCATED' });
});
test('transient 503 retries use exponential backoff, identical requests and no overlapping SDK calls', { timeout: 15000 }, async () => {
  const config = input({ meal: 'all' });
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
  assert.equal(Object.keys(result.meals).length, 4); assert.equal(calls.length, 3); assert.equal(maxActive, 1);
  assert.equal(calls[0].body, calls[1].body); assert.equal(calls[1].body, calls[2].body);
  assert.ok(calls[1].time - calls[0].time >= 1900); assert.ok(calls[2].time - calls[1].time >= 3900);
});

test('transient 503 retries stop after three upstream failures with a sanitized provider error', { timeout: 15000 }, async () => {
  let calls = 0;
  const planner = fakeService(async () => { calls++; throw Object.assign(new Error('private-key-must-not-leak'), { status: 503 }); });
  await assert.rejects(planner.generate(input({ meal: 'all' }), []),
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

test('timeout recovery: a retry can finish after 45 seconds without increasing the SDK attempt timeout', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const config = input({ meal: 'all' });
  let calls = 0, sdkTimeout;
  const service = createMenuPlanner({ env: { GEMINI_API_KEY: 'disposable-timeout-key' }, createClient(options) {
    sdkTimeout = options.httpOptions.timeout;
    return { models: { generateContent() {
      const attempt = ++calls;
      return new Promise((resolve, reject) => setTimeout(() => attempt === 1
        ? reject(Object.assign(new Error('temporary unavailability'), { status: 503 }))
        : resolve({ text: JSON.stringify(fixturePlan(config)) }), attempt === 1 ? 30000 : 20000));
    } } };
  } });
  const operation = service.generate(config, []);
  t.mock.timers.tick(30000); await flush();
  t.mock.timers.tick(2000); await new Promise((resolve) => realTimeout(resolve, 2100)); await flush();
  t.mock.timers.tick(20000); await flush();
  const result = await operation;
  assert.equal(calls, 2); assert.equal(Object.keys(result.meals).length, 4); assert.equal(result.timing.attempts, 2);
  assert.equal(sdkTimeout, 45000); assert.equal(GEMINI_ATTEMPT_TIMEOUT_MS, 45000);
  assert.equal(GEMINI_PLAN_TIMEOUT_MS, 3 * 45000 + 2000 + 4000);
  assert.equal(result.timing.totalTimeoutMs, 141000);
});

test('timeout recovery: planner, SDK, network and upstream timeouts have distinct safe diagnostics', async () => {
  const cases = [
    [() => new Promise(() => {}), { timeoutMs: 15 }, 'planner_deadline', undefined],
    [async () => { throw Object.assign(new Error('private-key-must-not-leak'), { name: 'AbortError' }); }, {}, 'sdk_timeout', undefined],
    [async () => { throw new TypeError('private-key-must-not-leak', { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } }); }, {}, 'network_timeout', undefined],
    [async () => { throw Object.assign(new Error('private-key-must-not-leak'), { status: 504 }); }, {}, 'upstream_gemini', 504],
  ];
  for (const [generate, options, source, providerStatus] of cases) {
    await assert.rejects(fakeService(generate, options).generate(input(), []), (error) => {
      assert.equal(error.statusCode, 504); assert.equal(error.code, 'GEMINI_TIMEOUT');
      assert.equal(error.timing.timeoutSource, source); assert.equal(error.providerStatus, providerStatus);
      assert.equal(error.timing.attempts, 1); assert.ok(error.timing.elapsedMs >= 0);
      assert.doesNotMatch(JSON.stringify(error), /private-key-must-not-leak|disposable-sdk-test-key/); return true;
    });
  }
});

test('timeout recovery: overall deadline cancels backoff and retains the last real provider status', async () => {
  let calls = 0;
  await assert.rejects(fakeService(async () => { calls++; throw Object.assign(new Error('temporary unavailability'), { status: 503 }); }, { timeoutMs: 20 }).generate(input(), []),
    (error) => error.code === 'GEMINI_TIMEOUT' && error.timing.timeoutSource === 'planner_deadline'
      && error.timing.lastProviderStatus === 503 && error.providerStatus === undefined);
  assert.equal(calls, 1);
});

test('timeout recovery: pre-aborted callers consume no Gemini request and caller cancellation is not a timeout', async () => {
  const alreadyAborted = new AbortController(); alreadyAborted.abort(); let calls = 0;
  await assert.rejects(fakeService(async () => { calls++; }).generate(input(), [], alreadyAborted.signal),
    (error) => error.code === 'GEMINI_CANCELLED' && error.timing.timeoutSource === 'client_cancelled');
  assert.equal(calls, 0);
  const controller = new AbortController();
  const service = fakeService(async () => { calls++; setTimeout(() => controller.abort(), 10);
    throw Object.assign(new Error('temporary unavailability'), { status: 503 }); });
  await assert.rejects(service.generate(input(), [], controller.signal),
    (error) => error.code === 'GEMINI_CANCELLED' && error.timing.timeoutSource === 'client_cancelled');
  assert.equal(calls, 1);
});

test('timeout recovery: controller releases the owner lock after timeout and never publishes a partial plan', async (t) => {
  const query = { select() { return this; }, sort() { return this; }, limit() { return this; }, async lean() { return []; } };
  t.mock.method(MessMenu, 'find', () => query);
  const writes = t.mock.method(MessMenu, 'create', () => { throw new Error('Generation must never save menus'); });
  const warnings = t.mock.method(console, 'warn', () => {});
  let calls = 0;
  const config = input({ meal: 'all' });
  const service = fakeService(async () => { calls++; return calls === 1 ? new Promise(() => {}) : { text: JSON.stringify(fixturePlan(config)) }; }, { timeoutMs: 20 });
  const req = { body: config, owner: { _id: new mongoose.Types.ObjectId() }, app: { locals: { messAIPlanner: service } } };
  const response = () => ({ writableEnded: false, once() {}, removeListener() {}, status(status) { this.statusCode = status; return this; }, json(body) { this.body = body; this.writableEnded = true; return this; } });
  const failed = response(); await generateMessPlan(req, failed, (error) => { throw error; });
  assert.equal(failed.statusCode, 504); assert.equal(failed.body.timing.timeoutSource, 'planner_deadline');
  assert.equal(failed.body.data, undefined);
  const recovered = response(); await generateMessPlan(req, recovered, (error) => { throw error; });
  assert.equal(Object.keys(recovered.body.data.meals).length, 4); assert.equal(calls, 2); assert.equal(writes.mock.callCount(), 0);
  assert.equal(warnings.mock.callCount(), 1); assert.doesNotMatch(JSON.stringify(warnings.mock.calls[0].arguments), /private-key|disposable-sdk-test-key/);
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
    const all = await plan(input({ meal: 'all', budget: 150 })); assert.equal(all.status, 200);
    assert.deepEqual(Object.keys(JSON.parse(captured.contents).recentMenus[0].meals), ['breakfast', 'lunch', 'eveningSnacks', 'dinner']);
    assert.doesNotMatch(captured.contents, /FOREIGN_DISH|TOO_OLD|PRIVATE_|9800000001|pgId|owner/);
    const other = await plan(input(), foreignToken); assert.equal(other.status, 200); assert.match(captured.contents, /FOREIGN_DISH/); assert.doesNotMatch(captured.contents, /Recent Idli/);
    assert.deepEqual(await MessMenu.collection.find({}).toArray(), original);
  });
  await t.test('daily All Meals and individual suggestions do not save anything; exact repeats warn', async () => {
    reset(); for (const config of [input(), input({ meal: 'all' }), input({ mode: 'meal', meal: 'dinner' })]) { const result = await plan(config); assert.equal(result.status, 200); assert.equal(result.data.meals ? Object.keys(result.data.meals).length : result.data.suggestions.length, config.meal === 'all' ? 4 : config.mode === 'meal' ? 1 : 3); }
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
