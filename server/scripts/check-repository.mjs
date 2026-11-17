import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const files = execFileSync('git', ['ls-files', '-z'], { cwd: repositoryRoot, encoding: 'utf8' }).split('\0').filter(Boolean);
const unsafe = files.filter((file) => {
  if (/(^|\/)\.env\.example$/.test(file)) return false;
  return /(^|\/)(\.env($|\.)|node_modules\/|dist\/|coverage\/|test-results\/|playwright-report\/|backups?\/|data-exports\/)|\.(pem|key|p12|dump|log|bak|backup|old|orig|bson|archive|tmp)$/i.test(file);
});
if (unsafe.length) {
  console.error('Unsafe tracked paths (contents withheld):\n' + unsafe.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Git hygiene passed: ${files.length} tracked files; no env secrets, dependency directories, build outputs, private keys, backups, or test artifacts tracked.`);
}
console.log('This check inspects current tracked paths only; it does not clear secrets from Git history.');
