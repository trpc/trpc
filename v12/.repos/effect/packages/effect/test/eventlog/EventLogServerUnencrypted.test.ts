import { assert, it } from "@effect/vitest"
import { Context, Effect, Exit, Layer, Redacted, Ref, Schema } from "effect"
import * as EventGroup from "effect/eventlog/EventGroup"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import * as EventLogEncryption from "effect/eventlog/EventLogEncryption"
import * as EventLogMessage from "effect/eventlog/EventLogMessage"
import * as EventLogServerUnencrypted from "effect/eventlog/EventLogServerUnencrypted"
import * as EventLogSessionAuth from "effect/eventlog/EventLogSessionAuth"
import { makeGetIdentityRootSecretMaterial } from "effect/eventlog/internal/identityRootSecretDerivation"
import * as RpcTest from "effect/rpc/RpcTest"
import * as RegressionTest from "./EventLogServerUnencryptedRegressionTest.ts"

RegressionTest.suite("memory", EventLogServerUnencrypted.layerStorageMemory)

const ReproGroup = EventGroup.empty.add({
  tag: "ReproEvent",
  primaryKey: (payload) => payload.key,
  payload: Schema.Struct({ key: Schema.String, value: Schema.Number })
})
const event = ReproGroup.events.ReproEvent
const OpaqueReproGroup = EventGroup.empty.add({
  tag: "ReproEvent",
  primaryKey: (payload) => payload.key,
  payload: Schema.Struct({ key: Schema.String })
})
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

it.effect("compactBacklog keeps forwarded entries in batch order", () =>
  Effect.gen(function*() {
    const makeEntry = Effect.fnUntraced(function*(key: string, value?: number) {
      return new EventJournal.Entry({
        id: EventJournal.makeEntryIdUnsafe(),
        event: "ReproEvent",
        primaryKey: key,
        payload: value === undefined
          ? yield* Schema.encodeUnknownEffect(OpaqueReproGroup.events.ReproEvent.payloadSchemaBinary)({ key })
          : yield* Schema.encodeUnknownEffect(event.payloadSchemaBinary)({ key, value })
      }, { disableChecks: true })
    })
    // The opaque entry lacks `value`, so the compactor cannot decode it.
    const entries = [
      yield* makeEntry("a", 0),
      yield* makeEntry("a"),
      yield* makeEntry("b", 2),
      yield* makeEntry("a", 3)
    ]
    const remoteEntries = entries.map((entry, remoteSequence) =>
      new EventJournal.RemoteEntry({ remoteSequence, entry })
    )
    // Output is written with the opaque entry first, then grouped by key.
    const compaction = EventLog.groupCompaction(
      ReproGroup,
      ({ entries, forward }) => Effect.forEach(entries, forward, { discard: true })
    )

    const compacted = yield* Effect.gen(function*() {
      const registry = yield* EventLog.Registry
      return yield* EventLogServerUnencrypted.compactBacklog({ remoteEntries, compactors: registry.compactors })
    }).pipe(Effect.provide(compaction.pipe(Layer.provideMerge(EventLog.layerRegistry))))

    const fields = (remoteEntry: EventJournal.RemoteEntry) =>
      [remoteEntry.remoteSequence, remoteEntry.entry.idString, remoteEntry.entry.payload] as const
    assert.deepStrictEqual(compacted.map(fields), remoteEntries.map(fields))
  }))

for (const fallback of [false, true]) {
  it.effect(
    `compactBacklog handles large groups with ${fallback ? "fallback" : "projection"}`,
    () =>
      Effect.gen(function*() {
        // Exceeds the argument limit of the former spread-based append.
        const count = 150_000
        const payload = new Uint8Array()
        const remoteEntries = Array.from({ length: count }, (_, index) =>
          new EventJournal.RemoteEntry({
            remoteSequence: index + 1,
            entry: new EventJournal.Entry({
              id: EventJournal.makeEntryIdUnsafe({ msecs: index }),
              event: event.tag,
              primaryKey: "large-group",
              payload
            }, { disableChecks: true })
          }, { disableChecks: true }))
        const registry = yield* EventLog.Registry
        yield* registry.registerCompaction({
          events: [event.tag],
          effect: Effect.fnUntraced(function*({ entries, write }) {
            for (let index = fallback ? 0 : 1; index < entries.length; index++) {
              yield* write(entries[index])
            }
            // More outputs than inputs cannot be projected onto remote sequences.
            if (fallback) yield* write(entries[0])
          })
        })

        const compacted = yield* EventLogServerUnencrypted.compactBacklog({
          remoteEntries,
          compactors: registry.compactors
        })

        assert.strictEqual(compacted.length, fallback ? count : count - 1)
        let mismatches = 0
        for (let index = 0; index < compacted.length; index++) {
          if (
            compacted[index].entry !== remoteEntries[fallback ? index : index + 1].entry ||
            compacted[index].remoteSequence !== (!fallback && index === compacted.length - 1 ? count : index + 1)
          ) {
            mismatches++
          }
        }
        assert.strictEqual(mismatches, 0)
      }).pipe(Effect.provide(EventLog.layerRegistry)),
    { timeout: 30_000, concurrent: false }
  )
}

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

it.effect("Authenticate retries a failed binding lookup for the same identity", () =>
  Effect.gen(function*() {
    const inner = yield* EventLogServerUnencrypted.makeStorageMemory
    const bindingCalls = yield* Ref.make(0)
    const client = yield* makeAuthClient({
      storage: {
        ...inner,
        getOrCreateSessionAuthBinding: (publicKey, signingPublicKey) =>
          Ref.updateAndGet(bindingCalls, (count) => count + 1).pipe(
            Effect.andThen((count) =>
              count === 1
                ? Effect.die("transient storage error")
                : inner.getOrCreateSessionAuthBinding(publicKey, signingPublicKey)
            )
          )
      },
      authorization: {
        authorizeWrite: () => Effect.void,
        authorizeRead: () => Effect.void,
        authorizeIdentity: () => Effect.void
      }
    })
    const identity = yield* EventLog.makeIdentity
    const hello = yield* client["EventLog.Hello"]()
    const error = yield* client["EventLog.Authenticate"](
      yield* authenticate({ identity, challenge: hello.challenge, remoteId: hello.remoteId })
    ).pipe(Effect.flip)
    assert.strictEqual(error.code, "Forbidden")
    assert.strictEqual(error.message, "Session auth binding lookup failed")
    assert.strictEqual(yield* Ref.get(bindingCalls), 1)

    const retryHello = yield* client["EventLog.Hello"]()
    const retry = yield* client["EventLog.Authenticate"](
      yield* authenticate({ identity, challenge: retryHello.challenge, remoteId: retryHello.remoteId })
    ).pipe(Effect.exit)
    assert.strictEqual(yield* Ref.get(bindingCalls), 2)
    assert.isTrue(Exit.isSuccess(retry))
  }).pipe(Effect.provide(EventLogEncryption.layerSubtle)))

it.effect("Authenticate caches successful binding lookups for the same identity", () =>
  Effect.gen(function*() {
    const { storage, bindingCalls } = yield* makeRecordingStorage
    const client = yield* makeAuthClient({
      storage,
      authorization: {
        authorizeWrite: () => Effect.void,
        authorizeRead: () => Effect.void,
        authorizeIdentity: () => Effect.void
      }
    })
    const identity = yield* EventLog.makeIdentity
    for (let attempt = 0; attempt < 2; attempt++) {
      const hello = yield* client["EventLog.Hello"]()
      yield* client["EventLog.Authenticate"](
        yield* authenticate({ identity, challenge: hello.challenge, remoteId: hello.remoteId })
      )
      assert.strictEqual(yield* Ref.get(bindingCalls), 1)
    }
  }).pipe(Effect.provide(EventLogEncryption.layerSubtle)))

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

const allowAll: EventLogServerUnencrypted.EventLogServerAuthorization["Service"] = {
  authorizeWrite: () => Effect.void,
  authorizeRead: () => Effect.void,
  authorizeIdentity: () => Effect.void
}

it.effect("Authenticate does not bind a signing key whose signature fails verification", () =>
  Effect.gen(function*() {
    const { storage, bindingCalls } = yield* makeRecordingStorage
    const client = yield* makeAuthClient({ storage, authorization: allowAll })
    const owner = yield* EventLog.makeIdentity
    const other = yield* EventLog.makeIdentity
    const hello = yield* client["EventLog.Hello"]()
    const request = yield* authenticate({
      identity: { publicKey: owner.publicKey, privateKey: other.privateKey },
      challenge: hello.challenge,
      remoteId: hello.remoteId
    })
    const error = yield* client["EventLog.Authenticate"](
      new EventLogMessage.Authenticate({ ...request, signature: new Uint8Array(64) })
    ).pipe(Effect.flip)
    assert.strictEqual(error.code, "Forbidden")
    assert.strictEqual(yield* Ref.get(bindingCalls), 0)

    const ownerHello = yield* client["EventLog.Hello"]()
    yield* client["EventLog.Authenticate"](
      yield* authenticate({ identity: owner, challenge: ownerHello.challenge, remoteId: ownerHello.remoteId })
    )
    assert.strictEqual(yield* Ref.get(bindingCalls), 1)
  }).pipe(Effect.provide(EventLogEncryption.layerSubtle)))

it.effect("Authenticate rejects a validly signed key that differs from the identity's binding", () =>
  Effect.gen(function*() {
    const { storage } = yield* makeRecordingStorage
    const client = yield* makeAuthClient({ storage, authorization: allowAll })
    const owner = yield* EventLog.makeIdentity
    const other = yield* EventLog.makeIdentity
    const hello = yield* client["EventLog.Hello"]()
    yield* client["EventLog.Authenticate"](
      yield* authenticate({ identity: owner, challenge: hello.challenge, remoteId: hello.remoteId })
    )

    const otherHello = yield* client["EventLog.Hello"]()
    const error = yield* client["EventLog.Authenticate"](
      yield* authenticate({
        identity: { publicKey: owner.publicKey, privateKey: other.privateKey },
        challenge: otherHello.challenge,
        remoteId: otherHello.remoteId
      })
    ).pipe(Effect.flip)
    assert.strictEqual(error.code, "Forbidden")

    const ownerHello = yield* client["EventLog.Hello"]()
    yield* client["EventLog.Authenticate"](
      yield* authenticate({ identity: owner, challenge: ownerHello.challenge, remoteId: ownerHello.remoteId })
    )
  }).pipe(Effect.provide(EventLogEncryption.layerSubtle)))

it.effect("Authenticate passes the presented signing key to identity authorization", () =>
  Effect.gen(function*() {
    const { storage, bindingCalls } = yield* makeRecordingStorage
    const owner = yield* EventLog.makeIdentity
    const other = yield* EventLog.makeIdentity
    const ownerSigningPublicKey = yield* EventLogSessionAuth.deriveSigningPublicKey(owner)
    const otherSigningPublicKey = yield* EventLogSessionAuth.deriveSigningPublicKey(other)
    const policyCalls = yield* Ref.make<ReadonlyArray<Uint8Array | undefined>>([])
    const client = yield* makeAuthClient({
      storage,
      authorization: {
        ...allowAll,
        authorizeIdentity: ({ publicKey, signingPublicKey }) =>
          Ref.update(policyCalls, (calls) => [...calls, signingPublicKey]).pipe(
            Effect.andThen(
              signingPublicKey !== undefined &&
                signingPublicKey.every((byte, index) => byte === ownerSigningPublicKey[index])
                ? Effect.void
                : Effect.fail(
                  new EventLogServerUnencrypted.EventLogServerAuthError({
                    reason: "Forbidden",
                    publicKey,
                    message: "Signing key not provisioned"
                  })
                )
            )
          )
      }
    })
    const hello = yield* client["EventLog.Hello"]()
    const error = yield* client["EventLog.Authenticate"](
      yield* authenticate({
        identity: { publicKey: owner.publicKey, privateKey: other.privateKey },
        challenge: hello.challenge,
        remoteId: hello.remoteId
      })
    ).pipe(Effect.flip)
    assert.strictEqual(error.code, "Forbidden")
    assert.strictEqual(yield* Ref.get(bindingCalls), 0)

    const ownerHello = yield* client["EventLog.Hello"]()
    yield* client["EventLog.Authenticate"](
      yield* authenticate({ identity: owner, challenge: ownerHello.challenge, remoteId: ownerHello.remoteId })
    )
    assert.deepStrictEqual(yield* Ref.get(policyCalls), [otherSigningPublicKey, ownerSigningPublicKey])
    assert.strictEqual(yield* Ref.get(bindingCalls), 1)
  }).pipe(Effect.provide(EventLogEncryption.layerSubtle)))
