import { assert, describe, it } from "@effect/vitest"
import { Deferred, Effect, Exit, Fiber, Option } from "effect"
import { Reactivity } from "effect/reactivity"
import { TestClock } from "effect/testing"
import { vi } from "vitest"

const state = vi.hoisted(() => ({ vfsCloseCalls: 0 }))

vi.mock("@effect/wa-sqlite/dist/wa-sqlite.mjs", () => ({ default: async () => ({}) }))
vi.mock("@effect/wa-sqlite/src/examples/AccessHandlePoolVFS.js", () => ({
  AccessHandlePoolVFS: {
    create: async () => ({
      close: async () => {
        state.vfsCloseCalls++
      }
    })
  }
}))
vi.mock("@effect/wa-sqlite", () => ({
  SQLITE_ROW: 100,
  Factory: () => ({
    bind_collection() {},
    close() {},
    column_names: (statement: { readonly columns: ReadonlyArray<string> }) => statement.columns,
    open_v2: () => 1,
    row: (statement: { readonly index: number; readonly rows: ReadonlyArray<ReadonlyArray<number>> }) =>
      statement.rows[statement.index],
    *statements(_db: number, sql: string) {
      if (sql !== "SELECT 1 AS first; SELECT 2 AS second, 3 AS third") {
        throw new Error(`Unexpected SQL: ${sql}`)
      }
      yield { columns: ["first"], index: -1, rows: [[1]] }
      yield { columns: ["second", "third"], index: -1, rows: [[2, 3]] }
    },
    step(statement: { index: number; readonly rows: ReadonlyArray<ReadonlyArray<number>> }) {
      return ++statement.index < statement.rows.length ? 100 : 101
    },
    vfs_register() {}
  })
}))

import { OpfsWorker, SqliteClient } from "@effect/sql-sqlite-wasm"

class FakePort extends EventTarget {
  close() {}

  postMessage(message: ReadonlyArray<unknown>): void {
    if (message[0] === "ready") {
      queueMicrotask(() => this.dispatchEvent(new MessageEvent("message", { data: ["close"] })))
    }
  }
}

class FakeWorker extends EventTarget {
  onerror: unknown = null

  constructor(readonly queryPosted: Deferred.Deferred<void>) {
    super()
  }

  override addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: unknown
  ): void {
    super.addEventListener(type, listener, options as boolean)
    if (type === "message") {
      queueMicrotask(() => this.dispatchEvent(new MessageEvent("message", { data: ["ready"] })))
    }
  }

  postMessage(message: ReadonlyArray<unknown>): void {
    if (typeof message[0] === "number") {
      Effect.runFork(Deferred.succeed(this.queryPosted, undefined))
    }
  }
}

// A MessagePort only delivers queued messages once `start()` is called.
class GatedPort extends EventTarget {
  private queued: Array<ReadonlyArray<unknown>> = []
  private started = false

  start(): void {
    this.started = true
    for (const data of this.queued.splice(0)) {
      this.dispatchEvent(new MessageEvent("message", { data }))
    }
  }

  deliver(data: ReadonlyArray<unknown>): void {
    if (this.started) this.dispatchEvent(new MessageEvent("message", { data }))
    else this.queued.push(data)
  }

  postMessage(): void {}
  close(): void {}
}

const settled = <A, E>(effect: Effect.Effect<A, E>) =>
  Effect.gen(function*() {
    const fiber = yield* effect.pipe(Effect.exit, Effect.timeoutOption("100 millis"), Effect.forkChild)
    yield* TestClock.adjust("100 millis")
    return yield* Fiber.join(fiber)
  })

describe("Client", () => {
  it.effect("should work", () => Effect.void)

  it.effect("closes the OPFS VFS when the worker loop closes", () =>
    Effect.gen(function*() {
      yield* OpfsWorker.run({ port: new FakePort(), dbName: "test.db" })
      assert.strictEqual(state.vfsCloseCalls, 1)
    }))

  it.effect("keeps columns scoped to each statement", () =>
    Effect.gen(function*() {
      const channel = new MessageChannel()
      yield* Effect.addFinalizer(() => Effect.sync(() => channel.port2.close()))
      yield* Effect.forkChild(OpfsWorker.run({ port: channel.port1, dbName: "test.db" }))
      const sql = yield* SqliteClient.make({ worker: Effect.succeed(channel.port2) })

      const rows = yield* sql`SELECT 1 AS first; SELECT 2 AS second, 3 AS third`

      assert.deepStrictEqual(rows, [{ first: 1 }, { second: 2, third: 3 }])
    }).pipe(Effect.provide(Reactivity.layer)))

  it.effect("settles an in-flight query when the worker errors and reconnects", () =>
    Effect.gen(function*() {
      const queryPosted = yield* Deferred.make<void>()
      const worker = new FakeWorker(queryPosted)
      const sql = yield* SqliteClient.make({ worker: Effect.succeed(worker as unknown as Worker) })
      const fiber = yield* Effect.forkChild(sql`SELECT 1`)

      yield* Deferred.await(queryPosted)
      worker.dispatchEvent(new Event("error"))

      const joinFiber = yield* Fiber.join(fiber).pipe(Effect.exit, Effect.timeoutOption("100 millis"), Effect.forkChild)
      yield* TestClock.adjust("100 millis")
      const result = yield* Fiber.join(joinFiber)
      assert(Option.isSome(result), "the request remained pending after worker replacement")
      assert(Exit.isFailure(result.value))
    }).pipe(Effect.provide(Reactivity.layer)))

  it.effect("starts a MessagePort transport so the ready message arrives", () =>
    Effect.gen(function*() {
      const port = new GatedPort()
      port.deliver(["ready", undefined, undefined])
      const fiber = yield* Effect.forkChild(SqliteClient.make({ worker: Effect.succeed(port as unknown as Worker) }))
      const result = yield* settled(Fiber.join(fiber))
      assert(Option.isSome(result), "the ready message was never delivered")
      assert(Exit.isSuccess(result.value))
    }).pipe(Effect.provide(Reactivity.layer)))

  it.effect("starts a MessagePort port so worker requests are consumed", () =>
    Effect.gen(function*() {
      const port = new GatedPort()
      port.deliver(["close"])
      const fiber = yield* Effect.forkChild(OpfsWorker.run({ port, dbName: "test.db" }))
      const result = yield* settled(Fiber.join(fiber))
      assert(Option.isSome(result), "the queued request was never consumed")
      assert(Exit.isSuccess(result.value))
    }))
})
