import { assert, describe, it } from "@effect/vitest"
import { Result } from "effect"
import * as Base64Url from "effect/encoding/Base64Url"

describe("Base64Url", () => {
  it("encodes strings and bytes without padding", () => {
    assert.strictEqual(Base64Url.encode("hello?"), "aGVsbG8_")
    assert.strictEqual(Base64Url.encode(new Uint8Array([251, 255])), "-_8")
  })

  it("decodes padded and unpadded input", () => {
    const expected = new Uint8Array([72, 101, 108, 108, 111, 63])
    assert.deepStrictEqual(Result.getOrThrow(Base64Url.decode("SGVsbG8_")), expected)
    assert.deepStrictEqual(Result.getOrThrow(Base64Url.decode("-_8=")), new Uint8Array([251, 255]))
    assert.strictEqual(Result.getOrThrow(Base64Url.decodeString("8J-Riw")), "👋")
    assert.strictEqual(Result.getOrThrow(Base64Url.decodeString("8J-Riw==")), "👋")
  })

  it("rejects the standard Base64 alphabet and malformed lengths", () => {
    const invalidAlphabet = Base64Url.decode("+/8=")
    assert.isTrue(Result.isFailure(invalidAlphabet))
    if (Result.isFailure(invalidAlphabet)) {
      assert.strictEqual(invalidAlphabet.failure.kind, "Decode")
      assert.strictEqual(invalidAlphabet.failure.module, "Base64Url")
      assert.strictEqual(invalidAlphabet.failure.input, "+/8=")
    }

    assert.isTrue(Result.isFailure(Base64Url.decode("a")))
  })

  it("rejects malformed padding", () => {
    for (const input of ["SGVsbG8_=", "SGVsbG8_==", "AAAA=", "AAAA==", "AAA=="]) {
      assert.isTrue(Result.isFailure(Base64Url.decode(input)), input)
    }
  })
})
