import { afterAll, beforeAll, expect, test } from 'bun:test';
import { BunHttpServer } from '@effect/platform-bun';
import { Context, Effect, Exit, Layer, Scope } from 'effect';
import {
  createTrpcClient,
  httpLink,
  wsLink,
  routerType,
} from '@trpc12/trpc/client';
import {
  TestServer,
  type TestServerShape,
} from '@trpc12/trpc/internal/testing';
import { createSerializer } from '@trpc12/trpc/serializer';
import { initTrpc, tracked } from '@trpc12/trpc/server';
import { z } from 'zod';

/** Dates, Maps and Files round-trip, so both ends use danSON. */
const serializer = createSerializer();
const t = initTrpc();
const aborted: string[] = [];

const router = {
  post: t.procedure.input(z.object({ id: z.string() })).query((opts) => ({
    id: opts.input.id,
    createdAt: new Date(Date.UTC(2026, 0, 1)),
    tags: new Map([['bun', 1]]),
  })),
  upload: t.procedure
    .input(z.object({ file: z.instanceof(File) }))
    .mutation(
      async (opts) => `${opts.input.file.name}:${await opts.input.file.text()}`,
    ),
  download: t.procedure.query(
    () => new File(['bytes'], 'report.csv', { type: 'text/csv' }),
  ),
  posts: t.procedure.subscription(async function* (opts) {
    for (let id = Number(opts.lastEventId ?? 0) + 1; id <= 3; id++) {
      yield tracked(String(id), { id });
    }
  }),
  forever: t.procedure.subscription(async function* (opts) {
    opts.signal.addEventListener('abort', () => aborted.push('forever'));
    for (let n = 0; ; n++) {
      yield n;
      await Bun.sleep(5);
    }
  }),
};

const scope = Scope.makeUnsafe();
let server: TestServerShape;

beforeAll(async () => {
  const context = await Effect.runPromise(
    Layer.buildWithScope(
      TestServer.layer({ router, batch: true, serializer }).pipe(
        Layer.provide(BunHttpServer.layer({ port: 0, hostname: '127.0.0.1' })),
      ),
      scope,
    ),
  );
  server = Context.get(context, TestServer);
});
afterAll(() => Effect.runPromise(Scope.close(scope, Exit.void)));

const collect = async <T>(iterable: AsyncIterable<T>) => {
  const out: T[] = [];
  for await (const value of iterable) out.push(value);
  return out;
};

test('runs on Bun', () => {
  expect(typeof Bun.version).toBe('string');
});

test('batched queries keep rich types over BunHttpServer', async () => {
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [httpLink({ url: server.url, batch: true, serializer })],
  });
  const [a, b] = await Promise.all([
    client.post.query({ id: '1' }),
    client.post.query({ id: '2' }),
  ]);
  expect(a.createdAt).toBeInstanceOf(Date);
  expect(b.tags.get('bun')).toBe(1);
});

test('files go up as form data and come back as Files', async () => {
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [httpLink({ url: server.url, serializer })],
  });
  expect(await client.upload.mutate({ file: new File(['hi'], 'a.txt') })).toBe(
    'a.txt:hi',
  );
  const file = await client.download.query();
  expect(file.name).toBe('report.csv');
  expect(await file.text()).toBe('bytes');
});

test('SSE subscriptions stream and resume from lastEventId', async () => {
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [httpLink({ url: server.url, serializer })],
  });
  const all = await collect(client.posts.subscribe());
  expect(all.map((e) => e.id)).toEqual(['1', '2', '3']);
  const rest = await collect(
    client.posts.subscribe(undefined, { lastEventId: '2' }),
  );
  expect(rest.map((e) => e.data.id)).toEqual([3]);
});

test('wsLink queries and subscribes over the platform WebSocket', async () => {
  await using link = wsLink({ url: server.wsUrl, serializer });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [link],
  });
  expect((await client.post.query({ id: '3' })).createdAt).toBeInstanceOf(Date);
  expect(
    (await collect(client.posts.subscribe())).map((e) => e.data.id),
  ).toEqual([1, 2, 3]);
});

test('a client that goes away aborts the subscription signal', async () => {
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [httpLink({ url: server.url, serializer })],
  });
  for await (const n of client.forever.subscribe()) if (n === 2) break;
  for (let i = 0; i < 50 && !aborted.includes('forever'); i++) {
    await Bun.sleep(10);
  }
  expect(aborted).toEqual(['forever']);
});
