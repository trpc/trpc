import { assert, describe, it } from "@effect/vitest"
import { Cause, Effect, Fiber, Option, Result, TxQueue } from "effect"

describe("TxQueue", () => {
  describe("interfaces", () => {
    it.effect("TxEnqueue provides write-only interface", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number>(5)

        // Can assign to TxEnqueue interface
        const enqueue: TxQueue.TxEnqueue<number> = queue

        // TxEnqueue type guard should work
        assert.strictEqual(TxQueue.isTxEnqueue(enqueue), true)

        // Can use enqueue operations
        const offered = yield* TxQueue.offer(queue, 42)
        assert.strictEqual(offered, true)

        const rejected = yield* TxQueue.offerAll(queue, [1, 2, 3])
        assert.deepStrictEqual(rejected, [])
      })))

    it.effect("TxDequeue provides read-only interface", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number>(5)
        yield* TxQueue.offerAll(queue, [1, 2, 3])

        // Can assign to TxDequeue interface
        const dequeue: TxQueue.TxDequeue<number> = queue

        // TxDequeue type guard should work
        assert.strictEqual(TxQueue.isTxDequeue(dequeue), true)

        // Can use dequeue operations
        const item = yield* TxQueue.take(queue)
        assert.strictEqual(item, 1)

        const maybe = yield* TxQueue.poll(queue)
        assert.deepStrictEqual(maybe, Option.some(2))
      })))

    it.effect("TxQueue provides both enqueue and dequeue operations", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number>(5)

        // TxQueue should be both TxEnqueue and TxDequeue
        assert.strictEqual(TxQueue.isTxQueue(queue), true)
        assert.strictEqual(TxQueue.isTxEnqueue(queue), true)
        assert.strictEqual(TxQueue.isTxDequeue(queue), true)

        // Can use both enqueue and dequeue operations
        yield* TxQueue.offer(queue, 42)
        const item = yield* TxQueue.take(queue)
        assert.strictEqual(item, 42)
      })))
  })

  describe("interface segregation", () => {
    it.effect("TxEnqueue interface enforces write-only operations", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number, string | Cause.Done>(5)
        const enqueue: TxQueue.TxEnqueue<number, string | Cause.Done> = queue

        // Enqueue operations should work
        const accepted = yield* TxQueue.offer(enqueue, 42)
        assert.strictEqual(accepted, true)

        const rejected = yield* TxQueue.offerAll(enqueue, [1, 2, 3])
        assert.deepStrictEqual(rejected, [])

        // State management operations should work
        const result = yield* TxQueue.failCause(enqueue, Cause.interrupt())
        assert.strictEqual(result, true)

        const endResult = yield* TxQueue.end(enqueue)
        assert.strictEqual(endResult, false) // Already done
      })))

    it.effect("TxDequeue interface enforces read-only operations", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number, string>(5)
        yield* TxQueue.offerAll(queue, [1, 2, 3])
        const dequeue: TxQueue.TxDequeue<number, string> = queue

        // Dequeue operations should work
        const item = yield* TxQueue.take(dequeue)
        assert.strictEqual(item, 1)

        const maybe = yield* TxQueue.poll(dequeue)
        assert.deepStrictEqual(maybe, Option.some(2))

        const peek = yield* TxQueue.peek(dequeue)
        assert.strictEqual(peek, 3) // Should be 3 since we took 1 and poll took 2

        // State inspection operations should work
        const size = yield* TxQueue.size(dequeue)
        assert.strictEqual(size, 1)

        const isEmpty = yield* TxQueue.isEmpty(dequeue)
        assert.strictEqual(isEmpty, false)

        const isOpen = yield* TxQueue.isOpen(dequeue)
        assert.strictEqual(isOpen, true)
      })))

    it.effect("Interface assignments maintain type safety", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number>(5)

        // Full queue can be assigned to either interface
        const enqueue: TxQueue.TxEnqueue<number> = queue
        const dequeue: TxQueue.TxDequeue<number> = queue
        const fullQueue: TxQueue.TxQueue<number> = queue

        // Verify all interfaces maintain functionality
        yield* TxQueue.offer(enqueue, 1)
        yield* TxQueue.offer(fullQueue, 2)

        const item1 = yield* TxQueue.take(dequeue)
        const item2 = yield* TxQueue.take(fullQueue)

        assert.strictEqual(item1, 1)
        assert.strictEqual(item2, 2)

        // State queries work on all interfaces
        const size1 = yield* TxQueue.size(dequeue)
        const size2 = yield* TxQueue.size(fullQueue)
        assert.strictEqual(size1, size2)
      })))

    it.effect("Interface type guards work correctly", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number>(5)
        const enqueue: TxQueue.TxEnqueue<number> = queue
        const dequeue: TxQueue.TxDequeue<number> = queue

        // All type guards should return true for interfaces implemented by TxQueue
        assert.strictEqual(TxQueue.isTxQueue(queue), true)
        assert.strictEqual(TxQueue.isTxEnqueue(enqueue), true)
        assert.strictEqual(TxQueue.isTxDequeue(dequeue), true)

        // Cross-interface type guards should work since TxQueue implements both
        assert.strictEqual(TxQueue.isTxEnqueue(queue), true)
        assert.strictEqual(TxQueue.isTxDequeue(queue), true)
        assert.strictEqual(TxQueue.isTxQueue(enqueue), true)
        assert.strictEqual(TxQueue.isTxQueue(dequeue), true)
      })))
  })

  describe("constructors", () => {
    it.effect("bounded creates queue with specified capacity", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number>(5)
        const size = yield* TxQueue.size(queue)
        const isEmpty = yield* TxQueue.isEmpty(queue)

        assert.strictEqual(size, 0)
        assert.strictEqual(isEmpty, true)
      })))

    it.effect("unbounded creates queue with unlimited capacity", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.unbounded<string>()
        const size = yield* TxQueue.size(queue)
        const isEmpty = yield* TxQueue.isEmpty(queue)

        assert.strictEqual(size, 0)
        assert.strictEqual(isEmpty, true)
      })))

    it.effect("dropping creates queue with dropping strategy", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.dropping<number>(2)
        const size = yield* TxQueue.size(queue)
        const isEmpty = yield* TxQueue.isEmpty(queue)

        assert.strictEqual(size, 0)
        assert.strictEqual(isEmpty, true)
      })))

    it.effect("sliding creates queue with sliding strategy", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.sliding<number>(2)
        const size = yield* TxQueue.size(queue)
        const isEmpty = yield* TxQueue.isEmpty(queue)

        assert.strictEqual(size, 0)
        assert.strictEqual(isEmpty, true)
      })))
  })

  describe("basic operations", () => {
    it.effect("offer and take work correctly", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<string>(10)

        const offered = yield* TxQueue.offer(queue, "hello")
        assert.strictEqual(offered, true)

        const item = yield* TxQueue.take(queue)
        assert.strictEqual(item, "hello")
      })))

    it.effect("poll returns Option.none for empty queue", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number>(10)

        const maybe = yield* TxQueue.poll(queue)
        assert.deepStrictEqual(maybe, Option.none())
      })))

    it.effect("poll returns Option.some for non-empty queue", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number>(10)
        yield* TxQueue.offer(queue, 42)

        const maybe = yield* TxQueue.poll(queue)
        assert.deepStrictEqual(maybe, Option.some(42))
      })))

    it.effect("poll completes a closing queue after removing the last item", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number>(1)
        yield* TxQueue.offer(queue, 42)
        yield* TxQueue.interrupt(queue)

        assert.deepStrictEqual(yield* TxQueue.poll(queue), Option.some(42))
        assert.strictEqual(yield* TxQueue.isDone(queue), true)
      })))

    it.effect("clear completes a closing queue after removing all items", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number>(1)
        yield* TxQueue.offer(queue, 42)
        yield* TxQueue.interrupt(queue)

        assert.deepStrictEqual(yield* TxQueue.clear(queue), [42])
        assert.strictEqual(yield* TxQueue.isDone(queue), true)
      })))

    it.effect("offerAll works correctly", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number>(10)

        const rejected = yield* TxQueue.offerAll(queue, [1, 2, 3, 4, 5])
        assert.deepStrictEqual(rejected, [])

        const size = yield* TxQueue.size(queue)
        assert.strictEqual(size, 5)
      })))

    it.effect("offerAll preserves a one-shot iterable across retries and runs", () =>
      Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number>(1)
        yield* TxQueue.offer(queue, 1)

        const values = (function*() {
          yield 2
        })()
        const offer = TxQueue.offerAll(queue, values)
        const fiber = yield* Effect.forkChild(offer, { startImmediately: true })

        assert.strictEqual(yield* TxQueue.take(queue), 1)
        assert.deepStrictEqual(yield* Fiber.join(fiber), [])
        assert.deepStrictEqual(yield* TxQueue.poll(queue), Option.some(2))

        assert.deepStrictEqual(yield* offer, [])
        assert.deepStrictEqual(yield* TxQueue.poll(queue), Option.some(2))
      }))

    it.effect("takeAll works correctly with new signature", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number>(10)
        yield* TxQueue.offerAll(queue, [1, 2, 3, 4, 5])

        const items = yield* TxQueue.takeAll(queue)
        assert.deepStrictEqual(items, [1, 2, 3, 4, 5])

        const size = yield* TxQueue.size(queue)
        assert.strictEqual(size, 0)
      })))

    it.effect("takeAll with interrupted queue returns done flag", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number>(10)
        yield* TxQueue.offerAll(queue, [1, 2])
        yield* TxQueue.interrupt(queue) // Interrupt the queue

        // takeAll should return all items
        const items = yield* TxQueue.takeAll(queue)
        assert.deepStrictEqual(items, [1, 2])
      })))

    it.effect("takeAll with failed queue propagates error", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number, string>(10)
        yield* TxQueue.offerAll(queue, [1, 2])
        yield* TxQueue.fail(queue, "queue failed")

        // takeAll should fail with the queue error
        const result = yield* Effect.flip(TxQueue.takeAll(queue))
        assert.strictEqual(result, "queue failed")
      })))

    it.effect("takeN works correctly with new signature", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number>(10)
        yield* TxQueue.offerAll(queue, [1, 2, 3, 4, 5])

        const items = yield* TxQueue.takeN(queue, 3)
        assert.deepStrictEqual(items, [1, 2, 3])

        const size = yield* TxQueue.size(queue)
        assert.strictEqual(size, 2)
      })))

    it.effect("takeN and takeBetween normalize element counts before waiting", () =>
      Effect.tx(Effect.gen(function*() {
        const takeNQueue = yield* TxQueue.unbounded<number>()
        yield* TxQueue.offer(takeNQueue, 1)
        assert.deepStrictEqual(yield* TxQueue.takeN(takeNQueue, 1.9), [1])

        const takeBetweenQueue = yield* TxQueue.unbounded<number>()
        yield* TxQueue.offer(takeBetweenQueue, 1)
        assert.deepStrictEqual(yield* TxQueue.takeBetween(takeBetweenQueue, 1.9, 2.9), [1])

        const invalidQueue = yield* TxQueue.unbounded<number>()
        yield* TxQueue.offer(invalidQueue, 1)
        assert.deepStrictEqual(yield* TxQueue.takeN(invalidQueue, Number.NaN), [])
        assert.deepStrictEqual(yield* TxQueue.takeAll(invalidQueue), [1])
      })))

    it.effect("takeN with queue completion gets available items", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number>(10)
        yield* TxQueue.offerAll(queue, [1, 2])
        yield* TxQueue.interrupt(queue) // Interrupt the queue

        // Take more than available - should get all items
        const items = yield* TxQueue.takeN(queue, 5)
        assert.deepStrictEqual(items, [1, 2])
      })))

    it.effect("takeN with failed queue propagates error", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number, string>(10)
        yield* TxQueue.offerAll(queue, [1, 2, 3])
        yield* TxQueue.fail(queue, "queue failed")

        // takeN should fail with the queue error
        const result = yield* Effect.flip(TxQueue.takeN(queue, 2))
        assert.strictEqual(result, "queue failed")
      })))

    it.effect("takeN with capacity constraint takes available items", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number>(3) // Capacity is 3
        yield* TxQueue.offerAll(queue, [1, 2, 3]) // Fill to capacity

        // Request more than capacity - should take all available immediately
        const items = yield* TxQueue.takeN(queue, 10)
        assert.deepStrictEqual(items, [1, 2, 3])

        const size = yield* TxQueue.size(queue)
        assert.strictEqual(size, 0)
      })))

    it.effect("takeAll() on empty closed queue gets interrupted", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number>(5)
        yield* TxQueue.interrupt(queue) // Empty queue becomes Done immediately

        // takeAll should get interrupted since queue is Done
        const result = yield* Effect.exit(TxQueue.takeAll(queue))
        assert.strictEqual(result._tag, "Failure")
        if (result._tag === "Failure") {
          assert.strictEqual(Cause.hasInterruptsOnly(result.cause), true)
        }
      })))

    it.effect("takeAll() waits when empty then returns items when available", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number>(5)

        // Start takeAll in a fiber - it should wait because queue is empty
        const fiber = yield* Effect.forkChild(TxQueue.takeAll(queue))

        // Add items to the queue
        yield* TxQueue.offerAll(queue, [1, 2, 3])

        // Now takeAll should complete and return the items
        const items = yield* Fiber.join(fiber)
        assert.deepStrictEqual(items, [1, 2, 3])
      })))

    it.effect("takeAll() during state transition handles race condition", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number>(5)
        yield* TxQueue.offerAll(queue, [1, 2])

        // Interrupt queue to put it in Closing state
        yield* TxQueue.interrupt(queue)

        // takeAll should get items and transition queue to Done
        const items = yield* TxQueue.takeAll(queue)
        assert.deepStrictEqual(items, [1, 2])

        // Verify queue is now Done
        const isDone = yield* TxQueue.isDone(queue)
        assert.strictEqual(isDone, true)
      })))

    it.effect("takeN(0) returns empty array", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number>(5)
        yield* TxQueue.offerAll(queue, [1, 2, 3])

        const items = yield* TxQueue.takeN(queue, 0)
        assert.deepStrictEqual(items, [])

        // Queue should still have all items
        const size = yield* TxQueue.size(queue)
        assert.strictEqual(size, 3)
      })))

    it.effect("takeN() with closing queue returns available items", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number>(5)
        yield* TxQueue.offerAll(queue, [1, 2])
        yield* TxQueue.interrupt(queue) // Put in Closing state

        // Request more than available - should get what's available and transition to Done
        const items = yield* TxQueue.takeN(queue, 5)
        assert.deepStrictEqual(items, [1, 2])

        // Queue should now be Done
        const isDone = yield* TxQueue.isDone(queue)
        assert.strictEqual(isDone, true)
      })))

    it.effect("takeN() signature validation - returns Array<A> not [Array<A>, boolean]", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number>(5)
        yield* TxQueue.offerAll(queue, [1, 2, 3])

        const items = yield* TxQueue.takeN(queue, 2)

        // Verify return type is Array<A>, not [Array<A>, boolean]
        assert.strictEqual(Array.isArray(items), true)
        assert.deepStrictEqual(items, [1, 2])

        // Verify it's not a tuple - should not have boolean as second element
        assert.strictEqual(typeof items[2], "undefined")
      })))

    it.effect("takeBetween() basic functionality", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number>(10)
        yield* TxQueue.offerAll(queue, [1, 2, 3, 4, 5, 6, 7, 8])

        // Take between 2 and 5 items
        const batch1 = yield* TxQueue.takeBetween(queue, 2, 5)
        assert.strictEqual(batch1.length, 5)
        assert.deepStrictEqual(batch1, [1, 2, 3, 4, 5])

        // Take between 1 and 10 items (but only 3 remain)
        const batch2 = yield* TxQueue.takeBetween(queue, 1, 10)
        assert.strictEqual(batch2.length, 3)
        assert.deepStrictEqual(batch2, [6, 7, 8])

        // Verify queue is empty
        const empty = yield* TxQueue.isEmpty(queue)
        assert.strictEqual(empty, true)
      })))

    it.effect("takeBetween() takes up to maximum when available", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number>(10)
        yield* TxQueue.offerAll(queue, [1, 2, 3, 4, 5, 6, 7])

        // Take between 3 and 5 items - should take exactly 5 (the maximum)
        const items = yield* TxQueue.takeBetween(queue, 3, 5)
        assert.strictEqual(items.length, 5)
        assert.deepStrictEqual(items, [1, 2, 3, 4, 5])

        // Remaining items should still be in queue
        const remaining = yield* TxQueue.takeAll(queue)
        assert.deepStrictEqual(remaining, [6, 7])
      })))

    it.effect("takeBetween() with invalid parameters", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number>(10)
        yield* TxQueue.offerAll(queue, [1, 2, 3])

        // Invalid parameters should return empty array
        const result1 = yield* TxQueue.takeBetween(queue, 0, 5)
        assert.deepStrictEqual(result1, [])

        const result2 = yield* TxQueue.takeBetween(queue, -1, 5)
        assert.deepStrictEqual(result2, [])

        const result3 = yield* TxQueue.takeBetween(queue, 5, 2) // min > max
        assert.deepStrictEqual(result3, [])

        // Queue should still have all items
        const size = yield* TxQueue.size(queue)
        assert.strictEqual(size, 3)
      })))

    it.effect("takeBetween() with failed queue propagates error", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number, string>(10)
        yield* TxQueue.fail(queue, "test error")

        const result = yield* Effect.exit(TxQueue.takeBetween(queue, 1, 5))
        assert.strictEqual(result._tag, "Failure")
        if (result._tag === "Failure") {
          const error = Cause.findError(result.cause)
          assert.ok(Result.isSuccess(error))
          assert.strictEqual(error.success, "test error")
        }
      })))

    it.effect("takeBetween() with closing queue returns available items", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number>(10)
        yield* TxQueue.offerAll(queue, [1, 2])

        // Start closing process
        yield* TxQueue.interrupt(queue)

        // Should return available items even if less than minimum
        const items = yield* TxQueue.takeBetween(queue, 3, 5)
        assert.deepStrictEqual(items, [1, 2])

        // Queue should be done now
        const done = yield* TxQueue.isDone(queue)
        assert.strictEqual(done, true)
      })))

    it.effect("takeBetween() exact minimum and maximum", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number>(10)
        yield* TxQueue.offerAll(queue, [1, 2, 3])

        // Take exactly 3 items (min=max=3)
        const items = yield* TxQueue.takeBetween(queue, 3, 3)
        assert.strictEqual(items.length, 3)
        assert.deepStrictEqual(items, [1, 2, 3])

        const empty = yield* TxQueue.isEmpty(queue)
        assert.strictEqual(empty, true)
      })))

    it.effect("takeBetween() returns Array<A> not tuple", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number>(5)
        yield* TxQueue.offerAll(queue, [1, 2, 3, 4])

        const items = yield* TxQueue.takeBetween(queue, 2, 3)

        // Verify return type is Array<A>, not [Array<A>, boolean]
        assert.strictEqual(Array.isArray(items), true)
        assert.deepStrictEqual(items, [1, 2, 3])

        // Verify it's not a tuple - should not have boolean as extra element
        assert.strictEqual(typeof items[3], "undefined")
      })))

    it.effect("peek works correctly", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number>(10)
        yield* TxQueue.offer(queue, 42)

        const item = yield* TxQueue.peek(queue)
        assert.strictEqual(item, 42)

        // Item should still be in queue
        const size = yield* TxQueue.size(queue)
        assert.strictEqual(size, 1)
      })))
  })

  describe("queue state", () => {
    it.effect("size returns correct count", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number>(10)
        yield* TxQueue.offerAll(queue, [1, 2, 3])

        const size = yield* TxQueue.size(queue)
        assert.strictEqual(size, 3)
      })))

    it.effect("isEmpty and isNonEmpty reflect queue contents", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number>(10)

        assert.strictEqual(yield* TxQueue.isEmpty(queue), true)
        assert.strictEqual(yield* TxQueue.isNonEmpty(queue), false)

        yield* TxQueue.offer(queue, 1)
        assert.strictEqual(yield* TxQueue.isEmpty(queue), false)
        assert.strictEqual(yield* TxQueue.isNonEmpty(queue), true)
      })))

    it.effect("isFull works correctly for bounded queue", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number>(2)

        const full1 = yield* TxQueue.isFull(queue)
        assert.strictEqual(full1, false)

        yield* TxQueue.offerAll(queue, [1, 2])
        const full2 = yield* TxQueue.isFull(queue)
        assert.strictEqual(full2, true)
      })))

    it.effect("isFull returns false for unbounded queue", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.unbounded<number>()
        yield* TxQueue.offerAll(queue, [1, 2, 3, 4, 5])

        const full = yield* TxQueue.isFull(queue)
        assert.strictEqual(full, false)
      })))
  })

  describe("clear", () => {
    it.effect("clear removes all items from queue and returns them", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number>(10)
        yield* TxQueue.offerAll(queue, [1, 2, 3, 4, 5])

        const sizeBefore = yield* TxQueue.size(queue)
        assert.strictEqual(sizeBefore, 5)

        const cleared = yield* TxQueue.clear(queue)
        assert.deepStrictEqual(cleared, [1, 2, 3, 4, 5])

        const sizeAfter = yield* TxQueue.size(queue)
        assert.strictEqual(sizeAfter, 0)

        const isEmpty = yield* TxQueue.isEmpty(queue)
        assert.strictEqual(isEmpty, true)
      })))

    it.effect("clear does not affect queue state", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number>(10)
        yield* TxQueue.offerAll(queue, [1, 2, 3])

        const cleared = yield* TxQueue.clear(queue)
        assert.deepStrictEqual(cleared, [1, 2, 3])

        // Queue should still be open
        const isOpen = yield* TxQueue.isOpen(queue)
        assert.strictEqual(isOpen, true)

        // Should be able to offer new items
        const offered = yield* TxQueue.offer(queue, 42)
        assert.strictEqual(offered, true)

        const size = yield* TxQueue.size(queue)
        assert.strictEqual(size, 1)
      })))

    it.effect("clear works on empty queue", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number>(10)

        const cleared = yield* TxQueue.clear(queue)
        assert.deepStrictEqual(cleared, [])

        const size = yield* TxQueue.size(queue)
        assert.strictEqual(size, 0)

        const isEmpty = yield* TxQueue.isEmpty(queue)
        assert.strictEqual(isEmpty, true)
      })))

    it.effect("clear works on queue ended with Done", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number, Cause.Done>(10)
        yield* TxQueue.offerAll(queue, [1, 2, 3])
        yield* TxQueue.end(queue)

        // Take all items to move from Closing to Done state
        yield* TxQueue.takeAll(queue)

        // Verify it's done before clearing
        const isDoneBefore = yield* TxQueue.isDone(queue)
        assert.strictEqual(isDoneBefore, true)

        // clear() returns empty array for halt causes (like Done)
        const cleared = yield* TxQueue.clear(queue)
        assert.deepStrictEqual(cleared, [])

        const size = yield* TxQueue.size(queue)
        assert.strictEqual(size, 0)

        // Should still be done after clearing
        const isDoneAfter = yield* TxQueue.isDone(queue)
        assert.strictEqual(isDoneAfter, true)
      })))
  })

  describe("shutdown", () => {
    it.effect("shutdown and isShutdown work correctly", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number>(10)

        const isShutdown1 = yield* TxQueue.isShutdown(queue)
        assert.strictEqual(isShutdown1, false)

        yield* TxQueue.shutdown(queue)
        const isShutdown2 = yield* TxQueue.isShutdown(queue)
        assert.strictEqual(isShutdown2, true)
      })))

    it.effect("offer fails after shutdown", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number>(10)
        yield* TxQueue.shutdown(queue)

        const offered = yield* TxQueue.offer(queue, 42)
        assert.strictEqual(offered, false)
      })))

    it.effect("poll returns none after shutdown", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number>(10)
        yield* TxQueue.offer(queue, 42)
        yield* TxQueue.shutdown(queue)

        const maybe = yield* TxQueue.poll(queue)
        assert.deepStrictEqual(maybe, Option.none())
      })))
  })

  describe("dropping strategy", () => {
    it.effect("dropping queue rejects items when full", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.dropping<number>(2)

        // Fill to capacity
        const accepted1 = yield* TxQueue.offer(queue, 1)
        const accepted2 = yield* TxQueue.offer(queue, 2)
        assert.strictEqual(accepted1, true)
        assert.strictEqual(accepted2, true)

        // This should be dropped
        const accepted3 = yield* TxQueue.offer(queue, 3)
        assert.strictEqual(accepted3, false)

        const size = yield* TxQueue.size(queue)
        assert.strictEqual(size, 2)
      })))
  })

  describe("sliding strategy", () => {
    it.effect("sliding queue evicts old items when full", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.sliding<number>(2)

        // Fill to capacity
        yield* TxQueue.offer(queue, 1)
        yield* TxQueue.offer(queue, 2)

        // This should evict item 1
        const accepted = yield* TxQueue.offer(queue, 3)
        assert.strictEqual(accepted, true)

        const size = yield* TxQueue.size(queue)
        assert.strictEqual(size, 2)

        // First item should be 2 (item 1 was evicted)
        const item = yield* TxQueue.take(queue)
        assert.strictEqual(item, 2)
      })))
  })

  describe("E-channel and exit signaling", () => {
    describe("type ergonomics", () => {
      it.effect("default E parameter provides clean typing", () =>
        Effect.tx(Effect.gen(function*() {
          // Clean, concise typing with default E = never
          const queue = yield* TxQueue.bounded<number>(5)

          yield* TxQueue.offer(queue, 42)
          const item = yield* TxQueue.take(queue) // Effect<number, never>
          assert.strictEqual(item, 42)
        })))

      it.effect("explicit E parameter works correctly", () =>
        Effect.tx(Effect.gen(function*() {
          // Explicit error channel typing
          const queue = yield* TxQueue.bounded<number, string>(5)

          yield* TxQueue.offer(queue, 42)
          const item = yield* TxQueue.take(queue) // Effect<number, never> (no errors when queue is open)
          assert.strictEqual(item, 42)
        })))
    })

    describe("state transitions", () => {
      it.effect("queue starts in Open state", () =>
        Effect.tx(Effect.gen(function*() {
          const queue = yield* TxQueue.bounded<number>(5)

          const isOpen = yield* TxQueue.isOpen(queue)
          const isClosing = yield* TxQueue.isClosing(queue)
          const isDone = yield* TxQueue.isDone(queue)

          assert.strictEqual(isOpen, true)
          assert.strictEqual(isClosing, false)
          assert.strictEqual(isDone, false)
        })))

      it.effect("interrupt() transitions Open → Done when empty", () =>
        Effect.tx(Effect.gen(function*() {
          const queue = yield* TxQueue.bounded<number>(5)

          const result = yield* TxQueue.interrupt(queue)
          assert.strictEqual(result, true)

          const isOpen = yield* TxQueue.isOpen(queue)
          const isClosing = yield* TxQueue.isClosing(queue)
          const isDone = yield* TxQueue.isDone(queue)

          assert.strictEqual(isOpen, false)
          assert.strictEqual(isClosing, false)
          assert.strictEqual(isDone, true)
        })))

      it.effect("interrupt() transitions Open → Closing → Done when not empty", () =>
        Effect.tx(Effect.gen(function*() {
          const queue = yield* TxQueue.bounded<number>(5)
          yield* TxQueue.offerAll(queue, [1, 2, 3])

          const result = yield* TxQueue.interrupt(queue)
          assert.strictEqual(result, true)

          // Should be in Closing state
          const isOpen1 = yield* TxQueue.isOpen(queue)
          const isClosing1 = yield* TxQueue.isClosing(queue)
          const isDone1 = yield* TxQueue.isDone(queue)

          assert.strictEqual(isOpen1, false)
          assert.strictEqual(isClosing1, true)
          assert.strictEqual(isDone1, false)

          // Take all items to trigger Closing → Done
          yield* TxQueue.takeAll(queue)

          // Should now be Done
          const isOpen2 = yield* TxQueue.isOpen(queue)
          const isClosing2 = yield* TxQueue.isClosing(queue)
          const isDone2 = yield* TxQueue.isDone(queue)

          assert.strictEqual(isOpen2, false)
          assert.strictEqual(isClosing2, false)
          assert.strictEqual(isDone2, true)
        })))

      it.effect("fail() transitions directly to Done", () =>
        Effect.tx(Effect.gen(function*() {
          const queue = yield* TxQueue.bounded<number, string>(5)
          yield* TxQueue.offer(queue, 42)

          const result = yield* TxQueue.fail(queue, "test error")
          assert.strictEqual(result, true)

          const isOpen = yield* TxQueue.isOpen(queue)
          const isClosing = yield* TxQueue.isClosing(queue)
          const isDone = yield* TxQueue.isDone(queue)

          assert.strictEqual(isOpen, false)
          assert.strictEqual(isClosing, false)
          assert.strictEqual(isDone, true)
        })))

      it.effect("done() with custom cause works correctly", () =>
        Effect.tx(Effect.gen(function*() {
          const queue = yield* TxQueue.bounded<number>(5)

          const customCause = Cause.interrupt()
          const result = yield* TxQueue.failCause(queue, customCause)
          assert.strictEqual(result, true)

          const isDone = yield* TxQueue.isDone(queue)
          assert.strictEqual(isDone, true)
        })))
    })

    describe("completion operations", () => {
      it.effect("interrupt() completes queue successfully", () =>
        Effect.tx(Effect.gen(function*() {
          const queue = yield* TxQueue.bounded<number>(5)

          const interruptResult = yield* TxQueue.interrupt(queue)
          assert.strictEqual(interruptResult, true)

          // awaitCompletion should succeed
          yield* TxQueue.awaitCompletion(queue)
        })))

      it.effect("fail() completes queue with error", () =>
        Effect.tx(Effect.gen(function*() {
          const queue = yield* TxQueue.bounded<number, string>(5)

          const failResult = yield* TxQueue.fail(queue, "test error")
          assert.strictEqual(failResult, true)

          // awaitCompletion should succeed once queue is done (not propagate the error)
          yield* TxQueue.awaitCompletion(queue)
        })))

      it.effect("multiple interrupt() calls return false after first", () =>
        Effect.tx(Effect.gen(function*() {
          const queue = yield* TxQueue.bounded<number>(5)

          const result1 = yield* TxQueue.interrupt(queue)
          const result2 = yield* TxQueue.interrupt(queue)

          assert.strictEqual(result1, true)
          assert.strictEqual(result2, false)
        })))

      it.effect("operations on closed queue fail appropriately", () =>
        Effect.tx(Effect.gen(function*() {
          const queue = yield* TxQueue.bounded<number>(5)
          yield* TxQueue.interrupt(queue)

          // Offer should return false
          const offerResult = yield* TxQueue.offer(queue, 42)
          assert.strictEqual(offerResult, false)

          // Poll should return none
          const pollResult = yield* TxQueue.poll(queue)
          assert.deepStrictEqual(pollResult, Option.none())
        })))
    })

    describe("awaitCompletion operation", () => {
      it.effect("awaitCompletion succeeds when queue is interrupted", () =>
        Effect.tx(Effect.gen(function*() {
          const queue = yield* TxQueue.bounded<number>(5)
          yield* TxQueue.interrupt(queue)

          // Should succeed immediately when queue is already interrupted
          yield* TxQueue.awaitCompletion(queue)
        })))

      it.effect("awaitCompletion succeeds when queue fails", () =>
        Effect.tx(Effect.gen(function*() {
          const queue = yield* TxQueue.bounded<number, string>(5)
          yield* TxQueue.fail(queue, "connection lost")

          // Should succeed immediately since queue is done (errors are not propagated)
          yield* TxQueue.awaitCompletion(queue)
        })))

      it.effect("awaitCompletion on already completed queue", () =>
        Effect.tx(Effect.gen(function*() {
          const queue = yield* TxQueue.bounded<number>(5)
          yield* TxQueue.interrupt(queue)

          // Should immediately succeed
          yield* TxQueue.awaitCompletion(queue)
        })))

      it.effect("awaitCompletion on already failed queue", () =>
        Effect.tx(Effect.gen(function*() {
          const queue = yield* TxQueue.bounded<number, string>(5)
          yield* TxQueue.fail(queue, "already failed")

          // Should immediately succeed since queue is done
          yield* TxQueue.awaitCompletion(queue)
        })))

      it.effect("awaitCompletion with custom Cause.die() succeeds", () =>
        Effect.tx(Effect.gen(function*() {
          const queue = yield* TxQueue.bounded<number, string>(5)
          const defect = new Error("system failure")
          const defectCause = Cause.die(defect)

          yield* TxQueue.failCause(queue, defectCause)

          // awaitCompletion should succeed since queue is done (defects are not propagated)
          yield* TxQueue.awaitCompletion(queue)
        })))

      it.effect("awaitCompletion with custom interrupt cause succeeds", () =>
        Effect.tx(Effect.gen(function*() {
          const queue = yield* TxQueue.bounded<number>(5)
          const customInterrupt = Cause.interrupt(12345)

          yield* TxQueue.failCause(queue, customInterrupt)

          // awaitCompletion should succeed with interrupt-only causes
          yield* TxQueue.awaitCompletion(queue)
        })))

      it.effect("awaitCompletion with fail cause succeeds", () =>
        Effect.tx(Effect.gen(function*() {
          const queue = yield* TxQueue.bounded<number, string>(5)

          // Complete queue with failure cause
          yield* TxQueue.fail(queue, "priority error")

          // awaitCompletion should succeed since queue is done (failures are not propagated)
          yield* TxQueue.awaitCompletion(queue)
        })))

      it.effect("awaitCompletion concurrent behavior works", () =>
        Effect.tx(Effect.gen(function*() {
          const queue = yield* TxQueue.bounded<number>(5)

          // Interrupt first, then await completion - should succeed immediately
          yield* TxQueue.interrupt(queue)
          yield* TxQueue.awaitCompletion(queue)
        })))
    })

    describe("legacy compatibility", () => {
      it.effect("isShutdown works as alias for isDone", () =>
        Effect.tx(Effect.gen(function*() {
          const queue = yield* TxQueue.bounded<number>(5)

          const shutdown1 = yield* TxQueue.isShutdown(queue)
          const done1 = yield* TxQueue.isDone(queue)
          assert.strictEqual(shutdown1, done1)
          assert.strictEqual(shutdown1, false)

          yield* TxQueue.shutdown(queue)

          const shutdown2 = yield* TxQueue.isShutdown(queue)
          const done2 = yield* TxQueue.isDone(queue)
          assert.strictEqual(shutdown2, done2)
          assert.strictEqual(shutdown2, true)
        })))

      it.effect("shutdown() clears queue and marks as done", () =>
        Effect.tx(Effect.gen(function*() {
          const queue = yield* TxQueue.bounded<number>(5)
          yield* TxQueue.offerAll(queue, [1, 2, 3])

          yield* TxQueue.shutdown(queue)

          const size = yield* TxQueue.size(queue)
          const isDone = yield* TxQueue.isDone(queue)

          assert.strictEqual(size, 0)
          assert.strictEqual(isDone, true)
        })))
    })

    describe("error channel behavior", () => {
      it.effect("take() on successfully interrupted queue interrupts", () =>
        Effect.tx(Effect.gen(function*() {
          const queue = yield* TxQueue.bounded<number>(5)
          yield* TxQueue.interrupt(queue)

          // take() should interrupt on successfully interrupted queue
          const result = yield* Effect.exit(TxQueue.take(queue))
          assert.strictEqual(result._tag, "Failure")
        })))

      it.effect("take() on failed queue fails with error directly", () =>
        Effect.tx(Effect.gen(function*() {
          const queue = yield* TxQueue.bounded<number, string>(5)
          yield* TxQueue.fail(queue, "test error")

          // take() should fail with the error directly
          const result = yield* Effect.flip(TxQueue.take(queue))
          assert.strictEqual(result, "test error")
        })))

      it.effect("take() on shutdown queue interrupts (success exit)", () =>
        Effect.tx(Effect.gen(function*() {
          const queue = yield* TxQueue.bounded<number, string>(5)
          yield* TxQueue.shutdown(queue) // shutdown creates success exit

          // take() should interrupt since shutdown creates success exit
          const result = yield* Effect.exit(TxQueue.take(queue))
          assert.strictEqual(result._tag, "Failure")
        })))

      it.effect("take() with explicit interrupt cause propagates interruption", () =>
        Effect.tx(Effect.gen(function*() {
          const queue = yield* TxQueue.bounded<number, string>(5)
          const interruptCause = Cause.interrupt(123)
          yield* TxQueue.failCause(queue, interruptCause)

          // take() should propagate the interruption directly, not wrap in Option
          const result = yield* Effect.exit(TxQueue.take(queue))
          assert.strictEqual(result._tag, "Failure")
          // The cause should contain an interrupt, not a typed error
          if (result._tag === "Failure") {
            assert.strictEqual(Cause.hasInterrupts(result.cause), true)
          }
        })))

      it.effect("take() with custom Cause.fail extracts error correctly", () =>
        Effect.tx(Effect.gen(function*() {
          const queue = yield* TxQueue.bounded<number, Error>(5)
          const customError = new Error("custom failure")
          const customCause = Cause.fail(customError)

          yield* TxQueue.failCause(queue, customCause)

          // take() should extract the custom error directly
          const result = yield* Effect.flip(TxQueue.take(queue))
          assert.strictEqual(result, customError)
        })))

      it.effect("take() with Cause.die (defect) propagates defect", () =>
        Effect.tx(Effect.gen(function*() {
          const queue = yield* TxQueue.bounded<number, string>(5)
          const defect = new Error("unexpected defect")
          const defectCause = Cause.die(defect)

          yield* TxQueue.failCause(queue, defectCause)

          // take() should propagate the defect directly, not wrap in Option
          const result = yield* Effect.exit(TxQueue.take(queue))
          assert.strictEqual(result._tag, "Failure")
          // The cause should contain a defect
          if (result._tag === "Failure") {
            assert.strictEqual(Cause.hasDies(result.cause), true)
          }
        })))

      it.effect("take() with typed error cause extracts error directly", () =>
        Effect.tx(Effect.gen(function*() {
          const queue = yield* TxQueue.bounded<number, string>(5)

          // Create a cause with typed error
          const typedError = "typed error"
          const failCause = Cause.fail(typedError)

          yield* TxQueue.failCause(queue, failCause)

          // take() should extract the typed error directly
          const result = yield* Effect.flip(TxQueue.take(queue))
          assert.strictEqual(result, "typed error")
        })))

      it.effect("peek() on successfully interrupted queue interrupts", () =>
        Effect.tx(Effect.gen(function*() {
          const queue = yield* TxQueue.bounded<number>(5)
          yield* TxQueue.interrupt(queue)

          // peek() should interrupt on interrupted queue
          const result = yield* Effect.exit(TxQueue.peek(queue))
          assert.strictEqual(result._tag, "Failure")
        })))

      it.effect("peek() on failed queue fails with error directly", () =>
        Effect.tx(Effect.gen(function*() {
          const queue = yield* TxQueue.bounded<number, string>(5)
          yield* TxQueue.fail(queue, "peek error")

          // peek() should fail with the error directly
          const result = yield* Effect.flip(TxQueue.peek(queue))
          assert.strictEqual(result, "peek error")
        })))

      it.effect("poll() on failed queue returns none", () =>
        Effect.tx(Effect.gen(function*() {
          const queue = yield* TxQueue.bounded<number, string>(5)
          yield* TxQueue.offer(queue, 42)
          yield* TxQueue.fail(queue, "poll error")

          // poll() should return none on failed queue (doesn't propagate errors)
          const result = yield* TxQueue.poll(queue)
          assert.deepStrictEqual(result, Option.none())
        })))

      it.effect("takeN() with partial items available before failure", () =>
        Effect.tx(Effect.gen(function*() {
          const queue = yield* TxQueue.bounded<number, string>(5)
          yield* TxQueue.offerAll(queue, [1, 2])
          yield* TxQueue.fail(queue, "partial error")

          // takeN should fail even with some items available when queue is failed
          const result = yield* Effect.flip(TxQueue.takeN(queue, 3))
          assert.strictEqual(result, "partial error")
        })))

      it.effect("error propagation with different error types", () =>
        Effect.tx(Effect.gen(function*() {
          const queue1 = yield* TxQueue.bounded<number, Error>(5)
          const queue2 = yield* TxQueue.bounded<number, { code: number; message: string }>(5)

          const customError = new Error("custom error")
          const customObject = { code: 404, message: "not found" }

          yield* TxQueue.fail(queue1, customError)
          yield* TxQueue.fail(queue2, customObject)

          // Should propagate Error objects correctly
          const result1 = yield* Effect.flip(TxQueue.take(queue1))
          assert.strictEqual(result1, customError)

          // Should propagate custom object errors correctly
          const result2 = yield* Effect.flip(TxQueue.take(queue2))
          assert.deepStrictEqual(result2, customObject)
        })))

      it.effect("closing queue allows remaining items to be consumed", () =>
        Effect.tx(Effect.gen(function*() {
          const queue = yield* TxQueue.bounded<number>(5)
          yield* TxQueue.offerAll(queue, [1, 2, 3])

          // Interrupt the queue (puts it in Closing state)
          yield* TxQueue.interrupt(queue)

          // Should still be able to take items
          const item1 = yield* TxQueue.take(queue)
          const item2 = yield* TxQueue.take(queue)

          assert.strictEqual(item1, 1)
          assert.strictEqual(item2, 2)

          // Queue should still be closing
          const isClosing = yield* TxQueue.isClosing(queue)
          assert.strictEqual(isClosing, true)

          // Take last item - should transition to Done
          const item3 = yield* TxQueue.take(queue)
          assert.strictEqual(item3, 3)

          // Queue should now be Done
          const isDone = yield* TxQueue.isDone(queue)
          assert.strictEqual(isDone, true)
        })))
    })
  })

  describe("Done and end function", () => {
    it.effect("end() signals completion with Done", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number, Cause.Done>(5)
        yield* TxQueue.offer(queue, 1)
        yield* TxQueue.offer(queue, 2)

        // Signal the end of the queue
        const result = yield* TxQueue.end(queue)
        assert.strictEqual(result, true)

        // Queue should be closing since it has items
        const isClosing = yield* TxQueue.isClosing(queue)
        assert.strictEqual(isClosing, true)

        // Consume all items to transition to Done
        yield* TxQueue.takeAll(queue)

        // Queue should now be done
        const isDone = yield* TxQueue.isDone(queue)
        assert.strictEqual(isDone, true)
      })))

    it.effect("take() on ended queue fails with Done", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number, Cause.Done>(5)
        yield* TxQueue.offer(queue, 42)
        yield* TxQueue.end(queue)

        // First take should still get the item since queue is in Closing state
        const item = yield* TxQueue.take(queue)
        assert.strictEqual(item, 42)

        // Second take should fail with Done since queue is now done
        const takeResult = yield* Effect.flip(TxQueue.take(queue))
        assert.strictEqual(Cause.isDone(takeResult), true)
        assert.strictEqual(takeResult, Cause.Done())
      })))

    it.effect("end() works with TxEnqueue interface", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number, Cause.Done>(5)

        yield* TxQueue.offer(queue, 1)
        const result = yield* TxQueue.end(queue)
        assert.strictEqual(result, true)

        // Queue should be closing since it has items
        const isClosing = yield* TxQueue.isClosing(queue)
        assert.strictEqual(isClosing, true)

        // Consume the item to transition to Done
        yield* TxQueue.take(queue)

        // Now verify queue is done
        const isDone = yield* TxQueue.isDone(queue)
        assert.strictEqual(isDone, true)
      })))

    it.effect("end() returns false if queue is already done", () =>
      Effect.tx(Effect.gen(function*() {
        const queue = yield* TxQueue.bounded<number, Cause.Done>(5)

        // End the queue once
        const result1 = yield* TxQueue.end(queue)
        assert.strictEqual(result1, true)

        // Try to end it again
        const result2 = yield* TxQueue.end(queue)
        assert.strictEqual(result2, false)
      })))
  })
})
