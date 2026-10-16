import { assert } from "@effect/vitest"
import type { Options as AjvOptions } from "ajv"
import { Effect, JsonSchema, Option, Predicate, Schema, SchemaGetter } from "effect"
import { describe, it } from "vitest"
import { assertTrue, deepStrictEqual, throws } from "../utils/assert.ts"

// oxlint-disable-next-line @typescript-eslint/no-require-imports
const Ajv2020 = require("ajv/dist/2020")

const baseAjvOptions: AjvOptions = {
  allErrors: true,
  strict: false, // warns/throws on unknown keywords depending on Ajv version
  validateSchema: true,
  code: { esm: true } // optional
}

const ajvDraft2020_12 = new Ajv2020.default(baseAjvOptions)

function assertUnsupportedSchema(
  schema: Schema.Constraint,
  message: string,
  options?: Schema.ToJsonSchemaOptions
) {
  throws(() => Schema.toJsonSchemaDocument(schema, options), message)
}

function assertJsonSchemaDocument<T, E, RD>(
  schema: Schema.Codec<T, E, RD, never>,
  expected: { schema: JsonSchema.JsonSchema; definitions?: JsonSchema.Definitions },
  options?: Schema.ToJsonSchemaOptions
) {
  const document = Schema.toJsonSchemaDocument(schema, {
    onExcessProperty: "error",
    ...options
  })
  deepStrictEqual(document, {
    dialect: "draft-2020-12",
    schema: expected.schema,
    definitions: expected.definitions ?? {}
  })
  const jsonSchema = {
    $schema: JsonSchema.META_SCHEMA_URI_DRAFT_2020_12,
    ...document.schema,
    $defs: document.definitions
  }
  const valid = ajvDraft2020_12.validateSchema(jsonSchema)
  assertTrue(valid)
}

function assertJsonSchemaAcceptsEffectValues<T, E, RD>(
  schema: Schema.Codec<T, E, RD, never>,
  values: ReadonlyArray<unknown>
) {
  const document = Schema.toJsonSchemaDocument(schema, { onExcessProperty: "error" })
  const validate = ajvDraft2020_12.compile({
    $schema: JsonSchema.META_SCHEMA_URI_DRAFT_2020_12,
    ...document.schema,
    $defs: document.definitions
  })
  const is = Schema.is(schema)
  for (const value of values) {
    if (is(value)) {
      assertTrue(validate(value), `JSON Schema rejected ${JSON.stringify(value)}`)
    }
  }
}

describe("toJsonSchemaDocument", () => {
  describe("unsupported schemas", () => {
    it("rejects tuple post-rest elements", () => {
      assertUnsupportedSchema(
        Schema.TupleWithRest(Schema.Tuple([]), [Schema.Finite, Schema.String]),
        `Invalid schema representation document\n  at ["representation"]["rest"]`
      )
    })

    it("rejects symbol property names", () => {
      const a = Symbol.for("effect/Schema/test/a")
      assertUnsupportedSchema(
        Schema.Struct({ [a]: Schema.String }),
        "Objects property names must be strings"
      )
    })
  })

  it("Record(Symbol, Finite)", () => {
    assertJsonSchemaDocument(Schema.Record(Schema.Symbol, Schema.Finite), {
      schema: {
        type: "object",
        patternProperties: {
          "^Symbol\\(([\\s\\S]*)\\)$": { type: "number" }
        },
        additionalProperties: false
      }
    })
  })

  it("emits content annotations", () => {
    assertJsonSchemaDocument(
      Schema.String.annotate({
        description: "encoded payload",
        contentMediaType: "application/json",
        contentSchema: { type: "number" }
      }),
      {
        schema: {
          type: "string",
          description: "encoded payload",
          contentMediaType: "application/json",
          contentSchema: { type: "number" }
        }
      }
    )
  })

  describe("options", () => {
    it("generateDescriptions: true", () => {
      assertJsonSchemaDocument(
        Schema.String.annotate({ expected: "b" }),
        {
          schema: {
            "type": "string",
            "description": "b"
          }
        },
        { generateDescriptions: true }
      )
      assertJsonSchemaDocument(
        Schema.String.annotate({ description: "a", expected: "b" }),
        {
          schema: {
            "type": "string",
            "description": "a"
          }
        },
        { generateDescriptions: true }
      )
    })

    describe("onExcessProperty", () => {
      it("defaults to ignore", () => {
        deepStrictEqual(Schema.toJsonSchemaDocument(Schema.Struct({})).schema, {
          not: { type: "null" }
        })
        deepStrictEqual(Schema.toJsonSchemaDocument(Schema.Struct({ a: Schema.String })).schema, {
          type: "object",
          properties: { a: { type: "string" } },
          required: ["a"],
          additionalProperties: true
        })
      })

      it(`ignore (default)`, () => {
        const schema = Schema.Struct({ a: Schema.String })

        assertJsonSchemaDocument(schema, {
          schema: {
            "type": "object",
            "properties": {
              "a": {
                "type": "string"
              }
            },
            "required": ["a"],
            "additionalProperties": true
          }
        }, {
          onExcessProperty: "ignore"
        })
      })

      it(`error`, () => {
        const schema = Schema.Struct({ a: Schema.String })

        assertJsonSchemaDocument(schema, {
          schema: {
            "type": "object",
            "properties": {
              "a": {
                "type": "string"
              }
            },
            "required": ["a"],
            "additionalProperties": false
          }
        }, {
          onExcessProperty: "error"
        })
      })

      it("applies to properties not covered by patternProperties", () => {
        assertJsonSchemaDocument(Schema.Record(Schema.TemplateLiteral(["x-", Schema.String]), Schema.Number), {
          schema: {
            type: "object",
            patternProperties: {
              "^x-[\\s\\S]*?$": {
                anyOf: [
                  { type: "number" },
                  { type: "string", enum: ["Infinity", "-Infinity", "NaN"] }
                ]
              }
            },
            additionalProperties: false
          }
        }, {
          onExcessProperty: "error"
        })
      })

      it("uses the representable part of an index-signature key", () => {
        const key = Schema.String.check(Schema.makeFilter((value) => value.startsWith("x-")))

        assertJsonSchemaDocument(Schema.Record(key, Schema.String), {
          schema: {
            type: "object",
            propertyNames: { type: "string" },
            additionalProperties: { type: "string" }
          }
        }, {
          onExcessProperty: "error"
        })
      })
    })

    describe("includeAnnotationKey", () => {
      it("passthroughs matching annotation keys at schema level", () => {
        assertJsonSchemaDocument(
          Schema.String.annotate({
            title: "Name",
            description: "A name",
            "markdownDescription": "The **name** field"
          }),
          {
            schema: {
              "type": "string",
              "title": "Name",
              "description": "A name",
              "markdownDescription": "The **name** field"
            }
          },
          { includeAnnotationKey: (key) => key === "markdownDescription" }
        )
      })

      it("does not include keys not matching the predicate", () => {
        assertJsonSchemaDocument(
          Schema.String.annotate({
            title: "Name",
            description: "A name",
            "markdownDescription": "The **name** field",
            "customKey": "value"
          }),
          {
            schema: {
              "type": "string",
              "title": "Name",
              "description": "A name",
              "markdownDescription": "The **name** field"
            }
          },
          { includeAnnotationKey: (key) => key === "markdownDescription" }
        )
      })

      it("does not include matching keys with undefined values", () => {
        assertJsonSchemaDocument(
          Schema.String.annotate({
            "x-missing": undefined,
            "x-value": "value"
          }),
          {
            schema: {
              "type": "string",
              "x-value": "value"
            }
          },
          { includeAnnotationKey: (key) => key.startsWith("x-") }
        )
      })

      it("standard keys are always included regardless of predicate", () => {
        assertJsonSchemaDocument(
          Schema.String.annotate({
            title: "Name",
            description: "A name",
            default: "hello"
          }),
          {
            schema: {
              "type": "string",
              "title": "Name",
              "description": "A name",
              "default": "hello"
            }
          },
          { includeAnnotationKey: (_key) => false }
        )
      })

      it("passthroughs at property level in structs", () => {
        const schema = Schema.Struct({
          name: Schema.String.annotate({
            description: "A name",
            "markdownDescription": "The **name** field"
          }),
          tag: Schema.String.annotate({
            description: "A tag",
            "defaultSnippets": [{ label: "v1", body: "v1" }]
          })
        })
        assertJsonSchemaDocument(
          schema,
          {
            schema: {
              "type": "object",
              "properties": {
                "name": {
                  "type": "string",
                  "description": "A name",
                  "markdownDescription": "The **name** field"
                },
                "tag": {
                  "type": "string",
                  "description": "A tag",
                  "defaultSnippets": [{ label: "v1", body: "v1" }]
                }
              },
              "required": ["name", "tag"],
              "additionalProperties": false
            }
          },
          { includeAnnotationKey: (key) => key === "markdownDescription" || key === "defaultSnippets" }
        )
      })

      it("passthroughs at check level", () => {
        const schema = Schema.String
          .annotate({ description: "A string" })
          .pipe(
            Schema.check(
              Schema.isMinLength(1, {
                "x-check-annotation": true
              })
            )
          )
        assertJsonSchemaDocument(
          schema,
          {
            schema: {
              "type": "string",
              "description": "A string",
              "allOf": [{
                "minLength": 1,
                "x-check-annotation": true
              }]
            }
          },
          { includeAnnotationKey: (key) => key.startsWith("x-") }
        )
      })

      it("passthroughs x- prefixed vendor extensions", () => {
        assertJsonSchemaDocument(
          Schema.String.annotate({
            description: "A value",
            "x-custom": true,
            "x-extension": { foo: "bar" }
          }),
          {
            schema: {
              "type": "string",
              "description": "A value",
              "x-custom": true,
              "x-extension": { foo: "bar" }
            }
          },
          { includeAnnotationKey: (key) => key.startsWith("x-") }
        )
      })
    })
  })

  it("emits standard annotations", () => {
    const schema = Schema.String.annotate({
      title: "a",
      description: "b",
      default: "c",
      examples: ["d"],
      readOnly: true,
      writeOnly: true
    })
    assertJsonSchemaDocument(schema, {
      schema: {
        "type": "string",
        "title": "a",
        "description": "b",
        "default": "c",
        "examples": ["d"],
        "readOnly": true,
        "writeOnly": true
      }
    })
  })

  describe("identifiers", () => {
    it(`escapes "~" and "/" in JSON Pointer references`, () => {
      const S = Schema.String.annotate({ identifier: "id~a/b" })
      assertJsonSchemaDocument(
        S,
        {
          schema: { "$ref": "#/$defs/id~0a~1b" },
          definitions: {
            "id~a/b": { "type": "string" }
          }
        }
      )
    })

    it("reuses a definition for repeated occurrences of the same identified AST", () => {
      const S = Schema.String.annotate({ identifier: "id" })
      assertJsonSchemaDocument(
        Schema.Union([S, S]),
        {
          schema: {
            "anyOf": [
              { "$ref": "#/$defs/id" },
              { "$ref": "#/$defs/id" }
            ]
          },
          definitions: {
            id: { "type": "string" }
          }
        }
      )
    })

    it("suffixes duplicate identifiers on different schemas", () => {
      const S = Schema.Union([
        Schema.String.annotate({ identifier: "id", description: "a" }),
        Schema.String.annotate({ identifier: "id", description: "b" })
      ])
      assertJsonSchemaDocument(S, {
        schema: {
          anyOf: [
            { $ref: "#/$defs/id" },
            { $ref: "#/$defs/id_1" }
          ]
        },
        definitions: {
          id: { type: "string", description: "a" },
          id_1: { type: "string", description: "b" }
        }
      })
    })

    it("reuses one definition when the same identified AST appears in different schema shapes", () => {
      const X = Schema.String.annotate({ title: "X", identifier: "X" })
      const S = Schema.Struct({
        a: X,
        b: Schema.NullOr(X),
        c: Schema.optionalKey(X),
        d: Schema.optionalKey(Schema.NullOr(X)),
        e: Schema.NullOr(X).pipe(
          Schema.encodeTo(Schema.optionalKey(X), {
            decode: SchemaGetter.transformOptional(Option.orElseSome(() => null)),
            encode: SchemaGetter.transformOptional(Option.filter(Predicate.isNotNull))
          })
        )
      })
      assertJsonSchemaDocument(S, {
        schema: {
          "type": "object",
          "properties": {
            "a": {
              "$ref": "#/$defs/X"
            },
            "b": {
              "anyOf": [
                {
                  "$ref": "#/$defs/X"
                },
                {
                  "type": "null"
                }
              ]
            },
            "c": {
              "$ref": "#/$defs/X"
            },
            "d": {
              "anyOf": [
                {
                  "$ref": "#/$defs/X"
                },
                {
                  "type": "null"
                }
              ]
            },
            "e": {
              "$ref": "#/$defs/X"
            }
          },
          "required": [
            "a",
            "b"
          ],
          "additionalProperties": false
        },
        definitions: {
          "X": {
            "type": "string",
            "title": "X"
          }
        }
      })
    })
  })

  describe("Declaration", () => {
    it("opaque Declaration", () => {
      assertJsonSchemaDocument(Schema.instanceOf(URL), {
        schema: {}
      })
    })

    it("Date", () => {
      const schema = Schema.Date
      assertJsonSchemaDocument(schema, {
        schema: {
          "type": "string"
        }
      })
    })

    it("URL", () => {
      const schema = Schema.URL
      assertJsonSchemaDocument(schema, {
        schema: {
          "type": "string"
        }
      })
    })

    it("Error", () => {
      const schema = Schema.ErrorInstance()
      assertJsonSchemaDocument(schema, {
        schema: {
          "type": "object",
          "properties": {
            "name": { "type": "string" },
            "message": { "type": "string" },
            "stack": { "type": "string" },
            "cause": {}
          },
          "required": ["message"],
          "additionalProperties": false
        }
      })
    })

    it("RegExp", () => {
      const schema = Schema.RegExp
      assertJsonSchemaDocument(schema, {
        schema: {
          "type": "object",
          "properties": {
            "source": { "type": "string" },
            "flags": { "type": "string" }
          },
          "required": ["source", "flags"],
          "additionalProperties": false
        }
      })
    })

    it("Uint8Array", () => {
      const schema = Schema.Uint8Array
      assertJsonSchemaDocument(schema, {
        schema: {
          "type": "string",
          "format": "byte",
          "contentEncoding": "base64"
        }
      })
    })

    it("Duration", () => {
      const schema = Schema.Duration
      assertJsonSchemaDocument(schema, {
        schema: {
          "anyOf": [
            {
              "type": "object",
              "properties": {
                "_tag": {
                  "type": "string",
                  "enum": ["Infinity"]
                }
              },
              "required": ["_tag"],
              "additionalProperties": false
            },
            {
              "type": "object",
              "properties": {
                "_tag": {
                  "type": "string",
                  "enum": ["NegativeInfinity"]
                }
              },
              "required": ["_tag"],
              "additionalProperties": false
            },
            {
              "type": "object",
              "properties": {
                "_tag": {
                  "type": "string",
                  "enum": ["Nanos"]
                },
                "value": {
                  "type": "string",
                  "pattern": "^-?\\d+$"
                }
              },
              "required": ["_tag", "value"],
              "additionalProperties": false
            },
            {
              "type": "object",
              "properties": {
                "_tag": {
                  "type": "string",
                  "enum": ["Millis"]
                },
                "value": {
                  "type": "integer"
                }
              },
              "required": ["_tag", "value"],
              "additionalProperties": false
            }
          ]
        }
      })
    })

    it("Option(String)", () => {
      const schema = Schema.Option(Schema.String)
      assertJsonSchemaDocument(schema, {
        schema: {
          "anyOf": [
            {
              "type": "object",
              "properties": {
                "_tag": {
                  "type": "string",
                  "enum": ["Some"]
                },
                "value": {
                  "type": "string"
                }
              },
              "required": ["_tag", "value"],
              "additionalProperties": false
            },
            {
              "type": "object",
              "properties": {
                "_tag": {
                  "type": "string",
                  "enum": ["None"]
                }
              },
              "required": ["_tag"],
              "additionalProperties": false
            }
          ]
        }
      })
    })
  })

  it("Any", () => {
    const schema = Schema.Any
    assertJsonSchemaDocument(
      schema,
      {
        schema: {}
      }
    )
    assertJsonSchemaDocument(
      schema.annotate({ description: "a" }),
      {
        schema: {
          "description": "a"
        }
      }
    )
  })

  it("Json", () => {
    const schema = Schema.Json
    assertJsonSchemaDocument(
      schema,
      {
        schema: {}
      }
    )
  })

  it("MutableJson", () => {
    const schema = Schema.MutableJson
    assertJsonSchemaDocument(
      schema,
      {
        schema: {}
      }
    )
  })

  it("Unknown", () => {
    const schema = Schema.Unknown
    assertJsonSchemaDocument(
      schema,
      {
        schema: {}
      }
    )
    assertJsonSchemaDocument(
      schema.annotate({ description: "a" }),
      {
        schema: {}
      }
    )
  })

  it("Void", () => {
    const schema = Schema.Void
    assertJsonSchemaDocument(
      schema,
      {
        schema: {
          "type": "null"
        }
      }
    )
    assertJsonSchemaDocument(
      schema.annotate({ description: "a" }),
      {
        schema: {
          "type": "null"
        }
      }
    )
  })

  it("Undefined", () => {
    const schema = Schema.Undefined
    assertJsonSchemaDocument(
      schema,
      {
        schema: {
          "type": "null"
        }
      }
    )
    assertJsonSchemaDocument(
      schema.annotate({ description: "a" }),
      {
        schema: {
          "type": "null"
        }
      }
    )
  })

  it("BigInt", () => {
    const schema = Schema.BigInt
    assertJsonSchemaDocument(
      schema,
      {
        schema: {
          "type": "string",
          "pattern": "^-?\\d+$"
        }
      }
    )
  })

  it("Symbol", () => {
    const schema = Schema.Symbol
    assertJsonSchemaDocument(
      schema,
      {
        schema: {
          "type": "string",
          "pattern": "^Symbol\\(([\\s\\S]*)\\)$"
        }
      }
    )
  })

  it("UniqueSymbol", () => {
    const schema = Schema.UniqueSymbol(Symbol.for("a"))
    assertJsonSchemaDocument(
      schema,
      {
        schema: {
          "type": "string",
          "enum": ["Symbol(a)"]
        }
      }
    )

    assertJsonSchemaDocument(
      Schema.UniqueSymbol(Symbol("a")),
      {
        schema: {
          "not": {}
        }
      }
    )
  })

  it("Never", () => {
    const schema = Schema.Never
    assertJsonSchemaDocument(
      schema,
      {
        schema: {
          "not": {}
        }
      }
    )
    assertJsonSchemaDocument(
      schema.annotate({ description: "a" }),
      {
        schema: {
          "description": "a",
          "not": {}
        }
      }
    )
  })

  it("Null", () => {
    const schema = Schema.Null
    assertJsonSchemaDocument(
      schema,
      {
        schema: {
          "type": "null"
        }
      }
    )
    assertJsonSchemaDocument(
      schema.annotate({ description: "a" }),
      {
        schema: {
          "type": "null",
          "description": "a"
        }
      }
    )
  })

  describe("String", () => {
    it("String", () => {
      assertJsonSchemaDocument(
        Schema.String,
        {
          schema: {
            "type": "string"
          }
        }
      )
    })

    it("String & annotate", () => {
      assertJsonSchemaDocument(
        Schema.String.annotate({ description: "a" }),
        {
          schema: {
            "type": "string",
            "description": "a"
          }
        }
      )
    })

    it("ignores annotateKey annotations when the schema is not contextual", () => {
      assertJsonSchemaDocument(
        Schema.String.annotateKey({
          description: "a"
        }),
        {
          schema: {
            "type": "string"
          }
        }
      )
    })

    it("String & check", () => {
      assertJsonSchemaDocument(
        Schema.String.check(Schema.isMinLength(2)),
        {
          schema: {
            "type": "string",
            "minLength": 1
          }
        }
      )
    })

    it("String & custom check without annotation", () => {
      assertJsonSchemaDocument(
        Schema.String.check(Schema.makeFilter(() => true)),
        {
          schema: {
            "type": "string"
          }
        }
      )
    })

    it("String & annotate & check", () => {
      assertJsonSchemaDocument(
        Schema.String.annotate({ description: "a" }).check(Schema.isMinLength(2)),
        {
          schema: {
            "type": "string",
            "description": "a",
            "minLength": 1
          }
        }
      )
    })

    it("String & check & annotate", () => {
      assertJsonSchemaDocument(
        Schema.String.check(Schema.isMinLength(2)).annotate({
          description: "a"
        }),
        {
          schema: {
            "type": "string",
            "minLength": 1,
            "description": "a"
          }
        }
      )
    })

    it("String & check & check", () => {
      assertJsonSchemaDocument(
        Schema.String.check(Schema.isMinLength(2), Schema.isMaxLength(3)),
        {
          schema: {
            "type": "string",
            "minLength": 1,
            "maxLength": 3
          }
        }
      )
    })

    it("String & annotate & check & check", () => {
      assertJsonSchemaDocument(
        Schema.String.annotate({ description: "a" }).check(Schema.isMinLength(2), Schema.isMaxLength(3)),
        {
          schema: {
            "type": "string",
            "description": "a",
            "minLength": 1,
            "maxLength": 3
          }
        }
      )
    })

    it("String & check & check & annotate", () => {
      assertJsonSchemaDocument(
        Schema.String.check(Schema.isMinLength(2), Schema.isMaxLength(3)).annotate({
          description: "a"
        }),
        {
          schema: {
            "type": "string",
            "minLength": 1,
            "maxLength": 3,
            "description": "a"
          }
        }
      )
    })

    it("String & annotate & check & check & annotate", () => {
      assertJsonSchemaDocument(
        Schema.String.annotate({ description: "a" }).check(
          Schema.isMinLength(2),
          Schema.isMaxLength(3, { description: "c" })
        ),
        {
          schema: {
            "type": "string",
            "description": "a",
            "minLength": 1,
            "allOf": [
              {
                "maxLength": 3,
                "description": "c"
              }
            ]
          }
        }
      )
    })

    it("String & check & annotations & check & annotations", () => {
      assertJsonSchemaDocument(
        Schema.String.check(
          Schema.isMinLength(2, { description: "b" }),
          Schema.isMaxLength(3, { description: "c" })
        ),
        {
          schema: {
            "type": "string",
            "minLength": 1,
            "description": "b",
            "allOf": [
              {
                "maxLength": 3,
                "description": "c"
              }
            ]
          }
        }
      )
    })

    it("String & annotations & check & annotations & check & annotations", () => {
      assertJsonSchemaDocument(
        Schema.String.annotate({ description: "a" }).check(
          Schema.isMinLength(2, { description: "b" }),
          Schema.isMaxLength(3, { description: "c" })
        ),
        {
          schema: {
            "type": "string",
            "description": "a",
            "allOf": [
              {
                "minLength": 1,
                "description": "b"
              },
              {
                "maxLength": 3,
                "description": "c"
              }
            ]
          }
        }
      )
    })

    describe("checks", () => {
      it("isPattern", () => {
        assertJsonSchemaDocument(Schema.String.check(Schema.isPattern(/^abb+$/u)), {
          schema: {
            "type": "string",
            "pattern": "^abb+$"
          }
        })
      })

      it("omits isPattern when its flags cannot be represented", () => {
        for (const regExp of [/^abb+$/, /^abb+$/y, /^abb+$/iu, /^abb+$/mu, /^abb+$/su]) {
          assertJsonSchemaDocument(Schema.String.check(Schema.isPattern(regExp)), {
            schema: { type: "string" }
          })
        }
      })

      it("preserves representable isPattern semantics", () => {
        for (
          const [regExp, pattern] of [
            [/^abb+$/gu, "^abb+$"],
            [/abb+/uy, "^(?:abb+)"],
            [/abb+/guy, "^(?:abb+)"],
            [/^[é]+$/u, "^[é]+$"],
            [/^[a-z]+$/u, "^[a-z]+$"],
            [/^[\x20-\uD7FF\uE000-\uFFFF]+$/u, "^[\\x20-\\uD7FF\\uE000-\\uFFFF]+$"],
            [/^[a-b-\uE000]+$/u, "^[a-b-\\uE000]+$"],
            [/^[\d-]+$/u, "^[\\d-]+$"]
          ] as const
        ) {
          assertJsonSchemaDocument(Schema.String.check(Schema.isPattern(regExp)), {
            schema: { type: "string", pattern }
          })
        }
      })

      it("omits isPattern without the Unicode flag", () => {
        for (
          const [regExp, values] of [
            [/^.$/, ["a", "😀", "\uD800"]],
            [/[\uD7FF-\uE000]/y, ["😀"]],
            [/^[\uD7FF-\uE000]{2}$/, ["😀"]]
          ] as const
        ) {
          const schema = Schema.String.check(Schema.isPattern(regExp))
          assertJsonSchemaDocument(schema, { schema: { type: "string" } })
          assertJsonSchemaAcceptsEffectValues(schema, values)
        }
      })

      it("escapes regexp syntax in literal string checks", () => {
        for (
          const [check, pattern] of [
            [Schema.isStartingWith("a.b"), "^a\\.b"],
            [Schema.isEndingWith("a+b"), "a\\+b$"],
            [Schema.isIncluding("["), "\\["]
          ] as const
        ) {
          assertJsonSchemaDocument(Schema.String.check(check), {
            schema: {
              "type": "string",
              pattern
            }
          })
        }
      })

      it("loosens literal patterns only at surrogate-pair boundaries", () => {
        for (
          const [check, pattern, values] of [
            [Schema.isStartingWith("abc\uD83D"), "^abc", ["abc😀"]],
            [Schema.isEndingWith("\uDE00xyz"), "xyz$", ["😀xyz"]],
            [Schema.isIncluding("\uDE00x\uD83D"), "x", ["😀x😀"]]
          ] as const
        ) {
          const schema = Schema.String.check(check)
          assertJsonSchemaDocument(schema, {
            schema: { type: "string", pattern }
          })
          assertJsonSchemaAcceptsEffectValues(schema, values)
        }
      })

      it("does not use approximate literal patterns as record selectors", () => {
        const schema = Schema.StructWithRest(
          Schema.Struct({ abc: Schema.String }),
          [Schema.Record(Schema.String.check(Schema.isStartingWith("abc\uD83D")), Schema.Finite)]
        )
        assertJsonSchemaAcceptsEffectValues(schema, [{ abc: "text", "abc😀": 1 }])
      })

      it("omits literal patterns whose entire constraint is a surrogate-pair boundary", () => {
        for (
          const [check, values] of [
            [Schema.isStartingWith("\uD83D"), ["😀"]],
            [Schema.isEndingWith("\uDE00"), ["😀"]],
            [Schema.isIncluding("\uDE00\uD83D"), ["😀😀"]]
          ] as const
        ) {
          const schema = Schema.String.check(check)
          assertJsonSchemaDocument(schema, { schema: { type: "string" } })
          assertJsonSchemaAcceptsEffectValues(schema, values)
        }
      })

      it("isTrimmed", () => {
        const schema = Schema.Trimmed
        assertJsonSchemaDocument(schema, {
          schema: {
            "type": "string",
            "pattern": "^\\S[\\s\\S]*\\S$|^\\S$|^$"
          }
        })
      })

      it("isLowercased", () => {
        const schema = Schema.String.check(Schema.isLowercased())
        assertJsonSchemaDocument(schema, {
          schema: {
            "type": "string",
            "pattern": "^[^A-Z]*$"
          }
        })
      })

      it("isUppercased", () => {
        const schema = Schema.String.check(Schema.isUppercased())
        assertJsonSchemaDocument(schema, {
          schema: {
            "type": "string",
            "pattern": "^[^a-z]*$"
          }
        })
      })

      it("isCapitalized", () => {
        const schema = Schema.String.check(Schema.isCapitalized())
        assertJsonSchemaDocument(schema, {
          schema: {
            "type": "string",
            "pattern": "^(?:[^a-z][\\s\\S]*)?$"
          }
        })
      })

      it("isUncapitalized", () => {
        const schema = Schema.String.check(Schema.isUncapitalized())
        assertJsonSchemaDocument(schema, {
          schema: {
            "type": "string",
            "pattern": "^(?:[^A-Z][\\s\\S]*)?$"
          }
        })
      })

      describe("isBetweenLength", () => {
        it("String", () => {
          assertJsonSchemaDocument(
            Schema.String.check(Schema.isBetweenLength(2, 2)),
            {
              schema: {
                "type": "string",
                "minLength": 1,
                "maxLength": 2
              }
            }
          )
        })

        it("Array", () => {
          assertJsonSchemaDocument(
            Schema.Array(Schema.String).check(Schema.isBetweenLength(2, 2)),
            {
              schema: {
                "type": "array",
                "items": {
                  "type": "string"
                },
                "minItems": 2,
                "maxItems": 2
              }
            }
          )
        })

        it("NonEmptyArray", () => {
          assertJsonSchemaDocument(
            Schema.NonEmptyArray(Schema.String).check(Schema.isBetweenLength(2, 2)),
            {
              schema: {
                "type": "array",
                "prefixItems": [{
                  "type": "string"
                }],
                "items": {
                  "type": "string"
                },
                "minItems": 1,
                "allOf": [
                  { "minItems": 2, "maxItems": 2 }
                ]
              }
            }
          )
        })

        it("exports the tightest code-point bounds that accept every valid string", () => {
          const schema = Schema.String.check(Schema.isBetweenLength(3, 4))
          assertJsonSchemaDocument(schema, {
            schema: {
              type: "string",
              minLength: 2,
              maxLength: 4
            }
          })
          assertJsonSchemaAcceptsEffectValues(schema, ["ab", "a😀", "😀😀", "abcde"])
        })
      })

      it("exports code point checks with matching JSON Schema validation", () => {
        for (
          const [check, keywords] of [
            [Schema.isMinCodePoints(2), { minLength: 2 }],
            [Schema.isMaxCodePoints(1), { maxLength: 1 }],
            [Schema.isBetweenCodePoints(1, 2), { allOf: [{ minLength: 1 }, { maxLength: 2 }] }]
          ] as const
        ) {
          const schema = Schema.String.check(check)
          const jsonSchema = { type: "string", ...keywords } as const
          assertJsonSchemaDocument(schema, { schema: jsonSchema })
          const validate = ajvDraft2020_12.compile(jsonSchema)
          for (const value of ["", "a", "😀", "😀a", "😀😀😀", "e\u0301", "\uD800", "\uDC00"]) {
            assert.strictEqual(validate(value), Schema.is(schema)(value))
          }
        }
      })

      describe("isMinLength", () => {
        it("String", () => {
          assertJsonSchemaDocument(
            Schema.String.check(Schema.isMinLength(2)),
            {
              schema: {
                "type": "string",
                "minLength": 1
              }
            }
          )
        })

        it("exports a loose lower bound for strings", () => {
          const schema = Schema.String.check(Schema.isMinLength(3))
          assertJsonSchemaDocument(schema, {
            schema: { type: "string", minLength: 2 }
          })
          assertJsonSchemaAcceptsEffectValues(schema, ["a😀", "😀😀", "ab"])
        })

        it("exports both applicable bounds when the input type is a union", () => {
          const schema = Schema.Union([Schema.String, Schema.Array(Schema.String)]).check(Schema.isMinLength(2))
          assertJsonSchemaAcceptsEffectValues(schema, ["😀", ["a", "b"]])
        })

        it("Array", () => {
          assertJsonSchemaDocument(
            Schema.Array(Schema.String).check(Schema.isMinLength(2)),
            {
              schema: {
                "type": "array",
                "items": {
                  "type": "string"
                },
                "minItems": 2
              }
            }
          )
        })

        it("NonEmptyArray", () => {
          assertJsonSchemaDocument(
            Schema.NonEmptyArray(Schema.String).check(Schema.isMinLength(2)),
            {
              schema: {
                "type": "array",
                "prefixItems": [{
                  "type": "string"
                }],
                "items": {
                  "type": "string"
                },
                "minItems": 1,
                "allOf": [
                  { "minItems": 2 }
                ]
              }
            }
          )
        })
      })

      describe("isMaxLength", () => {
        it("String", () => {
          assertJsonSchemaDocument(
            Schema.String.check(Schema.isMaxLength(2)),
            {
              schema: {
                "type": "string",
                "maxLength": 2
              }
            }
          )
        })

        it("exports a loose upper bound for strings", () => {
          const schema = Schema.String.check(Schema.isMaxLength(2))
          assertJsonSchemaDocument(schema, {
            schema: { type: "string", maxLength: 2 }
          })
          assertJsonSchemaAcceptsEffectValues(schema, ["a", "😀", "😀😀"])
        })

        it("Array", () => {
          assertJsonSchemaDocument(
            Schema.Array(Schema.String).check(Schema.isMaxLength(2)),
            {
              schema: {
                "type": "array",
                "items": {
                  "type": "string"
                },
                "maxItems": 2
              }
            }
          )
        })

        it("NonEmptyArray", () => {
          assertJsonSchemaDocument(
            Schema.NonEmptyArray(Schema.String).check(Schema.isMaxLength(2)),
            {
              schema: {
                "type": "array",
                "maxItems": 2,
                "minItems": 1,
                "prefixItems": [{
                  "type": "string"
                }],
                "items": {
                  "type": "string"
                }
              }
            }
          )
        })
      })

      it("rejects non-finite cardinality bounds", () => {
        const unaryChecks: ReadonlyArray<(value: number) => unknown> = [
          Schema.isMinLength,
          Schema.isMaxLength,
          Schema.isMinCodePoints,
          Schema.isMaxCodePoints,
          Schema.isMinSize,
          Schema.isMaxSize,
          Schema.isMinProperties,
          Schema.isMaxProperties
        ]
        const binaryChecks: ReadonlyArray<(minimum: number, maximum: number) => unknown> = [
          Schema.isBetweenLength,
          Schema.isBetweenCodePoints,
          Schema.isBetweenSize,
          Schema.isBetweenProperties
        ]
        for (const [value, formatted] of [[NaN, "NaN"], [Infinity, "Infinity"], [-Infinity, "-Infinity"]] as const) {
          for (const check of unaryChecks) {
            throws(() => check(value), new RangeError(`Expected a finite number, got ${formatted}`))
          }
          for (const check of binaryChecks) {
            throws(() => check(value, 1), new RangeError(`Expected a finite number, got ${formatted}`))
            throws(() => check(1, value), new RangeError(`Expected a finite number, got ${formatted}`))
          }
        }
      })

      it("isUUID", () => {
        assertJsonSchemaDocument(
          Schema.String.annotate({ description: "description" }).check(Schema.isUUID()),
          {
            schema: {
              "type": "string",
              "description": "description",
              "format": "uuid",
              "pattern":
                "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$"
            }
          }
        )
      })

      it("isGUID", () => {
        assertJsonSchemaDocument(
          Schema.String.annotate({ description: "description" }).check(Schema.isGUID()),
          {
            schema: {
              "type": "string",
              "description": "description",
              "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$"
            }
          }
        )
      })

      it("isBase64", () => {
        assertJsonSchemaDocument(
          Schema.String.annotate({ description: "description" }).check(Schema.isBase64()),
          {
            schema: {
              "type": "string",
              "description": "description",
              "pattern": "^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$"
            }
          }
        )
      })

      it("isBase64Url", () => {
        assertJsonSchemaDocument(
          Schema.String.annotate({ description: "description" }).check(Schema.isBase64Url()),
          {
            schema: {
              "type": "string",
              "description": "description",
              "pattern": "^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$"
            }
          }
        )
      })
    })
  })

  describe("Number", () => {
    it("Number", () => {
      const schema = Schema.Number
      assertJsonSchemaDocument(
        schema,
        {
          schema: {
            "anyOf": [
              { "type": "number" },
              { "type": "string", "enum": ["Infinity", "-Infinity", "NaN"] }
            ]
          }
        }
      )
      assertJsonSchemaDocument(
        schema.annotate({ description: "a" }),
        {
          schema: {
            "anyOf": [
              { "type": "number" },
              { "type": "string", "enum": ["Infinity", "-Infinity", "NaN"] }
            ]
          }
        }
      )
    })

    it("Number & annotateKey", () => {
      assertJsonSchemaDocument(
        Schema.Struct({
          value: Schema.Number.annotateKey({ description: "the field" })
        }),
        {
          schema: {
            type: "object",
            properties: {
              value: {
                anyOf: [
                  { type: "number" },
                  { type: "string", enum: ["Infinity", "-Infinity", "NaN"] }
                ],
                allOf: [{ description: "the field" }]
              }
            },
            required: ["value"],
            additionalProperties: false
          }
        }
      )
    })
  })

  describe("Finite", () => {
    it("Finite", () => {
      assertJsonSchemaDocument(
        Schema.Finite,
        {
          schema: {
            "type": "number"
          }
        }
      )
      assertJsonSchemaDocument(
        Schema.Finite.annotate({ description: "a" }),
        {
          schema: {
            "type": "number",
            "description": "a"
          }
        }
      )
    })

    describe("checks", () => {
      it("isInt", () => {
        assertJsonSchemaDocument(
          Schema.Finite.check(Schema.isInt()),
          {
            schema: {
              "type": "integer"
            }
          }
        )
      })

      it("isInt32", () => {
        assertJsonSchemaDocument(
          Schema.Finite.check(Schema.isInt32()),
          {
            schema: {
              "type": "integer",
              "allOf": [
                { "maximum": 2147483647, "minimum": -2147483648 }
              ]
            }
          }
        )
      })

      it("isUint32", () => {
        assertJsonSchemaDocument(
          Schema.Finite.check(Schema.isUint32()),
          {
            schema: {
              "type": "integer",
              "allOf": [
                { "maximum": 4294967295, "minimum": 0 }
              ]
            }
          }
        )
        assertJsonSchemaDocument(
          Schema.Finite.check(Schema.isUint32({ description: "a" })),
          {
            schema: {
              "type": "integer",
              "allOf": [
                {
                  "description": "a",
                  "allOf": [
                    { "maximum": 4294967295, "minimum": 0 }
                  ]
                }
              ]
            }
          }
        )
        assertJsonSchemaDocument(
          Schema.Finite.check(
            Schema.isUint32({ description: "a" })
          ),
          {
            schema: {
              "type": "integer",
              "allOf": [
                {
                  "description": "a",
                  "allOf": [
                    { "maximum": 4294967295, "minimum": 0 }
                  ]
                }
              ]
            }
          }
        )
      })

      it("isGreaterThan", () => {
        assertJsonSchemaDocument(
          Schema.Finite.check(Schema.isGreaterThan(1)),
          {
            schema: {
              "type": "number",
              "exclusiveMinimum": 1
            }
          }
        )
      })

      it("isGreaterThanOrEqualTo", () => {
        assertJsonSchemaDocument(
          Schema.Finite.check(Schema.isGreaterThanOrEqualTo(1)),
          {
            schema: {
              "type": "number",
              "minimum": 1
            }
          }
        )
      })

      it("isLessThan", () => {
        assertJsonSchemaDocument(Schema.Finite.check(Schema.isLessThan(1)), {
          schema: {
            "type": "number",
            "exclusiveMaximum": 1
          }
        })
      })

      it("isLessThanOrEqualTo", () => {
        assertJsonSchemaDocument(Schema.Finite.check(Schema.isLessThanOrEqualTo(1)), {
          schema: {
            "type": "number",
            "maximum": 1
          }
        })
      })

      it("isBetween", () => {
        assertJsonSchemaDocument(
          Schema.Finite.check(Schema.isBetween({ minimum: 1, maximum: 10 })),
          {
            schema: {
              "type": "number",
              "minimum": 1,
              "maximum": 10
            }
          }
        )
        assertJsonSchemaDocument(
          Schema.Finite.check(
            Schema.isBetween({ minimum: 1, maximum: 10, exclusiveMinimum: true })
          ),
          {
            schema: {
              "type": "number",
              "exclusiveMinimum": 1,
              "maximum": 10
            }
          }
        )
        assertJsonSchemaDocument(
          Schema.Finite.check(
            Schema.isBetween({ minimum: 1, maximum: 10, exclusiveMaximum: true })
          ),
          {
            schema: {
              "type": "number",
              "minimum": 1,
              "exclusiveMaximum": 10
            }
          }
        )
        assertJsonSchemaDocument(
          Schema.Finite.check(
            Schema.isBetween({ minimum: 1, maximum: 10, exclusiveMinimum: true, exclusiveMaximum: true })
          ),
          {
            schema: {
              "type": "number",
              "exclusiveMinimum": 1,
              "exclusiveMaximum": 10
            }
          }
        )
      })

      it("isMultipleOf", () => {
        assertJsonSchemaDocument(
          Schema.Int.check(Schema.isMultipleOf(2)),
          {
            schema: {
              "type": "integer",
              "multipleOf": 2
            }
          }
        )
        assertJsonSchemaDocument(
          Schema.Int.check(Schema.isMultipleOf(-2)),
          {
            schema: {
              "type": "integer",
              "multipleOf": 2
            }
          }
        )
      })
    })
  })

  it("Boolean", () => {
    const schema = Schema.Boolean
    assertJsonSchemaDocument(
      schema,
      {
        schema: {
          "type": "boolean"
        }
      }
    )
    assertJsonSchemaDocument(
      schema.annotate({ description: "a" }),
      {
        schema: {
          "type": "boolean",
          "description": "a"
        }
      }
    )
  })

  it("ObjectKeyword", () => {
    const schema = Schema.ObjectKeyword
    assertJsonSchemaDocument(
      schema,
      {
        schema: { anyOf: [{ type: "array" }, { type: "object" }] }
      }
    )
    assertJsonSchemaDocument(
      schema.annotate({ description: "a" }),
      {
        schema: {
          "anyOf": [
            { "type": "array" },
            { "type": "object" }
          ]
        }
      }
    )
  })

  describe("Literal", () => {
    it("string", () => {
      const schema = Schema.Literal("a")
      assertJsonSchemaDocument(
        schema,
        {
          schema: {
            "type": "string",
            "enum": ["a"]
          }
        }
      )
      assertJsonSchemaDocument(
        schema.annotate({ description: "a" }),
        {
          schema: {
            "type": "string",
            "enum": ["a"],
            "description": "a"
          }
        }
      )
    })

    it("number", () => {
      const schema = Schema.Literal(1)
      assertJsonSchemaDocument(
        schema,
        {
          schema: {
            "type": "number",
            "enum": [1]
          }
        }
      )
      assertJsonSchemaDocument(
        schema.annotate({ description: "a" }),
        {
          schema: {
            "type": "number",
            "enum": [1],
            "description": "a"
          }
        }
      )
    })

    it("boolean", () => {
      const schema = Schema.Literal(true)
      assertJsonSchemaDocument(
        schema,
        {
          schema: {
            "type": "boolean",
            "enum": [true]
          }
        }
      )
      assertJsonSchemaDocument(
        schema.annotate({ description: "a" }),
        {
          schema: {
            "type": "boolean",
            "enum": [true],
            "description": "a"
          }
        }
      )
    })

    it("bigint", () => {
      const schema = Schema.Literal(1n)
      assertJsonSchemaDocument(
        schema,
        {
          schema: {
            "type": "string",
            "enum": ["1"]
          }
        }
      )
      assertJsonSchemaDocument(
        schema.annotate({ description: "a" }),
        {
          schema: {
            "type": "string",
            "enum": ["1"]
          }
        }
      )
    })
  })

  describe("Literals", () => {
    it("empty literals", () => {
      const schema = Schema.Literals([])
      assertJsonSchemaDocument(
        schema,
        {
          schema: {
            "not": {}
          }
        }
      )
      assertJsonSchemaDocument(
        schema.annotate({ description: "a" }),
        {
          schema: {
            "not": {},
            "description": "a"
          }
        }
      )
    })

    it("strings", () => {
      const schema = Schema.Literals(["a", "b"])
      assertJsonSchemaDocument(
        schema,
        {
          schema: {
            "type": "string",
            "enum": ["a", "b"]
          }
        }
      )
      assertJsonSchemaDocument(
        schema.annotate({ description: "a" }),
        {
          schema: {
            "type": "string",
            "enum": ["a", "b"],
            "description": "a"
          }
        }
      )
    })

    it("numbers", () => {
      const schema = Schema.Literals([1, 2])
      assertJsonSchemaDocument(
        schema,
        {
          schema: {
            "type": "number",
            "enum": [1, 2]
          }
        }
      )
      assertJsonSchemaDocument(
        schema.annotate({ description: "a" }),
        {
          schema: {
            "type": "number",
            "enum": [1, 2],
            "description": "a"
          }
        }
      )
    })

    it("booleans", () => {
      const schema = Schema.Literals([true, false])
      assertJsonSchemaDocument(
        schema,
        {
          schema: {
            "type": "boolean",
            "enum": [true, false]
          }
        }
      )
      assertJsonSchemaDocument(
        schema.annotate({ description: "a" }),
        {
          schema: {
            "type": "boolean",
            "enum": [true, false],
            "description": "a"
          }
        }
      )
    })

    it("strings & numbers", () => {
      const schema = Schema.Literals(["a", 1])
      assertJsonSchemaDocument(
        schema,
        {
          schema: {
            "anyOf": [
              {
                "type": "string",
                "enum": ["a"]
              },
              {
                "type": "number",
                "enum": [1]
              }
            ]
          }
        }
      )
      assertJsonSchemaDocument(
        schema.annotate({ description: "a" }),
        {
          schema: {
            "anyOf": [
              {
                "type": "string",
                "enum": ["a"]
              },
              {
                "type": "number",
                "enum": [1]
              }
            ],
            "description": "a"
          }
        }
      )
    })
  })

  describe("Union of literals", () => {
    it("strings", () => {
      const schema = Schema.Union([
        Schema.Literal("a"),
        Schema.Literal("b")
      ])
      assertJsonSchemaDocument(
        schema,
        {
          schema: {
            "type": "string",
            "enum": ["a", "b"]
          }
        }
      )
      const jsonAnnotations = {
        "title": "title",
        "description": "description",
        "default": "a" as const,
        "examples": ["a", "b"] as const
      }
      assertJsonSchemaDocument(
        schema.annotate({ ...jsonAnnotations }),
        {
          schema: {
            "type": "string",
            "enum": ["a", "b"],
            ...jsonAnnotations
          }
        }
      )
    })

    it("nested literals", () => {
      const schema = Schema.Union([
        Schema.Literal("a"),
        Schema.Literals(["b", "c"])
      ])
      assertJsonSchemaDocument(
        schema,
        {
          schema: {
            "type": "string",
            "enum": ["a", "b", "c"]
          }
        }
      )
    })

    it("strings & inner annotate", () => {
      const schema = Schema.Union([
        Schema.Literal("a"),
        Schema.Literal("b").annotate({ description: "b-description" })
      ])
      assertJsonSchemaDocument(
        schema,
        {
          schema: {
            "anyOf": [
              {
                "type": "string",
                "enum": ["a"]
              },
              {
                "type": "string",
                "enum": ["b"],
                "description": "b-description"
              }
            ]
          }
        }
      )
      const jsonAnnotations = {
        "title": "title",
        "description": "description",
        "default": "a" as const,
        "examples": ["a", "b"] as const
      }
      assertJsonSchemaDocument(
        schema.annotate({ ...jsonAnnotations }),
        {
          schema: {
            "anyOf": [
              {
                "type": "string",
                "enum": ["a"]
              },
              {
                "type": "string",
                "enum": ["b"],
                "description": "b-description"
              }
            ],
            ...jsonAnnotations
          }
        }
      )
    })

    it("numbers", () => {
      const schema = Schema.Union([
        Schema.Literal(1),
        Schema.Literal(2)
      ])
      assertJsonSchemaDocument(
        schema,
        {
          schema: {
            "type": "number",
            "enum": [1, 2]
          }
        }
      )
      const jsonAnnotations = {
        "title": "title",
        "description": "description",
        "default": 1 as const,
        "examples": [1, 2] as const
      }
      assertJsonSchemaDocument(
        schema.annotate({ ...jsonAnnotations }),
        {
          schema: {
            "type": "number",
            "enum": [1, 2],
            ...jsonAnnotations
          }
        }
      )
    })

    it("booleans", () => {
      const schema = Schema.Union([
        Schema.Literal(true),
        Schema.Literal(false)
      ])
      assertJsonSchemaDocument(
        schema,
        {
          schema: {
            "type": "boolean",
            "enum": [true, false]
          }
        }
      )
      const jsonAnnotations = {
        "title": "title",
        "description": "description",
        "default": true as const,
        "examples": [true, false] as const
      }
      assertJsonSchemaDocument(
        schema.annotate({ ...jsonAnnotations }),
        {
          schema: {
            "type": "boolean",
            "enum": [true, false],
            ...jsonAnnotations
          }
        }
      )
    })

    it("strings & numbers", () => {
      const schema = Schema.Union([
        Schema.Literal("a"),
        Schema.Literal(1)
      ])
      assertJsonSchemaDocument(
        schema,
        {
          schema: {
            "anyOf": [
              {
                "type": "string",
                "enum": ["a"]
              },
              {
                "type": "number",
                "enum": [1]
              }
            ]
          }
        }
      )
      const jsonAnnotations = {
        "title": "title",
        "description": "description",
        "default": "a" as const,
        "examples": ["a", 1] as const
      }
      assertJsonSchemaDocument(
        schema.annotate({ ...jsonAnnotations }),
        {
          schema: {
            "anyOf": [
              {
                "type": "string",
                "enum": ["a"]
              },
              {
                "type": "number",
                "enum": [1]
              }
            ],
            ...jsonAnnotations
          }
        }
      )
    })
  })

  describe("Enum", () => {
    it("empty enum", () => {
      enum Empty {}
      const schema = Schema.Enum(Empty)
      assertJsonSchemaDocument(
        schema,
        {
          schema: {
            "not": {}
          }
        }
      )
      assertJsonSchemaDocument(
        schema.annotate({ description: "a" }),
        {
          schema: {
            "not": {},
            "description": "a"
          }
        }
      )
    })

    it("single enum", () => {
      enum Fruits {
        Apple
      }
      const schema = Schema.Enum(Fruits)
      assertJsonSchemaDocument(
        schema,
        {
          schema: {
            "anyOf": [
              {
                "type": "number",
                "enum": [0],
                "title": "Apple"
              }
            ]
          }
        }
      )
      assertJsonSchemaDocument(
        schema.annotate({ description: "a" }),
        {
          schema: {
            "description": "a",
            "anyOf": [
              {
                "type": "number",
                "enum": [0],
                "title": "Apple"
              }
            ]
          }
        }
      )
    })

    it("mixed enums (number & string)", () => {
      enum Fruits {
        Apple,
        Banana,
        Orange = "orange"
      }
      const schema = Schema.Enum(Fruits)
      assertJsonSchemaDocument(
        schema,
        {
          schema: {
            "anyOf": [
              {
                "type": "number",
                "enum": [0],
                "title": "Apple"
              },
              {
                "type": "number",
                "enum": [1],
                "title": "Banana"
              },
              {
                "type": "string",
                "enum": ["orange"],
                "title": "Orange"
              }
            ]
          }
        }
      )
      assertJsonSchemaDocument(
        schema.annotate({ description: "a" }),
        {
          schema: {
            "anyOf": [
              {
                "type": "number",
                "enum": [0],
                "title": "Apple"
              },
              {
                "type": "number",
                "enum": [1],
                "title": "Banana"
              },
              {
                "type": "string",
                "enum": ["orange"],
                "title": "Orange"
              }
            ],
            "description": "a"
          }
        }
      )
    })

    it("const enum", () => {
      const Fruits = {
        Apple: "apple",
        Banana: "banana",
        Cantaloupe: 3
      } as const
      const schema = Schema.Enum(Fruits)
      assertJsonSchemaDocument(
        schema,
        {
          schema: {
            "anyOf": [
              {
                "type": "string",
                "title": "Apple",
                "enum": ["apple"]
              },
              {
                "type": "string",
                "title": "Banana",
                "enum": ["banana"]
              },
              {
                "type": "number",
                "title": "Cantaloupe",
                "enum": [3]
              }
            ]
          }
        }
      )
    })
  })

  it("TemplateLiteral", () => {
    const schema = Schema.TemplateLiteral(["a", Schema.String])
    assertJsonSchemaDocument(schema, {
      schema: {
        "type": "string",
        "pattern": "^a[\\s\\S]*?$"
      }
    })
    assertJsonSchemaDocument(schema.annotate({ description: "a" }), {
      schema: {
        "type": "string",
        "pattern": "^a[\\s\\S]*?$",
        "description": "a"
      }
    })
  })

  describe("Struct", () => {
    it("empty struct", () => {
      const schema = Schema.Struct({})
      assertJsonSchemaDocument(
        schema,
        {
          schema: {
            "not": { "type": "null" }
          }
        }
      )
      assertJsonSchemaDocument(
        schema.annotate({ description: "a" }),
        {
          schema: {
            "not": { "type": "null" },
            "description": "a"
          }
        }
      )
    })

    describe("required property", () => {
      it("String", () => {
        assertJsonSchemaDocument(
          Schema.Struct({
            a: Schema.String
          }),
          {
            schema: {
              "type": "object",
              "properties": {
                "a": {
                  "type": "string"
                }
              },
              "required": ["a"],
              "additionalProperties": false
            }
          }
        )
      })

      it("String & annotate", () => {
        assertJsonSchemaDocument(
          Schema.Struct({
            a: Schema.String.annotate({ description: "a" })
          }),
          {
            schema: {
              "type": "object",
              "properties": {
                "a": {
                  "type": "string",
                  "description": "a"
                }
              },
              "required": ["a"],
              "additionalProperties": false
            }
          }
        )
      })

      it("String & annotateKey", () => {
        assertJsonSchemaDocument(
          Schema.Struct({
            a: Schema.String.annotateKey({ description: "a-key" })
          }),
          {
            schema: {
              "type": "object",
              "properties": {
                "a": {
                  "type": "string",
                  "allOf": [{
                    "description": "a-key"
                  }]
                }
              },
              "required": ["a"],
              "additionalProperties": false
            }
          }
        )
      })

      it("String & annotate & annotateKey", () => {
        assertJsonSchemaDocument(
          Schema.Struct({
            a: Schema.String.annotate({ description: "a" }).annotateKey({ description: "a-key" })
          }),
          {
            schema: {
              "type": "object",
              "properties": {
                "a": {
                  "type": "string",
                  "description": "a",
                  "allOf": [{
                    "description": "a-key"
                  }]
                }
              },
              "required": ["a"],
              "additionalProperties": false
            }
          }
        )
      })
    })

    describe("optionalKey", () => {
      it("String", () => {
        assertJsonSchemaDocument(
          Schema.Struct({
            a: Schema.optionalKey(Schema.String)
          }),
          {
            schema: {
              "type": "object",
              "properties": {
                "a": { "type": "string" }
              },
              "additionalProperties": false
            }
          }
        )
      })

      it("String & annotate", () => {
        assertJsonSchemaDocument(
          Schema.Struct({
            a: Schema.optionalKey(Schema.String.annotate({ description: "a" })),
            b: Schema.optionalKey(Schema.String).annotate({ description: "b" })
          }),
          {
            schema: {
              "type": "object",
              "properties": {
                "a": {
                  "type": "string",
                  "description": "a"
                },
                "b": {
                  "type": "string",
                  "description": "b"
                }
              },
              "additionalProperties": false
            }
          }
        )
      })

      it("String & annotateKey", () => {
        assertJsonSchemaDocument(
          Schema.Struct({
            a: Schema.optionalKey(Schema.String.annotateKey({ description: "a-key" })),
            b: Schema.optionalKey(Schema.String).annotateKey({ description: "b-key" })
          }),
          {
            schema: {
              "type": "object",
              "properties": {
                "a": {
                  "type": "string",
                  "allOf": [{
                    "description": "a-key"
                  }]
                },
                "b": {
                  "type": "string",
                  "allOf": [{
                    "description": "b-key"
                  }]
                }
              },
              "additionalProperties": false
            }
          }
        )
      })

      it("String & annotate & annotateKey", () => {
        assertJsonSchemaDocument(
          Schema.Struct({
            a: Schema.optionalKey(Schema.String.annotate({ description: "a" }).annotateKey({ description: "a-key" })),
            b: Schema.optionalKey(Schema.String).annotate({ description: "b" }).annotateKey({ description: "b-key" }),
            c: Schema.optionalKey(Schema.String.annotate({ description: "a" }).annotateKey({ description: "a-key" }))
              .annotate({ description: "c-outer" }).annotateKey({ description: "c-outer-key" })
          }),
          {
            schema: {
              "type": "object",
              "properties": {
                "a": {
                  "type": "string",
                  "description": "a",
                  "allOf": [{
                    "description": "a-key"
                  }]
                },
                "b": {
                  "type": "string",
                  "description": "b",
                  "allOf": [{
                    "description": "b-key"
                  }]
                },
                "c": {
                  "type": "string",
                  "description": "c-outer",
                  "allOf": [{
                    "description": "c-outer-key"
                  }]
                }
              },
              "additionalProperties": false
            }
          }
        )
      })

      it("optionalKey(String) to String", () => {
        assertJsonSchemaDocument(
          Schema.Struct({
            a: Schema.optionalKey(Schema.String).pipe(Schema.encodeTo(Schema.String, {
              decode: SchemaGetter.passthrough(),
              encode: SchemaGetter.withDefault(Effect.succeed(""))
            }))
          }),
          {
            schema: {
              "type": "object",
              "properties": {
                "a": {
                  "type": "string"
                }
              },
              "required": ["a"],
              "additionalProperties": false
            }
          }
        )
      })
    })

    describe("optional", () => {
      it("String", () => {
        assertJsonSchemaDocument(
          Schema.Struct({
            a: Schema.optional(Schema.String)
          }),
          {
            schema: {
              "type": "object",
              "properties": {
                "a": {
                  "anyOf": [
                    { "type": "string" },
                    { "type": "null" }
                  ]
                }
              },
              "additionalProperties": false
            }
          }
        )
      })

      it("String & annotate", () => {
        assertJsonSchemaDocument(
          Schema.Struct({
            a: Schema.optional(Schema.String.annotate({ description: "a" })),
            b: Schema.optional(Schema.String).annotate({ description: "b" })
          }),
          {
            schema: {
              "type": "object",
              "properties": {
                "a": {
                  "anyOf": [
                    { "type": "string", "description": "a" },
                    { "type": "null" }
                  ]
                },
                "b": {
                  "anyOf": [
                    { "type": "string" },
                    { "type": "null" }
                  ],
                  "description": "b"
                }
              },
              "additionalProperties": false
            }
          }
        )
      })

      it("String & annotateKey", () => {
        assertJsonSchemaDocument(
          Schema.Struct({
            a: Schema.optional(Schema.String).annotateKey({ description: "a-key" }),
            b: Schema.optional(Schema.String.annotate({ description: "b" })).annotateKey({ description: "b-key" })
          }),
          {
            schema: {
              "type": "object",
              "properties": {
                "a": {
                  "anyOf": [
                    { "type": "string" },
                    { "type": "null" }
                  ],
                  "allOf": [{
                    "description": "a-key"
                  }]
                },
                "b": {
                  "anyOf": [
                    { "type": "string", "description": "b" },
                    { "type": "null" }
                  ],
                  "allOf": [{
                    "description": "b-key"
                  }]
                }
              },
              "additionalProperties": false
            }
          }
        )
      })

      it("optional(String) to String", () => {
        assertJsonSchemaDocument(
          Schema.Struct({
            a: Schema.optional(Schema.String).pipe(Schema.encodeTo(Schema.String, {
              decode: SchemaGetter.passthrough(),
              encode: SchemaGetter.withDefault(Effect.succeed(""))
            }))
          }),
          {
            schema: {
              "type": "object",
              "properties": {
                "a": {
                  "type": "string"
                }
              },
              "required": ["a"],
              "additionalProperties": false
            }
          }
        )
      })
    })

    describe("UndefinedOr", () => {
      it("String", () => {
        assertJsonSchemaDocument(
          Schema.Struct({
            a: Schema.UndefinedOr(Schema.String)
          }),
          {
            schema: {
              "type": "object",
              "properties": {
                "a": {
                  "anyOf": [
                    { "type": "string" },
                    { "type": "null" }
                  ]
                }
              },
              "required": ["a"],
              "additionalProperties": false
            }
          }
        )
      })

      it("String & annotate", () => {
        assertJsonSchemaDocument(
          Schema.Struct({
            a: Schema.UndefinedOr(Schema.String.annotate({ description: "a" })),
            b: Schema.UndefinedOr(Schema.String).annotate({ description: "b" })
          }),
          {
            schema: {
              "type": "object",
              "properties": {
                "a": {
                  "anyOf": [
                    { "type": "string", "description": "a" },
                    { "type": "null" }
                  ]
                },
                "b": {
                  "anyOf": [
                    { "type": "string" },
                    { "type": "null" }
                  ],
                  "description": "b"
                }
              },
              "required": ["a", "b"],
              "additionalProperties": false
            }
          }
        )
      })

      it("String & annotateKey", () => {
        assertJsonSchemaDocument(
          Schema.Struct({
            a: Schema.UndefinedOr(Schema.String).annotateKey({ description: "a-key" }),
            b: Schema.UndefinedOr(Schema.String.annotate({ description: "b" })).annotateKey({ description: "b-key" })
          }),
          {
            schema: {
              "type": "object",
              "properties": {
                "a": {
                  "anyOf": [
                    { "type": "string" },
                    { "type": "null" }
                  ],
                  "allOf": [{
                    "description": "a-key"
                  }]
                },
                "b": {
                  "anyOf": [
                    { "type": "string", "description": "b" },
                    { "type": "null" }
                  ],
                  "allOf": [{
                    "description": "b-key"
                  }]
                }
              },
              "required": ["a", "b"],
              "additionalProperties": false
            }
          }
        )
      })

      it("UndefinedOr(String) to String", () => {
        assertJsonSchemaDocument(
          Schema.Struct({
            a: Schema.UndefinedOr(Schema.String).pipe(Schema.encodeTo(Schema.String, {
              decode: SchemaGetter.passthrough(),
              encode: SchemaGetter.transform((s) => s ?? "")
            }))
          }),
          {
            schema: {
              "type": "object",
              "properties": {
                "a": {
                  "type": "string"
                }
              },
              "required": ["a"],
              "additionalProperties": false
            }
          }
        )
      })
    })
  })

  describe("Record", () => {
    it("Record(String, Never)", () => {
      assertJsonSchemaDocument(
        Schema.Record(Schema.String, Schema.Never),
        {
          schema: {
            "type": "object",
            "additionalProperties": false
          }
        }
      )
      assertJsonSchemaDocument(
        Schema.Record(Schema.String, Schema.Never.annotate({ description: "a" })),
        {
          schema: {
            "type": "object",
            "additionalProperties": {
              "description": "a",
              "not": {}
            }
          }
        }
      )
    })

    it("Record(String, Struct({}))", () => {
      assertJsonSchemaDocument(
        Schema.Record(Schema.String, Schema.Struct({})),
        {
          schema: {
            type: "object",
            additionalProperties: { not: { type: "null" } }
          }
        }
      )
    })

    it("Record(isStartingWith, Struct({}))", () => {
      assertJsonSchemaDocument(
        Schema.Record(Schema.String.check(Schema.isStartingWith("a")), Schema.Struct({})),
        {
          schema: {
            type: "object",
            patternProperties: {
              "^a": { not: { type: "null" } }
            },
            additionalProperties: false
          }
        }
      )
    })

    it("Record(String, Finite)", () => {
      assertJsonSchemaDocument(
        Schema.Record(Schema.String, Schema.Finite),
        {
          schema: {
            "type": "object",
            "additionalProperties": {
              "type": "number"
            }
          }
        }
      )
      assertJsonSchemaDocument(
        Schema.Record(
          Schema.String.annotate({ description: "k" }), // TODO: where can we attach the description?
          Schema.Finite.annotate({ description: "v" })
        ).annotate({ description: "r" }),
        {
          schema: {
            "type": "object",
            "additionalProperties": {
              "type": "number",
              "description": "v"
            },
            "description": "r"
          }
        }
      )
    })

    it("JsonObject", () => {
      const schema = Schema.JsonObject
      assertJsonSchemaDocument(
        schema,
        {
          schema: { "type": "object" }
        }
      )
    })

    it("Record(`a${string}`, Number) & annotate", () => {
      assertJsonSchemaDocument(
        Schema.Record(Schema.TemplateLiteral(["a", Schema.String]), Schema.Finite),
        {
          schema: {
            "type": "object",
            "patternProperties": {
              "^a[\\s\\S]*?$": {
                "type": "number"
              }
            },
            "additionalProperties": false
          }
        }
      )
    })

    it("Record(Literals(['a', 'b']), Finite)", () => {
      assertJsonSchemaDocument(
        Schema.Record(Schema.Literals(["a", "b"]), Schema.Finite),
        {
          schema: {
            "type": "object",
            "properties": {
              "a": { "type": "number" },
              "b": { "type": "number" }
            },
            "required": ["a", "b"],
            "additionalProperties": false
          }
        }
      )
    })

    it("Record(isUppercased, Number)", () => {
      assertJsonSchemaDocument(
        Schema.Record(Schema.String.check(Schema.isUppercased()), Schema.Finite),
        {
          schema: {
            "type": "object",
            "propertyNames": {
              "type": "string",
              "pattern": "^[^a-z]*$"
            },
            "additionalProperties": { "type": "number" }
          }
        }
      )
    })

    it("uses propertyNames for conjunctive record key patterns", () => {
      assertJsonSchemaDocument(
        Schema.Record(Schema.String.check(Schema.isPattern(/^ab/u)), Schema.Finite),
        {
          schema: {
            type: "object",
            patternProperties: {
              "^ab": { type: "number" }
            },
            additionalProperties: false
          }
        }
      )
      assertJsonSchemaDocument(
        Schema.Record(
          Schema.String.check(Schema.isPattern(/^ab/u), Schema.isEndingWith("z")),
          Schema.Finite
        ),
        {
          schema: {
            type: "object",
            propertyNames: {
              type: "string",
              pattern: "^ab",
              allOf: [{ pattern: "z$" }]
            },
            additionalProperties: { type: "number" }
          }
        }
      )
      assertJsonSchemaDocument(
        Schema.Record(
          Schema.String.check(Schema.isStartingWith("A"), Schema.isUppercased()),
          Schema.Finite
        ),
        {
          schema: {
            type: "object",
            propertyNames: {
              type: "string",
              pattern: "^A",
              allOf: [{ pattern: "^[^a-z]*$" }]
            },
            additionalProperties: { type: "number" }
          }
        }
      )
    })

    it("does not use a partial pattern as an index selector", () => {
      const schema = Schema.Record(
        Schema.String.check(Schema.isStartingWith("x"), Schema.isMinLength(3)),
        Schema.Finite
      )
      assertJsonSchemaDocument(
        schema,
        {
          schema: {
            type: "object",
            additionalProperties: true
          }
        },
        { onExcessProperty: "ignore" }
      )
      assertJsonSchemaDocument(schema, {
        schema: {
          type: "object",
          propertyNames: {
            type: "string",
            pattern: "^x",
            minLength: 2
          },
          additionalProperties: { type: "number" }
        }
      })
    })

    describe("checks", () => {
      it("isMinProperties", () => {
        assertJsonSchemaDocument(
          Schema.Record(Schema.String, Schema.Finite).check(Schema.isMinProperties(2)),
          {
            schema: {
              "type": "object",
              "additionalProperties": {
                "type": "number"
              },
              "minProperties": 2
            }
          }
        )
      })

      it("isMaxProperties", () => {
        assertJsonSchemaDocument(
          Schema.Record(Schema.String, Schema.Finite).check(Schema.isMaxProperties(2)),
          {
            schema: {
              "type": "object",
              "additionalProperties": { "type": "number" },
              "maxProperties": 2
            }
          }
        )
      })

      it("isBetweenProperties", () => {
        assertJsonSchemaDocument(
          Schema.Record(Schema.String, Schema.Finite).check(Schema.isBetweenProperties(2, 2)),
          {
            schema: {
              "type": "object",
              "additionalProperties": { "type": "number" },
              "minProperties": 2,
              "maxProperties": 2
            }
          }
        )
      })
    })
  })

  describe("StructWithRest", () => {
    it("property and string index", () => {
      assertJsonSchemaDocument(
        Schema.StructWithRest(Schema.Struct({ a: Schema.String }), [
          Schema.Record(Schema.String, Schema.Union([Schema.Finite, Schema.String]))
        ]),
        {
          schema: {
            "type": "object",
            "properties": {
              "a": { "type": "string" }
            },
            "allOf": [{
              "type": "object",
              "additionalProperties": {
                "anyOf": [
                  { "type": "number" },
                  { "type": "string" }
                ]
              }
            }],
            "required": ["a"]
          }
        }
      )
    })

    it("pattern and string indexes", () => {
      assertJsonSchemaDocument(
        Schema.StructWithRest(Schema.Struct({}), [
          Schema.Record(Schema.String.check(Schema.isUppercased()), Schema.Finite),
          Schema.Record(Schema.String, Schema.Boolean)
        ]),
        {
          schema: {
            type: "object",
            propertyNames: {
              anyOf: [
                { type: "string", pattern: "^[^a-z]*$" },
                { type: "string" }
              ]
            },
            additionalProperties: {
              anyOf: [{ type: "number" }, { type: "boolean" }]
            },
            allOf: [{ type: "object", additionalProperties: { type: "boolean" } }]
          }
        }
      )
    })

    it("property and compound pattern index", () => {
      assertJsonSchemaDocument(
        Schema.StructWithRest(Schema.Struct({ a: Schema.String }), [
          Schema.Record(
            Schema.String.check(Schema.isStartingWith("x"), Schema.isEndingWith("z")),
            Schema.Finite
          )
        ]),
        {
          schema: {
            type: "object",
            properties: {
              a: { type: "string" }
            },
            required: ["a"],
            propertyNames: {
              anyOf: [
                { enum: ["a"] },
                {
                  type: "string",
                  pattern: "^x",
                  allOf: [{ pattern: "z$" }]
                }
              ]
            },
            additionalProperties: { type: "number" }
          }
        }
      )
    })
  })

  describe("Tuple", () => {
    it("empty tuple", () => {
      const schema = Schema.Tuple([])
      assertJsonSchemaDocument(
        schema,
        {
          schema: {
            "type": "array",
            "items": false
          }
        }
      )
      assertJsonSchemaDocument(
        schema.annotate({ description: "a" }),
        {
          schema: {
            "type": "array",
            "items": false,
            "description": "a"
          }
        }
      )
    })

    describe("required element", () => {
      it("String", () => {
        assertJsonSchemaDocument(
          Schema.Tuple([
            Schema.String
          ]),
          {
            schema: {
              "type": "array",
              "prefixItems": [{ "type": "string" }],
              "minItems": 1,
              "maxItems": 1
            }
          }
        )
      })

      it("String & annotate", () => {
        assertJsonSchemaDocument(
          Schema.Tuple([
            Schema.String.annotate({ description: "a" })
          ]),
          {
            schema: {
              "type": "array",
              "prefixItems": [{ "type": "string", "description": "a" }],
              "minItems": 1,
              "maxItems": 1
            }
          }
        )
      })

      it("String & annotateKey", () => {
        assertJsonSchemaDocument(
          Schema.Tuple([
            Schema.String.annotateKey({ description: "a-key" })
          ]),
          {
            schema: {
              "type": "array",
              "prefixItems": [{ "type": "string", "allOf": [{ "description": "a-key" }] }],
              "minItems": 1,
              "maxItems": 1
            }
          }
        )
      })

      it("String & annotate & annotateKey", () => {
        assertJsonSchemaDocument(
          Schema.Tuple([
            Schema.String.annotate({ description: "a" }).annotateKey({ description: "a-key" })
          ]),
          {
            schema: {
              "type": "array",
              "prefixItems": [{ "type": "string", "description": "a", "allOf": [{ "description": "a-key" }] }],
              "minItems": 1,
              "maxItems": 1
            }
          }
        )
      })
    })

    describe("optionalKey", () => {
      it("String", () => {
        assertJsonSchemaDocument(
          Schema.Tuple([
            Schema.optionalKey(Schema.String)
          ]),
          {
            schema: {
              "type": "array",
              "prefixItems": [
                { "type": "string" }
              ],
              "maxItems": 1
            }
          }
        )
      })

      it("String & annotate", () => {
        assertJsonSchemaDocument(
          Schema.Tuple([
            Schema.optionalKey(Schema.String.annotate({ description: "a" })),
            Schema.optionalKey(Schema.String).annotate({ description: "b" })
          ]),
          {
            schema: {
              "type": "array",
              "prefixItems": [
                { "type": "string", "description": "a" },
                { "type": "string", "description": "b" }
              ],
              "maxItems": 2
            }
          }
        )
      })

      it("String & annotateKey", () => {
        assertJsonSchemaDocument(
          Schema.Tuple([
            Schema.optionalKey(Schema.String.annotateKey({ description: "a-key" })),
            Schema.optionalKey(Schema.String).annotateKey({ description: "b-key" })
          ]),
          {
            schema: {
              "type": "array",
              "prefixItems": [
                { "type": "string", "allOf": [{ "description": "a-key" }] },
                {
                  "type": "string",
                  "allOf": [{ "description": "b-key" }]
                }
              ],
              "maxItems": 2
            }
          }
        )
      })

      it("String & annotate & annotateKey", () => {
        assertJsonSchemaDocument(
          Schema.Tuple([
            Schema.optionalKey(Schema.String.annotate({ description: "a" }).annotateKey({ description: "a-key" })),
            Schema.optionalKey(Schema.String).annotate({ description: "b" }).annotateKey({ description: "b-key" }),
            Schema.optionalKey(Schema.String.annotate({ description: "a" }).annotateKey({ description: "a-key" }))
              .annotate({ description: "c-outer" }).annotateKey({ description: "c-outer-key" })
          ]),
          {
            schema: {
              "type": "array",
              "prefixItems": [
                { "type": "string", "description": "a", "allOf": [{ "description": "a-key" }] },
                {
                  "type": "string",
                  "description": "b",
                  "allOf": [{ "description": "b-key" }]
                },
                { "type": "string", "description": "c-outer", "allOf": [{ "description": "c-outer-key" }] }
              ],
              "maxItems": 3
            }
          }
        )
      })

      it("optionalKey(String) to String", () => {
        assertJsonSchemaDocument(
          Schema.Tuple([
            Schema.optionalKey(Schema.String).pipe(Schema.encodeTo(Schema.String, {
              decode: SchemaGetter.passthrough(),
              encode: SchemaGetter.withDefault(Effect.succeed(""))
            }))
          ]),
          {
            schema: {
              "type": "array",
              "prefixItems": [{ "type": "string" }],
              "minItems": 1,
              "maxItems": 1
            }
          }
        )
      })
    })

    it("optionalKey to required key", () => {
      assertJsonSchemaDocument(
        Schema.Tuple([
          Schema.optionalKey(Schema.String).pipe(Schema.encodeTo(Schema.String, {
            decode: SchemaGetter.passthrough(),
            encode: SchemaGetter.withDefault(Effect.succeed(""))
          }))
        ]),
        {
          schema: {
            "type": "array",
            "prefixItems": [
              { "type": "string" }
            ],
            "minItems": 1,
            "maxItems": 1
          }
        }
      )
    })
  })

  describe("Array", () => {
    it("Array(String)", () => {
      assertJsonSchemaDocument(
        Schema.Array(Schema.String),
        {
          schema: {
            "type": "array",
            "items": { "type": "string" }
          }
        }
      )
      assertJsonSchemaDocument(
        Schema.Array(Schema.String).annotate({ description: "a" }),
        {
          schema: {
            "type": "array",
            "items": { "type": "string" },
            "description": "a"
          }
        }
      )
    })

    describe("checks", () => {
      it("isMinLength", () => {
        assertJsonSchemaDocument(
          Schema.Array(Schema.String).check(Schema.isMinLength(2)),
          {
            schema: {
              "type": "array",
              "items": { "type": "string" },
              "minItems": 2
            }
          }
        )
      })

      it("isMaxLength", () => {
        assertJsonSchemaDocument(
          Schema.Array(Schema.String).check(Schema.isMaxLength(2)),
          {
            schema: {
              "type": "array",
              "items": { "type": "string" },
              "maxItems": 2
            }
          }
        )
      })

      it("isBetweenLength", () => {
        assertJsonSchemaDocument(
          Schema.Array(Schema.String).check(Schema.isBetweenLength(2, 2)),
          {
            schema: {
              "type": "array",
              "items": { "type": "string" },
              "minItems": 2,
              "maxItems": 2
            }
          }
        )
      })

      it("UniqueArray", () => {
        assertJsonSchemaDocument(
          Schema.UniqueArray(Schema.String),
          {
            schema: {
              "type": "array",
              "items": { "type": "string" },
              "uniqueItems": true
            }
          }
        )
      })
    })
  })

  it("TupleWithRest", () => {
    assertJsonSchemaDocument(
      Schema.TupleWithRest(Schema.Tuple([Schema.String]), [Schema.Finite]),
      {
        schema: {
          "type": "array",
          "prefixItems": [
            { "type": "string" }
          ],
          "items": { "type": "number" },
          "minItems": 1
        }
      }
    )
  })

  describe("Union", () => {
    it("empty union", () => {
      const schema = Schema.Union([])
      assertJsonSchemaDocument(schema, {
        schema: {
          "not": {}
        }
      })
      assertJsonSchemaDocument(Schema.Union([]).annotate({ description: "a" }), {
        schema: {
          "not": {},
          "description": "a"
        }
      })
    })

    it("single member", () => {
      const schema = Schema.Union([Schema.String])
      assertJsonSchemaDocument(schema, {
        schema: {
          "anyOf": [
            {
              "type": "string"
            }
          ]
        }
      })
      assertJsonSchemaDocument(Schema.Union([Schema.String]).annotate({ description: "a" }), {
        schema: {
          "anyOf": [
            {
              "type": "string"
            }
          ],
          "description": "a"
        }
      })
      assertJsonSchemaDocument(
        Schema.Union([Schema.String.annotate({ description: "inner" })]).annotate({ description: "outer" }),
        {
          schema: {
            "anyOf": [
              {
                "type": "string",
                "description": "inner"
              }
            ],
            "description": "outer"
          }
        }
      )
    })

    it("uses anyOf when approximated oneOf branches can overlap", () => {
      const schema = Schema.Union([
        Schema.String.check(Schema.isMinLength(2)),
        Schema.String.check(Schema.isMaxLength(1))
      ], { mode: "oneOf" })
      assertJsonSchemaDocument(schema, {
        schema: {
          anyOf: [
            { type: "string", minLength: 1 },
            { type: "string", maxLength: 1 }
          ]
        }
      })
      assertJsonSchemaAcceptsEffectValues(schema, ["a", "ab", "😀"])
    })

    it("keeps oneOf when its branches are exact", () => {
      assertJsonSchemaDocument(
        Schema.Union([Schema.String, Schema.Boolean], { mode: "oneOf" }),
        { schema: { oneOf: [{ type: "string" }, { type: "boolean" }] } }
      )
    })

    it("does not compact duplicate enum values", () => {
      assertJsonSchemaDocument(
        Schema.Union([Schema.Literal("a"), Schema.Literal("a")]),
        {
          schema: {
            anyOf: [
              { type: "string", enum: ["a"] },
              { type: "string", enum: ["a"] }
            ]
          }
        }
      )
    })

    it("String | Number", () => {
      assertJsonSchemaDocument(
        Schema.Union([
          Schema.String,
          Schema.Finite
        ]),
        {
          schema: {
            "anyOf": [
              { "type": "string" },
              { "type": "number" }
            ]
          }
        }
      )
      assertJsonSchemaDocument(
        Schema.Union([
          Schema.String,
          Schema.Finite
        ]).annotate({ description: "description" }),
        {
          schema: {
            "anyOf": [
              { "type": "string" },
              { "type": "number" }
            ],
            "description": "description"
          }
        }
      )
    })

    it("String | BigInt", () => {
      assertJsonSchemaDocument(
        Schema.Union([
          Schema.String,
          Schema.BigInt
        ]),
        {
          schema: {
            "anyOf": [
              {
                "type": "string",
                "pattern": "^-?\\d+$"
              },
              { "type": "string" }
            ]
          }
        }
      )
      assertJsonSchemaDocument(
        Schema.Union([
          Schema.String,
          Schema.Finite
        ]).annotate({ description: "description" }),
        {
          schema: {
            "anyOf": [
              { "type": "string" },
              { "type": "number" }
            ],
            "description": "description"
          }
        }
      )
    })
  })

  it("mutually recursive schemas", () => {
    interface Expression {
      readonly type: "expression"
      readonly value: number | Operation
    }

    interface Operation {
      readonly type: "operation"
      readonly operator: "+" | "-"
      readonly left: Expression
      readonly right: Expression
    }

    const Expression = Schema.Struct({
      type: Schema.Literal("expression"),
      value: Schema.Union([Schema.Finite, Schema.suspend((): Schema.Codec<Operation> => Operation)])
    }).annotate({ identifier: "Expression" })

    const Operation = Schema.Struct({
      type: Schema.Literal("operation"),
      operator: Schema.Literals(["+", "-"]),
      left: Expression,
      right: Expression
    }).annotate({ identifier: "Operation" })

    assertJsonSchemaDocument(
      Operation,
      {
        schema: {
          "$ref": "#/$defs/Operation"
        },
        definitions: {
          Operation: {
            "type": "object",
            "properties": {
              "type": {
                "type": "string",
                "enum": [
                  "operation"
                ]
              },
              "operator": {
                "type": "string",
                "enum": [
                  "+",
                  "-"
                ]
              },
              "left": {
                "$ref": "#/$defs/Expression"
              },
              "right": {
                "$ref": "#/$defs/Expression"
              }
            },
            "required": [
              "type",
              "operator",
              "left",
              "right"
            ],
            "additionalProperties": false
          },
          Expression: {
            "type": "object",
            "properties": {
              "type": {
                "type": "string",
                "enum": [
                  "expression"
                ]
              },
              "value": {
                "anyOf": [
                  {
                    "type": "number"
                  },
                  {
                    "$ref": "#/$defs/Operation"
                  }
                ]
              }
            },
            "required": [
              "type",
              "value"
            ],
            "additionalProperties": false
          }
        }
      }
    )
    assertJsonSchemaDocument(
      Expression,
      {
        schema: {
          "$ref": "#/$defs/Expression"
        },
        definitions: {
          Operation: {
            "type": "object",
            "properties": {
              "type": {
                "type": "string",
                "enum": [
                  "operation"
                ]
              },
              "operator": {
                "type": "string",
                "enum": [
                  "+",
                  "-"
                ]
              },
              "left": {
                "$ref": "#/$defs/Expression"
              },
              "right": {
                "$ref": "#/$defs/Expression"
              }
            },
            "required": [
              "type",
              "operator",
              "left",
              "right"
            ],
            "additionalProperties": false
          },
          Expression: {
            "type": "object",
            "properties": {
              "type": {
                "type": "string",
                "enum": [
                  "expression"
                ]
              },
              "value": {
                "anyOf": [
                  {
                    "type": "number"
                  },
                  {
                    "$ref": "#/$defs/Operation"
                  }
                ]
              }
            },
            "required": [
              "type",
              "value"
            ],
            "additionalProperties": false
          }
        }
      }
    )
  })

  describe("fromJsonString", () => {
    it("top level fromJsonString", () => {
      assertJsonSchemaDocument(
        Schema.fromJsonString(Schema.FiniteFromString),
        {
          schema: {
            "type": "string",
            "contentMediaType": "application/json"
          }
        }
      )
    })

    it("preserves the content schema identifier as a canonical reference", () => {
      const MyEvent = Schema.Struct({
        value: Schema.String
      }).annotate({ identifier: "MyEvent" })

      assertJsonSchemaDocument(
        Schema.fromJsonString(MyEvent),
        {
          schema: {
            "$ref": "#/$defs/MyEventEncoded"
          },
          definitions: {
            "MyEventEncoded": {
              "type": "string",
              "contentMediaType": "application/json"
            }
          }
        }
      )
    })

    it("respects an explicit encoded-side identifier", () => {
      const MyEvent = Schema.Struct({
        value: Schema.String
      }).annotate({ identifier: "MyEvent" })
      const MyWireEvent = Schema.flip(
        Schema.flip(Schema.fromJsonString(MyEvent)).annotate({ identifier: "MyWireEvent" })
      )

      assertJsonSchemaDocument(
        MyWireEvent,
        {
          schema: {
            "$ref": "#/$defs/MyWireEvent"
          },
          definitions: {
            "MyWireEvent": {
              "type": "string",
              "contentMediaType": "application/json"
            }
          }
        }
      )
    })
  })

  it("Class preserves its identifier as a canonical reference", () => {
    class A extends Schema.Class<A>("A")({
      a: Schema.String
    }) {}
    assertJsonSchemaDocument(
      A,
      {
        schema: {
          "$ref": "#/$defs/AEncoded"
        },
        definitions: {
          "AEncoded": {
            "type": "object",
            "properties": {
              "a": { "type": "string" }
            },
            "required": ["a"],
            "additionalProperties": false
          }
        }
      },
      { includeAnnotationKey: () => true }
    )
  })

  it("Error preserves its identifier as a canonical reference", () => {
    class E extends Schema.Error<E>("E")({
      a: Schema.String
    }) {}
    assertJsonSchemaDocument(E, {
      schema: {
        "$ref": "#/$defs/EEncoded"
      },
      definitions: {
        "EEncoded": {
          "type": "object",
          "properties": {
            "a": { "type": "string" }
          },
          "required": ["a"],
          "additionalProperties": false
        }
      }
    })
  })
})
