import { routerToServerAndClientNew } from './___testHelpers';
import type { TRPCUntypedClient } from '@trpc/client';
import { getUntypedClient } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import type { inferClientTypes } from '@trpc/server/unstable-core-do-not-import';

test('getUntypedClient()', async () => {
  const t = initTRPC.create({
    errorFormatter(opts) {
      return {
        ...opts.shape,
        data: {
          ...opts.shape.data,
          __test__: true as const,
        },
      };
    },
  });

  const appRouter = t.router({
    foo: t.procedure.query(() => 'bar'),
  });

  const ctx = routerToServerAndClientNew(appRouter);
  const untyped = getUntypedClient(ctx.client);

  type UntypedInferrable =
    typeof untyped extends TRPCUntypedClient<infer T>
      ? inferClientTypes<T>
      : never;
  type RouterInferrable = inferClientTypes<typeof ctx.router>;

  expectTypeOf<RouterInferrable>().toEqualTypeOf<UntypedInferrable>();
  expect(await untyped.query('foo')).toBe('bar');

  await ctx.close();
});
