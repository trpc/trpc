import { testReactResource } from './__helpers';
import {
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { initTRPC } from '@trpc/server';
import * as React from 'react';
import { describe, expect, expectTypeOf, test, vi } from 'vitest';
import { z } from 'zod';
import type {
  TRPCOptionsProxy,
  unstable_inferInfiniteQueryHandle,
  unstable_inferQueryHandle,
} from '../src';
import { usePrefetchHandles } from '../src';

const ctx = () => {
  const t = initTRPC.create();
  const calls = vi.fn();
  let version = 0;
  const appRouter = t.router({
    post: t.router({
      byId: t.procedure.input(z.object({ id: z.string() })).query((opts) => {
        calls('post.byId', opts.input);
        version++;
        return { id: opts.input.id, title: `Post ${opts.input.id}`, version };
      }),
      comments: t.procedure
        .input(z.object({ postId: z.string(), cursor: z.number().nullish() }))
        .query((opts) => {
          calls('post.comments', opts.input);
          const start = opts.input.cursor ?? 0;
          return { items: [start, start + 1], nextCursor: start + 2 };
        }),
    }),
  });
  return { ...testReactResource(appRouter), calls, appRouter };
};

type AppRouter = ReturnType<typeof ctx>['appRouter'];
type TRPC = TRPCOptionsProxy<AppRouter>;

function setup(resource: ReturnType<typeof ctx>) {
  function Post(props: {
    post: unstable_inferQueryHandle<TRPC['post']['byId']>;
  }) {
    const trpc = resource.useTRPC();
    const postQuery = useSuspenseQuery(trpc.unstable_fromHandle(props.post));
    return <p>{`${postQuery.data.title} v${postQuery.data.version}`}</p>;
  }
  function Comments(props: {
    comments: unstable_inferInfiniteQueryHandle<TRPC['post']['comments']>;
  }) {
    const trpc = resource.useTRPC();
    const commentsQuery = useSuspenseInfiniteQuery(
      trpc.unstable_fromHandle(props.comments, {
        getNextPageParam: (last) => last.nextCursor,
      }),
    );
    return (
      <p>{`comments:${commentsQuery.data.pages.flatMap((p) => p.items).join(',')}`}</p>
    );
  }
  function PostPage(props: { id: string }) {
    const trpc = resource.useTRPC();
    const handles = usePrefetchHandles(() => ({
      post: trpc.post.byId.unstable_prefetch({ id: props.id }),
      comments: trpc.post.comments.unstable_prefetchInfinite({
        postId: props.id,
      }),
    }));
    return (
      <>
        <React.Suspense fallback={<p>loading post</p>}>
          <Post post={handles.post} />
        </React.Suspense>
        <React.Suspense fallback={<p>loading comments</p>}>
          <Comments comments={handles.comments} />
        </React.Suspense>
      </>
    );
  }
  return { PostPage, Post };
}

describe('usePrefetchHandles', () => {
  test('returns the handles `start` builds', () => {
    const trpc = {} as TRPC;
    if (Math.random() < 2) return;
    const handles = usePrefetchHandles(() => ({
      post: trpc.post.byId.unstable_prefetch({ id: '1' }),
    }));
    expectTypeOf(handles.post).toEqualTypeOf<
      unstable_inferQueryHandle<TRPC['post']['byId']>
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

  test('starts each query once per mount and input', async () => {
    await using resource = ctx();
    const { PostPage } = setup(resource);
    // The test client's staleTime is 0, so starting again would refetch
    const utils = resource.renderApp(<PostPage id="1" />);
    await vi.waitFor(() =>
      expect(utils.container).toHaveTextContent('Post 1 v1'),
    );

    resource.rerenderApp(utils, <PostPage id="1" />);
    resource.rerenderApp(utils, <PostPage id="1" />);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(resource.calls).toHaveBeenCalledTimes(2);

    resource.rerenderApp(utils, <PostPage id="2" />);
    await vi.waitFor(() =>
      expect(utils.container).toHaveTextContent('Post 2 v2'),
    );
    expect(resource.calls).toHaveBeenCalledTimes(4);

    // Back to a stale input: it shows the cached post and refetches it
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
      const { post } = usePrefetchHandles(() => ({
        post: trpc.post.byId.unstable_prefetch({ id: '1' }),
      }));
      const postQuery = useSuspenseQuery(trpc.unstable_fromHandle(post));
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

  test('works with a proxy from createTRPCOptionsProxy', async () => {
    await using resource = ctx();
    const { Post } = setup(resource);
    const trpc = resource.optionsProxyClient;
    function Page() {
      const { post } = usePrefetchHandles(() => ({
        post: trpc.post.byId.unstable_prefetch({ id: '1' }),
      }));
      return (
        <React.Suspense fallback={<p>loading</p>}>
          <Post post={post} />
        </React.Suspense>
      );
    }
    const utils = resource.renderApp(<Page />);
    await vi.waitFor(() =>
      expect(utils.container).toHaveTextContent('Post 1 v1'),
    );
    resource.rerenderApp(utils, <Page />);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(resource.calls).toHaveBeenCalledTimes(1);
  });

  test("doesn't take the verbs that wait", async () => {
    await using resource = ctx();
    let error: unknown;
    function Page() {
      const trpc = resource.useTRPC();
      try {
        usePrefetchHandles(() => trpc.post.byId.unstable_ensure({ id: '1' }));
      } catch (cause) {
        error = cause;
      }
      return null;
    }
    resource.renderApp(<Page />);
    expect(error).toMatchInlineSnapshot(
      `[Error: \`post.byId.unstable_ensure()\` waits for its query, which a render can't. Inside \`usePrefetchHandles()\`, start queries with \`unstable_prefetch\` or \`unstable_prefetchInfinite\`, and wait where you read the handle, with \`useSuspenseQuery\`.]`,
    );
    expect(resource.calls).not.toHaveBeenCalled();
  });
});
