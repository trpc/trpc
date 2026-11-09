import { Layer } from "effect"
import * as CompactionTest from "effect-test/eventlog/EventLogServerEncryptedCompactionTest"
import * as EncryptedTest from "effect-test/eventlog/EventLogServerEncryptedTest"
import * as SqlEventLogServerEncryptedStorageTest from "effect-test/eventlog/SqlEventLogServerEncryptedStorageTest"
import * as Digest from "effect/crypto/Digest"
import * as EventLogEncryption from "effect/eventlog/EventLogEncryption"
import * as SqlEventLogServerEncrypted from "effect/eventlog/SqlEventLogServerEncrypted"
import { Reactivity } from "effect/reactivity"
import { MysqlContainer } from "./utils.ts"

EncryptedTest.suite(
  "mysql2",
  SqlEventLogServerEncrypted.layerStorage().pipe(
    Layer.provide([MysqlContainer.layerClient, Reactivity.layer, EventLogEncryption.layerSubtle, Digest.layerWebCrypto])
  )
)

SqlEventLogServerEncryptedStorageTest.suite("mysql2", MysqlContainer.layerClientRoot)

CompactionTest.suite(
  "mysql2",
  (options) => SqlEventLogServerEncrypted.layerStorage(options).pipe(Layer.provide(Digest.layerWebCrypto)),
  MysqlContainer.layerClient
)

SqlEventLogServerEncryptedStorageTest.compactionSuite("mysql2", MysqlContainer.layerClient)
