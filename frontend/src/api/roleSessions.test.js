import test from 'node:test';
import assert from 'node:assert/strict';
import { AxiosError } from 'axios';
import { createApiClient, TOKEN_KEY } from './http.js';

test('an expired request from an older session cannot erase a new login', async () => {
  let token = 'old-resident-token';
  let release;
  const sent = new Promise((resolve) => { release = resolve; });
  let rejectResponse;
  let logouts = 0;
  const api = createApiClient({ baseURL: 'https://test.invalid/api', storage: {
    getItem: () => token, removeItem: () => { token = null; },
  }, onUnauthorized: () => { logouts += 1; } });
  api.defaults.adapter = (config) => new Promise((resolve, reject) => {
    rejectResponse = () => reject(new AxiosError('Expired', 'ERR_BAD_RESPONSE', config, {}, { status: 401, config }));
    release();
  });
  const request = api.get('/auth/session');
  const rejected = assert.rejects(request);
  await sent;
  token = 'new-owner-token'; rejectResponse();
  await rejected;
  assert.equal(token, 'new-owner-token'); assert.equal(logouts, 0);
  assert.equal(TOKEN_KEY, 'pg_token');
});
