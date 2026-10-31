import * as Effect from "../../Effect.ts"
import * as Predicate from "../../Predicate.ts"
import * as CryptoError from "../CryptoError.ts"
import { WebCrypto } from "../WebCrypto.ts"

/** @internal */
export const subtleUnavailable = (): Error =>
  new Error("crypto.subtle is unavailable; browsers expose it only in secure contexts")

/** @internal */
export const fail = (
  module: string,
  method: string,
  reason: CryptoError.CryptoErrorReason
): Effect.Effect<never, CryptoError.CryptoError> => Effect.fail(new CryptoError.CryptoError({ module, method, reason }))

/** @internal */
export const invalidKey = (module: string, method: string, description: string) =>
  fail(module, method, new CryptoError.InvalidKey({ description }))

/** @internal */
export const notExtractable = (module: string, method: string) =>
  fail(module, method, new CryptoError.NotExtractable({ description: "The CryptoKey is not extractable" }))

/**
 * Moves an error raised by another module's function onto `module.method`.
 *
 * @internal
 */
export const rehome = (module: string, method: string) => (error: CryptoError.CryptoError) =>
  fail(module, method, error.reason)

/**
 * Thrown inside {@link run} to fail with a typed reason instead of a defect,
 * for checks that need the imported `CryptoKey`.
 *
 * @internal
 */
export class Failure {
  readonly reason: CryptoError.CryptoErrorReason
  constructor(reason: CryptoError.CryptoErrorReason) {
    this.reason = reason
  }
}

/** @internal */
export const isOperationError = (cause: unknown): boolean =>
  Predicate.hasProperty(cause, "name") && cause.name === "OperationError"

/**
 * Maps an exception thrown by `crypto.subtle` in `module.layerWebCrypto` to a
 * `CryptoError`.
 *
 * A {@link Failure} carries its own reason. `DataError` and
 * `InvalidAccessError` are `InvalidKey`, and `NotSupportedError` is
 * `Unsupported`, naming the algorithm and the layer. An `OperationError`
 * becomes the reason from `onOperationError`, such as `DecryptionFailed` for a
 * decryption. Any other exception is rethrown, which `Effect.tryPromise` turns
 * into a defect.
 *
 * @internal
 */
export const webCryptoError = (
  module: string,
  method: string,
  algorithm: string,
  cause: unknown,
  onOperationError?: () => CryptoError.CryptoErrorReason
): CryptoError.CryptoError =>
  toCryptoError(module, method, `${module}.layerWebCrypto`, algorithm, cause, onOperationError)

const toCryptoError = (
  module: string,
  method: string,
  provider: string,
  algorithm: string,
  cause: unknown,
  onOperationError?: () => CryptoError.CryptoErrorReason
): CryptoError.CryptoError => {
  const reason = reasonFor(method, provider, algorithm, cause, onOperationError)
  if (reason === undefined) throw cause
  return new CryptoError.CryptoError({ module, method, reason })
}

const reasonFor = (
  method: string,
  provider: string,
  algorithm: string,
  cause: unknown,
  onOperationError: (() => CryptoError.CryptoErrorReason) | undefined
): CryptoError.CryptoErrorReason | undefined => {
  if (cause instanceof Failure) return cause.reason
  switch (Predicate.hasProperty(cause, "name") ? cause.name : undefined) {
    case "DataError":
      return new CryptoError.InvalidKey({ description: "Invalid key data", cause })
    case "InvalidAccessError":
      return new CryptoError.InvalidKey({ description: `The key cannot be used for ${method}`, cause })
    case "NotSupportedError":
      return new CryptoError.Unsupported({ description: `${provider} does not provide ${algorithm}`, cause })
    case "OperationError":
      return onOperationError?.()
    default:
      return undefined
  }
}

/**
 * Runs `f` on the `subtle` of a `Crypto` object in `module.layerWebCrypto`,
 * dying when it is missing, as in an insecure browser context. Exceptions go
 * through `onError`, which defaults to {@link webCryptoError}.
 *
 * @internal
 */
export const run = <A>(
  module: string,
  method: string,
  algorithm: string,
  crypto: Crypto | undefined,
  f: (subtle: SubtleCrypto) => Promise<A>,
  onError: (cause: unknown) => CryptoError.CryptoError = (cause) => webCryptoError(module, method, algorithm, cause)
): Effect.Effect<A, CryptoError.CryptoError> =>
  Effect.suspend(() => {
    const subtle = crypto?.subtle
    if (subtle === undefined) return Effect.die(subtleUnavailable())
    return Effect.tryPromise({ try: () => f(subtle), catch: onError })
  })

/**
 * {@link run} on the `WebCrypto` reference, for the top-level functions that
 * have no layer to read it from. `crypto.subtle` is named as the provider
 * that declined an algorithm.
 *
 * @internal
 */
export const runWithReference = <A>(
  module: string,
  method: string,
  algorithm: string,
  f: (subtle: SubtleCrypto) => Promise<A>
): Effect.Effect<A, CryptoError.CryptoError> =>
  WebCrypto.use((crypto) =>
    run(
      module,
      method,
      algorithm,
      crypto,
      f,
      (cause) => toCryptoError(module, method, "crypto.subtle", algorithm, cause)
    )
  )
