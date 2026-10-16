/**
 * Deno Redis integration backed by `@db/redis`.
 *
 * This module creates a scoped, native Deno Redis client and exposes it as
 * both the portable `Redis` service and the Deno-specific {@link DenoRedis}
 * service for direct access to the raw client. Unlike Bun's built-in client,
 * `@db/redis` connects eagerly using RESP2, so layer construction can fail
 * with a `RedisError`.
 *
 * @stability unstable
 * @since 4.0.0
 */
import { connect, parseURL, type Redis as RedisClient, type RedisConnectOptions } from "@db/redis"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Fn from "effect/Function"
import * as Layer from "effect/Layer"
import * as Redis from "effect/persistence/Redis"
import * as Predicate from "effect/Predicate"
import * as Record from "effect/Record"

/**
 * Options for connecting to Redis, including a Redis URL or individual
 * connection settings. Explicit settings override values from the URL.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type RedisOptions = Omit<RedisConnectOptions, "hostname"> & {
  readonly hostname?: string
  readonly url?: string
}

/**
 * Service tag for Deno Redis integration, exposing the raw `@db/redis` client
 * and a `use` helper that maps client promise failures to `RedisError`.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class DenoRedis extends Context.Service<DenoRedis, {
  readonly client: RedisClient
  readonly use: <A>(f: (client: RedisClient) => Promise<A>) => Effect.Effect<A, Redis.RedisError>
}>()("@effect/platform-deno/DenoRedis") {}

const make = Effect.fnUntraced(function*(options: RedisOptions = {}) {
  const connectClient = () => {
    const { url, ...connectOptions } = options
    const parsedUrl = url === undefined ? undefined : new URL(url)
    const { name, ...parsed } = url === undefined ? { hostname: "localhost" } : parseURL(url)
    return connect({
      ...parsed,
      ...(name === undefined ? {} : { username: name }),
      ...(parsedUrl?.username ? { username: decodeURIComponent(parsedUrl.username) } : {}),
      ...(parsedUrl?.password ? { password: decodeURIComponent(parsedUrl.password) } : {}),
      ...Record.filter(connectOptions, Predicate.isNotUndefined)
    })
  }

  const client = yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: connectClient,
      catch: (cause) => new Redis.RedisError({ cause })
    }),
    (client) => Effect.sync(() => client.close())
  )

  const use = <A>(f: (client: RedisClient) => Promise<A>) =>
    Effect.tryPromise({
      try: () => f(client),
      catch: (cause) => new Redis.RedisError({ cause })
    })

  const redis = yield* Redis.make({
    send: <A = unknown>(command: string, ...args: ReadonlyArray<string>) =>
      Effect.tryPromise({
        try: () => client.sendCommand(command, args as Array<string>) as Promise<A>,
        catch: (cause) => new Redis.RedisError({ cause })
      }),
    subscribe: (channel, onMessage) =>
      Effect.acquireRelease(
        Effect.tryPromise({
          try: async () => {
            const subscriber = await connectClient()
            try {
              const subscription = await subscriber.subscribe(channel)
              // @db/redis resolves subscribe after writing the command, before
              // reading its acknowledgement. This ordered reply proves that
              // Redis processed SUBSCRIBE before the dequeue is returned.
              await subscriber.ping()
              return { subscriber, subscription }
            } catch (cause) {
              subscriber.close()
              throw cause
            }
          },
          catch: (cause) => new Redis.RedisError({ cause })
        }),
        ({ subscriber }) => Effect.sync(() => subscriber.close())
      ).pipe(
        Effect.map(({ subscription }) =>
          Effect.tryPromise({
            try: async () => {
              for await (const message of subscription.receive()) {
                onMessage(message)
              }
            },
            catch: (cause) => new Redis.RedisError({ cause })
          })
        )
      )
  })

  const denoRedis = Fn.identity<DenoRedis["Service"]>({
    client,
    use
  })

  return Context.make(DenoRedis, denoRedis).pipe(
    Context.add(Redis.Redis, redis)
  )
})

/**
 * Provides `Redis` and `DenoRedis` services backed by an `@db/redis` client,
 * closing the client when the layer scope ends. URL-derived options can be
 * overridden by other supplied options.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer = (
  options?: RedisOptions | undefined
): Layer.Layer<Redis.Redis | DenoRedis, Redis.RedisError> => Layer.effectContext(make(options))

/**
 * Provides `Redis` and `DenoRedis` services from `Config`-backed options,
 * closing the client when the layer scope ends.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerConfig = (
  options: Config.Wrap<RedisOptions>
): Layer.Layer<Redis.Redis | DenoRedis, Redis.RedisError | Config.ConfigError> =>
  Layer.effectContext(
    Config.unwrap(options).pipe(
      Effect.flatMap(make)
    )
  )
