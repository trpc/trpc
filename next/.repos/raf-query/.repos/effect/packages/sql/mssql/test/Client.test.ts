import { MssqlClient, Procedure } from "@effect/sql-mssql"
import { assert, describe, expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber } from "effect"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as Statement from "effect/sql/Statement"
import type { EventEmitter } from "node:events"
import type * as Tedious from "tedious"
import { vi } from "vitest"

interface MockConnection extends EventEmitter {
  closed: boolean
  closedSignal: Deferred.Deferred<void>
  cancellations: number
  queries: Array<string>
  close(): void
}

const state = vi.hoisted(() => ({
  cancelCalls: 0,
  completeRequests: true,
  type: {},
  connections: [] as Array<MockConnection>,
  pendingStarted: undefined as Deferred.Deferred<void> | undefined,
  errorAfterConnect: false,
  emissionError: undefined as unknown
}))

vi.mock("tedious", async (importOriginal) => {
  const original = await importOriginal<typeof Tedious>()
  const { EventEmitter } = await import("node:events")

  class MockRequest {
    readonly listeners: Record<string, (...args: Array<any>) => void> = {}

    constructor(
      readonly sql: string,
      readonly callback: (cause: unknown, rowCount: number, rows: ReadonlyArray<any>) => void
    ) {}

    addParameter() {}
    addOutputParameter() {}
    on(event: string, listener: (...args: Array<any>) => void) {
      this.listeners[event] = listener
    }
  }

  class MockConnection extends EventEmitter {
    closed = false
    readonly closedSignal = Deferred.makeUnsafe<void>()
    pending: MockRequest | undefined
    cancellations = 0
    readonly queries: Array<string> = []

    constructor() {
      super()
      state.connections.push(this)
    }

    connect(callback: (cause: unknown) => void) {
      // Resume acquisition, then emit in the same driver turn, before a forked
      // pool listener can run. Do not install a test-only error listener.
      Fiber.getCurrent()!.currentDispatcher.scheduleTask(() => {
        callback(null)
        if (state.errorAfterConnect) {
          state.errorAfterConnect = false
          this.closed = true
          try {
            this.emit("error", new Error("Connection lost - read ETIMEDOUT"))
          } catch (error) {
            state.emissionError = error
          }
        }
      }, 0)
    }

    close() {
      if (!this.closed) {
        this.closed = true
        this.emit("end")
      }
      Effect.runSync(Deferred.succeed(this.closedSignal, undefined))
    }

    cancel() {
      // MssqlClient also calls cancel before each request. Count only an actual
      // in-flight cancellation, so that cannot satisfy the interruption assertion.
      state.cancelCalls++
      if (this.pending) {
        this.cancellations++
        this.pending = undefined
      }
    }

    execSql(request: MockRequest) {
      this.queries.push(request.sql)
      if (this.closed) {
        request.callback(new Error("Requests can only be made in the LoggedIn state, not the Final state"), 0, [])
      } else if (request.sql === "SELECT pending" || !state.completeRequests) {
        this.pending = request
        if (state.pendingStarted) {
          Effect.runSync(Deferred.succeed(state.pendingStarted, undefined))
        }
      } else {
        request.callback(null, 1, [[{ metadata: { colName: "value" }, value: 42 }]])
      }
    }
    callProcedure(request: MockRequest) {
      request.listeners.returnValue("answer", 42)
      request.callback(null, 0, [])
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
  }

  return {
    ...original,
    Connection: MockConnection,
    Request: MockRequest
  }
})

const sql = Statement.make(Effect.void as any, MssqlClient.makeCompiler(), [], undefined)

describe("mssql", () => {
  it("preserves fractional JavaScript numbers with the default parameter mapping", () => {
    const value = MssqlClient.defaultParameterTypes.number.validate(1.5, undefined)

    expect(value).toBe(1.5)
  })

  it("preserves Unicode JavaScript strings with the default parameter mapping", () => {
    const value = MssqlClient.defaultParameterTypes.string.validate("lambda: \u03bb", undefined)

    expect(value).toBe("lambda: \u03bb")
  })

  it("insert helper", () => {
    const [query, params] = sql`INSERT INTO ${sql("people")} ${sql.insert({ name: "Tim", age: 10 })}`.compile()
    expect(query).toEqual(
      `INSERT INTO [people] ([name],[age]) VALUES (@1,@2)`
    )
    expect(params).toEqual(["Tim", 10])
  })

  it("insert helper returning", () => {
    const [query, params] = sql`INSERT INTO ${sql("people")} ${sql.insert({ name: "Tim", age: 10 }).returning("*")}`
      .compile()
    expect(query).toEqual(
      `INSERT INTO [people] ([name],[age]) OUTPUT INSERTED.* VALUES (@1,@2)`
    )
    expect(params).toEqual(["Tim", 10])
  })

  it("update helper", () => {
    const [query, params] = sql`UPDATE people SET name = data.name ${
      sql.updateValues(
        [{ name: "Tim" }, { name: "John" }],
        "data"
      )
    }`.compile()
    expect(query).toEqual(
      `UPDATE people SET name = data.name FROM (values (@1),(@2)) AS data([name])`
    )
    expect(params).toEqual(["Tim", "John"])
  })

  it("update helper returning", () => {
    const [query, params] = sql`UPDATE people SET name = data.name ${
      sql.updateValues(
        [{ name: "Tim" }, { name: "John" }],
        "data"
      ).returning("*")
    }`.compile()
    expect(query).toEqual(
      `UPDATE people SET name = data.name OUTPUT INSERTED.* FROM (values (@1),(@2)) AS data([name])`
    )
    expect(params).toEqual(["Tim", "John"])
  })

  it("update single helper returning", () => {
    const [query, params] = sql`UPDATE people SET ${sql.update({ name: "Tim" }).returning("*")}`
      .compile()
    expect(query).toEqual(
      `UPDATE people SET [name] = @1 OUTPUT INSERTED.*`
    )
    expect(params).toEqual(["Tim"])
  })

  for (
    const [name, returning] of [
      ["Identifier", sql("INSERTED.name")],
      ["wrapped Identifier", sql`${sql("INSERTED.name")}`]
    ] as const
  ) {
    it(`insert helper returning ${name}`, () => {
      const result = sql`INSERT INTO ${sql("people")} ${sql.insert({ name: "Rowan", age: 10 }).returning(returning)}`
        .compile()

      assert.deepStrictEqual(result, [
        `INSERT INTO [people] ([name],[age]) OUTPUT [INSERTED].[name] VALUES (@1,@2)`,
        ["Rowan", 10]
      ])
    })

    it(`update helper returning ${name}`, () => {
      const result = sql`UPDATE people SET ${sql.update({ name: "Rowan" }).returning(returning)}`.compile()

      assert.deepStrictEqual(result, [
        `UPDATE people SET [name] = @1 OUTPUT [INSERTED].[name]`,
        ["Rowan"]
      ])
    })

    it(`updateValues helper returning ${name}`, () => {
      const result = sql`UPDATE people SET name = data.name ${
        sql.updateValues([{ name: "Rowan" }, { name: "Mira" }], "data").returning(returning)
      }`.compile()

      assert.deepStrictEqual(result, [
        `UPDATE people SET name = data.name OUTPUT [INSERTED].[name] FROM (values (@1),(@2)) AS data([name])`,
        ["Rowan", "Mira"]
      ])
    })
  }

  it("array helper", () => {
    const [query, params] = sql`SELECT * FROM ${sql("people")} WHERE id IN ${sql.in([1, 2, "string"])}`.compile()
    expect(query).toEqual(`SELECT * FROM [people] WHERE id IN (@1,@2,@3)`)
    expect(params).toEqual([1, 2, "string"])
  })

  // it("param types", () => {
  //   const [query, params] = sql`SELECT * FROM ${sql("people")} WHERE id = ${
  //     sql.param(
  //       MssqlTypes.BigInt,
  //       1
  //     )
  //   }`.compile()
  //   expect(query).toEqual(`SELECT * FROM [people] WHERE id = @1`)
  //   expect(isCustom("MssqlParam")(params[0])).toEqual(true)
  //   const param = params[0] as unknown as Custom<
  //     "MsSqlParam",
  //     any,
  //     any,
  //     any
  //   >
  //   expect(param.i0).toEqual(MssqlTypes.BigInt)
  //   expect(param.i1).toEqual(1)
  //   expect(param.i2).toEqual({})
  // })

  it("escape [", () => {
    const [query] = sql`SELECT * FROM ${sql("peo[]ple.te[st]ing")}`.compile()
    expect(query).toEqual(`SELECT * FROM [peo[]]ple].[te[st]]ing]`)
  })

  it.effect("returns stored procedure output parameters under output", () =>
    Effect.gen(function*() {
      const client = yield* MssqlClient.make({ server: "localhost" })
      const definition = Procedure.outputParam<number>()("answer", state.type as any)(Procedure.make("get_answer"))
      const result = yield* client.call(Procedure.compile(definition)({}))

      assert.deepStrictEqual(result, { output: { answer: 42 }, rows: [] })
    }).pipe(
      Effect.scoped,
      Effect.provide(Reactivity.layer)
    ))

  it.effect("cancels an in-flight Tedious request when interrupted", () =>
    Effect.gen(function*() {
      state.cancelCalls = 0
      state.completeRequests = true
      const client = yield* MssqlClient.make({ server: "localhost" })
      state.completeRequests = false
      const fiber = yield* Effect.forkChild(client`WAITFOR DELAY '00:01:00'`)
      yield* Effect.yieldNow
      const callsBeforeInterrupt = state.cancelCalls
      yield* Fiber.interrupt(fiber)

      assert.strictEqual(state.cancelCalls, callsBeforeInterrupt + 1)
    }).pipe(
      Effect.scoped,
      Effect.provide(Reactivity.layer)
    ))
})

const reset = () => {
  state.cancelCalls = 0
  state.completeRequests = true
  state.connections = []
  state.pendingStarted = Deferred.makeUnsafe<void>()
  state.errorAfterConnect = false
  state.emissionError = undefined
}

const makeClient = MssqlClient.make({
  server: "localhost",
  minConnections: 0,
  maxConnections: 1,
  connectionTTL: "1 hour"
})

const bounded = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.timeout("2 seconds"))

describe("MssqlClient connection lifecycle", { concurrent: false }, () => {
  it.live("replaces a connection that ends without error after query cancellation", () =>
    Effect.gen(function*() {
      reset()
      const client = yield* bounded(makeClient)
      const connection = state.connections[0]
      const query = yield* Effect.forkScoped(client.unsafe("SELECT pending"))
      yield* bounded(Deferred.await(state.pendingStarted!))
      yield* bounded(Fiber.interrupt(query))
      assert.strictEqual(connection.cancellations, 1)

      // Model tedious' cancel timeout: Final state and end, with no error event.
      connection.close()
      yield* Effect.yieldNow
      const rows = yield* bounded(client.unsafe("SELECT recovered"))
      assert.deepStrictEqual(rows, [{ value: 42 }])
      assert.strictEqual(state.connections.length, 2)
      assert.isFalse(connection.queries.includes("SELECT recovered"))
      assert.isTrue(state.connections[1].queries.includes("SELECT recovered"))
    }).pipe(Effect.scoped, Effect.provide(Reactivity.layer)))

  it.live("handles an error immediately after the connect callback and does not reuse the failed connection", () =>
    Effect.gen(function*() {
      reset()
      const client = yield* bounded(makeClient)
      const original = state.connections[0]
      yield* Effect.yieldNow

      // Retire the healthy connection through a normal driver error, then
      // inject the callback race on the next acquisition of this same pool.
      state.errorAfterConnect = true
      original.emit("error", new Error("Connection lost"))
      yield* bounded(Deferred.await(original.closedSignal))
      yield* bounded(Effect.result(client.unsafe("SELECT during_race")))
      assert.isUndefined(state.emissionError, "the driver's error emission must not throw")

      const failed = state.connections[1]
      assert.isTrue(failed.closed)
      const rows = yield* bounded(client.unsafe("SELECT recovered"))
      assert.deepStrictEqual(rows, [{ value: 42 }])
      assert.isFalse(failed.queries.includes("SELECT recovered"))
      assert.isTrue(state.connections.slice(2).some((connection) => connection.queries.includes("SELECT recovered")))
    }).pipe(Effect.scoped, Effect.provide(Reactivity.layer)))
})
