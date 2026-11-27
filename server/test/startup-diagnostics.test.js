import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startupErrorDetails } from '../src/utils/startupError.js';

test('startup diagnostics expose nested DNS, authentication, TLS and network causes without private values', () => {
  const privateValue = 'mongodb+srv://private-user:private-password@private-host/private-db';
  const nested = (error) => Object.assign(new Error(privateValue), {
    name: 'MongooseServerSelectionError',
    reason: { servers: new Map([['private-host', { error }]]) },
  });
  const cases = [
    [Object.assign(new Error(privateValue), { code: 'ETIMEOUT', syscall: 'querySrv' }), /querySrv.*DNS lookup failed/],
    [Object.assign(new Error(privateValue), { code: 18, name: 'MongoServerError' }), /18.*authentication failed/],
    [Object.assign(new Error(`TLS ${privateValue}`), { code: 'ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR' }), /TLS negotiation failed/],
    [Object.assign(new Error(privateValue), { code: 'ETIMEDOUT' }), /servers are unreachable/],
    [Object.assign(new Error(privateValue), { code: 'ECONNREFUSED' }), /TCP connection was refused/],
    [Object.assign(new Error(privateValue), { code: 'EADDRINUSE' }), /PORT is already in use/],
  ];
  for (const [cause, expected] of cases) {
    const report = startupErrorDetails(nested(cause));
    assert.match(report, expected);
    assert.doesNotMatch(report, /private-|mongodb:\/\/|mongodb\+srv:\/\//);
  }
  assert.doesNotMatch(startupErrorDetails(new Error(privateValue)), /private-/);
});

test('server env loader works from the repository root and preserves inherited configuration', () => {
  const moduleUrl = new URL('../src/config/loadEnv.js', import.meta.url).href;
  const uri = 'mongodb://inherited-config.unit.test/retained-database';
  const result = spawnSync(process.execPath, ['--input-type=module', '-e',
    `await import(${JSON.stringify(moduleUrl)}); console.log(process.env.MONGO_URI === ${JSON.stringify(uri)});`], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)),
    env: { ...process.env, MONGO_URI: uri }, encoding: 'utf8', timeout: 5000,
  });
  assert.equal(result.status, 0); assert.equal(result.stdout.trim(), 'true');
  assert.equal(result.stderr, '');
});
