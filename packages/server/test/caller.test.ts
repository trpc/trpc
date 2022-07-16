import { expectTypeOf } from 'expect-type';
import { z } from 'zod';
import { TRPCError, initTRPC } from '../src';
import { createCaller } from '../src/core/internals/caller';

const t = initTRPC<{
  ctx: {
    foo?: 'bar';
  };
}>()();

const { procedure } = t;

test('undefined input query', async () => {
  const router = t.router({
    hello: procedure.query(() => 'world'),
  });

  const caller = createCaller(router);
  const result = await caller.hello({
    ctx: {},
  });

  expectTypeOf<string>(result);
});

test('input query', async () => {
  const router = t.router({
    greeting: t.procedure
      .input(z.object({ name: z.string() }))
      .query(({ input }) => `Hello ${input.name}`),
  });

  const caller = createCaller(router);
  const result = await caller.greeting({
    input: { name: 'Sachin' },
    ctx: {},
  });

  expectTypeOf<string>(result);
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

  const caller = createCaller(router);
  await caller.post.delete({
    input: 0,
    ctx: {},
  });

  expect(posts).toStrictEqual(['Two', 'Three']);
});

test('context with middleware', async () => {
  const isAuthed = t.middleware(({ next, ctx }) => {
    if (!ctx.foo) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
      });
    }

    return next();
  });

  const protectedProcedure = t.procedure.use(isAuthed);

  const router = t.router({
    secret: protectedProcedure.query(({ ctx }) => ctx.foo),
  });

  const caller = createCaller(router);
  expect(caller.secret({ ctx: {} })).rejects.toThrow(TRPCError);

  const result = await caller.secret({ ctx: { foo: 'bar' } });
  expect(result).toBe('bar');
});
