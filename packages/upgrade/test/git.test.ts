import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { isolatedGitEnv, trackedFiles } from '../src/lib/git';

let dir: string | null = null;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

it('lists every tracked file, more than 1 MiB of paths, as written', async () => {
  const repo = mkdtempSync(join(tmpdir(), 'trpc-upgrade-git-'));
  dir = repo;
  const git = (args: string[]) =>
    execFileSync('git', args, { cwd: repo, env: isolatedGitEnv() });
  git(['init', '-q']);
  // Names git would quote without `-z`, plus enough to pass 1 MiB of output
  const names = ['with space.ts', 'ünïcode.tsx'];
  const long = 'x'.repeat(200);
  for (let i = 0; i < 6000; i++) names.push(`${long}${i}.ts`);
  for (const name of names) writeFileSync(join(repo, name), '');
  // All at once, not 6,000 names on one command line
  git(['add', '-A']);
  writeFileSync(join(repo, 'untracked.ts'), '');

  // A hook's `GIT_DIR` must not point it at another repository
  const before = process.env['GIT_DIR'];
  process.env['GIT_DIR'] = join(tmpdir(), 'not-a-repository');
  let files: string[];
  try {
    files = await trackedFiles(repo);
  } finally {
    if (before === undefined) delete process.env['GIT_DIR'];
    else process.env['GIT_DIR'] = before;
  }

  expect(files).toHaveLength(names.length);
  expect(files).toContain(join(repo, 'with space.ts'));
  expect(files).toContain(join(repo, 'ünïcode.tsx'));
  expect(files).not.toContain(join(repo, 'untracked.ts'));
});
