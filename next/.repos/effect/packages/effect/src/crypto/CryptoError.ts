/**
 * The `CryptoError` returned by the `effect/crypto` modules, and the reasons it
 * carries.
 *
 * Every failure is one `CryptoError` whose `module` and `method` name the
 * operation, such as `"Aead"` and `"decrypt"`, and whose `reason` says what
 * went wrong: `InvalidArgument`, `InvalidKey`, `DecryptionFailed`,
 * `Unsupported`, or `NotExtractable`.
 *
 * **Gotchas**
 *
 * The error is not serializable, so it cannot be a typed failure in an Rpc or
 * HttpApi schema. Map it before it reaches a client, for example
 * `DecryptionFailed` to a 401. Sending crypto failure detail to clients is how
 * oracles leak.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Data from "../Data.ts"
import * as Predicate from "../Predicate.ts"

const TypeId = "~effect/crypto/CryptoError" as const
const ReasonTypeId = "~effect/crypto/CryptoError/Reason" as const

/**
 * Reason for an argument that the operation rejects before using the key or
 * data, such as a wrong nonce length, an out-of-range iteration count, or
 * `info` passed to a key derivation other than HKDF.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class InvalidArgument extends Data.TaggedError("InvalidArgument")<{
  readonly description: string
  readonly cause?: unknown
}> {
  /**
   * Marks this value as a `CryptoError` reason for runtime guards.
   *
   * @since 4.0.0
   */
  readonly [ReasonTypeId] = ReasonTypeId

  override get message(): string {
    return this.description
  }
}

/**
 * Reason for key material that is rejected, such as a wrong raw key length,
 * malformed DER, PEM, or JWK data, a `CryptoKey` that does not match the typed
 * key, or a peer public key that produces an all-zero shared secret.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class InvalidKey extends Data.TaggedError("InvalidKey")<{
  readonly description: string
  readonly cause?: unknown
}> {
  /**
   * Marks this value as a `CryptoError` reason for runtime guards.
   *
   * @since 4.0.0
   */
  readonly [ReasonTypeId] = ReasonTypeId

  override get message(): string {
    return this.description
  }
}

/**
 * Reason for a decryption or unwrap that failed its integrity check, or a CBC
 * ciphertext with bad padding or length.
 *
 * **Details**
 *
 * The reason is identical for every cause and carries no `cause` or runtime
 * message, so callers cannot tell a tampered tag from bad padding. Keeping
 * either would create a padding oracle.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class DecryptionFailed extends Data.TaggedError("DecryptionFailed")<{}> {
  /**
   * Marks this value as a `CryptoError` reason for runtime guards.
   *
   * @since 4.0.0
   */
  readonly [ReasonTypeId] = ReasonTypeId

  override get message(): string {
    return "Could not decrypt the data"
  }
}

/**
 * Reason for an algorithm or key that a layer does not provide, such as
 * Argon2id under `Kdf.layerWebCrypto`, or a `CryptoKey`-backed key passed to a
 * layer that cannot use it.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class Unsupported extends Data.TaggedError("Unsupported")<{
  readonly description: string
  readonly cause?: unknown
}> {
  /**
   * Marks this value as a `CryptoError` reason for runtime guards.
   *
   * @since 4.0.0
   */
  readonly [ReasonTypeId] = ReasonTypeId

  override get message(): string {
    return this.description
  }
}

/**
 * Reason for exporting or wrapping a `CryptoKey` that was created as
 * non-extractable.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class NotExtractable extends Data.TaggedError("NotExtractable")<{
  readonly description: string
  readonly cause?: unknown
}> {
  /**
   * Marks this value as a `CryptoError` reason for runtime guards.
   *
   * @since 4.0.0
   */
  readonly [ReasonTypeId] = ReasonTypeId

  override get message(): string {
    return this.description
  }
}

/**
 * Union of the reasons carried by `CryptoError`.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export type CryptoErrorReason = InvalidArgument | InvalidKey | DecryptionFailed | Unsupported | NotExtractable

/**
 * Error returned by the `effect/crypto` modules.
 *
 * **When to use**
 *
 * Use to handle failures from any `effect/crypto` operation, matching on
 * `reason` to separate caller mistakes from failed decryption.
 *
 * **Details**
 *
 * `module` and `method` name the operation, such as `"Aead"` and `"decrypt"`.
 * The message reads `"Aead.decrypt: <reason message>"`. The error's `cause`
 * is the reason's `cause`, when it has one.
 *
 * **Example** (Recovering from failed decryption)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * import { CryptoError } from "effect/crypto"
 *
 * const decrypt = Effect.fail(
 *   new CryptoError.CryptoError({
 *     module: "Aead",
 *     method: "decrypt",
 *     reason: new CryptoError.DecryptionFailed()
 *   })
 * )
 *
 * const program = decrypt.pipe(
 *   Effect.catchReason("CryptoError", "DecryptionFailed", () => Effect.succeed("rejected"))
 * )
 *
 * await Effect.runPromise(program) // => "rejected"
 * ```
 *
 * @see {@link isCryptoError} for narrowing unknown values
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class CryptoError extends Data.TaggedError("CryptoError")<{
  readonly module: string
  readonly method: string
  readonly reason: CryptoErrorReason
}> {
  /**
   * Marks this value as a `CryptoError` for runtime guards.
   *
   * @since 4.0.0
   */
  readonly [TypeId] = TypeId

  /**
   * The reason's cause, when it has one.
   *
   * @since 4.0.0
   */
  override readonly cause: unknown = "cause" in this.reason ? this.reason.cause : undefined

  override get message(): string {
    return `${this.module}.${this.method}: ${this.reason.message}`
  }
}

/**
 * Checks whether a value is a `CryptoError`.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isCryptoError = (u: unknown): u is CryptoError => Predicate.hasProperty(u, TypeId)

/**
 * Checks whether a value is one of the reasons carried by `CryptoError`.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isCryptoErrorReason = (u: unknown): u is CryptoErrorReason => Predicate.hasProperty(u, ReasonTypeId)
