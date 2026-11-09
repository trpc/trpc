import { assert, describe, it } from "@effect/vitest"
import { Result } from "effect"
import * as Base64Url from "effect/encoding/Base64Url"
import type * as EncodingError from "effect/encoding/EncodingError"

describe("Base64Url", () => {
  it("encodes strings and bytes without padding", () => {
    assert.strictEqual(Base64Url.encode("hello?"), "aGVsbG8_")
    assert.strictEqual(Base64Url.encode(new Uint8Array([251, 255])), "-_8")
  })

  it("encodePadded keeps the padding", () => {
    assert.strictEqual(Base64Url.encodePadded("f"), "Zg==")
    assert.strictEqual(Base64Url.encodePadded(new Uint8Array([251, 255])), "-_8=")
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
    for (const input of ["SGVsbG8_=", "SGVsbG8_==", "AAAA=", "AAAA==", "AAA==", "Zg="]) {
      assert.isTrue(Result.isFailure(Base64Url.decode(input)), input)
    }
  })

  it("round trips every byte value through both decoders", () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i)
    for (let length = 0; length <= 6; length++) {
      const view = bytes.subarray(250 - length, 250)
      for (const encoded of [Base64Url.encode(view), Base64Url.encodePadded(view)]) {
        assert.deepStrictEqual(Result.getOrThrow(Base64Url.decode(encoded)), view, encoded)
      }
    }
    for (const encoded of [Base64Url.encode(bytes), Base64Url.encodePadded(bytes)]) {
      assert.deepStrictEqual(Result.getOrThrow(Base64Url.decode(encoded)), bytes)
      assert.strictEqual(
        Result.getOrThrow(Base64Url.decodeString(encoded)),
        new TextDecoder().decode(bytes)
      )
    }
  })

  it("decodes valid input with both decoders", () => {
    const vectors: ReadonlyArray<readonly [string, string]> = [
      ["", ""],
      ["\r\n", ""],
      ["Zg", "f"],
      ["Zg==", "f"],
      ["Zm8", "fo"],
      ["Zm8=", "fo"],
      ["Zm9v", "foo"],
      ["Zm\r\n9v", "foo"],
      ["Zm9v\r\n", "foo"],
      ["Z\ng", "f"],
      ["Zg=\r\n=", "f"]
    ]
    for (const [input, expected] of vectors) {
      assert.deepStrictEqual(Result.getOrThrow(Base64Url.decode(input)), new TextEncoder().encode(expected), input)
      assert.strictEqual(Result.getOrThrow(Base64Url.decodeString(input)), expected, input)
    }
  })

  it("rejects partial padding but accepts unpadded and fully padded input", () => {
    assertFailure("Zg=", "Zg=", "Padded length should be a multiple of 4, but is 3")
    assert.deepStrictEqual(Result.getOrThrow(Base64Url.decode("Zg")), new Uint8Array([102]))
    assert.deepStrictEqual(Result.getOrThrow(Base64Url.decode("Zg==")), new Uint8Array([102]))
  })

  it("ignores non-zero trailing bits", () => {
    for (const input of ["Zh", "Zh==", "Zv"]) {
      assert.deepStrictEqual(Result.getOrThrow(Base64Url.decode(input)), new Uint8Array([102]), input)
    }
    for (const input of ["Zm9", "Zm9=", "Zm-", "Zm_"]) {
      assert.deepStrictEqual(Result.getOrThrow(Base64Url.decode(input)), new Uint8Array([102, 111]), input)
    }
  })

  it("rejects invalid input with both decoders", () => {
    const padded = (length: number) => `Padded length should be a multiple of 4, but is ${length}`
    const unpadded = (length: number) => `Unpadded length should not be 1 more than a multiple of 4, but is ${length}`
    assertFailure("Zg\r\n=", "Zg=", padded(3))
    assertFailure("Zg===", "Zg===", padded(5))
    assertFailure("=", "=", padded(1))
    assertFailure("==", "==", padded(2))
    assertFailure("=====", "=====", padded(5))
    assertFailure("a", "a", unpadded(1))
    assertFailure("Zm9v\r\nZ", "Zm9vZ", unpadded(5))
    assertFailure("Zm 9v", "Zm 9v", unpadded(5))
    assertFailure("Zm\t9v", "Zm\t9v", unpadded(5))
    for (const input of ["Zm+v", "Zm/v", "Zm9!", "Zm9{", "Zm9\u00e9", "Zm9\u0000", "Zm9\u2028", "Z=g="]) {
      assertFailure(input, input, "Invalid input")
    }
  })
})

const assertFailure = (raw: string, stripped: string, expected: string) => {
  const results: ReadonlyArray<Result.Result<unknown, EncodingError.EncodingError>> = [
    Base64Url.decode(raw),
    Base64Url.decodeString(raw)
  ]
  for (const result of results) {
    assert.isTrue(Result.isFailure(result), raw)
    if (Result.isFailure(result)) {
      const { input, kind, message, module } = result.failure
      assert.deepStrictEqual(
        { kind, module, input, message },
        { kind: "Decode", module: "Base64Url", input: stripped, message: expected }
      )
    }
  }
}
