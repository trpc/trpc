import { assert } from "@effect/vitest"
import * as Equal from "effect/Equal"
import * as Hash from "effect/Hash"
import * as HashMap from "effect/HashMap"
import * as Option from "effect/Option"
import { describe, expect, it, vi } from "vitest"

class Key implements Equal.Equal, Hash.Hash {
  constructor(readonly group: string) {}

  [Equal.symbol](that: unknown) {
    return that instanceof Key && this.group === that.group
  }

  [Hash.symbol]() {
    return 0
  }
}

describe("Equal.equals", () => {
  it("does not cache an equality found through a provisional circular pair", () => {
    interface Child {
      parent?: Parent
    }

    class Parent implements Hash.Hash {
      constructor(readonly child: Child, readonly x: number, readonly y: number) {}

      [Hash.symbol](): number {
        return 0
      }
    }

    const p: Child = {}
    const q: Child = {}
    const a = new Parent(p, 1, 2)
    const b = new Parent(q, 2, 1)
    p.parent = a
    q.parent = b

    expect(Equal.equals(a, b)).toBe(false)
    expect(Equal.equals(p, q)).toBe(false)
  })

  describe("cyclic values", () => {
    class GraphNode implements Hash.Hash {
      v: number
      a: unknown = undefined
      b: unknown = undefined
      constructor(v: number) {
        this.v = v
      }
      [Hash.symbol](): number {
        return 0
      }
    }

    type Spec = ReadonlyArray<{ readonly v: number; readonly a: number; readonly b: number }>

    const graph = (spec: Spec): Array<GraphNode> => {
      const nodes = spec.map(({ v }) => new GraphNode(v))
      spec.forEach(({ a, b }, i) => {
        nodes[i].a = nodes[a]
        nodes[i].b = nodes[b]
      })
      return nodes
    }

    it("does not let an earlier comparison change a later result", () => {
      const [, n2] = graph([{ v: 1, a: 1, b: 0 }, { v: 1, a: 0, b: 0 }])
      const [m0, m1] = graph([{ v: 1, a: 1, b: 1 }, { v: 1, a: 1, b: 0 }])
      Equal.equals(n2, m1)
      assert.isTrue(Equal.equals({ w: n2, k: 1 }, { w: m0, k: 1 }))
    })

    it("assumes cycles equal pair by pair", () => {
      const [loop] = graph([{ v: 0, a: 0, b: 0 }])
      const [, entry] = graph([{ v: 0, a: 0, b: 0 }, { v: 0, a: 0, b: 0 }])
      assert.isTrue(Equal.equals(loop, entry))
      const [, p1] = graph([{ v: 1, a: 0, b: 0 }, { v: 0, a: 0, b: 0 }])
      const [, q1] = graph([{ v: 1, a: 1, b: 0 }, { v: 0, a: 0, b: 0 }])
      assert.isFalse(Equal.equals(p1, q1))
    })

    it("agrees with bisimilarity on random cyclic graphs", () => {
      // Compute the greatest bisimulation by eliminating invalid pairs.
      const bisimilar = (left: Spec, right: Spec): ReadonlyArray<ReadonlyArray<boolean>> => {
        const related = left.map((l) => right.map((r) => l.v === r.v))
        let changed = true
        while (changed) {
          changed = false
          left.forEach((l, i) =>
            right.forEach((r, j) => {
              if (related[i][j] && !(related[l.a][r.a] && related[l.b][r.b])) {
                related[i][j] = false
                changed = true
              }
            })
          )
        }
        return related
      }
      let seed = 1
      const random = (n: number): number => {
        seed = (Math.imul(seed, 1103515245) + 12345) >>> 0
        return (seed >>> 16) % n
      }
      const randomSpec = (): Spec => {
        const size = 1 + random(4)
        return Array.from({ length: size }, () => ({ v: random(2), a: random(size), b: random(size) }))
      }
      const disagreements: Array<string> = []
      for (let run = 0; run < 500; run++) {
        const left = randomSpec()
        const right = randomSpec()
        const expected = bisimilar(left, right)
        for (let x = 0; x < left.length; x++) {
          for (let y = 0; y < right.length; y++) {
            if (Equal.equals(graph(left)[x], graph(right)[y]) !== expected[x][y]) {
              disagreements.push(`${JSON.stringify(left)}[${x}] vs ${JSON.stringify(right)}[${y}]`)
            }
          }
        }
      }
      assert.deepStrictEqual(disagreements, [])
    })
  })

  describe("plain objects", () => {
    it("should return true for structurally identical objects (structural equality)", () => {
      const obj1 = { a: 1, b: 2 }
      const obj2 = { a: 1, b: 2 }
      expect(Equal.equals(obj1, obj2)).toBe(true)
    })

    it("should return true for same reference", () => {
      const obj = { a: 1, b: 2 }
      expect(Equal.equals(obj, obj)).toBe(true)
    })

    it("should return true for empty objects", () => {
      expect(Equal.equals({}, {})).toBe(true)
    })

    it("should return false for objects with different values", () => {
      const obj1 = { a: 1, b: 2 }
      const obj2 = { a: 1, b: 3 }
      expect(Equal.equals(obj1, obj2)).toBe(false)
    })

    it("should return false for objects with different keys", () => {
      const obj1 = { a: 1, b: 2 }
      const obj2 = { a: 1, c: 2 }
      expect(Equal.equals(obj1, obj2)).toBe(false)
    })

    describe("symbol properties", () => {
      it("should return true for objects with identical symbol keys and values", () => {
        const sym1 = Symbol("test")
        const sym2 = Symbol("other")
        const obj1 = { [sym1]: 1, [sym2]: 2 }
        const obj2 = { [sym1]: 1, [sym2]: 2 }
        expect(Equal.equals(obj1, obj2)).toBe(true)
      })

      it("should return false for objects with different symbol keys", () => {
        const sym1 = Symbol("test")
        const sym2 = Symbol("test") // Different symbol with same description
        const obj1 = { [sym1]: 1 }
        const obj2 = { [sym2]: 1 }
        expect(Equal.equals(obj1, obj2)).toBe(false)
      })

      it("should return false for objects with different symbol values", () => {
        const sym = Symbol("test")
        const obj1 = { [sym]: 1 }
        const obj2 = { [sym]: 2 }
        expect(Equal.equals(obj1, obj2)).toBe(false)
      })

      it("should return true for objects with mixed string and symbol keys", () => {
        const sym = Symbol("test")
        const obj1 = { a: 1, [sym]: 2 }
        const obj2 = { a: 1, [sym]: 2 }
        expect(Equal.equals(obj1, obj2)).toBe(true)
      })

      it("should return false when one object has symbol keys and the other doesn't", () => {
        const sym = Symbol("test")
        const obj1 = { a: 1, [sym]: 2 }
        const obj2 = { a: 1 }
        expect(Equal.equals(obj1, obj2)).toBe(false)
      })

      it("should consider non-enumerable symbol properties", () => {
        const sym1 = Symbol("enumerable")
        const sym2 = Symbol("non-enumerable")
        const obj1: any = { a: 1 }
        const obj2: any = { a: 1 }

        // Add enumerable symbol property
        obj1[sym1] = "visible"
        obj2[sym1] = "visible"

        // Add non-enumerable symbol property with same value
        Object.defineProperty(obj1, sym2, { value: "hidden", enumerable: false })
        Object.defineProperty(obj2, sym2, { value: "hidden", enumerable: false })

        expect(Equal.equals(obj1, obj2)).toBe(true)
      })

      it("should consider non-enumerable symbol properties even when they differ", () => {
        const sym1 = Symbol("enumerable")
        const sym2 = Symbol("non-enumerable")
        const obj1: any = { a: 1 }
        const obj2: any = { a: 1 }

        // Add same enumerable symbol property
        obj1[sym1] = "visible"
        obj2[sym1] = "visible"

        // Add non-enumerable symbol properties with different values
        Object.defineProperty(obj1, sym2, { value: "hidden1", enumerable: false })
        Object.defineProperty(obj2, sym2, { value: "hidden2", enumerable: false })

        expect(Equal.equals(obj1, obj2)).toBe(false)
      })

      it("should consider enumerable symbol properties even when string properties are the same", () => {
        const sym = Symbol("test")
        const obj1: any = { a: 1, b: 2 }
        const obj2: any = { a: 1, b: 2 }

        obj1[sym] = "different"
        obj2[sym] = "values"

        expect(Equal.equals(obj1, obj2)).toBe(false)
      })
    })

    describe("non-enumerable properties", () => {
      it("should handle non-enumerable string properties correctly", () => {
        const obj1 = { a: 1 }
        const obj2 = { a: 1 }

        Object.defineProperty(obj1, "hidden", { value: "secret", enumerable: false })
        Object.defineProperty(obj2, "hidden", { value: "secret", enumerable: false })

        expect(Equal.equals(obj1, obj2)).toBe(true)
      })

      it("should consider non-enumerable string properties even when they differ", () => {
        const obj1 = { a: 1 }
        const obj2 = { a: 1 }

        Object.defineProperty(obj1, "hidden", { value: "secret1", enumerable: false })
        Object.defineProperty(obj2, "hidden", { value: "secret2", enumerable: false })

        expect(Equal.equals(obj1, obj2)).toBe(false)
      })

      it("should consider enumerable properties and non-enumerable ones", () => {
        const obj1: any = { a: 1 }
        const obj2: any = { a: 1 }

        // Add same enumerable property
        obj1.b = 2
        obj2.b = 2

        // Add different non-enumerable properties (should be considered)
        Object.defineProperty(obj1, "hidden", { value: "secret1", enumerable: false })
        Object.defineProperty(obj2, "hidden", { value: "secret2", enumerable: false })

        expect(Equal.equals(obj1, obj2)).toBe(false)
      })
    })

    describe("hash consistency with symbol properties", () => {
      it("should produce same hash for objects with identical symbol keys and values", () => {
        const sym1 = Symbol("test")
        const sym2 = Symbol("other")
        const obj1 = { [sym1]: 1, [sym2]: 2 }
        const obj2 = { [sym1]: 1, [sym2]: 2 }

        expect(Hash.hash(obj1)).toBe(Hash.hash(obj2))
        expect(Equal.equals(obj1, obj2)).toBe(true)
      })

      it("should return false for equality even if symbols have same hash", () => {
        const sym1 = Symbol("test")
        const sym2 = Symbol("test") // Different symbol with same description
        const obj1 = { [sym1]: 1 }
        const obj2 = { [sym2]: 1 }

        // Note: symbols with same description may have same hash (acceptable hash collision)
        // but equality should still work correctly
        expect(Equal.equals(obj1, obj2)).toBe(false)
      })

      it("should produce different hash for symbols with different descriptions", () => {
        const sym1 = Symbol("first")
        const sym2 = Symbol("second")
        const obj1 = { [sym1]: 1 }
        const obj2 = { [sym2]: 1 }

        expect(Hash.hash(obj1)).not.toBe(Hash.hash(obj2))
        expect(Equal.equals(obj1, obj2)).toBe(false)
      })

      it("should produce different hash for objects with different symbol values", () => {
        const sym = Symbol("test")
        const obj1 = { [sym]: 1 }
        const obj2 = { [sym]: 2 }

        expect(Hash.hash(obj1)).not.toBe(Hash.hash(obj2))
        expect(Equal.equals(obj1, obj2)).toBe(false)
      })

      it("should produce same hash for objects with mixed string and symbol keys", () => {
        const sym = Symbol("test")
        const obj1 = { a: 1, [sym]: 2 }
        const obj2 = { a: 1, [sym]: 2 }

        expect(Hash.hash(obj1)).toBe(Hash.hash(obj2))
        expect(Equal.equals(obj1, obj2)).toBe(true)
      })

      it("should consider non-enumerable symbol properties in hash calculation", () => {
        const sym1 = Symbol("enumerable")
        const sym2 = Symbol("non-enumerable")
        const obj1: any = { a: 1 }
        const obj2: any = { a: 1 }

        // Add same enumerable symbol property
        obj1[sym1] = "visible"
        obj2[sym1] = "visible"

        // Add different non-enumerable symbol properties
        Object.defineProperty(obj1, sym2, { value: "hidden1", enumerable: false })
        Object.defineProperty(obj2, sym2, { value: "hidden2", enumerable: false })

        expect(Hash.hash(obj1)).not.toBe(Hash.hash(obj2))
        expect(Equal.equals(obj1, obj2)).toBe(false)
      })
    })
  })

  describe("plain arrays", () => {
    it("should return true for structurally identical arrays (structural equality)", () => {
      const arr1 = [1, 2, 3]
      const arr2 = [1, 2, 3]
      expect(Equal.equals(arr1, arr2)).toBe(true)
    })

    it("should return true for same reference", () => {
      const arr = [1, 2, 3]
      expect(Equal.equals(arr, arr)).toBe(true)
    })

    it("should return true for empty arrays", () => {
      expect(Equal.equals([], [])).toBe(true)
    })

    it("should return false for arrays with different elements", () => {
      const arr1 = [1, 2, 3]
      const arr2 = [1, 2, 4]
      expect(Equal.equals(arr1, arr2)).toBe(false)
    })

    it("should return false for arrays with different lengths", () => {
      const arr1 = [1, 2, 3]
      const arr2 = [1, 2]
      expect(Equal.equals(arr1, arr2)).toBe(false)
    })
  })

  describe("primitives", () => {
    it("should work correctly for numbers", () => {
      expect(Equal.equals(42, 42)).toBe(true)
      expect(Equal.equals(42, 43)).toBe(false)
    })

    it("should work correctly for strings", () => {
      expect(Equal.equals("hello", "hello")).toBe(true)
      expect(Equal.equals("hello", "world")).toBe(false)
    })

    it("should work correctly for booleans", () => {
      expect(Equal.equals(true, true)).toBe(true)
      expect(Equal.equals(false, false)).toBe(true)
      expect(Equal.equals(true, false)).toBe(false)
    })

    it("should work correctly for null and undefined", () => {
      expect(Equal.equals(null, null)).toBe(true)
      expect(Equal.equals(undefined, undefined)).toBe(true)
      expect(Equal.equals(null, undefined)).toBe(false)
    })
  })

  describe("Date objects", () => {
    it("should compare dates by ISO string", () => {
      const date1 = new Date("2023-01-01T00:00:00.000Z")
      const date2 = new Date("2023-01-01T00:00:00.000Z")
      expect(Equal.equals(date1, date2)).toBe(true)
    })

    it("should return false for different dates", () => {
      const date1 = new Date("2023-01-01T00:00:00.000Z")
      const date2 = new Date("2023-01-02T00:00:00.000Z")
      expect(Equal.equals(date1, date2)).toBe(false)
    })

    it("should compare invalid dates without throwing", () => {
      expect(Equal.equals(new Date(NaN), new Date(NaN))).toBe(true)
    })
  })

  describe("DataView objects", () => {
    it("should compare viewed bytes", () => {
      const self = new DataView(Uint8Array.of(1).buffer)
      const that = new DataView(Uint8Array.of(2).buffer)
      expect(Equal.equals(self, that)).toBe(false)
    })
  })

  describe("Effect data structures", () => {
    it("should work with HashMap (implements Equal interface)", () => {
      const map1 = HashMap.make(["a", 1], ["b", 2])
      const map2 = HashMap.make(["a", 1], ["b", 2])
      expect(Equal.equals(map1, map2)).toBe(true)
    })

    it("should work with Option (implements Equal interface)", () => {
      const opt1 = Option.some(42)
      const opt2 = Option.some(42)
      expect(Equal.equals(opt1, opt2)).toBe(true)
    })

    it("HashMap should not equal plain objects", () => {
      const map = HashMap.make(["a", 1], ["b", 2])
      const obj = { a: 1, b: 2 }
      expect(Equal.equals(map, obj)).toBe(false)
    })
  })

  describe("custom Equal implementations", () => {
    class CustomPoint implements Equal.Equal {
      constructor(readonly x: number, readonly y: number) {}

      [Equal.symbol](that: Equal.Equal): boolean {
        return that instanceof CustomPoint &&
          this.x === that.x &&
          this.y === that.y
      }

      [Hash.symbol](): number {
        return 0
      }
    }

    it("should work with custom Equal implementation", () => {
      const point1 = new CustomPoint(1, 2)
      const point2 = new CustomPoint(1, 2)
      expect(Equal.equals(point1, point2)).toBe(true)
    })

    it("clears visited state when a custom Equal throws", () => {
      let throws = true
      class Flaky implements Equal.Equal {
        constructor(readonly id: number) {}

        [Equal.symbol](that: Equal.Equal): boolean {
          if (throws) throw new Error("boom")
          return that instanceof Flaky && this.id === that.id
        }

        [Hash.symbol](): number {
          return 0
        }
      }

      const x = { k: new Flaky(1) }
      const y = { k: new Flaky(2) }
      assert.throws(() => Equal.equals(x, y))
      throws = false
      assert.isFalse(Equal.equals(x, y))
      assert.isTrue(Equal.equals(x, { k: new Flaky(1) }))
    })
  })

  describe("nested structures", () => {
    it("should return true for nested objects (deep structural equality)", () => {
      const obj1 = { a: { b: 1 }, c: [1, 2] }
      const obj2 = { a: { b: 1 }, c: [1, 2] }
      expect(Equal.equals(obj1, obj2)).toBe(true)
    })

    it("should return true for nested arrays (deep structural equality)", () => {
      const arr1 = [[1, 2], [3, 4]]
      const arr2 = [[1, 2], [3, 4]]
      expect(Equal.equals(arr1, arr2)).toBe(true)
    })

    it("should return false for nested objects with different values", () => {
      const obj1 = { a: { b: 1 }, c: [1, 2] }
      const obj2 = { a: { b: 2 }, c: [1, 2] }
      expect(Equal.equals(obj1, obj2)).toBe(false)
    })

    it("should return false for nested arrays with different values", () => {
      const arr1 = [[1, 2], [3, 4]]
      const arr2 = [[1, 3], [3, 4]]
      expect(Equal.equals(arr1, arr2)).toBe(false)
    })
  })

  describe("special values", () => {
    describe("NaN", () => {
      it("should handle NaN correctly (structural equality - NaN equals NaN)", () => {
        expect(Equal.equals(NaN, NaN)).toBe(true)
      })

      it("should return false when comparing NaN with regular numbers", () => {
        expect(Equal.equals(NaN, 0)).toBe(false)
        expect(Equal.equals(NaN, 42)).toBe(false)
        expect(Equal.equals(42, NaN)).toBe(false)
      })

      it("should return false when comparing NaN with Infinity", () => {
        expect(Equal.equals(NaN, Infinity)).toBe(false)
        expect(Equal.equals(NaN, -Infinity)).toBe(false)
        expect(Equal.equals(Infinity, NaN)).toBe(false)
        expect(Equal.equals(-Infinity, NaN)).toBe(false)
      })

      it("should handle NaN in arrays", () => {
        expect(Equal.equals([NaN], [NaN])).toBe(true)
        expect(Equal.equals([NaN, 1], [NaN, 1])).toBe(true)
        expect(Equal.equals([NaN, 1], [NaN, 2])).toBe(false)
        expect(Equal.equals([NaN], [Infinity])).toBe(false)
      })

      it("should handle NaN in objects", () => {
        expect(Equal.equals({ a: NaN }, { a: NaN })).toBe(true)
        expect(Equal.equals({ a: NaN, b: 1 }, { a: NaN, b: 1 })).toBe(true)
        expect(Equal.equals({ a: NaN }, { a: Infinity })).toBe(false)
        expect(Equal.equals({ a: NaN }, { a: 42 })).toBe(false)
      })

      it("should handle NaN in nested structures", () => {
        expect(Equal.equals({ arr: [NaN] }, { arr: [NaN] })).toBe(true)
        expect(Equal.equals([{ val: NaN }], [{ val: NaN }])).toBe(true)
        expect(Equal.equals({ nested: { deep: NaN } }, { nested: { deep: NaN } })).toBe(true)
        expect(Equal.equals({ arr: [NaN] }, { arr: [Infinity] })).toBe(false)
      })
    })

    describe("Infinity", () => {
      it("should handle Infinity correctly (structural equality)", () => {
        expect(Equal.equals(Infinity, Infinity)).toBe(true)
      })

      it("should return false when comparing Infinity with regular numbers", () => {
        expect(Equal.equals(Infinity, 0)).toBe(false)
        expect(Equal.equals(Infinity, 42)).toBe(false)
        expect(Equal.equals(42, Infinity)).toBe(false)
        expect(Equal.equals(Infinity, Number.MAX_VALUE)).toBe(false)
      })

      it("should return false when comparing Infinity with -Infinity", () => {
        expect(Equal.equals(Infinity, -Infinity)).toBe(false)
        expect(Equal.equals(-Infinity, Infinity)).toBe(false)
      })

      it("should handle Infinity in arrays", () => {
        expect(Equal.equals([Infinity], [Infinity])).toBe(true)
        expect(Equal.equals([Infinity, 1], [Infinity, 1])).toBe(true)
        expect(Equal.equals([Infinity, 1], [Infinity, 2])).toBe(false)
        expect(Equal.equals([Infinity], [-Infinity])).toBe(false)
      })

      it("should handle Infinity in objects", () => {
        expect(Equal.equals({ a: Infinity }, { a: Infinity })).toBe(true)
        expect(Equal.equals({ a: Infinity, b: 1 }, { a: Infinity, b: 1 })).toBe(true)
        expect(Equal.equals({ a: Infinity }, { a: -Infinity })).toBe(false)
        expect(Equal.equals({ a: Infinity }, { a: 42 })).toBe(false)
      })

      it("should handle Infinity in nested structures", () => {
        expect(Equal.equals({ arr: [Infinity] }, { arr: [Infinity] })).toBe(true)
        expect(Equal.equals([{ val: Infinity }], [{ val: Infinity }])).toBe(true)
        expect(Equal.equals({ nested: { deep: Infinity } }, { nested: { deep: Infinity } })).toBe(true)
        expect(Equal.equals({ arr: [Infinity] }, { arr: [-Infinity] })).toBe(false)
      })
    })

    describe("-Infinity", () => {
      it("should handle -Infinity correctly (structural equality)", () => {
        expect(Equal.equals(-Infinity, -Infinity)).toBe(true)
      })

      it("should return false when comparing -Infinity with regular numbers", () => {
        expect(Equal.equals(-Infinity, 0)).toBe(false)
        expect(Equal.equals(-Infinity, -42)).toBe(false)
        expect(Equal.equals(-42, -Infinity)).toBe(false)
        expect(Equal.equals(-Infinity, Number.MIN_VALUE)).toBe(false)
      })

      it("should handle -Infinity in arrays", () => {
        expect(Equal.equals([-Infinity], [-Infinity])).toBe(true)
        expect(Equal.equals([-Infinity, 1], [-Infinity, 1])).toBe(true)
        expect(Equal.equals([-Infinity, 1], [-Infinity, 2])).toBe(false)
        expect(Equal.equals([-Infinity], [Infinity])).toBe(false)
      })

      it("should handle -Infinity in objects", () => {
        expect(Equal.equals({ a: -Infinity }, { a: -Infinity })).toBe(true)
        expect(Equal.equals({ a: -Infinity, b: 1 }, { a: -Infinity, b: 1 })).toBe(true)
        expect(Equal.equals({ a: -Infinity }, { a: Infinity })).toBe(false)
        expect(Equal.equals({ a: -Infinity }, { a: -42 })).toBe(false)
      })

      it("should handle -Infinity in nested structures", () => {
        expect(Equal.equals({ arr: [-Infinity] }, { arr: [-Infinity] })).toBe(true)
        expect(Equal.equals([{ val: -Infinity }], [{ val: -Infinity }])).toBe(true)
        expect(Equal.equals({ nested: { deep: -Infinity } }, { nested: { deep: -Infinity } })).toBe(true)
        expect(Equal.equals({ arr: [-Infinity] }, { arr: [Infinity] })).toBe(false)
      })
    })

    describe("mixed special values", () => {
      it("should handle arrays with multiple special values", () => {
        expect(Equal.equals([NaN, Infinity, -Infinity], [NaN, Infinity, -Infinity])).toBe(true)
        expect(Equal.equals([NaN, Infinity], [Infinity, NaN])).toBe(false) // order matters
        expect(Equal.equals([NaN, Infinity, 0], [NaN, Infinity, 0])).toBe(true)
      })

      it("should handle objects with multiple special values", () => {
        expect(Equal.equals(
          { nan: NaN, inf: Infinity, negInf: -Infinity },
          { nan: NaN, inf: Infinity, negInf: -Infinity }
        )).toBe(true)
        expect(Equal.equals(
          { nan: NaN, inf: Infinity },
          { nan: NaN, inf: -Infinity }
        )).toBe(false)
      })

      it("should handle complex nested structures with special values", () => {
        const obj1 = {
          data: [
            { value: NaN, meta: { type: "special" } },
            { value: Infinity, meta: { type: "infinite" } },
            { value: -Infinity, meta: { type: "negative-infinite" } }
          ]
        }
        const obj2 = {
          data: [
            { value: NaN, meta: { type: "special" } },
            { value: Infinity, meta: { type: "infinite" } },
            { value: -Infinity, meta: { type: "negative-infinite" } }
          ]
        }
        const obj3 = {
          data: [
            { value: NaN, meta: { type: "special" } },
            { value: -Infinity, meta: { type: "infinite" } }, // swapped values
            { value: Infinity, meta: { type: "negative-infinite" } }
          ]
        }

        expect(Equal.equals(obj1, obj2)).toBe(true)
        expect(Equal.equals(obj1, obj3)).toBe(false)
      })
    })

    describe("zero values", () => {
      it("should handle -0 and +0 correctly", () => {
        expect(Equal.equals(-0, +0)).toBe(true)
        expect(Equal.equals(0, -0)).toBe(true)
        expect(Equal.equals(+0, -0)).toBe(true)
      })

      it("should handle zero values in arrays", () => {
        expect(Equal.equals([-0], [+0])).toBe(true)
        expect(Equal.equals([0], [-0])).toBe(true)
        expect(Equal.equals([-0, 1], [+0, 1])).toBe(true)
      })

      it("should handle zero values in objects", () => {
        expect(Equal.equals({ a: -0 }, { a: +0 })).toBe(true)
        expect(Equal.equals({ a: 0 }, { a: -0 })).toBe(true)
      })
    })
  })

  describe("JavaScript Map", () => {
    it("should return true for structurally identical maps", () => {
      const map1 = new Map([["a", 1], ["b", 2]])
      const map2 = new Map([["a", 1], ["b", 2]])
      const map3 = new Map([["b", 2], ["a", 1]])
      expect(Equal.equals(map1, map2)).toBe(true)
      expect(Equal.equals(map1, map3)).toBe(true)
    })

    it("should return true for same reference", () => {
      const map = new Map([["a", 1]])
      expect(Equal.equals(map, map)).toBe(true)
    })

    it("should return true for empty maps", () => {
      expect(Equal.equals(new Map(), new Map())).toBe(true)
    })

    it("should return false for maps with different values", () => {
      const map1 = new Map([["a", 1], ["b", 2]])
      const map2 = new Map([["a", 1], ["b", 3]])
      expect(Equal.equals(map1, map2)).toBe(false)
    })

    it("should return false for maps with different keys", () => {
      const map1 = new Map([["a", 1], ["b", 2]])
      const map2 = new Map([["a", 1], ["c", 2]])
      expect(Equal.equals(map1, map2)).toBe(false)
    })

    it("should return false for maps with different sizes", () => {
      const map1 = new Map([["a", 1], ["b", 2]])
      const map2 = new Map([["a", 1]])
      expect(Equal.equals(map1, map2)).toBe(false)
    })

    it("should handle maps with object keys", () => {
      const key1 = { id: 1 }
      const key2 = { id: 1 }
      const map1 = new Map()
      map1.set(key1, "value1")
      map1.set({ nested: { x: 1 } }, "value2")

      const map2 = new Map()
      map2.set(key2, "value1")
      map2.set({ nested: { x: 1 } }, "value2")

      expect(Equal.equals(map1, map2)).toBe(true)
    })

    it("should handle maps with object values", () => {
      const map1 = new Map([["a", { x: 1 }], ["b", { y: [1, 2] }]])
      const map2 = new Map([["a", { x: 1 }], ["b", { y: [1, 2] }]])
      expect(Equal.equals(map1, map2)).toBe(true)
    })

    it("should handle nested maps", () => {
      const inner1 = new Map([["x", 1]])
      const inner2 = new Map([["x", 1]])
      const map1 = new Map([["nested", inner1]])
      const map2 = new Map([["nested", inner2]])
      expect(Equal.equals(map1, map2)).toBe(true)
    })

    it("should handle maps with special values", () => {
      const map1 = new Map([[NaN, "nan"], [Infinity, "inf"], [-Infinity, "neginf"]])
      const map2 = new Map([[NaN, "nan"], [Infinity, "inf"], [-Infinity, "neginf"]])
      expect(Equal.equals(map1, map2)).toBe(true)
    })
  })

  describe("JavaScript Set", () => {
    it("should return true for structurally identical sets", () => {
      const set1 = new Set([1, 2, 3])
      const set2 = new Set([1, 2, 3])
      expect(Equal.equals(set1, set2)).toBe(true)
    })

    it("should return true for same reference", () => {
      const set = new Set([1, 2, 3])
      expect(Equal.equals(set, set)).toBe(true)
    })

    it("should return true for empty sets", () => {
      expect(Equal.equals(new Set(), new Set())).toBe(true)
    })

    it("should return false for sets with different elements", () => {
      const set1 = new Set([1, 2, 3])
      const set2 = new Set([1, 2, 4])
      expect(Equal.equals(set1, set2)).toBe(false)
    })

    it("should return false for sets with different sizes", () => {
      const set1 = new Set([1, 2, 3])
      const set2 = new Set([1, 2])
      expect(Equal.equals(set1, set2)).toBe(false)
    })

    it("should return true for sets with same elements in different insertion order", () => {
      const set1 = new Set([1, 2, 3])
      const set2 = new Set([3, 1, 2])
      expect(Equal.equals(set1, set2)).toBe(true)
    })

    it("should handle sets with object elements", () => {
      const set1 = new Set([{ x: 1 }, { y: 2 }])
      const set2 = new Set([{ x: 1 }, { y: 2 }])
      expect(Equal.equals(set1, set2)).toBe(true)
    })

    it("should handle nested sets", () => {
      const inner1 = new Set([1, 2])
      const inner2 = new Set([1, 2])
      const set1 = new Set([inner1, "other"])
      const set2 = new Set([inner2, "other"])
      expect(Equal.equals(set1, set2)).toBe(true)
    })

    it("should handle sets with special values", () => {
      const set1 = new Set([NaN, Infinity, -Infinity])
      const set2 = new Set([NaN, Infinity, -Infinity])
      expect(Equal.equals(set1, set2)).toBe(true)
    })

    it("should handle sets with array elements", () => {
      const set1 = new Set([[1, 2], [3, 4]])
      const set2 = new Set([[1, 2], [3, 4]])
      expect(Equal.equals(set1, set2)).toBe(true)
    })
  })

  describe("Map and Set mixed", () => {
    it("matches Map and Set entries one-to-one", () => {
      const setResult = Equal.equals(
        new Set([new Key("x"), new Key("x")]),
        new Set([new Key("x"), new Key("y")])
      )
      const mapResult = Equal.equals(
        new Map([[new Key("x"), 1], [new Key("x"), 1]]),
        new Map([[new Key("x"), 1], [new Key("y"), 1]])
      )

      assert.deepStrictEqual([setResult, mapResult], [false, false])
    })

    it("matches colliding Map and Set entries independent of insertion order", () => {
      expect(Equal.equals(
        new Set([new Key("x"), new Key("y")]),
        new Set([new Key("y"), new Key("x")])
      )).toBe(true)
      expect(Equal.equals(
        new Map([[new Key("x"), 1], [new Key("y"), 2]]),
        new Map([[new Key("y"), 2], [new Key("x"), 1]])
      )).toBe(true)
    })

    it("matches cyclic values in colliding Map entries", () => {
      const left: { self?: unknown } = {}
      const right: { self?: unknown } = {}
      left.self = left
      right.self = right

      expect(Equal.equals(
        new Map<Key, unknown>([[new Key("x"), left], [new Key("y"), 1]]),
        new Map<Key, unknown>([[new Key("y"), 1], [new Key("x"), right]])
      )).toBe(true)
    })

    it("should handle objects containing maps and sets", () => {
      const obj1 = {
        map: new Map([["a", 1], ["b", 2]]),
        set: new Set([1, 2, 3]),
        array: [new Map([["x", 1]]), new Set([4, 5])]
      }
      const obj2 = {
        map: new Map([["a", 1], ["b", 2]]),
        set: new Set([1, 2, 3]),
        array: [new Map([["x", 1]]), new Set([4, 5])]
      }
      expect(Equal.equals(obj1, obj2)).toBe(true)
    })

    it("should return false when Map/Set differ in nested structures", () => {
      const obj1 = {
        map: new Map([["a", 1], ["b", 2]]),
        set: new Set([1, 2, 3])
      }
      const obj2 = {
        map: new Map([["a", 1], ["b", 3]]), // different value
        set: new Set([1, 2, 3])
      }
      expect(Equal.equals(obj1, obj2)).toBe(false)
    })
  })

  describe("byReference", () => {
    it("should allow objects to opt out of structural equality", () => {
      const obj1 = { a: 1, b: 2 }
      const obj2 = { a: 1, b: 2 }

      // Normal structural equality
      expect(Equal.equals(obj1, obj2)).toBe(true)

      // Create instance equality version of obj1
      const obj1Instance = Equal.byReference(obj1)
      expect(Equal.equals(obj1Instance, obj2)).toBe(false)
      expect(Equal.equals(obj1Instance, obj1Instance)).toBe(true)
    })

    it("should work with arrays", () => {
      const arr1 = [1, 2, 3]
      const arr2 = [1, 2, 3]

      // Normal structural equality
      expect(Equal.equals(arr1, arr2)).toBe(true)

      // Create instance equality version of arr1
      const arr1Instance = Equal.byReference(arr1)
      expect(Equal.equals(arr1Instance, arr2)).toBe(false)
      expect(Equal.equals(arr1Instance, arr1Instance)).toBe(true)
    })

    it("should work with Maps", () => {
      const map1 = new Map([["a", 1]])
      const map2 = new Map([["a", 1]])

      // Normal structural equality
      expect(Equal.equals(map1, map2)).toBe(true)

      // Create instance equality version of map1
      const map1Instance = Equal.byReference(map1)
      expect(Equal.equals(map1Instance, map2)).toBe(false)
      expect(Equal.equals(map1Instance, map1Instance)).toBe(true)
    })

    it("should work with Sets", () => {
      const set1 = new Set([1, 2])
      const set2 = new Set([1, 2])

      // Normal structural equality
      expect(Equal.equals(set1, set2)).toBe(true)

      // Create instance equality version of set1
      const set1Instance = Equal.byReference(set1)
      expect(Equal.equals(set1Instance, set2)).toBe(false)
      expect(Equal.equals(set1Instance, set1Instance)).toBe(true)
    })

    it("should return a proxy that behaves like the original object", () => {
      const obj = { a: 1 }
      const result = Equal.byReference(obj)

      // The result should not be the same reference (it's a proxy)
      expect(result).not.toBe(obj)

      // But it should behave the same way
      expect(result.a).toBe(1)

      // And should support property access
      expect(result.a).toBe(obj.a)
    })

    it("should work when either object is marked for instance equality", () => {
      const obj1 = { a: 1, b: 2 }
      const obj2 = { a: 1, b: 2 }

      // Create instance equality version of obj2
      const obj2Instance = Equal.byReference(obj2)
      expect(Equal.equals(obj1, obj2Instance)).toBe(false)
      expect(Equal.equals(obj2Instance, obj1)).toBe(false)
    })

    it("should work with nested structures", () => {
      const obj1 = { a: { b: 1 }, c: [1, 2] }
      const obj2 = { a: { b: 1 }, c: [1, 2] }

      // Normal structural equality
      expect(Equal.equals(obj1, obj2)).toBe(true)

      // Create instance equality version of obj1
      const obj1Instance = Equal.byReference(obj1)
      expect(Equal.equals(obj1Instance, obj2)).toBe(false)
    })
  })

  describe("byReferenceUnsafe", () => {
    it("uses reference hashing after a structural hash was cached", () => {
      const obj = { value: 1 }
      const structuralHash = Hash.structure(obj)
      assert.notStrictEqual(structuralHash, 0)
      assert.strictEqual(Hash.hash(obj), structuralHash)

      const random = vi.spyOn(Math, "random").mockReturnValue(0)
      try {
        Equal.byReferenceUnsafe(obj)
        assert.strictEqual(Hash.hash(obj), 0)
      } finally {
        random.mockRestore()
      }
    })

    it("should allow objects to opt out of structural equality without proxy", () => {
      const obj1 = { a: 1, b: 2 }
      const obj2 = { a: 1, b: 2 }

      // Mark obj1 for reference equality (modifies obj1 directly)
      const obj1ByRef = Equal.byReferenceUnsafe(obj1)
      expect(obj1ByRef).toBe(obj1) // Same object, no proxy created
      expect(Equal.equals(obj1ByRef, obj2)).toBe(false) // uses reference equality
      expect(Equal.equals(obj1ByRef, obj1ByRef)).toBe(true) // same reference

      // The original obj1 now uses reference equality
      expect(Equal.equals(obj1, obj2)).toBe(false) // obj1 uses reference equality
    })

    it("should work with arrays", () => {
      const arr1 = [1, 2, 3]
      const arr2 = [1, 2, 3]

      // Mark arr1 for reference equality
      const arr1ByRef = Equal.byReferenceUnsafe(arr1)
      expect(arr1ByRef).toBe(arr1) // Same array, no proxy
      expect(Equal.equals(arr1ByRef, arr2)).toBe(false)
      expect(Equal.equals(arr1ByRef, arr1ByRef)).toBe(true)
    })

    it("should work with Maps", () => {
      const map1 = new Map([["a", 1]])
      const map2 = new Map([["a", 1]])

      // Mark map1 for reference equality
      const map1ByRef = Equal.byReferenceUnsafe(map1)
      expect(map1ByRef).toBe(map1) // Same map, no proxy
      expect(Equal.equals(map1ByRef, map2)).toBe(false)
      expect(Equal.equals(map1ByRef, map1ByRef)).toBe(true)
    })

    it("should work with Sets", () => {
      const set1 = new Set([1, 2])
      const set2 = new Set([1, 2])

      // Mark set1 for reference equality
      const set1ByRef = Equal.byReferenceUnsafe(set1)
      expect(set1ByRef).toBe(set1) // Same set, no proxy
      expect(Equal.equals(set1ByRef, set2)).toBe(false)
      expect(Equal.equals(set1ByRef, set1ByRef)).toBe(true)
    })

    it("should permanently change object equality behavior", () => {
      const obj1 = { a: 1, b: 2 }
      const obj2 = { a: 1, b: 2 }

      // Mark obj1 for reference equality
      Equal.byReferenceUnsafe(obj1)

      // Now obj1 permanently uses reference equality
      expect(Equal.equals(obj1, obj2)).toBe(false)
      expect(Equal.equals(obj1, obj1)).toBe(true)
    })

    it("should work when either object is marked for reference equality", () => {
      const obj1 = { a: 1, b: 2 }
      const obj2 = { a: 1, b: 2 }

      // Mark obj2 for reference equality
      Equal.byReferenceUnsafe(obj2)
      expect(Equal.equals(obj1, obj2)).toBe(false)
      expect(Equal.equals(obj2, obj1)).toBe(false)
    })

    it("should work with nested structures", () => {
      const obj1 = { a: { b: 1 }, c: [1, 2] }
      const obj2 = { a: { b: 1 }, c: [1, 2] }

      // Mark obj1 for reference equality
      Equal.byReferenceUnsafe(obj1)
      expect(Equal.equals(obj1, obj2)).toBe(false)
    })
  })

  describe("Error objects", () => {
    it("should return true for Error objects with same message and additional properties", () => {
      const error1 = new Error("test message")
      ;(error1 as any).code = "TEST_CODE"
      ;(error1 as any).details = { info: "additional details" }

      const error2 = new Error("test message")
      ;(error2 as any).code = "TEST_CODE"
      ;(error2 as any).details = { info: "additional details" }

      // Error objects are now structurally comparable (stack is excluded)
      expect(Equal.equals(error1, error2)).toBe(true)
    })

    it("should return false for Error objects with different messages", () => {
      const error1 = new Error("message 1")
      ;(error1 as any).code = "TEST_CODE"

      const error2 = new Error("message 2")
      ;(error2 as any).code = "TEST_CODE"

      expect(Equal.equals(error1, error2)).toBe(false)
    })

    it("should work with custom Error classes", () => {
      class CustomError extends Error {
        readonly code: string
        constructor(message: string, code: string) {
          super(message)
          this.name = "CustomError"
          this.code = code
        }
      }

      const error1 = new CustomError("test", "CUSTOM")
      const error2 = new CustomError("test", "CUSTOM")

      // Custom Error objects are now structurally comparable (stack is excluded)
      expect(Equal.equals(error1, error2)).toBe(true)
    })

    it("should ignore stack traces when comparing Error objects", () => {
      function createErrorAtDifferentLocation1() {
        return new Error("same message")
      }

      function createErrorAtDifferentLocation2() {
        return new Error("same message")
      }

      const error1 = createErrorAtDifferentLocation1()
      const error2 = createErrorAtDifferentLocation2()

      // Even though stack traces are different, errors should be equal
      expect(error1.stack).not.toBe(error2.stack)
      expect(Equal.equals(error1, error2)).toBe(true)
    })
  })

  describe("objects with different constructors", () => {
    it("should return true for objects with different constructors but same shape", () => {
      class CustomClass {
        readonly a: number
        readonly b: number
        constructor() {
          this.a = 1
          this.b = 2
        }
      }

      const plainObject = { a: 1, b: 2 }
      const customObject = new CustomClass()
      expect(Equal.equals(plainObject, customObject)).toBe(true)
    })

    it("should return true for objects with null prototype", () => {
      const nullProtoObject: any = Object.create(null)
      nullProtoObject.a = 1
      nullProtoObject.b = 2

      const plainObject = { a: 1, b: 2 }
      expect(Equal.equals(nullProtoObject, plainObject)).toBe(true)
    })

    it("should return true for objects with different function constructors", () => {
      function Constructor1(this: any) {
        this.a = 1
        this.b = 2
      }

      function Constructor2(this: any) {
        this.a = 1
        this.b = 2
      }

      const obj1 = new (Constructor1 as any)()
      const obj2 = new (Constructor2 as any)()
      expect(Equal.equals(obj1, obj2)).toBe(true)
    })

    it("should return false when properties differ regardless of constructor", () => {
      class CustomClass1 {
        readonly a: number
        readonly b: number
        constructor() {
          this.a = 1
          this.b = 2
        }
      }

      class CustomClass2 {
        readonly a: number
        readonly b: number
        constructor() {
          this.a = 1
          this.b = 3 // Different value
        }
      }

      const obj1 = new CustomClass1()
      const obj2 = new CustomClass2()
      expect(Equal.equals(obj1, obj2)).toBe(false)
    })

    it("should handle mixed constructor types in nested structures", () => {
      class CustomClass {
        readonly inner: { x: number }
        constructor() {
          this.inner = { x: 1 }
        }
      }

      const obj1 = { data: new CustomClass() }
      const obj2 = { data: { inner: { x: 1 } } }
      expect(Equal.equals(obj1, obj2)).toBe(true)
    })

    it("should include constructor property when it has a meaningful user-defined value", () => {
      const obj1 = { constructor: 10, a: 1 }
      const obj2 = { constructor: 10, a: 1 }
      const obj3 = { constructor: 20, a: 1 }

      // Objects with same constructor value should be equal
      expect(Equal.equals(obj1, obj2)).toBe(true)

      // Objects with different constructor values should not be equal
      expect(Equal.equals(obj1, obj3)).toBe(false)
      expect(Equal.equals(obj2, obj3)).toBe(false)
    })

    it("should include constructor property when it has a meaningful user-defined value from a prototype", () => {
      const obj1 = Object.setPrototypeOf({ a: 1 }, { constructor: 10 })
      const obj2 = Object.setPrototypeOf({ a: 1 }, { constructor: 10 })
      const obj3 = Object.setPrototypeOf({ a: 1 }, { constructor: 20 })

      // Objects with same constructor value should be equal
      expect(Equal.equals(obj1, obj2)).toBe(true)

      // Objects with different constructor values should not be equal
      expect(Equal.equals(obj1, obj3)).toBe(false)
      expect(Equal.equals(obj2, obj3)).toBe(false)
    })

    it("should include constructor property when it has a meaningful user-defined value from a prototype when it is a function", () => {
      const f = () => 10
      const g = () => 10
      const obj1 = Object.setPrototypeOf({ a: 1 }, { constructor: f })
      const obj2 = Object.setPrototypeOf({ a: 1 }, { constructor: f })
      const obj3 = Object.setPrototypeOf({ a: 1 }, { constructor: g })

      // Objects with same constructor value should be equal
      expect(Equal.equals(obj1, obj2)).toBe(true)

      // Objects with different constructor values should not be equal
      expect(Equal.equals(obj1, obj3)).toBe(false)
      expect(Equal.equals(obj2, obj3)).toBe(false)
    })

    it("should still ignore default constructor property", () => {
      const obj1 = { a: 1, b: 2 }
      const obj2 = { a: 1, b: 2 }

      // Normal objects should still be equal (constructor property ignored when it's the default)
      expect(Equal.equals(obj1, obj2)).toBe(true)

      // Verify that obj1.constructor and obj2.constructor are the default Object constructor
      expect(obj1.constructor).toBe(Object)
      expect(obj2.constructor).toBe(Object)
    })
  })

  describe("recursive objects", () => {
    it("should handle circular references in Equal implementations without infinite recursion", () => {
      class CircularEqualTest implements Equal.Equal {
        constructor(readonly value: string, public child: CircularEqualTest | null = null) {}

        [Equal.symbol](that: Equal.Equal): boolean {
          if (!(that instanceof CircularEqualTest)) {
            return false
          }

          // Circular references are handled automatically by the system
          // This implementation can safely call Equal.equals without manual tracking
          return this.value === that.value && Equal.equals(this.child, that.child)
        }

        [Hash.symbol](): number {
          return Hash.string(this.value)
        }
      }

      // Test case 1: Self-referencing objects
      const obj1 = new CircularEqualTest("test")
      obj1.child = obj1

      const obj2 = new CircularEqualTest("test")
      obj2.child = obj2

      // This should not cause infinite recursion
      expect(Equal.equals(obj1, obj2)).toBe(true)

      // Test case 2: Different values should not be equal even with same structure
      const obj3 = new CircularEqualTest("different")
      obj3.child = obj3

      expect(Equal.equals(obj1, obj3)).toBe(false)
    })

    it("should handle complex circular references in Equal implementations", () => {
      class ComplexEqualTest implements Equal.Equal {
        constructor(readonly id: number, public ref: ComplexEqualTest | null = null) {}

        [Equal.symbol](that: Equal.Equal): boolean {
          if (!(that instanceof ComplexEqualTest)) {
            return false
          }

          // Circular references are handled automatically by the system
          return this.id === that.id && Equal.equals(this.ref, that.ref)
        }

        [Hash.symbol](): number {
          return Hash.number(this.id)
        }
      }

      // Create cycle: obj1 -> obj2 -> obj1
      const obj1 = new ComplexEqualTest(1)
      const obj2 = new ComplexEqualTest(2)
      obj1.ref = obj2
      obj2.ref = obj1

      // Create identical cycle: obj3 -> obj4 -> obj3
      const obj3 = new ComplexEqualTest(1)
      const obj4 = new ComplexEqualTest(2)
      obj3.ref = obj4
      obj4.ref = obj3

      // Should not cause infinite recursion and should be equal
      expect(Equal.equals(obj1, obj3)).toBe(true)
      expect(Equal.equals(obj2, obj4)).toBe(true)
    })

    it("should expose visited sets for advanced use cases", () => {
      // Most implementations don't need manual tracking, but the sets are exposed
      // for advanced scenarios where integration with the tracking system is needed

      class SimpleContainer implements Equal.Equal {
        constructor(readonly name: string, readonly items: Array<SimpleContainer> = []) {}

        [Equal.symbol](that: Equal.Equal): boolean {
          if (!(that instanceof SimpleContainer)) {
            return false
          }

          // Simple implementation - no manual tracking needed
          // Circular references are handled automatically
          return this.name === that.name &&
            this.items.length === that.items.length &&
            this.items.every((item, i) => Equal.equals(item, that.items[i]))
        }

        [Hash.symbol](): number {
          // Simple hash implementation - circular references are handled automatically
          let result = Hash.string(this.name)
          for (const item of this.items) {
            result = Hash.combine(result, Hash.hash(item))
          }
          return result
        }
      }

      // Test that automatic circular reference handling works
      const container1 = new SimpleContainer("A")
      container1.items.push(container1) // Self-reference

      const container2 = new SimpleContainer("A")
      container2.items.push(container2) // Self-reference

      // Should not cause infinite recursion due to automatic tracking
      expect(Equal.equals(container1, container2)).toBe(true)
    })

    it("should handle objects with circular references without infinite recursion", () => {
      // Create objects that reference themselves
      const obj1: any = { a: 1, b: 2 }
      obj1.self = obj1

      const obj2: any = { a: 1, b: 2 }
      obj2.self = obj2

      // This should not throw due to stack overflow
      expect(() => Equal.equals(obj1, obj2)).not.toThrow()
      expect(Equal.equals(obj1, obj2)).toBe(true)
    })

    it("should handle arrays with circular references without infinite recursion", () => {
      // Create arrays that reference themselves
      const arr1: any = [1, 2, 3]
      arr1.push(arr1)

      const arr2: any = [1, 2, 3]
      arr2.push(arr2)

      // This should not throw due to stack overflow
      expect(() => Equal.equals(arr1, arr2)).not.toThrow()
      expect(Equal.equals(arr1, arr2)).toBe(true)
    })

    it("should handle Uint8Array", () => {
      const arr1: Uint8Array = new Uint8Array([1, 2, 3])
      const arr2: Uint8Array = new Uint8Array([1, 2, 3])
      expect(Equal.equals(arr1, arr2)).toBe(true)
    })

    it("should handle mixed circular references between objects and arrays", () => {
      // Create complex circular structure
      const obj1: any = { type: "object", items: [] }
      const arr1: any = [1, 2, obj1]
      obj1.items = arr1

      const obj2: any = { type: "object", items: [] }
      const arr2: any = [1, 2, obj2]
      obj2.items = arr2

      // This should not throw due to stack overflow
      expect(() => Equal.equals(obj1, obj2)).not.toThrow()
      expect(Equal.equals(obj1, obj2)).toBe(true)
    })

    it("should handle hashing objects with circular references without infinite recursion", () => {
      // Create object that references itself
      const obj: any = { a: 1, b: 2 }
      obj.self = obj

      // This should not throw due to stack overflow
      expect(() => Hash.hash(obj)).not.toThrow()

      // Hash should be consistent
      const hash1 = Hash.hash(obj)
      const hash2 = Hash.hash(obj)
      expect(hash1).toBe(hash2)
    })

    it("should handle hashing arrays with circular references without infinite recursion", () => {
      // Create array that references itself
      const arr: any = [1, 2, 3]
      arr.push(arr)

      // This should not throw due to stack overflow
      expect(() => Hash.hash(arr)).not.toThrow()

      // Hash should be consistent
      const hash1 = Hash.hash(arr)
      const hash2 = Hash.hash(arr)
      expect(hash1).toBe(hash2)
    })

    it("should produce different hashes for objects with different circular structures", () => {
      const obj1: any = { a: 1, b: 2 }
      obj1.self = obj1

      const obj2: any = { a: 1, b: 3 } // Different value
      obj2.self = obj2

      // Should not throw and should produce different hashes
      expect(() => Hash.hash(obj1)).not.toThrow()
      expect(() => Hash.hash(obj2)).not.toThrow()
      expect(Hash.hash(obj1)).not.toBe(Hash.hash(obj2))
    })

    it("should return false for objects with different circular reference patterns", () => {
      // Object that references itself
      const obj1: any = { a: 1, b: 2 }
      obj1.self = obj1

      // Object that references a different object
      const obj2: any = { a: 1, b: 2 }
      const obj3: any = { a: 1, b: 2 }
      obj2.self = obj3

      // These should be considered different
      expect(() => Equal.equals(obj1, obj2)).not.toThrow()
      expect(Equal.equals(obj1, obj2)).toBe(false)
    })
  })
})
