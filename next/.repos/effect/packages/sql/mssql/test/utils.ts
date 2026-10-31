import { MssqlClient } from "@effect/sql-mssql"
import { MSSQLServerContainer } from "@testcontainers/mssqlserver"
import { Context, Data, Effect, Layer, Redacted } from "effect"

export class ContainerError extends Data.TaggedError("ContainerError")<{
  cause: unknown
}> {}

export class MssqlContainer extends Context.Service<MssqlContainer>()("test/MssqlContainer", {
  make: Effect.acquireRelease(
    Effect.tryPromise({
      try: () =>
        new MSSQLServerContainer("mcr.microsoft.com/mssql/server:2022-latest")
          .acceptLicense()
          .start(),
      catch: (cause) => new ContainerError({ cause })
    }),
    (container) => Effect.promise(() => container.stop())
  )
}) {
  static readonly layer = Layer.effect(this)(this.make)

  static layerClientWith = (options: { readonly maxConnections?: number }) =>
    Layer.unwrap(
      Effect.gen(function*() {
        const container = yield* MssqlContainer
        return MssqlClient.layer({
          ...options,
          server: container.getHost(),
          port: container.getPort(),
          database: container.getDatabase(),
          username: container.getUsername(),
          password: Redacted.make(container.getPassword()),
          // Deno doesn't enforce the TLS fragment limits Tedious needs for large
          // TDS writes, so only the Deno fixture runs unencrypted. Node keeps TLS.
          encrypt: !("Deno" in globalThis),
          trustServer: true
        })
      })
    ).pipe(Layer.provideMerge(this.layer))

  static layerClient = this.layerClientWith({})
}
