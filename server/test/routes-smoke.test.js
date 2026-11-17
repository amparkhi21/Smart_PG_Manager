import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import app from '../src/app.js';

const request = (port, path) => new Promise((resolve, reject) => {
  const req = http.get({ hostname: '127.0.0.1', port, path }, (res) => {
    res.resume();
    res.on('end', () => resolve(res.statusCode));
  });
  req.on('error', reject);
});

test('health endpoint works and protected APIs reject unauthenticated requests', async (t) => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

  const port = server.address().port;
  assert.equal(await request(port, '/api/health'), 200);
  const protectedPaths = [
    '/api/auth/me',
    '/api/dashboard',
    '/api/rooms',
    '/api/residents',
    '/api/attendance',
    '/api/attendance/summary',
    '/api/rent',
    '/api/electricity',
    '/api/settings',
    '/api/reminders/activity',
    '/api/reports?month=2026-11',
  ];
  for (const path of protectedPaths) {
    assert.equal(await request(port, path), 401, `${path} should require authentication`);
  }
});
