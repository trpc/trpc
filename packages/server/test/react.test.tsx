/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-ts-comment */

import { trpcServer } from './_packages';
import '@testing-library/jest-dom';
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { httpBatchLink } from '@trpc/client/links/httpBatchLink';
import { expectTypeOf } from 'expect-type';
import hash from 'hash-sum';
import React, { Fragment, useEffect, useState } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  setLogger,
  useQueryClient,
} from 'react-query';
import { dehydrate } from 'react-query/hydration';
import { z, ZodError } from 'zod';
import { withTRPC } from '../../next/src';
import { createReactQueryHooks, OutputWithCursor } from '../../react/src';
import { createSSGHelpers } from '../../react/ssg';
import { DefaultErrorShape } from '../src';
import { routerToServerAndClient } from './_testHelpers';
import {
  wsLink,
  createWSClient,
  TRPCWebSocketClient,
} from '../../client/src/links/wsLink';
import { splitLink } from '../../client/src/links/splitLink';
import { AppType } from 'next/dist/shared/lib/utils';
import { TRPCError } from '../src/TRPCError';

setLogger({
  log() {},
  warn() {},
  error() {},
});

type Context = {};
type Post = {
  id: string;
  title: string;
  createdAt: number;
};

function createAppRouter() {
  const db: {
    posts: Post[];
  } = {
    posts: [
      { id: '1', title: 'first post', createdAt: 0 },
      { id: '2', title: 'second post', createdAt: 1 },
    ],
  };
  const postLiveInputs: unknown[] = [];
  const createContext = jest.fn(() => ({}));
  const allPosts = jest.fn();
  const postById = jest.fn();
  let wsClient: TRPCWebSocketClient = null as any;
  const appRouter = trpcServer
    .router<Context>()
    .formatError(({ shape, error }) => {
      return {
        $test: 'formatted',
        zodError:
          error.originalError instanceof ZodError
            ? error.originalError.flatten()
            : null,
        ...shape,
      };
    })
    .query('allPosts', {
      resolve() {
        allPosts();
        return db.posts;
      },
    })
    .query('postById', {
      input: z.string(),
      resolve({ input }) {
        postById(input);
        const post = db.posts.find((p) => p.id === input);
        if (!post) {
          throw new TRPCError({ code: 'NOT_FOUND' });
        }
        return post;
      },
    })
    .query('paginatedPosts', {
      input: z.object({
        limit: z.number().min(1).max(100).nullish(),
        cursor: z.number().nullish(),
      }),
      resolve({ input }) {
        const items: typeof db.posts = [];
        const limit = input.limit ?? 50;
        const { cursor } = input;
        let nextCursor: typeof cursor = null;
        for (let index = 0; index < db.posts.length; index++) {
          const element = db.posts[index];
          if (cursor != null && element.createdAt < cursor) {
            continue;
          }
          items.push(element);
          if (items.length >= limit) {
            break;
          }
        }
        const last = items[items.length - 1];
        const nextIndex = db.posts.findIndex((item) => item === last) + 1;
        if (db.posts[nextIndex]) {
          nextCursor = db.posts[nextIndex].createdAt;
        }
        return {
          items,
          nextCursor,
        };
      },
    })
    .mutation('addPost', {
      input: z.object({
        title: z.string(),
      }),
      resolve({ input }) {
        db.posts.push({
          id: `${Math.random()}`,
          createdAt: Date.now(),
          title: input.title,
        });
      },
    })
    .mutation('deletePosts', {
      input: z.array(z.string()).nullish(),
      resolve({ input }) {
        if (input) {
          db.posts = db.posts.filter((p) => !input.includes(p.id));
        } else {
          db.posts = [];
        }
      },
    })
    .mutation('PING', {
      resolve() {
        return 'PONG' as const;
      },
    })
    .subscription('newPosts', {
      input: z.number(),
      resolve({ input }) {
        return trpcServer.subscriptionPullFactory<Post>({
          intervalMs: 1,
          pull(emit) {
            db.posts.filter((p) => p.createdAt > input).forEach(emit.data);
          },
        });
      },
    })
    .subscription('postsLive', {
      input: z.object({
        cursor: z.string().nullable(),
      }),
      resolve({ input }) {
        const { cursor } = input;
        postLiveInputs.push(input);

        return trpcServer.subscriptionPullFactory<OutputWithCursor<Post[]>>({
          intervalMs: 10,
          pull(emit) {
            const newCursor = hash(db.posts);
            if (newCursor !== cursor) {
              emit.data({ data: db.posts, cursor: newCursor });
            }
          },
        });
      },
    });

  const linkSpy = {
    up: jest.fn(),
    down: jest.fn(),
  };
  const { client, trpcClientOptions, close } = routerToServerAndClient(
    appRouter,
    {
      server: {
        createContext,
        batching: {
          enabled: true,
        },
      },
      client({ httpUrl, wssUrl }) {
        wsClient = createWSClient({
          url: wssUrl,
        });
        return {
          // links: [wsLink({ client: ws })],
          links: [
            () =>
              ({ op, next, prev }) => {
                linkSpy.up(op);
                next(op, (result) => {
                  linkSpy.down(result);
                  prev(result);
                });
              },
            splitLink({
              condition(op) {
                return op.type === 'subscription';
              },
              true: wsLink({
                client: wsClient,
              }),
              false: httpBatchLink({
                url: httpUrl,
              }),
            }),
          ],
        };
      },
    },
  );
  const queryClient = new QueryClient();
  const trpc = createReactQueryHooks<typeof appRouter>();

  return {
    appRouter,
    trpc,
    close,
    db,
    client,
    trpcClientOptions,
    postLiveInputs,
    resolvers: {
      postById,
      allPosts,
    },
    queryClient,
    createContext,
    linkSpy,
  };
}
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
    expect(linkSpy.down).toHaveBeenCalledTimes(1);
    expect(linkSpy.up.mock.calls[0][0].context).toMatchObject({
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
});

test('mutation on mount + subscribe for it', async () => {
  const { trpc, client } = factory;
  function MyComponent() {
    const [posts, setPosts] = useState<Post[]>([]);

    const addPosts = (newPosts?: Post[]) => {
      setPosts((nowPosts) => {
        const map: Record<Post['id'], Post> = {};
        for (const msg of nowPosts ?? []) {
          map[msg.id] = msg;
        }
        for (const msg of newPosts ?? []) {
          map[msg.id] = msg;
        }
        return Object.values(map);
      });
    };
    const input = posts.reduce(
      (num, post) => Math.max(num, post.createdAt),
      -1,
    );

    trpc.useSubscription(['newPosts', input], {
      onNext(post) {
        addPosts([post]);
      },
    });

    const mutation = trpc.useMutation('addPost');
    const mutate = mutation.mutate;
    useEffect(() => {
      if (posts.length === 2) {
        mutate({ title: 'third post' });
      }
    }, [posts.length, mutate]);

    return <pre>{JSON.stringify(posts, null, 4)}</pre>;
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
  await waitFor(() => {
    expect(utils.container).toHaveTextContent('third post');
  });
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
            mutation.mutate(null, {
              onSettled: resolve,
            }),
          );
          await new Promise((resolve) =>
            mutation.mutate(undefined, {
              onSettled: resolve,
            }),
          );

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
      expect(utils.container).toHaveTextContent('second post');
    });

    await waitFor(() => {
      expect(utils.container).not.toHaveTextContent('first post');
      expect(utils.container).toHaveTextContent('second post');
    });
  });
});

// test('useLiveQuery()', async () => {
//   const { trpc, db, postLiveInputs, client } = factory;
//   function MyComponent() {
//     const postsQuery = trpc.useLiveQuery(['postsLive', {}]);

//     return <pre>{JSON.stringify(postsQuery.data ?? null, null, 4)}</pre>;
//   }
//   function App() {
//     const [queryClient] = useState(() => new QueryClient());
//     return (
//       <trpc.Provider {...{ queryClient, client }}>
//         <QueryClientProvider client={queryClient}>
//           <MyComponent />
//         </QueryClientProvider>
//       </trpc.Provider>
//     );
//   }

//   const utils = render(<App />);
//   await waitFor(() => {
//     expect(utils.container).toHaveTextContent('first post');
//   });

//   for (let index = 0; index < 3; index++) {
//     const title = `a new post index:${index}`;
//     db.posts.push({
//       id: `r${index}`,
//       createdAt: 0,
//       title,
//     });

//     await waitFor(() => {
//       expect(utils.container).toHaveTextContent(title);
//     });
//   }

//   expect(utils.container.innerHTML).not.toContain('cursor');
//   expect(postLiveInputs).toMatchInlineSnapshot(`
//     Array [
//       Object {
//         "cursor": null,
//       },
//       Object {
//         "cursor": "03bee962",
//       },
//       Object {
//         "cursor": "712d2d40",
//       },
//       Object {
//         "cursor": "7c5d7196",
//       },
//     ]
//   `);
// });
test('dehydrate', async () => {
  const { db, appRouter } = factory;
  const ssg = createSSGHelpers({ router: appRouter, ctx: {} });

  await ssg.prefetchQuery('allPosts');
  await ssg.fetchQuery('postById', '1');

  const dehydrated = ssg.dehydrate().queries;
  expect(dehydrated).toHaveLength(2);

  const [cache, cache2] = dehydrated;
  expect(cache.queryHash).toMatchInlineSnapshot(
    `"[\\"allPosts\\",null,\\"TRPC_QUERY\\"]"`,
  );
  expect(cache.queryKey).toMatchInlineSnapshot(`
    Array [
      "allPosts",
      null,
      "TRPC_QUERY",
    ]
  `);
  expect(cache.state.data).toEqual(db.posts);
  expect(cache2.state.data).toMatchInlineSnapshot(`
    Object {
      "createdAt": 0,
      "id": "1",
      "title": "first post",
    }
  `);
});

test('prefetchQuery', async () => {
  const { trpc, client } = factory;
  function MyComponent() {
    const [state, setState] = useState<string>('nope');
    const utils = trpc.useContext();
    const queryClient = useQueryClient();

    useEffect(() => {
      async function prefetch() {
        await utils.prefetchQuery(['postById', '1']);
        setState(JSON.stringify(dehydrate(queryClient)));
      }
      prefetch();
    }, [queryClient, utils]);

    return <>{JSON.stringify(state)}</>;
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

test('useInfiniteQuery()', async () => {
  const { trpc, client } = factory;

  function MyComponent() {
    const q = trpc.useInfiniteQuery(
      [
        'paginatedPosts',
        {
          limit: 1,
        },
      ],
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      },
    );
    expectTypeOf(q.data?.pages[0].items).toMatchTypeOf<undefined | Post[]>();

    return q.status === 'loading' ? (
      <p>Loading...</p>
    ) : q.status === 'error' ? (
      <p>Error: {q.error.message}</p>
    ) : (
      <>
        {q.data?.pages.map((group, i) => (
          <Fragment key={i}>
            {group.items.map((msg) => (
              <Fragment key={msg.id}>
                <div>{msg.title}</div>
              </Fragment>
            ))}
          </Fragment>
        ))}
        <div>
          <button
            onClick={() => q.fetchNextPage()}
            disabled={!q.hasNextPage || q.isFetchingNextPage}
            data-testid="loadMore"
          >
            {q.isFetchingNextPage
              ? 'Loading more...'
              : q.hasNextPage
              ? 'Load More'
              : 'Nothing more to load'}
          </button>
        </div>
        <div>
          {q.isFetching && !q.isFetchingNextPage ? 'Fetching...' : null}
        </div>
      </>
    );
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
  await waitFor(() => {
    expect(utils.container).toHaveTextContent('first post');
    expect(utils.container).not.toHaveTextContent('second post');
    expect(utils.container).toHaveTextContent('Load More');
  });
  userEvent.click(utils.getByTestId('loadMore'));
  await waitFor(() => {
    expect(utils.container).toHaveTextContent('Loading more...');
  });
  await waitFor(() => {
    expect(utils.container).toHaveTextContent('first post');
    expect(utils.container).toHaveTextContent('second post');
    expect(utils.container).toHaveTextContent('Nothing more to load');
  });

  expect(utils.container).toMatchInlineSnapshot(`
    <div>
      <div>
        first post
      </div>
      <div>
        second post
      </div>
      <div>
        <button
          data-testid="loadMore"
          disabled=""
        >
          Nothing more to load
        </button>
      </div>
      <div />
    </div>
  `);
});

test('useInfiniteQuery and prefetchInfiniteQuery', async () => {
  const { trpc, client } = factory;

  function MyComponent() {
    const trpcContext = trpc.useContext();
    const q = trpc.useInfiniteQuery(
      [
        'paginatedPosts',
        {
          limit: 1,
        },
      ],
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      },
    );
    expectTypeOf(q.data?.pages[0].items).toMatchTypeOf<undefined | Post[]>();

    return q.status === 'loading' ? (
      <p>Loading...</p>
    ) : q.status === 'error' ? (
      <p>Error: {q.error.message}</p>
    ) : (
      <>
        {q.data?.pages.map((group, i) => (
          <Fragment key={i}>
            {group.items.map((msg) => (
              <Fragment key={msg.id}>
                <div>{msg.title}</div>
              </Fragment>
            ))}
          </Fragment>
        ))}
        <div>
          <button
            onClick={() => q.fetchNextPage()}
            disabled={!q.hasNextPage || q.isFetchingNextPage}
            data-testid="loadMore"
          >
            {q.isFetchingNextPage
              ? 'Loading more...'
              : q.hasNextPage
              ? 'Load More'
              : 'Nothing more to load'}
          </button>
        </div>
        <div>
          <button
            data-testid="prefetch"
            onClick={() =>
              trpcContext.prefetchInfiniteQuery([
                'paginatedPosts',
                { limit: 1 },
              ])
            }
          >
            Prefetch
          </button>
        </div>
        <div>
          {q.isFetching && !q.isFetchingNextPage ? 'Fetching...' : null}
        </div>
      </>
    );
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
  await waitFor(() => {
    expect(utils.container).toHaveTextContent('first post');
    expect(utils.container).not.toHaveTextContent('second post');
    expect(utils.container).toHaveTextContent('Load More');
  });
  userEvent.click(utils.getByTestId('loadMore'));
  await waitFor(() => {
    expect(utils.container).toHaveTextContent('Loading more...');
  });
  await waitFor(() => {
    expect(utils.container).toHaveTextContent('first post');
    expect(utils.container).toHaveTextContent('second post');
    expect(utils.container).toHaveTextContent('Nothing more to load');
  });

  expect(utils.container).toMatchInlineSnapshot(`
    <div>
      <div>
        first post
      </div>
      <div>
        second post
      </div>
      <div>
        <button
          data-testid="loadMore"
          disabled=""
        >
          Nothing more to load
        </button>
      </div>
      <div>
        <button
          data-testid="prefetch"
        >
          Prefetch
        </button>
      </div>
      <div />
    </div>
  `);

  userEvent.click(utils.getByTestId('prefetch'));
  await waitFor(() => {
    expect(utils.container).toHaveTextContent('Fetching...');
  });
  await waitFor(() => {
    expect(utils.container).not.toHaveTextContent('Fetching...');
  });

  // It should correctly fetch both pages
  expect(utils.container).toHaveTextContent('first post');
  expect(utils.container).toHaveTextContent('second post');
});

test('useInfiniteQuery and fetchInfiniteQuery', async () => {
  const { trpc, client } = factory;

  function MyComponent() {
    const trpcContext = trpc.useContext();
    const q = trpc.useInfiniteQuery(
      [
        'paginatedPosts',
        {
          limit: 1,
        },
      ],
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      },
    );
    expectTypeOf(q.data?.pages[0].items).toMatchTypeOf<undefined | Post[]>();

    return q.status === 'loading' ? (
      <p>Loading...</p>
    ) : q.status === 'error' ? (
      <p>Error: {q.error.message}</p>
    ) : (
      <>
        {q.data?.pages.map((group, i) => (
          <Fragment key={i}>
            {group.items.map((msg) => (
              <Fragment key={msg.id}>
                <div>{msg.title}</div>
              </Fragment>
            ))}
          </Fragment>
        ))}
        <div>
          <button
            onClick={() => q.fetchNextPage()}
            disabled={!q.hasNextPage || q.isFetchingNextPage}
            data-testid="loadMore"
          >
            {q.isFetchingNextPage
              ? 'Loading more...'
              : q.hasNextPage
              ? 'Load More'
              : 'Nothing more to load'}
          </button>
        </div>
        <div>
          <button
            data-testid="fetch"
            onClick={() =>
              trpcContext.fetchInfiniteQuery(['paginatedPosts', { limit: 1 }])
            }
          >
            Fetch
          </button>
        </div>
        <div>
          {q.isFetching && !q.isFetchingNextPage ? 'Fetching...' : null}
        </div>
      </>
    );
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
  await waitFor(() => {
    expect(utils.container).toHaveTextContent('first post');
    expect(utils.container).not.toHaveTextContent('second post');
    expect(utils.container).toHaveTextContent('Load More');
  });
  userEvent.click(utils.getByTestId('loadMore'));
  await waitFor(() => {
    expect(utils.container).toHaveTextContent('Loading more...');
  });
  await waitFor(() => {
    expect(utils.container).toHaveTextContent('first post');
    expect(utils.container).toHaveTextContent('second post');
    expect(utils.container).toHaveTextContent('Nothing more to load');
  });

  expect(utils.container).toMatchInlineSnapshot(`
    <div>
      <div>
        first post
      </div>
      <div>
        second post
      </div>
      <div>
        <button
          data-testid="loadMore"
          disabled=""
        >
          Nothing more to load
        </button>
      </div>
      <div>
        <button
          data-testid="fetch"
        >
          Fetch
        </button>
      </div>
      <div />
    </div>
  `);

  userEvent.click(utils.getByTestId('fetch'));
  await waitFor(() => {
    expect(utils.container).toHaveTextContent('Fetching...');
  });
  await waitFor(() => {
    expect(utils.container).not.toHaveTextContent('Fetching...');
  });

  // It should correctly fetch both pages
  expect(utils.container).toHaveTextContent('first post');
  expect(utils.container).toHaveTextContent('second post');
});

test('prefetchInfiniteQuery()', async () => {
  const { appRouter } = factory;
  const ssg = createSSGHelpers({ router: appRouter, ctx: {} });

  {
    await ssg.prefetchInfiniteQuery('paginatedPosts', { limit: 1 });
    const data = JSON.stringify(ssg.dehydrate());
    expect(data).toContain('first post');
    expect(data).not.toContain('second post');
  }
  {
    await ssg.fetchInfiniteQuery('paginatedPosts', { limit: 2 });
    const data = JSON.stringify(ssg.dehydrate());
    expect(data).toContain('first post');
    expect(data).toContain('second post');
  }
});

describe('invalidate queries', () => {
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
              queryClient.invalidateQueries(['allPosts']);
              queryClient.invalidateQueries(['postById']);
            }}
          />
        </>
      );
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

  test('invalidateQuery()', async () => {
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
              utils.invalidateQuery(['allPosts']);
              utils.invalidateQuery(['postById', '1']);
            }}
          />
        </>
      );
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
});

test('formatError() react types test', async () => {
  const { trpc, client } = factory;
  function MyComponent() {
    const mutation = trpc.useMutation('addPost');

    useEffect(() => {
      mutation.mutate({ title: 123 as any });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (mutation.error && mutation.error && mutation.error.shape) {
      expectTypeOf(mutation.error.shape).toMatchTypeOf<
        DefaultErrorShape & {
          $test: string;
        }
      >();
      expectTypeOf(mutation.error.shape).toMatchTypeOf<
        DefaultErrorShape & {
          $test: string;
        }
      >();
      return (
        <pre data-testid="err">
          {JSON.stringify(mutation.error.shape.zodError, null, 2)}
        </pre>
      );
    }
    return <></>;
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
    expect(utils.container).toHaveTextContent('fieldErrors');
    expect(utils.getByTestId('err').innerText).toMatchInlineSnapshot(
      `undefined`,
    );
  });
});

// const MockApp: React.FC<any> = () => {
//   return createElement('div');
// };

// const MockAppTree: React.FC<any> = () => {
//   return createElement('div');
// };

describe('withTRPC()', () => {
  test('useQuery', async () => {
    // @ts-ignore
    const { window } = global;

    // @ts-ignore
    delete global.window;
    const { trpc, trpcClientOptions } = factory;
    const App: AppType = () => {
      const query = trpc.useQuery(['allPosts']);
      return <>{JSON.stringify(query.data)}</>;
    };

    const Wrapped = withTRPC({
      config: () => trpcClientOptions,
      ssr: true,
    })(App);

    const props = await Wrapped.getInitialProps!({
      AppTree: Wrapped,
      Component: <div />,
    } as any);

    // @ts-ignore
    global.window = window;

    const utils = render(<Wrapped {...props} />);
    expect(utils.container).toHaveTextContent('first post');
  });

  test('useInfiniteQuery', async () => {
    const { window } = global;

    // @ts-ignore
    delete global.window;
    const { trpc, trpcClientOptions } = factory;
    const App: AppType = () => {
      const query = trpc.useInfiniteQuery(
        [
          'paginatedPosts',
          {
            limit: 10,
          },
        ],
        {
          getNextPageParam: (lastPage) => lastPage.nextCursor,
        },
      );
      return <>{JSON.stringify(query.data || query.error)}</>;
    };

    const Wrapped = withTRPC({
      config: () => trpcClientOptions,
      ssr: true,
    })(App);

    const props = await Wrapped.getInitialProps!({
      AppTree: Wrapped,
      Component: <div />,
    } as any);

    global.window = window;

    const utils = render(<Wrapped {...props} />);
    expect(utils.container).toHaveTextContent('first post');
  });

  test('browser render', async () => {
    const { trpc, trpcClientOptions } = factory;
    const App: AppType = () => {
      const query = trpc.useQuery(['allPosts']);
      return <>{JSON.stringify(query.data)}</>;
    };

    const Wrapped = withTRPC({
      config: () => trpcClientOptions,
      ssr: true,
    })(App);

    const props = await Wrapped.getInitialProps!({
      AppTree: Wrapped,
      Component: <div />,
    } as any);

    const utils = render(<Wrapped {...props} />);

    await waitFor(() => {
      expect(utils.container).toHaveTextContent('first post');
    });
  });

  describe('`ssr: false` on query', () => {
    test('useQuery()', async () => {
      const { window } = global;

      // @ts-ignore
      delete global.window;
      const { trpc, trpcClientOptions } = factory;
      const App: AppType = () => {
        const query = trpc.useQuery(['allPosts'], { ssr: false });
        return <>{JSON.stringify(query.data)}</>;
      };

      const Wrapped = withTRPC({
        config: () => trpcClientOptions,
        ssr: true,
      })(App);

      const props = await Wrapped.getInitialProps!({
        AppTree: Wrapped,
        Component: <div />,
      } as any);

      global.window = window;

      const utils = render(<Wrapped {...props} />);
      expect(utils.container).not.toHaveTextContent('first post');

      // should eventually be fetched
      await waitFor(() => {
        expect(utils.container).toHaveTextContent('first post');
      });
    });

    test('useInfiniteQuery', async () => {
      const { window } = global;

      // @ts-ignore
      delete global.window;
      const { trpc, trpcClientOptions } = factory;
      const App: AppType = () => {
        const query = trpc.useInfiniteQuery(
          [
            'paginatedPosts',
            {
              limit: 10,
            },
          ],
          {
            getNextPageParam: (lastPage) => lastPage.nextCursor,
            ssr: false,
          },
        );
        return <>{JSON.stringify(query.data || query.error)}</>;
      };

      const Wrapped = withTRPC({
        config: () => trpcClientOptions,
        ssr: true,
      })(App);

      const props = await Wrapped.getInitialProps!({
        AppTree: Wrapped,
        Component: <div />,
      } as any);

      global.window = window;

      const utils = render(<Wrapped {...props} />);
      expect(utils.container).not.toHaveTextContent('first post');

      // should eventually be fetched
      await waitFor(() => {
        expect(utils.container).toHaveTextContent('first post');
      });
    });
  });

  test('useQuery - ssr batching', async () => {
    // @ts-ignore
    const { window } = global;

    // @ts-ignore
    delete global.window;
    const { trpc, trpcClientOptions, createContext } = factory;
    const App: AppType = () => {
      const query1 = trpc.useQuery(['postById', '1']);
      const query2 = trpc.useQuery(['postById', '2']);
      return <>{JSON.stringify([query1.data, query2.data])}</>;
    };

    const Wrapped = withTRPC({
      config: () => trpcClientOptions,
      ssr: true,
    })(App);

    const props = await Wrapped.getInitialProps!({
      AppTree: Wrapped,
      Component: <div />,
    } as any);

    // @ts-ignore
    global.window = window;

    const utils = render(<Wrapped {...props} />);
    expect(utils.container).toHaveTextContent('first post');
    expect(utils.container).toHaveTextContent('second post');

    // confirm we've batched if createContext has only been called once
    expect(createContext).toHaveBeenCalledTimes(1);
  });

  describe('`enabled: false` on query during ssr', () => {
    describe('useQuery', () => {
      test('queryKey does not change', async () => {
        const { window } = global;

        // @ts-ignore
        delete global.window;
        const { trpc, trpcClientOptions } = factory;
        const App: AppType = () => {
          const query1 = trpc.useQuery(['postById', '1']);
          // query2 depends only on query1 status
          const query2 = trpc.useQuery(['postById', '2'], {
            enabled: query1.status === 'success',
          });
          return (
            <>
              <>{JSON.stringify(query1.data)}</>
              <>{JSON.stringify(query2.data)}</>
            </>
          );
        };

        const Wrapped = withTRPC({
          config: () => trpcClientOptions,
          ssr: true,
        })(App);

        const props = await Wrapped.getInitialProps!({
          AppTree: Wrapped,
          Component: <div />,
        } as any);

        global.window = window;

        const utils = render(<Wrapped {...props} />);

        // when queryKey does not change query2 only fetched in the browser
        expect(utils.container).toHaveTextContent('first post');
        expect(utils.container).not.toHaveTextContent('second post');

        await waitFor(() => {
          expect(utils.container).toHaveTextContent('first post');
          expect(utils.container).toHaveTextContent('second post');
        });
      });

      test('queryKey changes', async () => {
        const { window } = global;

        // @ts-ignore
        delete global.window;
        const { trpc, trpcClientOptions } = factory;
        const App: AppType = () => {
          const query1 = trpc.useQuery(['postById', '1']);
          // query2 depends on data fetched by query1
          const query2 = trpc.useQuery(
            [
              'postById',
              // workaround of TS requiring a string param
              query1.data
                ? (parseInt(query1.data.id) + 1).toString()
                : 'definitely not a post id',
            ],
            {
              enabled: !!query1.data,
            },
          );
          return (
            <>
              <>{JSON.stringify(query1.data)}</>
              <>{JSON.stringify(query2.data)}</>
            </>
          );
        };

        const Wrapped = withTRPC({
          config: () => trpcClientOptions,
          ssr: true,
        })(App);

        const props = await Wrapped.getInitialProps!({
          AppTree: Wrapped,
          Component: <div />,
        } as any);

        global.window = window;

        const utils = render(<Wrapped {...props} />);

        // when queryKey changes both queries are fetched on the server
        expect(utils.container).toHaveTextContent('first post');
        expect(utils.container).toHaveTextContent('second post');

        await waitFor(() => {
          expect(utils.container).toHaveTextContent('first post');
          expect(utils.container).toHaveTextContent('second post');
        });
      });
    });

    describe('useInfiniteQuery', () => {
      test('queryKey does not change', async () => {
        const { window } = global;

        // @ts-ignore
        delete global.window;
        const { trpc, trpcClientOptions } = factory;
        const App: AppType = () => {
          const query1 = trpc.useInfiniteQuery(
            ['paginatedPosts', { limit: 1 }],
            {
              getNextPageParam: (lastPage) => lastPage.nextCursor,
            },
          );
          // query2 depends only on query1 status
          const query2 = trpc.useInfiniteQuery(
            ['paginatedPosts', { limit: 2 }],
            {
              getNextPageParam: (lastPage) => lastPage.nextCursor,
              enabled: query1.status === 'success',
            },
          );
          return (
            <>
              <>{JSON.stringify(query1.data)}</>
              <>{JSON.stringify(query2.data)}</>
            </>
          );
        };

        const Wrapped = withTRPC({
          config: () => trpcClientOptions,
          ssr: true,
        })(App);

        const props = await Wrapped.getInitialProps!({
          AppTree: Wrapped,
          Component: <div />,
        } as any);

        global.window = window;

        const utils = render(<Wrapped {...props} />);

        // when queryKey does not change query2 only fetched in the browser
        expect(utils.container).toHaveTextContent('first post');
        expect(utils.container).not.toHaveTextContent('second post');

        await waitFor(() => {
          expect(utils.container).toHaveTextContent('first post');
          expect(utils.container).toHaveTextContent('second post');
        });
      });

      test('queryKey changes', async () => {
        const { window } = global;

        // @ts-ignore
        delete global.window;
        const { trpc, trpcClientOptions } = factory;
        const App: AppType = () => {
          const query1 = trpc.useInfiniteQuery(
            ['paginatedPosts', { limit: 1 }],
            {
              getNextPageParam: (lastPage) => lastPage.nextCursor,
            },
          );
          // query2 depends on data fetched by query1
          const query2 = trpc.useInfiniteQuery(
            [
              'paginatedPosts',
              { limit: query1.data ? query1.data.pageParams.length + 1 : 0 },
            ],
            {
              getNextPageParam: (lastPage) => lastPage.nextCursor,
              enabled: query1.status === 'success',
            },
          );
          return (
            <>
              <>{JSON.stringify(query1.data)}</>
              <>{JSON.stringify(query2.data)}</>
            </>
          );
        };

        const Wrapped = withTRPC({
          config: () => trpcClientOptions,
          ssr: true,
        })(App);

        const props = await Wrapped.getInitialProps!({
          AppTree: Wrapped,
          Component: <div />,
        } as any);

        global.window = window;

        const utils = render(<Wrapped {...props} />);

        // when queryKey changes both queries are fetched on the server
        expect(utils.container).toHaveTextContent('first post');
        expect(utils.container).toHaveTextContent('second post');

        await waitFor(() => {
          expect(utils.container).toHaveTextContent('first post');
          expect(utils.container).toHaveTextContent('second post');
        });
      });
    });
  });
});
