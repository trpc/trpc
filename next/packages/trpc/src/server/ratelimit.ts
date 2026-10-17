import { Duration, Effect, Schema } from 'effect';
import { RateLimiter } from 'effect/persistence';
import { TrpcError, type TaggedErrorClass } from '../internal/error.ts';
import type { Unset } from '../internal/types.ts';
import type {
  EffectMiddleware,
  MiddlewareRequirements,
  ReqCtx,
  ReqInput,
  ReqMeta,
} from './middleware.ts';
import { makeEffectMiddleware } from './middleware.ts';

type RateLimitedData = Schema.Struct<{
  readonly limit: Schema.Number;
  readonly retryAfter: Schema.Number;
}>;

const RateLimitedBase: TaggedErrorClass<
  'TOO_MANY_REQUESTS',
  RateLimitedData,
  429
> = TrpcError.Tagged('TOO_MANY_REQUESTS', {
  status: 429,
  data: Schema.Struct({ limit: Schema.Number, retryAfter: Schema.Number }),
});

/**
 * The error {@link rateLimit} fails with: `429`, with the limit and the
 * milliseconds until a retry can pass.
 * @since 0.1.0
 * @stability stable
 */
export class RateLimited extends RateLimitedBase {}

/**
 * Options for {@link rateLimit}. `limit`, `window`, `algorithm` and `tokens`
 * are Effect's `RateLimiter.consume` options.
 * @since 0.1.0
 * @stability stable
 */
export interface RateLimitOptions<TCtx, TInput, TMeta> {
  /** The bucket a call counts against, e.g. `({ ctx }) => \`login:${ctx.ip}\``. */
  readonly key: (opts: {
    readonly ctx: TCtx;
    readonly input: TInput;
    readonly meta: TMeta;
    readonly path: string;
  }) => string;
  readonly limit: number;
  readonly window: Duration.Input;
  /** @default 'fixed-window' */
  readonly algorithm?: 'fixed-window' | 'token-bucket';
  /** `'delay'` waits for capacity instead of failing. @default 'fail' */
  readonly onExceeded?: 'fail' | 'delay';
  /** Tokens one call takes. @default 1 */
  readonly tokens?: number;
}

const seconds = (d: Duration.Duration) =>
  String(Math.ceil(Duration.toMillis(d) / 1000));

/**
 * Limits calls with Effect's `RateLimiter` (`effect/persistence`), so the
 * store is a layer: in memory for one instance, Redis for many. Sets
 * `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset`, plus
 * `Retry-After` when it fails with {@link RateLimited}. Store failures are
 * defects (a masked 500).
 *
 * @example
 * ```ts
 * import { RateLimiter } from 'effect/persistence';
 *
 * const login = t.procedure
 *   .use(rateLimit<{ ctx: { ip: string } }>({ key: ({ ctx }) => `login:${ctx.ip}`, limit: 5, window: '1 minute' }))
 *   .mutation(…);
 *
 * createFetchHandler({
 *   router,
 *   layer: RateLimiter.layer.pipe(Layer.provide(RateLimiter.layerStoreMemory)),
 * });
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function rateLimit<TReq extends MiddlewareRequirements = {}>(
  options: RateLimitOptions<ReqCtx<TReq>, ReqInput<TReq>, ReqMeta<TReq>>,
): EffectMiddleware<
  ReqCtx<TReq>,
  ReqInput<TReq>,
  ReqMeta<TReq>,
  {},
  RateLimited,
  RateLimiter.RateLimiter,
  never,
  never,
  Unset
> {
  return makeEffectMiddleware((opts: any) =>
    Effect.gen(function* () {
      const limiter = yield* RateLimiter.RateLimiter;
      const headers: Headers = opts.response.headers;
      const result = yield* limiter
        .consume({
          key: options.key(opts),
          limit: options.limit,
          window: options.window,
          algorithm: options.algorithm,
          onExceeded: options.onExceeded,
          tokens: options.tokens,
        })
        .pipe(
          Effect.catchTag('RateLimiterError', (err) => {
            if (err.reason._tag !== 'RateLimitExceeded') return Effect.die(err);
            const { retryAfter } = err.reason;
            headers.set('ratelimit-limit', String(err.reason.limit));
            headers.set('ratelimit-remaining', '0');
            headers.set('ratelimit-reset', seconds(retryAfter));
            headers.set('retry-after', seconds(retryAfter));
            return Effect.fail(
              new RateLimited({
                limit: err.reason.limit,
                retryAfter: Duration.toMillis(retryAfter),
              }),
            );
          }),
        );
      headers.set('ratelimit-limit', String(result.limit));
      headers.set('ratelimit-remaining', String(Math.max(0, result.remaining)));
      headers.set('ratelimit-reset', seconds(result.resetAfter));
      if (!Duration.isZero(result.delay)) yield* Effect.sleep(result.delay);
      return yield* opts.next();
    }),
  );
}
