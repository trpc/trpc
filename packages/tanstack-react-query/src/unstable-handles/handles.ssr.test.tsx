// @vitest-environment node
import { PassThrough } from 'node:stream';
import { text } from 'node:stream/consumers';
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import {
  defaultShouldDehydrateQuery,
  dehydrate,
  HydrationBoundary,
  QueryClient,
  QueryClientProvider,
  useSuspenseQuery,
} from '@tanstack/react-query';
import type {
  DehydratedState,
  QueryKeyHashFunction,
} from '@tanstack/react-query';
import { initTRPC } from '@trpc/server';
import * as React from 'react';
import { renderToPipeableStream } from 'react-dom/server';
import superjson from 'superjson';
import { describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { loadHandles, prefetchEntry, ensureEntry, fromHandle } from '.';
import type { inferQueryHandle } from '.';
import type { TRPCOptionsProxy } from '..';
import { createTRPCContext, createTRPCOptionsProxy } from '..';

const ctx = () => {
  const t = initTRPC.create({ transformer: superjson });
  const calls = vi.fn();
  const appRouter = t.router({
    post: t.router({
      byDay: t.procedure
        .input(z.object({ day: z.date(), slow: z.boolean().optional() }))
        .query(async (opts) => {
          calls(opts.input);
          if (opts.input.slow) {
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
          return {
            title: `Posts on ${opts.input.day.toISOString().slice(0, 10)}`,
            fetchedAt: new Date(0),
          };
        }),
      /** A post by its number, a bigint */
      byNumber: t.procedure
        .input(z.object({ number: z.bigint() }))
        .query((opts) => {
          calls(opts.input);
          return { title: `Post number ${String(opts.input.number)}` };
        }),
    }),
  });
  const resource = testServerAndClientResource(appRouter);
  return { ...resource, calls, appRouter };
};

type AppRouter = ReturnType<typeof ctx>['appRouter'];
type TRPC = TRPCOptionsProxy<AppRouter>;

/** The request-scoped server side: an in-process proxy that mints handles */
function makeServer(resource: ReturnType<typeof ctx>) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000 },
      dehydrate: {
        serializeData: superjson.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === 'pending',
      },
    },
  });
  const trpc = createTRPCOptionsProxy({
    router: resource.appRouter,
    ctx: {},
    queryClient,
  });
  return { queryClient, trpc };
}

/** Server-render the client tree, the way Next.js renders client components */
async function renderClientTree(opts: {
  resource: ReturnType<typeof ctx>;
  state: DehydratedState | undefined;
  /** The client QueryClient's `queryKeyHashFn` */
  queryKeyHashFn: QueryKeyHashFunction<readonly unknown[]> | undefined;
  children: React.ReactNode;
}) {
  const { resource } = opts;
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, queryKeyHashFn: opts.queryKeyHashFn },
      hydrate: { deserializeData: superjson.deserialize },
    },
  });
  const { TRPCProvider } = trpcContext;
  const output = new PassThrough();
  const html = text(output);
  await new Promise<void>((resolve, reject) => {
    const { pipe } = renderToPipeableStream(
      <QueryClientProvider client={queryClient}>
        <TRPCProvider trpcClient={resource.client} queryClient={queryClient}>
          <HydrationBoundary state={opts.state}>
            <React.Suspense fallback="loading">{opts.children}</React.Suspense>
          </HydrationBoundary>
        </TRPCProvider>
      </QueryClientProvider>,
      {
        onAllReady() {
          pipe(output);
          resolve();
        },
        onShellError: reject,
      },
    );
  });
  return html;
}

const trpcContext = createTRPCContext<AppRouter>();

function trpcWarnings(warn: { mock: { calls: unknown[][] } }) {
  return warn.mock.calls
    .map(([message]) => String(message))
    .filter((message) => message.startsWith('[@trpc/tanstack-react-query]'));
}

function Post(props: { post: inferQueryHandle<TRPC['post']['byDay']> }) {
  const trpc = trpcContext.useTRPC();
  const postQuery = useSuspenseQuery(fromHandle(trpc, props.post));
  return (
    <p>{`${postQuery.data.title} fetchedAt:${postQuery.data.fetchedAt.toISOString()}`}</p>
  );
}

describe('server rendering', () => {
  test('renders ensured and pending handles from the dehydrated state, without fetching again', async () => {
    await using resource = ctx();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const server = makeServer(resource);

    const [{ ensured, pending }] = await loadHandles(server.trpc, {
      ensured: ensureEntry(server.trpc.post.byDay, {
        day: new Date('2026-01-01'),
      }),
      pending: prefetchEntry(server.trpc.post.byDay, {
        day: new Date('2026-01-02'),
        slow: true,
      }),
    });
    const state = dehydrate(server.queryClient);
    expect(state.queries.map((query) => query.state.status)).toEqual([
      'success',
      'pending',
    ]);

    // Handles cross as framework data: Flight and seroval keep the `Date` in the input
    const props = structuredClone({ ensured, pending });

    const html = await renderClientTree({
      resource,
      state,
      queryKeyHashFn: undefined,
      children: (
        <>
          <Post post={props.ensured} />
          <Post post={props.pending} />
        </>
      ),
    });

    expect(html).toContain('Posts on 2026-01-01');
    expect(html).toContain('Posts on 2026-01-02');
    expect(html).toContain('fetchedAt:1970-01-01T00:00:00.000Z');
    expect(resource.calls).toHaveBeenCalledTimes(2);
    expect(trpcWarnings(warn)).toEqual([]);
    warn.mockRestore();
  });

  test('warns once when a handle is read during server rendering without hydration', async () => {
    await using resource = ctx();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const server = makeServer(resource);
    const [{ handle }] = await loadHandles(server.trpc, {
      handle: prefetchEntry(server.trpc.post.byDay, {
        day: new Date('2026-02-01'),
      }),
    });
    await vi.waitFor(() => expect(resource.calls).toHaveBeenCalledTimes(1));

    // No dehydrated state: the client tree has to fetch the query again
    const render = () =>
      renderClientTree({
        resource,
        state: undefined,
        queryKeyHashFn: undefined,
        children: <Post post={handle} />,
      });
    expect(await render()).toContain('Posts on 2026-02-01');
    expect(await render()).toContain('Posts on 2026-02-01');

    expect(resource.calls).toHaveBeenCalledTimes(3);
    expect(trpcWarnings(warn)).toHaveLength(1);
    expect(trpcWarnings(warn)[0]).toContain(
      'The handle for "post.byDay" is being fetched again during server rendering',
    );
    warn.mockRestore();
  });

  test('a handle from an ensure entry needs hydration too', async () => {
    await using resource = ctx();
    using warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const server = makeServer(resource);
    const [{ handle }] = await loadHandles(server.trpc, {
      handle: ensureEntry(server.trpc.post.byDay, {
        day: new Date('2026-02-02'),
      }),
    });

    const html = await renderClientTree({
      resource,
      state: undefined,
      queryKeyHashFn: undefined,
      children: <Post post={handle} />,
    });
    expect(html).toContain('Posts on 2026-02-02');
    expect(resource.calls).toHaveBeenCalledTimes(2);
    expect(trpcWarnings(warn)).toHaveLength(1);
  });

  test("a key that only the QueryClient's own `queryKeyHashFn` can hash still fetches, and warns", async () => {
    await using resource = ctx();
    using warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // The default hash throws on a bigint
    const queryKeyHashFn: QueryKeyHashFunction<readonly unknown[]> = (
      queryKey,
    ) =>
      JSON.stringify(queryKey, (_key, value: unknown) =>
        typeof value === 'bigint' ? `${value}n` : value,
      );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { staleTime: 30_000, queryKeyHashFn } },
    });
    const trpc = createTRPCOptionsProxy({
      router: resource.appRouter,
      ctx: {},
      queryClient,
    });
    const [{ handle }] = await loadHandles(trpc, {
      handle: ensureEntry(trpc.post.byNumber, { number: 1n }),
    });

    function PostByNumber(props: {
      post: inferQueryHandle<TRPC['post']['byNumber']>;
    }) {
      const clientTRPC = trpcContext.useTRPC();
      const postQuery = useSuspenseQuery(fromHandle(clientTRPC, props.post));
      return <p>{postQuery.data.title}</p>;
    }
    // No dehydrated state: the client tree has to fetch the query again
    const html = await renderClientTree({
      resource,
      state: undefined,
      queryKeyHashFn,
      children: <PostByNumber post={handle} />,
    });

    expect(html).toContain('Post number 1');
    expect(resource.calls).toHaveBeenCalledTimes(2);
    expect(trpcWarnings(warn)).toHaveLength(1);
    expect(trpcWarnings(warn)[0]).toContain(
      'The handle for "post.byNumber" is being fetched again during server rendering',
    );
  });
});
