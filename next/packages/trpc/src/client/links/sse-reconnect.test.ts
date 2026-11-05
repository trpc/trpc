import {
  createTrpcClient,
  httpLink,
  routerType,
  safe,
} from '@trpc12/trpc/client';
import { initTrpc } from '@trpc12/trpc/server';
import { expect, test } from 'vite-plus/test';

const t = initTrpc();
const router = t.router({
  feed: t.procedure.subscription(async function* () {
    yield 0;
  }),
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (check: () => boolean) => {
  while (!check()) await sleep(1);
};

interface Scripted {
  readonly lastEventId: string | null;
  aborted: boolean;
  push(text: string): void;
  end(): void;
}

/** A `fetch` whose every request is an SSE stream the test writes, or fails while `failing` returns true. */
const scripted = (failing: () => boolean = () => false) => {
  const streams: Scripted[] = [];
  let calls = 0;
  const encoder = new TextEncoder();
  const fetch: typeof globalThis.fetch = async (_input, init) => {
    calls++;
    if (failing()) throw new Error(`fetch ${calls} failed`);
    const headers = new Headers(init?.headers);
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start: (c) => {
        controller = c;
      },
    });
    const stream: Scripted = {
      lastEventId: headers.get('last-event-id'),
      aborted: false,
      push: (text) => {
        if (!stream.aborted) controller.enqueue(encoder.encode(text));
      },
      end: () => controller.close(),
    };
    init?.signal?.addEventListener('abort', () => {
      stream.aborted = true;
    });
    streams.push(stream);
    return new Response(body, {
      headers: { 'content-type': 'text/event-stream' },
    });
  };
  const nth = async (i: number) => {
    await until(() => streams.length > i);
    return streams[i]!;
  };
  return { fetch, streams, nth, calls: () => calls };
};

const connected = 'event: connected\ndata: \n\n';
const reconnect = 'event: reconnect\ndata: \n\n';
const message = (n: number, id?: string) =>
  `${id === undefined ? '' : `id: ${id}\n`}data: ${JSON.stringify({ json: n })}\n\n`;
const done = 'event: done\ndata: \n\n';

const subscribe = (
  fetch: typeof globalThis.fetch,
  opts: {
    reconnect?: { attempts?: number; delay?: (attempt: number) => number };
    call?: { reconnect: false };
  } = {},
) => {
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [
      httpLink({
        url: 'http://localhost/trpc',
        fetch,
        ...(opts.reconnect ? { reconnect: opts.reconnect } : {}),
      }),
    ],
  });
  const events: unknown[] = [];
  const finished = safe(
    (async () => {
      for await (const value of client.feed.subscribe(undefined, opts.call))
        events.push(value);
    })(),
  );
  return { events, finished };
};

test('on reconnect, the link opens a new stream from the last event id while the old one delivers, and leaves the old one once the new one is connected; what the new one resends is dropped by id', async () => {
  const server = scripted();
  const feed = subscribe(server.fetch);
  const old = await server.nth(0);
  old.push(connected + message(1, '1'));
  await until(() => feed.events.length === 1);

  old.push(reconnect);
  const next = await server.nth(1);
  expect(next.lastEventId).toBe('1');
  old.push(message(2, '2'));
  await until(() => feed.events.length === 2);
  expect(old.aborted).toBe(false);

  next.push(connected);
  await until(() => old.aborted);
  next.push(message(2, '2') + message(3, '3') + done);
  await feed.finished;
  expect(feed.events).toEqual([1, 2, 3]);
  expect(server.streams).toHaveLength(2);
});

test('a new stream that fails to open leaves the old one delivering, and the link tries again, however often, without failing the subscription', async () => {
  let failing = false;
  const server = scripted(() => failing);
  const feed = subscribe(server.fetch, {
    reconnect: { attempts: 1, delay: () => 1 },
  });
  const old = await server.nth(0);
  old.push(connected + message(1, '1'));
  await until(() => feed.events.length === 1);

  failing = true;
  old.push(reconnect);
  await until(() => server.calls() > 5);
  old.push(message(2, '2'));
  await until(() => feed.events.length === 2);
  expect(old.aborted).toBe(false);

  failing = false;
  const next = await server.nth(1);
  expect(next.lastEventId).toBe('2');
  next.push(connected + message(3, '3') + done);
  await feed.finished;
  expect(feed.events).toEqual([1, 2, 3]);
  expect(old.aborted).toBe(true);
});

test('an old stream that ends before the new one is connected leaves the subscription on the new one, with no second request', async () => {
  const server = scripted();
  const feed = subscribe(server.fetch);
  const old = await server.nth(0);
  old.push(connected + message(1, '1'));
  old.push(reconnect);
  const next = await server.nth(1);
  old.push(message(2, '2'));
  await until(() => feed.events.length === 2);
  old.end();
  await sleep(5);
  next.push(connected + message(2, '2') + message(3, '3') + done);
  await feed.finished;
  expect(feed.events).toEqual([1, 2, 3]);
  expect(server.streams).toHaveLength(2);
});

test('an old stream that ends while no new one is opening reconnects as after a dropped stream', async () => {
  let failing = false;
  const server = scripted(() => failing);
  const feed = subscribe(server.fetch, { reconnect: { delay: () => 20 } });
  const old = await server.nth(0);
  old.push(connected + message(1, '1'));
  await until(() => feed.events.length === 1);
  failing = true;
  old.push(reconnect);
  await until(() => server.calls() === 2);
  failing = false;
  old.end();
  const next = await server.nth(1);
  expect(next.lastEventId).toBe('1');
  next.push(connected + message(2, '2'));
  await until(() => feed.events.length === 2);
  // The new stream's retry, due about now, doesn't open another.
  await sleep(40);
  next.push(done);
  await feed.finished;
  expect(feed.events).toEqual([1, 2]);
  expect(server.streams).toHaveLength(2);
});

test('a subscription without tracked ids gets every event at least once while both streams deliver', async () => {
  const server = scripted();
  const feed = subscribe(server.fetch);
  const old = await server.nth(0);
  old.push(connected + message(0));
  old.push(reconnect);
  const next = await server.nth(1);
  expect(next.lastEventId).toBeNull();
  old.push(message(1));
  await until(() => feed.events.length === 2);
  next.push(connected + message(0) + done);
  await feed.finished;
  expect(feed.events).toEqual([0, 1, 0]);
});

test('a subscription made with { reconnect: false } ignores reconnect and stays on its stream', async () => {
  const server = scripted();
  const feed = subscribe(server.fetch, { call: { reconnect: false } });
  const old = await server.nth(0);
  old.push(connected + message(1, '1') + reconnect);
  await sleep(10);
  old.push(message(2, '2') + done);
  await feed.finished;
  expect(feed.events).toEqual([1, 2]);
  expect(server.streams).toHaveLength(1);
});

test('an error the new stream sends once connected fails the subscription and leaves the old one', async () => {
  const server = scripted();
  const feed = subscribe(server.fetch);
  const old = await server.nth(0);
  old.push(connected + message(1, '1') + reconnect);
  const next = await server.nth(1);
  next.push(
    connected +
      `event: error\ndata: ${JSON.stringify({ json: { error: { code: 'FORBIDDEN', message: 'no', defined: false } } })}\n\n`,
  );
  const result = await feed.finished;
  expect(result.error).toMatchObject({ code: 'FORBIDDEN' });
  expect(old.aborted).toBe(true);
});
