import { EventSourcePolyfill, NativeEventSource } from 'event-source-polyfill';
import SuperJSON from 'superjson';
import type { Maybe } from '../types';
import type { SSEChunk } from './sse';
import { sseHeaders, sseStreamConsumer, sseStreamProducer } from './sse';
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
