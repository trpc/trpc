import { createAppRouter } from './__testHelpers';
import { dehydrate, useQueryClient } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import React, { useEffect, useState } from 'react';

let factory: ReturnType<typeof createAppRouter>;
beforeEach(() => {
  factory = createAppRouter();
});
afterEach(async () => {
  await factory.close();
});

describe('prefetchQuery()', () => {
  test('with input', async () => {
    const { trpc, App } = factory;
    function MyComponent() {
      const [state, setState] = useState<string>('nope');
      const utils = trpc.useUtils();
      const queryClient = useQueryClient();

      useEffect(() => {
        async function prefetch() {
          await utils.postById.prefetch('1');
          setState(JSON.stringify(dehydrate(queryClient)));
        }
        prefetch();
      }, [queryClient, utils]);

      return <>{JSON.stringify(state)}</>;
    }

    const utils = render(
      <App>
        <MyComponent />
      </App>,
    );
    await waitFor(() => {
      expect(utils.container).toHaveTextContent('first post');
    });
  });
});

describe('prefetchInfiniteQuery()', () => {
  test('with one page', async () => {
    const { trpc, App } = factory;
    function MyComponent() {
      const [state, setState] = useState<string>('nope');
      const [refreshState, setRefreshState] = useState(false);
      const utils = trpc.useUtils();
      const queryClient = useQueryClient();

      useEffect(() => {
        async function prefetch() {
          await utils.paginatedPosts.prefetchInfinite(
            { limit: 1 },
            {
              getNextPageParam: (lastPage) => lastPage.nextCursor,
              initialCursor: 0,
              pages: 1,
            },
          );
          setState(JSON.stringify(dehydrate(queryClient)));
        }
        prefetch();
      }, [queryClient, utils]);

      return (
        <>
          <button
            data-testid="setState"
            onClick={() => {
              setState(JSON.stringify(dehydrate(queryClient)));
            }}
          >
            Refresh
          </button>
          <pre data-testid="state">{state}</pre>
        </>
      );
    }

    const utils = render(
      <App>
        <MyComponent />
      </App>,
    );
    await waitFor(() => {
      expect(utils.container).toHaveTextContent('first post');
      expect(utils.container).not.toHaveTextContent('second post');
    });
  });

  test('with two pages', async () => {
    const { trpc, App } = factory;
    function MyComponent() {
      const [state, setState] = useState<string>('nope');
      const [refreshState, setRefreshState] = useState(false);
      const utils = trpc.useUtils();
      const queryClient = useQueryClient();

      useEffect(() => {
        async function prefetch() {
          await utils.paginatedPosts.prefetchInfinite(
            { limit: 1 },
            {
              getNextPageParam: (lastPage) => lastPage.nextCursor,
              initialCursor: 0,
              pages: 2,
            },
          );
          setState(JSON.stringify(dehydrate(queryClient)));
        }

        prefetch();
      }, [queryClient, utils]);

      return (
        <>
          <button
            data-testid="setState"
            onClick={() => {
              setState(JSON.stringify(dehydrate(queryClient)));
            }}
          >
            Refresh
          </button>
          <pre data-testid="state">{state}</pre>
        </>
      );
    }

    const utils = render(
      <App>
        <MyComponent />
      </App>,
    );
    await waitFor(() => {
      expect(utils.container).toHaveTextContent('first post');
      expect(utils.container).toHaveTextContent('second post');
    });
  });
});

describe('usePrefetchQuery()', () => {
  test('with input', async () => {
    const { trpc, App } = factory;
    function MyComponent() {
      const [state, setState] = useState<string>('nope');
      const [refreshState, setRefreshState] = useState(false);
      const utils = trpc.useUtils();
      const queryClient = useQueryClient();

      useEffect(() => {
        const unsub = queryClient.getQueryCache().subscribe(() => {
          setRefreshState(true);
        });

        return () => {
          unsub();
        };
      }, [queryClient]);

      useEffect(() => {
        if (refreshState) {
          setState(JSON.stringify(dehydrate(queryClient)));
          setRefreshState(false);
        }
      }, [refreshState, queryClient]);

      trpc.postById.usePrefetchQuery('1');

      return <>{JSON.stringify(state)}</>;
    }

    const utils = render(
      <App>
        <MyComponent />
      </App>,
    );
    await waitFor(() => {
      expect(utils.container).toHaveTextContent('first post');
    });
  });
});

describe('usePrefetchInfiniteQuery()', () => {
  test('with one page', async () => {
    const { trpc, App } = factory;
    function MyComponent() {
      const [state, setState] = useState<string>('nope');
      const [refreshState, setRefreshState] = useState(false);
      const utils = trpc.useUtils();
      const queryClient = useQueryClient();

      useEffect(() => {
        const unsub = queryClient.getQueryCache().subscribe(() => {
          setRefreshState(true);
        });

        return () => {
          unsub();
        };
      }, [queryClient]);

      useEffect(() => {
        if (refreshState) {
          setState(JSON.stringify(dehydrate(queryClient)));
          setRefreshState(false);
        }
      }, [refreshState, queryClient]);

      trpc.paginatedPosts.usePrefetchInfiniteQuery(
        { limit: 1 },
        {
          getNextPageParam: (lastPage) => lastPage.nextCursor,
          initialCursor: 0,
          pages: 1,
        },
      );

      return <>{JSON.stringify(state)}</>;
    }

    const utils = render(
      <App>
        <MyComponent />
      </App>,
    );
    await waitFor(() => {
      expect(utils.container).toHaveTextContent('first post');
      expect(utils.container).not.toHaveTextContent('second post');
    });
  });

  test('with two pages', async () => {
    const { trpc, App } = factory;
    function MyComponent() {
      const [state, setState] = useState<string>('nope');
      const [refreshState, setRefreshState] = useState(false);
      const utils = trpc.useUtils();
      const queryClient = useQueryClient();

      useEffect(() => {
        const unsub = queryClient.getQueryCache().subscribe(() => {
          setRefreshState(true);
        });

        return () => {
          unsub();
        };
      }, [queryClient]);

      useEffect(() => {
        if (refreshState) {
          setState(JSON.stringify(dehydrate(queryClient)));
          setRefreshState(false);
        }
      }, [refreshState, queryClient]);

      trpc.paginatedPosts.usePrefetchInfiniteQuery(
        { limit: 1 },
        {
          getNextPageParam: (lastPage) => lastPage.nextCursor,
          initialCursor: 0,
          pages: 2,
        },
      );

      return <>{JSON.stringify(state)}</>;
    }

    const utils = render(
      <App>
        <MyComponent />
      </App>,
    );
    await waitFor(() => {
      expect(utils.container).toHaveTextContent('first post');
      expect(utils.container).toHaveTextContent('second post');
    });
  });
});
