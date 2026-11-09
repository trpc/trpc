import { Number, pipe, Schema, String as Str, Tuple } from "effect"
import type { Reducer } from "effect"
import { describe, expect, it } from "tstyche"

const tuple = ["a", 2, true] as [string, number, boolean]

const optionalTuple = ["a", 2, true] as [string?, number?, boolean?]

describe("Tuple", () => {
  it("make preserves argument literals", () => {
    expect(Tuple.make("a", 1, true)).type.toBe<["a", 1, true]>()
  })

  describe("get", () => {
    it("errors", () => {
      pipe(
        tuple,
        // @ts-expect-error Argument of type '4' is not assignable
        Tuple.get(4)
      )
      expect(Tuple.get).type.not.toBeCallableWith(tuple, 4)

      pipe(
        optionalTuple,
        // @ts-expect-error Argument of type '0' is not assignable
        Tuple.get(0)
      )
      expect(Tuple.get).type.not.toBeCallableWith(optionalTuple, 0)
    })

    it("data-first", () => {
      expect(Tuple.get(tuple, 0)).type.toBe<string>()
      expect(Tuple.get(tuple, 1)).type.toBe<number>()
      expect(Tuple.get(tuple, 2)).type.toBe<boolean>()
    })

    it("data-last", () => {
      expect(pipe(tuple, Tuple.get(0))).type.toBe<string>()
      expect(pipe(tuple, Tuple.get(1))).type.toBe<number>()
      expect(pipe(tuple, Tuple.get(2))).type.toBe<boolean>()
    })
  })

  describe("pick", () => {
    it("errors", () => {
      pipe(
        tuple,
        // @ts-expect-error Type '4' is not assignable
        Tuple.pick([4])
      )
      expect(Tuple.pick).type.not.toBeCallableWith(tuple, [4])
    })

    it("data-first", () => {
      expect(Tuple.pick(tuple, [0, 2])).type.toBe<[string, boolean]>()
    })

    it("data-last", () => {
      expect(pipe(tuple, Tuple.pick([0, 2]))).type.toBe<[string, boolean]>()
    })

    it("preserves index order and duplicates", () => {
      expect(Tuple.pick(tuple, [2, 0, 2])).type.toBe<[boolean, string, boolean]>()
    })
  })

  describe("omit", () => {
    it("errors", () => {
      pipe(
        tuple,
        // @ts-expect-error Type '4' is not assignable
        Tuple.omit([4])
      )
      expect(Tuple.omit).type.not.toBeCallableWith(tuple, [4])
    })

    it("data-first", () => {
      expect(Tuple.omit(tuple, [1])).type.toBe<[string, boolean]>()
    })

    it("data-last", () => {
      expect(pipe(tuple, Tuple.omit([1]))).type.toBe<[string, boolean]>()
    })
  })

  it("appendElement", () => {
    expect(pipe(tuple, Tuple.appendElement("b"))).type.toBe<[string, number, boolean, "b"]>()
    expect(Tuple.appendElement(tuple, "b")).type.toBe<[string, number, boolean, "b"]>()
  })

  it("appendElements", () => {
    expect(pipe(tuple, Tuple.appendElements(["b", 2]))).type.toBe<[string, number, boolean, "b", 2]>()
    expect(Tuple.appendElements(tuple, ["b", 2])).type.toBe<[string, number, boolean, "b", 2]>()
  })

  it("evolve", () => {
    expect(pipe(tuple, Tuple.evolve([(s) => s.length]))).type.toBe<[number, number, boolean]>()
    expect(Tuple.evolve(tuple, [(s) => s.length] as const)).type.toBe<[number, number, boolean]>()

    expect(pipe(
      tuple,
      Tuple.evolve([
        (s) => s.length,
        undefined,
        (b) => `b: ${b}`
      ])
    )).type.toBe<[number, number, string]>()
    expect(Tuple.evolve(
      tuple,
      [
        (s) => s.length,
        undefined,
        (b) => `b: ${b}`
      ] as const
    )).type.toBe<[number, number, string]>()

    const optionalTransform = undefined as ((n: number) => string) | undefined
    expect(Tuple.evolve(tuple, [undefined, optionalTransform] as const)).type.toBe<
      [string, number | string, boolean]
    >()
  })

  describe("renameIndices", () => {
    it("errors", () => {
      pipe(
        tuple,
        // @ts-expect-error Type '"4"' is not assignable
        Tuple.renameIndices(["4", "0"])
      )
      expect(Tuple.renameIndices).type.not.toBeCallableWith(tuple, ["4", "0"])
    })

    it("partial index mapping", () => {
      expect(pipe(tuple, Tuple.renameIndices(["1", "0"]))).type.toBe<[number, string, boolean]>()
      expect(Tuple.renameIndices(tuple, ["1", "0"])).type.toBe<[number, string, boolean]>()
    })

    it("full index mapping", () => {
      expect(pipe(tuple, Tuple.renameIndices(["2", "1", "0"]))).type.toBe<[boolean, number, string]>()
      expect(Tuple.renameIndices(tuple, ["2", "1", "0"])).type.toBe<[boolean, number, string]>()
    })
  })

  it("map", () => {
    const tuple = [Schema.String, Schema.Number, Schema.Boolean] as const
    expect(pipe(tuple, Tuple.map(Schema.NullOr))).type.toBe<
      readonly [
        Schema.NullOr<Schema.String>,
        Schema.NullOr<Schema.Number>,
        Schema.NullOr<Schema.Boolean>
      ]
    >()
    expect(Tuple.map(tuple, Schema.NullOr)).type.toBe<
      readonly [
        Schema.NullOr<Schema.String>,
        Schema.NullOr<Schema.Number>,
        Schema.NullOr<Schema.Boolean>
      ]
    >()
  })

  it("mapPick", () => {
    const tuple = [Schema.String, Schema.Number, Schema.Boolean] as const
    expect(pipe(tuple, Tuple.mapPick([0, 2], Schema.NullOr))).type.toBe<
      readonly [
        Schema.NullOr<Schema.String>,
        Schema.Number,
        Schema.NullOr<Schema.Boolean>
      ]
    >()
    expect(Tuple.mapPick(tuple, [0, 2], Schema.NullOr)).type.toBe<
      readonly [
        Schema.NullOr<Schema.String>,
        Schema.Number,
        Schema.NullOr<Schema.Boolean>
      ]
    >()
  })

  it("makeReducer", () => {
    expect(Tuple.makeReducer([
      Number.ReducerSum,
      Str.ReducerConcat
    ])).type.toBe<Reducer.Reducer<[number, string]>>()
    expect(Tuple.makeReducer<readonly [number, string]>([
      Number.ReducerSum,
      Str.ReducerConcat
    ])).type.toBe<Reducer.Reducer<readonly [number, string]>>()
  })
})
