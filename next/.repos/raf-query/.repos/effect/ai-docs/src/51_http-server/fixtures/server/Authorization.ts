import { DateTime, Effect, Layer, Redacted } from "effect"
import { Authorization, CurrentUser, Unauthorized } from "../api/Authorization.ts"
import { User, UserId } from "../domain/User.ts"

const fixedTimestamp = DateTime.makeUnsafe("2026-01-01T00:00:00Z")
const devUser = new User({
  id: UserId.make("bf3dbe33-0ad2-4c9c-9c9e-733e57bdcbee"),
  name: "Dev User",
  email: "dev@acme.com",
  createdAt: fixedTimestamp,
  updatedAt: fixedTimestamp
})

// The implementation of the Authorization middleware. It is seperate from the
// service definition to avoid leaking it into a client.
export const AuthorizationLayer = Layer.effect(
  Authorization,
  Effect.gen(function*() {
    // Here you could access services required by the middleware, like a
    // database or an external auth provider.
    yield* Effect.logInfo("Starting Authorization middleware")

    return Authorization.of({
      bearer: Effect.fn(function*(httpEffect, { credential }) {
        // Validate the token and return an Unauthorized error if it's invalid.
        const token = Redacted.value(credential)
        if (token !== "dev-token") {
          return yield* new Unauthorized({ message: "Missing or invalid bearer token" })
        }

        // Provide the current user to the rest of the stack. This will be
        // available in any endpoint or middleware that runs after this one.
        return yield* Effect.provideService(httpEffect, CurrentUser, devUser)
      })
    })
  })
)
