/**
 * Compact JSON Web Signatures.
 *
 * The signing algorithm is the key's: {@link sign} writes it into the
 * protected header and {@link verify} rejects a token whose `alg` differs.
 * {@link verifyWithKeySet} resolves the key from the `Jwks` service and
 * requires an allowlist of asymmetric algorithms. Headers with `crit` or `b64`
 * are rejected.
 *
 * Bound untrusted token length before verification; this module does not
 * impose a token-size limit.
 *
 * HMAC signatures run on the `Mac` service. On Node.js and Bun,
 * `NodeCrypto.layerMac` and `BunCrypto.layerMac` compute them synchronously
 * with `node:crypto` instead of through Web Crypto for byte-backed keys, such
 * as those from `Jwk.importSecret`.
 *
 * @stability unstable
 * @since 4.1.1
 */
import * as Mac from "../crypto/Mac.ts"
import * as Signature from "../crypto/Signature.ts"
import * as Effect from "../Effect.ts"
import * as Base64Url from "../encoding/Base64Url.ts"
import * as Redacted from "../Redacted.ts"
import * as Schema from "../Schema.ts"
import {
  cryptoFailure,
  decodeHeader,
  decodeSegment,
  encodeHeader,
  fail,
  invalidArgument,
  invalidToken,
  split,
  utf8
} from "./internal/compact.ts"
import * as JoseError from "./JoseError.ts"
import {
  Algorithm,
  AsymmetricAlgorithm,
  type HmacAlgorithm,
  type PublicKey,
  type SecretKey,
  type SigningKey,
  type VerificationKey
} from "./Jwk.ts"
import { Jwks } from "./Jwks.ts"

/**
 * Schema for an authenticated JWS protected header, including additional
 * JSON-valued parameters.
 *
 * @stability unstable
 * @category schemas
 * @since 4.1.1
 */
export const ProtectedHeader = Schema.StructWithRest(
  Schema.Struct({
    alg: Algorithm,
    kid: Schema.optionalKey(Schema.String),
    typ: Schema.optionalKey(Schema.String),
    cty: Schema.optionalKey(Schema.String)
  }),
  [Schema.Record(Schema.String, Schema.Json)]
)

/**
 * An authenticated JWS protected header.
 *
 * @stability unstable
 * @category models
 * @since 4.1.1
 */
export type ProtectedHeader = typeof ProtectedHeader.Type

/**
 * Standard header parameters to sign. Signing also accepts additional
 * JSON-valued parameters. `alg` comes from the key and `kid` defaults to the
 * key's.
 *
 * @stability unstable
 * @category models
 * @since 4.1.1
 */
export interface Header {
  readonly alg?: never
  readonly crit?: never
  readonly b64?: never
  readonly kid?: string | undefined
  readonly typ?: string | undefined
  readonly cty?: string | undefined
}

/**
 * The protected header and payload of a verified JWS.
 *
 * @stability unstable
 * @category models
 * @since 4.1.1
 */
export interface Verified {
  readonly protectedHeader: ProtectedHeader
  readonly payload: Uint8Array
}

/**
 * Options for {@link verifyWithKeySet}.
 *
 * @stability unstable
 * @category models
 * @since 4.1.1
 */
export interface VerifyWithKeySetOptions {
  /**
   * The algorithms a token may use. Must not be empty.
   */
  readonly algorithms: ReadonlyArray<AsymmetricAlgorithm>
}

/**
 * Services required to sign and verify with any key.
 *
 * @stability unstable
 * @category models
 * @since 4.1.1
 */
export type Requirements = Mac.Mac | Signature.Signature

/**
 * Services required to sign or verify with a key of type `K`: `Mac` for
 * HMAC keys and `Signature` for asymmetric keys. A union of key types
 * requires both.
 *
 * @stability unstable
 * @category models
 * @since 4.1.1
 */
export type KeyRequirements<K extends SigningKey | VerificationKey> = K extends SecretKey<HmacAlgorithm> ? Mac.Mac
  : Signature.Signature

const decodeProtectedHeader = Schema.decodeUnknownOption(ProtectedHeader)

interface Parsed {
  readonly protectedHeader: ProtectedHeader
  readonly payload: Uint8Array
  readonly signature: Uint8Array
  readonly signingInput: Uint8Array
}

/**
 * Parses a compact JWS without verifying it.
 *
 * @internal
 */
export const parse = Effect.fnUntraced(function*(
  token: string | Redacted.Redacted<string>
): Effect.fn.Return<Parsed, JoseError.JoseError> {
  const [header, payload, signature] = yield* split(token, 3)
  const protectedHeader = yield* decodeHeader(header, decodeProtectedHeader, ["crit", "b64"])
  const payloadBytes = decodeSegment(payload)
  const signatureBytes = decodeSegment(signature)
  if (payloadBytes === undefined || signatureBytes === undefined) {
    return yield* invalidToken("The payload or signature is not base64url")
  }
  return {
    protectedHeader,
    payload: payloadBytes,
    signature: signatureBytes,
    signingInput: utf8(`${header}.${payload}`)
  }
})

const signFailure = cryptoFailure("Could not sign with the key")
const verifyFailure = cryptoFailure("Could not verify with the key")

const isAsymmetricAlgorithm = Schema.is(AsymmetricAlgorithm)

const algorithmNotAllowed = fail(new JoseError.AlgorithmNotAllowed())

const authenticated = (parsed: Parsed, valid: boolean): Effect.Effect<Verified, JoseError.JoseError> =>
  valid
    ? Effect.succeed({ protectedHeader: parsed.protectedHeader, payload: parsed.payload })
    : fail(new JoseError.SignatureVerificationFailed())

const verifySignature = Effect.fnUntraced(function*(
  parsed: Parsed,
  key: PublicKey
): Effect.fn.Return<Verified, JoseError.JoseError, Signature.Signature> {
  const signature = yield* Signature.Signature
  const valid = yield* signature.verify(key.key, parsed.signature, parsed.signingInput).pipe(
    Effect.mapError(verifyFailure)
  )
  return yield* authenticated(parsed, valid)
})

/**
 * Signs a payload as a compact JWS with the key's algorithm.
 *
 * **Example** (Signing and verifying a payload)
 *
 * ```ts import.meta.vitest
 * import { Effect, Layer, Redacted } from "effect"
 * import { Mac, SecureRandom, Signature } from "effect/crypto"
 * import { Jwk, Jws } from "effect/jose"
 *
 * const layer = Layer.mergeAll(Mac.layerWebCrypto, Signature.layerWebCrypto).pipe(
 *   Layer.provide(SecureRandom.layerWebCrypto)
 * )
 *
 * const payload = await Effect.runPromise(Effect.gen(function*() {
 *   // Fixed public example material; generate application secrets securely.
 *   const key = yield* Jwk.importSecret(
 *     Redacted.make({ kty: "oct", k: "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc" } as const),
 *     "HS256"
 *   )
 *   const token = yield* Jws.sign(new TextEncoder().encode("hello"), key)
 *   const verified = yield* Jws.verify(token, key)
 *   return new TextDecoder().decode(verified.payload)
 * }).pipe(Effect.provide(layer)))
 * payload // => "hello"
 * ```
 *
 * @see {@link verify}
 *
 * @stability unstable
 * @category cryptography
 * @since 4.1.1
 */
export const sign: <
  K extends SigningKey,
  H extends object & { readonly [P in keyof H]: Schema.Json | undefined } = Header
>(
  payload: Uint8Array,
  key: K,
  header?: Header & H
) => Effect.Effect<Redacted.Redacted<string>, JoseError.JoseError, KeyRequirements<K>> = Effect.fnUntraced(function*(
  payload: Uint8Array,
  key: SigningKey,
  header?: Header
): Effect.fn.Return<Redacted.Redacted<string>, JoseError.JoseError, Requirements> {
  const protectedHeader = yield* encodeHeader({ alg: key.algorithm }, key.kid, header, ["crit", "b64"])
  const signingInput = `${protectedHeader}.${Base64Url.encode(payload)}`
  const data = utf8(signingInput)
  let signature: Uint8Array
  if (key._tag === "SecretKey") {
    const mac = yield* Mac.Mac
    signature = yield* mac.sign(key.key, data).pipe(Effect.mapError(signFailure))
  } else {
    const signer = yield* Signature.Signature
    signature = yield* signer.sign(key.key, data).pipe(Effect.mapError(signFailure))
  }
  return Redacted.make(`${signingInput}.${Base64Url.encode(signature)}`)
}) as any // Each branch uses only the service its key type requires.

/**
 * Verifies a compact JWS with a key. The token's `alg` must be the key's
 * algorithm.
 *
 * @see {@link sign}
 * @see {@link verifyWithKeySet} for resolving the key from the `Jwks` service
 *
 * @stability unstable
 * @category cryptography
 * @since 4.1.1
 */
export const verify: <K extends VerificationKey>(
  token: string | Redacted.Redacted<string>,
  key: K
) => Effect.Effect<Verified, JoseError.JoseError, KeyRequirements<K>> = Effect.fnUntraced(function*(
  token: string | Redacted.Redacted<string>,
  key: VerificationKey
): Effect.fn.Return<Verified, JoseError.JoseError, Requirements> {
  const parsed = yield* parse(token)
  if (parsed.protectedHeader.alg !== key.algorithm) return yield* algorithmNotAllowed
  if (key._tag === "PublicKey") return yield* verifySignature(parsed, key)
  const mac = yield* Mac.Mac
  const valid = yield* mac.verify(key.key, parsed.signature, parsed.signingInput).pipe(
    Effect.mapError(verifyFailure)
  )
  return yield* authenticated(parsed, valid)
}) as any // Each branch uses only the service its key type requires.

/**
 * Verifies a compact JWS with a public key resolved from the `Jwks` service by
 * the token's `alg` and `kid`.
 *
 * **Details**
 *
 * The token's `alg` must be in `algorithms`, which is checked before any key
 * lookup. The resolved key's algorithm must match the token's. HMAC tokens
 * are always rejected.
 *
 * @see {@link verify} for verifying with a known key
 *
 * @stability unstable
 * @category cryptography
 * @since 4.1.1
 */
export const verifyWithKeySet = Effect.fnUntraced(function*(
  token: string | Redacted.Redacted<string>,
  options: VerifyWithKeySetOptions
): Effect.fn.Return<Verified & { readonly key: PublicKey }, JoseError.JoseError, Jwks | Signature.Signature> {
  if (options.algorithms.length === 0) return yield* invalidArgument("algorithms must not be empty")
  const parsed = yield* parse(token)
  const { alg, kid } = parsed.protectedHeader
  if (!isAsymmetricAlgorithm(alg) || !options.algorithms.includes(alg)) return yield* algorithmNotAllowed
  const jwks = yield* Jwks
  const key = yield* jwks.resolve({ algorithm: alg, kid, protectedHeader: parsed.protectedHeader })
  if (key.algorithm !== alg) return yield* algorithmNotAllowed
  return { ...(yield* verifySignature(parsed, key)), key }
})
