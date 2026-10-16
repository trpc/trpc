/**
 * Back-edge count used to avoid caching entry-point-dependent hashes.
 *
 * @internal
 */
export let backEdges = 0

/** @internal */
export const addBackEdge = (): void => {
  backEdges++
}
