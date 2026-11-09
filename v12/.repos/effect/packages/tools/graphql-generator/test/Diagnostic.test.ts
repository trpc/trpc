import { parse } from "@effect/graphql-generator/internal/Parser"
import { assert, describe, it } from "@effect/vitest"
import * as Result from "effect/Result"
import { assertDiagnostic, source } from "./utils/ast.ts"

const failure = (body: string, path?: string) => {
  const result = parse(source(body, path))
  assert(Result.isFailure(result), "expected a diagnostic")
  return result.failure
}

describe("Diagnostic", () => {
  it("is a tagged error carrying the source path", () => {
    const diagnostic = failure("{", "queries/viewer.graphql")
    assert.strictEqual(diagnostic._tag, "Diagnostic")
    assert.strictEqual(diagnostic.path, "queries/viewer.graphql")
    assert.instanceOf(diagnostic, Error)
  })

  it("columns count UTF-16 code units", () => {
    assertDiagnostic("{ f(s: \"😀\") ? }", { line: 1, column: 14, message: "Unexpected character: \"?\"." })
  })

  it("code frame shows the neighbouring lines and a caret under the column", () => {
    const diagnostic = failure("query Q {\n  a(b: )\n}")
    assert.strictEqual(diagnostic.line, 2)
    assert.strictEqual(diagnostic.column, 8)
    assert.strictEqual(diagnostic.message, "Unexpected \")\".")
    assert.strictEqual(
      diagnostic.codeFrame,
      [
        "1 | query Q {",
        "2 |   a(b: )",
        "  |        ^",
        "3 | }"
      ].join("\n")
    )
  })

  it("code frame right-aligns line numbers of different widths", () => {
    const body = ["{", "  a", "  b", "  c", "  d", "  e", "  f", "  g", "  h", "  ?"].join("\n")
    const diagnostic = failure(body)
    assert.strictEqual(diagnostic.line, 10)
    assert.strictEqual(diagnostic.column, 3)
    assert.strictEqual(diagnostic.codeFrame, [" 9 |   h", "10 |   ?", "   |   ^"].join("\n"))
  })
})
