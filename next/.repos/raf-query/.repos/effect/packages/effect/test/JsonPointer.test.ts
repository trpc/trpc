import { describe, it } from "@effect/vitest"
import { deepStrictEqual, strictEqual } from "@effect/vitest/utils"
import { escapeToken, formatUriFragment, parseUriFragment, unescapeToken } from "effect/JsonPointer"

describe("JsonPointer", () => {
  describe("escapeToken", () => {
    describe("basic escaping", () => {
      it("escapes tilde (~) to ~0", () => {
        deepStrictEqual(escapeToken("a~b"), "a~0b")
        deepStrictEqual(escapeToken("~"), "~0")
        deepStrictEqual(escapeToken("~~"), "~0~0")
      })

      it("escapes forward slash (/) to ~1", () => {
        deepStrictEqual(escapeToken("a/b"), "a~1b")
        deepStrictEqual(escapeToken("/"), "~1")
        deepStrictEqual(escapeToken("//"), "~1~1")
      })

      it("escapes both tilde and slash in same string", () => {
        deepStrictEqual(escapeToken("a~b/c"), "a~0b~1c")
        deepStrictEqual(escapeToken("path/to~key"), "path~1to~0key")
        deepStrictEqual(escapeToken("~a/b~c/d~"), "~0a~1b~0c~1d~0")
      })
    })

    describe("order of operations", () => {
      it("replaces ~ before / to prevent double-escaping", () => {
        const token = "a~b/c"
        const result = escapeToken(token)
        deepStrictEqual(result, "a~0b~1c")
        deepStrictEqual(result.includes("~0~1"), false)
        deepStrictEqual(result.includes("~1~0"), false)
      })

      it("handles ~ followed by / correctly", () => {
        deepStrictEqual(escapeToken("a~/b"), "a~0~1b")
      })

      it("handles / followed by ~ correctly", () => {
        deepStrictEqual(escapeToken("a/~b"), "a~1~0b")
      })

      it("handles consecutive special characters", () => {
        deepStrictEqual(escapeToken("~~"), "~0~0")
        deepStrictEqual(escapeToken("//"), "~1~1")
        deepStrictEqual(escapeToken("~/"), "~0~1")
        deepStrictEqual(escapeToken("/~"), "~1~0")
      })
    })

    describe("edge cases", () => {
      it("returns empty string unchanged", () => {
        deepStrictEqual(escapeToken(""), "")
        strictEqual(escapeToken(""), "")
      })

      it("returns input unchanged when no special characters", () => {
        deepStrictEqual(escapeToken("abc"), "abc")
        deepStrictEqual(escapeToken("hello world"), "hello world")
        deepStrictEqual(escapeToken("123"), "123")
      })

      it("handles strings with only tildes", () => {
        deepStrictEqual(escapeToken("~~~"), "~0~0~0")
        deepStrictEqual(escapeToken("a~b~c"), "a~0b~0c")
      })

      it("handles strings with only slashes", () => {
        deepStrictEqual(escapeToken("///"), "~1~1~1")
        deepStrictEqual(escapeToken("a/b/c"), "a~1b~1c")
      })

      it("handles multiple occurrences of same character", () => {
        deepStrictEqual(escapeToken("a~b~c~d"), "a~0b~0c~0d")
        deepStrictEqual(escapeToken("a/b/c/d"), "a~1b~1c~1d")
      })

      it("handles special sequences that could be confused", () => {
        deepStrictEqual(escapeToken("~01"), "~001")
        deepStrictEqual(escapeToken("~10"), "~010")
        deepStrictEqual(escapeToken("~00"), "~000")
        deepStrictEqual(escapeToken("~11"), "~011")
      })
    })

    describe("unicode and other characters", () => {
      it("passes through unicode characters unchanged", () => {
        deepStrictEqual(escapeToken("héllo"), "héllo")
        deepStrictEqual(escapeToken("世界"), "世界")
        deepStrictEqual(escapeToken("🚀"), "🚀")
      })

      it("passes through other special characters unchanged", () => {
        deepStrictEqual(escapeToken("a.b"), "a.b")
        deepStrictEqual(escapeToken("a-b"), "a-b")
        deepStrictEqual(escapeToken("a_b"), "a_b")
        deepStrictEqual(escapeToken("a@b"), "a@b")
        deepStrictEqual(escapeToken("a#b"), "a#b")
        deepStrictEqual(escapeToken("a$b"), "a$b")
        deepStrictEqual(escapeToken("a%b"), "a%b")
        deepStrictEqual(escapeToken("a&b"), "a&b")
        deepStrictEqual(escapeToken("a*b"), "a*b")
        deepStrictEqual(escapeToken("a+b"), "a+b")
        deepStrictEqual(escapeToken("a=b"), "a=b")
        deepStrictEqual(escapeToken("a?b"), "a?b")
        deepStrictEqual(escapeToken("a!b"), "a!b")
      })

      it("handles mixed unicode and special characters", () => {
        deepStrictEqual(escapeToken("héllo~world/test"), "héllo~0world~1test")
        deepStrictEqual(escapeToken("世界/🌍~key"), "世界~1🌍~0key")
      })
    })

    describe("immutability", () => {
      it("does not mutate input string", () => {
        const original = "a~b/c"
        const originalCopy = "a~b/c"
        escapeToken(original)
        deepStrictEqual(original, originalCopy)
        strictEqual(original, originalCopy)
      })

      it("returns a different token value when escaping changes the input", () => {
        const input = "a~b"
        const result = escapeToken(input)
        strictEqual(result === input, false)
        deepStrictEqual(result, "a~0b")
      })
    })

    describe("RFC 6901 examples", () => {
      it("handles examples from documentation", () => {
        deepStrictEqual(escapeToken("name/alias"), "name~1alias")
        deepStrictEqual(escapeToken("path/to~key"), "path~1to~0key")
      })
    })
  })

  describe("unescapeToken", () => {
    describe("basic unescaping", () => {
      it("unescapes ~0 to ~", () => {
        deepStrictEqual(unescapeToken("a~0b"), "a~b")
        deepStrictEqual(unescapeToken("~0"), "~")
        deepStrictEqual(unescapeToken("~0~0"), "~~")
      })

      it("unescapes ~1 to /", () => {
        deepStrictEqual(unescapeToken("a~1b"), "a/b")
        deepStrictEqual(unescapeToken("~1"), "/")
        deepStrictEqual(unescapeToken("~1~1"), "//")
      })

      it("unescapes both ~0 and ~1 in same string", () => {
        deepStrictEqual(unescapeToken("a~0b~1c"), "a~b/c")
        deepStrictEqual(unescapeToken("path~1to~0key"), "path/to~key")
        deepStrictEqual(unescapeToken("~0a~1b~0c~1d~0"), "~a/b~c/d~")
      })
    })

    describe("order of operations", () => {
      it("replaces ~1 before ~0 to prevent incorrect decoding", () => {
        const token = "a~1b~0c"
        const result = unescapeToken(token)
        deepStrictEqual(result, "a/b~c")
      })

      it("handles ~01 sequence correctly (unescapes to ~1)", () => {
        deepStrictEqual(unescapeToken("~01"), "~1")
      })

      it("handles ~10 sequence correctly (unescapes to /0)", () => {
        deepStrictEqual(unescapeToken("~10"), "/0")
      })

      it("handles ~00 sequence correctly (unescapes to ~0)", () => {
        deepStrictEqual(unescapeToken("~00"), "~0")
      })

      it("handles ~11 sequence correctly (unescapes to /1)", () => {
        deepStrictEqual(unescapeToken("~11"), "/1")
      })
    })

    describe("edge cases", () => {
      it("returns empty string unchanged", () => {
        deepStrictEqual(unescapeToken(""), "")
        strictEqual(unescapeToken(""), "")
      })

      it("returns input unchanged when no escaped sequences", () => {
        deepStrictEqual(unescapeToken("abc"), "abc")
        deepStrictEqual(unescapeToken("hello world"), "hello world")
        deepStrictEqual(unescapeToken("123"), "123")
      })

      it("handles strings with only ~0 sequences", () => {
        deepStrictEqual(unescapeToken("~0~0~0"), "~~~")
        deepStrictEqual(unescapeToken("a~0b~0c"), "a~b~c")
      })

      it("handles strings with only ~1 sequences", () => {
        deepStrictEqual(unescapeToken("~1~1~1"), "///")
        deepStrictEqual(unescapeToken("a~1b~1c"), "a/b/c")
      })

      it("handles multiple occurrences of same sequence", () => {
        deepStrictEqual(unescapeToken("a~0b~0c~0d"), "a~b~c~d")
        deepStrictEqual(unescapeToken("a~1b~1c~1d"), "a/b/c/d")
      })

      it("decodes escaped sequences at token boundaries and suffixes", () => {
        deepStrictEqual(unescapeToken("~0"), "~")
        deepStrictEqual(unescapeToken("~1"), "/")
        deepStrictEqual(unescapeToken("a~0"), "a~")
        deepStrictEqual(unescapeToken("a~1"), "a/")
      })
    })

    describe("unicode and other characters", () => {
      it("passes through unicode characters unchanged", () => {
        deepStrictEqual(unescapeToken("héllo"), "héllo")
        deepStrictEqual(unescapeToken("世界"), "世界")
        deepStrictEqual(unescapeToken("🚀"), "🚀")
      })

      it("passes through other special characters unchanged", () => {
        deepStrictEqual(unescapeToken("a.b"), "a.b")
        deepStrictEqual(unescapeToken("a-b"), "a-b")
        deepStrictEqual(unescapeToken("a_b"), "a_b")
        deepStrictEqual(unescapeToken("a@b"), "a@b")
      })

      it("handles mixed unicode and escaped sequences", () => {
        deepStrictEqual(unescapeToken("héllo~0world~1test"), "héllo~world/test")
        deepStrictEqual(unescapeToken("世界~1🌍~0key"), "世界/🌍~key")
      })
    })

    describe("immutability", () => {
      it("does not mutate input string", () => {
        const original = "a~0b~1c"
        const originalCopy = "a~0b~1c"
        unescapeToken(original)
        deepStrictEqual(original, originalCopy)
        strictEqual(original, originalCopy)
      })

      it("returns a different token value when unescaping changes the input", () => {
        const input = "a~0b"
        const result = unescapeToken(input)
        strictEqual(result === input, false)
        deepStrictEqual(result, "a~b")
      })
    })

    describe("RFC 6901 examples", () => {
      it("handles examples from documentation", () => {
        deepStrictEqual(unescapeToken("name~1alias"), "name/alias")
        deepStrictEqual(unescapeToken("path~1to~0key"), "path/to~key")
      })
    })
  })

  describe("parseUriFragment", () => {
    it("parses the document root", () => {
      deepStrictEqual(parseUriFragment(""), [])
      deepStrictEqual(parseUriFragment("#"), [])
    })

    it("decodes percent-encoding before splitting tokens", () => {
      deepStrictEqual(parseUriFragment("#/definitions/a%20b"), ["definitions", "a b"])
      deepStrictEqual(parseUriFragment("#%2Fdefinitions%2FValue"), ["definitions", "Value"])
      deepStrictEqual(parseUriFragment("#/definitions/a%25b"), ["definitions", "a%b"])
      deepStrictEqual(parseUriFragment("#/definitions/caf%C3%A9"), ["definitions", "café"])
    })

    it("distinguishes encoded separators from escaped slashes", () => {
      deepStrictEqual(parseUriFragment("#/$defs/Box%2Fproperties%2Fvalue"), [
        "$defs",
        "Box",
        "properties",
        "value"
      ])
      deepStrictEqual(parseUriFragment("#/$defs/Box~1properties~1value"), [
        "$defs",
        "Box/properties/value"
      ])
      deepStrictEqual(parseUriFragment("#/$defs/Box%7E1properties%7E1value"), [
        "$defs",
        "Box/properties/value"
      ])
    })

    it("rejects invalid fragments", () => {
      strictEqual(parseUriFragment("/a"), undefined)
      strictEqual(parseUriFragment("#/%"), undefined)
      strictEqual(parseUriFragment("#/%FF"), undefined)
      strictEqual(parseUriFragment("#/a b"), undefined)
      strictEqual(parseUriFragment("#/a#b"), undefined)
      strictEqual(parseUriFragment("#/a\\b"), undefined)
      strictEqual(parseUriFragment("#/café"), undefined)
      strictEqual(parseUriFragment(`#/${String.fromCharCode(0xd800)}`), undefined)
      strictEqual(parseUriFragment("#/a~2b"), undefined)
      strictEqual(parseUriFragment("#/a~"), undefined)
    })
  })

  describe("formatUriFragment", () => {
    it("formats the document root", () => {
      strictEqual(formatUriFragment([]), "#")
    })

    it("applies JSON Pointer escaping before URI percent-encoding", () => {
      strictEqual(
        formatUriFragment(["$defs", "a b", "a%b", "a/b", "café", "a#b"]),
        "#/$defs/a%20b/a%25b/a~1b/caf%C3%A9/a%23b"
      )
    })

    it("round trips path tokens", () => {
      const paths = [
        [],
        [""],
        ["$defs", "Rate%"],
        ["a/b", "c~d"],
        ["!$&'()*+,;=:@?"],
        ["café", "世界", "🚀"]
      ]
      for (const path of paths) {
        deepStrictEqual(parseUriFragment(formatUriFragment(path)), path)
      }
    })

    it("throws for unpaired surrogates", () => {
      const path = [String.fromCharCode(0xd800)]
      let error: unknown
      try {
        formatUriFragment(path)
      } catch (cause) {
        error = cause
      }
      strictEqual(error instanceof URIError, true)
    })
  })

  describe("round-trip", () => {
    it("unescapeToken(escapeToken(token)) === token for basic cases", () => {
      const cases = [
        "abc",
        "a~b",
        "a/b",
        "a~b/c",
        "path/to~key",
        "name/alias",
        "~",
        "/",
        "~~",
        "//",
        "~/",
        "/~"
      ]

      for (const token of cases) {
        const escaped = escapeToken(token)
        const unescaped = unescapeToken(escaped)
        deepStrictEqual(unescaped, token, `Failed for token: ${token}`)
      }
    })

    it("unescapeToken(escapeToken(token)) === token for edge cases", () => {
      const cases = [
        "",
        "~01",
        "~10",
        "~00",
        "~11",
        "a~01b",
        "a~10b",
        "a~00b",
        "a~11b"
      ]

      for (const token of cases) {
        const escaped = escapeToken(token)
        const unescaped = unescapeToken(escaped)
        deepStrictEqual(unescaped, token, `Failed for token: ${token}`)
      }
    })

    it("unescapeToken(escapeToken(token)) === token for unicode", () => {
      const cases = [
        "héllo",
        "世界",
        "🚀",
        "héllo~world/test",
        "世界/🌍~key"
      ]

      for (const token of cases) {
        const escaped = escapeToken(token)
        const unescaped = unescapeToken(escaped)
        deepStrictEqual(unescaped, token, `Failed for token: ${token}`)
      }
    })

    it("unescapeToken(escapeToken(token)) === token for complex sequences", () => {
      const cases = [
        "a~b/c~d/e",
        "path/to~key/value",
        "~a/b~c/d~",
        "a~/b/c~d",
        "a/~b/c~d"
      ]

      for (const token of cases) {
        const escaped = escapeToken(token)
        const unescaped = unescapeToken(escaped)
        deepStrictEqual(unescaped, token, `Failed for token: ${token}`)
      }
    })

    it("handles multiple round-trips", () => {
      const token = "a~b/c~d"
      let current = token

      for (let i = 0; i < 5; i++) {
        current = escapeToken(current)
        current = unescapeToken(current)
        deepStrictEqual(current, token)
      }
    })
  })
})
