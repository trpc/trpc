import * as Base64Url from "effect/encoding/Base64Url"
import * as EncodingError from "effect/encoding/EncodingError"
import * as Result from "effect/Result"
import assert from "node:assert/strict"

const variants = 64
const mask = variants - 1

// Deterministic bytes, varied per input so V8 cannot cache one string.
const bytes = (length: number, variant: number) =>
  Uint8Array.from({ length }, (_, i) => ((i * 151 + variant * 73 + 17) ^ (i >> 3)) & 0xff)

const inputs = (length: number, encode: (bytes: Uint8Array) => string = Base64Url.encode) =>
  Array.from({ length: variants }, (_, variant) => {
    const decoded = bytes(length, variant)
    return { encoded: encode(decoded), decoded }
  })

const assertDecoded = (result: unknown, expected: Uint8Array) => {
  assert.ok(Result.isResult(result) && Result.isSuccess(result))
  assert.deepEqual(result.success, expected)
}

const decodeCase = (cases: ReadonlyArray<{ readonly encoded: string; readonly decoded: Uint8Array }>) => () => {
  for (const { encoded, decoded } of cases) {
    // Node's decoder is an independent reference for valid input.
    assert.deepEqual(new Uint8Array(Buffer.from(encoded, "base64url")), decoded)
  }
  let i = 0
  return {
    run: () => Base64Url.decode(cases[i++ & mask].encoded),
    validate: (result: unknown) => assertDecoded(result, cases[(i - 1) & mask].decoded)
  }
}

// 16 characters.
export const decodeSmall = decodeCase(inputs(12))

// An ES256 signature: 86 characters.
export const decodeJwtSignature = decodeCase(inputs(64))

// A JWT payload segment: 150 characters.
export const decodeJwtPayload = decodeCase(inputs(112))

// 64 KiB of characters.
export const decodeLarge = decodeCase(inputs(48 * 1024))

// Padded input wrapped every 76 characters with CRLF.
export const decodePaddedCrlf = decodeCase(
  inputs(1024 + 1, (bytes) => Base64Url.encodePadded(bytes).replace(/.{76}/g, "$&\r\n"))
)

const claims = Array.from({ length: variants }, (_, i) =>
  JSON.stringify({
    iss: "https://issuer.example.com",
    sub: `user-${i}`,
    aud: "effect",
    iat: 1_700_000_000 + i,
    exp: 1_700_003_600 + i,
    scope: "openid profile"
  }))
const encodedClaims = claims.map((json) => Base64Url.encode(json))

export const decodeStringJwtPayload = () => {
  let i = 0
  return {
    run: () => Base64Url.decodeString(encodedClaims[i++ & mask]),
    validate: (result: unknown) => {
      assert.ok(Result.isResult(result) && Result.isSuccess(result))
      assert.equal(result.success, claims[(i - 1) & mask])
    }
  }
}

// A JWT payload segment whose last character is outside the alphabet.
const invalid = inputs(112).map(({ encoded }) => `${encoded.slice(0, -1)}+`)

export const decodeInvalid = () => {
  let i = 0
  return {
    run: () => Base64Url.decode(invalid[i++ & mask]),
    validate: (result: unknown) => {
      assert.ok(Result.isResult(result) && Result.isFailure(result) && EncodingError.isEncodingError(result.failure))
      assert.equal(result.failure.message, "Invalid input")
      assert.equal(result.failure.input, invalid[(i - 1) & mask])
    }
  }
}
