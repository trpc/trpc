import { type Brand, type DateTime, Schema } from "effect"
import { Model, VariantSchema } from "effect/schema"
import { describe, expect, it } from "tstyche"

describe("VariantSchema", () => {
  it("FieldOnly and FieldExcept take key arrays", () => {
    const Test = VariantSchema.make({
      variants: ["a", "b"],
      defaultVariant: "a"
    })

    expect(Test.FieldOnly).type.toBeCallableWith(["a"] as const)
    expect(Test.FieldExcept).type.toBeCallableWith(["b"] as const)
    expect(Test.FieldOnly).type.not.toBeCallableWith("a")
    expect(Test.FieldExcept).type.not.toBeCallableWith("b")
  })

  it("Union takes members as an array", () => {
    const Test = VariantSchema.make({
      variants: ["a", "b"],
      defaultVariant: "a"
    })
    const first = Test.Struct({
      value: Test.FieldOnly(["a", "b"])(Schema.String)
    })
    const second = Test.Struct({
      value: Test.FieldOnly(["a", "b"])(Schema.Number)
    })
    const union = Test.Union([first, second])

    expect(Test.Union).type.toBeCallableWith([first, second])
    expect(Test.Union).type.not.toBeCallableWith(first, second)
    expect<Schema.Schema.Type<typeof union>>().type.toBe<
      { readonly value: string } | { readonly value: number }
    >()
  })

  it("Class preserves constructor and variant schema types", () => {
    const Test = VariantSchema.make({
      variants: ["a", "b"],
      defaultVariant: "a"
    })
    class User extends Test.Class<User>("User")({
      id: Test.FieldOnly(["a"])(Schema.Number),
      name: Schema.String
    }) {}

    expect(User).type.toBeConstructableWith({ id: 1, name: "Alice" })
    expect(User).type.not.toBeConstructableWith({ name: "Alice" })
    expect(User.make({ id: 1, name: "Alice" })).type.toBe<User>()
    expect<Schema.Schema.Type<typeof User>>().type.toBe<User>()
    expect<Schema.Codec.Encoded<typeof User>>().type.toBe<
      { readonly id: number; readonly name: string }
    >()
    expect<Schema.Schema.Type<typeof User.a>>().type.toBe<
      { readonly id: number; readonly name: string }
    >()
    expect<Schema.Schema.Type<typeof User.b>>().type.toBe<{ readonly name: string }>()
  })
})

describe("Model", () => {
  it("re-exports array based variant APIs", () => {
    const first = Model.Struct({
      value: Schema.String
    })
    const second = Model.Struct({
      value: Schema.Number
    })

    expect(Model.FieldOnly).type.toBeCallableWith(["insert"] as const)
    expect(Model.FieldExcept).type.toBeCallableWith(["insert"] as const)
    expect(Model.Union).type.toBeCallableWith([first, second])
    expect(Model.Union).type.not.toBeCallableWith(first, second)
  })

  it("BooleanSqlite uses bit encoding for database variants", () => {
    const User = Model.Struct({
      active: Model.BooleanSqlite
    })
    const select = Model.extract(User, "select")
    const json = Model.extract(User, "json")

    expect<Schema.Codec.Encoded<typeof select>>().type.toBe<{ readonly active: 0 | 1 }>()
    expect<Schema.Codec.Encoded<typeof json>>().type.toBe<{ readonly active: boolean }>()
  })

  it("Overrideable fields are only optional for the constructor", () => {
    const User = Model.Struct({
      createdAt: Model.DateTimeInsertFromNumber
    })
    const select = Model.extract(User, "select")
    const insert = Model.extract(User, "insert")

    expect<Schema.Schema.Type<typeof select>>().type.toBe<{ readonly createdAt: DateTime.Utc }>()
    expect<Schema.Schema.Type<typeof insert>>().type.toBe<
      { readonly createdAt: DateTime.Utc & Brand.Brand<"Override"> }
    >()
    expect<Schema.Struct.MakeIn<typeof insert.fields>>().type.toBe<
      { readonly createdAt?: DateTime.Utc & Brand.Brand<"Override"> | undefined }
    >()
  })
})
