import { PgliteClient } from "@effect/sql-pglite"
import { assert, describe, layer } from "@effect/vitest"
import { Effect } from "effect"

describe("PgliteClient JSON values", () => {
  layer(PgliteClient.layer(), { timeout: "30 seconds" })((it) => {
    for (const type of ["json", "jsonb"]) {
      it.effect.each(["null", "123", "hello", "", "\"quoted\"\\\n"])(
        `${type} preserves the string %j`,
        (input) =>
          Effect.gen(function*() {
            const sql = yield* PgliteClient.PgliteClient
            const rows = yield* sql<{ value: unknown }>`SELECT ${sql.json(input)}::${sql.literal(type)} AS value`
            assert.deepStrictEqual(rows, [{ value: input }])
          })
      )
    }
  })
})
