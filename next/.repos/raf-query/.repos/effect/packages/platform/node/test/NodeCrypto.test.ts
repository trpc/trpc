import * as NodeCrypto from "@effect/platform-node/NodeCrypto"
import { assert, describe, it } from "@effect/vitest"
import * as Crypto from "effect/Crypto"
import * as Effect from "effect/Effect"
import * as TestClock from "effect/testing/TestClock"

const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const uuidV7Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const hex = (bytes: Uint8Array): string => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")

describe("NodeCrypto", () => {
  it.effect("generates empty random bytes", () =>
    Effect.gen(function*() {
      const crypto = yield* Crypto.Crypto
      const bytes = yield* crypto.randomBytes(0)
      assert.deepStrictEqual(bytes, new Uint8Array(0))
    }).pipe(Effect.provide(NodeCrypto.layer)))

  it.effect("generates random bytes with the requested size", () =>
    Effect.gen(function*() {
      const crypto = yield* Crypto.Crypto
      const bytes = yield* crypto.randomBytes(32)
      assert.strictEqual(bytes.length, 32)
    }).pipe(Effect.provide(NodeCrypto.layer)))

  it.effect("fails invalid random byte sizes", () =>
    Effect.gen(function*() {
      const crypto = yield* Crypto.Crypto
      const error = yield* Effect.flip(crypto.randomBytes(-1))
      assert.strictEqual(error._tag, "PlatformError")
    }).pipe(Effect.provide(NodeCrypto.layer)))

  it.effect("generates UUIDv4 values", () =>
    Effect.gen(function*() {
      const crypto = yield* Crypto.Crypto
      const uuid1 = yield* crypto.randomUUIDv4
      const uuid2 = yield* crypto.randomUUIDv4
      assert.match(uuid1, uuidV4Regex)
      assert.match(uuid2, uuidV4Regex)
      assert.notStrictEqual(uuid1, uuid2)
    }).pipe(Effect.provide(NodeCrypto.layer)))

  it.effect("generates UUIDv7 values", () =>
    Effect.gen(function*() {
      yield* TestClock.setTime(0x0123456789ab)
      const crypto = yield* Crypto.Crypto
      const uuid = yield* crypto.randomUUIDv7
      assert.match(uuid, uuidV7Regex)
      assert.strictEqual(uuid.slice(0, 13), "01234567-89ab")
    }).pipe(Effect.provide(NodeCrypto.layer)))

  it.effect("computes SHA-256 digests", () =>
    Effect.gen(function*() {
      const crypto = yield* Crypto.Crypto
      const digest = yield* crypto.digest("SHA-256", new TextEncoder().encode("hello"))
      assert.strictEqual(hex(digest), "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824")
    }).pipe(Effect.provide(NodeCrypto.layer)))
})
