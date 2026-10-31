import * as Aead from "../../crypto/Aead.ts"
import * as Digest from "../../crypto/Digest.ts"
import * as KeyFormat from "../../crypto/KeyFormat.ts"
import * as SecureRandom from "../../crypto/SecureRandom.ts"
import * as Signature from "../../crypto/Signature.ts"
import * as WebCrypto from "../../crypto/WebCrypto.ts"
import * as Effect from "../../Effect.ts"
import * as Layer from "../../Layer.ts"
import * as Redacted from "../../Redacted.ts"
import type { Identity } from "../EventLog.ts"

const textEncoder = new TextEncoder()

/**
 * @internal
 */
export const EncryptionDerivationLabelV1 = "effect/eventlog/identity/v1/encryption"

/**
 * @internal
 */
export const SigningDerivationLabelV1 = "effect/eventlog/identity/v1/signing"

/**
 * @internal
 */
export interface IdentityRootSecretMaterial {
  readonly encryptionKeyMaterial: Uint8Array<ArrayBuffer>
  readonly encryptionKey: Aead.Key<Aead.AesGcm>
  readonly signingPublicKey: Uint8Array<ArrayBuffer>
  /**
   * The PKCS#8 encoding of the Ed25519 signing key.
   */
  readonly signingPrivateKey: Redacted.Redacted<Uint8Array<ArrayBuffer>>
}

// The crypto services return fresh arrays over an `ArrayBuffer`.
const toArrayBufferBytes = (bytes: Uint8Array) => bytes as Uint8Array<ArrayBuffer>

// Each secret is SHA-256(label || 0x00 || root secret).
const deriveSecretBytes = (rootSecret: Uint8Array, label: string): Effect.Effect<Uint8Array, never, Digest.Digest> =>
  Digest.Digest.use((digest) => {
    const labelBytes = textEncoder.encode(label)
    const derivationInput = new Uint8Array(labelBytes.byteLength + 1 + rootSecret.byteLength)
    derivationInput.set(labelBytes, 0)
    derivationInput.set(rootSecret, labelBytes.byteLength + 1)
    return digest.digest(Digest.sha256, derivationInput)
  })

/**
 * Derives the AES-256-GCM key that encrypts an identity's entries.
 *
 * @internal
 */
export const deriveEncryptionKey = Effect.fnUntraced(function*(rootSecret: Uint8Array) {
  const encryptionKeyMaterial = yield* deriveSecretBytes(rootSecret, EncryptionDerivationLabelV1)
  const encryptionKey = yield* Effect.orDie(Aead.key(Aead.aes256Gcm, encryptionKeyMaterial))
  return { encryptionKeyMaterial: toArrayBufferBytes(encryptionKeyMaterial), encryptionKey }
})

/**
 * Derives the Ed25519 key an identity signs session authentication payloads
 * with.
 *
 * @internal
 */
const deriveSigningKey = Effect.fnUntraced(function*(rootSecret: Uint8Array) {
  const signature = yield* Signature.Signature
  const seed = yield* deriveSecretBytes(rootSecret, SigningDerivationLabelV1)
  const privateKey = yield* Signature.privateKey(Signature.ed25519, seed)
  const signingPublicKey = yield* Effect.flatMap(signature.publicKeyOf(privateKey), Signature.toBytes)
  const signingPrivateKey = yield* KeyFormat.encode(KeyFormat.pkcs8, privateKey)
  return {
    signingPublicKey: toArrayBufferBytes(signingPublicKey),
    signingPrivateKey: Redacted.make(toArrayBufferBytes(signingPrivateKey))
  }
}, Effect.orDie)

/**
 * @internal
 */
export const deriveIdentityRootSecretMaterial = (
  rootSecret: Uint8Array
): Effect.Effect<IdentityRootSecretMaterial, never, Digest.Digest | Signature.Signature> =>
  Effect.zipWith(deriveEncryptionKey(rootSecret), deriveSigningKey(rootSecret), (encryption, signing) => ({
    ...encryption,
    ...signing
  }))

/**
 * Memoizes a derivation from an identity's root secret per identity instance.
 *
 * @internal
 */
export const cachedByIdentity = <A, R>(
  derive: (rootSecret: Uint8Array) => Effect.Effect<A, never, R>
) => {
  const cache = new WeakMap<Identity["Service"], A>()
  return (identity: Identity["Service"]): Effect.Effect<A, never, R> =>
    Effect.suspend(() => {
      const cached = cache.get(identity)
      if (cached !== undefined) {
        return Effect.succeed(cached)
      }
      return Effect.tap(derive(Redacted.value(identity.privateKey)), (derived) =>
        Effect.sync(() => {
          cache.set(identity, derived)
        }))
    })
}

const layerWebCrypto = Layer.mergeAll(Digest.layerWebCrypto, Signature.layerWebCrypto).pipe(
  Layer.provide(SecureRandom.layerWebCrypto)
)

/**
 * Derives identity material on the Web Crypto layers, using `crypto` when it
 * is given and the `WebCrypto` reference otherwise.
 *
 * @internal
 */
export const makeGetIdentityRootSecretMaterial = (crypto?: Crypto) =>
  cachedByIdentity((rootSecret) =>
    crypto === undefined
      ? Effect.provide(deriveIdentityRootSecretMaterial(rootSecret), layerWebCrypto)
      // `local` keeps enclosing Web Crypto layers, built on another `Crypto`,
      // from being reused.
      : Effect.provide(
        deriveIdentityRootSecretMaterial(rootSecret),
        Layer.provideMerge(layerWebCrypto, WebCrypto.layer(crypto)),
        { local: true }
      )
  )
