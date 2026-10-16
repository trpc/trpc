import { SqliteClient } from "@effect/sql-sqlite-node"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Redacted } from "effect"
import * as SqlEventLogServerUnencryptedStorageTest from "effect-test/eventlog/SqlEventLogServerUnencryptedStorageTest"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import * as EventLogEncryption from "effect/eventlog/EventLogEncryption"
import * as EventLogMessage from "effect/eventlog/EventLogMessage"
import * as EventLogServerUnencrypted from "effect/eventlog/EventLogServerUnencrypted"
import * as EventLogSessionAuth from "effect/eventlog/EventLogSessionAuth"
import { makeGetIdentityRootSecretMaterial } from "effect/eventlog/internal/identityRootSecretDerivation"
import * as SqlEventLogServerUnencrypted from "effect/eventlog/SqlEventLogServerUnencrypted"
import { Reactivity } from "effect/reactivity"
import * as RpcTest from "effect/rpc/RpcTest"
import * as SqlClient from "effect/sql/SqlClient"

SqlEventLogServerUnencryptedStorageTest.suite(
  "sql-sqlite-node",
  SqliteClient.layer({
    filename: ":memory:"
  })
)

const getIdentityRootSecretMaterial = makeGetIdentityRootSecretMaterial(globalThis.crypto)
const storeId = EventLogMessage.StoreId.make("store-a")

const makeEntry = (value: number) =>
  new EventJournal.Entry({
    id: EventJournal.makeEntryIdUnsafe(),
    event: "UserCreated",
    primaryKey: `user-${value}`,
    payload: new Uint8Array([value])
  }, { disableChecks: true })

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

describe("SqlEventLogServerUnencrypted (sql-sqlite-node)", () => {
  it.effect("forbids writing entries for another identity", () =>
    Effect.gen(function*() {
      const sql = yield* SqliteClient.make({ filename: ":memory:" })
      const storage = yield* SqlEventLogServerUnencrypted.makeStorage().pipe(
        Effect.provideService(SqlClient.SqlClient, sql),
        Effect.orDie
      )
      const rpcClient = yield* RpcTest.makeClient(EventLogMessage.EventLogRemoteRpcs).pipe(
        Effect.provide(
          EventLogServerUnencrypted.layerRpcHandlers.pipe(
            Layer.provideMerge(EventLog.layerRegistry),
            Layer.provide(Layer.succeed(EventLogServerUnencrypted.Storage, storage)),
            Layer.provide(Layer.succeed(EventLogServerUnencrypted.StoreMapping, {
              resolve: ({ storeId }) => Effect.succeed(storeId),
              hasStore: () => Effect.succeed(true)
            })),
            Layer.provide(Layer.succeed(EventLogServerUnencrypted.EventLogServerAuthorization, {
              authorizeWrite: () => Effect.void,
              authorizeRead: () => Effect.void,
              authorizeIdentity: () => Effect.void
            }))
          )
        )
      )
      const identityA = yield* EventLog.makeIdentity
      const identityB = yield* EventLog.makeIdentity
      const hello = yield* rpcClient["EventLog.Hello"]()
      yield* rpcClient["EventLog.Authenticate"](
        yield* makeAuthenticateRequest({
          identity: identityA,
          challenge: hello.challenge,
          remoteId: hello.remoteId
        })
      )
      const data = yield* new EventLogMessage.WriteEntriesUnencrypted({
        publicKey: identityB.publicKey,
        storeId,
        entries: [makeEntry(1)]
      }).encoded

      const error = yield* rpcClient["EventLog.WriteSingle"]({ data }).pipe(Effect.flip)

      assert.instanceOf(error, EventLogMessage.EventLogProtocolError)
      assert.strictEqual(error.code, "Forbidden")
      const written = yield* storage.write(storeId, [makeEntry(2)])
      assert.deepStrictEqual(written.map((entry) => entry.remoteSequence), [1])
    }).pipe(Effect.provide([Reactivity.layer, EventLogEncryption.layerSubtle])))

  it.effect("rejects session-auth rebinding for an existing publicKey", () =>
    Effect.gen(function*() {
      const sql = yield* SqliteClient.make({ filename: ":memory:" })
      const storage = yield* SqlEventLogServerUnencrypted.makeStorage().pipe(
        Effect.provideService(SqlClient.SqlClient, sql),
        Effect.orDie
      )

      const rpcClient = yield* RpcTest.makeClient(EventLogMessage.EventLogRemoteRpcs).pipe(
        Effect.provide(
          EventLogServerUnencrypted.layerRpcHandlers.pipe(
            Layer.provideMerge(EventLog.layerRegistry),
            Layer.provide(Layer.succeed(EventLogServerUnencrypted.Storage, storage)),
            Layer.provide(Layer.succeed(EventLogServerUnencrypted.StoreMapping, {
              resolve: ({ storeId }) => Effect.succeed(storeId),
              hasStore: () => Effect.succeed(true)
            })),
            Layer.provide(Layer.succeed(EventLogServerUnencrypted.EventLogServerAuthorization, {
              authorizeWrite: () => Effect.void,
              authorizeRead: () => Effect.void,
              authorizeIdentity: () => Effect.void
            }))
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
})
