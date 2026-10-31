import type { Effect, Stream, Types } from "effect"
import type { GraphQLMiddleware } from "effect/graphql"
import type { GraphQLClientError } from "effect/graphql/GraphQLClientError"
import { describe, expect, it } from "tstyche"

type ExecuteNext = Parameters<GraphQLMiddleware.Implementation["execute"]>[0]["next"]
type SubscribeNext = Parameters<GraphQLMiddleware.Implementation["subscribe"]>[0]["next"]

describe("GraphQLMiddleware", () => {
  it("next can fail with an inner middleware's error, so callers must narrow before reading reason", () => {
    expect<Effect.Error<ReturnType<ExecuteNext>>>().type.toBe<GraphQLClientError | Types.unhandled>()
    expect<Stream.Error<ReturnType<SubscribeNext>>>().type.toBe<GraphQLClientError | Types.unhandled>()
  })
})
