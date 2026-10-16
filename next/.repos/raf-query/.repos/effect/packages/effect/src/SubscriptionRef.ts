/**
 * Stores mutable state and publishes changes as a stream.
 *
 * A `SubscriptionRef<A>` stores the latest value, publishes the initial value,
 * and publishes every committed update so subscribers can observe state over
 * time. Updates are serialized so only one change is applied at a time. This
 * module includes constructors, current-value reads, the `changes` stream,
 * writes, updates, partial updates, and effectful update helpers.
 *
 * @since 2.0.0
 */
import * as Effect from "./Effect.ts"
import { dual, identity } from "./Function.ts"
import { PipeInspectableProto } from "./internal/core.ts"
import * as Option from "./Option.ts"
import type { Pipeable } from "./Pipeable.ts"
import { hasProperty } from "./Predicate.ts"
import * as PubSub from "./PubSub.ts"
import * as Semaphore from "./Semaphore.ts"
import * as Stream from "./Stream.ts"
import type { Invariant } from "./Types.ts"

const TypeId = "~effect/SubscriptionRef"

/**
 * A mutable reference whose updates are serialized and published to
 * subscribers.
 *
 * **When to use**
 *
 * Use to observe the current value and subsequent updates as a
 * stream.
 *
 * @category models
 * @since 2.0.0
 */
export interface SubscriptionRef<in out A> extends SubscriptionRef.Variance<A>, Pipeable {
  value: A
  readonly semaphore: Semaphore.Semaphore
  readonly pubsub: PubSub.PubSub<A>
}

/**
 * Returns `true` if the provided value is a `SubscriptionRef`.
 *
 * **When to use**
 *
 * Use to narrow an unknown value before calling `SubscriptionRef` operations
 * that require a subscription reference.
 *
 * @category guards
 * @since 4.0.0
 */
export const isSubscriptionRef: (u: unknown) => u is SubscriptionRef<unknown> = (
  u: unknown
): u is SubscriptionRef<unknown> => hasProperty(u, TypeId)

/**
 * The `SubscriptionRef` namespace containing type definitions associated with
 * subscription references.
 *
 * @since 2.0.0
 */
export declare namespace SubscriptionRef {
  /**
   * Type-level variance marker for the value type carried by a
   * `SubscriptionRef`.
   *
   * @category models
   * @since 2.0.0
   */
  export interface Variance<in out A> {
    readonly [TypeId]: {
      readonly _A: Invariant<A>
    }
  }
}

const Proto = {
  ...PipeInspectableProto,
  [TypeId]: {
    _A: identity
  },
  toJSON(this: SubscriptionRef<unknown>) {
    return {
      _id: "SubscriptionRef",
      value: this.value
    }
  }
}

/**
 * Constructs a new `SubscriptionRef` from an initial value.
 *
 * **When to use**
 *
 * Use to create a `SubscriptionRef` when consumers need to read the latest
 * value and subscribe to every update.
 *
 * **Details**
 *
 * The initial value is published during construction, so `changes` starts new
 * subscribers with that value before future updates.
 *
 * @see {@link changes} for streaming the current value and subsequent updates
 * @see {@link set} for replacing the value and notifying subscribers
 *
 * @category constructors
 * @since 2.0.0
 */
export const make = <A>(value: A): Effect.Effect<SubscriptionRef<A>> =>
  Effect.map(PubSub.unbounded<A>({ replay: 1 }), (pubsub) => {
    const self = Object.create(Proto)
    self.semaphore = Semaphore.makeUnsafe(1)
    self.value = value
    self.pubsub = pubsub
    PubSub.publishUnsafe(self.pubsub, value)
    return self
  })

/**
 * Creates a stream that emits the current value and all subsequent changes to
 * the `SubscriptionRef`.
 *
 * **Details**
 *
 * The stream will first emit the current value, then emit all future changes
 * as they occur.
 *
 * **Example** (Streaming changes)
 *
 * ```ts import.meta.vitest
 * import { Deferred, Effect, Fiber, Stream, SubscriptionRef } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const ref = yield* SubscriptionRef.make(0)
 *   const ready = yield* Deferred.make<void>()
 *
 *   const fiber = yield* SubscriptionRef.changes(ref).pipe(
 *     Stream.tap(() => Deferred.succeed(ready, void 0)),
 *     Stream.take(3),
 *     Stream.runCollect,
 *     Effect.forkChild
 *   )
 *
 *   yield* Deferred.await(ready)
 *   yield* SubscriptionRef.set(ref, 1)
 *   yield* SubscriptionRef.set(ref, 2)
 *
 *   const values = yield* Fiber.join(fiber)
 *   return Array.from(values)
 * })
 *
 * await Effect.runPromise(program) // => [0, 1, 2]
 * ```
 *
 * @category subscriptions
 * @since 4.0.0
 */
export const changes = <A>(self: SubscriptionRef<A>): Stream.Stream<A> => Stream.fromPubSub(self.pubsub)

/**
 * Retrieves the current value of the `SubscriptionRef` unsafely.
 *
 * **When to use**
 *
 * Use when you are in synchronous internals or test setup where concurrent
 * updates are controlled.
 *
 * **Gotchas**
 *
 * This function directly accesses the underlying reference without any
 * synchronization. It should only be used when you are certain there are no
 * concurrent modifications.
 *
 * **Example** (Reading the current value unsafely)
 *
 * ```ts import.meta.vitest
 * import { Effect, SubscriptionRef } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const ref = yield* SubscriptionRef.make(42)
 *
 *   return SubscriptionRef.getUnsafe(ref)
 * })
 *
 * await Effect.runPromise(program) // => 42
 * ```
 *
 * @category getters
 * @since 4.0.0
 */
export const getUnsafe = <A>(self: SubscriptionRef<A>): A => self.value

/**
 * Retrieves the current value of the `SubscriptionRef`.
 *
 * **Example** (Reading the current value)
 *
 * ```ts import.meta.vitest
 * import { Effect, SubscriptionRef } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const ref = yield* SubscriptionRef.make(42)
 *
 *   return yield* SubscriptionRef.get(ref)
 * })
 *
 * await Effect.runPromise(program) // => 42
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export const get = <A>(self: SubscriptionRef<A>): Effect.Effect<A> => Effect.sync(() => self.value)

/**
 * Retrieves the current value and sets a new value atomically, notifying
 * subscribers of the change.
 *
 * **Example** (Getting and setting a value)
 *
 * ```ts import.meta.vitest
 * import { Effect, SubscriptionRef } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const ref = yield* SubscriptionRef.make(10)
 *
 *   const oldValue = yield* SubscriptionRef.getAndSet(ref, 20)
 *   const newValue = yield* SubscriptionRef.get(ref)
 *   return [oldValue, newValue]
 * })
 *
 * await Effect.runPromise(program) // => [10, 20]
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export const getAndSet: {
  <A>(value: A): (self: SubscriptionRef<A>) => Effect.Effect<A>
  <A>(self: SubscriptionRef<A>, value: A): Effect.Effect<A>
} = dual(2, <A>(self: SubscriptionRef<A>, value: A) =>
  self.semaphore.withPermit(Effect.sync(() => {
    const current = self.value
    setUnsafe(self, value)
    return current
  })))

const setUnsafe = <A>(self: SubscriptionRef<A>, value: A) => {
  self.value = value
  PubSub.publishUnsafe(self.pubsub, value)
}

/**
 * Retrieves the current value and updates it atomically with the result of
 * applying a function, notifying subscribers of the change.
 *
 * **Example** (Getting and updating a value)
 *
 * ```ts import.meta.vitest
 * import { Effect, SubscriptionRef } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const ref = yield* SubscriptionRef.make(10)
 *
 *   const oldValue = yield* SubscriptionRef.getAndUpdate(ref, (n) => n * 2)
 *   const newValue = yield* SubscriptionRef.get(ref)
 *   return [oldValue, newValue]
 * })
 *
 * await Effect.runPromise(program) // => [10, 20]
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export const getAndUpdate: {
  <A>(update: (a: A) => A): (self: SubscriptionRef<A>) => Effect.Effect<A>
  <A>(self: SubscriptionRef<A>, update: (a: A) => A): Effect.Effect<A>
} = dual(2, <A>(self: SubscriptionRef<A>, update: (a: A) => A) =>
  self.semaphore.withPermit(Effect.sync(() => {
    const current = self.value
    const newValue = update(current)
    setUnsafe(self, newValue)
    return current
  })))

/**
 * Retrieves the current value and updates it atomically with the result of
 * applying an effectful function, notifying subscribers of the change.
 *
 * **Example** (Getting and updating with an effect)
 *
 * ```ts import.meta.vitest
 * import { Effect, SubscriptionRef } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const ref = yield* SubscriptionRef.make(10)
 *
 *   const oldValue = yield* SubscriptionRef.getAndUpdateEffect(
 *     ref,
 *     (n) => Effect.succeed(n + 5)
 *   )
 *   const newValue = yield* SubscriptionRef.get(ref)
 *   return [oldValue, newValue]
 * })
 *
 * await Effect.runPromise(program) // => [10, 15]
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export const getAndUpdateEffect: {
  <A, E, R>(update: (a: A) => Effect.Effect<A, E, R>): (self: SubscriptionRef<A>) => Effect.Effect<A, E, R>
  <A, E, R>(self: SubscriptionRef<A>, update: (a: A) => Effect.Effect<A, E, R>): Effect.Effect<A, E, R>
} = dual(2, <A, E, R>(
  self: SubscriptionRef<A>,
  update: (a: A) => Effect.Effect<A, E, R>
) =>
  self.semaphore.withPermit(Effect.suspend(() => {
    const current = self.value
    return Effect.map(update(current), (newValue) => {
      setUnsafe(self, newValue)
      return current
    })
  })))

/**
 * Retrieves the current value and optionally updates the reference.
 *
 * **When to use**
 *
 * Use to read the old `SubscriptionRef` value while applying a synchronous
 * update only when a new value is available.
 *
 * **Details**
 *
 * If the function returns `Option.some`, the new value is set and published. If
 * it returns `Option.none`, the reference is left unchanged and no update is
 * published.
 *
 * **Example** (Getting and conditionally updating a value)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SubscriptionRef } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const ref = yield* SubscriptionRef.make(10)
 *
 *   const oldValue = yield* SubscriptionRef.getAndUpdateSome(
 *     ref,
 *     (n) => n > 5 ? Option.some(n * 2) : Option.none()
 *   )
 *   const newValue = yield* SubscriptionRef.get(ref)
 *   return [oldValue, newValue]
 * })
 *
 * await Effect.runPromise(program) // => [10, 20]
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export const getAndUpdateSome: {
  <A>(update: (a: A) => Option.Option<A>): (self: SubscriptionRef<A>) => Effect.Effect<A>
  <A>(self: SubscriptionRef<A>, update: (a: A) => Option.Option<A>): Effect.Effect<A>
} = dual(2, <A>(
  self: SubscriptionRef<A>,
  update: (a: A) => Option.Option<A>
) =>
  self.semaphore.withPermit(Effect.sync(() => {
    const current = self.value
    const option = update(current)
    if (Option.isNone(option)) {
      return current
    }
    setUnsafe(self, option.value)
    return current
  })))

/**
 * Retrieves the current value and optionally updates the reference effectfully.
 *
 * **When to use**
 *
 * Use to read the old `SubscriptionRef` value while applying an effectful
 * update only when a new value is available.
 *
 * **Details**
 *
 * If the effect succeeds with `Option.some`, the new value is set and
 * published. If it succeeds with `Option.none`, the reference is left unchanged
 * and no update is published.
 *
 * **Example** (Getting and conditionally updating with an effect)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SubscriptionRef } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const ref = yield* SubscriptionRef.make(10)
 *
 *   const oldValue = yield* SubscriptionRef.getAndUpdateSomeEffect(
 *     ref,
 *     (n) => Effect.succeed(n > 5 ? Option.some(n + 3) : Option.none())
 *   )
 *   const newValue = yield* SubscriptionRef.get(ref)
 *   return [oldValue, newValue]
 * })
 *
 * await Effect.runPromise(program) // => [10, 13]
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export const getAndUpdateSomeEffect: {
  <A, R, E>(
    update: (a: A) => Effect.Effect<Option.Option<A>, E, R>
  ): (self: SubscriptionRef<A>) => Effect.Effect<A, E, R>
  <A, R, E>(
    self: SubscriptionRef<A>,
    update: (a: A) => Effect.Effect<Option.Option<A>, E, R>
  ): Effect.Effect<A, E, R>
} = dual(2, <A, R, E>(
  self: SubscriptionRef<A>,
  update: (a: A) => Effect.Effect<Option.Option<A>, E, R>
) =>
  self.semaphore.withPermit(Effect.suspend(() => {
    const current = self.value
    return Effect.map(update(current), (option) => {
      if (Option.isNone(option)) return current
      setUnsafe(self, option.value)
      return current
    })
  })))

/**
 * Modifies the `SubscriptionRef` atomically with a function that computes a
 * return value and a new value, notifying subscribers of the change.
 *
 * **Example** (Modifying a value)
 *
 * ```ts import.meta.vitest
 * import { Effect, SubscriptionRef } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const ref = yield* SubscriptionRef.make(10)
 *
 *   const result = yield* SubscriptionRef.modify(ref, (n) => [
 *     `Old value was ${n}`,
 *     n * 2
 *   ])
 *   const newValue = yield* SubscriptionRef.get(ref)
 *   return [result, newValue]
 * })
 *
 * await Effect.runPromise(program) // => ["Old value was 10", 20]
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const modify: {
  <A, B>(modify: (a: A) => readonly [B, A]): (self: SubscriptionRef<A>) => Effect.Effect<B>
  <A, B>(self: SubscriptionRef<A>, f: (a: A) => readonly [B, A]): Effect.Effect<B>
} = dual(2, <A, B>(
  self: SubscriptionRef<A>,
  modify: (a: A) => readonly [B, A]
) =>
  self.semaphore.withPermit(Effect.sync(() => {
    const [b, newValue] = modify(self.value)
    setUnsafe(self, newValue)
    return b
  })))

/**
 * Modifies the `SubscriptionRef` atomically with an effectful function that
 * computes a return value and a new value, notifying subscribers of the
 * change.
 *
 * **Example** (Modifying with an effect)
 *
 * ```ts import.meta.vitest
 * import { Effect, SubscriptionRef } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const ref = yield* SubscriptionRef.make(10)
 *
 *   const result = yield* SubscriptionRef.modifyEffect(
 *     ref,
 *     (n) => Effect.succeed([`Doubled from ${n}`, n * 2] as const)
 *   )
 *   const newValue = yield* SubscriptionRef.get(ref)
 *   return [result, newValue]
 * })
 *
 * await Effect.runPromise(program) // => ["Doubled from 10", 20]
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const modifyEffect: {
  <B, A, E, R>(
    modify: (a: A) => Effect.Effect<readonly [B, A], E, R>
  ): (self: SubscriptionRef<A>) => Effect.Effect<B, E, R>
  <A, B, E, R>(
    self: SubscriptionRef<A>,
    modify: (a: A) => Effect.Effect<readonly [B, A], E, R>
  ): Effect.Effect<B, E, R>
} = dual(2, <A, B, E, R>(
  self: SubscriptionRef<A>,
  modify: (a: A) => Effect.Effect<readonly [B, A], E, R>
): Effect.Effect<B, E, R> =>
  self.semaphore.withPermit(Effect.suspend(() =>
    Effect.map(modify(self.value), ([b, newValue]) => {
      setUnsafe(self, newValue)
      return b
    })
  )))

/**
 * Computes a return value and optionally updates the reference.
 *
 * **When to use**
 *
 * Use to return a separate result while synchronously deciding whether to
 * publish a new `SubscriptionRef` value.
 *
 * **Details**
 *
 * If the function returns `Option.some` for the new value, the value is set and
 * published. If it returns `Option.none`, the reference is left unchanged and
 * no update is published.
 *
 * **Example** (Conditionally modifying a value)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SubscriptionRef } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const ref = yield* SubscriptionRef.make(10)
 *
 *   const result = yield* SubscriptionRef.modifySome(
 *     ref,
 *     (n) =>
 *       n > 5 ? ["Updated", Option.some(n * 2)] : ["Not updated", Option.none()]
 *   )
 *   const newValue = yield* SubscriptionRef.get(ref)
 *   return [result, newValue]
 * })
 *
 * await Effect.runPromise(program) // => ["Updated", 20]
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const modifySome: {
  <B, A>(
    modify: (a: A) => readonly [B, Option.Option<A>]
  ): (self: SubscriptionRef<A>) => Effect.Effect<B>
  <A, B>(
    self: SubscriptionRef<A>,
    modify: (a: A) => readonly [B, Option.Option<A>]
  ): Effect.Effect<B>
} = dual(2, <A, B>(
  self: SubscriptionRef<A>,
  modify: (a: A) => readonly [B, Option.Option<A>]
) =>
  self.semaphore.withPermit(Effect.sync(() => {
    const [b, option] = modify(self.value)
    if (Option.isNone(option)) return b
    setUnsafe(self, option.value)
    return b
  })))

/**
 * Computes a return value and optionally updates the reference effectfully.
 *
 * **When to use**
 *
 * Use to return a separate result while effectfully deciding whether to publish
 * a new `SubscriptionRef` value.
 *
 * **Details**
 *
 * If the effect succeeds with `Option.some`, the new value is set and
 * published. If it succeeds with `Option.none`, the reference is left unchanged
 * and no update is published.
 *
 * **Example** (Conditionally modifying with an effect)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SubscriptionRef } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const ref = yield* SubscriptionRef.make(10)
 *
 *   const result = yield* SubscriptionRef.modifySomeEffect(
 *     ref,
 *     (n) =>
 *       Effect.succeed(
 *         n > 5
 *           ? (["Updated", Option.some(n + 5)] as const)
 *           : (["Not updated", Option.none()] as const)
 *       )
 *   )
 *   const newValue = yield* SubscriptionRef.get(ref)
 *   return [result, newValue]
 * })
 *
 * await Effect.runPromise(program) // => ["Updated", 15]
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const modifySomeEffect: {
  <A, B, R, E>(
    modify: (a: A) => Effect.Effect<readonly [B, Option.Option<A>], E, R>
  ): (self: SubscriptionRef<A>) => Effect.Effect<B, E, R>
  <A, B, R, E>(
    self: SubscriptionRef<A>,
    modify: (a: A) => Effect.Effect<readonly [B, Option.Option<A>], E, R>
  ): Effect.Effect<B, E, R>
} = dual(2, <A, B, R, E>(
  self: SubscriptionRef<A>,
  modify: (a: A) => Effect.Effect<readonly [B, Option.Option<A>], E, R>
) =>
  self.semaphore.withPermit(Effect.suspend(() =>
    Effect.map(modify(self.value), ([b, option]) => {
      if (Option.isNone(option)) return b
      setUnsafe(self, option.value)
      return b
    })
  )))

/**
 * Sets the value of the `SubscriptionRef`, notifying all subscribers of the
 * change.
 *
 * **Example** (Setting a value)
 *
 * ```ts import.meta.vitest
 * import { Effect, SubscriptionRef } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const ref = yield* SubscriptionRef.make(0)
 *
 *   yield* SubscriptionRef.set(ref, 42)
 *
 *   return yield* SubscriptionRef.get(ref)
 * })
 *
 * await Effect.runPromise(program) // => 42
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const set: {
  <A>(value: A): (self: SubscriptionRef<A>) => Effect.Effect<void>
  <A>(self: SubscriptionRef<A>, value: A): Effect.Effect<void>
} = dual(
  2,
  <A>(self: SubscriptionRef<A>, value: A) => self.semaphore.withPermit(Effect.sync(() => setUnsafe(self, value)))
)

/**
 * Sets the value of the `SubscriptionRef` and returns the new value,
 * notifying all subscribers of the change.
 *
 * **Example** (Setting and reading the new value)
 *
 * ```ts import.meta.vitest
 * import { Effect, SubscriptionRef } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const ref = yield* SubscriptionRef.make(0)
 *
 *   return yield* SubscriptionRef.setAndGet(ref, 42)
 * })
 *
 * await Effect.runPromise(program) // => 42
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const setAndGet: {
  <A>(value: A): (self: SubscriptionRef<A>) => Effect.Effect<A>
  <A>(self: SubscriptionRef<A>, value: A): Effect.Effect<A>
} = dual(2, <A>(self: SubscriptionRef<A>, value: A) =>
  self.semaphore.withPermit(Effect.sync(() => {
    setUnsafe(self, value)
    return value
  })))

/**
 * Updates the value of the `SubscriptionRef` with the result of applying a
 * function, notifying subscribers of the change.
 *
 * **Example** (Updating a value)
 *
 * ```ts import.meta.vitest
 * import { Effect, SubscriptionRef } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const ref = yield* SubscriptionRef.make(10)
 *
 *   yield* SubscriptionRef.update(ref, (n) => n * 2)
 *
 *   return yield* SubscriptionRef.get(ref)
 * })
 *
 * await Effect.runPromise(program) // => 20
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const update: {
  <A>(update: (a: A) => A): (self: SubscriptionRef<A>) => Effect.Effect<void>
  <A>(self: SubscriptionRef<A>, update: (a: A) => A): Effect.Effect<void>
} = dual(
  2,
  <A>(self: SubscriptionRef<A>, update: (a: A) => A) =>
    self.semaphore.withPermit(Effect.sync(() => setUnsafe(self, update(self.value))))
)

/**
 * Updates the value of the `SubscriptionRef` with the result of applying an
 * effectful function, notifying subscribers of the change.
 *
 * **Example** (Updating with an effect)
 *
 * ```ts import.meta.vitest
 * import { Effect, SubscriptionRef } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const ref = yield* SubscriptionRef.make(10)
 *
 *   yield* SubscriptionRef.updateEffect(ref, (n) => Effect.succeed(n + 5))
 *
 *   return yield* SubscriptionRef.get(ref)
 * })
 *
 * await Effect.runPromise(program) // => 15
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const updateEffect: {
  <A, E, R>(update: (a: A) => Effect.Effect<A, E, R>): (self: SubscriptionRef<A>) => Effect.Effect<void, E, R>
  <A, E, R>(self: SubscriptionRef<A>, update: (a: A) => Effect.Effect<A, E, R>): Effect.Effect<void, E, R>
} = dual(2, <A, E, R>(
  self: SubscriptionRef<A>,
  update: (a: A) => Effect.Effect<A, E, R>
) =>
  self.semaphore.withPermit(
    Effect.suspend(() => Effect.map(update(self.value), (newValue) => setUnsafe(self, newValue)))
  ))

/**
 * Updates the value of the `SubscriptionRef` with the result of applying a
 * function and returns the new value, notifying subscribers of the change.
 *
 * **Example** (Updating and reading the new value)
 *
 * ```ts import.meta.vitest
 * import { Effect, SubscriptionRef } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const ref = yield* SubscriptionRef.make(10)
 *
 *   return yield* SubscriptionRef.updateAndGet(ref, (n) => n * 2)
 * })
 *
 * await Effect.runPromise(program) // => 20
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const updateAndGet: {
  <A>(update: (a: A) => A): (self: SubscriptionRef<A>) => Effect.Effect<A>
  <A>(self: SubscriptionRef<A>, update: (a: A) => A): Effect.Effect<A>
} = dual(2, <A>(self: SubscriptionRef<A>, update: (a: A) => A) =>
  self.semaphore.withPermit(Effect.sync(() => {
    const newValue = update(self.value)
    setUnsafe(self, newValue)
    return newValue
  })))

/**
 * Updates the value of the `SubscriptionRef` with the result of applying an
 * effectful function and returns the new value, notifying subscribers of the
 * change.
 *
 * **Example** (Updating with an effect and reading the new value)
 *
 * ```ts import.meta.vitest
 * import { Effect, SubscriptionRef } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const ref = yield* SubscriptionRef.make(10)
 *
 *   return yield* SubscriptionRef.updateAndGetEffect(
 *     ref,
 *     (n) => Effect.succeed(n + 5)
 *   )
 * })
 *
 * await Effect.runPromise(program) // => 15
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const updateAndGetEffect: {
  <A, E, R>(update: (a: A) => Effect.Effect<A, E, R>): (self: SubscriptionRef<A>) => Effect.Effect<A, E, R>
  <A, E, R>(self: SubscriptionRef<A>, update: (a: A) => Effect.Effect<A, E, R>): Effect.Effect<A, E, R>
} = dual(2, <A, E, R>(
  self: SubscriptionRef<A>,
  update: (a: A) => Effect.Effect<A, E, R>
) =>
  self.semaphore.withPermit(Effect.suspend(() =>
    Effect.map(update(self.value), (newValue) => {
      setUnsafe(self, newValue)
      return newValue
    })
  )))

/**
 * Applies an update function to the current value. If it returns
 * `Option.some`, sets and publishes that value; if it returns `Option.none`,
 * leaves the reference unchanged and does not publish.
 *
 * **Example** (Conditionally updating a value)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SubscriptionRef } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const ref = yield* SubscriptionRef.make(10)
 *
 *   yield* SubscriptionRef.updateSome(
 *     ref,
 *     (n) => n > 5 ? Option.some(n * 2) : Option.none()
 *   )
 *
 *   return yield* SubscriptionRef.get(ref)
 * })
 *
 * await Effect.runPromise(program) // => 20
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const updateSome: {
  <A>(update: (a: A) => Option.Option<A>): (self: SubscriptionRef<A>) => Effect.Effect<void>
  <A>(self: SubscriptionRef<A>, update: (a: A) => Option.Option<A>): Effect.Effect<void>
} = dual(2, <A>(
  self: SubscriptionRef<A>,
  update: (a: A) => Option.Option<A>
) =>
  self.semaphore.withPermit(Effect.sync(() => {
    const option = update(self.value)
    if (Option.isNone(option)) return
    setUnsafe(self, option.value)
  })))

/**
 * Applies an effectful update only when it produces a new value.
 *
 * **When to use**
 *
 * Use to conditionally update a `SubscriptionRef` with an effectful function
 * while discarding the resulting value.
 *
 * **Details**
 *
 * If the effect succeeds with `Option.some`, the new value is set and
 * published. If it succeeds with `Option.none`, the reference is left unchanged
 * and no update is published.
 *
 * **Example** (Conditionally updating with an effect)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SubscriptionRef } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const ref = yield* SubscriptionRef.make(10)
 *
 *   yield* SubscriptionRef.updateSomeEffect(
 *     ref,
 *     (n) => Effect.succeed(n > 5 ? Option.some(n + 3) : Option.none())
 *   )
 *
 *   return yield* SubscriptionRef.get(ref)
 * })
 *
 * await Effect.runPromise(program) // => 13
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const updateSomeEffect: {
  <A, E, R>(
    update: (a: A) => Effect.Effect<Option.Option<A>, E, R>
  ): (self: SubscriptionRef<A>) => Effect.Effect<void, E, R>
  <A, E, R>(
    self: SubscriptionRef<A>,
    update: (a: A) => Effect.Effect<Option.Option<A>, E, R>
  ): Effect.Effect<void, E, R>
} = dual(2, <A, R, E>(
  self: SubscriptionRef<A>,
  update: (a: A) => Effect.Effect<Option.Option<A>, E, R>
) =>
  self.semaphore.withPermit(Effect.suspend(() =>
    Effect.map(update(self.value), (option) => {
      if (Option.isNone(option)) return
      setUnsafe(self, option.value)
    })
  )))

/**
 * Applies an optional update and returns the current value afterward.
 *
 * **When to use**
 *
 * Use to conditionally update a `SubscriptionRef` and read the value that is
 * current after the update decision.
 *
 * **Details**
 *
 * If the function returns `Option.some`, the new value is set, published, and
 * returned. If it returns `Option.none`, the unchanged current value is
 * returned without publishing.
 *
 * **Example** (Conditionally updating and reading the new value)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SubscriptionRef } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const ref = yield* SubscriptionRef.make(10)
 *
 *   return yield* SubscriptionRef.updateSomeAndGet(
 *     ref,
 *     (n) => n > 5 ? Option.some(n * 2) : Option.none()
 *   )
 * })
 *
 * await Effect.runPromise(program) // => 20
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const updateSomeAndGet: {
  <A>(update: (a: A) => Option.Option<A>): (self: SubscriptionRef<A>) => Effect.Effect<A>
  <A>(self: SubscriptionRef<A>, update: (a: A) => Option.Option<A>): Effect.Effect<A>
} = dual(2, <A>(
  self: SubscriptionRef<A>,
  update: (a: A) => Option.Option<A>
) =>
  self.semaphore.withPermit(Effect.sync(() => {
    const current = self.value
    const option = update(current)
    if (Option.isNone(option)) return current
    setUnsafe(self, option.value)
    return option.value
  })))

/**
 * Applies an effectful optional update and returns the current value afterward.
 *
 * **When to use**
 *
 * Use to conditionally update a `SubscriptionRef` effectfully and read the
 * value that is current after the update decision.
 *
 * **Details**
 *
 * If the effect succeeds with `Option.some`, the new value is set, published,
 * and returned. If it succeeds with `Option.none`, the unchanged current value
 * is returned without publishing.
 *
 * **Example** (Conditionally updating with an effect and reading the new value)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SubscriptionRef } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const ref = yield* SubscriptionRef.make(10)
 *
 *   return yield* SubscriptionRef.updateSomeAndGetEffect(
 *     ref,
 *     (n) => Effect.succeed(n > 5 ? Option.some(n + 3) : Option.none())
 *   )
 * })
 *
 * await Effect.runPromise(program) // => 13
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const updateSomeAndGetEffect: {
  <A, E, R>(
    update: (a: A) => Effect.Effect<Option.Option<A>, E, R>
  ): (self: SubscriptionRef<A>) => Effect.Effect<A, E, R>
  <A, E, R>(self: SubscriptionRef<A>, update: (a: A) => Effect.Effect<Option.Option<A>, E, R>): Effect.Effect<A, E, R>
} = dual(2, <A, E, R>(
  self: SubscriptionRef<A>,
  update: (a: A) => Effect.Effect<Option.Option<A>, E, R>
) =>
  self.semaphore.withPermit(Effect.suspend(() => {
    const current = self.value
    return Effect.map(update(current), (option) => {
      if (Option.isNone(option)) return current
      setUnsafe(self, option.value)
      return option.value
    })
  })))
