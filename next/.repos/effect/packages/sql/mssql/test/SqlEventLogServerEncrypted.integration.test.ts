import { Layer } from "effect"
import * as CompactionTest from "effect-test/eventlog/EventLogServerEncryptedCompactionTest"
import * as EncryptedTest from "effect-test/eventlog/EventLogServerEncryptedTest"
import * as SqlEventLogServerEncryptedStorageTest from "effect-test/eventlog/SqlEventLogServerEncryptedStorageTest"
import * as Digest from "effect/crypto/Digest"
import * as EventLogEncryption from "effect/eventlog/EventLogEncryption"
import * as SqlEventLogServerEncrypted from "effect/eventlog/SqlEventLogServerEncrypted"
import { Reactivity } from "effect/reactivity"
import { MssqlContainer } from "./utils.ts"

EncryptedTest.suite(
  "mssql",
  SqlEventLogServerEncrypted.layerStorage().pipe(
    Layer.provide([MssqlContainer.layerClient, Reactivity.layer, EventLogEncryption.layerSubtle, Digest.layerWebCrypto])
  )
)

SqlEventLogServerEncryptedStorageTest.suite("mssql", MssqlContainer.layerClient)

CompactionTest.suite(
  "mssql",
  (options) => SqlEventLogServerEncrypted.layerStorage(options).pipe(Layer.provide(Digest.layerWebCrypto)),
  MssqlContainer.layerClient
)

SqlEventLogServerEncryptedStorageTest.compactionSuite("mssql", MssqlContainer.layerClient)
