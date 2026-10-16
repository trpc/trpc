import { createServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { parseAsync, stringifyAsync } from 'devalue-async';
import { EventSource } from 'undici';
import { Effect, Queue, Stream } from 'effect';
import {
  createSerializer,
  jsonSerializer,
  type AnySerializer,
} from '@trpc12/trpc/serializer';
import { expect, test } from 'vite-plus/test';
import {
  createReplay,
  framesOf,
  fromSse,
  parseSse,
  toJsonl,
  toSse,
  type Replay,
  type SseEvent,
} from './sse.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const later = <T>(value: T, ms: number) => sleep(ms).then(() => value);

/** A post whose comments stream, each with a deferred author and replies. */
const post = () => ({
  title: 'Hello',
  comments: (async function* () {
    yield {
      id: 1,
      author: Promise.resolve({ name: 'ada' }),
      replies: (async function* () {
        yield 'first';
        await sleep(5);
        yield { text: 'second', likes: later(3, 5) };
      })(),
    };
    await sleep(5);
    yield { id: 2, author: later({ name: 'grace' }, 10), replies: [] };
  })(),
  total: later(2, 20),
});

const expected = {
  title: 'Hello',
  comments: [
    {
      id: 1,
      author: { name: 'ada' },
      replies: ['first', { text: 'second', likes: 3 }],
    },
    { id: 2, author: { name: 'grace' }, replies: [] },
  ],
  total: 2,
};

/** Awaits every promise and drains every iterable, at any depth. */
async function settle(value: unknown): Promise<unknown> {
  if (value instanceof Promise) return settle(await value);
  if (
    typeof value === 'object' &&
    value !== null &&
    Symbol.asyncIterator in value
  ) {
    const out: unknown[] = [];
    for await (const item of value as AsyncIterable<unknown>)
      out.push(await settle(item));
    return out;
  }
  if (Array.isArray(value)) return Promise.all(value.map(settle));
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      await Promise.all(
        Object.entries(value).map(async ([k, v]) => [k, await settle(v)]),
      ),
    );
  }
  return value;
}

const lines = (
  serializer: AnySerializer = jsonSerializer,
  value: unknown = post(),
) => Stream.map(framesOf(serializer, value), (frame) => JSON.stringify(frame));

const bytes = (text: Stream.Stream<string>) => Stream.encodeText(text);

for (const [name, serializer] of [
  ['plain JSON', jsonSerializer],
  ['danSON', createSerializer()],
] as const) {
  test(`${name}: nested deferred values round-trip over SSE`, async () => {
    const value = await Effect.runPromise(
      fromSse(serializer, parseSse(bytes(toSse(lines(serializer))))),
    );
    expect(await settle(value)).toEqual(expected);
  });
}

test('devalue-async lines carry over SSE the same way', async () => {
  const sse = toSse(
    Stream.fromAsyncIterable(stringifyAsync(post()), String).pipe(
      Stream.map((line) => line.replace(/\n$/, '')),
    ) as Stream.Stream<string>,
  );
  const events = await Effect.runPromise(
    Stream.runCollect(parseSse(bytes(sse))),
  );
  const value = await parseAsync<ReturnType<typeof post>>(
    (async function* () {
      for (const event of events) yield `${event.data}\n`;
    })(),
  );
  expect(await settle(value)).toEqual(expected);
});

test('a dropped connection rejects the deferred values still open', async () => {
  const cut = parseSse(bytes(toSse(lines()))).pipe(Stream.take(3));
  const value = await Effect.runPromise(
    fromSse<any, never>(jsonSerializer, cut),
  );
  await expect(settle(value)).rejects.toThrow('the SSE stream ended early');
});

/** Serves a replay over HTTP; the first connection drops after `dropAfter` events. */
async function replayServer(replay: Replay, dropAfter: number) {
  const seen: Array<string | undefined> = [];
  const server = createServer((req, res: ServerResponse) => {
    const lastEventId = req.headers['last-event-id'] as string | undefined;
    seen.push(lastEventId);
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
    });
    let sent = 0;
    const first = seen.length === 1;
    void Effect.runPromise(
      Stream.runForEach(replay.from(lastEventId), (event) =>
        Effect.sync(() => {
          res.write(event);
          if (first && ++sent === dropAfter) res.socket?.destroy();
        }),
      ),
    ).then(() => res.end());
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}/`, seen, server };
}

test('with a replay, EventSource resumes nested deferred values from Last-Event-ID', async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const replay = yield* createReplay(jsonSerializer, post());
        const { url, seen, server } = yield* Effect.promise(() =>
          replayServer(replay, 3),
        );
        yield* Effect.addFinalizer(() => Effect.sync(() => server.close()));
        const queue = yield* Queue.unbounded<SseEvent>();
        const source = new EventSource(url, { node: { reconnectionTime: 10 } });
        yield* Effect.addFinalizer(() => Effect.sync(() => source.close()));
        source.onmessage = (event) => {
          Queue.offerUnsafe(queue, {
            id: event.lastEventId,
            data: event.data as string,
          });
        };
        const value = yield* fromSse(jsonSerializer, Stream.fromQueue(queue));
        expect(yield* Effect.promise(() => settle(value))).toEqual(expected);
        // The reconnect names the last event that arrived before the drop.
        expect(seen).toEqual([undefined, expect.stringMatching(/^[0-2]$/)]);
      }),
    ),
  );
});

test('SSE framing costs more bytes than JSONL', async () => {
  const many = () => ({
    items: (async function* () {
      for (let i = 0; i < 200; i++) yield { i, at: Promise.resolve(i) };
    })(),
  });
  const size = (text: Stream.Stream<string>) =>
    Effect.runPromise(
      Stream.runFold(
        bytes(text),
        () => 0,
        (n, chunk) => n + chunk.length,
      ),
    );
  const jsonl = await size(toJsonl(lines(jsonSerializer, many())));
  const sse = await size(toSse(lines(jsonSerializer, many())));
  expect(sse / jsonl).toBeGreaterThan(1.3);
  expect(sse / jsonl).toBeLessThan(2);
});
