/**
 * Interfaces for describing changes to a value as patches. A
 * `Differ<T, Patch>` compares an old and new value, creates a patch for the
 * difference, combines patches in order, and applies a patch to an old value to
 * produce an updated value.
 *
 * @since 4.0.0
 */

/**
 * Describes how to compute, combine, and apply patches for values of type `T`.
 *
 * **When to use**
 *
 * Use to model patch-based updates for a value type when callers need to
 * compute a patch from two values, combine patches, and apply a patch later.
 *
 * **Details**
 *
 * A `Differ` provides an empty patch, computes the patch between two values,
 * combines patches, and applies a patch to an old value to produce an updated
 * value.
 *
 * @category models
 * @since 2.0.0
 */
export interface Differ<in out T, in out Patch> {
  readonly empty: Patch
  diff(oldValue: T, newValue: T): Patch
  combine(first: Patch, second: Patch): Patch
  patch(oldValue: T, patch: Patch): T
}
