/**
 * Writes `generated/<domains>x<perDomain>/`: a monorepo of `domains` domain
 * packages with `perDomain` procedures each (files of 10), a contract package
 * per domain, an `api` package that mounts every domain, and client apps.
 *
 * Every app makes the same calls: each procedure of the first `used` domains,
 * once, with its result annotated. They differ only in where the router's
 * types come from (see {@link apps}).
 *
 * Procedures look like app code: zod inputs, a base procedure with an auth
 * middleware, and resolvers over a typed query builder (`packages/base`), so
 * inferring an output costs what it would against an ORM.
 */
import { join } from 'node:path';
import { Effect, FileSystem } from 'effect';
import { writeFixture, type Files } from '../kit.ts';

export interface Shape {
  readonly domains: number;
  readonly perDomain: number;
  /** Domains the apps call into. */
  readonly used: number;
}

const PER_FILE = 10;

/**
 * The client apps, by directory.
 *
 * - `source`: `AppRouter` from the api package's source, no references.
 * - `dts`: the same code, with a project reference to the api package, so
 *   its built `.d.ts` stands in for its source.
 * - `pick-dts`: `Pick<AppRouter, …>` of the domains it uses, from `.d.ts`.
 * - `slice-source`: `{ dN: DN }` from the used domain packages' source.
 * - `slice-dts`: the same, from their `.d.ts`.
 * - `contract`: the used domains' contracts (zod schemas, no resolvers).
 * - `dts-split`: `dts` with a `splitLink` on `op.path`.
 * - `dts-tanstack`: `dts` through `@trpc12/tanstack-query`'s `queryOptions`.
 */
export const apps = [
  'source',
  'dts',
  'pick-dts',
  'slice-source',
  'slice-dts',
  'contract',
  'dts-split',
  'dts-tanstack',
] as const;
export type App = (typeof apps)[number];

const usesDts = (app: App) => app.includes('dts');

const shapes = 5;

/** Procedure `j` of domain `d`: its source, call and annotated result. */
function procedure(d: number, j: number) {
  const u = `${d}_${j}`;
  return [
    {
      impl: `t.procedure
    .input(z.object({ limit_${u}: z.number().int().max(100).optional(), cursor: z.string().optional() }))
    .query((opts) => items.findMany({ select: { id: true, title_${d}: true, n_${d}: true }, take: opts.input.limit_${u} }))`,
      contract: `c.input(z.object({ limit_${u}: z.number().int().max(100).optional(), cursor: z.string().optional() })).output(z.array(z.object({ id: z.string(), title_${d}: z.string(), n_${d}: z.number() }))).query()`,
      call: (path: string) =>
        `const r${u}: Array<{ id: string; title_${d}: string; n_${d}: number }> = await ${path}.query({ limit_${u}: 10 });`,
      option: (path: string) =>
        `export const o${u} = ${path}.queryOptions({ input: { limit_${u}: 10 } });`,
    },
    {
      impl: `t.procedure
    .input(z.object({ id_${u}: z.string() }))
    .query(async (opts) => {
      const row = await items.findFirst({ where: { id: opts.input.id_${u} }, select: { id: true, title_${d}: true, body_${d}: true, ownerId: true } });
      return row ?? error({ code: 'NOT_FOUND' });
    })`,
      contract: `c.input(z.object({ id_${u}: z.string() })).output(z.object({ id: z.string(), title_${d}: z.string(), body_${d}: z.string(), ownerId: z.string() })).errors({ NOT_FOUND: {} }).query()`,
      call: (path: string) =>
        `const r${u}: { id: string; title_${d}: string; body_${d}: string; ownerId: string } = await ${path}.query({ id_${u}: 'a' });`,
      option: (path: string) =>
        `export const o${u} = ${path}.queryOptions({ input: { id_${u}: 'a' } });`,
    },
    {
      impl: `authed
    .input(z.object({ title_${u}: z.string().min(1), n: z.number() }))
    .mutation((opts) => items.create({ data: { title_${d}: opts.input.title_${u}, body_${d}: '', n_${d}: opts.input.n, ownerId: opts.ctx.user.id } }))`,
      contract: `c.input(z.object({ title_${u}: z.string().min(1), n: z.number() })).output(z.object({ id: z.string(), title_${d}: z.string(), body_${d}: z.string(), n_${d}: z.number(), ownerId: z.string(), createdAt: z.string() })).errors({ UNAUTHORIZED: {} }).mutation()`,
      call: (path: string) =>
        `const r${u}: { id: string; title_${d}: string } = await ${path}.mutate({ title_${u}: 'a', n: 1 });`,
      option: (path: string) =>
        `export const o${u} = ${path}.mutationOptions();`,
    },
    {
      impl: `authed
    .input(z.object({ id: z.string(), patch_${u}: z.object({ title: z.string().optional(), n: z.number().optional() }) }))
    .output(z.object({ id: z.string(), updated_${u}: z.boolean() }))
    .mutation(async (opts) => {
      const row = await items.update({ where: { id: opts.input.id }, data: { title_${d}: opts.input.patch_${u}.title }, select: { id: true } });
      return { id: row.id, updated_${u}: true };
    })`,
      contract: `c.input(z.object({ id: z.string(), patch_${u}: z.object({ title: z.string().optional(), n: z.number().optional() }) })).output(z.object({ id: z.string(), updated_${u}: z.boolean() })).errors({ UNAUTHORIZED: {} }).mutation()`,
      call: (path: string) =>
        `const r${u}: { updated_${u}: boolean } = await ${path}.mutate({ id: 'a', patch_${u}: { n: 2 } });`,
      option: (path: string) =>
        `export const o${u} = ${path}.mutationOptions();`,
    },
    {
      impl: `t.procedure.query(async () => {
    const rows = await items.findMany({ select: { n_${d}: true, ownerId: true } });
    return { count_${u}: rows.length, total: rows.reduce((sum, row) => sum + row.n_${d}, 0) };
  })`,
      contract: `c.output(z.object({ count_${u}: z.number(), total: z.number() })).query()`,
      call: (path: string) =>
        `const r${u}: { count_${u}: number; total: number } = await ${path}.query();`,
      option: (path: string) => `export const o${u} = ${path}.queryOptions();`,
    },
  ][j % shapes]!;
}

const tsconfig = (opts: {
  base: string;
  composite?: boolean;
  references?: ReadonlyArray<string>;
  include: ReadonlyArray<string>;
}) =>
  JSON.stringify(
    {
      extends: opts.base,
      compilerOptions: opts.composite
        ? {
            composite: true,
            emitDeclarationOnly: true,
            rootDir: 'src',
            outDir: 'dist',
          }
        : { noEmit: true, incremental: false },
      include: opts.include,
      ...(opts.references
        ? { references: opts.references.map((path) => ({ path })) }
        : {}),
    },
    null,
    2,
  );

/** The fixture's files, by path in its directory. */
export function fixture(shape: Shape): Files {
  const out: Array<readonly [string, string]> = [];
  const write = (file: string, contents: string) => out.push([file, contents]);
  const domains = Array.from({ length: shape.domains }, (_, d) => d);
  const used = domains.slice(0, shape.used);
  const files = Math.ceil(shape.perDomain / PER_FILE);
  const procsIn = (f: number) =>
    Array.from(
      { length: Math.min(PER_FILE, shape.perDomain - f * PER_FILE) },
      (_, p) => f * PER_FILE + p,
    );

  write(
    'tsconfig.base.json',
    JSON.stringify(
      {
        compilerOptions: {
          target: 'esnext',
          module: 'esnext',
          moduleResolution: 'bundler',
          moduleDetection: 'force',
          lib: ['esnext', 'dom'],
          types: [],
          strict: true,
          noUncheckedIndexedAccess: true,
          isolatedModules: true,
          skipLibCheck: true,
          paths: { '@big/*': ['./packages/*/src/index.ts'] },
        },
      },
      null,
      2,
    ),
  );

  write(
    'packages/base/src/index.ts',
    `import { error, initTrpc } from '@trpc12/trpc/server';
import type { Procedure } from '@trpc12/trpc/server';

export interface Context {
  user: { id: string; name: string } | null;
}

export const t = initTrpc<{ ctx: Context }>();

export const authed = t.procedure.use((opts) =>
  opts.ctx.user
    ? opts.next({ ctx: { user: opts.ctx.user } })
    : error({ code: 'UNAUTHORIZED' }),
);

export { error };
export type { Procedure };

// A typed query builder, standing in for an ORM.
type Select<Row> = { [K in keyof Row]?: boolean };
type Selected<Row, S> = {
  [K in keyof S & keyof Row as S[K] extends true ? K : never]: Row[K];
};
type Where<Row> = {
  [K in keyof Row]?: Row[K] | { in: ReadonlyArray<Row[K]> } | { not: Row[K] };
};
export interface Table<Row extends { id: string; createdAt: Date }> {
  findMany<S extends Select<Row>>(args: { select: S; where?: Where<Row>; take?: number | undefined }): Promise<Array<Selected<Row, S>>>;
  findFirst<S extends Select<Row>>(args: { select: S; where?: Where<Row> }): Promise<Selected<Row, S> | null>;
  create(args: { data: Omit<Row, 'id' | 'createdAt'> }): Promise<Row>;
  update<S extends Select<Row>>(args: { where: Where<Row>; data: Partial<Row>; select: S }): Promise<Selected<Row, S>>;
}
export declare function table<Row extends { id: string; createdAt: Date }>(name: string): Table<Row>;
`,
  );
  write(
    'packages/base/tsconfig.json',
    tsconfig({
      base: '../../tsconfig.base.json',
      composite: true,
      include: ['src'],
    }),
  );

  for (const d of domains) {
    for (let f = 0; f < files; f++) {
      write(
        `packages/d${d}/src/f${f}.ts`,
        `import { z } from 'zod';
import { authed, error, t, table } from '@big/base';

export interface Row {
  id: string;
  title_${d}: string;
  body_${d}: string;
  n_${d}: number;
  ownerId: string;
  createdAt: Date;
}
const items = table<Row>('d${d}');

export const f${f} = t.router({
${procsIn(f)
  .map((j) => `  p${j}: ${procedure(d, j).impl},`)
  .join('\n')}
});
`,
      );
    }
    write(
      `packages/d${d}/src/index.ts`,
      `import { t } from '@big/base';
${Array.from({ length: files }, (_, f) => `import { f${f} } from './f${f}';`).join('\n')}

export const d${d}Router = t.router({
${Array.from({ length: files }, (_, f) => `  f${f},`).join('\n')}
});
export type D${d}Router = typeof d${d}Router;
`,
    );
    write(
      `packages/d${d}/tsconfig.json`,
      tsconfig({
        base: '../../tsconfig.base.json',
        composite: true,
        include: ['src'],
        references: ['../base'],
      }),
    );

    write(
      `packages/d${d}-contract/src/index.ts`,
      `import { experimental_contract } from '@trpc12/trpc/contract';
import { z } from 'zod';

const c = experimental_contract.create();

export const d${d}Contract = {
${Array.from(
  { length: files },
  (_, f) => `  f${f}: {
${procsIn(f)
  .map((j) => `    p${j}: ${procedure(d, j).contract},`)
  .join('\n')}
  },`,
).join('\n')}
};
`,
    );
    write(
      `packages/d${d}-contract/tsconfig.json`,
      tsconfig({
        base: '../../tsconfig.base.json',
        composite: true,
        include: ['src'],
      }),
    );
  }

  write(
    'packages/api/src/index.ts',
    `import type { RouterCtx } from '@trpc12/trpc/server';
import { t, type Context } from '@big/base';
${domains.map((d) => `import { d${d}Router, type D${d}Router } from '@big/d${d}';`).join('\n')}

// Named, so declarations refer to each domain's types instead of copying
// them (TS7056 past a few thousand procedures). \`RouterCtx\` is the ctx
// \`t.router()\` adds.
export type AppRouter = {
${domains.map((d) => `  d${d}: D${d}Router;`).join('\n')}
} & RouterCtx<Context>;

export const appRouter: AppRouter = t.router({
${domains.map((d) => `  d${d}: d${d}Router,`).join('\n')}
});
`,
  );
  write(
    'packages/api/tsconfig.json',
    tsconfig({
      base: '../../tsconfig.base.json',
      composite: true,
      include: ['src'],
      references: ['../base', ...domains.map((d) => `../d${d}`)],
    }),
  );
  write(
    'packages/server/src/index.ts',
    `import { createFetchHandler } from '@trpc12/trpc/server';
import { appRouter } from '@big/api';

export const handler = createFetchHandler({
  router: appRouter,
  createContext: () => ({ user: null }),
});
`,
  );
  write(
    'packages/server/tsconfig.json',
    tsconfig({
      base: '../../tsconfig.base.json',
      include: ['src'],
      references: ['../api'],
    }),
  );

  write(
    'whole-server/tsconfig.json',
    tsconfig({
      base: '../tsconfig.base.json',
      include: [
        '../packages/base/src',
        ...domains.map((d) => `../packages/d${d}/src`),
        '../packages/api/src',
        '../packages/server/src',
      ],
    }),
  );

  const calls = (root: string) =>
    used
      .flatMap((d) =>
        Array.from({ length: shape.perDomain }, (_, j) => {
          const path = `${root}.d${d}.f${Math.floor(j / PER_FILE)}.p${j}`;
          return procedure(d, j).call(path);
        }),
      )
      .join('\n');
  const options = (root: string) =>
    used
      .flatMap((d) =>
        Array.from({ length: shape.perDomain }, (_, j) =>
          procedure(d, j).option(
            `${root}.d${d}.f${Math.floor(j / PER_FILE)}.p${j}`,
          ),
        ),
      )
      .join('\n');

  const sliceType = `{ ${used.map((d) => `d${d}: D${d}Router`).join('; ')} }`;
  const sliceImports = used
    .map((d) => `import type { D${d}Router } from '@big/d${d}';`)
    .join('\n');
  const http = `httpLink({ url: 'http://localhost:3000/trpc' })`;

  const client = (app: App): string => {
    switch (app) {
      case 'source':
      case 'dts':
        return `import type { AppRouter } from '@big/api';\nexport const client = createTrpcClient({ router: routerType<AppRouter>(), links: [${http}] });`;
      case 'pick-dts':
        return `import type { AppRouter } from '@big/api';\nexport const client = createTrpcClient({ router: routerType<Pick<AppRouter, ${used.map((d) => `'d${d}'`).join(' | ')}>>(), links: [${http}] });`;
      case 'slice-source':
      case 'slice-dts':
        return `${sliceImports}\nexport const client = createTrpcClient({ router: routerType<${sliceType}>(), links: [${http}] });`;
      case 'contract':
        return `${used.map((d) => `import { d${d}Contract } from '@big/d${d}-contract';`).join('\n')}\nexport const client = createTrpcClient({ router: { ${used.map((d) => `d${d}: d${d}Contract`).join(', ')} }, links: [${http}] });`;
      case 'dts-split':
        return `import type { AppRouter } from '@big/api';\nimport { splitLink } from '@trpc12/trpc/client';\nexport const client = createTrpcClient({ router: routerType<AppRouter>(), links: [splitLink({ condition: (op) => op.path.startsWith('d0.'), true: ${http}, false: ${http} })] });`;
      case 'dts-tanstack':
        return `import type { AppRouter } from '@big/api';\nexport const client = createTrpcClient({ router: routerType<AppRouter>(), links: [${http}] });`;
    }
  };

  for (const app of apps) {
    write(
      `apps/${app}/src/client.ts`,
      `import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';\n${client(app)}\n`,
    );
    write(
      `apps/${app}/src/calls.ts`,
      app === 'dts-tanstack'
        ? `import { createTrpcQueryUtils } from '@trpc12/tanstack-query';\nimport { client } from './client';\n\nconst trpc = createTrpcQueryUtils({ client });\n\n${options('trpc')}\n`
        : `import { client } from './client';\n\n${calls('client')}\n`,
    );
    const references = !usesDts(app)
      ? undefined
      : app.startsWith('slice')
        ? used.map((d) => `../../packages/d${d}`)
        : ['../../packages/api'];
    write(
      `apps/${app}/tsconfig.json`,
      tsconfig({
        base: '../../tsconfig.base.json',
        include: ['src'],
        ...(references ? { references } : {}),
      }),
    );
  }
  return out;
}

const packagesDir = join(import.meta.dirname, '../../packages');

/**
 * Installs a built workspace package into `<dir>/node_modules` as npm would:
 * its `dist/` and its `publishConfig.exports`, so declaration emit names its
 * types through the published entry points.
 */
const install = (dir: string, pkg: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const source = join(packagesDir, pkg);
    const manifest = JSON.parse(
      yield* fs.readFileString(join(source, 'package.json')),
    ) as { name: string; publishConfig: { exports: unknown } };
    const target = join(dir, 'node_modules', manifest.name);
    yield* fs.copy(join(source, 'dist'), join(target, 'dist'));
    yield* fs.writeFileString(
      join(target, 'package.json'),
      JSON.stringify({
        name: manifest.name,
        type: 'module',
        exports: manifest.publishConfig.exports,
      }),
    );
  });

/** Writes `<outRoot>/<domains>x<perDomain>/` and returns its path. */
export const generate = (shape: Shape, outRoot: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* writeFixture(
      join(outRoot, `${shape.domains}x${shape.perDomain}`),
      fixture(shape),
    );
    yield* install(dir, 'trpc');
    yield* install(dir, 'tanstack-query');
    yield* fs.makeDirectory(join(dir, 'node_modules/@tanstack'), {
      recursive: true,
    });
    yield* fs.symlink(
      join(packagesDir, 'tanstack-query/node_modules/@tanstack/query-core'),
      join(dir, 'node_modules/@tanstack/query-core'),
    );
    return dir;
  });
