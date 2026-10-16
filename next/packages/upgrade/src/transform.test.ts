import { NodeServices } from '@effect/platform-node';
import { Effect } from 'effect';
import { Command } from 'effect/cli';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vite-plus/test';
import { upgradeCommand, upgradeFiles, upgradeSource } from './index.ts';

const upgrade = (source: string, filename = 'file.ts') =>
  upgradeSource(source, filename);
const messages = (source: string, filename?: string) =>
  upgrade(source, filename).notes.map(
    (n) => `${n.line}:${n.column} ${n.message}`,
  );

describe('server', () => {
  test('initTRPC chain, TRPCError, mergeRouters, createCaller', () => {
    const { code, changed } =
      upgrade(`import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from './context';

const t = initTRPC.context<Context>().meta<{ auth: boolean }>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const merged = t.mergeRouters(userRouter, postRouter);

export const authed = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return next({ ctx: { user: ctx.user } });
});

const caller = appRouter.createCaller({ user: null });
`);
    expect(changed).toBe(true);
    expect(code).toMatchInlineSnapshot(`
      "import { initTrpc, TrpcError, createRouterClient } from 'trpcdev/server';
      import type { Context } from './context';

      const t = initTrpc<{ ctx: Context; meta: { auth: boolean } }>();

      export const router = t.router;
      export const publicProcedure = t.procedure;
      export const merged = { ...userRouter, ...postRouter };

      export const authed = t.procedure.use(({ ctx, next }) => {
        if (!ctx.user) throw new TrpcError({ code: 'UNAUTHORIZED' });
        return next({ ctx: { user: ctx.user } });
      });

      const caller = createRouterClient(appRouter, { ctx: { user: null } });
      "
    `);
  });

  test('initTRPC without a context; aliases and type imports kept', () => {
    expect(
      upgrade(`import { initTRPC as init, type TRPC_ERROR_CODE_KEY } from '@trpc/server';
const t = init.create();
type Code = TRPC_ERROR_CODE_KEY;
`).code,
    ).toMatchInlineSnapshot(`
      "import { initTrpc as init, type BuiltinErrorCode } from 'trpcdev/server';
      const t = init();
      type Code = BuiltinErrorCode;
      "
    `);
  });

  test('root options become notes', () => {
    expect(
      messages(`import { initTRPC } from '@trpc/server';
import superjson from 'superjson';
const t = initTRPC.create({
  transformer: superjson,
  errorFormatter: ({ shape }) => shape,
  isDev: true,
});
`),
    ).toMatchInlineSnapshot(`
      [
        "4:3 transformer: drop it here; pass the same createSyncSerializer(transformer) to the handler and every link",
        "5:3 errorFormatter: declare errors with .errors() or TrpcError.Tagged; createV11Handler({ errorFormatter }) keeps old clients working",
        "6:3 isDev: use the handler option exposeUnexpectedErrors",
      ]
    `);
  });

  test('fetchRequestHandler', () => {
    const source = `import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from './router';

export default {
  fetch: (req: Request) =>
    fetchRequestHandler({
      endpoint: '/trpc',
      req,
      router: appRouter,
      createContext: () => ({}),
    }),
};
`;
    expect(upgrade(source).code).toMatchInlineSnapshot(`
      "import { createFetchHandler } from 'trpcdev/server';
      import { appRouter } from './router';

      export default {
        fetch: (req: Request) =>
          createFetchHandler({
            endpoint: '/trpc',
            router: appRouter,
            createContext: () => ({}),
          }).fetch(req),
      };
      "
    `);
    expect(messages(source)).toMatchInlineSnapshot(`
      [
        "6:5 createFetchHandler: make the handler once, outside the request function; createContext gets { request, info }",
      ]
    `);
  });

  test('modules without a v12 version are notes', () => {
    expect(
      messages(`import { observable } from '@trpc/server/observable';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { something } from '@trpc/unknown';
`),
    ).toMatchInlineSnapshot(`
      [
        "1:1 observable() subscriptions: return an async generator or an Effect Stream",
        "2:1 adapters: serve createFetchHandler() with serve() from trpcdev/http (docs/platforms.md)",
        "3:1 @trpc/unknown: no v12 module, see docs/migrating-from-v11.md",
      ]
    `);
  });
});

describe('client', () => {
  test('links merge into httpLink; transformer becomes a serializer', () => {
    expect(
      upgrade(`import {
  createTRPCClient,
  httpBatchLink,
  httpSubscriptionLink,
  splitLink,
  TRPCClientError,
} from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from './server';

const transformer = superjson;

export const client = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => op.type === 'subscription',
      true: httpSubscriptionLink({ url: '/trpc', transformer }),
      false: httpBatchLink({ url: '/trpc', transformer: superjson, maxURLLength: 2083 }),
    }),
  ],
});

export const isTrpcError = (e: unknown) => e instanceof TRPCClientError;
`).code,
    ).toMatchInlineSnapshot(`
      "import { createTrpcClient, httpLink, splitLink, TrpcError } from 'trpcdev/client';
      import superjson from 'superjson';
      import type { AppRouter } from './server';
      import { createSyncSerializer } from 'trpcdev/serializer';

      const transformer = superjson;

      export const client = createTrpcClient<AppRouter>({
        links: [
          splitLink({
            condition: (op) => op.type === 'subscription',
            true: httpLink({ url: '/trpc', serializer: createSyncSerializer(transformer) }),
            false: httpLink({ batch: true, url: '/trpc', serializer: createSyncSerializer(superjson), maxUrlLength: 2083 }),
          }),
        ],
      });

      export const isTrpcError = (e: unknown) => e instanceof TrpcError;
      "
    `);
  });

  test('a batch link with options from a variable', () => {
    expect(
      upgrade(`import { httpBatchLink } from '@trpc/client';
const link = httpBatchLink(options);
`).code,
    ).toMatchInlineSnapshot(`
      "import { httpLink } from 'trpcdev/client';
      const link = httpLink({ ...options, batch: true });
      "
    `);
  });
});

describe('tanstack-react-query', () => {
  test('createTRPCContext and its names, across files', () => {
    expect(
      upgrade(
        `import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from './server';

export const { TRPCProvider, useTRPC, useTRPCClient } =
  createTRPCContext<AppRouter>();
`,
        'trpc.ts',
      ).code,
    ).toMatchInlineSnapshot(`
      "import { createTrpcContext } from '@trpcdev/tanstack-react-query';
      import type { AppRouter } from './server';

      export const { TrpcProvider, useTrpc, useTrpcClient } =
        createTrpcContext<AppRouter>();
      "
    `);

    const app = `import { TRPCProvider, useTRPC } from './trpc';

export function App() {
  return (
    <TRPCProvider trpcClient={client} queryClient={queryClient}>
      <Posts />
    </TRPCProvider>
  );
}

function Posts() {
  const trpc = useTRPC();
  return null;
}
`;
    expect(upgrade(app, 'app.tsx').code).toMatchInlineSnapshot(`
      "import { TrpcProvider, useTrpc } from './trpc';

      export function App() {
        return (
          <TrpcProvider client={client} queryClient={queryClient}>
            <Posts />
          </TrpcProvider>
        );
      }

      function Posts() {
        const trpc = useTrpc();
        return null;
      }
      "
    `);
    expect(messages(app, 'app.tsx')).toMatchInlineSnapshot(`
      [
        "5:39 TrpcProvider takes client only; the queryClient goes to QueryClientProvider",
      ]
    `);
  });
});

describe('untouched', () => {
  test('files without tRPC', () => {
    const source = `export const x = 1;\n`;
    expect(upgrade(source)).toEqual({
      code: source,
      changed: false,
      notes: [],
    });
  });

  test('a property named like a v11 export is not renamed', () => {
    expect(
      upgrade(`import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
const o = { initTRPC: 1 };
o.initTRPC;
`).code,
    ).toMatchInlineSnapshot(`
      "import { initTrpc } from 'trpcdev/server';
      const t = initTrpc();
      const o = { initTRPC: 1 };
      o.initTRPC;
      "
    `);
  });

  test('re-exports and prototype names', () => {
    expect(
      upgrade(`export { useTRPC, toString } from './trpc';
export { initTRPC as init } from '@trpc/server';
`).code,
    ).toMatchInlineSnapshot(`
      "export { useTrpc, toString } from './trpc';
      export { initTrpc as init } from 'trpcdev/server';
      "
    `);
  });

  test('a parse error is a note', () => {
    expect(
      messages(`import { initTRPC } from '@trpc/server'; const = ;`),
    ).toHaveLength(1);
  });
});

describe('files and CLI', () => {
  const project = async () => {
    const root = await mkdtemp(join(tmpdir(), 'trpcdev-upgrade-'));
    await mkdir(join(root, 'src'));
    await mkdir(join(root, 'node_modules', 'dep'), { recursive: true });
    await writeFile(
      join(root, 'src', 'trpc.ts'),
      `import { initTRPC } from '@trpc/server';\nexport const t = initTRPC.create();\n`,
    );
    await writeFile(join(root, 'src', 'plain.ts'), `export const x = 1;\n`);
    await writeFile(
      join(root, 'src', 'notes.md'),
      `initTRPC from '@trpc/server'\n`,
    );
    await writeFile(
      join(root, 'node_modules', 'dep', 'index.js'),
      `import { initTRPC } from '@trpc/server';\n`,
    );
    return root;
  };

  test('upgradeFiles walks directories, skipping node_modules', async () => {
    const root = await project();
    const results = await Effect.runPromise(
      upgradeFiles([root], { write: false }).pipe(
        Effect.provide(NodeServices.layer),
      ),
    );
    expect(results.map((r) => [r.path.slice(root.length), r.changed])).toEqual([
      ['/src/plain.ts', false],
      ['/src/trpc.ts', true],
    ]);
    expect(await readFile(join(root, 'src', 'trpc.ts'), 'utf8')).toContain(
      'initTRPC',
    );
  });

  const cli = async (args: string[]) => {
    const lines: string[] = [];
    const log = console.log;
    console.log = (line: string) => lines.push(line);
    try {
      await Effect.runPromise(
        Command.runWith(upgradeCommand, { version: '0.0.0' })(args).pipe(
          Effect.provide(NodeServices.layer),
        ),
      );
    } finally {
      console.log = log;
    }
    return lines;
  };

  test('the CLI is a dry run without --write', async () => {
    const root = await project();
    expect((await cli([root])).at(-1)).toBe(
      '1 file(s) to upgrade, 0 step(s) by hand',
    );
    expect(await readFile(join(root, 'src', 'trpc.ts'), 'utf8')).toContain(
      'initTRPC',
    );
  });

  test('the CLI writes with --write', async () => {
    const root = await project();
    expect((await cli([root, '--write'])).at(-1)).toBe(
      '1 file(s) upgraded, 0 step(s) by hand',
    );
    expect(await readFile(join(root, 'src', 'trpc.ts'), 'utf8')).toBe(
      `import { initTrpc } from 'trpcdev/server';\nexport const t = initTrpc();\n`,
    );
  });
});
