/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
import '@testing-library/jest-dom';
import { render, waitFor } from '@testing-library/react';
import { expectTypeOf } from 'expect-type';
import React, { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';
import * as z from 'zod';
import { createReactQueryHooks } from '../../react/src';
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
    posts: [{ id: '1', title: 'first post', createdAt: Date.now() }],
  };
  const appRouter = trpc
    .router<Context>()
    .query('allPosts', {
      resolve() {
        return db.posts;
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
    const input = posts.reduce((num, post) => Math.max(num, post.createdAt), 0);

    const sub = hooks.useSubscription(['newPosts', input]);
    useEffect(() => addPosts(sub.data), [sub.data]);

    const mutation = hooks.useMutation('addPost');
    useEffect(() => {
      if (posts.length === 1) {
        mutation.mutate({ title: 'second post' });
      }
    }, [posts.length]);

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

test('dehydrate', async () => {
  const { hooks, appRouter, db } = factory;

  await hooks.prefetchQueryOnServer(appRouter, {
    path: 'allPosts',
    ctx: {},
    input: undefined,
  });

  const dehydrated = hooks.dehydrate(hooks.queryClient).queries;
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
