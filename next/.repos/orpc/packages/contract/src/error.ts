import type { ORPCError, ORPCErrorCode } from '@orpc/client'
import type { AnySchema, InferSchemaOutput, SchemaIssue } from './schema'

export interface ErrorMapItem {
  /**
   * Default message, can be overridden when constructing an error.
   */
  message?: undefined | string

  /**
   * Schema used to type and validate the error data.
   */
  data?: undefined | AnySchema
}

/**
 * Map of error codes to their definitions, as passed to `.errors(...)`.
 * Errors defined here remain properly typed on the client.
 *
 * @see {@link https://orpc.dev/docs/metadata | Metadata}
 */
export type ErrorMap = {
  [key in ORPCErrorCode]?: ErrorMapItem
}

export type ORPCErrorFromErrorMap<TErrorMap extends ErrorMap> = {
  [K in keyof TErrorMap]: TErrorMap[K] extends ErrorMapItem
    ? ORPCError<
       K & ORPCErrorCode,
       TErrorMap[K]['data'] extends AnySchema ? InferSchemaOutput<TErrorMap[K]['data']> : unknown
    >
    : never
}[keyof TErrorMap]

export interface ValidationErrorOptions extends ErrorOptions {
  message: string
  issues: readonly SchemaIssue[]
  invalidData: unknown
}

/**
 * Error thrown when input, output, or error data fails schema validation,
 * carrying the standard-schema `issues` and the invalid data.
 * Usually found as the `cause` of an `ORPCError`.
 *
 * @see {@link https://orpc.dev/docs/recipes/validation-customization | Validation Customization}
 */
export class ValidationError extends Error {
  override name: string = 'ValidationError'

  /**
   * This array is readonly because the upstream Standard Schema returns readonly issues.
   */
  issues: readonly SchemaIssue[]
  invalidData: unknown

  constructor(options: ValidationErrorOptions) {
    super(options.message, options)

    this.issues = options.issues
    this.invalidData = options.invalidData
  }
}
