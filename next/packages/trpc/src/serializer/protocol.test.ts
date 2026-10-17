import { MessageChannel } from 'node:worker_threads';
import {
  createTrpcClient,
  httpLink,
  experimental_messagePortLink,
  safe,
  routerType,
  wsLink,
} from '@trpc12/trpc/client';
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
import {
  createSerializer,
  jsonSerializer,
  type CustomType,
} from '@trpc12/trpc/serializer';
import { createTestServer } from '../fixtures/server.ts';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { z } from 'zod';

class Money {
  readonly cents: bigint;
  readonly currency: string;
  constructor(cents: bigint, currency: string) {
    this.cents = cents;
    this.currency = currency;
  }
  add(other: Money) {
    return new Money(this.cents + other.cents, this.currency);
  }
}

const money: CustomType<Money, [string, string]> = {
  is: (v) => v instanceof Money,
  serialize: (v) => [v.cents.toString(), v.currency],
  deserialize: ([cents, currency]) => new Money(BigInt(cents), currency),
};

/** danSON, for the tests of what it keeps that plain JSON doesn't. */
const danson = createSerializer();

const t = initTrpc();

const router = {
  echo: t.procedure
    .input(
      z.object({
        when: z.date(),
        tags: z.set(z.string()),
        scores: z.map(z.string(), z.number()),
        big: z.bigint(),
        maybe: z.string().optional(),
      }),
    )
    .query(({ input }) => ({
      ...input,
      nextDay: new Date(input.when.getTime() + 86_400_000),
      url: new URL('https://trpc.io/docs'),
      nothing: undefined,
    })),
  save: t.procedure
    .input(z.object({ when: z.date(), big: z.bigint() }))
    .mutation((opts) => ({
      year: opts.input.when.getUTCFullYear(),
      big: opts.input.big * 2n,
    })),
  total: t.procedure
    .input(z.object({ items: z.array(z.instanceof(Money)) }))
    .query((opts) =>
      opts.input.items.reduce(
        (sum, item) => sum.add(item),
        new Money(0n, 'EUR'),
      ),
    ),
  len: t.procedure
    .input(z.object({ text: z.string() }))
    .query((opts) => opts.input.text.length),
  pattern: t.procedure.input(z.unknown()).query((opts) => String(opts.input)),
  raw: t.procedure.input(z.unknown()).query((opts) => opts.input),
  greet: t.procedure
    .input(z.object({ name: z.string() }))
    .query((opts) => `hello ${opts.input.name}`),
  write: t.procedure.mutation(() => 'written'),
};
type AppRouter = typeof router;

test('with danSON, built-in types round-trip through inputs and outputs', async () => {
  await using server = await createTestServer({ router, serializer: danson });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: server.url, serializer: danson })],
  });
  const when = new Date('2026-01-02T03:04:05.000Z');
  const result = await client.echo.query({
    when,
    tags: new Set(['a', 'b']),
    scores: new Map([['x', 1]]),
    big: 2n ** 70n,
  });
  expect(result.when).toEqual(when);
  expect(result.nextDay).toEqual(new Date('2026-01-03T03:04:05.000Z'));
  expect(result.tags).toEqual(new Set(['a', 'b']));
  expect(result.scores.get('x')).toBe(1);
  expect(result.big).toBe(2n ** 70n);
  expect(result.url).toBeInstanceOf(URL);
  expect('nothing' in result).toBe(true);
  expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
  expectTypeOf(result.when).toEqualTypeOf<Date>();
  expectTypeOf(result.scores).toEqualTypeOf<Map<string, number>>();
  expectTypeOf(result.big).toEqualTypeOf<bigint>();

  const saved = await client.save.mutate({ when, big: 21n });
  expect(saved).toEqual({ year: 2026, big: 42n });
});

test('custom types work when both ends share a serializer', async () => {
  const serializer = createSerializer({ types: { Money: money } });
  await using server = await createTestServer({ router, serializer });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: server.url, serializer })],
  });
  const total = await client.total.query({
    items: [new Money(150n, 'EUR'), new Money(250n, 'EUR')],
  });
  expect(total).toBeInstanceOf(Money);
  expect(total.cents).toBe(400n);
  expect(total.add(new Money(1n, 'EUR')).cents).toBe(401n);
});

test('long queries fall back to POST', async () => {
  await using server = await createTestServer({ router });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: server.url, maxUrlLength: 100 })],
  });
  expect(await client.len.query({ text: 'short' })).toBe(5);
  expect(server.requests.at(-1)!.method).toBe('GET');
  expect(await client.len.query({ text: 'x'.repeat(500) })).toBe(500);
  expect(server.requests.at(-1)!.method).toBe('POST');
});

test('longQuery: "query" sends long queries with the QUERY method (10 Q10.3)', async () => {
  await using server = await createTestServer({ router });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      httpLink({ url: server.url, maxUrlLength: 100, longQuery: 'query' }),
    ],
  });
  expect(await client.len.query({ text: 'x'.repeat(500) })).toBe(500);
  expect(server.requests.at(-1)!.method).toBe('QUERY');

  const res = await fetch(`${server.url}/save`, {
    method: 'QUERY',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ json: { when: '2026-10-15', big: '1' } }),
  });
  expect(res.status).toBe(405);
});

test('by default, outputs arrive as JSON and the server says which serializer it uses', async () => {
  await using server = await createTestServer({ router });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: server.url })],
  });
  const when = new Date('2026-01-02T03:04:05.000Z');
  const [, err] = await safe(client.raw.query({ big: 1n }));
  expect(err?.message).toContain('BigInt');
  const echoed = await client.raw.query({ at: when, nothing: undefined });
  expect(echoed).toEqual({ at: '2026-01-02T03:04:05.000Z' });
  expectTypeOf(echoed).toEqualTypeOf<unknown>();
  expect(server.requests.at(-1)!.url).toContain('?input=');
  const res = await fetch(
    `${server.url}/greet?input=${encodeURIComponent('{"name":"x"}')}`,
  );
  expect(res.headers.get('trpc-serializer')).toBe('json');
});

test("a link whose serializer isn't the server's fails with UNSUPPORTED_PROTOCOL", async () => {
  await using server = await createTestServer({ router });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: server.url, serializer: danson })],
  });
  const [, err] = await safe(client.greet.query({ name: 'x' }));
  expect(err).toMatchObject({ code: 'UNSUPPORTED_PROTOCOL', defined: false });
  expect(err?.message).toContain("'json' serializer");
  expect(err?.message).toContain("uses 'danson'");
});

test("a socket link whose serializer isn't the server's fails with UNSUPPORTED_PROTOCOL, and the server runs nothing", async () => {
  const t = initTrpc();
  let runs = 0;
  const counter = {
    bump: t.procedure.mutation(() => ++runs),
  };
  await using server = await createTestServer({ router: counter });
  await using ws = wsLink({ url: server.wsUrl, serializer: danson });
  const client = createTrpcClient({
    router: routerType<typeof counter>(),
    links: [ws],
  });
  for (let i = 0; i < 2; i++) {
    const [, err] = await safe(client.bump.mutate());
    expect(err).toMatchObject({ code: 'UNSUPPORTED_PROTOCOL' });
    expect(err?.message).toBe(
      "The server uses the 'json' serializer, but this wsLink uses 'danson'. Pass the same serializer to the handler and wsLink.",
    );
  }

  const channel = new MessageChannel();
  createFetchHandler({ router: counter, serializer: danson }).messagePort(
    channel.port1,
  );
  const port = experimental_messagePortLink({ port: channel.port2 });
  const portClient = createTrpcClient({
    router: routerType<typeof counter>(),
    links: [port],
  });
  try {
    const [, err] = await safe(portClient.bump.mutate());
    expect(err?.message).toContain(
      "The server uses the 'danson' serializer, but this experimental_messagePortLink uses 'json'",
    );
  } finally {
    await port.close();
    channel.port1.close();
    channel.port2.close();
  }
  expect(runs).toBe(0);
});

test('query URLs are canonical: ?input= is JSON with object keys sorted, array order kept', async () => {
  await using server = await createTestServer({ router });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: server.url })],
  });
  await client.raw.query({ b: 1, a: { d: [3, 1], c: 2 } });
  await client.raw.query({ a: { c: 2, d: [3, 1] }, b: 1 });
  const [first, second] = server.requests.slice(-2).map((r) => r.url);
  expect(first).toBe(second);
  expect(new URL(first!).searchParams.get('input')).toBe(
    '{"a":{"c":2,"d":[3,1]},"b":1}',
  );
});

test('with danSON, inputs cannot carry RegExps', async () => {
  await using server = await createTestServer({ router, serializer: danson });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: server.url, serializer: danson })],
  });
  const [, err] = await safe(client.pattern.query(/(a+)+$/));
  expect(err).toMatchObject({ code: 'PARSE_ERROR' });
});

// --- the wire protocol, with plain fetch ---------------------------------------------

test('responses are `{ json }` documents', async () => {
  await using server = await createTestServer({ router });
  const res = await fetch(
    `${server.url}/greet?input=${encodeURIComponent('{"name":"you"}')}`,
  );
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toBe('application/json');
  expect(res.headers.get('trpc-version')).toBe('12');
  expect(await res.json()).toEqual({ json: 'hello you' });
});

test('mutations must be POSTed', async () => {
  await using server = await createTestServer({ router });
  const res = await fetch(`${server.url}/write`);
  expect(res.status).toBe(405);
  expect(await res.json()).toMatchObject({
    json: { error: { code: 'METHOD_NOT_SUPPORTED' } },
  });
});

test('POSTs need a JSON content type, so forms cannot forge calls', async () => {
  await using server = await createTestServer({ router });
  const res = await fetch(`${server.url}/write`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: '',
  });
  expect(res.status).toBe(415);
  const ok = await fetch(`${server.url}/write`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  });
  expect(await ok.json()).toEqual({ json: 'written' });
});

test('a different protocol version is rejected', async () => {
  await using server = await createTestServer({ router });
  const res = await fetch(`${server.url}/greet`, {
    headers: { 'trpc-version': '2' },
  });
  expect(res.status).toBe(400);
  expect(await res.json()).toMatchObject({
    json: { error: { code: 'UNSUPPORTED_PROTOCOL' } },
  });
});

test('bodies above maxBodySize are rejected', async () => {
  await using server = await createTestServer({ router, maxBodySize: 64 });
  const res = await fetch(`${server.url}/len`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ json: { text: 'x'.repeat(100) } }),
  });
  expect(res.status).toBe(413);
});

test('?input= cannot reach prototype keys, and malformed JSON is a PARSE_ERROR', async () => {
  await using server = await createTestServer({ router });
  const input = (json: string) =>
    fetch(`${server.url}/raw?input=${encodeURIComponent(json)}`);
  const own = await input('{"toString":{"a":1},"__proto__":{"x":1}}');
  expect(await own.json()).toEqual({
    json: JSON.parse('{"toString":{"a":1},"__proto__":{"x":1}}'),
  });
  expect(({} as Record<string, unknown>)['x']).toBeUndefined();
  const malformed = await input('{nope');
  expect(malformed.status).toBe(400);
  expect(await malformed.json()).toMatchObject({
    json: { error: { code: 'PARSE_ERROR' } },
  });
});

test('?input= reads as URLSearchParams does: the first one, `+` as space, encoded keys, lenient escapes', async () => {
  await using server = await createTestServer({ router });
  const read = async (search: string) =>
    (await (await fetch(`${server.url}/raw?${search}`)).json()) as unknown;
  expect(await read('x=1&&input=%22a+b%22&input=2')).toEqual({ json: 'a b' });
  expect(await read('inp%75t=%22k%22')).toEqual({ json: 'k' });
  // `%E0%A4` isn't UTF-8 here; URLSearchParams decodes it to U+FFFD.
  expect(await read('input=%22%E0%A4%22')).toEqual({ json: '\uFFFD' });
});

test('serialized output is plain objects, with `__proto__` kept as an own key', () => {
  const value = JSON.parse('{"post":{"__proto__":{"x":1},"at":"y"}}');
  for (const serializer of [jsonSerializer, danson]) {
    const serialized = serializer.serialize(value);
    const json = serialized.json as { post: Record<string, unknown> };
    expect(Object.getPrototypeOf(json)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(json.post)).toBe(Object.prototype);
    expect(Object.hasOwn(json.post, '__proto__')).toBe(true);
  }
  expect(({} as Record<string, unknown>)['x']).toBeUndefined();
  expect(() => danson.deserialize(danson.serialize(value))).toThrow(
    'Forbidden key: __proto__',
  );
});

test('malformed JSON is a PARSE_ERROR', async () => {
  await using server = await createTestServer({ router });
  const res = await fetch(`${server.url}/len`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{nope',
  });
  expect(res.status).toBe(400);
  expect(await res.json()).toMatchObject({
    json: { error: { code: 'PARSE_ERROR' } },
  });
});

test('the endpoint is configurable', async () => {
  await using server = await createTestServer({ router, endpoint: '/api/rpc' });
  expect(server.url.endsWith('/api/rpc')).toBe(true);
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: server.url })],
  });
  expect(await client.greet.query({ name: 'there' })).toBe('hello there');
  const outside = await fetch(server.url.replace('/api/rpc', '/trpc/greet'));
  expect(outside.status).toBe(404);
});
