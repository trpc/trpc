import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { waitError } from '@trpc/server/__tests__/waitError';
import type { TRPCClientError } from '@trpc/client';
import { httpLink } from '@trpc/client';
import type { TRPCError } from '@trpc/server';
import { initTRPC } from '@trpc/server';

test('preserve `.cause` even on non-error objects', async () => {
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

  const onErrorSpy = vi.fn();
  await using ctx = testServerAndClientResource(appRouter, {
    server: {
      onError: onErrorSpy,
    },
    client({ httpUrl }) {
      return {
        links: [httpLink({ url: httpUrl })],
      };
    },
  });

  type TClientError = TRPCClientError<typeof appRouter>;
  await waitError<TClientError>(() => ctx.client.throws.query());

  expect(onErrorSpy).toHaveBeenCalledTimes(1);
  const error = onErrorSpy.mock.calls[0]![0].error;
  expect(error).toMatchInlineSnapshot('[TRPCError: Custom error message]');
  expect(error.cause!.message).toBe('Custom error message');
  expect(error.cause.foo).toBe('bar');
});
