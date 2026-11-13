import { testReactResource } from '../../test/__helpers';
import { skipToken, useSuspenseQuery } from '@tanstack/react-query';
import { httpBatchLink, httpBatchStreamLink } from '@trpc/client';
import { initTRPC, TRPCError } from '@trpc/server';
import * as React from 'react';
import { describe, expect, expectTypeOf, test, vi } from 'vitest';
import { z } from 'zod';
import {
  dataOf,
  ensureEntry,
  ensureInfiniteEntry,
  fetchEntry,
  fromHandle,
  isTRPCEntryError,
  loadHandles,
  loadHandlesSettled,
  prefetchEntry,
  prefetchInfiniteEntry,
} from '.';
import type {
  inferHandles,
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
) => {
  const { appRouter, calls } = createAppRouter();
  const resource = testReactResource(appRouter, {
    server: { allowPipelining: true },
    client: (opts) => ({
      links: [link({ url: opts.httpUrl, pipelining: true })],
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
      author: ensureEntry(trpc.author.byId, { id: dataOf(post).authorId }),
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

    expectTypeOf(dataOf(post).authorId).toEqualTypeOf<string>();
    expectTypeOf(dataOf(list).pages).toEqualTypeOf<
      { items: string[]; nextCursor: null }[]
    >();
    // @ts-expect-error the input is checked against the data's type
    ensureEntry(trpc.author.byId, { id: dataOf(post).tags });

    expect(() => `${dataOf(post).authorId}`).toThrowErrorMatchingInlineSnapshot(
      `[Error: A \`dataOf()\` value has no data until the load runs, so it can't be made into a string or a number. Pass it as it is, as an entry's input or anywhere inside it]`,
    );
    expect(() => dataOf({} as typeof post)).toThrowErrorMatchingInlineSnapshot(
      `[Error: \`dataOf()\` expects an entry from \`prefetchEntry()\`, \`fetchEntry()\` or \`ensureEntry()\`, got {}]`,
    );
    expect(resource.calls).not.toHaveBeenCalled();
  });

  test('reads through arrays, a prefetch entry, and a chain of entries', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;

    const post = prefetchEntry(trpc.post.bySlug, { slug: 'hello' });
    const author = prefetchEntry(trpc.author.byId, {
      id: dataOf(post).authorId,
    });
    const [handles, data] = await loadHandles(trpc, {
      post,
      author,
      team: prefetchEntry(trpc.team.byId, { id: dataOf(author).teamId }),
      tags: prefetchEntry(trpc.tag.byIds, {
        ids: [dataOf(post).tags[0]!.id, dataOf(post).tags[1]!.id, 'extra'],
      }),
      more: prefetchInfiniteEntry(trpc.post.byAuthor, {
        authorId: dataOf(post).authorId,
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
      author: prefetchEntry(trpc.author.byId, { id: dataOf(post).authorId }),
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
      author: ensureEntry(trpc.author.byId, { id: dataOf(post).authorId }),
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
      const entries = {
        post,
        author: prefetchEntry(trpc.author.byId, { id: dataOf(post).authorId }),
      };
      const error = await loadHandles(trpc, entries).catch(
        (cause: unknown) => cause,
      );
      expect(error).toMatchObject({
        key: 'post',
        path: 'post.bySlug',
        code: 'NOT_FOUND',
      });
      expect(isTRPCEntryError(error, trpc.post.bySlug)).toBe(true);
      // No handle can be made for the author, so this rejects too
      await expect(loadHandlesSettled(trpc, entries)).rejects.toMatchObject({
        key: 'post',
        code: 'NOT_FOUND',
      });
    }
    expect(resource.calls).not.toHaveBeenCalledWith(
      'author.byId',
      expect.anything(),
    );
  });

  test('throws for an entry that is not in the load', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const post = ensureEntry(trpc.post.bySlug, { slug: 'hello' });

    await expect(
      loadHandles(trpc, {
        team: prefetchEntry(trpc.team.byId, { id: 'team1' }),
        author: prefetchEntry(trpc.author.byId, { id: dataOf(post).authorId }),
      }),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `[Error: The entry for "author" reads the data of an entry with \`dataOf()\` that isn't in this load. Add that entry to the load]`,
    );
    expect(resource.calls).not.toHaveBeenCalled();
  });
});

describe('dataOf().map()', () => {
  test('reads a part of every item of an array', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;

    const post = ensureEntry(trpc.post.bySlug, { slug: 'hello' });
    const tagIds = dataOf(post).tags.map((tag) => tag.id);
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
      dataOf(post).tags.map((tag) => ({ id: tag.id })),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: A \`dataOf()\` value has no data until the load runs, so it can only be passed on as it is, as an entry's input or anywhere inside it. A \`.map()\` callback must return the item or a part of it, such as \`(post) => post.authorId\`, or an entry to load for every item]`,
    );
    expect(() => dataOf(post).tags.map(() => dataOf(post).id)).toThrow(
      /must return the item or a part of it/,
    );
    expect(() =>
      dataOf(post).tags.filter((tag) => tag.id === 't1'),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: A \`dataOf()\` value has no data until the load runs, so it can only be passed on as it is, as an entry's input or anywhere inside it. Of an array's methods, only \`.map()\` works, to read a part of every item]`,
    );
  });
});

describe('an entry for every item, from dataOf().map()', () => {
  test('gives a handle, and data, for every item', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;

    const post = ensureEntry(trpc.post.bySlug, { slug: 'hello' });
    const [handles, data] = await loadHandles(trpc, {
      post,
      tags: dataOf(post).tags.map((tag) =>
        ensureEntry(trpc.tag.byIds, { ids: [tag.id] }),
      ),
      // Not waited for, so it has no data
      alsoTags: dataOf(post).tags.map((tag) =>
        prefetchEntry(trpc.tag.byIds, { ids: [tag.id, 'extra'] }),
      ),
    });

    expectTypeOf(handles.tags).toEqualTypeOf<
      inferQueryHandle<TRPC['tag']['byIds']>[]
    >();
    expectTypeOf(data.tags).toEqualTypeOf<{ id: string }[][]>();
    expectTypeOf<keyof typeof data>().toEqualTypeOf<'post' | 'tags'>();

    expect(handles.tags).toEqual([
      {
        queryKey: [['tag', 'byIds'], { input: { ids: ['t1'] }, type: 'query' }],
        input: { ids: ['t1'] },
      },
      {
        queryKey: [['tag', 'byIds'], { input: { ids: ['t2'] }, type: 'query' }],
        input: { ids: ['t2'] },
      },
    ]);
    expect(data.tags).toEqual([[{ id: 't1' }], [{ id: 't2' }]]);
    expect(handles.alsoTags.map((handle) => handle.input)).toEqual([
      { ids: ['t1', 'extra'] },
      { ids: ['t2', 'extra'] },
    ]);
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
      tags: dataOf(post).tags.map((tag) =>
        ensureEntry(trpc.tag.byIds, { ids: [tag.id] }),
      ),
    };
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
        authorId: dataOf(post).authorId,
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
      inferHandles<typeof postEntries>
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
      handles: inferHandles<typeof authorCardEntries>;
    }) {
      const trpc = useTRPC();
      const author = useSuspenseQuery(fromHandle(trpc, props.handles.author));
      return <address>{author.data.name}</address>;
    }
    function Post(props: { handles: inferHandles<typeof postEntries> }) {
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
      id: dataOf(post).authorId,
    });
    const [handles, data] = await loadHandles(trpc, {
      post,
      author,
      team: ensureEntry(trpc.team.byId, { id: dataOf(author).teamId }),
      tags: prefetchEntry(trpc.tag.byIds, {
        ids: [dataOf(post).tags[1]!.id, 'extra'],
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
        ids: dataOf(post).tags.map((tag) => tag.id),
      }),
    });
    expect(handles.tags.input).toEqual({ ids: ['t1', 't2'] });
    expect(resource.calls).toHaveBeenCalledWith('tag.byIds', {
      ids: ['t1', 't2'],
    });
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(1);
  });

  test('an entry for every item is one call that the server runs for every item', async () => {
    await using resource = pipeliningCtx(scenario.link);
    const trpc = resource.optionsProxyClient;
    resource.calls.mockImplementation((path: string, input: any) => {
      if (path === 'tag.byIds' && input.ids[0] === 't2') {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
    });

    const post = fetchEntry(trpc.post.bySlug, { slug: 'hello' });
    const [handles] = await loadHandles(trpc, {
      post,
      tags: dataOf(post).tags.map((tag) =>
        prefetchEntry(trpc.tag.byIds, { ids: [tag.id, 'extra'] }),
      ),
    });
    expect(handles.tags.map((handle) => handle.input)).toEqual([
      { ids: ['t1', 'extra'] },
      { ids: ['t2', 'extra'] },
    ]);
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });

    // Every item is a cache entry of its own, with its own result or error
    expect(
      resource.queryClient.getQueryData(
        trpc.tag.byIds.queryKey({ ids: ['t1', 'extra'] }),
      ),
    ).toEqual([{ id: 't1' }, { id: 'extra' }]);
    expect(
      resource.queryClient.getQueryState(
        trpc.tag.byIds.queryKey({ ids: ['t2', 'extra'] }),
      )?.error,
    ).toMatchObject({ data: { code: 'FORBIDDEN' } });
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(1);
    expect(
      resource.calls.mock.calls.filter(([path]) => path === 'tag.byIds'),
    ).toHaveLength(2);
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
      author: ensureEntry(trpc.author.byId, { id: dataOf(post).authorId }),
    });
    expect(handles.author.input).toEqual({ id: 'u1' });
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(1);
    expect(resource.onRequestSpy.mock.calls[0]![0].url).not.toContain('pipe=');
  });

  test('a stale ensure entry is read from the cache, so nothing is pipelined from its refetch', async () => {
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
      author: ensureEntry(trpc.author.byId, { id: dataOf(post).authorId }),
    });
    // The handle's input and its data agree
    expect(handles.author.input).toEqual({ id: 'u0' });
    expect(data.author.id).toBe('u0');
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
    // The refetch and the author still share a request
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(1);
    expect(resource.onRequestSpy.mock.calls[0]![0].url).not.toContain('pipe=');
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
    const author = ensureEntry(trpc.author.byId, { id: dataOf(post).authorId });
    const [handles, data] = await loadHandles(trpc, {
      post,
      author,
      team: fetchEntry(trpc.team.byId, { id: dataOf(author).teamId }),
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
        author: prefetchEntry(trpc.author.byId, { id: dataOf(post).authorId }),
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
      author: ensureEntry(trpc.author.byId, { id: dataOf(post).authorId }),
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
        author: ensureEntry(trpc.author.byId, { id: dataOf(post).authorId }),
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
        authorId: dataOf(post).authorId,
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

  test('nothing is pipelined from an infinite entry, whose data no one request returns', async () => {
    await using resource = pipeliningCtx(scenario.link);
    const trpc = resource.optionsProxyClient;
    const more = ensureInfiniteEntry(trpc.post.byAuthor, { authorId: 'u1' });
    const [handles] = await loadHandles(trpc, {
      more,
      author: ensureEntry(trpc.author.byId, {
        id: dataOf(more).pages[0]!.items[0]!,
      }),
    });
    expect(handles.author.input).toEqual({ id: 'u1' });
    expect(resource.onRequestSpy).toHaveBeenCalledTimes(2);
  });
});
