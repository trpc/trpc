import { assert, describe, it } from "@effect/vitest"
import { Cache, Context, Data, Deferred, Duration, Effect, Exit, Fiber, Latch, MutableHashMap, Option } from "effect"
import { Persistable, PersistedCache, Persistence } from "effect/persistence"
import { TestClock } from "effect/testing"
import { collectGarbage } from "./utils/gc.ts"

describe("Cache", () => {
  it.effect.skipIf(process.versions.bun !== undefined || process.versions.deno !== undefined)(
    "does not retain prior equal object keys on cache hits",
    () =>
      Effect.gen(function*() {
        const references: Array<WeakRef<object>> = []
        const control = new WeakRef({})
        let lookups = 0
        const cache = yield* Cache.make({
          capacity: 16,
          lookup: (_key: { readonly region: string }) => Effect.sync(() => ++lookups)
        })
        for (let i = 0; i < 10; i++) {
          const key = { region: "us-east-1" }
          references.push(new WeakRef(key))
          assert.strictEqual(yield* Cache.get(cache, key), 1)
        }
        assert.strictEqual(lookups, 1)
        assert.strictEqual(yield* Cache.size(cache), 1)
        // The last key may still be held by the cache.
        references.pop()
        yield* collectGarbage
        assert.isUndefined(control.deref())
        for (const reference of references) assert.isUndefined(reference.deref())
        assert.strictEqual(yield* Cache.size(cache), 1)
      })
  )

  describe("constructors", () => {
    it.effect("make - creates cache with fixed capacity", () =>
      Effect.gen(function*() {
        const cache = yield* Cache.make<string, number>({
          capacity: 10,
          lookup: (key) => Effect.succeed(key.length)
        })

        assert.strictEqual(cache.capacity, 10)
      }))

    it.effect("make - creates cache with default infinite TTL", () =>
      Effect.gen(function*() {
        const cache = yield* Cache.make<string, number>({
          capacity: 10,
          lookup: (key) => Effect.succeed(key.length)
        })

        // Add value and verify it doesn't expire
        yield* Cache.get(cache, "test")
        yield* TestClock.adjust(Duration.hours(1000))
        assert.isTrue(yield* Cache.has(cache, "test"))
      }))

    it.effect("make - creates cache with custom TTL", () =>
      Effect.gen(function*() {
        const cache = yield* Cache.make<string, number>({
          capacity: 10,
          lookup: (key) => Effect.succeed(key.length),
          timeToLive: "1 hour"
        })

        yield* Cache.get(cache, "test")
        yield* TestClock.adjust("30 minutes")
        assert.isTrue(yield* Cache.has(cache, "test"))

        yield* TestClock.adjust("31 minutes")
        assert.isFalse(yield* Cache.has(cache, "test"))
      }))

    it.effect("make - uses a numeric zero TTL", () =>
      Effect.gen(function*() {
        const cache = yield* Cache.make<string, number>({
          capacity: 10,
          lookup: (key) => Effect.succeed(key.length),
          timeToLive: 0
        })

        yield* Cache.get(cache, "test")

        assert.isFalse(yield* Cache.has(cache, "test"))
      }))

    it.effect("make - lookup function context is preserved", () =>
      Effect.gen(function*() {
        class TestService extends Context.Service<TestService, { value: number }>()("TestService") {}

        const program = Effect.gen(function*() {
          const cache = yield* Cache.make({
            capacity: 10,
            lookup: (_key: string) => Effect.map(TestService, (service) => service.value)
          })
          return yield* Cache.get(cache, "test")
        })

        const result = yield* program.pipe(
          Effect.provideService(TestService, TestService.of({ value: 42 }))
        )

        assert.strictEqual(result, 42)
      }))

    it.effect("make - spans are connected", () =>
      Effect.gen(function*() {
        const program = Effect.gen(function*() {
          const cache = yield* Cache.make({
            capacity: 10,
            lookup: (_key: string) =>
              Effect.currentSpan.pipe(
                Effect.withSpan("lookup")
              )
          })
          return yield* Cache.get(cache, "test")
        })

        const result = yield* program.pipe(
          Effect.withSpan("parent")
        )
        assert.strictEqual(result.name, "lookup")
        if (Option.isNone(result.parent)) {
          return yield* Effect.die("Expected parent span")
        }
        if (result.parent.value._tag !== "Span") {
          return yield* Effect.die("Expected span parent")
        }
        assert.strictEqual(result.parent.value.name, "parent")
      }))

    it.effect("makeWith - creates cache with function-based TTL", () =>
      Effect.gen(function*() {
        const cache = yield* Cache.makeWith(
          (key: string) => key === "fail" ? Effect.fail("error") : Effect.succeed(key.length),
          {
            capacity: 10,
            timeToLive: (exit, key) => {
              if (Exit.isFailure(exit)) return "1 second"
              return key === "short" ? "1 minute" : "1 hour"
            }
          }
        )

        // Success with long TTL
        yield* Cache.get(cache, "long")
        yield* TestClock.adjust("30 minutes")
        assert.isTrue(yield* Cache.has(cache, "long"))

        // Success with short TTL
        yield* Cache.get(cache, "short")
        assert.isTrue(yield* Cache.has(cache, "short"))
        yield* TestClock.adjust(Duration.sum(Duration.minutes(1), Duration.seconds(1)))
        assert.isFalse(yield* Cache.has(cache, "short"))
        assert.isTrue(yield* Cache.has(cache, "long"))

        // Failure with very short TTL
        yield* Effect.exit(Cache.get(cache, "fail"))
        assert.isTrue(yield* Cache.has(cache, "fail"))
        yield* TestClock.adjust("2 seconds")
        assert.isFalse(yield* Cache.has(cache, "fail"))
      }))

    it.effect("makeWith - TTL function receives correct parameters", () =>
      Effect.gen(function*() {
        const receivedParams: Array<{ exit: Exit.Exit<number, string>; key: string }> = []

        const cache = yield* Cache.makeWith<string, number, string>(
          (key) => key === "fail" ? Effect.fail("error") : Effect.succeed(key.length),
          {
            capacity: 10,
            timeToLive: (exit, key) => {
              receivedParams.push({ exit, key })
              return Duration.infinity
            }
          }
        )

        yield* Cache.get(cache, "test")
        yield* Effect.exit(Cache.get(cache, "fail"))

        assert.strictEqual(receivedParams.length, 2)
        assert.strictEqual(receivedParams[0].key, "test")
        assert.isTrue(Exit.isSuccess(receivedParams[0].exit))
        assert(Exit.isSuccess(receivedParams[0].exit))
        assert.strictEqual(receivedParams[0].exit.value, 4)

        assert.strictEqual(receivedParams[1].key, "fail")
        assert.isTrue(Exit.isFailure(receivedParams[1].exit))
        assert.deepStrictEqual(receivedParams[1].exit, Exit.fail("error"))
      }))
  })

  describe("basic operations", () => {
    describe("get", () => {
      it.effect("does not retain a synchronous zero-TTL lookup", () =>
        Effect.gen(function*() {
          const cache = yield* Cache.makeWith(
            (_key: string) => Effect.succeed(42),
            { capacity: 1, timeToLive: () => Duration.zero }
          )

          assert.strictEqual(yield* Cache.get(cache, "key"), 42)
          assert.strictEqual(yield* Cache.size(cache), 0)
        }))

      it.effect("removes a suspended zero-TTL lookup after completion", () =>
        Effect.gen(function*() {
          const started = yield* Latch.make()
          const gate = yield* Deferred.make<number>()
          const cache = yield* Cache.makeWith(
            (_key: string) => started.open.pipe(Effect.andThen(Deferred.await(gate))),
            { capacity: 1, timeToLive: () => Duration.zero }
          )

          const getter = yield* Cache.get(cache, "key").pipe(Effect.forkChild({ startImmediately: true }))
          yield* started.await
          assert.strictEqual(yield* Cache.size(cache), 1)

          yield* Deferred.succeed(gate, 42)
          assert.strictEqual(yield* Fiber.join(getter), 42)
          assert.strictEqual(yield* Cache.size(cache), 0)
        }))

      it.effect("zero-TTL failure does not evict a live entry at capacity", () =>
        Effect.gen(function*() {
          const cache = yield* Cache.makeWith(
            (key: string) => key === "bad" ? Effect.fail("error") : Effect.succeed(key.length),
            { capacity: 2, timeToLive: (exit) => Exit.isFailure(exit) ? Duration.zero : Duration.hours(1) }
          )

          yield* Cache.get(cache, "a")
          assert.deepStrictEqual(yield* Effect.exit(Cache.get(cache, "bad")), Exit.fail("error"))
          assert.strictEqual(yield* Cache.size(cache), 1)
          // Do not enumerate keys here: that would prune the expired entry and hide the eviction.
          yield* Cache.get(cache, "b")

          assert.deepStrictEqual(yield* Cache.getSuccess(cache, "a"), Option.some(1))
          assert.deepStrictEqual(yield* Cache.getSuccess(cache, "b"), Option.some(1))
          assert.strictEqual(yield* Cache.size(cache), 2)
        }))

      it.effect("zero-TTL lookup after expiration does not evict a live entry", () =>
        Effect.gen(function*() {
          let kLookups = 0
          const cache = yield* Cache.makeWith(
            (key: string) => key === "k" && ++kLookups === 2 ? Effect.fail("error") : Effect.succeed(1),
            {
              capacity: 2,
              timeToLive: (exit, key) =>
                Exit.isFailure(exit) ? Duration.zero : key === "k" ? Duration.minutes(1) : Duration.hours(1)
            }
          )

          yield* Cache.get(cache, "a")
          yield* Cache.get(cache, "k")
          yield* TestClock.adjust("2 minutes")
          assert.deepStrictEqual(yield* Effect.exit(Cache.get(cache, "k")), Exit.fail("error"))
          // Do not enumerate keys: that would prune the stale entry and hide the eviction.
          yield* Cache.get(cache, "b")

          assert.deepStrictEqual(yield* Cache.getSuccess(cache, "a"), Option.some(1))
          assert.deepStrictEqual(yield* Cache.getSuccess(cache, "b"), Option.some(1))
          assert.strictEqual(yield* Cache.size(cache), 2)
        }))

      it.effect("zero-TTL completion does not remove a newer set value", () =>
        Effect.gen(function*() {
          const started = yield* Latch.make()
          const gate = yield* Deferred.make<number, string>()
          const cache = yield* Cache.makeWith(
            (_key: string) => started.open.pipe(Effect.andThen(Deferred.await(gate))),
            { capacity: 1, timeToLive: (exit) => Exit.isFailure(exit) ? Duration.zero : Duration.hours(1) }
          )

          const getter = yield* Cache.get(cache, "key").pipe(
            Effect.exit,
            Effect.forkChild({ startImmediately: true })
          )
          yield* started.await
          yield* Cache.set(cache, "key", 99)
          yield* Deferred.fail(gate, "error")

          assert.deepStrictEqual(yield* Fiber.join(getter), Exit.fail("error"))
          assert.deepStrictEqual(yield* Cache.getSuccess(cache, "key"), Option.some(99))
          assert.strictEqual(yield* Cache.size(cache), 1)
        }))

      it.effect("does not retain synchronously interrupted lookups", () =>
        Effect.gen(function*() {
          let calls = 0
          const cache = yield* Cache.make<string, number>({
            capacity: 1,
            lookup: () => Effect.suspend(() => ++calls > 1 ? Effect.succeed(42) : Effect.interrupt)
          })

          yield* Effect.exit(Cache.get(cache, "key"))
          const second = yield* Effect.exit(Cache.get(cache, "key"))

          assert.deepStrictEqual(second, Exit.succeed(42))
        }))

      it.effect("cache hit - returns existing cached value", () =>
        Effect.gen(function*() {
          const { cache, lookupCount, setLookupResult } = yield* makeTestCache(10)
          setLookupResult("test", Effect.succeed(4))

          yield* Cache.get(cache, "test")
          const result = yield* Cache.get(cache, "test")

          assert.strictEqual(result, 4)
          assert.strictEqual(lookupCount(), 1)
        }))

      it.effect("cache hit - multiple different keys", () =>
        Effect.gen(function*() {
          const cache = yield* Cache.make<string, number>({
            capacity: 10,
            lookup: (key) => Effect.succeed(key.length)
          })

          const result1 = yield* Cache.get(cache, "a")
          const result2 = yield* Cache.get(cache, "ab")
          const result3 = yield* Cache.get(cache, "abc")

          assert.strictEqual(result1, 1)
          assert.strictEqual(result2, 2)
          assert.strictEqual(result3, 3)
        }))

      it.effect("cache hit - same key multiple times doesn't invoke lookup again", () =>
        Effect.gen(function*() {
          const { cache, lookupCount, setLookupResult } = yield* makeTestCache(10)
          setLookupResult("test", Effect.succeed(4))

          const results = yield* Effect.all([
            Cache.get(cache, "test"),
            Cache.get(cache, "test"),
            Cache.get(cache, "test")
          ])

          assert.deepStrictEqual(results, [4, 4, 4])
          assert.strictEqual(lookupCount(), 1)
        }))

      it.effect("cache miss - invokes lookup for non-existent key", () =>
        Effect.gen(function*() {
          const { cache, lookupCount, setLookupResult } = yield* makeTestCache(10)
          setLookupResult("test", Effect.succeed(42))

          const result = yield* Cache.get(cache, "test")

          assert.strictEqual(result, 42)
          assert.strictEqual(lookupCount(), 1)
        }))

      it.effect("cache miss - invokes lookup again after TTL expiration", () =>
        Effect.gen(function*() {
          let counter = 0
          const cache = yield* Cache.make<string, number>({
            capacity: 10,
            lookup: (_key) => Effect.sync(() => ++counter),
            timeToLive: "1 hour"
          })

          const result1 = yield* Cache.get(cache, "test")
          assert.strictEqual(result1, 1)

          yield* TestClock.adjust("30 minutes")
          const result2 = yield* Cache.get(cache, "test")
          assert.strictEqual(result2, 1)

          yield* TestClock.adjust("31 minutes")
          const result3 = yield* Cache.get(cache, "test")
          assert.strictEqual(result3, 2)
        }))

      it.effect("error handling - lookup function fails", () =>
        Effect.gen(function*() {
          const cache = yield* Cache.make<string, number, string>({
            capacity: 10,
            lookup: (_key) => Effect.fail("lookup error")
          })

          const result = yield* Effect.exit(Cache.get(cache, "test"))

          assert.deepStrictEqual(result, Exit.fail("lookup error"))
        }))

      it.effect("concurrent access - multiple fibers getting same key only invoke lookup once", () =>
        Effect.gen(function*() {
          let lookupCount = 0
          const cache = yield* Cache.make({
            capacity: 10,
            lookup: () => Effect.delay(Duration.millis(100))(Effect.sync(() => ++lookupCount))
          })

          const effects = [Cache.get(cache, "key"), Cache.get(cache, "key"), Cache.get(cache, "key")]
          const resultsFiber = yield* Effect.all(effects, { concurrency: "unbounded" }).pipe(Effect.forkChild)

          yield* TestClock.adjust(Duration.millis(150))
          const results = yield* Fiber.join(resultsFiber)

          assert.strictEqual(lookupCount, 1)
          assert.deepStrictEqual(results, [1, 1, 1])
        }))

      it.effect("concurrent access - race between get and invalidate", () =>
        Effect.gen(function*() {
          let lookupCount = 0
          const cache = yield* Cache.make<string, number>({
            capacity: 10,
            lookup: (_key) => Effect.delay(Duration.millis(50))(Effect.sync(() => ++lookupCount))
          })

          // First get starts
          const fiber1 = yield* Cache.get(cache, "test").pipe(Effect.forkChild)
          yield* TestClock.adjust(Duration.millis(25))

          // Invalidate while first get is in progress
          yield* Cache.invalidate(cache, "test")

          // Second get starts after invalidation
          const fiber2 = yield* Cache.get(cache, "test").pipe(Effect.forkChild)

          yield* TestClock.adjust(Duration.millis(100))
          const result1 = yield* Fiber.join(fiber1)
          const result2 = yield* Fiber.join(fiber2)

          assert.strictEqual(result1, 1)
          assert.strictEqual(result2, 2)
          assert.strictEqual(lookupCount, 2)
        }))

      it.effect("concurrent access - interrupting the first consumer does not interrupt the second", () =>
        Effect.gen(function*() {
          const lookupStarted = yield* Latch.make()
          const lookupComplete = yield* Latch.make()
          const cache = yield* Cache.make<string, number>({
            capacity: 10,
            lookup: () =>
              Effect.gen(function*() {
                yield* lookupStarted.open
                yield* lookupComplete.await
                return 42
              })
          })

          const first = yield* Cache.get(cache, "K1").pipe(Effect.forkChild({ startImmediately: true }))
          yield* lookupStarted.await
          const second = yield* Cache.get(cache, "K1").pipe(Effect.forkChild({ startImmediately: true }))
          const entry = Option.getOrThrow(MutableHashMap.get(cache.map, "K1"))
          const third = yield* entry.await().pipe(Effect.forkChild({ startImmediately: true }))

          yield* Fiber.interrupt(first)
          yield* lookupComplete.open

          assert.deepStrictEqual(yield* Fiber.await(second), Exit.succeed(42))
          assert.deepStrictEqual(yield* Fiber.await(third), Exit.succeed(42))
        }))

      it.effect("interrupting a getOption waiter keeps the shared lookup available", () =>
        Effect.gen(function*() {
          const started = yield* Latch.make()
          const finish = yield* Latch.make()
          let lookups = 0
          const cache = yield* Cache.make<string, number>({
            capacity: 10,
            lookup: () =>
              Effect.gen(function*() {
                lookups++
                yield* started.open
                yield* finish.await
                return 42
              })
          })

          const first = yield* Cache.get(cache, "key").pipe(Effect.forkChild({ startImmediately: true }))
          yield* started.await
          const waiter = yield* Cache.getOption(cache, "key").pipe(Effect.forkChild({ startImmediately: true }))
          const second = yield* Cache.get(cache, "key").pipe(Effect.forkChild({ startImmediately: true }))
          yield* Fiber.interrupt(waiter)
          yield* finish.open

          assert.deepStrictEqual(yield* Fiber.await(first), Exit.succeed(42))
          assert.deepStrictEqual(yield* Fiber.await(second), Exit.succeed(42))
          assert.deepStrictEqual(yield* Cache.getOption(cache, "key"), Option.some(42))
          assert.strictEqual(lookups, 1)
        }))

      it.effect("concurrent access - interrupting the last consumer interrupts the lookup", () =>
        Effect.gen(function*() {
          let lookupCount = 0
          const lookupStarted = yield* Latch.make()
          const lookupInterrupted = yield* Latch.make()
          const cache = yield* Cache.make<string, number>({
            capacity: 10,
            lookup() {
              lookupCount++
              return lookupCount === 1 ?
                Effect.onInterrupt(
                  lookupStarted.open.pipe(Effect.andThen(Effect.never)),
                  () => lookupInterrupted.open
                ) :
                Effect.succeed(42)
            }
          })

          const fiber = yield* Cache.get(cache, "K1").pipe(Effect.forkChild({ startImmediately: true }))
          yield* lookupStarted.await
          yield* Fiber.interrupt(fiber)

          yield* lookupInterrupted.await
          assert.strictEqual(yield* Cache.get(cache, "K1"), 42)
        }))

      it.effect("concurrent access - interrupted lookup does not remove a newer set value", () =>
        Effect.gen(function*() {
          const lookupStarted = yield* Latch.make()
          const lookupInterrupted = yield* Latch.make()
          const cache = yield* Cache.make<string, number>({
            capacity: 1,
            lookup: () =>
              Effect.onInterrupt(
                lookupStarted.open.pipe(Effect.andThen(Effect.never)),
                () => lookupInterrupted.open
              )
          })

          const getter = yield* Cache.get(cache, "key").pipe(Effect.forkChild({ startImmediately: true }))
          yield* lookupStarted.await
          yield* Cache.set(cache, "key", 99)
          yield* Fiber.interrupt(getter)
          yield* lookupInterrupted.await

          assert.deepStrictEqual(yield* Cache.getSuccess(cache, "key"), Option.some(99))
        }))

      it.effect("concurrent access - a get made while an abandoned lookup is finalizing starts a new lookup", () =>
        Effect.gen(function*() {
          let lookups = 0
          const started = yield* Latch.make()
          const finalizing = yield* Latch.make()
          const finishFinalizer = yield* Latch.make()
          const cache = yield* Cache.make<string, number>({
            capacity: 10,
            lookup: () =>
              Effect.suspend(() => {
                if (++lookups > 1) return Effect.succeed(lookups)
                return started.open.pipe(
                  Effect.andThen(Effect.never),
                  Effect.onInterrupt(() => finalizing.open.pipe(Effect.andThen(finishFinalizer.await)))
                )
              })
          })

          const getter = yield* Cache.get(cache, "key").pipe(Effect.forkChild({ startImmediately: true }))
          yield* started.await
          const interruptGetter = yield* Fiber.interrupt(getter).pipe(Effect.forkChild({ startImmediately: true }))
          yield* finalizing.await
          const fresh = yield* Cache.get(cache, "key").pipe(Effect.forkChild({ startImmediately: true }))
          yield* finishFinalizer.open
          yield* Fiber.join(interruptGetter)

          assert.deepStrictEqual(yield* Fiber.await(fresh), Exit.succeed(2))
          assert.strictEqual(yield* Cache.get(cache, "key"), 2)
          assert.strictEqual(lookups, 2)
        }))
    })

    describe("getOption", () => {
      it.effect("returns Some for existing cached value", () =>
        Effect.gen(function*() {
          const cache = yield* Cache.make<string, number>({
            capacity: 10,
            lookup: (key) => Effect.succeed(key.length)
          })

          yield* Cache.get(cache, "test")
          const result = yield* Cache.getOption(cache, "test")

          assert.deepStrictEqual(result, Option.some(4))
        }))

      it.effect("returns None for non-existent key", () =>
        Effect.gen(function*() {
          const cache = yield* Cache.make<string, number>({
            capacity: 10,
            lookup: (key) => Effect.succeed(key.length)
          })

          const result = yield* Cache.getOption(cache, "test")

          assert.deepStrictEqual(result, Option.none())
        }))

      it.effect("returns None for expired value", () =>
        Effect.gen(function*() {
          const cache = yield* Cache.make<string, number>({
            capacity: 10,
            lookup: (key) => Effect.succeed(key.length),
            timeToLive: "1 hour"
          })

          yield* Cache.get(cache, "test")
          yield* TestClock.adjust("2 hours")
          const result = yield* Cache.getOption(cache, "test")

          assert.deepStrictEqual(result, Option.none())
        }))

      it.effect("waits for value being computed and returns result", () =>
        Effect.gen(function*() {
          const deferred = yield* Deferred.make<void>()
          const cache = yield* Cache.make<string, number>({
            capacity: 10,
            lookup: (_key) => Deferred.await(deferred).pipe(Effect.as(42))
          })

          const getFiber = yield* Cache.get(cache, "test").pipe(Effect.forkChild)
          const optionFiber = yield* Cache.getOption(cache, "test").pipe(Effect.forkChild)

          yield* Deferred.succeed(deferred, void 0)

          const getResult = yield* Fiber.join(getFiber)
          const optionResult = yield* Fiber.join(optionFiber)

          assert.strictEqual(getResult, 42)
          assert.deepStrictEqual(optionResult, Option.some(42))
        }))
    })

    describe("getSuccess", () => {
      it.effect("returns Some for successfully cached value", () =>
        Effect.gen(function*() {
          const cache = yield* Cache.make<string, number>({
            capacity: 10,
            lookup: (key) => Effect.succeed(key.length)
          })

          yield* Cache.get(cache, "test")
          const result = yield* Cache.getSuccess(cache, "test")

          assert.deepStrictEqual(result, Option.some(4))
        }))

      it.effect("returns None for failed cached value", () =>
        Effect.gen(function*() {
          const cache = yield* Cache.make<string, number, string>({
            capacity: 10,
            lookup: (_key) => Effect.fail("error")
          })

          yield* Effect.exit(Cache.get(cache, "test"))
          const result = yield* Cache.getSuccess(cache, "test")

          assert.deepStrictEqual(result, Option.none())
        }))

      it.effect("returns None for non-existent key", () =>
        Effect.gen(function*() {
          const cache = yield* Cache.make<string, number>({
            capacity: 10,
            lookup: (key) => Effect.succeed(key.length)
          })

          const result = yield* Cache.getSuccess(cache, "test")

          assert.deepStrictEqual(result, Option.none())
        }))

      it.effect("returns None for expired value", () =>
        Effect.gen(function*() {
          const cache = yield* Cache.make<string, number>({
            capacity: 10,
            lookup: (key) => Effect.succeed(key.length),
            timeToLive: "1 hour"
          })

          yield* Cache.get(cache, "test")
          yield* TestClock.adjust("2 hours")
          const result = yield* Cache.getSuccess(cache, "test")

          assert.deepStrictEqual(result, Option.none())
        }))
    })
  })

  describe("modification operations", () => {
    describe("set", () => {
      it.effect("sets new key-value pair", () =>
        Effect.gen(function*() {
          const { cache, lookupCount } = yield* makeTestCache(10)

          yield* Cache.set(cache, "test", 42)
          const result = yield* Cache.get(cache, "test")

          assert.strictEqual(result, 42)
          assert.strictEqual(lookupCount(), 0)
        }))

      it.effect("overwrites existing key", () =>
        Effect.gen(function*() {
          const cache = yield* Cache.make<string, number>({
            capacity: 10,
            lookup: (key) => Effect.succeed(key.length)
          })

          yield* Cache.get(cache, "test")
          yield* Cache.set(cache, "test", 100)
          const result = yield* Cache.get(cache, "test")

          assert.strictEqual(result, 100)
        }))

      it.effect("set with TTL - value expires", () =>
        Effect.gen(function*() {
          const cache = yield* Cache.make<string, number>({
            capacity: 10,
            lookup: (key) => Effect.succeed(key.length),
            timeToLive: "1 hour"
          })

          yield* Cache.set(cache, "test", 42)
          assert.isTrue(yield* Cache.has(cache, "test"))

          yield* TestClock.adjust("2 hours")
          assert.isFalse(yield* Cache.has(cache, "test"))
        }))

      it.effect("set doesn't invoke lookup function", () =>
        Effect.gen(function*() {
          const { cache, lookupCount } = yield* makeTestCache(10)

          yield* Cache.set(cache, "test", 42)
          yield* Cache.set(cache, "test2", 43)
          yield* Cache.set(cache, "test3", 44)

          assert.strictEqual(lookupCount(), 0)
        }))

      it.effect("set enforces capacity", () =>
        Effect.gen(function*() {
          const cache = yield* Cache.make<string, number>({
            capacity: 2,
            lookup: (key) => Effect.succeed(key.length)
          })

          yield* Cache.set(cache, "a", 1)
          yield* Cache.set(cache, "b", 2)
          const sizeBefore = yield* Cache.size(cache)
          assert.strictEqual(sizeBefore, 2)

          yield* Cache.set(cache, "c", 3)
          const sizeAfter = yield* Cache.size(cache)
          assert.strictEqual(sizeAfter, 2)
        }))
    })

    describe("has", () => {
      it.effect("returns true for existing key", () =>
        Effect.gen(function*() {
          const cache = yield* Cache.make<string, number>({
            capacity: 10,
            lookup: (key) => Effect.succeed(key.length)
          })

          yield* Cache.get(cache, "test")
          const result = yield* Cache.has(cache, "test")

          assert.isTrue(result)
        }))

      it.effect("returns false for non-existent key", () =>
        Effect.gen(function*() {
          const cache = yield* Cache.make<string, number>({
            capacity: 10,
            lookup: (key) => Effect.succeed(key.length)
          })

          const result = yield* Cache.has(cache, "test")

          assert.isFalse(result)
        }))

      it.effect("returns false for expired key", () =>
        Effect.gen(function*() {
          const cache = yield* Cache.make<string, number>({
            capacity: 10,
            lookup: (key) => Effect.succeed(key.length),
            timeToLive: "1 hour"
          })

          yield* Cache.get(cache, "test")
          yield* TestClock.adjust("2 hours")
          const result = yield* Cache.has(cache, "test")

          assert.isFalse(result)
        }))
    })

    describe("invalidate", () => {
      it.effect("invalidates existing key", () =>
        Effect.gen(function*() {
          const cache = yield* Cache.make<string, number>({
            capacity: 10,
            lookup: (key) => Effect.succeed(key.length)
          })

          yield* Cache.get(cache, "test")
          yield* Cache.invalidate(cache, "test")
          const result = yield* Cache.has(cache, "test")

          assert.isFalse(result)
        }))

      it.effect("invalidating non-existent key doesn't error", () =>
        Effect.gen(function*() {
          const cache = yield* Cache.make<string, number>({
            capacity: 10,
            lookup: (key) => Effect.succeed(key.length)
          })

          yield* Cache.invalidate(cache, "test")
          const result = yield* Cache.has(cache, "test")

          assert.isFalse(result)
        }))

      it.effect("get after invalidate invokes lookup again", () =>
        Effect.gen(function*() {
          let counter = 0
          const cache = yield* Cache.make<string, number>({
            capacity: 10,
            lookup: (_key) => Effect.sync(() => ++counter)
          })

          const result1 = yield* Cache.get(cache, "test")
          yield* Cache.invalidate(cache, "test")
          const result2 = yield* Cache.get(cache, "test")

          assert.strictEqual(result1, 1)
          assert.strictEqual(result2, 2)
        }))
    })

    describe("invalidateWhen", () => {
      it.effect.each([Exit.succeed(1), Exit.fail("error")])(
        "preserves a newer set value after an old lookup completes (%#)",
        (exit) =>
          Effect.gen(function*() {
            const gate = yield* Deferred.make<number, string>()
            const values: Array<number> = []
            const cache = yield* Cache.make<string, number, string>({
              capacity: 1,
              lookup: () => Deferred.await(gate)
            })
            const lookup = yield* Cache.get(cache, "key").pipe(
              Effect.exit,
              Effect.forkChild({ startImmediately: true })
            )
            const invalidator = yield* Cache.invalidateWhen(cache, "key", (value) => {
              values.push(value)
              return value === 1
            }).pipe(
              Effect.forkChild({ startImmediately: true })
            )

            yield* Cache.set(cache, "key", 99)
            yield* Deferred.done(gate, exit)
            const original = yield* Fiber.join(lookup)
            const invalidated = yield* Fiber.join(invalidator)

            assert.deepStrictEqual(original, exit)
            assert.deepStrictEqual(values, Exit.isSuccess(exit) ? [1] : [])
            assert.isFalse(invalidated)
            assert.deepStrictEqual(yield* Cache.getSuccess(cache, "key"), Option.some(99))
          })
      )

      it.effect("invalidates when predicate matches", () =>
        Effect.gen(function*() {
          const cache = yield* Cache.make<string, number>({
            capacity: 10,
            lookup: (key) => Effect.succeed(key.length)
          })

          yield* Cache.get(cache, "test")
          const result = yield* Cache.invalidateWhen(cache, "test", (value) => value === 4)

          assert.isTrue(result)
          assert.isFalse(yield* Cache.has(cache, "test"))
        }))

      it.effect("doesn't invalidate when predicate doesn't match", () =>
        Effect.gen(function*() {
          const cache = yield* Cache.make<string, number>({
            capacity: 10,
            lookup: (key) => Effect.succeed(key.length)
          })

          yield* Cache.get(cache, "test")
          const result = yield* Cache.invalidateWhen(cache, "test", (value) => value === 5)

          assert.isFalse(result)
          assert.isTrue(yield* Cache.has(cache, "test"))
        }))

      it.effect("returns false for non-existent key", () =>
        Effect.gen(function*() {
          const cache = yield* Cache.make<string, number>({
            capacity: 10,
            lookup: (key) => Effect.succeed(key.length)
          })

          const result = yield* Cache.invalidateWhen(cache, "test", () => true)

          assert.isFalse(result)
        }))

      it.effect("returns false for failed cached value", () =>
        Effect.gen(function*() {
          const cache = yield* Cache.make<string, number, string>({
            capacity: 10,
            lookup: (_key) => Effect.fail("error")
          })

          yield* Effect.exit(Cache.get(cache, "test"))
          const result = yield* Cache.invalidateWhen(cache, "test", () => true)

          assert.isFalse(result)
        }))
    })

    describe("refresh", () => {
      it.effect("refresh existing key invokes lookup again", () =>
        Effect.gen(function*() {
          let counter = 0
          const cache = yield* Cache.make<string, number>({
            capacity: 10,
            lookup: (_key) => Effect.sync(() => ++counter)
          })

          yield* Cache.get(cache, "test")
          const result = yield* Cache.refresh(cache, "test")

          assert.strictEqual(result, 2)
        }))

      it.effect("refresh non-existent key invokes lookup and enforces capacity", () =>
        Effect.gen(function*() {
          let counter = 0
          const cache = yield* Cache.make<string, number>({
            capacity: 1,
            lookup: (_key) => Effect.sync(() => ++counter)
          })

          yield* Cache.set(cache, "other", 99)
          const result = yield* Cache.refresh(cache, "test")

          assert.strictEqual(result, 1)
          assert.strictEqual(yield* Cache.size(cache), 1)
          assert.deepStrictEqual(Array.from(yield* Cache.keys(cache)), ["test"])
        }))

      it.effect("refresh enforces capacity when the existing key is evicted during lookup", () =>
        Effect.gen(function*() {
          const started = yield* Deferred.make<void>()
          const result = yield* Deferred.make<number>()
          const cache = yield* Cache.make<string, number>({
            capacity: 1,
            lookup: () => Deferred.succeed(started, void 0).pipe(Effect.andThen(Deferred.await(result)))
          })

          yield* Cache.set(cache, "a", 1)
          const refresh = yield* Cache.refresh(cache, "a").pipe(Effect.forkChild({ startImmediately: true }))
          yield* Deferred.await(started)
          yield* Cache.set(cache, "b", 99)
          assert.isFalse(yield* Cache.has(cache, "a"))

          yield* Deferred.succeed(result, 2)
          assert.strictEqual(yield* Fiber.join(refresh), 2)
          assert.deepStrictEqual({
            size: yield* Cache.size(cache),
            keys: Array.from(yield* Cache.keys(cache)).sort()
          }, { size: 1, keys: ["a"] })
          assert.deepStrictEqual(yield* Cache.getSuccess(cache, "a"), Option.some(2))
        }))

      it.effect("repro: interrupting a missing-key refresh does not remove a newer set value", () =>
        Effect.gen(function*() {
          const lookupStarted = yield* Latch.make()
          const cache = yield* Cache.make<string, number>({
            capacity: 1,
            lookup: () => lookupStarted.open.pipe(Effect.andThen(Effect.never))
          })

          const refresh = yield* Cache.refresh(cache, "key").pipe(Effect.forkChild({ startImmediately: true }))
          yield* lookupStarted.await
          yield* Cache.set(cache, "key", 99)
          assert.deepStrictEqual(yield* Cache.getSuccess(cache, "key"), Option.some(99))

          yield* Fiber.interrupt(refresh)

          assert.deepStrictEqual(yield* Cache.getSuccess(cache, "key"), Option.some(99))
        }))

      it.effect("interrupting a missing-key refresh removes its pending entry", () =>
        Effect.gen(function*() {
          const lookupStarted = yield* Latch.make()
          const cache = yield* Cache.make<string, number>({
            capacity: 1,
            lookup: () => lookupStarted.open.pipe(Effect.andThen(Effect.never))
          })

          const refresh = yield* Cache.refresh(cache, "key").pipe(Effect.forkChild({ startImmediately: true }))
          yield* lookupStarted.await
          assert.isTrue(yield* Cache.has(cache, "key"))

          yield* Fiber.interrupt(refresh)

          assert.isFalse(yield* Cache.has(cache, "key"))
        }))

      it.effect.each([false, true])(
        "zero-TTL refresh with replacement (existing: %s)",
        (existing) =>
          Effect.gen(function*() {
            const gate = yield* Deferred.make<number, string>()
            const cache = yield* Cache.makeWith((_key: string) => Deferred.await(gate), {
              capacity: 1,
              timeToLive: (exit) => Exit.isFailure(exit) ? 0 : "1 hour"
            })
            if (existing) yield* Cache.set(cache, "key", 1)

            const refresh = yield* Cache.refresh(cache, "key").pipe(Effect.forkChild({ startImmediately: true }))
            yield* Cache.set(cache, "key", 99)
            yield* Deferred.fail(gate, "error")

            assert.deepStrictEqual(yield* Fiber.await(refresh), Exit.fail("error"))
            assert.deepStrictEqual(
              yield* Cache.getSuccess(cache, "key"),
              existing ? Option.none() : Option.some(99)
            )
          })
      )

      it.effect("zero-TTL refresh removes its own entry", () =>
        Effect.gen(function*() {
          const cache = yield* Cache.makeWith((_key: string) => Effect.fail("error"), {
            capacity: 1,
            timeToLive: () => 0
          })

          assert.deepStrictEqual(yield* Effect.exit(Cache.refresh(cache, "key")), Exit.fail("error"))
          assert.isFalse(yield* Cache.has(cache, "key"))
        }))

      it.effect("refresh updates TTL", () =>
        Effect.gen(function*() {
          const cache = yield* Cache.make<string, number>({
            capacity: 10,
            lookup: (key) => Effect.succeed(key.length),
            timeToLive: "1 hour"
          })

          yield* Cache.get(cache, "test")
          yield* TestClock.adjust("30 minutes")
          yield* Cache.refresh(cache, "test")
          yield* TestClock.adjust("40 minutes")

          assert.isTrue(yield* Cache.has(cache, "test"))
        }))

      it.effect("concurrent refresh calls each invoke lookup independently", () =>
        Effect.gen(function*() {
          let lookupCount = 0
          const cache = yield* Cache.make<string, number>({
            capacity: 10,
            lookup: () => Effect.sync(() => ++lookupCount)
          })

          yield* Cache.get(cache, "test")
          lookupCount = 0

          const results = yield* Effect.all([
            Cache.refresh(cache, "test"),
            Cache.refresh(cache, "test"),
            Cache.refresh(cache, "test")
          ], { concurrency: "unbounded" })

          // Each refresh calls lookup independently
          assert.strictEqual(lookupCount, 3)
          assert.deepStrictEqual(results, [1, 2, 3])
        }))
    })

    describe("invalidateAll", () => {
      it.effect("clears all entries", () =>
        Effect.gen(function*() {
          const cache = yield* Cache.make<string, number>({
            capacity: 10,
            lookup: (key) => Effect.succeed(key.length)
          })

          yield* Cache.get(cache, "a")
          yield* Cache.get(cache, "b")
          yield* Cache.get(cache, "c")

          yield* Cache.invalidateAll(cache)

          assert.isFalse(yield* Cache.has(cache, "a"))
          assert.isFalse(yield* Cache.has(cache, "b"))
          assert.isFalse(yield* Cache.has(cache, "c"))
        }))

      it.effect("size becomes 0 after invalidateAll", () =>
        Effect.gen(function*() {
          const cache = yield* Cache.make<string, number>({
            capacity: 10,
            lookup: (key) => Effect.succeed(key.length)
          })

          yield* Cache.get(cache, "a")
          yield* Cache.get(cache, "b")
          yield* Cache.get(cache, "c")

          yield* Cache.invalidateAll(cache)
          const size = yield* Cache.size(cache)

          assert.strictEqual(size, 0)
        }))

      it.effect("all keys return None after invalidateAll", () =>
        Effect.gen(function*() {
          const cache = yield* Cache.make<string, number>({
            capacity: 10,
            lookup: (key) => Effect.succeed(key.length)
          })

          yield* Cache.get(cache, "a")
          yield* Cache.get(cache, "b")

          yield* Cache.invalidateAll(cache)

          const result1 = yield* Cache.getOption(cache, "a")
          const result2 = yield* Cache.getOption(cache, "b")

          assert.deepStrictEqual(result1, Option.none())
          assert.deepStrictEqual(result2, Option.none())
        }))
    })
  })

  describe("utility operations", () => {
    describe("size", () => {
      it.effect("empty cache returns 0", () =>
        Effect.gen(function*() {
          const cache = yield* Cache.make<string, number>({
            capacity: 10,
            lookup: (key) => Effect.succeed(key.length)
          })

          const size = yield* Cache.size(cache)

          assert.strictEqual(size, 0)
        }))

      it.effect("returns correct count after adding entries", () =>
        Effect.gen(function*() {
          const cache = yield* Cache.make<string, number>({
            capacity: 10,
            lookup: (key) => Effect.succeed(key.length)
          })

          yield* Cache.get(cache, "a")
          yield* Cache.get(cache, "b")
          yield* Cache.get(cache, "c")

          const size = yield* Cache.size(cache)

          assert.strictEqual(size, 3)
        }))

      it.effect("decreases after invalidation", () =>
        Effect.gen(function*() {
          const cache = yield* Cache.make<string, number>({
            capacity: 10,
            lookup: (key) => Effect.succeed(key.length)
          })

          yield* Cache.get(cache, "a")
          yield* Cache.get(cache, "b")
          yield* Cache.get(cache, "c")
          yield* Cache.invalidate(cache, "b")

          const size = yield* Cache.size(cache)

          assert.strictEqual(size, 2)
        }))

      it.effect("expired entries are counted until accessed", () =>
        Effect.gen(function*() {
          const cache = yield* Cache.make<string, number>({
            capacity: 10,
            lookup: (key) => Effect.succeed(key.length),
            timeToLive: "1 hour"
          })

          yield* Cache.get(cache, "a")
          yield* Cache.get(cache, "b")

          yield* TestClock.adjust("2 hours")

          // Size still includes expired entries
          const sizeBefore = yield* Cache.size(cache)
          assert.strictEqual(sizeBefore, 2)

          // Accessing expired entries removes them
          yield* Cache.has(cache, "a")
          const sizeAfter = yield* Cache.size(cache)
          assert.strictEqual(sizeAfter, 1)
        }))
    })

    describe("keys", () => {
      it.effect("returns all active keys", () =>
        Effect.gen(function*() {
          const cache = yield* Cache.make<string, number>({
            capacity: 10,
            lookup: (key) => Effect.succeed(key.length)
          })

          yield* Cache.get(cache, "a")
          yield* Cache.get(cache, "b")
          yield* Cache.get(cache, "c")

          const keys = yield* Cache.keys(cache)

          assert.deepStrictEqual(Array.from(keys).sort(), ["a", "b", "c"])
        }))

      it.effect("excludes keys for expired entries", () =>
        Effect.gen(function*() {
          const cache = yield* Cache.make<string, number>({
            capacity: 10,
            lookup: (key) => Effect.succeed(key.length),
            timeToLive: "1 hour"
          })

          yield* Cache.get(cache, "a")
          yield* Cache.get(cache, "b")

          yield* TestClock.adjust("2 hours")

          const keys = yield* Cache.keys(cache)

          assert.deepStrictEqual(Array.from(keys).sort(), [])
        }))

      it.effect("empty after invalidateAll", () =>
        Effect.gen(function*() {
          const cache = yield* Cache.make<string, number>({
            capacity: 10,
            lookup: (key) => Effect.succeed(key.length)
          })

          yield* Cache.get(cache, "a")
          yield* Cache.get(cache, "b")
          yield* Cache.invalidateAll(cache)

          const keys = yield* Cache.keys(cache)

          assert.deepStrictEqual(Array.from(keys), [])
        }))
    })

    describe("values", () => {
      it.effect("returns all successful cached values", () =>
        Effect.gen(function*() {
          const cache = yield* Cache.make<string, number>({
            capacity: 10,
            lookup: (key) => Effect.succeed(key.length),
            timeToLive: "1 hour"
          })

          yield* Cache.get(cache, "a")
          yield* Cache.get(cache, "ab")
          yield* Cache.get(cache, "abc")

          const values = yield* Cache.values(cache)
          const valuesArray = Array.from(values).sort()

          assert.deepStrictEqual(valuesArray, [1, 2, 3])
        }))

      it.effect("doesn't include failed lookups", () =>
        Effect.gen(function*() {
          const cache = yield* Cache.make<string, number, string>({
            capacity: 10,
            lookup: (key) => key === "fail" ? Effect.fail("error") : Effect.succeed(key.length),
            timeToLive: "1 hour"
          })

          yield* Cache.get(cache, "a")
          yield* Effect.exit(Cache.get(cache, "fail"))
          yield* Cache.get(cache, "ab")

          const values = yield* Cache.values(cache)
          const valuesArray = Array.from(values).sort()

          assert.deepStrictEqual(valuesArray, [1, 2])
        }))

      it.effect("doesn't include expired values", () =>
        Effect.gen(function*() {
          const cache = yield* Cache.make<string, number>({
            capacity: 10,
            lookup: (key) => Effect.succeed(key.length),
            timeToLive: "1 hour"
          })

          yield* Cache.get(cache, "a")
          yield* Cache.get(cache, "b")

          yield* TestClock.adjust("2 hours")

          const values = yield* Cache.values(cache)
          const valuesArray = Array.from(values)

          assert.deepStrictEqual(valuesArray, [])
        }))
    })

    describe("entries", () => {
      it.effect("returns all key-value pairs", () =>
        Effect.gen(function*() {
          const cache = yield* Cache.make<string, number>({
            capacity: 10,
            lookup: (key) => Effect.succeed(key.length),
            timeToLive: "1 hour"
          })

          yield* Cache.get(cache, "a")
          yield* Cache.get(cache, "ab")
          yield* Cache.get(cache, "abc")

          const entries = yield* Cache.entries(cache)
          const entriesArray = Array.from(entries).sort(([a], [b]) => a.localeCompare(b))

          assert.deepStrictEqual(entriesArray, [["a", 1], ["ab", 2], ["abc", 3]])
        }))

      it.effect("filters out failed lookups", () =>
        Effect.gen(function*() {
          const cache = yield* Cache.make<string, number, string>({
            capacity: 10,
            lookup: (key) => key === "fail" ? Effect.fail("error") : Effect.succeed(key.length),
            timeToLive: "1 hour"
          })

          yield* Cache.get(cache, "a")
          yield* Effect.exit(Cache.get(cache, "fail"))
          yield* Cache.get(cache, "ab")

          const entries = yield* Cache.entries(cache)
          const entriesArray = Array.from(entries).sort(([a], [b]) => a.localeCompare(b))

          assert.deepStrictEqual(entriesArray, [["a", 1], ["ab", 2]])
        }))

      it.effect("filters out expired entries", () =>
        Effect.gen(function*() {
          const cache = yield* Cache.make<string, number>({
            capacity: 10,
            lookup: (key) => Effect.succeed(key.length),
            timeToLive: "1 hour"
          })

          yield* Cache.get(cache, "a")
          yield* Cache.get(cache, "b")

          yield* TestClock.adjust("2 hours")

          const entries = yield* Cache.entries(cache)
          const entriesArray = Array.from(entries)

          assert.deepStrictEqual(entriesArray, [])
        }))

      it.effect("removes expired entries as side effect", () =>
        Effect.gen(function*() {
          const cache = yield* Cache.make<string, number>({
            capacity: 10,
            lookup: (key) => Effect.succeed(key.length),
            timeToLive: "1 hour"
          })

          yield* Cache.get(cache, "a")
          yield* Cache.get(cache, "b")

          yield* TestClock.adjust("2 hours")

          const sizeBefore = yield* Cache.size(cache)
          assert.strictEqual(sizeBefore, 2)

          const entriesResult = yield* Cache.entries(cache)
          const entriesArray = Array.from(entriesResult)

          const sizeAfter = yield* Cache.size(cache)

          // entries() should remove expired entries as side effect
          assert.strictEqual(sizeAfter, 0)
          assert.strictEqual(entriesArray.length, 0)
        }))
    })
  })

  describe("capacity management", () => {
    it.effect("LRU eviction - oldest entries removed when capacity exceeded", () =>
      Effect.gen(function*() {
        const cache = yield* Cache.make<string, number>({
          capacity: 3,
          lookup: (key) => Effect.succeed(key.length)
        })

        yield* Cache.get(cache, "a")
        yield* Cache.get(cache, "b")
        yield* Cache.get(cache, "c")
        yield* Cache.get(cache, "d")

        assert.isFalse(yield* Cache.has(cache, "a"))
        assert.isTrue(yield* Cache.has(cache, "b"))
        assert.isTrue(yield* Cache.has(cache, "c"))
        assert.isTrue(yield* Cache.has(cache, "d"))
      }))

    it.effect("LRU eviction - access order determines eviction", () =>
      Effect.gen(function*() {
        const cache = yield* Cache.make<string, number>({
          capacity: 3,
          lookup: (key) => Effect.succeed(key.length)
        })

        yield* Cache.get(cache, "a")
        yield* Cache.get(cache, "b")
        yield* Cache.get(cache, "c")

        yield* Cache.get(cache, "a")

        yield* Cache.get(cache, "d")

        assert.isTrue(yield* Cache.has(cache, "a"))
        assert.isFalse(yield* Cache.has(cache, "b"))
        assert.isTrue(yield* Cache.has(cache, "c"))
        assert.isTrue(yield* Cache.has(cache, "d"))
      }))

    it.effect("capacity of 1", () =>
      Effect.gen(function*() {
        const cache = yield* Cache.make<string, number>({
          capacity: 1,
          lookup: (key) => Effect.succeed(key.length)
        })

        yield* Cache.get(cache, "a")
        assert.isTrue(yield* Cache.has(cache, "a"))

        yield* Cache.get(cache, "b")
        assert.isFalse(yield* Cache.has(cache, "a"))
        assert.isTrue(yield* Cache.has(cache, "b"))
      }))

    it.effect("very large capacity", () =>
      Effect.gen(function*() {
        const cache = yield* Cache.make<string, number>({
          capacity: 10000,
          lookup: (key) => Effect.succeed(key.length)
        })

        // Add many entries
        for (let i = 0; i < 100; i++) {
          yield* Cache.get(cache, `key${i}`)
        }

        const size = yield* Cache.size(cache)
        assert.strictEqual(size, 100)
        assert.isTrue(yield* Cache.has(cache, "key0"))
        assert.isTrue(yield* Cache.has(cache, "key99"))
      }))
  })

  describe("TTL (Time To Live) testing", () => {
    it.effect("fixed TTL - entry expires after specified duration", () =>
      Effect.gen(function*() {
        const cache = yield* Cache.make<string, number>({
          capacity: 10,
          lookup: (key) => Effect.succeed(key.length),
          timeToLive: "1 hour"
        })

        yield* Cache.get(cache, "test")
        yield* TestClock.adjust("59 minutes")
        assert.isTrue(yield* Cache.has(cache, "test"))

        yield* TestClock.adjust("2 minutes")
        assert.isFalse(yield* Cache.has(cache, "test"))
      }))

    it.effect("fixed TTL - get after expiration invokes lookup", () =>
      Effect.gen(function*() {
        let counter = 0
        const cache = yield* Cache.make<string, number>({
          capacity: 10,
          lookup: (_key) => Effect.sync(() => ++counter),
          timeToLive: "1 hour"
        })

        const result1 = yield* Cache.get(cache, "test")
        yield* TestClock.adjust("2 hours")
        const result2 = yield* Cache.get(cache, "test")

        assert.strictEqual(result1, 1)
        assert.strictEqual(result2, 2)
      }))

    it.effect("fixed TTL - has returns false for expired entries", () =>
      Effect.gen(function*() {
        const cache = yield* Cache.make<string, number>({
          capacity: 10,
          lookup: (key) => Effect.succeed(key.length),
          timeToLive: "30 minutes"
        })

        yield* Cache.get(cache, "test")
        assert.isTrue(yield* Cache.has(cache, "test"))

        yield* TestClock.adjust("31 minutes")
        assert.isFalse(yield* Cache.has(cache, "test"))
      }))

    it.effect("function-based TTL - different TTL for success vs failure", () =>
      Effect.gen(function*() {
        const cache = yield* Cache.makeWith<string, number, string>(
          (key) => key === "fail" ? Effect.fail("error") : Effect.succeed(key.length),
          {
            capacity: 10,
            timeToLive: (exit) => Exit.isSuccess(exit) ? "1 hour" : "1 minute"
          }
        )

        yield* Cache.get(cache, "success")
        yield* Effect.exit(Cache.get(cache, "fail"))

        yield* TestClock.adjust("30 minutes")
        assert.isTrue(yield* Cache.has(cache, "success"))
        assert.isFalse(yield* Cache.has(cache, "fail"))
      }))

    it.effect("function-based TTL - TTL based on key", () =>
      Effect.gen(function*() {
        const cache = yield* Cache.makeWith<string, number, never>((key) => Effect.succeed(key.length), {
          capacity: 10,
          timeToLive: (_exit, key) => key === "short" ? "1 minute" : "1 hour"
        })

        yield* Cache.get(cache, "short")
        yield* Cache.get(cache, "long")

        yield* TestClock.adjust("30 minutes")
        assert.isFalse(yield* Cache.has(cache, "short"))
        assert.isTrue(yield* Cache.has(cache, "long"))
      }))

    it.effect("function-based TTL - TTL based on value", () =>
      Effect.gen(function*() {
        const cache = yield* Cache.makeWith<string, number, never>((key) => Effect.succeed(key.length), {
          capacity: 10,
          timeToLive: (exit) => {
            const value = Exit.isSuccess(exit) ? exit.value : 0
            return value > 3 ? "1 hour" : "1 minute"
          }
        })

        yield* Cache.get(cache, "ab")
        yield* Cache.get(cache, "abcd")

        yield* TestClock.adjust("30 minutes")
        assert.isFalse(yield* Cache.has(cache, "ab"))
        assert.isTrue(yield* Cache.has(cache, "abcd"))
      }))

    it.effect("infinite TTL", () =>
      Effect.gen(function*() {
        const cache = yield* Cache.makeWith<string, number, never>((key) => Effect.succeed(key.length), {
          capacity: 10,
          timeToLive: () => Duration.infinity
        })

        yield* Cache.get(cache, "test")
        yield* TestClock.adjust(Duration.hours(1000))
        assert.isTrue(yield* Cache.has(cache, "test"))
      }))

    it.effect("zero duration TTL", () =>
      Effect.gen(function*() {
        const cache = yield* Cache.make<string, number>({
          capacity: 10,
          lookup: (key) => Effect.succeed(key.length),
          timeToLive: Duration.zero
        })

        yield* Cache.get(cache, "test")
        // Entry should expire immediately
        assert.isFalse(yield* Cache.has(cache, "test"))
      }))

    it.effect("TTL updates on refresh", () =>
      Effect.gen(function*() {
        const cache = yield* Cache.make<string, number>({
          capacity: 10,
          lookup: (key) => Effect.succeed(key.length),
          timeToLive: "1 hour"
        })

        yield* Cache.get(cache, "test")
        yield* TestClock.adjust("45 minutes")

        // Refresh resets TTL
        yield* Cache.refresh(cache, "test")
        yield* TestClock.adjust("30 minutes")

        // Should still be present (45 + 30 = 75 minutes, but refresh reset TTL)
        assert.isTrue(yield* Cache.has(cache, "test"))

        yield* TestClock.adjust("31 minutes")
        // Now it should be expired (30 + 31 = 61 minutes after refresh)
        assert.isFalse(yield* Cache.has(cache, "test"))
      }))
  })

  describe("error scenarios", () => {
    it.effect("failed lookup caches the failure", () =>
      Effect.gen(function*() {
        const cache = yield* Cache.make<string, number, string>({
          capacity: 10,
          lookup: (_key) => Effect.fail("lookup error")
        })

        const result1 = yield* Effect.exit(Cache.get(cache, "test"))
        const result2 = yield* Effect.exit(Cache.get(cache, "test"))

        assert.isTrue(Exit.isFailure(result1))
        assert.isTrue(Exit.isFailure(result2))
        assert.deepStrictEqual(result1, result2)
      }))

    it.effect("subsequent gets return same failure", () =>
      Effect.gen(function*() {
        let lookupCount = 0
        const cache = yield* Cache.make<string, number, string>({
          capacity: 10,
          lookup: (_key) => Effect.sync(() => lookupCount++).pipe(Effect.flatMap(() => Effect.fail("error")))
        })

        yield* Effect.exit(Cache.get(cache, "test"))
        yield* Effect.exit(Cache.get(cache, "test"))
        yield* Effect.exit(Cache.get(cache, "test"))

        assert.strictEqual(lookupCount, 1)
      }))

    it.effect("can refresh after failure", () =>
      Effect.gen(function*() {
        let shouldFail = true
        const cache = yield* Cache.make<string, number, string>({
          capacity: 10,
          lookup: (_key) => shouldFail ? Effect.fail("error") : Effect.succeed(42)
        })

        const result1 = yield* Effect.exit(Cache.get(cache, "test"))
        assert.isTrue(Exit.isFailure(result1))

        shouldFail = false
        const result2 = yield* Cache.refresh(cache, "test")
        assert.strictEqual(result2, 42)
      }))

    it.effect("multiple fibers encountering same error", () =>
      Effect.gen(function*() {
        let lookupCount = 0
        const cache = yield* Cache.make<string, number, string>({
          capacity: 10,
          lookup: () =>
            Effect.delay("100 millis")(
              Effect.sync(() => ++lookupCount).pipe(Effect.flatMap(() => Effect.fail("error")))
            )
        })

        const fiber = yield* Effect.all(
          [
            Effect.exit(Cache.get(cache, "key")),
            Effect.exit(Cache.get(cache, "key")),
            Effect.exit(Cache.get(cache, "key"))
          ],
          { concurrency: "unbounded" }
        ).pipe(Effect.forkChild)

        yield* TestClock.adjust("150 millis")
        const results = yield* Fiber.join(fiber)

        assert.strictEqual(lookupCount, 1)
        assert.isTrue(results.every(Exit.isFailure))
        assert.deepStrictEqual(results[0], results[1])
        assert.deepStrictEqual(results[1], results[2])
      }))
  })

  describe("integration tests", () => {
    it.effect("with TestClock - multiple time advances", () =>
      Effect.gen(function*() {
        const cache = yield* Cache.make<string, number>({
          capacity: 10,
          lookup: (key) => Effect.succeed(key.length),
          timeToLive: "1 hour"
        })

        yield* Cache.get(cache, "a")
        yield* TestClock.adjust("30 minutes")

        yield* Cache.get(cache, "b")
        yield* TestClock.adjust("30 minutes")

        yield* Cache.get(cache, "c")
        yield* TestClock.adjust("30 minutes")

        assert.isFalse(yield* Cache.has(cache, "a")) // Expired at 60 min, now at 90 min
        assert.isFalse(yield* Cache.has(cache, "b")) // Expired at 90 min, now at 90 min
        assert.isTrue(yield* Cache.has(cache, "c")) // Expires at 120 min, now at 90 min
      }))

    it.effect("with TestClock - set specific time", () =>
      Effect.gen(function*() {
        const cache = yield* Cache.make<string, number>({
          capacity: 10,
          lookup: (key) => Effect.succeed(key.length),
          timeToLive: Duration.millis(1000)
        })

        yield* Cache.get(cache, "test")
        yield* TestClock.setTime(500)
        assert.isTrue(yield* Cache.has(cache, "test"))

        yield* TestClock.setTime(1500)
        assert.isFalse(yield* Cache.has(cache, "test"))
      }))

    it.effect("with different key types - string keys", () =>
      Effect.gen(function*() {
        const cache = yield* Cache.make<string, number>({
          capacity: 10,
          lookup: (key) => Effect.succeed(key.length)
        })

        yield* Cache.get(cache, "hello")
        yield* Cache.get(cache, "world")

        assert.strictEqual(yield* Cache.get(cache, "hello"), 5)
        assert.strictEqual(yield* Cache.get(cache, "world"), 5)
      }))

    it.effect("with different key types - number keys", () =>
      Effect.gen(function*() {
        const cache = yield* Cache.make<number, string>({
          capacity: 10,
          lookup: (key) => Effect.succeed(`number: ${key}`)
        })

        yield* Cache.get(cache, 1)
        yield* Cache.get(cache, 2)
        yield* Cache.get(cache, 3)

        assert.strictEqual(yield* Cache.get(cache, 1), "number: 1")
        assert.strictEqual(yield* Cache.get(cache, 2), "number: 2")
        assert.strictEqual(yield* Cache.get(cache, 3), "number: 3")
      }))

    it.effect("with different key types - complex object keys", () =>
      Effect.gen(function*() {
        class CacheKey extends Data.Class<{ id: number; name: string }> {}

        const cache = yield* Cache.make<CacheKey, string>({
          capacity: 10,
          lookup: (key) => Effect.succeed(`${key.name}-${key.id}`)
        })

        const key1 = new CacheKey({ id: 1, name: "test" })
        const key2 = new CacheKey({ id: 2, name: "test" })
        const key3 = new CacheKey({ id: 1, name: "test" }) // Same as key1

        yield* Cache.get(cache, key1)
        yield* Cache.get(cache, key2)

        assert.strictEqual(yield* Cache.get(cache, key1), "test-1")
        assert.strictEqual(yield* Cache.get(cache, key2), "test-2")
        assert.strictEqual(yield* Cache.get(cache, key3), "test-1") // Uses cached value
      }))
  })
})

describe("PersistedCache", () => {
  it.effect("persists synchronous lookup defects", () =>
    Effect.gen(function*() {
      class LookupRequest extends Persistable.Class()("LookupRequest", {
        primaryKey: () => "lookup"
      }) {}

      let calls = 0
      const lookup = (_key: LookupRequest): Effect.Effect<void> => {
        calls++
        throw new Error("lookup defect")
      }
      const options = { storeId: "synchronous-lookup-defect", timeToLive: () => "1 hour" as const }
      const key = new LookupRequest()

      const cache = yield* PersistedCache.make(lookup, options)
      yield* Effect.exit(cache.get(key))
      const recreated = yield* PersistedCache.make(lookup, options)
      yield* Effect.exit(recreated.get(key))

      assert.strictEqual(calls, 1)
    }).pipe(Effect.provide(Persistence.layerMemory)))
})

const makeTestCache = (capacity: number, ttl?: Duration.Input) =>
  Effect.gen(function*() {
    let lookupCount = 0
    const lookupResults = new Map<string, Effect.Effect<number, string>>()

    const cache = yield* Cache.make<string, number, string>({
      capacity,
      lookup: (key) => {
        lookupCount++
        return lookupResults.get(key) ?? Effect.fail(`Key not found: ${key}`)
      },
      timeToLive: ttl
    })

    return {
      cache,
      lookupCount: () => lookupCount,
      resetLookupCount: () => {
        lookupCount = 0
      },
      setLookupResult: (key: string, result: Effect.Effect<number, string>) => {
        lookupResults.set(key, result)
      }
    }
  })
