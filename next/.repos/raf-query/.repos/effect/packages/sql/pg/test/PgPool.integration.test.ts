import { PgConnection, PgPool } from "@effect/sql-pg"
import { assert, it } from "@effect/vitest"
import { Effect, Fiber, Queue, Redacted, Stream } from "effect"
import * as Net from "node:net"
import { Duplex } from "node:stream"
import { PgContainer } from "./utils.ts"

// `it.effect` runs under the TestClock, so poll loops sleep in real time.
const realSleep = Effect.promise(() => new Promise((resolve) => setTimeout(resolve, 10)))
const activeTimeoutMs = 10_000
const cancellationTestTimeout = 20_000

const poolConfig = Effect.gen(function*() {
  const container = yield* PgContainer
  return { url: Redacted.make(container.getConnectionUri()) }
})

const waitUntilActive = (observer: PgConnection.PgConnection, pid: number) =>
  Effect.gen(function*() {
    const startedAt = Date.now()
    while (Date.now() - startedAt < activeTimeoutMs) {
      const active = yield* observer.query(
        "SELECT count(*)::int4 AS active FROM pg_stat_activity WHERE pid = $1 AND state = 'active'",
        [pid]
      )
      if (active.rows[0].active === 1) return
      yield* realSleep
    }
    return yield* Effect.fail(new Error(`PostgreSQL backend ${pid} did not become active within 10 seconds`))
  })

const cancelRequestCode = 80877102

/** Holds `CancelRequest` messages until the test releases them. */
class LateCancelProxy extends Duplex {
  private readonly backend: Net.Socket
  private cancelDeferred = false

  constructor(host: string, port: number, private readonly gate: CancelRequestGate) {
    super()
    this.backend = Net.connect({ host, port, noDelay: true })
    this.backend.on("data", (chunk: Buffer) => {
      if (!this.push(chunk)) this.backend.pause()
    })
    this.backend.on("end", () => this.push(null))
    this.backend.on("error", (error) => this.destroy(error))
    this.backend.on("close", () => {
      if (this.cancelDeferred) this.gate.markDelivered()
      else this.destroy()
    })
  }

  override _read(): void {
    this.backend.resume()
  }

  override _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    if (chunk.length === 16 && chunk.readInt32BE(0) === 16 && chunk.readInt32BE(4) === cancelRequestCode) {
      this.cancelDeferred = true
      const backend = this.backend
      this.gate.intercept(() => backend.end(chunk))
      callback()
      this.destroy()
      return
    }
    this.backend.write(chunk, callback)
  }

  override _final(callback: (error?: Error | null) => void): void {
    this.backend.end(callback)
  }

  override _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
    if (!this.cancelDeferred) this.backend.destroy()
    callback(error)
  }
}

class CancelRequestGate {
  private readonly interceptedPromise: Promise<void>
  private readonly deliveredPromise: Promise<void>
  private resolveIntercepted!: () => void
  private resolveDelivered!: () => void
  private forward: (() => void) | undefined
  private released = false

  constructor() {
    this.interceptedPromise = new Promise((resolve) => {
      this.resolveIntercepted = resolve
    })
    this.deliveredPromise = new Promise((resolve) => {
      this.resolveDelivered = resolve
    })
  }

  get intercepted() {
    return Effect.promise(() => this.interceptedPromise).pipe(Effect.timeout("5 seconds"))
  }

  get delivered() {
    return Effect.promise(() => this.deliveredPromise).pipe(Effect.timeout("5 seconds"))
  }

  intercept(forward: () => void): void {
    this.forward = forward
    this.resolveIntercepted()
    if (this.released) this.release()
  }

  release(): void {
    this.released = true
    const forward = this.forward
    this.forward = undefined
    forward?.()
  }

  markDelivered(): void {
    this.resolveDelivered()
  }
}

const lateCancelPoolConfig = (gate: CancelRequestGate) =>
  Effect.gen(function*() {
    const container = yield* PgContainer
    const host = container.getHost()
    const port = container.getMappedPort(5432)
    return {
      ...(yield* poolConfig),
      maxConnections: 1,
      stream: () => new LateCancelProxy(host, port, gate)
    }
  })

const blockedStream = `
  SELECT n FROM generate_series(1, 1000) AS g(n)
  UNION ALL
  SELECT 1001::int4 AS n
  FROM (SELECT pg_advisory_xact_lock($1::int4)) AS blocked
`

it.layer(PgContainer.layer, { timeout: "30 seconds", concurrent: false })("PgPool", (it) => {
  it.effect("reuses checked out connections", () =>
    Effect.gen(function*() {
      const pool = yield* PgPool.make({ ...(yield* poolConfig), maxConnections: 1 })
      const checkout = Effect.scoped(Effect.gen(function*() {
        const connection = yield* pool.get
        const result = yield* connection.query("SELECT $1::int4 AS one", [1])
        assert.deepStrictEqual(result.rows, [{ one: 1 }])
        return connection.processId
      }))
      const first = yield* checkout
      const second = yield* checkout
      assert.strictEqual(first, second)
    }))

  it.effect("uses a connection once when its TTL is zero", () =>
    Effect.gen(function*() {
      const pool = yield* PgPool.make({ ...(yield* poolConfig), connectionTTL: 0, maxConnections: 1 })
      const checkout = Effect.scoped(Effect.map(pool.get, (connection) => connection.processId)).pipe(
        Effect.timeout("1 second")
      )
      const first = yield* checkout
      const second = yield* checkout
      assert.notStrictEqual(first, second)
    }))

  it.effect("streams rows incrementally and cancels on early abort", () =>
    Effect.gen(function*() {
      const pool = yield* PgPool.make(yield* poolConfig)
      const connection = yield* pool.get
      const rows = yield* Stream.runCollect(
        connection.stream("SELECT n FROM generate_series(1, $1::int4) AS g(n)", [1000])
      )
      assert.strictEqual(rows.length, 1000)
      assert.deepStrictEqual(rows[0], { n: 1 })
      assert.deepStrictEqual(rows[999], { n: 1000 })

      const aborted = yield* Stream.runCollect(
        connection.stream("SELECT n FROM generate_series(1, 5000) AS g(n)").pipe(Stream.take(5))
      )
      assert.deepStrictEqual(aborted, [{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }, { n: 5 }])

      const result = yield* connection.query("SELECT pg_backend_pid()::int4 AS pid, $1::text AS after", ["ok"])
      assert.deepStrictEqual(result.rows, [{ pid: connection.processId, after: "ok" }])
    }), cancellationTestTimeout)

  it.effect("acquires a multiplexed listener after registration", () =>
    Effect.gen(function*() {
      const pool = yield* PgPool.make({ ...(yield* poolConfig), maxConnections: 2, multiplex: true })
      const listener = yield* pool.reserve
      const notifications = yield* listener.listen("test_channel")
      const notifier = yield* pool.get
      assert.notStrictEqual(listener.processId, notifier.processId)
      yield* notifier.query("SELECT pg_notify($1, $2)", ["test_channel", "hello"])
      const notification = yield* Queue.take(notifications)
      assert.strictEqual(notification.channel, "test_channel")
      assert.strictEqual(notification.payload, "hello")
      assert.strictEqual(notification.processId, notifier.processId)
    }))

  it.effect("reports listener registration failure during acquisition", () =>
    Effect.gen(function*() {
      const pool = yield* PgPool.make({ ...(yield* poolConfig), maxConnections: 1 })
      const connection = yield* pool.get
      yield* connection.query("BEGIN")
      yield* Effect.flip(connection.query("SELECT * FROM effect_missing_relation"))

      const error = yield* Effect.flip(connection.listen("test_channel"))
      assert.strictEqual(error._tag, "SqlError")

      // A failed acquisition must release the connection pin.
      yield* connection.query("ROLLBACK")
      const result = yield* connection.query("SELECT 1 AS one")
      assert.deepStrictEqual(result.rows, [{ one: 1 }])
    }))

  it.effect("preserves the server error when a listener backend is terminated", () =>
    Effect.gen(function*() {
      const config = yield* poolConfig
      const pool = yield* PgPool.make({ ...config, maxConnections: 1, multiplex: true })
      const listener = yield* pool.reserve
      const notifications = yield* listener.listen("terminated_listener")
      const consumer = yield* Effect.forkScoped(Queue.take(notifications))
      const terminator = yield* PgConnection.make(config)

      yield* terminator.query("SELECT pg_terminate_backend($1)", [listener.processId])
      const error = yield* Effect.flip(Fiber.join(consumer))
      assert.strictEqual(error._tag, "SqlError")
      assert.propertyVal(error.reason.cause, "code", "57P01")
      assert.strictEqual(yield* Effect.flip(listener.query("SELECT 1")), error)
    }))

  it.effect("returns a multiplexed reservation to shared circulation", () =>
    Effect.gen(function*() {
      const pool = yield* PgPool.make({ ...(yield* poolConfig), maxConnections: 1, multiplex: true })
      const reserve = Effect.scoped(Effect.map(pool.reserve, (connection) => connection.processId))
      const get = Effect.scoped(Effect.map(pool.get, (connection) => connection.processId))

      const first = yield* reserve
      assert.strictEqual(yield* get, first)
      assert.strictEqual(yield* reserve, first)
      assert.strictEqual(yield* get, first)
    }))

  it.effect("interrupt cancels an in-flight query", () =>
    Effect.gen(function*() {
      const config = yield* poolConfig
      const pool = yield* PgPool.make({ ...config, maxConnections: 1 })
      const blocker = yield* PgConnection.make(config)
      const observer = yield* PgConnection.make(config)
      const first = yield* Effect.scoped(Effect.gen(function*() {
        const connection = yield* pool.get
        yield* blocker.query("BEGIN")
        yield* blocker.query("SELECT pg_advisory_xact_lock($1::int4)", [connection.processId])
        const fiber = yield* Effect.forkScoped(
          connection.query("SELECT pg_advisory_xact_lock($1::int4)", [connection.processId])
        )
        yield* waitUntilActive(observer, connection.processId)
        yield* connection.interrupt
        const error = yield* Effect.flip(Fiber.join(fiber))
        assert.strictEqual(error._tag, "SqlError")
        assert.strictEqual(error.reason._tag, "StatementTimeoutError")
        yield* blocker.query("ROLLBACK")
        return connection.processId
      }))

      const second = yield* Effect.scoped(Effect.map(pool.get, (connection) => connection.processId))
      assert.strictEqual(second, first)
    }), cancellationTestTimeout)

  it.effect("replaces a pooled session after an unconfirmed query cancel", () =>
    Effect.gen(function*() {
      const config = yield* poolConfig
      const gate = new CancelRequestGate()
      const pool = yield* PgPool.make(yield* lateCancelPoolConfig(gate))
      const blocker = yield* PgConnection.make(config)
      const observer = yield* PgConnection.make(config)

      yield* Effect.gen(function*() {
        const first = yield* Effect.scoped(Effect.gen(function*() {
          const connection = yield* pool.get
          yield* blocker.query("BEGIN")
          yield* blocker.query("SELECT pg_advisory_xact_lock($1::int4)", [connection.processId])
          const query = yield* Effect.forkScoped(
            connection.query("SELECT pg_advisory_xact_lock($1::int4)", [connection.processId])
          )
          yield* waitUntilActive(observer, connection.processId)
          const interruption = yield* Effect.forkScoped(Fiber.interrupt(query))
          yield* gate.intercepted
          yield* blocker.query("COMMIT")
          yield* Fiber.join(interruption)
          return connection.processId
        }))

        const second = yield* Effect.scoped(Effect.map(pool.get, (connection) => connection.processId))
        assert.notStrictEqual(second, first)
        gate.release()
        yield* gate.delivered
      }).pipe(Effect.ensuring(Effect.sync(() => gate.release())))
    }), cancellationTestTimeout)

  it.effect("replaces a session before pool.use after an unconfirmed query cancel", () =>
    Effect.gen(function*() {
      const config = yield* poolConfig
      const gate = new CancelRequestGate()
      const pool = yield* PgPool.make(yield* lateCancelPoolConfig(gate))
      const blocker = yield* PgConnection.make(config)
      const observer = yield* PgConnection.make(config)

      yield* Effect.gen(function*() {
        const first = yield* Effect.scoped(Effect.gen(function*() {
          const connection = yield* pool.get
          yield* blocker.query("BEGIN")
          yield* blocker.query("SELECT pg_advisory_xact_lock($1::int4)", [connection.processId])
          const query = yield* Effect.forkScoped(
            connection.query("SELECT pg_advisory_xact_lock($1::int4)", [connection.processId])
          )
          yield* waitUntilActive(observer, connection.processId)
          const interruption = yield* Effect.forkScoped(Fiber.interrupt(query))
          yield* gate.intercepted
          yield* blocker.query("COMMIT")
          yield* Fiber.join(interruption)
          return connection.processId
        }))

        const second = yield* pool.use((connection) => Effect.succeed(connection.processId))
        assert.notStrictEqual(second, first)
        gate.release()
        yield* gate.delivered
      }).pipe(Effect.ensuring(Effect.sync(() => gate.release())))
    }), cancellationTestTimeout)

  it.effect("protects an active pool.use query from a late cancel", () =>
    Effect.gen(function*() {
      const config = yield* poolConfig
      const gate = new CancelRequestGate()
      const pool = yield* PgPool.make(yield* lateCancelPoolConfig(gate))
      const blocker = yield* PgConnection.make(config)
      const observer = yield* PgConnection.make(config)
      const started = yield* Queue.unbounded<number>()
      const lockAcquired = yield* Queue.unbounded<void>()

      yield* Effect.gen(function*() {
        yield* Effect.scoped(Effect.gen(function*() {
          const connection = yield* pool.get
          yield* blocker.query("BEGIN")
          yield* blocker.query("SELECT pg_advisory_xact_lock($1::int4)", [connection.processId])
          const query = yield* Effect.forkScoped(
            connection.query("SELECT pg_advisory_xact_lock($1::int4)", [connection.processId])
          )
          yield* waitUntilActive(observer, connection.processId)
          const interruption = yield* Effect.forkScoped(Fiber.interrupt(query))
          yield* gate.intercepted
          yield* blocker.query("COMMIT")
          yield* Fiber.join(interruption)
        }))

        const followUp = yield* Effect.forkScoped(
          pool.use((connection) =>
            Effect.gen(function*() {
              yield* Queue.offer(started, connection.processId)
              yield* Queue.take(lockAcquired)
              return yield* connection.query(
                "SELECT 1 AS after FROM pg_advisory_xact_lock($1::int4)",
                [connection.processId]
              )
            })
          )
        )
        const followUpPid = yield* Queue.take(started)
        yield* blocker.query("BEGIN")
        yield* blocker.query("SELECT pg_advisory_xact_lock($1::int4)", [followUpPid])
        yield* Queue.offer(lockAcquired, undefined)
        yield* waitUntilActive(observer, followUpPid)
        gate.release()
        yield* gate.delivered
        yield* blocker.query("COMMIT")
        const result = yield* Fiber.join(followUp)
        assert.deepStrictEqual(result.rows, [{ after: 1 }])
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => gate.release()).pipe(
            Effect.andThen(blocker.query("ROLLBACK")),
            Effect.ignore
          )
        )
      )
    }), cancellationTestTimeout)

  it.effect("retires an idle interrupted session before pool.use", () =>
    Effect.gen(function*() {
      const config = yield* poolConfig
      const gate = new CancelRequestGate()
      const pool = yield* PgPool.make(yield* lateCancelPoolConfig(gate))
      const observer = yield* PgConnection.make(config)
      const started = yield* Queue.unbounded<number>()

      yield* Effect.gen(function*() {
        const first = yield* Effect.scoped(Effect.gen(function*() {
          const connection = yield* pool.get
          yield* connection.interrupt
          yield* gate.intercepted
          return connection.processId
        }))

        const followUp = yield* Effect.forkScoped(
          pool.use((connection) =>
            Effect.gen(function*() {
              yield* Queue.offer(started, connection.processId)
              return yield* connection.query("SELECT 1 AS after FROM pg_sleep(1)")
            })
          )
        )
        const followUpPid = yield* Queue.take(started)
        assert.notStrictEqual(followUpPid, first)
        yield* waitUntilActive(observer, followUpPid)
        gate.release()
        yield* gate.delivered
        const result = yield* Fiber.join(followUp)
        assert.deepStrictEqual(result.rows, [{ after: 1 }])
      }).pipe(Effect.ensuring(Effect.sync(() => gate.release())))
    }), cancellationTestTimeout)

  it.effect("replaces a pooled session after an unconfirmed stream cancel", () =>
    Effect.gen(function*() {
      const config = yield* poolConfig
      const gate = new CancelRequestGate()
      const pool = yield* PgPool.make(yield* lateCancelPoolConfig(gate))
      const blocker = yield* PgConnection.make(config)

      yield* Effect.gen(function*() {
        const first = yield* Effect.scoped(Effect.gen(function*() {
          const connection = yield* pool.get
          yield* blocker.query("BEGIN")
          yield* blocker.query("SELECT pg_advisory_xact_lock($1::int4)", [connection.processId])
          const stream = yield* Effect.forkScoped(
            connection.stream(blockedStream, [connection.processId]).pipe(Stream.take(1), Stream.runCollect)
          )
          yield* gate.intercepted
          yield* blocker.query("COMMIT")
          const rows = yield* Fiber.join(stream)
          assert.deepStrictEqual(rows, [{ n: 1 }])
          return connection.processId
        }))

        yield* Effect.scoped(Effect.gen(function*() {
          const replacement = yield* pool.get
          assert.notStrictEqual(replacement.processId, first)
          const query = yield* Effect.forkScoped(replacement.query("SELECT 1 AS after FROM pg_sleep(1)"))
          yield* waitUntilActive(blocker, replacement.processId)
          gate.release()
          yield* gate.delivered
          const result = yield* Fiber.join(query)
          assert.deepStrictEqual(result.rows, [{ after: 1 }])
        }))
      }).pipe(Effect.ensuring(Effect.sync(() => gate.release())))
    }), cancellationTestTimeout)

  it.effect("keeps a session after a confirmed stream cancel", () =>
    Effect.gen(function*() {
      const config = yield* poolConfig
      const pool = yield* PgPool.make({ ...config, maxConnections: 1 })
      const blocker = yield* PgConnection.make(config)
      const connection = yield* pool.get
      yield* blocker.query("BEGIN")
      yield* blocker.query("SELECT pg_advisory_xact_lock($1::int4)", [connection.processId])
      const rows = yield* connection.stream(blockedStream, [connection.processId]).pipe(
        Stream.take(1),
        Stream.runCollect,
        Effect.timeout("5 seconds")
      )
      assert.deepStrictEqual(rows, [{ n: 1 }])
      const result = yield* connection.query("SELECT pg_backend_pid()::int4 AS pid")
      assert.deepStrictEqual(result.rows, [{ pid: connection.processId }])
      yield* blocker.query("ROLLBACK")
    }), cancellationTestTimeout)

  it.effect("keeps a held session after an unconfirmed query cancel", () =>
    Effect.gen(function*() {
      const config = yield* poolConfig
      const gate = new CancelRequestGate()
      const pool = yield* PgPool.make(yield* lateCancelPoolConfig(gate))
      const blocker = yield* PgConnection.make(config)
      const observer = yield* PgConnection.make(config)

      yield* Effect.gen(function*() {
        const connection = yield* pool.get
        yield* blocker.query("BEGIN")
        yield* blocker.query("SELECT pg_advisory_xact_lock($1::int4)", [connection.processId])
        const query = yield* Effect.forkScoped(
          connection.query("SELECT pg_advisory_xact_lock($1::int4)", [connection.processId])
        )
        yield* waitUntilActive(observer, connection.processId)
        const interruption = yield* Effect.forkScoped(Fiber.interrupt(query))
        yield* gate.intercepted
        yield* blocker.query("COMMIT")
        yield* Fiber.join(interruption)

        const beforeDelivery = yield* connection.query("SELECT pg_backend_pid()::int4 AS pid")
        assert.deepStrictEqual(beforeDelivery.rows, [{ pid: connection.processId }])
        gate.release()
        yield* gate.delivered
        const afterDelivery = yield* connection.query("SELECT pg_backend_pid()::int4 AS pid")
        assert.deepStrictEqual(afterDelivery.rows, [{ pid: connection.processId }])
      }).pipe(Effect.ensuring(Effect.sync(() => gate.release())))
    }), cancellationTestTimeout)

  it.effect("replaces connections that die", () =>
    Effect.gen(function*() {
      const config = yield* poolConfig
      const pool = yield* PgPool.make({ ...config, maxConnections: 1 })
      const first = yield* Effect.scoped(Effect.map(pool.get, (connection) => connection.processId))
      const terminator = yield* PgConnection.make(config)
      yield* terminator.query("SELECT pg_terminate_backend($1)", [first])
      // The pool notices the dead connection asynchronously; retry until it
      // hands out a healthy replacement.
      while (true) {
        const replaced = yield* Effect.scoped(Effect.gen(function*() {
          const connection = yield* pool.get
          const alive = yield* Effect.isSuccess(connection.query("SELECT 1 AS one"))
          return alive && connection.processId !== first ? connection.processId : undefined
        }))
        if (replaced !== undefined) {
          assert.notStrictEqual(replaced, first)
          break
        }
        yield* realSleep
      }
    }))
  it.effect("defaults multiplex concurrency to 32", () =>
    Effect.gen(function*() {
      const pool = yield* PgPool.make({ ...(yield* poolConfig), maxConnections: 4, multiplex: true })
      const processIds = yield* Effect.all(
        Array.from({ length: 32 }, () =>
          Effect.scoped(Effect.flatMap(pool.get, (connection) =>
            Effect.as(
              connection.query("SELECT pg_sleep(0.05)"),
              connection.processId
            )))),
        { concurrency: "unbounded" }
      )
      assert.strictEqual(new Set(processIds).size, 1)
    }))
  it.effect("invalidates a reserved connection", () =>
    Effect.gen(function*() {
      const pool = yield* PgPool.make({ ...(yield* poolConfig), maxConnections: 2, multiplex: true })
      const reserved = yield* pool.reserve
      yield* pool.invalidate(reserved)
      const replacement = yield* pool.get
      assert.notStrictEqual(replacement.processId, reserved.processId)
    }))

  it.effect("keeps a multiplexed stream's connection to itself", () =>
    Effect.gen(function*() {
      const pool = yield* PgPool.make({ ...(yield* poolConfig), maxConnections: 2, multiplex: true })
      const connection = yield* pool.get
      // A stream pins its connection for its lifetime. A checkout that landed
      // on the same one would wait behind a stream only it could drain.
      const doubled = yield* connection.stream("SELECT generate_series(1, 5) AS n").pipe(
        Stream.mapEffect((row) =>
          Effect.flatMap(pool.get, (other) => other.query("SELECT $1::int4 AS d", [(row as any).n * 2]))
        ),
        Stream.map((result) => (result.rows[0] as any).d),
        Stream.runCollect
      )
      assert.deepStrictEqual(Array.from(doubled), [2, 4, 6, 8, 10])
    }))
  it.effect("admits a waiting checkout when a reserved connection dies", () =>
    Effect.gen(function*() {
      const pool = yield* PgPool.make({ ...(yield* poolConfig), maxConnections: 1, multiplex: true })
      const reserved = yield* pool.reserve
      const waiter = yield* Effect.forkScoped(
        Effect.scoped(Effect.flatMap(pool.get, (connection) => connection.query("SELECT 1 AS ok")))
      )
      yield* realSleep

      // The reservation is still held when its connection dies, so nothing
      // returns the connection to the pool. The waiter behind it would queue
      // for a connection that is never coming back.
      yield* Effect.ignore(reserved.query("SELECT pg_terminate_backend(pg_backend_pid())"))

      const result = yield* Fiber.join(waiter)
      assert.deepStrictEqual(result.rows, [{ ok: 1 }])
    }))
  it.effect("returns a borrowed session on success, failure, and interruption", () =>
    Effect.gen(function*() {
      // A pool of one: a lease that is not returned hangs the next borrow.
      const pool = yield* PgPool.make({ ...(yield* poolConfig), maxConnections: 1 })
      const borrow = <A, E>(effect: (connection: PgConnection.PgConnection) => Effect.Effect<A, E>) => pool.use(effect)

      assert.deepStrictEqual(
        (yield* borrow((connection) => connection.query("SELECT 1 AS ok"))).rows,
        [{ ok: 1 }]
      )

      const failed = yield* Effect.result(borrow((connection) => connection.query("SELECT * FROM nope")))
      assert.strictEqual(failed._tag, "Failure")

      const running = yield* Effect.forkScoped(borrow((connection) => connection.query("SELECT pg_sleep(30)")))
      yield* realSleep
      yield* Fiber.interrupt(running)

      assert.deepStrictEqual(
        (yield* borrow((connection) => connection.query("SELECT 2 AS ok"))).rows,
        [{ ok: 2 }]
      )
    }), cancellationTestTimeout)

  it.effect("replaces a fatal session before the next pool.use query", () =>
    Effect.gen(function*() {
      const pool = yield* PgPool.make({ ...(yield* poolConfig), maxConnections: 1 })
      const first = yield* pool.use((connection) => Effect.succeed(connection.processId))

      // Decoding this interval fails fatally in the connection's data handler.
      // The next borrow must not see the dead session, even in the same fiber.
      const error = yield* Effect.flip(pool.use((connection) => connection.query("SELECT interval '-1 day' AS v")))
      assert.strictEqual(error._tag, "SqlError")
      assert.strictEqual(error.reason.message, "PgConnection: Failed to decode row")
      const next = yield* pool.use((connection) =>
        Effect.map(connection.query("SELECT 1::int4 AS one"), (result) => ({
          pid: connection.processId,
          rows: result.rows
        }))
      )
      assert.notStrictEqual(next.pid, first)
      assert.deepStrictEqual(next.rows, [{ one: 1 }])
    }))

  it.effect("borrows around a connection that has to be replaced", () =>
    Effect.gen(function*() {
      const pool = yield* PgPool.make({ ...(yield* poolConfig), maxConnections: 1 })
      const first = yield* pool.use((connection) => Effect.as(connection.query("SELECT 1 AS ok"), connection.processId))
      // Killing the only session leaves it queued dead, which is exactly the
      // case the fast path declines to take. The backend answers with an error
      // and closes afterwards, so wait for the close to land before borrowing
      // again - both paths would race it otherwise.
      yield* Effect.ignore(
        pool.use((connection) => connection.query("SELECT pg_terminate_backend(pg_backend_pid())"))
      )
      for (let i = 0; i < 50; i++) yield* realSleep
      const second = yield* pool.use((connection) =>
        Effect.as(connection.query("SELECT 2 AS ok"), connection.processId)
      )
      assert.notStrictEqual(second, first)
    }), 20_000)
  it.effect("honours a configured multiplex concurrency", () =>
    Effect.gen(function*() {
      // Two statements to a connection means eight of them need four
      // connections, where the default for a pool this size would fit them on
      // one.
      const pool = yield* PgPool.make({
        ...(yield* poolConfig),
        maxConnections: 4,
        multiplex: true,
        multiplexConcurrency: 2
      })
      const processIds = yield* Effect.all(
        Array.from({ length: 8 }, () =>
          Effect.scoped(Effect.flatMap(pool.get, (connection) =>
            Effect.as(connection.query("SELECT pg_sleep(0.05)"), connection.processId)))),
        { concurrency: "unbounded" }
      )
      assert.strictEqual(new Set(processIds).size, 4)
    }))
})
