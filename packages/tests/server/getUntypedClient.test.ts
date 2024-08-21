import { routerToServerAndClientNew } from './___testHelpers';
import type { TRPCUntypedClient } from '@trpc/client';
import { getUntypedClient } from '@trpc/client';
import type { AnyRouter } from '@trpc/server';
import { initTRPC } from '@trpc/server';
import { konn } from 'konn';

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.create();

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

  type TRouter = typeof untyped extends TRPCUntypedClient<infer T> ? T : never;

  expectTypeOf<TRouter>().toEqualTypeOf<typeof ctx.router>();
  expectTypeOf<TRouter>().not.toEqualTypeOf<AnyRouter>();

  expect(await untyped.query('foo')).toBe('bar');
});
