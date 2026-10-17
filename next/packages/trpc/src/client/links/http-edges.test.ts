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
  echo: t.procedure.input(z.unknown()).query((opts) => opts.input ?? 'none'),
  slow: t.procedure.query(async (opts) => {
    await new Promise<void>((resolve) => {
      opts.signal.addEventListener('abort', () => {
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
  const [, moved] = await safe(page(302).echo.query(1));
  expect(moved).toMatchObject({
    code: 'PARSE_ERROR',
    message: 'Unexpected 302 response',
  });

  const body = (json: unknown, status: number) =>
    clientWith(
      async () => new Response(JSON.stringify({ json }), { status }),
    ).echo.query(1);
  expect((await safe(body('oops', 500)))[1]).toMatchObject({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'INTERNAL_SERVER_ERROR',
    defined: false,
  });
  expect(
    (await safe(body({ error: { code: 7, message: null } }, 400)))[1],
  ).toMatchObject({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'INTERNAL_SERVER_ERROR',
  });

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

  // The default delay before the first retry is a second.
  let tries = 0;
  const started = Date.now();
  const slow = clientWith(
    (input, init) =>
      ++tries < 2
        ? Promise.reject(new TypeError('refused'))
        : real(input, init),
    { reconnect: { attempts: 1 } },
  );
  expect(await collect(slow.ticks.subscribe())).toEqual([1, 2]);
  expect(Date.now() - started).toBeGreaterThanOrEqual(900);

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

test('a streamed result whose deferred slot has no place, or whose chunk is unreadable, fails', async () => {
  const jsonl = (...lines: string[]) =>
    new Response(lines.join('\n') + '\n', {
      headers: {
        'content-type': 'application/jsonl',
        'trpc-serializer': 'json',
        'trpc-version': '12',
      },
    });
  const nowhere = clientWith(async () =>
    jsonl('{"json":{"a":1},"d":[[["x","y"],0,"Promise"]]}', '[0,0,{"json":1}]'),
  );
  const [, err] = await safe(
    Promise.race([nowhere.echo.query('x'), sleep(1000).then(() => 'hung')]),
  );
  expect(err).toMatchObject({
    message: expect.stringContaining('no place in the result'),
  });

  const unreadable = clientWith(async () =>
    jsonl('{"json":{"a":null},"d":[[["a"],0,"Promise"]]}', '[0,0,{"json":1},'),
  );
  const out = (await unreadable.echo.query('x')) as { a: Promise<unknown> };
  await expect(out.a).rejects.toBeDefined();
});

test('forged batch lines: a call answered twice keeps its first answer; unreadable bodies fail their calls', async () => {
  const lines = (...values: unknown[]) =>
    new Response(
      new TextEncoder().encode(
        values.map((v) => JSON.stringify(v)).join('\n') + '\n',
      ),
    );
  const twice = clientWith(
    async () =>
      lines(
        { i: 0, status: 200, body: { json: 'late' } },
        {
          i: 0,
          status: 409,
          body: { json: { error: { code: 'CONFLICT', message: 'first' } } },
        },
        {
          i: 1,
          status: 409,
          body: { json: { error: { code: 'CONFLICT', message: 'first' } } },
        },
        {
          i: 1,
          status: 409,
          body: { json: { error: { code: 'CONFLICT', message: 'second' } } },
        },
      ),
    { batch: true },
  );
  const [[, zero], [, one]] = await Promise.all([
    safe(twice.echo.query('a')),
    safe(twice.echo.query('b')),
  ]);
  expect(zero).toMatchObject({ code: 'CONFLICT', message: 'first' });
  expect(one).toMatchObject({ code: 'CONFLICT', message: 'first' });
});

test('forged batch lines with unreadable bodies fail their calls alone; broken streams fail the rest', async () => {
  const lines = (...values: unknown[]) =>
    new Response(
      new TextEncoder().encode(
        values.map((v) => JSON.stringify(v)).join('\n') + '\n',
      ),
    );
  const unreadable = clientWith(
    async () =>
      lines(
        { i: 0, status: 200, body: null },
        { i: 1, status: 500, body: null },
      ),
    { batch: true },
  );
  const [[, result], [, error]] = await Promise.all([
    safe(unreadable.echo.query('a')),
    safe(unreadable.echo.query('b')),
  ]);
  expect(result?.code).toBe('NETWORK_ERROR');
  expect(error).toMatchObject({
    code: 'PARSE_ERROR',
    message: 'Invalid error message',
  });

  // A line that isn't a batch line, or isn't JSON, or a request that
  // fails, fails every call not answered yet.
  const cases: Array<[typeof fetch, string]> = [
    [
      async () => lines({ i: 0, status: 200, body: { json: 'ok' } }, null),
      'ok',
    ],
    [
      async () =>
        new Response('{"i":0,"status":200,"body":{"json":"ok"}}\n{no\n'),
      'ok',
    ],
    [() => Promise.reject(new TypeError('offline')), 'NETWORK_ERROR'],
  ];
  for (const [fetch, first] of cases) {
    const broken = clientWith(fetch, { batch: true });
    const [a, [, b]] = await Promise.all([
      safe(broken.echo.query('a')),
      safe(broken.echo.query('b')),
    ]);
    expect(a.error?.code ?? a.data).toBe(first);
    expect(b?.code).toBe('NETWORK_ERROR');
  }
});

test('a batch whose calls were all aborted before it was sent sends nothing', async () => {
  let requests = 0;
  const client = clientWith(
    (input, init) => {
      requests++;
      return real(input, init);
    },
    { batch: true },
  );
  const controller = new AbortController();
  const call = safe(client.echo.query('a', { signal: controller.signal }));
  controller.abort();
  expect((await call).error).toMatchObject({ code: 'CLIENT_CLOSED_REQUEST' });
  await sleep(10);
  expect(requests).toBe(0);
});
