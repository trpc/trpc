/**
 * Assigns string inputs to nodes with weighted consistent hashing.
 *
 * A hash ring minimizes remapping when nodes are added, removed, or reweighted.
 * This makes it useful for routing requests, partitioning keys, and
 * distributing shards across service instances or storage backends. This module
 * can create rings, add or remove nodes by `PrimaryKey`, route an input string
 * to a node, and compute shard assignments.
 *
 * @since 4.0.0
 */
import { dual } from "./Function.ts"
import * as Hash from "./Hash.ts"
import { PipeInspectableProto } from "./internal/core.ts"
import * as Count from "./internal/count.ts"
import * as Iterable from "./Iterable.ts"
import type { Pipeable } from "./Pipeable.ts"
import { hasProperty } from "./Predicate.ts"
import * as PrimaryKey from "./PrimaryKey.ts"

const TypeId = "~effect/HashRing" as const

/**
 * A weighted consistent-hashing ring for assigning inputs to nodes with stable
 * remapping as nodes are added or removed.
 *
 * **When to use**
 *
 * Use to maintain a mutable weighted hash ring for routing keys or shards to
 * nodes identified by `PrimaryKey`.
 *
 * **Details**
 *
 * Nodes are identified by their `PrimaryKey` value and can be iterated from the
 * ring.
 *
 * @category models
 * @since 3.19.0
 */
export interface HashRing<A extends PrimaryKey.PrimaryKey> extends Pipeable, Iterable<A> {
  readonly [TypeId]: typeof TypeId
  readonly baseWeight: number
  totalWeightCache: number
  readonly nodes: Map<string, [node: A, weight: number]>
  ring: Array<[hash: number, node: string]>
}

/**
 * Checks whether a value is a `HashRing`.
 *
 * **When to use**
 *
 * Use to narrow an `unknown` value before treating it as a `HashRing`, such as
 * values crossing an untyped boundary.
 *
 * **Details**
 *
 * The guard checks for the module's internal `TypeId` property and narrows to
 * `HashRing<any>`.
 *
 * **Gotchas**
 *
 * This is a structural type-id check; it does not validate the ring's `nodes`,
 * `ring`, or weight state.
 *
 * @see {@link HashRing} for the type narrowed by this guard
 * @see {@link make} for creating an empty `HashRing`
 *
 * @category guards
 * @since 3.19.0
 */
export const isHashRing = (u: unknown): u is HashRing<any> => hasProperty(u, TypeId)

/**
 * Creates an empty `HashRing`.
 *
 * **When to use**
 *
 * Use to create an empty weighted consistent-hashing ring with the default or
 * custom virtual-point density.
 *
 * **Details**
 *
 * `baseWeight` controls how many virtual points are added for a node with
 * weight `1`; it defaults to `128` and is clamped to at least `1`.
 *
 * @see {@link add} for registering one node after creation
 * @see {@link addMany} for registering several nodes after creation
 *
 * @category constructors
 * @since 3.19.0
 */
export const make = <A extends PrimaryKey.PrimaryKey>(options?: {
  readonly baseWeight?: number | undefined
}): HashRing<A> => {
  const self = Object.create(Proto)
  self.baseWeight = Math.max(options?.baseWeight ?? 128, 1)
  self.totalWeightCache = 0
  self.nodes = new Map()
  self.ring = []
  return self
}

const Proto = {
  ...PipeInspectableProto,
  [TypeId]: TypeId,
  [Symbol.iterator]<A extends PrimaryKey.PrimaryKey>(this: HashRing<A>): Iterator<A> {
    return Iterable.map(this.nodes.values(), ([n]) => n)[Symbol.iterator]()
  },
  toJSON(this: HashRing<any>) {
    return {
      _id: "HashRing",
      baseWeight: this.baseWeight,
      nodes: this.ring.map(([, n]) => this.nodes.get(n)![0])
    }
  }
}

/**
 * Adds new nodes to the ring. If a node already exists in the ring, it
 * will be updated. For example, you can use this to update the node's weight.
 *
 * **When to use**
 *
 * Use to register or update several nodes in a `HashRing` at the same weight.
 *
 * @category combinators
 * @since 3.19.0
 */
export const addMany: {
  <A extends PrimaryKey.PrimaryKey>(nodes: Iterable<A>, options?: {
    readonly weight?: number | undefined
  }): (self: HashRing<A>) => HashRing<A>
  <A extends PrimaryKey.PrimaryKey>(self: HashRing<A>, nodes: Iterable<A>, options?: {
    readonly weight?: number | undefined
  }): HashRing<A>
} = dual(
  (args) => isHashRing(args[0]),
  <A extends PrimaryKey.PrimaryKey>(self: HashRing<A>, nodes: Iterable<A>, options?: {
    readonly weight?: number | undefined
  }): HashRing<A> => {
    const weight = Math.max(options?.weight ?? 1, 0.1)
    const keys: Array<string> = []
    let toRemove: Set<string> | undefined
    for (const node of nodes) {
      const key = PrimaryKey.value(node)
      const entry = self.nodes.get(key)
      if (entry) {
        entry[0] = node
        if (entry[1] === weight) continue
        toRemove ??= new Set()
        toRemove.add(key)
        entry[1] = weight
      } else {
        self.nodes.set(key, [node, weight])
      }
      keys.push(key)
    }
    if (toRemove) {
      self.ring = self.ring.filter(([, n]) => !toRemove.has(n))
    }
    addNodesToRing(self, keys, Math.round(weight * self.baseWeight))
    updateTotalWeight(self)
    return self
  }
)

function addNodesToRing<A extends PrimaryKey.PrimaryKey>(self: HashRing<A>, keys: Array<string>, weight: number) {
  for (let i = weight; i > 0; i--) {
    for (let j = 0; j < keys.length; j++) {
      const key = keys[j]
      self.ring.push([
        Hash.string(`${key}:${i}`),
        key
      ])
    }
  }
  // Break hash ties by node key to avoid insertion-order dependence.
  self.ring.sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
}

// Sum in key order to avoid history-dependent floating-point rounding.
function updateTotalWeight<A extends PrimaryKey.PrimaryKey>(self: HashRing<A>) {
  const keys = Array.from(self.nodes.keys()).sort()
  let total = 0
  for (let i = 0; i < keys.length; i++) {
    total += self.nodes.get(keys[i])![1]
  }
  self.totalWeightCache = total
}

/**
 * Adds a new node to the ring. If the node already exists in the ring, it
 * will be updated. For example, you can use this to update the node's weight.
 *
 * **When to use**
 *
 * Use to register one node in a `HashRing` so lookups and shard assignments can
 * return it, or update that node's weight.
 *
 * **Details**
 *
 * Nodes are matched by `PrimaryKey.value`. The weight defaults to `1` and is
 * clamped to at least `0.1`.
 *
 * **Gotchas**
 *
 * This mutates and returns the same ring instance.
 *
 * @see {@link addMany} for adding or updating several nodes
 * @see {@link remove} for unregistering a node
 * @see {@link has} for checking primary-key membership
 *
 * @category combinators
 * @since 3.19.0
 */
export const add: {
  <A extends PrimaryKey.PrimaryKey>(node: A, options?: {
    readonly weight?: number | undefined
  }): (self: HashRing<A>) => HashRing<A>
  <A extends PrimaryKey.PrimaryKey>(self: HashRing<A>, node: A, options?: {
    readonly weight?: number | undefined
  }): HashRing<A>
} = dual((args) => isHashRing(args[0]), <A extends PrimaryKey.PrimaryKey>(self: HashRing<A>, node: A, options?: {
  readonly weight?: number | undefined
}): HashRing<A> => addMany(self, [node], options))

/**
 * Removes the node from the ring. No-op's if the node does not exist.
 *
 * **When to use**
 *
 * Use to remove a node that has left the pool so future lookups and shard
 * assignments stop returning it.
 *
 * **Details**
 *
 * Removal matches by `PrimaryKey.value`, so any value with the same primary key
 * removes the same ring member.
 *
 * **Gotchas**
 *
 * This mutates and returns the same ring instance.
 *
 * @see {@link add} for registering or updating a node
 * @see {@link has} for checking membership by primary key
 *
 * @category combinators
 * @since 3.19.0
 */
export const remove: {
  <A extends PrimaryKey.PrimaryKey>(node: A): (self: HashRing<A>) => HashRing<A>
  <A extends PrimaryKey.PrimaryKey>(self: HashRing<A>, node: A): HashRing<A>
} = dual(2, <A extends PrimaryKey.PrimaryKey>(self: HashRing<A>, node: A): HashRing<A> => {
  const key = PrimaryKey.value(node)
  const entry = self.nodes.get(key)
  if (entry) {
    self.nodes.delete(key)
    self.ring = self.ring.filter(([, n]) => n !== key)
    updateTotalWeight(self)
  }
  return self
})

/**
 * Checks whether the ring contains a node with the same `PrimaryKey` value.
 *
 * **When to use**
 *
 * Use when you need to know whether registering a node would update an existing
 * ring member because another node already has the same primary-key identity.
 *
 * **Details**
 *
 * Membership is checked with `self.nodes.has(PrimaryKey.value(node))`, so
 * matching is by primary key, not object identity or weight.
 *
 * @see {@link add} for registering or updating nodes
 * @see {@link remove} for removing nodes by the same primary-key identity
 * @see {@link get} for routing an input string to a node
 *
 * @category combinators
 * @since 3.19.0
 */
export const has: {
  <A extends PrimaryKey.PrimaryKey>(node: A): (self: HashRing<A>) => boolean
  <A extends PrimaryKey.PrimaryKey>(self: HashRing<A>, node: A): boolean
} = dual(
  2,
  <A extends PrimaryKey.PrimaryKey>(self: HashRing<A>, node: A): boolean => self.nodes.has(PrimaryKey.value(node))
)

/**
 * Gets the node which should handle the given input. Returns undefined if
 * the hashring has no elements with weight.
 *
 * **When to use**
 *
 * Use to route a single string input key to the current ring member responsible
 * for that key.
 *
 * @see {@link getShards} for assigning fixed shard indexes instead of routing
 * one input string at a time
 *
 * @category combinators
 * @since 3.19.0
 */
export const get = <A extends PrimaryKey.PrimaryKey>(self: HashRing<A>, input: string): A | undefined => {
  if (self.ring.length === 0) {
    return undefined
  }
  const index = getIndexForInput(self, Hash.string(input))[0]
  const node = self.ring[index][1]!
  return self.nodes.get(node)![0]
}

/**
 * Computes a balanced shard distribution across the nodes in the ring.
 *
 * **When to use**
 *
 * Use to precompute ownership for a fixed number of shard indexes across the
 * current ring members.
 *
 * **Details**
 *
 * Finite fractional values of `count` are rounded down. `NaN` and non-positive
 * values produce an empty shard distribution.
 *
 * @category combinators
 * @since 3.19.0
 */
export const getShards = <A extends PrimaryKey.PrimaryKey>(self: HashRing<A>, count: number): Array<A> | undefined => {
  if (self.ring.length === 0) {
    return undefined
  }
  count = Count.normalize(count)

  const shards = new Array<A>(count)

  // for tracking how many shards have been allocated to each node
  const allocations = new Map<string, number>()
  // for tracking which shards still need to be allocated
  const remaining = new Set<number>()
  // for tracking which nodes have reached the max allocation
  const exclude = new Set<string>()

  // First pass - allocate the closest nodes, skipping nodes that have reached
  // max
  const distances = new Array<[shard: number, node: string, distance: number]>(count)
  for (let shard = 0; shard < count; shard++) {
    const hash = (shardHashes[shard] ??= Hash.string(`shard-${shard}`))
    const [index, distance] = getIndexForInput(self, hash)
    const node = self.ring[index][1]!
    distances[shard] = [shard, node, distance]
    remaining.add(shard)
  }
  distances.sort((a, b) => a[2] - b[2])
  for (let i = 0; i < count; i++) {
    const [shard, node] = distances[i]
    if (exclude.has(node)) continue
    const [value, weight] = self.nodes.get(node)!
    shards[shard] = value
    remaining.delete(shard)
    const nodeCount = (allocations.get(node) ?? 0) + 1
    allocations.set(node, nodeCount)
    const maxPerNode = Math.max(1, Math.floor(count * (weight / self.totalWeightCache)))
    if (nodeCount >= maxPerNode) {
      exclude.add(node)
    }
  }

  // Second pass - allocate any remaining shards, skipping nodes that have
  // reached max
  let allAtMax = exclude.size === self.nodes.size
  remaining.forEach((shard) => {
    const index = getIndexForInput(self, shardHashes[shard], allAtMax ? undefined : exclude)[0]
    const node = self.ring[index][1]
    const [value, weight] = self.nodes.get(node)!
    shards[shard] = value

    if (allAtMax) return
    const nodeCount = (allocations.get(node) ?? 0) + 1
    allocations.set(node, nodeCount)
    const maxPerNode = Math.max(1, Math.floor(count * (weight / self.totalWeightCache)))
    if (nodeCount >= maxPerNode) {
      exclude.add(node)
      if (exclude.size === self.nodes.size) {
        allAtMax = true
      }
    }
  })

  return shards
}

const shardHashes: Array<number> = []

function getIndexForInput<A extends PrimaryKey.PrimaryKey>(
  self: HashRing<A>,
  hash: number,
  exclude?: ReadonlySet<string> | undefined
): readonly [index: number, distance: number] {
  const ring = self.ring
  const len = ring.length

  let mid: number
  let lo = 0
  let hi = len - 1

  while (lo <= hi) {
    mid = ((lo + hi) / 2) >>> 0
    if (ring[mid][0] >= hash) {
      hi = mid - 1
    } else {
      lo = mid + 1
    }
  }
  const a = lo === len ? lo - 1 : lo
  const distA = Math.abs(ring[a][0] - hash)
  if (exclude === undefined) {
    const b = lo - 1
    if (b < 0) {
      return [a, distA]
    }
    const distB = Math.abs(ring[b][0] - hash)
    return distA <= distB ? [a, distA] : [b, distB]
  } else if (!exclude.has(ring[a][1])) {
    return [a, distA]
  }
  const range = Math.max(lo, len - lo)
  for (let i = 1; i <= range; i++) {
    let index = lo - i
    if (index >= 0 && index < len && !exclude.has(ring[index][1])) {
      return [index, Math.abs(ring[index][0] - hash)]
    }
    index = lo + i
    if (index >= 0 && index < len && !exclude.has(ring[index][1])) {
      return [index, Math.abs(ring[index][0] - hash)]
    }
  }
  return [a, distA]
}
