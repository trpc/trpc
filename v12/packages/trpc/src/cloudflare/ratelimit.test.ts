import { Effect, Exit, Layer } from 'effect';
import { RateLimiter } from 'effect/persistence';
import {
  experimental_durableRateLimiterStore,
  experimental_durableRateLimitObject,
  type DurableRateLimitNamespace,
  type DurableRateLimitState,
} from '@trpc12/trpc/cloudflare';
import { experimental_rateLimit } from '@trpc12/trpc/middleware';
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
import { expect, test, vi } from 'vite-plus/test';

/** A Durable Object's storage, as far as a rate limit object sees it. */
class Storage {
  data = new Map<string, unknown>();
  alarm: number | null = null;
  get(key: string) {
    return Promise.resolve(structuredClone(this.data.get(key)));
  }
  put(key: string, value: unknown) {
    this.data.set(key, structuredClone(value));
    return Promise.resolve();
  }
  deleteAll() {
    this.data.clear();
    return Promise.resolve();
  }
  setAlarm(time: number) {
    this.alarm = time;
    return Promise.resolve();
  }
}

/** A namespace of rate limit objects; `evict()` drops their memory. */
function namespace() {
  const objects = new Map<
    string,
    {
      storage: Storage;
      object: ReturnType<typeof experimental_durableRateLimitObject>;
    }
  >();
  const get = (name: string) => {
    let entry = objects.get(name);
    if (!entry) {
      const storage = new Storage();
      const state: DurableRateLimitState = { storage };
      entry = { storage, object: experimental_durableRateLimitObject(state) };
      objects.set(name, entry);
    }
    return entry;
  };
  const ns: DurableRateLimitNamespace = {
    getByName: (name) => ({
      fetch: (input, init) => get(name).object.fetch(new Request(input, init)),
    }),
  };
  return {
    ns,
    objects,
    get,
    evict() {
      for (const entry of objects.values()) {
        entry.object = experimental_durableRateLimitObject({
          storage: entry.storage,
        });
      }
    },
  };
}

const t = initTrpc<{ ctx: { ip: string } }>();
const serve = (ns: DurableRateLimitNamespace) => {
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
    }),
    layer: RateLimiter.layer.pipe(
      Layer.provide(
        experimental_durableRateLimiterStore(ns, { prefix: 'rl:' }),
      ),
    ),
    createContext: (opts) => ({ ip: opts.request.headers['x-ip'] ?? '?' }),
  });
  const get = (ip: string) =>
    handler.fetch(
      new Request('http://localhost/trpc/ping', { headers: { 'x-ip': ip } }),
    );
  return { handler, get };
};

/** Fakes `Date` (Effect's clock and the objects' clock) until disposed. */
function fakeDate(): Disposable {
  vi.useFakeTimers({ toFake: ['Date'], now: 1_000_000 });
  return { [Symbol.dispose]: () => vi.useRealTimers() };
}

test('Worker instances share one limit per key, which outlives an eviction', async () => {
  using _date = fakeDate();
  const objects = namespace();
  const one = serve(objects.ns);
  const two = serve(objects.ns);

  const first = await one.get('a');
  expect(first.status).toBe(200);
  expect(first.headers.get('ratelimit-remaining')).toBe('1');
  expect((await two.get('a')).status).toBe(200);
  objects.evict();
  const third = await one.get('a');
  expect(third.status).toBe(429);
  expect(third.headers.get('retry-after')).toBe('60');
  expect((await two.get('b')).status).toBe(200);
  expect([...objects.objects.keys()]).toEqual(['rl:ping:a', 'rl:ping:b']);

  vi.advanceTimersByTime(60_000);
  expect((await two.get('a')).status).toBe(200);
  await one.handler.dispose();
  await two.handler.dispose();
});

test('an alarm deletes the counters once they expire', async () => {
  using _date = fakeDate();
  const objects = namespace();
  const app = serve(objects.ns);
  await app.get('a');
  const entry = objects.get('rl:ping:a');
  expect(entry.storage.alarm).toBe(Date.now() + 30_000);

  await entry.object.alarm();
  expect(entry.storage.data.size).toBe(1);
  vi.advanceTimersByTime(30_000);
  await entry.object.alarm();
  expect(entry.storage.data.size).toBe(0);
  await app.handler.dispose();
});

test("an object's failure is a defect: a masked 500", async () => {
  const app = serve({
    getByName: () => ({
      fetch: () =>
        Promise.resolve({
          ok: false,
          status: 503,
          json: () => Promise.resolve(null),
        }),
    }),
  });
  const res = await app.get('a');
  expect(res.status).toBe(500);
  expect(await res.json()).toMatchObject({
    json: { error: { code: 'INTERNAL_SERVER_ERROR' } },
  });
  await app.handler.dispose();
});

test("counts like Effect's memory store", async () => {
  using _date = fakeDate();
  const memory = await Effect.runPromise(
    RateLimiter.make.pipe(Effect.provide(RateLimiter.layerStoreMemory)),
  );
  const durable = await Effect.runPromise(
    RateLimiter.make.pipe(
      Effect.provide(experimental_durableRateLimiterStore(namespace().ns)),
    ),
  );
  let seed = 7;
  const random = (n: number) => {
    seed = (seed * 48271) % 2147483647;
    return seed % n;
  };
  const summary = (exit: Exit.Exit<RateLimiter.ConsumeResult, unknown>) =>
    Exit.isSuccess(exit)
      ? {
          delay: exit.value.delay,
          remaining: exit.value.remaining,
          resetAfter: exit.value.resetAfter,
        }
      : exit.cause;
  for (let i = 0; i < 400; i++) {
    const options = {
      key: `k${random(3)}`,
      algorithm: random(2) ? 'token-bucket' : 'fixed-window',
      onExceeded: random(3) ? 'fail' : 'delay',
      limit: 1 + random(4),
      window: '4 seconds',
      tokens: 1 + random(2),
    } as const;
    const key = `${options.key}:${options.algorithm}:${options.limit}`;
    const [a, b] = [
      await Effect.runPromiseExit(memory.consume({ ...options, key })),
      await Effect.runPromiseExit(durable.consume({ ...options, key })),
    ];
    expect(summary(b), `call ${i}`).toEqual(summary(a));
    vi.advanceTimersByTime(random(1500));
  }
});
