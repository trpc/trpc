import { Equivalence, Number, pipe, Schema, String, String as Str, Struct, UndefinedOr } from "effect"
import { TestSchema } from "effect/testing"
import { describe, it } from "vitest"
import { assertFalse, assertTrue, deepStrictEqual, strictEqual } from "./utils/assert.ts"

const equals = TestSchema.Asserts.ast.fields.equals

describe("Struct", () => {
  it("get", () => {
    strictEqual(pipe({ a: "a", b: 1 }, Struct.get("a")), "a")
    strictEqual(pipe({ a: "a", b: 1 }, Struct.get("b")), 1)

    strictEqual(Struct.get({ a: "a", b: 1 }, "a"), "a")
    strictEqual(Struct.get({ a: "a", b: 1 }, "b"), 1)
  })

  it("keys", () => {
    const aSym = Symbol.for("a")
    deepStrictEqual(pipe({ a: 1, b: 2, [aSym]: 3 }, Struct.keys), ["a", "b"])
    deepStrictEqual(Struct.keys({ a: 1, b: 2, [aSym]: 3 }), ["a", "b"])
  })

  describe("pick", () => {
    it("defined properties", () => {
      const s: { a: string; b: number; c: boolean } = { a: "a", b: 1, c: true }
      deepStrictEqual(pipe(s, Struct.pick(["a", "b"])), { a: "a", b: 1 })
      deepStrictEqual(Struct.pick(s, ["a", "b"]), { a: "a", b: 1 })
    })

    it("omitted properties", () => {
      const s: { a?: string; b?: number; c?: boolean } = { b: 1, c: true }
      deepStrictEqual(pipe(s, Struct.pick(["a", "b"])), { b: 1 })
      deepStrictEqual(Struct.pick(s, ["a", "b"]), { b: 1 })
    })

    it("numeric properties", () => {
      const s: { 1: string; 2: number } = { 1: "a", 2: 1 }
      deepStrictEqual(pipe(s, Struct.pick([1])), { 1: "a" })
      deepStrictEqual(Struct.pick(s, [1]), { 1: "a" })
    })
  })

  describe("omit", () => {
    it("defined properties", () => {
      const s: { a: string; b: number; c: boolean } = { a: "a", b: 1, c: true }
      deepStrictEqual(pipe(s, Struct.omit(["c"])), { a: "a", b: 1 })
      deepStrictEqual(Struct.omit(s, ["c"]), { a: "a", b: 1 })
    })

    it("omitted properties", () => {
      const s: { a?: string; b?: number; c?: boolean } = { b: 1, c: true }
      deepStrictEqual(pipe(s, Struct.omit(["c"])), { b: 1 })
      deepStrictEqual(Struct.omit(s, ["c"]), { b: 1 })
    })

    it("numeric properties", () => {
      const s: { 1: string; 2: number } = { 1: "a", 2: 1 }
      deepStrictEqual(pipe(s, Struct.omit([2])), { 1: "a" })
      deepStrictEqual(Struct.omit(s, [2]), { 1: "a" })
    })

    it("ignores non-enumerable properties", () => {
      const hidden = Symbol.for("hidden")
      const s = { a: "a" }
      Object.defineProperty(s, "b", { value: 1, enumerable: false })
      Object.defineProperty(s, hidden, { value: true, enumerable: false })

      deepStrictEqual(Struct.omit(s, []), { a: "a" })
    })
  })

  describe("evolve", () => {
    it("partial required fields", () => {
      const s = { a: "a", b: 1 }
      deepStrictEqual(pipe(s, Struct.evolve({ a: (s) => s.length })), { a: 1, b: 1 })
      deepStrictEqual(Struct.evolve(s, { a: (s) => s.length }), { a: 1, b: 1 })
    })

    it("all required fields", () => {
      const s = { a: "a", b: 1 }
      deepStrictEqual(pipe(s, Struct.evolve({ a: (s) => s.length, b: (b) => b > 0 })), { a: 1, b: true })
      deepStrictEqual(Struct.evolve(s, { a: (s) => s.length, b: (b) => b > 0 }), { a: 1, b: true })
    })
  })

  it("evolveKeys", () => {
    deepStrictEqual(pipe({ a: "a", b: 2 }, Struct.evolveKeys({ a: (k) => Str.toUpperCase(k) })), { A: "a", b: 2 })
    deepStrictEqual(Struct.evolveKeys({ a: "a", b: 2 }, { a: (k) => Str.toUpperCase(k) }), { A: "a", b: 2 })
  })

  it("renameKeys", () => {
    deepStrictEqual(pipe({ a: "a", b: 1, c: true }, Struct.renameKeys({ a: "A", b: "B" })), { A: "a", B: 1, c: true })
    deepStrictEqual(Struct.renameKeys({ a: "a", b: 1, c: true }, { a: "A", b: "B" }), { A: "a", B: 1, c: true })

    const from = Symbol.for("from")
    const to = Symbol.for("to")
    deepStrictEqual(pipe({ [from]: "a", b: 1 }, Struct.renameKeys({ [from]: to })), { [to]: "a", b: 1 })
    deepStrictEqual(Struct.renameKeys({ a: "a", b: 1 }, { a: to }), { [to]: "a", b: 1 })
  })

  it("evolveEntries transforms a selected key and value together", () => {
    deepStrictEqual(
      pipe({ a: "a", b: 2 }, Struct.evolveEntries({ a: (k, v) => [Str.toUpperCase(k), v.length] })),
      { A: 1, b: 2 }
    )
    deepStrictEqual(Struct.evolveEntries({ a: "a", b: 2 }, { a: (k, v) => [Str.toUpperCase(k), v.length] }), {
      A: 1,
      b: 2
    })
  })

  it("map", () => {
    equals(pipe({ a: Schema.String, b: Schema.Number }, Struct.map(Schema.NullOr)), {
      a: Schema.NullOr(Schema.String),
      b: Schema.NullOr(Schema.Number)
    })
    equals(Struct.map({ a: Schema.String, b: Schema.Number }, Schema.NullOr), {
      a: Schema.NullOr(Schema.String),
      b: Schema.NullOr(Schema.Number)
    })
  })

  it("mapPick", () => {
    equals(
      pipe({ a: Schema.String, b: Schema.Number }, Struct.mapPick(["a"], Schema.NullOr)),
      {
        a: Schema.NullOr(Schema.String),
        b: Schema.Number
      }
    )
    equals(
      Struct.mapPick({ a: Schema.String, b: Schema.Number }, ["a"], Schema.NullOr),
      {
        a: Schema.NullOr(Schema.String),
        b: Schema.Number
      }
    )
  })

  it("mapPick numeric properties", () => {
    equals(
      Struct.mapPick({ 1: Schema.String, 2: Schema.Number }, [1], Schema.NullOr),
      {
        1: Schema.NullOr(Schema.String),
        2: Schema.Number
      }
    )
  })

  it("mapOmit", () => {
    equals(
      pipe({ a: Schema.String, b: Schema.Number }, Struct.mapOmit(["b"], Schema.NullOr)),
      {
        a: Schema.NullOr(Schema.String),
        b: Schema.Number
      }
    )
    equals(
      Struct.mapOmit({ a: Schema.String, b: Schema.Number }, ["b"], Schema.NullOr),
      {
        a: Schema.NullOr(Schema.String),
        b: Schema.Number
      }
    )
  })

  it("mapOmit numeric properties", () => {
    equals(
      Struct.mapOmit({ 1: Schema.String, 2: Schema.Number }, [2], Schema.NullOr),
      {
        1: Schema.NullOr(Schema.String),
        2: Schema.Number
      }
    )
  })

  it("makeEquivalence compares structs by configured fields", () => {
    const PersonEquivalence = Struct.makeEquivalence({
      a: Equivalence.strictEqual<string>(),
      b: Equivalence.strictEqual<number>()
    })

    assertTrue(PersonEquivalence({ a: "a", b: 1 }, { a: "a", b: 1 }))
    assertFalse(PersonEquivalence({ a: "a", b: 1 }, { a: "a", b: 2 }))
  })

  describe("makeCombiner", () => {
    it("default omitKeyWhen (never omit)", () => {
      const C = Struct.makeCombiner({
        n: Number.ReducerSum,
        s: String.ReducerConcat
      })

      deepStrictEqual(C.combine({ n: 1, s: "a" }, { n: 2, s: "b" }), { n: 3, s: "ab" })
    })

    it("custom omitKeyWhen", () => {
      const C = Struct.makeCombiner<{ n?: number | undefined; s?: string | undefined }>(
        {
          n: UndefinedOr.makeReducer(Number.ReducerSum),
          s: UndefinedOr.makeReducer(String.ReducerConcat)
        },
        { omitKeyWhen: (v) => v === undefined }
      )

      // merged values equal to undefined should be omitted
      deepStrictEqual(C.combine({ n: undefined, s: "a" }, { n: undefined, s: "b" }), { s: "ab" })
      deepStrictEqual(C.combine({ s: undefined }, { s: "b" }), { s: "b" })
      deepStrictEqual(C.combine({ s: "a" }, { s: undefined }), { s: "a" })
      deepStrictEqual(C.combine({ s: "a" }, { s: "b" }), { s: "ab" })
    })
  })

  describe("Record", () => {
    it("string keys", () => {
      deepStrictEqual(Struct.Record(["a", "b"], "value"), { a: "value", b: "value" })
    })

    it("symbol keys", () => {
      const s1 = Symbol.for("s1")
      const s2 = Symbol.for("s2")
      deepStrictEqual(Struct.Record([s1, s2], 42), { [s1]: 42, [s2]: 42 })
    })

    it("mixed keys", () => {
      const sym = Symbol.for("sym")
      deepStrictEqual(Struct.Record(["a", sym], true), { a: true, [sym]: true })
    })

    it("empty keys", () => {
      deepStrictEqual(Struct.Record([], "value"), {})
    })
  })

  describe("makeReducer", () => {
    it("custom omitKeyWhen", () => {
      const R = Struct.makeReducer<{ n: number; s?: string | undefined }>(
        {
          n: Number.ReducerSum,
          s: UndefinedOr.makeReducer(String.ReducerConcat)
        },
        { omitKeyWhen: (v) => v === undefined }
      )

      deepStrictEqual(R.initialValue, { n: 0 })
    })
  })
})
