import { assert, it } from "@effect/vitest"
import { Effect, Exit, Layer, Queue } from "effect"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import * as EventLogEncryption from "effect/eventlog/EventLogEncryption"
import * as EventLogMessage from "effect/eventlog/EventLogMessage"
import * as EventLogRemote from "effect/eventlog/EventLogRemote"
import * as EventLogServerEncrypted from "effect/eventlog/EventLogServerEncrypted"
import * as RpcTest from "effect/rpc/RpcTest"

const storeId = EventLogMessage.StoreId.make("store-a")
const otherStoreId = EventLogMessage.StoreId.make("store-b")

const makeEntries = (count: number) =>
  Array.from({ length: count }, (_, i) =>
    new EventJournal.Entry({
      id: EventJournal.makeEntryIdUnsafe(),
      event: "UserCreated",
      primaryKey: `user-${i}`,
      payload: Uint8Array.of(i % 256, 1, 2, 3)
    }, { disableChecks: true }))

const hex = (bytes: ArrayBufferLike | ArrayBufferView) =>
  Array.from(
    ArrayBuffer.isView(bytes) ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) : new Uint8Array(bytes)
  )
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")

// Wraps Web Crypto to count AES-GCM calls and record each encryption IV.
const makeCountingCrypto = () => {
  const subtle = globalThis.crypto.subtle
  const counts = { encrypts: 0, decrypts: 0, ivs: new Set<string>() }
  const crypto = {
    getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto),
    randomUUID: () => globalThis.crypto.randomUUID(),
    subtle: new Proxy(subtle, {
      get(target, key) {
        if (key === "encrypt") {
          return (algorithm: AesGcmParams, cryptoKey: CryptoKey, data: BufferSource) => {
            counts.encrypts++
            counts.ivs.add(hex(algorithm.iv))
            return target.encrypt(algorithm, cryptoKey, data)
          }
        }
        if (key === "decrypt") {
          return (algorithm: AesGcmParams, cryptoKey: CryptoKey, data: BufferSource) => {
            counts.decrypts++
            return target.decrypt(algorithm, cryptoKey, data)
          }
        }
        const value = Reflect.get(target, key)
        return typeof value === "function" ? value.bind(target) : value
      }
    })
  } as unknown as Crypto
  return { crypto, counts }
}

const replaceBytes = (data: Uint8Array, from: Uint8Array, to: Uint8Array) => {
  const result = new Uint8Array(data)
  let replaced = 0
  for (let i = 0; i <= result.length - from.length; i++) {
    if (from.every((byte, j) => result[i + j] === byte)) {
      result.set(to, i)
      replaced++
    }
  }
  assert.isAbove(replaced, 0, "the frame carries the entry id in plaintext")
  return result
}

type Client = EventLogRemote.EventLogRemoteClient["Service"]

// A man in the middle on one connection: it can rewrite change requests and
// the frames the server sends back.
const intercept = (client: Client, options: {
  readonly storeId?: EventLogMessage.StoreId
  readonly frame?: (data: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>
}): Client => ({
  ...client,
  "EventLog.Changes": ((payload: any) =>
    Effect.gen(function*() {
      const incoming = yield* client["EventLog.Changes"]({
        ...payload,
        storeId: options.storeId ?? payload.storeId
      }, { asQueue: true })
      const outgoing = yield* Queue.make<any, any>()
      yield* Queue.takeAll(incoming).pipe(
        Effect.flatMap((parts) =>
          Queue.offerAll(
            outgoing,
            parts.map((part) =>
              part._tag === "Single" && options.frame
                ? new EventLogMessage.SingleMessage({ data: options.frame(part.data) })
                : part
            )
          )
        ),
        Effect.forever,
        Effect.catchCause((cause) => Queue.failCause(outgoing, cause)),
        Effect.forkScoped
      )
      return outgoing
    })) as any
})

const makeServer = Effect.gen(function*() {
  const handlers = yield* Layer.build(EventLogServerEncrypted.layerRpcHandlers)
  const identity = yield* EventLog.makeIdentity
  // Each device is a separate connection for the same identity.
  const makeDevice = Effect.fnUntraced(function*(options?: Parameters<typeof intercept>[1]) {
    const { counts, crypto } = makeCountingCrypto()
    const client = yield* RpcTest.makeClient(EventLogMessage.EventLogRemoteRpcs).pipe(Effect.provide(handlers))
    const remote = yield* EventLogRemote.makeEncrypted.pipe(
      Effect.provideService(EventLogRemote.EventLogRemoteClient, options ? intercept(client, options) : client),
      Effect.provideService(
        EventLogEncryption.EventLogEncryption,
        yield* EventLogEncryption.makeEncryptionSubtle(crypto)
      ),
      Effect.provide(EventLog.layerRegistry)
    )
    const write = (entries: ReadonlyArray<EventJournal.Entry>, store = storeId) =>
      remote.write({ identity, storeId: store, entries })
    const changes = (startSequence: number, store = storeId) =>
      remote.changes({ identity, storeId: store, startSequence })
    return { counts, write, changes }
  })
  return { makeDevice }
})

const summarize = (received: ReadonlyArray<EventJournal.RemoteEntry>) => ({
  ids: received.map((remote) => remote.entry.idString),
  primaryKeys: received.map((remote) => remote.entry.primaryKey),
  payloads: received.map((remote) => hex(remote.entry.payload)),
  sequences: received.map((remote) => remote.remoteSequence)
})

const expected = (entries: ReadonlyArray<EventJournal.Entry>, firstSequence: number) => ({
  ids: entries.map((entry) => entry.idString),
  primaryKeys: entries.map((entry) => entry.primaryKey),
  payloads: entries.map((entry) => hex(entry.payload)),
  sequences: entries.map((_, i) => firstSequence + i)
})

export const suite = (name: string, storage: Layer.Layer<EventLogServerEncrypted.Storage, unknown>) =>
  it.layer(Layer.merge(storage, EventLogEncryption.layerSubtle), { timeout: "60 seconds" })(
    `Encrypted replication (${name})`,
    (it) => {
      it.effect("encrypts writes in batches of at most 100 entries and replays every entry", () =>
        Effect.gen(function*() {
          const server = yield* makeServer
          const writer = yield* server.makeDevice()
          const reader = yield* server.makeDevice()
          const entries = makeEntries(250)

          yield* writer.write(entries)
          const received = yield* Effect.flatMap(reader.changes(0), Queue.takeN(250))

          assert.deepStrictEqual(summarize(received), expected(entries, received[0].remoteSequence))
          assert.deepStrictEqual(
            { encrypts: writer.counts.encrypts, ivs: writer.counts.ivs.size, decrypts: reader.counts.decrypts },
            { encrypts: 3, ivs: 3, decrypts: 3 }
          )
        }))

      it.effect("resumes from a sequence inside a batch without repeating earlier entries", () =>
        Effect.gen(function*() {
          const server = yield* makeServer
          const writer = yield* server.makeDevice()
          const reader = yield* server.makeDevice()
          const entries = makeEntries(150)

          yield* writer.write(entries)
          const firstSequence = (yield* Effect.scoped(Effect.flatMap(reader.changes(0), Queue.take))).remoteSequence
          reader.counts.decrypts = 0

          const changes = yield* reader.changes(firstSequence + 120)
          const resumed = yield* Queue.takeN(changes, 30)
          const [next] = makeEntries(1)
          yield* writer.write([next])
          const live = yield* Queue.take(changes)

          assert.deepStrictEqual(summarize(resumed), expected(entries.slice(120), firstSequence + 120))
          assert.deepStrictEqual(summarize([live]), expected([next], firstSequence + 150))
          // One call for the batch holding entries 100 to 149, one for the live write.
          assert.strictEqual(reader.counts.decrypts, 2)
        }))

      it.effect("stores a retried write once", () =>
        Effect.gen(function*() {
          const server = yield* makeServer
          const writer = yield* server.makeDevice()
          const reader = yield* server.makeDevice()
          const entries = makeEntries(3)

          // A retry after a lost response re-encrypts the same entries.
          yield* writer.write(entries.slice(0, 2))
          yield* writer.write(entries.slice(0, 2))
          yield* writer.write(entries.slice(2))
          const received = yield* Effect.flatMap(reader.changes(0), Queue.takeN(3))

          assert.deepStrictEqual(summarize(received), expected(entries, received[0].remoteSequence))
        }))

      it.effect("rejects a batch whose plaintext entry ids were altered", () =>
        Effect.gen(function*() {
          const server = yield* makeServer
          const writer = yield* server.makeDevice()
          const [entry, forged] = makeEntries(2)
          const reader = yield* server.makeDevice({
            frame: (data) => replaceBytes(data, entry.id, forged.id)
          })

          yield* writer.write([entry])
          const exit = yield* Effect.flatMap(reader.changes(0), Queue.take).pipe(Effect.exit)

          assert.isTrue(Exit.isFailure(exit))
        }))

      it.effect("rejects a batch served from another store of the same identity", () =>
        Effect.gen(function*() {
          const server = yield* makeServer
          const writer = yield* server.makeDevice()
          const reader = yield* server.makeDevice({ storeId })

          yield* writer.write(makeEntries(1))
          const exit = yield* Effect.flatMap(reader.changes(0, otherStoreId), Queue.take).pipe(Effect.exit)

          assert.isTrue(Exit.isFailure(exit))
        }))
    }
  )
