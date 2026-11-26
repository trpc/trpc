import { testReactResource } from '../../test/__helpers';
import {
  experimental_infiniteQuery,
  experimental_load,
  experimental_pipelining,
  experimental_query,
  experimental_settle,
  httpBatchStreamLink,
} from '@trpc/client';
import type { TRPCLink } from '@trpc/client';
import type { AnyRouter } from '@trpc/server';
import { initTRPC } from '@trpc/server';
import { describe, expect, expectTypeOf, test, vi } from 'vitest';
import { z } from 'zod';
import {
  ensureEntry,
  experimental_dataOf,
  experimental_handleOfItem,
  experimental_perItem,
  experimental_useHandles,
  fromHandle,
  loadHandles,
  prefetchEntry,
} from '.';
import type {
  experimental_inferHandles,
  experimental_TRPCQueryHandlePerItem,
  inferQueryHandle,
} from '.';
import type { TRPCOptionsProxy } from '..';

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

/**
 * One description, for both loaders: TanStack Query entries, whose verbs say
 * how `loadHandles()` starts each query. `experimental_load()` loads them as
 * it loads any query
 */
function postPageEntries(
  trpc: TRPCOptionsProxy<AppRouter>,
  opts: { slug: string },
) {
  const post = ensureEntry(trpc.post.bySlug, { slug: opts.slug });
  return {
    post,
    author: prefetchEntry(trpc.author.byId, {
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

describe('a description of TanStack Query entries', () => {
  test('loads in `loadHandles()` as its verbs say: `data` has the ensure entry', async () => {
    await using resource = setup();
    const trpc = resource.optionsProxyServer;

    const [handles, data] = await loadHandles(
      trpc,
      postPageEntries(trpc, { slug: 'a' }),
    );

    expect(data).toEqual({ post: { slug: 'a', authorId: 'u1' } });
    expectTypeOf(data).toEqualTypeOf<{
      post: { slug: string; authorId: string };
    }>();
    expect(handles.author).toEqual({
      queryKey: [['author', 'byId'], { input: { id: 'u1' }, type: 'query' }],
      input: { id: 'u1' },
    });
    expectTypeOf(handles.post).toEqualTypeOf<
      inferQueryHandle<typeof trpc.post.bySlug>
    >();
  });

  test('loads with the client as any query: as promises, in one request, whatever its verbs', async () => {
    await using resource = pipeliningSetup();

    const res = experimental_load(
      resource.client,
      postPageEntries(resource.optionsProxyClient, { slug: 'a' }),
    );

    expect(await experimental_settle(res)).toEqual({
      post: { slug: 'a', authorId: 'u1' },
      author: { id: 'u1', teamId: 'team-u1' },
    });
    expectTypeOf(res.post).toEqualTypeOf<
      Promise<{ slug: string; authorId: string }>
    >();
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
      postPageEntries(trpc, { slug: 'a' }),
    );

    expect(handles.author.input).toEqual({ id: 'u1' });
    // The author's query got its data from the post's request: this waits
    // for it, and fetches nothing
    expect(
      await resource.queryClient.fetchQuery({
        ...fromHandle(trpc, handles.author),
        staleTime: Infinity,
      }),
    ).toEqual({ id: 'u1', teamId: 'team-u1' });
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(1);
  });

  test('the client loads a TanStack Query entry next to its own queries', async () => {
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
    type Handles = experimental_inferHandles<typeof postPageEntries>;
    expectTypeOf<NonNullable<Handles['author']['input']>>().toEqualTypeOf<{
      id: string;
    }>();
  });

  test("an entry built with a callback from the data doesn't make the load wait, and its handle is unfinished", async () => {
    await using resource = setup();
    const trpc = resource.optionsProxyServer;
    const post = prefetchEntry(trpc.post.bySlug, { slug: 'a' });

    const [handles] = await loadHandles(trpc, {
      post,
      author: experimental_dataOf(post, (it) =>
        prefetchEntry(trpc.author.byId, { id: it.authorId }),
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

  test('an entry per item that returns an object loads as a group of entries per item, and `null` skips', async () => {
    await using resource = setup();
    const trpc = resource.optionsProxyServer;
    const posts = prefetchEntry(trpc.post.list, {});
    const isAdmin = false as boolean;

    const [handles] = await loadHandles(trpc, {
      posts,
      rows: experimental_perItem(experimental_dataOf(posts).items, (post) => ({
        author: prefetchEntry(trpc.author.byId, { id: post.authorId }),
        none: null,
      })),
      draft: isAdmin ? prefetchEntry(trpc.post.bySlug, { slug: 'd' }) : null,
    });

    expect(handles.draft).toBeUndefined();
    expect(handles.rows.none).toBeUndefined();
    const author = experimental_handleOfItem(handles.rows.author, {
      slug: 'p0',
      authorId: 'u1',
    });
    expect(author.input).toEqual({ id: 'u1' });
    expect(
      await resource.queryClient.fetchQuery(fromHandle(trpc, author)),
    ).toEqual({ id: 'u1', teamId: 'team-u1' });
  });

  test('an entry per item of a list in an item loads with the client only', async () => {
    await using resource = setup();
    const trpc = resource.optionsProxyServer;
    const posts = prefetchEntry(trpc.post.list, {});

    await expect(
      loadHandles(trpc, {
        posts,
        rows: experimental_perItem(experimental_dataOf(posts).items, () => ({
          authors: experimental_perItem(
            experimental_dataOf(posts).items,
            (post) => prefetchEntry(trpc.author.byId, { id: post.authorId }),
          ),
        })),
      }),
    ).rejects.toThrow(/not of a list in an item/);
  });

  test('an entry per item built from the data of another loads with the client only', async () => {
    await using resource = setup();
    const trpc = resource.optionsProxyServer;
    const posts = prefetchEntry(trpc.post.list, {});
    const post = prefetchEntry(trpc.post.bySlug, { slug: 'a' });

    const loading = loadHandles(trpc, {
      posts,
      post,
      authors: experimental_perItem(experimental_dataOf(posts).items, () =>
        experimental_dataOf(post, (it) =>
          prefetchEntry(trpc.author.byId, { id: it.authorId }),
        ),
      ),
    });
    expectTypeOf<Awaited<typeof loading>[0]['authors']>().toBeNever();
    await expect(loading).rejects.toThrow(
      /not an entry built from the data of another/,
    );
    expect(resource.calls).not.toHaveBeenCalledWith('author.byId', {
      id: expect.anything(),
    });
  });
});

describe("a bare query of the client, which says nothing of how it starts, isn't an entry of `loadHandles()`", () => {
  test('at the top level, or in a group', async () => {
    await using resource = setup();
    const trpc = resource.optionsProxyServer;

    await expect(
      loadHandles(trpc, {
        // @ts-expect-error -- a TanStack Query entry says how it starts
        post: experimental_query(trpc.post.bySlug, { slug: 'a' }),
      }),
    ).rejects.toThrow(
      'build the query for "post.bySlug" with `prefetchEntry()`, `ensureEntry()` or `fetchEntry()`',
    );
    await expect(
      loadHandles(trpc, {
        page: {
          // @ts-expect-error -- in a group too
          posts: experimental_infiniteQuery(trpc.post.list, {}),
        },
      }),
    ).rejects.toThrow(
      'build the query for "post.list" with `prefetchInfiniteEntry()`, `ensureInfiniteEntry()` or `fetchInfiniteEntry()`',
    );
    expect(resource.calls).not.toHaveBeenCalled();
  });

  test('in an entry per item, or one built from data', async () => {
    await using resource = setup();
    const trpc = resource.optionsProxyServer;
    const posts = prefetchEntry(trpc.post.list, {});

    await expect(
      loadHandles(trpc, {
        posts,
        // @ts-expect-error -- what an entry per item returns, too
        authors: experimental_perItem(experimental_dataOf(posts).items, (it) =>
          experimental_query(trpc.author.byId, { id: it.authorId }),
        ),
      }),
    ).rejects.toThrow(/"author.byId" with `prefetchEntry\(\)`/);
    await expect(
      loadHandles(trpc, {
        posts,
        // @ts-expect-error -- and what a callback of the data returns
        first: experimental_dataOf(posts, (it) =>
          experimental_query(trpc.author.byId, { id: it.items[0]!.authorId }),
        ),
      }),
    ).rejects.toThrow(/"author.byId" with `prefetchEntry\(\)`/);
    expect(resource.calls).not.toHaveBeenCalled();
  });

  test('`experimental_useHandles()` throws for it', () => {
    const { appRouter } = createAppRouter();
    const resource = testReactResource(appRouter);
    const trpc = resource.optionsProxyServer;
    expect(() =>
      experimental_useHandles(trpc, {
        // @ts-expect-error -- a TanStack Query entry says how it starts
        post: experimental_query(trpc.post.bySlug, { slug: 'a' }),
      }),
    ).toThrow(/with `prefetchEntry\(\)`/);
  });
});
