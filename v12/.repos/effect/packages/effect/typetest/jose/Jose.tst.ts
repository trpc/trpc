import { Context, type Duration, Effect, Redacted, Schema, SchemaGetter, type Scope } from "effect"
import type { Aead, CryptoError, Digest, Mac, SecureRandom, Signature } from "effect/crypto"
import type { HttpClient } from "effect/http"
import { type JoseError, Jwe, Jwk, Jwks, Jws, Jwt } from "effect/jose"
import { describe, expect, it } from "tstyche"

declare const hmac: Jwk.SecretKey<"HS256">
declare const hmac512: Jwk.SecretKey<"HS512">
declare const dir: Jwk.SecretKey<"dir">
declare const privateKey: Jwk.PrivateKey
declare const publicKey: Jwk.PublicKey
declare const privateJwk: Jwk.PrivateJwk
declare const secretJwk: Jwk.SecretJwk
declare const signingKey: Jwk.SigningKey
declare const verificationKey: Jwk.VerificationKey
declare const token: Redacted.Redacted<string>
declare const payload: Uint8Array

interface AppHeader {
  readonly kid?: string | undefined
  readonly typ?: string | undefined
}

interface ProofHeader extends Jws.Header {
  readonly jwk: Jwk.PublicJwk
}

declare const appHeader: AppHeader
declare const proofHeader: ProofHeader

class Decode extends Context.Service<Decode, { readonly prefix: string }>()("test/Decode") {}
class Encode extends Context.Service<Encode, { readonly prefix: string }>()("test/Encode") {}
class KeyStore extends Context.Service<KeyStore, { readonly key: Jwk.SecretKey<"dir"> }>()("test/KeyStore") {}

declare const resolveKey: (
  header: Jwe.ProtectedHeader
) => Effect.Effect<Jwk.SecretKey<"dir">, "UnknownKey", KeyStore>

const Claims = Schema.Struct({
  sub: Schema.String.pipe(Schema.decodeTo(Schema.String, {
    decode: SchemaGetter.transformEffect((value) => Effect.map(Decode, (service) => service.prefix + value)),
    encode: SchemaGetter.transformEffect((value) => Effect.map(Encode, (service) => value.slice(service.prefix.length)))
  })),
  quota: Schema.FiniteFromString
})

describe("Jwk", () => {
  it("binds secret keys to one algorithm at the type level", () => {
    expect(Jwk.importSecret(Redacted.make({ kty: "oct", k: "" }), "HS256")).type.toBe<
      Effect.Effect<Jwk.SecretKey<"HS256">, JoseError.JoseError>
    >()
    expect(Jwk.importSecret(Redacted.make({ kty: "oct", k: "" }), "dir")).type.toBe<
      Effect.Effect<Jwk.SecretKey<"dir">, JoseError.JoseError>
    >()
    expect<Jwk.SigningKey>().type.toBe<Jwk.PrivateKey | Jwk.SecretKey<Jwk.HmacAlgorithm>>()
    expect<Jwk.VerificationKey>().type.toBe<Jwk.PublicKey | Jwk.SecretKey<Jwk.HmacAlgorithm>>()
  })

  it("imports and exports without services and never exposes CryptoError", () => {
    expect(Jwk.importPublic({ kty: "EC", crv: "P-256", x: "", y: "" }, "ES256")).type.toBe<
      Effect.Effect<Jwk.PublicKey, JoseError.JoseError>
    >()
    expect(Jwk.importPkcs8(Redacted.make(payload), "ES256")).type.toBe<
      Effect.Effect<Jwk.PrivateKey, JoseError.JoseError>
    >()
    expect(Jwk.exportPublic(publicKey)).type.toBe<Effect.Effect<Jwk.PublicJwk, JoseError.JoseError>>()
    expect(Jwk.generateKeyPair({ algorithm: "ES256" })).type.toBe<
      Effect.Effect<Jwk.KeyPair, JoseError.JoseError, Signature.Signature>
    >()
    expect(Jwk.generateSecret("HS384")).type.toBe<
      Effect.Effect<Redacted.Redacted<Jwk.SecretJwk>, never, SecureRandom.SecureRandom>
    >()
    expect<Extract<JoseError.JoseError, CryptoError.CryptoError>>().type.toBe<never>()
    expect(Jwk.importPublic).type.not.toBeCallableWith({ kty: "EC", crv: "P-256", x: "", y: "" }, "HS256")
  })

  it("preserves the selected encoding and private-key redaction", () => {
    expect(Jwk.importPkcs8(Redacted.make("private pem"), "ES384")).type.toBe<
      Effect.Effect<Jwk.PrivateKey, JoseError.JoseError>
    >()
    expect(Jwk.importPkcs8).type.not.toBeCallableWith("private pem", "ES384")
    expect(Jwk.exportSpki(publicKey)).type.toBe<Effect.Effect<Uint8Array, JoseError.JoseError>>()
    expect(Jwk.exportSpki(publicKey, { format: "pem" })).type.toBe<Effect.Effect<string, JoseError.JoseError>>()
    expect(Jwk.exportPkcs8(privateKey)).type.toBe<
      Effect.Effect<Redacted.Redacted<Uint8Array>, JoseError.JoseError>
    >()
    expect(Jwk.exportPkcs8(privateKey, { format: "pem" })).type.toBe<
      Effect.Effect<Redacted.Redacted<string>, JoseError.JoseError>
    >()
    const options: { readonly format?: "der" | "pem" | undefined } = {}
    expect(Jwk.exportSpki(publicKey, options)).type.toBe<Effect.Effect<Uint8Array | string, JoseError.JoseError>>()
  })

  it("does not promise PEM when the format is optional", () => {
    // The property may be absent, in which case both exporters produce DER.
    const maybePem: { readonly format?: "pem" | undefined } = {}
    expect(Jwk.exportSpki(publicKey, maybePem)).type.toBe<Effect.Effect<Uint8Array | string, JoseError.JoseError>>()
    expect(Jwk.exportPkcs8(privateKey, maybePem)).type.toBe<
      Effect.Effect<Redacted.Redacted<Uint8Array | string>, JoseError.JoseError>
    >()
  })

  it("requires redaction for private and secret JWK thumbprint inputs", () => {
    expect(Jwk.thumbprint(publicKey)).type.toBe<Effect.Effect<string, JoseError.JoseError, Digest.Digest>>()
    expect(Jwk.thumbprint).type.not.toBeCallableWith(privateJwk)
    expect(Jwk.thumbprint).type.not.toBeCallableWith(secretJwk)
  })

  it("exposes the crypto key object", () => {
    expect(publicKey.key).type.toBe<Signature.PublicKey>()
    expect(privateKey.key).type.toBe<Signature.PrivateKey>()
    expect(hmac.key).type.toBe<Mac.Key>()
    expect(hmac512.key).type.toBe<Mac.Key>()
    expect(dir.key).type.toBe<Aead.Key>()
    expect(publicKey.kid).type.toBe<string | undefined>()
  })
})

describe("Jws and Jwe", () => {
  it("accepts named header interfaces and JSON-valued extensions", () => {
    expect<AppHeader>().type.toBeAssignableTo<Jws.Header>()
    expect(Jws.sign).type.toBeCallableWith(payload, privateKey, proofHeader)
    expect(Jwe.encrypt).type.toBeCallableWith(payload, dir, appHeader)
    expect(Jws.sign).type.not.toBeCallableWith(payload, privateKey, { custom: () => "value" })
  })

  it("derives the algorithm from the key and makes the header optional", () => {
    expect(Jws.sign(payload, hmac)).type.toBe<
      Effect.Effect<Redacted.Redacted<string>, JoseError.JoseError, Mac.Mac>
    >()
    expect(Jws.sign).type.toBeCallableWith(payload, privateKey, { kid: "k", typ: "JWT" })
    expect(Jws.sign).type.toBeCallableWith(payload, privateKey, { jwk: publicKey.jwk, custom: [true, null] })
    expect(Jws.sign).type.not.toBeCallableWith(payload, hmac, { alg: "HS256" })
    expect(Jws.sign).type.not.toBeCallableWith(payload, hmac, { crit: ["custom"] })
    expect(Jws.sign).type.not.toBeCallableWith(payload, dir)
    expect(Jwe.encrypt).type.not.toBeCallableWith(payload, hmac)
    expect(Jwe.encrypt).type.not.toBeCallableWith(payload, dir, { enc: "A128GCM" })
    expect(Jwe.encrypt).type.not.toBeCallableWith(payload, dir, { zip: "DEF" })
    expect(Jwe.encrypt(payload, dir)).type.toBe<
      Effect.Effect<Redacted.Redacted<string>, JoseError.JoseError, Aead.Aead | SecureRandom.SecureRandom>
    >()
    expect<Jws.Requirements>().type.toBe<Mac.Mac | Signature.Signature>()
  })

  it("requires only the service the key uses", () => {
    expect(Jws.sign(payload, privateKey)).type.toBe<
      Effect.Effect<Redacted.Redacted<string>, JoseError.JoseError, Signature.Signature>
    >()
    expect(Jws.verify(token, hmac)).type.toBe<Effect.Effect<Jws.Verified, JoseError.JoseError, Mac.Mac>>()
    expect(Jws.verify(token, hmac512)).type.toBe<Effect.Effect<Jws.Verified, JoseError.JoseError, Mac.Mac>>()
    expect(Jws.sign(payload, signingKey)).type.toBe<
      Effect.Effect<Redacted.Redacted<string>, JoseError.JoseError, Jws.Requirements>
    >()
    expect(Jws.verify(token, verificationKey)).type.toBe<
      Effect.Effect<Jws.Verified, JoseError.JoseError, Jws.Requirements>
    >()
  })

  it("accepts plain or redacted tokens", () => {
    expect(Jws.verify("a.b.c", publicKey)).type.toBe<
      Effect.Effect<Jws.Verified, JoseError.JoseError, Signature.Signature>
    >()
    expect(Jws.verify).type.toBeCallableWith(token, publicKey)
    expect(Jws.verify).type.not.toBeCallableWith(token, publicKey, { algorithms: ["ES256"] })
    expect(Jws.verifyWithKeySet(token, { algorithms: ["ES256"] })).type.toBe<
      Effect.Effect<
        Jws.Verified & { readonly key: Jwk.PublicKey },
        JoseError.JoseError,
        Jwks.Jwks | Signature.Signature
      >
    >()
    expect(Jws.verifyWithKeySet).type.not.toBeCallableWith(token, { algorithms: ["HS256"] })
    expect(Jwe.decrypt(token, dir)).type.toBe<Effect.Effect<Jwe.Decrypted, JoseError.JoseError, Aead.Aead>>()
    expect<Jws.Verified["payload"]>().type.toBe<Uint8Array>()
    expect<Jws.Verified["protectedHeader"]>().type.toBe<Jws.ProtectedHeader>()
    expect<Jws.ProtectedHeader["alg"]>().type.toBe<Jwk.Algorithm>()
  })

  it("infers JWE resolver headers and propagates lookup failures and services", () => {
    const decrypted = Jwe.decrypt(token, (header) => {
      expect(header).type.toBe<Jwe.ProtectedHeader>()
      return resolveKey(header)
    })
    expect(decrypted).type.toBe<
      Effect.Effect<Jwe.Decrypted, JoseError.JoseError | "UnknownKey", Aead.Aead | KeyStore>
    >()
    expect(Jwe.decrypt).type.not.toBeCallableWith(token, hmac)
    expect(Jwe.decrypt).type.not.toBeCallableWith(token, () => Effect.succeed(hmac))
  })
})

describe("Jwt", () => {
  it("keeps encoding and decoding services distinct", () => {
    const signed = Jwt.sign(Claims, { sub: "user:42", quota: 3 }, hmac)
    const verified = Jwt.verify(Claims, token, hmac)
    const encrypted = Jwt.encrypt(Claims, { sub: "user:42", quota: 3 }, dir)
    const decrypted = Jwt.decrypt(Claims, token, dir)
    expect<Effect.Services<typeof signed>>().type.toBe<Encode | Mac.Mac>()
    expect<Effect.Services<typeof verified>>().type.toBe<Decode | Mac.Mac>()
    expect<Effect.Services<typeof encrypted>>().type.toBe<Encode | Aead.Aead | SecureRandom.SecureRandom>()
    expect<Effect.Services<typeof decrypted>>().type.toBe<Decode | Aead.Aead>()
    expect<Effect.Success<typeof signed>>().type.toBe<Redacted.Redacted<string>>()
    expect<Effect.Success<typeof verified>>().type.toBe<Jwt.Verified<typeof Claims.Type>>()
    expect<Effect.Success<typeof decrypted>>().type.toBe<Jwt.Decrypted<typeof Claims.Type>>()
    expect<Effect.Error<typeof signed>>().type.toBe<Jwt.JwtError>()
    expect<Effect.Error<typeof decrypted>>().type.toBe<Jwt.JwtError>()
    expect<Jwt.JwtError>().type.toBe<JoseError.JoseError | Schema.SchemaError>()
  })

  it("combines encrypted JWT schema and resolver requirements", () => {
    const decrypted = Jwt.decrypt(Claims, token, (header) => {
      expect(header).type.toBe<Jwe.ProtectedHeader>()
      return resolveKey(header)
    }, { issuer: "example", maxTokenAge: "5 minutes" })
    expect(decrypted).type.toBe<
      Effect.Effect<Jwt.Decrypted<typeof Claims.Type>, Jwt.JwtError | "UnknownKey", Decode | Aead.Aead | KeyStore>
    >()
    expect(Jwt.encrypt).type.not.toBeCallableWith(Claims, { sub: "user:42", quota: 3 }, hmac)
  })

  it("requires only the service the key uses", () => {
    const signedAsymmetric = Jwt.sign(Claims, { sub: "user:42", quota: 3 }, privateKey)
    const verifiedAsymmetric = Jwt.verify(Claims, token, publicKey)
    const signedUnion = Jwt.sign(Claims, { sub: "user:42", quota: 3 }, signingKey)
    const verifiedUnion = Jwt.verify(Claims, token, verificationKey)
    expect<Effect.Services<typeof signedAsymmetric>>().type.toBe<Encode | Signature.Signature>()
    expect<Effect.Services<typeof verifiedAsymmetric>>().type.toBe<Decode | Signature.Signature>()
    expect<Effect.Services<typeof signedUnion>>().type.toBe<Encode | Jws.Requirements>()
    expect<Effect.Services<typeof verifiedUnion>>().type.toBe<Decode | Jws.Requirements>()
  })

  it("accepts Duration inputs for policy and requires an allowlist only for key sets", () => {
    expect<Jwt.VerifyOptions["clockTolerance"]>().type.toBe<Duration.Input | undefined>()
    expect<Jwt.VerifyOptions["maxTokenAge"]>().type.toBe<Duration.Input | undefined>()
    expect<Jwks.RemoteOptions["timeToLive"]>().type.toBe<Duration.Input | undefined>()
    expect(Jwt.verify).type.not.toBeCallableWith(Claims, token, hmac, { algorithms: ["HS256"] })
    expect(Jwt.verifyWithKeySet).type.not.toBeCallableWith(Claims, token, {})
    const resolved = Jwt.verifyWithKeySet(Claims, token, { algorithms: ["ES256"] })
    expect<Effect.Services<typeof resolved>>().type.toBe<Decode | Jwks.Jwks | Signature.Signature>()
    expect<Effect.Success<typeof resolved>>().type.toBe<
      Jwt.Verified<typeof Claims.Type> & { readonly key: Jwk.PublicKey }
    >()
    expect(Jwt.decodeUnverified(token)).type.toBe<
      Effect.Effect<Jwt.Unverified, JoseError.JoseError>
    >()
    expect<Jwt.Unverified["claims"]>().type.toBe<Readonly<Record<string, Schema.Json>>>()
  })
})

describe("Jwks", () => {
  it("builds a remote key set in a scope", () => {
    expect(Jwks.makeRemote({ url: "https://issuer.example/keys" })).type.toBe<
      Effect.Effect<Jwks.Jwks["Service"], JoseError.JoseError, HttpClient.HttpClient | Scope.Scope>
    >()
  })
})
