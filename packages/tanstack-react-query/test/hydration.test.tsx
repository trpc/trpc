// @vitest-environment node
import { PassThrough } from 'node:stream';
import { text } from 'node:stream/consumers';
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import type { DehydratedState } from '@tanstack/react-query';
import {
  defaultShouldDehydrateQuery,
  HydrationBoundary,
  QueryClient,
  QueryClientProvider,
  QueryObserver,
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { initTRPC, TRPCError } from '@trpc/server';
import * as React from 'react';
import { renderToPipeableStream, renderToString } from 'react-dom/server';
import superjson from 'superjson';
import { describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import type {
  TRPCOptionsProxy,
  unstable_inferInfiniteQueryHandle,
  unstable_inferQueryHandle,
} from '../src';
import {
  unstable_createHydrateClient as createClientHydrateClient,
  createTRPCOptionsProxy as createClientOptionsProxy,
  createTRPCContext,
} from '../src';
import * as rsc from '../src/index.react-server';

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

/** The request-scoped server side, with the `react-server` build */
function makeServer(
  resource: ReturnType<typeof ctx>,
  opts: { selfHydratingHandles?: boolean } = {},
) {
  const queryClient = makeServerQueryClient();
  const trpc = rsc.createTRPCOptionsProxy({
    router: resource.appRouter,
    ctx: {},
    queryClient,
    unstable_selfHydratingHandles: opts.selfHydratingHandles,
  });
  return { queryClient, trpc };
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

/** What a server-build `HydrateClient` sends when it renders */
function sentBy(queryClient: QueryClient | (() => QueryClient)) {
  const HydrateClient = rsc.unstable_createHydrateClient(queryClient);
  const element = (HydrateClient as (props: object) => React.ReactNode)(
    {},
  ) as React.ReactElement<{ state: DehydratedState }>;
  return element.props.state;
}

function hashes(state: DehydratedState) {
  return state.queries.map((query) => query.queryHash);
}

function Post(props: {
  post: unstable_inferQueryHandle<TRPC['post']['byDay']>;
}) {
  const trpc = trpcContext.useTRPC();
  const { data } = useSuspenseQuery(trpc.unstable_fromHandle(props.post));
  return (
    <p>{`${data.title} v${data.version} fetchedAt:${data.fetchedAt.toISOString()}`}</p>
  );
}

function List(props: {
  list: unstable_inferInfiniteQueryHandle<TRPC['post']['list']>;
}) {
  const trpc = trpcContext.useTRPC();
  const { data } = useSuspenseInfiniteQuery(
    trpc.unstable_fromHandle(props.list, {
      getNextPageParam: (page) => page.nextCursor,
    }),
  );
  return <p>{`items:${data.pages.flatMap((page) => page.items).join(',')}`}</p>;
}

describe('unstable_createHydrateClient in server components', () => {
  test('nested boundaries send each query once', async () => {
    await using resource = ctx();
    const server = makeServer(resource);

    const a = server.trpc.post.byDay.queryKey({ day: new Date('2026-01-01') });
    server.trpc.post.byDay.unstable_prefetch({ day: new Date('2026-01-01') });
    const outer = sentBy(server.queryClient);
    expect(outer.queries).toHaveLength(1);
    expect(outer.queries[0]!.state.status).toBe('pending');

    // A nested server component starts another query
    await server.trpc.post.byDay.unstable_ensure({
      day: new Date('2026-01-02'),
    });
    const inner = sentBy(server.queryClient);
    expect(inner.queries).toHaveLength(1);
    expect(inner.queries[0]!.queryKey).toEqual(
      server.trpc.post.byDay.queryKey({ day: new Date('2026-01-02') }),
    );

    // The first query has settled since, but the promise the outer boundary sent resolves with it
    await server.queryClient.ensureQueryData(
      server.trpc.post.byDay.queryOptions({ day: new Date('2026-01-01') }),
    );
    expect(server.queryClient.getQueryState(a)?.status).toBe('success');
    expect(sentBy(server.queryClient).queries).toEqual([]);
  });

  test('sends a query again when the server has newer data for it', async () => {
    await using resource = ctx();
    const server = makeServer(resource);
    const opts = server.trpc.post.byDay.queryOptions({
      day: new Date('2026-01-01'),
    });

    await server.trpc.post.byDay.unstable_ensure({
      day: new Date('2026-01-01'),
    });
    expect(hashes(sentBy(server.queryClient))).toHaveLength(1);

    await new Promise((resolve) => setTimeout(resolve, 2));
    await server.queryClient.fetchQuery({ ...opts, staleTime: 0 });
    const resent = sentBy(server.queryClient);
    expect(resent.queries).toHaveLength(1);
    expect(
      superjson.deserialize(resent.queries[0]!.state.data as any),
    ).toMatchObject({
      version: 2,
    });
  });

  test("keeps the client's dehydrate filter, and doesn't mark filtered queries as sent", async () => {
    await using resource = ctx();
    const server = makeServer(resource);
    server.queryClient.setDefaultOptions({
      ...server.queryClient.getDefaultOptions(),
      dehydrate: {
        ...server.queryClient.getDefaultOptions().dehydrate,
        shouldDehydrateQuery: defaultShouldDehydrateQuery,
      },
    });

    server.trpc.post.byDay.unstable_prefetch({ day: new Date('2026-01-01') });
    expect(sentBy(server.queryClient).queries).toEqual([]);

    await server.queryClient.ensureQueryData(
      server.trpc.post.byDay.queryOptions({ day: new Date('2026-01-01') }),
    );
    expect(sentBy(server.queryClient).queries).toHaveLength(1);
  });

  test('each request client starts over', async () => {
    await using resource = ctx();
    const first = makeServer(resource);
    const second = makeServer(resource);
    await first.trpc.post.byDay.unstable_ensure({
      day: new Date('2026-01-01'),
    });
    await second.trpc.post.byDay.unstable_ensure({
      day: new Date('2026-01-01'),
    });

    expect(sentBy(first.queryClient).queries).toHaveLength(1);
    expect(sentBy(second.queryClient).queries).toHaveLength(1);
  });

  test('hydrates the client tree from nested boundaries without fetching again', async () => {
    await using resource = ctx();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const server = makeServer(resource);

    const outerPost = server.trpc.post.byDay.unstable_prefetch({
      day: new Date('2026-01-01'),
    });
    const outerState = sentBy(server.queryClient);
    const innerPost = await server.trpc.post.byDay.unstable_ensure({
      day: new Date('2026-01-02'),
    });
    const innerState = sentBy(server.queryClient);

    const html = await renderClientTree(
      resource,
      <HydrationBoundary state={outerState}>
        <Post post={outerPost} />
        <HydrationBoundary state={innerState}>
          <Post post={innerPost} />
        </HydrationBoundary>
      </HydrationBoundary>,
    );

    expect(html).toContain('Posts on 2026-01-01');
    expect(html).toContain('Posts on 2026-01-02');
    expect(resource.calls).toHaveBeenCalledTimes(2);
    expect(trpcWarnings(warn)).toEqual([]);
    warn.mockRestore();
  });

  test('takes a lazy query client, like `createTRPCOptionsProxy`', async () => {
    await using resource = ctx();
    const server = makeServer(resource);
    await server.trpc.post.byDay.unstable_ensure({
      day: new Date('2026-01-01'),
    });

    expect(sentBy(() => server.queryClient).queries).toHaveLength(1);
    expect(sentBy(() => server.queryClient).queries).toEqual([]);
  });
});

describe('unstable_createHydrateClient outside server components', () => {
  test('throws when rendered, not when created', () => {
    const HydrateClient = createClientHydrateClient(makeServerQueryClient());
    expect(() =>
      renderToString(
        <HydrateClient>
          <p />
        </HydrateClient>,
      ),
    ).toThrow(
      '`HydrateClient` from `unstable_createHydrateClient()` works only in React Server Components',
    );
  });
});

describe('self-hydrating handles', () => {
  test('are available only in the react-server build', async () => {
    await using resource = ctx();
    expect(() =>
      createClientOptionsProxy({
        router: resource.appRouter,
        ctx: {},
        queryClient: makeServerQueryClient(),
        unstable_selfHydratingHandles: true,
      }),
    ).toThrow(
      '`unstable_selfHydratingHandles` works only in React Server Components',
    );
  });

  test('render pending and ensured handles without a boundary or a second fetch', async () => {
    await using resource = ctx();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const server = makeServer(resource, { selfHydratingHandles: true });

    const pending = server.trpc.post.byDay.unstable_prefetch({
      day: new Date('2026-01-01'),
    });
    const ensured = await server.trpc.post.byDay.unstable_ensure({
      day: new Date('2026-01-02'),
    });
    const list = server.trpc.post.list.unstable_prefetchInfinite({});

    const html = await renderClientTree(
      resource,
      <>
        <Post post={pending} />
        <Post post={ensured} />
        <List list={list} />
      </>,
    );

    expect(html).toContain('Posts on 2026-01-01');
    expect(html).toContain('Posts on 2026-01-02');
    expect(html).toContain('fetchedAt:1970-01-01T00:00:00.000Z');
    expect(html).toContain('items:0,1');
    expect(resource.calls).toHaveBeenCalledTimes(3);
    expect(trpcWarnings(warn)).toEqual([]);
    warn.mockRestore();
  });

  test('handles of the same query state share one dehydrated copy', async () => {
    await using resource = ctx();
    const server = makeServer(resource, { selfHydratingHandles: true });
    const first = await server.trpc.post.byDay.unstable_ensure({
      day: new Date('2026-01-01'),
    });
    const second = await server.trpc.post.byDay.unstable_ensure({
      day: new Date('2026-01-01'),
    });
    const dehydrated = (handle: object) =>
      (handle as { dehydratedQuery?: unknown }).dehydratedQuery;

    expect(dehydrated(first)).toBeDefined();
    expect(dehydrated(second)).toBe(dehydrated(first));
  });

  test("don't carry failed queries", async () => {
    await using resource = ctx();
    const server = makeServer(resource, { selfHydratingHandles: true });
    server.trpc.post.missing.unstable_prefetch();
    await vi.waitFor(() =>
      expect(
        server.queryClient.getQueryState(server.trpc.post.missing.queryKey())
          ?.status,
      ).toBe('error'),
    );

    const handle = server.trpc.post.missing.unstable_prefetch();
    // prefetch starts a new request for the failed query, so the handle carries that one
    expect(
      (handle as { dehydratedQuery?: { state: { status: string } } })
        .dehydratedQuery?.state.status,
    ).toBe('pending');

    await server.queryClient
      .fetchQuery(server.trpc.post.missing.queryOptions())
      .catch(() => null);
    const ensured = await server.trpc.post.byDay.unstable_ensure({
      day: new Date('2026-01-01'),
    });
    expect(ensured).toHaveProperty('dehydratedQuery');
  });

  test('newer data reaches an observed query after the read', async () => {
    await using resource = ctx();
    const server = makeServer(resource, { selfHydratingHandles: true });
    const browser = makeBrowserQueryClient();
    const browserTrpc = createClientOptionsProxy({
      client: resource.client,
      queryClient: browser,
    });

    const first = await server.trpc.post.byDay.unstable_ensure({
      day: new Date('2026-01-01'),
    });
    const firstOptions = browserTrpc.unstable_fromHandle(first);
    const observer = new QueryObserver(browser, firstOptions);
    const unsubscribe = observer.subscribe(() => {});
    expect(observer.getCurrentResult().data?.version).toBe(1);

    // `router.refresh()`: the server renders again with newer data
    await new Promise((resolve) => setTimeout(resolve, 2));
    const refreshed = await server.trpc.post.byDay.unstable_fetch(
      { day: new Date('2026-01-01') },
      { staleTime: 0 },
    );
    browserTrpc.unstable_fromHandle(refreshed);
    expect(browser.getQueryData(firstOptions.queryKey)?.version).toBe(1);

    await Promise.resolve();
    expect(browser.getQueryData(firstOptions.queryKey)?.version).toBe(2);
    expect(resource.calls).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
});
