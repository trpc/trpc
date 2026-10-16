/**
 * Transactional deferred values for coordinating Effect transactions.
 *
 * A `TxDeferred<A, E>` is a write-once cell whose completion is a
 * `Result<A, E>` stored in transactional state. Readers can wait for the value
 * from inside a transaction: while the cell is empty the transaction retries,
 * and when another transaction completes the deferred the waiting transaction
 * can resume with either the success value or the typed failure.
 *
 * @since 4.0.0
 */

import * as Effect from "./Effect.ts"
import { dual } from "./Function.ts"
import type { Inspectable } from "./Inspectable.ts"
import { NodeInspectSymbol, toJson } from "./Inspectable.ts"
import type { Option } from "./Option.ts"
import * as O from "./Option.ts"
import type { Pipeable } from "./Pipeable.ts"
import { pipeArguments } from "./Pipeable.ts"
import { hasProperty } from "./Predicate.ts"
import type { Result } from "./Result.ts"
import * as Res from "./Result.ts"
import * as TxRef from "./TxRef.ts"

const TypeId = "~effect/TxDeferred"

/**
 * A transactional deferred is a write-once cell readable within transactions.
 * Readers block (retry the transaction) until a value is committed, and writers
 * succeed only on the first call; subsequent writes return `false`.
 *
 * **When to use**
 *
 * Use to coordinate transaction-local readers and one-time completion with a
 * success or failure result.
 *
 * **Example** (Completing a transactional deferred)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxDeferred } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const deferred = yield* TxDeferred.make<number>()
 *
 *   // Complete the deferred
 *   const first = yield* TxDeferred.succeed(deferred, 42)
 *
 *   // Second write is a no-op
 *   const second = yield* TxDeferred.succeed(deferred, 99)
 *
 *   // Read the value
 *   const value = yield* TxDeferred.await(deferred)
 *   return [first, second, value]
 * })
 *
 * await Effect.runPromise(program) // => [true, false, 42]
 * ```
 *
 * @category models
 * @since 4.0.0
 */
export interface TxDeferred<in out A, in out E = never> extends Inspectable, Pipeable {
  readonly [TypeId]: typeof TypeId
  readonly ref: TxRef.TxRef<Option<Result<A, E>>>
}

const TxDeferredProto: Omit<TxDeferred<unknown, unknown>, typeof TypeId | "ref"> = {
  [NodeInspectSymbol](this: TxDeferred<unknown, unknown>) {
    return toJson(this)
  },
  toJSON(this: TxDeferred<unknown, unknown>) {
    return {
      _id: "TxDeferred"
    }
  },
  pipe() {
    return pipeArguments(this, arguments)
  }
}

const makeTxDeferred = <A, E>(ref: TxRef.TxRef<Option<Result<A, E>>>): TxDeferred<A, E> => {
  const self = Object.create(TxDeferredProto)
  self[TypeId] = TypeId
  self.ref = ref
  return self
}

/**
 * Creates a new empty `TxDeferred`.
 *
 * **When to use**
 *
 * Use to create a transactional deferred that can be completed exactly once.
 *
 * **Example** (Creating a transactional deferred)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, TxDeferred } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const deferred = yield* TxDeferred.make<string, Error>()
 *   return yield* TxDeferred.poll(deferred)
 * })
 *
 * await Effect.runPromise(program) // => Option.none()
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const make = <A, E = never>(): Effect.Effect<TxDeferred<A, E>> =>
  Effect.map(TxRef.make<Option<Result<A, E>>>(O.none()), makeTxDeferred)

/**
 * Reads the deferred value. Retries the transaction if the deferred has not
 * been completed yet.
 *
 * **Example** (Awaiting a deferred value)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxDeferred } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const deferred = yield* TxDeferred.make<number>()
 *   yield* TxDeferred.succeed(deferred, 42)
 *   return yield* TxDeferred.await(deferred)
 * })
 *
 * await Effect.runPromise(program) // => 42
 * ```
 *
 * @category getters
 * @since 4.0.0
 */
const await_ = <A, E>(self: TxDeferred<A, E>): Effect.Effect<A, E> =>
  Effect.gen(function*() {
    const option = yield* TxRef.get(self.ref)
    if (O.isNone(option)) {
      return yield* Effect.txRetry
    }
    return Res.isSuccess(option.value)
      ? option.value.success
      : yield* Effect.fail(option.value.failure)
  }).pipe(Effect.tx)

export {
  /**
   * Reads the deferred value. Retries the transaction if the deferred has not
   * been completed yet.
   *
   * **When to use**
   *
   * Use to read the success value of a `TxDeferred` while retrying until the
   * deferred is completed.
   *
   * @see {@link poll} for inspecting the current completion state without retrying the transaction
   *
   * @category getters
   * @since 4.0.0
   */
  await_ as await
}

/**
 * Reads the current state of the deferred without retrying. Returns `None` if
 * not yet completed.
 *
 * **When to use**
 *
 * Use to inspect a `TxDeferred` without retrying when it is not completed yet.
 *
 * **Example** (Polling a deferred)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, Result, TxDeferred } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const deferred = yield* TxDeferred.make<number>()
 *   const before = yield* TxDeferred.poll(deferred)
 *
 *   yield* TxDeferred.succeed(deferred, 42)
 *   const after = yield* TxDeferred.poll(deferred)
 *   return [before, after]
 * })
 *
 * await Effect.runPromise(program) // => [Option.none(), Option.some(Result.succeed(42))]
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export const poll = <A, E>(self: TxDeferred<A, E>): Effect.Effect<Option<Result<A, E>>> => TxRef.get(self.ref)

/**
 * Completes the deferred with a `Result`. Returns `true` if this was the first
 * completion, `false` if already completed.
 *
 * **When to use**
 *
 * Use to complete a `TxDeferred` with an already computed `Result`.
 *
 * **Example** (Completing with a result)
 *
 * ```ts import.meta.vitest
 * import { Effect, Result, TxDeferred } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const deferred = yield* TxDeferred.make<number, string>()
 *   const first = yield* TxDeferred.done(deferred, Result.succeed(42))
 *   const second = yield* TxDeferred.done(deferred, Result.succeed(99))
 *   return [first, second]
 * })
 *
 * await Effect.runPromise(program) // => [true, false]
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const done: {
  <A, E>(result: Result<A, E>): (self: TxDeferred<A, E>) => Effect.Effect<boolean>
  <A, E>(self: TxDeferred<A, E>, result: Result<A, E>): Effect.Effect<boolean>
} = dual(
  2,
  <A, E>(self: TxDeferred<A, E>, result: Result<A, E>): Effect.Effect<boolean> =>
    TxRef.modify(self.ref, (current) => {
      if (O.isSome(current)) {
        return [false, current]
      }
      return [true, O.some(result)]
    })
)

/**
 * Completes the deferred with a success value. Returns `true` if this was the
 * first completion, `false` if already completed.
 *
 * **When to use**
 *
 * Use to complete a `TxDeferred` with a successful value.
 *
 * **Example** (Completing with a success value)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxDeferred } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const deferred = yield* TxDeferred.make<number>()
 *   const first = yield* TxDeferred.succeed(deferred, 42)
 *   const second = yield* TxDeferred.succeed(deferred, 99)
 *   return [first, second]
 * })
 *
 * await Effect.runPromise(program) // => [true, false]
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const succeed: {
  <A>(value: A): <E>(self: TxDeferred<A, E>) => Effect.Effect<boolean>
  <A, E>(self: TxDeferred<A, E>, value: A): Effect.Effect<boolean>
} = dual(
  2,
  <A, E>(self: TxDeferred<A, E>, value: A): Effect.Effect<boolean> => done(self, Res.succeed(value))
)

/**
 * Completes the deferred with a failure. Returns `true` if this was the first
 * completion, `false` if already completed.
 *
 * **When to use**
 *
 * Use to complete a `TxDeferred` with a typed failure value.
 *
 * **Example** (Completing with a failure)
 *
 * ```ts import.meta.vitest
 * import { Cause, Effect, Exit, Option, TxDeferred } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const deferred = yield* TxDeferred.make<number, string>()
 *   const first = yield* TxDeferred.fail(deferred, "boom")
 *   const second = yield* TxDeferred.fail(deferred, "boom2")
 *   const exit = yield* Effect.exit(TxDeferred.await(deferred))
 *   return [first, second, exit, Exit.getCause(exit)]
 * })
 *
 * await Effect.runPromise(program) // => [true, false, Exit.fail("boom"), Option.some(Cause.fail("boom"))]
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const fail: {
  <E>(error: E): <A>(self: TxDeferred<A, E>) => Effect.Effect<boolean>
  <A, E>(self: TxDeferred<A, E>, error: E): Effect.Effect<boolean>
} = dual(
  2,
  <A, E>(self: TxDeferred<A, E>, error: E): Effect.Effect<boolean> => done(self, Res.fail(error))
)

/**
 * Determines if the provided value is a `TxDeferred`.
 *
 * **When to use**
 *
 * Use to narrow an unknown value before treating it as a transactional deferred.
 *
 * **Example** (Checking transactional deferreds)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxDeferred } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const deferred = yield* TxDeferred.make<number>()
 *   return [TxDeferred.isTxDeferred(deferred), TxDeferred.isTxDeferred("not a deferred")]
 * })
 *
 * await Effect.runPromise(program) // => [true, false]
 * ```
 *
 * @category guards
 * @since 4.0.0
 */
export const isTxDeferred = (u: unknown): u is TxDeferred<unknown, unknown> => hasProperty(u, TypeId)
