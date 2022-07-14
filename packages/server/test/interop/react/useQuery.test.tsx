/* eslint-disable @typescript-eslint/no-empty-function */
import { Post, createAppRouter } from './__testHelpers';
import '@testing-library/jest-dom';
import { render, waitFor } from '@testing-library/react';
import { expectTypeOf } from 'expect-type';
import React, { useState } from 'react';
import { QueryClient, QueryClientProvider, setLogger } from 'react-query';

setLogger({
  log() {},
  warn() {},
  error() {},
});

let factory: ReturnType<typeof createAppRouter>;
beforeEach(() => {
  factory = createAppRouter();
});
afterEach(() => {
  factory.close();
});

describe('useQuery()', () => {
  test('no input', async () => {
    const { trpc, client } = factory;
    function MyComponent() {
      const allPostsQuery = trpc.useQuery(['allPosts']);
      expectTypeOf(allPostsQuery.data!).toMatchTypeOf<Post[]>();

      return <pre>{JSON.stringify(allPostsQuery.data ?? 'n/a', null, 4)}</pre>;
    }
    function App() {
      const [queryClient] = useState(() => new QueryClient());
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
      expect(utils.container).toHaveTextContent('first post');
    });
  });

  test('with operation context', async () => {
    const { trpc, client, linkSpy } = factory;
    function MyComponent() {
      const allPostsQuery = trpc.useQuery(['allPosts'], {
        context: {
          test: '1',
        },
      });
      expectTypeOf(allPostsQuery.data!).toMatchTypeOf<Post[]>();

      return <pre>{JSON.stringify(allPostsQuery.data ?? 'n/a', null, 4)}</pre>;
    }
    function App() {
      const [queryClient] = useState(() => new QueryClient());
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
      expect(utils.container).toHaveTextContent('first post');
    });

    expect(linkSpy.up).toHaveBeenCalledTimes(1);
    expect(linkSpy.up.mock.calls[0]![0]!.context).toMatchObject({
      test: '1',
    });
  });

  test('with input', async () => {
    const { trpc, client } = factory;
    function MyComponent() {
      const allPostsQuery = trpc.useQuery(['paginatedPosts', { limit: 1 }]);

      return <pre>{JSON.stringify(allPostsQuery.data ?? 'n/a', null, 4)}</pre>;
    }
    function App() {
      const [queryClient] = useState(() => new QueryClient());
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
      expect(utils.container).toHaveTextContent('first post');
    });
    expect(utils.container).not.toHaveTextContent('second post');
  });

  test('select fn', async () => {
    const { trpc, client } = factory;
    function MyComponent() {
      const allPostsQuery = trpc.useQuery(['paginatedPosts', { limit: 1 }], {
        select: () => ({
          hello: 'world' as const,
        }),
      });
      expectTypeOf(allPostsQuery.data!).toMatchTypeOf<{ hello: 'world' }>();

      return <pre>{JSON.stringify(allPostsQuery.data ?? 'n/a', null, 4)}</pre>;
    }
    function App() {
      const [queryClient] = useState(() => new QueryClient());
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
      expect(utils.container).toHaveTextContent('"hello": "world"');
    });
  });
});
