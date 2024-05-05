import http from 'http';
import { waitFor } from '@testing-library/react';
import SuperJSON from 'superjson';
import type { ConsumerOnError, ProducerOnError } from './stream';
import {
  createBatchStreamProducer,
  createJsonBatchStreamConsumer,
  createJsonBatchStreamProducer,
} from './stream';

test('encoder - superjson', async () => {
  const [head, stream] = createBatchStreamProducer({
    data: {
      0: Promise.resolve({
        foo: 'bar',
        deferred: Promise.resolve(42),
      }),
      1: Promise.resolve({
        [Symbol.asyncIterator]: async function* () {
          yield 1;
          yield 2;
          yield 3;
        },
      }),
    },
    serialize: SuperJSON.serialize,
  });

  const reader = stream.getReader();
  const chunks: unknown[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
  }

  expect(head).toMatchInlineSnapshot(`
    Object {
      "json": Object {
        "0": Array [
          Array [
            0,
          ],
          Array [
            null,
            0,
            0,
          ],
        ],
        "1": Array [
          Array [
            0,
          ],
          Array [
            null,
            0,
            1,
          ],
        ],
      },
    }
  `);
});

test('encode/decode', async () => {
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
  const stream = createJsonBatchStreamProducer({
    data,
    serialize: (v) => SuperJSON.serialize(v),
  });

  const [head, meta] = await createJsonBatchStreamConsumer<typeof data>({
    from: stream,
    deserialize: (v) => SuperJSON.deserialize(v),
  });

  // console.log(inspect(head, undefined, 10));
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
  await meta.reader.closed;
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

  const onProducerErrorSpy = vi.fn<Parameters<ProducerOnError>, null>();
  const onConsumerErrorSpy = vi.fn<Parameters<ConsumerOnError>, null>();

  const stream = createJsonBatchStreamProducer({
    data,
    serialize: (v) => SuperJSON.serialize(v),
    onError: onProducerErrorSpy,
  });

  const [head, meta] = await createJsonBatchStreamConsumer<typeof data>({
    from: stream,
    deserialize: (v) => SuperJSON.deserialize(v),
    onError: onConsumerErrorSpy,
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

  await meta.reader.closed;
  expect(meta.controllers.size).toBe(0);
  expect(onConsumerErrorSpy).toHaveBeenCalledTimes(0);
});

function createServer(
  stream: ReadableStream<string>,
  abortSignal: AbortController,
) {
  const server = http.createServer(async (req, res) => {
    req.once('aborted', () => {
      abortSignal.abort();
    });
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');

    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      // console.log('write', value);
      res.write(value);
    }
    res.end();
  });
  server.listen(0);
  const port = (server.address() as any).port;

  const url = `http://localhost:${port}`;

  return {
    url,
    close: () => {
      server.close();
    },
  };
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
  const stream = createJsonBatchStreamProducer({
    data,
    serialize: (v) => SuperJSON.serialize(v),
  });

  const server = createServer(stream, new AbortController());

  const res = await fetch(server.url);

  const [head, meta] = await createJsonBatchStreamConsumer<typeof data>({
    from: res.body!,
    deserialize: (v) => SuperJSON.deserialize(v),
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
  await meta.reader.closed;
  expect(meta.controllers.size).toBe(0);
});

test('e2e, client aborts request halfway through', async () => {
  const serverAbort = new AbortController();
  const clientAbort = new AbortController();
  const yieldCalls = vi.fn();
  let stopped = false;

  const onConsumerErrorSpy = vi.fn<Parameters<ConsumerOnError>, null>();
  const onProducerErrorSpy = vi.fn<Parameters<ProducerOnError>, null>();

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

  const stream = createJsonBatchStreamProducer({
    data,
    onError: onProducerErrorSpy,
  });
  const server = createServer(stream, serverAbort);

  const res = await fetch(server.url, {
    signal: clientAbort.signal,
  });
  const [head, meta] = await createJsonBatchStreamConsumer<typeof data>({
    from: res.body!,
    onError: onConsumerErrorSpy,
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
  server.close();
});

test('e2e, encode/decode - maxDepth', async () => {
  const onError = vi.fn<Parameters<ProducerOnError>, null>();
  const data = {
    0: Promise.resolve({
      foo: 'bar',
      deferred: Promise.resolve(42),
    }),
  } as const;
  const stream = createJsonBatchStreamProducer({
    data,
    serialize: SuperJSON.serialize,
    onError,
    maxDepth: 1,
  });

  const server = createServer(stream, new AbortController());

  const res = await fetch(server.url);
  const [head] = await createJsonBatchStreamConsumer<typeof data>({
    from: res.body!,
    deserialize: SuperJSON.deserialize,
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
});
