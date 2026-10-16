import { transform } from "@effect/doctest/Transform"
import { assert, describe, it } from "@effect/vitest"

const imported = `import { assertEquals as __effect_doctest_assert_0 } from "@effect/doctest/Runtime"`

describe("Transform", () => {
  it("transforms expression assertions", () => {
    assert.strictEqual(
      transform("Option.some(1) // => Option.some(1)", "example.ts", 10),
      `__effect_doctest_assert_0(Option.some(1), Option.some(1));\n\n${imported}`
    )
  })

  it("transforms const declaration assertions without evaluating the initializer twice", () => {
    assert.strictEqual(
      transform("const result = makeValue() // => Option.some(1)\nuse(result)", "example.ts", 10),
      `const result = makeValue()\n__effect_doctest_assert_0(result, Option.some(1));\nuse(result)\n\n${imported}`
    )
  })

  it("preserves indentation in nested blocks", () => {
    assert.strictEqual(
      transform("if (enabled) {\n  const result = makeValue() // => 1\n}", "example.ts", 10),
      `if (enabled) {\n  const result = makeValue()\n  __effect_doctest_assert_0(result, 1);\n}\n\n${imported}`
    )
  })

  it("chooses an assertion binding that is not used by the snippet", () => {
    const source = "const __effect_doctest_assert_0 = 1\nvalue // => 1"
    assert.match(transform(source, "example.ts", 10), /assertEquals as __effect_doctest_assert_1/)
  })

  it("ignores ordinary and legacy output comments", () => {
    const source = "console.log(value) // > value\nconst text = \"// => not an assertion\""
    assert.strictEqual(transform(source, "example.ts", 10), source)
  })

  it("rejects malformed expected expressions", () => {
    assert.throws(
      () => transform("value // => Option.some(", "example.ts", 10),
      /example\.ts:11:7 invalid doctest expected expression/
    )
  })

  it("rejects standalone markers", () => {
    assert.throws(
      () => transform("value\n// => 1", "example.ts", 10),
      /doctest assertion must trail a complete statement on the same line/
    )
  })

  it("rejects unsupported declarations", () => {
    assert.throws(
      () => transform("let value = 1 // => 1", "example.ts", 10),
      /doctest assertions can only target expression statements or a single initialized const identifier/
    )
  })

  it("rejects assertions in unbraced control flow", () => {
    assert.throws(
      () => transform("if (enabled) value // => 1", "example.ts", 10),
      /doctest assertions in control flow require an explicit block/
    )
  })
})
