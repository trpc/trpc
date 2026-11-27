import { testReactResource } from '../../test/__helpers';
import {
  skipToken,
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { initTRPC, TRPCError } from '@trpc/server';
import * as React from 'react';
import superjson from 'superjson';
import { describe, expect, expectTypeOf, test, vi } from 'vitest';
import { z } from 'zod';
import {
  ensureEntry,
  fetchEntry,
  fromHandle,
  prefetchEntry,
  prefetchInfiniteEntry,
  useLoadHandles,
} from '.';
import type {
  inferInfiniteQueryHandle,
  inferQueryHandle,
  TRPCEntryOptions,
  TRPCLoadEntries,
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
          return { title: `Post ${opts.input.slug}` };
        }),
      paged: t.procedure
        .input(z.object({ cursor: z.number().nullish() }))
        .query((opts) => {
          calls('post.paged', opts.input);
          const cursor = opts.input.cursor ?? 0;
          return { items: [cursor, cursor + 1], nextCursor: cursor + 2 };
        }),
    }),
  });
  const resource = testReactResource(appRouter);
  return { ...resource, calls, appRouter };
};

type AppRouter = ReturnType<typeof ctx>['appRouter'];
type TRPC = TRPCOptionsProxy<AppRouter>;

class Boundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override render() {
    return this.state.error ? (
      <p>{`failed:${this.state.error.message}`}</p>
    ) : (
      this.props.children
    );
  }
}

/**
 * Renders one component with each of `entries` in turn. Says, for each one
 * after the first, whether the component started its entries again
 */
function restartsAcross(
  resource: ReturnType<typeof ctx>,
  entries: (() => TRPCLoadEntries)[],
) {
  const trpc = resource.optionsProxyServer;
  const seen: unknown[] = [];
  function Card(props: { entries: () => TRPCLoadEntries }) {
    seen.push(useLoadHandles(trpc, props.entries()));
    return null;
  }
  // What the component has once each render is done: a render can run twice
  const utils = resource.renderApp(<Card entries={entries[0]!} />);
  const committed = [seen.at(-1)];
  for (const next of entries.slice(1)) {
    resource.rerenderApp(utils, <Card entries={next} />);
    committed.push(seen.at(-1));
  }
  return committed
    .slice(1)
    .map((handles, index) => handles !== committed[index]);
}

describe('useLoadHandles', () => {
  test('a page without a loader starts its entries once, and its components read them', async () => {
    await using resource = ctx();
    function Post(props: { post: inferQueryHandle<TRPC['post']['bySlug']> }) {
      const trpc = resource.useTRPC();
      const post = useSuspenseQuery(fromHandle(trpc, props.post));
      return <p>{post.data.title}</p>;
    }
    function Posts(props: {
      posts: inferInfiniteQueryHandle<TRPC['post']['paged']>;
    }) {
      const trpc = resource.useTRPC();
      const posts = useSuspenseInfiniteQuery(
        fromHandle(trpc, props.posts, {
          getNextPageParam: (last) => last.nextCursor,
        }),
      );
      return <p>{`items:${posts.data.pages.flatMap((p) => p.items)}`}</p>;
    }
    const pageRenders = vi.fn();
    function PostPage(props: { slug: string }) {
      const trpc = resource.useTRPC();
      const handles = useLoadHandles(trpc, {
        post: prefetchEntry(trpc.post.bySlug, { slug: props.slug }),
        posts: prefetchInfiniteEntry(trpc.post.paged, {}),
        draft: skipToken,
      });
      expectTypeOf(handles.post).toEqualTypeOf<
        inferQueryHandle<TRPC['post']['bySlug']>
      >();
      expectTypeOf(handles.draft).toEqualTypeOf<undefined>();
      pageRenders(handles);
      return (
        <React.Suspense fallback={<p>loading</p>}>
          <Post post={handles.post} />
          <Posts posts={handles.posts} />
        </React.Suspense>
      );
    }
    const utils = resource.renderApp(<PostPage slug="hello" />);
    // It returns at once, without waiting
    expect(utils.container).toHaveTextContent('loading');
    await vi.waitFor(() => {
      expect(utils.container).toHaveTextContent('Post hello');
    });
    expect(utils.container).toHaveTextContent('items:0,1');
    expect(resource.calls.mock.calls).toEqual([
      ['post.bySlug', { slug: 'hello' }],
      ['post.paged', {}],
    ]);
    // A skipped key has no handle
    expect(Object.keys(pageRenders.mock.calls[0]![0])).toEqual([
      'post',
      'posts',
    ]);

    // Rendering again starts nothing, and has the same handles
    resource.rerenderApp(utils, <PostPage slug="hello" />);
    expect(
      new Set(pageRenders.mock.calls.map(([handles]) => handles)).size,
    ).toBe(1);
    expect(resource.calls).toHaveBeenCalledTimes(2);

    // Other entries are another load, which starts each of its entries
    resource.calls.mockClear();
    resource.rerenderApp(utils, <PostPage slug="other" />);
    await vi.waitFor(() => {
      expect(utils.container).toHaveTextContent('Post other');
    });
    expect(resource.calls.mock.calls).toEqual([
      ['post.bySlug', { slug: 'other' }],
      ['post.paged', {}],
    ]);
  });

  test("a failed fetch or ensure entry doesn't throw from the page: its reader's error boundary has the error", async () => {
    await using resource = ctx();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function Post(props: { post: inferQueryHandle<TRPC['post']['bySlug']> }) {
      const trpc = resource.useTRPC();
      const post = useSuspenseQuery(
        fromHandle(trpc, props.post, { retry: false }),
      );
      return <p>{post.data.title}</p>;
    }
    function PostPage() {
      const trpc = resource.useTRPC();
      const handles = useLoadHandles(trpc, {
        fetched: fetchEntry(
          trpc.post.bySlug,
          { slug: 'missing' },
          { retry: false },
        ),
        ensured: ensureEntry(trpc.post.bySlug, { slug: 'hello' }),
      });
      return (
        <>
          <Boundary>
            <React.Suspense fallback={<p>loading</p>}>
              <Post post={handles.fetched} />
            </React.Suspense>
          </Boundary>
          <React.Suspense fallback={<p>loading</p>}>
            <Post post={handles.ensured} />
          </React.Suspense>
        </>
      );
    }
    const utils = resource.renderApp(<PostPage />);
    await vi.waitFor(() => {
      expect(utils.container).toHaveTextContent('failed:NOT_FOUND');
    });
    expect(utils.container).toHaveTextContent('Post hello');
    expect(
      resource.calls.mock.calls.filter(([, input]) => input.slug === 'missing'),
    ).toHaveLength(1);
  });

  test('a query that failed is not started again by a page whose Suspense boundary is above it', async () => {
    await using resource = ctx();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function PostPage(props: { kind: 'prefetch' | 'fetch' | 'ensure' }) {
      const trpc = resource.useTRPC();
      const input = { slug: 'missing' };
      const opts = { retry: false };
      const handles = useLoadHandles(trpc, {
        post:
          props.kind === 'prefetch'
            ? prefetchEntry(trpc.post.bySlug, input, opts)
            : props.kind === 'fetch'
              ? fetchEntry(trpc.post.bySlug, input, opts)
              : ensureEntry(trpc.post.bySlug, input, opts),
      });
      // No Suspense boundary of its own: the page renders again from nothing
      const post = useSuspenseQuery(
        fromHandle(trpc, handles.post, { retry: false }),
      );
      return <p>{post.data.title}</p>;
    }
    for (const kind of ['prefetch', 'fetch', 'ensure'] as const) {
      resource.queryClient.clear();
      resource.calls.mockClear();
      const utils = resource.renderApp(
        <Boundary>
          <React.Suspense fallback={<p>loading</p>}>
            <PostPage kind={kind} />
          </React.Suspense>
        </Boundary>,
      );
      await vi.waitFor(() => {
        expect(utils.container).toHaveTextContent('failed:NOT_FOUND');
      });
      expect(resource.calls).toHaveBeenCalledTimes(1);
      utils.unmount();
    }
  });

  test('throws for what is not an entry, and for a proxy that is not the root, before anything starts', async () => {
    await using resource = ctx();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const trpc = resource.optionsProxyServer;
    function Page(props: { trpc: unknown; entries: TRPCLoadEntries }) {
      useLoadHandles(props.trpc as TRPC, props.entries);
      return null;
    }
    const utils = resource.renderApp(
      <>
        <Boundary>
          <Page
            trpc={trpc}
            entries={{
              post: prefetchEntry(trpc.post.bySlug, { slug: 'hello' }),
              other: { not: 'an entry' } as any,
            }}
          />
        </Boundary>
        <Boundary>
          <Page trpc={trpc.post} entries={{}} />
        </Boundary>
      </>,
    );
    expect(
      Array.from(utils.container.querySelectorAll('p'), (p) => p.textContent),
    ).toMatchInlineSnapshot(`
      Array [
        "failed:Expected an entry from \`prefetchEntry()\`, \`fetchEntry()\` or \`ensureEntry()\`, or \`skipToken\`, for "other", got {"not":"an entry"}",
        "failed:\`useLoadHandles()\` takes the root proxy, \`trpc\`, got \`trpc.post\`",
      ]
    `);
    expect(resource.queryClient.getQueryCache().getAll()).toEqual([]);
    expect(resource.calls).not.toHaveBeenCalled();
  });

  test('strict mode starts the entries once', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const seen: unknown[] = [];
    function Page() {
      seen.push(
        useLoadHandles(trpc, {
          post: fetchEntry(trpc.post.bySlug, { slug: 'hello' }),
        }),
      );
      return null;
    }
    const page = () => (
      <React.StrictMode>
        <Page />
      </React.StrictMode>
    );
    const utils = resource.renderApp(page());
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
    resource.rerenderApp(utils, page());
    expect(seen.length).toBeGreaterThan(2);
    expect(new Set(seen).size).toBe(1);
    expect(resource.calls).toHaveBeenCalledTimes(1);
  });

  test('two components with the same entries each start them, in one request, and a component that comes back starts them again', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    function Card() {
      useLoadHandles(trpc, {
        post: prefetchEntry(trpc.post.bySlug, { slug: 'hello' }),
      });
      return null;
    }
    const page = (cards: number) =>
      Array.from({ length: cards }, (_, index) => <Card key={index} />);
    const utils = resource.renderApp(page(2));
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
    // The second joined the first's request
    expect(resource.calls).toHaveBeenCalledTimes(1);

    // One leaves: nothing starts
    resource.rerenderApp(utils, page(1));
    expect(resource.calls).toHaveBeenCalledTimes(1);

    // It comes back: it starts them again, as a loader that runs again does
    resource.rerenderApp(utils, page(2));
    await vi.waitFor(() => {
      expect(resource.calls).toHaveBeenCalledTimes(2);
    });
  });

  test('the same entries under other keys, or of another kind, start again. Their order is not compared', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const input = { slug: 'hello' };
    expect(
      restartsAcross(resource, [
        () => ({ a: prefetchEntry(trpc.post.bySlug, input) }),
        () => ({ b: prefetchEntry(trpc.post.bySlug, input) }),
        () => ({ b: ensureEntry(trpc.post.bySlug, input) }),
        () => ({
          a: prefetchEntry(trpc.post.bySlug, input),
          b: ensureEntry(trpc.post.bySlug, input),
        }),
        () => ({
          b: ensureEntry(trpc.post.bySlug, input),
          a: prefetchEntry(trpc.post.bySlug, input),
        }),
      ]),
    ).toEqual([true, true, true, false]);
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
  });

  test('another option for how the query starts starts it again. Its `meta` is not compared', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    // Anything can be in `meta`: what has no JSON, or is new on every render
    const circular: Record<string, unknown> = { big: 1n, at: Date.now() };
    circular['self'] = circular;
    const post = (opts: TRPCEntryOptions) => () => ({
      post: prefetchEntry(trpc.post.bySlug, { slug: 'hello' }, opts),
    });
    expect(
      restartsAcross(resource, [
        post({}),
        post({ meta: circular }),
        post({ staleTime: 60_000 }),
        // `Infinity` has no JSON: it doesn't read as no option
        post({ staleTime: Infinity }),
        post({ retry: () => false }),
        // Which function it is isn't compared: an inline one is new on every render
        post({ retry: () => false }),
      ]),
    ).toEqual([false, true, true, true, false]);
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
  });

  test("keys that the client's `queryKeyHashFn` tells apart start again", async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    // Tells a date from its ISO string, as the cache then does
    resource.queryClient.setDefaultOptions({
      queries: {
        queryKeyHashFn: (queryKey) =>
          JSON.stringify(superjson.serialize(queryKey)),
      },
    });
    const date = new Date(0);
    const post = (slug: unknown) => () => ({
      post: prefetchEntry(trpc.post.bySlug, { slug: slug as string }),
    });
    expect(
      restartsAcross(resource, [post(date), post(date.toISOString())]),
    ).toEqual([true]);
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
  });

  test('an infinite entry with and without `getNextPageParam` starts again', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const posts = (withNext: boolean) => () => ({
      posts: prefetchInfiniteEntry(
        trpc.post.paged,
        {},
        withNext ? { getNextPageParam: (last) => last.nextCursor } : {},
      ),
    });
    expect(
      // Which function it is isn't compared: an inline one is new on every render
      restartsAcross(resource, [posts(false), posts(true), posts(true)]),
    ).toEqual([true, false]);
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
  });

  test('another first cursor starts it again, also one with a bigint in it', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const posts = (cursor: unknown) => () => ({
      posts: prefetchInfiniteEntry(
        trpc.post.paged,
        {},
        // Against its type, as an app with a transformer for it can have
        { initialCursor: cursor as number },
      ),
    });
    expect(
      restartsAcross(resource, [
        posts(5n),
        posts(5n),
        posts(6n),
        posts('5'),
        posts(0),
        posts({ offset: 5n }),
        posts({ offset: 5n }),
        posts({ offset: '5' }),
      ]),
    ).toEqual([false, true, true, true, true, false, true]);
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
  });

  test('a component that renders again before it is on the page starts its entries again, as a loader that runs again does', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function Page(props: { staleTime: number | undefined }): React.ReactNode {
      useLoadHandles(trpc, {
        post: prefetchEntry(
          trpc.post.bySlug,
          { slug: 'hello' },
          { staleTime: props.staleTime },
        ),
      });
      throw new Error('It never gets on the page');
    }
    /** Renders the page, which throws before it gets on the page */
    const renderOffPage = async (staleTime: number | undefined) => {
      resource.renderApp(
        <Boundary>
          <Page staleTime={staleTime} />
        </Boundary>,
      );
      await vi.waitFor(() => {
        expect(resource.queryClient.isFetching()).toBe(0);
      });
    };

    await renderOffPage(undefined);
    expect(resource.calls).toHaveBeenCalledTimes(1);
    // Its data is stale: it is fetched again
    await renderOffPage(undefined);
    expect(resource.calls).toHaveBeenCalledTimes(2);
    // Its data is fresh: nothing is asked for
    await renderOffPage(60_000);
    expect(resource.calls).toHaveBeenCalledTimes(2);
  });
});
