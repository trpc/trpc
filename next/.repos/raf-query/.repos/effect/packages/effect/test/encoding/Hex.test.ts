import { assert, describe, it } from "@effect/vitest"
import { Result } from "effect"
import * as Hex from "effect/encoding/Hex"

const assertRandom = (length: number, expectedLength: number): void => {
  const value = Hex.random(length)
  assert.strictEqual(value.length, expectedLength)
  assert.match(value, /^[0-9a-f]*$/)
}

describe("Hex", () => {
  it("encodes strings and bytes as lowercase hexadecimal", () => {
    assert.strictEqual(Hex.encode("hello"), "68656c6c6f")
    assert.strictEqual(Hex.encode(new Uint8Array([72, 101, 108, 108, 111])), "48656c6c6f")
  })

  it("decodes mixed-case bytes and UTF-8 strings", () => {
    assert.deepStrictEqual(
      Result.getOrThrow(Hex.decode("48656C6c6F")),
      new Uint8Array([72, 101, 108, 108, 111])
    )
    assert.strictEqual(Result.getOrThrow(Hex.decodeString("f09f918b")), "👋")
  })

  it("rejects odd lengths and non-hexadecimal characters", () => {
    const oddLength = Hex.decode("abc")
    assert.isTrue(Result.isFailure(oddLength))
    if (Result.isFailure(oddLength)) {
      assert.strictEqual(oddLength.failure.kind, "Decode")
      assert.strictEqual(oddLength.failure.module, "Hex")
      assert.strictEqual(oddLength.failure.input, "abc")
    }

    assert.isTrue(Result.isFailure(Hex.decode("zz")))
  })

  describe("random", () => {
    it("generates lowercase hexadecimal words", () => {
      assertRandom(0, 0)
      assertRandom(8, 8)
      assertRandom(16, 16)
      assertRandom(32, 32)
    })

    it("rounds non-negative lengths down to multiples of 8", () => {
      assertRandom(7, 0)
      assertRandom(15.9, 8)
      assertRandom(23, 16)
    })

    it("uses unsigned 32-bit coercion without validation", () => {
      assertRandom(Number.NaN, 0)
      assertRandom(Number.POSITIVE_INFINITY, 0)
      assertRandom(2 ** 32, 0)
      assertRandom(2 ** 32 + 8, 8)
    })
  })
})
