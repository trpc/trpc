import { legacyRouterToServerAndClient } from './__legacyRouterToServerAndClient';
import { HTTPHeaders, httpBatchLink } from '@trpc/client/src';
import { TRPCError, inferProcedureOutput } from '@trpc/server/src';
import * as trpc from '@trpc/server/src';
import { MiddlewareResult } from '@trpc/server/src/deprecated/internals/middlewares';
import { AsyncLocalStorage } from 'async_hooks';
import { expectTypeOf } from 'expect-type';
import { z } from 'zod';

test('is called if def first', async () => {
  const middleware = vi.fn((opts) => {
    return opts.next();
  });
  const { client, close } = legacyRouterToServerAndClient(
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

  const calls = middleware.mock.calls;
  expect(await client.query('foo1')).toBe('bar1');
  expect(calls[0]![0]!).toHaveProperty('type');
  expect(calls[0]![0]!).toHaveProperty('ctx');
  expect(calls[0]![0]!.type).toBe('query');
  expect(middleware).toHaveBeenCalledTimes(1);

  expect(await client.mutation('foo2')).toBe('bar2');
  expect(calls[1]![0]!.type).toBe('mutation');

  expect(middleware).toHaveBeenCalledTimes(2);
  await close();
});

test('is not called if def last', async () => {
  const middleware = vi.fn();
  const { client, close } = legacyRouterToServerAndClient(
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
  await close();
});

test('receives rawInput as param', async () => {
  const inputSchema = z.object({ userId: z.string() });
  const middleware = vi.fn((opts) => {
    const result = inputSchema.safeParse(opts.rawInput);
    if (!result.success) throw new TRPCError({ code: 'BAD_REQUEST' });
    const { userId } = result.data;
    // Check user id auth
    return opts.next({ ctx: { userId } });
  });

  const { client, close } = legacyRouterToServerAndClient(
    trpc
      .router()
      .middleware(middleware)
      .query('userId', {
        input: inputSchema,
        resolve({ ctx }) {
          return (ctx as any).userId;
        },
      }),
  );

  const calls = middleware.mock.calls;

  expect(await client.query('userId', { userId: 'ABCD' })).toBe('ABCD');
  expect(calls[0]![0]!).toHaveProperty('type');
  expect(calls[0]![0]!).toHaveProperty('ctx');
  expect(calls[0]![0]!.type).toBe('query');
  expect(calls[0]![0]!.rawInput).toStrictEqual({ userId: 'ABCD' });

  await expect(client.query('userId', { userId: 123 as any })).rejects.toThrow(
    'BAD_REQUEST',
  );

  expect(middleware).toHaveBeenCalledTimes(2);
  await close();
});

test('allows you to throw an error (e.g. auth)', async () => {
  type Context = {
    user?: {
      id: number;
      name: string;
      isAdmin: boolean;
    };
  };
  const resolverMock = vi.fn();

  const headers: HTTPHeaders = {};

  const { client, close } = legacyRouterToServerAndClient(
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
      client({ httpUrl }) {
        return {
          links: [httpBatchLink({ url: httpUrl, headers })],
        };
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
  await close();
});

test('child routers + hook call order', async () => {
  const middlewareInParent = vi.fn((opts) => {
    return opts.next();
  });
  const middlewareInChild = vi.fn((opts) => {
    return opts.next();
  });
  const middlewareInGrandChild = vi.fn((opts) => {
    return opts.next();
  });
  const { client, close } = legacyRouterToServerAndClient(
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
    middlewareInChild.mock.invocationCallOrder[0]!,
  );
  expect(middlewareInChild.mock.invocationCallOrder[0]!).toBeLessThan(
    middlewareInGrandChild.mock.invocationCallOrder[0]!,
  );

  expect(await client.query('name')).toBe('Child');
  expect(await client.query('child.name')).toBe('Child');
  expect(await client.query('child.child.name')).toBe('GrandChild');

  await close();
});

test('not returning next result is an error at compile-time', async () => {
  const { client, close } = legacyRouterToServerAndClient(
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

  await close();
});

test('async hooks', async () => {
  const storage = new AsyncLocalStorage<{ requestId: number }>();
  let requestCount = 0;
  const log = vi.fn();
  const { client, close } = legacyRouterToServerAndClient(
    trpc
      .router()
      .middleware((opts) => {
        return new Promise<MiddlewareResult<any>>((resolve, reject) => {
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

  await close();
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
  const logMock = vi.fn();
  const { client, close } = legacyRouterToServerAndClient(
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

  const calls = logMock.mock.calls.map((args) => {
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
  await close();
});

test('middleware throwing should return a union', async () => {
  class CustomError extends Error {
    constructor(msg: string) {
      super(msg);
      Object.setPrototypeOf(this, CustomError.prototype);
    }
  }
  const fn = vi.fn((res: MiddlewareResult<unknown>) => {
    return res;
  });
  const { client, close } = legacyRouterToServerAndClient(
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
  const res = fn.mock.calls[0]![0]!;

  if (res.ok) {
    throw new Error('wrong state');
  }
  delete res.error.stack;
  expect(res.error).toMatchInlineSnapshot(`[TRPCError: error]`);
  const cause = res.error.cause as CustomError;
  expect(cause).toBeInstanceOf(CustomError);

  await close();
});

test('omitting ctx in next() does not affect the actual ctx', async () => {
  type User = {
    id: string;
  };
  type OriginalContext = {
    maybeUser?: User;
  };
  const { client, close } = legacyRouterToServerAndClient(
    trpc
      .router<OriginalContext>()
      .middleware(async function firstMiddleware({ next }) {
        return next();
      })
      .query('test', {
        resolve({ ctx }) {
          expectTypeOf(ctx).toEqualTypeOf<OriginalContext>();
          return ctx.maybeUser?.id;
        },
      }),
    {
      server: {
        createContext() {
          return {
            maybeUser: {
              id: 'alexdotjs',
            },
          };
        },
      },
    },
  );

  expect(await client.query('test')).toMatchInlineSnapshot(`"alexdotjs"`);

  await close();
});

test('omitting ctx in next() does not affect a previous middleware', async () => {
  type User = {
    id: string;
  };
  type OriginalContext = {
    maybeUser?: User;
  };
  const { client, close } = legacyRouterToServerAndClient(
    trpc
      .router<OriginalContext>()
      .middleware(({ ctx, next }) => {
        if (!ctx.maybeUser) {
          throw new Error('No user');
        }
        return next({
          ctx: {
            ...ctx,
            user: ctx.maybeUser,
          },
        });
      })
      .middleware(async function firstMiddleware({ next }) {
        return next();
      })
      .query('test', {
        resolve({ ctx }) {
          expectTypeOf(ctx).toEqualTypeOf<
            OriginalContext & {
              user: User;
            }
          >();
          return ctx.user.id;
        },
      }),
    {
      server: {
        createContext() {
          return {
            maybeUser: {
              id: 'alexdotjs',
            },
          };
        },
      },
    },
  );

  expect(await client.query('test')).toMatchInlineSnapshot(`"alexdotjs"`);

  await close();
});

test('mutate context in middleware', async () => {
  type User = {
    id: string;
  };
  type OriginalContext = {
    maybeUser?: User;
  };
  const { client, close } = legacyRouterToServerAndClient(
    trpc
      .router<OriginalContext>()
      .middleware(async function firstMiddleware({ next }) {
        return next();
      })
      .query('isAuthorized', {
        resolve({ ctx }) {
          return Boolean(ctx.maybeUser);
        },
      })
      .middleware(async function secondMiddleware({ next, ctx }) {
        if (!ctx.maybeUser) {
          throw new TRPCError({ code: 'UNAUTHORIZED' });
        }
        const newContext = {
          user: ctx.maybeUser,
        };
        const result = await next({ ctx: newContext });
        return result;
      })
      .middleware(async function thirdMiddleware({ next, ctx }) {
        return next({
          ctx: {
            ...ctx,
            email: ctx.user.id.includes('@'),
          },
        });
      })
      .query('test', {
        resolve({ ctx }) {
          // should have asserted that `ctx.user` is not nullable
          expectTypeOf(ctx).toEqualTypeOf<{ user: User; email: boolean }>();
          return `id: ${ctx.user.id}, email: ${ctx.email}`;
        },
      }),
    {
      server: {
        createContext() {
          return {
            maybeUser: {
              id: 'alexdotjs',
            },
          };
        },
      },
    },
  );

  expect(await client.query('isAuthorized')).toBe(true);
  expect(await client.query('test')).toMatchInlineSnapshot(
    `"id: alexdotjs, email: false"`,
  );

  await close();
});

test('mutate context and combine with other routes', async () => {
  type User = {
    id: number;
  };
  type Context = {
    maybeUser?: User;
  };
  function createRouter() {
    return trpc.router<Context>();
  }

  const authorizedRouter = createRouter()
    .middleware(({ ctx, next }) => {
      if (!ctx.maybeUser) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }
      return next({
        ctx: {
          user: ctx.maybeUser,
        },
      });
    })
    .query('me', {
      resolve({ ctx }) {
        return ctx.user;
      },
    });

  const appRouter = createRouter()
    .merge('authed.', authorizedRouter)
    .query('someQuery', {
      resolve({ ctx }) {
        expectTypeOf(ctx).toMatchTypeOf<Context>();
      },
    })
    .interop();

  type AppRouter = typeof appRouter;

  type MeResponse = inferProcedureOutput<
    AppRouter['_def']['queries']['authed.me']
  >;

  expectTypeOf<MeResponse>().toMatchTypeOf<User>();
});
