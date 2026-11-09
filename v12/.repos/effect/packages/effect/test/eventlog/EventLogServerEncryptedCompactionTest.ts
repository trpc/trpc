import { assert, it } from "@effect/vitest"
import { Clock, Effect, Exit, Fiber, Layer, Stream } from "effect"
import * as EventJournal from "effect/eventlog/EventJournal"
import type * as EventLogEncryption from "effect/eventlog/EventLogEncryption"
import * as EventLogMessage from "effect/eventlog/EventLogMessage"
import * as EventLogServerEncrypted from "effect/eventlog/EventLogServerEncrypted"
import { TestClock } from "effect/testing"

const storeId = EventLogMessage.StoreId.make("store-a")
const minute = 60_000
const hour = 60 * minute
const day = 24 * hour

// `marker` identifies the stored bytes, so a test can tell a snapshot batch
// from the original holding the same ids.
const makeBatch = (marker: number, ...entryIds: Array<EventJournal.EntryId>): EventLogEncryption.EncryptedBatch => ({
  entryIds: entryIds as [EventJournal.EntryId, ...Array<EventJournal.EntryId>],
  iv: new Uint8Array(12),
  encryptedBatch: Uint8Array.of(marker)
})

const makeIds = (count: number) => Array.from({ length: count }, () => EventJournal.makeEntryIdUnsafe())

const key = (id: EventJournal.EntryId) => Array.from(id).join(",")

const summarize = (
  batches: ReadonlyArray<{
    readonly sequence: number
    readonly entryIds: ReadonlyArray<EventJournal.EntryId>
    readonly encryptedBatch?: Uint8Array
  }>
) =>
  batches.map((batch) => ({
    sequence: batch.sequence,
    entryIds: batch.entryIds.map(key),
    marker: batch.encryptedBatch?.[0]
  }))

const header = (sequence: number, entryIds: ReadonlyArray<EventJournal.EntryId>, marker?: number) => ({
  sequence,
  entryIds: entryIds.map(key),
  marker
})

const started = (result: EventLogServerEncrypted.CompactionBeginResult) =>
  result._tag === "Started" ? result : assert.fail(`expected Started, got ${result._tag}`)

// A store holding [e0, e1] at 0, [e2, e3] at 2, [e4] at 4 and [e5] at 5,
// counted from the storage's first sequence by `seq`.
const makeStore = Effect.gen(function*() {
  const storage = yield* EventLogServerEncrypted.Storage
  const compaction = storage.compaction ?? assert.fail("Storage does not provide compaction")
  const first = storage.firstSequence ?? 0
  const seq = (offset: number) => first + offset
  const publicKey = crypto.randomUUID()
  const ids = makeIds(6)
  yield* storage.write(publicKey, storeId, [
    makeBatch(0, ids[0], ids[1]),
    makeBatch(2, ids[2], ids[3]),
    makeBatch(4, ids[4]),
    makeBatch(5, ids[5])
  ])
  const changes = (startSequence: number, count: number) =>
    storage.changes(publicKey, storeId, seq(startSequence)).pipe(Stream.take(count), Stream.runCollect)
  // Keeps e1, e3 and e4 of the input through 4, as [e1] ending at its input
  // sequence 1 and [e3, e4] ending at the base.
  const commitSnapshot = Effect.gen(function*() {
    const { stageId } = started(yield* compaction.begin(publicKey, storeId, { through: seq(4) }))
    yield* compaction.stagePart(publicKey, storeId, stageId, 0, [makeBatch(11, ids[1]), makeBatch(13, ids[3], ids[4])])
    return yield* compaction.commit(publicKey, storeId, stageId, [seq(1), seq(3)])
  })
  return { compaction, publicKey, ids, changes, commitSnapshot, seq }
})

// Reads a stream, reporting the error tag it fails with or how many items it held.
const outcome = <A, E extends { readonly _tag: string }>(stream: Stream.Stream<A, E>) =>
  Stream.runCollect(stream).pipe(
    Effect.match({ onFailure: (error) => error._tag, onSuccess: (items) => `${items.length} items` })
  )

// A sweep that waits on I/O can finish after `TestClock.adjust` returns, so a
// read that depends on it retries for a while on the live clock.
const eventually = Effect.fnUntraced(function*<A, E, R>(read: Effect.Effect<A, E, R>, done: (value: A) => boolean) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const value = yield* read
    if (done(value)) return value
    yield* TestClock.withLive(Effect.sleep(10))
  }
  return yield* read
})

// The tests share one TestClock, so they run one at a time. A test that needs
// its own config or sweep schedule provides a fresh storage from `storage`,
// built on the same `dependencies` as the shared one.
export const suite = <R>(
  name: string,
  storage: (options: {
    readonly compaction?: EventLogServerEncrypted.CompactionOptions | undefined
  }) => Layer.Layer<EventLogServerEncrypted.Storage, unknown, R>,
  dependencies: Layer.Layer<R, unknown>
) =>
  it.layer(
    Layer.provideMerge(
      storage({}),
      // Client connection deadlines use real time; storage and sweeps use TestClock.
      Layer.provide(dependencies, Layer.succeed(Clock.Clock)(Clock.Clock.defaultValue()))
    ),
    { concurrent: false, timeout: "60 seconds" }
  )(
    `Encrypted compaction storage (${name})`,
    (it) => {
      it.effect("slides a stage's claim on each Part and rejects a stale Part after a steal", () =>
        Effect.gen(function*() {
          const { compaction, ids, publicKey, seq } = yield* makeStore
          const begunAt = yield* Clock.currentTimeMillis
          const first = started(yield* compaction.begin(publicKey, storeId, { through: seq(1) }))

          yield* TestClock.adjust(5 * minute)
          yield* compaction.stagePart(publicKey, storeId, first.stageId, 0, [makeBatch(11, ids[1])])
          yield* TestClock.adjust(6 * minute)
          const busy = yield* compaction.begin(publicKey, storeId, { through: seq(1) })
          yield* TestClock.adjust(5 * minute)
          const second = started(yield* compaction.begin(publicKey, storeId, { through: seq(1) }))
          const stale = yield* compaction.stagePart(publicKey, storeId, first.stageId, 1, [makeBatch(10, ids[0])]).pipe(
            Effect.flip
          )

          assert.deepStrictEqual(busy, { _tag: "Busy", expiresAt: begunAt + 15 * minute })
          assert.notStrictEqual(second.stageId, first.stageId)
          assert.strictEqual(stale._tag, "CompactionNotFound")
        }))

      it.effect("acknowledges a retried segment without staging it twice", () =>
        Effect.gen(function*() {
          const { compaction, ids, publicKey, seq } = yield* makeStore
          const { stageId } = started(yield* compaction.begin(publicKey, storeId, { through: seq(4) }))
          const part = [makeBatch(11, ids[1])] as const

          const results = [
            yield* compaction.stagePart(publicKey, storeId, stageId, 0, part),
            yield* compaction.stagePart(publicKey, storeId, stageId, 0, part)
          ]
          const staged = yield* Stream.runCollect(compaction.stagedHeaders(publicKey, storeId, stageId))

          assert.deepStrictEqual(results, ["Stored", "AlreadyStored"])
          assert.deepStrictEqual(staged.map((header) => header.entryIds), [[ids[1]]])
        }))

      it.effect("releases the claim on abort and no-op, and clears the no-op state on commit", () =>
        Effect.gen(function*() {
          const { compaction, ids, publicKey, seq } = yield* makeStore
          const aborted = started(yield* compaction.begin(publicKey, storeId, { through: seq(4) }))
          yield* compaction.abort(publicKey, storeId, aborted.stageId)
          const noOp = started(yield* compaction.begin(publicKey, storeId, { through: seq(4) }))
          yield* compaction.recordNoOp(publicKey, storeId, noOp.stageId)
          const afterNoOp = (yield* compaction.status(publicKey, storeId)).noOp
          const { stageId } = started(yield* compaction.begin(publicKey, storeId, { through: seq(4) }))
          yield* compaction.stagePart(publicKey, storeId, stageId, 0, [makeBatch(11, ids[1])])
          const commit = yield* compaction.commit(publicKey, storeId, stageId, [seq(1)])
          const afterCommit = (yield* compaction.status(publicKey, storeId)).noOp

          assert.deepStrictEqual(afterNoOp, { at: seq(4), count: 1 })
          assert.strictEqual(commit, "Committed")
          assert.strictEqual(afterCommit, undefined)
        }))

      it.effect("reports as the lag head the last sequence of each storage hour once it ended a lag ago", () =>
        Effect.gen(function*() {
          const now = yield* Clock.currentTimeMillis
          // 30 minutes into an hour, so the store's first writes share it.
          yield* TestClock.adjust(hour - (now % hour) + 30 * minute)
          const { compaction, publicKey, seq } = yield* makeStore
          const storage = yield* EventLogServerEncrypted.Storage
          yield* TestClock.adjust(hour)
          yield* storage.write(publicKey, storeId, [makeBatch(6, ...makeIds(1))])
          const lagHead = Effect.map(compaction.status(publicKey, storeId), (status) => status.lagHead)

          // 30 minutes into the second hour: the first hour passes the lag in
          // 23 hours and 30 minutes.
          yield* TestClock.adjust(23 * hour + 29 * minute)
          const beforeFirst = yield* lagHead
          yield* TestClock.adjust(2 * minute)
          const afterFirst = yield* lagHead
          yield* TestClock.adjust(hour - 2 * minute)
          const beforeSecond = yield* lagHead
          yield* TestClock.adjust(2 * minute)
          const afterSecond = yield* lagHead

          assert.deepStrictEqual(
            { beforeFirst, afterFirst, beforeSecond, afterSecond },
            { beforeFirst: seq(-1), afterFirst: seq(5), beforeSecond: seq(5), afterSecond: seq(6) }
          )
        }))

      it.effect("fails reads of an expired stage before the sweep closes it", () =>
        Effect.gen(function*() {
          const { compaction, publicKey, seq } = yield* makeStore
          const { stageId } = started(yield* compaction.begin(publicKey, storeId, { through: seq(4) }))

          // Past the 10 minute stage TTL, well before the hourly sweep.
          yield* TestClock.adjust(11 * minute)
          const reads = [
            yield* outcome(compaction.inputHeaders(publicKey, storeId, stageId)),
            yield* outcome(compaction.fetch(publicKey, storeId, stageId, [seq(0)])),
            yield* outcome(compaction.stagedHeaders(publicKey, storeId, stageId))
          ]

          assert.deepStrictEqual(reads, ["CompactionNotFound", "CompactionNotFound", "CompactionNotFound"])
        }).pipe(Effect.provide(storage({}))))

      it.effect("fails an Input or Fetch read again after its stage's pin was pruned", () =>
        Effect.gen(function*() {
          const { commitSnapshot, compaction, ids, publicKey, seq } = yield* makeStore
          yield* commitSnapshot
          const { stageId } = started(yield* compaction.begin(publicKey, storeId, { through: seq(5) }))
          const active = (yield* compaction.history(publicKey, storeId)).find((activation) => activation.active)!
          yield* compaction.rollback(publicKey, storeId, active.activationId)
          const input = compaction.inputHeaders(publicKey, storeId, stageId)
          const fetch = compaction.fetch(publicKey, storeId, stageId, [seq(1), seq(3), seq(5)])
          const beforePrune = [yield* outcome(input), yield* outcome(fetch)]

          // A Part keeps the stage alive past the withdrawn snapshot's grace.
          yield* TestClock.adjust(23 * hour)
          yield* compaction.stagePart(publicKey, storeId, stageId, 0, [makeBatch(11, ids[1])])
          yield* TestClock.adjust(3 * hour)
          const afterPrune = [
            yield* eventually(outcome(input), (result) => result === "CompactionNotFound"),
            yield* outcome(fetch)
          ]

          assert.deepStrictEqual(beforePrune, ["3 items", "3 items"])
          assert.deepStrictEqual(afterPrune, ["CompactionNotFound", "CompactionNotFound"])
        }).pipe(Effect.provide(storage({ compaction: { grace: "25 hours", lag: "24 hours", stageTtl: "24 hours" } }))))

      it.effect("serves the snapshot at or below the base and the originals above it", () =>
        Effect.gen(function*() {
          const { changes, commitSnapshot, compaction, ids, publicKey, seq } = yield* makeStore
          assert.strictEqual(yield* commitSnapshot, "Committed")

          const fromBelow = yield* changes(0, 3)
          const fromInside = yield* changes(2, 2)
          const fromAbove = yield* changes(5, 1)
          const { stageId } = started(yield* compaction.begin(publicKey, storeId, { through: seq(5) }))
          const input = yield* Stream.runCollect(compaction.inputHeaders(publicKey, storeId, stageId))
          const fetched = yield* Stream.runCollect(compaction.fetch(publicKey, storeId, stageId, [seq(3), seq(5)]))

          const snapshotFirst = header(seq(1), [ids[1]], 11)
          const snapshotSecond = header(seq(3), [ids[3], ids[4]], 13)
          const tail = header(seq(5), [ids[5]], 5)
          assert.deepStrictEqual(summarize(fromBelow), [snapshotFirst, snapshotSecond, tail])
          assert.deepStrictEqual(summarize(fromInside), [snapshotSecond, tail])
          assert.deepStrictEqual(summarize(fromAbove), [tail])
          assert.deepStrictEqual(summarize(input), [
            header(seq(1), [ids[1]]),
            header(seq(3), [ids[3], ids[4]]),
            header(seq(5), [ids[5]])
          ])
          assert.deepStrictEqual(summarize(fetched), [snapshotSecond, tail])
        }))

      it.effect("fails changes when the active snapshot has no rows", () =>
        Effect.gen(function*() {
          const { changes, compaction, publicKey, seq } = yield* makeStore
          const { stageId } = started(yield* compaction.begin(publicKey, storeId, { through: seq(4) }))
          yield* compaction.commit(publicKey, storeId, stageId, [])

          const exit = yield* Effect.exit(changes(0, 1))

          assert.isTrue(Exit.isFailure(exit))
        }))

      it.effect("rolls back to the originals within grace, and the sweep leaves them", () =>
        Effect.gen(function*() {
          const { changes, commitSnapshot, compaction, ids, publicKey, seq } = yield* makeStore
          yield* commitSnapshot
          yield* TestClock.adjust(29 * day)
          const pinned = started(yield* compaction.begin(publicKey, storeId, { through: seq(5) }))
          const active = (yield* compaction.history(publicKey, storeId)).find((activation) => activation.active)!

          yield* compaction.rollback(publicKey, storeId, active.activationId)
          const commit = yield* compaction.commit(publicKey, storeId, pinned.stageId, [])
          const status = yield* compaction.status(publicKey, storeId)
          yield* TestClock.adjust(2 * day)
          const served = yield* changes(0, 4)

          assert.strictEqual(commit, "Superseded")
          assert.strictEqual(status.base, seq(-1))
          assert.deepStrictEqual(summarize(served), [
            header(seq(0), [ids[0], ids[1]], 0),
            header(seq(2), [ids[2], ids[3]], 2),
            header(seq(4), [ids[4]], 4),
            header(seq(5), [ids[5]], 5)
          ])
        }))

      it.effect("re-appends the withdrawn snapshot's input on rollback, so its readers end with every entry", () =>
        Effect.gen(function*() {
          const { changes, commitSnapshot, compaction, ids, publicKey, seq } = yield* makeStore
          const storage = yield* EventLogServerEncrypted.Storage
          yield* commitSnapshot
          const [sentinel] = makeIds(1)
          const all = [...ids, sentinel].map(key)
          // Follows changes until the sentinel, written after the rollback, arrives.
          const follow = (startSequence: number, received: Array<string>) =>
            storage.changes(publicKey, storeId, startSequence).pipe(
              Stream.tap((batch) => Effect.sync(() => received.push(...batch.entryIds.map(key)))),
              Stream.takeUntil((batch) => batch.entryIds.some((id) => key(id) === key(sentinel))),
              Stream.runDrain
            )
          // One reader has read the whole snapshot, [e1] [e3, e4] [e5], and stays subscribed.
          const whole: Array<string> = []
          const wholeFiber = yield* Effect.forkChild(follow(seq(0), whole))
          const beforeRollback = yield* eventually(Effect.sync(() => [...whole]), (read) => read.length === 4)
          // The other stopped after the snapshot's first batch.
          const [first] = yield* changes(0, 1)
          const partway = first.entryIds.map(key)

          const active = (yield* compaction.history(publicKey, storeId)).find((activation) => activation.active)!
          yield* compaction.rollback(publicKey, storeId, active.activationId)
          yield* storage.write(publicKey, storeId, [makeBatch(6, sentinel)])
          yield* follow(first.sequence + first.entryIds.length, partway)
          yield* Fiber.join(wholeFiber)

          assert.sameMembers(beforeRollback, [ids[1], ids[3], ids[4], ids[5]].map(key))
          assert.sameMembers([...new Set(whole)], all)
          assert.sameMembers([...new Set(partway)], all)
        }))

      it.effect("prunes the superseded originals after grace and then refuses to roll back to them", () =>
        Effect.gen(function*() {
          const { changes, commitSnapshot, compaction, publicKey, seq } = yield* makeStore
          yield* commitSnapshot
          const [originals, snapshot] = yield* compaction.history(publicKey, storeId)

          yield* TestClock.adjust(30 * day - minute)
          const beforeGrace = (yield* compaction.history(publicKey, storeId))[0].restorable
          yield* TestClock.adjust(2 * hour)
          const afterGrace = yield* eventually(
            Effect.map(compaction.history(publicKey, storeId), (history) => history[0].restorable),
            (restorable) => !restorable
          )
          const rollback = yield* compaction.rollback(publicKey, storeId, snapshot.activationId).pipe(Effect.flip)
          const served = yield* changes(0, 3)

          assert.deepStrictEqual({ base: originals.base, active: originals.active }, { base: seq(-1), active: false })
          assert.deepStrictEqual({ beforeGrace, afterGrace }, { beforeGrace: true, afterGrace: false })
          assert.deepStrictEqual(rollback.reason, "PruneStarted")
          assert.deepStrictEqual(summarize(served).map((batch) => batch.marker), [11, 13, 5])
        }))
    }
  )
