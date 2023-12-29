import '../___packages';
import { initTRPC, TRPCError } from '@trpc/core';

test('middleware next()', async () => {
  const t = initTRPC.create();
  t.middleware(async (opts) => {
    const result = await opts.next();

    if (!result.ok) {
      expectTypeOf(result.error).toEqualTypeOf<TRPCError>();
    }

    return result;
  });
});
