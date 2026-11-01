/**
 * `pnpm --filter @tooling/bench bench [runtime|typecheck|shapes|bundle|budget]`: tRPC v12
 * against tRPC v11 and oRPC v2, the way oRPC's comparison measures them
 * (github.com/middleapi/orpc-benchmarks). Prints Markdown tables.
 *
 * - runtime: each server in its own process, the 6-procedure router with a
 *   pass-through Standard Schema and native types on (progressive JSON, superjson,
 *   oRPC's own), loaded with autocannon on a `GET` query.
 * - typecheck: a generated project of 3,000 procedures in 1,501 routers,
 *   each called through the typed client; `tsc --extendedDiagnostics`.
 * - shapes: v12 alone, one generated router per procedure shape (plain,
 *   `.output()`, `.errors()`, middleware, Effect, contract, `matchError()`);
 *   see `shapes.ts`.
 * - bundle: a minimal client, Node server and fetch handler, bundled with
 *   rolldown (tree-shaken, minified) and gzipped.
 * - budget: the client bundles whose size CI reports (see `budgets`).
 *
 * `--snapshot` on runtime, typecheck and bundle also writes the results to
 * `www/benchmarks.json`, which the docs' benchmarks page charts.
 */
import { gzipSync } from 'node:zlib';
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import autocannon from 'autocannon';
import { Console, Effect, Schedule } from 'effect';
import { Command, Flag } from 'effect/cli';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { rolldown, type OutputChunk } from 'rolldown';
import {
  attempt,
  BenchFailed,
  diagnostics,
  dist,
  environment,
  generated,
  here,
  median,
  requireDist,
  table,
  thousands,
  tscVersion,
  versionOf,
  writeFiles,
  writeSnapshot,
} from './kit.ts';
import { shapes } from './shapes.ts';

const snapshot = Flag.Boolean('snapshot').pipe(Flag.withDefault(false));

/** The published packages v12 is measured against, by `npm` name. */
const versions = Effect.all({
  '@trpc/server': versionOf('@trpc/server'),
  '@orpc/server': versionOf('@orpc/server'),
});

// --- runtime --------------------------------------------------------------

const servers = [
  {
    name: 'tRPC v12',
    file: 'servers/trpc12.ts',
    path: '/trpc/nested.procedure_1?input=%22hello+world%22',
  },
  {
    name: 'tRPC v11',
    file: 'servers/trpc11.ts',
    path: '/nested.procedure_1?input=%7B%22json%22%3A%22hello%20world%22%7D',
  },
  {
    name: 'oRPC v2',
    file: 'servers/orpc.ts',
    path: '/nested/procedure_1?data=%7B%22json%22%3A%22hello+world%22%7D',
  },
] as const;

const cannon = (url: string, seconds: number, connections: number) =>
  attempt('autocannon', () =>
    autocannon({ url, duration: seconds, connections }),
  );

const runtime = Command.make(
  'runtime',
  {
    duration: Flag.Int('duration').pipe(Flag.withDefault(10)),
    connections: Flag.Int('connections').pipe(Flag.withDefault(10)),
    snapshot,
  },
  (opts) =>
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const rows: string[][] = [];
      const results: Array<{
        readonly name: string;
        readonly requestsPerSecond: number;
        readonly stdev: number;
        readonly requests: number;
      }> = [];
      for (const [i, server] of servers.entries()) {
        const port = 3100 + i;
        const url = `http://127.0.0.1:${port}${server.path}`;
        const result = yield* Effect.scoped(
          Effect.gen(function* () {
            yield* spawner.spawn(
              ChildProcess.make(process.execPath, [server.file], {
                cwd: here,
                env: { PORT: String(port), NODE_ENV: 'production' },
                extendEnv: true,
              }),
            );
            const body = yield* attempt('first request', async () => {
              const res = await fetch(url);
              if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
              return res.text();
            }).pipe(
              Effect.retry({
                schedule: Schedule.spaced('100 millis'),
                times: 100,
              }),
            );
            if (!body.includes('nested/procedure_1')) {
              return yield* new BenchFailed({ step: server.name, cause: body });
            }
            yield* cannon(url, 2, opts.connections);
            return yield* cannon(url, opts.duration, opts.connections);
          }),
        );
        if (result.non2xx + result.errors > 0) {
          return yield* new BenchFailed({ step: server.name, cause: result });
        }
        rows.push([
          server.name,
          thousands(result.requests.average),
          thousands(result.requests.stddev),
          thousands(result.requests.total),
        ]);
        results.push({
          name: server.name,
          requestsPerSecond: Math.round(result.requests.average),
          stdev: Math.round(result.requests.stddev),
          requests: result.requests.total,
        });
        yield* Console.error(`done: ${server.name}`);
      }
      yield* Console.log(
        `${opts.duration}s, ${opts.connections} connections, Node ${process.version}\n\n` +
          table(['server', 'req/s (avg)', 'req/s (stdev)', 'requests'], rows),
      );
      if (opts.snapshot) {
        yield* writeSnapshot('runtime', {
          ...(yield* environment),
          versions: yield* versions,
          duration: opts.duration,
          connections: opts.connections,
          results,
        });
      }
    }),
);

// --- typecheck ------------------------------------------------------------

type Framework = 'trpc12' | 'trpc11' | 'orpc';

const byFramework = <A>(fw: Framework, cases: Record<Framework, () => A>): A =>
  cases[fw]();
const names: Record<Framework, string> = {
  trpc12: 'tRPC v12',
  trpc11: 'tRPC v11',
  orpc: 'oRPC v2',
};

const P1 = (call: string) =>
  `.input({} as Schema<{ who: string }, { who: string }>).${call}(({ input }) => \`hello \${input.who}\`)`;
const P2 = (call: string) =>
  `.input({} as Schema<{ id: string }, { id: string }>).${call}(({ input }) => ({ id: input.id }))`;

const fixture = (fw: Framework, routers: number): Array<[string, string]> => {
  const files: Array<[string, string]> = [];
  const nest = (p1: string, p2: string, wrap: (body: string) => string) =>
    wrap(`
  procedure_1: ${p1},
  procedure_2: ${p2},
  nested: ${wrap(`
    procedure_1: ${p1},
    procedure_2: ${p2},
    nested: ${wrap(`
      procedure_1: ${p1},
      procedure_2: ${p2},
    `)},
  `)},
`);
  const ids = Array.from({ length: routers }, (_, i) => `router_${i}`);
  const calls =
    fw === 'orpc'
      ? (id: string, p: string) => `client.${id}.${p}`
      : (id: string, p: string, kind: 'query' | 'mutate') =>
          `client.${id}.${p}.${kind}`;
  for (const id of ids) {
    const body = byFramework(fw, {
      trpc12: () =>
        `t.router(${nest(
          `procedure${P1('query')}`,
          `procedure${P2('mutation')}`,
          (b) => `{${b}}`,
        )})`,
      trpc11: () =>
        nest(
          `procedure${P1('query')}`,
          `procedure${P2('mutation')}`,
          (b) => `router({${b}})`,
        ),
      orpc: () =>
        nest(`base${P1('handler')}`, `base${P2('handler')}`, (b) => `{${b}}`),
    });
    const imports = byFramework(fw, {
      trpc12: () => `import { procedure, t, type Schema } from '../base';`,
      trpc11: () => `import { procedure, router, type Schema } from '../base';`,
      orpc: () => `import { base, type Schema } from '../base';`,
    });
    files.push([
      `router/${id}.ts`,
      `${imports}\n\nexport const ${id} = ${body};\n`,
    ]);
    const lines = (
      [
        'procedure_1',
        'nested.procedure_1',
        'nested.nested.procedure_1',
      ] as const
    )
      .map(
        (p, i) =>
          `const q${i}: string = await ${calls(id, p, 'query')}({ who: 'world' });\n` +
          `const m${i}: { id: string } = await ${calls(id, p.replace('procedure_1', 'procedure_2'), 'mutate')}({ id: '123' });`,
      )
      .join('\n');
    files.push([
      `consume/${id}.ts`,
      `import { client } from '../client';\n\n${lines}\n`,
    ]);
  }
  const index = `${ids.map((id) => `import { ${id} } from './${id}';`).join('\n')}\n\n`;
  const entries = ids.join(',\n  ');
  files.push([
    'router/index.ts',
    byFramework(fw, {
      trpc12: () =>
        `import { t } from '../base';\n${index}export const router = t.router({\n  ${entries},\n});\n`,
      trpc11: () =>
        `import { router as make } from '../base';\n${index}export const router = make({\n  ${entries},\n});\n`,
      orpc: () => `${index}export const router = {\n  ${entries},\n};\n`,
    }),
  ]);
  const schema = `export type { StandardSchemaV1 as Schema } from '@standard-schema/spec';\n`;
  files.push([
    'base.ts',
    byFramework(fw, {
      trpc12: () =>
        `import { initTrpc } from '@trpc12/trpc/server';\n\nexport const t = initTrpc();\nexport const procedure = t.procedure;\n${schema}`,
      trpc11: () =>
        `import { initTRPC } from '@trpc/server';\n\nconst t = initTRPC.create();\nexport const router = t.router;\nexport const procedure = t.procedure;\n${schema}`,
      orpc: () => `export { os as base, type Schema } from '@orpc/server';\n`,
    }),
  ]);
  files.push([
    'client.ts',
    byFramework(fw, {
      trpc12: () =>
        `import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';\nimport type { router } from './router';\n\nexport const client = createTrpcClient({\n  router: routerType<typeof router>(),\n  links: [httpLink({ url: 'http://localhost:3000/trpc' })],\n});\n`,
      trpc11: () =>
        `import { createTRPCClient, httpBatchLink } from '@trpc/client';\nimport type { router } from './router';\n\nexport const client = createTRPCClient<typeof router>({\n  links: [httpBatchLink({ url: 'http://localhost:3000/trpc' })],\n});\n`,
      orpc: () =>
        `import { createORPCClient } from '@orpc/client';\nimport { RPCLink } from '@orpc/client/fetch';\nimport type { RouterClient } from '@orpc/server';\nimport type { router } from './router';\n\nexport const client: RouterClient<typeof router> = createORPCClient(new RPCLink({}));\n`,
    }),
  ]);
  files.push([
    'tsconfig.json',
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
          noEmit: true,
          incremental: false,
          ...(fw === 'trpc12'
            ? { paths: { '@trpc12/trpc/*': [`${dist}/*/index.d.ts`] } }
            : {}),
        },
        include: ['.'],
      },
      null,
      2,
    ),
  ]);
  return files;
};

const typecheck = Command.make(
  'typecheck',
  {
    routers: Flag.Int('routers').pipe(Flag.withDefault(500)),
    runs: Flag.Int('runs').pipe(Flag.withDefault(3)),
    snapshot,
  },
  (opts) =>
    Effect.gen(function* () {
      yield* requireDist;
      const rows: string[][] = [];
      const results: Array<{
        readonly name: string;
        readonly checkSeconds: number;
        readonly totalSeconds: number;
        readonly memoryMb: number;
        readonly instantiations: number;
      }> = [];
      for (const fw of ['trpc12', 'trpc11', 'orpc'] as const) {
        const dir = `${generated}/typecheck-${fw}`;
        yield* writeFiles(dir, fixture(fw, opts.routers));
        const samples = yield* Effect.replicateEffect(
          diagnostics(dir),
          opts.runs,
        );
        const m = (name: string) => median(samples.map((s) => s[name] ?? NaN));
        rows.push([
          names[fw],
          `${m('Check time').toFixed(2)}s`,
          `${m('Total time').toFixed(2)}s`,
          `${Math.round(m('Memory used') / 1024)} MB`,
          thousands(m('Instantiations')),
        ]);
        results.push({
          name: names[fw],
          checkSeconds: m('Check time'),
          totalSeconds: m('Total time'),
          memoryMb: Math.round(m('Memory used') / 1024),
          instantiations: m('Instantiations'),
        });
        yield* Console.error(`done: ${fw}`);
      }
      const typescript = yield* tscVersion;
      yield* Console.log(
        `${opts.routers * 6} procedures in ${opts.routers * 3 + 1} routers, single-threaded tsc ${typescript}, median of ${opts.runs}\n\n` +
          table(['', 'check', 'total', 'memory', 'instantiations'], rows),
      );
      if (opts.snapshot) {
        yield* writeSnapshot('typecheck', {
          ...(yield* environment),
          versions: { ...(yield* versions), typescript },
          procedures: opts.routers * 6,
          routers: opts.routers * 3 + 1,
          runs: opts.runs,
          results,
        });
      }
    }),
);

// --- bundle ---------------------------------------------------------------

const bundles: Record<
  Framework,
  Record<'client' | 'node' | 'fetch', string>
> = {
  trpc12: {
    client: `import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { experimental_createProgressiveJson } from '@trpc12/trpc/transformer';
export const client = createTrpcClient({ router: routerType<any>(), links: [httpLink({ url: '/trpc', transformer: experimental_createProgressiveJson() })] });`,
    node: `import { createServer } from 'node:http';
import { NodeHttpServer } from '@effect/platform-node';
import { Layer } from 'effect';
import { serve } from '@trpc12/trpc/http';
import { experimental_createProgressiveJson } from '@trpc12/trpc/transformer';
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
const t = initTrpc();
const handler = createFetchHandler({ router: t.router({ hello: t.procedure.query(() => 'hi') }), transformer: experimental_createProgressiveJson() });
export const app = serve(handler).pipe(Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 })));`,
    fetch: `import { experimental_createProgressiveJson } from '@trpc12/trpc/transformer';
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
const t = initTrpc();
export const handler = createFetchHandler({ router: t.router({ hello: t.procedure.query(() => 'hi') }), transformer: experimental_createProgressiveJson() });`,
  },
  trpc11: {
    client: `import { createTRPCClient, httpLink, httpSubscriptionLink, splitLink } from '@trpc/client';
import SuperJSON from 'superjson';
export const client = createTRPCClient<any>({ links: [splitLink({ condition: (op) => op.type === 'subscription', true: httpSubscriptionLink({ url: '/trpc', transformer: SuperJSON }), false: httpLink({ url: '/trpc', transformer: SuperJSON }) })] });`,
    node: `import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import SuperJSON from 'superjson';
const t = initTRPC.create({ transformer: SuperJSON });
export const server = createHTTPServer({ router: t.router({ hello: t.procedure.query(() => 'hi') }) });`,
    fetch: `import { initTRPC } from '@trpc/server';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import SuperJSON from 'superjson';
const t = initTRPC.create({ transformer: SuperJSON });
const router = t.router({ hello: t.procedure.query(() => 'hi') });
export const handler = (req: Request) => fetchRequestHandler({ endpoint: '/trpc', req, router });`,
  },
  orpc: {
    client: `import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
export const client = createORPCClient(new RPCLink({}));`,
    node: `import { createServer } from 'node:http';
import { os } from '@orpc/server';
import { RPCHandler } from '@orpc/server/node';
const handler = new RPCHandler({ hello: os.handler(() => 'hi') });
export const server = createServer((req, res) => handler.handle(req, res));`,
    fetch: `import { os } from '@orpc/server';
import { RPCHandler } from '@orpc/server/fetch';
const handler = new RPCHandler({ hello: os.handler(() => 'hi') });
export const fetch = (req: Request) => handler.handle(req);`,
  },
};

const bundle = (input: string, platform: 'browser' | 'node') =>
  attempt(`bundle ${input}`, async () => {
    const build = await rolldown({
      input,
      platform,
      treeshake: true,
      logLevel: 'silent',
      transform: { define: { 'process.env.NODE_ENV': '"production"' } },
    });
    try {
      const result = await build.generate({ format: 'esm', minify: true });
      const code = result.output
        .filter((o): o is OutputChunk => o.type === 'chunk')
        .map((c) => c.code)
        .join('');
      return {
        minified: code.length,
        gzip: gzipSync(code, { level: 9 }).length,
      };
    } finally {
      await build.close();
    }
  });

const kb = (n: number) => `${(n / 1000).toFixed(1)} kB`;

const bundleOf = (fw: Framework, kind: 'client' | 'node' | 'fetch') =>
  Effect.gen(function* () {
    const dir = `${generated}/bundle-${fw}`;
    yield* writeFiles(dir, [[`${kind}.ts`, `${bundles[fw][kind]}\n`]]);
    return yield* bundle(
      `${dir}/${kind}.ts`,
      kind === 'node' ? 'node' : 'browser',
    );
  });

const bundleSizes = Command.make('bundle', { snapshot }, (opts) =>
  Effect.gen(function* () {
    const results = yield* Effect.forEach(
      ['trpc12', 'trpc11', 'orpc'] as const,
      (fw) =>
        Effect.all({
          name: Effect.succeed(names[fw]),
          client: bundleOf(fw, 'client'),
          node: bundleOf(fw, 'node'),
          fetch: bundleOf(fw, 'fetch'),
        }),
    );
    const rows = (['client', 'node', 'fetch'] as const).map((kind) => [
      { client: 'client', node: 'Node server', fetch: 'fetch handler' }[kind],
      ...results.map(
        (result) => `${kb(result[kind].minified)} / ${kb(result[kind].gzip)}`,
      ),
    ]);
    yield* Console.log(
      'minified / gzip -9, rolldown tree-shaken; native types on (progressive JSON, superjson, oRPC built-in)\n\n' +
        table(['', 'tRPC v12', 'tRPC v11', 'oRPC v2'], rows),
    );
    if (opts.snapshot) {
      yield* writeSnapshot('bundle', {
        ...(yield* environment),
        versions: {
          ...(yield* versions),
          rolldown: yield* versionOf('rolldown'),
        },
        results,
      });
    }
  }),
);

// --- budget ---------------------------------------------------------------

/**
 * Client bundles whose gzip size is tracked, not enforced (decision
 * orpc-v2-parity). `target` is the human's aim, shown next to the size.
 * Only code these entries pull in counts: opt-in links and utilities
 * (`dedupeLink`, `wsLink`, …) have to shake out of them, not be small.
 */
const budgets = [
  {
    name: 'minimal JSON client',
    target: 18_000,
    code: `import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
export const client = createTrpcClient({ router: routerType<any>(), links: [httpLink({ url: '/trpc' })] });`,
  },
  {
    name: 'full client (retry, SSE)',
    target: 25_000,
    code: `import { createTrpcClient, httpLink, retryLink, routerType } from '@trpc12/trpc/client';
export const client = createTrpcClient({ router: routerType<any>(), links: [retryLink(), httpLink({ url: '/trpc' })] });`,
  },
  {
    name: 'full client (retry, SSE, progressive JSON)',
    target: 25_000,
    code: `import { createTrpcClient, httpLink, retryLink, routerType } from '@trpc12/trpc/client';
import { experimental_createProgressiveJson } from '@trpc12/trpc/transformer';
export const client = createTrpcClient({ router: routerType<any>(), links: [retryLink(), httpLink({ url: '/trpc', transformer: experimental_createProgressiveJson() })] });`,
  },
] as const;

const budget = Command.make('budget', {}, () =>
  Effect.gen(function* () {
    const rows: string[][] = [];
    for (const [i, entry] of budgets.entries()) {
      const dir = `${generated}/budget-${i}`;
      yield* writeFiles(dir, [['client.ts', `${entry.code}\n`]]);
      const size = yield* bundle(`${dir}/client.ts`, 'browser');
      rows.push([
        entry.name,
        kb(size.gzip),
        kb(entry.target),
        size.gzip <= entry.target
          ? 'met'
          : `${kb(size.gzip - entry.target)} over`,
      ]);
    }
    yield* Console.log(
      'gzip -9, rolldown tree-shaken and minified; reported, not enforced\n\n' +
        table(['', 'gzip', 'target', 'to target'], rows),
    );
  }),
);

const bench = Command.make('bench').pipe(
  Command.withSubcommands([runtime, typecheck, shapes, bundleSizes, budget]),
);

Command.run(bench, { version: '0.0.0' }).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
);
