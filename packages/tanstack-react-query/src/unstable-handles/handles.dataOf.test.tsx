import { testReactResource } from '../../test/__helpers';
import { fakeTimersResource } from '@trpc/server/__tests__/fakeTimersResource';
import {
  hashKey,
  InfiniteQueryObserver,
  isCancelledError,
  onlineManager,
  skipToken,
  useQuery,
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
import type { experimental_PipeliningOptions } from '@trpc/server/unstable-core-do-not-import';
import { makeResource } from '@trpc/server/unstable-core-do-not-import';
import * as React from 'react';
import superjson from 'superjson';
import { describe, expect, expectTypeOf, test, vi } from 'vitest';
import { z } from 'zod';
import {
  experimental_dataOf,
  ensureEntry,
  experimental_entryPerItem,
  ensureInfiniteEntry,
  fetchEntry,
  fetchInfiniteEntry,
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
  let changes = 0;
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
      /** The direction of a page it is asked for, and the order it would be in */
      directed: t.procedure
        .input(
          z.object({
            order: z.string(),
            cursor: z.number().nullish(),
            direction: z.enum(['forward', 'backward']).optional(),
          }),
        )
        .query((opts) => {
          calls('post.directed', opts.input);
          return { direction: opts.input.direction, nextCursor: null };
        }),
      /** Which cursor its page is for: none, `null` or a number */
      cursorKind: t.procedure
        .input(z.object({ cursor: z.number().nullish() }))
        .query((opts) => ({
          cursor:
            opts.input.cursor === undefined
              ? 'missing'
              : (opts.input.cursor ?? 'null'),
          nextCursor: null,
        })),
      /** A page for a cursor with an offset and an optional start */
      sincePaged: t.procedure
        .input(
          z.object({
            cursor: z
              .object({ offset: z.number(), since: z.number().optional() })
              .nullish(),
          }),
        )
        .query((opts) => {
          calls('post.sincePaged', opts.input);
          return { cursor: opts.input.cursor ?? null, nextCursor: null };
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
      /** Another list with every call: the tag `c0`, then `c1` */
      changing: t.procedure.query(() => {
        calls('post.changing', undefined);
        return { tags: [{ id: `c${changes++}` }] };
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
      /** Data that looks like the results of a call for every item */
      likeResults: t.procedure
        .input(z.object({ authorId: z.string() }))
        .query((opts) => {
          calls('post.likeResults', opts.input);
          return [{ result: { data: 'inner' } }];
        }),
    }),
    author: t.router({
      byId: t.procedure.input(z.object({ id: z.string() })).query((opts) => {
        calls('author.byId', opts.input);
        return { id: opts.input.id, name: 'KATT', teamId: 'team1' };
      }),
      /** An author, or `null` for no id: its input takes `null` */
      maybe: t.procedure
        .input(z.object({ id: z.string().nullable() }))
        .query((opts) => {
          calls('author.maybe', opts.input);
          return opts.input.id === null
            ? null
            : { id: opts.input.id, name: 'KATT', teamId: 'team1' };
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
      /** A list of lists with no object around it: every group's members */
      memberLists: t.procedure.query(() => [['u1', 'u2'], ['u3']]),
      /** Lists that aren't there, against their types */
      sparse: t.procedure.query(() => ({
        groups: [{ members: ['u1'] }, { members: null as unknown as string[] }],
        owners: null as unknown as string[],
        leads: [{ id: 'u1' }, { id: null as unknown as string }],
        /** Ids, of which one is `null`, as their type says */
        maybeIds: ['u1', null] as (string | null)[],
      })),
    }),
    big: t.router({
      /** Ids that no query key can hold */
      ids: t.procedure.query(() => ({ first: 1n, all: [1n, 2n] })),
      /** Ids of which the second is one no query key can hold */
      mixed: t.procedure.query(() => ({ ids: ['u1', 1n, 'u2'] as unknown[] })),
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
  /** The server's `experimental_allowPipelining` */
  allowPipelining: true | experimental_PipeliningOptions;
  /** The links before the batch link */
  before: TRPCLink<AnyRouter>[];
}) => {
  const { appRouter, calls } = createAppRouter();
  const resource = testReactResource(appRouter, {
    server: {
      experimental_allowPipelining: ctxOpts.allowPipelining,
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

  test('loadHandlesSettled rejects for a failed prefetch entry at a key with a dot in it, next to a waited entry of the same name', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;

    const failing = prefetchEntry(trpc.post.bySlug, { slug: 'missing' });
    await expect(
      loadHandlesSettled(trpc, {
        card: { post: ensureEntry(trpc.post.bySlug, { slug: 'hello' }) },
        'card.post': failing,
        author: prefetchEntry(trpc.author.byId, {
          id: experimental_dataOf(failing).authorId,
        }),
      }),
    ).rejects.toMatchObject({ key: 'card.post', code: 'NOT_FOUND' });
  });

  test('a `null` cursor read from data stays `null` in the handle, and when the handle is read again', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;

    // The last page: its `nextCursor` is `null`
    const last = ensureEntry(trpc.post.paged, { cursor: 2 });
    const [handles] = await loadHandles(trpc, {
      last,
      next: prefetchInfiniteEntry(trpc.post.cursorKind, {
        cursor: experimental_dataOf(last).nextCursor,
      }),
    });
    expect(handles.next.initialCursor).toBeNull();

    // Read with nothing in the cache, as another page would
    resource.queryClient.clear();
    const data = await resource.queryClient.fetchInfiniteQuery(
      fromHandle(trpc, handles.next, {
        getNextPageParam: (page) => page.nextCursor,
      }),
    );
    expect(data.pages).toEqual([{ cursor: 'null', nextCursor: null }]);
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
      `[Error: A \`experimental_dataOf()\` value has no data until the load runs, so it can only be passed on as it is, as an entry's input or anywhere inside it. Of an array's methods, only \`.map()\` works, to read a part of every item, and \`.flatMap()\`, for the list of \`experimental_entryPerItem()\`]`,
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

  test("a list's handle doesn't load an entry per item with a `trpc.context` of its own in its later fetches", async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;

    const posts = ensureEntry(trpc.post.byAuthor, { authorId: 'u1' });
    const [handles] = await loadHandles(trpc, {
      posts,
      authors: experimental_entryPerItem(
        experimental_dataOf(posts).items,
        (id) =>
          prefetchEntry(
            trpc.author.byId,
            { id },
            { trpc: { context: { route: 'authors' } } },
          ),
      ),
    });
    expect(handles.posts.experimental_perItem).toBeUndefined();
  });

  test("a list's handle doesn't load, in later fetches, an entry per item of the first page only, or of a list with a `trpc.context` of its own", async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const getNextPageParam = (last: { nextCursor: number | null }) =>
      last.nextCursor;

    const posts = ensureInfiniteEntry(
      trpc.post.paged,
      {},
      { getNextPageParam },
    );
    const routed = ensureEntry(
      trpc.post.byAuthor,
      { authorId: 'u1' },
      { trpc: { context: { route: 'posts' } } },
    );
    const [handles] = await loadHandles(trpc, {
      posts,
      // The first page's items only: a later page has other items
      firstPageAuthors: experimental_entryPerItem(
        experimental_dataOf(posts).pages[0]!.items,
        (post) => prefetchEntry(trpc.author.byId, { id: post.authorId }),
      ),
      routed,
      routedAuthors: experimental_entryPerItem(
        experimental_dataOf(routed).items,
        (id) => prefetchEntry(trpc.author.byId, { id }),
      ),
    });
    expect(handles.posts.experimental_perItem).toBeUndefined();
    expect(handles.routed.experimental_perItem).toBeUndefined();
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
  test('a cursor partly from the data it is built from is finished with that data', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;

    const first = ensureEntry(trpc.post.paged, { cursor: 0 });
    const [handles, data] = await loadHandles(trpc, {
      first,
      rest: experimental_dataOf(first, (it) =>
        prefetchInfiniteEntry(trpc.post.sincePaged, {
          cursor: { offset: 5, since: it.nextCursor! },
        }),
      ),
    });
    expect(experimental_handleOfItem(handles.rest, data.first)).toEqual({
      queryKey: trpc.post.sincePaged.infiniteQueryKey({}),
      input: {},
      initialCursor: { offset: 5, since: 1 },
    });
  });

  test('an initialCursor option wins over a cursor from the data', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;

    const first = ensureEntry(trpc.post.paged, { cursor: 0 });
    const [handles, data] = await loadHandles(trpc, {
      first,
      rest: experimental_dataOf(first, (it) =>
        prefetchInfiniteEntry(
          trpc.post.sincePaged,
          { cursor: { offset: 5, since: it.nextCursor! } },
          { initialCursor: { offset: 7 } },
        ),
      ),
    });
    expect(
      experimental_handleOfItem(handles.rest, data.first).initialCursor,
    ).toEqual({ offset: 7 });
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

  test('a list that is not there has no items', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const sparse = ensureEntry(trpc.group.sparse);
    const [, data] = await loadHandles(trpc, {
      sparse,
      owners: experimental_entryPerItem(
        experimental_dataOf(sparse).owners,
        (id) => ensureEntry(trpc.author.byId, { id }),
      ),
    });
    expect(data.owners).toEqual([]);
  });

  test('a `null` in a list is an item like any other: it gets a query, with `null` read from it', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const sparse = ensureEntry(trpc.group.sparse);
    const maybe = (id: string) => ensureEntry(trpc.author.maybe, { id });
    const [, data] = await loadHandles(trpc, {
      sparse,
      // A list of lists, of which one is `null`, against its type. What isn't
      // a list has no items, as the server walks it
      members: experimental_entryPerItem(
        experimental_dataOf(sparse).groups.flatMap((group) => group.members),
        maybe,
      ),
      // A value that `.map()` read is `null`
      leads: experimental_entryPerItem(
        experimental_dataOf(sparse).leads.map((lead) => lead.id),
        maybe,
      ),
      // As the list's type says
      maybeIds: experimental_entryPerItem(
        experimental_dataOf(sparse).maybeIds,
        (id) => ensureEntry(trpc.author.maybe, { id }),
      ),
    });
    const author = { id: 'u1', name: 'KATT', teamId: 'team1' };
    expect(data.members).toEqual([author]);
    expect(data.leads).toEqual([author, null]);
    expect(data.maybeIds).toEqual([author, null]);
    expect(resource.calls).toHaveBeenCalledWith('author.maybe', { id: null });
  });

  test('`null` as an input is a type error unless the procedure takes it, and the callback returns an entry', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const sparse = ensureEntry(trpc.group.sparse);
    experimental_entryPerItem(experimental_dataOf(sparse).maybeIds, (id) =>
      // @ts-expect-error `author.byId` takes no `null`
      prefetchEntry(trpc.author.byId, { id }),
    );
    experimental_entryPerItem(experimental_dataOf(sparse).maybeIds, (id) =>
      prefetchEntry(trpc.author.maybe, { id }),
    );
    expect(() =>
      experimental_entryPerItem(
        experimental_dataOf(sparse).maybeIds,
        // @ts-expect-error the callback returns an entry, not `null`
        () => null,
      ),
    ).toThrow('must return an entry');
    // A prefetch entry can be skipped. One the load waits for can't
    prefetchEntry(trpc.author.byId, skipToken);
    prefetchInfiniteEntry(trpc.post.paged, skipToken);
    // @ts-expect-error the load would wait for data that never comes
    ensureEntry(trpc.author.byId, skipToken);
    // @ts-expect-error the load would wait for data that never comes
    fetchEntry(trpc.author.byId, skipToken);
  });

  test('a prefetch entry with `skipToken` starts nothing: its handle reads a disabled query, also from JSON', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const [handles] = await loadHandles(trpc, {
      draft: prefetchEntry(trpc.post.bySlug, skipToken),
      more: prefetchInfiniteEntry(trpc.post.paged, skipToken),
    });
    expect(handles.draft.skipped).toBe(true);
    expect(handles.more.skipped).toBe(true);
    // As a loader passes it to a component
    const draft = JSON.parse(JSON.stringify(handles.draft));
    const options = fromHandle(trpc, draft);
    expect(options.queryFn).toBe(skipToken);
    expect(
      fromHandle(trpc, handles.more, {
        getNextPageParam: (last) => last.nextCursor,
      }).queryFn,
    ).toBe(skipToken);
    expect(
      resource.queryClient.getQueryState(options.queryKey),
    ).toBeUndefined();
    expect(resource.calls).not.toHaveBeenCalled();
  });

  test('an entry that reads the data of an entry with `skipToken` fails, and says why', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const draft = prefetchEntry(trpc.post.bySlug, skipToken);
    // A prefetch entry has no result to say so in, so the load rejects
    await expect(
      loadHandlesSettled(trpc, {
        draft,
        author: ensureEntry(trpc.author.byId, {
          id: experimental_dataOf(draft).authorId,
        }),
      }),
    ).rejects.toThrow(
      '"draft" has `skipToken` as its input, so it has no data for the entries that read it',
    );
    expect(resource.calls).not.toHaveBeenCalled();
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

  test("an item whose query can't start fails by itself, and the items after it still load", async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const mixed = ensureEntry(trpc.big.mixed);
    const [, results] = await loadHandlesSettled(trpc, {
      mixed,
      authors: experimental_entryPerItem(experimental_dataOf(mixed).ids, (id) =>
        ensureEntry(trpc.author.byId, { id: id as string }),
      ),
    });
    expect(results.authors).toMatchObject([
      { status: 'success', data: { id: 'u1' } },
      { status: 'error' },
      { status: 'success', data: { id: 'u2' } },
    ]);
  });

  test("an entry whose input from another's data can't start fails by itself, and the entries beside it still load", async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const ids = ensureEntry(trpc.big.ids);
    const [handles, results] = await loadHandlesSettled(trpc, {
      ids,
      one: ensureEntry(trpc.big.byId, { id: experimental_dataOf(ids).first }),
      author: ensureEntry(trpc.author.byId, { id: 'u1' }),
    });
    expect(results.ids).toMatchObject({ status: 'success' });
    expect(results.author).toMatchObject({
      status: 'success',
      data: { id: 'u1' },
    });
    expect(results.one.status).toBe('error');
    const error = results.one.status === 'error' ? results.one.error : null;
    expect(isTRPCEntryError(error)).toBe(true);
    expect(error?.key).toBe('one');
    expect(error?.message).toContain('BigInt');
    expect(handles.author).toBeDefined();
  });

  test("an entry whose input from another's data can't start has no handle in loadHandlesSettled", async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const ids = ensureEntry(trpc.big.ids);
    const [handles, results] = await loadHandlesSettled(trpc, {
      ids,
      one: ensureEntry(trpc.big.byId, { id: experimental_dataOf(ids).first }),
    });
    expect(results.one.status).toBe('error');
    // Its query never started, so a handle would read nothing
    expect(Object.keys(handles)).toEqual(['ids']);
  });

  test('a prefetch entry whose request fails after a cache write while it ran fails the entries that read it', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const post = prefetchEntry(trpc.post.bySlug, { slug: 'missing' });
    const loaded = loadHandles(trpc, {
      post,
      author: ensureEntry(trpc.author.byId, {
        id: experimental_dataOf(post).authorId,
      }),
    });
    // While the post's request runs, which then fails
    resource.queryClient.setQueryData(
      trpc.post.bySlug.queryKey({ slug: 'missing' }),
      {
        id: 'written',
        title: 'Written',
        authorId: 'u1',
        tags: [],
      },
    );
    const error = await loaded.then(
      () => null,
      (rejected: unknown) => rejected,
    );
    expect(isTRPCEntryError(error) && error.code).toBe('NOT_FOUND');
    expect(
      resource.calls.mock.calls.filter(([path]) => path === 'author.byId'),
    ).toEqual([]);
  });

  test('a prefetch entry whose first fetch is cancelled stops the entries that read it with the cancellation', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const post = prefetchEntry(trpc.post.bySlug, { slug: 'hello' });
    const loaded = loadHandles(trpc, {
      post,
      author: ensureEntry(trpc.author.byId, {
        id: experimental_dataOf(post).authorId,
      }),
    });
    // With `revert`, as by default: the query goes back to having no data
    // and no error
    await resource.queryClient.cancelQueries({
      queryKey: trpc.post.bySlug.queryKey({ slug: 'hello' }),
    });
    const error = await loaded.then(
      () => null,
      (rejected: unknown) => rejected,
    );
    expect(isCancelledError(error)).toBe(true);
    expect(
      resource.calls.mock.calls.filter(([path]) => path === 'author.byId'),
    ).toEqual([]);
  });

  test('a prefetch entry the cache has fresh data for gives the entries that read it that data, not a later write', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const key = trpc.post.bySlug.queryKey({ slug: 'hello' });
    const postOf = (authorId: string) => ({
      id: 'id-of-hello',
      title: 'Post hello',
      authorId,
      tags: [],
    });
    resource.queryClient.setQueryData(key, postOf('u1'));
    const post = prefetchEntry(
      trpc.post.bySlug,
      { slug: 'hello' },
      { staleTime: Infinity },
    );
    const loaded = loadHandles(trpc, {
      post,
      author: ensureEntry(trpc.author.byId, {
        id: experimental_dataOf(post).authorId,
      }),
    });
    // After the load selected the cache's data, which it fetched nothing for
    resource.queryClient.setQueryData(key, postOf('u2'));
    const [handles, data] = await loaded;
    expect(handles.author.input).toEqual({ id: 'u1' });
    expect(data.author).toEqual({ id: 'u1', name: 'KATT', teamId: 'team1' });
  });

  test("a cache write as a prefetch entry's request succeeds is in neither its items' queries nor the handle", async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const key = trpc.post.bySlug.queryKey({ slug: 'hello' });
    const post = prefetchEntry(trpc.post.bySlug, { slug: 'hello' });
    const loaded = loadHandles(trpc, {
      post,
      tags: experimental_entryPerItem(experimental_dataOf(post).tags, (tag) =>
        prefetchEntry(trpc.tag.byIds, {
          ids: experimental_dataOf(post).tags.map((each) => each.id),
          first: tag.id,
        }),
      ),
    });
    // After the load's own listener: like a `QueryCache` `onSuccess` that
    // writes to the query it is told of
    const cache = resource.queryClient.getQueryCache();
    using _subscription = makeResource(
      {},
      cache.subscribe((event) => {
        if (
          event.type === 'updated' &&
          event.action.type === 'success' &&
          !event.action.manual &&
          event.query.queryHash === hashKey(key)
        ) {
          resource.queryClient.setQueryData(key, {
            id: 'written',
            title: 'Written',
            authorId: 'u1',
            tags: [{ id: 'w1' }],
          });
        }
      }),
    );
    const [handles] = await loaded;
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
    // The handle's input is the one the item's query was started with
    expect(experimental_handleOfItem(handles.tags, { id: 't1' }).input).toEqual(
      { ids: ['t1', 't2'], first: 't1' },
    );
    expect(
      resource.calls.mock.calls.filter(([path]) => path === 'tag.byIds'),
    ).toEqual([
      ['tag.byIds', { ids: ['t1', 't2'], first: 't1' }],
      ['tag.byIds', { ids: ['t1', 't2'], first: 't2' }],
    ]);
  });

  test("a cache write as a prefetch entry's request succeeds, from a listener before the load's, is in neither its items' queries nor the handle", async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const key = trpc.post.bySlug.queryKey({ slug: 'hello' });
    // Before the load's own listener: it is told of the success after this
    // one wrote to the query
    const cache = resource.queryClient.getQueryCache();
    using _subscription = makeResource(
      {},
      cache.subscribe((event) => {
        if (
          event.type === 'updated' &&
          event.action.type === 'success' &&
          !event.action.manual &&
          event.query.queryHash === hashKey(key)
        ) {
          resource.queryClient.setQueryData(key, {
            id: 'written',
            title: 'Written',
            authorId: 'u1',
            tags: [{ id: 'w1' }],
          });
        }
      }),
    );
    const post = prefetchEntry(trpc.post.bySlug, { slug: 'hello' });
    const [handles] = await loadHandles(trpc, {
      post,
      tags: experimental_entryPerItem(experimental_dataOf(post).tags, (tag) =>
        prefetchEntry(trpc.tag.byIds, {
          ids: experimental_dataOf(post).tags.map((each) => each.id),
          first: tag.id,
        }),
      ),
    });
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
    expect(experimental_handleOfItem(handles.tags, { id: 't1' }).input).toEqual(
      { ids: ['t1', 't2'], first: 't1' },
    );
    expect(
      resource.calls.mock.calls.filter(([path]) => path === 'tag.byIds'),
    ).toEqual([
      ['tag.byIds', { ids: ['t1', 't2'], first: 't1' }],
      ['tag.byIds', { ids: ['t1', 't2'], first: 't2' }],
    ]);
  });

  test("the entries that read a fetch entry fill in the cache's data, after its structural sharing", async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const key = trpc.post.bySlug.queryKey({ slug: 'hello' });
    // The cache keeps the data it has: the fetch resolves to what it fetched
    resource.queryClient.setQueryDefaults(key, {
      structuralSharing: (previous: unknown, next: unknown) => previous ?? next,
    });
    resource.queryClient.setQueryData(key, {
      id: 'cached',
      title: 'Cached',
      authorId: 'u2',
      tags: [],
    });
    const post = fetchEntry(trpc.post.bySlug, { slug: 'hello' });
    const [handles, data] = await loadHandles(trpc, {
      post,
      author: prefetchEntry(trpc.author.byId, {
        id: experimental_dataOf(post).authorId,
      }),
    });
    expect(resource.queryClient.getQueryData(key)).toMatchObject({
      authorId: 'u2',
    });
    expect(data.post).toMatchObject({ authorId: 'u2' });
    expect(handles.author).toMatchObject({ input: { id: 'u2' } });
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
    expect(
      resource.calls.mock.calls.filter(([path]) => path === 'author.byId'),
    ).toEqual([['author.byId', { id: 'u2' }]]);
  });

  test("the entries that read a fetch entry whose fetch starts paused, offline, fill in the cache's data once it runs", async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const { queryClient } = resource;
    const key = trpc.post.bySlug.queryKey({ slug: 'hello' });
    using _mounted = makeResource({}, () => queryClient.unmount());
    queryClient.mount();
    using _online = makeResource({}, () => onlineManager.setOnline(true));
    onlineManager.setOnline(false);
    // The cache keeps the data it has: the fetch resolves to what it fetched
    queryClient.setQueryDefaults(key, {
      structuralSharing: (previous: unknown, next: unknown) => previous ?? next,
    });
    queryClient.setQueryData(key, {
      id: 'cached',
      title: 'Cached',
      authorId: 'u2',
      tags: [],
    });
    const post = fetchEntry(trpc.post.bySlug, { slug: 'hello' });
    const loaded = loadHandles(trpc, {
      post,
      author: prefetchEntry(trpc.author.byId, {
        id: experimental_dataOf(post).authorId,
      }),
    });
    expect(queryClient.getQueryState(key)?.fetchStatus).toBe('paused');
    onlineManager.setOnline(true);
    const [handles, data] = await loaded;
    expect(queryClient.getQueryData(key)).toMatchObject({ authorId: 'u2' });
    expect(data.post).toMatchObject({ authorId: 'u2' });
    expect(handles.author).toMatchObject({ input: { id: 'u2' } });
    await vi.waitFor(() => {
      expect(queryClient.isFetching()).toBe(0);
    });
    expect(
      resource.calls.mock.calls.filter(([path]) => path === 'author.byId'),
    ).toEqual([['author.byId', { id: 'u2' }]]);
  });

  test("a load started by a listener told of another fetch's success reads the cache's data, not that success", async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const key = trpc.post.bySlug.queryKey({ slug: 'hello' });
    const cache = resource.queryClient.getQueryCache();
    const loads: ReturnType<typeof startLoad>[] = [];
    function startLoad() {
      const post = prefetchEntry(
        trpc.post.bySlug,
        { slug: 'hello' },
        { staleTime: Infinity },
      );
      return loadHandles(trpc, {
        post,
        author: ensureEntry(trpc.author.byId, {
          id: experimental_dataOf(post).authorId,
        }),
      });
    }
    // Told of the success of a fetch the load has no part in. The load's
    // listener, which it adds now, is told of that success after this one
    using _subscription = makeResource(
      {},
      cache.subscribe((event) => {
        if (
          loads.length === 0 &&
          event.type === 'updated' &&
          event.action.type === 'success' &&
          !event.action.manual &&
          event.query.queryHash === hashKey(key)
        ) {
          resource.queryClient.setQueryData(key, {
            id: 'written',
            title: 'Written',
            authorId: 'u2',
            tags: [],
          });
          loads.push(startLoad());
          // A write after the load got its fresh data, before the load's
          // listener is told of the earlier success
          resource.queryClient.setQueryData(key, {
            id: 'rewritten',
            title: 'Rewritten',
            authorId: 'u3',
            tags: [],
          });
        }
      }),
    );
    await resource.queryClient.fetchQuery(
      trpc.post.bySlug.queryOptions({ slug: 'hello' }),
    );
    expect(loads).toHaveLength(1);
    const [first] = loads;
    if (!first) {
      throw new Error('The listener started no load');
    }
    const [handles] = await first;
    // The fresh data the load's prefetch got from the cache
    expect(handles.author).toMatchObject({ input: { id: 'u2' } });
    expect(
      resource.calls.mock.calls.filter(([path]) => path === 'author.byId'),
    ).toEqual([['author.byId', { id: 'u2' }]]);
  });

  test('a load that throws while it starts its entries leaves no listener once its earlier entries load', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const cache = resource.queryClient.getQueryCache();
    resource.queryClient.setQueryData(trpc.author.byId.queryKey({ id: 'u1' }), {
      id: 'u1',
      name: 'KATT',
      teamId: 'team1',
    });
    const post = ensureEntry(trpc.post.bySlug, { slug: 'hello' });
    // Starts once the post is in, and is read by the team: the load would
    // listen to the cache for it then
    const author = prefetchEntry(trpc.author.byId, {
      id: experimental_dataOf(post).authorId,
    });
    await expect(
      loadHandles(trpc, {
        post,
        author,
        team: prefetchEntry(trpc.team.byId, {
          id: experimental_dataOf(author).teamId,
        }),
        cached: prefetchEntry(
          trpc.author.byId,
          { id: 'u1' },
          {
            staleTime: () => {
              throw new Error('staleTime threw');
            },
          },
        ),
      }),
    ).rejects.toThrow('staleTime threw');
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(cache.hasListeners()).toBe(false);
  });

  test('a load that throws while it starts its entries leaves no listener on the query cache', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const cache = resource.queryClient.getQueryCache();
    resource.queryClient.setQueryData(trpc.author.byId.queryKey({ id: 'u1' }), {
      id: 'u1',
      name: 'KATT',
      teamId: 'team1',
    });
    const post = prefetchEntry(trpc.post.bySlug, { slug: 'hello' });
    await expect(
      loadHandles(trpc, {
        post,
        // A prefetch entry another reads: the load listens to the cache for it
        author: prefetchEntry(trpc.author.byId, {
          id: experimental_dataOf(post).authorId,
        }),
        // Its `staleTime` runs, and throws, as the load starts it
        cached: prefetchEntry(
          trpc.author.byId,
          { id: 'u1' },
          {
            staleTime: () => {
              throw new Error('staleTime threw');
            },
          },
        ),
      }),
    ).rejects.toThrow('staleTime threw');
    expect(cache.hasListeners()).toBe(false);
  });

  test('an index into a list from `.map()` throws: it would read the index of every item', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const post = prefetchEntry(trpc.post.bySlug, { slug: 'hello' });
    expect(
      () => experimental_dataOf(post).tags.map((tag) => tag.id)[0],
    ).toThrow('`.map()`');
  });

  test("a cache write while a prefetch entry's list loads is not what its items read", async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const posts = prefetchEntry(trpc.post.byAuthor, { authorId: 'u1' });
    const loaded = loadHandles(trpc, {
      posts,
      authors: experimental_entryPerItem(
        experimental_dataOf(posts).items,
        (id) => prefetchEntry(trpc.author.byId, { id }),
      ),
    });
    // While the list's request runs: a write that the request then replaces
    resource.queryClient.setQueryData(
      trpc.post.byAuthor.queryKey({ authorId: 'u1' }),
      { items: ['written'], nextCursor: null },
    );
    await loaded;
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
    expect(
      resource.calls.mock.calls.filter(([path]) => path === 'author.byId'),
    ).toEqual([['author.byId', { id: 'u1' }]]);
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
    // The item's part isn't in the input until `experimental_handleOfItem()`
    expect(handles.tags.input).toEqual({ ids: [null, 'extra'] });
    expectTypeOf(handles.tags.input).toEqualTypeOf<
      { ids?: (string | null)[]; first?: string } | undefined
    >();
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

  test.each<{ name: string; to: string[] }>([
    { name: '`__proto__`', to: ['__proto__', 'polluted'] },
    { name: '`constructor`', to: ['constructor', 'prototype', 'polluted'] },
  ])(
    'a handle that writes an item to $name changes no prototype',
    async ({ to }) => {
      await using resource = ctx();
      const trpc = resource.optionsProxyServer;
      const post = ensureEntry(trpc.post.bySlug, { slug: 'hello' });
      const [handles] = await loadHandles(trpc, {
        post,
        tags: experimental_entryPerItem(experimental_dataOf(post).tags, (tag) =>
          ensureEntry(trpc.tag.byIds, { ids: [tag.id] }),
        ),
      });
      // A handle is JSON from the server, so anything can be in it
      const handle = {
        ...JSON.parse(JSON.stringify(handles.tags)),
        itemInputs: [{ to, path: ['id'] }],
      };

      const input: unknown = experimental_handleOfItem(handle, {
        id: 'yes',
      }).input;

      expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
      expect(Object.prototype).not.toHaveProperty('polluted');
      expect(Object.getPrototypeOf(input)).toBe(Object.prototype);
      expect(Object.hasOwn(input as object, to[0]!)).toBe(true);
    },
  );

  test('takes a list of lists, such as the pages of an infinite entry', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;

    const posts = ensureInfiniteEntry(trpc.post.byAuthor, { authorId: 'u1' });
    const [handles, data] = await loadHandles(trpc, {
      posts,
      authors: experimental_entryPerItem(
        experimental_dataOf(posts).pages.flatMap((page) => page.items),
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

  test('a handle whose whole input is from data that has none has no `input` in its key, as `queryKey()` has none', async () => {
    const t = initTRPC.create();
    const appRouter = t.router({
      /** A post that may have a filter for its comments */
      post: t.procedure.query(() => ({
        filter: undefined as { author: string } | undefined,
      })),
      comments: t.procedure
        .input(z.object({ author: z.string() }).optional())
        .query(() => ['first']),
    });
    await using resource = testReactResource(appRouter);
    const trpc = resource.optionsProxyClient;

    const post = prefetchEntry(trpc.post);
    const [loaded] = await loadHandles(trpc, {
      post,
      comments: experimental_dataOf(post, (it) =>
        prefetchEntry(trpc.comments, it.filter),
      ),
    });
    const comments = experimental_handleOfItem(loaded.comments, {
      filter: undefined,
    });
    // Next.js rejects `undefined` in props
    expect(comments).toStrictEqual({ queryKey: trpc.comments.queryKey() });
    expect(JSON.parse(JSON.stringify(comments))).toStrictEqual(comments);
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
        experimental_dataOf(posts).pages.flatMap((page) => page.items),
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
        experimental_dataOf(posts).pages.flatMap((page) => page.items),
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
    expectTypeOf<keyof typeof data.page>().toEqualTypeOf<'team'>();
    expectTypeOf(data.page.team).toEqualTypeOf<
      { id: string; name: string } | undefined
    >();
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
  test('a cursor that `initialCursor` replaces is not read', async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      allowPipelining: true,
      before: [],
    });
    const trpc = resource.optionsProxyClient;

    const first = ensureEntry(trpc.post.paged, {});
    const [, data] = await loadHandles(trpc, {
      first,
      later: ensureInfiniteEntry(
        trpc.post.paged,
        { cursor: experimental_dataOf(first).nextCursor },
        { initialCursor: 2 },
      ),
    });

    expect(data.later.pageParams).toEqual([2]);
    expect(data.later.pages).toEqual([
      { items: [{ id: 'p2', authorId: 'u2' }], nextCursor: null },
    ]);
  });

  test("an infinite entry's first page goes forward, whatever its input reads into `direction`", async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      allowPipelining: true,
      before: [],
    });
    const trpc = resource.optionsProxyClient;

    const post = ensureEntry(trpc.post.bySlug, { slug: 'hello' });
    const [, data] = await loadHandles(trpc, {
      post,
      pages: ensureInfiniteEntry(trpc.post.directed, {
        order: experimental_dataOf(post).title,
        // Not in the type: an infinite query's direction is TanStack Query's
        ...({ direction: experimental_dataOf(post).title } as object),
      }),
    });

    expect(resource.calls).toHaveBeenCalledWith('post.directed', {
      order: 'Post hello',
      direction: 'forward',
    });
    expect(data.pages.pages).toEqual([
      { direction: 'forward', nextCursor: null },
    ]);
    // In the post's request: a request of its own sends `forward` too
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(1);
    expect(resource.calls.mock.calls.map(([path]) => path)).toEqual([
      'post.bySlug',
      'post.directed',
    ]);
  });

  test('a cursor that `initialCursor` replaces, from an entry the cache has, keeps nothing waiting', async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      allowPipelining: true,
      before: [],
    });
    const trpc = resource.optionsProxyClient;
    // In the cache already: its entry needs no request
    resource.queryClient.setQueryData(trpc.post.paged.queryKey({}), {
      items: [],
      nextCursor: 1,
    });

    const first = ensureEntry(trpc.post.paged, {}, { staleTime: Infinity });
    const post = ensureEntry(trpc.post.bySlug, { slug: 'hello' });
    const [, data] = await loadHandles(trpc, {
      first,
      post,
      later: ensureInfiniteEntry(
        trpc.post.pagedByAuthor,
        {
          authorId: experimental_dataOf(post).authorId,
          cursor: experimental_dataOf(first).nextCursor,
        },
        { initialCursor: 2 },
      ),
    });

    expect(data.later.pageParams).toEqual([2]);
    expect(data.later.pages[0]!.items).toHaveLength(3);
    expect(resource.calls.mock.calls).toContainEqual([
      'post.pagedByAuthor',
      { authorId: 'u1', cursor: 2 },
    ]);
  });

  test('an entry per item of a list from `.flatMap()` has an item for every element of its lists', async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      allowPipelining: true,
      before: [],
    });
    const trpc = resource.optionsProxyClient;

    const lists = ensureEntry(trpc.group.memberLists);
    const [handles, data] = await loadHandles(trpc, {
      lists,
      members: experimental_entryPerItem(
        experimental_dataOf(lists).flatMap((list) => list),
        (id) => ensureEntry(trpc.author.byId, { id }),
      ),
    });

    expect(data.members.map((member) => member.id)).toEqual(['u1', 'u2', 'u3']);
    expect(
      resource.queryClient.getQueryData(
        experimental_handleOfItem(handles.members, 'u3').queryKey,
      ),
    ).toMatchObject({ id: 'u3' });
    // The server ran the same items, in the same request: no list as an input
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(1);
    expect(
      resource.calls.mock.calls.filter(([path]) => path === 'author.byId'),
    ).toEqual([
      ['author.byId', { id: 'u1' }],
      ['author.byId', { id: 'u2' }],
      ['author.byId', { id: 'u3' }],
    ]);
  });

  test('an entry per item of a list from `.map()` loads in the request of the list', async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      allowPipelining: true,
      before: [],
    });
    const trpc = resource.optionsProxyClient;

    const post = ensureEntry(trpc.post.bySlug, { slug: 'hello' });
    const [, data] = await loadHandles(trpc, {
      post,
      authors: experimental_entryPerItem(
        experimental_dataOf(post).tags.map((tag) => tag.id),
        (id) => ensureEntry(trpc.author.byId, { id }),
      ),
    });

    expect(data.authors.map((author) => author.id)).toEqual(['t1', 't2']);
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(1);
  });

  test('an entry per item that reads nothing of its item is an ordinary query', async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      allowPipelining: true,
      before: [],
    });
    const trpc = resource.optionsProxyClient;

    const post = ensureEntry(trpc.post.bySlug, { slug: 'hello' });
    const [, data] = await loadHandles(trpc, {
      post,
      sameForEvery: experimental_entryPerItem(
        experimental_dataOf(post).tags,
        () =>
          ensureEntry(trpc.post.likeResults, {
            authorId: experimental_dataOf(post).authorId,
          }),
      ),
    });

    // Its whole data, not what an item's result would be in it
    expect(data.sameForEvery).toEqual([
      [{ result: { data: 'inner' } }],
      [{ result: { data: 'inner' } }],
    ]);
  });

  test('entries that read each other load in one request', async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      allowPipelining: true,
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
      // It reads a list of ids, a whole value
      allowPipelining: { allowWholeValues: true },
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

  test('a list read with .map() from a server without `allowWholeValues` loads in a request of its own', async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      allowPipelining: true,
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
    // The server refused the call before it ran, so the client asked for it
    // by itself, once the post was there
    expect(handles.tags.input).toEqual({ ids: ['t1', 't2'] });
    expect(resource.calls).toHaveBeenCalledWith('tag.byIds', {
      ids: ['t1', 't2'],
    });
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(2);
  });

  test('an entry per item whose callback returns an entry with `skipToken` gives every item a disabled entry, and sends no call', async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      // The post alone: a call for its tags would be refused
      maxBatchSize: 1,
      allowPipelining: true,
      before: [],
    });
    const trpc = resource.optionsProxyClient;

    const post = fetchEntry(trpc.post.bySlug, { slug: 'hello' });
    const [handles] = await loadHandles(trpc, {
      post,
      tags: experimental_entryPerItem(experimental_dataOf(post).tags, () =>
        prefetchEntry(trpc.tag.byIds, skipToken),
      ),
    });

    expect(handles.tags.skipped).toBe(true);
    const handle = experimental_handleOfItem(handles.tags, { id: 't1' });
    expect(handle.skipped).toBe(true);
    const options = fromHandle(trpc, handle);
    expect(options.queryFn).toBe(skipToken);
    expect(
      resource.queryClient.getQueryState(options.queryKey),
    ).toBeUndefined();
    // An ordinary request, for the post
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(1);
    expect(resource.onRequestSpy.mock.calls[0]![0].url).toContain('batch=1');
    expect(resource.calls.mock.calls.map(([path]) => path)).toEqual([
      'post.bySlug',
    ]);
  });

  test('an entry per item is one call that the server runs for every item', async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      allowPipelining: true,
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
      allowPipelining: true,
      before: [],
    });
    const trpc = resource.optionsProxyClient;

    const posts = ensureInfiniteEntry(trpc.post.byAuthor, { authorId: 'u1' });
    const [handles, data] = await loadHandles(trpc, {
      posts,
      authors: experimental_entryPerItem(
        experimental_dataOf(posts).pages.flatMap((page) => page.items),
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
      allowPipelining: true,
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
      allowPipelining: true,
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

  test('an entry with a `trpc.context` of its own goes to the links with it, not in the request of the entry it reads', async () => {
    const ops: Pick<Operation, 'path' | 'input' | 'context'>[] = [];
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      allowPipelining: true,
      before: [
        () => (linkOpts) => {
          const { path, input, context } = linkOpts.op;
          ops.push({ path, input, context });
          return linkOpts.next(linkOpts.op);
        },
      ],
    });
    const trpc = resource.optionsProxyClient;

    const post = ensureEntry(trpc.post.bySlug, { slug: 'hello' });
    const [, data] = await loadHandles(trpc, {
      post,
      author: ensureEntry(
        trpc.author.byId,
        { id: experimental_dataOf(post).authorId },
        { trpc: { context: { route: 'authors' } } },
      ),
    });

    expect(data.author).toMatchObject({ id: 'u1' });
    expect(ops).toContainEqual({
      path: 'author.byId',
      input: { id: 'u1' },
      context: expect.objectContaining({ route: 'authors' }),
    });
  });

  test('an entry whose `trpc.context` has only symbol keys goes to the links with it', async () => {
    const route = Symbol('route');
    const ops: Pick<Operation, 'path' | 'context'>[] = [];
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      allowPipelining: true,
      before: [
        () => (linkOpts) => {
          const { path, context } = linkOpts.op;
          ops.push({ path, context });
          return linkOpts.next(linkOpts.op);
        },
      ],
    });
    const trpc = resource.optionsProxyClient;

    const post = ensureEntry(trpc.post.bySlug, { slug: 'hello' });
    await loadHandles(trpc, {
      post,
      author: ensureEntry(
        trpc.author.byId,
        { id: experimental_dataOf(post).authorId },
        { trpc: { context: { [route]: 'authors' } } },
      ),
    });

    const context = ops.find((op) => op.path === 'author.byId')?.context;
    expect(Reflect.get(context ?? {}, route)).toBe('authors');
  });

  test('an entry with a `trpc.context` of its own carries no call of an entry that reads it', async () => {
    const ops: Pick<Operation, 'path' | 'input' | 'context'>[] = [];
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      allowPipelining: true,
      before: [
        () => (linkOpts) => {
          const { path, input, context } = linkOpts.op;
          ops.push({ path, input, context });
          return linkOpts.next(linkOpts.op);
        },
      ],
    });
    const trpc = resource.optionsProxyClient;

    const post = ensureEntry(
      trpc.post.bySlug,
      { slug: 'hello' },
      { trpc: { context: { route: 'posts' } } },
    );
    const [, data] = await loadHandles(trpc, {
      post,
      author: ensureEntry(trpc.author.byId, {
        id: experimental_dataOf(post).authorId,
      }),
    });

    expect(data.author).toMatchObject({ id: 'u1' });
    // The author went to the links as a request of its own
    expect(ops.map(({ path, input }) => ({ path, input }))).toContainEqual({
      path: 'author.byId',
      input: { id: 'u1' },
    });
  });

  test('the links see only the query whose request it is, with its whole input', async () => {
    const ops: Pick<Operation, 'path' | 'input'>[] = [];
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      allowPipelining: true,
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
      allowPipelining: true,
      before: [dedupeLink()],
    });
    const trpc = resource.optionsProxyClient;
    const { queryClient } = resource;

    // Two pages, whose posts have different authors. The authors' inputs are
    // the same until the server fills them in: those are the identical ones.
    // Pages with the same input would be one query, which no link sees twice
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
      allowPipelining: true,
      before: [],
    });
    const trpc = resource.optionsProxyClient;

    const groups = ensureEntry(trpc.group.list);
    const [, data] = await loadHandles(trpc, {
      groups,
      members: experimental_entryPerItem(
        experimental_dataOf(groups).groups.flatMap((group) => group.members),
        (id) => ensureEntry(trpc.author.byId, { id }),
      ),
    });
    expect(data.members.map((member) => member.id)).toEqual(['u1', 'u2', 'u3']);
    expect(
      resource.calls.mock.calls.filter(([path]) => path === 'author.byId'),
    ).toEqual([
      ['author.byId', { id: 'u1' }],
      ['author.byId', { id: 'u2' }],
      ['author.byId', { id: 'u3' }],
    ]);
    // In one request: one call, for every item of every group
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(1);
    const url = new URL(
      resource.onRequestSpy.mock.calls[0]![0].url!,
      'http://localhost',
    );
    expect(url.pathname.endsWith('/group.list,author.byId')).toBe(true);
    expect(JSON.parse(url.searchParams.get('pipe')!)).toEqual({
      1: {
        each: { from: 0, path: ['groups', null, 'members'] },
        reads: [{ to: ['id'], path: [] }],
      },
    });
  });

  test("a stale list of lists: an item's result is used only if the server ran the same item at its place", async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      allowPipelining: true,
      before: [],
    });
    const trpc = resource.optionsProxyClient;
    // The cache has the groups as they were: the server now has `u2` in the
    // first group, and `u3` where `u2` was
    resource.queryClient.setQueryData(
      trpc.group.list.queryKey(),
      { groups: [{ members: ['u1'] }, { members: ['u2'] }] },
      { updatedAt: 1 },
    );

    const groups = ensureEntry(trpc.group.list);
    const [, data] = await loadHandles(trpc, {
      groups,
      members: experimental_entryPerItem(
        experimental_dataOf(groups).groups.flatMap((group) => group.members),
        (id) => ensureEntry(trpc.author.byId, { id }),
      ),
    });
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });

    expect(data.members.map((member) => member.id)).toEqual(['u1', 'u2']);
    expect(
      resource.queryClient.getQueryData(
        trpc.author.byId.queryKey({ id: 'u2' }),
      ),
    ).toMatchObject({ id: 'u2' });
    // The server ran the authors with the groups, and `u2`, whose place it
    // ran `u3` at, was fetched by itself
    const paths = resource.onRequestSpy.mock.calls.map(
      ([req]) => new URL(req.url!, 'http://localhost').pathname,
    );
    expect(paths.some((path) => path.endsWith('/group.list,author.byId'))).toBe(
      true,
    );
    const runsOf = (id: string) =>
      resource.calls.mock.calls.filter(
        ([path, input]) =>
          path === 'author.byId' && (input as { id: string }).id === id,
      );
    expect(runsOf('u2')).toHaveLength(2);
    // `u1`, at the same place in both, kept what the server ran
    expect(runsOf('u1')).toHaveLength(1);
  });

  test("an entry per page of an infinite entry does not break the entry's request", async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      allowPipelining: true,
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
      // It reads a list of ids, a whole value
      allowPipelining: { allowWholeValues: true },
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

  test("what an item's input reads besides the item is from the first load, also when the list is fetched again", async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      allowPipelining: true,
      before: [],
    });
    const trpc = resource.optionsProxyClient;

    const list = ensureEntry(trpc.post.changing);
    const [handles] = await loadHandles(trpc, {
      list,
      tags: experimental_entryPerItem(experimental_dataOf(list).tags, (tag) =>
        prefetchEntry(trpc.tag.byIds, {
          ids: experimental_dataOf(list).tags.map((each) => each.id),
          first: tag.id,
        }),
      ),
    });
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
    resource.onRequestSpy.mockClear();
    resource.calls.mockClear();

    // As after an invalidation: the list is now the tag `c1`
    await resource.queryClient.fetchQuery({
      ...fromHandle(trpc, handles.list),
      staleTime: 0,
    });
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });

    expect(resource.onRequestSpy).toHaveBeenCalledTimes(1);
    expect(resource.calls.mock.calls).toEqual([
      ['post.changing', undefined],
      // The new item, and the list as the handles have it
      ['tag.byIds', { ids: ['c0'], first: 'c1' }],
    ]);
    // Which is the query the new item's handle is for, so its row finds it
    const handle = experimental_handleOfItem(handles.tags, { id: 'c1' });
    expect(handle.input).toEqual({ ids: ['c0'], first: 'c1' });
    expect(
      resource.queryClient.getQueryData(fromHandle(trpc, handle).queryKey),
    ).toEqual([{ id: 'c0' }]);
  });

  test('when the server refuses a call for every item, each item asks by itself', async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      // The post's call and a run for each of its two tags are three
      maxBatchSize: 2,
      allowPipelining: true,
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
      allowPipelining: true,
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

  test('a later page does not run, for every item, a query that reads nothing of its item', async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      allowPipelining: true,
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
    const [handles] = await loadHandles(trpc, {
      posts,
      // The same author for every row
      authors: experimental_entryPerItem(
        experimental_dataOf(posts).pages.flatMap((page) => page.items),
        () => prefetchEntry(trpc.author.byId, { id: 'u1' }),
      ),
    });
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
    resource.onRequestSpy.mockClear();
    resource.calls.mockClear();

    const observer = new InfiniteQueryObserver(resource.queryClient, {
      ...fromHandle(trpc, handles.posts, { getNextPageParam }),
      staleTime: Infinity,
    });
    using _subscription = makeResource({}, observer.subscribe(vi.fn()));
    const data = await observer.fetchNextPage();
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });

    // The next page, by its cursor, and no author for it
    expect(
      data.data?.pages.map((page) => page.items.map((item) => item.id)),
    ).toEqual([['p0'], ['p1']]);
    expect(resource.calls.mock.calls).toEqual([['post.paged', { cursor: 1 }]]);
  });

  test("a later page's row whose query can't start doesn't stop the rows after it", async () => {
    // A row whose id no query key can hold, as an app with a transformer for
    // it can have, comes first on the second page
    const addRow: TRPCLink<AnyRouter> =
      () =>
      ({ op, next }) =>
        observable((observer) =>
          next(op).subscribe({
            next(value) {
              const data = value.result.data as
                | { items?: unknown[] }
                | undefined;
              const cursor = (op.input as { cursor?: unknown } | undefined)
                ?.cursor;
              observer.next(
                op.path === 'post.paged' && cursor === 1 && data?.items
                  ? ({
                      ...value,
                      result: {
                        ...value.result,
                        data: {
                          ...data,
                          items: [{ id: 'big', authorId: 1n }, ...data.items],
                        },
                      },
                    } as typeof value)
                  : value,
              );
            },
            error: (error) => observer.error(error),
            complete: () => observer.complete(),
          }),
        );
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      allowPipelining: true,
      before: [addRow],
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
        experimental_dataOf(posts).pages.flatMap((page) => page.items),
        (post) => prefetchEntry(trpc.author.byId, { id: post.authorId }),
      ),
    });
    const observer = new InfiniteQueryObserver(resource.queryClient, {
      ...fromHandle(trpc, handles.posts, { getNextPageParam }),
      staleTime: Infinity,
    });
    using _subscription = makeResource({}, observer.subscribe(vi.fn()));
    const next = await observer.fetchNextPage();
    // The row that can't start came first on the page
    expect(next.data?.pages[1]?.items).toMatchObject([
      { id: 'big', authorId: 1n },
      { id: 'p1', authorId: 'u1' },
    ]);
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });

    // The row after it has its author, from the page's request
    expect(
      resource.queryClient.getQueryData(
        trpc.author.byId.queryKey({ id: 'u1' }),
      ),
    ).toMatchObject({ id: 'u1' });
  });

  test("a server row whose item key can't be held makes only the client's row at its place ask by itself", async () => {
    // The server's list has a row whose id no query key can hold, as an app
    // with a transformer for it can have, last
    const addRow: TRPCLink<AnyRouter> =
      () =>
      ({ op, next }) =>
        observable((observer) =>
          next(op).subscribe({
            next(value) {
              const data = value.result.data as
                | { items?: unknown[] }
                | undefined;
              observer.next(
                op.path === 'post.paged' && data?.items
                  ? ({
                      ...value,
                      result: {
                        ...value.result,
                        data: {
                          ...data,
                          items: [...data.items, { id: 'big', authorId: 1n }],
                        },
                      },
                    } as typeof value)
                  : value,
              );
            },
            error: (error) => observer.error(error),
            complete: () => observer.complete(),
          }),
        );
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      allowPipelining: true,
      before: [addRow],
    });
    const trpc = resource.optionsProxyClient;
    // The client's stale list has a row with an id a key can hold at that place
    resource.queryClient.setQueryData(
      trpc.post.paged.queryKey({}),
      {
        items: [
          { id: 'p0', authorId: 'u0' },
          { id: 'old', authorId: 'u9' },
        ],
        nextCursor: 1,
      },
      { updatedAt: 1 },
    );

    const posts = ensureEntry(trpc.post.paged, {});
    await loadHandles(trpc, {
      posts,
      authors: experimental_entryPerItem(
        experimental_dataOf(posts).items,
        (post) => prefetchEntry(trpc.author.byId, { id: post.authorId }),
      ),
    });
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
    expect(
      resource.queryClient.getQueryData(
        trpc.author.byId.queryKey({ id: 'u9' }),
      ),
    ).toMatchObject({ id: 'u9' });
    // The first row's author is from the list's request. The second asked
    // by itself
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(2);
    expect(
      resource.calls.mock.calls.filter(([path]) => path === 'author.byId'),
    ).toEqual([
      ['author.byId', { id: 'u0' }],
      ['author.byId', { id: 'u9' }],
    ]);
  });

  test("an item whose run fails on the server has that run's own error, not an unknown one", async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      allowPipelining: true,
      before: [],
    });
    const trpc = resource.optionsProxyClient;

    // The list is `['hello', 'missing']`: the second run throws `NOT_FOUND`
    const posts = ensureEntry(trpc.tag.byIds, { ids: ['hello', 'missing'] });
    const [, results] = await loadHandlesSettled(trpc, {
      posts,
      bySlug: experimental_entryPerItem(
        experimental_dataOf(posts).map((tag) => tag.id),
        (slug) => ensureEntry(trpc.post.bySlug, { slug }),
      ),
    });
    // Both runs went in the list's request
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(1);
    expect(results.bySlug[0]).toMatchObject({
      status: 'success',
      data: { id: 'id-of-hello' },
    });
    const failed = results.bySlug[1];
    const error = failed?.status === 'error' ? failed.error : null;
    expect(error?.code).toBe('NOT_FOUND');
    expect(error?.cause.message).toBe('NOT_FOUND');
    expect(error?.cause.message).not.toBe('Unknown error');
  });

  test("a row whose item key can't be held fails by itself, and the row beside it still uses the list's request", async () => {
    // A row whose id no query key can hold, as an app with a transformer for
    // it can have, comes last in the list the client reads
    const addRow: TRPCLink<AnyRouter> =
      () =>
      ({ op, next }) =>
        observable((observer) =>
          next(op).subscribe({
            next(value) {
              const data = value.result.data as
                | { items?: unknown[] }
                | undefined;
              observer.next(
                op.path === 'post.paged' && data?.items
                  ? ({
                      ...value,
                      result: {
                        ...value.result,
                        data: {
                          ...data,
                          items: [...data.items, { id: 'big', authorId: 1n }],
                        },
                      },
                    } as typeof value)
                  : value,
              );
            },
            error: (error) => observer.error(error),
            complete: () => observer.complete(),
          }),
        );
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      allowPipelining: true,
      before: [addRow],
    });
    const trpc = resource.optionsProxyClient;

    const posts = ensureEntry(trpc.post.paged, {});
    await loadHandles(trpc, {
      posts,
      authors: experimental_entryPerItem(
        experimental_dataOf(posts).items,
        (post) => prefetchEntry(trpc.author.byId, { id: post.authorId }),
      ),
    });
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
    // The first row's author is from the list's request: none of its own
    expect(
      resource.queryClient.getQueryData(
        trpc.author.byId.queryKey({ id: 'u0' }),
      ),
    ).toMatchObject({ id: 'u0' });
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(1);
    expect(
      resource.calls.mock.calls.filter(([path]) => path === 'author.byId'),
    ).toEqual([['author.byId', { id: 'u0' }]]);
  });

  test("a list read with a `trpc.context` of its own carries none of its items' calls", async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      allowPipelining: true,
      before: [],
    });
    const trpc = resource.optionsProxyClient;
    const route = Symbol('route');

    const posts = ensureEntry(trpc.post.byAuthor, { authorId: 'u1' });
    const [loaded] = await loadHandles(trpc, {
      posts,
      authors: experimental_entryPerItem(
        experimental_dataOf(posts).items,
        (id) => prefetchEntry(trpc.author.byId, { id }),
      ),
    });
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
    expect(loaded.posts.experimental_perItem).toHaveLength(1);
    resource.onRequestSpy.mockClear();

    for (const context of [{ route: 'posts' }, { [route]: 'posts' }]) {
      await resource.queryClient.fetchQuery({
        ...fromHandle(trpc, loaded.posts, { trpc: { context } }),
        staleTime: 0,
      });
    }
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
    // Each list request went by itself: a link may route by its context
    expect(resource.onRequestSpy.mock.calls.length).toBeGreaterThan(0);
    for (const [req] of resource.onRequestSpy.mock.calls) {
      expect(req.url).not.toContain('author.byId');
    }
    // An empty context is none: the list's request still carries the calls
    resource.onRequestSpy.mockClear();
    await resource.queryClient.fetchQuery({
      ...fromHandle(trpc, loaded.posts, { trpc: { context: {} } }),
      staleTime: 0,
    });
    expect(resource.onRequestSpy.mock.calls[0]?.[0].url).toContain(
      'post.byAuthor,author.byId',
    );
  });

  test("a list fetched again loads its items' queries from `.map()` in the same request", async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      allowPipelining: true,
      before: [],
    });
    const trpc = resource.optionsProxyClient;

    const post = ensureEntry(trpc.post.bySlug, { slug: 'hello' });
    const [handles] = await loadHandles(trpc, {
      post,
      authors: experimental_entryPerItem(
        experimental_dataOf(post).tags.map((tag) => tag.id),
        (id) => prefetchEntry(trpc.author.byId, { id }),
      ),
    });
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
    resource.queryClient.removeQueries({
      queryKey: trpc.author.byId.pathKey(),
    });
    resource.onRequestSpy.mockClear();

    // As an invalidation does: the post again, which the cache had
    await resource.queryClient.fetchQuery({
      ...fromHandle(trpc, handles.post),
      staleTime: 0,
    });
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });

    expect(resource.onRequestSpy).toHaveBeenCalledTimes(1);
    expect(
      resource.queryClient.getQueryData(
        trpc.author.byId.queryKey({ id: 't2' }),
      ),
    ).toMatchObject({ id: 't2' });
  });

  test("a later page loads its items' queries in the same request", async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      allowPipelining: true,
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
        experimental_dataOf(posts).pages.flatMap((page) => page.items),
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

  test("a later page whose fetch another replaced writes none of its items' queries", async () => {
    // Holds back the result of the first request for the second page, which
    // the transport still completes: the query doesn't abort it
    const releaser = { release: (): void => undefined };
    const released = new Promise<void>((resolve) => {
      releaser.release = resolve;
    });
    let heldBack = false;
    let completed = false;
    const holdFirstPage: TRPCLink<AnyRouter> =
      () =>
      ({ op, next }) =>
        observable((observer) => {
          const cursor = (op.input as { cursor?: unknown } | undefined)
            ?.cursor;
          const hold = op.path === 'post.paged' && cursor === 1 && !heldBack;
          heldBack ||= hold;
          return next(op).subscribe({
            next(value) {
              if (hold) {
                void released.then(() => observer.next(value));
              } else {
                observer.next(value);
              }
            },
            error: (error) => observer.error(error),
            complete() {
              if (hold) {
                void released.then(() => {
                  observer.complete();
                  completed = true;
                });
              } else {
                observer.complete();
              }
            },
          });
        });
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      allowPipelining: true,
      before: [holdFirstPage],
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
        experimental_dataOf(posts).pages.flatMap((page) => page.items),
        (post) => prefetchEntry(trpc.author.byId, { id: post.authorId }),
      ),
    });
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
    const observer = new InfiniteQueryObserver(resource.queryClient, {
      ...fromHandle(trpc, handles.posts, { getNextPageParam }),
      staleTime: Infinity,
    });
    using _subscription = makeResource({}, observer.subscribe(vi.fn()));
    const authorKey = trpc.author.byId.queryKey({ id: 'u1' });

    // The first fetch of the second page waits; a second one cancels it
    const cancelled = observer.fetchNextPage();
    await vi.waitFor(() => {
      expect(heldBack).toBe(true);
    });
    const next = await observer.fetchNextPage();
    expect(next.data?.pages).toHaveLength(2);
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
    expect(resource.queryClient.getQueryState(authorKey)).toMatchObject({
      data: { id: 'u1' },
      dataUpdateCount: 1,
    });

    // The cancelled fetch's request completes after all
    releaser.release();
    await cancelled;
    await vi.waitFor(() => {
      expect(completed).toBe(true);
    });
    // The step after: the list's result has reached the query function
    await new Promise((resolve) => setTimeout(resolve, 0));
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
    expect(resource.queryClient.getQueryState(authorKey)).toMatchObject({
      dataUpdateCount: 1,
    });
  });

  test("a query that is fetched again loads its items' queries in the same request", async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      allowPipelining: true,
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
      allowPipelining: true,
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
      allowPipelining: true,
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
      allowPipelining: true,
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
      allowPipelining: true,
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

  test("a stale ensure entry's missing cursor is not the server's `null` one", async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      allowPipelining: true,
      before: [],
    });
    const trpc = resource.optionsProxyClient;
    // The cached last page has no next cursor. Its refetch has `null`
    resource.queryClient.setQueryData(
      trpc.post.paged.queryKey({ cursor: 2 }),
      { items: [{ id: 'p2', authorId: 'u2' }] } as never,
      { updatedAt: 1 },
    );

    const last = ensureEntry(trpc.post.paged, { cursor: 2 });
    const [, data] = await loadHandles(trpc, {
      last,
      rest: ensureInfiniteEntry(trpc.post.cursorKind, {
        cursor: experimental_dataOf(last).nextCursor,
      }),
    });

    // The page is for the cursor the client has: none
    expect(data.rest.pages).toEqual([{ cursor: 'missing', nextCursor: null }]);
  });

  test('an infinite entry whose cached pages start at another cursor fetches by itself: its page and its param agree', async () => {
    await using resource = pipeliningCtx({
      link: scenario.link,
      latency: 0,
      maxBatchSize: undefined,
      allowPipelining: true,
      before: [],
    });
    const trpc = resource.optionsProxyClient;
    // The cache has the pages from cursor 2, from an entry made before, with
    // other data than the server has now
    resource.queryClient.setQueryData(
      trpc.post.paged.infiniteQueryKey({}),
      {
        pages: [
          { items: [{ id: 'cached', authorId: 'u2' }], nextCursor: null },
        ],
        pageParams: [2],
      },
      { updatedAt: 1 },
    );

    const first = fetchEntry(trpc.post.paged, { cursor: 0 });
    const [, data] = await loadHandles(trpc, {
      first,
      // The server fetches its first page from cursor 1. A refetch of the
      // cached pages starts from 2
      rest: fetchInfiniteEntry(trpc.post.paged, {
        cursor: experimental_dataOf(first).nextCursor,
      }),
    });

    // The server ran its page from cursor 1, in the request of the first.
    // That page is not the cached pages' first, so the entry fetched them
    // again by itself, from cursor 2
    expect(resource.calls.mock.calls).toEqual([
      ['post.paged', { cursor: 0 }],
      ['post.paged', { cursor: 1 }],
      ['post.paged', { cursor: 2 }],
    ]);
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
      allowPipelining: true,
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
      allowPipelining: true,
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
      allowPipelining: true,
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
      allowPipelining: true,
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
      allowPipelining: true,
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
      allowPipelining: true,
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
      allowPipelining: true,
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
        experimental_dataOf(posts).pages.flatMap((page) => page.items),
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
      allowPipelining: true,
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
      allowPipelining: true,
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
      allowPipelining: true,
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
      allowPipelining: true,
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
      allowPipelining: true,
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
    allowPipelining: true as const,
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

  test('an entry that stops skipping, or starts, is another load, though its query key is the same', async () => {
    await using resource = pipeliningCtx(ctxOpts);
    const skipped = vi.fn();
    function Groups(props: { skip: boolean }) {
      const trpc = resource.useTRPC();
      const handles = experimental_useHandles(trpc, {
        groups: props.skip
          ? prefetchEntry(trpc.group.list, skipToken)
          : prefetchEntry(trpc.group.list),
      });
      skipped(handles.groups.skipped === true);
      const query = useQuery(fromHandle(trpc, handles.groups));
      return (
        <p>{query.data ? `groups ${query.data.groups.length}` : 'none'}</p>
      );
    }
    const page = (skip: boolean) => (
      <React.Suspense fallback="loading">
        <Groups skip={skip} />
      </React.Suspense>
    );

    const utils = resource.renderApp(page(true));
    await vi.waitFor(() => {
      expect(utils.container).toHaveTextContent('none');
    });
    expect(resource.calls).not.toHaveBeenCalled();

    resource.rerenderApp(utils, page(false));
    await vi.waitFor(() => {
      expect(utils.container).toHaveTextContent('groups 2');
    });
    expect(skipped.mock.lastCall).toEqual([false]);

    resource.rerenderApp(utils, page(true));
    expect(skipped.mock.lastCall).toEqual([true]);
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
            experimental_dataOf(posts).pages.flatMap((page) => page.items),
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

describe('a run the link cannot read', () => {
  // `httpBatchLink` reads each run with the transformer by itself. A stream
  // is read with it as it comes, so no one run is read apart
  test('fails its own item with what the link failed with, not an unknown error', async () => {
    // The server reads and sends every value as it is
    const t = initTRPC.create({
      transformer: {
        serialize: (value: unknown) => value,
        deserialize: (value: unknown) => value,
      },
    });
    /** The link's: it reads every value as it is, but an author marked `unreadable` */
    const transformer = {
      serialize: (value: unknown) => value,
      deserialize: (value: unknown) => {
        if (
          typeof value === 'object' &&
          value !== null &&
          (value as { unreadable?: unknown }).unreadable === true
        ) {
          throw new Error('The link cannot read this author');
        }
        return value;
      },
    };
    const appRouter = t.router({
      list: t.procedure.query(() => ({ ids: ['u1', 'bad', 'u2'] })),
      author: t.procedure.input(z.object({ id: z.string() })).query((opts) => ({
        id: opts.input.id,
        unreadable: opts.input.id === 'bad',
      })),
    });
    await using resource = testReactResource(appRouter, {
      server: { experimental_allowPipelining: true },
      client: (opts) => ({
        links: [
          httpBatchLink({
            url: opts.httpUrl,
            transformer,
            experimental_pipelining: experimental_pipelining(),
          }),
        ],
      }),
    });
    const trpc = resource.optionsProxyClient;

    const list = ensureEntry(trpc.list);
    const [, results] = await loadHandlesSettled(trpc, {
      list,
      authors: experimental_entryPerItem(experimental_dataOf(list).ids, (id) =>
        ensureEntry(trpc.author, { id }, { retry: false }),
      ),
    });
    // Every run went in the list's request
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(1);
    expect(results.authors[0]).toMatchObject({
      status: 'success',
      data: { id: 'u1' },
    });
    expect(results.authors[2]).toMatchObject({
      status: 'success',
      data: { id: 'u2' },
    });
    const failed = results.authors[1];
    const error = failed?.status === 'error' ? failed.error : null;
    expect(error?.cause.message).toContain('The link cannot read this author');
  });
});

describe('a transformer that keeps what JSON drops', () => {
  test("a stale ensure entry's cursor without a key is not the server's one with the key as `undefined`", async () => {
    const t = initTRPC.create({ transformer: superjson });
    type Cursor = { at?: number } | null | undefined;
    const appRouter = t.router({
      /** The last page: its next cursor has `at` as `undefined` */
      last: t.procedure.query(() => ({ next: { at: undefined } as Cursor })),
      /** Whether its cursor has the key `at`, though it is `undefined` */
      cursorKey: t.procedure
        .input((raw: unknown) => raw as { cursor: Cursor })
        .query((opts) => ({
          cursor:
            opts.input.cursor && 'at' in opts.input.cursor ? 'has at' : 'no at',
          nextCursor: null,
        })),
    });
    await using resource = testReactResource(appRouter, {
      // The cursor the server fills in is an object
      server: { experimental_allowPipelining: { allowWholeValues: true } },
      client: (opts) => ({
        links: [
          httpBatchLink({
            url: opts.httpUrl,
            transformer: superjson,
            experimental_pipelining: experimental_pipelining(),
          }),
        ],
      }),
    });
    const trpc = resource.optionsProxyClient;
    // The cached last page's next cursor has no `at`. Its refetch has one
    resource.queryClient.setQueryData(
      trpc.last.queryKey(),
      { next: {} },
      { updatedAt: 1 },
    );

    const last = ensureEntry(trpc.last);
    const [, data] = await loadHandles(trpc, {
      last,
      rest: ensureInfiniteEntry(trpc.cursorKey, {
        cursor: experimental_dataOf(last).next,
      }),
    });

    // The page is for the cursor the client has: no `at`
    expect(data.rest.pages).toEqual([{ cursor: 'no at', nextCursor: null }]);
  });

  test("a stale ensure entry's cursor `0` is not the server's `-0`", async () => {
    const t = initTRPC.create({ transformer: superjson });
    const appRouter = t.router({
      /** The last page: its next cursor is `-0` */
      last: t.procedure.query(() => ({ next: -0 })),
      /** Whether its cursor is `-0` */
      cursorSign: t.procedure
        .input((raw: unknown) => raw as { cursor: number | null | undefined })
        .query((opts) => ({
          cursor: Object.is(opts.input.cursor, -0) ? '-0' : 'not -0',
          nextCursor: null,
        })),
    });
    await using resource = testReactResource(appRouter, {
      server: { experimental_allowPipelining: true },
      client: (opts) => ({
        links: [
          httpBatchLink({
            url: opts.httpUrl,
            transformer: superjson,
            experimental_pipelining: experimental_pipelining(),
          }),
        ],
      }),
    });
    const trpc = resource.optionsProxyClient;
    // The cached last page's next cursor is `0`. Its refetch has `-0`
    resource.queryClient.setQueryData(
      trpc.last.queryKey(),
      { next: 0 },
      { updatedAt: 1 },
    );

    const last = ensureEntry(trpc.last);
    const [, data] = await loadHandles(trpc, {
      last,
      rest: ensureInfiniteEntry(trpc.cursorSign, {
        cursor: experimental_dataOf(last).next,
      }),
    });

    // The page is for the cursor the client has: `0`
    expect(data.rest.pages).toEqual([{ cursor: 'not -0', nextCursor: null }]);
  });

  /** A server with superjson, which keeps `-0`, and a batch link that pipelines */
  const signedZeroCtx = () => {
    const t = initTRPC.create({ transformer: superjson });
    const appRouter = t.router({
      /** `-0`, alone and in a list */
      zero: t.procedure.query(() => ({ value: -0, list: [-0] })),
      /** Whether its value is `-0` */
      sign: t.procedure
        .input((raw: unknown) => raw as { value: number })
        .query((opts) => (Object.is(opts.input.value, -0) ? '-0' : 'not -0')),
    });
    return testReactResource(appRouter, {
      server: { experimental_allowPipelining: true },
      client: (opts) => ({
        links: [
          httpBatchLink({
            url: opts.httpUrl,
            transformer: superjson,
            experimental_pipelining: experimental_pipelining(),
          }),
        ],
      }),
    });
  };

  /** A server with superjson, which keeps a key whose value is `undefined`, and a batch link that pipelines */
  const cursorPresenceCtx = () => {
    const t = initTRPC.create({ transformer: superjson });
    const appRouter = t.router({
      /** A filter, and no next cursor */
      source: t.procedure.query(() => ({
        filter: 'a',
        next: undefined as number | undefined,
      })),
      /** Whether its input has a `cursor` key */
      presence: t.procedure
        .input(
          (raw: unknown) =>
            raw as { filter?: string; cursor?: number | undefined },
        )
        .query((opts) => ({
          hasCursor: 'cursor' in opts.input,
          nextCursor: null,
        })),
    });
    const resource = testReactResource(appRouter, {
      server: { experimental_allowPipelining: true },
      client: (opts) => ({
        links: [
          httpBatchLink({
            url: opts.httpUrl,
            transformer: superjson,
            experimental_pipelining: experimental_pipelining(),
          }),
        ],
      }),
    });
    return resource;
  };

  test("an infinite entry's first page has no cursor for an `undefined` one in its input, also from the server", async () => {
    await using resource = cursorPresenceCtx();
    const trpc = resource.optionsProxyClient;

    const source = ensureEntry(trpc.source);
    const [, data] = await loadHandles(trpc, {
      source,
      rest: ensureInfiniteEntry(trpc.presence, {
        filter: experimental_dataOf(source).filter,
        cursor: undefined,
      }),
    });

    // As the page's own request: `infiniteQueryOptions()` leaves it out
    expect(data.rest.pages).toEqual([{ hasCursor: false, nextCursor: null }]);
  });

  test("an infinite entry's first page has no cursor for one it reads that is `undefined`, also from the server", async () => {
    await using resource = cursorPresenceCtx();
    const trpc = resource.optionsProxyClient;

    const source = ensureEntry(trpc.source);
    const [, data] = await loadHandles(trpc, {
      source,
      rest: ensureInfiniteEntry(trpc.presence, {
        cursor: experimental_dataOf(source).next,
      }),
    });

    // As the page's own request: `infiniteQueryOptions()` leaves it out
    expect(data.rest.pages).toEqual([{ hasCursor: false, nextCursor: null }]);
  });

  test("a stale ensure entry's `0` is not the server's `-0` in another entry's input", async () => {
    await using resource = signedZeroCtx();
    const trpc = resource.optionsProxyClient;
    // The cached value is `0`. Its refetch has `-0`
    resource.queryClient.setQueryData(
      trpc.zero.queryKey(),
      { value: 0, list: [0] },
      { updatedAt: 1 },
    );

    const zero = ensureEntry(trpc.zero);
    const [handles, data] = await loadHandles(trpc, {
      zero,
      sign: ensureEntry(trpc.sign, { value: experimental_dataOf(zero).value }),
    });

    // The data is for the input the client has: `0`
    expect(Object.is(handles.sign.input.value, 0)).toBe(true);
    expect(data.sign).toBe('not -0');
  });

  test("a stale ensure entry's `0` is not the server's `-0` in an item's input", async () => {
    await using resource = signedZeroCtx();
    const trpc = resource.optionsProxyClient;
    // The cached item is `0`. Its refetch has `-0`
    resource.queryClient.setQueryData(
      trpc.zero.queryKey(),
      { value: 0, list: [0] },
      { updatedAt: 1 },
    );

    const zero = ensureEntry(trpc.zero);
    const [, data] = await loadHandles(trpc, {
      zero,
      signs: experimental_entryPerItem(
        experimental_dataOf(zero).list,
        (value) => ensureEntry(trpc.sign, { value }),
      ),
    });

    // The item's data is for the input the client has: `0`
    expect(data.signs).toEqual(['not -0']);
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
            experimental_dataOf(posts).pages.flatMap((page) => page.items),
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

  test('an entry per item of a nested list and of a key with a dot in it are other loads', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const seen: unknown[] = [];
    function Card(props: { from: 'nested' | 'dotted' }) {
      const nested = prefetchEntry(trpc.post.bySlug, { slug: 'a' });
      const dotted = prefetchEntry(trpc.post.bySlug, { slug: 'b' });
      seen.push(
        experimental_useHandles(trpc, {
          card: { list: nested },
          'card.list': dotted,
          authors: experimental_entryPerItem(
            experimental_dataOf(props.from === 'nested' ? nested : dotted).tags,
            (tag) => prefetchEntry(trpc.author.byId, { id: tag.id }),
          ),
        }),
      );
      return null;
    }
    resource.renderApp(
      <>
        <Card from="nested" />
        <Card from="dotted" />
      </>,
    );
    // The entries are the same, in the same places, but for where the entry
    // per item reads its list
    expect(seen[1]).not.toBe(seen[0]);
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
  });

  test('an entry per item of a list from `.map()` and from `.flatMap()` of the same path are other loads', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const seen: unknown[] = [];
    function Card(props: { flat: boolean }) {
      const groups = prefetchEntry(trpc.group.list);
      const members = experimental_dataOf(groups).groups;
      // The same entry for every item: only how many items there are differs
      const author = () => prefetchEntry(trpc.author.byId, { id: 'u1' });
      seen.push(
        experimental_useHandles(trpc, {
          groups,
          authors: props.flat
            ? experimental_entryPerItem(
                members.flatMap((group) => group.members),
                author,
              )
            : experimental_entryPerItem(
                members.map((group) => group.members),
                author,
              ),
        }),
      );
      return null;
    }
    resource.renderApp(
      <>
        <Card flat={false} />
        <Card flat />
      </>,
    );
    expect(seen[1]).not.toBe(seen[0]);
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
  });

  test('the same entries with another `trpc.context` are another load', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const seen: unknown[] = [];
    const route = Symbol('route');
    const otherRoute = Symbol('route');
    function Card(props: {
      context: Record<PropertyKey, unknown> | undefined;
    }) {
      seen.push(
        experimental_useHandles(trpc, {
          post: prefetchEntry(
            trpc.post.bySlug,
            { slug: 'hello' },
            { trpc: { context: props.context } },
          ),
        }),
      );
      return null;
    }
    resource.renderApp(
      <>
        <Card context={undefined} />
        <Card context={{ route: 'secondary' }} />
        <Card context={{ [route]: 'secondary' }} />
        <Card context={{ [otherRoute]: 'secondary' }} />
        <Card context={{ 'Symbol(route)': 'secondary' }} />
        <Card context={{ route }} />
        <Card context={{ route: null }} />
      </>,
    );
    // Each is another load: no two contexts read alike
    expect(new Set(seen).size).toBe(seen.length);
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
  });

  test('an input that reads data and a literal input shaped like its description are other loads', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const seen: unknown[] = [];
    function Card(props: { literal: boolean }) {
      const post = prefetchEntry(trpc.post.bySlug, { slug: 'hello' });
      seen.push(
        experimental_useHandles(trpc, {
          post,
          author: experimental_dataOf(post, (it) =>
            prefetchEntry(trpc.author.byId, {
              id: props.literal
                ? ({ '~dataOf': [['post'], ['authorId'], null] } as never)
                : it.authorId,
            }),
          ),
        }),
      );
      return null;
    }
    resource.renderApp(
      <>
        <Card literal={false} />
        <Card literal />
      </>,
    );
    expect(seen[1]).not.toBe(seen[0]);
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
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

  test('a bigint first cursor and the string that reads like it are other loads', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const seen: Record<string, any>[] = [];
    function List(props: { cursor: unknown }) {
      seen.push(
        experimental_useHandles(trpc, {
          posts: prefetchInfiniteEntry(
            trpc.post.paged,
            {},
            // Against its type, as an app with a transformer for it can have
            { initialCursor: props.cursor as number },
          ),
        }),
      );
      return null;
    }
    resource.renderApp(
      <>
        <List cursor={5n} />
        <List cursor="5n" />
        <List cursor={5n} />
      </>,
    );
    expect(seen[1]).not.toBe(seen[0]);
    expect(seen[1]!['posts'].initialCursor).toBe('5n');
    expect(seen[2]).toBe(seen[0]);
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
  });

  test('a first cursor of `-0` and one of `0` are other loads', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const seen: Record<string, any>[] = [];
    function List(props: { cursor: number }) {
      seen.push(
        experimental_useHandles(trpc, {
          posts: prefetchInfiniteEntry(
            trpc.post.paged,
            {},
            { initialCursor: props.cursor },
          ),
        }),
      );
      return null;
    }
    resource.renderApp(
      <>
        <List cursor={-0} />
        <List cursor={0} />
        <List cursor={-0} />
      </>,
    );
    // A transformer that keeps `-0`, such as superjson, lets a resolver tell
    // them apart
    expect(seen[1]).not.toBe(seen[0]);
    expect(Object.is(seen[1]!['posts'].initialCursor, 0)).toBe(true);
    expect(seen[2]).toBe(seen[0]);
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
  });

  test('a first cursor with a bigint in it does not stop the component from rendering, and differs from one with a string', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const seen: Record<string, any>[] = [];
    function List(props: { cursor: unknown }) {
      seen.push(
        experimental_useHandles(trpc, {
          posts: prefetchInfiniteEntry(
            trpc.post.paged,
            {},
            // Against its type, as an app with a transformer for it can have
            { initialCursor: props.cursor as number },
          ),
        }),
      );
      return null;
    }
    resource.renderApp(
      <>
        <List cursor={{ offset: 5n }} />
        <List cursor={{ offset: '5' }} />
        <List cursor={{ offset: 5n }} />
      </>,
    );
    expect(seen[0]!['posts'].initialCursor).toEqual({ offset: 5n });
    expect(seen[1]).not.toBe(seen[0]);
    expect(seen[2]).toBe(seen[0]);
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
  });

  test('a `trpc.context` with a Map or a Set of other values is another load', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const seen: unknown[] = [];
    function Card(props: { context: Record<string, unknown> }) {
      seen.push(
        experimental_useHandles(trpc, {
          post: prefetchEntry(
            trpc.post.bySlug,
            { slug: 'hello' },
            { trpc: { context: props.context } },
          ),
        }),
      );
      return null;
    }
    resource.renderApp(
      <>
        <Card context={{ route: new Map([['region', 'east']]) }} />
        <Card context={{ route: new Map([['region', 'west']]) }} />
        <Card context={{ route: new Map([['region', 'east']]) }} />
        <Card context={{ route: new Set(['east']) }} />
        <Card context={{ route: new Set(['west']) }} />
        <Card context={{ route: new Set(['east']) }} />
      </>,
    );
    // A link can route by what is in them
    expect(seen[1]).not.toBe(seen[0]);
    expect(seen[2]).toBe(seen[0]);
    expect(seen[3]).not.toBe(seen[0]);
    expect(seen[4]).not.toBe(seen[3]);
    expect(seen[5]).toBe(seen[3]);
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
  });

  test('a `trpc.context` value of `undefined` and one of `null` are other loads', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const seen: unknown[] = [];
    function Card(props: { context: Record<string, unknown> }) {
      seen.push(
        experimental_useHandles(trpc, {
          post: prefetchEntry(
            trpc.post.bySlug,
            { slug: 'hello' },
            { trpc: { context: props.context } },
          ),
        }),
      );
      return null;
    }
    resource.renderApp(
      <>
        <Card context={{ route: undefined }} />
        <Card context={{ route: null }} />
        <Card context={{ route: undefined }} />
      </>,
    );
    // A link can tell them apart
    expect(seen[1]).not.toBe(seen[0]);
    expect(seen[2]).toBe(seen[0]);
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
    using timers = fakeTimersResource();
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
    await timers.advanceTimersByTimeAsync(29_900);
    expect(renderOffPage()).toBe(first);
    expect(resource.calls).toHaveBeenCalledTimes(1);

    // Then nothing is kept: it loads again
    await timers.advanceTimersByTimeAsync(200);
    const second = renderOffPage();
    expect(second).not.toBe(first);
    await vi.waitFor(() => {
      expect(resource.calls).toHaveBeenCalledTimes(2);
    });

    // On the page, it keeps its load however long it is there
    seen.length = 0;
    const onPage = resource.renderApp(<Page fail={false} />);
    expect(seen[0]).toBe(second);
    await timers.advanceTimersByTimeAsync(120_000);
    resource.rerenderApp(onPage, <Page fail={false} />);
    expect(seen.at(-1)).toBe(second);
    expect(resource.calls).toHaveBeenCalledTimes(2);
  });
});
