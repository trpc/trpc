import { assert, describe, it } from "@effect/vitest"
import { Cause, Effect, Exit, Fiber, Option, Queue, Stream } from "effect"
import * as Scheduler from "effect/Scheduler"

describe("Queue", () => {
  describe("waiter registration after a yield", () => {
    // Budget 3 yields after the first queue check but before the old waiter registration.
    const withYield = <A, E>(effect: Effect.Effect<A, E>) =>
      Effect.provideService(effect, Scheduler.MaxOpsBeforeYield, 3)

    const assertCompletes = (fiber: Fiber.Fiber<unknown, unknown>) =>
      Effect.gen(function*() {
        for (let i = 0; i < 200 && fiber.pollUnsafe() === undefined; i++) yield* Effect.yieldNow
        const done = fiber.pollUnsafe() !== undefined
        yield* Fiber.interrupt(fiber)
        assert.isTrue(done, "lost wake-up")
      })

    it.effect("offerAll does not park beside available capacity", () =>
      Effect.gen(function*() {
        const queue = yield* Queue.bounded<number>(1)
        yield* Queue.offer(queue, 0)
        const fiber = yield* Effect.forkChild(withYield(Queue.offerAll(queue, [1])), { startImmediately: true })
        yield* Queue.take(queue)
        yield* assertCompletes(fiber)
      }))

    it.effect("zero-capacity offer and take can rendezvous", () =>
      Effect.gen(function*() {
        const queue = yield* Queue.bounded<number>(0)
        const offerer = yield* Effect.forkChild(withYield(Queue.offer(queue, 1)), { startImmediately: true })
        const taker = yield* Effect.forkChild(Queue.take(queue), { startImmediately: true })
        yield* assertCompletes(offerer)
        yield* assertCompletes(taker)
      }))
  })

  it.effect("isEnqueue type guard", () =>
    Effect.gen(function*() {
      const queue = yield* Queue.bounded<number>(10)

      assert.isTrue(Queue.isEnqueue(queue))
      assert.isFalse(Queue.isEnqueue({}))
      assert.isFalse(Queue.isEnqueue(null))
    }))

  it.effect("isDequeue type guard", () =>
    Effect.gen(function*() {
      const queue = yield* Queue.bounded<number>(10)

      assert.isTrue(Queue.isDequeue(queue))
      assert.isFalse(Queue.isDequeue({}))
      assert.isFalse(Queue.isDequeue(null))
    }))

  it.effect("asEnqueue converts to write-only interface", () =>
    Effect.gen(function*() {
      const queue = yield* Queue.bounded<number>(10)
      const enqueue: Queue.Enqueue<number> = Queue.asEnqueue(queue)

      // Verify it's recognized as an enqueue
      assert.isTrue(Queue.isEnqueue(enqueue))

      // Verify queue operations still work through enqueue reference
      assert.isTrue(Queue.isQueue(enqueue))
    }))

  it.effect("asDequeue converts to read-only interface", () =>
    Effect.gen(function*() {
      const queue = yield* Queue.bounded<number>(10)
      yield* Queue.offer(queue, 42)

      const dequeue = Queue.asDequeue(queue)

      // Can use dequeue operations
      const item = yield* Queue.take(dequeue)
      assert.strictEqual(item, 42)

      // Verify it's recognized as a dequeue
      assert.isTrue(Queue.isDequeue(dequeue))
    }))

  it.effect("bounded offerAll waits until capacity is released", () =>
    Effect.gen(function*() {
      const queue = yield* Queue.bounded<number>(2)
      const fiber = yield* Queue.offerAll(queue, [1, 2, 3, 4]).pipe(
        Effect.forkChild
      )
      yield* Effect.yieldNow
      assert.isUndefined(fiber.pollUnsafe())

      let result = yield* Queue.takeAll(queue)
      assert.deepStrictEqual(result, [1, 2])

      yield* Effect.yieldNow
      assert.isDefined(fiber.pollUnsafe())

      result = yield* Queue.takeAll(queue)
      assert.deepStrictEqual(result, [3, 4])

      yield* Effect.yieldNow
      assert.deepStrictEqual(fiber.pollUnsafe(), Exit.succeed([]))
    }))

  it.effect("interrupting a suspended offer after end withdraws its message", () =>
    Effect.gen(function*() {
      const queue = yield* Queue.bounded<number, Cause.Done>(1)
      yield* Queue.offer(queue, 1)
      const producer = yield* Effect.forkChild(Queue.offer(queue, 2), { startImmediately: true })
      assert.isUndefined(producer.pollUnsafe(), "offer must be suspended before end")

      yield* Queue.end(queue)
      yield* Fiber.interrupt(producer)

      assert.deepStrictEqual(yield* Queue.collect(queue), [1])
    }))

  it.effect("interrupting a suspended offerAll after end completes an empty queue", () =>
    Effect.gen(function*() {
      const queue = yield* Queue.bounded<number, Cause.Done>(0)
      const producer = yield* Effect.forkChild(Queue.offerAll(queue, [1, 2]), { startImmediately: true })
      assert.isUndefined(producer.pollUnsafe(), "offerAll must be suspended before end")

      yield* Queue.end(queue)
      const awaiter = yield* Effect.forkChild(Queue.await(queue), { startImmediately: true })
      assert.isUndefined(awaiter.pollUnsafe(), "await must wait for the pending offer")

      yield* Fiber.interrupt(producer)
      yield* Fiber.join(awaiter)
      assert.deepStrictEqual(yield* Effect.exit(Queue.take(queue)), Exit.fail(Cause.Done()))
    }))

  it.effect("resuming a blocked producer does not enqueue its message twice", () =>
    Effect.gen(function*() {
      const queue = yield* Queue.bounded<number>(1)
      yield* Queue.offer(queue, 0)
      const producer = yield* Effect.forkChild(
        Effect.gen(function*() {
          yield* Queue.offer(queue, 1)
          return yield* Queue.take(queue)
        }),
        { startImmediately: true }
      )

      const first = yield* Queue.take(queue)
      const second = yield* Fiber.join(producer)
      const remaining = yield* Queue.clear(queue)
      yield* Queue.shutdown(queue)

      assert.deepStrictEqual([first, second], [0, 1])
      assert.deepStrictEqual(remaining, [])
    }))

  for (const method of ["offer", "offerAll"]) {
    for (const take of ["take", "takeAll", "clear"]) {
      it.effect(`zero-capacity ${take} reserves the message before resuming ${method}`, () =>
        Effect.gen(function*() {
          const queue = yield* Queue.bounded<number>(0)
          const producer = yield* Effect.forkChild(
            Effect.gen(function*() {
              if (method === "offer") yield* Queue.offer(queue, 1)
              else yield* Queue.offerAll(queue, [1])
              return yield* Queue.take(queue)
            }),
            { startImmediately: true }
          )

          const first = take === "take"
            ? [yield* Queue.take(queue)]
            : take === "takeAll"
            ? yield* Queue.takeAll(queue)
            : yield* Queue.clear(queue)
          const producerExit = producer.pollUnsafe()
          yield* Queue.shutdown(queue)

          assert.deepStrictEqual({ first, producerExit }, { first: [1], producerExit: undefined })
        }))
    }

    it.effect(`resuming ${method} can shut down the queue without defecting the consumer`, () =>
      Effect.gen(function*() {
        const queue = yield* Queue.bounded<number>(1)
        yield* Queue.offer(queue, 0)
        const producer = yield* Effect.forkChild(
          Effect.gen(function*() {
            if (method === "offer") yield* Queue.offer(queue, 1)
            else yield* Queue.offerAll(queue, [1])
            yield* Queue.shutdown(queue)
          }),
          { startImmediately: true }
        )

        const exit = yield* Effect.exit(Queue.take(queue))
        yield* Fiber.join(producer)

        assert.deepStrictEqual(exit, Exit.succeed(0))
      }))

    it.effect(`resuming ${method} does not overfill the queue with reentrant offers`, () =>
      Effect.gen(function*() {
        const queue = yield* Queue.bounded<number>(2)
        yield* Queue.offerAll(queue, [0, 1])
        yield* Effect.forkChild(
          Effect.gen(function*() {
            if (method === "offer") yield* Queue.offer(queue, 2)
            else yield* Queue.offerAll(queue, [2])
            yield* Queue.offer(queue, 3)
          }),
          { startImmediately: true }
        )
        yield* Effect.forkChild(Queue.offer(queue, 4), { startImmediately: true })

        const first = yield* Queue.takeAll(queue)
        const size = Queue.sizeUnsafe(queue)
        yield* Queue.shutdown(queue)

        assert.deepStrictEqual(first, [0, 1])
        assert.isAtMost(size, 2)
      }))
  }

  it.effect("takeN", () =>
    Effect.gen(function*() {
      const queue = yield* Queue.unbounded<number>()
      yield* Queue.offerAll(queue, [1, 2, 3, 4]).pipe(Effect.forkChild)
      const a = yield* Queue.takeN(queue, 2)
      const b = yield* Queue.takeN(queue, 2)
      assert.deepEqual(a, [1, 2])
      assert.deepEqual(b, [3, 4])
    }))

  it("takeN on a partial batch does not wake its taker", () => {
    // Drive the queue's scheduler by hand so every taker release runs
    // synchronously inside the test instead of on a host timer.
    const tasks: Array<() => void> = []
    const scheduler: Scheduler.Scheduler = {
      executionMode: "async",
      shouldYield: () => false,
      makeDispatcher: () => ({
        scheduleTask: (task) => {
          tasks.push(task)
        },
        flush() {}
      })
    }
    const queue = Effect.runSync(
      Queue.unbounded<number>().pipe(Effect.provideService(Scheduler.Scheduler, scheduler))
    )
    const taker = Effect.runFork(Queue.takeN(queue, 2), { scheduler })
    assert(queue.state._tag === "Open")
    const takers = queue.state.takers
    assert.strictEqual(takers.size, 1)
    // Releasing a taker deletes it first, so the old wake/retry loop trips
    // this on its first turn instead of spinning forever.
    takers.delete = () => {
      throw new Error("partial batch woke its taker")
    }

    Queue.offerUnsafe(queue, 1)
    assert.strictEqual(tasks.length, 1)
    tasks.shift()!()

    assert.isUndefined(taker.pollUnsafe())
    assert.strictEqual(takers.size, 1)
    assert.isEmpty(tasks)
  })

  const lostWakeupCases: ReadonlyArray<readonly [string, (queue: Queue.Queue<number>) => Effect.Effect<unknown>]> = [
    ["take", Queue.take],
    ["takeN", (queue) => Queue.takeN(queue, 1)],
    ["takeAll", Queue.takeAll],
    ["takeBetween", (queue) => Queue.takeBetween(queue, 1, 5)],
    ["peek", Queue.peek]
  ]
  for (const [name, receive] of lostWakeupCases) {
    it.effect(`${name} does not miss an offer during the check-to-registration yield`, () =>
      Effect.gen(function*() {
        const queue = yield* Queue.unbounded<number>()
        // At a budget of 8, this padding exhausts the taker budget after
        // checking the empty queue but before registering in awaitTake.
        let pad: Effect.Effect<void> = Effect.void
        for (let i = 0; i < 5; i++) pad = Effect.andThen(pad, Effect.void)
        const taker = yield* Effect.forkDetach(Effect.andThen(pad, receive(queue)))
        const offerer = yield* Effect.forkDetach(Queue.offer(queue, 1))
        for (let i = 0; i < 20; i++) yield* Effect.yieldNow

        const exit = taker.pollUnsafe()
        const size = yield* Queue.size(queue)
        yield* Queue.shutdown(queue)
        assert.deepStrictEqual(offerer.pollUnsafe(), Exit.succeed(true))
        // Without the fix the taker stays suspended with no future wakeup, and
        // the offered message remains in the queue.
        assert.deepStrictEqual(exit, Exit.succeed(name === "take" || name === "peek" ? 1 : [1]))
        assert.strictEqual(size, name === "peek" ? 1 : 0)
      }).pipe(Effect.provideService(Scheduler.MaxOpsBeforeYield, 8)))
  }

  it.effect("takeN and takeBetween keep waiting on a partial batch", () =>
    Effect.gen(function*() {
      const takeNQueue = yield* Queue.unbounded<number>()
      yield* Queue.offer(takeNQueue, 1)
      const takeN = yield* Effect.forkDetach(Queue.takeN(takeNQueue, 3))

      const takeBetweenQueue = yield* Queue.unbounded<number>()
      yield* Queue.offer(takeBetweenQueue, 1)
      const takeBetween = yield* Effect.forkDetach(Queue.takeBetween(takeBetweenQueue, 2, 5))

      for (let i = 0; i < 20; i++) yield* Effect.yieldNow
      // A buffered message below the minimum must not resume the taker.
      assert.strictEqual(takeN.pollUnsafe(), undefined)
      assert.strictEqual(takeBetween.pollUnsafe(), undefined)

      yield* Queue.offerAll(takeNQueue, [2, 3])
      yield* Queue.offerAll(takeBetweenQueue, [2, 3])
      assert.deepStrictEqual(yield* Fiber.await(takeN), Exit.succeed([1, 2, 3]))
      assert.deepStrictEqual(yield* Fiber.await(takeBetween), Exit.succeed([1, 2, 3]))
    }))

  it.effect("takeN drains an insufficient batch after end", () =>
    Effect.gen(function*() {
      const queue = yield* Queue.unbounded<number, Cause.Done>()
      yield* Queue.offerAll(queue, [1, 2])
      yield* Queue.end(queue)

      assert.deepStrictEqual(yield* Queue.takeN(queue, 5), [1, 2])
      assert.strictEqual(queue.state._tag, "Done")
      assert.deepStrictEqual(yield* Effect.exit(Queue.takeN(queue, 5)), Exit.fail(Cause.Done()))
    }))

  it.effect("takeBetween drains a waiting batch on failure", () =>
    Effect.gen(function*() {
      const queue = yield* Queue.unbounded<number, string>()
      yield* Queue.offerAll(queue, [1, 2])
      const taker = yield* Effect.forkChild(Queue.takeBetween(queue, 5, 8), { startImmediately: true })
      assert.strictEqual(taker.pollUnsafe(), undefined)

      yield* Queue.fail(queue, "boom")
      assert.deepStrictEqual(yield* Fiber.join(taker), [1, 2])
      assert.strictEqual(queue.state._tag, "Done")
      assert.deepStrictEqual(yield* Effect.exit(Queue.takeBetween(queue, 5, 8)), Exit.fail("boom"))
    }))

  it.effect("takeN drains on failure between the batch check and waiter registration", () =>
    Effect.gen(function*() {
      const queue = yield* Queue.unbounded<number, string>()
      yield* Queue.offerAll(queue, [1, 2])
      // At a budget of 8, this padding exhausts the taker budget after the
      // first batch check but before registering in awaitTake.
      const pad = Effect.andThen(Effect.void, Effect.void)
      const taker = yield* Effect.forkDetach(Effect.andThen(pad, Effect.exit(Queue.takeN(queue, 5))))
      let takersAtFail = -1
      yield* Effect.forkDetach(Effect.suspend(() => {
        takersAtFail = queue.state._tag === "Done" ? -1 : queue.state.takers.size
        return Queue.fail(queue, "boom")
      }))

      assert.deepStrictEqual(yield* Fiber.join(taker), Exit.succeed([1, 2]))
      // The taker yielded after its check and before registering, so the
      // termination could not wake it.
      assert.strictEqual(takersAtFail, 0)
      assert.strictEqual(queue.state._tag, "Done")
      assert.deepStrictEqual(yield* Effect.exit(Queue.takeN(queue, 5)), Exit.fail("boom"))
    }).pipe(Effect.provideService(Scheduler.MaxOpsBeforeYield, 8)))

  it.effect("takeN ending at an offerAll boundary keeps the next message", () =>
    Effect.gen(function*() {
      const queue = yield* Queue.unbounded<number>()
      yield* Queue.offerAll(queue, [1, 2])
      yield* Queue.offerAll(queue, [3])
      assert.deepStrictEqual(yield* Queue.takeN(queue, 2), [1, 2])
      assert.strictEqual(yield* Queue.size(queue), 1)
      assert.strictEqual(yield* Queue.peek(queue), 3)
      assert.strictEqual(yield* Queue.take(queue), 3)
      yield* Queue.offer(queue, 99)
      assert.strictEqual(yield* Queue.take(queue), 99)
      assert.strictEqual(yield* Queue.size(queue), 0)
    }))

  it.effect("takeN and takeBetween normalize element counts before waiting", () =>
    Effect.gen(function*() {
      const takeNQueue = yield* Queue.unbounded<number>()
      yield* Queue.offer(takeNQueue, 1)
      assert.deepStrictEqual(yield* Queue.takeN(takeNQueue, 1.9), [1])

      const takeBetweenQueue = yield* Queue.unbounded<number>()
      yield* Queue.offer(takeBetweenQueue, 1)
      assert.deepStrictEqual(yield* Queue.takeBetween(takeBetweenQueue, 1.9, 2.9), [1])

      const invalidQueue = yield* Queue.unbounded<number>()
      yield* Queue.offer(invalidQueue, 1)
      assert.deepStrictEqual(yield* Queue.takeN(invalidQueue, Number.NaN), [])
      assert.deepStrictEqual(yield* Queue.takeAll(invalidQueue), [1])
    }))

  it.effect("collect does not duplicate messages", () =>
    Effect.gen(function*() {
      const queue = yield* Queue.bounded<{ id: number }, Cause.Done>(10)
      yield* Queue.offer(queue, { id: 0 })
      yield* Queue.end(queue)

      const result = yield* Queue.collect(queue)
      assert.deepStrictEqual(result, [{ id: 0 }])
    }))

  it.effect("offer dropping", () =>
    Effect.gen(function*() {
      const queue = yield* Queue.make<number>({ capacity: 2, strategy: "dropping" })
      const remaining = yield* Queue.offerAll(queue, [1, 2, 3, 4])
      assert.deepStrictEqual(remaining, [3, 4])
      const result = yield* Queue.offer(queue, 5)
      assert.isFalse(result)
      assert.deepStrictEqual(yield* Queue.takeAll(queue), [1, 2])
    }))

  it.effect("offer sliding", () =>
    Effect.gen(function*() {
      const queue = yield* Queue.make<number>({ capacity: 2, strategy: "sliding" })
      const remaining = yield* Queue.offerAll(queue, [1, 2, 3, 4])
      assert.deepStrictEqual(remaining, [])
      const result = yield* Queue.offer(queue, 5)
      assert.isTrue(result)
      assert.deepStrictEqual(yield* Queue.takeAll(queue), [4, 5])
    }))

  it.effect("offerAll can be interrupted", () =>
    Effect.gen(function*() {
      const queue = yield* Queue.bounded<number>(2)
      const fiber = yield* Queue.offerAll(queue, [1, 2, 3, 4]).pipe(
        Effect.forkChild
      )

      yield* Effect.yieldNow
      yield* Fiber.interrupt(fiber)
      yield* Effect.yieldNow

      let result = yield* Queue.takeAll(queue)
      assert.deepStrictEqual(result, [1, 2])

      yield* Queue.offer(queue, 5)
      yield* Effect.yieldNow

      result = yield* Queue.takeAll(queue)
      assert.deepStrictEqual(result, [5])
    }))

  it.effect("take can be interrupted without losing offers", () =>
    Effect.gen(function*() {
      const queue = yield* Queue.unbounded<number>()
      const interruptedFiber = yield* Queue.take(queue).pipe(Effect.forkChild)

      yield* Effect.yieldNow
      yield* Fiber.interrupt(interruptedFiber)
      assert.isTrue(Exit.hasInterrupts(yield* Fiber.await(interruptedFiber)))

      const liveFiber = yield* Queue.take(queue).pipe(Effect.forkChild)
      yield* Effect.yieldNow
      yield* Queue.offer(queue, 1)

      assert.strictEqual(yield* Fiber.join(liveFiber), 1)
    }))

  it.effect("done completes takes", () =>
    Effect.gen(function*() {
      const queue = yield* Queue.bounded<number, Cause.Done>(2)
      const fiber = yield* Queue.takeAll(queue).pipe(
        Effect.forkChild
      )
      yield* Effect.yieldNow
      yield* Queue.end(queue)
      assert.deepStrictEqual(yield* Fiber.await(fiber), Exit.fail(Cause.Done()))
    }))

  it.effect("end", () =>
    Effect.gen(function*() {
      const queue = yield* Queue.bounded<number, Cause.Done>(2)
      yield* Effect.forkChild(Queue.offerAll(queue, [1, 2, 3, 4]))
      yield* Effect.forkChild(Queue.offerAll(queue, [5, 6, 7, 8]))
      yield* Effect.forkChild(Queue.offer(queue, 9))
      yield* Effect.forkChild(Queue.end(queue))
      const items = yield* Stream.runCollect(Stream.fromQueue(queue))
      assert.deepStrictEqual(items, [1, 2, 3, 4, 5, 6, 7, 8, 9])
      assert.strictEqual(yield* Queue.await(queue), void 0)
      assert.strictEqual(yield* Queue.offer(queue, 10), false)
    }))

  it.effect("end with take", () =>
    Effect.gen(function*() {
      const queue = yield* Queue.bounded<number, Cause.Done>(2)
      yield* Effect.forkChild(Queue.offerAll(queue, [1, 2]))
      yield* Effect.forkChild(Queue.offer(queue, 3))
      yield* Effect.forkChild(Queue.end(queue))
      assert.strictEqual(yield* Queue.take(queue), 1)
      assert.strictEqual(yield* Queue.take(queue), 2)
      assert.strictEqual(yield* Queue.take(queue), 3)
      assert.strictEqual(Cause.isDone(yield* Queue.take(queue).pipe(Effect.flip)), true)
      assert.strictEqual(yield* Queue.await(queue), void 0)
      assert.strictEqual(yield* Queue.offer(queue, 10), false)
    }))

  it.effect("interrupt allows draining", () =>
    Effect.gen(function*() {
      const queue = yield* Queue.bounded<number>(10)
      yield* Queue.offerAll(queue, [1, 2, 3, 4, 5])

      // Interrupt gracefully
      const interrupted = yield* Queue.interrupt(queue)
      assert.strictEqual(interrupted, true)

      // No more offers accepted
      const offerResult = yield* Queue.offer(queue, 6)
      assert.strictEqual(offerResult, false)

      // But can still drain existing messages
      assert.strictEqual(yield* Queue.take(queue), 1)
      assert.strictEqual(yield* Queue.take(queue), 2)
      assert.strictEqual(yield* Queue.take(queue), 3)
      assert.strictEqual(yield* Queue.take(queue), 4)
      assert.strictEqual(yield* Queue.take(queue), 5)

      // Now queue is done and take fails with interrupt
      const exit = yield* Queue.take(queue).pipe(Effect.exit)
      assert.isTrue(Exit.hasInterrupts(exit))
    }))

  it.effect("poll returns Option for non-blocking take", () =>
    Effect.gen(function*() {
      const queue = yield* Queue.bounded<number>(10)

      // Poll returns Option.none when empty
      const empty = yield* Queue.poll(queue)
      assert.isTrue(Option.isNone(empty))

      // Add an item
      yield* Queue.offer(queue, 42)

      // Poll returns Option.some with the item
      const item = yield* Queue.poll(queue)
      assert.isTrue(Option.isSome(item))
      assert.strictEqual(Option.getOrNull(item), 42)

      // Queue is now empty again
      const empty2 = yield* Queue.poll(queue)
      assert.isTrue(Option.isNone(empty2))
    }))

  it.effect("peek views item without removing it", () =>
    Effect.gen(function*() {
      const queue = yield* Queue.bounded<number>(10)
      yield* Queue.offer(queue, 42)

      // Peek at the item
      const item = yield* Queue.peek(queue)
      assert.strictEqual(item, 42)

      // Item is still in the queue
      const size = yield* Queue.size(queue)
      assert.strictEqual(size, 1)

      // Peek again - same item
      const item2 = yield* Queue.peek(queue)
      assert.strictEqual(item2, 42)

      // Now take it
      const taken = yield* Queue.take(queue)
      assert.strictEqual(taken, 42)

      // Queue is now empty
      const newSize = yield* Queue.size(queue)
      assert.strictEqual(newSize, 0)
    }))

  it.effect("fail drains buffered values before failing takers", () =>
    Effect.gen(function*() {
      const queue = yield* Queue.bounded<number, string>(2)
      yield* Effect.forkChild(Queue.offerAll(queue, [1, 2, 3, 4]))
      yield* Effect.forkChild(Queue.offer(queue, 5))
      yield* Effect.forkChild(Queue.fail(queue, "boom"))
      const takeArr = Queue.takeAll(queue)
      assert.deepStrictEqual(yield* takeArr, [1, 2])
      assert.deepStrictEqual(yield* takeArr, [3, 4])
      const items = yield* Queue.takeAll(queue)
      assert.deepStrictEqual(items, [5])
      const error = yield* Queue.takeAll(queue).pipe(Effect.flip)
      assert.deepStrictEqual(error, "boom")
      assert.strictEqual(yield* Queue.await(queue).pipe(Effect.flip), "boom")
      assert.strictEqual(yield* Queue.offer(queue, 6), false)
    }))

  it.effect("shutdown", () =>
    Effect.gen(function*() {
      const queue = yield* Queue.bounded<number>(2)
      yield* Effect.forkChild(Queue.offerAll(queue, [1, 2, 3, 4]))
      yield* Effect.forkChild(Queue.offerAll(queue, [5, 6, 7, 8]))
      yield* Effect.forkChild(Queue.shutdown(queue))
      const exit = yield* Stream.runCollect(Stream.fromQueue(queue)).pipe(
        Effect.exit
      )
      assert.isTrue(Exit.hasInterrupts(exit))
      assert.isTrue(Exit.hasInterrupts(yield* Effect.exit(Queue.await(queue))))
      assert.strictEqual(yield* Queue.offer(queue, 10), false)
    }))

  it.effect("shutdownUnsafe interrupts waiting takers synchronously", () =>
    Effect.gen(function*() {
      const queue = yield* Queue.unbounded<number>()
      const taker = yield* Queue.take(queue).pipe(Effect.forkChild({ startImmediately: true }))

      Queue.shutdownUnsafe(queue)

      assert.isTrue(Exit.hasInterrupts(taker.pollUnsafe()!))
    }))

  it.effect("shutdownUnsafe clears buffered messages and settles pending offers synchronously", () =>
    Effect.gen(function*() {
      const queue = yield* Queue.bounded<number>(1)
      Queue.offerUnsafe(queue, 1)
      const offerer = yield* Queue.offer(queue, 2).pipe(Effect.forkChild({ startImmediately: true }))

      Queue.shutdownUnsafe(queue)

      assert.strictEqual(queue.messages.length, 0)
      assert.deepStrictEqual(offerer.pollUnsafe(), Exit.succeed(false))
    }))

  it.effect("shutdownUnsafe resumes batch offers with their unaccepted suffix", () =>
    Effect.gen(function*() {
      const queue = yield* Queue.bounded<number>(1)
      const producer = yield* Queue.offerAll(queue, [1, 2, 3]).pipe(
        Effect.forkChild({ startImmediately: true })
      )
      assert.strictEqual(yield* Queue.take(queue), 1)

      Queue.shutdownUnsafe(queue)

      assert.deepStrictEqual(producer.pollUnsafe(), Exit.succeed([3]))
    }))

  it.effect("shutdownUnsafe returns true and preserves an existing failure", () =>
    Effect.gen(function*() {
      const queue = yield* Queue.unbounded<number, string>()
      Queue.offerUnsafe(queue, 1)
      Queue.failCauseUnsafe(queue, Cause.fail("boom"))

      assert.isTrue(Queue.shutdownUnsafe(queue))

      assert.strictEqual(yield* Queue.take(queue).pipe(Effect.flip), "boom")
    }))

  it.effect("shutdownUnsafe returns false when already shut down", () =>
    Effect.gen(function*() {
      const queue = yield* Queue.unbounded<number>()

      assert.isTrue(Queue.shutdownUnsafe(queue))
      assert.isFalse(Queue.shutdownUnsafe(queue))
      assert.isTrue(Exit.hasInterrupts(yield* Effect.exit(Queue.await(queue))))
    }))

  it.effect("shutdown returns false and preserves a completed queue's failure", () =>
    Effect.gen(function*() {
      const queue = yield* Queue.unbounded<number, string>()
      Queue.failCauseUnsafe(queue, Cause.fail("boom"))

      assert.isFalse(yield* Queue.shutdown(queue))
      assert.strictEqual(yield* Queue.take(queue).pipe(Effect.flip), "boom")
    }))

  it.effect("fail doesnt drop items", () =>
    Effect.gen(function*() {
      const queue = yield* Queue.bounded<number, string>(2)
      yield* Effect.forkChild(Queue.offerAll(queue, [1, 2, 3, 4]))
      yield* Effect.forkChild(Queue.offer(queue, 5))
      yield* Effect.forkChild(Queue.fail(queue, "boom"))
      const items: Array<number> = []
      const error = yield* Stream.fromQueue(queue).pipe(
        Stream.runForEach((item) => Effect.sync(() => items.push(item))),
        Effect.flip
      )
      assert.deepStrictEqual(items, [1, 2, 3, 4, 5])
      assert.strictEqual(error, "boom")
    }))

  it.effect("await waits for no items", () =>
    Effect.gen(function*() {
      const queue = yield* Queue.unbounded<number, Cause.Done>()
      const fiber = yield* Queue.await(queue).pipe(Effect.forkChild)
      yield* Effect.yieldNow
      yield* Queue.offer(queue, 1)
      yield* Queue.end(queue)

      yield* Effect.yieldNow
      assert.isUndefined(fiber.pollUnsafe())
      const result = yield* Queue.takeAll(queue)
      assert.deepStrictEqual(result, [1])
      yield* Effect.flip(Queue.takeAll(queue))
      yield* Effect.yieldNow
      assert.isNotNull(fiber.pollUnsafe())
    }))

  it.effect("end preserves Done for take and excludes it from await", () =>
    Effect.gen(function*() {
      const queue = yield* Queue.unbounded<never, Cause.Done>()
      const takeFiber = yield* Queue.take(queue).pipe(Effect.forkChild)
      const awaitFiber = yield* Queue.await(queue).pipe(Effect.forkChild)
      yield* Effect.yieldNow
      yield* Queue.end(queue)

      assert.deepStrictEqual(yield* Fiber.await(takeFiber), Exit.fail(Cause.Done()))
      assert.strictEqual(yield* Fiber.join(awaitFiber), void 0)
    }))

  it.effect("await preserves non-Done failures", () =>
    Effect.gen(function*() {
      const queue = yield* Queue.unbounded<number, string>()
      const fiber = yield* Queue.await(queue).pipe(Effect.exit, Effect.forkChild)
      yield* Effect.yieldNow
      yield* Queue.fail(queue, "boom")

      assert.deepStrictEqual(yield* Fiber.join(fiber), Exit.fail("boom"))
    }))

  it.effect("flushUnsafe releases a waiting taker after offerUnsafe without completing the queue", () =>
    Effect.gen(function*() {
      const queue = yield* Queue.unbounded<number>()
      const taker = yield* Queue.take(queue).pipe(Effect.forkChild)
      const awaiter = yield* Queue.await(queue).pipe(Effect.forkChild)
      yield* Effect.yieldNow

      Queue.offerUnsafe(queue, 1)
      assert.isUndefined(taker.pollUnsafe())

      Queue.flushUnsafe(queue)

      assert.deepStrictEqual(taker.pollUnsafe(), Exit.succeed(1))
      assert.isUndefined(awaiter.pollUnsafe())
      yield* Queue.shutdown(queue)
    }))

  it.effect("flush releases a waiting taker after offerUnsafe without completing the queue", () =>
    Effect.gen(function*() {
      const queue = yield* Queue.unbounded<number>()
      const taker = yield* Queue.take(queue).pipe(Effect.forkChild)
      const awaiter = yield* Queue.await(queue).pipe(Effect.forkChild)
      yield* Effect.yieldNow

      Queue.offerUnsafe(queue, 1)
      assert.isUndefined(taker.pollUnsafe())

      yield* Queue.flush(queue)

      assert.deepStrictEqual(taker.pollUnsafe(), Exit.succeed(1))
      assert.isUndefined(awaiter.pollUnsafe())
      yield* Queue.shutdown(queue)
    }))

  it.effect("flushUnsafe coalesces scheduled releases across repeated offers", () =>
    Effect.gen(function*() {
      const tasks: Array<() => void> = []
      const scheduler: Scheduler.Scheduler = {
        executionMode: "async",
        makeDispatcher() {
          return {
            scheduleTask(task, _priority) {
              tasks.push(task)
            },
            flush() {
            }
          }
        },
        shouldYield: () => false
      }
      const queue = yield* Queue.unbounded<number>().pipe(
        Effect.provideService(Scheduler.Scheduler, scheduler)
      )
      for (let i = 0; i < 10; i++) {
        yield* Queue.take(queue).pipe(Effect.forkChild)
      }
      yield* Effect.yieldNow

      for (let i = 0; i < 8; i++) {
        Queue.offerUnsafe(queue, i)
        Queue.flushUnsafe(queue)
      }

      assert.lengthOf(tasks, 1)
      yield* Queue.shutdown(queue)
    }))

  it.effect("flush is a no-op after shutdown", () =>
    Effect.gen(function*() {
      const queue = yield* Queue.unbounded<number>()
      yield* Queue.shutdown(queue)

      Queue.flushUnsafe(queue)
      yield* Queue.flush(queue)

      assert.isFalse(yield* Queue.offer(queue, 1))
    }))

  it.effect("flush keeps a buffered message when no taker is waiting", () =>
    Effect.gen(function*() {
      const queue = yield* Queue.unbounded<number>()
      Queue.offerUnsafe(queue, 1)

      yield* Queue.flush(queue)

      assert.strictEqual(yield* Queue.take(queue), 1)
    }))

  it.effect("flushUnsafe preserves later offers when the queue is empty", () =>
    Effect.gen(function*() {
      const queue = yield* Queue.unbounded<number>()
      const first = yield* Queue.take(queue).pipe(Effect.forkChild)
      const second = yield* Queue.take(queue).pipe(Effect.forkChild)
      yield* Effect.yieldNow

      Queue.flushUnsafe(queue)
      yield* Queue.offerAll(queue, [1, 2])

      const values = yield* Effect.all([Fiber.join(first), Fiber.join(second)])
      assert.deepStrictEqual(new Set(values), new Set([1, 2]))
      yield* Queue.shutdown(queue)
    }))

  it.effect("bounded 0 capacity", () =>
    Effect.gen(function*() {
      const queue = yield* Queue.bounded<number>(0)
      yield* Queue.offer(queue, 1).pipe(Effect.forkChild)
      let result = yield* Queue.take(queue)
      assert.strictEqual(result, 1)
      const fiber = yield* Queue.take(queue).pipe(Effect.forkChild)
      yield* Queue.offer(queue, 2)
      result = yield* Fiber.join(fiber)
      assert.strictEqual(result, 2)
    }))

  it.effect("zero-capacity takeAll consumes buffered messages before pending offers", () =>
    Effect.gen(function*() {
      const queue = yield* Queue.bounded<number>(0)
      const waiting = yield* Queue.take(queue).pipe(Effect.forkChild({ startImmediately: true }))
      const producer = yield* Queue.offerAll(queue, [1, 2]).pipe(Effect.forkChild({ startImmediately: true }))

      const batch = yield* Queue.takeAll(queue)
      const next = yield* Fiber.join(waiting)
      yield* Fiber.join(producer)

      assert.deepStrictEqual(batch, [1])
      assert.strictEqual(next, 2)
    }))

  it.effect("zero-capacity offerAll drains in order and completes a closing queue", () =>
    Effect.gen(function*() {
      const queue = yield* Queue.bounded<number, Cause.Done>(0)
      const producer = yield* Queue.offerAll(queue, [1, 2, 3]).pipe(Effect.forkChild({ startImmediately: true }))

      const first = yield* Queue.takeAll(queue)
      yield* Queue.end(queue)
      const second = yield* Queue.clear(queue)
      const third = yield* Queue.poll(queue)
      const producerExit = producer.pollUnsafe()
      const done = yield* Effect.exit(Queue.await(queue))

      assert.deepStrictEqual(first, [1])
      assert.deepStrictEqual(second, [2])
      assert.deepStrictEqual(third, Option.some(3))
      assert.deepStrictEqual(producerExit, Exit.succeed([]))
      assert.deepStrictEqual(done, Exit.void)
    }))
})
