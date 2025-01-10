/* eslint-disable @typescript-eslint/no-empty-function */
import { routerToServerAndClientNew } from './___testHelpers';
import { waitError } from '@trpc/server/__tests__/waitError';
import { waitFor } from '@testing-library/react';
import type { HTTPHeaders } from '@trpc/client';
import {
  createTRPCClient,
  createWSClient,
  httpBatchLink,
  TRPCClientError,
  wsLink,
} from '@trpc/client';
import { initTRPC, TRPCError } from '@trpc/server';
import type { CreateHTTPContextOptions } from '@trpc/server/adapters/standalone';
import { observable } from '@trpc/server/observable';
import type { Maybe } from '@trpc/server/unstable-core-do-not-import';
import { z } from 'zod';

test('smoke test', async () => {
  const t = initTRPC.create();
  const router = t.router({
    hello: t.procedure.query(() => 'world'),
  });
  const { close, client } = routerToServerAndClientNew(router);

  expect(await client.hello.query()).toBe('world');
  await close();
});

test('mix query and mutation', async () => {
  type Context = object;
  const t = initTRPC.context<Context>().create();

  const router = t.router({
    q1: t.procedure.query(() => 'q1res'),
    q2: t.procedure.input(z.object({ q2: z.string() })).query(() => 'q2res'),
    m1: t.procedure.mutation(() => 'm1res'),
  });

  const caller = router.createCaller({});
  expect(await caller.q1()).toMatchInlineSnapshot(`"q1res"`);

  expect(await caller.q2({ q2: 'hey' })).toMatchInlineSnapshot(`"q2res"`);

  expect(await caller.m1()).toMatchInlineSnapshot(`"m1res"`);
});

test('merge', async () => {
  type Context = object;
  const t = initTRPC.context<Context>().create();
  const mergeRouters = t.mergeRouters;

  const root = t.router({
    helloo: t.procedure.query(() => 'world'),
  });

  const posts = t.router({
    list: t.procedure.query(() => [{ text: 'initial' }]),
    create: t.procedure.input(z.string()).mutation(({ input }) => {
      return { text: input };
    }),
  });

  const router = mergeRouters(root, posts);
  const caller = router.createCaller({});
  expect(await caller.list()).toMatchInlineSnapshot(`
    Array [
      Object {
        "text": "initial",
      },
    ]
  `);
});

describe('integration tests', () => {
  test('not found procedure', async () => {
    const t = initTRPC.create();

    const router = t.router({
      hello: t.procedure
        .input(z.object({ who: z.string() }).nullish())
        .query(({ input }) => {
          return {
            text: `hello ${input?.who ?? 'world'}`,
          };
        }),
    });

    const { close, client } = routerToServerAndClientNew(router);
    const err = await waitError(
      // @ts-expect-error - expected missing query
      client.notfound.query('notFound' as any),
      TRPCClientError,
    );
    expect(err.message).toMatchInlineSnapshot(
      `"No procedure found on path "notfound""`,
    );
    expect(err.shape?.message).toMatchInlineSnapshot(
      `"No procedure found on path "notfound""`,
    );
    await close();
  });

  test('invalid input', async () => {
    const t = initTRPC.create();

    const router = t.router({
      hello: t.procedure
        .input(z.object({ who: z.string() }).nullish())
        .query(({ input }) => {
          expectTypeOf(input).toMatchTypeOf<Maybe<{ who: string }>>();
          return {
            text: `hello ${input?.who ?? 'world'}`,
          };
        }),
    });

    const { close, client } = routerToServerAndClientNew(router);
    const err = await waitError(
      client.hello.query({ who: 123 as any }),
      TRPCClientError,
    );
    expect(err.shape?.code).toMatchInlineSnapshot(`-32600`);
    expect(err.shape?.message).toMatchInlineSnapshot(`
      "[
        {
          "code": "invalid_type",
          "expected": "string",
          "received": "number",
          "path": [
            "who"
          ],
          "message": "Expected string, received number"
        }
      ]"
    `);
    await close();
  });

  test('passing input to input w/o input', async () => {
    const t = initTRPC.create();

    const snap = vi.fn();
    const router = t.router({
      q: t.procedure.query(({ input }) => {
        snap(input);
        return { text: 'hello' };
      }),
      m: t.procedure.mutation(({ input }) => {
        snap(input);
        return { text: 'hello' };
      }),
    });

    const { close, client } = routerToServerAndClientNew(router);

    await client.q.query();
    await client.q.query(undefined);
    await client.q.query(null as any); // treat null as undefined

    await client.q.query('not-nullish' as any);

    await client.m.mutate();
    await client.m.mutate(undefined);
    await client.m.mutate(null as any); // treat null as undefined

    await client.m.mutate('not-nullish' as any);

    expect(snap.mock.calls.every((call) => call[0] === undefined)).toBe(true);
    await close();
  });

  describe('type testing', () => {
    test('basic', async () => {
      type Input = { who: string };
      const t = initTRPC.create();

      const router = t.router({
        hello: t.procedure
          .input(z.object({ who: z.string() }))
          .query(({ input }) => {
            expectTypeOf(input).not.toBeAny();
            expectTypeOf(input).toMatchTypeOf<{ who: string }>();

            return {
              text: `hello ${input?.who ?? 'world'}`,
              input,
            };
          }),
      });

      const { close, client } = routerToServerAndClientNew(router);
      const res = await client.hello.query({ who: 'katt' });
      expectTypeOf(res.input).toMatchTypeOf<Input>();
      expectTypeOf(res.input).not.toBeAny();
      expectTypeOf(res).toMatchTypeOf<{ input: Input; text: string }>();

      expect(res.text).toEqual('hello katt');

      await close();
    });

    test('mixed response', async () => {
      const t = initTRPC.create();

      const router = t.router({
        postById: t.procedure.input(z.number()).query(({ input }) => {
          if (input === 1) {
            return {
              id: 1,
              title: 'helloo',
            };
          }
          if (input === 2) {
            return { id: 2, title: 'test' };
          }
          return null;
        }),
      });

      const { close, client } = routerToServerAndClientNew(router);
      const res = await client.postById.query(1);
      expectTypeOf(res).toMatchTypeOf<{ id: number; title: string } | null>();
      expect(res).toEqual({
        id: 1,
        title: 'helloo',
      });

      await close();
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

      const t = initTRPC.context<Context>().create();

      const router = t.router({
        whoami: t.procedure.query(({ ctx }) => {
          if (!ctx.user) {
            throw new TRPCError({ code: 'UNAUTHORIZED' });
          }
          return ctx.user;
        }),
      });

      const { close, client } = routerToServerAndClientNew(router, {
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
      });

      // no auth, should fail
      {
        const err = await waitError(client.whoami.query(), TRPCClientError);
        expect(err.shape.message).toMatchInlineSnapshot(`"UNAUTHORIZED"`);
      }
      // auth, should work
      {
        headers['authorization'] = 'kattsecret';
        const res = await client.whoami.query();
        expectTypeOf(res).toMatchTypeOf<{ id: number; name: string }>();
        expect(res).toEqual({
          id: 1,
          name: 'KATT',
        });
      }

      await close();
    });

    test('optional input', async () => {
      type Input = Maybe<{ who: string }>;
      const t = initTRPC.create();

      const router = t.router({
        hello: t.procedure
          .input(z.object({ who: z.string() }).nullish())
          .query(({ input }) => {
            expectTypeOf(input).not.toBeAny();
            expectTypeOf(input).toMatchTypeOf<Input>();

            return {
              text: `hello ${input?.who ?? 'world'}`,
              input,
            };
          }),
      });

      const { close, client } = routerToServerAndClientNew(router);
      {
        const res = await client.hello.query({ who: 'katt' });
        expectTypeOf(res.input).toMatchTypeOf<Input>();
        expectTypeOf(res.input).not.toBeAny();
      }
      {
        const res = await client.hello.query();
        expectTypeOf(res.input).toMatchTypeOf<Input>();
        expectTypeOf(res.input).not.toBeAny();
      }

      await close();
    });

    test('mutation', async () => {
      type Input = Maybe<{ who: string }>;
      const t = initTRPC.create();

      const router = t.router({
        hello: t.procedure
          .input(
            z
              .object({
                who: z.string(),
              })
              .nullish(),
          )
          .mutation(({ input }) => {
            expectTypeOf(input).not.toBeAny();
            expectTypeOf(input).toMatchTypeOf<Input>();

            return {
              text: `hello ${input?.who ?? 'world'}`,
              input,
            };
          }),
      });

      const { close, client } = routerToServerAndClientNew(router);
      const res = await client.hello.mutate({ who: 'katt' });
      expectTypeOf(res.input).toMatchTypeOf<Input>();
      expectTypeOf(res.input).not.toBeAny();
      expect(res.text).toBe('hello katt');
      await close();
    });
  });
});

describe('createCaller()', () => {
  type Context = object;
  const t = initTRPC.context<Context>().create();

  const router = t.router({
    q: t.procedure.input(z.number()).query(({ input }) => {
      return { input };
    }),
    m: t.procedure.input(z.number()).mutation(({ input }) => {
      return { input };
    }),
    sub: t.procedure.input(z.number()).subscription(({ input }) => {
      return observable<{ input: typeof input }>((emit) => {
        emit.next({ input });
        return () => {
          // noop
        };
      });
    }),
  });

  test('query()', async () => {
    const data = await router.createCaller({}).q(1);
    expectTypeOf(data).toMatchTypeOf<{ input: number }>();
    expect(data).toEqual({ input: 1 });
  });
  test('mutation()', async () => {
    const data = await router.createCaller({}).m(2);
    expectTypeOf(data).toMatchTypeOf<{ input: number }>();
    expect(data).toEqual({ input: 2 });
  });
  test('subscription()', async () => {
    const subObservable = await router.createCaller({}).sub(3);
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
  type Context = object;
  const t = initTRPC.context<Context>().create();

  const router = t.router({
    q: t.procedure.input(z.number()).query(({ input }) => {
      return { input };
    }),
    m: t.procedure.input(z.number()).mutation(({ input }) => {
      return { input };
    }),
    sub: t.procedure.input(z.number()).subscription(({ input }) => {
      return observable<{ input: typeof input }>((emit) => {
        emit.next({ input });
        return () => {
          // noop
        };
      });
    }),
  });

  test('query()', async () => {
    const data = await router.createCaller({}).q(1);
    expectTypeOf(data).toMatchTypeOf<{ input: number }>();
    expect(data).toEqual({ input: 1 });
  });
  test('mutation()', async () => {
    const data = await router.createCaller({}).m(2);
    expectTypeOf(data).toMatchTypeOf<{ input: number }>();
    expect(data).toEqual({ input: 2 });
  });
  test('subscription()', async () => {
    const subObservable = await router.createCaller({}).sub(3);
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
  const t = initTRPC.create();

  const newRouter = t.router({
    undefined: t.procedure.mutation(() => {}),
    null: t.procedure.mutation(() => null),
  });

  const { close, client, wssPort, router } =
    routerToServerAndClientNew(newRouter);
  expect(await client.undefined.mutate()).toMatchInlineSnapshot(`undefined`);
  expect(await client.null.mutate()).toMatchInlineSnapshot(`null`);

  const ws = createWSClient({
    url: `ws://localhost:${wssPort}`,
    WebSocket: WebSocket as any,
  });
  const wsClient = createTRPCClient<typeof router>({
    links: [wsLink({ client: ws })],
  });

  expect(await wsClient.undefined.mutate()).toMatchInlineSnapshot(`undefined`);
  expect(await wsClient.null.mutate()).toMatchInlineSnapshot(`null`);
  ws.close();
  await close();
});

// https://github.com/trpc/trpc/issues/559
describe('AbortError', () => {
  test('cancelling request should throw AbortError', async () => {
    const t = initTRPC.create();

    const router = t.router({
      slow: t.procedure.query(async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        return null;
      }),
    });

    const { close, client } = routerToServerAndClientNew(router);
    const onReject = vi.fn();
    const ac = new AbortController();
    const req = client.slow.query(undefined, {
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
    expect(err.cause?.name).toBe('AbortError');

    await close();
  });

  test('cancelling batch request should throw AbortError', async () => {
    // aborting _one_ batch request doesn't necessarily mean we cancel the reqs part of that batch
    const t = initTRPC.create();

    const router = t.router({
      slow1: t.procedure.query(async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        return 'slow1';
      }),
      slow2: t.procedure.query(async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        return 'slow2';
      }),
    });

    const { close, client } = routerToServerAndClientNew(router, {
      server: {},
      client({ httpUrl }) {
        return {
          links: [httpBatchLink({ url: httpUrl })],
        };
      },
    });
    const ac = new AbortController();
    const req1 = client.slow1.query(undefined, { signal: ac.signal });
    const req2 = client.slow2.query(undefined, { signal: ac.signal });

    ac.abort();
    const err = await waitError(Promise.all([req1, req2]), TRPCClientError);

    expect(err).toBeInstanceOf(TRPCClientError);
    expect(err.cause?.name).toBe('AbortError');

    await close();
  });
});

test('regression: JSON.stringify([undefined]) gives [null] causes wrong type to procedure input', async () => {
  const t = initTRPC.create();

  const router = t.router({
    q: t.procedure.input(z.string().optional()).query(({ input }) => {
      return { input };
    }),
  });

  const { close, client } = routerToServerAndClientNew(router, {
    client({ httpUrl }) {
      return {
        links: [httpBatchLink({ url: httpUrl })],
      };
    },
    server: {},
  });

  expect(await client.q.query('foo')).toMatchInlineSnapshot(`
    Object {
      "input": "foo",
    }
  `);
  expect(await client.q.query()).toMatchInlineSnapshot(`Object {}`);
  await close();
});

describe('apply()', () => {
  test('query without input', async () => {
    const t = initTRPC.create();
    const router = t.router({
      hello: t.procedure.query(() => 'world'),
    });
    const { close, client } = routerToServerAndClientNew(router);
    expect(await client.hello.query.apply(undefined)).toBe('world');
    await close();
  });

  test('query with input', async () => {
    const t = initTRPC.create();
    const router = t.router({
      helloinput: t.procedure
        .input(z.string())
        .query(({ input }) => `hello ${input}`),
    });
    const { close, client } = routerToServerAndClientNew(router);
    expect(await client.helloinput.query.apply(undefined, ['world'])).toBe(
      'hello world',
    );
    await close();
  });
});

describe('call()', () => {
  test('query without input', async () => {
    const t = initTRPC.create();
    const router = t.router({
      hello: t.procedure.query(() => 'world'),
    });
    const { close, client } = routerToServerAndClientNew(router);
    expect(await client.hello.query.call(this)).toBe('world');
    await close();
  });

  test('query with input', async () => {
    const t = initTRPC.create();
    const router = t.router({
      helloinput: t.procedure
        .input(z.string())
        .query(({ input }) => `hello ${input}`),
    });
    const { close, client } = routerToServerAndClientNew(router);
    expect(await client.helloinput.query.call(this, 'world')).toBe(
      'hello world',
    );
    await close();
  });

  test('query with object input', async () => {
    const t = initTRPC.create();
    const router = t.router({
      helloinput: t.procedure
        .input(z.object({ text: z.string() }))
        .query(({ input }) => `hello ${input.text}`),
    });
    const { close, client } = routerToServerAndClientNew(router);
    expect(await client.helloinput.query.call(this, { text: 'world' })).toBe(
      'hello world',
    );
    await close();
  });

  test('query with array input', async () => {
    const t = initTRPC.create();
    const router = t.router({
      helloinput: t.procedure
        .input(z.string().array())
        .query(({ input }) => `hello ${input.join(' ')}`),
    });
    const { close, client } = routerToServerAndClientNew(router);
    expect(await client.helloinput.query.call(this, ['world'])).toBe(
      'hello world',
    );
    await close();
  });
});
