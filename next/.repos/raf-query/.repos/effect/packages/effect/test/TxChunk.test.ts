import { Chunk, Effect, TxChunk } from "effect"
import { describe, expect, it } from "vitest"

describe("TxChunk", () => {
  describe("constructors", () => {
    it("make should create a TxChunk with initial chunk", async () => {
      const program = Effect.tx(Effect.gen(function*() {
        const chunk = Chunk.fromIterable([1, 2, 3])
        const txChunk = yield* TxChunk.make(chunk)
        const result = yield* TxChunk.get(txChunk)
        return result
      }))

      const result = await Effect.runPromise(program)
      expect(Chunk.toReadonlyArray(result)).toEqual([1, 2, 3])
    })

    it("empty should create an empty TxChunk", async () => {
      const program = Effect.tx(Effect.gen(function*() {
        const txChunk = yield* TxChunk.empty<number>()
        const result = yield* TxChunk.get(txChunk)
        return result
      }))

      const result = await Effect.runPromise(program)
      expect(Chunk.toReadonlyArray(result)).toEqual([])
    })

    it("fromIterable should create a TxChunk from an iterable", async () => {
      const program = Effect.tx(Effect.gen(function*() {
        const txChunk = yield* TxChunk.fromIterable([4, 5, 6])
        const result = yield* TxChunk.get(txChunk)
        return result
      }))

      const result = await Effect.runPromise(program)
      expect(Chunk.toReadonlyArray(result)).toEqual([4, 5, 6])
    })
  })

  describe("basic operations", () => {
    it("get should read the current chunk", async () => {
      const program = Effect.tx(Effect.gen(function*() {
        const txChunk = yield* TxChunk.fromIterable([1, 2, 3])
        const result = yield* TxChunk.get(txChunk)
        return result
      }))

      const result = await Effect.runPromise(program)
      expect(Chunk.toReadonlyArray(result)).toEqual([1, 2, 3])
    })

    it("set should replace the entire chunk", async () => {
      const program = Effect.tx(Effect.gen(function*() {
        const txChunk = yield* TxChunk.fromIterable([1, 2, 3])
        const newChunk = Chunk.fromIterable([7, 8, 9])

        yield* TxChunk.set(txChunk, newChunk)

        const result = yield* TxChunk.get(txChunk)
        return result
      }))

      const result = await Effect.runPromise(program)
      expect(Chunk.toReadonlyArray(result)).toEqual([7, 8, 9])
    })

    it("append should add element to the end", async () => {
      const program = Effect.tx(Effect.gen(function*() {
        const txChunk = yield* TxChunk.fromIterable([1, 2, 3])

        yield* TxChunk.append(txChunk, 4)

        const result = yield* TxChunk.get(txChunk)
        return result
      }))

      const result = await Effect.runPromise(program)
      expect(Chunk.toReadonlyArray(result)).toEqual([1, 2, 3, 4])
    })

    it("prepend should add element to the beginning", async () => {
      const program = Effect.tx(Effect.gen(function*() {
        const txChunk = yield* TxChunk.fromIterable([2, 3, 4])

        yield* TxChunk.prepend(txChunk, 1)

        const result = yield* TxChunk.get(txChunk)
        return result
      }))

      const result = await Effect.runPromise(program)
      expect(Chunk.toReadonlyArray(result)).toEqual([1, 2, 3, 4])
    })

    it("size should return the chunk size", async () => {
      const program = Effect.tx(Effect.gen(function*() {
        const txChunk = yield* TxChunk.fromIterable([1, 2, 3])
        const size = yield* TxChunk.size(txChunk)
        return size
      }))

      const result = await Effect.runPromise(program)
      expect(result).toBe(3)
    })

    it("isEmpty should return true for empty chunk", async () => {
      const program = Effect.tx(Effect.gen(function*() {
        const txChunk = yield* TxChunk.empty<number>()
        const isEmpty = yield* TxChunk.isEmpty(txChunk)
        return isEmpty
      }))

      const result = await Effect.runPromise(program)
      expect(result).toBe(true)
    })

    it("isEmpty should return false for non-empty chunk", async () => {
      const program = Effect.tx(Effect.gen(function*() {
        const txChunk = yield* TxChunk.fromIterable([1, 2, 3])
        const isEmpty = yield* TxChunk.isEmpty(txChunk)
        return isEmpty
      }))

      const result = await Effect.runPromise(program)
      expect(result).toBe(false)
    })

    it("isNonEmpty should return false for empty chunk", async () => {
      const program = Effect.tx(Effect.gen(function*() {
        const txChunk = yield* TxChunk.empty<number>()
        const isNonEmpty = yield* TxChunk.isNonEmpty(txChunk)
        return isNonEmpty
      }))

      const result = await Effect.runPromise(program)
      expect(result).toBe(false)
    })

    it("isNonEmpty should return true for non-empty chunk", async () => {
      const program = Effect.tx(Effect.gen(function*() {
        const txChunk = yield* TxChunk.fromIterable([1, 2, 3])
        const isNonEmpty = yield* TxChunk.isNonEmpty(txChunk)
        return isNonEmpty
      }))

      const result = await Effect.runPromise(program)
      expect(result).toBe(true)
    })
  })

  describe("transactional semantics", () => {
    it("should perform atomic operations within a transaction", async () => {
      const program = Effect.tx(Effect.gen(function*() {
        const txChunk = yield* TxChunk.fromIterable([1, 2, 3])

        yield* Effect.gen(function*() {
          yield* TxChunk.append(txChunk, 4)
          yield* TxChunk.prepend(txChunk, 0)
        })

        const result = yield* TxChunk.get(txChunk)
        return result
      }))

      const result = await Effect.runPromise(program)
      expect(Chunk.toReadonlyArray(result)).toEqual([0, 1, 2, 3, 4])
    })

    it("modify should transform and return a value atomically", async () => {
      const program = Effect.tx(Effect.gen(function*() {
        const txChunk = yield* TxChunk.fromIterable([1, 2, 3])

        const oldSize = yield* TxChunk.modify(txChunk, (chunk) => [
          Chunk.size(chunk),
          Chunk.append(chunk, 4)
        ])

        const newChunk = yield* TxChunk.get(txChunk)
        return { oldSize, newChunk }
      }))

      const result = await Effect.runPromise(program)
      expect(result.oldSize).toBe(3)
      expect(Chunk.toReadonlyArray(result.newChunk)).toEqual([1, 2, 3, 4])
    })

    it("update should transform the chunk", async () => {
      const program = Effect.tx(Effect.gen(function*() {
        const txChunk = yield* TxChunk.fromIterable([1, 2, 3])

        yield* TxChunk.update(txChunk, (chunk) => Chunk.map(chunk, (x) => x * 2))

        const result = yield* TxChunk.get(txChunk)
        return result
      }))

      const result = await Effect.runPromise(program)
      expect(Chunk.toReadonlyArray(result)).toEqual([2, 4, 6])
    })
  })

  describe("slice operations", () => {
    it("take should keep first n elements", async () => {
      const program = Effect.tx(Effect.gen(function*() {
        const txChunk = yield* TxChunk.fromIterable([1, 2, 3, 4, 5])

        yield* TxChunk.take(txChunk, 3)

        const result = yield* TxChunk.get(txChunk)
        return result
      }))

      const result = await Effect.runPromise(program)
      expect(Chunk.toReadonlyArray(result)).toEqual([1, 2, 3])
    })

    it("drop should remove first n elements", async () => {
      const program = Effect.tx(Effect.gen(function*() {
        const txChunk = yield* TxChunk.fromIterable([1, 2, 3, 4, 5])

        yield* TxChunk.drop(txChunk, 2)

        const result = yield* TxChunk.get(txChunk)
        return result
      }))

      const result = await Effect.runPromise(program)
      expect(Chunk.toReadonlyArray(result)).toEqual([3, 4, 5])
    })

    it("slice should extract elements from start to end", async () => {
      const program = Effect.tx(Effect.gen(function*() {
        const txChunk = yield* TxChunk.fromIterable([1, 2, 3, 4, 5])

        yield* TxChunk.slice(txChunk, 1, 4)

        const result = yield* TxChunk.get(txChunk)
        return result
      }))

      const result = await Effect.runPromise(program)
      expect(Chunk.toReadonlyArray(result)).toEqual([2, 3, 4])
    })
  })

  describe("transform operations", () => {
    it("map should transform each element", async () => {
      const program = Effect.tx(Effect.gen(function*() {
        const txChunk = yield* TxChunk.fromIterable([1, 2, 3])

        yield* TxChunk.map(txChunk, (x) => x * 2)

        const result = yield* TxChunk.get(txChunk)
        return result
      }))

      const result = await Effect.runPromise(program)
      expect(Chunk.toReadonlyArray(result)).toEqual([2, 4, 6])
    })

    it("filter should keep elements that satisfy predicate", async () => {
      const program = Effect.tx(Effect.gen(function*() {
        const txChunk = yield* TxChunk.fromIterable([1, 2, 3, 4, 5])

        yield* TxChunk.filter(txChunk, (x) => x % 2 === 0)

        const result = yield* TxChunk.get(txChunk)
        return result
      }))

      const result = await Effect.runPromise(program)
      expect(Chunk.toReadonlyArray(result)).toEqual([2, 4])
    })
  })

  describe("concatenation operations", () => {
    it("appendAll should concatenate chunk to the end", async () => {
      const program = Effect.tx(Effect.gen(function*() {
        const txChunk = yield* TxChunk.fromIterable([1, 2, 3])
        const other = Chunk.fromIterable([4, 5, 6])

        yield* TxChunk.appendAll(txChunk, other)

        const result = yield* TxChunk.get(txChunk)
        return result
      }))

      const result = await Effect.runPromise(program)
      expect(Chunk.toReadonlyArray(result)).toEqual([1, 2, 3, 4, 5, 6])
    })

    it("prependAll should concatenate chunk to the beginning", async () => {
      const program = Effect.tx(Effect.gen(function*() {
        const txChunk = yield* TxChunk.fromIterable([4, 5, 6])
        const other = Chunk.fromIterable([1, 2, 3])

        yield* TxChunk.prependAll(txChunk, other)

        const result = yield* TxChunk.get(txChunk)
        return result
      }))

      const result = await Effect.runPromise(program)
      expect(Chunk.toReadonlyArray(result)).toEqual([1, 2, 3, 4, 5, 6])
    })

    it("concat should concatenate another TxChunk to the end", async () => {
      const program = Effect.tx(Effect.gen(function*() {
        const txChunk1 = yield* TxChunk.fromIterable([1, 2, 3])
        const txChunk2 = yield* TxChunk.fromIterable([4, 5, 6])

        yield* TxChunk.concat(txChunk1, txChunk2)

        const result = yield* TxChunk.get(txChunk1)
        return result
      }))

      const result = await Effect.runPromise(program)
      expect(Chunk.toReadonlyArray(result)).toEqual([1, 2, 3, 4, 5, 6])
    })

    it("concat should work atomically within transactions", async () => {
      const program = Effect.tx(Effect.gen(function*() {
        const txChunk1 = yield* TxChunk.fromIterable([1, 2])
        const txChunk2 = yield* TxChunk.fromIterable([3, 4])
        const txChunk3 = yield* TxChunk.fromIterable([5, 6])

        yield* Effect.gen(function*() {
          yield* TxChunk.concat(txChunk1, txChunk2)
          yield* TxChunk.concat(txChunk1, txChunk3)
        })

        const result = yield* TxChunk.get(txChunk1)
        return result
      }))

      const result = await Effect.runPromise(program)
      expect(Chunk.toReadonlyArray(result)).toEqual([1, 2, 3, 4, 5, 6])
    })
  })

  describe("guards", () => {
    it("isTxChunk should identify TxChunk instances", async () => {
      const program = Effect.tx(Effect.gen(function*() {
        const txChunk = yield* TxChunk.fromIterable([1, 2, 3])
        return [
          TxChunk.isTxChunk(txChunk),
          TxChunk.isTxChunk({}),
          TxChunk.isTxChunk(null),
          TxChunk.isTxChunk(undefined),
          TxChunk.isTxChunk([1, 2, 3]),
          TxChunk.isTxChunk(Chunk.fromIterable([1, 2, 3]))
        ]
      }))

      const result = await Effect.runPromise(program)
      expect(result).toEqual([true, false, false, false, false, false])
    })
  })
})
