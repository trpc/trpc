import { EventSourcePolyfill, NativeEventSource } from 'event-source-polyfill';
import SuperJSON from 'superjson';
import type { Maybe } from '../types';
import { sseHeaders, sseStreamConsumer, sseStreamProducer } from './sse';
import { isTrackedEnvelope, sse, tracked } from './tracked';
import { createDeferred } from './utils/createDeferred';
import { createServer } from './utils/createServer';

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
test('e2e, server-sent events (SSE)', async () => {
  async function* data(lastEventId?: Maybe<number>) {
    let i = lastEventId ?? 0;
    while (true) {
      i++;
      yield tracked(String(i), i);

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
    for (const [key, value] of Object.entries(sseHeaders)) {
      res.setHeader(key, value);
    }

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

  const shouldRecreateOnError = createDeferred<void>();
  const ac = new AbortController();
  const iterable = sseStreamConsumer<Data>({
    url: () => server.url,
    signal: ac.signal,
    init: () => ({}),
    deserialize: SuperJSON.deserialize,
    shouldRecreateOnError: vi.fn(() => {
      shouldRecreateOnError.resolve();
      return false;
    }),
  });
  let es: EventSource | null = null;

  function range(start: number, end: number) {
    return Array.from({ length: end - start }, (_, i) => i + start);
  }

  const ITERATIONS = 10;
  const values: number[] = [];
  const allEvents: inferAsyncIterable<typeof iterable>[] = [];
  for await (const value of iterable) {
    allEvents.push(value);
    es = value.eventSource;
    if (value.type === 'error') {
      throw value.error;
    }
    if (value.type === 'data') {
      values.push(value.data.data);
      if (values.length === ITERATIONS) {
        break;
      }
    }
  }
  expect(values).toEqual(range(1, ITERATIONS + 1));

  const release = suppressLogs();
  await Promise.all([
    await server.restart(),
    // wait for an error, the EventSource will reconnect
    await new Promise<void>((resolve) => {
      es!.addEventListener('error', () => {
        resolve();
      });
    }),
  ]);
  release();

  for await (const value of iterable) {
    allEvents.push(value);
    es = value.eventSource;
    if (value.type === 'error') {
      throw value.error;
    }
    if (value.type === 'data') {
      values.push(value.data.data);
      if (values.length === ITERATIONS * 2) {
        break;
      }
    }
  }

  ac.abort();
  await server.close();
  expect(values).toEqual(range(1, ITERATIONS * 2 + 1));

  expect(allEvents.filter((it) => it.type === 'connecting')).toHaveLength(2);
});

test('SSE on serverless - emit and disconnect early', async () => {
  async function* data(lastEventId?: Maybe<number>) {
    let i = lastEventId ?? 0;

    function* yieldEvent() {
      i++;
      yield tracked(String(i), i);
    }
    while (true) {
      // yield 2 events at a time to test if the client will get both without reconnecting in between
      yield* yieldEvent();
      yield* yieldEvent();

      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
  type inferAsyncIterable<T> = T extends AsyncIterable<infer U> ? U : never;
  type Data = inferAsyncIterable<ReturnType<typeof data>>;

  type RequestTrace = {
    lastEventId: string | null;
    written: string[];
  };
  const requests: RequestTrace[] = [];
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

    const requestTrace: RequestTrace = {
      lastEventId,
      written: [],
    };
    requests.push(requestTrace);

    const asNumber = stringToNumber(lastEventId);

    const stream = sseStreamProducer({
      data: data(asNumber),
      serialize: (v) => SuperJSON.serialize(v),
      emitAndEndImmediately: true,
    });
    const reader = stream.getReader();
    for (const [key, value] of Object.entries(sseHeaders)) {
      res.setHeader(key, value);
    }

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }
      res.write(value);
      requestTrace.written.push(value);
    }
    res.end();
  });

  const ac = new AbortController();

  const iterable = sseStreamConsumer<Data>({
    // from: es,
    url: () => server.url,
    signal: ac.signal,
    init: () => ({}),
    deserialize: SuperJSON.deserialize,
  });

  function range(start: number, end: number) {
    return Array.from({ length: end - start }, (_, i) => i + start);
  }

  const ITERATIONS = 3;
  const values: number[] = [];
  for await (const value of iterable) {
    if (value.type === 'opened') {
      continue;
    }
    if (value.type === 'error') {
      throw value.error;
    }
    if (value.type === 'data') {
      values.push(value.data.data);
      if (values.length === ITERATIONS) {
        break;
      }
    }
  }
  expect(values).toEqual(range(1, ITERATIONS + 1));

  expect(requests).toHaveLength(2);
  expect(requests).toMatchInlineSnapshot(`
    Array [
      Object {
        "lastEventId": null,
        "written": Array [
          ": connected
    ",
          "

    ",
          "data: {"json":1}
    ",
          "id: 1
    ",
          "

    ",
          "data: {"json":2}
    ",
          "id: 2
    ",
          "

    ",
        ],
      },
      Object {
        "lastEventId": "2",
        "written": Array [
          ": connected
    ",
          "

    ",
          "data: {"json":3}
    ",
          "id: 3
    ",
          "

    ",
          "data: {"json":4}
    ",
          "id: 4
    ",
          "

    ",
        ],
      },
    ]
  `);

  ac.abort();
  await server.close();
});

test('sse()', () => {
  const event = sse({
    id: String(1),
    data: { json: 1 },
  });
  expect(isTrackedEnvelope(event)).toBe(true);

  // no properties
  sse({
    id: String(1),
    data: { json: 1 },
    // @ts-expect-error extras is not allowed
    extras: {},
  });
});
