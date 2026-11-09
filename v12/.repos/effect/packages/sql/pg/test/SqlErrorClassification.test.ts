import { classifySqlState } from "@effect/sql-pg/internal/sqlError"
import { assert, describe, it } from "@effect/vitest"
import type * as SqlError from "effect/sql/SqlError"

const queryFailureReason = (cause: unknown) => {
  const code = typeof cause === "object" && cause !== null && "code" in cause && typeof cause.code === "string"
    ? cause.code
    : undefined
  const constraint = typeof cause === "object" && cause !== null && "constraint" in cause
    ? cause.constraint
    : undefined
  return classifySqlState(code, constraint, {
    cause,
    message: "Failed to execute statement",
    operation: "query"
  })
}

const assertUniqueViolation = (reason: SqlError.SqlErrorReason, constraint: string) => {
  assert.strictEqual(reason._tag, "UniqueViolation")
  if (reason._tag === "UniqueViolation") {
    assert.strictEqual(reason.constraint, constraint)
  }
}

describe("PostgreSQL SQLSTATE classification", () => {
  it("checks 42501 before generic 42*", () => {
    assert.strictEqual(queryFailureReason({ code: "42501" })._tag, "AuthorizationError")
    assert.strictEqual(queryFailureReason({ code: "42P01" })._tag, "SqlSyntaxError")
  })

  it("falls back to UnknownError for unmapped SQLSTATE", () => {
    assert.strictEqual(queryFailureReason({ code: "ZZZZZ" })._tag, "UnknownError")
  })

  it("classifies 23505 as UniqueViolation and trims the constraint name", () => {
    assertUniqueViolation(queryFailureReason({ code: "23505", constraint: "  users_email_key  " }), "users_email_key")
  })

  it("uses unknown for missing, non-string, or blank unique violation constraints", () => {
    assertUniqueViolation(queryFailureReason({ code: "23505" }), "unknown")
    assertUniqueViolation(queryFailureReason({ code: "23505", constraint: 123 }), "unknown")
    assertUniqueViolation(queryFailureReason({ code: "23505", constraint: "   " }), "unknown")
  })

  it("keeps non-unique integrity constraints classified as ConstraintError", () => {
    assert.strictEqual(
      queryFailureReason({ code: "23503", constraint: "orders_user_id_fkey" })._tag,
      "ConstraintError"
    )
  })
})
