import * as AiError from "effect/ai/AiError"
import * as Clock from "effect/Clock"
import type * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import type * as Sse from "effect/encoding/Sse"
import { dual } from "effect/Function"
import * as Headers from "effect/http/Headers"
import type * as HttpClientError from "effect/http/HttpClientError"
import type * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as Number from "effect/Number"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as Redactable from "effect/Redactable"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import type { AnthropicErrorMetadata } from "../AnthropicError.ts"
import type * as Generated from "../Generated.ts"

// =============================================================================
// Anthropic Error Body Schema
// =============================================================================

/** @internal */
export const AnthropicErrorBody = Schema.Struct({
  type: Schema.Literal("error"),
  error: Schema.Struct({
    type: Schema.String,
    message: Schema.String
  })
})

/** @internal */
export type AnthropicClientErrorBody = {
  readonly type: "error"
  readonly error: {
    readonly type: string
    readonly message: string
  }
  readonly request_id: string | null
}

// =============================================================================
// Error Mappers
// =============================================================================

/** @internal */
export const mapSchemaError = dual<
  (method: string) => (error: Schema.SchemaError) => AiError.AiError,
  (error: Schema.SchemaError, method: string) => AiError.AiError
>(2, (error, method) =>
  AiError.make({
    module: "AnthropicClient",
    method,
    reason: AiError.InvalidResponseError.fromSchemaError(error)
  }))

/** @internal */
export const mapSseError = dual<
  (method: string) => (error: Sse.SseError) => AiError.AiError,
  (error: Sse.SseError, method: string) => AiError.AiError
>(2, (error, method) =>
  AiError.make({
    module: "AnthropicClient",
    method,
    reason: new AiError.InvalidResponseError({ description: error.message })
  }))

type ClientError = Generated.AnthropicClientError<string, AnthropicClientErrorBody>

/** @internal */
export const mapClientError = dual<
  (method: string) => (error: ClientError) => Effect.Effect<never, AiError.AiError>,
  (error: ClientError, method: string) => Effect.Effect<never, AiError.AiError>
>(
  2,
  Effect.fnUntraced(function*(error: ClientError, method: string) {
    const now = yield* Clock.currentTimeMillis
    const { request, response, cause } = error
    const status = response.status
    const headers = response.headers as Record<string, string>
    const metadata: AnthropicErrorMetadata = {
      errorType: cause.error.type,
      requestId: cause.request_id
    }
    const http = buildHttpContext({ response, body: JSON.stringify(cause) })
    const reason = mapStatusCodeToReason({
      now,
      status,
      method: request.method,
      url: request.url,
      headers,
      message: cause.error.message,
      metadata,
      http
    })
    return yield* AiError.make({ module: "AnthropicClient", method, reason })
  })
)

/** @internal */
export const mapHttpClientError = dual<
  (method: string) => (error: HttpClientError.HttpClientError) => Effect.Effect<never, AiError.AiError>,
  (error: HttpClientError.HttpClientError, method: string) => Effect.Effect<never, AiError.AiError>
>(2, (error, method) => {
  const reason = error.reason
  switch (reason._tag) {
    case "TransportError":
    case "EncodeError":
    case "InvalidUrlError": {
      return Effect.fail(AiError.make({
        module: "AnthropicClient",
        method,
        reason: AiError.NetworkError.fromHttpClientError(
          error as HttpClientError.HttpClientError & { readonly reason: typeof reason }
        )
      }))
    }
    case "StatusCodeError": {
      return mapStatusCodeError(reason, method)
    }
    case "DecodeError": {
      return Effect.fail(AiError.make({
        module: "AnthropicClient",
        method,
        reason: new AiError.InvalidOutputError({
          description: reason.description ?? "Failed to decode response"
        })
      }))
    }
    case "EmptyBodyError": {
      return Effect.fail(AiError.make({
        module: "AnthropicClient",
        method,
        reason: new AiError.InvalidOutputError({
          description: reason.description ?? "Response body was empty"
        })
      }))
    }
  }
})

/** @internal */
const mapStatusCodeError = Effect.fnUntraced(function*(
  error: HttpClientError.StatusCodeError,
  method: string
) {
  const { request, response, description } = error
  const status = response.status
  const headers = response.headers as Record<string, string>
  const requestId = headers["request-id"]

  let body: string | undefined = description
  if (!description || !description.startsWith("{")) {
    const responseBody = yield* Effect.option(response.text)
    if (Option.isSome(responseBody) && responseBody.value) {
      body = responseBody.value
    }
  }

  let json: unknown = undefined
  // @effect-diagnostics effect/tryCatchInEffectGen:off
  try {
    json = Predicate.isNotUndefined(body) ? JSON.parse(body) : undefined
  } catch {
    json = undefined
  }
  const decoded = Schema.decodeUnknownOption(AnthropicErrorBody)(json)

  const now = yield* Clock.currentTimeMillis
  const reason = mapStatusCodeToReason({
    now,
    status,
    method: request.method,
    url: request.url,
    headers,
    message: Option.isSome(decoded) ? decoded.value.error.message : undefined,
    http: buildHttpContext({ response, body }),
    metadata: {
      errorType: Option.isSome(decoded) ? decoded.value.error.type : null,
      requestId: requestId ?? null
    }
  })

  return yield* AiError.make({ module: "AnthropicClient", method, reason })
})

// =============================================================================
// Rate Limits
// =============================================================================

const retryAfterFromHeader = (raw: string, now: number): Duration.Duration | undefined => {
  const retryAfter = Headers.parseRetryAfter(raw)
  return Result.isSuccess(retryAfter) ? Headers.retryAfterDelay(retryAfter.success, now) : undefined
}

/** @internal */
export const parseRateLimitHeaders = (headers: Record<string, string>, now: number) => {
  const retryAfterRaw = headers["retry-after"]
  // an invalid Retry-After is treated as absent
  const retryAfter = retryAfterRaw === undefined ? undefined : retryAfterFromHeader(retryAfterRaw, now)
  const requestsLimitRaw = headers["anthropic-ratelimit-requests-limit"]
  const requestsRemainingRaw = headers["anthropic-ratelimit-requests-remaining"]
  const tokensLimitRaw = headers["anthropic-ratelimit-tokens-limit"]
  const tokensRemainingRaw = headers["anthropic-ratelimit-tokens-remaining"]
  return {
    retryAfter,
    requestsLimit: Predicate.isNotUndefined(requestsLimitRaw) ? Option.getOrNull(Number.parse(requestsLimitRaw)) : null,
    requestsRemaining: Predicate.isNotUndefined(requestsRemainingRaw)
      ? Option.getOrNull(Number.parse(requestsRemainingRaw))
      : null,
    requestsReset: headers["anthropic-ratelimit-requests-reset"] ?? null,
    tokensLimit: Predicate.isNotUndefined(tokensLimitRaw) ? Option.getOrNull(Number.parse(tokensLimitRaw)) : null,
    tokensRemaining: Predicate.isNotUndefined(tokensRemainingRaw)
      ? Option.getOrNull(Number.parse(tokensRemainingRaw))
      : null,
    tokensReset: headers["anthropic-ratelimit-tokens-reset"] ?? null
  }
}

// =============================================================================
// HTTP Context
// =============================================================================

/** @internal */
export const buildHttpContext = (params: {
  readonly response?: HttpClientResponse.HttpClientResponse
  readonly body?: string | undefined
}): typeof AiError.HttpContext.Type => ({
  response: Predicate.isNotUndefined(params.response)
    ? {
      status: params.response.status,
      headers: Redactable.redact(params.response.headers) as Record<string, string>
    }
    : undefined,
  body: params.body
})

// =============================================================================
// HTTP Status Code
// =============================================================================

/** @internal */
export const mapStatusCodeToReason = ({ status, method, url, headers, message, metadata, http, now }: {
  readonly status: number
  /** Current time in epoch milliseconds, used to measure a Retry-After date. */
  readonly now: number
  readonly method: string
  readonly url: string
  readonly headers: Record<string, string>
  readonly message: string | undefined
  readonly metadata: AnthropicErrorMetadata
  readonly http: typeof AiError.HttpContext.Type
}): AiError.AiErrorReason => {
  const errorDescription = AiError.buildErrorDescription({
    status,
    message,
    method,
    url,
    errorType: metadata.errorType,
    requestId: metadata.requestId,
    body: http.body
  })

  switch (status) {
    case 400:
      return new AiError.InvalidRequestError({
        description: errorDescription,
        metadata: { anthropic: metadata },
        http
      })
    case 401:
      return new AiError.AuthenticationError({
        kind: "InvalidKey",
        description: errorDescription,
        metadata: { anthropic: metadata },
        http
      })
    case 403:
      return new AiError.AuthenticationError({
        kind: "InsufficientPermissions",
        description: errorDescription,
        metadata: { anthropic: metadata },
        http
      })
    case 404:
      return new AiError.InvalidRequestError({
        description: errorDescription,
        metadata: { anthropic: metadata },
        http
      })
    case 422:
      return new AiError.InvalidRequestError({
        description: errorDescription,
        metadata: { anthropic: metadata },
        http
      })
    case 429: {
      const { retryAfter, ...rateLimitMetadata } = parseRateLimitHeaders(headers, now)
      return new AiError.RateLimitError({
        retryAfter,
        metadata: {
          anthropic: {
            ...metadata,
            ...rateLimitMetadata
          }
        },
        http
      })
    }
    case 529:
      return new AiError.InternalProviderError({
        description: message ?? "Anthropic API is overloaded",
        metadata: { anthropic: metadata },
        http
      })
    default:
      if (status >= 500) {
        return new AiError.InternalProviderError({
          description: message ?? "Server error",
          metadata: { anthropic: metadata },
          http
        })
      }
      return new AiError.UnknownError({
        description: message,
        metadata: { anthropic: metadata },
        http
      })
  }
}
