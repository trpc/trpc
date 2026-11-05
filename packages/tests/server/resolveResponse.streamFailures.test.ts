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

describe('a JSONL value that cannot be serialized fails only its own call', () => {
  const t = initTRPC.create();
  const finished = vi.fn();
  const router = t.router({
    // `JSON.stringify` throws on a bigint
    deferred: t.procedure.query(() => ({
      later: Promise.resolve(1n as unknown as number),
    })),
    stream: t.procedure.query(async function* () {
      try {
        yield 1;
        yield 2n as unknown as number;
        yield 3;
      } finally {
        finished();
      }
    }),
    slow: t.procedure.query(async function* () {
      yield 'a';
      await sleep(20);
      yield 'b';
    }),
  });

  test('a deferred promise', async () => {
    await using ctx = testServerAndClientResource(router, {
      clientLink: 'httpBatchStreamLink',
    });

    const [deferred, slow] = await Promise.all([
      ctx.client.deferred.query(),
      ctx.client.slow.query(),
    ]);

    const error = await waitError(deferred.later, TRPCClientError);
    expect(error.data).toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    expect(await collect(slow)).toEqual(['a', 'b']);
    expect(ctx.onErrorSpy).toHaveBeenCalledTimes(1);
    expect(ctx.onErrorSpy.mock.calls[0]![0]).toMatchObject({
      path: 'deferred',
      type: 'query',
    });
  });

  test('a streamed value', async () => {
    finished.mockClear();
    await using ctx = testServerAndClientResource(router, {
      clientLink: 'httpBatchStreamLink',
    });

    const [stream, slow] = await Promise.all([
      ctx.client.stream.query(),
      ctx.client.slow.query(),
    ]);

    const values: unknown[] = [];
    const error = await waitError(async () => {
      for await (const value of stream) {
        values.push(value);
      }
    }, TRPCClientError);
    expect(values).toEqual([1]);
    expect(error.data).toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    expect(await collect(slow)).toEqual(['a', 'b']);
    expect(finished).toHaveBeenCalledTimes(1);
    expect(ctx.onErrorSpy).toHaveBeenCalledTimes(1);
    expect(ctx.onErrorSpy.mock.calls[0]![0]).toMatchObject({ path: 'stream' });
  });
});

describe('a throwing errorFormatter leaves the error a shape with only its code', () => {
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

  test('over httpLink', async () => {
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

  test('over httpBatchStreamLink', async () => {
    await using ctx = testServerAndClientResource(router, {
      clientLink: 'httpBatchStreamLink',
    });

    const [stream, slow] = await Promise.all([
      ctx.client.streamFails.query(),
      ctx.client.slow.query(),
    ]);

    const error = await waitError(collect(stream), TRPCClientError);
    expect(error.data).toMatchObject({ code: 'CONFLICT' });
    expect(await collect(slow)).toEqual(['a', 'b']);
    expectReported(ctx.onErrorSpy.mock.calls, 'streamFails');
  });

  test('over httpSubscriptionLink', async () => {
    await using ctx = testServerAndClientResource(router, {
      clientLink: 'httpSubscriptionLink',
    });

    const onError = vi.fn();
    const subscription = ctx.client.onEvent.subscribe(undefined, { onError });
    using _subscription = makeResource(subscription, () =>
      subscription.unsubscribe(),
    );

    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError.mock.calls[0]![0].data).toMatchObject({ code: 'CONFLICT' });
    expectReported(ctx.onErrorSpy.mock.calls, 'onEvent');
  });
});

test('a streamed body that fails after its headers were sent reports its call and ends', async () => {
  const t = initTRPC.create({
    transformer: {
      serialize: () => {
        throw new Error('Cannot serialize');
      },
      deserialize: (value) => value,
    },
  });
  const router = t.router({
    onEvent: t.procedure.subscription(async function* () {
      yield 1;
    }),
  });
  await using ctx = testServerAndClientResource(router);

  const res = await fetch(`${ctx.httpUrl}/onEvent`, {
    headers: { accept: 'text/event-stream' },
  });
  expect(res.status).toBe(200);
  const body = await res.text();

  expect(body).toContain('event: connected');
  // the value fails to serialize, then so does the error event for it
  const reported = expect.objectContaining({
    path: 'onEvent',
    type: 'subscription',
    error: expect.objectContaining({ message: 'Cannot serialize' }),
  });
  expect(ctx.onErrorSpy.mock.calls.map(([opts]) => opts)).toEqual([
    reported,
    reported,
  ]);
});
