import { PgClient, type PgConnection } from "@effect/sql-pg"
import { PostgreSqlContainer } from "@testcontainers/postgresql"
import { Clock, Context, Data, Effect, Layer, Redacted, type Scope, String } from "effect"
import * as Fs from "node:fs"
import { inspect } from "node:util"
import { getContainerRuntimeClient, Wait } from "testcontainers"

export class ContainerError extends Data.TaggedError("ContainerError")<{
  cause: unknown
}> {}

// Opt-in diagnostics only: keep cleanup errors visible and preserve the teardown sequence.
const lifecycleEnabled = process.env.PG_LIFECYCLE_DIAGNOSTICS === "1"
const lifecycleFile = process.env.PG_LIFECYCLE_LOG
const lifecycleLog = (id: string, step: string, state: string, ms: number, error?: unknown) => {
  if (!lifecycleEnabled) return
  const line = `[pg-lifecycle] ${new Date().toISOString()} pid=${process.pid} ${id} ${step} ${state} ${ms}ms${
    error === undefined ? "" : ` error=${inspect(error)}`
  }\n`
  // Bypass the reporter, which can drop console output from hooks. Diagnostics
  // must not turn successful cleanup into a failure or replace its original error.
  try {
    process.stderr.write(line)
  } catch {}
  if (lifecycleFile !== undefined) {
    try {
      Fs.appendFileSync(lifecycleFile, line)
    } catch (error) {
      try {
        process.stderr.write(`[pg-lifecycle] unable to append diagnostics: ${inspect(error)}\n`)
      } catch {}
    }
  }
}

const lifecycle = async <A>(id: string, step: string, run: () => Promise<A>, signal?: AbortSignal): Promise<A> => {
  if (!lifecycleEnabled) return run()
  const started = Date.now()
  const log = (state: string) => lifecycleLog(id, step, state, Date.now() - started)
  log("start")
  const pending = setInterval(() => log("pending"), 5_000)
  pending.unref()
  const interrupted = () => {
    clearInterval(pending)
    log("interrupted")
  }
  signal?.addEventListener("abort", interrupted, { once: true })
  try {
    const value = await run()
    log("done")
    return value
  } catch (error) {
    lifecycleLog(id, step, "failed", Date.now() - started, error)
    throw error
  } finally {
    clearInterval(pending)
    signal?.removeEventListener("abort", interrupted)
  }
}

const marker = (id: string, step: string) => Effect.sync(() => lifecycleLog(id, step, "mark", 0))

// Brackets the client layer's finalizers: `disposal start` runs first on close,
// `disposal done` runs after every finalizer of the inner layer.
const instrumentClient = <A, E, R>(
  name: string,
  containerId: string,
  inner: Layer.Layer<A, E, R>
): Effect.Effect<Layer.Layer<A, E, R>, never, Scope.Scope> =>
  !lifecycleEnabled ? Effect.succeed(inner) : Effect.as(
    Effect.addFinalizer(() => marker(containerId, `${name} disposal done`)),
    inner.pipe(Layer.tap(() => Effect.addFinalizer(() => marker(containerId, `${name} disposal start`))))
  )

// Shared with the regression tests so they exercise the real container finalizer.
export const releasePgContainer = Effect.fnUntraced(
  function*(container: {
    getId(): string
    stop(options: { remove: boolean }): Promise<unknown>
  }) {
    const id = container.getId()
    lifecycleLog(id, "container-release", "start", 0)
    yield* Effect.promise(() => lifecycle(id, "stop", () => container.stop({ remove: false })))
    const client = yield* Effect.promise(() => lifecycle(id, "runtime-client", () => getContainerRuntimeClient()))
    const handle = client.container.getById(container.getId())
    // Stop can return before the daemon processes the exit event; wait before removing.
    // docker-modem can leave an aborted response pending forever. Abort each
    // timed-out request and retry this read-only wait, never the whole release.
    yield* Effect.tryPromise((signal) =>
      lifecycle(id, "wait-not-running", () => handle.wait({ condition: "not-running", abortSignal: signal }), signal)
    ).pipe(Effect.timeout("5 seconds"), Effect.retry({ times: 2 }))
    yield* Effect.promise(() => lifecycle(id, "remove", () => client.container.remove(handle, { removeVolumes: true })))
    lifecycleLog(id, "container-release", "done", 0)
  },
  // Bound the entire release below the existing 30s hook limit, including
  // stop and removal. Exhausted retries and timeouts remain visible defects.
  Effect.timeout("20 seconds"),
  (_) => Effect.orDie(_),
  // Fixture finalizers inherit TestClock from it.layer; cleanup must use real deadlines.
  Effect.provideService(Clock.Clock, Clock.Clock.defaultValue())
)

// PostgreSqlContainer also waits for listening ports, probing them with
// `docker exec` calls that have no timeout. In Deno CI one probe never exited,
// stalling startup past the 30s hook limit while the container was healthy.
// Its pg_isready health check already requires a TCP listener on localhost.
export const pgWaitStrategy = () => Wait.forHealthCheck()

export class PgContainer extends Context.Service<PgContainer>()("test/PgContainer", {
  make: Effect.acquireRelease(
    Effect.tryPromise({
      try: () =>
        lifecycle(
          "new",
          "container-start",
          () => new PostgreSqlContainer("postgres:14-alpine").withWaitStrategy(pgWaitStrategy()).start()
        ),
      catch: (cause) => new ContainerError({ cause })
    }).pipe(Effect.tap((container) => marker(container.getId(), "container-started"))),
    releasePgContainer
  )
}) {
  static readonly layer = Layer.effect(this)(this.make)

  static layerClient = Layer.unwrap(
    Effect.gen(function*() {
      const container = yield* PgContainer
      return yield* instrumentClient(
        "layerClient",
        container.getId(),
        PgClient.layer({
          url: Redacted.make(container.getConnectionUri())
        })
      )
    })
  ).pipe(Layer.provide(this.layer))

  static layerMakeClient = Layer.unwrap(
    Effect.gen(function*() {
      const container = yield* PgContainer
      return yield* instrumentClient(
        "layerMakeClient",
        container.getId(),
        PgClient.layerFrom(PgClient.makeClient({
          url: Redacted.make(container.getConnectionUri())
        }))
      )
    })
  ).pipe(Layer.provide(this.layer))

  static layerMakeClientUnprepared = Layer.unwrap(
    Effect.gen(function*() {
      const container = yield* PgContainer
      return yield* instrumentClient(
        "layerMakeClientUnprepared",
        container.getId(),
        PgClient.layerFrom(PgClient.makeClient({
          url: Redacted.make(container.getConnectionUri()),
          prepare: false
        }))
      )
    })
  ).pipe(Layer.provide(this.layer))

  static layerMakeClientAcquireForStream = Layer.unwrap(
    Effect.gen(function*() {
      const container = yield* PgContainer
      return yield* instrumentClient(
        "layerMakeClientAcquireForStream",
        container.getId(),
        PgClient.layerFrom(PgClient.makeClient({
          url: Redacted.make(container.getConnectionUri()),
          applicationName: "side-default",
          acquireForStream: true
        }))
      )
    })
  ).pipe(Layer.provide(this.layer))

  static layerClientWithTransforms = Layer.unwrap(
    Effect.gen(function*() {
      const container = yield* PgContainer
      return yield* instrumentClient(
        "layerClientWithTransforms",
        container.getId(),
        PgClient.layer({
          url: Redacted.make(container.getConnectionUri()),
          transformResultNames: String.snakeToCamel,
          transformQueryNames: String.camelToSnake
        })
      )
    })
  ).pipe(Layer.provide(this.layer))

  static layerClientForListen = Layer.unwrap(
    Effect.gen(function*() {
      const container = yield* PgContainer
      return yield* instrumentClient(
        "layerClientForListen",
        container.getId(),
        PgClient.layer({
          url: Redacted.make(container.getConnectionUri()),
          maxConnections: 2,
          multiplex: true
        })
      )
    })
  ).pipe(Layer.provide(this.layer))
}

// `it.effect` runs under the TestClock, so poll loops sleep in real time.
export const realSleep = Effect.promise(() => new Promise((resolve) => setTimeout(resolve, 10)))
const activeTimeoutMs = 10_000

export const waitUntilActive = Effect.fnUntraced(
  function*(observer: PgConnection.PgConnection, pid: number, advisoryLock = false) {
    const startedAt = Date.now()
    while (Date.now() - startedAt < activeTimeoutMs) {
      const active = yield* observer.query(
        `SELECT count(*)::int4 AS active FROM pg_stat_activity
         WHERE pid = $1 AND state = 'active'
           AND (NOT $2::boolean OR (wait_event_type = 'Lock' AND wait_event = 'advisory'))`,
        [pid, advisoryLock]
      )
      if (active.rows[0].active === 1) return
      yield* realSleep
    }
    return yield* Effect.fail(
      new Error(
        `PostgreSQL backend ${pid} did not become ${
          advisoryLock ? "blocked on an advisory lock" : "active"
        } within 10 seconds`
      )
    )
  }
)

// Parse can report active before Execute starts. Cancellation needs the query to be waiting on the lock.
export const waitUntilAdvisoryLock = (observer: PgConnection.PgConnection, pid: number) =>
  waitUntilActive(observer, pid, true)
