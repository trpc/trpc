import { testReactResource } from './__helpers';
import type { DehydratedState } from '@tanstack/react-query';
import {
  defaultShouldDehydrateQuery,
  dehydrate,
  hydrate,
  QueryClient,
  QueryClientProvider,
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { TRPCClientError } from '@trpc/client';
import { initTRPC, TRPCError } from '@trpc/server';
import type { TRPC_ERROR_CODE_KEY } from '@trpc/server';
import * as React from 'react';
import { describe, expect, expectTypeOf, test, vi } from 'vitest';
import { z } from 'zod';
import type {
  TRPCOptionsProxy,
  unstable_inferInfiniteQueryHandle,
  unstable_inferQueryHandle,
  unstable_TRPCInfiniteQueryHandle,
  unstable_TRPCQueryHandle,
} from '../src';
import { createTRPCContext, createTRPCOptionsProxy } from '../src';

const ctx = () => {
  const t = initTRPC.create();
  const calls = vi.fn();
  const appRouter = t.router({
    post: t.router({
      byId: t.procedure.input(z.object({ id: z.string() })).query((opts) => {
        calls('post.byId', opts.input);
        if (opts.input.id === 'missing') {
          throw new TRPCError({ code: 'NOT_FOUND' });
        }
        return { id: opts.input.id, title: `Post ${opts.input.id}` };
      }),
      draftById: t.procedure
        .input(z.object({ id: z.string() }))
        .query((opts) => ({
          id: opts.input.id,
          title: `Draft ${opts.input.id}`,
        })),
      list: t.procedure
        .input(z.object({ cursor: z.number().nullish(), limit: z.number() }))
        .query((opts) => {
          calls('post.list', opts.input);
          const start = opts.input.cursor ?? 0;
          return {
            items: [start, start + 1],
            nextCursor: start + 2,
          };
        }),
    }),
    viewer: t.procedure.query(() => ({ name: 'KATT' })),
    flaky: t.procedure.input(z.object({ id: z.string() })).query((opts) => {
      calls('flaky', opts.input);
      if (calls.mock.calls.filter(([path]) => path === 'flaky').length === 1) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      }
      return { id: opts.input.id };
    }),
  });
  return { ...testReactResource(appRouter), calls, appRouter };
};

type AppRouter = ReturnType<typeof ctx>['appRouter'];
type TRPC = TRPCOptionsProxy<AppRouter>;

/** What the server's dehydrated state looks like after crossing the wire */
function overTheWire<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function makeServerClient() {
  return new QueryClient({
    defaultOptions: {
      dehydrate: {
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === 'pending',
      },
    },
  });
}

describe('types', () => {
  test('handles infer input and output', () => {
    const trpc = {} as TRPC;
    if (Math.random() < 2) return;
    type PostHandle = unstable_inferQueryHandle<TRPC['post']['byId']>;

    expectTypeOf(
      trpc.post.byId.unstable_prefetch({ id: '1' }),
    ).toEqualTypeOf<PostHandle>();
    expectTypeOf(trpc.post.byId.unstable_ensure({ id: '1' })).toEqualTypeOf<
      Promise<PostHandle>
    >();
    expectTypeOf(trpc.post.byId.unstable_fetch({ id: '1' })).toEqualTypeOf<
      Promise<PostHandle>
    >();

    // @ts-expect-error input is required
    trpc.post.byId.unstable_prefetch();
    // @ts-expect-error input is checked
    trpc.post.byId.unstable_prefetch({ id: 1 });
    trpc.viewer.unstable_prefetch();

    function Post(props: { handle: PostHandle }) {
      const t = {} as TRPC;
      const query = useSuspenseQuery(t.unstable_fromHandle(props.handle));
      expectTypeOf(query.data).toEqualTypeOf<{ id: string; title: string }>();
      expectTypeOf(query.error?.data?.code).toEqualTypeOf<
        TRPC_ERROR_CODE_KEY | undefined
      >();

      const selected = useSuspenseQuery(
        t.unstable_fromHandle(props.handle, { select: (post) => post.title }),
      );
      expectTypeOf(selected.data).toEqualTypeOf<string>();
      return null;
    }
    void Post;

    // a raw input isn't a handle
    // @ts-expect-error not a handle
    trpc.unstable_fromHandle({ id: '1' });
    // nor is a query key
    const queryKey = [['post', 'byId'], { input: { id: '1' } }];
    // @ts-expect-error not a handle
    trpc.unstable_fromHandle({ queryKey });
  });

  test('infinite handles need getNextPageParam and do not mix with query handles', () => {
    const trpc = {} as TRPC;
    if (Math.random() < 2) return;
    type ListHandle = unstable_inferInfiniteQueryHandle<TRPC['post']['list']>;

    const list = trpc.post.list.unstable_prefetchInfinite({ limit: 2 });
    expectTypeOf(list).toEqualTypeOf<ListHandle>();

    const opts = trpc.unstable_fromHandle(list, {
      getNextPageParam: (last) => last.nextCursor,
    });
    expectTypeOf(opts.queryKey).toMatchTypeOf<readonly unknown[]>();

    // @ts-expect-error infinite handles need options
    trpc.unstable_fromHandle(list);

    const query: unstable_TRPCQueryHandle<any> =
      trpc.post.byId.unstable_prefetch({ id: '1' });
    void query;
    // @ts-expect-error an infinite handle isn't a query handle
    const wrong: unstable_inferQueryHandle<TRPC['post']['list']> = list;
    void wrong;
    // @ts-expect-error a query handle isn't an infinite handle
    const wrong2: unstable_TRPCInfiniteQueryHandle<any> =
      trpc.post.byId.unstable_prefetch({
        id: '1',
      });
    void wrong2;
  });

  test('unstable_fromHandle is on every router level', () => {
    const trpc = {} as TRPC;
    if (Math.random() < 2) return;
    const handle = trpc.post.byId.unstable_prefetch({ id: '1' });
    expectTypeOf(trpc.post.unstable_fromHandle(handle)).toEqualTypeOf(
      trpc.unstable_fromHandle(handle),
    );
  });

  test('infinite verbs only load several pages with getNextPageParam', () => {
    const trpc = {} as TRPC;
    if (Math.random() < 2) return;
    trpc.post.list.unstable_prefetchInfinite(
      { limit: 2 },
      { pages: 2, getNextPageParam: (last) => last.nextCursor },
    );
    // @ts-expect-error pages needs getNextPageParam
    trpc.post.list.unstable_prefetchInfinite({ limit: 2 }, { pages: 2 });
  });

  test('handles of same-signature procedures are interchangeable, and that is safe', () => {
    const trpc = {} as TRPC;
    if (Math.random() < 2) return;
    // Same input and output: the read follows the handle's own path, so this
    // can never read the wrong procedure.
    const draft: unstable_inferQueryHandle<TRPC['post']['byId']> =
      trpc.post.draftById.unstable_prefetch({ id: '1' });
    void draft;
  });
});

describe('runtime', () => {
  test('server prefetch -> dehydrate -> hydrate -> read without a refetch', async () => {
    await using resource = ctx();

    // Server: a request-scoped client and the in-process proxy
    const serverQueryClient = makeServerClient();
    const serverTrpc = createTRPCOptionsProxy({
      router: resource.appRouter,
      ctx: {},
      queryClient: serverQueryClient,
    });

    const handle = serverTrpc.post.byId.unstable_prefetch({ id: '1' });
    const listHandle = serverTrpc.post.list.unstable_prefetchInfinite({
      limit: 2,
    });
    expect(handle).toEqual({
      queryKey: [['post', 'byId'], { input: { id: '1' }, type: 'query' }],
    });
    expect(listHandle).toEqual({
      queryKey: [['post', 'list'], { input: { limit: 2 }, type: 'infinite' }],
    });

    await vi.waitFor(() => expect(serverQueryClient.isFetching()).toBe(0));
    const state = overTheWire(dehydrate(serverQueryClient));
    const props = overTheWire({ handle, listHandle });
    expect(resource.calls).toHaveBeenCalledTimes(2);

    // Browser: a fresh client hydrated from the server's state
    hydrate(resource.queryClient, state);

    function Post(p: {
      handle: unstable_inferQueryHandle<TRPC['post']['byId']>;
    }) {
      const trpc = resource.useTRPC();
      const { data } = useSuspenseQuery(trpc.unstable_fromHandle(p.handle));
      return <p>title:{data.title}</p>;
    }
    function List(p: {
      handle: unstable_inferInfiniteQueryHandle<TRPC['post']['list']>;
    }) {
      const trpc = resource.useTRPC();
      const { data } = useSuspenseInfiniteQuery(
        trpc.unstable_fromHandle(p.handle, {
          getNextPageParam: (last) => last.nextCursor,
        }),
      );
      return <p>items:{data.pages.flatMap((page) => page.items).join(',')}</p>;
    }

    const utils = resource.renderApp(
      <React.Suspense fallback="loading">
        <Post handle={props.handle} />
        <List handle={props.listHandle} />
      </React.Suspense>,
    );
    await vi.waitFor(() => {
      expect(utils.container).toHaveTextContent('title:Post 1');
      expect(utils.container).toHaveTextContent('items:0,1');
    });
    // No browser request: the data came from the server's cache
    expect(resource.calls).toHaveBeenCalledTimes(2);
  });

  test('handle reads share cache entries with queryOptions(input)', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyClient;
    const handle = trpc.post.byId.unstable_prefetch({ id: '1' });
    expect(trpc.unstable_fromHandle(handle).queryKey).toEqual(
      trpc.post.byId.queryOptions({ id: '1' }).queryKey,
    );
    const list = trpc.post.list.unstable_prefetchInfinite({ limit: 2 });
    expect(
      trpc.unstable_fromHandle(list, { getNextPageParam: (l) => l.nextCursor })
        .queryKey,
    ).toEqual(
      trpc.post.list.infiniteQueryOptions(
        { limit: 2 },
        { getNextPageParam: (l) => l.nextCursor },
      ).queryKey,
    );
  });

  test('unstable_ensure waits and rejects; prefetch never throws', async () => {
    await using resource = ctx();
    const serverTrpc = createTRPCOptionsProxy({
      router: resource.appRouter,
      ctx: {},
      queryClient: makeServerClient(),
    });

    const handle = await serverTrpc.post.byId.unstable_ensure({ id: '1' });
    expect(handle.queryKey[1]?.input).toEqual({ id: '1' });

    await expect(
      serverTrpc.post.byId.unstable_ensure({ id: 'missing' }),
    ).rejects.toBeInstanceOf(TRPCError);

    expect(() =>
      serverTrpc.post.byId.unstable_prefetch({ id: 'missing' }),
    ).not.toThrow();
  });

  test('a server failure is retried in the browser, which reports a typed TRPCClientError', async () => {
    await using resource = ctx();
    const serverQueryClient = makeServerClient();
    const serverTrpc = createTRPCOptionsProxy({
      router: resource.appRouter,
      ctx: {},
      queryClient: serverQueryClient,
    });
    const handle = overTheWire(
      serverTrpc.post.byId.unstable_prefetch({ id: 'missing' }),
    );
    await vi.waitFor(() => expect(serverQueryClient.isFetching()).toBe(0));
    // Errors aren't dehydrated by default, so the browser fetches it itself
    hydrate(resource.queryClient, overTheWire(dehydrate(serverQueryClient)));

    const browser = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();
    let caught: unknown;
    class Boundary extends React.Component<{ children: React.ReactNode }> {
      override state = { error: false };
      static getDerivedStateFromError() {
        return { error: true };
      }
      override componentDidCatch(error: unknown) {
        caught = error;
      }
      override render() {
        return this.state.error ? 'errored' : this.props.children;
      }
    }
    function Post() {
      const trpc = useTRPC();
      useSuspenseQuery(trpc.unstable_fromHandle(handle));
      return null;
    }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const utils = render(
      <QueryClientProvider client={browser}>
        <TRPCProvider trpcClient={resource.client} queryClient={browser}>
          <Boundary>
            <React.Suspense fallback="loading">
              <Post />
            </React.Suspense>
          </Boundary>
        </TRPCProvider>
      </QueryClientProvider>,
    );
    await vi.waitFor(() =>
      expect(utils.container).toHaveTextContent('errored'),
    );
    spy.mockRestore();
    expect(caught).toBeInstanceOf(TRPCClientError);
    expect((caught as TRPCClientError<AppRouter>).data?.code).toBe('NOT_FOUND');
  });

  test('a mismatched keyPrefix is a loud error, not a silent cache miss', async () => {
    await using resource = ctx();
    const serverTrpc = createTRPCOptionsProxy<AppRouter, { keyPrefix: true }>({
      router: resource.appRouter,
      ctx: {},
      queryClient: makeServerClient(),
      keyPrefix: 'server',
    });
    const handle = serverTrpc.post.byId.unstable_prefetch({ id: '1' });
    expect(() =>
      resource.optionsProxyClient.unstable_fromHandle(handle as any),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: The handle for "post.byId" was created with keyPrefix "server", but this proxy uses undefined]`,
    );
  });

  test('round trip with the same keyPrefix on both sides', async () => {
    await using resource = ctx();
    const serverQueryClient = makeServerClient();
    const serverTrpc = createTRPCOptionsProxy<AppRouter, { keyPrefix: true }>({
      router: resource.appRouter,
      ctx: {},
      queryClient: serverQueryClient,
      keyPrefix: 'app',
    });
    const handle = overTheWire(
      serverTrpc.post.byId.unstable_prefetch({ id: '1' }),
    );
    await vi.waitFor(() => expect(serverQueryClient.isFetching()).toBe(0));
    hydrate(resource.queryClient, overTheWire(dehydrate(serverQueryClient)));

    const browserTrpc = createTRPCOptionsProxy<AppRouter, { keyPrefix: true }>({
      client: resource.client,
      queryClient: resource.queryClient,
      keyPrefix: 'app',
    });
    const data = await resource.queryClient.ensureQueryData(
      browserTrpc.unstable_fromHandle(handle),
    );
    expect(data).toEqual({ id: '1', title: 'Post 1' });
    expect(resource.calls).toHaveBeenCalledTimes(1);
  });

  describe('a query dehydrated as pending that rejects later', () => {
    async function setup(id: string) {
      const resource = ctx();
      const serverQueryClient = makeServerClient();
      const serverTrpc = createTRPCOptionsProxy({
        router: resource.appRouter,
        ctx: {},
        queryClient: serverQueryClient,
      });
      const handle =
        id === 'missing'
          ? serverTrpc.post.byId.unstable_prefetch({ id })
          : serverTrpc.flaky.unstable_prefetch({ id });
      // Dehydrated while pending: the promise crosses (as Flight does) and rejects later
      const state = dehydrate(serverQueryClient);
      expect(state.queries[0]?.state.status).toBe('pending');

      const browser = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();
      let caught: unknown;
      class Boundary extends React.Component<{ children: React.ReactNode }> {
        override state = { error: false };
        static getDerivedStateFromError() {
          return { error: true };
        }
        override componentDidCatch(error: unknown) {
          caught = error;
        }
        override render() {
          return this.state.error ? 'errored' : this.props.children;
        }
      }
      function renderRead(read: (trpc: TRPC) => any) {
        function Read() {
          const { data } = useSuspenseQuery(read(useTRPC()));
          return <p>data:{JSON.stringify(data)}</p>;
        }
        return render(
          <QueryClientProvider client={browser}>
            <TRPCProvider trpcClient={resource.client} queryClient={browser}>
              <Boundary>
                <React.Suspense fallback="loading">
                  <Read />
                </React.Suspense>
              </Boundary>
            </TRPCProvider>
          </QueryClientProvider>,
        );
      }
      return {
        resource,
        handle,
        browser,
        hydrateBrowser: (s: DehydratedState) => hydrate(browser, s),
        state,
        renderRead,
        caught: () => caught,
        [Symbol.asyncDispose]: () => resource[Symbol.asyncDispose](),
      };
    }

    test('is refetched once by a handle read, even with retry: false', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await using t = await setup('1');
      t.hydrateBrowser(t.state);
      const utils = t.renderRead((trpc) =>
        trpc.unstable_fromHandle(t.handle as unstable_TRPCQueryHandle<any>),
      );
      await vi.waitFor(() =>
        expect(utils.container).toHaveTextContent('data:{"id":"1"}'),
      );
      // once on the server, once from the browser
      expect(t.resource.calls).toHaveBeenCalledTimes(2);
      spy.mockRestore();
    });

    test('reports a typed TRPCClientError instead of a redacted error', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await using t = await setup('missing');
      t.hydrateBrowser(t.state);
      const utils = t.renderRead((trpc) =>
        trpc.unstable_fromHandle(t.handle as unstable_TRPCQueryHandle<any>),
      );
      await vi.waitFor(() =>
        expect(utils.container).toHaveTextContent('errored'),
      );
      expect(t.caught()).toBeInstanceOf(TRPCClientError);
      expect((t.caught() as TRPCClientError<AppRouter>).data?.code).toBe(
        'NOT_FOUND',
      );
      spy.mockRestore();
    });

    test('a cancelled query is not refetched', async () => {
      await using t = await setup('missing');
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      t.hydrateBrowser(t.state);
      const browserTrpc = createTRPCOptionsProxy<AppRouter>({
        client: t.resource.client,
        queryClient: t.browser,
      });
      const options = browserTrpc.unstable_fromHandle(
        t.handle as unstable_TRPCQueryHandle<any>,
      );
      await t.browser.cancelQueries({ queryKey: options.queryKey });
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(t.browser.isFetching()).toBe(0);
      expect(t.resource.calls).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });

    test('a queryOptions(input) read is left alone', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await using t = await setup('missing');
      t.hydrateBrowser(t.state);
      const utils = t.renderRead((trpc) =>
        trpc.post.byId.queryOptions({ id: 'missing' }),
      );
      await vi.waitFor(() =>
        expect(utils.container).toHaveTextContent('errored'),
      );
      expect(t.caught()).not.toBeInstanceOf(TRPCClientError);
      expect(t.resource.calls).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });
  });

  test('unstable_ensure resolves at once with stale data and revalidates', async () => {
    await using resource = ctx();
    const queryClient = makeServerClient();
    const serverTrpc = createTRPCOptionsProxy({
      router: resource.appRouter,
      ctx: {},
      queryClient,
    });
    const queryKey = serverTrpc.post.byId.queryKey({ id: '1' });
    queryClient.setQueryData(queryKey, { id: '1', title: 'stale' });

    const handle = await serverTrpc.post.byId.unstable_ensure({ id: '1' });
    expect(queryClient.getQueryData(handle.queryKey)?.title).toBe('stale');
    await vi.waitFor(() =>
      expect(queryClient.getQueryData(handle.queryKey)?.title).toBe('Post 1'),
    );
    expect(resource.calls).toHaveBeenCalledTimes(1);
  });

  test('unstable_fetch waits for stale data to refetch and rejects', async () => {
    await using resource = ctx();
    const queryClient = makeServerClient();
    const serverTrpc = createTRPCOptionsProxy({
      router: resource.appRouter,
      ctx: {},
      queryClient,
    });
    const queryKey = serverTrpc.post.byId.queryKey({ id: '1' });
    queryClient.setQueryData(queryKey, { id: '1', title: 'stale' });

    const handle = await serverTrpc.post.byId.unstable_fetch({ id: '1' });
    expect(queryClient.getQueryData(handle.queryKey)?.title).toBe('Post 1');
    expect(resource.calls).toHaveBeenCalledTimes(1);

    const fresh = await serverTrpc.post.byId.unstable_fetch(
      { id: '1' },
      { staleTime: Infinity },
    );
    expect(fresh).toEqual(handle);
    expect(resource.calls).toHaveBeenCalledTimes(1);

    await expect(
      serverTrpc.post.byId.unstable_fetch({ id: 'missing' }),
    ).rejects.toBeInstanceOf(TRPCError);
  });

  test('unstable_fetchInfinite loads pages and returns an infinite handle', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const handle = await trpc.post.list.unstable_fetchInfinite(
      { limit: 2 },
      { pages: 2, getNextPageParam: (last) => last.nextCursor },
    );
    expectTypeOf(handle).toEqualTypeOf<
      unstable_inferInfiniteQueryHandle<TRPC['post']['list']>
    >();
    expect(
      resource.queryClient
        .getQueryData(handle.queryKey)
        ?.pages.flatMap((page) => page.items),
    ).toEqual([0, 1, 2, 3]);
  });

  test('procedures without input', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const handle = await trpc.viewer.unstable_ensure();
    expect(handle).toEqual({ queryKey: [['viewer'], { type: 'query' }] });
    await expect(
      resource.queryClient.fetchQuery(trpc.unstable_fromHandle(handle)),
    ).resolves.toEqual({ name: 'KATT' });
  });

  test('infinite verbs can load several pages up front', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const handle = await trpc.post.list.unstable_ensureInfinite(
      { limit: 2 },
      { pages: 2, getNextPageParam: (last) => last.nextCursor },
    );
    expect(
      resource.queryClient
        .getQueryData(handle.queryKey)
        ?.pages.flatMap((page) => page.items),
    ).toEqual([0, 1, 2, 3]);
  });

  test('useTRPC() reads handles but does not start them', async () => {
    await using resource = ctx();
    let error: unknown;
    function Component() {
      const trpc = resource.useTRPC();
      try {
        trpc.post.byId.unstable_prefetch({ id: '1' });
      } catch (cause) {
        error = cause;
      }
      expect(typeof trpc.unstable_fromHandle).toBe('function');
      return null;
    }
    resource.renderApp(<Component />);
    expect(error).toMatchInlineSnapshot(
      `[Error: \`post.byId.unstable_prefetch()\` isn't available on \`useTRPC()\`. Start handles on the server or in a route loader, or use \`queryClient.prefetchQuery(trpc.post.byId.queryOptions(input))\`.]`,
    );
    expect(resource.calls).not.toHaveBeenCalled();
  });
});
