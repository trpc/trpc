import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tempDirResource } from './__tempDir';
import { expect, it } from 'vitest';
import { isolatedGitEnv, projectFiles } from '../src/lib/git';

it('lists every project file, more than 1 MiB of paths, as written', async () => {
  using fixture = tempDirResource('trpc-upgrade-git-');
  const repo = fixture.dir;
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
  // Not yet committed, but part of the project
  writeFileSync(join(repo, 'untracked.ts'), '');
  // Generated code, e.g. a Prisma client's `index.d.ts`
  writeFileSync(join(repo, '.gitignore'), 'generated/\n');
  mkdirSync(join(repo, 'generated'));
  writeFileSync(join(repo, 'generated/index.d.ts'), '');

  // A hook's `GIT_DIR` must not point it at another repository
  const before = process.env['GIT_DIR'];
  process.env['GIT_DIR'] = join(tmpdir(), 'not-a-repository');
  let files: string[];
  try {
    files = await projectFiles(repo);
  } finally {
    if (before === undefined) delete process.env['GIT_DIR'];
    else process.env['GIT_DIR'] = before;
  }

  expect(files).toHaveLength(names.length + 2);
  expect(files).toContain(join(repo, 'with space.ts'));
  expect(files).toContain(join(repo, 'ünïcode.tsx'));
  expect(files).toContain(join(repo, 'untracked.ts'));
  expect(files).not.toContain(join(repo, 'generated/index.d.ts'));
});
