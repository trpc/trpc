/* eslint-disable @typescript-eslint/no-empty-function */

/* eslint-disable @typescript-eslint/ban-types */

/* eslint-disable @typescript-eslint/ban-ts-comment */
import { trpcServer } from '../../___packages';
import { routerToServerAndClientNew } from '../../___testHelpers';
import { Post } from './__testHelpers';
import '@testing-library/jest-dom';
import '@testing-library/jest-dom';
import { render, waitFor } from '@testing-library/react';
import { httpBatchLink } from '@trpc/client/src/links/httpBatchLink';
import { splitLink } from '@trpc/client/src/links/splitLink';
import {
  TRPCWebSocketClient,
  createWSClient,
  wsLink,
} from '@trpc/client/src/links/wsLink';
import hash from 'hash-sum';
import React from 'react';
import { QueryClient, setLogger } from 'react-query';
import { ZodError, z } from 'zod';
import { setupTrpcNext } from '../../../../next/src';
import { OutputWithCursor } from '../../../../react/src/createReactQueryHooks';
import { TRPCError } from '../../../src/error/TRPCError';
import { observable } from '../../../src/observable';
import { subscriptionPullFactory } from '../../../src/subscription';

setLogger({
  log() {},
  warn() {},
  error() {},
});

type Context = {};

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
  const queryClient = new QueryClient();

  const trpcNext = setupTrpcNext({
    config: () => trpcClientOptions,
    ssr: true,
  });

  return {
    trpcNext,
    appRouter,
    close,
    db,
    client,
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

let factory: ReturnType<typeof createLegacyAppRouter>;
beforeEach(() => {
  factory = createLegacyAppRouter();
});
afterEach(() => {
  factory.close();
});

describe('setupTrpcNext()', () => {
  test('useQuery', async () => {
    // @ts-ignore
    const { window } = global;

    // @ts-ignore
    delete global.window;
    const { trpcNext } = factory;

    const Content = () => {
      const query = trpcNext.useQuery(['allPosts']);
      return <>{JSON.stringify(query.data)}</>;
    };

    const Wrapped = trpcNext.withTRPC(Content);

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
    const { trpcNext } = factory;

    const Content = () => {
      const query = trpcNext.useInfiniteQuery(
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

    const Wrapped = trpcNext.withTRPC(Content);

    const props = await Wrapped.getInitialProps!({
      AppTree: Wrapped,
      Component: <div />,
    } as any);

    global.window = window;

    const utils = render(<Wrapped {...props} />);
    expect(utils.container).toHaveTextContent('first post');
  });

  test('browser render', async () => {
    const { trpcNext } = factory;

    const Content = () => {
      const query = trpcNext.useQuery(['allPosts']);
      return <>{JSON.stringify(query.data)}</>;
    };

    const Wrapped = trpcNext.withTRPC(Content);

    const props = await Wrapped.getInitialProps!({
      AppTree: Wrapped,
      Component: <div />,
    } as any);

    const utils = render(<Wrapped {...props}></Wrapped>);

    await waitFor(() => {
      expect(utils.container).toHaveTextContent('first post');
    });
  });

  describe('`ssr: false` on query', () => {
    test('useQuery()', async () => {
      const { window } = global;

      // @ts-ignore
      delete global.window;
      const { trpcNext } = factory;

      const Content = () => {
        const query = trpcNext.useQuery(['allPosts'], { ssr: false });
        return <>{JSON.stringify(query.data)}</>;
      };

      const Wrapped = trpcNext.withTRPC(Content);

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
      const { trpcNext } = factory;

      const Content = () => {
        const query = trpcNext.useInfiniteQuery(
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

      const Wrapped = trpcNext.withTRPC(Content);

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
    const { trpcNext, createContext } = factory;

    const Content = () => {
      const query1 = trpcNext.useQuery(['postById', '1']);
      const query2 = trpcNext.useQuery(['postById', '2']);

      return <>{JSON.stringify([query1.data, query2.data])}</>;
    };

    const Wrapped = trpcNext.withTRPC(Content);

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
        const { trpcNext } = factory;

        const Content = () => {
          const query1 = trpcNext.useQuery(['postById', '1']);
          // query2 depends only on query1 status
          const query2 = trpcNext.useQuery(['postById', '2'], {
            enabled: query1.status === 'success',
          });
          return (
            <>
              <>{JSON.stringify(query1.data)}</>
              <>{JSON.stringify(query2.data)}</>
            </>
          );
        };

        const Wrapped = trpcNext.withTRPC(Content);

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
        const { trpcNext } = factory;

        const Content = () => {
          const query1 = trpcNext.useQuery(['postById', '1']);
          // query2 depends on data fetched by query1
          const query2 = trpcNext.useQuery(
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

        const Wrapped = trpcNext.withTRPC(Content);

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
        const { trpcNext } = factory;

        const Content = () => {
          const query1 = trpcNext.useInfiniteQuery(
            ['paginatedPosts', { limit: 1 }],
            {
              getNextPageParam: (lastPage) => lastPage.nextCursor,
            },
          );
          // query2 depends only on query1 status
          const query2 = trpcNext.useInfiniteQuery(
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

        const Wrapped = trpcNext.withTRPC(Content);

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
        const { trpcNext } = factory;

        const Content = () => {
          const query1 = trpcNext.useInfiniteQuery(
            ['paginatedPosts', { limit: 1 }],
            {
              getNextPageParam: (lastPage) => lastPage.nextCursor,
            },
          );
          // query2 depends on data fetched by query1
          const query2 = trpcNext.useInfiniteQuery(
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

        const Wrapped = trpcNext.withTRPC(Content);

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
