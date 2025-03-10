import { createQueryClient } from './__queryClient';
import { createAppRouter } from './__testHelpers';
import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getUntypedClient } from '@trpc/client';
import type { TRPCQueryKey } from '@trpc/react-query/internals/getQueryKey';
import React, { useState } from 'react';

let factory: ReturnType<typeof createAppRouter>;
beforeEach(() => {
  factory = createAppRouter();
});
afterEach(async () => {
  await factory.close();
});

describe('invalidateQueries()', () => {
  test('queryClient.invalidateQueries()', async () => {
    const { trpc, resolvers, client } = factory;
    function MyComponent() {
      const allPostsQuery = trpc.allPosts.useQuery(undefined, {
        staleTime: Infinity,
      });
      const postByIdQuery = trpc.postById.useQuery('1', {
        staleTime: Infinity,
      });
      const queryClient = useQueryClient();

      return (
        <>
          <pre>
            allPostsQuery:{allPostsQuery.status} allPostsQuery:
            {allPostsQuery.isStale ? 'stale' : 'not-stale'}{' '}
          </pre>
          <pre>
            postByIdQuery:{postByIdQuery.status} postByIdQuery:
            {postByIdQuery.isStale ? 'stale' : 'not-stale'}
          </pre>
          <button
            data-testid="refetch"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: [['allPosts']] });
              queryClient.invalidateQueries({ queryKey: [['postById']] });
            }}
          />
        </>
      );
    }
    function App() {
      const [queryClient] = useState(() => createQueryClient());
      return (
        <trpc.Provider {...{ queryClient, client: getUntypedClient(client) }}>
          <QueryClientProvider client={queryClient}>
            <MyComponent />
          </QueryClientProvider>
        </trpc.Provider>
      );
    }

    const utils = render(<App />);

    await waitFor(() => {
      expect(utils.container).toHaveTextContent('postByIdQuery:success');
      expect(utils.container).toHaveTextContent('allPostsQuery:success');

      expect(utils.container).toHaveTextContent('postByIdQuery:not-stale');
      expect(utils.container).toHaveTextContent('allPostsQuery:not-stale');
    });

    expect(resolvers.allPosts).toHaveBeenCalledTimes(1);
    expect(resolvers.postById).toHaveBeenCalledTimes(1);

    await userEvent.click(utils.getByTestId('refetch'));

    await waitFor(() => {
      expect(utils.container).toHaveTextContent('postByIdQuery:stale');
      expect(utils.container).toHaveTextContent('allPostsQuery:stale');
    });
    await waitFor(() => {
      expect(utils.container).toHaveTextContent('postByIdQuery:not-stale');
      expect(utils.container).toHaveTextContent('allPostsQuery:not-stale');
    });

    expect(resolvers.allPosts).toHaveBeenCalledTimes(2);
    expect(resolvers.postById).toHaveBeenCalledTimes(2);
  });

  test('invalidateQueries()', async () => {
    const { trpc, resolvers, App } = factory;
    function MyComponent() {
      const allPostsQuery = trpc.allPosts.useQuery(undefined, {
        staleTime: Infinity,
      });
      const postByIdQuery = trpc.postById.useQuery('1', {
        staleTime: Infinity,
      });
      const utils = trpc.useUtils();
      return (
        <>
          <pre>
            allPostsQuery:{allPostsQuery.status} allPostsQuery:
            {allPostsQuery.isStale ? 'stale' : 'not-stale'}{' '}
          </pre>
          <pre>
            postByIdQuery:{postByIdQuery.status} postByIdQuery:
            {postByIdQuery.isStale ? 'stale' : 'not-stale'}
          </pre>
          <button
            data-testid="refetch"
            onClick={() => {
              utils.allPosts.invalidate();
              utils.postById.invalidate('1');
            }}
          />
        </>
      );
    }

    const utils = render(
      <App>
        <MyComponent />
      </App>,
    );

    await waitFor(() => {
      expect(utils.container).toHaveTextContent('postByIdQuery:success');
      expect(utils.container).toHaveTextContent('allPostsQuery:success');

      expect(utils.container).toHaveTextContent('postByIdQuery:not-stale');
      expect(utils.container).toHaveTextContent('allPostsQuery:not-stale');
    });

    expect(resolvers.allPosts).toHaveBeenCalledTimes(1);
    expect(resolvers.postById).toHaveBeenCalledTimes(1);

    await userEvent.click(utils.getByTestId('refetch'));

    await waitFor(() => {
      expect(utils.container).toHaveTextContent('postByIdQuery:stale');
      expect(utils.container).toHaveTextContent('allPostsQuery:stale');
    });
    await waitFor(() => {
      expect(utils.container).toHaveTextContent('postByIdQuery:not-stale');
      expect(utils.container).toHaveTextContent('allPostsQuery:not-stale');
    });

    expect(resolvers.allPosts).toHaveBeenCalledTimes(2);
    expect(resolvers.postById).toHaveBeenCalledTimes(2);
  });

  test('test invalidateQueries() with different args', async () => {
    // ref  https://github.com/trpc/trpc/issues/1383
    const { trpc, client, App } = factory;
    function MyComponent() {
      const countQuery = trpc.count.useQuery('test', {
        staleTime: Infinity,
      });
      const utils = trpc.useUtils();
      return (
        <>
          <pre>count:{countQuery.data}</pre>
          <button
            data-testid="invalidate-1-string"
            onClick={() => {
              utils.count.invalidate();
            }}
          />
          <button
            data-testid="invalidate-2-exact"
            onClick={() => {
              utils.count.invalidate('test');
            }}
          />
          <button
            data-testid="invalidate-3-all"
            onClick={() => {
              utils.invalidate();
            }}
          />{' '}
          <button
            data-testid="invalidate-4-predicate"
            onClick={() => {
              utils.invalidate(undefined, {
                predicate(opts) {
                  const { queryKey } = opts;
                  const [path, data] = queryKey as TRPCQueryKey;

                  return path[0] === 'count' && data?.input === 'test';
                },
              });
            }}
          />
        </>
      );
    }

    const utils = render(
      <App>
        <MyComponent />
      </App>,
    );

    await waitFor(() => {
      expect(utils.container).toHaveTextContent('count:test:0');
    });

    for (const [index, testId] of [
      'invalidate-1-string',
      'invalidate-2-exact',
      'invalidate-3-all',
      'invalidate-4-predicate',
    ].entries()) {
      // click button to invalidate
      await userEvent.click(utils.getByTestId(testId));

      await waitFor(async () => {
        // should become stale straight after the click
        expect(utils.container).toHaveTextContent(`count:test:${index + 1}`);
      });
    }
  });
  test('test invalidateQueries() with a partial input', async () => {
    const { trpc, client, App } = factory;
    function MyComponent() {
      const mockPostQuery1 = trpc.getMockPostByContent.useQuery(
        { id: 'id', content: { language: 'eng', type: 'fun' }, title: 'title' },
        {
          staleTime: Infinity,
        },
      );
      const mockPostQuery2 = trpc.getMockPostByContent.useQuery(
        {
          id: 'id',
          content: { language: 'eng', type: 'boring' },
          title: 'title',
        },
        {
          staleTime: Infinity,
        },
      );
      const mockPostQuery3 = trpc.getMockPostByContent.useQuery(
        {
          id: 'id',
          content: { language: 'de', type: 'fun' },
          title: 'title',
        },
        {
          staleTime: Infinity,
        },
      );
      const utils = trpc.useUtils();
      return (
        <>
          <pre>mockPostQuery1:{mockPostQuery1.status}</pre>
          <pre>
            mockPostQuery1:{mockPostQuery1.isStale ? 'stale' : 'not-stale'}
          </pre>
          <pre>mockPostQuery2:{mockPostQuery2.status}</pre>
          <pre>
            mockPostQuery2:{mockPostQuery2.isStale ? 'stale' : 'not-stale'}
          </pre>
          <pre>mockPostQuery3:{mockPostQuery3.status}</pre>
          <pre>
            mockPostQuery3:{mockPostQuery3.isStale ? 'stale' : 'not-stale'}
          </pre>
          <button
            data-testid="invalidate-with-partial-input"
            onClick={() => {
              utils.getMockPostByContent.invalidate({
                id: 'id',
                content: { language: 'eng' },
              });
            }}
          />
        </>
      );
    }

    const utils = render(
      <App>
        <MyComponent />
      </App>,
    );

    await waitFor(() => {
      expect(utils.container).toHaveTextContent('mockPostQuery1:success');
      expect(utils.container).toHaveTextContent('mockPostQuery2:success');
      expect(utils.container).toHaveTextContent('mockPostQuery3:success');
    });

    // click button to invalidate
    await userEvent.click(utils.getByTestId('invalidate-with-partial-input'));

    // 1 & 2 should become stale straight after the click by fuzzy matching the query, 3 should not
    await waitFor(() => {
      expect(utils.container).toHaveTextContent(`mockPostQuery1:stale`);
      expect(utils.container).toHaveTextContent(`mockPostQuery2:stale`);
      expect(utils.container).toHaveTextContent(`mockPostQuery3:not-stale`);
    });
  });
});

test('predicate type should be narrowed', () => {
  const { trpc } = factory;
  () => {
    const utils = trpc.useUtils();

    // simple
    utils.postById.invalidate('123', {
      predicate: (query) => {
        expectTypeOf(query.queryKey).toEqualTypeOf<
          [string[], { input?: string; type: 'query' }?]
        >();

        return true;
      },
    });

    // no cursor on infinite
    utils.paginatedPosts.invalidate(undefined, {
      predicate: (query) => {
        expectTypeOf(query.queryKey).toEqualTypeOf<
          [
            string[],
            {
              input?: { limit?: number | undefined } | undefined | void;
              type: 'infinite';
            }?,
          ]
        >();

        return true;
      },
    });

    // nested deep partial
    utils.getMockPostByContent.invalidate(undefined, {
      predicate: (query) => {
        expectTypeOf(query.queryKey).toEqualTypeOf<
          [
            string[],
            {
              input?: {
                id?: string;
                content?: { language?: string; type?: string };
                title?: string;
              };
              type: 'query';
            }?,
          ]
        >();

        return true;
      },
    });

    return null;
  };
});
