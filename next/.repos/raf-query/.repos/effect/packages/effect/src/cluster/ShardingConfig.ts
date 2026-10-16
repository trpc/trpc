/**
 * Configures how an Effect Cluster runner participates in sharding.
 *
 * `ShardingConfig` describes the runner address, shard group membership, shard
 * counts and weights, lock timing, entity mailbox and lifecycle limits, polling
 * intervals, health checks, and local serialization simulation. This module
 * includes the service, default values, programmatic and environment-based
 * layers, a `Config` description for loading values, and helpers for normalizing
 * assigned shard groups.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Config from "../Config.ts"
import * as ConfigProvider from "../ConfigProvider.ts"
import * as Context from "../Context.ts"
import * as Duration from "../Duration.ts"
import * as Effect from "../Effect.ts"
import * as Layer from "../Layer.ts"
import * as Option from "../Option.ts"
import * as Schema from "../Schema.ts"
import { RunnerAddress } from "./RunnerAddress.ts"

/**
 * Represents the configuration for the `Sharding` service on a given runner.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class ShardingConfig extends Context.Service<ShardingConfig, {
  /**
   * The address for the current runner that other runners can use to
   * communicate with it.
   *
   * If `None`, the runner is not part of the cluster and will be in a client-only
   * mode.
   */
  readonly runnerAddress: Option.Option<RunnerAddress>
  /**
   * The listen address for the current runner.
   *
   * Defaults to the `runnerAddress`.
   */
  readonly runnerListenAddress: Option.Option<RunnerAddress>
  /**
   * A number that determines how many shards this runner will be assigned
   * relative to other runners.
   *
   * Defaults to `1`.
   *
   * A value of `2` means that this runner should be assigned twice as many
   * shards as a runner with a weight of `1`.
   */
  readonly runnerShardWeight: number
  /**
   * The shard groups available across all runners.
   *
   * Defaults to `["default"]`.
   */
  readonly availableShardGroups: ReadonlyArray<string>
  /**
   * The shard groups that are assigned to this runner.
   *
   * Defaults to `["default"]`.
   */
  readonly assignedShardGroups: ReadonlyArray<string>
  /**
   * The number of shards to allocate per shard group.
   *
   * **Note**: this value should be consistent across all runners.
   */
  readonly shardsPerGroup: number
  /**
   * The maximum interval between shard lock refreshes.
   *
   * The runner may shorten this interval to one third of
   * `shardLockExpiration` to preserve enough time to stop entities safely if
   * lock storage becomes unavailable.
   */
  readonly shardLockRefreshInterval: Duration.Input
  /**
   * Shard lock expiration duration.
   */
  readonly shardLockExpiration: Duration.Input
  /**
   * Disable the use of advisory locks for shard locking.
   */
  readonly shardLockDisableAdvisory: boolean
  /**
   * Start shutting down as soon as an Entity has started shutting down.
   *
   * Defaults to `true`.
   */
  readonly preemptiveShutdown: boolean
  /**
   * The default capacity of the mailbox for entities.
   */
  readonly entityMailboxCapacity: number | "unbounded"
  /**
   * The maximum number of entities that can be resident on this runner at the
   * same time.
   *
   * When the limit is reached, no new entities are spawned: the storage read
   * loop stops admitting messages for new entity addresses (they stay in
   * storage until a slot frees up), and volatile sends to new addresses fail
   * with `MailboxFull`.
   *
   * `"unbounded"` can only be set programmatically; the environment
   * configuration only accepts integers.
   *
   * Defaults to `10_000`.
   */
  readonly maxResidentEntities: number | "unbounded"
  /**
   * The maximum number of unprocessed messages read from storage in a single
   * poll.
   *
   * Defaults to `1024`.
   */
  readonly unprocessedMessageBatchSize: number
  /**
   * The maximum duration of inactivity (i.e. without receiving a message)
   * after which an entity will be interrupted.
   */
  readonly entityMaxIdleTime: Duration.Input
  /**
   * If an entity does not register itself within this time after a message is
   * sent to it, the message will be marked as failed.
   *
   * Defaults to 1 minute.
   */
  readonly entityRegistrationTimeout: Duration.Input
  /**
   * The maximum duration of time to wait for an entity to terminate.
   *
   * By default this is set to 15 seconds to stay within kubernetes defaults.
   */
  readonly entityTerminationTimeout: Duration.Input
  /**
   * The interval at which to poll for unprocessed messages from storage.
   */
  readonly entityMessagePollInterval: Duration.Input
  /**
   * The interval at which to poll for client replies from storage.
   */
  readonly entityReplyPollInterval: Duration.Input
  /**
   * The interval at which to poll for new runners and refresh shard
   * assignments.
   */
  readonly refreshAssignmentsInterval: Duration.Input
  /**
   * The interval to retry a send if EntityNotAssignedToRunner is returned.
   */
  readonly sendRetryInterval: Duration.Input
  /**
   * The interval at which to check for unhealthy runners and report them
   */
  readonly runnerHealthCheckInterval: Duration.Input
  /**
   * Simulate serialization and deserialization to remote runners for local
   * entities.
   */
  readonly simulateRemoteSerialization: boolean
}>()("effect/cluster/ShardingConfig") {}

const defaultRunnerAddress = RunnerAddress.make({ host: "localhost", port: 34431 })

/**
 * Default values for `ShardingConfig`, including the default local runner address,
 * shard group, shard count, mailbox settings, polling intervals, and remote
 * serialization simulation.
 *
 * @stability unstable
 * @category defaults
 * @since 4.0.0
 */
export const defaults: ShardingConfig["Service"] = {
  runnerAddress: Option.some(defaultRunnerAddress),
  runnerListenAddress: Option.none(),
  runnerShardWeight: 1,
  shardsPerGroup: 300,
  availableShardGroups: ["default"],
  assignedShardGroups: ["default"],
  preemptiveShutdown: true,
  shardLockRefreshInterval: Duration.seconds(10),
  shardLockExpiration: Duration.seconds(35),
  shardLockDisableAdvisory: false,
  entityMailboxCapacity: 4096,
  maxResidentEntities: 10_000,
  unprocessedMessageBatchSize: 1024,
  entityMaxIdleTime: Duration.minutes(1),
  entityRegistrationTimeout: Duration.minutes(1),
  entityTerminationTimeout: Duration.seconds(15),
  entityMessagePollInterval: Duration.seconds(10),
  entityReplyPollInterval: Duration.millis(200),
  sendRetryInterval: Duration.millis(100),
  refreshAssignmentsInterval: Duration.seconds(3),
  runnerHealthCheckInterval: Duration.minutes(1),
  simulateRemoteSerialization: true
}

/**
 * Creates a `ShardingConfig` layer by merging the provided partial options over
 * `defaults`.
 *
 * **When to use**
 *
 * Use when you need to wire a cluster runner with explicit `ShardingConfig`
 * values, especially in tests, local development, or code paths where
 * configuration should be provided programmatically instead of loaded from
 * environment variables.
 *
 * **Details**
 *
 * The merge is shallow: omitted fields use `defaults`, and provided fields
 * replace the corresponding default value.
 *
 * **Gotchas**
 *
 * This layer only merges and provides configuration; it does not check that
 * cluster-wide settings are consistent across runners. Keep values such as
 * `shardsPerGroup` and `availableShardGroups` aligned for runners that should
 * share shard assignments.
 *
 * @see {@link defaults} for the values used when an option is omitted
 * @see {@link layerDefaults} for a layer with no overrides
 * @see {@link layerFromEnv} for loading configuration from environment variables before applying explicit overrides
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer = (options?: Partial<ShardingConfig["Service"]>): Layer.Layer<ShardingConfig> =>
  Layer.succeed(ShardingConfig)({ ...defaults, ...options })

/**
 * Layer that provides the default `ShardingConfig` values.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerDefaults: Layer.Layer<ShardingConfig> = layer()

/**
 * Describes how to load `ShardingConfig` values, applying the same
 * defaults used by the in-memory `defaults` object.
 *
 * @stability unstable
 * @category configuration
 * @since 4.0.0
 */
export const config: Config.Config<ShardingConfig["Service"]> = Config.all({
  runnerAddress: Config.all({
    host: Config.String("host").pipe(
      Config.withDefault(defaultRunnerAddress.host)
      // Config.withDescription("The hostname or IP address of the runner.")
    ),
    port: Config.Int("port").pipe(
      Config.withDefault(defaultRunnerAddress.port)
      // Config.withDescription("The port used for inter-runner communication.")
    )
  }).pipe(Config.map((options) => RunnerAddress.make(options)), Config.option),
  runnerListenAddress: Config.all({
    host: Config.String("listenHost"),
    // Config.withDescription("The host to listen on.")
    port: Config.Int("listenPort").pipe(
      Config.withDefault(defaultRunnerAddress.port)
      // Config.withDescription("The port to listen on.")
    )
  }).pipe(Config.map((options) => RunnerAddress.make(options)), Config.option),
  runnerShardWeight: Config.Int("runnerShardWeight").pipe(
    Config.withDefault(defaults.runnerShardWeight)
    // Config.withDescription("A number that determines how many shards this runner will be assigned relative to other runners.")
  ),
  availableShardGroups: Config.Array(Schema.String, "availableShardGroups").pipe(
    Config.withDefault(["default"])
    // Config.withDescription("The shard groups available across all runners.")
  ),
  assignedShardGroups: Config.Array(Schema.String, "shardGroups").pipe(
    Config.withDefault(["default"])
    // Config.withDescription("The shard groups that are assigned to this runner.")
  ),
  shardsPerGroup: Config.Int("shardsPerGroup").pipe(
    Config.withDefault(defaults.shardsPerGroup)
    // Config.withDescription("The number of shards to allocate per shard group.")
  ),
  shardLockRefreshInterval: Config.Duration("shardLockRefreshInterval").pipe(
    Config.withDefault(defaults.shardLockRefreshInterval)
    // Config.withDescription("Shard lock refresh interval.")
  ),
  shardLockExpiration: Config.Duration("shardLockExpiration").pipe(
    Config.withDefault(defaults.shardLockExpiration)
    // Config.withDescription("Shard lock expiration duration.")
  ),
  shardLockDisableAdvisory: Config.Boolean("shardLockDisableAdvisory").pipe(
    Config.withDefault(defaults.shardLockDisableAdvisory)
    // Config.withDescription("Disable the use of advisory locks for shard locking.")
  ),
  preemptiveShutdown: Config.Boolean("preemptiveShutdown").pipe(
    Config.withDefault(defaults.preemptiveShutdown)
    // Config.withDescription("Start shutting down as soon as an Entity has started shutting down.")
  ),
  entityMailboxCapacity: Config.Int("entityMailboxCapacity").pipe(
    Config.withDefault(defaults.entityMailboxCapacity)
    // Config.withDescription("The default capacity of the mailbox for entities.")
  ),
  maxResidentEntities: Config.schema(
    Schema.Int.check(Schema.isGreaterThan(0)),
    "maxResidentEntities"
  ).pipe(
    Config.withDefault(defaults.maxResidentEntities)
    // Config.withDescription("The maximum number of entities that can be resident on this runner at the same time.")
  ),
  unprocessedMessageBatchSize: Config.schema(
    Schema.Int.check(Schema.isGreaterThan(0)),
    "unprocessedMessageBatchSize"
  ).pipe(
    Config.withDefault(defaults.unprocessedMessageBatchSize)
    // Config.withDescription("The maximum number of unprocessed messages read from storage in a single poll.")
  ),
  entityMaxIdleTime: Config.Duration("entityMaxIdleTime").pipe(
    Config.withDefault(defaults.entityMaxIdleTime)
    // Config.withDescription(
    //   "The maximum duration of inactivity (i.e. without receiving a message) after which an entity will be interrupted."
    // )
  ),
  entityRegistrationTimeout: Config.Duration("entityRegistrationTimeout").pipe(
    Config.withDefault(defaults.entityRegistrationTimeout)
    // Config.withDescription("If an entity does not register itself within this time after a message is sent to it, the message will be marked as failed.")
  ),
  entityTerminationTimeout: Config.Duration("entityTerminationTimeout").pipe(
    Config.withDefault(defaults.entityTerminationTimeout)
    // Config.withDescription("The maximum duration of time to wait for an entity to terminate.")
  ),
  entityMessagePollInterval: Config.Duration("entityMessagePollInterval").pipe(
    Config.withDefault(defaults.entityMessagePollInterval)
    // Config.withDescription("The interval at which to poll for unprocessed messages from storage.")
  ),
  entityReplyPollInterval: Config.Duration("entityReplyPollInterval").pipe(
    Config.withDefault(defaults.entityReplyPollInterval)
    // Config.withDescription("The interval at which to poll for client replies from storage.")
  ),
  sendRetryInterval: Config.Duration("sendRetryInterval").pipe(
    Config.withDefault(defaults.sendRetryInterval)
    // Config.withDescription("The interval to retry a send if EntityNotManagedByRunner is returned.")
  ),
  refreshAssignmentsInterval: Config.Duration("refreshAssignmentsInterval").pipe(
    Config.withDefault(defaults.refreshAssignmentsInterval)
    // Config.withDescription("The interval at which to refresh shard assignments.")
  ),
  runnerHealthCheckInterval: Config.Duration("runnerHealthCheckInterval").pipe(
    Config.withDefault(defaults.runnerHealthCheckInterval)
    // Config.withDescription("The interval at which to check for unhealthy runners and report them.")
  ),
  // unhealthyRunnerReportInterval: Config.Duration("unhealthyRunnerReportInterval").pipe(
  simulateRemoteSerialization: Config.Boolean("simulateRemoteSerialization").pipe(
    Config.withDefault(defaults.simulateRemoteSerialization)
    // Config.withDescription("Simulate serialization and deserialization to remote runners for local entities.")
  )
})

/**
 * Effect that loads `ShardingConfig` from environment variables using the
 * constant-case config provider.
 *
 * @stability unstable
 * @category configuration
 * @since 4.0.0
 */
export const configFromEnv = config.pipe(
  Effect.provideService(
    ConfigProvider.ConfigProvider,
    ConfigProvider.fromEnv().pipe(
      ConfigProvider.constantCase
    )
  )
)

/**
 * Layer that loads `ShardingConfig` from environment variables and, when options
 * are provided, overlays those options on top of the loaded values.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerFromEnv = (options?: Partial<ShardingConfig["Service"]> | undefined): Layer.Layer<
  ShardingConfig,
  Config.ConfigError
> =>
  Layer.effect(ShardingConfig)(
    options ? Effect.map(configFromEnv, (config) => ({ ...config, ...options })) : configFromEnv
  )

/**
 * Normalizes the provided `ShardingConfig` to calculate the `available` and
 * `assigned` shard groups.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const shardGroupConfig = (config: ShardingConfig["Service"]): {
  readonly available: ReadonlySet<string>
  readonly assigned: ReadonlySet<string>
} => {
  const available = new Set(config.availableShardGroups.slice().sort())
  const assigned = new Set<string>()
  available.forEach((group) => {
    if (config.assignedShardGroups.includes(group)) {
      assigned.add(group)
    }
  })
  return { available, assigned }
}
