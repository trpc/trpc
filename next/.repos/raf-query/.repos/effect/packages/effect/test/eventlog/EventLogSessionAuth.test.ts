import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import * as EventLogSessionAuth from "effect/eventlog/EventLogSessionAuth"

const makeSigningKeyPair = Effect.promise(async () => {
  const keyPair = await globalThis.crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"])

  if (!("privateKey" in keyPair) || !("publicKey" in keyPair)) {
    throw new Error("Expected Ed25519 CryptoKeyPair")
  }

  return {
    signingPublicKey: new Uint8Array(await globalThis.crypto.subtle.exportKey("raw", keyPair.publicKey)),
    signingPrivateKey: new Uint8Array(await globalThis.crypto.subtle.exportKey("pkcs8", keyPair.privateKey))
  }
})

const makePayload = (signingPublicKey: Uint8Array): EventLogSessionAuth.SessionAuthPayload => ({
  remoteId: "remote-123",
  challenge: Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]),
  publicKey: "client-public-key",
  signingPublicKey
})

describe("EventLogSessionAuth", () => {
  it.effect("encodes and decodes canonical auth payload deterministically", () =>
    Effect.gen(function*() {
      const signingPublicKey = new Uint8Array(EventLogSessionAuth.Ed25519PublicKeyLength)
      for (let i = 0; i < signingPublicKey.byteLength; i++) {
        signingPublicKey[i] = i
      }

      const payload = makePayload(signingPublicKey)
      const encodedA = yield* EventLogSessionAuth.encodeSessionAuthPayload(payload)
      const encodedB = yield* EventLogSessionAuth.encodeSessionAuthPayload(payload)

      assert.deepStrictEqual(encodedA, encodedB)

      const decoded = yield* EventLogSessionAuth.decodeSessionAuthPayload(encodedA)
      assert.strictEqual(decoded.remoteId, payload.remoteId)
      assert.strictEqual(decoded.publicKey, payload.publicKey)
      assert.deepStrictEqual(decoded.challenge, payload.challenge)
      assert.deepStrictEqual(decoded.signingPublicKey, payload.signingPublicKey)
    }))

  it.effect("signs and verifies canonical auth payload with Ed25519", () =>
    Effect.gen(function*() {
      const keyPair = yield* makeSigningKeyPair
      const payload = makePayload(keyPair.signingPublicKey)

      const signature = yield* EventLogSessionAuth.signSessionAuthPayload({
        ...payload,
        signingPrivateKey: keyPair.signingPrivateKey
      })

      assert.strictEqual(signature.byteLength, EventLogSessionAuth.Ed25519SignatureLength)

      const verified = yield* EventLogSessionAuth.verifySessionAuthPayload({
        ...payload,
        signature
      })

      assert.strictEqual(verified, true)
    }))

  it.effect("returns false for mismatched payload/signature", () =>
    Effect.gen(function*() {
      const keyPair = yield* makeSigningKeyPair
      const payload = makePayload(keyPair.signingPublicKey)

      const signature = yield* EventLogSessionAuth.signSessionAuthPayload({
        ...payload,
        signingPrivateKey: keyPair.signingPrivateKey
      })

      const challenge = payload.challenge.slice()
      challenge[0] = challenge[0] ^ 0xff

      const verified = yield* EventLogSessionAuth.verifySessionAuthPayload({
        ...payload,
        challenge,
        signature
      })

      assert.strictEqual(verified, false)
    }))

  it.effect("rejects malformed signature length", () =>
    Effect.gen(function*() {
      const keyPair = yield* makeSigningKeyPair
      const payload = makePayload(keyPair.signingPublicKey)

      const error = yield* EventLogSessionAuth.verifySessionAuthPayload({
        ...payload,
        signature: new Uint8Array(EventLogSessionAuth.Ed25519SignatureLength - 1)
      }).pipe(Effect.flip)

      assert.strictEqual(error._tag, "EventLogSessionAuthError")
      assert.strictEqual(error.reason, "InvalidSignatureLength")
    }))

  it.effect("rejects malformed signing public key length", () =>
    Effect.gen(function*() {
      const error = yield* EventLogSessionAuth.encodeSessionAuthPayload({
        remoteId: "remote-123",
        challenge: new Uint8Array(32),
        publicKey: "client-public-key",
        signingPublicKey: new Uint8Array(EventLogSessionAuth.Ed25519PublicKeyLength - 1)
      }).pipe(Effect.flip)
      assert.strictEqual(error._tag, "EventLogSessionAuthError")
      assert.strictEqual(error.reason, "InvalidSigningPublicKeyLength")
    }))

  it.effect("rejects invalid canonical payload bytes", () =>
    Effect.gen(function*() {
      const keyPair = yield* makeSigningKeyPair
      const payload = makePayload(keyPair.signingPublicKey)
      const encoded = yield* EventLogSessionAuth.encodeSessionAuthPayload(payload)
      const malformed = encoded.slice(0, encoded.byteLength - 1)

      const error = yield* EventLogSessionAuth.verifySessionAuthPayloadBytes({
        payload: malformed,
        signingPublicKey: payload.signingPublicKey,
        signature: new Uint8Array(EventLogSessionAuth.Ed25519SignatureLength)
      }).pipe(Effect.flip)

      assert.strictEqual(error._tag, "EventLogSessionAuthError")
      assert.strictEqual(error.reason, "InvalidPayload")
    }))
})
