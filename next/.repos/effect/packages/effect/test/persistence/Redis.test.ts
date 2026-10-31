import { assert, describe, it } from "@effect/vitest"
import { Deferred, Duration, Effect, Exit, Fiber, Layer, Queue, Scope, Semaphore } from "effect"
import { Persistence, Redis } from "effect/persistence"
import * as TestClock from "effect/testing/TestClock"

describe("Redis", () => {
  it("preserves __proto__ as an own script option", () => {
    const value = { polluted: true }
    const script = Redis.script(() => [], {
      ["__proto__"]: value,
      lua: "return nil",
      numberOfKeys: 0
    } as any)

    assert.isTrue(Object.hasOwn(script, "__proto__"))
    assert.strictEqual((script as any)["__proto__"], value)
  })

  it.effect("clearing an empty persistence store succeeds", () => {
    const redis = Redis.Redis.of({
      send: <A>(command: string, ...args: ReadonlyArray<string>) => {
        if (command.toUpperCase() === "KEYS") return Effect.succeed([] as unknown as A)
        if (command.toUpperCase() === "DEL" && args.length === 0) {
          return Effect.fail(new Redis.RedisError({ cause: "ERR wrong number of arguments for 'del' command" }))
        }
        return Effect.succeed(undefined as unknown as A)
      },
      subscribe: () => Queue.unbounded<Redis.RedisMessage, Redis.RedisError>(),
      eval: () => () => Effect.die("unused"),
      reserve: Effect.die("unused")
    })
    return Effect.gen(function*() {
      const backing = yield* Persistence.BackingPersistence
      const store = yield* backing.make("empty")
      yield* store.clear
    }).pipe(
      Effect.provide(Persistence.layerBackingRedis.pipe(Layer.provide(Layer.succeed(Redis.Redis, redis))))
    )
  })

  it.effect("rounds fractional persistence TTLs up to whole milliseconds", () => {
    const commands: Array<readonly [command: string, args: ReadonlyArray<string>]> = []
    const scripts: Array<unknown> = []
    const redis = Redis.Redis.of({
      send: <A>(command: string, ...args: ReadonlyArray<string>) => {
        commands.push([command, args])
        return Effect.succeed(undefined as unknown as A)
      },
      subscribe: () => Queue.unbounded<Redis.RedisMessage, Redis.RedisError>(),
      eval:
        <Config extends { readonly params: ReadonlyArray<unknown>; readonly result: unknown }>() =>
        (...params: Config["params"]) => {
          scripts.push(params[0])
          return Effect.succeed(undefined as Config["result"])
        },
      reserve: Effect.die("unused")
    })
    return Effect.gen(function*() {
      const backing = yield* Persistence.BackingPersistence
      const store = yield* backing.make("ttl")
      const ttl = Duration.nanos(1_500_000n)

      yield* store.set("single", {}, ttl)
      yield* store.setMany([["batch", {}, ttl]])

      assert.deepStrictEqual(
        commands.filter(([command]) => command === "SET"),
        [["SET", ["ttl:single", "{}", "PX", "2"]]]
      )
      assert.deepStrictEqual(scripts, [{
        sets: new Map([["ttl:batch", "{}"]]),
        expires: new Map([["ttl:batch", 2]])
      }])
    }).pipe(
      Effect.provide(Persistence.layerBackingRedis.pipe(Layer.provide(Layer.succeed(Redis.Redis, redis))))
    )
  })

  it.effect("retries script loading when SCRIPT LOAD fails", () =>
    Effect.gen(function*() {
      const commands: Array<readonly [command: string, args: ReadonlyArray<string>]> = []
      let scriptLoadAttempts = 0
      const redis = yield* Redis.make({
        connect: Effect.die("unused"),
        send: (command, ...args) =>
          Effect.suspend(() => {
            commands.push([command, args])
            if (command === "SCRIPT") {
              scriptLoadAttempts += 1
              if (scriptLoadAttempts === 1) {
                return Effect.fail(new Redis.RedisError({ cause: new Error("ERR transient script load failure") }))
              }
              return Effect.succeed("sha" as any)
            }
            return Effect.succeed("ok")
          }),
        subscribe: () => Effect.succeed(Effect.never)
      })
      const evalScript = redis.eval(
        Redis.script((key: string) => [key], {
          lua: "return KEYS[1]",
          numberOfKeys: 1
        }).withReturnType<string>()
      )

      const first = yield* Effect.result(evalScript("key"))
      const second = yield* evalScript("key")

      assert.strictEqual(first._tag, "Failure")
      assert.strictEqual(second, "ok")
      assert.deepStrictEqual(commands.map(([command]) => command), [
        "SCRIPT",
        "SCRIPT",
        "EVALSHA"
      ])
    }))

  it.effect("reloads and retries scripts when EVALSHA returns NOSCRIPT", () =>
    Effect.gen(function*() {
      const commands: Array<readonly [command: string, args: ReadonlyArray<string>]> = []
      let evalShaAttempts = 0
      const redis = yield* Redis.make({
        connect: Effect.die("unused"),
        send: (command, ...args) =>
          Effect.suspend(() => {
            commands.push([command, args])
            if (command === "EVALSHA") {
              evalShaAttempts += 1
            }
            if (command === "SCRIPT") {
              return Effect.succeed("sha" as any)
            }
            if (command === "EVALSHA" && evalShaAttempts === 1) {
              return Effect.fail(new Redis.RedisError({ cause: new Error("NOSCRIPT No matching script") }))
            }
            return Effect.succeed("ok")
          }),
        subscribe: () => Effect.succeed(Effect.never)
      })
      const evalScript = redis.eval(
        Redis.script((key: string) => [key], {
          lua: "return KEYS[1]",
          numberOfKeys: 1
        }).withReturnType<string>()
      )

      const result = yield* evalScript("key")

      assert.strictEqual(result, "ok")
      assert.deepStrictEqual(commands.map(([command]) => command), [
        "SCRIPT",
        "EVALSHA",
        "SCRIPT",
        "EVALSHA"
      ])
    }))

  it.effect("receives messages from a subscription", () =>
    Effect.gen(function*() {
      const redis = yield* Redis.make({
        connect: Effect.die("unused"),
        send: () => Effect.die("unused"),
        subscribe: (_channel, onMessage) =>
          Effect.sync(() => {
            onMessage({ channel: "events", message: "hello" })
            return Effect.never
          })
      })

      const subscription = yield* redis.subscribe("events")

      assert.deepStrictEqual(yield* Queue.take(subscription), {
        channel: "events",
        message: "hello"
      })
    }))

  it.effect("reports subscription setup failures through the dequeue", () =>
    Effect.gen(function*() {
      const error = new Redis.RedisError({ cause: new Error("subscription failed") })
      const redis = yield* Redis.make({
        connect: Effect.die("unused"),
        send: () => Effect.die("unused"),
        subscribe: () => Effect.fail(error)
      })

      const subscription = yield* redis.subscribe("events")

      assert.strictEqual(yield* Queue.take(subscription).pipe(Effect.flip), error)
    }))

  it.effect("reports listener failures through the dequeue", () =>
    Effect.gen(function*() {
      const error = new Redis.RedisError({ cause: new Error("listener failed") })
      const redis = yield* Redis.make({
        connect: Effect.die("unused"),
        send: () => Effect.die("unused"),
        subscribe: () => Effect.succeed(Effect.fail(error))
      })

      const subscription = yield* redis.subscribe("events")

      assert.strictEqual(yield* Queue.take(subscription).pipe(Effect.flip), error)
    }))

  it.effect("shuts down the dequeue and releases the subscriber with its scope", () =>
    Effect.gen(function*() {
      let released = false
      const redis = yield* Redis.make({
        connect: Effect.die("unused"),
        send: () => Effect.die("unused"),
        subscribe: () =>
          Effect.acquireRelease(
            Effect.void,
            () =>
              Effect.sync(() => {
                released = true
              })
          ).pipe(Effect.as(Effect.never))
      })
      const scope = yield* Scope.make()
      const subscription = yield* redis.subscribe("events").pipe(Scope.provide(scope))

      yield* Scope.close(scope, Exit.void)

      assert.isTrue(released)
      assert.isTrue(Exit.hasInterrupts(yield* Queue.take(subscription).pipe(Effect.exit)))
    }))

  describe("reserve", () => {
    const makeHarness = Effect.fnUntraced(function*(options: {
      readonly pool?: Redis.PoolOptions
      // runs before a connection opens, standing in for the socket handshake
      readonly handshake?: Effect.Effect<void, Redis.RedisError>
    } = {}) {
      const blocked = yield* Deferred.make<void>()
      const shared = yield* Semaphore.make(1)
      let connects = 0
      let closes = 0
      // XREAD only returns once its connection is closed, so anything queued
      // behind it on the same connection waits
      const send = <A>(command: string, closed: Deferred.Deferred<void>): Effect.Effect<A, Redis.RedisError> =>
        command === "XREAD"
          ? Deferred.succeed(blocked, void 0).pipe(
            Effect.andThen(Deferred.await(closed)),
            Effect.andThen(Effect.fail(new Redis.RedisError({ cause: new Error("connection closed") })))
          )
          : Effect.succeed(command as A)
      const sharedClosed = yield* Deferred.make<void>()
      const redis = yield* Redis.make({
        send: (command) => shared.withPermit(send(command, sharedClosed)),
        subscribe: () => Effect.succeed(Effect.never),
        connect: Effect.andThen(
          options.handshake ?? Effect.void,
          Effect.sync(() => {
            connects++
            const closed = Deferred.makeUnsafe<void>()
            return {
              send: <A>(command: string) => send<A>(command, closed),
              close: Effect.suspend(() => Deferred.succeed(closed, void 0)).pipe(
                Effect.map((first) => {
                  if (first) closes++
                })
              )
            }
          })
        ),
        pool: options.pool
      })
      return { redis, blocked, connects: () => connects, closes: () => closes }
    })

    const blockingRead = (redis: Redis.Redis["Service"]) =>
      redis.reserve.pipe(
        Effect.flatMap((connection) => connection.send("XREAD", "BLOCK", "0", "STREAMS", "events", "$")),
        Effect.scoped,
        Effect.forkChild
      )

    const ping = (redis: Redis.Redis["Service"]) =>
      redis.reserve.pipe(
        Effect.flatMap((connection) => connection.send("PING")),
        Effect.scoped
      )

    it.effect("blocking commands on a reserved connection do not delay shared commands", () =>
      Effect.gen(function*() {
        const { blocked, redis } = yield* makeHarness()

        const fiber = yield* blockingRead(redis)
        yield* Deferred.await(blocked)

        assert.strictEqual(yield* redis.send("XADD", "events", "*", "key", "value"), "XADD")
        yield* Fiber.interrupt(fiber)
      }))

    it.effect("reuses idle connections and closes idle and in-flight connections with the service scope", () =>
      Effect.gen(function*() {
        const scope = yield* Scope.make()
        const { blocked, closes, connects, redis } = yield* makeHarness().pipe(Scope.provide(scope))

        yield* blockingRead(redis)
        yield* Deferred.await(blocked)
        assert.strictEqual(yield* ping(redis), "PING")
        assert.strictEqual(yield* ping(redis), "PING")
        assert.strictEqual(connects(), 2)
        assert.strictEqual(closes(), 0)

        yield* Scope.close(scope, Exit.void)

        assert.strictEqual(closes(), 2)
      }))

    it.effect("closes instead of reusing a connection released with a command in flight", () =>
      Effect.gen(function*() {
        const { blocked, closes, connects, redis } = yield* makeHarness()

        const fiber = yield* blockingRead(redis)
        yield* Deferred.await(blocked)
        yield* Fiber.interrupt(fiber)

        assert.strictEqual(yield* ping(redis), "PING")
        assert.strictEqual(connects(), 2)
        assert.strictEqual(closes(), 1)
      }))

    it.effect("closes instead of reusing a connection released while a command is still running", () =>
      Effect.gen(function*() {
        const { blocked, closes, connects, redis } = yield* makeHarness()
        const reservation = yield* Scope.make()
        const connection = yield* redis.reserve.pipe(Scope.provide(reservation))

        yield* connection.send("XREAD", "BLOCK", "0", "STREAMS", "events", "$").pipe(Effect.forkChild)
        yield* Deferred.await(blocked)
        yield* Scope.close(reservation, Exit.void)

        assert.strictEqual(yield* ping(redis), "PING")
        assert.strictEqual(connects(), 2)
        assert.strictEqual(closes(), 1)
      }))

    it.effect("waits for a free connection at maxConnections and fails after acquireTimeout", () =>
      Effect.gen(function*() {
        const { connects, redis } = yield* makeHarness({ pool: { maxConnections: 1, acquireTimeout: "1 second" } })
        const first = yield* Scope.make()
        yield* redis.reserve.pipe(Scope.provide(first))

        const timedOut = yield* Effect.scoped(redis.reserve).pipe(Effect.flip, Effect.forkChild)
        yield* TestClock.adjust("1 second")
        assert.instanceOf(yield* Fiber.join(timedOut), Redis.RedisError)

        const waiting = yield* ping(redis).pipe(Effect.forkChild)
        yield* Scope.close(first, Exit.void)

        assert.strictEqual(yield* Fiber.join(waiting), "PING")
        assert.strictEqual(connects(), 1)
      }))

    it.effect("retries a failed connect on the next reserve", () =>
      Effect.gen(function*() {
        let handshakes = 0
        const { connects, redis } = yield* makeHarness({
          handshake: Effect.suspend(() =>
            ++handshakes === 1 ? Effect.fail(new Redis.RedisError({ cause: new Error("ECONNREFUSED") })) : Effect.void
          )
        })

        assert.instanceOf(yield* ping(redis).pipe(Effect.flip), Redis.RedisError)
        assert.strictEqual(yield* ping(redis), "PING")
        assert.strictEqual(handshakes, 2)
        assert.strictEqual(connects(), 1)
      }))

    it.effect("does not leak a connection when reserve is interrupted during connect", () =>
      Effect.gen(function*() {
        const started = yield* Deferred.make<void>()
        const handshake = yield* Deferred.make<void>()
        const scope = yield* Scope.make()
        const { closes, connects, redis } = yield* makeHarness({
          // a promise keeps resolving after its fiber is interrupted, like a socket handshake
          handshake: Deferred.succeed(started, void 0).pipe(
            Effect.andThen(Effect.promise(() => Effect.runPromise(Deferred.await(handshake))))
          )
        }).pipe(Scope.provide(scope))

        const fiber = yield* ping(redis).pipe(Effect.forkChild)
        yield* Deferred.await(started)
        const interrupted = yield* Fiber.interrupt(fiber).pipe(Effect.forkChild({ startImmediately: true }))
        yield* Deferred.succeed(handshake, void 0)
        yield* Fiber.join(interrupted)
        yield* Scope.close(scope, Exit.void)

        assert.strictEqual(connects(), 1)
        assert.strictEqual(closes(), 1)
      }))

    it.effect("evaluates scripts on a reserved connection, loading them through the shared connection", () =>
      Effect.gen(function*() {
        const shared: Array<string> = []
        const reserved: Array<string> = []
        const redis = yield* Redis.make({
          send: (command) =>
            Effect.sync(() => {
              shared.push(command)
              return "sha" as any
            }),
          subscribe: () => Effect.succeed(Effect.never),
          connect: Effect.succeed({
            send: (command: string) =>
              Effect.suspend(() => {
                reserved.push(command)
                return reserved.length === 1
                  ? Effect.fail(new Redis.RedisError({ cause: new Error("NOSCRIPT No matching script") }))
                  : Effect.succeed("ok" as any)
              }),
            close: Effect.void
          })
        })
        const evalScript = Redis.script((key: string) => [key], {
          lua: "return KEYS[1]",
          numberOfKeys: 1
        }).withReturnType<string>()

        const result = yield* redis.reserve.pipe(
          Effect.flatMap((connection) => connection.eval(evalScript)("key")),
          Effect.scoped
        )

        assert.strictEqual(result, "ok")
        assert.deepStrictEqual(shared, ["SCRIPT", "SCRIPT"])
        assert.deepStrictEqual(reserved, ["EVALSHA", "EVALSHA"])
      }))
  })
})
