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
  return trpc
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
        })
      },
    }).subscription('newPosts', {
      input: z.number(),
      resolve({input}) {
        return trpc.subscriptionPullFactory<Post>({
          intervalMs: 1,
          pull(emit) {
            db.posts.filter(p => p.createdAt > input).forEach(emit.data)
          }

        })
      }
    })
}
let appRouter: ReturnType<typeof createAppRouter>;
beforeEach(() => {
  appRouter = createAppRouter();
});
test('basic query', async () => {
  const { client, close } = routerToServerAndClient(appRouter);

  const queryClient = new QueryClient();
  const { useQuery } = createReactQueryHooks<typeof appRouter, Context>({
    client: client,
    queryClient,
  });
  function MyComponent() {
    const allPostsQuery = useQuery('allPosts');
    expectTypeOf(allPostsQuery.data!).toMatchTypeOf<Post[]>();

    return <pre>{JSON.stringify(allPostsQuery.data ?? 'n/a', null, 4)}</pre>;
  }
  function App() {
    return (
      <QueryClientProvider client={queryClient}>
        <MyComponent />
      </QueryClientProvider>
    );
  }

  const utils = render(<App />);
  await waitFor(() => {
    expect(utils.container).toHaveTextContent('first post');
  });

  close();
});

test('mutation on mount + subscribe for it',async  () => {
  const { client, close } = routerToServerAndClient(appRouter);

  const queryClient = new QueryClient();
  const t = createReactQueryHooks<typeof appRouter, Context>({
    client: client,
    queryClient,
  });
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
    const input = posts.reduce((num, post) => Math.max(num, post.createdAt), 0)
    
    const sub = t.useSubscription(['newPosts', input])
    useEffect(() => addPosts(sub.data), [sub.data])

    const mutation = t.useMutation('addPost')
    useEffect(() => {
      if (posts.length === 1) {
        mutation.mutate({title: 'second post'})
      }
    }, [posts.length])
    
    return <pre>{JSON.stringify(posts, null, 4)}</pre>;
  }
  function App() {
    return (
      <QueryClientProvider client={queryClient}>
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

  close();
  
});
