import { assert, describe, it, vi } from "@effect/vitest"
import { Effect, Equal, Hash, Logger, Option, Schema } from "effect"
import * as EventJournal from "effect/eventlog/EventJournal"
import { TestClock } from "effect/testing"
import * as ConflictsTest from "./EventJournalConflictsTest.ts"

// `tail` fixes the random id bytes, so entries sharing a millisecond sort in a
// known order by id.
const entry = (msecs: number, event = "Repro", primaryKey = "key", tail?: number) => {
  const id = EventJournal.makeEntryIdUnsafe({ msecs })
  if (tail !== undefined) id.fill(tail, 6)
  return new EventJournal.Entry({
    id,
    event,
    primaryKey,
    payload: new Uint8Array()
  }, { disableChecks: true })
}

// Fixes the 12 `rand_a` bits, which local ids use for their counter.
const remoteEntryWithRandA = (msecs: number, randA: number) => {
  const id = EventJournal.makeEntryIdUnsafe({ msecs })
  id[6] = 0x70 | (randA >> 8)
  id[7] = randA & 0xff
  return new EventJournal.Entry({ id, event: "Repro", primaryKey: "key", payload: new Uint8Array() }, {
    disableChecks: true
  })
}

const importEntry = (journal: EventJournal.EventJournal["Service"], entry: EventJournal.Entry) =>
  journal.writeFromRemote({
    remoteId: EventJournal.makeRemoteIdUnsafe(),
    entries: [new EventJournal.RemoteEntry({ remoteSequence: 0, entry })],
    effect: () => Effect.void
  })

const idStrings = (entries: ReadonlyArray<EventJournal.Entry>) => entries.map((item) => item.idString)

// Preserve the original UUID formatter as the compatibility oracle.
const legacyStringify = (bytes: Uint8Array): string =>
  [
    bytes.subarray(0, 4),
    bytes.subarray(4, 6),
    bytes.subarray(6, 8),
    bytes.subarray(8, 10),
    bytes.subarray(10, 16)
  ].map((segment) => Array.from(segment, (byte) => byte.toString(16).padStart(2, "0")).join("")).join("-")

// Importing the maximum timestamp can exhaust the entry id clock of its module,
// so those tests use their own module instances. They load before any test
// runs, so loading them cannot stall running tests.
const isolate = () => {
  vi.resetModules()
  return Promise.all([import("effect/Effect"), import("effect/eventlog/EventJournal")]).then((
    [Effect, EventJournal]
  ) => ({ Effect, EventJournal }))
}
const Isolated = await isolate()
const IsolatedFailedImport = await isolate()

// Saturated `rand_a` bits at the maximum timestamp leave no later local id.
const maximumEntry = ({ EventJournal }: typeof Isolated) => {
  const id = EventJournal.makeEntryIdUnsafe({ msecs: 2 ** 48 - 1 })
  id[6] = 0x7f
  id[7] = 0xff
  return new EventJournal.Entry({ id, event: "Repro", primaryKey: "key", payload: new Uint8Array() }, {
    disableChecks: true
  })
}

describe("EventJournal", () => {
  ConflictsTest.suite(EventJournal.makeMemory)

  it.effect("deduplicates overlapping remote entries within one incoming array", () =>
    Effect.gen(function*() {
      const journal = yield* EventJournal.makeMemory
      const remoteId = EventJournal.makeRemoteIdUnsafe()
      const a = entry(1_000)
      const b = entry(2_000)
      const handled: Array<string> = []
      // Flattened overlapping batches [A] and [A, B], not separate journal writes.
      const repeatedA = new EventJournal.Entry({ ...a, id: a.id.slice() as EventJournal.EntryId })
      yield* journal.writeFromRemote({
        remoteId,
        entries: [a, repeatedA, b].map((entry, remoteSequence) =>
          new EventJournal.RemoteEntry({ remoteSequence, entry })
        ),
        effect: (batch) =>
          Effect.sync(() => {
            handled.push(...batch.map(({ entry }) => entry.idString))
          })
      })

      assert.deepStrictEqual({
        handled,
        stored: (yield* journal.entries).map((entry) => entry.idString),
        nextSequence: yield* journal.nextRemoteSequence(remoteId)
      }, {
        handled: [a.idString, b.idString],
        stored: [a.idString, b.idString],
        nextSequence: 3
      })
    }))

  it.effect("advances remote progress past a trailing known entry in a partly known batch", () =>
    Effect.gen(function*() {
      const journal = yield* EventJournal.makeMemory
      const remoteId = EventJournal.makeRemoteIdUnsafe()
      const a = entry(1_000)
      const b = entry(2_000)
      const handled: Array<string> = []
      const effect = (batch: ReadonlyArray<{ readonly entry: EventJournal.Entry }>) =>
        Effect.sync(() => {
          handled.push(...batch.map(({ entry }) => entry.idString))
        })
      yield* journal.writeFromRemote({
        remoteId,
        entries: [new EventJournal.RemoteEntry({ remoteSequence: 0, entry: a })],
        effect
      })
      yield* journal.writeFromRemote({
        remoteId,
        entries: [
          new EventJournal.RemoteEntry({ remoteSequence: 1, entry: b }),
          new EventJournal.RemoteEntry({ remoteSequence: 2, entry: a })
        ],
        effect
      })

      assert.deepStrictEqual({
        handled,
        stored: (yield* journal.entries).map((entry) => entry.idString),
        nextSequence: yield* journal.nextRemoteSequence(remoteId)
      }, {
        handled: [a.idString, b.idString],
        stored: [a.idString, b.idString],
        nextSequence: 3
      })
    }))

  it.effect("entriesById preserves order, repeated ids and missing entries", () =>
    Effect.gen(function*() {
      const journal = yield* EventJournal.makeMemory
      const entries: Array<EventJournal.Entry> = []
      for (const primaryKey of ["first", "second"]) {
        entries.push(
          yield* journal.write({
            event: "Repro",
            primaryKey,
            payload: new Uint8Array([entries.length + 1]),
            effect: Effect.succeed
          })
        )
      }
      const [first, second] = entries
      const missing = EventJournal.makeEntryIdUnsafe()
      const found = yield* journal.entriesById([
        second.id.slice() as EventJournal.EntryId,
        missing,
        first.id.slice() as EventJournal.EntryId,
        second.id.slice() as EventJournal.EntryId
      ])
      assert.deepStrictEqual(found, [second, undefined, first, second])
      assert.deepStrictEqual(yield* journal.entriesById([]), [])
    }))

  it("formats schema-accepted ids identically to the original UUID formatter", () => {
    const ids: Array<Uint8Array> = [new Uint8Array(16), new Uint8Array(16).fill(0xff)]
    for (let length = 0; length < 16; length++) {
      ids.push(Uint8Array.from({ length }, (_, offset) => offset + 1))
    }
    // Exercise every lookup-table value, including bytes that need a leading zero.
    for (let start = 0; start < 256; start += 16) {
      ids.push(Uint8Array.from({ length: 16 }, (_, offset) => start + offset))
    }
    for (let i = 0; i < 100; i++) {
      ids.push(
        crypto.getRandomValues(new Uint8Array(16)),
        EventJournal.makeRemoteIdUnsafe(),
        EventJournal.makeEntryIdUnsafe({ msecs: i })
      )
    }
    for (const id of ids) {
      const item = new EventJournal.Entry({
        id: Schema.decodeUnknownSync(EventJournal.EntryId)(id),
        event: "Repro",
        primaryKey: "key",
        payload: new Uint8Array()
      })
      assert.strictEqual(item.idString, legacyStringify(id))
    }
  })

  it("memoizes idString per entry instance, not per id buffer", () => {
    const id = new Uint8Array(16) as EventJournal.EntryId
    const makeEntry = () =>
      new EventJournal.Entry({ id, event: "Repro", primaryKey: "key", payload: new Uint8Array() }, {
        disableChecks: true
      })
    const first = makeEntry()
    assert.strictEqual(first.idString, "00000000-0000-0000-0000-000000000000")

    // Changing the public byte buffer must not cause an already-read entry to reformat.
    id.fill(0xff)
    const second = makeEntry()
    assert.strictEqual(second.idString, "ffffffff-ffff-ffff-ffff-ffffffffffff")
    id.fill(0x11)
    assert.strictEqual(first.idString, "00000000-0000-0000-0000-000000000000")
    assert.strictEqual(second.idString, "ffffffff-ffff-ffff-ffff-ffffffffffff")
  })

  it("keeps equality, hashing and JSON independent of idString access", () => {
    const first = entry(1_000)
    const second = new EventJournal.Entry({
      id: first.id,
      event: first.event,
      primaryKey: first.primaryKey,
      payload: first.payload
    })
    const json = JSON.stringify(first)

    assert.strictEqual(first.idString, legacyStringify(first.id))
    assert.deepStrictEqual({
      equal: Equal.equals(first, second),
      sameHash: Hash.hash(first) === Hash.hash(second),
      json: JSON.stringify(first)
    }, { equal: true, sameHash: true, json })
  })

  it("reads idString on a frozen entry", () => {
    const item = Object.freeze(entry(1_000))
    assert.strictEqual(item.idString, legacyStringify(item.id))
  })

  it("decodes the 48-bit UUID v7 timestamp from entry ids", () => {
    const cases: ReadonlyArray<readonly [prefix: ReadonlyArray<number>, millis: number]> = [
      [[0x00, 0x00, 0x00, 0x00, 0x00, 0x00], 0],
      [[0x00, 0x00, 0x00, 0x00, 0x00, 0x01], 1],
      [[0x00, 0x00, 0x80, 0x00, 0x00, 0x00], 2_147_483_648],
      [[0x01, 0x02, 0x03, 0x04, 0x05, 0x06], 1_108_152_157_446],
      [[0x01, 0x99, 0xc8, 0x2c, 0xc0, 0x00], 1_760_000_000_000],
      [[0xff, 0xff, 0xff, 0xff, 0xff, 0xff], 281_474_976_710_655]
    ]
    for (const [prefix, millis] of cases) {
      const id = new Uint8Array(16).fill(0xab) as EventJournal.EntryId
      id.set(prefix)
      assert.strictEqual(EventJournal.entryIdMillis(id), millis)
      assert.strictEqual(entry(millis).createdAtMillis, millis)
    }
  })

  it("generates strictly ascending entry ids when the clock stalls or moves backwards", () => {
    // Later than any id generated or observed so far in this process.
    const start = EventJournal.entryIdMillis(EventJournal.makeEntryIdUnsafe()) + 1_000_000
    const now = vi.spyOn(Date, "now").mockReturnValue(start)
    try {
      const ids = Array.from({ length: 10_000 }, () => EventJournal.makeEntryIdUnsafe())
      now.mockReturnValue(start - 60_000)
      ids.push(EventJournal.makeEntryIdUnsafe())
      for (let i = 1; i < ids.length; i++) {
        if (EventJournal.EntryIdOrder(ids[i - 1], ids[i]) !== -1) {
          assert.fail(`id ${i} does not sort after id ${i - 1}`)
        }
      }
      // Exhausting a millisecond may move timestamps ahead slightly, never back.
      const millis = ids.map(EventJournal.entryIdMillis)
      assert.isAtLeast(Math.min(...millis), start)
      assert.isAtMost(Math.max(...millis), start + 3)
    } finally {
      now.mockRestore()
    }
  })

  // These run synchronously so the mocked clock never leaks into concurrent tests.
  it("generates local ids after imported ids from the same or a later millisecond", () => {
    const journal = Effect.runSync(EventJournal.makeMemory)
    // Later than any clock-based id generated so far in this process.
    const millis = EventJournal.entryIdMillis(EventJournal.makeEntryIdUnsafe()) + 1
    const now = vi.spyOn(Date, "now").mockReturnValue(millis)
    try {
      // Saturated `rand_a` bits sort above every local id counter in the same
      // millisecond.
      for (const remote of [remoteEntryWithRandA(millis, 0xfff), remoteEntryWithRandA(millis + 1, 0xfff)]) {
        Effect.runSync(importEntry(journal, remote))
        const local = Effect.runSync(journal.write({
          event: "Repro",
          primaryKey: "key",
          payload: new Uint8Array(),
          effect: Effect.succeed
        }))
        assert.strictEqual(EventJournal.EntryIdOrder(remote.id, local.id), -1)
      }
    } finally {
      now.mockRestore()
    }
  })

  it("continues the local id counter after a low imported rand_a in the same millisecond", () => {
    const journal = Effect.runSync(EventJournal.makeMemory)
    const millis = EventJournal.entryIdMillis(EventJournal.makeEntryIdUnsafe()) + 1
    const remote = remoteEntryWithRandA(millis, 5)
    const now = vi.spyOn(Date, "now").mockReturnValue(millis)
    try {
      Effect.runSync(importEntry(journal, remote))
      const local = Effect.runSync(journal.write({
        event: "Repro",
        primaryKey: "key",
        payload: new Uint8Array(),
        effect: Effect.succeed
      }))
      assert.strictEqual(EventJournal.EntryIdOrder(remote.id, local.id), -1)
      // Only a saturated counter needs the next millisecond.
      assert.strictEqual(EventJournal.entryIdMillis(local.id), millis)
    } finally {
      now.mockRestore()
    }
  })

  it("never commits a local id below an imported id at the maximum timestamp", () => {
    const { Effect, EventJournal } = Isolated
    const journal = Effect.runSync(EventJournal.makeMemory)
    const remote = maximumEntry(Isolated)
    Effect.runSync(journal.writeFromRemote({
      remoteId: EventJournal.makeRemoteIdUnsafe(),
      entries: [new EventJournal.RemoteEntry({ remoteSequence: 0, entry: remote })],
      effect: () => Effect.void
    }))
    // No later id exists, so the write may fail, but it must not commit an id
    // that sorts before the imported one.
    Effect.runSyncExit(journal.write({
      event: "Repro",
      primaryKey: "key",
      payload: new Uint8Array(),
      effect: Effect.succeed
    }))
    const below = Effect.runSync(journal.entries).filter((entry) =>
      EventJournal.EntryIdOrder(entry.id, remote.id) === -1
    )
    assert.deepStrictEqual(idStrings(below), [])
  })

  it("keeps local writes working after a failed import of an id at the maximum timestamp", () => {
    const { Effect, EventJournal } = IsolatedFailedImport
    const journal = Effect.runSync(EventJournal.makeMemory)
    const failed = Effect.runSyncExit(journal.writeFromRemote({
      remoteId: EventJournal.makeRemoteIdUnsafe(),
      entries: [new EventJournal.RemoteEntry({ remoteSequence: 0, entry: maximumEntry(IsolatedFailedImport) })],
      effect: () => Effect.fail(new EventJournal.EventJournalError({ method: "test", cause: "rejected" }))
    }))
    const written = Effect.runSyncExit(journal.write({
      event: "Repro",
      primaryKey: "key",
      payload: new Uint8Array(),
      effect: Effect.succeed
    }))
    assert.strictEqual(failed._tag, "Failure")
    if (written._tag === "Failure") return assert.fail("the local write failed after the import was rejected")
    assert.deepStrictEqual(idStrings(Effect.runSync(journal.entries)), [written.value.idString])
  })

  it.effect("logs skew warnings relative to the supplied Clock service", () =>
    Effect.gen(function*() {
      const journal = yield* EventJournal.makeMemory
      const hour = 60 * 60 * 1000
      // Both imports advance the id clock and are over 24 hours ahead of wall time.
      const millis = EventJournal.entryIdMillis(EventJournal.makeEntryIdUnsafe()) + 48 * hour
      yield* TestClock.setTime(millis - 25 * hour)
      let warnings = 0
      const logger = Logger.layer([Logger.make(({ logLevel }) => {
        if (logLevel === "Warn") warnings++
      })])
      yield* importEntry(journal, entry(millis - 2 * hour)).pipe(Effect.provide(logger))
      const warningsWithin24Hours = warnings
      yield* importEntry(journal, entry(millis)).pipe(Effect.provide(logger))
      assert.deepStrictEqual({ warningsWithin24Hours, warnings }, { warningsWithin24Hours: 0, warnings: 1 })
    }))

  it.effect("logs skew warnings relative to the supplied Clock service when local ids are later", () =>
    Effect.gen(function*() {
      const journal = yield* EventJournal.makeMemory
      const hour = 60 * 60 * 1000
      // Local ids follow wall time, which is ahead of the supplied Clock here.
      const millis = EventJournal.entryIdMillis(EventJournal.makeEntryIdUnsafe())
      yield* TestClock.setTime(millis - 48 * hour)
      let warnings = 0
      const logger = Logger.layer([Logger.make(({ logLevel }) => {
        if (logLevel === "Warn") warnings++
      })])
      // 25 hours ahead of the supplied Clock, though behind the local ids.
      yield* importEntry(journal, entry(millis - 23 * hour)).pipe(Effect.provide(logger))
      assert.strictEqual(warnings, 1)
    }))

  it.effect("orders imported entries by id and reports conflicts with greater ids per event and key", () =>
    Effect.gen(function*() {
      const journal = yield* EventJournal.makeMemory
      const peer = EventJournal.makeRemoteIdUnsafe()
      yield* journal.nextRemoteSequence(peer)

      const a1 = entry(1_000, "A", "k1")
      const a2 = entry(3_000, "A", "k1", 0x20)
      const otherKey = entry(3_000, "A", "k2", 0x30)
      const otherEvent = entry(3_000, "B", "k1", 0x10)
      const sameMillis = entry(2_000, "A", "k1", 0x80)
      yield* journal.writeFromRemote({
        remoteId: EventJournal.makeRemoteIdUnsafe(),
        entries: [a1, a2, otherKey, otherEvent, sameMillis].map((entry, remoteSequence) =>
          new EventJournal.RemoteEntry({ remoteSequence, entry })
        ),
        effect: () => Effect.void
      })

      const x = entry(2_000, "A", "k1", 0x10)
      const y = entry(1_500, "A", "k1")
      const z = entry(3_000, "B", "k1", 0x80)
      const replayed: Array<readonly [string, ReadonlyArray<string>]> = []
      let callbacks = 0
      yield* journal.writeFromRemote({
        remoteId: EventJournal.makeRemoteIdUnsafe(),
        entries: [x, y, z].map((entry, remoteSequence) => new EventJournal.RemoteEntry({ remoteSequence, entry })),
        effect: (batch) =>
          Effect.sync(() => {
            callbacks++
            for (const { conflicts, entry } of batch) replayed.push([entry.idString, idStrings(conflicts)])
          })
      })

      assert.strictEqual(callbacks, 1)
      // The batch replays in id order. `x` shares a millisecond with
      // `sameMillis` and `z` with `otherEvent`; only greater ids conflict.
      assert.deepStrictEqual(replayed, [
        [y.idString, [sameMillis.idString, a2.idString]],
        [x.idString, [sameMillis.idString, a2.idString]],
        [z.idString, []]
      ])

      const expected = idStrings([a1, y, x, sameMillis, otherEvent, a2, otherKey, z])
      assert.deepStrictEqual(idStrings(yield* journal.entries), expected)
      const missing = yield* journal.withRemoteUncommited(peer, (entries) => Effect.succeed(idStrings(entries)))
      assert.deepStrictEqual(missing, Option.some(expected))
    }))

  it.effect("orders a local write after a future import and reports it as a conflict for older imports", () =>
    Effect.gen(function*() {
      const journal = yield* EventJournal.makeMemory
      const peer = EventJournal.makeRemoteIdUnsafe()
      const source = EventJournal.makeRemoteIdUnsafe()
      yield* journal.nextRemoteSequence(peer)
      yield* journal.nextRemoteSequence(source)

      // Ahead of the clock and of any id generated or observed so far in this process.
      const futureMillis = EventJournal.entryIdMillis(EventJournal.makeEntryIdUnsafe()) + 60_000
      const future = entry(futureMillis)
      yield* journal.writeFromRemote({
        remoteId: EventJournal.makeRemoteIdUnsafe(),
        entries: [new EventJournal.RemoteEntry({ remoteSequence: 0, entry: future })],
        effect: () => Effect.void
      })
      const local = yield* journal.write({
        event: "Repro",
        primaryKey: "key",
        payload: new Uint8Array(),
        effect: Effect.succeed
      })
      const imported = entry(futureMillis - 1)
      let conflicts: Array<string> = []
      yield* journal.writeFromRemote({
        remoteId: source,
        entries: [new EventJournal.RemoteEntry({ remoteSequence: 0, entry: imported })],
        effect: (batch) =>
          Effect.sync(() => {
            conflicts = batch.flatMap((item) => idStrings(item.conflicts))
          })
      })

      assert.deepStrictEqual(conflicts, idStrings([future, local]))
      const expected = idStrings([imported, future, local])
      assert.deepStrictEqual(idStrings(yield* journal.entries), expected)
      const missing = yield* journal.withRemoteUncommited(peer, (entries) => Effect.succeed(idStrings(entries)))
      assert.deepStrictEqual(missing, Option.some(expected))
      const sourceMissing = yield* journal.withRemoteUncommited(source, (entries) => Effect.succeed(idStrings(entries)))
      assert.deepStrictEqual(sourceMissing, Option.some(idStrings([future, local])))
    }))

  it.effect("reports conflicts in id order after a local write following a future import", () =>
    Effect.gen(function*() {
      const journal = yield* EventJournal.makeMemory
      const futureMillis = EventJournal.entryIdMillis(EventJournal.makeEntryIdUnsafe()) + 60_000
      const future = entry(futureMillis)
      yield* journal.writeFromRemote({
        remoteId: EventJournal.makeRemoteIdUnsafe(),
        entries: [new EventJournal.RemoteEntry({ remoteSequence: 0, entry: future })],
        effect: () => Effect.void
      })
      const local = yield* journal.write({
        event: "Repro",
        primaryKey: "key",
        payload: new Uint8Array(),
        effect: Effect.succeed
      })
      let conflicts: Array<string> = []
      yield* journal.writeFromRemote({
        remoteId: EventJournal.makeRemoteIdUnsafe(),
        entries: [new EventJournal.RemoteEntry({ remoteSequence: 0, entry: entry(1_000) })],
        effect: (batch) =>
          Effect.sync(() => {
            conflicts = batch.flatMap((item) => idStrings(item.conflicts))
          })
      })

      // The local id continues from the imported one, so it sorts after it.
      assert.deepStrictEqual(conflicts, idStrings([future, local]))
    }))

  it("makeEntryIdUnsafe increases strictly, and encodes an explicit msecs exactly", () => {
    const ids = Array.from({ length: 2000 }, () => Buffer.from(EventJournal.makeEntryIdUnsafe()).toString("hex"))
    assert.isTrue(ids.every((id, i) => i === 0 || ids[i - 1] < id))
    assert.strictEqual(EventJournal.entryIdMillis(EventJournal.makeEntryIdUnsafe({ msecs: 1000 })), 1000)
  })

  it.effect("relays an imported entry to another remote", () =>
    Effect.gen(function*() {
      const journal = yield* EventJournal.makeMemory
      const source = EventJournal.makeRemoteIdUnsafe()
      const target = EventJournal.makeRemoteIdUnsafe()
      yield* journal.nextRemoteSequence(target)
      const entry = new EventJournal.Entry({
        id: EventJournal.makeEntryIdUnsafe(),
        event: "Repro",
        primaryKey: "key",
        payload: new Uint8Array()
      }, { disableChecks: true })
      yield* journal.writeFromRemote({
        remoteId: source,
        entries: [new EventJournal.RemoteEntry({ remoteSequence: 0, entry })],
        effect: () => Effect.void
      })
      let targetCalls = 0
      const missing = yield* journal.withRemoteUncommited(target, (entries) =>
        Effect.sync(() => {
          targetCalls++
          return entries
        }))
      if (Option.isNone(missing)) assert.fail("Expected the callback result")
      assert.deepStrictEqual(missing.value.map((item) => item.idString), [entry.idString])
      assert.strictEqual(targetCalls, 1)

      let sourceCalls = 0
      const sourceMissing = yield* journal.withRemoteUncommited(source, () =>
        Effect.sync(() => {
          sourceCalls++
          return "called"
        }))
      assert.isTrue(Option.isNone(sourceMissing))
      assert.strictEqual(sourceCalls, 0)
    }))

  it.effect("returns the next unused remote sequence", () =>
    Effect.gen(function*() {
      const journal = yield* EventJournal.makeMemory
      const remoteId = EventJournal.makeRemoteIdUnsafe()
      const entry = new EventJournal.Entry({
        id: EventJournal.makeEntryIdUnsafe(),
        event: "Repro",
        primaryKey: "key",
        payload: new Uint8Array()
      }, { disableChecks: true })

      yield* journal.writeRemoteAcks({ remoteId, acks: [{ entryId: entry.id, sequence: 2 }] })
      assert.strictEqual(yield* journal.nextRemoteSequence(remoteId), 0)
      yield* journal.writeFromRemote({
        remoteId,
        entries: [new EventJournal.RemoteEntry({ remoteSequence: 0, entry })],
        effect: () => Effect.void
      })
      assert.strictEqual(yield* journal.nextRemoteSequence(remoteId), 1)
      yield* journal.writeRemoteAcks({ remoteId, acks: [2, 1, 0].map((sequence) => ({ entryId: entry.id, sequence })) })
      assert.strictEqual(yield* journal.nextRemoteSequence(remoteId), 3)
      yield* journal.writeFromRemote({
        remoteId,
        entries: [new EventJournal.RemoteEntry({ remoteSequence: 5, entry })],
        effect: () => Effect.void
      })
      yield* journal.writeRemoteAcks({ remoteId, acks: [{ entryId: entry.id, sequence: 2 }] })
      assert.strictEqual(yield* journal.nextRemoteSequence(remoteId), 6)
    }))

  it.effect("records entries in memory and publishes local changes", () =>
    Effect.gen(function*() {
      const journal = yield* EventJournal.EventJournal
      let created = 0
      yield* journal.write({
        event: "test",
        primaryKey: "pk-1",
        payload: new Uint8Array([1, 2, 3]),
        effect: (entry) =>
          Effect.sync(() => {
            created = entry.createdAtMillis
          })
      })
      const entries = yield* journal.entries
      assert.strictEqual(entries.length, 1)
      assert.strictEqual(entries[0].event, "test")
      assert.strictEqual(entries[0].primaryKey, "pk-1")
      assert.strictEqual(entries[0].createdAtMillis, created)
    }).pipe(Effect.provide(EventJournal.layerMemory)))
})
