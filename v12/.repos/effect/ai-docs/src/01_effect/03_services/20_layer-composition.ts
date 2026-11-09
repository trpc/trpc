/**
 * @title Composing services with the Layer module
 *
 * Build focused service layers, then compose them with `Layer.provide` and
 * `Layer.provideMerge` based on what services you want to expose.
 */

import { PgClient } from "@effect/sql-pg"
import { Array, Config, Context, Effect, Layer, type Option, Schema } from "effect"
import { SqlClient, SqlError } from "effect/sql"

// Define a layer for the SqlClient service
export const SqlClientLayer: Layer.Layer<
  PgClient.PgClient | SqlClient.SqlClient,
  Config.ConfigError | SqlError.SqlError
> = PgClient.layerConfig({
  url: Config.Redacted("DATABASE_URL")
})

export class UserRespositoryError extends Schema.TaggedError<UserRespositoryError>()("UserRespositoryError", {
  reason: SqlError.SqlError
}) {}

export class UserRepository extends Context.Service<UserRepository, {
  findById(id: string): Effect.Effect<
    Option.Option<{ readonly id: string; readonly name: string }>,
    UserRespositoryError
  >
}>()("myapp/UserRepository") {
  // Implement the layer for the UserRepository service, which depends on the
  // SqlClient service
  static readonly layerNoDeps: Layer.Layer<
    UserRepository,
    never,
    SqlClient.SqlClient
  > = Layer.effect(
    UserRepository,
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient

      const findById = Effect.fn("UserRepository.findById")(function*(id: string) {
        const results = yield* sql<{
          readonly id: string
          readonly name: string
        }>`SELECT * FROM users WHERE id = '${id}'`
        return Array.head(results)
      }, Effect.mapError((reason) => new UserRespositoryError({ reason })))

      return UserRepository.of({ findById })
    })
  )

  // Use Layer.provide to compose the UserRepository layer with the SqlClient
  // layer, exposing only the UserRepository service
  static readonly layer: Layer.Layer<
    UserRepository,
    Config.ConfigError | SqlError.SqlError
  > = this.layerNoDeps.pipe(
    Layer.provide(SqlClientLayer)
  )

  // Use Layer.provideMerge to compose the UserRepository layer with the SqlClient
  // layer, exposing both the UserRepository and SqlClient services
  static readonly layerWithSqlClient: Layer.Layer<
    UserRepository | SqlClient.SqlClient,
    Config.ConfigError | SqlError.SqlError
  > = this.layerNoDeps.pipe(
    Layer.provideMerge(SqlClientLayer)
  )
}
