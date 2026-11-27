import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import express from 'express';
import { createApp } from '../src/app.js';
import { clientOrigins, validateEnv } from '../src/config/env.js';
import { errorHandler } from '../src/middlewares/errorHandler.js';
import Owner from '../src/models/Owner.js';

const productionEnv = () => ({
  NODE_ENV: 'production', PORT: '10000',
  MONGO_URI: 'mongodb+srv://test-user:test-password@cluster.unit.test/pg',
  JWT_SECRET: 'test-only-secret-'.repeat(4), JWT_EXPIRES_IN: '7d',
  CLIENT_URL: 'https://smart-pg-manager.vercel.app, https://preview.unit.test/',
});

async function serve(t, app) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}`;
}

test('production configuration accepts cloud settings and normalizes exact CORS origins', () => {
  assert.deepEqual(validateEnv(productionEnv()), { port: 10000 });
  assert.deepEqual(clientOrigins(productionEnv()), ['https://smart-pg-manager.vercel.app', 'https://preview.unit.test']);
  assert.deepEqual(clientOrigins({ NODE_ENV: 'development' }), ['http://localhost:5173']);
});

test('production configuration accepts an explicitly configured Capacitor Android origin alongside website origins', () => {
  const env = productionEnv();
  env.CLIENT_URL += ', https://localhost, https://localhost/';
  assert.deepEqual(validateEnv(env), { port: 10000 });
  assert.deepEqual(clientOrigins(env), [
    'https://smart-pg-manager.vercel.app', 'https://preview.unit.test', 'https://localhost',
  ]);
  assert.deepEqual(clientOrigins({ NODE_ENV: 'production', CLIENT_URL: 'https://localhost' }), ['https://localhost']);
});

test('production configuration rejects missing secrets, placeholders, and unsafe origins', () => {
  const invalid = [
    { MONGO_URI: '' }, { MONGO_URI: 'mongodb://127.0.0.1:27017/pg' },
    { MONGO_URI: 'mongodb+srv://<user>:<password>@<cluster>/pg' },
    { JWT_SECRET: '' }, { JWT_SECRET: 'short' },
    { JWT_SECRET: 'replace_me_with_a_long_random_secret' },
    { CLIENT_URL: '' }, { CLIENT_URL: '*' }, { CLIENT_URL: 'https://*.vercel.app' },
    { CLIENT_URL: 'http://pg-manager.vercel.app' }, { CLIENT_URL: 'http://localhost' },
    { CLIENT_URL: 'http://localhost:5173' }, { CLIENT_URL: 'https://localhost:5173' },
    { CLIENT_URL: 'https://127.0.0.1' }, { CLIENT_URL: 'https://127.0.0.2' },
    { CLIENT_URL: 'https://[::1]' }, { CLIENT_URL: 'https://0.0.0.0' },
    { CLIENT_URL: 'https://app.localhost' }, { CLIENT_URL: 'capacitor://localhost' },
    { CLIENT_URL: 'https://localhost/path' }, { CLIENT_URL: 'https://localhost?debug=1' },
    { CLIENT_URL: 'https://localhost#fragment' }, { CLIENT_URL: 'https://user:password@localhost' },
    { CLIENT_URL: 'https://localhost, http://localhost:5173' },
    { CLIENT_URL: 'https://pg-manager.vercel.app/path' },
    { CLIENT_URL: 'https://user:password@pg-manager.vercel.app' },
    { PORT: 'NaN' }, { PORT: '0' }, { PORT: '65536' },
    { JWT_EXPIRES_IN: 'invalid' }, { JWT_EXPIRES_IN: '-1d' }, { JWT_EXPIRES_IN: '0s' },
    { NODE_ENV: 'prod' },
  ];
  for (const override of invalid) assert.throws(() => validateEnv({ ...productionEnv(), ...override }), Object.keys(override)[0]);
});

test('cross-origin JWT requests get exact CORS headers and Authorization preflight succeeds', async (t) => {
  const app = createApp(productionEnv());
  assert.equal(app.get('trust proxy'), 1);
  const base = await serve(t, app);
  const origin = 'https://smart-pg-manager.vercel.app';
  const preflight = await fetch(`${base}/api/settings`, {
    method: 'OPTIONS', headers: {
      Origin: origin, 'Access-Control-Request-Method': 'PATCH',
      'Access-Control-Request-Headers': 'authorization,content-type',
    },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
  assert.match(preflight.headers.get('access-control-allow-headers'), /Authorization/);
  assert.match(preflight.headers.get('access-control-allow-methods'), /PATCH/);
  const unauthorized = await fetch(`${base}/api/settings`, { headers: { Origin: origin } });
  assert.equal(unauthorized.status, 401);
  assert.equal(unauthorized.headers.get('access-control-allow-origin'), origin);
  assert.equal(unauthorized.headers.get('cache-control'), 'no-store');
  assert.equal(unauthorized.headers.get('x-powered-by'), null);
  assert.equal(unauthorized.headers.get('x-content-type-options'), 'nosniff');
  const denied = await fetch(`${base}/api/health`, { headers: { Origin: 'https://untrusted.unit.test' } });
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
});

test('local development CORS allows the Vite origin and login preflight', async (t) => {
  const base = await serve(t, createApp({ NODE_ENV: 'development', CLIENT_URL: 'http://localhost:5173' }));
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'OPTIONS', headers: {
      Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization,content-type',
    },
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.match(response.headers.get('access-control-allow-methods'), /POST/);
});

test('Capacitor and website CORS allow login and bearer preflights while protected routes still require authentication', async (t) => {
  const env = productionEnv();
  env.CLIENT_URL += ', https://localhost';
  const base = await serve(t, createApp(env));
  for (const origin of clientOrigins(env)) {
    for (const [path, method] of [['/api/auth/login', 'POST'], ['/api/settings', 'PATCH']]) {
      const preflight = await fetch(`${base}${path}`, {
        method: 'OPTIONS', headers: {
          Origin: origin, 'Access-Control-Request-Method': method,
          'Access-Control-Request-Headers': 'authorization,content-type',
        },
      });
      assert.equal(preflight.status, 204, `${origin} ${method} preflight`);
      assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
      assert.equal(preflight.headers.get('access-control-allow-headers'), 'Authorization,Content-Type');
      assert.ok(preflight.headers.get('access-control-allow-methods').split(',').includes(method));
      assert.match(preflight.headers.get('vary'), /Origin/);
      assert.equal(preflight.headers.get('access-control-allow-credentials'), null);
    }
    const health = await fetch(`${base}/api/health`, { headers: { Origin: origin } });
    assert.equal(health.status, 200);
    assert.equal(health.headers.get('access-control-allow-origin'), origin);
    const protectedResponse = await fetch(`${base}/api/settings`, { headers: { Origin: origin } });
    assert.equal(protectedResponse.status, 401);
    assert.equal(protectedResponse.headers.get('access-control-allow-origin'), origin);
  }
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
});

test('Capacitor CORS remains opt-in and rejects unconfigured origins and localhost lookalikes', async (t) => {
  const websiteOnly = await serve(t, createApp(productionEnv()));
  const env = productionEnv();
  env.CLIENT_URL += ', https://localhost';
  const withAndroid = await serve(t, createApp(env));
  const deniedOrigins = [
    'http://localhost', 'http://localhost:5173', 'https://localhost:5173',
    'https://127.0.0.1', 'https://[::1]', 'https://0.0.0.0', 'https://app.localhost',
    'https://localhost.evil.unit.test', 'https://smart-pg-manager.vercel.app.evil.unit.test',
    'https://untrusted.unit.test', 'capacitor://localhost', 'null',
  ];
  for (const [base, origins] of [[websiteOnly, ['https://localhost']], [withAndroid, deniedOrigins]]) {
    for (const origin of origins) {
      for (const method of ['GET', 'OPTIONS']) {
        const response = await fetch(`${base}/api/health`, {
          method, headers: {
            Origin: origin, 'Access-Control-Request-Method': 'GET',
            'Access-Control-Request-Headers': 'authorization,content-type',
          },
        });
        assert.equal(response.status, 403, `${method} ${origin}`);
        assert.equal(response.headers.get('access-control-allow-origin'), null);
        assert.equal(response.headers.get('access-control-allow-headers'), null);
        assert.equal((await response.json()).message, 'Origin is not allowed');
      }
    }
  }
});

test('health stays available while readiness reflects database ping success or failure', async (t) => {
  const base = await serve(t, createApp(productionEnv()));
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
  assert.equal((await fetch(`${base}/api/ready`)).status, 503);
  const connection = mongoose.connection;
  const originalState = Object.getOwnPropertyDescriptor(connection, 'readyState');
  const originalDb = connection.db;
  t.after(() => {
    if (originalState) Object.defineProperty(connection, 'readyState', originalState);
    else delete connection.readyState;
    connection.db = originalDb;
  });
  Object.defineProperty(connection, 'readyState', { value: 1, configurable: true });
  connection.db = { admin: () => ({ ping: async () => ({ ok: 1 }) }) };
  assert.equal((await fetch(`${base}/api/ready`)).status, 200);
  connection.db = { admin: () => ({ ping: async () => { throw new Error('private database details'); } }) };
  const failed = await fetch(`${base}/api/ready`);
  assert.equal(failed.status, 503);
  assert.doesNotMatch(await failed.text(), /private database details/);
});

test('JWT sessions accept a valid HS256 token and reject expired, malformed, or differently signed tokens', async (t) => {
  const secret = productionEnv().JWT_SECRET;
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = secret;
  t.after(() => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });
  let lookups = 0;
  t.mock.method(Owner, 'findById', async (id) => { lookups += 1; return { _id: id, name: 'Test Owner' }; });
  const env = productionEnv();
  env.CLIENT_URL += ', https://localhost';
  const base = await serve(t, createApp(env));
  const id = new mongoose.Types.ObjectId().toString();
  const invalid = [
    'malformed',
    jwt.sign({ id }, secret, { expiresIn: -1 }),
    jwt.sign({ id }, 'different-test-secret', { expiresIn: '1h' }),
    jwt.sign({ id }, secret, { algorithm: 'HS384', expiresIn: '1h' }),
    jwt.sign({ id: 'invalid-object-id' }, secret, { expiresIn: '1h' }),
  ];
  const origins = ['https://smart-pg-manager.vercel.app', 'https://localhost'];
  for (const origin of origins) {
    for (const token of invalid) {
      const response = await fetch(`${base}/api/auth/me`, { headers: { Origin: origin, Authorization: `Bearer ${token}` } });
      assert.equal(response.status, 401);
      assert.equal(response.headers.get('access-control-allow-origin'), origin);
    }
  }
  assert.equal(lookups, 0);
  for (const origin of origins) {
    const response = await fetch(`${base}/api/auth/me`, {
      headers: { Origin: origin, Authorization: `Bearer ${jwt.sign({ id }, secret, { expiresIn: '1h' })}` },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
    assert.equal((await response.json()).data.owner.id, id);
  }
  assert.equal(lookups, origins.length);
});

test('production errors omit private details and malformed JSON returns 400', async (t) => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  t.after(() => {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  });
  const log = t.mock.method(console, 'error', () => {});
  const app = express();
  app.use(express.json());
  app.get('/failure', () => { throw Object.assign(new Error('private credential'), { status: 503, errors: ['private details'] }); });
  app.use(errorHandler);
  const base = await serve(t, app);
  const failure = await fetch(`${base}/failure`);
  assert.equal(failure.status, 503);
  const body = await failure.json();
  assert.equal(body.stack, undefined);
  assert.equal(body.errors, undefined);
  assert.doesNotMatch(JSON.stringify(body), /private/);
  assert.doesNotMatch(JSON.stringify(log.mock.calls), /credential|private details/);
  const malformed = await fetch(`${base}/failure`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{invalid' });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).message, 'Invalid JSON request body');
});

test('authentication rate limiting uses the forwarded client IP behind the production proxy', async (t) => {
  const base = await serve(t, createApp(productionEnv()));
  for (let attempt = 0; attempt < 50; attempt += 1) {
    assert.equal((await fetch(`${base}/api/auth/me`, { headers: { 'X-Forwarded-For': '198.51.100.10' } })).status, 401);
  }
  const limited = await fetch(`${base}/api/auth/me`, { headers: { 'X-Forwarded-For': '198.51.100.10' } });
  assert.equal(limited.status, 429);
  assert.ok(limited.headers.get('retry-after'));
  assert.equal((await fetch(`${base}/api/auth/me`, { headers: { 'X-Forwarded-For': '198.51.100.11' } })).status, 401);
});
