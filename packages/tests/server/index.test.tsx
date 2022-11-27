/* eslint-disable @typescript-eslint/no-empty-function */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { routerToServerAndClientNew, waitError } from './___testHelpers';
import { waitFor } from '@testing-library/react';
import {
  HTTPHeaders,
  TRPCClientError,
  createTRPCProxyClient,
  createWSClient,
  wsLink,
} from '@trpc/client/src';
import { httpBatchLink } from '@trpc/client/src';
import { Maybe, TRPCError, initTRPC } from '@trpc/server/src';
import { CreateHTTPContextOptions } from '@trpc/server/src/adapters/standalone';
import { observable } from '@trpc/server/src/observable';
import { expectTypeOf } from 'expect-type';
import { z } from 'zod';

test('smoke test', async () => {
  const t = initTRPC.create();
  const router = t.router({
    hello: t.procedure.query(() => 'world'),
  });
  const { close, proxy } = routerToServerAndClientNew(router);

  expect(await proxy.hello.query()).toBe('world');
  close();
});

test('mix query and mutation', async () => {
  type Context = {};
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
  type Context = {};
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

    const { close, proxy } = routerToServerAndClientNew(router);
    const err = await waitError(
      // @ts-expect-error - expected missing query
      proxy.notfound.query('notFound' as any),
      TRPCClientError,
    );
    expect(err.message).toMatchInlineSnapshot(
      `"No \\"query\\"-procedure on path \\"notfound\\""`,
    );
    expect(err.shape?.message).toMatchInlineSnapshot(
      `"No \\"query\\"-procedure on path \\"notfound\\""`,
    );
    close();
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

    const { close, proxy } = routerToServerAndClientNew(router);
    const err = await waitError(
      proxy.hello.query({ who: 123 as any }),
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
    const t = initTRPC.create();

    const router = t.router({
      q: t.procedure.query(() => {
        return { text: 'hello' };
      }),
      m: t.procedure.mutation(() => {
        return { text: 'hello' };
      }),
    });

    const { close, proxy } = routerToServerAndClientNew(router);

    await proxy.q.query();
    await proxy.q.query(undefined);
    await proxy.q.query(null as any); // treat null as undefined
    // ! This tests doesn't work
    // ! await expect(
    // !  proxy.q.query('not-nullish' as any),
    // ! ).rejects.toMatchInlineSnapshot(`[TRPCClientError: No input expected]`);

    await proxy.m.mutate();
    await proxy.m.mutate(undefined);
    await proxy.m.mutate(null as any); // treat null as undefined
    // ! This tests doesn't work
    // ! await expect(
    // !  proxy.m.mutate('not-nullish' as any),
    // ! ).rejects.toMatchInlineSnapshot(`[TRPCClientError: No input expected]`);

    close();
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

      const { close, proxy } = routerToServerAndClientNew(router);
      const res = await proxy.hello.query({ who: 'katt' });
      expectTypeOf(res.input).toMatchTypeOf<Input>();
      expectTypeOf(res.input).not.toBeAny();
      expectTypeOf(res).toMatchTypeOf<{ input: Input; text: string }>();

      expect(res.text).toEqual('hello katt');

      close();
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

      const { close, proxy } = routerToServerAndClientNew(router);
      const res = await proxy.postById.query(1);
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

      const t = initTRPC.context<Context>().create();

      const router = t.router({
        whoami: t.procedure.query(({ ctx }) => {
          if (!ctx.user) {
            throw new TRPCError({ code: 'UNAUTHORIZED' });
          }
          return ctx.user;
        }),
      });

      const { close, proxy } = routerToServerAndClientNew(router, {
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
        const err = await waitError(proxy.whoami.query(), TRPCClientError);
        expect(err.shape.message).toMatchInlineSnapshot(`"UNAUTHORIZED"`);
      }
      // auth, should work
      {
        headers.authorization = 'kattsecret';
        const res = await proxy.whoami.query();
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

      const { close, proxy } = routerToServerAndClientNew(router);
      {
        const res = await proxy.hello.query({ who: 'katt' });
        expectTypeOf(res.input).toMatchTypeOf<Input>();
        expectTypeOf(res.input).not.toBeAny();
      }
      {
        const res = await proxy.hello.query();
        expectTypeOf(res.input).toMatchTypeOf<Input>();
        expectTypeOf(res.input).not.toBeAny();
      }

      close();
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

      const { close, proxy } = routerToServerAndClientNew(router);
      const res = await proxy.hello.mutate({ who: 'katt' });
      expectTypeOf(res.input).toMatchTypeOf<Input>();
      expectTypeOf(res.input).not.toBeAny();
      expect(res.text).toBe('hello katt');
      close();
    });
  });
});

describe('createCaller()', () => {
  type Context = {};
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
  type Context = {};
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

  const { close, proxy, wssPort, router } =
    routerToServerAndClientNew(newRouter);
  expect(await proxy.undefined.mutate()).toMatchInlineSnapshot(`undefined`);
  expect(await proxy.null.mutate()).toMatchInlineSnapshot(`null`);

  const ws = createWSClient({
    url: `ws://localhost:${wssPort}`,
    WebSocket: WebSocket as any,
  });
  const wsClient = createTRPCProxyClient<typeof router>({
    links: [wsLink({ client: ws })],
  });

  expect(await wsClient.undefined.mutate()).toMatchInlineSnapshot(`undefined`);
  expect(await wsClient.null.mutate()).toMatchInlineSnapshot(`null`);
  ws.close();
  close();
});

// https://github.com/trpc/trpc/issues/559
describe('ObservableAbortError', () => {
  test('cancelling request should throw ObservableAbortError', async () => {
    const t = initTRPC.create();

    const router = t.router({
      slow: t.procedure.query(async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        return null;
      }),
    });

    const { close, proxy } = routerToServerAndClientNew(router);
    const onReject = jest.fn();
    const ac = new AbortController();
    const req = proxy.slow.query(undefined, {
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

    const { close, proxy } = routerToServerAndClientNew(router, {
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
    });
    const ac = new AbortController();
    const req1 = proxy.slow1.query(undefined, { signal: ac.signal });
    const req2 = proxy.slow2.query();
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
  const t = initTRPC.create();

  const router = t.router({
    q: t.procedure.input(z.string().optional()).query(({ input }) => {
      return { input };
    }),
  });

  const { close, proxy } = routerToServerAndClientNew(router, {
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
  });

  expect(await proxy.q.query('foo')).toMatchInlineSnapshot(`
Object {
  "input": "foo",
}
`);
  expect(await proxy.q.query()).toMatchInlineSnapshot(`Object {}`);
  close();
});
