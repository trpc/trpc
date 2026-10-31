import { parseConstValue } from "@effect/graphql-generator/internal/Parser"
import { assert, describe, it } from "@effect/vitest"
import * as Result from "effect/Result"
import {
  argument,
  assertDefinitions,
  assertDiagnostic,
  directive,
  fieldDefinition,
  inputValue,
  int,
  list,
  name,
  namedType,
  nonNull,
  source,
  str,
  stripLoc
} from "./utils/ast.ts"

describe("Parser: type-system documents", () => {
  it("object type: leading ampersand, field arguments, defaults, descriptions and deprecation", () => {
    assertDefinitions(
      `type T implements & A & B @d {
        "f doc"
        f("a doc" a: Int = 1, b: [String!]! @deprecated(reason: "r")): String! @deprecated
      }`,
      [{
        _tag: "ObjectTypeDefinition",
        name: name("T"),
        interfaces: [namedType("A"), namedType("B")],
        directives: [directive("d")],
        fields: [
          fieldDefinition("f", nonNull(namedType("String")), {
            description: "f doc",
            arguments: [
              inputValue("a", namedType("Int"), { description: "a doc", defaultValue: int("1") }),
              inputValue("b", nonNull(list(nonNull(namedType("String")))), {
                directives: [directive("deprecated", [argument("reason", str("r"))])]
              })
            ],
            directives: [directive("deprecated")]
          })
        ]
      }]
    )
  })

  it("union with a leading pipe", () => {
    assertDefinitions("union U @d = | A | B", [{
      _tag: "UnionTypeDefinition",
      name: name("U"),
      directives: [directive("d")],
      types: [namedType("A"), namedType("B")]
    }])
  })

  it("repeatable directive definition", () => {
    assertDefinitions("\"d\" directive @d(a: Int = 2) repeatable on | QUERY | FIELD_DEFINITION", [{
      _tag: "DirectiveDefinition",
      description: str("d"),
      name: name("d"),
      arguments: [inputValue("a", namedType("Int"), { defaultValue: int("2") })],
      repeatable: true,
      locations: [name("QUERY"), name("FIELD_DEFINITION")]
    }])
  })

  it("extend type with interfaces, directives or fields", () => {
    assertDefinitions("extend type T implements I @d { f: Int } extend type T @e", [
      {
        _tag: "ObjectTypeExtension",
        name: name("T"),
        interfaces: [namedType("I")],
        directives: [directive("d")],
        fields: [fieldDefinition("f", namedType("Int"))]
      },
      { _tag: "ObjectTypeExtension", name: name("T"), interfaces: [], directives: [directive("e")], fields: [] }
    ])
  })

  describe("diagnostics", () => {
    it("extend type with nothing to extend", () => {
      assertDiagnostic("extend type T", { line: 1, column: 14, message: "Unexpected <EOF>." })
    })

    it("reserved enum value name", () => {
      assertDiagnostic("enum E { true }", {
        line: 1,
        column: 10,
        message: "Name \"true\" is reserved and cannot be used for an enum value."
      })
    })

    it("unknown directive location", () => {
      assertDiagnostic("directive @d on FOO", { line: 1, column: 17, message: "Unexpected Name \"FOO\"." })
    })

    it("description on an extension", () => {
      assertDiagnostic("\"desc\" extend type T { f: Int }", {
        line: 1,
        column: 1,
        message: "Unexpected description, only GraphQL definitions support descriptions."
      })
    })
  })

  describe("parseConstValue", () => {
    it("parses a const value that spans the whole source", () => {
      const result = parseConstValue(source("{a: [1, \"x\"], b: ENUM}", "defaultValue"))
      assert(Result.isSuccess(result))
      assert.deepStrictEqual(stripLoc(result.success), {
        _tag: "ObjectValue",
        fields: [
          { _tag: "ObjectField", name: name("a"), value: { _tag: "ListValue", values: [int("1"), str("x")] } },
          { _tag: "ObjectField", name: name("b"), value: { _tag: "EnumValue", value: "ENUM" } }
        ]
      })
    })

    it("rejects variables", () => {
      assertDiagnostic(
        "[1, $v]",
        { line: 1, column: 5, message: "Unexpected variable \"$v\" in constant value." },
        parseConstValue
      )
    })

    it("rejects trailing tokens", () => {
      assertDiagnostic("1 2", { line: 1, column: 3, message: "Expected <EOF>, found Int \"2\"." }, parseConstValue)
    })
  })
})
