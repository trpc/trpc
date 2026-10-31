import { Effect, Layer } from 'effect';
import { RateLimiter, Redis } from 'effect/persistence';

/**
 * Options for {@link experimental_upstashRedis}: the database's REST URL and
 * token, as Upstash's console shows them.
 * @since 0.1.0
 * @stability experimental
 */
export interface experimental_UpstashOptions {
  /** `UPSTASH_REDIS_REST_URL`. */
  readonly url: string;
  /** `UPSTASH_REDIS_REST_TOKEN`. */
  readonly token: string;
  /** @default globalThis.fetch */
  readonly fetch?: (url: string, init: RequestInit) => Promise<Response>;
}

const noSubscribe = /* @__PURE__ */ new Redis.RedisError({
  cause: new Error('Upstash REST has no SUBSCRIBE; connect over TCP instead'),
});

/**
 * Effect's `Redis` service over Upstash's REST API: each command is one
 * `fetch`, so it works where TCP doesn't (Workers, edge functions). Lua
 * scripts load once and run with `EVALSHA`, so anything built on `Redis`
 * works: `RateLimiter.layerStoreRedis()`, `experimental_redisLocker()`.
 * `reserve` needs no connection of its own, since no command
 * waits behind another. `subscribe` fails: Upstash's REST API has no pub/sub.
 *
 * @example
 * ```ts
 * const redis = experimental_upstashRedis({
 *   url: env.UPSTASH_REDIS_REST_URL,
 *   token: env.UPSTASH_REDIS_REST_TOKEN,
 * });
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function experimental_upstashRedis(
  options: experimental_UpstashOptions,
): Layer.Layer<Redis.Redis> {
  const fetchFn = options.fetch ?? globalThis.fetch;
  const makeSend =
    (closed?: AbortSignal) =>
    <A = unknown>(command: string, ...args: ReadonlyArray<string>) =>
      Effect.tryPromise({
        try: async (signal) => {
          const res = await fetchFn(options.url, {
            method: 'POST',
            headers: {
              authorization: `Bearer ${options.token}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify([command, ...args]),
            signal: closed ? AbortSignal.any([signal, closed]) : signal,
          });
          const text = await res.text();
          let body: { result?: unknown; error?: unknown } | undefined;
          try {
            body = JSON.parse(text);
          } catch {
            // Not Upstash's JSON: reported below with the status.
          }
          if (typeof body?.error === 'string') throw new Error(body.error);
          if (!res.ok || !body || !('result' in body)) {
            throw new Error(`Upstash answered ${res.status}: ${text}`);
          }
          return body.result as A;
        },
        catch: (cause) => new Redis.RedisError({ cause }),
      });
  return Layer.effect(
    Redis.Redis,
    Redis.make({
      send: makeSend(),
      subscribe: () => Effect.fail(noSubscribe),
      // A REST command never blocks the ones behind it, so a reserved
      // connection only has to fail its in-flight commands when it closes.
      connect: Effect.sync(() => {
        const controller = new AbortController();
        return {
          send: makeSend(controller.signal),
          close: Effect.sync(() => controller.abort()),
        };
      }),
    }),
  );
}

/**
 * Options for {@link experimental_upstashRateLimiterStore}.
 * @since 0.1.0
 * @stability experimental
 */
export interface experimental_UpstashRateLimiterStoreOptions extends experimental_UpstashOptions {
  /** Prefixes every key. @default 'ratelimiter:' */
  readonly prefix?: string;
}

/**
 * Effect's `RateLimiterStore` on Upstash: Effect's Redis store, with its
 * Lua scripts, over {@link experimental_upstashRedis}. Each `experimental_rateLimit()`
 * call is one REST request (two the first time a script runs).
 *
 * @example
 * ```ts
 * createFetchHandler({
 *   router,
 *   layer: RateLimiter.layer.pipe(
 *     Layer.provide(
 *       experimental_upstashRateLimiterStore({
 *         url: env.UPSTASH_REDIS_REST_URL,
 *         token: env.UPSTASH_REDIS_REST_TOKEN,
 *       }),
 *     ),
 *   ),
 * });
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function experimental_upstashRateLimiterStore(
  options: experimental_UpstashRateLimiterStoreOptions,
): Layer.Layer<RateLimiter.RateLimiterStore> {
  return RateLimiter.layerStoreRedis({ prefix: options.prefix }).pipe(
    Layer.provide(experimental_upstashRedis(options)),
  );
}
