/**
 * Node.js Redis integration backed by `redis` (node-redis).
 *
 * This module creates a scoped `node-redis` client and exposes it in two forms:
 * the generic `Redis` service and the {@link NodeRedis} service for direct
 * access to the underlying client. `layer` accepts node-redis client options
 * directly, while `layerConfig` reads them from Effect config. Both also accept
 * `Redis.PoolOptions` for the connections behind `Redis.reserve`. `node-redis`
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
type NodeRedisOptions = NodeRedisClientOptions & Redis.PoolOptions

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

// node-redis cannot destroy a socket that is still connecting, so every
// client gets a socket signal that `destroy` aborts.
const withSignal = (socket: NodeRedisClientOptions["socket"], signal: AbortSignal) => {
  // node-redis' TLS option type omits `signal`, which `tls.connect` accepts.
  const callerSignal = socket && "signal" in socket ? socket.signal : undefined
  return { ...socket, signal: callerSignal ? AbortSignal.any([callerSignal, signal]) : signal }
}

const makeSocket = (
  socket: NodeRedisClientOptions["socket"],
  signal: AbortSignal,
  isReady: () => boolean
) => {
  return {
    ...withSignal(socket, signal),
    reconnectStrategy: socket?.reconnectStrategy ?? ((retries, cause) => {
      if (!isReady()) return cause
      if (cause instanceof SocketTimeoutError) return false
      const jitter = Math.floor(Math.random() * 200)
      const delay = Math.min(2 ** retries * 50, 2000)
      return delay + jitter
    })
  }
}

// Destroying first leaves the abort only an untracked, still-connecting socket
// to close, so it raises no client error.
const destroy = (client: NodeRedisClient, abort?: AbortController) => {
  try {
    client.destroy()
  } catch {
    // node-redis before 6.3 throws when destroying a client whose connection
    // has failed.
  }
  abort?.abort()
}

const make = Effect.fnUntraced(function*(
  { acquireTimeout, idleTimeout, maxConnections, minConnections, ...options }: NodeRedisOptions = {}
) {
  const socket = options.socket
  const abort = new AbortController()
  let ready = false
  const client = yield* Effect.acquireRelease(
    Effect.sync(() => createClient({ ...options, socket: makeSocket(socket, abort.signal, () => ready) })),
    (client) => Effect.sync(() => destroy(client, abort))
  )
  client.once("ready", () => {
    ready = true
  })

  // node-redis rethrows `error` events that have no listener, which would crash
  // the process on a transient socket failure. Command failures are still
  // reported as `RedisError`.
  const runSync = Effect.runSyncWith(yield* Effect.context<never>())
  client.on("error", (cause) => {
    // node-redis before 6.3 reports connection attempts that teardown cut short.
    if (abort.signal.aborted) return
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

  const sendWith =
    (client: NodeRedisClient) =>
    <A = unknown>(command: string, ...args: ReadonlyArray<string>): Effect.Effect<A, Redis.RedisError> =>
      Effect.tryPromise({
        try: () => client.sendCommand([command, ...args]) as Promise<A>,
        catch: (cause) => new Redis.RedisError({ cause })
      })

  const redis = yield* Redis.make({
    send: sendWith(client),
    // Reserved connections do not reconnect: a dropped socket fails the
    // in-flight command and the connection leaves the pool.
    //
    // The pool acquires connections uninterruptibly, so `connect` opts back in
    // to interruption. The signal aborts only on interruption: it closes a
    // socket that is still connecting, and `destroy` discards a connection
    // that has already opened.
    connect: Effect.interruptible(Effect.tryPromise({
      try: async (signal) => {
        const connection = client.duplicate({ socket: { ...withSignal(socket, signal), reconnectStrategy: false } })
        connection.on("error", (cause) => {
          if (signal.aborted) return
          runSync(Effect.logWarning("NodeRedis reserved connection error", cause))
        })
        signal.addEventListener("abort", () => destroy(connection), { once: true })
        try {
          await connection.connect()
          return connection
        } catch (cause) {
          destroy(connection)
          throw cause
        }
      },
      catch: (cause) => new Redis.RedisError({ cause })
    })).pipe(
      Effect.map((connection) => ({
        send: sendWith(connection),
        // `destroy` rejects in-flight commands instead of waiting for their
        // replies like `close` does.
        close: Effect.sync(() => destroy(connection))
      }))
    ),
    pool: { acquireTimeout, idleTimeout, maxConnections, minConnections },
    subscribe: Effect.fnUntraced(function*(channel, onMessage) {
      const terminal = yield* Deferred.make<void, Redis.RedisError>()
      const abort = new AbortController()
      let subscriberReady = false
      // Only creating the subscriber is uninterruptible, so a stalled connection
      // or `SUBSCRIBE` can be interrupted and the scope closes it.
      const subscriber = yield* Effect.acquireRelease(
        Effect.sync(() => client.duplicate({ socket: makeSocket(socket, abort.signal, () => subscriberReady) })),
        (subscriber) => Effect.sync(() => destroy(subscriber, abort))
      )
      subscriber.once("ready", () => {
        subscriberReady = true
      })
      subscriber.on("error", (cause) => {
        if (abort.signal.aborted) return
        runSync(Effect.logWarning("NodeRedis subscriber error", cause))
        if (!subscriber.isOpen) {
          runSync(Deferred.fail(terminal, new Redis.RedisError({ cause })))
        }
      })
      yield* Effect.tryPromise({
        try: async () => {
          try {
            await subscriber.connect()
            await subscriber.subscribe(channel, (message, channel) => {
              onMessage({ channel, message })
            })
          } catch (cause) {
            destroy(subscriber, abort)
            throw cause
          }
        },
        catch: (cause) => new Redis.RedisError({ cause })
      })
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
 * Scope finalization destroys the shared client immediately, failing commands
 * still in flight and aborting any connection attempt in progress, including
 * reserved connections that are still being established. Interrupting
 * `Redis.subscribe` while it is connecting or subscribing closes its
 * connection. Interrupting `Redis.reserve` only stops waiting: a connection the
 * pool is already opening joins the pool when it is ready. Run blocking
 * commands on `Redis.reserve` so they do not hold up the shared connection.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer = (
  options?: NodeRedisOptions | undefined
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
 * Scope finalization destroys the shared client immediately, failing commands
 * still in flight and aborting any connection attempt in progress, including
 * reserved connections that are still being established. Interrupting
 * `Redis.subscribe` while it is connecting or subscribing closes its
 * connection. Interrupting `Redis.reserve` only stops waiting: a connection the
 * pool is already opening joins the pool when it is ready. Run blocking
 * commands on `Redis.reserve` so they do not hold up the shared connection.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerConfig: (
  options: Config.Wrap<NodeRedisOptions>
) => Layer.Layer<Redis.Redis | NodeRedis, Redis.RedisError | Config.ConfigError> = (
  options: Config.Wrap<NodeRedisOptions>
): Layer.Layer<Redis.Redis | NodeRedis, Redis.RedisError | Config.ConfigError> =>
  Layer.effectContext(
    Config.unwrap(options).pipe(
      Effect.flatMap(make)
    )
  )
