import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import * as Reactivity from "effect/reactivity/Reactivity"
import type * as SqlError from "effect/sql/SqlError"
import { vi } from "vitest"

const state: {
  connectCause: unknown
  requestCauses: Array<unknown>
} = {
  connectCause: null,
  requestCauses: []
}

class MockRequest {
  callback: (cause: unknown, rowCount: number, rows: ReadonlyArray<any>) => void

  constructor(
    _sql: string,
    callback: (cause: unknown, rowCount: number, rows: ReadonlyArray<any>) => void
  ) {
    this.callback = callback
  }

  addParameter() {
    return
  }

  addOutputParameter() {
    return
  }

  on() {
    return
  }
}

class MockConnection {
  connect(callback: (cause: unknown) => void) {
    callback(state.connectCause)
  }

  close() {
    return
  }

  on() {
    return
  }

  beginTransaction(callback: (cause: unknown) => void) {
    callback(null)
  }

  commitTransaction(callback: (cause: unknown) => void) {
    callback(null)
  }

  saveTransaction(callback: (cause: unknown) => void) {
    callback(null)
  }

  rollbackTransaction(callback: (cause: unknown) => void) {
    callback(null)
  }

  cancel() {
    return
  }

  execSql(request: MockRequest) {
    const cause = state.requestCauses.length > 0 ? state.requestCauses.shift() : null
    request.callback(cause, 0, [])
  }

  callProcedure(request: MockRequest) {
    this.execSql(request)
  }
}

vi.mock("tedious", () => ({
  Connection: MockConnection,
  Request: MockRequest,
  TYPES: {
    VarChar: {},
    Int: {},
    BigInt: {},
    Bit: {},
    DateTime: {},
    VarBinary: {}
  }
}))

const queryFailureReason = (cause: unknown) =>
  Effect.gen(function*() {
    state.connectCause = null
    state.requestCauses = [null, cause]
    const { MssqlClient } = yield* Effect.promise(() => import("@effect/sql-mssql"))
    const client = yield* MssqlClient.make({ server: "localhost" })
    const error = yield* Effect.flip(client`SELECT 1`)
    return error.reason
  }).pipe(
    Effect.scoped,
    Effect.provide(Reactivity.layer)
  )

const queryFailureReasonTag = (number: number) => Effect.map(queryFailureReason({ number }), (reason) => reason._tag)

const assertUniqueViolation = (reason: SqlError.SqlErrorReason, constraint: string) => {
  assert.strictEqual(reason._tag, "UniqueViolation")
  if (reason._tag === "UniqueViolation") {
    assert.strictEqual(reason.constraint, constraint)
  }
}

describe("MssqlClient SqlError classification", { concurrent: false }, () => {
  it.effect("maps representative error numbers to reasons", () =>
    Effect.gen(function*() {
      const cases = [
        [233, "ConnectionError"],
        [18456, "AuthenticationError"],
        [229, "AuthorizationError"],
        [102, "SqlSyntaxError"],
        [2601, "UniqueViolation"],
        [2627, "UniqueViolation"],
        [547, "ConstraintError"],
        [1205, "DeadlockError"],
        [3960, "SerializationError"],
        [1222, "LockTimeoutError"]
      ] as const

      for (const [number, expectedTag] of cases) {
        const tag = yield* queryFailureReasonTag(number)
        assert.strictEqual(tag, expectedTag)
      }
    }))

  it.effect("falls back to UnknownError for unmapped error numbers", () =>
    Effect.gen(function*() {
      const tag = yield* queryFailureReasonTag(99999)
      assert.strictEqual(tag, "UnknownError")
    }))

  it.effect("classifies duplicate-key number 2601 as UniqueViolation and extracts the unique index", () =>
    Effect.gen(function*() {
      const reason = yield* queryFailureReason({
        number: 2601,
        message:
          "Cannot insert duplicate key row in object 'dbo.Users' with unique index 'IX_Users_Email'. The duplicate key value is (user@example.com)."
      })
      assertUniqueViolation(reason, "IX_Users_Email")
    }))

  it.effect("classifies constraint number 2627 as UniqueViolation and extracts the constraint", () =>
    Effect.gen(function*() {
      const reason = yield* queryFailureReason({
        number: 2627,
        message:
          "Violation of UNIQUE KEY constraint 'UQ_Users_Email'. Cannot insert duplicate key in object 'dbo.Users'. The duplicate key value is (user@example.com)."
      })
      assertUniqueViolation(reason, "UQ_Users_Email")
    }))

  it.effect("prefers structured constraints and trims whitespace", () =>
    Effect.gen(function*() {
      const reason = yield* queryFailureReason({
        number: 2601,
        constraint: "  IX_Structured_Email  ",
        message:
          "Cannot insert duplicate key row in object 'dbo.Users' with unique index 'IX_Users_Email'. The duplicate key value is (user@example.com)."
      })
      assertUniqueViolation(reason, "IX_Structured_Email")
    }))

  it.effect("uses unknown for blank, missing, malformed, or non-string unique violation metadata", () =>
    Effect.gen(function*() {
      const missing = yield* queryFailureReason({ number: 2601 })
      assertUniqueViolation(missing, "unknown")

      const blank = yield* queryFailureReason({
        number: 2627,
        constraint: "   ",
        message: "Violation of UNIQUE KEY constraint '   '. Cannot insert duplicate key in object 'dbo.Users'."
      })
      assertUniqueViolation(blank, "unknown")

      const malformed = yield* queryFailureReason({
        number: 2601,
        message: "Cannot insert duplicate key row in object 'dbo.Users'."
      })
      assertUniqueViolation(malformed, "unknown")

      const nonString = yield* queryFailureReason({
        number: 2627,
        constraint: 2627,
        message: { text: "Violation of UNIQUE KEY constraint 'UQ_Users_Email'." }
      })
      assertUniqueViolation(nonString, "unknown")
    }))

  it.effect("keeps non-unique constraint number 547 classified as ConstraintError", () =>
    Effect.gen(function*() {
      const tag = yield* queryFailureReasonTag(547)
      assert.strictEqual(tag, "ConstraintError")
    }))
})
