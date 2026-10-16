import { NodeFileSystem } from "@effect/platform-node"
import { SqliteClient } from "@effect/sql-sqlite-node"
import { Effect, FileSystem, Layer } from "effect"
import * as KeyValueStoreTest from "effect-test/persistence/KeyValueStoreTest"
import * as KeyValueStore from "effect/persistence/KeyValueStore"
import { Reactivity } from "effect/reactivity"

const ClientLayer = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const dir = yield* fs.makeTempDirectoryScoped()
  return SqliteClient.layer({
    filename: dir + "/test.db"
  })
}).pipe(
  Layer.unwrap,
  Layer.provide([NodeFileSystem.layer, Reactivity.layer])
)

KeyValueStoreTest.suite(
  "sql-sqlite",
  KeyValueStore.layerSql().pipe(Layer.provide(ClientLayer))
)

KeyValueStoreTest.suite(
  "sql-sqlite-custom-table",
  KeyValueStore.layerSql({ table: "effect_key_value_store_custom" }).pipe(
    Layer.provide(ClientLayer)
  )
)
