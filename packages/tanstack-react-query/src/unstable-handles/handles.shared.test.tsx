import { testReactResource } from '../../test/__helpers';
import {
  experimental_load,
  experimental_pipelining,
  experimental_settle,
  httpBatchStreamLink,
} from '@trpc/client';
import type { experimental_QueryProcedures, TRPCLink } from '@trpc/client';
import type { AnyRouter } from '@trpc/server';
import { initTRPC } from '@trpc/server';
import { describe, expect, expectTypeOf, test, vi } from 'vitest';
import { z } from 'zod';
import {
  ensureEntry,
  experimental_dataOf,
  experimental_handleOfItem,
  experimental_infiniteQuery,
  experimental_perItem,
  experimental_query,
  fromHandle,
  loadHandles,
  prefetchEntry,
} from '.';
import type {
  experimental_inferHandles,
  experimental_TRPCQueryHandlePerItem,
  TRPCInfiniteQueryHandle,
  TRPCQueryHandle,
} from '.';

function createAppRouter() {
  const t = initTRPC.create();
  const calls = vi.fn();
  const appRouter = t.router({
    post: t.router({
      bySlug: t.procedure
        .input(z.object({ slug: z.string() }))
        .query((opts) => {
          calls('post.bySlug', opts.input);
          return { slug: opts.input.slug, authorId: 'u1' };
        }),
      list: t.procedure
        .input(z.object({ cursor: z.number().nullish() }))
        .query((opts) => {
          calls('post.list', opts.input);
          const cursor = opts.input.cursor ?? 0;
          return {
            items: [
              { slug: `p${cursor}`, authorId: 'u1' },
              { slug: `p${cursor + 1}`, authorId: 'u2' },
            ],
            nextCursor: cursor < 10 ? cursor + 10 : null,
          };
        }),
    }),
    author: t.router({
      byId: t.procedure.input(z.object({ id: z.string() })).query((opts) => {
        calls('author.byId', opts.input);
        return { id: opts.input.id, teamId: `team-${opts.input.id}` };
      }),
    }),
  });
  return { appRouter, calls };
}

type AppRouter = ReturnType<typeof createAppRouter>['appRouter'];

/** One description, for both loaders */
function postPageQueries(
  trpc: experimental_QueryProcedures<AppRouter>,
  opts: { slug: string },
) {
  const post = experimental_query(trpc.post.bySlug, { slug: opts.slug });
  return {
    post,
    author: experimental_query(trpc.author.byId, {
      id: experimental_dataOf(post).authorId,
    }),
  };
}

function setup() {
  const { appRouter, calls } = createAppRouter();
  return Object.assign(testReactResource(appRouter), { calls });
}

function pipeliningSetup() {
  const { appRouter, calls } = createAppRouter();
  /** The paths of each request the batch link sends */
  const requests: string[] = [];
  const record: TRPCLink<AnyRouter> = () => (linkOpts) => {
    requests.push(linkOpts.op.path);
    return linkOpts.next(linkOpts.op);
  };
  const resource = testReactResource(appRouter, {
    server: { experimental_allowPipelining: true },
    client: (opts) => ({
      links: [
        record,
        httpBatchStreamLink({
          url: opts.httpUrl,
          experimental_pipelining: experimental_pipelining(),
        }),
      ],
    }),
  });
  return Object.assign(resource, { calls, requests });
}

describe('a description of queries', () => {
  test('loads in `loadHandles()` as prefetch entries: the load waits only for what a handle needs', async () => {
    await using resource = setup();
    const trpc = resource.optionsProxyServer;

    const [handles, data] = await loadHandles(
      trpc,
      postPageQueries(trpc, { slug: 'a' }),
    );

    // The author's handle has the post's data in its input, so the load
    // waited for the post, as for `prefetchEntry()` read without a callback
    expect(handles.author).toEqual({
      queryKey: [['author', 'byId'], { input: { id: 'u1' }, type: 'query' }],
      input: { id: 'u1' },
    });
    expect(handles.post.input).toEqual({ slug: 'a' });
    expect(data).toEqual({});
    expectTypeOf(handles.post).toEqualTypeOf<
      TRPCQueryHandle<{
        input: { slug: string };
        output: { slug: string; authorId: string };
        transformer: boolean;
        errorShape: any;
        featureFlags: { keyPrefix: false };
      }>
    >();
  });

  test('`wait` waits for an entry, as for an ensure entry, and `data` has it', async () => {
    await using resource = setup();
    const trpc = resource.optionsProxyServer;

    const [handles, data] = await loadHandles(
      trpc,
      postPageQueries(trpc, { slug: 'a' }),
      { wait: ['post'] },
    );

    expect(data.post).toEqual({ slug: 'a', authorId: 'u1' });
    expectTypeOf(data.post).toEqualTypeOf<{
      slug: string;
      authorId: string;
    }>();
    // @ts-expect-error -- not waited for
    void data.author;
    expect(handles.author.input).toEqual({ id: 'u1' });
  });

  test('`wait` makes a prefetch entry an ensure entry', async () => {
    await using resource = setup();
    const trpc = resource.optionsProxyServer;

    const [, data] = await loadHandles(
      trpc,
      { post: prefetchEntry(trpc.post.bySlug, { slug: 'b' }) },
      { wait: ['post'] },
    );

    expect(data.post).toEqual({ slug: 'b', authorId: 'u1' });
  });

  test('`wait` names an entry of one query', async () => {
    await using resource = setup();
    const trpc = resource.optionsProxyServer;
    const post = experimental_query(trpc.post.list, {});

    await expect(
      loadHandles(
        trpc,
        {
          post,
          authors: experimental_perItem(
            experimental_dataOf(post).items,
            (item) =>
              experimental_query(trpc.author.byId, { id: item.authorId }),
          ),
        },
        // @ts-expect-error -- an entry per item isn't one query
        { wait: ['authors'] },
      ),
    ).rejects.toThrow(/`wait` names "authors"/);
  });

  test("an entry built with a callback from the data doesn't make the load wait, and its handle is unfinished", async () => {
    await using resource = setup();
    const trpc = resource.optionsProxyServer;
    const post = experimental_query(trpc.post.bySlug, { slug: 'a' });

    const [handles] = await loadHandles(trpc, {
      post,
      author: experimental_dataOf(post, (it) =>
        experimental_query(trpc.author.byId, { id: it.authorId }),
      ),
    });

    expectTypeOf(handles.author).toMatchTypeOf<
      experimental_TRPCQueryHandlePerItem<
        any,
        { slug: string; authorId: string }
      >
    >();
    const finished = experimental_handleOfItem(handles.author, {
      slug: 'a',
      authorId: 'u1',
    });
    expect(finished.input).toEqual({ id: 'u1' });
    expect(
      await resource.queryClient.fetchQuery(fromHandle(trpc, finished)),
    ).toEqual({ id: 'u1', teamId: 'team-u1' });
  });

  test('an entry per item of a description', async () => {
    await using resource = setup();
    const trpc = resource.optionsProxyServer;
    const posts = experimental_query(trpc.post.list, {});

    const [handles] = await loadHandles(trpc, {
      posts,
      authors: experimental_perItem(experimental_dataOf(posts).items, (post) =>
        experimental_query(trpc.author.byId, { id: post.authorId }),
      ),
    });

    const handle = experimental_handleOfItem(handles.authors, {
      slug: 'p1',
      authorId: 'u2',
    });
    expect(
      await resource.queryClient.fetchQuery(fromHandle(trpc, handle)),
    ).toEqual({ id: 'u2', teamId: 'team-u2' });
  });

  test('an entry per item that returns an object loads as a group of entries per item, and `null` skips', async () => {
    await using resource = setup();
    const trpc = resource.optionsProxyServer;
    const posts = experimental_query(trpc.post.list, {});
    const isAdmin = false as boolean;

    const [handles] = await loadHandles(trpc, {
      posts,
      rows: experimental_perItem(experimental_dataOf(posts).items, (post) => ({
        author: experimental_query(trpc.author.byId, { id: post.authorId }),
        none: null,
      })),
      draft: isAdmin
        ? experimental_query(trpc.post.bySlug, { slug: 'd' })
        : null,
    });

    expect(handles.draft).toBeUndefined();
    expect(handles.rows.none).toBeUndefined();
    const author = experimental_handleOfItem(handles.rows.author, {
      slug: 'p0',
      authorId: 'u1',
    });
    expect(author.input).toEqual({ id: 'u1' });
  });

  test('an entry per item of a list in an item loads with the client only', async () => {
    await using resource = setup();
    const trpc = resource.optionsProxyServer;
    const posts = experimental_query(trpc.post.list, {});

    await expect(
      loadHandles(trpc, {
        posts,
        rows: experimental_perItem(experimental_dataOf(posts).items, () => ({
          authors: experimental_perItem(
            experimental_dataOf(posts).items,
            (post) =>
              experimental_query(trpc.author.byId, { id: post.authorId }),
          ),
        })),
      }),
    ).rejects.toThrow(/not of a list in an item/);
  });

  test('an infinite query of a description is an infinite entry, with its `getNextPageParam`', async () => {
    await using resource = setup();
    const trpc = resource.optionsProxyServer;

    const [handles] = await loadHandles(
      trpc,
      {
        posts: experimental_infiniteQuery(
          trpc.post.list,
          {},
          { getNextPageParam: (page) => page.nextCursor },
        ),
      },
      { wait: ['posts'] },
    );

    expectTypeOf(handles.posts).toMatchTypeOf<TRPCInfiniteQueryHandle<any>>();
    const query = resource.queryClient.getQueryCache().find({
      queryKey: handles.posts.queryKey,
    });
    expect(query?.state.data).toMatchObject({
      pages: [{ nextCursor: 10 }],
      pageParams: [undefined],
    });
  });

  test('the same description loads with the client: as promises, in one request', async () => {
    await using resource = pipeliningSetup();

    const res = experimental_load(
      resource.client,
      postPageQueries(resource.client, { slug: 'a' }),
    );

    expect(await experimental_settle(res)).toEqual({
      post: { slug: 'a', authorId: 'u1' },
      author: { id: 'u1', teamId: 'team-u1' },
    });
    // The links see an operation for each query, and the author goes in the
    // post's request
    expect(resource.requests).toEqual(['post.bySlug', 'author.byId']);
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(1);
  });

  test('and with `loadHandles()`, in one request too', async () => {
    await using resource = pipeliningSetup();
    const trpc = resource.optionsProxyClient;

    const [handles] = await loadHandles(
      trpc,
      postPageQueries(trpc, { slug: 'a' }),
    );

    expect(handles.author.input).toEqual({ id: 'u1' });
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(1);
  });

  test('a TanStack Query entry loads with the client too', async () => {
    await using resource = pipeliningSetup();
    const trpc = resource.optionsProxyClient;
    const post = ensureEntry(trpc.post.bySlug, { slug: 'c' });

    const res = experimental_load(resource.client, {
      post,
      author: experimental_query(resource.client.author.byId, {
        id: experimental_dataOf(post).authorId,
      }),
    });

    expect(await res.author).toEqual({ id: 'u1', teamId: 'team-u1' });
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(1);
  });

  test('`experimental_inferHandles` types the handles of a description', () => {
    type Handles = experimental_inferHandles<typeof postPageQueries>;
    expectTypeOf<NonNullable<Handles['author']['input']>>().toEqualTypeOf<{
      id: string;
    }>();
  });
});
