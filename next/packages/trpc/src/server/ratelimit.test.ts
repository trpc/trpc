import { Layer } from 'effect';
import { RateLimiter } from 'effect/persistence';
import {
  createTrpcClient,
  httpLink,
  retryLink,
  safe,
  routerType,
} from '@trpc12/trpc/client';
import { RateLimited, rateLimit } from '@trpc12/trpc/middleware';
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { createTestServer } from '../fixtures/server.ts';

const t = initTrpc<{ ctx: { ip: string } }>();
const limited = rateLimit<{ ctx: { ip: string } }>({
  key: (opts) => `${opts.path}:${opts.ctx.ip}`,
  limit: 2,
  window: '1 minute',
});
const router = {
  ping: t.procedure.use(limited).query(() => 'pong' as const),
  free: t.procedure.query(() => 'free' as const),
};
const memory = () =>
  RateLimiter.layer.pipe(Layer.provide(RateLimiter.layerStoreMemory));

test('calls past the limit fail with RATE_LIMITED data and RateLimit headers', async () => {
  const handler = createFetchHandler({
    router,
    layer: memory(),
    createContext: (opts) => ({
      ip: opts.request.headers['x-ip'] ?? '?',
    }),
  });
  const get = (ip: string) =>
    handler.fetch(
      new Request('http://localhost/trpc/ping', { headers: { 'x-ip': ip } }),
    );

  const first = await get('a');
  expect(first.status).toBe(200);
  expect(first.headers.get('ratelimit-limit')).toBe('2');
  expect(first.headers.get('ratelimit-remaining')).toBe('1');
  expect(Number(first.headers.get('ratelimit-reset'))).toBeGreaterThan(0);
  expect((await get('a')).status).toBe(200);

  const third = await get('a');
  expect(third.status).toBe(429);
  expect(third.headers.get('ratelimit-remaining')).toBe('0');
  expect(Number(third.headers.get('retry-after'))).toBeGreaterThan(0);
  const body = (await third.json()) as { json: { error: unknown } };
  expect(body.json.error).toMatchObject({
    code: 'TOO_MANY_REQUESTS',
    data: { limit: 2 },
  });

  expect((await get('b')).status).toBe(200);
  await handler.dispose();
});

test('the error is typed on the client, and retryLink can wait for retryAfter', async () => {
  await using http = await createTestServer({
    router,
    layer: memory(),
    createContext: () => ({ ip: 'c' }),
  });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [httpLink({ url: http.url })],
  });
  await client.ping.query();
  await client.ping.query();
  const [, err] = await safe(client.ping.query());
  expect(err).toBeInstanceOf(Error);
  expect(err).toMatchObject({ code: 'TOO_MANY_REQUESTS', defined: true });
  if (err?.defined && err.code === 'TOO_MANY_REQUESTS') {
    expectTypeOf(err.data).toEqualTypeOf<{
      readonly limit: number;
      readonly retryAfter: number;
    }>();
    expect(err.data.retryAfter).toBeGreaterThan(0);
  }

  const delays: number[] = [];
  const retrying = createTrpcClient({
    router: routerType<typeof router>(),
    links: [
      retryLink({
        retries: 1,
        retry: (opts) => opts.error.code === 'TOO_MANY_REQUESTS',
        delayMs: (_, error) => {
          const after = (error.data as { retryAfter?: number }).retryAfter;
          delays.push(after ?? -1);
          return 0;
        },
      }),
      httpLink({ url: http.url }),
    ],
  });
  await safe(retrying.ping.query());
  expect(delays).toHaveLength(1);
  expect(delays[0]).toBeGreaterThan(0);
  expect(await retrying.free.query()).toBe('free');
});

test('the handler must provide RateLimiter', () => {
  expectTypeOf<
    Parameters<typeof createFetchHandler<typeof router>>[0]['layer']
  >().toEqualTypeOf<Layer.Layer<RateLimiter.RateLimiter, any, never>>();
  // @ts-expect-error -- RateLimiter is required
  createFetchHandler({ router, createContext: () => ({ ip: '' }) });
  expect(RateLimited.code).toBe('TOO_MANY_REQUESTS');
});
