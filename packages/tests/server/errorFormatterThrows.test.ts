// @vitest-environment node
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { waitError } from '@trpc/server/__tests__/waitError';
import { TRPCClientError } from '@trpc/client';
import { initTRPC, TRPCError } from '@trpc/server';
import { makeResource } from '@trpc/server/unstable-core-do-not-import';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function collect(iterable: AsyncIterable<unknown>) {
  const values: unknown[] = [];
  for await (const value of iterable) {
    values.push(value);
  }
  return values;
}

const t = initTRPC.create({
  errorFormatter: ({ shape, error }) => {
    if (error.code === 'CONFLICT') {
      throw new Error('Formatter failed');
    }
    return shape;
  },
});
const router = t.router({
  fails: t.procedure.query(() => {
    throw new TRPCError({ code: 'CONFLICT', message: 'Taken' });
  }),
  streamFails: t.procedure.query(async function* () {
    yield 1;
    throw new TRPCError({ code: 'CONFLICT', message: 'Taken' });
  }),
  slow: t.procedure.query(async function* () {
    yield 'a';
    await sleep(20);
    yield 'b';
  }),
  onEvent: t.procedure.subscription(async function* () {
    yield 1;
    throw new TRPCError({ code: 'CONFLICT', message: 'Taken' });
  }),
});

function expectReported(
  reports: readonly (readonly [unknown])[],
  path: string,
) {
  expect(reports.map(([opts]) => opts)).toEqual([
    expect.objectContaining({
      path,
      error: expect.objectContaining({ code: 'CONFLICT' }),
    }),
    expect.objectContaining({
      path,
      error: expect.objectContaining({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Formatter failed',
      }),
    }),
  ]);
}

test('a throwing errorFormatter still answers over httpLink', async () => {
  await using ctx = testServerAndClientResource(router, {
    clientLink: 'httpLink',
  });

  const error = await waitError(
    ctx.client.fails.query(undefined, { signal: AbortSignal.timeout(1000) }),
    TRPCClientError,
  );

  expect(error.message).toBe('CONFLICT');
  expect(error.data).toEqual({ code: 'CONFLICT', httpStatus: 409 });
  expectReported(ctx.onErrorSpy.mock.calls, 'fails');
});

test('a throwing errorFormatter fails only its own call over httpBatchStreamLink', async () => {
  await using ctx = testServerAndClientResource(router, {
    clientLink: 'httpBatchStreamLink',
  });

  const [stream, slow] = await Promise.all([
    ctx.client.streamFails.query(),
    ctx.client.slow.query(),
  ]);

  const error = await waitError(collect(stream), TRPCClientError);
  expect(error.data).toEqual({ code: 'CONFLICT', httpStatus: 409 });
  expect(await collect(slow)).toEqual(['a', 'b']);
  expect(ctx.onErrorSpy.mock.calls.map(([opts]) => opts)).toEqual([
    expect.objectContaining({
      error: expect.objectContaining({ code: 'CONFLICT' }),
    }),
    expect.objectContaining({
      path: 'streamFails',
      error: expect.objectContaining({ message: 'Formatter failed' }),
    }),
  ]);
});

test('a throwing errorFormatter still sends the error over httpSubscriptionLink', async () => {
  await using ctx = testServerAndClientResource(router, {
    clientLink: 'httpSubscriptionLink',
  });

  const onError = vi.fn();
  const subscription = ctx.client.onEvent.subscribe(undefined, { onError });
  using _subscription = makeResource(subscription, () =>
    subscription.unsubscribe(),
  );

  await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
  expect(onError.mock.calls[0]![0].data).toEqual({
    code: 'CONFLICT',
    httpStatus: 409,
  });
  expectReported(ctx.onErrorSpy.mock.calls, 'onEvent');
});
