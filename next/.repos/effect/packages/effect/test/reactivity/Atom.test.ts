import { addEqualityTesters, afterEach, assert, beforeEach, describe, expect, it, test, vitest } from "@effect/vitest"
import {
  Array as Arr,
  Cause,
  Context,
  Deferred,
  Effect,
  Hash,
  Latch,
  Layer,
  Logger,
  Option,
  Queue,
  References,
  Result,
  Schema,
  Stream,
  SubscriptionRef
} from "effect"
import { KeyValueStore } from "effect/persistence"
import { AsyncResult, Atom, AtomRegistry, Hydration, Reactivity } from "effect/reactivity"
import { TestClock } from "effect/testing"
import { collectGarbage, getGc } from "../utils/gc.ts"

declare const global: any

addEqualityTesters()

describe("Atom", { concurrent: false }, () => {
  beforeEach(async () => {
    vitest.useFakeTimers({
      toFake: [
        "Date",
        "hrtime",
        "setTimeout",
        "clearTimeout",
        "setInterval",
        "clearInterval",
        "performance"
      ]
    })
    await Effect.runPromise(Effect.yieldNow)
  })
  afterEach(() => {
    vitest.useRealTimers()
  })

  it("get/set", () => {
    const counter = Atom.make(0)
    const r = AtomRegistry.make()
    expect(r.get(counter)).toEqual(0)
    r.set(counter, 1)
    expect(r.get(counter)).toEqual(1)
  })

  it("late reads of uninitialized dependencies do not rebuild the reader", async () => {
    const dependency = Atom.make(0)
    let builds = 0
    const reader = Atom.make((get) => {
      const timer = setTimeout(() => get(dependency), 1)
      get.addFinalizer(() => clearTimeout(timer))
      return ++builds
    })
    const r = AtomRegistry.make()
    r.subscribe(reader, () => {})

    try {
      r.get(reader)
      await vitest.advanceTimersByTimeAsync(10)
      expect(r.get(reader)).toEqual(1)
    } finally {
      r.dispose()
    }
  })

  it("keepAlive false", async () => {
    const counter = Atom.make(0)
    const r = AtomRegistry.make()
    r.set(counter, 1)
    expect(r.get(counter)).toEqual(1)
    await Effect.runPromise(Effect.yieldNow)
    expect(r.get(counter)).toEqual(0)
  })

  it("keepAlive true", async () => {
    const counter = Atom.make(0).pipe(
      Atom.keepAlive
    )
    const r = AtomRegistry.make()
    r.set(counter, 1)
    expect(r.get(counter)).toEqual(1)
    await new Promise((resolve) => resolve(null))
    expect(r.get(counter)).toEqual(1)
  })

  it("subscribe", async () => {
    const counter = Atom.make(0)
    const r = AtomRegistry.make()
    let count = 0
    const cancel = r.subscribe(counter, (_) => {
      count = _
    })
    r.set(counter, 1)
    expect(count).toEqual(1)
    await Effect.runPromise(Effect.yieldNow)

    expect(r.get(counter)).toEqual(1)
    cancel()
    await Effect.runPromise(Effect.yieldNow)
    expect(r.get(counter)).toEqual(0)
  })

  it("subscribe does not skip listeners when unsubscribing during notify", () => {
    const counter = Atom.make(0)
    const r = AtomRegistry.make()
    let first = 0
    let second = 0
    let cancelFirst = () => {
    }

    cancelFirst = r.subscribe(counter, () => {
      first++
      cancelFirst()
    })

    r.subscribe(counter, () => {
      second++
    })

    r.set(counter, 1)

    expect(first).toEqual(1)
    expect(second).toEqual(1)
  })

  it("withEquality skips notifications for equivalent values", () => {
    const point = Atom.make({ x: 0, y: 0 }).pipe(
      Atom.withEquality<{ x: number; y: number }>((a, b) => a.x === b.x && a.y === b.y),
      Atom.keepAlive
    )
    const r = AtomRegistry.make()
    const initial = r.get(point)
    let count = 0
    r.subscribe(point, () => {
      count++
    })

    r.set(point, { x: 0, y: 0 })
    expect(count).toEqual(0)
    expect(r.get(point)).toBe(initial)

    r.set(point, { x: 1, y: 0 })
    expect(count).toEqual(1)
    expect(r.get(point)).toEqual({ x: 1, y: 0 })
  })

  it("withEquality skips invalidation of derived atoms", () => {
    const point = Atom.make({ x: 0, y: 0 }).pipe(
      Atom.withEquality<{ x: number; y: number }>((a, b) => a.x === b.x && a.y === b.y),
      Atom.keepAlive
    )
    let builds = 0
    const x = Atom.map(point, (p) => {
      builds++
      return p.x
    })
    const r = AtomRegistry.make()
    r.subscribe(x, () => {})

    expect(r.get(x)).toEqual(0)
    expect(builds).toEqual(1)
    r.set(point, { x: 0, y: 0 })
    expect(builds).toEqual(1)
    r.set(point, { x: 2, y: 0 })
    expect(r.get(x)).toEqual(2)
    expect(builds).toEqual(2)
  })

  it("searchParam with schema reads initial query value", () => {
    const previousWindow = (globalThis as any).window
    const r = AtomRegistry.make()
    Object.defineProperty(globalThis, "window", {
      value: {
        location: {
          pathname: "/",
          search: "?page=6"
        },
        history: {
          pushState: () => {
          }
        },
        addEventListener: () => {
        },
        removeEventListener: () => {
        }
      },
      configurable: true,
      writable: true
    })

    try {
      const page = Atom.searchParam("page", { schema: Schema.NumberFromString })
      expect(r.get(page)).toEqual(Option.some(6))
    } finally {
      r.dispose()
      if (typeof previousWindow === "undefined") {
        delete (globalThis as any).window
      } else {
        Object.defineProperty(globalThis, "window", {
          value: previousWindow,
          configurable: true,
          writable: true
        })
      }
    }
  })

  it("windowFocusSignal works when window is undefined", () => {
    const r = AtomRegistry.make()
    try {
      expect(r.get(Atom.windowFocusSignal)).toEqual(0)
    } finally {
      r.dispose()
    }
  })

  it("refreshOnWindowFocus works when window is undefined", () => {
    const r = AtomRegistry.make()
    try {
      expect(r.get(Atom.refreshOnWindowFocus(Atom.make(1)))).toEqual(1)
    } finally {
      r.dispose()
    }
  })

  it("searchParam keeps the hash and omits an empty query", async () => {
    const r = AtomRegistry.make()
    const location = new URL("http://localhost/path?q=1#section")
    const urls: Array<string> = []
    vitest.stubGlobal("window", {
      location,
      history: {
        pushState: (_state: unknown, _title: string, url: string) => {
          urls.push(url)
          location.href = new URL(url, location).href
        }
      },
      addEventListener: () => {},
      removeEventListener: () => {}
    })

    try {
      const q = Atom.searchParam("q")
      r.set(q, "2")
      await vitest.advanceTimersByTimeAsync(500)
      r.set(q, "")
      await vitest.advanceTimersByTimeAsync(500)
      expect(urls).toEqual(["/path?q=2#section", "/path#section"])
    } finally {
      r.dispose()
      vitest.unstubAllGlobals()
    }
  })

  it("runtime", async () => {
    const count = counterRuntime.atom(Counter.use((_) => _.get)).pipe(
      Atom.withLabel("count")
    )
    const r = AtomRegistry.make()
    const result = r.get(count)
    assert(AsyncResult.isSuccess(result))
    expect(result.value).toEqual(1)
  })

  it("runtime layers are disposed with their registry", () => {
    interface Service {
      readonly id: number
      readonly isAlive: () => boolean
      readonly finalize: () => void
    }
    const Service = Context.Service<Service>("Atom.test/RegistryScopedService")
    const finalized: Array<number> = []
    let builds = 0
    const layer = Layer.effect(
      Service,
      Effect.acquireRelease(
        Effect.sync(() => {
          const id = ++builds
          let alive = true
          return Service.of({ id, isAlive: () => alive, finalize: () => alive = false })
        }),
        (service) =>
          Effect.sync(() => {
            service.finalize()
            finalized.push(service.id)
          })
      )
    )
    const runtime = Atom.runtime(layer)
    const service = runtime.atom(Service)
    const registryA = AtomRegistry.make()
    const registryB = AtomRegistry.make()

    const resultA = registryA.get(service)
    const resultB = registryB.get(service)
    assert(AsyncResult.isSuccess(resultA))
    assert(AsyncResult.isSuccess(resultB))
    expect(resultA.value.id).not.toEqual(resultB.value.id)

    registryA.dispose()

    expect(finalized).toEqual([resultA.value.id])
    expect(resultA.value.isAlive()).toEqual(false)
    expect(resultB.value.isAlive()).toEqual(true)
    assert(AsyncResult.isSuccess(registryB.get(service)))

    registryB.dispose()
  })

  it.effect("reports asynchronous runtime layer finalizer failures on disposal", () =>
    Effect.gen(function*() {
      const release = yield* Latch.make()
      const logged = yield* Deferred.make<Logger.Options<unknown>>()
      const cause = Cause.die("cleanup failed")
      const runtime = Atom.runtime(
        Layer.effectDiscard(Effect.addFinalizer(() => release.await.pipe(Effect.andThen(Effect.failCause(cause)))))
          .pipe(
            Layer.provideMerge(Layer.mergeAll(
              Logger.layer([Logger.make((event) => Deferred.doneUnsafe(logged, Effect.succeed(event)))]),
              Layer.succeed(References.UnhandledLogLevel, "Warn")
            ))
          )
      )
      const registry = AtomRegistry.make()

      try {
        registry.get(runtime.atom(Effect.void))
        registry.dispose()
        yield* release.open
        const event = yield* Deferred.await(logged)
        assert.deepStrictEqual(event.cause, cause)
        assert.strictEqual(event.logLevel, "Warn")
      } finally {
        yield* release.open
        registry.dispose()
      }
    }))

  it("default runtime factories build layers once per registry", () => {
    const Service = Context.Service<number>("Atom.test/DefaultRegistryScopedService")
    let builds = 0
    const runtime = Atom.runtime(Layer.sync(Service, () => ++builds))
    const service = runtime.atom(Service)
    const registryA = AtomRegistry.make()
    const registryB = AtomRegistry.make()

    expect(registryA.get(service)).toEqual(AsyncResult.success(1))
    expect(registryB.get(service)).toEqual(AsyncResult.success(2))
    expect(builds).toEqual(2)

    registryA.dispose()
    registryB.dispose()
  })

  it("concrete runtime memo maps share layers across registries", () => {
    const Service = Context.Service<number>("Atom.test/SharedRuntimeService")
    let builds = 0
    const factory = Atom.context({ memoMap: Layer.makeMemoMapUnsafe() })
    const runtime = factory(Layer.sync(Service, () => ++builds))
    const service = runtime.atom(Service)
    const registryA = AtomRegistry.make()
    const registryB = AtomRegistry.make()

    expect(registryA.get(service)).toEqual(AsyncResult.success(1))
    expect(registryB.get(service)).toEqual(AsyncResult.success(1))
    expect(builds).toEqual(1)

    registryA.dispose()
    registryB.dispose()
  })

  it("shared memo map atoms share within a registry and isolate across registries", () => {
    const Service = Context.Service<number>("Atom.test/SharedRegistryScopedService")
    let builds = 0
    const layer = Layer.sync(Service, () => ++builds)
    const memoMap = Atom.make(() => Layer.makeMemoMapUnsafe())
    const factoryA = Atom.context({ memoMap })
    const factoryB = Atom.context({ memoMap })
    const serviceA = factoryA(layer).atom(Service)
    const serviceB = factoryB(layer).atom(Service)
    const registryA = AtomRegistry.make()
    const registryB = AtomRegistry.make()

    expect(registryA.get(serviceA)).toEqual(AsyncResult.success(1))
    expect(registryA.get(serviceB)).toEqual(AsyncResult.success(1))
    expect(registryB.get(serviceA)).toEqual(AsyncResult.success(2))
    expect(registryB.get(serviceB)).toEqual(AsyncResult.success(2))
    expect(builds).toEqual(2)

    registryA.dispose()
    registryB.dispose()
  })

  it("runtime replacement preserves Reactivity and shared invalidation", () => {
    const count = counterRuntime.atom(Counter.use((_) => _.get)).pipe(
      Atom.withReactivity(["counter"])
    )
    const inc = counterRuntime.fn(() => Counter.use((_) => _.inc), {
      reactivityKeys: ["counter"]
    })
    const r = AtomRegistry.make({
      initialValues: [Atom.initialValue(counterRuntime.layer, CounterTest)]
    })
    try {
      r.mount(count)
      assert.deepStrictEqual(r.get(count), AsyncResult.success(10))
      r.set(inc, void 0)
      assert.deepStrictEqual(r.get(inc), AsyncResult.success(undefined))
      assert.deepStrictEqual(r.get(count), AsyncResult.success(11))
    } finally {
      r.dispose()
    }
  })

  it("runtime replacement preserves global layers", () => {
    const Global = Context.Service<string>("Atom.test/ReplacementGlobal")
    const factory = Atom.context()
    factory.addGlobalLayer(Layer.succeed(Global, "global"))
    const runtime = factory(CounterLayer)
    const global = runtime.atom(Effect.serviceOption(Global))
    const r = AtomRegistry.make({
      initialValues: [Atom.initialValue(runtime.layer, CounterTest)]
    })
    try {
      assert.deepStrictEqual(r.get(global), AsyncResult.success(Option.some("global")))
    } finally {
      r.dispose()
    }
  })

  it("runtime replacement", async () => {
    const count = counterRuntime.atom(Counter.use((_) => _.get))
    const r = AtomRegistry.make({
      initialValues: [Atom.initialValue(counterRuntime.layer, CounterTest)]
    })
    const result = r.get(count)
    assert(AsyncResult.isSuccess(result))
    expect(result.value).toEqual(10)
  })

  it("runtime replacement", async () => {
    const count = Atom.fnSync<number, number>((x) => x, { initialValue: 0 })
    const r = AtomRegistry.make({ initialValues: [Atom.initialValue(count, 10)] })
    const result = r.get(count)
    expect(result).toEqual(10)
    r.set(count, 20)
    const result2 = r.get(count)
    expect(result2).toEqual(20)
  })

  it("runtime multiple", async () => {
    const buildCount = buildCounterRuntime.fn<void>()((_) => BuildCounter.use((_) => _.get))
    const count = counterRuntime.atom(Counter.use((_) => _.get))
    const timesTwo = multiplierRuntime.atom((get) =>
      Effect.gen(function*() {
        const counter = yield* Counter
        const multiplier = yield* Multiplier
        yield* counter.inc
        expect(yield* get.result(count)).toEqual(2)
        return yield* multiplier.times(2)
      })
    )
    const r = AtomRegistry.make()
    const cancel = r.mount(buildCount)

    let result = r.get(timesTwo)
    assert(AsyncResult.isSuccess(result))
    expect(result.value).toEqual(4)

    result = r.get(count)
    assert(AsyncResult.isSuccess(result))
    expect(result.value).toEqual(2)

    r.set(buildCount, void 0)
    assert.deepStrictEqual(r.get(buildCount), AsyncResult.success(1))

    await Effect.runPromise(Effect.yieldNow)
    await Effect.runPromise(Effect.yieldNow)

    result = r.get(count)
    assert(AsyncResult.isSuccess(result))
    expect(result.value).toEqual(1)

    r.set(buildCount, void 0)
    assert.deepStrictEqual(r.get(buildCount), AsyncResult.success(2))

    cancel()
  })

  it("runtime direct tag", async () => {
    const counter = counterRuntime.atom(Counter)
    const r = AtomRegistry.make()
    const result = r.get(counter)
    assert(AsyncResult.isSuccess(result))
    assert(Effect.isEffect(result.value.get))
  })

  it.each([
    { reconfigure: false, expected: 0 },
    { reconfigure: true, expected: 1 }
  ])(
    "runtime atom with skipInitialRun keeps its seed only when an async runtime resolves unchanged (reconfigure: $reconfigure)",
    async ({ expected, reconfigure }) => {
      const config = Atom.make(0)
      const runtime = Atom.runtime((get) => {
        get(config)
        return Layer.effectDiscard(Effect.sleep(10))
      })
      let runs = 0
      const atom = runtime.atom(Effect.sync(() => ++runs))
      const r = AtomRegistry.make({
        initialValues: [Atom.initialValue(atom, AsyncResult.success(0), { skipInitialRun: true })]
      })
      try {
        r.mount(atom)
        if (reconfigure) {
          r.set(config, 1)
        }
        await vitest.advanceTimersByTimeAsync(10)

        let result = r.get(atom)
        assert(AsyncResult.isSuccess(result))
        assert.strictEqual(result.value, expected)
        assert.strictEqual(runs, expected)

        r.refresh(atom)
        result = r.get(atom)
        assert(AsyncResult.isSuccess(result))
        assert.strictEqual(result.value, expected + 1)
        assert.strictEqual(runs, expected + 1)
      } finally {
        r.dispose()
      }
    }
  )

  it("effect initial", async () => {
    const count = Atom.make(
      Effect.succeed(1).pipe(Effect.delay(100)),
      { initialValue: 0 }
    ).pipe(Atom.keepAlive)
    const r = AtomRegistry.make()
    let result = r.get(count)
    assert(AsyncResult.isSuccess(result))
    assert.strictEqual(result.value, 0)

    await vitest.advanceTimersByTimeAsync(100)
    result = r.get(count)
    assert(AsyncResult.isSuccess(result))
    expect(result.value).toEqual(1)
  })

  for (const form of ["effect", "function", "runtime"] as const) {
    it.effect(`effect initial value survives asynchronous failure (${form})`, () =>
      Effect.gen(function*() {
        const release = yield* Latch.make()
        const fail = release.await.pipe(Effect.andThen(Effect.fail("boom")))
        const count = form === "effect"
          ? Atom.make(fail, { initialValue: 0 })
          : form === "function"
          ? Atom.make(() => fail, { initialValue: 0 })
          : Atom.runtime(Layer.empty).atom(fail, { initialValue: 0 })
        const r = AtomRegistry.make()
        try {
          r.mount(count)
          const waiting = r.get(count)
          assert(AsyncResult.isSuccess(waiting))
          assert.strictEqual(waiting.value, 0)
          assert.strictEqual(waiting.waiting, true)

          yield* release.open
          yield* Effect.yieldNow
          const failure = r.get(count)
          assert(AsyncResult.isFailure(failure))
          assert.strictEqual(failure.waiting, false)
          assert.deepStrictEqual(Cause.findErrorOption(failure.cause), Option.some("boom"))
          assert.deepStrictEqual(AsyncResult.value(failure), Option.some(0))
        } finally {
          r.dispose()
        }
      }))
  }

  it.effect("effect failure retains the latest success published with setSelf", () =>
    Effect.gen(function*() {
      const publish = yield* Latch.make()
      const release = yield* Latch.make()
      const count = Atom.make((get) =>
        Effect.gen(function*() {
          yield* publish.await
          get.setSelf(AsyncResult.success(1))
          yield* release.await
          return yield* Effect.fail("boom")
        }), { initialValue: 0 })
      const r = AtomRegistry.make()
      try {
        r.mount(count)
        assert.deepStrictEqual(AsyncResult.value(r.get(count)), Option.some(0))
        yield* publish.open
        yield* Effect.yieldNow
        assert.deepStrictEqual(AsyncResult.value(r.get(count)), Option.some(1))

        yield* release.open
        yield* Effect.yieldNow
        const failure = r.get(count)
        assert(AsyncResult.isFailure(failure))
        assert.deepStrictEqual(AsyncResult.value(failure), Option.some(1))
      } finally {
        r.dispose()
      }
    }))

  it("effect synchronous failure does not retain an unexposed initial value", () => {
    const count = Atom.make(Effect.fail("boom"), { initialValue: 0 })
    const r = AtomRegistry.make()
    try {
      const failure = r.get(count)
      assert(AsyncResult.isFailure(failure))
      assert.deepStrictEqual(AsyncResult.value(failure), Option.none())
    } finally {
      r.dispose()
    }
  })

  it("effectFn", async () => {
    const count = Atom.fn((n: number) => Effect.succeed(n + 1))
    const r = AtomRegistry.make()
    let result = r.get(count)
    assert(AsyncResult.isInitial(result))
    r.set(count, 1)
    result = r.get(count)
    assert(AsyncResult.isSuccess(result))
    expect(result.value).toEqual(2)
  })

  it("effectFn concurrent", async () => {
    const latches = Arr.empty<Latch.Latch>()
    let done = 0
    const count = Atom.fn((_: number) => {
      const latch = Latch.makeUnsafe()
      latches.push(latch)
      return latch.await.pipe(
        Effect.tap(() => Effect.sync(() => done++))
      )
    }, { concurrent: true })

    const r = AtomRegistry.make()
    r.mount(count)

    let result = r.get(count)
    assert(AsyncResult.isInitial(result))

    r.set(count, 1)
    result = r.get(count)
    assert(AsyncResult.isInitial(result) && result.waiting)

    r.set(count, 1)
    r.set(count, 1)
    assert(AsyncResult.isInitial(result) && result.waiting)
    assert.strictEqual(latches.length, 3)
    assert.strictEqual(done, 0)

    latches.forEach((latch) => latch.openUnsafe())
    await Effect.runPromise(Effect.yieldNow)
    assert.strictEqual(done, 3)

    result = r.get(count)
    assert(AsyncResult.isSuccess(result))
  })

  it("effectFn concurrent preserves synchronous success and failure", () => {
    const count = Atom.fn((n: number) => n === 1 ? Effect.succeed(n + 1) : Effect.fail("fail"), {
      concurrent: true
    })
    const r = AtomRegistry.make()
    r.mount(count)

    r.set(count, 1)
    const success = r.get(count)
    assert(AsyncResult.isSuccess(success))
    assert.strictEqual(success.value, 2)

    r.set(count, 2)
    const failure = r.get(count)
    assert(AsyncResult.isFailure(failure))
    const error = Cause.findErrorOption(failure.cause)
    assert(Option.isSome(error))
    assert.strictEqual(error.value, "fail")
    r.dispose()
  })

  it("effectFn concurrent waits for earlier calls", async () => {
    const latch = Latch.makeUnsafe()
    const count = Atom.fn((n: number) => n === 1 ? latch.await.pipe(Effect.as(n)) : Effect.succeed(n), {
      concurrent: true
    })
    const r = AtomRegistry.make()
    r.mount(count)

    r.set(count, 1)
    assert(AsyncResult.isInitial(r.get(count)))
    r.set(count, 2)
    const waiting = r.get(count)
    assert(AsyncResult.isInitial(waiting) && waiting.waiting)

    latch.openUnsafe()
    await Effect.runPromise(Effect.yieldNow)
    const result = r.get(count)
    assert(AsyncResult.isSuccess(result))
    assert.strictEqual(result.value, 1)
    r.dispose()
  })

  it("effectFn concurrent observes an earlier failure after a later success", async () => {
    const latch = Latch.makeUnsafe()
    const count = Atom.fn((n: number) =>
      n === 1
        ? latch.await.pipe(Effect.flatMap(() => Effect.fail("older failure")))
        : Effect.succeed(n), { concurrent: true })
    const r = AtomRegistry.make()
    r.mount(count)

    r.set(count, 1)
    r.set(count, 2)
    const waiting = r.get(count)
    assert(AsyncResult.isInitial(waiting) && waiting.waiting)

    latch.openUnsafe()
    await Effect.runPromise(Effect.yieldNow)
    const result = r.get(count)
    assert(AsyncResult.isFailure(result))
    const error = Cause.findErrorOption(result.cause)
    assert(Option.isSome(error))
    assert.strictEqual(error.value, "older failure")
    r.dispose()
  })

  it("effectFn initial", async () => {
    const count = Atom.fn((n: number) => Effect.succeed(n + 1), {
      initialValue: 0
    })
    const r = AtomRegistry.make()
    let result = r.get(count)
    assert(AsyncResult.isSuccess(result))
    assert.strictEqual(result.value, 0)
    r.set(count, 1)
    result = r.get(count)
    assert(AsyncResult.isSuccess(result))
    expect(result.value).toEqual(2)
  })

  it("effect mapResult", async () => {
    const count = Atom.fn((n: number) => Effect.succeed(n + 1)).pipe(
      Atom.mapResult((_) => _ + 1)
    )
    const r = AtomRegistry.make()
    let result = r.get(count)
    assert(AsyncResult.isInitial(result))
    r.set(count, 1)
    result = r.get(count)
    assert(AsyncResult.isSuccess(result))
    expect(result.value).toEqual(3)
  })

  it("effect double mapResult", async () => {
    const seed = Atom.make(0)
    const count = Atom.make((get) => Effect.succeed(get(seed) + 1)).pipe(
      Atom.mapResult((_) => _ + 10),
      Atom.mapResult((_) => _ + 100)
    )
    const r = AtomRegistry.make()
    let result = r.get(count)
    assert(AsyncResult.isSuccess(result))
    expect(result.value).toEqual(111)
    r.set(seed, 1)
    result = r.get(count)
    assert(AsyncResult.isSuccess(result))
    expect(result.value).toEqual(112)
  })

  it("effect double mapResult refresh", async () => {
    let rebuilds = 0
    const count = Atom.make(() => {
      rebuilds++
      return Effect.succeed(1)
    }).pipe(
      Atom.mapResult((_) => _ + 10),
      Atom.mapResult((_) => _ + 100)
    )
    const r = AtomRegistry.make()
    let result = r.get(count)
    assert(AsyncResult.isSuccess(result))
    expect(result.value).toEqual(111)
    expect(rebuilds).toEqual(1)
    r.refresh(count)
    result = r.get(count)
    assert(AsyncResult.isSuccess(result))
    expect(result.value).toEqual(111)
    expect(rebuilds).toEqual(2)
  })

  it("keeps parent child links when a parent is read more than once", () => {
    const flag = Atom.make(true)
    const base = Atom.make(0)
    const derived = Atom.make((get) => {
      const value = get(base)
      if (get(flag)) {
        get(base)
      }
      return value
    })
    const registry = AtomRegistry.make()
    const unsubscribe = registry.subscribe(derived, () => {
    }, { immediate: true })
    const nodes = registry.getNodes()
    const baseNode = nodes.get(base)
    const derivedNode = nodes.get(derived)

    assert(baseNode !== undefined)
    assert(derivedNode !== undefined)
    assert.strictEqual(baseNode.children.has(derivedNode), true)
    assert.strictEqual(derivedNode.parents.has(baseNode), true)

    registry.set(flag, false)

    assert.strictEqual(baseNode.children.has(derivedNode), true)
    assert.strictEqual(derivedNode.parents.has(baseNode), true)

    registry.set(base, 1)

    assert.strictEqual(registry.get(derived), 1)
    unsubscribe()
  })

  it("a stale dependent keeps its dependency", async () => {
    const a = Atom.make(0)
    let builds = 0
    const dependency = Atom.make(() => ++builds)
    const dependent = Atom.make((get) => get(a) + get(dependency)).pipe(Atom.keepAlive)
    const r = AtomRegistry.make()
    r.get(dependent)
    r.set(a, 1)
    await Effect.runPromise(Effect.yieldNow)
    assert.strictEqual(r.get(dependent), 2)
  })

  it("a listener added to a stale node hears changes through a parent that rebuilds to the same value", () => {
    const a = Atom.make(0)
    const b = Atom.make(0)
    const middle = Atom.make((get) => get(a) > 0 ? 1 : 0)
    const derived = Atom.make((get) => get(middle) + get(b))
    const r = AtomRegistry.make()
    r.get(derived)
    r.set(b, 5)
    r.set(a, 1)
    const seen: Array<number> = []
    r.subscribe(derived, (value) => seen.push(value))
    r.set(a, 0)
    assert.deepStrictEqual(seen, [5])
  })

  it("a listener added to an uninitialized derived atom hears its changes", () => {
    const count = Atom.make(0)
    const doubled = Atom.map(count, (n) => n * 2)
    const r = AtomRegistry.make()
    const seen: Array<number> = []
    r.subscribe(doubled, (value) => seen.push(value))
    r.set(count, 1)
    r.set(count, 2)
    assert.deepStrictEqual(seen, [2, 4])
  })

  it("subscribing reports a dependency's finalizer error from a failed build", () => {
    let failing = true
    const parent = Atom.make((get) => {
      if (!failing) return 0
      get.addFinalizer(() => {
        throw new Error("cleanup failed")
      })
      throw new Error("build failed")
    })
    const derived = Atom.map(parent, (n) => n)
    const r = AtomRegistry.make()
    assert.throws(() => r.get(derived), /build failed/)
    failing = false
    assert.throws(() => r.subscribe(derived, () => {}), /cleanup failed/)
  })

  it("recovers an observed dependent when its parent first succeeds after throwing", () => {
    let failing = true
    const parent = Atom.make(() => {
      if (failing) throw new Error("build failed")
      return 2
    })
    const dependent = Atom.make((get) => get(parent) + 1)
    const r = AtomRegistry.make()
    const seen: Array<number> = []
    r.subscribe(dependent, (value) => seen.push(value))

    try {
      assert.throws(() => r.get(dependent), /build failed/)
      assert.deepStrictEqual(seen, [])

      failing = false
      assert.strictEqual(r.get(parent), 2)
      assert.deepStrictEqual(seen, [3])
    } finally {
      r.dispose()
    }
  })

  it("recovers an observed derived atom after its build throws", () => {
    const source = Atom.make(0)
    const derived = Atom.make((get) => {
      const value = get(source)
      if (value === 1) throw new Error("build failed")
      return value
    })
    const r = AtomRegistry.make()
    const sourceValues: Array<number> = []
    const derivedValues: Array<number> = []

    assert.strictEqual(r.get(derived), 0)
    r.subscribe(source, (value) => sourceValues.push(value))
    r.subscribe(derived, (value) => derivedValues.push(value))

    assert.throws(() => r.set(source, 1), /build failed/)
    assert.deepStrictEqual(sourceValues, [1])

    r.set(source, 2)
    assert.deepStrictEqual(derivedValues, [2])
  })

  it("a build superseded while it runs is released", () => {
    const p = Atom.make(0)
    let finalized = 0
    const n = Atom.make((get) => {
      get.addFinalizer(() => finalized++)
      if (get(p) === 0) get.set(p, 1)
      return get(p)
    })
    const r = AtomRegistry.make()
    r.subscribe(n, () => {})
    r.get(n)
    assert.strictEqual(finalized, 1)
  })

  it("refresh derived before mount resolves base effect", async () => {
    const baseAtom = Atom.make(
      Effect.succeed("value").pipe(Effect.delay(100))
    )
    const derivedAtom = Atom.writable(
      (get) => get(baseAtom),
      () => {
      },
      (refresh) => refresh(baseAtom)
    )
    const registry = AtomRegistry.make()

    registry.refresh(derivedAtom)
    const unmount = registry.mount(derivedAtom)

    let result = registry.get(derivedAtom)
    assert(result.waiting)

    await vitest.advanceTimersByTimeAsync(100)

    result = registry.get(derivedAtom)
    assert(AsyncResult.isSuccess(result))
    expect(result.value).toEqual("value")

    unmount()
  })

  it("scopedFn", async () => {
    let finalized = 0
    const count = Atom.fn((n: number) =>
      Effect.succeed(n + 1).pipe(
        Effect.tap(
          Effect.addFinalizer(() =>
            Effect.sync(() => {
              finalized++
            })
          )
        )
      )
    ).pipe(Atom.keepAlive)
    const r = AtomRegistry.make()
    let result = r.get(count)
    assert(AsyncResult.isInitial(result))

    await new Promise((resolve) => resolve(null))
    expect(finalized).toEqual(0)

    r.set(count, 1)
    result = r.get(count)
    assert(AsyncResult.isSuccess(result))
    expect(result.value).toEqual(2)

    r.set(count, 2)
    await new Promise((resolve) => resolve(null))
    expect(finalized).toEqual(1)
  })

  it("disposed lifetime apis are no-ops", () => {
    let context: Atom.AtomContext | undefined
    const state = Atom.make(0).pipe(Atom.keepAlive)
    const option = Atom.make<Option.Option<number>>(Option.some(1)).pipe(Atom.keepAlive)
    const result = Atom.make<AsyncResult.AsyncResult<number, never>>(AsyncResult.success(1)).pipe(Atom.keepAlive)
    const atom = Atom.make((get) => {
      context = get
      return get(state)
    }).pipe(Atom.keepAlive)
    const registry = AtomRegistry.make()

    expect(registry.get(atom)).toEqual(0)
    registry.refresh(atom)

    assert(context !== undefined)
    const disposed = context

    expect(() =>
      disposed.addFinalizer(() => {
      })
    ).not.toThrow()
    expect(disposed(state)).toEqual(0)
    expect(disposed.get(state)).toEqual(0)
    expect(disposed.once(state)).toEqual(0)
    expect(disposed.self<number>()).toEqual(Option.none())
    expect(() => disposed.result(result)).not.toThrow()
    expect(() => disposed.resultOnce(result)).not.toThrow()
    expect(() => disposed.setResult(result, AsyncResult.success(2))).not.toThrow()
    expect(() => disposed.some(option)).not.toThrow()
    expect(() => disposed.someOnce(option)).not.toThrow()
    expect(() => disposed.refresh(state)).not.toThrow()
    expect(() => disposed.refreshSelf()).not.toThrow()
    expect(() => disposed.mount(state)).not.toThrow()
    expect(() =>
      disposed.subscribe(state, () => {
      })
    ).not.toThrow()
    expect(() => disposed.setSelf(1)).not.toThrow()
    expect(() => disposed.set(state, 1)).not.toThrow()
    expect(registry.get(state)).toEqual(0)
    expect(() => disposed.stream(state)).not.toThrow()
    expect(() => disposed.streamResult(result)).not.toThrow()
  })

  it("disposed lifetime ignores async updates", async () => {
    const count = Atom.make(
      Effect.succeed(1).pipe(Effect.delay(100)),
      {
        initialValue: 0,
        uninterruptible: true
      }
    )
    const registry = AtomRegistry.make()
    const unmount = registry.mount(count)

    const initial = registry.get(count)
    assert(AsyncResult.isSuccess(initial))
    expect(initial.waiting).toEqual(true)
    expect(initial.value).toEqual(0)

    unmount()
    await vitest.advanceTimersByTimeAsync(100)
    await Effect.runPromise(Effect.yieldNow)

    const next = registry.get(count)
    assert(AsyncResult.isSuccess(next))
    expect(next.waiting).toEqual(true)
  })

  it.effect("stream", () =>
    Effect.gen(function*() {
      vitest.useRealTimers()

      const services = yield* Effect.context<never>()
      const count = Atom.make(
        Stream.range(0, 2).pipe(
          Stream.tap(() => AtomRegistry.AtomRegistry),
          Stream.tap((_) => Effect.sleep(50)),
          Stream.provideContext(services)
        )
      )
      const r = AtomRegistry.make()
      const unmount = r.mount(count)
      let result = r.get(count)
      assert(result.waiting)
      assert(AsyncResult.isInitial(result))

      yield* TestClock.adjust(50)
      result = r.get(count)
      assert(result.waiting)
      assert(AsyncResult.isSuccess(result))
      assert.deepEqual(result.value, 0)

      yield* TestClock.adjust(50)
      result = r.get(count)
      assert(result.waiting)
      assert(AsyncResult.isSuccess(result))
      assert.deepEqual(result.value, 1)

      yield* TestClock.adjust(50)
      result = r.get(count)
      assert(!result.waiting)
      assert(AsyncResult.isSuccess(result))
      assert.deepEqual(result.value, 2)

      unmount()
      yield* TestClock.adjust(50)
      result = r.get(count)
      assert(result.waiting)
      assert(AsyncResult.isInitial(result))
    }))

  it("stream initial", async () => {
    const count = Atom.make(
      Stream.range(1, 2).pipe(
        Stream.tap(() => Effect.sleep(50))
      ),
      { initialValue: 0 }
    )
    const r = AtomRegistry.make()
    const unmount = r.mount(count)
    let result = r.get(count)
    assert(result.waiting)
    assert(AsyncResult.isSuccess(result))
    assert.strictEqual(result.value, 0)

    await vitest.advanceTimersByTimeAsync(50)
    result = r.get(count)
    assert(result.waiting)
    assert(AsyncResult.isSuccess(result))
    assert.deepEqual(result.value, 1)

    unmount()
    await new Promise((resolve) => resolve(null))
    result = r.get(count)
    assert(result.waiting)
    assert(AsyncResult.isSuccess(result))
  })

  it("streamFn", async () => {
    const count = Atom.fn((start: number) =>
      Stream.range(start, start + 1).pipe(
        Stream.tap(() => Effect.sleep(50))
      )
    )
    const r = AtomRegistry.make()
    const unmount = r.mount(count)
    let result = r.get(count)
    assert.strictEqual(result._tag, "Initial")

    await vitest.advanceTimersByTimeAsync(50)
    result = r.get(count)
    assert.strictEqual(result._tag, "Initial")

    r.set(count, 1)
    result = r.get(count)
    assert(result.waiting)
    assert.strictEqual(result._tag, "Initial")

    await vitest.advanceTimersByTimeAsync(50)
    result = r.get(count)
    assert(result.waiting)
    assert(AsyncResult.isSuccess(result))
    assert.deepEqual(result.value, 1)

    await vitest.advanceTimersByTimeAsync(50)
    result = r.get(count)
    assert(!result.waiting)
    assert(AsyncResult.isSuccess(result))
    assert.deepEqual(result.value, 2)

    r.set(count, 5)
    result = r.get(count)
    assert(result.waiting)
    assert(AsyncResult.isSuccess(result))
    assert.deepEqual(result.value, 2)

    await vitest.advanceTimersByTimeAsync(50)
    result = r.get(count)
    assert(result.waiting)
    assert(AsyncResult.isSuccess(result))
    assert.deepEqual(result.value, 5)

    await vitest.advanceTimersByTimeAsync(50)
    result = r.get(count)
    assert(!result.waiting)
    assert(AsyncResult.isSuccess(result))
    assert.deepEqual(result.value, 6)

    unmount()
    await Effect.runPromise(Effect.yieldNow)
    result = r.get(count)
    assert(AsyncResult.isInitial(result))
  })

  it("pull", async () => {
    const count = Atom.pull(
      Stream.range(0, 1, 1).pipe(
        Stream.tap(() => Effect.sleep(50))
      )
    )
    const r = AtomRegistry.make()
    const unmount = r.mount(count)

    let result = r.get(count)
    assert(result.waiting)
    assert(Option.isNone(AsyncResult.value(result)))

    await vitest.advanceTimersByTimeAsync(50)
    result = r.get(count)
    assert(!result.waiting)
    assert(AsyncResult.isSuccess(result))
    assert.deepEqual(result.value, { done: false, items: [0] })

    r.set(count, void 0)
    result = r.get(count)
    assert(result.waiting)
    assert.deepEqual(AsyncResult.value(result), Option.some({ done: false, items: [0] }))

    await vitest.advanceTimersByTimeAsync(50)
    result = r.get(count)
    assert(!result.waiting)
    assert(AsyncResult.isSuccess(result))
    assert.deepEqual(result.value, { done: false, items: [0, 1] })

    r.set(count, void 0)
    result = r.get(count)
    assert(!result.waiting)
    assert(AsyncResult.isSuccess(result))
    assert.deepEqual(result.value, { done: true, items: [0, 1] })

    r.refresh(count)
    result = r.get(count)
    assert(result.waiting)
    assert.deepEqual(AsyncResult.value(result), Option.some({ done: true, items: [0, 1] }))

    await vitest.advanceTimersByTimeAsync(50)
    result = r.get(count)
    assert(!result.waiting)
    assert(AsyncResult.isSuccess(result))
    assert.deepEqual(result.value, { done: false, items: [0] })

    unmount()
    await Effect.runPromise(Effect.yieldNow)
    result = r.get(count)
    assert(result.waiting)
    assert(Option.isNone(AsyncResult.value(result)))
  })

  it("pull runtime", async () => {
    const count = counterRuntime.pull(
      Counter.use((_) => _.get).pipe(
        Effect.map((_) => Stream.range(_, 2, 1)),
        Stream.unwrap,
        Stream.tap(() => Effect.sleep(50))
      )
    )
    const r = AtomRegistry.make()
    const unmount = r.mount(count)

    let result = r.get(count)
    assert(result.waiting)
    assert(Option.isNone(AsyncResult.value(result)))

    await vitest.advanceTimersByTimeAsync(50)
    result = r.get(count)
    assert(!result.waiting)
    assert(AsyncResult.isSuccess(result))
    assert.deepEqual(result.value, { done: false, items: [1] })

    r.set(count, void 0)
    result = r.get(count)
    assert(result.waiting)
    assert.deepEqual(AsyncResult.value(result), Option.some({ done: false, items: [1] }))

    await vitest.advanceTimersByTimeAsync(50)
    result = r.get(count)
    assert(!result.waiting)
    assert(AsyncResult.isSuccess(result))
    assert.deepEqual(result.value, { done: false, items: [1, 2] })

    r.set(count, void 0)
    result = r.get(count)
    assert(!result.waiting)
    assert(AsyncResult.isSuccess(result))
    assert.deepEqual(result.value, { done: true, items: [1, 2] })

    r.refresh(count)
    result = r.get(count)
    assert(result.waiting)
    assert.deepEqual(AsyncResult.value(result), Option.some({ done: true, items: [1, 2] }))

    await vitest.advanceTimersByTimeAsync(50)
    result = r.get(count)
    assert(!result.waiting)
    assert(AsyncResult.isSuccess(result))
    assert.deepEqual(result.value, { done: false, items: [1] })

    unmount()
    await Effect.runPromise(Effect.yieldNow)
    result = r.get(count)
    assert(result.waiting)
    assert(Option.isNone(AsyncResult.value(result)))
  })

  it("pull refreshable", async () => {
    const count = Atom.pull(() =>
      Stream.range(1, 2, 1).pipe(
        Stream.tap(() => Effect.sleep(50))
      )
    )
    const r = AtomRegistry.make()
    const unmount = r.mount(count)

    let result = r.get(count)
    assert(result.waiting)
    assert(AsyncResult.isInitial(result))

    await vitest.advanceTimersByTimeAsync(50)
    result = r.get(count)
    assert(!result.waiting)
    assert(AsyncResult.isSuccess(result))
    assert.deepEqual(result.value, { done: false, items: [1] })

    unmount()
    await Effect.runPromise(Effect.yieldNow)
    result = r.get(count)
    assert(result.waiting)
  })

  it("family", async () => {
    const r = AtomRegistry.make()

    const count = Atom.family((n: number) => Atom.make(n))
    const hash = Hash.hash(count(1))
    assert.strictEqual(count(1), count(1))
    r.set(count(1), 2)
    assert.strictEqual(r.get(count(1)), 2)

    const countKeep = Atom.family((n: number) => Atom.make(n).pipe(Atom.keepAlive))
    assert.strictEqual(countKeep(1), countKeep(1))
    r.get(countKeep(1))
    const hashKeep = Hash.hash(countKeep(1))

    if (global.gc) {
      vitest.useRealTimers()
      await new Promise((resolve) => setTimeout(resolve, 0))
      global.gc()
      assert.notEqual(hash, Hash.hash(count(1)))
      assert.strictEqual(hashKeep, Hash.hash(countKeep(1)))
    }
  })

  it.skipIf(process.versions.bun !== undefined || process.versions.deno !== undefined)(
    "family keeps a replacement atom when the collected atom is finalized late",
    async () => {
      vitest.useRealTimers()
      const gc = await getGc()
      const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
      const family = Atom.family((_: string) => Atom.make(0))

      const older = new WeakRef(family("a"))
      for (let i = 0; i < 8 && older.deref() !== undefined; i++) {
        await tick()
        gc()
      }
      assert.isUndefined(older.deref())

      // Replace the collected atom before its finalizer gets a turn.
      const current = family("a")
      await Effect.runPromise(collectGarbage)

      assert.strictEqual(family("a"), current)
    }
  )

  it("label", async () => {
    expect(
      Atom.make(0).pipe(Atom.withLabel("counter")).label![1]
    ).toMatch(/Atom.test.ts:\d+:\d+/)
  })

  it("batching", async () => {
    const r = AtomRegistry.make()
    const state = Atom.make(1).pipe(Atom.keepAlive)
    const state2 = Atom.make("a").pipe(Atom.keepAlive)
    let count = 0
    const derived = Atom.readable((get) => {
      count++
      return get(state) + get(state2)
    })
    expect(r.get(derived)).toEqual("1a")
    expect(count).toEqual(1)
    Atom.batch(() => {
      r.set(state, 2)
      r.set(state2, "b")
    })
    expect(count).toEqual(2)
    expect(r.get(derived)).toEqual("2b")
  })

  it.effect("retains method-form dependencies added during a batch rebuild", () =>
    Effect.gen(function*() {
      const registry = AtomRegistry.make()
      const source = Atom.make(Option.none<string>())
      const gate = yield* Latch.make()
      const asyncAtom = Atom.make((get) =>
        Effect.gen(function*() {
          const value = get(source)
          if (Option.isNone(value)) {
            return yield* Effect.fail("SourceIsNone" as const)
          }
          yield* gate.await
          return `computed-${value.value}`
        })
      )
      const derived = Atom.make((get): unknown => {
        const value = get.get(source)
        if (Option.isNone(value)) {
          return "empty"
        }
        return get.get(asyncAtom)
      })

      registry.subscribe(derived, () => {}, { immediate: true })
      registry.subscribe(asyncAtom, () => {}, { immediate: true })

      Atom.batch(() => registry.set(source, Option.some("a")))

      yield* gate.open
      yield* Effect.yieldNow

      const result = registry.get(derived) as AsyncResult.AsyncResult<string, "SourceIsNone">
      assert(AsyncResult.isSuccess(result))
      assert.strictEqual(result.value, "computed-a")
    }))

  it("rebuilds an atom invalidated during its own batch rebuild", () => {
    const registry = AtomRegistry.make()
    const source = Atom.make(0)
    const enabled = Atom.make(false)
    const updateSource = Atom.make((get) => {
      get.set(source, 1)
    })
    const derived = Atom.make((get) => {
      const value = get(source)
      if (get(enabled)) {
        get(updateSource)
      }
      return value
    })

    registry.subscribe(derived, () => {}, { immediate: true })

    Atom.batch(() => registry.set(enabled, true))

    assert.strictEqual(registry.get(derived), 1)
  })

  it("nested batch", async () => {
    const r = AtomRegistry.make()
    const state = Atom.make(1).pipe(Atom.keepAlive)
    const state2 = Atom.make("a").pipe(Atom.keepAlive)
    let count = 0
    const derived = Atom.readable((get) => {
      count++
      return get(state) + get(state2)
    })
    expect(r.get(derived)).toEqual("1a")
    expect(count).toEqual(1)
    Atom.batch(() => {
      r.set(state, 2)
      Atom.batch(() => {
        r.set(state2, "b")
      })
    })
    expect(count).toEqual(2)
    expect(r.get(derived)).toEqual("2b")
  })

  it("read correct updated state in batch", async () => {
    const r = AtomRegistry.make()
    const state = Atom.make(1).pipe(Atom.keepAlive)
    const state2 = Atom.make("a").pipe(Atom.keepAlive)
    let count = 0
    const derived = Atom.readable((get) => {
      count++
      return get(state) + get(state2)
    })
    expect(r.get(derived)).toEqual("1a")
    expect(count).toEqual(1)
    Atom.batch(() => {
      r.set(state, 2)
      expect(r.get(derived)).toEqual("2a")
      r.set(state2, "b")
    })
    expect(count).toEqual(3)
    expect(r.get(derived)).toEqual("2b")
    expect(count).toEqual(3)
  })

  it("notifies listeners after batch commit", async () => {
    const r = AtomRegistry.make()
    const state = Atom.make(1).pipe(Atom.keepAlive)
    const state2 = Atom.make("a").pipe(Atom.keepAlive)
    let count = 0
    const derived = Atom.readable((get) => {
      return get(state) + get(state2)
    })
    r.subscribe(derived, () => {
      count++
    })
    Atom.batch(() => {
      r.get(derived)
      r.set(state, 2)
      r.get(derived)
      r.set(state2, "b")
    })
    expect(count).toEqual(1)
    expect(r.get(derived)).toEqual("2b")
  })

  it.each([
    { existingListener: false, expected: [0] },
    { existingListener: true, expected: [0, 0] }
  ])("delivers a batched value to a late subscriber (existing listener: $existingListener)", ({
    existingListener,
    expected
  }) => {
    const r = AtomRegistry.make()
    const state = Atom.make(existingListener ? 1 : 0)
    const seen: Array<number> = []

    Atom.batch(() => {
      if (existingListener) {
        r.subscribe(state, () => {})
        r.set(state, 0)
      } else {
        r.get(state)
      }
      r.subscribe(state, (value) => seen.push(value), { immediate: true })
    })

    assert.deepStrictEqual(seen, expected)
    r.dispose()
  })

  it("initialValues skipInitialRun keeps an effect seed until a reactivity key is invalidated", () => {
    let runs = 0
    const atom = Atom.make(Effect.sync(() => ++runs)).pipe(Atom.withReactivity(["count"]))
    const invalidate = counterRuntime.fn(() => Effect.void, { reactivityKeys: ["count"] })
    const r = AtomRegistry.make({
      initialValues: [Atom.initialValue(atom, AsyncResult.success(0), { skipInitialRun: true })]
    })
    try {
      r.mount(atom)
      let result = r.get(atom)
      assert(AsyncResult.isSuccess(result))
      assert.strictEqual(result.value, 0)
      assert.strictEqual(runs, 0)

      r.set(invalidate, void 0)
      result = r.get(atom)
      assert(AsyncResult.isSuccess(result))
      assert.strictEqual(result.value, 1)
      assert.strictEqual(runs, 1)
    } finally {
      r.dispose()
    }
  })

  it("does not queue an initialValues notification without listeners", () => {
    const state = Atom.make(0)
    const seen: Array<number> = []

    Atom.batch(() => {
      const r = AtomRegistry.make({ initialValues: [Atom.initialValue(state, 10)] })
      r.subscribe(state, (value) => seen.push(value), { immediate: true })
    })

    assert.deepStrictEqual(seen, [10])
  })

  it("runs Atom.fn writes from batch commit listeners", () => {
    const registry = AtomRegistry.make()
    const source = Atom.make(0)
    const write = Atom.fn((value: number, get) => Effect.sync(() => get.registry.set(source, value)))
    const seen: Array<number> = []
    registry.mount(write)
    registry.subscribe(source, (value) => seen.push(value))
    registry.subscribe(source, (value) => {
      if (value < 3) registry.set(write, value + 1)
    })

    Atom.batch(() => registry.set(source, 1))

    assert.deepStrictEqual(seen, [1, 2, 3])
    registry.dispose()
  })

  it("initialValues", async () => {
    const state = Atom.make(0)
    const r = AtomRegistry.make({
      initialValues: [
        Atom.initialValue(state, 10)
      ]
    })
    expect(r.get(state)).toEqual(10)
    await Effect.runPromise(Effect.yieldNow)
    expect(r.get(state)).toEqual(0)
  })

  it("map with initialValue still rerenders when source changes", () => {
    const state = Atom.make(0).pipe(Atom.keepAlive)
    const mapped = state.pipe(
      Atom.map((n) => n + 1),
      Atom.keepAlive
    )
    const r = AtomRegistry.make({
      initialValues: [
        Atom.initialValue(mapped, 10)
      ]
    })
    r.mount(mapped)

    assert.strictEqual(r.get(mapped), 10)

    r.set(state, 1)

    assert.strictEqual(r.get(mapped), 2)
  })

  it("idleTTL", async () => {
    const state = Atom.make(0)
    const state2 = Atom.make(0).pipe(
      Atom.setIdleTTL(10000)
    )
    const state3 = Atom.make(0).pipe(
      Atom.setIdleTTL(3000)
    )
    const r = AtomRegistry.make({ defaultIdleTTL: 2000 })
    r.set(state, 10)
    r.set(state2, 10)
    r.set(state3, 10)
    expect(r.get(state)).toEqual(10)
    expect(r.get(state2)).toEqual(10)
    expect(r.get(state3)).toEqual(10)
    await new Promise((resolve) => resolve(null))
    expect(r.get(state)).toEqual(10)
    expect(r.get(state2)).toEqual(10)
    expect(r.get(state3)).toEqual(10)

    await new Promise((resolve) => resolve(null))
    await vitest.advanceTimersByTimeAsync(10000)
    expect(r.get(state)).toEqual(0)
    expect(r.get(state2)).toEqual(10)
    expect(r.get(state3)).toEqual(0)

    await new Promise((resolve) => resolve(null))
    await vitest.advanceTimersByTimeAsync(20000)
    expect(r.get(state)).toEqual(0)
    expect(r.get(state2)).toEqual(0)
    expect(r.get(state3)).toEqual(0)
  })

  it("releases a stream-backed atom consumed through a derived atom after idleTTL", async () => {
    let released = false
    const source = Stream.callback<number>((queue) =>
      Effect.acquireRelease(
        Effect.sync(() => setInterval(() => Queue.offerUnsafe(queue, Date.now()), 100)),
        (handle) =>
          Effect.sync(() => {
            released = true
            clearInterval(handle)
          })
      ).pipe(Effect.asVoid)
    )
    const feed = Atom.make(() => source)
    const derived = Atom.make((get) => AsyncResult.isSuccess(get(feed)) ? "ready" : "initial")
    const r = AtomRegistry.make({ defaultIdleTTL: 400 })

    try {
      const unsubscribe = r.subscribe(derived, () => {}, { immediate: true })
      await vitest.advanceTimersByTimeAsync(600)
      unsubscribe()

      await vitest.advanceTimersByTimeAsync(2000)

      expect(released).toEqual(true)
    } finally {
      r.dispose()
    }
  })

  it("idleTTL fn", async () => {
    const fn = Atom.fn((n: number) => Effect.succeed(n + 1)).pipe(
      Atom.setIdleTTL(0)
    )
    const r = AtomRegistry.make({ defaultIdleTTL: 2000 })

    let result = r.get(fn)
    assert(AsyncResult.isInitial(result))

    r.set(fn, 1)
    result = r.get(fn)
    assert(AsyncResult.isSuccess(result))
    expect(result.value).toEqual(2)

    await Effect.runPromise(Effect.yieldNow)

    result = r.get(fn)
    assert(AsyncResult.isInitial(result))
  })

  it("idleTTL fnSync", async () => {
    const fn = Atom.fnSync((n: number) => n + 1).pipe(
      Atom.setIdleTTL(0)
    )
    const r = AtomRegistry.make({ defaultIdleTTL: 2000 })

    let result = r.get(fn)
    assert(Option.isNone(result))

    r.set(fn, 1)
    result = r.get(fn)
    assert(Option.isSome(result))
    expect(result.value).toEqual(2)

    await Effect.runPromise(Effect.yieldNow)

    result = r.get(fn)
    assert(Option.isNone(result))
  })

  it("fn", async () => {
    const count = Atom.fnSync((n: number) => n).pipe(Atom.keepAlive)
    const r = AtomRegistry.make()
    assert.deepEqual(r.get(count), Option.none())

    r.set(count, 1)
    assert.deepEqual(r.get(count), Option.some(1))
  })

  it("fn initial", async () => {
    const count = Atom.fnSync((n: number) => n, { initialValue: 0 })
    const r = AtomRegistry.make()
    assert.deepEqual(r.get(count), 0)

    r.set(count, 1)
    assert.deepEqual(r.get(count), 1)
  })

  it("withFallback", async () => {
    const count = Atom.make(() =>
      Effect.succeed(1).pipe(
        Effect.delay(100)
      )
    ).pipe(
      Atom.withFallback(Atom.make(() => Effect.succeed(0))),
      Atom.keepAlive
    )
    const r = AtomRegistry.make()
    assert.deepEqual(r.get(count), AsyncResult.waiting(AsyncResult.success(0)))

    await vitest.advanceTimersByTimeAsync(100)
    assert.deepEqual(r.get(count), AsyncResult.success(1))
  })

  it("withFallback forwards writes to the primary atom", () => {
    const primary = Atom.make<AsyncResult.AsyncResult<number>>(AsyncResult.success(1))
    const fallback = AsyncResult.success(2)
    const atom = Atom.withFallback(primary, Atom.make(fallback))
    const r = AtomRegistry.make()

    r.set(atom, AsyncResult.initial())

    assert.deepEqual([r.get(primary), r.get(atom)], [
      AsyncResult.initial(),
      AsyncResult.waiting(fallback)
    ])
  })

  it("failure with previousSuccess", async () => {
    const count = Atom.fn((i: number) => i === 1 ? Effect.fail("fail") : Effect.succeed(i))
    const r = AtomRegistry.make()

    let result = r.get(count)
    assert(AsyncResult.isInitial(result))

    r.set(count, 0)
    result = r.get(count)
    assert(AsyncResult.isSuccess(result))
    assert.strictEqual(result.value, 0)

    r.set(count, 1)
    result = r.get(count)
    assert(AsyncResult.isFailure(result))
    const error = Cause.findErrorOption(result.cause)
    assert(Option.isSome(error))
    assert.strictEqual(error.value, "fail")

    const value = AsyncResult.value(result)
    assert(Option.isSome(value))
    assert.strictEqual(value.value, 0)
  })

  it("read non-object", () => {
    const bool = Atom.make(() => true)
    const r = AtomRegistry.make()
    assert.strictEqual(r.get(bool), true)
  })

  it("get.stream", async () => {
    const count = Atom.make(0)
    const multiplied = Atom.make((get) => get.stream(count).pipe(Stream.map((_) => _ * 2)))

    const r = AtomRegistry.make()
    const cancel = r.mount(multiplied)

    assert.strictEqual(r.get(count), 0)
    assert.deepStrictEqual(r.get(multiplied), AsyncResult.success(0, { waiting: true }))

    r.set(count, 1)
    await Effect.runPromise(Effect.yieldNow)
    assert.deepStrictEqual(r.get(multiplied), AsyncResult.success(2, { waiting: true }))

    cancel()
  })

  it("get.streamResult", async () => {
    const count = Atom.make(0)
    const multiplied = Atom.make((get) => get.stream(count).pipe(Stream.map((_) => _ * 2)))
    const plusOne = Atom.make((get) => get.streamResult(multiplied).pipe(Stream.map((_) => _ + 1)))

    const r = AtomRegistry.make()
    const cancel = r.mount(plusOne)

    assert.strictEqual(r.get(count), 0)
    assert.deepStrictEqual(r.get(plusOne), AsyncResult.success(1, { waiting: true }))

    r.set(count, 1)
    await Effect.runPromise(Effect.yieldNow)
    await Effect.runPromise(Effect.yieldNow)
    assert.deepStrictEqual(r.get(plusOne), AsyncResult.success(3, { waiting: true }))

    cancel()
  })

  it("stream failure keeps previousSuccess", async () => {
    const atom = Atom.make(() => Stream.succeed(1).pipe(Stream.concat(Stream.fail("boom"))))
    const r = AtomRegistry.make()
    const cancel = r.mount(atom)

    await new Promise((resolve) => resolve(null))
    const afterFail = r.get(atom)
    assert(AsyncResult.isFailure(afterFail))
    const prev = AsyncResult.value(afterFail)
    assert(Option.isSome(prev))
    assert.strictEqual(prev.value, 1)

    cancel()
  })

  it("stream empty produces NoSuchElementError", async () => {
    const atom = Atom.make(Stream.empty) satisfies Atom.Atom<
      AsyncResult.AsyncResult<never, Cause.NoSuchElementError>
    >
    const r = AtomRegistry.make()
    const cancel = r.mount(atom)

    await vitest.advanceTimersByTimeAsync(0)
    const result = r.get(atom)
    assert(AsyncResult.isFailure(result))
    assert.deepStrictEqual(
      AsyncResult.error(result),
      Option.some(new Cause.NoSuchElementError())
    )

    cancel()
  })

  it("Option is not an Effect", async () => {
    const atom = Atom.make(Option.none<string>())
    const r = AtomRegistry.make()
    assert.deepStrictEqual(r.get(atom), Option.none())
  })

  it("Either is not an Effect", async () => {
    const atom = Atom.make(Result.succeed(123))
    const r = AtomRegistry.make()
    assert.deepStrictEqual(r.get(atom), Result.succeed(123))
  })

  it("SubscriptionRef", async () => {
    vitest.useRealTimers()
    const ref = SubscriptionRef.make(123).pipe(Effect.runSync)
    const atom = Atom.subscriptionRef(ref)
    const r = AtomRegistry.make()
    assert.deepStrictEqual(r.get(atom), 123)
    await Effect.runPromise(SubscriptionRef.update(ref, (a) => a + 1))
    assert.deepStrictEqual(r.get(atom), 124)
  })

  it("SubscriptionRef", async () => {
    vitest.useRealTimers()
    const ref = SubscriptionRef.make(0).pipe(Effect.runSync)
    const atom = Atom.subscriptionRef(ref)
    const r = AtomRegistry.make()
    const unmount = r.mount(atom)
    assert.deepStrictEqual(r.get(atom), 0)
    r.set(atom, 1)
    await new Promise((resolve) => resolve(null))
    assert.deepStrictEqual(r.get(atom), 1)
    unmount()
  })

  it("SubscriptionRef/effect", async () => {
    const atom = Atom.subscriptionRef(SubscriptionRef.make(0))
    const r = AtomRegistry.make()
    const unmount = r.mount(atom)
    assert.deepStrictEqual(r.get(atom), AsyncResult.success(0, { waiting: true }))
    r.set(atom, 1)
    await new Promise((resolve) => resolve(null))
    assert.deepStrictEqual(r.get(atom), AsyncResult.success(1, { waiting: true }))
    unmount()
  })

  it("SubscriptionRef/runtime", async () => {
    const atom = counterRuntime.subscriptionRef(SubscriptionRef.make(0))
    const r = AtomRegistry.make()
    const unmount = r.mount(atom)
    assert.deepStrictEqual(r.get(atom), AsyncResult.success(0, { waiting: true }))
    r.set(atom, 1)
    await new Promise((resolve) => resolve(null))
    assert.deepStrictEqual(r.get(atom), AsyncResult.success(1, { waiting: true }))
    unmount()
  })

  it("SubscriptionRef/runtime/scoped", async () => {
    let finalized = false
    const atom = counterRuntime.subscriptionRef(
      Effect.gen(function*() {
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            finalized = true
          })
        )
        return yield* SubscriptionRef.make(0)
      })
    )
    const r = AtomRegistry.make()
    const unmount = r.mount(atom)
    assert.deepStrictEqual(r.get(atom), AsyncResult.success(0, { waiting: true }))
    r.set(atom, 1)
    await new Promise((resolve) => resolve(null))
    assert.deepStrictEqual(r.get(atom), AsyncResult.success(1, { waiting: true }))
    assert.strictEqual(finalized, false)
    unmount()
    await Effect.runPromise(Effect.yieldNow)
    assert.strictEqual(finalized, true)
  })

  it("setLazy(true)", async () => {
    const count = Atom.make(0).pipe(Atom.keepAlive)
    let rebuilds = 0
    const double = Atom.make((get) => {
      rebuilds++
      return get(count) * 2
    }).pipe(Atom.keepAlive)
    const r = AtomRegistry.make()
    assert.strictEqual(r.get(double), 0)
    r.set(count, 1)
    assert.strictEqual(rebuilds, 1)
    assert.strictEqual(r.get(double), 2)
    assert.strictEqual(rebuilds, 2)
  })

  it("setLazy(false)", async () => {
    const count = Atom.make(0).pipe(Atom.keepAlive)
    let rebuilds = 0
    const double = Atom.make((get) => {
      rebuilds++
      return get(count) * 2
    }).pipe(Atom.setLazy(false), Atom.keepAlive)
    const r = AtomRegistry.make()
    assert.strictEqual(r.get(double), 0)
    r.set(count, 1)
    assert.strictEqual(rebuilds, 2)
    assert.strictEqual(r.get(double), 2)
    assert.strictEqual(rebuilds, 2)
  })

  it("derived derived with with effect result", async () => {
    const r = AtomRegistry.make()
    const state = Atom.fn(Effect.succeed<number>)
    let count = 0
    const derived = Atom.readable((get) => {
      count++
      return get(state).pipe(AsyncResult.getOrElse(() => -1)) % 3
    })
    let count2 = 0
    const derived2 = Atom.readable((get) => {
      count2++
      return get(derived) + 10
    })
    const cancel = r.mount(derived2)

    expect(r.get(derived)).toEqual(-1)
    expect(count).toEqual(1)
    expect(r.get(derived2)).toEqual(9)
    expect(count2).toEqual(1)
    r.set(state, 2)
    expect(r.get(derived)).toEqual(2)
    expect(count).toEqual(2)
    expect(r.get(derived2)).toEqual(12)
    expect(count2).toEqual(2)
    r.set(state, 5)
    expect(r.get(derived)).toEqual(2)
    expect(count).toEqual(3)
    expect(r.get(derived2)).toEqual(12)
    expect(count2).toEqual(2)
    cancel()
  })

  test(`toStreamResult`, async () => {
    const r = AtomRegistry.make()
    const atom = Atom.make(Effect.succeed(1))
    const eff = Atom.toStreamResult(atom).pipe(
      Stream.runHead,
      Effect.provideService(AtomRegistry.AtomRegistry, r)
    )
    const result = await Effect.runPromise(eff)
    expect(Option.getOrThrow(result)).toEqual(1)
  })

  test(`refreshOnSignal`, async () => {
    const r = AtomRegistry.make()
    let rebuilds = 0
    const signal = Atom.make(0)
    const refreshOnSignal = Atom.makeRefreshOnSignal(signal)
    const atom = Atom.make(() => {
      rebuilds++
      return 123
    }).pipe(refreshOnSignal)
    r.mount(atom)

    assert.strictEqual(r.get(atom), 123)
    assert.strictEqual(rebuilds, 1)
    r.get(atom)
    assert.strictEqual(rebuilds, 1)

    r.set(signal, 1)
    assert.strictEqual(rebuilds, 2)
  })

  test(`refreshOnSignal uses registry initial values as source state`, () => {
    let rebuilds = 0
    let value = 0
    const signal = Atom.make(0)
    const source = Atom.make(() => {
      rebuilds++
      return value
    }).pipe(Atom.keepAlive)
    const atom = source.pipe(
      Atom.makeRefreshOnSignal(signal),
      Atom.keepAlive
    )
    const r = AtomRegistry.make({ initialValues: [Atom.initialValue(atom, 10)] })
    r.mount(atom)

    assert.strictEqual(r.get(atom), 10)
    assert.strictEqual(r.get(source), 10)
    assert.strictEqual(rebuilds, 1)

    value = 11
    r.set(signal, 1)

    assert.strictEqual(r.get(atom), 11)
    assert.strictEqual(r.get(source), 11)
    assert.strictEqual(rebuilds, 2)
  })

  test(`debounce uses registry initial values as source state`, async () => {
    const source = Atom.make(0).pipe(Atom.keepAlive)
    const atom = source.pipe(
      Atom.debounce(100),
      Atom.keepAlive
    )
    const r = AtomRegistry.make({ initialValues: [Atom.initialValue(atom, 10)] })
    r.mount(atom)

    assert.strictEqual(r.get(atom), 10)
    assert.strictEqual(r.get(source), 10)

    r.set(source, 11)
    assert.strictEqual(r.get(atom), 10)

    await vitest.advanceTimersByTimeAsync(100)

    assert.strictEqual(r.get(atom), 11)
    assert.strictEqual(r.get(source), 11)
  })

  test(`withRefresh uses registry initial values as source state`, async () => {
    let rebuilds = 0
    let value = 0
    const source = Atom.make(() => {
      rebuilds++
      return value
    }).pipe(Atom.keepAlive)
    const atom = source.pipe(
      Atom.withRefresh(100),
      Atom.keepAlive
    )
    const r = AtomRegistry.make({ initialValues: [Atom.initialValue(atom, 10)] })
    r.mount(atom)

    assert.strictEqual(r.get(atom), 10)
    assert.strictEqual(r.get(source), 10)
    assert.strictEqual(rebuilds, 1)

    value = 11
    await vitest.advanceTimersByTimeAsync(100)

    assert.strictEqual(r.get(atom), 11)
    assert.strictEqual(r.get(source), 11)
    assert.strictEqual(rebuilds, 2)
  })

  test(`swr refresh is forceful while fresh`, () => {
    const r = AtomRegistry.make()
    let runs = 0
    const atom = Atom.make(Effect.sync(() => ++runs)).pipe(
      Atom.swr({ staleTime: 1_000 })
    )
    const unmount = r.mount(atom)

    let result = r.get(atom)
    assert(AsyncResult.isSuccess(result))
    assert.strictEqual(result.value, 1)
    assert.strictEqual(runs, 1)

    r.refresh(atom)
    result = r.get(atom)
    assert(AsyncResult.isSuccess(result))
    assert.strictEqual(result.value, 2)
    assert.strictEqual(runs, 2)

    unmount()
  })

  test(`swr keeps previous value while stale revalidation runs`, async () => {
    const r = AtomRegistry.make()
    let runs = 0
    const atom = Atom.make(Effect.sync(() => ++runs).pipe(Effect.delay(50))).pipe(
      Atom.swr({ staleTime: 100 })
    )
    const unmount = r.mount(atom)

    let result = r.get(atom)
    assert(result.waiting)

    await vitest.advanceTimersByTimeAsync(50)
    result = r.get(atom)
    assert(AsyncResult.isSuccess(result))
    assert.strictEqual(result.value, 1)
    assert.strictEqual(runs, 1)

    await vitest.advanceTimersByTimeAsync(101)
    r.refresh(atom)
    result = r.get(atom)
    assert(result.waiting)
    assert.deepEqual(AsyncResult.value(result), Option.some(1))
    assert.strictEqual(runs, 1)

    await vitest.advanceTimersByTimeAsync(50)
    result = r.get(atom)
    assert(AsyncResult.isSuccess(result))
    assert.strictEqual(result.value, 2)
    assert.strictEqual(runs, 2)

    unmount()
  })

  test(`swr refresh is forceful after failure with previousSuccess`, () => {
    const r = AtomRegistry.make()
    let runs = 0
    const atom = Atom.fn((i: number) => {
      runs++
      return i === 1 ? Effect.fail("fail") : Effect.succeed(i)
    }).pipe(
      Atom.swr({ staleTime: 1_000 })
    )
    const unmount = r.mount(atom)

    r.set(atom, 0)
    let result = r.get(atom)
    assert(AsyncResult.isSuccess(result))
    assert.strictEqual(result.value, 0)
    assert.strictEqual(runs, 1)

    r.set(atom, 1)
    result = r.get(atom)
    assert(AsyncResult.isFailure(result))
    assert.strictEqual(runs, 2)

    r.refresh(atom)
    result = r.get(atom)
    assert(AsyncResult.isFailure(result))
    assert.strictEqual(runs, 3)

    r.refresh(atom)
    result = r.get(atom)
    assert(AsyncResult.isFailure(result))
    assert.strictEqual(runs, 4)

    unmount()
  })

  test(`swr refreshes failure without previousSuccess`, () => {
    const r = AtomRegistry.make()
    let runs = 0
    const atom = Atom.make(() => {
      runs++
      return Effect.fail("fail")
    }).pipe(
      Atom.swr({ staleTime: 1_000, revalidateOnMount: false })
    )
    const unmount = r.mount(atom)

    let result = r.get(atom)
    assert(AsyncResult.isFailure(result))
    assert.strictEqual(runs, 1)

    r.refresh(atom)
    result = r.get(atom)
    assert(AsyncResult.isFailure(result))
    assert.strictEqual(runs, 2)

    unmount()
  })

  test(`swr revalidateOnMount false skips first read only`, () => {
    const r = AtomRegistry.make()
    const focusSignal = Atom.make(0)
    let focus = 0
    const emitFocus = () => r.set(focusSignal, ++focus)
    let runs = 0
    const atom = Atom.make(() => {
      runs++
      return Effect.fail("fail")
    }).pipe(
      Atom.swr({ staleTime: 1_000, revalidateOnMount: false, revalidateOnFocus: true, focusSignal })
    )
    const unmount = r.mount(atom)

    let result = r.get(atom)
    assert(AsyncResult.isFailure(result))
    assert.strictEqual(runs, 1)

    emitFocus()
    result = r.get(atom)
    assert(AsyncResult.isFailure(result))
    assert.strictEqual(runs, 2)

    unmount()
  })

  test(`swr auto revalidates failure with previousSuccess only when stale`, async () => {
    const r = AtomRegistry.make()
    const focusSignal = Atom.make(0)
    let focus = 0
    const emitFocus = () => r.set(focusSignal, ++focus)
    let runs = 0
    const atom = Atom.fn((i: number) => {
      runs++
      return i === 0 ? Effect.succeed(i) : Effect.fail("fail")
    }).pipe(
      Atom.swr({ staleTime: 1_000, revalidateOnMount: false, revalidateOnFocus: true, focusSignal })
    )
    const unmount = r.mount(atom)

    r.set(atom, 0)
    let result = r.get(atom)
    assert(AsyncResult.isSuccess(result))
    assert.strictEqual(result.value, 0)
    assert.strictEqual(runs, 1)

    r.set(atom, 1)
    result = r.get(atom)
    assert(AsyncResult.isFailure(result))
    assert.strictEqual(runs, 2)

    emitFocus()
    result = r.get(atom)
    assert(AsyncResult.isFailure(result))
    assert.strictEqual(runs, 2)

    await vitest.advanceTimersByTimeAsync(1_001)
    emitFocus()
    result = r.get(atom)
    assert(AsyncResult.isFailure(result))
    assert.strictEqual(runs, 3)

    unmount()
  })

  test(`swr does not refresh from initial state`, () => {
    const r = AtomRegistry.make()
    let runs = 0
    const atom = Atom.fn((n: number) => {
      runs++
      return Effect.succeed(n)
    }).pipe(
      Atom.swr({ staleTime: 0 })
    )
    const unmount = r.mount(atom)

    let result = r.get(atom)
    assert(AsyncResult.isInitial(result))
    assert.strictEqual(result.waiting, false)
    assert.strictEqual(runs, 0)

    r.refresh(atom)
    result = r.get(atom)
    assert(AsyncResult.isInitial(result))
    assert.strictEqual(result.waiting, false)
    assert.strictEqual(runs, 0)

    unmount()
  })

  test(`swr refresh is forceful while waiting`, async () => {
    const r = AtomRegistry.make()
    let runs = 0
    const atom = Atom.make(Effect.sync(() => ++runs).pipe(Effect.tap(() => Effect.sleep(50)))).pipe(
      Atom.swr({ staleTime: 0 })
    )
    const unmount = r.mount(atom)

    await vitest.advanceTimersByTimeAsync(50)
    let result = r.get(atom)
    assert(AsyncResult.isSuccess(result))
    assert.strictEqual(result.value, 1)
    assert.strictEqual(runs, 1)

    r.refresh(atom)
    result = r.get(atom)
    assert(result.waiting)
    assert.strictEqual(runs, 2)

    r.refresh(atom)
    result = r.get(atom)
    assert(result.waiting)
    assert.strictEqual(runs, 3)

    await vitest.advanceTimersByTimeAsync(50)
    result = r.get(atom)
    assert(AsyncResult.isSuccess(result))
    assert.strictEqual(result.value, 3)

    unmount()
  })

  test(`swr delegates refresh to wrapped custom refresh`, () => {
    const r = AtomRegistry.make()
    let runs = 0
    const source = Atom.make(Effect.sync(() => ++runs))
    const proxy = Atom.writable<AsyncResult.AsyncResult<number, never>, void>(
      (get) => get(source),
      () => {
      },
      (refresh) => refresh(source)
    )
    const atom = proxy.pipe(Atom.swr({ staleTime: 1_000, revalidateOnMount: false }))
    const unmount = r.mount(atom)

    let result = r.get(atom)
    assert(AsyncResult.isSuccess(result))
    assert.strictEqual(result.value, 1)
    assert.strictEqual(runs, 1)

    r.refresh(atom)
    result = r.get(atom)
    assert(AsyncResult.isSuccess(result))
    assert.strictEqual(result.value, 2)
    assert.strictEqual(runs, 2)

    unmount()
  })

  test(`swr revalidates after a stale remount returns`, async () => {
    const r = AtomRegistry.make()
    let runs = 0
    const base = Atom.make(Effect.sync(() => ++runs)).pipe(Atom.keepAlive)
    const atom = base.pipe(Atom.swr({ staleTime: 100, revalidateOnMount: true }))

    const unmount1 = r.mount(atom)
    let result = r.get(atom)
    assert(AsyncResult.isSuccess(result))
    assert.strictEqual(result.value, 1)
    assert.strictEqual(runs, 1)
    unmount1()

    await Effect.runPromise(Effect.yieldNow)
    await vitest.advanceTimersByTimeAsync(101)

    const unmount2 = r.mount(atom)
    result = r.get(atom)
    assert(AsyncResult.isSuccess(result))
    assert.strictEqual(result.value, 1)
    assert.strictEqual(runs, 1)

    await Effect.runPromise(Effect.yieldNow)
    result = r.get(atom)
    assert(AsyncResult.isSuccess(result))
    assert.strictEqual(result.value, 2)
    assert.strictEqual(runs, 2)
    unmount2()
  })

  test.each([
    { age: 0, expected: 0 },
    { age: 1_000, expected: 1 }
  ])(`swr revalidates a kept initial value by staleTime (seed age: $age)`, async ({ age, expected }) => {
    let runs = 0
    const atom = Atom.make(Effect.sync(() => ++runs)).pipe(Atom.swr({ staleTime: 1_000 }))
    const seed = AsyncResult.success(0, { timestamp: Date.now() - age })
    const r = AtomRegistry.make({
      initialValues: [Atom.initialValue(atom, seed, { skipInitialRun: true })]
    })
    try {
      r.mount(atom)
      await Effect.runPromise(Effect.yieldNow)

      const result = r.get(atom)
      assert(AsyncResult.isSuccess(result))
      assert.strictEqual(result.value, expected)
      assert.strictEqual(runs, expected)
    } finally {
      r.dispose()
    }
  })

  test(`swr cancels queued revalidation when unmounted`, async () => {
    const r = AtomRegistry.make()
    let runs = 0
    const base = Atom.make(Effect.sync(() => ++runs)).pipe(Atom.keepAlive)
    const atom = base.pipe(Atom.swr({ staleTime: 100 }))
    r.get(base)
    await vitest.advanceTimersByTimeAsync(101)

    const unmount = r.mount(atom)
    const result = r.get(atom)
    assert(AsyncResult.isSuccess(result))
    assert.strictEqual(result.value, 1)
    unmount()
    await Effect.runPromise(Effect.yieldNow)

    assert.strictEqual(runs, 1)
  })

  test(`swr does not notify subscribers during a nested read`, async () => {
    const r = AtomRegistry.make()
    const events: Array<string> = []
    let runs = 0
    const base = Atom.make(Effect.sync(() => ++runs)).pipe(Atom.keepAlive)
    const atom = base.pipe(Atom.swr({ staleTime: 100 }))
    r.get(base)
    await vitest.advanceTimersByTimeAsync(101)
    const unsubscribe = r.subscribe(base, () => events.push("notified"))
    const outer = Atom.make(() => {
      events.push("read start")
      const unmount = r.mount(atom)
      const value = r.get(atom)
      assert(AsyncResult.isSuccess(value))
      assert.strictEqual(value.value, 1)
      unmount()
      events.push("read end")
      return value
    })

    r.get(outer)
    assert.deepStrictEqual(events, ["read start", "read end"])
    await Effect.runPromise(Effect.yieldNow)
    assert.deepStrictEqual(events, ["read start", "read end"])
    assert.strictEqual(runs, 1)
    unsubscribe()
  })

  test(`swr skips queued revalidation when the source becomes fresh`, async () => {
    const r = AtomRegistry.make()
    let runs = 0
    const base = Atom.make(Effect.sync(() => ++runs)).pipe(Atom.keepAlive)
    const atom = base.pipe(Atom.swr({ staleTime: 100 }))
    r.get(base)
    await vitest.advanceTimersByTimeAsync(101)

    const unmount = r.mount(atom)
    const result = r.get(atom)
    assert(AsyncResult.isSuccess(result))
    assert.strictEqual(result.value, 1)
    assert.strictEqual(runs, 1)
    r.refresh(base)
    await Effect.runPromise(Effect.yieldNow)

    assert.strictEqual(runs, 2)
    unmount()
  })

  test(`swr does not revalidate on fresh remount when enabled`, async () => {
    const r = AtomRegistry.make()
    let runs = 0
    const base = Atom.make(Effect.sync(() => ++runs)).pipe(Atom.keepAlive)
    const atom = base.pipe(Atom.swr({ staleTime: 10_000, revalidateOnMount: true }))

    const unmount1 = r.mount(atom)
    let result = r.get(atom)
    assert(AsyncResult.isSuccess(result))
    assert.strictEqual(result.value, 1)
    assert.strictEqual(runs, 1)
    unmount1()

    await Effect.runPromise(Effect.yieldNow)

    const unmount2 = r.mount(atom)
    result = r.get(atom)
    assert(AsyncResult.isSuccess(result))
    assert.strictEqual(result.value, 1)
    assert.strictEqual(runs, 1)
    unmount2()
  })

  test(`swr revalidates on focus signal only when stale`, async () => {
    const r = AtomRegistry.make()
    const focusSignal = Atom.make(0)
    let focus = 0
    const emitFocus = () => r.set(focusSignal, ++focus)
    let runs = 0
    const atom = Atom.make(Effect.sync(() => ++runs)).pipe(
      Atom.swr({ staleTime: 1_000, revalidateOnFocus: true, focusSignal })
    )
    const unmount = r.mount(atom)

    let result = r.get(atom)
    assert(AsyncResult.isSuccess(result))
    assert.strictEqual(result.value, 1)
    assert.strictEqual(runs, 1)

    emitFocus()
    result = r.get(atom)
    assert(AsyncResult.isSuccess(result))
    assert.strictEqual(result.value, 1)
    assert.strictEqual(runs, 1)

    await vitest.advanceTimersByTimeAsync(1_001)
    emitFocus()
    result = r.get(atom)
    assert(AsyncResult.isSuccess(result))
    assert.strictEqual(result.value, 2)
    assert.strictEqual(runs, 2)

    unmount()
  })

  test(`swr can force refresh on focus signal`, () => {
    const r = AtomRegistry.make()
    const focusSignal = Atom.make(0)
    let focus = 0
    const emitFocus = () => r.set(focusSignal, ++focus)
    let runs = 0
    const atom = Atom.make(Effect.sync(() => ++runs)).pipe(
      Atom.swr({ staleTime: 1_000, revalidateOnFocus: "always", focusSignal })
    )
    const unmount = r.mount(atom)

    let result = r.get(atom)
    assert(AsyncResult.isSuccess(result))
    assert.strictEqual(result.value, 1)
    assert.strictEqual(runs, 1)

    emitFocus()
    result = r.get(atom)
    assert(AsyncResult.isSuccess(result))
    assert.strictEqual(result.value, 2)
    assert.strictEqual(runs, 2)

    unmount()
  })

  test(`swr treats value as stale at exact staleTime boundary`, async () => {
    const r = AtomRegistry.make()
    const focusSignal = Atom.make(0)
    let focus = 0
    const emitFocus = () => r.set(focusSignal, ++focus)
    let runs = 0
    const atom = Atom.make(Effect.sync(() => ++runs)).pipe(
      Atom.swr({ staleTime: 1_000, revalidateOnFocus: true, focusSignal })
    )
    const unmount = r.mount(atom)

    let result = r.get(atom)
    assert(AsyncResult.isSuccess(result))
    assert.strictEqual(result.value, 1)
    assert.strictEqual(runs, 1)

    await vitest.advanceTimersByTimeAsync(1_000)
    emitFocus()
    result = r.get(atom)
    assert(AsyncResult.isSuccess(result))
    assert.strictEqual(result.value, 2)
    assert.strictEqual(runs, 2)

    unmount()
  })

  test(`swr does not refresh on focus signal when disabled or omitted`, () => {
    {
      const r = AtomRegistry.make()
      const focusSignal = Atom.make(0)
      let focus = 0
      const emitFocus = () => r.set(focusSignal, ++focus)
      let runs = 0
      const atom = Atom.make(Effect.sync(() => ++runs)).pipe(
        Atom.swr({ staleTime: 10_000, revalidateOnFocus: false, focusSignal })
      )
      const unmount = r.mount(atom)

      let result = r.get(atom)
      assert(AsyncResult.isSuccess(result))
      assert.strictEqual(result.value, 1)
      assert.strictEqual(runs, 1)

      emitFocus()
      result = r.get(atom)
      assert(AsyncResult.isSuccess(result))
      assert.strictEqual(result.value, 1)
      assert.strictEqual(runs, 1)

      unmount()
    }

    {
      const r = AtomRegistry.make()
      const focusSignal = Atom.make(0)
      let focus = 0
      const emitFocus = () => r.set(focusSignal, ++focus)
      let runs = 0
      const atom = Atom.make(Effect.sync(() => ++runs)).pipe(
        Atom.swr({ staleTime: 10_000, focusSignal })
      )
      const unmount = r.mount(atom)

      let result = r.get(atom)
      assert(AsyncResult.isSuccess(result))
      assert.strictEqual(result.value, 1)
      assert.strictEqual(runs, 1)

      emitFocus()
      result = r.get(atom)
      assert(AsyncResult.isSuccess(result))
      assert.strictEqual(result.value, 1)
      assert.strictEqual(runs, 1)

      unmount()
    }
  })

  test(`swr does not revalidate on stale remount when disabled`, async () => {
    const r = AtomRegistry.make()
    let runs = 0
    const base = Atom.make(Effect.sync(() => ++runs)).pipe(Atom.keepAlive)
    const atom = base.pipe(Atom.swr({ staleTime: 100, revalidateOnMount: false }))

    const unmount1 = r.mount(atom)
    let result = r.get(atom)
    assert(AsyncResult.isSuccess(result))
    assert.strictEqual(result.value, 1)
    assert.strictEqual(runs, 1)
    unmount1()

    await Effect.runPromise(Effect.yieldNow)
    await vitest.advanceTimersByTimeAsync(101)

    const unmount2 = r.mount(atom)
    result = r.get(atom)
    assert(AsyncResult.isSuccess(result))
    assert.strictEqual(result.value, 1)
    assert.strictEqual(runs, 1)
    unmount2()
  })

  test(`swr composes with signal driven refresh wrappers`, async () => {
    const r = AtomRegistry.make()
    let runs = 0
    const signal = Atom.make(0)
    const atom = Atom.make(Effect.sync(() => ++runs)).pipe(
      Atom.swr({ staleTime: 1_000 }),
      Atom.makeRefreshOnSignal(signal)
    )
    const unmount = r.mount(atom)

    let result = r.get(atom)
    assert(AsyncResult.isSuccess(result))
    assert.strictEqual(result.value, 1)
    assert.strictEqual(runs, 1)

    r.set(signal, 1)
    result = r.get(atom)
    assert(AsyncResult.isSuccess(result))
    assert.strictEqual(result.value, 2)
    assert.strictEqual(runs, 2)

    r.set(signal, 2)
    result = r.get(atom)
    assert(AsyncResult.isSuccess(result))
    assert.strictEqual(result.value, 3)
    assert.strictEqual(runs, 3)

    unmount()
  })

  test(`swr preserves writable set semantics`, () => {
    const r = AtomRegistry.make()
    let writes = 0
    const source = Atom.writable<AsyncResult.AsyncResult<number, never>, number>(
      (get) => Option.getOrElse(get.self<AsyncResult.AsyncResult<number, never>>(), () => AsyncResult.success(0)),
      (ctx, value) => {
        writes++
        ctx.setSelf(AsyncResult.success(value))
      }
    )
    const atom = source.pipe(Atom.swr({ staleTime: 1_000 }))
    const unmount = r.mount(atom)

    let result = r.get(atom)
    assert(AsyncResult.isSuccess(result))
    assert.strictEqual(result.value, 0)

    r.set(atom, 1)
    result = r.get(atom)
    assert(AsyncResult.isSuccess(result))
    assert.strictEqual(result.value, 1)
    assert.strictEqual(writes, 1)

    const sourceResult = r.get(source)
    assert(AsyncResult.isSuccess(sourceResult))
    assert.strictEqual(sourceResult.value, 1)

    unmount()
  })

  test(`swr uses registry initial values as source state`, () => {
    let runs = 0
    const source = Atom.make(Effect.sync(() => ++runs)).pipe(Atom.keepAlive)
    const atom = source.pipe(
      Atom.swr({ staleTime: 1_000, revalidateOnMount: false }),
      Atom.keepAlive
    )
    const initial = AsyncResult.success(10)
    const r = AtomRegistry.make({ initialValues: [Atom.initialValue(atom, initial)] })
    r.mount(atom)

    assert.deepStrictEqual(r.get(atom), initial)
    assert.deepStrictEqual(r.get(source), initial)
    assert.strictEqual(runs, 1)

    r.refresh(atom)

    const result = r.get(atom)
    assert(AsyncResult.isSuccess(result))
    assert.strictEqual(result.value, 2)
    assert.strictEqual(runs, 2)
  })

  // it("dehydrate", async () => {
  //   const r = AtomRegistry.make()
  //   const notSerializable = Atom.make(0)
  //   r.mount(notSerializable)
  //
  //   const basicSerializable = Atom.make(0).pipe(Atom.serializable({
  //     key: "basicSerializable",
  //     schema: Schema.Number
  //   }))
  //   r.mount(basicSerializable)
  //
  //   const errored = Atom.make(Effect.fail("error")).pipe(
  //     Atom.serializable({
  //       key: "errored",
  //       schema: AsyncResult.Schema({
  //         error: Schema.String
  //       })
  //     })
  //   )
  //   r.mount(errored)
  //
  //   const success = Atom.make(Effect.succeed(123)).pipe(Atom.serializable({
  //     key: "success",
  //     schema: AsyncResult.Schema({
  //       success: Schema.Number
  //     })
  //   }))
  //   r.mount(success)
  //
  //   const { promise, resolve } = Promise.withResolvers<number>()
  //
  //   const pending = Atom.make(Effect.promise(() => promise)).pipe(Atom.serializable({
  //     key: "pending",
  //     schema: AsyncResult.Schema({
  //       success: Schema.Number
  //     })
  //   }))
  //   r.mount(pending)
  //
  //   const state = Hydration.toValues(Hydration.dehydrate(r, {
  //     encodeInitialAs: "promise"
  //   }))
  //   expect(state.map((r) => Struct.omit(r, "dehydratedAt", "resultPromise"))).toMatchInlineSnapshot(`
  //     [
  //       {
  //         "key": "basicSerializable",
  //         "value": 0,
  //         "~@effect-atom/atom/DehydratedAtom": true,
  //       },
  //       {
  //         "key": "errored",
  //         "value": {
  //           "_tag": "Failure",
  //           "cause": {
  //             "_tag": "Fail",
  //             "error": "error",
  //           },
  //           "previousSuccess": {
  //             "_tag": "None",
  //           },
  //           "waiting": false,
  //         },
  //         "~@effect-atom/atom/DehydratedAtom": true,
  //       },
  //       {
  //         "key": "success",
  //         "value": {
  //           "_tag": "Success",
  //           "timestamp": ${Date.now()},
  //           "value": 123,
  //           "waiting": false,
  //         },
  //         "~@effect-atom/atom/DehydratedAtom": true,
  //       },
  //       {
  //         "key": "pending",
  //         "value": {
  //           "_tag": "Initial",
  //           "waiting": true,
  //         },
  //         "~@effect-atom/atom/DehydratedAtom": true,
  //       },
  //     ]
  //   `)
  //
  //   expect(state.find((r) => r.key === "pending")?.resultPromise).instanceOf(Promise)
  //
  //   const r2 = AtomRegistry.make()
  //   Hydration.hydrate(r2, state)
  //
  //   expect(r2.get(notSerializable)).toEqual(0)
  //   expect(r2.get(basicSerializable)).toEqual(0)
  //   expect(r2.get(errored)).toEqual(AsyncResult.failure(Cause.fail("error")))
  //   expect(r2.get(success)).toEqual(AsyncResult.success(123))
  //   expect(r2.get(pending)).toEqual(AsyncResult.initial(true))
  //
  //   resolve(123)
  //   await expect(state.find((r) => r.key === "pending")?.resultPromise).resolves.toEqual({
  //     "_tag": "Success",
  //     "timestamp": expect.any(Number),
  //     "value": 123,
  //     "waiting": false
  //   })
  // })

  describe("optimistic", () => {
    it("non-Result", async () => {
      const latch = Latch.makeUnsafe()
      const r = AtomRegistry.make()
      let i = 0
      const atom = Atom.make(() => i)
      const optimisticAtom = atom.pipe(Atom.optimistic)
      const fn = optimisticAtom.pipe(
        Atom.optimisticFn({
          reducer: (_current, update: number) => update,
          fn: Atom.fn(Effect.fnUntraced(function*() {
            yield* latch.await
          }))
        }),
        Atom.keepAlive
      )

      expect(r.get(atom)).toEqual(0)
      expect(r.get(optimisticAtom)).toEqual(0)
      r.set(fn, 1)
      i = 2

      // optimistic phase: the optimistic value is set, but the true value is not
      expect(r.get(atom)).toEqual(0)
      expect(r.get(optimisticAtom)).toEqual(1)

      latch.openUnsafe()
      await Effect.runPromise(Effect.yieldNow)

      // commit phase: a refresh is triggered, the authoritative value is used
      expect(r.get(atom)).toEqual(2)
      expect(r.get(optimisticAtom)).toEqual(2)
    })

    it("Result", async () => {
      const runtime = Atom.runtime(Layer.empty)
      const latch = Latch.makeUnsafe()
      const r = AtomRegistry.make()
      let i = 0
      const atom = Atom.make(Effect.sync(() => {
        return i
      }))
      const optimisticAtom = atom.pipe(
        Atom.optimistic
      )
      const fn = optimisticAtom.pipe(
        Atom.optimisticFn({
          reducer: (_current, update: number) => AsyncResult.success(update),
          fn: runtime.fn(Effect.fnUntraced(function*() {
            yield* latch.await
          }))
        })
      )

      r.mount(optimisticAtom)
      r.mount(fn)

      expect(r.get(atom)).toEqual(AsyncResult.success(0))
      expect(r.get(optimisticAtom)).toEqual(AsyncResult.success(0))
      r.set(fn, 1)
      i = 2

      // optimistic phase: the optimistic value is set, but the true value is not
      expect(r.get(atom)).toEqual(AsyncResult.success(0))
      expect(r.get(optimisticAtom)).toEqual(AsyncResult.success(1, { waiting: true }))

      latch.openUnsafe()
      await Effect.runPromise(Effect.yieldNow)

      // commit phase: a refresh is triggered, the authoritative value is used
      expect(r.get(atom)).toEqual(AsyncResult.success(2))
      expect(r.get(optimisticAtom)).toEqual(AsyncResult.success(2))
    })

    it("failures", async () => {
      const latch = Latch.makeUnsafe()
      const r = AtomRegistry.make()
      const i = 0
      let rebuilds = 0
      const atom = Atom.make(() => {
        rebuilds++
        return i
      })
      const optimisticAtom = atom.pipe(
        Atom.optimistic
      )
      const fn = optimisticAtom.pipe(
        Atom.optimisticFn({
          reducer: (_, value) => value,
          fn: Atom.fn<number>()(Effect.fnUntraced(function*() {
            yield* latch.await
            return yield* Effect.fail("error")
          }))
        })
      )

      r.mount(fn)
      r.mount(optimisticAtom)

      expect(r.get(atom)).toEqual(0)
      expect(r.get(optimisticAtom)).toEqual(0)
      r.set(fn, 1)

      // optimistic phase: the optimistic value is set, but the true value is not
      expect(r.get(atom)).toEqual(0)
      expect(r.get(optimisticAtom)).toEqual(1)

      latch.openUnsafe()
      await Effect.runPromise(Effect.yieldNow)

      // commit phase: the optimistic value is reset to the true value
      expect(r.get(atom)).toEqual(0)
      expect(r.get(optimisticAtom)).toEqual(0)
      expect(rebuilds).toEqual(1)
    })

    it("sync fn", async () => {
      const r = AtomRegistry.make()
      let i = 0
      const atom = Atom.make(() => i)
      const optimisticAtom = atom.pipe(Atom.optimistic, Atom.keepAlive)
      const fn = optimisticAtom.pipe(
        Atom.optimisticFn({
          reducer: (_current, update) => update,
          fn: Atom.fn<number>()(() => {
            i = 2
            return Effect.void
          })
        })
      )

      expect(r.get(atom)).toEqual(0)
      expect(r.get(optimisticAtom)).toEqual(0)
      r.set(fn, 1)

      expect(r.get(atom)).toEqual(2)
      expect(r.get(optimisticAtom)).toEqual(2)
    })

    it("intermediate updates", async () => {
      const latch = Latch.makeUnsafe()
      const r = AtomRegistry.make()
      let i = 0
      const atom = Atom.make(Effect.sync(() => i))
      const optimisticAtom = atom.pipe(
        Atom.optimistic
      )
      const fn = optimisticAtom.pipe(
        Atom.optimisticFn({
          reducer: (_current, update: number) => AsyncResult.success(update),
          fn: (set) =>
            Atom.fn(Effect.fnUntraced(function*() {
              set(AsyncResult.success(123))
              yield* latch.await
            }))
        }),
        Atom.keepAlive
      )

      expect(r.get(atom)).toEqual(AsyncResult.success(0))
      assert.deepStrictEqual(r.get(optimisticAtom), AsyncResult.success(0))
      r.set(fn, 1)
      i = 2

      // optimistic phase: the intermediate value is set, but the true value is
      // not
      assert.deepStrictEqual(r.get(atom), AsyncResult.success(0))
      assert.deepStrictEqual(r.get(optimisticAtom), AsyncResult.success(123, { waiting: true }))

      latch.openUnsafe()
      await Effect.runPromise(Effect.yieldNow)

      // commit phase: a refresh is triggered, the authoritative value is used
      assert.deepStrictEqual(r.get(atom), AsyncResult.success(2))
      assert.deepStrictEqual(r.get(optimisticAtom), AsyncResult.success(2))
    })
  })

  describe("Reactivity", () => {
    it.effect("query stops rerunning its effect after a failure ends the queue", () =>
      Effect.gen(function*() {
        const reactivity = yield* Reactivity.make
        let runs = 0
        const failed = yield* reactivity.query(
          ["todos"],
          Effect.suspend(() => {
            runs++
            return Effect.fail("boom")
          })
        )
        const live = yield* reactivity.query(["todos"], Effect.succeed(42))
        assert.strictEqual(yield* Effect.flip(Queue.take(failed)), "boom")
        assert.strictEqual(yield* Queue.take(live), 42)
        yield* reactivity.invalidate(["todos"])
        assert.strictEqual(yield* Queue.take(live), 42)
        assert.strictEqual(runs, 1)
      }))

    for (const batch of [false, true]) {
      it.effect(`skips handlers cancelled during ${batch ? "batch flushing" : "direct invalidation"}`, () =>
        Effect.gen(function*() {
          const reactivity = yield* Reactivity.make
          const calls: Array<string> = []
          reactivity.registerUnsafe(["a"], () => {
            calls.push("a")
            cancelB()
          })
          const cancelB = reactivity.registerUnsafe(["a"], () => calls.push("b"))

          if (batch) {
            yield* reactivity.withBatch(reactivity.invalidate(["a"]))
          } else {
            reactivity.invalidateUnsafe(["a"])
          }

          assert.deepStrictEqual(calls, ["a"])
        }))
    }

    it.effect("reruns a query once per invalidation with matching collection and member keys", () =>
      Effect.gen(function*() {
        const reactivity = yield* Reactivity.make
        let runs = 0
        const results = yield* reactivity.query({ users: [1] }, Effect.sync(() => ++runs))
        assert.deepStrictEqual(yield* Queue.takeAll(results), [1])

        yield* reactivity.invalidate({ users: [1] })
        assert.deepStrictEqual(yield* Queue.takeAll(results), [2])

        yield* reactivity.invalidate({ users: [1] })
        assert.deepStrictEqual(yield* Queue.takeAll(results), [3])
      }))

    it.effect("reruns a query once per batch with multiple matching array keys", () =>
      Effect.gen(function*() {
        const reactivity = yield* Reactivity.make
        let runs = 0
        const results = yield* reactivity.query(["a", "b"], Effect.sync(() => ++runs))
        assert.deepStrictEqual(yield* Queue.takeAll(results), [1])

        const batch = reactivity.withBatch(Effect.gen(function*() {
          yield* reactivity.invalidate(["a"])
          yield* reactivity.invalidate(["b"])
          yield* reactivity.invalidate(["a", "b"])
          assert.strictEqual(yield* Queue.size(results), 0)
        }))

        yield* batch
        assert.deepStrictEqual(yield* Queue.takeAll(results), [2])

        yield* batch
        assert.deepStrictEqual(yield* Queue.takeAll(results), [3])
      }))

    it.effect("cleans up queries with duplicate keys", () =>
      Effect.gen(function*() {
        const reactivity = yield* Reactivity.make
        const results = yield* reactivity.query(["todos", "todos"], Effect.succeed(42))
        assert.strictEqual(yield* Queue.take(results), 42)
      }).pipe(Effect.scoped))

    it("does not broadcast mutations across registries", () => {
      let reads = 0
      const query = Atom.make(() => ++reads).pipe(
        Atom.withReactivity(["counter"]),
        Atom.keepAlive
      )
      const runtime = Atom.runtime(Layer.empty)
      const mutation = runtime.fn(
        Effect.fn(function*() {
        }),
        { reactivityKeys: ["counter"] }
      )
      const registryA = AtomRegistry.make()
      const registryB = AtomRegistry.make()

      expect(registryA.get(query)).toEqual(1)
      expect(registryB.get(query)).toEqual(2)

      registryA.set(mutation, void 0)

      expect(reads).toEqual(3)
      expect(registryA.get(query)).toEqual(3)
      expect(registryB.get(query)).toEqual(2)

      registryA.dispose()
      registryB.dispose()
    })

    it("rebuilds on mutation", async () => {
      const r = AtomRegistry.make()
      let rebuilds = 0
      const atom = Atom.make(() => rebuilds++).pipe(
        Atom.withReactivity(["counter"]),
        Atom.keepAlive
      )
      const fn = counterRuntime.fn(
        Effect.fn(function*() {
        }),
        { reactivityKeys: ["counter"] }
      )
      assert.strictEqual(r.get(atom), 0)
      r.set(fn, void 0)
      assert.strictEqual(r.get(atom), 1)
      r.set(fn, void 0)
      r.set(fn, void 0)
      assert.strictEqual(r.get(atom), 3)
    })

    for (const termination of ["success", "failure", "defect", "interruption", "replacement"] as const) {
      it.effect(`Stream mutation invalidation on ${termination}`, () =>
        Effect.gen(function*() {
          const r = AtomRegistry.make()
          yield* Effect.addFinalizer(() => Effect.sync(() => r.dispose()))
          let rebuilds = 0
          const query = Atom.make(() => rebuilds++).pipe(
            Atom.withReactivity(["counter"]),
            Atom.keepAlive
          )
          const mutation = counterRuntime.fn(
            () => {
              switch (termination) {
                case "success":
                  return Stream.make(1, 2)
                case "failure":
                  return Stream.fail("boom")
                case "defect":
                  return Stream.die("boom")
                default:
                  return Stream.never
              }
            },
            { reactivityKeys: ["counter"] }
          )
          assert.strictEqual(r.get(query), 0)
          r.mount(mutation)
          r.set(mutation, void 0)
          yield* Effect.yieldNow

          if (termination === "interruption") {
            r.set(mutation, Atom.Interrupt)
          } else if (termination === "replacement") {
            r.set(mutation, void 0)
          }
          yield* Effect.yieldNow

          assert.strictEqual(r.get(mutation).waiting, termination === "replacement")
          assert.strictEqual(r.get(query), termination === "success" ? 1 : 0)
          assert.strictEqual(rebuilds, termination === "success" ? 2 : 1)
        }))
    }

    it("rebuilds on mutation with a registry initial value", async () => {
      let rebuilds = 0
      let value = 0
      const atom = Atom.make(() => {
        rebuilds++
        return value
      }).pipe(
        Atom.withReactivity(["counter"]),
        Atom.keepAlive
      )
      const r = AtomRegistry.make({ initialValues: [Atom.initialValue(atom, 10)] })
      const fn = counterRuntime.fn(
        Effect.fn(function*() {
        }),
        { reactivityKeys: ["counter"] }
      )
      r.mount(atom)

      assert.strictEqual(r.get(atom), 10)
      assert.strictEqual(rebuilds, 1)

      value = 11
      r.set(fn, void 0)

      assert.strictEqual(r.get(atom), 11)
      assert.strictEqual(rebuilds, 2)
    })

    it("rebuilds on mutation with a hydrated value", async () => {
      let rebuilds = 0
      let value = 0
      const atom = Atom.make(() => {
        rebuilds++
        return value
      }).pipe(
        Atom.withReactivity(["counter"]),
        Atom.serializable({ key: "hydrated-counter", schema: Schema.Number }),
        Atom.keepAlive
      )
      const r = AtomRegistry.make()
      const fn = counterRuntime.fn(
        Effect.fn(function*() {
        }),
        { reactivityKeys: ["counter"] }
      )
      const dehydratedState: Array<Hydration.DehydratedAtomValue> = [{
        "~effect/reactivity/Hydration/DehydratedAtom": true,
        key: "hydrated-counter",
        value: 10,
        dehydratedAt: 0
      }]
      Hydration.hydrate(r, dehydratedState)
      r.mount(atom)

      assert.strictEqual(r.get(atom), 10)
      assert.strictEqual(rebuilds, 1)

      value = 11
      r.set(fn, void 0)

      assert.strictEqual(r.get(atom), 11)
      assert.strictEqual(rebuilds, 2)
    })
  })

  it("Atom.Interrupt", async () => {
    const r = AtomRegistry.make()
    const atom = Atom.fn(() => Effect.never)
    r.mount(atom)
    expect(r.get(atom)).toEqual(AsyncResult.initial())
    expect(r.get(atom).waiting).toBeFalsy()
    r.set(atom, void 0)
    expect(r.get(atom)).toEqual(AsyncResult.initial(true))
    expect(r.get(atom).waiting).toBeTruthy()

    r.set(atom, Atom.Interrupt)
    await Effect.runPromise(Effect.yieldNow)
    const result = r.get(atom)
    expect(AsyncResult.isInterrupted(result)).toBeTruthy()
  })

  it("writable derived clears waiting after refresh", async () => {
    let count = 0
    const base = Atom.make(Effect.sync(() => ++count).pipe(Effect.delay(100))).pipe(
      Atom.withLabel("base")
    )
    const derived = Atom.writable(
      (get) => get(base),
      () => {},
      (refresh) => refresh(base)
    ).pipe(
      Atom.withLabel("derived")
    )
    const r = AtomRegistry.make()

    const unmount1 = r.mount(derived)
    await vitest.advanceTimersByTimeAsync(100)
    let result = r.get(derived)
    assert(AsyncResult.isSuccess(result))
    expect(result.value).toEqual(1)
    expect(result.waiting).toEqual(false)
    unmount1()

    r.refresh(derived)
    const unmount2 = r.mount(derived)
    await vitest.advanceTimersByTimeAsync(100)

    result = r.get(derived)
    expect(result.waiting).toEqual(false)
    assert(AsyncResult.isSuccess(result))
    expect(result.value).toEqual(2)

    unmount2()
  })

  it("get.result suspendOnWaiting", async () => {
    const r = AtomRegistry.make()

    const inner = Atom.make(Effect.succeed(1).pipe(Effect.delay(50)))
    const outer = Atom.make((get) => get.result(inner, { suspendOnWaiting: true }))

    r.mount(outer)

    let result = r.get(outer)
    assert(result.waiting)

    await vitest.advanceTimersByTimeAsync(50)

    result = r.get(outer)
    assert(AsyncResult.isSuccess(result))
    assert.strictEqual(result.value, 1)
  })

  it("fn get.result suspendOnWaiting", async () => {
    const r = AtomRegistry.make()
    let runs = 0

    const inner = Atom.fn((n: number) => {
      runs++
      return Effect.succeed(n * 2).pipe(Effect.delay(50))
    })

    const outer = Atom.fn(
      Effect.fn(function*(_: void, get: Atom.FnContext) {
        get.set(inner, 1)
        const a = yield* get.result(inner, { suspendOnWaiting: true })

        get.set(inner, 2)
        const b = yield* get.result(inner, { suspendOnWaiting: true })

        return { a, b }
      })
    )

    r.mount(outer)
    r.set(outer, void 0)

    await vitest.advanceTimersByTimeAsync(100)

    const result = r.get(outer)
    assert(AsyncResult.isSuccess(result))
    assert.strictEqual(result.value.a, 2)
    assert.strictEqual(result.value.b, 4)
    assert.strictEqual(runs, 2)
  })

  describe("kvs", () => {
    it("memoizes defaultValue while loading empty storage", async () => {
      let calls = 0
      const storage = new Map<string, string>()

      const DelayedKVS = Layer.succeed(
        KeyValueStore.KeyValueStore,
        KeyValueStore.makeStringOnly({
          get: Effect.fnUntraced(function*(key) {
            yield* Effect.sleep(20)
            return storage.get(key)
          }),
          set: (key, value) =>
            Effect.sync(() => {
              storage.set(key, value)
            }),
          remove: (key) =>
            Effect.sync(() => {
              storage.delete(key)
            }),
          clear: Effect.sync(() => storage.clear()),
          size: Effect.sync(() => storage.size),
          keys: Effect.sync(() => Array.from(storage.keys()))
        })
      )

      const kvsRuntime = Atom.runtime(DelayedKVS)
      const atom = Atom.kvs({
        runtime: kvsRuntime,
        key: "default-value-key",
        schema: Schema.Number,
        defaultValue: () => {
          calls++
          return 0
        }
      })

      const r = AtomRegistry.make()
      r.mount(atom)

      expect(r.get(atom)).toEqual(0)
      expect(calls).toEqual(1)

      await vitest.advanceTimersByTimeAsync(50)

      expect(r.get(atom)).toEqual(0)
      expect(calls).toEqual(1)
    })

    it("preserves existing value after async load completes", async () => {
      vitest.useRealTimers()
      // Create an in-memory store with a pre-existing value
      const storage = new Map<string, string>()
      storage.set("test-key", JSON.stringify(42))

      // Create a delayed KeyValueStore to simulate async loading
      // Use KeyValueStore.make to get proper forSchema support
      const DelayedKVS = Layer.succeed(
        KeyValueStore.KeyValueStore,
        KeyValueStore.makeStringOnly({
          get: Effect.fnUntraced(function*(key) {
            yield* Effect.sleep(20) // Short delay to create Initial state window
            return storage.get(key)
          }),
          set: (key, value) =>
            Effect.sync(() => {
              storage.set(key, value)
            }),
          remove: (key) =>
            Effect.sync(() => {
              storage.delete(key)
            }),
          clear: Effect.sync(() => storage.clear()),
          size: Effect.sync(() => storage.size),
          keys: Effect.sync(() => Array.from(storage.keys()))
        })
      )

      const kvsRuntime = Atom.runtime(DelayedKVS)
      const atom = Atom.kvs({
        runtime: kvsRuntime,
        key: "test-key",
        schema: Schema.Number,
        defaultValue: () => 0
      })

      const r = AtomRegistry.make()
      r.mount(atom)

      // First read during Initial state returns default
      const value = r.get(atom)
      expect(value).toEqual(0)

      // Wait for async load AND any set effects to complete
      await new Promise((resolve) => setTimeout(resolve, 50))

      // THE KEY ASSERTION: After load completes, storage should still have original value.
      // The bug was that the default (0) would be written during Initial state,
      // corrupting the storage before the async load could read it.
      expect(storage.get("test-key")).toEqual(JSON.stringify(42))
    })

    it("async mode", async () => {
      vitest.useRealTimers()
      // Create an in-memory store with a pre-existing value
      const storage = new Map<string, string>()
      storage.set("test-key", JSON.stringify(42))

      // Create a delayed KeyValueStore to simulate async loading
      // Use KeyValueStore.make to get proper forSchema support
      const DelayedKVS = Layer.succeed(
        KeyValueStore.KeyValueStore,
        KeyValueStore.makeStringOnly({
          get: Effect.fnUntraced(function*(key) {
            yield* Effect.sleep(20) // Short delay to create Initial state window
            return storage.get(key)
          }),
          set: (key, value) =>
            Effect.sync(() => {
              storage.set(key, value)
            }),
          remove: (key) =>
            Effect.sync(() => {
              storage.delete(key)
            }),
          clear: Effect.sync(() => storage.clear()),
          size: Effect.sync(() => storage.size),
          keys: Effect.sync(() => Array.from(storage.keys()))
        })
      )

      const kvsRuntime = Atom.runtime(DelayedKVS)
      const atom = Atom.kvs({
        mode: "async",
        runtime: kvsRuntime,
        key: "test-key",
        schema: Schema.Number,
        defaultValue: () => 0
      })

      const r = AtomRegistry.make()
      r.mount(atom)

      expect(r.get(atom)).toEqual(AsyncResult.initial(true))

      await new Promise((resolve) => setTimeout(resolve, 50))

      const result = r.get(atom)
      assert(AsyncResult.isSuccess(result))
      expect(result.value).toEqual(42)
      expect(result.waiting).toEqual(false)
      expect(storage.get("test-key")).toEqual(JSON.stringify(42))

      r.set(atom, 24)

      const updated = r.get(atom)
      assert(AsyncResult.isSuccess(updated))
      expect(updated.value).toEqual(24)
    })
  })
})

interface BuildCounter {
  readonly get: Effect.Effect<number>
  readonly inc: Effect.Effect<void>
}
const BuildCounter = Context.Service<BuildCounter>("BuildCounter")
const BuildCounterLayer = Layer.sync(BuildCounter, () => {
  let count = 0
  return BuildCounter.of({
    get: Effect.sync(() => count),
    inc: Effect.sync(() => {
      count++
    })
  })
})

interface Counter {
  readonly get: Effect.Effect<number>
  readonly inc: Effect.Effect<void>
}
const Counter = Context.Service<Counter>("Counter")
const CounterLayer = Layer.effect(
  Counter,
  Effect.gen(function*() {
    const buildCounter = yield* BuildCounter
    yield* buildCounter.inc
    let count = 1
    return Counter.of({
      get: Effect.sync(() => count),
      inc: Effect.sync(() => {
        count++
      })
    })
  })
).pipe(
  Layer.provide(BuildCounterLayer)
)

const CounterTest = Layer.effect(
  Counter,
  Effect.gen(function*() {
    const buildCounter = yield* BuildCounter
    yield* buildCounter.inc
    let count = 10
    return Counter.of({
      get: Effect.sync(() => count),
      inc: Effect.sync(() => {
        count++
      })
    })
  })
).pipe(
  Layer.provide(BuildCounterLayer)
)

interface Multiplier {
  readonly times: (n: number) => Effect.Effect<number>
}
const Multiplier = Context.Service<Multiplier>("Multiplier")
const MultiplierLayer = Layer.effect(
  Multiplier,
  Effect.gen(function*() {
    const counter = yield* Counter
    yield* AtomRegistry.AtomRegistry // test that we can access the registry
    return Multiplier.of({
      times: (n) => Effect.map(counter.get, (_) => _ * n)
    })
  })
).pipe(
  Layer.provideMerge(CounterLayer)
)

const buildCounterRuntime = Atom.runtime(BuildCounterLayer)
const counterRuntime = Atom.runtime(CounterLayer)
const multiplierRuntime = Atom.runtime(MultiplierLayer)
