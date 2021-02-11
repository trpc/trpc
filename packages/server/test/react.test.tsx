/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
import '@testing-library/jest-dom';
import { render, waitFor } from '@testing-library/react';
import { expectTypeOf } from 'expect-type';
import hash from 'hash-sum';
import React, { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';
import * as z from 'zod';
import { createReactQueryHooks, OutputWithCursor } from '../../react/src';
import * as trpc from '../src';
import { routerToServerAndClient } from './_testHelpers';
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
    posts: [{ id: '1', title: 'first post', createdAt: 0 }],
  };
  const postLiveInputs: unknown[] = [];
  const appRouter = trpc
    .router<Context>()
    .query('allPosts', {
      resolve() {
        return db.posts;
      },
    })
    .query('postById', {
      input: z.string(),
      resolve({ input }) {
        const post = db.posts.find((p) => p.id === input);
        if (!post) {
          throw trpc.httpError.notFound();
        }
        return post;
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
    .subscription('newPosts', {
      input: z.number(),
      resolve({ input }) {
        return trpc.subscriptionPullFactory<Post>({
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

        return trpc.subscriptionPullFactory<OutputWithCursor<Post[]>>({
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

  const { client, close } = routerToServerAndClient(appRouter);

  const queryClient = new QueryClient();
  const hooks = createReactQueryHooks<typeof appRouter, Context>({
    client: client,
    queryClient,
  });

  return {
    appRouter,
    hooks,
    close,
    db,
    postLiveInputs,
  };
}
let factory: ReturnType<typeof createAppRouter>;
beforeEach(() => {
  factory = createAppRouter();
});
afterEach(() => {
  factory.close();
});

test('basic query', async () => {
  const { hooks } = factory;
  function MyComponent() {
    const allPostsQuery = hooks.useQuery('allPosts');
    expectTypeOf(allPostsQuery.data!).toMatchTypeOf<Post[]>();

    return <pre>{JSON.stringify(allPostsQuery.data ?? 'n/a', null, 4)}</pre>;
  }
  function App() {
    return (
      <QueryClientProvider client={hooks.queryClient}>
        <MyComponent />
      </QueryClientProvider>
    );
  }

  const utils = render(<App />);
  await waitFor(() => {
    expect(utils.container).toHaveTextContent('first post');
  });
});

test('mutation on mount + subscribe for it', async () => {
  const { hooks } = factory;
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

    const sub = hooks.useSubscription(['newPosts', input]);
    useEffect(() => addPosts(sub.data), [sub.data]);

    const mutation = hooks.useMutation('addPost');
    const mutate = mutation.mutate;
    useEffect(() => {
      if (posts.length === 1) {
        mutate({ title: 'second post' });
      }
    }, [posts.length, mutate]);

    return <pre>{JSON.stringify(posts, null, 4)}</pre>;
  }
  function App() {
    return (
      <QueryClientProvider client={hooks.queryClient}>
        <MyComponent />
      </QueryClientProvider>
    );
  }

  const utils = render(<App />);
  await waitFor(() => {
    expect(utils.container).toHaveTextContent('first post');
  });
  await waitFor(() => {
    expect(utils.container).toHaveTextContent('second post');
  });
});

test('useLiveQuery', async () => {
  const { hooks, db, postLiveInputs } = factory;
  function MyComponent() {
    const postsQuery = hooks.useLiveQuery(['postsLive', {}]);

    return <pre>{JSON.stringify(postsQuery.data ?? null, null, 4)}</pre>;
  }
  function App() {
    return (
      <QueryClientProvider client={hooks.queryClient}>
        <MyComponent />
      </QueryClientProvider>
    );
  }

  const utils = render(<App />);
  await waitFor(() => {
    expect(utils.container).toHaveTextContent('first post');
  });

  for (let index = 0; index < 3; index++) {
    const title = `a new post index:${index}`;
    db.posts.push({
      id: `r${index}`,
      createdAt: 0,
      title,
    });

    await waitFor(() => {
      expect(utils.container).toHaveTextContent(title);
    });
  }

  expect(utils.container.innerHTML).not.toContain('cursor');
  expect(postLiveInputs).toMatchInlineSnapshot(`
    Array [
      Object {
        "cursor": null,
      },
      Object {
        "cursor": "26e57a36",
      },
      Object {
        "cursor": "29bac818",
      },
      Object {
        "cursor": "f8b75db0",
      },
    ]
  `);
});

test('dehydrate', async () => {
  const { hooks, appRouter, db } = factory;

  await hooks.prefetchQueryOnServer(appRouter, {
    path: 'allPosts',
    ctx: {},
    input: undefined,
  });

  const dehydrated = hooks.dehydrate().queries;
  expect(dehydrated).toHaveLength(1);

  const [cache] = dehydrated;
  expect(cache.queryHash).toMatchInlineSnapshot(`"[\\"allPosts\\",null]"`);
  expect(cache.queryKey).toMatchInlineSnapshot(`
    Array [
      "allPosts",
      null,
    ]
  `);
  expect(cache.state.data).toEqual(db.posts);
});

test('prefetchQuery', async () => {
  const { hooks } = factory;
  function MyComponent() {
    const [state, setState] = useState<string>('nope');
    useEffect(() => {
      async function prefetch() {
        await hooks.prefetchQuery(['postById', '1']);
        setState(JSON.stringify(hooks.dehydrate()));
      }
      prefetch();
    }, []);

    return <>{JSON.stringify(state)}</>;
  }
  function App() {
    return (
      <QueryClientProvider client={hooks.queryClient}>
        <MyComponent />
      </QueryClientProvider>
    );
  }

  const utils = render(<App />);
  await waitFor(() => {
    expect(utils.container).toHaveTextContent('first post');
  });
});
