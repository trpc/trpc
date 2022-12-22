/* eslint-disable @typescript-eslint/no-empty-function */
import { createQueryClient } from '../../__queryClient';
import { createLegacyAppRouter } from './__testHelpers';
import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import '@testing-library/jest-dom';
import { render, waitFor } from '@testing-library/react';
import React, { useState } from 'react';

let factory: ReturnType<typeof createLegacyAppRouter>;
beforeEach(() => {
  factory = createLegacyAppRouter();
});
afterEach(() => {
  factory.close();
});

describe('invalidateQueries()', () => {
  test('queryClient.invalidateQueries()', async () => {
    const { trpc, resolvers, client } = factory;
    function MyComponent() {
      const allPostsQuery = trpc.useQuery(['allPosts'], {
        staleTime: Infinity,
      });
      const postByIdQuery = trpc.useQuery(['postById', '1'], {
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
              queryClient.invalidateQueries([['allPosts']]);
              queryClient.invalidateQueries([['postById']]);
            }}
          />
        </>
      );
    }
    function App() {
      const [queryClient] = useState(() => createQueryClient());
      return (
        <trpc.Provider {...{ queryClient, client }}>
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

    utils.getByTestId('refetch').click();

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
    const { trpc, resolvers, client } = factory;
    function MyComponent() {
      const allPostsQuery = trpc.useQuery(['allPosts'], {
        staleTime: Infinity,
      });
      const postByIdQuery = trpc.useQuery(['postById', '1'], {
        staleTime: Infinity,
      });
      const utils = trpc.useContext();
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
              utils.invalidateQueries(['allPosts']);
              utils.invalidateQueries(['postById', '1']);
            }}
          />
        </>
      );
    }
    function App() {
      const [queryClient] = useState(() => createQueryClient());
      return (
        <trpc.Provider {...{ queryClient, client }}>
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

    utils.getByTestId('refetch').click();

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

  test('test invalidateQueries() with different args - flaky', async () => {
    // ref  https://github.com/trpc/trpc/issues/1383
    const { trpc, client } = factory;
    function MyComponent() {
      const countQuery = trpc.useQuery(['count', 'test'], {
        staleTime: Infinity,
      });
      const utils = trpc.useContext();
      return (
        <>
          <pre>count:{countQuery.data}</pre>
          <button
            data-testid="invalidate-1-string"
            onClick={() => {
              utils.invalidateQueries('count');
            }}
          />
          <button
            data-testid="invalidate-2-tuple"
            onClick={() => {
              utils.invalidateQueries(['count']);
            }}
          />
          <button
            data-testid="invalidate-3-exact"
            onClick={() => {
              utils.invalidateQueries(['count', 'test']);
            }}
          />
          <button
            data-testid="invalidate-4-all"
            onClick={() => {
              utils.invalidateQueries();
            }}
          />{' '}
          <button
            data-testid="invalidate-5-predicate"
            onClick={() => {
              utils.invalidateQueries(undefined, {
                predicate(opts) {
                  const { queryKey } = opts;
                  const [path, rest] = queryKey;

                  return (
                    JSON.stringify(path) === '["count"]' &&
                    (rest as any)?.input === 'test'
                  );
                },
              });
            }}
          />
        </>
      );
    }
    function App() {
      const [queryClient] = useState(() => createQueryClient());
      return (
        <trpc.Provider {...{ queryClient, client }}>
          <QueryClientProvider client={queryClient}>
            <MyComponent />
          </QueryClientProvider>
        </trpc.Provider>
      );
    }

    const utils = render(<App />);

    await waitFor(() => {
      expect(utils.container).toHaveTextContent('count:test:1');
    });
    let count = 1;
    for (const testId of [
      'invalidate-1-string',
      'invalidate-2-tuple',
      'invalidate-3-exact',
      'invalidate-4-all',
      'invalidate-5-predicate',
    ]) {
      count++;
      // click button to invalidate
      utils.getByTestId(testId).click();

      // should become stale straight after the click
      await waitFor(() => {
        expect(utils.container).toHaveTextContent(`count:test:${count}`);
      });
    }
  });
});
