import * as DenoRedis from "@effect/platform-deno/DenoRedis"
import { assert, it } from "@effect/vitest"
import { RedisContainer } from "@testcontainers/redis"
import { Deferred, Effect, Fiber, Layer, Queue, Schema } from "effect"
import { PersistedQueue, Persistence, Redis } from "effect/persistence"
import * as PersistedCacheTest from "../../../effect/test/persistence/PersistedCacheTest.ts"
import * as PersistedQueueTest from "../../../effect/test/persistence/PersistedQueueTest.ts"

const RedisLayer = Layer.unwrap(
  Effect.gen(function*() {
    const container = yield* Effect.acquireRelease(
      Effect.promise(() => new RedisContainer("redis:alpine").start()),
      (container) => Effect.promise(() => container.stop())
    )
    return DenoRedis.layer({
      url: `redis://${container.getHost()}:${container.getMappedPort(6379)}`
    })
  }).pipe(
    Effect.catchCause(() => Effect.fail(new PersistedCacheTest.TransientError()))
  )
)

PersistedCacheTest.suite(
  "DenoRedis",
  Persistence.layerRedis.pipe(Layer.provide(RedisLayer))
)

PersistedQueueTest.suite(
  "DenoRedis",
  // short intervals so the periodic reset runs while the suite's takes are
  // in flight
  PersistedQueue.layerStoreRedis({
    pollInterval: "50 millis",
    lockRefreshInterval: "100 millis"
  }).pipe(Layer.provide(RedisLayer))
)

const PersistedQueueRedisLayer = Layer.mergeAll(
  RedisLayer,
  PersistedQueue.layer.pipe(
    Layer.provideMerge(
      PersistedQueue.layerStoreRedis().pipe(Layer.provide(RedisLayer))
    )
  )
)

it.layer(PersistedQueueRedisLayer, { timeout: "30 seconds" })(
  "PersistedQueue (DenoRedis)",
  (it) => {
    it.effect("receives published messages", () =>
      Effect.gen(function*() {
        const redis = yield* Redis.Redis
        const subscription = yield* redis.subscribe("effect-test")

        const subscribers = yield* redis.send<number>("PUBLISH", "effect-test", "hello")
        assert.strictEqual(subscribers, 1)

        assert.deepStrictEqual(yield* Queue.take(subscription), {
          channel: "effect-test",
          message: "hello"
        })
      }))

    it.effect("moves exhausted elements to the failed list", () =>
      Effect.gen(function*() {
        const redis = yield* DenoRedis.DenoRedis
        const queueName = "test-redis-failed"

        const queue = yield* PersistedQueue.make({
          name: queueName,
          schema: RedisItem,
          maxAttempts: 1
        })
        const id = yield* queue.offer({ n: 42 })
        const error = yield* queue.take(() => Effect.fail("boom")).pipe(Effect.flip)
        assert.strictEqual(error, "boom")

        const failed = yield* redis.use((client) => client.lrange(`effectq:${queueName}:failed`, 0, -1))
        assert.strictEqual(failed.length, 1)
        const failedItem = JSON.parse(failed[0])
        assert.strictEqual(failedItem.id, id)
        assert.deepStrictEqual(failedItem.element, { n: 42 })
        assert.strictEqual(failedItem.attempts, 1)

        const pending = yield* redis.use((client) => client.hlen(`effectq:${queueName}:pending`))
        assert.strictEqual(pending, 0)
      }))
  }
)

it.effect("closes the connection when interrupted during acquisition", () =>
  Effect.gen(function*() {
    const listener = yield* makeListener
    const authReceived = yield* Deferred.make<void>()
    const sendAuthReply = yield* Deferred.make<void>()
    const server = yield* Effect.gen(function*() {
      const connection = yield* accept(listener)
      yield* read(connection)
      yield* Deferred.succeed(authReceived, void 0)
      yield* Deferred.await(sendAuthReply)
      yield* write(connection, "+OK\r\n")
      return yield* read(connection)
    }).pipe(Effect.forkChild)

    const port = (listener.addr as Deno.NetAddr).port
    const layerFiber = yield* Layer.build(DenoRedis.layer({
      url: `redis://:secret@127.0.0.1:${port}`
    })).pipe(Effect.forkChild({ startImmediately: true }))

    yield* Deferred.await(authReceived)
    const interruptFiber = yield* Fiber.interrupt(layerFiber).pipe(
      Effect.forkChild({ startImmediately: true })
    )
    yield* Deferred.succeed(sendAuthReply, void 0)
    yield* Fiber.join(interruptFiber)

    assert.isNull(yield* Fiber.join(server))
  }))

it.effect("uses the URL username for two-argument AUTH", () =>
  Effect.gen(function*() {
    const listener = yield* makeListener
    const server = yield* Effect.gen(function*() {
      const connection = yield* accept(listener)
      const request = yield* read(connection)
      yield* write(connection, "+OK\r\n")
      return request
    }).pipe(Effect.forkChild)

    const port = (listener.addr as Deno.NetAddr).port
    yield* Layer.build(DenoRedis.layer({
      url: `redis://alice:secret@127.0.0.1:${port}`,
      password: undefined
    }))

    assert.strictEqual(
      yield* Fiber.join(server),
      "*3\r\n$4\r\nAUTH\r\n$5\r\nalice\r\n$6\r\nsecret\r\n"
    )
  }))

it.effect("decodes URL authority credentials once", () =>
  Effect.gen(function*() {
    const listener = yield* makeListener
    const server = yield* Effect.gen(function*() {
      const connection = yield* accept(listener)
      const request = yield* read(connection)
      yield* write(connection, "+OK\r\n")
      return request
    }).pipe(Effect.forkChild)

    const port = (listener.addr as Deno.NetAddr).port
    yield* Layer.build(DenoRedis.layer({
      url: `redis://app%3A%2540:p%40ss%2525@127.0.0.1:${port}`
    }))

    assert.strictEqual(
      yield* Fiber.join(server),
      "*3\r\n$4\r\nAUTH\r\n$7\r\napp:%40\r\n$7\r\np@ss%25\r\n"
    )
  }))

it.effect("does not decode a query-string password twice", () =>
  Effect.gen(function*() {
    const listener = yield* makeListener
    const server = yield* Effect.gen(function*() {
      const connection = yield* accept(listener)
      const request = yield* read(connection)
      yield* write(connection, "+OK\r\n")
      return request
    }).pipe(Effect.forkChild)

    const port = (listener.addr as Deno.NetAddr).port
    yield* Layer.build(DenoRedis.layer({
      url: `redis://alice@127.0.0.1:${port}/?password=p%2540ss`
    }))

    assert.strictEqual(
      yield* Fiber.join(server),
      "*3\r\n$4\r\nAUTH\r\n$5\r\nalice\r\n$6\r\np%40ss\r\n"
    )
  }))

it.effect("prefers explicit credentials over URL credentials", () =>
  Effect.gen(function*() {
    const listener = yield* makeListener
    const server = yield* Effect.gen(function*() {
      const connection = yield* accept(listener)
      const request = yield* read(connection)
      yield* write(connection, "+OK\r\n")
      return request
    }).pipe(Effect.forkChild)

    const port = (listener.addr as Deno.NetAddr).port
    yield* Layer.build(DenoRedis.layer({
      url: `redis://alice:secret@127.0.0.1:${port}`,
      username: "bob",
      password: "other"
    }))

    assert.strictEqual(
      yield* Fiber.join(server),
      "*3\r\n$4\r\nAUTH\r\n$3\r\nbob\r\n$5\r\nother\r\n"
    )
  }))

const RedisItem = Schema.Struct({
  n: Schema.Number
})

const encoder = new TextEncoder()
const decoder = new TextDecoder()

const makeListener = Effect.acquireRelease(
  Effect.sync(() => Deno.listen({ hostname: "127.0.0.1", port: 0 })),
  (listener) => Effect.sync(() => listener.close())
)

const accept = (listener: Deno.TcpListener) =>
  Effect.acquireRelease(
    Effect.promise(() => listener.accept()),
    (connection) => Effect.sync(() => connection.close())
  )

const read = (connection: Deno.TcpConn) =>
  Effect.promise(() => {
    const buffer = new Uint8Array(256)
    return connection.read(buffer).then((size) => size === null ? null : decoder.decode(buffer.subarray(0, size)))
  })

const write = (connection: Deno.TcpConn, value: string) => Effect.promise(() => connection.write(encoder.encode(value)))
