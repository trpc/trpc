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

function makeServerProxy(resource: ReturnType<typeof ctx>) {
  const queryClient = makeServerClient();
  const trpc = createTRPCOptionsProxy({
    router: resource.appRouter,
    ctx: {},
    queryClient,
  });
  return { queryClient, trpc };
}

describe('types', () => {
  test('a load gives a handle for every entry and data for fetch and ensure entries', async () => {
    const trpc = {} as TRPC;
    if (Math.random() < 2) return;
    type PostHandle = unstable_inferQueryHandle<TRPC['post']['byId']>;
    type ListHandle = unstable_inferInfiniteQueryHandle<TRPC['post']['list']>;

    const [handles, data] = await trpc.unstable_$loadHandles({
      prefetched: trpc.post.byId.unstable_$prefetchEntry({ id: '1' }),
      fetched: trpc.post.byId.unstable_$fetchEntry({ id: '2' }),
      ensured: trpc.post.byId.unstable_$ensureEntry({ id: '3' }),
      list: trpc.post.list.unstable_$ensureInfiniteEntry({ limit: 2 }),
      viewer: trpc.viewer.unstable_$prefetchEntry(),
    });
    expectTypeOf(handles.prefetched).toEqualTypeOf<PostHandle>();
    expectTypeOf(handles.fetched).toEqualTypeOf<PostHandle>();
    expectTypeOf(handles.ensured).toEqualTypeOf<PostHandle>();
    expectTypeOf(handles.list).toEqualTypeOf<ListHandle>();
    expectTypeOf(handles.viewer).toEqualTypeOf<
      unstable_inferQueryHandle<TRPC['viewer']>
    >();

    expectTypeOf(data).toEqualTypeOf<{
      fetched: { id: string; title: string };
      ensured: { id: string; title: string };
      list: {
        pages: { items: number[]; nextCursor: number }[];
        pageParams: (number | null)[];
      };
    }>();
    // @ts-expect-error a prefetched query may have no data yet
    void data.prefetched;

    // @ts-expect-error the tuple is readonly
    handles[0] = handles;
  });

  test('entries check their input', () => {
    const trpc = {} as TRPC;
    if (Math.random() < 2) return;
    // @ts-expect-error input is required
    trpc.post.byId.unstable_$prefetchEntry();
    // @ts-expect-error input is checked
    trpc.post.byId.unstable_$fetchEntry({ id: 1 });
    trpc.viewer.unstable_$ensureEntry();
    // @ts-expect-error only entries can be loaded
    void trpc.unstable_$loadHandles({ post: { id: '1' } });
  });

  test('handles infer input and output', () => {
    const trpc = {} as TRPC;
    if (Math.random() < 2) return;
    type PostHandle = unstable_inferQueryHandle<TRPC['post']['byId']>;

    expectTypeOf(
      trpc.post.byId.unstable_$waterfallHandle({ id: '1' }),
    ).toEqualTypeOf<PostHandle>();

    function Post(props: { handle: PostHandle }) {
      const t = {} as TRPC;
      const query = useSuspenseQuery(t.unstable_$fromHandle(props.handle));
      expectTypeOf(query.data).toEqualTypeOf<{ id: string; title: string }>();
      expectTypeOf(query.error?.data?.code).toEqualTypeOf<
        TRPC_ERROR_CODE_KEY | undefined
      >();

      const selected = useSuspenseQuery(
        t.unstable_$fromHandle(props.handle, { select: (post) => post.title }),
      );
      expectTypeOf(selected.data).toEqualTypeOf<string>();
      return null;
    }
    void Post;

    // a raw input isn't a handle
    // @ts-expect-error not a handle
    trpc.unstable_$fromHandle({ id: '1' });
    // nor is a query key
    const queryKey = [['post', 'byId'], { input: { id: '1' } }];
    // @ts-expect-error not a handle
    trpc.unstable_$fromHandle({ queryKey });
    // nor is an entry
    // @ts-expect-error not a handle
    trpc.unstable_$fromHandle(trpc.post.byId.unstable_$prefetchEntry({ id }));
  });

  test('infinite handles need getNextPageParam and do not mix with query handles', () => {
    const trpc = {} as TRPC;
    if (Math.random() < 2) return;
    type ListHandle = unstable_inferInfiniteQueryHandle<TRPC['post']['list']>;

    const list = trpc.post.list.unstable_$waterfallInfiniteHandle({ limit: 2 });
    expectTypeOf(list).toEqualTypeOf<ListHandle>();

    const opts = trpc.unstable_$fromHandle(list, {
      getNextPageParam: (last) => last.nextCursor,
    });
    expectTypeOf(opts.queryKey).toMatchTypeOf<readonly unknown[]>();

    // @ts-expect-error infinite handles need options
    trpc.unstable_$fromHandle(list);

    const query: unstable_TRPCQueryHandle<any> =
      trpc.post.byId.unstable_$waterfallHandle({ id: '1' });
    void query;
    // @ts-expect-error an infinite handle isn't a query handle
    const wrong: unstable_inferQueryHandle<TRPC['post']['list']> = list;
    void wrong;
    // @ts-expect-error a query handle isn't an infinite handle
    const wrong2: unstable_TRPCInfiniteQueryHandle<any> =
      trpc.post.byId.unstable_$waterfallHandle({
        id: '1',
      });
    void wrong2;
  });

  test('unstable_$fromHandle and unstable_$loadHandles are on every router level', () => {
    const trpc = {} as TRPC;
    if (Math.random() < 2) return;
    const handle = trpc.post.byId.unstable_$waterfallHandle({ id: '1' });
    expectTypeOf(trpc.post.unstable_$fromHandle(handle)).toEqualTypeOf(
      trpc.unstable_$fromHandle(handle),
    );
    const entries = { post: trpc.post.byId.unstable_$fetchEntry({ id: '1' }) };
    expectTypeOf(trpc.post.unstable_$loadHandles(entries)).toEqualTypeOf(
      trpc.unstable_$loadHandles(entries),
    );
  });

  test('infinite entries only load several pages with getNextPageParam', () => {
    const trpc = {} as TRPC;
    if (Math.random() < 2) return;
    trpc.post.list.unstable_$fetchInfiniteEntry(
      { limit: 2 },
      { pages: 2, getNextPageParam: (last) => last.nextCursor },
    );
    // @ts-expect-error pages needs getNextPageParam
    trpc.post.list.unstable_$fetchInfiniteEntry({ limit: 2 }, { pages: 2 });
    trpc.post.list.unstable_$prefetchInfiniteEntry(
      { limit: 2 },
      { getNextPageParam: (last) => last.nextCursor },
    );
  });

  test('waterfall handles switch to an input of the same procedure', () => {
    const trpc = {} as TRPC;
    if (Math.random() < 2) return;
    const post = trpc.post.byId.unstable_$waterfallHandle({ id: '1' });
    expectTypeOf(
      trpc.post.byId.unstable_$waterfallHandle(post, (input) => {
        expectTypeOf(input).toEqualTypeOf<{ id: string }>();
        return { ...input, id: '2' };
      }),
    ).toEqualTypeOf(post);
    // @ts-expect-error the new input is checked
    trpc.post.byId.unstable_$waterfallHandle(post, () => ({ id: 2 }));

    const list = trpc.post.list.unstable_$waterfallInfiniteHandle({ limit: 2 });
    trpc.post.list.unstable_$waterfallInfiniteHandle(list, (input) => {
      expectTypeOf(input).toEqualTypeOf<{ limit: number }>();
      return { limit: 3 };
    });
  });

  test('handles of same-signature procedures are interchangeable, and that is safe', () => {
    const trpc = {} as TRPC;
    if (Math.random() < 2) return;
    // Same input and output: the read follows the handle's own path, so this
    // can never read the wrong procedure.
    const draft: unstable_inferQueryHandle<TRPC['post']['byId']> =
      trpc.post.draftById.unstable_$waterfallHandle({ id: '1' });
    void draft;
  });
});

declare const id: string;

describe('loading', () => {
  test('entries start nothing until loaded', async () => {
    await using resource = ctx();
    const server = makeServerProxy(resource);
    server.trpc.post.byId.unstable_$prefetchEntry({ id: '1' });
    server.trpc.post.byId.unstable_$fetchEntry({ id: '2' });
    server.trpc.post.list.unstable_$ensureInfiniteEntry({ limit: 2 });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(resource.calls).not.toHaveBeenCalled();
    expect(server.queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  test('starts every entry before it waits for any, whatever the order', async () => {
    await using resource = ctx();
    const server = makeServerProxy(resource);
    const promise = server.trpc.unstable_$loadHandles({
      post: server.trpc.post.byId.unstable_$fetchEntry({ id: '1' }),
      list: server.trpc.post.list.unstable_$prefetchInfiniteEntry({
        limit: 2,
      }),
    });
    // Both are in flight before the load resolves
    expect(server.queryClient.isFetching()).toBe(2);
    const [handles, data] = await promise;
    expect(data).toEqual({ post: { id: '1', title: 'Post 1' } });
    expect(handles).toEqual({
      post: {
        queryKey: [['post', 'byId'], { input: { id: '1' }, type: 'query' }],
        input: { id: '1' },
      },
      list: {
        queryKey: [['post', 'list'], { input: { limit: 2 }, type: 'infinite' }],
        input: { limit: 2 },
      },
    });
  });

  test('resolves without waiting for prefetch entries', async () => {
    await using resource = ctx();
    const server = makeServerProxy(resource);
    const [handles, data] = await server.trpc.unstable_$loadHandles({
      post: server.trpc.post.byId.unstable_$prefetchEntry({ id: '1' }),
    });
    expect(data).toEqual({});
    expect(server.queryClient.isFetching()).toBe(1);
    expect(handles.post.input).toEqual({ id: '1' });
  });

  test('rejects when a fetch or ensure entry fails; prefetch entries never reject', async () => {
    await using resource = ctx();
    const server = makeServerProxy(resource);

    await expect(
      server.trpc.unstable_$loadHandles({
        post: server.trpc.post.byId.unstable_$ensureEntry({ id: 'missing' }),
        list: server.trpc.post.list.unstable_$fetchEntry({ limit: 2 }),
      }),
    ).rejects.toBeInstanceOf(TRPCError);
    await expect(
      server.trpc.unstable_$loadHandles({
        post: server.trpc.post.byId.unstable_$fetchEntry({ id: 'missing' }),
      }),
    ).rejects.toBeInstanceOf(TRPCError);

    const [handles] = await server.trpc.unstable_$loadHandles({
      post: server.trpc.post.byId.unstable_$prefetchEntry({ id: 'missing' }),
    });
    expect(handles.post.input).toEqual({ id: 'missing' });
  });

  test('throws a readable error for a value that is not an entry', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    await expect(
      trpc.unstable_$loadHandles({ post: { id: '1' } as any }),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `[Error: Expected an entry from \`.unstable_$prefetchEntry()\`, \`.unstable_$fetchEntry()\` or \`.unstable_$ensureEntry()\` for "post", got {"id":"1"}]`,
    );
    expect(resource.calls).not.toHaveBeenCalled();
  });

  test('an ensure entry resolves at once with stale data and refetches it from the loader', async () => {
    await using resource = ctx();
    const server = makeServerProxy(resource);
    const queryKey = server.trpc.post.byId.queryKey({ id: '1' });
    server.queryClient.setQueryData(queryKey, { id: '1', title: 'stale' });

    const [, data] = await server.trpc.unstable_$loadHandles({
      post: server.trpc.post.byId.unstable_$ensureEntry({ id: '1' }),
    });
    expect(data.post.title).toBe('stale');
    // No reader has mounted: the load started the refetch
    await vi.waitFor(() =>
      expect(server.queryClient.getQueryData(queryKey)?.title).toBe('Post 1'),
    );
    expect(resource.calls).toHaveBeenCalledTimes(1);
  });

  test('an infinite ensure entry refetches stale pages from the loader', async () => {
    await using resource = ctx();
    const server = makeServerProxy(resource);
    const queryKey = server.trpc.post.list.infiniteQueryKey({ limit: 2 });
    server.queryClient.setQueryData(queryKey, {
      pages: [{ items: [-1], nextCursor: 2 }],
      pageParams: [null],
    });

    const [, data] = await server.trpc.unstable_$loadHandles({
      list: server.trpc.post.list.unstable_$ensureInfiniteEntry({ limit: 2 }),
    });
    expect(data.list.pages[0]?.items).toEqual([-1]);
    await vi.waitFor(() =>
      expect(
        server.queryClient.getQueryData(queryKey)?.pages[0]?.items,
      ).toEqual([0, 1]),
    );
  });

  test('a fetch entry waits for stale data to refetch', async () => {
    await using resource = ctx();
    const server = makeServerProxy(resource);
    const queryKey = server.trpc.post.byId.queryKey({ id: '1' });
    server.queryClient.setQueryData(queryKey, { id: '1', title: 'stale' });

    const [, data] = await server.trpc.unstable_$loadHandles({
      post: server.trpc.post.byId.unstable_$fetchEntry({ id: '1' }),
    });
    expect(data.post.title).toBe('Post 1');
    expect(resource.calls).toHaveBeenCalledTimes(1);

    const [, fresh] = await server.trpc.unstable_$loadHandles({
      post: server.trpc.post.byId.unstable_$fetchEntry(
        { id: '1' },
        { staleTime: Infinity },
      ),
    });
    expect(fresh.post.title).toBe('Post 1');
    expect(resource.calls).toHaveBeenCalledTimes(1);
  });

  test('infinite entries can load several pages up front', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const getNextPageParam = (last: { nextCursor: number }) => last.nextCursor;
    const [handles, data] = await trpc.unstable_$loadHandles({
      ensured: trpc.post.list.unstable_$ensureInfiniteEntry(
        { limit: 2 },
        { pages: 2, getNextPageParam },
      ),
      fetched: trpc.post.list.unstable_$fetchInfiniteEntry(
        { limit: 3, cursor: 10 },
        { pages: 2, getNextPageParam },
      ),
    });
    expect(data.ensured.pages.flatMap((page) => page.items)).toEqual([
      0, 1, 2, 3,
    ]);
    expect(data.fetched.pages.flatMap((page) => page.items)).toEqual([
      10, 11, 12, 13,
    ]);
    expect(handles.fetched).toEqual({
      queryKey: [['post', 'list'], { input: { limit: 3 }, type: 'infinite' }],
      input: { limit: 3 },
      initialCursor: 10,
    });
    expect(
      resource.queryClient
        .getQueryData(
          trpc.unstable_$fromHandle(handles.ensured, { getNextPageParam })
            .queryKey,
        )
        ?.pages.flatMap((page) => page.items),
    ).toEqual([0, 1, 2, 3]);
  });

  test('infinite fetch entries refetch every cached page with getNextPageParam', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const getNextPageParam = (last: { nextCursor: number }) => last.nextCursor;
    await trpc.unstable_$loadHandles({
      list: trpc.post.list.unstable_$fetchInfiniteEntry(
        { limit: 2 },
        { pages: 2, getNextPageParam },
      ),
    });
    resource.calls.mockClear();

    await trpc.unstable_$loadHandles({
      list: trpc.post.list.unstable_$fetchInfiniteEntry(
        { limit: 2 },
        { getNextPageParam },
      ),
    });
    expect(
      resource.queryClient
        .getQueryData(trpc.post.list.infiniteQueryKey({ limit: 2 }))
        ?.pages.flatMap((page) => page.items),
    ).toEqual([0, 1, 2, 3]);
    expect(
      resource.calls.mock.calls.map(([, input]) => input.cursor ?? null),
    ).toEqual([null, 2]);
  });

  test("useTRPC() can't load handles", async () => {
    await using resource = ctx();
    let error: unknown;
    function Component() {
      const trpc = resource.useTRPC();
      try {
        void trpc.unstable_$loadHandles({
          post: trpc.post.byId.unstable_$ensureEntry({ id: '1' }),
        });
      } catch (cause) {
        error = cause;
      }
      expect(typeof trpc.unstable_$fromHandle).toBe('function');
      return null;
    }
    resource.renderApp(<Component />);
    expect(error).toMatchInlineSnapshot(
      `[Error: \`unstable_$loadHandles()\` on \`useTRPC()\` waits for its queries, which a render can't. Load handles in a route loader or server component, or build one in a component with \`unstable_$waterfallHandle\` and wait where you read it, with \`useSuspenseQuery\`. See https://trpc.io/docs/client/tanstack-react-query/handles#in-render]`,
    );
    expect(resource.calls).not.toHaveBeenCalled();
  });
});

describe('waterfall handles', () => {
  test('start nothing, and the reader fetches once', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyClient;
    const handle = trpc.post.byId.unstable_$waterfallHandle({ id: '1' });
    expect(handle).toEqual({
      queryKey: [['post', 'byId'], { input: { id: '1' }, type: 'query' }],
      input: { id: '1' },
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(resource.calls).not.toHaveBeenCalled();

    function Post() {
      const t = resource.useTRPC();
      const postQuery = useSuspenseQuery(t.unstable_$fromHandle(handle));
      return <p>title:{postQuery.data.title}</p>;
    }
    const utils = resource.renderApp(
      <React.Suspense fallback="loading">
        <Post />
      </React.Suspense>,
    );
    await vi.waitFor(() =>
      expect(utils.container).toHaveTextContent('title:Post 1'),
    );
    expect(resource.calls).toHaveBeenCalledTimes(1);
  });

  test("switching keeps a loader's handle while the key is the same", async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const [{ post, list }] = await trpc.unstable_$loadHandles({
      post: trpc.post.byId.unstable_$prefetchEntry({ id: '1' }),
      list: trpc.post.list.unstable_$prefetchInfiniteEntry({
        limit: 2,
        cursor: 4,
      }),
    });
    const loaded = overTheWire({ post, list });

    expect(
      trpc.post.byId.unstable_$waterfallHandle(loaded.post, (input) => ({
        ...input,
      })),
    ).toBe(loaded.post);
    expect(
      trpc.post.byId.unstable_$waterfallHandle(loaded.post, () => ({
        id: '2',
      })),
    ).toEqual({
      queryKey: [['post', 'byId'], { input: { id: '2' }, type: 'query' }],
      input: { id: '2' },
    });

    expect(
      trpc.post.list.unstable_$waterfallInfiniteHandle(
        loaded.list,
        (input) => input,
      ),
    ).toBe(loaded.list);
    expect(
      trpc.post.list.unstable_$waterfallInfiniteHandle(loaded.list, () => ({
        limit: 3,
      })),
    ).toEqual({
      queryKey: [['post', 'list'], { input: { limit: 3 }, type: 'infinite' }],
      input: { limit: 3 },
      initialCursor: 4,
    });
  });
});

describe('runtime', () => {
  test('server load -> dehydrate -> hydrate -> read without a refetch', async () => {
    await using resource = ctx();
    const server = makeServerProxy(resource);

    const [handles] = await server.trpc.unstable_$loadHandles({
      handle: server.trpc.post.byId.unstable_$prefetchEntry({ id: '1' }),
      listHandle: server.trpc.post.list.unstable_$prefetchInfiniteEntry({
        limit: 2,
      }),
    });

    await vi.waitFor(() => expect(server.queryClient.isFetching()).toBe(0));
    const state = overTheWire(dehydrate(server.queryClient));
    const props = overTheWire(handles);
    expect(resource.calls).toHaveBeenCalledTimes(2);

    // Browser: a fresh client hydrated from the server's state
    hydrate(resource.queryClient, state);

    function Post(p: {
      handle: unstable_inferQueryHandle<TRPC['post']['byId']>;
    }) {
      const trpc = resource.useTRPC();
      const postQuery = useSuspenseQuery(trpc.unstable_$fromHandle(p.handle));
      return <p>title:{postQuery.data.title}</p>;
    }
    function List(p: {
      handle: unstable_inferInfiniteQueryHandle<TRPC['post']['list']>;
    }) {
      const trpc = resource.useTRPC();
      const listQuery = useSuspenseInfiniteQuery(
        trpc.unstable_$fromHandle(p.handle, {
          getNextPageParam: (last) => last.nextCursor,
        }),
      );
      return (
        <p>
          items:{listQuery.data.pages.flatMap((page) => page.items).join(',')}
        </p>
      );
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
    const handle = trpc.post.byId.unstable_$waterfallHandle({ id: '1' });
    expect(trpc.unstable_$fromHandle(handle).queryKey).toEqual(
      trpc.post.byId.queryOptions({ id: '1' }).queryKey,
    );
    const list = trpc.post.list.unstable_$waterfallInfiniteHandle({ limit: 2 });
    expect(
      trpc.unstable_$fromHandle(list, { getNextPageParam: (l) => l.nextCursor })
        .queryKey,
    ).toEqual(
      trpc.post.list.infiniteQueryOptions(
        { limit: 2 },
        { getNextPageParam: (l) => l.nextCursor },
      ).queryKey,
    );
  });

  test('a server failure is retried in the browser, which reports a typed TRPCClientError', async () => {
    await using resource = ctx();
    const server = makeServerProxy(resource);
    const [handles] = await server.trpc.unstable_$loadHandles({
      post: server.trpc.post.byId.unstable_$prefetchEntry({ id: 'missing' }),
    });
    const handle = overTheWire(handles.post);
    await vi.waitFor(() => expect(server.queryClient.isFetching()).toBe(0));
    // Errors aren't dehydrated by default, so the browser fetches it itself
    hydrate(resource.queryClient, overTheWire(dehydrate(server.queryClient)));

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
      useSuspenseQuery(trpc.unstable_$fromHandle(handle));
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
    const handle = serverTrpc.post.byId.unstable_$waterfallHandle({ id: '1' });
    expect(() =>
      resource.optionsProxyClient.unstable_$fromHandle(handle as any),
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
    const [handles] = await serverTrpc.unstable_$loadHandles({
      post: serverTrpc.post.byId.unstable_$prefetchEntry({ id: '1' }),
    });
    const handle = overTheWire(handles.post);
    await vi.waitFor(() => expect(serverQueryClient.isFetching()).toBe(0));
    hydrate(resource.queryClient, overTheWire(dehydrate(serverQueryClient)));

    const browserTrpc = createTRPCOptionsProxy<AppRouter, { keyPrefix: true }>({
      client: resource.client,
      queryClient: resource.queryClient,
      keyPrefix: 'app',
    });
    const data = await resource.queryClient.ensureQueryData(
      browserTrpc.unstable_$fromHandle(handle),
    );
    expect(data).toEqual({ id: '1', title: 'Post 1' });
    expect(resource.calls).toHaveBeenCalledTimes(1);
  });

  describe('a query dehydrated as pending that rejects later', () => {
    async function setup(id: string) {
      const resource = ctx();
      const server = makeServerProxy(resource);
      const [{ handle }] = await server.trpc.unstable_$loadHandles({
        handle:
          id === 'missing'
            ? server.trpc.post.byId.unstable_$prefetchEntry({ id })
            : server.trpc.flaky.unstable_$prefetchEntry({ id }),
      });
      // Dehydrated while pending: the promise crosses (as Flight does) and rejects later
      const state = dehydrate(server.queryClient);
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
          const readQuery = useSuspenseQuery(read(useTRPC()));
          return <p>data:{JSON.stringify(readQuery.data)}</p>;
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
        trpc.unstable_$fromHandle(t.handle as unstable_TRPCQueryHandle<any>),
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
        trpc.unstable_$fromHandle(t.handle as unstable_TRPCQueryHandle<any>),
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
      const options = browserTrpc.unstable_$fromHandle(
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

  test('handles carry their input', async () => {
    await using resource = ctx();
    const server = makeServerProxy(resource);
    const [{ post, list }] = await server.trpc.unstable_$loadHandles({
      post: server.trpc.post.byId.unstable_$prefetchEntry({ id: '1' }),
      list: server.trpc.post.list.unstable_$prefetchInfiniteEntry({
        limit: 2,
        cursor: 4,
      }),
    });
    expectTypeOf(post.input).toEqualTypeOf<{ id: string }>();
    expect(post.input).toEqual({ id: '1' });
    // A plain tuple with a typed input: no `unknown` and no tag, so router serializability checks accept it
    expectTypeOf(post.queryKey).toEqualTypeOf<
      [path: string[], opts?: { input?: { id: string }; type?: 'query' }]
    >();

    expectTypeOf(list.input).toEqualTypeOf<{ limit: number }>();
    expectTypeOf(list.queryKey).toEqualTypeOf<
      [path: string[], opts?: { input?: { limit: number }; type?: 'infinite' }]
    >();
    expect(list.input).toEqual({ limit: 2 });
    expect(list.initialCursor).toBe(4);

    const props = overTheWire({ post, list });
    expect(props.post.input).toEqual({ id: '1' });
    expect(props.list.input).toEqual({ limit: 2 });
  });

  test('procedures without input', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const [{ viewer }, data] = await trpc.unstable_$loadHandles({
      viewer: trpc.viewer.unstable_$ensureEntry(),
    });
    expect(viewer).toEqual({
      queryKey: [['viewer'], { type: 'query' }],
    });
    expect(data.viewer).toEqual({ name: 'KATT' });
    await expect(
      resource.queryClient.fetchQuery(trpc.unstable_$fromHandle(viewer)),
    ).resolves.toEqual({ name: 'KATT' });
  });

  test('handles of procedures without input have no input key, so Next.js can serialize them', async () => {
    await using resource = ctx();
    const server = resource.optionsProxyServer;
    const client = resource.optionsProxyClient;
    const [loaded] = await server.unstable_$loadHandles({
      prefetch: server.viewer.unstable_$prefetchEntry(),
      ensure: server.viewer.unstable_$ensureEntry(),
      fetch: server.viewer.unstable_$fetchEntry(),
      explicitUndefined: server.viewer.unstable_$prefetchEntry(undefined),
      prefetchInfinite:
        server.viewer.unstable_$prefetchInfiniteEntry(undefined),
      ensureInfinite: server.viewer.unstable_$ensureInfiniteEntry(undefined),
      withInput: server.post.byId.unstable_$ensureEntry({ id: '1' }),
    });
    const handles = {
      ...loaded,
      waterfall: server.viewer.unstable_$waterfallHandle(),
    };

    for (const [key, handle] of Object.entries(handles)) {
      if (key !== 'withInput') {
        expect(Object.keys(handle)).toEqual(['queryKey']);
      }
    }
    expect(handles.withInput.input).toEqual({ id: '1' });
    // `getServerSideProps` and `getStaticProps` reject `undefined` anywhere in props
    expect(overTheWire(handles)).toStrictEqual(handles);

    const read = overTheWire(handles);
    expect(client.unstable_$fromHandle(read.ensure).queryKey).toEqual(
      client.viewer.queryOptions().queryKey,
    );
    expect(client.unstable_$fromHandle(read.withInput).queryKey).toEqual(
      client.post.byId.queryOptions({ id: '1' }).queryKey,
    );
  });
});
