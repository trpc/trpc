/**
 * Runs the built transforms on each example that uses `@trpc/react-query`
 * or `@trpc/next`, typechecks it before and after, then restores it with
 * git. Shows how many type errors the codemod leaves behind.
 *
 *   pnpm --filter @trpc/upgrade build
 *   pnpm --filter @trpc/upgrade try-examples [examples/next-prisma-starter …]
 *
 * It changes the examples in place, so it refuses one with uncommitted changes.
 */
// A command-line script: it reports with console.log
// oxlint-disable no-console
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve } from 'node:path';
import { scanProject } from '../src/lib/ast/scanners';

const repo = resolve(import.meta.dirname, '../../..');
const require = createRequire(join(repo, 'packages/upgrade/package.json'));
const { run } = require('jscodeshift/src/Runner.js') as {
  run: (
    transform: string,
    files: string[],
    options: Record<string, unknown>,
  ) => Promise<unknown>;
};

function examples(): string[] {
  const found: string[] = [];
  const visit = (dir: string, depth: number) => {
    if (existsSync(join(dir, 'package.json'))) {
      const pkg = readFileSync(join(dir, 'package.json'), 'utf8');
      if (/"@trpc\/(react-query|next)"/.test(pkg)) {
        found.push(dir);
      }
    }
    if (depth === 0) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== 'node_modules') {
        visit(join(dir, entry.name), depth - 1);
      }
    }
  };
  visit(join(repo, 'examples'), 2);
  return found;
}

function typeErrors(dir: string) {
  const result = spawnSync('pnpm', ['exec', 'tsc', '--noEmit', '-p', '.'], {
    cwd: dir,
    encoding: 'utf8',
  });
  return `${result.stdout}${result.stderr}`
    .split('\n')
    .filter((line) => /error TS\d+/.test(line));
}

async function tryExample(dir: string) {
  const name = relative(repo, dir);
  if (
    execFileSync('git', ['status', '--porcelain', '.'], {
      cwd: dir,
      encoding: 'utf8',
    })
  ) {
    console.log(`${name}: skipped, it has uncommitted changes`);
    return;
  }
  const files = execFileSync('git', ['ls-files', '*.ts', '*.tsx'], {
    cwd: dir,
    encoding: 'utf8',
  })
    .split('\n')
    .filter((file) => file && !file.endsWith('.d.ts'))
    .map((file) => join(dir, file));
  // What the CLI finds: the hooks' name and the router type
  process.chdir(dir);
  const { references, routerType } = scanProject();
  process.chdir(repo);
  const trpcImportName = references.importName;

  const before = typeErrors(dir).length;
  // What `npx @trpc/upgrade` installs
  const link = join(dir, 'node_modules/@trpc/tanstack-react-query');
  const linked = !existsSync(link);
  if (linked) {
    mkdirSync(join(dir, 'node_modules/@trpc'), { recursive: true });
    symlinkSync(join(repo, 'packages/tanstack-react-query'), link);
  }
  try {
    for (const transform of ['provider', 'hooksToOptions']) {
      await run(
        join(repo, `packages/upgrade/dist/transforms/${transform}.cjs`),
        files,
        {
          trpcImportName,
          routerType,
          silent: true,
          runInBand: true,
          babel: false,
        },
      );
    }
    const after = typeErrors(dir);
    console.log(`${name}: ${before} type errors before, ${after.length} after`);
    for (const line of after) console.log(`  ${line}`);
  } finally {
    execFileSync('git', ['checkout', '--', '.'], { cwd: dir });
    if (linked) rmSync(link);
  }
}

// Paths are relative to where you ran `pnpm`, not this package
const cwd = process.env['INIT_CWD'] ?? process.cwd();
const dirs = process.argv.slice(2).map((dir) => resolve(cwd, dir));
for (const dir of dirs.length > 0 ? dirs : examples()) {
  await tryExample(dir);
}
