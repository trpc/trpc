import * as Effect from "../../Effect.ts"
import * as Predicate from "../../Predicate.ts"
import * as CryptoError from "../CryptoError.ts"
import type * as SecureRandom from "../SecureRandom.ts"
import type * as WebCrypto from "../WebCrypto.ts"
import * as KeyModel from "./key.ts"
import * as internal from "./webCrypto.ts"

/**
 * WebCrypto parameters and stored key formats for an asymmetric algorithm.
 *
 * @internal
 */
export interface Spec {
  /** The WebCrypto algorithm name, which a `CryptoKey` must also have. */
  readonly name: string
  readonly importParams: AlgorithmIdentifier | EcKeyImportParams | RsaHashedImportParams
  readonly privateUsages: ReadonlyArray<KeyUsage>
  readonly publicUsages: ReadonlyArray<KeyUsage>
  /**
   * The fixed PKCS#8 prefix of an Ed25519 or X25519 key, whose private keys
   * hold the bare 32-byte seed. Other private keys hold PKCS#8.
   */
  readonly seedPrefix: Uint8Array | undefined
  /** `raw` for Ed25519, X25519 and EC points, `spki` for RSA. */
  readonly publicFormat: "raw" | "spki"
  /** Checks the curve or hash of a `CryptoKey`'s algorithm. */
  readonly check?: ((algorithm: KeyAlgorithm) => string | undefined) | undefined
}

/**
 * WebCrypto mappings and key prototypes for an asymmetric family.
 *
 * @internal
 */
export interface Family {
  readonly module: string
  readonly specOf: (algorithm: any) => Spec
  readonly privateKeyProto: object
  readonly publicKeyProto: object
  readonly isPrivateKey: (u: unknown) => boolean
}

/** @internal */
export type Role = "private" | "public"

// RFC 8410: the PKCS#8 encoding of a 32-byte Ed25519 or X25519 private key is
// this prefix, ending in the algorithm's OID byte, followed by the key.
const seedPrefix = (oid: number): Uint8Array => Uint8Array.of(48, 46, 2, 1, 0, 48, 5, 6, 3, 43, 101, oid, 4, 34, 4, 32)

/** @internal */
export const ed25519Prefix = seedPrefix(112)

/** @internal */
export const x25519Prefix = seedPrefix(110)

const seedLength = 32

/** @internal */
export type Curve = "P-256" | "P-384" | "P-521"

/**
 * Coordinate sizes in bytes, which are also the sizes of an ECDSA signature's
 * `r` and `s` and of an ECDH shared secret.
 *
 * @internal
 */
export const coordinateSizes: Record<Curve, number> = { "P-256": 32, "P-384": 48, "P-521": 66 }

/**
 * Checks raw Ed25519 or X25519 key length, with guidance for 64-byte seeds.
 *
 * @internal
 */
export const checkSeedLength = (name: string, role: Role) => (bytes: Uint8Array): string | undefined => {
  if (bytes.length === seedLength) return undefined
  if (role === "private" && bytes.length === 64) {
    return `Expected the 32-byte ${name} seed, not the 64-byte seed‖public key form: pass its first 32 bytes`
  }
  return `Expected a ${seedLength}-byte ${name} ${role} key, not ${bytes.length} bytes`
}

/**
 * Checks the encoding of a raw EC public key: an uncompressed SEC1 point,
 * `0x04` followed by both coordinates. Whether the point is on the curve is
 * checked when the key is first used.
 *
 * @internal
 */
export const checkPoint = (curve: Curve) => (bytes: Uint8Array): string | undefined => {
  const length = 1 + 2 * coordinateSizes[curve]
  if (bytes.length !== length) return `Expected a ${length}-byte uncompressed ${curve} point, not ${bytes.length} bytes`
  return bytes[0] === 4 ? undefined : `Expected an uncompressed ${curve} point, starting with 0x04`
}

/** @internal */
export const checkNamedCurve = (curve: Curve) => (algorithm: KeyAlgorithm): string | undefined => {
  const namedCurve = (algorithm as EcKeyAlgorithm).namedCurve
  return namedCurve === curve ? undefined : `Expected a ${curve} key, not ${namedCurve}`
}

/** @internal */
export const checkHash = (hash: string) => (algorithm: KeyAlgorithm): string | undefined => {
  const keyHash = (algorithm as RsaHashedKeyAlgorithm).hash?.name
  return keyHash === hash ? undefined : `Expected a key for ${hash}, not ${keyHash}`
}

/** @internal */
export const rsaGenerateParams = (spec: Spec, modulusLength: number): RsaHashedKeyGenParams => ({
  ...spec.importParams as RsaHashedImportParams,
  modulusLength,
  publicExponent: Uint8Array.of(1, 0, 1)
})

/**
 * Synchronously validates and wraps a `CryptoKey`.
 *
 * @internal
 */
export const fromCryptoKey = <K>(
  family: Family,
  method: string,
  algorithm: unknown,
  role: Role,
  cryptoKey: WebCrypto.CryptoKey
): Effect.Effect<K, CryptoError.CryptoError> => {
  const spec = family.specOf(algorithm)
  return KeyModel.fromCryptoKey(
    family.module,
    method,
    role === "private" ? family.privateKeyProto : family.publicKeyProto,
    algorithm,
    cryptoKey,
    {
      type: role,
      name: spec.name,
      usages: role === "private" ? spec.privateUsages : spec.publicUsages,
      usagePolicy: "all",
      check: spec.check
    }
  )
}

const concat = (prefix: Uint8Array, bytes: Uint8Array): Uint8Array => {
  const out = new Uint8Array(prefix.length + bytes.length)
  out.set(prefix)
  out.set(bytes, prefix.length)
  return out
}

/** @internal */
export const importPrivate = (
  subtle: SubtleCrypto,
  bytes: Uint8Array,
  spec: Spec,
  extractable: boolean
): Promise<CryptoKey> =>
  subtle.importKey(
    "pkcs8",
    (spec.seedPrefix === undefined ? bytes : concat(spec.seedPrefix, bytes)) as BufferSource,
    spec.importParams,
    extractable,
    spec.privateUsages as Array<KeyUsage>
  )

/** @internal */
export const importPublic = (subtle: SubtleCrypto, bytes: Uint8Array, spec: Spec): Promise<CryptoKey> =>
  subtle.importKey(
    spec.publicFormat,
    bytes as BufferSource,
    spec.importParams,
    true,
    spec.publicUsages as Array<KeyUsage>
  )

/**
 * Exports a private `CryptoKey` to its stored form: the seed for Ed25519 and
 * X25519, PKCS#8 otherwise. A seed export in another PKCS#8 form is one the
 * layer cannot read, so it fails with `Unsupported`.
 */
const exportPrivate = async (subtle: SubtleCrypto, cryptoKey: CryptoKey, spec: Spec): Promise<Uint8Array> => {
  const pkcs8 = new Uint8Array(await subtle.exportKey("pkcs8", cryptoKey))
  const prefix = spec.seedPrefix
  if (prefix === undefined) return pkcs8
  if (pkcs8.length !== prefix.length + seedLength || !prefix.every((byte, i) => pkcs8[i] === byte)) {
    throw new internal.Failure(
      new CryptoError.Unsupported({ description: `${spec.name} private key was exported in an unexpected PKCS#8 form` })
    )
  }
  return pkcs8.slice(prefix.length)
}

const exportPublic = async (subtle: SubtleCrypto, cryptoKey: CryptoKey, spec: Spec): Promise<Uint8Array> =>
  new Uint8Array(await subtle.exportKey(spec.publicFormat, cryptoKey))

/** @internal */
export const exportKey = (subtle: SubtleCrypto, cryptoKey: CryptoKey, spec: Spec, role: Role): Promise<Uint8Array> =>
  role === "private" ? exportPrivate(subtle, cryptoKey, spec) : exportPublic(subtle, cryptoKey, spec)

/**
 * Exports a key's stored representation as fresh bytes, reading the
 * `WebCrypto` reference for `CryptoKey`-backed keys.
 *
 * @internal
 */
export const toBytes = (
  family: Family,
  key: { readonly algorithm: { readonly name: string } }
): Effect.Effect<Uint8Array, CryptoError.CryptoError> =>
  KeyModel.toBytes(
    family.module,
    key,
    (subtle, cryptoKey) =>
      exportKey(subtle, cryptoKey, family.specOf(key.algorithm), family.isPrivateKey(key) ? "private" : "public")
  )

/**
 * Per-layer caches for imported byte-backed keys.
 *
 * @internal
 */
export const makeCaches = (family: Family) => ({
  privateKey: KeyModel.makeCache((subtle, bytes, algorithm) =>
    importPrivate(subtle, bytes, family.specOf(algorithm), false)
  ),
  publicKey: KeyModel.makeCache((subtle, bytes, algorithm) => importPublic(subtle, bytes, family.specOf(algorithm)))
})

/**
 * Computes the stored public key of an extractable private `CryptoKey`.
 *
 * WebCrypto cannot derive a public key directly, but a private key's JWK
 * export carries the public members, which import as a public key.
 */
const publicOf = async (subtle: SubtleCrypto, privateKey: CryptoKey, spec: Spec): Promise<Uint8Array> => {
  const { d, p, q, dp, dq, qi, oth, key_ops, ext, alg, ...jwk } = await subtle.exportKey("jwk", privateKey)
  const publicKey = await subtle.importKey("jwk", jwk, spec.importParams, true, spec.publicUsages as Array<KeyUsage>)
  return exportPublic(subtle, publicKey, spec)
}

/**
 * Generates a key pair in its stored forms. Ed25519 and X25519 private keys
 * are 32 bytes from `SecureRandom`, so a seeded `SecureRandom` reproduces
 * them. EC and RSA keys come from WebCrypto's own randomness.
 *
 * @internal
 */
export const generateKeyPair = <KP>(
  family: Family,
  crypto: Crypto | undefined,
  random: SecureRandom.SecureRandom["Service"],
  algorithm: { readonly name: string },
  params: AlgorithmIdentifier | EcKeyGenParams | RsaHashedKeyGenParams
): Effect.Effect<KP, CryptoError.CryptoError> => {
  const spec = family.specOf(algorithm)
  const generate = async (subtle: SubtleCrypto, seed: Uint8Array | undefined) => {
    if (seed !== undefined) {
      const privateKey = await importPrivate(subtle, seed, spec, true)
      return { privateKey: seed, publicKey: await publicOf(subtle, privateKey, spec) }
    }
    const usages = [...new Set([...spec.privateUsages, ...spec.publicUsages])]
    const pair = await subtle.generateKey(params, true, usages) as CryptoKeyPair
    return {
      privateKey: await exportPrivate(subtle, pair.privateKey, spec),
      publicKey: await exportPublic(subtle, pair.publicKey, spec)
    }
  }
  return Effect.flatMap(
    spec.seedPrefix === undefined ? Effect.undefined : random.randomBytes(seedLength),
    (seed) =>
      Effect.map(
        internal.run(family.module, "generateKeyPair", algorithm.name, crypto, (subtle) => generate(subtle, seed)),
        ({ privateKey, publicKey }) =>
          ({
            privateKey: KeyModel.makeBytes(family.privateKeyProto, algorithm, privateKey),
            publicKey: KeyModel.makeBytes(family.publicKeyProto, algorithm, publicKey)
          }) as KP
      )
  )
}

/**
 * Computes the public key of a private key, failing with `NotExtractable`
 * for a non-extractable `CryptoKey`, whose public members cannot be read.
 *
 * @internal
 */
export const publicKeyOf = <K>(
  family: Family,
  crypto: Crypto | undefined,
  privateKey: { readonly algorithm: { readonly name: string } }
): Effect.Effect<K, CryptoError.CryptoError> =>
  Effect.suspend(() => {
    const stored = KeyModel.material(privateKey)
    if (stored._tag === "CryptoKey" && !stored.cryptoKey.extractable) {
      return internal.notExtractable(family.module, "publicKeyOf")
    }
    const spec = family.specOf(privateKey.algorithm)
    return Effect.map(
      internal.run(family.module, "publicKeyOf", privateKey.algorithm.name, crypto, async (subtle) =>
        publicOf(
          subtle,
          stored._tag === "CryptoKey" ? stored.cryptoKey : await importPrivate(subtle, stored.bytes, spec, true),
          spec
        )),
      (bytes) => KeyModel.makeBytes<K>(family.publicKeyProto, privateKey.algorithm, bytes)
    )
  })

/**
 * Deno imports raw EC points that are not on the curve and rejects them with
 * a `TypeError` when the key is used. For a byte-backed public key only the
 * key can cause that, so it is `InvalidKey`. Any other `TypeError`, such as a
 * `CryptoKey` from another `Crypto` object, stays a defect.
 *
 * @internal
 */
export const publicKeyError = (
  module: string,
  method: string,
  publicKey: { readonly algorithm: { readonly name: string } },
  cause: unknown
): CryptoError.CryptoError =>
  KeyModel.material(publicKey)._tag === "Bytes" && Predicate.hasProperty(cause, "name") && cause.name === "TypeError"
    ? new CryptoError.CryptoError({
      module,
      method,
      reason: new CryptoError.InvalidKey({ description: "Invalid public key", cause })
    })
    : internal.webCryptoError(module, method, publicKey.algorithm.name, cause)
