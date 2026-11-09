/**
 * Caches values loaded by an Effect lookup function.
 *
 * A cache stores successful and failed lookup results, shares an in-progress
 * lookup when multiple callers request the same missing key, and limits entries
 * by capacity and optional time-to-live rules. This module includes helpers for
 * reading, setting, refreshing, invalidating, and inspecting cache contents.
 *
 * @stability stable
 * @since 4.0.0
 */
import * as Context from "./Context.ts"
import * as Duration from "./Duration.ts"
import type * as Effect from "./Effect.ts"
import type * as Exit from "./Exit.ts"
import type * as Fiber from "./Fiber.ts"
import { dual } from "./Function.ts"
import * as core from "./internal/core.ts"
import { PipeInspectableProto } from "./internal/core.ts"
import * as effect from "./internal/effect.ts"
import * as Iterable from "./Iterable.ts"
import * as MutableHashMap from "./MutableHashMap.ts"
import * as Option from "./Option.ts"
import type { Pipeable } from "./Pipeable.ts"
import type { Predicate } from "./Predicate.ts"
import * as Result from "./Result.ts"

const TypeId = "~effect/Cache"

/**
 * A cache interface that provides a mutable key-value store with automatic TTL management,
 * capacity limits, and lookup functions for cache misses.
 *
 * **Example** (Creating a basic cache)
 *
 * ```ts import.meta.vitest
 * import { Cache, Effect } from "effect"
 *
 * // Basic cache with string keys and number values
 * const program = Effect.gen(function*() {
 *   const cache = yield* Cache.make<string, number>({
 *     capacity: 100,
 *     lookup: (key: string) => Effect.succeed(key.length)
 *   })
 *
 *   // Cache operations
 *   const value1 = yield* Cache.get(cache, "hello") // 5
 *   const value2 = yield* Cache.get(cache, "world") // 5
 *   const value3 = yield* Cache.get(cache, "hello") // 5 (cached)
 *
 *   return [value1, value2, value3]
 * })
 *
 * const actual = await Effect.runPromise(program)
 * actual // => [5, 5, 5]
 * ```
 *
 * **Example** (Handling lookup failures)
 *
 * ```ts import.meta.vitest
 * import { Cache, Effect, Exit } from "effect"
 *
 * // Cache with error handling
 * const program = Effect.gen(function*() {
 *   const cache = yield* Cache.make<string, number, string>({
 *     capacity: 10,
 *     lookup: (key: string) =>
 *       key === "error"
 *         ? Effect.fail("Lookup failed")
 *         : Effect.succeed(key.length)
 *   })
 *
 *   // Handle successful and failed lookups
 *   const success = yield* Cache.get(cache, "test")
 *   const failure = yield* Effect.exit(Cache.get(cache, "error"))
 *
 *   return [success, failure] as const
 * })
 *
 * const actual = await Effect.runPromise(program)
 * actual // => [4, Exit.fail("Lookup failed")]
 * ```
 *
 * **Example** (Using complex keys with TTL)
 *
 * ```ts import.meta.vitest
 * import { Cache, Data, Duration, Effect } from "effect"
 *
 * // Cache with complex key types and TTL
 * class UserId extends Data.Class<{ id: number }> {}
 *
 * const program = Effect.gen(function*() {
 *   const userCache = yield* Cache.make<UserId, string>({
 *     capacity: 1000,
 *     lookup: (userId: UserId) => Effect.succeed(`User-${userId.id}`),
 *     timeToLive: Duration.minutes(5)
 *   })
 *
 *   const userId = new UserId({ id: 123 })
 *   const userName = yield* Cache.get(userCache, userId)
 *
 *   return userName
 * })
 *
 * const actual = await Effect.runPromise(program)
 * actual // => "User-123"
 * ```
 *
 * @stability stable
 * @category models
 * @since 2.0.0
 */
export interface Cache<in out Key, in out A, in out E = never, out R = never> extends Pipeable {
  readonly [TypeId]: typeof TypeId
  readonly map: MutableHashMap.MutableHashMap<Key, Entry<A, E>>
  readonly capacity: number
  readonly lookup: (key: Key) => Effect.Effect<A, E, R>
  readonly timeToLive: (exit: Exit.Exit<A, E>, key: Key) => Duration.Duration
}

/**
 * Represents a low-level cache entry containing a deferred lookup result and
 * an optional expiration timestamp.
 *
 * **When to use**
 *
 * Use when inspecting a `Cache`'s low-level map and you need the stored
 * deferred lookup result or expiration timestamp for a key.
 *
 * **Details**
 *
 * An `expiresAt` value of `undefined` means the entry does not expire.
 *
 * Pass the current fiber to `await` when calling it from inside
 * `Effect.withFiber`, so the waiter is counted and its cleanup registered in
 * that same step. Without it, `await` resolves the fiber itself.
 *
 * @see {@link Cache} for the public cache API that manages entries through
 * combinators
 *
 * @stability stable
 * @category models
 * @since 4.0.0
 */
export interface Entry<A, E> {
  expiresAt: number | undefined
  awaiters: number
  readonly fiber: Fiber.Fiber<A, E>
  await(this: Entry<A, E>, fiber?: Fiber.Fiber<unknown, unknown>): Effect.Effect<A, E>
}

/**
 * Creates a cache with dynamic time-to-live based on the result and key.
 *
 * **When to use**
 *
 * Use when you need different cache entry lifetimes based on the lookup result
 * or key characteristics.
 *
 * **Details**
 *
 * The timeToLive function receives both the exit result and the key, allowing
 * for flexible TTL policies based on success/failure state and key characteristics.
 *
 * **Example** (Configuring dynamic time to live)
 *
 * ```ts import.meta.vitest
 * import { Cache, Effect, Exit } from "effect"
 *
 * // Cache with TTL based on computed value
 * const program = Effect.gen(function*() {
 *   const cache = yield* Cache.makeWith(
 *     (id: number) => Effect.succeed({ id, active: id % 2 === 0 }),
 *     {
 *       capacity: 1000,
 *       timeToLive(exit) {
 *         if (Exit.isSuccess(exit)) {
 *           const user = exit.value
 *           return user.active ? "1 hour" : "5 minutes"
 *         }
 *         return "30 seconds"
 *       }
 *     }
 *   )
 *
 *   return cache.capacity
 * })
 *
 * const actual = await Effect.runPromise(program)
 * actual // => 1000
 * ```
 *
 * @see {@link make} for a simpler cache constructor with a fixed time-to-live for all entries
 * @stability stable
 * @category constructors
 * @since 2.0.0
 */
export const makeWith = <
  Key,
  A,
  E = never,
  R = never,
  ServiceMode extends "lookup" | "construction" = never
>(lookup: (key: Key) => Effect.Effect<A, E, R>, options: {
  readonly capacity: number
  readonly timeToLive?: ((exit: Exit.Exit<A, E>, key: Key) => Duration.Input) | undefined
  readonly requireServicesAt?: ServiceMode | undefined
}): Effect.Effect<
  Cache<Key, A, E, "lookup" extends ServiceMode ? R : never>,
  never,
  "lookup" extends ServiceMode ? never : R
> =>
  effect.contextWith((context: Context.Context<any>) => {
    const self = Object.create(Proto)
    self.lookup = (key: Key): Effect.Effect<A, E> =>
      effect.updateContext(
        lookup(key),
        (input) => Context.merge(context, input)
      )
    self.map = MutableHashMap.make()
    self.capacity = options.capacity
    self.timeToLive = options.timeToLive
      ? (exit: Exit.Exit<A, E>, key: Key) => Duration.fromInputUnsafe(options.timeToLive!(exit, key))
      : defaultTimeToLive
    return effect.succeed(self as Cache<Key, A, E>)
  })

/**
 * Creates a cache with a fixed time-to-live for all entries.
 *
 * **Details**
 *
 * This is the basic cache constructor where all entries share the same TTL.
 * The lookup function will be called when a key is not found or has expired.
 *
 * **Example** (Creating a basic cache)
 *
 * ```ts import.meta.vitest
 * import { Cache, Effect } from "effect"
 *
 * // Basic cache with string keys
 * const program = Effect.gen(function*() {
 *   const cache = yield* Cache.make<string, number>({
 *     capacity: 100,
 *     lookup: (key) => Effect.succeed(key.length)
 *   })
 *
 *   const result1 = yield* Cache.get(cache, "hello")
 *   const result2 = yield* Cache.get(cache, "world")
 *   return { result1, result2 }
 * })
 *
 * const actual = await Effect.runPromise(program)
 * actual // => { result1: 5, result2: 5 }
 * ```
 *
 * **Example** (Creating a cache with TTL)
 *
 * ```ts import.meta.vitest
 * import { Cache, Effect } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const users = new Map([
 *     [123, { name: "Ada", email: "ada@example.com" }],
 *     [456, { name: "Grace", email: "grace@example.com" }]
 *   ])
 *
 *   const cache = yield* Cache.make<
 *     number,
 *     { name: string; email: string },
 *     string
 *   >({
 *     capacity: 500,
 *     lookup: (userId) =>
 *       Effect.suspend(() => {
 *         const user = users.get(userId)
 *         return user === undefined
 *           ? Effect.fail(`User ${userId} not found`)
 *           : Effect.succeed(user)
 *       }),
 *     timeToLive: "15 minutes"
 *   })
 *
 *   const user1 = yield* Cache.get(cache, 123)
 *   const user2 = yield* Cache.get(cache, 123)
 *   return [user1, user2, user1 === user2] as const
 * })
 *
 * const actual = await Effect.runPromise(program)
 * actual // => [{ name: "Ada", email: "ada@example.com" }, { name: "Ada", email: "ada@example.com" }, true]
 * ```
 *
 * @stability stable
 * @category constructors
 * @since 2.0.0
 */
export const make = <
  Key,
  A,
  E = never,
  R = never,
  ServiceMode extends "lookup" | "construction" = never
>(
  options: {
    readonly lookup: (key: Key) => Effect.Effect<A, E, R>
    readonly capacity: number
    readonly timeToLive?: Duration.Input | undefined
    readonly requireServicesAt?: ServiceMode | undefined
  }
): Effect.Effect<
  Cache<Key, A, E, "lookup" extends ServiceMode ? R : never>,
  never,
  "lookup" extends ServiceMode ? never : R
> =>
  makeWith<Key, A, E, R, ServiceMode>(options.lookup, {
    ...options,
    timeToLive: options.timeToLive !== undefined ? () => options.timeToLive! : defaultTimeToLive
  })

const Proto = {
  ...PipeInspectableProto,
  [TypeId]: TypeId,
  toJSON(this: Cache<any, any, any>) {
    return {
      _id: "Cache",
      capacity: this.capacity,
      map: this.map
    }
  }
}

const defaultTimeToLive = <A, E>(_: Exit.Exit<A, E>, _key: unknown): Duration.Duration => Duration.infinity

/**
 * Retrieves the value for a key, invoking the lookup function on a cache miss
 * or expired entry.
 *
 * **Details**
 *
 * Concurrent `get` calls for the same missing key share the same pending
 * lookup. The cache stores the lookup `Exit`, so failed lookups are cached and
 * will fail again until the entry expires, is invalidated, or is refreshed.
 *
 * **Example** (Getting cached values)
 *
 * ```ts import.meta.vitest
 * import { Cache, Effect } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const cache = yield* Cache.make({
 *     capacity: 10,
 *     lookup: (key: string) => Effect.succeed(key.length)
 *   })
 *
 *   // Cache miss - triggers lookup function
 *   const result1 = yield* Cache.get(cache, "hello")
 *
 *   // Cache hit - returns cached value without lookup
 *   const result2 = yield* Cache.get(cache, "hello")
 *
 *   return { result1, result2 }
 * })
 *
 * const actual = await Effect.runPromise(program)
 * actual // => { result1: 5, result2: 5 }
 * ```
 *
 * **Example** (Handling lookup failures)
 *
 * ```ts import.meta.vitest
 * import { Cache, Effect, Exit } from "effect"
 *
 * // Error handling when lookup fails
 * const program = Effect.gen(function*() {
 *   const cache = yield* Cache.make<string, number, string>({
 *     capacity: 10,
 *     lookup: (key: string) =>
 *       key === "error"
 *         ? Effect.fail("Lookup failed")
 *         : Effect.succeed(key.length)
 *   })
 *
 *   // Successful lookup
 *   const success = yield* Cache.get(cache, "hello")
 *
 *   // Failed lookup - returns error
 *   const failure = yield* Effect.exit(Cache.get(cache, "error"))
 *   return [success, failure] as const
 * })
 *
 * const actual = await Effect.runPromise(program)
 * actual // => [5, Exit.fail("Lookup failed")]
 * ```
 *
 * **Example** (Sharing concurrent lookups)
 *
 * ```ts import.meta.vitest
 * import { Cache, Effect } from "effect"
 *
 * // Concurrent access - multiple gets of same key only invoke lookup once
 * const program = Effect.gen(function*() {
 *   let lookupCount = 0
 *   const cache = yield* Cache.make({
 *     capacity: 10,
 *     lookup: (key: string) =>
 *       Effect.sync(() => {
 *         lookupCount++
 *         return key.length
 *       })
 *   })
 *
 *   // Multiple concurrent gets
 *   const results = yield* Effect.all([
 *     Cache.get(cache, "hello"),
 *     Cache.get(cache, "hello"),
 *     Cache.get(cache, "hello")
 *   ], { concurrency: "unbounded" })
 *
 *   return { results, lookupCount }
 * })
 *
 * const actual = await Effect.runPromise(program)
 * actual // => { results: [5, 5, 5], lookupCount: 1 }
 * ```
 *
 * @stability stable
 * @category combinators
 * @since 4.0.0
 */
export const get: {
  <Key, A>(key: Key): <E, R>(self: Cache<Key, A, E, R>) => Effect.Effect<A, E, R>
  <Key, A, E, R>(self: Cache<Key, A, E, R>, key: Key): Effect.Effect<A, E, R>
} = dual(
  2,
  <Key, A, E, R>(self: Cache<Key, A, E, R>, key: Key): Effect.Effect<A, E, R> =>
    core.withFiber((fiber) => {
      const oentry = MutableHashMap.get(self.map, key)
      if (Option.isSome(oentry)) {
        MutableHashMap.remove(self.map, key)
        if (!hasExpired(oentry.value, fiber)) {
          // Move the entry to the end of the map to keep it fresh
          MutableHashMap.set(self.map, key, oentry.value)
          return oentry.value.await(fiber)
        }
      }
      const entry = new EntryImpl(fiber, self.lookup(key))
      entry.onInterrupt = () => removeEntry(self, key, entry)
      let skipCache = false
      entry.fiber.addObserver((exit) => {
        // Release the key once the lookup can no longer be interrupted.
        entry.onInterrupt = undefined
        if (effect.exitHasInterrupts(exit)) {
          removeEntry(self, key, entry)
          return
        }
        const ttl = self.timeToLive(exit, key)
        if (Duration.isZero(ttl)) {
          skipCache = true
          removeEntry(self, key, entry)
        } else if (Duration.isFinite(ttl)) {
          entry.expiresAt = fiber.getRef(effect.ClockRef).currentTimeMillisUnsafe() + Duration.toMillis(ttl)
        }
      })
      const exit = entry.fiber.pollUnsafe()
      if (!skipCache && (exit === undefined || !effect.exitHasInterrupts(exit))) {
        MutableHashMap.set(self.map, key, entry)
      }
      if (Number.isFinite(self.capacity)) {
        checkCapacity(self)
      }
      return entry.await(fiber)
    })
)

class EntryImpl<A, E> implements Entry<A, E> {
  expiresAt: number | undefined
  awaiters: number
  fiber: Fiber.Fiber<A, E>
  onInterrupt: (() => void) | undefined

  constructor(
    parent: Fiber.Fiber<unknown, unknown>,
    valueEffect: Effect.Effect<A, E, any>
  ) {
    this.fiber = effect.forkUnsafe(parent, valueEffect, true, true)
    this.awaiters = 0
    this.expiresAt = undefined
  }

  await(fiber?: Fiber.Fiber<unknown, unknown>): Effect.Effect<A, E> {
    if (fiber === undefined) return core.withFiber((fiber) => this.await(fiber))
    const exit = this.fiber.pollUnsafe()
    if (exit) return exit
    this.awaiters++
    // Register cleanup in the same evaluation as the increment, before interruption
    // can prevent the returned join effect from starting.
    effect.onExitUnsafe(fiber, () => {
      this.awaiters--
      if (this.awaiters > 0 || this.fiber.pollUnsafe()) return effect.void
      // Detach before interrupting so new lookups do not join the abandoned fiber
      // while its finalizers run.
      this.onInterrupt?.()
      return effect.fiberInterrupt(this.fiber)
    })
    return effect.fiberJoin(this.fiber)
  }
}

const removeEntry = <Key, A, E, R>(self: Cache<Key, A, E, R>, key: Key, entry: Entry<A, E>): void => {
  const current = MutableHashMap.get(self.map, key)
  if (Option.isSome(current) && current.value === entry) {
    MutableHashMap.remove(self.map, key)
  }
}

const hasExpired = <A, E>(entry: Entry<A, E>, fiber: Fiber.Fiber<unknown, unknown>): boolean => {
  if (entry.expiresAt === undefined) {
    return false
  }
  return fiber.getRef(effect.ClockRef).currentTimeMillisUnsafe() >= entry.expiresAt
}

const checkCapacity = <K, A, E, R>(self: Cache<K, A, E, R>) => {
  let diff = MutableHashMap.size(self.map) - self.capacity
  if (diff <= 0) return
  // MutableHashMap has insertion order, so we can remove the oldest entries
  for (const [key] of self.map) {
    MutableHashMap.remove(self.map, key)
    diff--
    if (diff === 0) return
  }
}

/**
 * Reads an existing cache entry without invoking the lookup function.
 *
 * **Details**
 *
 * Returns `Option.none()` when the key is missing or expired, and `Option.some`
 * when a cached lookup has succeeded. If the entry is still pending, waits for
 * it to complete. If the cached or pending lookup fails, this effect fails with
 * the same error.
 *
 * **Example** (Reading cached values without lookup)
 *
 * ```ts import.meta.vitest
 * import { Cache, Effect, Option } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const cache = yield* Cache.make({
 *     capacity: 10,
 *     lookup: (key: string) => Effect.succeed(key.length)
 *   })
 *
 *   // No value in cache yet - returns None without lookup
 *   const empty = yield* Cache.getOption(cache, "hello")
 *
 *   // Populate cache using get
 *   yield* Cache.get(cache, "hello")
 *
 *   // Now getOption returns the cached value
 *   const cached = yield* Cache.getOption(cache, "hello")
 *   return [empty, cached] as const
 * })
 *
 * const actual = await Effect.runPromise(program)
 * actual // => [Option.none(), Option.some(5)]
 * ```
 *
 * **Example** (Skipping expired entries)
 *
 * ```ts import.meta.vitest
 * import { Cache, Effect, Option } from "effect"
 * import { TestClock } from "effect/testing"
 *
 * // Expired entries return None
 * const program = Effect.gen(function*() {
 *   const cache = yield* Cache.make({
 *     capacity: 10,
 *     lookup: (key: string) => Effect.succeed(key.length),
 *     timeToLive: "1 hour"
 *   })
 *
 *   // Add value to cache
 *   yield* Cache.get(cache, "hello")
 *
 *   // Value exists before expiration
 *   const beforeExpiry = yield* Cache.getOption(cache, "hello")
 *
 *   // Simulate time passing
 *   yield* TestClock.adjust("2 hours")
 *
 *   // Value expired - returns None
 *   const afterExpiry = yield* Cache.getOption(cache, "hello")
 *   return [beforeExpiry, afterExpiry] as const
 * })
 *
 * const actual = await Effect.runPromise(Effect.provide(program, TestClock.layer()))
 * actual // => [Option.some(5), Option.none()]
 * ```
 *
 * **Example** (Waiting for pending lookups)
 *
 * ```ts import.meta.vitest
 * import { Cache, Deferred, Effect, Fiber, Option } from "effect"
 *
 * // Waits for ongoing computation to complete
 * const program = Effect.gen(function*() {
 *   const deferred = yield* Deferred.make<void>()
 *   const cache = yield* Cache.make({
 *     capacity: 10,
 *     lookup: (_key: string) => Deferred.await(deferred).pipe(Effect.as(42))
 *   })
 *
 *   // Start lookup in background
 *   const getFiber = yield* Effect.forkChild(Cache.get(cache, "key"))
 *
 *   // getOption waits for ongoing computation
 *   const optionFiber = yield* Effect.forkChild(Cache.getOption(cache, "key"))
 *
 *   // Complete the computation
 *   yield* Deferred.succeed(deferred, void 0)
 *
 *   const result = yield* Fiber.join(optionFiber)
 *   const value = yield* Fiber.join(getFiber)
 *   return [result, value] as const
 * })
 *
 * const actual = await Effect.runPromise(program)
 * actual // => [Option.some(42), 42]
 * ```
 *
 * @stability stable
 * @category combinators
 * @since 4.0.0
 */
export const getOption: {
  <Key, A>(key: Key): <E, R>(self: Cache<Key, A, E, R>) => Effect.Effect<Option.Option<A>, E>
  <Key, A, E, R>(self: Cache<Key, A, E, R>, key: Key): Effect.Effect<Option.Option<A>, E>
} = dual(
  2,
  <Key, A, E, R>(self: Cache<Key, A, E, R>, key: Key): Effect.Effect<Option.Option<A>, E> =>
    core.withFiber((fiber) => {
      const entry = getImpl(self, key, fiber)
      return entry ? effect.asSome(entry.await(fiber)) : effect.succeedNone
    })
)

const getImpl = <Key, A, E, R>(
  self: Cache<Key, A, E, R>,
  key: Key,
  fiber: Fiber.Fiber<any, any>,
  isRead = true
): Entry<A, E> | undefined => {
  const oentry = MutableHashMap.get(self.map, key)
  if (Option.isNone(oentry)) {
    return undefined
  } else if (hasExpired(oentry.value, fiber)) {
    MutableHashMap.remove(self.map, key)
    return undefined
  } else if (isRead) {
    MutableHashMap.remove(self.map, key)
    MutableHashMap.set(self.map, key, oentry.value)
  }
  return oentry.value
}

/**
 * Retrieves the value associated with the specified key from the cache, only if
 * it contains a resolved successful value.
 *
 * **Details**
 *
 * This checks only an existing non-expired entry. It returns `Option.some` when
 * the entry has already resolved successfully, and `Option.none` for missing,
 * expired, failed, or still-pending entries.
 *
 * @see {@link get} for triggering or awaiting the cache lookup
 * @see {@link getOption} for reading an existing entry as an optional effect
 *
 * @stability stable
 * @category combinators
 * @since 4.0.0
 */
export const getSuccess: {
  <Key, A, R>(key: Key): <E>(self: Cache<Key, A, E, R>) => Effect.Effect<Option.Option<A>>
  <Key, A, E, R>(self: Cache<Key, A, E, R>, key: Key): Effect.Effect<Option.Option<A>>
} = dual(
  2,
  <Key, A, E, R>(self: Cache<Key, A, E, R>, key: Key): Effect.Effect<Option.Option<A>> =>
    core.withFiber((fiber) => {
      const exit = getImpl(self, key, fiber)?.fiber.pollUnsafe()
      if (exit && effect.exitIsSuccess(exit)) {
        return effect.succeedSome(exit.value)
      }
      return effect.succeedNone
    })
)

/**
 * Sets the value associated with the specified key in the cache. This will
 * overwrite any existing value for that key, skipping the lookup function.
 *
 * **Example** (Setting values directly)
 *
 * ```ts import.meta.vitest
 * import { Cache, Effect } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const cache = yield* Cache.make({
 *     capacity: 100,
 *     lookup: (key: string) => Effect.succeed(key.length)
 *   })
 *
 *   // Set a value directly without invoking lookup
 *   yield* Cache.set(cache, "hello", 42)
 *   return yield* Cache.get(cache, "hello")
 * })
 *
 * const actual = await Effect.runPromise(program)
 * actual // => 42
 * ```
 *
 * **Example** (Overwriting cached values)
 *
 * ```ts import.meta.vitest
 * import { Cache, Effect } from "effect"
 *
 * // Overwriting existing cached values
 * const program = Effect.gen(function*() {
 *   const cache = yield* Cache.make({
 *     capacity: 100,
 *     lookup: (key: string) => Effect.succeed(key.length)
 *   })
 *
 *   // First get populates via lookup
 *   const original = yield* Cache.get(cache, "test") // 4
 *
 *   // Set overwrites the cached value
 *   yield* Cache.set(cache, "test", 999)
 *   const updated = yield* Cache.get(cache, "test") // 999
 *
 *   return { original, updated }
 * })
 *
 * const actual = await Effect.runPromise(program)
 * actual // => { original: 4, updated: 999 }
 * ```
 *
 * **Example** (Applying TTL to set values)
 *
 * ```ts import.meta.vitest
 * import { Cache, Effect } from "effect"
 * import { TestClock } from "effect/testing"
 *
 * // TTL behavior with set operations
 * const program = Effect.gen(function*() {
 *   const cache = yield* Cache.make({
 *     capacity: 100,
 *     lookup: (key: string) => Effect.succeed(key.length),
 *     timeToLive: "1 hour"
 *   })
 *
 *   // Set value with TTL applied
 *   yield* Cache.set(cache, "temporary", 123)
 *   const beforeExpiry = yield* Cache.has(cache, "temporary")
 *
 *   // Advance time past TTL
 *   yield* TestClock.adjust("2 hours")
 *   const afterExpiry = yield* Cache.has(cache, "temporary")
 *   return [beforeExpiry, afterExpiry]
 * })
 *
 * const actual = await Effect.runPromise(Effect.provide(program, TestClock.layer()))
 * actual // => [true, false]
 * ```
 *
 * **Example** (Enforcing capacity when setting values)
 *
 * ```ts import.meta.vitest
 * import { Cache, Effect } from "effect"
 *
 * // Capacity enforcement with set operations
 * const program = Effect.gen(function*() {
 *   const cache = yield* Cache.make({
 *     capacity: 2,
 *     lookup: (key: string) => Effect.succeed(key.length)
 *   })
 *
 *   // Fill cache to capacity
 *   yield* Cache.set(cache, "a", 1)
 *   yield* Cache.set(cache, "b", 2)
 *   const sizeBeforeEviction = yield* Cache.size(cache)
 *
 *   // Adding another entry evicts oldest
 *   yield* Cache.set(cache, "c", 3)
 *   const sizeAfterEviction = yield* Cache.size(cache)
 *   const hasOldest = yield* Cache.has(cache, "a")
 *   const hasNewest = yield* Cache.has(cache, "c")
 *   return [sizeBeforeEviction, sizeAfterEviction, hasOldest, hasNewest]
 * })
 *
 * const actual = await Effect.runPromise(program)
 * actual // => [2, 2, false, true]
 * ```
 *
 * @stability stable
 * @category combinators
 * @since 4.0.0
 */
export const set: {
  <Key, A>(key: Key, value: A): <E, R>(self: Cache<Key, A, E, R>) => Effect.Effect<void>
  <Key, A, E, R>(self: Cache<Key, A, E, R>, key: Key, value: A): Effect.Effect<void>
} = dual(
  3,
  <Key, A, E, R>(self: Cache<Key, A, E, R>, key: Key, value: A): Effect.Effect<void> =>
    core.withFiber((fiber) => {
      const exit = core.exitSucceed(value)
      const entry = new EntryImpl(fiber, exit)
      const ttl = self.timeToLive(exit, key)
      if (Duration.isZero(ttl)) {
        MutableHashMap.remove(self.map, key)
        return effect.void
      }
      entry.expiresAt = Duration.isFinite(ttl)
        ? fiber.getRef(effect.ClockRef).currentTimeMillisUnsafe() + Duration.toMillis(ttl)
        : undefined
      MutableHashMap.set(self.map, key, entry)
      checkCapacity(self)
      return effect.void
    })
)

/**
 * Checks whether the cache contains an entry for the specified key.
 *
 * **Details**
 *
 * This checks for an existing non-expired entry without invoking the cache
 * lookup function. Expired entries are treated as absent.
 *
 * **Example** (Checking for cached keys)
 *
 * ```ts import.meta.vitest
 * import { Cache, Effect } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const cache = yield* Cache.make({
 *     capacity: 100,
 *     lookup: (key: string) => Effect.succeed(key.length)
 *   })
 *
 *   // Check non-existent key
 *   const missing = yield* Cache.has(cache, "missing")
 *
 *   // Add entry and check existence
 *   yield* Cache.get(cache, "hello")
 *   const present = yield* Cache.has(cache, "hello")
 *   return [missing, present]
 * })
 *
 * const actual = await Effect.runPromise(program)
 * actual // => [false, true]
 * ```
 *
 * **Example** (Checking TTL expiration)
 *
 * ```ts import.meta.vitest
 * import { Cache, Effect } from "effect"
 * import { TestClock } from "effect/testing"
 *
 * // TTL expiration behavior
 * const program = Effect.gen(function*() {
 *   const cache = yield* Cache.make({
 *     capacity: 100,
 *     lookup: (key: string) => Effect.succeed(key.length),
 *     timeToLive: "1 hour"
 *   })
 *
 *   // Add entry with TTL
 *   yield* Cache.get(cache, "expires")
 *   const initial = yield* Cache.has(cache, "expires")
 *
 *   // Still valid before expiration
 *   yield* TestClock.adjust("30 minutes")
 *   const beforeExpiry = yield* Cache.has(cache, "expires")
 *
 *   // Expired after TTL
 *   yield* TestClock.adjust("31 minutes")
 *   const afterExpiry = yield* Cache.has(cache, "expires")
 *   return [initial, beforeExpiry, afterExpiry]
 * })
 *
 * const actual = await Effect.runPromise(Effect.provide(program, TestClock.layer()))
 * actual // => [true, true, false]
 * ```
 *
 * **Example** (Checking multiple keys)
 *
 * ```ts import.meta.vitest
 * import { Cache, Effect } from "effect"
 *
 * // Checking multiple keys efficiently
 * const program = Effect.gen(function*() {
 *   const cache = yield* Cache.make({
 *     capacity: 100,
 *     lookup: (key: string) => Effect.succeed(key.length)
 *   })
 *
 *   // Populate some entries
 *   yield* Cache.set(cache, "apple", 5)
 *   yield* Cache.set(cache, "banana", 6)
 *
 *   // Check multiple keys
 *   const keys = ["apple", "banana", "cherry", "date"]
 *   const results: Array<string> = []
 *   for (const key of keys) {
 *     const exists = yield* Cache.has(cache, key)
 *     results.push(`${key}: ${exists}`)
 *   }
 *   return results
 * })
 *
 * const actual = await Effect.runPromise(program)
 * actual // => ["apple: true", "banana: true", "cherry: false", "date: false"]
 * ```
 *
 * @stability stable
 * @category combinators
 * @since 4.0.0
 */
export const has: {
  <Key, A>(key: Key): <E, R>(self: Cache<Key, A, E, R>) => Effect.Effect<boolean>
  <Key, A, E, R>(self: Cache<Key, A, E, R>, key: Key): Effect.Effect<boolean>
} = dual(
  2,
  <Key, A, E>(self: Cache<Key, A, E>, key: Key): Effect.Effect<boolean> =>
    core.withFiber((fiber) => {
      const oentry = getImpl(self, key, fiber, false)
      return effect.succeed(oentry !== undefined)
    })
)

/**
 * Invalidates the entry associated with the specified key in the cache.
 *
 * **Example** (Invalidating cached entries)
 *
 * ```ts import.meta.vitest
 * import { Cache, Effect } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const cache = yield* Cache.make({
 *     capacity: 10,
 *     lookup: (key: string) => Effect.succeed(key.length)
 *   })
 *
 *   // Add a value to the cache
 *   yield* Cache.get(cache, "hello")
 *   const beforeInvalidation = yield* Cache.has(cache, "hello")
 *
 *   // Invalidate the entry
 *   yield* Cache.invalidate(cache, "hello")
 *   const afterInvalidation = yield* Cache.has(cache, "hello")
 *
 *   // Invalidating non-existent keys doesn't error
 *   yield* Cache.invalidate(cache, "nonexistent")
 *
 *   // Get after invalidation will invoke lookup again
 *   let lookupCount = 0
 *   const cache2 = yield* Cache.make({
 *     capacity: 10,
 *     lookup: (key: string) =>
 *       Effect.sync(() => {
 *         lookupCount++
 *         return key.length
 *       })
 *   })
 *
 *   yield* Cache.get(cache2, "test") // lookupCount = 1
 *   yield* Cache.invalidate(cache2, "test")
 *   yield* Cache.get(cache2, "test") // lookupCount = 2 (lookup called again)
 *   return { beforeInvalidation, afterInvalidation, lookupCount }
 * })
 *
 * const actual = await Effect.runPromise(program)
 * actual // => { beforeInvalidation: true, afterInvalidation: false, lookupCount: 2 }
 * ```
 *
 * @stability stable
 * @category combinators
 * @since 4.0.0
 */
export const invalidate: {
  <Key, A>(key: Key): <E, R>(self: Cache<Key, A, E, R>) => Effect.Effect<void>
  <Key, A, E, R>(self: Cache<Key, A, E, R>, key: Key): Effect.Effect<void>
} = dual(2, <Key, A, E, R>(self: Cache<Key, A, E, R>, key: Key): Effect.Effect<void> =>
  effect.sync(() => {
    MutableHashMap.remove(self.map, key)
  }))

/**
 * Invalidates the entry associated with the specified key in the cache when the
 * predicate returns true for the cached value.
 *
 * **Example** (Invalidating entries conditionally)
 *
 * ```ts import.meta.vitest
 * import { Cache, Effect } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const cache = yield* Cache.make({
 *     capacity: 10,
 *     lookup: (key: string) => Effect.succeed(key.length)
 *   })
 *
 *   // Add values to the cache
 *   yield* Cache.get(cache, "hello") // value = 5
 *   yield* Cache.get(cache, "hi") // value = 2
 *
 *   // Invalidate when value equals 5
 *   const invalidated1 = yield* Cache.invalidateWhen(
 *     cache,
 *     "hello",
 *     (value) => value === 5
 *   )
 *   const hasHello = yield* Cache.has(cache, "hello")
 *
 *   // Don't invalidate when predicate doesn't match
 *   const invalidated2 = yield* Cache.invalidateWhen(
 *     cache,
 *     "hi",
 *     (value) => value === 5
 *   )
 *   const hasHi = yield* Cache.has(cache, "hi")
 *
 *   // Returns false for non-existent keys
 *   const invalidated3 = yield* Cache.invalidateWhen(
 *     cache,
 *     "nonexistent",
 *     () => true
 *   )
 *
 *   // Returns false for failed cached values
 *   const cacheWithErrors = yield* Cache.make<string, number, string>({
 *     capacity: 10,
 *     lookup: (key: string) =>
 *       key === "fail" ? Effect.fail("error") : Effect.succeed(key.length)
 *   })
 *
 *   yield* Effect.exit(Cache.get(cacheWithErrors, "fail"))
 *   const invalidated4 = yield* Cache.invalidateWhen(
 *     cacheWithErrors,
 *     "fail",
 *     () => true
 *   )
 *   return [invalidated1, hasHello, invalidated2, hasHi, invalidated3, invalidated4]
 * })
 *
 * const actual = await Effect.runPromise(program)
 * actual // => [true, false, false, true, false, false]
 * ```
 *
 * @stability stable
 * @category combinators
 * @since 4.0.0
 */
export const invalidateWhen: {
  <Key, A>(key: Key, f: Predicate<A>): <E, R>(self: Cache<Key, A, E, R>) => Effect.Effect<boolean>
  <Key, A, E, R>(self: Cache<Key, A, E, R>, key: Key, f: Predicate<A>): Effect.Effect<boolean>
} = dual(
  3,
  <Key, A, E, R>(self: Cache<Key, A, E, R>, key: Key, f: Predicate<A>): Effect.Effect<boolean> =>
    core.withFiber((fiber) => {
      const oentry = getImpl(self, key, fiber, false)
      if (oentry === undefined) {
        return effect.succeed(false)
      }
      return oentry.await(fiber).pipe(
        effect.map((value) => {
          if (f(value)) {
            const current = MutableHashMap.get(self.map, key)
            if (Option.isNone(current) || current.value !== oentry) {
              return false
            }
            MutableHashMap.remove(self.map, key)
            return true
          }
          return false
        }),
        effect.catchCause(() => effect.succeed(false))
      )
    })
)

/**
 * Forces a refresh of the value associated with the specified key in the cache.
 *
 * **Details**
 *
 * It will always invoke the lookup function to construct a new value,
 * overwriting any existing value for that key.
 *
 * **Example** (Refreshing cached values)
 *
 * ```ts import.meta.vitest
 * import { Cache, Effect } from "effect"
 *
 * // Force refresh of existing cached values
 * const program = Effect.gen(function*() {
 *   let counter = 0
 *   const cache = yield* Cache.make({
 *     capacity: 10,
 *     lookup: (key: string) => Effect.sync(() => `${key}-${++counter}`)
 *   })
 *
 *   // Initial cache population
 *   const value1 = yield* Cache.get(cache, "user")
 *
 *   // Get from cache (no lookup)
 *   const value2 = yield* Cache.get(cache, "user")
 *
 *   // Force refresh - always calls lookup
 *   const refreshed = yield* Cache.refresh(cache, "user")
 *
 *   // Subsequent gets return refreshed value
 *   const value3 = yield* Cache.get(cache, "user")
 *   return [value1, value2, refreshed, value3, counter]
 * })
 *
 * const actual = await Effect.runPromise(program)
 * actual // => ["user-1", "user-1", "user-2", "user-2", 2]
 * ```
 *
 * **Example** (Resetting TTL on refresh)
 *
 * ```ts import.meta.vitest
 * import { Cache, Effect } from "effect"
 * import { TestClock } from "effect/testing"
 *
 * // Refresh resets TTL (Time To Live)
 * const program = Effect.gen(function*() {
 *   const cache = yield* Cache.make({
 *     capacity: 10,
 *     lookup: (key: string) => Effect.succeed(key.length),
 *     timeToLive: "1 hour"
 *   })
 *
 *   yield* Cache.get(cache, "test")
 *   yield* TestClock.adjust("45 minutes")
 *
 *   // Entry would normally expire in 15 minutes
 *   const beforeRefresh = yield* Cache.has(cache, "test")
 *
 *   // Refresh resets the TTL to full 1 hour
 *   yield* Cache.refresh(cache, "test")
 *   yield* TestClock.adjust("30 minutes")
 *
 *   // Still valid because TTL was reset
 *   const afterRefresh = yield* Cache.has(cache, "test")
 *   return [beforeRefresh, afterRefresh]
 * })
 *
 * const actual = await Effect.runPromise(Effect.provide(program, TestClock.layer()))
 * actual // => [true, true]
 * ```
 *
 * **Example** (Refreshing missing keys)
 *
 * ```ts import.meta.vitest
 * import { Cache, Effect } from "effect"
 *
 * // Refresh non-existent keys
 * const program = Effect.gen(function*() {
 *   const cache = yield* Cache.make({
 *     capacity: 10,
 *     lookup: (key: string) => Effect.succeed(`value-for-${key}`)
 *   })
 *
 *   // Refresh non-existent key creates new entry
 *   const result = yield* Cache.refresh(cache, "newKey")
 *
 *   // Verify it's now cached
 *   const cached = yield* Cache.has(cache, "newKey")
 *   return [result, cached]
 * })
 *
 * const actual = await Effect.runPromise(program)
 * actual // => ["value-for-newKey", true]
 * ```
 *
 * @stability stable
 * @category combinators
 * @since 4.0.0
 */
export const refresh: {
  <Key, A>(key: Key): <E, R>(self: Cache<Key, A, E, R>) => Effect.Effect<A, E, R>
  <Key, A, E, R>(self: Cache<Key, A, E, R>, key: Key): Effect.Effect<A, E, R>
} = dual(
  2,
  <Key, A, E, R>(self: Cache<Key, A, E, R>, key: Key): Effect.Effect<A, E, R> =>
    core.withFiber((fiber) => {
      const entry = new EntryImpl(fiber, self.lookup(key))
      entry.onInterrupt = () => removeEntry(self, key, entry)
      const existing = getImpl(self, key, fiber, false) !== undefined
      if (!existing) {
        MutableHashMap.set(self.map, key, entry)
        checkCapacity(self)
      }
      entry.fiber.addObserver((exit) => {
        // Release the key once the lookup can no longer be interrupted.
        entry.onInterrupt = undefined
        if (effect.exitHasInterrupts(exit)) {
          removeEntry(self, key, entry)
          return
        }
        const ttl = self.timeToLive(exit, key)
        if (Duration.isZero(ttl)) {
          if (existing) MutableHashMap.remove(self.map, key)
          else removeEntry(self, key, entry)
          return effect.void
        }
        entry.expiresAt = Duration.isFinite(ttl)
          ? fiber.getRef(effect.ClockRef).currentTimeMillisUnsafe() + Duration.toMillis(ttl)
          : undefined
        if (existing) {
          MutableHashMap.set(self.map, key, entry)
          checkCapacity(self)
        }
      })
      return entry.await(fiber)
    })
)

/**
 * Invalidates all entries in the cache.
 *
 * **Example** (Invalidating all entries)
 *
 * ```ts import.meta.vitest
 * import { Cache, Effect } from "effect"
 *
 * // Clear all cached entries at once
 * const program = Effect.gen(function*() {
 *   const cache = yield* Cache.make({
 *     capacity: 10,
 *     lookup: (key: string) => Effect.succeed(key.length)
 *   })
 *
 *   // Populate cache with multiple entries
 *   yield* Cache.get(cache, "apple")
 *   yield* Cache.get(cache, "banana")
 *   yield* Cache.get(cache, "cherry")
 *
 *   const sizeBeforeInvalidation = yield* Cache.size(cache)
 *   const hasAppleBeforeInvalidation = yield* Cache.has(cache, "apple")
 *
 *   // Clear all entries
 *   yield* Cache.invalidateAll(cache)
 *
 *   // Verify cache is empty
 *   const sizeAfterInvalidation = yield* Cache.size(cache)
 *   const hasAppleAfterInvalidation = yield* Cache.has(cache, "apple")
 *   const hasBananaAfterInvalidation = yield* Cache.has(cache, "banana")
 *   const hasCherryAfterInvalidation = yield* Cache.has(cache, "cherry")
 *   return [
 *     sizeBeforeInvalidation,
 *     hasAppleBeforeInvalidation,
 *     sizeAfterInvalidation,
 *     hasAppleAfterInvalidation,
 *     hasBananaAfterInvalidation,
 *     hasCherryAfterInvalidation
 *   ]
 * })
 *
 * const actual = await Effect.runPromise(program)
 * actual // => [3, true, 0, false, false, false]
 * ```
 *
 * @stability stable
 * @category combinators
 * @since 4.0.0
 */
export const invalidateAll = <Key, A, E, R>(self: Cache<Key, A, E, R>): Effect.Effect<void> =>
  effect.sync(() => {
    MutableHashMap.clear(self.map)
  })

/**
 * Retrieves the approximate number of entries in the cache.
 *
 * **Details**
 *
 * Note that expired entries are counted until they are accessed and removed.
 * The size reflects the current number of entries stored, not the number
 * of valid entries.
 *
 * **Example** (Reading cache size)
 *
 * ```ts import.meta.vitest
 * import { Cache, Effect } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const cache = yield* Cache.make({
 *     capacity: 10,
 *     lookup: (key: string) => Effect.succeed(key.length)
 *   })
 *
 *   // Empty cache has size 0
 *   const emptySize = yield* Cache.size(cache)
 *
 *   // Add entries and check size
 *   yield* Cache.get(cache, "hello")
 *   yield* Cache.get(cache, "world")
 *   const sizeAfterAdding = yield* Cache.size(cache)
 *
 *   // Size decreases after invalidation
 *   yield* Cache.invalidate(cache, "hello")
 *   const sizeAfterInvalidation = yield* Cache.size(cache)
 *   return [emptySize, sizeAfterAdding, sizeAfterInvalidation]
 * })
 *
 * const actual = await Effect.runPromise(program)
 * actual // => [0, 2, 1]
 * ```
 *
 * @stability stable
 * @category combinators
 * @since 4.0.0
 */
export const size = <Key, A, E, R>(self: Cache<Key, A, E, R>): Effect.Effect<number> =>
  effect.sync(() => MutableHashMap.size(self.map))

/**
 * Retrieves all active keys from the cache, automatically filtering out expired entries.
 *
 * **Example** (Reading active keys)
 *
 * ```ts import.meta.vitest
 * import { Cache, Effect } from "effect"
 *
 * // Basic key enumeration
 * const program = Effect.gen(function*() {
 *   const cache = yield* Cache.make({
 *     capacity: 10,
 *     lookup: (key: string) => Effect.succeed(key.length)
 *   })
 *
 *   // Add some entries to the cache
 *   yield* Cache.get(cache, "hello")
 *   yield* Cache.get(cache, "world")
 *   yield* Cache.get(cache, "cache")
 *
 *   // Retrieve all active keys
 *   const keys = yield* Cache.keys(cache)
 *   return Array.from(keys).sort()
 * })
 *
 * const actual = await Effect.runPromise(program)
 * actual // => ["cache", "hello", "world"]
 * ```
 *
 * @stability stable
 * @category combinators
 * @since 4.0.0
 */
export const keys = <Key, A, E, R>(self: Cache<Key, A, E, R>): Effect.Effect<Iterable<Key>> =>
  core.withFiber((fiber) => {
    const now = fiber.getRef(effect.ClockRef).currentTimeMillisUnsafe()
    return effect.succeed(Iterable.filterMap(self.map, ([key, entry]) => {
      if (entry.expiresAt === undefined || entry.expiresAt > now) {
        return Result.succeed(key)
      }
      MutableHashMap.remove(self.map, key)
      return Result.failVoid
    }))
  })

/**
 * Retrieves all successfully cached values from the cache, excluding failed
 * lookups and expired entries.
 *
 * **Example** (Reading all cached values)
 *
 * ```ts import.meta.vitest
 * import { Cache, Effect } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const cache = yield* Cache.make({
 *     capacity: 10,
 *     lookup: (key: string) => Effect.succeed(key.length)
 *   })
 *
 *   // Add some values to the cache
 *   yield* Cache.get(cache, "a")
 *   yield* Cache.get(cache, "ab")
 *   yield* Cache.get(cache, "abc")
 *
 *   // Retrieve all cached values
 *   const values = yield* Cache.values(cache)
 *   return Array.from(values).sort()
 * })
 *
 * const actual = await Effect.runPromise(program)
 * actual // => [1, 2, 3]
 * ```
 *
 * @stability stable
 * @category combinators
 * @since 4.0.0
 */
export const values = <Key, A, E, R>(self: Cache<Key, A, E, R>): Effect.Effect<Iterable<A>> =>
  effect.map(entries(self), Iterable.map(([, value]) => value))

/**
 * Retrieves all key-value pairs from the cache as an iterable. This function
 * only returns entries with successfully resolved values, filtering out any
 * failed lookups or expired entries.
 *
 * **Gotchas**
 *
 * Expired entries are removed from the cache while `entries` filters them out.
 *
 * @see {@link keys} for retrieving only cached keys
 * @see {@link values} for retrieving only cached values
 *
 * @stability stable
 * @category combinators
 * @since 4.0.0
 */
export const entries = <Key, A, E, R>(self: Cache<Key, A, E, R>): Effect.Effect<Iterable<[Key, A]>> =>
  core.withFiber((fiber) => {
    const now = fiber.getRef(effect.ClockRef).currentTimeMillisUnsafe()
    return effect.succeed(Iterable.filterMap(self.map, ([key, entry]) => {
      if (entry.expiresAt === undefined || entry.expiresAt > now) {
        const exit = entry.fiber.pollUnsafe()
        return exit && exit._tag === "Success"
          ? Result.succeed([key, exit.value])
          : Result.failVoid
      }
      MutableHashMap.remove(self.map, key)
      return Result.failVoid
    }))
  })
