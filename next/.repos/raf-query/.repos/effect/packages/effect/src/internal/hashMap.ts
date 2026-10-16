/**
 * @since 2.0.0
 */

import * as Equal_ from "../Equal.ts"
import { format } from "../Formatter.ts"
import { dual, identity, pipe } from "../Function.ts"
import * as Hash from "../Hash.ts"
import type { Inspectable } from "../Inspectable.ts"
import { NodeInspectSymbol, toJson } from "../Inspectable.ts"
import * as Option from "../Option.ts"
import type { Pipeable } from "../Pipeable.ts"
import { pipeArguments } from "../Pipeable.ts"
import { hasProperty } from "../Predicate.ts"
import * as Result from "../Result.ts"
import type { NoInfer } from "../Types.ts"
import { backEdges } from "./hash.ts"

/** @internal */
export const HashMapTypeId = "~effect/HashMap"

/** @internal */
export type HashMapTypeId = typeof HashMapTypeId

/** @internal */
export interface HashMap<out Key, out Value> extends Iterable<[Key, Value]>, Equal_.Equal, Pipeable, Inspectable {
  readonly [HashMapTypeId]: HashMapTypeId
}

/** @internal */
export declare namespace HashMap {
  export type UpdateFn<V> = (option: Option.Option<V>) => Option.Option<V>
}

// HAMT Implementation

/** @internal */
const SHIFT = 5
/** @internal */
const BUCKET_SIZE = 1 << SHIFT // 32
/** @internal */
// const BITMAP_SIZE = 1 << SHIFT // 32
/** @internal */
const MIN_ARRAY_NODE = BUCKET_SIZE / 4 // 8
/** @internal */
const MAX_INDEX_NODE = BUCKET_SIZE / 2 // 16
/** @internal */
const BITMAP_INDEX_MASK = BUCKET_SIZE - 1 // 31

/** @internal */
const popcount = (n: number): number => {
  n = n - ((n >>> 1) & 0x55555555)
  n = (n & 0x33333333) + ((n >>> 2) & 0x33333333)
  return (((n + (n >>> 4)) & 0xF0F0F0F) * 0x1010101) >>> 24
}

/** @internal */
const mask = (hash: number, shift: number): number => (hash >>> shift) & BITMAP_INDEX_MASK

/** @internal */
const bitpos = (hash: number, shift: number): number => 1 << mask(hash, shift)

/** @internal */
const index = (bitmap: number, bit: number): number => popcount(bitmap & (bit - 1))

/** @internal */
function mergeLeaves<K, V>(
  edit: number,
  shift: number,
  hash1: number,
  node1: Node<K, V>,
  hash2: number,
  node2: Node<K, V>
): Node<K, V> {
  if (shift > 32) {
    throw new Error("HashMap: max depth exceeded")
  }

  const bit1 = bitpos(hash1, shift)
  const bit2 = bitpos(hash2, shift)

  if (bit1 === bit2) {
    const child = mergeLeaves(edit, shift + SHIFT, hash1, node1, hash2, node2)
    return new IndexedNode(edit, bit1, [child])
  }

  const bitmap = bit1 | bit2
  const children: Array<Node<K, V>> = (bit1 >>> 0) < (bit2 >>> 0)
    ? [node1, node2]
    : [node2, node1]

  return new IndexedNode(edit, bitmap, children)
}

const hashMapSeed = Hash.string("HashMap")

const entryHash = (key: unknown, value: unknown): number => Hash.combine(Hash.hash(key), Hash.hash(value))

const childrenHash = <K, V>(children: ReadonlyArray<Node<K, V> | undefined>): number => {
  let h = 0
  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    if (child) h ^= child.subtreeHash()
  }
  return h
}

/** @internal */
abstract class Node<K, V> {
  abstract readonly _tag: "EmptyNode" | "LeafNode" | "IndexedNode" | "CollisionNode" | "ArrayNode"
  abstract readonly edit: number
  abstract get size(): number
  abstract get(shift: number, hash: number, key: K): Option.Option<V>
  abstract has(shift: number, hash: number, key: K): boolean
  abstract set(
    edit: number,
    shift: number,
    hash: number,
    key: K,
    value: V,
    added: { value: boolean }
  ): Node<K, V>
  abstract remove(
    edit: number,
    shift: number,
    hash: number,
    key: K,
    removed: { value: boolean }
  ): Node<K, V> | undefined

  canEdit(edit: number): boolean {
    return this.edit === edit
  }

  /** Cached XOR of this subtree's entry hashes. Cleared by in-place edits. */
  declare _hash: number | undefined

  abstract computeHash(): number

  subtreeHash(): number {
    let h = this._hash
    if (h === undefined) {
      const seen = backEdges
      h = this.computeHash()
      // Cycle hashes depend on the entry point.
      if (seen === backEdges) {
        this._hash = h
      }
    }
    return h
  }
}

/** @internal */
class EmptyNode<K, V> extends Node<K, V> {
  readonly _tag = "EmptyNode"

  readonly edit = 0

  get size(): number {
    return 0
  }

  get(_shift: number, _hash: number, _key: K): Option.Option<V> {
    return Option.none()
  }

  has(_shift: number, _hash: number, _key: K): boolean {
    return false
  }

  set(
    edit: number,
    _shift: number,
    hash: number,
    key: K,
    value: V,
    added: { value: boolean }
  ): Node<K, V> {
    added.value = true
    return new LeafNode(edit, hash, key, value)
  }

  remove(
    _edit: number,
    _shift: number,
    _hash: number,
    _key: K,
    _removed: { value: boolean }
  ): Node<K, V> | undefined {
    return this
  }

  override canEdit(_edit: number): boolean {
    return false
  }

  computeHash(): number {
    return 0
  }
}

/** @internal */
class LeafNode<K, V> extends Node<K, V> {
  readonly _tag = "LeafNode"

  edit: number
  readonly hash: number
  key: K
  value: V

  constructor(
    edit: number,
    hash: number,
    key: K,
    value: V
  ) {
    super()
    this.edit = edit
    this.hash = hash
    this.key = key
    this.value = value
  }

  get size(): number {
    return 1
  }

  get(_shift: number, hash: number, key: K): Option.Option<V> {
    if (this.hash === hash && Equal_.equals(this.key, key)) {
      return Option.some(this.value)
    }
    return Option.none()
  }

  has(_shift: number, hash: number, key: K): boolean {
    return this.hash === hash && Equal_.equals(this.key, key)
  }

  set(
    edit: number,
    shift: number,
    hash: number,
    key: K,
    value: V,
    added: { value: boolean }
  ): Node<K, V> {
    if (this.canEdit(edit)) this._hash = undefined
    if (this.hash === hash && Equal_.equals(this.key, key)) {
      if (Equal_.equals(this.value, value)) {
        return this
      }
      // Can mutate in-place if edit matches
      if (this.canEdit(edit)) {
        this.value = value
        return this
      }
      return new LeafNode(edit, hash, key, value)
    }

    added.value = true

    if (this.hash === hash) {
      return new CollisionNode(edit, hash, [[this.key, this.value], [key, value]])
    }

    const newBit = bitpos(hash, shift)
    const existingBit = bitpos(this.hash, shift)

    if (newBit === existingBit) {
      return new IndexedNode(
        edit,
        newBit,
        [this.set(edit, shift + SHIFT, hash, key, value, added)]
      )
    }

    const bitmap = newBit | existingBit
    const nodes: Array<Node<K, V>> = (newBit >>> 0) < (existingBit >>> 0)
      ? [new LeafNode(edit, hash, key, value), this]
      : [this, new LeafNode(edit, hash, key, value)]

    return new IndexedNode(edit, bitmap, nodes)
  }

  remove(
    _edit: number,
    _shift: number,
    hash: number,
    key: K,
    removed: { value: boolean }
  ): Node<K, V> | undefined {
    if (this.hash === hash && Equal_.equals(this.key, key)) {
      removed.value = true
      return undefined
    }
    return this
  }

  computeHash(): number {
    // `setHash` allows the stored hash to differ from `Hash.hash(key)`.
    return entryHash(this.key, this.value)
  }
}

/** @internal */
class CollisionNode<K, V> extends Node<K, V> {
  readonly _tag = "CollisionNode"

  edit: number
  readonly hash: number
  entries: Array<[K, V]>

  constructor(
    edit: number,
    hash: number,
    entries: Array<[K, V]>
  ) {
    super()
    this.edit = edit
    this.hash = hash
    this.entries = entries
  }

  get size(): number {
    return this.entries.length
  }

  get(_shift: number, hash: number, key: K): Option.Option<V> {
    if (this.hash !== hash) {
      return Option.none()
    }

    for (const [k, v] of this.entries) {
      if (Equal_.equals(k, key)) {
        return Option.some(v)
      }
    }
    return Option.none()
  }

  has(_shift: number, hash: number, key: K): boolean {
    if (this.hash !== hash) {
      return false
    }

    for (const [k] of this.entries) {
      if (Equal_.equals(k, key)) {
        return true
      }
    }
    return false
  }

  set(
    edit: number,
    shift: number,
    hash: number,
    key: K,
    value: V,
    added: { value: boolean }
  ): Node<K, V> {
    if (this.canEdit(edit)) this._hash = undefined
    if (this.hash !== hash) {
      added.value = true
      // Need to merge this collision node with new leaf
      return mergeLeaves(
        edit,
        shift,
        this.hash,
        this,
        hash,
        new LeafNode(edit, hash, key, value)
      )
    }

    // Same hash - update or add to collision list
    for (let i = 0; i < this.entries.length; i++) {
      if (Equal_.equals(this.entries[i][0], key)) {
        if (Equal_.equals(this.entries[i][1], value)) {
          return this
        }
        if (this.canEdit(edit)) {
          this.entries[i] = [key, value]
          return this
        }
        const newEntries = [...this.entries]
        newEntries[i] = [key, value]
        return new CollisionNode(edit, this.hash, newEntries)
      }
    }

    added.value = true
    if (this.canEdit(edit)) {
      this.entries.push([key, value])
      return this
    }
    return new CollisionNode(edit, this.hash, [...this.entries, [key, value]])
  }

  remove(
    edit: number,
    _shift: number,
    hash: number,
    key: K,
    removed: { value: boolean }
  ): Node<K, V> | undefined {
    if (this.canEdit(edit)) this._hash = undefined
    if (this.hash !== hash) {
      return this
    }

    const idx = this.entries.findIndex(([k]) => Equal_.equals(k, key))
    if (idx === -1) {
      return this
    }

    removed.value = true

    if (this.entries.length === 1) {
      return undefined
    }

    if (this.entries.length === 2) {
      const remaining = this.entries[idx === 0 ? 1 : 0]
      return new LeafNode(edit, this.hash, remaining[0], remaining[1])
    }

    if (this.canEdit(edit)) {
      this.entries.splice(idx, 1)
      return this
    }

    const newEntries = [...this.entries]
    newEntries.splice(idx, 1)
    return new CollisionNode(edit, this.hash, newEntries)
  }

  computeHash(): number {
    let h = 0
    const entries = this.entries
    for (let i = 0; i < entries.length; i++) {
      h ^= entryHash(entries[i][0], entries[i][1])
    }
    return h
  }
}

/** @internal */
class IndexedNode<K, V> extends Node<K, V> {
  readonly _tag = "IndexedNode"

  edit: number
  private _size: number | undefined
  bitmap: number
  children: Array<Node<K, V>>

  constructor(
    edit: number,
    bitmap: number,
    children: Array<Node<K, V>>
  ) {
    super()
    this.edit = edit
    this.bitmap = bitmap
    this.children = children
  }

  get size(): number {
    if (this._size === undefined) {
      this._size = this.children.reduce((acc, child) => acc + child.size, 0)
    }
    return this._size
  }

  get(shift: number, hash: number, key: K): Option.Option<V> {
    const bit = bitpos(hash, shift)
    if ((this.bitmap & bit) === 0) {
      return Option.none()
    }
    const idx = index(this.bitmap, bit)
    return this.children[idx].get(shift + SHIFT, hash, key)
  }

  has(shift: number, hash: number, key: K): boolean {
    const bit = bitpos(hash, shift)
    if ((this.bitmap & bit) === 0) {
      return false
    }
    const idx = index(this.bitmap, bit)
    return this.children[idx].has(shift + SHIFT, hash, key)
  }

  set(
    edit: number,
    shift: number,
    hash: number,
    key: K,
    value: V,
    added: { value: boolean }
  ): Node<K, V> {
    if (this.canEdit(edit)) this._hash = undefined
    const bit = bitpos(hash, shift)
    const idx = index(this.bitmap, bit)

    if ((this.bitmap & bit) !== 0) {
      // Existing child - update it
      const child = this.children[idx]
      const newChild = child.set(edit, shift + SHIFT, hash, key, value, added)
      if (child === newChild) {
        return this
      }

      if (this.canEdit(edit)) {
        this.children[idx] = newChild
        return this
      }

      const newChildren = [...this.children]
      newChildren[idx] = newChild
      return new IndexedNode(edit, this.bitmap, newChildren)
    } else {
      // New child - insert
      added.value = true
      const newChild = new LeafNode(edit, hash, key, value)
      const newBitmap = this.bitmap | bit

      if (this.canEdit(edit)) {
        this.children.splice(idx, 0, newChild)
        this.bitmap = newBitmap
        this._size = undefined

        if (this.children.length > MAX_INDEX_NODE) {
          return this.expand(edit, newBitmap, this.children)
        }
        return this
      }

      const newChildren = [...this.children]
      newChildren.splice(idx, 0, newChild)

      if (newChildren.length > MAX_INDEX_NODE) {
        return this.expand(edit, newBitmap, newChildren)
      }

      return new IndexedNode(edit, newBitmap, newChildren)
    }
  }

  remove(
    edit: number,
    shift: number,
    hash: number,
    key: K,
    removed: { value: boolean }
  ): Node<K, V> | undefined {
    if (this.canEdit(edit)) this._hash = undefined
    const bit = bitpos(hash, shift)
    if ((this.bitmap & bit) === 0) {
      return this
    }

    const idx = index(this.bitmap, bit)
    const child = this.children[idx]
    const newChild = child.remove(edit, shift + SHIFT, hash, key, removed)

    if (!removed.value) {
      return this
    }

    if (newChild === undefined) {
      const newBitmap = this.bitmap ^ bit
      if (newBitmap === 0) {
        return undefined
      }

      if (this.children.length === 2) {
        const remaining = this.children[idx === 0 ? 1 : 0]
        if (remaining._tag === "LeafNode") {
          return remaining
        }
      }

      if (this.canEdit(edit)) {
        this.children.splice(idx, 1)
        this.bitmap = newBitmap
        this._size = undefined
        return this
      }

      const newChildren = [...this.children]
      newChildren.splice(idx, 1)
      return new IndexedNode(edit, newBitmap, newChildren)
    }

    if (child === newChild) {
      return this
    }

    if (this.canEdit(edit)) {
      this.children[idx] = newChild
      return this
    }

    const newChildren = [...this.children]
    newChildren[idx] = newChild
    return new IndexedNode(edit, this.bitmap, newChildren)
  }

  private expand(edit: number, bitmap: number, children: Array<Node<K, V>>): ArrayNode<K, V> {
    const nodes: Array<Node<K, V> | undefined> = new globalThis.Array(BUCKET_SIZE)
    let j = 0
    for (let i = 0; i < BUCKET_SIZE; i++) {
      if ((bitmap & (1 << i)) !== 0) {
        nodes[i] = children[j++]
      }
    }
    return new ArrayNode(edit, children.length, nodes)
  }

  computeHash(): number {
    return childrenHash(this.children)
  }
}

/** @internal */
class ArrayNode<K, V> extends Node<K, V> {
  readonly _tag = "ArrayNode"

  edit: number
  private _size: number | undefined
  count: number
  children: Array<Node<K, V> | undefined>

  constructor(
    edit: number,
    count: number,
    children: Array<Node<K, V> | undefined>
  ) {
    super()
    this.edit = edit
    this.count = count
    this.children = children
  }

  get size(): number {
    if (this._size === undefined) {
      this._size = this.children.reduce<number>((acc, child) => acc + (child?.size ?? 0), 0)
    }
    return this._size
  }

  get(shift: number, hash: number, key: K): Option.Option<V> {
    const idx = mask(hash, shift)
    const child = this.children[idx]
    return child ? child.get(shift + SHIFT, hash, key) : Option.none()
  }

  has(shift: number, hash: number, key: K): boolean {
    const idx = mask(hash, shift)
    const child = this.children[idx]
    return child ? child.has(shift + SHIFT, hash, key) : false
  }

  set(
    edit: number,
    shift: number,
    hash: number,
    key: K,
    value: V,
    added: { value: boolean }
  ): Node<K, V> {
    if (this.canEdit(edit)) this._hash = undefined
    const idx = mask(hash, shift)
    const child = this.children[idx]

    if (child) {
      const newChild = child.set(edit, shift + SHIFT, hash, key, value, added)
      if (child === newChild) {
        return this
      }

      if (this.canEdit(edit)) {
        this.children[idx] = newChild
        return this
      }

      const newChildren = [...this.children]
      newChildren[idx] = newChild
      return new ArrayNode(edit, this.count, newChildren)
    } else {
      added.value = true
      const newChild = new LeafNode(edit, hash, key, value)

      if (this.canEdit(edit)) {
        this.children[idx] = newChild
        this.count++
        this._size = undefined
        return this
      }

      const newChildren = [...this.children]
      newChildren[idx] = newChild
      return new ArrayNode(edit, this.count + 1, newChildren)
    }
  }

  remove(
    edit: number,
    shift: number,
    hash: number,
    key: K,
    removed: { value: boolean }
  ): Node<K, V> | undefined {
    if (this.canEdit(edit)) this._hash = undefined
    const idx = mask(hash, shift)
    const child = this.children[idx]

    if (!child) {
      return this
    }

    const newChild = child.remove(edit, shift + SHIFT, hash, key, removed)

    if (!removed.value) {
      return this
    }

    const newCount = this.count - (newChild ? 0 : 1)

    if (newCount < MIN_ARRAY_NODE) {
      return this.pack(edit, idx, newChild)
    }

    if (child === newChild) {
      return this
    }

    if (this.canEdit(edit)) {
      this.children[idx] = newChild
      if (!newChild) {
        this.count = newCount
      }
      this._size = undefined
      return this
    }

    const newChildren = [...this.children]
    newChildren[idx] = newChild
    return new ArrayNode(edit, newCount, newChildren)
  }

  private pack(
    edit: number,
    excludeIdx: number,
    newChild: Node<K, V> | undefined
  ): IndexedNode<K, V> {
    const children: Array<Node<K, V>> = []
    let bitmap = 0
    let bit = 1

    for (let i = 0; i < this.children.length; i++) {
      const child = i === excludeIdx ? newChild : this.children[i]
      if (child) {
        children.push(child)
        bitmap |= bit
      }
      bit <<= 1
    }

    return new IndexedNode(edit, bitmap, children)
  }

  computeHash(): number {
    return childrenHash(this.children)
  }
}

class HashMapIterator<K, V, A> implements IterableIterator<A> {
  readonly stack: Array<Node<K, V>>
  readonly project: (key: K, value: V) => A
  entries: Array<[K, V]> = []
  index = 0

  constructor(root: Node<K, V>, project: (key: K, value: V) => A) {
    this.stack = [root]
    this.project = project
  }

  next(): IteratorResult<A> {
    while (true) {
      if (this.index < this.entries.length) {
        const entry = this.entries[this.index++]
        return { done: false, value: this.project(entry[0], entry[1]) }
      }
      if (this.stack.length === 0) {
        return { done: true, value: undefined }
      }
      const node = this.stack.pop()!
      switch (node._tag) {
        case "LeafNode": {
          const leaf = node as LeafNode<K, V>
          return { done: false, value: this.project(leaf.key, leaf.value) }
        }
        case "CollisionNode": {
          this.entries = (node as CollisionNode<K, V>).entries
          this.index = 0
          break
        }
        case "IndexedNode":
        case "ArrayNode": {
          const children = (node as IndexedNode<K, V> | ArrayNode<K, V>).children
          for (let i = children.length - 1; i >= 0; i--) {
            const child = children[i]
            if (child) this.stack.push(child)
          }
        }
      }
    }
  }

  [Symbol.iterator](): IterableIterator<A> {
    return this
  }
}

const toEntry = <K, V>(key: K, value: V): [K, V] => [key, value]
const toValue = <V>(_: unknown, value: V): V => value

/** @internal */
class HashMapImpl<K, V> implements HashMap<K, V> {
  readonly [HashMapTypeId]: HashMapTypeId = HashMapTypeId

  _editable: boolean
  _edit: number
  _root: Node<K, V>
  _size: number

  constructor(
    editable: boolean,
    edit: number,
    root: Node<K, V>,
    size: number
  ) {
    this._editable = editable
    this._edit = edit
    this._root = root
    this._size = size
  }

  get size(): number {
    return this._size
  }

  [Symbol.iterator](): IterableIterator<[K, V]> {
    return new HashMapIterator(this._root, toEntry)
  }

  [Equal_.symbol](that: Equal_.Equal): boolean {
    if (isHashMap(that)) {
      const thatImpl = that as HashMapImpl<K, V>
      if (this.size !== thatImpl.size) {
        return false
      }
      for (const [key, value] of this) {
        const otherValue = pipe(that, get(key))
        if (Option.isNone(otherValue) || !Equal_.equals(value, otherValue.value)) {
          return false
        }
      }
      return true
    }
    return false
  }

  [Hash.symbol](): number {
    return Hash.optimize(hashMapSeed ^ this._root.subtreeHash())
  }

  [NodeInspectSymbol](): unknown {
    return toJson(this)
  }

  toString(): string {
    return `HashMap(${format(Array.from(this))})`
  }

  toJSON(): unknown {
    return {
      _id: "HashMap",
      values: Array.from(this).map(([k, v]) => [toJson(k), toJson(v)])
    }
  }

  pipe() {
    return pipeArguments(this, arguments)
  }
}

/** @internal */
const emptyNode = new EmptyNode<any, any>()

/** @internal */
export const isHashMap: {
  <K, V>(u: Iterable<readonly [K, V]>): u is HashMap<K, V>
  (u: unknown): u is HashMap<unknown, unknown>
} = (u: unknown): u is HashMap<unknown, unknown> => hasProperty(u, HashMapTypeId)

/** @internal */
export const empty = <K = never, V = never>(): HashMap<K, V> => new HashMapImpl(false, 0, emptyNode, 0)

/** @internal */
export const make = <Entries extends ReadonlyArray<readonly [any, any]>>(
  ...entries: Entries
): HashMap<
  Entries[number] extends readonly [infer K, any] ? K : never,
  Entries[number] extends readonly [any, infer V] ? V : never
> => fromIterable(entries)

/** @internal */
export const fromIterable = <K, V>(entries: Iterable<readonly [K, V]>): HashMap<K, V> => {
  let root: Node<K, V> = emptyNode
  let size = 0
  const added = { value: false }

  for (const [key, value] of entries) {
    const hash = Hash.hash(key)
    added.value = false
    root = root.set(NaN, 0, hash, key, value, added)
    if (added.value) {
      size++
    }
  }

  return new HashMapImpl(false, 0, root, size)
}

/** @internal */
export const isEmpty = <K, V>(self: HashMap<K, V>): boolean => (self as HashMapImpl<K, V>).size === 0

/** @internal */
export const get = dual<
  <K1 extends K, K>(key: K1) => <V>(self: HashMap<K, V>) => Option.Option<V>,
  <K1 extends K, K, V>(self: HashMap<K, V>, key: K1) => Option.Option<V>
>(2, <K, V>(self: HashMap<K, V>, key: K): Option.Option<V> => {
  const impl = self as HashMapImpl<K, V>
  return impl._root.get(0, Hash.hash(key), key)
})

/** @internal */
export const getHash = dual<
  <K1 extends K, K>(key: K1, hash: number) => <V>(self: HashMap<K, V>) => Option.Option<V>,
  <K1 extends K, K, V>(self: HashMap<K, V>, key: K1, hash: number) => Option.Option<V>
>(3, <K, V>(self: HashMap<K, V>, key: K, hash: number): Option.Option<V> => {
  const impl = self as HashMapImpl<K, V>
  return impl._root.get(0, hash, key)
})

/** @internal */
export const getUnsafe = dual<
  <K1 extends K, K>(key: K1) => <V>(self: HashMap<K, V>) => V,
  <K1 extends K, K, V>(self: HashMap<K, V>, key: K1) => V
>(2, <K, V>(self: HashMap<K, V>, key: K): V => {
  const result = get(self, key)
  if (Option.isSome(result)) {
    return result.value
  }
  throw new Error(`HashMap.getUnsafe: key not found: ${key}`)
})

/** @internal */
export const has = dual<
  <K1 extends K, K>(key: K1) => <V>(self: HashMap<K, V>) => boolean,
  <K1 extends K, K, V>(self: HashMap<K, V>, key: K1) => boolean
>(2, <K, V>(self: HashMap<K, V>, key: K): boolean => {
  const impl = self as HashMapImpl<K, V>
  return impl._root.has(0, Hash.hash(key), key)
})

/** @internal */
export const hasHash = dual<
  <K1 extends K, K>(key: K1, hash: number) => <V>(self: HashMap<K, V>) => boolean,
  <K1 extends K, K, V>(self: HashMap<K, V>, key: K1, hash: number) => boolean
>(3, <K, V>(self: HashMap<K, V>, key: K, hash: number): boolean => {
  const impl = self as HashMapImpl<K, V>
  return impl._root.has(0, hash, key)
})

/** @internal */
export const hasBy = dual<
  <K, V>(predicate: (value: NoInfer<V>, key: NoInfer<K>) => boolean) => (self: HashMap<K, V>) => boolean,
  <K, V>(self: HashMap<K, V>, predicate: (value: NoInfer<V>, key: NoInfer<K>) => boolean) => boolean
>(2, <K, V>(self: HashMap<K, V>, predicate: (value: V, key: K) => boolean): boolean => {
  for (const [key, value] of self) {
    if (predicate(value, key)) {
      return true
    }
  }
  return false
})

const setHash = <K, V>(self: HashMap<K, V>, key: K, hash: number, value: V): HashMap<K, V> => {
  const impl = self as HashMapImpl<K, V>
  const added = { value: false }

  // Pass edit context: use current edit if editable, otherwise NaN (never matches any edit)
  const edit = impl._editable ? impl._edit : NaN
  const newRoot = impl._root.set(edit, 0, hash, key, value, added)

  if (impl._editable) {
    // In-place mutation
    impl._root = newRoot
    if (added.value) {
      impl._size++
    }
    return self
  }

  // Immutable: create new instance if changed
  if (impl._root === newRoot) {
    return self
  }

  return new HashMapImpl(false, impl._edit, newRoot, impl._size + (added.value ? 1 : 0))
}

/** @internal */
export const set = dual<
  <K, V>(key: K, value: V) => (self: HashMap<K, V>) => HashMap<K, V>,
  <K, V>(self: HashMap<K, V>, key: K, value: V) => HashMap<K, V>
>(3, <K, V>(self: HashMap<K, V>, key: K, value: V): HashMap<K, V> => {
  return setHash(self, key, Hash.hash(key), value)
})

/** @internal */
export const keys = <K, V>(self: HashMap<K, V>): IterableIterator<K> =>
  new HashMapIterator((self as HashMapImpl<K, V>)._root, identity)

/** @internal */
export const values = <K, V>(self: HashMap<K, V>): IterableIterator<V> =>
  new HashMapIterator((self as HashMapImpl<K, V>)._root, toValue)

/** @internal */
export const entries = <K, V>(self: HashMap<K, V>): IterableIterator<[K, V]> =>
  (self as HashMapImpl<K, V>)[Symbol.iterator]()

/** @internal */
export const size = <K, V>(self: HashMap<K, V>): number => (self as HashMapImpl<K, V>).size

/** @internal */
export const beginMutation = <K, V>(self: HashMap<K, V>): HashMap<K, V> => {
  const impl = self as HashMapImpl<K, V>
  return new HashMapImpl(true, impl._edit + 1, impl._root, impl._size)
}

/** @internal */
export const endMutation = <K, V>(self: HashMap<K, V>): HashMap<K, V> => {
  const impl = self as HashMapImpl<K, V>
  impl._editable = false
  return self
}

/** @internal */
export const mutate = dual<
  <K, V>(f: (self: HashMap<K, V>) => void) => (self: HashMap<K, V>) => HashMap<K, V>,
  <K, V>(self: HashMap<K, V>, f: (self: HashMap<K, V>) => void) => HashMap<K, V>
>(2, <K, V>(self: HashMap<K, V>, f: (self: HashMap<K, V>) => void): HashMap<K, V> => {
  const mutable = beginMutation(self)
  f(mutable)
  return endMutation(mutable)
})

/** @internal */
export const modifyAt = dual<
  <K, V>(key: K, f: HashMap.UpdateFn<V>) => (self: HashMap<K, V>) => HashMap<K, V>,
  <K, V>(self: HashMap<K, V>, key: K, f: HashMap.UpdateFn<V>) => HashMap<K, V>
>(3, <K, V>(self: HashMap<K, V>, key: K, f: HashMap.UpdateFn<V>): HashMap<K, V> => {
  const current = get(self, key)
  const updated = f(current)

  if (Option.isNone(updated)) {
    return has(self, key) ? remove(self, key) : self
  }

  return set(self, key, updated.value)
})

/** @internal */
export const modifyHash = dual<
  <K, V>(key: K, hash: number, f: HashMap.UpdateFn<V>) => (self: HashMap<K, V>) => HashMap<K, V>,
  <K, V>(self: HashMap<K, V>, key: K, hash: number, f: HashMap.UpdateFn<V>) => HashMap<K, V>
>(4, <K, V>(self: HashMap<K, V>, key: K, hash: number, f: HashMap.UpdateFn<V>): HashMap<K, V> => {
  const current = getHash(self, key, hash)
  const updated = f(current)

  if (Option.isNone(updated)) {
    return hasHash(self, key, hash) ? removeHash(self, key, hash) : self
  }

  return setHash(self, key, hash, updated.value)
})

/** @internal */
export const modify = dual<
  <K, V>(key: K, f: (v: V) => V) => (self: HashMap<K, V>) => HashMap<K, V>,
  <K, V>(self: HashMap<K, V>, key: K, f: (v: V) => V) => HashMap<K, V>
>(3, <K, V>(self: HashMap<K, V>, key: K, f: (v: V) => V): HashMap<K, V> => {
  return modifyAt(self, key, Option.map(f))
})

/** @internal */
export const union = dual<
  <K1, V1>(that: HashMap<K1, V1>) => <K0, V0>(self: HashMap<K0, V0>) => HashMap<K1 | K0, V1 | V0>,
  <K0, V0, K1, V1>(self: HashMap<K0, V0>, that: HashMap<K1, V1>) => HashMap<K0 | K1, V0 | V1>
>(2, <K0, V0, K1, V1>(self: HashMap<K0, V0>, that: HashMap<K1, V1>): HashMap<K0 | K1, V0 | V1> => {
  let result = self as HashMap<K0 | K1, V0 | V1>
  for (const [key, value] of that) {
    result = set(result, key, value)
  }
  return result
})

const removeHash = <K, V>(self: HashMap<K, V>, key: K, hash: number): HashMap<K, V> => {
  const impl = self as HashMapImpl<K, V>
  const removed = { value: false }

  const edit = impl._editable ? impl._edit : NaN
  const newRoot = impl._root.remove(edit, 0, hash, key, removed)

  if (!removed.value) {
    return self
  }

  if (impl._editable) {
    impl._root = newRoot ?? emptyNode
    impl._size--
    return self
  }

  if (newRoot === undefined) {
    return empty()
  }

  return new HashMapImpl(false, impl._edit, newRoot, impl._size - 1)
}

/** @internal */
export const remove = dual<
  <K>(key: K) => <V>(self: HashMap<K, V>) => HashMap<K, V>,
  <K, V>(self: HashMap<K, V>, key: K) => HashMap<K, V>
>(2, <K, V>(self: HashMap<K, V>, key: K): HashMap<K, V> => {
  return removeHash(self, key, Hash.hash(key))
})

/** @internal */
export const removeMany = dual<
  <K>(keys: Iterable<K>) => <V>(self: HashMap<K, V>) => HashMap<K, V>,
  <K, V>(self: HashMap<K, V>, keys: Iterable<K>) => HashMap<K, V>
>(2, <K, V>(self: HashMap<K, V>, keys: Iterable<K>): HashMap<K, V> => {
  let result = self
  for (const key of keys) {
    result = remove(result, key)
  }
  return result
})

/** @internal */
export const setMany = dual<
  <K, V>(entries: Iterable<readonly [K, V]>) => (self: HashMap<K, V>) => HashMap<K, V>,
  <K, V>(self: HashMap<K, V>, entries: Iterable<readonly [K, V]>) => HashMap<K, V>
>(2, <K, V>(self: HashMap<K, V>, entries: Iterable<readonly [K, V]>): HashMap<K, V> => {
  let result = self
  for (const [key, value] of entries) {
    result = set(result, key, value)
  }
  return result
})

/** @internal */
export const map = dual<
  <A, V, K>(f: (value: V, key: K) => A) => (self: HashMap<K, V>) => HashMap<K, A>,
  <K, V, A>(self: HashMap<K, V>, f: (value: V, key: K) => A) => HashMap<K, A>
>(2, <K, V, A>(self: HashMap<K, V>, f: (value: V, key: K) => A): HashMap<K, A> => {
  let result = empty<K, A>()
  for (const [key, value] of self) {
    result = set(result, key, f(value, key))
  }
  return result
})

/** @internal */
export const flatMap = dual<
  <A, K, B>(f: (value: A, key: K) => HashMap<K, B>) => (self: HashMap<K, A>) => HashMap<K, B>,
  <K, A, B>(self: HashMap<K, A>, f: (value: A, key: K) => HashMap<K, B>) => HashMap<K, B>
>(2, <K, A, B>(self: HashMap<K, A>, f: (value: A, key: K) => HashMap<K, B>): HashMap<K, B> => {
  let result = empty<K, B>()
  for (const [key, value] of self) {
    result = union(result, f(value, key))
  }
  return result
})

/** @internal */
export const forEach = dual<
  <V, K>(f: (value: V, key: K) => void) => (self: HashMap<K, V>) => void,
  <V, K>(self: HashMap<K, V>, f: (value: V, key: K) => void) => void
>(2, <V, K>(self: HashMap<K, V>, f: (value: V, key: K) => void): void => {
  for (const [key, value] of self) {
    f(value, key)
  }
})

/** @internal */
export const reduce = dual<
  <Z, V, K>(zero: Z, f: (accumulator: Z, value: V, key: K) => Z) => (self: HashMap<K, V>) => Z,
  <K, V, Z>(self: HashMap<K, V>, zero: Z, f: (accumulator: Z, value: V, key: K) => Z) => Z
>(3, <K, V, Z>(self: HashMap<K, V>, zero: Z, f: (accumulator: Z, value: V, key: K) => Z): Z => {
  let result = zero
  for (const [key, value] of self) {
    result = f(result, value, key)
  }
  return result
})

/** @internal */
export const filter = dual<
  <K, A>(f: (a: NoInfer<A>, k: K) => boolean) => (self: HashMap<K, A>) => HashMap<K, A>,
  <K, A>(self: HashMap<K, A>, f: (a: A, k: K) => boolean) => HashMap<K, A>
>(2, <K, A>(self: HashMap<K, A>, f: (a: A, k: K) => boolean) => {
  let result = empty<K, A>()
  for (const [key, value] of self) {
    if (f(value, key)) {
      result = set(result, key, value)
    }
  }
  return result
})

/** @internal */
export const compact = <K, A>(self: HashMap<K, Option.Option<A>>): HashMap<K, A> => {
  let result = empty<K, A>()
  for (const [key, value] of self) {
    if (Option.isSome(value)) {
      result = set(result, key, value.value)
    }
  }
  return result
}

/** @internal */
export const filterMap = dual<
  <A, K, B, X>(f: (input: A, key: K) => Result.Result<B, X>) => (self: HashMap<K, A>) => HashMap<K, B>,
  <K, A, B, X>(self: HashMap<K, A>, f: (input: A, key: K) => Result.Result<B, X>) => HashMap<K, B>
>(2, <K, A, B, X>(self: HashMap<K, A>, f: (input: A, key: K) => Result.Result<B, X>): HashMap<K, B> => {
  let result = empty<K, B>()
  for (const [key, value] of self) {
    const mapped = f(value, key)
    if (Result.isSuccess(mapped)) {
      result = set(result, key, mapped.success)
    }
  }
  return result
})

/** @internal */
export const findFirst = dual<
  <K, A>(predicate: (a: NoInfer<A>, k: K) => boolean) => (self: HashMap<K, A>) => Option.Option<[K, A]>,
  <K, A>(self: HashMap<K, A>, predicate: (a: A, k: K) => boolean) => Option.Option<[K, A]>
>(2, <K, A>(self: HashMap<K, A>, predicate: (a: A, k: K) => boolean) => {
  for (const [key, value] of self) {
    if (predicate(value, key)) {
      return Option.some([key, value])
    }
  }
  return Option.none()
})

/** @internal */
export const some = dual<
  <K, A>(predicate: (a: NoInfer<A>, k: K) => boolean) => (self: HashMap<K, A>) => boolean,
  <K, A>(self: HashMap<K, A>, predicate: (a: A, k: K) => boolean) => boolean
>(2, <K, A>(self: HashMap<K, A>, predicate: (a: A, k: K) => boolean): boolean => {
  for (const [key, value] of self) {
    if (predicate(value, key)) {
      return true
    }
  }
  return false
})

/** @internal */
export const every = dual<
  <K, A>(predicate: (a: NoInfer<A>, k: K) => boolean) => (self: HashMap<K, A>) => boolean,
  <K, A>(self: HashMap<K, A>, predicate: (a: A, k: K) => boolean) => boolean
>(2, <K, A>(self: HashMap<K, A>, predicate: (a: A, k: K) => boolean): boolean => {
  for (const [key, value] of self) {
    if (!predicate(value, key)) {
      return false
    }
  }
  return true
})
