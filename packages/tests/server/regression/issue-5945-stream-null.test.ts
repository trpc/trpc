import { routerToServerAndClientNew, waitError } from '../___testHelpers';
import type { TRPCClientError } from '@trpc/client';
import { httpLink, unstable_httpBatchStreamLink } from '@trpc/client';
import type { TRPCError } from '@trpc/server';
import { initTRPC } from '@trpc/server';
import { konn } from 'konn';

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.create();
    const appRouter = t.router({
      greeting: t.procedure.query(() => {
        return null;
      }),
    });

    return routerToServerAndClientNew(appRouter, {
      client({ httpUrl }) {
        return {
          links: [unstable_httpBatchStreamLink({ url: httpUrl })],
        };
      },
    });
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

test('preserve `.cause` even on non-error objects', async () => {
  expect(await ctx.client.greeting.query()).toBe(null);
});
