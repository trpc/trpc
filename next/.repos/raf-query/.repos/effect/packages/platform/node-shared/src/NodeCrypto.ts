/**
 * Node-compatible implementation of Effect's `Crypto` service.
 *
 * This module builds the service from `node:crypto`, using `randomBytes` for
 * random data and `createHash` for supported digest algorithms. It exports
 * `make` as the concrete service value and `layer` for providing it through
 * Effect context.
 *
 * @since 1.0.0
 */
import * as EffectCrypto from "effect/Crypto"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as PlatformError from "effect/PlatformError"
import * as NodeCrypto from "node:crypto"

const toHashAlgorithm = (algorithm: EffectCrypto.DigestAlgorithm): string => {
  switch (algorithm) {
    case "SHA-1":
      return "sha1"
    case "SHA-256":
      return "sha256"
    case "SHA-384":
      return "sha384"
    case "SHA-512":
      return "sha512"
  }
}

const digest: EffectCrypto.Crypto["digest"] = (algorithm, data) =>
  Effect.try({
    try: () => Uint8Array.from(NodeCrypto.createHash(toHashAlgorithm(algorithm)).update(data).digest()),
    catch: (cause) =>
      PlatformError.systemError({
        module: "Crypto",
        method: "digest",
        _tag: "Unknown",
        description: "Could not compute digest",
        cause
      })
  })

/**
 * The default Node.js Crypto service implementation.
 *
 * @category constructors
 * @since 1.0.0
 */
export const make: EffectCrypto.Crypto = EffectCrypto.make({
  randomBytes: NodeCrypto.randomBytes,
  digest
})

/**
 * Layer that provides the Node.js Crypto service implementation.
 *
 * @category layers
 * @since 1.0.0
 */
export const layer: Layer.Layer<EffectCrypto.Crypto> = Layer.succeed(EffectCrypto.Crypto, make)
