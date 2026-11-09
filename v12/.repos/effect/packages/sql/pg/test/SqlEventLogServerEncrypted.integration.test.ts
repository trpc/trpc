import { Layer } from "effect"
import * as CompactionTest from "effect-test/eventlog/EventLogServerEncryptedCompactionTest"
import * as EncryptedTest from "effect-test/eventlog/EventLogServerEncryptedTest"
import * as SqlEventLogServerEncryptedStorageTest from "effect-test/eventlog/SqlEventLogServerEncryptedStorageTest"
import * as Digest from "effect/crypto/Digest"
import * as EventLogEncryption from "effect/eventlog/EventLogEncryption"
import * as SqlEventLogServerEncrypted from "effect/eventlog/SqlEventLogServerEncrypted"
import { Reactivity } from "effect/reactivity"
import { PgContainer } from "./utils.ts"

EncryptedTest.suite(
  "pg",
  SqlEventLogServerEncrypted.layerStorage().pipe(
    Layer.provide([PgContainer.layerClient, Reactivity.layer, EventLogEncryption.layerSubtle, Digest.layerWebCrypto])
  )
)

SqlEventLogServerEncryptedStorageTest.suite("pg", PgContainer.layerClient)

CompactionTest.suite(
  "pg",
  (options) => SqlEventLogServerEncrypted.layerStorage(options).pipe(Layer.provide(Digest.layerWebCrypto)),
  PgContainer.layerClient
)

SqlEventLogServerEncryptedStorageTest.compactionSuite("pg", PgContainer.layerClient)
