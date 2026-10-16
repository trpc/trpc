import { LibsqlClient } from "@effect/sql-libsql"
import { Context, Effect, Layer } from "effect"
import { GenericContainer, type StartedTestContainer } from "testcontainers"

const waitForServer = async (container: StartedTestContainer) => {
  const url = `http://${container.getHost()}:${container.getMappedPort(8080)}`
  let error: unknown = undefined

  for (let i = 0; i < 60; i++) {
    try {
      await fetch(url)
      return
    } catch (cause) {
      error = cause
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }

  throw error
}

export class LibsqlContainer extends Context.Service<
  LibsqlContainer,
  StartedTestContainer
>()("test/LibsqlContainer") {
  static readonly layer = Layer.effect(this)(
    Effect.acquireRelease(
      Effect.promise(async () => {
        const container = await new GenericContainer("ghcr.io/tursodatabase/libsql-server:main")
          .withExposedPorts(8080)
          .withEnvironment({ SQLD_NODE: "primary" })
          .withCommand(["sqld", "--no-welcome", "--http-listen-addr", "0.0.0.0:8080"]).start()

        try {
          await waitForServer(container)
          return container
        } catch (error) {
          await container.stop()
          throw error
        }
      }),
      (container) => Effect.promise(() => container.stop())
    )
  )

  static layerClient = Layer.unwrap(
    Effect.gen(function*() {
      const container = yield* LibsqlContainer
      return LibsqlClient.layer({
        url: `http://${container.getHost()}:${container.getMappedPort(8080)}`
      })
    })
  ).pipe(Layer.provide(this.layer))
}
