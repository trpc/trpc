import { createTrpcClient, httpLink, safe } from 'trpcdev/client';
import { initTrpc } from 'trpcdev/server';
import { createSerializer, type CustomType } from 'trpcdev/serializer';
import { createTestServer } from './fixtures/server.ts';
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
    .mutation(({ input }) => ({
      year: input.when.getUTCFullYear(),
      big: input.big * 2n,
    })),
  total: t.procedure
    .input(z.object({ items: z.array(z.instanceof(Money)) }))
    .query(({ input }) =>
      input.items.reduce((sum, item) => sum.add(item), new Money(0n, 'EUR')),
    ),
  len: t.procedure
    .input(z.object({ text: z.string() }))
    .query(({ input }) => input.text.length),
  pattern: t.procedure.input(z.unknown()).query(({ input }) => String(input)),
  raw: t.procedure.input(z.unknown()).query(({ input }) => input),
  greet: t.procedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => `hello ${input.name}`),
  write: t.procedure.mutation(() => 'written'),
};
type AppRouter = typeof router;

test('built-in types round-trip through inputs and outputs', async () => {
  await using server = await createTestServer({ router });
  const client = createTrpcClient<AppRouter>({
    links: [httpLink({ url: server.url })],
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
  const client = createTrpcClient<AppRouter>({
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
  const client = createTrpcClient<AppRouter>({
    links: [httpLink({ url: server.url, maxUrlLength: 100 })],
  });
  expect(await client.len.query({ text: 'short' })).toBe(5);
  expect(server.requests.at(-1)!.method).toBe('GET');
  expect(await client.len.query({ text: 'x'.repeat(500) })).toBe(500);
  expect(server.requests.at(-1)!.method).toBe('POST');
});

test('inputs cannot carry RegExps', async () => {
  await using server = await createTestServer({ router });
  const client = createTrpcClient<AppRouter>({
    links: [httpLink({ url: server.url })],
  });
  const [, err] = await safe(client.pattern.query(/(a+)+$/));
  expect(err).toMatchObject({ code: 'PARSE_ERROR', status: 400 });
});

// --- the wire protocol, with plain fetch ---------------------------------------------

test('responses are `{ json }` documents', async () => {
  await using server = await createTestServer({ router });
  const res = await fetch(`${server.url}/greet?name=you`);
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toBe('application/json');
  expect(res.headers.get('trpc-version')).toBe('1');
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
  const res = await fetch(`${server.url}/greet?name=x`, {
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

test('query params cannot reach inherited or prototype keys', async () => {
  await using server = await createTestServer({ router });
  const inherited = await fetch(`${server.url}/raw?toString[a]=1`);
  expect(await inherited.json()).toEqual({ json: { toString: { a: 1 } } });
  for (const key of ['__proto__[x]=1', 'constructor[prototype][x]=1']) {
    const res = await fetch(`${server.url}/raw?${key}`);
    expect(res.status).toBe(400);
  }
  expect(({} as Record<string, unknown>)['x']).toBeUndefined();
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
  const client = createTrpcClient<AppRouter>({
    links: [httpLink({ url: server.url })],
  });
  expect(await client.greet.query({ name: 'there' })).toBe('hello there');
  const outside = await fetch(server.url.replace('/api/rpc', '/trpc/greet'));
  expect(outside.status).toBe(404);
});
