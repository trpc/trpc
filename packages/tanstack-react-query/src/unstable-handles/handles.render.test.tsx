import { testReactResource } from '../../test/__helpers';
import {
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { getUntypedClient } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import * as React from 'react';
import { afterEach, describe, expect, expectTypeOf, test, vi } from 'vitest';
import { z } from 'zod';
import {
  createTRPCLoaderProxy,
  loadHandles,
  fetchInfiniteEntry,
  waterfallHandle,
  waterfallInfiniteHandle,
  fromHandle,
} from '.';
import type { inferQueryHandle, inferInfiniteQueryHandle } from '.';
import type { TRPCOptionsProxy } from '..';

const ctx = () => {
  const t = initTRPC.create();
  const calls = vi.fn();
  let version = 0;
  const appRouter = t.router({
    post: t.router({
      byId: t.procedure.input(z.object({ id: z.string() })).query((opts) => {
        calls('post.byId', opts.input);
        if (opts.input.id === 'missing') {
          throw new Error('Not found');
        }
        version++;
        return { id: opts.input.id, title: `Post ${opts.input.id}`, version };
      }),
      comments: t.procedure
        .input(
          z.object({
            postId: z.string(),
            limit: z.number().optional(),
            cursor: z.number().nullish(),
          }),
        )
        .query((opts) => {
          calls('post.comments', opts.input);
          const start = opts.input.cursor ?? 0;
          return { items: [start, start + 1], nextCursor: start + 2 };
        }),
    }),
  });
  const resource = testReactResource(appRouter);
  return {
    ...resource,
    calls,
    appRouter,
    loaderProxyClient: createTRPCLoaderProxy<typeof appRouter>({
      client: getUntypedClient(resource.client),
      queryClient: resource.queryClient,
    }),
    loaderProxyServer: createTRPCLoaderProxy<typeof appRouter>({
      router: appRouter,
      ctx: {},
      queryClient: resource.queryClient,
    }),
  };
};

/**
 * Suspense readers treat data younger than a second as fresh
 */
function ageCachedData() {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.now() + 2_000);
}

type AppRouter = ReturnType<typeof ctx>['appRouter'];
type TRPC = TRPCOptionsProxy<AppRouter>;

function setup(resource: ReturnType<typeof ctx>) {
  function Post(props: { post: inferQueryHandle<TRPC['post']['byId']> }) {
    const trpc = resource.useTRPC();
    const postQuery = useSuspenseQuery(fromHandle(trpc, props.post));
    return <p>{`${postQuery.data.title} v${postQuery.data.version}`}</p>;
  }
  function Comments(props: {
    comments: inferInfiniteQueryHandle<TRPC['post']['comments']>;
  }) {
    const trpc = resource.useTRPC();
    const commentsQuery = useSuspenseInfiniteQuery(
      fromHandle(trpc, props.comments, {
        getNextPageParam: (last) => last.nextCursor,
      }),
    );
    return (
      <p>{`comments:${commentsQuery.data.pages.flatMap((p) => p.items).join(',')}`}</p>
    );
  }
  function PostPage(props: { id: string; flipKeys?: boolean }) {
    const trpc = resource.useTRPC();
    const post = waterfallHandle(trpc.post.byId, { id: props.id });
    // Same input, different key order
    const comments = waterfallInfiniteHandle(
      trpc.post.comments,
      props.flipKeys
        ? { limit: 2, postId: props.id }
        : { postId: props.id, limit: 2 },
    );
    return (
      <>
        <React.Suspense fallback={<p>loading post</p>}>
          <Post post={post} />
        </React.Suspense>
        <React.Suspense fallback={<p>loading comments</p>}>
          <Comments comments={comments} />
        </React.Suspense>
      </>
    );
  }
  return { PostPage, Post };
}

describe('waterfallHandle on useTRPC() during render', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('returns typed handles', () => {
    const trpc = {} as TRPC;
    if (Math.random() < 2) return;
    expectTypeOf(waterfallHandle(trpc.post.byId, { id: '1' })).toEqualTypeOf<
      inferQueryHandle<TRPC['post']['byId']>
    >();
  });

  test('starts every query before any reader renders', async () => {
    await using resource = ctx();
    const { PostPage } = setup(resource);
    const utils = resource.renderApp(<PostPage id="1" />);

    expect(resource.queryClient.isFetching()).toBe(2);
    expect(utils.container).toHaveTextContent('loading post');
    await vi.waitFor(() => {
      expect(utils.container).toHaveTextContent('Post 1 v1');
      expect(utils.container).toHaveTextContent('comments:0,1');
    });
    expect(resource.calls).toHaveBeenCalledTimes(2);
  });

  test('handles read one after another in one component still load in parallel', async () => {
    await using resource = ctx();
    function Both(props: {
      a: inferQueryHandle<TRPC['post']['byId']>;
      b: inferQueryHandle<TRPC['post']['byId']>;
    }) {
      const trpc = resource.useTRPC();
      const a = useSuspenseQuery(fromHandle(trpc, props.a));
      const b = useSuspenseQuery(fromHandle(trpc, props.b));
      return <p>{`${a.data.title} ${b.data.title}`}</p>;
    }
    function Page() {
      const trpc = resource.useTRPC();
      const a = waterfallHandle(trpc.post.byId, { id: 'a' });
      const b = waterfallHandle(trpc.post.byId, { id: 'b' });
      return (
        <React.Suspense fallback={<p>loading</p>}>
          <Both a={a} b={b} />
        </React.Suspense>
      );
    }
    const utils = resource.renderApp(<Page />);
    // `Both` suspends on `a`, but `b` started with the page
    expect(resource.queryClient.isFetching()).toBe(2);
    await vi.waitFor(() => {
      expect(utils.container).toHaveTextContent('Post a');
      expect(utils.container).toHaveTextContent('Post b');
    });
    expect(resource.calls).toHaveBeenCalledTimes(2);
  });

  test('re-renders with the same input start nothing', async () => {
    await using resource = ctx();
    const { PostPage } = setup(resource);
    // The test client's staleTime is 0, so starting again would refetch
    const utils = resource.renderApp(<PostPage id="1" />);
    await vi.waitFor(() =>
      expect(utils.container).toHaveTextContent('Post 1 v1'),
    );

    resource.rerenderApp(utils, <PostPage id="1" flipKeys />);
    resource.rerenderApp(utils, <PostPage id="1" />);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(resource.calls).toHaveBeenCalledTimes(2);

    resource.rerenderApp(utils, <PostPage id="2" />);
    await vi.waitFor(() =>
      expect(utils.container).toHaveTextContent('Post 2 v2'),
    );
    expect(resource.calls).toHaveBeenCalledTimes(4);

    // Back to a stale input: the reader shows the cached post and refetches it.
    // Only post 1 is aged: post 2's readers may still be subscribing, and
    // would refetch stale data.
    for (const query of resource.queryClient.getQueryCache().getAll()) {
      const input = (query.queryKey[1] as { input?: Record<string, unknown> })
        ?.input;
      if (input?.['id'] === '1' || input?.['postId'] === '1') {
        query.setState({ dataUpdatedAt: query.state.dataUpdatedAt - 2_000 });
      }
    }
    resource.rerenderApp(utils, <PostPage id="1" />);
    expect(utils.container).toHaveTextContent('Post 1 v1');
    await vi.waitFor(() =>
      expect(utils.container).toHaveTextContent('Post 1 v3'),
    );
    expect(resource.calls).toHaveBeenCalledTimes(6);
  });

  test('a new mount shows cached data and refetches it if stale', async () => {
    await using resource = ctx();
    const { PostPage } = setup(resource);
    const first = resource.renderApp(<PostPage id="1" />);
    await vi.waitFor(() =>
      expect(first.container).toHaveTextContent('Post 1 v1'),
    );
    first.unmount();

    ageCachedData();
    const second = resource.renderApp(<PostPage id="1" />);
    expect(second.container).toHaveTextContent('Post 1 v1');
    await vi.waitFor(() =>
      expect(second.container).toHaveTextContent('Post 1 v2'),
    );
  });

  test("a page that suspends on its own handle doesn't refetch when it retries", async () => {
    await using resource = ctx();
    function Page() {
      const trpc = resource.useTRPC();
      const post = waterfallHandle(trpc.post.byId, { id: '1' });
      const postQuery = useSuspenseQuery(fromHandle(trpc, post));
      return <p>{`${postQuery.data.title} v${postQuery.data.version}`}</p>;
    }
    const utils = resource.renderApp(
      <React.Suspense fallback={<p>loading</p>}>
        <Page />
      </React.Suspense>,
    );
    await vi.waitFor(() =>
      expect(utils.container).toHaveTextContent('Post 1 v1'),
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(resource.calls).toHaveBeenCalledTimes(1);
  });

  test("a failed query isn't restarted by the render that throws it", async () => {
    await using resource = ctx();
    function Page() {
      const trpc = resource.useTRPC();
      const post = waterfallHandle(trpc.post.byId, { id: 'missing' });
      const postQuery = useSuspenseQuery(
        fromHandle(trpc, post, { retry: false }),
      );
      return <p>{postQuery.data.title}</p>;
    }
    class Boundary extends React.Component<{ children: React.ReactNode }> {
      override state = { error: false };
      static getDerivedStateFromError() {
        return { error: true };
      }
      override render() {
        return this.state.error ? 'errored' : this.props.children;
      }
    }
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const utils = resource.renderApp(
      <Boundary>
        <React.Suspense fallback={<p>loading</p>}>
          <Page />
        </React.Suspense>
      </Boundary>,
    );
    await vi.waitFor(() =>
      expect(utils.container).toHaveTextContent('errored'),
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(resource.calls).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  test("switching input reads the loader's query first, then the new one", async () => {
    await using resource = ctx();
    const [{ comments }] = await loadHandles(resource.loaderProxyClient, {
      comments: fetchInfiniteEntry(resource.loaderProxyClient.post.comments, {
        postId: '1',
        limit: 2,
      }),
    });
    expect(resource.calls).toHaveBeenCalledTimes(1);

    let setLimit: (limit: number) => void = () => undefined;
    function Comments(props: {
      comments: inferInfiniteQueryHandle<TRPC['post']['comments']>;
    }) {
      const trpc = resource.useTRPC();
      const [limit, _setLimit] = React.useState(props.comments.input.limit);
      React.useEffect(() => {
        setLimit = _setLimit;
      }, []);
      const handle = waterfallInfiniteHandle(
        trpc.post.comments,
        props.comments,
        (input) => ({ ...input, limit }),
      );
      const commentsQuery = useSuspenseInfiniteQuery(
        fromHandle(trpc, handle, {
          getNextPageParam: (last) => last.nextCursor,
        }),
      );
      return (
        <p>{`limit:${handle.input.limit} comments:${commentsQuery.data.pages.flatMap((p) => p.items).join(',')}`}</p>
      );
    }
    const utils = resource.renderApp(
      <React.Suspense fallback={<p>loading</p>}>
        <Comments comments={comments} />
      </React.Suspense>,
    );
    expect(utils.container).toHaveTextContent('limit:2 comments:0,1');
    expect(resource.calls).toHaveBeenCalledTimes(1);

    React.act(() => setLimit(3));
    await vi.waitFor(() =>
      expect(utils.container).toHaveTextContent('limit:3 comments:0,1'),
    );
    expect(resource.calls).toHaveBeenCalledTimes(2);
    expect(resource.calls).toHaveBeenLastCalledWith('post.comments', {
      postId: '1',
      limit: 3,
    });
  });
});
