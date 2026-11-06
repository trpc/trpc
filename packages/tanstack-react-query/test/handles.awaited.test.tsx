import { testReactResource } from './__helpers';
import {
  dehydrate,
  hydrate,
  QueryClient,
  useInfiniteQuery,
  useQuery,
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { initTRPC } from '@trpc/server';
import * as React from 'react';
import { describe, expect, expectTypeOf, test, vi } from 'vitest';
import { z } from 'zod';
import type { TRPCOptionsProxy } from '../src';
import { createTRPCOptionsProxy } from '../src';
import {
  loadHandles,
  prefetchEntry,
  fetchEntry,
  ensureEntry,
  prefetchInfiniteEntry,
  fetchInfiniteEntry,
  ensureInfiniteEntry,
  waterfallHandle,
  waterfallInfiniteHandle,
  fromHandle,
} from '../src/unstable-handles';
import type {
  TRPCLoaderOptionsProxy,
  inferQueryHandle,
  inferInfiniteQueryHandle,
} from '../src/unstable-handles';

const ctx = () => {
  const t = initTRPC.create();
  const calls = vi.fn();
  const appRouter = t.router({
    post: t.router({
      byId: t.procedure.input(z.object({ id: z.string() })).query((opts) => {
        calls('post.byId', opts.input);
        return {
          id: opts.input.id,
          title: `Post ${opts.input.id}, call ${calls.mock.calls.length}`,
        };
      }),
      list: t.procedure
        .input(z.object({ cursor: z.number().nullish(), limit: z.number() }))
        .query((opts) => {
          calls('post.list', opts.input);
          const start = opts.input.cursor ?? 0;
          return { items: [start, start + 1], nextCursor: start + 2 };
        }),
    }),
  });
  return { ...testReactResource(appRouter), calls, appRouter };
};

type AppRouter = ReturnType<typeof ctx>['appRouter'];
type TRPC = TRPCLoaderOptionsProxy<AppRouter>;
type Post = { id: string; title: string };
type ListPage = { items: number[]; nextCursor: number };

function overTheWire<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

/** A server-side proxy on its own query client, like a loader or a server component */
function serverProxy(resource: ReturnType<typeof ctx>) {
  const queryClient = new QueryClient();
  const trpc = createTRPCOptionsProxy({
    router: resource.appRouter,
    ctx: {},
    queryClient,
  });
  return { queryClient, trpc };
}

describe('types', () => {
  test('every entry gives the same handle, with no data', async () => {
    const trpc = {} as TRPC;
    if (Math.random() < 2) return;
    type PostHandle = inferQueryHandle<TRPC['post']['byId']>;
    type ListHandle = inferInfiniteQueryHandle<TRPC['post']['list']>;

    const [handles] = await loadHandles(trpc, {
      ensured: ensureEntry(trpc.post.byId, { id: '1' }),
      fetched: fetchEntry(trpc.post.byId, { id: '1' }),
      ensuredList: ensureInfiniteEntry(trpc.post.list, { limit: 2 }),
      fetchedList: fetchInfiniteEntry(trpc.post.list, { limit: 2 }),
    });
    expectTypeOf(handles.ensured).toEqualTypeOf<PostHandle>();
    expectTypeOf(handles.fetched).toEqualTypeOf<PostHandle>();
    expectTypeOf(handles.ensuredList).toEqualTypeOf<ListHandle>();
    expectTypeOf(handles.fetchedList).toEqualTypeOf<ListHandle>();
    expectTypeOf<
      'data' extends keyof PostHandle ? true : false
    >().toEqualTypeOf<false>();
    expectTypeOf<
      'data' extends keyof ListHandle ? true : false
    >().toEqualTypeOf<false>();
  });

  test('useQuery data is possibly undefined and useSuspenseQuery data is defined, for every entry', async () => {
    const trpc = {} as TRPC;
    if (Math.random() < 2) return;
    const [loaded] = await loadHandles(trpc, {
      prefetched: prefetchEntry(trpc.post.byId, { id: '1' }),
      ensured: ensureEntry(trpc.post.byId, { id: '1' }),
      fetched: fetchEntry(trpc.post.byId, { id: '1' }),
      prefetchedList: prefetchInfiniteEntry(trpc.post.list, {
        limit: 2,
      }),
      ensuredList: ensureInfiniteEntry(trpc.post.list, { limit: 2 }),
      fetchedList: fetchInfiniteEntry(trpc.post.list, { limit: 2 }),
    });
    const handles = [
      loaded.prefetched,
      loaded.ensured,
      loaded.fetched,
      waterfallHandle(trpc.post.byId, { id: '1' }),
    ];
    for (const handle of handles) {
      expectTypeOf(useQuery(fromHandle(trpc, handle)).data).toEqualTypeOf<
        Post | undefined
      >();
      expectTypeOf(
        useQuery(fromHandle(trpc, handle, { select: (post) => post.title }))
          .data,
      ).toEqualTypeOf<string | undefined>();
      expectTypeOf(
        useSuspenseQuery(fromHandle(trpc, handle)).data,
      ).toEqualTypeOf<Post>();
    }

    const listHandles = [
      loaded.prefetchedList,
      loaded.ensuredList,
      loaded.fetchedList,
      waterfallInfiniteHandle(trpc.post.list, { limit: 2 }),
    ];
    const getNextPageParam = (last: ListPage) => last.nextCursor;
    for (const handle of listHandles) {
      expectTypeOf(
        useInfiniteQuery(fromHandle(trpc, handle, { getNextPageParam })).data
          ?.pages,
      ).toEqualTypeOf<ListPage[] | undefined>();
      expectTypeOf(
        useSuspenseInfiniteQuery(fromHandle(trpc, handle, { getNextPageParam }))
          .data.pages,
      ).toEqualTypeOf<ListPage[]>();
    }
  });

  test("placeholderData doesn't widen data", () => {
    const trpc = {} as TRPC;
    if (Math.random() < 2) return;
    const post = waterfallHandle(trpc.post.byId, { id: '1' });

    const postQuery = useQuery(
      fromHandle(trpc, post, {
        placeholderData: { id: '1', title: 'x' },
      }),
    );
    expectTypeOf(postQuery.data).toEqualTypeOf<Post | undefined>();

    // @ts-expect-error `extra` isn't in the procedure's output
    fromHandle(trpc, post, {
      placeholderData: { id: '1', title: 'x', extra: 1 },
    });
  });

  test('only loadHandles and waterfallHandle create handles', () => {
    const trpc = {} as TRPC;
    if (Math.random() < 2) return;
    const handBuilt = {
      queryKey: [['post', 'byId'], { input: { id: '1' }, type: 'query' }] as [
        string[],
        { input: { id: string }; type: 'query' },
      ],
      input: { id: '1' },
    };
    // @ts-expect-error a hand-built object isn't a handle
    fromHandle(trpc, handBuilt);
    // @ts-expect-error nor can it be passed as one
    const prop: inferQueryHandle<TRPC['post']['byId']> = handBuilt;
    void prop;
  });
});

describe('runtime', () => {
  test('fetch and ensure entries resolve once the cache has the data, with only the key and input', async () => {
    await using resource = ctx();
    const server = serverProxy(resource);

    const [{ ensured, fetched, list, fetchedList }] = await loadHandles(
      server.trpc,
      {
        ensured: ensureEntry(server.trpc.post.byId, { id: '1' }),
        fetched: fetchEntry(server.trpc.post.byId, { id: '2' }),
        list: ensureInfiniteEntry(
          server.trpc.post.list,
          { limit: 2 },
          { pages: 2, getNextPageParam: (last) => last.nextCursor },
        ),
        fetchedList: fetchInfiniteEntry(server.trpc.post.list, {
          limit: 3,
          cursor: 10,
        }),
      },
    );
    expect(ensured).toEqual({
      queryKey: [['post', 'byId'], { input: { id: '1' }, type: 'query' }],
      input: { id: '1' },
    });
    expect(overTheWire(ensured)).toEqual(ensured);
    expect(
      server.queryClient.getQueryData(
        server.trpc.post.byId.queryKey({ id: '1' }),
      ),
    ).toEqual({ id: '1', title: 'Post 1, call 1' });

    expect(fetched).toEqual({
      queryKey: [['post', 'byId'], { input: { id: '2' }, type: 'query' }],
      input: { id: '2' },
    });

    expect(list).toEqual({
      queryKey: [['post', 'list'], { input: { limit: 2 }, type: 'infinite' }],
      input: { limit: 2 },
    });
    expect(
      server.queryClient.getQueryData(
        server.trpc.post.list.infiniteQueryKey({ limit: 2 }),
      )?.pages,
    ).toHaveLength(2);

    expect(fetchedList).toEqual({
      queryKey: [['post', 'list'], { input: { limit: 3 }, type: 'infinite' }],
      input: { limit: 3 },
      initialCursor: 10,
    });
  });

  test("a clear() doesn't bring the loader's data back to a useQuery reader", async () => {
    await using resource = ctx();
    const server = serverProxy(resource);
    const [handles] = await loadHandles(server.trpc, {
      post: ensureEntry(server.trpc.post.byId, { id: '1' }),
    });
    const post = overTheWire(handles.post);
    hydrate(resource.queryClient, dehydrate(server.queryClient));

    const renders: (string | undefined)[] = [];
    function Post(_props: { render: number }) {
      const trpc = resource.useTRPC();
      const postQuery = useQuery(
        fromHandle(trpc, post, { staleTime: Infinity }),
      );
      renders.push(postQuery.data?.title);
      return <p>{postQuery.data?.title ?? 'no data'}</p>;
    }
    const utils = resource.renderApp(<Post render={1} />);
    expect(utils.container).toHaveTextContent('Post 1, call 1');

    const rendersBeforeClear = renders.length;
    resource.queryClient.clear();
    resource.rerenderApp(utils, <Post render={2} />);
    await vi.waitFor(() =>
      expect(utils.container).toHaveTextContent('Post 1, call 2'),
    );
    const rendersAfterClear = renders.slice(rendersBeforeClear);
    expect(rendersAfterClear[0]).toBeUndefined();
    expect(rendersAfterClear).not.toContain('Post 1, call 1');
  });

  test('after a clear(), a useSuspenseQuery reader suspends and fetches again', async () => {
    await using resource = ctx();
    const server = serverProxy(resource);
    const [handles] = await loadHandles(server.trpc, {
      post: ensureEntry(server.trpc.post.byId, { id: '1' }),
    });
    const post = overTheWire(handles.post);
    hydrate(resource.queryClient, dehydrate(server.queryClient));

    function Post(_props: { render: number }) {
      const trpc = resource.useTRPC();
      const postQuery = useSuspenseQuery(
        fromHandle(trpc, post, { staleTime: Infinity }),
      );
      return <p>{postQuery.data.title}</p>;
    }
    const app = (render: number) => (
      <React.Suspense fallback={<p>loading</p>}>
        <Post render={render} />
      </React.Suspense>
    );
    const utils = resource.renderApp(app(1));
    expect(utils.container).toHaveTextContent('Post 1, call 1');

    resource.queryClient.clear();
    resource.rerenderApp(utils, app(2));
    await vi.waitFor(() =>
      expect(utils.container).toHaveTextContent('Post 1, call 2'),
    );
  });

  test('a prefetched handle read with useQuery starts without data', async () => {
    await using resource = ctx();
    const server = serverProxy(resource);
    const [handles] = await loadHandles(server.trpc, {
      post: prefetchEntry(server.trpc.post.byId, { id: '1' }),
    });
    const post = overTheWire(handles.post);
    const renders: (string | undefined)[] = [];
    function Post() {
      const trpc = resource.useTRPC();
      const postQuery = useQuery(fromHandle(trpc, post));
      renders.push(postQuery.data?.title);
      return <p>{postQuery.data?.title ?? 'loading'}</p>;
    }
    const utils = resource.renderApp(<Post />);
    expect(renders[0]).toBeUndefined();
    await vi.waitFor(() => expect(utils.container).toHaveTextContent('Post 1'));
  });

  test('tests can build a handle from fixture data without calling the procedure', async () => {
    await using resource = ctx();
    const queryClient = new QueryClient();
    const trpc = createTRPCOptionsProxy({
      router: resource.appRouter,
      ctx: {},
      queryClient,
    });
    queryClient.setQueryData(trpc.post.byId.queryKey({ id: '1' }), {
      id: '1',
      title: 'Fixture',
    });
    const [{ post }] = await loadHandles(trpc, {
      post: ensureEntry(trpc.post.byId, { id: '1' }, { staleTime: Infinity }),
    });
    expect(queryClient.getQueryData(fromHandle(trpc, post).queryKey)).toEqual({
      id: '1',
      title: 'Fixture',
    });
    expect(resource.calls).not.toHaveBeenCalled();
  });
});
