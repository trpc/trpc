import { assert, it } from "@effect/vitest"
import { Context, Effect, Layer, Redacted, Ref, Schema } from "effect"
import * as EventGroup from "effect/eventlog/EventGroup"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import * as EventLogEncryption from "effect/eventlog/EventLogEncryption"
import * as EventLogMessage from "effect/eventlog/EventLogMessage"
import * as EventLogServerUnencrypted from "effect/eventlog/EventLogServerUnencrypted"
import * as EventLogSessionAuth from "effect/eventlog/EventLogSessionAuth"
import { makeGetIdentityRootSecretMaterial } from "effect/eventlog/internal/identityRootSecretDerivation"
import * as RpcTest from "effect/rpc/RpcTest"

const ReproGroup = EventGroup.empty.add({
  tag: "ReproEvent",
  primaryKey: (payload) => payload.key,
  payload: Schema.Struct({ key: Schema.String, value: Schema.Number })
})
const event = ReproGroup.events.ReproEvent
const storeId = EventLogMessage.StoreId.make("repro-store")
const getIdentityRootSecretMaterial = makeGetIdentityRootSecretMaterial(globalThis.crypto)

const authenticate = Effect.fnUntraced(function*(options: {
  readonly identity: EventLog.Identity["Service"]
  readonly challenge: Uint8Array
  readonly remoteId: EventJournal.RemoteId
}) {
  const material = yield* getIdentityRootSecretMaterial(options.identity)
  const signature = yield* EventLogSessionAuth.signSessionAuthPayload({
    remoteId: options.remoteId,
    challenge: options.challenge,
    publicKey: options.identity.publicKey,
    signingPublicKey: material.signingPublicKey,
    signingPrivateKey: Redacted.value(material.signingPrivateKey)
  })
  return new EventLogMessage.Authenticate({
    publicKey: options.identity.publicKey,
    signingPublicKey: material.signingPublicKey,
    signature,
    algorithm: "Ed25519"
  })
})

it.effect("indexes conflicts from the sliced history", () =>
  Effect.gen(function*() {
    const encode = Schema.encodeUnknownEffect(event.payloadSchemaBinary)
    const makeEntry = Effect.fnUntraced(function*(msecs: number, key: string, value: number) {
      return new EventJournal.Entry({
        id: EventJournal.makeEntryIdUnsafe({ msecs }),
        event: "ReproEvent",
        primaryKey: key,
        payload: yield* encode({ key, value })
      }, { disableChecks: true })
    })
    const originA = yield* makeEntry(1_000, "other-origin", 10)
    const oldSameKey = yield* makeEntry(2_000, "key", 20)
    const originB = yield* makeEntry(3_000, "key", 30)
    const newerOtherKey = yield* makeEntry(4_000, "other", 40)
    const newerSameKey = yield* makeEntry(5_000, "key", 50)

    const storage = yield* EventLogServerUnencrypted.makeStorageMemory
    yield* storage.write(storeId, [oldSameKey, newerOtherKey, newerSameKey])
    const registry = yield* EventLog.Registry.pipe(Effect.provide(EventLog.layerRegistry))
    const seenOriginA = yield* Ref.make<ReadonlyArray<EventJournal.Entry> | undefined>(undefined)
    const seenOriginB = yield* Ref.make<ReadonlyArray<EventJournal.Entry> | undefined>(undefined)
    registry.registerHandlerUnsafe({
      event: event.tag,
      handler: {
        event,
        context: Context.empty() as Context.Context<any>,
        handler: ({ payload, conflicts }) => {
          const value = (payload as { value: number }).value
          return value === 10
            ? Ref.set(seenOriginA, conflicts.map((conflict) => conflict.entry))
            : value === 30
            ? Ref.set(seenOriginB, conflicts.map((conflict) => conflict.entry))
            : Effect.void
        }
      }
    })

    const client = yield* RpcTest.makeClient(EventLogMessage.EventLogRemoteRpcs).pipe(
      Effect.provide(EventLogServerUnencrypted.layerRpcHandlers.pipe(
        Layer.provide(Layer.succeed(EventLogServerUnencrypted.Storage, storage)),
        Layer.provide(Layer.succeed(EventLog.Registry, registry)),
        Layer.provide(Layer.succeed(EventLogServerUnencrypted.StoreMapping, {
          resolve: ({ storeId }) => Effect.succeed(storeId),
          hasStore: () => Effect.succeed(true)
        })),
        Layer.provide(Layer.succeed(EventLogServerUnencrypted.EventLogServerAuthorization, {
          authorizeWrite: () => Effect.void,
          authorizeRead: () => Effect.void,
          authorizeIdentity: () => Effect.void
        }))
      ))
    )
    const identity = yield* EventLog.makeIdentity
    const hello = yield* client["EventLog.Hello"]()
    yield* client["EventLog.Authenticate"](
      yield* authenticate({
        identity,
        challenge: hello.challenge,
        remoteId: hello.remoteId
      })
    )
    const data = yield* new EventLogMessage.WriteEntriesUnencrypted({
      publicKey: identity.publicKey,
      storeId,
      entries: [originA, originB]
    }).encoded
    yield* client["EventLog.WriteSingle"]({ data })
    const originAConflicts = yield* Ref.get(seenOriginA)
    assert.isDefined(originAConflicts)
    assert.deepStrictEqual(originAConflicts.map((entry) => entry.idString), [])
    const originBConflicts = yield* Ref.get(seenOriginB)
    assert.isDefined(originBConflicts)
    assert.deepStrictEqual(originBConflicts.map((entry) => entry.idString), [newerSameKey.idString])
  }).pipe(Effect.provide(EventLogEncryption.layerSubtle)))
const makeAuthClient = (options: {
  readonly storage: EventLogServerUnencrypted.Storage["Service"]
  readonly authorization: EventLogServerUnencrypted.EventLogServerAuthorization["Service"]
}) =>
  RpcTest.makeClient(EventLogMessage.EventLogRemoteRpcs).pipe(
    Effect.provide(EventLogServerUnencrypted.layerRpcHandlers.pipe(
      Layer.provide(Layer.succeed(EventLogServerUnencrypted.Storage, options.storage)),
      Layer.provide(EventLog.layerRegistry),
      Layer.provide(Layer.succeed(EventLogServerUnencrypted.StoreMapping, {
        resolve: ({ storeId }) => Effect.succeed(storeId),
        hasStore: () => Effect.succeed(true)
      })),
      Layer.provide(Layer.succeed(EventLogServerUnencrypted.EventLogServerAuthorization, options.authorization))
    ))
  )

const makeRecordingStorage = Effect.gen(function*() {
  const bindingCalls = yield* Ref.make(0)
  const inner = yield* EventLogServerUnencrypted.makeStorageMemory
  const storage = EventLogServerUnencrypted.Storage.of({
    ...inner,
    getOrCreateSessionAuthBinding: (publicKey, signingPublicKey) =>
      Ref.update(bindingCalls, (count) => count + 1).pipe(
        Effect.andThen(inner.getOrCreateSessionAuthBinding(publicKey, signingPublicKey))
      )
  })
  return { storage, bindingCalls }
})

it.effect("Authenticate denies a first-use identity without creating a binding", () =>
  Effect.gen(function*() {
    const { storage, bindingCalls } = yield* makeRecordingStorage
    const policyCalls = yield* Ref.make<ReadonlyArray<string>>([])
    const client = yield* makeAuthClient({
      storage,
      authorization: {
        authorizeWrite: () => Effect.void,
        authorizeRead: () => Effect.void,
        authorizeIdentity: ({ publicKey }) =>
          Ref.update(policyCalls, (calls) => [...calls, publicKey]).pipe(
            Effect.andThen(Effect.fail(
              new EventLogServerUnencrypted.EventLogServerAuthError({
                reason: "Forbidden",
                publicKey,
                message: "Identity denied"
              })
            ))
          )
      }
    })
    const identity = yield* EventLog.makeIdentity
    const hello = yield* client["EventLog.Hello"]()
    const result = yield* client["EventLog.Authenticate"](
      yield* authenticate({ identity, challenge: hello.challenge, remoteId: hello.remoteId })
    ).pipe(Effect.match({
      onFailure: (error) => ({ tag: "Failed" as const, error }),
      onSuccess: () => ({ tag: "Succeeded" as const })
    }))
    assert.strictEqual(result.tag, "Failed")
    if (result.tag === "Failed") {
      assert.strictEqual(result.error._tag, "EventLogProtocolError")
      assert.strictEqual(result.error.code, "Forbidden")
    }
    assert.deepStrictEqual(yield* Ref.get(policyCalls), [identity.publicKey])
    assert.strictEqual(yield* Ref.get(bindingCalls), 0)
  }).pipe(Effect.provide(EventLogEncryption.layerSubtle)))

it.effect("Authenticate re-checks identity authorization on a cached binding", () =>
  Effect.gen(function*() {
    const { storage, bindingCalls } = yield* makeRecordingStorage
    const allowed = yield* Ref.make(true)
    const policyCalls = yield* Ref.make<ReadonlyArray<string>>([])
    const client = yield* makeAuthClient({
      storage,
      authorization: {
        authorizeWrite: () => Effect.void,
        authorizeRead: () => Effect.void,
        authorizeIdentity: ({ publicKey }) =>
          Ref.update(policyCalls, (calls) => [...calls, publicKey]).pipe(
            Effect.andThen(Ref.get(allowed)),
            Effect.andThen((allow) =>
              allow ? Effect.void : Effect.fail(
                new EventLogServerUnencrypted.EventLogServerAuthError({
                  reason: "Forbidden",
                  publicKey,
                  message: "Identity denied"
                })
              )
            )
          )
      }
    })
    const identity = yield* EventLog.makeIdentity
    const hello = yield* client["EventLog.Hello"]()
    yield* client["EventLog.Authenticate"](
      yield* authenticate({ identity, challenge: hello.challenge, remoteId: hello.remoteId })
    )
    assert.strictEqual(yield* Ref.get(bindingCalls), 1)

    yield* Ref.set(allowed, false)
    const retryHello = yield* client["EventLog.Hello"]()
    const result = yield* client["EventLog.Authenticate"](
      yield* authenticate({ identity, challenge: retryHello.challenge, remoteId: retryHello.remoteId })
    ).pipe(Effect.match({
      onFailure: (error) => ({ tag: "Failed" as const, error }),
      onSuccess: () => ({ tag: "Succeeded" as const })
    }))
    assert.strictEqual(result.tag, "Failed")
    if (result.tag === "Failed") {
      assert.strictEqual(result.error._tag, "EventLogProtocolError")
      assert.strictEqual(result.error.code, "Forbidden")
    }
    assert.deepStrictEqual(yield* Ref.get(policyCalls), [identity.publicKey, identity.publicKey])
    assert.strictEqual(yield* Ref.get(bindingCalls), 1)
  }).pipe(Effect.provide(EventLogEncryption.layerSubtle)))
