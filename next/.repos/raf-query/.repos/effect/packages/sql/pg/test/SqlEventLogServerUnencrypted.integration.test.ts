import * as SqlEventLogServerUnencryptedStorageTest from "effect-test/eventlog/SqlEventLogServerUnencryptedStorageTest"
import { PgContainer } from "./utils.ts"

SqlEventLogServerUnencryptedStorageTest.suite(
  "sql-pg",
  PgContainer.layerClient
)
