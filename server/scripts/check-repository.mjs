import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const files = execFileSync('git', ['ls-files', '-z'], { cwd: repositoryRoot, encoding: 'utf8' }).split('\0').filter(Boolean);
// --no-index checks tracked paths too. Read repository ignore rules only, so
// developer-global excludes cannot change this release check's result.
const checked = spawnSync('git', [
  '-c', 'core.excludesFile=', 'check-ignore', '--no-index', '-z', '--stdin',
], { cwd: repositoryRoot, input: files.join('\0') + '\0', encoding: 'utf8' });
if (checked.error || ![0, 1].includes(checked.status)) {
  throw new Error('Could not inspect repository ignore rules');
}
const unsafe = checked.stdout.split('\0').filter(Boolean);
if (unsafe.length) {
  console.error('Unsafe tracked paths (contents withheld):\n' + unsafe.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Git hygiene passed: ${files.length} tracked files; none match repository credential or artifact exclusions. Safe .env.example templates remain allowed.`);
}
console.log('This check inspects current tracked paths only; it does not clear secrets from Git history.');
