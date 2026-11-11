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
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { initTRPC, TRPCError } from '@trpc/server';
import * as React from 'react';
import { renderToPipeableStream } from 'react-dom/server';
import superjson from 'superjson';
import { describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import {
  loadHandles,
  prefetchEntry,
  ensureEntry,
  prefetchInfiniteEntry,
  fromHandle,
} from '.';
import type { inferQueryHandle, inferInfiniteQueryHandle } from '.';
import type { TRPCOptionsProxy } from '..';
import { createTRPCContext, createTRPCOptionsProxy } from '..';

const ctx = () => {
  const t = initTRPC.create({ transformer: superjson });
  const calls = vi.fn();
  let version = 0;
  const appRouter = t.router({
    post: t.router({
      byDay: t.procedure.input(z.object({ day: z.date() })).query((opts) => {
        calls(opts.input);
        version++;
        return {
          title: `Posts on ${opts.input.day.toISOString().slice(0, 10)}`,
          version,
          fetchedAt: new Date(0),
        };
      }),
      list: t.procedure
        .input(z.object({ cursor: z.number().nullish() }))
        .query((opts) => {
          calls(opts.input);
          const cursor = opts.input.cursor ?? 0;
          return { items: [cursor, cursor + 1], nextCursor: cursor + 2 };
        }),
      missing: t.procedure.query(() => {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }),
    }),
  });
  const resource = testServerAndClientResource(appRouter);
  return { ...resource, calls, appRouter };
};

type AppRouter = ReturnType<typeof ctx>['appRouter'];
type TRPC = TRPCOptionsProxy<AppRouter>;

function makeServerQueryClient() {
  return new QueryClient({
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
}

function makeBrowserQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000 },
      hydrate: { deserializeData: superjson.deserialize },
    },
  });
}

const trpcContext = createTRPCContext<AppRouter>();

/** Server-render client components, the way Next.js renders them after the RSC pass */
async function renderClientTree(
  resource: ReturnType<typeof ctx>,
  children: React.ReactNode,
  queryClient = makeBrowserQueryClient(),
) {
  const { TRPCProvider } = trpcContext;
  const output = new PassThrough();
  const html = text(output);
  await new Promise<void>((resolve, reject) => {
    const { pipe } = renderToPipeableStream(
      <QueryClientProvider client={queryClient}>
        <TRPCProvider trpcClient={resource.client} queryClient={queryClient}>
          <React.Suspense fallback="loading">{children}</React.Suspense>
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

function trpcWarnings(warn: { mock: { calls: unknown[][] } }) {
  return warn.mock.calls
    .map(([message]) => String(message))
    .filter((message) => message.startsWith('[@trpc/tanstack-react-query]'));
}

function Post(props: { post: inferQueryHandle<TRPC['post']['byDay']> }) {
  const trpc = trpcContext.useTRPC();
  const postQuery = useSuspenseQuery(fromHandle(trpc, props.post));
  const post = postQuery.data;
  return (
    <p>{`${post.title} v${post.version} fetchedAt:${post.fetchedAt.toISOString()}`}</p>
  );
}

function List(props: { list: inferInfiniteQueryHandle<TRPC['post']['list']> }) {
  const trpc = trpcContext.useTRPC();
  const listQuery = useSuspenseInfiniteQuery(
    fromHandle(trpc, props.list, {
      getNextPageParam: (page) => page.nextCursor,
    }),
  );
  return (
    <p>{`items:${listQuery.data.pages.flatMap((page) => page.items).join(',')}`}</p>
  );
}

describe('dehydrate and HydrationBoundary from a server loader', () => {
  test('carries transformed data and pending queries with no second fetch', async () => {
    await using resource = ctx();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const queryClient = makeServerQueryClient();
    // A React Router `loader`: the default build, on the server
    const trpc = createTRPCOptionsProxy({
      router: resource.appRouter,
      ctx: {},
      queryClient,
    });
    const [{ post }] = await loadHandles(trpc, {
      post: ensureEntry(trpc.post.byDay, {
        day: new Date('2026-01-01'),
      }),
    });
    const [{ later }] = await loadHandles(trpc, {
      later: prefetchEntry(trpc.post.byDay, {
        day: new Date('2026-01-02'),
      }),
    });
    const [{ list }] = await loadHandles(trpc, {
      list: prefetchInfiniteEntry(trpc.post.list, {}),
    });
    const loaderData = {
      dehydratedState: dehydrate(queryClient),
      post,
      later,
      list,
    };
    expect(
      loaderData.dehydratedState.queries.map((query) => query.state.status),
    ).toEqual(['success', 'pending', 'pending']);

    const html = await renderClientTree(
      resource,
      <HydrationBoundary state={loaderData.dehydratedState}>
        <Post post={loaderData.post} />
        <Post post={loaderData.later} />
        <List list={loaderData.list} />
      </HydrationBoundary>,
    );
    expect(html).toContain('Posts on 2026-01-01');
    expect(html).toContain('Posts on 2026-01-02');
    expect(html).toContain('fetchedAt:1970-01-01T00:00:00.000Z');
    expect(html).toContain('items:0,1');
    expect(resource.calls).toHaveBeenCalledTimes(3);
    expect(trpcWarnings(warn)).toEqual([]);
    warn.mockRestore();
  });
});
