/* eslint-disable @typescript-eslint/ban-ts-comment */
import { createQueryClient } from '../../__queryClient';
import { createLegacyAppRouter } from './__testHelpers';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { expectTypeOf } from 'expect-type';
import React, { useEffect, useState } from 'react';

let factory: ReturnType<typeof createLegacyAppRouter>;
beforeEach(() => {
  factory = createLegacyAppRouter();
});
afterEach(async () => {
  await factory.close();
});

describe('useMutation()', () => {
  test('call procedure with no input with null/undefined', async () => {
    const { trpc, client } = factory;

    const results: unknown[] = [];
    function MyComponent() {
      const mutation = trpc.useMutation('PING');
      const [finished, setFinished] = useState(false);

      useEffect(() => {
        (async () => {
          await new Promise((resolve) =>
            mutation.mutate(undefined, {
              onSettled: resolve,
            }),
          );
          await new Promise((resolve) =>
            mutation.mutate(undefined, {
              onSettled: resolve,
            }),
          );

          // @ts-expect-error
          await mutation.mutateAsync(null);

          await mutation.mutateAsync(undefined);
          setFinished(true);
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      useEffect(() => {
        results.push(mutation.data);
      }, [mutation.data]);

      return (
        <pre>
          {JSON.stringify(mutation.data ?? {}, null, 4)}
          {finished && '__IS_FINISHED__'}
        </pre>
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
      expect(utils.container).toHaveTextContent('__IS_FINISHED__');
    });

    // expect(results).toMatchInlineSnapshot();
  });
  test('nullish input called with no input', async () => {
    const { trpc, client } = factory;

    function MyComponent() {
      const allPostsQuery = trpc.useQuery(['allPosts']);
      const deletePostsMutation = trpc.useMutation('deletePosts');

      useEffect(() => {
        allPostsQuery.refetch().then(async (allPosts) => {
          expect(allPosts.data).toHaveLength(2);
          await deletePostsMutation.mutateAsync();
          const newAllPost = await allPostsQuery.refetch();
          expect(newAllPost.data).toHaveLength(0);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      return <pre>{JSON.stringify(allPostsQuery.data ?? {}, null, 4)}</pre>;
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

    await waitFor(() => {
      expect(utils.container).toHaveTextContent('[]');
    });
  });

  test('useMutation([path]) tuple', async () => {
    const { trpc, client } = factory;

    function MyComponent() {
      const allPostsQuery = trpc.useQuery(['allPosts']);
      const deletePostsMutation = trpc.useMutation(['deletePosts']);

      useEffect(() => {
        allPostsQuery.refetch().then(async (allPosts) => {
          expect(allPosts.data).toHaveLength(2);
          await deletePostsMutation.mutateAsync();
          const newAllPost = await allPostsQuery.refetch();
          expect(newAllPost.data).toHaveLength(0);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      return <pre>{JSON.stringify(allPostsQuery.data ?? {}, null, 4)}</pre>;
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

    await waitFor(() => {
      expect(utils.container).toHaveTextContent('[]');
    });
  });

  test('nullish input called with input', async () => {
    const { trpc, client } = factory;

    function MyComponent() {
      const allPostsQuery = trpc.useQuery(['allPosts']);
      const deletePostsMutation = trpc.useMutation('deletePosts');

      useEffect(() => {
        allPostsQuery.refetch().then(async (allPosts) => {
          expect(allPosts.data).toHaveLength(2);
          await deletePostsMutation.mutateAsync(['1']);
          const newAllPost = await allPostsQuery.refetch();
          expect(newAllPost.data).toHaveLength(1);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      return <pre>{JSON.stringify(allPostsQuery.data ?? {}, null, 4)}</pre>;
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
      expect(utils.container).toHaveTextContent('second post');
    });

    await waitFor(() => {
      expect(utils.container).not.toHaveTextContent('first post');
      expect(utils.container).toHaveTextContent('second post');
    });
  });

  test('useMutation with context', async () => {
    const { trpc, App, linkSpy } = factory;

    function MyComponent() {
      const deletePostsMutation = trpc.useMutation(['deletePosts'], {
        trpc: {
          context: { test: '1' },
        },
      });

      useEffect(() => {
        deletePostsMutation.mutate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      return <pre>{deletePostsMutation.isSuccess && '___FINISHED___'}</pre>;
    }

    const utils = render(
      <App>
        <MyComponent />
      </App>,
    );
    await waitFor(() => {
      expect(utils.container).toHaveTextContent('___FINISHED___');
    });

    expect(linkSpy.up).toHaveBeenCalledTimes(1);
    expect(linkSpy.up.mock.calls[0]![0]!.context).toMatchObject({
      test: '1',
    });
  });

  test('useMutation with mutation context', async () => {
    const { trpc, client } = factory;

    function MyComponent() {
      trpc.useMutation(['deletePosts'], {
        onMutate: () => 'foo' as const,
        onSuccess: (_data, _variables, context) => {
          expectTypeOf(context).toMatchTypeOf<'foo' | undefined>();
        },
        onError: (_error, _variables, context) => {
          expectTypeOf(context).toMatchTypeOf<'foo' | undefined>();
        },
        onSettled: (_data, _error, _variables, context) => {
          expectTypeOf(context).toMatchTypeOf<'foo' | undefined>();
        },
      });

      return null;
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

    render(<App />);
  });
});
