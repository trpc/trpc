import { assert, describe, it } from "@effect/vitest"
import { Duration, Effect, Exit, Layer, Queue, Scope } from "effect"
import { Persistence, Redis } from "effect/persistence"

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
      eval: () => () => Effect.die("unused")
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
        }
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
})
