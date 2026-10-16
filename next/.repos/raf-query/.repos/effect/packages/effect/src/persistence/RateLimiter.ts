/**
 * Coordinates rate limits through shared persistent storage.
 *
 * The `RateLimiter` service consumes tokens for string keys using fixed-window
 * counters or token-bucket state. It can protect external APIs, enforce quotas,
 * or throttle workers across fibers and processes that share the same store.
 * This module includes helpers that fail when a limit is exceeded, return the
 * delay needed before continuing, or wrap an effect so it waits automatically.
 * It also defines the store service and in-memory or Redis-backed store layers.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Config from "../Config.ts"
import * as Context from "../Context.ts"
import * as Duration from "../Duration.ts"
import * as Effect from "../Effect.ts"
import { flow, identity } from "../Function.ts"
import * as Layer from "../Layer.ts"
import * as Schema from "../Schema.ts"
import * as Redis from "./Redis.ts"

/**
 * Runtime type identifier for `RateLimiter` values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export const TypeId: TypeId = "~effect/persistence/RateLimiter"

/**
 * Type-level identifier used to brand `RateLimiter` values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export type TypeId = "~effect/persistence/RateLimiter"

/**
 * Service for consuming rate-limit tokens for a key using fixed-window or
 * token-bucket algorithms.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface RateLimiter {
  readonly [TypeId]: TypeId

  readonly consume: (options: {
    readonly algorithm?: "fixed-window" | "token-bucket" | undefined
    readonly onExceeded?: "delay" | "fail" | undefined
    readonly window: Duration.Input
    readonly limit: number
    readonly key: string
    readonly tokens?: number | undefined
  }) => Effect.Effect<ConsumeResult, RateLimiterError>

  readonly adaptiveConsume: (options: AdaptiveConsumeOptions) => Effect.Effect<AdaptiveConsumeResult, RateLimiterError>

  readonly adaptiveFeedback: (options: AdaptiveFeedbackOptions) => Effect.Effect<void, RateLimiterError>
}

/**
 * Service tag for persistent token-consumption services.
 *
 * **When to use**
 *
 * Use to access or provide rate-limit checks backed by fixed-window counters or
 * token-bucket state.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const RateLimiter: Context.Service<RateLimiter, RateLimiter> = Context.Service<RateLimiter>(TypeId)

/**
 * Creates a `RateLimiter` from the current `RateLimiterStore`.
 *
 * **Details**
 *
 * The limiter supports fixed-window and token-bucket algorithms and either
 * fails or returns a delay when a limit is exceeded.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make: Effect.Effect<
  RateLimiter,
  never,
  RateLimiterStore
> = Effect.gen(function*() {
  const store = yield* RateLimiterStore

  return identity<RateLimiter>({
    [TypeId]: TypeId,
    adaptiveConsume: store.adaptiveConsume,
    adaptiveFeedback: store.adaptiveFeedback,
    consume(options) {
      const tokens = options.tokens ?? 1
      const onExceeded = options.onExceeded ?? "fail"
      const algorithm = options.algorithm ?? "fixed-window"
      const window = Duration.max(Duration.fromInputUnsafe(options.window), Duration.millis(1))
      const windowMillis = Duration.toMillis(window)
      const refillRate = Duration.divideUnsafe(window, options.limit)
      const refillRateMillis = Duration.toMillis(refillRate)

      if (tokens > options.limit) {
        return onExceeded === "fail"
          ? Effect.fail(
            new RateLimiterError({
              reason: new RateLimitExceeded({
                key: options.key,
                retryAfter: window,
                limit: options.limit,
                remaining: 0
              })
            })
          )
          : Effect.succeed<ConsumeResult>({
            delay: window,
            limit: options.limit,
            remaining: 0,
            resetAfter: window
          })
      }

      if (algorithm === "fixed-window") {
        return Effect.flatMap(
          store.fixedWindow({
            key: options.key,
            tokens,
            refillRate,
            limit: onExceeded === "fail" ? options.limit : undefined
          }),
          ([count, ttl]) => {
            if (onExceeded === "fail") {
              const remaining = options.limit - count
              if (remaining < 0) {
                return Effect.fail(
                  new RateLimiterError({
                    reason: new RateLimitExceeded({
                      key: options.key,
                      retryAfter: Duration.millis(ttl),
                      limit: options.limit,
                      remaining: 0
                    })
                  })
                )
              }
              return Effect.succeed<ConsumeResult>({
                delay: Duration.zero,
                limit: options.limit,
                remaining,
                resetAfter: Duration.millis(ttl)
              })
            }
            const ttlTotal = count * refillRateMillis
            const elapsed = ttlTotal - ttl
            const windowNumber = Math.floor((count - 1) / options.limit)
            const remaining = (windowNumber * windowMillis) - elapsed
            const delay = remaining <= 0 ? Duration.zero : Duration.millis(remaining)
            return Effect.succeed<ConsumeResult>({
              delay,
              limit: options.limit,
              remaining: options.limit - count,
              resetAfter: Duration.millis(ttl)
            })
          }
        )
      }

      return Effect.flatMap(
        store.tokenBucket({
          key: options.key,
          tokens,
          limit: options.limit,
          refillRate,
          allowOverflow: onExceeded === "delay"
        }),
        ([remaining, elapsedMillis]) => {
          const delay = Duration.millis(Math.max(0, Math.ceil(-remaining) * refillRateMillis - elapsedMillis))
          const resetAfter = Duration.millis(
            Math.max(0, Math.ceil(options.limit - remaining) * refillRateMillis - elapsedMillis)
          )
          if (onExceeded === "fail" && remaining < 0) {
            return Effect.fail(
              new RateLimiterError({
                reason: new RateLimitExceeded({
                  key: options.key,
                  retryAfter: delay,
                  limit: options.limit,
                  remaining: 0
                })
              })
            )
          }
          return Effect.succeed<ConsumeResult>({
            delay,
            limit: options.limit,
            remaining,
            resetAfter
          })
        }
      )
    }
  })
})

/**
 * Provides `RateLimiter` using the current `RateLimiterStore`.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer.Layer<
  RateLimiter,
  never,
  RateLimiterStore
> = Layer.effect(RateLimiter, make)

/**
 * Accesses a function that applies rate limiting to an effect.
 *
 * **Example** (Applying rate limits to effects)
 *
 * ```ts import.meta.vitest
 * import { Effect, Layer } from "effect"
 * import { RateLimiter } from "effect/persistence"
 *
 * const messages: Array<string> = []
 * const program = Effect.gen(function*() {
 *   // Access the `withLimiter` function from the RateLimiter module
 *   const withLimiter = yield* RateLimiter.makeWithRateLimiter
 *
 *   // Apply a rate limiter to an effect
 *   yield* Effect.sync(() => messages.push("Making a request with rate limiting")).pipe(
 *     withLimiter({
 *       key: "some-key",
 *       limit: 10,
 *       onExceeded: "delay",
 *       window: "5 seconds",
 *       algorithm: "fixed-window"
 *     })
 *   )
 * }).pipe(
 *   Effect.provide(RateLimiter.layer.pipe(Layer.provide(RateLimiter.layerStoreMemory)))
 * )
 *
 * await Effect.runPromise(program)
 * messages // => ["Making a request with rate limiting"]
 * ```
 *
 * @stability unstable
 * @category accessors
 * @since 4.0.0
 */
export const makeWithRateLimiter: Effect.Effect<
  ((options: {
    readonly algorithm?: "fixed-window" | "token-bucket" | undefined
    readonly onExceeded?: "delay" | "fail" | undefined
    readonly window: Duration.Input
    readonly limit: number
    readonly key: string
    readonly tokens?: number | undefined
  }) => <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E | RateLimiterError, R>),
  never,
  RateLimiter
> = RateLimiter.use((limiter) =>
  Effect.succeed((options) => (effect) =>
    Effect.flatMap(limiter.consume(options), ({ delay }) => {
      if (Duration.isZero(delay)) return effect
      return Effect.delay(effect, delay)
    })
  )
)

/**
 * Sleeps when the rate limit is exceeded.
 *
 * **Example** (Sleeping until rate limit permits)
 *
 * ```ts import.meta.vitest
 * import { Effect, Layer } from "effect"
 * import { RateLimiter } from "effect/persistence"
 *
 * const program = Effect.gen(function*() {
 *   const limiter = yield* RateLimiter.RateLimiter
 *   const partiallyApplied = RateLimiter.sleep(limiter)
 *   const partial = yield* partiallyApplied({
 *     key: "partial",
 *     limit: 10,
 *     window: "5 seconds",
 *     algorithm: "fixed-window"
 *   })
 *   const direct = yield* RateLimiter.sleep(limiter, {
 *     key: "direct",
 *     limit: 10,
 *     window: "5 seconds",
 *     algorithm: "fixed-window"
 *   })
 *   return [partial.remaining, direct.remaining]
 * }).pipe(
 *   Effect.provide(RateLimiter.layer.pipe(Layer.provide(RateLimiter.layerStoreMemory)))
 * )
 *
 * await Effect.runPromise(program) // => [9, 9]
 * ```
 *
 * @stability unstable
 * @category accessors
 * @since 4.0.0
 */
export function sleep(self: RateLimiter): (options: {
  readonly algorithm?: "fixed-window" | "token-bucket" | undefined
  readonly window: Duration.Input
  readonly limit: number
  readonly key: string
  readonly tokens?: number | undefined
}) => Effect.Effect<ConsumeResult, RateLimiterError>
/**
 * @stability unstable
 */
export function sleep(self: RateLimiter, options: {
  readonly algorithm?: "fixed-window" | "token-bucket" | undefined
  readonly window: Duration.Input
  readonly limit: number
  readonly key: string
  readonly tokens?: number | undefined
}): Effect.Effect<ConsumeResult, RateLimiterError>
/**
 * @stability unstable
 */
export function sleep(self: RateLimiter, options?: {
  readonly algorithm?: "fixed-window" | "token-bucket" | undefined
  readonly window: Duration.Input
  readonly limit: number
  readonly key: string
  readonly tokens?: number | undefined
}):
  | Effect.Effect<ConsumeResult, RateLimiterError>
  | ((options: {
    readonly algorithm?: "fixed-window" | "token-bucket" | undefined
    readonly window: Duration.Input
    readonly limit: number
    readonly key: string
    readonly tokens?: number | undefined
  }) => Effect.Effect<ConsumeResult, RateLimiterError>)
{
  if (options === undefined) {
    return (options) => sleep(self, options)
  }
  return Effect.flatMap(
    self.consume({
      ...options,
      onExceeded: "delay"
    }),
    (result) => {
      if (Duration.isZero(result.delay)) return Effect.succeed(result)
      return Effect.as(Effect.sleep(result.delay), result)
    }
  )
}

/**
 * Runtime type identifier for `RateLimiterError`.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export const ErrorTypeId: ErrorTypeId = "~effect/persistence/RateLimiter/RateLimiterError"

/**
 * Type-level identifier used to brand `RateLimiterError` values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export type ErrorTypeId = "~effect/persistence/RateLimiter/RateLimiterError"

/**
 * Error reason for a rate-limit check that exceeded the configured limit.
 *
 * **Details**
 *
 * Includes the affected key, limit, remaining token count, and retry delay.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class RateLimitExceeded extends Schema.Error<RateLimitExceeded>(
  "effect/persistence/RateLimiter/RateLimitExceeded"
)({
  _tag: Schema.tag("RateLimitExceeded"),
  retryAfter: Schema.DurationFromMillis,
  key: Schema.String,
  limit: Schema.Finite,
  remaining: Schema.Finite
}) {
  /**
   * Public message used when the rate limiter rejects a request.
   *
   * @stability unstable
   * @since 4.0.0
   */
  override get message(): string {
    return `Rate limit exceeded`
  }
}

/**
 * Error reason for failures in the backing `RateLimiterStore`.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class RateLimitStoreError extends Schema.Error<RateLimitStoreError>(
  "effect/persistence/RateLimiter/RateLimitStoreError"
)({
  _tag: Schema.tag("RateLimitStoreError"),
  message: Schema.String,
  cause: Schema.optional(Schema.Defect())
}) {}

/**
 * Union of reasons carried by `RateLimiterError`.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export type RateLimiterErrorReason = RateLimitExceeded | RateLimitStoreError

/**
 * Schema for all reasons that can be carried by `RateLimiterError`.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export const RateLimiterErrorReason: Schema.Union<[
  typeof RateLimitExceeded,
  typeof RateLimitStoreError
]> = Schema.Union([RateLimitExceeded, RateLimitStoreError])

/**
 * Error raised by rate limiter operations, wrapping a concrete failure
 * `reason`.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class RateLimiterError extends Schema.Error<RateLimiterError>(ErrorTypeId)({
  _tag: Schema.tag("RateLimiterError"),
  reason: RateLimiterErrorReason
}) {
  // @effect-diagnostics-next-line overriddenSchemaConstructor:off
  constructor(props: {
    readonly reason: RateLimiterErrorReason
  }) {
    if ("cause" in props.reason) {
      super({
        ...props,
        cause: props.reason.cause
      } as any)
    } else {
      super(props)
    }
  }

  /**
   * Marks this value as a rate limiter error for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [ErrorTypeId]: ErrorTypeId = ErrorTypeId

  override get message(): string {
    return this.reason.message
  }
}

/**
 * Metadata returned after consuming tokens from a rate limiter.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ConsumeResult {
  /**
   * The amount of delay to wait before making the next request, when the rate
   * limiter is using the "delay" `onExceeded` strategy. It will be
   * Duration.zero if the request is allowed immediately.
   */
  readonly delay: Duration.Duration

  /**
   * The maximum number of requests allowed in the current window.
   */
  readonly limit: number

  /**
   * The number of remaining requests in the current window.
   */
  readonly remaining: number

  /**
   * The time until the rate limit fully resets.
   *
   * **Details**
   *
   * For token buckets, accounts for elapsed refill time and reserved debt,
   * assuming no further consumption.
   */
  readonly resetAfter: Duration.Duration
}

/**
 * Phase of adaptive rate limiting driven by server feedback.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type AdaptivePhase = "inactive" | "cooldown" | "learning" | "learned"

/**
 * Options for consuming tokens from the adaptive rate limiter store.
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export interface AdaptiveConsumeOptions {
  /**
   * The rate-limit key.
   */
  readonly key: string

  /**
   * The number of tokens to consume.
   */
  readonly tokens: number

  /**
   * The fallback limit configured for the regular rate limiter.
   */
  readonly fallbackLimit: number

  /**
   * The fallback window configured for the regular rate limiter.
   */
  readonly fallbackWindow: Duration.Duration
}

/**
 * Metadata returned after consuming tokens from the adaptive rate limiter store.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface AdaptiveConsumeResult {
  /**
   * The amount of delay to wait before making the request.
   */
  readonly delay: Duration.Duration

  /**
   * The adaptive state epoch used to correlate later response feedback.
   */
  readonly epoch: number

  /**
   * The adaptive phase observed by this consume operation.
   */
  readonly phase: AdaptivePhase
}

/**
 * Options for reporting response feedback to the adaptive rate limiter store.
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export interface AdaptiveFeedbackOptions {
  /**
   * The rate-limit key.
   */
  readonly key: string

  /**
   * The adaptive state epoch returned by `adaptiveConsume`.
   */
  readonly epoch: number

  /**
   * The number of tokens consumed by the request.
   */
  readonly tokens: number

  /**
   * The HTTP response status code.
   */
  readonly status: number

  /**
   * The parsed `Retry-After` delay, when present.
   */
  readonly retryAfter: Duration.Duration | undefined
}

/**
 * Defines the low-level backing store for rate-limit state.
 *
 * **When to use**
 *
 * Use to provide the shared counter storage and adaptive feedback state used by
 * persistent rate-limit checks.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class RateLimiterStore extends Context.Service<
  RateLimiterStore,
  {
    /**
     * Returns the token count *after* taking the specified `tokens` and time to
     * live for the `key`.
     *
     * If `limit` is provided, the number of taken tokens will be capped at the
     * limit.
     *
     * In the case the limit is exceeded, the returned count will be greater
     * than the limit, but the TTL will not be updated.
     */
    readonly fixedWindow: (options: {
      readonly key: string
      readonly tokens: number
      readonly refillRate: Duration.Duration
      readonly limit: number | undefined
    }) => Effect.Effect<readonly [count: number, ttl: number], RateLimiterError>

    /**
     * Refills the bucket for `key`, attempts to consume `tokens`, and returns
     * `[remaining, elapsedMillis]` from that single atomic operation.
     *
     * `remaining` is the token count after subtracting `tokens`. Fractional counts
     * must retain their numeric precision. A negative count is only persisted
     * when `allowOverflow` is true.
     *
     * `elapsedMillis` is the time since the current refill interval started, in
     * milliseconds (fractions preserved), always at least `0` and less than
     * `Duration.toMillis(refillRate)`. It is `0` when the bucket is at capacity
     * after refilling and before consuming. Otherwise the boundary advances by
     * whole refill intervals and the interval never restarts.
     */
    readonly tokenBucket: (options: {
      readonly key: string
      readonly tokens: number
      readonly limit: number
      readonly refillRate: Duration.Duration
      readonly allowOverflow: boolean
    }) => Effect.Effect<readonly [remaining: number, elapsedMillis: number], RateLimiterError>

    /**
     * Consumes tokens from the adaptive rate-limit state for the `key`.
     *
     * When the store has no adaptive state for the `key`, implementations
     * should return a zero delay with the inactive phase.
     */
    readonly adaptiveConsume: (
      options: AdaptiveConsumeOptions
    ) => Effect.Effect<AdaptiveConsumeResult, RateLimiterError>

    /**
     * Records response feedback for the adaptive rate-limit state.
     */
    readonly adaptiveFeedback: (options: AdaptiveFeedbackOptions) => Effect.Effect<void, RateLimiterError>
  }
>()("effect/persistence/RateLimiter/RateLimiterStore") {}

const adaptiveStateTtlGraceMillis = 60_000
const adaptiveStateMaxWindowMillis = 60 * 60 * 1_000

const clampAdaptiveDurationMillis = (millis: number): number => {
  if (Number.isNaN(millis) || millis <= 0) return 1
  return Math.min(millis, adaptiveStateMaxWindowMillis)
}

interface AdaptiveState {
  phase: AdaptivePhase
  epoch: number
  cooldownUntil: number
  learningStartedAt: number
  observedTokens: number
  learnedLimit: number
  learnedWindowMillis: number
  expiresAt: number
}

/**
 * Provides a process-local in-memory `RateLimiterStore`.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerStoreMemory: Layer.Layer<
  RateLimiterStore
> = Layer.sync(RateLimiterStore, () => {
  const fixedCounters = new Map<string, { count: number; expiresAt: number }>()
  const tokenBuckets = new Map<string, { tokens: number; lastRefill: number }>()
  const adaptiveStates = new Map<string, AdaptiveState>()

  const getAdaptiveState = (key: string, now: number): AdaptiveState | undefined => {
    const state = adaptiveStates.get(key)
    if (!state) return undefined
    if (state.expiresAt <= now) {
      adaptiveStates.delete(key)
      return undefined
    }
    return state
  }

  const cooldownExpiresAt = (cooldownUntil: number): number => cooldownUntil + adaptiveStateTtlGraceMillis

  const learningExpiresAt = (now: number, fallbackWindow: Duration.Duration): number =>
    now + Duration.toMillis(fallbackWindow) + adaptiveStateTtlGraceMillis

  const learnedExpiresAt = (now: number, learnedWindowMillis: number): number =>
    now + learnedWindowMillis + adaptiveStateTtlGraceMillis

  return RateLimiterStore.of({
    fixedWindow: (options) =>
      Effect.clockWith((clock) =>
        Effect.sync(() => {
          const refillRateMillis = Duration.toMillis(options.refillRate)
          const now = clock.currentTimeMillisUnsafe()
          let counter = fixedCounters.get(options.key)
          if (!counter || counter.expiresAt <= now) {
            counter = { count: 0, expiresAt: now }
            fixedCounters.set(options.key, counter)
          }
          if (options.limit && counter.count + options.tokens > options.limit) {
            return [counter.count + options.tokens, counter.expiresAt - now] as const
          }
          counter.count += options.tokens
          counter.expiresAt += refillRateMillis * options.tokens
          return [counter.count, counter.expiresAt - now] as const
        })
      ),
    tokenBucket: (options) =>
      Effect.clockWith((clock) =>
        Effect.sync(() => {
          const refillRateMillis = Duration.toMillis(options.refillRate)
          const now = clock.currentTimeMillisUnsafe()
          let bucket = tokenBuckets.get(options.key)
          if (!bucket) {
            bucket = { tokens: options.limit, lastRefill: now }
            tokenBuckets.set(options.key, bucket)
          }
          const tokensToAdd = Math.floor((now - bucket.lastRefill) / refillRateMillis)
          if (tokensToAdd > 0) {
            bucket.tokens = Math.min(options.limit, bucket.tokens + tokensToAdd)
            bucket.lastRefill += tokensToAdd * refillRateMillis
          }
          if (bucket.tokens >= options.limit) {
            bucket.lastRefill = now
          }

          const newTokenCount = bucket.tokens - options.tokens
          if (options.allowOverflow || newTokenCount >= 0) {
            bucket.tokens = newTokenCount
          }
          return [newTokenCount, Math.max(0, now - bucket.lastRefill)] as const
        })
      ),
    adaptiveConsume: (options) =>
      Effect.clockWith((clock) =>
        Effect.sync(() => {
          const now = clock.currentTimeMillisUnsafe()
          const state = getAdaptiveState(options.key, now)
          if (!state) {
            return {
              delay: Duration.zero,
              epoch: 0,
              phase: "inactive"
            }
          }

          if (state.phase === "cooldown") {
            if (state.cooldownUntil > now) {
              return {
                delay: Duration.millis(state.cooldownUntil - now),
                epoch: state.epoch,
                phase: "cooldown"
              }
            }

            state.phase = "learning"
            state.epoch += 1
            state.learningStartedAt = now
            state.observedTokens = options.tokens
            state.expiresAt = learningExpiresAt(now, options.fallbackWindow)
            return {
              delay: Duration.zero,
              epoch: state.epoch,
              phase: "learning"
            }
          }

          if (state.phase === "learning") {
            state.observedTokens += options.tokens
            return {
              delay: Duration.zero,
              epoch: state.epoch,
              phase: state.phase
            }
          }

          if (state.phase === "learned") {
            const refillRateMillis = state.learnedWindowMillis / state.learnedLimit
            if (state.cooldownUntil <= now) {
              state.observedTokens = 0
              state.cooldownUntil = now
            }
            state.observedTokens += options.tokens
            state.cooldownUntil += refillRateMillis * options.tokens

            const ttl = state.cooldownUntil - now
            const ttlTotal = state.observedTokens * refillRateMillis
            const elapsed = ttlTotal - ttl
            const windowNumber = Math.floor((state.observedTokens - 1) / state.learnedLimit)
            const remaining = (windowNumber * state.learnedWindowMillis) - elapsed

            return {
              delay: remaining <= 0 ? Duration.zero : Duration.millis(remaining),
              epoch: state.epoch,
              phase: state.phase
            }
          }

          return {
            delay: Duration.zero,
            epoch: state.epoch,
            phase: state.phase
          }
        })
      ),
    adaptiveFeedback: (options) =>
      Effect.clockWith((clock) =>
        Effect.sync(() => {
          if (options.status !== 429 || options.retryAfter === undefined) return

          const retryAfterMillis = clampAdaptiveDurationMillis(Duration.toMillis(options.retryAfter))

          const now = clock.currentTimeMillisUnsafe()
          const cooldownUntil = now + retryAfterMillis
          const state = getAdaptiveState(options.key, now)
          if (!state) {
            if (options.epoch !== 0) return
            adaptiveStates.set(options.key, {
              phase: "cooldown",
              epoch: 0,
              cooldownUntil,
              learningStartedAt: 0,
              observedTokens: 0,
              learnedLimit: 0,
              learnedWindowMillis: 0,
              expiresAt: cooldownExpiresAt(cooldownUntil)
            })
            return
          }

          if (state.epoch !== options.epoch) return

          if (state.phase === "cooldown") {
            state.cooldownUntil = Math.max(state.cooldownUntil, cooldownUntil)
            state.expiresAt = cooldownExpiresAt(state.cooldownUntil)
            return
          }

          if (state.phase === "learning") {
            const acceptedTokens = state.observedTokens - options.tokens
            if (acceptedTokens <= 0) {
              state.phase = "cooldown"
              state.cooldownUntil = cooldownUntil
              state.learningStartedAt = 0
              state.observedTokens = 0
              state.learnedLimit = 0
              state.learnedWindowMillis = 0
              state.expiresAt = cooldownExpiresAt(cooldownUntil)
              return
            }

            const learnedWindowMillis = clampAdaptiveDurationMillis((now - state.learningStartedAt) + retryAfterMillis)
            state.phase = "learned"
            state.epoch += 1
            state.cooldownUntil = state.learningStartedAt + learnedWindowMillis
            state.observedTokens = acceptedTokens
            state.learnedLimit = acceptedTokens
            state.learnedWindowMillis = learnedWindowMillis
            state.expiresAt = learnedExpiresAt(now, learnedWindowMillis)
            return
          }

          if (state.phase === "learned") {
            state.phase = "cooldown"
            state.cooldownUntil = cooldownUntil
            state.learningStartedAt = 0
            state.observedTokens = 0
            state.learnedLimit = 0
            state.learnedWindowMillis = 0
            state.expiresAt = cooldownExpiresAt(cooldownUntil)
          }
        })
      )
  })
})

/**
 * Creates a Redis-backed `RateLimiterStore` using Lua scripts and the
 * configured key prefix.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeStoreRedis = Effect.fnUntraced(function*(
  options?: {
    readonly prefix?: string | undefined
  }
) {
  const prefix = options?.prefix ?? "ratelimiter:"
  const redis = yield* Redis.Redis

  const fixedWindow = redis.eval(fixedWindowScript)
  const tokenBucket = redis.eval(tokenBucketScript)
  const adaptiveConsume = redis.eval(adaptiveConsumeScript)
  const adaptiveFeedback = redis.eval(adaptiveFeedbackScript)

  return RateLimiterStore.of({
    fixedWindow(options) {
      const key = `${prefix}${options.key}`
      const refillMillis = Duration.toMillis(options.refillRate)
      return Effect.mapError(
        fixedWindow(key, options.tokens, refillMillis, options.limit),
        (cause) =>
          new RateLimiterError({
            reason: new RateLimitStoreError({
              message: `Failed to execute fixedWindow rate limiting command`,
              cause: cause.cause
            })
          })
      )
    },
    tokenBucket(options) {
      const key = `${prefix}${options.key}`
      const lastRefillKey = `${key}:refill`
      const refillMillis = Duration.toMillis(options.refillRate)
      return Effect.clockWith((clock) =>
        Effect.mapError(
          Effect.map(
            tokenBucket(
              key,
              lastRefillKey,
              options.tokens,
              refillMillis,
              options.limit,
              clock.currentTimeMillisUnsafe(),
              options.allowOverflow ? 1 : 0
            ),
            ([remaining, elapsedMillis]) => [Number(remaining), Number(elapsedMillis)] as const
          ),
          (cause) =>
            new RateLimiterError({
              reason: new RateLimitStoreError({
                message: `Failed to execute tokenBucket rate limiting command`,
                cause
              })
            })
        )
      )
    },
    adaptiveConsume(options) {
      const key = `${prefix}${options.key}:adaptive`
      return Effect.map(
        Effect.mapError(
          adaptiveConsume(
            key,
            options.tokens,
            Duration.toMillis(options.fallbackWindow),
            adaptiveStateTtlGraceMillis
          ),
          (cause) =>
            new RateLimiterError({
              reason: new RateLimitStoreError({
                message: `Failed to execute adaptiveConsume rate limiting command`,
                cause: cause.cause
              })
            })
        ),
        ([delayMillis, epoch, phase]) => ({
          delay: delayMillis <= 0 ? Duration.zero : Duration.millis(delayMillis),
          epoch,
          phase
        })
      )
    },
    adaptiveFeedback(options) {
      if (options.status !== 429 || options.retryAfter === undefined) return Effect.void
      const retryAfterMillis = clampAdaptiveDurationMillis(Duration.toMillis(options.retryAfter))
      const key = `${prefix}${options.key}:adaptive`
      return Effect.asVoid(
        Effect.mapError(
          adaptiveFeedback(
            key,
            options.epoch,
            options.tokens,
            retryAfterMillis,
            adaptiveStateTtlGraceMillis,
            adaptiveStateMaxWindowMillis
          ),
          (cause) =>
            new RateLimiterError({
              reason: new RateLimitStoreError({
                message: `Failed to execute adaptiveFeedback rate limiting command`,
                cause: cause.cause
              })
            })
        )
      )
    }
  })
})

const fixedWindowScript = Redis.script(
  (key: string, tokens: number, refillMillis: number, limit?: number) => [key, tokens, refillMillis, limit],
  {
    numberOfKeys: 1,
    lua: `
local key = KEYS[1]
local tokens = tonumber(ARGV[1])
local refillms = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local current = tonumber(redis.call("GET", key))

if not current then
  local nextpttl = math.max(1, math.ceil(refillms * tokens))
  redis.call("SET", key, tokens, "PX", nextpttl)
  return { tokens, nextpttl }
end

local currentpttl = tonumber(redis.call("PTTL", key) or "0")
local next = current + tokens
if limit and next > limit then
  return { next, currentpttl }
end

local nextpttl = math.max(1, math.ceil(currentpttl + (refillms * tokens)))
redis.call("SET", key, next, "PX", nextpttl)
return { next, nextpttl }
`
  }
).withReturnType<readonly [currentTokens: number, nextPttl: number]>()

const tokenBucketScript = Redis.script(
  (
    key: string,
    lastRefillKey: string,
    tokens: number,
    refillMillis: number,
    limit: number,
    now: number,
    overflow: 0 | 1
  ) => [key, lastRefillKey, tokens, refillMillis, limit, now, overflow],
  {
    numberOfKeys: 2,
    lua: `
local key = KEYS[1]
local last_refill_key = KEYS[2]
local tokens = tonumber(ARGV[1])
local refill_ms = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local now = tonumber(ARGV[4])
local overflow = ARGV[5] == "1"
local current = tonumber(redis.call("GET", key))
local last_refill = tonumber(redis.call("GET", last_refill_key))

if not current then current = limit end
if not last_refill then last_refill = now end

local elapsed = now - last_refill
local refill_amount = math.floor(elapsed / refill_ms)
if refill_amount > 0 then
  current = math.min(current + refill_amount, limit)
  last_refill = last_refill + (refill_amount * refill_ms)
end
if current >= limit then
  last_refill = now
end

local next = current - tokens
local stored = current
if next >= 0 or overflow then
  stored = next
end

elapsed = math.max(0, now - last_refill)
local ttl = math.ceil(math.ceil(limit - stored) * refill_ms - elapsed)
if ttl < 1 then ttl = 1 end
redis.call("SET", key, stored, "PX", ttl)
redis.call("SET", last_refill_key, last_refill, "PX", ttl)
-- Use 17 significant digits to round-trip both numbers.
return { string.format("%.17g", next), string.format("%.17g", elapsed) }
`
  }
).withReturnType<readonly [remaining: string, elapsedMillis: string]>()

const adaptiveConsumeScript = Redis.script(
  (key: string, tokens: number, fallbackWindowMillis: number, ttlGraceMillis: number) => [
    key,
    tokens,
    fallbackWindowMillis,
    ttlGraceMillis
  ],
  {
    numberOfKeys: 1,
    lua: `
local key = KEYS[1]
local tokens = tonumber(ARGV[1])
local fallback_window_ms = tonumber(ARGV[2])
local ttl_grace_ms = tonumber(ARGV[3])

local time = redis.call("TIME")
local now = (tonumber(time[1]) * 1000) + math.floor(tonumber(time[2]) / 1000)

local phase = redis.call("HGET", key, "phase")
if not phase then
  return { 0, 0, "inactive" }
end

local epoch = tonumber(redis.call("HGET", key, "epoch") or "0")

if phase == "cooldown" then
  local cooldown_until = tonumber(redis.call("HGET", key, "cooldownUntil") or "0")
  if cooldown_until > now then
    return { math.ceil(cooldown_until - now), epoch, "cooldown" }
  end

  epoch = epoch + 1
  redis.call(
    "HSET",
    key,
    "phase",
    "learning",
    "epoch",
    epoch,
    "cooldownUntil",
    0,
    "learningStartedAt",
    now,
    "observedTokens",
    tokens,
    "learnedLimit",
    0,
    "learnedWindowMillis",
    0
  )
  redis.call("PEXPIRE", key, math.max(1, math.ceil(fallback_window_ms + ttl_grace_ms)))
  return { 0, epoch, "learning" }
end

if phase == "learning" then
  local observed_tokens = tonumber(redis.call("HGET", key, "observedTokens") or "0") + tokens
  redis.call("HSET", key, "observedTokens", observed_tokens)
  return { 0, epoch, "learning" }
end

if phase == "learned" then
  local cooldown_until = tonumber(redis.call("HGET", key, "cooldownUntil") or "0")
  local observed_tokens = tonumber(redis.call("HGET", key, "observedTokens") or "0")
  local learned_limit = tonumber(redis.call("HGET", key, "learnedLimit") or "0")
  local learned_window_ms = tonumber(redis.call("HGET", key, "learnedWindowMillis") or "0")
  local refill_rate_ms = learned_window_ms / learned_limit

  if cooldown_until <= now then
    observed_tokens = 0
    cooldown_until = now
  end

  observed_tokens = observed_tokens + tokens
  cooldown_until = cooldown_until + (refill_rate_ms * tokens)

  local ttl = cooldown_until - now
  local ttl_total = observed_tokens * refill_rate_ms
  local elapsed = ttl_total - ttl
  local window_number = math.floor((observed_tokens - 1) / learned_limit)
  local remaining = (window_number * learned_window_ms) - elapsed

  redis.call("HSET", key, "observedTokens", observed_tokens, "cooldownUntil", cooldown_until)

  if remaining <= 0 then
    return { 0, epoch, "learned" }
  end
  return { math.ceil(remaining), epoch, "learned" }
end

return { 0, epoch, phase }
`
  }
).withReturnType<readonly [delayMillis: number, epoch: number, phase: AdaptivePhase]>()

const adaptiveFeedbackScript = Redis.script(
  (
    key: string,
    epoch: number,
    tokens: number,
    retryAfterMillis: number,
    ttlGraceMillis: number,
    maxWindowMillis: number
  ) => [
    key,
    epoch,
    tokens,
    retryAfterMillis,
    ttlGraceMillis,
    maxWindowMillis
  ],
  {
    numberOfKeys: 1,
    lua: `
local key = KEYS[1]
local feedback_epoch = tonumber(ARGV[1])
local tokens = tonumber(ARGV[2])
local retry_after_ms = tonumber(ARGV[3])
local ttl_grace_ms = tonumber(ARGV[4])
local max_window_ms = tonumber(ARGV[5])

if retry_after_ms <= 0 then
  retry_after_ms = 1
end
if retry_after_ms > max_window_ms then
  retry_after_ms = max_window_ms
end

local time = redis.call("TIME")
local now = (tonumber(time[1]) * 1000) + math.floor(tonumber(time[2]) / 1000)
local cooldown_until = now + retry_after_ms

local phase = redis.call("HGET", key, "phase")
if not phase then
  if feedback_epoch ~= 0 then
    return 0
  end
  redis.call(
    "HSET",
    key,
    "phase",
    "cooldown",
    "epoch",
    0,
    "cooldownUntil",
    cooldown_until,
    "learningStartedAt",
    0,
    "observedTokens",
    0,
    "learnedLimit",
    0,
    "learnedWindowMillis",
    0
  )
  redis.call("PEXPIRE", key, math.max(1, math.ceil(retry_after_ms + ttl_grace_ms)))
  return 1
end

local epoch = tonumber(redis.call("HGET", key, "epoch") or "0")
if epoch ~= feedback_epoch then
  return 0
end

if phase == "cooldown" then
  local current_cooldown_until = tonumber(redis.call("HGET", key, "cooldownUntil") or "0")
  if current_cooldown_until > cooldown_until then
    cooldown_until = current_cooldown_until
  end
  redis.call("HSET", key, "cooldownUntil", cooldown_until)
  redis.call("PEXPIRE", key, math.max(1, math.ceil((cooldown_until - now) + ttl_grace_ms)))
  return 1
end

if phase == "learning" then
  local observed_tokens = tonumber(redis.call("HGET", key, "observedTokens") or "0")
  local accepted_tokens = observed_tokens - tokens
  if accepted_tokens <= 0 then
    redis.call(
      "HSET",
      key,
      "phase",
      "cooldown",
      "cooldownUntil",
      cooldown_until,
      "learningStartedAt",
      0,
      "observedTokens",
      0,
      "learnedLimit",
      0,
      "learnedWindowMillis",
      0
    )
    redis.call("PEXPIRE", key, math.max(1, math.ceil(retry_after_ms + ttl_grace_ms)))
    return 1
  end

  local learning_started_at = tonumber(redis.call("HGET", key, "learningStartedAt") or now)
  local learned_window_ms = (now - learning_started_at) + retry_after_ms
  if learned_window_ms <= 0 then
    learned_window_ms = 1
  end
  if learned_window_ms > max_window_ms then
    learned_window_ms = max_window_ms
  end
  local next_epoch = epoch + 1
  redis.call(
    "HSET",
    key,
    "phase",
    "learned",
    "epoch",
    next_epoch,
    "cooldownUntil",
    learning_started_at + learned_window_ms,
    "observedTokens",
    accepted_tokens,
    "learnedLimit",
    accepted_tokens,
    "learnedWindowMillis",
    learned_window_ms
  )
  redis.call("PEXPIRE", key, math.max(1, math.ceil(learned_window_ms + ttl_grace_ms)))
  return 1
end

if phase == "learned" then
  redis.call(
    "HSET",
    key,
    "phase",
    "cooldown",
    "cooldownUntil",
    cooldown_until,
    "learningStartedAt",
    0,
    "observedTokens",
    0,
    "learnedLimit",
    0,
    "learnedWindowMillis",
    0
  )
  redis.call("PEXPIRE", key, math.max(1, math.ceil(retry_after_ms + ttl_grace_ms)))
  return 1
end

return 0
`
  }
).withReturnType<number>()

/**
 * Provides a Redis-backed `RateLimiterStore` using `makeStoreRedis`.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerStoreRedis: (
  options?: { readonly prefix?: string | undefined }
) => Layer.Layer<
  RateLimiterStore,
  never,
  Redis.Redis
> = flow(makeStoreRedis, Layer.effect(RateLimiterStore))

/**
 * Provides a Redis-backed `RateLimiterStore` from wrapped configuration
 * options.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerStoreRedisConfig = (
  options: Config.Wrap<{ readonly prefix?: string | undefined }>
): Layer.Layer<RateLimiterStore, Config.ConfigError, Redis.Redis> =>
  Layer.effect(
    RateLimiterStore,
    Effect.flatMap(Config.unwrap(options), makeStoreRedis)
  )
