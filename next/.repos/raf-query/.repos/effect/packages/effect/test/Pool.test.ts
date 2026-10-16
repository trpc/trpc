import { assert, describe, it } from "@effect/vitest"
import { deepStrictEqual, strictEqual } from "@effect/vitest/utils"
import { Clock, Deferred, Duration, Effect, Exit, Fiber, pipe, Pool, Ref, Schedule, Scheduler, Scope } from "effect"
import { TestClock } from "effect/testing"
import { collectGarbage } from "./utils/gc.ts"

const waitUntil = (predicate: () => boolean) =>
  Effect.repeat(Effect.andThen(Effect.yieldNow, Effect.sync(predicate)), { until: (done) => done })

describe("Pool", () => {
  it.effect("preallocates pool items", () =>
    Effect.gen(function*() {
      const count = yield* Ref.make(0)
      const get = Effect.acquireRelease(
        Ref.updateAndGet(count, (n) => n + 1),
        () => Ref.update(count, (n) => n - 1)
      )
      yield* Pool.make({ acquire: get, size: 10 })
      yield* Effect.repeat(Ref.get(count), { until: (n) => n === 10 })
      const result = yield* Ref.get(count)
      strictEqual(result, 10)
    }))

  // it.effect("benchmark", () =>
  //   Effect.gen(function*() {
  //     const get = Effect.succeed("resource")
  //     const pool = yield* Pool.make({ acquire: get, size: 10 })
  //     yield* Pool.get(pool).pipe(
  //       Effect.scoped,
  //       Effect.repeatN(10000),
  //       Console.withTime("Pool.get")
  //     )
  //   }))

  it.effect("cleans up items when shut down", () =>
    Effect.gen(function*() {
      const count = yield* Ref.make(0)
      const get = Effect.acquireRelease(
        Ref.updateAndGet(count, (n) => n + 1),
        () => Ref.update(count, (n) => n - 1)
      )
      const scope = yield* Scope.make()
      yield* Scope.provide(Pool.make({ acquire: get, size: 10 }), scope)
      yield* Effect.repeat(Ref.get(count), { until: (n) => n === 10 })
      yield* Scope.close(scope, Exit.succeed(void 0))
      const result = yield* Ref.get(count)
      strictEqual(result, 0)
    }))

  it.effect("defects don't prevent cleanup", () =>
    Effect.gen(function*() {
      const count = yield* Ref.make(0)
      const get = Effect.acquireRelease(
        Ref.updateAndGet(count, (n) => n + 1),
        () => Effect.andThen(Ref.update(count, (n) => n - 1), Effect.die("boom"))
      )
      const scope = yield* Scope.make()
      yield* Scope.provide(Pool.make({ acquire: get, size: 10 }), scope)
      yield* Effect.repeat(Ref.get(count), { until: (n) => n === 10 })
      yield* Scope.close(scope, Exit.succeed(void 0))
      const result = yield* Ref.get(count)
      strictEqual(result, 0)
    }))

  it.effect("acquire one item", () =>
    Effect.gen(function*() {
      const count = yield* Ref.make(0)
      const get = Effect.acquireRelease(
        Ref.updateAndGet(count, (n) => n + 1),
        () => Ref.update(count, (n) => n - 1)
      )
      const pool = yield* Pool.make({ acquire: get, size: 10 })
      yield* Effect.repeat(Ref.get(count), { until: (n) => n === 10 })
      const item = yield* Pool.get(pool)
      strictEqual(item, 1)
    }))

  it.effect("keeps failed background capacity until a borrower reaches it", () =>
    Effect.gen(function*() {
      const releaseFailure = yield* Deferred.make<void>()
      const failed = yield* Deferred.make<void>()
      let attempts = 0
      const pool = yield* Pool.makeWithTTL({
        acquire: Effect.suspend(() => {
          const attempt = ++attempts
          return attempt === 2
            ? Effect.andThen(
              Deferred.await(releaseFailure),
              Effect.andThen(
                Deferred.succeed(failed, undefined),
                Effect.fail("background")
              )
            )
            : Effect.succeed(attempt)
        }),
        min: 2,
        max: 3,
        timeToLive: Duration.infinity
      })
      yield* waitUntil(() => pool.state.availableHead?.exit._tag === "Success")
      yield* Deferred.succeed(releaseFailure, undefined)
      yield* Deferred.await(failed)
      yield* waitUntil(() => pool.state.items.size === 2)
      for (let i = 0; i < 5; i++) {
        strictEqual(yield* Pool.use(pool, Effect.succeed), 1)
      }
      strictEqual(attempts, 2)
      strictEqual(pool.state.items.size, 2)
      const owner = yield* Scope.make()
      strictEqual(yield* Scope.provide(Pool.get(pool), owner), 1)
      strictEqual(yield* Pool.use(pool, Effect.succeed), 3)
      strictEqual(attempts, 3)
      yield* Scope.close(owner, Exit.void)
    }))

  it.live("blocks when item not available", () =>
    Effect.gen(function*() {
      const count = yield* Ref.make(0)
      const get = Effect.acquireRelease(
        Ref.updateAndGet(count, (n) => n + 1),
        () => Ref.update(count, (n) => n - 1)
      )
      const pool = yield* Pool.make({ acquire: get, size: 10 })
      yield* Effect.repeat(Ref.get(count), { until: (n) => n === 10 })
      yield* Effect.all(Effect.replicate(10)(Pool.get(pool)))
      const result = yield* Effect.scoped(Pool.get(pool)).pipe(
        Effect.forkChild({ startImmediately: true })
      )
      yield* Effect.sleep(10)
      assert.isUndefined(result.pollUnsafe())
    }))

  it.effect("reuse released items", () =>
    Effect.gen(function*() {
      const count = yield* Ref.make(0)
      const get = Effect.acquireRelease(
        Ref.updateAndGet(count, (n) => n + 1),
        () => Ref.update(count, (n) => n - 1)
      )
      const pool = yield* Pool.make({ acquire: get, size: 10 })
      yield* Effect.replicateEffect(99)(Effect.scoped(Pool.get(pool)))
      const result = yield* Ref.get(count)
      strictEqual(result, 10)
    }))

  it.effect("invalidate item", () =>
    Effect.gen(function*() {
      const count = yield* Ref.make(0)
      const get = Effect.acquireRelease(
        Ref.updateAndGet(count, (n) => n + 1),
        () => Ref.update(count, (n) => n - 1)
      )
      const pool = yield* Pool.make({ acquire: get, size: 10 })
      yield* Effect.repeat(Ref.get(count), { until: (n) => n === 10 })
      yield* Pool.invalidate(pool, 1)
      yield* Effect.repeat(Ref.get(count), { until: (n) => n === 10 })
      const result = yield* Effect.scoped(Pool.get(pool))
      const value = yield* Ref.get(count)
      strictEqual(result, 2)
      strictEqual(value, 10)
    }))

  it.effect("invalidate all items in pool and check that pool.get doesn't hang forever", () =>
    Effect.gen(function*() {
      const allocated = yield* Ref.make(0)
      const finalized = yield* Ref.make(0)
      const get = Effect.acquireRelease(
        Ref.updateAndGet(allocated, (n) => n + 1),
        () => Ref.update(finalized, (n) => n + 1)
      )
      const pool = yield* Pool.make({ acquire: get, size: 2 })
      yield* Effect.repeat(Ref.get(allocated), { until: (n) => n === 2 })
      yield* Pool.invalidate(pool, 1)
      yield* Pool.invalidate(pool, 2)
      const result = yield* Effect.scoped(Pool.get(pool))
      const allocatedCount = yield* Ref.get(allocated)
      const finalizedCount = yield* Ref.get(finalized)
      strictEqual(result, 3)
      strictEqual(allocatedCount, 4)
      strictEqual(finalizedCount, 2)
    }))

  it.live("retry on failed acquire should not exhaust pool", () =>
    Effect.gen(function*() {
      const acquire = Effect.as(Effect.fail("error"), 1)
      const pool = yield* Pool.makeWithTTL({ acquire, min: 0, max: 1, timeToLive: Duration.infinity })
      const result = yield* pipe(
        Effect.scoped(Effect.retry(Pool.get(pool), { times: 5 })),
        Effect.timeoutOrElse({
          orElse: () => Effect.fail("timeout"),
          duration: Duration.seconds(1)
        }),
        Effect.flip
      )
      strictEqual(result, "error")
    }))

  it.effect("compositional retry", () =>
    Effect.gen(function*() {
      const cond = (i: number) => (i <= 10 ? Effect.fail(i) : Effect.succeed(i))
      const count = yield* Ref.make(0)
      const get = Effect.acquireRelease(
        Ref.updateAndGet(count, (n) => n + 1).pipe(
          Effect.flatMap(cond)
        ),
        () => Ref.update(count, (n) => n - 1)
      )
      const pool = yield* Pool.make({ acquire: get, size: 10 })
      const result = yield* Effect.retry(Effect.scoped(Pool.get(pool)), Schedule.forever)
      strictEqual(result, 11)
    }))

  describe("usage TTL idle timeout", () => {
    it.effect("shrinks to min in idle order rather than acquisition order", () =>
      Effect.gen(function*() {
        let acquired = 0
        const finalized: Array<number> = []
        const pool = yield* Pool.makeWithTTL({
          acquire: Effect.acquireRelease(
            Effect.sync(() => ++acquired),
            (value) => Effect.sync(() => finalized.push(value))
          ),
          min: 1,
          max: 3,
          timeToLive: 1000,
          timeToLiveStrategy: "usage"
        })
        const first = yield* Scope.fork(yield* Effect.scope)
        const second = yield* Scope.fork(yield* Effect.scope)
        const third = yield* Scope.fork(yield* Effect.scope)
        strictEqual(yield* Pool.get(pool).pipe(Scope.provide(first)), 1)
        strictEqual(yield* Pool.get(pool).pipe(Scope.provide(second)), 2)
        strictEqual(yield* Pool.get(pool).pipe(Scope.provide(third)), 3)

        yield* TestClock.adjust(100)
        yield* Scope.close(second, Exit.void)
        yield* TestClock.adjust(100)
        yield* Scope.close(first, Exit.void)
        yield* TestClock.adjust(100)
        yield* Scope.close(third, Exit.void)
        yield* TestClock.adjust(700)
        deepStrictEqual(finalized, [])
        yield* TestClock.adjust(1000)
        deepStrictEqual(finalized, [2, 1])
        strictEqual(pool.state.items.size, 1)
        yield* TestClock.adjust(2000)
        deepStrictEqual(finalized, [2, 1])
        strictEqual(yield* Pool.use(pool, Effect.succeed), 3)
        strictEqual(acquired, 3)
      }))

    it.effect("retains items used every 3 seconds across TTL sweeps", () =>
      Effect.gen(function*() {
        let acquired = 0
        const pool = yield* Pool.makeWithTTL({
          acquire: Effect.sync(() => ++acquired),
          min: 0,
          max: 10,
          timeToLive: "10 seconds",
          timeToLiveStrategy: "usage"
        })
        for (let i = 0; i < 20; i++) {
          yield* Effect.scoped(Pool.get(pool))
          yield* TestClock.adjust("3 seconds")
        }
        strictEqual(acquired, 1)
      }))

    it.effect("measures idle time with the pool clock when a release runs under another clock", () =>
      Effect.gen(function*() {
        const pool = yield* Pool.makeWithTTL({
          acquire: Effect.succeed("resource"),
          min: 0,
          max: 1,
          timeToLive: 1000,
          timeToLiveStrategy: "usage"
        })
        const clock = yield* Clock.Clock
        yield* Pool.use(pool, Effect.succeed).pipe(
          Effect.provideService(Clock.Clock, { ...clock, currentTimeMillisUnsafe: () => 1_000_000 })
        )
        yield* TestClock.adjust(999)
        strictEqual(pool.state.items.size, 1)
        yield* TestClock.adjust(1)
        strictEqual(pool.state.items.size, 0)
      }))
  })

  it.effect("max pool size", () =>
    Effect.gen(function*() {
      const deferred = yield* Deferred.make<void>()
      const count = yield* Ref.make(0)
      const acquire = Effect.acquireRelease(
        Ref.updateAndGet(count, (n) => n + 1),
        () => Ref.update(count, (n) => n - 1)
      )
      const pool = yield* Pool.makeWithTTL({
        acquire,
        min: 10,
        max: 15,
        timeToLive: Duration.seconds(60)
      })
      yield* pipe(
        Effect.scoped(Effect.andThen(
          Pool.get(pool),
          Deferred.await(deferred)
        )),
        Effect.forkChild,
        Effect.repeat({ times: 14 })
      )
      yield* Effect.repeat(Ref.get(count), { until: (n) => n === 15 })
      yield* Deferred.succeed(deferred, void 0)
      const max = yield* Ref.get(count)
      yield* TestClock.adjust(Duration.seconds(60))
      const min = yield* Ref.get(count)
      strictEqual(min, 10)
      strictEqual(max, 15)
    }))

  it.effect("max pool size with concurrency: 3", () =>
    Effect.gen(function*() {
      const deferred = yield* Deferred.make<void>()
      const count = yield* Ref.make(0)
      const acquire = Effect.acquireRelease(
        Ref.updateAndGet(count, (n) => n + 1),
        () => Ref.update(count, (n) => n - 1)
      )
      const pool = yield* Pool.makeWithTTL({
        acquire,
        min: 10,
        max: 15,
        concurrency: 3,
        timeToLive: Duration.seconds(60)
      })
      yield* pipe(
        Effect.scoped(Effect.andThen(
          Pool.get(pool),
          Deferred.await(deferred)
        )),
        Effect.forkChild,
        Effect.repeat({ times: 14 * 3 })
      )
      yield* Effect.repeat(Ref.get(count), { until: (n) => n === 15 })
      yield* Deferred.succeed(deferred, void 0)
      const max = yield* Ref.get(count)
      yield* TestClock.adjust(Duration.seconds(60))
      const min = yield* Ref.get(count)
      strictEqual(min, 10)
      strictEqual(max, 15)
    }))

  it.effect("usage TTL retains shared items with active borrowers", () =>
    Effect.gen(function*() {
      let acquired = 0
      const pool = yield* Pool.makeWithTTL({
        acquire: Effect.sync(() => ++acquired),
        min: 0,
        max: 2,
        concurrency: 2,
        timeToLive: Duration.seconds(60)
      })

      const scope1 = yield* Scope.fork(yield* Effect.scope)
      strictEqual(yield* Scope.provide(Pool.get(pool), scope1), 1)
      strictEqual(yield* Pool.get(pool), 1)
      strictEqual(yield* Effect.scoped(Pool.get(pool)), 2)
      yield* TestClock.adjust(Duration.seconds(60))
      strictEqual(pool.state.invalidated.size, 0)
      strictEqual(pool.state.items.size, 1)
      yield* Scope.close(scope1, Exit.void)
      strictEqual(yield* Pool.get(pool), 1)
      strictEqual(yield* Pool.get(pool), 3)
      strictEqual(yield* Pool.get(pool), 3)
      strictEqual(acquired, 3)
    }))

  it.effect("reserve takes an item out of shared circulation", () =>
    Effect.gen(function*() {
      const count = yield* Ref.make(0)
      const acquire = Effect.acquireRelease(
        Ref.updateAndGet(count, (n) => n + 1),
        () => Ref.update(count, (n) => n - 1)
      )
      const pool = yield* Pool.makeWithTTL({
        acquire,
        min: 0,
        max: 2,
        concurrency: 2,
        timeToLive: Duration.seconds(60)
      })

      const scope1 = yield* Scope.make()
      strictEqual(yield* Scope.provide(Pool.get(pool), scope1), 1)
      const reservation = yield* Scope.make()
      yield* Scope.provide(Pool.reserve(pool, 1), reservation)
      // The reserved item counts as fully used, so the pool opens a second one
      // and both checkouts share it.
      strictEqual(yield* Scope.provide(Pool.get(pool), scope1), 2)
      strictEqual(yield* Scope.provide(Pool.get(pool), scope1), 2)
      // Everything is saturated, so this checkout has to wait for the
      // reservation to release its capacity.
      const fiber = yield* pipe(
        Scope.provide(Pool.get(pool), scope1),
        Effect.forkChild({ startImmediately: true })
      )
      yield* Scope.close(reservation, Exit.void)
      strictEqual(yield* Fiber.join(fiber), 1)
      strictEqual(yield* Ref.get(count), 2)
      yield* Scope.close(scope1, Exit.void)
    }))

  it.effect("releasing a shared borrower preserves an active reservation", () =>
    Effect.gen(function*() {
      const pool = yield* Pool.make({ acquire: Effect.succeed("resource"), size: 1, concurrency: 2 })
      const owner = yield* Scope.make()
      const borrower = yield* Scope.make()
      const reservation = yield* Scope.make()
      yield* Pool.get(pool).pipe(Scope.provide(owner))
      yield* Pool.get(pool).pipe(Scope.provide(borrower))
      yield* Pool.reserve(pool, "resource").pipe(Scope.provide(reservation))

      yield* Scope.close(borrower, Exit.void)
      const next = yield* Pool.use(pool, Effect.succeed).pipe(Effect.forkChild({ startImmediately: true }))
      const beforeRelease = next.pollUnsafe()
      yield* Scope.close(reservation, Exit.void)
      const result = yield* Fiber.join(next)
      yield* Scope.close(owner, Exit.void)

      assert.isUndefined(beforeRelease)
      assert.strictEqual(result, "resource")
    }))

  it.effect("overlapping reservations keep an item reserved until both close", () =>
    Effect.gen(function*() {
      const pool = yield* Pool.make({ acquire: Effect.succeed("resource"), size: 1, concurrency: 2 })
      const owner = yield* Scope.make()
      const first = yield* Scope.make()
      const second = yield* Scope.make()
      yield* Pool.get(pool).pipe(Scope.provide(owner))
      yield* Pool.reserve(pool, "resource").pipe(Scope.provide(first))
      yield* Pool.reserve(pool, "resource").pipe(Scope.provide(second))
      // One lease plus one reservation; the overlapping reservation must not
      // count usage again.
      assert.strictEqual(pool.state.usage, 2)

      yield* Scope.close(first, Exit.void)
      assert.strictEqual(pool.state.usage, 2)
      const next = yield* Pool.use(pool, Effect.succeed).pipe(Effect.forkChild({ startImmediately: true }))
      const beforeRelease = next.pollUnsafe()
      yield* Scope.close(second, Exit.void)
      const result = yield* Fiber.join(next)
      yield* Scope.close(owner, Exit.void)

      assert.isUndefined(beforeRelease)
      assert.strictEqual(result, "resource")
      assert.strictEqual(pool.state.usage, 0)
    }))

  it.effect("releasing a reservation wakes all available slots after borrowers return", () =>
    Effect.gen(function*() {
      const pool = yield* Pool.make({ acquire: Effect.succeed("resource"), size: 1, concurrency: 2 })
      const owner = yield* Scope.make()
      const reservation = yield* Scope.make()
      const borrowers = yield* Scope.make()
      yield* Pool.get(pool).pipe(Scope.provide(owner))
      yield* Pool.reserve(pool, "resource").pipe(Scope.provide(reservation))
      yield* Scope.close(owner, Exit.void)

      const first = yield* Pool.get(pool).pipe(Scope.provide(borrowers), Effect.forkChild({ startImmediately: true }))
      const second = yield* Pool.get(pool).pipe(Scope.provide(borrowers), Effect.forkChild({ startImmediately: true }))
      const beforeRelease = [first.pollUnsafe(), second.pollUnsafe()]
      yield* Scope.close(reservation, Exit.void)
      yield* TestClock.adjust(0)
      const afterRelease = [first.pollUnsafe(), second.pollUnsafe()]
      yield* Fiber.interrupt(first)
      yield* Fiber.interrupt(second)
      yield* Scope.close(borrowers, Exit.void)

      assert.deepStrictEqual(beforeRelease, [undefined, undefined])
      assert.deepStrictEqual(afterRelease, [Exit.succeed("resource"), Exit.succeed("resource")])
      assert.strictEqual(pool.state.usage, 0)
    }))

  it.effect("usage TTL preserves reservations and waits for capacity", () =>
    Effect.gen(function*() {
      let acquired = 0
      const pool = yield* Pool.makeWithTTL({
        acquire: Effect.sync(() => ++acquired),
        min: 0,
        max: 2,
        concurrency: 2,
        timeToLive: 1000
      })
      const owner = yield* Scope.fork(yield* Effect.scope)
      const reservation = yield* Scope.fork(yield* Effect.scope)
      yield* Pool.get(pool).pipe(Scope.provide(owner))
      yield* Pool.reserve(pool, 1).pipe(Scope.provide(reservation))
      yield* Pool.use(pool, Effect.succeed)
      yield* TestClock.adjust(1000)
      assert.strictEqual(pool.state.items.size, 1)
      assert.strictEqual(pool.state.invalidated.size, 0)

      const first = yield* Pool.get(pool).pipe(Scope.provide(owner))
      const second = yield* Pool.get(pool).pipe(Scope.provide(owner))
      const next = yield* Pool.use(pool, Effect.succeed).pipe(Effect.forkChild({ startImmediately: true }))
      assert.isUndefined(next.pollUnsafe())
      yield* Scope.close(reservation, Exit.void)
      const result = yield* Fiber.join(next)
      yield* Scope.close(owner, Exit.void)

      assert.deepStrictEqual([first, second], [3, 3])
      assert.strictEqual(result, 1)
      assert.strictEqual(acquired, 3)
      assert.strictEqual(pool.state.usage, 0)
    }))

  it.effect("reserve is a no-op with concurrency one", () =>
    Effect.gen(function*() {
      const pool = yield* Pool.make({ acquire: Effect.succeed("resource"), size: 1 })
      const owner = yield* Scope.make()
      const reservation = yield* Scope.make()
      yield* Pool.get(pool).pipe(Scope.provide(owner))
      yield* Pool.reserve(pool, "resource").pipe(Scope.provide(reservation))
      yield* Scope.close(owner, Exit.void)

      const next = yield* Pool.use(pool, Effect.succeed).pipe(Effect.forkChild({ startImmediately: true }))
      const beforeRelease = next.pollUnsafe()
      yield* Scope.close(reservation, Exit.void)
      yield* Fiber.interrupt(next)

      assert.deepStrictEqual(beforeRelease, Exit.succeed("resource"))
    }))

  it.effect.each([false, true])(
    "reservation cleanup does not revive removed items (shutdown: %s)",
    (shutdown) =>
      Effect.gen(function*() {
        let acquired = 0
        const released: Array<number> = []
        const poolScope = yield* Scope.make()
        const owner = yield* Scope.make()
        const reservation = yield* Scope.make()
        const pool = yield* Pool.make({
          acquire: Effect.acquireRelease(
            Effect.sync(() => ++acquired),
            (item) => Effect.sync(() => released.push(item))
          ),
          size: 1,
          concurrency: 2
        }).pipe(Scope.provide(poolScope))
        yield* Pool.get(pool).pipe(Scope.provide(owner))
        yield* Pool.reserve(pool, 1).pipe(Scope.provide(reservation))
        yield* Scope.close(owner, Exit.void)
        if (shutdown) {
          yield* Scope.close(poolScope, Exit.void)
        } else {
          yield* Pool.invalidate(pool, 1)
        }
        yield* Scope.close(reservation, Exit.void)
        const next = yield* Effect.exit(Pool.use(pool, Effect.succeed))
        yield* Scope.close(poolScope, Exit.void)

        if (shutdown) {
          assert.isTrue(Exit.hasInterrupts(next))
          assert.deepStrictEqual(released, [1])
        } else {
          assert.deepStrictEqual(next, Exit.succeed(2))
          assert.deepStrictEqual(released, [1, 2])
        }
        assert.strictEqual(pool.state.usage, 0)
      })
  )

  it.effect("scale to zero", () =>
    Effect.gen(function*() {
      const deferred = yield* Deferred.make<void>()
      const count = yield* Ref.make(0)
      const acquire = Effect.acquireRelease(
        Ref.updateAndGet(count, (n) => n + 1),
        () => Ref.update(count, (n) => n - 1)
      )
      const pool = yield* Pool.makeWithTTL({
        acquire,
        min: 0,
        max: 10,
        concurrency: 3,
        timeToLive: Duration.seconds(60)
      })
      yield* pipe(
        Effect.scoped(Effect.andThen(
          Pool.get(pool),
          Deferred.await(deferred)
        )),
        Effect.forkChild,
        Effect.repeat({ times: 29 })
      )
      yield* Effect.repeat(Ref.get(count), { until: (n) => n === 10 })
      yield* Deferred.succeed(deferred, void 0)
      const max = yield* Ref.get(count)
      yield* TestClock.adjust(Duration.seconds(60))
      const min = yield* Ref.get(count)
      strictEqual(min, 0)
      strictEqual(max, 10)
    }))

  it.effect("max pool size creation strategy", () =>
    Effect.gen(function*() {
      const invalidated = yield* Ref.make(0)
      const acquire = Effect.acquireRelease(
        Effect.succeed("resource"),
        () => Ref.update(invalidated, (n) => n + 1)
      )
      const pool = yield* Pool.makeWithTTL({
        acquire,
        min: 10,
        max: 15,
        timeToLive: Duration.seconds(60),
        timeToLiveStrategy: "creation"
      })
      const scope = yield* Scope.make()
      yield* Pool.get(pool).pipe(
        Effect.repeat({ times: 14 }),
        Scope.provide(scope)
      )
      const one = yield* Ref.get(invalidated)
      yield* TestClock.adjust(Duration.seconds(60))
      const two = yield* Ref.get(invalidated)
      yield* Scope.close(scope, Exit.void)
      const three = yield* Ref.get(invalidated)
      strictEqual(one, 0)
      strictEqual(two, 0)
      strictEqual(three, 15)
    }))

  it.effect("shutdown robustness", () =>
    Effect.gen(function*() {
      const count = yield* Ref.make(0)
      const get = Effect.acquireRelease(
        Ref.updateAndGet(count, (n) => n + 1),
        () => Ref.update(count, (n) => n - 1)
      )
      const scope = yield* Scope.make()
      const pool = yield* Scope.provide(Pool.make({ acquire: get, size: 10 }), scope)
      yield* pipe(
        Effect.scoped(Pool.get(pool)),
        Effect.forkChild,
        Effect.repeat({ times: 99 })
      )
      yield* Scope.close(scope, Exit.succeed(void 0))
      const result = yield* Effect.repeat(Ref.get(count), { until: (n) => n === 0 })
      strictEqual(result, 0)
    }))

  it.effect("shutdown with pending takers", () =>
    Effect.gen(function*() {
      const count = yield* Ref.make(0)
      const get = Effect.acquireRelease(
        Ref.updateAndGet(count, (n) => n + 1),
        () => Ref.update(count, (n) => n - 1)
      )
      const scope = yield* Scope.make()
      const pool = yield* Scope.provide(Pool.make({ acquire: get, size: 10 }), scope)
      yield* pipe(
        Pool.get(pool),
        Scope.provide(scope),
        Effect.forkChild,
        Effect.repeat({ times: 99 })
      )
      yield* Scope.close(scope, Exit.succeed(void 0))
      const result = yield* Effect.repeat(Ref.get(count), { until: (n) => n === 0 })
      strictEqual(result, 0)
    }))

  it.effect("get is interruptible", () =>
    Effect.gen(function*() {
      const count = yield* Ref.make(0)
      const get = Effect.acquireRelease(
        Ref.updateAndGet(count, (n) => n + 1),
        () => Ref.update(count, (n) => n - 1)
      )
      const fiberId = Fiber.getCurrent()!.id
      const pool = yield* Pool.make({ acquire: get, size: 10 })
      yield* Effect.repeat(Pool.get(pool), { times: 9 })
      const fiber = yield* Effect.forkChild(Pool.get(pool))
      yield* Fiber.interrupt(fiber)
      deepStrictEqual(fiber.pollUnsafe(), Exit.interrupt(fiberId))
    }))

  it.effect("get is interruptible with dynamic size", () =>
    Effect.gen(function*() {
      const get = Effect.never.pipe(Effect.forkScoped)
      const fiberId = Fiber.getCurrent()!.id
      const pool = yield* Pool.makeWithTTL({ acquire: get, min: 0, max: 10, timeToLive: Duration.infinity })
      yield* Effect.repeat(Pool.get(pool), { times: 9 })
      const fiber = yield* Effect.forkChild(Pool.get(pool))
      yield* Fiber.interrupt(fiber)
      deepStrictEqual(yield* Fiber.await(fiber), Exit.interrupt(fiberId))
    }))

  it.effect("interrupts pending gets without leaking usage", () =>
    Effect.gen(function*() {
      const pool = yield* Pool.make({ acquire: Effect.succeed("resource"), size: 1 })
      const scope = yield* Scope.make()
      yield* Scope.provide(Pool.get(pool), scope)
      const fibers: Array<Fiber.Fiber<string>> = []
      for (let i = 0; i < 10; i++) {
        fibers.push(yield* Effect.forkChild(Pool.get(pool), { startImmediately: true }))
      }
      yield* waitUntil(() => pool.state.waiters.size === fibers.length)
      yield* Effect.all(fibers.map(Fiber.interrupt), { concurrency: "unbounded", discard: true })
      strictEqual(pool.state.waiters.size, 0)
      strictEqual(pool.state.usage, 1)
      yield* Scope.close(scope, Exit.void)
      strictEqual(pool.state.usage, 0)
    }))

  it.effect("does not re-wake waiters registered during notification", () =>
    Effect.gen(function*() {
      const acquire = yield* Deferred.make<void>()
      const pool = yield* Pool.makeWithTTL({
        acquire: Effect.as(Deferred.await(acquire), "resource"),
        min: 0,
        max: 1,
        timeToLive: Duration.infinity
      })
      const fibers: Array<Fiber.Fiber<string>> = []
      for (let i = 0; i < 10; i++) {
        fibers.push(yield* Effect.forkChild(Effect.scoped(Pool.get(pool)), { startImmediately: true }))
      }
      yield* waitUntil(() => pool.state.waiters.size === fibers.length)
      yield* Deferred.succeed(acquire, undefined)
      yield* Effect.all(fibers.map(Fiber.join), { concurrency: "unbounded", discard: true })
      strictEqual(pool.state.waiters.size, 0)
      strictEqual(pool.state.usage, 0)
    }))

  it.effect("use borrows and returns an item", () =>
    Effect.gen(function*() {
      const count = yield* Ref.make(0)
      const get = Effect.acquireRelease(
        Ref.updateAndGet(count, (n) => n + 1),
        () => Ref.update(count, (n) => n - 1)
      )
      const pool = yield* Pool.make({ acquire: get, size: 2 })
      yield* Effect.repeat(Ref.get(count), { until: (n) => n === 2 })
      const results: Array<number> = []
      yield* Effect.repeat(
        Effect.tap(Pool.use(pool, (item) => Effect.succeed(item)), (item) =>
          Effect.sync(() => {
            results.push(item)
          })),
        { times: 9 }
      )
      // A borrow takes the item used most recently, so a sequence of them
      // stays on one item and leaves the other free to be reclaimed. Spreading
      // over both would leave neither warm and neither ever idle.
      deepStrictEqual(results, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1])
      strictEqual(yield* Ref.get(count), 2)
    }))

  it.effect("use releases the item on failure", () =>
    Effect.gen(function*() {
      const pool = yield* Pool.make({ acquire: Effect.succeed("resource"), size: 1 })
      const failure = yield* Effect.flip(Pool.use(pool, () => Effect.fail("boom")))
      strictEqual(failure, "boom")
      strictEqual(yield* Pool.use(pool, (item) => Effect.succeed(item)), "resource")
    }))

  it.effect("use releases the item on interruption", () =>
    Effect.gen(function*() {
      const started = yield* Deferred.make<void>()
      const pool = yield* Pool.make({ acquire: Effect.succeed("resource"), size: 1 })
      const fiber = yield* Effect.forkChild(
        Pool.use(pool, () => Effect.andThen(Deferred.succeed(started, void 0), Effect.never)),
        { startImmediately: true }
      )
      yield* Deferred.await(started)
      yield* Fiber.interrupt(fiber)
      strictEqual(yield* Pool.use(pool, (item) => Effect.succeed(item)), "resource")
    }))

  it.effect("an interrupted use returns its lease", () =>
    Effect.gen(function*() {
      for (let budget = 2; budget <= 10; budget++) {
        const pool = yield* Pool.make({ acquire: Effect.succeed("resource"), size: 1 })
        const fiber = yield* Effect.forkChild(
          Pool.use(pool, () => Effect.never).pipe(Effect.provideService(Scheduler.MaxOpsBeforeYield, budget)),
          { startImmediately: true }
        )
        yield* Fiber.interrupt(fiber)
        strictEqual(pool.state.usage, 0, `MaxOpsBeforeYield ${budget}`)
        const next = yield* Effect.forkChild(Pool.use(pool, Effect.succeed), { startImmediately: true })
        assert.isDefined(next.pollUnsafe(), `MaxOpsBeforeYield ${budget}`)
      }
    }))

  it.effect("use waits for an available item", () =>
    Effect.gen(function*() {
      const pool = yield* Pool.make({ acquire: Effect.succeed("resource"), size: 1 })
      const scope = yield* Scope.make()
      yield* Scope.provide(Pool.get(pool), scope)
      const fiber = yield* Effect.forkChild(
        Pool.use(pool, (item) => Effect.succeed(item)),
        { startImmediately: true }
      )
      assert.isUndefined(fiber.pollUnsafe())
      yield* Scope.close(scope, Exit.void)
      strictEqual(yield* Fiber.join(fiber), "resource")
      strictEqual(pool.state.usage, 0)
    }))

  it.effect("use reports acquire failures", () =>
    Effect.gen(function*() {
      const pool = yield* Pool.makeWithTTL({
        acquire: Effect.fail("nope"),
        min: 0,
        max: 1,
        timeToLive: Duration.infinity
      })
      const failure = yield* Effect.flip(Pool.use(pool, () => Effect.void))
      strictEqual(failure, "nope")
      strictEqual(pool.state.usage, 0)
    }))

  it.effect("finalizer is called for failed allocations", () =>
    Effect.gen(function*() {
      const scope = yield* Scope.make()
      const allocations = yield* Ref.make(0)
      const released = yield* Ref.make(0)
      const get = Effect.acquireRelease(
        Ref.updateAndGet(allocations, (n) => n + 1),
        () => Ref.update(released, (n) => n + 1)
      ).pipe(
        Effect.flatMap((n) => n <= 10 ? Effect.fail("boom") : Effect.succeed(n))
      )
      const pool = yield* Pool.make({ acquire: get, size: 10 }).pipe(
        Scope.provide(scope)
      )
      yield* Effect.repeat(Ref.get(released), { until: (n) => n === 10 })
      strictEqual(yield* Effect.scoped(Pool.get(pool)), 11)
      strictEqual(yield* Ref.get(allocations), 11)
      strictEqual(yield* Ref.get(released), 10)
      yield* Scope.close(scope, Exit.void)
    }))
  it.effect("runs strategy callbacks for a replacement before failed background cleanup", () =>
    Effect.gen(function*() {
      const cleanupStarted = yield* Deferred.make<void>()
      const resumeCleanup = yield* Deferred.make<void>()
      const replacementAcquired = yield* Deferred.make<void>()
      let acquired = 0
      let callbacks = 0
      const pool = yield* Pool.makeWithStrategy({
        acquire: Effect.gen(function*() {
          if (++acquired > 1) return "replacement"
          yield* Effect.addFinalizer(() =>
            Effect.andThen(
              Deferred.succeed(cleanupStarted, undefined),
              Deferred.await(resumeCleanup)
            )
          )
          return yield* Effect.fail("boom")
        }),
        min: 1,
        max: 2,
        strategy: {
          run: () => Effect.void,
          reclaim: () => Effect.undefined,
          onAcquire: (item) =>
            Effect.gen(function*() {
              callbacks++
              if (Exit.isSuccess(item.exit)) yield* Deferred.succeed(replacementAcquired, undefined)
            })
        }
      })
      yield* Effect.addFinalizer(() => Deferred.succeed(resumeCleanup, undefined))
      yield* Deferred.await(cleanupStarted)
      strictEqual(yield* Effect.scoped(Pool.get(pool)), "replacement")
      yield* Effect.yieldNow
      strictEqual(yield* Deferred.isDone(replacementAcquired), true)
      strictEqual(acquired, 2)
      strictEqual(callbacks, 1)
      yield* Deferred.succeed(resumeCleanup, undefined)
    }))

  it.effect("admits one waiter per released lease", () =>
    Effect.gen(function*() {
      const acquired = yield* Ref.make(0)
      const pool = yield* Pool.makeWithTTL({
        acquire: Effect.succeed("item"),
        min: 0,
        max: 1,
        concurrency: 4,
        timeToLive: Duration.seconds(60)
      })
      const release = yield* Deferred.make<void>()
      const lease = Effect.scoped(Effect.andThen(
        Pool.get(pool),
        Effect.andThen(Ref.update(acquired, (n) => n + 1), Deferred.await(release))
      ))

      // Four leases saturate the only item; four more have to wait.
      const fibers = yield* Effect.all(
        Array.from({ length: 8 }, () => Effect.forkChild(lease, { startImmediately: true }))
      )
      yield* Effect.repeat(Ref.get(acquired), { until: (n) => n === 4 })

      // Releasing all four at once has to admit all four waiters. Reacting only
      // to the transition out of saturation wakes one and leaves three asleep
      // against an item that has room for them.
      yield* Deferred.succeed(release, undefined)
      yield* Effect.all(fibers.map(Fiber.join))
      strictEqual(yield* Ref.get(acquired), 8)
      strictEqual(pool.state.usage, 0)
    }))

  describe.skipIf(process.versions.bun !== undefined || process.versions.deno !== undefined)(
    "usage TTL retention",
    () => {
      it.effect("releases invalidated resources while at minimum size", () =>
        Effect.gen(function*() {
          const references: Array<WeakRef<object>> = []
          const control = new WeakRef({})
          let finalized = 0
          const pool = yield* Pool.makeWithTTL({
            acquire: Effect.acquireRelease(
              Effect.sync(() => ({})),
              () =>
                Effect.sync(() => {
                  finalized++
                })
            ),
            min: 1,
            max: 2,
            timeToLive: "1 hour"
          })
          for (let i = 0; i < 2; i++) {
            yield* Effect.scoped(Effect.gen(function*() {
              const value = yield* Pool.get(pool)
              references.push(new WeakRef(value))
              yield* Pool.invalidate(pool, value)
            }))
          }
          strictEqual(finalized, 2)
          yield* collectGarbage
          assert.isUndefined(control.deref())
          for (const reference of references) assert.isUndefined(reference.deref())
          strictEqual(pool.state.items.size, 1)
        }))

      it.effect("releases consumed acquisition failures", () =>
        Effect.gen(function*() {
          const references: Array<WeakRef<object>> = []
          const control = new WeakRef({})
          const pool = yield* Pool.makeWithTTL({
            acquire: Effect.suspend(() => {
              const error = {}
              references.push(new WeakRef(error))
              return Effect.fail(error)
            }),
            min: 0,
            max: 2,
            timeToLive: "1 hour"
          })
          for (let i = 0; i < 2; i++) {
            assert.isTrue(Exit.isFailure(yield* Effect.exit(Effect.scoped(Pool.get(pool)))))
          }
          assert.lengthOf(references, 2)
          yield* collectGarbage
          assert.isUndefined(control.deref())
          for (const reference of references) assert.isUndefined(reference.deref())
          strictEqual(pool.state.items.size, 0)
        }))

      it.effect("retries background failures during asynchronous cleanup without requeueing them", () =>
        Effect.gen(function*() {
          const references: Array<WeakRef<object>> = []
          const control = new WeakRef({})
          const cleanupStarted = yield* Deferred.make<void>()
          const resumeCleanup = yield* Deferred.make<void>()
          let acquired = 0
          let finalized = 0
          const pool = yield* Pool.makeWithTTL({
            acquire: Effect.gen(function*() {
              if (++acquired > 1) return "replacement"
              yield* Effect.addFinalizer(() =>
                Effect.gen(function*() {
                  yield* Deferred.succeed(cleanupStarted, undefined)
                  yield* Deferred.await(resumeCleanup)
                  finalized++
                })
              )
              const error = {}
              references.push(new WeakRef(error))
              return yield* Effect.fail(error)
            }),
            min: 1,
            max: 2,
            timeToLive: "1 hour"
          })
          yield* Effect.addFinalizer(() => Deferred.succeed(resumeCleanup, undefined))
          yield* Deferred.await(cleanupStarted)
          strictEqual(yield* Effect.scoped(Pool.get(pool)), "replacement")
          strictEqual(finalized, 0)
          yield* Deferred.succeed(resumeCleanup, undefined)
          strictEqual(acquired, 2)
          strictEqual(finalized, 1)
          assert.lengthOf(references, 1)
          yield* collectGarbage
          assert.isUndefined(control.deref())
          assert.isUndefined(references[0].deref())
          strictEqual(pool.state.items.size, 1)
        }))

      it.effect("releases resources after shutdown while the pool remains reachable", () =>
        Effect.gen(function*() {
          const references: Array<WeakRef<object>> = []
          const control = new WeakRef({})
          let finalized = 0
          const scope = yield* Scope.fork(yield* Effect.scope)
          const pool = yield* Pool.makeWithTTL({
            acquire: Effect.acquireRelease(
              Effect.sync(() => ({})),
              () =>
                Effect.sync(() => {
                  finalized++
                })
            ),
            min: 1,
            max: 2,
            timeToLive: "1 hour"
          }).pipe(Scope.provide(scope))
          yield* Pool.use(pool, (value) =>
            Effect.sync(() => {
              references.push(new WeakRef(value))
            }))
          yield* Scope.close(scope, Exit.void)
          strictEqual(finalized, 1)
          assert.lengthOf(references, 1)
          yield* collectGarbage
          assert.isUndefined(control.deref())
          assert.isUndefined(references[0].deref())
          strictEqual(pool.state.items.size, 0)
        }))
    }
  )

  it.effect("invalidating a busy item waits for its last lease and finalizes once", () =>
    Effect.gen(function*() {
      const finalized: Array<number> = []
      let acquired = 0
      yield* Effect.scoped(Effect.gen(function*() {
        const pool = yield* Pool.makeWithTTL({
          acquire: Effect.acquireRelease(
            Effect.sync(() => ++acquired),
            (value) =>
              Effect.sync(() => {
                finalized.push(value)
              })
          ),
          min: 1,
          max: 2,
          concurrency: 2,
          timeToLive: "1 hour"
        })
        const first = yield* Scope.fork(yield* Effect.scope)
        const second = yield* Scope.fork(yield* Effect.scope)
        const value = yield* Scope.provide(Pool.get(pool), first)
        strictEqual(yield* Scope.provide(Pool.get(pool), second), value)
        yield* Pool.invalidate(pool, value)
        deepStrictEqual(finalized, [])
        yield* Scope.close(first, Exit.void)
        deepStrictEqual(finalized, [])
        yield* Scope.close(second, Exit.void)
        deepStrictEqual(finalized, [value])
        strictEqual(yield* Effect.scoped(Pool.get(pool)), 2)
      }))
      deepStrictEqual(finalized, [1, 2])
    }))

  for (const [removal, removed] of [["no", undefined], ["middle", 2], ["tail", 3]] as const) {
    it.effect(`usage TTL preserves FIFO retirement and minimum size after ${removal} removal`, () =>
      Effect.gen(function*() {
        let acquired = 0
        const finalized: Array<number> = []
        const pool = yield* Pool.makeWithTTL({
          acquire: Effect.acquireRelease(
            Effect.sync(() => ++acquired),
            (value) =>
              Effect.sync(() => {
                finalized.push(value)
              })
          ),
          min: 1,
          max: 3,
          timeToLive: "1 second"
        })
        yield* Effect.scoped(Effect.gen(function*() {
          for (let i = 0; i < 3; i++) yield* Pool.get(pool)
          strictEqual(acquired, 3)
        }))
        if (removed !== undefined) {
          yield* Pool.invalidate(pool, removed)
          deepStrictEqual(finalized, [removed])
          yield* Effect.scoped(Effect.gen(function*() {
            for (let i = 0; i < 3; i++) yield* Pool.get(pool)
            strictEqual(acquired, 4)
          }))
        }
        const expected = removed === undefined ? [1, 2] : [removed, ...[1, 2, 3].filter((n) => n !== removed)]
        yield* TestClock.adjust("1 second")
        deepStrictEqual(finalized, expected)
        yield* TestClock.adjust("5 seconds")
        deepStrictEqual(finalized, expected)
        strictEqual(pool.state.items.size, 1)
        strictEqual(yield* Effect.scoped(Pool.get(pool)), removed === undefined ? 3 : 4)
        if (removed !== undefined) {
          yield* Effect.scoped(Effect.gen(function*() {
            for (let i = 0; i < 3; i++) yield* Pool.get(pool)
            strictEqual(acquired, 6)
          }))
          yield* TestClock.adjust("1 second")
          deepStrictEqual(finalized, [...expected, 4, 5])
          strictEqual(pool.state.items.size, 1)
          strictEqual(yield* Effect.scoped(Pool.get(pool)), 6)
        }
      }))
  }
})
