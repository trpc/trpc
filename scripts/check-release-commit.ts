/**
 * Runs as the root `postversion` script: lerna has committed and tagged the
 * release, and hasn't pushed or published anything yet. Any failure here
 * stops the release with nothing pushed.
 *
 * The release commit may only change versions: `lerna.json` and the
 * packages' `package.json`. Their dependencies on each other are
 * `workspace:*`, so `pnpm-lock.yaml` stays the same, and pnpm must accept it
 * as it is. A release that re-resolves dependencies broke typecheck on main
 * with v11.23.0, so typecheck runs before the push too.
 */
import { execFileSync } from 'node:child_process';

function run(command: string, args: string[]) {
  console.log(`$ ${command} ${args.join(' ')}`);
  execFileSync(command, args, { stdio: 'inherit' });
}

function fail(message: string): never {
  console.error(`\n✖ ${message}\nNothing was pushed or published.`);
  process.exit(1);
}

const git = (...args: string[]) =>
  execFileSync('git', args, { encoding: 'utf8' }).trim();

const allowed = (file: string) =>
  file === 'lerna.json' || /^packages\/[^/]+\/package\.json$/.test(file);

const changed = git('diff', '--name-only', 'HEAD^', 'HEAD')
  .split('\n')
  .filter(Boolean);
if (changed.includes('pnpm-lock.yaml')) {
  fail(
    'The release commit changes pnpm-lock.yaml. A release only bumps versions, and the packages depend on each other with workspace:*, so the lockfile must stay the same.',
  );
}
const other = changed.filter((file) => !allowed(file));
if (other.length > 0) {
  fail(
    `The release commit changes files other than versions:\n${other.join('\n')}`,
  );
}

try {
  run('pnpm', [
    'install',
    '--frozen-lockfile',
    '--offline',
    '--ignore-scripts',
  ]);
} catch {
  fail(
    "pnpm doesn't accept pnpm-lock.yaml for the bumped package.json files. Fix the lockfile on main, then release again.",
  );
}
const dirty = git('status', '--porcelain');
if (dirty !== '') {
  fail(`pnpm install changed files:\n${dirty}`);
}

try {
  run('pnpm', ['typecheck-packages']);
} catch {
  fail('pnpm typecheck-packages failed on the release commit.');
}
