import { createQueryClient, createQueryClientConfig } from './__queryClient';
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { QueryClientProvider } from '@tanstack/react-query';
import type { TRPCWebSocketClient } from '@trpc/client';
import {
  createWSClient,
  getUntypedClient,
  httpBatchLink,
  splitLink,
  wsLink,
} from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import type { OutputWithCursor } from '@trpc/react-query/shared';
import { initTRPC, TRPCError } from '@trpc/server';
import type { Observable, Observer } from '@trpc/server/observable';
import { observable } from '@trpc/server/observable';
import hash from 'hash-sum';
import type { ReactNode } from 'react';
import React from 'react';
import { z, ZodError } from 'zod';

export type Post = {
  id: string;
  title: string;
  createdAt: number;
};

function subscriptionPullFactory<TOutput>(opts: {
  /**
   * The interval of how often the function should run
   */
  intervalMs: number;
  pull(emit: Observer<TOutput, unknown>): Promise<void> | void;
}): Observable<TOutput, unknown> {
  let timer: any;
  let stopped = false;
  async function _pull(emit: Observer<TOutput, unknown>) {
    /* istanbul ignore next */
    if (stopped) {
      return;
    }
    try {
      await opts.pull(emit);
    } catch (err /* istanbul ignore next */) {
      emit.error(err as Error);
    }

    /* istanbul ignore else */
    if (!stopped) {
      timer = setTimeout(() => _pull(emit), opts.intervalMs);
    }
  }

  return observable<TOutput>((emit) => {
    _pull(emit).catch((err) => {
      emit.error(err as Error);
    });
    return () => {
      clearTimeout(timer);
      stopped = true;
    };
  });
}

export function createAppRouter() {
  const db: {
    posts: Post[];
  } = {
    posts: [
      { id: '1', title: 'first post', createdAt: 0 },
      { id: '2', title: 'second post', createdAt: 1 },
    ],
  };
  const postLiveInputs: unknown[] = [];
  const createContext = vi.fn(() => ({}));
  const allPosts = vi.fn();
  const postById = vi.fn();
  const paginatedPosts = vi.fn();
  let wsClient: TRPCWebSocketClient = null as any;

  const t = initTRPC.create({
    errorFormatter({ shape, error }) {
      return {
        $test: 'formatted',
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
        ...shape,
      };
    },
  });

  let count = 0;
  const appRouter = t.router({
    count: t.procedure.input(z.string()).query(({ input }) => {
      return `${input}:${count++}`;
    }),
    allPosts: t.procedure.query(({}) => {
      allPosts();
      return db.posts;
    }),
    postById: t.procedure.input(z.string()).query(({ input }) => {
      postById(input);
      const post = db.posts.find((p) => p.id === input);
      if (!post) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
      return post;
    }),
    paginatedPosts: t.procedure
      .input(
        z
          .object({
            limit: z.number().min(1).max(100).default(50),
            cursor: z.number().nullish().default(null),
          })
          .default({}),
      )
      .query(({ input }) => {
        paginatedPosts(input);
        const items: typeof db.posts = [];
        const limit = input.limit;
        const { cursor } = input;
        let nextCursor: typeof cursor = null;
        for (const element of db.posts) {
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
      }),
    biDirectionalPaginatedPosts: t.procedure
      .input(
        z.object({
          limit: z.number().min(1).max(100).default(50),
          cursor: z.number().nullish().default(null),
          direction: z.union([z.literal('forward'), z.literal('backward')]),
        }),
      )
      .query(({ input }) => {
        paginatedPosts(input);
        const items: typeof db.posts = [];
        const limit = input.limit;
        const { cursor } = input;
        let nextCursor: typeof cursor = null;
        let prevCursor: typeof cursor = null;
        for (const element of db.posts) {
          if (
            cursor != null &&
            (input.direction === 'forward'
              ? element.createdAt < cursor
              : element.createdAt > cursor)
          ) {
            continue;
          }
          items.push(element);
          if (items.length >= limit) {
            break;
          }
        }
        const last = items[items.length - 1];
        const first = items[0];
        const nextIndex = db.posts.findIndex((item) => item === last) + 1;
        const prevIndex = db.posts.findIndex((item) => item === first) - 1;
        if (db.posts[nextIndex]) {
          nextCursor = db.posts[nextIndex].createdAt;
        }
        if (db.posts[prevIndex]) {
          prevCursor = db.posts[prevIndex].createdAt;
        }
        return {
          items,
          nextCursor,
          prevCursor,
        };
      }),

    addPost: t.procedure
      .input(
        z.object({
          title: z.string(),
        }),
      )
      .mutation(({ input }) => {
        db.posts.push({
          id: `${Math.random()}`,
          createdAt: Date.now(),
          title: input.title,
        });
      }),

    deletePosts: t.procedure
      .input(z.array(z.string()).nullish())
      .mutation(({ input }) => {
        if (input) {
          db.posts = db.posts.filter((p) => !input.includes(p.id));
        } else {
          db.posts = [];
        }
      }),

    PING: t.procedure.mutation(({}) => {
      return 'PONG' as const;
    }),

    newPosts: t.procedure.input(z.number()).subscription(({ input }) => {
      return subscriptionPullFactory<Post>({
        intervalMs: 1,
        pull(emit) {
          db.posts.filter((p) => p.createdAt > input).forEach(emit.next);
        },
      });
    }),

    postsLive: t.procedure
      .input(
        z.object({
          cursor: z.string().nullable(),
        }),
      )
      .subscription(({ input }) => {
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
      }),
    getMockPostByContent: t.procedure
      .input(
        z.object({
          id: z.string(),
          title: z.string(),
          content: z.object({
            type: z.string(),
            language: z.string(),
          }),
        }),
      )
      .query(({ input }) => {
        return {
          id: input.id,
          title: input.title,
          content: input.content.type,
          createdAt: 0,
        };
      }),
  });

  const linkSpy = {
    up: vi.fn(),
    down: vi.fn(),
  };
  const { client, trpcClientOptions, close } = testServerAndClientResource(
    appRouter,
    {
      server: {
        createContext,
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

  // trpcClientOptions.queryClientConfig = createQueryClientConfig(
  //   trpcClientOptions.queryClientConfig,
  // );
  const queryClient =
    createQueryClient(/** trpcClientOptions.queryClientConfig */);
  const trpc = createTRPCReact<typeof appRouter>();

  function App(props: { children: ReactNode }) {
    return (
      <trpc.Provider {...{ queryClient, client: getUntypedClient(client) }}>
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
      paginatedPosts,
    },
    queryClient,
    createContext,
    linkSpy,
  };
}
