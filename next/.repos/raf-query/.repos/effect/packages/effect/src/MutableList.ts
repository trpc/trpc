/**
 * Mutable lists for collecting ordered values and draining them from the front.
 * A `MutableList<A>` can append values to the end, prepend values to the
 * beginning, take one or more values from the front, inspect its contents as an
 * array, filter values, remove values, and clear itself. All operations update
 * the same list object in place and keep its `length` field current. Taking
 * from an empty list returns the `Empty` symbol.
 *
 * @since 4.0.0
 */
import * as Arr from "./Array.ts"
import * as Count from "./internal/count.ts"

/**
 * A mutable linked list data structure optimized for high-throughput operations.
 * MutableList provides efficient append/prepend operations and is ideal for
 * producer-consumer patterns, queues, and streaming scenarios.
 *
 * **Example** (Creating and consuming a mutable list)
 *
 * ```ts import.meta.vitest
 * import { MutableList } from "effect"
 *
 * const list: MutableList.MutableList<number> = MutableList.make()
 * MutableList.append(list, 1)
 * MutableList.append(list, 2)
 * MutableList.prepend(list, 0)
 *
 * MutableList.takeAll(list) // => [0, 1, 2]
 * list.length // => 0
 * ```
 *
 * @category models
 * @since 2.0.0
 */
export interface MutableList<in out A> {
  head: MutableList.Bucket<A> | undefined
  tail: MutableList.Bucket<A> | undefined
  length: number
}

/**
 * The MutableList namespace contains type definitions and utilities for working
 * with mutable linked lists.
 *
 * @since 2.0.0
 */
export declare namespace MutableList {
  /**
   * Storage node used by the exposed `head` and `tail` fields of a
   * `MutableList`.
   *
   * **Details**
   *
   * Most code should treat buckets as an implementation detail and use
   * `MutableList` operations such as `append`, `prepend`, and `take` instead
   * of constructing or mutating buckets directly.
   *
   * **Example** (Inspecting buckets)
   *
   * ```ts import.meta.vitest
   * import { MutableList } from "effect"
   *
   * const list = MutableList.make<number>()
   * MutableList.append(list, 1)
   * MutableList.append(list, 2)
   *
   * const bucket: MutableList.MutableList.Bucket<number> = list.head!
   *
   * bucket.array // => [1, 2]
   * bucket.offset // => 0
   * bucket.mutable // => true
   * bucket.next === undefined // => true
   * ```
   *
   * @category models
   * @since 4.0.0
   */
  export interface Bucket<A> {
    readonly array: Array<A>
    mutable: boolean
    offset: number
    next: Bucket<A> | undefined
  }
}

/**
 * Defines the unique symbol used to represent an empty result when taking elements from a MutableList.
 * This symbol is returned by `take` when the list is empty, allowing for safe type checking.
 *
 * **When to use**
 *
 * Use to detect that `take` returned no element before handling the result as a
 * list item.
 *
 * **Example** (Checking for empty results)
 *
 * ```ts import.meta.vitest
 * import { MutableList } from "effect"
 *
 * const list = MutableList.make<string>()
 *
 * MutableList.take(list) === MutableList.Empty // => true
 * ```
 *
 * @category symbols
 * @since 4.0.0
 */
export const Empty: unique symbol = Symbol.for("effect/MutableList/Empty")

/**
 * The type of the Empty symbol, used for type checking when taking elements from a MutableList.
 * This provides compile-time safety when checking for empty results.
 *
 * **Example** (Handling empty results type-safely)
 *
 * ```ts import.meta.vitest
 * import { MutableList } from "effect"
 *
 * const list = MutableList.make<number>()
 *
 * const takeAndDouble = (queue: MutableList.MutableList<number>): number | null => {
 *   const item: number | MutableList.Empty = MutableList.take(queue)
 *   return item === MutableList.Empty ? null : item * 2
 * }
 *
 * takeAndDouble(list) // => null
 * MutableList.append(list, 5)
 * takeAndDouble(list) // => 10
 * ```
 *
 * @category symbols
 * @since 4.0.0
 */
export type Empty = typeof Empty

/**
 * Creates an empty MutableList.
 *
 * **Example** (Creating an empty mutable list)
 *
 * ```ts import.meta.vitest
 * import { MutableList } from "effect"
 *
 * const list = MutableList.make<string>()
 *
 * list.length // => 0
 * MutableList.append(list, "first")
 * MutableList.take(list) // => "first"
 * list.length // => 0
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const make = <A>(): MutableList<A> => ({
  head: undefined,
  tail: undefined,
  length: 0
})

// A mutable tail bucket grows with every append while takes only advance its
// offset, so a list that never drains keeps every slot it ever used. Copy the
// live values into a fresh bucket once consumed slots dominate.
const compactHead = <A>(self: MutableList<A>): void => {
  const head = self.head!
  if (
    head.offset >= 1024 && head === self.tail && head.mutable &&
    (head.array.length - head.offset) * 8 <= head.offset
  ) {
    self.head = self.tail = {
      array: head.array.slice(head.offset),
      mutable: true,
      offset: 0,
      next: undefined
    }
  }
}

const emptyBucket = <A = never>(): MutableList.Bucket<A> => ({
  array: [],
  mutable: true,
  offset: 0,
  next: undefined
})

/**
 * Appends an element to the end of the MutableList.
 * This operation is optimized for high-frequency usage.
 *
 * **Example** (Appending elements)
 *
 * ```ts import.meta.vitest
 * import { MutableList } from "effect"
 *
 * const list = MutableList.make<number>()
 * MutableList.append(list, 1)
 * MutableList.append(list, 2)
 * MutableList.append(list, 3)
 *
 * MutableList.toArray(list) // => [1, 2, 3]
 * list.length // => 3
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const append = <A>(self: MutableList<A>, message: A): void => {
  if (!self.tail) {
    self.head = self.tail = emptyBucket()
  } else if (!self.tail.mutable) {
    self.tail.next = emptyBucket()
    self.tail = self.tail.next
  }
  self.tail!.array.push(message)
  self.length++
}

/**
 * Prepends an element to the beginning of the MutableList.
 * This operation is optimized for high-frequency usage.
 *
 * **Example** (Prepending elements)
 *
 * ```ts import.meta.vitest
 * import { MutableList } from "effect"
 *
 * const list = MutableList.make<string>()
 * MutableList.append(list, "last")
 * MutableList.prepend(list, "third")
 * MutableList.prepend(list, "second")
 * MutableList.prepend(list, "first")
 *
 * MutableList.toArray(list) // => ["first", "second", "third", "last"]
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const prepend = <A>(self: MutableList<A>, message: A): void => {
  self.head = {
    array: [message],
    mutable: true,
    offset: 0,
    next: self.head
  }
  if (!self.tail) self.tail = self.head
  self.length++
}

/**
 * Prepends all elements from an iterable to the beginning of the MutableList.
 * The elements are added in order, so the first element in the iterable becomes
 * the new head of the list.
 *
 * **Example** (Prepending multiple elements)
 *
 * ```ts import.meta.vitest
 * import { MutableList } from "effect"
 *
 * const list = MutableList.make<number>()
 * MutableList.append(list, 4)
 * MutableList.append(list, 5)
 * MutableList.prependAll(list, [1, 2, 3])
 *
 * MutableList.toArray(list) // => [1, 2, 3, 4, 5]
 * ```
 *
 * @category mutations
 * @since 4.0.0
 */
export const prependAll = <A>(self: MutableList<A>, messages: Iterable<A>): void =>
  prependAllUnsafe(self, Arr.fromIterable(messages), !Array.isArray(messages))

/**
 * Prepends all elements from a ReadonlyArray to the beginning of the MutableList.
 * This is an optimized version that can reuse the array when mutable=true.
 *
 * **When to use**
 *
 * Use when prepending a trusted array directly is worth the optimized path and
 * you can transfer ownership of the input when enabling mutation.
 *
 * **Gotchas**
 *
 * When mutable=true, ownership of the input array transfers to the list. Do not
 * read or modify the array afterward.
 *
 * **Example** (Transferring an array when prepending)
 *
 * ```ts import.meta.vitest
 * import { MutableList } from "effect"
 *
 * const list = MutableList.make<number>()
 * MutableList.append(list, 4)
 * const items = [1, 2, 3]
 * MutableList.prependAllUnsafe(list, items, true)
 *
 * MutableList.toArray(list) // => [1, 2, 3, 4]
 * ```
 *
 * @category mutations
 * @since 4.0.0
 */
export const prependAllUnsafe = <A>(self: MutableList<A>, messages: ReadonlyArray<A>, mutable = false): void => {
  if (messages.length === 0) {
    return
  }
  self.head = {
    array: messages as Array<A>,
    mutable,
    offset: 0,
    next: self.head
  }
  if (!self.tail) self.tail = self.head
  self.length += self.head.array.length
}

/**
 * Appends all elements from an iterable to the end of the MutableList.
 * Returns the number of elements added.
 *
 * **Example** (Appending multiple elements)
 *
 * ```ts import.meta.vitest
 * import { MutableList } from "effect"
 *
 * const list = MutableList.make<number>()
 * MutableList.append(list, 1)
 * MutableList.append(list, 2)
 *
 * MutableList.appendAll(list, [3, 4, 5]) // => 3
 * MutableList.toArray(list) // => [1, 2, 3, 4, 5]
 * list.length // => 5
 * ```
 *
 * @category mutations
 * @since 4.0.0
 */
export const appendAll = <A>(self: MutableList<A>, messages: Iterable<A>): number =>
  appendAllUnsafe(self, Arr.fromIterable(messages), !Array.isArray(messages))

/**
 * Appends all elements from a ReadonlyArray to the end of the MutableList.
 * This is an optimized version that can reuse the array when mutable=true.
 * Returns the number of elements added.
 *
 * **When to use**
 *
 * Use when appending a trusted array directly is worth the optimized path and
 * you can transfer ownership of the input when enabling mutation.
 *
 * **Gotchas**
 *
 * When mutable=true, ownership of the input array transfers to the list. Do not
 * read or modify the array afterward.
 *
 * **Example** (Transferring an array when appending)
 *
 * ```ts import.meta.vitest
 * import { MutableList } from "effect"
 *
 * const list = MutableList.make<number>()
 * MutableList.append(list, 1)
 * const items = [2, 3, 4]
 * MutableList.appendAllUnsafe(list, items, true) // => 3
 *
 * MutableList.toArray(list) // => [1, 2, 3, 4]
 * ```
 *
 * @category mutations
 * @since 4.0.0
 */
export const appendAllUnsafe = <A>(self: MutableList<A>, messages: ReadonlyArray<A>, mutable = false): number => {
  if (messages.length === 0) {
    return 0
  }
  const chunk: MutableList.Bucket<A> = {
    array: messages as Array<A>,
    mutable,
    offset: 0,
    next: undefined
  }
  if (self.head) {
    self.tail = self.tail!.next = chunk
  } else {
    self.head = self.tail = chunk
  }
  self.length += messages.length
  return messages.length
}

/**
 * Removes all elements from the MutableList, resetting it to an empty state.
 * This operation is highly optimized and releases all internal memory.
 *
 * **Example** (Clearing a mutable list)
 *
 * ```ts import.meta.vitest
 * import { MutableList } from "effect"
 *
 * const list = MutableList.make<number>()
 * MutableList.appendAll(list, [1, 2, 3, 4, 5])
 *
 * MutableList.clear(list)
 *
 * MutableList.toArray(list) // => []
 * list.length // => 0
 * MutableList.take(list) === MutableList.Empty // => true
 * ```
 *
 * @category mutations
 * @since 4.0.0
 */
export const clear = <A>(self: MutableList<A>): void => {
  self.head = self.tail = undefined
  self.length = 0
}

/**
 * Takes up to N elements from the beginning of the MutableList and returns them as an array.
 * The taken elements are removed from the list. This operation is optimized for performance
 * and includes zero-copy optimizations when possible.
 *
 * **Details**
 *
 * Finite fractional values of `n` are rounded down. `NaN` and non-positive
 * values leave the list unchanged and return an empty array.
 *
 * **Example** (Taking batches)
 *
 * ```ts import.meta.vitest
 * import { MutableList } from "effect"
 *
 * const list = MutableList.make<number>()
 * MutableList.appendAll(list, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
 *
 * MutableList.takeN(list, 3) // => [1, 2, 3]
 * MutableList.toArray(list) // => [4, 5, 6, 7, 8, 9, 10]
 * list.length // => 7
 * ```
 *
 * @category mutations
 * @since 4.0.0
 */
export const takeN = <A>(self: MutableList<A>, n: number): Array<A> => {
  n = Count.normalize(n)
  if (n <= 0 || !self.head) return []
  n = Math.min(n, self.length)
  if (n === self.length && self.head?.offset === 0 && !self.head.next) {
    const array = self.head.array
    clear(self)
    return array
  }
  const array = new Array<A>(n)
  let index = 0
  let chunk: MutableList.Bucket<A> | undefined = self.head
  while (chunk) {
    while (chunk.offset < chunk.array.length) {
      array[index++] = chunk.array[chunk.offset]
      if (chunk.mutable) chunk.array[chunk.offset] = undefined as any
      chunk.offset++
      if (index === n) {
        self.head = chunk.offset === chunk.array.length && chunk.next ? chunk.next : chunk
        self.length -= n
        if (self.length === 0) clear(self)
        else compactHead(self)
        return array
      }
    }
    chunk = chunk.next
  }
  clear(self)
  return array
}

/**
 * Removes up to `n` elements from the beginning of the `MutableList` without
 * returning them.
 *
 * **When to use**
 *
 * Use to discard a bounded number of values from the head of a `MutableList`
 * when the removed values are not needed.
 *
 * **Details**
 *
 * Finite fractional values of `n` are rounded down. If `n` is `NaN` or
 * non-positive, or the list is empty, the list is left unchanged. If the
 * normalized count is greater than or equal to the current length, the list is
 * cleared.
 *
 * @see {@link takeN} for removing up to `n` values and returning them as an array
 * @see {@link clear} for removing every value from the list
 *
 * @category mutations
 * @since 4.0.0
 */
export const takeNVoid = <A>(self: MutableList<A>, n: number): void => {
  n = Count.normalize(n)
  if (n <= 0 || !self.head) return
  n = Math.min(n, self.length)
  if (n === self.length && self.head?.offset === 0 && !self.head.next) {
    clear(self)
    return
  }
  let count = 0
  let chunk: MutableList.Bucket<A> | undefined = self.head
  while (chunk) {
    const size = chunk.array.length - chunk.offset
    if (count + size > n) {
      chunk.offset += n - count
      self.head = chunk
      self.length -= n
      compactHead(self)
      return
    }
    count += size
    chunk = chunk.next
  }
  clear(self)
  return
}

/**
 * Takes all elements from the MutableList and returns them as an array.
 * The list becomes empty after this operation. This is equivalent to takeN(list, list.length).
 *
 * **Example** (Draining all elements)
 *
 * ```ts import.meta.vitest
 * import { MutableList } from "effect"
 *
 * const list = MutableList.make<string>()
 * MutableList.appendAll(list, ["apple", "banana", "cherry"])
 *
 * MutableList.takeAll(list) // => ["apple", "banana", "cherry"]
 * list.length // => 0
 * ```
 *
 * @category mutations
 * @since 4.0.0
 */
export const takeAll = <A>(self: MutableList<A>): Array<A> => takeN(self, self.length)

/**
 * Takes a single element from the beginning of the MutableList.
 * Returns the element if available, or the Empty symbol if the list is empty.
 * The taken element is removed from the list.
 *
 * **Example** (Taking one element)
 *
 * ```ts import.meta.vitest
 * import { MutableList } from "effect"
 *
 * const list = MutableList.make<string>()
 * MutableList.appendAll(list, ["first", "second", "third"])
 *
 * MutableList.take(list) // => "first"
 * MutableList.toArray(list) // => ["second", "third"]
 * list.length // => 2
 * ```
 *
 * @category mutations
 * @since 4.0.0
 */
export const take = <A>(self: MutableList<A>): Empty | A => {
  if (!self.head) return Empty
  const message = self.head.array[self.head.offset]
  if (self.head.mutable) self.head.array[self.head.offset] = undefined as any
  self.head.offset++
  self.length--
  if (self.head.offset === self.head.array.length) {
    if (self.head.next) {
      self.head = self.head.next
    } else {
      clear(self)
    }
  } else {
    compactHead(self)
  }
  return message
}

/**
 * Copies up to `n` elements from the beginning of the `MutableList` into a new
 * array without modifying the list.
 *
 * **When to use**
 *
 * Use when you need to inspect or snapshot a bounded prefix of the list without
 * consuming it.
 *
 * **Details**
 *
 * Finite fractional values of `n` are rounded down. `NaN` and non-positive
 * values return an empty array.
 *
 * @see {@link takeN} for removing up to `n` values and returning them as an array
 *
 * @category converting
 * @since 4.0.0
 */
export const toArrayN = <A>(self: MutableList<A>, n: number): Array<A> => {
  n = Count.normalize(n)
  if (n <= 0) return []
  const length = Math.min(n, self.length)
  const out = new Array<A>(length)
  let index = 0
  let bucket = self.head
  while (bucket) {
    for (let i = bucket.offset; i < bucket.array.length; i++) {
      out[index++] = bucket.array[i]
      if (index === length) return out
    }
    bucket = bucket.next
  }
  return out
}

/**
 * Copies all current elements of the `MutableList` into a new array without
 * modifying the list.
 *
 * **When to use**
 *
 * Use when you need a snapshot of all current elements while keeping the list
 * unchanged.
 *
 * @see {@link takeAll} for converting all elements to an array and clearing the list
 *
 * @category converting
 * @since 4.0.0
 */
export const toArray = <A>(self: MutableList<A>): Array<A> => toArrayN(self, self.length)

/**
 * Filters the MutableList in place, keeping only elements that satisfy the predicate.
 * This operation modifies the list and rebuilds its internal structure for efficiency.
 * The predicate receives each element's current index.
 *
 * **Example** (Filtering in place)
 *
 * ```ts import.meta.vitest
 * import { MutableList } from "effect"
 *
 * const list = MutableList.make<number>()
 * MutableList.appendAll(list, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
 *
 * MutableList.filter(list, (n) => n % 2 === 0)
 *
 * MutableList.toArray(list) // => [2, 4, 6, 8, 10]
 * ```
 *
 * @category mutations
 * @since 4.0.0
 */
export const filter = <A>(self: MutableList<A>, f: (value: A, i: number) => boolean): void => {
  const array: Array<A> = []
  let chunk: MutableList.Bucket<A> | undefined = self.head
  let index = 0
  while (chunk) {
    for (let i = chunk.offset; i < chunk.array.length; i++) {
      if (f(chunk.array[i], index++)) {
        array.push(chunk.array[i])
      }
    }
    chunk = chunk.next
  }
  if (array.length === 0) {
    clear(self)
    return
  }
  self.head = self.tail = {
    array,
    mutable: true,
    offset: 0,
    next: undefined
  }
  self.length = array.length
}

/**
 * Removes all occurrences of a value from the `MutableList` using JavaScript
 * strict equality semantics.
 *
 * **When to use**
 *
 * Use when in-place removal should use JavaScript identity/strict equality
 * rather than Effect structural equality.
 *
 * **Details**
 *
 * The list is modified in place.
 *
 * **Gotchas**
 *
 * Values are compared with `!==`, so this does not use Effect structural
 * equality.
 *
 * **Example** (Removing matching values)
 *
 * ```ts import.meta.vitest
 * import { MutableList } from "effect"
 *
 * const list = MutableList.make<string>()
 * MutableList.appendAll(list, ["apple", "banana", "apple", "cherry", "apple"])
 *
 * MutableList.remove(list, "apple")
 *
 * MutableList.toArray(list) // => ["banana", "cherry"]
 * ```
 *
 * @category mutations
 * @since 4.0.0
 */
export const remove = <A>(self: MutableList<A>, value: A): void => filter(self, (v) => v !== value)
