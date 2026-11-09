/**
 * Stores runner registration and shard-lock state for cluster sharding.
 *
 * `RunnerStorage` records which runners are registered, whether they are
 * healthy, which machine id a runner receives, and which shard locks are held
 * by each runner. This module includes the typed storage service, a
 * string-encoded backend interface, an adapter from encoded storage to the typed
 * service, and an in-memory implementation for tests and local use.
 *
 * @stability unstable
 * @since 4.0.0
 */
import { isArrayNonEmpty, type NonEmptyArray } from "../Array.ts"
import * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import * as Layer from "../Layer.ts"
import * as MutableHashMap from "../MutableHashMap.ts"
import type { PersistenceError } from "./ClusterError.ts"
import * as MachineId from "./MachineId.ts"
import { Runner } from "./Runner.ts"
import type { RunnerAddress } from "./RunnerAddress.ts"
import * as ShardId from "./ShardId.ts"

/**
 * Represents a generic interface to the persistent storage required by the
 * cluster.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class RunnerStorage extends Context.Service<RunnerStorage, {
  /**
   * Register a new runner with the cluster.
   */
  readonly register: (runner: Runner, healthy: boolean) => Effect.Effect<MachineId.MachineId, PersistenceError>

  /**
   * Unregister the runner with the given address.
   */
  readonly unregister: (address: RunnerAddress) => Effect.Effect<void, PersistenceError>

  /**
   * Get all runners registered with the cluster.
   */
  readonly getRunners: Effect.Effect<Array<readonly [runner: Runner, healthy: boolean]>, PersistenceError>

  /**
   * Set the health status of the given runner.
   */
  readonly setRunnerHealth: (address: RunnerAddress, healthy: boolean) => Effect.Effect<void, PersistenceError>

  /**
   * Try to acquire the given shard ids for processing.
   *
   * It returns an array of shards it was able to acquire.
   */
  readonly acquire: (
    address: RunnerAddress,
    shardIds: Iterable<ShardId.ShardId>
  ) => Effect.Effect<Array<ShardId.ShardId>, PersistenceError>

  /**
   * Refresh the locks owned by the given runner.
   */
  readonly refresh: (
    address: RunnerAddress,
    shardIds: Iterable<ShardId.ShardId>
  ) => Effect.Effect<Array<ShardId.ShardId>, PersistenceError>

  /**
   * Release the given shard ids.
   */
  readonly release: (
    address: RunnerAddress,
    shardId: ShardId.ShardId
  ) => Effect.Effect<void, PersistenceError>

  /**
   * Release all the shards assigned to the given runner.
   */
  readonly releaseAll: (address: RunnerAddress) => Effect.Effect<void, PersistenceError>
}>()("effect/cluster/RunnerStorage") {}

/**
 * String-encoded runner storage interface used by adapters that persist runner
 * addresses, runners, machine ids, and shard ids outside the in-memory model.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export interface Encoded {
  /**
   * Get all runners registered with the cluster.
   */
  readonly getRunners: Effect.Effect<Array<readonly [runner: string, healthy: boolean]>, PersistenceError>

  /**
   * Register a new runner with the cluster.
   */
  readonly register: (address: string, runner: string, healthy: boolean) => Effect.Effect<number, PersistenceError>

  /**
   * Unregister the runner with the given address.
   */
  readonly unregister: (address: string) => Effect.Effect<void, PersistenceError>

  /**
   * Set the health status of the given runner.
   */
  readonly setRunnerHealth: (address: string, healthy: boolean) => Effect.Effect<void, PersistenceError>

  /**
   * Acquire the lock on the given shards, returning the shards that were
   * successfully locked.
   */
  readonly acquire: (
    address: string,
    shardIds: NonEmptyArray<string>
  ) => Effect.Effect<Array<string>, PersistenceError>

  /**
   * Refresh the lock on the given shards, returning the shards that were
   * successfully locked.
   */
  readonly refresh: (
    address: string,
    shardIds: Array<string>
  ) => Effect.Effect<ReadonlyArray<string>, PersistenceError>

  /**
   * Release the lock on the given shard.
   */
  readonly release: (
    address: string,
    shardId: string
  ) => Effect.Effect<void, PersistenceError>

  /**
   * Release the lock on all shards for the given runner.
   */
  readonly releaseAll: (address: string) => Effect.Effect<void, PersistenceError>
}

/**
 * Adapts an encoded runner storage implementation into `RunnerStorage`, converting
 * runner addresses, runners, machine ids, and shard ids between typed values and
 * their string or numeric storage forms.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const makeEncoded = (encoded: Encoded) =>
  RunnerStorage.of({
    getRunners: Effect.gen(function*() {
      const runners = yield* encoded.getRunners
      const results: Array<[Runner, boolean]> = []
      for (let i = 0; i < runners.length; i++) {
        const [runner, healthy] = runners[i]
        // @effect-diagnostics-next-line tryCatchInEffectGen:off
        try {
          results.push([Runner.decodeSync(runner), healthy])
        } catch {
          //
        }
      }
      return results
    }),
    register: (runner, healthy) =>
      Effect.map(
        encoded.register(encodeRunnerAddress(runner.address), Runner.encodeSync(runner), healthy),
        MachineId.make
      ),
    unregister: (address) => encoded.unregister(encodeRunnerAddress(address)),
    setRunnerHealth: (address, healthy) => encoded.setRunnerHealth(encodeRunnerAddress(address), healthy),
    acquire: (address, shardIds) => {
      const arr = Array.from(shardIds, (id) => id.toString())
      if (!isArrayNonEmpty(arr)) return Effect.succeed([])
      return encoded.acquire(encodeRunnerAddress(address), arr).pipe(
        Effect.map((shards) => shards.map(ShardId.fromString))
      )
    },
    refresh: (address, shardIds) =>
      encoded.refresh(encodeRunnerAddress(address), Array.from(shardIds, (id) => id.toString())).pipe(
        Effect.map((shards) => shards.map(ShardId.fromString))
      ),
    release(address, shardId) {
      return encoded.release(encodeRunnerAddress(address), shardId.toString())
    },
    releaseAll(address) {
      return encoded.releaseAll(encodeRunnerAddress(address))
    }
  })

/**
 * Creates an in-memory `RunnerStorage` implementation for tests and local use.
 *
 * **Details**
 *
 * Runner health and shard acquisition are kept only in process memory.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeMemory = Effect.gen(function*() {
  const runners = MutableHashMap.empty<RunnerAddress, readonly [runner: Runner, healthy: boolean]>()
  let acquired: Array<ShardId.ShardId> = []
  let id = 0

  return RunnerStorage.of({
    getRunners: Effect.sync(() => Array.from(MutableHashMap.values(runners))),
    register: (runner, healthy) =>
      Effect.sync(() => {
        MutableHashMap.set(runners, runner.address, [runner, healthy])
        return MachineId.make(id++)
      }),
    unregister: (address) =>
      Effect.sync(() => {
        MutableHashMap.remove(runners, address)
      }),
    setRunnerHealth: (address, healthy) =>
      Effect.sync(() => {
        MutableHashMap.modify(runners, address, ([runner]) => [runner, healthy] as const)
      }),
    acquire: (_address, shardIds) => {
      acquired = Array.from(shardIds)
      return Effect.succeed(acquired)
    },
    refresh: () => Effect.sync(() => acquired),
    release: () => Effect.void,
    releaseAll: () => Effect.void
  })
})

/**
 * Layer that provides the in-memory `RunnerStorage` implementation.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerMemory: Layer.Layer<RunnerStorage> = Layer.effect(RunnerStorage)(makeMemory)

// -------------------------------------------------------------------------------------
// internal
// -------------------------------------------------------------------------------------

const encodeRunnerAddress = (runnerAddress: RunnerAddress) => `${runnerAddress.host}:${runnerAddress.port}`
