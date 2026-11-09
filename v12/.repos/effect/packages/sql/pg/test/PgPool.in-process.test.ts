import { PgClient, PgPool } from "@effect/sql-pg"
import { assert, describe, it } from "@effect/vitest"
import { Cause, Effect, Fiber, Latch, Option, Queue, References, Tracer } from "effect"
import type * as Duration from "effect/Duration"
import * as Reactivity from "effect/reactivity/Reactivity"
import type * as Scope from "effect/Scope"
import type { SqlError } from "effect/sql/SqlError"
import * as Statement from "effect/sql/Statement"
import * as TestClock from "effect/testing/TestClock"
import { Duplex } from "node:stream"

const backendMessage = (tag: string, payload: Buffer): Buffer => {
  const length = Buffer.allocUnsafe(4)
  length.writeInt32BE(payload.length + 4)
  return Buffer.concat([Buffer.from(tag), length, payload])
}

const ready = Buffer.concat([
  backendMessage("R", Buffer.alloc(4)),
  backendMessage("K", Buffer.alloc(8)),
  backendMessage("Z", Buffer.from("I"))
])

const emptyQueryResult = Buffer.concat([
  backendMessage("1", Buffer.alloc(0)),
  backendMessage("2", Buffer.alloc(0)),
  backendMessage("n", Buffer.alloc(0)),
  backendMessage("C", Buffer.from("SELECT 0\0")),
  backendMessage("Z", Buffer.from("I"))
])

const waitFor = (predicate: () => boolean) =>
  Effect.promise(async () => {
    for (let i = 0; i < 100 && !predicate(); i++) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    assert.ok(predicate(), "background acquisition did not start")
  })

describe("PgPool failed startup", () => {
  it.live(
    "retries a stale background acquisition rather than failing an unrelated checkout",
    () =>
      Effect.scoped(Effect.gen(function*() {
        let attempts = 0
        let backgroundStarted = false
        const pool = yield* PgPool.make({
          username: "test",
          connectTimeout: "250 millis",
          minConnections: 2,
          maxConnections: 2,
          stream: () => {
            attempts++
            const attempt = attempts
            let startup = true
            const socket = new Duplex({
              read() {},
              write(_chunk: Buffer, _encoding, callback) {
                if (startup) {
                  startup = false
                  if (attempt === 2) backgroundStarted = true
                  else queueMicrotask(() => socket.push(ready))
                }
                callback()
              }
            })
            return socket
          }
        })

        // Keep the healthy session leased so the failure becomes a placeholder.
        const healthy = yield* pool.get
        yield* waitFor(() => backgroundStarted)
        yield* Effect.promise(() => new Promise((resolve) => setTimeout(resolve, 400)))

        const replacement = yield* pool.get
        assert.notStrictEqual(replacement, healthy)
        assert.strictEqual(attempts, 3)
      })),
    10_000
  )

  it.live(
    "reports a caller-owned connect failure instead of retrying indefinitely",
    () =>
      Effect.scoped(Effect.gen(function*() {
        let attempts = 0
        const pool = yield* PgPool.make({
          username: "test",
          maxConnections: 1,
          stream: () => {
            attempts++
            const socket = new Duplex({ read() {}, write() {} })
            queueMicrotask(() => socket.destroy())
            return socket
          }
        })
        const result = yield* Effect.result(pool.get)
        assert.strictEqual(result._tag, "Failure")
        if (result._tag === "Failure") {
          assert.strictEqual(result.failure.reason._tag, "ConnectionError")
          assert.strictEqual(result.failure.reason.operation, "connect")
        }
        assert.strictEqual(attempts, 1)
      })),
    10_000
  )
})

describe("PgPool acquireTimeout", () => {
  // The timeouts run on the TestClock, so opening the first connection on a
  // busy machine cannot use up the acquireTimeout before the pool is exhausted.
  it.effect("fails a checkout that waits on an exhausted pool past acquireTimeout", () =>
    Effect.gen(function*() {
      const sql = yield* PgClient.make({
        username: "test",
        maxConnections: 1,
        acquireTimeout: "100 millis",
        stream: () => {
          const socket = new Duplex({
            read() {},
            write(_chunk: Buffer, _encoding, callback) {
              queueMicrotask(() => socket.push(ready))
              callback()
            }
          })
          return socket
        }
      })
      yield* sql.reserve

      const statement = yield* Effect.forkChild(Effect.flip(sql`SELECT 1`))
      const transaction = yield* Effect.forkChild(Effect.flip(sql.withTransaction(sql`SELECT 1`)))
      yield* TestClock.adjust("100 millis")
      for (const error of [yield* Fiber.join(statement), yield* Fiber.join(transaction)]) {
        assert.strictEqual(error.reason._tag, "ConnectionError")
        assert.strictEqual(error.reason.operation, "acquireConnection")
      }
    }).pipe(
      Effect.scoped,
      Effect.provide(Reactivity.layer)
    ), 10_000)

  it.effect(
    "fails a multiplexed reservation that waits on a busy pipeline past acquireTimeout",
    () =>
      Effect.gen(function*() {
        let socket!: Duplex
        let writes = 0
        const statementSent = Latch.makeUnsafe()
        const sql = yield* PgClient.make({
          username: "test",
          maxConnections: 1,
          multiplex: true,
          acquireTimeout: "100 millis",
          stream: () => {
            socket = new Duplex({
              read() {},
              write(_chunk: Buffer, _encoding, callback) {
                if (++writes === 1) queueMicrotask(() => socket.push(ready))
                else statementSent.openUnsafe()
                callback()
              }
            })
            return socket
          }
        })
        // The shared statement stays on the wire until the backend answers it.
        const busy = yield* Effect.forkChild(sql`SELECT 1`)
        yield* statementSent.await

        // The failed reservation shares the test scope, which stays open.
        const reservation = yield* Effect.forkChild(Effect.flip(sql.reserve))
        yield* TestClock.adjust("100 millis")
        const error = yield* Fiber.join(reservation)
        assert.strictEqual(error.reason._tag, "ConnectionError")
        assert.strictEqual(error.reason.operation, "acquireConnection")

        socket.push(emptyQueryResult)
        yield* Fiber.join(busy)
        yield* Effect.scoped(sql.reserve)
      }).pipe(
        Effect.scoped,
        Effect.provide(Reactivity.layer)
      ),
    10_000
  )
})

describe("PgPool connection spans", () => {
  // A server that holds each connection's startup until the test answers it, so
  // the test decides when a connect finishes and the TestClock decides how long
  // it took.
  const heldServer = Effect.map(Queue.unbounded<Effect.Effect<void>>(), (startups) => ({
    startups,
    stream: () => {
      let startup = true
      const socket = new Duplex({
        read() {},
        write(_chunk: Buffer, _encoding, callback) {
          if (startup) {
            startup = false
            Queue.offerUnsafe(startups, Effect.sync(() => socket.push(ready)))
          }
          callback()
        }
      })
      return socket
    }
  }))

  const recording = () => {
    const spans: Array<Tracer.NativeSpan> = []
    const tracer = Tracer.make({
      span(options) {
        const span = new Tracer.NativeSpan(options)
        spans.push(span)
        return span
      }
    })
    return { tracer, named: (name: string) => spans.filter((span) => span.name === name) }
  }

  const traced = <A, E, R>(effect: Effect.Effect<A, E, R>, tracer: Tracer.Tracer, propagate: boolean) =>
    effect.pipe(Effect.withTracer(tracer), Effect.provideService(Statement.SpanPropagationEnabled, propagate))

  // Runs a statement whose checkout opens the pool's first session, answers the
  // connect after 40 ms, then runs a second statement on the same session.
  const firstCheckout = (
    checkout: (pool: PgPool.PgPool) => Effect.Effect<unknown, SqlError, Scope.Scope>,
    options: {
      readonly acquireTimeout?: Duration.Input | undefined
      readonly propagate?: boolean
      readonly timing?: boolean
    } = {}
  ) => {
    const { named, tracer } = recording()
    return Effect.scoped(Effect.gen(function*() {
      const server = yield* heldServer
      const pool = yield* PgPool.make({
        username: "test",
        maxConnections: 1,
        acquireTimeout: options.acquireTimeout,
        stream: server.stream
      })
      const first = yield* Effect.forkChild(Effect.scoped(checkout(pool)).pipe(Effect.withSpan("first statement")))
      const answer = yield* Queue.take(server.startups)
      yield* TestClock.adjust("40 millis")
      yield* answer
      yield* Fiber.join(first)
      yield* Effect.scoped(pool.get).pipe(Effect.withSpan("second statement"))
      return { connects: named("db.connect"), first: named("first statement")[0] }
    })).pipe(
      Effect.provideService(References.TracerTimingEnabled, options.timing ?? true),
      (effect) => traced(effect, tracer, options.propagate ?? true)
    )
  }

  it.effect("reports the connect a statement waited for under its span, only with propagation and timing", () =>
    Effect.gen(function*() {
      const use = (pool: PgPool.PgPool) => pool.use(() => Effect.void)
      for (
        const [checkout, acquireTimeout] of [
          [use, undefined],
          [use, "1 second"],
          [(pool: PgPool.PgPool) => pool.reserve, undefined]
        ] as const
      ) {
        const { connects, first } = yield* firstCheckout(checkout, { acquireTimeout })
        assert.strictEqual(connects.length, 1)
        const [connect] = connects
        assert.strictEqual(Option.getOrThrow(connect.parent).spanId, first.spanId)
        assert.strictEqual(connect.status.startTime, first.status.startTime)
        assert.strictEqual(connect.attributes.get("db.client.connection.connect_time_ms"), 40)
      }
      assert.strictEqual((yield* firstCheckout(use, { propagate: false })).connects.length, 0)
      assert.strictEqual((yield* firstCheckout(use, { timing: false })).connects.length, 0)
    }))

  it.live("reports no connect for a session that was ready before the statement", () => {
    const { named, tracer } = recording()
    return traced(
      Effect.scoped(Effect.gen(function*() {
        const server = yield* heldServer
        const pool = yield* PgPool.make({
          username: "test",
          minConnections: 1,
          maxConnections: 2,
          stream: server.stream
        })
        yield* Effect.flatten(Queue.take(server.startups))
        // A background session gives no signal when its handshake lands, so this
        // waits for it the way the failed-startup tests above do.
        yield* Effect.sleep("50 millis")
        yield* Effect.scoped(Effect.gen(function*() {
          yield* pool.get.pipe(Effect.withSpan("ready statement"))
          const waiting = yield* Effect.forkChild(Effect.scoped(pool.get).pipe(Effect.withSpan("waiting statement")))
          yield* Effect.flatten(Queue.take(server.startups))
          yield* Fiber.join(waiting)
        }))

        const connects = named("db.connect")
        assert.strictEqual(connects.length, 1)
        assert.strictEqual(Option.getOrThrow(connects[0].parent).spanId, named("waiting statement")[0].spanId)
      })),
      tracer,
      true
    )
  })
})

describe("PgClient failed transaction cleanup", () => {
  const completed = (tag: string, status: string) =>
    Buffer.concat([
      backendMessage("1", Buffer.alloc(0)),
      backendMessage("2", Buffer.alloc(0)),
      backendMessage("n", Buffer.alloc(0)),
      backendMessage("C", Buffer.from(`${tag}\0`)),
      backendMessage("Z", Buffer.from(status))
    ])

  const failed = (code: string) =>
    Buffer.concat([
      backendMessage("E", Buffer.from(`SERROR\0C${code}\0Mfailed\0\0`)),
      backendMessage("Z", Buffer.from("E"))
    ])

  // A backend whose COMMIT is rejected before it runs, as when a pooler has
  // lost the prepared statement, and whose ROLLBACK is cancelled. Both leave
  // the transaction aborted, and an aborted session rejects everything else.
  const abortingBackend = () => {
    let startup = true
    let aborted = false
    const socket = new Duplex({
      read() {},
      write(chunk: Buffer, _encoding, callback) {
        if (startup) {
          startup = false
          queueMicrotask(() => socket.push(ready))
        } else if (chunk[0] === 0x50) {
          let response: Buffer
          if (chunk.includes("ROLLBACK") || chunk.includes("COMMIT")) {
            aborted = true
            response = failed(chunk.includes("COMMIT") ? "26000" : "57014")
          } else if (aborted) {
            response = failed("25P02")
          } else if (chunk.includes("BEGIN")) {
            response = completed("BEGIN", "T")
          } else {
            response = completed("SELECT 0", "I")
          }
          queueMicrotask(() => socket.push(response))
        }
        callback()
      }
    })
    return socket
  }

  it.effect("does not reuse a session left in an aborted transaction", () =>
    Effect.gen(function*() {
      const sql = yield* PgClient.make({ username: "test", maxConnections: 1, prepare: false, stream: abortingBackend })

      const commit = yield* sql.withTransaction(Effect.void).pipe(Effect.sandbox, Effect.flip)
      assert.isFalse(Cause.hasDies(commit))
      assert.propertyVal(Cause.squash(commit), "_tag", "SqlError")
      yield* sql`SELECT 1`

      yield* Effect.exit(sql.withTransaction(Effect.fail("body")))
      yield* sql`SELECT 1`
    }).pipe(
      Effect.scoped,
      Effect.provide(Reactivity.layer)
    ))
})

const readyStream = () => {
  const socket = new Duplex({
    read() {},
    write(_chunk: Buffer, _encoding, callback) {
      queueMicrotask(() => socket.push(ready))
      callback()
    }
  })
  return socket
}

describe("pool stats", () => {
  it.effect("counts a multiplexed session once however many fibers share it", () =>
    Effect.scoped(Effect.gen(function*() {
      const pool = yield* PgPool.make({ username: "test", multiplex: true, maxConnections: 2, stream: readyStream })
      yield* pool.get
      yield* pool.get
      yield* pool.get
      assert.deepStrictEqual(yield* pool.stats, { idle: 0, used: 1, pending: 0, min: 0, max: 2 })
    })))

  it.effect("PgClient.make reports the occupancy of its pool", () =>
    Effect.scoped(Effect.gen(function*() {
      const sql = yield* PgClient.make({ username: "test", maxConnections: 3, stream: readyStream })
      assert.deepStrictEqual(yield* sql.poolStats, { idle: 0, used: 0, pending: 0, min: 0, max: 3 })
      yield* Effect.scoped(Effect.gen(function*() {
        yield* sql.reserve
        assert.deepStrictEqual(yield* sql.poolStats, { idle: 0, used: 1, pending: 0, min: 0, max: 3 })
      }))
      assert.deepStrictEqual(yield* sql.poolStats, { idle: 1, used: 0, pending: 0, min: 0, max: 3 })
    })).pipe(Effect.provide(Reactivity.layer)))

  it.effect("PgClient.makeClient reports its one session as permanently leased", () =>
    Effect.scoped(Effect.gen(function*() {
      const sql = yield* PgClient.makeClient({ username: "test", stream: readyStream })
      // The snapshot describes the session, not statement activity, so it does
      // not change while work runs on it.
      const leased = { idle: 0, used: 1, pending: 0, min: 1, max: 1 }
      assert.deepStrictEqual(yield* sql.poolStats, leased)
      yield* Effect.scoped(Effect.gen(function*() {
        yield* sql.reserve
        assert.deepStrictEqual(yield* sql.poolStats, leased)
      }))
    })).pipe(Effect.provide(Reactivity.layer)))
})
