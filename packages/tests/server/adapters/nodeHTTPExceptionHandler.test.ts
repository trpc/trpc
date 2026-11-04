// @vitest-environment node
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { waitError } from '@trpc/server/__tests__/waitError';
import { TRPCClientError } from '@trpc/client';
import { initTRPC, TRPCError } from '@trpc/server';
import { makeResource } from '@trpc/server/unstable-core-do-not-import';

/** Collects what would otherwise crash the process */
function uncaughtErrors() {
  const errors: unknown[] = [];
  const onError = (error: unknown) => {
    errors.push(error);
  };
  process.on('uncaughtException', onError);
  process.on('unhandledRejection', onError);
  return makeResource({ errors }, () => {
    process.off('uncaughtException', onError);
    process.off('unhandledRejection', onError);
  });
}

test('a streamed body that fails after its headers were sent is not written again', async () => {
  using uncaught = uncaughtErrors();
  const t = initTRPC.create();
  const router = t.router({
    // `JSON.stringify` throws on a bigint
    big: t.procedure.query(() => 1n as unknown as number),
  });
  await using ctx = testServerAndClientResource(router, {
    clientLink: 'httpBatchStreamLink',
  });

  await waitError(ctx.client.big.query(), TRPCClientError);
  await vi.waitFor(() => expect(ctx.onErrorSpy).toHaveBeenCalledTimes(1));
  await new Promise((resolve) => setImmediate(resolve));

  expect(uncaught.errors).toEqual([]);
});

test('a throwing errorFormatter gets an error response', async () => {
  using uncaught = uncaughtErrors();
  const t = initTRPC.create({
    errorFormatter: () => {
      throw new Error('Formatter failed');
    },
  });
  const router = t.router({
    fails: t.procedure.query(() => {
      throw new TRPCError({ code: 'CONFLICT' });
    }),
  });
  await using ctx = testServerAndClientResource(router, {
    clientLink: 'httpLink',
  });

  const error = await waitError(
    ctx.client.fails.query(undefined, { signal: AbortSignal.timeout(1000) }),
    TRPCClientError,
  );

  expect(error.data).toMatchObject({
    code: 'INTERNAL_SERVER_ERROR',
    httpStatus: 500,
  });
  expect(uncaught.errors).toEqual([]);
});
