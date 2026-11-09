import { assert } from "@effect/vitest"
import type * as CryptoError from "effect/crypto/CryptoError"
import * as WebCrypto from "effect/crypto/WebCrypto"
import * as Effect from "effect/Effect"
import * as Hex from "effect/encoding/Hex"
import * as Result from "effect/Result"

export const encode = (text: string): Uint8Array => new TextEncoder().encode(text)

export const bytes = (hex: string): Uint8Array => Result.getOrThrow(Hex.decode(hex))

// Copies bytes into the middle of a larger buffer, so implementations must
// respect the view's offset and length.
export const view = (data: Uint8Array): Uint8Array => {
  const backing = new Uint8Array(data.length + 8).fill(0xff)
  backing.set(data, 4)
  return backing.subarray(4, 4 + data.length)
}

export const assertReason = (
  error: CryptoError.CryptoError,
  reason: CryptoError.CryptoErrorReason["_tag"],
  method?: string
) => {
  assert.strictEqual(error.reason._tag, reason)
  if (method !== undefined) assert.strictEqual(error.method, method)
}

// A `SubtleCrypto` whose key imports succeed and whose other methods are
// supplied by the test.
export const fakeSubtle = (methods: Partial<Record<keyof SubtleCrypto, () => Promise<unknown>>>) =>
  WebCrypto.layer({
    subtle: { importKey: () => Promise.resolve({}), ...methods } as unknown as SubtleCrypto
  } as Crypto)

// A `SubtleCrypto` that throws on any access, so a test proves that invalid
// arguments are rejected before reaching Web Crypto.
export const unreachable = WebCrypto.layer({
  subtle: new Proxy({} as SubtleCrypto, {
    get: () => {
      throw new Error("invalid arguments reached Web Crypto")
    }
  })
} as Crypto)

// An SPKI encoding produced with Web Crypto directly, independently of the
// layers under test.
export const spki = (raw: Uint8Array, params: AlgorithmIdentifier | EcKeyImportParams) =>
  Effect.promise(async () => {
    const subtle = globalThis.crypto.subtle
    return new Uint8Array(
      await subtle.exportKey("spki", await subtle.importKey("raw", new Uint8Array(raw), params, true, []))
    )
  })

// An uncompressed NIST curve point, or a point with another prefix.
export const point = (size: number, prefix = 4) => Uint8Array.of(prefix, ...new Uint8Array(2 * size))
