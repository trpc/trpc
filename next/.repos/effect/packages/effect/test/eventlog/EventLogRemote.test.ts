import { assert, describe, it } from "@effect/vitest"
import { Array, Context, Deferred, Effect, Exit, Fiber, Layer, Option, Queue, type Scope, Stream } from "effect"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import * as EventLogEncryption from "effect/eventlog/EventLogEncryption"
import * as EventLogMessage from "effect/eventlog/EventLogMessage"
import * as EventLogRemote from "effect/eventlog/EventLogRemote"
import * as EventLogServer from "effect/eventlog/EventLogServer"
import * as EventLogServerEncrypted from "effect/eventlog/EventLogServerEncrypted"
import * as EventLogServerUnencrypted from "effect/eventlog/EventLogServerUnencrypted"
import * as EventLogSessionAuth from "effect/eventlog/EventLogSessionAuth"
import { makeGetIdentityRootSecretMaterial } from "effect/eventlog/internal/identityRootSecretDerivation"
import type * as Rpc from "effect/rpc/Rpc"
import * as RpcClient from "effect/rpc/RpcClient"
import * as RpcClientError from "effect/rpc/RpcClientError"
import type * as RpcGroup from "effect/rpc/RpcGroup"
import type { FromServer } from "effect/rpc/RpcMessage"
import * as RpcServer from "effect/rpc/RpcServer"
import * as RpcTest from "effect/rpc/RpcTest"
import * as Socket from "effect/socket/Socket"
import { TestClock } from "effect/testing"

describe("EventLogRemote", () => {
  it.effect("retries wrapped Forbidden authentication errors", () =>
    Effect.gen(function*() {
      const harness = yield* makeHarness(EventLogRemote.makeUnencrypted)
      const identity = yield* EventLog.makeIdentity
      let authenticationAttempts = 0

      yield* Effect.forever(Effect.gen(function*() {
        const request = yield* harness.take
        if (request._tag === "EventLog.Hello") {
          request.resume(Effect.succeed(new EventLogMessage.HelloResponse({ remoteId, challenge })))
        } else if (request._tag === "EventLog.Authenticate") {
          authenticationAttempts++
          request.resume(
            authenticationAttempts === 1
              ? Effect.fail(
                new EventLogMessage.EventLogProtocolError({
                  requestTag: "Authenticate",
                  publicKey: undefined,
                  code: "Forbidden",
                  message: "Session auth challenge has expired"
                })
              )
              : Effect.void
          )
        } else if (request._tag === "EventLog.WriteSingle") {
          request.resume(Effect.void)
        }
      })).pipe(Effect.forkChild)

      yield* harness.remote.write({
        identity,
        storeId: defaultStoreId,
        entries: [makeEntry()]
      })

      assert.strictEqual(authenticationAttempts, 2)
    }).pipe(Effect.provide(EventLogEncryption.layerSubtle)))

  it.effect("makeUnencrypted authenticates before writing plaintext entries", () =>
    Effect.gen(function*() {
      const harness = yield* makeHarness(EventLogRemote.makeUnencrypted)
      const identity = yield* EventLog.makeIdentity
      const entry = makeEntry()

      const writeFiber = yield* harness.remote.write({
        identity,
        storeId: defaultStoreId,
        entries: [entry]
      }).pipe(Effect.forkChild)
      yield* authenticate({ harness, identity })

      const request = yield* harness.take
      assert(request._tag === "EventLog.WriteSingle")
      const payload = request.request as Rpc.Payload<typeof EventLogMessage.WriteSingleRpc>
      const decoded = yield* EventLogMessage.WriteEntriesUnencrypted.decode(payload.data)

      assert.strictEqual(decoded.publicKey, identity.publicKey)
      assert.strictEqual(decoded.storeId, defaultStoreId)
      assert.strictEqual(decoded.entries.length, 1)
      assert.strictEqual(decoded.entries[0].idString, entry.idString)
      const acks = [{ entryId: entry.id, sequence: 5 }]
      request.resume(Effect.succeed(acks))
      assert.deepStrictEqual(yield* Fiber.join(writeFiber), acks)
    }).pipe(Effect.provide(EventLogEncryption.layerSubtle)))

  it.effect("pipelines at most four chunks and retains completion acks before a later empty response", () =>
    Effect.gen(function*() {
      const harness = yield* makeHarness(EventLogRemote.makeUnencrypted)
      const identity = yield* EventLog.makeIdentity
      const entry = makeEntry({ payloadSize: EventLogMessage.ChunkedMessage.chunkSize * 4 })
      const write = yield* harness.remote.write({
        identity,
        storeId: defaultStoreId,
        entries: [entry]
      }).pipe(Effect.forkChild)
      yield* authenticate({ harness, identity })

      const first = yield* harness.take
      assert(first._tag === "EventLog.WriteChunked")
      // A virtual deadline turns a sequential sender into an assertion failure,
      // rather than hanging the test while the first response is withheld.
      const takeChunk = Effect.gen(function*() {
        const pending = yield* harness.take.pipe(Effect.timeoutOption("1 second"), Effect.forkChild)
        yield* TestClock.adjust("1 second")
        const result = yield* Fiber.join(pending)
        assert(Option.isSome(result), "expected another chunk before acknowledging the first")
        assert(result.value._tag === "EventLog.WriteChunked")
        return result.value
      })
      const second = yield* takeChunk
      const third = yield* takeChunk
      const fourth = yield* takeChunk
      const pendingFifth = yield* harness.take.pipe(Effect.timeoutOption("1 second"), Effect.forkChild)
      yield* TestClock.adjust("1 second")
      assert.isTrue(Option.isNone(yield* Fiber.join(pendingFifth)), "expected the fifth chunk to wait for a response")

      second.resume(Effect.succeed([]))
      const fifth = yield* takeChunk
      const parts = [first, second, third, fourth, fifth].map((request) =>
        request.request as Rpc.Payload<typeof EventLogMessage.WriteChunkedRpc>
      )
      assert.deepStrictEqual(parts.map((part) => part.part), [[0, 5], [1, 5], [2, 5], [3, 5], [4, 5]])
      assert.isTrue(parts.every((part) => part.id === parts[0].id))

      // Part 0 completes the message; part 4 has a delayed empty reply.
      third.resume(Effect.succeed([]))
      fourth.resume(Effect.succeed([]))
      const acks = [{ entryId: entry.id, sequence: 5 }]
      first.resume(Effect.succeed(acks))
      yield* TestClock.adjust("1 second")
      fifth.resume(Effect.succeed([]))
      assert.deepStrictEqual(yield* Fiber.join(write), acks)
    }).pipe(Effect.provide(EventLogEncryption.layerSubtle)))

  it.effect("makeEncrypted authenticates before writing encrypted entries", () =>
    Effect.gen(function*() {
      const harness = yield* makeHarness(EventLogRemote.makeEncrypted)
      const identity = yield* EventLog.makeIdentity

      const writeFiber = yield* harness.remote.write({
        identity,
        storeId: defaultStoreId,
        entries: [makeEntry()]
      }).pipe(Effect.forkScoped)
      yield* authenticate({ harness, identity })

      const request = yield* harness.take
      assert(request._tag === "EventLog.WriteSingle")
      const payload = request.request as Rpc.Payload<typeof EventLogMessage.WriteSingleRpc>
      const decoded = yield* EventLogMessage.WriteEntries.decode(payload.data)

      assert.strictEqual(decoded.publicKey, identity.publicKey)
      assert.strictEqual(decoded.storeId, defaultStoreId)
      assert.strictEqual(decoded.batches.length, 1)
      assert.strictEqual(decoded.batches[0].entryIds.length, 1)

      request.resume(Effect.void)
      yield* Fiber.join(writeFiber)
    }).pipe(Effect.provide(EventLogEncryption.layerSubtle)))

  it.effect("makeEncrypted authenticates an existing identity with its bound signing key", () =>
    Effect.gen(function*() {
      const harness = yield* makeHarness(EventLogRemote.makeEncrypted)
      // Servers persist the first signing key seen for a public key, so the
      // key derived from an existing identity must not change.
      const identity = EventLog.decodeIdentityString(
        "eyJwdWJsaWNLZXkiOiJldmVudGxvZy1jb21wYXQiLCJwcml2YXRlS2V5IjoiQUFFQ0F3UUZCZ2NJQ1FvTERBME9EeEFSRWhNVUZSWVhHQmthR3h3ZEhoOD0ifQ"
      )

      yield* harness.remote.write({
        identity,
        storeId: defaultStoreId,
        entries: [makeEntry()]
      }).pipe(Effect.forkScoped)

      const auth = yield* harness.take
      assert(auth._tag === "EventLog.Authenticate")
      const payload = auth.request as Rpc.Payload<typeof EventLogMessage.AuthenticateRpc>
      assert.deepStrictEqual(
        payload.signingPublicKey,
        Uint8Array.from(
          "166a4b5a7f8c32a6517e2a37208bcb2d02926d4c49edda85134b80547234b090".match(/../g)!,
          (byte) => parseInt(byte, 16)
        )
      )
      assert.isTrue(
        yield* EventLogSessionAuth.verifySessionAuthenticateRequest({ remoteId, challenge, ...payload })
      )
    }).pipe(Effect.provide(EventLogEncryption.layerSubtle)))
})

class RemoteHarness extends Context.Service<RemoteHarness, {
  readonly remote: EventLogRemote.EventLogRemote["Service"]
  readonly take: Effect.Effect<{
    readonly _tag: Rpc.Tag<RpcGroup.Rpcs<typeof EventLogMessage.EventLogRemoteRpcs>>
    readonly request: Rpc.Payload<RpcGroup.Rpcs<typeof EventLogMessage.EventLogRemoteRpcs>>
    readonly resume: (response: Effect.Effect<unknown, unknown>) => void
  }>
}>()("RemoteHarness") {}

const makeHarness = Effect.fn(function*(
  makeClient: Effect.Effect<
    EventLogRemote.EventLogRemote["Service"],
    EventLogRemote.EventLogRemoteError,
    EventLogEncryption.EventLogEncryption | EventLogRemote.EventLogRemoteClient | EventLog.Registry | Scope.Scope
  >
): Effect.fn.Return<
  RemoteHarness["Service"],
  EventLogRemote.EventLogRemoteError,
  Scope.Scope
> {
  const requests = yield* Queue.make<{
    readonly _tag: Rpc.Tag<RpcGroup.Rpcs<typeof EventLogMessage.EventLogRemoteRpcs>>
    readonly request: Rpc.Payload<RpcGroup.Rpcs<typeof EventLogMessage.EventLogRemoteRpcs>>
    readonly resume: (response: Effect.Effect<unknown, unknown>) => void
  }>()

  const handleRequest = (tag: string) => <A, E>(request: any) =>
    Effect.callback<A, E>((resume) => {
      Queue.offerUnsafe(requests, {
        _tag: tag as any,
        request,
        resume: resume as any
      })
    })

  const client = yield* RpcTest.makeClient(EventLogMessage.EventLogRemoteRpcs).pipe(
    Effect.provide(EventLogMessage.EventLogRemoteRpcs.toLayer({
      "EventLog.Hello": handleRequest("EventLog.Hello"),
      "EventLog.Authenticate": handleRequest("EventLog.Authenticate"),
      "EventLog.WriteChunked": handleRequest("EventLog.WriteChunked"),
      "EventLog.WriteSingle": handleRequest("EventLog.WriteSingle"),
      "EventLog.Changes": handleRequest("EventLog.Changes")
    })),
    Effect.provideService(
      EventLogMessage.EventLogAuthentication,
      (effect) => Effect.provideService(effect, EventLog.Identity, {} as any)
    )
  )
  const remote = yield* makeClient.pipe(
    Effect.provideService(EventLogRemote.EventLogRemoteClient, client),
    Effect.provide([EventLogEncryption.layerSubtle, EventLog.layerRegistry]),
    Effect.forkChild
  )

  const hello = yield* Queue.take(requests)
  assert(hello._tag === "EventLog.Hello")
  hello.resume(Effect.succeed(
    new EventLogMessage.HelloResponse({
      remoteId,
      challenge
    })
  ))

  return RemoteHarness.of({
    remote: yield* Fiber.join(remote),
    take: Queue.take(requests)
  })
})

const makeEntry = (options?: {
  readonly primaryKey?: string | undefined
  readonly payloadSize?: number | undefined
}): EventJournal.Entry =>
  new EventJournal.Entry({
    id: EventJournal.makeEntryIdUnsafe(),
    event: "UserCreated",
    primaryKey: options?.primaryKey ?? "user-1",
    payload: new Uint8Array(options?.payloadSize ?? 4).fill(1)
  })

const defaultStoreId = EventLogMessage.StoreId.make("default")
const remoteId = EventJournal.makeRemoteIdUnsafe()
const challenge = new Uint8Array(16).fill(1)
const getIdentityRootSecretMaterial = makeGetIdentityRootSecretMaterial(globalThis.crypto)

const authenticate = Effect.fnUntraced(function*(options: {
  readonly harness: RemoteHarness["Service"]
  readonly identity: EventLog.Identity["Service"]
}) {
  const auth = yield* options.harness.take
  assert(auth._tag === "EventLog.Authenticate")
  const payload = auth.request as Rpc.Payload<typeof EventLogMessage.AuthenticateRpc>
  const rootSecretMaterial = yield* getIdentityRootSecretMaterial(options.identity)

  assert.strictEqual(payload.publicKey, options.identity.publicKey)
  assert.strictEqual(payload.algorithm, "Ed25519")
  assert.deepStrictEqual(payload.signingPublicKey, rootSecretMaterial.signingPublicKey)

  const verified = yield* EventLogSessionAuth.verifySessionAuthenticateRequest({
    remoteId,
    challenge,
    publicKey: payload.publicKey,
    signingPublicKey: payload.signingPublicKey,
    signature: payload.signature,
    algorithm: payload.algorithm
  })
  assert.isTrue(verified)
  auth.resume(Effect.void)
})

type Rpcs = RpcGroup.Rpcs<typeof EventLogMessage.EventLogRemoteRpcs>

// One RPC server shared by connections with distinct client ids.
const makeServer = Effect.fnUntraced(function*(encrypted: boolean) {
  const handlers = yield* Layer.build(
    encrypted
      ? EventLogServerEncrypted.layerRpcHandlers.pipe(Layer.provide(EventLogServerEncrypted.layerStorageMemory))
      : EventLogServerUnencrypted.layerRpcHandlers.pipe(Layer.provide([
        EventLogServerUnencrypted.layerStorageMemory,
        EventLog.layerRegistry,
        EventLogServerUnencrypted.layerStoreMappingStatic({ storeId: defaultStoreId }),
        Layer.succeed(EventLogServerUnencrypted.EventLogServerAuthorization, {
          authorizeWrite: () => Effect.void,
          authorizeRead: () => Effect.void,
          authorizeIdentity: () => Effect.void
        })
      ]))
  )
  const connections = new Map<number, (response: FromServer<Rpcs>) => Effect.Effect<void>>()
  const server = yield* RpcServer.makeNoSerialization(EventLogMessage.EventLogRemoteRpcs, {
    onFromServer: (response) => connections.get(response.clientId)!(response)
  }).pipe(Effect.provide(handlers))
  let nextClientId = 0

  const connect = Effect.fnUntraced(function*(identity: EventLog.Identity["Service"]) {
    const clientId = nextClientId++
    const { client, write } = yield* RpcClient.makeNoSerialization(EventLogMessage.EventLogRemoteRpcs, {
      supportsAck: true,
      onFromClient: ({ message }) => server.write(clientId, message)
    })
    connections.set(clientId, write)
    const remote = yield* (encrypted ? EventLogRemote.makeEncrypted : EventLogRemote.makeUnencrypted).pipe(
      Effect.provideService(EventLogRemote.EventLogRemoteClient, client),
      Effect.provide(EventLog.layerRegistry)
    )
    yield* remote.whenAuthenticated(Effect.void).pipe(Effect.provideService(EventLog.Identity, identity))
    const encodeWrite = Effect.fnUntraced(function*(entries: ReadonlyArray<EventJournal.Entry>) {
      const fields = { publicKey: identity.publicKey, storeId: defaultStoreId }
      return yield* encrypted
        ? new EventLogMessage.WriteEntries({
          ...fields,
          batches: yield* (yield* EventLogEncryption.EventLogEncryption).encrypt(identity, defaultStoreId, entries)
        }).encoded
        : new EventLogMessage.WriteEntriesUnencrypted({ ...fields, entries }).encoded
    })
    return {
      remote,
      writeBatches: (batches: ReadonlyArray<EventLogEncryption.EncryptedBatch>) =>
        new EventLogMessage.WriteEntries({
          publicKey: identity.publicKey,
          storeId: defaultStoreId,
          batches
        }).encoded.pipe(Effect.flatMap((data) => client["EventLog.WriteSingle"]({ data }))),
      writeSingle: (entries: ReadonlyArray<EventJournal.Entry>) =>
        encodeWrite(entries).pipe(
          Effect.flatMap((data) => client["EventLog.WriteSingle"]({ data }))
        ),
      // Reverse arrival order: index 0, not the highest index, completes the write.
      writeChunked: Effect.fnUntraced(function*(entries: ReadonlyArray<EventJournal.Entry>) {
        const data = yield* encodeWrite(entries)
        const parts = Array.reverse(EventLogMessage.ChunkedMessage.split(clientId, data))
        assert.isAbove(parts.length, 1)
        const responses = yield* Effect.forEach(parts, (part) => client["EventLog.WriteChunked"](part))
        // Earlier parts acknowledge nothing.
        assert.deepStrictEqual(responses.slice(0, -1), parts.slice(1).map(() => []))
        return responses[responses.length - 1]
      })
    }
  })

  return { connect }
})

describe("EventLogRemote write acknowledgements", () => {
  it.effect("keeps concurrent overlapping writes suppressed after the first write completes", () =>
    Effect.gen(function*() {
      const writes = new EventLogServer.ConnectionWrites()
      const options = { publicKey: "writer", storeId: defaultStoreId }
      type Item = { entryIds: ReadonlyArray<EventJournal.EntryId>; sequence: number }
      const input = yield* Queue.make<Item>()
      const output = yield* Queue.make<Item>()
      yield* writes.filter({
        ...options,
        entryIds: (item: Item) => item.entryIds,
        sequence: (item) => item.sequence
      }, Stream.fromQueue(input)).pipe(
        Stream.runForEach((item) => Queue.offer(output, item)),
        Effect.forkScoped
      )
      const marker = (sequence: number): Item => ({ entryIds: [EventJournal.makeEntryIdUnsafe()], sequence })
      yield* Queue.offer(input, marker(0))
      yield* Queue.take(output)

      const a = EventJournal.makeEntryIdUnsafe()
      const b = EventJournal.makeEntryIdUnsafe()
      const c = EventJournal.makeEntryIdUnsafe()
      const started = yield* Queue.make<void>()
      const firstDone = yield* Deferred.make<ReadonlyArray<EventLogMessage.WriteAck>>()
      const secondDone = yield* Deferred.make<ReadonlyArray<EventLogMessage.WriteAck>>()
      const first = yield* Effect.suspend(() =>
        writes.track(
          { ...options, entryIds: [a, b] },
          Queue.offer(started, undefined).pipe(Effect.andThen(Deferred.await(firstDone)))
        )
      ).pipe(Effect.forkScoped)
      const second = yield* Effect.suspend(() =>
        writes.track(
          { ...options, entryIds: [a, c] },
          Queue.offer(started, undefined).pipe(Effect.andThen(Deferred.await(secondDone)))
        )
      ).pipe(Effect.forkScoped)
      yield* Queue.takeN(started, 2)

      yield* Queue.offer(input, { entryIds: [a, b], sequence: 2 })
      const firstMarker = marker(3)
      yield* Queue.offer(input, firstMarker)
      assert.deepStrictEqual(yield* Queue.take(output), firstMarker)
      yield* Deferred.succeed(firstDone, [{ entryId: a, sequence: 1 }, { entryId: b, sequence: 2 }])
      yield* Fiber.join(first)

      yield* Queue.offer(input, { entryIds: [a, c], sequence: 5 })
      const secondMarker = marker(6)
      yield* Queue.offer(input, secondMarker)
      assert.deepStrictEqual(yield* Queue.take(output), secondMarker)
      yield* Deferred.succeed(secondDone, [{ entryId: a, sequence: 4 }, { entryId: c, sequence: 5 }])
      yield* Fiber.join(second)
    }))

  for (const encrypted of [true, false]) {
    it.effect(`${encrypted ? "encrypted" : "unencrypted"}: ordered duplicate acks, out-of-order chunk reassembly and connection-scoped echoes`, () =>
      Effect.gen(function*() {
        const server = yield* makeServer(encrypted)
        const identity = yield* EventLog.makeIdentity
        const writer = yield* server.connect(identity)
        const reader = yield* server.connect(identity)
        assert.strictEqual(writer.remote.firstSequence ?? 0, encrypted ? 0 : 1)
        const writerChanges = yield* writer.remote.changes({ identity, storeId: defaultStoreId, startSequence: 0 })
        const readerChanges = yield* reader.remote.changes({ identity, storeId: defaultStoreId, startSequence: 0 })
        // A third connection's entry makes both subscriptions live.
        const seed = makeEntry()
        yield* (yield* server.connect(identity)).writeSingle([seed])
        yield* Queue.take(writerChanges)
        yield* Queue.take(readerChanges)

        const a = makeEntry()
        const b = makeEntry({ payloadSize: EventLogMessage.ChunkedMessage.chunkSize })
        const acks = yield* writer.writeSingle([a, b])
        assert.deepStrictEqual(yield* writer.writeChunked([b, a]), [...acks].reverse())
        const delivered = yield* Queue.takeN(readerChanges, 2)
        assert.deepStrictEqual(delivered.map(({ entry }) => entry.idString), [a.idString, b.idString])
        assert.deepStrictEqual(
          acks,
          delivered.map(({ entry, remoteSequence }) => ({
            entryId: entry.id,
            sequence: remoteSequence
          }))
        )

        const marker = makeEntry()
        yield* reader.writeSingle([marker])
        assert.strictEqual((yield* Queue.take(writerChanges)).entry.idString, marker.idString)
        const replay = yield* (yield* server.connect(identity)).remote.changes({
          identity,
          storeId: defaultStoreId,
          startSequence: 0
        })
        assert.deepStrictEqual((yield* Queue.takeN(replay, 3)).map(({ entry }) => entry.idString), [
          seed.idString,
          a.idString,
          b.idString
        ])
      }).pipe(Effect.provide(EventLogEncryption.layerSubtle)))
  }

  it.effect("acknowledges and suppresses each occurrence in overlapping encrypted batches", () =>
    Effect.gen(function*() {
      const server = yield* makeServer(true)
      const identity = yield* EventLog.makeIdentity
      const writer = yield* server.connect(identity)
      const reader = yield* server.connect(identity)
      const writerChanges = yield* writer.remote.changes({ identity, storeId: defaultStoreId, startSequence: 0 })
      yield* reader.writeSingle([makeEntry()])
      yield* Queue.take(writerChanges)
      const readerChanges = yield* reader.remote.changes({ identity, storeId: defaultStoreId, startSequence: 1 })
      const encryption = yield* EventLogEncryption.EventLogEncryption
      const a = makeEntry()
      const b = makeEntry()
      const acks = yield* writer.writeBatches([
        ...yield* encryption.encrypt(identity, defaultStoreId, [a]),
        ...yield* encryption.encrypt(identity, defaultStoreId, [a, b])
      ])
      const delivered = yield* Queue.takeN(readerChanges, 3)
      const marker = makeEntry()
      yield* reader.writeSingle([marker])
      assert.deepStrictEqual({
        acks,
        nextForWriter: (yield* Queue.take(writerChanges)).entry.idString
      }, {
        acks: delivered.map(({ entry, remoteSequence }) => ({ entryId: entry.id, sequence: remoteSequence })),
        nextForWriter: marker.idString
      })
    }).pipe(Effect.provide(EventLogEncryption.layerSubtle)))
})

const CompactionRpcs = EventLogMessage.EventLogRemoteRpcs.merge(EventLogMessage.EventLogCompactionRpcs)
type CompactionRpcs = RpcGroup.Rpcs<typeof CompactionRpcs>

// The memory storage without its compaction sub-service, like a third-party
// storage that predates compaction.
const layerStorageWithoutCompaction = Layer.effect(EventLogServerEncrypted.Storage)(
  Effect.map(EventLogServerEncrypted.makeStorageMemory, ({ compaction: _, ...storage }) => storage)
)

// An encrypted server on memory storage, serving both RPC groups.
const makeCompactionServer = Effect.fnUntraced(function*(
  storage: Layer.Layer<EventLogServerEncrypted.Storage> = EventLogServerEncrypted.layerStorageMemoryWith({
    compaction: { thresholdFloor: 1 }
  })
) {
  const handlers = yield* Layer.build(EventLogServerEncrypted.layerRpcHandlers.pipe(Layer.provide(storage)))
  const connections = new Map<number, (response: FromServer<CompactionRpcs>) => Effect.Effect<void>>()
  const server = yield* RpcServer.makeNoSerialization(CompactionRpcs, {
    onFromServer: (response) => connections.get(response.clientId)!(response)
  }).pipe(Effect.provide(handlers))
  let nextClientId = 0

  // `dropPart` replaces the response to that Part request, counted from 0 in
  // send order, with the failure a closed socket gives it.
  const connect = Effect.fnUntraced(function*(identity: EventLog.Identity["Service"], options?: {
    readonly dropPart?: number | undefined
  }) {
    const clientId = nextClientId++
    const parts: Array<EventLogMessage.ChunkedMessage> = []
    let dropped: unknown = undefined
    const { client, write } = yield* RpcClient.makeNoSerialization(CompactionRpcs, {
      supportsAck: true,
      onFromClient: ({ message }) => {
        if (message._tag === "Request" && message.tag === "EventLog.CompactionPart") {
          const payload = message.payload as Rpc.Payload<typeof EventLogMessage.CompactionPartRpc>
          if (parts.push(payload.chunk) - 1 === options?.dropPart) dropped = message.id
        }
        return server.write(clientId, message)
      }
    })
    connections.set(clientId, (response) =>
      response._tag === "Exit" && response.requestId === dropped
        ? write({
          ...response,
          exit: Exit.fail(
            new RpcClientError.RpcClientError({ reason: new Socket.SocketCloseError({ code: 1006 }) })
          ) as any
        })
        : write(response))
    const remote = yield* EventLogRemote.makeEncrypted.pipe(
      Effect.provideService(EventLogRemote.EventLogRemoteClient, client),
      Effect.provide(EventLog.layerRegistry)
    )
    yield* remote.whenAuthenticated(Effect.void).pipe(Effect.provideService(EventLog.Identity, identity))
    return { remote, parts }
  })

  return { connect }
})

const entryFields = (entry: EventJournal.Entry) => ({
  id: entry.idString,
  event: entry.event,
  primaryKey: entry.primaryKey,
  payload: entry.payload
})

// Writes `entries`, lets them pass the default 24 hour lag, opens a stage and
// fetches its whole input.
const beginWith = Effect.fnUntraced(function*(
  writer: EventLogRemote.EventLogRemote["Service"],
  identity: EventLog.Identity["Service"],
  entries: ReadonlyArray<EventJournal.Entry>
) {
  const compaction = writer.compaction ?? assert.fail("expected the remote to support compaction")
  yield* writer.write({ identity, storeId: defaultStoreId, entries })
  yield* TestClock.adjust("26 hours")
  const begun = yield* compaction.begin({ identity, storeId: defaultStoreId })
  assert(begun._tag === "Started", `expected Started, got ${begun._tag}`)
  const stage = { ...begun, identity, storeId: defaultStoreId }
  const headers = yield* Stream.runCollect(compaction.input(stage))
  const input = yield* Stream.runCollect(compaction.fetch(stage, headers.map((header) => header.sequence)))
  assert.deepStrictEqual(input.map(({ entry }) => entry.idString), entries.map((entry) => entry.idString))
  return { compaction, stage, input: input.map(({ entry }) => entry) }
})

const kb = 1024

describe("EventLogRemote compaction", () => {
  it.effect("is absent when the server does not advertise compaction", () =>
    Effect.gen(function*() {
      const server = yield* makeCompactionServer(layerStorageWithoutCompaction)
      const { remote } = yield* server.connect(yield* EventLog.makeIdentity)

      assert.isUndefined(remote.compaction)
    }).pipe(Effect.provide(EventLogEncryption.layerSubtle)))

  it.effect("uploads kept entries in segments of about 512 KB, splitting an oversized one, with their original bytes", () =>
    Effect.gen(function*() {
      const server = yield* makeCompactionServer()
      const identity = yield* EventLog.makeIdentity
      const writer = yield* server.connect(identity)
      const entries = [
        makeEntry({ primaryKey: "dropped" }),
        makeEntry({ payloadSize: 200 * kb }),
        makeEntry({ payloadSize: 200 * kb }),
        makeEntry({ payloadSize: 200 * kb }),
        makeEntry({ payloadSize: 600 * kb }),
        makeEntry()
      ]
      const { compaction, input, stage } = yield* beginWith(writer.remote, identity, entries)

      const kept = input.slice(1)
      const { segmentCount } = yield* compaction.upload(stage, kept)
      const committed = yield* compaction.commit(stage, { _tag: "Snapshot", segmentCount })
      const reader = yield* server.connect(identity)
      const changes = yield* reader.remote.changes({
        identity,
        storeId: defaultStoreId,
        startSequence: reader.remote.firstSequence ?? 0
      })
      const served = yield* Queue.takeN(changes, kept.length)

      // Each 200 KB entry fills its own batch. Two of them fit in one segment,
      // the 600 KB batch is a segment of its own split in two, and the last
      // small batch doesn't fit after it.
      const pieces = new Map<number, number>()
      for (const part of writer.parts) pieces.set(part.id, (pieces.get(part.id) ?? 0) + 1)
      assert.deepStrictEqual({
        segmentCount,
        pieces: [...pieces].sort(([a], [b]) => a - b),
        largestPiece: Math.max(...writer.parts.map((part) => part.data.byteLength)),
        committed
      }, {
        segmentCount: 4,
        pieces: [[0, 1], [1, 1], [2, 2], [3, 1]],
        largestPiece: EventLogMessage.ChunkedMessage.chunkSize,
        committed: "Committed"
      })
      assert.deepStrictEqual(served.map(({ entry }) => entryFields(entry)), entries.slice(1).map(entryFields))
    }).pipe(Effect.provide(EventLogEncryption.layerSubtle)))

  it.effect("resends a whole segment after a dropped connection", () =>
    Effect.gen(function*() {
      const server = yield* makeCompactionServer()
      const identity = yield* EventLog.makeIdentity
      // The response to the piece that completes the segment is lost.
      const writer = yield* server.connect(identity, { dropPart: 1 })
      const { compaction, input, stage } = yield* beginWith(writer.remote, identity, [
        makeEntry({ primaryKey: "dropped" }),
        makeEntry({ payloadSize: 600 * kb })
      ])

      const { segmentCount } = yield* compaction.upload(stage, input.slice(1))
      const committed = yield* compaction.commit(stage, { _tag: "Snapshot", segmentCount })

      assert.deepStrictEqual({
        segmentCount,
        pieces: writer.parts.map((part) => `${part.id}:${part.part[0]}/${part.part[1]}`).sort(),
        committed
      }, {
        segmentCount: 1,
        pieces: ["0:0/2", "0:0/2", "0:1/2", "0:1/2"],
        committed: "Committed"
      })
    }).pipe(Effect.provide(EventLogEncryption.layerSubtle)))
})
