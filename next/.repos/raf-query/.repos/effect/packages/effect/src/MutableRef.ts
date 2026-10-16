/**
 * Stores synchronous mutable state in a small reference object.
 *
 * A `MutableRef<A>` stores one current value and exposes it through `.current`.
 * Unlike `Ref`, its operations are synchronous and update the same object in
 * place. This module includes pipeable helpers for reading, setting, comparing,
 * and updating the value, plus numeric increment/decrement helpers and a
 * boolean toggle helper.
 *
 * @since 2.0.0
 */
import * as Equal from "./Equal.ts"
import * as Dual from "./Function.ts"
import { type Inspectable, toJson } from "./Inspectable.ts"
import { PipeInspectableProto } from "./internal/core.ts"
import type { Pipeable } from "./Pipeable.ts"

const TypeId = "~effect/MutableRef"

/**
 * A synchronous mutable reference that stores a current value.
 *
 * **When to use**
 *
 * Use to keep local mutable state in a stable, pipeable reference.
 *
 * **Details**
 *
 * Read or write the value directly through `.current`, or use the `MutableRef`
 * helpers for pipeable updates such as `get`, `set`, `update`, and
 * `compareAndSet`. All operations mutate the same reference in place.
 *
 * **Example** (Creating and updating refs)
 *
 * ```ts import.meta.vitest
 * import { MutableRef } from "effect"
 *
 * // Create a mutable reference
 * const ref: MutableRef.MutableRef<number> = MutableRef.make(42)
 *
 * // Read the current value
 * ref.current // => 42
 * MutableRef.get(ref) // => 42
 *
 * // Update the value
 * ref.current = 100
 *
 * MutableRef.get(ref) // => 100
 *
 * // Use with complex types
 * interface Config {
 *   timeout: number
 *   retries: number
 * }
 *
 * const config: MutableRef.MutableRef<Config> = MutableRef.make({
 *   timeout: 5000,
 *   retries: 3
 * })
 *
 * // Update through the interface
 * config.current = { timeout: 10000, retries: 5 }
 *
 * config.current // => { timeout: 10000, retries: 5 }
 * ```
 *
 * @category models
 * @since 2.0.0
 */
export interface MutableRef<out T> extends Pipeable, Inspectable {
  readonly [TypeId]: typeof TypeId
  current: T
}

const MutableRefProto: Omit<MutableRef<unknown>, "current"> = {
  [TypeId]: TypeId,
  ...PipeInspectableProto,
  toJSON<A>(this: MutableRef<A>) {
    return {
      _id: "MutableRef",
      current: toJson(this.current)
    }
  }
}

/**
 * Creates a new MutableRef with the specified initial value.
 *
 * **When to use**
 *
 * Use to create a synchronous `MutableRef` initialized with a value.
 *
 * **Example** (Creating mutable refs)
 *
 * ```ts import.meta.vitest
 * import { MutableRef } from "effect"
 *
 * // Create a counter reference
 * const counter = MutableRef.make(0)
 *
 * MutableRef.get(counter) // => 0
 *
 * // Create a configuration reference
 * const config = MutableRef.make({ debug: false, timeout: 5000 })
 *
 * MutableRef.get(config) // => { debug: false, timeout: 5000 }
 *
 * // Create a string reference
 * const status = MutableRef.make("idle")
 * MutableRef.set(status, "running")
 *
 * MutableRef.get(status) // => "running"
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const make = <T>(value: T): MutableRef<T> => {
  const ref = Object.create(MutableRefProto)
  ref.current = value
  return ref
}

/**
 * Sets the value to newValue atomically if the current value equals oldValue.
 * Returns true if the value was updated, false otherwise.
 * Uses Effect's Equal interface for value comparison.
 *
 * **When to use**
 *
 * Use to replace a `MutableRef` value only when the current value still matches
 * an expected value.
 *
 * **Example** (Comparing and setting values)
 *
 * ```ts import.meta.vitest
 * import { MutableRef } from "effect"
 *
 * const ref = MutableRef.make("initial")
 *
 * // Successful compare and set
 * const updated = MutableRef.compareAndSet(ref, "initial", "updated")
 *
 * updated // => true
 * MutableRef.get(ref) // => "updated"
 *
 * // Failed compare and set (value doesn't match)
 * const failed = MutableRef.compareAndSet(ref, "initial", "failed")
 *
 * failed // => false
 * MutableRef.get(ref) // => "updated"
 *
 * // Thread-safe counter increment
 * const counter = MutableRef.make(5)
 * let current: number
 * do {
 *   current = MutableRef.get(counter)
 * } while (!MutableRef.compareAndSet(counter, current, current + 1))
 *
 * MutableRef.get(counter) // => 6
 *
 * // Pipe-able version
 * const casUpdate = MutableRef.compareAndSet("updated", "final")
 *
 * casUpdate(ref) // => true
 * MutableRef.get(ref) // => "final"
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const compareAndSet: {
  <T>(oldValue: T, newValue: T): (self: MutableRef<T>) => boolean
  <T>(self: MutableRef<T>, oldValue: T, newValue: T): boolean
} = Dual.dual<
  <T>(oldValue: T, newValue: T) => (self: MutableRef<T>) => boolean,
  <T>(self: MutableRef<T>, oldValue: T, newValue: T) => boolean
>(3, (self, oldValue, newValue) => {
  if (Equal.equals(oldValue, self.current)) {
    self.current = newValue
    return true
  }
  return false
})

/**
 * Decrements a numeric MutableRef by 1 and returns the reference.
 *
 * **When to use**
 *
 * Use when you need an in-place `MutableRef` decrement that returns the same
 * `MutableRef`.
 *
 * **Example** (Decrementing numeric refs)
 *
 * ```ts import.meta.vitest
 * import { MutableRef } from "effect"
 *
 * const counter = MutableRef.make(5)
 *
 * // Decrement the counter
 * MutableRef.decrement(counter)
 *
 * MutableRef.get(counter) // => 4
 *
 * // Chain operations
 * MutableRef.decrement(counter)
 * MutableRef.decrement(counter)
 *
 * MutableRef.get(counter) // => 2
 *
 * // Useful for countdown scenarios
 * const countdown = MutableRef.make(10)
 * while (MutableRef.get(countdown) > 0) {
 *   MutableRef.decrement(countdown)
 * }
 *
 * MutableRef.get(countdown) // => 0
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const decrement = (self: MutableRef<number>): MutableRef<number> => update(self, (n) => n - 1)

/**
 * Decrements a numeric MutableRef by 1 and returns the new value.
 *
 * **When to use**
 *
 * Use to decrement a numeric `MutableRef` and immediately read the updated
 * value.
 *
 * **Example** (Decrementing and reading refs)
 *
 * ```ts import.meta.vitest
 * import { MutableRef } from "effect"
 *
 * const counter = MutableRef.make(5)
 *
 * // Decrement and get the new value
 * const newValue = MutableRef.decrementAndGet(counter)
 *
 * newValue // => 4
 * MutableRef.get(counter) // => 4
 *
 * // Use in expressions
 * const lives = MutableRef.make(3)
 * const message = `Lives remaining: ${MutableRef.decrementAndGet(lives)}`
 *
 * message // => "Lives remaining: 2"
 *
 * // Conditional logic based on decremented value
 * const attempts = MutableRef.make(3)
 * let retries = 0
 * while (MutableRef.decrementAndGet(attempts) >= 0) {
 *   retries += 1
 * }
 *
 * retries // => 3
 * MutableRef.get(attempts) // => -1
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const decrementAndGet = (self: MutableRef<number>): number => updateAndGet(self, (n) => n - 1)

/**
 * Gets the current value of the MutableRef.
 *
 * **When to use**
 *
 * Use to read the current `MutableRef` value without mutating it.
 *
 * **Example** (Reading current values)
 *
 * ```ts import.meta.vitest
 * import { MutableRef } from "effect"
 *
 * const ref = MutableRef.make("hello")
 *
 * MutableRef.get(ref) // => "hello"
 *
 * MutableRef.set(ref, "world")
 *
 * MutableRef.get(ref) // => "world"
 *
 * // Reading complex objects
 * const config = MutableRef.make({ port: 3000, host: "localhost" })
 * const currentConfig = MutableRef.get(config)
 *
 * currentConfig // => { port: 3000, host: "localhost" }
 *
 * // Multiple reads return the same value
 * const value1 = MutableRef.get(ref)
 * const value2 = MutableRef.get(ref)
 *
 * value1 === value2 // => true
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export const get = <T>(self: MutableRef<T>): T => self.current

/**
 * Decrements a numeric MutableRef by 1 and returns the previous value.
 *
 * **When to use**
 *
 * Use to read the current numeric `MutableRef` value before decrementing it.
 *
 * **Example** (Reading before decrementing)
 *
 * ```ts import.meta.vitest
 * import { MutableRef } from "effect"
 *
 * const counter = MutableRef.make(5)
 *
 * // Get current value and then decrement
 * const previousValue = MutableRef.getAndDecrement(counter)
 *
 * previousValue // => 5
 * MutableRef.get(counter) // => 4
 *
 * // Useful for processing where you need the original value
 * const itemsLeft = MutableRef.make(10)
 * const processedItems: Array<number> = []
 * while (MutableRef.get(itemsLeft) > 0) {
 *   const currentItem = MutableRef.getAndDecrement(itemsLeft)
 *   processedItems.push(currentItem)
 * }
 *
 * processedItems // => [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]
 * MutableRef.get(itemsLeft) // => 0
 *
 * // Post-decrement semantics (like i-- in other languages)
 * const index = MutableRef.make(3)
 * const currentIndex = MutableRef.getAndDecrement(index)
 * const nextIndex = MutableRef.get(index)
 *
 * currentIndex // => 3
 * nextIndex // => 2
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const getAndDecrement = (self: MutableRef<number>): number => getAndUpdate(self, (n) => n - 1)

/**
 * Increments a numeric MutableRef by 1 and returns the previous value.
 *
 * **When to use**
 *
 * Use to read the current numeric `MutableRef` value before incrementing it.
 *
 * **Example** (Reading before incrementing)
 *
 * ```ts import.meta.vitest
 * import { MutableRef } from "effect"
 *
 * const counter = MutableRef.make(5)
 *
 * // Get current value and then increment
 * const previousValue = MutableRef.getAndIncrement(counter)
 *
 * previousValue // => 5
 * MutableRef.get(counter) // => 6
 *
 * // Useful for ID generation
 * const idGenerator = MutableRef.make(0)
 * const getId = () => MutableRef.getAndIncrement(idGenerator)
 * const ids = [getId(), getId(), getId()]
 *
 * ids // => [0, 1, 2]
 *
 * // Post-increment semantics (like i++ in other languages)
 * const position = MutableRef.make(0)
 * const currentPos = MutableRef.getAndIncrement(position)
 * const nextPos = MutableRef.get(position)
 *
 * currentPos // => 0
 * nextPos // => 1
 *
 * // Useful for iteration counters
 * const iterations = MutableRef.make(0)
 * const visited: Array<number> = []
 * while (MutableRef.get(iterations) < 5) {
 *   const iteration = MutableRef.getAndIncrement(iterations)
 *   visited.push(iteration)
 * }
 *
 * visited // => [0, 1, 2, 3, 4]
 * MutableRef.get(iterations) // => 5
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const getAndIncrement = (self: MutableRef<number>): number => getAndUpdate(self, (n) => n + 1)

/**
 * Sets the MutableRef to a new value and returns the previous value.
 *
 * **When to use**
 *
 * Use to replace the current `MutableRef` value while keeping the previous
 * value.
 *
 * **Example** (Reading before setting)
 *
 * ```ts import.meta.vitest
 * import { MutableRef } from "effect"
 *
 * const ref = MutableRef.make("old")
 *
 * // Set new value and get the previous one
 * const previous = MutableRef.getAndSet(ref, "new")
 *
 * previous // => "old"
 * MutableRef.get(ref) // => "new"
 *
 * // Swapping values
 * const counter = MutableRef.make(5)
 * const oldValue = MutableRef.getAndSet(counter, 10)
 * const newValue = MutableRef.get(counter)
 *
 * oldValue // => 5
 * newValue // => 10
 *
 * // Pipe-able version
 * const setValue = MutableRef.getAndSet("final")
 * const previousValue = setValue(ref)
 *
 * previousValue // => "new"
 * MutableRef.get(ref) // => "final"
 *
 * // Useful for atomic swaps in algorithms
 * const buffer = MutableRef.make<Array<string>>(["a", "b", "c"])
 * const oldBuffer = MutableRef.getAndSet(buffer, [])
 *
 * oldBuffer // => ["a", "b", "c"]
 * MutableRef.get(buffer) // => []
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const getAndSet: {
  <T>(value: T): (self: MutableRef<T>) => T
  <T>(self: MutableRef<T>, value: T): T
} = Dual.dual<
  <T>(value: T) => (self: MutableRef<T>) => T,
  <T>(self: MutableRef<T>, value: T) => T
>(2, (self, value) => {
  const ret = self.current
  self.current = value
  return ret
})

/**
 * Updates the MutableRef with the result of applying a function to its current value,
 * and returns the previous value.
 *
 * **When to use**
 *
 * Use to transform the current `MutableRef` value while keeping the previous
 * value.
 *
 * **Example** (Reading before updating)
 *
 * ```ts import.meta.vitest
 * import { MutableRef } from "effect"
 *
 * const counter = MutableRef.make(5)
 *
 * // Increment and get the old value
 * const oldValue = MutableRef.getAndUpdate(counter, (n) => n + 1)
 *
 * oldValue // => 5
 * MutableRef.get(counter) // => 6
 *
 * // Double the value and get the previous one
 * const previous = MutableRef.getAndUpdate(counter, (n) => n * 2)
 *
 * previous // => 6
 * MutableRef.get(counter) // => 12
 *
 * // Transform string and get old value
 * const message = MutableRef.make("hello")
 * const oldMessage = MutableRef.getAndUpdate(message, (s) => s.toUpperCase())
 *
 * oldMessage // => "hello"
 * MutableRef.get(message) // => "HELLO"
 *
 * // Pipe-able version
 * const addOne = MutableRef.getAndUpdate((n: number) => n + 1)
 * const result = addOne(counter)
 *
 * result // => 12
 * MutableRef.get(counter) // => 13
 *
 * // Useful for implementing atomic operations
 * const list = MutableRef.make<Array<number>>([1, 2, 3])
 * const oldList = MutableRef.getAndUpdate(list, (arr) => [...arr, 4])
 *
 * oldList // => [1, 2, 3]
 * MutableRef.get(list) // => [1, 2, 3, 4]
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const getAndUpdate: {
  <T>(f: (value: T) => T): (self: MutableRef<T>) => T
  <T>(self: MutableRef<T>, f: (value: T) => T): T
} = Dual.dual<
  <T>(f: (value: T) => T) => (self: MutableRef<T>) => T,
  <T>(self: MutableRef<T>, f: (value: T) => T) => T
>(2, (self, f) => getAndSet(self, f(get(self))))

/**
 * Increments a numeric MutableRef by 1 and returns the reference.
 *
 * **When to use**
 *
 * Use when you need an in-place `MutableRef` increment that returns the same
 * `MutableRef`.
 *
 * **Example** (Incrementing numeric refs)
 *
 * ```ts import.meta.vitest
 * import { MutableRef } from "effect"
 *
 * const counter = MutableRef.make(5)
 *
 * // Increment the counter
 * MutableRef.increment(counter)
 *
 * MutableRef.get(counter) // => 6
 *
 * // Chain operations
 * MutableRef.increment(counter)
 * MutableRef.increment(counter)
 *
 * MutableRef.get(counter) // => 8
 *
 * // Useful for simple counting
 * const visits = MutableRef.make(0)
 * MutableRef.increment(visits) // User visited
 * MutableRef.increment(visits) // Another visit
 *
 * MutableRef.get(visits) // => 2
 *
 * // Returns the reference for chaining
 * const result = MutableRef.increment(counter)
 *
 * result === counter // => true
 * MutableRef.get(counter) // => 9
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const increment = (self: MutableRef<number>): MutableRef<number> => update(self, (n) => n + 1)

/**
 * Increments a numeric MutableRef by 1 and returns the new value.
 *
 * **When to use**
 *
 * Use to increment a numeric `MutableRef` and immediately read the updated
 * value.
 *
 * **Example** (Incrementing and reading refs)
 *
 * ```ts import.meta.vitest
 * import { MutableRef } from "effect"
 *
 * const counter = MutableRef.make(5)
 *
 * // Increment and get the new value
 * const newValue = MutableRef.incrementAndGet(counter)
 *
 * newValue // => 6
 * MutableRef.get(counter) // => 6
 *
 * // Use in expressions
 * const score = MutableRef.make(100)
 * const message = `New score: ${MutableRef.incrementAndGet(score)}`
 *
 * message // => "New score: 101"
 *
 * // Pre-increment semantics (like ++i in other languages)
 * const level = MutableRef.make(0)
 * const nextLevel = MutableRef.incrementAndGet(level)
 *
 * nextLevel // => 1
 *
 * // Conditional logic based on incremented value
 * const attempts = MutableRef.make(0)
 * const tooManyAttempts = MutableRef.incrementAndGet(attempts) > 3
 *
 * tooManyAttempts // => false
 * MutableRef.get(attempts) // => 1
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const incrementAndGet = (self: MutableRef<number>): number => updateAndGet(self, (n) => n + 1)

/**
 * Sets the MutableRef to a new value and returns the reference.
 *
 * **When to use**
 *
 * Use when you need an in-place `MutableRef` replacement that returns the same
 * `MutableRef`.
 *
 * **Example** (Setting values)
 *
 * ```ts import.meta.vitest
 * import { MutableRef } from "effect"
 *
 * const ref = MutableRef.make("initial")
 *
 * // Set a new value
 * MutableRef.set(ref, "updated")
 *
 * MutableRef.get(ref) // => "updated"
 *
 * // Chain set operations (since it returns the ref)
 * const result = MutableRef.set(ref, "final")
 *
 * result === ref // => true
 * MutableRef.get(ref) // => "final"
 *
 * // Set complex objects
 * const config = MutableRef.make({ debug: false, verbose: false })
 * MutableRef.set(config, { debug: true, verbose: true })
 *
 * MutableRef.get(config) // => { debug: true, verbose: true }
 *
 * // Pipe-able version
 * const setValue = MutableRef.set("new value")
 * setValue(ref)
 *
 * MutableRef.get(ref) // => "new value"
 *
 * // Useful for state management
 * const state = MutableRef.make<"idle" | "loading" | "success" | "error">("idle")
 * MutableRef.set(state, "loading")
 * // ... perform async operation
 * MutableRef.set(state, "success")
 *
 * MutableRef.get(state) // => "success"
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const set: {
  <T>(value: T): (self: MutableRef<T>) => MutableRef<T>
  <T>(self: MutableRef<T>, value: T): MutableRef<T>
} = Dual.dual<
  <T>(value: T) => (self: MutableRef<T>) => MutableRef<T>,
  <T>(self: MutableRef<T>, value: T) => MutableRef<T>
>(2, (self, value) => {
  self.current = value
  return self
})

/**
 * Sets the MutableRef to a new value and returns the new value.
 *
 * **When to use**
 *
 * Use to replace the current `MutableRef` value and immediately read the
 * replacement.
 *
 * **Example** (Setting and reading values)
 *
 * ```ts import.meta.vitest
 * import { MutableRef } from "effect"
 *
 * const ref = MutableRef.make("old")
 *
 * // Set and get the new value
 * const newValue = MutableRef.setAndGet(ref, "new")
 *
 * newValue // => "new"
 * MutableRef.get(ref) // => "new"
 *
 * // Useful for assignments that need the value
 * const counter = MutableRef.make(0)
 * const currentValue = MutableRef.setAndGet(counter, 42)
 *
 * currentValue // => 42
 *
 * // Pipe-able version
 * const setValue = MutableRef.setAndGet("final")
 * const result = setValue(ref)
 *
 * result // => "final"
 *
 * // Difference from set: returns value instead of reference
 * const ref1 = MutableRef.make(1)
 * const returnedRef = MutableRef.set(ref1, 2) // Returns MutableRef
 * const returnedValue = MutableRef.setAndGet(ref1, 3) // Returns value
 *
 * returnedRef === ref1 // => true
 * returnedValue // => 3
 * MutableRef.get(ref1) // => 3
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const setAndGet: {
  <T>(value: T): (self: MutableRef<T>) => T
  <T>(self: MutableRef<T>, value: T): T
} = Dual.dual<
  <T>(value: T) => (self: MutableRef<T>) => T,
  <T>(self: MutableRef<T>, value: T) => T
>(2, (self, value) => {
  self.current = value
  return self.current
})

/**
 * Updates the MutableRef with the result of applying a function to its current value,
 * and returns the reference.
 *
 * **When to use**
 *
 * Use when you need an in-place `MutableRef` value transformation that returns
 * the same `MutableRef`.
 *
 * **Example** (Updating values)
 *
 * ```ts import.meta.vitest
 * import { MutableRef } from "effect"
 *
 * const counter = MutableRef.make(5)
 *
 * // Increment the counter
 * MutableRef.update(counter, (n) => n + 1)
 *
 * MutableRef.get(counter) // => 6
 *
 * // Chain updates (since it returns the ref)
 * const result = MutableRef.update(counter, (n) => n * 2)
 *
 * result === counter // => true
 * MutableRef.get(counter) // => 12
 *
 * // Transform string
 * const message = MutableRef.make("hello")
 * MutableRef.update(message, (s) => s.toUpperCase())
 *
 * MutableRef.get(message) // => "HELLO"
 *
 * // Update complex objects
 * const user = MutableRef.make({ name: "Alice", age: 30 })
 * MutableRef.update(user, (u) => ({ ...u, age: u.age + 1 }))
 *
 * MutableRef.get(user) // => { name: "Alice", age: 31 }
 *
 * // Pipe-able version
 * const double = MutableRef.update((n: number) => n * 2)
 * double(counter)
 *
 * MutableRef.get(counter) // => 24
 *
 * // Array operations
 * const list = MutableRef.make<Array<number>>([1, 2, 3])
 * MutableRef.update(list, (arr) => [...arr, 4])
 *
 * MutableRef.get(list) // => [1, 2, 3, 4]
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const update: {
  <T>(f: (value: T) => T): (self: MutableRef<T>) => MutableRef<T>
  <T>(self: MutableRef<T>, f: (value: T) => T): MutableRef<T>
} = Dual.dual<
  <T>(f: (value: T) => T) => (self: MutableRef<T>) => MutableRef<T>,
  <T>(self: MutableRef<T>, f: (value: T) => T) => MutableRef<T>
>(2, (self, f) => set(self, f(get(self))))

/**
 * Updates the MutableRef with the result of applying a function to its current value,
 * and returns the new value.
 *
 * **When to use**
 *
 * Use to transform the current `MutableRef` value and immediately read the
 * updated value.
 *
 * **Example** (Updating and reading values)
 *
 * ```ts import.meta.vitest
 * import { MutableRef } from "effect"
 *
 * const counter = MutableRef.make(5)
 *
 * // Increment and get the new value
 * const newValue = MutableRef.updateAndGet(counter, (n) => n + 1)
 *
 * newValue // => 6
 * MutableRef.get(counter) // => 6
 *
 * // Double the value and get the result
 * const doubled = MutableRef.updateAndGet(counter, (n) => n * 2)
 *
 * doubled // => 12
 *
 * // Transform string and get result
 * const message = MutableRef.make("hello")
 * const upperCase = MutableRef.updateAndGet(message, (s) => s.toUpperCase())
 *
 * upperCase // => "HELLO"
 *
 * // Pipe-able version
 * const increment = MutableRef.updateAndGet((n: number) => n + 1)
 * const result = increment(counter)
 *
 * result // => 13
 *
 * // Useful for calculations that need the result
 * const score = MutableRef.make(100)
 * const bonus = 50
 * const newScore = MutableRef.updateAndGet(score, (s) => s + bonus)
 *
 * newScore // => 150
 *
 * // Array transformations
 * const list = MutableRef.make<Array<number>>([1, 2, 3])
 * const newList = MutableRef.updateAndGet(list, (arr) => arr.map((x) => x * 2))
 *
 * newList // => [2, 4, 6]
 * MutableRef.get(list) // => [2, 4, 6]
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const updateAndGet: {
  <T>(f: (value: T) => T): (self: MutableRef<T>) => T
  <T>(self: MutableRef<T>, f: (value: T) => T): T
} = Dual.dual<
  <T>(f: (value: T) => T) => (self: MutableRef<T>) => T,
  <T>(self: MutableRef<T>, f: (value: T) => T) => T
>(2, (self, f) => setAndGet(self, f(get(self))))

/**
 * Switches a boolean `MutableRef` between `true` and `false`, then returns the
 * reference.
 *
 * **When to use**
 *
 * Use when you need an in-place boolean `MutableRef` toggle that returns the
 * same `MutableRef`.
 *
 * **Example** (Toggling boolean refs)
 *
 * ```ts import.meta.vitest
 * import { MutableRef } from "effect"
 *
 * const flag = MutableRef.make(false)
 *
 * // Toggle the flag
 * MutableRef.toggle(flag)
 *
 * MutableRef.get(flag) // => true
 *
 * // Toggle again
 * MutableRef.toggle(flag)
 *
 * MutableRef.get(flag) // => false
 *
 * // Useful for state switches
 * const isVisible = MutableRef.make(true)
 * MutableRef.toggle(isVisible) // Hide
 *
 * MutableRef.get(isVisible) // => false
 *
 * // Toggle button implementation
 * const darkMode = MutableRef.make(false)
 * const toggleDarkMode = () => {
 *   MutableRef.toggle(darkMode)
 *   return MutableRef.get(darkMode) ? "ON" : "OFF"
 * }
 *
 * toggleDarkMode() // => "ON"
 * toggleDarkMode() // => "OFF"
 *
 * // Returns the reference for chaining
 * const result = MutableRef.toggle(flag)
 *
 * result === flag // => true
 * MutableRef.get(flag) // => true
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const toggle = (self: MutableRef<boolean>): MutableRef<boolean> => update(self, (_) => !_)
