import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import * as Reactivity from "effect/reactivity/Reactivity"
import { SqlError } from "effect/sql/SqlError"
import { vi } from "vitest"

const state: {
  connectCause: unknown
  queryCause: unknown
  resultJsonCause: unknown
} = {
  connectCause: null,
  queryCause: null,
  resultJsonCause: null
}

vi.mock("@clickhouse/client", () => ({
  createClient: () => ({
    ping: () =>
      state.connectCause
        ? Promise.resolve({ success: false, error: state.connectCause })
        : Promise.resolve({ success: true }),
    close: () => Promise.resolve(),
    query: () =>
      state.queryCause
        ? Promise.reject(state.queryCause)
        : Promise.resolve({
          json: () => state.resultJsonCause ? Promise.reject(state.resultJsonCause) : Promise.resolve({ data: [] })
        }),
    command: () => Promise.resolve({}),
    insert: () => Promise.resolve({})
  })
}))

const connectFailureReasonTag = (code: number) =>
  Effect.gen(function*() {
    state.connectCause = { code }
    state.queryCause = null
    state.resultJsonCause = null
    const { ClickhouseClient } = yield* Effect.promise(() => import("@effect/sql-clickhouse"))
    const error = yield* Effect.flip(ClickhouseClient.make({ url: "http://localhost:8123" }))
    return error.reason._tag
  }).pipe(
    Effect.scoped,
    Effect.provide(Reactivity.layer)
  )

const queryFailureReasonTag = (code: number) =>
  Effect.gen(function*() {
    state.connectCause = null
    state.queryCause = { code }
    state.resultJsonCause = null
    const { ClickhouseClient } = yield* Effect.promise(() => import("@effect/sql-clickhouse"))
    const client = yield* ClickhouseClient.make({ url: "http://localhost:8123" })
    const error = yield* Effect.flip(client`SELECT 1`)
    return error.reason._tag
  }).pipe(
    Effect.scoped,
    Effect.provide(Reactivity.layer)
  )

describe("ClickhouseClient SqlError classification", { concurrent: false }, () => {
  it.effect("maps representative native codes to reasons", () =>
    Effect.gen(function*() {
      const cases = [
        [516, "AuthenticationError"],
        [497, "AuthorizationError"],
        [62, "SqlSyntaxError"],
        [159, "StatementTimeoutError"]
      ] as const

      for (const [code, expectedTag] of cases) {
        const tag = yield* connectFailureReasonTag(code)
        assert.strictEqual(tag, expectedTag)
      }
    }))

  it.effect("falls back to UnknownError for unmapped codes during execution", () =>
    Effect.gen(function*() {
      const tag = yield* queryFailureReasonTag(999)
      assert.strictEqual(tag, "UnknownError")
    }))

  it.effect("maps result decoding failures to SqlError", () =>
    Effect.gen(function*() {
      state.connectCause = null
      state.queryCause = null
      state.resultJsonCause = new SyntaxError("invalid JSON response")
      const { ClickhouseClient } = yield* Effect.promise(() => import("@effect/sql-clickhouse"))
      const client = yield* ClickhouseClient.make({ url: "http://localhost:8123" })
      const error = yield* Effect.flip(client`SELECT 1`)

      assert(error instanceof SqlError)
      assert.strictEqual(error.reason._tag, "UnknownError")
      assert.strictEqual(error.reason.cause, state.resultJsonCause)
    }).pipe(
      Effect.scoped,
      Effect.provide(Reactivity.layer)
    ))
})
