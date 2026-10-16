/**
 * Manages many fibers together inside one scope.
 *
 * A `FiberSet<A, E>` tracks running fibers, removes each fiber when it
 * completes, and interrupts all still-running fibers when the owning scope
 * closes. This module includes scoped runtime constructors plus helpers for
 * adding, clearing, running, counting, joining, and waiting for managed fibers.
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
import type { Pipeable } from "./Pipeable.ts"
import * as Predicate from "./Predicate.ts"
import type * as Scope from "./Scope.ts"

const TypeId = "~effect/FiberSet"

/**
 * A FiberSet is a collection of fibers that can be managed together.
 * When the associated Scope is closed, all fibers in the set will be interrupted.
 *
 * **Example** (Managing fibers in a set)
 *
 * ```ts import.meta.vitest
 * import { Effect, FiberSet } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const set = yield* FiberSet.make<string, string>()
 *
 *   // Add fibers to the set
 *   yield* FiberSet.run(set, Effect.succeed("hello"))
 *   yield* FiberSet.run(set, Effect.succeed("world"))
 *
 *   // Wait for all fibers to complete
 *   yield* FiberSet.awaitEmpty(set)
 *   return yield* FiberSet.size(set)
 * })
 *
 * const actual = await Effect.runPromise(Effect.scoped(program))
 * actual // => 0
 * ```
 *
 * @category models
 * @since 2.0.0
 */
export interface FiberSet<out A = unknown, out E = unknown>
  extends Pipeable, Inspectable.Inspectable, Iterable<Fiber.Fiber<A, E>>
{
  readonly [TypeId]: typeof TypeId
  readonly deferred: Deferred.Deferred<void, unknown>
  state: {
    readonly _tag: "Open"
    readonly backing: Set<Fiber.Fiber<A, E>>
  } | {
    readonly _tag: "Closed"
  }
}

/**
 * Checks whether a value is a FiberSet.
 *
 * **Example** (Checking if a value is a FiberSet)
 *
 * ```ts import.meta.vitest
 * import { Effect, FiberSet } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const set = yield* FiberSet.make()
 *
 *   return [FiberSet.isFiberSet(set), FiberSet.isFiberSet({})]
 * })
 *
 * const actual = await Effect.runPromise(Effect.scoped(program))
 * actual // => [true, false]
 * ```
 *
 * @category guards
 * @since 2.0.0
 */
export const isFiberSet = (u: unknown): u is FiberSet<unknown, unknown> => Predicate.hasProperty(u, TypeId)

const Proto = {
  [TypeId]: TypeId,
  [Symbol.iterator](this: FiberSet<unknown, unknown>) {
    if (this.state._tag === "Closed") {
      return Iterable.empty()
    }
    return this.state.backing[Symbol.iterator]()
  },
  ...PipeInspectableProto,
  toJSON(this: FiberSet<unknown, unknown>) {
    return {
      _id: "FiberSet",
      state: this.state
    }
  }
}

const makeUnsafe = <A, E>(
  backing: Set<Fiber.Fiber<A, E>>,
  deferred: Deferred.Deferred<void, unknown>
): FiberSet<A, E> => {
  const self = Object.create(Proto)
  self.state = { _tag: "Open", backing }
  self.deferred = deferred
  return self
}

/**
 * Creates a scoped `FiberSet` for storing fibers.
 *
 * **Details**
 *
 * When the associated Scope is closed, all fibers in the set will be
 * interrupted. You can add fibers to the set using `FiberSet.add` or
 * `FiberSet.run`, and the fibers will be automatically removed from the
 * FiberSet when they complete.
 *
 * **Example** (Creating a scoped FiberSet)
 *
 * ```ts import.meta.vitest
 * import { Effect, FiberSet } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const set = yield* FiberSet.make()
 *
 *   // run some effects and add the fibers to the set
 *   yield* FiberSet.run(set, Effect.never)
 *   yield* FiberSet.run(set, Effect.never)
 *
 *   yield* Effect.yieldNow
 *   return yield* FiberSet.size(set)
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
export const make = <A = unknown, E = unknown>(): Effect.Effect<FiberSet<A, E>, never, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.sync(() => makeUnsafe(new Set(), Deferred.makeUnsafe())),
    (set) =>
      Effect.suspend(() => {
        const state = set.state
        if (state._tag === "Closed") return Effect.void
        set.state = { _tag: "Closed" }
        const fibers = state.backing
        return Fiber.interruptAll(fibers).pipe(
          Deferred.into(set.deferred)
        )
      })
  )

/**
 * Creates a scoped run function that forks effects into a new `FiberSet`.
 *
 * **Details**
 *
 * Each call returns the forked fiber and adds it to the set. Managed fibers are
 * removed when they complete and are interrupted when the set's scope closes.
 *
 * **Example** (Creating a scoped runtime)
 *
 * ```ts import.meta.vitest
 * import { Effect, Fiber, FiberSet } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const runFork = yield* FiberSet.makeRuntime()
 *
 *   // Fork effects using the runtime
 *   const fiber1 = runFork(Effect.succeed("hello"))
 *   const fiber2 = runFork(Effect.succeed("world"))
 *
 *   return [yield* Fiber.join(fiber1), yield* Fiber.join(fiber2)]
 * })
 *
 * const actual = await Effect.runPromise(Effect.scoped(program))
 * actual // => ["hello", "world"]
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const makeRuntime = <R = never, A = unknown, E = unknown>(): Effect.Effect<
  (<XE extends E, XA extends A>(
    effect: Effect.Effect<XA, XE, R>,
    options?: (Effect.RunOptions & { readonly propagateInterruption?: boolean | undefined }) | undefined
  ) => Fiber.Fiber<XA, XE>),
  never,
  Scope.Scope | R
> =>
  Effect.flatMap(
    make<A, E>(),
    (self) => runtime(self)<R>()
  )

/**
 * Creates a scoped run function that forks effects into a new `FiberSet` and
 * returns a `Promise` for each effect result.
 *
 * **When to use**
 *
 * Use when many scoped fibers should be tracked as a set while exposing each
 * result through Promise-based APIs.
 *
 * **Details**
 *
 * Managed fibers are removed when they complete and are interrupted when the
 * set's scope closes. Each Promise resolves with the effect's success value or
 * rejects with the squashed failure cause.
 *
 * **Example** (Creating a promise runtime)
 *
 * ```ts import.meta.vitest
 * import { Effect, FiberSet } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const runPromise = yield* FiberSet.makeRuntimePromise()
 *
 *   // Run effects as promises
 *   const promise1 = runPromise(Effect.succeed("hello"))
 *   const promise2 = runPromise(Effect.succeed("world"))
 *
 *   return [yield* Effect.promise(() => promise1), yield* Effect.promise(() => promise2)]
 * })
 *
 * const actual = await Effect.runPromise(Effect.scoped(program))
 * actual // => ["hello", "world"]
 * ```
 *
 * @category constructors
 * @since 3.13.0
 */
export const makeRuntimePromise = <R = never, A = unknown, E = unknown>(): Effect.Effect<
  (<XE extends E, XA extends A>(
    effect: Effect.Effect<XA, XE, R>,
    options?: (Effect.RunOptions & { readonly propagateInterruption?: boolean | undefined }) | undefined
  ) => Promise<XA>),
  never,
  R | Scope.Scope
> =>
  Effect.flatMap(
    make<A, E>(),
    (self) => runtimePromise(self)<R>()
  )

const internalFiberId = -1
const isInternalInterruption = Filter.toPredicate(Filter.compose(
  Cause.filterInterruptors,
  Filter.has(internalFiberId)
))

/**
 * Adds an existing fiber to the `FiberSet` using a synchronous, unsafe
 * mutation.
 *
 * **When to use**
 *
 * Use when an already forked fiber must be registered immediately and
 * synchronous interruption on a closed set is acceptable.
 *
 * **Details**
 *
 * When the fiber completes, it is removed from the set. If the set is already
 * closed, the supplied fiber is interrupted immediately. Non-interruption
 * failures are recorded for `FiberSet.join`.
 *
 * **Example** (Adding a fiber unsafely)
 *
 * ```ts import.meta.vitest
 * import { Effect, FiberSet } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const set = yield* FiberSet.make()
 *   const fiber = yield* Effect.forkChild(Effect.never)
 *
 *   // Unsafe add - doesn't return an Effect
 *   FiberSet.addUnsafe(set, fiber)
 *
 *   // The fiber is now managed by the set
 *   return yield* FiberSet.size(set)
 * })
 *
 * const actual = await Effect.runPromise(Effect.scoped(program))
 * actual // => 1
 * ```
 *
 * @category combinators
 * @since 4.0.0
 */
export const addUnsafe: {
  <A, E, XE extends E, XA extends A>(
    fiber: Fiber.Fiber<XA, XE>,
    options?: {
      readonly propagateInterruption?: boolean | undefined
    } | undefined
  ): (self: FiberSet<A, E>) => void
  <A, E, XE extends E, XA extends A>(
    self: FiberSet<A, E>,
    fiber: Fiber.Fiber<XA, XE>,
    options?: {
      readonly propagateInterruption?: boolean | undefined
    } | undefined
  ): void
} = dual((args) => isFiberSet(args[0]), <A, E, XE extends E, XA extends A>(
  self: FiberSet<A, E>,
  fiber: Fiber.Fiber<XA, XE>,
  options?: {
    readonly propagateInterruption?: boolean | undefined
  } | undefined
): void => {
  if (self.state._tag === "Closed") {
    fiber.interruptUnsafe(internalFiberId)
    return
  } else if (self.state.backing.has(fiber)) {
    return
  }
  self.state.backing.add(fiber)
  fiber.addObserver((exit) => {
    if (self.state._tag === "Closed") {
      return
    }
    self.state.backing.delete(fiber)
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
 * Adds a fiber to the FiberSet. When the fiber completes, it will be removed.
 *
 * **Example** (Adding a fiber)
 *
 * ```ts import.meta.vitest
 * import { Effect, FiberSet } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const set = yield* FiberSet.make()
 *   const fiber = yield* Effect.forkChild(Effect.never)
 *
 *   // Add the fiber to the set
 *   yield* FiberSet.add(set, fiber)
 *
 *   // The fiber is now managed by the set
 *   return yield* FiberSet.size(set)
 * })
 *
 * const actual = await Effect.runPromise(Effect.scoped(program))
 * actual // => 1
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const add: {
  <A, E, XE extends E, XA extends A>(
    fiber: Fiber.Fiber<XA, XE>,
    options?: {
      readonly propagateInterruption?: boolean | undefined
    } | undefined
  ): (self: FiberSet<A, E>) => Effect.Effect<void>
  <A, E, XE extends E, XA extends A>(
    self: FiberSet<A, E>,
    fiber: Fiber.Fiber<XA, XE>,
    options?: {
      readonly propagateInterruption?: boolean | undefined
    } | undefined
  ): Effect.Effect<void>
} = dual(
  (args) => isFiberSet(args[0]),
  <A, E, XE extends E, XA extends A>(
    self: FiberSet<A, E>,
    fiber: Fiber.Fiber<XA, XE>,
    options?: {
      readonly propagateInterruption?: boolean | undefined
    } | undefined
  ): Effect.Effect<void> => Effect.sync(() => addUnsafe(self, fiber, options))
)

/**
 * Interrupts all fibers in the `FiberSet` and clears the set.
 *
 * **Example** (Clearing all fibers)
 *
 * ```ts import.meta.vitest
 * import { Effect, FiberSet } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const set = yield* FiberSet.make()
 *
 *   // Add some fibers
 *   yield* FiberSet.run(set, Effect.never)
 *   yield* FiberSet.run(set, Effect.never)
 *
 *   const sizeBefore = yield* FiberSet.size(set)
 *
 *   // Clear all fibers
 *   yield* FiberSet.clear(set)
 *
 *   return [sizeBefore, yield* FiberSet.size(set)]
 * })
 *
 * const actual = await Effect.runPromise(Effect.scoped(program))
 * actual // => [2, 0]
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const clear = <A, E>(self: FiberSet<A, E>): Effect.Effect<void> =>
  Effect.suspend(() => {
    if (self.state._tag === "Closed") {
      return Effect.void
    }
    return Fiber.interruptAllAs(self.state.backing, internalFiberId)
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
 * Forks an Effect and adds the fiber to the FiberSet. The fiber is removed
 * when it completes. Set `startImmediately: false` to defer startup. By default,
 * the effect starts immediately.
 *
 * **Example** (Forking effects into a set)
 *
 * ```ts import.meta.vitest
 * import { Effect, Fiber, FiberSet } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const set = yield* FiberSet.make()
 *
 *   // Fork and add to set
 *   const fiber1 = yield* FiberSet.run(set, Effect.succeed("hello"))
 *   const fiber2 = yield* FiberSet.run(set, Effect.succeed("world"))
 *
 *   // Get results
 *   return [yield* Fiber.join(fiber1), yield* Fiber.join(fiber2)]
 * })
 *
 * const actual = await Effect.runPromise(Effect.scoped(program))
 * actual // => ["hello", "world"]
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const run: {
  <A, E>(
    self: FiberSet<A, E>,
    options?: {
      readonly propagateInterruption?: boolean | undefined
      readonly startImmediately?: boolean | undefined
    } | undefined
  ): <R, XE extends E, XA extends A>(
    effect: Effect.Effect<XA, XE, R>
  ) => Effect.Effect<Fiber.Fiber<XA, XE>, never, R>
  <A, E, R, XE extends E, XA extends A>(
    self: FiberSet<A, E>,
    effect: Effect.Effect<XA, XE, R>,
    options?: {
      readonly propagateInterruption?: boolean | undefined
      readonly startImmediately?: boolean | undefined
    } | undefined
  ): Effect.Effect<Fiber.Fiber<XA, XE>, never, R>
} = function() {
  const self = arguments[0] as FiberSet<any, any>
  if (!Effect.isEffect(arguments[1])) {
    const options = arguments[1]
    return (effect: Effect.Effect<any, any, any>) => runImpl(self, effect, options)
  }
  return runImpl(self, arguments[1], arguments[2]) as any
}

const runImpl = <A, E, R, XE extends E, XA extends A>(
  self: FiberSet<A, E>,
  effect: Effect.Effect<XA, XE, R>,
  options?: {
    readonly startImmediately?: boolean | undefined
    readonly propagateInterruption?: boolean | undefined
  }
): Effect.Effect<Fiber.Fiber<XA, XE>, never, R> =>
  Effect.withFiber((parent) => {
    if (self.state._tag === "Closed") {
      return Effect.sync(constInterruptedFiber)
    }
    const fiber: Fiber.Fiber<XA, XE> = internalEffect.forkUnsafe(
      parent,
      effect,
      options?.startImmediately ?? true,
      true
    )
    addUnsafe(self, fiber, options)
    return Effect.succeed(fiber)
  })

/**
 * Captures a `Runtime` and uses it to fork effects into the `FiberSet`.
 *
 * **Example** (Capturing a runtime)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Fiber, FiberSet } from "effect"
 *
 * class Users extends Context.Service<Users, {
 *   readonly getAll: Effect.Effect<Array<unknown>>
 * }>()("Users") {}
 *
 * const program = Effect.gen(function*() {
 *   const set = yield* FiberSet.make()
 *   const run = yield* FiberSet.runtime(set)<Users>()
 *
 *   // run some effects and add the fibers to the set
 *   const fiber = run(Effect.andThen(Users, (_) => _.getAll))
 *   return (yield* Fiber.join(fiber)).length
 * }).pipe(
 *   Effect.scoped // The fibers will be interrupted when the scope is closed
 * )
 *
 * const actual = await Effect.runPromise(Effect.provideService(program, Users, {
 *   getAll: Effect.succeed([])
 * }))
 * actual // => 0
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const runtime: <A, E>(
  self: FiberSet<A, E>
) => <R = never>() => Effect.Effect<
  <XE extends E, XA extends A>(
    effect: Effect.Effect<XA, XE, R>,
    options?:
      | Effect.RunOptions & { readonly propagateInterruption?: boolean | undefined }
      | undefined
  ) => Fiber.Fiber<XA, XE>,
  never,
  R
> = <A, E>(self: FiberSet<A, E>) => <R>() =>
  Effect.map(
    Effect.context<R>(),
    (services) => {
      const runFork = Effect.runForkWith(services)
      return <XE extends E, XA extends A>(
        effect: Effect.Effect<XA, XE, R>,
        options?:
          | Effect.RunOptions & { readonly propagateInterruption?: boolean | undefined }
          | undefined
      ) => {
        if (self.state._tag === "Closed") {
          return constInterruptedFiber()
        }
        const fiber = runFork(effect, options)
        addUnsafe(self, fiber, options)
        return fiber
      }
    }
  )

/**
 * Captures a `Runtime` and returns a Promise-based runner that forks effects
 * into the `FiberSet`.
 *
 * **When to use**
 *
 * Use when you need to bridge effects to `Promise` values while still tracking
 * their fibers in a `FiberSet`.
 *
 * **Details**
 *
 * The returned run function returns a `Promise` for each effect result.
 *
 * **Example** (Running effects as promises)
 *
 * ```ts import.meta.vitest
 * import { Effect, FiberSet } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const set = yield* FiberSet.make()
 *   const runPromise = yield* FiberSet.runtimePromise(set)()
 *
 *   // Run effects as promises
 *   const promise1 = runPromise(Effect.succeed("hello"))
 *   const promise2 = runPromise(Effect.succeed("world"))
 *
 *   return [yield* Effect.promise(() => promise1), yield* Effect.promise(() => promise2)]
 * })
 *
 * const actual = await Effect.runPromise(Effect.scoped(program))
 * actual // => ["hello", "world"]
 * ```
 *
 * @see {@link runtime} for a runner that returns the forked `Fiber`
 *
 * @category combinators
 * @since 3.13.0
 */
export const runtimePromise = <A, E>(self: FiberSet<A, E>): <R = never>() => Effect.Effect<
  <XE extends E, XA extends A>(
    effect: Effect.Effect<XA, XE, R>,
    options?:
      | Effect.RunOptions & { readonly propagateInterruption?: boolean | undefined }
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
      effect: Effect.Effect<XA, XE, R>,
      options?:
        | Effect.RunOptions & { readonly propagateInterruption?: boolean | undefined }
        | undefined
    ): Promise<XA> =>
      new Promise((resolve, reject) =>
        runFork(effect, options).addObserver((exit) => {
          if (Exit.isSuccess(exit)) {
            resolve(exit.value)
          } else {
            reject(Cause.squash(exit.cause))
          }
        })
      )
  )

/**
 * Gets the number of fibers currently in the FiberSet.
 *
 * **Example** (Checking the set size)
 *
 * ```ts import.meta.vitest
 * import { Effect, FiberSet } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const set = yield* FiberSet.make()
 *
 *   const sizeBefore = yield* FiberSet.size(set)
 *
 *   // Add some fibers
 *   yield* FiberSet.run(set, Effect.never)
 *   yield* FiberSet.run(set, Effect.never)
 *
 *   return [sizeBefore, yield* FiberSet.size(set)]
 * })
 *
 * const actual = await Effect.runPromise(Effect.scoped(program))
 * actual // => [0, 2]
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const size = <A, E>(self: FiberSet<A, E>): Effect.Effect<number> =>
  Effect.sync(() => self.state._tag === "Closed" ? 0 : self.state.backing.size)

/**
 * Joins all fibers in the FiberSet. If any fiber in the set terminates with a failure,
 * the returned Effect will terminate with the first failure that occurred.
 *
 * **Example** (Joining failing fibers)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit, FiberSet } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const set = yield* FiberSet.make()
 *   yield* FiberSet.add(set, Effect.runFork(Effect.fail("error")))
 *
 *   // parent fiber will fail with "error"
 *   yield* FiberSet.join(set)
 * })
 *
 * const actual = await Effect.runPromise(Effect.exit(Effect.scoped(program)))
 * actual // => Exit.fail("error")
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const join = <A, E>(self: FiberSet<A, E>): Effect.Effect<void, E> =>
  Deferred.await(self.deferred as Deferred.Deferred<void, E>)

/**
 * Waits until the fiber set is empty.
 *
 * **Example** (Waiting for an empty set)
 *
 * ```ts import.meta.vitest
 * import { Effect, FiberSet } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const set = yield* FiberSet.make()
 *
 *   yield* FiberSet.run(set, Effect.yieldNow)
 *   yield* FiberSet.run(set, Effect.yieldNow)
 *
 *   // Wait for all fibers to complete
 *   yield* FiberSet.awaitEmpty(set)
 *
 *   return yield* FiberSet.size(set)
 * })
 *
 * const actual = await Effect.runPromise(Effect.scoped(program))
 * actual // => 0
 * ```
 *
 * @category combinators
 * @since 3.13.0
 */
export const awaitEmpty = <A, E>(self: FiberSet<A, E>): Effect.Effect<void> =>
  Effect.whileLoop({
    while: () => self.state._tag === "Open" && self.state.backing.size > 0,
    body: () => Fiber.await(Iterable.headUnsafe(self)),
    step: constVoid
  })
