import { Duration, Effect, Layer } from 'effect';
import { RateLimiter } from 'effect/persistence';

const STATE = 'trpc-ratelimit';

interface Stored {
  window?: { count: number; expiresAt: number };
  bucket?: { tokens: number; lastRefill: number; expiresAt: number };
}

interface FixedWindowRequest {
  readonly tokens: number;
  readonly refillMillis: number;
  readonly limit?: number;
}

interface TokenBucketRequest {
  readonly tokens: number;
  readonly refillMillis: number;
  readonly limit: number;
  readonly allowOverflow: boolean;
}

/**
 * The parts of `DurableObjectState` {@link experimental_durableRateLimitObject} uses.
 * @since 0.1.0
 * @stability experimental
 */
export interface DurableRateLimitState {
  readonly storage: {
    get(key: string): Promise<unknown>;
    put(key: string, value: unknown): Promise<void>;
    deleteAll(): Promise<void>;
    setAlarm(scheduledTime: number): Promise<void>;
  };
}

/**
 * What {@link experimental_durableRateLimitObject} returns. Call it from the
 * Durable Object's `fetch` and `alarm`.
 * @since 0.1.0
 * @stability experimental
 */
export interface DurableRateLimitObject {
  fetch(request: Request): Promise<Response>;
  /** Deletes the counters once they've expired. */
  alarm(): Promise<void>;
}

const expiryOf = (stored: Stored) =>
  Math.max(stored.window?.expiresAt ?? 0, stored.bucket?.expiresAt ?? 0);

/**
 * The Durable Object side of {@link experimental_durableRateLimiterStore}:
 * one object per key, counting with the object's clock and keeping its
 * counters in the object's storage, so a limit holds across Worker
 * instances and evictions. The counting is Effect's memory store's, so
 * fixed windows and token buckets behave as they do in memory.
 *
 * @example
 * ```ts
 * export class RateLimits extends DurableObject {
 *   limits = experimental_durableRateLimitObject(this.ctx);
 *   override fetch(request: Request) {
 *     return this.limits.fetch(request);
 *   }
 *   override alarm() {
 *     return this.limits.alarm();
 *   }
 * }
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function experimental_durableRateLimitObject(
  state: DurableRateLimitState,
): DurableRateLimitObject {
  // Loaded once, then changed synchronously, so two calls can't interleave
  // between reading a counter and writing it.
  let loaded: Promise<Stored> | undefined;
  let alarmAt = 0;
  const load = () =>
    (loaded ??= state.storage
      .get(STATE)
      .then((value) => (value as Stored | undefined) ?? {}));

  const fixedWindow = (
    stored: Stored,
    req: FixedWindowRequest,
    now: number,
  ) => {
    let window = stored.window;
    if (!window || window.expiresAt <= now)
      window = { count: 0, expiresAt: now };
    if (req.limit !== undefined && window.count + req.tokens > req.limit) {
      return [window.count + req.tokens, window.expiresAt - now] as const;
    }
    window.count += req.tokens;
    window.expiresAt += req.refillMillis * req.tokens;
    stored.window = window;
    return [window.count, window.expiresAt - now] as const;
  };

  const tokenBucket = (
    stored: Stored,
    req: TokenBucketRequest,
    now: number,
  ) => {
    let bucket = stored.bucket;
    if (!bucket || bucket.expiresAt <= now) {
      bucket = { tokens: req.limit, lastRefill: now, expiresAt: now };
    }
    const refills = Math.floor((now - bucket.lastRefill) / req.refillMillis);
    if (refills > 0) {
      bucket.tokens = Math.min(req.limit, bucket.tokens + refills);
      bucket.lastRefill += refills * req.refillMillis;
    }
    if (bucket.tokens >= req.limit) bucket.lastRefill = now;
    const next = bucket.tokens - req.tokens;
    if (req.allowOverflow || next >= 0) bucket.tokens = next;
    const elapsed = Math.max(0, now - bucket.lastRefill);
    // Full again after this long, when a fresh bucket is the same thing.
    bucket.expiresAt =
      now +
      Math.max(
        1,
        Math.ceil(
          Math.ceil(req.limit - bucket.tokens) * req.refillMillis - elapsed,
        ),
      );
    stored.bucket = bucket;
    return [next, elapsed] as const;
  };

  const save = async (stored: Stored) => {
    await state.storage.put(STATE, stored);
    const expiry = expiryOf(stored);
    if (expiry > alarmAt) {
      alarmAt = expiry;
      await state.storage.setAlarm(expiry);
    }
  };

  return {
    async fetch(request) {
      const op = new URL(request.url).pathname;
      const req = (await request.json()) as FixedWindowRequest &
        TokenBucketRequest;
      const stored = await load();
      const now = Date.now();
      let result: readonly [number, number];
      if (op === '/fixed-window') result = fixedWindow(stored, req, now);
      else if (op === '/token-bucket') result = tokenBucket(stored, req, now);
      else return new Response(null, { status: 404 });
      await save(stored);
      return Response.json(result);
    },
    async alarm() {
      const stored = await load();
      const now = Date.now();
      if (stored.window && stored.window.expiresAt <= now) delete stored.window;
      if (stored.bucket && stored.bucket.expiresAt <= now) delete stored.bucket;
      alarmAt = 0;
      if (stored.window || stored.bucket) return save(stored);
      await state.storage.deleteAll();
    },
  };
}

/**
 * The parts of a `DurableObjectNamespace` {@link experimental_durableRateLimiterStore} uses.
 * @since 0.1.0
 * @stability experimental
 */
export interface DurableRateLimitNamespace {
  getByName(name: string): {
    fetch(
      input: string,
      init: { method: string; body: string },
    ): Promise<{
      readonly ok: boolean;
      readonly status: number;
      json(): Promise<unknown>;
    }>;
  };
}

/**
 * Options for {@link experimental_durableRateLimiterStore}.
 * @since 0.1.0
 * @stability experimental
 */
export interface experimental_DurableRateLimiterStoreOptions {
  /** Prefixes object names. @default '' */
  readonly prefix?: string;
}

/**
 * Effect's `RateLimiterStore` on Durable Objects: each key is an object
 * running {@link experimental_durableRateLimitObject}, so `rateLimit()`
 * counts one limit across every Worker instance, with whatever `limit` and
 * `window` each call passes. One subrequest per call. Adaptive limiting
 * (Effect's `RateLimiter.adaptiveConsume`) isn't stored: it always reports
 * no state.
 *
 * @example
 * ```ts
 * createFetchHandler({
 *   router,
 *   layer: RateLimiter.layer.pipe(
 *     Layer.provide(experimental_durableRateLimiterStore(env.RATE_LIMITS)),
 *   ),
 * });
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function experimental_durableRateLimiterStore(
  namespace: DurableRateLimitNamespace,
  options: experimental_DurableRateLimiterStoreOptions = {},
): Layer.Layer<RateLimiter.RateLimiterStore> {
  const prefix = options.prefix ?? '';
  const call = (key: string, op: string, body: object) =>
    Effect.tryPromise({
      try: async () => {
        const res = await namespace
          .getByName(prefix + key)
          .fetch(`https://rate-limit/${op}`, {
            method: 'POST',
            body: JSON.stringify(body),
          });
        if (!res.ok) {
          throw new Error(`The rate limit object answered ${res.status}`);
        }
        return (await res.json()) as readonly [number, number];
      },
      catch: (cause) =>
        new RateLimiter.RateLimiterError({
          reason: new RateLimiter.RateLimitStoreError({
            message: `Failed to execute ${op} rate limiting command`,
            cause,
          }),
        }),
    });
  return Layer.succeed(
    RateLimiter.RateLimiterStore,
    RateLimiter.RateLimiterStore.of({
      fixedWindow: (opts) =>
        call(opts.key, 'fixed-window', {
          tokens: opts.tokens,
          refillMillis: Duration.toMillis(opts.refillRate),
          limit: opts.limit,
        }),
      tokenBucket: (opts) =>
        call(opts.key, 'token-bucket', {
          tokens: opts.tokens,
          refillMillis: Duration.toMillis(opts.refillRate),
          limit: opts.limit,
          allowOverflow: opts.allowOverflow,
        }),
      adaptiveConsume: () =>
        Effect.succeed({ delay: Duration.zero, epoch: 0, phase: 'inactive' }),
      adaptiveFeedback: () => Effect.void,
    }),
  );
}
