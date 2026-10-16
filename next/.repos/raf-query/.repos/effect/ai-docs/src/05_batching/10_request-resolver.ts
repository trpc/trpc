/**
 * @title Batching requests with RequestResolver
 *
 * Define request types with `Request.Class`, resolve them in batches with `RequestResolver`.
 */
import { Context, Effect, Exit, Layer, Request, RequestResolver, Schema, Tracer } from "effect"

export class User extends Schema.Class<User>("User")({
  id: Schema.Int,
  name: Schema.String,
  email: Schema.String
}) {}

export class UserNotFound extends Schema.TaggedError<UserNotFound>()("UserNotFound", {
  id: Schema.Int
}) {}

export class Users extends Context.Service<Users, {
  getUserById(id: number): Effect.Effect<User, UserNotFound>
}>()("app/Users") {
  static readonly layer = Layer.effect(
    Users,
    Effect.gen(function*() {
      // Request classes model a single external lookup.
      class GetUserById extends Request.Class<
        { readonly id: number },
        User, // The success type of the request
        UserNotFound, // The error type of the request
        never // The requirements type of the request, if any
      > {}

      // Simulate an external data source that supports batched lookup.
      const usersTable = new Map<number, User>([
        [1, new User({ id: 1, name: "Ada Lovelace", email: "ada@acme.dev" })],
        [2, new User({ id: 2, name: "Alan Turing", email: "alan@acme.dev" })],
        [3, new User({ id: 3, name: "Grace Hopper", email: "grace@acme.dev" })]
      ])

      const resolver = yield* RequestResolver.make<GetUserById>(Effect.fn(function*(entries) {
        for (const entry of entries) {
          const user = usersTable.get(entry.request.id)

          // If the request had requirements, you can access them with
          // `entry.context`
          const requestSpan = Context.getOption(entry.context, Tracer.ParentSpan)
          console.log("Request span", requestSpan)

          if (user) {
            // Complete requests with .completeUnsafe and pass in an Exit value
            entry.completeUnsafe(Exit.succeed(user))
          } else {
            entry.completeUnsafe(Exit.fail(new UserNotFound({ id: entry.request.id })))
          }
        }
      })).pipe(
        // Control the delay before the resolver is executed. This allows more
        // requests to be batched together, but also adds latency to the first
        // request.
        RequestResolver.setDelay("10 millis"),
        // RequestResolver.withSpan adds a span around the resolver execution,
        // and also sets up span links for each request
        RequestResolver.withSpan("Users.getUserById.resolver"),
        // RequestResolver.withCache adds a simple LRU cache to avoid repeated
        // lookups for the same ID.
        RequestResolver.withCache({ capacity: 1024 })
      )

      // Wrap the resolver in a service method. The resolver batches calls to
      // `getUserById` that occur within the delay window.
      const getUserById = (id: number) =>
        Effect.request(new GetUserById({ id }), resolver).pipe(
          Effect.withSpan("Users.getUserById", { attributes: { userId: id } })
        )

      return { getUserById } as const
    })
  )
}

// Run multiple lookups concurrently. The resolver receives one batch and
// internally deduplicates repeated IDs for the external call.
export const batchedLookupExample = Effect.gen(function*() {
  const { getUserById } = yield* Users

  // This will only trigger a single call to the resolver with the unique IDs [1, 2, 3].
  yield* Effect.forEach([1, 2, 1, 3, 2], getUserById, {
    concurrency: "unbounded"
  })
})
