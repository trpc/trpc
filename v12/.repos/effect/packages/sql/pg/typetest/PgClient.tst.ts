import { PgClient } from "@effect/sql-pg"
import { Config, Context, Effect, type Layer, type Scope } from "effect"
import * as Reactivity from "effect/reactivity/Reactivity"
import type { SqlClient, SqlError } from "effect/sql"
import { describe, expect, it } from "tstyche"

class Prefix extends Context.Service<Prefix, string>()("Prefix") {}

const onAcquire = Effect.andThen(Effect.service(Reactivity.Reactivity), Effect.service(Prefix)).pipe(Effect.asVoid)

describe("PgClient onAcquire", () => {
  it("propagates the hook's requirements, except those the layers supply", () => {
    expect(PgClient.make({ onAcquire })).type.toBe<
      Effect.Effect<PgClient.PgClient, SqlError.SqlError, Scope.Scope | Reactivity.Reactivity | Prefix>
    >()
    expect(PgClient.layer({ onAcquire })).type.toBe<
      Layer.Layer<PgClient.PgClient | SqlClient.SqlClient, SqlError.SqlError, Prefix>
    >()
    expect(PgClient.layerConfig({ onAcquire: Config.succeed(onAcquire) })).type.toBe<
      Layer.Layer<PgClient.PgClient | SqlClient.SqlClient, Config.ConfigError | SqlError.SqlError, Prefix>
    >()
  })
})
