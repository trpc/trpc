/**
 * Transactional queues whose state changes participate in Effect transactions.
 *
 * A `TxQueue<A, E>` stores values of type `A`, exposes write-only `TxEnqueue`
 * and read-only `TxDequeue` handles, and can complete, fail, or shut down with
 * causes observed by consumers. Queue operations can retry transactionally when
 * they cannot proceed, such as taking from an empty open queue or offering to a
 * full bounded queue. This makes the queue useful for coordinating producers
 * and consumers alongside other transactional state changes.
 *
 * @since 4.0.0
 */
import type * as Arr from "./Array.ts"
import * as Cause from "./Cause.ts"
import * as Chunk from "./Chunk.ts"
import * as Effect from "./Effect.ts"
import { dual } from "./Function.ts"
import type { Inspectable } from "./Inspectable.ts"
import { NodeInspectSymbol, toJson } from "./Inspectable.ts"
import * as Count from "./internal/count.ts"
import * as Option from "./Option.ts"
import { hasProperty } from "./Predicate.ts"
import { type ExcludeDone, isDoneCause } from "./Pull.ts"
import * as TxChunk from "./TxChunk.ts"
import * as TxRef from "./TxRef.ts"
import type * as Types from "./Types.ts"

/**
 * Represents the state of a transactional queue with sophisticated lifecycle management.
 *
 * **Details**
 *
 * The queue progresses through three states:
 * - **Open**: Accepting offers and serving takes normally
 * - **Closing**: No new offers accepted, serving remaining items until empty
 * - **Done**: Terminal state with completion cause, no further operations possible
 *
 * **Example** (Inspecting queue lifecycle states)
 *
 * ```ts import.meta.vitest
 * import type { TxQueue } from "effect"
 *
 * const state: TxQueue.State<string, Error> = { _tag: "Open" }
 * state._tag // => "Open"
 * ```
 *
 * @category models
 * @since 4.0.0
 */
export type State<_A, E> =
  | {
    readonly _tag: "Open"
  }
  | {
    readonly _tag: "Closing"
    readonly cause: Cause.Cause<E>
  }
  | {
    readonly _tag: "Done"
    readonly cause: Cause.Cause<E>
  }

const EnqueueTypeId = "~effect/TxQueue/Enqueue"
const DequeueTypeId = "~effect/TxQueue/Dequeue"
const TypeId = "~effect/TxQueue"

/**
 * Namespace containing type definitions for TxEnqueue variance annotations.
 *
 * @since 4.0.0
 */
export declare namespace TxEnqueue {
  /**
   * Variance annotation interface for TxEnqueue contravariance.
   *
   * @category models
   * @since 4.0.0
   */
  export interface Variance<in A, in E> {
    readonly _A: Types.Contravariant<A>
    readonly _E: Types.Contravariant<E>
  }
}

/**
 * Namespace containing type definitions for TxDequeue variance annotations.
 *
 * @since 4.0.0
 */
export declare namespace TxDequeue {
  /**
   * Variance annotation interface for TxDequeue covariance.
   *
   * @category models
   * @since 4.0.0
   */
  export interface Variance<out A, out E> {
    readonly _A: Types.Covariant<A>
    readonly _E: Types.Covariant<E>
  }
}

/**
 * Namespace containing type definitions for TxQueue variance annotations.
 *
 * @since 4.0.0
 */
export declare namespace TxQueue {
  /**
   * Variance annotation interface for TxQueue invariance.
   *
   * @category models
   * @since 4.0.0
   */
  export interface Variance<in out A, in out E> {
    readonly _A: Types.Invariant<A>
    readonly _E: Types.Invariant<E>
  }
}

/**
 * Represents the shared state of a transactional queue that can be inspected.
 * This interface contains the core properties needed for queue state inspection
 * operations like size, capacity, and completion status.
 *
 * @category models
 * @since 4.0.0
 */
export interface TxQueueState extends Inspectable {
  readonly strategy: "bounded" | "unbounded" | "dropping" | "sliding"
  readonly capacity: number
  readonly items: TxChunk.TxChunk<any>
  readonly stateRef: TxRef.TxRef<State<any, any>>
}

/**
 * A TxEnqueue represents the write-only interface of a transactional queue, providing
 * operations for adding elements (enqueue operations) and inspecting queue state.
 *
 * **Example** (Offering values through enqueue handles)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxQueue } from "effect"
 * import type { Cause } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   // Queue without error channel
 *   const queue = yield* TxQueue.bounded<number>(10)
 *   const accepted = yield* TxQueue.offer(queue, 42)
 *
 *   // Queue with error channel for completion signaling
 *   const faultTolerantQueue = yield* TxQueue.bounded<number, string>(10)
 *   yield* TxQueue.offerAll(faultTolerantQueue, [1, 2, 3])
 *   yield* TxQueue.fail(faultTolerantQueue, "processing complete")
 *
 *   // Works with Done for clean completion
 *   const completableQueue = yield* TxQueue.bounded<
 *     string,
 *     Cause.Done
 *   >(5)
 *   yield* TxQueue.offer(completableQueue, "task")
 *   yield* TxQueue.end(completableQueue)
 *
 *   return accepted
 * })
 *
 * await Effect.runPromise(program) // => true
 * ```
 *
 * @category models
 * @since 4.0.0
 */
export interface TxEnqueue<in A, in E = never> extends TxQueueState {
  readonly [EnqueueTypeId]: TxEnqueue.Variance<A, E>
}

/**
 * A TxDequeue represents the read-only interface of a transactional queue, providing
 * operations for consuming elements (dequeue operations) and inspecting queue state.
 *
 * **Example** (Taking values through dequeue handles)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   // Queue without error channel
 *   const queue = yield* TxQueue.bounded<number>(10)
 *   yield* TxQueue.offer(queue, 42)
 *   const item = yield* TxQueue.take(queue)
 *
 *   // Queue with error channel - errors propagate through E-channel
 *   const faultTolerantQueue = yield* TxQueue.bounded<number, string>(10)
 *   yield* TxQueue.fail(faultTolerantQueue, "processing failed")
 *
 *   // All dequeue operations now fail with the error directly
 *   const takeResult = yield* Effect.flip(TxQueue.take(faultTolerantQueue)) // "processing failed"
 *   const peekResult = yield* Effect.flip(TxQueue.peek(faultTolerantQueue)) // "processing failed"
 *   return [item, takeResult, peekResult] as const
 * })
 *
 * await Effect.runPromise(program) // => [42, "processing failed", "processing failed"]
 * ```
 *
 * @category models
 * @since 4.0.0
 */
export interface TxDequeue<out A, out E = never> extends TxQueueState {
  readonly [DequeueTypeId]: TxDequeue.Variance<A, E>
}

/**
 * A TxQueue represents a transactional queue data structure that provides both
 * enqueue and dequeue operations with Software Transactional Memory (STM) semantics.
 *
 * **Example** (Combining enqueue and dequeue operations)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   // Create a bounded transactional queue (E defaults to never)
 *   const queue = yield* TxQueue.bounded<number>(10)
 *
 *   // Single operations - automatically transactional
 *   const accepted = yield* TxQueue.offer(queue, 42)
 *   const item = yield* TxQueue.take(queue) // Effect<number, never>
 *
 *   // Queue with error channel
 *   const faultTolerantQueue = yield* TxQueue.bounded<number, string>(10)
 *
 *   // Operations can handle queue-level failures
 *   yield* TxQueue.fail(faultTolerantQueue, "queue failed")
 *   const result = yield* Effect.flip(TxQueue.take(faultTolerantQueue))
 *   return [accepted, item, result] as const
 * })
 *
 * await Effect.runPromise(program) // => [true, 42, "queue failed"]
 * ```
 *
 * @category models
 * @since 4.0.0
 */
export interface TxQueue<in out A, in out E = never> extends TxEnqueue<A, E>, TxDequeue<A, E> {
  readonly [TypeId]: TxQueue.Variance<A, E>
}

/**
 * Checks whether the given value is a TxEnqueue.
 *
 * **Example** (Checking enqueue handles)
 *
 * ```ts import.meta.vitest
 * import { TxQueue } from "effect"
 *
 * const someValue: unknown = {}
 * TxQueue.isTxEnqueue(someValue) // => false
 * ```
 *
 * @category guards
 * @since 4.0.0
 */
export const isTxEnqueue = <A = unknown, E = unknown>(u: unknown): u is TxEnqueue<A, E> => hasProperty(u, EnqueueTypeId)

/**
 * Checks whether the given value is a TxDequeue.
 *
 * **Example** (Checking dequeue handles)
 *
 * ```ts import.meta.vitest
 * import { TxQueue } from "effect"
 *
 * const someValue: unknown = {}
 * TxQueue.isTxDequeue(someValue) // => false
 * ```
 *
 * @category guards
 * @since 4.0.0
 */
export const isTxDequeue = <A = unknown, E = unknown>(u: unknown): u is TxDequeue<A, E> => hasProperty(u, DequeueTypeId)

/**
 * Checks whether the given value is a TxQueue.
 *
 * **Example** (Checking queue handles)
 *
 * ```ts import.meta.vitest
 * import { TxQueue } from "effect"
 *
 * const someValue: unknown = {}
 * TxQueue.isTxQueue(someValue) // => false
 * ```
 *
 * @category guards
 * @since 4.0.0
 */
export const isTxQueue = <A = unknown, E = unknown>(u: unknown): u is TxQueue<A, E> => hasProperty(u, TypeId)

// =============================================================================
// Proto
// =============================================================================

const TxQueueProto = {
  [EnqueueTypeId]: { _A: (_: never) => _, _E: (_: never) => _ },
  [DequeueTypeId]: { _A: (_: never) => _, _E: (_: never) => _ },
  [TypeId]: { _A: (_: never) => _, _E: (_: never) => _ },
  [NodeInspectSymbol](this: TxQueue<unknown, unknown>) {
    return toJson(this)
  },
  toString(this: TxQueue<unknown, unknown>) {
    return `TxQueue(${this.strategy}, ${this.capacity})`
  },
  toJSON(this: TxQueue<unknown, unknown>) {
    return {
      _id: "TxQueue",
      strategy: this.strategy,
      capacity: this.capacity
    }
  }
}

// =============================================================================
// Constructors
// =============================================================================

/**
 * Creates a new bounded `TxQueue` with the specified capacity.
 *
 * **Details**
 *
 * This function returns a new TxQueue reference with the specified capacity. No existing TxQueue instances are modified.
 *
 * **Example** (Creating bounded queues)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   // Create a bounded queue (E defaults to never)
 *   const queue = yield* TxQueue.bounded<number>(10)
 *
 *   // Create a bounded queue with error channel
 *   const faultTolerantQueue = yield* TxQueue.bounded<number, string>(10)
 *
 *   // Offer items - will succeed until capacity is reached
 *   yield* TxQueue.offer(queue, 1)
 *   yield* TxQueue.offer(queue, 2)
 *
 *   return yield* TxQueue.take(queue)
 * })
 *
 * await Effect.runPromise(program) // => 1
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const bounded = <A = never, E = never>(
  capacity: number
): Effect.Effect<TxQueue<A, E>> =>
  Effect.gen(function*() {
    const items = yield* TxChunk.empty<A>()
    const stateRef = yield* TxRef.make<State<A, E>>({ _tag: "Open" })

    const txQueue = Object.create(TxQueueProto)
    txQueue.strategy = "bounded"
    txQueue.capacity = capacity
    txQueue.items = items
    txQueue.stateRef = stateRef
    return txQueue
  }).pipe(Effect.tx)

/**
 * Creates a new unbounded `TxQueue` with unlimited capacity.
 *
 * **Details**
 *
 * This function returns a new TxQueue reference with unlimited capacity. No existing TxQueue instances are modified.
 *
 * **Example** (Creating unbounded queues)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   // Create an unbounded queue (E defaults to never)
 *   const queue = yield* TxQueue.unbounded<string>()
 *
 *   // Create an unbounded queue with error channel
 *   const faultTolerantQueue = yield* TxQueue.unbounded<string, Error>()
 *
 *   // Can offer unlimited items
 *   yield* TxQueue.offer(queue, "hello")
 *   yield* TxQueue.offer(queue, "world")
 *
 *   return yield* TxQueue.size(queue)
 * })
 *
 * await Effect.runPromise(program) // => 2
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const unbounded = <A = never, E = never>(): Effect.Effect<TxQueue<A, E>> =>
  Effect.gen(function*() {
    const items = yield* TxChunk.empty<A>()
    const stateRef = yield* TxRef.make<State<A, E>>({ _tag: "Open" })

    const txQueue = Object.create(TxQueueProto)
    txQueue.strategy = "unbounded"
    txQueue.capacity = Number.POSITIVE_INFINITY
    txQueue.items = items
    txQueue.stateRef = stateRef
    return txQueue
  }).pipe(Effect.tx)

/**
 * Creates a new dropping `TxQueue` with the specified capacity that drops new items when full.
 *
 * **Details**
 *
 * This function returns a new TxQueue reference with dropping strategy. No existing TxQueue instances are modified.
 *
 * **Example** (Creating dropping queues)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   // Create a dropping queue with capacity 2
 *   const queue = yield* TxQueue.dropping<number>(2)
 *
 *   // Fill to capacity
 *   yield* TxQueue.offer(queue, 1)
 *   yield* TxQueue.offer(queue, 2)
 *
 *   // This will be dropped (returns false)
 *   return yield* TxQueue.offer(queue, 3)
 * })
 *
 * await Effect.runPromise(program) // => false
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const dropping = <A = never, E = never>(
  capacity: number
): Effect.Effect<TxQueue<A, E>> =>
  Effect.gen(function*() {
    const items = yield* TxChunk.empty<A>()
    const stateRef = yield* TxRef.make<State<A, E>>({ _tag: "Open" })

    const txQueue = Object.create(TxQueueProto)
    txQueue.strategy = "dropping"
    txQueue.capacity = capacity
    txQueue.items = items
    txQueue.stateRef = stateRef
    return txQueue
  }).pipe(Effect.tx)

/**
 * Creates a new sliding `TxQueue` with the specified capacity that evicts old items when full.
 *
 * **Details**
 *
 * This function returns a new TxQueue reference with sliding strategy. No existing TxQueue instances are modified.
 *
 * **Example** (Creating sliding queues)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   // Create a sliding queue with capacity 2
 *   const queue = yield* TxQueue.sliding<number>(2)
 *
 *   // Fill to capacity
 *   yield* TxQueue.offer(queue, 1)
 *   yield* TxQueue.offer(queue, 2)
 *
 *   // This will evict item 1 and add 3
 *   yield* TxQueue.offer(queue, 3)
 *
 *   return yield* TxQueue.take(queue)
 * })
 *
 * await Effect.runPromise(program) // => 2
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const sliding = <A = never, E = never>(
  capacity: number
): Effect.Effect<TxQueue<A, E>> =>
  Effect.gen(function*() {
    const items = yield* TxChunk.empty<A>()
    const stateRef = yield* TxRef.make<State<A, E>>({ _tag: "Open" })

    const txQueue = Object.create(TxQueueProto)
    txQueue.strategy = "sliding"
    txQueue.capacity = capacity
    txQueue.items = items
    txQueue.stateRef = stateRef
    return txQueue
  }).pipe(Effect.tx)

// =============================================================================
// Core Queue Operations
// =============================================================================

/**
 * Offers an item to the queue and returns whether it was accepted.
 *
 * **Details**
 *
 * Open unbounded queues always accept; open bounded queues retry while full; dropping queues return `false` when full; sliding queues evict the oldest item when full. Closing or done queues return `false`. This function mutates the original TxQueue by adding the item according to the queue's strategy. It does not return a new TxQueue reference.
 *
 * **Example** (Offering a value)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const queue = yield* TxQueue.bounded<number>(10)
 *
 *   // Offer an item - returns true if accepted
 *   return yield* TxQueue.offer(queue, 42)
 * })
 *
 * await Effect.runPromise(program) // => true
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const offer: {
  <A, E>(value: A): (self: TxEnqueue<A, E>) => Effect.Effect<boolean>
  <A, E>(self: TxEnqueue<A, E>, value: A): Effect.Effect<boolean>
} = dual(
  2,
  <A, E>(self: TxEnqueue<A, E>, value: A): Effect.Effect<boolean> =>
    Effect.gen(function*() {
      const state = yield* TxRef.get(self.stateRef)
      if (state._tag === "Done" || state._tag === "Closing") {
        return false
      }

      const currentSize = yield* size(self)

      // Unbounded - always accept
      if (self.strategy === "unbounded") {
        yield* TxChunk.append(self.items, value)
        return true
      }

      // For bounded queues, check capacity
      if (currentSize < self.capacity) {
        yield* TxChunk.append(self.items, value)
        return true
      }

      // Queue is at capacity, strategy-specific behavior
      if (self.strategy === "dropping") {
        return false // Drop the new item
      }

      if (self.strategy === "sliding") {
        yield* TxChunk.drop(self.items, 1) // Remove oldest item
        yield* TxChunk.append(self.items, value) // Add new item
        return true
      }

      // bounded strategy - block until space is available
      return yield* Effect.txRetry
    }).pipe(Effect.tx)
)

/**
 * Offers multiple items to the queue, returning the items that were not
 * accepted.
 *
 * **Details**
 *
 * Each item follows `offer` semantics: bounded queues retry while full, dropping queues reject new items when full, sliding queues evict old items to accept new items, and closing or done queues reject all items. This function mutates the original TxQueue by adding items according to the queue's strategy. It does not return a new TxQueue reference.
 *
 * **Example** (Offering multiple values)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const queue = yield* TxQueue.bounded<number>(10)
 *
 *   // Offer multiple items - returns rejected items as array
 *   return yield* TxQueue.offerAll(queue, [1, 2, 3, 4, 5])
 * })
 *
 * await Effect.runPromise(program) // => []
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const offerAll: {
  <A, E>(values: Iterable<A>): (self: TxEnqueue<A, E>) => Effect.Effect<Array<A>>
  <A, E>(self: TxEnqueue<A, E>, values: Iterable<A>): Effect.Effect<Array<A>>
} = dual(
  2,
  <A, E>(self: TxEnqueue<A, E>, values: Iterable<A>): Effect.Effect<Array<A>> => {
    const valuesArray = Array.from(values)

    return Effect.gen(function*() {
      const rejected: Array<A> = []

      for (const value of valuesArray) {
        const accepted = yield* offer(self, value)
        if (!accepted) {
          rejected.push(value)
        }
      }

      return rejected
    }).pipe(Effect.tx)
  }
)

/**
 * Takes the next item from the queue, retrying the transaction while the queue
 * is empty.
 *
 * **Details**
 *
 * If the queue is done, the effect fails with the queue's completion cause. This function mutates the original TxQueue by removing the first item. It does not return a new TxQueue reference.
 *
 * **Example** (Taking a value)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit, TxQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const queue = yield* TxQueue.bounded<number, string>(10)
 *   yield* TxQueue.offer(queue, 42)
 *
 *   // Take an item - blocks if empty
 *   const item = yield* TxQueue.take(queue)
 *
 *   // When queue fails, take fails with the same error
 *   yield* TxQueue.fail(queue, "queue error")
 *   const result = yield* Effect.exit(TxQueue.take(queue))
 *   return [item, result] as const
 * })
 *
 * await Effect.runPromise(program) // => [42, Exit.fail("queue error")]
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const take = <A, E>(self: TxDequeue<A, E>): Effect.Effect<A, E> =>
  Effect.gen(function*() {
    const state = yield* TxRef.get(self.stateRef)

    // Check if queue is done - forward the cause directly
    if (state._tag === "Done") {
      return yield* Effect.failCause(state.cause)
    }

    // If no items available, retry transaction
    if (yield* isEmpty(self)) {
      return yield* Effect.txRetry
    }

    // Take item from queue
    const chunk = yield* TxChunk.get(self.items)
    const head = Chunk.head(chunk)
    if (Option.isNone(head)) {
      return yield* Effect.txRetry
    }

    yield* TxChunk.drop(self.items, 1)

    // Check if we need to transition Closing → Done
    if (state._tag === "Closing" && (yield* isEmpty(self))) {
      yield* TxRef.set(self.stateRef, { _tag: "Done", cause: state.cause })
    }

    return head.value
  }).pipe(Effect.tx)

/**
 * Tries to take an item from the queue without blocking.
 *
 * **Example** (Polling without blocking)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, TxQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const queue = yield* TxQueue.bounded<number>(10)
 *
 *   // Poll returns Option.none if empty
 *   const maybe = yield* TxQueue.poll(queue)
 *
 *   yield* TxQueue.offer(queue, 42)
 *   const item = yield* TxQueue.poll(queue)
 *   return [maybe, item] as const
 * })
 *
 * await Effect.runPromise(program) // => [Option.none(), Option.some(42)]
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const poll = <A, E>(self: TxDequeue<A, E>): Effect.Effect<Option.Option<A>> =>
  Effect.gen(function*() {
    const state = yield* TxRef.get(self.stateRef)
    if (state._tag === "Done") {
      return Option.none()
    }

    const chunk = yield* TxChunk.get(self.items)
    const head = Chunk.head(chunk)
    if (Option.isNone(head)) {
      return Option.none()
    }

    yield* TxChunk.drop(self.items, 1)

    if (state._tag === "Closing" && (yield* isEmpty(self))) {
      yield* TxRef.set(self.stateRef, { _tag: "Done", cause: state.cause })
    }

    return Option.some(head.value)
  }).pipe(Effect.tx)

/**
 * Takes all items from the queue. Blocks if the queue is empty.
 *
 * **Details**
 *
 * If the queue is already in a failed state, the error is propagated through the E-channel. This follows the same patterns as `take` and waits when there are no elements. It returns a non-empty array because it blocks until at least one item is available. This function mutates the original TxQueue by removing all items. It does not return a new TxQueue reference.
 *
 * **Example** (Taking all queued values)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit, TxQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const queue = yield* TxQueue.bounded<number, string>(10)
 *   yield* TxQueue.offerAll(queue, [1, 2, 3, 4, 5])
 *
 *   // Take all items atomically - returns NonEmptyArray
 *   return yield* TxQueue.takeAll(queue)
 * })
 *
 * // Error propagation example
 * const errorExample = Effect.gen(function*() {
 *   const queue = yield* TxQueue.bounded<number, string>(5)
 *   yield* TxQueue.offerAll(queue, [1, 2])
 *   yield* TxQueue.fail(queue, "processing error")
 *
 *   // takeAll() propagates the queue error through E-channel
 *   return yield* Effect.exit(TxQueue.takeAll(queue))
 * })
 *
 * await Effect.runPromise(program) // => [1, 2, 3, 4, 5]
 * await Effect.runPromise(errorExample) // => Exit.fail("processing error")
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const takeAll = <A, E>(self: TxDequeue<A, E>): Effect.Effect<Arr.NonEmptyArray<A>, E> =>
  Effect.gen(function*() {
    const state = yield* TxRef.get(self.stateRef)

    // Handle done queue
    if (state._tag === "Done") {
      return yield* Effect.failCause(state.cause)
    }

    // Wait if empty - same pattern as take()
    if (yield* isEmpty(self)) {
      return yield* Effect.txRetry
    }

    const chunk = yield* TxChunk.get(self.items)

    // Take all items (guaranteed non-empty due to isEmpty check above)
    const items = Chunk.toArray(chunk) as Arr.NonEmptyArray<A>
    yield* TxChunk.set(self.items, Chunk.empty())

    // Check if we need to transition Closing → Done
    if (state._tag === "Closing") {
      yield* TxRef.set(self.stateRef, { _tag: "Done", cause: state.cause })
    }

    return items
  }).pipe(Effect.tx)

/**
 * Takes up to `n` items from the queue in a single transaction.
 *
 * **Details**
 *
 * For an open queue, waits until `min(n, capacity)` items are available, then removes that many items. Finite fractional values of `n` are rounded down. If `n` is `NaN` or non-positive, returns an empty array without modifying the queue. If the queue is closing, drains the currently available items and transitions to `Done`. If the queue is already done, the effect fails with the queue's completion cause. This function mutates the original TxQueue by removing the taken items. It does not return a new TxQueue reference.
 *
 * **Example** (Taking a fixed number of values)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const queue = yield* TxQueue.bounded<number>(5)
 *   yield* TxQueue.offerAll(queue, [1, 2, 3, 4])
 *
 *   const items = yield* TxQueue.takeN(queue, 4)
 *
 *   // This requests more than capacity (5), so takes all available (up to 5)
 *   yield* TxQueue.offerAll(queue, [5, 6, 7, 8, 9])
 *   const all = yield* TxQueue.takeN(queue, 10)
 *   return [items, all] as const
 * })
 *
 * await Effect.runPromise(program) // => [[1, 2, 3, 4], [5, 6, 7, 8, 9]]
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const takeN: {
  (n: number): <A, E>(self: TxDequeue<A, E>) => Effect.Effect<Array<A>, E>
  <A, E>(self: TxDequeue<A, E>, n: number): Effect.Effect<Array<A>, E>
} = dual(
  2,
  <A, E>(self: TxDequeue<A, E>, n: number): Effect.Effect<Array<A>, E> => {
    const requestedCount = Count.normalize(n)
    return Effect.gen(function*() {
      const state = yield* TxRef.get(self.stateRef)

      // Check if queue is done - forward the cause directly
      if (state._tag === "Done") {
        return yield* Effect.failCause(state.cause)
      }

      const currentSize = yield* size(self)

      // Determine how many items we can/should take
      const maxPossible = Math.min(requestedCount, self.capacity)

      // If we can't get the requested amount due to capacity constraints,
      // take what the capacity allows. Otherwise, wait for the full amount.
      const shouldWaitForFull = requestedCount <= self.capacity
      const minimumRequired = shouldWaitForFull ? requestedCount : maxPossible

      // If we don't have enough items available
      if (currentSize < minimumRequired) {
        // If queue is closing, transition to done and return what we have
        if (state._tag === "Closing") {
          if (yield* isEmpty(self)) {
            yield* TxRef.set(self.stateRef, { _tag: "Done", cause: state.cause })
            return []
          }
          // Take all remaining items when closing
          const chunk = yield* TxChunk.get(self.items)
          const taken = Chunk.toArray(chunk)
          yield* TxChunk.set(self.items, Chunk.empty())
          yield* TxRef.set(self.stateRef, { _tag: "Done", cause: state.cause })
          return taken
        }

        // Queue is still open but not enough items - retry transaction
        return yield* Effect.txRetry
      }

      // Take the determined number of items
      const toTake = minimumRequired
      const chunk = yield* TxChunk.get(self.items)
      const taken = Chunk.take(chunk, toTake)
      yield* TxChunk.drop(self.items, toTake)

      // Check if we need to transition Closing → Done
      if (state._tag === "Closing" && (yield* isEmpty(self))) {
        yield* TxRef.set(self.stateRef, { _tag: "Done", cause: state.cause })
      }

      return Chunk.toArray(taken)
    }).pipe(Effect.tx)
  }
)

/**
 * Takes between `min` and `max` currently available items, waiting for `min` on
 * an open queue.
 *
 * **Details**
 *
 * Finite fractional bounds are rounded down, while `NaN` and non-positive bounds are treated as `0`. If the queue is closing, drains the currently available items even when fewer than `min` are available and transitions to `Done`. Invalid normalized ranges (`min <= 0`, `max <= 0`, or `min > max`) return an empty array. If the queue is already done, the effect fails with the queue's completion cause.
 *
 * **Example** (Taking batches within bounds)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const queue = yield* TxQueue.bounded<number>(10)
 *   yield* TxQueue.offerAll(queue, [1, 2, 3, 4, 5, 6, 7, 8])
 *
 *   // Take between 2 and 5 items
 *   const batch1 = yield* TxQueue.takeBetween(queue, 2, 5)
 *
 *   // Take between 1 and 10 items (but only 3 remain)
 *   const batch2 = yield* TxQueue.takeBetween(queue, 1, 10)
 *
 *   // Would wait for at least 1 item to be available
 *   // const batch3 = yield* TxQueue.takeBetween(queue, 1, 3)
 *   return [batch1, batch2] as const
 * })
 *
 * await Effect.runPromise(program) // => [[1, 2, 3, 4, 5], [6, 7, 8]]
 * ```
 *
 * @category taking
 * @since 2.0.0
 */
export const takeBetween: {
  (min: number, max: number): <A, E>(self: TxDequeue<A, E>) => Effect.Effect<Array<A>, E>
  <A, E>(self: TxDequeue<A, E>, min: number, max: number): Effect.Effect<Array<A>, E>
} = dual(
  3,
  <A, E>(self: TxDequeue<A, E>, min: number, max: number): Effect.Effect<Array<A>, E> => {
    const minimum = Count.normalize(min)
    const maximum = Count.normalize(max)
    return Effect.gen(function*() {
      const state = yield* TxRef.get(self.stateRef)

      // Check if queue is done - forward the cause directly
      if (state._tag === "Done") {
        return yield* Effect.failCause(state.cause)
      }

      // Validate parameters
      if (minimum <= 0 || maximum <= 0 || minimum > maximum) {
        return []
      }

      const currentSize = yield* size(self)

      // If we have less than minimum required items
      if (currentSize < minimum) {
        // If queue is closing, transition to done and return what we have
        if (state._tag === "Closing") {
          if (yield* isEmpty(self)) {
            yield* TxRef.set(self.stateRef, { _tag: "Done", cause: state.cause })
            return []
          }
          // Take all remaining items when closing (if >= min or all available)
          const chunk = yield* TxChunk.get(self.items)
          const taken = Chunk.toArray(chunk)
          yield* TxChunk.set(self.items, Chunk.empty())
          yield* TxRef.set(self.stateRef, { _tag: "Done", cause: state.cause })
          return taken
        }

        // Queue is still open but not enough items - retry transaction
        return yield* Effect.txRetry
      }

      // We have at least the minimum, take up to the maximum
      const toTake = Math.min(currentSize, maximum)
      const chunk = yield* TxChunk.get(self.items)
      const taken = Chunk.take(chunk, toTake)
      yield* TxChunk.drop(self.items, toTake)

      // Check if we need to transition Closing → Done
      if (state._tag === "Closing" && (yield* isEmpty(self))) {
        yield* TxRef.set(self.stateRef, { _tag: "Done", cause: state.cause })
      }

      return Chunk.toArray(taken)
    }).pipe(Effect.tx)
  }
)

/**
 * Waits transactionally for the next item and returns it without removing it.
 *
 * **Details**
 *
 * If the queue is open but empty, the transaction retries until an item is available or the queue completes. If the queue is done, the queue's completion cause is propagated through the error channel.
 *
 * **Example** (Peeking without removing values)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit, TxQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const queue = yield* TxQueue.bounded<number, string>(10)
 *   yield* TxQueue.offer(queue, 42)
 *
 *   // Peek at the next item without removing it
 *   const item = yield* TxQueue.peek(queue)
 *
 *   // Item is still in the queue
 *   const size = yield* TxQueue.size(queue)
 *   return [item, size] as const
 * })
 *
 * // Error handling example
 * const errorExample = Effect.gen(function*() {
 *   const queue = yield* TxQueue.bounded<number, string>(5)
 *   yield* TxQueue.fail(queue, "queue failed")
 *
 *   // peek() propagates the queue error through E-channel
 *   return yield* Effect.exit(TxQueue.peek(queue))
 * })
 *
 * await Effect.runPromise(program) // => [42, 1]
 * await Effect.runPromise(errorExample) // => Exit.fail("queue failed")
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const peek = <A, E>(self: TxDequeue<A, E>): Effect.Effect<A, E> =>
  Effect.gen(function*() {
    const state = yield* TxRef.get(self.stateRef)
    if (state._tag === "Done") {
      return yield* Effect.failCause(state.cause)
    }

    const chunk = yield* TxChunk.get(self.items)
    const head = Chunk.head(chunk)
    if (Option.isNone(head)) {
      return yield* Effect.txRetry
    }

    return head.value
  }).pipe(Effect.tx)

/**
 * Gets the current size of the queue.
 *
 * **Example** (Reading queue size)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const queue = yield* TxQueue.bounded<number>(10)
 *   yield* TxQueue.offerAll(queue, [1, 2, 3])
 *
 *   return yield* TxQueue.size(queue)
 * })
 *
 * await Effect.runPromise(program) // => 3
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const size = (self: TxQueueState): Effect.Effect<number> => TxChunk.size(self.items)

/**
 * Checks whether the queue is empty.
 *
 * **Example** (Checking whether a queue is empty)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const queue = yield* TxQueue.bounded<number>(10)
 *
 *   const empty = yield* TxQueue.isEmpty(queue)
 *
 *   yield* TxQueue.offer(queue, 42)
 *   const stillEmpty = yield* TxQueue.isEmpty(queue)
 *   return [empty, stillEmpty] as const
 * })
 *
 * await Effect.runPromise(program) // => [true, false]
 * ```
 *
 * @category predicates
 * @since 2.0.0
 */
export const isEmpty = (self: TxQueueState): Effect.Effect<boolean> => TxChunk.isEmpty(self.items)

/**
 * Checks whether the queue is non-empty.
 *
 * **Example** (Checking whether a queue is non-empty)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const queue = yield* TxQueue.bounded<number>(10)
 *
 *   const empty = yield* TxQueue.isNonEmpty(queue)
 *
 *   yield* TxQueue.offer(queue, 42)
 *   const nonEmpty = yield* TxQueue.isNonEmpty(queue)
 *   return [empty, nonEmpty] as const
 * })
 *
 * await Effect.runPromise(program) // => [false, true]
 * ```
 *
 * @category predicates
 * @since 4.0.0
 */
export const isNonEmpty = (self: TxQueueState): Effect.Effect<boolean> => TxChunk.isNonEmpty(self.items)

/**
 * Checks whether the queue is at capacity.
 *
 * **Example** (Checking whether a queue is full)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const queue = yield* TxQueue.bounded<number>(2)
 *
 *   const full = yield* TxQueue.isFull(queue)
 *
 *   yield* TxQueue.offerAll(queue, [1, 2])
 *   const nowFull = yield* TxQueue.isFull(queue)
 *   return [full, nowFull] as const
 * })
 *
 * await Effect.runPromise(program) // => [false, true]
 * ```
 *
 * @category predicates
 * @since 2.0.0
 */
export const isFull = (self: TxQueueState): Effect.Effect<boolean> =>
  self.capacity === Number.POSITIVE_INFINITY
    ? Effect.succeed(false)
    : Effect.map(size(self), (currentSize) => currentSize >= self.capacity)

/**
 * Interrupts the queue gracefully with the current fiber's interruption cause.
 *
 * **Details**
 *
 * If the queue still contains items, it enters the closing state so buffered items can be drained before consumers observe the interruption. If it is empty, it transitions directly to done. Returns `false` if the queue was already closing or done.
 *
 * **Example** (Interrupting queues)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const queue = yield* TxQueue.bounded<number>(10)
 *   yield* TxQueue.offer(queue, 42)
 *
 *   // Interrupt gracefully - allows remaining items to be consumed
 *   return yield* TxQueue.interrupt(queue)
 * })
 *
 * await Effect.runPromise(program) // => true
 * ```
 *
 * @category combinators
 * @since 4.0.0
 */
export const interrupt = <A, E>(self: TxEnqueue<A, E>): Effect.Effect<boolean> =>
  Effect.withFiber((fiber) => failCause(self, Cause.interrupt(fiber.id)))

/**
 * Fails the queue with the specified error, discarding any buffered items.
 *
 * **Details**
 *
 * The queue transitions directly to done with `Cause.fail(error)`. Returns `false` if the queue was already closing or done.
 *
 * **Example** (Failing queues)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const queue = yield* TxQueue.bounded<number, string>(10)
 *
 *   // Fail the queue with an error
 *   return yield* TxQueue.fail(queue, "connection lost")
 * })
 *
 * await Effect.runPromise(program) // => true
 * ```
 *
 * @category combinators
 * @since 4.0.0
 */
export const fail: {
  <E>(error: E): <A>(self: TxEnqueue<A, E>) => Effect.Effect<boolean>
  <A, E>(self: TxEnqueue<A, E>, error: E): Effect.Effect<boolean>
} = dual(
  2,
  <A, E>(self: TxEnqueue<A, E>, error: E): Effect.Effect<boolean> =>
    Effect.gen(function*() {
      const state = yield* TxRef.get(self.stateRef)

      if (state._tag !== "Open") {
        return false // Already closing/done
      }

      // Fail transitions directly to Done, clearing items
      yield* TxChunk.set(self.items, Chunk.empty())
      yield* TxRef.set(self.stateRef, { _tag: "Done", cause: Cause.fail(error) })

      return true
    }).pipe(Effect.tx)
)

/**
 * Completes the queue with the specified cause.
 *
 * **Details**
 *
 * If the queue is empty, it transitions directly to done. If it still contains items, it enters the closing state so buffered items can be drained before the cause is observed. Returns `false` if the queue was already closing or done.
 *
 * **Example** (Failing queues with causes)
 *
 * ```ts import.meta.vitest
 * import { Cause, Effect, TxQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const queue = yield* TxQueue.bounded<number>(10)
 *
 *   // Complete with specific cause
 *   const cause = Cause.interrupt()
 *   const result = yield* TxQueue.failCause(queue, cause)
 *   return [cause, result] as const
 * })
 *
 * await Effect.runPromise(program) // => [Cause.interrupt(), true]
 * ```
 *
 * @category combinators
 * @since 4.0.0
 */
export const failCause: {
  <E>(cause: Cause.Cause<E>): <A>(self: TxEnqueue<A, E>) => Effect.Effect<boolean>
  <A, E>(self: TxEnqueue<A, E>, cause: Cause.Cause<E>): Effect.Effect<boolean>
} = dual(
  2,
  <A, E>(self: TxEnqueue<A, E>, cause: Cause.Cause<E>): Effect.Effect<boolean> =>
    Effect.gen(function*() {
      const state = yield* TxRef.get(self.stateRef)

      if (state._tag !== "Open") {
        return false // Already closing/done
      }

      if (yield* isEmpty(self)) {
        // Can transition directly to Done
        yield* TxRef.set(self.stateRef, { _tag: "Done", cause })
      } else {
        // Need to go through Closing state
        yield* TxRef.set(self.stateRef, { _tag: "Closing", cause })
      }

      return true
    }).pipe(Effect.tx)
)

/**
 * Ends a queue by signaling completion with a `Cause.Done` error.
 *
 * **Details**
 *
 * This is a convenience wrapper around `failCause` for queues whose error channel can contain `Cause.Done`. If buffered items remain, the queue enters the closing state and those items may still be consumed before later `take` or `peek` operations fail with `Cause.Done`.
 *
 * **Example** (Ending queues)
 *
 * ```ts import.meta.vitest
 * import { Cause, Effect, Exit, TxQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const queue = yield* TxQueue.bounded<number, Cause.Done>(10)
 *
 *   // Signal the end of the queue
 *   const result = yield* TxQueue.end(queue)
 *
 *   // All operations will now fail with Done
 *   const takeResult = yield* Effect.exit(TxQueue.take(queue))
 *
 *   const peekResult = yield* Effect.exit(TxQueue.peek(queue))
 *   return [result, takeResult, peekResult] as const
 * })
 *
 * await Effect.runPromise(program) // => [true, Exit.fail(Cause.Done()), Exit.fail(Cause.Done())]
 * ```
 *
 * @category combinators
 * @since 4.0.0
 */
export const end = <A, E>(self: TxEnqueue<A, E | Cause.Done>): Effect.Effect<boolean> =>
  failCause(self, Cause.fail(Cause.Done()))

/**
 * Removes and returns all currently buffered elements.
 *
 * **Details**
 *
 * If the queue is closing, draining its buffered elements transitions it to done. If the queue is already done with a `Cause.Done` error, returns an empty array. If the queue is done for any other cause, including interruption or failure, that cause is propagated.
 *
 * **Example** (Clearing queues)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const queue = yield* TxQueue.bounded<number>(10)
 *   yield* TxQueue.offerAll(queue, [1, 2, 3, 4, 5])
 *
 *   const sizeBefore = yield* TxQueue.size(queue)
 *
 *   const cleared = yield* TxQueue.clear(queue)
 *
 *   const sizeAfter = yield* TxQueue.size(queue)
 *   return [sizeBefore, cleared, sizeAfter] as const
 * })
 *
 * await Effect.runPromise(program) // => [5, [1, 2, 3, 4, 5], 0]
 * ```
 *
 * @category combinators
 * @since 4.0.0
 */
export const clear = <A, E>(self: TxEnqueue<A, E>): Effect.Effect<Array<A>, ExcludeDone<E>> =>
  Effect.gen(function*() {
    const state = yield* TxRef.get(self.stateRef)
    if (state._tag === "Done") {
      // Return empty array only for halt causes (like Cause.Done)
      if (isDoneCause(state.cause)) {
        return []
      }
      return yield* Effect.failCause(state.cause)
    }
    const chunk = yield* TxChunk.get(self.items)
    yield* TxChunk.set(self.items, Chunk.empty())
    if (state._tag === "Closing") {
      yield* TxRef.set(self.stateRef, { _tag: "Done", cause: state.cause })
    }
    return Chunk.toArray(chunk)
  }).pipe(Effect.tx)

/**
 * Shuts down the queue immediately by clearing all items and interrupting it (legacy compatibility).
 *
 * **Details**
 *
 * This operation clears all items from the queue using `clear`, then interrupts the queue using `interrupt`. This function mutates the original TxQueue by clearing its contents and marking it as shutdown. It does not return a new TxQueue reference.
 *
 * **Example** (Shutting down queues)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const queue = yield* TxQueue.bounded<number>(10)
 *   yield* TxQueue.offerAll(queue, [1, 2, 3, 4, 5])
 *
 *   const sizeBefore = yield* TxQueue.size(queue)
 *
 *   yield* TxQueue.shutdown(queue)
 *
 *   const sizeAfter = yield* TxQueue.size(queue)
 *
 *   const isShutdown = yield* TxQueue.isShutdown(queue)
 *   return [sizeBefore, sizeAfter, isShutdown] as const
 * })
 *
 * await Effect.runPromise(program) // => [5, 0, true]
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const shutdown = <A, E>(self: TxEnqueue<A, E>): Effect.Effect<boolean> =>
  Effect.gen(function*() {
    yield* Effect.ignoreCause(clear(self))
    return yield* interrupt(self)
  }).pipe(Effect.tx)

/**
 * Checks whether the queue is in the open state.
 *
 * **Example** (Checking open state)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const queue = yield* TxQueue.bounded<number>(10)
 *
 *   const open = yield* TxQueue.isOpen(queue)
 *
 *   yield* TxQueue.interrupt(queue)
 *   const stillOpen = yield* TxQueue.isOpen(queue)
 *   return [open, stillOpen] as const
 * })
 *
 * await Effect.runPromise(program) // => [true, false]
 * ```
 *
 * @category predicates
 * @since 4.0.0
 */
export const isOpen = (self: TxQueueState): Effect.Effect<boolean> =>
  Effect.map(TxRef.get(self.stateRef), (state) => state._tag === "Open")

/**
 * Checks whether the queue is in the closing state.
 *
 * **Example** (Checking closing state)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const queue = yield* TxQueue.bounded<number>(10)
 *   yield* TxQueue.offer(queue, 42)
 *
 *   const closing = yield* TxQueue.isClosing(queue)
 *
 *   yield* TxQueue.interrupt(queue)
 *   const nowClosing = yield* TxQueue.isClosing(queue)
 *   return [closing, nowClosing] as const
 * })
 *
 * await Effect.runPromise(program) // => [false, true]
 * ```
 *
 * @category predicates
 * @since 4.0.0
 */
export const isClosing = (self: TxQueueState): Effect.Effect<boolean> =>
  Effect.map(TxRef.get(self.stateRef), (state) => state._tag === "Closing")

/**
 * Checks whether the queue is done (completed or failed).
 *
 * **Example** (Checking done state)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const queue = yield* TxQueue.bounded<number>(10)
 *
 *   const done = yield* TxQueue.isDone(queue)
 *
 *   yield* TxQueue.interrupt(queue)
 *   const nowDone = yield* TxQueue.isDone(queue)
 *   return [done, nowDone] as const
 * })
 *
 * await Effect.runPromise(program) // => [false, true]
 * ```
 *
 * @category predicates
 * @since 4.0.0
 */
export const isDone = (self: TxQueueState): Effect.Effect<boolean> =>
  Effect.map(TxRef.get(self.stateRef), (state) => state._tag === "Done")

/**
 * Checks whether the queue is shutdown (legacy compatibility).
 *
 * **Example** (Checking shutdown state)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const queue = yield* TxQueue.bounded<number>(10)
 *
 *   const isShutdown = yield* TxQueue.isShutdown(queue)
 *
 *   yield* TxQueue.shutdown(queue)
 *   const nowShutdown = yield* TxQueue.isShutdown(queue)
 *   return [isShutdown, nowShutdown] as const
 * })
 *
 * await Effect.runPromise(program) // => [false, true]
 * ```
 *
 * @category predicates
 * @since 2.0.0
 */
export const isShutdown = (self: TxQueueState): Effect.Effect<boolean> => isDone(self)

/**
 * Waits for the queue to complete (either successfully or with failure).
 *
 * **Example** (Awaiting queue completion)
 *
 * ```ts import.meta.vitest
 * import { Effect, Fiber, TxQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const queue = yield* TxQueue.bounded<number, string>(10)
 *
 *   const waiter = yield* Effect.forkChild(TxQueue.awaitCompletion(queue))
 *   yield* TxQueue.interrupt(queue)
 *
 *   yield* Fiber.join(waiter)
 *   return "Queue completed successfully"
 * })
 *
 * await Effect.runPromise(program) // => "Queue completed successfully"
 * ```
 *
 * @category combinators
 * @since 4.0.0
 */
export const awaitCompletion = (self: TxQueueState): Effect.Effect<void> =>
  Effect.gen(function*() {
    const state = yield* TxRef.get(self.stateRef)

    if (state._tag === "Done") {
      return void 0
    }

    // Not done yet, retry transaction
    return yield* Effect.txRetry
  }).pipe(Effect.tx)
