import { testReactResource } from '../../test/__helpers';
import {
  hashKey,
  InfiniteQueryObserver,
  skipToken,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { httpBatchLink, httpBatchStreamLink } from '@trpc/client';
import { initTRPC, TRPCError } from '@trpc/server';
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
    tag: t.router({
      byIds: t.procedure
        .input(z.object({ ids: z.array(z.string()) }))
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
const pipeliningCtx = (
  link: typeof httpBatchLink | typeof httpBatchStreamLink,
  /** How long every request takes to leave, in milliseconds */
  latency = 0,
) => {
  const { appRouter, calls } = createAppRouter();
  const resource = testReactResource(appRouter, {
    server: { experimental_allowPipelining: true },
    client: (opts) => ({
      links: [
        link({
          url: opts.httpUrl,
          experimental_pipelining: true,
          fetch: async (input, init) => {
            await new Promise((resolve) => setTimeout(resolve, latency));
            return fetch(input, init);
          },
        }),
      ],
    }),
  });
  return { ...resource, calls, appRouter };
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
          httpBatchLink({ url: opts.httpUrl, experimental_pipelining: true }),
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
            experimental_pipelining: true,
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
    await using resource = pipeliningCtx(scenario.link);
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
    await using resource = pipeliningCtx(scenario.link);
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
    await using resource = pipeliningCtx(scenario.link);
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
    await using resource = pipeliningCtx(scenario.link);
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
    await using resource = pipeliningCtx(scenario.link);
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
    await using resource = pipeliningCtx(scenario.link, 20);
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
      '/post.bySlug,author.byId,post.byAuthor?batch=2',
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

  test("an entry per item of a prefetch entry's list loads in one request, which the load does not wait for", async () => {
    await using resource = pipeliningCtx(scenario.link, 20);
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
    await using resource = pipeliningCtx(scenario.link);
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
      expect(req.url).toContain('/post.paged,author.byId?batch=2');
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
    await using resource = pipeliningCtx(scenario.link);
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
    await using resource = pipeliningCtx(scenario.link, 50);
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
    await using resource = pipeliningCtx(scenario.link);
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
    await using resource = pipeliningCtx(scenario.link);
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

  test('an entry that keeps its cached data makes the entry that reads it fetch with the input the client filled in', async () => {
    await using resource = pipeliningCtx(scenario.link);
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
    await using resource = pipeliningCtx(scenario.link);
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
    await using resource = pipeliningCtx(scenario.link);
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

  test("an entry's own error is not fetched twice", async () => {
    await using resource = pipeliningCtx(scenario.link);
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
    await using resource = pipeliningCtx(scenario.link);
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
