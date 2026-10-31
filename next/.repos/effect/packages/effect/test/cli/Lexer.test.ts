import { assert, describe, it } from "@effect/vitest"
import * as Lexer from "effect/cli/internal/lexer"

describe("Lexer", () => {
  it("preserves every equals sign in a long option's inline value", () => {
    const result = Lexer.lex(["--query=left=right"])

    assert.deepStrictEqual(result.tokens, [{
      _tag: "LongOption",
      name: "query",
      raw: "--query=left=right",
      value: "left=right"
    }])
  })

  it("lexes negative numbers as values", () => {
    const result = Lexer.lex(["--lon", "-3.70", "-2", "-.5", "-1e3"])

    assert.deepStrictEqual(result.tokens, [
      { _tag: "LongOption", name: "lon", raw: "--lon" },
      { _tag: "Value", value: "-3.70" },
      { _tag: "Value", value: "-2" },
      { _tag: "Value", value: "-.5" },
      { _tag: "Value", value: "-1e3" }
    ])
  })

  it("treats --=value as a plain value instead of a flag with an empty name", () => {
    const result = Lexer.lex(["--=value"])

    assert.deepStrictEqual(result.tokens, [
      { _tag: "Value", value: "--=value" }
    ])
  })

  it("gives an inline value to the last flag of a short option cluster", () => {
    const result = Lexer.lex(["-vn=3", "-n=4"])

    assert.deepStrictEqual(result.tokens, [
      { _tag: "ShortOption", flag: "v", raw: "-v" },
      { _tag: "ShortOption", flag: "n", raw: "-n", value: "3" },
      { _tag: "ShortOption", flag: "n", raw: "-n", value: "4" }
    ])
  })

  it("still lexes short options that are not negative numbers", () => {
    const result = Lexer.lex(["-1a", "-e"])

    assert.deepStrictEqual(result.tokens, [
      { _tag: "ShortOption", flag: "1", raw: "-1" },
      { _tag: "ShortOption", flag: "a", raw: "-a" },
      { _tag: "ShortOption", flag: "e", raw: "-e" }
    ])
  })
})
