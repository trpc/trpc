import { testReactResource } from '../../test/__helpers';
import { fakeTimersResource } from '@trpc/server/__tests__/fakeTimersResource';
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

  test('two components with the same entries share one load, until the last of them leaves', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const seen: unknown[] = [];
    function Card() {
      seen.push(
        useLoadHandles(trpc, {
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

  test('the same entries under other keys, or of another kind, are another load', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const seen: Record<string, unknown>[] = [];
    function Card(props: { entries: () => TRPCLoadEntries }) {
      seen.push(useLoadHandles(trpc, props.entries()));
      return null;
    }
    const input = { slug: 'hello' };
    resource.renderApp(
      <>
        <Card entries={() => ({ a: prefetchEntry(trpc.post.bySlug, input) })} />
        <Card entries={() => ({ b: prefetchEntry(trpc.post.bySlug, input) })} />
        <Card entries={() => ({ a: ensureEntry(trpc.post.bySlug, input) })} />
        <Card entries={() => ({ a: prefetchEntry(trpc.post.bySlug, input) })} />
      </>,
    );
    expect(seen[1]).not.toBe(seen[0]);
    expect(seen[2]).not.toBe(seen[0]);
    expect(seen[3]).toBe(seen[0]);
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
      retry: ((count: number) => boolean) | undefined;
    }) {
      seen.push(
        useLoadHandles(trpc, {
          post: prefetchEntry(
            trpc.post.bySlug,
            { slug: 'hello' },
            {
              staleTime: props.staleTime,
              meta: props.meta,
              retry: props.retry,
            },
          ),
        }),
      );
      return null;
    }
    resource.renderApp(
      <>
        <Card staleTime={undefined} meta={undefined} retry={undefined} />
        <Card staleTime={undefined} meta={circular} retry={undefined} />
        <Card staleTime={60_000} meta={undefined} retry={undefined} />
        {/* `Infinity` has no JSON: it doesn't read as no option */}
        <Card staleTime={Infinity} meta={undefined} retry={undefined} />
        <Card staleTime={undefined} meta={undefined} retry={() => false} />
        {/* Which function it is isn't compared: an inline one is new on every render */}
        <Card staleTime={undefined} meta={undefined} retry={() => false} />
      </>,
    );
    expect(seen[1]).toBe(seen[0]);
    expect(seen[2]).not.toBe(seen[0]);
    expect(seen[2]).toEqual(seen[0]);
    expect(seen[3]).not.toBe(seen[0]);
    expect(seen[4]).not.toBe(seen[0]);
    expect(seen[5]).toBe(seen[4]);
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
  });

  test("keys that the client's `queryKeyHashFn` tells apart are another load", async () => {
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
    const seen: unknown[] = [];
    function Card(props: { slug: string }) {
      seen.push(
        useLoadHandles(trpc, {
          post: prefetchEntry(trpc.post.bySlug, { slug: props.slug }),
        }),
      );
      return null;
    }
    resource.renderApp(
      <>
        <Card slug={date as unknown as string} />
        <Card slug={date.toISOString()} />
      </>,
    );
    expect(seen[1]).not.toBe(seen[0]);
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
  });

  test('the same infinite entry with and without `getNextPageParam` is another load', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const seen: unknown[] = [];
    function Card(props: { withNext: boolean }) {
      seen.push(
        useLoadHandles(trpc, {
          posts: prefetchInfiniteEntry(
            trpc.post.paged,
            {},
            props.withNext
              ? { getNextPageParam: (last) => last.nextCursor }
              : {},
          ),
        }),
      );
      return null;
    }
    resource.renderApp(
      <>
        <Card withNext={false} />
        <Card withNext />
        {/* Which function it is isn't compared: an inline one is new on every render */}
        <Card withNext />
      </>,
    );
    expect(seen[1]).not.toBe(seen[0]);
    expect(seen[2]).toBe(seen[1]);
    await vi.waitFor(() => {
      expect(resource.queryClient.isFetching()).toBe(0);
    });
  });

  test('first cursors that JSON reads the same are other loads, and one with no JSON still renders', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const seen: Record<string, any>[] = [];
    function List(props: { cursor: unknown }) {
      seen.push(
        useLoadHandles(trpc, {
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
    const cursors = [5n, '5n', -0, 0, { offset: 5n }, { offset: '5' }];
    resource.renderApp(
      <>
        {[...cursors, ...cursors].map((cursor, index) => (
          <List key={index} cursor={cursor} />
        ))}
      </>,
    );
    expect(seen[0]!['posts'].initialCursor).toBe(5n);
    expect(new Set(seen.slice(0, cursors.length)).size).toBe(cursors.length);
    // The same cursor again is the same load
    seen.slice(cursors.length).forEach((handles, index) => {
      expect(handles).toBe(seen[index]);
    });
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
      const handles = useLoadHandles(trpc, {
        post: prefetchEntry(trpc.post.bySlug, { slug: 'hello' }),
      });
      seen.push(handles);
      if (props.fail) {
        throw new Error('It never mounts');
      }
      return null;
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
