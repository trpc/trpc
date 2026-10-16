import { NodeClusterSocket, NodeCrypto, NodeSocket, NodeSocketServer } from "@effect/platform-node"
import { MysqlClient } from "@effect/sql-mysql2"
import { PgClient } from "@effect/sql-pg"
import { Clock, Context, Duration, Effect, Exit, Latch, Layer, Option, Redacted, Scope } from "effect"
import {
  ClusterWorkflowEngine,
  type Entity,
  EntityId,
  type MessageStorage,
  type Runner as RunnerModel,
  RunnerAddress,
  RunnerHealth,
  Runners,
  RunnerStorage,
  ShardId,
  Sharding,
  ShardingConfig,
  SocketRunner,
  SqlMessageStorage,
  SqlRunnerStorage
} from "effect/cluster"
import type { Rpc } from "effect/rpc"
import { RpcClient, RpcSerialization } from "effect/rpc"
import * as Socket from "effect/socket/Socket"
import * as SocketServer from "effect/socket/SocketServer"
import { SqlClient, type SqlConnection, SqlError } from "effect/sql"
import { WorkflowEngine } from "effect/workflow"
import * as Net from "node:net"
import { inject } from "vitest"

export type Backend = "mysql" | "pg"
export type LockMode = "advisory" | "row"
export type LockFaultMode = "blackhole" | "stuck" | "fail" | "hangRelease" | "clear"
export type SocketDirection = "inbound" | "outbound"

export interface ClusterRunner {
  readonly address: RunnerAddress.RunnerAddress
  readonly index: number
  readonly shardGroups: ReadonlyArray<string>
  readonly sharding: Sharding.Sharding["Service"]
  readonly state: () => "frozen" | "killed" | "running" | "stopped"
}

/** A raw TCP caller whose transport can close without a Sharding retry. */
export const makeRawRunnerClient = Effect.fnUntraced(function*(runner: ClusterRunner) {
  const serialization = yield* RpcSerialization.RpcSerialization.pipe(
    Effect.provide(RpcSerialization.layerSchemaBinary())
  )
  const transport = yield* Effect.acquireRelease(Scope.make(), (scope) => Scope.close(scope, Exit.void))
  const socket = yield* NodeSocket.makeNet({ host: runner.address.host, port: runner.address.port })
  const protocol = yield* RpcClient.makeProtocolSocket().pipe(
    Effect.provideService(Socket.Socket, socket),
    Effect.provideService(RpcSerialization.RpcSerialization, serialization),
    Scope.provide(transport)
  )
  const client = yield* RpcClient.make(Runners.Rpcs).pipe(
    Effect.provideService(RpcClient.Protocol, protocol),
    Scope.provide(transport)
  )
  return { client, codecFor: serialization.codecFor, disconnect: Scope.close(transport, Exit.void) }
})

export interface MessageCounts {
  readonly failed: number
  readonly replied: number
  readonly unprocessed: number
}

export interface MakeOptions {
  readonly backend: Backend
  readonly config?: Partial<ShardingConfig.ShardingConfig["Service"]> | undefined
  readonly entities:
    | RunnerEntities
    | ((options: { readonly prefix: string }) => RunnerEntities)
  readonly lockMode?: LockMode | undefined
  readonly runnerLayer?: RunnerLayer | undefined
}

export interface StartOptions {
  readonly assignedShardGroups?: ReadonlyArray<string> | undefined
  readonly entities?: RunnerEntities | undefined
  readonly runnerShardWeight?: number | undefined
}

export interface CutSocketOptions {
  readonly direction: SocketDirection
  readonly peer: ClusterRunner | "client"
}

export interface InsertMessageRow {
  readonly deliver_at: number | bigint | null
  readonly entity_id: string
  readonly entity_type: string
  readonly headers: string | null
  readonly id: string | bigint
  readonly kind: 0 | 1 | 2
  readonly message_id: string | null
  readonly payload: string | null
  readonly reply_id: string | bigint | null
  readonly request_id: string | bigint
  readonly sampled: boolean | number | null
  readonly shard_id: string
  readonly span_id: string | null
  readonly tag: string | null
  readonly trace_id: string | null
}

type HarnessConfig = Partial<ShardingConfig.ShardingConfig["Service"]> & {
  readonly shardLockDisableAdvisory: boolean
}

export type RunnerEntities = Layer.Layer<
  never,
  never,
  Sharding.Sharding | MessageStorage.MessageStorage | SqlClient.SqlClient
>

interface RegistrationRow {
  readonly address: string
  readonly healthy: boolean | number
  readonly last_heartbeat: Date | string
  readonly runner: unknown
}

interface MessageRow {
  readonly processed: boolean | number
  readonly reply_payload: string | Record<string, unknown> | null
}

interface RunnerEntry extends ClusterRunner {
  readonly controller: ReturnType<typeof makeRunnerStorageController>
  readonly lockFault: ReturnType<typeof makeLockFaultController>
  readonly scope: Scope.Closeable
  setState(state: ReturnType<ClusterRunner["state"]>): void
}

const clusterConfig = {
  entityMaxIdleTime: 3_000,
  entityMessagePollInterval: 500,
  refreshAssignmentsInterval: 150,
  shardLockExpiration: 1_750,
  shardLockRefreshInterval: 500
} as const

let nextCluster = 0

interface LockSession {
  fault: "blackhole" | "fail" | undefined
}

const makeLockFaultController = (sql: SqlClient.SqlClient) => {
  const releaseGate = Latch.makeUnsafe(true)
  let persistentFault: "stuck" | "hangRelease" | undefined
  let currentSession: LockSession | undefined

  const wrapConnection = (
    connection: SqlConnection.Connection,
    session: LockSession
  ): SqlConnection.Connection => {
    const execute = <A, E extends SqlError.SqlError, R>(sql: string, effect: Effect.Effect<A, E, R>) =>
      Effect.suspend((): Effect.Effect<A, E | SqlError.SqlError, R> => {
        // Let scope cleanup release advisory locks even when the simulated
        // operational connection is stuck. `hangRelease` blocks teardown with
        // the separate gate below, after the database lock has been dropped.
        if (sql.includes("pg_advisory_unlock_all") || sql.includes("RELEASE_ALL_LOCKS")) return effect
        const mode = session.fault ?? persistentFault
        if (mode === "fail") {
          return Effect.fail(
            new SqlError.SqlError({
              reason: new SqlError.ConnectionError({ cause: new Error("lock connection lost") })
            })
          )
        }
        if (mode === "blackhole") {
          return Effect.never
        }
        if (mode === "stuck" || mode === "hangRelease") {
          return Effect.never
        }
        return effect
      })
    return {
      ...connection,
      execute: (...args) => execute(args[0], connection.execute(...args)),
      executeRaw: (...args) => execute(args[0], connection.executeRaw(...args)),
      executeValues: (...args) => execute(args[0], connection.executeValues(...args)),
      executeValuesUnprepared: (...args) => execute(args[0], connection.executeValuesUnprepared(...args)),
      executeUnprepared: (...args) => execute(args[0], connection.executeUnprepared(...args))
    }
  }

  const transformFreeSql = sql.withoutTransforms()
  const client: SqlClient.SqlClient = new Proxy(transformFreeSql, {
    get(target, property, receiver) {
      if (property === "reserve") {
        return Effect.gen(function*() {
          const session: LockSession = { fault: undefined }
          currentSession = session
          yield* Effect.addFinalizer(() =>
            Effect.uninterruptible(
              Effect.suspend(() => persistentFault === "hangRelease" ? releaseGate.await : Effect.void)
            )
          )
          return wrapConnection(yield* target.reserve, session)
        })
      }
      if (property === "withoutTransforms") {
        return () => client
      }
      return Reflect.get(target, property, receiver)
    }
  })

  const set = (mode: LockFaultMode) =>
    Effect.sync(() => {
      if (mode === "clear") {
        persistentFault = undefined
        if (currentSession !== undefined) currentSession.fault = undefined
        releaseGate.openUnsafe()
      } else if (mode === "blackhole" || mode === "fail") {
        if (currentSession === undefined) throw new Error("Runner has no reserved lock connection")
        persistentFault = undefined
        releaseGate.openUnsafe()
        currentSession.fault = mode
      } else {
        persistentFault = mode
        if (currentSession !== undefined) currentSession.fault = undefined
        if (mode === "hangRelease") releaseGate.closeUnsafe()
        else releaseGate.openUnsafe()
      }
    })

  return { client, set }
}

const makeRunnerStorageController = (storage: RunnerStorage.RunnerStorage["Service"]) => {
  const gate = Latch.makeUnsafe(true)
  const refreshPaused = Latch.makeUnsafe()
  const syncPaused = Latch.makeUnsafe()
  let mode: "frozen" | "killed" | "running" = "running"
  let lastRunners: Array<readonly [RunnerModel.Runner, boolean]> = []

  const waitWhileFrozen = <A, E>(
    paused: Latch.Latch,
    effect: Effect.Effect<A, E>,
    onKilled: () => A
  ): Effect.Effect<A, E> =>
    Effect.suspend(() => {
      if (mode === "running") return effect
      if (mode === "killed") return Effect.succeed(onKilled())
      paused.openUnsafe()
      return gate.await.pipe(
        Effect.uninterruptible,
        Effect.andThen(Effect.suspend(() => mode === "running" ? effect : Effect.succeed(onKilled())))
      )
    })

  const controlled = RunnerStorage.RunnerStorage.of({
    ...storage,
    getRunners: waitWhileFrozen(
      syncPaused,
      storage.getRunners.pipe(Effect.tap((runners) => Effect.sync(() => lastRunners = runners))),
      () => lastRunners
    ),
    refresh: (address, shardIds) => {
      const shards = Array.from(shardIds)
      return waitWhileFrozen(refreshPaused, storage.refresh(address, shards), () => shards)
    },
    release: (address, shardId) => mode === "killed" ? Effect.void : storage.release(address, shardId),
    releaseAll: (address) => mode === "killed" ? Effect.void : storage.releaseAll(address),
    unregister: (address) => mode === "killed" ? Effect.void : storage.unregister(address)
  })

  return {
    controlled,
    freeze: Effect.sync(() => {
      mode = "frozen"
      gate.closeUnsafe()
    }).pipe(Effect.andThen(Effect.all([refreshPaused.await, syncPaused.await], { discard: true }))),
    kill: Effect.sync(() => {
      mode = "killed"
      gate.openUnsafe()
    }),
    resume: Effect.sync(() => {
      mode = "running"
      gate.openUnsafe()
    })
  }
}

const clientPeer = "client"
const addressKey = (address: RunnerAddress.RunnerAddress) => `${address.host}:${address.port}`

const makeSocketController = () => {
  const connections = new Map<string, Set<Net.Socket>>()
  const linkKey = (source: string, target: string) => `${source}->${target}`

  const add = (source: string, target: RunnerAddress.RunnerAddress, socket: Net.Socket) => {
    const key = linkKey(source, addressKey(target))
    let active = connections.get(key)
    if (active === undefined) {
      active = new Set()
      connections.set(key, active)
    }
    active.add(socket)
  }

  const remove = (source: string, target: RunnerAddress.RunnerAddress, socket: Net.Socket) => {
    const key = linkKey(source, addressKey(target))
    const active = connections.get(key)
    if (active === undefined) return
    active.delete(socket)
    if (active.size === 0) connections.delete(key)
  }

  const cut = (source: string, target: string) =>
    Effect.sync(() => {
      const active = connections.get(linkKey(source, target))
      const socket = active?.values().next().value as Net.Socket | undefined
      if (socket === undefined) {
        throw new Error(`No active socket from ${source} to ${target}`)
      }
      socket.destroy(new Error(`Socket cut from ${source} to ${target}`))
    })

  return { add, cut, remove }
}

type SocketController = ReturnType<typeof makeSocketController>

const trackedClientProtocolLayer = (
  controller: SocketController,
  source: string
): Layer.Layer<Runners.RpcClientProtocol, never, RpcSerialization.RpcSerialization> =>
  Layer.effect(Runners.RpcClientProtocol)(
    Effect.gen(function*() {
      const serialization = yield* RpcSerialization.RpcSerialization
      return {
        codecFor: serialization.codecFor,
        make: Effect.fnUntraced(function*(address) {
          const socket = yield* NodeSocket.fromDuplex(
            Effect.acquireRelease(
              Effect.callback<Net.Socket, Socket.SocketError>((resume) => {
                const connection = Net.createConnection({
                  host: address.host,
                  port: address.port
                })
                connection.once("connect", () => {
                  controller.add(source, address, connection)
                  resume(Effect.succeed(connection))
                })
                connection.on("error", (cause) => {
                  resume(Effect.fail(
                    new Socket.SocketError({
                      reason: new Socket.SocketOpenError({ kind: "Unknown", cause })
                    })
                  ))
                })
                return Effect.sync(() => connection.destroy())
              }),
              (connection) =>
                Effect.sync(() => {
                  controller.remove(source, address, connection)
                  if (!connection.closed) connection.destroySoon()
                })
            ),
            { openTimeout: 1_000 }
          )
          return yield* RpcClient.makeProtocolSocket().pipe(
            Effect.provideService(Socket.Socket, socket),
            Effect.provideService(RpcSerialization.RpcSerialization, serialization)
          )
        }, Effect.orDie)
      }
    })
  )

const runnerHealthLayer = (
  clientProtocol: Layer.Layer<Runners.RpcClientProtocol, never, RpcSerialization.RpcSerialization>
) =>
  RunnerHealth.layerPing.pipe(
    Layer.provide(Runners.layerRpc),
    Layer.provide(clientProtocol)
  )

export const socketRunnerLayer = (
  address: RunnerAddress.RunnerAddress,
  entities: RunnerEntities,
  socketServer: SocketServer.SocketServer["Service"],
  config: HarnessConfig,
  clientProtocol = NodeClusterSocket.layerClientProtocol
) =>
  entities.pipe(
    Layer.provideMerge(SocketRunner.layer),
    Layer.provide(runnerHealthLayer(clientProtocol)),
    Layer.provide(Layer.succeed(SocketServer.SocketServer, socketServer)),
    Layer.provide(clientProtocol),
    Layer.provide(ShardingConfig.layer({
      ...config,
      runnerAddress: Option.some(address)
    })),
    Layer.provide(RpcSerialization.layerSchemaBinary())
  )

export type RunnerLayer = typeof socketRunnerLayer

const clientLayer = (
  config: HarnessConfig,
  clientProtocol: Layer.Layer<Runners.RpcClientProtocol, never, RpcSerialization.RpcSerialization>
) =>
  SocketRunner.layerClientOnly.pipe(
    Layer.provide(clientProtocol),
    Layer.provide(ShardingConfig.layer(config)),
    Layer.provide(RpcSerialization.layerSchemaBinary())
  )

const parseReply = (payload: MessageRow["reply_payload"]): Record<string, unknown> | undefined => {
  if (payload === null) return undefined
  return typeof payload === "string" ? JSON.parse(payload) : payload
}

export const make = Effect.fnUntraced(function*(options: MakeOptions) {
  const parentScope = yield* Effect.scope
  const prefix = `cluster_${process.pid}_${nextCluster++}`
  const config = {
    ...clusterConfig,
    ...options.config,
    shardLockDisableAdvisory: options.lockMode === "row"
  }
  const databases = inject("clusterDatabases")
  const databaseLayer = options.backend === "pg"
    ? PgClient.layer({ url: Redacted.make(databases.pg), maxConnections: 32 })
    : MysqlClient.layer({ url: Redacted.make(databases.mysql), maxConnections: 32 })
  const database = yield* Layer.buildWithScope(databaseLayer, parentScope)
  const sql = Context.get(database, SqlClient.SqlClient).withoutTransforms()
  const messageStorage = yield* SqlMessageStorage.layerWith({ prefix }).pipe(
    Layer.provide(NodeCrypto.layer),
    Layer.provide(ShardingConfig.layer(config)),
    Layer.buildWithScope(parentScope),
    Effect.provide(database)
  )
  const shared = Context.merge(database, messageStorage)
  const entities = typeof options.entities === "function" ? options.entities({ prefix }) : options.entities
  const runners: Array<RunnerEntry> = []
  const socketController = makeSocketController()

  const makeRunnerStorage = Effect.fnUntraced(function*(
    scope: Scope.Closeable,
    storageConfig: HarnessConfig = config,
    storageDatabase: Context.Context<SqlClient.SqlClient> = database
  ) {
    return yield* SqlRunnerStorage.layerWith({ prefix }).pipe(
      Layer.provide(ShardingConfig.layer(storageConfig)),
      Layer.orDie,
      Layer.buildWithScope(scope),
      Effect.provide(storageDatabase)
    )
  })

  const clientScope = yield* Scope.fork(parentScope)
  const clientStorage = yield* makeRunnerStorage(clientScope)
  const clientBase = yield* clientLayer(config, trackedClientProtocolLayer(socketController, clientPeer)).pipe(
    Layer.buildWithScope(clientScope),
    Effect.provide(Context.merge(shared, clientStorage))
  )
  const workflowEngine = yield* ClusterWorkflowEngine.make.pipe(
    Effect.provide(Context.merge(shared, clientBase))
  )
  const client = Context.add(clientBase, WorkflowEngine.WorkflowEngine, workflowEngine)
  const clientSharding = Context.get(client, Sharding.Sharding)
  let nextRunnerIndex = 0
  const startRunner = Effect.fnUntraced(function*(index: number, startOptions?: StartOptions) {
    const scope = yield* Scope.fork(parentScope)
    const runnerConfig: HarnessConfig = {
      ...config,
      ...(startOptions?.assignedShardGroups === undefined
        ? undefined
        : { assignedShardGroups: startOptions.assignedShardGroups }),
      ...(startOptions?.runnerShardWeight === undefined
        ? undefined
        : { runnerShardWeight: startOptions.runnerShardWeight })
    }
    const serverContext = yield* NodeSocketServer.layer({ host: "127.0.0.1", port: 0 }).pipe(
      Layer.buildWithScope(scope)
    )
    const socketServer = Context.get(serverContext, SocketServer.SocketServer)
    if (socketServer.address._tag === "UnixPathAddress") {
      return yield* Effect.die("Expected a TCP socket server")
    }
    const address = RunnerAddress.make("127.0.0.1", socketServer.address.port)
    const lockFault = makeLockFaultController(Context.get(database, SqlClient.SqlClient))
    const runnerDatabase = Context.add(database, SqlClient.SqlClient, lockFault.client)
    const rawStorageContext = yield* makeRunnerStorage(scope, runnerConfig, runnerDatabase)
    yield* Scope.addFinalizer(scope, lockFault.set("clear"))
    const controller = makeRunnerStorageController(Context.get(rawStorageContext, RunnerStorage.RunnerStorage))
    const storage = Context.make(RunnerStorage.RunnerStorage, controller.controlled)
    const context = yield* (options.runnerLayer ?? socketRunnerLayer)(
      address,
      startOptions?.entities ?? entities,
      socketServer,
      runnerConfig,
      trackedClientProtocolLayer(socketController, addressKey(address))
    ).pipe(
      Layer.buildWithScope(scope),
      Effect.provide(Context.mergeAll(shared, storage))
    )
    const sharding = Context.get(context, Sharding.Sharding)
    let state: ReturnType<ClusterRunner["state"]> = "running"
    const runner: RunnerEntry = {
      address,
      controller,
      index,
      lockFault,
      shardGroups: runnerConfig.assignedShardGroups ?? ShardingConfig.defaults.assignedShardGroups,
      scope,
      setState(next) {
        state = next
      },
      sharding,
      state: () => state
    }
    runners.push(runner)
    return runner as ClusterRunner
  })

  const start = Effect.fnUntraced(function*(runnerCount: number, startOptions?: StartOptions) {
    return yield* Effect.forEach(
      Array.from({ length: runnerCount }, () => nextRunnerIndex++),
      (index) => startRunner(index, startOptions)
    )
  })

  const entryFor = (runner: ClusterRunner) => runners.find((entry) => entry === runner)!

  const stop = Effect.fnUntraced(function*(runner: ClusterRunner) {
    const entry = entryFor(runner)
    if (entry.state() === "stopped" || entry.state() === "killed") return
    if (entry.state() === "frozen") yield* entry.controller.resume
    entry.setState("stopped")
    yield* Scope.close(entry.scope, Exit.void)
  })

  const kill = Effect.fnUntraced(function*(runner: ClusterRunner) {
    const entry = entryFor(runner)
    if (entry.state() === "stopped" || entry.state() === "killed") return
    entry.setState("killed")
    yield* entry.controller.kill
    yield* Scope.close(entry.scope, Exit.void)
  })

  const freeze = Effect.fnUntraced(function*(runner: ClusterRunner) {
    const entry = entryFor(runner)
    if (entry.state() !== "running") return
    entry.setState("frozen")
    yield* entry.controller.freeze
  })

  const faultLock = (runner: ClusterRunner, mode: LockFaultMode) => entryFor(runner).lockFault.set(mode)

  const cutSocket = (runner: ClusterRunner, options: CutSocketOptions) => {
    const runnerAddress = addressKey(runner.address)
    const peerAddress = options.peer === "client" ? clientPeer : addressKey(options.peer.address)
    const [source, target] = options.direction === "inbound"
      ? [peerAddress, runnerAddress]
      : [runnerAddress, peerAddress]
    return socketController.cut(source, target)
  }

  const insertMessage = (row: InsertMessageRow) => {
    const messages = sql(`${prefix}_messages`)
    return sql`INSERT INTO ${messages} ${sql.insert({ ...row })}`.unprepared.pipe(Effect.asVoid)
  }

  const assignmentMap = () => {
    const assignments: Record<string, ReadonlyArray<string>> = {}
    const groups = config.availableShardGroups ?? ShardingConfig.defaults.availableShardGroups
    const shardsPerGroup = config.shardsPerGroup ?? ShardingConfig.defaults.shardsPerGroup
    for (const group of groups) {
      for (let id = 1; id <= shardsPerGroup; id++) {
        const shard = ShardId.make(group, id)
        assignments[shard.toString()] = runners
          .filter((runner) => runner.state() === "running" && runner.sharding.hasShardId(shard))
          .map((runner) => `${runner.address.host}:${runner.address.port}`)
      }
    }
    return assignments
  }

  const ownersOfShard = (shard: ShardId.ShardId, includeInactive = false) =>
    runners.filter((runner) => (includeInactive || runner.state() === "running") && runner.sharding.hasShardId(shard))

  const messageCounts = Effect.fnUntraced(function*() {
    const messages = sql(`${prefix}_messages`)
    const replies = sql(`${prefix}_replies`)
    const rows = yield* sql<MessageRow>`
      SELECT m.processed, r.payload AS reply_payload
      FROM ${messages} m
      LEFT JOIN ${replies} r ON r.id = m.last_reply_id
      WHERE m.kind = 0
    `
    let failed = 0
    let replied = 0
    let unprocessed = 0
    for (const row of rows) {
      if (!row.processed) {
        unprocessed++
        continue
      }
      const reply = parseReply(row.reply_payload)
      if (reply?._tag === "Success") replied++
      if (reply?._tag === "Failure") failed++
    }
    return { failed, replied, unprocessed } satisfies MessageCounts
  })

  const diagnostics = Effect.fnUntraced(function*() {
    const table = sql(`${prefix}_runners`)
    const registrations = yield* sql<RegistrationRow>`
      SELECT address, runner, healthy, last_heartbeat
      FROM ${table}
      ORDER BY address
    `
    return {
      assignments: assignmentMap(),
      messageCounts: yield* messageCounts(),
      registrations
    }
  })

  const waitUntil = Effect.fnUntraced(function*<E, R>(
    description: string,
    condition: Effect.Effect<boolean, E, R>,
    timeout: Duration.Input = "15 seconds"
  ) {
    const started = yield* Clock.currentTimeMillis
    const deadline = started + Duration.toMillis(Duration.fromInputUnsafe(timeout))
    if (yield* Effect.provide(condition, client)) return
    while ((yield* Clock.currentTimeMillis) < deadline) {
      yield* Effect.sleep(100)
      if (yield* Effect.provide(condition, client)) return
    }
    const state = yield* diagnostics()
    return yield* Effect.fail(new Error(`${description}\n${JSON.stringify(state, null, 2)}`))
  })

  const waitForStableAssignments = Effect.fnUntraced(function*(timeout?: Duration.Input) {
    let previous = ""
    let stablePolls = 0
    yield* waitUntil(
      "Shard assignments did not stabilize before the deadline",
      Effect.sync(() => {
        const current = assignmentMap()
        const owners = new Set(Object.values(current).flat())
        const complete = Object.values(current).every((owners) => owners.length === 1) &&
          runners.every((runner) =>
            runner.state() !== "running" || owners.has(`${runner.address.host}:${runner.address.port}`)
          )
        const encoded = complete ? JSON.stringify(current) : ""
        stablePolls = encoded !== "" && encoded === previous ? stablePolls + 1 : 0
        previous = encoded
        return stablePolls >= 3
      }),
      timeout
    )
    return assignmentMap()
  })

  const shardOfEntity = <Type extends string, Rpcs extends Rpc.Any>(
    entity: Entity.Entity<Type, Rpcs>,
    entityId: string
  ) => entity.getShardId(EntityId.make(entityId)).pipe(Effect.provide(client))

  const ownerOfEntity = Effect.fnUntraced(function*<Type extends string, Rpcs extends Rpc.Any>(
    entity: Entity.Entity<Type, Rpcs>,
    entityId: string
  ) {
    const shardId = yield* shardOfEntity(entity, entityId)
    return runners.find((runner) => runner.state() === "running" && runner.sharding.hasShardId(shardId)) as
      | ClusterRunner
      | undefined
  })

  const waitForEntityOwner = <Type extends string, Rpcs extends Rpc.Any>(
    entity: Entity.Entity<Type, Rpcs>,
    entityId: string,
    runner: ClusterRunner,
    timeout?: Duration.Input
  ) =>
    waitUntil(
      `Entity ${entity.type}/${entityId} was not owned by runner ${runner.index} before the deadline`,
      Effect.map(ownerOfEntity(entity, entityId), (owner) => owner === runner),
      timeout
    )

  const getClient = <Type extends string, Rpcs extends Rpc.Any>(entity: Entity.Entity<Type, Rpcs>) =>
    entity.client.pipe(Effect.provide(client))

  return {
    assignmentMap,
    backend: options.backend,
    clientSharding,
    cutSocket,
    diagnostics,
    failedMessageCount: Effect.map(messageCounts(), (counts) => counts.failed),
    faultLock,
    freeze,
    getClient,
    insertMessage,
    kill,
    lockMode: options.lockMode ?? "advisory",
    messageCounts,
    ownerOfEntity,
    ownersOfShard,
    prefix,
    repliedMessageCount: Effect.map(messageCounts(), (counts) => counts.replied),
    runners: runners as ReadonlyArray<ClusterRunner>,
    shardOfEntity,
    start,
    stop,
    unprocessedMessageCount: Effect.map(messageCounts(), (counts) => counts.unprocessed),
    waitForEntityOwner,
    waitForStableAssignments,
    waitUntil,
    workflowEngine
  } as const
})
