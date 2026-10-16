import { assert, describe, it, test } from "@effect/vitest"
import { strictEqual } from "@effect/vitest/utils"
import { Context, Deferred, Effect, Exit, Fiber, Layer, ManagedRuntime, Pool, Scope } from "effect"

describe("ManagedRuntime", () => {
  test("memoizes the layer build", async () => {
    let count = 0
    const layer = Layer.effectDiscard(Effect.sync(() => {
      count++
    }))
    const runtime = ManagedRuntime.make(layer)
    await runtime.runPromise(Effect.void)
    await runtime.runPromise(Effect.void)
    await runtime.dispose()
    strictEqual(count, 1)
  })

  test("provides context", async () => {
    const tag = Context.Service<string>("string")
    const layer = Layer.succeed(tag)("test")
    const runtime = ManagedRuntime.make(layer)
    const result = await runtime.runPromise(tag)
    await runtime.dispose()
    strictEqual(result, "test")
  })

  test("allows sharing a MemoMap", async () => {
    let count = 0
    const layer = Layer.effectDiscard(Effect.sync(() => {
      count++
    }))
    const runtimeA = ManagedRuntime.make(layer)
    const runtimeB = ManagedRuntime.make(layer, { memoMap: runtimeA.memoMap })
    await runtimeA.runPromise(Effect.void)
    await runtimeB.runPromise(Effect.void)
    await runtimeA.dispose()
    await runtimeB.dispose()
    strictEqual(count, 1)
  })

  it("can be built synchronously", () => {
    const tag = Context.Service<string>("string")
    const layer = Layer.succeed(tag)("test")
    const managedRuntime = ManagedRuntime.make(layer)
    const services = Effect.runSync(managedRuntime.contextEffect)
    const result = Context.get(services, tag)
    strictEqual(result, "test")
  })

  test("supports await using", async () => {
    let count = 0
    const layer = Layer.effectDiscard(Effect.addFinalizer(() =>
      Effect.sync(() => {
        count++
      })
    ))
    {
      await using runtime = ManagedRuntime.make(layer)
      await runtime.runPromise(Effect.void)
      strictEqual(count, 0)
    }
    strictEqual(count, 1)
  })

  it("fibers are interrupted on dispose", async () => {
    const runtime = ManagedRuntime.make(Layer.empty)
    const fiber = runtime.runFork(Effect.never)
    await runtime.dispose()
    const exit = fiber.pollUnsafe()
    assert(exit)
    assert.isTrue(Exit.hasInterrupts(exit))
  })

  for (const method of ["disposeEffect", "dispose"] as const) {
    it(`finishes request cleanup before releasing layer resources with ${method}`, async () => {
      const events = await Effect.runPromise(Effect.gen(function*() {
        const Database = Context.Service<Pool.Pool<number>>("Database")
        const gate = yield* Deferred.make<void>()
        const started = yield* Deferred.make<void>()
        const events: Array<string> = []
        const layer = Layer.effect(
          Database,
          Pool.make({
            size: 1,
            acquire: Effect.acquireRelease(
              Effect.succeed(1),
              () =>
                Effect.sync(() => {
                  events.push("pool closed")
                })
            )
          })
        )
        const runtime = ManagedRuntime.make(layer)
        yield* runtime.contextEffect

        runtime.runFork(Effect.gen(function*() {
          const pool = yield* Database
          yield* Deferred.succeed(started, undefined)
          return yield* Effect.ensuring(
            Effect.never,
            Effect.gen(function*() {
              yield* Deferred.await(gate)
              const exit = yield* Effect.exit(Effect.scoped(Pool.get(pool)))
              events.push(`request cleanup: ${exit._tag}`)
            })
          )
        }))
        yield* Deferred.await(started)

        if (method === "disposeEffect") {
          const disposing = yield* Effect.forkChild(runtime.disposeEffect, { startImmediately: true })
          yield* Deferred.succeed(gate, undefined)
          yield* Fiber.join(disposing)
        } else {
          const disposing = runtime.dispose()
          yield* Deferred.succeed(gate, undefined)
          yield* Effect.promise(() => disposing)
        }
        return events
      }))

      assert.deepEqual(events, ["request cleanup: Success", "pool closed"])
    })
  }

  it("completes sequential layer finalizers when disposeEffect is interrupted", async () => {
    const ran = await Effect.runPromise(Effect.gen(function*() {
      const started = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const ran: Array<string> = []
      const layer = Layer.effectDiscard(Effect.gen(function*() {
        const scope = yield* Effect.scope
        yield* Scope.addFinalizer(
          scope,
          Effect.sync(() => {
            ran.push("close database")
          })
        )
        yield* Scope.addFinalizer(
          scope,
          Effect.gen(function*() {
            yield* Deferred.succeed(started, undefined)
            yield* Deferred.await(release)
            ran.push("flush logs")
          })
        )
      }))
      const runtime = ManagedRuntime.make(layer)
      yield* runtime.contextEffect

      const closing = yield* Effect.forkChild(runtime.disposeEffect, { startImmediately: true })
      yield* Deferred.await(started)
      // Interrupt from a separate fiber so this fiber can release the finalizer.
      const interrupting = yield* Effect.forkChild(Fiber.interrupt(closing), { startImmediately: true })
      yield* Deferred.succeed(release, undefined)
      yield* Fiber.join(interrupting)
      yield* Fiber.await(closing)
      yield* runtime.disposeEffect
      return ran
    }))

    assert.deepEqual(ran, ["flush logs", "close database"])
  })
})
