import { routerToServerAndClientNew, waitError } from '../___testHelpers';
import { TRPCClientError, httpLink } from '@trpc/client';
import { TRPCError, initTRPC } from '@trpc/server';
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
  await waitError<TClientError>(() => ctx.proxy.throws.query());

  expect(ctx.onError).toHaveBeenCalledTimes(1);
  const error = ctx.onError.mock.calls[0]![0]!.error as TRPCError & {
    cause: any;
  };
  expect(error).toMatchInlineSnapshot('[TRPCError: Custom error message]');
  expect(error.cause.message).toBe('Custom error message');
  expect(error.cause.foo).toBe('bar');
});
