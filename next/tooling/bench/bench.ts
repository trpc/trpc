/**
 * `pnpm --filter @tooling/bench bench [runtime|typecheck|bundle|budget]`: tRPC v12
 * against tRPC v11 and oRPC v2, the way oRPC's comparison measures them
 * (github.com/middleapi/orpc-benchmarks). Prints Markdown tables.
 *
 * - runtime: each server in its own process, the 6-procedure router with a
 *   pass-through Standard Schema and native types on (danSON, superjson,
 *   oRPC's own), loaded with autocannon on a `GET` query.
 * - typecheck: a generated project of 3,000 procedures in 1,501 routers,
 *   each called through the typed client; `tsc --extendedDiagnostics`.
 * - bundle: a minimal client, Node server and fetch handler, bundled with
 *   rolldown (tree-shaken, minified) and gzipped.
 * - budget: the client bundles CI holds to a size (see `budgets`).
 */
import { gzipSync } from 'node:zlib';
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import autocannon from 'autocannon';
import {
  Console,
  Data,
  Effect,
  FileSystem,
  Path,
  Schedule,
  Stream,
} from 'effect';
import { Command, Flag } from 'effect/cli';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { rolldown, type OutputChunk } from 'rolldown';

const here = import.meta.dirname;
const generated = `${here}/.generated`;

class BenchFailed extends Data.TaggedError('BenchFailed')<{
  readonly step: string;
  readonly cause: unknown;
}> {}

const attempt = <A>(step: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => new BenchFailed({ step, cause }),
  });

const median = (xs: ReadonlyArray<number>): number =>
  [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

const table = (
  head: ReadonlyArray<string>,
  rows: ReadonlyArray<ReadonlyArray<string>>,
) =>
  [
    `| ${head.join(' | ')} |`,
    `| ${head.map((_, i) => (i === 0 ? '---' : '---:')).join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');

const thousands = (n: number) => Math.round(n).toLocaleString('en-US');

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
  },
  (opts) =>
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const rows: string[][] = [];
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
        yield* Console.error(`done: ${server.name}`);
      }
      yield* Console.log(
        `${opts.duration}s, ${opts.connections} connections, Node ${process.version}\n\n` +
          table(['server', 'req/s (avg)', 'req/s (stdev)', 'requests'], rows),
      );
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
        nest(
          `procedure${P1('query')}`,
          `procedure${P2('mutation')}`,
          (b) => `{${b}}`,
        ),
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
      trpc12: () => `import { procedure, type Schema } from '../base';`,
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
    fw === 'trpc11'
      ? `import { router as make } from '../base';\n${index}export const router = make({\n  ${entries},\n});\n`
      : `${index}export const router = {\n  ${entries},\n};\n`,
  ]);
  const schema = `export type { StandardSchemaV1 as Schema } from '@standard-schema/spec';\n`;
  files.push([
    'base.ts',
    byFramework(fw, {
      trpc12: () =>
        `import { initTrpc } from '@trpc12/trpc/server';\n\nexport const procedure = initTrpc().procedure;\n${schema}`,
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

const writeFiles = (
  dir: string,
  files: ReadonlyArray<readonly [string, string]>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.remove(dir, { recursive: true, force: true });
    for (const [file, contents] of files) {
      const target = path.join(dir, file);
      yield* fs.makeDirectory(path.dirname(target), { recursive: true });
      yield* fs.writeFileString(target, contents);
    }
  });

const tsc = `${here}/node_modules/.bin/tsc`;
// v11 and oRPC are checked from their published `.d.ts` (with `skipLibCheck`), so v12 is too.
const dist = `${here}/../../packages/trpc/dist`;

const diagnostics = (dir: string) =>
  Effect.scoped(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const handle = yield* spawner.spawn(
        ChildProcess.make(tsc, [
          '-p',
          dir,
          '--extendedDiagnostics',
          '--singleThreaded',
        ]),
      );
      const [output, exitCode] = yield* Effect.all(
        [Stream.mkString(Stream.decodeText(handle.stdout)), handle.exitCode],
        { concurrency: 2 },
      );
      if (exitCode !== 0) {
        return yield* new BenchFailed({
          step: `tsc ${dir}`,
          cause: output.slice(0, 4000),
        });
      }
      const numbers: Record<string, number> = {};
      for (const line of output.split('\n')) {
        const m = /^([A-Za-z ]+):\s+([\d.]+)/.exec(line.trim());
        if (m) numbers[m[1]!.trim()] = Number(m[2]);
      }
      return numbers;
    }),
  );

const typecheck = Command.make(
  'typecheck',
  {
    routers: Flag.Int('routers').pipe(Flag.withDefault(500)),
    runs: Flag.Int('runs').pipe(Flag.withDefault(3)),
  },
  (opts) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      if (!(yield* fs.exists(`${dist}/server/index.d.ts`))) {
        return yield* new BenchFailed({
          step: 'typecheck',
          cause: 'run `pnpm build` first',
        });
      }
      const rows: string[][] = [];
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
        yield* Console.error(`done: ${fw}`);
      }
      yield* Console.log(
        `${opts.routers * 6} procedures in ${opts.routers * 3 + 1} routers, single-threaded tsc, median of ${opts.runs}\n\n` +
          table(['', 'check', 'total', 'memory', 'instantiations'], rows),
      );
    }),
);

// --- bundle ---------------------------------------------------------------

const bundles: Record<
  Framework,
  Record<'client' | 'node' | 'fetch', string>
> = {
  trpc12: {
    client: `import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { createSerializer } from '@trpc12/trpc/serializer';
export const client = createTrpcClient({ router: routerType<any>(), links: [httpLink({ url: '/trpc', serializer: createSerializer() })] });`,
    node: `import { createServer } from 'node:http';
import { NodeHttpServer } from '@effect/platform-node';
import { Layer } from 'effect';
import { serve } from '@trpc12/trpc/http';
import { createSerializer } from '@trpc12/trpc/serializer';
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
const t = initTrpc();
const handler = createFetchHandler({ router: { hello: t.procedure.query(() => 'hi') }, serializer: createSerializer() });
export const app = serve(handler).pipe(Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 })));`,
    fetch: `import { createSerializer } from '@trpc12/trpc/serializer';
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
const t = initTrpc();
export const handler = createFetchHandler({ router: { hello: t.procedure.query(() => 'hi') }, serializer: createSerializer() });`,
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

const bundleSizes = Command.make('bundle', {}, () =>
  Effect.gen(function* () {
    const rows: string[][] = [];
    for (const kind of ['client', 'node', 'fetch'] as const) {
      const row = [
        { client: 'client', node: 'Node server', fetch: 'fetch handler' }[kind],
      ];
      for (const fw of ['trpc12', 'trpc11', 'orpc'] as const) {
        const dir = `${generated}/bundle-${fw}`;
        yield* writeFiles(dir, [[`${kind}.ts`, `${bundles[fw][kind]}\n`]]);
        const size = yield* bundle(
          `${dir}/${kind}.ts`,
          kind === 'node' ? 'node' : 'browser',
        );
        row.push(`${kb(size.minified)} / ${kb(size.gzip)}`);
      }
      rows.push(row);
    }
    yield* Console.log(
      'minified / gzip -9, rolldown tree-shaken; native types on (danSON, superjson, oRPC built-in)\n\n' +
        table(['', 'tRPC v12', 'tRPC v11', 'oRPC v2'], rows),
    );
  }),
);

// --- budget ---------------------------------------------------------------

/**
 * Client bundles held to a gzip budget (decision orpc-v2-parity). `target`
 * is the human's budget; `ceiling` is today's size, which CI enforces so the
 * gap only shrinks. Lower a ceiling with each cut, down to the target.
 */
const budgets = [
  {
    name: 'minimal JSON client',
    target: 18_000,
    ceiling: 25_800,
    code: `import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
export const client = createTrpcClient({ router: routerType<any>(), links: [httpLink({ url: '/trpc' })] });`,
  },
  {
    name: 'full client (retry, SSE, danSON)',
    target: 25_000,
    ceiling: 29_200,
    code: `import { createTrpcClient, httpLink, retryLink, routerType } from '@trpc12/trpc/client';
import { createSerializer } from '@trpc12/trpc/serializer';
export const client = createTrpcClient({ router: routerType<any>(), links: [retryLink(), httpLink({ url: '/trpc', serializer: createSerializer() })] });`,
  },
] as const;

const budget = Command.make('budget', {}, () =>
  Effect.gen(function* () {
    const rows: string[][] = [];
    const over: string[] = [];
    for (const [i, entry] of budgets.entries()) {
      const dir = `${generated}/budget-${i}`;
      yield* writeFiles(dir, [['client.ts', `${entry.code}\n`]]);
      const size = yield* bundle(`${dir}/client.ts`, 'browser');
      if (size.gzip > entry.ceiling) over.push(entry.name);
      rows.push([
        entry.name,
        kb(size.gzip),
        kb(entry.ceiling),
        kb(entry.target),
        size.gzip <= entry.target
          ? 'met'
          : `${kb(size.gzip - entry.target)} over`,
      ]);
    }
    yield* Console.log(
      'gzip -9, rolldown tree-shaken and minified; CI fails above the ceiling\n\n' +
        table(['', 'gzip', 'ceiling', 'target', 'to target'], rows),
    );
    if (over.length > 0) {
      return yield* new BenchFailed({
        step: 'budget',
        cause: `above the ceiling: ${over.join(', ')}`,
      });
    }
  }),
);

const bench = Command.make('bench').pipe(
  Command.withSubcommands([runtime, typecheck, bundleSizes, budget]),
);

Command.run(bench, { version: '0.0.0' }).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
);
