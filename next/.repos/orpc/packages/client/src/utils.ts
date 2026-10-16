import type { PromiseWithError, ThrowableError } from '@orpc/shared'
import type { AnyORPCError } from './error'
import type { ClientContext, ClientOptions, ClientRest, FriendlyClientOptions } from './types'
import { isDefinedError } from './error-utils'

export function resolveFriendlyClientOptions<T extends ClientContext>(options: FriendlyClientOptions<T>): ClientOptions<T> {
  return {
    ...options,
    context: options.context ?? {} as T, // Context only optional if all fields are optional
  }
}

export function resolveClientRest<TClientContext extends ClientContext, TInput>(rest: ClientRest<TClientContext, TInput>): [input: TInput, options: ClientOptions<TClientContext>] {
  return [
    rest[0] as TInput, // rest[0] can be undefined if TInput is optional,
    resolveFriendlyClientOptions(rest[1] ?? {} as FriendlyClientOptions<TClientContext>), // rest[1] can be undefined if all fields of FriendlyClientOptions are optional
  ]
}

export type SafeResult<TOutput, TError>
  = | [error: null, data: TOutput, definedError: null, isSuccess: true]
  & { error: null, data: TOutput, definedError: null, isSuccess: true }
  | [error: Exclude<TError, AnyORPCError>, data: undefined, definedError: null, isSuccess: false]
  & { error: Exclude<TError, AnyORPCError>, data: undefined, definedError: null, isSuccess: false }
  | [error: Extract<TError, AnyORPCError>, data: undefined, definedError: Extract<TError, AnyORPCError>, isSuccess: false]
  & { error: Extract<TError, AnyORPCError>, data: undefined, definedError: Extract<TError, AnyORPCError>, isSuccess: false }

/**
 * Works like try/catch, but help you infer the error type if it is a defined ORPCError.
 *
 * @example
 * ```ts
 * const [error, data, definedError, isSuccess] = await safe(client(...))
 * // or const { error, data, definedError, isSuccess } = await safe(client(...))
 *
 * if (definedError) {
 *  console.log(definedError) // or error, both are well typed
 * }
 * ```
 *
 * @see {@link https://orpc.dev/docs/client/error-handling#using-safe-and-isdefinederror | Client Error Handling - Using safe and isDefinedError}
 */
export async function safe<TOutput, TError = ThrowableError>(promise: PromiseWithError<TOutput, TError>): Promise<SafeResult<TOutput, TError>> {
  try {
    const output = await promise
    return Object.assign(
      [null, output, null, true] satisfies [null, TOutput, null, true],
      { error: null, data: output, definedError: null, isSuccess: true as const },
    )
  }
  catch (e) {
    const error = e as TError

    if (isDefinedError(error)) {
      return Object.assign(
        [error, undefined, error, false] satisfies [typeof error, undefined, typeof error, false],
        { error, data: undefined, definedError: error, isSuccess: false as const },
      )
    }

    return Object.assign(
      [error as Exclude<TError, AnyORPCError>, undefined, null, false] satisfies [Exclude<TError, AnyORPCError>, undefined, null, false],
      { error: error as Exclude<TError, AnyORPCError>, data: undefined, definedError: null, isSuccess: false as const },
    )
  }
}
