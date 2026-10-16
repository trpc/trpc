import * as DenoCrypto from "@effect/platform-deno/DenoCrypto"
import { assert, describe, it } from "@effect/vitest"
import * as Crypto from "effect/Crypto"
import * as Effect from "effect/Effect"

const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const uuidV7Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const hex = (bytes: Uint8Array): string => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")

describe("DenoCrypto", () => {
  it.effect("computes SHA-256 digests", () =>
    Effect.gen(function*() {
      const crypto = yield* Crypto.Crypto
      const digest = yield* crypto.digest("SHA-256", new TextEncoder().encode("hello"))
      assert.strictEqual(hex(digest), "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824")
    }).pipe(Effect.provide(DenoCrypto.layer)))

  it.effect("generates random bytes larger than the Web Crypto quota", () =>
    Effect.gen(function*() {
      const crypto = yield* Crypto.Crypto
      const bytes = yield* crypto.randomBytes(70_000)
      assert.strictEqual(bytes.length, 70_000)
    }).pipe(Effect.provide(DenoCrypto.layer)))

  it.effect("generates UUIDv4 values", () =>
    Effect.gen(function*() {
      const crypto = yield* Crypto.Crypto
      assert.match(yield* crypto.randomUUIDv4, uuidV4Regex)
    }).pipe(Effect.provide(DenoCrypto.layer)))

  it.effect("generates UUIDv7 values", () =>
    Effect.gen(function*() {
      const crypto = yield* Crypto.Crypto
      assert.match(yield* crypto.randomUUIDv7, uuidV7Regex)
    }).pipe(Effect.provide(DenoCrypto.layer)))
})
