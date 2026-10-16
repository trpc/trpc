/**
 * Caches values that need scoped resource management.
 *
 * Each cached entry owns its own `Scope`, so resources opened while creating a
 * value stay alive while that entry is cached and are released when the entry is
 * removed. A `ScopedCache` also belongs to an outer scope, which closes all
 * remaining entries when the cache is closed. Lookups for the same missing key
 * share one in-progress effect, and entries can expire, be refreshed, be
 * invalidated, or be evicted by capacity limits.
 *
 * @since 4.0.0
 */
import * as Arr from "./Array.ts"
import * as Cause from "./Cause.ts"
import * as Context from "./Context.ts"
import * as Deferred from "./Deferred.ts"
import * as Duration from "./Duration.ts"
import type * as Effect from "./Effect.ts"
import * as Exit from "./Exit.ts"
import * as Fiber from "./Fiber.ts"
import { dual, identity } from "./Function.ts"
import * as core from "./internal/core.ts"
import { PipeInspectableProto } from "./internal/core.ts"
import * as effect from "./internal/effect.ts"
import * as MutableHashMap from "./MutableHashMap.ts"
import * as Option from "./Option.ts"
import type { Pipeable } from "./Pipeable.ts"
import * as Predicate from "./Predicate.ts"
import * as Scope from "./Scope.ts"

const TypeId = "~effect/ScopedCache"

/**
 * A scoped cache whose values are acquired by a lookup effect and stored in
 * per-entry scopes.
 *
 * **When to use**
 *
 * Use to cache values that acquire scoped resources and must release those
 * resources when entries expire, are evicted, or are invalidated.
 *
 * **Details**
 *
 * Concurrent requests for the same key share the same in-flight lookup.
 * Entries can expire based on the lookup exit, are evicted when capacity is
 * exceeded, and release their entry scopes when invalidated, evicted, expired,
 * or when the cache's owning scope closes.
 *
 * @see {@link make} for creating a scoped cache with a fixed time-to-live
 * @see {@link makeWith} for creating a scoped cache with dynamic time-to-live
 *
 * @category models
 * @since 2.0.0
 */
export interface ScopedCache<in out Key, in out A, in out E = never, out R = never> extends Pipeable {
  readonly [TypeId]: typeof TypeId
  state: State<Key, A, E>
  readonly capacity: number
  readonly lookup: (key: Key) => Effect.Effect<A, E, R | Scope.Scope>
  readonly timeToLive: (exit: Exit.Exit<A, E>, key: Key) => Duration.Duration
}

/**
 * Represents whether a `ScopedCache` is open or closed.
 *
 * **When to use**
 *
 * Use when inspecting the low-level lifecycle state of a scoped cache.
 *
 * **Details**
 *
 * `Open` stores cached entries in access order for reuse and eviction.
 * `Closed` means the owning scope has closed and the cache can no longer
 * perform lookup operations.
 *
 * @category models
 * @since 4.0.0
 */
export type State<K, A, E> = {
  readonly _tag: "Open"
  readonly map: MutableHashMap.MutableHashMap<K, Entry<A, E>>
} | {
  readonly _tag: "Closed"
}

/**
 * A single scoped cache entry.
 *
 * **When to use**
 *
 * Use when inspecting the open state of a `ScopedCache` and you need the stored
 * deferred result, entry scope, or expiration timestamp for a key.
 *
 * **Details**
 *
 * The entry contains the deferred lookup result shared by readers, the scope
 * that owns resources acquired while computing the value, and an optional
 * expiration time in milliseconds. Removing the entry closes its scope.
 *
 * @see {@link State} for the open/closed cache state that stores entries by key
 *
 * @category models
 * @since 4.0.0
 */
export interface Entry<A, E> {
  expiresAt: number | undefined
  readonly deferred: Deferred.Deferred<A, E>
  readonly scope: Scope.Closeable
  awaiters: number
  fiber?: Fiber.Fiber<A, E>
}

/**
 * Creates a `ScopedCache` from a lookup function, maximum capacity, and a
 * time-to-live function computed from each lookup exit and key.
 *
 * **When to use**
 *
 * Use when you need a scoped cache whose entry lifetime depends on each lookup
 * result or key.
 *
 * **Details**
 *
 * The cache must be constructed in a `Scope`. Each lookup runs in its own entry
 * scope, and that scope is closed when the entry expires, is invalidated, is
 * evicted by capacity, or when the cache's owning scope closes.
 * `requireServicesAt` controls whether lookup services are captured at
 * construction time or required when lookup operations run.
 *
 * @see {@link make} for creating a scoped cache with one fixed time-to-live
 *
 * @category constructors
 * @since 2.0.0
 */
export const makeWith = <
  Key,
  A,
  E = never,
  R = never,
  ServiceMode extends "lookup" | "construction" = never
>(options: {
  readonly lookup: (key: Key) => Effect.Effect<A, E, R | Scope.Scope>
  readonly capacity: number
  readonly timeToLive?: ((exit: Exit.Exit<A, E>, key: Key) => Duration.Input) | undefined
  readonly requireServicesAt?: ServiceMode | undefined
}): Effect.Effect<
  ScopedCache<Key, A, E, "lookup" extends ServiceMode ? Exclude<R, Scope.Scope> : never>,
  never,
  ("lookup" extends ServiceMode ? never : R) | Scope.Scope
> =>
  effect.contextWith((context: Context.Context<any>) => {
    const scope = Context.get(context, Scope.Scope)
    const self = Object.create(Proto)
    self.lookup = (key: Key): Effect.Effect<A, E> =>
      effect.updateContext(
        options.lookup(key),
        (input) => Context.merge(context, input)
      )
    const map = MutableHashMap.empty<Key, Entry<A, E>>()
    self.state = { _tag: "Open", map }
    self.capacity = options.capacity
    self.timeToLive = options.timeToLive
      ? (exit: Exit.Exit<A, E>, key: Key) => Duration.fromInputUnsafe(options.timeToLive!(exit, key))
      : defaultTimeToLive
    return effect.as(
      Scope.addFinalizer(
        scope,
        core.withFiber((fiber) => {
          self.state = { _tag: "Closed" }
          return invalidateAllImpl(fiber, map)
        })
      ),
      self
    )
  })

/**
 * Creates a `ScopedCache` with a fixed time-to-live for every lookup result.
 *
 * **When to use**
 *
 * Use to create a scoped cache when every cached lookup result should share the
 * same lifetime.
 *
 * **Details**
 *
 * This is the constant-TTL variant of `makeWith`: values are acquired by the
 * lookup effect in per-entry scopes, capacity can evict older entries, and
 * entry scopes are closed when entries expire, are invalidated, are evicted, or
 * when the cache's owning scope closes.
 *
 * @see {@link makeWith} for computing time-to-live from each lookup result and key
 *
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
    readonly lookup: (key: Key) => Effect.Effect<A, E, R | Scope.Scope>
    readonly capacity: number
    readonly timeToLive?: Duration.Input | undefined
    readonly requireServicesAt?: ServiceMode | undefined
  }
): Effect.Effect<
  ScopedCache<Key, A, E, "lookup" extends ServiceMode ? Exclude<R, Scope.Scope> : never>,
  never,
  ("lookup" extends ServiceMode ? never : R) | Scope.Scope
> =>
  makeWith<Key, A, E, R, ServiceMode>({
    ...options,
    timeToLive: options.timeToLive !== undefined ? () => options.timeToLive! : defaultTimeToLive
  })

const Proto = {
  ...PipeInspectableProto,
  [TypeId]: TypeId,
  toJSON(this: ScopedCache<any, any, any>) {
    return {
      _id: "ScopedCache",
      capacity: this.capacity,
      state: this.state
    }
  }
}

const defaultTimeToLive = <A, E>(_: Exit.Exit<A, E>, _key: unknown): Duration.Duration => Duration.infinity

/**
 * Gets the value for a key, running the cache lookup when no unexpired entry is
 * present.
 *
 * **When to use**
 *
 * Use to retrieve a scoped cached value by key when a missing or expired entry
 * should run the cache lookup and share the in-flight lookup with concurrent
 * callers.
 *
 * **Details**
 *
 * Concurrent `get` calls for the same key share the same in-flight lookup.
 * Successful and failed lookup exits are cached according to the configured
 * TTL. If the cache is closed, the effect is interrupted.
 *
 * @see {@link getOption} for reading only when an unexpired entry is already cached
 * @see {@link getSuccess} for inspecting an already-completed successful entry
 * @see {@link refresh} for forcing a new lookup
 *
 * @category combinators
 * @since 4.0.0
 */
export const get: {
  <Key, A>(key: Key): <E, R>(self: ScopedCache<Key, A, E, R>) => Effect.Effect<A, E, R>
  <Key, A, E, R>(self: ScopedCache<Key, A, E, R>, key: Key): Effect.Effect<A, E, R>
} = dual(
  2,
  <Key, A, E, R>(self: ScopedCache<Key, A, E, R>, key: Key): Effect.Effect<A, E, R> =>
    effect.uninterruptibleMask((restore) =>
      core.withFiber((fiber) => {
        const state = self.state
        if (state._tag === "Closed") {
          return effect.interrupt
        }
        const oentry = MutableHashMap.get(state.map, key)
        if (Option.isSome(oentry) && !hasExpired(oentry.value, fiber)) {
          // Move the entry to the end of the map to keep it fresh
          MutableHashMap.remove(state.map, key)
          MutableHashMap.set(state.map, key, oentry.value)
          return awaitEntry(self, key, oentry.value, restore)
        }
        const scope = Scope.makeUnsafe()
        const deferred = Deferred.makeUnsafe<A, E>()
        const entry: Entry<A, E> = {
          expiresAt: undefined,
          deferred,
          scope,
          awaiters: 0
        }
        MutableHashMap.set(state.map, key, entry)
        return checkCapacity(fiber, state.map, self.capacity).pipe(
          Option.isSome(oentry) ? effect.flatMap(() => Scope.close(oentry.value.scope, effect.exitVoid)) : identity,
          effect.flatMap(() => {
            entry.fiber = effect.forkUnsafe(
              fiber,
              effect.onExit(effect.suspend(() => Scope.provide(self.lookup(key), scope)), (exit) => {
                if (effect.exitHasInterrupts(exit)) {
                  removeEntry(self, key, entry)
                  Deferred.doneUnsafe(deferred, exit)
                  return Scope.close(scope, exit)
                }
                try {
                  const ttl = self.timeToLive(exit, key)
                  if (Duration.isFinite(ttl)) {
                    entry.expiresAt = fiber.getRef(effect.ClockRef).currentTimeMillisUnsafe() + Duration.toMillis(ttl)
                  }
                } finally {
                  Deferred.doneUnsafe(deferred, exit)
                }
                return effect.void
              }),
              true,
              true
            )
            return awaitEntry(self, key, entry, restore)
          })
        )
      })
    )
)

const awaitEntry = <Key, A, E, R>(
  self: ScopedCache<Key, A, E, R>,
  key: Key,
  entry: Entry<A, E>,
  restore: <X, Y, Z>(effect: Effect.Effect<X, Y, Z>) => Effect.Effect<X, Y, Z>
): Effect.Effect<A, E> => {
  if (Deferred.isDoneUnsafe(entry.deferred)) return restore(Deferred.await(entry.deferred))
  entry.awaiters++
  // Install cleanup before restore so a pending interrupt cannot skip the decrement.
  return effect.onExit(restore(Deferred.await(entry.deferred)), () => {
    entry.awaiters--
    const fiber = entry.fiber
    if (entry.awaiters > 0 || fiber === undefined || Deferred.isDoneUnsafe(entry.deferred)) return effect.void
    // Detach before interruption so callers arriving during finalization start fresh.
    removeEntry(self, key, entry)
    return effect.flatMap(effect.fiberInterrupt(fiber), () => {
      const exit = fiber.pollUnsafe()!
      return Exit.isFailure(exit) && Cause.hasDies(exit.cause) ? effect.failCause(exit.cause) : effect.void
    })
  })
}

const removeEntry = <Key, A, E, R>(self: ScopedCache<Key, A, E, R>, key: Key, entry: Entry<A, E>): void => {
  if (self.state._tag !== "Open") return
  const current = MutableHashMap.get(self.state.map, key)
  if (Option.isSome(current) && current.value === entry) MutableHashMap.remove(self.state.map, key)
}

const hasExpired = <A, E>(entry: Entry<A, E>, fiber: Fiber.Fiber<unknown, unknown>): boolean => {
  if (entry.expiresAt === undefined) {
    return false
  }
  return fiber.getRef(effect.ClockRef).currentTimeMillisUnsafe() >= entry.expiresAt
}

const checkCapacity = <K, A, E>(
  parent: Fiber.Fiber<unknown, unknown>,
  map: MutableHashMap.MutableHashMap<K, Entry<A, E>>,
  capacity: number
): Effect.Effect<void> => {
  if (!Number.isFinite(capacity)) return effect.void
  let diff = MutableHashMap.size(map) - capacity
  if (diff <= 0) return effect.void
  // MutableHashMap has insertion order, so we can remove the oldest entries
  const fibers = Arr.empty<Fiber.Fiber<unknown, unknown>>()
  for (const [key, entry] of map) {
    MutableHashMap.remove(map, key)
    fibers.push(effect.forkUnsafe(parent as any, Scope.close(entry.scope, effect.exitVoid), true))
    diff--
    if (diff === 0) break
  }
  return effect.fiberAwaitAll(fibers)
}

/**
 * Reads an existing unexpired cache entry without running the lookup function.
 *
 * **When to use**
 *
 * Use to read a scoped value only when it is already cached, without starting
 * the lookup for missing or expired keys.
 *
 * **Details**
 *
 * Returns `Option.none` when the key is absent or expired. If an entry exists,
 * the effect waits for its cached result and returns `Option.some(value)` on
 * success, or fails with the cached lookup error.
 *
 * @see {@link get} for running the lookup on missing or expired keys
 * @see {@link getSuccess} for inspecting only already-completed successful entries
 *
 * @category combinators
 * @since 4.0.0
 */
export const getOption: {
  <Key, A>(key: Key): <E, R>(self: ScopedCache<Key, A, E, R>) => Effect.Effect<Option.Option<A>, E>
  <Key, A, E, R>(self: ScopedCache<Key, A, E, R>, key: Key): Effect.Effect<Option.Option<A>, E>
} = dual(
  2,
  <Key, A, E, R>(self: ScopedCache<Key, A, E, R>, key: Key): Effect.Effect<Option.Option<A>, E> =>
    effect.uninterruptibleMask((restore) =>
      core.withFiber((fiber) =>
        effect.flatMap(
          getImpl(self, key, fiber),
          (entry) => entry ? effect.asSome(awaitEntry(self, key, entry, restore)) : effect.succeedNone
        )
      )
    )
)

const getImpl = <Key, A, E, R>(
  self: ScopedCache<Key, A, E, R>,
  key: Key,
  fiber: Fiber.Fiber<any, any>,
  isRead = true
): Effect.Effect<Entry<A, E> | undefined> => {
  if (self.state._tag === "Closed") {
    return effect.interrupt
  }
  const state = self.state
  const oentry = MutableHashMap.get(state.map, key)
  if (Option.isNone(oentry)) {
    return effect.undefined
  } else if (hasExpired(oentry.value, fiber)) {
    MutableHashMap.remove(state.map, key)
    return effect.as(
      Scope.close(oentry.value.scope, effect.exitVoid),
      undefined
    )
  } else if (isRead) {
    MutableHashMap.remove(state.map, key)
    MutableHashMap.set(state.map, key, oentry.value)
  }
  return effect.succeed(oentry.value)
}

/**
 * Retrieves the value associated with the specified key from the cache, only if
 * it contains a resolved successful value.
 *
 * **When to use**
 *
 * Use to inspect an already-completed successful scoped cache entry without
 * running or awaiting the lookup effect.
 *
 * **Details**
 *
 * Returns `Option.some` for a resolved successful entry. Returns `Option.none`
 * for missing, expired, failed, or still-pending entries.
 *
 * @see {@link get} for awaiting or starting the lookup effect
 * @see {@link getOption} for awaiting an already-cached entry without starting a lookup
 *
 * @category combinators
 * @since 4.0.0
 */
export const getSuccess: {
  <Key, A, R>(key: Key): <E>(self: ScopedCache<Key, A, E, R>) => Effect.Effect<Option.Option<A>>
  <Key, A, E, R>(self: ScopedCache<Key, A, E, R>, key: Key): Effect.Effect<Option.Option<A>>
} = dual(
  2,
  <Key, A, E, R>(self: ScopedCache<Key, A, E, R>, key: Key): Effect.Effect<Option.Option<A>> =>
    effect.uninterruptible(
      core.withFiber((fiber) =>
        effect.map(
          getImpl(self, key, fiber),
          (entry) => {
            const exit = entry?.deferred.effect as Exit.Exit<A, E> | undefined
            if (exit && effect.exitIsSuccess(exit)) {
              return Option.some(exit.value)
            }
            return Option.none()
          }
        )
      )
    )
)

/**
 * Sets a successful value for a key without running the lookup function.
 *
 * **When to use**
 *
 * Use to seed or overwrite a scoped cache entry with an already available
 * successful value.
 *
 * **Details**
 *
 * This replaces and closes any existing entry scope for the key, applies the
 * cache's TTL using a successful exit for the value, and may evict older
 * entries if the cache capacity is exceeded.
 *
 * @see {@link get} for reading or computing a cached value
 * @see {@link refresh} for replacing an entry by running the lookup function
 *
 * @category combinators
 * @since 4.0.0
 */
export const set: {
  <Key, A>(key: Key, value: A): <E, R>(self: ScopedCache<Key, A, E, R>) => Effect.Effect<void>
  <Key, A, E, R>(self: ScopedCache<Key, A, E, R>, key: Key, value: A): Effect.Effect<void>
} = dual(
  3,
  <Key, A, E, R>(self: ScopedCache<Key, A, E, R>, key: Key, value: A): Effect.Effect<void> =>
    effect.uninterruptible(
      core.withFiber((fiber) => {
        if (self.state._tag === "Closed") {
          return effect.interrupt
        }
        const oentry = MutableHashMap.get(self.state.map, key)
        const state = self.state
        const exit = core.exitSucceed(value)
        const deferred = Deferred.makeUnsafe<A, E>()
        Deferred.doneUnsafe(deferred, exit)
        const ttl = self.timeToLive(exit, key)
        MutableHashMap.set(state.map, key, {
          scope: Scope.makeUnsafe(),
          deferred,
          awaiters: 0,
          expiresAt: Duration.isFinite(ttl)
            ? fiber.getRef(effect.ClockRef).currentTimeMillisUnsafe() + Duration.toMillis(ttl)
            : undefined
        })
        const check = checkCapacity(fiber, state.map, self.capacity)
        return Option.isSome(oentry)
          ? effect.flatMap(Scope.close(oentry.value.scope, effect.exitVoid), () => check)
          : check
      })
    )
)

/**
 * Checks whether the cache contains an entry for the specified key.
 *
 * **When to use**
 *
 * Use to test whether an unexpired entry exists for a key without running the
 * cache lookup.
 *
 * **Details**
 *
 * This does not start lookups and does not refresh access order. Expired
 * entries are treated as absent and their scopes are closed while checking. If
 * the cache is closed, the effect is interrupted.
 *
 * @see {@link getOption} for reading an existing cached entry
 * @see {@link get} for running the lookup on missing or expired keys
 *
 * @category combinators
 * @since 4.0.0
 */
export const has: {
  <Key, A>(key: Key): <E, R>(self: ScopedCache<Key, A, E, R>) => Effect.Effect<boolean>
  <Key, A, E, R>(self: ScopedCache<Key, A, E, R>, key: Key): Effect.Effect<boolean>
} = dual(
  2,
  <Key, A, E>(self: ScopedCache<Key, A, E>, key: Key): Effect.Effect<boolean> =>
    effect.uninterruptible(
      core.withFiber((fiber) => effect.map(getImpl(self, key, fiber, false), Predicate.isNotUndefined))
    )
)

/**
 * Removes the entry associated with a key and closes its entry scope.
 *
 * **When to use**
 *
 * Use to remove a single key from a scoped cache and release any resources owned
 * by that entry before a later lookup computes it again.
 *
 * **Details**
 *
 * If the key is absent, this is a no-op.
 *
 * **Gotchas**
 *
 * If the cache is closed, the effect is interrupted.
 *
 * @see {@link refresh} for replacing a key by running a new lookup immediately
 * @see {@link invalidateWhen} for invalidating only when a cached value matches a predicate
 * @see {@link invalidateAll} for removing every cached entry
 *
 * @category combinators
 * @since 4.0.0
 */
export const invalidate: {
  <Key, A>(key: Key): <E, R>(self: ScopedCache<Key, A, E, R>) => Effect.Effect<void>
  <Key, A, E, R>(self: ScopedCache<Key, A, E, R>, key: Key): Effect.Effect<void>
} = dual(2, <Key, A, E, R>(self: ScopedCache<Key, A, E, R>, key: Key): Effect.Effect<void> =>
  effect.uninterruptible(
    effect.suspend(() => {
      if (self.state._tag === "Closed") {
        return effect.interrupt
      }
      const oentry = MutableHashMap.get(self.state.map, key)
      if (Option.isNone(oentry)) {
        return effect.void
      }
      MutableHashMap.remove(self.state.map, key)
      return Scope.close(oentry.value.scope, effect.exitVoid)
    })
  ))

/**
 * Invalidates the entry associated with the specified key in the cache when the
 * predicate returns true for the cached value.
 *
 * **When to use**
 *
 * Use to remove an already-cached scoped value only when the successful cached
 * value satisfies a predicate.
 *
 * **Details**
 *
 * Returns `true` only when a successful cached value matches and is removed. It
 * returns `false` for absent, expired, failed, or non-matching entries.
 *
 * **Gotchas**
 *
 * A matching invalidation closes the entry scope and releases its resources.
 *
 * @see {@link invalidate} for unconditional removal by key
 *
 * @category combinators
 * @since 4.0.0
 */
export const invalidateWhen: {
  <Key, A>(key: Key, f: Predicate.Predicate<A>): <E, R>(self: ScopedCache<Key, A, E, R>) => Effect.Effect<boolean>
  <Key, A, E, R>(self: ScopedCache<Key, A, E, R>, key: Key, f: Predicate.Predicate<A>): Effect.Effect<boolean>
} = dual(
  3,
  <Key, A, E, R>(self: ScopedCache<Key, A, E, R>, key: Key, f: Predicate.Predicate<A>): Effect.Effect<boolean> =>
    effect.uninterruptibleMask((restore) =>
      core.withFiber((fiber) =>
        effect.flatMap(getImpl(self, key, fiber, false), (entry) => {
          if (entry === undefined) {
            return effect.succeed(false)
          }
          return awaitEntry(self, key, entry, restore).pipe(
            effect.flatMap((value) => {
              if (self.state._tag === "Closed") {
                return effect.succeed(false)
              } else if (f(value)) {
                const current = MutableHashMap.get(self.state.map, key)
                if (Option.isNone(current) || current.value !== entry) {
                  return effect.succeed(false)
                }
                MutableHashMap.remove(self.state.map, key)
                return effect.as(Scope.close(entry.scope, effect.exitVoid), true)
              }
              return effect.succeed(false)
            }),
            effect.catch_(() => effect.succeed(false))
          )
        })
      )
    )
)

/**
 * Forces a refresh of the value associated with the specified key in the cache.
 *
 * **When to use**
 *
 * Use to recompute a scoped cache entry immediately, even when an unexpired
 * value is already cached.
 *
 * **Details**
 *
 * It will always invoke the lookup function to construct a new value,
 * overwriting any existing value for that key.
 *
 * @see {@link get} for reusing an unexpired entry before running the lookup
 * @see {@link invalidate} for removing an entry without recomputing it
 *
 * @category combinators
 * @since 4.0.0
 */
export const refresh: {
  <Key, A>(key: Key): <E, R>(self: ScopedCache<Key, A, E, R>) => Effect.Effect<A, E, R>
  <Key, A, E, R>(self: ScopedCache<Key, A, E, R>, key: Key): Effect.Effect<A, E, R>
} = dual(
  2,
  <Key, A, E, R>(self: ScopedCache<Key, A, E, R>, key: Key): Effect.Effect<A, E, R> =>
    effect.uninterruptibleMask(effect.fnUntraced(function*(restore) {
      if (self.state._tag === "Closed") return yield* effect.interrupt
      if (!MutableHashMap.has(self.state.map, key)) return yield* restore(get(self, key))
      const fiber = Fiber.getCurrent()!
      const scope = Scope.makeUnsafe()
      const deferred = Deferred.makeUnsafe<A, E>()
      const exit = yield* effect.exit(effect.suspend(() => restore(Scope.provide(self.lookup(key), scope))))
      Deferred.doneUnsafe(deferred, exit)
      if (effect.exitHasInterrupts(exit)) {
        yield* Scope.close(scope, exit)
        return yield* exit
      }
      // @ts-ignore async gap
      if (self.state._tag === "Closed") {
        yield* Scope.close(scope, effect.exitVoid)
        return yield* effect.interrupt
      }
      const ttl = self.timeToLive(exit, key)
      const entry: Entry<A, E> = {
        scope,
        deferred,
        awaiters: 0,
        expiresAt: Duration.isFinite(ttl)
          ? fiber.getRef(effect.ClockRef).currentTimeMillisUnsafe() + Duration.toMillis(ttl)
          : undefined
      }
      const oentry = MutableHashMap.get(self.state.map, key)
      MutableHashMap.set(self.state.map, key, entry)
      yield* checkCapacity(fiber, self.state.map, self.capacity)
      if (Option.isSome(oentry)) {
        yield* Scope.close(oentry.value.scope, effect.exitVoid)
      }
      return yield* exit
    }))
)

/**
 * Removes every entry from the cache and closes each entry scope.
 *
 * **When to use**
 *
 * Use to clear a scoped cache and release resources owned by all cached entries.
 *
 * **Details**
 *
 * If the cache is closed, the effect is interrupted.
 *
 * @see {@link invalidate} for removing one cached entry
 *
 * @category combinators
 * @since 4.0.0
 */
export const invalidateAll = <Key, A, E, R>(self: ScopedCache<Key, A, E, R>): Effect.Effect<void> =>
  core.withFiber((parent) => {
    if (self.state._tag === "Closed") {
      return effect.interrupt
    }
    return invalidateAllImpl(parent, self.state.map)
  })

const invalidateAllImpl = <Key, A, E>(
  parent: Fiber.Fiber<unknown, unknown>,
  map: MutableHashMap.MutableHashMap<Key, Entry<A, E>>
): Effect.Effect<void> => {
  // Detach the batch before finalizers can reenter the cache.
  const entries = Array.from(MutableHashMap.values(map))
  MutableHashMap.clear(map)
  const fibers = Arr.empty<Fiber.Fiber<unknown, unknown>>()
  for (const entry of entries) {
    fibers.push(effect.forkUnsafe(parent as any, Scope.close(entry.scope, effect.exitVoid), true, true))
  }
  return effect.fiberAwaitAll(fibers)
}

/**
 * Retrieves the approximate number of entries in the cache.
 *
 * **When to use**
 *
 * Use to inspect how many entries are currently stored in the scoped cache.
 *
 * **Gotchas**
 *
 * Note that expired entries are counted until they are accessed and removed.
 * The size reflects the current number of entries stored, not the number
 * of valid entries.
 *
 * @category combinators
 * @since 4.0.0
 */
export const size = <Key, A, E, R>(self: ScopedCache<Key, A, E, R>): Effect.Effect<number> =>
  effect.sync(() => self.state._tag === "Closed" ? 0 : MutableHashMap.size(self.state.map))

/**
 * Retrieves all active keys from the cache, automatically filtering out expired entries.
 *
 * **When to use**
 *
 * Use to inspect currently cached unexpired keys without running cache lookups.
 *
 * **Gotchas**
 *
 * Expired entries are removed and their scopes are closed while filtering.
 *
 * @see {@link entries} for retrieving successful cached key-value pairs
 * @see {@link values} for retrieving only successfully cached values
 *
 * @category combinators
 * @since 4.0.0
 */
export const keys = <Key, A, E, R>(self: ScopedCache<Key, A, E, R>): Effect.Effect<Array<Key>> =>
  core.withFiber((fiber) => {
    if (self.state._tag === "Closed") return effect.succeed([])
    const state = self.state
    const now = fiber.getRef(effect.ClockRef).currentTimeMillisUnsafe()
    const fibers = Arr.empty<Fiber.Fiber<unknown, unknown>>()
    const keys: Array<Key> = []
    for (const [key, entry] of state.map) {
      if (entry.expiresAt === undefined || entry.expiresAt > now) {
        keys.push(key)
      } else {
        MutableHashMap.remove(state.map, key)
        fibers.push(effect.forkUnsafe(fiber, Scope.close(entry.scope, effect.exitVoid), true, true))
      }
    }
    return fibers.length === 0 ? effect.succeed(keys) : effect.as(effect.fiberAwaitAll(fibers), keys)
  })

/**
 * Retrieves all successfully cached values from the cache, excluding failed
 * lookups and expired entries.
 *
 * **When to use**
 *
 * Use to inspect currently successful cached values without running cache
 * lookups.
 *
 * **Gotchas**
 *
 * Expired entries are removed and their scopes are closed while filtering.
 *
 * @see {@link entries} for retrieving successful cached key-value pairs
 * @see {@link keys} for retrieving only cached keys
 *
 * @category combinators
 * @since 4.0.0
 */
export const values = <Key, A, E, R>(self: ScopedCache<Key, A, E, R>): Effect.Effect<Array<A>> =>
  effect.map(entries(self), Arr.map(([, value]) => value))

/**
 * Retrieves all key-value pairs from the cache as an array. This function
 * only returns entries with successfully resolved values, filtering out any
 * failed lookups or expired entries.
 *
 * **When to use**
 *
 * Use to inspect the currently successful cached key-value pairs without
 * running cache lookups.
 *
 * **Gotchas**
 *
 * Expired entries are removed and their scopes are closed while filtering.
 *
 * @see {@link keys} for retrieving only cached keys
 * @see {@link values} for retrieving only cached values
 *
 * @category combinators
 * @since 4.0.0
 */
export const entries = <Key, A, E, R>(self: ScopedCache<Key, A, E, R>): Effect.Effect<Array<[Key, A]>> =>
  core.withFiber((fiber) => {
    if (self.state._tag === "Closed") return effect.succeed([])
    const state = self.state
    const now = fiber.getRef(effect.ClockRef).currentTimeMillisUnsafe()
    const fibers = Arr.empty<Fiber.Fiber<unknown, unknown>>()
    const arr: Array<[Key, A]> = []
    for (const [key, entry] of state.map) {
      if (entry.expiresAt === undefined || entry.expiresAt > now) {
        const exit = entry.deferred.effect
        if (core.isExit(exit) && !effect.exitIsFailure(exit)) {
          arr.push([key, exit.value as A])
        }
      } else {
        MutableHashMap.remove(state.map, key)
        fibers.push(effect.forkUnsafe(fiber, Scope.close(entry.scope, effect.exitVoid), true, true))
      }
    }
    return fibers.length === 0
      ? effect.succeed(arr)
      : effect.as(effect.fiberAwaitAll(fibers), arr)
  })
