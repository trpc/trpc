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
    .use(async (opts) => {
      expectTypeOf<ContextUnion>(opts.ctx);

      return await opts.next();
    });

  const protectedProcedure = baseProcedure.use((opts) => {
    expectTypeOf<ContextUnion>(opts.ctx);

    // we narrow the type of `user` and `session` by throwing when either are null
    if (!opts.ctx.user || !opts.ctx.session) {
      expectTypeOf<UnsetContext>(opts.ctx);

      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'not signed in' });
    }

    expectTypeOf<SetContext>(opts.ctx);

    return opts.next({ ctx: opts.ctx });
  });

  protectedProcedure.use(async (opts) => {
    // Should be definitely defined
    opts.ctx.user.id;
    opts.ctx.session.id;

    expectTypeOf<SetContext>(opts.ctx);

    return opts.next({
      ctx: {
        ...opts.ctx,
      },
    });
  });
});
