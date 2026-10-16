/**
 * One-time coordination cells for Effect programs. A `Deferred<A, E>` starts
 * empty, can be completed exactly once with a success, failure, defect, or
 * interruption, and lets any number of fibers wait for that result. Awaiting a
 * `Deferred` suspends the fiber instead of blocking an operating-system thread,
 * and every waiter observes the same completion.
 *
 * @since 2.0.0
 */
import type * as Cause from "./Cause.ts"
import type { Effect } from "./Effect.ts"
import type * as Exit from "./Exit.ts"
import { dual, identity, type LazyArg } from "./Function.ts"
import * as core from "./internal/core.ts"
import * as internalEffect from "./internal/effect.ts"
import * as Option from "./Option.ts"
import type { Pipeable } from "./Pipeable.ts"
import { pipeArguments } from "./Pipeable.ts"
import { hasProperty } from "./Predicate.ts"
import type * as Types from "./Types.ts"

const TypeId = "~effect/Deferred"

/**
 * A `Deferred` represents an asynchronous variable that can be set exactly
 * once, with the ability for an arbitrary number of fibers to suspend (by
 * calling `Deferred.await`) and automatically resume when the variable is set.
 *
 * **When to use**
 *
 * Use to coordinate multiple fibers around a value or failure that will be
 * supplied exactly once.
 *
 * **Example** (Creating a Deferred for inter-fiber communication)
 *
 * ```ts import.meta.vitest
 * import { Deferred, Effect, Fiber } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const deferred: Deferred.Deferred<string> = yield* Deferred.make<string>()
 *   const producer = yield* Effect.forkChild(
 *     Effect.gen(function*() {
 *       yield* Deferred.succeed(deferred, "Hello, World!")
 *     })
 *   )
 *
 *   const consumer = yield* Effect.forkChild(Deferred.await(deferred))
 *   yield* Fiber.join(producer)
 *   return yield* Fiber.join(consumer)
 * })
 *
 * await Effect.runPromise(program) // => "Hello, World!"
 * ```
 *
 * @category models
 * @since 2.0.0
 */
export interface Deferred<in out A, in out E = never> extends Deferred.Variance<A, E>, Pipeable {
  effect?: Effect<A, E>
  resumes?: Array<(effect: Effect<A, E>) => void> | undefined
}

/**
 * Checks whether a value is a `Deferred`.
 *
 * **When to use**
 *
 * Use to validate unknown values at runtime boundaries before treating them as
 * `Deferred` values.
 *
 * @category guards
 * @since 4.0.0
 */
export const isDeferred = <A, E>(u: unknown): u is Deferred<A, E> => hasProperty(u, TypeId)

/**
 * Companion namespace containing type-level metadata for `Deferred`.
 *
 * **When to use**
 *
 * Use to reference type-level metadata associated with `Deferred`.
 *
 * @since 2.0.0
 */
export declare namespace Deferred {
  /**
   * Type-level variance marker for the value and error channels of `Deferred`.
   *
   * **When to use**
   *
   * Use to carry the value and error type parameters for `Deferred` in Effect's
   * type machinery.
   *
   * **Details**
   *
   * This interface is part of the public type structure and is not intended to
   * be constructed directly.
   *
   * @category models
   * @since 2.0.0
   */
  export interface Variance<in out A, in out E> {
    readonly [TypeId]: {
      readonly _A: Types.Invariant<A>
      readonly _E: Types.Invariant<E>
    }
  }
}

const DeferredProto = {
  [TypeId]: {
    _A: identity,
    _E: identity
  },
  pipe() {
    return pipeArguments(this, arguments)
  }
}

const DeferredImpl = function(this: any) {
  this.resumes = undefined
  this.effect = undefined
} as unknown as { new<A, E>(): Deferred<A, E>; prototype: any }
DeferredImpl.prototype = DeferredProto

/**
 * Creates an empty `Deferred` synchronously outside the `Effect` runtime.
 *
 * **When to use**
 *
 * Use to allocate a `Deferred` synchronously when direct allocation outside
 * `Effect` is required.
 *
 * **Example** (Creating a Deferred unsafely)
 *
 * ```ts import.meta.vitest
 * import { Deferred } from "effect"
 *
 * const deferred = Deferred.makeUnsafe<number>()
 * Deferred.isDoneUnsafe(deferred) // => false
 * ```
 *
 * @category unsafe
 * @since 4.0.0
 */
export const makeUnsafe = <A, E = never>(): Deferred<A, E> => new DeferredImpl<A, E>()

/**
 * Creates a new `Deferred`.
 *
 * **When to use**
 *
 * Use to allocate an empty `Deferred` inside an `Effect` workflow.
 *
 * **Example** (Creating a Deferred)
 *
 * ```ts import.meta.vitest
 * import { Deferred, Effect } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const deferred = yield* Deferred.make<number>()
 *   yield* Deferred.succeed(deferred, 42)
 *   return yield* Deferred.await(deferred)
 * })
 *
 * await Effect.runPromise(program) // => 42
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const make = <A, E = never>(): Effect<Deferred<A, E>> => internalEffect.sync(() => makeUnsafe())

const _await = <A, E>(self: Deferred<A, E>): Effect<A, E> =>
  internalEffect.callback<A, E>((resume) => {
    if (self.effect) return resume(self.effect)
    self.resumes ??= []
    self.resumes.push(resume)
    return internalEffect.sync(() => {
      // Completion resumes all waiters and clears `resumes`, so a cleanup
      // running after completion has nothing to unregister.
      const resumes = self.resumes
      if (resumes === undefined) return
      const index = resumes.indexOf(resume)
      if (index >= 0) resumes.splice(index, 1)
    })
  })

export {
  /**
   * Retrieves the value of the `Deferred`, suspending the fiber running the
   * workflow until the result is available.
   *
   * **When to use**
   *
   * Use to wait for a `Deferred` to be completed and resume with its success,
   * failure, defect, or interruption.
   *
   * **Details**
   *
   * Awaiters observe the completion effect stored in the `Deferred`.
   *
   * **Example** (Awaiting a Deferred value)
   *
   * ```ts import.meta.vitest
   * import { Deferred, Effect } from "effect"
   *
   * const program = Effect.gen(function*() {
   *   const deferred = yield* Deferred.make<number>()
   *   yield* Deferred.succeed(deferred, 42)
   *
   *   return yield* Deferred.await(deferred)
   * })
   *
   * await Effect.runPromise(program) // => 42
   * ```
   *
   * @see {@link complete} for completing from an effect and memoizing its result
   * @see {@link completeWith} for completing with an effect directly
   *
   * @category getters
   * @since 2.0.0
   */
  _await as await
}

/**
 * Runs the supplied `Effect` and attempts to complete the `Deferred` with its
 * memoized result.
 *
 * **When to use**
 *
 * Use when completing a `Deferred` should run an effect once and share its
 * result with all awaiters.
 *
 * **Details**
 *
 * The returned effect succeeds with `true` when this call completed the
 * `Deferred`, or `false` if it was already completed.
 *
 * **Example** (Completing a Deferred from an effect)
 *
 * ```ts import.meta.vitest
 * import { Deferred, Effect } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const deferred = yield* Deferred.make<number>()
 *   const completed = yield* Deferred.complete(deferred, Effect.succeed(42))
 *   const value = yield* Deferred.await(deferred)
 *   return [completed, value]
 * })
 *
 * await Effect.runPromise(program) // => [true, 42]
 * ```
 *
 * @see {@link completeWith} for storing an effect directly without memoizing its result
 *
 * @category completion
 * @since 2.0.0
 */
export const complete: {
  <A, E, R>(effect: Effect<A, E, R>): (self: Deferred<A, E>) => Effect<boolean, never, R>
  <A, E, R>(self: Deferred<A, E>, effect: Effect<A, E, R>): Effect<boolean, never, R>
} = dual(
  2,
  <A, E, R>(self: Deferred<A, E>, effect: Effect<A, E, R>): Effect<boolean, never, R> =>
    internalEffect.suspend(() => self.effect ? internalEffect.succeed(false) : into(effect, self))
)

/**
 * Attempts to complete the `Deferred` with the specified effect directly.
 *
 * **When to use**
 *
 * Use to store an already environment-free effect as the completion without
 * running it during completion.
 *
 * **Details**
 *
 * The returned effect succeeds with `true` when this call completed the
 * `Deferred`, or `false` if it was already completed.
 *
 * **Gotchas**
 *
 * The supplied effect is not memoized by `completeWith`; each awaiter may run
 * the stored effect independently.
 *
 * **Example** (Completing a Deferred with an effect)
 *
 * ```ts import.meta.vitest
 * import { Deferred, Effect } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const deferred = yield* Deferred.make<number>()
 *   const completed = yield* Deferred.completeWith(deferred, Effect.succeed(42))
 *   const value = yield* Deferred.await(deferred)
 *   return [completed, value]
 * })
 *
 * await Effect.runPromise(program) // => [true, 42]
 * ```
 *
 * @see {@link complete} for running an effect once and sharing its result
 * @see {@link done} for completing from an already computed `Exit`
 *
 * @category completion
 * @since 2.0.0
 */
export const completeWith: {
  <A, E>(effect: Effect<A, E>): (self: Deferred<A, E>) => Effect<boolean>
  <A, E>(self: Deferred<A, E>, effect: Effect<A, E>): Effect<boolean>
} = dual(
  2,
  <A, E>(self: Deferred<A, E>, effect: Effect<A, E>): Effect<boolean> =>
    internalEffect.sync(() => doneUnsafe(self, effect))
)

/**
 * Completes the `Deferred` with the specified `Exit` value, which will be
 * propagated to all fibers waiting on the value of the `Deferred`.
 *
 * **When to use**
 *
 * Use to complete a `Deferred` from an already computed `Exit`.
 *
 * **Details**
 *
 * The returned effect succeeds with `true` when this call completed the
 * `Deferred`, or `false` if it was already completed.
 *
 * **Example** (Completing a Deferred with an Exit)
 *
 * ```ts import.meta.vitest
 * import { Deferred, Effect, Exit } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const deferred = yield* Deferred.make<number>()
 *   yield* Deferred.done(deferred, Exit.succeed(42))
 *   return yield* Effect.exit(Deferred.await(deferred))
 * })
 *
 * await Effect.runPromise(program) // => Exit.succeed(42)
 * ```
 *
 * @see {@link complete} for completing from an effect and memoizing its result
 * @see {@link completeWith} for storing an effect directly
 * @see {@link succeed} for completing with a success value
 * @see {@link failCause} for completing with a failure cause
 *
 * @category completion
 * @since 2.0.0
 */
export const done: {
  <A, E>(exit: Exit.Exit<A, E>): (self: Deferred<A, E>) => Effect<boolean>
  <A, E>(self: Deferred<A, E>, exit: Exit.Exit<A, E>): Effect<boolean>
} = completeWith as any

/**
 * Attempts to complete the `Deferred` with the specified error.
 *
 * **When to use**
 *
 * Use to complete a `Deferred` with a typed failure value.
 *
 * **Details**
 *
 * Fibers waiting on the `Deferred` fail with that error only if this call
 * completes it. The returned effect succeeds with `true` when this call
 * completed the `Deferred`, or `false` if it was already completed.
 *
 * **Example** (Failing a Deferred with an error)
 *
 * ```ts import.meta.vitest
 * import { Deferred, Effect, Exit } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const deferred = yield* Deferred.make<number, string>()
 *   const success = yield* Deferred.fail(deferred, "Operation failed")
 *   const exit = yield* Effect.exit(Deferred.await(deferred))
 *   return [success, exit]
 * })
 *
 * await Effect.runPromise(program) // => [true, Exit.fail("Operation failed")]
 * ```
 *
 * @category completion
 * @since 2.0.0
 */
export const fail: {
  <E>(error: E): <A>(self: Deferred<A, E>) => Effect<boolean>
  <A, E>(self: Deferred<A, E>, error: E): Effect<boolean>
} = dual(2, <A, E>(self: Deferred<A, E>, error: E): Effect<boolean> => done(self, core.exitFail(error)))

/**
 * Computes an error when the returned effect is run, then attempts to complete
 * the `Deferred` with that error.
 *
 * **When to use**
 *
 * Use to lazily compute a typed failure value when the `Deferred` completion
 * effect runs.
 *
 * **Details**
 *
 * Fibers waiting on the `Deferred` fail with the computed error only if this
 * call completes it. The returned effect succeeds with `true` when this call
 * completed the `Deferred`, or `false` if it was already completed.
 *
 * **Example** (Failing a Deferred with a lazy error)
 *
 * ```ts import.meta.vitest
 * import { Deferred, Effect, Exit } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const deferred = yield* Deferred.make<number, string>()
 *   const success = yield* Deferred.failSync(deferred, () => "Lazy error")
 *   const exit = yield* Effect.exit(Deferred.await(deferred))
 *   return [success, exit]
 * })
 *
 * await Effect.runPromise(program) // => [true, Exit.fail("Lazy error")]
 * ```
 *
 * @category completion
 * @since 2.0.0
 */
export const failSync: {
  <E>(evaluate: LazyArg<E>): <A>(self: Deferred<A, E>) => Effect<boolean>
  <A, E>(self: Deferred<A, E>, evaluate: LazyArg<E>): Effect<boolean>
} = dual(
  2,
  <A, E>(self: Deferred<A, E>, evaluate: LazyArg<E>): Effect<boolean> =>
    internalEffect.suspend(() => fail(self, evaluate()))
)

/**
 * Attempts to complete the `Deferred` with the specified `Cause`.
 *
 * **When to use**
 *
 * Use to complete a `Deferred` with a full failure cause.
 *
 * **Details**
 *
 * Fibers waiting on the `Deferred` observe that cause only if this call
 * completes it. The returned effect succeeds with `true` when this call
 * completed the `Deferred`, or `false` if it was already completed.
 *
 * **Example** (Failing a Deferred with a Cause)
 *
 * ```ts import.meta.vitest
 * import { Cause, Deferred, Effect, Exit } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const deferred = yield* Deferred.make<number, string>()
 *   const success = yield* Deferred.failCause(deferred, Cause.fail("Operation failed"))
 *   const exit = yield* Effect.exit(Deferred.await(deferred))
 *   return [success, exit]
 * })
 *
 * await Effect.runPromise(program) // => [true, Exit.failCause(Cause.fail("Operation failed"))]
 * ```
 *
 * @category completion
 * @since 2.0.0
 */
export const failCause: {
  <E>(cause: Cause.Cause<E>): <A>(self: Deferred<A, E>) => Effect<boolean>
  <A, E>(self: Deferred<A, E>, cause: Cause.Cause<E>): Effect<boolean>
} = dual(
  2,
  <A, E>(self: Deferred<A, E>, cause: Cause.Cause<E>): Effect<boolean> => done(self, core.exitFailCause(cause))
)

/**
 * Computes a `Cause` when the returned effect is run, then attempts to
 * complete the `Deferred` with that cause.
 *
 * **When to use**
 *
 * Use to lazily compute a full failure cause when the `Deferred` completion
 * effect runs.
 *
 * **Details**
 *
 * Fibers waiting on the `Deferred` observe the computed cause only if this
 * call completes it. The returned effect succeeds with `true` when this call
 * completed the `Deferred`, or `false` if it was already completed.
 *
 * **Example** (Failing a Deferred with a lazy Cause)
 *
 * ```ts import.meta.vitest
 * import { Cause, Deferred, Effect, Exit } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const deferred = yield* Deferred.make<number, string>()
 *   const success = yield* Deferred.failCauseSync(deferred, () => Cause.fail("Lazy error"))
 *   const exit = yield* Effect.exit(Deferred.await(deferred))
 *   return [success, exit]
 * })
 *
 * await Effect.runPromise(program) // => [true, Exit.failCause(Cause.fail("Lazy error"))]
 * ```
 *
 * @category completion
 * @since 2.0.0
 */
export const failCauseSync: {
  <E>(evaluate: LazyArg<Cause.Cause<E>>): <A>(self: Deferred<A, E>) => Effect<boolean>
  <A, E>(self: Deferred<A, E>, evaluate: LazyArg<Cause.Cause<E>>): Effect<boolean>
} = dual(
  2,
  <A, E>(self: Deferred<A, E>, evaluate: LazyArg<Cause.Cause<E>>): Effect<boolean> =>
    internalEffect.suspend(() => failCause(self, evaluate()))
)

/**
 * Attempts to complete the `Deferred` with a defect.
 *
 * **When to use**
 *
 * Use to complete a `Deferred` with an unexpected defect.
 *
 * **Details**
 *
 * Fibers waiting on the `Deferred` die with that defect only if this call
 * completes it. The returned effect succeeds with `true` when this call
 * completed the `Deferred`, or `false` if it was already completed.
 *
 * **Example** (Killing a Deferred with a defect)
 *
 * ```ts import.meta.vitest
 * import { Deferred, Effect, Exit } from "effect"
 *
 * const defect = new Error("Something went wrong")
 * const program = Effect.gen(function*() {
 *   const deferred = yield* Deferred.make<number>()
 *   const success = yield* Deferred.die(deferred, defect)
 *   const exit = yield* Effect.exit(Deferred.await(deferred))
 *   return [success, exit]
 * })
 *
 * await Effect.runPromise(program) // => [true, Exit.die(defect)]
 * ```
 *
 * @category completion
 * @since 2.0.0
 */
export const die: {
  (defect: unknown): <A, E>(self: Deferred<A, E>) => Effect<boolean>
  <A, E>(self: Deferred<A, E>, defect: unknown): Effect<boolean>
} = dual(2, <A, E>(self: Deferred<A, E>, defect: unknown): Effect<boolean> => done(self, core.exitDie(defect)))

/**
 * Computes a defect when the returned effect is run, then attempts to complete
 * the `Deferred` with that defect.
 *
 * **When to use**
 *
 * Use to lazily compute an unexpected defect when the completion effect runs.
 *
 * **Details**
 *
 * Fibers waiting on the `Deferred` die with the computed defect only if this
 * call completes it. The returned effect succeeds with `true` when this call
 * completed the `Deferred`, or `false` if it was already completed.
 *
 * **Example** (Killing a Deferred with a lazy defect)
 *
 * ```ts import.meta.vitest
 * import { Deferred, Effect, Exit } from "effect"
 *
 * const defect = new Error("Lazy error")
 * const program = Effect.gen(function*() {
 *   const deferred = yield* Deferred.make<number>()
 *   const success = yield* Deferred.dieSync(deferred, () => defect)
 *   const exit = yield* Effect.exit(Deferred.await(deferred))
 *   return [success, exit]
 * })
 *
 * await Effect.runPromise(program) // => [true, Exit.die(defect)]
 * ```
 *
 * @category completion
 * @since 2.0.0
 */
export const dieSync: {
  (evaluate: LazyArg<unknown>): <A, E>(self: Deferred<A, E>) => Effect<boolean>
  <A, E>(self: Deferred<A, E>, evaluate: LazyArg<unknown>): Effect<boolean>
} = dual(
  2,
  <A, E>(self: Deferred<A, E>, evaluate: LazyArg<unknown>): Effect<boolean> =>
    internalEffect.suspend(() => die(self, evaluate()))
)

/**
 * Attempts to complete the `Deferred` with interruption by the current fiber.
 *
 * **When to use**
 *
 * Use to complete a `Deferred` as interrupted by the current fiber.
 *
 * **Details**
 *
 * Fibers waiting on the `Deferred` are interrupted with the current fiber id
 * only if this call completes it. The returned effect succeeds with `true`
 * when this call completed the `Deferred`, or `false` if it was already
 * completed.
 *
 * **Example** (Interrupting a Deferred)
 *
 * ```ts import.meta.vitest
 * import { Deferred, Effect, Exit } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const deferred = yield* Deferred.make<number>()
 *   const success = yield* Deferred.interrupt(deferred)
 *   const exit = yield* Effect.exit(Deferred.await(deferred))
 *   return [success, exit] as const
 * })
 *
 * const [success, exit] = await Effect.runPromise(program)
 * success // => true
 * Exit.hasInterrupts(exit) // => true
 * ```
 *
 * @category completion
 * @since 2.0.0
 */
export const interrupt = <A, E>(self: Deferred<A, E>): Effect<boolean> =>
  core.withFiber((fiber) => interruptWith(self, fiber.id))

/**
 * Attempts to complete the `Deferred` with interruption by the specified
 * `FiberId`.
 *
 * **When to use**
 *
 * Use to complete a `Deferred` as interrupted by a specific fiber id.
 *
 * **Details**
 *
 * Fibers waiting on the `Deferred` are interrupted with that fiber id only if
 * this call completes it. The returned effect succeeds with `true` when this
 * call completed the `Deferred`, or `false` if it was already completed.
 *
 * **Example** (Interrupting a Deferred with a fiber id)
 *
 * ```ts import.meta.vitest
 * import { Deferred, Effect, Exit } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const deferred = yield* Deferred.make<number>()
 *   const success = yield* Deferred.interruptWith(deferred, 42)
 *   const exit = yield* Effect.exit(Deferred.await(deferred))
 *   return [success, exit]
 * })
 *
 * await Effect.runPromise(program) // => [true, Exit.interrupt(42)]
 * ```
 *
 * @category completion
 * @since 2.0.0
 */
export const interruptWith: {
  (fiberId: number): <A, E>(self: Deferred<A, E>) => Effect<boolean>
  <A, E>(self: Deferred<A, E>, fiberId: number): Effect<boolean>
} = dual(
  2,
  <A, E>(self: Deferred<A, E>, fiberId: number): Effect<boolean> =>
    failCause(self, internalEffect.causeInterrupt(fiberId))
)

/**
 * Returns `true` if this `Deferred` has already been completed with a value or
 * an error, `false` otherwise.
 *
 * **When to use**
 *
 * Use to check completion status inside an `Effect` workflow.
 *
 * **Example** (Checking Deferred completion)
 *
 * ```ts import.meta.vitest
 * import { Deferred, Effect } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const deferred = yield* Deferred.make<number>()
 *   const beforeCompletion = yield* Deferred.isDone(deferred)
 *   yield* Deferred.succeed(deferred, 42)
 *   const afterCompletion = yield* Deferred.isDone(deferred)
 *   return [beforeCompletion, afterCompletion]
 * })
 *
 * await Effect.runPromise(program) // => [false, true]
 * ```
 *
 * @category predicates
 * @since 2.0.0
 */
export const isDone = <A, E>(self: Deferred<A, E>): Effect<boolean> => internalEffect.sync(() => isDoneUnsafe(self))

/**
 * Returns whether this `Deferred` has already been completed synchronously.
 *
 * **When to use**
 *
 * Use to check `Deferred` completion synchronously in code that cannot return
 * an `Effect`, such as low-level integration code.
 *
 * @see {@link isDone} for checking completion inside `Effect`
 * @see {@link poll} for reading the completed effect when available
 *
 * @category predicates
 * @since 4.0.0
 */
export const isDoneUnsafe = <A, E>(self: Deferred<A, E>): boolean => self.effect !== undefined

/**
 * Returns the current completion effect as an `Option`. This returns
 * `Option.some(effect)` when the `Deferred` is completed, `Option.none()`
 * otherwise.
 *
 * **When to use**
 *
 * Use to inspect whether a `Deferred` is already completed and retrieve its
 * stored completion effect when available.
 *
 * **Example** (Polling Deferred completion)
 *
 * ```ts import.meta.vitest
 * import { Deferred, Effect, Option } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const deferred = yield* Deferred.make<number>()
 *   const beforeCompletion = yield* Deferred.poll(deferred)
 *   yield* Deferred.succeed(deferred, 42)
 *   const afterCompletion = yield* Deferred.poll(deferred)
 *   const afterValue = yield* Effect.transposeOption(afterCompletion)
 *   return [beforeCompletion, afterValue]
 * })
 *
 * await Effect.runPromise(program) // => [Option.none(), Option.some(42)]
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export function poll<A, E>(self: Deferred<A, E>): Effect<Option.Option<Effect<A, E>>> {
  return internalEffect.sync(() => Option.fromUndefinedOr(self.effect))
}

/**
 * Attempts to complete the `Deferred` with the specified value.
 *
 * **When to use**
 *
 * Use to complete a `Deferred` with a successful value.
 *
 * **Details**
 *
 * Fibers waiting on the `Deferred` receive the value only if this call
 * completes it. The returned effect succeeds with `true` when this call
 * completed the `Deferred`, or `false` if it was already completed.
 *
 * **Example** (Completing a Deferred with a value)
 *
 * ```ts import.meta.vitest
 * import { Deferred, Effect } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const deferred = yield* Deferred.make<number>()
 *   yield* Deferred.succeed(deferred, 42)
 *
 *   return yield* Deferred.await(deferred)
 * })
 *
 * await Effect.runPromise(program) // => 42
 * ```
 *
 * @category completion
 * @since 2.0.0
 */
export const succeed: {
  <A>(value: A): <E>(self: Deferred<A, E>) => Effect<boolean>
  <A, E>(self: Deferred<A, E>, value: A): Effect<boolean>
} = dual(2, <A, E>(self: Deferred<A, E>, value: A): Effect<boolean> => done(self, core.exitSucceed(value)))

/**
 * Computes a value when the returned effect is run, then attempts to complete
 * the `Deferred` with that value.
 *
 * **When to use**
 *
 * Use to lazily compute a successful value when the `Deferred` completion
 * effect runs.
 *
 * **Details**
 *
 * Fibers waiting on the `Deferred` receive the computed value only if this call
 * completes it. The returned effect succeeds with `true` when this call
 * completed the `Deferred`, or `false` if it was already completed.
 *
 * **Example** (Completing a Deferred with a lazy value)
 *
 * ```ts import.meta.vitest
 * import { Deferred, Effect } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const deferred = yield* Deferred.make<number>()
 *   yield* Deferred.sync(deferred, () => 42)
 *   return yield* Deferred.await(deferred)
 * })
 *
 * await Effect.runPromise(program) // => 42
 * ```
 *
 * @category completion
 * @since 2.0.0
 */
export const sync: {
  <A>(evaluate: LazyArg<A>): <E>(self: Deferred<A, E>) => Effect<boolean>
  <A, E>(self: Deferred<A, E>, evaluate: LazyArg<A>): Effect<boolean>
} = dual(
  2,
  <A, E>(self: Deferred<A, E>, evaluate: LazyArg<A>): Effect<boolean> =>
    internalEffect.suspend(() => succeed(self, evaluate()))
)

/**
 * Attempts to complete the `Deferred` synchronously with the specified
 * completion effect.
 *
 * **When to use**
 *
 * Use to complete a `Deferred` synchronously in low-level code that already has
 * the completion effect.
 *
 * **Details**
 *
 * This mutates the `Deferred` directly and should be reserved for low-level
 * code; prefer the effectful completion APIs when possible. Returns `true` if
 * this call completed the `Deferred`, or `false` if it was already completed.
 *
 * **Example** (Completing a Deferred unsafely)
 *
 * ```ts import.meta.vitest
 * import { Deferred, Effect } from "effect"
 *
 * const deferred = Deferred.makeUnsafe<number>()
 * Deferred.doneUnsafe(deferred, Effect.succeed(42)) // => true
 * ```
 *
 * @category unsafe
 * @since 4.0.0
 */
export const doneUnsafe = <A, E>(self: Deferred<A, E>, effect: Effect<A, E>): boolean => {
  if (self.effect) return false
  self.effect = effect
  if (self.resumes) {
    // Clear `resumes` before resuming: a waiter resumed with an interrupt
    // cause dies synchronously inside `resume`, and its await cleanup would
    // otherwise splice this array mid-iteration and skip the next waiter.
    const resumes = self.resumes
    self.resumes = undefined
    for (let i = 0; i < resumes.length; i++) {
      resumes[i](effect)
    }
  }
  return true
}

/**
 * Runs an `Effect` and attempts to complete a `Deferred` with the effect's
 * result.
 *
 * **When to use**
 *
 * Use to pipe an effect result into a `Deferred` while preserving success,
 * failure, defects, and interruption.
 *
 * **Details**
 *
 * If the effect succeeds, fails, dies, or is interrupted, that result is used
 * as the attempted completion. The returned effect cannot fail; it succeeds
 * with `true` if it completed the `Deferred`, or `false` if the `Deferred` was
 * already completed.
 *
 * **Example** (Completing a Deferred from an effect result)
 *
 * ```ts import.meta.vitest
 * import { Deferred, Effect } from "effect"
 *
 * const successEffect = Effect.succeed(42)
 *
 * const program = Effect.gen(function*() {
 *   const deferred = yield* Deferred.make<number, string>()
 *   const isCompleted = yield* Deferred.into(successEffect, deferred)
 *   const value = yield* Deferred.await(deferred)
 *   return [isCompleted, value]
 * })
 *
 * await Effect.runPromise(program) // => [true, 42]
 * ```
 *
 * @category completion
 * @since 4.0.0
 */
export const into: {
  <A, E>(deferred: Deferred<A, E>): <R>(self: Effect<A, E, R>) => Effect<boolean, never, R>
  <A, E, R>(self: Effect<A, E, R>, deferred: Deferred<A, E>): Effect<boolean, never, R>
} = dual(
  2,
  <A, E, R>(self: Effect<A, E, R>, deferred: Deferred<A, E>): Effect<boolean, never, R> =>
    internalEffect.uninterruptibleMask((restore) =>
      internalEffect.flatMap(
        internalEffect.exit(restore(self)),
        (exit) => done(deferred, exit)
      )
    )
)
