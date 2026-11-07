import { testReactResource } from '../../test/__helpers';
import {
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { initTRPC } from '@trpc/server';
import * as React from 'react';
import { describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { ensureEntry, fetchInfiniteEntry, loadHandles } from '.';
import type { inferInfiniteQueryHandle, inferQueryHandle } from '.';
import type { TRPCOptionsProxy } from '..';

const ctx = () => {
  const t = initTRPC.create();
  const calls = vi.fn();
  const appRouter = t.router({
    post: t.router({
      search: t.procedure
        .input(z.object({ term: z.string(), limit: z.number() }))
        .query((opts) => {
          calls('post.search', opts.input);
          return `${opts.input.term}:${opts.input.limit}`;
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
  };
};

type AppRouter = ReturnType<typeof ctx>['appRouter'];
type TRPC = TRPCOptionsProxy<AppRouter>;

describe("a component that changes a handle's input with queryOptions", () => {
  test("reads the loader's query while the input matches, then the new one", async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyClient;
    const [{ results }] = await loadHandles(trpc, {
      results: ensureEntry(trpc.post.search, { term: 'a', limit: 2 }),
    });
    expect(resource.calls).toHaveBeenCalledTimes(1);

    let setTerm: (term: string) => void = () => undefined;
    function Search(props: {
      results: inferQueryHandle<TRPC['post']['search']>;
    }) {
      const t = resource.useTRPC();
      const [term, _setTerm] = React.useState(props.results.input.term);
      React.useEffect(() => {
        setTerm = _setTerm;
      }, []);
      const query = useSuspenseQuery(
        t.post.search.queryOptions({ ...props.results.input, term }),
      );
      return <p>{`results:${query.data}`}</p>;
    }
    const utils = resource.renderApp(
      <React.Suspense fallback={<p>loading</p>}>
        <Search results={results} />
      </React.Suspense>,
    );
    expect(utils.container).toHaveTextContent('results:a:2');
    expect(resource.calls).toHaveBeenCalledTimes(1);

    React.act(() => setTerm('b'));
    await vi.waitFor(() =>
      expect(utils.container).toHaveTextContent('results:b:2'),
    );
    expect(resource.calls).toHaveBeenCalledTimes(2);
  });

  test('works for infinite handles with infiniteQueryOptions', async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyClient;
    const [{ comments }] = await loadHandles(trpc, {
      comments: fetchInfiniteEntry(trpc.post.comments, {
        postId: '1',
        limit: 2,
      }),
    });
    expect(resource.calls).toHaveBeenCalledTimes(1);

    let setLimit: (limit: number) => void = () => undefined;
    function Comments(props: {
      comments: inferInfiniteQueryHandle<TRPC['post']['comments']>;
    }) {
      const t = resource.useTRPC();
      const [limit, _setLimit] = React.useState(props.comments.input.limit);
      React.useEffect(() => {
        setLimit = _setLimit;
      }, []);
      const commentsQuery = useSuspenseInfiniteQuery(
        t.post.comments.infiniteQueryOptions(
          { ...props.comments.input, limit },
          { getNextPageParam: (last) => last.nextCursor },
        ),
      );
      return (
        <p>{`limit:${limit} comments:${commentsQuery.data.pages.flatMap((p) => p.items).join(',')}`}</p>
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
