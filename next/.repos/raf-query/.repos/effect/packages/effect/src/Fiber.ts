/**
 * Operations for handles returned by forking effects. A `Fiber<A, E>` is a
 * lightweight execution of an `Effect` that may still be running or may already
 * have completed. This module lets callers await or join fiber results,
 * interrupt one or many fibers, check unknown values, access the current fiber,
 * and attach manually managed fibers to a `Scope` for cleanup.
 *
 * @since 2.0.0
 */
import type * as Arr from "./Array.ts"
import type * as Context from "./Context.ts"
import type { Effect } from "./Effect.ts"
import type { Exit } from "./Exit.ts"
import * as effect from "./internal/effect.ts"
import type { LogLevel } from "./LogLevel.ts"
import type { FiberRuntimeMetricsService } from "./Metric.ts"
import type { Pipeable } from "./Pipeable.ts"
import { hasProperty } from "./Predicate.ts"
import type { StackFrame } from "./References.ts"
import type { Scheduler, SchedulerDispatcher } from "./Scheduler.ts"
import type { Scope } from "./Scope.ts"
import type { AnySpan, Tracer } from "./Tracer.ts"
import type { Covariant } from "./Types.ts"

const TypeId = "~effect/Fiber"

/**
 * A runtime fiber is a lightweight thread that executes Effects. Fibers are
 * the unit of concurrency in Effect. They provide a way to run multiple
 * Effects concurrently while maintaining structured concurrency and
 * cancellation safety.
 *
 * **When to use**
 *
 * Use to observe, join, interrupt, or coordinate work that has already been
 * forked.
 *
 * **Details**
 *
 * A fiber exposes both safe Effect-based operations, such as {@link await_ await},
 * {@link join}, and {@link interrupt}, and low-level runtime fields used by
 * the scheduler and runtime internals.
 *
 * **Gotchas**
 *
 * Prefer the exported functions in this module over calling `interruptUnsafe`
 * or `pollUnsafe` directly. The unsafe methods are immediate runtime hooks and
 * do not provide the same Effect-based sequencing guarantees.
 *
 * **Example** (Awaiting a forked fiber)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit, Fiber } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   // Fork an effect to run in a new fiber
 *   const fiber = yield* Effect.forkChild(Effect.succeed(42))
 *
 *   // Wait for the fiber to complete and get its result
 *   const result = yield* Fiber.await(fiber)
 *   return result
 * })
 *
 * const actual = await Effect.runPromise(program)
 * actual // => Exit.succeed(42)
 * ```
 *
 * @category models
 * @since 2.0.0
 */
export interface Fiber<out A, out E = never> extends Pipeable {
  readonly [TypeId]: Fiber.Variance<A, E>

  readonly id: number
  readonly currentOpCount: number
  readonly getRef: <A>(ref: Context.Reference<A>) => A
  readonly context: Context.Context<never>
  setContext(context: Context.Context<never>): void
  readonly cache: Fiber.Cache
  readonly currentDispatcher: SchedulerDispatcher
  readonly addObserver: (cb: (exit: Exit<A, E>) => void) => () => void
  readonly interruptUnsafe: (
    fiberId?: number | undefined,
    annotations?: Context.Context<never> | undefined
  ) => void
  readonly pollUnsafe: () => Exit<A, E> | undefined
}

/**
 * The Fiber namespace contains utility types and functions for working with fibers.
 * It provides type-level utilities for fiber operations and variance encoding.
 *
 * **When to use**
 *
 * Use to reference type-level helpers associated with `Fiber`.
 *
 * **Details**
 *
 * The namespace currently exposes type-level support used by the `Fiber`
 * interface. Runtime operations are exported as module-level functions.
 *
 * **Example** (Working with fiber types)
 *
 * ```ts import.meta.vitest
 * import { Effect, Fiber } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   // Create a fiber
 *   const fiber = yield* Effect.forkChild(Effect.succeed(42))
 *
 *   // Use namespace types for variance
 *   const typedFiber: Fiber.Fiber<number, never> = fiber
 *
 *   // Join the fiber
 *   return yield* Fiber.join(fiber)
 * })
 *
 * const actual = await Effect.runPromise(program)
 * actual // => 42
 * ```
 *
 * @since 2.0.0
 */
export declare namespace Fiber {
  /**
   * Variance encoding for the Fiber type, specifying covariance in both the
   * success type `A` and the error type `E`.
   *
   * **When to use**
   *
   * Use to carry the success and error type parameters for `Fiber` in Effect's
   * type machinery.
   *
   * **Example** (Upcasting fibers safely)
   *
   * ```ts import.meta.vitest
   * import { Effect, Fiber } from "effect"
   *
   * // Variance allows safe subtyping
   * const fiber: Fiber.Fiber<number, never> = Effect.runFork(Effect.succeed(1))
   * const upcast: Fiber.Fiber<unknown, unknown> = fiber
   * const actual = await Effect.runPromise(Fiber.join(upcast))
   * actual // => 1
   * ```
   *
   * @category models
   * @since 2.0.0
   */
  export interface Variance<out A, out E = never> {
    readonly _A: Covariant<A>
    readonly _E: Covariant<E>
  }

  /**
   * Context-derived values cached for the fiber's current `Context`.
   *
   * **When to use**
   *
   * Use to read runtime services resolved from the fiber's context, such as
   * the scheduler, current span, or log levels.
   *
   * **Details**
   *
   * The cache object is computed once per context cache root and shared by
   * every fiber running with that root, so it must be treated as immutable.
   *
   * @category models
   * @since 4.0.0
   */
  export interface Cache {
    readonly scheduler: Scheduler
    readonly tracer: Tracer | undefined
    readonly tracerContext: Tracer["context"] | undefined
    readonly tracerEnabled: boolean
    readonly span: AnySpan | undefined
    readonly logLevel: LogLevel
    readonly minimumLogLevel: LogLevel
    readonly stackFrame: StackFrame | undefined
    readonly runtimeMetrics: FiberRuntimeMetricsService | undefined
    readonly maxOpsBeforeYield: number
    readonly preventYield: boolean
  }
}

const await_: <A, E>(self: Fiber<A, E>) => Effect<Exit<A, E>> = effect.fiberAwait
export {
  /**
   * Waits for a fiber to complete and returns its exit value.
   *
   * **When to use**
   *
   * Use when you need to inspect whether the fiber succeeded,
   * failed, died, or was interrupted without propagating the failure.
   *
   * **Details**
   *
   * The returned Effect always succeeds with an `Exit` describing the fiber's
   * outcome.
   *
   * **Gotchas**
   *
   * This does not flatten the fiber result into the current Effect. Use
   * {@link join} when you want fiber failures to fail the current Effect.
   *
   * **Example** (Awaiting a fiber exit)
   *
   * ```ts import.meta.vitest
   * import { Effect, Exit, Fiber } from "effect"
   *
   * const program = Effect.gen(function*() {
   *   const fiber = yield* Effect.forkChild(Effect.succeed(42))
   *   return yield* Fiber.await(fiber)
   * })
   *
   * const actual = await Effect.runPromise(program)
   * actual // => Exit.succeed(42)
   * ```
   *
   * @category combinators
   * @since 2.0.0
   */
  await_ as await
}
/**
 * Waits for all fibers in the provided iterable to complete and returns
 * an array of their exit values.
 *
 * **When to use**
 *
 * Use when you need every fiber outcome as data, including failures and
 * interruptions.
 *
 * **Details**
 *
 * The returned array is ordered like the input iterable.
 *
 * **Gotchas**
 *
 * Failures are captured as `Exit.Failure` values. Use {@link joinAll} when you
 * want the first failed fiber to fail the returned Effect.
 *
 * **Example** (Awaiting multiple fiber exits)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit, Fiber } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const fiber1 = yield* Effect.forkChild(Effect.succeed(1))
 *   const fiber2 = yield* Effect.forkChild(Effect.succeed(2))
 *   return yield* Fiber.awaitAll([fiber1, fiber2])
 * })
 *
 * const actual = await Effect.runPromise(program)
 * actual // => [Exit.succeed(1), Exit.succeed(2)]
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const awaitAll: <A extends Fiber<any, any>>(
  self: Iterable<A>
) => Effect<
  Array<
    Exit<
      A extends Fiber<infer _A, infer _E> ? _A : never,
      A extends Fiber<infer _A, infer _E> ? _E : never
    >
  >
> = effect.fiberAwaitAll

/**
 * Joins a fiber, blocking until it completes. If the fiber succeeds,
 * returns its value. If it fails, the error is propagated.
 *
 * **When to use**
 *
 * Use when you need a forked fiber's failure to fail the current Effect because
 * that fiber is part of the current workflow.
 *
 * **Gotchas**
 *
 * Joining a failed fiber propagates the fiber's Cause. Use {@link await_ await} when
 * you need to inspect the `Exit` instead of failing.
 *
 * **Example** (Joining a fiber)
 *
 * ```ts import.meta.vitest
 * import { Effect, Fiber } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const fiber = yield* Effect.forkChild(Effect.succeed(42))
 *   return yield* Fiber.join(fiber)
 * })
 *
 * const actual = await Effect.runPromise(program)
 * actual // => 42
 * ```
 *
 * @see {@link await_ await} for inspecting the fiber outcome as an Exit
 *
 * @category combinators
 * @since 2.0.0
 */
export const join: <A, E>(self: Fiber<A, E>) => Effect<A, E> = effect.fiberJoin

/**
 * Waits for all fibers to succeed and returns their values in input order.
 *
 * **When to use**
 *
 * Use when you need every fiber to succeed and want the successful values
 * rather than the `Exit` values.
 *
 * **Details**
 *
 * If any fiber fails, the returned `Effect` fails with that fiber's cause and
 * stops waiting for additional results. This does not interrupt the remaining
 * fibers.
 *
 * **Gotchas**
 *
 * A failure stops waiting, but it does not interrupt any other fibers. Use
 * {@link interruptAll} separately when remaining fibers should be stopped.
 *
 * @see {@link awaitAll} for collecting every fiber outcome as an Exit
 *
 * @category combinators
 * @since 2.0.0
 */
export const joinAll: <A extends Iterable<Fiber<any, any>>>(
  self: A
) => Effect<
  Arr.ReadonlyArray.With<
    A,
    A extends Iterable<Fiber<infer _A, infer _E>> ? _A : never
  >,
  A extends Iterable<Fiber<infer _A, infer _E>> ? _E : never
> = effect.fiberJoinAll

/**
 * Interrupts a fiber, causing it to stop executing and clean up any
 * acquired resources.
 *
 * **When to use**
 *
 * Use when you need to cancel a forked fiber and wait for its cleanup to
 * complete.
 *
 * **Details**
 *
 * The returned Effect completes only after the interrupted fiber has completed.
 *
 * **Gotchas**
 *
 * Interruption is cooperative. A fiber can continue running while it is inside
 * uninterruptible work or finalizers.
 *
 * **Example** (Interrupting a fiber)
 *
 * ```ts import.meta.vitest
 * import { Effect, Fiber } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const fiber = yield* Effect.forkChild(
 *     Effect.delay("1 second")(Effect.succeed(42))
 *   )
 *   yield* Fiber.interrupt(fiber)
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @see {@link interruptAs} for specifying the interrupting fiber ID
 * @see {@link await_ await} for observing the interrupted fiber's Exit
 *
 * @category interruption
 * @since 2.0.0
 */
export const interrupt: <A, E>(self: Fiber<A, E>) => Effect<void> = effect.fiberInterrupt

/**
 * Interrupts a fiber with a specific fiber ID as the interruptor. This allows
 * tracking which fiber initiated the interruption.
 *
 * **When to use**
 *
 * Use when runtime diagnostics or tracing should attribute the interruption to
 * a specific fiber ID.
 *
 * **Details**
 *
 * The returned Effect completes only after the interrupted fiber has completed.
 *
 * **Gotchas**
 *
 * The supplied ID affects the recorded interruptor. It does not make
 * interruption synchronous or force uninterruptible regions to stop early.
 *
 * **Example** (Interrupting a fiber as another fiber)
 *
 * ```ts import.meta.vitest
 * import { Effect, Fiber } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const targetFiber = yield* Effect.forkChild(
 *     Effect.delay("5 seconds")(Effect.succeed("task completed"))
 *   )
 *
 *   // Interrupt the fiber, specifying fiber ID 123 as the interruptor
 *   yield* Fiber.interruptAs(targetFiber, 123)
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @see {@link interrupt} for using the current fiber as the interruptor
 *
 * @category interruption
 * @since 2.0.0
 */
export const interruptAs: {
  (
    fiberId: number | undefined,
    annotations?: Context.Context<never> | undefined
  ): <A, E>(self: Fiber<A, E>) => Effect<void>
  <A, E>(
    self: Fiber<A, E>,
    fiberId: number | undefined,
    annotations?: Context.Context<never> | undefined
  ): Effect<void>
} = effect.fiberInterruptAs

/**
 * Interrupts all fibers in the provided iterable, causing them to stop executing
 * and clean up any acquired resources.
 *
 * **When to use**
 *
 * Use when you need to cancel several forked fibers and wait for their cleanup
 * to complete.
 *
 * **Details**
 *
 * The current fiber is recorded as the interruptor. The returned Effect
 * completes only after all interrupted fibers have completed.
 *
 * **Gotchas**
 *
 * Interruption is cooperative for each fiber. The returned Effect can wait for
 * uninterruptible work and finalizers in any interrupted fiber.
 *
 * **Example** (Interrupting multiple fibers)
 *
 * ```ts import.meta.vitest
 * import { Effect, Fiber } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const fiber1 = yield* Effect.forkChild(Effect.never)
 *   const fiber2 = yield* Effect.forkChild(Effect.never)
 *   const fiber3 = yield* Effect.forkChild(Effect.never)
 *   yield* Fiber.interruptAll([fiber1, fiber2, fiber3])
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @see {@link interruptAllAs} for specifying the interrupting fiber ID
 *
 * @category interruption
 * @since 2.0.0
 */
export const interruptAll: <A extends Iterable<Fiber<any, any>>>(
  fibers: A
) => Effect<void> = effect.fiberInterruptAll

/**
 * Interrupts all fibers in the provided iterable using the specified fiber ID as the
 * interrupting fiber. This allows you to control which fiber is considered the source
 * of the interruption, which can be useful for debugging and tracing.
 *
 * **When to use**
 *
 * Use to interrupt several fibers while recording a specific fiber ID as the
 * interruptor.
 *
 * **Details**
 *
 * The returned Effect completes only after all interrupted fibers have
 * completed.
 *
 * **Gotchas**
 *
 * The supplied ID affects the recorded interruptor. It does not make
 * interruption synchronous or force uninterruptible regions to stop early.
 *
 * **Example** (Interrupting multiple fibers as another fiber)
 *
 * ```ts import.meta.vitest
 * import { Effect, Fiber } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   // Create a controlling fiber
 *   const controllerFiber = yield* Effect.forkChild(Effect.succeed("controller"))
 *
 *   const worker1 = yield* Effect.forkChild(Effect.never)
 *   const worker2 = yield* Effect.forkChild(Effect.never)
 *
 *   yield* Fiber.interruptAllAs([worker1, worker2], controllerFiber.id)
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @see {@link interruptAll} for using the current fiber as the interruptor
 *
 * @category interruption
 * @since 2.0.0
 */
export const interruptAllAs: {
  (fiberId: number): <A extends Iterable<Fiber<any, any>>>(fibers: A) => Effect<void>
  <A extends Iterable<Fiber<any, any>>>(fibers: A, fiberId: number): Effect<void>
} = effect.fiberInterruptAllAs

/**
 * Checks whether a value is a Fiber. This is a type guard that can be used to
 * determine if an unknown value is a Fiber instance.
 *
 * **When to use**
 *
 * Use when checking values at boundaries where an unknown value may be a
 * runtime fiber.
 *
 * **Details**
 *
 * The check looks for the internal Fiber type ID marker and does not inspect
 * the fiber's current state.
 *
 * **Example** (Checking for fibers)
 *
 * ```ts import.meta.vitest
 * import { Effect, Fiber } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   // Create a fiber
 *   const fiber = yield* Effect.forkChild(Effect.succeed(42))
 *
 *   // Test if values are fibers
 *   return [Fiber.isFiber(fiber), Fiber.isFiber("hello"), Fiber.isFiber(42), Fiber.isFiber(null)]
 * })
 *
 * const actual = await Effect.runPromise(program)
 * actual // => [true, false, false, false]
 * ```
 *
 * @category guards
 * @since 2.0.0
 */
export const isFiber = (
  u: unknown
): u is Fiber<unknown, unknown> => hasProperty(u, effect.FiberTypeId)

/**
 * Returns the current fiber if called from within a fiber context,
 * otherwise returns `undefined`.
 *
 * **When to use**
 *
 * Use when you need low-level runtime integrations that need access to the currently
 * executing fiber.
 *
 * **Gotchas**
 *
 * This is a synchronous accessor, not an Effect. It returns `undefined` outside
 * an active fiber runtime context.
 *
 * **Example** (Getting the current fiber)
 *
 * ```ts import.meta.vitest
 * import { Effect, Fiber } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const current = Fiber.getCurrent()
 *   return current !== undefined
 * })
 *
 * const actual = await Effect.runPromise(program)
 * actual // => true
 * ```
 *
 * @category getters
 * @since 4.0.0
 */
export const getCurrent: () => Fiber<any, any> | undefined = effect.getCurrentFiber

/**
 * Adds a fiber to a `Scope` and returns the same fiber.
 *
 * **When to use**
 *
 * Use when a manually managed fiber should be interrupted when a Scope closes.
 *
 * **Details**
 *
 * When the scope is closed, the fiber is interrupted. If the scope is already
 * closed, the fiber is interrupted immediately.
 *
 * **Gotchas**
 *
 * This does not wait for the fiber to complete. It only registers the
 * interruption finalizer and returns the same fiber.
 *
 * @see {@link interrupt} for interrupting and waiting for completion
 *
 * @category resource management
 * @since 4.0.0
 */
export const runIn: {
  (scope: Scope): <A, E>(self: Fiber<A, E>) => Fiber<A, E>
  <A, E>(self: Fiber<A, E>, scope: Scope): Fiber<A, E>
} = effect.fiberRunIn
