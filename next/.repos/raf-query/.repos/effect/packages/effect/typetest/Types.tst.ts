import type { Brand, DateTime, Effect, HashMap, Option, Types } from "effect"
import { describe, expect, it } from "tstyche"

describe("Types", () => {
  it("IsUnion", () => {
    expect<Types.IsUnion<string | number>>().type.toBe(true)
    expect<Types.IsUnion<string>>().type.toBe(false)
  })

  it("TupleOf", () => {
    expect<Types.TupleOf<-1, number>>()
      .type.toBe<never>()
    expect<Types.TupleOf<0, number>>()
      .type.toBe<[]>()
    expect<Types.TupleOf<3, number>>()
      .type.toBe<[number, number, number]>()
    expect<Types.TupleOf<1.5, number>>()
      .type.toBe<Array<number>>()
    expect<Types.TupleOf<-1.5, number>>()
      .type.toBe<never>()
  })

  it("TupleOfAtLeast", () => {
    expect<Types.TupleOfAtLeast<3, number>>()
      .type.toBe<[number, number, number, ...Array<number>]>()
  })

  it("UnionToIntersection", () => {
    expect<Types.UnionToIntersection<{ a: string } | { b: number }>>()
      .type.toBe<{ a: string; b: number }>()
  })

  it("Tags", () => {
    expect<Types.Tags<string | { _tag: "a" } | { _tag: "b" }> & unknown>()
      .type.toBe<"a" | "b">()
  })

  it("ExcludeTag", () => {
    expect<Types.ExcludeTag<string | { _tag: "a" } | { _tag: "b" }, "a"> & unknown>()
      .type.toBe<string | { _tag: "b" }>()
  })

  it("ExtractTag", () => {
    expect<Types.ExtractTag<string | { _tag: "a"; a: number } | { _tag: "b"; b: number }, "b"> & unknown>()
      .type.toBe<{ _tag: "b"; b: number }>()
  })

  it("Simplify", () => {
    expect<Types.Simplify<object & { a: number } & { b: number }>>()
      .type.toBe<{ a: number; b: number }>()
  })

  describe("Equals", () => {
    it("should return true for identical types", () => {
      expect<Types.Equals<{ a: number }, { a: number }>>()
        .type.toBe<true>()
    })
    it("should return false for different types", () => {
      expect<Types.Equals<{ a: number }, { b: number }>>()
        .type.toBe<false>()
    })
  })

  describe("MergeRight", () => {
    it("mutable overwrites mutable", () => {
      expect<Types.MergeRight<{ a: number; b: number }, { a: string; c: boolean }>>()
        .type.toBe<{ a: string; c: boolean; b: number }>()
    })

    it("mutable overwrites readonly", () => {
      expect<Types.MergeRight<{ readonly a: number; b: number }, { a: string; c: boolean }>>()
        .type.toBe<{ a: string; c: boolean; b: number }>()
    })

    it("readonly overwrites mutable", () => {
      expect<Types.MergeRight<{ a: number; b: number }, { readonly a: string; c: boolean }>>()
        .type.toBe<{ readonly a: string; c: boolean; b: number }>()
    })

    it("required overwrites optional", () => {
      expect<Types.MergeRight<{ a?: number; b: number }, { a: string; c: boolean }>>()
        .type.toBe<{ a: string; c: boolean; b: number }>()
    })

    it("optional overwrites optional", () => {
      expect<Types.MergeRight<{ a?: number; b: number }, { a?: string; c: boolean }>>()
        .type.toBe<{ a?: string; c: boolean; b: number }>()
    })

    it("optional overwrites required", () => {
      expect<Types.MergeRight<{ a: number; b: number }, { a?: string; c: boolean }>>()
        .type.toBe<{ a?: string; c: boolean; b: number }>()
    })

    it("readonly optional overwrites mutable required", () => {
      expect<Types.MergeRight<{ a: number; b: number }, { readonly a?: string; c: boolean }>>()
        .type.toBe<{ readonly a?: string; c: boolean; b: number }>()
    })

    it("mutable required overwrites readonly optional", () => {
      expect<Types.MergeRight<{ readonly a?: number; b: number }, { a: string; c: boolean }>>()
        .type.toBe<{ a: string; c: boolean; b: number }>()
    })

    it("optionality of non involved keys must be preserved", () => {
      expect<Types.MergeRight<{ readonly a?: number; b: number }, { readonly c?: string }>>()
        .type.toBe<{ readonly c?: string; readonly a?: number; b: number }>()
    })
  })

  describe("RequiredKeys", () => {
    it("retains named required keys with string, number and symbol indexes", () => {
      const key = Symbol()
      expect<
        Types.RequiredKeys<{ readonly a: number; optional?: number; [key: string]: number | undefined }>
      >().type.toBe<"a">()
      expect<Types.RequiredKeys<{ 0: number; [key: number]: number }>>().type.toBe<0>()
      expect<Types.RequiredKeys<{ [key]: number; [key: symbol]: number }>>().type.toBe<typeof key>()
    })

    it("excludes index signatures and optional properties", () => {
      expect<Types.RequiredKeys<Record<string, number>>>().type.toBe<never>()
      expect<Types.RequiredKeys<{ optional?: number; [key: string]: number | undefined }>>().type.toBe<never>()
    })

    it("extracts required keys without an index signature", () => {
      expect<Types.RequiredKeys<{ a: number; b?: string }>>().type.toBe<"a">()
    })

    it("retains named keys on intersections and indexed unions", () => {
      expect<Types.RequiredKeys<{ a: number } & { [key: string]: number }>>().type.toBe<"a">()
      expect<
        Types.RequiredKeys<
          | { a: number; [key: string]: number }
          | { a: number; b: string; [key: string]: unknown }
        >
      >().type.toBe<"a">()
    })

    it("preserves the mixed indexed union result", () => {
      expect<Types.RequiredKeys<{ a: number; [key: string]: number } | { b: string }>>().type.toBe<"b">()
    })

    it("preserves array and tuple behavior", () => {
      type Legacy<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? never : K }[keyof T]
      expect<Types.RequiredKeys<ReadonlyArray<number>>>().type.toBe<Legacy<ReadonlyArray<number>>>()
      expect<Types.RequiredKeys<[number, string?]>>().type.toBe<Legacy<[number, string?]>>()
    })
  })

  describe("Mutable", () => {
    it("should convert a readonly object to mutable", () => {
      expect<Types.Mutable<{ readonly a: string; readonly b: number }>>()
        .type.toBe<{ a: string; b: number }>()
    })

    it("should convert a ReadonlyArray to a mutable array", () => {
      expect<Types.Mutable<ReadonlyArray<string>>>()
        .type.toBe<Array<string>>()
    })

    it("should convert a readonly tuple to a mutable tuple", () => {
      expect<Types.Mutable<readonly [string, number]>>()
        .type.toBe<[string, number]>()
    })

    it("should convert a readonly record to a mutable record", () => {
      expect<Types.Mutable<{ readonly [x: string]: number }>>()
        .type.toBe<{ [x: string]: number }>()
    })
  })

  describe("DeepMutable", () => {
    type TaggedValues<A> = {
      readonly _tag: string
      readonly value: ReadonlyArray<A>
    }

    it("primitives and literals", () => {
      expect<
        [
          Types.DeepMutable<string>,
          Types.DeepMutable<number>,
          Types.DeepMutable<boolean>,
          Types.DeepMutable<bigint>,
          Types.DeepMutable<symbol>,
          Types.DeepMutable<never>,
          Types.DeepMutable<null>,
          Types.DeepMutable<"a">,
          Types.DeepMutable<1>,
          Types.DeepMutable<true>
        ]
      >().type.toBe<[string, number, boolean, bigint, symbol, never, null, "a", 1, true]>()
    })

    it("functions", () => {
      expect<Types.DeepMutable<(arg: 1) => 2>>().type.toBe<(arg: 1) => 2>()
    })

    it("built-in objects", () => {
      expect<
        [
          Types.DeepMutable<Date>,
          Types.DeepMutable<RegExp>,
          Types.DeepMutable<Generator>,
          Types.DeepMutable<ArrayBuffer>,
          Types.DeepMutable<URL>
        ]
      >().type.toBe<[Date, RegExp, Generator, ArrayBuffer, URL]>()
    })

    it("Effect data types", () => {
      type Value = { readonly value: string }
      expect<
        [
          Types.DeepMutable<DateTime.DateTime>,
          Types.DeepMutable<Effect.Effect<Value, Error>>,
          Types.DeepMutable<HashMap.HashMap<string, Value>>,
          Types.DeepMutable<Option.Option<Value>>
        ]
      >().type.toBe<
        [
          DateTime.DateTime,
          Effect.Effect<Value, Error>,
          HashMap.HashMap<string, Value>,
          Option.Option<Value>
        ]
      >()
    })

    it("preserves opaque values nested in structural data", () => {
      type Value = { readonly value: string }
      expect<
        Types.DeepMutable<{
          readonly dates: ReadonlyArray<DateTime.DateTime>
          readonly option: Option.Option<Value>
        }>
      >().type.toBe<{
        dates: Array<DateTime.DateTime>
        option: Option.Option<Value>
      }>()
    })

    it("preserves objects with methods or symbol-keyed properties", () => {
      const TypeId = Symbol()
      type WithMethod = {
        readonly nested: { readonly value: string }
        readonly run: () => void
      }
      type WithSymbol = {
        readonly [TypeId]: "WithSymbol"
        readonly nested: { readonly value: string }
      }
      expect<
        [Types.DeepMutable<WithMethod>, Types.DeepMutable<WithSymbol>]
      >().type.toBe<[WithMethod, WithSymbol]>()
    })

    describe("Branded", () => {
      it("should leave a string brand unchanged", () => {
        type T = string & Brand.Brand<"mybrand">
        expect<Types.DeepMutable<T>>().type.toBe<T>()
      })

      it("should leave a number brand unchanged", () => {
        type T = number & Brand.Brand<"mybrand">
        expect<Types.DeepMutable<T>>().type.toBe<T>()
      })

      it("should leave a boolean brand unchanged", () => {
        type T = boolean & Brand.Brand<"mybrand">
        expect<Types.DeepMutable<T>>().type.toBe<T>()
      })

      it("should leave a bigint brand unchanged", () => {
        type T = bigint & Brand.Brand<"mybrand">
        expect<Types.DeepMutable<T>>().type.toBe<T>()
      })

      it("should leave a symbol brand unchanged", () => {
        type T = symbol & Brand.Brand<"mybrand">
        expect<Types.DeepMutable<T>>().type.toBe<T>()
      })
    })

    describe("Index Signature", () => {
      it("should convert an readonly Index Signature to a mutable Index Signature", () => {
        expect<Types.DeepMutable<{ readonly [x: string]: number }>>()
          .type.toBe<{ [x: string]: number }>()
      })

      it("should leave an Index Signature unchanged", () => {
        expect<Types.DeepMutable<{ [_: string]: number }>>()
          .type.toBe<{ [x: string]: number }>()
      })
    })

    describe("Struct", () => {
      it("should support an empty object", () => {
        expect<Types.DeepMutable<{}>>()
          .type.toBe<{}>()
      })

      it("should deeply mutate nested structs", () => {
        expect<Types.DeepMutable<ReadonlyArray<TaggedValues<TaggedValues<TaggedValues<boolean>>>>>>()
          .type.toBe<
          Array<{
            _tag: string
            value: Array<{
              _tag: string
              value: Array<{
                _tag: string
                value: Array<boolean>
              }>
            }>
          }>
        >()
      })
    })

    describe("Array", () => {
      it("should convert a readonly empty array to a mutable empty array", () => {
        expect<Types.DeepMutable<readonly []>>()
          .type.toBe<[]>()
      })

      it("should leave a mutable empty array unchanged", () => {
        expect<Types.DeepMutable<[]>>()
          .type.toBe<[]>()
      })

      it("should convert a readonly array to a mutable array", () => {
        expect<Types.DeepMutable<ReadonlyArray<string>>>()
          .type.toBe<Array<string>>()
      })

      it("should leave a mutable array unchanged", () => {
        expect<Types.DeepMutable<Array<string>>>()
          .type.toBe<Array<string>>()
      })
    })

    describe("Tuple", () => {
      it("should convert a readonly tuple", () => {
        expect<Types.DeepMutable<readonly [string, number, boolean]>>()
          .type.toBe<[string, number, boolean]>()
      })

      it("should leave a mutable tuple unchanged", () => {
        expect<Types.DeepMutable<[string, number, boolean]>>()
          .type.toBe<[string, number, boolean]>()
      })
    })

    describe("ReadonlySet", () => {
      it("should convert a ReadonlySet to a mutable Set", () => {
        expect<Types.DeepMutable<ReadonlySet<{ readonly value: TaggedValues<number> }>>>()
          .type.toBe<Set<{ value: { _tag: string; value: Array<number> } }>>()
      })

      it("should leave a mutable Set unchanged", () => {
        expect<Types.DeepMutable<Set<{ readonly value: TaggedValues<number> }>>>()
          .type.toBe<Set<{ value: { _tag: string; value: Array<number> } }>>()
      })
    })

    describe("ReadonlyMap", () => {
      it("should convert a ReadonlyMap to a mutable Map", () => {
        expect<Types.DeepMutable<ReadonlyMap<TaggedValues<string>, ReadonlySet<TaggedValues<number>>>>>()
          .type.toBe<Map<{ _tag: string; value: Array<string> }, Set<{ _tag: string; value: Array<number> }>>>()
      })

      it("should leave a mutable Map unchanged", () => {
        expect<Types.DeepMutable<Map<TaggedValues<string>, ReadonlySet<TaggedValues<number>>>>>()
          .type.toBe<Map<{ _tag: string; value: Array<string> }, Set<{ _tag: string; value: Array<number> }>>>()
      })
    })

    describe("Union", () => {
      it("should convert a readonly union to a mutable union", () => {
        type T =
          | ReadonlySet<{ readonly value: TaggedValues<number> }>
          | ReadonlyMap<TaggedValues<string>, ReadonlySet<TaggedValues<number>>>
        expect<Types.DeepMutable<T>>()
          .type.toBe<
          | Set<{ value: { _tag: string; value: Array<number> } }>
          | Map<{ _tag: string; value: Array<string> }, Set<{ _tag: string; value: Array<number> }>>
        >()
      })

      it("should leave a mutable union unchanged", () => {
        type T =
          | ReadonlySet<{ readonly value: TaggedValues<number> }>
          | ReadonlyMap<TaggedValues<string>, ReadonlySet<TaggedValues<number>>>
        expect<Types.DeepMutable<T>>()
          .type.toBe<
          | Set<{ value: { _tag: string; value: Array<number> } }>
          | Map<{ _tag: string; value: Array<string> }, Set<{ _tag: string; value: Array<number> }>>
        >()
      })
    })
  })

  describe("ReasonOf", () => {
    it("extracts reason type from error with reason field", () => {
      type RateLimitError = { readonly _tag: "RateLimitError"; readonly retryAfter: number }
      type QuotaError = { readonly _tag: "QuotaError"; readonly limit: number }
      type AiError = { readonly _tag: "AiError"; readonly reason: RateLimitError | QuotaError }
      expect<Types.ReasonOf<AiError>>().type.toBe<RateLimitError | QuotaError>()
    })

    it("returns never for error without reason field", () => {
      type SimpleError = { readonly _tag: "SimpleError"; readonly code: number }
      expect<Types.ReasonOf<SimpleError>>().type.toBe<never>()
    })
  })

  describe("ReasonTags", () => {
    it("extracts reason tags from error", () => {
      type RateLimitError = { readonly _tag: "RateLimitError" }
      type QuotaError = { readonly _tag: "QuotaError" }
      type AiError = { readonly _tag: "AiError"; readonly reason: RateLimitError | QuotaError }
      expect<Types.ReasonTags<AiError> & unknown>().type.toBe<"RateLimitError" | "QuotaError">()
    })

    it("returns never for error without reason field", () => {
      type SimpleError = { readonly _tag: "SimpleError"; readonly code: number }
      expect<Types.ReasonTags<SimpleError>>().type.toBe<never>()
    })
  })

  describe("ExtractReason", () => {
    it("extracts specific reason variant by tag", () => {
      type RateLimitError = { readonly _tag: "RateLimitError"; readonly retryAfter: number }
      type QuotaError = { readonly _tag: "QuotaError"; readonly limit: number }
      type AiError = { readonly _tag: "AiError"; readonly reason: RateLimitError | QuotaError }
      expect<Types.ExtractReason<AiError, "RateLimitError">>().type.toBe<RateLimitError>()
    })

    it("returns never for non-matching tag", () => {
      type RateLimitError = { readonly _tag: "RateLimitError" }
      type AiError = { readonly _tag: "AiError"; readonly reason: RateLimitError }
      expect<Types.ExtractReason<AiError, "Invalid">>().type.toBe<never>()
    })
  })

  it("VoidIfEmpty", () => {
    expect<Types.VoidIfEmpty<{ a: number }>>().type.toBe<{ a: number }>()
    expect<Types.VoidIfEmpty<{ a?: number }>>().type.toBe<{ a?: number }>()
    expect<Types.VoidIfEmpty<{}>>().type.toBe<void>()
  })
})
