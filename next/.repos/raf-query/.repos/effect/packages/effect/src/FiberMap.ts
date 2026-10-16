/**
 * Manages fibers by key inside a scope.
 *
 * A `FiberMap<K, A, E>` owns a map of running fibers, interrupts them when its
 * scope closes, and automatically removes each entry when the corresponding
 * fiber completes. Use it when a program needs to start, replace, join, or
 * interrupt background work by a stable key while keeping all fibers tied to
 * one scope.
 *
 * @since 2.0.0
 */
import * as Cause from "./Cause.ts"
import * as Deferred from "./Deferred.ts"
import * as Effect from "./Effect.ts"
import * as Exit from "./Exit.ts"
import * as Fiber from "./Fiber.ts"
import * as Filter from "./Filter.ts"
import { constVoid, dual } from "./Function.ts"
import type * as Inspectable from "./Inspectable.ts"
import { PipeInspectableProto } from "./internal/core.ts"
import * as internalEffect from "./internal/effect.ts"
import * as Iterable from "./Iterable.ts"
import * as MutableHashMap from "./MutableHashMap.ts"
import * as Option from "./Option.ts"
import type { Pipeable } from "./Pipeable.ts"
import * as Predicate from "./Predicate.ts"
import type * as Scope from "./Scope.ts"

const TypeId = "~effect/FiberMap"

/**
 * A FiberMap is a collection of fibers, indexed by a key. When the associated
 * Scope is closed, all fibers in the map will be interrupted. Fibers are
 * automatically removed from the map when they complete.
 *
 * **Example** (Managing fibers in a map)
 *
 * ```ts import.meta.vitest
 * import { Effect, FiberMap } from "effect"
 *
 * // Create a FiberMap with string keys
 * const program = Effect.gen(function*() {
 *   const map = yield* FiberMap.make<string>()
 *
 *   // Add some fibers to the map
 *   yield* FiberMap.run(map, "task1", Effect.never)
 *   yield* FiberMap.run(map, "task2", Effect.never)
 *
 *   // Get the size of the map
 *   return yield* FiberMap.size(map)
 * })
 *
 * const actual = await Effect.runPromise(Effect.scoped(program))
 * actual // => 2
 * ```
 *
 * @category models
 * @since 2.0.0
 */
export interface FiberMap<in out K, out A = unknown, out E = unknown>
  extends Pipeable, Inspectable.Inspectable, Iterable<[K, Fiber.Fiber<A, E>]>
{
  readonly [TypeId]: typeof TypeId
  readonly deferred: Deferred.Deferred<void, unknown>
  state: {
    readonly _tag: "Open"
    readonly backing: MutableHashMap.MutableHashMap<K, Fiber.Fiber<A, E>>
  } | {
    readonly _tag: "Closed"
  }
}

/**
 * Returns `true` if a value is a `FiberMap`.
 *
 * **Details**
 *
 * This is a type guard that checks for the `FiberMap` runtime marker.
 *
 * **Example** (Checking if a value is a FiberMap)
 *
 * ```ts import.meta.vitest
 * import { Effect, FiberMap } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const map = yield* FiberMap.make<string>()
 *
 *   return [FiberMap.isFiberMap(map), FiberMap.isFiberMap({}), FiberMap.isFiberMap(null)]
 * })
 *
 * const actual = await Effect.runPromise(Effect.scoped(program))
 * actual // => [true, false, false]
 * ```
 *
 * @category guards
 * @since 2.0.0
 */
export const isFiberMap = (u: unknown): u is FiberMap<unknown> => Predicate.hasProperty(u, TypeId)

const Proto = {
  [TypeId]: TypeId,
  [Symbol.iterator](this: FiberMap<unknown>) {
    if (this.state._tag === "Closed") {
      return Iterable.empty()
    }
    return this.state.backing[Symbol.iterator]()
  },
  ...PipeInspectableProto,
  toJSON(this: FiberMap<unknown>) {
    return {
      _id: "FiberMap",
      state: this.state
    }
  }
}

const makeUnsafe = <K, A = unknown, E = unknown>(
  backing: MutableHashMap.MutableHashMap<K, Fiber.Fiber<A, E>>,
  deferred: Deferred.Deferred<void, E>
): FiberMap<K, A, E> => {
  const self = Object.create(Proto)
  self.state = { _tag: "Open", backing }
  self.deferred = deferred
  return self
}

/**
 * Creates a scoped `FiberMap` for storing fibers by key.
 *
 * **Details**
 *
 * When the associated Scope is closed, all fibers in the map will be
 * interrupted. You can add fibers to the map using `FiberMap.set` or
 * `FiberMap.run`, and the fibers will be automatically removed from the
 * `FiberMap` when they complete.
 *
 * **Example** (Creating a scoped FiberMap)
 *
 * ```ts import.meta.vitest
 * import { Effect, FiberMap } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const map = yield* FiberMap.make<string>()
 *
 *   // run some effects and add the fibers to the map
 *   yield* FiberMap.run(map, "fiber a", Effect.never)
 *   yield* FiberMap.run(map, "fiber b", Effect.never)
 *
 *   yield* Effect.yieldNow
 *   return yield* FiberMap.size(map)
 * }).pipe(
 *   Effect.scoped // The fibers will be interrupted when the scope is closed
 * )
 *
 * const actual = await Effect.runPromise(program)
 * actual // => 2
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const make = <K, A = unknown, E = unknown>(): Effect.Effect<FiberMap<K, A, E>, never, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.sync(() =>
      makeUnsafe<K, A, E>(
        MutableHashMap.empty(),
        Deferred.makeUnsafe()
      )
    ),
    (map) =>
      Effect.suspend(() => {
        const state = map.state
        if (state._tag === "Closed") return Effect.void
        map.state = { _tag: "Closed" }
        return Fiber.interruptAll(MutableHashMap.values(state.backing)).pipe(
          Deferred.into(map.deferred)
        )
      })
  )

/**
 * Creates a scoped run function that forks effects into a new `FiberMap`.
 *
 * **Details**
 *
 * Each call stores the forked fiber under the supplied key and returns that
 * fiber. If the key already has a fiber, the previous fiber is interrupted
 * unless `onlyIfMissing` is set. All managed fibers are interrupted when the
 * map's scope closes.
 *
 * **Example** (Creating a scoped runtime)
 *
 * ```ts import.meta.vitest
 * import { Effect, Fiber, FiberMap } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const run = yield* FiberMap.makeRuntime<never, string>()
 *
 *   // Run effects and get back fibers
 *   const fiber1 = run("task1", Effect.succeed("Hello"))
 *   const fiber2 = run("task2", Effect.succeed("World"))
 *
 *   // Join the fibers to get their successful values
 *   return [yield* Fiber.join(fiber1), yield* Fiber.join(fiber2)]
 * })
 *
 * const actual = await Effect.runPromise(Effect.scoped(program))
 * actual // => ["Hello", "World"]
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const makeRuntime = <R, K, E = unknown, A = unknown>(): Effect.Effect<
  <XE extends E, XA extends A>(
    key: K,
    effect: Effect.Effect<XA, XE, R>,
    options?:
      | Effect.RunOptions & {
        readonly onlyIfMissing?: boolean | undefined
      }
      | undefined
  ) => Fiber.Fiber<XA, XE>,
  never,
  Scope.Scope | R
> =>
  Effect.flatMap(
    make<K, A, E>(),
    (self) => runtime(self)<R>()
  )

/**
 * Creates a scoped run function that forks effects into a new `FiberMap` and
 * returns a `Promise` for each effect result.
 *
 * **When to use**
 *
 * Use when keyed fibers must be managed in a scoped map while exposing their
 * results through Promise-based APIs.
 *
 * **Details**
 *
 * Each call stores the fiber under the supplied key, interrupting any previous
 * fiber for that key unless `onlyIfMissing` is set. The returned Promise
 * resolves with the effect's success value or rejects with the squashed failure
 * cause.
 *
 * **Example** (Creating a promise runtime)
 *
 * ```ts import.meta.vitest
 * import { Effect, FiberMap } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const run = yield* FiberMap.makeRuntimePromise<never, string>()
 *
 *   // Run effects and get back promises
 *   const promise1 = run("task1", Effect.succeed("Hello"))
 *   const promise2 = run("task2", Effect.succeed("World"))
 *
 *   // Convert to Effect and await
 *   return [yield* Effect.promise(() => promise1), yield* Effect.promise(() => promise2)]
 * })
 *
 * const actual = await Effect.runPromise(Effect.scoped(program))
 * actual // => ["Hello", "World"]
 * ```
 *
 * @category constructors
 * @since 3.13.0
 */
export const makeRuntimePromise = <R, K, A = unknown, E = unknown>(): Effect.Effect<
  <XE extends E, XA extends A>(
    key: K,
    effect: Effect.Effect<XA, XE, R>,
    options?:
      | Effect.RunOptions & {
        readonly onlyIfMissing?: boolean | undefined
      }
      | undefined
  ) => Promise<XA>,
  never,
  Scope.Scope | R
> =>
  Effect.flatMap(
    make<K, A, E>(),
    (self) => runtimePromise(self)<R>()
  )

const internalFiberId = -1
const isInternalInterruption = Filter.toPredicate(Filter.compose(
  Cause.filterInterruptors,
  Filter.has(internalFiberId)
))

/**
 * Adds a fiber to the `FiberMap` under a key using a synchronous, unsafe
 * mutation.
 *
 * **When to use**
 *
 * Use when an existing forked fiber must be installed under a key immediately
 * and synchronous interruption of the replaced fiber is acceptable.
 *
 * **Details**
 *
 * When the fiber completes, it is removed from the map. If the key already has
 * a fiber, that previous fiber is interrupted unless `onlyIfMissing` is set;
 * in that case a different new fiber is interrupted and the existing entry is
 * kept, while re-registering the existing fiber is a no-op.
 *
 * **Example** (Adding a fiber unsafely)
 *
 * ```ts import.meta.vitest
 * import { Deferred, Effect, Fiber, FiberMap } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const map = yield* FiberMap.make<string>()
 *   const deferred = yield* Deferred.make<string>()
 *
 *   // Create a fiber and add it to the map
 *   const fiber = yield* Effect.forkChild(Deferred.await(deferred))
 *   FiberMap.setUnsafe(map, "greeting", fiber)
 *
 *   yield* Deferred.succeed(deferred, "Hello")
 *
 *   // Join the fiber to get its successful value
 *   return yield* Fiber.join(fiber)
 * })
 *
 * const actual = await Effect.runPromise(Effect.scoped(program))
 * actual // => "Hello"
 * ```
 *
 * @category combinators
 * @since 4.0.0
 */
export const setUnsafe: {
  <K, A, E, XE extends E, XA extends A>(
    key: K,
    fiber: Fiber.Fiber<XA, XE>,
    options?: {
      readonly onlyIfMissing?: boolean | undefined
      readonly propagateInterruption?: boolean | undefined
    } | undefined
  ): (self: FiberMap<K, A, E>) => void
  <K, A, E, XE extends E, XA extends A>(
    self: FiberMap<K, A, E>,
    key: K,
    fiber: Fiber.Fiber<XA, XE>,
    options?: {
      readonly onlyIfMissing?: boolean | undefined
      readonly propagateInterruption?: boolean | undefined
    } | undefined
  ): void
} = dual((args) => isFiberMap(args[0]), <K, A, E, XE extends E, XA extends A>(
  self: FiberMap<K, A, E>,
  key: K,
  fiber: Fiber.Fiber<XA, XE>,
  options?: {
    readonly onlyIfMissing?: boolean | undefined
    readonly propagateInterruption?: boolean | undefined
  } | undefined
): void => {
  if (self.state._tag === "Closed") {
    fiber.interruptUnsafe(internalFiberId)
    return
  }

  const previous = MutableHashMap.get(self.state.backing, key)
  if (previous._tag === "Some") {
    if (previous.value === fiber) {
      return
    } else if (options?.onlyIfMissing === true) {
      fiber.interruptUnsafe(internalFiberId)
      return
    }
  }

  // Install the replacement before interruption can re-enter the map through a finalizer.
  MutableHashMap.set(self.state.backing, key, fiber)
  if (previous._tag === "Some") {
    previous.value.interruptUnsafe(internalFiberId)
  }
  fiber.addObserver((exit) => {
    if (self.state._tag === "Closed") {
      return
    }
    const current = MutableHashMap.get(self.state.backing, key)
    if (Option.isSome(current) && fiber === current.value) {
      MutableHashMap.remove(self.state.backing, key)
    }
    if (
      Exit.isFailure(exit) &&
      (
        options?.propagateInterruption === true ?
          !isInternalInterruption(exit.cause) :
          !Cause.hasInterruptsOnly(exit.cause)
      )
    ) {
      Deferred.doneUnsafe(self.deferred, exit as any)
    }
  })
})

/**
 * Adds a fiber to the `FiberMap` under a key.
 *
 * **Details**
 *
 * When the fiber completes, it is removed from the map. If the key already has
 * a fiber, that previous fiber is interrupted unless `onlyIfMissing` is set;
 * in that case a different new fiber is interrupted and the existing entry is
 * kept, while re-registering the existing fiber is a no-op.
 *
 * This is the Effect-wrapped version of `setUnsafe`.
 *
 * **Example** (Adding a fiber)
 *
 * ```ts import.meta.vitest
 * import { Deferred, Effect, Fiber, FiberMap } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const map = yield* FiberMap.make<string>()
 *   const deferred = yield* Deferred.make<string>()
 *
 *   // Create a fiber and add it to the map using Effect
 *   const fiber = yield* Effect.forkChild(Deferred.await(deferred))
 *   yield* FiberMap.set(map, "greeting", fiber)
 *
 *   yield* Deferred.succeed(deferred, "Hello")
 *
 *   // Join the fiber to get its successful value
 *   return yield* Fiber.join(fiber)
 * })
 *
 * const actual = await Effect.runPromise(Effect.scoped(program))
 * actual // => "Hello"
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const set: {
  <K, A, E, XE extends E, XA extends A>(
    key: K,
    fiber: Fiber.Fiber<XA, XE>,
    options?: {
      readonly onlyIfMissing?: boolean | undefined
      readonly propagateInterruption?: boolean | undefined
    } | undefined
  ): (self: FiberMap<K, A, E>) => Effect.Effect<void>
  <K, A, E, XE extends E, XA extends A>(
    self: FiberMap<K, A, E>,
    key: K,
    fiber: Fiber.Fiber<XA, XE>,
    options?: {
      readonly onlyIfMissing?: boolean | undefined
      readonly propagateInterruption?: boolean | undefined
    } | undefined
  ): Effect.Effect<void>
} = dual((args) => isFiberMap(args[0]), <K, A, E, XE extends E, XA extends A>(
  self: FiberMap<K, A, E>,
  key: K,
  fiber: Fiber.Fiber<XA, XE>,
  options?: {
    readonly onlyIfMissing?: boolean | undefined
    readonly propagateInterruption?: boolean | undefined
  } | undefined
): Effect.Effect<void> => Effect.sync(() => setUnsafe(self, key, fiber, options)))

/**
 * Retrieves a fiber from the FiberMap synchronously.
 *
 * **When to use**
 *
 * Use when synchronous keyed lookup of a fiber in a `FiberMap` is needed and an
 * `Option` result is enough outside the Effect workflow.
 *
 * **Example** (Retrieving a fiber unsafely)
 *
 * ```ts import.meta.vitest
 * import { Deferred, Effect, Fiber, FiberMap, Option } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const map = yield* FiberMap.make<string>()
 *   const deferred = yield* Deferred.make<string>()
 *
 *   // Add a fiber to the map
 *   const fiber = yield* Effect.forkChild(Deferred.await(deferred))
 *   FiberMap.setUnsafe(map, "greeting", fiber)
 *
 *   // Retrieve the fiber
 *   const retrieved = FiberMap.getUnsafe(map, "greeting")
 *   yield* Deferred.succeed(deferred, "Hello")
 *   const result = yield* Fiber.join(fiber)
 *   return Option.map(retrieved, () => result)
 * })
 *
 * const actual = await Effect.runPromise(Effect.scoped(program))
 * actual // => Option.some("Hello")
 * ```
 *
 * @category combinators
 * @since 4.0.0
 */
export const getUnsafe: {
  <K>(key: K): <A, E>(self: FiberMap<K, A, E>) => Option.Option<Fiber.Fiber<A, E>>
  <K, A, E>(self: FiberMap<K, A, E>, key: K): Option.Option<Fiber.Fiber<A, E>>
} = dual(
  2,
  <K, A, E>(self: FiberMap<K, A, E>, key: K): Option.Option<Fiber.Fiber<A, E>> => {
    return self.state._tag === "Closed" ? Option.none() : MutableHashMap.get(self.state.backing, key)
  }
)

/**
 * Retrieves a fiber from the FiberMap effectfully.
 *
 * **Details**
 *
 * Returns an `Option` wrapped in `Effect`.
 *
 * **Example** (Retrieving a fiber)
 *
 * ```ts import.meta.vitest
 * import { Deferred, Effect, Fiber, FiberMap, Option } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const map = yield* FiberMap.make<string>()
 *   const deferred = yield* Deferred.make<string>()
 *
 *   // Add a fiber to the map
 *   const fiber = yield* Effect.forkChild(Deferred.await(deferred))
 *   yield* FiberMap.set(map, "greeting", fiber)
 *
 *   // Retrieve the fiber with error handling
 *   const retrieved = yield* FiberMap.get(map, "greeting")
 *   yield* Deferred.succeed(deferred, "Hello")
 *   const result = yield* Fiber.join(fiber)
 *   return Option.map(retrieved, () => result)
 * })
 *
 * const actual = await Effect.runPromise(Effect.scoped(program))
 * actual // => Option.some("Hello")
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const get: {
  <K>(key: K): <A, E>(self: FiberMap<K, A, E>) => Effect.Effect<Option.Option<Fiber.Fiber<A, E>>>
  <K, A, E>(self: FiberMap<K, A, E>, key: K): Effect.Effect<Option.Option<Fiber.Fiber<A, E>>>
} = dual(
  2,
  <K, A, E>(self: FiberMap<K, A, E>, key: K): Effect.Effect<Option.Option<Fiber.Fiber<A, E>>> =>
    Effect.suspend(() => Effect.succeed(getUnsafe(self, key)))
)

/**
 * Checks whether a key exists in the FiberMap.
 *
 * **Example** (Checking if a key exists unsafely)
 *
 * ```ts import.meta.vitest
 * import { Effect, FiberMap } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const map = yield* FiberMap.make<string>()
 *
 *   // Add a fiber to the map
 *   yield* FiberMap.run(map, "task1", Effect.never)
 *
 *   // Check if keys exist
 *   return [FiberMap.hasUnsafe(map, "task1"), FiberMap.hasUnsafe(map, "task2")]
 * })
 *
 * const actual = await Effect.runPromise(Effect.scoped(program))
 * actual // => [true, false]
 * ```
 *
 * @category combinators
 * @since 4.0.0
 */
export const hasUnsafe: {
  <K>(key: K): <A, E>(self: FiberMap<K, A, E>) => boolean
  <K, A, E>(self: FiberMap<K, A, E>, key: K): boolean
} = dual(
  2,
  <K, A, E>(self: FiberMap<K, A, E>, key: K): boolean =>
    self.state._tag === "Closed" ? false : MutableHashMap.has(self.state.backing, key)
)

/**
 * Checks whether a key exists in the FiberMap.
 * This is the Effect-wrapped version of `hasUnsafe`.
 *
 * **Example** (Checking if a key exists)
 *
 * ```ts import.meta.vitest
 * import { Effect, FiberMap } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const map = yield* FiberMap.make<string>()
 *
 *   // Add a fiber to the map
 *   yield* FiberMap.run(map, "task1", Effect.never)
 *
 *   // Check if keys exist using Effect
 *   return [yield* FiberMap.has(map, "task1"), yield* FiberMap.has(map, "task2")]
 * })
 *
 * const actual = await Effect.runPromise(Effect.scoped(program))
 * actual // => [true, false]
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const has: {
  <K>(key: K): <A, E>(self: FiberMap<K, A, E>) => Effect.Effect<boolean>
  <K, A, E>(self: FiberMap<K, A, E>, key: K): Effect.Effect<boolean>
} = dual(
  2,
  <K, A, E>(self: FiberMap<K, A, E>, key: K): Effect.Effect<boolean> => Effect.sync(() => hasUnsafe(self, key))
)

/**
 * Removes a fiber from the FiberMap, interrupting it if it exists.
 *
 * **Example** (Removing a fiber)
 *
 * ```ts import.meta.vitest
 * import { Effect, FiberMap } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const map = yield* FiberMap.make<string>()
 *
 *   // Add some fibers to the map
 *   yield* FiberMap.run(map, "task1", Effect.never)
 *   yield* FiberMap.run(map, "task2", Effect.never)
 *
 *   const sizeBefore = yield* FiberMap.size(map)
 *
 *   // Remove a specific fiber (this will interrupt it)
 *   yield* FiberMap.remove(map, "task1")
 *
 *   return [sizeBefore, yield* FiberMap.size(map)]
 * })
 *
 * const actual = await Effect.runPromise(Effect.scoped(program))
 * actual // => [2, 1]
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const remove: {
  <K>(key: K): <A, E>(self: FiberMap<K, A, E>) => Effect.Effect<void>
  <K, A, E>(self: FiberMap<K, A, E>, key: K): Effect.Effect<void>
} = dual<
  <K>(
    key: K
  ) => <A, E>(self: FiberMap<K, A, E>) => Effect.Effect<void>,
  <K, A, E>(
    self: FiberMap<K, A, E>,
    key: K
  ) => Effect.Effect<void>
>(2, (self, key) =>
  Effect.suspend(() => {
    if (self.state._tag === "Closed") {
      return Effect.void
    }
    const fiber = MutableHashMap.get(self.state.backing, key)
    if (fiber._tag === "None") {
      return Effect.void
    }
    return Fiber.interruptAs(fiber.value, internalFiberId)
  }))

/**
 * Removes all fibers from the FiberMap, interrupting them.
 *
 * **Example** (Clearing all fibers)
 *
 * ```ts import.meta.vitest
 * import { Effect, FiberMap } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const map = yield* FiberMap.make<string>()
 *
 *   // Add some fibers to the map
 *   yield* FiberMap.run(map, "task1", Effect.never)
 *   yield* FiberMap.run(map, "task2", Effect.never)
 *   yield* FiberMap.run(map, "task3", Effect.never)
 *
 *   const sizeBefore = yield* FiberMap.size(map)
 *
 *   // Clear all fibers (this will interrupt all of them)
 *   yield* FiberMap.clear(map)
 *
 *   return [sizeBefore, yield* FiberMap.size(map)]
 * })
 *
 * const actual = await Effect.runPromise(Effect.scoped(program))
 * actual // => [3, 0]
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const clear = <K, A, E>(self: FiberMap<K, A, E>): Effect.Effect<void> =>
  Effect.suspend(() => {
    if (self.state._tag === "Closed") {
      return Effect.void
    }
    return Fiber.interruptAllAs(MutableHashMap.values(self.state.backing), internalFiberId)
  })

const constInterruptedFiber = (function() {
  let fiber: Fiber.Fiber<never, never> | undefined = undefined
  return () => {
    if (fiber === undefined) {
      fiber = Effect.runFork(Effect.interrupt)
    }
    return fiber
  }
})()

/**
 * Forks an Effect and stores the resulting fiber in the `FiberMap` under a key.
 *
 * **Details**
 *
 * When the fiber completes, it is removed from the map. If the key already has
 * a fiber, the previous fiber is interrupted unless `onlyIfMissing` is set.
 * Set `startImmediately: false` to defer startup. By default, the effect starts
 * immediately.
 *
 * **Example** (Forking effects into a map)
 *
 * ```ts import.meta.vitest
 * import { Effect, Fiber, FiberMap } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const map = yield* FiberMap.make<string>()
 *
 *   // Run effects and add the fibers to the map
 *   const fiber1 = yield* FiberMap.run(map, "task1", Effect.succeed("Hello"))
 *   const fiber2 = yield* FiberMap.run(map, "task2", Effect.succeed("World"))
 *
 *   // Join the fibers to get their successful values
 *   const result1 = yield* Fiber.join(fiber1)
 *   const result2 = yield* Fiber.join(fiber2)
 *   return [result1, result2, yield* FiberMap.size(map)]
 * })
 *
 * const actual = await Effect.runPromise(Effect.scoped(program))
 * actual // => ["Hello", "World", 0]
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const run: {
  <K, A, E>(
    self: FiberMap<K, A, E>,
    key: K,
    options?: {
      readonly onlyIfMissing?: boolean | undefined
      readonly propagateInterruption?: boolean | undefined
      readonly startImmediately?: boolean | undefined
    } | undefined
  ): <R, XE extends E, XA extends A>(
    effect: Effect.Effect<XA, XE, R>
  ) => Effect.Effect<Fiber.Fiber<XA, XE>, never, R>
  <K, A, E, R, XE extends E, XA extends A>(
    self: FiberMap<K, A, E>,
    key: K,
    effect: Effect.Effect<XA, XE, R>,
    options?: {
      readonly onlyIfMissing?: boolean | undefined
      readonly propagateInterruption?: boolean | undefined
      readonly startImmediately?: boolean | undefined
    } | undefined
  ): Effect.Effect<Fiber.Fiber<XA, XE>, never, R>
} = function() {
  const self = arguments[0]
  if (Effect.isEffect(arguments[2])) {
    return runImpl(self, arguments[1], arguments[2], arguments[3]) as any
  }
  const key = arguments[1]
  const options = arguments[2]
  return (effect: Effect.Effect<any, any, any>) => runImpl(self, key, effect, options)
}

const runImpl = <K, A, E, R, XE extends E, XA extends A>(
  self: FiberMap<K, A, E>,
  key: K,
  effect: Effect.Effect<XA, XE, R>,
  options?: {
    readonly startImmediately?: boolean | undefined
    readonly onlyIfMissing?: boolean
    readonly propagateInterruption?: boolean | undefined
  }
): Effect.Effect<Fiber.Fiber<XA, XE>, never, R> =>
  Effect.withFiber((parent) => {
    if (self.state._tag === "Closed") {
      return Effect.interrupt
    } else if (options?.onlyIfMissing === true && hasUnsafe(self, key)) {
      return Effect.sync(constInterruptedFiber)
    }
    const fiber: Fiber.Fiber<XA, XE> = internalEffect.forkUnsafe(
      parent,
      effect,
      options?.startImmediately ?? true,
      true
    )
    setUnsafe(self, key, fiber, options)
    return Effect.succeed(fiber)
  })

/**
 * Captures the current runtime and returns a function for forking effects into
 * an existing `FiberMap`.
 *
 * **Details**
 *
 * Each call stores the forked fiber under the supplied key. If that key already
 * has a fiber, the previous fiber is interrupted unless `onlyIfMissing` is set.
 *
 * **Example** (Capturing a runtime)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Fiber, FiberMap } from "effect"
 *
 * class Users extends Context.Service<Users, {
 *   readonly getAll: Effect.Effect<Array<unknown>>
 * }>()("Users") {}
 *
 * const program = Effect.gen(function*() {
 *   const map = yield* FiberMap.make<string>()
 *   const run = yield* FiberMap.runtime(map)<Users>()
 *
 *   // run some effects and add the fibers to the map
 *   const fiberA = run("effect-a", Effect.andThen(Users, (_) => _.getAll))
 *   const fiberB = run("effect-b", Effect.andThen(Users, (_) => _.getAll))
 *   return [(yield* Fiber.join(fiberA)).length, (yield* Fiber.join(fiberB)).length]
 * }).pipe(
 *   Effect.scoped // The fibers will be interrupted when the scope is closed
 * )
 *
 * const actual = await Effect.runPromise(Effect.provideService(program, Users, {
 *   getAll: Effect.succeed([])
 * }))
 * actual // => [0, 0]
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const runtime: <K, A, E>(
  self: FiberMap<K, A, E>
) => <R = never>() => Effect.Effect<
  <XE extends E, XA extends A>(
    key: K,
    effect: Effect.Effect<XA, XE, R>,
    options?:
      | Effect.RunOptions & {
        readonly onlyIfMissing?: boolean | undefined
        readonly propagateInterruption?: boolean | undefined
      }
      | undefined
  ) => Fiber.Fiber<XA, XE>,
  never,
  R
> = <K, A, E>(self: FiberMap<K, A, E>) => <R>() =>
  Effect.map(
    Effect.context<R>(),
    (services) => {
      const runFork = Effect.runForkWith(services)
      return <XE extends E, XA extends A>(
        key: K,
        effect: Effect.Effect<XA, XE, R>,
        options?:
          | Effect.RunOptions & {
            readonly onlyIfMissing?: boolean | undefined
            readonly propagateInterruption?: boolean | undefined
          }
          | undefined
      ) => {
        if (self.state._tag === "Closed") {
          return constInterruptedFiber()
        } else if (options?.onlyIfMissing === true && hasUnsafe(self, key)) {
          return constInterruptedFiber()
        }
        const fiber = runFork(effect, options)
        setUnsafe(self, key, fiber, options)
        return fiber
      }
    }
  )

/**
 * Captures the current runtime and returns a function for running effects in
 * an existing `FiberMap` as Promises.
 *
 * **Details**
 *
 * Each call stores the forked fiber under the supplied key, interrupting any
 * previous fiber for that key unless `onlyIfMissing` is set. The Promise
 * resolves with the effect's success value or rejects with the squashed failure
 * cause.
 *
 * **Example** (Running effects as promises)
 *
 * ```ts import.meta.vitest
 * import { Effect, FiberMap } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const map = yield* FiberMap.make<string>()
 *   const runPromise = yield* FiberMap.runtimePromise(map)<never>()
 *
 *   // Create promises that will be backed by fibers in the map
 *   const promise1 = runPromise("task1", Effect.succeed("Hello"))
 *   const promise2 = runPromise("task2", Effect.succeed("World"))
 *
 *   // Convert promises back to Effects and await
 *   return [yield* Effect.promise(() => promise1), yield* Effect.promise(() => promise2)]
 * })
 *
 * const actual = await Effect.runPromise(Effect.scoped(program))
 * actual // => ["Hello", "World"]
 * ```
 *
 * @category combinators
 * @since 3.13.0
 */
export const runtimePromise = <K, A, E>(self: FiberMap<K, A, E>): <R = never>() => Effect.Effect<
  <XE extends E, XA extends A>(
    key: K,
    effect: Effect.Effect<XA, XE, R>,
    options?:
      | Effect.RunOptions & {
        readonly onlyIfMissing?: boolean | undefined
        readonly propagateInterruption?: boolean | undefined
      }
      | undefined
  ) => Promise<XA>,
  never,
  R
> =>
<R>() =>
  Effect.map(
    runtime(self)<R>(),
    (runFork) =>
    <XE extends E, XA extends A>(
      key: K,
      effect: Effect.Effect<XA, XE, R>,
      options?:
        | Effect.RunOptions & { readonly propagateInterruption?: boolean | undefined }
        | undefined
    ): Promise<XA> =>
      new Promise((resolve, reject) =>
        runFork(key, effect, options).addObserver((exit) => {
          if (Exit.isSuccess(exit)) {
            resolve(exit.value)
          } else {
            reject(Cause.squash(exit.cause))
          }
        })
      )
  )

/**
 * Gets the number of fibers currently in the FiberMap.
 *
 * **Example** (Checking the map size)
 *
 * ```ts import.meta.vitest
 * import { Effect, FiberMap } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const map = yield* FiberMap.make<string>()
 *
 *   const sizeBefore = yield* FiberMap.size(map)
 *
 *   // Add some fibers
 *   yield* FiberMap.run(map, "task1", Effect.never)
 *   yield* FiberMap.run(map, "task2", Effect.never)
 *
 *   return [sizeBefore, yield* FiberMap.size(map)]
 * })
 *
 * const actual = await Effect.runPromise(Effect.scoped(program))
 * actual // => [0, 2]
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const size = <K, A, E>(self: FiberMap<K, A, E>): Effect.Effect<number> =>
  Effect.sync(() => self.state._tag === "Closed" ? 0 : MutableHashMap.size(self.state.backing))

/**
 * Waits for the `FiberMap` to fail or close.
 *
 * **Details**
 *
 * The returned Effect fails with the first managed fiber failure that is not
 * ignored by the map's interruption rules. Normal successful completion
 * removes fibers from the map; use `awaitEmpty` to wait until the map has no
 * fibers.
 *
 * **Example** (Joining failing fibers)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit, FiberMap } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const map = yield* FiberMap.make()
 *   yield* FiberMap.set(map, "a", Effect.runFork(Effect.fail("error")))
 *
 *   // parent fiber will fail with "error"
 *   yield* FiberMap.join(map)
 * })
 *
 * const actual = await Effect.runPromise(Effect.exit(Effect.scoped(program)))
 * actual // => Exit.fail("error")
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const join = <K, A, E>(self: FiberMap<K, A, E>): Effect.Effect<void, E> =>
  Deferred.await(self.deferred as Deferred.Deferred<void, E>)

/**
 * Waits for the FiberMap to be empty.
 * This will wait for all currently running fibers to complete.
 *
 * **Example** (Waiting for an empty map)
 *
 * ```ts import.meta.vitest
 * import { Effect, FiberMap } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const map = yield* FiberMap.make<string>()
 *
 *   yield* FiberMap.run(map, "task1", Effect.yieldNow)
 *   yield* FiberMap.run(map, "task2", Effect.yieldNow)
 *
 *   // Wait for the map to be empty
 *   yield* FiberMap.awaitEmpty(map)
 *
 *   return yield* FiberMap.size(map)
 * })
 *
 * const actual = await Effect.runPromise(Effect.scoped(program))
 * actual // => 0
 * ```
 *
 * @category combinators
 * @since 3.13.0
 */
export const awaitEmpty = <K, A, E>(self: FiberMap<K, A, E>): Effect.Effect<void, E> =>
  Effect.whileLoop({
    while: () => self.state._tag === "Open" && MutableHashMap.size(self.state.backing) > 0,
    body: () => Fiber.await(Iterable.headUnsafe(self)[1]),
    step: constVoid
  })
