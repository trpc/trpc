/**
 * Defines addressable entity types for Effect Cluster.
 *
 * An entity gives a stable name and RPC protocol to a group of values that are
 * addressed by id. The cluster uses that information to choose a shard and
 * route each request to the runner responsible for that id. This module
 * includes constructors for entity definitions, helpers for creating sharded
 * clients, layer builders for registering handlers, and services that expose
 * the current entity address while a request is being handled.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Arr from "../Array.ts"
import type * as Cause from "../Cause.ts"
import * as Context from "../Context.ts"
import * as Data from "../Data.ts"
import type * as Duration from "../Duration.ts"
import * as Effect from "../Effect.ts"
import * as Equal from "../Equal.ts"
import * as Exit from "../Exit.ts"
import { identity } from "../Function.ts"
import * as Hash from "../Hash.ts"
import * as Headers from "../http/Headers.ts"
import type * as Latch from "../Latch.ts"
import * as Layer from "../Layer.ts"
import * as Option from "../Option.ts"
import * as Predicate from "../Predicate.ts"
import * as Queue from "../Queue.ts"
import * as Rpc from "../rpc/Rpc.ts"
import * as RpcClient from "../rpc/RpcClient.ts"
import * as RpcGroup from "../rpc/RpcGroup.ts"
import * as RpcSchema from "../rpc/RpcSchema.ts"
import * as RpcServer from "../rpc/RpcServer.ts"
import type * as Schedule from "../Schedule.ts"
import { Scope } from "../Scope.ts"
import * as Stream from "../Stream.ts"
import type {
  AlreadyProcessingMessage,
  EntityNotAssignedToRunner,
  MailboxFull,
  PersistenceError
} from "./ClusterError.ts"
import { Persisted, ShardGroup, Uninterruptible } from "./ClusterSchema.ts"
import { EntityAddress } from "./EntityAddress.ts"
import type { EntityId } from "./EntityId.ts"
import { EntityType } from "./EntityType.ts"
import * as Envelope from "./Envelope.ts"
import { CurrentActivationScope } from "./internal/entityActivation.ts"
import { hashString } from "./internal/hash.ts"
import { ResourceMap } from "./internal/resourceMap.ts"
import * as Message from "./Message.ts"
import type * as Reply from "./Reply.ts"
import { RunnerAddress } from "./RunnerAddress.ts"
import * as ShardId from "./ShardId.ts"
import type { Sharding } from "./Sharding.ts"
import { ShardingConfig } from "./ShardingConfig.ts"
import * as Snowflake from "./Snowflake.ts"

const TypeId = "~effect/cluster/Entity"

/**
 * Represents a cluster entity type and the RPC protocol it can handle.
 *
 * **Details**
 *
 * An entity defines how ids map to shard groups, exposes a sharded client, and
 * can be registered as a layer using RPC handlers or a mailbox queue.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Entity<
  in out Type extends string,
  in out Rpcs extends Rpc.Any
> extends Equal.Equal {
  readonly [TypeId]: typeof TypeId
  /**
   * The name of the entity type.
   */
  readonly type: EntityType

  /**
   * A RpcGroup definition for messages which represents the messaging protocol
   * that the entity is capable of processing.
   */
  readonly protocol: RpcGroup.RpcGroup<Rpcs>

  /**
   * Get the shard group for the given EntityId.
   */
  getShardGroup(entityId: EntityId): string

  /**
   * Get the ShardId for the given EntityId.
   */
  getShardId(entityId: EntityId): Effect.Effect<ShardId.ShardId, never, Sharding>

  /**
   * Annotate the entity with a value.
   */
  annotate<I, S>(key: Context.Key<I, S>, value: S): Entity<Type, Rpcs>

  /**
   * Annotate the Rpc's above this point with a value.
   */
  annotateRpcs<I, S>(key: Context.Key<I, S>, value: S): Entity<Type, Rpcs>

  /**
   * Annotate the entity with the given annotations.
   */
  annotateMerge<S>(annotation: Context.Context<S>): Entity<Type, Rpcs>

  /**
   * Annotate the Rpc's above this point with a context object.
   */
  annotateRpcsMerge<S>(context: Context.Context<S>): Entity<Type, Rpcs>

  /**
   * Create a client for this entity.
   */
  readonly client: Effect.Effect<
    (
      entityId: string
    ) => RpcClient.RpcClient.From<
      Rpcs,
      MailboxFull | AlreadyProcessingMessage | PersistenceError | EntityNotAssignedToRunner
    >,
    never,
    Sharding
  >

  /**
   * Create a Layer from an Entity.
   *
   * **Details**
   *
   * It will register the entity with the Sharding service.
   */
  toLayer<
    Handlers extends HandlersFrom<Rpcs>,
    RX = never
  >(
    build: Handlers | Effect.Effect<Handlers, never, RX>,
    options?: {
      readonly maxIdleTime?: Duration.Input | undefined
      readonly concurrency?: number | "unbounded" | undefined
      readonly mailboxCapacity?: number | "unbounded" | undefined
      readonly disableFatalDefects?: boolean | undefined
      readonly defectRetryPolicy?: Schedule.Schedule<any, unknown> | undefined
      readonly spanAttributes?: Record<string, string> | undefined
    }
  ): Layer.Layer<
    never,
    never,
    | Exclude<RX, Scope | CurrentAddress | CurrentRunnerAddress>
    | RpcGroup.HandlersServices<Rpcs, Handlers>
    | Rpc.ServicesClient<Rpcs>
    | Rpc.ServicesServer<Rpcs>
    | Rpc.Middleware<Rpcs>
    | Sharding
  >

  of<Handlers extends HandlersFrom<Rpcs>>(handlers: Handlers): Handlers

  /**
   * Create a Layer from an Entity.
   *
   * **Details**
   *
   * It will register the entity with the Sharding service.
   */
  toLayerQueue<
    R,
    RX = never
  >(
    build:
      | ((
        queue: Queue.Dequeue<Envelope.Request<Rpcs>>,
        replier: Replier<Rpcs>
      ) => Effect.Effect<never, never, R>)
      | Effect.Effect<
        (
          queue: Queue.Dequeue<Envelope.Request<Rpcs>>,
          replier: Replier<Rpcs>
        ) => Effect.Effect<never, never, R>,
        never,
        RX
      >,
    options?: {
      readonly maxIdleTime?: Duration.Input | undefined
      readonly mailboxCapacity?: number | "unbounded" | undefined
      readonly disableFatalDefects?: boolean | undefined
      readonly defectRetryPolicy?: Schedule.Schedule<any, unknown> | undefined
      readonly spanAttributes?: Record<string, string> | undefined
    }
  ): Layer.Layer<
    never,
    never,
    | Exclude<RX, Scope | CurrentAddress | CurrentRunnerAddress>
    | R
    | Rpc.ServicesClient<Rpcs>
    | Rpc.ServicesServer<Rpcs>
    | Rpc.Middleware<Rpcs>
    | Sharding
  >
}
/**
 * Type alias for any cluster `Entity`, regardless of entity type or RPC
 * protocol.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Any = Entity<string, Rpc.Any>

/**
 * Maps each RPC in an entity protocol to the handler function expected by
 * `Entity.toLayer`.
 *
 * **Details**
 *
 * Each handler receives the entity request envelope for that RPC and returns the
 * RPC result or a supported RPC wrapper.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type HandlersFrom<Rpc extends Rpc.Any> = {
  readonly [Current in Rpc as Current["_tag"]]: (
    envelope: Request<Current>
  ) => Rpc.WrapperOr<Rpc.ResultFrom<Current, any>>
}

/**
 * Returns `true` when the supplied value is a cluster `Entity`.
 *
 * **Details**
 *
 * The check is based on the internal entity type identifier.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isEntity = (u: unknown): u is Any => Predicate.hasProperty(u, TypeId)

const Proto = {
  [TypeId]: TypeId,
  [Hash.symbol](this: Entity<string, any>): number {
    return Hash.structure({ type: this.type })
  },
  [Equal.symbol](this: Entity<string, any>, that: Equal.Equal): boolean {
    return isEntity(that) && this.type === that.type
  },
  annotate<I, S>(this: Entity<string, any>, key: Context.Key<I, S>, value: S) {
    return fromRpcGroup(this.type, this.protocol.annotate(key, value))
  },
  annotateRpcs<I, S>(this: Entity<string, any>, key: Context.Key<I, S>, value: S) {
    return fromRpcGroup(this.type, this.protocol.annotateRpcs(key, value))
  },
  annotateMerge<S>(this: Entity<string, any>, annotations: Context.Context<S>) {
    return fromRpcGroup(this.type, this.protocol.annotateMerge(annotations))
  },
  annotateRpcsMerge<S>(this: Entity<string, any>, annotations: Context.Context<S>) {
    return fromRpcGroup(this.type, this.protocol.annotateRpcsMerge(annotations))
  },
  getShardId(this: Entity<string, any>, entityId: EntityId) {
    return Effect.map(shardingTag, (sharding) => sharding.getShardId(entityId, this.getShardGroup(entityId)))
  },
  get client() {
    return shardingTag.pipe(
      Effect.flatMap((sharding) => sharding.makeClient(this as any))
    )
  },
  toLayer<
    Rpcs extends Rpc.Any,
    Handlers extends HandlersFrom<Rpcs>,
    RX = never
  >(
    this: Entity<string, Rpcs>,
    build: Handlers | Effect.Effect<Handlers, never, RX>,
    options?: {
      readonly maxIdleTime?: Duration.Input | undefined
      readonly concurrency?: number | "unbounded" | undefined
      readonly mailboxCapacity?: number | "unbounded" | undefined
      readonly disableFatalDefects?: boolean | undefined
      readonly defectRetryPolicy?: Schedule.Schedule<any, unknown> | undefined
      readonly spanAttributes?: Record<string, string> | undefined
    }
  ): Layer.Layer<
    never,
    never,
    | Exclude<RX, Scope | CurrentAddress | CurrentRunnerAddress>
    | RpcGroup.HandlersServices<Rpcs, Handlers>
    | Rpc.ServicesClient<Rpcs>
    | Rpc.ServicesServer<Rpcs>
    | Rpc.Middleware<Rpcs>
    | Sharding
  > {
    return shardingTag.pipe(
      Effect.flatMap((sharding) =>
        sharding.registerEntity(
          this,
          Effect.isEffect(build) ? build : Effect.succeed(build),
          options
        )
      ),
      Layer.effectDiscard
    )
  },
  of: identity,
  toLayerQueue<
    Rpcs extends Rpc.Any,
    R,
    RX = never
  >(
    this: Entity<string, Rpcs>,
    build:
      | ((
        mailbox: Queue.Dequeue<Envelope.Request<Rpcs>>,
        replier: Replier<Rpcs>
      ) => Effect.Effect<never, never, R>)
      | Effect.Effect<
        (
          mailbox: Queue.Dequeue<Envelope.Request<Rpcs>>,
          replier: Replier<Rpcs>
        ) => Effect.Effect<never, never, R>,
        never,
        RX
      >,
    options?: {
      readonly maxIdleTime?: Duration.Input | undefined
      readonly mailboxCapacity?: number | "unbounded" | undefined
      readonly disableFatalDefects?: boolean | undefined
      readonly defectRetryPolicy?: Schedule.Schedule<any, unknown> | undefined
      readonly spanAttributes?: Record<string, string> | undefined
    }
  ) {
    const buildHandlers = Effect.gen({ self: this }, function*() {
      const behaviour = Effect.isEffect(build) ? yield* build : build
      const queue = yield* Queue.make<Envelope.Request<Rpcs>>()

      // create the rpc handlers for the entity
      const handler = (envelope: any) =>
        Effect.callback<any, any>((resume) => {
          Queue.offerUnsafe(queue, envelope)
          resumes.set(envelope, resume)
        })
      const streamHandler = (envelope: any) =>
        Effect.callback<any, any>((resume) => {
          Queue.offerUnsafe(queue, envelope)
          resumes.set(envelope, resume)
        }).pipe(
          Effect.map((streamOrQueue) =>
            Stream.isStream(streamOrQueue) ? streamOrQueue : Stream.fromQueue(streamOrQueue)
          ),
          Stream.unwrap
        )
      const handlers: Record<string, any> = Object.create(null)
      for (const rpc_ of this.protocol.requests.values()) {
        const rpc = rpc_ as any as Rpc.AnyWithProps
        handlers[rpc._tag] = RpcSchema.isStreamSchema(rpc.successSchema) ? streamHandler : handler
      }

      // make the Replier for the behaviour
      const resumes = new Map<Envelope.Request<any>, (exit: Exit.Exit<any, any>) => void>()
      const complete = (request: Envelope.Request<any>, exit: Exit.Exit<any, any>) =>
        Effect.sync(() => {
          const resume = resumes.get(request)
          if (resume) {
            resumes.delete(request)
            resume(exit)
          }
        })
      const replier: Replier<Rpcs> = {
        succeed: (request, value) => complete(request, Exit.succeed(value)),
        fail: (request, error) => complete(request, Exit.fail(error)),
        failCause: (request, cause) => complete(request, Exit.failCause(cause)),
        complete
      }

      // fork the behaviour into the layer scope
      yield* behaviour(queue, replier).pipe(
        Effect.catchCause((cause) => {
          const exit = Exit.failCause(cause)
          for (const resume of resumes.values()) {
            resume(exit)
          }
          return Effect.void
        }),
        Effect.interruptible,
        Effect.forkScoped
      )

      return handlers as any
    })

    return this.toLayer(buildHandlers, {
      ...options,
      concurrency: "unbounded"
    })
  }
}

/**
 * Creates a new `Entity` of the specified `type` which will accept messages
 * that adhere to the provided `RpcGroup`.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const fromRpcGroup = <const Type extends string, Rpcs extends Rpc.Any>(
  /**
   * The entity type name.
   */
  type: Type,
  /**
   * The schema definition for messages that the entity is capable of
   * processing.
   */
  protocol: RpcGroup.RpcGroup<Rpcs>
): Entity<Type, Rpcs> => {
  const self = Object.create(Proto)
  self.type = EntityType.make(type)
  self.protocol = protocol
  self.getShardGroup = Context.get(protocol.annotations, ShardGroup)
  return self
}

/**
 * Creates a new `Entity` of the specified `type` which will accept messages
 * that adhere to the provided schemas.
 *
 * **When to use**
 *
 * Use to define a cluster entity from individual `Rpc` definitions, giving the
 * cluster runtime a typed protocol for handlers and per-entity clients.
 *
 * **Details**
 *
 * The `type` argument is stored as the entity `EntityType`, and the RPC array
 * is grouped into the entity's `protocol`.
 *
 * **Gotchas**
 *
 * RPC tags should be unique within the array. If multiple definitions use the
 * same tag, the resulting protocol keeps the later definition for that tag.
 *
 * @see {@link fromRpcGroup} for creating an entity from an existing `RpcGroup`
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = <const Type extends string, Rpcs extends ReadonlyArray<Rpc.Any>>(
  /**
   * The entity type name.
   */
  type: Type,
  /**
   * The schema definition for messages that the entity is capable of
   * processing.
   */
  protocol: Rpcs
): Entity<Type, Rpcs[number]> => fromRpcGroup(type, RpcGroup.make(...protocol))

/**
 * Service tag for the entity address currently being processed.
 *
 * **When to use**
 *
 * Use to read the current entity identity and shard address from entity
 * handlers and keep-alive logic.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class CurrentAddress extends Context.Service<
  CurrentAddress,
  EntityAddress
>()("effect/cluster/Entity/EntityAddress") {}

/**
 * Service tag for the runner address currently registering entity handlers.
 *
 * **When to use**
 *
 * Use to read the runner address associated with the current entity handler
 * registration.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class CurrentRunnerAddress extends Context.Service<
  CurrentRunnerAddress,
  RunnerAddress
>()("effect/cluster/Entity/RunnerAddress") {}

/**
 * Reply API passed to queue-based entity handlers.
 *
 * **When to use**
 *
 * Use when you use it to complete an entity request by succeeding, failing, failing with a
 * cause, or supplying an explicit `Exit`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Replier<Rpcs extends Rpc.Any> {
  readonly succeed: <R extends Rpcs>(
    request: Envelope.Request<R>,
    value: Replier.Success<R>
  ) => Effect.Effect<void>

  readonly fail: <R extends Rpcs>(
    request: Envelope.Request<R>,
    error: Rpc.Error<R>
  ) => Effect.Effect<void>

  readonly failCause: <R extends Rpcs>(
    request: Envelope.Request<R>,
    cause: Cause.Cause<Rpc.Error<R>>
  ) => Effect.Effect<void>

  readonly complete: <R extends Rpcs>(
    request: Envelope.Request<R>,
    exit: Exit.Exit<Replier.Success<R>, Rpc.Error<R>>
  ) => Effect.Effect<void>
}

/**
 * Helper types used by the `Replier` API.
 *
 * @stability unstable
 * @since 4.0.0
 */
export declare namespace Replier {
  /**
   * Success value accepted by a `Replier` for a single RPC.
   *
   * **Details**
   *
   * For streaming RPCs this may be either a stream of success chunks or a dequeue
   * of success chunks. For non-streaming RPCs it is the RPC success value.
   *
   * @stability unstable
   * @category utility types
   * @since 4.0.0
   */
  export type Success<R extends Rpc.Any> = Rpc.Success<R> extends Stream.Stream<infer _A, infer _E, infer _R> ?
    Stream.Stream<_A, _E | Rpc.Error<R>, _R> | Queue.Dequeue<_A, _E | Rpc.Error<R> | Cause.Done>
    : Rpc.Success<R>
}

/**
 * Represents an entity request envelope delivered to entity handlers.
 *
 * **Details**
 *
 * It includes the underlying request envelope plus the last stream reply chunk
 * that was sent, allowing handlers to resume chunk sequencing after a restart.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export class Request<Rpc extends Rpc.Any> extends Data.Class<
  Envelope.Request<Rpc> & {
    readonly lastSentChunk: Option.Option<Reply.Chunk<Rpc>>
  }
> {
  /**
   * Most recent success chunk value sent by the entity, when one exists.
   *
   * @stability unstable
   * @since 4.0.0
   */
  get lastSentChunkValue(): Option.Option<Rpc.SuccessChunk<Rpc>> {
    return Option.map(this.lastSentChunk, (chunk) => Arr.lastNonEmpty(chunk.values))
  }

  /**
   * Sequence number to use for the entity's next outgoing success chunk.
   *
   * @stability unstable
   * @since 4.0.0
   */
  get nextSequence(): number {
    if (Option.isNone(this.lastSentChunk)) {
      return 0
    }
    return this.lastSentChunk.value.sequence + 1
  }
}

const shardingTag = Context.Service<Sharding, Sharding["Service"]>("effect/cluster/Sharding")

/**
 * Builds an in-memory test client for an entity layer.
 *
 * **Details**
 *
 * The returned function creates a no-serialization RPC client for each entity ID,
 * using a test sharding service instead of the cluster transport.
 *
 * @stability unstable
 * @category testing
 * @since 4.0.0
 */
export const makeTestClient: <Type extends string, Rpcs extends Rpc.Any, LA, LE, LR>(
  entity: Entity<Type, Rpcs>,
  layer: Layer.Layer<LA, LE, LR>
) => Effect.Effect<
  (entityId: string) => Effect.Effect<RpcClient.RpcClient<Rpcs>>,
  LE,
  Scope | ShardingConfig | Exclude<LR, Sharding> | Rpc.MiddlewareClient<Rpcs>
> = Effect.fnUntraced(function*<Type extends string, Rpcs extends Rpc.Any, LA, LE, LR>(
  entity: Entity<Type, Rpcs>,
  layer: Layer.Layer<LA, LE, LR>
) {
  const config = yield* ShardingConfig
  const makeShardId = (entityId: string) =>
    ShardId.make(
      entity.getShardGroup(entityId as EntityId),
      (Math.abs(hashString(entityId) % config.shardsPerGroup)) + 1
    )
  const snowflakeGen = yield* Snowflake.makeGenerator
  const runnerAddress = new RunnerAddress({ host: "localhost", port: 3000 })
  const entityMap = new Map<string, {
    readonly context: Context.Context<
      Rpc.ServicesClient<Rpcs> | Rpc.ServicesServer<Rpcs> | Rpc.Middleware<Rpcs> | LR
    >
    readonly concurrency: number | "unbounded"
    readonly disableFatalDefects: boolean | undefined
    readonly build: Effect.Effect<Context.Context<Rpc.ToHandler<Rpcs>>>
  }>()
  const sharding = shardingTag.of({
    ...({} as Sharding["Service"]),
    registerEntity: (entity, handlers, options) =>
      Effect.contextWith((context) => {
        entityMap.set(entity.type, {
          context: context as any,
          concurrency: options?.concurrency ?? 1,
          disableFatalDefects: options?.disableFatalDefects,
          build: entity.protocol.toHandlers(handlers as any) as any
        })
        return Effect.void
      })
  })
  yield* Layer.build(Layer.provide(layer, Layer.succeed(shardingTag)(sharding)))
  const entityEntry = entityMap.get(entity.type)
  if (!entityEntry) {
    return yield* Effect.die(`Entity.makeTestClient: ${entity.type} was not registered by layer`)
  }

  const map = yield* ResourceMap.make(Effect.fnUntraced(function*(entityId: string) {
    const address = new EntityAddress({
      entityType: entity.type,
      entityId: entityId as EntityId,
      shardId: makeShardId(entityId)
    })
    const scope = yield* Effect.scope
    const handlerContext = entityEntry.context.pipe(
      Context.add(CurrentRunnerAddress, runnerAddress),
      Context.add(CurrentAddress, address),
      Context.add(CurrentActivationScope, scope),
      Context.add(Scope, scope)
    )
    const handlers = yield* entityEntry.build.pipe(
      Effect.setContext(handlerContext as Context.Context<any>)
    )

    // oxlint-disable-next-line prefer-const
    let client!: Effect.Success<ReturnType<typeof RpcClient.makeNoSerialization<Rpcs, never>>>
    const server = yield* RpcServer.makeNoSerialization(entity.protocol, {
      concurrency: entityEntry.concurrency,
      disableFatalDefects: entityEntry.disableFatalDefects,
      onFromServer(response) {
        return client.write(response)
      }
    }).pipe(
      Effect.setContext(Context.merge(handlerContext, handlers))
    )

    client = yield* RpcClient.makeNoSerialization(entity.protocol, {
      supportsAck: true,
      generateRequestId: () => snowflakeGen.nextUnsafe() as any,
      onFromClient({ message }) {
        if (message._tag === "Request") {
          return server.write(0, {
            ...message,
            payload: new Request({
              ...message,
              [Envelope.TypeId]: Envelope.TypeId,
              address,
              requestId: Snowflake.Snowflake(message.id),
              lastSentChunk: Option.none()
            }) as any
          })
        }
        return server.write(0, message)
      }
    })
    return client.client
  }))

  return (entityId: string) => map.get(entityId)
})

/**
 * Enables or disables keep-alive for the current entity.
 *
 * **Details**
 *
 * When enabled it sends the internal keep-alive RPC for the current address; when
 * disabled it releases the keep-alive latch if one is present.
 *
 * @stability unstable
 * @category keep alive
 * @since 4.0.0
 */
export const keepAlive: (
  enabled: boolean
) => Effect.Effect<
  void,
  never,
  Sharding | CurrentAddress
> = Effect.fnUntraced(function*(enabled: boolean) {
  const olatch = yield* Effect.serviceOption(KeepAliveLatch)
  if (olatch._tag === "None") return
  if (!enabled) {
    yield* olatch.value.open
    return
  }
  const sharding = yield* shardingTag
  const address = yield* CurrentAddress
  const requestId = yield* sharding.getSnowflake
  const span = yield* Effect.orDie(Effect.currentSpan)
  olatch.value.closeUnsafe()
  yield* Effect.orDie(sharding.sendOutgoing(
    new Message.OutgoingRequest({
      annotations: KeepAliveRpc.annotations,
      rpc: KeepAliveRpc,
      context: Context.empty() as any,
      envelope: Envelope.makeRequest({
        requestId,
        address,
        tag: KeepAliveRpc._tag,
        payload: void 0,
        headers: Headers.empty,
        traceId: span.traceId,
        spanId: span.spanId,
        sampled: span.sampled
      }),
      lastReceivedReply: Option.none(),
      respond: () => Effect.void
    }),
    true
  ))
}, (effect, enabled) =>
  Effect.withSpan(
    effect,
    "Entity/keepAlive",
    { attributes: { enabled }, captureStackTrace: false }
  ))

/**
 * RPC used internally to keep an entity active while a resource is held.
 *
 * **Details**
 *
 * The RPC is marked as persisted and uninterruptible so the keep-alive signal
 * survives normal entity restarts.
 *
 * @stability unstable
 * @category keep alive
 * @since 4.0.0
 */
export const KeepAliveRpc = Rpc.make("Cluster/Entity/keepAlive")
  .annotate(Persisted, true)
  .annotate(Uninterruptible, true)

/**
 * Service tag for the latch that coordinates entity keep-alive state.
 *
 * **Details**
 *
 * `keepAlive` closes the latch when keep-alive is active and opens it again when
 * the resource no longer needs to keep the entity alive.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class KeepAliveLatch extends Context.Service<KeepAliveLatch, Latch.Latch>()(
  "effect/cluster/Entity/KeepAliveLatch"
) {}
