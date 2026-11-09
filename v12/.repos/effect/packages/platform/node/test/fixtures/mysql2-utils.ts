import { MysqlClient } from "@effect/sql-mysql2"
import type { StartedMySqlContainer } from "@testcontainers/mysql"
import { MySqlContainer } from "@testcontainers/mysql"
import { Context, Data, Effect, Layer, Redacted, String } from "effect"

export class ContainerError extends Data.TaggedError("ContainerError")<{
  cause: unknown
}> {}

const makeMysqlContainer = () =>
  new MySqlContainer("mysql:lts").withHealthCheck({
    test: [
      "CMD-SHELL",
      "MYSQL_PWD=\"$MYSQL_ROOT_PASSWORD\" mysqladmin ping --protocol TCP --host 127.0.0.1 --user root --silent"
    ],
    interval: 250,
    timeout: 1000,
    retries: 1000
  })

export class MysqlContainer extends Context.Service<
  MysqlContainer,
  StartedMySqlContainer
>()("test/MysqlContainer") {
  static readonly layer = Layer.effect(this)(
    Effect.acquireRelease(
      Effect.tryPromise({
        try: () => makeMysqlContainer().start(),
        catch: (cause) => new ContainerError({ cause })
      }),
      (container) => Effect.promise(() => container.stop())
    )
  )

  static client = Layer.unwrap(
    Effect.gen(function*() {
      const container = yield* MysqlContainer
      return MysqlClient.layer({
        url: Redacted.make(container.getConnectionUri())
      })
    })
  )

  static layerClient = this.client.pipe(Layer.provide(this.layer))

  static layerClientWithTransforms = Layer.unwrap(
    Effect.gen(function*() {
      const container = yield* MysqlContainer
      return MysqlClient.layer({
        url: Redacted.make(container.getConnectionUri()),
        transformQueryNames: String.camelToSnake,
        transformResultNames: String.snakeToCamel
      })
    })
  ).pipe(Layer.provide(this.layer))

  static layerVitest = Layer.effect(
    this,
    Effect.acquireRelease(
      Effect.tryPromise({
        try: () =>
          new MySqlContainer("vitess/vttestserver:mysql80").withEnvironment({
            KEYSPACES: "test,unsharded",
            NUM_SHARDS: "1,1",
            MYSQL_BIND_HOST: "0.0.0.0",
            PORT: "3303"
          }).start(),
        catch: (cause) => new ContainerError({ cause })
      }),
      (container) => Effect.promise(() => container.stop())
    )
  )

  static layerClientVitess = this.client.pipe(Layer.provide(this.layerVitest))
}
