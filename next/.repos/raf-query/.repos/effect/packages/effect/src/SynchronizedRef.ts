/**
 * Stores mutable state whose updates run one at a time.
 *
 * A `SynchronizedRef<A>` behaves like a `Ref<A>` for reading and simple state
 * storage, but update and modify operations are serialized so each change sees
 * a consistent current value. This is especially useful when the next value is
 * computed by an effect, because the effectful transition is still protected
 * from concurrent updates. This module includes constructors, reads, writes,
 * updates, partial updates, and effectful update helpers.
 *
 * @since 2.0.0
 */
import * as Effect from "./Effect.ts"
import { dual } from "./Function.ts"
import { PipeInspectableProto } from "./internal/core.ts"
import * as Option from "./Option.ts"
import type { Pipeable } from "./Pipeable.ts"
import * as Ref from "./Ref.ts"
import * as Semaphore from "./Semaphore.ts"

const TypeId = "~effect/SynchronizedRef"

/**
 * A mutable reference whose update and modify operations are serialized with an
 * internal semaphore, including effectful transformations.
 *
 * **When to use**
 *
 * Use when shared state may be updated by multiple fibers and each update,
 * including effectful state transitions, must observe one current value and run
 * one at a time.
 *
 * @see {@link Ref.Ref} for a plain `Ref` when updates do not need effectful synchronization
 *
 * @category models
 * @since 2.0.0
 */
export interface SynchronizedRef<in out A> extends Pipeable {
  readonly [TypeId]: typeof TypeId
  readonly backing: Ref.Ref<A>
  readonly semaphore: Semaphore.Semaphore
}

const Proto = {
  ...PipeInspectableProto,
  [TypeId]: TypeId,
  toJSON(this: SynchronizedRef<any>) {
    return {
      _id: "SynchronizedRef",
      value: this.backing.ref.current
    }
  }
}

/**
 * Creates a `SynchronizedRef` synchronously from an initial value.
 *
 * **When to use**
 *
 * Use when you need synchronous `SynchronizedRef` construction outside an
 * Effect workflow.
 *
 * @category constructors
 * @since 4.0.0
 */
export const makeUnsafe = <A>(value: A): SynchronizedRef<A> => {
  const self = Object.create(Proto)
  self.semaphore = Semaphore.makeUnsafe(1)
  self.backing = Ref.makeUnsafe(value)
  return self
}

/**
 * Creates a `SynchronizedRef` from an initial value, wrapped in an `Effect`.
 *
 * **When to use**
 *
 * Use to create a `SynchronizedRef` inside an Effect program when later updates
 * may run effects and must be serialized.
 *
 * **Details**
 *
 * The returned effect constructs a fresh `SynchronizedRef` by delegating to
 * `makeUnsafe` when the effect is evaluated.
 *
 * @see {@link makeUnsafe} for synchronous construction when the caller controls safe initialization
 * @see {@link Ref.make} for a plain `Ref` when updates do not need effectful synchronization
 *
 * @category constructors
 * @since 2.0.0
 */
export const make = <A>(value: A): Effect.Effect<SynchronizedRef<A>> => Effect.sync(() => makeUnsafe(value))

/**
 * Reads the current value synchronously, bypassing the `Effect` API and the
 * ref's semaphore.
 *
 * **When to use**
 *
 * Use when you need immediate synchronous access to a `SynchronizedRef` value
 * in low-level code that can safely read outside an `Effect`.
 *
 * @see {@link get} for the Effect-wrapped read when composing inside Effect programs
 *
 * @category getters
 * @since 4.0.0
 */
export const getUnsafe = <A>(self: SynchronizedRef<A>): A => self.backing.ref.current

/**
 * Returns an `Effect` that reads the current value of the `SynchronizedRef`.
 *
 * **When to use**
 *
 * Use to read the current value of a `SynchronizedRef` inside an `Effect`
 * program without changing it.
 *
 * @see {@link getUnsafe} for synchronous reads when the caller controls safe access outside `Effect`
 *
 * @category getters
 * @since 2.0.0
 */
export const get = <A>(self: SynchronizedRef<A>): Effect.Effect<A> => Effect.sync(() => getUnsafe(self))

/**
 * Sets a new value atomically and returns the previous value, serialized by the
 * ref's semaphore.
 *
 * **When to use**
 *
 * Use to replace a `SynchronizedRef` with a known value when the previous value
 * is also needed.
 *
 * @see {@link set} for setting a value without returning the previous value
 * @see {@link setAndGet} for setting a value and returning the new value
 * @see {@link getAndUpdate} for deriving the new value from the current value
 *
 * @category mutations
 * @since 2.0.0
 */
export const getAndSet: {
  <A>(value: A): (self: SynchronizedRef<A>) => Effect.Effect<A>
  <A>(self: SynchronizedRef<A>, value: A): Effect.Effect<A>
} = dual(
  2,
  <A>(self: SynchronizedRef<A>, value: A): Effect.Effect<A> =>
    self.semaphore.withPermit(Ref.getAndSet(self.backing, value))
)

/**
 * Updates the current value atomically with a function and returns the previous
 * value, serialized by the ref's semaphore.
 *
 * **When to use**
 *
 * Use to run a pure `SynchronizedRef` state update when the previous stored
 * value is also needed.
 *
 * @see {@link update} for updating without returning a value
 * @see {@link updateAndGet} for updating and returning the new value
 * @see {@link getAndUpdateEffect} for effectful updates that return the previous value
 *
 * @category mutations
 * @since 2.0.0
 */
export const getAndUpdate: {
  <A>(f: (a: A) => A): (self: SynchronizedRef<A>) => Effect.Effect<A>
  <A>(self: SynchronizedRef<A>, f: (a: A) => A): Effect.Effect<A>
} = dual(
  2,
  <A>(self: SynchronizedRef<A>, f: (a: A) => A): Effect.Effect<A> =>
    self.semaphore.withPermit(Ref.getAndUpdate(self.backing, f))
)

/**
 * Runs an effectful update atomically while holding the ref's semaphore, sets
 * the new value if the effect succeeds, and returns the previous value.
 *
 * **When to use**
 *
 * Use when you need an effectful `SynchronizedRef` state transition to return
 * the previous stored value.
 *
 * @see {@link getAndUpdate} for pure updates that return the previous value
 * @see {@link updateEffect} for effectful updates without returning a value
 * @see {@link updateAndGetEffect} for effectful updates that return the new value
 * @see {@link modifyEffect} for effectful updates with a custom return value
 * @see {@link getAndUpdateSomeEffect} for conditional effectful updates that return the previous value
 *
 * @category mutations
 * @since 2.0.0
 */
export const getAndUpdateEffect: {
  <A, R, E>(f: (a: A) => Effect.Effect<A, E, R>): (self: SynchronizedRef<A>) => Effect.Effect<A, E, R>
  <A, R, E>(self: SynchronizedRef<A>, f: (a: A) => Effect.Effect<A, E, R>): Effect.Effect<A, E, R>
} = dual(
  2,
  <A, R, E>(self: SynchronizedRef<A>, f: (a: A) => Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    self.semaphore.withPermit(Effect.suspend(() => {
      const value = getUnsafe(self)
      return Effect.map(f(value), (newValue) => {
        self.backing.ref.current = newValue
        return value
      })
    }))
)

/**
 * Applies a partial update atomically and returns the previous value. If the
 * function returns `Option.some`, the ref is updated; if it returns
 * `Option.none`, the ref is left unchanged.
 *
 * **When to use**
 *
 * Use to return the previous `SynchronizedRef` value while applying a pure
 * conditional update.
 *
 * @see {@link getAndUpdate} for always applying a pure update
 * @see {@link updateSome} for applying a pure conditional update without returning the previous value
 *
 * @category mutations
 * @since 2.0.0
 */
export const getAndUpdateSome: {
  <A>(pf: (a: A) => Option.Option<A>): (self: SynchronizedRef<A>) => Effect.Effect<A>
  <A>(self: SynchronizedRef<A>, pf: (a: A) => Option.Option<A>): Effect.Effect<A>
} = dual(
  2,
  <A>(self: SynchronizedRef<A>, pf: (a: A) => Option.Option<A>): Effect.Effect<A> =>
    self.semaphore.withPermit(Ref.getAndUpdateSome(self.backing, pf))
)

/**
 * Runs an effectful partial update atomically while holding the ref's semaphore
 * and returns the previous value. `Option.some` updates the ref; `Option.none`
 * leaves it unchanged.
 *
 * **When to use**
 *
 * Use to return the previous `SynchronizedRef` value while running an effectful
 * conditional update.
 *
 * @see {@link getAndUpdateSome} for the pure conditional variant
 * @see {@link updateSomeEffect} for effectful conditional updates without returning the previous value
 *
 * @category mutations
 * @since 2.0.0
 */
export const getAndUpdateSomeEffect: {
  <A, R, E>(pf: (a: A) => Effect.Effect<Option.Option<A>, E, R>): (self: SynchronizedRef<A>) => Effect.Effect<A, E, R>
  <A, R, E>(self: SynchronizedRef<A>, pf: (a: A) => Effect.Effect<Option.Option<A>, E, R>): Effect.Effect<A, E, R>
} = dual(
  2,
  <A, R, E>(self: SynchronizedRef<A>, pf: (a: A) => Effect.Effect<Option.Option<A>, E, R>): Effect.Effect<A, E, R> =>
    self.semaphore.withPermit(Effect.suspend(() => {
      const value = getUnsafe(self)
      return Effect.flatMap(pf(value), (option) => {
        if (Option.isNone(option)) {
          return Effect.succeed(value)
        }
        self.backing.ref.current = option.value
        return Effect.succeed(value)
      })
    }))
)

/**
 * Computes a return value and a new ref value atomically, stores the new value,
 * and returns the computed result.
 *
 * **When to use**
 *
 * Use to derive a separate result and the next stored `SynchronizedRef` value
 * from the same current value in one serialized pure update.
 *
 * @see {@link modifyEffect} for effectfully deriving both the result and next stored value
 * @see {@link modifySome} for deriving a result and optionally updating the stored value
 * @see {@link updateAndGet} for returning the new stored value instead of a separate result
 *
 * @category mutations
 * @since 2.0.0
 */
export const modify: {
  <A, B>(f: (a: A) => readonly [B, A]): (self: SynchronizedRef<A>) => Effect.Effect<B>
  <A, B>(self: SynchronizedRef<A>, f: (a: A) => readonly [B, A]): Effect.Effect<B>
} = dual(
  2,
  <A, B>(self: SynchronizedRef<A>, f: (a: A) => readonly [B, A]): Effect.Effect<B> =>
    self.semaphore.withPermit(Ref.modify(self.backing, f))
)

/**
 * Runs an effectful modification atomically while holding the ref's semaphore,
 * stores the new value if the effect succeeds, and returns the computed result.
 *
 * **When to use**
 *
 * Use to effectfully compute both a separate return value and the next stored
 * `SynchronizedRef` value in one serialized update.
 *
 * @see {@link modify} for the pure variant
 * @see {@link updateEffect} for effectfully storing a new value without a separate result
 *
 * @category mutations
 * @since 2.0.0
 */
export const modifyEffect: {
  <A, B, E, R>(f: (a: A) => Effect.Effect<readonly [B, A], E, R>): (self: SynchronizedRef<A>) => Effect.Effect<B, E, R>
  <A, B, E, R>(self: SynchronizedRef<A>, f: (a: A) => Effect.Effect<readonly [B, A], E, R>): Effect.Effect<B, E, R>
} = dual(
  2,
  <A, B, E, R>(self: SynchronizedRef<A>, f: (a: A) => Effect.Effect<readonly [B, A], E, R>): Effect.Effect<B, E, R> =>
    self.semaphore.withPermit(Effect.suspend(() => {
      const value = getUnsafe(self)
      return Effect.map(f(value), ([b, a]) => {
        self.backing.ref.current = a
        return b
      })
    }))
)

/**
 * Computes a return value and an optional new ref value atomically.
 * `Option.some` updates the ref; `Option.none` leaves it unchanged.
 *
 * **When to use**
 *
 * Use to compute a return value while optionally updating a `SynchronizedRef`
 * under its semaphore.
 *
 * @see {@link modify} for always storing a new value
 * @see {@link updateSome} for optional updates without a separate return value
 *
 * @category mutations
 * @since 2.0.0
 */
export const modifySome: {
  <B, A>(
    pf: (a: A) => readonly [B, Option.Option<A>]
  ): (self: SynchronizedRef<A>) => Effect.Effect<B>
  <A, B>(
    self: SynchronizedRef<A>,
    pf: (a: A) => readonly [B, Option.Option<A>]
  ): Effect.Effect<B>
} = dual(
  2,
  <A, B>(
    self: SynchronizedRef<A>,
    pf: (a: A) => readonly [B, Option.Option<A>]
  ): Effect.Effect<B> => self.semaphore.withPermit(Ref.modifySome(self.backing, pf))
)

/**
 * Runs an effectful modification atomically while holding the ref's semaphore.
 * The effect computes a return value and an optional new ref value;
 * `Option.some` updates the ref and `Option.none` leaves it unchanged.
 *
 * **When to use**
 *
 * Use to effectfully compute a return value while optionally updating the
 * stored `SynchronizedRef` value.
 *
 * @see {@link modifySome} for the pure variant
 * @see {@link updateSomeEffect} for effectful optional updates without a separate return value
 *
 * @category mutations
 * @since 2.0.0
 */
export const modifySomeEffect: {
  <A, B, R, E>(
    pf: (a: A) => Effect.Effect<readonly [B, Option.Option<A>], E, R>
  ): (self: SynchronizedRef<A>) => Effect.Effect<B, E, R>
  <A, B, R, E>(
    self: SynchronizedRef<A>,
    pf: (a: A) => Effect.Effect<readonly [B, Option.Option<A>], E, R>
  ): Effect.Effect<B, E, R>
} = dual(
  2,
  <A, B, R, E>(
    self: SynchronizedRef<A>,
    pf: (a: A) => Effect.Effect<readonly [B, Option.Option<A>], E, R>
  ): Effect.Effect<B, E, R> =>
    self.semaphore.withPermit(Effect.suspend(() => {
      const value = getUnsafe(self)
      return Effect.flatMap(pf(value), ([b, maybeA]) => {
        if (Option.isNone(maybeA)) {
          return Effect.succeed(b)
        }
        self.backing.ref.current = maybeA.value
        return Effect.succeed(b)
      })
    }))
)

/**
 * Sets the value of the `SynchronizedRef`, serialized by the ref's semaphore.
 *
 * **When to use**
 *
 * Use to replace the current value of a `SynchronizedRef` with a known value
 * while keeping the write serialized with other synchronized updates.
 *
 * @see {@link getAndSet} for replacing the value when the previous value is needed
 * @see {@link setAndGet} for replacing the value when the new value should be returned
 * @see {@link update} for deriving the next value from the current value
 *
 * @category mutations
 * @since 2.0.0
 */
export const set: {
  <A>(value: A): (self: SynchronizedRef<A>) => Effect.Effect<void>
  <A>(self: SynchronizedRef<A>, value: A): Effect.Effect<void>
} = dual(
  2,
  <A>(self: SynchronizedRef<A>, value: A): Effect.Effect<void> =>
    self.semaphore.withPermit(Ref.set(self.backing, value))
)

/**
 * Sets the value of the `SynchronizedRef` and returns the new value.
 *
 * **When to use**
 *
 * Use to replace the current `SynchronizedRef` value with a known value and
 * return that new value.
 *
 * @see {@link set} for setting without returning a value
 * @see {@link getAndSet} for setting while returning the previous value
 *
 * @category mutations
 * @since 2.0.0
 */
export const setAndGet: {
  <A>(value: A): (self: SynchronizedRef<A>) => Effect.Effect<A>
  <A>(self: SynchronizedRef<A>, value: A): Effect.Effect<A>
} = dual(
  2,
  <A>(self: SynchronizedRef<A>, value: A): Effect.Effect<A> =>
    self.semaphore.withPermit(Ref.setAndGet(self.backing, value))
)

/**
 * Updates the value of the `SynchronizedRef` with a function, serialized by the
 * ref's semaphore.
 *
 * **When to use**
 *
 * Use to apply a pure state transition to a `SynchronizedRef` as a serialized
 * `Effect`.
 *
 * @see {@link updateEffect} for effectfully deriving the next value
 * @see {@link updateAndGet} for returning the new stored value
 * @see {@link getAndUpdate} for returning the previous stored value
 *
 * @category mutations
 * @since 2.0.0
 */
export const update: {
  <A>(f: (a: A) => A): (self: SynchronizedRef<A>) => Effect.Effect<void>
  <A>(self: SynchronizedRef<A>, f: (a: A) => A): Effect.Effect<void>
} = dual(
  2,
  <A>(self: SynchronizedRef<A>, f: (a: A) => A): Effect.Effect<void> =>
    self.semaphore.withPermit(Ref.update(self.backing, f))
)

/**
 * Runs an effectful update while holding the ref's semaphore and stores the new
 * value if the effect succeeds.
 *
 * **When to use**
 *
 * Use to run an effectful state transition on a `SynchronizedRef` when storing
 * the new value is the only result you need.
 *
 * @see {@link update} for a pure state transition
 * @see {@link getAndUpdateEffect} for returning the previous stored value
 * @see {@link updateAndGetEffect} for returning the new stored value
 * @see {@link modifyEffect} for returning a separate result while storing a new value
 * @see {@link updateSomeEffect} for effectfully applying only some state transitions
 *
 * @category mutations
 * @since 2.0.0
 */
export const updateEffect: {
  <A, R, E>(f: (a: A) => Effect.Effect<A, E, R>): (self: SynchronizedRef<A>) => Effect.Effect<void, E, R>
  <A, R, E>(self: SynchronizedRef<A>, f: (a: A) => Effect.Effect<A, E, R>): Effect.Effect<void, E, R>
} = dual(
  2,
  <A, R, E>(self: SynchronizedRef<A>, f: (a: A) => Effect.Effect<A, E, R>): Effect.Effect<void, E, R> =>
    self.semaphore.withPermit(Effect.suspend(() => {
      const value = getUnsafe(self)
      return Effect.map(f(value), (newValue) => {
        self.backing.ref.current = newValue
      })
    }))
)

/**
 * Updates the value of the `SynchronizedRef` with a function and returns the
 * new value.
 *
 * **When to use**
 *
 * Use to apply a pure `SynchronizedRef` state transition and return the new
 * stored value.
 *
 * @see {@link update} for updating without returning the new value
 * @see {@link getAndUpdate} for updating while returning the previous value
 *
 * @category mutations
 * @since 2.0.0
 */
export const updateAndGet: {
  <A>(f: (a: A) => A): (self: SynchronizedRef<A>) => Effect.Effect<A>
  <A>(self: SynchronizedRef<A>, f: (a: A) => A): Effect.Effect<A>
} = dual(
  2,
  <A>(self: SynchronizedRef<A>, f: (a: A) => A): Effect.Effect<A> =>
    self.semaphore.withPermit(Ref.updateAndGet(self.backing, f))
)

/**
 * Runs an effectful update while holding the ref's semaphore, stores the new
 * value if the effect succeeds, and returns that new value.
 *
 * **When to use**
 *
 * Use to run an effectful `SynchronizedRef` state transition and return the new
 * stored value.
 *
 * @see {@link updateEffect} for effectful updates without returning the new value
 * @see {@link updateAndGet} for the pure variant
 *
 * @category mutations
 * @since 2.0.0
 */
export const updateAndGetEffect: {
  <A, R, E>(f: (a: A) => Effect.Effect<A, E, R>): (self: SynchronizedRef<A>) => Effect.Effect<A, E, R>
  <A, R, E>(self: SynchronizedRef<A>, f: (a: A) => Effect.Effect<A, E, R>): Effect.Effect<A, E, R>
} = dual(
  2,
  <A, R, E>(self: SynchronizedRef<A>, f: (a: A) => Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    self.semaphore.withPermit(Effect.suspend(() => {
      const value = getUnsafe(self)
      return Effect.map(f(value), (newValue) => {
        self.backing.ref.current = newValue
        return newValue
      })
    }))
)

/**
 * Applies a partial update to the current value. `Option.some` stores the new
 * value; `Option.none` leaves the ref unchanged.
 *
 * **When to use**
 *
 * Use to apply a pure conditional `SynchronizedRef` update without returning a
 * value.
 *
 * @see {@link update} for always applying a pure update
 * @see {@link updateSomeAndGet} for returning the resulting current value
 *
 * @category mutations
 * @since 2.0.0
 */
export const updateSome: {
  <A>(f: (a: A) => Option.Option<A>): (self: SynchronizedRef<A>) => Effect.Effect<void>
  <A>(self: SynchronizedRef<A>, f: (a: A) => Option.Option<A>): Effect.Effect<void>
} = dual(
  2,
  <A>(self: SynchronizedRef<A>, f: (a: A) => Option.Option<A>): Effect.Effect<void> =>
    self.semaphore.withPermit(Ref.updateSome(self.backing, f))
)

/**
 * Runs an effectful partial update while holding the ref's semaphore.
 * `Option.some` stores the new value; `Option.none` leaves the ref unchanged.
 *
 * **When to use**
 *
 * Use to run an effectful conditional `SynchronizedRef` update without
 * returning a value.
 *
 * @see {@link updateSome} for the pure conditional variant
 * @see {@link updateEffect} for effectful updates that always store a new value
 *
 * @category mutations
 * @since 2.0.0
 */
export const updateSomeEffect: {
  <A, R, E>(
    pf: (a: A) => Effect.Effect<Option.Option<A>, E, R>
  ): (self: SynchronizedRef<A>) => Effect.Effect<void, E, R>
  <A, R, E>(self: SynchronizedRef<A>, pf: (a: A) => Effect.Effect<Option.Option<A>, E, R>): Effect.Effect<void, E, R>
} = dual(
  2,
  <A, R, E>(self: SynchronizedRef<A>, pf: (a: A) => Effect.Effect<Option.Option<A>, E, R>): Effect.Effect<void, E, R> =>
    self.semaphore.withPermit(Effect.suspend(() => {
      const value = getUnsafe(self)
      return Effect.map(pf(value), (option) => {
        if (Option.isNone(option)) {
          return
        }
        self.backing.ref.current = option.value
      })
    }))
)

/**
 * Applies a partial update and returns the resulting current value.
 * `Option.some` stores and returns the new value; `Option.none` returns the
 * unchanged value.
 *
 * **When to use**
 *
 * Use to apply a pure conditional `SynchronizedRef` update and return the
 * resulting current value.
 *
 * @see {@link updateSome} for conditional updates without returning a value
 * @see {@link updateAndGet} for always applying a pure update and returning the new value
 *
 * @category mutations
 * @since 2.0.0
 */
export const updateSomeAndGet: {
  <A>(pf: (a: A) => Option.Option<A>): (self: SynchronizedRef<A>) => Effect.Effect<A>
  <A>(self: SynchronizedRef<A>, pf: (a: A) => Option.Option<A>): Effect.Effect<A>
} = dual(
  2,
  <A>(self: SynchronizedRef<A>, pf: (a: A) => Option.Option<A>): Effect.Effect<A> =>
    self.semaphore.withPermit(Ref.updateSomeAndGet(self.backing, pf))
)

/**
 * Runs an effectful partial update while holding the ref's semaphore and
 * returns the resulting current value. `Option.some` stores and returns the new
 * value; `Option.none` returns the unchanged value.
 *
 * **When to use**
 *
 * Use to run an effectful conditional `SynchronizedRef` update and return the
 * resulting current value.
 *
 * @see {@link updateSomeEffect} for effectful conditional updates without returning a value
 * @see {@link updateAndGetEffect} for effectful updates that always store and return a new value
 *
 * @category mutations
 * @since 2.0.0
 */
export const updateSomeAndGetEffect: {
  <A, R, E>(pf: (a: A) => Effect.Effect<Option.Option<A>, E, R>): (self: SynchronizedRef<A>) => Effect.Effect<A, E, R>
  <A, R, E>(self: SynchronizedRef<A>, pf: (a: A) => Effect.Effect<Option.Option<A>, E, R>): Effect.Effect<A, E, R>
} = dual(
  2,
  <A, R, E>(self: SynchronizedRef<A>, pf: (a: A) => Effect.Effect<Option.Option<A>, E, R>): Effect.Effect<A, E, R> =>
    self.semaphore.withPermit(Effect.suspend(() => {
      const value = getUnsafe(self)
      return Effect.flatMap(pf(value), (option) => {
        if (Option.isNone(option)) {
          return Effect.succeed(value)
        }
        self.backing.ref.current = option.value
        return Effect.succeed(option.value)
      })
    }))
)
