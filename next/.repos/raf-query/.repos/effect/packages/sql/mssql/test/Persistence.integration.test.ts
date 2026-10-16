import { it } from "@effect/vitest"
import { Layer } from "effect"
import * as PersistedCacheTest from "effect-test/persistence/PersistedCacheTest"
import * as PersistedQueueTest from "effect-test/persistence/PersistedQueueTest"
import { PersistedQueue, Persistence } from "effect/persistence"
import { MssqlContainer } from "./utils.ts"

PersistedCacheTest.suite(
  "sql-mssql-multi",
  Persistence.layerSqlMultiTable.pipe(Layer.provide(MssqlContainer.layerClient))
)

PersistedCacheTest.suite(
  "sql-mssql-single",
  Persistence.layerSql.pipe(Layer.provide(MssqlContainer.layerClient))
)

// Allow extra time for MSSQL-backed layer setup and teardown under CI load.
// Keep the queue test bodies at their 30-second timeout.
PersistedQueueTest.suiteWith(
  "sql-mssql",
  PersistedQueue.layerStoreSql().pipe(Layer.provide(MssqlContainer.layerClient)),
  it,
  "30 seconds",
  "90 seconds"
)
