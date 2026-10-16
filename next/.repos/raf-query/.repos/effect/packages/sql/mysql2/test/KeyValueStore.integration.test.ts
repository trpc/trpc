import { Layer } from "effect"
import * as KeyValueStoreTest from "effect-test/persistence/KeyValueStoreTest"
import * as KeyValueStore from "effect/persistence/KeyValueStore"
import { MysqlContainer } from "./utils.ts"

KeyValueStoreTest.suite(
  "sql-mysql2",
  KeyValueStore.layerSql().pipe(Layer.provide(MysqlContainer.layerClient))
)

KeyValueStoreTest.suite(
  "sql-mysql2-custom-table",
  KeyValueStore.layerSql({ table: "effect_key_value_store_custom" }).pipe(
    Layer.provide(MysqlContainer.layerClient)
  )
)
