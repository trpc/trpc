import { createTrpcClient, httpLink, safe } from 'trpcdev/client';
import { error, initTrpc } from 'trpcdev/server';
import { createTestServer } from './fixtures/server.ts';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { z } from 'zod';

const t = initTrpc();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let finished = 0;

const router = {
  double: t.procedure
    .input(z.object({ n: z.number() }))
    .query(({ input }) => input.n * 2),
  fail: t.procedure.query(() => error({ code: 'NOT_FOUND', message: 'Nope' })),
  bump: t.procedure
    .input(z.object({ by: z.number() }))
    .mutation(({ input }) => ({ bumped: input.by })),
  dashboard: t.procedure.query(() => ({
    title: 'Dashboard',
    stats: sleep(20).then(() => ({ visits: 42 })),
    feed: (async function* () {
      try {
        for (const item of ['a', 'b', 'c']) {
          await sleep(5);
          yield item;
        }
      } finally {
        finished++;
      }
    })(),
  })),
  flaky: t.procedure.query(() => ({
    ok: 1,
    later: sleep(5).then(() => {
      throw new Error('kaboom');
    }) as Promise<number>,
  })),
};
type AppRouter = typeof router;

async function setup(opts: { serverBatch?: boolean; clientBatch?: boolean }) {
  const server = await createTestServer({
    router,
    batch: opts.serverBatch ?? true,
  });
  const client = createTrpcClient<AppRouter>({
    links: [httpLink({ url: server.url, batch: opts.clientBatch ?? true })],
  });
  return { server, client, [Symbol.asyncDispose]: () => server.close() };
}

test('calls made in the same tick share one request', async () => {
  await using ctx = await setup({});
  const results = await Promise.all([
    ctx.client.double.query({ n: 1 }),
    ctx.client.double.query({ n: 2 }),
    ctx.client.double.query({ n: 3 }),
  ]);
  expect(results).toEqual([2, 4, 6]);
  expect(ctx.server.requests).toHaveLength(1);
  const [request] = ctx.server.requests;
  expect(request!.method).toBe('POST');
  expect(request!.headers.get('trpc-batch')).toBe('1');
});

test('each call in a batch settles on its own', async () => {
  await using ctx = await setup({});
  const [ok, failed] = await Promise.all([
    safe(ctx.client.double.query({ n: 21 })),
    safe(ctx.client.fail.query()),
  ]);
  expect(ok.data).toBe(42);
  expect(failed.error).toMatchObject({
    code: 'NOT_FOUND',
    status: 404,
    defined: true,
  });
  expect(ctx.server.requests).toHaveLength(1);
});

test('queries and mutations are batched separately', async () => {
  await using ctx = await setup({});
  const [double, bump] = await Promise.all([
    ctx.client.double.query({ n: 5 }),
    ctx.client.bump.mutate({ by: 1 }),
  ]);
  expect(double).toBe(10);
  expect(bump).toEqual({ bumped: 1 });
  expect(ctx.server.requests).toHaveLength(2);
});

test('the client splits batches above maxItems', async () => {
  await using server = await createTestServer({ router, batch: true });
  const client = createTrpcClient<AppRouter>({
    links: [httpLink({ url: server.url, batch: { maxItems: 2 } })],
  });
  const results = await Promise.all(
    [1, 2, 3, 4, 5].map((n) => client.double.query({ n })),
  );
  expect(results).toEqual([2, 4, 6, 8, 10]);
  expect(server.requests).toHaveLength(3);
});

test('a server without batching rejects batched requests', async () => {
  await using ctx = await setup({ serverBatch: false });
  const [, err] = await safe(ctx.client.double.query({ n: 1 }));
  expect(err).toMatchObject({ code: 'BAD_REQUEST', status: 400 });
});

test('nested promises and async iterables stream as JSONL', async () => {
  await using ctx = await setup({ clientBatch: false });
  const result = await ctx.client.dashboard.query();
  expect(result.title).toBe('Dashboard');
  expectTypeOf(result.stats).toEqualTypeOf<Promise<{ visits: number }>>();
  expectTypeOf(result.feed).toEqualTypeOf<AsyncIterable<string>>();
  expect(ctx.server.requests.at(-1)!.method).toBe('GET');

  const items: string[] = [];
  for await (const item of result.feed) items.push(item);
  expect(items).toEqual(['a', 'b', 'c']);
  expect(await result.stats).toEqual({ visits: 42 });
});

test('deferred values stream inside a batch too', async () => {
  await using ctx = await setup({});
  const [dashboard, double] = await Promise.all([
    ctx.client.dashboard.query(),
    ctx.client.double.query({ n: 4 }),
  ]);
  expect(double).toBe(8);
  expect(await dashboard.stats).toEqual({ visits: 42 });
  const items: string[] = [];
  for await (const item of dashboard.feed) items.push(item);
  expect(items).toEqual(['a', 'b', 'c']);
  expect(ctx.server.requests).toHaveLength(1);
});

test('a deferred value that fails rejects on the client', async () => {
  await using ctx = await setup({ clientBatch: false });
  const result = await ctx.client.flaky.query();
  expect(result.ok).toBe(1);
  await expect(result.later).rejects.toMatchObject({
    code: 'INTERNAL_SERVER_ERROR',
  });
});

test('the server finishes the iterable once it is drained', async () => {
  await using ctx = await setup({ clientBatch: false });
  const before = finished;
  const result = await ctx.client.dashboard.query();
  for await (const _ of result.feed);
  await result.stats;
  expect(finished).toBe(before + 1);
});
