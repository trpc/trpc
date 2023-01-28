import { createQueryClient } from '../../__queryClient';
import { Post, createLegacyAppRouter } from './__testHelpers';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom';
import { render, waitFor } from '@testing-library/react';
import { expectTypeOf } from 'expect-type';
import React, { useState } from 'react';

let factory: ReturnType<typeof createLegacyAppRouter>;
beforeEach(() => {
  factory = createLegacyAppRouter();
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
      expect(utils.container).toHaveTextContent('first post');
    });
  });

  test('with operation context', async () => {
    const { trpc, client, linkSpy } = factory;
    function MyComponent() {
      const allPostsQuery = trpc.useQuery(['allPosts'], {
        trpc: {
          context: { test: '1' },
        },
      });
      expectTypeOf(allPostsQuery.data!).toMatchTypeOf<Post[]>();

      return <pre>{JSON.stringify(allPostsQuery.data ?? 'n/a', null, 4)}</pre>;
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
      expect(utils.container).toHaveTextContent('"hello": "world"');
    });
  });
});
