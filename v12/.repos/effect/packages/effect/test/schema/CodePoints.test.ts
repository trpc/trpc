import { assert, describe, it } from "@effect/vitest"
import { Schema } from "effect"
import { TestSchema } from "effect/testing"

describe("code point checks", () => {
  const cases = [
    ["", 0],
    ["a", 1],
    ["abc", 3],
    ["😀", 1],
    ["a😀b", 3],
    ["é", 1],
    ["e\u0301", 2],
    ["👨‍👩‍👧‍👦", 7],
    ["\uD800", 1],
    ["\uDC00", 1],
    ["\uD800\uD800\uDC00", 2],
    ["\r\n", 2]
  ] as const

  it("counts code points at inclusive minimum and maximum boundaries", () => {
    for (let bound = 0; bound <= 8; bound++) {
      const min = Schema.is(Schema.String.check(Schema.isMinCodePoints(bound)))
      const max = Schema.is(Schema.String.check(Schema.isMaxCodePoints(bound)))
      const exact = Schema.is(Schema.String.check(Schema.isBetweenCodePoints(bound, bound)))
      for (const [value, count] of cases) {
        assert.strictEqual(min(value), count >= bound)
        assert.strictEqual(max(value), count <= bound)
        assert.strictEqual(exact(value), count === bound)
      }
    }
  })

  it("checks inclusive ranges and rejects inverted ranges", () => {
    const between = Schema.is(Schema.String.check(Schema.isBetweenCodePoints(1, 3)))
    const inverted = Schema.is(Schema.String.check(Schema.isBetweenCodePoints(3, 1)))
    for (const [value, count] of cases) {
      assert.strictEqual(between(value), count >= 1 && count <= 3)
      assert.isFalse(inverted(value))
    }
  })

  it("rounds down bounds and clamps negative bounds to zero", () => {
    assert.isTrue(Schema.is(Schema.String.check(Schema.isMinCodePoints(1.9)))("😀"))
    assert.isFalse(Schema.is(Schema.String.check(Schema.isMaxCodePoints(1.9)))("😀a"))
    assert.isTrue(Schema.is(Schema.String.check(Schema.isBetweenCodePoints(1.9, 2.9)))("😀a"))
    assert.isTrue(Schema.is(Schema.String.check(Schema.isMinCodePoints(-1)))(""))
    assert.isTrue(Schema.is(Schema.String.check(Schema.isMaxCodePoints(-1)))(""))
    assert.isFalse(Schema.is(Schema.String.check(Schema.isMaxCodePoints(-1)))("a"))
    assert.isTrue(Schema.is(Schema.String.check(Schema.isBetweenCodePoints(-2, -1)))(""))
  })

  it("preserves length checks based on UTF-16 code units", () => {
    assert.isTrue(Schema.is(Schema.String.check(Schema.isMinLength(2)))("😀"))
    assert.isFalse(Schema.is(Schema.String.check(Schema.isMaxLength(1)))("😀"))
  })

  it("validates decoding and encoding with code point error messages", async () => {
    for (
      const [check, invalid, message] of [
        [Schema.isMinCodePoints(1), "", "Expected a string with at least 1 code points"],
        [Schema.isMaxCodePoints(1), "😀a", "Expected a string with at most 1 code points"],
        [Schema.isBetweenCodePoints(1, 2), "😀ab", "Expected a string with between 1 and 2 code points"],
        [Schema.isBetweenCodePoints(1, 1), "😀a", "Expected a string with 1 code points"]
      ] as const
    ) {
      const asserts = new TestSchema.Asserts(Schema.String.check(check))
      await asserts.decoding().succeed("😀")
      await asserts.encoding().succeed("😀")
      await asserts.decoding().fail(invalid, message)
      await asserts.encoding().fail(invalid, message)
    }
  })

  it("allows custom annotations", async () => {
    const asserts = new TestSchema.Asserts(
      Schema.String.check(Schema.isMaxCodePoints(1, { expected: "a single code point" }))
    )
    await asserts.decoding().fail("ab", "Expected a single code point")
  })
})
