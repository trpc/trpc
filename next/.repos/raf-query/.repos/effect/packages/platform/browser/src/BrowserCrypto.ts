/**
 * Browser-backed implementation of Effect's Crypto service.
 *
 * This module provides a `Crypto.Crypto` layer backed by the Web Crypto API.
 * The {@link WebCrypto} context reference defaults to `globalThis.crypto`, so
 * browser programs can use the standard implementation while tests or embedded
 * runtimes can provide their own `Crypto` object.
 *
 * @since 1.0.0
 */
import * as Context from "effect/Context"
import * as EffectCrypto from "effect/Crypto"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as PlatformError from "effect/PlatformError"

/**
 * Provides Browser Web Crypto APIs used by the Crypto service implementation.
 *
 * **When to use**
 *
 * Use to override the browser `Crypto` object used by the platform crypto
 * layer.
 *
 * @category services
 * @since 1.0.0
 */
export const WebCrypto = Context.Reference<Crypto>("@effect/platform-browser/Crypto/WebCrypto", {
  defaultValue: () => globalThis.crypto
})

/**
 * Layer that directly interfaces with the Web Crypto API.
 *
 * **When to use**
 *
 * Use to provide cryptographic randomness, UUID generation, and digest
 * operations in browser runtimes backed by `globalThis.crypto`.
 *
 * **Details**
 *
 * Random bytes are produced with `crypto.getRandomValues`. Digests are computed
 * with `crypto.subtle.digest` and returned as `Uint8Array` values.
 *
 * **Gotchas**
 *
 * The layer dies if the Web Crypto object is unavailable. Digest operations
 * fail with `PlatformError` when `crypto.subtle.digest` is unavailable or the
 * browser rejects the digest request.
 *
 * @category layers
 * @since 1.0.0
 */
export const layer: Layer.Layer<EffectCrypto.Crypto> = Layer.effect(
  EffectCrypto.Crypto,
  Effect.gen(function*() {
    const crypto = yield* WebCrypto
    if (!crypto) {
      return yield* Effect.die(new Error("Web Crypto API is not available"))
    }
    const randomBytes = (size: number): Uint8Array => {
      const bytes = new Uint8Array(size)
      for (let i = 0; i < bytes.length; i += 65_536) {
        crypto.getRandomValues(bytes.subarray(i, i + 65_536))
      }
      return bytes
    }

    const digest: EffectCrypto.Crypto["digest"] = (algorithm, data) => {
      if (typeof crypto.subtle?.digest !== "function") {
        return Effect.fail(PlatformError.systemError({
          module: "Crypto",
          method: "digest",
          _tag: "Unknown",
          description: "crypto.subtle.digest is not available"
        }))
      }
      return Effect.map(
        Effect.tryPromise({
          try: () => crypto.subtle.digest(algorithm, new Uint8Array(data)),
          catch: (cause) =>
            PlatformError.systemError({
              module: "Crypto",
              method: "digest",
              _tag: "Unknown",
              description: "Could not compute digest",
              cause
            })
        }),
        (buffer) => new Uint8Array(buffer)
      )
    }

    return EffectCrypto.make({
      randomBytes,
      digest
    })
  })
)
