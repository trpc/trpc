/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
import '@testing-library/jest-dom';
import { render, waitFor } from '@testing-library/react';
import { expectTypeOf } from 'expect-type';
import hash from 'hash-sum';
import React from 'react';
import { QueryClient, QueryClientProvider, setLogger } from 'react-query';
import * as z from 'zod';
import { ZodError } from 'zod';
import { trpcReact, OutputWithCursor, useInstance } from '../../react/src';
import * as trpc from '../src';
import { routerToServerAndClient } from './_testHelpers';
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

  const allPosts = jest.fn();
  const postById = jest.fn();
  const appRouter = trpc
    .router<Context>()
    .formatError(({ defaultShape, error }) => {
      return {
        $test: 'formatted',
        zodError:
          error.originalError instanceof ZodError
            ? error.originalError.flatten()
            : null,
        ...defaultShape,
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
          throw trpc.httpError.notFound();
        }
        return post;
      },
    })
    .query('paginatedPosts', {
      input: z.object({
        limit: z.number().min(1).max(100).optional(),
        cursor: z.number().optional(),
      }),
      resolve({ input: { limit = 50, cursor } }) {
        const items: typeof db.posts = [];
        let nextCursor: typeof cursor | undefined = undefined;
        for (let index = 0; index < db.posts.length; index++) {
          const element = db.posts[index];
          if (typeof cursor !== 'undefined' && element.createdAt < cursor) {
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

  const hooks = trpcReact<typeof appRouter>();

  return {
    appRouter,
    client,
    hooks,
    close,
    db,
    postLiveInputs,
    resolvers: {
      postById,
      allPosts,
    },
  };
}
let factory: ReturnType<typeof createAppRouter>;
beforeEach(() => {
  factory = createAppRouter();
});
afterEach(() => {
  factory.close();
});

describe.only('useQuery()', () => {
  test('no input', async () => {
    const { hooks, client } = factory;
    function MyComponent() {
      const allPostsQuery = hooks.useQuery(['allPosts']);
      expectTypeOf(allPostsQuery.data!).toMatchTypeOf<Post[]>();

      return <pre>{JSON.stringify(allPostsQuery.data ?? 'n/a', null, 4)}</pre>;
    }
    function App() {
      const queryClient = useInstance(() => new QueryClient());
      return (
        <hooks.Provider queryClient={() => queryClient} client={() => client}>
          <QueryClientProvider client={queryClient}>
            <MyComponent />
          </QueryClientProvider>
        </hooks.Provider>
      );
    }

    const utils = render(<App />);
    await waitFor(() => {
      expect(utils.container).toHaveTextContent('first post');
    });
  });

  // test('with input', async () => {
  //   const { hooks } = factory;
  //   function MyComponent() {
  //     const allPostsQuery = hooks.useQuery(['paginatedPosts', { limit: 1 }]);

  //     return <pre>{JSON.stringify(allPostsQuery.data ?? 'n/a', null, 4)}</pre>;
  //   }
  //   function App() {
  //     return (
  //       <QueryClientProvider client={hooks.queryClient}>
  //         <MyComponent />
  //       </QueryClientProvider>
  //     );
  //   }

  //   const utils = render(<App />);
  //   await waitFor(() => {
  //     expect(utils.container).toHaveTextContent('first post');
  //   });
  //   expect(utils.container).not.toHaveTextContent('second post');
  // });
});
