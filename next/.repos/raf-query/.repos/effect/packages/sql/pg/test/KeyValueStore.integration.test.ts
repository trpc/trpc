import { Layer } from "effect"
import * as KeyValueStoreTest from "effect-test/persistence/KeyValueStoreTest"
import * as KeyValueStore from "effect/persistence/KeyValueStore"
import { PgContainer } from "./utils.ts"

KeyValueStoreTest.suite(
  "sql-pg",
  KeyValueStore.layerSql().pipe(Layer.provide(PgContainer.layerClient))
)

KeyValueStoreTest.suite(
  "sql-pg-custom-table",
  KeyValueStore.layerSql({ table: "effect_key_value_store_custom" }).pipe(
    Layer.provide(PgContainer.layerClient)
  )
)
