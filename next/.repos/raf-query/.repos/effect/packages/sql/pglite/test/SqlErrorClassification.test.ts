import { PgliteClient } from "@effect/sql-pglite"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import * as Reactivity from "effect/reactivity/Reactivity"
import type * as SqlError from "effect/sql/SqlError"

const queryFailureReason = (cause: unknown) =>
  Effect.gen(function*() {
    const client = yield* PgliteClient.fromClient({
      liveClient: makeFailingClient(cause) as any
    })
    const error = yield* Effect.flip(client`SELECT 1`)
    return error.reason
  }).pipe(
    Effect.scoped,
    Effect.provide(Reactivity.layer)
  )

const queryFailureReasonTag = (cause: unknown) => Effect.map(queryFailureReason(cause), (reason) => reason._tag)

const assertUniqueViolation = (reason: SqlError.SqlErrorReason, constraint: string) => {
  assert.strictEqual(reason._tag, "UniqueViolation")
  if (reason._tag === "UniqueViolation") {
    assert.strictEqual(reason.constraint, constraint)
  }
}

const makeFailingClient = (cause: unknown) => ({
  query: () => Promise.reject(cause)
})

describe("PgliteClient SqlError classification", () => {
  it.effect("classifies 23505 as UniqueViolation and trims the constraint name", () =>
    Effect.gen(function*() {
      const reason = yield* queryFailureReason({ code: "23505", constraint: "  users_email_key  " })
      assertUniqueViolation(reason, "users_email_key")
    }))

  it.effect("uses unknown for missing, non-string, or blank unique violation constraints", () =>
    Effect.gen(function*() {
      const missing = yield* queryFailureReason({ code: "23505" })
      assertUniqueViolation(missing, "unknown")

      const nonString = yield* queryFailureReason({ code: "23505", constraint: 123 })
      assertUniqueViolation(nonString, "unknown")

      const blank = yield* queryFailureReason({ code: "23505", constraint: "   " })
      assertUniqueViolation(blank, "unknown")
    }))

  it.effect("keeps non-unique integrity constraints classified as ConstraintError", () =>
    Effect.gen(function*() {
      const tag = yield* queryFailureReasonTag({ code: "23503", constraint: "orders_user_id_fkey" })
      assert.strictEqual(tag, "ConstraintError")
    }))
})
