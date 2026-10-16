/**
 * Stores schema-encoded queue work in persistent storage.
 *
 * A `PersistedQueue<A>` keeps JSON-encoded values in a named queue and lets
 * workers take one value at a time inside a scoped processing window. It is
 * useful for durable handoffs, background jobs, outbox-style integrations, and
 * work that should retry across fibers, process restarts, or multiple workers.
 * This module includes a queue factory, store service, id-based de-duplication,
 * retry handling, and in-memory, Redis, and SQL-backed store layers.
 *
 * Delivery is at-least-once: a crash between handler success and the
 * acknowledgement redelivers the element, so handlers must be idempotent.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Cause from "../Cause.ts"
import * as Clock from "../Clock.ts"
import * as Context from "../Context.ts"
import * as Duration from "../Duration.ts"
import * as Effect from "../Effect.ts"
import { flow } from "../Function.ts"
import { sqlCleanupBatchSize } from "../internal/persistence.ts"
import * as Latch from "../Latch.ts"
import * as Layer from "../Layer.ts"
import * as MutableRef from "../MutableRef.ts"
import * as Predicate from "../Predicate.ts"
import * as Pull from "../Pull.ts"
import * as Queue from "../Queue.ts"
import * as RcMap from "../RcMap.ts"
import * as Schedule from "../Schedule.ts"
import * as Schema from "../Schema.ts"
import * as Scope from "../Scope.ts"
import * as Migrator from "../sql/Migrator.ts"
import * as SqlClient from "../sql/SqlClient.ts"
import type { SqlError } from "../sql/SqlError.ts"
import * as Redis from "./Redis.ts"

/**
 * Runtime type identifier for `PersistedQueue` values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export const TypeId: TypeId = "~effect/persistence/PersistedQueue"

/**
 * Type-level identifier used to brand `PersistedQueue` values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export type TypeId = "~effect/persistence/PersistedQueue"

/**
 * Persistent queue of schema-encoded values.
 *
 * **Details**
 *
 * `offer` enqueues values by id, and `take` processes one value at a time,
 * marking it complete on success or retrying it with the queue's retry
 * schedule until the maximum attempts is reached, after which it is marked as
 * failed.
 *
 * Delivery is at-least-once: a crash between handler success and the
 * acknowledgement redelivers the element, so handlers must be idempotent.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface PersistedQueue<in out A, out R = never> {
  readonly [TypeId]: TypeId

  /**
   * Adds an element to the queue and returns the id of the enqueued element.
   *
   * **Details**
   *
   * If an element with the same id already exists in the queue, it will not be
   * added again. De-duplication survives completion until the id is removed by
   * `layerCleanup`.
   */
  readonly offer: (value: A, options?: {
    readonly id: string | undefined
  }) => Effect.Effect<string, PersistedQueueError | Schema.SchemaError, R>

  /**
   * Takes an element from the queue, waiting until one is available when the
   * queue is empty.
   *
   * **Details**
   *
   * If the returned effect succeeds, the element is marked as processed;
   * otherwise it will be retried with the queue's retry schedule until the
   * maximum attempts is reached, after which it is marked as failed.
   *
   * An attempt is counted when the element is claimed, so `attempts` in the
   * handler metadata is 1-based ("this is attempt 3"). A handler crash that
   * takes down the process still consumes an attempt.
   *
   * Elements that fail to decode with the queue's schema are marked as failed
   * immediately and the next element is taken instead, so schema decode errors
   * never surface from `take`.
   */
  readonly take: <XA, XE, XR>(
    f: (value: A, metadata: {
      readonly id: string
      readonly attempts: number
    }) => Effect.Effect<XA, XE, XR>
  ) => Effect.Effect<XA, XE | PersistedQueueError, R | XR>
}

/**
 * Service for constructing named `PersistedQueue` instances from schemas.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class PersistedQueueFactory extends Context.Service<
  PersistedQueueFactory,
  {
    readonly make: <S extends Schema.Constraint>(options: {
      readonly name: string
      readonly schema: S
      readonly maxAttempts?: number | undefined
      readonly retrySchedule?: Schedule.Schedule<any, number> | undefined
    }) => Effect.Effect<PersistedQueue<S["Type"], S["EncodingServices"] | S["DecodingServices"]>>
  }
>()("effect/persistence/PersistedQueue/PersistedQueueFactory") {}

/**
 * Accesses `PersistedQueueFactory` to create a named persisted queue for a
 * schema.
 *
 * **Details**
 *
 * `maxAttempts` defaults to 10. `retrySchedule` controls the delay before a
 * failed element becomes visible again, and defaults to an exponential delay
 * starting at 1 second and capped at 5 minutes.
 *
 * The schedule's state is the element's persisted attempt count. On each
 * failure the schedule is replayed up to the current attempt, so delays keep
 * progressing even when consecutive retries run in different processes. The
 * schedule input is the attempt number.
 *
 * Replay simulates elapsed time from the sum of the computed delays.
 * Attempt-driven schedules are therefore exact, while wall-clock-anchored
 * schedules observe this idealized time. In particular,
 * `Schedule.upTo({ duration })` caps the summed delays rather than real time
 * since the original failure.
 *
 * @stability unstable
 * @category accessors
 * @since 4.0.0
 */
export const make = <S extends Schema.Constraint>(options: {
  readonly name: string
  readonly schema: S
  readonly maxAttempts?: number | undefined
  readonly retrySchedule?: Schedule.Schedule<any, number> | undefined
}): Effect.Effect<
  PersistedQueue<S["Type"], S["EncodingServices"] | S["DecodingServices"]>,
  never,
  PersistedQueueFactory
> => PersistedQueueFactory.use((factory) => factory.make(options))

const defaultRetrySchedule = Schedule.min([
  Schedule.exponential("1 second"),
  Schedule.spaced("5 minutes")
])

// The persisted attempt count is the schedule state: consecutive retries of an
// element can run in different processes, so a fresh schedule step is replayed
// up to the given attempt on every call. Delays therefore depend only on the
// attempt count, with elapsed time simulated from the summed delays.
const retryDelay = Effect.fnUntraced(function*(
  schedule: Schedule.Schedule<any, number>,
  attempts: number
): Effect.fn.Return<Duration.Duration> {
  const step = yield* Schedule.toStep(schedule)
  let now = 0
  let delay = Duration.zero
  for (let i = 0; i < attempts; i++) {
    const result = yield* Pull.catchDone(step(now, i + 1), () => Effect.undefined)
    if (result === undefined) {
      // the schedule is done, keep using its final delay
      break
    }
    delay = result[1]
    now += Duration.toMillis(delay)
  }
  return delay
})

/**
 * Creates a `PersistedQueueFactory` from the current `PersistedQueueStore`.
 *
 * **Details**
 *
 * Values are encoded and decoded with the supplied schema, automatically
 * assigned an id when needed, and acknowledged or retried according to the
 * `take` handler's exit.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeFactory = Effect.gen(function*() {
  const store = yield* PersistedQueueStore

  return PersistedQueueFactory.of({
    make<S extends Schema.Constraint>(options: {
      readonly name: string
      readonly schema: S
      readonly maxAttempts?: number | undefined
      readonly retrySchedule?: Schedule.Schedule<any, number> | undefined
    }) {
      const jsonSchema = Schema.toCodecJson(options.schema)
      const encodeUnknown = Schema.encodeUnknownEffect(jsonSchema)
      const decodeUnknown = Schema.decodeUnknownEffect(jsonSchema)
      const retrySchedule = options.retrySchedule ?? defaultRetrySchedule
      const takeOptions = {
        name: options.name,
        maxAttempts: options.maxAttempts ?? 10,
        retryDelay: (attempts: number) => retryDelay(retrySchedule, attempts)
      }

      return Effect.succeed<PersistedQueue<S["Type"], S["EncodingServices"] | S["DecodingServices"]>>({
        [TypeId]: TypeId,
        offer: (value, opts) =>
          Effect.flatMap(
            encodeUnknown(value),
            (element) => {
              const id = opts?.id ?? crypto.randomUUID()
              return Effect.as(
                store.offer({
                  name: options.name,
                  id,
                  element,
                  isCustomId: opts?.id !== undefined
                }),
                id
              )
            }
          ),
        take: <XA, XE, XR>(
          f: (value: S["Type"], metadata: {
            readonly id: string
            readonly attempts: number
          }) => Effect.Effect<XA, XE, XR>
        ) => {
          const loop: Effect.Effect<XA, any, any> = Effect.scopedWith((scope) =>
            store.take(takeOptions).pipe(
              Scope.provide(scope),
              Effect.flatMap((item) =>
                decodeUnknown(item.element).pipe(
                  Effect.catchCause((cause): Effect.Effect<never, DeadLetter> =>
                    Cause.hasInterruptsOnly(cause)
                      ? Effect.failCause(cause as Cause.Cause<never>)
                      : Effect.fail(new DeadLetter(cause))
                  ),
                  Effect.flatMap((value) => f(value as S["Type"], { id: item.id, attempts: item.attempts }))
                )
              )
            )
          ).pipe(
            Effect.catchIf(
              isDeadLetter,
              (): Effect.Effect<XA, any, any> => loop
            )
          )
          return loop as Effect.Effect<
            XA,
            XE | PersistedQueueError,
            XR | S["EncodingServices"] | S["DecodingServices"]
          >
        }
      })
    }
  })
})

/**
 * Provides `PersistedQueueFactory` using the current `PersistedQueueStore`.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer.Layer<
  PersistedQueueFactory,
  never,
  PersistedQueueStore
> = Layer.effect(PersistedQueueFactory, makeFactory)

/**
 * Runs `PersistedQueueStore.cleanup` on a schedule.
 *
 * **Details**
 *
 * Completed elements are retained for `timeToLive` (default 30 days) so
 * offer de-duplication keeps working across replays, then removed. Failed
 * elements are the dead-letter record and are kept forever unless
 * `failedTimeToLive` is set.
 *
 * Run this layer in one instance of a deployment rather than on every worker;
 * racing instances are harmless since deletes are idempotent, but the work is
 * redundant.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerCleanup = (options?: {
  readonly interval?: Duration.Input | undefined
  readonly timeToLive?: Duration.Input | undefined
  readonly failedTimeToLive?: Duration.Input | undefined
}): Layer.Layer<never, never, PersistedQueueStore> =>
  Layer.effectDiscard(Effect.gen(function*() {
    const store = yield* PersistedQueueStore
    const cleanupOptions = {
      timeToLive: Duration.fromInputUnsafe(options?.timeToLive ?? Duration.days(30)),
      failedTimeToLive: options?.failedTimeToLive === undefined
        ? undefined
        : Duration.fromInputUnsafe(options.failedTimeToLive)
    }
    yield* store.cleanup(cleanupOptions).pipe(
      Effect.catchCause((cause) => Effect.logWarning("Failed to clean up persisted queue", cause)),
      Effect.repeat(Schedule.spaced(options?.interval ?? Duration.hours(1))),
      Effect.interruptible,
      Effect.forkScoped,
      Effect.annotateLogs({
        module: "effect/persistence/PersistedQueue",
        fiber: "cleanup"
      })
    )
  }))

/**
 * Runtime type identifier for `PersistedQueueError`.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export const ErrorTypeId: ErrorTypeId = "~effect/persistence/PersistedQueue/PersistedQueueError"

/**
 * Type-level identifier used to brand `PersistedQueueError` values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export type ErrorTypeId = "~effect/persistence/PersistedQueue/PersistedQueueError"

/**
 * Error raised by persisted queue store operations.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class PersistedQueueError extends Schema.Error<PersistedQueueError>(
  "effect/persistence/PersistedQueue/PersistedQueueError"
)({
  _tag: Schema.tag("PersistedQueueError"),
  message: Schema.String,
  cause: Schema.optional(Schema.Defect())
}) {
  /**
   * Marks this value as a persisted queue error for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [ErrorTypeId]: ErrorTypeId = ErrorTypeId
}

// Local per-queue state shared between offer, take, and the mailbox lookup in
// the Redis and SQL stores: take records maxAttempts here before the mailbox
// is created, and offer opens the nudge latch so local pollers skip the poll
// interval.
type QueueState = {
  maxAttempts: number
  readonly nudge: Latch.Latch
}

const makeQueueStates = (): {
  readonly peek: (name: string) => QueueState | undefined
  readonly get: (name: string) => QueueState
} => {
  const states = new Map<string, QueueState>()
  return {
    peek: (name) => states.get(name),
    get: (name) => {
      let state = states.get(name)
      if (state === undefined) {
        // the placeholder is overwritten by take before any mailbox reads it,
        // and is kept int32-safe for SQL parameters
        state = { maxAttempts: 2147483647, nudge: Latch.makeUnsafe(false) }
        states.set(name, state)
      }
      return state
    }
  }
}

const makeAckRetrySchedule = (lockExpiration: Duration.Input) =>
  Schedule.min([
    Schedule.exponential(200, 1.5),
    Schedule.spaced(5000)
  ]).pipe(Schedule.upTo({ duration: lockExpiration }))

// Internal signal used by the factory to tell a store that a taken element
// cannot ever be processed (its stored payload fails to decode) and must be
// dead-lettered instead of retried.
class DeadLetter {
  readonly _tag = "~effect/persistence/PersistedQueue/DeadLetter"
  readonly cause: Cause.Cause<unknown>
  constructor(cause: Cause.Cause<unknown>) {
    this.cause = cause
  }
}

const isDeadLetter = (u: unknown): u is DeadLetter =>
  Predicate.isTagged(u, "~effect/persistence/PersistedQueue/DeadLetter")

const deadLetterFromCause = (cause: Cause.Cause<unknown>): DeadLetter | undefined => {
  for (const reason of cause.reasons) {
    if (Cause.isFailReason(reason) && isDeadLetter(reason.error)) {
      return reason.error
    }
  }
  return undefined
}

/**
 * Defines the low-level backing store service used by `PersistedQueue`.
 *
 * **When to use**
 *
 * Use to provide the persistence backend that stores queued elements, scoped
 * takes, retry attempts, and acknowledgements.
 *
 * **Details**
 *
 * The store persists offered elements and returns taken elements in a scope so
 * the finalizer can complete or retry them based on the processing exit.
 *
 * Claiming an element counts an attempt, so the `attempts` returned by `take`
 * is 1-based. When the take scope closes with a success the element is marked
 * completed; a failure retries it according to `retryDelay` or marks it failed
 * once `maxAttempts` is exhausted; an interruption releases it without
 * counting the attempt.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class PersistedQueueStore extends Context.Service<
  PersistedQueueStore,
  {
    readonly offer: (
      options: {
        readonly name: string
        readonly id: string
        readonly element: unknown
        readonly isCustomId: boolean
      }
    ) => Effect.Effect<void, PersistedQueueError>

    readonly take: (options: {
      readonly name: string
      readonly maxAttempts: number
      readonly retryDelay: (attempts: number) => Effect.Effect<Duration.Duration>
    }) => Effect.Effect<
      {
        readonly id: string
        readonly attempts: number
        readonly element: unknown
      },
      PersistedQueueError,
      Scope.Scope
    >

    /**
     * Removes completed elements older than `timeToLive`, together with their
     * de-duplication records. Failed elements are removed only when
     * `failedTimeToLive` is provided.
     */
    readonly cleanup: (options: {
      readonly timeToLive: Duration.Duration
      readonly failedTimeToLive: Duration.Duration | undefined
    }) => Effect.Effect<void, PersistedQueueError>
  }
>()("effect/persistence/PersistedQueue/PersistedQueueStore") {}

/**
 * Provides an in-memory `PersistedQueueStore`.
 *
 * **Details**
 *
 * The store is process-local and volatile; failed takes are requeued with the
 * queue's retry schedule until the configured maximum attempts is reached,
 * after which the element is marked as failed.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerStoreMemory: Layer.Layer<
  PersistedQueueStore
> = Layer.effect(
  PersistedQueueStore,
  Effect.gen(function*() {
    const clock = yield* Clock.Clock
    type Entry = {
      readonly id: string
      readonly element: unknown
      attempts: number
      state: "pending" | "processing" | "completed" | "failed"
      visibleAt: number
      stateChangedAt: number
    }
    const queues = new Map<string, {
      latch: Latch.Latch
      // all entries ever offered, for de-duplication; `pending` holds the
      // deliverable subset so take does not scan the completed backlog
      entries: Map<string, Entry>
      pending: Set<Entry>
    }>()
    const getOrCreateQueue = (name: string) => {
      let queue = queues.get(name)
      if (!queue) {
        queue = {
          latch: Latch.makeUnsafe(false),
          entries: new Map(),
          pending: new Set()
        }
        queues.set(name, queue)
      }
      return queue
    }

    return PersistedQueueStore.of({
      offer: (options) =>
        Effect.sync(() => {
          const now = clock.currentTimeMillisUnsafe()
          const queue = getOrCreateQueue(options.name)
          if (queue.entries.has(options.id)) return
          const entry: Entry = {
            id: options.id,
            element: options.element,
            attempts: 0,
            state: "pending",
            visibleAt: now,
            stateChangedAt: now
          }
          queue.entries.set(options.id, entry)
          queue.pending.add(entry)
          queue.latch.openUnsafe()
        }),
      take: Effect.fnUntraced(function*(options) {
        const queue = getOrCreateQueue(options.name)
        while (true) {
          // close before scanning so a mutation after the scan reopens the latch
          queue.latch.closeUnsafe()
          const now = clock.currentTimeMillisUnsafe()
          let item: Entry | undefined
          let nextVisibleAt = Infinity
          for (const entry of queue.pending) {
            if (entry.attempts >= options.maxAttempts) continue
            if (entry.visibleAt <= now) {
              item = entry
              break
            }
            nextVisibleAt = Math.min(nextVisibleAt, entry.visibleAt)
          }
          if (item === undefined) {
            yield* nextVisibleAt === Infinity
              ? queue.latch.await
              : Effect.race(queue.latch.await, Effect.sleep(Duration.millis(nextVisibleAt - now)))
            continue
          }
          const entry = item
          entry.state = "processing"
          entry.attempts += 1
          queue.pending.delete(entry)
          queue.latch.openUnsafe()
          yield* Effect.addFinalizer(
            Effect.fnUntraced(function*(exit) {
              const now = clock.currentTimeMillisUnsafe()
              if (exit._tag === "Success") {
                entry.state = "completed"
                entry.stateChangedAt = now
                return
              }
              const deadLetter = deadLetterFromCause(exit.cause)
              if (deadLetter !== undefined) {
                entry.state = "failed"
                entry.stateChangedAt = now
                return
              }
              if (Cause.hasInterruptsOnly(exit.cause)) {
                entry.attempts -= 1
              } else if (entry.attempts >= options.maxAttempts) {
                entry.state = "failed"
                entry.stateChangedAt = now
                return
              } else {
                entry.visibleAt = now + Duration.toMillis(yield* options.retryDelay(entry.attempts))
              }
              entry.state = "pending"
              queue.pending.add(entry)
              queue.latch.openUnsafe()
            })
          )
          return { id: entry.id, attempts: entry.attempts, element: entry.element }
        }
      }),
      cleanup: (options) =>
        Effect.sync(() => {
          const now = clock.currentTimeMillisUnsafe()
          const completedCutoff = now - Duration.toMillis(options.timeToLive)
          const failedCutoff = options.failedTimeToLive === undefined
            ? undefined
            : now - Duration.toMillis(options.failedTimeToLive)
          for (const queue of queues.values()) {
            for (const [id, entry] of queue.entries) {
              const cutoff = entry.state === "completed"
                ? completedCutoff
                : entry.state === "failed"
                ? failedCutoff
                : undefined
              if (cutoff !== undefined && entry.stateChangedAt <= cutoff) {
                queue.entries.delete(id)
              }
            }
          }
        })
    })
  })
)

/**
 * Creates a Redis-backed `PersistedQueueStore`.
 *
 * **Details**
 *
 * The store uses Redis lists, hashes, and sorted sets with worker locks,
 * periodically refreshes locks while items are being processed, delays retried
 * items with the queue's retry schedule, and moves exhausted items to a failed
 * queue.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeStoreRedis = Effect.fnUntraced(function*(
  options?: {
    readonly prefix?: string | undefined
    readonly pollInterval?: Duration.Input | undefined
    readonly lockRefreshInterval?: Duration.Input | undefined
    readonly lockExpiration?: Duration.Input | undefined
  }
) {
  const redis = yield* Redis.Redis
  const clock = yield* Clock.Clock

  const pollInterval = Duration.max(
    options?.pollInterval ? Duration.fromInputUnsafe(options.pollInterval) : Duration.seconds(1),
    Duration.millis(1)
  )
  const lockRefreshMillis = Math.max(
    options?.lockRefreshInterval
      ? Duration.toMillis(Duration.fromInputUnsafe(options.lockRefreshInterval))
      : 30_000,
    1
  )
  const lockExpirationMillis = Math.max(
    options?.lockExpiration
      ? Duration.toMillis(Duration.fromInputUnsafe(options.lockExpiration))
      : 90_000,
    1
  )
  const prefix = options?.prefix ?? "effectq:"
  const keyLock = (id: string) => `${prefix}${id}:lock`
  const keysFor = (name: string) => ({
    queue: `${prefix}${name}`,
    pending: `${prefix}${name}:pending`,
    failed: `${prefix}${name}:failed`,
    delayed: `${prefix}${name}:delayed`,
    attempts: `${prefix}${name}:attempts`,
    ids: `${prefix}${name}:ids`
  })
  const workerId = crypto.randomUUID()

  const ackRetrySchedule = makeAckRetrySchedule(lockExpirationMillis)

  type Element = {
    readonly id: string
    readonly element: unknown
    readonly attempts: number
    // the raw wire payload, so requeue and retry do not re-stringify it
    readonly payload: string
  }

  const requeue = redis.eval(requeueRedis)
  const complete = redis.eval(completeRedis)
  const failed = redis.eval(failedRedis)
  const retry = redis.eval(retryRedis)
  const resetQueue = redis.eval(resetQueueRedis)
  const offer = redis.eval(offerRedis)
  const take = redis.eval(takeRedis)
  const expireAll = redis.eval(expireAllRedis)
  const trimFailed = redis.eval(trimFailedRedis)

  const queueStates = makeQueueStates()

  const queues = yield* RcMap.make({
    lookup: Effect.fnUntraced(function*(name: string) {
      const keys = keysFor(name)
      const queue = yield* Queue.make<Element>()
      const takers = MutableRef.make(0)
      const pollLatch = Latch.makeUnsafe()
      const takenLatch = Latch.makeUnsafe()
      const state = queueStates.get(name)

      yield* Effect.addFinalizer(() =>
        Effect.orDie(
          Effect.flatMap(
            Queue.clear(queue),
            (elements) =>
              Effect.forEach(elements, (element) =>
                requeue(
                  keys.queue,
                  keys.pending,
                  keyLock(element.id),
                  keys.attempts,
                  element.id,
                  element.payload
                ), { concurrency: "unbounded", discard: true })
          )
        )
      )

      yield* Effect.suspend(() =>
        resetQueue(
          keys.queue,
          keys.pending,
          keys.attempts,
          keys.failed,
          keys.ids,
          prefix,
          state.maxAttempts,
          clock.currentTimeMillisUnsafe()
        )
      ).pipe(
        Effect.andThen(Effect.sleep(lockRefreshMillis)),
        Effect.forever,
        Effect.forkScoped
      )

      const poll = (size: number) =>
        Effect.suspend(() =>
          take(
            keys.queue,
            keys.pending,
            keys.delayed,
            keys.attempts,
            prefix,
            workerId,
            size,
            lockExpirationMillis,
            clock.currentTimeMillisUnsafe()
          )
        )

      yield* Effect.gen(function*() {
        while (true) {
          yield* pollLatch.await
          yield* Effect.yieldNow
          state.nudge.closeUnsafe()
          const results = takers.current === 0 ? null : yield* poll(takers.current)
          if (results === null || results.length === 0) {
            yield* Effect.race(Effect.sleep(pollInterval), state.nudge.await)
            continue
          }
          takenLatch.closeUnsafe()
          const elements: Array<Element> = []
          for (let i = 0; i < results.length; i += 2) {
            const payload = results[i] as string
            const parsed = JSON.parse(payload)
            elements.push({
              id: parsed.id,
              element: parsed.element,
              attempts: Number(results[i + 1]),
              payload
            })
          }
          yield* Queue.offerAll(queue, elements)
          yield* takenLatch.await
          yield* Effect.yieldNow
        }
      }).pipe(
        Effect.tapCause(Effect.logWarning),
        Effect.sandbox,
        Effect.retry(Schedule.spaced(500)),
        Effect.forkScoped,
        Effect.interruptible
      )

      return { queue, takers, pollLatch, takenLatch } as const
    }),
    idleTimeToLive: Duration.seconds(30)
  })

  const activeLockKeys = new Set<string>()

  yield* Effect.gen(function*() {
    while (true) {
      yield* Effect.sleep(lockRefreshMillis)
      yield* Effect.ignore(expireAll(Array.from(activeLockKeys), lockExpirationMillis))
    }
  }).pipe(
    Effect.forkScoped,
    Effect.interruptible,
    Effect.annotateLogs({
      module: "effect/persistence/PersistedQueue",
      fiber: "refreshLocks"
    })
  )

  const scanKeys = (pattern: string) =>
    Effect.gen(function*() {
      const keys: Array<string> = []
      let cursor = "0"
      do {
        const [next, batch] = yield* redis.send<[string, Array<string>]>(
          "SCAN",
          cursor,
          "MATCH",
          pattern,
          "COUNT",
          "100"
        )
        cursor = next
        for (const key of batch) keys.push(key)
      } while (cursor !== "0")
      return keys
    })

  return PersistedQueueStore.of({
    offer: ({ element, id, isCustomId, name }) => {
      const keys = keysFor(name)
      const payload = JSON.stringify({ id, element })
      return (isCustomId
        ? offer(keys.queue, keys.ids, id, payload)
        : redis.send("RPUSH", keys.queue, payload)).pipe(
          Effect.mapError(({ cause }) =>
            new PersistedQueueError({
              message: "Failed to offer element to persisted queue",
              cause
            })
          ),
          Effect.tap(() =>
            Effect.sync(() => {
              queueStates.peek(name)?.nudge.openUnsafe()
            })
          )
        )
    },
    take: (options) =>
      Effect.uninterruptibleMask((restore) => {
        queueStates.get(options.name).maxAttempts = options.maxAttempts
        return RcMap.get(queues, options.name).pipe(
          Effect.flatMap(({ pollLatch, queue, takenLatch, takers }) => {
            takers.current++
            if (takers.current === 1) {
              pollLatch.openUnsafe()
            }
            // onExit so the decrement also runs when a waiting take is
            // interrupted, otherwise the poller keeps fetching for a phantom
            // taker
            return Effect.onExit(restore(Queue.take(queue)), () =>
              Effect.sync(() => {
                takers.current--
                if (takers.current === 0) {
                  pollLatch.closeUnsafe()
                  takenLatch.openUnsafe()
                } else if (Queue.sizeUnsafe(queue) === 0) {
                  takenLatch.openUnsafe()
                }
              }))
          }),
          Effect.scoped,
          Effect.tap((element) => {
            const keys = keysFor(options.name)
            const lock = keyLock(element.id)
            activeLockKeys.add(lock)
            const ack = (effect: Effect.Effect<unknown, Redis.RedisError>) =>
              effect.pipe(
                Effect.retry(ackRetrySchedule),
                Effect.orDie,
                Effect.ensuring(Effect.sync(() => activeLockKeys.delete(lock)))
              )
            return Effect.addFinalizer((exit) =>
              Effect.suspend(() => {
                const now = clock.currentTimeMillisUnsafe()
                if (exit._tag === "Success") {
                  return ack(complete(keys.pending, lock, keys.attempts, keys.ids, element.id, now))
                }
                const dead = deadLetterFromCause(exit.cause)
                const failElement = (cause: Cause.Cause<unknown>) =>
                  ack(failed(
                    keys.pending,
                    lock,
                    keys.failed,
                    keys.attempts,
                    keys.ids,
                    element.id,
                    JSON.stringify({
                      id: element.id,
                      element: element.element,
                      attempts: element.attempts,
                      lastFailure: Cause.pretty(cause),
                      failedAt: now
                    })
                  ))
                if (dead !== undefined) {
                  return failElement(dead.cause)
                }
                if (Cause.hasInterruptsOnly(exit.cause)) {
                  return ack(requeue(keys.queue, keys.pending, lock, keys.attempts, element.id, element.payload))
                }
                if (element.attempts >= options.maxAttempts) {
                  return failElement(exit.cause)
                }
                return Effect.flatMap(options.retryDelay(element.attempts), (delay) =>
                  ack(retry(
                    keys.pending,
                    lock,
                    keys.delayed,
                    element.id,
                    element.payload,
                    now + Duration.toMillis(delay)
                  )))
              })
            )
          })
        )
      }),
    cleanup: ({ failedTimeToLive, timeToLive }) =>
      Effect.gen(function*() {
        const now = clock.currentTimeMillisUnsafe()
        const idsKeys = yield* scanKeys(`${prefix}*:ids`)
        const cutoff = now - Duration.toMillis(timeToLive)
        yield* Effect.forEach(
          idsKeys,
          (key) => redis.send("ZREMRANGEBYSCORE", key, "-inf", `(${cutoff}`),
          { concurrency: 16, discard: true }
        )
        if (failedTimeToLive !== undefined) {
          const failedCutoff = now - Duration.toMillis(failedTimeToLive)
          const failedKeys = yield* scanKeys(`${prefix}*:failed`)
          yield* Effect.forEach(
            failedKeys,
            (key) =>
              trimFailed(key, `${key.slice(0, -":failed".length)}:ids`, failedCutoff).pipe(
                // each call trims at most one batch, so drain until done
                Effect.repeat({ while: (removed) => removed >= trimFailedBatchSize })
              ),
            { concurrency: 16, discard: true }
          )
        }
      }).pipe(
        Effect.mapError(({ cause }) =>
          new PersistedQueueError({
            message: "Failed to clean up persisted queue",
            cause
          })
        )
      )
  })
})

const offerRedis = Redis.script(
  (...args: [keyQueue: string, keyIds: string, id: string, payload: string]) => args,
  {
    lua: `
local key_queue = KEYS[1]
local key_ids = KEYS[2]
local id = ARGV[1]
local payload = ARGV[2]

-- park the dedupe entry outside the timeToLive trim range until the element
-- completes, so unprocessed elements never lose dedupe protection
local result = redis.call("ZADD", key_ids, "NX", "+inf", id)
if result == 1 then
  redis.call("RPUSH", key_queue, payload)
end
`,
    numberOfKeys: 2
  }
)

const resetQueueRedis = Redis.script(
  (
    ...args: [
      keyQueue: string,
      keyPending: string,
      keyAttempts: string,
      keyFailed: string,
      keyIds: string,
      prefix: string,
      maxAttempts: number,
      now: number
    ]
  ) => args,
  {
    lua: `
local key_queue = KEYS[1]
local key_pending = KEYS[2]
local key_attempts = KEYS[3]
local key_failed = KEYS[4]
local key_ids = KEYS[5]
local prefix = ARGV[1]
local max_attempts = tonumber(ARGV[2])
local now = ARGV[3]

local entries = redis.call("HGETALL", key_pending)
for i = 1, #entries, 2 do
  local id = entries[i]
  local payload = entries[i + 1]
  local lock_key = prefix .. id .. ":lock"
  local exists = redis.call("EXISTS", lock_key)
  if exists == 0 then
    local attempts = tonumber(redis.call("HGET", key_attempts, id) or "0")
    if attempts >= max_attempts then
      -- compose the failed record by hand so the element payload does not go
      -- through a lossy cjson round-trip
      local record = string.sub(payload, 1, -2) .. ',"attempts":' .. attempts ..
        ',"lastFailure":"Lock expired after final attempt","failedAt":' .. now .. '}'
      redis.call("RPUSH", key_failed, record)
      redis.call("HDEL", key_attempts, id)
      -- failed ids keep their dedupe entry until failedTimeToLive removes the
      -- dead-letter record, so park them outside the timeToLive trim range
      redis.call("ZADD", key_ids, "XX", "+inf", id)
    else
      redis.call("RPUSH", key_queue, payload)
    end
    redis.call("HDEL", key_pending, id)
  end
end
`,
    numberOfKeys: 5
  }
)

const requeueRedis = Redis.script(
  (
    ...args: [keyQueue: string, keyPending: string, keyLock: string, keyAttempts: string, id: string, payload: string]
  ) => args,
  {
    lua: `
local key_queue = KEYS[1]
local key_pending = KEYS[2]
local key_lock = KEYS[3]
local key_attempts = KEYS[4]
local id = ARGV[1]
local payload = ARGV[2]

redis.call("DEL", key_lock)
redis.call("HDEL", key_pending, id)
local attempts = redis.call("HINCRBY", key_attempts, id, -1)
if attempts <= 0 then
  redis.call("HDEL", key_attempts, id)
end
redis.call("RPUSH", key_queue, payload)
`,
    numberOfKeys: 4
  }
)

const completeRedis = Redis.script(
  (...args: [keyPending: string, keyLock: string, keyAttempts: string, keyIds: string, id: string, now: number]) =>
    args,
  {
    lua: `
local key_pending = KEYS[1]
local key_lock = KEYS[2]
local key_attempts = KEYS[3]
local key_ids = KEYS[4]
local id = ARGV[1]
local now = ARGV[2]

redis.call("DEL", key_lock)
redis.call("HDEL", key_pending, id)
redis.call("HDEL", key_attempts, id)
redis.call("ZADD", key_ids, "XX", now, id)
`,
    numberOfKeys: 4
  }
)

const retryRedis = Redis.script(
  (
    ...args: [keyPending: string, keyLock: string, keyDelayed: string, id: string, payload: string, visibleAt: number]
  ) => args,
  {
    lua: `
local key_pending = KEYS[1]
local key_lock = KEYS[2]
local key_delayed = KEYS[3]
local id = ARGV[1]
local payload = ARGV[2]
local visible_at = ARGV[3]

redis.call("DEL", key_lock)
redis.call("HDEL", key_pending, id)
redis.call("ZADD", key_delayed, visible_at, payload)
`,
    numberOfKeys: 3
  }
)

const failedRedis = Redis.script(
  (
    ...args: [
      keyPending: string,
      keyLock: string,
      keyFailed: string,
      keyAttempts: string,
      keyIds: string,
      id: string,
      payload: string
    ]
  ) => args,
  {
    lua: `
local key_pending = KEYS[1]
local key_lock = KEYS[2]
local key_failed = KEYS[3]
local key_attempts = KEYS[4]
local key_ids = KEYS[5]
local id = ARGV[1]
local payload = ARGV[2]

redis.call("DEL", key_lock)
redis.call("HDEL", key_pending, id)
redis.call("HDEL", key_attempts, id)
redis.call("RPUSH", key_failed, payload)
-- failed ids keep their dedupe entry until failedTimeToLive removes the
-- dead-letter record, so park them outside the timeToLive trim range
redis.call("ZADD", key_ids, "XX", "+inf", id)
`,
    numberOfKeys: 5
  }
)

const takeRedis = Redis.script(
  (
    ...args: [
      keyQueue: string,
      keyPending: string,
      keyDelayed: string,
      keyAttempts: string,
      prefix: string,
      workerId: string,
      batchSize: number,
      pttl: number,
      now: number
    ]
  ) => args,
  {
    lua: `
local key_queue = KEYS[1]
local key_pending = KEYS[2]
local key_delayed = KEYS[3]
local key_attempts = KEYS[4]
local prefix = ARGV[1]
local worker_id = ARGV[2]
local batch_size = tonumber(ARGV[3])
local pttl = ARGV[4]
local now = ARGV[5]

local due = redis.call("ZRANGEBYSCORE", key_delayed, "-inf", now, "LIMIT", 0, 100)
if #due > 0 then
  for i, payload in ipairs(due) do
    redis.call("RPUSH", key_queue, payload)
  end
  redis.call("ZREM", key_delayed, unpack(due))
end

local payloads = redis.call("LPOP", key_queue, batch_size)
if not payloads then
  return nil
end

local result = {}
for i, payload in ipairs(payloads) do
  local id = cjson.decode(payload).id
  local key_lock = prefix .. id .. ":lock"
  redis.call("SET", key_lock, worker_id, "PX", pttl)
  redis.call("HSET", key_pending, id, payload)
  local attempts = redis.call("HINCRBY", key_attempts, id, 1)
  result[i * 2 - 1] = payload
  result[i * 2] = attempts
end

return result
`,
    numberOfKeys: 4
  }
).withReturnType<ReadonlyArray<string | number> | null>()

const expireAllRedis = Redis.script(
  (keys: ReadonlyArray<string>, ttl: number) => [...keys, ttl],
  {
    numberOfKeys: (keys) => keys.length,
    lua: `
local ttl = ARGV[1]
for i, key in ipairs(KEYS) do
  redis.call("PEXPIRE", key, ttl)
end
`
  }
)

const trimFailedBatchSize = 1000

const trimFailedRedis = Redis.script(
  (...args: [keyFailed: string, keyIds: string, cutoff: number]) => args,
  {
    lua: `
local key_failed = KEYS[1]
local key_ids = KEYS[2]
local cutoff = tonumber(ARGV[1])
local removed = 0

while removed < ${trimFailedBatchSize} do
  local head = redis.call("LINDEX", key_failed, 0)
  if not head then break end
  local ok, decoded = pcall(cjson.decode, head)
  if ok then
    local failed_at = tonumber(decoded.failedAt)
    if failed_at ~= nil and failed_at >= cutoff then break end
    redis.call("LPOP", key_failed)
    if decoded.id ~= nil then
      redis.call("ZREM", key_ids, decoded.id)
    end
  else
    -- a corrupt head would otherwise block trimming of the whole list
    redis.call("LPOP", key_failed)
  end
  removed = removed + 1
end

return removed
`,
    numberOfKeys: 2
  }
).withReturnType<number>()

/**
 * Provides a Redis-backed `PersistedQueueStore` using `makeStoreRedis`.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerStoreRedis: (
  options?: {
    readonly prefix?: string | undefined
    readonly pollInterval?: Duration.Input | undefined
    readonly lockRefreshInterval?: Duration.Input | undefined
    readonly lockExpiration?: Duration.Input | undefined
  } | undefined
) => Layer.Layer<
  PersistedQueueStore,
  never,
  Redis.Redis
> = flow(makeStoreRedis, Layer.effect(PersistedQueueStore))

/**
 * Creates a SQL-backed `PersistedQueueStore`.
 *
 * **Details**
 *
 * The store creates the queue table and indexes, acquires rows with
 * per-worker locks, refreshes active locks while scoped takes are running, and
 * retries or completes rows according to the processing exit.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeStoreSql: (
  options?: {
    readonly tableName?: string | undefined
    readonly pollInterval?: Duration.Input | undefined
    readonly lockRefreshInterval?: Duration.Input | undefined
    readonly lockExpiration?: Duration.Input | undefined
  } | undefined
) => Effect.Effect<
  PersistedQueueStore["Service"],
  SqlError,
  SqlClient.SqlClient | Scope.Scope
> = Effect.fnUntraced(function*(options) {
  const sql = (yield* SqlClient.SqlClient).withoutTransforms()
  const tableName = options?.tableName ?? "effect_queue"
  const tableNameSql = sql(tableName)
  const pollInterval = Duration.max(
    options?.pollInterval ? Duration.fromInputUnsafe(options.pollInterval) : Duration.millis(1000),
    Duration.millis(1)
  )
  const lockRefreshInterval = Duration.max(
    options?.lockRefreshInterval ? Duration.fromInputUnsafe(options.lockRefreshInterval) : Duration.seconds(30),
    Duration.millis(1)
  )
  const lockExpiration = Duration.max(
    options?.lockExpiration ? Duration.fromInputUnsafe(options.lockExpiration) : Duration.minutes(2),
    Duration.millis(1)
  )
  const workerId = crypto.randomUUID()

  const ackRetrySchedule = makeAckRetrySchedule(lockExpiration)

  yield* Effect.orDie(
    Migrator.make({})({
      loader: sqlMigrations(tableName),
      table: `${tableName}_migrations`
    })
  )

  const sqlNow = sql.onDialectOrElse({
    // GETDATE() rounds to 1/300s and can land in the future, hiding freshly
    // written visible_at values from the poll query
    mssql: () => sql.literal("SYSDATETIME()"),
    mysql: () => sql.literal("NOW()"),
    pg: () => sql.literal("NOW()"),
    // sqlite
    orElse: () => sql.literal("CURRENT_TIMESTAMP")
  })

  // `seconds` is a whole number, possibly negative
  const secondsOffset = (seconds: number) => {
    const s = sql.literal(seconds.toString())
    return sql.onDialectOrElse({
      pg: () => sql`${sqlNow} + INTERVAL '${s} seconds'`,
      mysql: () => sql`DATE_ADD(${sqlNow}, INTERVAL ${s} SECOND)`,
      mssql: () => sql`DATEADD(SECOND, ${s}, ${sqlNow})`,
      orElse: () => sql`datetime(${sqlNow}, '${s} seconds')`
    })
  }
  const secondsAgo = (seconds: number) => secondsOffset(-Math.max(Math.ceil(seconds), 0))
  const secondsFromNow = (seconds: number) => secondsOffset(Math.max(Math.ceil(seconds), 0))
  const expiresAt = secondsAgo(Duration.toSeconds(lockExpiration))

  const offer = sql.onDialectOrElse({
    pg: () => (id: string, name: string, element: string) =>
      sql`
        INSERT INTO ${tableNameSql} (id, queue_name, element, state, attempts, visible_at, created_at, updated_at)
        VALUES (${id}, ${name}, ${element}, 'pending', 0, ${sqlNow}, ${sqlNow}, ${sqlNow})
        ON CONFLICT (id, queue_name) DO NOTHING
      `,
    mysql: () => (id: string, name: string, element: string) =>
      sql`
        INSERT IGNORE INTO ${tableNameSql} (id, queue_name, element, state, attempts, visible_at, created_at, updated_at)
        VALUES (${id}, ${name}, ${element}, 'pending', 0, ${sqlNow}, ${sqlNow}, ${sqlNow})
      `,
    mssql: () => (id: string, name: string, element: string) =>
      sql`
        MERGE ${tableNameSql} WITH (HOLDLOCK) AS target
        USING (SELECT ${id} AS id, ${name} AS queue_name) AS source
        ON target.id = source.id AND target.queue_name = source.queue_name
        WHEN NOT MATCHED THEN
          INSERT (id, queue_name, element, state, attempts, visible_at, created_at, updated_at)
          VALUES (source.id, source.queue_name, ${element}, 'pending', 0, ${sqlNow}, ${sqlNow}, ${sqlNow});
      `,
    // sqlite
    orElse: () => (id: string, name: string, element: string) =>
      sql`
        INSERT OR IGNORE INTO ${tableNameSql} (id, queue_name, element, state, attempts, visible_at, created_at, updated_at)
        VALUES (${id}, ${name}, ${element}, 'pending', 0, ${sqlNow}, ${sqlNow}, ${sqlNow})
      `
  })

  const wrapString = sql.onDialectOrElse({
    mssql: () => (s: string) => `N'${s}'`,
    orElse: () => (s: string) => `'${s}'`
  })
  const stringLiteral = (s: string) => sql.literal(wrapString(s))

  const workerIdSql = stringLiteral(workerId)
  const elementIds = new Set<number | string>()
  const refreshLocks: Effect.Effect<void, SqlError> = Effect.suspend((): Effect.Effect<void, SqlError> => {
    if (elementIds.size === 0) return Effect.void
    const ids = Array.from(elementIds)
    return sql`
      UPDATE ${tableNameSql}
      SET acquired_at = ${sqlNow}
      WHERE sequence IN (${sql.literal(ids.join(","))})
      AND acquired_by = ${workerIdSql}
    `
  })
  const ack = (
    statement: Effect.Effect<unknown, SqlError>,
    sequences: ReadonlyArray<number | string>
  ): Effect.Effect<void> =>
    statement.pipe(
      Effect.retry(ackRetrySchedule),
      Effect.orDie,
      Effect.ensuring(Effect.sync(() => {
        for (const sequence of sequences) {
          elementIds.delete(sequence)
        }
      })),
      Effect.asVoid
    )
  const complete = (sequence: number | string) =>
    ack(
      sql`
        UPDATE ${tableNameSql}
        SET acquired_at = NULL, acquired_by = NULL, updated_at = ${sqlNow}, state = 'completed'
        WHERE sequence = ${sequence}
        AND acquired_by = ${workerIdSql}
      `,
      [sequence]
    )
  const fail = (sequence: number | string, cause: Cause.Cause<any>) =>
    ack(
      sql`
        UPDATE ${tableNameSql}
        SET acquired_at = NULL, acquired_by = NULL, updated_at = ${sqlNow}, state = 'failed', last_failure = ${
        Cause.pretty(cause)
      }
        WHERE sequence = ${sequence}
        AND acquired_by = ${workerIdSql}
      `,
      [sequence]
    )
  const retry = (sequence: number | string, delay: Duration.Duration, cause: Cause.Cause<any>) =>
    ack(
      sql`
        UPDATE ${tableNameSql}
        SET acquired_at = NULL, acquired_by = NULL, updated_at = ${sqlNow}, visible_at = ${
        secondsFromNow(Duration.toSeconds(delay))
      }, last_failure = ${Cause.pretty(cause)}
        WHERE sequence = ${sequence}
        AND acquired_by = ${workerIdSql}
      `,
      [sequence]
    )
  const interrupt = (ids: Array<number | string>) =>
    ack(
      sql`
        UPDATE ${tableNameSql}
        SET acquired_at = NULL, acquired_by = NULL, attempts = attempts - 1
        WHERE sequence IN (${sql.literal(ids.join(","))})
        AND acquired_by = ${workerIdSql}
      `,
      ids
    )

  yield* refreshLocks.pipe(
    Effect.tapCause(Effect.logWarning),
    Effect.retry(Schedule.spaced(500)),
    Effect.schedule(Schedule.fixed(lockRefreshInterval)),
    Effect.annotateLogs({
      package: "@effect/sql",
      module: "SqlPersistedQueue",
      fiber: "refreshLocks"
    }),
    Effect.forkScoped
  )

  type Element = {
    readonly id: string
    readonly sequence: number | string
    readonly element: string
    attempts: number
  }
  const queueStates = makeQueueStates()
  const mailboxes = yield* RcMap.make({
    lookup: Effect.fnUntraced(function*(name: string) {
      const state = queueStates.get(name)
      const maxAttempts = state.maxAttempts
      const queue = yield* Queue.make<Element>()
      const takers = MutableRef.make(0)
      const pollLatch = Latch.makeUnsafe()
      const takenLatch = Latch.makeUnsafe()
      const nudge = state.nudge

      yield* Effect.addFinalizer(() =>
        Effect.flatMap(Queue.clear(queue), (elements) => {
          if (elements.length === 0) return Effect.void
          return interrupt(Array.from(elements, (e) => e.sequence))
        })
      )

      // flip exhausted rows whose lock expired (worker crashed on the final
      // attempt) to failed, since no finalizer will ever run for them
      yield* sql`
        UPDATE ${tableNameSql}
        SET state = 'failed', acquired_at = NULL, acquired_by = NULL, updated_at = ${sqlNow},
          last_failure = COALESCE(last_failure, 'Lock expired after final attempt')
        WHERE queue_name = ${name}
        AND state = 'pending'
        AND attempts >= ${maxAttempts}
        AND (acquired_at IS NULL OR acquired_at < ${expiresAt})
      `.pipe(
        Effect.tapCause(Effect.logWarning),
        Effect.ignore,
        Effect.schedule(Schedule.spaced(lockRefreshInterval)),
        Effect.forkScoped,
        Effect.interruptible
      )

      const poll = sql.onDialectOrElse({
        pg: () => (size: number) =>
          sql<Element>`
            WITH cte AS (
              UPDATE ${tableNameSql}
              SET acquired_at = ${sqlNow}, acquired_by = ${workerIdSql}, attempts = attempts + 1
              WHERE sequence IN (
                SELECT sequence FROM ${tableNameSql}
                WHERE queue_name = ${name}
                AND state = 'pending'
                AND attempts < ${maxAttempts}
                AND visible_at <= ${sqlNow}
                AND (acquired_at IS NULL OR acquired_at < ${expiresAt})
                ORDER BY visible_at ASC, sequence ASC
                FOR UPDATE SKIP LOCKED
                LIMIT ${sql.literal(size.toString())}
              )
              RETURNING sequence, id, element, attempts, visible_at
            )
            SELECT sequence, id, element, attempts FROM cte
            ORDER BY visible_at ASC, sequence ASC
          `,
        mysql: () => (size: number) =>
          sql<Element>`
            SELECT sequence, id, element, attempts FROM ${tableNameSql} q
            WHERE queue_name = ${name}
            AND state = 'pending'
            AND attempts < ${maxAttempts}
            AND visible_at <= ${sqlNow}
            AND (acquired_at IS NULL OR acquired_at < ${expiresAt})
            ORDER BY visible_at ASC, sequence ASC
            LIMIT ${sql.literal(size.toString())}
            FOR UPDATE SKIP LOCKED
          `.pipe(
            Effect.tap((rows) => {
              if (rows.length === 0) return Effect.void
              return sql`
                UPDATE ${tableNameSql}
                SET acquired_at = ${sqlNow}, acquired_by = ${workerIdSql}, attempts = attempts + 1
                WHERE sequence IN (${sql.literal(rows.map((r) => r.sequence).join(","))})
              `.unprepared
            }),
            Effect.map((rows) => {
              for (const row of rows) {
                row.attempts = Number(row.attempts) + 1
              }
              return rows
            }),
            sql.withTransaction
          ),
        mssql: () => (size: number) =>
          sql<Element>`
            WITH cte AS (
              SELECT TOP ${sql.literal(size.toString())} sequence FROM ${tableNameSql}
              WHERE queue_name = ${name}
              AND state = 'pending'
              AND attempts < ${maxAttempts}
              AND visible_at <= ${sqlNow}
              AND (acquired_at IS NULL OR acquired_at < ${expiresAt})
              ORDER BY visible_at ASC, sequence ASC
            )
            UPDATE q
            SET acquired_at = ${sqlNow}, acquired_by = ${workerIdSql}, attempts = q.attempts + 1
            OUTPUT inserted.sequence, inserted.id, inserted.element, inserted.attempts
            FROM ${tableNameSql} AS q
            INNER JOIN cte ON q.sequence = cte.sequence
          `,
        // sqlite
        orElse: () => (size: number) =>
          sql<Element>`
            UPDATE ${tableNameSql}
            SET acquired_at = ${sqlNow}, acquired_by = ${workerIdSql}, attempts = attempts + 1
            WHERE sequence IN (
              SELECT sequence FROM ${tableNameSql}
              WHERE queue_name = ${name}
              AND state = 'pending'
              AND attempts < ${maxAttempts}
              AND visible_at <= ${sqlNow}
              AND (acquired_at IS NULL OR acquired_at < ${expiresAt})
              ORDER BY visible_at ASC, sequence ASC
              LIMIT ${sql.literal(size.toString())}
            )
            RETURNING sequence, id, element, attempts
          `
      })

      yield* Effect.gen(function*() {
        while (true) {
          yield* pollLatch.await
          yield* Effect.yieldNow
          nudge.closeUnsafe()
          const results = takers.current === 0 ? [] : yield* poll(takers.current)
          if (results.length === 0) {
            yield* Effect.race(Effect.sleep(pollInterval), nudge.await)
            continue
          }
          takenLatch.closeUnsafe()
          for (const row of results) {
            row.attempts = Number(row.attempts)
            elementIds.add(row.sequence)
          }
          yield* Queue.offerAll(queue, results)
          yield* takenLatch.await
          yield* Effect.yieldNow
        }
      }).pipe(
        Effect.tapCause(Effect.logWarning),
        Effect.sandbox,
        Effect.retry(Schedule.spaced(500)),
        Effect.forkScoped
      )

      return { queue, takers, pollLatch, takenLatch } as const
    }),
    idleTimeToLive: Duration.seconds(30)
  })

  const cleanupBatch = sql.onDialectOrElse({
    pg: () => (state: string, seconds: number) =>
      sql<{ readonly count: number }>`
        WITH deleted_entries AS (
          DELETE FROM ${tableNameSql}
          WHERE sequence IN (
            SELECT sequence FROM ${tableNameSql}
            WHERE state = ${state} AND updated_at <= ${secondsAgo(seconds)}
            LIMIT ${sql.literal(String(sqlCleanupBatchSize))}
          )
          RETURNING 1
        )
        SELECT COUNT(*)::INT AS count FROM deleted_entries
      `.pipe(Effect.map((rows) => rows[0].count)),
    mysql: () =>
      Effect.fnUntraced(
        function*(state: string, seconds: number) {
          const connection = yield* sql.reserve
          const [statement, parameters] = sql`
            DELETE FROM ${tableNameSql}
            WHERE state = ${state} AND updated_at <= ${secondsAgo(seconds)}
            LIMIT ${sql.literal(String(sqlCleanupBatchSize))}
          `.compile()
          yield* connection.execute(statement, parameters, undefined)
          const rows = yield* connection.executeValues("SELECT ROW_COUNT()", [])
          return Number(rows[0][0])
        },
        Effect.scoped
      ),
    mssql: () => (state: string, seconds: number) =>
      sql<{ readonly sequence: number }>`
        DELETE TOP (${sql.literal(String(sqlCleanupBatchSize))}) FROM ${tableNameSql}
        OUTPUT DELETED.sequence
        WHERE state = ${state} AND updated_at <= ${secondsAgo(seconds)}
      `.pipe(Effect.map((rows) => rows.length)),
    // sqlite
    orElse: () => (state: string, seconds: number) =>
      sql<{ readonly deleted: number }>`
        DELETE FROM ${tableNameSql}
        WHERE sequence IN (
          SELECT sequence FROM ${tableNameSql}
          WHERE state = ${state} AND updated_at <= ${secondsAgo(seconds)}
          LIMIT ${sql.literal(String(sqlCleanupBatchSize))}
        )
        RETURNING 1 AS deleted
      `.pipe(Effect.map((rows) => rows.length))
  })

  const cleanupState = (state: string, timeToLive: Duration.Duration) =>
    cleanupBatch(state, Duration.toSeconds(timeToLive)).pipe(
      Effect.repeat({
        while: (deletedCount) => deletedCount === sqlCleanupBatchSize,
        schedule: Schedule.spaced(Duration.millis(10))
      })
    )

  return PersistedQueueStore.of({
    offer: ({ element, id, name }) =>
      Effect.catchCause(Effect.suspend(() => offer(id, name, JSON.stringify(element))), (cause) =>
        Effect.fail(
          new PersistedQueueError({
            message: "Failed to offer element to persisted queue",
            cause
          })
        )).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              queueStates.peek(name)?.nudge.openUnsafe()
            })
          )
        ),
    take: (options) => {
      queueStates.get(options.name).maxAttempts = options.maxAttempts
      const loop: Effect.Effect<
        {
          readonly id: string
          readonly attempts: number
          readonly element: unknown
        },
        PersistedQueueError,
        Scope.Scope
      > = Effect.uninterruptibleMask((restore) =>
        RcMap.get(mailboxes, options.name).pipe(
          Effect.flatMap(({ pollLatch, queue, takenLatch, takers }) => {
            takers.current++
            if (takers.current === 1) {
              pollLatch.openUnsafe()
            }
            // onExit so the decrement also runs when a waiting take is
            // interrupted, otherwise the poller keeps fetching for a phantom
            // taker
            return Effect.onExit(restore(Queue.take(queue)), () =>
              Effect.sync(() => {
                takers.current--
                if (takers.current === 0) {
                  pollLatch.closeUnsafe()
                  takenLatch.openUnsafe()
                } else if (Queue.sizeUnsafe(queue) === 0) {
                  takenLatch.openUnsafe()
                }
              }))
          }),
          Effect.scoped,
          restore,
          Effect.flatMap((element) => {
            let parsed: unknown
            try {
              parsed = JSON.parse(element.element)
            } catch (defect) {
              // a row that cannot be parsed will never succeed, so dead-letter
              // it and take the next element
              return Effect.andThen(fail(element.sequence, Cause.die(defect)), loop)
            }
            return Effect.as(
              Effect.addFinalizer((exit) => {
                if (exit._tag === "Success") {
                  return complete(element.sequence)
                }
                const dead = deadLetterFromCause(exit.cause)
                if (dead !== undefined) {
                  return fail(element.sequence, dead.cause)
                }
                if (Cause.hasInterruptsOnly(exit.cause)) {
                  return interrupt([element.sequence])
                }
                if (element.attempts >= options.maxAttempts) {
                  return fail(element.sequence, exit.cause)
                }
                return Effect.flatMap(
                  options.retryDelay(element.attempts),
                  (delay) => retry(element.sequence, delay, exit.cause)
                )
              }),
              { id: element.id, attempts: element.attempts, element: parsed }
            )
          })
        )
      )
      return loop
    },
    cleanup: ({ failedTimeToLive, timeToLive }) =>
      Effect.gen(function*() {
        yield* cleanupState("completed", timeToLive)
        if (failedTimeToLive !== undefined) {
          yield* cleanupState("failed", failedTimeToLive)
        }
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.fail(
            new PersistedQueueError({
              message: "Failed to clean up persisted queue",
              cause
            })
          )
        )
      )
  })
})

const sqlMigrations = (tableName: string) =>
  Migrator.fromRecord({
    "0001_create_table": Effect.gen(function*() {
      const sql = (yield* SqlClient.SqlClient).withoutTransforms()
      const tableNameSql = sql(tableName)

      yield* sql.onDialectOrElse({
        mysql: () =>
          sql`CREATE TABLE IF NOT EXISTS ${tableNameSql} (
            sequence BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            id VARCHAR(36) NOT NULL,
            queue_name VARCHAR(100) NOT NULL,
            element TEXT NOT NULL,
            completed BOOLEAN NOT NULL,
            attempts INT NOT NULL DEFAULT 0,
            last_failure TEXT NULL,
            acquired_at DATETIME NULL,
            acquired_by VARCHAR(36) NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL
          )`,
        pg: () =>
          sql`CREATE TABLE IF NOT EXISTS ${tableNameSql} (
            sequence SERIAL PRIMARY KEY,
            id VARCHAR(36) NOT NULL,
            queue_name VARCHAR(100) NOT NULL,
            element TEXT NOT NULL,
            completed BOOLEAN NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0,
            last_failure TEXT NULL,
            acquired_at TIMESTAMP NULL,
            acquired_by UUID NULL,
            created_at TIMESTAMP NOT NULL,
            updated_at TIMESTAMP NOT NULL
          )`,
        mssql: () =>
          sql`IF NOT EXISTS (SELECT * FROM sysobjects WHERE name=${tableName} AND xtype='U')
          CREATE TABLE ${tableNameSql} (
            sequence INT IDENTITY(1,1) PRIMARY KEY,
            id NVARCHAR(36) NOT NULL,
            queue_name NVARCHAR(100) NOT NULL,
            element NVARCHAR(MAX) NOT NULL,
            completed BIT NOT NULL,
            attempts INT NOT NULL DEFAULT 0,
            last_failure NVARCHAR(MAX) NULL,
            acquired_at DATETIME2 NULL,
            acquired_by UNIQUEIDENTIFIER NULL,
            created_at DATETIME2 NOT NULL,
            updated_at DATETIME2 NOT NULL
          )`,
        // sqlite
        orElse: () =>
          sql`CREATE TABLE IF NOT EXISTS ${tableNameSql} (
            sequence INTEGER PRIMARY KEY AUTOINCREMENT,
            id TEXT NOT NULL,
            queue_name TEXT NOT NULL,
            element TEXT NOT NULL,
            completed BOOLEAN NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0,
            last_failure TEXT NULL,
            acquired_at DATETIME NULL,
            acquired_by TEXT NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL
          )`
      })

      yield* sql.onDialectOrElse({
        mssql: () =>
          sql`IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = N'idx_${tableName}_id')
            CREATE UNIQUE INDEX ${sql(`idx_${tableName}_id`)} ON ${tableNameSql} (id, queue_name)`,
        mysql: () =>
          sql`CREATE UNIQUE INDEX ${sql(`idx_${tableName}_id`)} ON ${tableNameSql} (id, queue_name)`.pipe(
            Effect.ignore
          ),
        orElse: () =>
          sql`CREATE UNIQUE INDEX IF NOT EXISTS ${sql(`idx_${tableName}_id`)} ON ${tableNameSql} (id, queue_name)`
      })

      yield* sql.onDialectOrElse({
        mssql: () =>
          sql`IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = N'idx_${tableName}_take')
            CREATE INDEX ${
            sql(`idx_${tableName}_take`)
          } ON ${tableNameSql} (queue_name, completed, attempts, acquired_at)`,
        mysql: () =>
          sql`CREATE INDEX ${
            sql(`idx_${tableName}_take`)
          } ON ${tableNameSql} (queue_name, completed, attempts, acquired_at)`
            .pipe(Effect.ignore),
        orElse: () =>
          sql`CREATE INDEX IF NOT EXISTS ${
            sql(`idx_${tableName}_take`)
          } ON ${tableNameSql} (queue_name, completed, attempts, acquired_at)`
      })

      yield* sql.onDialectOrElse({
        mssql: () =>
          sql`IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = N'idx_${tableName}_update')
            CREATE INDEX ${sql(`idx_${tableName}_update`)} ON ${tableNameSql} (sequence, acquired_by)`,
        mysql: () =>
          sql`CREATE INDEX ${sql(`idx_${tableName}_update`)} ON ${tableNameSql} (sequence, acquired_by)`.pipe(
            Effect.ignore
          ),
        orElse: () =>
          sql`CREATE INDEX IF NOT EXISTS ${sql(`idx_${tableName}_update`)} ON ${tableNameSql} (sequence, acquired_by)`
      })
    }),
    "0002_upgrade_schema": Effect.gen(function*() {
      const sql = (yield* SqlClient.SqlClient).withoutTransforms()
      const tableNameSql = sql(tableName)
      const takeIndex = sql(`idx_${tableName}_take`)

      yield* sql.onDialectOrElse({
        pg: () =>
          Effect.gen(function*() {
            yield* sql`DROP INDEX IF EXISTS ${takeIndex}`
            yield* sql`ALTER TABLE ${tableNameSql}
              ADD COLUMN state VARCHAR(10),
              ADD COLUMN visible_at TIMESTAMP`
            yield* sql`UPDATE ${tableNameSql}
              SET state = CASE WHEN completed THEN 'completed' ELSE 'pending' END,
                  visible_at = updated_at`
            yield* sql`ALTER TABLE ${tableNameSql}
              ALTER COLUMN sequence TYPE BIGINT,
              ALTER COLUMN id TYPE VARCHAR(255),
              ALTER COLUMN queue_name TYPE VARCHAR(255),
              ALTER COLUMN state SET NOT NULL,
              ALTER COLUMN visible_at SET NOT NULL,
              DROP COLUMN completed`
          }),
        mysql: () =>
          Effect.gen(function*() {
            yield* sql`DROP INDEX ${takeIndex} ON ${tableNameSql}`
            yield* sql`ALTER TABLE ${tableNameSql}
              MODIFY COLUMN id VARCHAR(255) NOT NULL,
              MODIFY COLUMN queue_name VARCHAR(255) NOT NULL,
              MODIFY COLUMN element MEDIUMTEXT NOT NULL,
              MODIFY COLUMN last_failure MEDIUMTEXT NULL,
              ADD COLUMN state VARCHAR(10) NULL,
              ADD COLUMN visible_at DATETIME NULL`
            yield* sql`UPDATE ${tableNameSql}
              SET state = CASE WHEN completed THEN 'completed' ELSE 'pending' END,
                  visible_at = updated_at`
            yield* sql`ALTER TABLE ${tableNameSql}
              MODIFY COLUMN state VARCHAR(10) NOT NULL,
              MODIFY COLUMN visible_at DATETIME NOT NULL,
              DROP COLUMN completed`
          }),
        mssql: () =>
          Effect.gen(function*() {
            const upgradedTableName = `${tableName}_upgrade`
            const upgradedTable = sql(upgradedTableName)
            yield* sql`CREATE TABLE ${upgradedTable} (
              sequence BIGINT IDENTITY(1,1) PRIMARY KEY,
              id NVARCHAR(255) NOT NULL,
              queue_name NVARCHAR(255) NOT NULL,
              element NVARCHAR(MAX) NOT NULL,
              state NVARCHAR(10) NOT NULL,
              attempts INT NOT NULL DEFAULT 0,
              last_failure NVARCHAR(MAX) NULL,
              visible_at DATETIME2 NOT NULL,
              acquired_at DATETIME2 NULL,
              acquired_by UNIQUEIDENTIFIER NULL,
              created_at DATETIME2 NOT NULL,
              updated_at DATETIME2 NOT NULL
            )`
            yield* sql`SET IDENTITY_INSERT ${upgradedTable} ON;
              INSERT INTO ${upgradedTable}
              (sequence, id, queue_name, element, state, attempts, last_failure, visible_at,
                acquired_at, acquired_by, created_at, updated_at)
              SELECT sequence, id, queue_name, element,
                CASE WHEN completed = 1 THEN 'completed' ELSE 'pending' END,
                attempts, last_failure, updated_at, acquired_at, acquired_by, created_at, updated_at
              FROM ${tableNameSql};
              SET IDENTITY_INSERT ${upgradedTable} OFF`
            yield* sql`DROP TABLE ${tableNameSql}`
            yield* sql`EXEC sp_rename ${upgradedTableName}, ${tableName}`
            yield* sql`CREATE UNIQUE INDEX ${sql(`idx_${tableName}_id`)} ON ${tableNameSql} (id, queue_name)`
            yield* sql`CREATE INDEX ${sql(`idx_${tableName}_update`)} ON ${tableNameSql} (sequence, acquired_by)`
          }),
        // sqlite rebuilds the table because altering or dropping constrained
        // columns is not portable across supported SQLite versions.
        orElse: () =>
          Effect.gen(function*() {
            const upgradedTableName = `${tableName}_upgrade`
            const upgradedTable = sql(upgradedTableName)
            yield* sql`DROP INDEX IF EXISTS ${takeIndex}`
            yield* sql`CREATE TABLE ${upgradedTable} (
              sequence INTEGER PRIMARY KEY AUTOINCREMENT,
              id TEXT NOT NULL,
              queue_name TEXT NOT NULL,
              element TEXT NOT NULL,
              state TEXT NOT NULL,
              attempts INTEGER NOT NULL DEFAULT 0,
              last_failure TEXT NULL,
              visible_at DATETIME NOT NULL,
              acquired_at DATETIME NULL,
              acquired_by TEXT NULL,
              created_at DATETIME NOT NULL,
              updated_at DATETIME NOT NULL
            )`
            yield* sql`INSERT INTO ${upgradedTable}
              (sequence, id, queue_name, element, state, attempts, last_failure, visible_at,
                acquired_at, acquired_by, created_at, updated_at)
              SELECT sequence, id, queue_name, element,
                CASE WHEN completed THEN 'completed' ELSE 'pending' END,
                attempts, last_failure, updated_at, acquired_at, acquired_by, created_at, updated_at
              FROM ${tableNameSql}`
            yield* sql`DROP TABLE ${tableNameSql}`
            yield* sql`ALTER TABLE ${upgradedTable} RENAME TO ${tableNameSql}`
            yield* sql`CREATE UNIQUE INDEX ${sql(`idx_${tableName}_id`)} ON ${tableNameSql} (id, queue_name)`
            yield* sql`CREATE INDEX ${sql(`idx_${tableName}_update`)} ON ${tableNameSql} (sequence, acquired_by)`
          })
      })

      // partial index where supported, so pollers never scan completed rows
      yield* sql.onDialectOrElse({
        mssql: () =>
          sql`CREATE INDEX ${takeIndex} ON ${tableNameSql} (queue_name, visible_at)
            WHERE state = 'pending'`,
        mysql: () => sql`CREATE INDEX ${takeIndex} ON ${tableNameSql} (queue_name, state, visible_at)`,
        pg: () =>
          sql`CREATE INDEX ${takeIndex} ON ${tableNameSql} (queue_name, visible_at)
            WHERE state = 'pending'`,
        orElse: () =>
          sql`CREATE INDEX ${takeIndex} ON ${tableNameSql} (queue_name, visible_at)
            WHERE state = 'pending'`
      })
    })
  })

/**
 * Provides a SQL-backed `PersistedQueueStore` using `makeStoreSql`.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerStoreSql: (
  options?: {
    readonly tableName?: string | undefined
    readonly pollInterval?: Duration.Input | undefined
    readonly lockRefreshInterval?: Duration.Input | undefined
    readonly lockExpiration?: Duration.Input | undefined
  } | undefined
) => Layer.Layer<
  PersistedQueueStore,
  SqlError,
  SqlClient.SqlClient
> = flow(makeStoreSql, Layer.effect(PersistedQueueStore))
