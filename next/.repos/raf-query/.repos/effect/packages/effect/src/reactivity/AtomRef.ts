/**
 * Mutable reactive references for local, in-memory state.
 *
 * `AtomRef` provides small observable state cells that can be read, updated,
 * mapped, and subscribed to without going through an `AtomRegistry`. Mutable
 * refs can also create refs for nested properties. The module also provides a
 * collection helper that stores item refs and notifies subscribers when items are
 * inserted, removed, or changed.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Equal from "../Equal.ts"
import * as Hash from "../Hash.ts"

/**
 * The literal type used to identify `AtomRef` values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export type TypeId = "~effect/reactivity/AtomRef"

/**
 * The runtime type id used to identify `AtomRef` values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export const TypeId: TypeId = "~effect/reactivity/AtomRef"

/**
 * A read-only reactive reference.
 *
 * **Details**
 *
 * It exposes a stable key, the current value, subscriptions to value changes, and
 * `map` for creating derived read-only references. Equality and hashing are based
 * on the current value.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ReadonlyRef<A> extends Equal.Equal {
  readonly [TypeId]: TypeId
  readonly key: string
  readonly value: A
  readonly subscribe: (f: (a: A) => void) => () => void
  readonly map: <B>(f: (a: A) => B) => ReadonlyRef<B>
}

/**
 * A mutable reactive reference.
 *
 * **Details**
 *
 * It supports replacing the whole value, updating it from the current value, and
 * creating mutable references to nested properties.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface AtomRef<A> extends ReadonlyRef<A> {
  readonly prop: <K extends keyof A>(prop: K) => AtomRef<A[K]>
  readonly set: (value: A) => AtomRef<A>
  readonly update: (f: (value: A) => A) => AtomRef<A>
}

/**
 * A reactive collection of mutable item references.
 *
 * **Details**
 *
 * The collection can push, insert, and remove item refs, and `toArray` returns the
 * current raw item values.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Collection<A> extends ReadonlyRef<ReadonlyArray<AtomRef<A>>> {
  readonly push: (item: A) => Collection<A>
  readonly insertAt: (index: number, item: A) => Collection<A>
  readonly remove: (ref: AtomRef<A>) => Collection<A>
  readonly toArray: () => Array<A>
}

/**
 * Creates a mutable reactive reference initialized with the supplied value.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = <A>(value: A): AtomRef<A> => new AtomRefImpl(value)

/**
 * Creates a reactive collection from an iterable of initial item values.
 *
 * **Details**
 *
 * Each item is wrapped in an `AtomRef`, and changes to item refs notify the
 * collection subscribers.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const collection = <A>(items: Iterable<A>): Collection<A> => new CollectionImpl(items)

const keyState = {
  count: 0,
  generate() {
    return `AtomRef-${this.count++}`
  }
}

class ReadonlyRefImpl<A> implements ReadonlyRef<A> {
  readonly [TypeId]: TypeId
  readonly key = keyState.generate()
  public value: A
  constructor(value: A) {
    this[TypeId] = TypeId
    this.value = value
  }

  [Equal.symbol](that: Equal.Equal) {
    return Equal.equals(this.value, (that as ReadonlyRef<A>).value)
  }

  [Hash.symbol]() {
    return Hash.hash(this.value)
  }

  listeners: Listener<A> | null = null

  notify(a: A) {
    let listener = this.listeners
    while (listener !== null) {
      listener.f(a)
      listener = listener.next
    }
  }

  subscribe(f: (a: A) => void): () => void {
    const listener: Listener<A> = {
      f,
      prev: null,
      next: this.listeners
    }
    if (this.listeners) {
      this.listeners.prev = listener
    }
    this.listeners = listener

    return () => {
      if (this.listeners === listener) {
        this.listeners = listener.next
      }
      if (listener.prev) {
        listener.prev.next = listener.next
      }
      if (listener.next) {
        listener.next.prev = listener.prev
      }
    }
  }

  map<B>(f: (a: A) => B): ReadonlyRef<B> {
    return new MapRefImpl(this, f)
  }
}

type Listener<A> = {
  readonly f: (a: A) => void
  prev: Listener<A> | null
  next: Listener<A> | null
}

class AtomRefImpl<A> extends ReadonlyRefImpl<A> implements AtomRef<A> {
  prop<K extends keyof A>(prop: K): AtomRef<A[K]> {
    return new PropRefImpl(this, prop)
  }
  set(value: A) {
    if (Equal.equals(value, this.value)) {
      return this
    }
    this.value = value
    this.notify(value)
    return this
  }

  update(f: (value: A) => A) {
    return this.set(f(this.value))
  }
}

class MapRefImpl<A, B> implements ReadonlyRef<B> {
  readonly [TypeId]: TypeId
  readonly key = keyState.generate()
  readonly parent: ReadonlyRef<A>
  readonly transform: (a: A) => B
  constructor(parent: ReadonlyRef<A>, transform: (a: A) => B) {
    this[TypeId] = TypeId
    this.parent = parent
    this.transform = transform
  }
  [Equal.symbol](that: Equal.Equal) {
    return Equal.equals(this.value, (that as ReadonlyRef<B>).value)
  }
  [Hash.symbol]() {
    return Hash.hash(this.value)
  }
  get value() {
    return this.transform(this.parent.value)
  }
  subscribe(f: (a: B) => void): () => void {
    let previous = this.transform(this.parent.value)
    return this.parent.subscribe((a) => {
      const next = this.transform(a)
      if (Equal.equals(next, previous)) {
        return
      }
      previous = next
      f(next)
    })
  }
  map<C>(f: (a: B) => C): ReadonlyRef<C> {
    return new MapRefImpl(this, f)
  }
}

class PropRefImpl<A, K extends keyof A> implements AtomRef<A[K]> {
  readonly [TypeId]: TypeId
  readonly key = keyState.generate()
  private previous: A[K]
  readonly parent: AtomRef<A>
  readonly _prop: K

  constructor(parent: AtomRef<A>, _prop: K) {
    this[TypeId] = TypeId
    this.parent = parent
    this._prop = _prop
    this.previous = parent.value[_prop]
  }
  [Equal.symbol](that: Equal.Equal) {
    return Equal.equals(this.value, (that as ReadonlyRef<A>).value)
  }
  [Hash.symbol]() {
    return Hash.hash(this.value)
  }
  get value() {
    if (this.parent.value && this._prop in (this.parent.value as any)) {
      this.previous = this.parent.value[this._prop]
    }
    return this.previous
  }
  subscribe(f: (a: A[K]) => void): () => void {
    let previous = this.value
    return this.parent.subscribe((a) => {
      if (!a || !(this._prop in (a as any))) {
        return
      }
      const next = a[this._prop]
      if (Equal.equals(next, previous)) {
        return
      }
      previous = next
      f(next)
    })
  }
  map<C>(f: (a: A[K]) => C): ReadonlyRef<C> {
    return new MapRefImpl(this, f)
  }
  prop<CK extends keyof A[K]>(prop: CK): AtomRef<A[K][CK]> {
    return new PropRefImpl(this, prop)
  }
  set(value: A[K]): AtomRef<A[K]> {
    if (Array.isArray(this.parent.value)) {
      const newArray = this.parent.value.slice()
      newArray[this._prop as number] = value
      this.parent.set(newArray as A)
    } else {
      this.parent.set({
        ...this.parent.value,
        [this._prop]: value
      })
    }
    return this
  }
  update(f: (value: A[K]) => A[K]): AtomRef<A[K]> {
    if (Array.isArray(this.parent.value)) {
      const newArray = this.parent.value.slice()
      newArray[this._prop as number] = f(this.parent.value[this._prop])
      this.parent.set(newArray as A)
    } else {
      this.parent.set({
        ...this.parent.value,
        [this._prop]: f(this.parent.value[this._prop])
      })
    }
    return this
  }
}

class CollectionImpl<A> extends ReadonlyRefImpl<Array<AtomRef<A>>> implements Collection<A> {
  constructor(items: Iterable<A>) {
    super([])
    for (const item of items) {
      this.value.push(this.makeRef(item))
    }
  }

  makeRef(value: A) {
    const ref = new AtomRefImpl(value)
    const notify = (value: A) => {
      ref.notify(value)
      this.notify(this.value)
    }
    return new Proxy(ref, {
      get(target, p, _receiver) {
        if (p === "notify") {
          return notify
        }
        return target[p as keyof AtomRef<A>]
      }
    })
  }

  push(item: A) {
    const ref = this.makeRef(item)
    this.value.push(ref)
    this.notify(this.value)
    return this
  }

  insertAt(index: number, item: A) {
    const ref = this.makeRef(item)
    this.value.splice(index, 0, ref)
    this.notify(this.value)
    return this
  }

  remove(ref: AtomRef<A>) {
    const index = this.value.indexOf(ref)
    if (index !== -1) {
      this.value.splice(index, 1)
      this.notify(this.value)
    }
    return this
  }

  toArray() {
    return this.value.map((ref) => ref.value)
  }
}
