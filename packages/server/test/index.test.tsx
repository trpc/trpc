/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */
import { TRPCClientError } from '../../client/src';
import * as z from 'zod';
import * as trpc from '../src';
import { routerToServerAndClient } from './_testHelpers';
import { expectTypeOf } from 'expect-type';
import { CreateHttpContextOptions, httpError } from '../src';

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

  const r = root.merge('posts.', posts);
  const caller = r.createCaller({});
  expect(await caller.query('posts.list')).toMatchInlineSnapshot(`
    Array [
      Object {
        "text": "initial",
      },
    ]
  `);
});

describe('integration tests', () => {
  test('not found procedure', async () => {
    const { client, close } = routerToServerAndClient(
      trpc.router().query('hello', {
        input: z
          .object({
            who: z.string(),
          })
          .optional(),
        resolve({ input }) {
          return {
            text: `hello ${input?.who ?? 'world'}`,
          };
        },
      }),
    );
    try {
      await client.query('notFound' as any);
      throw new Error('Did not fail');
    } catch (err) {
      if (!(err instanceof TRPCClientError)) {
        throw new Error('Not TRPCClientError');
      }
      expect(err.message).toMatchInlineSnapshot(
        `"No such procedure \\"notFound\\""`,
      );
      expect(err.res?.status).toBe(404);
    }
    close();
  });

  test('invalid input', async () => {
    const { client, close } = routerToServerAndClient(
      trpc.router().query('hello', {
        input: z
          .object({
            who: z.string(),
          })
          .optional(),
        resolve({ input }) {
          expectTypeOf(input).toMatchTypeOf<{ who: string } | undefined>();
          return {
            text: `hello ${input?.who ?? 'world'}`,
          };
        },
      }),
    );
    try {
      await client.query('hello', { who: 123 as any });
      throw new Error('Did not fail');
    } catch (err) {
      if (!(err instanceof TRPCClientError)) {
        throw new Error('Not TRPCClientError');
      }
      expect(err.res?.status).toBe(400);
    }
    close();
  });

  describe('type testing', () => {
    test('basic', async () => {
      type Input = { who: string };
      const { client, close } = routerToServerAndClient(
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
      const { client, close } = routerToServerAndClient(
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
      // eslint-disable-next-line prefer-const
      let headers: Record<string, string | undefined> = {};
      function createContext({ req }: CreateHttpContextOptions): Context {
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
      const { client, close } = routerToServerAndClient(
        trpc.router<Context>().query('whoami', {
          async resolve({ ctx }) {
            if (!ctx.user) {
              throw httpError.unauthorized();
            }
            return ctx.user;
          },
        }),
        {
          createContext,
          getHeaders: () => headers,
        },
      );

      // no auth, should fail
      {
        let threw = false;
        try {
          const res = await client.query('whoami');
          expectTypeOf(res).toMatchTypeOf<{ id: number; name: string }>();
        } catch (err) {
          threw = true;
          expect(err.res.status).toBe(401);
        }
        if (!threw) {
          throw new Error("Didn't throw");
        }
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
      type Input = { who: string } | undefined;
      const { client, close } = routerToServerAndClient(
        trpc.router().query('hello', {
          input: z
            .object({
              who: z.string(),
            })
            .optional(),
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
        return new trpc.Subscription<{ input: typeof input }>({
          start(emit) {
            emit.data({ input });
            return () => {
              // noop
            };
          },
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
  test('subscription()', async (done) => {
    const sub = await router.createCaller({}).subscription('sub', 3);

    sub.on('data', (data: { input: number }) => {
      expect(data).toEqual({ input: 3 });
      expectTypeOf(data).toMatchTypeOf<{ input: number }>();
      done();
    });
    sub.start();
  });
});
