/**
 * Works with values that may be `undefined`.
 *
 * Use this module for plain TypeScript values of type `A | undefined` when
 * `undefined` is the only absence marker. It is a small alternative to wrapping
 * values in `Option` when your data already uses `undefined` to mean "no
 * value". The module includes helpers for mapping defined values, matching both
 * cases, throwing when a value is missing, adapting throwing functions, and
 * building reducers or combiners.
 *
 * @since 4.0.0
 */
import * as Combiner from "./Combiner.ts"
import type { LazyArg } from "./Function.ts"
import { dual } from "./Function.ts"
import * as Reducer from "./Reducer.ts"

/**
 * Maps a defined value with `f`, or returns `undefined` unchanged.
 *
 * **When to use**
 *
 * Use to apply a pure transformation to an `A | undefined` value while
 * preserving `undefined` as absence.
 *
 * @see {@link match} when you need to handle the `undefined` case explicitly
 *
 * @category mapping
 * @since 4.0.0
 */
export const map: {
  <A, B>(f: (a: A) => B): (self: A | undefined) => B | undefined
  <A, B>(self: A | undefined, f: (a: A) => B): B | undefined
} = dual(2, (self, f) => (self === undefined ? undefined : f(self)))

/**
 * Pattern matches on an `A | undefined` value, running `onDefined` when the
 * value is present or evaluating `onUndefined` when the value is `undefined`.
 *
 * **When to use**
 *
 * Use when you need to turn an `A | undefined` into a non-optional result by
 * handling both the defined and undefined branches in one expression.
 *
 * @see {@link map} for transforming defined values while preserving `undefined`
 * @see {@link getOrThrowWith} for throwing when the value is `undefined` instead of returning a fallback branch
 *
 * @category pattern matching
 * @since 4.0.0
 */
export const match: {
  <B, A, C = B>(options: {
    readonly onUndefined: LazyArg<B>
    readonly onDefined: (a: A) => C
  }): (self: A | undefined) => B | C
  <A, B, C = B>(self: A | undefined, options: {
    readonly onUndefined: LazyArg<B>
    readonly onDefined: (a: A) => C
  }): B | C
} = dual(
  2,
  <A, B, C = B>(self: A | undefined, { onDefined, onUndefined }: {
    readonly onUndefined: LazyArg<B>
    readonly onDefined: (a: A) => C
  }): B | C => self === undefined ? onUndefined() : onDefined(self)
)

/**
 * Returns the defined value, or throws the value produced by `onUndefined`
 * when the input is `undefined`.
 *
 * **When to use**
 *
 * Use when you need fail-fast unwrapping of an `A | undefined` value and want
 * to provide the thrown error for the undefined case.
 *
 * **Details**
 *
 * Defined values are returned unchanged. When the input is `undefined`,
 * `onUndefined` is called and its result is thrown.
 *
 * @see {@link getOrThrow} for the default-error sibling
 * @see {@link match} for handling defined and undefined cases without throwing
 *
 * @category getters
 * @since 4.0.0
 */
export const getOrThrowWith: {
  (onUndefined: () => unknown): <A>(self: A | undefined) => A
  <A>(self: A | undefined, onUndefined: () => unknown): A
} = dual(2, <A>(self: A | undefined, onUndefined: () => unknown): A => {
  if (self !== undefined) {
    return self
  }
  throw onUndefined()
})

/**
 * Returns the defined value, or throws a default `Error` when the input is
 * `undefined`.
 *
 * **When to use**
 *
 * Use when you need to unwrap a value that should already be defined and a
 * generic missing-value `Error` is acceptable.
 *
 * **Details**
 *
 * Defined inputs are returned unchanged. `undefined` throws
 * `new Error("getOrThrow called on a undefined")`.
 *
 * @see {@link getOrThrowWith} for the sibling that lets callers choose the thrown value
 * @see {@link match} for handling defined and undefined cases without throwing
 *
 * @category getters
 * @since 4.0.0
 */
export const getOrThrow: <A>(self: A | undefined) => A = getOrThrowWith(() =>
  new Error("getOrThrow called on a undefined")
)

/**
 * Converts a throwing function into one that returns successful results
 * unchanged and returns `undefined` when the function throws.
 *
 * **When to use**
 *
 * Use to adapt exception-throwing functions when `undefined` is the absence
 * value you want to return for failures.
 *
 * **Gotchas**
 *
 * Thrown values are discarded. If the wrapped function can successfully return
 * `undefined`, that success is indistinguishable from a thrown failure.
 *
 * @category converting
 * @since 4.0.0
 */
export const liftThrowable = <A extends ReadonlyArray<unknown>, B>(
  f: (...a: A) => B
): (...a: A) => B | undefined =>
(...a) => {
  try {
    return f(...a)
  } catch {
    return undefined
  }
}

/**
 * Creates a `Reducer` for `UndefinedOr<A>` that prioritizes the first non-`undefined`
 * value and combines values when both operands are present.
 *
 * **When to use**
 *
 * Use when you need to reduce values that may be `undefined`, keeping the
 * first defined value as a fallback and combining only when both operands are
 * defined.
 *
 * **Details**
 *
 * Combining `undefined` with `undefined` returns `undefined`. Combining a
 * defined value with `undefined` keeps the defined value, so the first defined
 * value wins when only one side is present. When both values are defined, they
 * are combined with `combiner.combine`. The reducer's initial value is
 * `undefined`.
 *
 * @category constructors
 * @since 4.0.0
 */
export function makeReducer<A>(combiner: Combiner.Combiner<A>): Reducer.Reducer<A | undefined> {
  return Reducer.make((self, that) => {
    if (self === undefined) return that
    if (that === undefined) return self
    return combiner.combine(self, that)
  }, undefined as A | undefined)
}

/**
 * Creates a `Combiner` for `A | undefined` that combines values only when both
 * operands are defined.
 *
 * **When to use**
 *
 * Use to lift a `Combiner` so any `undefined` operand makes the combined result
 * `undefined`.
 *
 * **Details**
 *
 * - `undefined` combined with any value returns `undefined`
 * - Any value combined with `undefined` returns `undefined`
 * - `a` combined with `b` returns `combiner.combine(a, b)`
 *
 * @see {@link makeReducerFailFast} if you have a `Reducer` and want to lift it
 * to `UndefinedOr` values.
 *
 * @category constructors
 * @since 4.0.0
 */
export function makeCombinerFailFast<A>(combiner: Combiner.Combiner<A>): Combiner.Combiner<A | undefined> {
  return Combiner.make((self, that) => {
    if (self === undefined || that === undefined) return undefined
    return combiner.combine(self, that)
  })
}

/**
 * Creates a `Reducer` for `A | undefined` by wrapping an existing reducer with
 * fail-fast semantics.
 *
 * **When to use**
 *
 * Use to wrap an existing `Reducer` so any `undefined` value aborts the entire
 * reduction result.
 *
 * **Details**
 *
 * - Initial value is the wrapped reducer's `initialValue`
 * - Combining two defined values delegates to the wrapped reducer
 * - If the accumulator or next value is `undefined`, the reduction returns `undefined`
 *
 * @see {@link makeCombinerFailFast} if you only have a `Combiner` and want to
 * lift it to `UndefinedOr` values.
 *
 * @category constructors
 * @since 4.0.0
 */
export function makeReducerFailFast<A>(reducer: Reducer.Reducer<A>): Reducer.Reducer<A | undefined> {
  const combine = makeCombinerFailFast(reducer).combine
  const initialValue = reducer.initialValue as A | undefined
  return Reducer.make(combine, initialValue, (collection) => {
    let out = initialValue
    for (const value of collection) {
      out = combine(out, value)
      if (out === undefined) return out
    }
    return out
  })
}
