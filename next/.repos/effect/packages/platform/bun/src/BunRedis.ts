/**
 * Bun Redis integration backed by Bun's built-in `RedisClient`.
 *
 * This module creates scoped Bun `RedisClient` connections and exposes them as
 * both the portable `Redis` service and the Bun-specific `BunRedis` service for
 * direct access to the raw client. The `layer` helper accepts Redis options
 * directly, while `layerConfig` reads them from Effect config. Both also accept
 * `Redis.PoolOptions` for the connections behind `Redis.reserve`, and close the
 * underlying clients when the layer scope finalizes.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type { RedisClient, RedisOptions } from "bun"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Fn from "effect/Function"
import * as Layer from "effect/Layer"
import * as Redis from "effect/persistence/Redis"
import * as Scope from "effect/Scope"

/**
 * Service tag for Bun Redis integration, exposing the raw `RedisClient` and a `use` helper that maps client promise failures to `RedisError`.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class BunRedis extends Context.Service<BunRedis, {
  readonly client: RedisClient
  readonly use: <A>(f: (client: RedisClient) => Promise<A>) => Effect.Effect<A, Redis.RedisError>
}>()("@effect/platform-bun/BunRedis") {}

type BunRedisOptions = { readonly url?: string } & RedisOptions & Redis.PoolOptions

const make = Effect.fnUntraced(function*(
  { acquireTimeout, idleTimeout, maxConnections, minConnections, ...options }: BunRedisOptions = {}
) {
  const { RedisClient } = yield* Effect.promise(() => import("bun"))
  const scope = yield* Effect.scope
  yield* Scope.addFinalizer(scope, Effect.sync(() => client.close()))
  const client = new RedisClient(options.url, options)

  const use = <A>(f: (client: RedisClient) => Promise<A>) =>
    Effect.tryPromise({
      try: () => f(client),
      catch: (cause) => new Redis.RedisError({ cause })
    })

  const sendWith =
    (client: RedisClient) =>
    <A = unknown>(command: string, ...args: ReadonlyArray<string>): Effect.Effect<A, Redis.RedisError> =>
      Effect.tryPromise({
        try: () => client.send(command, args as Array<string>) as Promise<A>,
        catch: (cause) => new Redis.RedisError({ cause })
      })

  const redis = yield* Redis.make({
    send: sendWith(client),
    // Reserved connections do not reconnect: a dropped socket fails the
    // in-flight command and the connection leaves the pool.
    connect: Effect.tryPromise({
      try: async () => {
        const connection = new RedisClient(options.url, { ...options, autoReconnect: false })
        try {
          await connection.connect()
          return connection
        } catch (cause) {
          connection.close()
          throw cause
        }
      },
      catch: (cause) => new Redis.RedisError({ cause })
    }).pipe(
      Effect.map((connection) => ({
        send: sendWith(connection),
        close: Effect.sync(() => connection.close())
      }))
    ),
    pool: { acquireTimeout, idleTimeout, maxConnections, minConnections },
    subscribe: Effect.fnUntraced(function*(channel, onMessage) {
      const terminal = yield* Deferred.make<void, Redis.RedisError>()
      yield* Effect.acquireRelease(
        Effect.tryPromise({
          try: async () => {
            const subscriber = new RedisClient(options.url, {
              ...options,
              autoReconnect: false
            })
            subscriber.onclose = (cause) => {
              Deferred.doneUnsafe(terminal, new Redis.RedisError({ cause }))
            }
            try {
              await subscriber.subscribe(channel, (message, channel) => {
                onMessage({ channel, message })
              })
              return subscriber
            } catch (cause) {
              subscriber.onclose = null
              subscriber.close()
              throw cause
            }
          },
          catch: (cause) => new Redis.RedisError({ cause })
        }),
        (subscriber) =>
          Effect.sync(() => {
            subscriber.onclose = null
            subscriber.close()
          })
      )
      return Deferred.await(terminal)
    })
  })

  const bunRedis = Fn.identity<BunRedis["Service"]>({
    client,
    use
  })

  return Context.make(BunRedis, bunRedis).pipe(
    Context.add(Redis.Redis, redis)
  )
})

/**
 * Creates scoped Bun Redis layers for `Redis.Redis` and `BunRedis`, closing the underlying client when the scope finalizes.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer = (
  options?: BunRedisOptions | undefined
): Layer.Layer<Redis.Redis | BunRedis> => Layer.effectContext(make(options))

/**
 * Creates scoped Bun Redis layers from configurable Redis options, closing the underlying client when the scope finalizes.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerConfig = (
  options: Config.Wrap<BunRedisOptions>
): Layer.Layer<Redis.Redis | BunRedis, Config.ConfigError> =>
  Layer.effectContext(
    Config.unwrap(options).pipe(
      Effect.flatMap(make)
    )
  )
