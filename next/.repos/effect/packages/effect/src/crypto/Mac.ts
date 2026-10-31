/**
 * Message authentication codes: HMAC with SHA-1, SHA-256, SHA-384, or
 * SHA-512.
 *
 * The {@link Mac} service generates keys, signs data, and verifies tags. The
 * top-level {@link key}, {@link fromCryptoKey}, and {@link toBytes} functions
 * build and export keys without a service, and {@link timingSafeEqual}
 * compares byte arrays in constant time.
 *
 * Keys are opaque. They hold either key bytes or a `CryptoKey`, display only
 * their algorithm, and compare by reference.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import type { Inspectable } from "../Inspectable.ts"
import * as Layer from "../Layer.ts"
import * as Predicate from "../Predicate.ts"
import type * as CryptoError from "./CryptoError.ts"
import * as Digest from "./Digest.ts"
import * as KeyModel from "./internal/key.ts"
import * as internal from "./internal/webCrypto.ts"
import * as SecureRandom from "./SecureRandom.ts"
import * as WebCrypto from "./WebCrypto.ts"

const TypeId = "~effect/crypto/Mac/Key" as const

/**
 * An HMAC algorithm, such as {@link hmacSha256}.
 *
 * **Details**
 *
 * `hash` is the digest the HMAC is built on.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Algorithm {
  readonly name: "hmacSha1" | "hmacSha256" | "hmacSha384" | "hmacSha512"
  readonly hash: Digest.Algorithm
}

/**
 * HMAC with SHA-1, with a 20-byte tag.
 *
 * **Gotchas**
 *
 * HMAC-SHA-1 is still secure as a MAC, but use it only for interoperability
 * with existing protocols.
 *
 * @stability unstable
 * @category algorithms
 * @since 4.0.0
 */
export const hmacSha1: Algorithm = { name: "hmacSha1", hash: Digest.sha1 }

/**
 * HMAC with SHA-256, with a 32-byte tag.
 *
 * @stability unstable
 * @category algorithms
 * @since 4.0.0
 */
export const hmacSha256: Algorithm = { name: "hmacSha256", hash: Digest.sha256 }

/**
 * HMAC with SHA-384, with a 48-byte tag.
 *
 * @stability unstable
 * @category algorithms
 * @since 4.0.0
 */
export const hmacSha384: Algorithm = { name: "hmacSha384", hash: Digest.sha384 }

/**
 * HMAC with SHA-512, with a 64-byte tag.
 *
 * @stability unstable
 * @category algorithms
 * @since 4.0.0
 */
export const hmacSha512: Algorithm = { name: "hmacSha512", hash: Digest.sha512 }

/**
 * An opaque HMAC key for the algorithm `A`.
 *
 * **Details**
 *
 * The key holds either key bytes or a `CryptoKey` from {@link fromCryptoKey}.
 * `toString`, `toJSON`, and `inspect` show only the algorithm. Keys compare
 * by reference and do not implement `Equal`, because comparing key bytes is
 * not constant time.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Key<out A extends Algorithm = Algorithm> extends Inspectable {
  readonly [TypeId]: typeof TypeId
  readonly algorithm: A
}

const KeyProto = KeyModel.redactedProto(TypeId, "Mac.Key")

/**
 * Checks whether a value is a {@link Key}.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isKey = (u: unknown): u is Key => Predicate.hasProperty(u, TypeId)

// Generated keys have the hash's block size, as Web Crypto generates them.
const blockSizes: Record<Digest.Algorithm["name"], number> = {
  "MD5": 64,
  "SHA-1": 64,
  "SHA-256": 64,
  "SHA-384": 128,
  "SHA-512": 128
}

/**
 * Service that generates HMAC keys, signs data, and verifies tags.
 *
 * **Example** (Signing and verifying a message)
 *
 * ```ts import.meta.vitest
 * import { Effect, Layer } from "effect"
 * import { Mac, SecureRandom } from "effect/crypto"
 *
 * const program = Effect.gen(function*() {
 *   const mac = yield* Mac.Mac
 *   const key = yield* mac.generateKey(Mac.hmacSha256)
 *   const data = new TextEncoder().encode("message")
 *   const tag = yield* mac.sign(key, data)
 *   return yield* mac.verify(key, tag, data)
 * })
 *
 * const layer = Mac.layerWebCrypto.pipe(Layer.provide(SecureRandom.layerWebCrypto))
 * const valid = await Effect.runPromise(program.pipe(Effect.provide(layer)))
 * valid // => true
 * ```
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class Mac extends Context.Service<Mac, {
  /**
   * Generates a random key of the hash's block size from `SecureRandom`
   * bytes.
   */
  readonly generateKey: <A extends Algorithm>(algorithm: A) => Effect.Effect<Key<A>, CryptoError.CryptoError>
  /**
   * Computes the tag of `data`.
   */
  readonly sign: (key: Key, data: Uint8Array) => Effect.Effect<Uint8Array, CryptoError.CryptoError>
  /**
   * Checks `tag` against the tag of `data` in constant time. A wrong tag, or
   * a tag of the wrong length, returns `false`.
   */
  readonly verify: (key: Key, tag: Uint8Array, data: Uint8Array) => Effect.Effect<boolean, CryptoError.CryptoError>
}>()("effect/crypto/Mac") {}

const importParams = (algorithm: Algorithm): HmacImportParams => ({ name: "HMAC", hash: algorithm.hash.name })

/**
 * Builds a `Mac` layer on the `WebCrypto` reference that can sign and verify
 * byte-backed keys with a synchronous HMAC primitive.
 *
 * **When to use**
 *
 * Use to run HMAC on a runtime's native code, as `NodeCrypto.layerMac` does
 * with `createHmac` from `node:crypto`.
 *
 * **Details**
 *
 * `hmac` receives the hash name, the key bytes, and the data, and returns the
 * tag. It runs only for byte-backed keys. `CryptoKey`-backed keys run on
 * `crypto.subtle`, and generated keys come from `SecureRandom`, as in
 * {@link layerWebCrypto}. `verify` computes the tag with `hmac` and compares
 * it with {@link timingSafeEqual}. Without `hmac`, the layer is
 * {@link layerWebCrypto}.
 *
 * **Gotchas**
 *
 * `hmac` receives the key's own bytes, not a copy, so it must not modify or
 * keep them.
 *
 * **Example** (Signing with a native HMAC)
 *
 * ```ts
 * import { Layer } from "effect"
 * import { Mac, SecureRandom } from "effect/crypto"
 *
 * declare const nativeHmac: (hash: string, key: Uint8Array, data: Uint8Array) => Uint8Array
 *
 * const layer = Mac.layerWebCryptoWith({ hmac: nativeHmac }).pipe(
 *   Layer.provide(SecureRandom.layerWebCrypto)
 * )
 * ```
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerWebCryptoWith = (options: {
  readonly hmac?: ((hash: Digest.Algorithm["name"], key: Uint8Array, data: Uint8Array) => Uint8Array) | undefined
}): Layer.Layer<Mac, never, SecureRandom.SecureRandom> =>
  Layer.effect(
    Mac,
    Effect.gen(function*() {
      const random = yield* SecureRandom.SecureRandom
      const crypto = yield* WebCrypto.WebCrypto
      const cryptoKeyFor = KeyModel.makeCache((subtle, bytes, algorithm: Algorithm) =>
        subtle.importKey("raw", bytes as BufferSource, importParams(algorithm), false, ["sign", "verify"])
      )
      const hmac = options.hmac
      // Computes a byte-backed key's tags with `hmac`, or `undefined` to use WebCrypto.
      const hmacTag = (key: Key): ((data: Uint8Array) => Uint8Array) | undefined => {
        if (hmac === undefined) return undefined
        const stored = KeyModel.material(key)
        return stored._tag === "Bytes" ? (data) => hmac(key.algorithm.hash.name, stored.bytes, data) : undefined
      }
      return Mac.of({
        generateKey: (algorithm) =>
          Effect.map(
            random.randomBytes(blockSizes[algorithm.hash.name]),
            (bytes) => KeyModel.makeBytes(KeyProto, algorithm, bytes)
          ),
        sign: (key, data) => {
          const tagOf = hmacTag(key)
          return tagOf !== undefined
            ? Effect.sync(() => tagOf(data))
            : internal.run(
              "Mac",
              "sign",
              key.algorithm.name,
              crypto,
              async (subtle) =>
                new Uint8Array(await subtle.sign("HMAC", await cryptoKeyFor(subtle, key), data as BufferSource))
            )
        },
        // Both paths compare tags in constant time and reject other lengths.
        verify: (key, tag, data) => {
          const tagOf = hmacTag(key)
          return tagOf !== undefined
            ? Effect.sync(() => timingSafeEqual(tagOf(data), tag))
            : internal.run(
              "Mac",
              "verify",
              key.algorithm.name,
              crypto,
              async (subtle) =>
                subtle.verify("HMAC", await cryptoKeyFor(subtle, key), tag as BufferSource, data as BufferSource)
            )
        }
      })
    })
  )

/**
 * Layer that provides `Mac` on the `WebCrypto` reference.
 *
 * **Details**
 *
 * Signing and verification run on `crypto.subtle`. The layer imports a
 * byte-backed key on first use and caches the `CryptoKey`. Generated keys come
 * from `SecureRandom`, so a seeded `SecureRandom` gives reproducible keys.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerWebCrypto: Layer.Layer<Mac, never, SecureRandom.SecureRandom> = layerWebCryptoWith({})

/**
 * Builds a key from raw key bytes.
 *
 * **Details**
 *
 * The bytes are copied into a new `Uint8Array`, so later changes to the input,
 * including a Node.js `Buffer`, do not reach the key. Any non-empty length is
 * accepted; RFC 2104 recommends at least the hash's output length. An empty key
 * fails with an `InvalidKey` reason.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const key = <A extends Algorithm>(
  algorithm: A,
  bytes: Uint8Array
): Effect.Effect<Key<A>, CryptoError.CryptoError> =>
  KeyModel.fromBytes(
    "Mac",
    "key",
    KeyProto,
    algorithm,
    bytes,
    (bytes) => bytes.length === 0 ? "An HMAC key cannot be empty" : undefined
  )

/**
 * Builds a key from an existing `CryptoKey`, such as a non-extractable one.
 *
 * **Details**
 *
 * The `CryptoKey` must be a secret HMAC key with the algorithm's hash and both
 * the `sign` and `verify` usages, since a key reaches both operations.
 * Otherwise the constructor fails with an `InvalidKey` reason. It must come
 * from the `Crypto` object of the `WebCrypto` reference.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const fromCryptoKey = <A extends Algorithm>(
  algorithm: A,
  cryptoKey: WebCrypto.CryptoKey
): Effect.Effect<Key<A>, CryptoError.CryptoError> =>
  KeyModel.fromCryptoKey("Mac", "fromCryptoKey", KeyProto, algorithm, cryptoKey, {
    type: "secret",
    name: "HMAC",
    usages: ["sign", "verify"],
    usagePolicy: "all",
    check: (keyAlgorithm) => {
      const hash = (keyAlgorithm as HmacKeyAlgorithm).hash?.name
      return hash === algorithm.hash.name ? undefined : `Expected an HMAC key for ${algorithm.hash.name}, not ${hash}`
    }
  })

/**
 * Exports a key's bytes.
 *
 * **Details**
 *
 * Returns a fresh `Uint8Array` that shares no memory with the key. A
 * `CryptoKey`-backed key is exported on the `WebCrypto` reference, and fails
 * with a `NotExtractable` reason when the `CryptoKey` is not extractable.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const toBytes = (key: Key): Effect.Effect<Uint8Array, CryptoError.CryptoError> =>
  KeyModel.toBytes("Mac", key, KeyModel.exportRaw)

/**
 * Compares two byte arrays in constant time.
 *
 * **When to use**
 *
 * Use to compare secrets of a fixed, known length, such as tags computed
 * outside {@link Mac}. To check an HMAC tag, use `Mac.verify`.
 *
 * **Gotchas**
 *
 * Arrays of different lengths return `false` immediately, revealing their
 * lengths. Equal-length arrays are compared with an XOR-accumulate loop;
 * JavaScript runtimes do not guarantee constant-time execution.
 *
 * **Example** (Comparing fixed-length secrets)
 *
 * ```ts import.meta.vitest
 * import { Mac } from "effect/crypto"
 *
 * const expected = new Uint8Array([1, 2, 3])
 * const received = new Uint8Array([1, 2, 3])
 * Mac.timingSafeEqual(expected, received) // => true
 * ```
 *
 * @stability unstable
 * @category utils
 * @since 4.0.0
 */
export const timingSafeEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false
  let difference = 0
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i]
  return difference === 0
}
