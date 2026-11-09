import { PgClient } from "@effect/sql-pg"
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql"
import { type Cause, Clock, Console, Context, Data, Effect, Exit, Fiber, Layer, Redacted, String } from "effect"
import { SqlClient } from "effect/sql"
import { getContainerRuntimeClient } from "testcontainers"

export class ContainerError extends Data.TaggedError("ContainerError")<{
  cause: unknown
}> {}

class ReleaseError extends Data.TaggedError("ReleaseError")<{
  message: string
  cause: Cause.Cause<unknown>
}> {}

// it.effect and it.layer provide a TestClock that only moves when a test
// adjusts it, and a TestConsole that keeps output in memory. Container
// deadlines must read the real clock, and lifecycle logs must reach the host
// console.
const withLiveServices = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.provideService(Clock.Clock, Clock.Clock.defaultValue()),
    Effect.provideService(Console.Console, Console.Console.defaultValue())
  )

// testcontainers waits up to 120 seconds for a healthy container. Give up
// sooner so a stuck start fails with a ContainerError inside the hook budget.
const startupTimeout = "90 seconds"

// Leaves headroom under Vitest's ten-second cancellation-hook deadline.
const releaseTimeout = "8 seconds"

// A failure names the container, so whoever observes it can report it.
const stopAndRemove = Effect.fnUntraced(
  function*(container: StartedPostgreSqlContainer) {
    yield* Effect.promise(() => container.stop({ remove: false }))
    const client = yield* Effect.promise(() => getContainerRuntimeClient())
    const handle = client.container.getById(container.getId())
    // Stop can return before the daemon processes the exit event; wait before removing.
    // docker-modem can leave an aborted response pending forever. Abort each
    // timed-out request and retry only this read-only wait, not stop or remove.
    yield* Effect.tryPromise((signal) => handle.wait({ condition: "not-running", abortSignal: signal })).pipe(
      Effect.timeout("2 seconds"),
      Effect.retry({ times: 2 })
    )
    yield* Effect.promise(() => client.container.remove(handle, { removeVolumes: true }))
  },
  (effect, container) =>
    Effect.catchCause(
      effect,
      (cause) => new ReleaseError({ message: `Failed to release PostgreSQL container ${container.getId()}`, cause })
    )
)

// Releases the container once it has started. A start that failed leaves
// nothing to release, and the acquisition already reported it.
const release = (starting: Promise<StartedPostgreSqlContainer>) =>
  Effect.tryPromise(() => starting).pipe(
    Effect.flatMap(stopAndRemove),
    Effect.catchTag("UnknownError", () => Effect.void)
  )

const reportReleaseFailure = (error: ReleaseError) => Effect.logError(error.message, error.cause)

// Waits up to `releaseTimeout` for the release, so a slow one does not fail
// whichever test closes the layer. Past the wait, the release continues in the
// background and only then gets a reporter, so a failure is reported exactly
// once. Inside the wait, a failure is the caller's defect, unless the scope is
// closing because its fiber was interrupted: Vitest cancelling a test drops that
// fiber's exit, so the failure is logged instead.
const releaseContainer = Effect.fnUntraced(
  function*(starting: Promise<StartedPostgreSqlContainer>, exit: Exit.Exit<unknown, unknown>) {
    const fiber = yield* Effect.forkDetach(release(starting))
    const waited = Exit.hasInterrupts(exit)
      ? Effect.catch(Fiber.join(fiber), reportReleaseFailure)
      : Effect.orDie(Fiber.join(fiber))
    yield* Effect.timeoutOrElse(waited, {
      duration: releaseTimeout,
      orElse: () =>
        Effect.andThen(
          Effect.logWarning(
            `PostgreSQL container release is taking longer than ${releaseTimeout}, continuing in the background`
          ),
          Effect.forkDetach(Effect.catch(Fiber.join(fiber), reportReleaseFailure))
        )
    })
  },
  withLiveServices
)

let databases = 0

const runAdmin = (container: StartedPostgreSqlContainer, statement: string) =>
  SqlClient.SqlClient.use((sql) => sql.unsafe(statement)).pipe(
    Effect.provide(PgClient.layer({ url: Redacted.make(container.getConnectionUri()) })),
    Effect.timeout("10 seconds"),
    Effect.orDie,
    withLiveServices
  )

export class PgContainer extends Context.Service<PgContainer>()("test/PgContainer", {
  // The start runs outside the acquisition, so waiting for it stays
  // interruptible. The release owns the container from the moment the start
  // begins, so one that finishes starting after its waiter gave up is still
  // released.
  make: Effect.gen(function*() {
    const starting = yield* Effect.acquireRelease(
      // @effect-diagnostics-next-line lazyPromiseInEffectSync:off
      Effect.sync(() => new PostgreSqlContainer("postgres:alpine").start()),
      releaseContainer
    )
    return yield* Effect.tryPromise({
      try: () => starting,
      catch: (cause) => new ContainerError({ cause })
    }).pipe(
      Effect.timeoutOrElse({
        duration: startupTimeout,
        orElse: () =>
          Effect.fail(
            new ContainerError({ cause: new Error(`PostgreSQL container did not start within ${startupTimeout}`) })
          )
      })
    )
  }).pipe(withLiveServices)
}) {
  static readonly layer = Layer.effect(this)(this.make)

  static layerClient = Layer.unwrap(
    Effect.gen(function*() {
      const container = yield* PgContainer
      return PgClient.layer({
        url: Redacted.make(container.getConnectionUri())
      })
    })
  ).pipe(Layer.provide(this.layer))

  /**
   * A client for a database of its own on a shared container. Tests that each
   * need an empty database share one container this way, so container startup
   * stays out of their time budget. The database is dropped after the client
   * closes.
   */
  static layerClientDatabase = Layer.unwrap(
    Effect.gen(function*() {
      const container = yield* PgContainer
      const database = `test_${++databases}`
      yield* Effect.acquireRelease(
        runAdmin(container, `CREATE DATABASE ${database}`),
        () => runAdmin(container, `DROP DATABASE ${database} WITH (FORCE)`)
      )
      return PgClient.layer({
        host: container.getHost(),
        port: container.getPort(),
        database,
        username: container.getUsername(),
        password: Redacted.make(container.getPassword())
      })
    })
  )

  static layerClientWithTransforms = Layer.unwrap(
    Effect.gen(function*() {
      const container = yield* PgContainer
      return PgClient.layer({
        url: Redacted.make(container.getConnectionUri()),
        transformResultNames: String.snakeToCamel,
        transformQueryNames: String.camelToSnake
      })
    })
  ).pipe(Layer.provide(this.layer))
}
