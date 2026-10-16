/**
 * Runs recurring cron jobs through cluster sharding.
 *
 * This module turns a `Cron.Cron` schedule into a `Layer` that coordinates one
 * recurring job across a cluster. It registers a singleton for the initial
 * scheduling step and a persisted entity message for each run. This is useful
 * for distributed maintenance work where the job should be owned by the cluster
 * rather than by every runner independently.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Cron from "../Cron.ts"
import * as DateTime from "../DateTime.ts"
import * as Duration from "../Duration.ts"
import * as Effect from "../Effect.ts"
import * as Exit from "../Exit.ts"
import * as Layer from "../Layer.ts"
import * as Option from "../Option.ts"
import * as PrimaryKey from "../PrimaryKey.ts"
import * as Rpc from "../rpc/Rpc.ts"
import * as Schedule from "../Schedule.ts"
import * as Schema from "../Schema.ts"
import type { Scope } from "../Scope.ts"
import * as ClusterSchema from "./ClusterSchema.ts"
import { Persisted, Uninterruptible } from "./ClusterSchema.ts"
import * as DeliverAt from "./DeliverAt.ts"
import * as Entity from "./Entity.ts"
import type { Sharding } from "./Sharding.ts"
import * as Singleton from "./Singleton.ts"

/**
 * Creates a layer that runs a cron job through the cluster sharding system.
 *
 * **Details**
 *
 * The job is scheduled as persisted entity messages, with an initial singleton
 * scheduling step and optional controls for shard group, next-run calculation,
 * and skipping stale scheduled runs.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = <E, R>(options: {
  readonly name: string
  readonly cron: Cron.Cron
  readonly execute: Effect.Effect<void, E, R>

  /**
   * Choose a shard group to run this cron job on.
   */
  readonly shardGroup?: string | undefined

  /**
   * Controls whether the next cron job is based on the time of the previous
   * run.
   *
   * **Details**
   *
   * Defaults to `false`, meaning the next run will be calculated from the
   * current time.
   */
  readonly calculateNextRunFromPrevious?: boolean | undefined

  /**
   * If set, the cron job will skip execution if the scheduled time is older
   * than this duration.
   *
   * **When to use**
   *
   * Use to prevent running jobs that were scheduled too far in the past.
   *
   * **Details**
   *
   * Defaults to "1 day".
   */
  readonly skipIfOlderThan?: Duration.Input | undefined
}): Layer.Layer<never, never, Sharding | Exclude<R, Scope>> => {
  const CronEntity = Entity.make(`ClusterCron/${options.name}`, [
    Rpc.make("run", {
      payload: CronPayload
    })
      .annotate(Persisted, true)
      .annotate(Uninterruptible, true)
  ])
    .annotate(ClusterSchema.ShardGroup, () => options.shardGroup ?? "default")
    .annotate(ClusterSchema.ClientTracingEnabled, false)

  const InitialRun = Singleton.make(
    `ClusterCron/${options.name}`,
    Effect.gen(function*() {
      const now = yield* DateTime.now
      const next = DateTime.fromDateUnsafe(Cron.next(options.cron, now))
      const entityId = options.calculateNextRunFromPrevious ? "initial" : DateTime.formatIso(next)
      const client = (yield* CronEntity.client)(entityId)
      yield* client.run({ dateTime: next }, { discard: true })
    }),
    { shardGroup: options.shardGroup }
  )

  const skipIfOlderThan = Option.fromUndefinedOr(options.skipIfOlderThan).pipe(
    Option.map(Duration.fromInputUnsafe),
    Option.getOrElse(() => Duration.days(1))
  )

  const effect = Effect.fnUntraced(function*(dateTime: DateTime.Utc) {
    const now = yield* DateTime.now
    if (DateTime.isLessThan(dateTime, DateTime.subtractDuration(now, skipIfOlderThan))) {
      return
    }
    return yield* options.execute
  }, Effect.orDie)

  const EntityLayer = CronEntity.toLayer(Effect.gen(function*() {
    const makeClient = yield* CronEntity.client
    return {
      run: (request) =>
        Effect.onExitPrimitive(
          effect(request.payload.dateTime),
          Effect.fnUntraced(function*(exit) {
            if (Exit.isFailure(exit)) {
              yield* Effect.logWarning(exit.cause)
            }
            const now = yield* DateTime.now
            const next = DateTime.fromDateUnsafe(Cron.next(
              options.cron,
              options.calculateNextRunFromPrevious ? request.payload.dateTime : now
            ))
            const client = makeClient(DateTime.formatIso(next))
            return yield* client.run({ dateTime: next }, { discard: true }).pipe(
              Effect.tapCause((cause) => Effect.logWarning("Failed to schedule next run, retrying", cause)),
              Effect.sandbox,
              Effect.retry(retryPolicy),
              Effect.orDie
            )
          }),
          true
        ).pipe(
          Effect.annotateLogs({
            module: "effect/cluster/ClusterCron",
            name: options.name,
            dateTime: request.payload.dateTime
          })
        )
    }
  }))

  return Layer.merge(InitialRun, EntityLayer)
}

const retryPolicy = Schedule.min([
  Schedule.exponential(200, 1.5),
  Schedule.spaced("1 minute")
])

class CronPayload extends Schema.Class<CronPayload>("effect/cluster/ClusterCron/CronPayload")({
  dateTime: Schema.DateTimeUtc
}) {
  [PrimaryKey.symbol]() {
    return ""
  }
  [DeliverAt.symbol]() {
    return this.dateTime
  }
}
