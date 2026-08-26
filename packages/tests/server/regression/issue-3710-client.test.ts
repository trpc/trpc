import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { initTRPC } from '@trpc/server';

test('using client as procedure name', async () => {
  const t = initTRPC.create();
  const router = t.router({
    client: t.procedure.query(() => 'x'),
    request: t.procedure.query(() => 'x'),
  });

  await using ctx = testServerAndClientResource(router);

  expect(await ctx.client.client.query()).toBe('x');
  expect(await ctx.client.request.query()).toBe('x');
});
