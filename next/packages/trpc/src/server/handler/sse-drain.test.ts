import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { createFetchHandler, initTrpc, tracked } from '@trpc12/trpc/server';
import { expect, test } from 'vite-plus/test';

const t = initTrpc<{ ctx: { server: string } }>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (check: () => boolean) => {
  while (!check()) await sleep(1);
};

/** The tracked feed's events, shared by every server: event `i` has id `i`. */
const log: number[] = [];
const listeners = new Set<() => void>();
const publish = (n: number) => {
  log.push(n);
  for (const listener of listeners) listener();
};
const resumes: string[] = [];

const router = t.router({
  feed: t.procedure.subscription(async function* (opts) {
    const { lastEventId } = opts;
    resumes.push(`${opts.ctx.server}:${lastEventId ?? '-'}`);
    let next = lastEventId === undefined ? 0 : Number(lastEventId) + 1;
    while (!opts.signal.aborted) {
      for (; next < log.length; next++) yield tracked(String(next), log[next]!);
      let wake!: () => void;
      await new Promise<void>((resolve) => {
        wake = resolve;
        listeners.add(wake);
        opts.signal.addEventListener('abort', wake);
      });
      listeners.delete(wake);
    }
  }),
});

const make = (
  server: string,
  sse?: Parameters<typeof createFetchHandler>[0]['sse'],
) =>
  createFetchHandler({
    router,
    createContext: () => ({ server }),
    sse: { pingInterval: false, ...sse },
  });

/** Opens `feed` on `handler` as raw SSE and collects its text. */
const open = async (handler: ReturnType<typeof make>) => {
  const abort = new AbortController();
  const response = await handler.fetch(
    new Request('http://localhost/trpc/feed', {
      headers: { accept: 'text/event-stream' },
      signal: abort.signal,
    }),
  );
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const stream = { text: '', ended: false, abort: () => abort.abort() };
  void (async () => {
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        stream.text += decoder.decode(chunk.value);
      }
    } catch {
      // aborted
    }
    stream.ended = true;
  })();
  return stream;
};

const reset = () => {
  log.length = 0;
  resumes.length = 0;
};

test('an SSE subscription starts with a connected event', async () => {
  reset();
  await using handler = make('a');
  const stream = await open(handler);
  await until(() => stream.text.length > 0);
  expect(stream.text).toBe('event: connected\ndata: \n\n');
  stream.abort();
});

test('with sse.maxDuration, the server sends reconnect reconnectNotice before it, then ends the stream without done', async () => {
  reset();
  await using handler = make('a', {
    maxDuration: '80 millis',
    reconnectNotice: '50 millis',
  });
  const started = Date.now();
  const stream = await open(handler);
  await until(() => stream.text.includes('event: reconnect'));
  const noticed = Date.now() - started;
  expect(noticed).toBeGreaterThanOrEqual(20);
  expect(noticed).toBeLessThan(70);
  expect(stream.ended).toBe(false);
  await until(() => stream.ended);
  expect(Date.now() - started).toBeGreaterThanOrEqual(70);
  expect(stream.text).not.toContain('event: done');
});

test('a maxDuration shorter than the default notice sends reconnect at once', async () => {
  reset();
  await using handler = make('a', { maxDuration: '30 millis' });
  const stream = await open(handler);
  await until(() => stream.text.includes('event: reconnect'));
  await until(() => stream.ended);
  expect(stream.text).not.toContain('event: done');
});

test('a stream that starts during a drain is not asked to move, so its client stays; the handler ends it when it closes', async () => {
  reset();
  const handler = make('a');
  const first = await open(handler);
  await until(() => first.text.includes('connected'));
  const drain = handler.drain({ timeout: '50 millis' });
  await until(() => first.text.includes('event: reconnect'));
  const late = await open(handler);
  await drain;
  expect(late.text).toBe('event: connected\ndata: \n\n');
  expect(late.ended).toBe(false);
  await handler.dispose();
  await until(() => late.ended);
  expect(late.text).not.toContain('event: reconnect');
});

test('drain() sends reconnect to open SSE streams and waits for their clients to leave', async () => {
  reset();
  await using handler = make('a');
  const stream = await open(handler);
  await until(() => stream.text.includes('connected'));
  let drained = false;
  const drain = handler
    .drain({ timeout: '5 seconds' })
    .then(() => (drained = true));
  await until(() => stream.text.includes('event: reconnect'));
  publish(0);
  await until(() => stream.text.includes('id: 0'));
  await sleep(10);
  expect(drained).toBe(false);
  stream.abort();
  await drain;
  expect(drained).toBe(true);
});

test('a stream whose client stays is ended at the drain timeout, without done', async () => {
  reset();
  await using handler = make('a');
  const stream = await open(handler);
  await until(() => stream.text.includes('connected'));
  const started = Date.now();
  await handler.drain({ timeout: '50 millis' });
  expect(Date.now() - started).toBeGreaterThanOrEqual(40);
  await until(() => stream.ended);
  expect(stream.text).toContain('event: reconnect');
  expect(stream.text).not.toContain('event: done');
});

test('dispose() asks SSE clients to reconnect before it ends their streams', async () => {
  reset();
  const handler = make('a');
  const stream = await open(handler);
  await until(() => stream.text.includes('connected'));
  const disposed = handler.dispose();
  await until(() => stream.text.includes('event: reconnect'));
  stream.abort();
  await disposed;
});

test('httpLink moves a subscription off a draining server: the old stream delivers until the new one is connected, with no gap and no duplicate', async () => {
  reset();
  await using a = make('a');
  await using b = make('b');
  let target = a;
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [
      httpLink({
        url: 'http://localhost/trpc',
        fetch: (input, init) =>
          target.fetch(new Request(input as string, init as RequestInit)),
      }),
    ],
  });
  const events: unknown[] = [];
  const abort = new AbortController();
  const done = (async () => {
    for await (const value of client.feed.subscribe(undefined, {
      signal: abort.signal,
    }))
      events.push(value);
  })().catch(() => {});

  publish(0);
  await until(() => events.length === 1);
  target = b;
  const drained = a.drain({ timeout: '5 seconds' });
  publish(1);
  publish(2);
  await drained;
  publish(3);
  await until(() => events.length === 4);
  expect(events).toEqual([0, 1, 2, 3].map((n) => ({ id: String(n), data: n })));
  expect(resumes[0]).toBe('a:-');
  expect(resumes[1]).toMatch(/^b:\d$/);
  abort.abort();
  await done;
});
