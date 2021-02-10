/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/ban-types */
import '@testing-library/jest-dom';
import { render, waitFor } from '@testing-library/react';
import { expectTypeOf } from 'expect-type';
import React from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';
import * as z from 'zod';
import { createReactQueryHooks } from '../../react/src';
import * as trpc from '../src';
import { routerToServerAndClient } from './_testHelpers';

type Context = {};
type Post = {
  id: string,
  title: string
}
function createAppRouter() {
  const db: {
    posts: Post[]
  } = {
    posts: [
      {id: '1', title: 'first post'}
    ]
  }
  return trpc.router<Context>().query('allPosts', {
    resolve() {
      return db.posts
    },
  }).query('postById', {
    input: z.string(),
    resolve({input}) {
      const post = db.posts.find(p => p.id === input)
      if (!post) {
        throw trpc.httpError.notFound()
      }
      return post;
    }
  });
}
let appRouter: ReturnType<typeof createAppRouter>
beforeEach(() => {
  appRouter = createAppRouter()
})
test('query for all posts', async () => {
  const { client, close } = routerToServerAndClient(appRouter);

  const queryClient = new QueryClient();
  const { useQuery } = createReactQueryHooks<typeof appRouter, Context>({
    client: client,
    queryClient,
  });
  function MyComponent() {
    const allPostsQuery = useQuery('allPosts');
    expectTypeOf(allPostsQuery.data!).toMatchTypeOf<Post[]>();

    return (<pre>{JSON.stringify(allPostsQuery.data ?? 'n/a', null, 4)}</pre>
    );
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
