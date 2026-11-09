/**
 * Unauthenticated encryption with no integrity: compose with `Mac`.
 *
 * AES-CTR and AES-CBC with PKCS#7 padding, for protocols that pair them with a
 * MAC, such as SSH, SRTP, JWE, CMS, and Matrix. Anyone can change the
 * ciphertext without being detected, so authenticate it with `Mac`
 * (encrypt-then-MAC), or use `Aead` instead.
 *
 * The {@link Cipher} service generates keys, encrypts, and decrypts. The
 * top-level {@link key}, {@link fromCryptoKey}, and {@link toBytes} functions
 * build and export keys without a service. Both modes run on `crypto.subtle`.
 *
 * Keys are opaque. They hold either key bytes or a `CryptoKey`, display only
 * their algorithm, and compare by reference.
 *
 * **Gotchas**
 *
 * - Never reuse an IV with the same key. For AES-CTR a repeated counter block
 *   reveals the XOR of two plaintexts. For AES-CBC the IV must also be
 *   unpredictable.
 * - AES-CTR decryption never fails, whatever the ciphertext. AES-CBC
 *   decryption fails with one `DecryptionFailed` reason for both bad padding
 *   and a bad length, so callers cannot tell them apart. Verify a MAC before
 *   decrypting, or the error itself becomes a padding oracle.
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
import * as KeyModel from "./internal/key.ts"
import * as internal from "./internal/webCrypto.ts"
import * as SecureRandom from "./SecureRandom.ts"
import * as WebCrypto from "./WebCrypto.ts"

const TypeId = "~effect/crypto/Cipher/Key" as const

/**
 * An unauthenticated cipher algorithm, such as {@link aes256Cbc}.
 *
 * **Details**
 *
 * `mode` is the WebCrypto algorithm name and `keyLength` is in bytes.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Algorithm {
  readonly name: "aes128Ctr" | "aes256Ctr" | "aes128Cbc" | "aes256Cbc"
  readonly mode: "AES-CTR" | "AES-CBC"
  readonly keyLength: 16 | 32
}

/**
 * AES-128-CTR, with a 16-byte key.
 *
 * **Details**
 *
 * The 16-byte `iv` is the initial counter block, and the whole 128-bit block
 * is the counter, as in OpenSSL, Node.js, Go's `cipher.NewCTR`, and noble.
 *
 * @stability unstable
 * @category algorithms
 * @since 4.0.0
 */
export const aes128Ctr: Algorithm = { name: "aes128Ctr", mode: "AES-CTR", keyLength: 16 }

/**
 * AES-256-CTR, with a 32-byte key.
 *
 * **Details**
 *
 * The 16-byte `iv` is the initial counter block, and the whole 128-bit block
 * is the counter, as in OpenSSL, Node.js, Go's `cipher.NewCTR`, and noble.
 *
 * @stability unstable
 * @category algorithms
 * @since 4.0.0
 */
export const aes256Ctr: Algorithm = { name: "aes256Ctr", mode: "AES-CTR", keyLength: 32 }

/**
 * AES-128-CBC with PKCS#7 padding, with a 16-byte key.
 *
 * @stability unstable
 * @category algorithms
 * @since 4.0.0
 */
export const aes128Cbc: Algorithm = { name: "aes128Cbc", mode: "AES-CBC", keyLength: 16 }

/**
 * AES-256-CBC with PKCS#7 padding, with a 32-byte key.
 *
 * @stability unstable
 * @category algorithms
 * @since 4.0.0
 */
export const aes256Cbc: Algorithm = { name: "aes256Cbc", mode: "AES-CBC", keyLength: 32 }

/**
 * An opaque unauthenticated cipher key for the algorithm `A`.
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

const KeyProto = KeyModel.redactedProto(TypeId, "Cipher.Key")

/**
 * Checks whether a value is a {@link Key}.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isKey = (u: unknown): u is Key => Predicate.hasProperty(u, TypeId)

/**
 * Service that generates keys, encrypts, and decrypts without
 * authentication.
 *
 * **Example** (Encrypting with AES-CBC)
 *
 * ```ts import.meta.vitest
 * import { Effect, Layer } from "effect"
 * import { Cipher, SecureRandom } from "effect/crypto"
 *
 * const program = Effect.gen(function*() {
 *   const cipher = yield* Cipher.Cipher
 *   const random = yield* SecureRandom.SecureRandom
 *   const key = yield* cipher.generateKey(Cipher.aes256Cbc)
 *   const iv = yield* random.randomBytes(16)
 *   const ciphertext = yield* cipher.encrypt(key, new TextEncoder().encode("secret"), { iv })
 *   const plaintext = yield* cipher.decrypt(key, ciphertext, { iv })
 *   return [ciphertext.length, new TextDecoder().decode(plaintext)]
 * })
 *
 * const layer = Cipher.layerWebCrypto.pipe(Layer.provideMerge(SecureRandom.layerWebCrypto))
 * await Effect.runPromise(program.pipe(Effect.provide(layer))) // => [16, "secret"]
 * ```
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class Cipher extends Context.Service<Cipher, {
  /**
   * Generates a random key of the algorithm's length from `SecureRandom`
   * bytes.
   */
  readonly generateKey: <A extends Algorithm>(algorithm: A) => Effect.Effect<Key<A>, CryptoError.CryptoError>
  /**
   * Encrypts `plaintext`. AES-CTR output has the plaintext's length, and
   * AES-CBC output is padded to the next multiple of 16 bytes.
   *
   * `iv` is 16 bytes: the initial counter block for AES-CTR, and the
   * initialization vector for AES-CBC.
   */
  readonly encrypt: (
    key: Key,
    plaintext: Uint8Array,
    options: { readonly iv: Uint8Array }
  ) => Effect.Effect<Uint8Array, CryptoError.CryptoError>
  /**
   * Decrypts `ciphertext`. AES-CBC fails with a `DecryptionFailed` reason for
   * bad padding or a bad length; AES-CTR never fails on the ciphertext.
   */
  readonly decrypt: (
    key: Key,
    ciphertext: Uint8Array,
    options: { readonly iv: Uint8Array }
  ) => Effect.Effect<Uint8Array, CryptoError.CryptoError>
}>()("effect/crypto/Cipher") {}

const fail = (method: string, reason: CryptoError.CryptoErrorReason) => internal.fail("Cipher", method, reason)

const blockLength = 16

const params = (algorithm: Algorithm, iv: Uint8Array): AesCtrParams | AesCbcParams =>
  algorithm.mode === "AES-CTR"
    ? { name: "AES-CTR", counter: iv as BufferSource, length: 128 }
    : { name: "AES-CBC", iv: iv as BufferSource }

/**
 * Layer that provides `Cipher` on the `WebCrypto` reference.
 *
 * **Details**
 *
 * Encryption and decryption run on `crypto.subtle`. The layer imports a
 * byte-backed key on first use and caches the `CryptoKey`. AES-CTR uses the
 * whole 128-bit block as the counter (`length: 128`), which every runtime
 * supports. Generated keys come from `SecureRandom`, so a seeded
 * `SecureRandom` gives reproducible keys.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerWebCrypto: Layer.Layer<Cipher, never, SecureRandom.SecureRandom> = Layer.effect(
  Cipher,
  Effect.gen(function*() {
    const random = yield* SecureRandom.SecureRandom
    const crypto = yield* WebCrypto.WebCrypto
    const cryptoKeyFor = KeyModel.makeCache((subtle, bytes, algorithm: Algorithm) =>
      subtle.importKey("raw", bytes as BufferSource, algorithm.mode, false, ["encrypt", "decrypt"])
    )
    const run = (method: "encrypt" | "decrypt") => (key: Key, data: Uint8Array, options: { readonly iv: Uint8Array }) =>
      Effect.suspend(() => {
        if (options.iv.length !== blockLength) {
          return fail(method, new CryptoError.InvalidArgument({ description: "IVs must contain exactly 16 bytes" }))
        }
        // Checked here so a bad length is not reported differently from bad padding.
        const cbc = key.algorithm.mode === "AES-CBC"
        if (method === "decrypt" && cbc && (data.length === 0 || data.length % blockLength !== 0)) {
          return fail(method, new CryptoError.DecryptionFailed())
        }
        return internal.run(
          "Cipher",
          method,
          key.algorithm.name,
          crypto,
          async (subtle) =>
            new Uint8Array(
              await subtle[method](
                params(key.algorithm, options.iv),
                await cryptoKeyFor(subtle, key),
                data as BufferSource
              )
            ),
          (cause) =>
            internal.webCryptoError(
              "Cipher",
              method,
              key.algorithm.name,
              cause,
              method === "decrypt" && cbc ? () => new CryptoError.DecryptionFailed() : undefined
            )
        )
      })
    return Cipher.of({
      generateKey: (algorithm) =>
        Effect.map(random.randomBytes(algorithm.keyLength), (bytes) => KeyModel.makeBytes(KeyProto, algorithm, bytes)),
      encrypt: run("encrypt"),
      decrypt: run("decrypt")
    })
  })
)

/**
 * Builds a key from raw key bytes.
 *
 * **Details**
 *
 * Copies the bytes, including Node.js `Buffer` inputs. A length other than
 * the algorithm's key length fails with an `InvalidKey` reason. AES-192 is
 * not supported.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const key = <A extends Algorithm>(
  algorithm: A,
  bytes: Uint8Array
): Effect.Effect<Key<A>, CryptoError.CryptoError> =>
  KeyModel.fromBytes("Cipher", "key", KeyProto, algorithm, bytes, KeyModel.checkKeyLength(algorithm))

/**
 * Builds a key from an existing `CryptoKey`, such as a non-extractable one.
 *
 * **Details**
 *
 * The `CryptoKey` must be a secret key for the algorithm's mode (`AES-CTR` or
 * `AES-CBC`) and length, with both the `encrypt` and `decrypt` usages, since
 * a key reaches both operations. Otherwise the constructor fails with an
 * `InvalidKey` reason. It must come from the `Crypto` object of the
 * `WebCrypto` reference.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const fromCryptoKey = <A extends Algorithm>(
  algorithm: A,
  cryptoKey: WebCrypto.CryptoKey
): Effect.Effect<Key<A>, CryptoError.CryptoError> =>
  KeyModel.fromCryptoKey("Cipher", "fromCryptoKey", KeyProto, algorithm, cryptoKey, {
    type: "secret",
    name: algorithm.mode,
    usages: ["encrypt", "decrypt"],
    usagePolicy: "all",
    check: KeyModel.checkAesLength(algorithm.mode, algorithm.keyLength)
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
  KeyModel.toBytes("Cipher", key, KeyModel.exportRaw)
