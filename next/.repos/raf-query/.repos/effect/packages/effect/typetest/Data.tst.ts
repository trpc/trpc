import { Data } from "effect"
import { describe, expect, it } from "tstyche"

describe("Data", () => {
  describe("Class", () => {
    it("no fields: args is void", () => {
      class Empty extends Data.Class {}
      expect<ConstructorParameters<typeof Empty>>().type.toBe<[args?: void]>()
    })

    it("with fields: args is the fields object", () => {
      class Person extends Data.Class<{ readonly name: string; readonly age: number }> {}
      expect<ConstructorParameters<typeof Person>>().type.toBe<
        [args: { readonly name: string; readonly age: number }]
      >()
    })
  })

  describe("TaggedClass", () => {
    it("no fields: args is void", () => {
      class Empty extends Data.TaggedClass("Empty") {}
      expect<ConstructorParameters<typeof Empty>>().type.toBe<[args?: void]>()
    })

    it("with fields: args excludes _tag", () => {
      class Person extends Data.TaggedClass("Person")<{ readonly name: string }> {}
      expect<ConstructorParameters<typeof Person>>().type.toBe<
        [args: { readonly name: string }]
      >()
    })
  })

  describe("Error", () => {
    it("no fields: args is void", () => {
      class MyError extends Data.Error {}
      expect<ConstructorParameters<typeof MyError>>().type.toBe<[args?: void]>()
    })

    it("with fields: args is the fields object", () => {
      class MyError extends Data.Error<{ readonly message: string }> {}
      expect<ConstructorParameters<typeof MyError>>().type.toBe<
        [args: { readonly message: string }]
      >()
    })
  })

  describe("TaggedError", () => {
    it("no fields: args is void", () => {
      class MyError extends Data.TaggedError("MyError") {}
      expect<ConstructorParameters<typeof MyError>>().type.toBe<[args?: void]>()
    })

    it("with fields: args excludes _tag", () => {
      class MyError extends Data.TaggedError("MyError")<{ readonly reason: string }> {}
      expect<ConstructorParameters<typeof MyError>>().type.toBe<
        [args: { readonly reason: string }]
      >()
    })
  })

  describe("TaggedEnum", () => {
    it("should be able to create a tagged enum", () => {
      type TE = Data.TaggedEnum<{
        A: { readonly required: string }
        B: { readonly optional?: number }
      }>
      expect<Extract<TE, { _tag: "A" }>>().type.toBe<
        { readonly _tag: "A"; readonly required: string }
      >()
      expect<Extract<TE, { _tag: "B" }>>().type.toBe<
        { readonly _tag: "B"; readonly optional?: number }
      >()
    })

    it("should raise an error if one of the variants has a _tag property", () => {
      // @ts-expect-error It looks like you're trying to create a tagged enum, but one or more of its members already has a `_tag` property.
      type TE = Data.TaggedEnum<{
        A: { readonly _tag: "A" }
        B: { readonly b: number }
      }>
    })
  })

  describe("taggedEnum", () => {
    it("should be able to create a concrete tagged enum", () => {
      type TE = Data.TaggedEnum<{
        A: { readonly required: string }
        B: { readonly optional?: number }
      }>

      const { A, B, $is } = Data.taggedEnum<TE>()
      expect(A).type.toBe<(args: { readonly required: string }) => { readonly _tag: "A"; readonly required: string }>()
      expect(B).type.toBe<
        (args: { readonly optional?: number }) => { readonly _tag: "B"; readonly optional?: number }
      >()
      const isA = $is("A")
      expect(isA).type.toBe<
        (u: unknown) => u is { readonly _tag: "A"; readonly required: string }
      >()
      const isB = $is("B")
      expect(isB).type.toBe<
        (u: unknown) => u is { readonly _tag: "B"; readonly optional?: number }
      >()
    })

    it("should be able to create a generic tagged enum", () => {
      type TE<T> = Data.TaggedEnum<{
        A: { a: T }
        B: { b?: T }
      }>

      interface TEDefinition extends Data.TaggedEnum.WithGenerics<1> {
        readonly taggedEnum: TE<this["A"]>
      }

      const { A, B } = Data.taggedEnum<TEDefinition>()
      expect(A).type.toBe<(<A>(args: { readonly a: A }) => { readonly _tag: "A"; readonly a: A })>()
      expect(B).type.toBe<(<B>(args: { readonly b?: B }) => { readonly _tag: "B"; readonly b?: B })>()
    })
  })
})
