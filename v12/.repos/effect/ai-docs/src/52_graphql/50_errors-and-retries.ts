/**
 * @title Handling GraphQL errors, retries and rate limits
 *
 * Read rate-limit headers in a middleware, tell GraphQL errors apart by their
 * fields, and retry timeouts and rate limits with `Effect.retry`.
 */
import { Duration, Effect, Layer, Schedule } from "effect"
import { type GraphQLClientError, GraphQLMiddleware } from "effect/graphql"
import { GitHub } from "./10_basics.ts"

// Middleware see each response's HTTP `status` and `headers` on the result
// `next` returns, including responses with GraphQL `errors`. A failed call
// keeps them, and `GraphQLClientError` exposes them as `headers` and
// `status`. Attach it with `GraphQLGroup.make(...).middleware(RateLimit)`.
export class RateLimit extends GraphQLMiddleware.Service<RateLimit>()("app/RateLimit") {
  static readonly layer = Layer.succeed(RateLimit, {
    execute: ({ next, request }) =>
      Effect.tap(next(request), (result) => {
        const remaining = Number(result.headers?.["x-ratelimit-remaining"])
        return remaining < 500
          ? Effect.logWarning(`GitHub rate limit: ${remaining} points left`)
          : Effect.void
      }),
    subscribe: ({ next, request }) => next(request)
  })
}

// GraphQL errors keep fields the specification doesn't define as JSON, such
// as GitHub's top-level `type` (`NOT_FOUND`, `FORBIDDEN`, `RATE_LIMITED`).
export const hasErrorType = (error: GraphQLClientError.GraphQLClientError, type: string) =>
  error.reason._tag === "ResponseError" && error.reason.errors.every((entry) => entry.type === type)

// `isRetryable` is true for network failures, for 429 or 5xx responses, and
// for any error with a `Retry-After` header, whatever its status. That covers
// GitHub's 502 and 504 query timeouts, even with a GraphQL `errors` body, and
// its secondary rate limits (403 or 429 with `retry-after`). A primary rate
// limit can come without `retry-after`, with `x-ratelimit-remaining: 0`, so
// check that header too.
const rateLimited = (error: GraphQLClientError.GraphQLClientError) => error.headers?.["x-ratelimit-remaining"] === "0"

// Wait for `retryAfter` when it is set, and until `x-ratelimit-reset` (epoch
// seconds) on a primary rate limit. GitHub may ban an integration that keeps
// retrying while rate limited, so don't retry with a plain backoff.
const gitHubRetry = Schedule.exponential("1 second").pipe(
  Schedule.setInputType<GraphQLClientError.GraphQLClientError>(),
  Schedule.modifyDelay(({ duration, input, now }) => {
    if (input.retryAfter !== undefined) return Effect.succeed(input.retryAfter)
    if (!rateLimited(input)) return Effect.succeed(duration)
    const reset = Number(input.headers?.["x-ratelimit-reset"]) * 1000
    return Effect.succeed(Number.isFinite(reset) ? Duration.millis(Math.max(0, reset - now)) : Duration.minutes(1))
  })
)

// The client never retries queries or mutations on its own. Retry only
// mutations that are safe to send twice, and with `GraphQLClient.pages`,
// retry inside a middleware, because `Stream.retry` starts again from the
// first page. Subscriptions reconnect on their own after a retryable failure,
// on `GraphQLClient.defaultSubscriptionRetry`, which waits for `retryAfter`.
// A primary rate limit without `retry-after` isn't retryable, so it ends the
// subscription; wait until `x-ratelimit-reset` before subscribing again.
export const retryGitHub = <A, R>(effect: Effect.Effect<A, GraphQLClientError.GraphQLClientError, R>) =>
  Effect.retry(effect, {
    schedule: gitHubRetry,
    while: (error) => error.isRetryable || rateLimited(error),
    times: 5
  })

export const program = Effect.gen(function*() {
  const github = yield* GitHub
  const result = yield* retryGitHub(github.RepoIssues({ owner: "Effect-TS", name: "missing" })).pipe(
    Effect.catchIf((error) => hasErrorType(error, "NOT_FOUND"), () => Effect.succeed(null))
  )
  yield* Effect.log(result === null ? "No such repository" : `${result.repository?.issues.nodes?.length} issues`)
}).pipe(Effect.provide(GitHub.layer))
