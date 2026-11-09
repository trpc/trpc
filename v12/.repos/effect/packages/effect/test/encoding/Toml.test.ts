import { assert, describe, it } from "@effect/vitest"
import { Result } from "effect"
import * as Toml from "effect/encoding/Toml"

describe("Toml", () => {
  it("parses tables, dotted keys, arrays, and inline tables", () => {
    assert.deepStrictEqual(
      Result.getOrThrow(Toml.parse(`
title = "Effect"
ports = [8000, 8001]

[database]
connection.timeout = 30
enabled = true
credentials = { user = "root", roles = ["admin", "writer"] }
`)),
      {
        title: "Effect",
        ports: [8000, 8001],
        database: {
          connection: { timeout: 30 },
          enabled: true,
          credentials: { user: "root", roles: ["admin", "writer"] }
        }
      }
    )
  })

  it("parses arrays of tables and date-time values", () => {
    assert.deepStrictEqual(
      Result.getOrThrow(Toml.parse(`
[[servers]]
name = "alpha"
started = 2026-08-05T01:02:03Z

[[servers]]
name = "beta"
started = 2026-08-05
`)),
      {
        servers: [
          { name: "alpha", started: new Date("2026-08-05T01:02:03Z") },
          { name: "beta", started: "2026-08-05" }
        ]
      }
    )
  })

  it("parses child tables under distinct array entries", () => {
    assert.deepStrictEqual(
      Result.getOrThrow(Toml.parse(`
[[servers]]
[servers.tls]

[[servers]]
[servers.tls]
`)),
      { servers: [{ tls: {} }, { tls: {} }] }
    )
  })

  it("parses empty quoted keys", () => {
    assert.deepStrictEqual(
      Result.getOrThrow(Toml.parse(`"" = 1
nested.'' = 2`)),
      { "": 1, nested: { "": 2 } }
    )
  })

  it("rejects empty bare keys, unterminated keys, and duplicate empty keys", () => {
    assert.isTrue(Result.isFailure(Toml.parse(" = 1\n")))
    assert.isTrue(Result.isFailure(Toml.parse("a. = 1\n")))
    assert.isTrue(Result.isFailure(Toml.parse("\" = 1")))
    assert.isTrue(Result.isFailure(Toml.parse("' = 1")))
    assert.isTrue(Result.isFailure(Toml.parse(`"" = 1\n'' = 2`)))
  })

  it("parses multiline strings and numeric formats", () => {
    assert.deepStrictEqual(
      Result.getOrThrow(Toml.parse(`
message = """
hello \\
  world"""
hex = 0xDEAD_BEEF
fraction = 1_000.5
limits = [-9_007_199_254_740_991, 9_007_199_254_740_991]
large_float = 1e20
local = 2026-08-05 01:02:03
`)),
      {
        message: "hello world",
        hex: 0xdeadbeef,
        fraction: 1000.5,
        limits: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
        large_float: 1e20,
        local: "2026-08-05T01:02:03"
      }
    )
    for (
      const token of [
        "9007199254740992",
        "-9007199254740992",
        "0x20000000000000",
        "0o400000000000000000",
        "0b100000000000000000000000000000000000000000000000000000"
      ]
    ) {
      const result = Toml.parse(`value = ${token}`)
      assert.isTrue(Result.isFailure(result))
      if (Result.isFailure(result)) {
        assert.include(result.failure.message, "Integer out of range")
      }
    }
  })

  it.each([
    ["LF", "\nvalue", "value"],
    ["CRLF", "\r\nvalue", "value"],
    ["additional newlines", "\r\n\r\nfirst\r\nsecond", "\r\nfirst\r\nsecond"],
    ["leading whitespace", " \r\nvalue", " \r\nvalue"]
  ])("trims only an immediate opening newline in multiline strings (%s)", (_, content, expected) => {
    assert.deepStrictEqual(
      Result.getOrThrow(Toml.parse(`basic = """${content}"""\nliteral = '''${content}'''\n`)),
      { basic: expected, literal: expected }
    )
  })

  it("rejects bare carriage returns", () => {
    assert.deepStrictEqual(Result.getOrThrow(Toml.parse("a = 1 # comment\r\nb = 2")), { a: 1, b: 2 })
    const result = Toml.parse("a = 1 # comment\rb = 2")
    assert.isTrue(Result.isFailure(result))
    if (Result.isFailure(result)) {
      assert.include(result.failure.message, "Invalid control character")
    }
  })

  it("parses Unicode escapes at the scalar value boundaries", () => {
    assert.deepStrictEqual(
      Result.getOrThrow(Toml.parse(String.raw`
before = "\uD7FF"
after = "\uE000"
max = "\U0010FFFF"
nul = "\u0000"
`)),
      { before: "\uD7FF", after: "\uE000", max: "\u{10FFFF}", nul: "\u0000" }
    )
  })

  it("rejects raw control characters", () => {
    for (const input of [`"\u0000" = 1`, `key = '\u007F'`, `key = """\u001F"""`, "# comment\r"]) {
      const result = Toml.parse(input)
      assert.isTrue(Result.isFailure(result))
      if (Result.isFailure(result)) {
        assert.include(result.failure.message, "Invalid control character")
      }
    }
    const result = Toml.parse(`key = "a\u0000"`)
    assert.isTrue(Result.isFailure(result))
    if (Result.isFailure(result)) {
      assert.strictEqual(result.failure.message, "Invalid control character at line 1, column 9")
    }
    assert.deepStrictEqual(Result.getOrThrow(Toml.parse("key = '''\t\r\n'''\r\n# \t\r\n")), { key: "\t\r\n" })
  })

  it.each([
    String.raw`value = "\uD800"`,
    String.raw`value = "\uDFFF"`,
    String.raw`value = "\uD83D\uDE00"`,
    String.raw`value = "\U00110000"`
  ])("rejects Unicode escapes that are not scalar values: %s", (input) => {
    const result = Toml.parse(input)
    assert.isTrue(Result.isFailure(result))
    if (Result.isFailure(result)) {
      assert.strictEqual(result.failure.message, "Invalid unicode escape at line 1, column 12")
    }
  })

  it.each(["\"", "'"])("preserves up to two closing content quotes in multiline strings (%s)", (quote) => {
    const delimiter = quote.repeat(3)
    assert.deepStrictEqual(
      Result.getOrThrow(Toml.parse(`empty = ${delimiter}${delimiter}
one = ${delimiter}value${quote}${delimiter}
two = ${delimiter}value${quote}${quote}${delimiter}`)),
      { empty: "", one: `value${quote}`, two: `value${quote}${quote}` }
    )
  })

  it("preserves escaped quotes before multiline closing content quotes", () => {
    assert.deepStrictEqual(Result.getOrThrow(Toml.parse(String.raw`value = """value\""""""`)), { value: "value\"\"\"" })
  })

  it.each(["\"", "'"])("rejects six or more closing quotes in multiline strings (%s)", (quote) => {
    for (const count of [6, 7]) {
      assert.isTrue(Result.isFailure(Toml.parse(`value = ${quote.repeat(3)}value${quote.repeat(count)}`)))
    }
  })

  it("rejects duplicate keys", () => {
    const duplicate = Toml.parse("key = 1\nkey = 2\n")
    assert.isTrue(Result.isFailure(duplicate))
    if (Result.isFailure(duplicate)) {
      assert.strictEqual(duplicate.failure.kind, "Decode")
      assert.strictEqual(duplicate.failure.module, "Toml")
      assert.strictEqual(duplicate.failure.input, "key = 1\nkey = 2\n")
      assert.strictEqual(duplicate.failure.message, "Cannot redefine existing key 'key' at line 2, column 8")
    }

    assert.isTrue(Result.isFailure(Toml.parse("key = 1__000\n")))
  })

  it("rejects extending inline tables and arrays", () => {
    assert.isTrue(Result.isFailure(Toml.parse("point = { x = 1 }\npoint.y = 2\n")))
    assert.isTrue(Result.isFailure(Toml.parse("point = { x = 1 }\n[point]\ny = 2\n")))
    assert.isTrue(Result.isFailure(Toml.parse("fruits = []\n[[fruits]]\n")))
    assert.deepStrictEqual(Result.getOrThrow(Toml.parse("t = { a.x = 1, a.y = 2 }\n")), { t: { a: { x: 1, y: 2 } } })
  })

  it("rejects tables defined twice", () => {
    const invalid = [
      "[fruit]\napple.color = \"red\"\n[fruit.apple]\n",
      "[a.b]\n[a]\nb.c = 1\n",
      "[[a]]\n[a]\n"
    ]
    for (const input of invalid) {
      assert.isTrue(Result.isFailure(Toml.parse(input)))
    }
    assert.deepStrictEqual(
      Result.getOrThrow(
        Toml.parse("[fruit]\napple.color = \"red\"\napple.taste.sweet = true\n[fruit.apple.texture]\nsmooth = true\n")
      ),
      { fruit: { apple: { color: "red", taste: { sweet: true }, texture: { smooth: true } } } }
    )
  })

  it("rejects out of range dates and times", () => {
    const invalid = [
      "1979-02-30T07:32:00Z",
      "1900-02-29",
      "1979-13-01",
      "24:00:00",
      "07:60:00",
      "07:32:61",
      "1990-12-31T23:59:60Z",
      "1979-05-27T07:32:00+24:00",
      "1979-05-27T07:32:00+00:60"
    ]
    for (const value of invalid) {
      assert.isTrue(Result.isFailure(Toml.parse(`a = ${value}`)), value)
    }
    assert.deepStrictEqual(
      Result.getOrThrow(
        Toml.parse("a = 2000-02-29T23:59:59\nb = 1979-05-27T07:32:00+23:59\nc = 1990-12-31T23:59:60\nd = 23:59:60")
      ),
      { a: "2000-02-29T23:59:59", b: new Date("1979-05-26T07:33:00Z"), c: "1990-12-31T23:59:60", d: "23:59:60" }
    )
  })
})
