import { routerToServerAndClientNew } from '../___testHelpers';
import { waitError } from '@trpc/server/__tests__/waitError';
import type { TRPCClientError } from '@trpc/client';
import { httpLink } from '@trpc/client';
import type { TRPCError } from '@trpc/server';
import { initTRPC } from '@trpc/server';
import { konn } from 'konn';

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.create();
    const appRouter = t.router({
      throws: t.procedure.query(() => {
        throw {
          message: 'Custom error message',
          name: 'Third Party API error',
          foo: 'bar',
        };
      }),
    });

    return routerToServerAndClientNew(appRouter, {
      client({ httpUrl }) {
        return {
          links: [httpLink({ url: httpUrl })],
        };
      },
    });
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

test('preserve `.cause` even on non-error objects', async () => {
  type TClientError = TRPCClientError<typeof ctx.router>;
  await waitError<TClientError>(() => ctx.client.throws.query());

  expect(ctx.onErrorSpy).toHaveBeenCalledTimes(1);
  const error = ctx.onErrorSpy.mock.calls[0]![0].error;
  expect(error).toMatchInlineSnapshot('[TRPCError: Custom error message]');
  expect(error.cause!.message).toBe('Custom error message');
  expect((error.cause as any).foo).toBe('bar');
});
