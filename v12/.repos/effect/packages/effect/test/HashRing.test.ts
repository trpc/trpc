import { assert, describe, it } from "@effect/vitest"
import * as Hash from "effect/Hash"
import * as HashRing from "effect/HashRing"
import * as PrimaryKey from "effect/PrimaryKey"

describe("HashRing", () => {
  it("updates the stored node when adding the same primary key", () => {
    const first = {
      name: "first",
      [PrimaryKey.symbol]() {
        return "node"
      }
    }
    const updated = {
      name: "updated",
      [PrimaryKey.symbol]() {
        return "node"
      }
    }
    const ring = HashRing.make<typeof first>()

    HashRing.add(ring, first)
    HashRing.add(ring, updated)

    assert.strictEqual(HashRing.get(ring, "request"), updated)
  })

  it("updates the stored node when changing its weight", () => {
    const first = {
      name: "first",
      [PrimaryKey.symbol]() {
        return "node"
      }
    }
    const updated = {
      name: "updated",
      [PrimaryKey.symbol]() {
        return "node"
      }
    }
    const ring = HashRing.make<typeof first>()

    HashRing.add(ring, first)
    HashRing.add(ring, updated, { weight: 2 })

    assert.strictEqual(HashRing.get(ring, "request"), updated)
  })

  it("getShards normalizes the shard count", () => {
    const node = {
      name: "node",
      [PrimaryKey.symbol]() {
        return "node"
      }
    }
    const ring = HashRing.make<typeof node>()
    HashRing.add(ring, node)

    const shards = [Number.NaN, -1, 0, 0.5, 1.9, 2.9].map((count) => HashRing.getShards(ring, count))

    assert.deepStrictEqual(shards, [[], [], [], [], [node], [node, node]])
  })

  it("getShards considers the first ring entry when excluding allocated nodes", () => {
    // With one ring entry per node, these keys make every shard nearest to
    // `second`, so `first` at index 0 is reached only by the exclusion scan.
    const first = {
      [PrimaryKey.symbol]() {
        return "node-10"
      }
    }
    const second = {
      [PrimaryKey.symbol]() {
        return "node-29"
      }
    }
    const ring = HashRing.make<typeof first>({ baseWeight: 1 })
    HashRing.add(ring, first)
    HashRing.add(ring, second)

    assert.deepStrictEqual(HashRing.getShards(ring, 3)?.map(PrimaryKey.value), ["node-10", "node-29", "node-29"])
  })

  it("getShards is unchanged after adding and removing a fractional-weight node", () => {
    const [a, b, c, d] = ["runner-a:34431", "runner-b:34431", "runner-c:34431", "runner-d:34431"].map(makeNode)
    // Adding and removing `d` leaves a different floating-point weight total
    // than adding only `a`, `b` and `c`.
    const churned = HashRing.make<Node>()
    HashRing.addMany(churned, [a, b, c], { weight: 0.1 })
    HashRing.add(churned, d, { weight: 0.3 })
    HashRing.remove(churned, d)
    const fresh = HashRing.make<Node>()
    HashRing.addMany(fresh, [a, b, c], { weight: 0.1 })

    assert.deepStrictEqual(HashRing.getShards(churned, 300), HashRing.getShards(fresh, 300))
  })

  it("getShards breaks ring hash ties independently of insertion order", () => {
    const first = makeNode("runner-27:34431")
    const second = makeNode("runner-1176:34431")
    // These virtual points of different nodes have the same hash.
    assert.strictEqual(Hash.string("runner-27:34431:13"), Hash.string("runner-1176:34431:71"))
    const ring = HashRing.make<Node>()
    HashRing.add(ring, first)
    HashRing.add(ring, second)
    const swapped = HashRing.make<Node>()
    HashRing.add(swapped, second)
    HashRing.add(swapped, first)

    assert.deepStrictEqual(
      HashRing.getShards(swapped, 300),
      HashRing.getShards(ring, 300)
    )
  })

  it("getShards keeps the assignment for integer weights", () => {
    const ring = HashRing.make<Node>()
    const nodes = Array.from({ length: 5 }, (_, i) => makeNode(`runner-${i}:34431`))
    const weights = [1, 1, 2, 1, 3]
    weights.forEach((weight, i) => HashRing.add(ring, nodes[i], { weight }))

    // Assignment from the implementation before deterministic ordering.
    assert.deepStrictEqual(
      HashRing.getShards(ring, 16),
      [4, 3, 0, 2, 2, 4, 3, 4, 1, 2, 2, 4, 1, 4, 4, 0].map((i) => nodes[i])
    )
  })
})

interface Node extends PrimaryKey.PrimaryKey {}

const makeNode = (key: string): Node => ({
  [PrimaryKey.symbol]() {
    return key
  }
})
