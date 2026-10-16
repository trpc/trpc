import { assert, describe, it } from "@effect/vitest"
import { Channel, Context, Fiber, References, Stream, Tracer } from "effect"
import * as Arr from "effect/Array"
import * as Cause from "effect/Cause"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Latch from "effect/Latch"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"
import * as Scheduler from "effect/Scheduler"
import * as Scope from "effect/Scope"

describe("Layer", () => {
  it.effect("layers can be acquired in parallel", () =>
    Effect.gen(function*() {
      const BoolTag = Context.Service<boolean>("boolean")
      const latch = Latch.makeUnsafe()
      const layer1 = Layer.effectContext<never, never, never>(Effect.never)
      const layer2 = Layer.effectContext(
        Effect.acquireRelease(
          latch.open.pipe(
            Effect.map((bool) => Context.make(BoolTag, bool))
          ),
          () => Effect.void
        )
      )
      const env = layer1.pipe(Layer.merge(layer2), Layer.build)
      const fiber = yield* Effect.forkDetach(Effect.scoped(env))
      yield* latch.await
      const result = yield* Fiber.interrupt(fiber)
      assert.isUndefined(result)
    }))

  it.effect("sharing with merge", () =>
    Effect.gen(function*() {
      const array: Array<string> = []
      const layer = makeLayer1(array)
      const env = layer.pipe(Layer.merge(layer), Layer.build)
      yield* Effect.scoped(env)
      assert.deepStrictEqual(array, [acquire1, release1])
    }))

  it.effect("preserves a failure when a shared layer build is interrupted", () =>
    Effect.gen(function*() {
      const Shared = Context.Service<number>("Shared")
      const Dying = Context.Service<number>("Dying")
      const Runtime = Context.Service<boolean>("Runtime")

      for (const kind of ["die", "fail"] as const) {
        const sharedStarted = Latch.makeUnsafe()
        const outerStarted = Latch.makeUnsafe()
        const shared = Layer.effect(Shared)(sharedStarted.open.pipe(Effect.andThen(Effect.never)))
        const dying = Layer.effect(Dying)(
          Effect.all([sharedStarted.await, outerStarted.await]).pipe(
            Effect.andThen(Effect.yieldNow),
            Effect.andThen(kind === "die" ? Effect.die("layer defect") : Effect.fail("layer failure"))
          )
        )
        const runtime = Layer.effect(Runtime)(Effect.as(Effect.all([Shared, Dying]), true)).pipe(
          Layer.provide([shared, dying])
        )
        const outerShared = Layer.fromBuild((memoMap, scope) =>
          sharedStarted.await.pipe(
            Effect.andThen(outerStarted.open),
            Effect.andThen(shared.build(memoMap, scope))
          )
        )

        const exit = yield* Layer.mergeAll(runtime, outerShared).pipe(Layer.build, Effect.scoped, Effect.exit)
        assert.isTrue(kind === "die" ? Exit.hasDies(exit) : Exit.hasFails(exit))
      }
    }))

  it.effect("sharing itself with merge", () =>
    Effect.gen(function*() {
      const service1 = new Service1()
      const layer = Layer.succeed(Service1Tag)(service1)
      const env = layer.pipe(Layer.merge(layer), Layer.merge(layer), Layer.build)
      const result = yield* env.pipe(
        Effect.map((context) => Context.get(context, Service1Tag))
      )
      assert.strictEqual(result, service1)
    }))

  it.effect("suspend is lazy", () =>
    Effect.gen(function*() {
      let evaluated = 0
      const layer = Layer.suspend(() => {
        evaluated++
        return Layer.succeed(Service1Tag)(new Service1())
      })

      assert.strictEqual(evaluated, 0)
      yield* Effect.scoped(Layer.build(layer))
      assert.strictEqual(evaluated, 1)
      yield* Effect.scoped(Layer.build(layer))
      assert.strictEqual(evaluated, 2)
    }))

  it.effect("suspend preserves sharing", () =>
    Effect.gen(function*() {
      const array: Array<string> = []
      let evaluated = 0
      const layer = Layer.suspend(() => {
        evaluated++
        return makeLayer1(array)
      })

      yield* Effect.scoped(layer.pipe(Layer.merge(layer), Layer.build))

      assert.strictEqual(evaluated, 1)
      assert.deepStrictEqual(array, [acquire1, release1])
    }))

  it.effect("finalizers", () =>
    Effect.gen(function*() {
      const arr: Array<string> = []
      const layer1 = makeLayer1(arr)
      const layer2 = makeLayer2(arr)
      const env = layer1.pipe(Layer.merge(layer2), Layer.build)
      yield* Effect.scoped(env)
      assert.isDefined(arr.slice(0, 2).find((s) => s === acquire1))
      assert.isDefined(arr.slice(0, 2).find((s) => s === acquire2))
      assert.isDefined(arr.slice(2, 4).find((s) => s === release1))
      assert.isDefined(arr.slice(2, 4).find((s) => s === release2))
    }))

  it.effect("catch - uses an alternative layer", () =>
    Effect.gen(function*() {
      const arr: Array<string> = []
      const layer1 = makeLayer1(arr)
      const layer2 = makeLayer2(arr)
      const env = Layer.effectDiscard(Effect.fail("failed!")).pipe(
        Layer.provideMerge(layer1),
        Layer.catch(() => layer2),
        Layer.build
      )
      yield* Effect.scoped(env)
      assert.deepStrictEqual(arr, [acquire1, release1, acquire2, release2])
    }))

  it.effect("catchTag - uses an alternative layer", () =>
    Effect.gen(function*() {
      class LayerError extends Data.TaggedError("LayerError") {}
      const arr: Array<string> = []
      const layer1 = makeLayer1(arr)
      const layer2 = makeLayer2(arr)
      const env = Layer.effectDiscard(Effect.fail(new LayerError())).pipe(
        Layer.provideMerge(layer1),
        Layer.catchTag("LayerError", () => layer2),
        Layer.build
      )
      yield* Effect.scoped(env)
      assert.deepStrictEqual(arr, [acquire1, release1, acquire2, release2])
    }))

  it.effect("catchCause recovers with a fallback layer and exposes the original cause", () =>
    Effect.gen(function*() {
      // Edge case: catchCause should receive the full Cause, not just the typed error,
      // and the replacement layer should still be built normally.
      const causes: Array<Cause.Cause<string>> = []
      const context = yield* Layer.effect(Service1Tag)(Effect.fail("failed!")).pipe(
        Layer.catchCause((cause) => {
          causes.push(cause)
          return Layer.succeed(Service1Tag)(new Service1())
        }),
        Layer.build,
        Effect.scoped
      )

      assert.strictEqual(yield* Context.get(context, Service1Tag).one(), 1)
      assert.strictEqual(causes.length, 1)
      assert.isTrue(Cause.hasFails(causes[0]))
    }))

  it.effect("tap - executes effect with success services and preserves output", () =>
    Effect.gen(function*() {
      const arr: Array<string> = []
      const env = makeLayer1(arr).pipe(
        Layer.tap((context) =>
          Effect.sync(() => {
            arr.push(`tap:${Context.get(context, Service1Tag).constructor.name}`)
          })
        ),
        Layer.build
      )
      const context = yield* Effect.scoped(env)
      const service = Context.get(context, Service1Tag)
      assert.strictEqual(yield* service.one(), 1)
      assert.deepStrictEqual(arr, [acquire1, "tap:Service1", release1])
    }))

  it.effect("tapError - executes effect and preserves original error", () =>
    Effect.gen(function*() {
      const arr: Array<string> = []
      const error = yield* Layer.effectDiscard(Effect.fail("failed!")).pipe(
        Layer.tapError((e) =>
          Effect.sync(() => {
            arr.push(`tapError:${e}`)
          })
        ),
        Layer.build,
        Effect.scoped,
        Effect.flip
      )
      assert.strictEqual(error, "failed!")
      assert.deepStrictEqual(arr, ["tapError:failed!"])
    }))

  it.effect("tapCause - executes effect and preserves original cause", () =>
    Effect.gen(function*() {
      const arr: Array<string> = []
      const exit = yield* Layer.effectDiscard(Effect.die("boom")).pipe(
        Layer.tapCause((cause) =>
          Effect.sync(() => {
            arr.push(`tapCause:${Cause.hasDies(cause)}`)
          })
        ),
        Layer.build,
        Effect.scoped,
        Effect.exit
      )
      assert.strictEqual(exit._tag, "Failure")
      if (exit._tag === "Failure") {
        assert.isTrue(Cause.hasDies(exit.cause))
      }
      assert.deepStrictEqual(arr, ["tapCause:true"])
    }))

  it.effect("fresh with merge", () =>
    Effect.gen(function*() {
      const arr: Array<string> = []
      const layer = makeLayer1(arr)
      const env = layer.pipe(Layer.merge(Layer.fresh(layer)), Layer.build)
      yield* Effect.scoped(env)
      assert.deepStrictEqual(arr, [acquire1, acquire1, release1, release1])
    }))

  it.effect("fresh with provide", () =>
    Effect.gen(function*() {
      const arr: Array<string> = []
      const layer = makeLayer1(arr)
      const env = Layer.fresh(layer).pipe(
        Layer.provide(layer),
        Layer.build
      )
      yield* Effect.scoped(env)
      assert.deepStrictEqual(arr, [acquire1, acquire1, release1, release1])
    }))

  it.effect("with multiple layers", () =>
    Effect.gen(function*() {
      const arr: Array<string> = []
      const layer = makeLayer1(arr)
      const env = layer.pipe(
        Layer.merge(layer),
        Layer.merge(layer.pipe(Layer.merge(layer), Layer.fresh)),
        Layer.build
      )
      yield* Effect.scoped(env)
      assert.deepStrictEqual(arr, [acquire1, acquire1, release1, release1])
    }))
  it.effect("with identical fresh layers", () =>
    Effect.gen(function*() {
      const arr: Array<string> = []
      const layer1 = makeLayer1(arr)
      const layer2 = makeLayer2(arr)
      const layer3 = makeLayer3(arr)
      const env = layer2.pipe(
        Layer.merge(
          layer3.pipe(
            Layer.provide(layer1),
            Layer.fresh
          )
        ),
        Layer.provide(Layer.fresh(layer1)),
        Layer.build
      )
      yield* Effect.scoped(env)
      assert.deepStrictEqual(arr, [
        acquire1,
        acquire2,
        acquire1,
        acquire3,
        release3,
        release1,
        release2,
        release1
      ])
    }))
  it.effect("interruption with merge", () =>
    Effect.gen(function*() {
      const arr: Array<string> = []
      const layer1 = makeLayer1(arr)
      const layer2 = makeLayer2(arr)
      const env = layer1.pipe(Layer.merge(layer2), Layer.build)
      const fiber = yield* Effect.forkChild(Effect.scoped(env))
      yield* Fiber.interrupt(fiber)
      if (arr.find((s) => s === acquire1) !== undefined) {
        assert.isTrue(arr.some((s) => s === release1))
      }
      if (arr.find((s) => s === acquire2) !== undefined) {
        assert.isTrue(arr.some((s) => s === release2))
      }
    }))
  it.effect("interruption with provide", () =>
    Effect.gen(function*() {
      const arr: Array<string> = []
      const layer1 = makeLayer1(arr)
      const layer2 = makeLayer2(arr)
      const env = layer2.pipe(Layer.provide(layer1), Layer.build)
      const fiber = yield* Effect.forkChild(Effect.scoped(env))
      yield* Fiber.interrupt(fiber)
      if (arr.find((s) => s === acquire1) !== undefined) {
        assert.isTrue(arr.some((s) => s === release1))
      }
      if (arr.find((s) => s === acquire2) !== undefined) {
        assert.isTrue(arr.some((s) => s === release2))
      }
    }))
  it.effect("interruption with multiple layers", () =>
    Effect.gen(function*() {
      const arr: Array<string> = []
      const layer1 = makeLayer1(arr)
      const layer2 = makeLayer2(arr)
      const layer3 = makeLayer3(arr)
      const env = layer3.pipe(
        Layer.provide(layer1),
        Layer.merge(layer2),
        Layer.provide(layer1),
        Layer.build
      )
      const fiber = yield* Effect.forkChild(Effect.scoped(env))
      yield* Fiber.interrupt(fiber)
      if (arr.find((s) => s === acquire1) !== undefined) {
        assert.isTrue(arr.some((s) => s === release1))
      }
      if (arr.find((s) => s === acquire2) !== undefined) {
        assert.isTrue(arr.some((s) => s === release2))
      }
      if (arr.find((s) => s === acquire3) !== undefined) {
        assert.isTrue(arr.some((s) => s === release3))
      }
    }))

  it.effect("finalizers with provide", () =>
    Effect.gen(function*() {
      const arr: Array<string> = []
      const layer1 = makeLayer1(arr)
      const layer2 = makeLayer2(arr)
      const env = layer2.pipe(Layer.provide(layer1), Layer.build)
      yield* Effect.scoped(env)
      assert.deepStrictEqual(arr, [acquire1, acquire2, release2, release1])
    }))

  it.effect("finalizers with multiple layers with provideTo", () =>
    Effect.gen(function*() {
      const arr: Array<string> = []
      const layer1 = makeLayer1(arr)
      const layer2 = makeLayer2(arr)
      const layer3 = makeLayer3(arr)
      const env = layer3.pipe(Layer.provide(layer2), Layer.provide(layer1), Layer.build)
      yield* Effect.scoped(env)
      assert.deepStrictEqual(arr, [acquire1, acquire2, acquire3, release3, release2, release1])
    }))

  it.effect("orDie does not interfere with sharing", () =>
    Effect.gen(function*() {
      const arr: Array<string> = []
      const layer1 = makeLayer1(arr)
      const layer2 = makeLayer2(arr)
      const layer3 = makeLayer3(arr)
      const env = layer3.pipe(
        Layer.provide(layer1),
        Layer.provide(layer2),
        Layer.provide(Layer.orDie(layer1)),
        Layer.build
      )
      yield* Effect.scoped(env)
      assert.strictEqual(arr[0], acquire1)
      assert.isTrue(arr.slice(1, 3).some((s) => s === acquire2))
      assert.isTrue(arr.slice(1, 3).some((s) => s === acquire3))
      assert.isTrue(arr.slice(3, 5).some((s) => s === release3))
      assert.isTrue(arr.slice(3, 5).some((s) => s === release2))
      assert.strictEqual(arr[5], release1)
    }))

  it.effect("launch keeps the layer open until interrupted and then finalizes", () =>
    Effect.gen(function*() {
      // Edge case: launch never completes on its own, so interruption must still
      // close the layer scope and run finalizers.
      const arr: Array<string> = []
      const fiber = yield* Effect.forkChild(Layer.launch(makeLayer1(arr)))
      yield* Effect.yieldNow
      assert.deepStrictEqual(arr, [acquire1])
      yield* Fiber.interrupt(fiber)
      assert.deepStrictEqual(arr, [acquire1, release1])
    }))

  describe("mock", () => {
    it.effect("allows passing partial service", () =>
      Effect.gen(function*() {
        class Service1 extends Context.Service<Service1, {
          one: Effect.Effect<number>
          two(): Effect.Effect<number>
          three: Stream.Stream<number>
        }>()("Service1") {}
        yield* Effect.gen(function*() {
          const service = yield* Service1
          assert.strictEqual(yield* service.one, 123)
          yield* service.two().pipe(
            Effect.catchDefect(Effect.fail),
            Effect.flip
          )
          yield* service.three.pipe(
            Stream.catchCause(Stream.fail),
            Stream.runDrain,
            Effect.flip
          )
        }).pipe(
          Effect.provide(
            Layer.mock(Service1)({
              one: Effect.succeed(123)
            })
          )
        )
      }))

    it.effect("allows passing partial service in dual form", () =>
      Effect.gen(function*() {
        class Service1 extends Context.Service<Service1, {
          one: Effect.Effect<number>
          two(): Effect.Effect<number>
        }>()("Service1") {}
        yield* Effect.gen(function*() {
          const service = yield* Service1
          assert.strictEqual(yield* service.one, 123)
          yield* service.two().pipe(
            Effect.catchDefect(Effect.fail),
            Effect.flip
          )
        }).pipe(
          Effect.provide(
            Layer.mock(Service1, {
              one: Effect.succeed(123)
            })
          )
        )
      }))

    it.effect("missing mock members fail as unimplemented effects and channels", () =>
      Effect.gen(function*() {
        // Edge case: missing mock members are represented by a value that can behave
        // as a function, Effect, Stream, or Channel depending on how it is used.
        class Service1 extends Context.Service<Service1, {
          effect(): Effect.Effect<number>
          channel: Channel.Channel<number, never, void>
        }>()("Service1") {}
        yield* Effect.gen(function*() {
          const service = yield* Service1
          const effectDefect = yield* service.effect().pipe(
            Effect.catchDefect(Effect.fail),
            Effect.flip
          )
          assert.strictEqual((effectDefect as Error).name, "UnimplementedError")

          const channelExit = yield* service.channel.pipe(
            Channel.runDrain,
            Effect.exit
          )
          assert.strictEqual(channelExit._tag, "Failure")

          const transformed = yield* (service.channel as unknown as {
            transform: () => Effect.Effect<Effect.Effect<never>>
          }).transform()
          const transformedDefect = yield* transformed.pipe(
            Effect.catchDefect(Effect.fail),
            Effect.flip
          )
          assert.strictEqual((transformedDefect as Error).name, "UnimplementedError")
        }).pipe(
          Effect.provide(Layer.mock(Service1)({}))
        )
      }))
  })

  describe("MemoMap", () => {
    class Shared extends Context.Service<Shared, { readonly n: number }>()("Shared") {}

    const releaseCounted = (released: Ref.Ref<number>) =>
      Layer.effect(
        Shared,
        Effect.acquireRelease(Effect.succeed({ n: 1 }), () => Ref.update(released, (n) => n + 1))
      )

    // A small MaxOpsBeforeYield budget makes a fiber yield before each op, so
    // sweeping the budget moves an interrupt through every step of a build.
    const budgets = Arr.range(3, 64)

    const settle = Effect.gen(function*() {
      for (let i = 0; i < 200; i++) yield* Effect.yieldNow
    })

    it.effect("interrupting a build does not hang current or later requesters", () =>
      Effect.gen(function*() {
        for (const ops of budgets) {
          const memoMap = Layer.makeMemoMapUnsafe()
          const layer = Layer.effect(Shared, Effect.succeed({ n: 1 }))
          const first = yield* Effect.forkChild(
            Effect.provideService(
              Layer.buildWithMemoMap(layer, memoMap, yield* Scope.make()),
              Scheduler.MaxOpsBeforeYield,
              ops
            ),
            { startImmediately: true }
          )
          const waiter = yield* Effect.forkChild(Layer.buildWithMemoMap(layer, memoMap, yield* Scope.make()), {
            startImmediately: true
          })
          yield* Fiber.interrupt(first)
          const later = yield* Effect.forkChild(Layer.buildWithMemoMap(layer, memoMap, yield* Scope.make()), {
            startImmediately: true
          })
          yield* settle
          assert.isDefined(waiter.pollUnsafe(), `waiter hung with ${ops} ops`)
          assert.isDefined(later.pollUnsafe(), `later requester hung with ${ops} ops`)
        }
      }))

    it.effect("an interrupted reuse does not keep the shared layer alive", () =>
      Effect.gen(function*() {
        for (const closed of [false, true]) {
          for (const ops of budgets) {
            const released = yield* Ref.make(0)
            const memoMap = Layer.makeMemoMapUnsafe()
            const layer = releaseCounted(released)
            const scope1 = yield* Scope.make()
            const scope2 = yield* Scope.make()
            yield* Layer.buildWithMemoMap(layer, memoMap, scope1)
            if (closed) yield* Scope.close(scope2, Exit.void)
            const reuse = yield* Effect.forkChild(
              Effect.provideService(Layer.buildWithMemoMap(layer, memoMap, scope2), Scheduler.MaxOpsBeforeYield, ops),
              { startImmediately: true }
            )
            yield* Fiber.interrupt(reuse)
            if (!closed) yield* Scope.close(scope2, Exit.void)
            yield* Scope.close(scope1, Exit.void)
            assert.strictEqual(yield* Ref.get(released), 1, `closed scope: ${closed}, ${ops} ops`)
          }
        }
      }))

    it.effect("running a get effect twice does not release the shared layer early", () =>
      Effect.gen(function*() {
        const released = yield* Ref.make(0)
        const memoMap = Layer.makeMemoMapUnsafe()
        const layer = releaseCounted(released)
        const scope1 = yield* Scope.make()
        const scope2 = yield* Scope.make()
        yield* Layer.buildWithMemoMap(layer, memoMap, scope1)
        const reuse = memoMap.get(layer, scope2)
        assert.isDefined(reuse)
        yield* reuse
        yield* reuse
        yield* Scope.close(scope2, Exit.void)
        assert.strictEqual(yield* Ref.get(released), 0)
        yield* Scope.close(scope1, Exit.void)
        assert.strictEqual(yield* Ref.get(released), 1)
      }))

    it.effect("a get effect that never runs does not keep the shared layer alive", () =>
      Effect.gen(function*() {
        const released = yield* Ref.make(0)
        const memoMap = Layer.makeMemoMapUnsafe()
        const layer = releaseCounted(released)
        const scope1 = yield* Scope.make()
        const scope2 = yield* Scope.make()
        yield* Layer.buildWithMemoMap(layer, memoMap, scope1)
        assert.isDefined(memoMap.get(layer, scope2))
        yield* Scope.close(scope2, Exit.void)
        yield* Scope.close(scope1, Exit.void)
        assert.strictEqual(yield* Ref.get(released), 1)
      }))

    it("does not memoize a build before its Effect executes", () => {
      const memoMap = Layer.makeMemoMapUnsafe()
      const scope = Scope.makeUnsafe()
      const layer = Layer.effectDiscard(Effect.void)

      // @effect-diagnostics-next-line floatingEffect:off
      Layer.buildWithMemoMap(layer, memoMap, scope)

      assert.strictEqual((memoMap as any).map.size, 0)
    })

    it.effect("memoizes suspend across builds", () =>
      Effect.gen(function*() {
        const arr: Array<string> = []
        let evaluated = 0
        const layer = Layer.suspend(() => {
          evaluated++
          return makeLayer1(arr)
        })
        const memoMap = Layer.makeMemoMapUnsafe()
        const scope1 = yield* Scope.make()
        const scope2 = yield* Scope.make()

        yield* Layer.buildWithMemoMap(layer, memoMap, scope1)
        yield* Layer.buildWithMemoMap(layer, memoMap, scope2)
        yield* Scope.close(scope2, Exit.void)

        assert.strictEqual(evaluated, 1)
        assert.deepStrictEqual(arr, [acquire1])

        yield* Scope.close(scope1, Exit.void)

        assert.deepStrictEqual(arr, [acquire1, release1])
      }))

    it.effect("memoizes layer across builds", () =>
      Effect.gen(function*() {
        const arr: Array<string> = []
        const layer1 = makeLayer1(arr)
        const layer2 = makeLayer2(arr).pipe(
          Layer.provide(layer1)
        )
        const memoMap = Layer.makeMemoMapUnsafe()
        const scope1 = yield* Scope.make()
        const scope2 = yield* Scope.make()

        yield* Layer.buildWithMemoMap(layer1, memoMap, scope1)
        yield* Layer.buildWithMemoMap(layer2, memoMap, scope2)
        yield* Scope.close(scope2, Exit.void)
        yield* Layer.buildWithMemoMap(layer2, memoMap, scope1)
        yield* Scope.close(scope1, Exit.void)

        assert.deepStrictEqual(arr, [acquire1, acquire2, release2, acquire2, release2, release1])
      }))

    it.effect("layers are not released early", () =>
      Effect.gen(function*() {
        const arr: Array<string> = []
        const layer1 = makeLayer1(arr)
        const layer2 = makeLayer2(arr).pipe(
          Layer.provide(layer1)
        )
        const memoMap = Layer.makeMemoMapUnsafe()
        const scope1 = yield* Scope.make()
        const scope2 = yield* Scope.make()

        yield* Layer.buildWithMemoMap(layer1, memoMap, scope1)
        yield* Layer.buildWithMemoMap(layer2, memoMap, scope2)
        yield* Scope.close(scope1, Exit.void)
        yield* Scope.close(scope2, Exit.void)

        assert.deepStrictEqual(arr, [acquire1, acquire2, release2, release1])
      }))

    it.effect("forked memo maps reuse parent layers but isolate child layers", () =>
      Effect.gen(function*() {
        // Edge case: a child MemoMap should reuse entries already present in the parent,
        // but entries first built in the child must not be written back to the parent.
        const arr: Array<string> = []
        const parent = yield* Layer.makeMemoMap
        const child = yield* Layer.forkMemoMap(parent)
        assert.strictEqual((child as any)["~effect/Layer/MemoMap"], "~effect/Layer/MemoMap")

        const scope1 = yield* Scope.make()
        const scope2 = yield* Scope.make()
        const parentLayer = makeLayer1(arr)
        const childLayer = makeLayer2(arr)

        yield* Layer.buildWithMemoMap(parentLayer, parent, scope1)
        yield* Layer.buildWithMemoMap(parentLayer, child, scope2)
        yield* Layer.buildWithMemoMap(childLayer, child, scope2)
        yield* Layer.buildWithMemoMap(childLayer, parent, scope1)

        yield* Scope.close(scope2, Exit.void)
        yield* Scope.close(scope1, Exit.void)

        assert.deepStrictEqual(arr, [acquire1, acquire2, acquire2, release2, release2, release1])
      }))
  })

  describe("tracing", () => {
    it.effect("withSpan forwards captureStackTrace to the layer stack frame", () =>
      Effect.gen(function*() {
        const Frame = Context.Service<References.StackFrame | undefined>("Frame")
        const layer = Layer.effect(Frame, References.CurrentStackFrame)

        // By default the frame records this call site, not Layer's internals.
        const captured = yield* Effect.provide(Frame, Layer.withSpan(layer, "captured"))
        assert.include(captured!.stack()!, "Layer.test.ts")

        const disabled = yield* Effect.provide(
          Frame,
          layer.pipe(Layer.withSpan("disabled", { captureStackTrace: false }))
        )
        assert.isUndefined(disabled!.stack())

        let calls = 0
        const supplied = yield* Effect.provide(
          Frame,
          Layer.withSpan(layer, "supplied", {
            captureStackTrace: () => {
              calls++
              return "at construct (app.ts:1:1)"
            }
          })
        )
        assert.strictEqual(calls, 0)
        assert.strictEqual(supplied!.stack(), "at construct (app.ts:1:1)")
        assert.strictEqual(calls, 1)
      }))

    it.effect("withSpan supports data-first usage and runs the onEnd finalizer", () =>
      Effect.gen(function*() {
        // Edge case: the data-first overload has separate runtime branching, and onEnd
        // must run when the layer scope closes.
        const SpanName = Context.Service<string>("SpanName")
        const exits: Array<Exit.Exit<unknown, unknown>> = []
        const scope = yield* Scope.make()
        const layer = Layer.effect(SpanName)(
          Effect.map(Tracer.ParentSpan, (span) => span._tag === "Span" ? span.name : span.spanId)
        )
        const context = yield* Layer.withSpan(layer, "layer-span", {
          onEnd: (_span, exit) => Effect.sync(() => exits.push(exit))
        }).pipe(Layer.buildWithScope(scope))

        assert.strictEqual(Context.get(context, SpanName), "layer-span")
        assert.deepStrictEqual(exits, [])

        yield* Scope.close(scope, Exit.void)

        assert.strictEqual(exits.length, 1)
        assert.strictEqual(exits[0]._tag, "Success")
      }))

    it.effect("withParentSpan supports data-last usage with external spans", () =>
      Effect.gen(function*() {
        // Edge case: external spans do not get stack-frame wrapping, but they should
        // still be installed as the parent span for layer construction.
        const SpanId = Context.Service<string>("SpanId")
        const parent = Tracer.externalSpan({
          spanId: "0000000000000001",
          traceId: "00000000000000000000000000000001",
          sampled: true
        })
        const context = yield* Layer.effect(SpanId)(
          Effect.map(Tracer.ParentSpan, (span) => span.spanId)
        ).pipe(
          Layer.withParentSpan(parent),
          Layer.build,
          Effect.scoped
        )

        assert.strictEqual(Context.get(context, SpanId), parent.spanId)
      }))
  })
})

const acquire1 = "Acquiring Module 1"
const acquire2 = "Acquiring Module 2"
const acquire3 = "Acquiring Module 3"
const release1 = "Releasing Module 1"
const release2 = "Releasing Module 2"
const release3 = "Releasing Module 3"

export class Service1 {
  one(): Effect.Effect<number> {
    return Effect.succeed(1)
  }
}
const Service1Tag = Context.Service<Service1>("Service1")
const makeLayer1 = (array: Array<string>): Layer.Layer<Service1> => {
  return Layer.effect(Service1Tag)(
    Effect.acquireRelease(
      Effect.sync(() => {
        array.push(acquire1)
        return new Service1()
      }),
      () => Effect.sync(() => array.push(release1))
    )
  )
}
class Service2 {
  two(): Effect.Effect<number> {
    return Effect.succeed(2)
  }
}
const Service2Tag = Context.Service<Service2>("Service2")
const makeLayer2 = (array: Array<string>): Layer.Layer<Service2> => {
  return Layer.effect(Service2Tag)(
    Effect.acquireRelease(
      Effect.sync(() => {
        array.push(acquire2)
        return new Service2()
      }),
      () => Effect.sync(() => array.push(release2))
    )
  )
}
class Service3 {
  three(): Effect.Effect<number> {
    return Effect.succeed(3)
  }
}
const Service3Tag = Context.Service<Service3>("Service3")
const makeLayer3 = (array: Array<string>): Layer.Layer<Service3> => {
  return Layer.effect(Service3Tag)(
    Effect.acquireRelease(
      Effect.sync(() => {
        array.push(acquire3)
        return new Service3()
      }),
      () => Effect.sync(() => array.push(release3))
    )
  )
}
