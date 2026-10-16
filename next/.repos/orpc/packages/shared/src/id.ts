/**
 * Compares two sequential IDs.
 * Returns:
 *  - negative if `a` < `b`
 *  - positive if `a` > `b`
 *  - 0 if equal
 */
export function compareSequentialIds(a: string, b: string): number {
  if (a.length !== b.length) {
    return a.length - b.length
  }

  return a < b ? -1 : a > b ? 1 : 0
}
