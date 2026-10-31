import * as AiError from "effect/ai/AiError"
import * as Clock from "effect/Clock"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Headers from "effect/http/Headers"
import type * as HttpClientError from "effect/http/HttpClientError"
import * as Num from "effect/Number"
import * as Option from "effect/Option"
import * as Redactable from "effect/Redactable"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"

const ErrorBody = Schema.Struct({
  message: Schema.optional(Schema.String),
  type: Schema.optional(Schema.String),
  code: Schema.optional(Schema.String)
})

const decodeErrorBody = Schema.decodeUnknownOption(ErrorBody)

const nonNegative = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined
  const parsed = Option.getOrUndefined(Num.parse(value))
  return parsed !== undefined && Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

// `retry-after-ms` is TypeSafe-specific and wins over the standard header;
// an invalid Retry-After is treated as absent
const retryAfter = (headers: Readonly<Record<string, string>>, now: number) => {
  const ms = nonNegative(headers["retry-after-ms"])
  if (ms !== undefined) return Duration.millis(ms)
  const raw = headers["retry-after"]
  if (raw === undefined) return undefined
  const retryAfter = Headers.parseRetryAfter(raw)
  return Result.isSuccess(retryAfter) ? Headers.retryAfterDelay(retryAfter.success, now) : undefined
}

export const mapSchemaError = (error: Schema.SchemaError, method: string): AiError.AiError =>
  AiError.make({
    module: "TypeSafeClient",
    method,
    reason: AiError.InvalidResponseError.fromSchemaError(error)
  })

export const mapHttpClientError = Effect.fnUntraced(
  function*(error: HttpClientError.HttpClientError, method: string): Effect.fn.Return<never, AiError.AiError> {
    const source = error.reason
    let reason: AiError.AiErrorReason
    switch (source._tag) {
      case "TransportError":
      case "EncodeError":
      case "InvalidUrlError":
        reason = AiError.NetworkError.fromHttpClientError(
          error as HttpClientError.HttpClientError & { readonly reason: typeof source }
        )
        break
      case "DecodeError":
      case "EmptyBodyError":
        reason = new AiError.InvalidOutputError({
          description: source.description ?? "Failed to decode TypeSafe response"
        })
        break
      case "StatusCodeError": {
        const { request, response } = source
        const body = yield* response.text.pipe(Effect.catch(() => Effect.succeed(source.description)))
        const parsed = yield* Effect.try(() => JSON.parse(body ?? "")).pipe(Effect.orElseSucceed(() => undefined))
        const details = Option.getOrUndefined(decodeErrorBody(parsed))
        const http = {
          response: { status: response.status, headers: Redactable.redact(response.headers) as Record<string, string> },
          body
        }
        const description = AiError.buildErrorDescription({
          status: response.status,
          method: request.method,
          url: request.url,
          body,
          message: details?.message,
          errorCode: details?.code,
          errorType: details?.type,
          requestId: response.headers["x-typesafe-request-id"]
        })
        if (response.status === 429) {
          reason = new AiError.RateLimitError({
            retryAfter: retryAfter(response.headers, yield* Clock.currentTimeMillis),
            http,
            metadata: {
              typesafe: {
                requestId: response.headers["x-typesafe-request-id"] ?? null,
                errorCode: details?.code ?? null,
                errorType: details?.type ?? null
              }
            }
          })
        } else if (response.status === 404 || response.status === 422) {
          reason = new AiError.InvalidRequestError({ description, http })
        } else {
          reason = AiError.reasonFromHttpStatus({ status: response.status, description, http })
        }
        break
      }
    }
    return yield* AiError.make({ module: "TypeSafeClient", method, reason })
  }
)
