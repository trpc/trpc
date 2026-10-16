import type { ORPCErrorCode, ORPCErrorOptions } from '@orpc/client'
import type { MaybeOptionalOptions, Writable } from '@orpc/shared'
import type { ErrorMap, ErrorMapItem } from './error'
import type { AnySchema, InferSchemaInput, Schema } from './schema'

import { ORPCError } from '@orpc/client'
import { getOwn, resolveMaybeOptionalOptions } from '@orpc/shared'
import { ValidationError } from './error'
import { type } from './schema-utils'

export interface ORPCErrorFactoryOptions<TData> {
  /**
   * Optional schema used to type and validate the error data.
   * Must be a synchronous schema.
   */
  data?: Schema<TData>

  /**
   * Optional default message, can be overridden when constructing an error.
   */
  message?: string
}

export interface ORPCErrorFactory<TCode extends ORPCErrorCode, TData> extends ErrorMapItem {
  code: TCode
  data: Schema<TData>
  new (...rest: MaybeOptionalOptions<ORPCErrorOptions<TData>>): ORPCError<TCode, TData>
}

/**
 * Creates a reusable error class ({@link ORPCErrorFactory}) for the given code,
 * default message, and data schema.
 *
 * @example
 * ```ts
 * const RateLimitedError = error('RATE_LIMITED', {
 *   message: 'You are being rate limited',
 *   data: z.object({ retryAfter: z.number() }),
 * })
 *
 * const procedure = os
 *   .errors({ [RateLimitedError.code]: RateLimitedError })
 *   .handler(() => {
 *     throw new RateLimitedError({ data: { retryAfter: 60 } })
 *   })
 *
 * try {
 *   const output = call(procedure)
 * } catch (error) {
 *   if (error instanceof RateLimitedError) {
 *     console.log(error.data.retryAfter)
 *   }
 * }
 * ```
 *
 * @see {@link https://orpc.dev/docs/error-handling#error-factory | Error Handling - Error Factory}
 */
export function error<TCode extends ORPCErrorCode, TData = unknown>(
  code: TCode,
  { data: dataSchema, message }: ORPCErrorFactoryOptions<TData> = {},
): ORPCErrorFactory<TCode, TData> {
  const validateData = (schema: Schema<TData>, value: unknown) => {
    const result = schema['~standard'].validate(value)

    if (result instanceof Promise) {
      throw new TypeError(
        `Error factory "${code}" does not support async data schemas.`,
      )
    }

    return result
  }

  return class extends ORPCError<TCode, TData> {
    static code: TCode = code
    static data: Schema<TData> = dataSchema ?? type<any>()
    static message: string | undefined = message

    constructor(...rest: MaybeOptionalOptions<ORPCErrorOptions<TData>>) {
      const options = resolveMaybeOptionalOptions(rest)

      let data = options.data

      if (dataSchema) {
        const result = validateData(dataSchema, options.data)

        if (result.issues) {
          throw new ValidationError({
            message: `Error factory "${code}" data validation failed`,
            issues: result.issues,
            invalidData: options.data,
          })
        }

        data = result.value
      }

      super(code, { ...options, message: options.message ?? message, data })
    }

    static override[Symbol.hasInstance](instance: unknown): boolean {
      if (!(instance instanceof ORPCError)) {
        return false
      }

      if (instance.code !== code) {
        return false
      }

      if (dataSchema && validateData(dataSchema, instance.data).issues) {
        return false
      }

      return true
    }
  }
}

export type ORPCErrorConstructorMapItemOptions<TData> = Omit<ORPCErrorOptions<TData>, 'status'>

export interface ORPCErrorConstructorMapItem<TCode extends ORPCErrorCode, TInData> {
  (...rest: MaybeOptionalOptions<ORPCErrorConstructorMapItemOptions<TInData>>): ORPCError<TCode, TInData>
}

export type ORPCErrorConstructorMap<T extends ErrorMap> = {
  [K in keyof T]: T[K] extends ErrorMapItem
    ? ORPCErrorConstructorMapItem<
       K & ORPCErrorCode,
       T[K]['data'] extends AnySchema ? InferSchemaInput<T[K]['data']> : unknown
    >
    : never
}

/**
 * Creates a map of ORPC error constructors.
 *
 * The returned object is a `Proxy` that allows access to arbitrary error codes:
 * - If the code exists in the provided `errorMap`, the corresponding constructor
 *   will create a **defined** `ORPCError`.
 * - If the code does not exist, a fallback `ORPCError` constructor is returned.
 *
 * The `in` operator can be used to check whether an error code is explicitly
 * defined in the map.
 *
 * @example
 * ```ts
 * const errorMap = createORPCErrorConstructorMap({
 *   NOT_FOUND: {
 *     message: 'Not Found',
 *   },
 * })
 *
 * throw errorMap.NOT_FOUND()
 * ```
 */
export function createORPCErrorConstructorMap<T extends ErrorMap>(errorMap: T): ORPCErrorConstructorMap<T> {
  const proxy = new Proxy(errorMap, {
    get(target, code) {
      if (typeof code !== 'string' || code === 'then') {
        return Reflect.get(target, code)
      }

      const item: ORPCErrorConstructorMapItem<string, unknown> = (...rest) => {
        const options = resolveMaybeOptionalOptions(rest)
        const config = getOwn(errorMap as ErrorMap, code)

        const error = new ORPCError(code, {
          message: options.message ?? config?.message,
          data: options.data,
          cause: options.cause,
        })

        if (config) {
          ;(error.defined as Writable<typeof error.defined>) = true
        }

        return error
      }

      return item
    },
  })

  return proxy as any
}
