// @vitest-environment node
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { waitError } from '@trpc/server/__tests__/waitError';
import { TRPCClientError } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
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

test('cancelling a streamed batch whose stream already failed leaves no unhandled rejection', async () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (error: unknown) => unhandled.push(error);
  process.on('unhandledRejection', onUnhandled);
  using _listener = makeResource({}, () => {
    process.off('unhandledRejection', onUnhandled);
  });

  let serialized = 0;
  const t = initTRPC.create({
    transformer: {
      input: { serialize: (v) => v, deserialize: (v) => v },
      output: {
        // the head goes out, then nothing can be serialized
        serialize: (v) => {
          serialized++;
          if (serialized > 1) {
            throw new Error(`Cannot serialize #${serialized}`);
          }
          return v;
        },
        deserialize: (v) => v,
      },
    },
  });
  const router = t.router({
    iter: t.procedure.query(async function* () {
      yield 1;
    }),
  });

  const res = await fetchRequestHandler({
    endpoint: '',
    req: new Request('http://localhost/iter?batch=1&input=%7B%7D', {
      headers: { 'trpc-accept': 'application/jsonl' },
    }),
    router,
    createContext: () => ({}),
  });
  expect(res.status).toBe(200);
  // nothing reads the body: the value fails to serialize, then so does the
  // error line for it, which fails the stream behind the body
  await vi.waitFor(() => expect(serialized).toBe(3));

  await res.body!.cancel();
  await new Promise((resolve) => setImmediate(resolve));

  expect(unhandled).toEqual([]);
});
