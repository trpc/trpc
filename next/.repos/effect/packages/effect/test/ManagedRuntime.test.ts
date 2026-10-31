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

  test("disposeEffect inside runPromise after an async boundary releases the layer", async () => {
    let released = false
    const runtime = ManagedRuntime.make(Layer.effectDiscard(Effect.addFinalizer(() =>
      Effect.sync(() => {
        released = true
      })
    )))

    // Bound the deadlock without waiting for the uninterruptible disposal fiber.
    const result = await Promise.race([
      runtime.runPromise(Effect.sleep(1).pipe(Effect.ensuring(runtime.disposeEffect))).then(() => "settled"),
      new Promise<string>((resolve) => setTimeout(() => resolve("timed out"), 500))
    ])
    assert.deepEqual({ result, released }, { result: "settled", released: true })
  })

  test("disposeEffect inside an immediately started request child releases the layer", async () => {
    let released = false
    const runtime = ManagedRuntime.make(Layer.effectDiscard(Effect.addFinalizer(() =>
      Effect.sync(() => {
        released = true
      })
    )))

    // Bound the deadlock without waiting for the uninterruptible disposal fiber.
    const result = await Promise.race([
      runtime.runPromise(Effect.gen(function*() {
        yield* Effect.sleep(1)
        const child = yield* Effect.forkChild(runtime.disposeEffect, { startImmediately: true })
        yield* Fiber.join(child)
      })).then(() => "settled"),
      new Promise<string>((resolve) => setTimeout(() => resolve("timed out"), 500))
    ])
    assert.deepEqual({ result, released }, { result: "settled", released: true })
  })

  test("a request that disposes the runtime before its first async step keeps running", async () => {
    let released = false
    const runtime = ManagedRuntime.make(
      Layer.effectDiscard(Effect.addFinalizer(() =>
        Effect.yieldNow.pipe(Effect.andThen(Effect.sync(() => {
          released = true
        })))
      ))
    )
    await runtime.runPromise(Effect.void)
    const result = await runtime.runPromise(Effect.gen(function*() {
      yield* runtime.disposeEffect
      yield* Effect.yieldNow
      return "finished"
    }))
    assert.deepEqual({ result, released }, { result: "finished", released: true })
  })

  test("a layer build that disposes the runtime is interrupted", async () => {
    const runtime: ManagedRuntime.ManagedRuntime<never, never> = ManagedRuntime.make(Layer.effectDiscard(
      Effect.suspend(() => runtime.disposeEffect).pipe(Effect.andThen(Effect.never))
    ))

    // Bound the hang without waiting for the build fiber.
    const result = await Promise.race([
      Effect.runPromiseExit(runtime.contextEffect).then(Exit.isFailure),
      new Promise<string>((resolve) => setTimeout(() => resolve("timed out"), 500))
    ])
    strictEqual(result, true)
  })

  test("detached-fiber disposal still interrupts and awaits its former request", async () => {
    const events: Array<string> = []
    const runtime = ManagedRuntime.make(Layer.effectDiscard(Effect.addFinalizer(() =>
      Effect.sync(() => {
        events.push("layer released")
      })
    )))

    const disposing = Effect.runPromise(Effect.gen(function*() {
      const gate = yield* Deferred.make<void>()
      const started = yield* Deferred.make<Fiber.Fiber<void>>()
      runtime.runFork(
        Effect.gen(function*() {
          const detached = yield* Effect.forkDetach(
            Deferred.await(gate).pipe(Effect.ensuring(runtime.disposeEffect))
          )
          yield* Deferred.succeed(started, detached)
          return yield* Effect.never
        }).pipe(Effect.ensuring(Effect.gen(function*() {
          yield* Effect.sleep(1)
          events.push("former request cleaned up")
        })))
      )
      const detached = yield* Deferred.await(started)
      yield* Deferred.succeed(gate, undefined)
      yield* Fiber.join(detached)
    }))

    // Bound the deadlock without waiting for the uninterruptible disposal fiber.
    const result = await Promise.race([
      disposing.then(() => "settled"),
      new Promise<string>((resolve) => setTimeout(() => resolve("timed out"), 500))
    ])
    assert.deepEqual({ result, events }, {
      result: "settled",
      events: ["former request cleaned up", "layer released"]
    })
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

  it.effect("overlapping disposal with the exported context waits for layer release", () =>
    Effect.gen(function*() {
      const started = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const events: Array<string> = []
      const runtime = ManagedRuntime.make(Layer.effectDiscard(Effect.addFinalizer(() =>
        Effect.gen(function*() {
          yield* Deferred.succeed(started, undefined)
          yield* Deferred.await(release)
          events.push("layer released")
        })
      )))
      const context = yield* runtime.contextEffect

      const first = yield* Effect.forkChild(runtime.disposeEffect, { startImmediately: true })
      yield* Deferred.await(started)
      const second = yield* Effect.forkChild(
        runtime.disposeEffect.pipe(
          Effect.provideContext(context),
          Effect.andThen(Effect.sync(() => events.push("second disposeEffect done")))
        ),
        { startImmediately: true }
      )
      yield* Deferred.succeed(release, undefined)
      yield* Fiber.join(first)
      yield* Fiber.join(second)
      assert.deepEqual(events, ["layer released", "second disposeEffect done"])
    }))

  test("a layer build interrupted by dispose can dispose the runtime", async () => {
    let cleaned = false
    const started = Promise.withResolvers<void>()
    const runtime: ManagedRuntime.ManagedRuntime<never, never> = ManagedRuntime.make(Layer.effectDiscard(
      Effect.suspend(() => {
        started.resolve()
        return Effect.never
      }).pipe(Effect.ensuring(Effect.suspend(() =>
        runtime.disposeEffect.pipe(Effect.andThen(Effect.sync(() => {
          cleaned = true
        })))
      )))
    ))
    runtime.runFork(Effect.void)
    await started.promise

    // Bound the deadlock without waiting for the uninterruptible disposal fiber.
    const result = await Promise.race([
      runtime.dispose().then(() => "settled"),
      new Promise<string>((resolve) => setTimeout(() => resolve("timed out"), 500))
    ])
    assert.deepEqual({ result, cleaned }, { result: "settled", cleaned: true })
  })

  test("a layer finalizer shared through a MemoMap can dispose the runtime releasing it", async () => {
    let released = false
    const layer = Layer.effectDiscard(
      Effect.addFinalizer(() =>
        runtimeB.disposeEffect.pipe(Effect.andThen(Effect.sync(() => {
          released = true
        })))
      )
    )
    // runtimeA builds the layer, but runtimeB holds the last reference to it.
    const runtimeA = ManagedRuntime.make(layer)
    const runtimeB: ManagedRuntime.ManagedRuntime<never, never> = ManagedRuntime.make(layer, {
      memoMap: runtimeA.memoMap
    })
    await runtimeA.runPromise(Effect.void)
    await runtimeB.runPromise(Effect.void)
    await runtimeA.dispose()

    // Bound the deadlock without waiting for the uninterruptible disposal fiber.
    const result = await Promise.race([
      runtimeB.dispose().then(() => "settled"),
      new Promise<string>((resolve) => setTimeout(() => resolve("timed out"), 500))
    ])
    assert.deepEqual({ result, released }, { result: "settled", released: true })
  })

  test("runtimes whose layer finalizers dispose each other can be disposed", async () => {
    const runtimeA: ManagedRuntime.ManagedRuntime<never, never> = ManagedRuntime.make(
      Layer.effectDiscard(Effect.addFinalizer(() => runtimeB.disposeEffect))
    )
    const runtimeB: ManagedRuntime.ManagedRuntime<never, never> = ManagedRuntime.make(
      Layer.effectDiscard(Effect.addFinalizer(() => runtimeA.disposeEffect))
    )
    await runtimeA.runPromise(Effect.void)
    await runtimeB.runPromise(Effect.void)

    // Bound the deadlock without waiting for the uninterruptible disposal fiber.
    const result = await Promise.race([
      runtimeA.dispose().then(() => "settled"),
      new Promise<string>((resolve) => setTimeout(() => resolve("timed out"), 500))
    ])
    assert.strictEqual(result, "settled")
  })

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
