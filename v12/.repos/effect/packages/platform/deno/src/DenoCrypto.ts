/**
 * Deno layers for the `effect/crypto` modules.
 *
 * Every layer here runs the core WebCrypto layer of its family, so that Deno
 * programs take every crypto layer from `DenoCrypto`. They use the
 * `WebCrypto` reference, which defaults to Deno's `globalThis.crypto`. Layers
 * that need `SecureRandom` get it from {@link layerSecureRandom}, so no layer
 * here has requirements. {@link layer} provides every family at once; provide
 * a family's own layer to pick services selectively.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Aead from "effect/crypto/Aead"
import * as Cipher from "effect/crypto/Cipher"
import * as Digest from "effect/crypto/Digest"
import * as Kdf from "effect/crypto/Kdf"
import * as KeyAgreement from "effect/crypto/KeyAgreement"
import * as KeyWrap from "effect/crypto/KeyWrap"
import * as Mac from "effect/crypto/Mac"
import * as SecureRandom from "effect/crypto/SecureRandom"
import * as Signature from "effect/crypto/Signature"
import * as Layer from "effect/Layer"

/**
 * Layer that provides `SecureRandom` on the `WebCrypto` reference.
 *
 * **Details**
 *
 * This is `SecureRandom.layerWebCrypto`, re-exported for Deno programs.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerSecureRandom: Layer.Layer<SecureRandom.SecureRandom> = SecureRandom.layerWebCrypto

/**
 * Layer that provides `Digest` on the `WebCrypto` reference.
 *
 * **Details**
 *
 * This is `Digest.layerWebCrypto`, re-exported for Deno programs.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerDigest: Layer.Layer<Digest.Digest> = Digest.layerWebCrypto

/**
 * Layer that provides `Mac` on the `WebCrypto` reference.
 *
 * **Details**
 *
 * This is `Mac.layerWebCrypto` with {@link layerSecureRandom}.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerMac: Layer.Layer<Mac.Mac> = Mac.layerWebCrypto.pipe(Layer.provide(layerSecureRandom))

/**
 * Layer that provides `Kdf` on the `WebCrypto` reference.
 *
 * **Details**
 *
 * This is `Kdf.layerWebCrypto`, re-exported for Deno programs.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerKdf: Layer.Layer<Kdf.Kdf> = Kdf.layerWebCrypto

/**
 * Layer that provides `Aead` on the `WebCrypto` reference.
 *
 * **Details**
 *
 * This is `Aead.layerWebCrypto` with {@link layerSecureRandom}.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerAead: Layer.Layer<Aead.Aead> = Aead.layerWebCrypto.pipe(Layer.provide(layerSecureRandom))

/**
 * Layer that provides `Cipher` on the `WebCrypto` reference.
 *
 * **Details**
 *
 * This is `Cipher.layerWebCrypto` with {@link layerSecureRandom}.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerCipher: Layer.Layer<Cipher.Cipher> = Cipher.layerWebCrypto.pipe(Layer.provide(layerSecureRandom))

/**
 * Layer that provides `Signature` on the `WebCrypto` reference.
 *
 * **Details**
 *
 * This is `Signature.layerWebCrypto` with {@link layerSecureRandom}.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerSignature: Layer.Layer<Signature.Signature> = Signature.layerWebCrypto.pipe(
  Layer.provide(layerSecureRandom)
)

/**
 * Layer that provides `KeyAgreement` on the `WebCrypto` reference.
 *
 * **Details**
 *
 * This is `KeyAgreement.layerWebCrypto` with {@link layerSecureRandom}.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerKeyAgreement: Layer.Layer<KeyAgreement.KeyAgreement> = KeyAgreement.layerWebCrypto.pipe(
  Layer.provide(layerSecureRandom)
)

/**
 * Layer that provides `KeyWrap` on the `WebCrypto` reference.
 *
 * **Details**
 *
 * This is `KeyWrap.layerWebCrypto` with {@link layerSecureRandom}.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerKeyWrap: Layer.Layer<KeyWrap.KeyWrap> = KeyWrap.layerWebCrypto.pipe(Layer.provide(layerSecureRandom))

/**
 * Layer that provides every `effect/crypto` service on the `WebCrypto`
 * reference.
 *
 * **Details**
 *
 * This merges the family layers of this module, so it requires nothing.
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
