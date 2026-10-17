import { Schema } from 'effect';
import {
  createTrpcClient,
  httpLink,
  safe,
  validationLink,
} from '@trpc12/trpc/client';
import {
  type AnyContractRouter,
  contract,
  toContract,
} from '@trpc12/trpc/contract';
import {
  createOpenApiHandler,
  openapi,
  openApiLink,
} from '@trpc12/trpc/openapi';
import { createUntypedClient } from '@trpc12/trpc/extend';
import { type AnyRouter, initTrpc, stream, tracked } from '@trpc12/trpc/server';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { z } from 'zod';
import { createTestServer } from '../../fixtures/server.ts';

const Post = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  at: Schema.Date,
});

const c = contract.create().concat(openapi());
const appContract = {
  post: {
    byId: c
      .input(z.object({ id: z.string().min(1) }))
      .output(Post)
      .meta({ route: { method: 'GET', path: '/posts/{id}' } })
      .query(),
    feed: c.output(Post).subscription({ tracked: true }),
  },
} satisfies AnyContractRouter;

const t = initTrpc().concat(openapi());
const at = new Date('2026-10-16T00:00:00.000Z');
const impl = t.implement(appContract);
const router = impl.router({
  post: {
    byId: impl.post.byId.query((opts) => ({
      id: opts.input.id,
      title: 'Hello',
      at,
    })),
    feed: impl.post.feed.subscription(async function* () {
      yield tracked('1', { id: '1', title: 'One', at });
    }),
  },
});

test('invalid inputs fail on the client with the server error shape, before any request', async () => {
  await using http = await createTestServer({ router });
  const client = createTrpcClient({
    router: appContract,
    links: [
      validationLink({ contract: appContract, output: 'json' }),
      httpLink({ url: http.url }),
    ],
  });
  const [, err] = await safe(client.post.byId.query({ id: '' }));
  expect(err).toMatchObject({ code: 'BAD_REQUEST', defined: true });
  if (err?.defined && err.code === 'BAD_REQUEST') {
    expect(err.data.issues[0]?.path).toEqual(['id']);
  }
  expect(http.requests).toHaveLength(0);

  const post = await client.post.byId.query({ id: '1' });
  expect(post).toEqual({ id: '1', title: 'Hello', at });
  expect(http.requests).toHaveLength(1);

  const events = [];
  for await (const event of client.post.feed.subscribe()) events.push(event);
  expect(events).toEqual([{ id: '1', data: { id: '1', title: 'One', at } }]);
});

test('results that drift from the contract fail with PARSE_ERROR', async () => {
  await using http = await createTestServer({
    router: {
      post: {
        byId: t.procedure
          .input(z.object({ id: z.string() }))
          .query((opts) => ({ id: Number(opts.input.id), title: 'Hello', at })),
        feed: t.procedure.subscription(async function* () {
          yield tracked('1', { id: '1', title: 2, at });
        }),
      },
    },
  });
  const client = createTrpcClient({
    router: appContract,
    links: [
      validationLink({ contract: appContract }),
      httpLink({ url: http.url }),
    ],
  });
  const [, err] = await safe(client.post.byId.query({ id: '1' }));
  expect(err).toMatchObject({ code: 'PARSE_ERROR', defined: false });
  expect(err?.message).toContain('Response validation failed');

  await expect(async () => {
    for await (const _ of client.post.feed.subscribe()) void _;
  }).rejects.toMatchObject({ code: 'PARSE_ERROR' });
});

test("output: 'json' decodes openApiLink's plain JSON into the schema's types", async () => {
  const openapi = createOpenApiHandler({ router });
  const json = toContract(appContract);
  const fetchVia = (input: RequestInfo | URL, init?: RequestInit) =>
    openapi.fetch(new Request(input, init));

  const plain = createTrpcClient({
    router: json,
    links: [
      openApiLink({ url: 'http://localhost', contract: json, fetch: fetchVia }),
    ],
  });
  const raw = await plain.post.byId.query({ id: '1' });
  expectTypeOf(raw.at).toEqualTypeOf<string>();
  expect(raw.at).toBe(at.toISOString());

  const decoded = createTrpcClient({
    router: json,
    links: [
      validationLink({ contract: appContract, output: 'json' }),
      openApiLink({ url: 'http://localhost', contract: json, fetch: fetchVia }),
    ],
  });
  const post = await decoded.post.byId.query({ id: '1' });
  expectTypeOf(post.at).toEqualTypeOf<Date>();
  expect(post.at).toBeInstanceOf(Date);
  expect(post.at.getTime()).toBe(at.getTime());
  await openapi.dispose();
});

test('streamed outputs, unvalidated outputs, plain events, opt-outs and paths outside the contract', async () => {
  const p = initTrpc();
  const contractOf = {
    tokens: p.procedure.output(stream(z.string())).query(async function* () {}),
    numbers: p.procedure
      .output(stream(z.number()))
      .subscription(async function* () {}),
    plain: p.procedure.output(z.number()).subscription(async function* () {}),
    trusted: p.procedure
      .output(z.object({ n: z.number() }), { validate: false })
      .query(() => ({ n: 1 })),
    strict: p.procedure
      .input(z.object({ n: z.number() }))
      .output(z.number())
      .query((opts) => opts.input.n),
    perCall: p.procedure
      .input(() => z.object({ n: z.number() }))
      .query((opts) => opts.input.n),
    nested: { leaf: p.procedure.output(z.number()).query(() => 1) },
  } satisfies AnyRouter;
  await using http = await createTestServer({
    router: {
      perCall: p.procedure
        .input(z.unknown())
        .query(() => 'checked by the server'),
      tokens: p.procedure.query(async function* () {
        yield 'a';
        yield 'b';
      }),
      numbers: p.procedure.subscription(async function* () {
        yield 1;
        yield 'two';
      }),
      plain: p.procedure.subscription(async function* () {
        yield 1;
        yield 'two';
      }),
      trusted: p.procedure.query(() => ({ n: 'not a number' })),
      strict: p.procedure.input(z.unknown()).query(() => 'unchecked'),
      extra: p.procedure.query(() => 'not in the contract'),
    },
  });
  const client = (opts: Parameters<typeof validationLink>[0]) =>
    createUntypedClient({
      links: [validationLink(opts), httpLink({ url: http.url })],
    });
  const checked = client({ contract: contractOf });
  const collect = async (path: string) => {
    const seen: unknown[] = [];
    try {
      for await (const v of checked.subscribe({ path, input: undefined })) {
        seen.push(v);
      }
    } catch (err) {
      seen.push((err as { code: string }).code);
    }
    return seen;
  };

  const tokens = (await checked.request({
    type: 'query',
    path: 'tokens',
    input: undefined,
  })) as AsyncIterable<string>;
  const read: string[] = [];
  for await (const token of tokens) read.push(token);
  expect(read).toEqual(['a', 'b']);
  expect(await collect('numbers')).toEqual([1, 'PARSE_ERROR']);
  expect(await collect('plain')).toEqual([1, 'PARSE_ERROR']);
  expect(
    await checked.request({ type: 'query', path: 'trusted', input: undefined }),
  ).toEqual({ n: 'not a number' });
  expect(
    await checked.request({ type: 'query', path: 'extra', input: undefined }),
  ).toBe('not in the contract');
  const [, through] = await safe(
    checked.request({ type: 'query', path: 'strict.deeper', input: undefined }),
  );
  expect(through).toMatchObject({ code: 'NOT_FOUND' });
  const [, router] = await safe(
    checked.request({ type: 'query', path: 'nested', input: undefined }),
  );
  expect(router).toMatchObject({ code: 'NOT_FOUND' });

  const before = http.requests.length;
  const [, early] = await safe(
    checked.request({ type: 'query', path: 'strict', input: { n: 'x' } }),
  );
  expect(early).toMatchObject({ code: 'BAD_REQUEST' });
  expect(http.requests).toHaveLength(before);
  expect(
    await checked.request({
      type: 'query',
      path: 'perCall',
      input: { n: 'x' },
    }),
  ).toBe('checked by the server');

  const lax = client({ contract: contractOf, input: false, output: false });
  expect(
    await lax.request({ type: 'query', path: 'strict', input: { n: 'x' } }),
  ).toBe('unchecked');
  expect(http.requests).toHaveLength(before + 2);
});
