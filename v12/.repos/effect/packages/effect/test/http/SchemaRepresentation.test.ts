import { assert, describe, it } from "@effect/vitest"
import { Schema, SchemaRepresentation } from "effect"

describe("HTTP schema representations", () => {
  it("generates code for declaration schemas", () => {
    const document = SchemaRepresentation.toRepresentations([
      Schema.Headers.ast,
      Schema.Cookies.ast,
      Schema.Cookie.ast,
      Schema.UrlParams.ast
    ])

    assert.deepStrictEqual(
      document.representations.map((representation) =>
        representation._tag === "Declaration" ? representation.representation : undefined
      ),
      [
        { id: "effect/http/Headers", payload: null },
        { id: "effect/http/Cookies", payload: null },
        { id: "effect/http/Cookie", payload: null },
        { id: "effect/http/UrlParams", payload: null }
      ]
    )

    const output = SchemaRepresentation.toCodeDocument(document)

    assert.deepStrictEqual(output.codes, [
      { runtime: `Schema.Headers.annotate({ "expected": "Headers" })`, Type: "Headers.Headers" },
      { runtime: `Schema.Cookies.annotate({ "expected": "Cookies" })`, Type: "Cookies.Cookies" },
      { runtime: `Schema.Cookie.annotate({ "expected": "Cookie" })`, Type: "Cookies.Cookie" },
      { runtime: `Schema.UrlParams.annotate({ "expected": "UrlParams" })`, Type: "UrlParams.UrlParams" }
    ])
    assert.deepStrictEqual(output.artifacts, [
      {
        _tag: "Import",
        importDeclaration: `import * as Headers from "effect/http/Headers"`
      },
      {
        _tag: "Import",
        importDeclaration: `import * as Cookies from "effect/http/Cookies"`
      },
      {
        _tag: "Import",
        importDeclaration: `import * as UrlParams from "effect/http/UrlParams"`
      }
    ])
  })
})
