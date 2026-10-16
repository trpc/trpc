import * as AiError from "effect/ai/AiError"
import type * as Response from "effect/ai/Response"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import type * as Sse from "effect/encoding/Sse"
import { dual } from "effect/Function"
import type * as HttpClientError from "effect/http/HttpClientError"
import type * as HttpClientRequest from "effect/http/HttpClientRequest"
import type * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as Number from "effect/Number"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as Redactable from "effect/Redactable"
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
    reason: AiError.InvalidOutputError.fromSchemaError(error)
  }))

/** @internal */
export const mapSseError = dual<
  (method: string) => (error: Sse.SseError) => AiError.AiError,
  (error: Sse.SseError, method: string) => AiError.AiError
>(2, (error, method) =>
  AiError.make({
    module: "AnthropicClient",
    method,
    reason: new AiError.InvalidOutputError({ description: error.message })
  }))

/** @internal */
export const mapClientError = dual<
  (method: string) => (error: Generated.AnthropicClientError<string, AnthropicClientErrorBody>) => AiError.AiError,
  (error: Generated.AnthropicClientError<string, AnthropicClientErrorBody>, method: string) => AiError.AiError
>(2, (error, method) => {
  const { request, response, cause } = error
  const status = response.status
  const headers = response.headers as Record<string, string>
  const metadata: AnthropicErrorMetadata = {
    errorType: cause.error.type,
    requestId: cause.request_id
  }
  const http = buildHttpContext({ request, response, body: JSON.stringify(cause) })
  const reason = mapStatusCodeToReason({
    status,
    headers,
    message: cause.error.message,
    metadata,
    http
  })
  return AiError.make({ module: "AnthropicClient", method, reason })
})

/** @internal */
export const mapHttpClientError = dual<
  (method: string) => (error: HttpClientError.HttpClientError) => Effect.Effect<never, AiError.AiError>,
  (error: HttpClientError.HttpClientError, method: string) => Effect.Effect<never, AiError.AiError>
>(2, (error, method) => {
  const reason = error.reason
  switch (reason._tag) {
    case "TransportError": {
      return Effect.fail(AiError.make({
        module: "AnthropicClient",
        method,
        reason: new AiError.NetworkError({
          reason: "TransportError",
          description: reason.description,
          request: buildHttpRequestDetails(reason.request)
        })
      }))
    }
    case "EncodeError": {
      return Effect.fail(AiError.make({
        module: "AnthropicClient",
        method,
        reason: new AiError.NetworkError({
          reason: "EncodeError",
          description: reason.description,
          request: buildHttpRequestDetails(reason.request)
        })
      }))
    }
    case "InvalidUrlError": {
      return Effect.fail(AiError.make({
        module: "AnthropicClient",
        method,
        reason: new AiError.NetworkError({
          reason: "InvalidUrlError",
          description: reason.description,
          request: buildHttpRequestDetails(reason.request)
        })
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

  const reason = mapStatusCodeToReason({
    status,
    headers,
    message: Option.isSome(decoded) ? decoded.value.error.message : undefined,
    http: buildHttpContext({ request, response, body }),
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

/** @internal */
export const parseRateLimitHeaders = (headers: Record<string, string>) => {
  const retryAfterRaw = headers["retry-after"]
  let retryAfter: Duration.Duration | undefined
  if (Predicate.isNotUndefined(retryAfterRaw)) {
    const parsed = Number.parse(retryAfterRaw)
    if (Option.isSome(parsed)) {
      retryAfter = Duration.seconds(parsed.value)
    }
  }
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
export const buildHttpRequestDetails = (
  request: HttpClientRequest.HttpClientRequest
): typeof Response.HttpRequestDetails.Type => ({
  method: request.method,
  url: request.url,
  urlParams: Array.from(request.urlParams),
  hash: Option.getOrUndefined(request.hash),
  headers: Redactable.redact(request.headers) as Record<string, string>
})

/** @internal */
export const buildHttpContext = (params: {
  readonly request: HttpClientRequest.HttpClientRequest
  readonly response?: HttpClientResponse.HttpClientResponse
  readonly body?: string | undefined
}): typeof AiError.HttpContext.Type => ({
  request: buildHttpRequestDetails(params.request),
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
export const mapStatusCodeToReason = ({ status, headers, message, metadata, http }: {
  readonly status: number
  readonly headers: Record<string, string>
  readonly message: string | undefined
  readonly metadata: AnthropicErrorMetadata
  readonly http: typeof AiError.HttpContext.Type
}): AiError.AiErrorReason => {
  const errorDescription = AiError.buildErrorDescription({
    status,
    message,
    method: http.request.method,
    url: http.request.url,
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
      const { retryAfter, ...rateLimitMetadata } = parseRateLimitHeaders(headers)
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
