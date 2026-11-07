// https://github.com/trpc/trpc/issues/7963
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();
const appRouter = t.router({
  logout: t.procedure
    .input(z.object({ everywhere: z.boolean() }).optional())
    .mutation((opts) => ({ everywhere: opts.input?.everywhere ?? false })),
});

describe.each(['httpLink', 'httpBatchLink'] as const)('%s', (clientLink) => {
  test('mutation with optional input called without input', async () => {
    await using ctx = testServerAndClientResource(appRouter, { clientLink });

    expect(await ctx.client.logout.mutate()).toEqual({ everywhere: false });
  });

  test('mutation with optional input called with input', async () => {
    await using ctx = testServerAndClientResource(appRouter, { clientLink });

    expect(await ctx.client.logout.mutate({ everywhere: true })).toEqual({
      everywhere: true,
    });
  });
});
