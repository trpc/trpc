import * as AiError from "effect/ai/AiError"
import * as Clock from "effect/Clock"
import type * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Headers from "effect/http/Headers"
import type * as HttpClientError from "effect/http/HttpClientError"
import type * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as Option from "effect/Option"
import * as Redactable from "effect/Redactable"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"

const ErrorBody = Schema.Struct({
  errors: Schema.Array(Schema.Struct({ code: Schema.Number, message: Schema.String }))
})

const decodeErrorBody = Schema.decodeUnknownOption(ErrorBody)

// an invalid Retry-After is treated as absent
const retryAfter = (raw: string | undefined, now: number): Duration.Duration | undefined => {
  if (raw === undefined) return undefined
  const retryAfter = Headers.parseRetryAfter(raw)
  return Result.isSuccess(retryAfter) ? Headers.retryAfterDelay(retryAfter.success, now) : undefined
}

const fail = (reason: AiError.AiErrorReason) =>
  Effect.fail(AiError.make({ module: "CloudflareClient", method: "createDecisions", reason }))

export const mapResponseError = Effect.fnUntraced(
  function*(response: HttpClientResponse.HttpClientResponse): Effect.fn.Return<never, AiError.AiError> {
    const { request, status } = response
    const body = yield* response.text.pipe(Effect.orElseSucceed(() => undefined))
    const parsed = yield* Effect.try(() => JSON.parse(body ?? "")).pipe(Effect.orElseSucceed(() => undefined))
    const details = Option.getOrUndefined(decodeErrorBody(parsed))
    const http = {
      response: { status, headers: Redactable.redact(response.headers) as Record<string, string> },
      body
    }
    const description = AiError.buildErrorDescription({
      status,
      method: request.method,
      url: request.url,
      body,
      message: details?.errors.map((error) => error.message).join("; "),
      errorCode: details?.errors[0]?.code,
      requestId: response.headers["cf-ray"]
    })
    if (status === 429) {
      return yield* fail(
        new AiError.RateLimitError({
          retryAfter: retryAfter(response.headers["retry-after"], yield* Clock.currentTimeMillis),
          http,
          metadata: { cloudflare: { rayId: response.headers["cf-ray"] ?? null, errors: details?.errors ?? [] } }
        })
      )
    }
    if (status === 404 || status === 422) {
      return yield* fail(new AiError.InvalidRequestError({ description, http }))
    }
    if (status >= 200 && status < 300) {
      return yield* fail(new AiError.InternalProviderError({ description, http }))
    }
    return yield* fail(AiError.reasonFromHttpStatus({ status, description, http }))
  }
)

export const mapHttpClientError = Effect.fnUntraced(
  function*(error: HttpClientError.HttpClientError): Effect.fn.Return<never, AiError.AiError> {
    const source = error.reason
    switch (source._tag) {
      case "TransportError":
      case "EncodeError":
      case "InvalidUrlError":
        return yield* fail(
          AiError.NetworkError.fromHttpClientError(
            error as HttpClientError.HttpClientError & { readonly reason: typeof source }
          )
        )
      case "DecodeError":
      case "EmptyBodyError":
        return yield* fail(
          new AiError.InvalidOutputError({
            description: source.description ?? "Failed to decode Cloudflare response"
          })
        )
      case "StatusCodeError":
        return yield* mapResponseError(source.response)
    }
  }
)
