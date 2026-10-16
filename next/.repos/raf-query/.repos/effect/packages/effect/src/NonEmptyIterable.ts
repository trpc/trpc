/**
 * The `NonEmptyIterable` module provides a type-level representation of any
 * JavaScript `Iterable` that is known to contain at least one element. A
 * `NonEmptyIterable<A>` can be consumed anywhere an `Iterable<A>` is expected,
 * while also carrying the guarantee that reading the first element is safe.
 *
 * @since 2.0.0
 */

/**
 * Defines the type-level symbol used to brand the `NonEmptyIterable` type.
 *
 * **When to use**
 *
 * Use as the property key for the type-level brand that marks an `Iterable` as
 * non-empty.
 *
 * **Details**
 *
 * `NonEmptyIterable<A>` includes `readonly [nonEmpty]: A`, which makes it
 * distinct from a plain `Iterable<A>` at compile time while preserving the
 * normal iteration shape.
 *
 * @see {@link NonEmptyIterable} for the branded iterable type that uses this symbol
 *
 * @category symbols
 * @since 2.0.0
 */
export declare const nonEmpty: unique symbol

/**
 * Represents an iterable that is guaranteed to contain at least one element.
 *
 * **When to use**
 *
 * Use to require an iterable input that must provide at least one element.
 *
 * **Details**
 *
 * `NonEmptyIterable<A>` extends the standard `Iterable<A>` interface with a type-level
 * guarantee of non-emptiness. This allows for safe operations that would otherwise
 * require runtime checks or could throw exceptions.
 *
 * The type is branded with a unique symbol to ensure type safety while maintaining
 * full compatibility with JavaScript's iteration protocol.
 *
 * @category models
 * @since 2.0.0
 */
export interface NonEmptyIterable<out A> extends Iterable<A> {
  readonly [nonEmpty]: A
}

/**
 * Extracts the first element and remaining elements from a non-empty iterable safely.
 *
 * **When to use**
 *
 * Use to split a non-empty iterable into its first element and an iterator for
 * the remaining elements.
 *
 * **Details**
 *
 * This function provides a safe way to deconstruct a `NonEmptyIterable` into its
 * head (first element) and tail (remaining elements as an iterator). Since the
 * iterable is guaranteed to be non-empty, the first element is always available.
 *
 * **Example** (Extracting first and remaining elements)
 *
 * ```ts import.meta.vitest
 * import { Chunk, NonEmptyIterable } from "effect"
 *
 * const [first, rest] = NonEmptyIterable.unprepend(Chunk.make(1, 2, 3))
 *
 * first // => 1
 * globalThis.Array.from({ [Symbol.iterator]: () => rest }) // => [2, 3]
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export const unprepend = <A>(self: NonEmptyIterable<A>): [firstElement: A, remainingElements: Iterator<A>] => {
  const iterator = self[Symbol.iterator]()
  const next = iterator.next()
  if (next.done) {
    throw new Error(
      "BUG: NonEmptyIterator should not be empty - please report an issue at https://github.com/Effect-TS/effect/issues"
    )
  }
  return [next.value, iterator]
}
