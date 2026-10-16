export type SieveCache<TKey, TValue> = {
  get: (key: TKey) => TValue | undefined
  set: (key: TKey, value: TValue) => void
  clear: () => void
}

/**
 * A fixed-capacity cache using the SIEVE eviction algorithm
 * (https://cachemon.github.io/SIEVE-website/).
 *
 * Entries live in the Map's FIFO insertion order; a hit only flips a `visited`
 * bit instead of relinking the entry, which makes `get` (by far the hottest
 * operation here) one `Map.get` plus a boolean store. Eviction sweeps a `hand`
 * from the oldest entry towards the newest, clearing `visited` bits until it
 * finds an unvisited entry to drop, so entries touched since the last sweep
 * survive one more round. This keeps LRU-like hit ratios while being
 * scan-resistant.
 */
export function createSieveCache<TKey, TValue>(
  max: number,
): SieveCache<TKey, TValue> {
  type Node = {
    key: TKey
    value: TValue
    visited: boolean
  }
  const cache = new Map<TKey, Node>()
  let hand: IterableIterator<Node> | undefined
  let newest: Node | undefined

  return {
    get(key) {
      const entry = cache.get(key)
      if (!entry) {
        return undefined
      }
      entry.visited = true
      return entry.value
    },
    set(key, value) {
      const existing = cache.get(key)
      if (existing) {
        existing.value = value
        return
      }
      if (cache.size >= max) {
        // sweep from `hand` towards `newest` (wrapping around to `oldest`),
        // clearing `visited` bits, and evict the first unvisited entry
        let node = hand?.next().value
        while (!node || node.visited) {
          if (node) {
            node.visited = false
          } else {
            hand = cache.values()
          }
          node = hand!.next().value
        }
        // Live Map iterators see later insertions. Reset at the boundary so the
        // next sweep wraps to the oldest entry instead of visiting a replacement.
        if (node === newest) {
          hand = undefined
        }
        cache.delete(node.key)
      }
      const entry: Node = { key, value, visited: false }
      newest = entry
      cache.set(key, entry)
    },
    clear() {
      cache.clear()
      hand = undefined
      newest = undefined
    },
  }
}
