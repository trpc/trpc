/**
 * Signed or encrypted compact JSON Web Tokens whose claims are encoded and
 * decoded with a `Schema`.
 *
 * Verification and decryption authenticate the token first, then check the
 * registered claims and the validation policy, and only then decode the
 * application claims. `exp` and `nbf` are checked whenever they are present;
 * require them with `requiredClaims`.
 *
 * Bound untrusted token length before verification, decryption, or unverified
 * decoding; this module does not impose a token-size limit.
 *
 * @stability unstable
 * @since 4.1.1
 */
import * as Clock from "../Clock.ts"
import type * as Aead from "../crypto/Aead.ts"
import type * as SecureRandom from "../crypto/SecureRandom.ts"
import type * as Signature from "../crypto/Signature.ts"
import type * as Duration from "../Duration.ts"
import * as Effect from "../Effect.ts"
import type * as Redacted from "../Redacted.ts"
import * as Schema from "../Schema.ts"
import { fail, invalidToken, millis, parseJsonObject, utf8 } from "./internal/compact.ts"
import * as JoseError from "./JoseError.ts"
import * as Jwe from "./Jwe.ts"
import type { PublicKey, SecretKey, SigningKey, VerificationKey } from "./Jwk.ts"
import type { Jwks } from "./Jwks.ts"
import * as Jws from "./Jws.ts"

/**
 * Schema for the registered claims: string `iss`, `sub`, and `jti`, a string
 * or string array `aud`, and finite NumericDate `exp`, `nbf`, and `iat`.
 *
 * @stability unstable
 * @category schemas
 * @since 4.1.1
 */
export const RegisteredClaims = Schema.Struct({
  iss: Schema.optionalKey(Schema.String),
  sub: Schema.optionalKey(Schema.String),
  aud: Schema.optionalKey(Schema.Union([Schema.String, Schema.Array(Schema.String)])),
  exp: Schema.optionalKey(Schema.Finite),
  nbf: Schema.optionalKey(Schema.Finite),
  iat: Schema.optionalKey(Schema.Finite),
  jti: Schema.optionalKey(Schema.String)
})

/**
 * The registered claims of a JWT.
 *
 * @stability unstable
 * @category models
 * @since 4.1.1
 */
export type RegisteredClaims = typeof RegisteredClaims.Type

/**
 * The claim validation policy for a signed or encrypted JWT.
 *
 * @stability unstable
 * @category models
 * @since 4.1.1
 */
export interface VerifyOptions {
  /**
   * Accepted `iss` values.
   */
  readonly issuer?: string | ReadonlyArray<string> | undefined
  /**
   * Accepted audiences. The token's `aud` must contain at least one.
   */
  readonly audience?: string | ReadonlyArray<string> | undefined
  readonly subject?: string | undefined
  /**
   * Expected `typ` header. Media types compare case-insensitively and without
   * the `application/` prefix.
   */
  readonly typ?: string | undefined
  /**
   * Tolerance for `exp`, `nbf`, and `iat`. Defaults to zero; numbers are
   * milliseconds.
   */
  readonly clockTolerance?: Duration.Input | undefined
  /**
   * Maximum age measured from `iat`, which becomes required. Numbers are
   * milliseconds.
   */
  readonly maxTokenAge?: Duration.Input | undefined
  readonly requiredClaims?: ReadonlyArray<keyof RegisteredClaims> | undefined
}

/**
 * Options for {@link verifyWithKeySet}: the verification policy and the
 * accepted algorithms.
 *
 * @stability unstable
 * @category models
 * @since 4.1.1
 */
export interface VerifyWithKeySetOptions extends VerifyOptions, Jws.VerifyWithKeySetOptions {}

/**
 * A verified JWT: decoded application claims, its registered claims, and the
 * authenticated protected header.
 *
 * @stability unstable
 * @category models
 * @since 4.1.1
 */
export interface Verified<A, H = Jws.ProtectedHeader> {
  readonly claims: A
  readonly registeredClaims: RegisteredClaims
  readonly protectedHeader: H
}

/**
 * A decrypted and validated JWT, with its protected header and decryption key.
 *
 * @stability unstable
 * @category models
 * @since 4.1.1
 */
export interface Decrypted<A> extends Verified<A, Jwe.ProtectedHeader> {
  readonly key: SecretKey<"dir">
}

/**
 * The protected header and claims of a signed JWT that has not been verified.
 *
 * @stability unstable
 * @category models
 * @since 4.1.1
 */
export interface Unverified {
  readonly protectedHeader: Jws.ProtectedHeader
  readonly claims: Readonly<Record<string, Schema.Json>>
}

/**
 * Failures of JWT operations: JOSE failures, and schema failures while
 * encoding or decoding the application claims.
 *
 * @stability unstable
 * @category errors
 * @since 4.1.1
 */
export type JwtError = JoseError.JoseError | Schema.SchemaError

const claimValidationFailed = (
  claim: JoseError.ClaimValidationFailed["claim"],
  reason: JoseError.ClaimValidationFailed["reason"]
) => fail(new JoseError.ClaimValidationFailed({ claim, reason }))

// Each claim is checked on its own so the failure can name it.
const registeredClaimGuards = Object.entries(RegisteredClaims.fields).map(([name, field]) =>
  [name as keyof RegisteredClaims, Schema.is(field.schema)] as const
)

interface Policy extends Omit<VerifyOptions, "clockTolerance" | "maxTokenAge"> {
  readonly clockTolerance: number
  readonly maxTokenAge: number | undefined
}

// Durations are read before any cryptography, in seconds.
const readPolicy = Effect.fnUntraced(function*(
  options: VerifyOptions | undefined
): Effect.fn.Return<Policy, JoseError.JoseError> {
  const clockTolerance = options?.clockTolerance === undefined
    ? 0
    : yield* millis("clockTolerance", options.clockTolerance)
  const maxTokenAge = options?.maxTokenAge === undefined ? undefined : yield* millis("maxTokenAge", options.maxTokenAge)
  return {
    ...options,
    clockTolerance: clockTolerance / 1000,
    maxTokenAge: maxTokenAge === undefined ? undefined : maxTokenAge / 1000
  }
})

const toArray = (value: string | ReadonlyArray<string>): ReadonlyArray<string> =>
  typeof value === "string" ? [value] : value

const mediaType = (value: string): string => {
  const type = value.toLowerCase()
  return type.includes("/") ? type : `application/${type}`
}

const checkClaims = Effect.fnUntraced(function*(
  claims: Readonly<Record<string, Schema.Json>>,
  header: { readonly typ?: string | undefined },
  policy: Policy
): Effect.fn.Return<RegisteredClaims, JoseError.JoseError> {
  const registered: Record<string, unknown> = {}
  for (const [name, isValid] of registeredClaimGuards) {
    if (!Object.hasOwn(claims, name)) continue
    if (!isValid(claims[name])) return yield* claimValidationFailed(name, "invalid")
    registered[name] = claims[name]
  }
  const { iss, sub, aud, exp, nbf, iat } = registered as RegisteredClaims

  for (const name of policy.requiredClaims ?? []) {
    if (registered[name] === undefined) return yield* claimValidationFailed(name, "missing")
  }
  if (policy.issuer !== undefined) {
    if (iss === undefined) return yield* claimValidationFailed("iss", "missing")
    if (!toArray(policy.issuer).includes(iss)) return yield* claimValidationFailed("iss", "mismatch")
  }
  if (policy.subject !== undefined) {
    if (sub === undefined) return yield* claimValidationFailed("sub", "missing")
    if (sub !== policy.subject) return yield* claimValidationFailed("sub", "mismatch")
  }
  if (policy.audience !== undefined) {
    if (aud === undefined) return yield* claimValidationFailed("aud", "missing")
    const audiences = toArray(aud)
    if (!toArray(policy.audience).some((audience) => audiences.includes(audience))) {
      return yield* claimValidationFailed("aud", "mismatch")
    }
  }
  if (policy.typ !== undefined && (header.typ === undefined || mediaType(header.typ) !== mediaType(policy.typ))) {
    return yield* claimValidationFailed("typ", "mismatch")
  }

  const now = Math.floor((yield* Clock.currentTimeMillis) / 1000)
  const tolerance = policy.clockTolerance
  if (exp !== undefined && exp <= now - tolerance) return yield* claimValidationFailed("exp", "expired")
  if (nbf !== undefined && nbf > now + tolerance) return yield* claimValidationFailed("nbf", "notYetValid")
  if (policy.maxTokenAge !== undefined) {
    if (iat === undefined) return yield* claimValidationFailed("iat", "missing")
    if (iat > now + tolerance) return yield* claimValidationFailed("iat", "future")
    if (now - iat - tolerance > policy.maxTokenAge) return yield* claimValidationFailed("iat", "tooOld")
  }
  return registered as RegisteredClaims
})

const decodeClaims = Effect.fnUntraced(function*<
  S extends Schema.Constraint,
  H extends Jws.ProtectedHeader | Jwe.ProtectedHeader
>(
  schema: S,
  payload: Uint8Array,
  protectedHeader: H,
  policy: Policy
): Effect.fn.Return<Verified<S["Type"], H>, JwtError, S["DecodingServices"]> {
  const claims = parseJsonObject(payload)
  if (claims === undefined) return yield* invalidToken("The JWT payload is not a JSON object")
  const registeredClaims = yield* checkClaims(claims, protectedHeader, policy)
  return {
    claims: yield* Schema.decodeUnknownEffect(schema)(claims),
    registeredClaims,
    protectedHeader
  }
})

const decodeClaimsJson = Schema.decodeUnknownEffect(
  Schema.JsonObject.check(Schema.makeFilter((claims) => Schema.is(RegisteredClaims)(claims)))
)

const encodeClaims = Effect.fnUntraced(function*<S extends Schema.Constraint>(
  schema: S,
  claims: S["Type"]
): Effect.fn.Return<Uint8Array, Schema.SchemaError, S["EncodingServices"]> {
  const encoded = yield* Schema.encodeEffect(schema)(claims)
  const json = yield* decodeClaimsJson(encoded)
  return utf8(JSON.stringify(json))
})

/**
 * Encodes claims with a schema and signs them as a compact JWT.
 *
 * **Details**
 *
 * The encoded claims must be a JSON object whose registered claims match
 * {@link RegisteredClaims}.
 *
 * @see {@link verify}
 * @see {@link encrypt} for encrypted JWTs
 *
 * @stability unstable
 * @category cryptography
 * @since 4.1.1
 */
export const sign = <
  S extends Schema.Constraint,
  K extends SigningKey,
  H extends object & { readonly [P in keyof H]: Schema.Json | undefined } = Jws.Header
>(
  schema: S,
  claims: S["Type"],
  key: K,
  header?: Jws.Header & H
): Effect.Effect<Redacted.Redacted<string>, JwtError, S["EncodingServices"] | Jws.KeyRequirements<K>> =>
  Effect.flatMap(encodeClaims(schema, claims), (payload) => Jws.sign(payload, key, header))

/**
 * Verifies a compact JWT with a key, checks its claims against the policy, and
 * decodes the claims with a schema.
 *
 * **Example** (Verifying a token)
 *
 * ```ts import.meta.vitest
 * import { Effect, Layer, Redacted, Schema } from "effect"
 * import { Mac, SecureRandom, Signature } from "effect/crypto"
 * import { Jwk, Jwt } from "effect/jose"
 *
 * const layer = Layer.mergeAll(Mac.layerWebCrypto, Signature.layerWebCrypto).pipe(
 *   Layer.provide(SecureRandom.layerWebCrypto)
 * )
 *
 * const Claims = Schema.Struct({ sub: Schema.String, iss: Schema.String })
 *
 * const claims = await Effect.runPromise(Effect.gen(function*() {
 *   // Fixed public example material; generate application secrets securely.
 *   const key = yield* Jwk.importSecret(
 *     Redacted.make({ kty: "oct", k: "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc" } as const),
 *     "HS256"
 *   )
 *   const token = yield* Jwt.sign(Claims, { sub: "user-123", iss: "example" }, key)
 *   const verified = yield* Jwt.verify(Claims, token, key, { issuer: "example", requiredClaims: ["sub"] })
 *   return verified.claims
 * }).pipe(Effect.provide(layer)))
 * claims // => ({ sub: "user-123", iss: "example" })
 * ```
 *
 * @see {@link verifyWithKeySet} for resolving the key from the `Jwks` service
 * @see {@link decrypt} for encrypted JWTs
 *
 * @stability unstable
 * @category cryptography
 * @since 4.1.1
 */
export const verify: <S extends Schema.Constraint, K extends VerificationKey>(
  schema: S,
  token: string | Redacted.Redacted<string>,
  key: K,
  options?: VerifyOptions
) => Effect.Effect<
  Verified<S["Type"]>,
  JwtError,
  S["DecodingServices"] | Jws.KeyRequirements<K>
> = Effect.fnUntraced(function*<S extends Schema.Constraint, K extends VerificationKey>(
  schema: S,
  token: string | Redacted.Redacted<string>,
  key: K,
  options?: VerifyOptions
): Effect.fn.Return<Verified<S["Type"]>, JwtError, S["DecodingServices"] | Jws.KeyRequirements<K>> {
  const policy = yield* readPolicy(options)
  const verified = yield* Jws.verify(token, key)
  return yield* decodeClaims(schema, verified.payload, verified.protectedHeader, policy)
})

/**
 * Verifies a compact JWT with a public key resolved from the `Jwks` service,
 * checks its claims against the policy, and decodes the claims with a schema.
 *
 * @see {@link verify} for verifying with a known key
 *
 * @stability unstable
 * @category cryptography
 * @since 4.1.1
 */
export const verifyWithKeySet: <S extends Schema.Constraint>(
  schema: S,
  token: string | Redacted.Redacted<string>,
  options: VerifyWithKeySetOptions
) => Effect.Effect<
  Verified<S["Type"]> & { readonly key: PublicKey },
  JwtError,
  S["DecodingServices"] | Jwks | Signature.Signature
> = Effect.fnUntraced(function*<S extends Schema.Constraint>(
  schema: S,
  token: string | Redacted.Redacted<string>,
  options: VerifyWithKeySetOptions
): Effect.fn.Return<
  Verified<S["Type"]> & { readonly key: PublicKey },
  JwtError,
  S["DecodingServices"] | Jwks | Signature.Signature
> {
  const policy = yield* readPolicy(options)
  const verified = yield* Jws.verifyWithKeySet(token, options)
  return {
    ...(yield* decodeClaims(schema, verified.payload, verified.protectedHeader, policy)),
    key: verified.key
  }
})

/**
 * Encodes claims with a schema and encrypts them as a compact `dir`/A256GCM
 * JWT.
 *
 * **Details**
 *
 * The encoded claims must be a JSON object whose registered claims match
 * {@link RegisteredClaims}.
 *
 * **Example** (Encrypting and validating application claims)
 *
 * ```ts import.meta.vitest
 * import { Effect, Layer, Redacted, Schema } from "effect"
 * import { Aead, SecureRandom } from "effect/crypto"
 * import { Jwk, Jwt } from "effect/jose"
 *
 * const layer = Aead.layerWebCrypto.pipe(Layer.provideMerge(SecureRandom.layerWebCrypto))
 * const Claims = Schema.Struct({ sub: Schema.String })
 *
 * const claims = await Effect.runPromise(Effect.gen(function*() {
 *   // Fixed public example material; generate application secrets securely.
 *   const key = yield* Jwk.importSecret(
 *     Redacted.make({ kty: "oct", k: "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc" } as const),
 *     "dir"
 *   )
 *   const token = yield* Jwt.encrypt(Claims, { sub: "user-123" }, key, { typ: "session+jwt" })
 *   const decrypted = yield* Jwt.decrypt(Claims, token, key, { typ: "session+jwt" })
 *   return decrypted.claims
 * }).pipe(Effect.provide(layer)))
 * claims // => ({ sub: "user-123" })
 * ```
 *
 * @see {@link decrypt}
 * @see {@link sign} for signed JWTs
 *
 * @stability unstable
 * @category cryptography
 * @since 4.1.1
 */
export const encrypt = <
  S extends Schema.Constraint,
  H extends object & { readonly [P in keyof H]: Schema.Json | undefined } = Jwe.Header
>(
  schema: S,
  claims: S["Type"],
  key: SecretKey<"dir">,
  header?: Jwe.Header & H
): Effect.Effect<Redacted.Redacted<string>, JwtError, S["EncodingServices"] | Aead.Aead | SecureRandom.SecureRandom> =>
  Effect.flatMap(encodeClaims(schema, claims), (payload) => Jwe.encrypt(payload, key, header))

/**
 * Decrypts a compact `dir`/A256GCM JWT, checks its claims against the policy,
 * and decodes the claims with a schema.
 *
 * **Details**
 *
 * Accepts a key or an effectful resolver for key rotation. The same claim
 * policy as {@link verify} is applied after authenticated decryption and
 * before the application schema is decoded.
 *
 * **Gotchas**
 *
 * The resolver receives an unauthenticated header and must use it only for
 * key selection.
 *
 * @see {@link encrypt}
 * @see {@link verify} for signed JWTs
 *
 * @stability unstable
 * @category cryptography
 * @since 4.1.1
 */
export const decrypt = Effect.fnUntraced(function*<S extends Schema.Constraint, E = never, R = never>(
  schema: S,
  token: string | Redacted.Redacted<string>,
  key: SecretKey<"dir"> | ((header: Jwe.ProtectedHeader) => Effect.Effect<SecretKey<"dir">, E, R>),
  options?: VerifyOptions
): Effect.fn.Return<Decrypted<S["Type"]>, JwtError | E, S["DecodingServices"] | Aead.Aead | R> {
  const policy = yield* readPolicy(options)
  const decrypted = yield* Jwe.decrypt(token, key)
  return {
    ...(yield* decodeClaims(schema, decrypted.plaintext, decrypted.protectedHeader, policy)),
    key: decrypted.key
  }
})

/**
 * Reads the protected header and claims of a signed JWT without verifying it.
 *
 * **Gotchas**
 *
 * Nothing returned here is authenticated. Use it only to choose how to
 * verify, never to authorize.
 *
 * @see {@link verify}
 *
 * @stability unstable
 * @category decoding
 * @since 4.1.1
 */
export const decodeUnverified = Effect.fnUntraced(function*(
  token: string | Redacted.Redacted<string>
): Effect.fn.Return<Unverified, JoseError.JoseError> {
  const parsed = yield* Jws.parse(token)
  const claims = parseJsonObject(parsed.payload)
  if (claims === undefined) return yield* invalidToken("The JWT payload is not a JSON object")
  return { protectedHeader: parsed.protectedHeader, claims }
})
