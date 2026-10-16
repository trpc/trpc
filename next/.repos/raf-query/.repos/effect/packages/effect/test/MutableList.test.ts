import { describe, it } from "@effect/vitest"
import { deepStrictEqual, strictEqual } from "@effect/vitest/utils"
import { MutableList } from "effect"

describe("MutableList", () => {
  it("prependAll with no values preserves existing elements", () => {
    const list = MutableList.make<number>()
    MutableList.appendAll(list, [1, 2])
    MutableList.prependAll(list, [])
    strictEqual(list.length, 2)
    strictEqual(MutableList.take(list), 1)
    strictEqual(MutableList.take(list), 2)
    strictEqual(list.length, 0)
  })

  it("prependAll with no values keeps an empty list appendable", () => {
    const list = MutableList.make<number>()
    MutableList.prependAll(list, [])
    strictEqual(list.length, 0)
    strictEqual(list.head, undefined)
    strictEqual(list.tail, undefined)
    MutableList.appendAll(list, [3])
    strictEqual(MutableList.take(list), 3)
  })

  it("bounds the retained slots of a list that never fully drains", () => {
    const takes: Array<[batch: number, take: (list: MutableList.MutableList<number>) => void]> = [
      [1, (list) => MutableList.take(list)],
      [7, (list) => MutableList.takeN(list, 7)],
      [3, (list) => MutableList.takeNVoid(list, 3)]
    ]
    for (const [batch, take] of takes) {
      const list = MutableList.make<number>()
      MutableList.append(list, -1)
      for (let i = 0; i < 10_000; i++) {
        for (let j = 0; j < batch; j++) MutableList.append(list, i * batch + j)
        take(list)
      }
      const slots = list.head!.array.length
      strictEqual(slots <= 2048, true, `retained ${slots} slots for one element`)
      deepStrictEqual(MutableList.takeAll(list), [10_000 * batch - 1])
    }
  })

  it("keeps later buckets intact when consuming a large prefix", () => {
    const list = MutableList.make<number>()
    for (let i = 0; i < 2048; i++) MutableList.append(list, i)
    MutableList.appendAll(list, [2048])
    MutableList.takeNVoid(list, 1920)
    deepStrictEqual(MutableList.takeAll(list), Array.from({ length: 129 }, (_, i) => i + 1920))
  })

  it("takeN advances past a drained appendAll bucket", () => {
    const list = MutableList.make<number>()
    MutableList.appendAll(list, [1, 2])
    MutableList.appendAll(list, [3])

    deepStrictEqual(MutableList.takeN(list, 2), [1, 2])
    strictEqual(list.length, 1)
    deepStrictEqual(MutableList.toArray(list), [3])
    strictEqual(MutableList.take(list), 3)
    strictEqual(list.length, 0)
    strictEqual(MutableList.take(list), MutableList.Empty)
    MutableList.append(list, 4)
    strictEqual(MutableList.take(list), 4)
  })

  it("takeN advances past a drained append bucket but not a partially drained bucket", () => {
    const list = MutableList.make<number>()
    MutableList.append(list, 1)
    MutableList.appendAll(list, [2, 3, 4])

    deepStrictEqual(MutableList.takeN(list, 1), [1])
    strictEqual(MutableList.take(list), 2)
    deepStrictEqual(MutableList.takeN(list, 1), [3])
    strictEqual(MutableList.take(list), 4)
    strictEqual(list.length, 0)
  })

  it("preserves a prepended element when appending to the list", () => {
    const list = MutableList.make<number>()
    MutableList.prepend(list, 1)
    MutableList.append(list, 2)

    strictEqual(MutableList.toArray(list).join(","), "1,2")
    strictEqual(list.length, 2)
  })

  it("preserves bulk-prepended values when appending to the list", () => {
    const list = MutableList.make<number>()
    MutableList.prependAll(list, [1, 2])
    MutableList.append(list, 3)

    deepStrictEqual(MutableList.toArray(list), [1, 2, 3], "bulk-prepended values should be preserved")
  })

  it("returns an empty snapshot for a negative bound", () => {
    const list = MutableList.make<number>()
    MutableList.append(list, 1)

    deepStrictEqual(MutableList.toArrayN(list, -1), [])
  })

  it("normalizes bounded operation counts", () => {
    const takeNaN = MutableList.make<number>()
    MutableList.appendAll(takeNaN, [1, 2, 3])
    deepStrictEqual(MutableList.takeN(takeNaN, Number.NaN), [])
    deepStrictEqual(MutableList.toArray(takeNaN), [1, 2, 3])

    const takeFraction = MutableList.make<number>()
    MutableList.appendAll(takeFraction, [1, 2, 3])
    deepStrictEqual(MutableList.takeN(takeFraction, 1.9), [1])
    deepStrictEqual(MutableList.toArray(takeFraction), [2, 3])

    const discardNaN = MutableList.make<number>()
    MutableList.appendAll(discardNaN, [1, 2, 3])
    MutableList.takeNVoid(discardNaN, Number.NaN)
    deepStrictEqual(MutableList.toArray(discardNaN), [1, 2, 3])

    const discardFraction = MutableList.make<number>()
    MutableList.appendAll(discardFraction, [1, 2, 3])
    MutableList.takeNVoid(discardFraction, 1.9)
    deepStrictEqual(MutableList.toArray(discardFraction), [2, 3])

    const snapshot = MutableList.make<number>()
    MutableList.appendAll(snapshot, [1, 2, 3])
    deepStrictEqual(MutableList.toArrayN(snapshot, Number.NaN), [])
    deepStrictEqual(MutableList.toArrayN(snapshot, 1.9), [1])
  })

  it("appendAll returns 0 and leaves an empty list empty", () => {
    const list = MutableList.make<number>()

    strictEqual(MutableList.appendAll(list, []), 0)
    strictEqual(list.length, 0)
    strictEqual(list.head, undefined)
    strictEqual(list.tail, undefined)
    strictEqual(MutableList.take(list), MutableList.Empty)
  })

  it("appendAll with empty iterables preserves later append order", () => {
    const list = MutableList.make<number>()

    MutableList.appendAll(list, [])
    MutableList.append(list, 1)
    MutableList.appendAll(list, [])
    MutableList.append(list, 2)

    deepStrictEqual(MutableList.takeAll(list), [1, 2])
    strictEqual(MutableList.take(list), MutableList.Empty)
  })

  it("appendAllUnsafe with an empty array is a no-op", () => {
    const list = MutableList.make<number>()

    MutableList.appendAll(list, [1])
    strictEqual(MutableList.appendAllUnsafe(list, []), 0)
    MutableList.append(list, 2)

    deepStrictEqual(MutableList.takeAll(list), [1, 2])
    strictEqual(MutableList.take(list), MutableList.Empty)
  })

  it("filter keeps matching values in place and updates length", () => {
    const list = MutableList.make<number>()
    MutableList.appendAll(list, [1, 2, 3, 4, 5])

    MutableList.filter(list, (n) => n % 2 === 0)

    deepStrictEqual(MutableList.toArrayN(list, 2), [2, 4])
    strictEqual(list.length, 2)
  })

  it("filter passes list indices to the predicate across offsets and buckets", () => {
    const list = MutableList.make<number>()
    MutableList.appendAll(list, [0, 1, 2])
    MutableList.appendAll(list, [3, 4])
    MutableList.take(list)
    const indices: Array<number> = []
    MutableList.filter(list, (_, i) => {
      indices.push(i)
      return i % 2 === 0
    })
    deepStrictEqual(indices, [0, 1, 2, 3])
    deepStrictEqual(MutableList.toArray(list), [1, 3])
  })

  it("filter restores the empty list state when no values match", () => {
    const list = MutableList.make<number>()
    MutableList.append(list, 1)

    MutableList.filter(list, () => false)

    strictEqual(list.length, 0)
    strictEqual(list.head, undefined)
    strictEqual(list.tail, undefined)
    strictEqual(MutableList.take(list), MutableList.Empty)
  })

  it("remove deletes all strictly equal values and updates length", () => {
    const list = MutableList.make<string>()
    MutableList.appendAll(list, ["apple", "banana", "apple", "cherry", "apple"])

    MutableList.remove(list, "apple")

    deepStrictEqual(MutableList.toArrayN(list, 2), ["banana", "cherry"])
    strictEqual(list.length, 2)
  })
})
