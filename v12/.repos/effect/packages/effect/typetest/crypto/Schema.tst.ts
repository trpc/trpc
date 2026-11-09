import { Schema } from "effect"
import * as Aead from "effect/crypto/Aead"
import * as KeyAgreement from "effect/crypto/KeyAgreement"
import * as KeyFormat from "effect/crypto/KeyFormat"
import * as KeyWrap from "effect/crypto/KeyWrap"
import * as Signature from "effect/crypto/Signature"
import { describe, expect, it } from "tstyche"

describe("Schema crypto keys", () => {
  it("returns the exact key type of the family and algorithm", () => {
    expect(Schema.revealCodec(Schema.SignaturePublicKey(Signature.ecdsaP256))).type.toBe<
      Schema.Codec<Signature.PublicKey<Signature.Ecdsa<"P-256">>, Signature.PublicKey<Signature.Ecdsa<"P-256">>>
    >()
    expect(Schema.revealCodec(Schema.AeadKeyFromBytes(Aead.aes256Gcm))).type.toBe<
      Schema.Codec<Aead.Key<Aead.AesGcm>, Uint8Array>
    >()
    expect(Schema.revealCodec(Schema.KeyAgreementPrivateKeyFromBytes(KeyAgreement.x25519))).type.toBe<
      Schema.Codec<KeyAgreement.PrivateKey<KeyAgreement.X25519>, Uint8Array>
    >()
    expect(
      Schema.revealCodec(Schema.SignaturePublicKeyFromFormat(KeyFormat.pem(KeyFormat.spki), Signature.ed25519))
    ).type.toBe<Schema.Codec<Signature.PublicKey<Signature.Ed25519>, string>>()
    expect(Schema.revealCodec(Schema.KeyWrapPrivateKeyFromFormat(KeyFormat.jwk, KeyWrap.rsaOaepSha256))).type.toBe<
      Schema.Codec<KeyWrap.PrivateKey<KeyWrap.RsaOaep>, JsonWebKey>
    >()
  })

  it("rejects formats for another role", () => {
    expect(Schema.SignaturePublicKeyFromFormat).type.not.toBeCallableWith(KeyFormat.pkcs8, Signature.ed25519)
    expect(Schema.SignaturePrivateKeyFromFormat).type.not.toBeCallableWith(KeyFormat.spki, Signature.ed25519)
    expect(Schema.AeadKeyFromFormat).type.not.toBeCallableWith(KeyFormat.spki, Aead.aes256Gcm)
    // PKCS#1 and SEC1 are read only, which a private key schema allows.
    expect(Schema.SignaturePrivateKeyFromFormat).type.toBeCallableWith(KeyFormat.sec1, Signature.ecdsaP256)
  })

  it("limits raw-bytes schemas to algorithms with a raw form", () => {
    expect(Schema.SignaturePrivateKeyFromBytes).type.not.toBeCallableWith(Signature.ecdsaP256)
    expect(Schema.SignaturePublicKeyFromBytes).type.not.toBeCallableWith(Signature.rsaPssSha256)
    expect(Schema.KeyAgreementPrivateKeyFromBytes).type.not.toBeCallableWith(KeyAgreement.ecdhP256)
    expect(Schema).type.not.toHaveProperty("KeyWrapPublicKeyFromBytes")
    expect(Schema).type.not.toHaveProperty("KeyWrapPrivateKeyFromBytes")
  })

  it("rejects algorithms of another family", () => {
    expect(Schema.KeyAgreementPublicKey).type.not.toBeCallableWith(Signature.ed25519)
    expect(Schema.KeyWrapKey).type.not.toBeCallableWith(KeyWrap.rsaOaepSha256)
  })
})
