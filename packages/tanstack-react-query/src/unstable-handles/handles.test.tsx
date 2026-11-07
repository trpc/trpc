import { testReactResource } from '../../test/__helpers';
import type { DehydratedState } from '@tanstack/react-query';
import {
  defaultShouldDehydrateQuery,
  dehydrate,
  hydrate,
  InfiniteQueryObserver,
  isCancelledError,
  QueryClient,
  QueryClientProvider,
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { fireEvent, render } from '@testing-library/react';
import { TRPCClientError } from '@trpc/client';
import type { TRPCClientErrorLike } from '@trpc/client';
import { getUntypedClient } from '@trpc/client';
import { initTRPC, TRPCError } from '@trpc/server';
import type { TRPC_ERROR_CODE_KEY } from '@trpc/server';
import { makeAsyncResource } from '@trpc/server/unstable-core-do-not-import';
import * as React from 'react';
import { describe, expect, expectTypeOf, test, vi } from 'vitest';
import { z } from 'zod';
import {
  loadHandles,
  loadHandlesSettled,
  prefetchEntry,
  fetchEntry,
  ensureEntry,
  prefetchInfiniteEntry,
  fetchInfiniteEntry,
  ensureInfiniteEntry,
  fromHandle,
  isTRPCEntryError,
  TRPCEntryError,
} from '.';
import type {
  AnyTRPCHandle,
  TRPCQueryHandle,
  TRPCInfiniteQueryHandle,
  inferQueryHandle,
  inferInfiniteQueryHandle,
} from '.';
import type { TRPCOptionsProxy } from '..';
import { createTRPCContext, createTRPCOptionsProxy } from '..';

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
    slow: t.procedure.query(
      () => new Promise<string>((resolve) => setTimeout(resolve, 50, 'slow')),
    ),
    flaky: t.procedure.input(z.object({ id: z.string() })).query((opts) => {
      calls('flaky', opts.input);
      if (calls.mock.calls.filter(([path]) => path === 'flaky').length === 1) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      }
      return { id: opts.input.id };
    }),
    flakyList: t.procedure
      .input(z.object({ cursor: z.number().nullish() }))
      .query((opts) => {
        calls('flakyList', opts.input);
        if (
          calls.mock.calls.filter(([path]) => path === 'flakyList').length === 1
        ) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        }
        const start = opts.input.cursor ?? 0;
        return { items: [start, start + 1], nextCursor: start + 2 };
      }),
  });
  const resource = testReactResource(appRouter);
  return {
    ...resource,
    calls,
    appRouter,
  };
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
  test('loadHandlesSettled gives a result for every fetch and ensure entry', async () => {
    const trpc = {} as TRPC;
    if (Math.random() < 2) return;
    const [handles, results] = await loadHandlesSettled(trpc, {
      post: ensureEntry(trpc.post.byId, { id: '1' }),
      list: fetchInfiniteEntry(trpc.post.list, { limit: 2 }),
      prefetched: prefetchEntry(trpc.viewer),
    });
    expectTypeOf(handles.post).toEqualTypeOf<
      inferQueryHandle<TRPC['post']['byId']>
    >();
    expectTypeOf(handles.prefetched).toEqualTypeOf<
      inferQueryHandle<TRPC['viewer']>
    >();
    expectTypeOf<keyof typeof results>().toEqualTypeOf<'post' | 'list'>();
    // @ts-expect-error a prefetch entry has no result: it isn't waited for
    void results.prefetched;

    if (results.post.status === 'error') {
      expectTypeOf(results.post.error.code).toEqualTypeOf<
        TRPC_ERROR_CODE_KEY | undefined
      >();
      expectTypeOf(results.post.error.cause).toEqualTypeOf<
        TRPCClientErrorLike<AppRouter> | TRPCError
      >();
      // @ts-expect-error a failed entry has no data
      void results.post.data;
    } else {
      expectTypeOf(results.post.data).toEqualTypeOf<{
        id: string;
        title: string;
      }>();
    }
    if (results.list.status === 'success') {
      expectTypeOf(results.list.data.pages[0]!.items).toEqualTypeOf<number[]>();
    }
  });

  test('isTRPCEntryError narrows to the error of the procedure it matches', async () => {
    const trpc = {} as TRPC;
    if (Math.random() < 2) return;
    const [handles] = await loadHandles(trpc, {
      post: ensureEntry(trpc.post.byId, { id: '1' }),
    }).catch((error: unknown) => {
      // @ts-expect-error a rejection is `unknown` until it's narrowed
      void error.cause;
      if (isTRPCEntryError(error, trpc.post.byId)) {
        expectTypeOf(error.key).toEqualTypeOf<string>();
        expectTypeOf(error.path).toEqualTypeOf<string>();
        expectTypeOf(error.code).toEqualTypeOf<
          TRPC_ERROR_CODE_KEY | undefined
        >();
        expectTypeOf(error.cause).toEqualTypeOf<
          TRPCClientErrorLike<AppRouter> | TRPCError
        >();
      }
      if (isTRPCEntryError(error)) {
        expectTypeOf(error.cause).toExtend<
          TRPCClientErrorLike<any> | TRPCError
        >();
      }
      throw error;
    });
    expectTypeOf(handles.post).toEqualTypeOf<
      inferQueryHandle<TRPC['post']['byId']>
    >();
  });

  test('a load gives a handle for every entry and data for fetch and ensure entries', async () => {
    const trpc = {} as TRPC;
    if (Math.random() < 2) return;
    type PostHandle = inferQueryHandle<TRPC['post']['byId']>;
    type ListHandle = inferInfiniteQueryHandle<TRPC['post']['list']>;

    const loaded = await loadHandles(trpc, {
      prefetched: prefetchEntry(trpc.post.byId, { id: '1' }),
      fetched: fetchEntry(trpc.post.byId, { id: '2' }),
      ensured: ensureEntry(trpc.post.byId, { id: '3' }),
      list: ensureInfiniteEntry(trpc.post.list, { limit: 2 }),
      fetchedList: fetchInfiniteEntry(trpc.post.list, { limit: 3 }),
      prefetchedList: prefetchInfiniteEntry(trpc.post.list, { limit: 4 }),
      viewer: prefetchEntry(trpc.viewer),
    });
    const [handles, data] = loaded;
    expectTypeOf(handles.prefetched).toEqualTypeOf<PostHandle>();
    expectTypeOf(handles.fetched).toEqualTypeOf<PostHandle>();
    expectTypeOf(handles.ensured).toEqualTypeOf<PostHandle>();
    expectTypeOf(handles.list).toEqualTypeOf<ListHandle>();
    expectTypeOf(handles.viewer).toEqualTypeOf<
      inferQueryHandle<TRPC['viewer']>
    >();

    expectTypeOf(data).toEqualTypeOf<{
      fetched: { id: string; title: string };
      ensured: { id: string; title: string };
      list: {
        pages: { items: number[]; nextCursor: number }[];
        pageParams: (number | null)[];
      };
      fetchedList: {
        pages: { items: number[]; nextCursor: number }[];
        pageParams: (number | null)[];
      };
    }>();
    // @ts-expect-error a prefetched query may have no data yet
    void data.prefetched;
    // @ts-expect-error nor a prefetched infinite query
    void data.prefetchedList;
    expectTypeOf<keyof typeof data>().toEqualTypeOf<
      'fetched' | 'ensured' | 'list' | 'fetchedList'
    >();

    // @ts-expect-error the tuple is readonly
    loaded[0] = handles;
  });

  test('entries check their input', () => {
    const trpc = {} as TRPC;
    if (Math.random() < 2) return;
    // @ts-expect-error input is required
    prefetchEntry(trpc.post.byId);
    // @ts-expect-error input is checked
    fetchEntry(trpc.post.byId, { id: 1 });
    ensureEntry(trpc.viewer);
    // @ts-expect-error only entries can be loaded
    void loadHandles(trpc, { post: { id: '1' } });
  });

  test('handles infer input and output', async () => {
    const trpc = {} as TRPC;
    if (Math.random() < 2) return;
    type PostHandle = inferQueryHandle<TRPC['post']['byId']>;

    const [handles] = await loadHandles(trpc, {
      post: prefetchEntry(trpc.post.byId, { id: '1' }),
    });
    expectTypeOf(handles.post).toEqualTypeOf<PostHandle>();

    function Post(props: { handle: PostHandle }) {
      const t = {} as TRPC;
      const query = useSuspenseQuery(fromHandle(t, props.handle));
      expectTypeOf(query.data).toEqualTypeOf<{ id: string; title: string }>();
      expectTypeOf(query.error?.data?.code).toEqualTypeOf<
        TRPC_ERROR_CODE_KEY | undefined
      >();

      const selected = useSuspenseQuery(
        fromHandle(t, props.handle, { select: (post) => post.title }),
      );
      expectTypeOf(selected.data).toEqualTypeOf<string>();
      return null;
    }
    void Post;

    // a raw input isn't a handle
    // @ts-expect-error not a handle
    fromHandle(trpc, { id: '1' });
    // nor is a query key
    const queryKey = [['post', 'byId'], { input: { id: '1' } }];
    // @ts-expect-error not a handle
    fromHandle(trpc, { queryKey });
    // nor is an entry
    // @ts-expect-error not a handle
    fromHandle(trpc, prefetchEntry(trpc.post.byId, { id }));
  });

  test('infinite handles need getNextPageParam and do not mix with query handles', async () => {
    const trpc = {} as TRPC;
    if (Math.random() < 2) return;
    type ListHandle = inferInfiniteQueryHandle<TRPC['post']['list']>;

    const [{ list }] = await loadHandles(trpc, {
      list: prefetchInfiniteEntry(trpc.post.list, { limit: 2 }),
    });
    expectTypeOf(list).toEqualTypeOf<ListHandle>();

    const opts = fromHandle(trpc, list, {
      getNextPageParam: (last) => last.nextCursor,
    });
    expectTypeOf(opts.queryKey).toMatchTypeOf<readonly unknown[]>();

    // @ts-expect-error infinite handles need options
    fromHandle(trpc, list);

    const post = {} as inferQueryHandle<TRPC['post']['byId']>;
    const query: TRPCQueryHandle<any> = post;
    void query;
    // @ts-expect-error an infinite handle isn't a query handle
    const wrong: inferQueryHandle<TRPC['post']['list']> = list;
    void wrong;
    // @ts-expect-error a query handle isn't an infinite handle
    const wrong2: TRPCInfiniteQueryHandle<any> = post;
    void wrong2;
  });

  test('fromHandle takes any router level, loadHandles a router', () => {
    const trpc = {} as TRPC;
    if (Math.random() < 2) return;
    const handle = {} as inferQueryHandle<TRPC['post']['byId']>;
    expectTypeOf(fromHandle(trpc.post, handle)).toEqualTypeOf(
      fromHandle(trpc, handle),
    );
    const entries = { post: fetchEntry(trpc.post.byId, { id: '1' }) };
    void loadHandles(trpc, entries);
    // @ts-expect-error entries take a procedure
    void prefetchEntry(trpc.post, { id: '1' });
    // @ts-expect-error infinite entries take a procedure with a cursor input
    void prefetchInfiniteEntry(trpc.post.byId, { id: '1' });
  });

  test('useTRPC() and createTRPCOptionsProxy load handles and build entries', () => {
    const { useTRPC } = createTRPCContext<AppRouter>();
    if (Math.random() < 2) return;
    const plain = createTRPCOptionsProxy<AppRouter>({
      router: {} as AppRouter,
      ctx: {},
      queryClient: new QueryClient(),
    });
    void loadHandles(plain, {
      post: prefetchEntry(plain.post.byId, { id: '1' }),
    });
    const trpc = useTRPC();
    void loadHandlesSettled(trpc, {
      post: ensureEntry(trpc.post.byId, { id: '1' }),
      list: ensureInfiniteEntry(trpc.post.list, { limit: 2 }),
    });

    void fromHandle(trpc, {} as inferQueryHandle<TRPC['post']['byId']>);
  });

  test('a handle is not a proxy', () => {
    if (Math.random() < 2) return;
    const handle = {} as inferQueryHandle<TRPC['post']['byId']>;
    // @ts-expect-error loadHandles takes the proxy
    void loadHandles(handle, {});
    // @ts-expect-error entries take a procedure
    void prefetchEntry(handle, { id: '1' });
    // @ts-expect-error fromHandle takes the proxy
    void fromHandle(handle, handle);
  });

  test('infinite entries only load several pages with getNextPageParam', () => {
    const trpc = {} as TRPC;
    if (Math.random() < 2) return;
    fetchInfiniteEntry(
      trpc.post.list,
      { limit: 2 },
      { pages: 2, getNextPageParam: (last) => last.nextCursor },
    );
    // @ts-expect-error pages needs getNextPageParam
    fetchInfiniteEntry(trpc.post.list, { limit: 2 }, { pages: 2 });
    prefetchInfiniteEntry(
      trpc.post.list,
      { limit: 2 },
      { getNextPageParam: (last) => last.nextCursor },
    );
  });

  test('handles of same-signature procedures are interchangeable, and that is safe', () => {
    const trpc = {} as TRPC;
    if (Math.random() < 2) return;
    // Same input and output: the read follows the handle's own path, so this
    // can never read the wrong procedure.
    const draft: inferQueryHandle<TRPC['post']['byId']> =
      {} as inferQueryHandle<TRPC['post']['draftById']>;
    void draft;
  });
});

declare const id: string;

describe('loading', () => {
  test('entries start nothing until loaded', async () => {
    await using resource = ctx();
    const server = makeServerProxy(resource);
    prefetchEntry(server.trpc.post.byId, { id: '1' });
    fetchEntry(server.trpc.post.byId, { id: '2' });
    ensureInfiniteEntry(server.trpc.post.list, { limit: 2 });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(resource.calls).not.toHaveBeenCalled();
    expect(server.queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  test('starts every entry before it waits for any, whatever the order', async () => {
    await using resource = ctx();
    const server = makeServerProxy(resource);
    const promise = loadHandles(server.trpc, {
      post: fetchEntry(server.trpc.post.byId, { id: '1' }),
      list: prefetchInfiniteEntry(server.trpc.post.list, {
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
    const [handles, data] = await loadHandles(server.trpc, {
      post: prefetchEntry(server.trpc.post.byId, { id: '1' }),
    });
    expect(data).toEqual({});
    expect(server.queryClient.isFetching()).toBe(1);
    expect(handles.post.input).toEqual({ id: '1' });
  });

  test('rejects when a fetch or ensure entry fails; prefetch entries never reject', async () => {
    await using resource = ctx();
    const server = makeServerProxy(resource);

    await expect(
      loadHandles(server.trpc, {
        post: ensureEntry(server.trpc.post.byId, { id: 'missing' }),
        list: fetchEntry(server.trpc.post.list, { limit: 2 }),
      }),
    ).rejects.toBeInstanceOf(TRPCEntryError);
    await expect(
      loadHandles(server.trpc, {
        post: fetchEntry(server.trpc.post.byId, { id: 'missing' }),
      }),
    ).rejects.toBeInstanceOf(TRPCEntryError);

    const [handles] = await loadHandles(server.trpc, {
      post: prefetchEntry(server.trpc.post.byId, { id: 'missing' }),
    });
    expect(handles.post.input).toEqual({ id: 'missing' });
  });

  test('a failed entry says which entry failed, and keeps the TRPCError on the server proxy', async () => {
    await using resource = ctx();
    const server = makeServerProxy(resource);

    const error = await loadHandles(server.trpc, {
      list: ensureInfiniteEntry(server.trpc.post.list, { limit: 2 }),
      missingPost: ensureEntry(server.trpc.post.byId, { id: 'missing' }),
    }).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(TRPCEntryError);
    expect(error).toMatchObject({
      key: 'missingPost',
      path: 'post.byId',
      code: 'NOT_FOUND',
    });
    expect(String(error)).toMatchInlineSnapshot(
      `"TRPCEntryError: Entry "missingPost" (post.byId) failed: NOT_FOUND"`,
    );
    expect((error as TRPCEntryError).cause).toBeInstanceOf(TRPCError);
    expect(isTRPCEntryError(error)).toBe(true);
    expect(isTRPCEntryError(error, server.trpc.post.byId)).toBe(true);
    expect(isTRPCEntryError(error, server.trpc.post.list)).toBe(false);
    expect(isTRPCEntryError(new Error('nope'), server.trpc.post.byId)).toBe(
      false,
    );
    expect(isTRPCEntryError(null)).toBe(false);
  });

  test('a failed entry keeps the TRPCClientError on a client-backed proxy', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyClient;

    const error = await loadHandles(trpc, {
      post: fetchEntry(trpc.post.byId, { id: 'missing' }),
    }).catch((cause: unknown) => cause);

    expect(error).toMatchObject({
      key: 'post',
      path: 'post.byId',
      code: 'NOT_FOUND',
    });
    expect((error as TRPCEntryError).cause).toBeInstanceOf(TRPCClientError);
    expect(isTRPCEntryError(error, trpc.post.byId)).toBe(true);
  });

  test('keeps an entry named __proto__ as its own key', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const [handles, data] = await loadHandles(trpc, {
      ['__proto__']: ensureEntry(trpc.post.byId, { id: '1' }),
    });
    expect(Object.keys(handles)).toEqual(['__proto__']);
    expect(Object.keys(data)).toEqual(['__proto__']);
  });

  test('JavaScript callers get a readable error for a router level loadHandles or fromHandle cannot take', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const [{ handle }] = await loadHandles(trpc, {
      handle: prefetchEntry(trpc.post.byId, { id: '1' }),
    });
    expect(() =>
      fromHandle(trpc.viewer as any, handle),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: \`fromHandle(trpc.viewer, handle)\` got a handle for \`post.byId\`, which isn't in \`viewer\`. Pass the root proxy, \`trpc\`]`,
    );
    const post: any = trpc.post;
    expect(() => loadHandles(post, {})).toThrowErrorMatchingInlineSnapshot(
      `[Error: \`loadHandles()\` takes the root proxy, \`trpc\`, got \`trpc.post\`]`,
    );
    expect(() =>
      loadHandlesSettled(post, {}),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: \`loadHandlesSettled()\` takes the root proxy, \`trpc\`, got \`trpc.post\`]`,
    );
  });

  test('loadHandlesSettled waits for every entry, and resolves failures as results', async () => {
    await using resource = ctx();
    const server = makeServerProxy(resource);

    const [handles, results] = await loadHandlesSettled(server.trpc, {
      missingPost: ensureEntry(server.trpc.post.byId, { id: 'missing' }),
      slow: fetchEntry(server.trpc.slow),
      comments: prefetchEntry(server.trpc.post.byId, { id: 'missing' }),
    });
    expect(results.slow).toEqual({ status: 'success', data: 'slow' });
    expect(results.missingPost.status).toBe('error');
    const failed = results.missingPost as Extract<
      typeof results.missingPost,
      { status: 'error' }
    >;
    expect(failed.error).toBeInstanceOf(TRPCEntryError);
    expect(failed.error).toMatchObject({
      key: 'missingPost',
      path: 'post.byId',
      code: 'NOT_FOUND',
    });
    expect(Object.keys(results)).toEqual(['missingPost', 'slow']);
    expect(Object.keys(handles)).toEqual(['missingPost', 'slow', 'comments']);
    expect(handles.missingPost.input).toEqual({ id: 'missing' });
  });

  test('loadHandlesSettled rejects for a cancelled query, as loadHandles does', async () => {
    await using resource = ctx();
    const server = makeServerProxy(resource);

    for (const load of [loadHandles, loadHandlesSettled]) {
      const loading = load(server.trpc, {
        slow: ensureEntry(server.trpc.slow),
      });
      await server.queryClient.cancelQueries();
      await expect(loading).rejects.toSatisfy(isCancelledError);
    }
  });

  test('JavaScript callers get a readable error for a value that is not a proxy', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const [{ handle }] = await loadHandles(trpc, {
      handle: prefetchEntry(trpc.post.byId, { id: '1' }),
    });
    expect(() =>
      fromHandle({} as any, handle),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: \`fromHandle()\` expects a tRPC options proxy or one of its procedures, got [object Object]]`,
    );
    expect(() =>
      prefetchEntry(null as any, { id: '1' }),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: \`prefetchEntry()\` expects a tRPC options proxy or one of its procedures, got null]`,
    );
  });

  test('throws a readable error for a value that is not an entry', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    await expect(
      loadHandles(trpc, { post: { id: '1' } as any }),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `[Error: Expected an entry from \`prefetchEntry()\`, \`fetchEntry()\` or \`ensureEntry()\` for "post", got {"id":"1"}]`,
    );
    expect(resource.calls).not.toHaveBeenCalled();
  });

  test("rejects an entry built with another QueryClient's proxy", async () => {
    await using resource = ctx();
    const a = makeServerProxy(resource);
    const b = makeServerProxy(resource);
    await expect(
      loadHandles(a.trpc, {
        post: prefetchEntry(b.trpc.post.byId, { id: '1' }),
      }),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `[Error: The entry for "post" was built with a proxy for another QueryClient than the root proxy that loads it]`,
    );
    expect(resource.calls).not.toHaveBeenCalled();
    expect(a.queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  test('an ensure entry resolves at once with stale data and refetches it from the loader', async () => {
    await using resource = ctx();
    const server = makeServerProxy(resource);
    const queryKey = server.trpc.post.byId.queryKey({ id: '1' });
    server.queryClient.setQueryData(queryKey, { id: '1', title: 'stale' });

    const [, data] = await loadHandles(server.trpc, {
      post: ensureEntry(server.trpc.post.byId, { id: '1' }),
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

    const [, data] = await loadHandles(server.trpc, {
      list: ensureInfiniteEntry(server.trpc.post.list, { limit: 2 }),
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

    const [, data] = await loadHandles(server.trpc, {
      post: fetchEntry(server.trpc.post.byId, { id: '1' }),
    });
    expect(data.post.title).toBe('Post 1');
    expect(resource.calls).toHaveBeenCalledTimes(1);

    const [, fresh] = await loadHandles(server.trpc, {
      post: fetchEntry(
        server.trpc.post.byId,
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
    const [handles, data] = await loadHandles(trpc, {
      ensured: ensureInfiniteEntry(
        trpc.post.list,
        { limit: 2 },
        { pages: 2, getNextPageParam },
      ),
      fetched: fetchInfiniteEntry(
        trpc.post.list,
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
          fromHandle(trpc, handles.ensured, { getNextPageParam }).queryKey,
        )
        ?.pages.flatMap((page) => page.items),
    ).toEqual([0, 1, 2, 3]);
  });

  test('infinite fetch entries refetch every cached page with getNextPageParam', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const getNextPageParam = (last: { nextCursor: number }) => last.nextCursor;
    await loadHandles(trpc, {
      list: fetchInfiniteEntry(
        trpc.post.list,
        { limit: 2 },
        { pages: 2, getNextPageParam },
      ),
    });
    resource.calls.mockClear();

    await loadHandles(trpc, {
      list: fetchInfiniteEntry(
        trpc.post.list,
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

  test('useTRPC() loads handles in an event handler', async () => {
    await using resource = ctx();
    const loads: Promise<unknown>[] = [];
    function Component() {
      const trpc = resource.useTRPC();
      return (
        <button
          onMouseEnter={() => {
            loads.push(
              loadHandles(trpc, {
                post: ensureEntry(trpc.post.byId, { id: '1' }),
              }),
            );
          }}
        >
          post
        </button>
      );
    }
    const utils = resource.renderApp(<Component />);
    expect(resource.calls).not.toHaveBeenCalled();

    fireEvent.mouseEnter(utils.getByText('post'));
    expect(await Promise.all(loads)).toEqual([
      [
        {
          post: {
            queryKey: [['post', 'byId'], { input: { id: '1' }, type: 'query' }],
            input: { id: '1' },
          },
        },
        { post: { id: '1', title: 'Post 1' } },
      ],
    ]);
    expect(resource.calls).toHaveBeenCalledTimes(1);
  });

  test('JavaScript callers get a readable error for a procedure or a handle in place of the root proxy', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    expect(() =>
      loadHandles(trpc.post.byId as any, {}),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: \`loadHandles()\` takes the root proxy, \`trpc\`, got \`trpc.post.byId\`]`,
    );
    const [{ handle }] = await loadHandles(trpc, {
      handle: prefetchEntry(trpc.post.byId, { id: '1' }),
    });
    expect(() =>
      loadHandles(handle as any, {}),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: \`loadHandles()\` expects a tRPC options proxy or one of its procedures, got a handle for \`post.byId\`]`,
    );
  });
});

describe('runtime', () => {
  test('server load -> dehydrate -> hydrate -> read without a refetch', async () => {
    await using resource = ctx();
    const server = makeServerProxy(resource);

    const [handles] = await loadHandles(server.trpc, {
      handle: prefetchEntry(server.trpc.post.byId, { id: '1' }),
      listHandle: prefetchInfiniteEntry(server.trpc.post.list, {
        limit: 2,
      }),
    });

    await vi.waitFor(() => expect(server.queryClient.isFetching()).toBe(0));
    const state = overTheWire(dehydrate(server.queryClient));
    const props = overTheWire(handles);
    expect(resource.calls).toHaveBeenCalledTimes(2);

    // Browser: a fresh client hydrated from the server's state
    hydrate(resource.queryClient, state);

    function Post(p: { handle: inferQueryHandle<TRPC['post']['byId']> }) {
      const trpc = resource.useTRPC();
      const postQuery = useSuspenseQuery(fromHandle(trpc, p.handle));
      return <p>title:{postQuery.data.title}</p>;
    }
    function List(p: {
      handle: inferInfiniteQueryHandle<TRPC['post']['list']>;
    }) {
      const trpc = resource.useTRPC();
      const listQuery = useSuspenseInfiniteQuery(
        fromHandle(trpc, p.handle, {
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
    const [{ handle, list }] = await loadHandles(trpc, {
      handle: prefetchEntry(trpc.post.byId, { id: '1' }),
      list: prefetchInfiniteEntry(trpc.post.list, { limit: 2 }),
    });
    expect(fromHandle(trpc, handle).queryKey).toEqual(
      trpc.post.byId.queryOptions({ id: '1' }).queryKey,
    );
    expect(
      fromHandle(trpc, list, { getNextPageParam: (l) => l.nextCursor })
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
    const [handles] = await loadHandles(server.trpc, {
      post: prefetchEntry(server.trpc.post.byId, { id: 'missing' }),
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
      useSuspenseQuery(fromHandle(trpc, handle));
      return null;
    }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
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
    const [{ handle }] = await loadHandles(serverTrpc, {
      handle: prefetchEntry(serverTrpc.post.byId, { id: '1' }),
    });
    expect(() =>
      fromHandle(resource.optionsProxyClient, handle as any),
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
    const [handles] = await loadHandles(serverTrpc, {
      post: prefetchEntry(serverTrpc.post.byId, { id: '1' }),
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
      fromHandle(browserTrpc, handle),
    );
    expect(data).toEqual({ id: '1', title: 'Post 1' });
    expect(resource.calls).toHaveBeenCalledTimes(1);
  });

  describe('a query dehydrated as pending that rejects later', () => {
    async function setup(failure: 'missing' | 'flaky' | 'flakyList') {
      const resource = ctx();
      const server = makeServerProxy(resource);
      const entries = {
        missing: () => prefetchEntry(server.trpc.post.byId, { id: 'missing' }),
        flaky: () => prefetchEntry(server.trpc.flaky, { id: '1' }),
        flakyList: () => prefetchInfiniteEntry(server.trpc.flakyList, {}),
      };
      let handle: AnyTRPCHandle;
      let state: DehydratedState;
      try {
        [{ handle }] = await loadHandles(server.trpc, {
          handle: entries[failure](),
        });
        // Dehydrated while pending: the promise crosses (as Flight does) and rejects later
        state = dehydrate(server.queryClient);
        expect(state.queries[0]?.state.status).toBe('pending');
      } catch (cause) {
        await using _resource = resource;
        throw cause;
      }

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
      function renderRead(read: (trpc: TRPCOptionsProxy<AppRouter>) => any) {
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
      return makeAsyncResource(
        {
          resource,
          handle,
          browser,
          hydrateBrowser: (s: DehydratedState) => hydrate(browser, s),
          state,
          renderRead,
          caught: () => caught,
        },
        async () => {
          await using _resource = resource;
        },
      );
    }

    test('is refetched once by a handle read, even with retry: false', async () => {
      const spy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      await using t = await setup('flaky');
      t.hydrateBrowser(t.state);
      const utils = t.renderRead((trpc) =>
        fromHandle(trpc, t.handle as TRPCQueryHandle<any>),
      );
      await vi.waitFor(() =>
        expect(utils.container).toHaveTextContent('data:{"id":"1"}'),
      );
      // once on the server, once from the browser
      expect(t.resource.calls).toHaveBeenCalledTimes(2);
      spy.mockRestore();
    });

    test('an infinite query is refetched as pages', async () => {
      const spy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      await using t = await setup('flakyList');
      t.hydrateBrowser(t.state);
      const browserTrpc = createTRPCOptionsProxy<AppRouter>({
        client: t.resource.client,
        queryClient: t.browser,
      });
      const options = fromHandle(
        browserTrpc,
        t.handle as inferInfiniteQueryHandle<TRPC['flakyList']>,
        { getNextPageParam: (last) => last.nextCursor },
      );
      await vi.waitFor(() =>
        expect(t.browser.getQueryData(options.queryKey)).toEqual({
          pages: [{ items: [0, 1], nextCursor: 2 }],
          pageParams: [undefined],
        }),
      );
      const observer = new InfiniteQueryObserver(t.browser, options);
      const next = await observer.fetchNextPage();
      expect(next.data?.pages.map((page) => page.items)).toEqual([
        [0, 1],
        [2, 3],
      ]);
      spy.mockRestore();
    });

    test('reports a typed TRPCClientError instead of a redacted error', async () => {
      const spy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      await using t = await setup('missing');
      t.hydrateBrowser(t.state);
      const utils = t.renderRead((trpc) =>
        fromHandle(trpc, t.handle as TRPCQueryHandle<any>),
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
      const spy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      t.hydrateBrowser(t.state);
      const browserTrpc = createTRPCOptionsProxy<AppRouter>({
        client: t.resource.client,
        queryClient: t.browser,
      });
      const options = fromHandle(browserTrpc, t.handle as TRPCQueryHandle<any>);
      await t.browser.cancelQueries({ queryKey: options.queryKey });
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(t.browser.isFetching()).toBe(0);
      expect(t.resource.calls).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });

    test('a disabled read is not refetched', async () => {
      await using t = await setup('flaky');
      t.hydrateBrowser(t.state);
      const browserTrpc = createTRPCOptionsProxy<AppRouter>({
        client: t.resource.client,
        queryClient: t.browser,
      });
      const options = fromHandle(
        browserTrpc,
        t.handle as inferQueryHandle<TRPC['flaky']>,
        { enabled: false },
      );
      await vi.waitFor(() =>
        expect(t.browser.getQueryState(options.queryKey)?.status).toBe('error'),
      );
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(t.browser.isFetching()).toBe(0);
      expect(t.resource.calls).toHaveBeenCalledTimes(1);
    });

    test('a queryOptions(input) read is left alone', async () => {
      const spy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
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
    const [{ post, list }] = await loadHandles(server.trpc, {
      post: prefetchEntry(server.trpc.post.byId, { id: '1' }),
      list: prefetchInfiniteEntry(server.trpc.post.list, {
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
    const [{ viewer }, data] = await loadHandles(trpc, {
      viewer: ensureEntry(trpc.viewer),
    });
    expect(viewer).toEqual({
      queryKey: [['viewer'], { type: 'query' }],
    });
    expect(data.viewer).toEqual({ name: 'KATT' });
    await expect(
      resource.queryClient.fetchQuery(fromHandle(trpc, viewer)),
    ).resolves.toEqual({ name: 'KATT' });
  });

  test('handles of procedures without input have no input key, so Next.js can serialize them', async () => {
    await using resource = ctx();
    const server = resource.optionsProxyServer;
    const client = resource.optionsProxyClient;
    const [handles] = await loadHandles(server, {
      prefetch: prefetchEntry(server.viewer),
      ensure: ensureEntry(server.viewer),
      fetch: fetchEntry(server.viewer),
      explicitUndefined: prefetchEntry(server.viewer, undefined),
      prefetchInfinite: prefetchInfiniteEntry(server.viewer, undefined),
      ensureInfinite: ensureInfiniteEntry(server.viewer, undefined),
      withInput: ensureEntry(server.post.byId, { id: '1' }),
    });

    for (const [key, handle] of Object.entries(handles)) {
      if (key !== 'withInput') {
        expect(Object.keys(handle)).toEqual(['queryKey']);
      }
    }
    expect(handles.withInput.input).toEqual({ id: '1' });
    // `getServerSideProps` and `getStaticProps` reject `undefined` anywhere in props
    expect(overTheWire(handles)).toStrictEqual(handles);

    const read = overTheWire(handles);
    expect(fromHandle(client, read.ensure).queryKey).toEqual(
      client.viewer.queryOptions().queryKey,
    );
    expect(fromHandle(client, read.withInput).queryKey).toEqual(
      client.post.byId.queryOptions({ id: '1' }).queryKey,
    );
  });
});
