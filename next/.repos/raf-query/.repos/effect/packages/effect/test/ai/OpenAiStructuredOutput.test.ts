import { assert, describe, it } from "@effect/vitest"
import { type JsonSchema, Schema } from "effect"
import { toCodecOpenAI } from "effect/ai/OpenAiStructuredOutput"
import * as Tool from "effect/ai/Tool"
import { TestSchema } from "effect/testing"

function assertJsonSchema(schema: Schema.Constraint, expected: JsonSchema.JsonSchema) {
  if (expected.type === "object" && expected.anyOf === undefined) {
    assert.deepStrictEqual(toCodecOpenAI(schema).jsonSchema, expected)
    return
  }
  assert.deepStrictEqual(toCodecOpenAI(Schema.Struct({ value: schema })).jsonSchema, {
    type: "object",
    properties: { value: expected },
    required: ["value"],
    additionalProperties: false
  })
}

function assertError(schema: Schema.Constraint, message: string) {
  assert.throws(() => toCodecOpenAI(schema), message)
}

describe("toCodecOpenAI", () => {
  describe("Canonical JSON and mechanical invariants", () => {
    describe("Root", () => {
      const message = `OpenAiStructuredOutput: Root JSON Schema must have type "object" and must not use "anyOf"`

      it("rejects primitive roots", () => {
        assertError(Schema.String, message)
      })

      it("rejects array roots", () => {
        assertError(Schema.Array(Schema.String), message)
      })

      it("rejects anyOf roots", () => {
        assertError(
          Schema.Union([
            Schema.Struct({ a: Schema.String }),
            Schema.Struct({ b: Schema.String })
          ]),
          message
        )
      })

      it("rejects unconstrained roots", () => {
        assertError(Schema.Any, message)
        assertError(Schema.Unknown, message)
        assertError(Schema.Never, message)
      })
    })

    it("encodes Undefined as null", () => {
      assertJsonSchema(Schema.Undefined, { type: "null" })
    })

    it("encodes a bigint Literal as a string", () => {
      assertJsonSchema(Schema.Literal(1n), { type: "string", enum: ["1"] })
    })

    describe("Arrays", () => {
      it("encodes post-rest elements as object properties", async () => {
        const schema = Schema.TupleWithRest(Schema.Tuple([]), [Schema.String, Schema.String])
        const result = toCodecOpenAI(schema)
        assert.deepStrictEqual(result.jsonSchema, {
          type: "object",
          properties: {
            __rest__: { type: "array", items: { type: "string" } },
            __tail_0__: { type: "string" }
          },
          required: ["__rest__", "__tail_0__"],
          additionalProperties: false,
          description:
            "Tuple encoded as an object with numeric string keys ('0', '1', ...). If present, '__rest__' contains remaining elements. Post-rest elements use '__tail_0__', '__tail_1__', and so on"
        })
        const asserts = new TestSchema.Asserts(result.codec)
        await asserts.encoding().succeed(["a", "b"], { __rest__: ["a"], __tail_0__: "b" })
        await asserts.decoding().succeed({ __rest__: ["a"], __tail_0__: "b" }, ["a", "b"])
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
  })

  describe("Suspend", () => {
    it("no-transformation recursive schema", () => {
      interface A {
        readonly a: string
        readonly as: ReadonlyArray<A>
      }
      const schema = Schema.Struct({
        a: Schema.String.check(Schema.isStartingWith("a")),
        as: Schema.Array(Schema.suspend((): Schema.Codec<A> => schema))
      })
      assertJsonSchema(schema, {
        "type": "object",
        "properties": {
          "a": {
            "type": "string",
            "description": "a string starting with \"a\"",
            "pattern": "^a"
          },
          "as": {
            "type": "array",
            "items": { "$ref": "#/$defs/Suspend_" }
          }
        },
        "required": ["a", "as"],
        "additionalProperties": false,
        "$defs": {
          "Suspend_": {
            "type": "object",
            "properties": {
              "a": {
                "type": "string",
                "description": "a string starting with \"a\"",
                "pattern": "^a"
              },
              "as": {
                "type": "array",
                "items": { "$ref": "#/$defs/Suspend_" }
              }
            },
            "required": ["a", "as"],
            "additionalProperties": false
          }
        }
      })
    })

    it("transformation recursive schema", () => {
      interface A {
        readonly a: string
        readonly as: readonly [A]
      }
      const schema = Schema.Struct({
        a: Schema.String.check(Schema.isStartingWith("a")),
        as: Schema.Tuple([Schema.suspend((): Schema.Codec<A> => schema)])
      })
      assertJsonSchema(schema, {
        "type": "object",
        "properties": {
          "a": {
            "type": "string",
            "description": "a string starting with \"a\"",
            "pattern": "^a"
          },
          "as": {
            "type": "object",
            "description":
              "Tuple encoded as an object with numeric string keys ('0', '1', ...). If present, '__rest__' contains remaining elements",
            "properties": {
              "0": {
                "$ref": "#/$defs/Suspend_"
              }
            },
            "required": ["0"],
            "additionalProperties": false
          }
        },
        "required": ["a", "as"],
        "additionalProperties": false,
        "$defs": {
          "Suspend_": {
            "type": "object",
            "properties": {
              "a": {
                "type": "string",
                "description": "a string starting with \"a\"",
                "pattern": "^a"
              },
              "as": {
                "type": "object",
                "description":
                  "Tuple encoded as an object with numeric string keys ('0', '1', ...). If present, '__rest__' contains remaining elements",
                "properties": {
                  "0": {
                    "$ref": "#/$defs/Suspend_"
                  }
                },
                "required": ["0"],
                "additionalProperties": false
              }
            },
            "required": ["a", "as"],
            "additionalProperties": false
          }
        }
      })
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
        "pattern": "^(?=[\\s\\S]*?(?:^a))(?=[\\s\\S]*?(?:b$))"
      })
    })

    it("String + pattern", () => {
      assertJsonSchema(Schema.String.check(Schema.isPattern(/^a/u)), {
        "type": "string",
        "description": `a string matching the RegExp ^a`,
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
          "description": "a value greater than 1",
          "exclusiveMinimum": 1
        })
      })

      it("Finite + isGreaterThanOrEqualTo", () => {
        assertJsonSchema(Schema.Finite.check(Schema.isGreaterThanOrEqualTo(1)), {
          "type": "number",
          "description": "a value greater than or equal to 1",
          "minimum": 1
        })
      })

      it("Finite + isLessThan", () => {
        assertJsonSchema(Schema.Finite.check(Schema.isLessThan(2)), {
          "type": "number",
          "description": "a value less than 2",
          "exclusiveMaximum": 2
        })
      })

      it("Finite + isLessThanOrEqualTo", () => {
        assertJsonSchema(Schema.Finite.check(Schema.isLessThanOrEqualTo(2)), {
          "type": "number",
          "description": "a value less than or equal to 2",
          "maximum": 2
        })
      })

      it("Finite + isBetween", () => {
        assertJsonSchema(Schema.Finite.check(Schema.isBetween({ minimum: 1, maximum: 2 })), {
          "type": "number",
          "description": "a value between 1 and 2",
          "minimum": 1,
          "maximum": 2
        })
      })

      it("Finite + isMultipleOf", () => {
        assertJsonSchema(Schema.Finite.check(Schema.isMultipleOf(2)), {
          "type": "number",
          "description": "a value that is a multiple of 2",
          "multipleOf": 2
        })
      })

      it("Finite + isGreaterThan + isLessThan", () => {
        assertJsonSchema(Schema.Finite.check(Schema.isGreaterThan(1), Schema.isLessThan(2)), {
          "type": "number",
          "description": "a value greater than 1 and a value less than 2",
          "exclusiveMinimum": 1,
          "exclusiveMaximum": 2
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
          "description": "a value greater than 1",
          "exclusiveMinimum": 1
        })
      })

      it("Int + isGreaterThan + isLessThan", () => {
        assertJsonSchema(Schema.Int.check(Schema.isGreaterThan(1), Schema.isLessThan(2)), {
          "type": "integer",
          "description": "a value greater than 1 and a value less than 2",
          "exclusiveMinimum": 1,
          "exclusiveMaximum": 2
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
        "description": "a value with a length of at least 1",
        "minItems": 1
      })
    })

    it("Array(String) + isMinLength + isMaxLength", () => {
      assertJsonSchema(Schema.Array(Schema.String).check(Schema.isMinLength(1), Schema.isMaxLength(2)), {
        "type": "array",
        "items": { "type": "string" },
        "description": "a value with a length of at least 1 and a value with a length of at most 2",
        "minItems": 1,
        "maxItems": 2
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

      const codec = toCodecOpenAI(schema).codec
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

      const codec = toCodecOpenAI(schema).codec
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
      const codec = toCodecOpenAI(schema).codec
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
      const codec = toCodecOpenAI(schema).codec
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
        "properties": {},
        "additionalProperties": false
      })
      assertJsonSchema(Schema.Record(Schema.String, Schema.Never), {
        "type": "object",
        "properties": {},
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
      const codec = toCodecOpenAI(Schema.Struct({ value: schema })).codec
      const asserts = new TestSchema.Asserts(codec)

      const encoding = asserts.encoding()
      await encoding.succeed(
        { value: { "a": 1, "b": 2 } },
        { value: [{ 0: "a", 1: 1 }, { 0: "b", 1: 2 }] }
      )

      const decoding = asserts.decoding()
      await decoding.succeed(
        { value: [{ 0: "a", 1: 1 }, { 0: "b", 1: 2 }] },
        { value: { "a": 1, "b": 2 } }
      )
    })

    it("Record with properties and an index signature", async () => {
      const schema = Schema.Record(
        Schema.Union([Schema.Literal("fixed"), Schema.String]),
        Schema.String
      )
      const expected = {
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
      } as const
      assertJsonSchema(schema, expected)

      const result = toCodecOpenAI(Schema.Struct({ value: schema }))

      const asserts = new TestSchema.Asserts(result.codec)
      await asserts.encoding().succeed(
        { value: { fixed: "required", dynamic: "value" } },
        { value: [{ 0: "fixed", 1: "required" }, { 0: "dynamic", 1: "value" }] }
      )
      await asserts.decoding().succeed(
        { value: [{ 0: "fixed", 1: "required" }, { 0: "dynamic", 1: "value" }] },
        { value: { fixed: "required", dynamic: "value" } }
      )
      assert.strictEqual(
        Schema.decodeUnknownExit(result.codec)({ value: [{ 0: "dynamic", 1: "value" }] })._tag,
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
      assertJsonSchema(schema, {
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
        },
        "minItems": 2
      })
      const result = toCodecOpenAI(Schema.Struct({ value: schema }))
      await new TestSchema.Asserts(result.codec).decoding().fail(
        { value: [{ 0: "a", 1: 1 }, { 0: "a", 1: 2 }] },
        `Expected a value with at least 2 entries
  at ["value"]`
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
        },
        "minItems": 2
      })
    })
  })
})
