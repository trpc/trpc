import { assert } from "@effect/vitest"
import { Brand, JsonSchema, Schema, SchemaRepresentation } from "effect"
import { TestSchema } from "effect/testing"
import { describe, it } from "vitest"
import { assertTrue, deepStrictEqual, strictEqual, throws } from "../../utils/assert.ts"

type Category = {
  readonly name: string
  readonly children: ReadonlyArray<Category>
}

const OuterCategory = Schema.Struct({
  name: Schema.String,
  children: Schema.Array(Schema.suspend((): Schema.Codec<Category> => OuterCategory))
}).annotate({ identifier: "Category" })

const InnerCategory = Schema.Struct({
  name: Schema.String,
  children: Schema.Array(
    Schema.suspend((): Schema.Codec<Category> => InnerCategory.annotate({ identifier: "Category" }))
  )
})

describe("toCodeDocument", () => {
  type Expected = {
    readonly codes: SchemaRepresentation.Code | ReadonlyArray<SchemaRepresentation.Code>
    readonly references?: {
      readonly nonRecursives?: ReadonlyArray<{
        readonly $ref: string
        readonly code: SchemaRepresentation.Code
      }>
      readonly recursives?: {
        readonly [$ref: string]: SchemaRepresentation.Code
      }
    }
    readonly artifacts?: ReadonlyArray<SchemaRepresentation.Artifact>
  }

  function assertSchema(input: {
    readonly schema: Schema.Constraint
  }, expected: Expected) {
    const multiDocument = SchemaRepresentation.toRepresentations([input.schema.ast])
    assertMultiDocument(multiDocument, expected)
  }

  function assertJsonSchema(input: {
    readonly schema: JsonSchema.JsonSchema
  }, expected: Expected) {
    const schema = SchemaRepresentation.fromJsonSchemaDocument(
      JsonSchema.fromSchemaDraft2020_12(input.schema),
      {
        onEnter: (js) =>
          js.type === "object" && js.additionalProperties === undefined
            ? { ...js, additionalProperties: false }
            : js
      }
    )
    assertMultiDocument(SchemaRepresentation.toRepresentations([schema.ast]), expected)
  }

  function assertMultiDocument(
    multiDocument: SchemaRepresentation.MultiDocument,
    expected: Expected
  ) {
    const codeDocument = SchemaRepresentation.toCodeDocument(multiDocument)
    deepStrictEqual(
      canonicalizeGeneratedCode(codeDocument),
      canonicalizeGeneratedCode({
        codes: Array.isArray(expected.codes) ? expected.codes : [expected.codes],
        references: {
          nonRecursives: expected.references?.nonRecursives ?? [],
          recursives: expected.references?.recursives ?? {}
        },
        artifacts: expected.artifacts ?? []
      })
    )
  }

  function canonicalizeGeneratedCode(input: unknown): unknown {
    if (typeof input === "string") {
      return input
        .replaceAll(/"expected": "(?:\\.|[^"\\])*"(?:, )?/g, "")
        .replaceAll(", }", " }")
        .replaceAll(".annotate({  })", "")
    }
    if (Array.isArray(input)) return input.map(canonicalizeGeneratedCode)
    if (typeof input !== "object" || input === null) return input
    return Object.fromEntries(
      Object.entries(input).map(([key, value]) => [key, canonicalizeGeneratedCode(value)])
    )
  }

  const makeCode = SchemaRepresentation.makeCode
  const templateType = (...types: ReadonlyArray<string>) => `\`${types.map((type) => `\${${type}}`).join("")}\``

  describe("Declaration", () => {
    it("declaration without a toCode annotation", () => {
      throws(
        () => assertSchema({ schema: Schema.instanceOf(URL) }, { codes: makeCode("", "") }),
        "Missing toCode callback\n  at [\"representations\"][0][\"annotations\"][\"toCode\"]"
      )
    })

    it("Error", () => {
      assertSchema({ schema: Schema.ErrorInstance() }, {
        codes: makeCode(`Schema.ErrorInstance()`, "globalThis.Error")
      })
    })

    it("Error with stack", () => {
      assertSchema({ schema: Schema.ErrorInstance({ includeStack: true }) }, {
        codes: makeCode(`Schema.ErrorInstance({"includeStack":true})`, "globalThis.Error")
      })
    })

    it("Error with excluded cause", () => {
      assertSchema({ schema: Schema.ErrorInstance({ excludeCause: true }) }, {
        codes: makeCode(`Schema.ErrorInstance({"excludeCause":true})`, "globalThis.Error")
      })
    })

    it("RegExp", () => {
      assertSchema({ schema: Schema.RegExp }, {
        codes: makeCode(`Schema.RegExp`, "globalThis.RegExp")
      })
    })

    it("URL", () => {
      assertSchema({ schema: Schema.URL }, {
        codes: makeCode(`Schema.URL`, "globalThis.URL")
      })
    })

    it("Uint8Array", () => {
      assertSchema({ schema: Schema.Uint8Array }, {
        codes: makeCode(`Schema.Uint8Array`, "globalThis.Uint8Array")
      })
    })

    it("URLSearchParams", () => {
      assertSchema({ schema: Schema.URLSearchParams }, {
        codes: makeCode(`Schema.URLSearchParams`, "globalThis.URLSearchParams")
      })
    })

    it("File", () => {
      assertSchema({ schema: Schema.File }, {
        codes: makeCode(`Schema.File`, "globalThis.File")
      })
    })

    it("FormData", () => {
      assertSchema({ schema: Schema.FormData }, {
        codes: makeCode(`Schema.FormData`, "globalThis.FormData")
      })
    })

    it("URLSearchParams", () => {
      assertSchema({ schema: Schema.URLSearchParams }, {
        codes: makeCode(`Schema.URLSearchParams`, "globalThis.URLSearchParams")
      })
    })

    describe("Date", () => {
      it("Date", () => {
        assertSchema({ schema: Schema.Date }, {
          codes: makeCode(`Schema.Date`, "globalThis.Date")
        })
      })

      it("Date & check", () => {
        assertSchema(
          { schema: Schema.Date.check(Schema.isGreaterThanDate(new Date(0))) },
          {
            codes: makeCode(`Schema.Date.check(Schema.isGreaterThanDate(new Date(0)))`, "globalThis.Date")
          }
        )
      })
    })

    it("Option(String)", () => {
      assertSchema(
        { schema: Schema.Option(Schema.String) },
        {
          codes: makeCode("Schema.Option(Schema.String)", "Option.Option<string>"),
          artifacts: [{
            _tag: "Import",
            importDeclaration: `import * as Option from "effect/Option"`
          }]
        }
      )
    })

    it("Result(String, Number)", () => {
      assertSchema(
        { schema: Schema.Result(Schema.String, Schema.Number) },
        {
          codes: makeCode("Schema.Result(Schema.String, Schema.Number)", "Result.Result<string, number>"),
          artifacts: [{
            _tag: "Import",
            importDeclaration: `import * as Result from "effect/Result"`
          }]
        }
      )
    })

    it("Redacted options", () => {
      assertSchema(
        {
          schema: Schema.Redacted(Schema.String, {
            label: "password",
            disallowJsonEncode: true
          })
        },
        {
          codes: makeCode(
            `Schema.Redacted(Schema.String, {"label":"password","disallowJsonEncode":true})`,
            "Redacted.Redacted<string>"
          ),
          artifacts: [{
            _tag: "Import",
            importDeclaration: `import * as Redacted from "effect/Redacted"`
          }]
        }
      )
    })

    it("CauseReason(String, Number)", () => {
      assertSchema({ schema: Schema.CauseReason(Schema.String, Schema.Number) }, {
        codes: makeCode("Schema.CauseReason(Schema.String, Schema.Number)", "Cause.Failure<string, number>"),
        artifacts: [{ _tag: "Import", importDeclaration: `import * as Cause from "effect/Cause"` }]
      })
    })

    it("Cause(String, Number)", () => {
      assertSchema({ schema: Schema.Cause(Schema.String, Schema.Number) }, {
        codes: makeCode("Schema.Cause(Schema.String, Schema.Number)", "Cause.Cause<string, number>"),
        artifacts: [{ _tag: "Import", importDeclaration: `import * as Cause from "effect/Cause"` }]
      })
    })

    it("Exit(String, Number, String)", () => {
      assertSchema({ schema: Schema.Exit(Schema.String, Schema.Number, Schema.Boolean) }, {
        codes: makeCode(
          "Schema.Exit(Schema.String, Schema.Number, Schema.Boolean)",
          "Exit.Exit<string, number, boolean>"
        ),
        artifacts: [{ _tag: "Import", importDeclaration: `import * as Exit from "effect/Exit"` }]
      })
    })
  })

  it("Null", () => {
    assertSchema({ schema: Schema.Null }, {
      codes: makeCode("Schema.Null", "null")
    })
    assertSchema(
      { schema: Schema.Null.annotate({ "description": "a" }) },
      {
        codes: makeCode(`Schema.Null.annotate({ "description": "a" })`, "null")
      }
    )
    assertSchema({ schema: Schema.Null.annotate({}) }, {
      codes: makeCode("Schema.Null", "null")
    })
  })

  it("Undefined", () => {
    assertSchema({ schema: Schema.Undefined }, {
      codes: makeCode("Schema.Undefined", "undefined")
    })
    assertSchema(
      { schema: Schema.Undefined.annotate({ "description": "a" }) },
      {
        codes: makeCode(`Schema.Undefined.annotate({ "description": "a" })`, "undefined")
      }
    )
  })

  it("Void", () => {
    assertSchema({ schema: Schema.Void }, {
      codes: makeCode("Schema.Void", "void")
    })
    assertSchema(
      { schema: Schema.Void.annotate({ "description": "a" }) },
      {
        codes: makeCode(`Schema.Void.annotate({ "description": "a" })`, "void")
      }
    )
  })

  it("Never", () => {
    assertSchema({ schema: Schema.Never }, {
      codes: makeCode("Schema.Never", "never")
    })
    assertSchema(
      { schema: Schema.Never.annotate({ "description": "a" }) },
      {
        codes: makeCode(`Schema.Never.annotate({ "description": "a" })`, "never")
      }
    )
  })

  it("Unknown", () => {
    assertSchema({ schema: Schema.Unknown }, {
      codes: makeCode("Schema.Unknown", "unknown")
    })
    assertSchema(
      { schema: Schema.Unknown.annotate({ "description": "a" }) },
      {
        codes: makeCode(`Schema.Unknown.annotate({ "description": "a" })`, "unknown")
      }
    )
  })

  it("Any", () => {
    assertSchema({ schema: Schema.Any }, {
      codes: makeCode("Schema.Any", "any")
    })
    assertSchema(
      { schema: Schema.Any.annotate({ "description": "a" }) },
      {
        codes: makeCode(`Schema.Any.annotate({ "description": "a" })`, "any")
      }
    )
  })

  describe("String", () => {
    it("String", () => {
      assertSchema({ schema: Schema.String }, {
        codes: makeCode("Schema.String", "string")
      })
    })

    it("String & identifier", () => {
      assertSchema({ schema: Schema.String.annotate({ identifier: "ID" }) }, {
        codes: makeCode("ID", "ID"),
        references: {
          nonRecursives: [
            {
              $ref: "ID",
              code: makeCode(`Schema.String.annotate({ "identifier": "ID" })`, "string")
            }
          ]
        }
      })
    })

    it("String & annotations", () => {
      assertSchema(
        { schema: Schema.String.annotate({ "description": "a" }) },
        {
          codes: makeCode(`Schema.String.annotate({ "description": "a" })`, "string")
        }
      )
    })

    it("String & check", () => {
      assertSchema(
        { schema: Schema.String.check(Schema.isMinLength(1)) },
        {
          codes: makeCode(`Schema.String.check(Schema.isMinLength(1))`, "string")
        }
      )
    })

    it("String & annotations & check", () => {
      assertSchema(
        { schema: Schema.String.annotate({ "description": "a" }).check(Schema.isMinLength(1)) },
        {
          codes: makeCode(
            `Schema.String.annotate({ "description": "a" }).check(Schema.isMinLength(1))`,
            "string"
          )
        }
      )
    })

    it("String & code point checks", () => {
      for (
        const [check, code] of [
          [Schema.isMinCodePoints(2), "Schema.isMinCodePoints(2)"],
          [Schema.isMaxCodePoints(3), "Schema.isMaxCodePoints(3)"],
          [Schema.isBetweenCodePoints(2, 3), "Schema.isBetweenCodePoints(2, 3)"]
        ] as const
      ) {
        assertSchema(
          { schema: Schema.String.check(check) },
          { codes: makeCode(`Schema.String.check(${code})`, "string") }
        )
      }
    })

    it("String & check + annotations", () => {
      assertSchema(
        { schema: Schema.String.check(Schema.isMinLength(1, { description: "a" })) },
        {
          codes: makeCode(`Schema.String.check(Schema.isMinLength(1).annotate({ "description": "a" }))`, "string")
        }
      )
    })

    it("String & check & annotations", () => {
      assertSchema(
        { schema: Schema.String.check(Schema.isMinLength(1)).annotate({ "description": "a" }) },
        {
          codes: makeCode(`Schema.String.check(Schema.isMinLength(1).annotate({ "description": "a" }))`, "string")
        }
      )
    })

    describe("checks", () => {
      it("isStartingWith", () => {
        assertSchema(
          { schema: Schema.String.check(Schema.isStartingWith("a")) },
          {
            codes: makeCode(`Schema.String.check(Schema.isStartingWith("a"))`, "string")
          }
        )
      })

      it("isEndingWith", () => {
        assertSchema(
          { schema: Schema.String.check(Schema.isEndingWith("a")) },
          {
            codes: makeCode(`Schema.String.check(Schema.isEndingWith("a"))`, "string")
          }
        )
      })

      it("isIncluding", () => {
        assertSchema(
          { schema: Schema.String.check(Schema.isIncluding("a")) },
          {
            codes: makeCode(`Schema.String.check(Schema.isIncluding("a"))`, "string")
          }
        )
      })

      it("isGUID with annotations", () => {
        assertSchema(
          { schema: Schema.String.check(Schema.isGUID({ message: "message" })) },
          {
            codes: makeCode(`Schema.String.check(Schema.isGUID().annotate({ "message": "message" }))`, "string")
          }
        )
      })
    })
  })

  describe("Number", () => {
    it("Number", () => {
      assertSchema({ schema: Schema.Number }, {
        codes: makeCode("Schema.Number", "number")
      })
      assertSchema(
        { schema: Schema.Number.annotate({ "description": "a" }) },
        {
          codes: makeCode(`Schema.Number.annotate({ "description": "a" })`, "number")
        }
      )
    })

    it("Number & check", () => {
      assertSchema(
        { schema: Schema.Number.check(Schema.isGreaterThan(10)) },
        {
          codes: makeCode(`Schema.Number.check(Schema.isGreaterThan(10))`, "number")
        }
      )
    })
  })

  it("Boolean", () => {
    assertSchema({ schema: Schema.Boolean }, {
      codes: makeCode("Schema.Boolean", "boolean")
    })
    assertSchema(
      { schema: Schema.Boolean.annotate({ "description": "a" }) },
      {
        codes: makeCode(`Schema.Boolean.annotate({ "description": "a" })`, "boolean")
      }
    )
  })

  describe("BigInt", () => {
    it("BigInt", () => {
      assertSchema({ schema: Schema.BigInt }, {
        codes: makeCode("Schema.BigInt", "bigint")
      })
      assertSchema(
        { schema: Schema.BigInt.annotate({ "description": "a" }) },
        {
          codes: makeCode(`Schema.BigInt.annotate({ "description": "a" })`, "bigint")
        }
      )
    })

    it("BigInt & check", () => {
      assertSchema(
        { schema: Schema.BigInt.check(Schema.isGreaterThanBigInt(10n)) },
        {
          codes: makeCode(`Schema.BigInt.check(Schema.isGreaterThanBigInt(10n))`, "bigint")
        }
      )
    })
  })

  it("Symbol", () => {
    assertSchema({ schema: Schema.Symbol }, {
      codes: makeCode("Schema.Symbol", "symbol")
    })
    assertSchema(
      { schema: Schema.Symbol.annotate({ "description": "a" }) },
      {
        codes: makeCode(`Schema.Symbol.annotate({ "description": "a" })`, "symbol")
      }
    )
  })

  it("ObjectKeyword", () => {
    assertSchema({ schema: Schema.ObjectKeyword }, {
      codes: makeCode("Schema.ObjectKeyword", "object")
    })
    assertSchema(
      { schema: Schema.ObjectKeyword.annotate({ "description": "a" }) },
      {
        codes: makeCode(`Schema.ObjectKeyword.annotate({ "description": "a" })`, "object")
      }
    )
  })

  describe("Literal", () => {
    it("string literal", () => {
      assertSchema({ schema: Schema.Literal("a") }, {
        codes: makeCode(`Schema.Literal("a")`, `"a"`)
      })
      assertSchema(
        { schema: Schema.Literal("a").annotate({ "description": "a" }) },
        {
          codes: makeCode(`Schema.Literal("a").annotate({ "description": "a" })`, `"a"`)
        }
      )
    })

    it("number literal", () => {
      assertSchema({ schema: Schema.Literal(1) }, {
        codes: makeCode(`Schema.Literal(1)`, "1")
      })
      assertSchema(
        { schema: Schema.Literal(1).annotate({ "description": "a" }) },
        {
          codes: makeCode(`Schema.Literal(1).annotate({ "description": "a" })`, "1")
        }
      )
    })

    it("boolean literal", () => {
      assertSchema({ schema: Schema.Literal(true) }, {
        codes: makeCode(`Schema.Literal(true)`, "true")
      })
      assertSchema(
        { schema: Schema.Literal(true).annotate({ "description": "a" }) },
        {
          codes: makeCode(`Schema.Literal(true).annotate({ "description": "a" })`, "true")
        }
      )
    })

    it("bigint literal", () => {
      assertSchema({ schema: Schema.Literal(100n) }, {
        codes: makeCode(`Schema.Literal(100n)`, "100n")
      })
      assertSchema(
        { schema: Schema.Literal(100n).annotate({ "description": "a" }) },
        {
          codes: makeCode(`Schema.Literal(100n).annotate({ "description": "a" })`, "100n")
        }
      )
    })
  })

  describe("UniqueSymbol", () => {
    it("should create a Symbol artifact", () => {
      assertSchema(
        { schema: Schema.UniqueSymbol(Symbol("a")) },
        {
          codes: makeCode(`Schema.UniqueSymbol(_symbol)`, "typeof _symbol"),
          artifacts: [{
            _tag: "Symbol",
            identifier: "_symbol",
            code: makeCode(`Symbol("a")`, `typeof _symbol`)
          }]
        }
      )
      assertSchema(
        { schema: Schema.UniqueSymbol(Symbol()) },
        {
          codes: makeCode(`Schema.UniqueSymbol(_symbol)`, "typeof _symbol"),
          artifacts: [{
            _tag: "Symbol",
            identifier: "_symbol",
            code: makeCode(`Symbol()`, `typeof _symbol`)
          }]
        }
      )
    })

    it("should create a global Symbol artifact", () => {
      assertSchema(
        { schema: Schema.UniqueSymbol(Symbol.for("a")) },
        {
          codes: makeCode(`Schema.UniqueSymbol(_symbol)`, "typeof _symbol"),
          artifacts: [{
            _tag: "Symbol",
            identifier: "_symbol",
            code: makeCode(`Symbol.for("a")`, `typeof _symbol`)
          }]
        }
      )
      assertSchema(
        { schema: Schema.UniqueSymbol(Symbol.for("a")).annotate({ "description": "a" }) },
        {
          codes: makeCode(
            `Schema.UniqueSymbol(_symbol).annotate({ "description": "a" })`,
            "typeof _symbol"
          ),
          artifacts: [{
            _tag: "Symbol",
            identifier: "_symbol",
            code: makeCode(`Symbol.for("a")`, `typeof _symbol`)
          }]
        }
      )
    })
  })

  describe("Enum", () => {
    it("string values", () => {
      assertSchema(
        {
          schema: Schema.Enum({
            A: "a",
            B: "b"
          })
        },
        {
          codes: makeCode(`Schema.Enum(_Enum)`, `_Enum`),
          artifacts: [{
            _tag: "Enum",
            identifier: "_Enum",
            code: makeCode(`enum _Enum { "A" = "a", "B" = "b" }`, `typeof _Enum`)
          }]
        }
      )
      assertSchema(
        {
          schema: Schema.Enum({
            A: "a",
            B: "b"
          }).annotate({ "description": "a" })
        },
        {
          codes: makeCode(
            `Schema.Enum(_Enum).annotate({ "description": "a" })`,
            `_Enum`
          ),
          artifacts: [{
            _tag: "Enum",
            identifier: "_Enum",
            code: makeCode(`enum _Enum { "A" = "a", "B" = "b" }`, `typeof _Enum`)
          }]
        }
      )
    })

    it("number values", () => {
      assertSchema(
        {
          schema: Schema.Enum({
            One: 1,
            Two: 2
          })
        },
        {
          codes: makeCode(`Schema.Enum(_Enum)`, `_Enum`),
          artifacts: [{
            _tag: "Enum",
            identifier: "_Enum",
            code: makeCode(`enum _Enum { "One" = 1, "Two" = 2 }`, `typeof _Enum`)
          }]
        }
      )
      assertSchema(
        {
          schema: Schema.Enum({
            One: 1,
            Two: 2
          }).annotate({ "description": "a" })
        },
        {
          codes: makeCode(
            `Schema.Enum(_Enum).annotate({ "description": "a" })`,
            `_Enum`
          ),
          artifacts: [{
            _tag: "Enum",
            identifier: "_Enum",
            code: makeCode(`enum _Enum { "One" = 1, "Two" = 2 }`, `typeof _Enum`)
          }]
        }
      )
    })

    it("mixed values", () => {
      assertSchema(
        {
          schema: Schema.Enum({
            A: "a",
            One: 1
          })
        },
        {
          codes: makeCode(`Schema.Enum(_Enum)`, `_Enum`),
          artifacts: [{
            _tag: "Enum",
            identifier: "_Enum",
            code: makeCode(`enum _Enum { "A" = "a", "One" = 1 }`, `typeof _Enum`)
          }]
        }
      )
      assertSchema(
        {
          schema: Schema.Enum({
            A: "a",
            One: 1
          }).annotate({ "description": "a" })
        },
        {
          codes: makeCode(
            `Schema.Enum(_Enum).annotate({ "description": "a" })`,
            `_Enum`
          ),
          artifacts: [{
            _tag: "Enum",
            identifier: "_Enum",
            code: makeCode(`enum _Enum { "A" = "a", "One" = 1 }`, `typeof _Enum`)
          }]
        }
      )
    })
  })

  describe("TemplateLiteral", () => {
    it("empty template literal", () => {
      assertSchema(
        { schema: Schema.TemplateLiteral([]) },
        {
          codes: makeCode(`Schema.TemplateLiteral([])`, "``")
        }
      )
    })

    it("string literal", () => {
      assertSchema(
        { schema: Schema.TemplateLiteral([Schema.Literal("a")]) },
        {
          codes: makeCode(`Schema.TemplateLiteral([Schema.Literal("a")])`, templateType(`"a"`))
        }
      )
    })

    it("number literal", () => {
      assertSchema(
        { schema: Schema.TemplateLiteral([Schema.Literal(1)]) },
        {
          codes: makeCode(`Schema.TemplateLiteral([Schema.Literal(1)])`, templateType("1"))
        }
      )
    })

    it("bigint literal", () => {
      assertSchema(
        { schema: Schema.TemplateLiteral([Schema.Literal(1n)]) },
        {
          codes: makeCode(`Schema.TemplateLiteral([Schema.Literal(1n)])`, templateType("1n"))
        }
      )
    })

    it("multiple consecutive literals", () => {
      assertSchema(
        { schema: Schema.TemplateLiteral([Schema.Literal("a"), Schema.Literal("b"), Schema.Literal("c")]) },
        {
          codes: makeCode(
            `Schema.TemplateLiteral([Schema.Literal("a"), Schema.Literal("b"), Schema.Literal("c")])`,
            templateType(`"a"`, `"b"`, `"c"`)
          )
        }
      )
    })

    it("special characters in literals", () => {
      assertSchema(
        { schema: Schema.TemplateLiteral([Schema.Literal("a b"), Schema.String]) },
        {
          codes: makeCode(
            `Schema.TemplateLiteral([Schema.Literal("a b"), Schema.String])`,
            templateType(`"a b"`, "string")
          )
        }
      )
      assertSchema(
        { schema: Schema.TemplateLiteral([Schema.Literal("\n"), Schema.String]) },
        {
          codes: makeCode(
            `Schema.TemplateLiteral([Schema.Literal("\\n"), Schema.String])`,
            templateType(`"\\n"`, "string")
          )
        }
      )

      for (const literal of ["`", "${number}", "\\"]) {
        const code = SchemaRepresentation.toCodeDocument(
          SchemaRepresentation.toRepresentations([
            Schema.TemplateLiteral([Schema.Literal(literal)]).ast
          ])
        ).codes[0]
        strictEqual(code.Type, templateType(JSON.stringify(literal)))
      }
    })

    it("only schemas", () => {
      assertSchema(
        { schema: Schema.TemplateLiteral([Schema.String]) },
        {
          codes: makeCode(`Schema.TemplateLiteral([Schema.String])`, "`${string}`")
        }
      )
      assertSchema(
        { schema: Schema.TemplateLiteral([Schema.Number]) },
        {
          codes: makeCode(`Schema.TemplateLiteral([Schema.Number])`, "`${number}`")
        }
      )
      assertSchema(
        { schema: Schema.TemplateLiteral([Schema.BigInt]) },
        {
          codes: makeCode(`Schema.TemplateLiteral([Schema.BigInt])`, "`${bigint}`")
        }
      )
      assertSchema(
        { schema: Schema.TemplateLiteral([Schema.String, Schema.Number]) },
        {
          codes: makeCode(
            `Schema.TemplateLiteral([Schema.String, Schema.Number])`,
            "`${string}${number}`"
          )
        }
      )
    })

    it("schema & literal", () => {
      assertSchema(
        { schema: Schema.TemplateLiteral([Schema.String, Schema.Literal("a")]) },
        {
          codes: makeCode(
            `Schema.TemplateLiteral([Schema.String, Schema.Literal("a")])`,
            templateType("string", `"a"`)
          )
        }
      )
      assertSchema(
        { schema: Schema.TemplateLiteral([Schema.Number, Schema.Literal("a")]) },
        {
          codes: makeCode(
            `Schema.TemplateLiteral([Schema.Number, Schema.Literal("a")])`,
            templateType("number", `"a"`)
          )
        }
      )
      assertSchema(
        { schema: Schema.TemplateLiteral([Schema.BigInt, Schema.Literal("a")]) },
        {
          codes: makeCode(
            `Schema.TemplateLiteral([Schema.BigInt, Schema.Literal("a")])`,
            templateType("bigint", `"a"`)
          )
        }
      )
    })

    it("literal & schema", () => {
      assertSchema(
        { schema: Schema.TemplateLiteral([Schema.Literal("a"), Schema.String]) },
        {
          codes: makeCode(
            `Schema.TemplateLiteral([Schema.Literal("a"), Schema.String])`,
            templateType(`"a"`, "string")
          )
        }
      )
      assertSchema(
        { schema: Schema.TemplateLiteral([Schema.Literal("a"), Schema.Number]) },
        {
          codes: makeCode(
            `Schema.TemplateLiteral([Schema.Literal("a"), Schema.Number])`,
            templateType(`"a"`, "number")
          )
        }
      )
      assertSchema(
        { schema: Schema.TemplateLiteral([Schema.Literal("a"), Schema.BigInt]) },
        {
          codes: makeCode(
            `Schema.TemplateLiteral([Schema.Literal("a"), Schema.BigInt])`,
            templateType(`"a"`, "bigint")
          )
        }
      )
    })

    it("schema & literal & schema", () => {
      assertSchema(
        { schema: Schema.TemplateLiteral([Schema.String, Schema.Literal("-"), Schema.Number]) },
        {
          codes: makeCode(
            `Schema.TemplateLiteral([Schema.String, Schema.Literal("-"), Schema.Number])`,
            templateType("string", `"-"`, "number")
          )
        }
      )
      assertSchema(
        {
          schema: Schema.TemplateLiteral([Schema.String, Schema.Literal("-"), Schema.Number]).annotate({
            "description": "ad"
          })
        },
        {
          codes: makeCode(
            `Schema.TemplateLiteral([Schema.String, Schema.Literal("-"), Schema.Number]).annotate({ "description": "ad" })`,
            templateType("string", `"-"`, "number")
          )
        }
      )
    })

    it("TemplateLiteral as part", () => {
      assertSchema(
        {
          schema: Schema.TemplateLiteral([
            Schema.Literal("a"),
            Schema.TemplateLiteral([Schema.String, Schema.Literals(["-", "+"]), Schema.Number])
          ])
        },
        {
          codes: makeCode(
            `Schema.TemplateLiteral([Schema.Literal("a"), Schema.TemplateLiteral([Schema.String, Schema.Literals(["-", "+"]), Schema.Number])])`,
            templateType(`"a"`, templateType("string", `"-" | "+"`, "number"))
          )
        }
      )
    })

    it("Union as part", () => {
      assertSchema(
        {
          schema: Schema.TemplateLiteral([Schema.Literal("a"), Schema.Union([Schema.String, Schema.Number])])
        },
        {
          codes: makeCode(
            `Schema.TemplateLiteral([Schema.Literal("a"), Schema.Union([Schema.String, Schema.Number])])`,
            templateType(`"a"`, "string | number")
          )
        }
      )
    })

    it("Literals as part", () => {
      assertSchema(
        {
          schema: Schema.TemplateLiteral([Schema.Literals(["a", "b"]), Schema.String])
        },
        {
          codes: makeCode(
            `Schema.TemplateLiteral([Schema.Literals(["a", "b"]), Schema.String])`,
            templateType(`"a" | "b"`, "string")
          )
        }
      )
    })

    it("omits brands from parts", () => {
      const schema = Schema.TemplateLiteral([
        Schema.String.pipe(Schema.brand("StringPart")),
        Schema.Union([
          Schema.Number.pipe(Schema.brand("NumberPart")),
          Schema.String.pipe(Schema.brand("OtherStringPart"))
        ])
      ])
      const code = SchemaRepresentation.toCodeDocument(
        SchemaRepresentation.toRepresentations([schema.ast])
      ).codes[0]

      strictEqual(
        code.runtime,
        `Schema.TemplateLiteral([Schema.String, Schema.Union([Schema.Number, Schema.String])])`
      )
      strictEqual(code.Type, templateType("string", "number | string"))
    })

    it("uses references for branded parts", () => {
      const part = Schema.String.pipe(Schema.brand("Part")).annotate({ identifier: "Part" })
      const code = SchemaRepresentation.toCodeDocument(
        SchemaRepresentation.toRepresentations([Schema.TemplateLiteral([part]).ast])
      ).codes[0]

      strictEqual(code.runtime, "Schema.TemplateLiteral([Part])")
      strictEqual(code.Type, templateType("Part"))
    })

    it("multiple unions", () => {
      assertSchema(
        {
          schema: Schema.TemplateLiteral([
            Schema.Union([Schema.Literal("a"), Schema.Literal("b")]),
            Schema.String,
            Schema.Union([Schema.Number, Schema.BigInt])
          ])
        },
        {
          codes: makeCode(
            `Schema.TemplateLiteral([Schema.Literals(["a", "b"]), Schema.String, Schema.Union([Schema.Number, Schema.BigInt])])`,
            templateType(`"a" | "b"`, "string", "number | bigint")
          )
        }
      )
    })

    it("does not expand combinations of unions", () => {
      const part = Schema.Literals(["a", "b"])
      const schema = Schema.TemplateLiteral(Array.from({ length: 20 }, () => part))
      const Type = SchemaRepresentation.toCodeDocument(
        SchemaRepresentation.toRepresentations([schema.ast])
      ).codes[0].Type

      strictEqual(Type, templateType(...Array.from({ length: 20 }, () => `"a" | "b"`)))
      assertTrue(Type.length < 500)
    })
  })

  describe("Tuple", () => {
    it("empty tuple", () => {
      assertSchema({ schema: Schema.Tuple([]) }, {
        codes: makeCode("Schema.Tuple([])", "readonly []")
      })
      assertSchema(
        { schema: Schema.Tuple([]).annotate({ "description": "a" }) },
        {
          codes: makeCode(`Schema.Tuple([]).annotate({ "description": "a" })`, "readonly []")
        }
      )
    })

    it("required element", () => {
      assertSchema(
        { schema: Schema.Tuple([Schema.String]) },
        {
          codes: makeCode(`Schema.Tuple([Schema.String])`, "readonly [string]")
        }
      )
      assertSchema(
        { schema: Schema.Tuple([Schema.String]).annotate({ "description": "a" }) },
        {
          codes: makeCode(
            `Schema.Tuple([Schema.String]).annotate({ "description": "a" })`,
            "readonly [string]"
          )
        }
      )
    })

    it("optional element", () => {
      assertSchema(
        { schema: Schema.Tuple([Schema.optionalKey(Schema.String)]) },
        {
          codes: makeCode(`Schema.Tuple([Schema.optionalKey(Schema.String)])`, `readonly [(string)?]`)
        }
      )
      assertSchema(
        { schema: Schema.Tuple([Schema.optionalKey(Schema.String)]).annotate({ "description": "a" }) },
        {
          codes: makeCode(
            `Schema.Tuple([Schema.optionalKey(Schema.String)]).annotate({ "description": "a" })`,
            `readonly [(string)?]`
          )
        }
      )
    })

    it("optional union elements", () => {
      assertSchema(
        { schema: Schema.Tuple([Schema.optionalKey(Schema.Union([Schema.String, Schema.Number]))]) },
        {
          codes: makeCode(
            `Schema.Tuple([Schema.optionalKey(Schema.Union([Schema.String, Schema.Number]))])`,
            `readonly [(string | number)?]`
          )
        }
      )
      assertSchema(
        { schema: Schema.Tuple([Schema.optionalKey(Schema.Literals(["a", "b"]))]) },
        {
          codes: makeCode(
            `Schema.Tuple([Schema.optionalKey(Schema.Literals(["a", "b"]))])`,
            `readonly [("a" | "b")?]`
          )
        }
      )
    })

    it("optional readonly tuple element", () => {
      assertSchema(
        { schema: Schema.Tuple([Schema.optionalKey(Schema.Tuple([Schema.String]))]) },
        {
          codes: makeCode(
            `Schema.Tuple([Schema.optionalKey(Schema.Tuple([Schema.String]))])`,
            `readonly [(readonly [string])?]`
          )
        }
      )
    })

    it("optional union element imported from JSON Schema", () => {
      assertJsonSchema({
        schema: {
          type: "array",
          prefixItems: [{ anyOf: [{ type: "string" }, { type: "number" }] }],
          items: false
        }
      }, {
        codes: makeCode(
          `Schema.Tuple([Schema.optionalKey(Schema.Union([Schema.String, Schema.Number.check(Schema.isFinite())]))])`,
          `readonly [(string | number)?]`
        )
      })
    })

    it("annotateKey", () => {
      assertSchema(
        { schema: Schema.Tuple([Schema.String.annotateKey({ "description": "a" })]) },
        {
          codes: makeCode(
            `Schema.Tuple([Schema.String.annotateKey({ "description": "a" })])`,
            "readonly [string]"
          )
        }
      )
    })
  })

  it("Array", () => {
    assertSchema(
      { schema: Schema.Array(Schema.String) },
      {
        codes: makeCode("Schema.Array(Schema.String)", "ReadonlyArray<string>")
      }
    )
    assertSchema(
      { schema: Schema.Array(Schema.String).annotate({ "description": "a" }) },
      {
        codes: makeCode(
          `Schema.Array(Schema.String).annotate({ "description": "a" })`,
          "ReadonlyArray<string>"
        )
      }
    )
  })

  it("TupleWithRest", () => {
    assertSchema(
      {
        schema: Schema.TupleWithRest(
          Schema.Tuple([Schema.optionalKey(Schema.Union([Schema.String, Schema.Number]))]),
          [Schema.Boolean]
        )
      },
      {
        codes: makeCode(
          `Schema.TupleWithRest(Schema.Tuple([Schema.optionalKey(Schema.Union([Schema.String, Schema.Number]))]), [Schema.Boolean])`,
          `readonly [(string | number)?, ...Array<boolean>]`
        )
      }
    )
    assertSchema(
      { schema: Schema.TupleWithRest(Schema.Tuple([Schema.String]), [Schema.Number]) },
      {
        codes: makeCode(
          `Schema.TupleWithRest(Schema.Tuple([Schema.String]), [Schema.Number])`,
          "readonly [string, ...Array<number>]"
        )
      }
    )
    assertSchema(
      {
        schema: Schema.TupleWithRest(Schema.Tuple([Schema.String]), [Schema.Number]).annotate({
          "description": "a"
        })
      },
      {
        codes: makeCode(
          `Schema.TupleWithRest(Schema.Tuple([Schema.String]), [Schema.Number]).annotate({ "description": "a" })`,
          "readonly [string, ...Array<number>]"
        )
      }
    )
    assertSchema(
      { schema: Schema.TupleWithRest(Schema.Tuple([Schema.String]), [Schema.Number, Schema.Boolean]) },
      {
        codes: makeCode(
          `Schema.TupleWithRest(Schema.Tuple([Schema.String]), [Schema.Number, Schema.Boolean])`,
          "readonly [string, ...Array<number>, boolean]"
        )
      }
    )
  })

  describe("Struct", () => {
    it("preserves a required __proto__ property in generated code", async () => {
      const schema = Schema.Struct({ ["__proto__"]: Schema.String })
      assertSchema({ schema }, {
        codes: makeCode(
          `Schema.Struct({ ["__proto__"]: Schema.String })`,
          `{ readonly "__proto__": string }`
        )
      })

      const document = SchemaRepresentation.toCodeDocument(SchemaRepresentation.toRepresentations([schema.ast]))
      const generated: typeof schema = new Function("Schema", `return ${document.codes[0].runtime}`)(Schema)
      assert.deepStrictEqual(Object.keys(generated.fields), ["__proto__"])
      const decoding = new TestSchema.Asserts(generated).decoding()
      await decoding.succeed({ ["__proto__"]: "value" })
      await decoding.fail({}, `Missing key\n  at ["__proto__"]`)
      await decoding.fail({ ["__proto__"]: 123 }, `Expected string\n  at ["__proto__"]`)
    })

    it("preserves an optional __proto__ property in generated code", async () => {
      const schema = Schema.Struct({ ["__proto__"]: Schema.optionalKey(Schema.String) })
      assertSchema({ schema }, {
        codes: makeCode(
          `Schema.Struct({ ["__proto__"]: Schema.optionalKey(Schema.String) })`,
          `{ readonly "__proto__"?: string }`
        )
      })

      const document = SchemaRepresentation.toCodeDocument(SchemaRepresentation.toRepresentations([schema.ast]))
      const generated: typeof schema = new Function("Schema", `return ${document.codes[0].runtime}`)(Schema)
      assert.deepStrictEqual(Object.keys(generated.fields), ["__proto__"])
      const decoding = new TestSchema.Asserts(generated).decoding()
      await decoding.succeed({})
      await decoding.succeed({ ["__proto__"]: "value" })
      await decoding.fail({ ["__proto__"]: 123 }, `Expected string\n  at ["__proto__"]`)
    })

    it("empty struct", () => {
      assertSchema({ schema: Schema.Struct({}) }, {
        codes: makeCode("Schema.Struct({  })", "{  }")
      })
      assertSchema(
        { schema: Schema.Struct({}).annotate({ "description": "a" }) },
        {
          codes: makeCode(`Schema.Struct({  }).annotate({ "description": "a" })`, "{  }")
        }
      )
    })

    it("required properties", () => {
      assertSchema(
        {
          schema: Schema.Struct({
            a: Schema.String
          })
        },
        {
          codes: makeCode(
            `Schema.Struct({ "a": Schema.String })`,
            `{ readonly "a": string }`
          )
        }
      )
      assertSchema(
        {
          schema: Schema.Struct({
            a: Schema.String,
            b: Schema.Number
          })
        },
        {
          codes: makeCode(
            `Schema.Struct({ "a": Schema.String, "b": Schema.Number })`,
            `{ readonly "a": string, readonly "b": number }`
          )
        }
      )
    })

    it("optional properties", () => {
      assertSchema(
        {
          schema: Schema.Struct({
            a: Schema.optionalKey(Schema.String)
          })
        },
        {
          codes: makeCode(
            `Schema.Struct({ "a": Schema.optionalKey(Schema.String) })`,
            `{ readonly "a"?: string }`
          )
        }
      )
    })

    it("mutable properties", () => {
      assertSchema(
        {
          schema: Schema.Struct({
            a: Schema.mutableKey(Schema.String)
          })
        },
        {
          codes: makeCode(
            `Schema.Struct({ "a": Schema.mutableKey(Schema.String) })`,
            `{ "a": string }`
          )
        }
      )
    })

    it("optional and mutable properties", () => {
      assertSchema(
        {
          schema: Schema.Struct({
            a: Schema.optionalKey(Schema.mutableKey(Schema.String))
          })
        },
        {
          codes: makeCode(
            `Schema.Struct({ "a": Schema.optionalKey(Schema.mutableKey(Schema.String)) })`,
            `{ "a"?: string }`
          )
        }
      )
    })

    it("annotateKey", () => {
      assertSchema(
        {
          schema: Schema.Struct({
            a: Schema.String.annotateKey({ "description": "a" })
          })
        },
        {
          codes: makeCode(
            `Schema.Struct({ "a": Schema.String.annotateKey({ "description": "a" }) })`,
            `{ readonly "a": string }`
          )
        }
      )
    })

    it("struct with symbol property key", () => {
      const sym = Symbol.for("a")
      assertSchema(
        {
          schema: Schema.Struct({
            [sym]: Schema.String
          })
        },
        {
          codes: makeCode(
            `Schema.Struct({ [_symbol]: Schema.String })`,
            `{ readonly [_symbol]: string }`
          ),
          artifacts: [{
            _tag: "Symbol",
            identifier: "_symbol",
            code: makeCode(`Symbol.for("a")`, `typeof _symbol`)
          }]
        }
      )
    })
  })

  it("Record(String, Number)", () => {
    assertSchema(
      {
        schema: Schema.Record(Schema.String, Schema.Number)
      },
      {
        codes: makeCode("Schema.Record(Schema.String, Schema.Number)", "{ readonly [x: string]: number }")
      }
    )
    assertSchema(
      {
        schema: Schema.Record(Schema.String, Schema.Number).annotate({ "description": "a" })
      },
      {
        codes: makeCode(
          `Schema.Record(Schema.String, Schema.Number).annotate({ "description": "a" })`,
          "{ readonly [x: string]: number }"
        )
      }
    )
  })

  it("StructWithRest", () => {
    assertSchema(
      {
        schema: Schema.StructWithRest(Schema.Struct({ a: Schema.Number }), [
          Schema.Record(Schema.String, Schema.Number)
        ])
      },
      {
        codes: makeCode(
          `Schema.StructWithRest(Schema.Struct({ "a": Schema.Number }), [Schema.Record(Schema.String, Schema.Number)])`,
          `{ readonly "a": number } & { readonly [x: string]: number }`
        )
      }
    )
    assertSchema(
      {
        schema: Schema.StructWithRest(Schema.Struct({ a: Schema.Number }), [
          Schema.Record(Schema.String, Schema.Number)
        ]).annotate({ description: "a" })
      },
      {
        codes: makeCode(
          `Schema.StructWithRest(Schema.Struct({ "a": Schema.Number }), [Schema.Record(Schema.String, Schema.Number)]).annotate({ "description": "a" })`,
          `{ readonly "a": number } & { readonly [x: string]: number }`
        )
      }
    )
  })

  describe("Union", () => {
    it("union with anyOf mode (default)", () => {
      assertSchema(
        {
          schema: Schema.Union([Schema.String, Schema.Number])
        },
        {
          codes: makeCode("Schema.Union([Schema.String, Schema.Number])", "string | number")
        }
      )
      assertSchema(
        {
          schema: Schema.Union([Schema.String, Schema.Number]).annotate({ "description": "z" })
        },
        {
          codes: makeCode(
            `Schema.Union([Schema.String, Schema.Number]).annotate({ "description": "z" })`,
            "string | number"
          )
        }
      )
    })

    it("union with oneOf mode", () => {
      assertSchema(
        {
          schema: Schema.Union([Schema.String, Schema.Number], { mode: "oneOf" })
        },
        {
          codes: makeCode(
            `Schema.Union([Schema.String, Schema.Number], { mode: "oneOf" })`,
            "string | number"
          )
        }
      )
      assertSchema(
        {
          schema: Schema.Union([Schema.String, Schema.Number], { mode: "oneOf" }).annotate({ "description": "aa" })
        },
        {
          codes: makeCode(
            `Schema.Union([Schema.String, Schema.Number], { mode: "oneOf" }).annotate({ "description": "aa" })`,
            "string | number"
          )
        }
      )
    })

    it("union with multiple types", () => {
      assertSchema(
        {
          schema: Schema.Union([Schema.String, Schema.Number, Schema.Boolean])
        },
        {
          codes: makeCode(
            "Schema.Union([Schema.String, Schema.Number, Schema.Boolean])",
            "string | number | boolean"
          )
        }
      )
      assertSchema(
        {
          schema: Schema.Union([Schema.String, Schema.Number, Schema.Boolean]).annotate({ "description": "a" })
        },
        {
          codes: makeCode(
            `Schema.Union([Schema.String, Schema.Number, Schema.Boolean]).annotate({ "description": "a" })`,
            "string | number | boolean"
          )
        }
      )
    })
  })

  describe("suspend", () => {
    it("implicit recursive reference", () => {
      assertMultiDocument({
        representations: [{ _tag: "Reference", $ref: "Category" }],
        references: {
          Category: {
            _tag: "Objects",
            propertySignatures: [{
              name: "children",
              type: {
                _tag: "Arrays",
                elements: [],
                rest: [{ _tag: "Reference", $ref: "Category" }],
                checks: []
              },
              isOptional: false,
              isMutable: false
            }],
            indexSignatures: [],
            checks: []
          }
        }
      }, {
        codes: makeCode("Category", "Category"),
        references: {
          recursives: {
            Category: makeCode(
              `Schema.Struct({ "children": Schema.Array(Schema.suspend((): Schema.Codec<Category> => Category)) })`,
              `{ readonly "children": ReadonlyArray<Category> }`
            )
          }
        }
      })
    })

    it("supports __proto__ as a recursive reference", () => {
      const references = Object.fromEntries([["__proto__", {
        _tag: "Objects",
        propertySignatures: [{
          name: "next",
          type: { _tag: "Reference", $ref: "__proto__" },
          isOptional: true,
          isMutable: false
        }],
        indexSignatures: [],
        checks: []
      }]]) as SchemaRepresentation.References

      assertMultiDocument({
        representations: [{ _tag: "Reference", $ref: "__proto__" }],
        references
      }, {
        codes: makeCode("__proto__", "__proto__"),
        references: {
          recursives: Object.fromEntries([[
            "__proto__",
            makeCode(
              `Schema.Struct({ "next": Schema.optionalKey(Schema.suspend((): Schema.Codec<__proto__> => __proto__)) })`,
              `{ readonly "next"?: __proto__ }`
            )
          ]])
        }
      })
    })

    it("non-recursive", () => {
      assertSchema(
        {
          schema: Schema.suspend(() => Schema.String)
        },
        {
          codes: makeCode(`Schema.suspend((): Schema.Codec<string> => Schema.String)`, "string")
        }
      )
    })

    it("no identifier annotation", () => {
      type A = {
        readonly a?: A
      }
      const A = Schema.Struct({
        a: Schema.optionalKey(Schema.suspend((): Schema.Codec<A> => A))
      })

      assertSchema({ schema: A }, {
        codes: makeCode(`Objects_`, `Objects_`),
        references: {
          recursives: {
            Objects_: makeCode(
              `Schema.Struct({ "a": Schema.optionalKey(Schema.suspend((): Schema.Codec<Objects_> => Objects_)) })`,
              `{ readonly "a"?: Objects_ }`
            )
          }
        }
      })
    })

    it("outer identifier annotation", () => {
      type A = {
        readonly a?: A
      }
      const A = Schema.Struct({
        a: Schema.optionalKey(Schema.suspend((): Schema.Codec<A> => A))
      }).annotate({ identifier: "A" }) // outer identifier annotation

      assertSchema({ schema: A }, {
        codes: makeCode(`A`, `A`),
        references: {
          recursives: {
            A: makeCode(
              `Schema.Struct({ "a": Schema.optionalKey(Schema.suspend((): Schema.Codec<A> => A)) }).annotate({ "identifier": "A" })`,
              `{ readonly "a"?: A }`
            )
          }
        }
      })
    })

    it("inner identifier annotation", () => {
      type A = {
        readonly a?: A
      }
      const A = Schema.Struct({
        a: Schema.optionalKey(Schema.suspend((): Schema.Codec<A> => A.annotate({ identifier: "A" })))
      })

      assertSchema({ schema: A }, {
        codes: makeCode(
          `Schema.Struct({ "a": Schema.optionalKey(Suspend_) })`,
          `{ readonly "a"?: Suspend_ }`
        ),
        references: {
          recursives: {
            A: makeCode(
              `Schema.Struct({ "a": Schema.optionalKey(Schema.suspend((): Schema.Codec<Suspend_> => Suspend_)) }).annotate({ "identifier": "A" })`,
              `{ readonly "a"?: Suspend_ }`
            ),
            Suspend_: makeCode(
              `Schema.suspend((): Schema.Codec<A> => A)`,
              `A`
            )
          }
        }
      })
    })

    it("suspend identifier annotation", () => {
      type A = {
        readonly a?: A
      }
      const A = Schema.Struct({
        a: Schema.optionalKey(Schema.suspend((): Schema.Codec<A> => A).annotate({ identifier: "A" }))
      })

      assertSchema({ schema: A }, {
        codes: makeCode(`Objects_`, `Objects_`),
        references: {
          recursives: {
            A: makeCode(
              `Schema.suspend((): Schema.Codec<Objects_> => Objects_).annotate({ "identifier": "A" })`,
              `Objects_`
            ),
            Objects_: makeCode(
              `Schema.Struct({ "a": Schema.optionalKey(Schema.suspend((): Schema.Codec<A> => A)) })`,
              `{ readonly "a"?: A }`
            )
          }
        }
      })
    })
  })

  describe("brand", () => {
    it("omits brands", () => {
      assertSchema(
        {
          schema: Schema.String.pipe(Schema.brand("a"), Schema.brand("b"))
        },
        {
          codes: makeCode(`Schema.String`, `string`)
        }
      )
    })

    it("omits brands from unions", () => {
      assertSchema(
        {
          schema: Schema.Union([Schema.String, Schema.Number]).pipe(Schema.brand("a"))
        },
        {
          codes: makeCode(`Schema.Union([Schema.String, Schema.Number])`, `string | number`)
        }
      )
    })

    it("preserves checks added by fromBrand", () => {
      type Int = number & Brand.Brand<"Int">
      const Int = Brand.check<Int>(Schema.isInt())
      type Positive = number & Brand.Brand<"Positive">
      const Positive = Brand.check<Positive>(Schema.isGreaterThan(0))

      assertSchema(
        {
          schema: Schema.Number.pipe(
            Schema.fromBrand("Int", Int),
            Schema.fromBrand("Positive", Positive)
          )
        },
        {
          codes: makeCode(
            `Schema.Number.check(Schema.isInt().annotate({ "expected": "an integer" })).check(Schema.isGreaterThan(0).annotate({ "expected": "a value greater than 0" }))`,
            `number`
          )
        }
      )
    })
  })

  describe("Date", () => {
    it("Date", () => {
      assertSchema({ schema: Schema.Date }, {
        codes: makeCode(`Schema.Date`, "globalThis.Date")
      })
    })

    describe("checks", () => {
      it("isGreaterThanDate", () => {
        assertSchema(
          { schema: Schema.Date.check(Schema.isGreaterThanDate(new Date(0))) },
          {
            codes: makeCode(`Schema.Date.check(Schema.isGreaterThanDate(new Date(0)))`, "globalThis.Date")
          }
        )
      })

      it("isGreaterThanOrEqualToDate", () => {
        assertSchema(
          { schema: Schema.Date.check(Schema.isGreaterThanOrEqualToDate(new Date(0))) },
          {
            codes: makeCode(`Schema.Date.check(Schema.isGreaterThanOrEqualToDate(new Date(0)))`, "globalThis.Date")
          }
        )
      })

      it("isLessThanDate", () => {
        assertSchema(
          { schema: Schema.Date.check(Schema.isLessThanDate(new Date(0))) },
          {
            codes: makeCode(`Schema.Date.check(Schema.isLessThanDate(new Date(0)))`, "globalThis.Date")
          }
        )
      })

      it("isLessThanOrEqualToDate", () => {
        assertSchema(
          { schema: Schema.Date.check(Schema.isLessThanOrEqualToDate(new Date(0))) },
          {
            codes: makeCode(`Schema.Date.check(Schema.isLessThanOrEqualToDate(new Date(0)))`, "globalThis.Date")
          }
        )
      })

      it("isBetweenDate", () => {
        assertSchema(
          { schema: Schema.Date.check(Schema.isBetweenDate({ minimum: new Date(0), maximum: new Date(1) })) },
          {
            codes: makeCode(
              `Schema.Date.check(Schema.isBetweenDate({ minimum: new Date(0), maximum: new Date(1), exclusiveMinimum: undefined, exclusiveMaximum: undefined }))`,
              "globalThis.Date"
            )
          }
        )
      })
    })
  })

  describe("ReadonlySet", () => {
    it("ReadonlySet(String)", () => {
      assertSchema({ schema: Schema.ReadonlySet(Schema.String) }, {
        codes: makeCode(
          `Schema.ReadonlySet(Schema.String)`,
          "globalThis.ReadonlySet<string>"
        )
      })
    })

    describe("checks", () => {
      it("isMinSize", () => {
        assertSchema(
          { schema: Schema.ReadonlySet(Schema.String).check(Schema.isMinSize(2)) },
          {
            codes: makeCode(
              `Schema.ReadonlySet(Schema.String).check(Schema.isMinSize(2))`,
              "globalThis.ReadonlySet<string>"
            )
          }
        )
      })

      it("isMaxSize", () => {
        assertSchema(
          { schema: Schema.ReadonlySet(Schema.String).check(Schema.isMaxSize(2)) },
          {
            codes: makeCode(
              `Schema.ReadonlySet(Schema.String).check(Schema.isMaxSize(2))`,
              "globalThis.ReadonlySet<string>"
            )
          }
        )
      })
    })

    it("isBetweenSize", () => {
      assertSchema(
        { schema: Schema.ReadonlySet(Schema.String).check(Schema.isBetweenSize(2, 2)) },
        {
          codes: makeCode(
            `Schema.ReadonlySet(Schema.String).check(Schema.isBetweenSize(2, 2))`,
            "globalThis.ReadonlySet<string>"
          )
        }
      )
    })
  })

  describe("HashMap", () => {
    it("HashMap(String, Number)", () => {
      assertSchema({ schema: Schema.HashMap(Schema.String, Schema.Number) }, {
        codes: makeCode(
          `Schema.HashMap(Schema.String, Schema.Number)`,
          "HashMap.HashMap<string, number>"
        ),
        artifacts: [{ _tag: "Import", importDeclaration: `import * as HashMap from "effect/HashMap"` }]
      })
    })
  })

  describe("allOf", () => {
    it("should resolve references", () => {
      assertJsonSchema({
        schema: {
          allOf: [
            { $ref: "#/$defs/A" }
          ],
          $defs: {
            A: {
              type: "string"
            }
          }
        }
      }, {
        codes: makeCode(`A`, "A"),
        references: {
          nonRecursives: [{
            $ref: "A",
            code: makeCode(
              `Schema.String.annotate({ "identifier": "A" })`,
              "string"
            )
          }]
        }
      })
    })

    it("should resolve references in definitions", () => {
      assertJsonSchema({
        schema: {
          $ref: "#/$defs/A",
          $defs: {
            A: {
              allOf: [
                { $ref: "#/$defs/B" },
                {
                  type: "object",
                  properties: {
                    a: {
                      type: "string"
                    },
                    b: {}
                  },
                  required: ["a"]
                }
              ]
            },
            B: {
              type: "object",
              properties: {
                b: {
                  type: "number"
                },
                a: {}
              },
              required: ["b"]
            }
          }
        }
      }, {
        codes: makeCode(`A`, "A"),
        references: {
          nonRecursives: [
            {
              $ref: "A",
              code: makeCode(
                `Schema.Struct({ "b": Schema.Number.check(Schema.isFinite()), "a": Schema.String }).annotate({ "identifier": "A" })`,
                `{ readonly "b": number, readonly "a": string }`
              )
            }
          ]
        }
      })
    })
  })
})
