import type { MaybeOptionalOptions, Registry } from '@orpc/shared'
import type { StandardResponse } from '@standard-server/core'
import { getConstructors, isPlainObject, resolveMaybeOptionalOptions } from '@orpc/shared'

/**
 * Default mapping between common oRPC error codes and HTTP status codes.
 * Handlers use it to determine response status codes; spread it to build a custom `errorStatusMap`.
 *
 * @see {@link https://orpc.dev/docs/rpc/handler#custom-error-response | RPC Handler - Custom Error Response}
 * @see {@link https://orpc.dev/docs/openapi/handler#custom-error-response | OpenAPI Handler - Custom Error Response}
 */
export const COMMON_ERROR_STATUS_MAP = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  PAYMENT_REQUIRED: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_SUPPORTED: 405,
  NOT_ACCEPTABLE: 406,
  TIMEOUT: 408,
  CONFLICT: 409,
  GONE: 410,
  LENGTH_REQUIRED: 411,
  PRECONDITION_FAILED: 412,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  UNPROCESSABLE_CONTENT: 422,
  PRECONDITION_REQUIRED: 428,
  TOO_MANY_REQUESTS: 429,
  CLIENT_CLOSED_REQUEST: 499,
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
}

export type ORPCErrorCode
  = Registry extends { ORPCErrorCode: infer T extends string }
    ? T
    : (keyof typeof COMMON_ERROR_STATUS_MAP) | (string & {})

export type ORPCErrorOptions<TData>
  = & ErrorOptions
    & { message?: string }
    & (undefined extends TData ? { data?: TData } : { data: TData })

let ORPCErrorConstructors: WeakSet<object>

/**
 * Typed error carrying a `code`, a `message`, and optional `data`.
 * Throw it from handlers or middleware to produce typed error responses on the client.
 *
 * @see {@link https://orpc.dev/docs/error-handling#orpcerror-class | Error Handling - ORPCError Class}
 */
export class ORPCError<TCode extends ORPCErrorCode, TData> extends Error {
  /**
   * Placed inside a static block (rather than at module level) to ensure this
   * registration is treated as part of the class definition by bundlers.
   *
   * With `"sideEffects": false` in package.json, bundlers like webpack/Rollup
   * are allowed to tree-shake any module-level statements that appear to have
   * no consumers. A free-floating `globalORPCErrorConstructors.add(ORPCError)`
   * at module level could be dropped entirely if the bundler decides the module
   * is only partially used.
   *
   * By placing this inside `static {}`, the registration becomes inseparable
   * from the class body itself — a bundler cannot include `ORPCError` without
   * executing this block.
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes/Static_initialization_blocks
   */
  static {
    /**
     * Store all ORPCError constructors
     * for workaround of instanceof check in case multiple dependency graphs exist
     */
    const ORPC_ERROR_CONSTRUCTORS_SYMBOL = Symbol.for('ORPC_ERROR_CONSTRUCTORS')
    void ((globalThis as any)[ORPC_ERROR_CONSTRUCTORS_SYMBOL] ??= new WeakSet())
    ORPCErrorConstructors = (globalThis as any)[ORPC_ERROR_CONSTRUCTORS_SYMBOL]
    ORPCErrorConstructors.add(ORPCError)
  }

  /**
   * @remarks
   * **Note**: The `__branch` property is used for type branding, helping TypeScript distinguish
   * an `ORPCError` instance from plain objects with a similar structure.
   */
  override readonly name = 'ORPCError' as 'ORPCError' & { __branch: 'ORPCError' }

  /**
   * Indicates whether the error matches a definition in the procedure's `.errors` map,
   * which makes its type inferable on the client.
   */
  readonly defined: boolean = false

  code: TCode
  data: TData

  constructor(code: TCode, ...rest: MaybeOptionalOptions<ORPCErrorOptions<TData>>) {
    const options = resolveMaybeOptionalOptions(rest)
    const message = options.message ?? codeToMessage(code)

    super(message, options)

    this.code = code
    this.data = options.data as TData // data only optional when TData is undefinable so can safely cast here
  }

  toJSON(): ORPCErrorJSON<TCode, TData> {
    return {
      defined: this.defined,
      code: this.code,
      message: this.message,
      data: this.data,
    }
  }

  /**
   * Workaround for Next.js where different contexts use separate
   * dependency graphs, causing multiple ORPCError constructors existing and breaking
   * `instanceof` checks across contexts.
   *
   * This is particularly problematic with "Optimized SSR", where orpc-client
   * executes in one context but is invoked from another. When an error is thrown
   * in the execution context, `instanceof ORPCError` checks fail in the
   * invocation context due to separate class constructors.
   *
   * @todo Remove this and related code if Next.js resolves the multiple dependency graph issue.
   */
  static override[Symbol.hasInstance](instance: unknown): boolean {
    if (!ORPCErrorConstructors.has(this)) {
      // not applicable to extended classes
      return super[Symbol.hasInstance](instance)
    }

    for (const constructor of getConstructors(instance)) {
      if (ORPCErrorConstructors.has(constructor)) {
        return true
      }
    }

    return false
  }
}

export interface ORPCErrorJSON<TCode extends string, TData> extends Pick<ORPCError<TCode, TData>, 'code' | 'message' | 'data'> {
  /**
   * remove readonly
   */
  defined: boolean
}

export type AnyORPCError = ORPCError<any, any>
export type AnyORPCErrorJSON = ORPCErrorJSON<any, any>

export interface MalformedResponseErrorOptions extends ErrorOptions {
  /**
   * @default inferred from the response body or status
   */
  message?: string
  response: StandardResponse
}

/**
 * Error thrown by links when a response does not follow the expected oRPC format,
 * for example when a proxy or gateway answers instead of your handler. Carries the
 * resolved response. Unless overridden via `options.message`, the message is
 * inferred from the response body or status.
 *
 * Unlike `ORPCError`, it reaches a handler's callers as a generic `INTERNAL_SERVER_ERROR`
 * when thrown from the handler, so an upstream's response is not sent to them.
 *
 * @see {@link https://orpc.dev/docs/rpc/link#malformed-responses | RPC Link - Malformed Responses}
 * @see {@link https://orpc.dev/docs/openapi/link#malformed-responses | OpenAPI Link - Malformed Responses}
 */
export class MalformedResponseError extends Error {
  override readonly name = 'MalformedResponseError'

  response: StandardResponse

  constructor(options: MalformedResponseErrorOptions) {
    super(options.message ?? inferMalformedResponseMessage(options.response), options)

    this.response = options.response
  }
}

/**
 * Longer body strings are not used as the error message,
 * e.g. full HTML error pages from a proxy or gateway.
 */
const INFERRED_MESSAGE_MAX_LENGTH = 256

function inferMalformedResponseMessage(response: StandardResponse): string {
  const candidate = isPlainObject(response.body) ? response.body.message : response.body

  if (typeof candidate === 'string' && candidate.length > 0 && candidate.length <= INFERRED_MESSAGE_MAX_LENGTH) {
    return candidate
  }

  const commonCode = Object.entries(COMMON_ERROR_STATUS_MAP).find(([, status]) => status === response.status)?.[0]

  return commonCode ? codeToMessage(commonCode) : 'Malformed oRPC Response'
}

function codeToMessage(code: string): string {
  return code.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ')
}
