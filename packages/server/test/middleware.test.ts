/* eslint-disable @typescript-eslint/no-unused-vars */
import { AsyncLocalStorage } from 'async_hooks';
import * as trpc from '../src';
import { TRPCError } from '../src';
import { MiddlewareResult } from '../src/internals/middlewares';
import { routerToServerAndClient } from './_testHelpers';

test('is called if def first', async () => {
  const middleware = jest.fn((opts) => {
    return opts.next();
  });
  const { client, close } = routerToServerAndClient(
    trpc
      .router()
      .middleware(middleware)
      .query('foo1', {
        resolve() {
          return 'bar1';
        },
      })
      .mutation('foo2', {
        resolve() {
          return 'bar2';
        },
      }),
  );

  expect(await client.query('foo1')).toBe('bar1');
  const calls = middleware.mock.calls;
  expect(calls[0][0]).toHaveProperty('type');
  expect(calls[0][0]).toHaveProperty('ctx');
  expect(calls[0][0].type).toBe('query');
  expect(await client.mutation('foo2')).toBe('bar2');
  expect(calls[1][0].type).toBe('mutation');

  expect(middleware).toHaveBeenCalledTimes(2);
  close();
});

test('is not called if def last', async () => {
  const middleware = jest.fn();
  const { client, close } = routerToServerAndClient(
    trpc
      .router()
      .query('foo', {
        resolve() {
          return 'bar';
        },
      })
      .middleware(middleware),
  );

  expect(await client.query('foo')).toBe('bar');
  expect(middleware).toHaveBeenCalledTimes(0);
  close();
});

test('allows you to throw an error (e.g. auth)', async () => {
  type Context = {
    user?: {
      id: number;
      name: string;
      isAdmin: boolean;
    };
  };
  const resolverMock = jest.fn();

  const headers: Record<string, string | undefined> = {};

  const { client, close } = routerToServerAndClient(
    trpc
      .router<Context>()
      .query('foo', {
        resolve() {
          return 'bar';
        },
      })
      .merge(
        'admin.',
        trpc
          .router<Context>()
          .middleware(({ ctx, next }) => {
            if (!ctx.user?.isAdmin) {
              throw new TRPCError({ code: 'UNAUTHORIZED' });
            }
            return next();
          })
          .query('secretPlace', {
            resolve() {
              resolverMock();

              return 'a key';
            },
          }),
      ),
    {
      server: {
        createContext({ req }) {
          if (req.headers.authorization === 'meow') {
            return {
              user: {
                id: 1,
                name: 'KATT',
                isAdmin: true,
              },
            };
          }
          return {};
        },
      },
      client: {
        headers,
      },
    },
  );

  expect(await client.query('foo')).toBe('bar');
  await expect(client.query('admin.secretPlace')).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: UNAUTHORIZED]`,
  );
  expect(resolverMock).toHaveBeenCalledTimes(0);
  headers.authorization = 'meow';
  expect(await client.query('admin.secretPlace')).toBe('a key');
  expect(resolverMock).toHaveBeenCalledTimes(1);
  close();
});

test('child routers + hook call order', async () => {
  const middlewareInParent = jest.fn((opts) => {
    return opts.next();
  });
  const middlewareInChild = jest.fn((opts) => {
    return opts.next();
  });
  const middlewareInGrandChild = jest.fn((opts) => {
    return opts.next();
  });
  const { client, close } = routerToServerAndClient(
    trpc
      .router()
      .middleware(middlewareInParent)
      .query('name', {
        resolve() {
          return 'Child';
        },
      })
      .merge(
        'child.',
        trpc
          .router()
          .middleware(middlewareInChild)
          .query('name', {
            resolve() {
              return 'Child';
            },
          })
          .merge(
            'child.',
            trpc
              .router()
              .middleware(middlewareInGrandChild)
              .query('name', {
                resolve() {
                  return 'GrandChild';
                },
              }),
          ),
      ),
  );

  expect(await client.query('child.child.name')).toBe('GrandChild');
  expect(middlewareInParent).toHaveBeenCalledTimes(1);
  expect(middlewareInChild).toHaveBeenCalledTimes(1);
  expect(middlewareInGrandChild).toHaveBeenCalledTimes(1);

  // check call order
  expect(middlewareInParent.mock.invocationCallOrder[0]).toBeLessThan(
    middlewareInChild.mock.invocationCallOrder[0],
  );
  expect(middlewareInChild.mock.invocationCallOrder[0]).toBeLessThan(
    middlewareInGrandChild.mock.invocationCallOrder[0],
  );

  expect(await client.query('name')).toBe('Child');
  expect(await client.query('child.name')).toBe('Child');
  expect(await client.query('child.child.name')).toBe('GrandChild');

  close();
});

test('not returning next result is an error at compile-time', async () => {
  const { client, close } = routerToServerAndClient(
    trpc
      .router()
      // @ts-expect-error Compiler makes sure we actually return the `next()` result.
      .middleware(async ({ next }) => {
        await next();
      })
      .query('helloQuery', {
        async resolve() {
          return 'hello';
        },
      }),
  );

  await expect(client.query('helloQuery')).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: No result from middlewares - did you forget to \`return next()\`?]`,
  );

  close();
});

test('async hooks', async () => {
  const storage = new AsyncLocalStorage<{ requestId: number }>();
  let requestCount = 0;
  const log = jest.fn();
  const { client, close } = routerToServerAndClient(
    trpc
      .router()
      .middleware((opts) => {
        return new Promise((resolve, reject) => {
          storage.run({ requestId: ++requestCount }, async () => {
            opts.next().then(resolve, reject);
          });
        });
      })
      .query('foo', {
        input: String,
        resolve({ input }) {
          // We can now call `.getStore()` arbitrarily deep in the call stack, without having to explicitly pass context
          const ambientRequestInfo = storage.getStore();
          log({ input, requestId: ambientRequestInfo?.requestId });
          return 'bar ' + input;
        },
      }),
  );

  expect(await client.query('foo', 'one')).toBe('bar one');
  expect(await client.query('foo', 'two')).toBe('bar two');

  expect(log).toHaveBeenCalledTimes(2);
  expect(log).toHaveBeenCalledWith({ input: 'one', requestId: 1 });
  expect(log).toHaveBeenCalledWith({ input: 'two', requestId: 2 });

  close();
});

test('equiv', () => {
  type Context = {
    user?: {
      id: number;
      name: string;
      isAdmin: boolean;
    };
  };
  trpc
    .router<Context>()
    .query('foo', {
      resolve() {
        return 'bar';
      },
    })
    .merge(
      'admin.',
      trpc
        .router<Context>()
        .middleware(({ ctx, next }) => {
          if (!ctx.user?.isAdmin) {
            throw new TRPCError({ code: 'UNAUTHORIZED' });
          }
          return next();
        })
        .query('secretPlace', {
          resolve() {
            return 'a key';
          },
        }),
    );

  trpc
    .router<Context>()
    .query('foo', {
      resolve() {
        return 'bar';
      },
    })
    .merge(
      trpc
        .router<Context>()
        .middleware(({ ctx, next }) => {
          if (!ctx.user?.isAdmin) {
            throw new TRPCError({ code: 'UNAUTHORIZED' });
          }
          return next();
        })
        .query('admin.secretPlace', {
          resolve() {
            return 'a key';
          },
        }),
    );
});

test('measure time middleware', async () => {
  let durationMs = -1;
  const logMock = jest.fn();
  const { client, close } = routerToServerAndClient(
    trpc
      .router()
      .middleware(async ({ next, path, type }) => {
        const start = Date.now();
        const result = await next();
        durationMs = Date.now() - start;
        result.ok
          ? logMock('OK request timing:', { path, type, durationMs })
          : logMock('Non-OK request timing', { path, type, durationMs });

        return result;
      })
      .query('greeting', {
        async resolve() {
          return 'hello';
        },
      }),
  );

  expect(await client.query('greeting')).toBe('hello');
  expect(durationMs > -1).toBeTruthy();

  const calls = (logMock.mock.calls as any[]).map((args) => {
    // omit durationMs as it's variable
    const [str, { durationMs, ...opts }] = args;
    return [str, opts];
  });
  expect(calls).toMatchInlineSnapshot(`
Array [
  Array [
    "OK request timing:",
    Object {
      "path": "greeting",
      "type": "query",
    },
  ],
]
`);
  close();
});

test('middleware throwing should return a union', async () => {
  class CustomError extends Error {
    constructor(msg: string) {
      super(msg);
      Object.setPrototypeOf(this, CustomError.prototype);
    }
  }
  const fn = jest.fn((res: MiddlewareResult) => {
    return res;
  });
  const { client, close } = routerToServerAndClient(
    trpc
      .router()
      .middleware(async function firstMiddleware({ next }) {
        const result = await next();
        fn(result);
        return result;
      })
      .middleware(async function middlewareThatThrows() {
        throw new CustomError('error');
      })
      .query('test', {
        resolve() {
          return 'test';
        },
      }),
  );

  try {
    await client.query('test');
  } catch {}
  expect(fn).toHaveBeenCalledTimes(1);
  const res = fn.mock.calls[0][0];

  if (res.ok) {
    throw new Error('wrong state');
  }
  delete res.error.stack;
  expect(res.error).toMatchInlineSnapshot(`[TRPCError: error]`);
  const originalError = res.error.originalError as CustomError;
  expect(originalError).toBeInstanceOf(CustomError);

  close();
});
