/**
 * Bun layers for the `effect/crypto` modules.
 *
 * This module re-exports `NodeCrypto` from the shared Node.js package, so Bun
 * programs take every crypto layer from one place: `layerDigest` and
 * `layerMac` run on `node:crypto`, `layerKdf` adds Argon2id, and
 * `layerSecureRandom`, `layerCipher`, `layerSignature`, `layerKeyAgreement`,
 * and `layerKeyWrap` run the core WebCrypto layers. Each layer supplies its own
 * `SecureRandom`, and `layer` provides every family at once.
 *
 * **Gotchas**
 *
 * - Bun's `node:crypto` lacks ChaCha20-Poly1305, so `layerAead` runs it on the
 *   pure TypeScript implementation, as `Aead.layerWebCrypto` does.
 * - `layerKdf` provides Argon2id from Bun 1.4. On older versions, deriving
 *   with Argon2id fails with an `Unsupported` reason.
 *
 * @stability unstable
 * @since 1.0.0
 */

/**
 * @stability unstable
 * @since 1.0.0
 */
export * from "@effect/platform-node-shared/NodeCrypto"
