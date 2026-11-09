/**
 * Key formats: SPKI, PKCS#8, JWK, and PEM, with import-only PKCS#1 and SEC1.
 *
 * {@link decodePublic}, {@link decodePrivate}, and {@link decodeSecret} build
 * typed keys from encoded data, and {@link encode} writes a key in a named
 * format. They are plain functions, not a service: each returns an Effect that
 * requires nothing and runs on the `WebCrypto` reference.
 *
 * The algorithm decides the family of the result. Decoding with
 * `Signature.ecdsaP256` gives a `Signature` key, and with
 * `KeyAgreement.ecdhP256` a `KeyAgreement` key. Raw bytes are not a format
 * here: each family's own constructors read them.
 *
 * Format values carry their role, direction, and data type in the types:
 *
 * - {@link spki} (public) and {@link pkcs8} (private) read and write DER
 *   bytes;
 * - {@link jwk} reads and writes JWK objects for every role;
 * - {@link pkcs1} (RSA) and {@link sec1} (EC) read private DER keys and
 *   cannot be written;
 * - {@link pem} turns any DER format into PEM text.
 *
 * Decoded keys always hold bytes, in the forms each family stores, so they
 * work with every layer.
 *
 * **Gotchas**
 *
 * - EC private keys must include their public point. Safari and Firefox
 *   before 132 cannot import one without it, so every runtime fails with an
 *   `Unsupported` reason.
 * - SPKI accepts compressed EC points. Safari and Firefox before 146 reject
 *   them in raw import, so the families' raw constructors take only
 *   uncompressed points.
 * - Ed25519 and X25519 private JWKs need a correct `x`. Bun and Deno accept
 *   `d` alone, and other runtimes reject it.
 * - JWK members other than `kty`, `crv`, `alg`, and the key material are
 *   ignored on import, and written JWKs contain only `kty`, `crv`, and the key
 *   material.
 * - Callers parse and serialize JSON themselves.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Effect from "../Effect.ts"
import * as Base64 from "../encoding/Base64.ts"
import * as Base64Url from "../encoding/Base64Url.ts"
import * as Predicate from "../Predicate.ts"
import * as Result from "../Result.ts"
import type * as Aead from "./Aead.ts"
import type * as Cipher from "./Cipher.ts"
import * as CryptoError from "./CryptoError.ts"
import * as Asymmetric from "./internal/asymmetric.ts"
import * as Der from "./internal/der.ts"
import * as KeyModel from "./internal/key.ts"
import * as internal from "./internal/webCrypto.ts"
import * as KeyAgreement from "./KeyAgreement.ts"
import * as KeyWrap from "./KeyWrap.ts"
import type * as Mac from "./Mac.ts"
import * as Signature from "./Signature.ts"

/**
 * The role of a key: public, private, or secret (symmetric).
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Role = "public" | "private" | "secret"

/**
 * Whether a format can be read, written, or both.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Direction = "decode" | "encode"

/**
 * A JSON Web Key (RFC 7517) with the native Web Crypto field types and
 * mutability, usable without DOM declarations.
 *
 * @stability unstable
 * @category models
 * @since 4.1.1
 */
export interface JsonWebKey {
  alg?: string
  crv?: string
  d?: string
  dp?: string
  dq?: string
  e?: string
  ext?: boolean
  k?: string
  key_ops?: Array<string>
  kty?: string
  n?: string
  oth?: Array<{ d?: string; r?: string; t?: string }>
  p?: string
  q?: string
  qi?: string
  use?: string
  x?: string
  y?: string
}

/**
 * A key format, such as {@link spki} or `pem(pkcs8)`.
 *
 * **Details**
 *
 * `~tags` exists only in the types. It records the roles the format holds,
 * whether it can be read and written, and the type of its data: `Uint8Array`
 * for DER, `string` for PEM, and {@link JsonWebKey} for JWK.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Format<R extends Role, D extends Direction, Data> {
  readonly _tag: "spki" | "pkcs8" | "jwk" | "pkcs1" | "sec1"
  readonly pem: boolean
  readonly "~tags"?:
    | {
      readonly role: (_: R) => void
      readonly direction: (_: D) => void
      readonly data: Data
    }
    | undefined
}

/**
 * SubjectPublicKeyInfo DER (RFC 5280), for public keys.
 *
 * @stability unstable
 * @category formats
 * @since 4.0.0
 */
export const spki: Format<"public", Direction, Uint8Array> = { _tag: "spki", pem: false }

/**
 * PKCS#8 PrivateKeyInfo DER (RFC 5208), for private keys.
 *
 * @stability unstable
 * @category formats
 * @since 4.0.0
 */
export const pkcs8: Format<"private", Direction, Uint8Array> = { _tag: "pkcs8", pem: false }

/**
 * JSON Web Key (RFC 7517), for every role.
 *
 * **Details**
 *
 * `decodePublic` rejects a JWK with `d`, and `decodePrivate` requires it.
 * `kty`, `crv`, and `alg` must match the algorithm when present. Written JWKs
 * contain only `kty`, `crv`, and the key material.
 *
 * Ed25519 and X25519 private JWKs need a correct `x`: Bun and Deno accept `d`
 * alone, but other runtimes reject it.
 *
 * @stability unstable
 * @category formats
 * @since 4.0.0
 */
export const jwk: Format<Role, Direction, JsonWebKey> = { _tag: "jwk", pem: false }

/**
 * PKCS#1 RSAPrivateKey DER (RFC 8017), read only.
 *
 * @stability unstable
 * @category formats
 * @since 4.0.0
 */
export const pkcs1: Format<"private", "decode", Uint8Array> = { _tag: "pkcs1", pem: false }

/**
 * SEC1 ECPrivateKey DER (RFC 5915), read only.
 *
 * **Details**
 *
 * The curve parameters, when present, must match the algorithm's curve. The
 * public point must be present.
 *
 * @stability unstable
 * @category formats
 * @since 4.0.0
 */
export const sec1: Format<"private", "decode", Uint8Array> = { _tag: "sec1", pem: false }

/**
 * PEM (RFC 7468) over a DER format.
 *
 * **Details**
 *
 * Reading accepts exactly one block whose label matches the format:
 * `PUBLIC KEY`, `PRIVATE KEY`, `RSA PRIVATE KEY`, or `EC PRIVATE KEY`.
 * Writing uses 64-column lines.
 *
 * @stability unstable
 * @category formats
 * @since 4.0.0
 */
export const pem = <R extends Role, D extends Direction>(
  format: Format<R, D, Uint8Array>
): Format<R, D, string> => ({ _tag: format._tag, pem: true })

/**
 * The algorithms whose public and private keys `KeyFormat` reads and writes.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type AsymmetricAlgorithm = Signature.Algorithm | KeyAgreement.Algorithm | KeyWrap.RsaOaep

/**
 * The algorithms whose secret keys `KeyFormat` reads and writes, and that
 * `KeyWrap` wraps.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type SecretAlgorithm = Aead.Algorithm | Cipher.Algorithm | Mac.Algorithm | KeyWrap.AesKw

/**
 * The public key type of an algorithm.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type PublicKey<A extends AsymmetricAlgorithm = AsymmetricAlgorithm> = A extends Signature.Algorithm
  ? Signature.PublicKey<A>
  : A extends KeyAgreement.Algorithm ? KeyAgreement.PublicKey<A>
  : A extends KeyWrap.RsaOaep ? KeyWrap.PublicKey<A>
  : never

/**
 * The private key type of an algorithm.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type PrivateKey<A extends AsymmetricAlgorithm = AsymmetricAlgorithm> = A extends Signature.Algorithm
  ? Signature.PrivateKey<A>
  : A extends KeyAgreement.Algorithm ? KeyAgreement.PrivateKey<A>
  : A extends KeyWrap.RsaOaep ? KeyWrap.PrivateKey<A>
  : never

/**
 * The secret key type of an algorithm.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type SecretKey<A extends SecretAlgorithm = SecretAlgorithm> = A extends Aead.Algorithm ? Aead.Key<A>
  : A extends Cipher.Algorithm ? Cipher.Key<A>
  : A extends Mac.Algorithm ? Mac.Key<A>
  : A extends KeyWrap.AesKw ? KeyWrap.Key<A>
  : never

/**
 * Any key `KeyFormat` can write.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Key = PublicKey | PrivateKey | SecretKey

/**
 * The role of a key type.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type RoleOf<K extends Key> = K extends PublicKey ? "public" : K extends PrivateKey ? "private" : "secret"

const invalidKey = (method: string, description: string) => internal.invalidKey("KeyFormat", method, description)

const unsupported = (method: string, description: string) =>
  internal.fail("KeyFormat", method, new CryptoError.Unsupported({ description }))

const familyOf = (algorithm: AsymmetricAlgorithm | SecretAlgorithm): Asymmetric.Family | undefined => {
  switch ("_tag" in algorithm ? algorithm._tag : undefined) {
    case "Ed25519":
    case "Ecdsa":
    case "RsaPss":
    case "RsaPkcs1v15":
      return Signature.family
    case "X25519":
    case "Ecdh":
      return KeyAgreement.family
    case "RsaOaep":
      return KeyWrap.family
    default:
      return undefined
  }
}

const labels: Record<Format<Role, Direction, unknown>["_tag"], string> = {
  spki: "PUBLIC KEY",
  pkcs8: "PRIVATE KEY",
  pkcs1: "RSA PRIVATE KEY",
  sec1: "EC PRIVATE KEY",
  jwk: ""
}

const pemPattern = /^-----BEGIN ([A-Z0-9 ]+)-----\r?\n([A-Za-z0-9+/=\r\n]+)-----END ([A-Z0-9 ]+)-----$/

const fromPem = (label: string, text: string): Uint8Array | string => {
  const match = pemPattern.exec(text.trim())
  if (match === null || match[1] !== label || match[3] !== label) {
    return `Expected exactly one PEM block labelled ${label}`
  }
  const der = Base64.decode(match[2].replace(/\r?\n/g, ""))
  return Result.isSuccess(der) ? der.success : `The ${label} PEM block is not valid base64`
}

const toPem = (label: string, der: Uint8Array): string => {
  const base64 = Base64.encode(der)
  const lines: Array<string> = []
  for (let i = 0; i < base64.length; i += 64) lines.push(base64.slice(i, i + 64))
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`
}

// AlgorithmIdentifier for rsaEncryption (1.2.840.113549.1.1.1) with NULL
// parameters, the OIDs of id-ecPublicKey and the NIST curves, and the EC
// AlgorithmIdentifier of each curve.
const rsaEncryption = Uint8Array.of(48, 13, 6, 9, 42, 134, 72, 134, 247, 13, 1, 1, 1, 5, 0)
const ecPublicKey = Uint8Array.of(6, 7, 42, 134, 72, 206, 61, 2, 1)
const curveOids: Record<Asymmetric.Curve, Uint8Array> = {
  "P-256": Uint8Array.of(6, 8, 42, 134, 72, 206, 61, 3, 1, 7),
  "P-384": Uint8Array.of(6, 5, 43, 129, 4, 0, 34),
  "P-521": Uint8Array.of(6, 5, 43, 129, 4, 0, 35)
}
const ecAlgorithm = (curve: Asymmetric.Curve): Uint8Array => Der.encode(Der.sequence, ecPublicKey, curveOids[curve])
const version0 = Uint8Array.of(2, 1, 0)

interface Problem {
  readonly reason: "InvalidKey" | "Unsupported"
  readonly description: string
}

const missingPoint: Problem = {
  reason: "Unsupported",
  description: "EC private keys must include the public point, which Safari cannot import without"
}

// RFC 8017 appendix A.1.2 inside an RFC 5208 PrivateKeyInfo.
const pkcs1ToPkcs8 = (pkcs1: Uint8Array): Uint8Array | Problem =>
  Der.readOnly(pkcs1, Der.sequence) === undefined
    ? { reason: "InvalidKey", description: "Malformed PKCS#1 RSAPrivateKey" }
    : Der.encode(Der.sequence, version0, rsaEncryption, Der.encode(Der.octetString, pkcs1))

// RFC 5915: ECPrivateKey ::= SEQUENCE { version 1, privateKey OCTET STRING,
// [0] parameters OPTIONAL, [1] publicKey OPTIONAL }. PKCS#8 carries the curve
// in its AlgorithmIdentifier, so the `[0]` parameters are dropped.
const sec1ToPkcs8 = (sec1: Uint8Array, curve: Asymmetric.Curve): Uint8Array | Problem => {
  const malformed: Problem = { reason: "InvalidKey", description: "Malformed SEC1 ECPrivateKey" }
  const outer = Der.readOnly(sec1, Der.sequence)
  const fields = outer === undefined ? undefined : Der.children(sec1, outer)
  if (fields === undefined || fields.length < 2) return malformed
  const [version, privateKey, ...rest] = fields
  if (version.tag !== Der.integer || privateKey.tag !== Der.octetString) return malformed
  const params = rest.find((field) => field.tag === 0xa0)
  const point = rest.find((field) => field.tag === 0xa1)
  if (params !== undefined) {
    const oid = Der.read(sec1, params.start, params.end)
    if (oid === undefined || oid.tag !== Der.objectIdentifier || oid.end !== params.end) return malformed
    if (!Der.equals(Der.slice(sec1, oid), curveOids[curve])) {
      return { reason: "InvalidKey", description: `Expected a ${curve} key` }
    }
  }
  if (point === undefined) return missingPoint
  const ecPrivateKey = Der.encode(
    Der.sequence,
    Der.slice(sec1, version),
    Der.slice(sec1, privateKey),
    Der.slice(sec1, point)
  )
  return Der.encode(
    Der.sequence,
    version0,
    ecAlgorithm(curve),
    Der.encode(Der.octetString, ecPrivateKey)
  )
}

// Check the algorithm before classifying a missing EC public point.
// Leave other malformed DER to the runtime's import validation.
const checkEcPkcs8 = (pkcs8: Uint8Array, curve: Asymmetric.Curve): Problem | undefined => {
  const outer = Der.readOnly(pkcs8, Der.sequence)
  const fields = outer === undefined ? undefined : Der.children(pkcs8, outer)
  if (fields === undefined || fields.length < 3) return undefined
  if (!Der.equals(Der.slice(pkcs8, fields[1]), ecAlgorithm(curve))) {
    return { reason: "InvalidKey", description: `Expected a ${curve} EC private key` }
  }
  const octets = fields[2]
  if (octets.tag !== Der.octetString) return undefined
  const inner = Der.read(pkcs8, octets.start, octets.end)
  if (inner === undefined || inner.tag !== Der.sequence) return undefined
  const ecFields = Der.children(pkcs8, inner)
  if (ecFields === undefined) return undefined
  return ecFields.some((field) => field.tag === 0xa1) ? undefined : missingPoint
}

interface Jose {
  readonly kty: string
  readonly crv: string | undefined
  readonly algs: ReadonlyArray<string>
}

const ecdhAlgs = ["ECDH-ES", "ECDH-ES+A128KW", "ECDH-ES+A192KW", "ECDH-ES+A256KW"]

const hashBits = (hash: { readonly name: string }): string => hash.name.slice(4)

const secretAlgs: Record<SecretAlgorithm["name"], string> = {
  aes128Gcm: "A128GCM",
  aes256Gcm: "A256GCM",
  chacha20Poly1305: "C20P",
  xchacha20Poly1305: "XC20P",
  aes128Ctr: "A128CTR",
  aes256Ctr: "A256CTR",
  aes128Cbc: "A128CBC",
  aes256Cbc: "A256CBC",
  hmacSha1: "HS1",
  hmacSha256: "HS256",
  hmacSha384: "HS384",
  hmacSha512: "HS512",
  aes128Kw: "A128KW",
  aes256Kw: "A256KW"
}

const joseOf = (algorithm: AsymmetricAlgorithm | SecretAlgorithm): Jose => {
  if (!("_tag" in algorithm) || algorithm._tag === "AesKw") {
    return { kty: "oct", crv: undefined, algs: [secretAlgs[algorithm.name]] }
  }
  switch (algorithm._tag) {
    case "Ed25519":
      return { kty: "OKP", crv: "Ed25519", algs: ["EdDSA", "Ed25519"] }
    case "X25519":
      return { kty: "OKP", crv: "X25519", algs: ecdhAlgs }
    case "Ecdsa":
      return { kty: "EC", crv: algorithm.namedCurve, algs: [`ES${hashBits(algorithm.hash)}`] }
    case "Ecdh":
      return { kty: "EC", crv: algorithm.namedCurve, algs: ecdhAlgs }
    case "RsaPss":
      return { kty: "RSA", crv: undefined, algs: [`PS${hashBits(algorithm.hash)}`] }
    case "RsaPkcs1v15":
      return { kty: "RSA", crv: undefined, algs: [`RS${hashBits(algorithm.hash)}`] }
    case "RsaOaep":
      return {
        kty: "RSA",
        crv: undefined,
        algs: [algorithm.hash.name === "SHA-1" ? "RSA-OAEP" : `RSA-OAEP-${hashBits(algorithm.hash)}`]
      }
  }
}

const publicMembers = ["kty", "crv", "x", "y", "n", "e"] as const
const privateMembers = [...publicMembers, "d", "p", "q", "dp", "dq", "qi"] as const

const pick = (jwk: JsonWebKey, members: ReadonlyArray<string>): JsonWebKey => {
  const out: Record<string, unknown> = {}
  for (const member of members) {
    const value = (jwk as Record<string, unknown>)[member]
    if (value !== undefined) out[member] = value
  }
  return out as JsonWebKey
}

// Validate the algorithm and role, then drop JOSE metadata that could reject
// an otherwise valid import (`use`, `key_ops`, `ext`).
const checkJwk = (data: unknown, algorithm: AsymmetricAlgorithm | SecretAlgorithm, role: Role): JsonWebKey | string => {
  if (!Predicate.isObject(data)) return "Expected a JWK object"
  const expected = joseOf(algorithm)
  if (data.kty !== undefined && data.kty !== expected.kty) {
    return `Expected a JWK with kty ${expected.kty}, not ${String(data.kty)}`
  }
  if (data.crv !== undefined && data.crv !== expected.crv) {
    return expected.crv === undefined
      ? `Expected a JWK without crv, not ${String(data.crv)}`
      : `Expected a JWK with crv ${expected.crv}, not ${String(data.crv)}`
  }
  if (data.alg !== undefined && !expected.algs.includes(data.alg as string)) {
    return `Expected a JWK with alg ${expected.algs.join(" or ")}, not ${String(data.alg)}`
  }
  switch (role) {
    case "public":
      if (data.d !== undefined) return "A public JWK cannot contain d"
      return pick({ ...data, kty: expected.kty }, publicMembers)
    case "private":
      if (typeof data.d !== "string") return "A private JWK must contain d"
      return pick({ ...data, kty: expected.kty }, privateMembers)
    case "secret":
      if (typeof data.k !== "string") return "A secret JWK must contain k"
      return { kty: "oct", k: data.k }
  }
}

const decodeAsymmetric = <K>(
  method: string,
  role: "public" | "private",
  format: Format<Role, Direction, unknown>,
  algorithm: AsymmetricAlgorithm,
  data: unknown
): Effect.Effect<K, CryptoError.CryptoError> =>
  Effect.suspend(() => {
    const family = familyOf(algorithm)
    if (family === undefined) return invalidKey(method, "Expected an asymmetric algorithm")
    const spec = family.specOf(algorithm)

    let input: { readonly format: "spki" | "pkcs8" | "jwk"; readonly data: BufferSource | JsonWebKey }
    if (format._tag === "jwk") {
      const checked = checkJwk(data, algorithm, role)
      if (typeof checked === "string") return invalidKey(method, checked)
      input = { format: "jwk", data: checked }
    } else {
      let der: Uint8Array
      if (format.pem) {
        if (typeof data !== "string") return invalidKey(method, "Expected PEM text")
        const decoded = fromPem(labels[format._tag], data)
        if (typeof decoded === "string") return invalidKey(method, decoded)
        der = decoded
      } else {
        if (!(data instanceof Uint8Array)) return invalidKey(method, "Expected DER bytes as a Uint8Array")
        der = KeyModel.copyBytes(data)
      }
      let converted: Uint8Array | Problem = der
      if (format._tag === "pkcs1") {
        converted = spec.publicFormat === "spki"
          ? pkcs1ToPkcs8(der)
          : { reason: "InvalidKey", description: "PKCS#1 holds RSA private keys only" }
      } else if (format._tag === "sec1") {
        converted = algorithm._tag === "Ecdsa" || algorithm._tag === "Ecdh"
          ? sec1ToPkcs8(der, algorithm.namedCurve)
          : { reason: "InvalidKey", description: "SEC1 holds EC private keys only" }
      } else if (format._tag === "pkcs8" && (algorithm._tag === "Ecdsa" || algorithm._tag === "Ecdh")) {
        converted = checkEcPkcs8(der, algorithm.namedCurve) ?? der
      }
      if (!(converted instanceof Uint8Array)) {
        return converted.reason === "Unsupported"
          ? unsupported(method, converted.description)
          : invalidKey(method, converted.description)
      }
      input = { format: format._tag === "spki" ? "spki" : "pkcs8", data: converted as BufferSource }
    }

    return internal.runWithReference("KeyFormat", method, algorithm.name, async (subtle) => {
      const usages = role === "private" ? spec.privateUsages : spec.publicUsages
      const cryptoKey = input.format === "jwk"
        ? await subtle.importKey("jwk", input.data as JsonWebKey, spec.importParams, true, [...usages])
        : await subtle.importKey(input.format, input.data as BufferSource, spec.importParams, true, [...usages])
      return KeyModel.makeBytes<K>(
        role === "private" ? family.privateKeyProto : family.publicKeyProto,
        KeyModel.importedAlgorithm(algorithm, cryptoKey),
        await Asymmetric.exportKey(subtle, cryptoKey, spec, role)
      )
    })
  })

/**
 * Decodes a public key.
 *
 * **Details**
 *
 * The format must hold public keys: {@link spki}, {@link jwk}, or
 * `pem(spki)`. The key is imported on the `WebCrypto` reference and stored as
 * bytes. Malformed data, a key of another algorithm or curve, or a JWK with
 * `d` fails with an `InvalidKey` reason.
 *
 * **Example** (Reading a PEM public key)
 *
 * ```ts
 * import { Effect } from "effect"
 * import { KeyFormat, Signature } from "effect/crypto"
 *
 * declare const text: string
 *
 * const publicKey = KeyFormat.decodePublic(KeyFormat.pem(KeyFormat.spki), Signature.ecdsaP256, text)
 * ```
 *
 * @stability unstable
 * @category decoding
 * @since 4.0.0
 */
export const decodePublic = <A extends AsymmetricAlgorithm, Data>(
  format: Format<"public", "decode", Data>,
  algorithm: A,
  data: NoInfer<Data>
): Effect.Effect<PublicKey<A>, CryptoError.CryptoError> =>
  decodeAsymmetric("decodePublic", "public", format as Format<Role, Direction, unknown>, algorithm, data)

/**
 * Decodes a private key.
 *
 * **Details**
 *
 * The format must hold private keys: {@link pkcs8}, {@link jwk},
 * {@link pkcs1}, {@link sec1}, or their PEM forms. PKCS#1 and SEC1 are
 * converted to PKCS#8 before the import. Malformed data, a key of another
 * algorithm or curve, or a JWK without `d` fails with an `InvalidKey` reason.
 * An EC private key without its public point fails with an `Unsupported`
 * reason on every runtime, because Safari and Firefox before 132 cannot import
 * it.
 *
 * @stability unstable
 * @category decoding
 * @since 4.0.0
 */
export const decodePrivate = <A extends AsymmetricAlgorithm, Data>(
  format: Format<"private", "decode", Data>,
  algorithm: A,
  data: NoInfer<Data>
): Effect.Effect<PrivateKey<A>, CryptoError.CryptoError> =>
  decodeAsymmetric("decodePrivate", "private", format as Format<Role, Direction, unknown>, algorithm, data)

/**
 * Decodes a secret key from a JWK.
 *
 * **Details**
 *
 * The JWK must have `kty` `oct` when `kty` is present, and an `alg` matching
 * the algorithm when `alg` is present. The key bytes go through the family's
 * raw constructor, so a wrong length fails with an `InvalidKey` reason.
 * Secret keys never touch `crypto.subtle` here.
 *
 * @stability unstable
 * @category decoding
 * @since 4.0.0
 */
export const decodeSecret = <A extends SecretAlgorithm, Data>(
  format: Format<"secret", "decode", Data>,
  algorithm: A,
  data: NoInfer<Data>
): Effect.Effect<SecretKey<A>, CryptoError.CryptoError> =>
  Effect.suspend(() => {
    if (format._tag !== "jwk") return invalidKey("decodeSecret", "Secret keys are only read from JWK")
    const checked = checkJwk(data, algorithm, "secret")
    if (typeof checked === "string") return invalidKey("decodeSecret", checked)
    const bytes = Base64Url.decode(checked.k!)
    if (Result.isFailure(bytes)) return invalidKey("decodeSecret", "The JWK k member is not valid base64url")
    return KeyWrap.secretFamily(algorithm).key(algorithm, bytes.success).pipe(
      Effect.catch(internal.rehome("KeyFormat", "decodeSecret"))
    ) as Effect.Effect<SecretKey<A>, CryptoError.CryptoError>
  })

const encodeAsymmetric = (
  format: Format<Role, Direction, unknown>,
  key: PublicKey | PrivateKey,
  family: Asymmetric.Family
): Effect.Effect<Uint8Array | JsonWebKey, CryptoError.CryptoError> =>
  Effect.suspend((): Effect.Effect<Uint8Array | JsonWebKey, CryptoError.CryptoError> => {
    const spec = family.specOf(key.algorithm)
    const role = family.isPrivateKey(key) ? "private" : "public"
    const stored = KeyModel.material(key)
    if (stored._tag === "CryptoKey" && !stored.cryptoKey.extractable) {
      return internal.notExtractable("KeyFormat", "encode")
    }
    const target = format._tag === "jwk" ? "jwk" : format._tag === "spki" ? "spki" : "pkcs8"
    if (stored._tag === "Bytes") {
      // RSA keys and EC private keys are stored in the format asked for.
      if (target === "pkcs8" && role === "private" && spec.seedPrefix === undefined) {
        return Effect.succeed(KeyModel.copyBytes(stored.bytes))
      }
      if (target === "spki" && role === "public" && spec.publicFormat === "spki") {
        return Effect.succeed(KeyModel.copyBytes(stored.bytes))
      }
    }
    return internal.runWithReference("KeyFormat", "encode", key.algorithm.name, async (subtle) => {
      const cryptoKey = stored._tag === "CryptoKey"
        ? stored.cryptoKey
        : role === "private"
        ? await Asymmetric.importPrivate(subtle, stored.bytes, spec, true)
        : await Asymmetric.importPublic(subtle, stored.bytes, spec)
      if (target === "jwk") {
        return pick(await subtle.exportKey("jwk", cryptoKey), role === "private" ? privateMembers : publicMembers)
      }
      return new Uint8Array(await subtle.exportKey(target, cryptoKey))
    })
  })

/**
 * Encodes a key in a format.
 *
 * **Details**
 *
 * The format must hold the key's role and be writable: {@link spki} for
 * public keys, {@link pkcs8} for private keys, {@link jwk} for every role,
 * and the PEM forms of SPKI and PKCS#8. PKCS#1 and SEC1 cannot be written.
 *
 * PEM output uses 64-column lines. JWK output contains only `kty`, `crv`, and
 * the key material. A non-extractable `CryptoKey`-backed key fails with a
 * `NotExtractable` reason.
 *
 * **Example** (Writing a public key as JWK)
 *
 * ```ts import.meta.vitest
 * import { Effect, Layer } from "effect"
 * import { KeyFormat, SecureRandom, Signature } from "effect/crypto"
 *
 * const program = Effect.gen(function*() {
 *   const signature = yield* Signature.Signature
 *   const { publicKey } = yield* signature.generateKeyPair(Signature.ed25519)
 *   const jwk = yield* KeyFormat.encode(KeyFormat.jwk, publicKey)
 *   return [jwk.kty, jwk.crv]
 * })
 *
 * const layer = Signature.layerWebCrypto.pipe(Layer.provide(SecureRandom.layerWebCrypto))
 * await Effect.runPromise(program.pipe(Effect.provide(layer))) // => ["OKP", "Ed25519"]
 * ```
 *
 * @stability unstable
 * @category encoding
 * @since 4.0.0
 */
export const encode = <K extends Key, Data>(
  format: Format<RoleOf<K>, "encode", Data>,
  key: K
): Effect.Effect<Data, CryptoError.CryptoError> => {
  const generic = format as Format<Role, Direction, unknown>
  const family = familyOf(key.algorithm)
  const encoded: Effect.Effect<Uint8Array | JsonWebKey, CryptoError.CryptoError> = family !== undefined
    ? encodeAsymmetric(generic, key as PublicKey | PrivateKey, family)
    : generic._tag !== "jwk"
    ? invalidKey("encode", "Secret keys are only written as JWK")
    : KeyWrap.secretFamily(key.algorithm as SecretAlgorithm).toBytes(key).pipe(
      Effect.catch(internal.rehome("KeyFormat", "encode")),
      Effect.map((bytes): JsonWebKey => ({ kty: "oct", k: Base64Url.encode(bytes) }))
    )
  return (generic.pem
    ? Effect.map(encoded, (der) => toPem(labels[generic._tag], der as Uint8Array))
    : encoded) as Effect.Effect<Data, CryptoError.CryptoError>
}
