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
import type { OpenAiErrorMetadata } from "../OpenAiError.ts"

// =============================================================================
// OpenAI Error Body Schema
// =============================================================================

/** @internal */
export const OpenAiErrorBody = Schema.Struct({
  error: Schema.Struct({
    message: Schema.String,
    type: Schema.optional(Schema.NullOr(Schema.String)),
    param: Schema.optional(Schema.NullOr(Schema.String)),
    code: Schema.optional(Schema.NullOr(Schema.String))
  })
})

const OpenAiCompatibleErrorBody = Schema.Struct({
  error: Schema.String,
  code: Schema.optional(Schema.String)
})

// =============================================================================
// Error Mappers
// =============================================================================

/** @internal */
export const mapSchemaError = dual<
  (method: string) => (error: Schema.SchemaError) => AiError.AiError,
  (error: Schema.SchemaError, method: string) => AiError.AiError
>(2, (error, method) =>
  AiError.make({
    module: "OpenAiClient",
    method,
    reason: AiError.InvalidResponseError.fromSchemaError(error)
  }))

/** @internal */
export const mapSseError = dual<
  (method: string) => (error: Sse.SseError) => AiError.AiError,
  (error: Sse.SseError, method: string) => AiError.AiError
>(2, (error, method) =>
  AiError.make({
    module: "OpenAiClient",
    method,
    reason: new AiError.InvalidResponseError({ description: error.message })
  }))

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
        module: "OpenAiClient",
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
        module: "OpenAiClient",
        method,
        reason: new AiError.InvalidOutputError({
          description: reason.description ?? "Failed to decode response"
        })
      }))
    }
    case "EmptyBodyError": {
      return Effect.fail(AiError.make({
        module: "OpenAiClient",
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
  const requestId = headers["x-request-id"]

  // Try to get the actual response body. The description from filterStatusOk
  // is often just "non 2xx status code", so try reading from response.text
  let body: string | undefined = description
  if (!description || !description.startsWith("{")) {
    const responseBody = yield* Effect.option(response.text)
    if (Option.isSome(responseBody) && responseBody.value) {
      body = responseBody.value
    }
  }

  // Try to parse the body as JSON to extract error details
  let json: unknown = undefined
  // @effect-diagnostics effect/tryCatchInEffectGen:off
  try {
    json = Predicate.isNotUndefined(body) ? JSON.parse(body) : undefined
  } catch {
    json = undefined
  }
  const decoded = Schema.decodeUnknownOption(OpenAiErrorBody)(json)
  const compatibleDecoded = Schema.decodeUnknownOption(OpenAiCompatibleErrorBody)(json)
  const message = Option.isSome(decoded)
    ? decoded.value.error.message
    : Option.isSome(compatibleDecoded)
    ? compatibleDecoded.value.error
    : undefined
  const errorCode = Option.isSome(decoded)
    ? decoded.value.error.code ?? null
    : Option.isSome(compatibleDecoded)
    ? compatibleDecoded.value.code ?? null
    : null

  const now = yield* Clock.currentTimeMillis
  const reason = mapStatusCodeToReason({
    now,
    status,
    method: request.method,
    url: request.url,
    headers,
    message,
    http: buildHttpContext({ response, body }),
    metadata: {
      errorCode,
      errorType: Option.isSome(decoded) ? decoded.value.error.type ?? null : null,
      requestId: requestId ?? null
    }
  })

  return yield* AiError.make({ module: "OpenAiClient", method, reason })
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
  const remainingRaw = headers["x-ratelimit-remaining-requests"]
  const remaining = Predicate.isNotUndefined(remainingRaw)
    ? Option.getOrNull(Number.parse(remainingRaw))
    : null
  return {
    retryAfter,
    limit: headers["x-ratelimit-limit-requests"] ?? null,
    remaining,
    resetRequests: headers["x-ratelimit-reset-requests"] ?? null,
    resetTokens: headers["x-ratelimit-reset-tokens"] ?? null
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
  readonly metadata: OpenAiErrorMetadata
  readonly http: typeof AiError.HttpContext.Type
}): AiError.AiErrorReason => {
  const errorDescription = AiError.buildErrorDescription({
    status,
    message,
    method,
    url,
    errorCode: metadata.errorCode,
    errorType: metadata.errorType,
    requestId: metadata.requestId,
    body: http.body
  })

  switch (status) {
    case 400:
      return new AiError.InvalidRequestError({
        description: errorDescription,
        metadata: { openai: metadata },
        http
      })
    case 401:
      return new AiError.AuthenticationError({
        kind: "InvalidKey",
        description: errorDescription,
        metadata: { openai: metadata },
        http
      })
    case 403:
      return new AiError.AuthenticationError({
        kind: "InsufficientPermissions",
        description: errorDescription,
        metadata: { openai: metadata },
        http
      })
    case 404:
      return new AiError.InvalidRequestError({
        description: errorDescription,
        metadata: { openai: metadata },
        http
      })
    case 409:
    case 422:
      return new AiError.InvalidRequestError({
        description: errorDescription,
        metadata: { openai: metadata },
        http
      })
    case 402:
      return new AiError.QuotaExhaustedError({
        metadata: { openai: metadata },
        http
      })
    case 429: {
      // Best-effort detection: OpenAI returns insufficient_quota for billing/quota issues
      if (
        metadata.errorCode === "insufficient_quota" ||
        metadata.errorType === "insufficient_quota" ||
        metadata.errorCode === "billing_insufficient_balance" ||
        metadata.errorType === "billing_insufficient_balance"
      ) {
        return new AiError.QuotaExhaustedError({
          metadata: { openai: metadata },
          http
        })
      }
      const { retryAfter, ...rateLimitMetadata } = parseRateLimitHeaders(headers, now)
      return new AiError.RateLimitError({
        retryAfter,
        metadata: {
          openai: {
            ...metadata,
            ...rateLimitMetadata
          }
        },
        http
      })
    }
    default:
      if (status >= 500) {
        return new AiError.InternalProviderError({
          description: message ?? "Server error",
          metadata: { openai: metadata },
          http
        })
      }
      return new AiError.UnknownError({
        description: message,
        metadata: { openai: metadata },
        http
      })
  }
}
