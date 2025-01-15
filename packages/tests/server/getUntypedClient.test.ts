import { routerToServerAndClientNew } from './___testHelpers';
import type { TRPCUntypedClient } from '@trpc/client';
import { getUntypedClient } from '@trpc/client';
import type { AnyRouter } from '@trpc/server';
import { initTRPC } from '@trpc/server';
import { konn } from 'konn';

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.create({
      errorFormatter(opts) {
        return {
          ...opts.shape,
        };
      },
    });

    const appRouter = t.router({
      foo: t.procedure.query(() => 'bar'),
    });

    return routerToServerAndClientNew(appRouter);
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

test('getUntypedClient()', async () => {
  const client = ctx.client;
  expect(await client.foo.query()).toBe('bar');
  const untyped = getUntypedClient(client);

  type $Types1 = typeof untyped extends TRPCUntypedClient<infer T> ? T : never;

  type $Types2 = {
    errorShape: typeof ctx.router._def._config.$types.errorShape;
    transformer: typeof ctx.router._def._config.$types.transformer;
  };

  expectTypeOf<$Types1>().toEqualTypeOf<$Types2>();
  expectTypeOf<$Types1>().not.toEqualTypeOf<AnyRouter>();

  expect(await untyped.query('foo')).toBe('bar');
});
