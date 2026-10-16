/**
 * Provides server-side layers for the cluster runner protocol.
 *
 * Runner protocol handlers receive ping, notification, request, stream, and
 * envelope messages from other runners. They forward those messages into
 * `Sharding` and coordinate persisted replies through `MessageStorage`. This
 * module includes the handler layer, a transport-independent RPC server layer, a
 * full server layer that also provides runner clients, and a client-only layer
 * for applications that do not serve runner RPCs.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type * as Cause from "../Cause.ts"
import * as Effect from "../Effect.ts"
import type * as Exit from "../Exit.ts"
import * as Fiber from "../Fiber.ts"
import { constant } from "../Function.ts"
import * as Layer from "../Layer.ts"
import * as Option from "../Option.ts"
import * as Queue from "../Queue.ts"
import type * as Rpc from "../rpc/Rpc.ts"
import * as RpcServer from "../rpc/RpcServer.ts"
import type * as ClusterError from "./ClusterError.ts"
import * as Message from "./Message.ts"
import * as MessageStorage from "./MessageStorage.ts"
import * as Reply from "./Reply.ts"
import * as RunnerHealth from "./RunnerHealth.ts"
import * as Runners from "./Runners.ts"
import type * as RunnerStorage from "./RunnerStorage.ts"
import * as Sharding from "./Sharding.ts"
import { ShardingConfig } from "./ShardingConfig.ts"

const constVoid = constant(Effect.void)

const serializeDefectReply = <R extends Rpc.Any>(
  reply: Reply.ReplyWithContext<R>,
  defect: unknown,
  codecFor: RpcServer.Protocol["Service"]["codecFor"]
): Effect.Effect<Reply.Encoded> =>
  Effect.orDie(Reply.serialize(
    Reply.ReplyWithContext.fromDefect({
      id: reply.reply.id,
      requestId: reply.reply.requestId,
      defect
    }),
    codecFor
  ))

/**
 * Layer that handles runner protocol RPCs by forwarding requests to `Sharding`
 * and `MessageStorage`.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerHandlers = Runners.Rpcs.toLayer(Effect.gen(function*() {
  const sharding = yield* Sharding.Sharding
  const storage = yield* MessageStorage.MessageStorage
  const { codecFor } = yield* RpcServer.Protocol

  return {
    Ping: () => Effect.void,
    Notify: ({ envelope, persisted }) => {
      const message = envelope._tag === "Request"
        ? new Message.IncomingRequest({
          envelope,
          respond: constVoid,
          lastSentReply: Option.none(),
          codecFor
        })
        : new Message.IncomingEnvelope({ envelope })
      return persisted ? sharding.notify(message) : sharding.send(message)
    },
    Effect: Effect.fnUntraced(function*({ persisted, request }) {
      const callerScope = yield* Effect.scope
      let replyEncoded: Option.Option<Effect.Effect<Reply.Encoded, ClusterError.EntityNotAssignedToRunner>> = Option
        .none()
      let resume = (reply: Effect.Effect<Reply.Encoded, ClusterError.EntityNotAssignedToRunner>) => {
        replyEncoded = Option.some(reply)
      }
      const message = new Message.IncomingRequest({
        envelope: request,
        lastSentReply: Option.none(),
        codecFor,
        callerScope,
        respond(reply) {
          resume(Reply.serializeOrDefect(reply, codecFor))
          return Effect.void
        }
      })
      if (persisted) {
        return yield* Effect.callback<
          Reply.Encoded,
          ClusterError.EntityNotAssignedToRunner
        >((resume_) => {
          resume = resume_
          const parent = Fiber.getCurrent()!
          const onExit = (
            exit: Exit.Exit<
              any,
              ClusterError.EntityNotAssignedToRunner
            >
          ) => {
            if (exit._tag === "Failure") {
              resume(exit as any)
            }
          }
          const runFork = Effect.runForkWith(parent.context)
          const fiber = runFork(storage.registerReplyHandler(message))
          fiber.addObserver(onExit)
          runFork(Effect.catchTag(
            sharding.notify(message, constWaitUntilRead),
            "AlreadyProcessingMessage",
            () => Effect.void
          )).addObserver(onExit)
          return Fiber.interrupt(fiber)
        })
      }
      yield* sharding.send(message)
      return yield* Effect.callback<Reply.Encoded, ClusterError.EntityNotAssignedToRunner>((resume_) => {
        if (Option.isSome(replyEncoded)) {
          resume_(replyEncoded.value)
        } else {
          resume = resume_
        }
      })
    }),
    Stream: Effect.fnUntraced(function*({ persisted, request }) {
      const callerScope = yield* Effect.scope
      const queue = yield* Queue.make<Reply.Encoded, ClusterError.EntityNotAssignedToRunner | Cause.Done>()
      const message = new Message.IncomingRequest({
        envelope: request,
        lastSentReply: Option.none(),
        codecFor,
        callerScope,
        respond(reply) {
          return Reply.serialize(reply, codecFor).pipe(
            Effect.flatMap((reply) => {
              Queue.offerUnsafe(queue, reply)
              if (reply._tag === "WithExit") {
                Queue.endUnsafe(queue)
              }
              return Effect.void
            }),
            Effect.catchTag(
              "MalformedMessage",
              (error) =>
                Effect.flatMap(serializeDefectReply(reply, error, codecFor), (reply) => {
                  // the fallback defect reply is terminal, so end the stream
                  Queue.offerUnsafe(queue, reply)
                  Queue.endUnsafe(queue)
                  return Effect.void
                })
            )
          )
        }
      })
      if (persisted) {
        yield* storage.registerReplyHandler(message).pipe(
          Effect.onError((cause) => Queue.failCause(queue, cause)),
          Effect.forkScoped
        )
        yield* sharding.notify(message, constWaitUntilRead)
      } else {
        yield* sharding.send(message)
      }
      return queue
    }),
    Envelope: ({ envelope }) => sharding.send(new Message.IncomingEnvelope({ envelope }))
  }
}))

const constWaitUntilRead = { waitUntilRead: true } as const

/**
 * Creates the runner RPC server layer, which receives messages from other
 * runners, forwards them to the `Sharding` layer, and responds to `Ping`
 * requests.
 *
 * **When to use**
 *
 * Use when a runner process should accept runner-to-runner protocol messages
 * over a provided server `RpcServer.Protocol`.
 *
 * **Gotchas**
 *
 * This layer does not choose or provide the wire transport; provide a
 * transport-specific `RpcServer.Protocol` separately.
 *
 * @see {@link layerHandlers} for the lower-level handler layer used when the RPC server is supplied elsewhere
 * @see {@link layerWithClients} for a runner server layer that also provides the `Sharding` and `Runners` clients
 * @see {@link layerClientOnly} for embedding a cluster client without serving runner RPCs
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer.Layer<
  never,
  never,
  | RpcServer.Protocol
  | Sharding.Sharding
  | MessageStorage.MessageStorage
> = RpcServer.layer(Runners.Rpcs, {
  spanPrefix: "RunnerServer",
  disableTracing: true,
  disableFatalDefects: true
}).pipe(Layer.provide(layerHandlers))

/**
 * Layer that provides `RunnerServer` together with `Runners` and `Sharding`
 * clients.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerWithClients: Layer.Layer<
  Sharding.Sharding | Runners.Runners,
  never,
  | RpcServer.Protocol
  | ShardingConfig
  | Runners.RpcClientProtocol
  | MessageStorage.MessageStorage
  | RunnerStorage.RunnerStorage
  | RunnerHealth.RunnerHealth
> = layer.pipe(
  Layer.provideMerge(Sharding.layer),
  Layer.provideMerge(Runners.layerRpc)
)

/**
 * Creates a client-only `Runners` layer.
 *
 * **When to use**
 *
 * Use to embed a cluster client inside another Effect application without registering with
 * the ShardManager or receiving shard assignments.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerClientOnly: Layer.Layer<
  Sharding.Sharding | Runners.Runners,
  never,
  | ShardingConfig
  | Runners.RpcClientProtocol
  | MessageStorage.MessageStorage
  | RunnerStorage.RunnerStorage
> = Sharding.layer.pipe(
  Layer.provideMerge(Runners.layerRpc),
  Layer.provide(RunnerHealth.layerNoop),
  Layer.updateService(ShardingConfig, (config) => ({
    ...config,
    runnerAddress: Option.none()
  }))
)
