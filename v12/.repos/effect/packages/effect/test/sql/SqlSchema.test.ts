import { assert, describe, it } from "@effect/vitest"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as SqlSchema from "effect/sql/SqlSchema"

describe("SqlSchema", () => {
  describe("findAll", () => {
    it.effect("returns decoded results", () =>
      Effect.gen(function*() {
        const query = SqlSchema.findAll({
          Request: Schema.NumberFromString,
          Result: Schema.Struct({ value: Schema.String }),
          execute: (request) => Effect.succeed([{ value: `id:${request}` }])
        })

        const result = yield* query(1)
        assert.deepStrictEqual(result, [{ value: "id:1" }])
      }))

    it.effect("returns empty array when no rows", () =>
      Effect.gen(function*() {
        const query = SqlSchema.findAll({
          Request: Schema.String,
          Result: Schema.String,
          execute: () => Effect.succeed([])
        })

        const result = yield* query("test")
        assert.deepStrictEqual(result, [])
      }))

    it.effect("fails when a row cannot be decoded", () =>
      Effect.gen(function*() {
        const query = SqlSchema.findAll({
          Request: Schema.String,
          Result: Schema.Struct({ id: Schema.Number }),
          execute: () => Effect.succeed([{ id: "not-a-number" }])
        })

        const error = yield* Effect.flip(query("ignored"))
        assert.isTrue(Schema.isSchemaError(error))
      }))
  })

  describe("findNonEmpty", () => {
    it.effect("returns non-empty decoded results", () =>
      Effect.gen(function*() {
        const query = SqlSchema.findNonEmpty({
          Request: Schema.NumberFromString,
          Result: Schema.Struct({ value: Schema.String }),
          execute: (request) => Effect.succeed([{ value: `id:${request}` }])
        })

        const result = yield* query(1)
        assert.deepStrictEqual(result, [{ value: "id:1" }])
      }))

    it.effect("fails with NoSuchElementError when no rows", () =>
      Effect.gen(function*() {
        const query = SqlSchema.findNonEmpty({
          Request: Schema.String,
          Result: Schema.String,
          execute: () => Effect.succeed([])
        })

        const error = yield* Effect.flip(query("test"))
        assert.isTrue(Cause.isNoSuchElementError(error))
      }))
  })

  describe("void", () => {
    it.effect("encodes request and discards result", () =>
      Effect.gen(function*() {
        let captured: string | undefined
        const query = SqlSchema.void({
          Request: Schema.NumberFromString,
          execute: (request) => {
            captured = request
            return Effect.succeed(undefined)
          }
        })

        yield* query(42)
        assert.strictEqual(captured, "42")
      }))
  })

  describe("findOne", () => {
    it.effect("returns the first decoded row", () =>
      Effect.gen(function*() {
        const query = SqlSchema.findOne({
          Request: Schema.String,
          Result: Schema.NumberFromString,
          execute: () => Effect.succeed(["1", "2"])
        })

        const result = yield* query("ignored")
        assert.strictEqual(result, 1)
      }))

    it.effect("fails with NoSuchElementError when no rows are returned", () =>
      Effect.gen(function*() {
        const query = SqlSchema.findOne({
          Request: Schema.String,
          Result: Schema.String,
          execute: () => Effect.succeed([])
        })

        const error = yield* Effect.flip(query("ignored"))
        assert.isTrue(Cause.isNoSuchElementError(error))
      }))

    it.effect("fails when the first row cannot be decoded", () =>
      Effect.gen(function*() {
        const query = SqlSchema.findOne({
          Request: Schema.String,
          Result: Schema.Struct({ id: Schema.Number }),
          execute: () => Effect.succeed([{ id: "not-a-number" }])
        })

        const error = yield* Effect.flip(query("ignored"))
        assert.isTrue(Schema.isSchemaError(error))
      }))
  })

  describe("findOneOption", () => {
    it.effect("returns Option.some when a row exists", () =>
      Effect.gen(function*() {
        const query = SqlSchema.findOneOption({
          Request: Schema.NumberFromString,
          Result: Schema.Struct({ value: Schema.String }),
          execute: (request) => Effect.succeed([{ value: `id:${request}` }])
        })

        const result = yield* query(1)
        assert.isTrue(Option.isSome(result))
        if (Option.isSome(result)) {
          assert.deepStrictEqual(result.value, { value: "id:1" })
        }
      }))

    it.effect("returns Option.none when no rows are returned", () =>
      Effect.gen(function*() {
        const query = SqlSchema.findOneOption({
          Request: Schema.NumberFromString,
          Result: Schema.String,
          execute: () => Effect.succeed([])
        })

        const result = yield* query(1)
        assert.isTrue(Option.isNone(result))
      }))

    it.effect("fails when the first row cannot be decoded", () =>
      Effect.gen(function*() {
        const query = SqlSchema.findOneOption({
          Request: Schema.String,
          Result: Schema.Struct({ id: Schema.Number }),
          execute: () => Effect.succeed([{ id: "not-a-number" }])
        })

        const error = yield* Effect.flip(query("ignored"))
        assert.isTrue(Schema.isSchemaError(error))
      }))
  })
})
