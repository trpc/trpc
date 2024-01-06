import { initTRPC, TRPCError } from '@trpc/server';

test('context union type is inferred correctly', async () => {
  type UnsetContext = { user: null; session: null };
  type SetContext = {
    user: {
      id: string;
      name: string;
    };
    session: {
      id: string;
      state: string;
    };
  };
  type ContextUnion = SetContext | UnsetContext;

  const t = initTRPC.context<ContextUnion>().create();

  const baseProcedure = t.procedure
    // This line was causing the union to be simplified away
    // Bug was due to Overwrite mapping away the union
    // Resolved by "distributing over the union members": https://stackoverflow.com/a/51691257
    .use(async ({ ctx, next }) => {
      expectTypeOf<ContextUnion>(ctx);

      return await next();
    });

  const protectedProcedure = baseProcedure.use(({ next, ctx }) => {
    expectTypeOf<ContextUnion>(ctx);

    // we narrow the type of `user` and `session` by throwing when either are null
    if (!ctx.user || !ctx.session) {
      expectTypeOf<UnsetContext>(ctx);

      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'not signed in' });
    }

    expectTypeOf<SetContext>(ctx);

    return next({ ctx });
  });

  protectedProcedure.use(async ({ next, ctx }) => {
    // Should be definitely defined
    ctx.user.id;
    ctx.session.id;

    expectTypeOf<SetContext>(ctx);

    return next({
      ctx: {
        ...ctx,
      },
    });
  });
});
