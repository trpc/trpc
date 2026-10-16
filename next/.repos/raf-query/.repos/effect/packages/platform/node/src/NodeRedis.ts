/**
 * Node.js Redis integration backed by `redis` (node-redis).
 *
 * This module creates a scoped `node-redis` client and exposes it in two forms:
 * the generic `Redis` service and the {@link NodeRedis} service for direct
 * access to the underlying client. `layer` accepts node-redis client options
 * directly, while `layerConfig` reads them from Effect config. `node-redis`
 * connects explicitly, so layer construction can fail with a `RedisError`.
 * Both layers close the client when the layer scope ends.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Fn from "effect/Function"
import * as Layer from "effect/Layer"
import * as Redis from "effect/persistence/Redis"
import { createClient, SocketTimeoutError } from "redis"

type NodeRedisClient = ReturnType<typeof createClient>
type NodeRedisClientOptions = NonNullable<Parameters<typeof createClient>[0]>

/**
 * Service tag for the Node Redis integration, exposing the underlying
 * `node-redis` client and a `use` helper that maps client failures to
 * `RedisError`.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class NodeRedis extends Context.Service<NodeRedis, {
  readonly client: NodeRedisClient
  readonly use: <A>(f: (client: NodeRedisClient) => Promise<A>) => Effect.Effect<A, Redis.RedisError>
}>()("@effect/platform-node/NodeRedis") {}

const make = Effect.fnUntraced(function*(
  options?: NodeRedisClientOptions
) {
  let ready = false
  const socket = options?.socket
  const client = yield* Effect.acquireRelease(
    Effect.sync((): NodeRedisClient =>
      createClient({
        ...options,
        socket: socket?.reconnectStrategy === undefined
          ? {
            ...socket,
            reconnectStrategy: (retries, cause) => {
              if (!ready) return cause
              if (cause instanceof SocketTimeoutError) return false
              const jitter = Math.floor(Math.random() * 200)
              const delay = Math.min(2 ** retries * 50, 2000)
              return delay + jitter
            }
          }
          : socket
      })
    ),
    (client) => Effect.ignoreCause(Effect.promise(() => client.close()))
  )
  client.once("ready", () => {
    ready = true
  })

  // node-redis rethrows `error` events that have no listener, which would crash
  // the process on a transient socket failure. Command failures are still
  // reported as `RedisError`.
  const runSync = Effect.runSyncWith(yield* Effect.context<never>())
  client.on("error", (cause) => {
    runSync(Effect.logWarning("NodeRedis client error", cause))
  })

  yield* Effect.tryPromise({
    try: () => client.connect(),
    catch: (cause) => new Redis.RedisError({ cause })
  })

  const use = <A>(f: (client: NodeRedisClient) => Promise<A>) =>
    Effect.tryPromise({
      try: () => f(client),
      catch: (cause) => new Redis.RedisError({ cause })
    })

  const redis = yield* Redis.make({
    send: <A = unknown>(command: string, ...args: ReadonlyArray<string>) =>
      Effect.tryPromise({
        try: () => client.sendCommand([command, ...args]) as Promise<A>,
        catch: (cause) => new Redis.RedisError({ cause })
      }),
    subscribe: (channel, onMessage) =>
      Effect.gen(function*() {
        const terminal = yield* Deferred.make<void, Redis.RedisError>()
        yield* Effect.acquireRelease(
          Effect.tryPromise({
            try: async () => {
              let subscriberReady = false
              const subscriber = client.duplicate(
                socket?.reconnectStrategy === undefined
                  ? {
                    socket: {
                      ...socket,
                      reconnectStrategy: (retries, cause) => {
                        if (!subscriberReady) return cause
                        if (cause instanceof SocketTimeoutError) return false
                        const jitter = Math.floor(Math.random() * 200)
                        const delay = Math.min(2 ** retries * 50, 2000)
                        return delay + jitter
                      }
                    }
                  }
                  : {}
              )
              subscriber.once("ready", () => {
                subscriberReady = true
              })
              subscriber.on("error", (cause) => {
                runSync(Effect.logWarning("NodeRedis subscriber error", cause))
                if (!subscriber.isOpen) {
                  runSync(Deferred.fail(terminal, new Redis.RedisError({ cause })))
                }
              })
              try {
                await subscriber.connect()
                await subscriber.subscribe(channel, (message, channel) => {
                  onMessage({ channel, message })
                })
                return subscriber
              } catch (cause) {
                if (subscriber.isOpen) subscriber.destroy()
                throw cause
              }
            },
            catch: (cause) => new Redis.RedisError({ cause })
          }),
          (subscriber) =>
            Effect.sync(() => {
              if (subscriber.isOpen) subscriber.destroy()
            })
        )
        return Deferred.await(terminal)
      })
  })

  const nodeRedis = Fn.identity<NodeRedis["Service"]>({
    client,
    use
  })

  return Context.make(NodeRedis, nodeRedis).pipe(
    Context.add(Redis.Redis, redis)
  )
})

/**
 * Provides `Redis` and `NodeRedis` services backed by a `node-redis` client
 * created with the supplied options, connected when the layer is built and
 * closed when the layer scope ends.
 *
 * **Details**
 *
 * By default, the initial connection fails on its first connection error. A
 * caller-supplied `socket.reconnectStrategy` is used instead when present. Once
 * the client has emitted `ready`, the default reconnect strategy uses
 * node-redis' exponential backoff and stops on socket timeouts.
 *
 * Scope finalization calls `close()`, which waits for in-flight commands,
 * including blocking commands, and can therefore delay scope closure.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer = (
  options?: NodeRedisClientOptions | undefined
): Layer.Layer<Redis.Redis | NodeRedis, Redis.RedisError> => Layer.effectContext(make(options))

/**
 * Provides `Redis` and `NodeRedis` services from `Config`-backed node-redis
 * client options, connecting the client when the layer is built and closing it
 * when the layer scope ends.
 *
 * **Details**
 *
 * By default, the initial connection fails on its first connection error. A
 * caller-supplied `socket.reconnectStrategy` is used instead when present. Once
 * the client has emitted `ready`, the default reconnect strategy uses
 * node-redis' exponential backoff and stops on socket timeouts.
 *
 * Scope finalization calls `close()`, which waits for in-flight commands,
 * including blocking commands, and can therefore delay scope closure.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerConfig: (
  options: Config.Wrap<NodeRedisClientOptions>
) => Layer.Layer<Redis.Redis | NodeRedis, Redis.RedisError | Config.ConfigError> = (
  options: Config.Wrap<NodeRedisClientOptions>
): Layer.Layer<Redis.Redis | NodeRedis, Redis.RedisError | Config.ConfigError> =>
  Layer.effectContext(
    Config.unwrap(options).pipe(
      Effect.flatMap(make)
    )
  )
