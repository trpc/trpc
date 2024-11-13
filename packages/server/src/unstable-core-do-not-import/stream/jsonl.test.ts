import { waitFor } from '@testing-library/react';
import SuperJSON from 'superjson';
import { writeResponseBody } from '../../adapters/node-http/writeResponse';
import { run } from '../utils';
import type { ConsumerOnError, ProducerOnError } from './jsonl';
import { jsonlStreamConsumer, jsonlStreamProducer } from './jsonl';
import { createDeferred } from './utils/createDeferred';
import { createServer } from './utils/createServer';

test('encode/decode with superjson', async () => {
  const data = {
    0: Promise.resolve({
      foo: {
        bar: {
          baz: 'qux',
        },
      },
      deferred: Promise.resolve(42),
    }),
    1: Promise.resolve({
      [Symbol.asyncIterator]: async function* () {
        yield 1;
        yield 2;
        yield 3;
      },
    }),
  } as const;
  const stream = jsonlStreamProducer({
    data,
    serialize: (v) => SuperJSON.serialize(v),
  });

  const [stream1, stream2] = stream.tee();

  const streamEnd = run(async () => {
    const reader = stream2.pipeThrough(new TextDecoderStream()).getReader();
    const aggregated: string[] = [];
    while (true) {
      const res = await reader.read();

      if (res.value) {
        aggregated.push(res.value);
      }
      if (res.done) {
        break;
      }
    }
    return aggregated;
  });

  expect(await streamEnd).toMatchInlineSnapshot(`
    Array [
      "{"json":{"0":[[0],[null,0,0]],"1":[[0],[null,0,1]]}}
    ",
      "{"json":[0,0,[[{"foo":{"bar":{"baz":"qux"}},"deferred":0}],["deferred",0,2]]]}
    ",
      "{"json":[1,0,[[0],[null,1,3]]]}
    ",
      "{"json":[2,0,[[42]]]}
    ",
      "{"json":[3,1,[[1]]]}
    ",
      "{"json":[3,1,[[2]]]}
    ",
      "{"json":[3,1,[[3]]]}
    ",
      "{"json":[3,0,[[]]]}
    ",
    ]
  `);

  const [head, meta] = await jsonlStreamConsumer<typeof data>({
    from: stream1,
    deserialize: (v) => SuperJSON.deserialize(v),
    abortController: new AbortController(),
  });

  {
    expect(head[0]).toBeInstanceOf(Promise);

    const value = await head[0];
    expect(value.deferred).toBeInstanceOf(Promise);

    await expect(value.deferred).resolves.toBe(42);

    expect(value.foo.bar.baz).toBe('qux');
  }
  {
    expect(head[1]).toBeInstanceOf(Promise);

    const iterable = await head[1];

    const aggregated: number[] = [];
    for await (const item of iterable) {
      aggregated.push(item);
    }
    expect(aggregated).toEqual([1, 2, 3]);
  }

  expect(meta.controllers.size).toBe(0);
});

test('encode/decode - error', async () => {
  const data = {
    0: Promise.resolve({
      foo: {
        bar: {
          baz: 'qux',
        },
      },
      deferred: Promise.reject(new Error('promise')),
    }),
    1: Promise.resolve({
      [Symbol.asyncIterator]: async function* () {
        yield 1;
        yield 2;
        yield 3;
        throw new Error('iterable');
      },
    }),
  } as const;

  const errors: unknown[] = [];

  const onProducerErrorSpy =
    vi.fn<(...args: Parameters<ProducerOnError>) => void>();
  const onConsumerErrorSpy =
    vi.fn<(...args: Parameters<ConsumerOnError>) => void>();

  const stream = jsonlStreamProducer({
    data,
    serialize: (v) => SuperJSON.serialize(v),
    onError: onProducerErrorSpy,
  });

  const [head, meta] = await jsonlStreamConsumer<typeof data>({
    from: stream,
    deserialize: (v) => SuperJSON.deserialize(v),
    onError: onConsumerErrorSpy,
    abortController: new AbortController(),
  });

  {
    expect(head[0]).toBeInstanceOf(Promise);

    const value = await head[0];
    expect(value.deferred).toBeInstanceOf(Promise);

    await expect(value.deferred).rejects.toThrowErrorMatchingInlineSnapshot(
      `[Error: Received error from server]`,
    );
  }
  {
    expect(head[1]).toBeInstanceOf(Promise);

    const iterable = await head[1];

    const aggregated: number[] = [];
    try {
      for await (const item of iterable) {
        aggregated.push(item);
      }
    } catch (err) {
      errors.push(err);
    }
    expect(aggregated).toEqual([1, 2, 3]);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchInlineSnapshot(
      `[Error: Received error from server]`,
    );
  }

  expect(onProducerErrorSpy).toHaveBeenCalledTimes(2);
  expect(onProducerErrorSpy.mock.calls).toMatchInlineSnapshot(`
    Array [
      Array [
        Object {
          "error": [Error: promise],
          "path": Array [
            "0",
            "deferred",
          ],
        },
      ],
      Array [
        Object {
          "error": [Error: iterable],
          "path": Array [
            "1",
          ],
        },
      ],
    ]
  `);

  // await meta.reader.closed;
  expect(meta.controllers.size).toBe(0);
  expect(onConsumerErrorSpy).toHaveBeenCalledTimes(0);
});

test('decode - bad data', async () => {
  const textEncoder = new TextEncoderStream();
  const writer = textEncoder.writable.getWriter();

  try {
    (async () => {
      await writer.write(
        JSON.stringify({
          error: 'bad data',
        }),
      );
      await writer.close();
    })().catch(() => {
      // noop
    });
    await jsonlStreamConsumer({
      from: textEncoder.readable,
      deserialize: (v) => SuperJSON.deserialize(v),
      abortController: new AbortController(),
    });
    expect(true).toBe(false);
  } catch (err) {
    expect(err).toMatchInlineSnapshot(
      `[Error: Invalid response or stream interrupted]`,
    );
  }
});

function createServerForStream(
  stream: ReadableStream,
  abortCtrl: AbortController,
  headers: Record<string, string> = {},
) {
  return createServer(async (req, res) => {
    req.once('aborted', () => {
      abortCtrl.abort();
    });
    for (const [key, value] of Object.entries(headers)) {
      res.setHeader(key, value);
    }

    try {
      await writeResponseBody({
        res,
        signal: abortCtrl.signal,
        body: stream,
      });
    } catch (err) {
      if ((err as any).name === 'AbortError') {
        return;
      }

      throw err;
    } finally {
      if (!res.headersSent) {
        res.statusCode = 500;
      }
      res.end();
    }
  });
}
test('e2e, create server', async () => {
  const data = {
    0: Promise.resolve({
      foo: {
        bar: {
          baz: 'qux',
        },
      },
      deferred: Promise.resolve(42),
      slow: new Promise<string>((resolve) => {
        setTimeout(() => {
          resolve('___________RESOLVE________');
        }, 10);
      }),
    }),
    1: Promise.resolve({
      [Symbol.asyncIterator]: async function* () {
        yield 1;
        yield 2;
        yield 3;
      },
    }),
  } as const;
  const stream = jsonlStreamProducer({
    data,
    serialize: (v) => SuperJSON.serialize(v),
  });

  const server = createServerForStream(stream, new AbortController());

  const res = await fetch(server.url);

  const [head, meta] = await jsonlStreamConsumer<typeof data>({
    from: res.body!,
    deserialize: (v) => SuperJSON.deserialize(v),
    abortController: new AbortController(),
  });

  {
    expect(head[0]).toBeInstanceOf(Promise);

    const value = await head[0];
    expect(value.deferred).toBeInstanceOf(Promise);

    await expect(value.deferred).resolves.toBe(42);

    expect(value.foo.bar.baz).toBe('qux');
  }
  {
    expect(head[1]).toBeInstanceOf(Promise);

    const iterable = await head[1];

    const aggregated: number[] = [];
    for await (const item of iterable) {
      aggregated.push(item);
    }
    expect(aggregated).toEqual([1, 2, 3]);
  }

  {
    const value = await head[0];
    expect(value.slow).toBeInstanceOf(Promise);
    await expect(value.slow).resolves.toMatchInlineSnapshot(
      `"___________RESOLVE________"`,
    );
  }
  // await meta.reader.closed;
  expect(meta.controllers.size).toBe(0);

  await server.close();
});

test('e2e, client aborts request halfway through', async () => {
  const serverAbort = new AbortController();
  const clientAbort = new AbortController();
  const yieldCalls = vi.fn();
  let stopped = false;

  const onConsumerErrorSpy =
    vi.fn<(...args: Parameters<ConsumerOnError>) => void>();
  const onProducerErrorSpy =
    vi.fn<(...args: Parameters<ProducerOnError>) => void>();

  const data = {
    0: Promise.resolve({
      [Symbol.asyncIterator]: async function* () {
        for (let i = 0; i < 10; i++) {
          yieldCalls();
          yield i;
          await new Promise((resolve) => setTimeout(resolve, 5));

          if (serverAbort.signal.aborted) {
            stopped = true;
            return;
          }
        }
        stopped = true;
      },
    }),
  } as const;

  const stream = jsonlStreamProducer({
    data,
    onError: onProducerErrorSpy,
  });
  const server = createServerForStream(stream, serverAbort);

  const res = await fetch(server.url, {
    signal: clientAbort.signal,
  });
  const [head, meta] = await jsonlStreamConsumer<typeof data>({
    from: res.body!,
    onError: onConsumerErrorSpy,
    abortController: clientAbort,
  });

  {
    const iterable = await head[0];

    for await (const item of iterable) {
      if (item === 2) {
        break;
      }
    }
    clientAbort.abort();
  }

  await waitFor(() => {
    expect(meta.controllers.size).toBe(0);
  });
  // wait for stopped
  await waitFor(() => {
    expect(stopped).toBe(true);
  });

  expect(yieldCalls.mock.calls.length).toBeGreaterThanOrEqual(3);
  expect(yieldCalls.mock.calls.length).toBeLessThan(10);

  const errors = onConsumerErrorSpy.mock.calls.map(
    (it) => (it[0].error as Error).message,
  );
  expect(errors).toMatchInlineSnapshot(`
    Array [
      "The operation was aborted.",
    ]
  `);
  expect(onConsumerErrorSpy).toHaveBeenCalledTimes(1);
  expect(onProducerErrorSpy).toHaveBeenCalledTimes(0);

  await server.close();
});

test('e2e, client aborts request halfway through - through breaking async iterable', async () => {
  const serverAbort = new AbortController();
  const clientAbort = new AbortController();
  const yieldCalls = vi.fn();
  let stopped = false;

  const onConsumerErrorSpy =
    vi.fn<(...args: Parameters<ConsumerOnError>) => void>();
  const onProducerErrorSpy =
    vi.fn<(...args: Parameters<ProducerOnError>) => void>();

  const data = {
    0: Promise.resolve({
      [Symbol.asyncIterator]: async function* () {
        for (let i = 0; i < 10; i++) {
          yieldCalls();
          yield i;
          await new Promise((resolve) => setTimeout(resolve, 5));
          if (serverAbort.signal.aborted) {
            stopped = true;
            return;
          }
        }
        stopped = true;
      },
    }),
  } as const;

  const stream = jsonlStreamProducer({
    data,
    onError: onProducerErrorSpy,
  });
  const server = createServerForStream(stream, serverAbort);

  const res = await fetch(server.url, {
    signal: clientAbort.signal,
  });
  const [head, meta] = await jsonlStreamConsumer<typeof data>({
    from: res.body!,
    onError: onConsumerErrorSpy,
    abortController: clientAbort,
  });

  {
    const iterable = await head[0];

    for await (const item of iterable) {
      if (item === 2) {
        // ✨ This will actually abort the full stream and the request since there's no more data to read

        break;
      }
    }
  }

  await waitFor(() => {
    expect(meta.controllers.size).toBe(0);
  });
  // wait for stopped
  await waitFor(() => {
    expect(stopped).toBe(true);
  });

  expect(yieldCalls.mock.calls.length).toBeGreaterThanOrEqual(3);
  expect(yieldCalls.mock.calls.length).toBeLessThan(10);

  const errors = onConsumerErrorSpy.mock.calls.map(
    (it) => (it[0].error as Error).message,
  );
  expect(errors).toMatchInlineSnapshot(`
    Array [
      "The operation was aborted.",
    ]
  `);

  expect(onProducerErrorSpy).toHaveBeenCalledTimes(0);
  expect(onConsumerErrorSpy).toHaveBeenCalledTimes(1);

  await server.close();
});

test('e2e, encode/decode - maxDepth', async () => {
  const onError = vi.fn<(...args: Parameters<ProducerOnError>) => void>();
  const data = {
    0: Promise.resolve({
      foo: 'bar',
      deferred: Promise.resolve(42),
    }),
  } as const;
  const stream = jsonlStreamProducer({
    data,
    serialize: SuperJSON.serialize,
    onError,
    maxDepth: 1,
  });

  const server = createServerForStream(stream, new AbortController());

  const ac = new AbortController();
  const res = await fetch(server.url, {
    signal: ac.signal,
  });
  const [head] = await jsonlStreamConsumer<typeof data>({
    from: res.body!,
    deserialize: SuperJSON.deserialize,
    abortController: ac,
  });

  {
    expect(head[0]).toBeInstanceOf(Promise);

    const value = await head[0];
    await expect(value.deferred).rejects.toMatchInlineSnapshot(
      `[Error: Received error from server]`,
    );
  }

  expect(onError).toHaveBeenCalledTimes(1);
  expect(onError.mock.calls).toMatchInlineSnapshot(`
    Array [
      Array [
        Object {
          "error": [Error: Max depth reached at path: 0.deferred],
          "path": Array [
            "0",
            "deferred",
          ],
        },
      ],
    ]
  `);

  await server.close();
});

test('should work to throw after stream is closed', async () => {
  const deferred = createDeferred<unknown>();
  const data = {
    0: Promise.resolve({
      deferred: deferred.promise,
    }),
  } as const;

  const onError = vi.fn<(...args: Parameters<ProducerOnError>) => void>();

  const ac = new AbortController();
  const stream = jsonlStreamProducer({
    data,
    serialize: (v) => SuperJSON.serialize(v),
    onError,
  });

  const server = createServerForStream(stream, ac);
  const res = await fetch(server.url, {
    signal: ac.signal,
  });

  const [head] = await jsonlStreamConsumer<typeof data>({
    from: res.body!,
    deserialize: (v) => SuperJSON.deserialize(v),
    abortController: new AbortController(),
  });

  const head0 = await head[0]; // consume the stream

  ac.abort();

  await expect(head0.deferred).rejects.toMatchInlineSnapshot(
    `[Error: Invalid response or stream interrupted]`,
  );

  deferred.resolve({
    p: Promise.resolve({
      child: Promise.reject(new Error('throws')),
    }),
  });

  await waitFor(() => {
    expect(onError).toHaveBeenCalledTimes(1);
  });

  expect(onError.mock.calls[0]![0]).toMatchInlineSnapshot(`
    Object {
      "error": [Error: throws],
      "path": Array [
        "0",
        "deferred",
        "p",
        "child",
      ],
    }
  `);
});
