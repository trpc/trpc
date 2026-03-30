import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { waitError } from '@trpc/server/__tests__/waitError';
import { TRPCClientError } from '@trpc/client';
import { initTRPC } from '@trpc/server';

describe('isDev:true', () => {
  test('prints stacks', async () => {
    const t = initTRPC.create({ isDev: true });

    const appRouter = t.router({
      failingMutation: t.procedure.mutation(() => {
        if (Math.random() < 2) {
          throw new Error('Always fails');
        }
        return 'hello';
      }),
    });

    await using ctx = testServerAndClientResource(appRouter);

    const error = (await waitError(
      () => ctx.client.failingMutation.mutate(),
      TRPCClientError,
    )) as TRPCClientError<typeof appRouter>;

    expect(error.data?.stack?.split('\n')[0]).toMatchInlineSnapshot(
      `"Error: Always fails"`,
    );
  });
});

describe('isDev:false', () => {
  test('does not print stack', async () => {
    const t = initTRPC.create({ isDev: false });

    const appRouter = t.router({
      failingMutation: t.procedure.mutation(() => {
        if (Math.random() < 2) {
          throw new Error('Always fails');
        }
        return 'hello';
      }),
    });

    await using ctx = testServerAndClientResource(appRouter);

    const error = (await waitError(
      () => ctx.client.failingMutation.mutate(),
      TRPCClientError,
    )) as TRPCClientError<typeof appRouter>;

    expect(error.data?.stack).toBeUndefined();
  });
});
