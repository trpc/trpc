import { Schema } from 'effect';
import {
  createTrpcClient,
  httpLink,
  safe,
  validationLink,
} from 'trpcdev/client';
import { contract, toContract } from 'trpcdev/contract';
import { createOpenApiHandler, openApiLink } from 'trpcdev/openapi';
import { initTrpc, tracked } from 'trpcdev/server';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { z } from 'zod';
import { createTestServer } from './fixtures/server.ts';

const Post = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  at: Schema.Date,
});

const c = contract.create();
const appContract = {
  post: {
    byId: c
      .input(z.object({ id: z.string().min(1) }))
      .output(Post)
      .route({ method: 'GET', path: '/posts/{id}' })
      .query(),
    feed: c.output(Post).subscription({ tracked: true }),
  },
};

const t = initTrpc();
const at = new Date('2026-10-16T00:00:00.000Z');
const impl = t.implement(appContract);
const router = impl.router({
  post: {
    byId: impl.post.byId.query(({ input }) => ({
      id: input.id,
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
      validationLink({ contract: appContract }),
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
  const drifted = {
    post: {
      byId: t.procedure
        .input(z.object({ id: z.string() }))
        .query(({ input }) => ({ id: Number(input.id), title: 'Hello', at })),
      feed: t.procedure.subscription(async function* () {
        yield tracked('1', { id: '1', title: 2, at });
      }),
    },
  };
  await using http = await createTestServer({ router: drifted });
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
