/**
 * Standard metric definitions used by the unstable cluster runtime. The gauges
 * track runner-local entities, entity mailbox sizes, singleton processes,
 * registered runners, healthy runners, acquired shards, and shards being
 * released. The timer tracks shard release duration.
 *
 * This module only defines the metric handles. The runtime components that
 * manage entities, runners, singletons, and sharding update these metrics while
 * the cluster is running.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Metric from "../Metric.ts"

/**
 * Creates a gauge tracking the number of active entity instances for each entity type on
 * the current runner.
 *
 * **When to use**
 *
 * Use when instrumenting runner-local entity counts and tagging them by entity
 * type for cluster dashboards.
 *
 * **Details**
 *
 * Bigint gauge named `effect_cluster_entities`, tagged with the entity type.
 * Each entity manager registers a series that reads its active entity count
 * when metrics are snapshotted, and removes it when the manager shuts down.
 *
 * **Gotchas**
 *
 * This gauge is runner-local. Aggregate across runners.
 *
 * @see {@link singletons} for singleton process counts on the current runner
 * @see {@link shards} for shard ownership on the current runner
 *
 * @stability unstable
 * @category metrics
 * @since 4.0.0
 */
export const entities = Metric.gauge("effect_cluster_entities", { bigint: true })

/**
 * Represents a gauge tracking the mailbox size of each entity resident on the
 * current runner.
 *
 * **When to use**
 *
 * Use to find entities whose mailboxes back up, before sends start failing
 * with `MailboxFull`.
 *
 * **Details**
 *
 * Bigint gauge named `effect_cluster_entity_mailbox_size`, with one series per
 * resident entity tagged with `type`, `id` and `shard`. The value is the
 * number the mailbox capacity check compares against: requests admitted to the
 * entity, whether queued or in flight, excluding internal keep-alive requests.
 *
 * The value is read when metrics are snapshotted, so it adds no work per
 * message. Each series is removed when its entity is released.
 *
 * **Gotchas**
 *
 * Off by default. Enable it with `ShardingConfig.entityMailboxMetrics` or the
 * `mailboxMetrics` option when registering an entity. One series per resident
 * entity can mean many series on busy runners.
 *
 * An entity keeps reporting while it drains in-flight requests during
 * shutdown. `Metric.update` and `Metric.modify` on this gauge do nothing for
 * series the runtime registered.
 *
 * Like the other runner gauges it has no runner attribute: runners sharing a
 * registry without distinct metric attributes overwrite each other's series.
 *
 * @see {@link entities} for the number of resident entities per type
 * @see {@link entityMailboxSizeMax} for the always-on per-type maximum
 *
 * @stability unstable
 * @category metrics
 * @since 4.0.6
 */
export const entityMailboxSize = Metric.gauge("effect_cluster_entity_mailbox_size", { bigint: true })

/**
 * Represents a gauge tracking the largest mailbox size among the entities of
 * each type resident on the current runner.
 *
 * **When to use**
 *
 * Use to alert on entity types whose mailboxes back up, before sends start
 * failing with `MailboxFull`, without paying for a series per entity.
 *
 * **Details**
 *
 * Bigint gauge named `effect_cluster_entity_mailbox_size_max`, with one series
 * per registered entity type tagged with `type`. The value is the largest
 * mailbox size that {@link entityMailboxSize} would report for the type,
 * including entities draining in-flight requests during shutdown, or `0` when
 * the type has no resident entities.
 *
 * The value is computed when metrics are snapshotted, by visiting each
 * resident entity of the type, so it adds no work per message. Entities
 * draining during shutdown keep their slot until they finish, so the visit is
 * bounded by `ShardingConfig.maxResidentEntities` across all types, unless it
 * is `"unbounded"`. The series is removed when the entity type shuts down.
 *
 * **Gotchas**
 *
 * Always on. `Metric.update` and `Metric.modify` on this gauge do nothing for
 * series the runtime registered.
 *
 * Like the other runner gauges it has no runner attribute: runners sharing a
 * registry without distinct metric attributes overwrite each other's series.
 *
 * @see {@link entityMailboxSize} for the opt-in per-entity mailbox sizes
 *
 * @stability unstable
 * @category metrics
 * @since 4.0.6
 */
export const entityMailboxSizeMax = Metric.gauge("effect_cluster_entity_mailbox_size_max", { bigint: true })

/**
 * Creates a gauge tracking the number of singleton processes currently running on the
 * current runner.
 *
 * @stability unstable
 * @category metrics
 * @since 4.0.0
 */
export const singletons = Metric.gauge("effect_cluster_singletons", { bigint: true })

/**
 * Represents a gauge tracking the number of registered cluster runners.
 *
 * **When to use**
 *
 * Use to monitor the registered runners currently known to the cluster runtime.
 *
 * **Gotchas**
 *
 * The value can lag briefly during membership changes or failure detection.
 *
 * @see {@link runnersHealthy} for the healthy-runner subset
 *
 * @stability unstable
 * @category metrics
 * @since 4.0.0
 */
export const runners = Metric.gauge("effect_cluster_runners", { bigint: true })

/**
 * Represents a gauge tracking the number of cluster runners currently considered healthy.
 *
 * **When to use**
 *
 * Use to monitor the healthy subset of registered cluster runners.
 *
 * **Details**
 *
 * Bigint gauge named `effect_cluster_runners_healthy`.
 *
 * **Gotchas**
 *
 * The value reflects the runtime's health-check view and can lag during
 * membership changes or failure detection.
 *
 * @see {@link runners} for the total registered-runner gauge
 *
 * @stability unstable
 * @category metrics
 * @since 4.0.0
 */
export const runnersHealthy = Metric.gauge("effect_cluster_runners_healthy", { bigint: true })

/**
 * Represents a gauge tracking the number of shards currently acquired by the current runner.
 *
 * **When to use**
 *
 * Use to observe shard ownership held by the current runner during startup,
 * rebalancing, or failover.
 *
 * **Details**
 *
 * Bigint gauge named `effect_cluster_shards`, updated from the sharding
 * acquisition loop using the current acquired shard count.
 *
 * **Gotchas**
 *
 * This is runner-local, not a cluster-wide shard total. Aggregate per-runner
 * values carefully.
 *
 * @stability unstable
 * @category metrics
 * @since 4.0.0
 */
export const shards = Metric.gauge("effect_cluster_shards", { bigint: true })

/**
 * Represents a gauge tracking the number of shards the current runner is still
 * releasing.
 *
 * **When to use**
 *
 * Use to detect shard releases that stall during rebalancing, shutdown handoff
 * or lock storage failures.
 *
 * **Details**
 *
 * Bigint gauge named `effect_cluster_shards_releasing`, updated with the number
 * of distinct shards being released. A shard counts from the moment it is no
 * longer acquired until its entities and singletons have stopped and its lock
 * is released, including waits for lock storage to recover and release
 * retries.
 *
 * **Gotchas**
 *
 * Positive values are normal while shards move; alert only when the value
 * stays positive. It does not reflect lock ownership, and reacquisition can
 * stay blocked briefly after it returns to zero, while a forced release
 * finishes its bookkeeping.
 *
 * Like the other runner gauges it assumes one runner per process: runners
 * sharing a registry without distinct metric attributes overwrite each other's
 * value.
 *
 * @stability unstable
 * @category metrics
 * @since 4.1.0
 */
export const shardsReleasing = Metric.gauge("effect_cluster_shards_releasing", { bigint: true })

/**
 * Represents a timer tracking how long the current runner takes to release a
 * shard after reassignment, lock loss or shutdown handoff.
 *
 * **When to use**
 *
 * Use to observe shard handoff latency during rebalancing, shutdown, or lock
 * storage failures.
 *
 * **Details**
 *
 * Millisecond timer named `effect_cluster_shard_release`. Each sample covers
 * entity teardown, retries and any wait for shard lock storage to recover.
 *
 * **Gotchas**
 *
 * Only completed releases are recorded. Interrupted releases and forced
 * releases after lock storage becomes unhealthy are not.
 *
 * @stability unstable
 * @category metrics
 * @since 4.0.0
 */
export const shardReleaseDuration = Metric.timer("effect_cluster_shard_release", {
  description: "Time taken to release a shard, including entity teardown, retries and lock storage recovery"
})
