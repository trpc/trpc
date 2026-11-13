import { testReactResource } from '../../test/__helpers';
import { skipToken, useSuspenseQuery } from '@tanstack/react-query';
import { initTRPC, TRPCError } from '@trpc/server';
import * as React from 'react';
import { describe, expect, expectTypeOf, test, vi } from 'vitest';
import { z } from 'zod';
import {
  dataOf,
  ensureEntry,
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

const ctx = () => {
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
  return { ...testReactResource(appRouter), calls, appRouter };
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
