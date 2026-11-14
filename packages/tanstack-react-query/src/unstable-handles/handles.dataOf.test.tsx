import { testReactResource } from '../../test/__helpers';
import {
  hashKey,
  InfiniteQueryObserver,
  skipToken,
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from '@tanstack/react-query';
import {
  experimental_pipelining,
  httpBatchLink,
  httpBatchStreamLink,
  retryLink,
} from '@trpc/client';
import type { Operation, TRPCLink } from '@trpc/client';
import type { AnyRouter } from '@trpc/server';
import { initTRPC, TRPCError } from '@trpc/server';
import type { Observable } from '@trpc/server/observable';
import { observable, share } from '@trpc/server/observable';
import { makeResource } from '@trpc/server/unstable-core-do-not-import';
import * as React from 'react';
import { describe, expect, expectTypeOf, test, vi } from 'vitest';
import { z } from 'zod';
import {
  experimental_dataOf,
  ensureEntry,
  experimental_entryPerItem,
  ensureInfiniteEntry,
  fetchEntry,
  fromHandle,
  experimental_handleOfItem,
  experimental_useHandles,
  isTRPCEntryError,
  loadHandles,
  loadHandlesSettled,
  prefetchEntry,
  prefetchInfiniteEntry,
} from '.';
import type {
  experimental_inferHandles,
  TRPCLoadEntries,
  inferInfiniteQueryHandle,
  inferQueryHandle,
} from '.';
import type { TRPCOptionsProxy } from '..';

const createAppRouter = () => {
  const t = initTRPC.create();
  const calls = vi.fn();
  const appRouter = t.router({
    post: t.router({
      bySlug: t.procedure
        .input(z.object({ slug: z.string() }))
        .query((opts) => {
          calls('post.bySlug', opts.input);
          if (opts.input.slug === 'missing') {
            throw new TRPCError({ code: 'NOT_FOUND' });
          }
          return {
            id: `id-of-${opts.input.slug}`,
            title: `Post ${opts.input.slug}`,
            authorId: 'u1',
            tags: [{ id: 't1' }, { id: 't2' }],
          };
        }),
      /** Three pages of one post each, by authors `u0`, `u1` and `u2` */
      paged: t.procedure
        .input(z.object({ cursor: z.number().nullish() }))
        .query((opts) => {
          calls('post.paged', opts.input);
          const page = opts.input.cursor ?? 0;
          return {
            items: [{ id: `p${page}`, authorId: `u${page}` }],
            nextCursor: page < 2 ? page + 1 : null,
          };
        }),
      /** Its author comes later, as a stream sends it */
      withAuthorLater: t.procedure
        .input(z.object({ slug: z.string() }))
        .query(() => ({ author: Promise.resolve({ id: 'u1' }) })),
      /**
       * Three pages by one author. A page has one post more than the page
       * before it. The author `sparse` has no list after the first page
       */
      pagedByAuthor: t.procedure
        .input(z.object({ authorId: z.string(), cursor: z.number().nullish() }))
        .query((opts) => {
          calls('post.pagedByAuthor', opts.input);
          const page = opts.input.cursor ?? 0;
          const items = Array.from({ length: page + 1 }, (_, index) => ({
            id: `${opts.input.authorId}-p${page}-${index}`,
            authorId: `u${index}`,
          }));
          return {
            // Against its type, as a server that is a version ahead can send
            items:
              opts.input.authorId === 'sparse' && page > 0
                ? (null as unknown as typeof items)
                : items,
            nextCursor: page < 2 ? page + 1 : null,
          };
        }),
      byAuthor: t.procedure
        .input(z.object({ authorId: z.string(), cursor: z.number().nullish() }))
        .query((opts) => {
          calls('post.byAuthor', opts.input);
          return { items: [opts.input.authorId], nextCursor: null };
        }),
    }),
    author: t.router({
      byId: t.procedure.input(z.object({ id: z.string() })).query((opts) => {
        calls('author.byId', opts.input);
        return { id: opts.input.id, name: 'KATT', teamId: 'team1' };
      }),
    }),
    team: t.router({
      byId: t.procedure.input(z.object({ id: z.string() })).query((opts) => {
        calls('team.byId', opts.input);
        return { id: opts.input.id, name: 'tRPC' };
      }),
    }),
    group: t.router({
      /** A list of lists: the members of every group */
      list: t.procedure.query(() => ({
        groups: [{ members: ['u1', 'u2'] }, { members: ['u3'] }],
      })),
      /** Lists that aren't there, against their types */
      sparse: t.procedure.query(() => ({
        groups: [{ members: ['u1'] }, { members: null as unknown as string[] }],
        owners: null as unknown as string[],
      })),
    }),
    big: t.router({
      /** Ids that no query key can hold */
      ids: t.procedure.query(() => ({ first: 1n, all: [1n, 2n] })),
      byId: t.procedure
        .input(z.object({ id: z.bigint() }))
        .query((opts) => opts.input.id),
    }),
    tag: t.router({
      byIds: t.procedure
        .input(
          z.object({ ids: z.array(z.string()), first: z.string().optional() }),
        )
        .query((opts) => {
          calls('tag.byIds', opts.input);
          return opts.input.ids.map((id) => ({ id }));
        }),
    }),
  });
  return { appRouter, calls };
};

const ctx = () => {
  const { appRouter, calls } = createAppRouter();
  return { ...testReactResource(appRouter), calls, appRouter };
};

/** A server and a batch link that both pipeline */
const pipeliningCtx = (ctxOpts: {
  link: typeof httpBatchLink | typeof httpBatchStreamLink;
  /** How long every request takes to leave, in milliseconds */
  latency: number;
  /** The server's `maxBatchSize` */
  maxBatchSize: number | undefined;
  /** The links before the batch link */
  before: TRPCLink<AnyRouter>[];
}) => {
  const { appRouter, calls } = createAppRouter();
  const resource = testReactResource(appRouter, {
    server: {
      experimental_allowPipelining: true,
      maxBatchSize: ctxOpts.maxBatchSize,
    },
    client: (opts) => ({
      links: [
        ...ctxOpts.before,
        ctxOpts.link({
          url: opts.httpUrl,
          experimental_pipelining: experimental_pipelining(),
          fetch: async (input, init) => {
            await new Promise((resolve) =>
              setTimeout(resolve, ctxOpts.latency),
            );
            return fetch(input, init);
          },
        }),
      ],
    }),
  });
  return { ...resource, calls, appRouter };
};

/** Shares the request of queries with the same path and input, like a dedupe link */
const dedupeLink = (): TRPCLink<AnyRouter> => () => {
  const pending = new Map<string, Observable<any, any>>();
  return ({ op, next }) => {
    const key = JSON.stringify([op.path, op.input]);
    const shared =
      pending.get(key) ??
      observable((observer) =>
        next(op).subscribe({
          next: (value) => observer.next(value),
          error(error) {
            pending.delete(key);
            observer.error(error);
          },
          complete() {
            pending.delete(key);
            observer.complete();
          },
        }),
      ).pipe(share());
    pending.set(key, shared);
    return shared;
  };
};

type AppRouter = ReturnType<typeof ctx>['appRouter'];
type TRPC = TRPCOptionsProxy<AppRouter>;

describe('dataOf', () => {
  test("builds an entry's input from another entry's data, in one load", async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;

    const post = ensureEntry(trpc.post.bySlug, { slug: 'hello' });
    const [handles, data] = await loadHandles(trpc, {
      // Listed before the entry it reads: the order doesn't matter
      author: ensureEntry(trpc.author.byId, {
        id: experimental_dataOf(post).authorId,
      }),
      post,
    });

    expect(data.author).toEqual({ id: 'u1', name: 'KATT', teamId: 'team1' });
    expect(handles.author).toEqual({
      queryKey: [['author', 'byId'], { input: { id: 'u1' }, type: 'query' }],
      input: { id: 'u1' },
    });
    // The handle reads the cache entry `queryOptions(input)` would
    expect(
      resource.queryClient.getQueryData(
        trpc.author.byId.queryKey({ id: 'u1' }),
      ),
    ).toEqual(data.author);
    expect(resource.calls.mock.calls).toEqual([
      ['post.bySlug', { slug: 'hello' }],
      ['author.byId', { id: 'u1' }],
    ]);
  });

  test('is typed as the data, and holds none', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const post = ensureEntry(trpc.post.bySlug, { slug: 'hello' });
    const list = prefetchInfiniteEntry(trpc.post.byAuthor, { authorId: 'u1' });

    expectTypeOf(experimental_dataOf(post).authorId).toEqualTypeOf<string>();
    expectTypeOf(experimental_dataOf(list).pages).toEqualTypeOf<
      { items: string[]; nextCursor: null }[]
    >();
    // @ts-expect-error the input is checked against the data's type
    ensureEntry(trpc.author.byId, { id: experimental_dataOf(post).tags });
    const later = prefetchEntry(trpc.post.withAuthorLater, { slug: 'hello' });
    // @ts-expect-error a value inside a promise has no path: nothing can read it
    void experimental_dataOf(later).author.id;

    expect(
      () => `${experimental_dataOf(post).authorId}`,
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: A \`experimental_dataOf()\` value has no data until the load runs, so it can't be made into a string or a number. Pass it as it is, as an entry's input or anywhere inside it]`,
    );
    expect(() =>
      experimental_dataOf({} as typeof post),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: \`experimental_dataOf()\` expects an entry from \`prefetchEntry()\`, \`fetchEntry()\` or \`ensureEntry()\`, got {}]`,
    );
    expect(resource.calls).not.toHaveBeenCalled();
  });

  test('reads through arrays, a prefetch entry, and a chain of entries', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;

    const post = prefetchEntry(trpc.post.bySlug, { slug: 'hello' });
    const author = prefetchEntry(trpc.author.byId, {
      id: experimental_dataOf(post).authorId,
    });
    const [handles, data] = await loadHandles(trpc, {
      post,
      author,
      team: prefetchEntry(trpc.team.byId, {
        id: experimental_dataOf(author).teamId,
      }),
      tags: prefetchEntry(trpc.tag.byIds, {
        ids: [
          experimental_dataOf(post).tags[0]!.id,
          experimental_dataOf(post).tags[1]!.id,
          'extra',
        ],
      }),
      more: prefetchInfiniteEntry(trpc.post.byAuthor, {
        authorId: experimental_dataOf(post).authorId,
      }),
    });

    // Prefetch entries have no data, but the load waited for what their inputs read
    expect(data).toEqual({});
    expect(handles.team.input).toEqual({ id: 'team1' });
    expect(handles.tags.input).toEqual({ ids: ['t1', 't2', 'extra'] });
    expect(handles.more.input).toEqual({ authorId: 'u1' });
    expectTypeOf(handles.more).toEqualTypeOf<
      inferInfiniteQueryHandle<TRPC['post']['byAuthor']>
    >();

    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
    expect(
      resource.queryClient.getQueryData(
        trpc.team.byId.queryKey({ id: 'team1' }),
      ),
    ).toEqual({ id: 'team1', name: 'tRPC' });
  });

  test('entries that read nothing still start before the load waits', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const post = ensureEntry(trpc.post.bySlug, { slug: 'hello' });
    const promise = loadHandles(trpc, {
      author: prefetchEntry(trpc.author.byId, {
        id: experimental_dataOf(post).authorId,
      }),
      post,
      team: prefetchEntry(trpc.team.byId, { id: 'team1' }),
    });
    expect(resource.queryClient.isFetching()).toBe(2);
    await promise;
  });

  test('a cached entry needs no request before the entries that read it start', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyClient;
    await loadHandles(trpc, {
      post: ensureEntry(trpc.post.bySlug, { slug: 'hello' }),
    });
    resource.calls.mockClear();

    const post = ensureEntry(
      trpc.post.bySlug,
      { slug: 'hello' },
      {
        staleTime: Infinity,
      },
    );
    const [handles] = await loadHandles(trpc, {
      post,
      author: ensureEntry(trpc.author.byId, {
        id: experimental_dataOf(post).authorId,
      }),
    });
    expect(handles.author.input).toEqual({ id: 'u1' });
    expect(resource.calls.mock.calls).toEqual([['author.byId', { id: 'u1' }]]);
  });

  test('rejects with the error of the entry the data comes from', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;

    for (const post of [
      ensureEntry(trpc.post.bySlug, { slug: 'missing' }),
      // A prefetch entry never makes a load reject, unless another entry reads it
      prefetchEntry(trpc.post.bySlug, { slug: 'missing' }),
    ]) {
      const error = await loadHandles(trpc, {
        post,
        author: prefetchEntry(trpc.author.byId, {
          id: experimental_dataOf(post).authorId,
        }),
      }).catch((cause: unknown) => cause);
      expect(error).toMatchObject({
        key: 'post',
        path: 'post.bySlug',
        code: 'NOT_FOUND',
      });
      expect(isTRPCEntryError(error, trpc.post.bySlug)).toBe(true);
    }
    expect(resource.calls).not.toHaveBeenCalledWith(
      'author.byId',
      expect.anything(),
    );
  });

  test('loadHandlesSettled has the error in its results, and no handle for the entries that could not start', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;

    const post = ensureEntry(trpc.post.bySlug, { slug: 'missing' });
    const author = ensureEntry(trpc.author.byId, {
      id: experimental_dataOf(post).authorId,
    });
    const [handles, results] = await loadHandlesSettled(trpc, {
      post,
      author,
      team: prefetchEntry(trpc.team.byId, {
        id: experimental_dataOf(author).teamId,
      }),
      tags: experimental_entryPerItem(experimental_dataOf(post).tags, (tag) =>
        ensureEntry(trpc.tag.byIds, { ids: [tag.id] }),
      ),
      other: ensureEntry(trpc.team.byId, { id: 'team1' }),
    });

    expect(results.post).toMatchObject({
      status: 'error',
      error: { key: 'post', code: 'NOT_FOUND' },
    });
    // What reads the post never started, and says why
    expect(results.author).toMatchObject({
      status: 'error',
      error: { key: 'post', code: 'NOT_FOUND' },
    });
    expect(results.tags).toEqual([]);
    expect(results.other).toMatchObject({ status: 'success' });
    expect(Object.keys(handles).sort()).toEqual(['other', 'post']);
    expect(resource.calls.mock.calls.map(([path]) => path).sort()).toEqual([
      'post.bySlug',
      'team.byId',
    ]);

    // A failed prefetch entry has no result to say so, so the load rejects
    const prefetched = prefetchEntry(trpc.post.bySlug, { slug: 'missing' });
    await expect(
      loadHandlesSettled(trpc, {
        post: prefetched,
        author: prefetchEntry(trpc.author.byId, {
          id: experimental_dataOf(prefetched).authorId,
        }),
      }),
    ).rejects.toMatchObject({ key: 'post', code: 'NOT_FOUND' });
  });

  test('throws for an entry that is not in the load', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const post = ensureEntry(trpc.post.bySlug, { slug: 'hello' });

    await expect(
      loadHandles(trpc, {
        team: prefetchEntry(trpc.team.byId, { id: 'team1' }),
        author: prefetchEntry(trpc.author.byId, {
          id: experimental_dataOf(post).authorId,
        }),
      }),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `[Error: The entry for "author" reads the data of an entry with \`experimental_dataOf()\` that isn't in this load. Add that entry to the load]`,
    );
    expect(resource.calls).not.toHaveBeenCalled();
  });
});

describe('experimental_dataOf().map()', () => {
  test('reads a part of every item of an array', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;

    const post = ensureEntry(trpc.post.bySlug, { slug: 'hello' });
    const tagIds = experimental_dataOf(post).tags.map((tag) => tag.id);
    expectTypeOf(tagIds).toEqualTypeOf<string[]>();
    const [handles, data] = await loadHandles(trpc, {
      post,
      tags: ensureEntry(trpc.tag.byIds, { ids: tagIds }),
    });
    expect(handles.tags.input).toEqual({ ids: ['t1', 't2'] });
    expect(data.tags).toEqual([{ id: 't1' }, { id: 't2' }]);
  });

  test('its callback must return the item or a part of it', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const post = ensureEntry(trpc.post.bySlug, { slug: 'hello' });

    expect(() =>
      experimental_dataOf(post).tags.map((tag) => ({ id: tag.id })),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: A \`experimental_dataOf()\` value has no data until the load runs, so it can only be passed on as it is, as an entry's input or anywhere inside it. A \`.map()\` callback must return the item or a part of it, such as \`(post) => post.authorId\`. To load an entry for every item, use \`experimental_entryPerItem()\`]`,
    );
    expect(() =>
      experimental_dataOf(post).tags.map(() => experimental_dataOf(post).id),
    ).toThrow(/must return the item or a part of it/);
    expect(() =>
      experimental_dataOf(post).tags.filter((tag) => tag.id === 't1'),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: A \`experimental_dataOf()\` value has no data until the load runs, so it can only be passed on as it is, as an entry's input or anywhere inside it. Of an array's methods, only \`.map()\` works, to read a part of every item]`,
    );
  });
});

describe('review regressions', () => {
  test('a second .map() reads from what the first returned', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;

    const post = ensureEntry(trpc.post.bySlug, { slug: 'hello' });
    const [handles] = await loadHandles(trpc, {
      post,
      tags: ensureEntry(trpc.tag.byIds, {
        ids: experimental_dataOf(post)
          .tags.map((tag) => tag)
          .map((tag) => tag.id),
      }),
    });
    expect(handles.tags.input).toEqual({ ids: ['t1', 't2'] });
  });

  test('an entry per item of a list that .map() made of plain values', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;

    const post = ensureEntry(trpc.post.bySlug, { slug: 'hello' });
    const [handles, data] = await loadHandles(trpc, {
      post,
      tags: experimental_entryPerItem(
        experimental_dataOf(post).tags.map((tag) => tag.id),
        (id) => ensureEntry(trpc.tag.byIds, { ids: [id] }),
      ),
    });
    expect(data.tags).toEqual([[{ id: 't1' }], [{ id: 't2' }]]);
    expect(experimental_handleOfItem(handles.tags, 't9').input).toEqual({
      ids: ['t9'],
    });
  });

  test("an item's input can also have the whole list", async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;

    const post = ensureEntry(trpc.post.bySlug, { slug: 'hello' });
    const [handles, data] = await loadHandles(trpc, {
      post,
      tags: experimental_entryPerItem(experimental_dataOf(post).tags, (tag) =>
        ensureEntry(trpc.tag.byIds, {
          // Every tag's id, and this tag's: the same place in the post
          ids: experimental_dataOf(post).tags.map((each) => each.id),
          first: tag.id,
        }),
      ),
    });
    expect(data.tags).toEqual([
      [{ id: 't1' }, { id: 't2' }],
      [{ id: 't1' }, { id: 't2' }],
    ]);
    expect(experimental_handleOfItem(handles.tags, { id: 't2' }).input).toEqual(
      { ids: ['t1', 't2'], first: 't2' },
    );
  });

  test('stops watching the cache when a prefetch entry that is read starts late', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const cache = resource.queryClient.getQueryCache();
    expect(cache.hasListeners()).toBe(false);

    // The author starts once the post is in, and the team reads the author
    const post = ensureEntry(trpc.post.bySlug, { slug: 'hello' });
    const author = prefetchEntry(trpc.author.byId, {
      id: experimental_dataOf(post).authorId,
    });
    await loadHandles(trpc, {
      post,
      author,
      team: ensureEntry(trpc.team.byId, {
        id: experimental_dataOf(author).teamId,
      }),
    });
    await vi.waitFor(() => {
      expect(cache.hasListeners()).toBe(false);
    });
  });

  test('a finished handle of a list keeps what its items load', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;

    const post = ensureEntry(trpc.post.bySlug, { slug: 'hello' });
    const posts = experimental_dataOf(post, (it) =>
      ensureEntry(trpc.post.byAuthor, { authorId: it.authorId }),
    );
    const [handles, data] = await loadHandles(trpc, {
      post,
      posts,
      authors: experimental_entryPerItem(
        experimental_dataOf(posts).items,
        (id) => prefetchEntry(trpc.author.byId, { id }),
      ),
    });
    const finished = experimental_handleOfItem(handles.posts, data.post);
    expect(finished.experimental_perItem).toHaveLength(1);
    expect(finished.experimental_perItem).toEqual(
      handles.posts.experimental_perItem,
    );
  });

  test('an unfinished handle has no undefined in it', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;

    const post = prefetchEntry(trpc.post.bySlug, { slug: 'hello' });
    const [handles] = await loadHandles(trpc, {
      post,
      author: experimental_dataOf(post, (it) =>
        prefetchEntry(trpc.author.byId, { id: it.authorId }),
      ),
      tags: experimental_entryPerItem(experimental_dataOf(post).tags, (tag) =>
        prefetchEntry(trpc.tag.byIds, { ids: [tag.id], first: tag.id }),
      ),
    });
    // Next.js rejects `undefined` in the props of a page
    expect(handles.author).toStrictEqual({
      queryKey: [['author', 'byId'], { input: {}, type: 'query' }],
      input: {},
      itemInputs: [{ to: ['id'], path: ['authorId'] }],
    });
    expect(handles.tags).toStrictEqual({
      queryKey: [['tag', 'byIds'], { input: { ids: [null] }, type: 'query' }],
      input: { ids: [null] },
      itemInputs: [
        { to: ['ids', '0'], path: ['id'] },
        { to: ['first'], path: ['id'] },
      ],
    });
    // It is finished as before
    expect(experimental_handleOfItem(handles.tags, { id: 't1' })).toEqual({
      queryKey: trpc.tag.byIds.queryKey({ ids: ['t1'], first: 't1' }),
      input: { ids: ['t1'], first: 't1' },
    });
  });

  test('a finished infinite handle has the cursor as its initialCursor, not in its key', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;

    const first = ensureEntry(trpc.post.paged, { cursor: 0 });
    const [handles, data] = await loadHandles(trpc, {
      first,
      rest: experimental_dataOf(first, (it) =>
        ensureInfiniteEntry(trpc.post.paged, { cursor: it.nextCursor }),
      ),
      // The same query, with a cursor that is known
      direct: prefetchInfiniteEntry(trpc.post.paged, { cursor: 1 }),
    });
    const rest = experimental_handleOfItem(handles.rest, data.first);
    expect(rest).toEqual(handles.direct);
    expect(resource.queryClient.getQueryData(rest.queryKey)).toEqual(data.rest);
  });
});

describe('edges of a load', () => {
  test('a whole input can come from the data an entry is built from', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const post = ensureEntry(trpc.post.bySlug, { slug: 'hello' });
    const [handles, data] = await loadHandles(trpc, {
      post,
      author: experimental_dataOf(post, (it) =>
        prefetchEntry(trpc.author.byId, it.tags[0]!),
      ),
    });
    // The handle has no input yet
    expect(handles.author).toEqual({
      queryKey: [['author', 'byId'], { type: 'query' }],
      itemInputs: [{ to: [], path: ['tags', '0'] }],
    });
    expect(experimental_handleOfItem(handles.author, data.post).input).toEqual({
      id: 't1',
    });
  });

  test('an entry built from data can read another entry too, which its handle waits for', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const post = prefetchEntry(trpc.post.bySlug, { slug: 'hello' });
    const group = prefetchEntry(trpc.group.list);
    const [handles] = await loadHandles(trpc, {
      post,
      group,
      tags: experimental_dataOf(post, (it) =>
        prefetchEntry(trpc.tag.byIds, {
          ids: [it.authorId],
          first: experimental_dataOf(group).groups[0]!.members[0]!,
        }),
      ),
    });
    // With the group's part, and without the post's
    expect(handles.tags).toMatchObject({
      input: { ids: [null], first: 'u1' },
      itemInputs: [{ to: ['ids', '0'], path: ['authorId'] }],
    });
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
    expect(resource.calls.mock.calls).toContainEqual([
      'tag.byIds',
      { ids: ['u1'], first: 'u1' },
    ]);
  });

  test('an entry that reads two entries has the error of the one that fails, also when the other is still loading', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const missing = prefetchEntry(trpc.post.bySlug, { slug: 'missing' });
    const post = prefetchEntry(trpc.post.bySlug, { slug: 'hello' });
    // It settles after the missing post has failed
    const author = prefetchEntry(trpc.author.byId, {
      id: experimental_dataOf(post).authorId,
    });
    await expect(
      loadHandles(trpc, {
        missing,
        post,
        author,
        tags: prefetchEntry(trpc.tag.byIds, {
          ids: [
            experimental_dataOf(missing).authorId,
            experimental_dataOf(author).id,
          ],
        }),
      }),
    ).rejects.toMatchObject({ key: 'missing', code: 'NOT_FOUND' });
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
    // The two posts and the author. The tags never ran
    expect(resource.calls.mock.calls.map(([path]) => path)).toEqual([
      'post.bySlug',
      'post.bySlug',
      'author.byId',
    ]);
  });

  test('lists that are not there have no items', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const sparse = ensureEntry(trpc.group.sparse);
    const byId = (id: string) => ensureEntry(trpc.author.byId, { id });
    const [, data] = await loadHandles(trpc, {
      sparse,
      // A list of lists, of which one is missing
      members: experimental_entryPerItem(
        experimental_dataOf(sparse).groups.map((group) => group.members),
        byId,
      ),
      // No list at all
      owners: experimental_entryPerItem(
        experimental_dataOf(sparse).owners,
        byId,
      ),
    });
    expect(data.members).toEqual([{ id: 'u1', name: 'KATT', teamId: 'team1' }]);
    expect(data.owners).toEqual([]);
  });

  test('a query for every item rejects the load when its list fails', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const post = ensureEntry(trpc.post.bySlug, { slug: 'missing' });
    await expect(
      loadHandles(trpc, {
        post,
        teams: experimental_entryPerItem(
          experimental_dataOf(post).tags,
          (tag) => ensureEntry(trpc.team.byId, { id: tag.id }),
        ),
      }),
    ).rejects.toMatchObject({ key: 'post', code: 'NOT_FOUND' });
    expect(resource.calls.mock.calls.map(([path]) => path)).toEqual([
      'post.bySlug',
    ]);
  });

  test('data that no query key can hold fails the entry that reads it, and nothing else', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const ids = prefetchEntry(trpc.big.ids);
    await expect(
      loadHandles(trpc, {
        ids,
        one: ensureEntry(trpc.big.byId, {
          id: experimental_dataOf(ids).first,
        }),
      }),
    ).rejects.toThrow('BigInt');
    await expect(
      loadHandles(trpc, {
        ids,
        all: experimental_entryPerItem(experimental_dataOf(ids).all, (id) =>
          ensureEntry(trpc.big.byId, { id }),
        ),
      }),
    ).rejects.toThrow('BigInt');
    // The entry it reads loaded
    expect(resource.queryClient.getQueryData(trpc.big.ids.queryKey())).toEqual({
      first: 1n,
      all: [1n, 2n],
    });
  });

  test('experimental_handleOfItem() throws for a handle that has nothing to fill in', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const [handles] = await loadHandles(trpc, {
      post: ensureEntry(trpc.post.bySlug, { slug: 'hello' }),
    });
    expect(() =>
      // @ts-expect-error -- it is finished
      experimental_handleOfItem(handles.post, {}),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Expected the handle of an entry from \`experimental_entryPerItem()\`, or from \`experimental_dataOf()\` with a callback, got {"queryKey":[["post","bySlug"],{"input":{"slug":"hello"},"type":"query"}],"input":{"slug":"hello"}}]`,
    );
    expect(() =>
      experimental_handleOfItem(null as any, {}),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Expected the handle of an entry from \`experimental_entryPerItem()\`, or from \`experimental_dataOf()\` with a callback, got null]`,
    );
  });
});

describe('entryPerItem', () => {
  test('gives one handle, which an item turns into the handle of its query', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;

    const post = ensureEntry(trpc.post.bySlug, { slug: 'hello' });
    const [handles, data] = await loadHandles(trpc, {
      post,
      tags: experimental_entryPerItem(experimental_dataOf(post).tags, (tag) =>
        ensureEntry(trpc.tag.byIds, { ids: [tag.id, 'extra'] }),
      ),
      // Not waited for, so it has no data
      alsoTags: experimental_entryPerItem(
        experimental_dataOf(post).tags,
        (tag) => prefetchEntry(trpc.tag.byIds, { ids: [tag.id] }),
      ),
    });

    expectTypeOf(data.tags).toEqualTypeOf<{ id: string }[][]>();
    expectTypeOf<keyof typeof data>().toEqualTypeOf<'post' | 'tags'>();
    expect(data.tags).toEqual([
      [{ id: 't1' }, { id: 'extra' }],
      [{ id: 't2' }, { id: 'extra' }],
    ]);

    const [tag] = data.post.tags;
    const handle = experimental_handleOfItem(handles.tags, tag!);
    expectTypeOf(handle).toEqualTypeOf<
      inferQueryHandle<TRPC['tag']['byIds']>
    >();
    expect(handle).toEqual({
      queryKey: [
        ['tag', 'byIds'],
        { input: { ids: ['t1', 'extra'] }, type: 'query' },
      ],
      input: { ids: ['t1', 'extra'] },
    });
    // It reads the query the load started
    expect(
      resource.queryClient.getQueryData(fromHandle(trpc, handle).queryKey),
    ).toEqual([{ id: 't1' }, { id: 'extra' }]);

    // An item the load never had, such as one from a later page, has a handle too
    expect(
      experimental_handleOfItem(handles.tags, { id: 'later' }).input,
    ).toEqual({
      ids: ['later', 'extra'],
    });
    // @ts-expect-error the item has to be one of the list's
    experimental_handleOfItem(handles.tags, { slug: 'nope' });
    // It crosses to the browser as JSON
    expect(
      experimental_handleOfItem(JSON.parse(JSON.stringify(handles.tags)), tag!),
    ).toEqual(handle);
  });

  test('takes a list of lists, such as the pages of an infinite entry', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;

    const posts = ensureInfiniteEntry(trpc.post.byAuthor, { authorId: 'u1' });
    const [handles, data] = await loadHandles(trpc, {
      posts,
      authors: experimental_entryPerItem(
        experimental_dataOf(posts).pages.map((page) => page.items),
        (authorId) => ensureEntry(trpc.author.byId, { id: authorId }),
      ),
    });
    expect(data.authors).toEqual([{ id: 'u1', name: 'KATT', teamId: 'team1' }]);
    expect(experimental_handleOfItem(handles.authors, 'u2').input).toEqual({
      id: 'u2',
    });
  });

  test('an item that fails rejects the load with its place in the list', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    resource.calls.mockImplementation((path: string, input: any) => {
      if (path === 'tag.byIds' && input.ids[0] === 't2') {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
    });

    const post = ensureEntry(trpc.post.bySlug, { slug: 'hello' });
    const entries = {
      post,
      tags: experimental_entryPerItem(experimental_dataOf(post).tags, (tag) =>
        ensureEntry(trpc.tag.byIds, { ids: [tag.id] }),
      ),
    } satisfies TRPCLoadEntries;
    await expect(loadHandles(trpc, entries)).rejects.toMatchObject({
      key: 'tags.1',
      path: 'tag.byIds',
      code: 'FORBIDDEN',
    });

    const [, results] = await loadHandlesSettled(trpc, entries);
    expect(results.tags).toMatchObject([
      { status: 'success', data: [{ id: 't1' }] },
      { status: 'error', error: { key: 'tags.1', code: 'FORBIDDEN' } },
    ]);
  });

  test('throws for a list that is not from experimental_dataOf(), and for a callback that returns no query entry', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const post = ensureEntry(trpc.post.bySlug, { slug: 'hello' });

    expect(() =>
      experimental_entryPerItem([{ id: 't1' }], (tag) =>
        prefetchEntry(trpc.tag.byIds, { ids: [tag.id] }),
      ),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: \`experimental_entryPerItem()\` expects a list from \`experimental_dataOf()\`, such as \`experimental_dataOf(posts).items\`, got [{"id":"t1"}]]`,
    );
    const { tags } = experimental_dataOf(post);
    // @ts-expect-error only a query entry
    expect(() => experimental_entryPerItem(tags, (tag) => tag.id)).toThrow(
      /must return an entry/,
    );
  });
});

describe('experimental_dataOf(entry, (data) => entry)', () => {
  test('the load does not wait for the data, and the handle is finished with it', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyClient;

    const post = prefetchEntry(trpc.post.bySlug, { slug: 'hello' });
    const [loaded, data] = await loadHandles(trpc, {
      post,
      author: experimental_dataOf(post, (it) =>
        prefetchEntry(trpc.author.byId, { id: it.authorId }),
      ),
    });
    // Nothing has arrived
    expect(
      resource.queryClient.getQueryData(fromHandle(trpc, loaded.post).queryKey),
    ).toBeUndefined();
    expect(data).toEqual({});
    expectTypeOf(data).toEqualTypeOf<{}>();

    // The handle has the input without the post's part, and where it goes
    expect(loaded.author).toEqual({
      queryKey: trpc.author.byId.queryKey({} as any),
      input: {},
      itemInputs: [{ to: ['id'], path: ['authorId'] }],
    });
    expect(() =>
      // @ts-expect-error -- it isn't finished
      fromHandle(trpc, loaded.author),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: \`fromHandle()\` got a handle that isn't finished: its input needs an item or another entry's data. Pass it through \`experimental_handleOfItem(handle, item)\` first]`,
    );

    // The handles cross to the browser as JSON
    const handles: typeof loaded = JSON.parse(JSON.stringify(loaded));
    const postData = await resource.queryClient.ensureQueryData(
      fromHandle(trpc, handles.post),
    );
    const author = experimental_handleOfItem(handles.author, postData);
    expectTypeOf(author).toEqualTypeOf<
      inferQueryHandle<typeof trpc.author.byId>
    >();
    expect(author).toEqual({
      queryKey: trpc.author.byId.queryKey({ id: 'u1' }),
      input: { id: 'u1' },
    });
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
    expect(
      resource.queryClient.getQueryData(fromHandle(trpc, author).queryKey),
    ).toEqual({ id: 'u1', name: 'KATT', teamId: 'team1' });
    // Every procedure ran once
    expect(resource.calls.mock.calls).toEqual([
      ['post.bySlug', { slug: 'hello' }],
      ['author.byId', { id: 'u1' }],
    ]);
  });

  test('an entry can be built from the data of an entry that is built from another, also an infinite one', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyClient;

    const post = prefetchEntry(trpc.post.bySlug, { slug: 'hello' });
    const author = experimental_dataOf(post, (it) =>
      prefetchEntry(trpc.author.byId, { id: it.authorId }),
    );
    const [handles] = await loadHandles(trpc, {
      post,
      author,
      more: experimental_dataOf(author, (it) =>
        prefetchInfiniteEntry(trpc.post.byAuthor, { authorId: it.id }),
      ),
    });
    await vi.waitFor(() => {
      expect(resource.calls).toHaveBeenCalledTimes(3);
    });
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });

    const more = experimental_handleOfItem(handles.more, {
      id: 'u1',
      name: 'KATT',
      teamId: 'team1',
    });
    expectTypeOf(more).toEqualTypeOf<
      inferInfiniteQueryHandle<typeof trpc.post.byAuthor>
    >();
    expect(
      resource.queryClient.getQueryData(
        fromHandle(trpc, more, {
          getNextPageParam: (last) => last.nextCursor,
        }).queryKey,
      ),
    ).toMatchObject({ pages: [{ items: ['u1'], nextCursor: null }] });
    expect(resource.calls.mock.calls.map(([path]) => path)).toEqual([
      'post.bySlug',
      'author.byId',
      'post.byAuthor',
    ]);
  });

  test('a fetch or ensure entry is waited for, and its handle is unfinished too', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyClient;

    const post = prefetchEntry(trpc.post.bySlug, { slug: 'hello' });
    const [handles, data] = await loadHandles(trpc, {
      post,
      author: experimental_dataOf(post, (it) =>
        ensureEntry(trpc.author.byId, { id: it.authorId }),
      ),
    });

    expect(data).toEqual({
      author: { id: 'u1', name: 'KATT', teamId: 'team1' },
    });
    expectTypeOf(data.author).toEqualTypeOf<{
      id: string;
      name: string;
      teamId: string;
    }>();
    expect(handles.author).toMatchObject({
      itemInputs: [{ to: ['id'], path: ['authorId'] }],
    });
  });

  test('an entry that reads it in its input waits for it', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyClient;

    const post = prefetchEntry(trpc.post.bySlug, { slug: 'hello' });
    const author = experimental_dataOf(post, (it) =>
      prefetchEntry(trpc.author.byId, { id: it.authorId }),
    );
    const [handles] = await loadHandles(trpc, {
      post,
      author,
      team: prefetchEntry(trpc.team.byId, {
        id: experimental_dataOf(author).teamId,
      }),
    });

    expect(handles.team.input).toEqual({ id: 'team1' });
  });

  test('when the entry it is built from fails, the load still resolves and it does not start', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyClient;

    const post = prefetchEntry(trpc.post.bySlug, { slug: 'missing' });
    const [handles, results] = await loadHandlesSettled(trpc, {
      post,
      author: experimental_dataOf(post, (it) =>
        prefetchEntry(trpc.author.byId, { id: it.authorId }),
      ),
    });
    const postKey = fromHandle(trpc, handles.post).queryKey;
    await vi.waitFor(() => {
      // The error is where the post is read
      expect(resource.queryClient.getQueryState(postKey)?.status).toBe('error');
    });

    expect(results).toEqual({});
    expect(Object.keys(handles)).toEqual(['post', 'author']);
    expect(
      resource.calls.mock.calls.filter(([path]) => path === 'author.byId'),
    ).toEqual([]);
  });

  test('the callback must return an entry', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyClient;
    const post = prefetchEntry(trpc.post.bySlug, { slug: 'hello' });

    expect(() =>
      // @ts-expect-error -- not an entry
      experimental_dataOf(post, (it) => it.authorId),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: The callback of \`experimental_dataOf()\` must return an entry from \`prefetchEntry()\`, \`fetchEntry()\` or \`ensureEntry()\`, got "[a experimental_dataOf() value]"]`,
    );
  });

  test('an entry per item does not wait for a list from a prefetch entry', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyClient;

    const post = prefetchEntry(trpc.post.bySlug, { slug: 'hello' });
    const [handles] = await loadHandles(trpc, {
      post,
      tags: experimental_entryPerItem(experimental_dataOf(post).tags, (tag) =>
        prefetchEntry(trpc.tag.byIds, { ids: [tag.id] }),
      ),
    });
    expect(
      resource.queryClient.getQueryData(
        fromHandle(trpc, handles.post).queryKey,
      ),
    ).toBeUndefined();

    await vi.waitFor(() => {
      expect(resource.calls).toHaveBeenCalledTimes(3);
    });
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
    expect(
      resource.queryClient.getQueryData(
        fromHandle(trpc, experimental_handleOfItem(handles.tags, { id: 't2' }))
          .queryKey,
      ),
    ).toEqual([{ id: 't2' }]);
  });
});

describe('without the options', () => {
  test('a link that pipelines and a server that does not: the load fails, and no query runs with a hole in its input', async () => {
    const { appRouter, calls } = createAppRouter();
    await using resource = testReactResource(appRouter, {
      client: (opts) => ({
        links: [
          httpBatchLink({
            url: opts.httpUrl,
            experimental_pipelining: experimental_pipelining(),
          }),
        ],
      }),
    });
    const trpc = resource.optionsProxyClient;

    const post = ensureEntry(trpc.post.bySlug, { slug: 'hello' });
    await expect(
      loadHandles(trpc, {
        post,
        author: prefetchEntry(trpc.author.byId, {
          id: experimental_dataOf(post).authorId,
        }),
      }),
    ).rejects.toMatchObject({
      key: 'post',
      cause: {
        message: expect.stringContaining(
          'Set `experimental_allowPipelining: true` on its handler',
        ),
      },
    });
    expect(calls).not.toHaveBeenCalled();
  });

  test('a link that does not pipeline: a later page is an ordinary request, and its items load when they are read', async () => {
    const { appRouter, calls } = createAppRouter();
    await using resource = testReactResource(appRouter, {
      client: (opts) => ({ links: [httpBatchLink({ url: opts.httpUrl })] }),
    });
    const trpc = resource.optionsProxyClient;
    const getNextPageParam = (last: { nextCursor: number | null }) =>
      last.nextCursor;

    const posts = ensureInfiniteEntry(
      trpc.post.paged,
      {},
      { getNextPageParam },
    );
    const [handles] = await loadHandles(trpc, {
      posts,
      authors: experimental_entryPerItem(
        experimental_dataOf(posts).pages.map((page) => page.items),
        (post) => prefetchEntry(trpc.author.byId, { id: post.authorId }),
      ),
    });
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
    resource.onRequestSpy.mockClear();
    calls.mockClear();

    const observer = new InfiniteQueryObserver(resource.queryClient, {
      ...fromHandle(trpc, handles.posts, { getNextPageParam }),
      // The page that was loaded is fresh: mounting does not fetch it again
      staleTime: Infinity,
    });
    using _subscription = makeResource({}, observer.subscribe(vi.fn()));
    await observer.fetchNextPage();
    expect(calls.mock.calls).toEqual([['post.paged', { cursor: 1 }]]);
    expect(resource.onRequestSpy.mock.calls[0]![0].url).toContain('batch=1');
  });

  test('a batch that is split: a later page still loads its items, in a request of their own', async () => {
    const { appRouter, calls } = createAppRouter();
    await using resource = testReactResource(appRouter, {
      server: { experimental_allowPipelining: true },
      client: (opts) => ({
        links: [
          httpBatchLink({
            url: opts.httpUrl,
            experimental_pipelining: experimental_pipelining(),
            maxItems: 1,
          }),
        ],
      }),
    });
    const trpc = resource.optionsProxyClient;
    const getNextPageParam = (last: { nextCursor: number | null }) =>
      last.nextCursor;

    const posts = ensureInfiniteEntry(
      trpc.post.paged,
      {},
      { getNextPageParam },
    );
    const [handles] = await loadHandles(trpc, {
      posts,
      authors: experimental_entryPerItem(
        experimental_dataOf(posts).pages.map((page) => page.items),
        (post) => prefetchEntry(trpc.author.byId, { id: post.authorId }),
      ),
    });
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
    calls.mockClear();

    const observer = new InfiniteQueryObserver(resource.queryClient, {
      ...fromHandle(trpc, handles.posts, { getNextPageParam }),
      staleTime: Infinity,
    });
    using _subscription = makeResource({}, observer.subscribe(vi.fn()));
    const data = await observer.fetchNextPage();
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });

    const lastPost = data.data!.pages[1]!.items[0]!;
    expect(
      resource.queryClient.getQueryData(
        fromHandle(trpc, experimental_handleOfItem(handles.authors, lastPost))
          .queryKey,
      ),
    ).toEqual({ id: 'u1', name: 'KATT', teamId: 'team1' });
    expect(calls.mock.calls).toEqual([
      ['post.paged', { cursor: 1 }],
      ['author.byId', { id: 'u1' }],
    ]);
  });

  test('a link that does not pipeline: the input is filled in on the client, in ordinary batches', async () => {
    const { appRouter } = createAppRouter();
    await using resource = testReactResource(appRouter, {
      server: { experimental_allowPipelining: true },
      client: (opts) => ({ links: [httpBatchLink({ url: opts.httpUrl })] }),
    });
    const trpc = resource.optionsProxyClient;

    const post = ensureEntry(trpc.post.bySlug, { slug: 'hello' });
    const [handles] = await loadHandles(trpc, {
      post,
      author: ensureEntry(trpc.author.byId, {
        id: experimental_dataOf(post).authorId,
      }),
    });
    expect(handles.author.input).toEqual({ id: 'u1' });
    expect(
      resource.onRequestSpy.mock.calls.map(([req]) =>
        req.url?.replace(/\?.*/, ''),
      ),
    ).toEqual(['/post.bySlug', '/author.byId']);
    for (const [req] of resource.onRequestSpy.mock.calls) {
      expect(req.url).toContain('batch=1');
      expect(req.url).not.toContain('pipe=');
    }
  });
});

describe('satisfies TRPCLoadEntries', () => {
  test('checks the entries of a function, and keeps a skipToken', async () => {
    const trpc = {} as TRPC;
    if (Math.random() < 2) return;
    const entries = (isAdmin: boolean) => {
      const post = ensureEntry(trpc.post.bySlug, { slug: 'hello' });
      return {
        post,
        // Without `satisfies`, a returned `skipToken` widens to `symbol`
        team: isAdmin ? fetchEntry(trpc.team.byId, { id: 'team1' }) : skipToken,
        card: {
          author: prefetchEntry(trpc.author.byId, {
            id: experimental_dataOf(post).authorId,
          }),
        },
      } satisfies TRPCLoadEntries;
    };
    const [handles] = await loadHandles(trpc, entries(true));
    expectTypeOf(handles.team).toEqualTypeOf<
      inferQueryHandle<TRPC['team']['byId']> | undefined
    >();
    expectTypeOf(handles).toEqualTypeOf<
      experimental_inferHandles<typeof entries>
    >();

    const notEntries = () =>
      ({
        // @ts-expect-error not an entry
        post: trpc.post.bySlug.queryOptions({ slug: 'hello' }),
      }) satisfies TRPCLoadEntries;
    void notEntries;
  });
});

describe('groups', () => {
  /** What a component file exports next to the component */
  function authorCardEntries(trpc: TRPC, opts: { authorId: string }) {
    return {
      author: prefetchEntry(trpc.author.byId, { id: opts.authorId }),
    };
  }
  function postEntries(trpc: TRPC, opts: { slug: string }) {
    const post = ensureEntry(trpc.post.bySlug, { slug: opts.slug });
    return {
      post,
      // The child takes a string. It doesn't know this one arrives later
      authorCard: authorCardEntries(trpc, {
        authorId: experimental_dataOf(post).authorId,
      }),
    };
  }

  test('a group gets its handles and data under its key', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;

    const [handles, data] = await loadHandles(trpc, {
      page: postEntries(trpc, { slug: 'hello' }),
      team: fetchEntry(trpc.team.byId, { id: 'team1' }),
    });

    expect(handles).toEqual({
      page: {
        post: {
          queryKey: [
            ['post', 'bySlug'],
            { input: { slug: 'hello' }, type: 'query' },
          ],
          input: { slug: 'hello' },
        },
        authorCard: {
          author: {
            queryKey: [
              ['author', 'byId'],
              { input: { id: 'u1' }, type: 'query' },
            ],
            input: { id: 'u1' },
          },
        },
      },
      team: {
        queryKey: [['team', 'byId'], { input: { id: 'team1' }, type: 'query' }],
        input: { id: 'team1' },
      },
    });
    expect(data).toEqual({
      page: {
        post: expect.objectContaining({ id: 'id-of-hello' }),
        authorCard: {},
      },
      team: { id: 'team1', name: 'tRPC' },
    });

    expectTypeOf(handles.page).toEqualTypeOf<
      experimental_inferHandles<typeof postEntries>
    >();
    expectTypeOf(handles.page.authorCard).toEqualTypeOf<{
      author: inferQueryHandle<TRPC['author']['byId']>;
    }>();
    expectTypeOf(data.page.post.title).toEqualTypeOf<string>();
    expectTypeOf<keyof typeof data.page>().toEqualTypeOf<
      'post' | 'authorCard'
    >();
    expectTypeOf<keyof typeof data.page.authorCard>().toEqualTypeOf<never>();
  });

  test('a skipToken in a group has no handle', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const isAdmin = Math.random() < 2;
    const [handles, data] = await loadHandles(trpc, {
      page: {
        never: skipToken,
        team: isAdmin ? fetchEntry(trpc.team.byId, { id: 'team1' }) : skipToken,
      },
    });
    expect(handles).toEqual({
      page: { team: expect.objectContaining({ input: { id: 'team1' } }) },
    });
    expect(data).toEqual({ page: { team: { id: 'team1', name: 'tRPC' } } });
    expectTypeOf(handles.page.never).toEqualTypeOf<undefined>();
    expectTypeOf(handles.page.team).toEqualTypeOf<
      inferQueryHandle<TRPC['team']['byId']> | undefined
    >();
    expectTypeOf<keyof typeof data.page>().toEqualTypeOf<never>();
  });

  test('a component reads the handles of its own entries', async () => {
    await using resource = ctx();
    const { useTRPC } = resource;

    function AuthorCard(props: {
      handles: experimental_inferHandles<typeof authorCardEntries>;
    }) {
      const trpc = useTRPC();
      const author = useSuspenseQuery(fromHandle(trpc, props.handles.author));
      return <address>{author.data.name}</address>;
    }
    function Post(props: {
      handles: experimental_inferHandles<typeof postEntries>;
    }) {
      const trpc = useTRPC();
      const post = useSuspenseQuery(fromHandle(trpc, props.handles.post));
      return (
        <article>
          <h1>{post.data.title}</h1>
          <AuthorCard handles={props.handles.authorCard} />
        </article>
      );
    }

    const trpc = resource.optionsProxyClient;
    const [handles] = await loadHandles(trpc, {
      page: postEntries(trpc, { slug: 'hello' }),
    });
    const utils = resource.renderApp(
      <React.Suspense fallback="loading">
        <Post handles={handles.page} />
      </React.Suspense>,
    );
    await vi.waitFor(() => {
      expect(utils.container).toHaveTextContent('Post helloKATT');
    });
    expect(resource.calls.mock.calls).toEqual([
      ['post.bySlug', { slug: 'hello' }],
      ['author.byId', { id: 'u1' }],
    ]);
  });

  test('errors and results name the entry by its keys', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;

    const entries = { page: postEntries(trpc, { slug: 'missing' }) };
    await expect(loadHandles(trpc, entries)).rejects.toMatchObject({
      key: 'page.post',
      path: 'post.bySlug',
    });

    const [, results] = await loadHandlesSettled(trpc, {
      page: { post: ensureEntry(trpc.post.bySlug, { slug: 'missing' }) },
    });
    expect(results.page.post).toMatchObject({
      status: 'error',
      error: { key: 'page.post', code: 'NOT_FOUND' },
    });
    expectTypeOf(results.page.post.status).toEqualTypeOf<'success' | 'error'>();
  });
});

describe.each([
  { name: 'httpBatchLink', link: httpBatchLink },
  { name: 'httpBatchStreamLink', link: httpBatchStreamLink },
])('pipelining with $name', (scenario) => {
  test('entries that read each other load in one request', async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      before: [],
    });
    const trpc = resource.optionsProxyClient;

    const post = ensureEntry(trpc.post.bySlug, { slug: 'hello' });
    const author = prefetchEntry(trpc.author.byId, {
      id: experimental_dataOf(post).authorId,
    });
    const [handles, data] = await loadHandles(trpc, {
      post,
      author,
      team: ensureEntry(trpc.team.byId, {
        id: experimental_dataOf(author).teamId,
      }),
      tags: prefetchEntry(trpc.tag.byIds, {
        ids: [experimental_dataOf(post).tags[1]!.id, 'extra'],
      }),
    });

    expect(data.team).toEqual({ id: 'team1', name: 'tRPC' });
    expect(handles.author.input).toEqual({ id: 'u1' });
    expect(handles.tags.input).toEqual({ ids: ['t2', 'extra'] });
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
    // Each entry is an ordinary cache entry under the key of its filled-in input
    expect(
      resource.queryClient.getQueryData(
        trpc.author.byId.queryKey({ id: 'u1' }),
      ),
    ).toEqual({ id: 'u1', name: 'KATT', teamId: 'team1' });
    expect(
      resource.queryClient.getQueryData(
        trpc.tag.byIds.queryKey({ ids: ['t2', 'extra'] }),
      ),
    ).toEqual([{ id: 't2' }, { id: 'extra' }]);

    expect(resource.onRequestSpy).toHaveBeenCalledTimes(1);
    // Every procedure ran once
    expect(resource.calls.mock.calls.map(([path]) => path).sort()).toEqual([
      'author.byId',
      'post.bySlug',
      'tag.byIds',
      'team.byId',
    ]);
  });

  test('a list read with .map() loads in one request', async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      before: [],
    });
    const trpc = resource.optionsProxyClient;

    const post = fetchEntry(trpc.post.bySlug, { slug: 'hello' });
    const [handles] = await loadHandles(trpc, {
      post,
      tags: fetchEntry(trpc.tag.byIds, {
        ids: experimental_dataOf(post).tags.map((tag) => tag.id),
      }),
    });
    expect(handles.tags.input).toEqual({ ids: ['t1', 't2'] });
    expect(resource.calls).toHaveBeenCalledWith('tag.byIds', {
      ids: ['t1', 't2'],
    });
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(1);
  });

  test('an entry per item is one call that the server runs for every item', async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      before: [],
    });
    const trpc = resource.optionsProxyClient;
    resource.calls.mockImplementation((path: string, input: any) => {
      if (path === 'tag.byIds' && input.ids[0] === 't2') {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
    });

    const post = fetchEntry(trpc.post.bySlug, { slug: 'hello' });
    const [handles, data] = await loadHandles(trpc, {
      post,
      tags: experimental_entryPerItem(experimental_dataOf(post).tags, (tag) =>
        prefetchEntry(trpc.tag.byIds, { ids: [tag.id, 'extra'] }),
      ),
    });
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });

    // Every item is a cache entry of its own, with its own result or error
    const [first, second] = data.post.tags.map((tag) =>
      resource.queryClient.getQueryState(
        fromHandle(trpc, experimental_handleOfItem(handles.tags, tag)).queryKey,
      ),
    );
    expect(first?.data).toEqual([{ id: 't1' }, { id: 'extra' }]);
    expect(second?.error).toMatchObject({ data: { code: 'FORBIDDEN' } });
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(1);
    expect(
      resource.calls.mock.calls.filter(([path]) => path === 'tag.byIds'),
    ).toHaveLength(2);
  });

  test("an entry per item of an infinite entry's pages loads with its first page", async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      before: [],
    });
    const trpc = resource.optionsProxyClient;

    const posts = ensureInfiniteEntry(trpc.post.byAuthor, { authorId: 'u1' });
    const [handles, data] = await loadHandles(trpc, {
      posts,
      authors: experimental_entryPerItem(
        experimental_dataOf(posts).pages.map((page) => page.items),
        (authorId) => ensureEntry(trpc.author.byId, { id: authorId }),
      ),
      // The first page is one request's result, which the server can read
      author: ensureEntry(trpc.author.byId, {
        id: experimental_dataOf(posts).pages[0]!.items[0]!,
      }),
    });
    expect(data.authors).toEqual([{ id: 'u1', name: 'KATT', teamId: 'team1' }]);
    expect(handles.author.input).toEqual({ id: 'u1' });
    expect(experimental_handleOfItem(handles.authors, 'u1')).toEqual(
      handles.author,
    );
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(1);
  });

  test('a cached entry in the middle keeps the request of the entries that read it, if the server filled in what the client did', async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      before: [],
    });
    const trpc = resource.optionsProxyClient;
    // As after a page that showed the author: cached, and still fresh
    resource.queryClient.setQueryDefaults(trpc.author.byId.pathKey(), {
      staleTime: Infinity,
    });
    await resource.queryClient.fetchQuery(
      trpc.author.byId.queryOptions({ id: 'u1' }),
    );
    resource.onRequestSpy.mockClear();

    const post = ensureEntry(trpc.post.bySlug, { slug: 'hello' });
    const author = prefetchEntry(
      trpc.author.byId,
      { id: experimental_dataOf(post).authorId },
      { staleTime: Infinity },
    );
    const [handles] = await loadHandles(trpc, {
      post,
      author,
      team: ensureEntry(trpc.team.byId, {
        id: experimental_dataOf(author).teamId,
      }),
    });
    expect(handles.team.input).toEqual({ id: 'team1' });
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(1);
  });

  test("entries built from each other's data load in one request, which the load does not wait for", async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 20,
      maxBatchSize: undefined,
      before: [],
    });
    const trpc = resource.optionsProxyClient;
    const { queryClient } = resource;

    const post = prefetchEntry(trpc.post.bySlug, { slug: 'hello' });
    const author = experimental_dataOf(post, (it) =>
      prefetchEntry(trpc.author.byId, { id: it.authorId }),
    );
    const [handles] = await loadHandles(trpc, {
      post,
      author,
      more: experimental_dataOf(author, (it) =>
        prefetchInfiniteEntry(trpc.post.byAuthor, { authorId: it.id }),
      ),
    });
    // The request hasn't left yet
    expect(resource.calls).not.toHaveBeenCalled();
    const postKey = fromHandle(trpc, handles.post).queryKey;
    const authorKey = trpc.author.byId.queryKey({ id: 'u1' });
    const moreKey = trpc.post.byAuthor.infiniteQueryKey({ authorId: 'u1' });
    // A query has no cache entry until its key is known
    expect(queryClient.getQueryState(authorKey)).toBeUndefined();

    // In the step that gives the cache a query's data, the query that is
    // built from it is there: a component that reads the data finds it
    const whenPublished: Record<string, unknown> = {};
    using _unsubscribe = makeResource(
      {},
      queryClient.getQueryCache().subscribe((event) => {
        if (event.type !== 'updated' || event.action.type !== 'success') {
          return;
        }
        if (event.query.queryHash === hashKey(postKey)) {
          whenPublished['author'] = queryClient.getQueryState(authorKey);
        }
        if (event.query.queryHash === hashKey(authorKey)) {
          whenPublished['more'] = queryClient.getQueryState(moreKey);
        }
      }),
    );

    await vi.waitFor(() => {
      expect(queryClient.getQueryData(moreKey)).toBeDefined();
    });
    await vi.waitFor(() => {
      expect(queryClient.isFetching()).toBe(0);
    });
    expect(whenPublished).toMatchObject({
      author: { fetchStatus: 'fetching' },
      more: { fetchStatus: 'fetching' },
    });

    expect(resource.onRequestSpy).toHaveBeenCalledTimes(1);
    expect(resource.onRequestSpy.mock.calls[0]![0].url).toContain(
      '/post.bySlug,author.byId,post.byAuthor?batch=pipeline',
    );
    expect(resource.calls.mock.calls.map(([path]) => path).sort()).toEqual([
      'author.byId',
      'post.byAuthor',
      'post.bySlug',
    ]);
    expect(queryClient.getQueryData(authorKey)).toEqual({
      id: 'u1',
      name: 'KATT',
      teamId: 'team1',
    });
  });

  test('the links see only the query whose request it is, with its whole input', async () => {
    const ops: Pick<Operation, 'path' | 'input'>[] = [];
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      before: [
        () => (linkOpts) => {
          ops.push({ path: linkOpts.op.path, input: linkOpts.op.input });
          return linkOpts.next(linkOpts.op);
        },
      ],
    });
    const trpc = resource.optionsProxyClient;
    const { queryClient } = resource;

    const post = prefetchEntry(trpc.post.bySlug, { slug: 'hello' });
    const author = experimental_dataOf(post, (it) =>
      prefetchEntry(trpc.author.byId, { id: it.authorId }),
    );
    await loadHandles(trpc, {
      post,
      author,
      more: experimental_dataOf(author, (it) =>
        prefetchInfiniteEntry(trpc.post.byAuthor, { authorId: it.id }),
      ),
    });

    await vi.waitFor(() => {
      expect(
        queryClient.getQueryData(
          trpc.post.byAuthor.infiniteQueryKey({ authorId: 'u1' }),
        ),
      ).toBeDefined();
    });
    // The others came back with its request. They were no operations, so no
    // link saw one with a hole in its input
    expect(ops).toEqual([{ path: 'post.bySlug', input: { slug: 'hello' } }]);
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(1);
    expect(resource.calls).toHaveBeenCalledTimes(3);
  });

  test('a link that shares the requests of identical queries does not mix up entries built from different data', async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      before: [dedupeLink()],
    });
    const trpc = resource.optionsProxyClient;
    const { queryClient } = resource;

    // Two pages, whose posts have different authors
    const first = prefetchEntry(trpc.post.paged, { cursor: 0 });
    const second = prefetchEntry(trpc.post.paged, { cursor: 1 });
    await loadHandles(trpc, {
      first,
      second,
      firstAuthor: experimental_dataOf(first, (page) =>
        prefetchEntry(trpc.author.byId, { id: page.items[0]!.authorId }),
      ),
      secondAuthor: experimental_dataOf(second, (page) =>
        prefetchEntry(trpc.author.byId, { id: page.items[0]!.authorId }),
      ),
    });

    await vi.waitFor(() => {
      expect(
        queryClient.getQueryData(trpc.author.byId.queryKey({ id: 'u0' })),
      ).toMatchObject({ id: 'u0' });
      expect(
        queryClient.getQueryData(trpc.author.byId.queryKey({ id: 'u1' })),
      ).toMatchObject({ id: 'u1' });
    });
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(1);
    expect(
      resource.calls.mock.calls.filter(([path]) => path === 'author.byId'),
    ).toEqual([
      ['author.byId', { id: 'u0' }],
      ['author.byId', { id: 'u1' }],
    ]);
  });

  test('an entry per item of a list of lists gets each item its own data', async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      before: [],
    });
    const trpc = resource.optionsProxyClient;

    const groups = ensureEntry(trpc.group.list);
    const [, data] = await loadHandles(trpc, {
      groups,
      members: experimental_entryPerItem(
        experimental_dataOf(groups).groups.map((group) => group.members),
        (id) => ensureEntry(trpc.author.byId, { id }),
      ),
    });
    // The server runs a call for the items of one list, so these are asked
    // for by themselves, each with its own id
    expect(data.members.map((member) => member.id)).toEqual(['u1', 'u2', 'u3']);
    expect(
      resource.calls.mock.calls.filter(([path]) => path === 'author.byId'),
    ).toEqual([
      ['author.byId', { id: 'u1' }],
      ['author.byId', { id: 'u2' }],
      ['author.byId', { id: 'u3' }],
    ]);
  });

  test("an entry per page of an infinite entry does not break the entry's request", async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      before: [],
    });
    const trpc = resource.optionsProxyClient;

    const posts = ensureInfiniteEntry(trpc.post.paged, {});
    const [, data] = await loadHandles(trpc, {
      posts,
      firstAuthors: experimental_entryPerItem(
        experimental_dataOf(posts).pages,
        (page) =>
          ensureEntry(trpc.author.byId, { id: page.items[0]!.authorId }),
      ),
    });
    expect(data.posts.pages).toHaveLength(1);
    expect(data.firstAuthors).toMatchObject([{ id: 'u0' }]);
  });

  test("an item's input can also have the whole list, in one request", async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      before: [],
    });
    const trpc = resource.optionsProxyClient;

    const post = ensureEntry(trpc.post.bySlug, { slug: 'hello' });
    const [, data] = await loadHandles(trpc, {
      post,
      tags: experimental_entryPerItem(experimental_dataOf(post).tags, (tag) =>
        ensureEntry(trpc.tag.byIds, {
          ids: experimental_dataOf(post).tags.map((each) => each.id),
          first: tag.id,
        }),
      ),
    });
    expect(data.tags).toEqual([
      [{ id: 't1' }, { id: 't2' }],
      [{ id: 't1' }, { id: 't2' }],
    ]);
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(1);
    expect(
      resource.calls.mock.calls.filter(([path]) => path === 'tag.byIds'),
    ).toEqual([
      ['tag.byIds', { ids: ['t1', 't2'], first: 't1' }],
      ['tag.byIds', { ids: ['t1', 't2'], first: 't2' }],
    ]);
  });

  test('when the server refuses a call for every item, each item asks by itself', async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      // The post's call and a run for each of its two tags are three
      maxBatchSize: 2,
      before: [],
    });
    const trpc = resource.optionsProxyClient;

    const post = ensureEntry(trpc.post.bySlug, { slug: 'hello' });
    const [, data] = await loadHandles(trpc, {
      post,
      tags: experimental_entryPerItem(experimental_dataOf(post).tags, (tag) =>
        ensureEntry(trpc.tag.byIds, { ids: [tag.id] }),
      ),
    });
    expect(data.tags).toEqual([[{ id: 't1' }], [{ id: 't2' }]]);
    // The refused request, and one for the two items
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(2);
  });

  test("an entry per item of a prefetch entry's list loads in one request, which the load does not wait for", async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 20,
      maxBatchSize: undefined,
      before: [],
    });
    const trpc = resource.optionsProxyClient;

    const post = prefetchEntry(trpc.post.bySlug, { slug: 'hello' });
    const [handles] = await loadHandles(trpc, {
      post,
      tags: experimental_entryPerItem(experimental_dataOf(post).tags, (tag) =>
        prefetchEntry(trpc.tag.byIds, { ids: [tag.id] }),
      ),
    });
    expect(resource.calls).not.toHaveBeenCalled();

    const tagKey = fromHandle(
      trpc,
      experimental_handleOfItem(handles.tags, { id: 't1' }),
    ).queryKey;
    await vi.waitFor(() => {
      expect(resource.queryClient.getQueryData(tagKey)).toEqual([{ id: 't1' }]);
    });
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(1);
    expect(resource.calls).toHaveBeenCalledTimes(3);
  });

  test("a later page loads its items' queries in the same request", async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      before: [],
    });
    const trpc = resource.optionsProxyClient;
    const getNextPageParam = (last: { nextCursor: number | null }) =>
      last.nextCursor;

    const posts = ensureInfiniteEntry(
      trpc.post.paged,
      {},
      { getNextPageParam },
    );
    const [loaded] = await loadHandles(trpc, {
      posts,
      authors: experimental_entryPerItem(
        experimental_dataOf(posts).pages.map((page) => page.items),
        (post) => prefetchEntry(trpc.author.byId, { id: post.authorId }),
      ),
    });
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(1);
    // The handles cross to the browser as JSON
    const handles: typeof loaded = JSON.parse(JSON.stringify(loaded));

    // What a component does when the list scrolls: read the handle, fetch more
    const observer = new InfiniteQueryObserver(resource.queryClient, {
      ...fromHandle(trpc, handles.posts, { getNextPageParam }),
      // The page that was loaded is fresh: mounting does not fetch it again
      staleTime: Infinity,
    });
    using _subscription = makeResource({}, observer.subscribe(vi.fn()));
    await observer.fetchNextPage();
    const data = await observer.fetchNextPage();
    expect(data.data?.pages).toHaveLength(3);
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });

    // One request for every page, with its author in it
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(3);
    for (const [req] of resource.onRequestSpy.mock.calls) {
      expect(req.url).toContain('/post.paged,author.byId?batch=pipeline');
    }
    // A row reads its author from the cache
    const lastPost = data.data!.pages[2]!.items[0]!;
    expect(
      resource.queryClient.getQueryData(
        fromHandle(trpc, experimental_handleOfItem(handles.authors, lastPost))
          .queryKey,
      ),
    ).toEqual({ id: 'u2', name: 'KATT', teamId: 'team1' });
    expect(
      resource.calls.mock.calls.filter(([path]) => path === 'author.byId'),
    ).toHaveLength(3);
  });

  test("a query that is fetched again loads its items' queries in the same request", async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      before: [],
    });
    const trpc = resource.optionsProxyClient;

    const post = ensureEntry(trpc.post.bySlug, { slug: 'hello' });
    const [handles] = await loadHandles(trpc, {
      post,
      tags: experimental_entryPerItem(experimental_dataOf(post).tags, (tag) =>
        prefetchEntry(trpc.tag.byIds, { ids: [tag.id] }),
      ),
    });
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
    resource.onRequestSpy.mockClear();
    resource.calls.mockClear();

    // As after an invalidation
    await resource.queryClient.fetchQuery({
      ...fromHandle(trpc, handles.post),
      staleTime: 0,
    });
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(1);
    expect(resource.calls.mock.calls.map(([path]) => path).sort()).toEqual([
      'post.bySlug',
      'tag.byIds',
      'tag.byIds',
    ]);
  });

  test('a second load of the same entries, as a hover and then a click make, adds no request', async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 50,
      maxBatchSize: undefined,
      before: [],
    });
    const trpc = resource.optionsProxyClient;
    const entries = () => {
      const post = ensureEntry(trpc.post.bySlug, { slug: 'hello' });
      const author = prefetchEntry(trpc.author.byId, {
        id: experimental_dataOf(post).authorId,
      });
      return {
        post,
        author,
        more: prefetchInfiniteEntry(trpc.post.byAuthor, {
          authorId: experimental_dataOf(author).id,
        }),
      };
    };

    const first = loadHandles(trpc, entries());
    // The first load's request has left
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = loadHandles(trpc, entries());
    const [[handles], [sameHandles]] = await Promise.all([first, second]);
    expect(sameHandles).toEqual(handles);
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });

    expect(resource.onRequestSpy).toHaveBeenCalledTimes(1);
    expect(resource.calls).toHaveBeenCalledTimes(3);
  });

  test('a cached source needs no pipelining', async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      before: [],
    });
    const trpc = resource.optionsProxyClient;
    await loadHandles(trpc, {
      post: ensureEntry(trpc.post.bySlug, { slug: 'hello' }),
    });
    resource.onRequestSpy.mockClear();

    const post = ensureEntry(
      trpc.post.bySlug,
      { slug: 'hello' },
      { staleTime: Infinity },
    );
    const [handles] = await loadHandles(trpc, {
      post,
      author: ensureEntry(trpc.author.byId, {
        id: experimental_dataOf(post).authorId,
      }),
    });
    expect(handles.author.input).toEqual({ id: 'u1' });
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(1);
    expect(resource.onRequestSpy.mock.calls[0]![0].url).not.toContain('pipe=');
  });

  test('a stale ensure entry is read from the cache, and what the server filled in from its refetch is not used', async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      before: [],
    });
    const trpc = resource.optionsProxyClient;
    // The cache has the post with another author than the server
    resource.queryClient.setQueryData(
      trpc.post.bySlug.queryKey({ slug: 'hello' }),
      { id: 'id-of-hello', title: 'Old', authorId: 'u0', tags: [] },
      { updatedAt: 1 },
    );

    const post = ensureEntry(trpc.post.bySlug, { slug: 'hello' });
    const [handles, data] = await loadHandles(trpc, {
      post,
      author: ensureEntry(trpc.author.byId, {
        id: experimental_dataOf(post).authorId,
      }),
    });
    // The handle's input and its data agree
    expect(handles.author.input).toEqual({ id: 'u0' });
    expect(data.author.id).toBe('u0');
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
    // The server filled in the new author, so the old one is fetched
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(2);
  });

  test("a stale ensure entry's cached cursor is the one an infinite entry's first page is for", async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      before: [],
    });
    const trpc = resource.optionsProxyClient;
    // The cache has the first page with another next cursor than the server
    resource.queryClient.setQueryData(
      trpc.post.paged.queryKey({ cursor: 0 }),
      { items: [{ id: 'p0', authorId: 'u0' }], nextCursor: 2 },
      { updatedAt: 1 },
    );

    const first = ensureEntry(trpc.post.paged, { cursor: 0 });
    const [, data] = await loadHandles(trpc, {
      first,
      rest: ensureInfiniteEntry(trpc.post.paged, {
        cursor: experimental_dataOf(first).nextCursor,
      }),
    });
    // The page and its param agree. The server filled in cursor 1, from the
    // refetch, and the keys of the two are the same
    expect(data.rest).toEqual({
      pages: [{ items: [{ id: 'p2', authorId: 'u2' }], nextCursor: null }],
      pageParams: [2],
    });
  });

  test('an entry that keeps its cached data makes the entry that reads it fetch with the input the client filled in', async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      before: [],
    });
    const trpc = resource.optionsProxyClient;
    // The cache has the author with another team than the server
    resource.queryClient.setQueryData(trpc.author.byId.queryKey({ id: 'u1' }), {
      id: 'u1',
      name: 'KATT',
      teamId: 'team0',
    });

    const post = fetchEntry(trpc.post.bySlug, { slug: 'hello' });
    const author = ensureEntry(trpc.author.byId, {
      id: experimental_dataOf(post).authorId,
    });
    const [handles, data] = await loadHandles(trpc, {
      post,
      author,
      team: fetchEntry(trpc.team.byId, {
        id: experimental_dataOf(author).teamId,
      }),
    });
    expect(handles.team.input).toEqual({ id: 'team0' });
    expect(data.team.id).toBe('team0');
  });

  test('a failed source rejects the load, and the entry that reads it starts no query', async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      before: [],
    });
    const trpc = resource.optionsProxyClient;

    const post = ensureEntry(trpc.post.bySlug, { slug: 'missing' });
    await expect(
      loadHandles(trpc, {
        post,
        author: prefetchEntry(trpc.author.byId, {
          id: experimental_dataOf(post).authorId,
        }),
      }),
    ).rejects.toMatchObject({ key: 'post', code: 'NOT_FOUND' });
    expect(resource.calls).not.toHaveBeenCalledWith(
      'author.byId',
      expect.anything(),
    );
    expect(
      resource.queryClient.getQueryCache().findAll({
        queryKey: trpc.author.byId.pathKey(),
      }),
    ).toHaveLength(0);
  });

  test('a source that is retried fetches the entry that reads it again', async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      before: [],
    });
    const trpc = resource.optionsProxyClient;
    let failed = false;
    resource.calls.mockImplementation((path: string) => {
      if (path === 'post.bySlug' && !failed) {
        failed = true;
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      }
    });

    const post = ensureEntry(
      trpc.post.bySlug,
      { slug: 'hello' },
      { retry: 1, retryDelay: 0 },
    );
    const [, data] = await loadHandles(trpc, {
      post,
      author: ensureEntry(trpc.author.byId, {
        id: experimental_dataOf(post).authorId,
      }),
    });
    expect(data.author).toEqual({ id: 'u1', name: 'KATT', teamId: 'team1' });
    // The pipelined batch, the retried post, then the author with its input
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(3);
  });

  test('a request that fails as a whole and that a link retries: the entry that reads it asks again', async () => {
    const { appRouter, calls } = createAppRouter();
    let failed = false;
    await using resource = testReactResource(appRouter, {
      server: { experimental_allowPipelining: true },
      client: (opts) => ({
        links: [
          retryLink({ retry: (retryOpts) => retryOpts.attempts < 2 }),
          scenario.link({
            url: opts.httpUrl,
            experimental_pipelining: experimental_pipelining(),
            fetch: async (input, init) => {
              if (!failed) {
                failed = true;
                throw new TypeError('fetch failed');
              }
              return fetch(input, init);
            },
          }),
        ],
      }),
    });
    const trpc = resource.optionsProxyClient;

    const post = ensureEntry(trpc.post.bySlug, { slug: 'hello' });
    const [, data] = await loadHandles(trpc, {
      post,
      author: ensureEntry(trpc.author.byId, {
        id: experimental_dataOf(post).authorId,
      }),
    });
    // Its call was in the request that failed, and never ran
    expect(data.author).toEqual({ id: 'u1', name: 'KATT', teamId: 'team1' });
    expect(calls.mock.calls).toEqual([
      ['post.bySlug', { slug: 'hello' }],
      ['author.byId', { id: 'u1' }],
    ]);
  });

  test('a cached list with more items than the server has: the item the server ran for none of asks by itself', async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      before: [],
    });
    const trpc = resource.optionsProxyClient;
    // The cache has a tag that the server's post has no more
    resource.queryClient.setQueryData(
      trpc.post.bySlug.queryKey({ slug: 'hello' }),
      {
        id: 'id-of-hello',
        title: 'Old',
        authorId: 'u1',
        tags: [{ id: 't1' }, { id: 't2' }, { id: 't3' }],
      },
      { updatedAt: 1 },
    );

    const post = ensureEntry(trpc.post.bySlug, { slug: 'hello' });
    const [, data] = await loadHandles(trpc, {
      post,
      teams: experimental_entryPerItem(experimental_dataOf(post).tags, (tag) =>
        ensureEntry(trpc.team.byId, { id: tag.id }),
      ),
    });
    expect(data.teams.map((team) => team.id)).toEqual(['t1', 't2', 't3']);
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
    // The post's refetch with the two teams the server found, then the third
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(2);
    expect(
      resource.calls.mock.calls.filter(([path]) => path === 'team.byId'),
    ).toEqual([
      ['team.byId', { id: 't1' }],
      ['team.byId', { id: 't2' }],
      ['team.byId', { id: 't3' }],
    ]);
  });

  test("an infinite entry's later page is not in its first request, so an entry that reads it asks afterwards", async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      before: [],
    });
    const trpc = resource.optionsProxyClient;
    const posts = ensureInfiniteEntry(
      trpc.post.paged,
      {},
      { getNextPageParam: (last) => last.nextCursor, pages: 2 },
    );
    const [, data] = await loadHandles(trpc, {
      posts,
      author: ensureEntry(trpc.author.byId, {
        id: experimental_dataOf(posts).pages[1]!.items[0]!.authorId,
      }),
    });
    expect(data.author.id).toBe('u1');
    // Two pages, then the author
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(3);
  });

  test('an infinite entry with a first cursor of its own loads that page in the same request', async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      before: [],
    });
    const trpc = resource.optionsProxyClient;
    const post = prefetchEntry(trpc.post.bySlug, { slug: 'hello' });
    const [handles] = await loadHandles(trpc, {
      post,
      more: experimental_dataOf(post, (it) =>
        prefetchInfiniteEntry(
          trpc.post.pagedByAuthor,
          { authorId: it.authorId },
          { initialCursor: 1 },
        ),
      ),
    });
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(1);
    expect(resource.calls.mock.calls).toEqual([
      ['post.bySlug', { slug: 'hello' }],
      ['post.pagedByAuthor', { authorId: 'u1', cursor: 1 }],
    ]);
    const more = experimental_handleOfItem(handles.more, {
      id: 'id-of-hello',
      title: 'Post hello',
      authorId: 'u1',
      tags: [],
    });
    expect(
      resource.queryClient
        .getQueryData(
          fromHandle(trpc, more, {
            getNextPageParam: (last) => last.nextCursor,
          }).queryKey,
        )
        ?.pages[0]?.items.map((item) => item.id),
    ).toEqual(['u1-p1-0', 'u1-p1-1']);
  });

  test('a cached infinite entry that starts at another page is fetched from that page, not from what the server ran', async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      before: [],
    });
    const trpc = resource.optionsProxyClient;
    const getNextPageParam = (last: { nextCursor: number | null }) =>
      last.nextCursor;
    // The cache has the author's list from its second page on, and it is stale
    resource.queryClient.setQueryData(
      trpc.post.pagedByAuthor.infiniteQueryKey({ authorId: 'u1' }),
      {
        pages: [{ items: [{ id: 'old', authorId: 'u0' }], nextCursor: 2 }],
        pageParams: [1],
      },
      { updatedAt: 1 },
    );

    const post = ensureEntry(trpc.post.bySlug, { slug: 'hello' });
    await loadHandles(trpc, {
      post,
      more: ensureInfiniteEntry(
        trpc.post.pagedByAuthor,
        { authorId: experimental_dataOf(post).authorId },
        { getNextPageParam },
      ),
    });
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
    // The server ran the first page in the post's request. The cache's list
    // starts at the second, which its refetch asks for
    expect(
      resource.calls.mock.calls.filter(
        ([path]) => path === 'post.pagedByAuthor',
      ),
    ).toEqual([
      ['post.pagedByAuthor', { authorId: 'u1' }],
      ['post.pagedByAuthor', { authorId: 'u1', cursor: 1 }],
    ]);
    expect(
      resource.queryClient
        .getQueryData(
          trpc.post.pagedByAuthor.infiniteQueryKey({ authorId: 'u1' }),
        )
        ?.pages[0]?.items.map((item) => item.id),
    ).toEqual(['u1-p1-0', 'u1-p1-1']);
  });

  /** A list by one author, with an author for every post, and a later page */
  const laterPage = async (
    resource: ReturnType<typeof pipeliningCtx>,
    listOpts: { authorId: string; proxy: 'root' | 'post' },
  ) => {
    const trpc = resource.optionsProxyClient;
    const getNextPageParam = (last: { nextCursor: number | null }) =>
      last.nextCursor;
    const posts = ensureInfiniteEntry(
      trpc.post.pagedByAuthor,
      { authorId: listOpts.authorId },
      { getNextPageParam },
    );
    const [handles] = await loadHandles(trpc, {
      posts,
      authors: experimental_entryPerItem(
        experimental_dataOf(posts).pages.map((page) => page.items),
        (post) => prefetchEntry(trpc.author.byId, { id: post.authorId }),
      ),
    });
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
    resource.onRequestSpy.mockClear();
    resource.calls.mockClear();
    const observer = new InfiniteQueryObserver(resource.queryClient, {
      ...(listOpts.proxy === 'root'
        ? fromHandle(trpc, handles.posts, { getNextPageParam })
        : fromHandle(trpc.post, handles.posts, { getNextPageParam })),
      staleTime: Infinity,
    });
    const unsubscribe = observer.subscribe(vi.fn());
    await observer.fetchNextPage();
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
    unsubscribe();
    return resource.calls.mock.calls;
  };

  test('a later page whose items the server refuses to run for: each item asks by itself', async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      // The first page and its one item fit. The second page has two
      maxBatchSize: 2,
      before: [],
    });
    const calls = await laterPage(resource, { authorId: 'a', proxy: 'root' });
    expect(calls).toEqual([
      ['post.pagedByAuthor', { authorId: 'a', cursor: 1 }],
      ['author.byId', { id: 'u0' }],
      ['author.byId', { id: 'u1' }],
    ]);
    // The page, then its items
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(2);
  });

  test('a later page that has no list loads no items', async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      before: [],
    });
    const calls = await laterPage(resource, {
      authorId: 'sparse',
      proxy: 'root',
    });
    expect(calls).toEqual([
      ['post.pagedByAuthor', { authorId: 'sparse', cursor: 1 }],
    ]);
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(1);
  });

  test("a later page read through a part of the router that its items' procedure is not in is an ordinary request", async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      before: [],
    });
    const calls = await laterPage(resource, { authorId: 'a', proxy: 'post' });
    // `trpc.post` has no `author.byId` to make queries of
    expect(calls).toEqual([
      ['post.pagedByAuthor', { authorId: 'a', cursor: 1 }],
    ]);
    expect(resource.onRequestSpy.mock.calls[0]![0].url).toContain('batch=1');
  });

  test("an entry's own error is not fetched twice", async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      before: [],
    });
    const trpc = resource.optionsProxyClient;
    resource.calls.mockImplementation((path: string) => {
      if (path === 'author.byId') {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
    });

    const post = ensureEntry(trpc.post.bySlug, { slug: 'hello' });
    await expect(
      loadHandles(trpc, {
        post,
        author: ensureEntry(trpc.author.byId, {
          id: experimental_dataOf(post).authorId,
        }),
      }),
    ).rejects.toMatchObject({ key: 'author', code: 'FORBIDDEN' });
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(1);
  });

  test('an infinite entry loads its first page in the same request', async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      before: [],
    });
    const trpc = resource.optionsProxyClient;
    const post = ensureEntry(trpc.post.bySlug, { slug: 'hello' });
    const [handles, data] = await loadHandles(trpc, {
      post,
      more: ensureInfiniteEntry(trpc.post.byAuthor, {
        authorId: experimental_dataOf(post).authorId,
      }),
    });
    expect(handles.more.input).toEqual({ authorId: 'u1' });
    expect(data.more).toEqual({
      pages: [{ items: ['u1'], nextCursor: null }],
      pageParams: [undefined],
    });
    expect(resource.calls).toHaveBeenCalledWith('post.byAuthor', {
      authorId: 'u1',
    });
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(1);

    // It reads the cache entry `infiniteQueryOptions(input)` would
    expect(
      resource.queryClient.getQueryData(
        trpc.post.byAuthor.infiniteQueryKey({ authorId: 'u1' }),
      ),
    ).toEqual(data.more);
  });
});

describe.each([
  { name: 'httpBatchLink', link: httpBatchLink },
  { name: 'httpBatchStreamLink', link: httpBatchStreamLink },
])('experimental_useHandles with $name', (scenario) => {
  /** A page without a loader: its component says what it loads */
  const postPage = (resource: ReturnType<typeof pipeliningCtx>) => {
    function pageEntries(trpc: TRPC, slug: string) {
      const post = prefetchEntry(trpc.post.bySlug, { slug });
      return {
        post,
        author: experimental_dataOf(post, (it) =>
          prefetchEntry(trpc.author.byId, { id: it.authorId }),
        ),
      };
    }
    function Post(props: {
      handles: experimental_inferHandles<typeof pageEntries>;
    }) {
      const trpc = resource.useTRPC();
      const post = useSuspenseQuery(fromHandle(trpc, props.handles.post));
      const author = useSuspenseQuery(
        fromHandle(
          trpc,
          experimental_handleOfItem(props.handles.author, post.data),
        ),
      );
      return <p>{`${post.data.title} by ${author.data.name}`}</p>;
    }
    const renders = vi.fn();
    function Page(props: { slug: string }) {
      const trpc = resource.useTRPC();
      const handles = experimental_useHandles(
        trpc,
        pageEntries(trpc, props.slug),
      );
      renders(handles);
      return <Post handles={handles} />;
    }
    return { Page, renders };
  };
  const ctxOpts = {
    link: scenario.link,
    latency: 0,
    maxBatchSize: undefined,
    before: [],
  };

  test('a component starts its entries in one request, and its Suspense boundary above it starts nothing again', async () => {
    await using resource = pipeliningCtx(ctxOpts);
    const { Page, renders } = postPage(resource);

    // The boundary is above the page, so the page renders again from nothing
    // when its queries have data
    const utils = resource.renderApp(
      <React.Suspense fallback="loading">
        <Page slug="hello" />
      </React.Suspense>,
    );
    expect(utils.container).toHaveTextContent('loading');
    await vi.waitFor(() => {
      expect(utils.container).toHaveTextContent('Post hello by KATT');
    });
    expect(renders.mock.calls.length).toBeGreaterThan(1);
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(1);
    expect(resource.calls.mock.calls).toEqual([
      ['post.bySlug', { slug: 'hello' }],
      ['author.byId', { id: 'u1' }],
    ]);

    // Rendering again gives the same handles, and starts nothing
    resource.rerenderApp(
      utils,
      <React.Suspense fallback="loading">
        <Page slug="hello" />
      </React.Suspense>,
    );
    expect(renders.mock.lastCall![0]).toBe(renders.mock.calls[0]![0]);
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(1);
  });

  test('other entries are another load, and so is the component coming back to the page', async () => {
    await using resource = pipeliningCtx(ctxOpts);
    const { Page } = postPage(resource);
    const page = (slug: string | null) => (
      <React.Suspense fallback="loading">
        {slug === null ? 'gone' : <Page slug={slug} />}
      </React.Suspense>
    );

    const utils = resource.renderApp(page('hello'));
    await vi.waitFor(() => {
      expect(utils.container).toHaveTextContent('Post hello by KATT');
    });

    resource.rerenderApp(utils, page('other'));
    await vi.waitFor(() => {
      expect(utils.container).toHaveTextContent('Post other by KATT');
    });
    // The other post, in one request, and its author's call with it
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(2);
    expect(resource.calls.mock.calls.slice(2)).toEqual([
      ['post.bySlug', { slug: 'other' }],
      ['author.byId', { id: 'u1' }],
    ]);

    resource.rerenderApp(utils, page(null));
    expect(utils.container).toHaveTextContent('gone');
    resource.calls.mockClear();
    resource.rerenderApp(utils, page('other'));
    // What the cache has shows at once, and the visit loads it again
    expect(utils.container).toHaveTextContent('Post other by KATT');
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
    expect(resource.calls.mock.calls).toEqual([
      ['post.bySlug', { slug: 'other' }],
      ['author.byId', { id: 'u1' }],
    ]);
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(3);
  });

  test('strict mode starts the entries once', async () => {
    await using resource = pipeliningCtx(ctxOpts);
    const { Page, renders } = postPage(resource);
    const page = () => (
      <React.StrictMode>
        <React.Suspense fallback="loading">
          <Page slug="hello" />
        </React.Suspense>
      </React.StrictMode>
    );
    const utils = resource.renderApp(page());
    await vi.waitFor(() => {
      expect(utils.container).toHaveTextContent('Post hello by KATT');
    });
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(1);
    expect(resource.calls).toHaveBeenCalledTimes(2);

    // Its effects ran, were undone and ran again. The load is still its own
    const rendered = renders.mock.calls.length;
    resource.rerenderApp(utils, page());
    expect(renders.mock.calls.length).toBeGreaterThan(rendered);
    expect(new Set(renders.mock.calls.map(([handles]) => handles)).size).toBe(
      1,
    );
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(1);
  });

  test('a query for every item of a list, a group, and a skipToken', async () => {
    await using resource = pipeliningCtx(ctxOpts);
    function listEntries(trpc: TRPC, draft: boolean) {
      const posts = prefetchInfiniteEntry(
        trpc.post.paged,
        {},
        { getNextPageParam: (last) => last.nextCursor },
      );
      return {
        posts,
        rows: {
          authors: experimental_entryPerItem(
            experimental_dataOf(posts).pages.map((page) => page.items),
            (post) => prefetchEntry(trpc.author.byId, { id: post.authorId }),
          ),
        },
        draft: draft
          ? prefetchEntry(trpc.post.bySlug, { slug: 'draft' })
          : skipToken,
      } satisfies TRPCLoadEntries;
    }
    function Row(props: {
      authors: experimental_inferHandles<typeof listEntries>['rows']['authors'];
      post: { id: string; authorId: string };
    }) {
      const trpc = resource.useTRPC();
      const author = useSuspenseQuery(
        fromHandle(trpc, experimental_handleOfItem(props.authors, props.post)),
      );
      return <li>{`${props.post.id} by ${author.data.id}`}</li>;
    }
    function List() {
      const trpc = resource.useTRPC();
      const handles = experimental_useHandles(trpc, listEntries(trpc, false));
      expect(handles.draft).toBeUndefined();
      const posts = useSuspenseInfiniteQuery(
        fromHandle(trpc, handles.posts, {
          getNextPageParam: (last) => last.nextCursor,
        }),
      );
      return (
        <ul>
          {posts.data.pages
            .flatMap((page) => page.items)
            .map((post) => (
              <Row key={post.id} authors={handles.rows.authors} post={post} />
            ))}
        </ul>
      );
    }
    const utils = resource.renderApp(
      <React.Suspense fallback="loading">
        <List />
      </React.Suspense>,
    );
    await vi.waitFor(() => {
      expect(utils.container).toHaveTextContent('p0 by u0');
    });
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(1);
    expect(resource.calls.mock.calls).toEqual([
      ['post.paged', {}],
      ['author.byId', { id: 'u0' }],
    ]);
  });

  test('a fetch or ensure entry starts and is not waited for: its error shows where it is read', async () => {
    await using resource = pipeliningCtx(ctxOpts);
    const errors = vi.fn();
    class Boundary extends React.Component<
      { children: React.ReactNode },
      { failed: boolean }
    > {
      override state = { failed: false };
      static getDerivedStateFromError() {
        return { failed: true };
      }
      override componentDidCatch(error: unknown) {
        errors(error);
      }
      override render() {
        return this.state.failed ? 'failed' : this.props.children;
      }
    }
    function Post(props: { post: inferQueryHandle<TRPC['post']['bySlug']> }) {
      const trpc = resource.useTRPC();
      const post = useSuspenseQuery({
        ...fromHandle(trpc, props.post),
        retry: false,
      });
      return <p>{post.data.title}</p>;
    }
    function Page() {
      const trpc = resource.useTRPC();
      const post = ensureEntry(
        trpc.post.bySlug,
        { slug: 'missing' },
        { retry: false },
      );
      const handles = experimental_useHandles(trpc, {
        post,
        fresh: fetchEntry(trpc.team.byId, { id: 'team1' }),
        author: experimental_dataOf(post, (it) =>
          prefetchEntry(trpc.author.byId, { id: it.authorId }),
        ),
      });
      expect(handles.fresh.input).toEqual({ id: 'team1' });
      return <Post post={handles.post} />;
    }
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const utils = resource.renderApp(
      <Boundary>
        <React.Suspense fallback="loading">
          <Page />
        </React.Suspense>
      </Boundary>,
    );
    await vi.waitFor(() => {
      expect(utils.container).toHaveTextContent('failed');
    });
    vi.restoreAllMocks();
    expect(errors.mock.calls[0]![0]).toMatchObject({
      data: { code: 'NOT_FOUND' },
    });
    // The author's entry never started
    expect(resource.calls.mock.calls.map(([path]) => path).sort()).toEqual([
      'post.bySlug',
      'team.byId',
    ]);
  });
});

describe('experimental_useHandles', () => {
  test('throws for a handle that needs data, before anything starts', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const errors = vi.fn();
    function Page(props: { entries: () => TRPCLoadEntries }) {
      try {
        experimental_useHandles(trpc, props.entries());
      } catch (error) {
        errors((error as Error).message);
      }
      return null;
    }

    const post = prefetchEntry(trpc.post.bySlug, { slug: 'hello' });
    resource.renderApp(
      <Page
        entries={() => ({
          post,
          author: prefetchEntry(trpc.author.byId, {
            id: experimental_dataOf(post).authorId,
          }),
        })}
      />,
    );
    const posts = ensureInfiniteEntry(
      trpc.post.paged,
      {},
      { getNextPageParam: (last) => last.nextCursor },
    );
    resource.renderApp(
      <Page
        entries={() => ({
          posts,
          authors: experimental_entryPerItem(
            experimental_dataOf(posts).pages.map((page) => page.items),
            (item) => prefetchEntry(trpc.author.byId, { id: item.authorId }),
          ),
        })}
      />,
    );
    // Entries that read an entry that isn't in the load
    const elsewhere = prefetchEntry(trpc.post.bySlug, { slug: 'elsewhere' });
    resource.renderApp(
      <Page
        entries={() => ({
          author: prefetchEntry(trpc.author.byId, {
            id: experimental_dataOf(elsewhere).authorId,
          }),
        })}
      />,
    );
    resource.renderApp(
      <Page
        entries={() => ({
          author: experimental_dataOf(elsewhere, (it) =>
            prefetchEntry(trpc.author.byId, { id: it.authorId }),
          ),
        })}
      />,
    );
    expect(errors.mock.calls).toMatchInlineSnapshot(`
      Array [
        Array [
          "The handle of the entry for "author" has another entry's data in its input, and \`experimental_useHandles()\` doesn't wait for data. Build the entry from that data, with \`experimental_dataOf(entry, (data) => entry)\`, or wait in a loader with \`loadHandles()\`",
        ],
        Array [
          "The handle of the entry for "authors" has another entry's data in its input, and \`experimental_useHandles()\` doesn't wait for data. Make the entry of its list a prefetch entry, and read nothing else of the list in its input, or wait in a loader with \`loadHandles()\`",
        ],
        Array [
          "The entry for "author" reads the data of an entry with \`experimental_dataOf()\` that isn't in this load. Add that entry to the load",
        ],
        Array [
          "The entry for "author" reads the data of an entry with \`experimental_dataOf()\` that isn't in this load. Add that entry to the load",
        ],
      ]
    `);
    // Nothing started: no query was made, also none that would have loaded
    expect(resource.queryClient.getQueryCache().getAll()).toEqual([]);
    expect(resource.calls).not.toHaveBeenCalled();
    expect(() =>
      experimental_useHandles(trpc.post as any, {}),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: \`experimental_useHandles()\` takes the root proxy, \`trpc\`, got \`trpc.post\`]`,
    );
  });

  test('two components with the same entries share one load, until the last of them leaves', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const seen: unknown[] = [];
    function Card() {
      seen.push(
        experimental_useHandles(trpc, {
          post: prefetchEntry(trpc.post.bySlug, { slug: 'hello' }),
        }),
      );
      return null;
    }
    const page = (cards: number) =>
      Array.from({ length: cards }, (_, index) => <Card key={index} />);
    const utils = resource.renderApp(page(2));
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
    expect(resource.calls).toHaveBeenCalledTimes(1);

    // One leaves. The other keeps the load
    resource.rerenderApp(utils, page(1));
    expect(new Set(seen).size).toBe(1);
    expect(resource.calls).toHaveBeenCalledTimes(1);

    // Both gone, and one comes back: it loads again
    resource.rerenderApp(utils, page(0));
    resource.rerenderApp(utils, page(1));
    expect(new Set(seen).size).toBe(2);
    await vi.waitFor(() => {
      expect(resource.calls).toHaveBeenCalledTimes(2);
    });
  });

  test('the same query with another option for how it starts is another load. Its `meta` is not compared', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const seen: unknown[] = [];
    // Anything can be in `meta`: what has no JSON, or is new on every render
    const circular: Record<string, unknown> = { big: 1n, at: Date.now() };
    circular['self'] = circular;
    function Card(props: {
      staleTime: number | undefined;
      meta: Record<string, unknown> | undefined;
    }) {
      seen.push(
        experimental_useHandles(trpc, {
          post: prefetchEntry(
            trpc.post.bySlug,
            { slug: 'hello' },
            { staleTime: props.staleTime, meta: props.meta },
          ),
        }),
      );
      return null;
    }
    resource.renderApp(
      <>
        <Card staleTime={undefined} meta={undefined} />
        <Card staleTime={undefined} meta={circular} />
        <Card staleTime={60_000} meta={undefined} />
      </>,
    );
    // The first two share a load. The third started its own entries
    expect(seen[1]).toBe(seen[0]);
    expect(seen[2]).not.toBe(seen[0]);
    expect(seen[2]).toEqual(seen[0]);
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
  });

  test('an option that has no JSON is not read as one that is left out', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const seen: unknown[] = [];
    function Card(props: {
      staleTime: number | undefined;
      retry: ((count: number) => boolean) | undefined;
    }) {
      seen.push(
        experimental_useHandles(trpc, {
          post: prefetchEntry(
            trpc.post.bySlug,
            { slug: 'hello' },
            { staleTime: props.staleTime, retry: props.retry },
          ),
        }),
      );
      return null;
    }
    resource.renderApp(
      <>
        <Card staleTime={undefined} retry={undefined} />
        <Card staleTime={Infinity} retry={undefined} />
        <Card staleTime={undefined} retry={() => false} />
        {/* Which function it is isn't compared: an inline one is new on every render */}
        <Card staleTime={undefined} retry={() => false} />
      </>,
    );
    expect(seen[1]).not.toBe(seen[0]);
    expect(seen[2]).not.toBe(seen[0]);
    expect(seen[2]).not.toBe(seen[1]);
    expect(seen[3]).toBe(seen[2]);
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
  });

  test('a first cursor that has no JSON does not stop the component from rendering', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const seen: Record<string, any>[] = [];
    function List() {
      seen.push(
        experimental_useHandles(trpc, {
          posts: prefetchInfiniteEntry(
            trpc.post.paged,
            {},
            // Against its type, as an app with a transformer for it can have
            { initialCursor: 5n as unknown as number },
          ),
        }),
      );
      return null;
    }
    const utils = resource.renderApp(<List />);
    resource.rerenderApp(utils, <List />);
    expect(seen[0]!['posts'].initialCursor).toBe(5n);
    expect(seen[1]).toBe(seen[0]);
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
  });

  test('entries under other keys are another load, also when the keys read the same joined with dots', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const author = () => prefetchEntry(trpc.author.byId, { id: 'u1' });
    const seen: Record<string, unknown>[] = [];
    function Card(props: { entries: TRPCLoadEntries }) {
      seen.push(experimental_useHandles(trpc, props.entries));
      return null;
    }
    resource.renderApp(
      <>
        <Card entries={{ card: { author: author() } }} />
        <Card entries={{ 'card.author': author() }} />
        <Card entries={{ card: { author: author() }, empty: {} }} />
      </>,
    );
    // Each has handles in the shape of its own entries
    expect(seen.map((handles) => Object.keys(handles))).toEqual([
      ['card'],
      ['card.author'],
      ['card', 'empty'],
    ]);
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
  });

  test('a component that never got on the page keeps its handles for 30 seconds, then loads again', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    using _timers = makeResource({}, () => vi.useRealTimers());
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const seen: unknown[] = [];
    function Page(props: { fail: boolean }) {
      const handles = experimental_useHandles(trpc, {
        post: prefetchEntry(trpc.post.bySlug, { slug: 'hello' }),
      });
      seen.push(handles);
      if (props.fail) {
        throw new Error('It never mounts');
      }
      return null;
    }
    class Boundary extends React.Component<{ children: React.ReactNode }> {
      override state = { failed: false };
      static getDerivedStateFromError() {
        return { failed: true };
      }
      override render() {
        return this.state.failed ? null : this.props.children;
      }
    }
    /** Renders the page, which throws before it gets on the page */
    const renderOffPage = () => {
      seen.length = 0;
      resource.renderApp(
        <Boundary>
          <Page fail />
        </Boundary>,
      );
      return seen[0];
    };

    const first = renderOffPage();
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
    expect(resource.calls).toHaveBeenCalledTimes(1);

    // Until 30 seconds after its queries settled, it has the same load, as
    // when a Suspense boundary above it shows it again. `vi.waitFor()` moved
    // the clock by one of its 50 ms steps at most
    await vi.advanceTimersByTimeAsync(29_900);
    expect(renderOffPage()).toBe(first);
    expect(resource.calls).toHaveBeenCalledTimes(1);

    // Then nothing is kept: it loads again
    await vi.advanceTimersByTimeAsync(200);
    const second = renderOffPage();
    expect(second).not.toBe(first);
    await vi.waitFor(() => {
      expect(resource.calls).toHaveBeenCalledTimes(2);
    });

    // On the page, it keeps its load however long it is there
    seen.length = 0;
    const onPage = resource.renderApp(<Page fail={false} />);
    expect(seen[0]).toBe(second);
    await vi.advanceTimersByTimeAsync(120_000);
    resource.rerenderApp(onPage, <Page fail={false} />);
    expect(seen.at(-1)).toBe(second);
    expect(resource.calls).toHaveBeenCalledTimes(2);
  });
});
