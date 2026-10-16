/**
 * Stores fiber-safe mutable state inside Effect programs.
 *
 * A `Ref<A>` holds one value and exposes reads, writes, and atomic
 * transformations as effects, so state changes compose with Effect's
 * concurrency model. This module includes constructors, safe and unsafe reads,
 * set and get-and-set helpers, update and modify helpers, and conditional
 * update variants that leave the value unchanged when an `Option.none` result
 * is returned.
 *
 * @since 2.0.0
 */
import * as Effect from "./Effect.ts"
import { dual, identity } from "./Function.ts"
import { PipeInspectableProto } from "./internal/core.ts"
import * as MutableRef from "./MutableRef.ts"
import type * as Option from "./Option.ts"
import type { Pipeable } from "./Pipeable.ts"
import type { Invariant } from "./Types.ts"

const TypeId = "~effect/Ref"

/**
 * A mutable reference that provides atomic read, write, and update operations.
 *
 * **When to use**
 *
 * Use to keep shared mutable state that is read and updated inside Effect
 * programs.
 *
 * **Details**
 *
 * A `Ref` is a thread-safe mutable reference type for shared state. It supports
 * simple read and write operations as well as atomic transformations.
 *
 * **Example** (Reading and updating a ref)
 *
 * ```ts import.meta.vitest
 * import { Effect, Ref } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const counter = yield* Ref.make(0)
 *   const value = yield* Ref.get(counter)
 *   yield* Ref.update(counter, (n) => n + 1)
 *   const newValue = yield* Ref.get(counter)
 *   return [value, newValue]
 * })
 *
 * await Effect.runPromise(program) // => [0, 1]
 * ```
 *
 * @see {@link make} for creating a `Ref`
 * @see {@link get} for reading the current value
 * @see {@link set} for replacing the current value
 *
 * @category models
 * @since 2.0.0
 */
export interface Ref<in out A> extends Ref.Variance<A>, Pipeable {
  readonly ref: MutableRef.MutableRef<A>
}

/**
 * The Ref namespace containing type definitions and utilities.
 *
 * **When to use**
 *
 * Use when referring to type members nested under the `Ref` namespace.
 *
 * @since 2.0.0
 */
export declare namespace Ref {
  /**
   * Variance interface for Ref types, defining the type parameter constraints.
   *
   * **When to use**
   *
   * Use when working with the type-level variance marker carried by `Ref`.
   *
   * **Example** (Using invariant refs)
   *
   * ```ts import.meta.vitest
   * import { Effect, Ref } from "effect"
   *
   * const program = Effect.gen(function*() {
   *   const ref = yield* Ref.make(42)
   *   const value = yield* Ref.get(ref)
   *   yield* Ref.set(ref, value + 1)
   *   return yield* Ref.get(ref)
   * })
   *
   * await Effect.runPromise(program) // => 43
   * ```
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

const RefProto = {
  [TypeId]: {
    _A: identity
  },
  ...PipeInspectableProto,
  toJSON(this: Ref<any>) {
    return {
      _id: "Ref",
      ref: this.ref
    }
  }
}

/**
 * Creates a new Ref with the specified initial value (unsafe version).
 *
 * **When to use**
 *
 * Use when you need immediate synchronous construction and can guarantee
 * that creating the `Ref` outside of `Effect` is safe.
 *
 * **Gotchas**
 *
 * Prefer `Ref.make` for Effect-wrapped creation in Effect programs.
 *
 * **Example** (Creating a ref unsafely)
 *
 * ```ts import.meta.vitest
 * import { Ref } from "effect"
 *
 * const counter = Ref.makeUnsafe(0)
 * Ref.getUnsafe(counter) // => 0
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const makeUnsafe = <A>(value: A): Ref<A> => {
  const self = Object.create(RefProto)
  self.ref = MutableRef.make(value)
  return self
}

/**
 * Creates a new Ref with the specified initial value.
 *
 * **When to use**
 *
 * Use to create a `Ref` for shared mutable state inside an Effect program.
 *
 * **Example** (Creating a ref)
 *
 * ```ts import.meta.vitest
 * import { Effect, Ref } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const ref = yield* Ref.make(42)
 *   return yield* Ref.get(ref)
 * })
 *
 * await Effect.runPromise(program) // => 42
 * ```
 *
 * @see {@link makeUnsafe} for synchronous construction outside Effect code
 *
 * @category constructors
 * @since 2.0.0
 */
export const make = <A>(value: A): Effect.Effect<Ref<A>> => Effect.sync(() => makeUnsafe(value))

/**
 * Gets the current value of the Ref.
 *
 * **When to use**
 *
 * Use to read the current `Ref` value without changing it.
 *
 * **Example** (Getting the current value)
 *
 * ```ts import.meta.vitest
 * import { Effect, Ref } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const ref = yield* Ref.make(42)
 *   return yield* Ref.get(ref)
 * })
 *
 * await Effect.runPromise(program) // => 42
 * ```
 *
 * @see {@link set} for replacing the current value
 *
 * @category getters
 * @since 2.0.0
 */
export const get = <A>(self: Ref<A>) => Effect.sync(() => self.ref.current)

/**
 * Sets the value of the Ref to the specified value.
 *
 * **When to use**
 *
 * Use to replace the current `Ref` value with a known value.
 *
 * **Example** (Setting a value)
 *
 * ```ts import.meta.vitest
 * import { Effect, Ref } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const ref = yield* Ref.make(0)
 *   yield* Ref.set(ref, 42)
 *   return yield* Ref.get(ref)
 * })
 *
 * const program2 = Effect.gen(function*() {
 *   const ref = yield* Ref.make(0)
 *   yield* Ref.set(ref, 100)
 *   return yield* Ref.get(ref)
 * })
 *
 * await Effect.runPromise(program) // => 42
 * await Effect.runPromise(program2) // => 100
 * ```
 *
 * @see {@link getAndSet} for setting while returning the previous value
 * @see {@link setAndGet} for setting while returning the new value
 *
 * @category mutations
 * @since 2.0.0
 */
export const set = dual<
  <A>(value: A) => (self: Ref<A>) => Effect.Effect<void>,
  <A>(self: Ref<A>, value: A) => Effect.Effect<void>
>(2, <A>(self: Ref<A>, value: A) => Effect.sync(() => MutableRef.set(self.ref, value)))

/**
 * Gets the current value of the Ref, sets it to the specified value, and returns the previous value atomically.
 *
 * **When to use**
 *
 * Use to replace a plain `Ref` value while returning the previous value.
 *
 * **Example** (Replacing a value atomically)
 *
 * ```ts import.meta.vitest
 * import { Effect, Ref } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const ref = yield* Ref.make("initial")
 *
 *   const previous = yield* Ref.getAndSet(ref, "updated")
 *   const current = yield* Ref.get(ref)
 *   return [previous, current]
 * })
 *
 * await Effect.runPromise(program) // => ["initial", "updated"]
 * ```
 *
 * @see {@link set} for setting without returning the previous value
 * @see {@link getAndUpdate} for deriving the new value from the previous value
 *
 * @category mutations
 * @since 2.0.0
 */
export const getAndSet = dual<
  <A>(value: A) => (self: Ref<A>) => Effect.Effect<A>,
  <A>(self: Ref<A>, value: A) => Effect.Effect<A>
>(2, <A>(self: Ref<A>, value: A) =>
  Effect.sync(() => {
    const current = self.ref.current
    self.ref.current = value
    return current
  }))

/**
 * Gets the current value of the Ref, updates it with the given function, and returns the previous value atomically.
 *
 * **When to use**
 *
 * Use to derive a new `Ref` value while returning the previous value.
 *
 * **Example** (Updating and returning the previous value)
 *
 * ```ts import.meta.vitest
 * import { Effect, Ref } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const counter = yield* Ref.make(10)
 *
 *   const previous = yield* Ref.getAndUpdate(counter, (n) => n * 2)
 *   const current = yield* Ref.get(counter)
 *   return [previous, current]
 * })
 *
 * await Effect.runPromise(program) // => [10, 20]
 * ```
 *
 * @see {@link update} for updating without returning the previous value
 * @see {@link updateAndGet} for returning the new value instead
 *
 * @category mutations
 * @since 2.0.0
 */
export const getAndUpdate = dual<
  <A>(f: (a: A) => A) => (self: Ref<A>) => Effect.Effect<A>,
  <A>(self: Ref<A>, f: (a: A) => A) => Effect.Effect<A>
>(2, <A>(self: Ref<A>, f: (a: A) => A) =>
  Effect.sync(() => {
    const current = self.ref.current
    self.ref.current = f(current)
    return current
  }))

/**
 * Gets the current value of the Ref and updates it atomically with the given partial function.
 *
 * **When to use**
 *
 * Use to return the previous `Ref` value while applying a conditional update.
 *
 * **Details**
 *
 * If the partial function returns `Option.some`, the Ref is updated with the
 * new value. If it returns `Option.none`, the Ref is left unchanged. The effect
 * always returns the value that was in the Ref before the attempted update.
 *
 * **Example** (Conditionally updating and returning the previous value)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, Ref } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const counter = yield* Ref.make(5)
 *
 *   const previous1 = yield* Ref.getAndUpdateSome(
 *     counter,
 *     (n) => n > 3 ? Option.some(n * 2) : Option.none()
 *   )
 *   const current1 = yield* Ref.get(counter)
 *   const previous2 = yield* Ref.getAndUpdateSome(
 *     counter,
 *     (n) => n < 3 ? Option.some(n * 2) : Option.none()
 *   )
 *   const current2 = yield* Ref.get(counter)
 *   return [previous1, current1, previous2, current2]
 * })
 *
 * await Effect.runPromise(program) // => [5, 10, 10, 10]
 * ```
 *
 * @see {@link getAndUpdate} for always applying an update
 * @see {@link updateSome} for conditional updates without returning the previous value
 *
 * @category mutations
 * @since 2.0.0
 */
export const getAndUpdateSome = dual<
  <A>(pf: (a: A) => Option.Option<A>) => (self: Ref<A>) => Effect.Effect<A>,
  <A>(self: Ref<A>, pf: (a: A) => Option.Option<A>) => Effect.Effect<A>
>(2, <A>(self: Ref<A>, pf: (a: A) => Option.Option<A>) =>
  Effect.sync(() => {
    const current = self.ref.current
    const option = pf(current)
    if (option._tag === "Some") {
      self.ref.current = option.value
    }
    return current
  }))

/**
 * Sets the value of the Ref atomically to the specified value and returns the new value.
 *
 * **When to use**
 *
 * Use when you want to set a `Ref` value and immediately get it back in one
 * atomic operation.
 *
 * **Example** (Setting and returning the new value)
 *
 * ```ts import.meta.vitest
 * import { Effect, Ref } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const ref = yield* Ref.make(10)
 *
 *   const newValue = yield* Ref.setAndGet(ref, 42)
 *   const current = yield* Ref.get(ref)
 *   return [newValue, current]
 * })
 *
 * const program2 = Effect.gen(function*() {
 *   const counter = yield* Ref.make(0)
 *   return yield* Ref.setAndGet(counter, 20)
 * })
 *
 * await Effect.runPromise(program) // => [42, 42]
 * await Effect.runPromise(program2) // => 20
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const setAndGet = dual<
  <A>(value: A) => (self: Ref<A>) => Effect.Effect<A>,
  <A>(self: Ref<A>, value: A) => Effect.Effect<A>
>(2, <A>(self: Ref<A>, value: A) => Effect.sync(() => self.ref.current = value))

/**
 * Modifies the value of the Ref atomically using the given function.
 *
 * **When to use**
 *
 * Use to compute both a separate return value and the next stored `Ref` value
 * in one atomic update.
 *
 * **Details**
 *
 * The function receives the current value and returns a tuple of
 * `[result, newValue]`. The Ref is updated with `newValue`, and `result` is
 * returned by the effect.
 *
 * **Example** (Modifying a value atomically)
 *
 * ```ts import.meta.vitest
 * import { Effect, Ref } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const counter = yield* Ref.make(10)
 *
 *   const result = yield* Ref.modify(counter, (n) => [
 *     `Previous value was ${n}`,
 *     n * 2
 *   ])
 *   const current = yield* Ref.get(counter)
 *   return [result, current]
 * })
 *
 * const program2 = Effect.gen(function*() {
 *   const state = yield* Ref.make({ count: 0, total: 0 })
 *   return yield* Ref.modify(state, (s) => [
 *     s.count,
 *     { count: s.count + 1, total: s.total + s.count + 1 }
 *   ])
 * })
 *
 * await Effect.runPromise(program) // => ["Previous value was 10", 20]
 * await Effect.runPromise(program2) // => 0
 * ```
 *
 * @see {@link updateAndGet} for returning the new stored value
 * @see {@link modifySome} for optionally updating while returning a separate result
 *
 * @category mutations
 * @since 2.0.0
 */
export const modify = dual<
  <A, B>(f: (a: A) => readonly [B, A]) => (self: Ref<A>) => Effect.Effect<B>,
  <A, B>(self: Ref<A>, f: (a: A) => readonly [B, A]) => Effect.Effect<B>
>(2, (self, f) =>
  Effect.sync(() => {
    const [b, a] = f(self.ref.current)
    self.ref.current = a
    return b
  }))

/**
 * Computes a result atomically and optionally updates the value of the `Ref`.
 *
 * **When to use**
 *
 * Use to compute a return value while optionally updating a plain `Ref`.
 *
 * **Details**
 *
 * The callback receives the current value and returns `[result, nextValue]`,
 * where `nextValue` is an `Option`. If `nextValue` is `Option.some(value)`,
 * the `Ref` is updated to `value`; if it is `Option.none()`, the `Ref` is left
 * unchanged. The returned effect always succeeds with `result`.
 *
 * **Example** (Conditionally modifying a value)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, Ref } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const counter = yield* Ref.make(5)
 *
 *   const result1 = yield* Ref.modifySome(
 *     counter,
 *     (n) =>
 *       n > 3
 *         ? [`incremented ${n}`, Option.some(n + 10)]
 *         : ["no change", Option.none()]
 *   )
 *   const current1 = yield* Ref.get(counter)
 *   const result2 = yield* Ref.modifySome(
 *     counter,
 *     (n) =>
 *       n < 10
 *         ? [`decremented ${n}`, Option.some(n - 5)]
 *         : ["no change", Option.none()]
 *   )
 *   const current2 = yield* Ref.get(counter)
 *   return [result1, current1, result2, current2]
 * })
 *
 * await Effect.runPromise(program) // => ["incremented 5", 15, "no change", 15]
 * ```
 *
 * @see {@link modify} for always storing a new value
 * @see {@link updateSome} for optional updates without a separate return value
 *
 * @category mutations
 * @since 2.0.0
 */
export const modifySome: {
  <B, A>(pf: (a: A) => readonly [B, Option.Option<A>]): (self: Ref<A>) => Effect.Effect<B>
  <A, B>(self: Ref<A>, pf: (a: A) => readonly [B, Option.Option<A>]): Effect.Effect<B>
} = dual<
  <B, A>(
    pf: (a: A) => readonly [B, Option.Option<A>]
  ) => (self: Ref<A>) => Effect.Effect<B>,
  <A, B>(
    self: Ref<A>,
    pf: (a: A) => readonly [B, Option.Option<A>]
  ) => Effect.Effect<B>
>(2, (self, pf) =>
  modify(self, (value) => {
    const [b, option] = pf(value)
    return [b, option._tag === "None" ? value : option.value]
  }))

/**
 * Updates the value of the Ref atomically using the given function.
 *
 * **When to use**
 *
 * Use to apply a `Ref` state transition without returning a value.
 *
 * **Example** (Updating a value)
 *
 * ```ts import.meta.vitest
 * import { Effect, Ref } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const counter = yield* Ref.make(5)
 *
 *   yield* Ref.update(counter, (n) => n * 2)
 *   return yield* Ref.get(counter)
 * })
 *
 * const program2 = Effect.gen(function*() {
 *   const counter = yield* Ref.make(5)
 *   yield* Ref.update(counter, (n: number) => n + 10)
 *   return yield* Ref.get(counter)
 * })
 *
 * await Effect.runPromise(program) // => 10
 * await Effect.runPromise(program2) // => 15
 * ```
 *
 * @see {@link updateAndGet} for returning the new value
 * @see {@link getAndUpdate} for returning the previous value
 *
 * @category mutations
 * @since 2.0.0
 */
export const update = dual<
  <A>(f: (a: A) => A) => (self: Ref<A>) => Effect.Effect<void>,
  <A>(self: Ref<A>, f: (a: A) => A) => Effect.Effect<void>
>(2, <A>(self: Ref<A>, f: (a: A) => A) =>
  Effect.sync(() => {
    self.ref.current = f(self.ref.current)
  }))

/**
 * Updates the value of the Ref atomically using the given function and returns the new value.
 *
 * **When to use**
 *
 * Use to apply a `Ref` state transition and return the new stored value.
 *
 * **Example** (Updating and returning the new value)
 *
 * ```ts import.meta.vitest
 * import { Effect, Ref } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const counter = yield* Ref.make(5)
 *
 *   const newValue = yield* Ref.updateAndGet(counter, (n) => n * 3)
 *   const current = yield* Ref.get(counter)
 *   return [newValue, current]
 * })
 *
 * await Effect.runPromise(program) // => [15, 15]
 * ```
 *
 * @see {@link update} for updating without returning the new value
 * @see {@link getAndUpdate} for returning the previous value instead
 *
 * @category mutations
 * @since 2.0.0
 */
export const updateAndGet = dual<
  <A>(f: (a: A) => A) => (self: Ref<A>) => Effect.Effect<A>,
  <A>(self: Ref<A>, f: (a: A) => A) => Effect.Effect<A>
>(2, <A>(self: Ref<A>, f: (a: A) => A) => Effect.sync(() => self.ref.current = f(self.ref.current)))

/**
 * Updates the value of the Ref atomically using the given partial function.
 *
 * **When to use**
 *
 * Use to apply a conditional `Ref` update without returning a value.
 *
 * **Details**
 *
 * If the partial function returns `Option.some`, the Ref is updated with the
 * new value. If it returns `Option.none`, the Ref is left unchanged.
 *
 * **Example** (Conditionally updating a value)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, Ref } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const counter = yield* Ref.make(5)
 *
 *   yield* Ref.updateSome(
 *     counter,
 *     (n) => n % 2 === 0 ? Option.some(n * 2) : Option.none()
 *   )
 *   const before = yield* Ref.get(counter)
 *   yield* Ref.set(counter, 6)
 *   yield* Ref.updateSome(
 *     counter,
 *     (n) => n % 2 === 0 ? Option.some(n * 2) : Option.none()
 *   )
 *   const after = yield* Ref.get(counter)
 *   return [before, after]
 * })
 *
 * await Effect.runPromise(program) // => [5, 12]
 * ```
 *
 * @see {@link update} for always applying an update
 * @see {@link updateSomeAndGet} for returning the resulting current value
 *
 * @category mutations
 * @since 2.0.0
 */
export const updateSome = dual<
  <A>(f: (a: A) => Option.Option<A>) => (self: Ref<A>) => Effect.Effect<void>,
  <A>(self: Ref<A>, f: (a: A) => Option.Option<A>) => Effect.Effect<void>
>(2, <A>(self: Ref<A>, f: (a: A) => Option.Option<A>) =>
  Effect.sync(() => {
    const option = f(self.ref.current)
    if (option._tag === "Some") {
      self.ref.current = option.value
    }
  }))

/**
 * Updates the value of the Ref atomically using the given partial function and returns the current value.
 *
 * **When to use**
 *
 * Use to apply a conditional `Ref` update and return the resulting current
 * value.
 *
 * **Details**
 *
 * If the partial function returns `Option.some`, the Ref is updated with the
 * new value. If it returns `Option.none`, the Ref is left unchanged. The effect
 * returns the current value of the Ref after the potential update.
 *
 * **Example** (Conditionally updating and returning the current value)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, Ref } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const counter = yield* Ref.make(10)
 *
 *   const result1 = yield* Ref.updateSomeAndGet(
 *     counter,
 *     (n) => n > 5 ? Option.some(n / 2) : Option.none()
 *   )
 *   const result2 = yield* Ref.updateSomeAndGet(
 *     counter,
 *     (n) => n > 5 ? Option.some(n / 2) : Option.none()
 *   )
 *   return [result1, result2]
 * })
 *
 * await Effect.runPromise(program) // => [5, 5]
 * ```
 *
 * @see {@link updateSome} for conditional updates without returning a value
 * @see {@link updateAndGet} for always updating and returning the new value
 *
 * @category mutations
 * @since 2.0.0
 */
export const updateSomeAndGet = dual<
  <A>(pf: (a: A) => Option.Option<A>) => (self: Ref<A>) => Effect.Effect<A>,
  <A>(self: Ref<A>, pf: (a: A) => Option.Option<A>) => Effect.Effect<A>
>(2, <A>(self: Ref<A>, pf: (a: A) => Option.Option<A>) =>
  Effect.sync(() => {
    const option = pf(self.ref.current)
    if (option._tag === "Some") {
      self.ref.current = option.value
    }
    return self.ref.current
  }))

/**
 * Gets the current value of the Ref synchronously (unsafe version).
 *
 * **When to use**
 *
 * Use when you need immediate synchronous access and can guarantee that
 * reading the `Ref` outside of `Effect` is safe.
 *
 * **Gotchas**
 *
 * Prefer `Ref.get` for Effect-wrapped access in Effect programs.
 *
 * **Example** (Reading a ref unsafely)
 *
 * ```ts import.meta.vitest
 * import { Ref } from "effect"
 *
 * const counter = Ref.makeUnsafe(42)
 * Ref.getUnsafe(counter) // => 42
 * ```
 *
 * @category getters
 * @since 4.0.0
 */
export const getUnsafe = <A>(self: Ref<A>): A => self.ref.current
