/**
 * The `NodeCrypto` module provides the Node.js `Crypto` service layer for
 * Effect programs. Provide {@link layer} at the edge of a Node application,
 * CLI, script, or test to satisfy `effect/Crypto` with Node's `node:crypto`
 * implementation for secure random bytes, UUID generation, random values, and
 * SHA digest operations.
 *
 * This module is the public Node adapter around the shared Node-compatible
 * implementation. Digest failures are reported as platform errors, and SHA-1
 * remains available only for interoperability with existing protocols.
 *
 * @since 1.0.0
 */
import * as NodeCrypto from "@effect/platform-node-shared/NodeCrypto"
import type * as Crypto from "effect/Crypto"
import type * as Layer from "effect/Layer"

/**
 * Layer that provides the Node.js Crypto service implementation.
 *
 * @category layers
 * @since 1.0.0
 */
export const layer: Layer.Layer<Crypto.Crypto> = NodeCrypto.layer
