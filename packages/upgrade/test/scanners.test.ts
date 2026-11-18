import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDirResource } from './__tempDir';
import { expect, it } from 'vitest';
import { scanProject } from '../src/lib/ast/scanners';

/** A project with these files, and a tsconfig that includes them */
function project(files: Record<string, string>) {
  const fixture = tempDirResource('trpc-upgrade-scan-');
  const root = fixture.dir;
  writeFileSync(
    join(root, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { strict: true }, include: ['*.ts'] }),
  );
  for (const [name, source] of Object.entries(files)) {
    writeFileSync(join(root, name), source);
  }
  return fixture;
}

const router = `export type AppRouter = { router: true };\n`;

it('finds the router type of the only setup', () => {
  using fixture = project({
    'router.ts': router,
    'trpc.ts': `import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from './router';
export const trpc = createTRPCReact<AppRouter>();
`,
  });
  const root = fixture.dir;
  expect(scanProject(root).routerType).toEqual({
    name: 'AppRouter',
    file: join(root, 'router.ts'),
    extension: '',
  });
});

it('finds none when another setup has a router type it cannot follow', () => {
  using fixture = project({
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
  const root = fixture.dir;
  expect(scanProject(root).routerType).toBeNull();
});

it('finds none when another setup calls the factory by an alias', () => {
  using fixture = project({
    'router.ts': router,
    'other-router.ts': `export type OtherRouter = { other: true };\n`,
    'trpc.ts': `import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from './router';
export const trpc = createTRPCReact<AppRouter>();
`,
    'other.ts': `import { createTRPCReact as createReact } from '@trpc/react-query';
import type { OtherRouter } from './other-router';
export const other = createReact<OtherRouter>();
`,
  });
  const root = fixture.dir;
  expect(scanProject(root).routerType).toBeNull();
});

it("finds the setup's name when it calls the factory by an alias", () => {
  using fixture = project({
    'router.ts': router,
    'trpc.ts': `import { createTRPCReact as createReact } from '@trpc/react-query';
import type { AppRouter } from './router';
export const api = createReact<AppRouter>();
`,
  });
  const root = fixture.dir;
  const { references, routerType } = scanProject(root);
  expect(references.importName).toBe('api');
  expect(routerType).toEqual({
    name: 'AppRouter',
    file: join(root, 'router.ts'),
    extension: '',
  });
});
