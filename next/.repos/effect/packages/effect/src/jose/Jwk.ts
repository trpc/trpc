/**
 * JSON Web Keys and the algorithm-bound keys the other `effect/jose` modules
 * use.
 *
 * A key is imported for one algorithm and keeps it: a JWS or JWE operation
 * takes its algorithm from the key, so a token cannot pick another one. The
 * imported key wraps an `effect/crypto` key object, which redacts itself when
 * printed and caches its native key.
 *
 * Importing honours the JWK's `alg`, `use`, and `key_ops` members, and
 * rejects RSA keys shorter than 2048 bits.
 *
 * @stability unstable
 * @since 4.1.1
 */
import * as Aead from "../crypto/Aead.ts"
import * as Digest from "../crypto/Digest.ts"
import * as KeyFormat from "../crypto/KeyFormat.ts"
import * as Mac from "../crypto/Mac.ts"
import * as SecureRandom from "../crypto/SecureRandom.ts"
import * as Signature from "../crypto/Signature.ts"
import * as Effect from "../Effect.ts"
import * as Base64Url from "../encoding/Base64Url.ts"
import * as Redacted from "../Redacted.ts"
import * as Schema from "../Schema.ts"
import {
  cryptoFailure,
  decodeSegment,
  hasPrivateMembers,
  invalidArgument,
  invalidKey,
  isCanonicalSegment,
  noPrivateMembers,
  publicKeyFailure,
  utf8
} from "./internal/compact.ts"
import type { JoseError } from "./JoseError.ts"

/**
 * Schema for RSA, RSA-PSS, and ECDSA signatures with SHA-256, SHA-384, or
 * SHA-512, and EdDSA signatures with Ed25519.
 *
 * @stability unstable
 * @category schemas
 * @since 4.1.1
 */
export const AsymmetricAlgorithm = Schema.Literals([
  "RS256",
  "RS384",
  "RS512",
  "PS256",
  "PS384",
  "PS512",
  "ES256",
  "ES384",
  "ES512",
  "EdDSA"
])

/**
 * An asymmetric signature algorithm.
 *
 * @stability unstable
 * @category models
 * @since 4.1.1
 */
export type AsymmetricAlgorithm = typeof AsymmetricAlgorithm.Type

/**
 * Schema for the JWS algorithms: HS256, HS384, HS512, and the asymmetric
 * algorithms.
 *
 * @stability unstable
 * @category schemas
 * @since 4.1.1
 */
export const Algorithm = Schema.Literals([
  "HS256",
  "HS384",
  "HS512",
  "RS256",
  "RS384",
  "RS512",
  "PS256",
  "PS384",
  "PS512",
  "ES256",
  "ES384",
  "ES512",
  "EdDSA"
])

/**
 * A JWS algorithm.
 *
 * @stability unstable
 * @category models
 * @since 4.1.1
 */
export type Algorithm = typeof Algorithm.Type

/**
 * An HMAC signature algorithm using SHA-256, SHA-384, or SHA-512.
 *
 * @stability unstable
 * @category models
 * @since 4.1.1
 */
export type HmacAlgorithm = "HS256" | "HS384" | "HS512"

/**
 * The algorithms of a symmetric key: HMAC signatures, or direct A256GCM
 * encryption.
 *
 * @stability unstable
 * @category models
 * @since 4.1.1
 */
export type SecretAlgorithm = HmacAlgorithm | "dir"

const metadata = {
  kid: Schema.optionalKey(Schema.String),
  alg: Schema.optionalKey(Schema.String),
  use: Schema.optionalKey(Schema.String),
  key_ops: Schema.optionalKey(Schema.Array(Schema.String))
}

const base64url = Schema.String.check(Schema.makeFilter(isCanonicalSegment, {
  expected: "a canonical base64url encoded string"
}))

const rsa = { ...metadata, kty: Schema.Literal("RSA"), n: base64url, e: base64url }
const ec = {
  ...metadata,
  kty: Schema.Literal("EC"),
  crv: Schema.Literals(["P-256", "P-384", "P-521"]),
  x: base64url,
  y: base64url
}
const okp = { ...metadata, kty: Schema.Literal("OKP"), crv: Schema.Literal("Ed25519"), x: base64url }

/**
 * Schema for an RSA, P-256, P-384, P-521, or Ed25519 public JWK. Private and symmetric
 * members, including RSA factors, are rejected.
 *
 * @stability unstable
 * @category schemas
 * @since 4.1.1
 */
export const PublicJwk = Schema.Union([
  Schema.Struct({ ...rsa, ...noPrivateMembers }),
  Schema.Struct({ ...ec, ...noPrivateMembers }),
  Schema.Struct({ ...okp, ...noPrivateMembers })
])

/**
 * An RSA, P-256, P-384, P-521, or Ed25519 public JWK.
 *
 * @stability unstable
 * @category models
 * @since 4.1.1
 */
export type PublicJwk = typeof PublicJwk.Type

/**
 * Schema for an RSA, P-256, P-384, P-521, or Ed25519 private JWK. RSA keys need their CRT
 * members and cannot have more than two primes.
 *
 * @stability unstable
 * @category schemas
 * @since 4.1.1
 */
export const PrivateJwk = Schema.Union([
  Schema.Struct({
    ...rsa,
    d: base64url,
    p: base64url,
    q: base64url,
    dp: base64url,
    dq: base64url,
    qi: base64url,
    oth: Schema.optionalKey(Schema.Never)
  }),
  Schema.Struct({ ...ec, d: base64url }),
  Schema.Struct({ ...okp, d: base64url })
])

/**
 * An RSA, P-256, P-384, P-521, or Ed25519 private JWK.
 *
 * @stability unstable
 * @category models
 * @since 4.1.1
 */
export type PrivateJwk = typeof PrivateJwk.Type

/**
 * Schema for an octet-sequence JWK.
 *
 * @stability unstable
 * @category schemas
 * @since 4.1.1
 */
export const SecretJwk = Schema.Struct({ ...metadata, kty: Schema.Literal("oct"), k: Schema.String })

/**
 * An octet-sequence JWK.
 *
 * @stability unstable
 * @category models
 * @since 4.1.1
 */
export type SecretJwk = typeof SecretJwk.Type

/**
 * A public key bound to one asymmetric algorithm, with the JWK it was imported
 * from.
 *
 * @stability unstable
 * @category models
 * @since 4.1.1
 */
export interface PublicKey {
  readonly _tag: "PublicKey"
  readonly algorithm: AsymmetricAlgorithm
  readonly kid: string | undefined
  readonly jwk: PublicJwk
  readonly key: Signature.PublicKey
}

/**
 * A private key bound to one asymmetric algorithm.
 *
 * @stability unstable
 * @category models
 * @since 4.1.1
 */
export interface PrivateKey {
  readonly _tag: "PrivateKey"
  readonly algorithm: AsymmetricAlgorithm
  readonly kid: string | undefined
  readonly key: Signature.PrivateKey
}

/**
 * A symmetric key bound to an HMAC signature algorithm or to direct A256GCM encryption.
 *
 * @stability unstable
 * @category models
 * @since 4.1.1
 */
export interface SecretKey<A extends SecretAlgorithm = SecretAlgorithm> {
  readonly _tag: "SecretKey"
  readonly algorithm: A
  readonly kid: string | undefined
  readonly key: A extends HmacAlgorithm ? Mac.Key : Aead.Key
}

/**
 * A key that signs JWS and JWT tokens.
 *
 * @stability unstable
 * @category models
 * @since 4.1.1
 */
export type SigningKey = PrivateKey | SecretKey<HmacAlgorithm>

/**
 * A key that verifies JWS and JWT tokens.
 *
 * @stability unstable
 * @category models
 * @since 4.1.1
 */
export type VerificationKey = PublicKey | SecretKey<HmacAlgorithm>

/**
 * A generated public JWK and its private JWK, both carrying `alg`, `use: "sig"`,
 * and the requested `kid`.
 *
 * @stability unstable
 * @category models
 * @since 4.1.1
 */
export interface KeyPair {
  readonly publicKey: PublicJwk
  readonly privateKey: Redacted.Redacted<PrivateJwk>
}

/**
 * Options for {@link generateKeyPair}.
 *
 * @stability unstable
 * @category models
 * @since 4.1.1
 */
export interface GenerateKeyPairOptions {
  readonly algorithm: AsymmetricAlgorithm
  readonly kid?: string | undefined
  /**
   * RSA modulus length in bits. Defaults to 2048 and must be at least 2048.
   */
  readonly modulusLength?: number | undefined
}

const signatureAlgorithm = (algorithm: AsymmetricAlgorithm, modulusLength = 2048): Signature.Algorithm => {
  switch (algorithm) {
    case "RS256":
      return Signature.rsaPkcs1v15({ hash: Digest.sha256, modulusLength })
    case "RS384":
      return Signature.rsaPkcs1v15({ hash: Digest.sha384, modulusLength })
    case "RS512":
      return Signature.rsaPkcs1v15({ hash: Digest.sha512, modulusLength })
    case "PS256":
      return Signature.rsaPss({ hash: Digest.sha256, modulusLength })
    case "PS384":
      return Signature.rsaPss({ hash: Digest.sha384, modulusLength })
    case "PS512":
      return Signature.rsaPss({ hash: Digest.sha512, modulusLength })
    case "ES256":
      return Signature.ecdsaP256
    case "ES384":
      return Signature.ecdsaP384
    case "ES512":
      return Signature.ecdsaP521
    case "EdDSA":
      return Signature.ed25519
  }
}

const hmacAlgorithms: Record<HmacAlgorithm, Mac.Algorithm> = {
  HS256: Mac.hmacSha256,
  HS384: Mac.hmacSha384,
  HS512: Mac.hmacSha512
}

const secretKeyLength = (algorithm: SecretAlgorithm): number =>
  algorithm === "dir" ? 32 : hmacAlgorithms[algorithm].hash.outputLength

interface Metadata {
  readonly alg?: string | undefined
  readonly use?: string | undefined
  readonly key_ops?: ReadonlyArray<string> | undefined
}

// `key_ops` must allow every operation in `operations`; symmetric keys perform both.
const checkMetadata = (
  jwk: Metadata,
  algorithm: string,
  use: "sig" | "enc",
  operations: ReadonlyArray<string>
): Effect.Effect<void, JoseError> => {
  if (jwk.alg !== undefined && jwk.alg !== algorithm) {
    return invalidKey(`The JWK is for ${jwk.alg}, not ${algorithm}`)
  }
  if (jwk.use !== undefined && jwk.use !== use) {
    return invalidKey(`The JWK use is ${jwk.use}, not ${use}`)
  }
  if (jwk.key_ops !== undefined && !operations.every((operation) => jwk.key_ops!.includes(operation))) {
    return invalidKey(`The JWK key_ops must allow ${operations.join(" and ")}`)
  }
  return Effect.void
}

// Checked on the imported key, whose algorithm carries the actual modulus.
const checkModulus = (key: Signature.PublicKey | Signature.PrivateKey): Effect.Effect<void, JoseError> =>
  (key.algorithm._tag === "RsaPss" || key.algorithm._tag === "RsaPkcs1v15") && key.algorithm.modulusLength < 2048
    ? invalidKey("RSA keys must have at least 2048 bits")
    : Effect.void

// KeyFormat handles only key members; JOSE metadata is handled here.
const jsonWebKey = (jwk: object): KeyFormat.JsonWebKey => jwk

const isPublicJwk = Schema.is(PublicJwk)
const isPrivateJwk = Schema.is(PrivateJwk)

const exportJwk = (
  key: Signature.PrivateKey | Signature.PublicKey,
  algorithm: AsymmetricAlgorithm,
  kid: string | undefined
): Effect.Effect<object, JoseError> =>
  KeyFormat.encode(KeyFormat.jwk, key as KeyFormat.Key).pipe(
    Effect.mapBoth({
      onFailure: cryptoFailure("Could not export the key"),
      onSuccess: (jwk) => ({ ...jwk, ...(kid === undefined ? {} : { kid }), alg: algorithm, use: "sig" })
    })
  )

/**
 * Generates a key pair for an asymmetric algorithm and returns it as JWKs.
 *
 * @see {@link importPrivate} for preparing the private JWK for signing
 * @see {@link importPublic} for preparing the public JWK for verification
 *
 * @stability unstable
 * @category constructors
 * @since 4.1.1
 */
export const generateKeyPair = Effect.fnUntraced(function*(
  options: GenerateKeyPairOptions
): Effect.fn.Return<KeyPair, JoseError, Signature.Signature> {
  const { algorithm, kid, modulusLength } = options
  if (modulusLength !== undefined && (!Number.isSafeInteger(modulusLength) || modulusLength < 2048)) {
    return yield* invalidArgument("modulusLength must be an integer of at least 2048")
  }
  const signature = yield* Signature.Signature
  const pair = yield* signature.generateKeyPair(signatureAlgorithm(algorithm, modulusLength)).pipe(
    Effect.mapError(cryptoFailure(`Could not generate a ${algorithm} key pair`))
  )
  const publicJwk = yield* exportJwk(pair.publicKey, algorithm, kid)
  const privateJwk = yield* exportJwk(pair.privateKey, algorithm, kid)
  return { publicKey: publicJwk as PublicJwk, privateKey: Redacted.make(privateJwk as PrivateJwk) }
})

/**
 * Generates a redacted secret JWK carrying its `alg`, `use`, and optional `kid`.
 *
 * **Details**
 *
 * HMAC keys contain 32, 48, or 64 random bytes for HS256, HS384, or HS512.
 * Direct A256GCM keys contain 32 bytes and use `enc` instead of `sig`.
 *
 * @see {@link importSecret} for preparing the JWK for use
 * @see {@link generateKeyPair} for asymmetric keys
 *
 * @stability unstable
 * @category constructors
 * @since 4.1.1
 */
export const generateSecret = (
  algorithm: SecretAlgorithm,
  options?: { readonly kid?: string | undefined }
): Effect.Effect<Redacted.Redacted<SecretJwk>, never, SecureRandom.SecureRandom> =>
  Effect.map(
    SecureRandom.SecureRandom.use((random) => random.randomBytes(secretKeyLength(algorithm))),
    (bytes) =>
      Redacted.make({
        kty: "oct",
        k: Base64Url.encode(bytes),
        alg: algorithm,
        use: algorithm === "dir" ? "enc" : "sig",
        ...(options?.kid === undefined ? {} : { kid: options.kid })
      })
  )

/**
 * Imports a public JWK for an asymmetric algorithm.
 *
 * **Details**
 *
 * The key's family and curve must fit the algorithm, and any `alg`, `use`, or
 * `key_ops` member must allow verification with it. Private members are
 * rejected. To import untrusted JSON, decode it with {@link PublicJwk} first.
 *
 * @see {@link importPrivate}
 * @see {@link exportPublic}
 *
 * @stability unstable
 * @category constructors
 * @since 4.1.1
 */
export const importPublic = Effect.fnUntraced(function*(
  jwk: PublicJwk,
  algorithm: AsymmetricAlgorithm
): Effect.fn.Return<PublicKey, JoseError> {
  if (hasPrivateMembers(jwk)) return yield* invalidKey("A public JWK cannot contain private members")
  yield* checkMetadata(jwk, algorithm, "sig", ["verify"])
  if (!isPublicJwk(jwk)) return yield* invalidKey("Expected a public JWK with base64url key members")
  const key = yield* KeyFormat.decodePublic(KeyFormat.jwk, signatureAlgorithm(algorithm), jsonWebKey(jwk)).pipe(
    Effect.mapError(publicKeyFailure)
  )
  yield* checkModulus(key)
  return { _tag: "PublicKey", algorithm, kid: jwk.kid, jwk, key }
})

/**
 * Imports a private JWK for an asymmetric algorithm.
 *
 * @see {@link importPkcs8} for importing DER or PEM keys
 * @see {@link exportPrivate}
 *
 * @stability unstable
 * @category constructors
 * @since 4.1.1
 */
export const importPrivate = Effect.fnUntraced(function*(
  input: Redacted.Redacted<PrivateJwk>,
  algorithm: AsymmetricAlgorithm
): Effect.fn.Return<PrivateKey, JoseError> {
  const jwk = Redacted.value(input)
  yield* checkMetadata(jwk, algorithm, "sig", ["sign"])
  if (!isPrivateJwk(jwk)) return yield* invalidKey("Expected a private JWK with base64url key members")
  const key = yield* KeyFormat.decodePrivate(KeyFormat.jwk, signatureAlgorithm(algorithm), jsonWebKey(jwk)).pipe(
    Effect.mapError(cryptoFailure(`Could not import the private JWK for ${algorithm}`))
  )
  yield* checkModulus(key)
  return { _tag: "PrivateKey", algorithm, kid: jwk.kid, key }
})

/**
 * Imports an SPKI public key from DER bytes or PEM text for an asymmetric algorithm.
 *
 * @see {@link importPublic} for importing JWK-encoded keys
 * @see {@link exportSpki}
 *
 * @stability unstable
 * @category constructors
 * @since 4.1.1
 */
export const importSpki = Effect.fnUntraced(function*(
  input: Uint8Array | string,
  algorithm: AsymmetricAlgorithm,
  options?: { readonly kid?: string | undefined }
): Effect.fn.Return<PublicKey, JoseError> {
  const key = yield* KeyFormat.decodePublic<Signature.Algorithm, Uint8Array | string>(
    typeof input === "string" ? KeyFormat.pem(KeyFormat.spki) : KeyFormat.spki,
    signatureAlgorithm(algorithm),
    input
  ).pipe(Effect.mapError(publicKeyFailure))
  yield* checkModulus(key)
  const jwk = yield* exportJwk(key, algorithm, options?.kid)
  return { _tag: "PublicKey", algorithm, kid: options?.kid, jwk: jwk as PublicJwk, key }
})

/**
 * Imports a redacted PKCS#8 private key from DER bytes or PEM text for an asymmetric algorithm.
 *
 * @see {@link importPrivate} for importing JWK-encoded keys
 * @see {@link exportPkcs8}
 *
 * @stability unstable
 * @category constructors
 * @since 4.1.1
 */
export const importPkcs8 = Effect.fnUntraced(function*(
  input: Redacted.Redacted<Uint8Array | string>,
  algorithm: AsymmetricAlgorithm,
  options?: { readonly kid?: string | undefined }
): Effect.fn.Return<PrivateKey, JoseError> {
  const data = Redacted.value(input)
  const key = yield* KeyFormat.decodePrivate<Signature.Algorithm, Uint8Array | string>(
    typeof data === "string" ? KeyFormat.pem(KeyFormat.pkcs8) : KeyFormat.pkcs8,
    signatureAlgorithm(algorithm),
    data
  ).pipe(Effect.mapError(cryptoFailure(`Could not import the PKCS#8 key for ${algorithm}`)))
  yield* checkModulus(key)
  return { _tag: "PrivateKey", algorithm, kid: options?.kid, key }
})

/**
 * Imports an octet JWK for HMAC signatures or for direct A256GCM encryption.
 *
 * **Details**
 *
 * HS256, HS384, and HS512 keys need at least 32, 48, and 64 bytes respectively;
 * `dir` keys need exactly 32. Any `alg`,
 * `use`, or `key_ops` member must allow the algorithm; `key_ops` must allow
 * both of its operations.
 *
 * **Example** (Importing an HS256 key)
 *
 * ```ts import.meta.vitest
 * import { Effect, Redacted } from "effect"
 * import { Jwk } from "effect/jose"
 *
 * // Fixed public example material; generate application secrets securely.
 * const secret = Redacted.make({ kty: "oct", k: "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc" } as const)
 * const key = await Effect.runPromise(Jwk.importSecret(secret, "HS256"))
 * key.algorithm // => "HS256"
 * ```
 *
 * @see {@link generateSecret}
 *
 * @stability unstable
 * @category constructors
 * @since 4.1.1
 */
export const importSecret = Effect.fnUntraced(function*<A extends SecretAlgorithm>(
  input: Redacted.Redacted<SecretJwk>,
  algorithm: A
): Effect.fn.Return<SecretKey<A>, JoseError> {
  const jwk = Redacted.value(input)
  if (algorithm !== "dir") {
    yield* checkMetadata(jwk, algorithm, "sig", ["sign", "verify"])
  } else {
    yield* checkMetadata(jwk, algorithm, "enc", ["encrypt", "decrypt"])
  }
  const bytes = jwk.kty === "oct" ? decodeSegment(jwk.k) : undefined
  if (bytes === undefined) return yield* invalidKey("Expected an oct JWK with a base64url k member")
  const length = secretKeyLength(algorithm)
  if (algorithm === "dir" ? bytes.length !== length : bytes.length < length) {
    return yield* invalidKey(
      algorithm === "dir"
        ? "dir keys must have exactly 32 bytes"
        : `${algorithm} keys must have at least ${length} bytes`
    )
  }
  const failure = cryptoFailure(`Could not import the ${algorithm} key`)
  const key = algorithm !== "dir"
    ? yield* Effect.mapError(Mac.key(hmacAlgorithms[algorithm as HmacAlgorithm], bytes), failure)
    : yield* Effect.mapError(Aead.key(Aead.aes256Gcm, bytes), failure)
  return { _tag: "SecretKey", algorithm, kid: jwk.kid, key } as SecretKey<A>
})

/**
 * Exports a public key as a JWK carrying its `alg`, `kid`, and `use: "sig"`.
 *
 * @see {@link importPublic}
 * @see {@link exportPrivate}
 *
 * @stability unstable
 * @category encoding
 * @since 4.1.1
 */
export const exportPublic = (key: PublicKey): Effect.Effect<PublicJwk, JoseError> =>
  Effect.map(exportJwk(key.key, key.algorithm, key.kid), (jwk) => jwk as PublicJwk)

/**
 * Exports a private key as a JWK carrying its `alg`, `kid`, and `use: "sig"`.
 *
 * @see {@link importPrivate}
 *
 * @stability unstable
 * @category encoding
 * @since 4.1.1
 */
export const exportPrivate = (key: PrivateKey): Effect.Effect<Redacted.Redacted<PrivateJwk>, JoseError> =>
  Effect.map(exportJwk(key.key, key.algorithm, key.kid), (jwk) => Redacted.make(jwk as PrivateJwk))

/**
 * Exports a public key as SPKI DER bytes, or as PEM text with `format: "pem"`.
 *
 * @see {@link importSpki}
 * @see {@link exportPublic} for JWK output
 *
 * @stability unstable
 * @category encoding
 * @since 4.1.1
 */
export function exportSpki(
  key: PublicKey,
  options: { readonly format: "pem" }
): Effect.Effect<string, JoseError>
export function exportSpki(
  key: PublicKey,
  options?: { readonly format?: "der" | undefined }
): Effect.Effect<Uint8Array, JoseError>
export function exportSpki(
  key: PublicKey,
  options?: { readonly format?: "der" | "pem" | undefined }
): Effect.Effect<Uint8Array | string, JoseError>
export function exportSpki(
  key: PublicKey,
  options?: { readonly format?: "der" | "pem" | undefined }
): Effect.Effect<Uint8Array | string, JoseError> {
  return KeyFormat.encode<KeyFormat.PublicKey, Uint8Array | string>(
    options?.format === "pem" ? KeyFormat.pem(KeyFormat.spki) : KeyFormat.spki,
    key.key as KeyFormat.PublicKey
  ).pipe(Effect.mapError(cryptoFailure("Could not export the SPKI key")))
}

/**
 * Exports a private key as redacted PKCS#8 DER bytes, or redacted PEM text with `format: "pem"`.
 *
 * @see {@link importPkcs8}
 * @see {@link exportPrivate} for JWK output
 *
 * @stability unstable
 * @category encoding
 * @since 4.1.1
 */
export function exportPkcs8(
  key: PrivateKey,
  options: { readonly format: "pem" }
): Effect.Effect<Redacted.Redacted<string>, JoseError>
export function exportPkcs8(
  key: PrivateKey,
  options?: { readonly format?: "der" | undefined }
): Effect.Effect<Redacted.Redacted<Uint8Array>, JoseError>
export function exportPkcs8(
  key: PrivateKey,
  options?: { readonly format?: "der" | "pem" | undefined }
): Effect.Effect<Redacted.Redacted<Uint8Array | string>, JoseError>
export function exportPkcs8(
  key: PrivateKey,
  options?: { readonly format?: "der" | "pem" | undefined }
): Effect.Effect<Redacted.Redacted<Uint8Array | string>, JoseError> {
  return KeyFormat.encode<KeyFormat.PrivateKey, Uint8Array | string>(
    options?.format === "pem" ? KeyFormat.pem(KeyFormat.pkcs8) : KeyFormat.pkcs8,
    key.key as KeyFormat.PrivateKey
  ).pipe(Effect.mapBoth({ onFailure: cryptoFailure("Could not export the PKCS#8 key"), onSuccess: Redacted.make }))
}

/**
 * A JWK or imported key whose thumbprint can be computed. Private and secret
 * JWKs must be redacted.
 *
 * @stability unstable
 * @category models
 * @since 4.1.1
 */
export type ThumbprintInput = PublicJwk | Redacted.Redacted<PrivateJwk | SecretJwk> | PublicKey | PrivateKey | SecretKey

/**
 * Computes an RFC 7638 JWK thumbprint, encoded as unpadded base64url.
 *
 * **Details**
 *
 * Uses SHA-256 by default; SHA-384 and SHA-512 are also supported. Only required
 * key members are hashed, so metadata does not affect the result. Asymmetric
 * private keys have the same thumbprint as their public keys. A secret key's
 * thumbprint is a hash of the secret, so treat it as sensitive.
 *
 * @see {@link thumbprintUri}
 *
 * @stability unstable
 * @category cryptography
 * @since 4.1.1
 */
export const thumbprint = Effect.fnUntraced(function*(
  input: ThumbprintInput,
  hash: Digest.Algorithm = Digest.sha256
): Effect.fn.Return<string, JoseError, Digest.Digest> {
  if (hash.name !== "SHA-256" && hash.name !== "SHA-384" && hash.name !== "SHA-512") {
    return yield* invalidArgument("JWK thumbprints require SHA-256, SHA-384, or SHA-512")
  }
  const jwk = jsonWebKey(
    Redacted.isRedacted(input) ? Redacted.value(input) : "kty" in input ?
      input
      : yield* KeyFormat.encode(KeyFormat.jwk, input.key as KeyFormat.Key).pipe(
        Effect.mapError(cryptoFailure("Could not export the key for a thumbprint"))
      )
  )
  let required: Record<string, string | undefined>
  switch (jwk.kty) {
    case "RSA":
      required = { e: jwk.e, kty: jwk.kty, n: jwk.n }
      break
    case "EC":
      required = { crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y }
      break
    case "OKP":
      required = { crv: jwk.crv, kty: jwk.kty, x: jwk.x }
      break
    case "oct":
      required = { k: jwk.k, kty: jwk.kty }
      break
    default:
      return yield* invalidKey("Unsupported JWK key type for a thumbprint")
  }
  if (
    Object.values(required).some((value) => typeof value !== "string" || value.length === 0) ||
    (required.kty === "oct" ? !isCanonicalSegment(required.k!) : !isPublicJwk(required))
  ) {
    return yield* invalidKey("Expected a JWK with canonical base64url key members")
  }
  const digest = yield* Digest.Digest
  return Base64Url.encode(yield* digest.digest(hash, utf8(JSON.stringify(required))))
})

/**
 * Computes an RFC 9278 JWK thumbprint URI using SHA-256 by default.
 *
 * @see {@link thumbprint} for supported inputs and hashes
 *
 * @stability unstable
 * @category cryptography
 * @since 4.1.1
 */
export const thumbprintUri = (
  input: ThumbprintInput,
  hash: Digest.Algorithm = Digest.sha256
): Effect.Effect<string, JoseError, Digest.Digest> =>
  Effect.map(
    thumbprint(input, hash),
    (value) => `urn:ietf:params:oauth:jwk-thumbprint:${hash.name.toLowerCase()}:${value}`
  )
