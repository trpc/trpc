import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { scanProject } from '../src/lib/ast/scanners';

let dir: string | null = null;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

/** A project with these files, and a tsconfig that includes them */
function project(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'trpc-upgrade-scan-'));
  dir = root;
  writeFileSync(
    join(root, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { strict: true }, include: ['*.ts'] }),
  );
  for (const [name, source] of Object.entries(files)) {
    writeFileSync(join(root, name), source);
  }
  return root;
}

const router = `export type AppRouter = { router: true };\n`;

it('finds the router type of the only setup', () => {
  const root = project({
    'router.ts': router,
    'trpc.ts': `import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from './router';
export const trpc = createTRPCReact<AppRouter>();
`,
  });
  expect(scanProject(root).routerType).toEqual({
    name: 'AppRouter',
    file: join(root, 'router.ts'),
    extension: '',
  });
});

it('finds none when another setup has a router type it cannot follow', () => {
  const root = project({
    'router.ts': router,
    'trpc.ts': `import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from './router';
export const trpc = createTRPCReact<AppRouter>();
`,
    'other.ts': `import { createTRPCReact } from '@trpc/react-query';
import type * as api from './router';
export const other = createTRPCReact<api.AppRouter>();
`,
  });
  expect(scanProject(root).routerType).toBeNull();
});
