import { assert, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import * as KeyValueStoreTest from "effect-test/persistence/KeyValueStoreTest"
import { KeyValueStore, Persistence } from "effect/persistence"
import { SqlClient } from "effect/sql"
import { MssqlContainer } from "./utils.ts"

// Pin a case-insensitive key collation even when the server default is binary.
const layerKvs = (table: string) =>
  Layer.unwrap(Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      CREATE TABLE ${sql(table)} (
        id NVARCHAR(450) COLLATE Latin1_General_100_CI_AS PRIMARY KEY,
        value VARBINARY(MAX) NOT NULL,
        value_type SMALLINT NOT NULL
      )
    `
    return KeyValueStore.layerSql({ table })
  })).pipe(Layer.provide(MssqlContainer.layerClient))

KeyValueStoreTest.suite("sql-mssql-ci", layerKvs("effect_key_value_store_ci"))

it.layer(
  Persistence.layerBackingKvs.pipe(Layer.provide(layerKvs("effect_backing_kvs_ci"))),
  { timeout: "90 seconds" }
)("BackingPersistence (sql-mssql-ci)", (it) => {
  it.effect("clearing a store preserves a differently cased store with a distinct entry key", () =>
    Effect.gen(function*() {
      const backing = yield* Persistence.BackingPersistence
      const lower = yield* backing.make("scope")
      const upper = yield* backing.make("SCOPE")
      yield* lower.set("one", { value: "match" }, undefined)
      yield* upper.set("two", { value: "unrelated" }, undefined)

      yield* lower.clear

      assert.strictEqual(yield* lower.get("one"), undefined)
      assert.deepStrictEqual(yield* upper.get("two"), { value: "unrelated" })
    }))
})
