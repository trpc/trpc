import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import * as SqlError from "effect/sql/SqlError"

type ReasonCase = {
  readonly tag: SqlError.SqlErrorReason["_tag"]
  readonly isRetryable: boolean
  readonly make: (args: {
    readonly cause: unknown
    readonly message?: string | undefined
    readonly operation?: string | undefined
  }) => SqlError.SqlErrorReason
}

const uniqueViolationConstraint = "users_email_key"

const assertUniqueViolation = (reason: SqlError.SqlErrorReason, constraint: string) => {
  assert.strictEqual(reason._tag, "UniqueViolation")
  if (reason._tag === "UniqueViolation") {
    assert.strictEqual(reason.constraint, constraint)
  }
}

const reasonCases = [
  { tag: "ConnectionError", isRetryable: true, make: (args) => new SqlError.ConnectionError(args) },
  { tag: "AuthenticationError", isRetryable: false, make: (args) => new SqlError.AuthenticationError(args) },
  { tag: "AuthorizationError", isRetryable: false, make: (args) => new SqlError.AuthorizationError(args) },
  { tag: "SqlSyntaxError", isRetryable: false, make: (args) => new SqlError.SqlSyntaxError(args) },
  {
    tag: "UniqueViolation",
    isRetryable: false,
    make: (args) => new SqlError.UniqueViolation({ ...args, constraint: uniqueViolationConstraint })
  },
  { tag: "ConstraintError", isRetryable: false, make: (args) => new SqlError.ConstraintError(args) },
  { tag: "DeadlockError", isRetryable: true, make: (args) => new SqlError.DeadlockError(args) },
  { tag: "SerializationError", isRetryable: true, make: (args) => new SqlError.SerializationError(args) },
  { tag: "LockTimeoutError", isRetryable: true, make: (args) => new SqlError.LockTimeoutError(args) },
  { tag: "StatementTimeoutError", isRetryable: true, make: (args) => new SqlError.StatementTimeoutError(args) },
  { tag: "UnknownError", isRetryable: false, make: (args) => new SqlError.UnknownError(args) }
] as const satisfies ReadonlyArray<ReasonCase>

describe("SqlError", () => {
  it("reason classes expose expected tags and retryability", () => {
    for (const reasonCase of reasonCases) {
      const reason = reasonCase.make({
        cause: { tag: reasonCase.tag },
        message: `${reasonCase.tag} message`,
        operation: "execute"
      })

      assert.strictEqual(reason._tag, reasonCase.tag)
      assert.strictEqual(reason.isRetryable, reasonCase.isRetryable)
      assert.strictEqual(reason.message, `${reasonCase.tag} message`)
      assert.strictEqual(reason.operation, "execute")
      assert.deepStrictEqual(reason.cause, { tag: reasonCase.tag })
    }
  })

  it("delegates message, cause and retryability for every reason type", () => {
    for (const reasonCase of reasonCases) {
      const withoutMessage = reasonCase.make({
        cause: { tag: `${reasonCase.tag}-fallback` }
      })
      const withMessage = reasonCase.make({
        cause: { tag: `${reasonCase.tag}-custom` },
        message: `${reasonCase.tag} custom`,
        operation: "execute"
      })
      const withEmptyMessage = reasonCase.make({
        cause: { tag: `${reasonCase.tag}-empty` },
        message: ""
      })
      const fallbackError = new SqlError.SqlError({ reason: withoutMessage })
      const explicitMessageError = new SqlError.SqlError({ reason: withMessage })
      const emptyMessageError = new SqlError.SqlError({ reason: withEmptyMessage })

      assert.strictEqual(fallbackError.message, reasonCase.tag)
      assert.strictEqual(fallbackError.cause, withoutMessage)
      assert.strictEqual(fallbackError.isRetryable, reasonCase.isRetryable)

      assert.strictEqual(explicitMessageError.message, `${reasonCase.tag} custom`)
      assert.strictEqual(explicitMessageError.cause, withMessage)
      assert.strictEqual(explicitMessageError.isRetryable, reasonCase.isRetryable)

      assert.strictEqual(emptyMessageError.message, reasonCase.tag)
      assert.strictEqual(emptyMessageError.cause, withEmptyMessage)
      assert.strictEqual(emptyMessageError.isRetryable, reasonCase.isRetryable)
    }
  })

  it("isSqlError only matches the SqlError wrapper", () => {
    const reason = new SqlError.UnknownError({
      cause: new Error("boom")
    })
    const error = new SqlError.SqlError({ reason })
    const mismatch = new SqlError.ResultLengthMismatch({ expected: 1, actual: 0 })

    assert.strictEqual(SqlError.isSqlError(error), true)
    assert.strictEqual(SqlError.isSqlError(reason), false)
    assert.strictEqual(SqlError.isSqlError(mismatch), false)
  })

  it("isSqlErrorReason only matches reason values", () => {
    const reason = new SqlError.UnknownError({
      cause: new Error("boom")
    })
    const error = new SqlError.SqlError({ reason })

    assert.strictEqual(SqlError.isSqlErrorReason(reason), true)
    assert.strictEqual(SqlError.isSqlErrorReason(error), false)
  })

  it("constructs and recognizes UniqueViolation reasons", () => {
    const reason = new SqlError.UniqueViolation({
      cause: { code: "23505" },
      message: "duplicate key value violates unique constraint",
      operation: "insert",
      constraint: uniqueViolationConstraint
    })

    assert.strictEqual(SqlError.isSqlErrorReason(reason), true)
    assert.strictEqual(reason._tag, "UniqueViolation")
    assert.strictEqual(reason.isRetryable, false)
    assert.strictEqual(reason.constraint, uniqueViolationConstraint)
  })

  it("classifySqliteError maps sqlite unique constraint codes to UniqueViolation", () => {
    const byString = SqlError.classifySqliteError({
      code: "SQLITE_CONSTRAINT_UNIQUE",
      constraint: " " + uniqueViolationConstraint + " "
    })
    const byNumericCode = SqlError.classifySqliteError({ code: 2067, constraint: uniqueViolationConstraint })
    const byErrno = SqlError.classifySqliteError({ errno: 2067, constraint: uniqueViolationConstraint })
    const byExtendedErrno = SqlError.classifySqliteError({
      code: 19,
      errno: 2067,
      constraint: uniqueViolationConstraint
    })
    const unknown = SqlError.classifySqliteError({ code: "NOT_SQLITE" })

    assertUniqueViolation(byString, uniqueViolationConstraint)
    assertUniqueViolation(byNumericCode, uniqueViolationConstraint)
    assertUniqueViolation(byErrno, uniqueViolationConstraint)
    assertUniqueViolation(byExtendedErrno, uniqueViolationConstraint)
    assert.strictEqual(unknown._tag, "UnknownError")
  })

  it("classifySqliteError extracts sqlite unique descriptors from messages", () => {
    const reason = SqlError.classifySqliteError({
      code: "SQLITE_CONSTRAINT_UNIQUE",
      message: "UNIQUE constraint failed: users.email"
    })

    assertUniqueViolation(reason, "users.email")
  })

  it("classifySqliteError prefers explicit sqlite unique constraint identifiers", () => {
    const reason = SqlError.classifySqliteError({
      code: "SQLITE_CONSTRAINT_UNIQUE",
      constraint: " users_email_key ",
      message: "UNIQUE constraint failed: users.email"
    })

    assertUniqueViolation(reason, "users_email_key")
  })

  it("classifySqliteError falls back to unknown for blank or missing sqlite unique identifiers", () => {
    const blank = SqlError.classifySqliteError({
      code: "SQLITE_CONSTRAINT_UNIQUE",
      constraint: "   ",
      message: "UNIQUE constraint failed: users.email"
    })
    const missing = SqlError.classifySqliteError({ code: "SQLITE_CONSTRAINT_UNIQUE" })
    const nonString = SqlError.classifySqliteError({ code: "SQLITE_CONSTRAINT_UNIQUE", constraint: 123 })
    const malformedMessage = SqlError.classifySqliteError({
      code: "SQLITE_CONSTRAINT_UNIQUE",
      message: { text: "UNIQUE constraint failed: users.email" }
    })

    assertUniqueViolation(blank, "unknown")
    assertUniqueViolation(missing, "unknown")
    assertUniqueViolation(nonString, "unknown")
    assertUniqueViolation(malformedMessage, "unknown")
  })

  it("classifySqliteError keeps generic sqlite constraints as ConstraintError", () => {
    const byString = SqlError.classifySqliteError({ code: "SQLITE_CONSTRAINT" })
    const byNumericCode = SqlError.classifySqliteError({ code: 19 })
    const byErrno = SqlError.classifySqliteError({ errno: 19 })
    const primaryKeyString = SqlError.classifySqliteError({ code: "SQLITE_CONSTRAINT_PRIMARYKEY" })
    const primaryKeyNumber = SqlError.classifySqliteError({ code: 1555 })

    assert.strictEqual(byString._tag, "ConstraintError")
    assert.strictEqual(byNumericCode._tag, "ConstraintError")
    assert.strictEqual(byErrno._tag, "ConstraintError")
    assert.strictEqual(primaryKeyString._tag, "ConstraintError")
    assert.strictEqual(primaryKeyNumber._tag, "ConstraintError")
  })

  for (const reasonCase of reasonCases) {
    it.effect(`schema roundtrip for SqlError wrapping ${reasonCase.tag}`, () =>
      Effect.gen(function*() {
        const cause = { tag: reasonCase.tag }
        const error = new SqlError.SqlError({
          reason: reasonCase.make({
            cause,
            message: `${reasonCase.tag} message`,
            operation: "execute"
          })
        })

        const encoded = yield* Schema.encodeEffect(SqlError.SqlError)(error)
        const decoded = yield* Schema.decodeEffect(SqlError.SqlError)(encoded)

        assert.strictEqual(decoded._tag, "SqlError")
        assert.strictEqual(decoded.reason._tag, reasonCase.tag)
        assert.strictEqual(decoded.reason.message, `${reasonCase.tag} message`)
        assert.strictEqual(decoded.reason.operation, "execute")
        assert.deepStrictEqual(decoded.reason.cause, cause)
        assert.strictEqual(decoded.message, `${reasonCase.tag} message`)
        assert.strictEqual(decoded.isRetryable, reasonCase.isRetryable)
        assert.strictEqual(decoded.cause, decoded.reason)
        if (decoded.reason._tag === "UniqueViolation") {
          assert.strictEqual(decoded.reason.constraint, uniqueViolationConstraint)
        }
      }))
  }
})
