import test from 'node:test';
import assert from 'node:assert/strict';
import { AxiosError } from 'axios';
import { createSessionStorage } from './sessionStorage.js';
import { exportFile } from './files.js';
import { validateExternalUrl } from './external.js';
import { registerBackHandler, dismissTopLayer, backAction } from './backNavigation.js';
import { createApiClient } from '../api/http.js';
import { getErrorMessage } from '../utils/format.js';

function storageFixture(legacy = null, initialNative = null) {
  const values = new Map(legacy ? [['pg_token', legacy]] : []);
  let token = initialNative;
  let writes = 0;
  const browserStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  const bridge = {
    async getToken() { return { token }; },
    async setToken(value) { token = value.token; writes += 1; },
    async clearToken() { token = null; },
  };
  return { bridge, browserStorage, writes: () => writes, storage: createSessionStorage({ native: true, bridge, browserStorage }) };
}

test('Android migrates an existing session once, removes plaintext, persists new tokens, and clears logout', async () => {
  const fixture = storageFixture('legacy-test-token');
  assert.deepEqual(await Promise.all([fixture.storage.getItem('pg_token'), fixture.storage.getItem('pg_token')]), ['legacy-test-token', 'legacy-test-token']);
  assert.equal(fixture.writes(), 1);
  assert.equal(fixture.browserStorage.getItem('pg_token'), null);
  await fixture.storage.setItem('pg_token', 'new-test-token');
  assert.equal(await fixture.storage.getItem('pg_token'), 'new-test-token');
  assert.equal(fixture.browserStorage.getItem('pg_token'), null);
  await fixture.storage.removeItem('pg_token');
  assert.equal(await fixture.storage.getItem('pg_token'), null);
});

test('failed encrypted migration preserves the old session and never silently falls back to plaintext', async () => {
  const fixture = storageFixture('legacy-test-token');
  fixture.bridge.setToken = async () => { throw new Error('Keystore unavailable'); };
  await assert.rejects(fixture.storage.getItem('pg_token'), /Keystore unavailable/);
  assert.equal(fixture.browserStorage.getItem('pg_token'), 'legacy-test-token');
  await assert.rejects(fixture.storage.getItem('pg_token'), /Keystore unavailable/);
});

test('an existing native token takes precedence over a leftover browser copy', async () => {
  const fixture = storageFixture('stale-token', 'native-token');
  assert.equal(await fixture.storage.getItem('pg_token'), 'native-token');
  assert.equal(fixture.writes(), 0);
  assert.equal(fixture.browserStorage.getItem('pg_token'), null);
});

test('browser sessions retain their storage behavior without calling native APIs', async () => {
  const fixture = storageFixture();
  const storage = createSessionStorage({ native: false, bridge: {}, browserStorage: fixture.browserStorage });
  await storage.setItem('pg_token', 'browser-token');
  assert.equal(await storage.getItem('pg_token'), 'browser-token');
  await storage.removeItem('pg_token');
  assert.equal(await storage.getItem('pg_token'), null);
});

test('asynchronous secure storage attaches bearer tokens; failed financial writes are attempted only once', async () => {
  const fixture = storageFixture(null, 'native-token');
  const activity = [];
  const api = createApiClient({ baseURL: 'https://api.unit.test/api', storage: fixture.storage, onUnauthorized() {}, onActivity: (change) => activity.push(change) });
  let attempts = 0;
  api.defaults.adapter = async (config) => {
    attempts += 1;
    assert.equal(config.headers.Authorization, 'Bearer native-token');
    throw new AxiosError('Timeout', 'ECONNABORTED', config);
  };
  await assert.rejects(api.post('/rent/record-test/payments', { amount: 100 }));
  assert.equal(attempts, 1);
  assert.equal(await fixture.storage.getItem('pg_token'), 'native-token');
  assert.deepEqual(activity, [1, -1]);
});

test('protected 401 clears native storage before announcing session expiry', async () => {
  const fixture = storageFixture(null, 'native-token');
  let logouts = 0;
  const api = createApiClient({ baseURL: 'https://api.unit.test/api', storage: fixture.storage, onUnauthorized: () => { logouts += 1; } });
  api.defaults.adapter = async (config) => { throw new AxiosError('Expired', 'ERR_BAD_RESPONSE', config, {}, { status: 401, config }); };
  await assert.rejects(api.get('/auth/me'));
  assert.equal(await fixture.storage.getItem('pg_token'), null);
  assert.equal(logouts, 1);
});

test('native PDF and UTF-8 CSV exports pass complete data and filenames to the share bridge', async () => {
  for (const [content, filename, mimeType] of [['%PDF-synthetic', 'receipt-test.pdf', 'application/pdf'], ['\uFEFFName,Amount\r\nSynthetic,100', 'rent-payments-2026-11.csv', 'text/csv']]) {
    let captured;
    await exportFile(new Blob([content]), filename, mimeType, { native: true, bridge: { async shareFile(args) { captured = args; } } });
    assert.equal(captured.filename, filename);
    assert.equal(captured.mimeType, mimeType);
    assert.equal(Buffer.from(captured.data, 'base64').toString('utf8'), content);
  }
  await assert.rejects(exportFile(new Blob(['test']), 'test.pdf', 'application/pdf', { native: true, bridge: { async shareFile() { throw new Error('No share target'); } } }), /No share target/);
});

test('external links reject HTTP, scripts, local files, credentials and intent injection', () => {
  assert.equal(validateExternalUrl('https://wa.me/919876543210?text=hello'), 'https://wa.me/919876543210?text=hello');
  assert.equal(validateExternalUrl('tel:+919876543210'), 'tel:+919876543210');
  for (const url of ['http://wa.me/123', 'javascript:alert(1)', 'file:///data/private', 'intent://scan', 'https://user:password@unit.test']) {
    assert.throws(() => validateExternalUrl(url));
  }
});

test('back closes only the top modal and safely chooses navigation or minimizing at route roots', () => {
  const dismissed = [];
  const first = registerBackHandler(() => dismissed.push('first'));
  const second = registerBackHandler(() => dismissed.push('second'));
  assert.equal(dismissTopLayer(), true);
  assert.deepEqual(dismissed, ['second']);
  second();
  dismissTopLayer();
  first();
  assert.equal(dismissTopLayer(), false);
  assert.deepEqual(dismissed, ['second', 'first']);
  assert.equal(backAction('/', 4), 'minimize');
  assert.equal(backAction('/login', 4), 'minimize');
  assert.equal(backAction('/residents/123', 2), 'back');
  assert.equal(backAction('/reports', 0), 'home');
  assert.equal(backAction('/register', 0), 'login');
});

test('write timeouts tell owners to check saved records before manually retrying', () => {
  const message = getErrorMessage({ code: 'ECONNABORTED', config: { method: 'post' } });
  assert.match(message, /waking up/);
  assert.match(message, /check whether your change was saved/);
  assert.doesNotMatch(getErrorMessage({ code: 'ECONNABORTED', config: { method: 'get' } }), /submitting again/);
});
