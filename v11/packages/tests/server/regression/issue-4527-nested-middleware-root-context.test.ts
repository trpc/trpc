import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';

test('root context override on nested middlewares', () => {
  const t = initTRPC
    .context<{
      apiKey?: string | null;
      req?: Request;
    }>()
    .create();

  const enforceApiKey = t.middleware(async (opts) => {
    if (!opts.ctx.apiKey) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }

    return opts.next({ ctx: { apiKey: opts.ctx.apiKey } });
  });

  const formDataMiddleware = t.middleware(async (opts) => {
    return opts.next({ getRawInput: async () => new FormData() });
  });

  // root context -> enforceApiKey -> formDataMiddleware
  t.procedure
    .use(enforceApiKey)
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
  t.procedure
    .use(formDataMiddleware)
    .use(enforceApiKey)
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
