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
  experimental_dataOf,
  experimental_handleOfItem,
  experimental_useHandles,
  loadHandles,
  prefetchEntry,
  ensureEntry,
  prefetchInfiniteEntry,
  fromHandle,
} from '.';
import type {
  experimental_inferHandles,
  inferQueryHandle,
  inferInfiniteQueryHandle,
} from '.';
import type { TRPCOptionsProxy } from '..';
import { createTRPCContext, createTRPCOptionsProxy } from '..';
import { dehydrateUnsent } from '../internals/hydration';

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

describe('dependent entries in a server component', () => {
  /** What `HydrateClient` gives its `HydrationBoundary`, when it renders */
  const hydrateClientState = dehydrateUnsent;
  const day = new Date('2026-01-01');

  test('the load waits for the data a handle has in its input, and every query crosses', async () => {
    await using resource = ctx();
    const queryClient = makeServerQueryClient();
    const trpc = createTRPCOptionsProxy({
      router: resource.appRouter,
      ctx: {},
      queryClient,
    });

    // The page, a server component. The load waits for the post, which the
    // second entry's input is from, and not for the second query
    const post = ensureEntry(trpc.post.byDay, { day });
    const [handles] = await loadHandles(trpc, {
      post,
      fetchedOn: prefetchEntry(trpc.post.byDay, {
        day: experimental_dataOf(post).fetchedAt,
      }),
    });
    const state = hydrateClientState(queryClient);
    expect(state.queries.map((query) => query.state.status)).toEqual([
      'success',
      'pending',
    ]);

    const html = await renderClientTree(
      resource,
      <HydrationBoundary state={state}>
        <Post post={handles.post} />
        <Post post={handles.fetchedOn} />
      </HydrationBoundary>,
    );
    expect(html).toContain('Posts on 2026-01-01');
    expect(html).toContain('Posts on 1970-01-01');
    // The server ran each once, and the browser's side asked for nothing
    expect(resource.calls).toHaveBeenCalledTimes(2);
    expect(resource.onRequestSpy).not.toHaveBeenCalled();
  });

  test('a load that waits for nothing: a server component that waits for the data sends the query built from it', async () => {
    await using resource = ctx();
    const queryClient = makeServerQueryClient();
    const trpc = createTRPCOptionsProxy({
      router: resource.appRouter,
      ctx: {},
      queryClient,
    });
    function pageEntries() {
      const post = prefetchEntry(trpc.post.byDay, { day });
      return {
        post,
        fetchedOn: experimental_dataOf(post, (it) =>
          prefetchEntry(trpc.post.byDay, { day: it.fetchedAt }),
        ),
      };
    }
    function FetchedOn(props: {
      handles: experimental_inferHandles<typeof pageEntries>;
    }) {
      const t = trpcContext.useTRPC();
      const post = useSuspenseQuery(fromHandle(t, props.handles.post));
      return (
        <Post
          post={experimental_handleOfItem(props.handles.fetchedOn, post.data)}
        />
      );
    }

    // The page: it waits for nothing, so the query built from the post has no
    // key yet, and the page's `HydrateClient` has only the post
    const [handles] = await loadHandles(trpc, pageEntries());
    const pageState = hydrateClientState(queryClient);
    expect(pageState.queries.map((query) => query.state.status)).toEqual([
      'pending',
    ]);

    // A server component further down, in a Suspense boundary: it waits for
    // the post. The query built from it is created in the same step, so its
    // own `HydrateClient` has it
    await queryClient.ensureQueryData(fromHandle(trpc, handles.post));
    const sectionState = hydrateClientState(queryClient);
    expect(sectionState.queries.map((query) => query.queryKey)).toEqual([
      trpc.post.byDay.queryKey({ day: new Date(0) }),
    ]);

    const html = await renderClientTree(
      resource,
      <HydrationBoundary state={pageState}>
        <Post post={handles.post} />
        <HydrationBoundary state={sectionState}>
          <FetchedOn handles={handles} />
        </HydrationBoundary>
      </HydrationBoundary>,
    );
    expect(html).toContain('Posts on 2026-01-01');
    expect(html).toContain('Posts on 1970-01-01');
    expect(resource.calls).toHaveBeenCalledTimes(2);
    expect(resource.onRequestSpy).not.toHaveBeenCalled();
  });
});

describe('experimental_useHandles while server rendering', () => {
  test("a client component's entries start on the server, which keeps nothing for later", async () => {
    await using resource = ctx();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const timers = vi.spyOn(globalThis, 'setTimeout');
    function Page() {
      const trpc = trpcContext.useTRPC();
      const handles = experimental_useHandles(trpc, {
        post: prefetchEntry(trpc.post.byDay, { day: new Date('2026-01-01') }),
      });
      return <Post post={handles.post} />;
    }
    const html = await renderClientTree(resource, <Page />);
    expect(html).toContain('Posts on 2026-01-01');
    expect(resource.calls).toHaveBeenCalledTimes(1);
    expect(trpcWarnings(warn)).toEqual([]);
    // A request's `QueryClient` goes with the request: no timer waits to clean up
    await new Promise((resolve) => setImmediate(resolve));
    expect(timers.mock.calls.filter(([, delay]) => delay === 30_000)).toEqual(
      [],
    );
  });
});
