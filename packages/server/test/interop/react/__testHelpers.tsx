/* eslint-disable @typescript-eslint/no-empty-function */
import { routerToServerAndClientNew } from '../../___testHelpers';
import {
  createQueryClient,
  createQueryClientConfig,
} from '../../__queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  TRPCWebSocketClient,
  createWSClient,
  httpBatchLink,
  splitLink,
  wsLink,
} from '@trpc/client/src';
import { createReactQueryHooks } from '@trpc/react-query/src';
import { OutputWithCursor } from '@trpc/react-query/src/shared/hooks/createHooksInternal';
import * as trpcServer from '@trpc/server/src';
import { TRPCError } from '@trpc/server/src';
import { observable } from '@trpc/server/src/observable';
import { subscriptionPullFactory } from '@trpc/server/src/subscription';
import hash from 'hash-sum';
import React, { ReactNode } from 'react';
import { ZodError, z } from 'zod';

type Context = {};
export type Post = {
  id: string;
  title: string;
  createdAt: number;
};

/** @deprecated **/
export function createLegacyAppRouter() {
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

  let count = 0;
  const appRouter = trpcServer
    .router<Context>()
    .formatError(({ shape, error }) => {
      return {
        $test: 'formatted',
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
        ...shape,
      };
    })
    .query('count', {
      input: z.string(),
      resolve({ input }) {
        return `${input}:${++count}`;
      },
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
          const element = db.posts[index]!;
          if (cursor != null && element!.createdAt < cursor) {
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
          nextCursor = db.posts[nextIndex]!.createdAt;
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
        return subscriptionPullFactory<Post>({
          intervalMs: 1,
          pull(emit) {
            db.posts.filter((p) => p.createdAt > input).forEach(emit.next);
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

        return subscriptionPullFactory<OutputWithCursor<Post[]>>({
          intervalMs: 10,
          pull(emit) {
            const newCursor = hash(db.posts);
            if (newCursor !== cursor) {
              emit.next({ data: db.posts, cursor: newCursor });
            }
          },
        });
      },
    })
    .interop();

  const linkSpy = {
    up: jest.fn(),
    down: jest.fn(),
  };
  const { client, trpcClientOptions, close } = routerToServerAndClientNew(
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
          links: [
            () =>
              ({ op, next }) => {
                return observable((observer) => {
                  linkSpy.up(op);
                  const subscription = next(op).subscribe({
                    next(result) {
                      linkSpy.down(result);
                      observer.next(result);
                    },
                    error(result) {
                      linkSpy.down(result);
                      observer.error(result);
                    },
                    complete() {
                      linkSpy.down('COMPLETE');
                      observer.complete();
                    },
                  });
                  return subscription;
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

  trpcClientOptions.queryClientConfig = createQueryClientConfig(
    trpcClientOptions.queryClientConfig,
  );
  const queryClient = createQueryClient(trpcClientOptions.queryClientConfig);

  const trpc = createReactQueryHooks<typeof appRouter>();

  function App(props: { children: ReactNode }) {
    return (
      <trpc.Provider {...{ queryClient, client }}>
        <QueryClientProvider client={queryClient}>
          {props.children}
        </QueryClientProvider>
      </trpc.Provider>
    );
  }
  return {
    App,
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
