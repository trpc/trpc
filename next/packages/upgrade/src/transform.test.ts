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
    const result = upgrade(`import { initTRPC, TRPCError } from '@trpc/server';
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
    expect(result.changed).toBe(true);
    expect(result.code).toMatchInlineSnapshot(`
      "import { initTrpc, TrpcError, createRouterClient } from '@trpc12/trpc/server';
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
      "import { initTrpc as init, type BuiltinErrorCode } from '@trpc12/trpc/server';
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
      "import { createFetchHandler } from '@trpc12/trpc/server';
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
        "2:1 adapters: serve createFetchHandler() with serve() from @trpc12/trpc/http (docs/platforms.md)",
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
      "import { createTrpcClient, httpLink, splitLink, TrpcError, routerType } from '@trpc12/trpc/client';
      import superjson from 'superjson';
      import type { AppRouter } from './server';
      import { createSyncSerializer } from '@trpc12/trpc/serializer';

      const transformer = superjson;

      export const client = createTrpcClient({
        router: routerType<AppRouter>(),
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

  test('custom v11 links are reported', () => {
    expect(
      messages(`import type { TRPCLink } from '@trpc/client';
export const authLink: TRPCLink<AppRouter> = () => ({ op, next }) => next(op);
`),
    ).toMatchInlineSnapshot(`
      [
        "1:15 TRPCLink: keep the link with fromV11Link(link) from @trpc12/trpc/interop, or rewrite it with link() as an Effect Stream function",
      ]
    `);
  });

  test('a client with options from a variable', () => {
    expect(
      upgrade(`import { createTRPCProxyClient } from '@trpc/client';
const client = createTRPCProxyClient<AppRouter>(options);
`).code,
    ).toMatchInlineSnapshot(`
      "import { createTrpcClient, routerType } from '@trpc12/trpc/client';
      const client = createTrpcClient({ router: routerType<AppRouter>(), ...options });
      "
    `);
  });

  test('a batch link with options from a variable', () => {
    expect(
      upgrade(`import { httpBatchLink } from '@trpc/client';
const link = httpBatchLink(options);
`).code,
    ).toMatchInlineSnapshot(`
      "import { httpLink } from '@trpc12/trpc/client';
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
      "import { createTrpcContext } from '@trpc12/tanstack-react-query';
      import type { AppRouter } from './server';

      export const [TrpcProvider, useTrpc, useTrpcClient] =
        createTrpcContext<AppRouter>();
      "
    `);
    expect(
      upgrade(
        `import { createTRPCContext } from '@trpc/tanstack-react-query';
export const { useTRPC: useApi, TRPCProvider } = createTRPCContext<AppRouter>();
`,
        'trpc.ts',
      ).code,
    ).toMatchInlineSnapshot(`
      "import { createTrpcContext } from '@trpc12/tanstack-react-query';
      export const [TrpcProvider, useApi] = createTrpcContext<AppRouter>();
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

describe('promoted experimental_ names', () => {
  test('imports and re-exports of a promoted name are rewritten', () => {
    expect(
      upgradeSource(
        `import { experimental_durableLink, httpLink } from '@trpc12/trpc/client';
import { experimental_durableLink as retry } from '@trpc12/trpc/client';
export { experimental_durableLink } from '@trpc12/trpc/client';
const links = [experimental_durableLink(), retry(), httpLink({ url })];
`,
        'file.ts',
        { promoted: { experimental_durableLink: 'durableLink' } },
      ).code,
    ).toMatchInlineSnapshot(`
      "import { durableLink, httpLink } from '@trpc12/trpc/client';
      import { durableLink as retry } from '@trpc12/trpc/client';
      export { durableLink as experimental_durableLink } from '@trpc12/trpc/client';
      const links = [durableLink(), retry(), httpLink({ url })];
      "
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
      "import { initTrpc } from '@trpc12/trpc/server';
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
      export { initTrpc as init } from '@trpc12/trpc/server';
      "
    `);
  });

  test('a parse error is a note', () => {
    expect(
      messages(`import { initTRPC } from '@trpc/server'; const = ;`),
    ).toHaveLength(1);
  });
});

describe('edges', () => {
  test('namespace imports keep their shape and get a note', () => {
    const source = `import * as server from '@trpc/server';
import { 'initTRPC' as init } from '@trpc/server';
const t = init.create();
`;
    expect(upgrade(source).code).toMatchInlineSnapshot(`
      "import * as server from '@trpc12/trpc/server';
      import { initTrpc as init } from '@trpc12/trpc/server';
      const t = init();
      "
    `);
    expect(messages(source)).toMatchInlineSnapshot(`
      [
        "1:1 default or namespace import of @trpc/server: see docs/migrating-from-v11.md",
      ]
    `);
  });

  test('link options: empty, multiline, quoted and computed keys, SSE and ws notes', () => {
    const source = `import { httpBatchLink, httpSubscriptionLink, wsLink, createWSClient } from '@trpc/client';
const empty = httpBatchLink({});
const multiline = httpBatchLink({
  url: '/trpc',
  'maxURLLength': 2000,
  [key]: 1,
});
const sse = httpSubscriptionLink({ url: '/trpc', EventSource, eventSourceOptions: {} });
const client = createWSClient({ url: 'ws://x' });
const ws = wsLink({ client });
`;
    expect(upgrade(source).code).toMatchInlineSnapshot(`
      "import { httpLink, wsLink, createWSClient } from '@trpc12/trpc/client';
      const empty = httpLink({ batch: true });
      const multiline = httpLink({
        batch: true,
        url: '/trpc',
        maxUrlLength: 2000,
        [key]: 1,
      });
      const sse = httpLink({ url: '/trpc', EventSource, eventSourceOptions: {} });
      const client = createWSClient({ url: 'ws://x' });
      const ws = wsLink({ client });
      "
    `);
    expect(messages(source)).toMatchInlineSnapshot(`
      [
        "8:50 EventSource: httpLink streams SSE over fetch; use headers or init",
        "8:63 eventSourceOptions: httpLink streams SSE over fetch; use headers or init",
        "9:16 createWSClient: pass its options to wsLink({ url })",
        "10:21 wsLink({ url, connectionParams }) replaces createWSClient + wsLink({ client })",
      ]
    `);
  });

  test('clients without options, with empty options, or multiline', () => {
    expect(
      upgrade(`import { createTRPCClient } from '@trpc/client';
const a = createTRPCClient<AppRouter>();
const b = createTRPCClient<AppRouter>({});
const c = createTRPCClient<AppRouter>({
  links,
});
`).code,
    ).toMatchInlineSnapshot(`
      "import { createTrpcClient, routerType } from '@trpc12/trpc/client';
      const a = createTrpcClient<AppRouter>();
      const b = createTrpcClient({ router: routerType<AppRouter>() });
      const c = createTrpcClient({
        router: routerType<AppRouter>(),
        links,
      });
      "
    `);
  });

  test('createTRPCContext destructured with a name it does not return', () => {
    const source = `import { createTRPCContext } from '@trpc/tanstack-react-query';
export const { TRPCProvider, useOther } = createTRPCContext<AppRouter>();
export const { useTRPCClient: useClient } = createTRPCContext<AppRouter>();
`;
    expect(upgrade(source, 'trpc.ts').code).toMatchInlineSnapshot(`
      "import { createTrpcContext } from '@trpc12/tanstack-react-query';
      export const { TrpcProvider, useOther } = createTrpcContext<AppRouter>();
      export const [, , useClient] = createTrpcContext<AppRouter>();
      "
    `);
    expect(messages(source, 'trpc.ts')).toMatchInlineSnapshot(`
      [
        "2:30 createTrpcContext returns [TrpcProvider, useTrpc, useTrpcClient, context]: destructure it as a tuple",
      ]
    `);
  });

  test('mergeRouters as an arrow body, createCallerFactory, req last in fetchRequestHandler', () => {
    const source = `import { initTRPC } from '@trpc/server';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
const t = initTRPC.create();
const merged = () => t.mergeRouters(a, b);
const factory = t.createCallerFactory(appRouter);
export const handle = (request: Request) =>
  fetchRequestHandler({ endpoint: '/trpc', router: appRouter, req: request });
`;
    expect(upgrade(source).code).toMatchInlineSnapshot(`
      "import { initTrpc } from '@trpc12/trpc/server';
      import { createFetchHandler } from '@trpc12/trpc/server';
      const t = initTrpc();
      const merged = () => ({ ...a, ...b });
      const factory = t.createCallerFactory(appRouter);
      export const handle = (request: Request) =>
        createFetchHandler({ endpoint: '/trpc', router: appRouter }).fetch(request);
      "
    `);
    expect(messages(source)).toMatchInlineSnapshot(`
      [
        "5:17 createCallerFactory: createRouterClient(router, { ctx }) makes a caller",
        "7:3 createFetchHandler: make the handler once, outside the request function; createContext gets { request, info }",
      ]
    `);
  });

  test('TRPCClientError<Router>, createTRPCOptionsProxy and spread JSX props are notes', () => {
    const source = `import { TRPCClientError } from '@trpc/client';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import { TRPCProvider } from './trpc';
type E = TRPCClientError<AppRouter>;
const proxy = createTRPCOptionsProxy({ client, queryClient });
const app = <TRPCProvider {...props} trpcClient={client} />;
`;
    expect(upgrade(source, 'app.tsx').code).toMatchInlineSnapshot(`
      "import { TrpcError } from '@trpc12/trpc/client';
      import { createTrpcQueryUtils } from '@trpc12/tanstack-react-query';
      import { TrpcProvider } from './trpc';
      type E = TrpcError<AppRouter>;
      const proxy = createTrpcQueryUtils({ client, queryClient });
      const app = <TrpcProvider {...props} client={client} />;
      "
    `);
    expect(messages(source, 'app.tsx')).toMatchInlineSnapshot(`
      [
        "4:10 TrpcError<TCode, TData> takes a code and data, not a router; use ClientError or safe()",
        "5:15 createTrpcQueryUtils({ client }): the queryClient goes to QueryClientProvider",
      ]
    `);
  });

  test('shapes with nothing to rewrite are left as they are', () => {
    const source = `import { initTRPC } from '@trpc/server';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { createTRPCContext } from '@trpc/tanstack-react-query';
const t = initTRPC.create({ [key]: 1, custom: 2 });
const bare = Object.create(null);
const holes = [, t];
const batch = httpBatchLink();
const client = createTRPCClient<AppRouter>({ links });
const spread = t.mergeRouters(...routers);
const none = t.mergeRouters();
const fromOptions = fetchRequestHandler(options);
const noReq = fetchRequestHandler({ endpoint: '/trpc' });
export const { TRPCProvider, 1: one, ...rest } = createTRPCContext<AppRouter>();
`;
    expect(upgrade(source).code).toMatchInlineSnapshot(`
      "import { initTrpc } from '@trpc12/trpc/server';
      import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
      import { createFetchHandler } from '@trpc12/trpc/server';
      import { createTrpcContext } from '@trpc12/tanstack-react-query';
      const t = initTrpc({ [key]: 1, custom: 2 });
      const bare = Object.create(null);
      const holes = [, t];
      const batch = httpLink();
      const client = createTrpcClient({ router: routerType<AppRouter>(), links });
      const spread = t.mergeRouters(...routers);
      const none = t.mergeRouters();
      const fromOptions = createFetchHandler(options);
      const noReq = createFetchHandler({ endpoint: '/trpc' });
      export const { TrpcProvider, 1: one, ...rest } = createTrpcContext<AppRouter>();
      "
    `);
    expect(messages(source)).toMatchInlineSnapshot(`
      [
        "14:30 createTrpcContext returns [TrpcProvider, useTrpc, useTrpcClient, context]: destructure it as a tuple",
      ]
    `);
  });

  test('class members, interface keys and qualified names keep v11 names', () => {
    expect(
      upgrade(`import { TRPCError } from '@trpc/server';
class Errors {
  TRPCError = TRPCError;
}
class Methods {
  TRPCError() {}
}
interface Shape {
  TRPCError: typeof TRPCError;
}
interface Callable {
  TRPCError(): void;
}
type Q = errors.TRPCError;
`).code,
    ).toMatchInlineSnapshot(`
      "import { TrpcError } from '@trpc12/trpc/server';
      class Errors {
        TRPCError = TrpcError;
      }
      class Methods {
        TRPCError() {}
      }
      interface Shape {
        TRPCError: typeof TrpcError;
      }
      interface Callable {
        TRPCError(): void;
      }
      type Q = errors.TRPCError;
      "
    `);
  });
});

describe('files and CLI', () => {
  const project = async () => {
    const root = await mkdtemp(join(tmpdir(), 'trpc-upgrade-'));
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

  test('the CLI takes a file and prints the steps left by hand', async () => {
    const root = await project();
    const file = join(root, 'src', 'trpc.ts');
    await writeFile(
      file,
      `import { initTRPC } from '@trpc/server';\nexport const t = initTRPC.create({ isServer: true });\n`,
    );
    expect(await cli([file])).toEqual([
      `would upgrade ${file}`,
      `${file}:2:36 isServer is gone`,
      '1 file(s) to upgrade, 1 step(s) by hand',
    ]);
  });

  test('the CLI writes with --write', async () => {
    const root = await project();
    expect((await cli([root, '--write'])).at(-1)).toBe(
      '1 file(s) upgraded, 0 step(s) by hand',
    );
    expect(await readFile(join(root, 'src', 'trpc.ts'), 'utf8')).toBe(
      `import { initTrpc } from '@trpc12/trpc/server';\nexport const t = initTrpc();\n`,
    );
  });
});
