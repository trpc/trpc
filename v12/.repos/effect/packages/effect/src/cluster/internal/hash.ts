/**
 * Internal hashing helpers used by cluster routing to map entity identifiers to
 * shard numbers. The hash is intentionally small and deterministic for
 * JavaScript strings so every node that sees the same entity id and sharding
 * configuration derives the same destination shard.
 *
 * **Gotchas**
 *
 * - Changing this implementation changes entity-to-shard assignment.
 * - Strings are hashed as UTF-16 code units; normalize ids before routing if
 *   callers may produce equivalent text in different Unicode forms.
 */
/**
 * @internal
 */
export const hashOptimize = (n: number): number => (n & 0xbfffffff) | ((n >>> 1) & 0x40000000)

/**
 * @internal
 */
export const hashString = (str: string) => {
  let h = 5381, i = str.length
  while (i) {
    h = (h * 33) ^ str.charCodeAt(--i)
  }
  return hashOptimize(h)
}
