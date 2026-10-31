/**
 * Node.js layers for the `effect/crypto` modules, also used by Bun.
 *
 * {@link layerDigest} runs MD5 and SHA on `node:crypto`, {@link layerMac} runs
 * HMAC on `node:crypto`, {@link layerKdf} adds Argon2id, {@link layerAead}
 * runs ChaCha20-Poly1305 on `node:crypto`, and {@link layerSecureRandom},
 * {@link layerCipher}, {@link layerSignature}, {@link layerKeyAgreement}, and
 * {@link layerKeyWrap} run the core WebCrypto layers. Each Node.js layer
 * handles only the algorithms and keys it exists for and hands the rest to
 * the core WebCrypto implementation. Layers that need `SecureRandom` get it
 * from {@link layerSecureRandom}, so no layer here has requirements.
 * {@link layer} provides every family at once; provide a family's own layer to
 * pick services selectively.
 *
 * `CryptoKey`-backed keys go through Node.js's `crypto.subtle`, because
 * `KeyObject.from(cryptoKey)` is deprecated (DEP0204). A `CryptoKey` must
 * come from the `WebCrypto` reference: Node.js rejects one from another
 * reference with a `TypeError`, which is a defect.
 *
 * @stability unstable
 * @since 1.0.0
 */
import * as Aead from "effect/crypto/Aead"
import * as Cipher from "effect/crypto/Cipher"
import * as CryptoError from "effect/crypto/CryptoError"
import * as Digest from "effect/crypto/Digest"
import * as Kdf from "effect/crypto/Kdf"
import * as KeyAgreement from "effect/crypto/KeyAgreement"
import * as KeyWrap from "effect/crypto/KeyWrap"
import * as Mac from "effect/crypto/Mac"
import * as SecureRandom from "effect/crypto/SecureRandom"
import * as Signature from "effect/crypto/Signature"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as NodeCrypto from "node:crypto"

/**
 * Layer that provides `SecureRandom` from `getRandomValues` on the `WebCrypto`
 * reference.
 *
 * **Details**
 *
 * This is `SecureRandom.layerWebCrypto`, re-exported so that Node.js programs
 * take every crypto layer from `NodeCrypto`. `node:crypto` adds nothing here.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerSecureRandom: Layer.Layer<SecureRandom.SecureRandom> = SecureRandom.layerWebCrypto

const nodeHashNames: Record<Digest.Algorithm["name"], string> = {
  "MD5": "md5",
  "SHA-1": "sha1",
  "SHA-256": "sha256",
  "SHA-384": "sha384",
  "SHA-512": "sha512"
}

// Copies the Buffer, which may be a view into Node's shared pool.
const nodeDigest = (algorithm: Digest.Algorithm, data: Uint8Array): Uint8Array =>
  new Uint8Array(NodeCrypto.createHash(nodeHashNames[algorithm.name]).update(data).digest())

/**
 * Layer that provides `Digest` using `createHash` from `node:crypto`.
 *
 * **Details**
 *
 * MD5 and the SHA algorithms run synchronously on `node:crypto`. On Node.js,
 * `crypto.subtle.digest` sends each call to the threadpool, which is
 * noticeably slower for small inputs. Output is identical to
 * `Digest.layerWebCrypto`.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerDigest: Layer.Layer<Digest.Digest> = Layer.succeed(Digest.Digest, {
  digest: (algorithm, data) => Effect.sync(() => nodeDigest(algorithm, data)),
  digestHex: (algorithm, data) =>
    Effect.sync(() => NodeCrypto.createHash(nodeHashNames[algorithm.name]).update(data).digest("hex"))
})

// Copies the Buffer, which may be a view into Node's shared pool.
const nodeHmac = (hash: Digest.Algorithm["name"], key: Uint8Array, data: Uint8Array): Uint8Array =>
  new Uint8Array(NodeCrypto.createHmac(nodeHashNames[hash], key).update(data).digest())

/**
 * Layer that provides `Mac` using `createHmac` from `node:crypto`.
 *
 * **Details**
 *
 * Byte-backed keys sign and verify synchronously on `node:crypto`, since
 * webhook verification is a server hot path. `CryptoKey`-backed keys go
 * through Node.js's `crypto.subtle`, and generated keys come from
 * {@link layerSecureRandom}. This is `Mac.layerWebCryptoWith` with a
 * `node:crypto` primitive, so output and errors are identical to
 * `Mac.layerWebCrypto`.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerMac: Layer.Layer<Mac.Mac> = Mac.layerWebCryptoWith({
  hmac: nodeHmac
}).pipe(Layer.provide(layerSecureRandom))

const kdfFailure = (reason: CryptoError.CryptoErrorReason): Effect.Effect<never, CryptoError.CryptoError> =>
  Effect.fail(new CryptoError.CryptoError({ module: "Kdf", method: "derive", reason }))

const argon2Unsupported = (cause?: unknown) =>
  kdfFailure(
    new CryptoError.Unsupported({
      description: "NodeCrypto.layerKdf does not provide argon2id on this runtime",
      ...(cause === undefined ? {} : { cause })
    })
  )

// Only a missing Argon2id engine is a typed failure; anything else is a defect.
const argon2Failure = (cause: unknown): Effect.Effect<never, CryptoError.CryptoError> =>
  typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ERR_CRYPTO_ARGON2_NOT_SUPPORTED"
    ? argon2Unsupported(cause)
    : Effect.die(cause)

const isIntegerIn = (n: number, min: number, max: number): boolean => Number.isSafeInteger(n) && n >= min && n <= max

type DeriveOptions = Parameters<Kdf.Kdf["Service"]["derive"]>[2]

// The RFC 9106 bounds, checked before `node:crypto`, which throws on them.
const argon2Problem = (algorithm: Kdf.Argon2id, options: DeriveOptions): string | undefined => {
  if (options.info !== undefined) return "info only applies to HKDF"
  const uint32 = (n: number) => isIntegerIn(n, 1, 0xffff_ffff)
  if (!uint32(algorithm.passes) || !isIntegerIn(algorithm.parallelism, 1, 0xff_ffff)) {
    return "passes must be between 1 and 2^32 - 1 and parallelism between 1 and 2^24 - 1"
  }
  if (!uint32(algorithm.memory) || algorithm.memory < 8 * algorithm.parallelism) {
    return "memory must be at least 8 KiB per lane and below 2^32 KiB"
  }
  if (options.salt.length < 8) return "salt must be at least 8 bytes"
  return isIntegerIn(options.length, 4, 0xffff_ffff) ? undefined : "length must be between 4 and 2^32 - 1 bytes"
}

const argon2id = (algorithm: Kdf.Argon2id, secret: Uint8Array, options: DeriveOptions) =>
  Effect.callback<Uint8Array, CryptoError.CryptoError>((resume) => {
    const problem = argon2Problem(algorithm, options)
    if (problem !== undefined) return resume(kdfFailure(new CryptoError.InvalidArgument({ description: problem })))
    // Checked at call time, since Node.js added `argon2` in 24.7.
    if (typeof NodeCrypto.argon2 !== "function") return resume(argon2Unsupported())
    try {
      NodeCrypto.argon2("argon2id", {
        message: secret,
        nonce: options.salt,
        memory: algorithm.memory,
        passes: algorithm.passes,
        parallelism: algorithm.parallelism,
        tagLength: options.length
      }, (cause, key) => {
        if (cause) resume(argon2Failure(cause))
        else resume(Effect.succeed(new Uint8Array(key.buffer, key.byteOffset, key.length)))
      })
    } catch (cause) {
      resume(argon2Failure(cause))
    }
  }).pipe(Effect.uninterruptible)

/**
 * Layer that provides `Kdf`, adding Argon2id from `node:crypto`.
 *
 * **Details**
 *
 * Argon2id runs on `argon2` from `node:crypto`, which needs Node.js 24.7 or
 * later linked against OpenSSL 3.2, or Bun 1.4. Support is checked at call
 * time: on other runtimes, deriving with Argon2id fails with an `Unsupported`
 * reason. HKDF and PBKDF2 go through `Kdf.layerWebCrypto`, which keeps them
 * off the event loop.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerKdf: Layer.Layer<Kdf.Kdf> = Layer.effect(
  Kdf.Kdf,
  Effect.gen(function*() {
    const core = yield* Kdf.Kdf
    return Kdf.Kdf.of({
      derive: (algorithm, secret, options) =>
        algorithm._tag === "Argon2id" ? argon2id(algorithm, secret, options) : core.derive(algorithm, secret, options)
    })
  })
).pipe(Layer.provide(Kdf.layerWebCrypto))

// Copies into a fresh array, wiping the parts, so no plaintext stays in
// Node.js's shared Buffer pool.
const concat = (parts: ReadonlyArray<Uint8Array>): Uint8Array => {
  const output = new Uint8Array(parts.reduce((length, part) => length + part.length, 0))
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.length
    part.fill(0)
  }
  return output
}

const nodeChacha: Aead.Implementation = {
  encrypt: (key, nonce, plaintext, aad) => {
    const cipher = NodeCrypto.createCipheriv("chacha20-poly1305", key, nonce, { authTagLength: 16 })
    cipher.setAAD(aad)
    return concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()])
  },
  decrypt: (key, nonce, ciphertext, aad) => {
    const decipher = NodeCrypto.createDecipheriv("chacha20-poly1305", key, nonce, { authTagLength: 16 })
    decipher.setAAD(aad)
    decipher.setAuthTag(ciphertext.subarray(ciphertext.length - 16))
    const plaintext = decipher.update(ciphertext.subarray(0, ciphertext.length - 16))
    try {
      // `final` throws only when the tag does not match.
      return concat([plaintext, decipher.final()])
    } catch {
      plaintext.fill(0)
      return undefined
    }
  }
}

/**
 * Layer that provides `Aead`, running ChaCha20-Poly1305 on `node:crypto`.
 *
 * **Details**
 *
 * Byte-backed ChaCha20-Poly1305 keys encrypt and decrypt synchronously on
 * `node:crypto`. AES-GCM runs on `crypto.subtle` and XChaCha20-Poly1305 on its
 * pure TypeScript implementation. This is `Aead.layerWebCryptoWith` with a
 * `node:crypto` implementation, so arguments are checked and errors reported
 * as in `Aead.layerWebCrypto`. Bun's `node:crypto` lacks ChaCha20-Poly1305, so
 * on Bun this layer runs the core implementation. Output is identical to
 * `Aead.layerWebCrypto`. Generated keys come from {@link layerSecureRandom}.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerAead: Layer.Layer<Aead.Aead> = Aead.layerWebCryptoWith(
  NodeCrypto.getCiphers().includes("chacha20-poly1305") ? { implementations: { chacha20Poly1305: nodeChacha } } : {}
).pipe(Layer.provide(layerSecureRandom))

/**
 * Layer that provides `Cipher` from `crypto.subtle` on the `WebCrypto`
 * reference.
 *
 * **Details**
 *
 * This is `Cipher.layerWebCrypto` with {@link layerSecureRandom}, so that
 * Node.js programs take every crypto layer from `NodeCrypto`. Node.js's
 * `crypto.subtle` already runs AES-CTR and AES-CBC on OpenSSL.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerCipher: Layer.Layer<Cipher.Cipher> = Cipher.layerWebCrypto.pipe(
  Layer.provide(layerSecureRandom)
)

/**
 * Layer that provides `Signature` on Node.js's `crypto.subtle`.
 *
 * **Details**
 *
 * This is `Signature.layerWebCrypto` with {@link layerSecureRandom}, so that
 * Node.js programs take every crypto layer from `NodeCrypto`.
 * `CryptoKey`-backed keys go through Node.js's `crypto.subtle`, because
 * `KeyObject.from(cryptoKey)` is deprecated (DEP0204).
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerSignature: Layer.Layer<Signature.Signature> = Signature.layerWebCrypto.pipe(
  Layer.provide(layerSecureRandom)
)

/**
 * Layer that provides `KeyAgreement` on Node.js's `crypto.subtle`.
 *
 * **Details**
 *
 * This is `KeyAgreement.layerWebCrypto` with {@link layerSecureRandom}, so
 * that Node.js programs take every crypto layer from `NodeCrypto`.
 * `CryptoKey`-backed keys go through Node.js's `crypto.subtle`, because
 * `KeyObject.from(cryptoKey)` is deprecated (DEP0204).
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerKeyAgreement: Layer.Layer<KeyAgreement.KeyAgreement> = KeyAgreement.layerWebCrypto.pipe(
  Layer.provide(layerSecureRandom)
)

/**
 * Layer that provides `KeyWrap` on Node.js's `crypto.subtle`.
 *
 * **Details**
 *
 * This is `KeyWrap.layerWebCrypto` with {@link layerSecureRandom}, so that
 * Node.js programs take every crypto layer from `NodeCrypto`. Node.js's
 * `crypto.subtle` runs AES-KW and RSA-OAEP on OpenSSL. `CryptoKey`-backed
 * keys go through it, because `KeyObject.from(cryptoKey)` is deprecated
 * (DEP0204).
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerKeyWrap: Layer.Layer<KeyWrap.KeyWrap> = KeyWrap.layerWebCrypto.pipe(
  Layer.provide(layerSecureRandom)
)

/**
 * Layer that provides every `effect/crypto` service with the Node.js
 * implementations.
 *
 * **Details**
 *
 * This merges the family layers of this module, so it requires nothing. It
 * keeps the `node:crypto` implementations of {@link layerDigest},
 * {@link layerMac}, {@link layerKdf}, and {@link layerAead}.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer.Layer<
  | SecureRandom.SecureRandom
  | Digest.Digest
  | Mac.Mac
  | Kdf.Kdf
  | Aead.Aead
  | Cipher.Cipher
  | Signature.Signature
  | KeyAgreement.KeyAgreement
  | KeyWrap.KeyWrap
> = Layer.mergeAll(
  layerSecureRandom,
  layerDigest,
  layerMac,
  layerKdf,
  layerAead,
  layerCipher,
  layerSignature,
  layerKeyAgreement,
  layerKeyWrap
)
