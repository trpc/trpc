import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import * as Reactivity from "effect/reactivity/Reactivity"
import type * as SqlError from "effect/sql/SqlError"
import { vi } from "vitest"

const state: {
  connectCause: unknown
} = {
  connectCause: null
}

vi.mock("mysql2", () => ({
  createPool: () => ({
    query: (_sql: string, cb: (cause: unknown) => void) => cb(state.connectCause),
    end: (cb: () => void) => cb(),
    getConnection: (_cb: () => void) => undefined
  })
}))

const connectFailureReason = (cause: unknown) =>
  Effect.gen(function*() {
    state.connectCause = cause
    const { MysqlClient } = yield* Effect.promise(() => import("@effect/sql-mysql2"))
    const error = yield* Effect.flip(MysqlClient.make({}))
    return error.reason
  }).pipe(
    Effect.scoped,
    Effect.provide(Reactivity.layer)
  )

const connectFailureReasonTag = (errno: number) => Effect.map(connectFailureReason({ errno }), (reason) => reason._tag)

const assertUniqueViolation = (reason: SqlError.SqlErrorReason, constraint: string) => {
  assert.strictEqual(reason._tag, "UniqueViolation")
  if (reason._tag === "UniqueViolation") {
    assert.strictEqual(reason.constraint, constraint)
  }
}

describe("MysqlClient SqlError classification", { concurrent: false }, () => {
  it.effect("maps representative errno codes to reasons", () =>
    Effect.gen(function*() {
      const cases = [
        [1040, "ConnectionError"],
        [1045, "AuthenticationError"],
        [1142, "AuthorizationError"],
        [1064, "SqlSyntaxError"],
        [1062, "UniqueViolation"],
        [1048, "ConstraintError"],
        [1213, "DeadlockError"],
        [1205, "LockTimeoutError"],
        [3024, "StatementTimeoutError"]
      ] as const

      for (const [errno, expectedTag] of cases) {
        const tag = yield* connectFailureReasonTag(errno)
        assert.strictEqual(tag, expectedTag)
      }
    }))

  it.effect("falls back to UnknownError for unmapped errno", () =>
    Effect.gen(function*() {
      const tag = yield* connectFailureReasonTag(9999)
      assert.strictEqual(tag, "UnknownError")
    }))

  it.effect("classifies duplicate-entry errno 1062 as UniqueViolation", () =>
    Effect.gen(function*() {
      const reason = yield* connectFailureReason({ errno: 1062 })
      assertUniqueViolation(reason, "unknown")
    }))

  it.effect("extracts duplicate-entry constraints from structured fields and common messages", () =>
    Effect.gen(function*() {
      const explicit = yield* connectFailureReason({
        errno: 1062,
        constraint: "  users_email_key  ",
        sqlMessage: "Duplicate entry 'user@example.com' for key 'ignored_key'"
      })
      assertUniqueViolation(explicit, "users_email_key")

      const singleQuoted = yield* connectFailureReason({
        errno: 1062,
        sqlMessage: "Duplicate entry 'user@example.com' for key 'users_email_key'"
      })
      assertUniqueViolation(singleQuoted, "users_email_key")

      const backtickQuoted = yield* connectFailureReason({
        errno: 1062,
        message: "Duplicate entry '1' for key `PRIMARY`"
      })
      assertUniqueViolation(backtickQuoted, "PRIMARY")

      const unquoted = yield* connectFailureReason({
        errno: 1062,
        sqlMessage: "Duplicate entry 'user@example.com' for key users_email_key"
      })
      assertUniqueViolation(unquoted, "users_email_key")
    }))

  it.effect("uses unknown for blank, missing, malformed, or non-string duplicate-entry metadata", () =>
    Effect.gen(function*() {
      const missing = yield* connectFailureReason({ errno: 1062 })
      assertUniqueViolation(missing, "unknown")

      const blank = yield* connectFailureReason({
        errno: 1062,
        constraint: "   ",
        sqlMessage: "Duplicate entry 'user@example.com' for key '   '"
      })
      assertUniqueViolation(blank, "unknown")

      const malformed = yield* connectFailureReason({
        errno: 1062,
        sqlMessage: "Duplicate entry 'user@example.com'"
      })
      assertUniqueViolation(malformed, "unknown")

      const nonString = yield* connectFailureReason({
        errno: 1062,
        sqlMessage: 1062,
        message: { text: "Duplicate entry 'user@example.com' for key 'users_email_key'" }
      })
      assertUniqueViolation(nonString, "unknown")
    }))

  it.effect("keeps non-unique constraint errno values classified as ConstraintError", () =>
    Effect.gen(function*() {
      const tag = yield* connectFailureReasonTag(1452)
      assert.strictEqual(tag, "ConstraintError")
    }))
})
