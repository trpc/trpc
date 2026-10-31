import { assert, it } from "@effect/vitest"
import { Context, Duration, Effect, Exit, Fiber, Layer, Logger, Stream } from "effect"
import { CircuitBreaker, Redis } from "effect/persistence"
import { TestClock } from "effect/testing"
import { fail, held, rejection } from "./CircuitBreakerTest.ts"

/**
 * Wraps the Redis connection so a test can cut one "process" off from Redis
 * while another keeps talking to it.
 */
const partitionable = Effect.gen(function*() {
  const redis = yield* Redis.Redis
  const partition = { down: false }
  const gate = <A>(effect: Effect.Effect<A, Redis.RedisError>) =>
    Effect.suspend(() => partition.down ? Effect.fail(new Redis.RedisError({ cause: "partitioned" })) : effect)
  const service: Redis.Redis["Service"] = {
    send: <A>(command: string, ...args: ReadonlyArray<string>) => gate(redis.send<A>(command, ...args)),
    subscribe: redis.subscribe,
    eval: <Config extends { readonly params: ReadonlyArray<unknown>; readonly result: unknown }>(
      script: Redis.Script<Config>
    ) =>
    (...params: Config["params"]) => gate(redis.eval(script)(...params)),
    reserve: redis.reserve
  }
  return { partition, redis: service } as const
})

/**
 * Builds a separate Redis store, as another process would have, on the given
 * connection.
 */
const storeOn = (redis: Redis.Redis["Service"], options: Parameters<typeof CircuitBreaker.layerStoreRedis>[0]) =>
  CircuitBreaker.layerStoreRedis(options).pipe(
    Layer.provide(Layer.succeed(Redis.Redis, redis)),
    Layer.build,
    Effect.map(Context.get(CircuitBreaker.CircuitBreakerStore))
  )

const captureReports = () => {
  const reports: Array<unknown> = []
  const logger = Logger.make<unknown, void>((options) => {
    if (options.logLevel === "Warn" || options.logLevel === "Error") reports.push(options.message)
  })
  return { reports, layer: Logger.layer([logger]) } as const
}

/**
 * Redis-specific named cases. They run on live time, because the store reads
 * Redis `TIME` and the lease renewal fiber sleeps on the live clock.
 */
export const suite = (name: string, redisLayer: Layer.Layer<Redis.Redis, unknown>) => {
  it.layer(CircuitBreaker.layerStoreRedis().pipe(Layer.provideMerge(redisLayer)), {
    timeout: "30 seconds",
    concurrent: false
  })(`CircuitBreaker Redis store (${name})`, (it) => {
    const options = { tripPolicy: CircuitBreaker.consecutive(1), openDuration: "200 millis" } as const

    it.effect("a lapsed probe lease is taken over and the old holder's record is discarded", () =>
      Effect.gen(function*() {
        const key = "lease-takeover"
        const flaky = yield* partitionable
        const storeA = yield* storeOn(flaky.redis, { probeLease: "300 millis" })
        const a = yield* CircuitBreaker.make(options).pipe(
          Effect.provideService(CircuitBreaker.CircuitBreakerStore, storeA)
        )
        const b = yield* CircuitBreaker.make(options)
        const transitionsB = yield* b.transitions.pipe(
          Stream.take(1),
          Stream.runCollect,
          Effect.forkChild({ startImmediately: true })
        )

        yield* fail(a, key)
        yield* Effect.sleep("300 millis")
        const stale = yield* held(a, key, Effect.fail("boom"))
        // A can no longer renew, so its 300 millis lease lapses.
        flaky.partition.down = true
        yield* Effect.sleep("600 millis")
        assert.deepStrictEqual(yield* b.state(key), {
          _tag: "HalfOpen",
          key,
          probing: false,
          consecutiveOpenings: 1
        })

        const probe = yield* held(b, key, Effect.void)
        flaky.partition.down = false
        assert.isTrue(Exit.isFailure(yield* stale.release))
        assert.deepStrictEqual(yield* b.state(key), {
          _tag: "HalfOpen",
          key,
          probing: true,
          consecutiveOpenings: 1
        })

        assert.isTrue(Exit.isSuccess(yield* probe.release))
        assert.deepStrictEqual(yield* b.state(key), { _tag: "Closed", key })
        // The takeover itself emits nothing.
        assert.deepStrictEqual(yield* Fiber.join(transitionsB), [{ key, from: "HalfOpen", to: "Closed" }])
      }).pipe(TestClock.withLive))

    it.effect("a failed lease renewal is reported and retried without failing the probe", () => {
      const { layer, reports } = captureReports()
      return Effect.gen(function*() {
        const key = "lease-renewal"
        const flaky = yield* partitionable
        const storeA = yield* storeOn(flaky.redis, { probeLease: "600 millis" })
        const a = yield* CircuitBreaker.make(options).pipe(
          Effect.provideService(CircuitBreaker.CircuitBreakerStore, storeA)
        )
        const b = yield* CircuitBreaker.make(options)

        yield* fail(a, key)
        yield* Effect.sleep("300 millis")
        const probe = yield* held(a, key, Effect.void)
        // The renewal due after 200 millis fails, the one after 400 millis
        // succeeds.
        flaky.partition.down = true
        yield* Effect.sleep("300 millis")
        flaky.partition.down = false
        // Past the original 600 millis lease, so only a renewal keeps it.
        yield* Effect.sleep("500 millis")
        assert.strictEqual((yield* rejection(Effect.void.pipe(b.execute({ key }))))._tag, "CircuitHalfOpen")

        assert.isTrue(Exit.isSuccess(yield* probe.release))
        assert.deepStrictEqual(yield* b.state(key), { _tag: "Closed", key })
        assert.isAbove(reports.length, 0)
      }).pipe(Effect.provide(layer), TestClock.withLive)
    })

    it.effect("a renewal after an Ignored probe frees the slot does not take the lease back", () =>
      Effect.gen(function*() {
        const key = "lease-release"
        const redis = yield* Redis.Redis
        const store = yield* storeOn(redis, { probeLease: "600 millis" })
        const breaker = yield* CircuitBreaker.make(options).pipe(
          Effect.provideService(CircuitBreaker.CircuitBreakerStore, store)
        )

        yield* fail(breaker, key)
        yield* Effect.sleep("300 millis")
        yield* Effect.scoped(Effect.gen(function*() {
          const admission = yield* store.admit(key)
          assert.isTrue(admission.probe)
          yield* store.record({
            key,
            generation: admission.generation,
            outcome: "Ignored",
            tripPolicy: options.tripPolicy,
            openFor: Duration.zero
          })
          // The renewal fiber stays alive until the admit scope closes, as it
          // does while execute is still waiting on record. Its tick after 200
          // millis lands after the release.
          yield* Effect.sleep("350 millis")
          assert.deepStrictEqual(yield* store.state(key), {
            _tag: "HalfOpen",
            key,
            probing: false,
            consecutiveOpenings: 1
          })
        }))
      }).pipe(TestClock.withLive))

    it.effect("a leased HalfOpen key outlives a shorter idleTimeToLive, and freeing the slot restores it", () =>
      Effect.gen(function*() {
        const key = "retention-half-open"
        const redis = yield* Redis.Redis
        const store = yield* storeOn(redis, { probeLease: "1 second", idleTimeToLive: "300 millis" })
        const breaker = yield* CircuitBreaker.make({
          tripPolicy: CircuitBreaker.consecutive(1),
          openDuration: "100 millis"
        }).pipe(Effect.provideService(CircuitBreaker.CircuitBreakerStore, store))
        const pttl = redis.send<number>("PTTL", `circuitbreaker:${key}`)

        yield* fail(breaker, key)
        yield* Effect.sleep("200 millis")
        const probe = yield* held(breaker, key, Effect.fail("boom"))
        // The remaining lease plus idleTimeToLive.
        const leased = yield* pttl
        assert.isAbove(leased, 1000)
        assert.isAtMost(leased, 1300)

        // Past idleTimeToLive, the first lease and the first expiry: only the
        // renewals keep the key and the probe's slot.
        yield* Effect.sleep("1500 millis")
        assert.deepStrictEqual(yield* breaker.state(key), {
          _tag: "HalfOpen",
          key,
          probing: true,
          consecutiveOpenings: 1
        })
        assert.isAbove(yield* pttl, 300)

        // The probe's failure still counts as the second opening.
        yield* probe.release
        const reopened = yield* breaker.state(key)
        assert.strictEqual(reopened._tag === "Open" && reopened.consecutiveOpenings, 2)

        // An interrupted probe frees the slot, so the key is back on
        // idleTimeToLive.
        yield* Effect.sleep("200 millis")
        const interrupted = yield* held(breaker, key, Effect.void)
        yield* Fiber.interrupt(interrupted.fiber)
        assert.deepStrictEqual(yield* breaker.state(key), {
          _tag: "HalfOpen",
          key,
          probing: false,
          consecutiveOpenings: 2
        })
        const freed = yield* pttl
        assert.isAbove(freed, 0)
        assert.isAtMost(freed, 300)
      }).pipe(TestClock.withLive))

    it.effect("a duration Redis cannot represent is rejected before the script writes anything", () =>
      Effect.gen(function*() {
        const redis = yield* Redis.Redis
        const unrepresentable = Duration.millis(1e20)

        // admit never creates the key.
        const idleStore = yield* storeOn(redis, { idleTimeToLive: unrepresentable })
        const idle = yield* CircuitBreaker.make({ ...options, onStoreError: "fail" }).pipe(
          Effect.provideService(CircuitBreaker.CircuitBreakerStore, idleStore)
        )
        const error = yield* Effect.flip(Effect.void.pipe(idle.execute({ key: "unrepresentable-idle" })))
        assert.strictEqual(error.reason._tag, "CircuitBreakerStoreError")
        assert.strictEqual(yield* redis.send<number>("EXISTS", "circuitbreaker:unrepresentable-idle"), 0)

        // record leaves the hash and its TTL as they were.
        const key = "unrepresentable-open"
        const breaker = yield* CircuitBreaker.make({
          tripPolicy: CircuitBreaker.consecutive(1),
          openDuration: unrepresentable
        })
        yield* Effect.void.pipe(breaker.execute({ key }))
        const before = yield* redis.send("HGETALL", `circuitbreaker:${key}`)
        yield* fail(breaker, key)

        assert.deepStrictEqual(yield* redis.send("HGETALL", `circuitbreaker:${key}`), before)
        assert.isAbove(yield* redis.send<number>("PTTL", `circuitbreaker:${key}`), 0)
        assert.deepStrictEqual(yield* breaker.state(key), { _tag: "Closed", key })
      }))
  })
}
