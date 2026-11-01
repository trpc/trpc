import { testReactResource } from './__helpers';
import { QueryClient, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { initTRPC } from '@trpc/server';
import * as React from 'react';
import { describe, expect, expectTypeOf, test, vi } from 'vitest';
import { z } from 'zod';
import type {
  TRPCOptionsProxy,
  unstable_inferQueryHandle,
  unstable_inferQueryHandleWithData,
} from '../src';
import { createTRPCOptionsProxy } from '../src';

const ctx = () => {
  const t = initTRPC.create();
  const calls = vi.fn();
  const appRouter = t.router({
    post: t.router({
      byId: t.procedure.input(z.object({ id: z.string() })).query((opts) => {
        calls('post.byId', opts.input);
        return { id: opts.input.id, title: `Post ${opts.input.id}` };
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
type TRPC = TRPCOptionsProxy<AppRouter>;

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
  test('handles with data give useQuery defined data', () => {
    const trpc = {} as TRPC;
    if (Math.random() < 2) return;
    type Post = { id: string; title: string };

    function WithData(props: {
      post: unstable_inferQueryHandleWithData<TRPC['post']['byId']>;
    }) {
      const postQuery = useQuery(trpc.unstable_$fromHandle(props.post));
      expectTypeOf(postQuery.data).toEqualTypeOf<Post>();

      const titleQuery = useQuery(
        trpc.unstable_$fromHandle(props.post, { select: (post) => post.title }),
      );
      expectTypeOf(titleQuery.data).toEqualTypeOf<string>();

      return null;
    }
    void WithData;

    function WithoutData(props: {
      post: unstable_inferQueryHandle<TRPC['post']['byId']>;
    }) {
      const postQuery = useQuery(trpc.unstable_$fromHandle(props.post));
      expectTypeOf(postQuery.data).toEqualTypeOf<Post | undefined>();
      return null;
    }
    void WithoutData;
  });

  test('infinite handles with data give useInfiniteQuery defined pages', async () => {
    const trpc = {} as TRPC;
    if (Math.random() < 2) return;
    const list = await trpc.post.list.unstable_$ensureInfinite({ limit: 2 });
    expectTypeOf(list.data.pages).toEqualTypeOf<
      { items: number[]; nextCursor: number }[]
    >();
    expectTypeOf(list.data.pageParams).toEqualTypeOf<(number | null)[]>();

    const listQuery = useInfiniteQuery(
      trpc.unstable_$fromHandle(list, {
        getNextPageParam: (last) => last.nextCursor,
      }),
    );
    expectTypeOf(listQuery.data.pages).toEqualTypeOf<
      { items: number[]; nextCursor: number }[]
    >();

    const prefetched = trpc.post.list.unstable_$prefetchInfinite({ limit: 2 });
    const prefetchedQuery = useInfiniteQuery(
      trpc.unstable_$fromHandle(prefetched, {
        getNextPageParam: (last) => last.nextCursor,
      }),
    );
    expectTypeOf(prefetchedQuery.data?.pages).toEqualTypeOf<
      { items: number[]; nextCursor: number }[] | undefined
    >();
  });

  test("placeholderData and initialData don't widen data", () => {
    const trpc = {} as TRPC;
    if (Math.random() < 2) return;
    const post = trpc.post.byId.unstable_$prefetch({ id: '1' });

    const postQuery = useQuery(
      trpc.unstable_$fromHandle(post, {
        placeholderData: { id: '1', title: 'x' },
      }),
    );
    expectTypeOf(postQuery.data).toEqualTypeOf<
      { id: string; title: string } | undefined
    >();

    // @ts-expect-error `extra` isn't in the procedure's output
    trpc.unstable_$fromHandle(post, {
      placeholderData: { id: '1', title: 'x', extra: 1 },
    });
  });

  test('only the handle verbs create handles', () => {
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
    trpc.unstable_$fromHandle(handBuilt);
    // @ts-expect-error nor can it be passed as one
    const prop: unstable_inferQueryHandle<TRPC['post']['byId']> = handBuilt;
    void prop;
  });
});

describe('runtime', () => {
  test('$ensure and $fetch handles carry the data and when it was fetched', async () => {
    await using resource = ctx();
    const server = serverProxy(resource);

    const ensured = await server.trpc.post.byId.unstable_$ensure({ id: '1' });
    const state = server.queryClient.getQueryState(
      server.trpc.post.byId.queryKey({ id: '1' }),
    );
    expect(ensured).toEqual({
      queryKey: [['post', 'byId'], { input: { id: '1' }, type: 'query' }],
      input: { id: '1' },
      data: { id: '1', title: 'Post 1' },
      dataUpdatedAt: state?.dataUpdatedAt,
    });
    expect(overTheWire(ensured)).toEqual(ensured);

    const fetched = await server.trpc.post.byId.unstable_$fetch({ id: '2' });
    expect(fetched.data).toEqual({ id: '2', title: 'Post 2' });

    // A $prefetch handle stays data-less
    const prefetched = server.trpc.post.byId.unstable_$prefetch({ id: '3' });
    expect('data' in prefetched).toBe(false);
  });

  test('infinite handles carry pages and pageParams', async () => {
    await using resource = ctx();
    const server = serverProxy(resource);
    const list = await server.trpc.post.list.unstable_$ensureInfinite(
      { limit: 2 },
      { pages: 2, getNextPageParam: (last) => last.nextCursor },
    );
    expect(list.data).toEqual({
      pages: [
        { items: [0, 1], nextCursor: 2 },
        { items: [2, 3], nextCursor: 4 },
      ],
      pageParams: [undefined, 2],
    });
    const fetched = await server.trpc.post.list.unstable_$fetchInfinite({
      limit: 3,
      cursor: 10,
    });
    expect(fetched.data.pageParams).toEqual([10]);
  });

  test('with an empty cache, the handle data renders at once and keeps its staleness', async () => {
    await using resource = ctx();
    const server = serverProxy(resource);
    const fresh = overTheWire(
      await server.trpc.post.byId.unstable_$ensure({ id: '1' }),
    );
    const old = overTheWire({
      ...(await server.trpc.post.byId.unstable_$ensure({ id: '2' })),
      dataUpdatedAt: Date.now() - 120_000,
    });
    expect(resource.calls).toHaveBeenCalledTimes(2);

    const renders: (string | undefined)[] = [];
    function Post(props: {
      post: unstable_inferQueryHandleWithData<TRPC['post']['byId']>;
    }) {
      const trpc = resource.useTRPC();
      const postQuery = useQuery(
        trpc.unstable_$fromHandle(props.post, { staleTime: 60_000 }),
      );
      renders.push(postQuery.data.title);
      return <p>{postQuery.data.title}</p>;
    }

    resource.renderApp(
      <>
        <Post post={fresh} />
        <Post post={old} />
      </>,
    );
    // Both render their data on the first render, with no loading state
    expect(renders.slice(0, 2)).toEqual(['Post 1', 'Post 2']);
    // Only the data older than staleTime is refetched
    await vi.waitFor(() => expect(resource.calls).toHaveBeenCalledTimes(3));
    expect(resource.calls).toHaveBeenLastCalledWith('post.byId', { id: '2' });
  });

  test('data in the cache wins over the handle data', async () => {
    await using resource = ctx();
    const server = serverProxy(resource);
    const post = overTheWire(
      await server.trpc.post.byId.unstable_$ensure({ id: '1' }),
    );
    resource.queryClient.setQueryData(
      resource.optionsProxyClient.post.byId.queryKey({ id: '1' }),
      { id: '1', title: 'Newer' },
    );

    const renders: string[] = [];
    function Post() {
      const trpc = resource.useTRPC();
      const postQuery = useQuery(
        trpc.unstable_$fromHandle(post, { staleTime: Infinity }),
      );
      renders.push(postQuery.data.title);
      return <p>{postQuery.data.title}</p>;
    }
    resource.renderApp(<Post />);
    expect(renders).toEqual(['Newer']);
    expect(resource.calls).toHaveBeenCalledTimes(1);
  });

  test('infinite handle data renders at once with an empty cache', async () => {
    await using resource = ctx();
    const server = serverProxy(resource);
    const list = overTheWire(
      await server.trpc.post.list.unstable_$ensureInfinite({ limit: 2 }),
    );
    function List() {
      const trpc = resource.useTRPC();
      const listQuery = useInfiniteQuery(
        trpc.unstable_$fromHandle(list, {
          getNextPageParam: (last) => last.nextCursor,
          staleTime: Infinity,
        }),
      );
      return (
        <p>
          items:{listQuery.data.pages.flatMap((page) => page.items).join(',')}
        </p>
      );
    }
    const utils = resource.renderApp(<List />);
    expect(utils.container).toHaveTextContent('items:0,1');
    expect(resource.calls).toHaveBeenCalledTimes(1);
  });

  test('a $prefetch handle read with useQuery starts without data', async () => {
    await using resource = ctx();
    const server = serverProxy(resource);
    const post = overTheWire(
      server.trpc.post.byId.unstable_$prefetch({ id: '1' }),
    );
    const renders: (string | undefined)[] = [];
    function Post() {
      const trpc = resource.useTRPC();
      const postQuery = useQuery(trpc.unstable_$fromHandle(post));
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
    const post = await trpc.post.byId.unstable_$ensure(
      { id: '1' },
      { staleTime: Infinity },
    );
    expect(post.data.title).toBe('Fixture');
    expect(resource.calls).not.toHaveBeenCalled();
  });
});
