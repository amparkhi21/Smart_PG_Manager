import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

function repository(t, paths) {
  const root = mkdtempSync(join(tmpdir(), 'smart-pg-hygiene-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '--quiet', root]);
  mkdirSync(join(root, 'server/scripts'), { recursive: true });
  copyFileSync(new URL('../../.gitignore', import.meta.url), join(root, '.gitignore'));
  copyFileSync(new URL('../scripts/check-repository.mjs', import.meta.url), join(root, 'server/scripts/check-repository.mjs'));
  for (const path of paths) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), 'synthetic-content-must-not-be-printed');
  }
  execFileSync('git', ['add', '--force', '--', '.gitignore', 'server/scripts/check-repository.mjs', ...paths], { cwd: root });
  return spawnSync(process.execPath, ['server/scripts/check-repository.mjs'], { cwd: root, encoding: 'utf8' });
}

test('repository hygiene preserves explicit safe environment templates', (t) => {
  const result = repository(t, ['frontend/.env.example', 'server/.env.example', 'src/app.js']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Git hygiene passed/);
});

test('repository hygiene rejects force-added credentials, copies and generated outputs without contents', (t) => {
  const paths = [
    'server/.env', 'server/.env.production', 'frontend/android/app/google-services.json',
    'credentials-copy.json', 'credentials.json.backup', 'secrets/firebase-adminsdk-copy.json',
    'secrets/serviceAccount-copy.json', 'secrets/account-service-account.json',
    'keys/release.jks', 'keys/release.keystore.backup', 'keys/private.pfx', 'keys/private.pk8',
    'keys/private.key', 'keys/certificate.pem', 'keys/keystore.properties', 'keys/key.properties.backup',
    '.ssh/id_ed25519', 'nested/id_rsa.backup', 'android/app.apk', 'android/app.aab',
    'tmp/result.json', 'frontend/dist/index.html', 'logs/startup.log', 'backup/records.json',
  ];
  const result = repository(t, paths);
  assert.equal(result.status, 1, result.stderr);
  for (const path of paths) assert.ok(result.stderr.includes(path), `Missing protected path: ${path}`);
  assert.doesNotMatch(result.stdout + result.stderr, /synthetic-content-must-not-be-printed/);
});
