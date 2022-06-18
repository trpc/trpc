import { expectTypeOf } from 'expect-type';
import { TRPCError, initTRPC } from '../src';

test('decorate independently', () => {
  type User = {
    id: string;
    name: string;
  };
  type Context = {
    user: User | null;
  };
  const t = initTRPC<{
    ctx: Context;
  }>()();

  const isAuthed = t.middleware(({ next, ctx }) => {
    if (!ctx.user) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
      });
    }
    return next({
      ctx: {
        user: ctx.user,
      },
    });
  });

  const addService = t.middleware(({ next, ctx }) => {
    if (!ctx.user) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
      });
    }
    return next({
      ctx: {
        doSomething: () => {
          return 'very cool service';
        },
      },
    });
  });

  const proc1 = t.procedure.use(isAuthed);
  const proc2 = t.procedure.use(addService);

  // TODO FIXME
  t.procedure
    .concat(proc1)
    .concat(proc2)
    .resolve(({ ctx }) => {
      expectTypeOf(ctx.doSomething).toMatchTypeOf<() => string>();
      // expectTypeOf(ctx.user).toMatchTypeOf<User>();
    });
});
