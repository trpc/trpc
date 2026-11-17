import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { trackedFiles } from '../src/lib/git';

let dir: string | null = null;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

it('lists every tracked file, more than 1 MiB of paths, as written', async () => {
  dir = mkdtempSync(join(tmpdir(), 'trpc-upgrade-git-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  // Names git would quote without `-z`, plus enough to pass 1 MiB of output
  const names = ['with space.ts', 'ünïcode.tsx'];
  const long = 'x'.repeat(200);
  for (let i = 0; i < 6000; i++) names.push(`${long}${i}.ts`);
  for (const name of names) writeFileSync(join(dir, name), '');
  writeFileSync(join(dir, 'untracked.ts'), '');
  execFileSync('git', ['add', ...names], { cwd: dir, maxBuffer: 1 << 30 });

  const files = await trackedFiles(dir);

  expect(files).toHaveLength(names.length);
  expect(files).toContain(join(dir, 'with space.ts'));
  expect(files).toContain(join(dir, 'ünïcode.tsx'));
  expect(files).not.toContain(join(dir, 'untracked.ts'));
});
