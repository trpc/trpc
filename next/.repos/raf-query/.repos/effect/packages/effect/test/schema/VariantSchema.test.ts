import { assert, describe, it } from "@effect/vitest"
import { DateTime, Effect, Schema } from "effect"
import { Model, VariantSchema } from "effect/schema"

describe("VariantSchema", () => {
  it("FieldOnly and FieldExcept select fields from key arrays", () => {
    const Test = VariantSchema.make({
      variants: ["a", "b", "c"],
      defaultVariant: "a"
    })
    const struct = Test.Struct({
      common: Schema.String,
      onlyB: Test.FieldOnly(["b"])(Schema.Number),
      exceptC: Test.FieldExcept(["c"])(Schema.Boolean)
    })

    assert.deepStrictEqual(Object.keys(Test.extract(struct, "a").fields), ["common", "exceptC"])
    assert.deepStrictEqual(Object.keys(Test.extract(struct, "b").fields), ["common", "onlyB", "exceptC"])
    assert.deepStrictEqual(Object.keys(Test.extract(struct, "c").fields), ["common"])
  })

  it("Class preserves class and variant schema behavior", () => {
    const Test = VariantSchema.make({
      variants: ["a", "b"],
      defaultVariant: "a"
    })
    class User extends Test.Class<User>("User")({
      id: Test.FieldOnly(["a"])(Schema.Number),
      name: Schema.String
    }) {}

    const user = User.make({ id: 1, name: "Alice" })

    assert.isTrue(user instanceof User)
    assert.deepStrictEqual(user, new User({ id: 1, name: "Alice" }))
    assert.deepStrictEqual(Schema.decodeSync(User)({ id: 1, name: "Alice" }), user)
    assert.deepStrictEqual(Schema.decodeSync(User.b)({ name: "Alice" }), { name: "Alice" })
    assert.deepStrictEqual(Object.keys(User.fields), ["id", "name"])
  })

  it("includes plain variant structs in the default union", () => {
    const Test = VariantSchema.make({ variants: ["a", "b"], defaultVariant: "a" })
    const first = Test.Struct({ value: Schema.String })
    const second = Test.Struct({ value: Schema.Number })
    const union = Test.Union([first, second])

    assert.strictEqual(union.members.length, 2)
    assert.deepStrictEqual(Schema.decodeUnknownSync(union)({ value: "foo" }), { value: "foo" })
    assert.deepStrictEqual(Schema.decodeUnknownSync(union)({ value: 42 }), { value: 42 })
  })

  it("omits undefined fields accepted by VariantSchema.Struct", () => {
    const Test = VariantSchema.make({ variants: ["a"], defaultVariant: "a" })
    const struct = Test.Struct({ value: Schema.String, skipped: undefined })

    assert.deepStrictEqual(Object.keys(Test.extract(struct, "a").fields), ["value"])
  })

  it("omits undefined fields selected by VariantSchema.Field", () => {
    const Test = VariantSchema.make({ variants: ["a"], defaultVariant: "a" })
    const struct = Test.Struct({ value: Schema.String, skipped: Test.Field({ a: undefined }) })

    assert.deepStrictEqual(Object.keys(Test.extract(struct, "a").fields), ["value"])
  })

  it("does not collide the __default variant with the default-schema cache entry", () => {
    const Test = VariantSchema.make({ variants: ["a", "__default"], defaultVariant: "a" })
    const defaultFirst = Test.Struct({
      value: Test.Field({ a: Schema.String, __default: Schema.Number })
    })

    Test.extract(defaultFirst, "a")

    assert.strictEqual(Test.extract(defaultFirst, "__default").fields.value, Schema.Number)

    const namedFirst = Test.Struct({
      value: Test.Field({ a: Schema.String, __default: Schema.Number })
    })

    Test.extract(namedFirst, "__default")

    assert.strictEqual(Test.extract(namedFirst, "a").fields.value, Schema.String)
  })
})

describe("Model", () => {
  it("preserves classes when extracting the default variant", () => {
    class Person extends Model.Class<Person>("Person")({
      name: Schema.String
    }) {}

    const person = Schema.decodeSync(Model.extract(Person, "select"))({ name: "Alex" })

    assert.isTrue(person instanceof Person)
  })

  it("FieldOption preserves omitted variants", () => {
    const field = Model.FieldOption(Model.Field({ select: Schema.String, json: undefined }))
    assert.strictEqual(field.schemas.json, undefined)
  })

  it("FieldOnly includes fields only in listed variants", () => {
    const InsertOnly = Model.Struct({
      value: Model.FieldOnly(["insert"])(Schema.String)
    })

    assert.deepStrictEqual(Object.keys(Model.extract(InsertOnly, "insert").fields), ["value"])
    assert.deepStrictEqual(Object.keys(Model.extract(InsertOnly, "select").fields), [])
  })

  it("BooleanSqlite encodes database bits and JSON booleans across variants", () => {
    const User = Model.Struct({
      active: Model.BooleanSqlite
    })

    const select = Model.extract(User, "select")
    const json = Model.extract(User, "json")
    const encodeSelect = Schema.encodeSync(select)
    const decodeSelect = Schema.decodeSync(select)
    const encodeJson = Schema.encodeSync(json)
    const decodeJson = Schema.decodeSync(json)

    assert.deepStrictEqual(encodeSelect({ active: true }), { active: 1 })
    assert.deepStrictEqual(decodeSelect({ active: 0 }), { active: false })
    assert.deepStrictEqual(encodeJson({ active: true }), { active: true })
    assert.deepStrictEqual(decodeJson({ active: false }), { active: false })
  })

  it.effect("Overrideable defaults are constructor-only and accept explicit overrides", () =>
    Effect.gen(function*() {
      const User = Model.Struct({
        createdAt: Model.DateTimeInsertFromNumber
      })

      const insert = Model.extract(User, "insert")

      const now = yield* DateTime.now
      const user = yield* insert.makeEffect({})
      assert.deepStrictEqual(user.createdAt, now)

      yield* Schema.encodeEffect(insert)({
        createdAt: Model.Override(now)
      })

      const error = yield* Schema.decodeUnknownEffect(insert)({}).pipe(
        Effect.flip
      )
      assert.include(error.message, "createdAt")
    }))
})
