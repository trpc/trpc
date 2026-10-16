import { assert, describe, it } from "@effect/vitest"
import { Array, Effect, Exit, Fiber, Latch, MutableList, PubSub, Scheduler, Scope, Stream } from "effect"
import { pipe } from "effect/Function"

describe("PubSub", () => {
  it.effect("isPubSub type guard", () =>
    Effect.gen(function*() {
      const pubsub = yield* PubSub.bounded<string>(10)

      assert.isTrue(PubSub.isPubSub(pubsub))
      assert.isFalse(PubSub.isPubSub({}))
      assert.isFalse(PubSub.isPubSub(null))
    }))

  for (const batch of [false, true]) {
    it.effect.each([1, 2, 3])(
      `sliding capacity %s delivers each retained message once per subscriber (batch: ${batch})`,
      (capacity) =>
        Effect.gen(function*() {
          const pubsub = yield* PubSub.sliding<number>(capacity)
          const first = yield* PubSub.subscribe(pubsub)
          const second = yield* PubSub.subscribe(pubsub)
          const values = Array.range(1, capacity + 2)
          const retained = values.slice(-capacity)
          yield* PubSub.publishAll(pubsub, values)

          const received = batch
            ? yield* PubSub.takeAll(first)
            : yield* Effect.forEach(retained, () => PubSub.take(first))
          const duplicate = yield* PubSub.takeUpTo(first, capacity)
          const other = yield* PubSub.takeUpTo(second, capacity)

          assert.deepStrictEqual([received, duplicate, other], [retained, [], retained])
        })
    )
  }

  it.effect.each([1, 2, 3])(
    "unsubscribing after a slide preserves the other subscriber's messages (capacity: %s)",
    (capacity) =>
      Effect.gen(function*() {
        const pubsub = yield* PubSub.sliding<number>(capacity)
        const scope = yield* Scope.make()
        const first = yield* PubSub.subscribe(pubsub).pipe(Scope.provide(scope))
        const second = yield* PubSub.subscribe(pubsub)
        const values = Array.range(1, capacity + 2)
        const retained = values.slice(-capacity)
        yield* PubSub.publishAll(pubsub, values)
        yield* PubSub.takeAll(first)
        yield* Scope.close(scope, Exit.void)

        assert.deepStrictEqual(yield* PubSub.takeUpTo(second, capacity), retained)
      })
  )

  it.effect("publishAll - capacity 2 (BoundedPubSubPow2)", () => {
    const messages = [1, 2]
    return PubSub.bounded<number>(2).pipe(
      Effect.flatMap((pubsub) =>
        Effect.scoped(
          Effect.gen(function*() {
            const sub1 = yield* PubSub.subscribe(pubsub)
            const sub2 = yield* PubSub.subscribe(pubsub)
            yield* PubSub.publishAll(pubsub, messages)
            const takes1 = yield* PubSub.takeAll(sub1)
            const takes2 = yield* PubSub.takeAll(sub2)
            assert.deepStrictEqual(takes1, messages)
            assert.deepStrictEqual(takes2, messages)
          })
        )
      )
    )
  })
  it.effect("publishAll - capacity 4 (BoundedPubSubPow2)", () => {
    const messages = [1, 2]
    return PubSub.bounded<number>(4).pipe(
      Effect.flatMap((pubsub) =>
        Effect.scoped(
          Effect.gen(function*() {
            const sub1 = yield* PubSub.subscribe(pubsub)
            const sub2 = yield* PubSub.subscribe(pubsub)
            yield* PubSub.publishAll(pubsub, messages)
            const takes1 = yield* PubSub.takeAll(sub1)
            const takes2 = yield* PubSub.takeAll(sub2)
            assert.deepStrictEqual(takes1, messages)
            assert.deepStrictEqual(takes2, messages)
          })
        )
      )
    )
  })
  it.effect("publishAll - capacity 3 (BoundedPubSubArb)", () => {
    const messages = [1, 2]
    return PubSub.bounded<number>(3).pipe(
      Effect.flatMap((pubsub) =>
        Effect.scoped(
          Effect.gen(function*() {
            const sub1 = yield* PubSub.subscribe(pubsub)
            const sub2 = yield* PubSub.subscribe(pubsub)
            yield* PubSub.publishAll(pubsub, messages)
            const takes1 = yield* PubSub.takeAll(sub1)
            const takes2 = yield* PubSub.takeAll(sub2)
            assert.deepStrictEqual(takes1, messages)
            assert.deepStrictEqual(takes2, messages)
          })
        )
      )
    )
  })
  it.effect("sequential publishers and subscribers with one publisher and one subscriber", () =>
    Effect.gen(function*() {
      const values = Array.range(0, 9)
      const latch = yield* Latch.make()
      const pubsub = yield* PubSub.bounded<number>(10)
      const subscriber = yield* PubSub.subscribe(pubsub).pipe(
        Effect.flatMap((subscription) =>
          latch.await.pipe(
            Effect.andThen(Effect.forEach(values, () => PubSub.take(subscription)))
          )
        ),
        Effect.scoped,
        Effect.forkChild({ startImmediately: true })
      )
      yield* PubSub.publishAll(pubsub, values)
      yield* latch.open
      const result = yield* Fiber.join(subscriber)
      assert.deepStrictEqual(result, values)
    }))
  it.effect("sequential publishers and subscribers with one publisher and two subscribers", () =>
    Effect.gen(function*() {
      const values = Array.range(0, 9)
      const latch = yield* Latch.make()
      const pubsub = yield* PubSub.bounded<number>(10)
      const subscriber1 = yield* pubsub.pipe(
        PubSub.subscribe,
        Effect.flatMap((subscription) =>
          pipe(
            latch.await,
            Effect.andThen(pipe(values, Effect.forEach(() => PubSub.take(subscription))))
          )
        ),
        Effect.scoped,
        Effect.forkChild({ startImmediately: true })
      )
      const subscriber2 = yield* pubsub.pipe(
        PubSub.subscribe,
        Effect.flatMap((subscription) =>
          pipe(
            latch.await,
            Effect.andThen(pipe(values, Effect.forEach(() => PubSub.take(subscription))))
          )
        ),
        Effect.scoped,
        Effect.forkChild({ startImmediately: true })
      )
      yield* PubSub.publishAll(pubsub, values)
      yield* latch.open
      const result1 = yield* Fiber.join(subscriber1)
      const result2 = yield* Fiber.join(subscriber2)
      assert.deepStrictEqual(result1, values)
      assert.deepStrictEqual(result2, values)
    }))
  it.effect("backpressured concurrent publishers and subscribers - one to one", () =>
    Effect.gen(function*() {
      const values = Array.range(0, 64)
      const pubsub = yield* PubSub.bounded<number>(64)
      const subscriber = yield* PubSub.subscribe(pubsub).pipe(
        Effect.flatMap((subscription) => Effect.forEach(values, (_) => PubSub.take(subscription))),
        Effect.scoped,
        Effect.forkChild({ startImmediately: true })
      )
      yield* Effect.forkChild(PubSub.publishAll(pubsub, values))
      const result = yield* Fiber.join(subscriber)
      assert.deepStrictEqual(result, values)
    }))
  it.effect("backpressured concurrent publishers and subscribers - one to many", () =>
    Effect.gen(function*() {
      const values = Array.range(0, 64)
      const pubsub = yield* PubSub.bounded<number>(64)
      const subscriber1 = yield* PubSub.subscribe(pubsub).pipe(
        Effect.flatMap((subscription) => Effect.forEach(values, (_) => PubSub.take(subscription))),
        Effect.scoped,
        Effect.forkChild({ startImmediately: true })
      )
      const subscriber2 = yield* PubSub.subscribe(pubsub).pipe(
        Effect.flatMap((subscription) => Effect.forEach(values, (_) => PubSub.take(subscription))),
        Effect.scoped,
        Effect.forkChild({ startImmediately: true })
      )
      yield* Effect.forkChild(PubSub.publishAll(pubsub, values))
      const result1 = yield* Fiber.join(subscriber1)
      const result2 = yield* Fiber.join(subscriber2)
      assert.deepStrictEqual(result1, values)
      assert.deepStrictEqual(result2, values)
    }))
  it.effect("backpressured concurrent publishers and subscribers - many to many", () =>
    Effect.gen(function*() {
      const values = Array.range(1, 64)
      const pubsub = yield* PubSub.bounded<number>(64 * 2)
      const subscriber1 = yield* PubSub.subscribe(pubsub).pipe(
        Effect.flatMap((subscription) => Effect.forEach(values.concat(values), (_) => PubSub.take(subscription))),
        Effect.scoped,
        Effect.forkChild({ startImmediately: true })
      )
      const subscriber2 = yield* PubSub.subscribe(pubsub).pipe(
        Effect.flatMap((subscription) => Effect.forEach(values.concat(values), (_) => PubSub.take(subscription))),
        Effect.scoped,
        Effect.forkChild({ startImmediately: true })
      )
      const fiber = yield* Effect.forkChild(PubSub.publishAll(pubsub, values))
      yield* Effect.forkChild(PubSub.publishAll(pubsub, Array.map(values, (n) => -n)))
      const result1 = yield* Fiber.join(subscriber1)
      const result2 = yield* Fiber.join(subscriber2)
      yield* Fiber.join(fiber)
      assert.deepStrictEqual(Array.filter(result1, (n) => n > 0), values)
      assert.deepStrictEqual(
        Array.filter(result1, (n) => n < 0),
        Array.map(values, (n) => -n)
      )
      assert.deepStrictEqual(Array.filter(result2, (n) => n > 0), values)
      assert.deepStrictEqual(
        Array.filter(result2, (n) => n < 0),
        Array.map(values, (n) => -n)
      )
    }))
  it.effect("dropping concurrent publishers and subscribers - one to one", () =>
    Effect.gen(function*() {
      const values = Array.range(0, 64)
      const pubsub = yield* PubSub.dropping<number>(64)
      const subscriber = yield* PubSub.subscribe(pubsub).pipe(
        Effect.flatMap((subscription) => Effect.forEach(values, (_) => PubSub.take(subscription))),
        Effect.scoped,
        Effect.forkChild({ startImmediately: true })
      )
      yield* Effect.forkChild(Effect.forEach(values, (n) => PubSub.publish(pubsub, n)))
      const result = yield* Fiber.join(subscriber)
      assert.deepStrictEqual(result, values)
    }))
  it.effect("dropping concurrent publishers and subscribers - one to many", () =>
    Effect.gen(function*() {
      const values = Array.range(0, 64)
      const pubsub = yield* PubSub.dropping<number>(64)
      const subscriber1 = yield* PubSub.subscribe(pubsub).pipe(
        Effect.flatMap((subscription) => Effect.forEach(values, (_) => PubSub.take(subscription))),
        Effect.scoped,
        Effect.forkChild({ startImmediately: true })
      )
      const subscriber2 = yield* PubSub.subscribe(pubsub).pipe(
        Effect.flatMap((subscription) => Effect.forEach(values, (_) => PubSub.take(subscription))),
        Effect.scoped,
        Effect.forkChild({ startImmediately: true })
      )
      yield* Effect.forkChild(Effect.forEach(values, (n) => PubSub.publish(pubsub, n)))
      const result1 = yield* Fiber.join(subscriber1)
      const result2 = yield* Fiber.join(subscriber2)
      assert.deepStrictEqual(result1, values)
      assert.deepStrictEqual(result2, values)
    }))
  it.effect("dropping concurrent publishers and subscribers - many to many", () =>
    Effect.gen(function*() {
      const values = Array.range(1, 64)
      const pubsub = yield* PubSub.dropping<number>(64 * 2)
      const subscriber1 = yield* PubSub.subscribe(pubsub).pipe(
        Effect.flatMap((subscription) => Effect.forEach(values.concat(values), (_) => PubSub.take(subscription))),
        Effect.scoped,
        Effect.forkChild({ startImmediately: true })
      )
      const subscriber2 = yield* PubSub.subscribe(pubsub).pipe(
        Effect.flatMap((subscription) => Effect.forEach(values.concat(values), (_) => PubSub.take(subscription))),
        Effect.scoped,
        Effect.forkChild({ startImmediately: true })
      )
      const fiber = yield* Effect.forkChild(Effect.forEach(values, (n) => PubSub.publish(pubsub, n)))
      yield* Effect.forkChild(Effect.forEach(values, (n) => PubSub.publish(pubsub, -n)))
      const result1 = yield* Fiber.join(subscriber1)
      const result2 = yield* Fiber.join(subscriber2)
      yield* Fiber.join(fiber)
      assert.deepStrictEqual(pipe(result1, Array.filter((n) => n > 0)), values)
      assert.deepStrictEqual(
        pipe(result1, Array.filter((n) => n < 0)),
        pipe(values, Array.map((n) => -n))
      )
      assert.deepStrictEqual(pipe(result2, Array.filter((n) => n > 0)), values)
      assert.deepStrictEqual(
        pipe(result2, Array.filter((n) => n < 0)),
        pipe(values, Array.map((n) => -n))
      )
    }))
  it.effect("sliding concurrent publishers and subscribers - one to one", () =>
    Effect.gen(function*() {
      const values = Array.range(0, 64)
      const pubsub = yield* PubSub.sliding<number>(64)
      const subscriber = yield* PubSub.subscribe(pubsub).pipe(
        Effect.flatMap((subscription) => Effect.forEach(values, (_) => PubSub.take(subscription))),
        Effect.scoped,
        Effect.forkChild({ startImmediately: true })
      )
      yield* Effect.forkChild(Effect.forEach(values, (n) => PubSub.publish(pubsub, n)))
      const result = yield* Fiber.join(subscriber)
      assert.deepStrictEqual(result, values)
    }))
  it.effect("sliding concurrent publishers and subscribers - one to many", () =>
    Effect.gen(function*() {
      const values = Array.range(0, 64)
      const pubsub = yield* PubSub.sliding<number>(64)
      const subscriber1 = yield* PubSub.subscribe(pubsub).pipe(
        Effect.flatMap((subscription) => Effect.forEach(values, (_) => PubSub.take(subscription))),
        Effect.scoped,
        Effect.forkChild({ startImmediately: true })
      )
      const subscriber2 = yield* PubSub.subscribe(pubsub).pipe(
        Effect.flatMap((subscription) => Effect.forEach(values, (_) => PubSub.take(subscription))),
        Effect.scoped,
        Effect.forkChild({ startImmediately: true })
      )
      yield* Effect.forkChild(PubSub.publishAll(pubsub, values))
      const result1 = yield* Fiber.join(subscriber1)
      const result2 = yield* Fiber.join(subscriber2)
      assert.deepStrictEqual(result1, values)
      assert.deepStrictEqual(result2, values)
    }))
  it.effect("sliding concurrent publishers and subscribers - many to many", () =>
    Effect.gen(function*() {
      const values = Array.range(1, 64)
      const pubsub = yield* PubSub.sliding<number>(64 * 2)
      const subscriber1 = yield* PubSub.subscribe(pubsub).pipe(
        Effect.flatMap((subscription) => Effect.forEach(values.concat(values), (_) => PubSub.take(subscription))),
        Effect.scoped,
        Effect.forkChild({ startImmediately: true })
      )
      const subscriber2 = yield* PubSub.subscribe(pubsub).pipe(
        Effect.flatMap((subscription) => Effect.forEach(values.concat(values), (_) => PubSub.take(subscription))),
        Effect.scoped,
        Effect.forkChild({ startImmediately: true })
      )
      const fiber = yield* Effect.forkChild(PubSub.publishAll(pubsub, values))
      yield* Effect.forkChild(PubSub.publishAll(pubsub, Array.map(values, (n) => -n)))
      const result1 = yield* Fiber.join(subscriber1)
      const result2 = yield* Fiber.join(subscriber2)
      yield* Fiber.join(fiber)
      assert.deepStrictEqual(pipe(result1, Array.filter((n) => n > 0)), values)
      assert.deepStrictEqual(
        pipe(result1, Array.filter((n) => n < 0)),
        pipe(values, Array.map((n) => -n))
      )
      assert.deepStrictEqual(pipe(result2, Array.filter((n) => n > 0)), values)
      assert.deepStrictEqual(
        pipe(result2, Array.filter((n) => n < 0)),
        pipe(values, Array.map((n) => -n))
      )
    }))
  it.effect("unbounded concurrent publishers and subscribers - one to one", () =>
    Effect.gen(function*() {
      const values = Array.range(0, 64)
      const pubsub = yield* PubSub.unbounded<number>()
      const subscriber = yield* PubSub.subscribe(pubsub).pipe(
        Effect.flatMap((subscription) => Effect.forEach(values, (_) => PubSub.take(subscription))),
        Effect.scoped,
        Effect.forkChild({ startImmediately: true })
      )
      yield* Effect.forkChild(PubSub.publishAll(pubsub, values))

      const result = yield* Fiber.join(subscriber)
      assert.deepStrictEqual(result, values)
    }))
  it.effect("unbounded concurrent publishers and subscribers - one to many", () =>
    Effect.gen(function*() {
      const values = Array.range(0, 64)
      const pubsub = yield* PubSub.unbounded<number>()
      const subscriber1 = yield* PubSub.subscribe(pubsub).pipe(
        Effect.flatMap((subscription) => Effect.forEach(values, (_) => PubSub.take(subscription))),
        Effect.scoped,
        Effect.forkChild({ startImmediately: true })
      )
      const subscriber2 = yield* PubSub.subscribe(pubsub).pipe(
        Effect.flatMap((subscription) => Effect.forEach(values, (_) => PubSub.take(subscription))),
        Effect.scoped,
        Effect.forkChild({ startImmediately: true })
      )
      yield* Effect.forkChild(PubSub.publishAll(pubsub, values))
      const result1 = yield* Fiber.join(subscriber1)
      const result2 = yield* Fiber.join(subscriber2)
      assert.deepStrictEqual(result1, values)
      assert.deepStrictEqual(result2, values)
    }))
  it.effect("unbounded concurrent publishers and subscribers - many to many", () =>
    Effect.gen(function*() {
      const values = Array.range(1, 64)
      const pubsub = yield* PubSub.unbounded<number>()
      const subscriber1 = yield* PubSub.subscribe(pubsub).pipe(
        Effect.flatMap((subscription) => Effect.forEach(values.concat(values), (_) => PubSub.take(subscription))),
        Effect.scoped,
        Effect.forkChild({ startImmediately: true })
      )

      const subscriber2 = yield* PubSub.subscribe(pubsub).pipe(
        Effect.flatMap((subscription) => Effect.forEach(values.concat(values), (_) => PubSub.take(subscription))),
        Effect.scoped,
        Effect.forkChild({ startImmediately: true })
      )
      const fiber = yield* Effect.forkChild(PubSub.publishAll(pubsub, values))
      yield* Effect.forkChild(PubSub.publishAll(pubsub, Array.map(values, (n) => -n)))
      const result1 = yield* Fiber.join(subscriber1)
      const result2 = yield* Fiber.join(subscriber2)
      yield* Fiber.join(fiber)
      assert.deepStrictEqual(Array.filter(result1, (n) => n > 0), values)
      assert.deepStrictEqual(
        Array.filter(result1, (n) => n < 0),
        Array.map(values, (n) => -n)
      )
      assert.deepStrictEqual(Array.filter(result2, (n) => n > 0), values)
      assert.deepStrictEqual(
        Array.filter(result2, (n) => n < 0),
        Array.map(values, (n) => -n)
      )
    }))

  it.effect("infinite capacity behaves as unbounded", () =>
    Effect.gen(function*() {
      const values = Array.range(0, 64)
      for (const make of [PubSub.bounded, PubSub.dropping, PubSub.sliding]) {
        const pubsub = yield* make<number>({ capacity: Infinity, replay: 2 })
        const subscription = yield* PubSub.subscribe(pubsub)
        yield* PubSub.publishAll(pubsub, values)
        assert.deepStrictEqual(yield* PubSub.takeAll(subscription), values)
        const late = yield* PubSub.subscribe(pubsub)
        assert.deepStrictEqual(yield* PubSub.takeAll(late), [63, 64])
      }
    }))

  it.effect("null values", () => {
    const messages = [1, null]
    return PubSub.unbounded<number | null>().pipe(
      Effect.flatMap((pubsub) =>
        Effect.scoped(
          Effect.gen(function*() {
            const sub1 = yield* PubSub.subscribe(pubsub)
            const sub2 = yield* PubSub.subscribe(pubsub)
            yield* PubSub.publishAll(pubsub, messages)
            const takes1 = yield* PubSub.takeAll(sub1)
            const takes2 = yield* PubSub.takeAll(sub2)
            assert.deepStrictEqual([...takes1], messages)
            assert.deepStrictEqual([...takes2], messages)
          })
        )
      )
    )
  })

  it.effect("publish does not increase size while no subscribers", () =>
    Effect.gen(function*() {
      const pubsub = yield* PubSub.dropping<number>(2)
      yield* PubSub.publish(pubsub, 1)
      yield* PubSub.publish(pubsub, 2)
      assert.deepStrictEqual(PubSub.sizeUnsafe(pubsub), 0)
    }))

  it.effect("publishAll does not increase size while no subscribers", () =>
    Effect.gen(function*() {
      const pubsub = yield* PubSub.dropping<number>(2)
      yield* PubSub.publishAll(pubsub, [1, 2])
      assert.deepStrictEqual(PubSub.sizeUnsafe(pubsub), 0)
    }))

  it("normalizes low-level polling and replay counts", () => {
    const implementations = [
      PubSub.makeAtomicBounded<number>(1),
      PubSub.makeAtomicBounded<number>(3),
      PubSub.makeAtomicBounded<number>(4),
      PubSub.makeAtomicUnbounded<number>()
    ]

    for (const pubsub of implementations) {
      const subscription = pubsub.subscribe()
      pubsub.publishAll([1, 2, 3])
      assert.deepStrictEqual(subscription.pollUpTo(1.9), [1])
      assert.deepStrictEqual(subscription.pollUpTo(Number.NaN), [])
    }

    const replayPubSub = PubSub.makeAtomicUnbounded<number>({ replay: 3 })
    replayPubSub.publishAll([1, 2, 3])
    const replay = replayPubSub.replayWindow()
    assert.deepStrictEqual(replay.takeN(1.9), [1])
    assert.deepStrictEqual(replay.takeN(Number.NaN), [])
    assert.deepStrictEqual(replay.takeAll(), [2, 3])
  })

  it("polls MutableList.Empty as a value", () => {
    const pubsub = PubSub.makeAtomicBounded<symbol>(1)
    const subscription = pubsub.subscribe()
    pubsub.publish(MutableList.Empty)

    assert.deepStrictEqual(subscription.pollUpTo(1), [MutableList.Empty])
  })

  it("publishes after a capacity-one subscriber unsubscribes from a slid message", () => {
    const pubsub = PubSub.makeAtomicBounded<number>(1)
    const subscription = pubsub.subscribe()
    pubsub.publish(1)
    pubsub.slide()
    subscription.unsubscribe()

    const next = pubsub.subscribe()
    assert.isTrue(pubsub.publish(2))
    assert.strictEqual(pubsub.size(), 1)
    assert.deepStrictEqual(next.pollUpTo(1), [2])
  })

  describe("replay", () => {
    it("does not retain values published after the replay window is drained", () => {
      const pubsub = PubSub.makeAtomicUnbounded<object>({ replay: 1 })
      pubsub.publish({})
      const replayWindow = pubsub.replayWindow()
      replayWindow.take()

      const slidOut = {}
      pubsub.publish(slidOut)
      pubsub.publish({})

      assert.isFalse(retains(replayWindow, slidOut))
    })

    it("does not retain values published outside an undrained replay window", () => {
      const pubsub = PubSub.makeAtomicUnbounded<object>({ replay: 1 })
      const replayed = {}
      pubsub.publish(replayed)
      const replayWindow = pubsub.replayWindow()

      const slidOut = {}
      pubsub.publish(slidOut)
      pubsub.publish({})

      assert.isFalse(retains(replayWindow, slidOut))
      assert.strictEqual(replayWindow.take(), replayed)
    })

    it("preserves replay order across multiple slides", () => {
      const pubsub = PubSub.makeAtomicBounded<number>({ capacity: 4, replay: 3 })
      pubsub.publishAll([1, 2, 3, 4, 5])
      const subscription = pubsub.subscribe()
      const replayWindow = pubsub.replayWindow()
      pubsub.publishAll([6, 7, 8, 9])
      for (const value of [10, 11, 12]) {
        pubsub.slide()
        pubsub.publish(value)
      }

      assert.deepStrictEqual(replayWindow.takeAll(), [6, 7, 8])
      assert.deepStrictEqual(subscription.pollUpTo(Number.POSITIVE_INFINITY), [9, 10, 11, 12])
    })

    it.effect("unbounded", () =>
      Effect.gen(function*() {
        const messages = [1, 2, 3, 4, 5]
        const pubsub = yield* PubSub.unbounded<number>({ replay: 3 })
        yield* PubSub.publishAll(pubsub, messages)
        const sub = yield* PubSub.subscribe(pubsub)
        assert.deepStrictEqual(yield* PubSub.takeAll(sub), [3, 4, 5])
      }))

    it.effect("unbounded rounds up fractional replay", () =>
      Effect.gen(function*() {
        const pubsub = yield* PubSub.unbounded<number>({ replay: 1.5 })
        yield* PubSub.publishAll(pubsub, [1, 2, 3, 4])
        const sub = yield* PubSub.subscribe(pubsub)
        assert.deepStrictEqual(yield* PubSub.takeAll(sub), [3, 4])
      }))

    it.effect("unbounded disables non-positive replay", () =>
      Effect.gen(function*() {
        const pubsub = yield* PubSub.unbounded<number>({ replay: -1 })
        yield* PubSub.publishAll(pubsub, [1, 2])
        const sub = yield* PubSub.subscribe(pubsub)
        assert.deepStrictEqual(yield* PubSub.takeUpTo(sub, 2), [])
      }))

    it.effect("unbounded takeUpTo", () => {
      const messages = [1, 2, 3, 4, 5]
      return PubSub.unbounded<number>({ replay: 3 }).pipe(
        Effect.flatMap((pubsub) =>
          Effect.scoped(
            Effect.gen(function*() {
              yield* PubSub.publishAll(pubsub, messages)

              const sub1 = yield* PubSub.subscribe(pubsub)
              yield* PubSub.publish(pubsub, 6)
              const sub2 = yield* PubSub.subscribe(pubsub)

              assert.strictEqual(yield* PubSub.remaining(sub1), 4)
              assert.strictEqual(yield* PubSub.remaining(sub2), 3)
              assert.deepStrictEqual(yield* PubSub.takeUpTo(sub1, 2), [3, 4])
              assert.deepStrictEqual(yield* PubSub.takeUpTo(sub1, 2), [5, 6])
              assert.deepStrictEqual(yield* PubSub.takeUpTo(sub2, 3), [4, 5, 6])
            })
          )
        )
      )
    })

    it.effect("takeUpTo and takeBetween normalize message counts", () =>
      Effect.gen(function*() {
        const livePubSub = yield* PubSub.unbounded<number>()
        const live = yield* PubSub.subscribe(livePubSub)
        yield* PubSub.publishAll(livePubSub, [1, 2, 3])
        assert.deepStrictEqual(yield* PubSub.takeUpTo(live, 1.9), [1])

        const betweenPubSub = yield* PubSub.unbounded<number>()
        const between = yield* PubSub.subscribe(betweenPubSub)
        yield* PubSub.publishAll(betweenPubSub, [1, 2, 3])
        assert.deepStrictEqual(yield* PubSub.takeBetween(between, 1.9, 2.9), [1, 2])

        const replayPubSub = yield* PubSub.unbounded<number>({ replay: 3 })
        yield* PubSub.publishAll(replayPubSub, [1, 2, 3])
        const replay = yield* PubSub.subscribe(replayPubSub)
        assert.deepStrictEqual(yield* PubSub.takeUpTo(replay, 1.9), [1])
        assert.deepStrictEqual(yield* PubSub.takeUpTo(replay, Number.NaN), [])
        assert.deepStrictEqual(yield* PubSub.takeAll(replay), [2, 3])
      }))

    it.effect("dropping", () =>
      Effect.gen(function*() {
        const messages = [1, 2, 3, 4, 5]
        const pubsub = yield* PubSub.dropping<number>({ capacity: 2, replay: 3 })

        yield* PubSub.publishAll(pubsub, messages)
        const sub = yield* PubSub.subscribe(pubsub)
        assert.deepStrictEqual(yield* PubSub.takeAll(sub), [3, 4, 5])
        yield* PubSub.publishAll(pubsub, [6, 7])
        assert.deepStrictEqual(yield* PubSub.takeAll(sub), [6, 7])

        const sub2 = yield* PubSub.subscribe(pubsub)
        assert.deepStrictEqual(yield* PubSub.takeAll(sub2), [5, 6, 7])

        yield* PubSub.publishAll(pubsub, [8, 9, 10, 11])
        assert.deepStrictEqual(yield* PubSub.takeAll(sub), [8, 9])
        assert.deepStrictEqual(yield* PubSub.takeAll(sub2), [8, 9])

        const sub3 = yield* PubSub.subscribe(pubsub)
        assert.deepStrictEqual(yield* PubSub.takeAll(sub3), [7, 8, 9])
      }))

    it.effect("sliding", () =>
      Effect.gen(function*() {
        const messages = [1, 2, 3, 4, 5]
        const pubsub = yield* PubSub.sliding<number>({ capacity: 4, replay: 3 })

        yield* PubSub.publishAll(pubsub, messages)
        const sub = yield* PubSub.subscribe(pubsub)
        assert.deepStrictEqual(yield* PubSub.take(sub), 3)
        yield* PubSub.publishAll(pubsub, [6, 7, 8, 9, 10])
        assert.deepStrictEqual(yield* PubSub.takeAll(sub), [5, 6, 7, 8, 9, 10])

        const sub2 = yield* PubSub.subscribe(pubsub)
        assert.deepStrictEqual(yield* PubSub.takeAll(sub2), [8, 9, 10])

        yield* PubSub.publishAll(pubsub, [11, 12, 13, 14, 15, 16])
        assert.deepStrictEqual(yield* PubSub.takeAll(sub), [13, 14, 15, 16])
        assert.deepStrictEqual(yield* PubSub.takeAll(sub2), [13, 14, 15, 16])

        const sub3 = yield* PubSub.subscribe(pubsub)
        assert.deepStrictEqual(yield* PubSub.takeAll(sub3), [14, 15, 16])
      }))

    it.effect("sliding preserves publish order with a lagging subscriber", () =>
      Effect.gen(function*() {
        const pubsub = yield* PubSub.sliding<number>({ capacity: 4, replay: 3 })
        yield* PubSub.subscribe(pubsub)
        yield* PubSub.publishAll(pubsub, [1, 2])
        const subscription = yield* PubSub.subscribe(pubsub)
        yield* PubSub.publishAll(pubsub, [3, 4, 5])

        const values = yield* PubSub.takeAll(subscription)
        assert.isTrue(values.every((value, index) => index === 0 || values[index - 1] <= value))
      }))
  })

  it.effect("shutdown interrupts suspended subscribers", () =>
    Effect.gen(function*() {
      const pubsub = yield* PubSub.unbounded<number>()
      const subscription = yield* PubSub.subscribe(pubsub)
      const fiber = yield* Effect.forkChild(PubSub.take(subscription), { startImmediately: true })

      yield* PubSub.shutdown(pubsub)

      const exit = yield* Fiber.await(fiber)
      assert.isTrue(Exit.hasInterrupts(exit!))
    }))

  it.effect("publish succeeds after interrupting a suspended subscriber", () =>
    Effect.gen(function*() {
      const pubsub = yield* PubSub.dropping<number>(1)
      const subscription = yield* PubSub.subscribe(pubsub)
      const fiber = yield* Effect.forkChild(PubSub.take(subscription), { startImmediately: true })

      yield* Fiber.interrupt(fiber)

      assert.isTrue(yield* PubSub.publish(pubsub, 42))
      assert.strictEqual(yield* PubSub.take(subscription), 42)
    }))

  // A small op budget makes the fiber yield at each point between starting a
  // wait and suspending on it; interrupting it there must leave nothing behind.
  // (With a budget below 3 a fiber yields again before making progress.)
  const interruptAtEveryYield = (
    test: (
      budget: (effect: Effect.Effect<unknown>) => Effect.Effect<unknown>
    ) => Effect.Effect<boolean, never, Scope.Scope>
  ) =>
    Effect.gen(function*() {
      const failed: Array<number> = []
      for (let ops = 3; ops <= 64; ops++) {
        const ok = yield* Effect.scoped(test(Effect.provideService(Scheduler.MaxOpsBeforeYield, ops)))
        if (!ok) failed.push(ops)
      }
      assert.deepStrictEqual(failed, [])
    })

  it.effect("an interrupted take never swallows the next message", () =>
    interruptAtEveryYield((budget) =>
      Effect.gen(function*() {
        const pubsub = yield* PubSub.bounded<number>(4)
        const subscription = yield* PubSub.subscribe(pubsub)
        const fiber = yield* Effect.forkChild(budget(PubSub.take(subscription)), { startImmediately: true })
        yield* Fiber.interrupt(fiber)
        yield* PubSub.publish(pubsub, 1)
        return (yield* PubSub.takeUpTo(subscription, 1)).length === 1
      })
    ))

  it.effect("a take that starts waiting after unsubscribe is interrupted", () =>
    interruptAtEveryYield((budget) =>
      Effect.gen(function*() {
        const pubsub = yield* PubSub.unbounded<number>()
        const scope = yield* Scope.make()
        const subscription = yield* PubSub.subscribe(pubsub).pipe(Scope.provide(scope))
        const fiber = yield* Effect.forkChild(budget(PubSub.take(subscription)), { startImmediately: true })
        yield* Scope.close(scope, Exit.void)
        for (let i = 0; i < 100 && fiber.pollUnsafe() === undefined; i++) yield* Effect.yieldNow
        const exit = fiber.pollUnsafe()
        return exit !== undefined && Exit.hasInterrupts(exit)
      })
    ))

  it.effect("an interrupted backpressured publisher never publishes later", () =>
    interruptAtEveryYield((budget) =>
      Effect.gen(function*() {
        const pubsub = yield* PubSub.bounded<number>(1)
        const subscription = yield* PubSub.subscribe(pubsub)
        yield* PubSub.publish(pubsub, 1)
        const fiber = yield* Effect.forkChild(budget(PubSub.publish(pubsub, 2)), { startImmediately: true })
        yield* Fiber.interrupt(fiber)
        yield* PubSub.takeUpTo(subscription, 1)
        return (yield* PubSub.takeUpTo(subscription, 1)).length === 0
      })
    ))

  it.effect("shutdown interrupts suspended takeAll subscribers", () =>
    Effect.gen(function*() {
      const pubsub = yield* PubSub.unbounded<number>()
      const subscription = yield* PubSub.subscribe(pubsub)
      const fiber = yield* Effect.forkChild(PubSub.takeAll(subscription), { startImmediately: true })
      yield* PubSub.shutdown(pubsub)
      const exit = yield* Fiber.await(fiber)
      assert.isTrue(Exit.hasInterrupts(exit))
    }))

  it.effect("Stream.fromPubSub completes after shutdown", () =>
    Effect.gen(function*() {
      const pubsub = yield* PubSub.unbounded<number>()
      const fiber = yield* Effect.forkChild(Stream.runCollect(Stream.fromPubSub(pubsub)))

      yield* Effect.yieldNow
      assert.isUndefined(fiber.pollUnsafe())

      yield* PubSub.shutdown(pubsub)

      const result = yield* Fiber.join(fiber)
      assert.deepStrictEqual(result, [])
    }))

  it.effect("publish returns false after shutdown", () =>
    Effect.gen(function*() {
      const pubsub = yield* PubSub.unbounded<number>()
      yield* PubSub.shutdown(pubsub)

      assert.strictEqual(yield* PubSub.publish(pubsub, 1), false)
    }))

  it.effect("publishAll returns false after shutdown", () =>
    Effect.gen(function*() {
      const pubsub = yield* PubSub.unbounded<number>()
      yield* PubSub.shutdown(pubsub)

      assert.strictEqual(yield* PubSub.publishAll(pubsub, [1, 2, 3]), false)
    }))

  describe("end", () => {
    it.effect("delivers buffered messages before the final message and rejects later publishes", () =>
      Effect.gen(function*() {
        const pubsub = yield* PubSub.bounded<number>(4)
        const subscription = yield* PubSub.subscribe(pubsub)
        yield* PubSub.publishAll(pubsub, [1, 2])

        assert.isTrue(yield* PubSub.end(pubsub, 0))
        assert.isFalse(yield* PubSub.end(pubsub, -1))
        assert.isFalse(yield* PubSub.publish(pubsub, 3))
        assert.isFalse(yield* PubSub.publishAll(pubsub, [3]))
        assert.isFalse(PubSub.publishUnsafe(pubsub, 3))

        assert.deepStrictEqual(yield* PubSub.takeAll(subscription), [1, 2])
        assert.strictEqual(yield* PubSub.take(subscription), 0)
        assert.strictEqual(yield* PubSub.take(subscription), 0)
        assert.deepStrictEqual(yield* PubSub.takeAll(subscription), [0])
      }))

    it.effect("wakes a suspended take", () =>
      Effect.gen(function*() {
        const pubsub = yield* PubSub.unbounded<number>()
        const subscription = yield* PubSub.subscribe(pubsub)
        const fiber = yield* Effect.forkChild(PubSub.take(subscription), { startImmediately: true })

        yield* PubSub.end(pubsub, 0)

        assert.strictEqual(yield* Fiber.join(fiber), 0)
      }))

    it.effect("is not dropped by a full dropping PubSub", () =>
      Effect.gen(function*() {
        const pubsub = yield* PubSub.dropping<number>(1)
        const subscription = yield* PubSub.subscribe(pubsub)
        yield* PubSub.publish(pubsub, 1)

        yield* PubSub.end(pubsub, 0)

        assert.strictEqual(yield* PubSub.take(subscription), 1)
        assert.strictEqual(yield* PubSub.take(subscription), 0)
      }))

    it.effect("late subscribers receive the replayed messages and then the final message", () =>
      Effect.gen(function*() {
        const pubsub = yield* PubSub.unbounded<number>({ replay: 2 })
        yield* PubSub.publishAll(pubsub, [1, 2, 3])
        yield* PubSub.end(pubsub, 0)

        const subscription = yield* PubSub.subscribe(pubsub)
        assert.deepStrictEqual(yield* PubSub.takeBetween(subscription, 3, 3), [2, 3, 0])
      }))

    it.effect("rejects a suspended backpressured publish instead of delivering it after the final message", () =>
      Effect.gen(function*() {
        const pubsub = yield* PubSub.bounded<number>(1)
        const fast = yield* PubSub.subscribe(pubsub)
        const slow = yield* PubSub.subscribe(pubsub)
        yield* PubSub.publish(pubsub, 1)
        // The buffer stays full until the slow subscriber takes 1, so this
        // publish suspends.
        const publisher = yield* Effect.forkChild(PubSub.publish(pubsub, 2), { startImmediately: true })
        assert.strictEqual(yield* PubSub.take(fast), 1)

        yield* PubSub.end(pubsub, 0)

        assert.strictEqual(yield* PubSub.take(fast), 0)
        assert.strictEqual(yield* PubSub.take(slow), 1)
        assert.isFalse(yield* Fiber.join(publisher))
        assert.strictEqual(yield* PubSub.take(fast), 0)
        assert.strictEqual(yield* PubSub.take(slow), 0)
      }))

    it.effect("shutdown still interrupts subscribers", () =>
      Effect.gen(function*() {
        const pubsub = yield* PubSub.unbounded<number>()
        const subscription = yield* PubSub.subscribe(pubsub)
        yield* PubSub.end(pubsub, 0)
        yield* PubSub.shutdown(pubsub)

        assert.isTrue(Exit.hasInterrupts(yield* Effect.exit(PubSub.take(subscription))))
      }))
  })
})

const retains = (root: object, target: object): boolean => {
  const objects = [root]
  const seen = new Set<object>()
  while (objects.length > 0) {
    const current = objects.pop()!
    if (current === target) {
      return true
    }
    if (seen.has(current)) {
      continue
    }
    seen.add(current)
    for (const key of Reflect.ownKeys(current)) {
      const descriptor = Object.getOwnPropertyDescriptor(current, key)
      const value = descriptor && "value" in descriptor ? descriptor.value : undefined
      if (typeof value === "object" && value !== null) {
        objects.push(value)
      }
    }
  }
  return false
}
