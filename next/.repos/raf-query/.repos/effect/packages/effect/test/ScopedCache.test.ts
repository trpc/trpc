import { assert, describe, it } from "@effect/vitest"
import {
  Cause,
  Clock,
  Context,
  Data,
  Deferred,
  Duration,
  Effect,
  Exit,
  Fiber,
  Latch,
  Option,
  Scope,
  ScopedCache
} from "effect"
import { TestClock } from "effect/testing"
import { collectGarbage } from "./utils/gc.ts"

describe("ScopedCache", () => {
  it.effect.skipIf(process.versions.bun !== undefined || process.versions.deno !== undefined)(
    "does not retain prior equal object keys on cache hits",
    () =>
      Effect.gen(function*() {
        const references: Array<WeakRef<object>> = []
        const control = new WeakRef({})
        let lookups = 0
        const cache = yield* ScopedCache.make({
          capacity: 16,
          lookup: (_key: { readonly region: string }) => Effect.sync(() => ++lookups)
        })
        for (let i = 0; i < 10; i++) {
          const key = { region: "us-east-1" }
          references.push(new WeakRef(key))
          assert.strictEqual(yield* Effect.scoped(ScopedCache.get(cache, key)), 1)
        }
        assert.strictEqual(lookups, 1)
        assert.strictEqual(yield* ScopedCache.size(cache), 1)
        // The last key may still be held by the cache.
        references.pop()
        yield* collectGarbage
        assert.isUndefined(control.deref())
        for (const reference of references) assert.isUndefined(reference.deref())
        assert.strictEqual(yield* ScopedCache.size(cache), 1)
      })
  )

  describe("constructors", () => {
    describe("make", () => {
      it.effect("creates cache with fixed capacity", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.length)
          })

          assert.strictEqual(cache.capacity, 10)
        }))

      it.effect("creates cache with default infinite TTL", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.length)
          })

          // Add value and verify it doesn't expire
          yield* ScopedCache.get(cache, "test")
          yield* TestClock.adjust(Duration.hours(1000))
          assert.isTrue(yield* ScopedCache.has(cache, "test"))
        }))

      it.effect("creates cache with custom TTL", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.length),
            timeToLive: "1 hour"
          })

          yield* ScopedCache.get(cache, "test")
          yield* TestClock.adjust("30 minutes")
          assert.isTrue(yield* ScopedCache.has(cache, "test"))

          yield* TestClock.adjust("31 minutes")
          assert.isFalse(yield* ScopedCache.has(cache, "test"))
        }))

      it.effect("uses a numeric zero TTL", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.length),
            timeToLive: 0
          })

          yield* ScopedCache.get(cache, "test")

          assert.isFalse(yield* ScopedCache.has(cache, "test"))
        }))

      it.effect("lookup function context is preserved", () =>
        Effect.gen(function*() {
          class TestService extends Context.Service<TestService, { value: number }>()("TestService") {}

          const program = Effect.gen(function*() {
            const cache = yield* ScopedCache.make({
              capacity: 10,
              lookup: (_key: string) => Effect.map(TestService, (service) => service.value)
            })
            return yield* ScopedCache.get(cache, "test")
          })

          const result = yield* Effect.scoped(
            program.pipe(
              Effect.provideService(TestService, TestService.of({ value: 42 }))
            )
          )

          assert.strictEqual(result, 42)
        }))

      it.effect("cache resources are released and future gets interrupt when scope closes", () =>
        Effect.gen(function*() {
          const cache = yield* Effect.scoped(
            Effect.gen(function*() {
              const cache = yield* ScopedCache.make({
                capacity: 10,
                lookup: (key: string) => Effect.succeed(key.length)
              })
              yield* ScopedCache.get(cache, "test")
              return cache
            })
          )

          assert.strictEqual(cache.state._tag, "Closed")
          assert.isTrue(Exit.hasInterrupts(yield* Effect.exit(ScopedCache.get(cache, "test"))))
        }))
    })

    describe("makeWith", () => {
      it.effect("creates cache with function-based TTL", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.makeWith({
            capacity: 10,
            lookup: (key: string) => key === "fail" ? Effect.fail("error") : Effect.succeed(key.length),
            timeToLive: (exit, key) => {
              if (Exit.isFailure(exit)) return "1 second"
              return key === "short" ? "1 minute" : "1 hour"
            }
          })

          // Success with long TTL
          yield* ScopedCache.get(cache, "long")
          yield* TestClock.adjust("30 minutes")
          assert.isTrue(yield* ScopedCache.has(cache, "long"))

          // Success with short TTL
          yield* ScopedCache.get(cache, "short")
          assert.isTrue(yield* ScopedCache.has(cache, "short"))
          yield* TestClock.adjust(Duration.sum(Duration.minutes(1), Duration.seconds(1)))
          assert.isFalse(yield* ScopedCache.has(cache, "short"))
          assert.isTrue(yield* ScopedCache.has(cache, "long"))

          // Failure with very short TTL
          yield* Effect.exit(ScopedCache.get(cache, "fail"))
          assert.isTrue(yield* ScopedCache.has(cache, "fail"))
          yield* TestClock.adjust("2 seconds")
          assert.isFalse(yield* ScopedCache.has(cache, "fail"))
        }))

      it.effect("TTL function receives correct parameters", () =>
        Effect.gen(function*() {
          const receivedParams: Array<{ exit: Exit.Exit<number, string>; key: string }> = []

          const cache = yield* ScopedCache.makeWith({
            capacity: 10,
            lookup: (key: string) => key === "fail" ? Effect.fail("error") : Effect.succeed(key.length),
            timeToLive: (exit, key) => {
              receivedParams.push({ exit, key })
              return Duration.infinity
            }
          })

          yield* ScopedCache.get(cache, "test")
          yield* Effect.exit(ScopedCache.get(cache, "fail"))

          assert.strictEqual(receivedParams.length, 2)
          assert.strictEqual(receivedParams[0].key, "test")
          assert.isTrue(Exit.isSuccess(receivedParams[0].exit))
          assert(Exit.isSuccess(receivedParams[0].exit))
          assert.strictEqual(receivedParams[0].exit.value, 4)

          assert.strictEqual(receivedParams[1].key, "fail")
          assert.isTrue(Exit.isFailure(receivedParams[1].exit))
          assert.deepStrictEqual(receivedParams[1].exit, Exit.fail("error"))
        }))

      it.effect("different TTL for success vs failure", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.makeWith({
            capacity: 10,
            lookup: (key: string) => key === "fail" ? Effect.fail("error") : Effect.succeed(key.length),
            timeToLive: (exit) => Exit.isSuccess(exit) ? "1 hour" : "1 minute"
          })

          yield* ScopedCache.get(cache, "success")
          yield* Effect.exit(ScopedCache.get(cache, "fail"))

          yield* TestClock.adjust("30 minutes")
          assert.isTrue(yield* ScopedCache.has(cache, "success"))
          assert.isFalse(yield* ScopedCache.has(cache, "fail"))
        }))

      it.effect("TTL based on key values", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.makeWith({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.length),
            timeToLive: (_exit, key) => key === "short" ? "1 minute" : "1 hour"
          })

          yield* ScopedCache.get(cache, "short")
          yield* ScopedCache.get(cache, "long")

          yield* TestClock.adjust("30 minutes")
          assert.isFalse(yield* ScopedCache.has(cache, "short"))
          assert.isTrue(yield* ScopedCache.has(cache, "long"))
        }))

      it.effect("TTL based on result values", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.makeWith({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.length),
            timeToLive: (exit) => {
              const value = Exit.isSuccess(exit) ? exit.value : 0
              return value > 3 ? "1 hour" : "1 minute"
            }
          })

          yield* ScopedCache.get(cache, "ab") // length 2
          yield* ScopedCache.get(cache, "abcd") // length 4

          yield* TestClock.adjust("30 minutes")
          assert.isFalse(yield* ScopedCache.has(cache, "ab"))
          assert.isTrue(yield* ScopedCache.has(cache, "abcd"))
        }))

      it.effect("infinite TTL handling", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.makeWith({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.length),
            timeToLive: () => Duration.infinity
          })

          yield* ScopedCache.get(cache, "test")
          yield* TestClock.adjust(Duration.hours(1000))
          assert.isTrue(yield* ScopedCache.has(cache, "test"))
        }))

      it.effect("zero duration TTL", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.makeWith({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.length),
            timeToLive: () => Duration.zero
          })

          yield* ScopedCache.get(cache, "test")
          // Entry should expire immediately
          assert.isFalse(yield* ScopedCache.has(cache, "test"))
        }))
    })
  })

  describe("basic operations", () => {
    describe("get", () => {
      it.effect("cache hit - multiple different keys", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.length)
          })

          const result1 = yield* ScopedCache.get(cache, "a")
          const result2 = yield* ScopedCache.get(cache, "ab")
          const result3 = yield* ScopedCache.get(cache, "abc")

          assert.strictEqual(result1, 1)
          assert.strictEqual(result2, 2)
          assert.strictEqual(result3, 3)
        }))

      it.effect("cache hit - same key multiple times doesn't invoke lookup again", () =>
        Effect.gen(function*() {
          const { cache, lookupCount, setLookupResult } = yield* makeScopedTestCache(10)
          setLookupResult("test", Effect.succeed(4))

          const results = yield* Effect.all([
            ScopedCache.get(cache, "test"),
            ScopedCache.get(cache, "test"),
            ScopedCache.get(cache, "test")
          ])

          assert.deepStrictEqual(results, [4, 4, 4])
          assert.strictEqual(lookupCount(), 1)
        }))

      it.effect("cache miss - invokes lookup for non-existent key", () =>
        Effect.gen(function*() {
          const { cache, lookupCount, setLookupResult } = yield* makeScopedTestCache(10)
          setLookupResult("test", Effect.succeed(42))

          const result = yield* ScopedCache.get(cache, "test")

          assert.strictEqual(result, 42)
          assert.strictEqual(lookupCount(), 1)
        }))

      it.effect("cache miss - invokes lookup again after TTL expiration", () =>
        Effect.gen(function*() {
          let counter = 0
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (_key: string) => Effect.sync(() => ++counter),
            timeToLive: "1 hour"
          })

          const result1 = yield* ScopedCache.get(cache, "test")
          assert.strictEqual(result1, 1)

          yield* TestClock.adjust("30 minutes")
          const result2 = yield* ScopedCache.get(cache, "test")
          assert.strictEqual(result2, 1)

          yield* TestClock.adjust("31 minutes")
          const result3 = yield* ScopedCache.get(cache, "test")
          assert.strictEqual(result3, 2)
        }))

      it.effect("error handling - lookup function fails", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (_key: string) => Effect.fail("lookup error")
          })

          const result = yield* Effect.exit(ScopedCache.get(cache, "test"))

          assert.deepStrictEqual(result, Exit.fail("lookup error"))
        }))

      it.effect("concurrent access - multiple fibers getting same key only invoke lookup once", () =>
        Effect.gen(function*() {
          let lookupCount = 0
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: () => Effect.delay(Duration.millis(100))(Effect.sync(() => ++lookupCount))
          })

          const effects = [ScopedCache.get(cache, "key"), ScopedCache.get(cache, "key"), ScopedCache.get(cache, "key")]
          const resultsFiber = yield* Effect.all(effects, { concurrency: "unbounded" }).pipe(Effect.forkChild)

          yield* TestClock.adjust(Duration.millis(150))
          const results = yield* Fiber.join(resultsFiber)

          assert.strictEqual(lookupCount, 1)
          assert.deepStrictEqual(results, [1, 1, 1])
        }))

      it.effect("concurrent access - race between get and invalidate", () =>
        Effect.gen(function*() {
          let lookupCount = 0
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (_key: string) => Effect.delay(Duration.millis(50))(Effect.sync(() => ++lookupCount))
          })

          // First get starts
          const fiber1 = yield* ScopedCache.get(cache, "test").pipe(Effect.forkChild)
          yield* TestClock.adjust(Duration.millis(25))

          // Invalidate while first get is in progress
          yield* ScopedCache.invalidate(cache, "test")

          // Second get starts after invalidation
          const fiber2 = yield* ScopedCache.get(cache, "test").pipe(Effect.forkChild)

          yield* TestClock.adjust(Duration.millis(100))
          const result1 = yield* Fiber.join(fiber1)
          const result2 = yield* Fiber.join(fiber2)

          assert.strictEqual(result1, 1)
          assert.strictEqual(result2, 2)
          assert.strictEqual(lookupCount, 2)
        }))

      it.effect("resource cleanup when entry is replaced", () =>
        Effect.gen(function*() {
          const { cache, cleanupTracker } = yield* makeManagedResourceCache(2)

          // Fill cache to capacity
          yield* ScopedCache.get(cache, "key1")
          yield* ScopedCache.get(cache, "key2")
          assert.strictEqual(cleanupTracker.cleanedUp.length, 0)

          // Add third entry, should evict first
          yield* ScopedCache.get(cache, "key3")
          assert.strictEqual(cleanupTracker.cleanedUp.length, 1)
          assert.deepStrictEqual(cleanupTracker.cleanedUp, ["key1"])
        }))

      it.effect("scope is properly provided to lookup function", () =>
        Effect.gen(function*() {
          const scopeIds: Array<string> = []

          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) =>
              Effect.gen(function*() {
                // Create a resource in the provided scope
                yield* Effect.acquireRelease(
                  Effect.sync(() => scopeIds.push(`acquired-${key}`)),
                  () => Effect.sync(() => scopeIds.push(`released-${key}`))
                )
                return `value-${key}`
              })
          })

          yield* ScopedCache.get(cache, "test")
          assert.deepStrictEqual(scopeIds, ["acquired-test"])

          // Invalidate should trigger resource cleanup
          yield* ScopedCache.invalidate(cache, "test")
          assert.deepStrictEqual(scopeIds, ["acquired-test", "released-test"])
        }))

      it.effect("cache closed state - get returns interrupt", () =>
        Effect.gen(function*() {
          const cache = yield* Effect.scoped(
            ScopedCache.make({
              capacity: 10,
              lookup: (key: string) => Effect.succeed(key.length)
            })
          )

          // Cache should be closed now
          const result = yield* Effect.exit(ScopedCache.get(cache!, "test"))
          assert.isTrue(Exit.hasInterrupts(result))
        }))
    })

    describe("getOption", () => {
      it.effect("returns Some for existing cached value", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.length)
          })

          yield* ScopedCache.get(cache, "test")
          const result = yield* ScopedCache.getOption(cache, "test")

          assert.deepStrictEqual(result, Option.some(4))
        }))

      it.effect("returns None for non-existent key", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.length)
          })

          const result = yield* ScopedCache.getOption(cache, "test")

          assert.deepStrictEqual(result, Option.none())
        }))

      it.effect("returns None for expired value", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.length),
            timeToLive: "1 hour"
          })

          yield* ScopedCache.get(cache, "test")
          yield* TestClock.adjust("2 hours")
          const result = yield* ScopedCache.getOption(cache, "test")

          assert.deepStrictEqual(result, Option.none())
        }))

      it.effect("waits for value being computed and returns result", () =>
        Effect.gen(function*() {
          const deferred = yield* Deferred.make<void>()
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (_key: string) => Deferred.await(deferred).pipe(Effect.as(42))
          })

          const getFiber = yield* ScopedCache.get(cache, "test").pipe(Effect.forkChild)
          const optionFiber = yield* ScopedCache.getOption(cache, "test").pipe(Effect.forkChild)

          yield* Deferred.succeed(deferred, void 0)

          const getResult = yield* Fiber.join(getFiber)
          const optionResult = yield* Fiber.join(optionFiber)

          assert.strictEqual(getResult, 42)
          assert.deepStrictEqual(optionResult, Option.some(42))
        }))

      it.effect("affects LRU order", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 2,
            lookup: (key: string) => Effect.succeed(key.length)
          })

          yield* ScopedCache.get(cache, "a")
          yield* ScopedCache.get(cache, "b")

          yield* ScopedCache.getOption(cache, "a")

          yield* ScopedCache.get(cache, "c")

          assert.isTrue(yield* ScopedCache.has(cache, "a"))
          assert.isFalse(yield* ScopedCache.has(cache, "b"))
          assert.isTrue(yield* ScopedCache.has(cache, "c"))
        }))
    })

    describe("getSuccess", () => {
      it.effect("returns Some for successfully cached value", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.length)
          })

          yield* ScopedCache.get(cache, "test")
          const result = yield* ScopedCache.getSuccess(cache, "test")

          assert.deepStrictEqual(result, Option.some(4))
        }))

      it.effect("returns None for failed cached value", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (_key: string) => Effect.fail("error")
          })

          yield* Effect.exit(ScopedCache.get(cache, "test"))
          const result = yield* ScopedCache.getSuccess(cache, "test")

          assert.deepStrictEqual(result, Option.none())
        }))

      it.effect("returns None for non-existent key", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.length)
          })

          const result = yield* ScopedCache.getSuccess(cache, "test")

          assert.deepStrictEqual(result, Option.none())
        }))

      it.effect("returns None for expired value", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.length),
            timeToLive: "1 hour"
          })

          yield* ScopedCache.get(cache, "test")
          yield* TestClock.adjust("2 hours")
          const result = yield* ScopedCache.getSuccess(cache, "test")

          assert.deepStrictEqual(result, Option.none())
        }))
    })
  })

  describe("modification operations", () => {
    describe("set", () => {
      it.effect("sets new key-value pair", () =>
        Effect.gen(function*() {
          const { cache, lookupCount } = yield* makeScopedTestCache(10)

          yield* ScopedCache.set(cache, "test", 42)
          const result = yield* ScopedCache.get(cache, "test")

          assert.strictEqual(result, 42)
          assert.strictEqual(lookupCount(), 0)
        }))

      it.effect("overwrites existing key", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.length)
          })

          yield* ScopedCache.get(cache, "test")
          yield* ScopedCache.set(cache, "test", 100)
          const result = yield* ScopedCache.get(cache, "test")

          assert.strictEqual(result, 100)
        }))

      it.effect("set with TTL - value expires", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.length),
            timeToLive: "1 hour"
          })

          yield* ScopedCache.set(cache, "test", 42)
          assert.isTrue(yield* ScopedCache.has(cache, "test"))

          yield* TestClock.adjust("2 hours")
          assert.isFalse(yield* ScopedCache.has(cache, "test"))
        }))

      it.effect("set doesn't invoke lookup function", () =>
        Effect.gen(function*() {
          const { cache, lookupCount } = yield* makeScopedTestCache(10)

          yield* ScopedCache.set(cache, "test", 42)
          yield* ScopedCache.set(cache, "test2", 43)
          yield* ScopedCache.set(cache, "test3", 44)

          assert.strictEqual(lookupCount(), 0)
        }))

      it.effect("set enforces capacity constraints", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 2,
            lookup: (key: string) => Effect.succeed(key.length)
          })

          yield* ScopedCache.set(cache, "a", 1)
          yield* ScopedCache.set(cache, "b", 2)
          const sizeBefore = yield* ScopedCache.size(cache)
          assert.strictEqual(sizeBefore, 2)

          yield* ScopedCache.set(cache, "c", 3)
          const sizeAfter = yield* ScopedCache.size(cache)
          assert.strictEqual(sizeAfter, 2)
        }))

      it.effect("resource cleanup when overwriting existing entry", () =>
        Effect.gen(function*() {
          const { cache, cleanupTracker } = yield* makeManagedResourceCache(10)

          yield* ScopedCache.get(cache, "test")
          assert.strictEqual(cleanupTracker.cleanedUp.length, 0)

          // Overwrite should clean up old resource
          yield* ScopedCache.set(cache, "test", "new-value")
          assert.strictEqual(cleanupTracker.cleanedUp.length, 1)
          assert.deepStrictEqual(cleanupTracker.cleanedUp, ["test"])
        }))
    })

    describe("has", () => {
      it.effect("returns true for existing key", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.length)
          })

          yield* ScopedCache.get(cache, "test")
          const result = yield* ScopedCache.has(cache, "test")

          assert.isTrue(result)
        }))

      it.effect("returns false for non-existent key", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.length)
          })

          const result = yield* ScopedCache.has(cache, "test")

          assert.isFalse(result)
        }))

      it.effect("returns false for expired key", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.length),
            timeToLive: "1 hour"
          })

          yield* ScopedCache.get(cache, "test")
          yield* TestClock.adjust("2 hours")
          const result = yield* ScopedCache.has(cache, "test")

          assert.isFalse(result)
        }))

      it.effect("does not affect LRU order", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 2,
            lookup: (key: string) => Effect.succeed(key.length)
          })

          yield* ScopedCache.get(cache, "a")
          yield* ScopedCache.get(cache, "b")

          // Check "a" exists without affecting LRU order
          assert.isTrue(yield* ScopedCache.has(cache, "a"))

          // Add "c" - should still evict "a" (oldest) not "b"
          yield* ScopedCache.get(cache, "c")

          assert.isFalse(yield* ScopedCache.has(cache, "a"))
          assert.isTrue(yield* ScopedCache.has(cache, "b"))
          assert.isTrue(yield* ScopedCache.has(cache, "c"))
        }))
    })

    describe("invalidate", () => {
      it.effect("invalidates existing key", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.length)
          })

          yield* ScopedCache.get(cache, "test")
          yield* ScopedCache.invalidate(cache, "test")
          const result = yield* ScopedCache.has(cache, "test")

          assert.isFalse(result)
        }))

      it.effect("invalidating non-existent key doesn't error", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.length)
          })

          yield* ScopedCache.invalidate(cache, "test")
          const result = yield* ScopedCache.has(cache, "test")

          assert.isFalse(result)
        }))

      it.effect("get after invalidate invokes lookup again", () =>
        Effect.gen(function*() {
          let counter = 0
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (_key: string) => Effect.sync(() => ++counter)
          })

          const result1 = yield* ScopedCache.get(cache, "test")
          yield* ScopedCache.invalidate(cache, "test")
          const result2 = yield* ScopedCache.get(cache, "test")

          assert.strictEqual(result1, 1)
          assert.strictEqual(result2, 2)
        }))

      it.effect("resource cleanup when invalidating entry", () =>
        Effect.gen(function*() {
          const { cache, cleanupTracker } = yield* makeManagedResourceCache(10)

          yield* ScopedCache.get(cache, "test")
          assert.strictEqual(cleanupTracker.cleanedUp.length, 0)

          yield* ScopedCache.invalidate(cache, "test")
          assert.strictEqual(cleanupTracker.cleanedUp.length, 1)
          assert.deepStrictEqual(cleanupTracker.cleanedUp, ["test"])
        }))
    })

    describe("invalidateWhen", () => {
      it.effect.each([Exit.succeed(1), Exit.fail("error")])(
        "preserves a replacement resource after an old lookup completes (%#)",
        (exit) =>
          Effect.gen(function*() {
            let acquired = 0
            const released: Array<number> = []
            const values: Array<number> = []
            const gate = yield* Deferred.make<number, string>()
            const owner = yield* Scope.make()
            const cache = yield* ScopedCache.make({
              capacity: 1,
              lookup: (_key: string) =>
                Effect.gen(function*() {
                  const id = yield* Effect.acquireRelease(
                    Effect.sync(() => ++acquired),
                    (value) => Effect.sync(() => released.push(value))
                  )
                  if (id === 1) return yield* Deferred.await(gate)
                  return id
                })
            }).pipe(Scope.provide(owner))
            const lookup = yield* ScopedCache.get(cache, "key").pipe(
              Effect.exit,
              Effect.forkChild({ startImmediately: true })
            )
            const invalidator = yield* ScopedCache.invalidateWhen(cache, "key", (value) => {
              values.push(value)
              return value === 1
            }).pipe(
              Effect.forkChild({ startImmediately: true })
            )

            yield* ScopedCache.invalidate(cache, "key")
            const replacement = yield* ScopedCache.get(cache, "key")
            yield* Deferred.done(gate, exit)
            const original = yield* Fiber.join(lookup)
            const invalidated = yield* Fiber.join(invalidator)
            const cached = yield* ScopedCache.getSuccess(cache, "key")
            const releasedBeforeClose = [...released]
            yield* Scope.close(owner, Exit.void)

            assert.deepStrictEqual(releasedBeforeClose, [1])
            assert.deepStrictEqual(original, exit)
            assert.deepStrictEqual(values, Exit.isSuccess(exit) ? [1] : [])
            assert.deepStrictEqual(
              { invalidated, replacement, cached, released },
              { invalidated: false, replacement: 2, cached: Option.some(2), released: [1, 2] }
            )
          })
      )

      it.effect("invalidates when predicate matches", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.length)
          })

          yield* ScopedCache.get(cache, "test")
          const result = yield* ScopedCache.invalidateWhen(cache, "test", (value) => value === 4)

          assert.isTrue(result)
          assert.isFalse(yield* ScopedCache.has(cache, "test"))
        }))

      it.effect("doesn't invalidate when predicate doesn't match", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.length)
          })

          yield* ScopedCache.get(cache, "test")
          const result = yield* ScopedCache.invalidateWhen(cache, "test", (value) => value === 5)

          assert.isFalse(result)
          assert.isTrue(yield* ScopedCache.has(cache, "test"))
        }))

      it.effect("returns false for non-existent key", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.length)
          })

          const result = yield* ScopedCache.invalidateWhen(cache, "test", () => true)

          assert.isFalse(result)
        }))

      it.effect("returns false for failed cached value", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (_key: string) => Effect.fail("error")
          })

          yield* Effect.exit(ScopedCache.get(cache, "test"))
          const result = yield* ScopedCache.invalidateWhen(cache, "test", () => true)

          assert.isFalse(result)
        }))

      it.effect("resource cleanup when predicate matches", () =>
        Effect.gen(function*() {
          const { cache, cleanupTracker } = yield* makeManagedResourceCache(10)

          yield* ScopedCache.get(cache, "test")
          assert.strictEqual(cleanupTracker.cleanedUp.length, 0)

          const result = yield* ScopedCache.invalidateWhen(cache, "test", (value) => value.includes("resource"))
          assert.isTrue(result)
          assert.strictEqual(cleanupTracker.cleanedUp.length, 1)
          assert.deepStrictEqual(cleanupTracker.cleanedUp, ["test"])
        }))
    })

    describe("refresh", () => {
      it.effect("caches a synchronous lookup defect for a missing key", () =>
        Effect.gen(function*() {
          let lookups = 0
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (_key: string): Effect.Effect<number> => {
              lookups++
              throw "lookup defect"
            }
          })

          assert.deepStrictEqual(yield* Effect.exit(ScopedCache.refresh(cache, "test")), Exit.die("lookup defect"))
          const reader = yield* ScopedCache.get(cache, "test").pipe(
            Effect.exit,
            Effect.timeoutOption("1 second"),
            Effect.forkChild
          )
          yield* TestClock.adjust("1 second")

          assert.deepStrictEqual(yield* Fiber.join(reader), Option.some(Exit.die("lookup defect")))
          assert.strictEqual(lookups, 1)
        }))

      it.effect("replaces an existing entry with a synchronous lookup defect", () =>
        Effect.gen(function*() {
          let fail = false
          let released = 0
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (_key: string) => {
              if (fail) throw "lookup defect"
              return Effect.acquireRelease(
                Effect.succeed(42),
                () => Effect.sync(() => released++)
              )
            }
          })
          assert.strictEqual(yield* ScopedCache.get(cache, "test"), 42)
          fail = true

          assert.deepStrictEqual(yield* Effect.exit(ScopedCache.refresh(cache, "test")), Exit.die("lookup defect"))

          assert.deepStrictEqual({
            result: yield* Effect.exit(ScopedCache.get(cache, "test")),
            released
          }, {
            result: Exit.die("lookup defect"),
            released: 1
          })
        }))

      it.effect("refresh existing key invokes lookup again", () =>
        Effect.gen(function*() {
          let counter = 0
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (_key: string) => Effect.sync(() => ++counter)
          })

          yield* ScopedCache.get(cache, "test")
          const result = yield* ScopedCache.refresh(cache, "test")

          assert.strictEqual(result, 2)
        }))

      it.effect("refresh non-existent key invokes lookup and enforces capacity", () =>
        Effect.gen(function*() {
          let counter = 0
          const cache = yield* ScopedCache.make({
            capacity: 1,
            lookup: (_key: string) => Effect.sync(() => ++counter)
          })

          yield* ScopedCache.set(cache, "other", 99)
          const result = yield* ScopedCache.refresh(cache, "test")

          assert.strictEqual(result, 1)
          assert.strictEqual(yield* ScopedCache.size(cache), 1)
          assert.deepStrictEqual(yield* ScopedCache.keys(cache), ["test"])
        }))

      it.effect("refresh enforces capacity when the existing key is evicted during lookup", () =>
        Effect.gen(function*() {
          const started = yield* Deferred.make<void>()
          const result = yield* Deferred.make<number>()
          const released: Array<number> = []
          const cache = yield* ScopedCache.make({
            capacity: 1,
            lookup: (key: string) =>
              Effect.gen(function*() {
                const value = key === "a"
                  ? yield* Deferred.succeed(started, void 0).pipe(Effect.andThen(Deferred.await(result)))
                  : 99
                return yield* Effect.acquireRelease(
                  Effect.succeed(value),
                  (value) => Effect.sync(() => released.push(value))
                )
              })
          })

          yield* ScopedCache.set(cache, "a", 1)
          const refresh = yield* ScopedCache.refresh(cache, "a").pipe(Effect.forkChild({ startImmediately: true }))
          yield* Deferred.await(started)
          assert.strictEqual(yield* ScopedCache.get(cache, "b"), 99)
          assert.isFalse(yield* ScopedCache.has(cache, "a"))
          assert.deepStrictEqual(released, [])

          yield* Deferred.succeed(result, 2)
          assert.strictEqual(yield* Fiber.join(refresh), 2)
          assert.deepStrictEqual({
            size: yield* ScopedCache.size(cache),
            keys: (yield* ScopedCache.keys(cache)).sort(),
            released: released.slice()
          }, { size: 1, keys: ["a"], released: [99] })
          assert.deepStrictEqual(yield* ScopedCache.getSuccess(cache, "a"), Option.some(2))

          yield* ScopedCache.invalidateAll(cache)
          assert.deepStrictEqual(released, [99, 2])
        }))

      it.effect("refresh updates TTL", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.length),
            timeToLive: "1 hour"
          })

          yield* ScopedCache.get(cache, "test")
          yield* TestClock.adjust("30 minutes")
          yield* ScopedCache.refresh(cache, "test")
          yield* TestClock.adjust("40 minutes")

          assert.isTrue(yield* ScopedCache.has(cache, "test"))
        }))

      it.effect("concurrent refresh calls each invoke lookup independently", () =>
        Effect.gen(function*() {
          let lookupCount = 0
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: () => Effect.sync(() => ++lookupCount)
          })

          yield* ScopedCache.get(cache, "test")
          lookupCount = 0

          const results = yield* Effect.all([
            ScopedCache.refresh(cache, "test"),
            ScopedCache.refresh(cache, "test"),
            ScopedCache.refresh(cache, "test")
          ], { concurrency: "unbounded" })

          // Each refresh calls lookup independently
          assert.strictEqual(lookupCount, 3)
          assert.deepStrictEqual(results, [1, 2, 3])
        }))

      it.effect("resource cleanup for old entry after refresh", () =>
        Effect.gen(function*() {
          const { cache, cleanupTracker } = yield* makeManagedResourceCache(10)

          yield* ScopedCache.get(cache, "test")
          assert.strictEqual(cleanupTracker.cleanedUp.length, 0)

          yield* ScopedCache.refresh(cache, "test")
          assert.strictEqual(cleanupTracker.cleanedUp.length, 1)
          assert.deepStrictEqual(cleanupTracker.cleanedUp, ["test"])
        }))
    })

    describe("invalidateAll", () => {
      it.effect.each([false, true])(
        "retains ownership of entries refreshed by finalizers (yield: %s)",
        (yieldBeforeRefresh) =>
          Effect.gen(function*() {
            let acquired = 0
            const released: Array<number> = []

            const cached = yield* Effect.scoped(Effect.gen(function*() {
              const cache: ScopedCache.ScopedCache<string, number> = yield* ScopedCache.make({
                capacity: 10,
                lookup: (_key: string) =>
                  Effect.acquireRelease(
                    Effect.sync(() => ++acquired),
                    (value) =>
                      Effect.gen(function*() {
                        released.push(value)
                        if (value === 1) {
                          if (yieldBeforeRefresh) {
                            yield* Effect.yieldNow
                          }
                          yield* ScopedCache.refresh(cache, "key")
                        }
                      })
                  )
              })

              yield* ScopedCache.get(cache, "key")
              yield* ScopedCache.invalidateAll(cache)
              assert.deepStrictEqual(released, [1])
              return yield* ScopedCache.getSuccess(cache, "key")
            }))

            assert.strictEqual(acquired, 2)
            assert.deepStrictEqual(released, [1, 2])
            assert.deepStrictEqual(cached, Option.some(2))
          })
      )

      it.effect("removes all entries before running finalizers", () =>
        Effect.gen(function*() {
          const observedKeys: Array<Array<string>> = []
          const cache: ScopedCache.ScopedCache<string, string> = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) =>
              Effect.acquireRelease(
                Effect.succeed(key),
                () =>
                  Effect.gen(function*() {
                    observedKeys.push(yield* ScopedCache.keys(cache))
                  })
              )
          })

          yield* ScopedCache.get(cache, "first")
          yield* ScopedCache.get(cache, "second")
          yield* ScopedCache.invalidateAll(cache)

          assert.deepStrictEqual(observedKeys, [[], []])
        }))

      it.effect("clears all entries", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.length)
          })

          yield* ScopedCache.get(cache, "a")
          yield* ScopedCache.get(cache, "b")
          yield* ScopedCache.get(cache, "c")

          yield* ScopedCache.invalidateAll(cache)

          assert.isFalse(yield* ScopedCache.has(cache, "a"))
          assert.isFalse(yield* ScopedCache.has(cache, "b"))
          assert.isFalse(yield* ScopedCache.has(cache, "c"))
        }))

      it.effect("size becomes 0 after invalidateAll", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.length)
          })

          yield* ScopedCache.get(cache, "a")
          yield* ScopedCache.get(cache, "b")
          yield* ScopedCache.get(cache, "c")

          yield* ScopedCache.invalidateAll(cache)
          const size = yield* ScopedCache.size(cache)

          assert.strictEqual(size, 0)
        }))

      it.effect("all keys return None after invalidateAll", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.length)
          })

          yield* ScopedCache.get(cache, "a")
          yield* ScopedCache.get(cache, "b")

          yield* ScopedCache.invalidateAll(cache)

          const result1 = yield* ScopedCache.getOption(cache, "a")
          const result2 = yield* ScopedCache.getOption(cache, "b")

          assert.deepStrictEqual(result1, Option.none())
          assert.deepStrictEqual(result2, Option.none())
        }))

      it.effect("resource cleanup for all entries", () =>
        Effect.gen(function*() {
          const { cache, cleanupTracker } = yield* makeManagedResourceCache(10)

          yield* ScopedCache.get(cache, "test1")
          yield* ScopedCache.get(cache, "test2")
          yield* ScopedCache.get(cache, "test3")
          assert.strictEqual(cleanupTracker.cleanedUp.length, 0)

          yield* ScopedCache.invalidateAll(cache)
          assert.strictEqual(cleanupTracker.cleanedUp.length, 3)
          assert.deepStrictEqual(cleanupTracker.cleanedUp.sort(), ["test1", "test2", "test3"])
        }))
    })
  })

  describe("utility operations", () => {
    describe("size", () => {
      it.effect("empty cache returns 0", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.length)
          })

          const size = yield* ScopedCache.size(cache)

          assert.strictEqual(size, 0)
        }))

      it.effect("returns correct count after adding entries", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.length)
          })

          yield* ScopedCache.get(cache, "a")
          yield* ScopedCache.get(cache, "b")
          yield* ScopedCache.get(cache, "c")

          const size = yield* ScopedCache.size(cache)

          assert.strictEqual(size, 3)
        }))

      it.effect("decreases after invalidation", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.length)
          })

          yield* ScopedCache.get(cache, "a")
          yield* ScopedCache.get(cache, "b")
          yield* ScopedCache.get(cache, "c")
          yield* ScopedCache.invalidate(cache, "b")

          const size = yield* ScopedCache.size(cache)

          assert.strictEqual(size, 2)
        }))

      it.effect("expired entries are counted until accessed", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.length),
            timeToLive: "1 hour"
          })

          yield* ScopedCache.get(cache, "a")
          yield* ScopedCache.get(cache, "b")

          yield* TestClock.adjust("2 hours")

          // Size still includes expired entries
          const sizeBefore = yield* ScopedCache.size(cache)
          assert.strictEqual(sizeBefore, 2)

          // Accessing expired entries removes them
          yield* ScopedCache.has(cache, "a")
          const sizeAfter = yield* ScopedCache.size(cache)
          assert.strictEqual(sizeAfter, 1)
        }))
    })

    describe("keys", () => {
      it.effect("returns all active keys", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.length)
          })

          yield* ScopedCache.get(cache, "a")
          yield* ScopedCache.get(cache, "b")
          yield* ScopedCache.get(cache, "c")

          const keys = yield* ScopedCache.keys(cache)

          assert.deepStrictEqual(keys.sort(), ["a", "b", "c"])
        }))

      it.effect("excludes keys for expired entries", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.length),
            timeToLive: "1 hour"
          })

          yield* ScopedCache.get(cache, "a")
          yield* ScopedCache.get(cache, "b")

          yield* TestClock.adjust("2 hours")

          const keys = yield* ScopedCache.keys(cache)

          assert.deepStrictEqual(keys.sort(), [])
        }))

      it.effect("empty after invalidateAll", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.length)
          })

          yield* ScopedCache.get(cache, "a")
          yield* ScopedCache.get(cache, "b")
          yield* ScopedCache.invalidateAll(cache)

          const keys = yield* ScopedCache.keys(cache)

          assert.deepStrictEqual(keys, [])
        }))

      it.effect("resource cleanup for expired entries as side effect", () =>
        Effect.gen(function*() {
          const { cache, cleanupTracker } = yield* Effect.gen(function*() {
            const cleanupTracker: CleanupTracker = {
              cleanedUp: [],
              acquired: []
            }

            const cache = yield* ScopedCache.make({
              capacity: 10,
              lookup: (key: string) =>
                Effect.gen(function*() {
                  yield* Effect.acquireRelease(
                    Effect.sync(() => cleanupTracker.acquired.push(key)),
                    () => Effect.sync(() => cleanupTracker.cleanedUp.push(key))
                  )
                  return `resource-${key}`
                }),
              timeToLive: "1 hour"
            })

            return { cache, cleanupTracker }
          })

          yield* ScopedCache.get(cache, "a")
          yield* ScopedCache.get(cache, "b")
          assert.strictEqual(cleanupTracker.cleanedUp.length, 0)

          yield* TestClock.adjust("2 hours")

          // keys() should clean up expired entries as side effect
          const keys = yield* ScopedCache.keys(cache)
          assert.deepStrictEqual(keys, [])
          assert.strictEqual(cleanupTracker.cleanedUp.length, 2)
          assert.deepStrictEqual(cleanupTracker.cleanedUp.sort(), ["a", "b"])
        }))
    })

    describe("values", () => {
      it.effect("returns all successful cached values", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.length),
            timeToLive: "1 hour"
          })

          yield* ScopedCache.get(cache, "a")
          yield* ScopedCache.get(cache, "ab")
          yield* ScopedCache.get(cache, "abc")

          const values = yield* ScopedCache.values(cache)
          const valuesArray = values.sort()

          assert.deepStrictEqual(valuesArray, [1, 2, 3])
        }))

      it.effect("doesn't include failed lookups", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) => key === "fail" ? Effect.fail("error") : Effect.succeed(key.length),
            timeToLive: "1 hour"
          })

          yield* ScopedCache.get(cache, "a")
          yield* Effect.exit(ScopedCache.get(cache, "fail"))
          yield* ScopedCache.get(cache, "ab")

          const values = yield* ScopedCache.values(cache)
          const valuesArray = values.sort()

          assert.deepStrictEqual(valuesArray, [1, 2])
        }))

      it.effect("doesn't include expired values", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.length),
            timeToLive: "1 hour"
          })

          yield* ScopedCache.get(cache, "a")
          yield* ScopedCache.get(cache, "b")

          yield* TestClock.adjust("2 hours")

          const values = yield* ScopedCache.values(cache)

          assert.deepStrictEqual(values, [])
        }))

      it.effect("resource cleanup for expired entries as side effect", () =>
        Effect.gen(function*() {
          const { cache, cleanupTracker } = yield* Effect.gen(function*() {
            const cleanupTracker: CleanupTracker = {
              cleanedUp: [],
              acquired: []
            }

            const cache = yield* ScopedCache.make({
              capacity: 10,
              lookup: (key: string) =>
                Effect.gen(function*() {
                  yield* Effect.acquireRelease(
                    Effect.sync(() => cleanupTracker.acquired.push(key)),
                    () => Effect.sync(() => cleanupTracker.cleanedUp.push(key))
                  )
                  return `resource-${key}`
                }),
              timeToLive: "1 hour"
            })

            return { cache, cleanupTracker }
          })

          yield* ScopedCache.get(cache, "a")
          yield* ScopedCache.get(cache, "b")
          assert.strictEqual(cleanupTracker.cleanedUp.length, 0)

          yield* TestClock.adjust("2 hours")

          // values() should clean up expired entries as side effect
          const values = yield* ScopedCache.values(cache)
          assert.deepStrictEqual(values, [])
          assert.strictEqual(cleanupTracker.cleanedUp.length, 2)
          assert.deepStrictEqual(cleanupTracker.cleanedUp.sort(), ["a", "b"])
        }))
    })

    describe("entries", () => {
      it.effect("returns all key-value pairs", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.length),
            timeToLive: "1 hour"
          })

          yield* ScopedCache.get(cache, "a")
          yield* ScopedCache.get(cache, "ab")
          yield* ScopedCache.get(cache, "abc")

          const entries = yield* ScopedCache.entries(cache)
          const entriesArray = entries.sort(([a], [b]) => a.localeCompare(b))

          assert.deepStrictEqual(entriesArray, [["a", 1], ["ab", 2], ["abc", 3]])
        }))

      it.effect("filters out failed lookups", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) => key === "fail" ? Effect.fail("error") : Effect.succeed(key.length),
            timeToLive: "1 hour"
          })

          yield* ScopedCache.get(cache, "a")
          yield* Effect.exit(ScopedCache.get(cache, "fail"))
          yield* ScopedCache.get(cache, "ab")

          const entries = yield* ScopedCache.entries(cache)
          const entriesArray = entries.sort(([a], [b]) => a.localeCompare(b))

          assert.deepStrictEqual(entriesArray, [["a", 1], ["ab", 2]])
        }))

      it.effect("filters out expired entries", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.length),
            timeToLive: "1 hour"
          })

          yield* ScopedCache.get(cache, "a")
          yield* TestClock.adjust("1 hour")
          yield* ScopedCache.get(cache, "b")

          const entries = yield* ScopedCache.entries(cache)

          assert.deepStrictEqual(entries, [["b", 1]])
        }))

      it.effect("removes expired entries as side effect with resource cleanup", () =>
        Effect.gen(function*() {
          const { cache, cleanupTracker } = yield* Effect.gen(function*() {
            const cleanupTracker: CleanupTracker = {
              cleanedUp: [],
              acquired: []
            }

            const cache = yield* ScopedCache.make({
              capacity: 10,
              lookup: (key: string) =>
                Effect.gen(function*() {
                  yield* Effect.acquireRelease(
                    Effect.sync(() => cleanupTracker.acquired.push(key)),
                    () => Effect.sync(() => cleanupTracker.cleanedUp.push(key))
                  )
                  return `resource-${key}`
                }),
              timeToLive: "1 hour"
            })

            return { cache, cleanupTracker }
          })

          yield* ScopedCache.get(cache, "a")
          yield* ScopedCache.get(cache, "b")

          yield* TestClock.adjust("2 hours")

          const sizeBefore = yield* ScopedCache.size(cache)
          assert.strictEqual(sizeBefore, 2)

          const entriesResult = yield* ScopedCache.entries(cache)

          const sizeAfter = yield* ScopedCache.size(cache)

          // entries() should remove expired entries as side effect
          assert.strictEqual(sizeAfter, 0)
          assert.strictEqual(entriesResult.length, 0)
          assert.strictEqual(cleanupTracker.cleanedUp.length, 2)
          assert.deepStrictEqual(cleanupTracker.cleanedUp.sort(), ["a", "b"])
        }))
    })
  })

  describe("capacity management", () => {
    describe("LRU Eviction", () => {
      it.effect("oldest entries removed when capacity exceeded", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 3,
            lookup: (key: string) => Effect.succeed(key.length)
          })

          yield* ScopedCache.get(cache, "first")
          yield* ScopedCache.get(cache, "second")
          yield* ScopedCache.get(cache, "third")

          // Check all entries are present
          assert.isTrue(yield* ScopedCache.has(cache, "first"))
          assert.isTrue(yield* ScopedCache.has(cache, "second"))
          assert.isTrue(yield* ScopedCache.has(cache, "third"))

          // Add fourth entry, should evict first (oldest)
          yield* ScopedCache.get(cache, "fourth")

          assert.isFalse(yield* ScopedCache.has(cache, "first"))
          assert.isTrue(yield* ScopedCache.has(cache, "second"))
          assert.isTrue(yield* ScopedCache.has(cache, "third"))
          assert.isTrue(yield* ScopedCache.has(cache, "fourth"))
        }))

      it.effect("access order determines eviction", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 3,
            lookup: (key: string) => Effect.succeed(key.length)
          })

          yield* ScopedCache.get(cache, "a")
          yield* ScopedCache.get(cache, "b")
          yield* ScopedCache.get(cache, "c")

          // Access "a" to make it most recently used
          yield* ScopedCache.get(cache, "a")

          // Add "d" - should evict "b" (now oldest)
          yield* ScopedCache.get(cache, "d")

          assert.isTrue(yield* ScopedCache.has(cache, "a"))
          assert.isFalse(yield* ScopedCache.has(cache, "b"))
          assert.isTrue(yield* ScopedCache.has(cache, "c"))
          assert.isTrue(yield* ScopedCache.has(cache, "d"))
        }))

      it.effect("capacity of 1", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 1,
            lookup: (key: string) => Effect.succeed(key.length)
          })

          yield* ScopedCache.get(cache, "a")
          assert.isTrue(yield* ScopedCache.has(cache, "a"))

          yield* ScopedCache.get(cache, "b")
          assert.isFalse(yield* ScopedCache.has(cache, "a"))
          assert.isTrue(yield* ScopedCache.has(cache, "b"))

          yield* ScopedCache.get(cache, "c")
          assert.isFalse(yield* ScopedCache.has(cache, "b"))
          assert.isTrue(yield* ScopedCache.has(cache, "c"))
        }))

      it.effect("very large capacity", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10000,
            lookup: (key: string) => Effect.succeed(key.length)
          })

          // Add many entries
          for (let i = 0; i < 100; i++) {
            yield* ScopedCache.get(cache, `key-${i}`)
          }

          // All should still be present
          for (let i = 0; i < 100; i++) {
            assert.isTrue(yield* ScopedCache.has(cache, `key-${i}`))
          }

          const size = yield* ScopedCache.size(cache)
          assert.strictEqual(size, 100)
        }))

      it.effect("resource cleanup for evicted entries", () =>
        Effect.gen(function*() {
          const { cache, cleanupTracker } = yield* makeManagedResourceCache(2)

          yield* ScopedCache.get(cache, "a")
          yield* ScopedCache.get(cache, "b")
          assert.deepStrictEqual(cleanupTracker.cleanedUp, [])

          // Adding third entry should evict first and clean up its resource
          yield* ScopedCache.get(cache, "c")
          assert.deepStrictEqual(cleanupTracker.cleanedUp, ["a"])

          // Adding fourth entry should evict second
          yield* ScopedCache.get(cache, "d")
          assert.deepStrictEqual(cleanupTracker.cleanedUp, ["a", "b"])
        }))
    })
  })

  describe("TTL (Time To Live) Testing", () => {
    describe("Fixed TTL", () => {
      it.effect("entry expires after specified duration", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.length),
            timeToLive: "2 hours"
          })

          yield* ScopedCache.get(cache, "test")

          yield* TestClock.adjust("1 hour")
          assert.isTrue(yield* ScopedCache.has(cache, "test"))

          yield* TestClock.adjust(Duration.sum(Duration.hours(1), Duration.seconds(1)))
          assert.isFalse(yield* ScopedCache.has(cache, "test"))
        }))

      it.effect("get after expiration invokes lookup", () =>
        Effect.gen(function*() {
          let lookupCount = 0
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (_key: string) => Effect.sync(() => ++lookupCount),
            timeToLive: "1 hour"
          })

          const result1 = yield* ScopedCache.get(cache, "test")
          assert.strictEqual(result1, 1)
          assert.strictEqual(lookupCount, 1)

          yield* TestClock.adjust("2 hours")

          const result2 = yield* ScopedCache.get(cache, "test")
          assert.strictEqual(result2, 2)
          assert.strictEqual(lookupCount, 2)
        }))

      it.effect("has returns false for expired entries", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.length),
            timeToLive: "1 hour"
          })

          yield* ScopedCache.get(cache, "test")
          assert.isTrue(yield* ScopedCache.has(cache, "test"))

          yield* TestClock.adjust("2 hours")
          assert.isFalse(yield* ScopedCache.has(cache, "test"))
        }))

      it.effect("resource cleanup for expired entries", () =>
        Effect.gen(function*() {
          const { cache, cleanupTracker } = yield* Effect.gen(function*() {
            const cleanupTracker: CleanupTracker = {
              cleanedUp: [],
              acquired: []
            }

            const cache = yield* ScopedCache.make({
              capacity: 10,
              lookup: (key: string) =>
                Effect.gen(function*() {
                  yield* Effect.acquireRelease(
                    Effect.sync(() => cleanupTracker.acquired.push(key)),
                    () => Effect.sync(() => cleanupTracker.cleanedUp.push(key))
                  )
                  return `resource-${key}`
                }),
              timeToLive: "1 hour"
            })

            return { cache, cleanupTracker }
          })

          yield* ScopedCache.get(cache, "test")
          assert.deepStrictEqual(cleanupTracker.cleanedUp, [])

          yield* TestClock.adjust("2 hours")

          // Accessing expired entry should trigger cleanup
          yield* ScopedCache.has(cache, "test")
          assert.deepStrictEqual(cleanupTracker.cleanedUp, ["test"])
        }))
    })

    describe("Function-based TTL", () => {
      it.effect("different TTL for success vs failure", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.makeWith({
            capacity: 10,
            lookup: (key: string) => key === "fail" ? Effect.fail("error") : Effect.succeed(key.length),
            timeToLive: (exit) => Exit.isSuccess(exit) ? "2 hours" : "30 minutes"
          })

          yield* ScopedCache.get(cache, "success")
          yield* Effect.exit(ScopedCache.get(cache, "fail"))

          yield* TestClock.adjust("1 hour")
          assert.isTrue(yield* ScopedCache.has(cache, "success"))
          assert.isFalse(yield* ScopedCache.has(cache, "fail"))

          yield* TestClock.adjust("2 hours")
          assert.isFalse(yield* ScopedCache.has(cache, "success"))
        }))

      it.effect("TTL based on key", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.makeWith({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.length),
            timeToLive: (_exit, key) => {
              if (key.startsWith("short-")) return "1 minute"
              if (key.startsWith("medium-")) return "1 hour"
              return "1 day"
            }
          })

          yield* ScopedCache.get(cache, "short-item")
          yield* ScopedCache.get(cache, "medium-item")
          yield* ScopedCache.get(cache, "long-item")

          yield* TestClock.adjust("2 minutes")
          assert.isFalse(yield* ScopedCache.has(cache, "short-item"))
          assert.isTrue(yield* ScopedCache.has(cache, "medium-item"))
          assert.isTrue(yield* ScopedCache.has(cache, "long-item"))

          yield* TestClock.adjust("2 hours")
          assert.isFalse(yield* ScopedCache.has(cache, "medium-item"))
          assert.isTrue(yield* ScopedCache.has(cache, "long-item"))
        }))

      it.effect("TTL based on value", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.makeWith({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.length),
            timeToLive: (exit) => {
              if (Exit.isSuccess(exit)) {
                const value = exit.value
                return value > 5 ? "1 hour" : "1 minute"
              }
              return Duration.infinity
            }
          })

          yield* ScopedCache.get(cache, "abc") // length 3
          yield* ScopedCache.get(cache, "longkey") // length 7

          yield* TestClock.adjust("2 minutes")
          assert.isFalse(yield* ScopedCache.has(cache, "abc"))
          assert.isTrue(yield* ScopedCache.has(cache, "longkey"))
        }))

      it.effect("infinite TTL", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.makeWith({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.length),
            timeToLive: () => Duration.infinity
          })

          yield* ScopedCache.get(cache, "test")
          yield* TestClock.adjust(Duration.days(365))
          assert.isTrue(yield* ScopedCache.has(cache, "test"))
        }))

      it.effect("zero duration TTL", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.makeWith({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.length),
            timeToLive: () => Duration.zero
          })

          yield* ScopedCache.get(cache, "test")
          // Should expire immediately
          assert.isFalse(yield* ScopedCache.has(cache, "test"))
        }))

      it.effect("TTL updates on refresh", () =>
        Effect.gen(function*() {
          let refreshCount = 0
          const cache = yield* ScopedCache.makeWith({
            capacity: 10,
            lookup: (_key: string) => Effect.sync(() => ++refreshCount),
            timeToLive: (exit) => {
              if (Exit.isSuccess(exit)) {
                // First lookup gets 1 hour, refresh gets 2 hours
                return refreshCount === 1 ? "1 hour" : "2 hours"
              }
              return Duration.infinity
            }
          })

          yield* ScopedCache.get(cache, "test")
          yield* TestClock.adjust("30 minutes")
          assert.isTrue(yield* ScopedCache.has(cache, "test"))

          // Refresh should update TTL
          yield* ScopedCache.refresh(cache, "test")

          yield* TestClock.adjust("1 hour")
          assert.isTrue(yield* ScopedCache.has(cache, "test")) // Still alive due to 2 hour TTL

          yield* TestClock.adjust("1 hours")
          assert.isFalse(yield* ScopedCache.has(cache, "test"))
        }))
    })
  })

  describe("error scenarios", () => {
    describe("Failed Lookups", () => {
      it.effect("settles concurrent gets when TTL calculation throws after an asynchronous lookup", () =>
        Effect.gen(function*() {
          const started = yield* Latch.make()
          const finish = yield* Latch.make()
          const cache = yield* ScopedCache.makeWith({
            capacity: 10,
            lookup: (_key: string) => Effect.andThen(started.open, Effect.as(finish.await, 42)),
            timeToLive: () => {
              throw new Error("TTL defect")
            }
          })

          const first = yield* ScopedCache.get(cache, "test").pipe(
            Effect.exit,
            Effect.timeoutOption("1 second"),
            Effect.forkChild({ startImmediately: true })
          )
          yield* started.await
          const second = yield* ScopedCache.get(cache, "test").pipe(
            Effect.exit,
            Effect.timeoutOption("1 second"),
            Effect.forkChild({ startImmediately: true })
          )
          yield* Effect.yieldNow
          yield* finish.open
          yield* TestClock.adjust("1 second")

          assert.deepStrictEqual(yield* Fiber.join(first), Option.some(Exit.succeed(42)))
          assert.deepStrictEqual(yield* Fiber.join(second), Option.some(Exit.succeed(42)))
        }))

      it.effect("does not cache an asynchronous failure with zero TTL", () =>
        Effect.gen(function*() {
          let lookupCount = 0
          const cache = yield* ScopedCache.makeWith({
            capacity: 10,
            lookup: (_key: string) =>
              Effect.promise(() => Promise.resolve()).pipe(
                Effect.andThen(Effect.sync(() => ++lookupCount)),
                Effect.flatMap((count) => count === 1 ? Effect.fail("error") : Effect.succeed(count))
              ),
            timeToLive: (exit) => Exit.isFailure(exit) ? Duration.zero : Duration.infinity
          })

          assert.deepStrictEqual(yield* Effect.exit(ScopedCache.get(cache, "test")), Exit.fail("error"))
          assert.deepStrictEqual(yield* Effect.exit(ScopedCache.get(cache, "test")), Exit.succeed(2))
          assert.strictEqual(lookupCount, 2)
        }))

      it.effect("failed lookup caches the failure", () =>
        Effect.gen(function*() {
          let lookupCount = 0
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (_key: string) => Effect.sync(() => ++lookupCount).pipe(Effect.flatMap(() => Effect.fail("error")))
          })

          const result1 = yield* Effect.exit(ScopedCache.get(cache, "test"))
          const result2 = yield* Effect.exit(ScopedCache.get(cache, "test"))

          assert.deepStrictEqual(result1, Exit.fail("error"))
          assert.deepStrictEqual(result2, Exit.fail("error"))
          assert.strictEqual(lookupCount, 1) // Only called once
        }))

      it.effect("subsequent gets return same failure", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (_key: string) => Effect.fail("lookup failed")
          })

          const results = yield* Effect.all([
            Effect.exit(ScopedCache.get(cache, "test")),
            Effect.exit(ScopedCache.get(cache, "test")),
            Effect.exit(ScopedCache.get(cache, "test"))
          ])

          assert.deepStrictEqual(results, [
            Exit.fail("lookup failed"),
            Exit.fail("lookup failed"),
            Exit.fail("lookup failed")
          ])
        }))

      it.effect("can refresh after failure", () =>
        Effect.gen(function*() {
          let shouldFail = true
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (_key: string) => shouldFail ? Effect.fail("error") : Effect.succeed(42)
          })

          const failResult = yield* Effect.exit(ScopedCache.get(cache, "test"))
          assert.isTrue(Exit.isFailure(failResult))

          shouldFail = false
          const successResult = yield* ScopedCache.refresh(cache, "test")
          assert.strictEqual(successResult, 42)
        }))

      it.effect("multiple fibers encountering same error", () =>
        Effect.gen(function*() {
          let lookupCount = 0
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: () =>
              Effect.delay(Duration.millis(50))(
                Effect.sync(() => ++lookupCount).pipe(Effect.flatMap(() => Effect.fail("error")))
              )
          })

          const fibers = yield* Effect.all([
            ScopedCache.get(cache, "test").pipe(Effect.exit, Effect.forkChild),
            ScopedCache.get(cache, "test").pipe(Effect.exit, Effect.forkChild),
            ScopedCache.get(cache, "test").pipe(Effect.exit, Effect.forkChild)
          ])

          yield* TestClock.adjust(Duration.millis(100))

          const results = yield* Effect.all(fibers.map(Fiber.join))

          assert.strictEqual(lookupCount, 1)
          assert.deepStrictEqual(results, [
            Exit.fail("error"),
            Exit.fail("error"),
            Exit.fail("error")
          ])
        }))

      it.effect("resource cleanup for failed entries", () =>
        Effect.gen(function*() {
          const resourceTracker: Array<string> = []

          const cache = yield* ScopedCache.make({
            capacity: 2,
            lookup: (key: string) =>
              Effect.gen(function*() {
                yield* Effect.acquireRelease(
                  Effect.sync(() => resourceTracker.push(`acquired-${key}`)),
                  () => Effect.sync(() => resourceTracker.push(`released-${key}`))
                )
                return yield* Effect.fail(`error-${key}`)
              })
          })

          yield* Effect.exit(ScopedCache.get(cache, "fail1"))
          yield* Effect.exit(ScopedCache.get(cache, "fail2"))
          assert.deepStrictEqual(resourceTracker, ["acquired-fail1", "acquired-fail2"])

          // Adding third failed entry should evict first
          yield* Effect.exit(ScopedCache.get(cache, "fail3"))
          assert.deepStrictEqual(resourceTracker, [
            "acquired-fail1",
            "acquired-fail2",
            "released-fail1",
            "acquired-fail3"
          ])
        }))
    })
  })

  describe("scope integration", () => {
    describe("resource management", () => {
      it.effect("resources are properly scoped to cache entries", () =>
        Effect.gen(function*() {
          const resourceTracker: Array<string> = []

          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: Effect.fnUntraced(function*(key: string) {
              yield* Effect.acquireRelease(
                Effect.sync(() => resourceTracker.push(`acquired-${key}`)),
                () => Effect.sync(() => resourceTracker.push(`released-${key}`))
              )
              return `value-${key}`
            })
          })

          yield* ScopedCache.get(cache, "test")
          assert.deepStrictEqual(resourceTracker, ["acquired-test"])

          // Resource is still alive while cached
          yield* ScopedCache.get(cache, "test")
          assert.deepStrictEqual(resourceTracker, ["acquired-test"])
        }))

      it.effect("resources are cleaned up when entries are evicted", () =>
        Effect.gen(function*() {
          const resourceTracker: Array<string> = []

          const cache = yield* ScopedCache.make({
            capacity: 2,
            lookup: (key: string) =>
              Effect.gen(function*() {
                yield* Effect.acquireRelease(
                  Effect.sync(() => resourceTracker.push(`acquired-${key}`)),
                  () => Effect.sync(() => resourceTracker.push(`released-${key}`))
                )
                return `value-${key}`
              })
          })

          yield* ScopedCache.get(cache, "a")
          yield* ScopedCache.get(cache, "b")
          assert.deepStrictEqual(resourceTracker, ["acquired-a", "acquired-b"])

          // Adding third entry should evict first and clean up its resource
          yield* ScopedCache.get(cache, "c")
          assert.deepStrictEqual(resourceTracker, ["acquired-a", "acquired-b", "released-a", "acquired-c"])
        }))

      it.effect("resources are cleaned up when cache is closed", () =>
        Effect.gen(function*() {
          const resourceTracker: Array<string> = []
          const cache = yield* Effect.scoped(
            Effect.gen(function*() {
              const cache = yield* ScopedCache.make({
                capacity: 10,
                lookup: (key: string) =>
                  Effect.gen(function*() {
                    yield* Effect.acquireRelease(
                      Effect.sync(() => resourceTracker.push(`acquired-${key}`)),
                      () => Effect.sync(() => resourceTracker.push(`released-${key}`))
                    )
                    return `value-${key}`
                  })
              })

              yield* ScopedCache.get(cache, "test1")
              yield* ScopedCache.get(cache, "test2")
              assert.deepStrictEqual(resourceTracker, ["acquired-test1", "acquired-test2"])

              return cache
            })
          )

          // After scope closes, all resources should be cleaned up
          assert.strictEqual(cache.state._tag, "Closed")
          assert.deepStrictEqual(resourceTracker.sort(), [
            "acquired-test1",
            "acquired-test2",
            "released-test1",
            "released-test2"
          ])
        }))

      it.effect("resources are cleaned up when entries expire", () =>
        Effect.gen(function*() {
          const resourceTracker: Array<string> = []

          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) =>
              Effect.gen(function*() {
                yield* Effect.acquireRelease(
                  Effect.sync(() => resourceTracker.push(`acquired-${key}`)),
                  () => Effect.sync(() => resourceTracker.push(`released-${key}`))
                )
                return `value-${key}`
              }),
            timeToLive: "1 hour"
          })

          yield* ScopedCache.get(cache, "test")
          assert.deepStrictEqual(resourceTracker, ["acquired-test"])

          yield* TestClock.adjust("2 hours")

          // Accessing expired entry should clean up resource
          yield* ScopedCache.has(cache, "test")
          assert.deepStrictEqual(resourceTracker, ["acquired-test", "released-test"])
        }))

      it.effect("resources are cleaned up when entries are invalidated", () =>
        Effect.gen(function*() {
          const resourceTracker: Array<string> = []

          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) =>
              Effect.gen(function*() {
                yield* Effect.acquireRelease(
                  Effect.sync(() => resourceTracker.push(`acquired-${key}`)),
                  () => Effect.sync(() => resourceTracker.push(`released-${key}`))
                )
                return `value-${key}`
              })
          })

          yield* ScopedCache.get(cache, "test")
          assert.deepStrictEqual(resourceTracker, ["acquired-test"])

          yield* ScopedCache.invalidate(cache, "test")
          assert.deepStrictEqual(resourceTracker, ["acquired-test", "released-test"])
        }))

      it.effect("resource cleanup is atomic and doesn't leak", () =>
        Effect.gen(function*() {
          const resourceTracker: Array<string> = []
          const cache = yield* ScopedCache.make({
            capacity: 3,
            lookup: (key: string) =>
              Effect.gen(function*() {
                yield* Effect.acquireRelease(
                  Effect.sync(() => resourceTracker.push(`acquired-${key}`)),
                  () => Effect.sync(() => resourceTracker.push(`released-${key}`))
                )
                return `value-${key}`
              })
          })

          // Fill cache
          yield* ScopedCache.get(cache, "a")
          yield* ScopedCache.get(cache, "b")
          yield* ScopedCache.get(cache, "c")

          // Multiple operations that should trigger cleanup
          yield* Effect.all([
            ScopedCache.invalidate(cache, "a"),
            ScopedCache.refresh(cache, "b"),
            ScopedCache.set(cache, "c", "new-value"),
            ScopedCache.get(cache, "d")
          ], { concurrency: "unbounded" })

          // Verify all resources were properly acquired and released
          const acquired = resourceTracker.filter((r) => r.startsWith("acquired")).length
          const released = resourceTracker.filter((r) => r.startsWith("released")).length

          assert.strictEqual(acquired, 5)
          assert.strictEqual(released, 3)
          assert.strictEqual(yield* ScopedCache.size(cache), 3)
        }))
    })

    describe("scope lifecycle", () => {
      it.effect("cache becomes closed when parent scope is closed", () =>
        Effect.gen(function*() {
          const cache = yield* Effect.scoped(
            Effect.gen(function*() {
              const cache = yield* ScopedCache.make({
                capacity: 10,
                lookup: (key: string) => Effect.succeed(key.length)
              })
              assert.strictEqual(cache.state._tag, "Open")
              yield* ScopedCache.get(cache, "test")
              return cache
            })
          )

          // After scope closure, cache should be closed
          assert.strictEqual(cache.state._tag, "Closed")
        }))

      it.effect("resource cleanup happens in correct order during cache closure", () =>
        Effect.gen(function*() {
          const cleanupOrder: Array<string> = []

          yield* Effect.scoped(
            Effect.gen(function*() {
              const cache = yield* ScopedCache.make({
                capacity: 10,
                lookup: (key: string) =>
                  Effect.gen(function*() {
                    yield* Effect.acquireRelease(
                      Effect.sync(() => cleanupOrder.push(`acquired-${key}`)),
                      () => Effect.sync(() => cleanupOrder.push(`released-${key}`))
                    )
                    return `value-${key}`
                  })
              })

              yield* ScopedCache.get(cache, "first")
              yield* ScopedCache.get(cache, "second")
              yield* ScopedCache.get(cache, "third")

              assert.deepStrictEqual(cleanupOrder, ["acquired-first", "acquired-second", "acquired-third"])
            })
          )

          // All resources should be cleaned up after scope closure
          const releases = cleanupOrder.filter((item) => item.startsWith("released"))
          assert.strictEqual(releases.length, 3)
          assert.isTrue(releases.includes("released-first"))
          assert.isTrue(releases.includes("released-second"))
          assert.isTrue(releases.includes("released-third"))
        }))
    })
  })

  // TODO: Service context tests are commented out due to TypeScript issues with Context
  // These tests are failing due to complex service dependency injection features
  // that may not be fully implemented in ScopedCache
  describe("service context", () => {
    describe("Service Dependency Injection", () => {
      it.effect("services are available in lookup functions", () =>
        Effect.gen(function*() {
          class ConfigService extends Context.Service<ConfigService, { multiplier: number }>()("ConfigService") {}

          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) =>
              Effect.gen(function*() {
                const config = yield* ConfigService
                return key.length * config.multiplier
              })
          }).pipe(
            Effect.provideService(ConfigService, ConfigService.of({ multiplier: 10 }))
          )

          const result = yield* ScopedCache.get(cache, "test")

          assert.strictEqual(result, 40) // "test".length * 10
        }))

      it.effect("requireServicesAt: 'lookup' provides services at lookup time", () =>
        Effect.gen(function*() {
          class CounterService extends Context.Service<CounterService, { value: number }>()("CounterService") {}

          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (_key: string) => Effect.map(CounterService, (service) => service.value),
            requireServicesAt: "lookup"
          })

          const result1 = yield* ScopedCache.get(cache, "test").pipe(
            Effect.provideService(CounterService, CounterService.of({ value: 42 }))
          )

          const result2 = yield* ScopedCache.get(cache, "another").pipe(
            Effect.provideService(CounterService, CounterService.of({ value: 100 }))
          )

          // Same key with different service context
          const result3 = yield* ScopedCache.get(cache, "test").pipe(
            Effect.provideService(CounterService, CounterService.of({ value: 200 }))
          )

          assert.strictEqual(result1, 42)
          assert.strictEqual(result2, 100)
          assert.strictEqual(result3, 42) // Cached value from first lookup
        }))
    })
  })

  describe("integration tests", () => {
    describe("TestClock Integration", () => {
      it.effect("multiple time advances work correctly", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.length),
            timeToLive: "1 hour"
          })

          yield* ScopedCache.get(cache, "test")

          // Multiple small advances
          for (let i = 0; i < 10; i++) {
            yield* TestClock.adjust("5 minutes")
            assert.isTrue(yield* ScopedCache.has(cache, "test"))
          }

          // Final advance to expire
          yield* TestClock.adjust("15 minutes")
          assert.isFalse(yield* ScopedCache.has(cache, "test"))
        }))

      it.effect("resource cleanup timing is correct", () =>
        Effect.gen(function*() {
          const cleanupTimes: Array<{ key: string; time: number }> = []

          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) =>
              Effect.gen(function*() {
                yield* Effect.acquireRelease(
                  Effect.void,
                  () =>
                    Effect.gen(function*() {
                      const time = yield* Clock.currentTimeMillis
                      cleanupTimes.push({ key, time })
                    })
                )
                return key.length
              }),
            timeToLive: "1 hour"
          })

          const startTime = yield* Clock.currentTimeMillis

          yield* ScopedCache.get(cache, "a")
          yield* TestClock.adjust("30 minutes")
          yield* ScopedCache.get(cache, "b")

          yield* TestClock.adjust("35 minutes") // "a" should expire
          yield* ScopedCache.has(cache, "a") // Trigger cleanup

          yield* TestClock.adjust("30 minutes") // "b" should expire
          yield* ScopedCache.has(cache, "b") // Trigger cleanup

          assert.strictEqual(cleanupTimes.length, 2)
          assert.strictEqual(cleanupTimes[0].key, "a")
          assert.strictEqual(cleanupTimes[0].time, startTime + 65 * 60 * 1000)
          assert.strictEqual(cleanupTimes[1].key, "b")
          assert.strictEqual(cleanupTimes[1].time, startTime + 95 * 60 * 1000)
        }))
    })

    describe("Different Key Types", () => {
      it.effect("string keys work correctly", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) => Effect.succeed(key.toUpperCase())
          })

          yield* ScopedCache.set(cache, "hello", "HELLO!")
          const result1 = yield* ScopedCache.get(cache, "hello")
          const result2 = yield* ScopedCache.get(cache, "world")

          assert.strictEqual(result1, "HELLO!")
          assert.strictEqual(result2, "WORLD")
        }))

      it.effect("number keys work correctly", () =>
        Effect.gen(function*() {
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: number) => Effect.succeed(key * key)
          })

          yield* ScopedCache.set(cache, 5, 25)
          const result1 = yield* ScopedCache.get(cache, 5)
          const result2 = yield* ScopedCache.get(cache, 7)

          assert.strictEqual(result1, 25)
          assert.strictEqual(result2, 49)
        }))

      it.effect("complex object keys work correctly", () =>
        Effect.gen(function*() {
          class CacheKey extends Data.Class<{
            userId: string
            productId: number
          }> {}

          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: CacheKey) => Effect.succeed(`${key.userId}-${key.productId}`)
          })

          const key1 = new CacheKey({ userId: "user1", productId: 100 })
          const key2 = new CacheKey({ userId: "user2", productId: 200 })

          const result1 = yield* ScopedCache.get(cache, key1)
          const result2 = yield* ScopedCache.get(cache, key2)

          assert.strictEqual(result1, "user1-100")
          assert.strictEqual(result2, "user2-200")

          const key1Copy = new CacheKey({ userId: "user1", productId: 100 })
          const hasCopy = yield* ScopedCache.has(cache, key1Copy)
          assert.isTrue(hasCopy)
        }))
    })
  })

  describe("concurrency tests", () => {
    it.effect("a get made while an abandoned lookup is finalizing starts a new lookup", () =>
      Effect.gen(function*() {
        let lookups = 0
        const started = yield* Latch.make()
        const finalizing = yield* Latch.make()
        const finishFinalizer = yield* Latch.make()
        const cache = yield* ScopedCache.make({
          capacity: 10,
          lookup: (_key: string) =>
            Effect.suspend(() => {
              if (++lookups > 1) return Effect.succeed(lookups)
              return started.open.pipe(
                Effect.andThen(Effect.never),
                Effect.onInterrupt(() => finalizing.open.pipe(Effect.andThen(finishFinalizer.await)))
              )
            })
        })

        const first = yield* ScopedCache.get(cache, "key").pipe(Effect.forkChild({ startImmediately: true }))
        yield* started.await
        const interruptFirst = yield* Fiber.interrupt(first).pipe(Effect.forkChild({ startImmediately: true }))
        yield* finalizing.await
        const fresh = yield* ScopedCache.get(cache, "key").pipe(Effect.forkChild({ startImmediately: true }))
        yield* finishFinalizer.open
        yield* Fiber.join(interruptFirst)

        assert.deepStrictEqual(yield* Fiber.await(fresh), Exit.succeed(2))
        assert.strictEqual(yield* ScopedCache.get(cache, "key"), 2)
        assert.strictEqual(lookups, 2)
      }))

    it.effect("a getOption waiter arriving during eviction keeps the lookup alive when the first caller leaves", () =>
      Effect.gen(function*() {
        const closing = yield* Latch.make()
        const close = yield* Latch.make()
        const started = yield* Latch.make()
        const finish = yield* Latch.make()
        const cache = yield* ScopedCache.make({
          capacity: 1,
          lookup: (key: string) =>
            Effect.gen(function*() {
              if (key === "a") {
                yield* Effect.acquireRelease(Effect.void, () => closing.open.pipe(Effect.andThen(close.await)))
                return 1
              }
              yield* started.open
              yield* finish.await
              return 42
            })
        })

        yield* ScopedCache.get(cache, "a")
        const first = yield* ScopedCache.get(cache, "b").pipe(Effect.forkChild({ startImmediately: true }))
        yield* closing.await
        const second = yield* ScopedCache.getOption(cache, "b").pipe(Effect.forkChild({ startImmediately: true }))
        yield* close.open
        yield* started.await
        yield* Effect.yieldNow
        yield* Fiber.interrupt(first)
        yield* finish.open

        assert.deepStrictEqual(yield* Fiber.await(second), Exit.succeed(Option.some(42)))
        assert.strictEqual(yield* ScopedCache.get(cache, "b"), 42)
      }))

    it.effect("interrupting the only caller during eviction releases its lookup", () =>
      Effect.gen(function*() {
        const closing = yield* Latch.make()
        const close = yield* Latch.make()
        const acquired = yield* Latch.make()
        let acquisitions = 0
        let releases = 0
        const cache = yield* ScopedCache.make({
          capacity: 1,
          lookup: (key: string) =>
            Effect.gen(function*() {
              if (key === "a") {
                yield* Effect.acquireRelease(Effect.void, () =>
                  Effect.gen(function*() {
                    yield* closing.open
                    yield* close.await
                  }))
                return 1
              }
              yield* Effect.acquireRelease(Effect.sync(() => acquisitions++), () => Effect.sync(() => releases++))
              yield* acquired.open
              return yield* Effect.never
            })
        })

        yield* ScopedCache.get(cache, "a")
        const caller = yield* ScopedCache.get(cache, "b").pipe(Effect.forkChild({ startImmediately: true }))
        yield* closing.await
        const interrupt = yield* Fiber.interrupt(caller).pipe(Effect.forkChild({ startImmediately: true }))
        yield* Effect.yieldNow
        yield* close.open
        yield* acquired.await
        yield* Fiber.join(interrupt)

        assert.strictEqual(acquisitions, 1)
        assert.strictEqual(releases, 1)
        assert.strictEqual(yield* ScopedCache.size(cache), 0)
      }))

    it.effect("an interrupt during eviction does not strand a pending lookup", () =>
      Effect.gen(function*() {
        const closing = yield* Latch.make()
        const close = yield* Latch.make()
        const acquired = yield* Latch.make()
        let acquisitions = 0
        let releases = 0
        const cache = yield* ScopedCache.make({
          capacity: 1,
          lookup: (key: string) =>
            Effect.gen(function*() {
              if (key === "a") {
                yield* Effect.acquireRelease(Effect.void, () =>
                  Effect.gen(function*() {
                    yield* closing.open
                    yield* close.await
                  }))
                return 1
              }
              yield* Effect.acquireRelease(Effect.sync(() => acquisitions++), () => Effect.sync(() => releases++))
              yield* acquired.open
              return yield* Effect.never
            })
        })

        yield* ScopedCache.get(cache, "a")
        const first = yield* ScopedCache.get(cache, "b").pipe(Effect.forkChild({ startImmediately: true }))
        yield* closing.await
        const interruptFirst = yield* Fiber.interrupt(first).pipe(Effect.forkChild({ startImmediately: true }))
        yield* Effect.yieldNow
        yield* close.open
        yield* acquired.await
        const second = yield* ScopedCache.get(cache, "b").pipe(Effect.forkChild({ startImmediately: true }))
        yield* Effect.yieldNow
        yield* Fiber.interrupt(second)
        yield* Fiber.join(interruptFirst)

        assert.isAbove(acquisitions, 0)
        assert.strictEqual(releases, acquisitions)
        assert.strictEqual(yield* ScopedCache.size(cache), 0)
      }))

    it.effect("an interrupted get does not poison a getOption waiter", () =>
      Effect.gen(function*() {
        const started = yield* Latch.make()
        const finish = yield* Latch.make()
        const cache = yield* ScopedCache.make({
          capacity: 10,
          lookup: (_key: string) => Effect.andThen(started.open, Effect.as(finish.await, 42))
        })
        const first = yield* ScopedCache.get(cache, "key").pipe(Effect.forkChild({ startImmediately: true }))
        yield* started.await
        const second = yield* ScopedCache.getOption(cache, "key").pipe(Effect.forkChild({ startImmediately: true }))
        yield* Effect.yieldNow
        yield* Fiber.interrupt(first)
        yield* finish.open

        assert.deepStrictEqual(yield* Fiber.await(second), Exit.succeed(Option.some(42)))
      }))

    it.effect("an interrupted get does not poison an invalidateWhen waiter", () =>
      Effect.gen(function*() {
        const started = yield* Latch.make()
        const finish = yield* Latch.make()
        const cache = yield* ScopedCache.make({
          capacity: 10,
          lookup: (_key: string) => Effect.andThen(started.open, Effect.as(finish.await, 42))
        })
        const first = yield* ScopedCache.get(cache, "key").pipe(Effect.forkChild({ startImmediately: true }))
        yield* started.await
        const waiter = yield* ScopedCache.invalidateWhen(cache, "key", () => false).pipe(
          Effect.forkChild({ startImmediately: true })
        )
        yield* Effect.yieldNow
        yield* Fiber.interrupt(first)
        yield* finish.open

        assert.deepStrictEqual(yield* Fiber.await(waiter), Exit.succeed(false))
        assert.strictEqual(yield* ScopedCache.get(cache, "key"), 42)
      }))

    it.effect("an interrupted refresh does not poison a get joining its new entry", () =>
      Effect.gen(function*() {
        const started = yield* Latch.make()
        const finish = yield* Latch.make()
        const cache = yield* ScopedCache.make({
          capacity: 10,
          lookup: (_key: string) => Effect.andThen(started.open, Effect.as(finish.await, 42))
        })
        const refresh = yield* ScopedCache.refresh(cache, "key").pipe(Effect.forkChild({ startImmediately: true }))
        yield* started.await
        const get = yield* ScopedCache.get(cache, "key").pipe(Effect.forkChild({ startImmediately: true }))
        yield* Effect.yieldNow
        yield* Fiber.interrupt(refresh)
        yield* finish.open

        assert.deepStrictEqual(yield* Fiber.await(get), Exit.succeed(42))
      }))

    it.effect("an abandoned get reports defects from its scope finalizer", () =>
      Effect.gen(function*() {
        const acquired = yield* Latch.make()
        const cache = yield* ScopedCache.make({
          capacity: 10,
          lookup: (_key: string) =>
            Effect.gen(function*() {
              yield* Effect.acquireRelease(Effect.void, () => Effect.die("finalizer defect"))
              yield* acquired.open
              return yield* Effect.never
            })
        })
        const get = yield* ScopedCache.get(cache, "key").pipe(Effect.forkChild({ startImmediately: true }))
        yield* acquired.await
        yield* Fiber.interrupt(get)
        const exit = yield* Fiber.await(get)
        assert.isTrue(Exit.isFailure(exit))
        if (Exit.isFailure(exit)) {
          assert.isTrue(exit.cause.reasons.some(Cause.isDieReason))
        }
      }))

    it.effect("an interrupted first get does not poison another pending get", () =>
      Effect.gen(function*() {
        const started = yield* Latch.make()
        const finish = yield* Latch.make()
        let lookups = 0
        const cache = yield* ScopedCache.make({
          capacity: 10,
          lookup: (_key: string) =>
            Effect.gen(function*() {
              lookups++
              yield* started.open
              yield* finish.await
              return 42
            })
        })

        const first = yield* ScopedCache.get(cache, "key").pipe(Effect.forkChild({ startImmediately: true }))
        yield* started.await
        const second = yield* ScopedCache.get(cache, "key").pipe(Effect.forkChild({ startImmediately: true }))
        yield* Fiber.interrupt(first)
        yield* finish.open

        assert.deepStrictEqual(yield* Fiber.await(second), Exit.succeed(42))
        assert.strictEqual(yield* ScopedCache.get(cache, "key"), 42)
        assert.strictEqual(lookups, 1)
      }))

    it.effect("the last interrupted get releases its resource and allows a new lookup", () =>
      Effect.gen(function*() {
        const acquired = yield* Latch.make()
        let lookups = 0
        let releases = 0
        const cache = yield* ScopedCache.make({
          capacity: 10,
          lookup: (_key: string) =>
            Effect.gen(function*() {
              lookups++
              if (lookups === 1) {
                yield* Effect.acquireRelease(Effect.void, () => Effect.sync(() => releases++))
                yield* acquired.open
                return yield* Effect.never
              }
              return 42
            })
        })

        const first = yield* ScopedCache.get(cache, "key").pipe(Effect.forkChild({ startImmediately: true }))
        yield* acquired.await
        yield* Fiber.interrupt(first)
        assert.strictEqual(releases, 1)
        assert.strictEqual(yield* ScopedCache.get(cache, "key"), 42)
        assert.strictEqual(lookups, 2)
      }))

    it.effect("an interrupted refresh cannot replace a usable entry or leak its scope", () =>
      Effect.gen(function*() {
        const acquired = yield* Latch.make()
        let lookups = 0
        const released: Array<number> = []
        const cache = yield* ScopedCache.make({
          capacity: 10,
          lookup: (_key: string) =>
            Effect.gen(function*() {
              const id = ++lookups
              yield* Effect.acquireRelease(Effect.void, () =>
                Effect.sync(() => {
                  released.push(id)
                }))
              if (id === 2) {
                yield* acquired.open
                return yield* Effect.never
              }
              return id
            })
        })

        assert.strictEqual(yield* ScopedCache.get(cache, "key"), 1)
        const refresh = yield* ScopedCache.refresh(cache, "key").pipe(Effect.forkChild({ startImmediately: true }))
        yield* acquired.await
        yield* Fiber.interrupt(refresh)

        assert.isTrue(released.includes(2))
        assert.strictEqual(yield* ScopedCache.get(cache, "key"), 1)
        assert.isFalse(released.includes(1))
      }))

    describe("Concurrent Resource Access", () => {
      it.effect("concurrent gets share same resource", () =>
        Effect.gen(function*() {
          let resourceCreationCount = 0
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) =>
              Effect.delay(Duration.millis(100))(
                Effect.sync(() => {
                  resourceCreationCount++
                  return `resource-${key}-${resourceCreationCount}`
                })
              )
          })

          const fibers = yield* Effect.all([
            ScopedCache.get(cache, "shared").pipe(Effect.forkChild),
            ScopedCache.get(cache, "shared").pipe(Effect.forkChild),
            ScopedCache.get(cache, "shared").pipe(Effect.forkChild),
            ScopedCache.get(cache, "shared").pipe(Effect.forkChild)
          ])

          yield* TestClock.adjust(Duration.millis(150))
          const results = yield* Effect.all(fibers.map(Fiber.join))

          assert.strictEqual(resourceCreationCount, 1)
          assert.isTrue(results.every((r) => r === "resource-shared-1"))
        }))

      it.effect("concurrent invalidations don't cause resource leaks", () =>
        Effect.gen(function*() {
          const activeResources: Set<string> = new Set()

          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) =>
              Effect.gen(function*() {
                const resourceId = `${key}-${Date.now()}-${Math.random()}`

                yield* Effect.acquireRelease(
                  Effect.sync(() => activeResources.add(resourceId)),
                  () => Effect.sync(() => activeResources.delete(resourceId))
                )

                return resourceId
              })
          })

          // Create initial resources
          yield* ScopedCache.get(cache, "key1")
          yield* ScopedCache.get(cache, "key2")
          yield* ScopedCache.get(cache, "key3")
          assert.strictEqual(activeResources.size, 3)

          // Concurrent invalidations
          yield* Effect.all([
            ScopedCache.invalidate(cache, "key1"),
            ScopedCache.invalidate(cache, "key2"),
            ScopedCache.invalidate(cache, "key3"),
            ScopedCache.invalidate(cache, "key1"), // Duplicate
            ScopedCache.invalidate(cache, "key2") // Duplicate
          ], { concurrency: "unbounded" })

          assert.strictEqual(activeResources.size, 0)
        }))

      it.effect("concurrent refresh operations don't interfere", () =>
        Effect.gen(function*() {
          let counter = 0
          const cache = yield* ScopedCache.make({
            capacity: 10,
            lookup: (key: string) =>
              Effect.delay(Duration.millis(50))(
                Effect.sync(() => `${key}-${++counter}`)
              )
          })

          // Initial population
          yield* ScopedCache.get(cache, "a").pipe(Effect.forkChild)
          yield* ScopedCache.get(cache, "b").pipe(Effect.forkChild)
          yield* TestClock.adjust(50)
          counter = 0 // Reset counter

          // Concurrent refreshes
          const fibers = yield* Effect.all([
            ScopedCache.refresh(cache, "a").pipe(Effect.forkChild),
            ScopedCache.refresh(cache, "b").pipe(Effect.forkChild),
            ScopedCache.refresh(cache, "a").pipe(Effect.forkChild),
            ScopedCache.refresh(cache, "b").pipe(Effect.forkChild)
          ])

          yield* TestClock.adjust(Duration.millis(100))
          const results = yield* Effect.all(fibers.map(Fiber.join))

          // Each refresh should get a unique value
          assert.deepStrictEqual(results, [
            "a-1", // First refresh
            "b-2", // Second refresh
            "a-3", // Third refresh
            "b-4" // Fourth refresh
          ])
          assert.strictEqual(counter, 4)
        }))
    })
  })
})

// Helper functions for testing
const makeScopedTestCache = (capacity: number, ttl?: Duration.Input) =>
  Effect.gen(function*() {
    let lookupCount = 0
    const lookupResults = new Map<string, Effect.Effect<number, string>>()

    const cache = yield* ScopedCache.make({
      capacity,
      lookup: (key: string) => {
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

// Helper for tracking resource cleanup
interface CleanupTracker {
  cleanedUp: Array<string>
  acquired: Array<string>
}

const makeManagedResourceCache = (capacity: number) =>
  Effect.gen(function*() {
    const cleanupTracker: CleanupTracker = {
      cleanedUp: [],
      acquired: []
    }

    const cache = yield* ScopedCache.make({
      capacity,
      lookup: (key: string) =>
        Effect.gen(function*() {
          yield* Effect.acquireRelease(
            Effect.sync(() => cleanupTracker.acquired.push(key)),
            () => Effect.sync(() => cleanupTracker.cleanedUp.push(key))
          )
          return `resource-${key}`
        })
    })

    return { cache, cleanupTracker }
  })
