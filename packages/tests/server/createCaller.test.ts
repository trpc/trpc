import { ignoreErrors } from '@trpc/server/__tests__/suppressLogs';
import { waitError } from '@trpc/server/__tests__/waitError';
import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';

describe('with context', () => {
  const t = initTRPC.context<{ foo: 'foo' }>().create();

  const appRouter = t.router({
    hello: t.procedure
      .input(
        z.object({
          who: z.string(),
        }),
      )
      .query((opts) => `hello ${opts.input.who}` as const),
  });

  const createCaller = t.createCallerFactory(appRouter);

  test('happy path', async () => {
    const caller = createCaller({
      foo: 'foo',
    });

    expect(await caller.hello({ who: 'world' })).toEqual('hello world');
  });

  test('context mismatch', async () => {
    const anotherRouter = initTRPC
      .context<{ moo: 'moo' }>()
      .create()
      .router({
        hello: t.procedure
          .input(
            z.object({
              who: z.string(),
            }),
          )
          .query((opts) => `hello ${opts.input.who}` as const),
      });

    ignoreErrors(() => {
      // @ts-expect-error wrong context
      t.createCallerFactory(anotherRouter);
    });
  });
});
describe('with async context', () => {
  /**
   * Test helper that simulates creating an async context object
   * for server-side caller usage.
   */
  const createContext = async () => {
    return {
      userId: '1',
    };
  };
  const t = initTRPC.context<typeof createContext>().create();

  const appRouter = t.router({
    hello: t.procedure
      .input(
        z.object({
          who: z.string(),
        }),
      )
      .query((opts) => `hello ${opts.input.who} - ${opts.ctx.userId}` as const),
  });

  const createCaller = t.createCallerFactory(appRouter);

  test('ugly RSC caller requires nested awaits', async () => {
    const trpc = async () => createCaller(await createContext());

    const hello = await (await trpc()).hello({ who: 'world' });
    expect(hello).toEqual('hello world - 1');
    expectTypeOf<`hello ${string} - ${string}`>(hello);
  });

  test('nicer RSC caller by passing fn', async () => {
    const trpc = createCaller(createContext);

    const hello = await trpc.hello({ who: 'world' });
    expect(hello).toEqual('hello world - 1');
    expectTypeOf<`hello ${string} - ${string}`>(hello);
  });

  test('mismatching return type', async () => {
    /**
     * Intentionally invalid context creator used to assert
     * type-safety of the caller factory.
     */
    const badCreateContext = async () => 'foo' as const;
    // @ts-expect-error - Type '() => Promise<"foo">' is not assignable to type '() => Promise<{ userId: string; }>'.
    createCaller(badCreateContext);
  });
});
test('docs', async () => {
  type Context = {
    foo: string;
  };

  const t = initTRPC.context<Context>().create();

  const publicProcedure = t.procedure;
  const { createCallerFactory, router } = t;

  interface Post {
    id: string;
    title: string;
  }
  const posts: Post[] = [
    {
      id: '1',
      title: 'Hello world',
    },
  ];
  const appRouter = router({
    post: router({
      add: publicProcedure
        .input(
          z.object({
            title: z.string().min(2),
          }),
        )
        .mutation((opts) => {
          const post: Post = {
            ...opts.input,
            id: `${Math.random()}`,
          };
          posts.push(post);
          return post;
        }),
      list: publicProcedure.query(() => posts),
    }),
  });

  // create a caller-function for your router
  const createCaller = createCallerFactory(appRouter);

  // create a caller for
  const caller = createCaller({
    // the input here is your `Context`
    foo: 'bar',
  });
  const addedPost = await caller.post.add({
    title: 'How to make server-side call in tRPC',
  });
  //     ^?

  const postList = await caller.post.list();
  //       ^?

  expect(postList).toHaveLength(2);
});

type Context = {
  foo?: 'bar';
};
const t = initTRPC.context<Context>().create();

const { procedure } = t;

test('undefined input query', async () => {
  const router = t.router({
    hello: procedure.query(() => 'world'),
  });

  const caller = router.createCaller({});
  const result = await caller.hello();

  expectTypeOf<string>(result);
});

test('input query', async () => {
  const router = t.router({
    greeting: t.procedure
      .input(z.object({ name: z.string() }))
      .query(({ input }) => `Hello ${input.name}`),
  });

  const caller = router.createCaller({});
  const result = await caller.greeting({ name: 'Sachin' });

  expectTypeOf<string>(result);
});

test('caller exposes query/mutate/subscribe entrypoints', async () => {
  const onDelete = vi.fn();
  const router = t.router({
    greeting: t.procedure.query(() => 'hi'),
    post: t.procedure.input(z.number()).mutation(({ input }) => input + 1),
    onDelete: t.procedure.subscription(onDelete),
  });

  const caller = router.createCaller({});
  expect(await caller.greeting.query()).toBe('hi');
  expect(await caller.post.mutate(41)).toBe(42);
  await caller.onDelete.subscribe();
  expect(onDelete).toHaveBeenCalledTimes(1);
});

test('caller call type must match procedure type', async () => {
  const router = t.router({
    greeting: t.procedure.query(() => 'hi'),
    createPost: t.procedure.input(z.string()).mutation((opts) => opts.input),
  });

  const caller = router.createCaller({});

  // Test calling .mutate() on a query procedure
  const err1 = await waitError((caller.greeting as any).mutate(), TRPCError);
  expect(err1.code).toBe('METHOD_NOT_SUPPORTED');

  // Test calling .query() on a mutation procedure
  const err2 = await waitError(
    (caller.createPost as any).query('test'),
    TRPCError,
  );
  expect(err2.code).toBe('METHOD_NOT_SUPPORTED');

  // Test calling .subscribe() on a query procedure
  const err3 = await waitError((caller.greeting as any).subscribe(), TRPCError);
  expect(err3.code).toBe('METHOD_NOT_SUPPORTED');

  // Test calling .subscribe() on a mutation procedure
  const err4 = await waitError(
    (caller.createPost as any).subscribe('test'),
    TRPCError,
  );
  expect(err4.code).toBe('METHOD_NOT_SUPPORTED');
});

test('input mutation', async () => {
  const posts = ['One', 'Two', 'Three'];

  const router = t.router({
    post: t.router({
      delete: t.procedure.input(z.number()).mutation(({ input }) => {
        posts.splice(input, 1);
      }),
    }),
  });

  const caller = router.createCaller({});
  await caller.post.delete(0);

  expect(posts).toStrictEqual(['Two', 'Three']);
});

test('input subscription', async () => {
  const onDelete = vi.fn();
  const router = t.router({
    onDelete: t.procedure.subscription(onDelete),
  });

  const caller = router.createCaller({});
  await caller.onDelete();

  expect(onDelete).toHaveBeenCalledTimes(1);
});

test('context with middleware', async () => {
  /**
   * Simple auth middleware used to ensure that the caller
   * respects context-based authorization logic.
   */
  const isAuthed = t.middleware(({ next, ctx }) => {
    if (!ctx.foo) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'You are not authorized',
      });
    }

    return next();
  });

  const protectedProcedure = t.procedure.use(isAuthed);

  const router = t.router({
    secret: protectedProcedure.query((opts) => opts.ctx.foo),
  });

  const caller = router.createCaller({});
  const error = await waitError(caller.secret(), TRPCError);
  expect(error.code).toBe('UNAUTHORIZED');
  expect(error.message).toBe('You are not authorized');

  const authorizedCaller = router.createCaller({ foo: 'bar' });
  const result = await authorizedCaller.secret();
  expect(result).toBe('bar');
});

describe('onError handler', () => {
  const router = t.router({
    thrower: t.procedure.query(() => {
      throw new Error('error');
    }),
  });

  const ctx: Context = {
    foo: 'bar',
  };

  test('should call the onError handler when an error is thrown, rethrowing the error afterwards', async () => {
    const callerHandler = vi.fn();
    const caller = t.createCallerFactory(router)(ctx, {
      onError: callerHandler,
    });
    await expect(caller.thrower()).rejects.toThrow('error');

    expect(callerHandler).toHaveBeenCalledOnce();
    expect(callerHandler.mock.calls[0]?.[0]).toMatchInlineSnapshot(`
      Object {
        "ctx": Object {
          "foo": "bar",
        },
        "error": [TRPCError: error],
        "input": undefined,
        "path": "thrower",
        "type": "query",
      }
    `);
  });

  test('rethrow errors', async () => {
    const caller = t.createCallerFactory(router)(ctx, {
      onError: () => {
        throw new Error('custom error');
      },
    });

    const err = await waitError(caller.thrower());

    expect(err.message).toBe('custom error');
  });

  test('rethrow errors with createCaller()', async () => {
    const caller = router.createCaller(ctx, {
      onError: () => {
        throw new Error('custom error');
      },
    });

    const err = await waitError(caller.thrower());

    expect(err.message).toBe('custom error');
  });
});
