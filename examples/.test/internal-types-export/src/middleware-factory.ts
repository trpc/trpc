import { initTRPC, TRPCError } from '@trpc/server';

interface AuthNContext {
  user?: { id: string };
}

export function createAuthenticationMiddleware<
  TContext extends AuthNContext = AuthNContext,
>() {
  return initTRPC
    .context<TContext>()
    .create()
    .procedure.use(({ ctx, next }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      return next({ ctx: { user: ctx.user } });
    });
}
