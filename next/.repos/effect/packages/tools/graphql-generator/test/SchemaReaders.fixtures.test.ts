/**
 * Schema model features the GitHub fixtures lack, plus the newer introspection
 * keys read from `test/fixtures/introspection/modern.json`.
 */
import * as IntrospectionReader from "@effect/graphql-generator/internal/IntrospectionReader"
import { assert, describe, it } from "@effect/vitest"
import * as Result from "effect/Result"
import { source } from "./utils/ast.ts"
import {
  assertModelsEqual,
  assertType,
  enumType,
  enumValue,
  field,
  fixture,
  inputObjectType,
  inputValue,
  interfaceType,
  list,
  named,
  nonNull,
  objectType,
  readIntrospection,
  readSdl,
  scalarType,
  schema,
  unionType
} from "./utils/model.ts"

describe("SdlReader", () => {
  it("@oneOf marks an input object", () => {
    assertType(
      readSdl(fixture("sdl/one-of.graphql")),
      inputObjectType("PetBy", [inputValue("id", named("ID")), inputValue("name", named("String"))], {
        description: "Exactly one way to identify a pet.",
        oneOf: true
      })
    )
  })

  it("input values carry deprecation reasons, defaulting when none is given", () => {
    assertType(
      readSdl("type Query { a: Int } input I { old: Int @deprecated, legacy: Int @deprecated(reason: \"Use `a`.\") }"),
      inputObjectType("I", [
        inputValue("old", named("Int"), { deprecationReason: "No longer supported" }),
        inputValue("legacy", named("Int"), { deprecationReason: "Use `a`." })
      ])
    )
  })

  it("directive definitions and applied directives are dropped", () => {
    assertModelsEqual(
      readSdl("directive @tag(name: String!) repeatable on OBJECT type Query @tag(name: \"a\") @undeclared { a: Int }"),
      schema({ queryType: "Query", types: [objectType("Query", [field("a", named("Int"))])] })
    )
  })

  it("a type named Subscription is the subscription root when there is no schema definition", () => {
    assert.strictEqual(readSdl("type Query { a: Int } type Subscription { b: Int }").subscriptionType, "Subscription")
  })

  it("merges every extend form into its definition in document order", () => {
    assertModelsEqual(
      readSdl(fixture("sdl/extensions.graphql")),
      schema({
        queryType: "Root",
        mutationType: "Changes",
        types: [
          objectType("Root", [
            field("a", named("String")),
            field("items", nonNull(list(nonNull(named("Item")))), {
              arguments: [inputValue("filter", named("Filter"))]
            }),
            field("node", named("Node"), { arguments: [inputValue("id", nonNull(named("ID")))] })
          ]),
          interfaceType("Node", [field("id", nonNull(named("ID"))), field("title", named("String"))], {
            possibleTypes: ["Film"]
          }),
          objectType("Book", [field("title", named("String"))]),
          objectType("Film", [field("title", named("String")), field("id", nonNull(named("ID")))], {
            interfaces: ["Node"]
          }),
          unionType("Item", ["Book", "Film"]),
          enumType("Genre", [enumValue("DRAMA"), enumValue("COMEDY")]),
          inputObjectType("Filter", [inputValue("genre", named("Genre")), inputValue("title", named("String"))]),
          scalarType("Url"),

          objectType("Changes", [
            field("rename", named("Film"), { arguments: [inputValue("title", nonNull(named("String")))] })
          ])
        ]
      })
    )
  })
})

describe("IntrospectionReader", () => {
  it("isOneOf and input value deprecation match the SDL they came from", () => {
    // modern.json is graphql-js introspection of modern.graphql with every optional key enabled.
    assertModelsEqual(
      readIntrospection(fixture("introspection/modern.json")),
      readSdl(fixture("introspection/modern.graphql"))
    )
  })

  it("accepts the { data: { __schema } } response shape", () => {
    const json = fixture("introspection/modern.json")
    assertModelsEqual(readIntrospection(`{"data":${json}}`), readIntrospection(json))
  })

  it("rejects JSON with neither the { __schema } nor the { data: { __schema } } shape", () => {
    const result = IntrospectionReader.read(source("{\"schema\":{}}", "bad.json"))
    assert(Result.isFailure(result), "expected a diagnostic")
    assert.strictEqual(result.failure.path, "bad.json")
  })
})
