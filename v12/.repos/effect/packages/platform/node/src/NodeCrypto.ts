/**
 * Node.js layers for the `effect/crypto` modules.
 *
 * `layerDigest` and `layerMac` run on `node:crypto`, `layerKdf` adds Argon2id,
 * `layerAead` runs ChaCha20-Poly1305 on `node:crypto`, and the other layers
 * run the core WebCrypto layers, so that every crypto layer for a Node.js
 * program comes from `NodeCrypto`. Each layer supplies its own `SecureRandom`.
 * `layer` provides every family at once. `NodeServices` carries no crypto
 * service.
 *
 * @stability unstable
 * @since 1.0.0
 */

/**
 * @stability unstable
 * @since 1.0.0
 */
export * from "@effect/platform-node-shared/NodeCrypto"
