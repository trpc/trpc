/**
 * Normalizes a collection count to a non-negative integer. `NaN` and
 * non-positive values become `0`; positive infinity is preserved.
 *
 * @internal
 */
export const normalize = (n: number): number => n > 0 ? Math.floor(n) : 0

/**
 * Normalizes a collection count to an integer greater than or equal to `1`.
 *
 * @internal
 */
export const normalizeNonEmpty = (n: number): number => Math.max(1, normalize(n))
