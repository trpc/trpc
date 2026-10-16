import { hole, Number, pipe, Schema, String as Str, Struct } from "effect"
import type { Reducer } from "effect"
import { describe, expect, it } from "tstyche"

const aSym = Symbol.for("a")
const bSym = Symbol.for("b")
const cSym = Symbol.for("c")
const dSym = Symbol.for("d")

const stringKeys = hole<{ a: string; b: number; c: boolean }>()
const readonlyStringKeys = hole<{ readonly a: string; readonly b: number; readonly c: boolean }>()
const stringOptionalKeys = hole<{ a?: string; b?: number; c?: boolean }>()
const symbolKeys = { [aSym]: "a", [bSym]: 1, [cSym]: true }
const numberKeys = { 1: "a", 2: 1, 3: true }
const mixedKeys = hole<{ a: string; 1: number; [aSym]: boolean }>()
const optionalMixedKeys = hole<{ a?: string; 1?: number; [aSym]?: boolean }>()

describe("Struct", () => {
  it("Mutable", () => {
    expect<Struct.Mutable<any>>().type.toBe<{ [x: string]: any }>()
    expect<Struct.Mutable<unknown>>().type.toBe<{}>()
    expect<Struct.Mutable<never>>().type.toBe<never>()
    expect<Struct.Mutable<void>>().type.toBe<void>()
    expect<Struct.Mutable<null>>().type.toBe<null>()
    expect<Struct.Mutable<undefined>>().type.toBe<undefined>()
    expect<Struct.Mutable<string>>().type.toBe<string>()
    expect<Struct.Mutable<number>>().type.toBe<number>()
    expect<Struct.Mutable<boolean>>().type.toBe<boolean>()
    expect<Struct.Mutable<symbol>>().type.toBe<symbol>()
    expect<Struct.Mutable<bigint>>().type.toBe<bigint>()
    expect<Struct.Mutable<object>>().type.toBe<object>()
    expect<Struct.Mutable<"a">>().type.toBe<"a">()
    expect<Struct.Mutable<1>>().type.toBe<1>()
    expect<Struct.Mutable<1n>>().type.toBe<1n>()
    expect<Struct.Mutable<true>>().type.toBe<true>()
    expect<Struct.Mutable<false>>().type.toBe<false>()
    expect<Struct.Mutable<Date>>().type.toBe<Date>()
    expect<Struct.Mutable<Array<unknown>>>().type.toBe<Array<unknown>>()
    expect<Struct.Mutable<ReadonlyArray<unknown>>>().type.toBe<Array<unknown>>()
    expect<Struct.Mutable<readonly [string, number]>>().type.toBe<[string, number]>()
    expect<Struct.Mutable<{ readonly a: string; readonly b: number }>>().type.toBe<{ a: string; b: number }>()
    expect<Struct.Mutable<{ readonly a: string } | { readonly b: number }>>().type.toBe<
      { a: string } | { b: number }
    >()
    interface Category {
      readonly name: string
      readonly subcategories: ReadonlyArray<Category>
    }
    expect<Struct.Mutable<Category>>().type.toBe<{ name: string; subcategories: ReadonlyArray<Category> }>()
  })

  describe("get", () => {
    it("errors", () => {
      pipe(
        mixedKeys,
        // @ts-expect-error Argument of type '"b"' is not assignable to parameter of type '"a" | unique symbol | 1'
        Struct.get("b")
      )
      expect(Struct.get).type.not.toBeCallableWith(mixedKeys, "b")

      pipe(
        optionalMixedKeys,
        // @ts-expect-error Argument of type '"b"' is not assignable to parameter of type '"a" | unique symbol | 1'
        Struct.get("b")
      )
      expect(Struct.get).type.not.toBeCallableWith(optionalMixedKeys, "b")
    })

    it("required property", () => {
      expect(pipe(mixedKeys, Struct.get("a"))).type.toBe<string>()
      expect(pipe(mixedKeys, Struct.get(1))).type.toBe<number>()
      expect(pipe(mixedKeys, Struct.get(aSym))).type.toBe<boolean>()

      expect(Struct.get(mixedKeys, "a")).type.toBe<string>()
      expect(Struct.get(mixedKeys, 1)).type.toBe<number>()
      expect(Struct.get(mixedKeys, aSym)).type.toBe<boolean>()
    })

    it("optional property", () => {
      expect(pipe(optionalMixedKeys, Struct.get("a"))).type.toBe<string | undefined>()
      expect(pipe(optionalMixedKeys, Struct.get(1))).type.toBe<number | undefined>()
      expect(pipe(optionalMixedKeys, Struct.get(aSym))).type.toBe<boolean | undefined>()

      expect(Struct.get(optionalMixedKeys, "a")).type.toBe<string | undefined>()
      expect(Struct.get(optionalMixedKeys, 1)).type.toBe<number | undefined>()
      expect(Struct.get(optionalMixedKeys, aSym)).type.toBe<boolean | undefined>()
    })
  })

  it("keys", () => {
    expect(Struct.keys(hole<{ a: string; b: number; [aSym]: boolean }>())).type.toBe<
      Array<"a" | "b">
    >()
    expect(pipe(hole<{ a: string; b: number; [aSym]: boolean }>(), Struct.keys)).type.toBe<
      Array<"a" | "b">
    >()
  })

  describe("pick", () => {
    it("errors when picking a non-existent key", () => {
      pipe(
        mixedKeys,
        // @ts-expect-error Type '"d"' is not assignable to type '"a" | unique symbol | 1'
        Struct.pick(["d"])
      )
      expect(Struct.pick).type.not.toBeCallableWith(mixedKeys, ["d"])

      pipe(
        mixedKeys,
        // @ts-expect-error Type 'unique symbol' is not assignable to type '"a" | unique symbol | 1'
        Struct.pick([dSym])
      )
      expect(Struct.pick).type.not.toBeCallableWith(mixedKeys, [dSym])

      pipe(
        mixedKeys,
        // @ts-expect-error Type '4' is not assignable to type '"a" | unique symbol | 1'
        Struct.pick([4])
      )
      expect(Struct.pick).type.not.toBeCallableWith(mixedKeys, [4])
    })

    it("required properties", () => {
      expect(pipe(stringKeys, Struct.pick(["a", "b"]))).type.toBe<{ a: string; b: number }>()
      expect(Struct.pick(stringKeys, ["a", "b"])).type.toBe<{ a: string; b: number }>()

      expect(pipe(readonlyStringKeys, Struct.pick(["a", "b"]))).type.toBe<{ readonly a: string; readonly b: number }>()
      expect(Struct.pick(readonlyStringKeys, ["a", "b"])).type.toBe<{ readonly a: string; readonly b: number }>()

      expect(Struct.pick(symbolKeys, [aSym, bSym])).type.toBe<{ [aSym]: string; [bSym]: number }>()
      expect(pipe(symbolKeys, Struct.pick([aSym, bSym]))).type.toBe<{ [aSym]: string; [bSym]: number }>()

      expect(Struct.pick(numberKeys, [1, 2])).type.toBe<{ 1: string; 2: number }>()
      expect(pipe(numberKeys, Struct.pick([1, 2]))).type.toBe<{ 1: string; 2: number }>()
    })

    it("optional properties", () => {
      expect(Struct.pick(stringOptionalKeys, ["a", "b"])).type.toBe<{ a?: string; b?: number }>()
      expect(pipe(stringOptionalKeys, Struct.pick(["a", "b"]))).type.toBe<{ a?: string; b?: number }>()
    })
  })

  describe("omit", () => {
    it("errors when omitting a non-existent key", () => {
      pipe(
        mixedKeys,
        // @ts-expect-error Type '"d"' is not assignable to type '"a" | unique symbol | 1'
        Struct.omit(["d"])
      )
      expect(Struct.omit).type.not.toBeCallableWith(mixedKeys, ["d"])

      pipe(
        mixedKeys,
        // @ts-expect-error Type 'unique symbol' is not assignable to type '"a" | unique symbol | 1'
        Struct.omit([dSym])
      )
      expect(Struct.omit).type.not.toBeCallableWith(mixedKeys, [dSym])

      pipe(
        mixedKeys,
        // @ts-expect-error Type '4' is not assignable to type '"a" | unique symbol | 1'
        Struct.omit([4])
      )
      expect(Struct.omit).type.not.toBeCallableWith(mixedKeys, [4])
    })

    it("required properties", () => {
      expect(pipe(stringKeys, Struct.omit(["c"]))).type.toBe<{ a: string; b: number }>()
      expect(Struct.omit(stringKeys, ["c"])).type.toBe<{ a: string; b: number }>()

      expect(pipe(readonlyStringKeys, Struct.omit(["c"]))).type.toBe<{ readonly a: string; readonly b: number }>()
      expect(Struct.omit(readonlyStringKeys, ["c"])).type.toBe<{ readonly a: string; readonly b: number }>()

      expect(Struct.omit(symbolKeys, [cSym])).type.toBe<{ [aSym]: string; [bSym]: number }>()
      expect(pipe(symbolKeys, Struct.omit([cSym]))).type.toBe<{ [aSym]: string; [bSym]: number }>()

      expect(Struct.omit(numberKeys, [3])).type.toBe<{ 1: string; 2: number }>()
      expect(pipe(numberKeys, Struct.omit([3]))).type.toBe<{ 1: string; 2: number }>()
    })

    it("optional properties", () => {
      expect(Struct.omit(stringOptionalKeys, ["c"])).type.toBe<{ a?: string; b?: number }>()
      expect(pipe(stringOptionalKeys, Struct.omit(["c"]))).type.toBe<{ a?: string; b?: number }>()
    })
  })

  describe("evolve", () => {
    it("errors when not providing a well-typed transformation function for a key", () => {
      expect(Struct.evolve).type.not.toBeCallableWith(
        { a: "a", b: 1 },
        { a: (n: number) => n }
      )
      pipe(
        { a: "a", b: 1 },
        // @ts-expect-error Type '(n: number) => number' is not assignable to type '(a: string) => unknown'
        Struct.evolve({ a: (n: number) => n })
      )
    })

    it("partial required fields", () => {
      expect(Struct.evolve(stringKeys, {
        a: (s) => {
          expect(s).type.toBe<string>()
          return s.length
        }
      })).type.toBe<{ a: number; b: number; c: boolean }>()
      expect(pipe(
        stringKeys,
        Struct.evolve({
          a: (s) => {
            expect(s).type.toBe<string>()
            return s.length
          }
        })
      )).type.toBe<{ a: number; b: number; c: boolean }>()

      expect(Struct.evolve(symbolKeys, {
        [aSym]: (s) => {
          expect(s).type.toBe<string>()
          return s.length
        }
      })).type.toBe<{ [aSym]: number; [bSym]: number; [cSym]: boolean }>()
      expect(pipe(
        symbolKeys,
        Struct.evolve({
          [aSym]: (s) => {
            expect(s).type.toBe<string>()
            return s.length
          }
        })
      )).type.toBe<{ [aSym]: number; [bSym]: number; [cSym]: boolean }>()
    })

    it("all required fields", () => {
      expect(Struct.evolve(stringKeys, {
        a: (s) => {
          expect(s).type.toBe<string>()
          return s.length
        },
        b: (n) => {
          expect(n).type.toBe<number>()
          return n * 2
        },
        c: (b) => {
          expect(b).type.toBe<boolean>()
          return !b
        }
      })).type.toBe<{ a: number; b: number; c: boolean }>()
      expect(pipe(
        stringKeys,
        Struct.evolve({
          a: (s) => {
            expect(s).type.toBe<string>()
            return s.length
          },
          b: (n) => {
            expect(n).type.toBe<number>()
            return n * 2
          },
          c: (b) => {
            expect(b).type.toBe<boolean>()
            return !b
          }
        })
      )).type.toBe<{ a: number; b: number; c: boolean }>()

      expect(Struct.evolve(symbolKeys, {
        [aSym]: (s) => {
          expect(s).type.toBe<string>()
          return s.length
        },
        [bSym]: (n) => {
          expect(n).type.toBe<number>()
          return n * 2
        },
        [cSym]: (b) => {
          expect(b).type.toBe<boolean>()
          return !b
        }
      })).type.toBe<{ [aSym]: number; [bSym]: number; [cSym]: boolean }>()
      expect(pipe(
        symbolKeys,
        Struct.evolve({
          [aSym]: (s) => {
            expect(s).type.toBe<string>()
            return s.length
          },
          [bSym]: (n) => {
            expect(n).type.toBe<number>()
            return n * 2
          },
          [cSym]: (b) => {
            expect(b).type.toBe<boolean>()
            return !b
          }
        })
      )).type.toBe<{ [aSym]: number; [bSym]: number; [cSym]: boolean }>()
    })
  })

  it("evolveKeys", () => {
    expect(Struct.evolveKeys(stringKeys, {
      a: (k) => Str.toUpperCase(k)
    })).type.toBe<{ A: string; b: number; c: boolean }>()
    expect(pipe(
      stringKeys,
      Struct.evolveKeys({
        a: (k) => Str.toUpperCase(k)
      })
    )).type.toBe<{ A: string; b: number; c: boolean }>()
  })

  it("evolveEntries", () => {
    expect(Struct.evolveEntries(stringKeys, {
      a: (k, v) => [Str.toUpperCase(k), v.length]
    })).type.toBe<{ A: number; b: number; c: boolean }>()
    expect(pipe(
      stringKeys,
      Struct.evolveEntries({
        a: (k, v) => [Str.toUpperCase(k), v.length]
      })
    )).type.toBe<{ A: number; b: number; c: boolean }>()

    const readonlyStringKeys = hole<{ a: string; b: number; c: boolean }>()
    expect(Struct.evolveEntries(readonlyStringKeys, {
      a: (k, v) => [Str.toUpperCase(k), v.length]
    })).type.toBe<{ A: number; b: number; c: boolean }>()
    expect(pipe(
      readonlyStringKeys,
      Struct.evolveEntries({
        a: (k, v) => [Str.toUpperCase(k), v.length]
      })
    )).type.toBe<{ A: number; b: number; c: boolean }>()
  })

  it("map", () => {
    expect(pipe({ a: Schema.String, b: Schema.Number }, Struct.map(Schema.NullOr))).type.toBe<{
      a: Schema.NullOr<Schema.String>
      b: Schema.NullOr<Schema.Number>
    }>()
    expect(Struct.map({ a: Schema.String, b: Schema.Number }, Schema.NullOr)).type.toBe<{
      a: Schema.NullOr<Schema.String>
      b: Schema.NullOr<Schema.Number>
    }>()
  })

  it("mapPick", () => {
    expect(pipe({ a: Schema.String, b: Schema.Number }, Struct.mapPick(["a"], Schema.NullOr))).type.toBe<{
      a: Schema.NullOr<Schema.String>
      b: Schema.Number
    }>()
    expect(Struct.mapPick({ a: Schema.String, b: Schema.Number }, ["a"], Schema.NullOr)).type.toBe<{
      a: Schema.NullOr<Schema.String>
      b: Schema.Number
    }>()
  })

  it("mapOmit", () => {
    expect(pipe({ a: Schema.String, b: Schema.Number }, Struct.mapOmit(["b"], Schema.NullOr))).type.toBe<{
      a: Schema.NullOr<Schema.String>
      b: Schema.Number
    }>()
    expect(Struct.mapPick({ a: Schema.String, b: Schema.Number }, ["a"], Schema.NullOr)).type.toBe<{
      a: Schema.NullOr<Schema.String>
      b: Schema.Number
    }>()
  })

  it("renameKeys", () => {
    expect(pipe({ a: "a", b: 1, c: true }, Struct.renameKeys({ a: "A", b: "B" }))).type.toBe<
      { A: string; B: number; c: boolean }
    >()
    expect(Struct.renameKeys({ a: "a", b: 1, c: true }, { a: "A", b: "B" })).type.toBe<
      { A: string; B: number; c: boolean }
    >()
    expect(Struct.renameKeys(symbolKeys, { [aSym]: dSym })).type.toBe<
      { [dSym]: string; [bSym]: number; [cSym]: boolean }
    >()
    expect(pipe(symbolKeys, Struct.renameKeys({ [aSym]: dSym }))).type.toBe<
      { [dSym]: string; [bSym]: number; [cSym]: boolean }
    >()
  })

  it("makeReducer", () => {
    expect(Struct.makeReducer({
      n: Number.ReducerSum,
      s: Str.ReducerConcat
    })).type.toBe<Reducer.Reducer<{ n: number; s: string }>>()
    expect(Struct.makeReducer<{ readonly n: number; readonly s: string }>({
      n: Number.ReducerSum,
      s: Str.ReducerConcat
    })).type.toBe<Reducer.Reducer<{ readonly n: number; readonly s: string }>>()
  })

  describe("assign", () => {
    it("non overlapping fields", () => {
      expect(Struct.assign(stringKeys, { d: 1 })).type.toBe<{ a: string; b: number; c: boolean; d: number }>()
      expect(pipe(stringKeys, Struct.assign({ d: 1 }))).type.toBe<{ a: string; b: number; c: boolean; d: number }>()

      expect(Struct.assign(readonlyStringKeys, { d: 1 })).type.toBe<
        { readonly a: string; readonly b: number; readonly c: boolean; d: number }
      >()
      expect(pipe(readonlyStringKeys, Struct.assign({ d: 1 }))).type.toBe<
        { readonly a: string; readonly b: number; readonly c: boolean; d: number }
      >()
    })

    it("overlapping fields", () => {
      expect(Struct.assign(stringKeys, { b: true, d: 1 })).type.toBe<{ a: string; b: boolean; c: boolean; d: number }>()
      expect(pipe(stringKeys, Struct.assign({ b: true, d: 1 }))).type.toBe<
        { a: string; b: boolean; c: boolean; d: number }
      >()

      expect(Struct.assign(readonlyStringKeys, { b: true, d: 1 })).type.toBe<
        { readonly a: string; b: boolean; readonly c: boolean; d: number }
      >()
      expect(pipe(readonlyStringKeys, Struct.assign({ b: true, d: 1 }))).type.toBe<
        { readonly a: string; b: boolean; readonly c: boolean; d: number }
      >()
    })
  })
})
