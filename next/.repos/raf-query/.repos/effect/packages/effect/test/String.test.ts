import { Option } from "effect"
import { pipe } from "effect/Function"
import * as S from "effect/String"
import { assert, describe, it } from "vitest"
import { assertFalse, assertNone, assertSome, assertTrue, deepStrictEqual, strictEqual } from "./utils/assert.ts"

describe("String", () => {
  describe("String (constructor)", () => {
    it("converts values to strings", () => {
      strictEqual(S.String(123), "123")
      strictEqual(S.String(true), "true")
      strictEqual(S.String(null), "null")
    })
  })

  describe("isString", () => {
    it("returns true for strings", () => {
      assertTrue(S.isString("hello"))
      assertTrue(S.isString(""))
    })

    it("returns false for non-strings", () => {
      assertFalse(S.isString(1))
      assertFalse(S.isString(null))
      assertFalse(S.isString(undefined))
      assertFalse(S.isString(true))
      assertFalse(S.isString({}))
    })
  })

  describe("Order", () => {
    it("compares strings lexicographically", () => {
      strictEqual(S.Order("apple", "banana"), -1)
      strictEqual(S.Order("banana", "apple"), 1)
      strictEqual(S.Order("apple", "apple"), 0)
    })

    it("compares empty strings", () => {
      strictEqual(S.Order("", ""), 0)
      strictEqual(S.Order("", "a"), -1)
      strictEqual(S.Order("a", ""), 1)
    })
  })

  describe("Equivalence", () => {
    it("returns true for equal strings", () => {
      assertTrue(S.Equivalence("a", "a"))
    })

    it("returns false for different strings", () => {
      assertFalse(S.Equivalence("a", "b"))
    })
  })

  describe("empty", () => {
    it("is the empty string", () => {
      strictEqual(S.empty, "")
    })
  })

  describe("concat", () => {
    it("data-first", () => {
      strictEqual(S.concat("hello", " world"), "hello world")
    })

    it("data-last (pipeable)", () => {
      strictEqual(pipe("hello", S.concat(" world")), "hello world")
    })

    it("concatenates empty strings", () => {
      strictEqual(S.concat("", ""), "")
      strictEqual(S.concat("a", ""), "a")
      strictEqual(S.concat("", "b"), "b")
    })
  })

  describe("toUpperCase", () => {
    it("converts to uppercase", () => {
      strictEqual(S.toUpperCase("hello"), "HELLO")
    })

    it("handles empty string", () => {
      strictEqual(S.toUpperCase(""), "")
    })

    it("pipeable", () => {
      strictEqual(pipe("abc", S.toUpperCase), "ABC")
    })
  })

  describe("toLowerCase", () => {
    it("converts to lowercase", () => {
      strictEqual(S.toLowerCase("HELLO"), "hello")
    })

    it("handles empty string", () => {
      strictEqual(S.toLowerCase(""), "")
    })
  })

  describe("capitalize", () => {
    it("capitalizes first character", () => {
      strictEqual(S.capitalize("hello"), "Hello")
    })

    it("handles single character", () => {
      strictEqual(S.capitalize("a"), "A")
    })

    it("handles empty string", () => {
      strictEqual(S.capitalize(""), "")
    })

    it("does not change already capitalized", () => {
      strictEqual(S.capitalize("Hello"), "Hello")
    })
  })

  describe("uncapitalize", () => {
    it("uncapitalizes first character", () => {
      strictEqual(S.uncapitalize("Hello"), "hello")
    })

    it("handles single character", () => {
      strictEqual(S.uncapitalize("A"), "a")
    })

    it("handles empty string", () => {
      strictEqual(S.uncapitalize(""), "")
    })

    it("preserves rest of string", () => {
      strictEqual(S.uncapitalize("ABC"), "aBC")
    })
  })

  describe("replace", () => {
    it("replaces first occurrence", () => {
      strictEqual(pipe("abab", S.replace("b", "c")), "acab")
    })

    it("replaces with regex", () => {
      strictEqual(pipe("abc", S.replace(/b/, "d")), "adc")
    })

    it("returns unchanged if no match", () => {
      strictEqual(pipe("abc", S.replace("z", "x")), "abc")
    })
  })

  describe("trim", () => {
    it("trims whitespace from both ends", () => {
      strictEqual(S.trim("  hello  "), "hello")
    })

    it("trims tabs and newlines", () => {
      strictEqual(S.trim("\t\nhello\t\n"), "hello")
    })

    it("handles empty string", () => {
      strictEqual(S.trim(""), "")
    })
  })

  describe("trimStart", () => {
    it("trims leading whitespace", () => {
      strictEqual(S.trimStart("  hello  "), "hello  ")
    })

    it("handles empty string", () => {
      strictEqual(S.trimStart(""), "")
    })
  })

  describe("trimEnd", () => {
    it("trims trailing whitespace", () => {
      strictEqual(S.trimEnd("  hello  "), "  hello")
    })

    it("handles empty string", () => {
      strictEqual(S.trimEnd(""), "")
    })
  })

  describe("slice", () => {
    it("extracts a section", () => {
      strictEqual(pipe("abcd", S.slice(1, 3)), "bc")
    })

    it("handles negative indices", () => {
      strictEqual(pipe("hello", S.slice(-3)), "llo")
    })

    it("no arguments returns full string", () => {
      strictEqual(pipe("hello", S.slice()), "hello")
    })
  })

  describe("isEmpty", () => {
    it("returns true for empty string", () => {
      assertTrue(S.isEmpty(""))
    })

    it("returns false for non-empty string", () => {
      assertFalse(S.isEmpty("a"))
      assertFalse(S.isEmpty(" "))
    })
  })

  describe("isNonEmpty", () => {
    it("returns true for non-empty string", () => {
      assertTrue(S.isNonEmpty("a"))
    })

    it("returns false for empty string", () => {
      assertFalse(S.isNonEmpty(""))
    })
  })

  describe("length", () => {
    it("returns string length", () => {
      strictEqual(S.length("abc"), 3)
    })

    it("returns 0 for empty string", () => {
      strictEqual(S.length(""), 0)
    })
  })

  describe("split", () => {
    it("splits by string separator (data-last)", () => {
      deepStrictEqual(pipe("a,b,c", S.split(",")), ["a", "b", "c"])
    })

    it("splits by string separator (data-first)", () => {
      deepStrictEqual(S.split("hello,world", ","), ["hello", "world"])
    })

    it("splits by empty string", () => {
      deepStrictEqual(pipe("abc", S.split("")), ["a", "b", "c"])
    })

    it("splits empty string by empty string", () => {
      deepStrictEqual(pipe("", S.split("")), [""])
    })

    it("splits by regex", () => {
      deepStrictEqual(pipe("a1b2c", S.split(/\d/)), ["a", "b", "c"])
    })
  })

  describe("includes", () => {
    it("returns true when substring found", () => {
      assertTrue(pipe("hello world", S.includes("world")))
    })

    it("returns false when substring not found", () => {
      assertFalse(pipe("hello world", S.includes("foo")))
    })

    it("starts searching at the given position", () => {
      assertFalse(pipe("hello", S.includes("hel", 1)))
      assertTrue(pipe("hello", S.includes("ell", 1)))
    })
  })

  describe("startsWith", () => {
    it("returns true when string starts with search", () => {
      assertTrue(pipe("hello world", S.startsWith("hello")))
    })

    it("returns false when string does not start with search", () => {
      assertFalse(pipe("hello world", S.startsWith("world")))
    })

    it("checks the prefix at the given position", () => {
      assertTrue(pipe("hello world", S.startsWith("world", 6)))
    })
  })

  describe("endsWith", () => {
    it("returns true when string ends with search", () => {
      assertTrue(pipe("hello world", S.endsWith("world")))
    })

    it("returns false when string does not end with search", () => {
      assertFalse(pipe("hello world", S.endsWith("hello")))
    })

    it("checks the suffix at the given end position", () => {
      assertTrue(pipe("hello world", S.endsWith("hello", 5)))
    })
  })

  describe("charCodeAt", () => {
    it("returns char code at index (data-first)", () => {
      assertSome(S.charCodeAt("abc", 1), 98)
    })

    it("returns char code at index (data-last)", () => {
      assertSome(pipe("abc", S.charCodeAt(0)), 97)
    })

    it("returns none for out of bounds", () => {
      assertNone(S.charCodeAt("abc", 10))
    })
  })

  describe("substring", () => {
    it("extracts characters between indices", () => {
      strictEqual(pipe("abcd", S.substring(1, 3)), "bc")
    })

    it("extracts from start to end", () => {
      strictEqual(pipe("abcd", S.substring(1)), "bcd")
    })
  })

  describe("at", () => {
    it("returns character at index", () => {
      assertSome(pipe("abc", S.at(1)), "b")
    })

    it("returns none for out of bounds", () => {
      assertNone(pipe("abc", S.at(10)))
    })
  })

  describe("charAt", () => {
    it("returns character at index (data-first)", () => {
      assertSome(S.charAt("abc", 1), "b")
    })

    it("returns character at index (data-last)", () => {
      assertSome(pipe("abc", S.charAt(1)), "b")
    })

    it("returns none for out of bounds", () => {
      assertNone(S.charAt("abc", 10))
    })
  })

  describe("codePointAt", () => {
    it("returns code point at index", () => {
      assertSome(pipe("abc", S.codePointAt(1)), 98)
    })

    it("returns none for out of bounds", () => {
      assertNone(pipe("abc", S.codePointAt(10)))
    })

    it("handles surrogate pairs", () => {
      assertSome(pipe("𝟘", S.codePointAt(0)), 120792)
    })
  })

  describe("indexOf", () => {
    it("returns index of first occurrence", () => {
      assertSome(pipe("abbbc", S.indexOf("b")), 1)
    })

    it("returns none when not found", () => {
      assertNone(pipe("abbbc", S.indexOf("z")))
    })
  })

  describe("lastIndexOf", () => {
    it("returns index of last occurrence", () => {
      assertSome(pipe("abbbc", S.lastIndexOf("b")), 3)
    })

    it("returns none when not found", () => {
      assertNone(pipe("abbbc", S.lastIndexOf("z")))
    })
  })

  describe("localeCompare", () => {
    it("returns ordering", () => {
      strictEqual(pipe("a", S.localeCompare("b")), -1)
      strictEqual(pipe("b", S.localeCompare("a")), 1)
      strictEqual(pipe("a", S.localeCompare("a")), 0)
    })
  })

  describe("match", () => {
    it("returns matched text and native match metadata", () => {
      const result = pipe("hello", S.match(/l+/))
      assert(Option.isSome(result))
      strictEqual(result.value[0], "ll")
    })

    it("returns none when the pattern does not match", () => {
      assertNone(pipe("hello", S.match(/x/)))
    })
  })

  describe("matchAll", () => {
    it("returns all matches", () => {
      const result = Array.from(pipe("hello world", S.matchAll(/l/g)))
      strictEqual(result.length, 3)
    })
  })

  describe("normalize", () => {
    it("normalizes with different forms", () => {
      const str = "\u1E9B\u0323"
      strictEqual(pipe(str, S.normalize("NFD")), "\u017F\u0323\u0307")
      strictEqual(pipe(str, S.normalize("NFKC")), "\u1E69")
      strictEqual(pipe(str, S.normalize("NFKD")), "\u0073\u0323\u0307")
    })
  })

  describe("padEnd", () => {
    it("pads from end with spaces", () => {
      strictEqual(pipe("a", S.padEnd(5)), "a    ")
    })

    it("pads from end with fill string", () => {
      strictEqual(pipe("a", S.padEnd(5, "_")), "a____")
    })

    it("does not truncate if already longer", () => {
      strictEqual(pipe("hello", S.padEnd(3)), "hello")
    })
  })

  describe("padStart", () => {
    it("pads from start with spaces", () => {
      strictEqual(pipe("a", S.padStart(5)), "    a")
    })

    it("pads from start with fill string", () => {
      strictEqual(pipe("a", S.padStart(5, "_")), "____a")
    })

    it("does not truncate if already longer", () => {
      strictEqual(pipe("hello", S.padStart(3)), "hello")
    })
  })

  describe("repeat", () => {
    it("repeats the string", () => {
      strictEqual(pipe("ab", S.repeat(3)), "ababab")
      strictEqual(pipe("ab", S.repeat(1.5)), "ab")
    })

    it("returns an empty string for non-positive or NaN counts", () => {
      strictEqual(pipe("ab", S.repeat(0)), "")
      strictEqual(pipe("ab", S.repeat(-1)), "")
      strictEqual(pipe("ab", S.repeat(Number.NaN)), "")
    })
  })

  describe("replaceAll", () => {
    it("replaces all occurrences with string", () => {
      strictEqual(pipe("ababb", S.replaceAll("b", "c")), "acacc")
    })

    it("replaces all occurrences with regex", () => {
      strictEqual(pipe("ababb", S.replaceAll(/b/g, "c")), "acacc")
    })
  })

  describe("search", () => {
    it("returns index on match (data-first)", () => {
      assertSome(S.search("ababb", "b"), 1)
    })

    it("returns index on match (data-last)", () => {
      assertSome(pipe("ababb", S.search("b")), 1)
    })

    it("returns none when not found", () => {
      assertNone(S.search("ababb", "d"))
    })

    it("works with regex", () => {
      assertSome(S.search("ababb", /bb/), 3)
    })
  })

  describe("toLocaleLowerCase", () => {
    it("converts to locale lowercase", () => {
      strictEqual(pipe("ABC", S.toLocaleLowerCase()), "abc")
    })
  })

  describe("toLocaleUpperCase", () => {
    it("converts to locale uppercase", () => {
      strictEqual(pipe("abc", S.toLocaleUpperCase()), "ABC")
    })
  })

  describe("takeLeft", () => {
    it("takes n characters from the start (data-first)", () => {
      strictEqual(S.takeLeft("Hello World", 5), "Hello")
      strictEqual(S.takeLeft("abc", 1.5), "a")
    })

    it("takes n characters from the start (data-last)", () => {
      strictEqual(pipe("Hello World", S.takeLeft(5)), "Hello")
    })

    it("returns whole string if n > length", () => {
      strictEqual(S.takeLeft("abc", 10), "abc")
    })

    it("returns an empty string for non-positive or NaN counts", () => {
      strictEqual(S.takeLeft("abc", 0), "")
      strictEqual(S.takeLeft("abc", -1), "")
      strictEqual(S.takeLeft("abc", Number.NaN), "")
    })
  })

  describe("takeRight", () => {
    it("takes n characters from the end (data-first)", () => {
      strictEqual(S.takeRight("Hello World", 5), "World")
      strictEqual(S.takeRight("abc", 1.5), "c")
    })

    it("takes n characters from the end (data-last)", () => {
      strictEqual(pipe("Hello World", S.takeRight(5)), "World")
    })

    it("returns whole string if n > length", () => {
      strictEqual(S.takeRight("abc", 10), "abc")
    })

    it("returns an empty string for non-positive or NaN counts", () => {
      strictEqual(S.takeRight("abc", 0), "")
      strictEqual(S.takeRight("abc", -1), "")
      strictEqual(S.takeRight("abc", Number.NaN), "")
    })
  })

  describe("linesIterator", () => {
    it("yields lines without separators", () => {
      deepStrictEqual(Array.from(S.linesIterator("hello\nworld\n")), ["hello", "world"])
    })

    it("handles CRLF", () => {
      deepStrictEqual(Array.from(S.linesIterator("a\r\nb\r\n")), ["a", "b"])
    })

    it("handles single line without newline", () => {
      deepStrictEqual(Array.from(S.linesIterator("hello")), ["hello"])
    })

    it("handles empty string", () => {
      deepStrictEqual(Array.from(S.linesIterator("")), [])
    })
  })

  describe("linesWithSeparators", () => {
    it("yields lines with separators", () => {
      deepStrictEqual(Array.from(S.linesWithSeparators("hello\nworld\n")), ["hello\n", "world\n"])
    })

    it("handles CRLF", () => {
      deepStrictEqual(Array.from(S.linesWithSeparators("a\r\nb\r\n")), ["a\r\n", "b\r\n"])
    })

    it("handles line without trailing newline", () => {
      deepStrictEqual(Array.from(S.linesWithSeparators("hello")), ["hello"])
    })
  })

  describe("stripMargin", () => {
    it("strips | margin", () => {
      strictEqual(S.stripMargin("  |hello\n  |world"), "hello\nworld")
    })
  })

  describe("stripMarginWith", () => {
    it("strips custom margin character (data-first)", () => {
      strictEqual(S.stripMarginWith("  #hello\n  #world", "#"), "hello\nworld")
    })

    it("strips custom margin character (data-last)", () => {
      strictEqual(pipe("  #hello\n  #world", S.stripMarginWith("#")), "hello\nworld")
    })

    it("leaves lines without margin unchanged", () => {
      strictEqual(S.stripMarginWith("no margin\n  |yes", "|"), "no margin\nyes")
    })
  })

  describe("snakeToCamel", () => {
    it("converts snake_case to camelCase", () => {
      strictEqual(S.snakeToCamel("hello_world"), "helloWorld")
      strictEqual(S.snakeToCamel("foo_bar_baz"), "fooBarBaz")
    })

    it("handles single word", () => {
      strictEqual(S.snakeToCamel("hello"), "hello")
    })

    it("handles an empty string", () => {
      strictEqual(S.snakeToCamel(""), "")
    })
  })

  describe("snakeToPascal", () => {
    it("converts snake_case to PascalCase", () => {
      strictEqual(S.snakeToPascal("hello_world"), "HelloWorld")
      strictEqual(S.snakeToPascal("foo_bar_baz"), "FooBarBaz")
    })

    it("handles an empty string", () => {
      strictEqual(S.snakeToPascal(""), "")
    })
  })

  describe("snakeToKebab", () => {
    it("converts snake_case to kebab-case", () => {
      strictEqual(S.snakeToKebab("hello_world"), "hello-world")
      strictEqual(S.snakeToKebab("foo_bar_baz"), "foo-bar-baz")
    })
  })

  describe("camelToSnake", () => {
    it("converts camelCase to snake_case", () => {
      strictEqual(S.camelToSnake("helloWorld"), "hello_world")
      strictEqual(S.camelToSnake("fooBarBaz"), "foo_bar_baz")
    })
  })

  describe("pascalToSnake", () => {
    it("converts PascalCase to snake_case", () => {
      strictEqual(S.pascalToSnake("HelloWorld"), "hello_world")
      strictEqual(S.pascalToSnake("FooBarBaz"), "foo_bar_baz")
    })
  })

  describe("kebabToSnake", () => {
    it("converts kebab-case to snake_case", () => {
      strictEqual(S.kebabToSnake("hello-world"), "hello_world")
      strictEqual(S.kebabToSnake("foo-bar-baz"), "foo_bar_baz")
    })
  })

  describe("noCase", () => {
    it("converts to space-separated lowercase by default", () => {
      strictEqual(S.noCase("helloWorld"), "hello world")
      strictEqual(S.noCase("HelloWorld"), "hello world")
    })

    it("data-last with options", () => {
      strictEqual(pipe("helloWorld", S.noCase({ delimiter: "-" })), "hello-world")
    })

    it("uses a custom split regular expression", () => {
      strictEqual(S.noCase("ab", { splitRegExp: /([a])([b])/g }), "a b")
    })

    it("uses custom split regular expressions", () => {
      strictEqual(S.noCase("abc", { splitRegExp: [/([a])([b])/g, /([b])([c])/g] }), "a b c")
    })

    it("uses a custom strip regular expression", () => {
      strictEqual(S.noCase("a_b-c", { stripRegExp: /_/g }), "a b-c")
    })

    it("uses custom strip regular expressions", () => {
      strictEqual(S.noCase("a_b-c", { stripRegExp: [/_/g, /-/g] }), "a b c")
    })

    it("handles underscores and hyphens", () => {
      strictEqual(S.noCase("hello_world"), "hello world")
      strictEqual(S.noCase("hello-world"), "hello world")
    })

    it("splits digit-letter boundaries", () => {
      strictEqual(S.noCase("field2value"), "field 2 value")
      strictEqual(S.noCase("field2Value"), "field 2 value")
    })
  })

  describe("pascalCase", () => {
    it("converts to PascalCase", () => {
      strictEqual(S.pascalCase("hello world"), "HelloWorld")
      strictEqual(S.pascalCase("hello_world"), "HelloWorld")
      strictEqual(S.pascalCase("helloWorld"), "HelloWorld")
    })

    it("does not prefix numeric segments with underscores", () => {
      strictEqual(S.pascalCase("foo 2 bar"), "Foo2Bar")
      strictEqual(S.pascalCase("api-v2 xml"), "ApiV2Xml")
    })
  })

  describe("camelCase", () => {
    it("converts to camelCase", () => {
      strictEqual(S.camelCase("hello world"), "helloWorld")
      strictEqual(S.camelCase("hello_world"), "helloWorld")
      strictEqual(S.camelCase("HelloWorld"), "helloWorld")
    })

    it("does not prefix numeric segments with underscores", () => {
      strictEqual(S.camelCase("foo 2 bar"), "foo2Bar")
      strictEqual(S.camelCase("api-v2 xml"), "apiV2Xml")
    })
  })

  describe("constantCase", () => {
    it("converts to CONSTANT_CASE", () => {
      strictEqual(S.constantCase("hello world"), "HELLO_WORLD")
      strictEqual(S.constantCase("helloWorld"), "HELLO_WORLD")
      strictEqual(S.constantCase("api-v2 xml"), "API_V_2_XML")
    })
  })

  describe("configCase", () => {
    it("converts to CONFIG_CASE", () => {
      strictEqual(S.configCase("hello world"), "HELLO_WORLD")
      strictEqual(S.configCase("helloWorld"), "HELLO_WORLD")
      strictEqual(S.configCase("api-v2 xml"), "API_V2_XML")
      strictEqual(S.configCase("field2Value"), "FIELD2_VALUE")
    })
  })

  describe("kebabCase", () => {
    it("converts to kebab-case", () => {
      strictEqual(S.kebabCase("hello world"), "hello-world")
      strictEqual(S.kebabCase("helloWorld"), "hello-world")
    })
  })

  describe("snakeCase", () => {
    it("converts to snake_case", () => {
      strictEqual(S.snakeCase("hello world"), "hello_world")
      strictEqual(S.snakeCase("helloWorld"), "hello_world")
    })
  })

  describe("ReducerConcat", () => {
    it("combines strings", () => {
      strictEqual(S.ReducerConcat.combine("a", "b"), "ab")
    })

    it("identity with initialValue", () => {
      strictEqual(S.ReducerConcat.combine("a", S.ReducerConcat.initialValue), "a")
      strictEqual(S.ReducerConcat.combine(S.ReducerConcat.initialValue, "a"), "a")
    })
  })
})
