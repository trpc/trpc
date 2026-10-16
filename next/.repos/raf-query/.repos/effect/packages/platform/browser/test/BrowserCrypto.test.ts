import * as BrowserCrypto from "@effect/platform-browser/BrowserCrypto"
import { assert, describe, it } from "@effect/vitest"
import { Cause, Exit, Layer } from "effect"
import * as Crypto from "effect/Crypto"
import * as Effect from "effect/Effect"
import * as PlatformError from "effect/PlatformError"
import * as TestClock from "effect/testing/TestClock"
import { webcrypto } from "node:crypto"

const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const uuidV7Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const getRandomValues = <T extends ArrayBufferView | null>(array: T): T => {
  if (array instanceof Uint8Array) {
    for (let i = 0; i < array.length; i++) {
      array[i] = i & 0xff
    }
  }
  return array
}

const withSubtle = (subtle: unknown): globalThis.Crypto =>
  Object.create(globalThis.crypto, { subtle: { value: subtle } })

const layerWith = (crypto: globalThis.Crypto) =>
  BrowserCrypto.layer.pipe(Layer.provide(Layer.succeed(BrowserCrypto.WebCrypto, crypto)))

const assertPlatformError = (
  exit: Exit.Exit<Uint8Array, PlatformError.PlatformError>,
  description: string
) => {
  assert.ok(Exit.isFailure(exit))
  assert.strictEqual(exit.cause.reasons.length, 1)
  const reason = exit.cause.reasons[0]
  assert.ok(Cause.isFailReason(reason))
  assert.strictEqual(reason.error._tag, "PlatformError")
  assert.instanceOf(reason.error.reason, PlatformError.SystemError)
  assert.strictEqual(reason.error.reason._tag, "Unknown")
  assert.strictEqual(reason.error.reason.module, "Crypto")
  assert.strictEqual(reason.error.reason.method, "digest")
  assert.strictEqual(reason.error.reason.description, description)
  return reason.error
}

const checkUnavailable = (crypto: globalThis.Crypto) =>
  Effect.gen(function*() {
    const service = yield* Crypto.Crypto
    const exit = yield* Effect.exit(Effect.suspend(() => service.digest("SHA-256", new Uint8Array())))
    assertPlatformError(exit, "crypto.subtle.digest is not available")
  }).pipe(Effect.provide(layerWith(crypto)))

describe("BrowserCrypto", () => {
  it.effect("generates random bytes at and above the getRandomValues limit", () => {
    const chunks: Array<number> = []

    return Effect.gen(function*() {
      const crypto = yield* Crypto.Crypto
      for (const size of [65_536, 65_537, 70_000]) {
        const bytes = yield* crypto.randomBytes(size)
        assert.strictEqual(bytes.length, size)
        assert.strictEqual(bytes[0], 0)
        assert.strictEqual(bytes[size - 1], (size - 1) & 0xff)
      }
      assert.deepStrictEqual(chunks, [65_536, 65_536, 1, 65_536, 4_464])
    }).pipe(Effect.provide(BrowserCrypto.layer.pipe(
      Layer.provide(Layer.succeed(BrowserCrypto.WebCrypto, {
        ...crypto,
        getRandomValues<T extends ArrayBufferView | null>(array: T): T {
          if (array !== null) {
            assert.ok(array.byteLength <= 65_536)
            chunks.push(array.byteLength)
          }
          return getRandomValues(array)
        }
      }))
    )))
  })

  it.effect("generates UUIDv4 values from getRandomValues", () =>
    Effect.gen(function*() {
      const crypto = yield* Crypto.Crypto
      const uuid = yield* crypto.randomUUIDv4
      assert.strictEqual(uuid, "00010203-0405-4607-8809-0a0b0c0d0e0f")
      assert.match(uuid, uuidV4Regex)
    }).pipe(Effect.provide(BrowserCrypto.layer.pipe(
      Layer.provide(Layer.succeed(BrowserCrypto.WebCrypto, {
        ...crypto,
        getRandomValues
      }))
    ))))

  it.effect("generates UUIDv7 values from getRandomValues and the Clock", () =>
    Effect.gen(function*() {
      yield* TestClock.setTime(0x0123456789ab)
      const crypto = yield* Crypto.Crypto
      const uuid = yield* crypto.randomUUIDv7
      assert.strictEqual(uuid, "01234567-89ab-7607-8809-0a0b0c0d0e0f")
      assert.match(uuid, uuidV7Regex)
    }).pipe(Effect.provide(BrowserCrypto.layer.pipe(
      Layer.provide(Layer.succeed(BrowserCrypto.WebCrypto, {
        ...crypto,
        getRandomValues
      }))
    ))))

  it.effect("computes digests with subtle crypto", () => {
    const buffer = new ArrayBuffer(3)
    new Uint8Array(buffer).set([1, 2, 3])

    return Effect.gen(function*() {
      const crypto = yield* Crypto.Crypto
      const digest = yield* crypto.digest("SHA-256", new Uint8Array(buffer))
      assert.deepStrictEqual(digest, new Uint8Array([1, 2, 3]))
    }).pipe(
      Effect.provide(BrowserCrypto.layer.pipe(
        Layer.provide(Layer.succeed(BrowserCrypto.WebCrypto, {
          ...crypto,
          subtle: {
            ...crypto.subtle,
            digest() {
              return Promise.resolve(buffer)
            }
          }
        }))
      ))
    )
  })

  it.effect("fails with PlatformError when subtle is absent", () => checkUnavailable(withSubtle(undefined)))

  it.effect("fails with PlatformError when subtle exists but digest is absent", () =>
    checkUnavailable(withSubtle(Object.create(globalThis.crypto.subtle, { digest: { value: undefined } }))))

  it.effect("computes a real SHA-256 digest when subtle is present", () =>
    Effect.gen(function*() {
      const service = yield* Crypto.Crypto
      const bytes = yield* service.digest("SHA-256", new TextEncoder().encode("abc"))
      const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
      assert.strictEqual(hex, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    }).pipe(Effect.provide(layerWith(withSubtle(webcrypto.subtle)))))

  it.effect("preserves a rejected digest promise as a typed PlatformError", () => {
    const rejection = new Error("Digest rejected by fixture")
    const subtle = Object.create(globalThis.crypto.subtle, {
      digest: { value: () => Promise.reject(rejection) }
    })
    return Effect.gen(function*() {
      const service = yield* Crypto.Crypto
      const exit = yield* Effect.exit(service.digest("SHA-256", new Uint8Array()))
      const error = assertPlatformError(exit, "Could not compute digest")
      assert.strictEqual(error.reason.cause, rejection)
    }).pipe(Effect.provide(layerWith(withSubtle(subtle))))
  })

  it.effect("synthetic control: fails with PlatformError when subtle is null", () => checkUnavailable(withSubtle(null)))

  it.effect("still dies when the entire Web Crypto object is absent", () => {
    const fixture = { crypto: globalThis.crypto }
    Object.defineProperty(fixture, "crypto", { value: undefined })
    return Effect.gen(function*() {
      const exit = yield* Effect.exit(Crypto.Crypto.pipe(Effect.provide(layerWith(fixture.crypto))))
      assert.ok(Exit.isFailure(exit))
      assert.strictEqual(exit.cause.reasons.length, 1)
      const reason = exit.cause.reasons[0]
      assert.ok(Cause.isDieReason(reason))
      assert.ok(reason.defect instanceof Error)
      assert.strictEqual(reason.defect.message, "Web Crypto API is not available")
    })
  })
})
