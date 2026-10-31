/**
 * The `JoseError` returned by the `effect/jose` modules, and the reasons it
 * carries.
 *
 * Every failure is one `JoseError` whose `reason` says what went wrong. Reasons
 * for configuration, transport, and key-import problems carry a `description`
 * and, when there is one, a `cause`. Reasons for failed authentication carry
 * nothing: they never describe tokens, claims, plaintext, or key material.
 *
 * **Gotchas**
 *
 * Map the error before it reaches a client, for example
 * `SignatureVerificationFailed` to a 401. Sending verification detail to
 * clients is how oracles leak.
 *
 * @stability unstable
 * @since 4.1.1
 */
import * as Data from "../Data.ts"
import * as Predicate from "../Predicate.ts"

const TypeId = "~effect/jose/JoseError" as const
const ReasonTypeId = "~effect/jose/JoseError/Reason" as const

/**
 * Reason for a malformed compact serialization, protected header, or payload,
 * or for header parameters that are not supported, such as `crit`.
 *
 * @stability unstable
 * @category errors
 * @since 4.1.1
 */
export class InvalidToken extends Data.TaggedError("InvalidToken")<{
  readonly description: string
}> {
  /**
   * Marks this value as a `JoseError` reason for runtime guards.
   *
   * @since 4.1.1
   */
  readonly [ReasonTypeId] = ReasonTypeId

  override get message(): string {
    return this.description
  }
}

/**
 * Reason for key material that cannot be imported, or that does not fit the
 * selected algorithm or operation.
 *
 * @stability unstable
 * @category errors
 * @since 4.1.1
 */
export class InvalidKey extends Data.TaggedError("InvalidKey")<{
  readonly description: string
  readonly cause?: unknown
}> {
  /**
   * Marks this value as a `JoseError` reason for runtime guards.
   *
   * @since 4.1.1
   */
  readonly [ReasonTypeId] = ReasonTypeId

  override get message(): string {
    return this.description
  }
}

/**
 * Reason for an option or configuration value that the operation rejects
 * before doing any work, such as a non-HTTPS key-set URL.
 *
 * @stability unstable
 * @category errors
 * @since 4.1.1
 */
export class InvalidArgument extends Data.TaggedError("InvalidArgument")<{
  readonly description: string
  readonly cause?: unknown
}> {
  /**
   * Marks this value as a `JoseError` reason for runtime guards.
   *
   * @since 4.1.1
   */
  readonly [ReasonTypeId] = ReasonTypeId

  override get message(): string {
    return this.description
  }
}

/**
 * Reason for a token whose protected `alg` is not the key's algorithm or is
 * outside the allowlist.
 *
 * @stability unstable
 * @category errors
 * @since 4.1.1
 */
export class AlgorithmNotAllowed extends Data.TaggedError("AlgorithmNotAllowed")<{}> {
  /**
   * Marks this value as a `JoseError` reason for runtime guards.
   *
   * @since 4.1.1
   */
  readonly [ReasonTypeId] = ReasonTypeId

  override get message(): string {
    return "The token algorithm is not allowed"
  }
}

/**
 * Reason for a signature that does not authenticate the token.
 *
 * @stability unstable
 * @category errors
 * @since 4.1.1
 */
export class SignatureVerificationFailed extends Data.TaggedError("SignatureVerificationFailed")<{}> {
  /**
   * Marks this value as a `JoseError` reason for runtime guards.
   *
   * @since 4.1.1
   */
  readonly [ReasonTypeId] = ReasonTypeId

  override get message(): string {
    return "Could not verify the signature"
  }
}

/**
 * Reason for ciphertext that fails authenticated decryption.
 *
 * @stability unstable
 * @category errors
 * @since 4.1.1
 */
export class DecryptionFailed extends Data.TaggedError("DecryptionFailed")<{}> {
  /**
   * Marks this value as a `JoseError` reason for runtime guards.
   *
   * @since 4.1.1
   */
  readonly [ReasonTypeId] = ReasonTypeId

  override get message(): string {
    return "Could not decrypt the token"
  }
}

/**
 * Reason for a key set with no key matching the algorithm and key id.
 *
 * @stability unstable
 * @category errors
 * @since 4.1.1
 */
export class KeyNotFound extends Data.TaggedError("KeyNotFound")<{}> {
  /**
   * Marks this value as a `JoseError` reason for runtime guards.
   *
   * @since 4.1.1
   */
  readonly [ReasonTypeId] = ReasonTypeId

  override get message(): string {
    return "No key matches the algorithm and key id"
  }
}

/**
 * Reason for a key set with more than one key matching the algorithm and key
 * id.
 *
 * @stability unstable
 * @category errors
 * @since 4.1.1
 */
export class AmbiguousKey extends Data.TaggedError("AmbiguousKey")<{}> {
  /**
   * Marks this value as a `JoseError` reason for runtime guards.
   *
   * @since 4.1.1
   */
  readonly [ReasonTypeId] = ReasonTypeId

  override get message(): string {
    return "More than one key matches the algorithm and key id"
  }
}

/**
 * Reason for a remote key set that cannot be fetched or read, is cooling down
 * after a failed refresh, or belongs to a closed layer.
 *
 * @stability unstable
 * @category errors
 * @since 4.1.1
 */
export class KeySetUnavailable extends Data.TaggedError("KeySetUnavailable")<{
  readonly description: string
  readonly cause?: unknown
}> {
  /**
   * Marks this value as a `JoseError` reason for runtime guards.
   *
   * @since 4.1.1
   */
  readonly [ReasonTypeId] = ReasonTypeId

  override get message(): string {
    return this.description
  }
}

/**
 * Reason for a registered claim or `typ` header that is missing, malformed,
 * different from the expected value, or outside its validity window.
 *
 * @stability unstable
 * @category errors
 * @since 4.1.1
 */
export class ClaimValidationFailed extends Data.TaggedError("ClaimValidationFailed")<{
  readonly claim: "iss" | "sub" | "aud" | "exp" | "nbf" | "iat" | "jti" | "typ"
  readonly reason: "invalid" | "missing" | "mismatch" | "expired" | "notYetValid" | "tooOld" | "future"
}> {
  /**
   * Marks this value as a `JoseError` reason for runtime guards.
   *
   * @since 4.1.1
   */
  readonly [ReasonTypeId] = ReasonTypeId

  override get message(): string {
    return `The ${this.claim} claim failed validation: ${this.reason}`
  }
}

/**
 * Union of the reasons carried by `JoseError`.
 *
 * @stability unstable
 * @category errors
 * @since 4.1.1
 */
export type JoseErrorReason =
  | InvalidToken
  | InvalidKey
  | InvalidArgument
  | AlgorithmNotAllowed
  | SignatureVerificationFailed
  | DecryptionFailed
  | KeyNotFound
  | AmbiguousKey
  | KeySetUnavailable
  | ClaimValidationFailed

/**
 * Error returned by the `effect/jose` modules.
 *
 * **Example** (Rejecting a token with a bad signature)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * import { JoseError } from "effect/jose"
 *
 * const verify = Effect.fail(
 *   new JoseError.JoseError({ reason: new JoseError.SignatureVerificationFailed() })
 * )
 *
 * const program = verify.pipe(
 *   Effect.catchReason("JoseError", "SignatureVerificationFailed", () => Effect.succeed("rejected"))
 * )
 *
 * await Effect.runPromise(program) // => "rejected"
 * ```
 *
 * @see {@link isJoseError} for narrowing unknown values
 *
 * @stability unstable
 * @category errors
 * @since 4.1.1
 */
export class JoseError extends Data.TaggedError("JoseError")<{
  readonly reason: JoseErrorReason
}> {
  /**
   * Marks this value as a `JoseError` for runtime guards.
   *
   * @since 4.1.1
   */
  readonly [TypeId] = TypeId

  /**
   * The reason's cause, when it has one.
   *
   * @since 4.1.1
   */
  override readonly cause: unknown = "cause" in this.reason ? this.reason.cause : undefined

  override get message(): string {
    return this.reason.message
  }
}

/**
 * Checks whether a value is a `JoseError`.
 *
 * @stability unstable
 * @category guards
 * @since 4.1.1
 */
export const isJoseError = (u: unknown): u is JoseError => Predicate.hasProperty(u, TypeId)

/**
 * Checks whether a value is one of the reasons carried by `JoseError`.
 *
 * @stability unstable
 * @category guards
 * @since 4.1.1
 */
export const isJoseErrorReason = (u: unknown): u is JoseErrorReason => Predicate.hasProperty(u, ReasonTypeId)
