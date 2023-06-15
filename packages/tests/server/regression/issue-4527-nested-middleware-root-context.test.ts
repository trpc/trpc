import { initTRPC, TRPCError } from '@trpc/server/src';
import { z } from 'zod';

test('root context override on nested middlewares', () => {
  const t = initTRPC
    .context<{
      apiKey?: string | null;
      req?: Request;
    }>()
    .create();

  const enforceApiKey = t.middleware(async ({ ctx, next }) => {
    if (!ctx.apiKey) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }

    return next({ ctx: { apiKey: ctx.apiKey } });
  });

  const formDataMiddleware = t.middleware(async ({ next }) => {
    return next({ rawInput: new FormData() });
  });

  const protectedApiProcedure = t.procedure.use(enforceApiKey);
  const protectedApiFormDataProcedure = t.procedure
    .use(formDataMiddleware)
    .use(enforceApiKey);

  // root context -> enforceApiKey -> formDataMiddleware
  protectedApiProcedure
    .use(formDataMiddleware)
    .input(
      z.object({
        somehash: z.string(),
      }),
    )
    .query(async (opts) => {
      expectTypeOf<{
        req?: Request;
        apiKey: string;
      }>(opts.ctx);

      return { status: 'ok' };
    });

  // root context -> formDataMiddleware -> enforceApiKey
  protectedApiFormDataProcedure
    .input(
      z.object({
        somehash: z.string(),
      }),
    )
    .query(async (opts) => {
      expectTypeOf<{
        req?: Request;
        apiKey: string;
      }>(opts.ctx);

      return { status: 'ok' };
    });
});
