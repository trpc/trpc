/**
 * Broadcasts values to subscribers inside Effect transactions.
 *
 * A `TxPubSub<A>` is a transactional publish/subscribe hub. Each subscriber
 * owns a `TxQueue`, and each published value is offered to the subscriber
 * queues that are registered at the time of publication. This module includes
 * bounded, dropping, sliding, and unbounded hubs, publishing helpers, scoped
 * subscriptions, shutdown operations, and a guard.
 *
 * @since 4.0.0
 */
import * as Arr from "./Array.ts"
import * as Effect from "./Effect.ts"
import { dual } from "./Function.ts"
import type { Inspectable } from "./Inspectable.ts"
import { NodeInspectSymbol, toJson } from "./Inspectable.ts"
import type { Pipeable } from "./Pipeable.ts"
import { pipeArguments } from "./Pipeable.ts"
import { hasProperty } from "./Predicate.ts"
import type * as Scope from "./Scope.ts"
import * as TxQueue from "./TxQueue.ts"
import * as TxRef from "./TxRef.ts"

const TypeId = "~effect/TxPubSub"

/**
 * A TxPubSub represents a transactional publish/subscribe hub that broadcasts messages
 * to all current subscribers using Software Transactional Memory (STM) semantics.
 *
 * **Example** (Subscribing to a transactional pub/sub)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxPubSub, TxQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const hub = yield* TxPubSub.unbounded<string>()
 *
 *   return yield* Effect.scoped(
 *     Effect.gen(function*() {
 *       const sub = yield* TxPubSub.subscribe(hub)
 *       yield* TxPubSub.publish(hub, "hello")
 *       return yield* TxQueue.take(sub)
 *     })
 *   )
 * })
 *
 * await Effect.runPromise(program) // => "hello"
 * ```
 *
 * @category models
 * @since 4.0.0
 */
export interface TxPubSub<in out A> extends Inspectable, Pipeable {
  readonly [TypeId]: typeof TypeId
  /** @internal */
  readonly subscribersRef: TxRef.TxRef<Array<TxQueue.TxQueue<A>>>
  /** @internal */
  readonly shutdownRef: TxRef.TxRef<boolean>
  readonly strategy: "bounded" | "unbounded" | "dropping" | "sliding"
  readonly capacity: number
}

const TxPubSubProto: Omit<TxPubSub<any>, typeof TypeId | "subscribersRef" | "shutdownRef" | "strategy" | "capacity"> = {
  [NodeInspectSymbol](this: TxPubSub<unknown>) {
    return toJson(this)
  },
  toJSON(this: TxPubSub<unknown>) {
    return {
      _id: "TxPubSub",
      strategy: this.strategy,
      capacity: this.capacity
    }
  },
  toString(this: TxPubSub<unknown>) {
    return `TxPubSub(${this.strategy}, ${this.capacity})`
  },
  pipe() {
    return pipeArguments(this, arguments)
  }
}

const makeTxPubSub = <A>(
  subscribersRef: TxRef.TxRef<Array<TxQueue.TxQueue<A>>>,
  shutdownRef: TxRef.TxRef<boolean>,
  strategy: "bounded" | "unbounded" | "dropping" | "sliding",
  cap: number
): TxPubSub<A> => {
  const self = Object.create(TxPubSubProto)
  self[TypeId] = TypeId
  self.subscribersRef = subscribersRef
  self.shutdownRef = shutdownRef
  self.strategy = strategy
  self.capacity = cap
  return self
}

// =============================================================================
// Constructors
// =============================================================================

/**
 * Creates a bounded TxPubSub with the specified capacity. When a subscriber's
 * queue is full, the publisher will retry the transaction until space is available.
 *
 * **Example** (Creating a bounded pub/sub)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxPubSub, TxQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const hub = yield* TxPubSub.bounded<number>(16)
 *
 *   return yield* Effect.scoped(
 *     Effect.gen(function*() {
 *       const sub = yield* TxPubSub.subscribe(hub)
 *       yield* TxPubSub.publish(hub, 42)
 *       return yield* TxQueue.take(sub)
 *     })
 *   )
 * })
 *
 * await Effect.runPromise(program) // => 42
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const bounded = <A = never>(capacity: number): Effect.Effect<TxPubSub<A>> =>
  Effect.gen(function*() {
    const subscribersRef = yield* TxRef.make<Array<TxQueue.TxQueue<A>>>([])
    const shutdownRef = yield* TxRef.make(false)
    return makeTxPubSub(subscribersRef, shutdownRef, "bounded", capacity)
  }).pipe(Effect.tx)

/**
 * Creates a dropping TxPubSub with the specified capacity. When a subscriber's
 * queue is full, the message is dropped for that subscriber.
 *
 * **Example** (Creating a dropping pub/sub)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxPubSub, TxQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const hub = yield* TxPubSub.dropping<number>(2)
 *
 *   return yield* Effect.scoped(
 *     Effect.gen(function*() {
 *       const sub = yield* TxPubSub.subscribe(hub)
 *       yield* TxPubSub.publish(hub, 1)
 *       yield* TxPubSub.publish(hub, 2)
 *       yield* TxPubSub.publish(hub, 3) // dropped
 *       const v1 = yield* TxQueue.take(sub)
 *       const v2 = yield* TxQueue.take(sub)
 *       return [v1, v2]
 *     })
 *   )
 * })
 *
 * await Effect.runPromise(program) // => [1, 2]
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const dropping = <A = never>(capacity: number): Effect.Effect<TxPubSub<A>> =>
  Effect.gen(function*() {
    const subscribersRef = yield* TxRef.make<Array<TxQueue.TxQueue<A>>>([])
    const shutdownRef = yield* TxRef.make(false)
    return makeTxPubSub(subscribersRef, shutdownRef, "dropping", capacity)
  }).pipe(Effect.tx)

/**
 * Creates a sliding TxPubSub with the specified capacity. When a subscriber's
 * queue is full, the oldest message in that subscriber's queue is dropped.
 *
 * **Example** (Creating a sliding pub/sub)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxPubSub, TxQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const hub = yield* TxPubSub.sliding<number>(2)
 *
 *   return yield* Effect.scoped(
 *     Effect.gen(function*() {
 *       const sub = yield* TxPubSub.subscribe(hub)
 *       yield* TxPubSub.publish(hub, 1)
 *       yield* TxPubSub.publish(hub, 2)
 *       yield* TxPubSub.publish(hub, 3) // evicts 1
 *       return yield* TxQueue.take(sub)
 *     })
 *   )
 * })
 *
 * await Effect.runPromise(program) // => 2
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const sliding = <A = never>(capacity: number): Effect.Effect<TxPubSub<A>> =>
  Effect.gen(function*() {
    const subscribersRef = yield* TxRef.make<Array<TxQueue.TxQueue<A>>>([])
    const shutdownRef = yield* TxRef.make(false)
    return makeTxPubSub(subscribersRef, shutdownRef, "sliding", capacity)
  }).pipe(Effect.tx)

/**
 * Creates an unbounded TxPubSub with unlimited capacity. Messages are always accepted.
 *
 * **Example** (Creating an unbounded pub/sub)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxPubSub, TxQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const hub = yield* TxPubSub.unbounded<string>()
 *
 *   return yield* Effect.scoped(
 *     Effect.gen(function*() {
 *       const sub = yield* TxPubSub.subscribe(hub)
 *       yield* TxPubSub.publish(hub, "msg")
 *       return yield* TxQueue.take(sub)
 *     })
 *   )
 * })
 *
 * await Effect.runPromise(program) // => "msg"
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const unbounded = <A = never>(): Effect.Effect<TxPubSub<A>> =>
  Effect.gen(function*() {
    const subscribersRef = yield* TxRef.make<Array<TxQueue.TxQueue<A>>>([])
    const shutdownRef = yield* TxRef.make(false)
    return makeTxPubSub(subscribersRef, shutdownRef, "unbounded", Number.POSITIVE_INFINITY)
  }).pipe(Effect.tx)

// =============================================================================
// Getters
// =============================================================================

/**
 * Returns the capacity of the TxPubSub.
 *
 * **Example** (Reading pub/sub capacity)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxPubSub } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const hub = yield* TxPubSub.bounded<number>(16)
 *   return TxPubSub.capacity(hub)
 * })
 *
 * await Effect.runPromise(program) // => 16
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export const capacity = <A>(self: TxPubSub<A>): number => self.capacity

/**
 * Returns the current number of messages across all subscriber queues (the max).
 *
 * **Example** (Reading subscriber queue size)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxPubSub, TxQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const hub = yield* TxPubSub.unbounded<number>()
 *
 *   return yield* Effect.scoped(
 *     Effect.gen(function*() {
 *       const sub = yield* TxPubSub.subscribe(hub)
 *       yield* TxPubSub.publish(hub, 1)
 *       yield* TxPubSub.publish(hub, 2)
 *       return yield* TxPubSub.size(hub)
 *     })
 *   )
 * })
 *
 * await Effect.runPromise(program) // => 2
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export const size = <A>(self: TxPubSub<A>): Effect.Effect<number> =>
  Effect.gen(function*() {
    const subscribers = yield* TxRef.get(self.subscribersRef)
    let maxSize = 0
    for (const queue of subscribers) {
      const s = yield* TxQueue.size(queue)
      if (s > maxSize) maxSize = s
    }
    return maxSize
  }).pipe(Effect.tx)

/**
 * Checks whether the TxPubSub has no pending messages (all subscriber queues are empty).
 *
 * **Example** (Checking whether a pub/sub is empty)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxPubSub } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const hub = yield* TxPubSub.unbounded<number>()
 *   return yield* TxPubSub.isEmpty(hub)
 * })
 *
 * await Effect.runPromise(program) // => true
 * ```
 *
 * @category predicates
 * @since 2.0.0
 */
export const isEmpty = <A>(self: TxPubSub<A>): Effect.Effect<boolean> => Effect.map(size(self), (s) => s === 0)

/**
 * Checks whether any subscriber queue has pending messages.
 * A pub/sub with no subscribers is empty, even if values have been published.
 *
 * **Example** (Checking whether a pub/sub is non-empty)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxPubSub } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const hub = yield* TxPubSub.unbounded<number>()
 *   const empty = yield* TxPubSub.isNonEmpty(hub)
 *
 *   const nonEmpty = yield* Effect.scoped(Effect.gen(function*() {
 *     yield* TxPubSub.subscribe(hub)
 *     yield* TxPubSub.publish(hub, 1)
 *     return yield* TxPubSub.isNonEmpty(hub)
 *   }))
 *   return [empty, nonEmpty] as const
 * })
 *
 * await Effect.runPromise(program) // => [false, true]
 * ```
 *
 * @category predicates
 * @since 4.0.0
 */
export const isNonEmpty = <A>(self: TxPubSub<A>): Effect.Effect<boolean> => Effect.map(size(self), (s) => s > 0)

/**
 * Checks whether any subscriber queue is at capacity.
 *
 * **Example** (Checking whether a pub/sub is full)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxPubSub } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const hub = yield* TxPubSub.bounded<number>(2)
 *   return yield* TxPubSub.isFull(hub)
 * })
 *
 * await Effect.runPromise(program) // => false
 * ```
 *
 * @category predicates
 * @since 2.0.0
 */
export const isFull = <A>(self: TxPubSub<A>): Effect.Effect<boolean> =>
  Effect.gen(function*() {
    if (self.capacity === Number.POSITIVE_INFINITY) return false
    const subscribers = yield* TxRef.get(self.subscribersRef)
    for (const queue of subscribers) {
      if (yield* TxQueue.isFull(queue)) return true
    }
    return false
  }).pipe(Effect.tx)

/**
 * Checks whether the TxPubSub has been shut down.
 *
 * **Example** (Checking whether a pub/sub is shut down)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxPubSub } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const hub = yield* TxPubSub.unbounded<number>()
 *   const before = yield* TxPubSub.isShutdown(hub)
 *   yield* TxPubSub.shutdown(hub)
 *   return [before, yield* TxPubSub.isShutdown(hub)]
 * })
 *
 * await Effect.runPromise(program) // => [false, true]
 * ```
 *
 * @category predicates
 * @since 2.0.0
 */
export const isShutdown = <A>(self: TxPubSub<A>): Effect.Effect<boolean> => TxRef.get(self.shutdownRef)

// =============================================================================
// Mutations
// =============================================================================

/**
 * Publishes a message to all current subscribers.
 *
 * **Details**
 *
 * Returns `true` if the message was delivered to all subscribers, or `false` if the hub is shut down or the message was dropped for any subscriber. For the bounded strategy, the transaction retries if any subscriber queue is full. For the sliding strategy, full subscriber queues drop their oldest messages. For the dropping strategy, full subscriber queues drop the new message and the operation returns `false`.
 *
 * **Example** (Publishing a message to subscribers)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxPubSub, TxQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const hub = yield* TxPubSub.unbounded<string>()
 *
 *   // No subscribers - publish is a no-op
 *   const r1 = yield* TxPubSub.publish(hub, "no one listening")
 *
 *   const msg = yield* Effect.scoped(
 *     Effect.gen(function*() {
 *       const sub = yield* TxPubSub.subscribe(hub)
 *       yield* TxPubSub.publish(hub, "hello")
 *       return yield* TxQueue.take(sub)
 *     })
 *   )
 *   return [r1, msg]
 * })
 *
 * await Effect.runPromise(program) // => [true, "hello"]
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const publish: {
  <A>(value: A): (self: TxPubSub<A>) => Effect.Effect<boolean>
  <A>(self: TxPubSub<A>, value: A): Effect.Effect<boolean>
} = dual(
  2,
  <A>(self: TxPubSub<A>, value: A): Effect.Effect<boolean> =>
    Effect.gen(function*() {
      if (yield* TxRef.get(self.shutdownRef)) return false

      const subscribers = yield* TxRef.get(self.subscribersRef)
      let allAccepted = true

      for (const queue of subscribers) {
        const accepted = yield* TxQueue.offer(queue, value)
        if (!accepted) allAccepted = false
      }

      return allAccepted
    }).pipe(Effect.tx)
)

/**
 * Publishes all messages from an iterable to all current subscribers.
 *
 * **Details**
 *
 * Returns `true` if all messages were delivered to all subscribers.
 *
 * **Example** (Publishing multiple messages to subscribers)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxPubSub, TxQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const hub = yield* TxPubSub.unbounded<number>()
 *
 *   return yield* Effect.scoped(
 *     Effect.gen(function*() {
 *       const sub = yield* TxPubSub.subscribe(hub)
 *       yield* TxPubSub.publishAll(hub, [1, 2, 3])
 *       const v1 = yield* TxQueue.take(sub)
 *       const v2 = yield* TxQueue.take(sub)
 *       const v3 = yield* TxQueue.take(sub)
 *       return [v1, v2, v3]
 *     })
 *   )
 * })
 *
 * await Effect.runPromise(program) // => [1, 2, 3]
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const publishAll: {
  <A>(values: Iterable<A>): (self: TxPubSub<A>) => Effect.Effect<boolean>
  <A>(self: TxPubSub<A>, values: Iterable<A>): Effect.Effect<boolean>
} = dual(
  2,
  <A>(self: TxPubSub<A>, values: Iterable<A>): Effect.Effect<boolean> => {
    const valuesArray = Arr.fromIterable(values)
    return Effect.gen(function*() {
      if (yield* TxRef.get(self.shutdownRef)) return false

      let allAccepted = true
      for (const value of valuesArray) {
        const accepted = yield* publish(self, value)
        if (!accepted) allAccepted = false
      }
      return allAccepted
    }).pipe(Effect.tx)
  }
)

/**
 * Subscribes to the TxPubSub, returning a scoped `TxQueue` for messages published after subscription.
 *
 * **Details**
 *
 * The returned queue uses the hub's capacity strategy: bounded subscriptions backpressure publishers when full, dropping subscriptions may miss new messages when full, and sliding subscriptions may evict older queued messages. The subscription is automatically removed when the scope is closed.
 *
 * **Example** (Subscribing multiple queues)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxPubSub, TxQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const hub = yield* TxPubSub.unbounded<string>()
 *
 *   return yield* Effect.scoped(
 *     Effect.gen(function*() {
 *       const sub1 = yield* TxPubSub.subscribe(hub)
 *       const sub2 = yield* TxPubSub.subscribe(hub)
 *
 *       yield* TxPubSub.publish(hub, "broadcast")
 *
 *       const msg1 = yield* TxQueue.take(sub1)
 *       const msg2 = yield* TxQueue.take(sub2)
 *       return [msg1, msg2]
 *     })
 *   )
 * })
 *
 * await Effect.runPromise(program) // => ["broadcast", "broadcast"]
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const subscribe = <A>(self: TxPubSub<A>): Effect.Effect<TxQueue.TxQueue<A>, never, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.tx(acquireSubscriber(self)),
    (queue) => Effect.tx(releaseSubscriber(self, queue))
  )

/**
 * Creates a subscriber queue and registers it with the pub/sub.
 *
 * **When to use**
 *
 * Use to create and register a subscriber queue inside a larger transaction
 * when registration must be atomic with other Tx operations.
 *
 * **Details**
 *
 * This is the transactional acquire step of `subscribe`, exposed so that callers can compose it with other Tx operations in a single transaction, such as `TxSubscriptionRef.changes`.
 *
 * @see {@link subscribe} for the scoped acquire and release wrapper when no custom transaction composition is needed
 * @see {@link releaseSubscriber} to remove and shut down a queue returned by `acquireSubscriber`
 *
 * @category mutations
 * @since 4.0.0
 */
export const acquireSubscriber = <A>(
  self: TxPubSub<A>
): Effect.Effect<TxQueue.TxQueue<A>, never, Effect.Transaction> =>
  Effect.gen(function*() {
    const queue = yield* makeSubscriberQueue<A>(self.strategy, self.capacity)
    yield* TxRef.update(self.subscribersRef, (subs) => [...subs, queue])
    return queue
  })

/**
 * Removes a subscriber queue from the pub/sub and shuts it down.
 *
 * **When to use**
 *
 * Use to release a manually acquired subscriber queue inside a larger
 * transaction, removing it from the pub/sub and shutting it down together with
 * related transactional cleanup.
 *
 * **Details**
 *
 * This is the transactional release step of `subscribe`, exposed so that callers can compose it with other Tx operations in a single transaction.
 *
 * **Gotchas**
 *
 * The supplied queue is shut down after being removed, so callers should pass a
 * queue acquired for this pub/sub.
 *
 * @see {@link acquireSubscriber} for the matching transactional acquire step
 * @see {@link subscribe} for the scoped acquire and release wrapper
 *
 * @category mutations
 * @since 4.0.0
 */
export const releaseSubscriber: {
  <A>(queue: TxQueue.TxQueue<A>): (self: TxPubSub<A>) => Effect.Effect<void, never, Effect.Transaction>
  <A>(self: TxPubSub<A>, queue: TxQueue.TxQueue<A>): Effect.Effect<void, never, Effect.Transaction>
} = dual(
  2,
  <A>(
    self: TxPubSub<A>,
    queue: TxQueue.TxQueue<A>
  ): Effect.Effect<void, never, Effect.Transaction> =>
    Effect.gen(function*() {
      yield* TxRef.update(self.subscribersRef, (subs) => subs.filter((q) => q !== queue))
      yield* TxQueue.shutdown(queue)
    })
)

const makeSubscriberQueue = <A>(
  strategy: "bounded" | "unbounded" | "dropping" | "sliding",
  cap: number
): Effect.Effect<TxQueue.TxQueue<A>> => {
  switch (strategy) {
    case "bounded":
      return TxQueue.bounded<A>(cap)
    case "dropping":
      return TxQueue.dropping<A>(cap)
    case "sliding":
      return TxQueue.sliding<A>(cap)
    case "unbounded":
      return TxQueue.unbounded<A>()
  }
}

/**
 * Shuts down the TxPubSub and all subscriber queues registered at the time of shutdown.
 *
 * **Details**
 *
 * After shutdown, `publish` and `publishAll` return `false`, and `awaitShutdown` completes. The operation is idempotent.
 *
 * **Gotchas**
 *
 * Subscribers acquired after shutdown are not automatically shut down by this call.
 *
 * **Example** (Shutting down a pub/sub)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxPubSub } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const hub = yield* TxPubSub.unbounded<number>()
 *   yield* TxPubSub.shutdown(hub)
 *
 *   const shut = yield* TxPubSub.isShutdown(hub)
 *   const accepted = yield* TxPubSub.publish(hub, 1)
 *   return [shut, accepted]
 * })
 *
 * await Effect.runPromise(program) // => [true, false]
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const shutdown = <A>(self: TxPubSub<A>): Effect.Effect<void> =>
  Effect.gen(function*() {
    const alreadyShutdown = yield* TxRef.get(self.shutdownRef)
    if (alreadyShutdown) return

    yield* TxRef.set(self.shutdownRef, true)
    const subscribers = yield* TxRef.get(self.subscribersRef)
    for (const queue of subscribers) {
      yield* TxQueue.shutdown(queue)
    }
  }).pipe(Effect.tx)

/**
 * Waits for the TxPubSub to be shut down.
 *
 * **Example** (Waiting for shutdown)
 *
 * ```ts import.meta.vitest
 * import { Effect, Fiber, TxPubSub } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const hub = yield* TxPubSub.unbounded<number>()
 *
 *   const fiber = yield* Effect.forkChild(TxPubSub.awaitShutdown(hub))
 *   yield* TxPubSub.shutdown(hub)
 *   yield* Fiber.await(fiber)
 *   return yield* TxPubSub.isShutdown(hub)
 * })
 *
 * await Effect.runPromise(program) // => true
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const awaitShutdown = <A>(self: TxPubSub<A>): Effect.Effect<void> =>
  Effect.gen(function*() {
    const shut = yield* TxRef.get(self.shutdownRef)
    if (shut) return
    return yield* Effect.txRetry
  }).pipe(Effect.tx)

// =============================================================================
// Guards
// =============================================================================

/**
 * Checks whether the given value is a TxPubSub.
 *
 * **Example** (Checking for a TxPubSub)
 *
 * ```ts import.meta.vitest
 * import { TxPubSub } from "effect"
 *
 * const someValue: unknown = {}
 * TxPubSub.isTxPubSub(someValue) // => false
 * ```
 *
 * @category guards
 * @since 4.0.0
 */
export const isTxPubSub = (u: unknown): u is TxPubSub<unknown> => hasProperty(u, TypeId)
