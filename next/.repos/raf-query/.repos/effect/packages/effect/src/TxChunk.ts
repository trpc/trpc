/**
 * Stores a `Chunk` inside transactional state.
 *
 * A `TxChunk<A>` keeps its current `Chunk<A>` in a `TxRef`, so reads and
 * updates can be committed atomically with other transactional operations. This
 * module offers a transactional version of common chunk workflows, including
 * creating collections, reading or replacing the current chunk, adding or
 * removing values, checking size, slicing, mapping, filtering, and combining
 * chunks.
 *
 * @since 4.0.0
 */
import * as Chunk from "./Chunk.ts"
import * as Effect from "./Effect.ts"
import { format } from "./Formatter.ts"
import { dual } from "./Function.ts"
import type { Inspectable } from "./Inspectable.ts"
import { NodeInspectSymbol, toJson } from "./Inspectable.ts"
import type { Pipeable } from "./Pipeable.ts"
import { pipeArguments } from "./Pipeable.ts"
import { hasProperty } from "./Predicate.ts"
import * as TxRef from "./TxRef.ts"
import type { NoInfer } from "./Types.ts"

const TypeId = "~effect/TxChunk"

/**
 * TxChunk is a transactional chunk data structure that provides Software Transactional Memory (STM)
 * semantics for chunk operations.
 *
 * **Details**
 *
 * Accessed values are tracked by the transaction in order to detect conflicts and to track changes.
 * A transaction will retry whenever a conflict is detected or whenever the transaction explicitly
 * calls `Effect.txRetry` and any of the accessed TxChunk values change.
 *
 * **Example** (Using a transactional chunk)
 *
 * ```ts import.meta.vitest
 * import { Chunk, Effect, TxChunk } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   // Create a transactional chunk
 *   const txChunk: TxChunk.TxChunk<number> = yield* TxChunk.fromIterable([
 *     1,
 *     2,
 *     3
 *   ])
 *
 *   // Single operations - no explicit transaction needed
 *   yield* TxChunk.append(txChunk, 4)
 *   const result = yield* TxChunk.get(txChunk)
 *
 *   // Multi-step atomic operation - use explicit transaction
 *   yield* Effect.tx(
 *     Effect.gen(function*() {
 *       yield* TxChunk.prepend(txChunk, 0)
 *       yield* TxChunk.append(txChunk, 5)
 *     })
 *   )
 *
 *   const finalResult = yield* TxChunk.get(txChunk)
 *   return [Chunk.toArray(result), Chunk.toArray(finalResult)]
 * })
 *
 * await Effect.runPromise(program) // => [[1, 2, 3, 4], [0, 1, 2, 3, 4, 5]]
 * ```
 *
 * @category models
 * @since 4.0.0
 */
export interface TxChunk<in out A> extends Inspectable, Pipeable {
  readonly [TypeId]: typeof TypeId
  readonly ref: TxRef.TxRef<Chunk.Chunk<A>>
}

const TxChunkProto = {
  [NodeInspectSymbol](this: TxChunk<unknown>) {
    return this.toJSON()
  },
  toString(this: TxChunk<unknown>) {
    return `TxChunk(${format(toJson((this).ref))})`
  },
  toJSON(this: TxChunk<unknown>) {
    return {
      _id: "TxChunk",
      ref: toJson((this).ref)
    }
  },
  pipe(this: TxChunk<unknown>) {
    return pipeArguments(this, arguments)
  }
}

/**
 * Creates a new `TxChunk` with the specified initial chunk.
 *
 * **Details**
 *
 * This function returns a new TxChunk reference containing the provided initial chunk. No existing
 * TxChunk instances are modified.
 *
 * **Example** (Creating a TxChunk from a chunk)
 *
 * ```ts import.meta.vitest
 * import { Chunk, Effect, TxChunk } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   // Create a TxChunk with initial values
 *   const initialChunk = Chunk.fromIterable([1, 2, 3])
 *   const txChunk = yield* TxChunk.make(initialChunk)
 *
 *   // Read the value - automatically transactional
 *   const result = yield* TxChunk.get(txChunk)
 *   return Chunk.toArray(result)
 * })
 *
 * await Effect.runPromise(program) // => [1, 2, 3]
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const make = <A>(initial: Chunk.Chunk<A>): Effect.Effect<TxChunk<A>> =>
  Effect.map(TxRef.make(initial), (ref) => makeUnsafe(ref))

/**
 * Creates a new empty `TxChunk`.
 *
 * **Details**
 *
 * This function returns a new TxChunk reference that is initially empty. No existing TxChunk
 * instances are modified.
 *
 * **Example** (Creating an empty TxChunk)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxChunk } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   // Create an empty TxChunk
 *   const txChunk = yield* TxChunk.empty<number>()
 *
 *   // Check if it's empty - automatically transactional
 *   const isEmpty = yield* TxChunk.isEmpty(txChunk)
 *
 *   // Add elements - automatically transactional
 *   yield* TxChunk.append(txChunk, 42)
 *
 *   const isStillEmpty = yield* TxChunk.isEmpty(txChunk)
 *   return [isEmpty, isStillEmpty]
 * })
 *
 * await Effect.runPromise(program) // => [true, false]
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const empty = <A = never>(): Effect.Effect<TxChunk<A>> =>
  Effect.map(TxRef.make(Chunk.empty<A>()), (ref) => makeUnsafe(ref))

/**
 * Creates a new `TxChunk` from an iterable.
 *
 * **Details**
 *
 * This function returns a new TxChunk reference containing elements from the provided iterable. No
 * existing TxChunk instances are modified.
 *
 * **Example** (Creating from an iterable)
 *
 * ```ts import.meta.vitest
 * import { Chunk, Effect, TxChunk } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   // Create TxChunk from array
 *   const txChunk = yield* TxChunk.fromIterable([1, 2, 3, 4, 5])
 *
 *   // Read the contents - automatically transactional
 *   const chunk = yield* TxChunk.get(txChunk)
 *
 *   // Multi-step atomic modification - use explicit transaction
 *   yield* Effect.tx(
 *     Effect.gen(function*() {
 *       yield* TxChunk.append(txChunk, 6)
 *       yield* TxChunk.prepend(txChunk, 0)
 *     })
 *   )
 *
 *   const updated = yield* TxChunk.get(txChunk)
 *   return [Chunk.toArray(chunk), Chunk.toArray(updated)]
 * })
 *
 * await Effect.runPromise(program) // => [[1, 2, 3, 4, 5], [0, 1, 2, 3, 4, 5, 6]]
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromIterable = <A>(iterable: Iterable<A>): Effect.Effect<TxChunk<A>> =>
  Effect.map(TxRef.make(Chunk.fromIterable(iterable)), (ref) => makeUnsafe(ref))

/**
 * Creates a new `TxChunk` with the specified TxRef.
 *
 * **Details**
 *
 * This function returns a new TxChunk reference wrapping the provided TxRef. No existing TxChunk
 * instances are modified.
 *
 * **Example** (Wrapping an existing TxRef)
 *
 * ```ts import.meta.vitest
 * import { Chunk, Effect, TxChunk, TxRef } from "effect"
 *
 * // Create a TxChunk from an existing TxRef (advanced usage)
 * const ref = TxRef.makeUnsafe(Chunk.fromIterable([1, 2, 3]))
 * const txChunk = TxChunk.makeUnsafe(ref)
 * Chunk.toArray(await Effect.runPromise(TxChunk.get(txChunk))) // => [1, 2, 3]
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const makeUnsafe = <A>(ref: TxRef.TxRef<Chunk.Chunk<A>>): TxChunk<A> => {
  const txChunk = Object.create(TxChunkProto)
  txChunk[TypeId] = TypeId
  txChunk.ref = ref
  return txChunk
}

/**
 * Checks whether `u` is a `TxChunk<unknown>`.
 *
 * **Example** (Checking for transactional chunks)
 *
 * ```ts import.meta.vitest
 * import { Chunk, TxChunk, TxRef } from "effect"
 *
 * const txChunk = TxChunk.makeUnsafe(TxRef.makeUnsafe(Chunk.empty<number>()))
 *
 * TxChunk.isTxChunk(txChunk) // => true
 * TxChunk.isTxChunk(Chunk.empty()) // => false
 * ```
 *
 * @category guards
 * @since 4.0.0
 */
export const isTxChunk = (u: unknown): u is TxChunk<unknown> => hasProperty(u, TypeId)

/**
 * Modifies the value of the `TxChunk` using the provided function.
 *
 * **Details**
 *
 * This function mutates the original TxChunk by updating its internal state. It does not return a
 * new TxChunk reference.
 *
 * **Example** (Modifying while returning a value)
 *
 * ```ts import.meta.vitest
 * import { Chunk, Effect, TxChunk } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const txChunk = yield* TxChunk.fromIterable([1, 2, 3])
 *
 *   // Modify and return both old size and new chunk
 *   const oldSize = yield* TxChunk.modify(txChunk, (chunk) => [
 *     Chunk.size(chunk), // return value (old size)
 *     Chunk.append(chunk, 4) // new value
 *   ])
 *
 *   const newChunk = yield* TxChunk.get(txChunk)
 *   return [oldSize, Chunk.toArray(newChunk)]
 * })
 *
 * await Effect.runPromise(program) // => [3, [1, 2, 3, 4]]
 * ```
 *
 * @category combinators
 * @since 4.0.0
 */
export const modify: {
  <A, R>(
    f: (current: Chunk.Chunk<NoInfer<A>>) => [returnValue: R, newValue: Chunk.Chunk<A>]
  ): (self: TxChunk<A>) => Effect.Effect<R>
  <A, R>(
    self: TxChunk<A>,
    f: (current: Chunk.Chunk<A>) => [returnValue: R, newValue: Chunk.Chunk<A>]
  ): Effect.Effect<R>
} = dual(
  2,
  <A, R>(
    self: TxChunk<A>,
    f: (current: Chunk.Chunk<A>) => [returnValue: R, newValue: Chunk.Chunk<A>]
  ): Effect.Effect<R> => TxRef.modify(self.ref, f)
)

/**
 * Updates the value of the `TxChunk` using the provided function.
 *
 * **Details**
 *
 * This function mutates the original TxChunk by updating its internal state. It does not return a
 * new TxChunk reference.
 *
 * **Example** (Updating the stored chunk)
 *
 * ```ts import.meta.vitest
 * import { Chunk, Effect, TxChunk } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const txChunk = yield* TxChunk.fromIterable([1, 2, 3])
 *
 *   // Update the chunk by reversing it atomically
 *   yield* TxChunk.update(txChunk, (chunk) => Chunk.reverse(chunk))
 *
 *   const result = yield* TxChunk.get(txChunk)
 *   return Chunk.toArray(result)
 * })
 *
 * await Effect.runPromise(program) // => [3, 2, 1]
 * ```
 *
 * @category combinators
 * @since 4.0.0
 */
export const update: {
  <A>(f: (current: Chunk.Chunk<NoInfer<A>>) => Chunk.Chunk<A>): (self: TxChunk<A>) => Effect.Effect<void>
  <A>(self: TxChunk<A>, f: (current: Chunk.Chunk<A>) => Chunk.Chunk<A>): Effect.Effect<void>
} = dual(
  2,
  <A>(
    self: TxChunk<A>,
    f: (current: Chunk.Chunk<A>) => Chunk.Chunk<A>
  ): Effect.Effect<void> => TxRef.update(self.ref, f)
)

/**
 * Reads the current chunk from the `TxChunk`.
 *
 * **Example** (Reading the current chunk)
 *
 * ```ts import.meta.vitest
 * import { Chunk, Effect, TxChunk } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const txChunk = yield* TxChunk.fromIterable([1, 2, 3])
 *
 *   // Read the current value within a transaction
 *   const chunk = yield* TxChunk.get(txChunk)
 *   return [Chunk.toArray(chunk), Chunk.size(chunk)]
 * })
 *
 * await Effect.runPromise(program) // => [[1, 2, 3], 3]
 * ```
 *
 * @category combinators
 * @since 4.0.0
 */
export const get = <A>(self: TxChunk<A>): Effect.Effect<Chunk.Chunk<A>> => TxRef.get(self.ref)

/**
 * Sets the value of the `TxChunk`.
 *
 * **Details**
 *
 * This function mutates the original TxChunk by replacing its internal state with the provided
 * chunk. It does not return a new TxChunk reference.
 *
 * **Example** (Replacing the stored chunk)
 *
 * ```ts import.meta.vitest
 * import { Chunk, Effect, TxChunk } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const txChunk = yield* TxChunk.fromIterable([1, 2, 3])
 *
 *   // Replace the entire chunk content
 *   const newChunk = Chunk.fromIterable([10, 20, 30, 40])
 *   yield* TxChunk.set(txChunk, newChunk)
 *
 *   const result = yield* TxChunk.get(txChunk)
 *   return Chunk.toArray(result)
 * })
 *
 * await Effect.runPromise(program) // => [10, 20, 30, 40]
 * ```
 *
 * @category combinators
 * @since 4.0.0
 */
export const set: {
  <A>(chunk: Chunk.Chunk<A>): (self: TxChunk<A>) => Effect.Effect<void>
  <A>(self: TxChunk<A>, chunk: Chunk.Chunk<A>): Effect.Effect<void>
} = dual(
  2,
  <A>(self: TxChunk<A>, chunk: Chunk.Chunk<A>): Effect.Effect<void> => TxRef.set(self.ref, chunk)
)

/**
 * Appends an element to the end of the `TxChunk`.
 *
 * **Details**
 *
 * This function mutates the original TxChunk by adding the element to the end. It does not return a
 * new TxChunk reference.
 *
 * **Example** (Appending an element)
 *
 * ```ts import.meta.vitest
 * import { Chunk, Effect, TxChunk } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const txChunk = yield* TxChunk.fromIterable([1, 2, 3])
 *
 *   // Add element to the end atomically
 *   yield* TxChunk.append(txChunk, 4)
 *
 *   const result = yield* TxChunk.get(txChunk)
 *   return Chunk.toArray(result)
 * })
 *
 * await Effect.runPromise(program) // => [1, 2, 3, 4]
 * ```
 *
 * @category combinators
 * @since 4.0.0
 */
export const append: {
  <A>(element: A): (self: TxChunk<A>) => Effect.Effect<void>
  <A>(self: TxChunk<A>, element: A): Effect.Effect<void>
} = dual(
  2,
  <A>(self: TxChunk<A>, element: A): Effect.Effect<void> => update(self, (current) => Chunk.append(current, element))
)

/**
 * Prepends an element to the beginning of the `TxChunk`.
 *
 * **Details**
 *
 * This function mutates the original TxChunk by adding the element to the beginning. It does not
 * return a new TxChunk reference.
 *
 * **Example** (Prepending an element)
 *
 * ```ts import.meta.vitest
 * import { Chunk, Effect, TxChunk } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const txChunk = yield* TxChunk.fromIterable([2, 3, 4])
 *
 *   // Add element to the beginning atomically
 *   yield* TxChunk.prepend(txChunk, 1)
 *
 *   const result = yield* TxChunk.get(txChunk)
 *   return Chunk.toArray(result)
 * })
 *
 * await Effect.runPromise(program) // => [1, 2, 3, 4]
 * ```
 *
 * @category combinators
 * @since 4.0.0
 */
export const prepend: {
  <A>(element: A): (self: TxChunk<A>) => Effect.Effect<void>
  <A>(self: TxChunk<A>, element: A): Effect.Effect<void>
} = dual(
  2,
  <A>(self: TxChunk<A>, element: A): Effect.Effect<void> => update(self, (current) => Chunk.prepend(current, element))
)

/**
 * Gets the size of the `TxChunk`.
 *
 * **Example** (Getting the size)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxChunk } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const txChunk = yield* TxChunk.fromIterable([1, 2, 3, 4, 5])
 *
 *   // Get the current size - automatically transactional
 *   const currentSize = yield* TxChunk.size(txChunk)
 *
 *   // Size is tracked for conflict detection
 *   yield* TxChunk.append(txChunk, 6)
 *   const newSize = yield* TxChunk.size(txChunk)
 *   return [currentSize, newSize]
 * })
 *
 * await Effect.runPromise(program) // => [5, 6]
 * ```
 *
 * @category combinators
 * @since 4.0.0
 */
export const size = <A>(self: TxChunk<A>): Effect.Effect<number> =>
  modify(self, (current) => [Chunk.size(current), current])

/**
 * Checks whether the `TxChunk` is empty.
 *
 * **Example** (Checking for an empty chunk)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxChunk } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const emptyChunk = yield* TxChunk.empty<number>()
 *   const nonEmptyChunk = yield* TxChunk.fromIterable([1, 2, 3])
 *
 *   // Check if chunks are empty - automatically transactional
 *   const isEmpty1 = yield* TxChunk.isEmpty(emptyChunk)
 *   const isEmpty2 = yield* TxChunk.isEmpty(nonEmptyChunk)
 *
 *   return [isEmpty1, isEmpty2]
 * })
 *
 * await Effect.runPromise(program) // => [true, false]
 * ```
 *
 * @category predicates
 * @since 4.0.0
 */
export const isEmpty = <A>(self: TxChunk<A>): Effect.Effect<boolean> =>
  modify(self, (current) => [Chunk.isEmpty(current), current])

/**
 * Checks whether the `TxChunk` is non-empty.
 *
 * **Example** (Checking for a non-empty chunk)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxChunk } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const emptyChunk = yield* TxChunk.empty<number>()
 *   const nonEmptyChunk = yield* TxChunk.fromIterable([1, 2, 3])
 *
 *   // Check if chunks are non-empty - automatically transactional
 *   const isNonEmpty1 = yield* TxChunk.isNonEmpty(emptyChunk)
 *   const isNonEmpty2 = yield* TxChunk.isNonEmpty(nonEmptyChunk)
 *
 *   return [isNonEmpty1, isNonEmpty2]
 * })
 *
 * await Effect.runPromise(program) // => [false, true]
 * ```
 *
 * @category predicates
 * @since 4.0.0
 */
export const isNonEmpty = <A>(self: TxChunk<A>): Effect.Effect<boolean> =>
  modify(self, (current) => [Chunk.isNonEmpty(current), current])

/**
 * Takes the first `n` elements from the `TxChunk`.
 *
 * **Details**
 *
 * This function mutates the original TxChunk by keeping only the first n elements. It does not
 * return a new TxChunk reference.
 *
 * **Example** (Taking leading elements)
 *
 * ```ts import.meta.vitest
 * import { Chunk, Effect, TxChunk } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const txChunk = yield* TxChunk.fromIterable([1, 2, 3, 4, 5])
 *
 *   // Take only the first 3 elements - automatically transactional
 *   yield* TxChunk.take(txChunk, 3)
 *
 *   const result = yield* TxChunk.get(txChunk)
 *   return Chunk.toArray(result)
 * })
 *
 * await Effect.runPromise(program) // => [1, 2, 3]
 * ```
 *
 * @category combinators
 * @since 4.0.0
 */
export const take: {
  (n: number): <A>(self: TxChunk<A>) => Effect.Effect<void>
  <A>(self: TxChunk<A>, n: number): Effect.Effect<void>
} = dual(
  2,
  <A>(self: TxChunk<A>, n: number): Effect.Effect<void> => update(self, (current) => Chunk.take(current, n))
)

/**
 * Drops the first `n` elements from the `TxChunk`.
 *
 * **Details**
 *
 * This function mutates the original TxChunk by removing the first n elements. It does not return a
 * new TxChunk reference.
 *
 * **Example** (Dropping leading elements)
 *
 * ```ts import.meta.vitest
 * import { Chunk, Effect, TxChunk } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const txChunk = yield* TxChunk.fromIterable([1, 2, 3, 4, 5])
 *
 *   // Drop the first 2 elements - automatically transactional
 *   yield* TxChunk.drop(txChunk, 2)
 *
 *   const result = yield* TxChunk.get(txChunk)
 *   return Chunk.toArray(result)
 * })
 *
 * await Effect.runPromise(program) // => [3, 4, 5]
 * ```
 *
 * @category combinators
 * @since 4.0.0
 */
export const drop: {
  (n: number): <A>(self: TxChunk<A>) => Effect.Effect<void>
  <A>(self: TxChunk<A>, n: number): Effect.Effect<void>
} = dual(
  2,
  <A>(self: TxChunk<A>, n: number): Effect.Effect<void> => update(self, (current) => Chunk.drop(current, n))
)

/**
 * Takes a slice of the `TxChunk` from `start` to `end` (exclusive).
 *
 * **Details**
 *
 * This function mutates the original TxChunk by keeping only the elements in the specified range. It
 * does not return a new TxChunk reference.
 *
 * **Example** (Taking a slice)
 *
 * ```ts import.meta.vitest
 * import { Chunk, Effect, TxChunk } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const txChunk = yield* TxChunk.fromIterable([1, 2, 3, 4, 5, 6, 7])
 *
 *   // Take elements from index 2 to 5 (exclusive) - automatically transactional
 *   yield* TxChunk.slice(txChunk, 2, 5)
 *
 *   const result = yield* TxChunk.get(txChunk)
 *   return Chunk.toArray(result)
 * })
 *
 * await Effect.runPromise(program) // => [3, 4, 5]
 * ```
 *
 * @category combinators
 * @since 4.0.0
 */
export const slice: {
  (start: number, end: number): <A>(self: TxChunk<A>) => Effect.Effect<void>
  <A>(self: TxChunk<A>, start: number, end: number): Effect.Effect<void>
} = dual(
  3,
  <A>(self: TxChunk<A>, start: number, end: number): Effect.Effect<void> =>
    update(self, (current) => Chunk.take(Chunk.drop(current, start), end - start))
)

/**
 * Maps each element of the `TxChunk` using a function that returns the same
 * element type.
 *
 * **Details**
 *
 * This function mutates the original `TxChunk` by transforming each element in place. It does not
 * return a new `TxChunk` reference.
 *
 * **Example** (Mapping elements)
 *
 * ```ts import.meta.vitest
 * import { Chunk, Effect, TxChunk } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const txChunk = yield* TxChunk.fromIterable([1, 2, 3, 4])
 *
 *   // Transform each element atomically (must maintain same type)
 *   yield* TxChunk.map(txChunk, (n) => n * 2)
 *
 *   const result = yield* TxChunk.get(txChunk)
 *   return Chunk.toArray(result)
 * })
 *
 * await Effect.runPromise(program) // => [2, 4, 6, 8]
 * ```
 *
 * @category combinators
 * @since 4.0.0
 */
export const map: {
  <A>(f: (a: NoInfer<A>) => A): (self: TxChunk<A>) => Effect.Effect<void>
  <A>(self: TxChunk<A>, f: (a: A) => A): Effect.Effect<void>
} = dual(
  2,
  <A>(self: TxChunk<A>, f: (a: A) => A): Effect.Effect<void> => update(self, (current) => Chunk.map(current, f))
)

/**
 * Filters the `TxChunk` keeping only elements that satisfy the predicate.
 *
 * **Details**
 *
 * This function mutates the original TxChunk by removing elements that don't match the predicate. It
 * does not return a new TxChunk reference.
 *
 * **Example** (Filtering elements)
 *
 * ```ts import.meta.vitest
 * import { Chunk, Effect, TxChunk } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const txChunk = yield* TxChunk.fromIterable([1, 2, 3, 4, 5, 6])
 *
 *   // Keep only even numbers atomically
 *   yield* TxChunk.filter(txChunk, (n) => n % 2 === 0)
 *
 *   const result = yield* TxChunk.get(txChunk)
 *   return Chunk.toArray(result)
 * })
 *
 * await Effect.runPromise(program) // => [2, 4, 6]
 * ```
 *
 * @category combinators
 * @since 4.0.0
 */
export const filter: {
  <A, B extends A>(refinement: (a: A) => a is B): (self: TxChunk<A>) => Effect.Effect<void>
  <A>(predicate: (a: A) => boolean): (self: TxChunk<A>) => Effect.Effect<void>
  <A, B extends A>(self: TxChunk<A>, refinement: (a: A) => a is B): Effect.Effect<void>
  <A>(self: TxChunk<A>, predicate: (a: A) => boolean): Effect.Effect<void>
} = dual(
  2,
  <A>(self: TxChunk<A>, predicate: (a: A) => boolean): Effect.Effect<void> =>
    update(self, (current) => Chunk.filter(current, predicate))
)

/**
 * Concatenates another chunk to the end of the `TxChunk`.
 *
 * **Details**
 *
 * This function mutates the original TxChunk by appending all elements from the other chunk. It does
 * not return a new TxChunk reference.
 *
 * **Example** (Appending another chunk)
 *
 * ```ts import.meta.vitest
 * import { Chunk, Effect, TxChunk } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const txChunk = yield* TxChunk.fromIterable([1, 2, 3])
 *   const otherChunk = Chunk.fromIterable([4, 5, 6])
 *
 *   // Append all elements from another chunk atomically
 *   yield* TxChunk.appendAll(txChunk, otherChunk)
 *
 *   const result = yield* TxChunk.get(txChunk)
 *   return Chunk.toArray(result)
 * })
 *
 * await Effect.runPromise(program) // => [1, 2, 3, 4, 5, 6]
 * ```
 *
 * @category combinators
 * @since 4.0.0
 */
export const appendAll: {
  <A>(other: Chunk.Chunk<A>): (self: TxChunk<A>) => Effect.Effect<void>
  <A>(self: TxChunk<A>, other: Chunk.Chunk<A>): Effect.Effect<void>
} = dual(
  2,
  <A>(self: TxChunk<A>, other: Chunk.Chunk<A>): Effect.Effect<void> =>
    update(self, (current) => Chunk.appendAll(current, other))
)

/**
 * Concatenates another chunk to the beginning of the `TxChunk`.
 *
 * **Details**
 *
 * This function mutates the original TxChunk by prepending all elements from the other chunk. It
 * does not return a new TxChunk reference.
 *
 * **Example** (Prepending another chunk)
 *
 * ```ts import.meta.vitest
 * import { Chunk, Effect, TxChunk } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const txChunk = yield* TxChunk.fromIterable([4, 5, 6])
 *   const otherChunk = Chunk.fromIterable([1, 2, 3])
 *
 *   // Prepend all elements from another chunk atomically
 *   yield* TxChunk.prependAll(txChunk, otherChunk)
 *
 *   const result = yield* TxChunk.get(txChunk)
 *   return Chunk.toArray(result)
 * })
 *
 * await Effect.runPromise(program) // => [1, 2, 3, 4, 5, 6]
 * ```
 *
 * @category combinators
 * @since 4.0.0
 */
export const prependAll: {
  <A>(other: Chunk.Chunk<A>): (self: TxChunk<A>) => Effect.Effect<void>
  <A>(self: TxChunk<A>, other: Chunk.Chunk<A>): Effect.Effect<void>
} = dual(
  2,
  <A>(self: TxChunk<A>, other: Chunk.Chunk<A>): Effect.Effect<void> =>
    update(self, (current) => Chunk.prependAll(current, other))
)

/**
 * Concatenates another `TxChunk` to the end of this `TxChunk`.
 *
 * **Details**
 *
 * This function mutates the original TxChunk by appending all elements from the other TxChunk. It
 * does not return a new TxChunk reference.
 *
 * **Example** (Concatenating TxChunks)
 *
 * ```ts import.meta.vitest
 * import { Chunk, Effect, TxChunk } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const txChunk1 = yield* TxChunk.fromIterable([1, 2, 3])
 *   const txChunk2 = yield* TxChunk.fromIterable([4, 5, 6])
 *
 *   // Concatenate atomically within a transaction
 *   yield* TxChunk.concat(txChunk1, txChunk2)
 *
 *   const result = yield* TxChunk.get(txChunk1)
 *
 *   // Original txChunk2 is unchanged
 *   const original = yield* TxChunk.get(txChunk2)
 *   return [Chunk.toArray(result), Chunk.toArray(original)]
 * })
 *
 * await Effect.runPromise(program) // => [[1, 2, 3, 4, 5, 6], [4, 5, 6]]
 * ```
 *
 * @category combinators
 * @since 4.0.0
 */
export const concat: {
  <A>(other: TxChunk<A>): (self: TxChunk<A>) => Effect.Effect<void>
  <A>(self: TxChunk<A>, other: TxChunk<A>): Effect.Effect<void>
} = dual(
  2,
  <A>(self: TxChunk<A>, other: TxChunk<A>): Effect.Effect<void> =>
    Effect.gen(function*() {
      const otherChunk = yield* get(other)
      yield* appendAll(self, otherChunk)
    }).pipe(Effect.tx)
)
