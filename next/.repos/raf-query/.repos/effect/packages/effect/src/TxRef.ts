/**
 * Transactional references for coordinating mutable state with Effect
 * transactions. A `TxRef` stores a current value, but reads and writes inside
 * `Effect.tx` are recorded in a transaction journal and committed together only
 * when the outermost transaction succeeds.
 *
 * This is the basic building block behind the other transactional collections
 * in Effect. The module provides effectful and unsafe constructors plus the
 * core operations for reading, setting, updating, and modifying a transactional
 * value while returning a separate result.
 *
 * @since 4.0.0
 */
import * as Effect from "./Effect.ts"
import { dual } from "./Function.ts"
import { pipeArguments } from "./Pipeable.ts"
import type { Pipeable } from "./Pipeable.ts"
import type { NoInfer } from "./Types.ts"

const TypeId = "~effect/TxRef"

/**
 * TxRef is a transactional value, it can be read and modified within the body of a transaction.
 *
 * **When to use**
 *
 * Use to store mutable state that must be read and modified inside Effect
 * transactions.
 *
 * **Details**
 *
 * Accessed values are tracked by the transaction in order to detect conflicts and in order to
 * track changes, a transaction will retry whenever a conflict is detected or whenever the
 * transaction explicitely calls to `Effect.txRetry` and any of the accessed TxRef values
 * change.
 *
 * **Example** (Using a transactional reference)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxRef } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   // Create a transactional reference
 *   const ref: TxRef.TxRef<number> = yield* TxRef.make(0)
 *
 *   // Use within a transaction
 *   yield* Effect.tx(Effect.gen(function*() {
 *     const current = yield* TxRef.get(ref)
 *     yield* TxRef.set(ref, current + 1)
 *   }))
 *
 *   return yield* TxRef.get(ref)
 * })
 *
 * await Effect.runPromise(program) // => 1
 * ```
 *
 * @category models
 * @since 4.0.0
 */
export interface TxRef<in out A> extends Pipeable {
  readonly [TypeId]: typeof TypeId

  version: number
  pending: Map<unknown, () => void>
  value: A
}

/**
 * Creates a new `TxRef` with the specified initial value.
 *
 * **When to use**
 *
 * Use to create a `TxRef` inside an `Effect` workflow.
 *
 * **Example** (Creating transactional references)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxRef } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   // Create a transactional reference with initial value
 *   const counter = yield* TxRef.make(0)
 *   const name = yield* TxRef.make("Alice")
 *
 *   // Use in transactions
 *   yield* Effect.tx(Effect.gen(function*() {
 *     yield* TxRef.set(counter, 42)
 *     yield* TxRef.set(name, "Bob")
 *   }))
 *
 *   return [yield* TxRef.get(counter), yield* TxRef.get(name)]
 * })
 *
 * await Effect.runPromise(program) // => [42, "Bob"]
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const make = <A>(initial: A) => Effect.sync(() => makeUnsafe(initial))

/**
 * Creates a new `TxRef` synchronously with the specified initial value.
 *
 * **When to use**
 *
 * Use to construct a `TxRef` synchronously when it must be created outside an
 * `Effect` workflow.
 *
 * **Example** (Creating transactional references unsafely)
 *
 * ```ts import.meta.vitest
 * import { TxRef } from "effect"
 *
 * // Create a TxRef synchronously (unsafe - use make instead in Effect contexts)
 * const counter = TxRef.makeUnsafe(0)
 * const config = TxRef.makeUnsafe({ timeout: 5000, retries: 3 })
 *
 * // These are now ready to use in transactions
 * counter.value // => 0
 * config.value // => { timeout: 5000, retries: 3 }
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const makeUnsafe = <A>(initial: A): TxRef<A> => ({
  [TypeId]: TypeId,
  pending: new Map(),
  pipe() {
    return pipeArguments(this, arguments)
  },
  version: 0,
  value: initial
})

const journalEntry = <A>(state: Effect.Transaction["Service"], self: TxRef<A>) => {
  let entry = state.journal.get(self)
  if (entry === undefined) {
    entry = { version: self.version, value: self.value, written: false }
    state.journal.set(self, entry)
  }
  return entry
}

/**
 * Modifies the value of the `TxRef` using the provided function.
 *
 * **When to use**
 *
 * Use to update a `TxRef` and return a computed result from the same
 * transaction step.
 *
 * **Example** (Modifying transactional references)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxRef } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const counter = yield* TxRef.make(0)
 *
 *   // Modify and return both old and new value
 *   const result = yield* TxRef.modify(counter, (current) => [current * 2, current + 1])
 *
 *   return [result, yield* TxRef.get(counter)]
 * })
 *
 * await Effect.runPromise(program) // => [0, 1]
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const modify: {
  <A, R>(f: (current: NoInfer<A>) => [returnValue: R, newValue: A]): (self: TxRef<A>) => Effect.Effect<R>
  <A, R>(self: TxRef<A>, f: (current: A) => [returnValue: R, newValue: A]): Effect.Effect<R>
} = dual(2, <A, R>(
  self: TxRef<A>,
  f: (current: A) => [returnValue: R, newValue: A]
): Effect.Effect<R> =>
  Effect.Transaction.pipe(
    Effect.flatMap((state) =>
      Effect.sync(() => {
        const current = journalEntry(state, self)
        const [returnValue, next] = f(current.value)
        current.value = next
        current.written = true
        return returnValue
      })
    ),
    Effect.tx
  ))

/**
 * Updates the value of the `TxRef` using the provided function.
 *
 * **When to use**
 *
 * Use to transform a `TxRef` when no result value is needed.
 *
 * **Example** (Updating transactional references)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxRef } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const counter = yield* TxRef.make(10)
 *
 *   // Update the value using a function
 *   yield* Effect.tx(
 *     TxRef.update(counter, (current) => current * 2)
 *   )
 *
 *   return yield* TxRef.get(counter)
 * })
 *
 * await Effect.runPromise(program) // => 20
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const update: {
  <A>(f: (current: NoInfer<A>) => A): (self: TxRef<A>) => Effect.Effect<void>
  <A>(self: TxRef<A>, f: (current: A) => A): Effect.Effect<void>
} = dual(2, <A>(
  self: TxRef<A>,
  f: (current: A) => A
): Effect.Effect<void> => modify(self, (current) => [void 0, f(current)]))

/**
 * Reads the current value of the `TxRef`.
 *
 * **When to use**
 *
 * Use to read the current value of a `TxRef`.
 *
 * **Example** (Reading transactional references)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxRef } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const counter = yield* TxRef.make(42)
 *
 *   // Read the value within a transaction
 *   const value = yield* Effect.tx(
 *     TxRef.get(counter)
 *   )
 *
 *   return value
 * })
 *
 * await Effect.runPromise(program) // => 42
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const get = <A>(self: TxRef<A>): Effect.Effect<A> =>
  Effect.Transaction.pipe(
    Effect.map((state) => journalEntry(state, self).value),
    Effect.tx
  )

/**
 * Sets the value of the `TxRef`.
 *
 * **When to use**
 *
 * Use to replace the value of a `TxRef`.
 *
 * **Example** (Setting transactional references)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxRef } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const counter = yield* TxRef.make(0)
 *
 *   // Set a new value within a transaction
 *   yield* Effect.tx(
 *     TxRef.set(counter, 100)
 *   )
 *
 *   return yield* TxRef.get(counter)
 * })
 *
 * await Effect.runPromise(program) // => 100
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const set: {
  <A>(value: A): (self: TxRef<A>) => Effect.Effect<void>
  <A>(self: TxRef<A>, value: A): Effect.Effect<void>
} = dual(2, <A>(
  self: TxRef<A>,
  value: A
): Effect.Effect<void> => update(self, () => value))
