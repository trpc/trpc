import { NodeRedis } from '@effect/platform-node';
import { Effect, Layer, ManagedRuntime } from 'effect';
import { RateLimiter, Redis } from 'effect/persistence';
import {
  experimental_upstashRateLimiterStore,
  experimental_upstashRedis,
  experimental_rateLimit,
} from '@trpc12/trpc/middleware';
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
import { expect, test } from 'vite-plus/test';

const token = 'test-token';

/**
 * Upstash's REST API in front of `send`: a JSON command array in, `{ result }`
 * or a 400 with `{ error }` out, and a 401 without the token.
 */
function upstash(send: (command: string[]) => Promise<unknown>) {
  const commands: string[][] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    if (request.headers.get('authorization') !== `Bearer ${token}`) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const command = (await request.json()) as string[];
    commands.push(command);
    try {
      return Response.json({ result: await send(command) });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 400 },
      );
    }
  };
  return { fetch: fetch as typeof globalThis.fetch, commands };
}

const t = initTrpc<{ ctx: { ip: string } }>();
const serve = (store: Layer.Layer<RateLimiter.RateLimiterStore>) => {
  const handler = createFetchHandler({
    router: t.router({
      ping: t.procedure
        .use(
          experimental_rateLimit<{ ctx: { ip: string } }>({
            key: (opts) => `ping:${opts.ctx.ip}`,
            limit: 2,
            window: '1 minute',
          }),
        )
        .query(() => 'pong' as const),
      bucket: t.procedure
        .use(
          experimental_rateLimit<{ ctx: { ip: string } }>({
            key: (opts) => `bucket:${opts.ctx.ip}`,
            limit: 2,
            window: '1 minute',
            algorithm: 'token-bucket',
          }),
        )
        .query(() => 'ok' as const),
    }),
    layer: RateLimiter.layer.pipe(Layer.provide(store)),
    createContext: (opts) => ({ ip: opts.request.headers['x-ip'] ?? '?' }),
  });
  const get = (path: string, ip: string) =>
    handler.fetch(
      new Request(`http://localhost/trpc/${path}`, { headers: { 'x-ip': ip } }),
    );
  return { handler, get };
};

test('commands are JSON arrays with the token; scripts load once and run by sha', async () => {
  let loads = 0;
  const api = upstash(async ([command, ...args]) => {
    if (command === 'SCRIPT') return `sha${++loads}`;
    if (command === 'EVALSHA') return [1, 30_000];
    throw new Error(`unexpected ${command} ${args.join(' ')}`);
  });
  const app = serve(
    experimental_upstashRateLimiterStore({
      url: 'https://up.example/',
      token,
      fetch: api.fetch,
    }),
  );
  expect((await app.get('ping', 'a')).headers.get('ratelimit-remaining')).toBe(
    '1',
  );
  await app.get('ping', 'b');
  expect(api.commands).toEqual([
    ['SCRIPT', 'LOAD', expect.stringContaining('redis.call("GET", key)')],
    ['EVALSHA', 'sha1', '1', 'ratelimiter:ping:a', '1', '30000', '2'],
    ['EVALSHA', 'sha1', '1', 'ratelimiter:ping:b', '1', '30000', '2'],
  ]);
  await app.handler.dispose();
});

test('a NOSCRIPT answer loads the script again', async () => {
  let flushed = false;
  const api = upstash(async ([command, sha]) => {
    if (command === 'SCRIPT') return flushed ? 'sha2' : 'sha1';
    if (sha === 'sha1' && flushed) {
      throw new Error('NOSCRIPT No matching script. Please use EVAL.');
    }
    return [1, 30_000];
  });
  const redis = experimental_upstashRedis({
    url: 'https://up.example/',
    token,
    fetch: api.fetch,
  });
  const script = Redis.script(() => [], { numberOfKeys: 0, lua: 'return 1' });
  const results = await Effect.runPromise(
    Effect.gen(function* () {
      const run = (yield* Redis.Redis).eval(script);
      const first = yield* run();
      flushed = true;
      return [first, yield* run()];
    }).pipe(Effect.provide(redis)),
  );
  expect(results).toEqual([
    [1, 30_000],
    [1, 30_000],
  ]);
  expect(api.commands.map((c) => c.slice(0, 2))).toEqual([
    ['SCRIPT', 'LOAD'],
    ['EVALSHA', 'sha1'],
    ['EVALSHA', 'sha1'],
    ['SCRIPT', 'LOAD'],
    ['EVALSHA', 'sha2'],
  ]);
});

test("Upstash's errors are RedisErrors, and a store failure is a masked 500", async () => {
  const api = upstash(async () => 'never');
  const wrongToken = experimental_upstashRedis({
    url: 'https://up.example/',
    token: 'wrong',
    fetch: api.fetch,
  });
  const error = await Effect.runPromise(
    Effect.flip(
      Effect.flatMap(Redis.Redis, (redis) => redis.send('PING')).pipe(
        Effect.provide(wrongToken),
      ),
    ),
  );
  expect(error).toBeInstanceOf(Redis.RedisError);
  expect(String(error.cause)).toContain('Unauthorized');

  const app = serve(
    experimental_upstashRateLimiterStore({
      url: 'https://up.example/',
      token,
      fetch: async () => new Response('Bad Gateway', { status: 502 }),
    }),
  );
  const res = await app.get('ping', 'a');
  expect(res.status).toBe(500);
  expect(await res.json()).toMatchObject({
    json: { error: { code: 'INTERNAL_SERVER_ERROR' } },
  });
  await app.handler.dispose();
});

const redisUrl = process.env['REDIS_URL'];

test.skipIf(!redisUrl)(
  'over REST to a real Redis, two servers share fixed windows and token buckets',
  async () => {
    const redis = ManagedRuntime.make(NodeRedis.layer({ url: redisUrl! }));
    await using _redis = { [Symbol.asyncDispose]: () => redis.dispose() };
    const api = upstash(([command, ...args]) =>
      redis.runPromise(
        Effect.flatMap(Redis.Redis, (r) => r.send(command!, ...args)),
      ),
    );
    const store = experimental_upstashRateLimiterStore({
      url: 'https://up.example/',
      token,
      fetch: api.fetch,
      prefix: `test:upstash:${Date.now()}:`,
    });
    const one = serve(store);
    const two = serve(store);

    expect((await one.get('ping', 'a')).status).toBe(200);
    expect((await two.get('ping', 'a')).status).toBe(200);
    const third = await one.get('ping', 'a');
    expect(third.status).toBe(429);
    expect(third.headers.get('retry-after')).toBe('60');
    expect((await two.get('ping', 'b')).status).toBe(200);

    expect((await one.get('bucket', 'a')).status).toBe(200);
    expect((await two.get('bucket', 'a')).status).toBe(200);
    const empty = await one.get('bucket', 'a');
    expect(empty.status).toBe(429);
    expect(Number(empty.headers.get('retry-after'))).toBe(30);
    await one.handler.dispose();
    await two.handler.dispose();
  },
);
