/**
 * Key wrapping: AES-KW (RFC 3394) and RSA-OAEP (RFC 8017).
 *
 * The {@link KeyWrap} service generates AES-KW keys and RSA-OAEP key pairs,
 * wraps keys, and unwraps them. The top-level {@link key},
 * {@link fromCryptoKey}, {@link privateKeyFromCryptoKey},
 * {@link publicKeyFromCryptoKey}, and {@link toBytes} functions build and
 * export keys without a service.
 *
 * `wrap` takes an `Aead`, `Cipher`, `Mac`, or `KeyWrap` key, never raw bytes,
 * which keeps RSA-OAEP limited to key transport. `unwrap` returns a typed key
 * of the algorithm it is given.
 *
 * A key-encryption key is the key most worth keeping non-extractable, so in
 * browsers {@link fromCryptoKey} is the main way to build one.
 *
 * Keys are opaque. They hold either bytes or a `CryptoKey`, display only their
 * algorithm, and compare by reference. The bytes are the AES-KW key, and
 * PKCS#8 or SPKI DER for RSA-OAEP.
 *
 * **Gotchas**
 *
 * - AES-KW wraps keys whose length is a multiple of 8 bytes and at least 16
 *   bytes. Other lengths fail with an `InvalidArgument` reason.
 * - RSA-OAEP key generation and encryption use WebCrypto's own randomness and
 *   cannot be seeded through `SecureRandom`.
 * - Safari rejects RSA-OAEP keys over 4096 bits.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import type { Inspectable } from "../Inspectable.ts"
import * as Layer from "../Layer.ts"
import * as Predicate from "../Predicate.ts"
import * as Aead from "./Aead.ts"
import * as Cipher from "./Cipher.ts"
import * as CryptoError from "./CryptoError.ts"
import * as Digest from "./Digest.ts"
import * as Asymmetric from "./internal/asymmetric.ts"
import * as KeyModel from "./internal/key.ts"
import * as internal from "./internal/webCrypto.ts"
import type * as KeyFormat from "./KeyFormat.ts"
import * as Mac from "./Mac.ts"
import * as SecureRandom from "./SecureRandom.ts"
import * as WebCrypto from "./WebCrypto.ts"

const KeyTypeId = "~effect/crypto/KeyWrap/Key" as const
const PrivateKeyTypeId = "~effect/crypto/KeyWrap/PrivateKey" as const
const PublicKeyTypeId = "~effect/crypto/KeyWrap/PublicKey" as const

/**
 * AES-KW (RFC 3394), from {@link aes128Kw} or {@link aes256Kw}.
 *
 * **Details**
 *
 * `keyLength` is in bytes.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface AesKw {
  readonly _tag: "AesKw"
  readonly name: "aes128Kw" | "aes256Kw"
  readonly keyLength: 16 | 32
}

/**
 * RSA-OAEP (RFC 8017), from {@link rsaOaep}.
 *
 * **Details**
 *
 * MGF1 uses the same hash, and there is no label. `modulusLength` is in bits
 * and is only read by key generation: an imported key's
 * `algorithm.modulusLength` is its real size.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface RsaOaep {
  readonly _tag: "RsaOaep"
  readonly name: string
  readonly hash: Digest.Algorithm
  readonly modulusLength: number
}

/**
 * A key wrapping algorithm, such as {@link aes256Kw} or {@link rsaOaepSha256}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Algorithm = AesKw | RsaOaep

/**
 * AES-128-KW (JOSE A128KW), with a 16-byte key.
 *
 * @stability unstable
 * @category algorithms
 * @since 4.0.0
 */
export const aes128Kw: AesKw = { _tag: "AesKw", name: "aes128Kw", keyLength: 16 }

/**
 * AES-256-KW (JOSE A256KW), with a 32-byte key.
 *
 * @stability unstable
 * @category algorithms
 * @since 4.0.0
 */
export const aes256Kw: AesKw = { _tag: "AesKw", name: "aes256Kw", keyLength: 32 }

/**
 * Builds an RSA-OAEP algorithm for a hash and a modulus length in bits.
 *
 * **Details**
 *
 * MGF1 uses the same hash. There is no OAEP label.
 *
 * @stability unstable
 * @category algorithms
 * @since 4.0.0
 */
export const rsaOaep = (options: {
  readonly hash: Digest.Algorithm
  readonly modulusLength: number
}): RsaOaep => ({
  _tag: "RsaOaep",
  name: `rsaOaep${Digest.nameSuffix(options.hash)}`,
  hash: options.hash,
  modulusLength: options.modulusLength
})

/**
 * RSA-OAEP with SHA-256 (JOSE RSA-OAEP-256), generating 3072-bit keys. This is
 * the default RSA-OAEP algorithm.
 *
 * @stability unstable
 * @category algorithms
 * @since 4.0.0
 */
export const rsaOaepSha256: RsaOaep = rsaOaep({ hash: Digest.sha256, modulusLength: 3072 })

/**
 * RSA-OAEP with SHA-1 (JOSE RSA-OAEP), generating 3072-bit keys.
 *
 * **When to use**
 *
 * Use to interoperate with JOSE `RSA-OAEP`. Otherwise prefer
 * {@link rsaOaepSha256}.
 *
 * @stability unstable
 * @category algorithms
 * @since 4.0.0
 */
export const rsaOaepSha1: RsaOaep = rsaOaep({ hash: Digest.sha1, modulusLength: 3072 })

/**
 * An opaque AES-KW key-encryption key for the algorithm `A`, which both wraps
 * and unwraps.
 *
 * **Details**
 *
 * The key holds either key bytes or a `CryptoKey` from {@link fromCryptoKey}.
 * `toString`, `toJSON`, and `inspect` show only the algorithm. Keys compare by
 * reference and do not implement `Equal`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Key<out A extends AesKw = AesKw> extends Inspectable {
  readonly [KeyTypeId]: typeof KeyTypeId
  readonly algorithm: A
}

/**
 * An opaque RSA-OAEP private key for the algorithm `A`, which unwraps.
 *
 * **Details**
 *
 * The key holds either PKCS#8 bytes or a `CryptoKey` from
 * {@link privateKeyFromCryptoKey}. `toString`, `toJSON`, and `inspect` show
 * only the algorithm. Keys compare by reference and do not implement `Equal`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface PrivateKey<out A extends RsaOaep = RsaOaep> extends Inspectable {
  readonly [PrivateKeyTypeId]: typeof PrivateKeyTypeId
  readonly algorithm: A
}

/**
 * An opaque RSA-OAEP public key for the algorithm `A`, which wraps.
 *
 * **Details**
 *
 * The key holds either SPKI bytes or a `CryptoKey` from
 * {@link publicKeyFromCryptoKey}. Keys compare by reference and do not
 * implement `Equal`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface PublicKey<out A extends RsaOaep = RsaOaep> extends Inspectable {
  readonly [PublicKeyTypeId]: typeof PublicKeyTypeId
  readonly algorithm: A
}

/**
 * An RSA-OAEP private key and its public key.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface KeyPair<out A extends RsaOaep = RsaOaep> {
  readonly privateKey: PrivateKey<A>
  readonly publicKey: PublicKey<A>
}

/**
 * A key that wraps: an AES-KW key or an RSA-OAEP public key.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type WrapKey<A extends Algorithm = Algorithm> =
  | (A extends AesKw ? Key<A> : never)
  | (A extends RsaOaep ? PublicKey<A> : never)

/**
 * A key that unwraps: an AES-KW key or an RSA-OAEP private key.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type UnwrapKey<A extends Algorithm = Algorithm> =
  | (A extends AesKw ? Key<A> : never)
  | (A extends RsaOaep ? PrivateKey<A> : never)

const KeyProto = KeyModel.redactedProto(KeyTypeId, "KeyWrap.Key")
const PrivateKeyProto = KeyModel.redactedProto(PrivateKeyTypeId, "KeyWrap.PrivateKey")
const PublicKeyProto = KeyModel.redactedProto(PublicKeyTypeId, "KeyWrap.PublicKey")

/**
 * Checks whether a value is an AES-KW {@link Key}.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isKey = (u: unknown): u is Key => Predicate.hasProperty(u, KeyTypeId)

/**
 * Checks whether a value is an RSA-OAEP {@link PrivateKey}.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isPrivateKey = (u: unknown): u is PrivateKey => Predicate.hasProperty(u, PrivateKeyTypeId)

/**
 * Checks whether a value is an RSA-OAEP {@link PublicKey}.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isPublicKey = (u: unknown): u is PublicKey => Predicate.hasProperty(u, PublicKeyTypeId)

const specOf = (algorithm: RsaOaep): Asymmetric.Spec => ({
  name: "RSA-OAEP",
  importParams: { name: "RSA-OAEP", hash: algorithm.hash.name },
  privateUsages: ["decrypt"],
  publicUsages: ["encrypt"],
  seedPrefix: undefined,
  publicFormat: "spki",
  check: Asymmetric.checkHash(algorithm.hash.name)
})

/** @internal */
export const family: Asymmetric.Family = {
  module: "KeyWrap",
  specOf,
  privateKeyProto: PrivateKeyProto,
  publicKeyProto: PublicKeyProto,
  isPrivateKey
}

/**
 * The family of a target key's algorithm, for reading and building target
 * keys.
 *
 * @internal
 */
export interface SecretFamily {
  readonly key: (algorithm: any, bytes: Uint8Array) => Effect.Effect<object, CryptoError.CryptoError>
  readonly toBytes: (key: any) => Effect.Effect<Uint8Array, CryptoError.CryptoError>
}

/** @internal */
export const secretFamily = (algorithm: KeyFormat.SecretAlgorithm): SecretFamily =>
  "nonceLength" in algorithm ? Aead : "mode" in algorithm ? Cipher : "_tag" in algorithm ? { key, toBytes } : Mac

// AES-KW in WebCrypto only wraps `CryptoKey`s, so the key bytes go through a
// temporary extractable HMAC key, which imports any non-empty length.
const hmacParams: HmacImportParams = { name: "HMAC", hash: "SHA-256" }

const rsaOaepParams: RsaOaepParams = { name: "RSA-OAEP" }

const invalidArgument = (description: string) => new internal.Failure(new CryptoError.InvalidArgument({ description }))

// RFC 8017, section 7.1.1: the message fits the modulus minus two hashes and
// two bytes.
const checkOaepLength = (algorithm: RsaOaep, cryptoKey: CryptoKey, length: number) => {
  const modulusLength = (cryptoKey.algorithm as RsaHashedKeyAlgorithm).modulusLength
  const max = Math.ceil(modulusLength / 8) - 2 * algorithm.hash.outputLength - 2
  if (length > max) {
    throw invalidArgument(
      `A ${modulusLength}-bit RSA-OAEP key with ${algorithm.hash.name} wraps at most ${max} bytes, not ${length}`
    )
  }
}

// RFC 3394, section 2: keys are at least two 64-bit blocks, and the wrapped
// form adds one block.
const checkKwLength = (length: number, overhead: number) => {
  if (length % 8 !== 0 || length < 16 + overhead) {
    throw invalidArgument(`AES-KW needs a multiple of 8 bytes and at least ${16 + overhead} bytes, not ${length}`)
  }
}

/**
 * Service that generates keys, wraps keys, and unwraps them.
 *
 * **Example** (Wrapping an AES-GCM key with AES-KW)
 *
 * ```ts import.meta.vitest
 * import { Effect, Layer } from "effect"
 * import { Aead, KeyWrap, SecureRandom } from "effect/crypto"
 *
 * const program = Effect.gen(function*() {
 *   const keyWrap = yield* KeyWrap.KeyWrap
 *   const kek = yield* keyWrap.generateKey(KeyWrap.aes256Kw)
 *   const key = yield* Aead.key(Aead.aes256Gcm, new Uint8Array(32))
 *   const wrapped = yield* keyWrap.wrap(kek, key)
 *   const unwrapped = yield* keyWrap.unwrap(kek, Aead.aes256Gcm, wrapped)
 *   return [wrapped.length, unwrapped.algorithm.name]
 * })
 *
 * const layer = KeyWrap.layerWebCrypto.pipe(Layer.provide(SecureRandom.layerWebCrypto))
 * await Effect.runPromise(program.pipe(Effect.provide(layer))) // => [40, "aes256Gcm"]
 * ```
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class KeyWrap extends Context.Service<KeyWrap, {
  /**
   * Generates an AES-KW key from `SecureRandom` bytes.
   */
  readonly generateKey: <A extends AesKw>(algorithm: A) => Effect.Effect<Key<A>, CryptoError.CryptoError>
  /**
   * Generates an RSA-OAEP key pair with WebCrypto's own randomness, exported
   * to PKCS#8 and SPKI.
   */
  readonly generateKeyPair: <A extends RsaOaep>(algorithm: A) => Effect.Effect<KeyPair<A>, CryptoError.CryptoError>
  /**
   * Wraps an `Aead`, `Cipher`, `Mac`, or `KeyWrap` key. A non-extractable
   * `CryptoKey`-backed key fails with a `NotExtractable` reason. A key that
   * AES-KW or the RSA-OAEP modulus cannot take fails with an
   * `InvalidArgument` reason.
   */
  readonly wrap: (wrapKey: WrapKey, key: KeyFormat.SecretKey) => Effect.Effect<Uint8Array, CryptoError.CryptoError>
  /**
   * Unwraps a key and builds it as a key of `algorithm`. Wrapped bytes that
   * fail the integrity check fail with a `DecryptionFailed` reason.
   */
  readonly unwrap: <A extends KeyFormat.SecretAlgorithm>(
    unwrapKey: UnwrapKey,
    algorithm: A,
    wrapped: Uint8Array
  ) => Effect.Effect<KeyFormat.SecretKey<A>, CryptoError.CryptoError>
}>()("effect/crypto/KeyWrap") {}

/**
 * Layer that provides `KeyWrap` on the `WebCrypto` reference.
 *
 * **Details**
 *
 * The layer imports a byte-backed key on first use and caches the
 * `CryptoKey`. AES-KW keys come from `SecureRandom`, so a seeded
 * `SecureRandom` reproduces them.
 *
 * WebCrypto's AES-KW only wraps `CryptoKey`s, so the layer imports the target
 * bytes as a temporary extractable HMAC key and wraps that. RSA-OAEP uses
 * `encrypt` and `decrypt` when the key allows them, and otherwise the same
 * route through `wrapKey` and `unwrapKey`. Both give the same ciphertext.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerWebCrypto: Layer.Layer<KeyWrap, never, SecureRandom.SecureRandom> = Layer.effect(
  KeyWrap,
  Effect.gen(function*() {
    const random = yield* SecureRandom.SecureRandom
    const crypto = yield* WebCrypto.WebCrypto
    const kwCryptoKey = KeyModel.makeCache((subtle, bytes) =>
      subtle.importKey("raw", bytes as BufferSource, "AES-KW", false, ["wrapKey", "unwrapKey"])
    )
    const caches = Asymmetric.makeCaches(family)

    const wrapBytes = (wrapKey: WrapKey, bytes: Uint8Array) =>
      internal.run("KeyWrap", "wrap", wrapKey.algorithm.name, crypto, async (subtle) => {
        if (isKey(wrapKey)) {
          checkKwLength(bytes.length, 0)
          const kek = await kwCryptoKey(subtle, wrapKey)
          const target = await subtle.importKey("raw", bytes as BufferSource, hmacParams, true, ["sign"])
          return new Uint8Array(await subtle.wrapKey("raw", target, kek, "AES-KW"))
        }
        const publicKey = await caches.publicKey(subtle, wrapKey)
        checkOaepLength(wrapKey.algorithm, publicKey, bytes.length)
        if (publicKey.usages.includes("encrypt")) {
          return new Uint8Array(await subtle.encrypt(rsaOaepParams, publicKey, bytes as BufferSource))
        }
        const target = await subtle.importKey("raw", bytes as BufferSource, hmacParams, true, ["sign"])
        return new Uint8Array(await subtle.wrapKey("raw", target, publicKey, rsaOaepParams))
      })

    const unwrapBytes = (unwrapKey: UnwrapKey, wrapped: Uint8Array) =>
      internal.run(
        "KeyWrap",
        "unwrap",
        unwrapKey.algorithm.name,
        crypto,
        async (subtle) => {
          if (isKey(unwrapKey)) {
            checkKwLength(wrapped.length, 8)
            const kek = await kwCryptoKey(subtle, unwrapKey)
            const target = await subtle.unwrapKey("raw", wrapped as BufferSource, kek, "AES-KW", hmacParams, true, [
              "sign"
            ])
            return KeyModel.exportRaw(subtle, target)
          }
          const privateKey = await caches.privateKey(subtle, unwrapKey)
          if (privateKey.usages.includes("decrypt")) {
            return new Uint8Array(await subtle.decrypt(rsaOaepParams, privateKey, wrapped as BufferSource))
          }
          const target = await subtle.unwrapKey(
            "raw",
            wrapped as BufferSource,
            privateKey,
            rsaOaepParams,
            hmacParams,
            true,
            ["sign"]
          )
          return KeyModel.exportRaw(subtle, target)
        },
        (cause) =>
          internal.webCryptoError(
            "KeyWrap",
            "unwrap",
            unwrapKey.algorithm.name,
            cause,
            () => new CryptoError.DecryptionFailed()
          )
      )

    return KeyWrap.of({
      generateKey: <A extends AesKw>(algorithm: A) =>
        Effect.map(
          random.randomBytes(algorithm.keyLength),
          (bytes) => KeyModel.makeBytes<Key<A>>(KeyProto, algorithm, bytes)
        ),
      generateKeyPair: <A extends RsaOaep>(algorithm: A) =>
        Asymmetric.generateKeyPair<KeyPair<A>>(
          family,
          crypto,
          random,
          algorithm,
          Asymmetric.rsaGenerateParams(specOf(algorithm), algorithm.modulusLength)
        ),
      wrap: (wrapKey, key) =>
        Effect.suspend(() => {
          const stored = KeyModel.material(key)
          if (stored._tag === "CryptoKey" && !stored.cryptoKey.extractable) {
            return internal.notExtractable("KeyWrap", "wrap")
          }
          return secretFamily(key.algorithm).toBytes(key).pipe(
            Effect.catch(internal.rehome("KeyWrap", "wrap")),
            Effect.flatMap((bytes) => wrapBytes(wrapKey, bytes))
          )
        }),
      unwrap: <A extends KeyFormat.SecretAlgorithm>(unwrapKey: UnwrapKey, algorithm: A, wrapped: Uint8Array) =>
        Effect.flatMap(
          unwrapBytes(unwrapKey, wrapped),
          (bytes) =>
            secretFamily(algorithm).key(algorithm, bytes).pipe(
              Effect.catch(internal.rehome("KeyWrap", "unwrap"))
            ) as Effect.Effect<KeyFormat.SecretKey<A>, CryptoError.CryptoError>
        )
    })
  })
)

/**
 * Builds an AES-KW key from its bytes.
 *
 * **Details**
 *
 * The bytes are copied. A length other than the algorithm's key length fails
 * with an `InvalidKey` reason. RSA-OAEP keys have no raw form, so passing
 * them is a type error.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const key = <A extends AesKw>(
  algorithm: A,
  bytes: Uint8Array
): Effect.Effect<Key<A>, CryptoError.CryptoError> =>
  KeyModel.fromBytes("KeyWrap", "key", KeyProto, algorithm, bytes, KeyModel.checkKeyLength(algorithm))

/**
 * Builds an AES-KW key from an existing `CryptoKey`, such as a
 * non-extractable one.
 *
 * **Details**
 *
 * The `CryptoKey` must be a secret AES-KW key of the algorithm's length with
 * both the `wrapKey` and `unwrapKey` usages, since a key reaches both
 * operations. Otherwise the constructor fails with an `InvalidKey` reason. It
 * must come from the `Crypto` object of the `WebCrypto` reference.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const fromCryptoKey = <A extends AesKw>(
  algorithm: A,
  cryptoKey: WebCrypto.CryptoKey
): Effect.Effect<Key<A>, CryptoError.CryptoError> =>
  KeyModel.fromCryptoKey("KeyWrap", "fromCryptoKey", KeyProto, algorithm, cryptoKey, {
    type: "secret",
    name: "AES-KW",
    usages: ["wrapKey", "unwrapKey"],
    usagePolicy: "all",
    check: KeyModel.checkAesLength("AES-KW", algorithm.keyLength)
  })

// RSA-OAEP keys need one usage the layer can use for the key's role, since
// `wrapKey` and `encrypt` produce the same ciphertext.
const rsaFromCryptoKey = <K>(
  method: string,
  proto: object,
  algorithm: RsaOaep,
  role: Asymmetric.Role,
  cryptoKey: WebCrypto.CryptoKey
): Effect.Effect<K, CryptoError.CryptoError> =>
  KeyModel.fromCryptoKey("KeyWrap", method, proto, algorithm, cryptoKey, {
    type: role,
    name: "RSA-OAEP",
    usages: role === "private" ? ["decrypt", "unwrapKey"] : ["encrypt", "wrapKey"],
    usagePolicy: "any",
    check: Asymmetric.checkHash(algorithm.hash.name)
  })

/**
 * Builds an RSA-OAEP private key from an existing `CryptoKey`, such as a
 * non-extractable one.
 *
 * **Details**
 *
 * The `CryptoKey` must be an RSA-OAEP private key with the algorithm's hash
 * and the `decrypt` or `unwrapKey` usage. Otherwise the constructor fails
 * with an `InvalidKey` reason. The modulus length is not checked. The key must
 * come from the `Crypto` object of the `WebCrypto` reference.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const privateKeyFromCryptoKey = <A extends RsaOaep>(
  algorithm: A,
  cryptoKey: WebCrypto.CryptoKey
): Effect.Effect<PrivateKey<A>, CryptoError.CryptoError> =>
  rsaFromCryptoKey("privateKeyFromCryptoKey", PrivateKeyProto, algorithm, "private", cryptoKey)

/**
 * Builds an RSA-OAEP public key from an existing `CryptoKey`.
 *
 * **Details**
 *
 * The `CryptoKey` must be an RSA-OAEP public key with the algorithm's hash and
 * the `encrypt` or `wrapKey` usage. Otherwise the constructor fails with an
 * `InvalidKey` reason. The key must come from the `Crypto` object of the
 * `WebCrypto` reference.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const publicKeyFromCryptoKey = <A extends RsaOaep>(
  algorithm: A,
  cryptoKey: WebCrypto.CryptoKey
): Effect.Effect<PublicKey<A>, CryptoError.CryptoError> =>
  rsaFromCryptoKey("publicKeyFromCryptoKey", PublicKeyProto, algorithm, "public", cryptoKey)

/**
 * Exports a key's stored bytes.
 *
 * **Details**
 *
 * Returns a fresh `Uint8Array`: the AES-KW key, or PKCS#8 or SPKI DER for
 * RSA-OAEP. A `CryptoKey`-backed key is exported on the `WebCrypto`
 * reference, and fails with a `NotExtractable` reason when the `CryptoKey` is
 * not extractable.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const toBytes = (key: Key | PrivateKey | PublicKey): Effect.Effect<Uint8Array, CryptoError.CryptoError> =>
  isKey(key) ? KeyModel.toBytes("KeyWrap", key, KeyModel.exportRaw) : Asymmetric.toBytes(family, key)
