import { SqliteClient } from "@effect/sql-sqlite-node"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Queue, Redacted, Stream } from "effect"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import * as EventLogEncryption from "effect/eventlog/EventLogEncryption"
import * as EventLogMessage from "effect/eventlog/EventLogMessage"
import type { StoreId } from "effect/eventlog/EventLogMessage"
import * as EventLogServer from "effect/eventlog/EventLogServerEncrypted"
import * as EventLogSessionAuth from "effect/eventlog/EventLogSessionAuth"
import { makeGetIdentityRootSecretMaterial } from "effect/eventlog/internal/identityRootSecretDerivation"
import * as SqlEventLogServer from "effect/eventlog/SqlEventLogServerEncrypted"
import { Reactivity } from "effect/reactivity"
import * as RpcTest from "effect/rpc/RpcTest"
import * as SqlClient from "effect/sql/SqlClient"

const storeIdA = "store-a" as StoreId
const storeIdB = "store-b" as StoreId

const makeEntry = (value: number) =>
  new EventJournal.Entry({
    id: EventJournal.makeEntryIdUnsafe(),
    event: "UserCreated",
    primaryKey: `user-${value}`,
    payload: new Uint8Array([value])
  }, { disableChecks: true })

const persistEntries = (
  encryption: EventLogEncryption.EventLogEncryption["Service"],
  identity: EventLog.Identity["Service"],
  entries: ReadonlyArray<EventJournal.Entry>
) =>
  Effect.gen(function*() {
    const encrypted = yield* encryption.encrypt(identity, entries)
    return encrypted.map(({ encryptedEntry, iv }, index) =>
      new EventLogServer.PersistedEntry({
        entryId: entries[index].id,
        iv,
        encryptedEntry
      })
    )
  })

const encodeWrite = Effect.fnUntraced(function*(
  encryption: EventLogEncryption.EventLogEncryption["Service"],
  identity: EventLog.Identity["Service"],
  entry: EventJournal.Entry
) {
  const encrypted = yield* encryption.encrypt(identity, [entry])
  return yield* new EventLogMessage.WriteEntries({
    publicKey: identity.publicKey,
    storeId: storeIdA,
    encryptedEntries: [{
      entryId: entry.id,
      iv: encrypted[0].iv,
      encryptedEntry: encrypted[0].encryptedEntry
    }]
  }).encoded
})

const makePersistedEntry = (index: number, entryId = EventJournal.makeEntryIdUnsafe()) =>
  new EventLogServer.PersistedEntry({
    entryId,
    iv: new Uint8Array(12),
    encryptedEntry: Uint8Array.of(index)
  })

const getIdentityRootSecretMaterial = makeGetIdentityRootSecretMaterial(globalThis.crypto)

const makeAuthenticateRequest = Effect.fnUntraced(function*(options: {
  readonly identity: EventLog.Identity["Service"]
  readonly challenge: Uint8Array
  readonly remoteId: EventJournal.RemoteId
}) {
  const rootSecretMaterial = yield* getIdentityRootSecretMaterial(options.identity)
  const signature = yield* EventLogSessionAuth.signSessionAuthPayload({
    remoteId: options.remoteId,
    challenge: options.challenge,
    publicKey: options.identity.publicKey,
    signingPublicKey: rootSecretMaterial.signingPublicKey,
    signingPrivateKey: Redacted.value(rootSecretMaterial.signingPrivateKey)
  })
  return new EventLogMessage.Authenticate({
    publicKey: options.identity.publicKey,
    signingPublicKey: rootSecretMaterial.signingPublicKey,
    signature,
    algorithm: "Ed25519"
  })
})

const makeAuthenticatedRpcClient = Effect.fnUntraced(function*(
  storage: EventLogServer.Storage["Service"],
  identities: ReadonlyArray<EventLog.Identity["Service"]>
) {
  const rpcClient = yield* RpcTest.makeClient(EventLogMessage.EventLogRemoteRpcs).pipe(
    Effect.provide(
      EventLogServer.layerRpcHandlers.pipe(
        Layer.provide(Layer.succeed(EventLogServer.Storage, storage))
      )
    )
  )
  for (const identity of identities) {
    const hello = yield* rpcClient["EventLog.Hello"]()
    yield* rpcClient["EventLog.Authenticate"](
      yield* makeAuthenticateRequest({
        identity,
        challenge: hello.challenge,
        remoteId: hello.remoteId
      })
    )
  }
  return rpcClient
})

const assertForbidden = Effect.fnUntraced(function*<A>(
  effect: Effect.Effect<A, EventLogMessage.EventLogProtocolError>
) {
  const error = yield* Effect.flip(effect)
  assert.instanceOf(error, EventLogMessage.EventLogProtocolError)
  assert.strictEqual(error.code, "Forbidden")
})

describe("SqlEventLogServer", () => {
  it.effect("forbids reading another identity's changes", () =>
    Effect.gen(function*() {
      const sql = yield* SqliteClient.make({ filename: ":memory:" })
      const storage = yield* SqlEventLogServer.makeStorage().pipe(
        Effect.provideService(SqlClient.SqlClient, sql)
      )
      const encryption = yield* EventLogEncryption.EventLogEncryption
      const identityA = yield* encryption.generateIdentity
      const identityB = yield* encryption.generateIdentity
      const rpcClient = yield* makeAuthenticatedRpcClient(storage, [identityA])

      yield* storage.write(identityB.publicKey, storeIdA, [makePersistedEntry(1)])
      const error = yield* rpcClient["EventLog.Changes"]({
        publicKey: identityB.publicKey,
        storeId: storeIdA,
        startSequence: 0
      }).pipe(
        Stream.take(1),
        Stream.runCollect,
        Effect.flip
      )

      assert.instanceOf(error, EventLogMessage.EventLogProtocolError)
      assert.strictEqual(error.code, "Forbidden")
    }).pipe(Effect.provide([Reactivity.layer, EventLogEncryption.layerSubtle])))

  it.effect("forbids writing entries for another identity", () =>
    Effect.gen(function*() {
      const sql = yield* SqliteClient.make({ filename: ":memory:" })
      const storage = yield* SqlEventLogServer.makeStorage().pipe(
        Effect.provideService(SqlClient.SqlClient, sql)
      )
      const encryption = yield* EventLogEncryption.EventLogEncryption
      const identityA = yield* encryption.generateIdentity
      const identityB = yield* encryption.generateIdentity
      const rpcClient = yield* makeAuthenticatedRpcClient(storage, [identityA])
      const entry = makeEntry(1)
      const data = yield* encodeWrite(encryption, identityB, entry)

      const error = yield* rpcClient["EventLog.WriteSingle"]({ data }).pipe(Effect.flip)

      assert.instanceOf(error, EventLogMessage.EventLogProtocolError)
      assert.strictEqual(error.code, "Forbidden")
      const written = yield* storage.write(identityB.publicKey, storeIdA, [makePersistedEntry(2)])
      assert.deepStrictEqual(written.map((entry) => entry.sequence), [1])
    }).pipe(Effect.provide([Reactivity.layer, EventLogEncryption.layerSubtle])))

  it.effect("forbids writing chunked entries for another identity", () =>
    Effect.gen(function*() {
      const sql = yield* SqliteClient.make({ filename: ":memory:" })
      const storage = yield* SqlEventLogServer.makeStorage().pipe(
        Effect.provideService(SqlClient.SqlClient, sql)
      )
      const encryption = yield* EventLogEncryption.EventLogEncryption
      const identityA = yield* encryption.generateIdentity
      const identityB = yield* encryption.generateIdentity
      const rpcClient = yield* makeAuthenticatedRpcClient(storage, [identityA])
      const entry = makeEntry(1)
      const data = yield* encodeWrite(encryption, identityB, entry)
      const midpoint = Math.ceil(data.byteLength / 2)
      const parts = [
        new EventLogMessage.ChunkedMessage({ id: 1, part: [0, 2], data: data.subarray(0, midpoint) }),
        new EventLogMessage.ChunkedMessage({ id: 1, part: [1, 2], data: data.subarray(midpoint) })
      ] as const

      yield* rpcClient["EventLog.WriteChunked"](parts[0])
      const error = yield* rpcClient["EventLog.WriteChunked"](parts[1]).pipe(Effect.flip)

      assert.instanceOf(error, EventLogMessage.EventLogProtocolError)
      assert.strictEqual(error.code, "Forbidden")
      const written = yield* storage.write(identityB.publicKey, storeIdA, [makePersistedEntry(2)])
      assert.deepStrictEqual(written.map((entry) => entry.sequence), [1])
    }).pipe(Effect.provide([Reactivity.layer, EventLogEncryption.layerSubtle])))

  it.effect("isolates authenticated identities between connections", () =>
    Effect.gen(function*() {
      const sql = yield* SqliteClient.make({ filename: ":memory:" })
      const storage = yield* SqlEventLogServer.makeStorage().pipe(
        Effect.provideService(SqlClient.SqlClient, sql)
      )
      const encryption = yield* EventLogEncryption.EventLogEncryption
      const identityA = yield* encryption.generateIdentity
      const identityB = yield* encryption.generateIdentity
      const handlers = yield* Layer.build(
        EventLogServer.layerRpcHandlers.pipe(
          Layer.provide(Layer.succeed(EventLogServer.Storage, storage))
        )
      )
      const rpcClientA = yield* RpcTest.makeClient(EventLogMessage.EventLogRemoteRpcs).pipe(
        Effect.provide(handlers)
      )
      const rpcClientB = yield* RpcTest.makeClient(EventLogMessage.EventLogRemoteRpcs).pipe(
        Effect.provide(handlers)
      )
      const helloA = yield* rpcClientA["EventLog.Hello"]()
      yield* rpcClientA["EventLog.Authenticate"](
        yield* makeAuthenticateRequest({
          identity: identityA,
          challenge: helloA.challenge,
          remoteId: helloA.remoteId
        })
      )
      const helloB = yield* rpcClientB["EventLog.Hello"]()
      yield* rpcClientB["EventLog.Authenticate"](
        yield* makeAuthenticateRequest({
          identity: identityB,
          challenge: helloB.challenge,
          remoteId: helloB.remoteId
        })
      )
      const data = yield* encodeWrite(encryption, identityB, makeEntry(1))
      const midpoint = Math.ceil(data.byteLength / 2)
      const parts = [
        new EventLogMessage.ChunkedMessage({ id: 1, part: [0, 2], data: data.subarray(0, midpoint) }),
        new EventLogMessage.ChunkedMessage({ id: 1, part: [1, 2], data: data.subarray(midpoint) })
      ] as const

      yield* storage.write(identityB.publicKey, storeIdA, [makePersistedEntry(1)])
      yield* assertForbidden(
        rpcClientA["EventLog.Changes"]({
          publicKey: identityB.publicKey,
          storeId: storeIdA,
          startSequence: 0
        }).pipe(Stream.take(1), Stream.runCollect)
      )
      yield* assertForbidden(rpcClientA["EventLog.WriteSingle"]({ data }))
      yield* rpcClientA["EventLog.WriteChunked"](parts[0])
      yield* assertForbidden(rpcClientA["EventLog.WriteChunked"](parts[1]))
    }).pipe(Effect.provide([Reactivity.layer, EventLogEncryption.layerSubtle])))

  it.effect("supports multiple authenticated identities on one connection", () =>
    Effect.gen(function*() {
      const sql = yield* SqliteClient.make({ filename: ":memory:" })
      const storage = yield* SqlEventLogServer.makeStorage().pipe(
        Effect.provideService(SqlClient.SqlClient, sql)
      )
      const encryption = yield* EventLogEncryption.EventLogEncryption
      const identityA = yield* encryption.generateIdentity
      const identityB = yield* encryption.generateIdentity
      const rpcClient = yield* makeAuthenticatedRpcClient(storage, [identityA, identityB])
      const entryA = makeEntry(1)
      const entryB = makeEntry(2)
      const dataA = yield* encodeWrite(encryption, identityA, entryA)
      const dataB = yield* encodeWrite(encryption, identityB, entryB)

      yield* rpcClient["EventLog.WriteSingle"]({ data: dataA })
      yield* rpcClient["EventLog.WriteSingle"]({ data: dataB })
      const changesA = yield* rpcClient["EventLog.Changes"]({
        publicKey: identityA.publicKey,
        storeId: storeIdA,
        startSequence: 0
      }).pipe(Stream.take(1), Stream.runCollect)
      const changesB = yield* rpcClient["EventLog.Changes"]({
        publicKey: identityB.publicKey,
        storeId: storeIdA,
        startSequence: 0
      }).pipe(Stream.take(1), Stream.runCollect)

      assert.strictEqual(changesA.length, 1)
      assert.strictEqual(changesB.length, 1)
    }).pipe(Effect.provide([Reactivity.layer, EventLogEncryption.layerSubtle])))

  it.effect("persists remote id across storage instances", () =>
    Effect.gen(function*() {
      const sql = yield* SqliteClient.make({ filename: ":memory:" })
      const storageA = yield* SqlEventLogServer.makeStorage().pipe(
        Effect.provideService(SqlClient.SqlClient, sql)
      )
      const storageB = yield* SqlEventLogServer.makeStorage().pipe(
        Effect.provideService(SqlClient.SqlClient, sql)
      )
      const idA = yield* storageA.getId
      const idB = yield* storageB.getId
      assert.deepStrictEqual(idA, idB)
    }).pipe(Effect.provide([Reactivity.layer, EventLogEncryption.layerSubtle])))

  it.effect("rejects session-auth rebinding for an existing publicKey", () =>
    Effect.gen(function*() {
      const sql = yield* SqliteClient.make({ filename: ":memory:" })
      const storage = yield* SqlEventLogServer.makeStorage().pipe(
        Effect.provideService(SqlClient.SqlClient, sql)
      )
      const rpcClient = yield* RpcTest.makeClient(EventLogMessage.EventLogRemoteRpcs).pipe(
        Effect.provide(
          EventLogServer.layerRpcHandlers.pipe(
            Layer.provide(Layer.succeed(EventLogServer.Storage, storage))
          )
        )
      )

      const firstIdentity = yield* EventLog.makeIdentity
      const secondIdentitySeed = yield* EventLog.makeIdentity
      const secondIdentity: EventLog.Identity["Service"] = {
        publicKey: firstIdentity.publicKey,
        privateKey: secondIdentitySeed.privateKey
      }

      const firstMaterial = yield* getIdentityRootSecretMaterial(firstIdentity)
      const secondMaterial = yield* getIdentityRootSecretMaterial(secondIdentity)
      const sameSigningPublicKey =
        firstMaterial.signingPublicKey.byteLength === secondMaterial.signingPublicKey.byteLength &&
        firstMaterial.signingPublicKey.every((byte, index) => byte === secondMaterial.signingPublicKey[index])
      assert.strictEqual(sameSigningPublicKey, false)

      const firstHello = yield* rpcClient["EventLog.Hello"]()
      yield* rpcClient["EventLog.Authenticate"](
        yield* makeAuthenticateRequest({
          identity: firstIdentity,
          challenge: firstHello.challenge,
          remoteId: firstHello.remoteId
        })
      )

      const secondHello = yield* rpcClient["EventLog.Hello"]()
      const error = yield* rpcClient["EventLog.Authenticate"](
        yield* makeAuthenticateRequest({
          identity: secondIdentity,
          challenge: secondHello.challenge,
          remoteId: secondHello.remoteId
        })
      ).pipe(Effect.flip)

      assert.instanceOf(error, EventLogMessage.EventLogProtocolError)
      assert.strictEqual(error.code, "Forbidden")
      assert.strictEqual(error.message, "Session auth signature verification failed")
    }).pipe(Effect.provide([Reactivity.layer, EventLogEncryption.layerSubtle])))

  it.effect("writes entries and streams changes", () =>
    Effect.gen(function*() {
      const sql = yield* SqliteClient.make({ filename: ":memory:" })
      const storage = yield* SqlEventLogServer.makeStorage().pipe(
        Effect.provideService(SqlClient.SqlClient, sql)
      )
      const encryption = yield* EventLogEncryption.EventLogEncryption
      const identity = yield* encryption.generateIdentity
      const entries = [makeEntry(1), makeEntry(2)]
      const persisted = yield* persistEntries(encryption, identity, entries)
      const written = yield* storage.write(identity.publicKey, storeIdA, persisted)
      assert.deepStrictEqual(written.map((entry) => entry.sequence), [1, 2])

      const changes = yield* storage.changes(identity.publicKey, storeIdA, 0).pipe(
        Stream.toQueue({ capacity: "unbounded" })
      )
      const taken = yield* Queue.takeAll(changes)
      assert.deepStrictEqual(taken.map((entry) => entry.sequence), [1, 2])

      const nextEntry = makeEntry(3)
      const nextPersisted = yield* persistEntries(encryption, identity, [nextEntry])
      const updated = yield* storage.write(identity.publicKey, storeIdA, nextPersisted)
      assert.deepStrictEqual(updated.map((entry) => entry.sequence), [3])

      const next = yield* Queue.take(changes)
      assert.strictEqual(next.sequence, 3)
    }).pipe(Effect.provide([Reactivity.layer, EventLogEncryption.layerSubtle])))

  it.effect("isolates same publicKey across storeIds", () =>
    Effect.gen(function*() {
      const sql = yield* SqliteClient.make({ filename: ":memory:" })
      const storage = yield* SqlEventLogServer.makeStorage().pipe(
        Effect.provideService(SqlClient.SqlClient, sql)
      )

      yield* storage.write("client-1", storeIdA, [makePersistedEntry(1)])
      yield* storage.write("client-1", storeIdB, [makePersistedEntry(2)])

      const storeAEntries = yield* storage.changes("client-1", storeIdA, 0).pipe(
        Stream.take(1),
        Stream.runCollect
      )
      const storeBEntries = yield* storage.changes("client-1", storeIdB, 0).pipe(
        Stream.take(1),
        Stream.runCollect
      )

      assert.deepStrictEqual(storeAEntries.map((entry) => entry.sequence), [1])
      assert.deepStrictEqual(storeBEntries.map((entry) => entry.sequence), [1])
    }).pipe(Effect.provide([Reactivity.layer, EventLogEncryption.layerSubtle])))

  it.effect("isolates same storeId across publicKeys", () =>
    Effect.gen(function*() {
      const sql = yield* SqliteClient.make({ filename: ":memory:" })
      const storage = yield* SqlEventLogServer.makeStorage().pipe(
        Effect.provideService(SqlClient.SqlClient, sql)
      )

      yield* storage.write("client-1", storeIdA, [makePersistedEntry(1)])
      yield* storage.write("client-2", storeIdA, [makePersistedEntry(2)])

      const clientOneEntries = yield* storage.changes("client-1", storeIdA, 0).pipe(
        Stream.take(1),
        Stream.runCollect
      )
      const clientTwoEntries = yield* storage.changes("client-2", storeIdA, 0).pipe(
        Stream.take(1),
        Stream.runCollect
      )

      assert.deepStrictEqual(clientOneEntries.map((entry) => entry.sequence), [1])
      assert.deepStrictEqual(clientTwoEntries.map((entry) => entry.sequence), [1])
    }).pipe(Effect.provide([Reactivity.layer, EventLogEncryption.layerSubtle])))

  it.effect("keeps deduplication isolated per encrypted scope", () =>
    Effect.gen(function*() {
      const sql = yield* SqliteClient.make({ filename: ":memory:" })
      const storage = yield* SqlEventLogServer.makeStorage().pipe(
        Effect.provideService(SqlClient.SqlClient, sql)
      )
      const sharedEntryId = EventJournal.makeEntryIdUnsafe()

      yield* storage.write("client-1", storeIdA, [makePersistedEntry(1, sharedEntryId)])
      yield* storage.write("client-1", storeIdA, [makePersistedEntry(2, sharedEntryId)])
      yield* storage.write("client-1", storeIdB, [makePersistedEntry(3, sharedEntryId)])
      yield* storage.write("client-2", storeIdA, [makePersistedEntry(4, sharedEntryId)])

      assert.deepStrictEqual(
        (yield* storage.changes("client-1", storeIdA, 0).pipe(
          Stream.take(1),
          Stream.runCollect
        )).map((entry) => entry.sequence),
        [1]
      )
      assert.deepStrictEqual(
        (yield* storage.changes("client-1", storeIdB, 0).pipe(
          Stream.take(1),
          Stream.runCollect
        )).map((entry) => entry.sequence),
        [1]
      )
      assert.deepStrictEqual(
        (yield* storage.changes("client-2", storeIdA, 0).pipe(
          Stream.take(1),
          Stream.runCollect
        )).map((entry) => entry.sequence),
        [1]
      )
    }).pipe(Effect.provide([Reactivity.layer, EventLogEncryption.layerSubtle])))
})
