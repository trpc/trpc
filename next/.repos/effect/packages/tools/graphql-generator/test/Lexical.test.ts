/**
 * Lexical semantics observed through the parser. Positions below count from
 * the `{ f(s: ` prefix that `stringValue` wraps literals in, so a literal
 * starts at column 8.
 */
import { assert, describe, it } from "@effect/vitest"
import { argumentValue, assertDiagnostic, parseOrThrow, stringValue } from "./utils/ast.ts"

describe("Lexical", () => {
  it("strings decode escape sequences, including surrogate pairs and variable-width escapes", () => {
    assert.strictEqual(stringValue("\"\\\" \\n \\u0041 \\uD83D\\uDE00 \\u{1F600}\""), "\" \n A 😀 😀")
  })

  it("a lone surrogate escape is invalid", () => {
    assertDiagnostic("{ f(s: \"\\uD83D\") }", {
      line: 1,
      column: 9,
      message: "Invalid Unicode escape sequence: \"\\uD83D\"."
    })
  })

  it("a string cannot span lines", () => {
    assertDiagnostic("{ f(s: \"ab\ncd\") }", { line: 1, column: 11, message: "Unterminated string." })
  })

  it("block strings are dedented as in the spec's example", () => {
    assert.strictEqual(
      stringValue("\"\"\"\n    Hello,\n      World!\n\n    Yours,\n      GraphQL.\n  \"\"\""),
      "Hello,\n  World!\n\nYours,\n  GraphQL."
    )
  })

  it("block strings escape only the triple quote", () => {
    assert.strictEqual(stringValue("\"\"\"a \\\"\"\" \\n\"\"\""), "a \"\"\" \\n")
  })

  it("numbers with a fraction or exponent are floats", () => {
    assert.strictEqual(argumentValue("-12")._tag, "IntValue")
    assert.strictEqual(argumentValue("-0.5e-3")._tag, "FloatValue")
  })

  it("a number cannot have a leading zero", () => {
    assertDiagnostic("{ f(s: 01) }", {
      line: 1,
      column: 9,
      message: "Invalid number, unexpected digit after 0: \"1\"."
    })
  })

  it("comments accept astral and control characters", () => {
    assert.strictEqual(parseOrThrow("{ a } # 😀 \u0007\n{ b }").definitions.length, 2)
  })

  it("unpaired surrogates are rejected, even in comments", () => {
    assertDiagnostic("{ a } # \uD800", { line: 1, column: 9, message: "Invalid character: U+D800." })
  })
})
