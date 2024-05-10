import http from 'http';
import type { Socket } from 'net';
import { waitFor } from '@testing-library/react';
import { EventSourcePolyfill, NativeEventSource } from 'event-source-polyfill';
import SuperJSON from 'superjson';
import type { Maybe } from '../types';
import { inferrableChunk } from './isInferrableChunk';
import type { ConsumerOnError, ProducerOnError, SSEChunk } from './stream';
import {
  jsonlStreamConsumer,
  jsonlStreamProducer,
  sseStreamConsumer,
  sseStreamProducer,
} from './stream';

(global as any).EventSource = NativeEventSource || EventSourcePolyfill;
/* eslint-disable no-console */
export const suppressLogs = () => {
  const error = console.error;
  const noop = () => {
    // ignore
  };

  console.error = noop;
  return () => {
    console.error = error;
  };
};
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

  const [head, meta] = await jsonlStreamConsumer<typeof data>({
    from: stream,
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

  const stream = jsonlStreamProducer({
    data,
    serialize: (v) => SuperJSON.serialize(v),
    onError: onProducerErrorSpy,
  });

  const [head, meta] = await jsonlStreamConsumer<typeof data>({
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
          "error": [TRPCError: iterable],
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
    });
    expect(true).toBe(false);
  } catch (err) {
    expect(err).toMatchInlineSnapshot(
      `[Error: Invalid response or stream interrupted]`,
    );
  }
});

function createServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
) {
  const server = http.createServer(async (req, res) => {
    handler(req, res);
  });
  server.listen(0);

  const connections = new Set<Socket>();
  server.on('connection', (conn) => {
    connections.add(conn);
    conn.once('close', () => {
      connections.delete(conn);
    });
  });

  const port = (server.address() as any).port;

  const url = `http://localhost:${port}`;

  async function forceClose() {
    for (const conn of connections) {
      conn.destroy();
    }
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }

  return {
    url,
    close: async () => {
      await new Promise((resolve) => {
        server.close(resolve);
      });
    },
    restart: async () => {
      await forceClose();

      server.listen(port);
    },
  };
}
function createServerForStream(
  stream: ReadableStream,
  abortSignal: AbortController,
  headers: Record<string, string> = {},
) {
  return createServer(async (req, res) => {
    req.once('aborted', () => {
      abortSignal.abort();
    });
    for (const [key, value] of Object.entries(headers)) {
      res.setHeader(key, value);
    }

    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      res.write(value);
    }
    res.end();
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

test('e2e, encode/decode - maxDepth', async () => {
  const onError = vi.fn<Parameters<ProducerOnError>, null>();
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

  const res = await fetch(server.url);
  const [head] = await jsonlStreamConsumer<typeof data>({
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

  await server.close();
});

test.only('e2e, server-sent events (SSE)', async () => {
  async function* data(lastEventId?: Maybe<number>) {
    let i = lastEventId ?? 0;
    while (true) {
      i++;
      yield {
        id: i,
        data: i,
      } satisfies SSEChunk;

      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
  type inferAsyncIterable<T> = T extends AsyncIterable<infer U> ? U : never;
  type Data = inferAsyncIterable<ReturnType<typeof data>>;

  const written: string[] = [];
  const server = createServer(async (req, res) => {
    const url = new URL(`http://${req.headers.host}${req.url}`);

    const stringOrNull = (v: unknown) => {
      if (typeof v === 'string') {
        return v;
      }
      return null;
    };
    const stringToNumber = (v: string | null) => {
      if (v === null) {
        return null;
      }
      const num = Number(v);
      if (Number.isNaN(num)) {
        return null;
      }
      return num;
    };
    const lastEventId: string | null =
      stringOrNull(req.headers['last-event-id']) ??
      url.searchParams.get('lastEventId') ??
      url.searchParams.get('Last-Event-Id');

    const asNumber = stringToNumber(lastEventId);

    const stream = sseStreamProducer({
      data: data(asNumber),
      serialize: (v) => SuperJSON.serialize(v),
    });
    const reader = stream.getReader();
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Transfer-Encoding', 'chunked');

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      res.write(value);
      written.push(value);
    }
    res.end();
  });

  const es = new EventSource(server.url, {
    withCredentials: true,
  });

  const iterable = sseStreamConsumer<Data>({
    from: es,
    deserialize: SuperJSON.deserialize,
  });

  function range(start: number, end: number) {
    return Array.from({ length: end - start }, (_, i) => i + start);
  }

  const ITERATIONS = 10;
  const values: number[] = [];
  for await (const value of iterable) {
    values.push(value.data);
    if (values.length === ITERATIONS) {
      break;
    }
  }
  expect(values).toEqual(range(1, ITERATIONS + 1));

  const release = suppressLogs();
  await Promise.all([
    await server.restart(),
    // wait for an error, the EventSource will reconnect
    new Promise<void>((resolve) => {
      const onError = () => {
        es.removeEventListener('error', onError);
        resolve();
      };
      es.addEventListener('error', onError);
    }),
    ,
  ]);
  release();

  await new Promise<void>((resolve) => {
    const onOpen = () => {
      es.removeEventListener('open', onOpen);
      resolve();
    };
    es.addEventListener('open', onOpen);
  });

  for await (const value of iterable) {
    values.push(value.data);
    if (values.length === ITERATIONS * 2) {
      break;
    }
  }

  es.close();
  await server.close();
  expect(values).toEqual(range(1, ITERATIONS * 2 + 1));
});
