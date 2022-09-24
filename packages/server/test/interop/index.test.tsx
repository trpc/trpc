/* eslint-disable @typescript-eslint/no-empty-function */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { waitError } from '../___testHelpers';
import { legacyRouterToServerAndClient } from './__legacyRouterToServerAndClient';
import { waitFor } from '@testing-library/react';
import { expectTypeOf } from 'expect-type';
import { z } from 'zod';
import { HTTPHeaders, TRPCClientError } from '../../../client/src';
import { httpBatchLink } from '../../../client/src';
import * as trpc from '../../src';
import { Maybe, TRPCError } from '../../src';
import { CreateHTTPContextOptions } from '../../src/adapters/standalone';
import { observable } from '../../src/observable';

test('smoke test', async () => {
  const { client, close } = legacyRouterToServerAndClient(
    trpc.router().query('hello', {
      resolve() {
        return 'world';
      },
    }),
  );

  expect(await client.query('hello')).toBe('world');
  close();
});
test('mix query and mutation', async () => {
  type Context = {};
  const r = trpc
    .router<Context>()
    .query('q1', {
      // input: null,
      resolve() {
        return 'q1res';
      },
    })
    .query('q2', {
      input: z.object({ q2: z.string() }),
      resolve() {
        return 'q2res';
      },
    })
    .mutation('m1', {
      resolve() {
        return 'm1res';
      },
    });

  const caller = r.createCaller({});
  expect(await caller.query('q1')).toMatchInlineSnapshot(`"q1res"`);

  expect(await caller.query('q2', { q2: 'hey' })).toMatchInlineSnapshot(
    `"q2res"`,
  );

  expect(await caller.mutation('m1')).toMatchInlineSnapshot(`"m1res"`);
});

test('merge', async () => {
  type Context = {};
  const root = trpc.router<Context>().query('helloo', {
    // input: null,
    resolve() {
      return 'world';
    },
  });
  const posts = trpc
    .router<Context>()
    .query('list', {
      resolve: () => [{ text: 'initial' }],
    })
    .mutation('create', {
      input: z.string(),
      resolve({ input }) {
        return { text: input };
      },
    });

  const r = root.merge('post.', posts);
  const caller = r.createCaller({});
  expect(await caller.query('post.list')).toMatchInlineSnapshot(`
    Array [
      Object {
        "text": "initial",
      },
    ]
  `);
});

describe('integration tests', () => {
  test('not found procedure', async () => {
    const { client, close } = legacyRouterToServerAndClient(
      trpc.router().query('hello', {
        input: z
          .object({
            who: z.string(),
          })
          .nullish(),
        resolve({ input }) {
          return {
            text: `hello ${input?.who ?? 'world'}`,
          };
        },
      }),
    );
    const err = await waitError(
      client.query('notFound' as any),
      TRPCClientError,
    );
    expect(err.message).toMatchInlineSnapshot(
      `"No \\"query\\"-procedure on path \\"notFound\\""`,
    );
    expect(err.shape?.message).toMatchInlineSnapshot(
      `"No \\"query\\"-procedure on path \\"notFound\\""`,
    );
    close();
  });

  test('invalid input', async () => {
    const { client, close } = legacyRouterToServerAndClient(
      trpc.router().query('hello', {
        input: z
          .object({
            who: z.string(),
          })
          .nullish(),
        resolve({ input }) {
          expectTypeOf(input).toMatchTypeOf<Maybe<{ who: string }>>();
          return {
            text: `hello ${input?.who ?? 'world'}`,
          };
        },
      }),
    );
    const err = await waitError(
      client.query('hello', { who: 123 as any }),
      TRPCClientError,
    );
    expect(err.shape?.code).toMatchInlineSnapshot(`-32600`);
    expect(err.shape?.message).toMatchInlineSnapshot(`
        "[
          {
            \\"code\\": \\"invalid_type\\",
            \\"expected\\": \\"string\\",
            \\"received\\": \\"number\\",
            \\"path\\": [
              \\"who\\"
            ],
            \\"message\\": \\"Expected string, received number\\"
          }
        ]"
      `);
    close();
  });

  test('passing input to input w/o input', async () => {
    const { client, close } = legacyRouterToServerAndClient(
      trpc
        .router()
        .query('q', {
          resolve() {
            return {
              text: `hello `,
            };
          },
        })
        .mutation('m', {
          resolve() {
            return {
              text: `hello `,
            };
          },
        }),
    );

    await client.query('q');
    await client.query('q', undefined);
    await client.query('q', null as any); // treat null as undefined
    await expect(
      client.query('q', 'not-nullish' as any),
    ).rejects.toMatchInlineSnapshot(`[TRPCClientError: No input expected]`);

    await client.mutation('m');
    await client.mutation('m', undefined);
    await client.mutation('m', null as any); // treat null as undefined
    await expect(
      client.mutation('m', 'not-nullish' as any),
    ).rejects.toMatchInlineSnapshot(`[TRPCClientError: No input expected]`);

    close();
  });

  describe('type testing', () => {
    test('basic', async () => {
      type Input = { who: string };
      const { client, close } = legacyRouterToServerAndClient(
        trpc.router().query('hello', {
          input: z.object({
            who: z.string(),
          }),
          resolve({ input }) {
            expectTypeOf(input).not.toBeAny();
            expectTypeOf(input).toMatchTypeOf<{ who: string }>();

            return {
              text: `hello ${input?.who ?? 'world'}`,
              input,
            };
          },
        }),
      );
      const res = await client.query('hello', { who: 'katt' });
      expectTypeOf(res.input).toMatchTypeOf<Input>();
      expectTypeOf(res.input).not.toBeAny();
      expectTypeOf(res).toMatchTypeOf<{ input: Input; text: string }>();

      expect(res.text).toEqual('hello katt');

      close();
    });

    test('mixed response', async () => {
      const { client, close } = legacyRouterToServerAndClient(
        trpc.router().query('postById', {
          input: z.number(),
          async resolve({ input }) {
            if (input === 1) {
              return {
                id: 1,
                title: 'helloo',
              };
            }
            if (input === 2) {
              return {
                id: 2,
                title: 'test',
              };
            }
            return null;
          },
        }),
      );
      const res = await client.query('postById', 1);
      expectTypeOf(res).toMatchTypeOf<null | { id: number; title: string }>();
      expect(res).toEqual({
        id: 1,
        title: 'helloo',
      });

      close();
    });

    test('propagate ctx', async () => {
      type Context = {
        user?: {
          id: number;
          name: string;
        };
      };

      const headers: HTTPHeaders = {};
      function createContext({ req }: CreateHTTPContextOptions): Context {
        if (req.headers.authorization !== 'kattsecret') {
          return {};
        }
        return {
          user: {
            id: 1,
            name: 'KATT',
          },
        };
      }
      const { client, close } = legacyRouterToServerAndClient(
        trpc.router<Context>().query('whoami', {
          async resolve({ ctx }) {
            if (!ctx.user) {
              throw new TRPCError({ code: 'UNAUTHORIZED' });
            }
            return ctx.user;
          },
        }),
        {
          server: {
            createContext,
          },
          client({ httpUrl }) {
            return {
              links: [
                httpBatchLink({
                  headers,
                  url: httpUrl,
                }),
              ],
            };
          },
        },
      );

      // no auth, should fail
      {
        const err = await waitError(client.query('whoami'), TRPCClientError);
        expect(err.shape.message).toMatchInlineSnapshot(`"UNAUTHORIZED"`);
      }
      // auth, should work
      {
        headers.authorization = 'kattsecret';
        const res = await client.query('whoami');
        expectTypeOf(res).toMatchTypeOf<{ id: number; name: string }>();
        expect(res).toEqual({
          id: 1,
          name: 'KATT',
        });
      }

      close();
    });

    test('optional input', async () => {
      type Input = Maybe<{ who: string }>;
      const { client, close } = legacyRouterToServerAndClient(
        trpc.router().query('hello', {
          input: z
            .object({
              who: z.string(),
            })
            .nullish(),
          resolve({ input }) {
            expectTypeOf(input).not.toBeAny();
            expectTypeOf(input).toMatchTypeOf<Input>();

            return {
              text: `hello ${input?.who ?? 'world'}`,
              input,
            };
          },
        }),
      );
      {
        const res = await client.query('hello', { who: 'katt' });
        expectTypeOf(res.input).toMatchTypeOf<Input>();
        expectTypeOf(res.input).not.toBeAny();
        expectTypeOf(res).toMatchTypeOf<{ input: Input; text: string }>();
      }
      {
        const res = await client.query('hello');
        expectTypeOf(res.input).toMatchTypeOf<Input>();
        expectTypeOf(res.input).not.toBeAny();
        expectTypeOf(res).toMatchTypeOf<{ input: Input; text: string }>();
      }

      close();
    });

    test('mutation', async () => {
      type Input = Maybe<{ who: string }>;
      const { client, close } = legacyRouterToServerAndClient(
        trpc.router().mutation('hello', {
          input: z
            .object({
              who: z.string(),
            })
            .nullish(),
          resolve({ input }) {
            expectTypeOf(input).not.toBeAny();
            expectTypeOf(input).toMatchTypeOf<Input>();

            return {
              text: `hello ${input?.who ?? 'world'}`,
              input,
            };
          },
        }),
      );
      const res = await client.mutation('hello', { who: 'katt' });
      expectTypeOf(res.input).toMatchTypeOf<Input>();
      expectTypeOf(res.input).not.toBeAny();
      expectTypeOf(res).toMatchTypeOf<{ input: Input; text: string }>();
      expect(res.text).toBe('hello katt');
      close();
    });
  });
});

describe('createCaller()', () => {
  type Context = {};
  const router = trpc
    .router<Context>()
    .query('q', {
      input: z.number(),
      async resolve({ input }) {
        return { input };
      },
    })
    .mutation('m', {
      input: z.number(),
      async resolve({ input }) {
        return { input };
      },
    })
    .subscription('sub', {
      input: z.number(),
      async resolve({ input }) {
        return observable<{ input: typeof input }>((emit) => {
          emit.next({ input });
          return () => {
            // noop
          };
        });
      },
    });

  test('query()', async () => {
    const data = await router.createCaller({}).query('q', 1);
    expectTypeOf(data).toMatchTypeOf<{ input: number }>();
    expect(data).toEqual({ input: 1 });
  });
  test('mutation()', async () => {
    const data = await router.createCaller({}).mutation('m', 2);
    expectTypeOf(data).toMatchTypeOf<{ input: number }>();
    expect(data).toEqual({ input: 2 });
  });
  test('subscription()', async () => {
    const subObservable = await router.createCaller({}).subscription('sub', 3);
    await new Promise<void>((resolve) => {
      subObservable.subscribe({
        next(data: { input: number }) {
          expect(data).toEqual({ input: 3 });
          expectTypeOf(data).toMatchTypeOf<{ input: number }>();
          resolve();
        },
      });
    });
  });
});

describe('createCaller()', () => {
  type Context = {};
  const router = trpc
    .router<Context>()
    .query('q', {
      input: z.number(),
      async resolve({ input }) {
        return { input };
      },
    })
    .mutation('m', {
      input: z.number(),
      async resolve({ input }) {
        return { input };
      },
    })
    .subscription('sub', {
      input: z.number(),
      async resolve({ input }) {
        return observable<{ input: typeof input }>((emit) => {
          emit.next({ input });
          return () => {
            // noop
          };
        });
      },
    });

  test('query()', async () => {
    const data = await router.createCaller({}).query('q', 1);
    expectTypeOf(data).toMatchTypeOf<{ input: number }>();
    expect(data).toEqual({ input: 1 });
  });
  test('mutation()', async () => {
    const data = await router.createCaller({}).mutation('m', 2);
    expectTypeOf(data).toMatchTypeOf<{ input: number }>();
    expect(data).toEqual({ input: 2 });
  });
  test('subscription()', async () => {
    const subObservable = await router.createCaller({}).subscription('sub', 3);
    await new Promise<void>((resolve) => {
      subObservable.subscribe({
        next(data: { input: number }) {
          expect(data).toEqual({ input: 3 });
          expectTypeOf(data).toMatchTypeOf<{ input: number }>();
          resolve();
        },
      });
    });
  });
});

// regression https://github.com/trpc/trpc/issues/527
test('void mutation response', async () => {
  const {
    client,
    close,
    // wssPort,
    // router
  } = legacyRouterToServerAndClient(
    trpc
      .router()
      .mutation('undefined', {
        async resolve() {},
      })
      .mutation('null', {
        async resolve() {
          return null;
        },
      }),
  );
  expect(await client.mutation('undefined')).toMatchInlineSnapshot(`undefined`);
  expect(await client.mutation('null')).toMatchInlineSnapshot(`null`);

  // const ws = createWSClient({
  //   url: `ws://localhost:${wssPort}`,
  //   WebSocket: WebSocket as any,
  // });
  // const wsClient = createTRPCClient<typeof router>({
  //   links: [wsLink({ client: ws })],
  // });

  // expect(await wsClient.mutation('undefined')).toMatchInlineSnapshot(
  //   `undefined`,
  // );
  // expect(await wsClient.mutation('null')).toMatchInlineSnapshot(`null`);
  // ws.close();
  close();
});

// https://github.com/trpc/trpc/issues/559
describe('ObservableAbortError', () => {
  test('cancelling request should throw ObservableAbortError', async () => {
    const { client, close } = legacyRouterToServerAndClient(
      trpc.router().query('slow', {
        async resolve() {
          await new Promise((resolve) => setTimeout(resolve, 500));
          return null;
        },
      }),
    );
    const onReject = jest.fn();
    const ac = new AbortController();
    const req = client.query('slow', undefined, {
      signal: ac.signal,
    });
    req.catch(onReject);
    // cancel after 10ms
    await new Promise((resolve) => setTimeout(resolve, 5));
    ac.abort();

    await waitFor(() => {
      expect(onReject).toHaveBeenCalledTimes(1);
    });

    const err = onReject.mock.calls[0]![0]! as TRPCClientError<any>;
    expect(err.name).toBe('TRPCClientError');
    expect(err.cause?.name).toBe('ObservableAbortError');

    close();
  });

  test('cancelling batch request should throw AbortError', async () => {
    // aborting _one_ batch request doesn't necessarily mean we cancel the reqs part of that batch

    const { client, close } = legacyRouterToServerAndClient(
      trpc
        .router()
        .query('slow1', {
          async resolve() {
            await new Promise((resolve) => setTimeout(resolve, 500));
            return 'slow1';
          },
        })
        .query('slow2', {
          async resolve() {
            await new Promise((resolve) => setTimeout(resolve, 500));
            return 'slow2';
          },
        }),
      {
        server: {
          batching: {
            enabled: true,
          },
        },
        client({ httpUrl }) {
          return {
            links: [httpBatchLink({ url: httpUrl })],
          };
        },
      },
    );
    const ac = new AbortController();
    const req1 = client.query('slow1', undefined, { signal: ac.signal });
    const req2 = client.query('slow2');
    const onReject1 = jest.fn();
    req1.catch(onReject1);

    await new Promise((resolve) => setTimeout(resolve, 5));
    ac.abort();
    await waitFor(() => {
      expect(onReject1).toHaveBeenCalledTimes(1);
    });

    const err = onReject1.mock.calls[0]![0]! as TRPCClientError<any>;
    expect(err).toBeInstanceOf(TRPCClientError);
    expect(err.cause?.name).toBe('ObservableAbortError');

    expect(await req2).toBe('slow2');

    close();
  });
});

test('regression: JSON.stringify([undefined]) gives [null] causes wrong type to procedure input', async () => {
  const { client, close } = legacyRouterToServerAndClient(
    trpc.router().query('q', {
      input: z.string().optional(),
      async resolve({ input }) {
        return { input };
      },
    }),
    {
      client({ httpUrl }) {
        return {
          links: [httpBatchLink({ url: httpUrl })],
        };
      },
      server: {
        batching: {
          enabled: true,
        },
      },
    },
  );

  expect(await client.query('q', 'foo')).toMatchInlineSnapshot(`
Object {
  "input": "foo",
}
`);
  expect(await client.query('q')).toMatchInlineSnapshot(`Object {}`);
  close();
});
