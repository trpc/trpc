import { assert, describe, it } from "@effect/vitest"
import { Effect, Redacted } from "effect"
import type * as EventLog from "effect/eventlog/EventLog"
import {
  EncryptionDerivationLabelV1,
  makeGetIdentityRootSecretMaterial,
  SigningDerivationLabelV1
} from "effect/eventlog/internal/identityRootSecretDerivation"

const makeIdentity = (options: {
  readonly publicKey: string
  readonly rootSecret: Uint8Array
}): EventLog.Identity["Service"] => ({
  publicKey: options.publicKey,
  privateKey: Redacted.make(options.rootSecret.slice())
})

const makeRootSecret = () => Uint8Array.from(Array.from({ length: 32 }, (_, index) => (index * 17) % 256))

const extractSigningSeedFromPkcs8 = (pkcs8PrivateKey: Uint8Array): Uint8Array =>
  pkcs8PrivateKey.slice(pkcs8PrivateKey.byteLength - 32)

const equalBytes = (left: Uint8Array, right: Uint8Array): boolean => {
  if (left.byteLength !== right.byteLength) {
    return false
  }
  for (let i = 0; i < left.byteLength; i++) {
    if (left[i] !== right[i]) {
      return false
    }
  }
  return true
}

describe("EventLog root secret derivation", () => {
  it.effect("derives the same material for identities with the same root secret", () =>
    Effect.gen(function*() {
      const rootSecret = makeRootSecret()
      const derive = makeGetIdentityRootSecretMaterial(globalThis.crypto)

      const first = yield* derive(makeIdentity({
        publicKey: "user-a",
        rootSecret
      }))
      const second = yield* derive(makeIdentity({
        publicKey: "user-b",
        rootSecret
      }))

      assert.strictEqual(EncryptionDerivationLabelV1.includes("/v1/"), true)
      assert.strictEqual(SigningDerivationLabelV1.includes("/v1/"), true)
      assert.deepStrictEqual(first.encryptionKeyMaterial, second.encryptionKeyMaterial)
      assert.deepStrictEqual(first.signingPublicKey, second.signingPublicKey)
      assert.deepStrictEqual(Redacted.value(first.signingPrivateKey), Redacted.value(second.signingPrivateKey))
    }))

  it.effect("uses versioned, domain-separated labels for encryption and signing", () =>
    Effect.gen(function*() {
      const derive = makeGetIdentityRootSecretMaterial(globalThis.crypto)
      const derived = yield* derive(makeIdentity({
        publicKey: "user-a",
        rootSecret: makeRootSecret()
      }))

      const signingSeed = extractSigningSeedFromPkcs8(Redacted.value(derived.signingPrivateKey))

      assert.strictEqual(equalBytes(derived.encryptionKeyMaterial, signingSeed), false)
      assert.notStrictEqual(EncryptionDerivationLabelV1, SigningDerivationLabelV1)
    }))

  it.effect("memoizes derived material for the same identity instance", () =>
    Effect.gen(function*() {
      const derive = makeGetIdentityRootSecretMaterial(globalThis.crypto)
      const identity = makeIdentity({
        publicKey: "user-a",
        rootSecret: makeRootSecret()
      })

      const first = yield* derive(identity)
      const second = yield* derive(identity)

      assert.strictEqual(first, second)
      assert.strictEqual(first.encryptionKey, second.encryptionKey)
    }))
})
