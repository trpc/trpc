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

/** The fixed shape the Node and ws adapters also fall back to */
const fallbackData = { code: 'INTERNAL_SERVER_ERROR', httpStatus: 500 };

function expectFormatterFailureReported(
  reports: readonly (readonly [unknown])[],
  path: string,
) {
  expect(reports.map(([opts]) => opts)).toContainEqual(
    expect.objectContaining({
      path,
      error: expect.objectContaining({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Formatter failed',
      }),
    }),
  );
}

test('a throwing errorFormatter fails only its own streamed value over httpBatchStreamLink', async () => {
  await using ctx = testServerAndClientResource(router, {
    clientLink: 'httpBatchStreamLink',
  });

  const [stream, slow] = await Promise.all([
    ctx.client.streamFails.query(),
    ctx.client.slow.query(),
  ]);

  const error = await waitError(collect(stream), TRPCClientError);
  expect(error.message).toBe('Internal server error');
  expect(error.data).toEqual(fallbackData);
  expect(await collect(slow)).toEqual(['a', 'b']);
  expectFormatterFailureReported(ctx.onErrorSpy.mock.calls, 'streamFails');
});

test('a throwing errorFormatter fails only its own call over httpBatchStreamLink', async () => {
  await using ctx = testServerAndClientResource(router, {
    clientLink: 'httpBatchStreamLink',
  });

  const [error, slow] = await Promise.all([
    waitError(ctx.client.fails.query(), TRPCClientError),
    ctx.client.slow.query(),
  ]);

  expect(error.message).toBe('Internal server error');
  expect(error.data).toEqual(fallbackData);
  expect(await collect(slow)).toEqual(['a', 'b']);
  expectFormatterFailureReported(ctx.onErrorSpy.mock.calls, 'fails');
});

test('a throwing onError does not stop the fallback over httpBatchStreamLink', async () => {
  await using ctx = testServerAndClientResource(router, {
    clientLink: 'httpBatchStreamLink',
    server: {
      onError: ({ error }) => {
        if (error.message === 'Formatter failed') {
          throw new Error('onError failed');
        }
      },
    },
  });

  const [stream, slow] = await Promise.all([
    ctx.client.streamFails.query(),
    ctx.client.slow.query(),
  ]);

  const error = await waitError(collect(stream), TRPCClientError);
  expect(error.data).toEqual(fallbackData);
  expect(await collect(slow)).toEqual(['a', 'b']);
});

test('a throwing errorFormatter still sends the error over httpSubscriptionLink', async () => {
  await using ctx = testServerAndClientResource(router, {
    clientLink: 'httpSubscriptionLink',
  });

  const onConnectionStateChange = vi.fn();
  const subscription = ctx.client.onEvent.subscribe(undefined, {
    onConnectionStateChange,
  });
  using _subscription = makeResource(subscription, () =>
    subscription.unsubscribe(),
  );

  // INTERNAL_SERVER_ERROR is retryable, so the client reconnects with it
  await vi.waitFor(() =>
    expect(onConnectionStateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'connecting',
        error: expect.objectContaining({
          message: 'Internal server error',
          data: fallbackData,
        }),
      }),
    ),
  );
  expectFormatterFailureReported(ctx.onErrorSpy.mock.calls, 'onEvent');
});
