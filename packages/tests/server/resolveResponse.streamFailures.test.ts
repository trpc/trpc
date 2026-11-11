// @vitest-environment node
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { waitError } from '@trpc/server/__tests__/waitError';
import { TRPCClientError } from '@trpc/client';
import { initTRPC } from '@trpc/server';

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
