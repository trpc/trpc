import { waitError } from './___testHelpers';
import { expectTypeOf } from 'expect-type';
import { z } from 'zod';
import { TRPCError, initTRPC } from '../src';

const t = initTRPC
  .context<{
    foo?: 'bar';
  }>()
  .create();

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

test('context with middleware', async () => {
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
    secret: protectedProcedure.query(({ ctx }) => ctx.foo),
  });

  const caller = router.createCaller({});
  const error = await waitError(caller.secret(), TRPCError);
  expect(error.code).toBe('UNAUTHORIZED');
  expect(error.message).toBe('You are not authorized');

  const authorizedCaller = router.createCaller({ foo: 'bar' });
  const result = await authorizedCaller.secret();
  expect(result).toBe('bar');
});
