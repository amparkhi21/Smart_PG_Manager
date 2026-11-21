import test from 'node:test';
import assert from 'node:assert/strict';
import { AxiosError } from 'axios';
import { PRODUCTION_API_BASE_URL, resolveApiBaseUrl } from './config.js';
import { createApiClient, TOKEN_KEY } from './http.js';

test('production API configuration prefers an explicit HTTPS API and normalizes a trailing slash', () => {
  assert.equal(resolveApiBaseUrl('https://pg-api.onrender.com/api/', true), 'https://pg-api.onrender.com/api');
  for (const value of ['http://pg-api.onrender.com/api', '/api', 'https://pg-api.onrender.com',
    'https://pg-api.onrender.com/api/api',
    'https://user:password@pg-api.onrender.com/api', 'https://pg-api.onrender.com/api?token=private']) {
    assert.throws(() => resolveApiBaseUrl(value, true));
  }
  assert.equal(resolveApiBaseUrl(undefined, false), '/api');
  assert.equal(resolveApiBaseUrl('http://localhost:5000/api', false), 'http://localhost:5000/api');
});

test('production falls back to the real Render API for missing or loopback environment values', () => {
  assert.equal(PRODUCTION_API_BASE_URL, 'https://smart-pg-manager-backend.onrender.com/api');
  for (const value of [undefined, '', '  ', 'http://localhost:5000/api', 'https://localhost/api',
    'https://127.0.0.1/api', 'http://[::1]:5000/api', 'http://127.1:5000/api']) {
    assert.equal(resolveApiBaseUrl(value, true), PRODUCTION_API_BASE_URL);
  }
});

test('production login targets Render with one /api prefix and preserves a configured override', async () => {
  for (const value of [undefined, 'http://localhost:5000/api', 'https://custom-backend.unit.test/api/']) {
    const api = createApiClient({ baseURL: resolveApiBaseUrl(value, true), storage: { getItem: () => null }, onUnauthorized() {} });
    let requestUrl;
    api.defaults.adapter = async (config) => {
      requestUrl = api.getUri(config);
      return { status: 200, data: {}, headers: {}, config };
    };
    await api.post('/auth/login', {});
    assert.equal(requestUrl, value?.includes('custom-backend')
      ? 'https://custom-backend.unit.test/api/auth/login'
      : 'https://smart-pg-manager-backend.onrender.com/api/auth/login');
    assert.ok(!requestUrl.includes('/api/api/'));
  }
});

function sessionClient() {
  const values = new Map([[TOKEN_KEY, 'test-only-token']]);
  const storage = { getItem: (key) => values.get(key), removeItem: (key) => values.delete(key) };
  let logouts = 0;
  const api = createApiClient({ baseURL: 'https://pg-api.onrender.com/api', storage, onUnauthorized: () => { logouts += 1; } });
  return { api, storage, logouts: () => logouts };
}

test('cross-host requests attach the saved JWT and allow Render cold-start time', async () => {
  const { api } = sessionClient();
  let captured;
  api.defaults.adapter = async (config) => {
    captured = config;
    return { status: 200, data: {}, headers: {}, config };
  };
  await api.get('/settings');
  assert.equal(api.getUri(captured), 'https://pg-api.onrender.com/api/settings');
  assert.equal(captured.headers.Authorization, 'Bearer test-only-token');
  assert.equal(captured.timeout, 90000);
  assert.ok(!captured.withCredentials);
});

test('only protected 401 responses clear sessions; timeouts, outages, and login errors preserve them', async () => {
  for (const [path, status] of [['/auth/me', undefined], ['/auth/me', 503], ['/auth/login', 401], ['/auth/register', 401], ['/auth/resident/login', 401], ['/auth/me', 401]]) {
    const client = sessionClient();
    client.api.defaults.adapter = async (config) => {
      throw new AxiosError('test response', status ? 'ERR_BAD_RESPONSE' : 'ECONNABORTED', config, {}, status ? { status, config } : undefined);
    };
    await assert.rejects(client.api.get(path));
    const expired = status === 401 && path === '/auth/me';
    assert.equal(client.storage.getItem(TOKEN_KEY), expired ? undefined : 'test-only-token');
    assert.equal(client.logouts(), expired ? 1 : 0);
  }
});
