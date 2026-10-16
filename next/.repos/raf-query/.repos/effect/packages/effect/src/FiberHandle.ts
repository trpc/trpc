/**
 * Manages at most one fiber inside a scope.
 *
 * A `FiberHandle<A, E>` can hold one `Fiber<A, E>`. Installing a new fiber
 * interrupts the previous one unless the operation is configured with
 * `onlyIfMissing`, and closing the owning scope interrupts the current fiber.
 * This module includes constructors for handles and scoped runtimes, helpers
 * for setting, reading, clearing, and running fibers, and operations for joining
 * the current fiber or waiting until the handle is empty.
 *
 * @since 2.0.0
 */
import * as Cause from "./Cause.ts"
import * as Deferred from "./Deferred.ts"
import * as Effect from "./Effect.ts"
import * as Exit from "./Exit.ts"
import * as Fiber from "./Fiber.ts"
import * as Filter from "./Filter.ts"
import { dual } from "./Function.ts"
import type * as Inspectable from "./Inspectable.ts"
import { PipeInspectableProto } from "./internal/core.ts"
import * as internalEffect from "./internal/effect.ts"
import * as Option from "./Option.ts"
import type { Pipeable } from "./Pipeable.ts"
import * as Predicate from "./Predicate.ts"
import type { Scheduler } from "./Scheduler.ts"
import type * as Scope from "./Scope.ts"

const TypeId = "~effect/FiberHandle"

/**
 * Scoped handle that manages at most one fiber, interrupts the current fiber
 * when the handle's scope closes, and removes managed fibers from the handle
 * when they complete.
 *
 * **Example** (Managing a single fiber)
 *
 * ```ts import.meta.vitest
 * import { Effect, Fiber, FiberHandle } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   // Create a FiberHandle that can hold fibers producing strings
 *   const handle = yield* FiberHandle.make<string, never>()
 *
 *   // The handle can store and manage a single fiber
 *   const fiber = yield* FiberHandle.run(handle, Effect.succeed("hello"))
 *   return yield* Fiber.join(fiber)
 * })
 *
 * const actual = await Effect.runPromise(Effect.scoped(program))
 * actual // => "hello"
 * ```
 *
 * @category models
 * @since 2.0.0
 */
export interface FiberHandle<out A = unknown, out E = unknown> extends Pipeable, Inspectable.Inspectable {
  readonly [TypeId]: typeof TypeId
  readonly deferred: Deferred.Deferred<void, unknown>
  state: {
    readonly _tag: "Open"
    fiber: Fiber.Fiber<A, E> | undefined
  } | {
    readonly _tag: "Closed"
  }
}

/**
 * Returns `true` if a value is a `FiberHandle` by checking for the
 * `FiberHandle` runtime marker.
 *
 * **Example** (Checking fiber handles)
 *
 * ```ts import.meta.vitest
 * import { Effect, FiberHandle } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const handle = yield* FiberHandle.make()
 *
 *   return [FiberHandle.isFiberHandle(handle), FiberHandle.isFiberHandle("not a handle")]
 * })
 *
 * const actual = await Effect.runPromise(Effect.scoped(program))
 * actual // => [true, false]
 * ```
 *
 * @category guards
 * @since 2.0.0
 */
export const isFiberHandle = (u: unknown): u is FiberHandle => Predicate.hasProperty(u, TypeId)

const Proto = {
  [TypeId]: TypeId,
  ...PipeInspectableProto,
  toJSON(this: FiberHandle) {
    return {
      _id: "FiberHandle",
      state: this.state
    }
  }
}

const makeUnsafe = <A = unknown, E = unknown>(): FiberHandle<A, E> => {
  const self = Object.create(Proto)
  self.state = { _tag: "Open", fiber: undefined }
  self.deferred = Deferred.makeUnsafe()
  return self
}

/**
 * Creates a scoped `FiberHandle` that can store a single fiber.
 *
 * **Details**
 *
 * When the associated `Scope` is closed, the contained fiber will be
 * interrupted. You can add a fiber to the handle using `FiberHandle.run`, and
 * the fiber will be automatically removed from the `FiberHandle` when it
 * completes.
 *
 * **Example** (Creating a scoped fiber handle)
 *
 * ```ts import.meta.vitest
 * import { Effect, FiberHandle } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const handle = yield* FiberHandle.make()
 *
 *   // run some effects
 *   yield* FiberHandle.run(handle, Effect.never)
 *   // this will interrupt the previous fiber
 *   yield* FiberHandle.run(handle, Effect.never)
 *
 *   yield* Effect.yieldNow
 *   return handle.state._tag === "Open" && handle.state.fiber !== undefined
 * }).pipe(
 *   Effect.scoped // The fiber will be interrupted when the scope is closed
 * )
 *
 * const actual = await Effect.runPromise(program)
 * actual // => true
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const make = <A = unknown, E = unknown>(): Effect.Effect<FiberHandle<A, E>, never, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.sync(() => makeUnsafe<A, E>()),
    (handle) => {
      const state = handle.state
      if (state._tag === "Closed") return Effect.void
      handle.state = { _tag: "Closed" }
      return state.fiber ?
        Deferred.into(
          Effect.asVoid(Fiber.interruptAs(state.fiber, internalFiberId)),
          handle.deferred
        ) :
        Deferred.done(handle.deferred, Exit.void)
    }
  )

/**
 * Creates a scoped run function that forks effects into a new `FiberHandle`.
 *
 * **Details**
 *
 * Each call returns the forked fiber, stores it in the handle, and interrupts
 * the previous fiber unless `onlyIfMissing` is set. The managed fiber is
 * interrupted when the handle's scope closes.
 *
 * **Example** (Running effects with a fiber handle)
 *
 * ```ts import.meta.vitest
 * import { Cause, Effect, Exit, Fiber, FiberHandle } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const run = yield* FiberHandle.makeRuntime<never>()
 *
 *   // Run effects and get fibers back
 *   const fiberA = run(Effect.never)
 *   const fiberB = run(Effect.succeed("second"))
 *
 *   // The second fiber will interrupt the first
 *   const resultA = yield* Fiber.await(fiberA)
 *   const resultB = yield* Fiber.await(fiberB)
 *   return [resultA, resultB]
 * }).pipe(Effect.scoped)
 *
 * const actual = await Effect.runPromise(program)
 * actual // => [Exit.failCause(Cause.interrupt(-1)), Exit.succeed("second")]
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const makeRuntime = <R, E = unknown, A = unknown>(): Effect.Effect<
  <XE extends E, XA extends A>(
    effect: Effect.Effect<XA, XE, R>,
    options?:
      | {
        readonly signal?: AbortSignal | undefined
        readonly scheduler?: Scheduler | undefined
        readonly onlyIfMissing?: boolean | undefined
        readonly propagateInterruption?: boolean | undefined
      }
      | undefined
  ) => Fiber.Fiber<XA, XE>,
  never,
  Scope.Scope | R
> =>
  Effect.flatMap(
    make<A, E>(),
    (self) => runtime(self)<R>()
  )

/**
 * Creates a scoped run function that forks effects into a new `FiberHandle`
 * and returns a `Promise` for each effect result.
 *
 * **When to use**
 *
 * Use when integrating a scoped `FiberHandle` runner with Promise-based APIs
 * and Promise rejection from squashed failures is the desired boundary.
 *
 * **Details**
 *
 * Each call stores the fiber in the handle and interrupts the previous fiber
 * unless `onlyIfMissing` is set. The returned Promise resolves with the
 * effect's success value or rejects with the squashed failure cause.
 *
 * **Example** (Running effects as promises)
 *
 * ```ts import.meta.vitest
 * import { Effect, FiberHandle } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const run = yield* FiberHandle.makeRuntimePromise()
 *
 *   // Run effects and get promises back
 *   const promise = run(Effect.succeed("hello"))
 *   return yield* Effect.promise(() => promise)
 * }).pipe(Effect.scoped)
 *
 * const actual = await Effect.runPromise(program)
 * actual // => "hello"
 * ```
 *
 * @category constructors
 * @since 3.13.0
 */
export const makeRuntimePromise = <R = never, A = unknown, E = unknown>(): Effect.Effect<
  <XE extends E, XA extends A>(
    effect: Effect.Effect<XA, XE, R>,
    options?: {
      readonly signal?: AbortSignal | undefined
      readonly scheduler?: Scheduler | undefined
      readonly onlyIfMissing?: boolean | undefined
      readonly propagateInterruption?: boolean | undefined
    } | undefined
  ) => Promise<XA>,
  never,
  Scope.Scope | R
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
 * Sets the fiber in a FiberHandle. When the fiber completes, it will be removed from the FiberHandle.
 * If a fiber is already running, it will be interrupted unless `options.onlyIfMissing` is set.
 *
 * **When to use**
 *
 * Use when an existing forked fiber must be installed synchronously into a
 * handle and immediate interruption of replaced or closed fibers is acceptable.
 *
 * **Example** (Setting a fiber unsafely)
 *
 * ```ts import.meta.vitest
 * import { Effect, Fiber, FiberHandle } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const handle = yield* FiberHandle.make()
 *   const fiber = Effect.runFork(Effect.succeed("hello"))
 *
 *   // Set the fiber directly (unsafe)
 *   FiberHandle.setUnsafe(handle, fiber)
 *
 *   // The fiber is now managed by the handle
 *   return yield* Fiber.join(fiber)
 * })
 *
 * const actual = await Effect.runPromise(Effect.scoped(program))
 * actual // => "hello"
 * ```
 *
 * @category combinators
 * @since 4.0.0
 */
export const setUnsafe: {
  <A, E, XE extends E, XA extends A>(
    fiber: Fiber.Fiber<XA, XE>,
    options?: {
      readonly onlyIfMissing?: boolean | undefined
      readonly propagateInterruption?: boolean | undefined
    }
  ): (self: FiberHandle<A, E>) => void
  <A, E, XE extends E, XA extends A>(
    self: FiberHandle<A, E>,
    fiber: Fiber.Fiber<XA, XE>,
    options?: {
      readonly onlyIfMissing?: boolean | undefined
      readonly propagateInterruption?: boolean | undefined
    }
  ): void
} = dual((args) => isFiberHandle(args[0]), <A, E, XE extends E, XA extends A>(
  self: FiberHandle<A, E>,
  fiber: Fiber.Fiber<XA, XE>,
  options?: {
    readonly onlyIfMissing?: boolean | undefined
    readonly propagateInterruption?: boolean | undefined
  }
): void => {
  if (self.state._tag === "Closed") {
    fiber.interruptUnsafe(internalFiberId)
    return
  } else if (self.state.fiber !== undefined) {
    if (self.state.fiber === fiber) {
      return
    } else if (options?.onlyIfMissing === true) {
      fiber.interruptUnsafe(internalFiberId)
      return
    }
    self.state.fiber.interruptUnsafe(internalFiberId)
    self.state.fiber = undefined
  }

  self.state.fiber = fiber
  fiber.addObserver((exit) => {
    if (self.state._tag === "Open" && fiber === self.state.fiber) {
      self.state.fiber = undefined
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
 * Sets the fiber in the `FiberHandle`.
 *
 * **Details**
 *
 * When the fiber completes, it will be removed from the `FiberHandle`. If a
 * fiber already exists in the `FiberHandle`, it will be interrupted unless
 * `options.onlyIfMissing` is set.
 *
 * **Example** (Setting a fiber safely)
 *
 * ```ts import.meta.vitest
 * import { Effect, Fiber, FiberHandle } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const handle = yield* FiberHandle.make()
 *   const fiber = Effect.runFork(Effect.succeed("hello"))
 *
 *   // Set the fiber safely
 *   yield* FiberHandle.set(handle, fiber)
 *
 *   // The fiber is now managed by the handle
 *   return yield* Fiber.join(fiber)
 * })
 *
 * const actual = await Effect.runPromise(Effect.scoped(program))
 * actual // => "hello"
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const set: {
  <A, E, XE extends E, XA extends A>(
    fiber: Fiber.Fiber<XA, XE>,
    options?: {
      readonly onlyIfMissing?: boolean
      readonly propagateInterruption?: boolean | undefined
    }
  ): (self: FiberHandle<A, E>) => Effect.Effect<void>
  <A, E, XE extends E, XA extends A>(
    self: FiberHandle<A, E>,
    fiber: Fiber.Fiber<XA, XE>,
    options?: {
      readonly onlyIfMissing?: boolean
      readonly propagateInterruption?: boolean | undefined
    }
  ): Effect.Effect<void>
} = dual((args) => isFiberHandle(args[0]), <A, E, XE extends E, XA extends A>(
  self: FiberHandle<A, E>,
  fiber: Fiber.Fiber<XA, XE>,
  options?: {
    readonly onlyIfMissing?: boolean
    readonly propagateInterruption?: boolean | undefined
  }
): Effect.Effect<void> =>
  Effect.sync(() =>
    setUnsafe(self, fiber, {
      onlyIfMissing: options?.onlyIfMissing,
      propagateInterruption: options?.propagateInterruption
    })
  ))

/**
 * Retrieves the fiber from the FiberHandle synchronously.
 *
 * **When to use**
 *
 * Use when synchronous inspection of the current fiber is needed and an
 * `Option` result is enough outside the Effect workflow.
 *
 * **Example** (Reading the current fiber unsafely)
 *
 * ```ts import.meta.vitest
 * import { Effect, FiberHandle, Option } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const handle = yield* FiberHandle.make()
 *
 *   // No fiber initially
 *   const emptyFiber = FiberHandle.getUnsafe(handle)
 *
 *   // Add a fiber
 *   yield* FiberHandle.run(handle, Effect.never)
 *   const fiber = FiberHandle.getUnsafe(handle)
 *   return [emptyFiber, Option.map(fiber, () => true)]
 * })
 *
 * const actual = await Effect.runPromise(Effect.scoped(program))
 * actual // => [Option.none(), Option.some(true)]
 * ```
 *
 * @category combinators
 * @since 4.0.0
 */
export function getUnsafe<A, E>(self: FiberHandle<A, E>): Option.Option<Fiber.Fiber<A, E>> {
  return self.state._tag === "Closed" ? Option.none() : Option.fromUndefinedOr(self.state.fiber)
}

/**
 * Retrieves the fiber from the FiberHandle effectfully.
 *
 * **Example** (Reading the current fiber)
 *
 * ```ts import.meta.vitest
 * import { Effect, FiberHandle, Option } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const handle = yield* FiberHandle.make()
 *
 *   // Add a fiber
 *   yield* FiberHandle.run(handle, Effect.never)
 *
 *   // Get the current fiber if present
 *   const fiber = yield* FiberHandle.get(handle)
 *   return Option.map(fiber, () => true)
 * })
 *
 * const actual = await Effect.runPromise(Effect.scoped(program))
 * actual // => Option.some(true)
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export function get<A, E>(self: FiberHandle<A, E>): Effect.Effect<Option.Option<Fiber.Fiber<A, E>>> {
  return Effect.suspend(() => Effect.succeed(getUnsafe(self)))
}

/**
 * Interrupts the fiber currently stored in the `FiberHandle`, if any, and
 * leaves the handle empty.
 *
 * **Example** (Clearing a fiber handle)
 *
 * ```ts import.meta.vitest
 * import { Effect, FiberHandle, Option } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const handle = yield* FiberHandle.make()
 *
 *   // Add a fiber
 *   yield* FiberHandle.run(handle, Effect.never)
 *
 *   // Clear the handle, interrupting the fiber
 *   yield* FiberHandle.clear(handle)
 *
 *   // The handle is now empty
 *   return FiberHandle.getUnsafe(handle)
 * })
 *
 * const actual = await Effect.runPromise(Effect.scoped(program))
 * actual // => Option.none()
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const clear = <A, E>(self: FiberHandle<A, E>): Effect.Effect<void> =>
  Effect.uninterruptibleMask((restore) => {
    if (self.state._tag === "Closed" || self.state.fiber === undefined) {
      return Effect.void
    }
    const fiber = self.state.fiber
    return Effect.andThen(
      restore(Fiber.interruptAs(fiber, internalFiberId)),
      Effect.sync(() => {
        if (self.state._tag === "Open" && self.state.fiber === fiber) {
          self.state.fiber = undefined
        }
      })
    )
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
 * Forks an Effect and stores the resulting fiber in the `FiberHandle`.
 *
 * **Details**
 *
 * The handle manages only one fiber: running a new effect interrupts the
 * previous fiber unless `onlyIfMissing` is set. When the managed fiber
 * completes, it is removed from the handle.
 * Set `startImmediately: false` to defer startup. By default, the effect starts
 * immediately.
 *
 * **Example** (Running an effect in a fiber handle)
 *
 * ```ts import.meta.vitest
 * import { Effect, Fiber, FiberHandle } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const handle = yield* FiberHandle.make()
 *
 *   // Run an effect and get the fiber
 *   const fiber = yield* FiberHandle.run(handle, Effect.succeed("hello"))
 *   const result = yield* Fiber.join(fiber)
 *
 *   // Running another effect will interrupt the previous one
 *   const fiber2 = yield* FiberHandle.run(handle, Effect.succeed("world"))
 *   const result2 = yield* Fiber.join(fiber2)
 *   return [result, result2]
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
    self: FiberHandle<A, E>,
    options?: {
      readonly onlyIfMissing?: boolean
      readonly propagateInterruption?: boolean | undefined
      readonly startImmediately?: boolean | undefined
    }
  ): <R, XE extends E, XA extends A>(
    effect: Effect.Effect<XA, XE, R>
  ) => Effect.Effect<Fiber.Fiber<XA, XE>, never, R>
  <A, E, R, XE extends E, XA extends A>(
    self: FiberHandle<A, E>,
    effect: Effect.Effect<XA, XE, R>,
    options?: {
      readonly onlyIfMissing?: boolean
      readonly propagateInterruption?: boolean | undefined
      readonly startImmediately?: boolean | undefined
    }
  ): Effect.Effect<Fiber.Fiber<XA, XE>, never, R>
} = function() {
  const self = arguments[0] as FiberHandle
  if (Effect.isEffect(arguments[1])) {
    return runImpl(self, arguments[1], arguments[2]) as any
  }
  const options = arguments[1]
  return (effect: Effect.Effect<unknown, unknown, any>) => runImpl(self, effect, options)
}

const runImpl = <A, E, R, XE extends E, XA extends A>(
  self: FiberHandle<A, E>,
  effect: Effect.Effect<XA, XE, R>,
  options?: {
    readonly startImmediately?: boolean | undefined
    readonly onlyIfMissing?: boolean | undefined
  }
): Effect.Effect<Fiber.Fiber<XA, XE>, never, R> =>
  Effect.withFiber((parent) => {
    if (self.state._tag === "Closed") {
      return Effect.interrupt
    } else if (self.state.fiber !== undefined && options?.onlyIfMissing === true) {
      return Effect.sync(constInterruptedFiber)
    }
    const fiber: Fiber.Fiber<XA, XE> = internalEffect.forkUnsafe(
      parent,
      effect,
      options?.startImmediately ?? true,
      true
    )
    setUnsafe(self, fiber, options)
    return Effect.succeed(fiber)
  })

/**
 * Captures the current runtime and returns a function for forking effects into
 * an existing `FiberHandle`.
 *
 * **Details**
 *
 * Each call returns the forked fiber, stores it in the handle, and interrupts
 * the previous fiber unless `onlyIfMissing` is set.
 *
 * **Example** (Capturing a runtime for fiber handles)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Fiber, FiberHandle } from "effect"
 *
 * class Users extends Context.Service<Users, {
 *   readonly getAll: Effect.Effect<Array<unknown>>
 * }>()("Users") {}
 *
 * const program = Effect.gen(function*() {
 *   const handle = yield* FiberHandle.make()
 *   const run = yield* FiberHandle.runtime(handle)<Users>()
 *
 *   // run an effect and set the fiber in the handle
 *   const fiberA = run(Effect.andThen(Users, (_) => _.getAll))
 *
 *   // this will interrupt the previous fiber
 *   const fiberB = run(Effect.andThen(Users, (_) => _.getAll))
 *   yield* Fiber.await(fiberA)
 *   return (yield* Fiber.join(fiberB)).length
 * }).pipe(
 *   Effect.scoped // The fiber will be interrupted when the scope is closed
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
  self: FiberHandle<A, E>
) => <R = never>() => Effect.Effect<
  <XE extends E, XA extends A>(
    effect: Effect.Effect<XA, XE, R>,
    options?:
      | {
        readonly signal?: AbortSignal | undefined
        readonly scheduler?: Scheduler | undefined
        readonly onlyIfMissing?: boolean | undefined
        readonly propagateInterruption?: boolean | undefined
      }
      | undefined
  ) => Fiber.Fiber<XA, XE>,
  never,
  R
> = <A, E>(self: FiberHandle<A, E>) => <R>() =>
  Effect.map(
    Effect.context<R>(),
    (services) => {
      const runFork = Effect.runForkWith(services)
      return <XE extends E, XA extends A>(
        effect: Effect.Effect<XA, XE, R>,
        options?:
          | {
            readonly signal?: AbortSignal | undefined
            readonly scheduler?: Scheduler | undefined
            readonly onlyIfMissing?: boolean | undefined
            readonly propagateInterruption?: boolean | undefined
          }
          | undefined
      ) => {
        if (self.state._tag === "Closed") {
          return constInterruptedFiber()
        } else if (self.state.fiber !== undefined && options?.onlyIfMissing === true) {
          return constInterruptedFiber()
        }
        const fiber = runFork(effect, options)
        setUnsafe(self, fiber, options)
        return fiber
      }
    }
  )

/**
 * Captures the current runtime and returns a function for running effects in
 * an existing `FiberHandle` as Promises.
 *
 * **Details**
 *
 * Each call stores the forked fiber in the handle and interrupts the previous
 * fiber unless `onlyIfMissing` is set. The Promise resolves with the effect's
 * success value or rejects with the squashed failure cause.
 *
 * **Example** (Capturing a runtime for promises)
 *
 * ```ts import.meta.vitest
 * import { Effect, FiberHandle } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const handle = yield* FiberHandle.make()
 *   const runPromise = yield* FiberHandle.runtimePromise(handle)<never>()
 *
 *   // Run an effect and get a promise
 *   const promise = runPromise(Effect.succeed("hello"))
 *   return yield* Effect.promise(() => promise)
 * })
 *
 * const actual = await Effect.runPromise(Effect.scoped(program))
 * actual // => "hello"
 * ```
 *
 * @category combinators
 * @since 3.13.0
 */
export const runtimePromise = <A, E>(self: FiberHandle<A, E>): <R = never>() => Effect.Effect<
  <XE extends E, XA extends A>(
    effect: Effect.Effect<XA, XE, R>,
    options?:
      | {
        readonly signal?: AbortSignal | undefined
        readonly scheduler?: Scheduler | undefined
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
      effect: Effect.Effect<XA, XE, R>,
      options?:
        | {
          readonly signal?: AbortSignal | undefined
          readonly scheduler?: Scheduler | undefined
          readonly onlyIfMissing?: boolean | undefined
          readonly propagateInterruption?: boolean | undefined
        }
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
 * Waits for the `FiberHandle` to fail or close.
 *
 * **Details**
 *
 * The returned Effect fails with the first managed fiber failure that is not
 * ignored by the handle's interruption rules. Normal successful completion of
 * a managed fiber only removes it from the handle; use `awaitEmpty` to wait
 * for the current fiber to finish.
 *
 * **Example** (Propagating fiber failures)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit, FiberHandle } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const handle = yield* FiberHandle.make()
 *   yield* FiberHandle.set(handle, Effect.runFork(Effect.fail("error")))
 *
 *   // parent fiber will fail with "error"
 *   yield* FiberHandle.join(handle)
 * })
 *
 * const actual = await Effect.runPromise(Effect.exit(Effect.scoped(program)))
 * actual // => Exit.fail("error")
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const join = <A, E>(self: FiberHandle<A, E>): Effect.Effect<void, E> =>
  Deferred.await(self.deferred as Deferred.Deferred<void, E>)

/**
 * Waits for the fiber in the FiberHandle to complete.
 *
 * **Example** (Waiting for a fiber to complete)
 *
 * ```ts import.meta.vitest
 * import { Effect, FiberHandle, Option } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const handle = yield* FiberHandle.make()
 *
 *   yield* FiberHandle.run(handle, Effect.yieldNow)
 *
 *   // Wait for the fiber to complete
 *   yield* FiberHandle.awaitEmpty(handle)
 *
 *   return yield* FiberHandle.get(handle)
 * })
 *
 * const actual = await Effect.runPromise(Effect.scoped(program))
 * actual // => Option.none()
 * ```
 *
 * @category combinators
 * @since 3.13.0
 */
export const awaitEmpty = <A, E>(self: FiberHandle<A, E>): Effect.Effect<void, E> =>
  Effect.suspend(() => {
    if (self.state._tag === "Closed" || self.state.fiber === undefined) {
      return Effect.void
    }
    return Fiber.await(self.state.fiber)
  })
