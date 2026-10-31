import { MssqlClient } from "@effect/sql-mssql"
import { assert, it } from "@effect/vitest"
import { Effect } from "effect"
import * as Digest from "effect/crypto/Digest"
import type * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLogEncryption from "effect/eventlog/EventLogEncryption"
import type { StoreId } from "effect/eventlog/EventLogMessage"
import * as SqlEventLogServer from "effect/eventlog/SqlEventLogServerEncrypted"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as SqlClient from "effect/sql/SqlClient"
import { Buffer } from "node:buffer"
import type * as Tedious from "tedious"
import { vi } from "vitest"

vi.mock("tedious", async (importOriginal) => {
  const original = await importOriginal<typeof Tedious>()

  class MockConnection extends original.Connection {
    readonly entryIds = new Set<string>()

    override connect(callback?: (error?: Error) => void) {
      callback?.()
    }
    override close() {}
    override beginTransaction(callback: (error?: Error | null) => void) {
      callback()
    }
    override commitTransaction(callback: (error?: Error | null) => void) {
      callback()
    }
    override rollbackTransaction(callback: (error?: Error | null) => void) {
      callback()
    }
    override cancel() {
      return false
    }
    override makeRequest(request: Tedious.Request | Tedious.BulkLoad) {
      if (!(request instanceof original.Request)) {
        throw new Error("Unexpected bulk load")
      }
      const query = request.sqlTextOrProcedure?.trimStart() ?? ""
      if (query.startsWith("MERGE")) {
        const rows = []
        for (const parameter of request.parameters) {
          const id = parameter.value as Uint8Array
          const key = Array.from(id).join(",")
          if (this.entryIds.has(key)) continue
          this.entryIds.add(key)
          rows.push([{ metadata: { colName: "entry_id" }, value: id }])
        }
        request.callback(null, rows.length, rows)
        return
      }
      if (!query.startsWith("SELECT")) {
        request.callback(null, 0, [])
        return
      }
      // The store row the storage locks before each write.
      if (query.startsWith("SELECT next_sequence")) {
        const store = {
          next_sequence: 1,
          active_activation: "originals",
          active_batch_set: null,
          base_sequence: 0,
          active_kept_count: 0,
          no_op_at: null,
          no_op_count: 0,
          open_stage: null,
          next_sweep_at: null,
          sweep_lease_until: null,
          sweep_lease_owner: null,
          pruned_through: 0
        }
        request.callback(null, 1, [Object.entries(store).map(([colName, value]) => ({ metadata: { colName }, value }))])
        return
      }
      if (query.startsWith("SELECT MAX(last_sequence)")) {
        request.callback(null, 1, [[{ metadata: { colName: "last_sequence" }, value: null }]])
        return
      }
      const rows = request.parameters.map((parameter) => [
        { metadata: { colName: "value" }, value: parameter.value }
      ])
      request.callback(null, rows.length, rows)
    }
  }

  return { ...original, Connection: MockConnection }
})

it.effect("binds an interpolated Uint8Array as VarBinary", () =>
  Effect.gen(function*() {
    const client = yield* MssqlClient.make({
      server: "mock.invalid",
      minConnections: 0,
      maxConnections: 1
    })
    const rows = yield* client<{ value: Uint8Array }>`SELECT ${new Uint8Array([0, 128, 255])} AS value`

    assert.deepStrictEqual(Array.from(rows[0].value), [0, 128, 255])
  }).pipe(Effect.provide(Reactivity.layer)))

for (
  const [name, ids, expected] of [
    ["preserves distinct Buffer entry IDs", [Buffer.alloc(16, 0xff), Buffer.alloc(16, 0xfe)], [0xff, 0xfe]],
    [
      "deduplicates the same entry ID across Buffer and Uint8Array",
      [Buffer.alloc(16, 0xff), new Uint8Array(16).fill(0xff)],
      [0xff]
    ]
  ] as const
) {
  it.effect(name, () =>
    Effect.gen(function*() {
      const client = yield* MssqlClient.make({
        server: "mock.invalid",
        minConnections: 0,
        maxConnections: 1
      })
      const storage = yield* SqlEventLogServer.makeStorage().pipe(
        Effect.provideService(SqlClient.SqlClient, client)
      )
      const written = yield* storage.write(
        "public-key",
        "store-a" as StoreId,
        ids.map((id, index): EventLogEncryption.EncryptedBatch => ({
          entryIds: [id as EventJournal.EntryId],
          iv: new Uint8Array(12),
          encryptedBatch: Uint8Array.of(index)
        }))
      )

      assert.deepStrictEqual(
        written.flatMap((batch) => batch.entryIds.map((id) => Array.from(id))),
        expected.map((byte) => Array(16).fill(byte))
      )
    }).pipe(Effect.provide([Reactivity.layer, EventLogEncryption.layerSubtle, Digest.layerWebCrypto])))
}
