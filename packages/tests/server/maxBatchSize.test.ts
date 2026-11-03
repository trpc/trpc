import { initTRPC } from '@trpc/server';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

function setup(opts: { maxBatchSize?: number } = {}) {
  const t = initTRPC.create();
  let calls = 0;
  const router = t.router({
    q: t.procedure.query(() => {
      calls++;
      return 'q';
    }),
    m: t.procedure.mutation(() => {
      calls++;
      return 'm';
    }),
  });

  return {
    get calls() {
      return calls;
    },
    async batch(size: number, method: 'GET' | 'POST' = 'POST') {
      const path = method === 'GET' ? 'q' : 'm';
      const paths = Array.from({ length: size }, () => path).join(',');
      const url = `http://localhost/trpc/${paths}?batch=1`;
      const res = await fetchRequestHandler({
        endpoint: '/trpc',
        router,
        ...opts,
        req:
          method === 'GET'
            ? new Request(url)
            : new Request(url, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: '{}',
              }),
      });
      return { status: res.status, body: await res.json() };
    },
  };
}

test('batches over 100 calls are rejected by default', async () => {
  const ctx = setup();

  for (const method of ['GET', 'POST'] as const) {
    const ok = await ctx.batch(100, method);
    expect(ok.status).toBe(200);
    expect(ok.body).toHaveLength(100);
  }
  expect(ctx.calls).toBe(200);

  for (const method of ['GET', 'POST'] as const) {
    const res = await ctx.batch(101, method);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Batch call exceeds maximum size');
  }
  expect(ctx.calls).toBe(200);
});

test('maxBatchSize raises the default limit', async () => {
  const ctx = setup({ maxBatchSize: 200 });

  const ok = await ctx.batch(200);
  expect(ok.status).toBe(200);
  expect(ok.body).toHaveLength(200);

  const res = await ctx.batch(201);
  expect(res.status).toBe(400);
});

test('maxBatchSize: Infinity turns the limit off', async () => {
  const ctx = setup({ maxBatchSize: Infinity });

  const res = await ctx.batch(1000);
  expect(res.status).toBe(200);
  expect(res.body).toHaveLength(1000);
  expect(ctx.calls).toBe(1000);
});
