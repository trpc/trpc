/**
 * Transactional priority queues whose state is stored in a `TxRef`. Elements
 * are kept in the order defined by the `Order` supplied at construction time,
 * and dequeue operations return the first element according to that ordering.
 *
 * Use `TxPriorityQueue` when multiple fibers coordinate through a shared queue
 * and queue operations need to compose with other transactional state changes.
 * The retrying `peek` and `take` operations wait transactionally when the queue
 * is empty, so they can be combined with other transactional reads and writes in
 * one atomic workflow.
 *
 * @since 4.0.0
 */

import type { Chunk } from "./Chunk.ts"
import * as C from "./Chunk.ts"
import * as Effect from "./Effect.ts"
import { dual } from "./Function.ts"
import type { Inspectable } from "./Inspectable.ts"
import { NodeInspectSymbol, toJson } from "./Inspectable.ts"
import type { Option } from "./Option.ts"
import * as O from "./Option.ts"
import type { Order } from "./Order.ts"
import type { Pipeable } from "./Pipeable.ts"
import { pipeArguments } from "./Pipeable.ts"
import { hasProperty, type Predicate } from "./Predicate.ts"
import * as TxRef from "./TxRef.ts"

const TypeId = "~effect/TxPriorityQueue"

/**
 * A transactional priority queue backed by a sorted `Chunk`.
 *
 * **Details**
 *
 * Elements are stored in ascending order according to the `Order` provided at
 * construction time. `take` returns the smallest element, `peek` observes it
 * without removing.
 *
 * **Example** (Dequeuing values by priority)
 *
 * ```ts import.meta.vitest
 * import { Effect, Order, TxPriorityQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const pq = yield* TxPriorityQueue.empty<number>(Order.Number)
 *   yield* TxPriorityQueue.offer(pq, 3)
 *   yield* TxPriorityQueue.offer(pq, 1)
 *   yield* TxPriorityQueue.offer(pq, 2)
 *   return yield* TxPriorityQueue.take(pq)
 * })
 *
 * await Effect.runPromise(program) // => 1
 * ```
 *
 * @category models
 * @since 4.0.0
 */
export interface TxPriorityQueue<in out A> extends Inspectable, Pipeable {
  readonly [TypeId]: typeof TypeId
  readonly ref: TxRef.TxRef<Chunk<A>>
  readonly ord: Order<A>
}

const TxPriorityQueueProto: Omit<TxPriorityQueue<unknown>, typeof TypeId | "ref" | "ord"> = {
  [NodeInspectSymbol](this: TxPriorityQueue<unknown>) {
    return toJson(this)
  },
  toJSON(this: TxPriorityQueue<unknown>) {
    return {
      _id: "TxPriorityQueue"
    }
  },
  pipe() {
    return pipeArguments(this, arguments)
  }
}

const makeTxPriorityQueue = <A>(ref: TxRef.TxRef<Chunk<A>>, ord: Order<A>): TxPriorityQueue<A> => {
  const self = Object.create(TxPriorityQueueProto)
  self[TypeId] = TypeId
  self.ref = ref
  self.ord = ord
  return self
}

/**
 * Merges the sorted `values` into the sorted `chunk`. Existing elements stay
 * ahead of equal incoming ones, and incoming ties keep their input order.
 *
 * Each insertion point is found by galloping forward from the previous one and
 * then bisecting, so a value that lands close to the last one costs only a few
 * comparisons.
 */
const mergeSorted = <A>(chunk: Chunk<A>, values: ReadonlyArray<A>, ord: Order<A>): Chunk<A> => {
  const arr = C.toReadonlyArray(chunk)
  const out: Array<A> = Array(arr.length + values.length)
  let i = 0
  let k = 0
  for (const value of values) {
    let lo = i
    let hi = i
    for (let step = 1; hi < arr.length && ord(arr[hi], value) <= 0; step *= 2) {
      lo = hi + 1
      hi += step
    }
    hi = Math.min(hi, arr.length)
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (ord(arr[mid], value) <= 0) {
        lo = mid + 1
      } else {
        hi = mid
      }
    }
    for (; i < lo; i++) out[k++] = arr[i]
    out[k++] = value
  }
  for (; i < arr.length; i++) out[k++] = arr[i]
  return C.fromIterable(out)
}

/**
 * Creates an empty `TxPriorityQueue` with the given ordering.
 *
 * **Example** (Creating an empty priority queue)
 *
 * ```ts import.meta.vitest
 * import { Effect, Order, TxPriorityQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const pq = yield* TxPriorityQueue.empty<number>(Order.Number)
 *   return yield* TxPriorityQueue.isEmpty(pq)
 * })
 *
 * await Effect.runPromise(program) // => true
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const empty = <A>(order: Order<A>): Effect.Effect<TxPriorityQueue<A>> =>
  Effect.map(TxRef.make<Chunk<A>>(C.empty()), (ref) => makeTxPriorityQueue(ref, order))

/**
 * Creates a `TxPriorityQueue` from an iterable of elements.
 *
 * **Example** (Creating a priority queue from an iterable)
 *
 * ```ts import.meta.vitest
 * import { Effect, Order, TxPriorityQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const pq = yield* TxPriorityQueue.fromIterable(Order.Number, [3, 1, 2])
 *   return yield* TxPriorityQueue.take(pq)
 * })
 *
 * await Effect.runPromise(program) // => 1
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export function fromIterable<A>(
  order: Order<A>
): (iterable: Iterable<A>) => Effect.Effect<TxPriorityQueue<A>>
export function fromIterable<A>(
  order: Order<A>,
  iterable: Iterable<A>
): Effect.Effect<TxPriorityQueue<A>>
export function fromIterable<A>(
  order: Order<A>,
  iterable?: Iterable<A>
): Effect.Effect<TxPriorityQueue<A>> | ((iterable: Iterable<A>) => Effect.Effect<TxPriorityQueue<A>>) {
  if (iterable === undefined) {
    return (iterable) => fromIterable(order, iterable)
  }
  const arr = Array.from(iterable).sort((a, b) => order(a, b))
  return Effect.map(
    TxRef.make<Chunk<A>>(C.fromIterable(arr)),
    (ref) => makeTxPriorityQueue(ref, order)
  )
}

/**
 * Creates a `TxPriorityQueue` from variadic elements.
 *
 * **Example** (Creating a priority queue from variadic values)
 *
 * ```ts import.meta.vitest
 * import { Effect, Order, TxPriorityQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const pq = yield* TxPriorityQueue.make(Order.Number)(3, 1, 2)
 *   return yield* TxPriorityQueue.take(pq)
 * })
 *
 * await Effect.runPromise(program) // => 1
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const make = <A>(order: Order<A>) => (...elements: Array<A>): Effect.Effect<TxPriorityQueue<A>> =>
  fromIterable(order, elements)

/**
 * Returns the number of elements in the queue.
 *
 * **Example** (Getting the queue size)
 *
 * ```ts import.meta.vitest
 * import { Effect, Order, TxPriorityQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const pq = yield* TxPriorityQueue.fromIterable(Order.Number, [1, 2, 3])
 *   return yield* TxPriorityQueue.size(pq)
 * })
 *
 * await Effect.runPromise(program) // => 3
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export const size = <A>(self: TxPriorityQueue<A>): Effect.Effect<number> => Effect.map(TxRef.get(self.ref), C.size)

/**
 * Returns `true` if the queue is empty.
 *
 * **Example** (Checking whether a queue is empty)
 *
 * ```ts import.meta.vitest
 * import { Effect, Order, TxPriorityQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const pq = yield* TxPriorityQueue.empty<number>(Order.Number)
 *   return yield* TxPriorityQueue.isEmpty(pq)
 * })
 *
 * await Effect.runPromise(program) // => true
 * ```
 *
 * @category predicates
 * @since 2.0.0
 */
export const isEmpty = <A>(self: TxPriorityQueue<A>): Effect.Effect<boolean> => Effect.map(size(self), (n) => n === 0)

/**
 * Returns `true` if the queue has at least one element.
 *
 * **Example** (Checking whether a queue has elements)
 *
 * ```ts import.meta.vitest
 * import { Effect, Order, TxPriorityQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const pq = yield* TxPriorityQueue.fromIterable(Order.Number, [1])
 *   return yield* TxPriorityQueue.isNonEmpty(pq)
 * })
 *
 * await Effect.runPromise(program) // => true
 * ```
 *
 * @category predicates
 * @since 2.0.0
 */
export const isNonEmpty = <A>(self: TxPriorityQueue<A>): Effect.Effect<boolean> => Effect.map(size(self), (n) => n > 0)

/**
 * Observes the smallest element without removing it.
 *
 * **When to use**
 *
 * Use to inspect the next prioritized value and retry transactionally while
 * the queue is empty.
 *
 * **Example** (Peeking at the next value)
 *
 * ```ts import.meta.vitest
 * import { Effect, Order, TxPriorityQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const pq = yield* TxPriorityQueue.fromIterable(Order.Number, [3, 1, 2])
 *   return yield* TxPriorityQueue.peek(pq)
 * })
 *
 * await Effect.runPromise(program) // => 1
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export const peek = <A>(self: TxPriorityQueue<A>): Effect.Effect<A> =>
  Effect.gen(function*() {
    const chunk = yield* TxRef.get(self.ref)
    const head = C.head(chunk)
    if (O.isNone(head)) {
      return yield* Effect.txRetry
    }
    return head.value
  }).pipe(Effect.tx)

/**
 * Observes the smallest element without removing it, returning `None` when the
 * queue is empty.
 *
 * **When to use**
 *
 * Use to inspect the next prioritized value without retrying on an empty queue.
 *
 * **Example** (Peeking without retrying)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, Order, TxPriorityQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const pq = yield* TxPriorityQueue.empty<number>(Order.Number)
 *   return yield* TxPriorityQueue.peekOption(pq)
 * })
 *
 * await Effect.runPromise(program) // => Option.none()
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export const peekOption = <A>(self: TxPriorityQueue<A>): Effect.Effect<Option<A>> =>
  Effect.map(TxRef.get(self.ref), C.head)

/**
 * Inserts an element into the queue in sorted position.
 *
 * **Example** (Offering a value)
 *
 * ```ts import.meta.vitest
 * import { Effect, Order, TxPriorityQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const pq = yield* TxPriorityQueue.empty<number>(Order.Number)
 *   yield* TxPriorityQueue.offer(pq, 2)
 *   yield* TxPriorityQueue.offer(pq, 1)
 *   return yield* TxPriorityQueue.take(pq)
 * })
 *
 * await Effect.runPromise(program) // => 1
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const offer: {
  <A>(value: A): (self: TxPriorityQueue<A>) => Effect.Effect<void>
  <A>(self: TxPriorityQueue<A>, value: A): Effect.Effect<void>
} = dual(
  2,
  <A>(self: TxPriorityQueue<A>, value: A): Effect.Effect<void> =>
    TxRef.update(self.ref, (chunk) => mergeSorted(chunk, [value], self.ord))
)

/**
 * Inserts all elements from an iterable into the queue.
 *
 * **Example** (Offering multiple values)
 *
 * ```ts import.meta.vitest
 * import { Effect, Order, TxPriorityQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const pq = yield* TxPriorityQueue.empty<number>(Order.Number)
 *   yield* TxPriorityQueue.offerAll(pq, [3, 1, 2])
 *   return yield* TxPriorityQueue.take(pq)
 * })
 *
 * await Effect.runPromise(program) // => 1
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const offerAll: {
  <A>(values: Iterable<A>): (self: TxPriorityQueue<A>) => Effect.Effect<void>
  <A>(self: TxPriorityQueue<A>, values: Iterable<A>): Effect.Effect<void>
} = dual(
  2,
  <A>(self: TxPriorityQueue<A>, values: Iterable<A>): Effect.Effect<void> =>
    TxRef.update(self.ref, (chunk) => mergeSorted(chunk, Array.from(values).sort(self.ord), self.ord))
)

/**
 * Takes the smallest element from the queue. Retries if the queue is empty.
 *
 * **Example** (Taking the next value)
 *
 * ```ts import.meta.vitest
 * import { Effect, Order, TxPriorityQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const pq = yield* TxPriorityQueue.fromIterable(Order.Number, [3, 1, 2])
 *   return yield* TxPriorityQueue.take(pq)
 * })
 *
 * await Effect.runPromise(program) // => 1
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const take = <A>(self: TxPriorityQueue<A>): Effect.Effect<A> =>
  Effect.gen(function*() {
    const chunk = yield* TxRef.get(self.ref)
    const head = C.head(chunk)
    if (O.isNone(head)) {
      return yield* Effect.txRetry
    }
    yield* TxRef.set(self.ref, C.drop(chunk, 1))
    return head.value
  }).pipe(Effect.tx)

/**
 * Takes all elements from the queue, returning them in priority order.
 *
 * **Example** (Taking all values in priority order)
 *
 * ```ts import.meta.vitest
 * import { Effect, Order, TxPriorityQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const pq = yield* TxPriorityQueue.fromIterable(Order.Number, [3, 1, 2])
 *   return yield* TxPriorityQueue.takeAll(pq)
 * })
 *
 * await Effect.runPromise(program) // => [1, 2, 3]
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const takeAll = <A>(self: TxPriorityQueue<A>): Effect.Effect<Array<A>> =>
  Effect.map(
    TxRef.modify(self.ref, (chunk) => [chunk, C.empty()]),
    C.toArray
  )

/**
 * Tries to take the smallest element. Returns `None` if the queue is empty.
 *
 * **Example** (Taking without retrying)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, Order, TxPriorityQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const pq = yield* TxPriorityQueue.empty<number>(Order.Number)
 *   return yield* TxPriorityQueue.takeOption(pq)
 * })
 *
 * await Effect.runPromise(program) // => Option.none()
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const takeOption = <A>(self: TxPriorityQueue<A>): Effect.Effect<Option<A>> =>
  TxRef.modify(self.ref, (chunk) => {
    const head = C.head(chunk)
    if (O.isNone(head)) {
      return [O.none<A>(), chunk]
    }
    return [O.some(head.value), C.drop(chunk, 1)]
  })

/**
 * Takes up to `n` elements from the queue in priority order.
 *
 * **Example** (Taking up to a limit)
 *
 * ```ts import.meta.vitest
 * import { Effect, Order, TxPriorityQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const pq = yield* TxPriorityQueue.fromIterable(Order.Number, [5, 3, 1, 4, 2])
 *   return yield* TxPriorityQueue.takeUpTo(pq, 2)
 * })
 *
 * await Effect.runPromise(program) // => [1, 2]
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const takeUpTo: {
  (n: number): <A>(self: TxPriorityQueue<A>) => Effect.Effect<Array<A>>
  <A>(self: TxPriorityQueue<A>, n: number): Effect.Effect<Array<A>>
} = dual(
  2,
  <A>(self: TxPriorityQueue<A>, n: number): Effect.Effect<Array<A>> =>
    Effect.map(
      TxRef.modify(self.ref, (chunk) => {
        const taken = C.take(chunk, n)
        const rest = C.drop(chunk, n)
        return [taken, rest]
      }),
      C.toArray
    )
)

/**
 * Removes elements matching the predicate.
 *
 * **Example** (Removing matching values)
 *
 * ```ts import.meta.vitest
 * import { Effect, Order, TxPriorityQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const pq = yield* TxPriorityQueue.fromIterable(Order.Number, [1, 2, 3, 4, 5])
 *   yield* TxPriorityQueue.removeIf(pq, (n) => n % 2 === 0)
 *   return yield* TxPriorityQueue.takeAll(pq)
 * })
 *
 * await Effect.runPromise(program) // => [1, 3, 5]
 * ```
 *
 * @category filtering
 * @since 2.0.0
 */
export const removeIf: {
  <A>(predicate: Predicate<A>): (self: TxPriorityQueue<A>) => Effect.Effect<void>
  <A>(self: TxPriorityQueue<A>, predicate: Predicate<A>): Effect.Effect<void>
} = dual(
  2,
  <A>(self: TxPriorityQueue<A>, predicate: Predicate<A>): Effect.Effect<void> =>
    TxRef.update(self.ref, (chunk) => C.filter(chunk, (a) => !predicate(a)))
)

/**
 * Keeps only elements matching the predicate.
 *
 * **Example** (Retaining matching values)
 *
 * ```ts import.meta.vitest
 * import { Effect, Order, TxPriorityQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const pq = yield* TxPriorityQueue.fromIterable(Order.Number, [1, 2, 3, 4, 5])
 *   yield* TxPriorityQueue.retainIf(pq, (n) => n % 2 === 0)
 *   return yield* TxPriorityQueue.takeAll(pq)
 * })
 *
 * await Effect.runPromise(program) // => [2, 4]
 * ```
 *
 * @category filtering
 * @since 2.0.0
 */
export const retainIf: {
  <A>(predicate: Predicate<A>): (self: TxPriorityQueue<A>) => Effect.Effect<void>
  <A>(self: TxPriorityQueue<A>, predicate: Predicate<A>): Effect.Effect<void>
} = dual(
  2,
  <A>(self: TxPriorityQueue<A>, predicate: Predicate<A>): Effect.Effect<void> =>
    TxRef.update(self.ref, (chunk) => C.filter(chunk, predicate))
)

/**
 * Returns all elements in priority order without removing them.
 *
 * **Example** (Reading values in priority order)
 *
 * ```ts import.meta.vitest
 * import { Effect, Order, TxPriorityQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const pq = yield* TxPriorityQueue.fromIterable(Order.Number, [3, 1, 2])
 *   return yield* TxPriorityQueue.toArray(pq)
 * })
 *
 * await Effect.runPromise(program) // => [1, 2, 3]
 * ```
 *
 * @category converting
 * @since 2.0.0
 */
export const toArray = <A>(self: TxPriorityQueue<A>): Effect.Effect<Array<A>> =>
  Effect.map(TxRef.get(self.ref), C.toArray)

/**
 * Determines if the provided value is a `TxPriorityQueue`.
 *
 * **Example** (Checking for a TxPriorityQueue)
 *
 * ```ts import.meta.vitest
 * import { Effect, Order, TxPriorityQueue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const pq = yield* TxPriorityQueue.empty<number>(Order.Number)
 *   return [TxPriorityQueue.isTxPriorityQueue(pq), TxPriorityQueue.isTxPriorityQueue("nope")]
 * })
 *
 * await Effect.runPromise(program) // => [true, false]
 * ```
 *
 * @category guards
 * @since 4.0.0
 */
export const isTxPriorityQueue = (u: unknown): u is TxPriorityQueue<unknown> => hasProperty(u, TypeId)
