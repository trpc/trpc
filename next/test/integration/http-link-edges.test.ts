import {
  createTrpcClient,
  httpLink,
  routerType,
  safe,
  type HttpLinkOptions,
} from '@trpc12/trpc/client';
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
import { expect, test } from 'vite-plus/test';
import { z } from 'zod';

const t = initTrpc();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let aborted = 0;
const router = {
  echo: t.procedure.input(z.unknown()).query(({ input }) => input ?? 'none'),
  slow: t.procedure.query(async ({ signal }) => {
    await new Promise<void>((resolve) => {
      signal.addEventListener('abort', () => {
        aborted++;
        resolve();
      });
    });
    return 'never seen';
  }),
  ticks: t.procedure.subscription(async function* () {
    yield 1;
    yield 2;
  }),
};

const handler = createFetchHandler({ router, batch: true });
const real: typeof fetch = (input, init) =>
  handler.fetch(new Request(input as string, init as RequestInit));

function clientWith(
  fetch: typeof globalThis.fetch,
  opts: Partial<HttpLinkOptions> = {},
) {
  return createTrpcClient({
    router: routerType<typeof router>(),
    links: [httpLink({ url: 'http://localhost/trpc', fetch, ...opts })],
  });
}

const sse = (text: string) =>
  new Response(text, { headers: { 'content-type': 'text/event-stream' } });

async function collect<T>(iterable: AsyncIterable<T>) {
  const items: T[] = [];
  for await (const item of iterable) items.push(item);
  return items;
}

test('fetch failures and pages that are not tRPC errors', async () => {
  const [, thrown] = await safe(
    clientWith(() => Promise.reject('down')).echo.query(1),
  );
  expect(thrown).toMatchObject({
    code: 'NETWORK_ERROR',
    message: 'Network error',
  });

  const page = (status: number) =>
    clientWith(async () => new Response('<html>oops</html>', { status }));
  const [, gateway] = await safe(page(502).echo.query(1));
  expect(gateway).toMatchObject({
    code: 'BAD_GATEWAY',
    message: 'Unexpected 502 response',
  });
  const [, teapot] = await safe(page(418).echo.query(1));
  expect(teapot).toMatchObject({ code: 'PARSE_ERROR' });

  const empty = clientWith(async () => new Response(null, { status: 200 }));
  expect(await empty.echo.query(1)).toBeUndefined();
});

test('calls with differing inits batch apart; ones JSON cannot key go alone', async () => {
  const requests: string[] = [];
  const client = clientWith(
    (input, init) => {
      requests.push(
        `${init?.method} ${String(input as string).replace('http://localhost', '')} ${init?.cache ?? ''}`,
      );
      return real(input, init);
    },
    { batch: {} },
  );
  const results = await Promise.all([
    client.echo.query('a', { init: { cache: 'no-store', mode: 'cors' } }),
    client.echo.query('b', { init: { mode: 'cors', cache: 'no-store' } }),
    client.echo.query('c'),
    client.echo.query('d', {
      init: { cache: 'reload', weird: 1n } as never,
    }),
  ]);
  expect(results).toEqual(['a', 'b', 'c', 'd']);
  expect(requests.sort()).toEqual([
    'GET /trpc/echo?input=%22d%22 reload',
    'POST /trpc ',
    'POST /trpc no-store',
  ]);
});

test('an input the serializer cannot write fails alone, outside the batch', async () => {
  const client = clientWith(real, { batch: true });
  const loop: Record<string, unknown> = {};
  loop['self'] = loop;
  const [ok, [, err]] = await Promise.all([
    client.echo.query('fine'),
    safe(client.echo.query(loop)),
  ]);
  expect(ok).toBe('fine');
  expect(err).toMatchObject({ code: 'BAD_REQUEST' });
});

test('aborting every call in a batch aborts its request', async () => {
  const before = aborted;
  const client = clientWith(real, { batch: true });
  const one = new AbortController();
  const two = new AbortController();
  const calls = Promise.all([
    safe(client.slow.query(undefined, { signal: one.signal })),
    safe(client.slow.query(undefined, { signal: two.signal })),
  ]);
  await sleep(20);
  one.abort();
  await sleep(5);
  expect(aborted).toBe(before);
  two.abort();
  const [[, a], [, b]] = await calls;
  expect(a).toMatchObject({ code: 'CLIENT_CLOSED_REQUEST' });
  expect(b).toMatchObject({ code: 'CLIENT_CLOSED_REQUEST' });
  await sleep(20);
  expect(aborted).toBe(before + 2);
});

test('a batch response that ends early, or names calls it was not sent, fails the rest', async () => {
  const client = clientWith(
    async () =>
      new Response(
        [
          JSON.stringify({ i: 0, status: 200, body: { json: 'first' } }),
          JSON.stringify({ i: 9, status: 200, body: { json: 'stray' } }),
          '',
        ].join('\n'),
      ),
    { batch: true },
  );
  const [first, [, second]] = await Promise.all([
    client.echo.query('a'),
    safe(client.echo.query('b')),
  ]);
  expect(first).toBe('first');
  expect(second).toMatchObject({
    code: 'PARSE_ERROR',
    message: 'The batch response ended without a result',
  });
});

test('subscriptions: turned off, malformed events, unknown events', async () => {
  const off = clientWith(real, { subscriptions: false });
  await expect(collect(off.ticks.subscribe())).rejects.toMatchObject({
    code: 'METHOD_NOT_SUPPORTED',
  });

  const odd = clientWith(async () =>
    sse(
      [
        'event: unknown\ndata: ignored\n\n',
        'event: unknown\ndata\nretry\n\n',
        'data: {"json":1}\n\n',
        'event: done\n\n',
      ].join(''),
    ),
  );
  expect(await collect(odd.ticks.subscribe())).toEqual([1]);

  for (const event of [
    'event: error\ndata: {not json\n\n',
    'event: chunk\ndata: {not json\n\n',
    'data: {not json\n\n',
  ]) {
    const broken = clientWith(async () => sse(event), {
      reconnect: { attempts: 0, delayMs: () => 1 },
    });
    await expect(collect(broken.ticks.subscribe())).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
  }
});

test('a subscription retries a failed connect, then reads the stream', async () => {
  let attempts = 0;
  const flaky = clientWith(
    (input, init) =>
      ++attempts < 3
        ? Promise.reject(new TypeError('refused'))
        : real(input, init),
    { reconnect: { attempts: 5, delayMs: () => 1 } },
  );
  expect(await collect(flaky.ticks.subscribe())).toEqual([1, 2]);
  expect(attempts).toBe(3);

  const empty = clientWith(async () => sse(''), {
    reconnect: { attempts: 1, delayMs: () => 1 },
  });
  await expect(collect(empty.ticks.subscribe())).rejects.toMatchObject({
    code: 'NETWORK_ERROR',
    message: 'The subscription connection was lost',
  });

  const down = clientWith(() => Promise.reject(new TypeError('refused')), {
    reconnect: { attempts: 1, delayMs: () => 1 },
  });
  await expect(collect(down.ticks.subscribe())).rejects.toMatchObject({
    code: 'NETWORK_ERROR',
    message: 'refused',
  });
});

test('a stream that ends inside a UTF-8 character, after an event, is lost', async () => {
  const bytes = new Uint8Array([
    ...new TextEncoder().encode('data: {"json":1}\n\n'),
    0xe2,
  ]);
  const cut = clientWith(
    async () =>
      new Response(bytes, { headers: { 'content-type': 'text/event-stream' } }),
    { reconnect: { attempts: 0, delayMs: () => 1 } },
  );
  const seen: unknown[] = [];
  await expect(
    (async () => {
      for await (const value of cut.ticks.subscribe()) seen.push(value);
    })(),
  ).rejects.toMatchObject({ message: 'The subscription connection was lost' });
  expect(seen).toEqual([1]);
});
