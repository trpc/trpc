/**
 * @title Creating effects from common sources
 *
 * Learn how to create effects from various sources, including plain values,
 * synchronous code, Promise APIs, optional values, and callback-based APIs.
 */
import { Effect, Schema } from "effect"

class InvalidPayload extends Schema.TaggedError<InvalidPayload>()("InvalidPayload", {
  input: Schema.String,
  cause: Schema.Defect()
}) {}

class UserLookupError extends Schema.TaggedError<UserLookupError>()("UserLookupError", {
  userId: Schema.Int,
  cause: Schema.Defect()
}) {}

class MissingWorkspaceId extends Schema.TaggedError<MissingWorkspaceId>()("MissingWorkspaceId", {}) {}

// Some request fields are optional and may be absent.
const requestHeaders = new Map<string, string>([
  ["x-request-id", "req_1"]
])

// `Effect.succeed` wraps values you already have in memory.
export const fromValue = Effect.succeed({ env: "prod", retries: 3 })

// `Effect.sync` wraps synchronous side effects that should not throw.
export const fromSyncSideEffect = Effect.sync(() => Date.now())

// `Effect.try` wraps synchronous code that may throw.
export const parsePayload = Effect.fn("parsePayload")((input: string) =>
  Effect.try({
    try: () => JSON.parse(input) as { readonly userId: number },
    catch: (cause) => new InvalidPayload({ input, cause })
  })
)

const users = new Map<number, { readonly id: number; readonly name: string }>([
  [1, { id: 1, name: "Ada" }],
  [2, { id: 2, name: "Lin" }]
])

// `Effect.tryPromise` wraps Promise-based APIs that can reject or throw.
export const fetchUser = Effect.fn("fetchUser")((userId: number) =>
  Effect.tryPromise({
    async try() {
      const user = users.get(userId)
      if (!user) {
        throw new Error(`Missing user ${userId}`)
      }
      return user
    },
    catch: (cause) => new UserLookupError({ userId, cause })
  })
)

// `Effect.fromNullishOr` turns nullable values into a typed effect.
export const fromNullishHeader = Effect.fromNullishOr(requestHeaders.get("x-workspace-id")).pipe(
  Effect.mapError(() => new MissingWorkspaceId())
)

// `Effect.callback` wraps callback-style asynchronous APIs.
export const fromCallback = Effect.callback<number>((resume) => {
  const timeoutId = setTimeout(() => {
    resume(Effect.succeed(200))
  }, 10)

  // Return a finalizer so interruption can cancel the callback source.
  return Effect.sync(() => {
    clearTimeout(timeoutId)
  })
})
