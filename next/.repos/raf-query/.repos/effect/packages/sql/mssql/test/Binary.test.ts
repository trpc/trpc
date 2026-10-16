import { MssqlClient } from "@effect/sql-mssql"
import { assert, it } from "@effect/vitest"
import { Effect } from "effect"
import * as Reactivity from "effect/reactivity/Reactivity"
import type * as Tedious from "tedious"
import { vi } from "vitest"

vi.mock("tedious", async (importOriginal) => {
  const original = await importOriginal<typeof Tedious>()

  class MockConnection extends original.Connection {
    override connect(callback?: (error?: Error) => void) {
      callback?.()
    }
    override close() {}
    override cancel() {
      return false
    }
    override makeRequest(request: Tedious.Request | Tedious.BulkLoad) {
      if (!(request instanceof original.Request)) {
        throw new Error("Unexpected bulk load")
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
