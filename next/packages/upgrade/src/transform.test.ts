import { NodeServices } from '@effect/platform-node';
import { Effect, FileSystem, Path } from 'effect';
import { Command } from 'effect/cli';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
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
      "import { initTrpc, TrpcError, mergeRouters, createRouterClient } from '@trpc12/trpc/server';
      import type { Context } from './context';

      const t = initTrpc<{ ctx: Context; meta: { auth: boolean } }>();

      export const router = t.router;
      export const publicProcedure = t.procedure;
      export const merged = mergeRouters(userRouter, postRouter);

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
        "4:3 transformer: drop it here; pass the same createSyncTransformer(transformer) to the handler and every link",
        "5:3 errorFormatter: declare errors with .errors() or TrpcError.Tagged; createV11Handler({ errorFormatter }) keeps old clients working",
        "6:3 isDev: use the handler option exposeUnexpectedErrors",
      ]
    `);
  });

  test('t.router stays: in v12 it brands a router with the root ctx handlers read', () => {
    const source = `import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const router = t.router;
const post = t.router({ list: t.procedure.query(() => []) });
export const appRouter = t.router({ post, user: t.router(userRoutes) });
export const make = () => t.router({ post });
const other = { router: (routes: object) => routes };
other.router({ post });
`;
    expect(upgrade(source).code).toMatchInlineSnapshot(`
      "import { initTrpc } from '@trpc12/trpc/server';
      const t = initTrpc();
      export const router = t.router;
      const post = t.router({ list: t.procedure.query(() => []) });
      export const appRouter = t.router({ post, user: t.router(userRoutes) });
      export const make = () => t.router({ post });
      const other = { router: (routes: object) => routes };
      other.router({ post });
      "
    `);
    expect(messages(source)).toEqual([]);
  });

  test('input.lastEventId is a note: v12 passes it to the resolver', () => {
    expect(
      messages(`import { tracked } from '@trpc/server';
export const onAdd = publicProcedure
  .input(z.object({ lastEventId: z.string().nullish() }).optional())
  .subscription(async function* (opts) {
    yield* feed(opts.input?.lastEventId, tracked);
  });
const resume = ({ input }: { input: { lastEventId: string } }) => input.lastEventId;
const other = { lastEventId: '1' }.lastEventId;
`),
    ).toMatchInlineSnapshot(`
      [
        "5:17 lastEventId: v12 passes it to the resolver as opts.lastEventId; v12 clients send subscribe(input, { lastEventId })",
        "7:67 lastEventId: v12 passes it to the resolver as opts.lastEventId; v12 clients send subscribe(input, { lastEventId })",
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
        "6:5 createFetchHandler: make the handler once, outside the request function; createContext gets { request, info }; old clients: createV11Handler on this endpoint, createFetchHandler on another (https://v12.trpc.io/v12/docs/migrations/from-v11/serve-v11-clients)",
      ]
    `);
  });

  test('FetchCreateContextFnOptions becomes CreateContextOpts, with a note on its shape', () => {
    const source = `import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
export const createContext = (opts: FetchCreateContextFnOptions) => ({});
`;
    expect(upgrade(source).code).toMatchInlineSnapshot(`
      "import type { CreateContextOpts } from '@trpc12/trpc/server';
      export const createContext = (opts: CreateContextOpts) => ({});
      "
    `);
    expect(messages(source)).toMatchInlineSnapshot(`
      [
        "1:15 CreateContextOpts: opts.req is opts.request, whose headers are a record (request.headers['authorization']); response headers go on the procedure's response handle, https://v12.trpc.io/v12/docs/server/responses",
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
        "1:1 observable(): subscriptions return an async generator or an Effect Stream; a v11 link keeps it under fromV11Link",
        "2:1 adapters: serve createFetchHandler() with serve() from @trpc12/trpc/http (https://v12.trpc.io/v12/docs/adapters/overview); old clients: createV11Handler on this endpoint, createFetchHandler on another (https://v12.trpc.io/v12/docs/migrations/from-v11/serve-v11-clients)",
        "3:1 @trpc/unknown: no v12 module, see https://v12.trpc.io/v12/docs/migrations/from-v11",
      ]
    `);
  });
});

describe('client', () => {
  test('links merge into httpLink; their transformer is wrapped in createSyncTransformer', () => {
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
      import { createSyncTransformer } from '@trpc12/trpc/transformer';

      const transformer = superjson;

      export const client = createTrpcClient({
        router: routerType<AppRouter>(),
        links: [
          splitLink({
            condition: (op) => op.type === 'subscription',
            true: httpLink({ url: '/trpc', transformer: createSyncTransformer(transformer) }),
            false: httpLink({ batch: true, url: '/trpc', transformer: createSyncTransformer(superjson), maxUrlLength: 2083 }),
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
        "1:15 TRPCLink: stays on @trpc/client; keep the link with fromV11Link(link) from @trpc12/trpc/interop, or rewrite it with link() as an Effect Stream function",
      ]
    `);
  });

  test("inferRouterOutputs keeps its name, with a note on the transformer's form", () => {
    const source = `import type { inferRouterOutputs } from '@trpc/server';
export type Post = inferRouterOutputs<AppRouter>['post']['byId'];
`;
    expect(upgrade(source).code).toMatchInlineSnapshot(`
      "import type { inferRouterOutputs } from '@trpc12/trpc/server';
      export type Post = inferRouterOutputs<AppRouter>['post']['byId'];
      "
    `);
    expect(messages(source)).toMatchInlineSnapshot(`
      [
        "1:15 inferRouterOutputs<AppRouter> is plain JSON's form (Date is string), as v11's without a transformer; with a transformer on the links, pass the client's type: inferRouterOutputs<typeof client>",
      ]
    `);
  });

  test('TRPCLink stays imported from @trpc/client, for fromV11Link', () => {
    const only = `import type { TRPCLink } from '@trpc/client';
export const authLink: TRPCLink<AppRouter> = () => ({ op, next }) => next(op);
`;
    expect(upgrade(only).code).toBe(only);
    expect(
      upgrade(`import { createTRPCClient, type TRPCLink } from "@trpc/client";
declare const authLink: TRPCLink<AppRouter>;
const client = createTRPCClient<AppRouter>({ links: [authLink] });
`).code,
    ).toMatchInlineSnapshot(`
      "import { createTrpcClient, routerType } from '@trpc12/trpc/client';
      import { type TRPCLink } from "@trpc/client";
      declare const authLink: TRPCLink<AppRouter>;
      const client = createTrpcClient({ router: routerType<AppRouter>(), links: [authLink] });
      "
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

describe('promoted experimental_ and unstable_ names', () => {
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

  test('a name promoted twice goes to the end of the chain', () => {
    expect(
      upgradeSource(
        `import { experimental_draft, unstable_draft as later } from '@trpc12/trpc/server';
draft(experimental_draft, later);
`,
        'file.ts',
        {
          promoted: {
            experimental_draft: 'unstable_draft',
            unstable_draft: 'draft',
          },
        },
      ).code,
    ).toMatchInlineSnapshot(`
      "import { draft, draft as later } from '@trpc12/trpc/server';
      draft(draft, later);
      "
    `);
  });

  test('a promoted package is renamed, with its subpaths and names', () => {
    expect(
      upgradeSource(
        `import { atom, useAtom } from '@trpc12/experimental-react-atom';
export { atomFamily } from '@trpc12/experimental-react-atom/family';
const a = atom(useAtom);
`,
        'file.ts',
        {
          promoted: { unstable_atomFamily: 'atomFamily' },
          promotedPackages: {
            '@trpc12/experimental-react-atom': {
              to: '@trpc12/react-atom',
              names: {
                atom: 'unstable_atom',
                atomFamily: 'unstable_atomFamily',
              },
            },
          },
        },
      ).code,
    ).toMatchInlineSnapshot(`
      "import { unstable_atom, useAtom } from '@trpc12/react-atom';
      export { atomFamily } from '@trpc12/react-atom/family';
      const a = unstable_atom(useAtom);
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
        "1:1 default or namespace import of @trpc/server: see https://v12.trpc.io/v12/docs/migrations/from-v11",
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

  test('mergeRouters as an arrow body or with spread or no routers, createCallerFactory, req last in fetchRequestHandler', () => {
    const source = `import { initTRPC } from '@trpc/server';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
const t = initTRPC.create();
const merged = () => t.mergeRouters(a, b);
const spread = t.mergeRouters(...routers);
const none = t.mergeRouters();
const factory = t.createCallerFactory(appRouter);
export const handle = (request: Request) =>
  fetchRequestHandler({ endpoint: '/trpc', router: appRouter, req: request });
`;
    expect(upgrade(source).code).toMatchInlineSnapshot(`
      "import { initTrpc, mergeRouters } from '@trpc12/trpc/server';
      import { createFetchHandler } from '@trpc12/trpc/server';
      const t = initTrpc();
      const merged = () => mergeRouters(a, b);
      const spread = mergeRouters(...routers);
      const none = mergeRouters();
      const factory = t.createCallerFactory(appRouter);
      export const handle = (request: Request) =>
        createFetchHandler({ endpoint: '/trpc', router: appRouter }).fetch(request);
      "
    `);
    expect(messages(source)).toMatchInlineSnapshot(`
      [
        "7:17 createCallerFactory: createRouterClient(router, { ctx }) makes a caller",
        "9:3 createFetchHandler: make the handler once, outside the request function; createContext gets { request, info }; old clients: createV11Handler on this endpoint, createFetchHandler on another (https://v12.trpc.io/v12/docs/migrations/from-v11/serve-v11-clients)",
      ]
    `);
  });

  test('TRPCClientError<Router>, createTRPCOptionsProxy and spread JSX props are notes', () => {
    const source = `import { TRPCClientError, type TRPCClient } from '@trpc/client';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import { TRPCProvider } from './trpc';
type E = TRPCClientError<AppRouter>;
declare const client: TRPCClient<AppRouter>;
const proxy = createTRPCOptionsProxy<AppRouter>({ client, queryClient });
const app = <TRPCProvider {...props} trpcClient={client} />;
`;
    expect(upgrade(source, 'app.tsx').code).toMatchInlineSnapshot(`
      "import { TrpcError, type TrpcClient } from '@trpc12/trpc/client';
      import { createTrpcQueryUtils } from '@trpc12/tanstack-react-query';
      import { TrpcProvider } from './trpc';
      type E = TrpcError<AppRouter>;
      declare const client: TrpcClient<AppRouter>;
      const proxy = createTrpcQueryUtils({ client, queryClient });
      const app = <TrpcProvider {...props} client={client} />;
      "
    `);
    expect(messages(source, 'app.tsx')).toMatchInlineSnapshot(`
      [
        "4:10 TrpcError<TCode, TData> takes a code and data, not a router; use ClientError or safe()",
        "6:15 createTrpcQueryUtils({ client }): the queryClient goes to QueryClientProvider",
      ]
    `);
  });

  test('helpers whose input moved into their options, or whose name is gone, are notes', () => {
    const source = `import { useTRPC } from './trpc';
function Posts() {
  const trpc = useTRPC();
  useQuery(trpc.post.list.queryOptions());
  useQuery(trpc.post.byId.queryOptions({ id: '1' }, { staleTime: 1 }));
  trpc.post.byId.queryKey({ id: '1' });
  trpc.post.byId.queryFilter({ id: '1' });
  trpc.post.feed.infiniteQueryOptions({ limit: 10 });
  trpc.post.feed.infiniteQueryKey({ limit: 10 });
  trpc.post.feed.infiniteQueryFilter({ limit: 10 });
  trpc.post.feed.infiniteQueryFilter();
  trpc.post.onAdd.subscriptionOptions(undefined, { onData });
  useMutation(trpc.post.add.mutationOptions({ onSuccess }));
}
`;
    expect(messages(source, 'posts.tsx')).toMatchInlineSnapshot(`
      [
        "5:27 queryOptions(input, opts) is queryOptions({ input, ...opts }) in v12",
        "6:18 queryKey(input) is queryKey({ input }) in v12",
        "7:18 queryFilter(input, filters) is queryFilter({ input, ...filters }) in v12",
        "8:18 infiniteQueryOptions(input, opts) is infiniteOptions({ input: (cursor) => ({ ...input, cursor }), ...opts }) in v12",
        "9:18 infiniteQueryKey(input) is infiniteKey({ input, initialPageParam }) in v12",
        "10:18 infiniteQueryFilter(input, filters) is infiniteFilter({ input, ...filters }) in v12",
        "11:18 infiniteQueryFilter(input, filters) is infiniteFilter({ input, ...filters }) in v12",
        "12:19 subscriptionOptions(input, opts) is subscriptionOptions({ input, ...opts }) in v12",
      ]
    `);
    // Without v11's TanStack integration, queryOptions() is someone else's.
    expect(
      messages(`import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
api.queryOptions({ id: '1' });
`),
    ).toEqual([]);
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
      const fromOptions = createFetchHandler(options);
      const noReq = createFetchHandler({ endpoint: '/trpc' });
      export const { TrpcProvider, 1: one, ...rest } = createTrpcContext<AppRouter>();
      "
    `);
    expect(messages(source)).toMatchInlineSnapshot(`
      [
        "12:30 createTrpcContext returns [TrpcProvider, useTrpc, useTrpcClient, context]: destructure it as a tuple",
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

  test('the bin’s --version is the package’s version', async () => {
    const run = Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dir = path.join(import.meta.dirname, '..');
      const pkg = JSON.parse(
        yield* fs.readFileString(path.join(dir, 'package.json')),
      ) as { version: string };
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const printed = yield* spawner.string(
        ChildProcess.make(process.execPath, ['src/bin.ts', '--version'], {
          cwd: dir,
        }),
      );
      return { printed: printed.trim(), version: pkg.version };
    });
    const result = await Effect.runPromise(
      run.pipe(Effect.provide(NodeServices.layer)),
    );
    expect(result.printed).toBe(`trpc12-upgrade v${result.version}`);
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
