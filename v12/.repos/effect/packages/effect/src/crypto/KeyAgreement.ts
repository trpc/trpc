/**
 * Key agreement: X25519, and ECDH on P-256, P-384 and P-521.
 *
 * The {@link KeyAgreement} service generates key pairs, derives a shared
 * secret from a private key and a peer's public key, and computes a private
 * key's public key. The top-level {@link privateKey}, {@link publicKey},
 * {@link privateKeyFromCryptoKey}, {@link publicKeyFromCryptoKey}, and
 * {@link toBytes} functions build and export keys without a service.
 *
 * Keys carry their algorithm in their type, so deriving a secret from keys on
 * different curves is a type error. The shared secret is plain bytes: pass it
 * through `Kdf` before using it as a key.
 *
 * Keys are opaque. They hold either bytes or a `CryptoKey`, display only their
 * algorithm, and compare by reference. The bytes are:
 *
 * - X25519: the 32-byte private key and the 32-byte public key;
 * - ECDH: PKCS#8 for private keys, and the uncompressed SEC1 point for public
 *   keys.
 *
 * Only X25519 private keys and X25519 and ECDH public keys have a raw
 * constructor. ECDH private keys come from
 * `KeyAgreement.generateKeyPair`, `CryptoKey`s, or key formats.
 *
 * **Gotchas**
 *
 * - X25519 needs Chrome 133, Firefox 130, or Safari 17. There is no fallback
 *   for older browsers.
 * - X25519 private keys are generated from `SecureRandom` bytes, so a seeded
 *   `SecureRandom` reproduces them. ECDH key generation uses WebCrypto's own
 *   randomness and cannot be seeded.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import type { Inspectable } from "../Inspectable.ts"
import * as Layer from "../Layer.ts"
import * as Predicate from "../Predicate.ts"
import * as CryptoError from "./CryptoError.ts"
import * as Asymmetric from "./internal/asymmetric.ts"
import * as KeyModel from "./internal/key.ts"
import * as internal from "./internal/webCrypto.ts"
import * as SecureRandom from "./SecureRandom.ts"
import * as WebCrypto from "./WebCrypto.ts"

const PrivateKeyTypeId = "~effect/crypto/KeyAgreement/PrivateKey" as const
const PublicKeyTypeId = "~effect/crypto/KeyAgreement/PublicKey" as const

/**
 * An elliptic curve for ECDH.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Curve = "P-256" | "P-384" | "P-521"

/**
 * X25519 (RFC 7748), with 32-byte shared secrets.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface X25519 {
  readonly _tag: "X25519"
  readonly name: "x25519"
}

/**
 * ECDH on a NIST curve, with shared secrets of the curve's coordinate size.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Ecdh<C extends Curve = Curve> {
  readonly _tag: "Ecdh"
  readonly name: { readonly "P-256": "ecdhP256"; readonly "P-384": "ecdhP384"; readonly "P-521": "ecdhP521" }[C]
  readonly namedCurve: C
}

/**
 * A key agreement algorithm, such as {@link x25519} or {@link ecdhP256}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Algorithm = X25519 | Ecdh

/**
 * X25519 (RFC 7748).
 *
 * @stability unstable
 * @category algorithms
 * @since 4.0.0
 */
export const x25519: X25519 = { _tag: "X25519", name: "x25519" }

/**
 * ECDH on P-256, with 32-byte shared secrets.
 *
 * @stability unstable
 * @category algorithms
 * @since 4.0.0
 */
export const ecdhP256: Ecdh<"P-256"> = { _tag: "Ecdh", name: "ecdhP256", namedCurve: "P-256" }

/**
 * ECDH on P-384, with 48-byte shared secrets.
 *
 * @stability unstable
 * @category algorithms
 * @since 4.0.0
 */
export const ecdhP384: Ecdh<"P-384"> = { _tag: "Ecdh", name: "ecdhP384", namedCurve: "P-384" }

/**
 * ECDH on P-521, with 66-byte shared secrets.
 *
 * @stability unstable
 * @category algorithms
 * @since 4.0.0
 */
export const ecdhP521: Ecdh<"P-521"> = { _tag: "Ecdh", name: "ecdhP521", namedCurve: "P-521" }

/**
 * An opaque key agreement private key for the algorithm `A`.
 *
 * **Details**
 *
 * The key holds either bytes or a `CryptoKey` from
 * {@link privateKeyFromCryptoKey}. `toString`, `toJSON`, and `inspect` show
 * only the algorithm. Keys compare by reference and do not implement `Equal`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface PrivateKey<out A extends Algorithm = Algorithm> extends Inspectable {
  readonly [PrivateKeyTypeId]: typeof PrivateKeyTypeId
  readonly algorithm: A
}

/**
 * An opaque key agreement public key for the algorithm `A`.
 *
 * **Details**
 *
 * The key holds either bytes or a `CryptoKey` from
 * {@link publicKeyFromCryptoKey}. Keys compare by reference and do not
 * implement `Equal`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface PublicKey<out A extends Algorithm = Algorithm> extends Inspectable {
  readonly [PublicKeyTypeId]: typeof PublicKeyTypeId
  readonly algorithm: A
}

/**
 * A private key and its public key.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface KeyPair<out A extends Algorithm = Algorithm> {
  readonly privateKey: PrivateKey<A>
  readonly publicKey: PublicKey<A>
}

const PrivateKeyProto = KeyModel.redactedProto(PrivateKeyTypeId, "KeyAgreement.PrivateKey")
const PublicKeyProto = KeyModel.redactedProto(PublicKeyTypeId, "KeyAgreement.PublicKey")

/**
 * Checks whether a value is a {@link PrivateKey}.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isPrivateKey = (u: unknown): u is PrivateKey => Predicate.hasProperty(u, PrivateKeyTypeId)

/**
 * Checks whether a value is a {@link PublicKey}.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isPublicKey = (u: unknown): u is PublicKey => Predicate.hasProperty(u, PublicKeyTypeId)

const specOf = (algorithm: Algorithm): Asymmetric.Spec =>
  algorithm._tag === "X25519"
    ? {
      name: "X25519",
      importParams: { name: "X25519" },
      privateUsages: ["deriveBits"],
      publicUsages: [],
      seedPrefix: Asymmetric.x25519Prefix,
      publicFormat: "raw"
    }
    : {
      name: "ECDH",
      importParams: { name: "ECDH", namedCurve: algorithm.namedCurve },
      privateUsages: ["deriveBits"],
      publicUsages: [],
      seedPrefix: undefined,
      publicFormat: "raw",
      check: Asymmetric.checkNamedCurve(algorithm.namedCurve)
    }

/** @internal */
export const family: Asymmetric.Family = {
  module: "KeyAgreement",
  specOf,
  privateKeyProto: PrivateKeyProto,
  publicKeyProto: PublicKeyProto,
  isPrivateKey
}

// P-521 coordinates are 521 bits, padded to 66 bytes.
const sharedSecretBits = (algorithm: Algorithm): number =>
  algorithm._tag === "X25519" ? 256 : 8 * Asymmetric.coordinateSizes[algorithm.namedCurve]

const invalidPeer = (description: string, cause?: unknown) =>
  new CryptoError.CryptoError({
    module: "KeyAgreement",
    method: "deriveSharedSecret",
    reason: new CryptoError.InvalidKey(cause === undefined ? { description } : { description, cause })
  })

/**
 * Service that generates key pairs, derives shared secrets, and computes
 * public keys.
 *
 * **Example** (Agreeing on a secret with X25519)
 *
 * ```ts import.meta.vitest
 * import { Effect, Layer } from "effect"
 * import { KeyAgreement, SecureRandom } from "effect/crypto"
 *
 * const program = Effect.gen(function*() {
 *   const keyAgreement = yield* KeyAgreement.KeyAgreement
 *   const alice = yield* keyAgreement.generateKeyPair(KeyAgreement.x25519)
 *   const bob = yield* keyAgreement.generateKeyPair(KeyAgreement.x25519)
 *   const aliceSecret = yield* keyAgreement.deriveSharedSecret(alice.privateKey, bob.publicKey)
 *   const bobSecret = yield* keyAgreement.deriveSharedSecret(bob.privateKey, alice.publicKey)
 *   return aliceSecret.every((byte, i) => byte === bobSecret[i])
 * })
 *
 * const layer = KeyAgreement.layerWebCrypto.pipe(Layer.provide(SecureRandom.layerWebCrypto))
 * await Effect.runPromise(program.pipe(Effect.provide(layer))) // => true
 * ```
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class KeyAgreement extends Context.Service<KeyAgreement, {
  /**
   * Generates a key pair. X25519 private keys are 32 bytes from
   * `SecureRandom`. ECDH keys are generated by WebCrypto and exported to
   * PKCS#8 and an uncompressed point.
   */
  readonly generateKeyPair: <A extends Algorithm>(algorithm: A) => Effect.Effect<KeyPair<A>, CryptoError.CryptoError>
  /**
   * Computes the secret shared by a private key and a peer's public key on
   * the same curve. A peer key that is not on the curve, or a low-order
   * X25519 key that gives an all-zero secret, fails with an `InvalidKey`
   * reason.
   */
  readonly deriveSharedSecret: <A extends Algorithm>(
    privateKey: PrivateKey<A>,
    publicKey: PublicKey<A>
  ) => Effect.Effect<Uint8Array, CryptoError.CryptoError>
  /**
   * Computes the public key of a private key. A non-extractable `CryptoKey`
   * fails with a `NotExtractable` reason, since its public members cannot be
   * read.
   */
  readonly publicKeyOf: <A extends Algorithm>(
    privateKey: PrivateKey<A>
  ) => Effect.Effect<PublicKey<A>, CryptoError.CryptoError>
}>()("effect/crypto/KeyAgreement") {}

/**
 * Layer that provides `KeyAgreement` on the `WebCrypto` reference.
 *
 * **Details**
 *
 * Every algorithm runs on `crypto.subtle`. The layer imports a byte-backed
 * key on first use and caches the `CryptoKey`. X25519 private keys come from
 * `SecureRandom`, so a seeded `SecureRandom` reproduces them.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerWebCrypto: Layer.Layer<KeyAgreement, never, SecureRandom.SecureRandom> = Layer.effect(
  KeyAgreement,
  Effect.gen(function*() {
    const random = yield* SecureRandom.SecureRandom
    const crypto = yield* WebCrypto.WebCrypto
    const caches = Asymmetric.makeCaches(family)
    return KeyAgreement.of({
      generateKeyPair: <A extends Algorithm>(algorithm: A) =>
        Asymmetric.generateKeyPair<KeyPair<A>>(family, crypto, random, algorithm, specOf(algorithm).importParams),
      deriveSharedSecret: (privateKey, publicKey) =>
        Effect.suspend(() => {
          const algorithm: Algorithm = privateKey.algorithm
          // The types keep curves apart, but keys typed with the default
          // `Algorithm` can still differ at run time.
          if (algorithm.name !== publicKey.algorithm.name) {
            return Effect.fail(
              invalidPeer(`Expected a ${algorithm.name} public key, not ${publicKey.algorithm.name}`)
            )
          }
          const onError = (cause: unknown) =>
            Asymmetric.publicKeyError("KeyAgreement", "deriveSharedSecret", publicKey, cause)
          // The keys are imported before deriving, so an `OperationError` from
          // `deriveBits` can only come from the peer key.
          return internal.run(
            "KeyAgreement",
            "deriveSharedSecret",
            algorithm.name,
            crypto,
            async (subtle) => ({
              privateKey: await caches.privateKey(subtle, privateKey),
              publicKey: await caches.publicKey(subtle, publicKey)
            }),
            onError
          ).pipe(
            Effect.flatMap((keys) =>
              internal.run(
                "KeyAgreement",
                "deriveSharedSecret",
                algorithm.name,
                crypto,
                async (subtle) =>
                  new Uint8Array(
                    await subtle.deriveBits(
                      { name: specOf(algorithm).name, public: keys.publicKey },
                      keys.privateKey,
                      sharedSecretBits(algorithm)
                    )
                  ),
                (cause) =>
                  internal.isOperationError(cause) ? invalidPeer("Invalid peer public key", cause) : onError(cause)
              )
            ),
            Effect.flatMap((secret) =>
              // RFC 7748, section 6.1: an all-zero X25519 output means the peer
              // sent a low-order point, and protocols such as SSH must abort.
              algorithm._tag === "X25519" && secret.every((byte) => byte === 0)
                ? Effect.fail(invalidPeer("X25519 shared secret must not be all zeros"))
                : Effect.succeed(secret)
            )
          )
        }),
      publicKeyOf: <A extends Algorithm>(privateKey: PrivateKey<A>) =>
        Asymmetric.publicKeyOf<PublicKey<A>>(family, crypto, privateKey)
    })
  })
)

/**
 * Builds an X25519 private key from its 32 bytes.
 *
 * **Details**
 *
 * The bytes are copied. Another length fails with an `InvalidKey` reason,
 * including the 64-byte `private key‖public key` form libsodium uses: pass
 * its first 32 bytes. ECDH private keys have no raw form, so passing them is
 * a type error.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const privateKey = <
  A extends X25519
>(
  algorithm: A,
  bytes: Uint8Array
): Effect.Effect<PrivateKey<A>, CryptoError.CryptoError> =>
  KeyModel.fromBytes(
    "KeyAgreement",
    "privateKey",
    PrivateKeyProto,
    algorithm,
    bytes,
    Asymmetric.checkSeedLength("X25519", "private")
  )

/**
 * Builds a public key from its raw form: 32 bytes for X25519, or an
 * uncompressed SEC1 point for ECDH.
 *
 * **Details**
 *
 * The bytes are copied. A wrong length, or a compressed point, fails with an
 * `InvalidKey` reason. Only uncompressed points are taken because Safari and
 * Firefox before 146 reject compressed ones in raw import, though they accept
 * them inside SPKI: decode a compressed point with `KeyFormat.spki`. Whether a
 * point is on the curve is checked when the key is first used.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const publicKey = <A extends Algorithm>(
  algorithm: A,
  bytes: Uint8Array
): Effect.Effect<PublicKey<A>, CryptoError.CryptoError> =>
  KeyModel.fromBytes(
    "KeyAgreement",
    "publicKey",
    PublicKeyProto,
    algorithm,
    bytes,
    algorithm._tag === "Ecdh"
      ? Asymmetric.checkPoint(algorithm.namedCurve)
      : Asymmetric.checkSeedLength("X25519", "public")
  )

/**
 * Builds a private key from an existing `CryptoKey`, such as a
 * non-extractable one.
 *
 * **Details**
 *
 * The `CryptoKey` must be a private key of the algorithm's WebCrypto name and
 * curve, with the `deriveBits` usage. Otherwise the constructor fails with an
 * `InvalidKey` reason. The key must come from the `Crypto` object of the
 * `WebCrypto` reference.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const privateKeyFromCryptoKey = <A extends Algorithm>(
  algorithm: A,
  cryptoKey: WebCrypto.CryptoKey
): Effect.Effect<PrivateKey<A>, CryptoError.CryptoError> =>
  Asymmetric.fromCryptoKey(family, "privateKeyFromCryptoKey", algorithm, "private", cryptoKey)

/**
 * Builds a public key from an existing `CryptoKey`.
 *
 * **Details**
 *
 * The `CryptoKey` must be a public key of the algorithm's WebCrypto name and
 * curve. Public keys need no usages. Otherwise the constructor fails with an
 * `InvalidKey` reason. The key must come from the `Crypto` object of the
 * `WebCrypto` reference.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const publicKeyFromCryptoKey = <A extends Algorithm>(
  algorithm: A,
  cryptoKey: WebCrypto.CryptoKey
): Effect.Effect<PublicKey<A>, CryptoError.CryptoError> =>
  Asymmetric.fromCryptoKey(family, "publicKeyFromCryptoKey", algorithm, "public", cryptoKey)

/**
 * Exports a key's stored bytes.
 *
 * **Details**
 *
 * Returns a fresh `Uint8Array`: the raw key for X25519, and PKCS#8 or the
 * uncompressed point for ECDH. A `CryptoKey`-backed key is exported on the
 * `WebCrypto` reference, and fails with a `NotExtractable` reason when the
 * `CryptoKey` is not extractable.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const toBytes = (key: PrivateKey | PublicKey): Effect.Effect<Uint8Array, CryptoError.CryptoError> =>
  Asymmetric.toBytes(family, key)
