import { assert, describe, it } from "@effect/vitest"
import { type JsonSchema, Schema } from "effect"
import { toCodecAnthropic } from "effect/ai/AnthropicStructuredOutput"
import * as Tool from "effect/ai/Tool"
import { TestSchema } from "effect/testing"

function assertJsonSchema(schema: Schema.Constraint, expected: JsonSchema.JsonSchema) {
  assert.deepStrictEqual(toCodecAnthropic(schema).jsonSchema, expected)
}

function assertError(schema: Schema.Constraint, message: string) {
  assert.throws(() => toCodecAnthropic(schema), message)
}

describe("toCodecAnthropic", () => {
  describe("Canonical JSON and mechanical invariants", () => {
    it("encodes Undefined as null", () => {
      assertJsonSchema(Schema.Undefined, { type: "null" })
    })

    it("encodes a bigint Literal as a string", () => {
      assertJsonSchema(Schema.Literal(1n), { type: "string", enum: ["1"] })
    })

    describe("Arrays", () => {
      it("encodes post-rest elements as object properties", () => {
        assertJsonSchema(
          Schema.TupleWithRest(Schema.Tuple([]), [Schema.String, Schema.String]),
          {
            type: "object",
            properties: {
              __rest__: { type: "array", items: { type: "string" } },
              __tail_0__: { type: "string" }
            },
            required: ["__rest__", "__tail_0__"],
            additionalProperties: false,
            description:
              "Tuple encoded as an object with numeric string keys ('0', '1', ...). If present, '__rest__' contains remaining elements. Post-rest elements use '__tail_0__', '__tail_1__', and so on"
          }
        )
      })
    })

    describe("Objects", () => {
      it("non-string property signature name", () => {
        assertError(
          Schema.Struct({ [Symbol.for("effect/Schema/test/a")]: Schema.String }),
          "Objects property names must be strings"
        )
      })
    })

    it("non-recursive Suspend", () => {
      assertJsonSchema(Schema.suspend(() => Schema.String), { type: "string" })
    })

    it("rejects recursive Suspend", () => {
      interface A {
        readonly a: string
        readonly as: ReadonlyArray<A>
      }
      const schema = Schema.Struct({
        a: Schema.String.check(Schema.isStartingWith("a")),
        as: Schema.Array(Schema.suspend((): Schema.Codec<A> => schema))
      })
      assertError(schema, "AnthropicStructuredOutput: Recursive schemas are not supported")
    })
  })

  it("Null", () => {
    assertJsonSchema(Schema.Null, {
      "type": "null"
    })
  })

  describe("String", () => {
    it("String", () => {
      assertJsonSchema(Schema.String, {
        "type": "string"
      })
      assertJsonSchema(Schema.String.annotate({ description: "description" }), {
        "type": "string",
        "description": "description"
      })
    })

    it("String + supported format", () => {
      assertJsonSchema(Schema.String.annotate({ format: "date-time" }), {
        "type": "string",
        "format": "date-time"
      })
    })

    it("String + unsupported format", () => {
      assertJsonSchema(Schema.String.annotate({ format: "int32" }), {
        "type": "string",
        "description": "a value with a format of int32"
      })
    })

    it("String + isMinLength", () => {
      assertJsonSchema(Schema.String.check(Schema.isMinLength(1)), {
        "type": "string",
        "description": "a value with a length of at least 1"
      })
    })

    it("String + isMinLength + isMaxLength", () => {
      assertJsonSchema(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(2)), {
        "type": "string",
        "description": "a value with a length of at least 1 and a value with a length of at most 2"
      })
    })

    it("String + startsWith", () => {
      assertJsonSchema(Schema.String.check(Schema.isStartingWith("a")), {
        "type": "string",
        "description": `a string starting with "a"`,
        "pattern": "^a"
      })
    })

    it("String + startsWith + endsWith", () => {
      assertJsonSchema(Schema.String.check(Schema.isStartingWith("a"), Schema.isEndingWith("b")), {
        "type": "string",
        "description": `a string starting with "a" and a string ending with "b"`,
        "pattern": "^a",
        "allOf": [
          { "pattern": "b$" }
        ]
      })
    })

    it("String + pattern", () => {
      assertJsonSchema(Schema.String.check(Schema.isPattern(/^a/u)), {
        "type": "string",
        "description": `a string matching the RegExp ^a`,
        "pattern": "^a"
      })
    })

    it("String + pattern + description", () => {
      assertJsonSchema(Schema.String.check(Schema.isPattern(/^a/u, { description: "description" })), {
        "type": "string",
        "description": "description",
        "pattern": "^a"
      })
    })
  })

  describe("Number", () => {
    it("Number", () => {
      assertJsonSchema(Schema.Number, {
        "anyOf": [
          { "type": "number" },
          { "type": "string", "enum": ["Infinity", "-Infinity", "NaN"] }
        ]
      })
    })

    describe("Finite", () => {
      it("Finite", () => {
        assertJsonSchema(Schema.Finite, {
          "type": "number"
        })
        assertJsonSchema(Schema.Finite.annotate({ description: "description" }), {
          "type": "number",
          "description": "description"
        })
      })

      it("Finite + string format", () => {
        assertJsonSchema(Schema.Finite.annotate({ format: "duration" }), {
          "type": "number",
          "description": "a value with a format of duration"
        })
      })

      it("Finite + unsupported format", () => {
        assertJsonSchema(Schema.Finite.annotate({ format: "int32" }), {
          "type": "number",
          "description": "a value with a format of int32"
        })
      })

      it("Finite + isGreaterThan", () => {
        assertJsonSchema(Schema.Finite.check(Schema.isGreaterThan(1)), {
          "type": "number",
          "description": "a value greater than 1"
        })
      })

      it("Finite + isGreaterThan + isLessThan", () => {
        assertJsonSchema(Schema.Finite.check(Schema.isGreaterThan(1), Schema.isLessThan(2)), {
          "type": "number",
          "description": "a value greater than 1 and a value less than 2"
        })
      })
    })

    describe("Int", () => {
      it("Int", () => {
        assertJsonSchema(Schema.Int, {
          "type": "integer"
        })
        assertJsonSchema(Schema.Int.annotate({ description: "description" }), {
          "type": "integer",
          "description": "description"
        })
      })

      it("Int + string format", () => {
        assertJsonSchema(Schema.Int.annotate({ format: "duration" }), {
          "type": "integer",
          "description": "a value with a format of duration"
        })
      })

      it("Int + unsupported format", () => {
        assertJsonSchema(Schema.Int.annotate({ format: "int32" }), {
          "type": "integer",
          "description": "a value with a format of int32"
        })
      })

      it("Int + isGreaterThan", () => {
        assertJsonSchema(Schema.Int.check(Schema.isGreaterThan(1)), {
          "type": "integer",
          "description": "a value greater than 1"
        })
      })

      it("Int + isGreaterThan + isLessThan", () => {
        assertJsonSchema(Schema.Int.check(Schema.isGreaterThan(1), Schema.isLessThan(2)), {
          "type": "integer",
          "description": "a value greater than 1 and a value less than 2"
        })
      })
    })
  })

  describe("Literal", () => {
    it("Literal(string)", () => {
      assertJsonSchema(Schema.Literal("a"), {
        "type": "string",
        "enum": ["a"]
      })
    })

    it("Literal(number)", () => {
      assertJsonSchema(Schema.Literal(1), {
        "type": "number",
        "enum": [1]
      })
    })

    it("Literal(boolean)", () => {
      assertJsonSchema(Schema.Literal(true), {
        "type": "boolean",
        "enum": [true]
      })
    })
  })

  describe("Union", () => {
    it("oneOf", () => {
      assertJsonSchema(Schema.Union([Schema.String, Schema.Finite], { mode: "oneOf" }), {
        "anyOf": [
          { "type": "string" },
          { "type": "number" }
        ]
      })
    })

    it("Union(NonEmptyString, Int)", () => {
      assertJsonSchema(Schema.Union([Schema.NonEmptyString, Schema.Int]), {
        "anyOf": [
          { "type": "string", "description": "a value with a length of at least 1" },
          { "type": "integer" }
        ]
      })
    })
  })

  describe("Array", () => {
    it("Array(String)", () => {
      assertJsonSchema(Schema.Array(Schema.String), {
        "type": "array",
        "items": { "type": "string" }
      })
      assertJsonSchema(Schema.Array(Schema.String).annotate({ description: "description" }), {
        "type": "array",
        "items": { "type": "string" },
        "description": "description"
      })
    })

    it("Array(String) + isMinLength", () => {
      assertJsonSchema(Schema.Array(Schema.String).check(Schema.isMinLength(1)), {
        "type": "array",
        "items": { "type": "string" },
        "description": "a value with a length of at least 1"
      })
    })

    it("Array(String) + isMinLength + isMaxLength", () => {
      assertJsonSchema(Schema.Array(Schema.String).check(Schema.isMinLength(1), Schema.isMaxLength(2)), {
        "type": "array",
        "items": { "type": "string" },
        "description": "a value with a length of at least 1 and a value with a length of at most 2"
      })
    })
  })

  describe("Tuple", () => {
    it("Tuple([])", () => {
      assertJsonSchema(Schema.Tuple([]), {
        "type": "array",
        "items": false
      })
    })

    it("Tuple([String, Finite])", async () => {
      const schema = Schema.Tuple([Schema.String, Schema.Finite])
      assertJsonSchema(schema, {
        "type": "object",
        "description":
          "Tuple encoded as an object with numeric string keys ('0', '1', ...). If present, '__rest__' contains remaining elements",
        "properties": {
          "0": { "type": "string" },
          "1": { "type": "number" }
        },
        "required": ["0", "1"],
        "additionalProperties": false
      })

      const codec = toCodecAnthropic(schema).codec
      const asserts = new TestSchema.Asserts(codec)

      const encoding = asserts.encoding()
      await encoding.succeed(["a", 1], { "0": "a", "1": 1 })

      const decoding = asserts.decoding()
      await decoding.succeed({ "0": "a", "1": 1 }, ["a", 1])
    })

    it("Tuple([String, Finite]) + description", () => {
      const schema = Schema.Tuple([Schema.String, Schema.Finite]).annotate({ description: "description" })
      assertJsonSchema(schema, {
        "type": "object",
        "description":
          "Tuple encoded as an object with numeric string keys ('0', '1', ...). If present, '__rest__' contains remaining elements; description",
        "properties": {
          "0": { "type": "string" },
          "1": { "type": "number" }
        },
        "required": ["0", "1"],
        "additionalProperties": false
      })
    })

    it("Tuple([String, Finite?])", async () => {
      const schema = Schema.Tuple([Schema.String, Schema.optionalKey(Schema.Finite)])
      assertJsonSchema(schema, {
        "type": "object",
        "description":
          "Tuple encoded as an object with numeric string keys ('0', '1', ...). If present, '__rest__' contains remaining elements",
        "properties": {
          "0": { "type": "string" },
          "1": {
            "anyOf": [
              { "type": "number" },
              { "type": "null" }
            ]
          }
        },
        "required": ["0", "1"],
        "additionalProperties": false
      })

      const codec = toCodecAnthropic(schema).codec
      const asserts = new TestSchema.Asserts(codec)

      const encoding = asserts.encoding()
      await encoding.succeed(["a", 1], { "0": "a", "1": 1 })
      await encoding.succeed(["a"], { "0": "a", "1": null })

      const decoding = asserts.decoding()
      await decoding.succeed({ "0": "a", "1": 1 }, ["a", 1])
      await decoding.succeed({ "0": "a", "1": null }, ["a"])
    })
  })

  describe("TupleWithRest", () => {
    it("TupleWithRest([String, Finite], Boolean)", async () => {
      const schema = Schema.TupleWithRest(
        Schema.Tuple([Schema.String, Schema.Finite]),
        [Schema.Boolean]
      )
      assertJsonSchema(schema, {
        "type": "object",
        "description":
          "Tuple encoded as an object with numeric string keys ('0', '1', ...). If present, '__rest__' contains remaining elements",
        "properties": {
          "0": { "type": "string" },
          "1": { "type": "number" },
          "__rest__": { "type": "array", "items": { "type": "boolean" } }
        },
        "required": ["0", "1", "__rest__"],
        "additionalProperties": false
      })
      const codec = toCodecAnthropic(schema).codec
      const asserts = new TestSchema.Asserts(codec)

      const encoding = asserts.encoding()
      await encoding.succeed(["a", 1], { "0": "a", "1": 1, "__rest__": [] })
      await encoding.succeed(["a", 1, true], { "0": "a", "1": 1, "__rest__": [true] })
      await encoding.succeed(["a", 1, true, false], { "0": "a", "1": 1, "__rest__": [true, false] })

      const decoding = asserts.decoding()
      await decoding.succeed({ "0": "a", "1": 1, "__rest__": [] }, ["a", 1])
      await decoding.succeed({ "0": "a", "1": 1, "__rest__": [true] }, ["a", 1, true])
      await decoding.succeed({ "0": "a", "1": 1, "__rest__": [true, false] }, ["a", 1, true, false])
    })
  })

  describe("Struct", () => {
    it("required properties", () => {
      assertJsonSchema(Schema.Struct({ a: Schema.String }), {
        "type": "object",
        "properties": {
          "a": { "type": "string" }
        },
        "required": ["a"],
        "additionalProperties": false
      })
    })

    it("optional properties", async () => {
      const schema = Schema.Struct({
        a: Schema.String,
        b: Schema.optionalKey(Schema.Finite)
      })
      assertJsonSchema(
        schema,
        {
          "type": "object",
          "properties": {
            "a": { "type": "string" },
            "b": {
              "anyOf": [
                { "type": "number" },
                { "type": "null" }
              ]
            }
          },
          "required": ["a", "b"],
          "additionalProperties": false
        }
      )
      const codec = toCodecAnthropic(schema).codec
      const asserts = new TestSchema.Asserts(codec)

      const encoding = asserts.encoding()
      await encoding.succeed({ a: "a", b: 1 })
      await encoding.succeed({ a: "a" }, { a: "a", b: null })

      const decoding = asserts.decoding()
      await decoding.succeed({ "a": "a", "b": 1 })
      await decoding.succeed({ "a": "a", "b": null }, { a: "a" })
    })
  })

  it("Class", () => {
    class Person extends Schema.Class<Person>("Person")({
      name: Schema.String
    }) {}

    assertJsonSchema(Person, {
      "type": "object",
      "properties": {
        "name": { "type": "string" }
      },
      "required": ["name"],
      "additionalProperties": false,
      "$defs": {
        "PersonEncoded": {
          "type": "object",
          "properties": {
            "name": { "type": "string" }
          },
          "required": ["name"],
          "additionalProperties": false
        }
      }
    })
  })

  describe("Record", () => {
    it("EmptyParams", () => {
      assertJsonSchema(Tool.EmptyParams, {
        "type": "object",
        "additionalProperties": false
      })
      assertJsonSchema(Schema.Record(Schema.String, Schema.Never), {
        "type": "object",
        "additionalProperties": false
      })
    })

    it("Record(String, Finite)", async () => {
      const schema = Schema.Record(Schema.String, Schema.Finite)
      assertJsonSchema(schema, {
        "type": "array",
        "description": "Object encoded as array of [key, value] pairs. Apply object constraints to the decoded object",
        "items": {
          "type": "object",
          "description":
            "Tuple encoded as an object with numeric string keys ('0', '1', ...). If present, '__rest__' contains remaining elements",
          "properties": {
            "0": { "type": "string" },
            "1": { "type": "number" }
          },
          "required": ["0", "1"],
          "additionalProperties": false
        }
      })
      const codec = toCodecAnthropic(schema).codec
      const asserts = new TestSchema.Asserts(codec)

      const encoding = asserts.encoding()
      await encoding.succeed({ "a": 1, "b": 2 }, [{ 0: "a", 1: 1 }, { 0: "b", 1: 2 }])

      const decoding = asserts.decoding()
      await decoding.succeed([{ 0: "a", 1: 1 }, { 0: "b", 1: 2 }], { "a": 1, "b": 2 })
    })

    it("Record with properties and an index signature", async () => {
      const schema = Schema.Record(
        Schema.Union([Schema.Literal("fixed"), Schema.String]),
        Schema.String
      )
      const result = toCodecAnthropic(schema)
      assert.deepStrictEqual(result.jsonSchema, {
        type: "array",
        description: "Object encoded as array of [key, value] pairs. Apply object constraints to the decoded object",
        items: {
          type: "object",
          description:
            "Tuple encoded as an object with numeric string keys ('0', '1', ...). If present, '__rest__' contains remaining elements",
          properties: {
            "0": {
              anyOf: [
                { type: "string", enum: ["fixed"] },
                { type: "string" }
              ]
            },
            "1": { type: "string" }
          },
          required: ["0", "1"],
          additionalProperties: false
        }
      })

      const asserts = new TestSchema.Asserts(result.codec)
      await asserts.encoding().succeed(
        { fixed: "required", dynamic: "value" },
        [{ 0: "fixed", 1: "required" }, { 0: "dynamic", 1: "value" }]
      )
      await asserts.decoding().succeed(
        [{ 0: "fixed", 1: "required" }, { 0: "dynamic", 1: "value" }],
        { fixed: "required", dynamic: "value" }
      )
      assert.strictEqual(
        Schema.decodeUnknownExit(result.codec)([{ 0: "dynamic", 1: "value" }])._tag,
        "Failure"
      )
    })

    it("Record(String, Finite) + description", () => {
      const schema = Schema.Record(Schema.String, Schema.Finite).annotate({ description: "description" })
      assertJsonSchema(schema, {
        "type": "array",
        "description":
          "Object encoded as array of [key, value] pairs. Apply object constraints to the decoded object; description",
        "items": {
          "type": "object",
          "description":
            "Tuple encoded as an object with numeric string keys ('0', '1', ...). If present, '__rest__' contains remaining elements",
          "properties": {
            "0": { "type": "string" },
            "1": { "type": "number" }
          },
          "required": ["0", "1"],
          "additionalProperties": false
        }
      })
    })

    it("Record(String, Finite) + isMinProperties", async () => {
      const schema = Schema.Record(Schema.String, Schema.Finite).check(Schema.isMinProperties(2))
      const result = toCodecAnthropic(schema)
      assert.deepStrictEqual(result.jsonSchema, {
        "type": "array",
        "description":
          "Object encoded as array of [key, value] pairs. Apply object constraints to the decoded object; a value with at least 2 entries",
        "items": {
          "type": "object",
          "description":
            "Tuple encoded as an object with numeric string keys ('0', '1', ...). If present, '__rest__' contains remaining elements",
          "properties": {
            "0": { "type": "string" },
            "1": { "type": "number" }
          },
          "required": ["0", "1"],
          "additionalProperties": false
        }
      })
      await new TestSchema.Asserts(result.codec).decoding().fail(
        [{ 0: "a", 1: 1 }, { 0: "a", 1: 2 }],
        `Expected a value with at least 2 entries`
      )
    })

    it("Record(String, Finite) + isMinProperties + description", () => {
      const schema = Schema.Record(Schema.String, Schema.Finite).check(
        Schema.isMinProperties(2, { description: "description" })
      )
      assertJsonSchema(schema, {
        "type": "array",
        "description":
          "Object encoded as array of [key, value] pairs. Apply object constraints to the decoded object; description",
        "items": {
          "type": "object",
          "description":
            "Tuple encoded as an object with numeric string keys ('0', '1', ...). If present, '__rest__' contains remaining elements",
          "properties": {
            "0": { "type": "string" },
            "1": { "type": "number" }
          },
          "required": ["0", "1"],
          "additionalProperties": false
        }
      })
    })
  })
})
