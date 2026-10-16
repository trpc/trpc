import { assert, it } from "@effect/vitest"
import { Effect, Fiber, Layer, Option, Queue, Stream } from "effect"
import * as EventJournal from "effect/eventlog/EventJournal"
import type { StoreId } from "effect/eventlog/EventLogMessage"
import * as SqlEventLogServerUnencrypted from "effect/eventlog/SqlEventLogServerUnencrypted"
import { Reactivity } from "effect/reactivity"
import type * as SqlClient from "effect/sql/SqlClient"

let nextNamespace = 0

const uniqueNamespace = (prefix: string) => `${prefix}_${++nextNamespace}`

const makeOptions = (prefix: string) => {
  const namespace = uniqueNamespace(prefix)
  return {
    entryTablePrefix: `effect_events_${namespace}`,
    remoteIdTable: `effect_remote_id_${namespace}`,
    insertBatchSize: 2
  }
}

const makeStoreId = (prefix: string) => `${uniqueNamespace(prefix)}_store` as StoreId

const makeEntry = (
  name: string,
  options: {
    readonly id?: EventJournal.EntryId | undefined
    readonly primaryKey?: string | undefined
  } = {}
) =>
  new EventJournal.Entry({
    id: options.id ?? EventJournal.makeEntryIdUnsafe(),
    event: "UserNameSet",
    primaryKey: options.primaryKey ?? "user-1",
    payload: new TextEncoder().encode(name)
  }, { disableChecks: true })

const makeStorage = (options: {
  readonly entryTablePrefix?: string
  readonly remoteIdTable?: string
  readonly insertBatchSize?: number
}) =>
  SqlEventLogServerUnencrypted.makeStorage(options).pipe(
    Effect.orDie
  )

export const suite = (name: string, layer: Layer.Layer<SqlClient.SqlClient, unknown>) =>
  it.layer(
    Layer.mergeAll(Reactivity.layer, layer),
    { timeout: "30 seconds" }
  )(`SqlEventLogServerUnencrypted (${name})`, (it) => {
    it.effect("persists remote id across storage instances", () =>
      Effect.gen(function*() {
        const options = makeOptions("remote_id")
        const storageA = yield* makeStorage(options)
        const storageB = yield* makeStorage(options)

        const idA = yield* storageA.getId
        const idB = yield* storageB.getId

        assert.deepStrictEqual(idA, idB)
      }))

    it.effect("replays backlog and then streams live changes without startup duplication", () =>
      Effect.gen(function*() {
        const storage = yield* makeStorage(makeOptions("changes_backlog_then_live"))
        const storeId = makeStoreId("changes")
        const entryA = makeEntry("Ada")
        const entryB = makeEntry("Grace")
        const entryC = makeEntry("Margaret")

        yield* storage.write(storeId, [entryA, entryB])

        const changes = yield* storage.changes({
          storeId,
          startSequence: 0,
          compactors: new Map()
        }).pipe(
          Stream.toQueue({ capacity: "unbounded" })
        )
        const replayed = yield* Queue.takeAll(changes)

        assert.deepStrictEqual(replayed.map((entry) => entry.remoteSequence), [1, 2])
        assert.deepStrictEqual(replayed.map((entry) => entry.entry.idString), [entryA.idString, entryB.idString])

        yield* storage.write(storeId, [entryC])

        const next = yield* Queue.take(changes)
        assert.strictEqual(next.remoteSequence, 3)
        assert.strictEqual(next.entry.idString, entryC.idString)

        yield* Effect.yieldNow
        assert.strictEqual(Option.isNone(yield* Queue.poll(changes)), true)
      }))

    it.effect("handles the changes startup race without losing or duplicating rows", () =>
      Effect.gen(function*() {
        const storage = yield* makeStorage(makeOptions("changes_startup_race"))

        for (let iteration = 0; iteration < 5; iteration++) {
          const storeId = makeStoreId(`startup_race_${iteration}`)
          const backlogEntry = makeEntry(`Ada_${iteration}`)
          const racedEntry = makeEntry(`Grace_${iteration}`)

          yield* storage.write(storeId, [backlogEntry])

          const changesFiber = yield* storage.changes({
            storeId,
            startSequence: 0,
            compactors: new Map()
          }).pipe(
            Stream.toQueue({ capacity: "unbounded" }),
            Effect.forkChild
          )
          yield* storage.write(storeId, [racedEntry])
          const changes = yield* Fiber.join(changesFiber)

          const first = yield* Queue.take(changes)
          const second = yield* Queue.take(changes)

          assert.deepStrictEqual(
            [first.remoteSequence, second.remoteSequence],
            [1, 2],
            `iteration ${iteration} should deliver exactly the backlog row and the raced row`
          )
          assert.deepStrictEqual(
            [first.entry.idString, second.entry.idString],
            [backlogEntry.idString, racedEntry.idString]
          )

          yield* Effect.yieldNow
          assert.strictEqual(Option.isNone(yield* Queue.poll(changes)), true)
        }
      }))

    it.effect("isolates reads and streams between stores", () =>
      Effect.gen(function*() {
        const storage = yield* makeStorage(makeOptions("store_isolation"))
        const storeA = makeStoreId("isolation_a")
        const storeB = makeStoreId("isolation_b")
        const entryA1 = makeEntry("Ada")
        const entryB1 = makeEntry("Grace")
        const entryA2 = makeEntry("Margaret")
        const entryB2 = makeEntry("Linus")

        yield* storage.write(storeA, [entryA1])
        yield* storage.write(storeB, [entryB1])

        const changesA = yield* storage.changes({
          storeId: storeA,
          startSequence: 0,
          compactors: new Map()
        }).pipe(
          Stream.toQueue({ capacity: "unbounded" })
        )
        const backlogA = yield* Queue.takeAll(changesA)
        assert.deepStrictEqual(backlogA.map((entry) => entry.entry.idString), [entryA1.idString])

        yield* storage.write(storeB, [entryB2])
        yield* Effect.yieldNow
        assert.strictEqual(Option.isNone(yield* Queue.poll(changesA)), true)

        yield* storage.write(storeA, [entryA2])
        const nextA = yield* Queue.take(changesA)

        assert.strictEqual(nextA.remoteSequence, 2)
        assert.strictEqual(nextA.entry.idString, entryA2.idString)
      }))
  })
