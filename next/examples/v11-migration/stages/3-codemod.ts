/**
 * Stage 3: `trpc12-upgrade` on a copy of the v11 app. A dry run lists the
 * rewrites and the steps left by hand as `file:line:column`; `--write`
 * rewrites what has one v12 form. A path that isn't there is one line on
 * stderr and exit code 1.
 */
import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The `trpc12-upgrade` bin's source: Node runs the workspace's TypeScript, so it needs no build. */
const bin = fileURLToPath(
  new URL('bin.ts', import.meta.resolve('@trpc12/upgrade')),
);
const files = [
  'client/app.tsx',
  'client/client.ts',
  'client/links.ts',
  'client/queries.ts',
  'server/context.ts',
  'server/index.ts',
  'server/router.ts',
  'server/trpc.ts',
];

/** What the codemod leaves to you, in the order it prints it. */
const steps = [
  'app/client/app.tsx:20:47 TrpcProvider takes client only; the queryClient goes to QueryClientProvider',
  'app/client/app.tsx:31:49 queryOptions(input, opts) is queryOptions({ input, ...opts }) in v12',
  'app/client/client.ts:27:11 createSyncTransformer<…>(transformer): list the types it rebuilds, https://v12.trpc.io/v12/docs/server/transformers',
  'app/client/client.ts:28:11 EventSource: httpLink streams SSE over fetch; use headers or init',
  'app/client/client.ts:32:11 createSyncTransformer<…>(transformer): list the types it rebuilds, https://v12.trpc.io/v12/docs/server/transformers',
  'app/client/client.ts:42:20 createWSClient: pass its options to wsLink({ url })',
  'app/client/client.ts:47:22 wsLink({ url, connectionParams }) replaces createWSClient + wsLink({ client })',
  'app/client/client.ts:47:40 createSyncTransformer<…>(transformer): list the types it rebuilds, https://v12.trpc.io/v12/docs/server/transformers',
  'app/client/links.ts:1:15 TRPCLink: stays on @trpc/client; keep the link with fromV11Link(link) from @trpc12/trpc/interop, or rewrite it with link() as an Effect Stream function',
  'app/client/links.ts:2:1 observable(): subscriptions return an async generator or an Effect Stream; a v11 link keeps it under fromV11Link',
  'app/client/queries.ts:9:16 createTrpcQueryUtils({ client }): the queryClient goes to QueryClientProvider',
  "app/server/context.ts:1:15 CreateContextOpts: opts.req is opts.request, whose headers are a record (request.headers['authorization']); response headers go on the procedure's response handle, https://v12.trpc.io/v12/docs/server/responses",
  'app/server/index.ts:7:12 createFetchHandler: make the handler once, outside the request function; createContext gets { request, info }; old clients: createV11Handler on this endpoint, createFetchHandler on another (https://v12.trpc.io/v12/docs/migrations/from-v11/serve-v11-clients)',
  'app/server/router.ts:27:27 lastEventId: v12 passes it to the resolver as opts.lastEventId; v12 clients send subscribe(input, { lastEventId })',
  'app/server/router.ts:28:37 lastEventId: v12 passes it to the resolver as opts.lastEventId; v12 clients send subscribe(input, { lastEventId })',
  'app/server/trpc.ts:7:3 transformer: drop it here; pass the same createSyncTransformer(transformer) to the handler and every link',
  'app/server/trpc.ts:8:3 errorFormatter: declare errors with .errors() or TrpcError.Tagged; createV11Handler({ errorFormatter }) keeps old clients working',
];

export function run() {
  const dir = mkdtempSync(join(tmpdir(), 'v11-migration-'));
  try {
    cpSync(join(import.meta.dirname, '../v11'), join(dir, 'app'), {
      recursive: true,
    });
    const upgrade = (...args: string[]) =>
      execFileSync(process.execPath, [bin, 'app', ...args], {
        cwd: dir,
        encoding: 'utf8',
      })
        .trimEnd()
        .split('\n');
    const read = (file: string) => readFileSync(join(dir, 'app', file), 'utf8');
    const before = new Map(files.map((file) => [file, read(file)]));

    // The dry run: every file but the link would change; nothing is written.
    const dry = upgrade();
    deepStrictEqual(
      dry.filter((line) => line.startsWith('would upgrade ')),
      files
        .filter((file) => file !== 'client/links.ts')
        .map((file) => `would upgrade app/${file}`),
    );
    deepStrictEqual(
      dry.filter((line) => /^app\/\S+:\d+:\d+ /.test(line)),
      steps,
    );
    strictEqual(dry.at(-1), '7 file(s) to upgrade, 17 step(s) by hand');
    for (const file of files) strictEqual(read(file), before.get(file));

    strictEqual(
      upgrade('--write').at(-1),
      '7 file(s) upgraded, 17 step(s) by hand',
    );

    const server = read('server/trpc.ts');
    ok(
      server.includes(
        "import { initTrpc, TrpcError } from '@trpc12/trpc/server';",
      ),
    );
    ok(server.includes('const t = initTrpc<{ ctx: Context }>({'));
    ok(server.includes('throw new TrpcError({'));
    ok(read('server/router.ts').includes("from '@trpc12/trpc/server';"));
    ok(
      read('server/context.ts').includes(
        'export function createContext(opts: CreateContextOpts) {',
      ),
    );
    const index = read('server/index.ts');
    ok(index.includes('return createFetchHandler({'));
    ok(index.includes('}).fetch(req);'));
    ok(!index.includes('      req,'));

    const client = read('client/client.ts');
    ok(client.includes("from '@trpc12/trpc/client';"));
    ok(client.includes('router: routerType<AppRouter>(),'));
    ok(client.includes('batch: true,'));
    ok(
      !client.includes('httpBatchLink') &&
        !client.includes('httpSubscriptionLink'),
    );
    ok(client.includes('transformer: createSyncTransformer(superjson)'));
    ok(read('client/links.ts') === before.get('client/links.ts'));

    const app = read('client/app.tsx');
    ok(
      app.includes(
        'export const [TrpcProvider, useTrpc] = createTrpcContext<AppRouter>();',
      ),
    );
    ok(app.includes('<TrpcProvider client={props.client}'));
    ok(app.includes('client: TrpcClient<AppRouter>;'));
    ok(app.includes('const trpc = useTrpc();'));
    ok(
      read('client/queries.ts').includes(
        'createTrpcQueryUtils({ client, queryClient })',
      ),
    );

    // Again: nothing left to rewrite; the steps left are the link stage 2 keeps.
    const again = upgrade();
    deepStrictEqual(
      again.slice(0, -1),
      steps.filter((step) => step.startsWith('app/client/links.ts:')),
    );
    strictEqual(again.at(-1), '0 file(s) to upgrade, 2 step(s) by hand');

    const missing = spawnSync(process.execPath, [bin, 'nope'], {
      cwd: dir,
      encoding: 'utf8',
    });
    strictEqual(missing.status, 1);
    strictEqual(
      missing.stderr,
      'trpc12-upgrade: no such file or directory: nope\n',
    );

    console.log('stage 3: trpc12-upgrade on the v11 snapshot:', {
      upgraded: files.length - 1,
      steps: steps.length,
      left: again.length - 1,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
