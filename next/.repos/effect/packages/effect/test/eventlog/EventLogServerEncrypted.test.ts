import { assert, it } from "@effect/vitest"
import { Context, Effect, Exit, Layer, Logger, Queue, Redacted, Schema, Stream } from "effect"
import * as SchemaBinary from "effect/encoding/SchemaBinary"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import * as EventLogEncryption from "effect/eventlog/EventLogEncryption"
import * as EventLogMessage from "effect/eventlog/EventLogMessage"
import * as EventLogServerEncrypted from "effect/eventlog/EventLogServerEncrypted"
import * as EventLogSessionAuth from "effect/eventlog/EventLogSessionAuth"
import { makeGetIdentityRootSecretMaterial } from "effect/eventlog/internal/identityRootSecretDerivation"
import * as RpcTest from "effect/rpc/RpcTest"
import { TestClock } from "effect/testing"
import * as CompactionTest from "./EventLogServerEncryptedCompactionTest.ts"
import * as EncryptedTest from "./EventLogServerEncryptedTest.ts"

EncryptedTest.suite("memory", EventLogServerEncrypted.layerStorageMemory)
CompactionTest.suite("memory", EventLogServerEncrypted.layerStorageMemoryWith, Layer.empty)

it.effect("memory storage fails to start unless grace is longer than the lag and the stage TTL", () =>
  Effect.gen(function*() {
    const start = (compaction: EventLogServerEncrypted.CompactionOptions) =>
      Effect.exit(Effect.scoped(Layer.build(EventLogServerEncrypted.layerStorageMemoryWith({ compaction }))))

    const exits = [
      yield* start({ grace: "24 hours", lag: "24 hours" }),
      yield* start({ grace: "10 minutes", stageTtl: "10 minutes", lag: "1 minute" }),
      yield* start({ grace: "25 hours", lag: "24 hours", stageTtl: "24 hours" })
    ]

    assert.deepStrictEqual(exits.map(Exit.isSuccess), [false, false, true])
  }))

const storeId = EventLogMessage.StoreId.make("store-a")
const hour = 60 * 60_000
// Long enough for a write's storage hour to pass the default 24 hour lag.
const pastLag = 26 * hour

// An upload segment is an encoded non-empty array of encrypted batches.
const encodeSegment = Schema.encodeEffect(SchemaBinary.toCodec(Schema.NonEmptyArray(EventLogEncryption.EncryptedBatch)))
const getIdentityRootSecretMaterial = makeGetIdentityRootSecretMaterial(globalThis.crypto)

type EntryIds = ReadonlyArray<EventJournal.EntryId>

const makeIds = (count: number) => Array.from({ length: count }, () => EventJournal.makeEntryIdUnsafe())

const key = (id: EventJournal.EntryId) => Array.from(id).join(",")

// The server never decrypts, so a batch only needs its ids and a fresh iv.
const makeBatch = (entryIds: EntryIds): EventLogEncryption.EncryptedBatch => ({
  entryIds: entryIds as [EventJournal.EntryId, ...Array<EventJournal.EntryId>],
  iv: globalThis.crypto.getRandomValues(new Uint8Array(12)),
  encryptedBatch: new Uint8Array(entryIds.length)
})

const started = <A extends { readonly _tag: string }>(result: A) =>
  result._tag === "Started" ? result as Extract<A, { readonly _tag: "Started" }> : assert.fail(`got ${result._tag}`)

const makeServer = Effect.fnUntraced(function*(compaction: EventLogServerEncrypted.CompactionOptions) {
  const context = yield* Layer.build(
    Layer.provideMerge(
      EventLogServerEncrypted.layerRpcHandlers,
      EventLogServerEncrypted.layerStorageMemoryWith({ compaction })
    )
  )
  const storage = Context.get(context, EventLogServerEncrypted.Storage)
  const identity = yield* EventLog.makeIdentity.pipe(Effect.provide(EventLogEncryption.layerSubtle))
  const scope = { publicKey: identity.publicKey, storeId }

  // Each connection authenticates the same identity.
  const connect = Effect.gen(function*() {
    const client = yield* RpcTest.makeClient(
      EventLogMessage.EventLogRemoteRpcs.merge(EventLogMessage.EventLogCompactionRpcs)
    ).pipe(Effect.provide(context))
    const hello = yield* client["EventLog.Hello"]()
    const material = yield* getIdentityRootSecretMaterial(identity)
    yield* client["EventLog.Authenticate"](
      new EventLogMessage.Authenticate({
        publicKey: identity.publicKey,
        signingPublicKey: material.signingPublicKey,
        signature: yield* EventLogSessionAuth.signSessionAuthPayload({
          remoteId: hello.remoteId,
          challenge: hello.challenge,
          publicKey: identity.publicKey,
          signingPublicKey: material.signingPublicKey,
          signingPrivateKey: Redacted.value(material.signingPrivateKey)
        }),
        algorithm: "Ed25519"
      })
    )
    const write = Effect.fnUntraced(function*(...batches: ReadonlyArray<EntryIds>) {
      const data = yield* new EventLogMessage.WriteEntries({ ...scope, batches: batches.map(makeBatch) }).encoded
      return yield* client["EventLog.WriteSingle"]({ data })
    })
    const commit = (
      stageId: string,
      result: { readonly _tag: "Snapshot"; readonly segmentCount: number } | {
        readonly _tag: "NoOp"
      }
    ) => client["EventLog.CompactionCommit"]({ ...scope, stageId, result })
    const upload = Effect.fnUntraced(function*(stageId: string, segments: ReadonlyArray<ReadonlyArray<EntryIds>>) {
      for (let segment = 0; segment < segments.length; segment++) {
        const batches = segments[segment].map(makeBatch) as [
          EventLogEncryption.EncryptedBatch,
          ...Array<EventLogEncryption.EncryptedBatch>
        ]
        const data = yield* Effect.orDie(encodeSegment(batches))
        for (const chunk of EventLogMessage.ChunkedMessage.split(segment, data)) {
          yield* client["EventLog.CompactionPart"]({ ...scope, stageId, chunk })
        }
      }
    })
    const snapshot = (stageId: string, segments: ReadonlyArray<ReadonlyArray<EntryIds>>) =>
      Effect.andThen(upload(stageId, segments), commit(stageId, { _tag: "Snapshot", segmentCount: segments.length }))
    return {
      client,
      hello,
      write,
      commit,
      upload,
      snapshot,
      status: client["EventLog.CompactionStatus"](scope),
      begin: client["EventLog.CompactionBegin"](scope),
      input: (stageId: string) => client["EventLog.CompactionInput"]({ ...scope, stageId }),
      abort: (stageId: string) => client["EventLog.CompactionAbort"]({ ...scope, stageId }),
      // Subscribes to changes, returning an effect that takes the next frame's batches.
      changes: (startSequence: number) =>
        client["EventLog.Changes"]({ ...scope, startSequence }, { asQueue: true }).pipe(
          Effect.map((queue) =>
            Queue.take(queue).pipe(
              Effect.flatMap((frame) =>
                frame._tag === "Single"
                  ? Effect.orDie(EventLogMessage.ChangesRpc.decodeEncrypted(frame.data))
                  : Effect.die("expected a single frame")
              )
            )
          )
        )
    }
  })
  return { storage, scope, connect }
})

// Writes A = [e0, e1]@0, [e2, e3]@2, [e4]@4, [e5]@5, then two hours later
// B = [e6, e7, e8, e9]@6, and commits a snapshot keeping e1 and e3 once A
// has passed the lag but B has not, so its base is 5.
const withSnapshot = Effect.fnUntraced(function*(compaction: EventLogServerEncrypted.CompactionOptions) {
  const server = yield* makeServer(compaction)
  const conn = yield* server.connect
  const ids = makeIds(10)
  yield* conn.write([ids[0], ids[1]], [ids[2], ids[3]], [ids[4]], [ids[5]])
  yield* TestClock.adjust(2 * hour)
  yield* conn.write(ids.slice(6))
  yield* TestClock.adjust(23 * hour)
  const { stageId } = started(yield* conn.begin)
  const committed = yield* conn.snapshot(stageId, [[[ids[1]], [ids[3]]]])
  const compactionStorage = server.storage.compaction ?? assert.fail("Storage does not provide compaction")
  const rollback = Effect.gen(function*() {
    const active = (yield* compactionStorage.history(server.scope.publicKey, storeId)).find((a) => a.active)!
    yield* compactionStorage.rollback(server.scope.publicKey, storeId, active.activationId)
  })
  return { conn, ids, committed, rollback }
})

it.effect("isolates pending segment pieces and aborts by store on the same connection", () =>
  Effect.gen(function*() {
    const server = yield* makeServer({ thresholdFloor: 1 })
    const conn = yield* server.connect
    const ids = makeIds(2)
    yield* conn.write(ids)
    yield* TestClock.adjust(pastLag)
    const { stageId } = started(yield* conn.begin)
    const data = yield* encodeSegment([makeBatch([ids[1]])])
    const split = Math.floor(data.length / 2)
    const part = (storeId: EventLogMessage.StoreId, index: number, data: Uint8Array<ArrayBuffer>) =>
      conn.client["EventLog.CompactionPart"]({
        ...server.scope,
        storeId,
        stageId,
        chunk: new EventLogMessage.ChunkedMessage({ id: 0, part: [index, 2], data })
      })
    const otherStore = EventLogMessage.StoreId.make("store-b")

    yield* part(storeId, 0, data.slice(0, split))
    // A foreign scope must not join these junk bytes or clear A's pending piece.
    // The server may reject the unknown stage now or when it assembles the segment.
    yield* Effect.exit(part(otherStore, 1, new Uint8Array([255])))
    yield* Effect.exit(conn.client["EventLog.CompactionAbort"]({ ...server.scope, storeId: otherStore, stageId }))
    yield* part(storeId, 1, data.slice(split))

    assert.strictEqual(yield* conn.commit(stageId, { _tag: "Snapshot", segmentCount: 1 }), "Committed")
  }))

it.effect("logs snapshot commit counts and the committed and rollback activation ids", () => {
  const logs: Array<ReturnType<typeof Logger.formatStructured.log>> = []
  return Effect.gen(function*() {
    const server = yield* makeServer({ thresholdFloor: 1 })
    const conn = yield* server.connect
    const ids = makeIds(3)
    yield* conn.write(ids)
    yield* TestClock.adjust(pastLag)
    const { stageId } = started(yield* conn.begin)
    assert.strictEqual(yield* conn.snapshot(stageId, [[[ids[1]]]]), "Committed")
    const compaction = server.storage.compaction!
    const active = (yield* compaction.history(server.scope.publicKey, storeId)).find((a) => a.active)!
    const rollbackId = yield* compaction.rollback(server.scope.publicKey, storeId, active.activationId)
    const commitLog = logs.find((log) => log.annotations.activationId === active.activationId)
    const rollbackLog = logs.find((log) => log.annotations.activationId === rollbackId)

    assert.isDefined(commitLog)
    assert.strictEqual(commitLog!.level, "INFO")
    assert.containsSubset(commitLog!.annotations, {
      ...server.scope,
      keptCount: 1,
      through: 2,
      activationId: active.activationId
    })
    assert.isDefined(rollbackLog)
    assert.strictEqual(rollbackLog!.level, "INFO")
    assert.containsSubset(rollbackLog!.annotations, {
      ...server.scope,
      activationId: rollbackId,
      withdrawnActivationId: active.activationId,
      withdrawnBase: 2,
      withdrawnKeptCount: 1,
      base: -1,
      keptCount: undefined
    })
  }).pipe(Effect.provide(Logger.layer([Logger.formatStructured.pipe(Logger.map((log) => {
    logs.push(log)
  }))])))
})

it.effect("loses the compare-and-swap after a rollback and frees busy on abort", () =>
  Effect.gen(function*() {
    const { committed, conn, ids, rollback } = yield* withSnapshot({ thresholdFloor: 1 })

    // B passes the lag, so the next input is the snapshot plus B.
    yield* TestClock.adjust(2 * hour)
    const second = started(yield* conn.begin)
    const busy = yield* conn.begin
    yield* conn.abort(second.stageId)
    const third = started(yield* conn.begin)
    yield* rollback
    const lost = yield* conn.snapshot(third.stageId, [[[ids[7]]]])

    assert.isTrue(conn.hello.compaction)
    assert.strictEqual(committed, "Committed")
    assert.strictEqual(busy._tag, "Busy")
    assert.strictEqual(lost, "Superseded")
  }))

it.effect("fails Input with NotFound once the stage's pin was pruned", () =>
  Effect.gen(function*() {
    const { conn, ids, rollback } = yield* withSnapshot({
      grace: "25 hours",
      lag: "24 hours",
      stageTtl: "24 hours",
      thresholdFloor: 1
    })
    const outcome = (stageId: string) =>
      Stream.runDrain(conn.input(stageId)).pipe(Effect.match({ onFailure: (e) => e.code, onSuccess: () => "ok" }))

    yield* TestClock.adjust(2 * hour)
    const { stageId } = started(yield* conn.begin)
    yield* rollback
    const beforePrune = yield* outcome(stageId)
    // A Part keeps the stage open past the withdrawn snapshot's grace.
    yield* TestClock.adjust(23 * hour)
    yield* conn.upload(stageId, [[[ids[1]]]])
    yield* TestClock.adjust(3 * hour)
    const afterPrune = yield* outcome(stageId)

    assert.deepStrictEqual({ beforePrune, afterPrune }, { beforePrune: "ok", afterPrune: "NotFound" })
  }))

it.effect("rejects a commit whose kept ids are not a non-empty, in-order subsequence of the pinned input", () =>
  Effect.gen(function*() {
    const server = yield* makeServer({ thresholdFloor: 1 })
    const conn = yield* server.connect
    const ids = makeIds(7)
    yield* conn.write([ids[0], ids[1]], [ids[2], ids[3]], [ids[4]], [ids[5]])
    yield* TestClock.adjust(pastLag)
    // Stored after the pin's H.
    yield* conn.write([ids[6]])

    const cases: ReadonlyArray<ReadonlyArray<ReadonlyArray<EntryIds>>> = [
      [[[ids[1]], [ids[6]]]],
      [[[ids[1]], [ids[1], ids[3]]]],
      [[[ids[1], makeIds(1)[0]]]],
      [[[ids[3]], [ids[1]]]],
      []
    ]
    const rejections = yield* Effect.forEach(cases, (segments) =>
      Effect.gen(function*() {
        const { stageId } = started(yield* conn.begin)
        const error = yield* Effect.flip(conn.snapshot(stageId, segments))
        yield* conn.abort(stageId)
        return error.code
      }))

    assert.deepStrictEqual(rejections, [
      "InvalidRequest",
      "InvalidRequest",
      "InvalidRequest",
      "InvalidRequest",
      "InvalidRequest"
    ])
  }))

it.effect("accepts kept ids matched to a later occurrence of a repeated input id", () =>
  Effect.gen(function*() {
    const server = yield* makeServer({ thresholdFloor: 1 })
    const conn = yield* server.connect
    const [a, b, c] = makeIds(3)
    // A partly known batch stores a again, so the input is a@0, b@1, a@2, c@3.
    yield* conn.write([a, b])
    yield* conn.write([a, c])
    yield* TestClock.adjust(pastLag)

    const { stageId } = started(yield* conn.begin)
    const committed = yield* conn.snapshot(stageId, [[[b], [a], [c]]])
    const served = yield* server.storage.changes(server.scope.publicKey, storeId, 0).pipe(
      Stream.take(3),
      Stream.runCollect
    )
    const sequenceOfA = served.find((batch) => key(batch.entryIds[0]) === key(a))!.sequence

    assert.strictEqual(committed, "Committed")
    assert.isAtLeast(sequenceOfA, 2)
  }))

it.effect("answers Begin with NotWanted below the threshold and logs no-ops while backing off multiplicatively", () => {
  const logs: Array<ReturnType<typeof Logger.formatStructured.log>> = []
  return Effect.gen(function*() {
    const server = yield* makeServer({ thresholdFloor: 4 })
    const conn = yield* server.connect
    // Commits NoOp for any stage it opens.
    const noOps: Array<string> = []
    const begin = Effect.gen(function*() {
      const result = yield* conn.begin
      if (result._tag === "Started") {
        assert.strictEqual(yield* conn.commit(result.stageId, { _tag: "NoOp" }), "Committed")
        noOps.push(result.stageId)
      }
      return result._tag
    })
    const writePastLag = Effect.gen(function*() {
      yield* conn.write(makeIds(4))
      yield* TestClock.adjust(pastLag)
      return yield* begin
    })

    yield* conn.write(makeIds(6))
    const results = [yield* begin]
    yield* TestClock.adjust(pastLag)
    // H = 5, then 9 (4 past the first no-op), 13 and 17 (8 past the second).
    results.push(yield* begin, yield* begin, yield* writePastLag, yield* writePastLag, yield* writePastLag)

    assert.deepStrictEqual(results, ["NotWanted", "Started", "NotWanted", "Started", "NotWanted", "Started"])
    for (const [index, stageId] of noOps.entries()) {
      const stageLogs = logs.filter((log) => log.annotations.stageId === stageId && log.level === "INFO")
      assert.lengthOf(stageLogs, 1, "NoOp commit must emit exactly one audit record per stage")
      assert.containsSubset(stageLogs[0].annotations, { ...server.scope, stageId, through: [5, 9, 17][index] })
    }
  }).pipe(Effect.provide(Logger.layer([Logger.formatStructured.pipe(Logger.map((log) => {
    logs.push(log)
  }))])))
})

it.effect("keeps activation off live changes and omits acks for re-uploads at or below the base", () =>
  Effect.gen(function*() {
    const server = yield* makeServer({ thresholdFloor: 1 })
    const writer = yield* server.connect
    const reader = yield* server.connect
    const ids = makeIds(8)
    yield* writer.write([ids[0], ids[1]], [ids[2], ids[3]], [ids[4]], [ids[5]])
    yield* TestClock.adjust(pastLag)
    yield* writer.write([ids[6]])
    const next = yield* reader.changes(6)
    const caughtUp = yield* next

    const { stageId } = started(yield* writer.begin)
    const committed = yield* writer.snapshot(stageId, [[[ids[1]], [ids[3]]]])
    // e0 was dropped and e6 is in the tail.
    const acks = yield* writer.write([ids[0]], [ids[6]])
    yield* writer.write([ids[7]])
    const live = yield* next

    const summarize = (batches: ReadonlyArray<EventLogEncryption.EncryptedRemoteBatch>) =>
      batches.map((batch) => ({ sequence: batch.sequence, entryIds: batch.entryIds.map(key) }))
    assert.deepStrictEqual(summarize(caughtUp), [{ sequence: 6, entryIds: [key(ids[6])] }])
    assert.strictEqual(committed, "Committed")
    assert.deepStrictEqual(acks.map((ack) => ({ entryId: key(ack.entryId), sequence: ack.sequence })), [
      { entryId: key(ids[6]), sequence: 6 }
    ])
    assert.deepStrictEqual(summarize(live), [{ sequence: 7, entryIds: [key(ids[7])] }])
  }))

it.effect.prop(
  "places every snapshot entry at or after its input sequence and at or below the base, without overlap",
  {
    // Each input batch, as whether each of its entries is kept.
    input: Schema.Array(Schema.Array(Schema.Boolean).check(Schema.isMinLength(1), Schema.isMaxLength(4))).check(
      Schema.isMinLength(1),
      Schema.isMaxLength(6)
    ),
    // Sizes of the snapshot batches, cycled over the kept entries.
    batchSizes: Schema.Array(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 3 }))).check(
      Schema.isMinLength(1),
      Schema.isMaxLength(4)
    )
  },
  Effect.fnUntraced(
    function*({ batchSizes, input }) {
      const server = yield* makeServer({ thresholdFloor: 1 })
      const conn = yield* server.connect
      const batches = input.map((flags) => flags.map(() => EventJournal.makeEntryIdUnsafe()))
      const ids = batches.flat()
      const flags = input.flat()
      const kept = ids.filter((_, i) => flags[i])
      if (kept.length === 0) return
      const firstSequence = conn.hello.firstSequence ?? 0
      const inputSequence = new Map(ids.map((id, i) => [key(id), firstSequence + i]))
      const base = firstSequence + ids.length - 1
      const snapshotBatches: Array<EntryIds> = []
      for (let i = 0, b = 0; i < kept.length; b++) {
        const size = batchSizes[b % batchSizes.length]
        snapshotBatches.push(kept.slice(i, i + size))
        i += size
      }

      yield* conn.write(...batches)
      yield* TestClock.adjust(pastLag)
      const { stageId } = started(yield* conn.begin)
      yield* conn.snapshot(stageId, [snapshotBatches])
      const served = yield* server.storage.changes(server.scope.publicKey, storeId, firstSequence).pipe(
        Stream.take(snapshotBatches.length),
        Stream.runCollect
      )

      let previousLast = firstSequence - 1
      for (const batch of served) {
        assert.isAbove(batch.sequence, previousLast)
        batch.entryIds.forEach((id, i) => {
          assert.isAtLeast(batch.sequence + i, inputSequence.get(key(id))!)
          assert.isAtMost(batch.sequence + i, base)
        })
        previousLast = batch.sequence + batch.entryIds.length - 1
      }
      assert.deepStrictEqual(served.flatMap((batch) => batch.entryIds.map(key)), kept.map(key))
    },
    Effect.scoped
  ),
  { arbitrary: { runs: 50 } }
)
