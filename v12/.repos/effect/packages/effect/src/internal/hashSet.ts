/**
 * @since 2.0.0
 */

import * as Equal from "../Equal.ts"
import { format } from "../Formatter.ts"
import * as Hash from "../Hash.ts"
import type { Inspectable } from "../Inspectable.ts"
import { NodeInspectSymbol, toJson } from "../Inspectable.ts"
import type { Pipeable } from "../Pipeable.ts"
import { pipeArguments } from "../Pipeable.ts"
import { hasProperty } from "../Predicate.ts"
import * as HashMap from "./hashMap.ts"

/** @internal */
export const HashSetTypeId = "~effect/HashSet"

/** @internal */
export type HashSetTypeId = typeof HashSetTypeId

/** @internal */
export interface HashSet<out V> extends Iterable<V>, Equal.Equal, Pipeable, Inspectable {
  readonly [HashSetTypeId]: HashSetTypeId
}

const hashSetSeed = Hash.string(HashSetTypeId)

const HashSetProto: Omit<HashSet<unknown>, HashSetTypeId> = {
  [Hash.symbol]<V>(this: HashSet<V>): number {
    return Hash.optimize(Hash.combine(hashSetSeed, Hash.hash(keyMap(this))))
  },
  [Equal.symbol]<V>(this: HashSet<V>, that: unknown): boolean {
    return isHashSet(that) && size(this) === size(that) && every(this, (value) => has(that, value))
  },
  [Symbol.iterator]<V>(this: HashSet<V>): Iterator<V> {
    return HashMap.keys(keyMap(this))
  },
  toString() {
    return `HashSet(${format(Array.from(this))})`
  },
  toJSON() {
    return {
      _id: "HashSet",
      values: toJson(Array.from(this))
    }
  },
  [NodeInspectSymbol]() {
    return this.toJSON()
  },
  pipe() {
    return pipeArguments(this, arguments)
  }
}

const makeImpl = <V>(keyMap: HashMap.HashMap<V, boolean>): HashSet<V> => {
  const set = Object.create(HashSetProto)
  set[HashSetTypeId] = HashSetTypeId
  set.keyMap = keyMap
  return set
}

/** @internal */
export const isHashSet = (u: unknown): u is HashSet<unknown> => hasProperty(u, HashSetTypeId)

/** @internal */
export const keyMap = <V>(self: HashSet<V>): HashMap.HashMap<V, boolean> => (self as any).keyMap

/** @internal */
export const empty = <V = never>(): HashSet<V> => makeImpl(HashMap.empty<V, boolean>())

/** @internal */
export const make = <Values extends ReadonlyArray<any>>(
  ...values: Values
): HashSet<Values[number]> => fromIterable(values)

/** @internal */
export const fromIterable = <V>(values: Iterable<V>): HashSet<V> => {
  let map = HashMap.empty<V, boolean>()
  for (const value of values) {
    map = HashMap.set(map, value, true)
  }
  return makeImpl(map)
}

/** @internal */
export const has = <V>(self: HashSet<V>, value: V): boolean => HashMap.has(keyMap(self), value)

/** @internal */
export const add = <V>(self: HashSet<V>, value: V): HashSet<V> => {
  const map = keyMap(self)
  return HashMap.has(map, value) ? self : makeImpl(HashMap.set(map, value, true))
}

/** @internal */
export const remove = <V>(self: HashSet<V>, value: V): HashSet<V> => {
  const map = keyMap(self)
  return HashMap.has(map, value) ? makeImpl(HashMap.remove(map, value)) : self
}

/** @internal */
export const size = <V>(self: HashSet<V>): number => HashMap.size(keyMap(self))

/** @internal */
export const isEmpty = <V>(self: HashSet<V>): boolean => HashMap.isEmpty(keyMap(self))

// Helper function for building new HashSets from iteration
const fromPredicate = <V>(self: HashSet<V>, predicate: (value: V) => boolean): HashSet<V> => {
  let result = HashMap.empty<V, boolean>()
  for (const value of self) {
    if (predicate(value)) {
      result = HashMap.set(result, value, true)
    }
  }
  return makeImpl(result)
}

/** @internal */
export const union = <V0, V1>(self: HashSet<V0>, that: HashSet<V1>): HashSet<V0 | V1> => {
  const map = keyMap(self)
  let result = map as HashMap.HashMap<V0 | V1, boolean>
  for (const value of that) {
    result = HashMap.set(result, value, true)
  }
  return makeImpl(result)
}

/** @internal */
export const intersection = <V0, V1>(self: HashSet<V0>, that: HashSet<V1>): HashSet<V0 & V1> => {
  let result = HashMap.empty<V0 & V1, boolean>()
  for (const value of self) {
    if (has(that, value as any)) {
      result = HashMap.set(result, value as V0 & V1, true)
    }
  }
  return makeImpl(result)
}

/** @internal */
export const difference = <V0, V1>(self: HashSet<V0>, that: HashSet<V1>): HashSet<V0> =>
  fromPredicate(self, (value) => !has(that, value as any))

/** @internal */
export const isSubset = <V0, V1>(self: HashSet<V0>, that: HashSet<V1>): boolean => {
  for (const value of self) {
    if (!has(that, value as any)) {
      return false
    }
  }
  return true
}

/** @internal */
export const map = <V, U>(self: HashSet<V>, f: (value: V) => U): HashSet<U> => {
  let result = HashMap.empty<U, boolean>()
  for (const value of self) {
    result = HashMap.set(result, f(value), true)
  }
  return makeImpl(result)
}

/** @internal */
export const filter = <V>(self: HashSet<V>, predicate: (value: V) => boolean): HashSet<V> =>
  fromPredicate(self, predicate)

/** @internal */
export const some = <V>(self: HashSet<V>, predicate: (value: V) => boolean): boolean => {
  for (const value of self) {
    if (predicate(value)) {
      return true
    }
  }
  return false
}

/** @internal */
export const every = <V>(self: HashSet<V>, predicate: (value: V) => boolean): boolean => {
  for (const value of self) {
    if (!predicate(value)) {
      return false
    }
  }
  return true
}

/** @internal */
export const reduce = <V, U>(self: HashSet<V>, zero: U, f: (accumulator: U, value: V) => U): U => {
  let result = zero
  for (const value of self) {
    result = f(result, value)
  }
  return result
}
