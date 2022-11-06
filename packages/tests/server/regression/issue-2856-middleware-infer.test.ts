import '../___packages';
import { TRPCError, initTRPC } from '@trpc/server';
import { expectTypeOf } from 'expect-type';

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
