/**
 * Stores and runs atoms for one reactive runtime.
 *
 * An `AtomRegistry` evaluates atoms, caches their current values, tracks
 * dependencies, applies writes and refreshes, manages subscriptions, and
 * disposes unused nodes. Each registry is independent, so the same atom can hold
 * different values in different registries. Serializable atom values can also be
 * preloaded before the first read.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import * as Exit from "../Exit.ts"
import * as Fiber from "../Fiber.ts"
import { constVoid, dual } from "../Function.ts"
import * as Layer from "../Layer.ts"
import * as Option from "../Option.ts"
import { hasProperty } from "../Predicate.ts"
import * as Queue from "../Queue.ts"
import type { Scheduler, SchedulerDispatcher } from "../Scheduler.ts"
import { MixedScheduler } from "../Scheduler.ts"
import * as Scope from "../Scope.ts"
import * as Stream from "../Stream.ts"
import * as Result from "./AsyncResult.ts"
import type * as Atom from "./Atom.ts"

/**
 * The literal type used to identify `AtomRegistry` services and values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export type TypeId = "~effect/reactivity/AtomRegistry"

/**
 * The runtime type id used to identify `AtomRegistry` services and values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export const TypeId: TypeId = "~effect/reactivity/AtomRegistry"

/**
 * Returns `true` when the value has the `AtomRegistry` type id.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isAtomRegistry = (u: unknown): u is AtomRegistry => hasProperty(u, TypeId)

/**
 * The runtime registry that stores atom nodes and coordinates reads, writes,
 * refreshes, subscriptions, and disposal.
 *
 * **Details**
 *
 * It also manages scheduler configuration, serializable preloaded values, and node
 * addition/removal callbacks.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface AtomRegistry {
  readonly [TypeId]: TypeId
  readonly scheduler: Scheduler
  readonly schedulerAsync: Scheduler
  readonly getNodes: () => ReadonlyMap<Atom.Atom<any> | string, Node<any>>
  readonly get: <A>(atom: Atom.Atom<A>) => A
  readonly mount: <A>(atom: Atom.Atom<A>) => () => void
  readonly refresh: <A>(atom: Atom.Atom<A>) => void
  readonly set: <R, W>(atom: Atom.Writable<R, W>, value: W) => void
  readonly setSerializable: (key: string, encoded: unknown) => void
  readonly modify: <R, W, A>(atom: Atom.Writable<R, W>, f: (_: R) => [returnValue: A, nextValue: W]) => A
  readonly update: <R, W>(atom: Atom.Writable<R, W>, f: (_: R) => W) => void
  readonly subscribe: <A>(atom: Atom.Atom<A>, f: (_: A) => void, options?: {
    readonly immediate?: boolean
  }) => () => void
  readonly reset: () => void
  readonly dispose: () => void
  onNodeAdded?: ((node: Node<any>) => void) | undefined
  onNodeRemoved?: ((node: Node<any>) => void) | undefined
}

/**
 * A registry node for a single atom.
 *
 * **Details**
 *
 * Nodes expose the current value, parent and child dependency links, listener set,
 * and current lifecycle state.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Node<A> {
  readonly atom: Atom.Atom<A>
  readonly value: () => A
  parents: Set<Node<any>>
  children: Set<Node<any>>
  listeners: Set<() => void>
  currentState(): "uninitialized" | "stale" | "valid" | "removed"
}

/**
 * Creates an `AtomRegistry`.
 *
 * **Details**
 *
 * Options can preload initial atom values, provide a custom task scheduler,
 * configure timeout bucket resolution, and set a default idle time-to-live for
 * unused atoms.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = (
  options?: {
    readonly initialValues?: Iterable<readonly [Atom.Atom<any>, any]> | undefined
    readonly scheduleTask?: ((f: () => void) => () => void) | undefined
    readonly timeoutResolution?: number | undefined
    readonly defaultIdleTTL?: number | undefined
  } | undefined
): AtomRegistry =>
  new RegistryImpl(
    options?.initialValues,
    options?.scheduleTask,
    options?.timeoutResolution,
    options?.defaultIdleTTL
  )

/**
 * Service tag for the active atom runtime cache.
 *
 * **When to use**
 *
 * Use to access or provide the registry that stores atom values,
 * dependencies, subscriptions, and disposal state for a reactive lifetime.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const AtomRegistry = Context.Service<AtomRegistry>(TypeId)

/**
 * Creates a layer that provides an `AtomRegistry` configured with the supplied
 * options.
 *
 * **Details**
 *
 * The registry is disposed when the layer scope is finalized.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerOptions = (options?: {
  readonly initialValues?: Iterable<readonly [Atom.Atom<any>, any]> | undefined
  readonly scheduleTask?: ((f: () => void) => () => void) | undefined
  readonly timeoutResolution?: number | undefined
  readonly defaultIdleTTL?: number | undefined
}): Layer.Layer<AtomRegistry> =>
  Layer.effect(
    AtomRegistry,
    Effect.gen(function*() {
      const scope = yield* Effect.scope
      const registry = make({
        ...options,
        scheduleTask: options?.scheduleTask
      })
      yield* Scope.addFinalizer(scope, Effect.sync(() => registry.dispose()))
      return registry
    })
  )

/**
 * The default layer that provides a fresh `AtomRegistry`.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer.Layer<AtomRegistry> = layerOptions()

// -----------------------------------------------------------------------------
// conversions
// -----------------------------------------------------------------------------

/**
 * Converts an atom in this registry into a stream.
 *
 * **Details**
 *
 * The stream emits the current value immediately, emits subsequent changes, and
 * unsubscribes from the registry when the stream scope closes.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const toStream: {
  <A>(atom: Atom.Atom<A>): (self: AtomRegistry) => Stream.Stream<A>
  <A>(self: AtomRegistry, atom: Atom.Atom<A>): Stream.Stream<A>
} = dual(
  2,
  <A>(self: AtomRegistry, atom: Atom.Atom<A>) =>
    Stream.callback<A>((queue) =>
      Effect.suspend(() => {
        const fiber = Fiber.getCurrent()!
        const scope = Context.getUnsafe(fiber.context, Scope.Scope)
        const cancel = self.subscribe(atom, (value) => Queue.offerUnsafe(queue, value), {
          immediate: true
        })
        return Scope.addFinalizer(scope, Effect.sync(cancel))
      })
    )
)

/**
 * Converts an `AsyncResult` atom in this registry into a stream of successful
 * values.
 *
 * **Details**
 *
 * Initial results are skipped, failures fail the stream with their cause, and
 * duplicate stream values are dropped with `Stream.changes`.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const toStreamResult: {
  <A, E>(atom: Atom.Atom<Result.AsyncResult<A, E>>): (self: AtomRegistry) => Stream.Stream<A, E>
  <A, E>(self: AtomRegistry, atom: Atom.Atom<Result.AsyncResult<A, E>>): Stream.Stream<A, E>
} = dual(
  2,
  <A, E>(self: AtomRegistry, atom: Atom.Atom<Result.AsyncResult<A, E>>): Stream.Stream<A, E> =>
    toStream(self, atom).pipe(
      Stream.filter(Result.isNotInitial),
      Stream.mapEffect((result) =>
        result._tag === "Success" ? Effect.succeed(result.value) : Effect.failCause(result.cause)
      ),
      Stream.changes
    )
)

/**
 * Reads an `AsyncResult` atom from this registry as an effect.
 *
 * **Details**
 *
 * The effect waits for the result to leave `Initial`, and also waits through
 * waiting results when `suspendOnWaiting` is enabled.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const getResult: {
  <A, E>(atom: Atom.Atom<Result.AsyncResult<A, E>>, options?: {
    readonly suspendOnWaiting?: boolean | undefined
  }): (self: AtomRegistry) => Effect.Effect<A, E>
  <A, E>(self: AtomRegistry, atom: Atom.Atom<Result.AsyncResult<A, E>>, options?: {
    readonly suspendOnWaiting?: boolean | undefined
  }): Effect.Effect<A, E>
} = dual(
  (args) => isAtomRegistry(args[0]),
  <A, E>(self: AtomRegistry, atom: Atom.Atom<Result.AsyncResult<A, E>>, options?: {
    readonly suspendOnWaiting?: boolean | undefined
  }): Effect.Effect<A, E> => {
    const suspendOnWaiting = options?.suspendOnWaiting ?? false
    return Effect.callback((resume) => {
      const result = self.get(atom)
      if (result._tag !== "Initial" && !(suspendOnWaiting && result.waiting)) {
        return resume(Result.toExit(result) as any)
      }
      const cancel = self.subscribe(atom, (value) => {
        if (value._tag !== "Initial" && !(suspendOnWaiting && value.waiting)) {
          resume(Result.toExit(value) as any)
          cancel()
        }
      })
      return Effect.sync(cancel)
    })
  }
)

/**
 * Mounts an atom in this registry for the lifetime of the current scope.
 *
 * **Details**
 *
 * The atom is subscribed with a no-op listener and the subscription is released
 * when the scope finalizer runs.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const mount: {
  <A>(atom: Atom.Atom<A>): (self: AtomRegistry) => Effect.Effect<void, never, Scope.Scope>
  <A>(self: AtomRegistry, atom: Atom.Atom<A>): Effect.Effect<void, never, Scope.Scope>
} = dual(
  2,
  <A>(self: AtomRegistry, atom: Atom.Atom<A>) =>
    Effect.acquireRelease(
      Effect.sync(() => self.mount(atom)),
      (release) => Effect.sync(release)
    )
)

// -----------------------------------------------------------------------------
// internal
// -----------------------------------------------------------------------------

const constImmediate = { immediate: true }

const invoke = (f: () => void): void => {
  f()
}

const noFailure = {}

// Runs `f` for every item, then rethrows the first failure. One failing step
// must not skip the others: those would leak a lifetime or miss an update.
function runAll<T>(items: Iterable<T>, f: (item: T) => void): void {
  let failure: unknown = noFailure
  for (const item of items) {
    try {
      f(item)
    } catch (error) {
      if (failure === noFailure) failure = error
    }
  }
  if (failure !== noFailure) throw failure
}

const SerializableTypeId: Atom.SerializableTypeId = "~effect-atom/atom/Atom/Serializable"
const atomKey = <A>(atom: Atom.Atom<A>): Atom.Atom<A> | string =>
  SerializableTypeId in atom ? (atom as Atom.Serializable<any>)[SerializableTypeId].key : atom

class RegistryImpl implements AtomRegistry {
  readonly [TypeId]: TypeId
  readonly timeoutResolution: number
  readonly defaultIdleTTL: number | undefined
  readonly scheduler: Scheduler
  readonly schedulerAsync: Scheduler
  readonly dispatcher: SchedulerDispatcher
  onNodeAdded?: ((node: Node<any>) => void) | undefined
  onNodeRemoved?: ((node: Node<any>) => void) | undefined

  constructor(
    initialValues?: Iterable<readonly [Atom.Atom<any>, any]>,
    scheduleTask?: (cb: () => void) => () => void,
    timeoutResolution?: number,
    defaultIdleTTL?: number
  ) {
    this[TypeId] = TypeId
    this.scheduler = new MixedScheduler("sync", scheduleTask)
    this.schedulerAsync = new MixedScheduler("async", scheduleTask)
    this.dispatcher = this.schedulerAsync.makeDispatcher()
    this.defaultIdleTTL = defaultIdleTTL

    if (timeoutResolution === undefined && defaultIdleTTL !== undefined) {
      this.timeoutResolution = Math.round(defaultIdleTTL / 2)
    } else {
      this.timeoutResolution = timeoutResolution ?? 1000
    }
    if (initialValues !== undefined) {
      for (const [atom, value] of initialValues) {
        let target = atom
        while (target.initialValueTarget) {
          target = target.initialValueTarget
        }
        this.ensureNode(target).setInitialValue(value)
      }
    }
  }

  readonly nodes = new Map<Atom.Atom<any> | string, NodeImpl<any>>()
  readonly preloadedSerializable = new Map<string, unknown>()
  readonly timeoutBuckets = new Map<number, readonly [nodes: Set<NodeImpl<any>>, handle: number]>()
  readonly nodeTimeoutBucket = new Map<NodeImpl<any>, number>()
  disposed = false

  getNodes() {
    return this.nodes
  }

  get<A>(atom: Atom.Atom<A>): A {
    return this.ensureNode(atom).value()
  }

  set<R, W>(atom: Atom.Writable<R, W>, value: W): void {
    atom.write(this.ensureNode(atom).writeContext, value)
  }

  setSerializable(key: string, encoded: unknown): void {
    this.preloadedSerializable.set(key, encoded)
  }

  modify<R, W, A>(atom: Atom.Writable<R, W>, f: (_: R) => [returnValue: A, nextValue: W]): A {
    const node = this.ensureNode(atom)
    const result = f(node.value())
    atom.write(node.writeContext, result[1])
    return result[0]
  }

  update<R, W>(atom: Atom.Writable<R, W>, f: (_: R) => W): void {
    const node = this.ensureNode(atom)
    atom.write(node.writeContext, f(node.value()))
  }

  refresh = <A>(atom: Atom.Atom<A>): void => {
    if (atom.refresh !== undefined) {
      atom.refresh(this.refresh)
    } else {
      this.invalidateAtom(atom)
    }
  }

  subscribe<A>(atom: Atom.Atom<A>, f: (_: A) => void, options?: { readonly immediate?: boolean }): () => void {
    const node = this.ensureNode(atom)
    if (options?.immediate) {
      f(node.value())
    } else if (node.state === NodeState.stale) {
      // a listener hears the next change, which only reaches an up-to-date node
      node.value()
    }
    const remove = node.subscribe(function() {
      f(node._value)
    })
    return () => {
      remove()
      if (node.canBeRemoved) {
        this.scheduleNodeRemoval(node)
      }
    }
  }

  mount<A>(atom: Atom.Atom<A>) {
    return this.subscribe(atom, constVoid, constImmediate)
  }

  atomHasTtl(atom: Atom.Atom<any>): boolean {
    return !atom.keepAlive && atom.idleTTL !== 0 && (atom.idleTTL !== undefined || this.defaultIdleTTL !== undefined)
  }

  ensureNode<A>(atom: Atom.Atom<A>): NodeImpl<A> {
    const key = atomKey(atom)
    let node = this.nodes.get(key)
    if (node === undefined) {
      node = this.createNode(atom)
      this.nodes.set(key, node)
      this.onNodeAdded?.(node)
    } else if (this.atomHasTtl(atom)) {
      this.removeNodeTimeout(node)
    }
    if (typeof key === "string" && this.preloadedSerializable.has(key)) {
      const encoded = this.preloadedSerializable.get(key)
      this.preloadedSerializable.delete(key)
      const decoded = (atom as any as Atom.Serializable<any>)[SerializableTypeId].decode(encoded)
      let target = atom
      while (target.initialValueTarget) {
        target = target.initialValueTarget
      }
      if (target === atom) {
        node.setValue(decoded)
      } else {
        this.ensureNode(target).setInitialValue(decoded)
      }
    }
    return node
  }

  createNode<A>(atom: Atom.Atom<A>): NodeImpl<A> {
    if (this.disposed) {
      throw new Error(`Cannot access Atom ${atom}: registry is disposed`)
    }

    if (!atom.keepAlive) {
      this.scheduleAtomRemoval(atom)
    }
    return new NodeImpl(this, atom)
  }

  invalidateAtom = <A>(atom: Atom.Atom<A>): void => {
    this.ensureNode(atom).invalidate()
  }

  scheduleAtomRemoval(atom: Atom.Atom<any>): void {
    this.dispatcher.scheduleTask(() => {
      const node = this.nodes.get(atomKey(atom))
      if (node !== undefined && node.canBeRemoved) {
        this.removeNode(node)
      }
    }, 0)
  }

  scheduleNodeRemoval(node: NodeImpl<any>): void {
    this.dispatcher.scheduleTask(() => {
      if (node.canBeRemoved) {
        this.removeNode(node)
      }
    }, 0)
  }

  removeNode(node: NodeImpl<any>): void {
    if (this.atomHasTtl(node.atom)) {
      this.setNodeTimeout(node)
    } else {
      this.nodes.delete(atomKey(node.atom))
      node.remove()
      this.onNodeRemoved?.(node)
    }
  }

  setNodeTimeout(node: NodeImpl<any>): void {
    if (this.nodeTimeoutBucket.has(node)) {
      return
    }

    let idleTTL = node.atom.idleTTL ?? this.defaultIdleTTL!
    if (this.#currentSweepTTL !== null) {
      idleTTL -= this.#currentSweepTTL
      if (idleTTL <= 0) {
        this.nodes.delete(atomKey(node.atom))
        node.remove()
        this.onNodeRemoved?.(node)
        return
      }
    }
    const ttl = Math.ceil(idleTTL! / this.timeoutResolution) * this.timeoutResolution
    const timestamp = Date.now() + ttl
    const bucket = timestamp - (timestamp % this.timeoutResolution) + this.timeoutResolution

    let entry = this.timeoutBuckets.get(bucket)
    if (entry === undefined) {
      entry = [
        new Set<NodeImpl<any>>(),
        setTimeout(() => this.sweepBucket(bucket), bucket - Date.now()) as any
      ]
      this.timeoutBuckets.set(bucket, entry)
    }
    entry[0].add(node)
    this.nodeTimeoutBucket.set(node, bucket)
  }

  removeNodeTimeout(node: NodeImpl<any>): void {
    const bucket = this.nodeTimeoutBucket.get(node)
    if (bucket === undefined) return
    this.nodeTimeoutBucket.delete(node)
    this.scheduleNodeRemoval(node)

    const [nodes, handle] = this.timeoutBuckets.get(bucket)!
    nodes.delete(node)
    if (nodes.size === 0) {
      clearTimeout(handle)
      this.timeoutBuckets.delete(bucket)
    }
  }

  #currentSweepTTL: number | null = null
  sweepBucket(bucket: number): void {
    const nodes = this.timeoutBuckets.get(bucket)![0]
    this.timeoutBuckets.delete(bucket)
    runAll(nodes, this.removeIdleNode)
  }

  removeIdleNode = (node: NodeImpl<any>): void => {
    this.nodeTimeoutBucket.delete(node)
    if (!node.canBeRemoved) return
    this.nodes.delete(atomKey(node.atom))
    this.onNodeRemoved?.(node)
    this.#currentSweepTTL = node.atom.idleTTL ?? this.defaultIdleTTL!
    try {
      node.remove()
    } finally {
      this.#currentSweepTTL = null
    }
  }

  reset(): void {
    this.timeoutBuckets.forEach(([, handle]) => clearTimeout(handle))
    this.timeoutBuckets.clear()
    this.nodeTimeoutBucket.clear()

    const nodes = Array.from(this.nodes.values())
    this.nodes.clear()
    // Mark all nodes before removing any, so a parent cannot be rescheduled for removal.
    for (const node of nodes) {
      node.state = NodeState.removed
    }
    runAll(nodes, this.destroyNode)
  }

  destroyNode = (node: NodeImpl<any>): void => {
    node.remove()
    this.onNodeRemoved?.(node)
  }

  dispose(): void {
    this.disposed = true
    this.reset()
  }
}

const NodeFlags = {
  alive: 1, // 1 << 0
  initialized: 2, // 1 << 1,
  waitingForValue: 4 // 1 << 2
} as const
type NodeFlags = typeof NodeFlags[keyof typeof NodeFlags]

const NodeState = {
  uninitialized: NodeFlags.alive | NodeFlags.waitingForValue,
  stale: NodeFlags.alive | NodeFlags.initialized | NodeFlags.waitingForValue,
  valid: NodeFlags.alive | NodeFlags.initialized,
  removed: 0
} as const
type NodeState = number

class NodeImpl<A> {
  constructor(
    registry: RegistryImpl,
    atom: Atom.Atom<A>
  ) {
    this.registry = registry
    this.atom = atom
    this.writeContext = new WriteContextImpl(registry, this)
  }

  readonly registry: RegistryImpl
  readonly atom: Atom.Atom<A>
  state: NodeState = NodeState.uninitialized
  lifetime: Lifetime<A> | undefined
  writeContext: WriteContextImpl<A>
  preserveInitialValueOnBuild = false
  invalidatedDuringBuild = false
  failed = false

  // Every parent that holds this node as a child. A stale node keeps the
  // parents of its last build, so they are not released and their next change
  // still reaches it. A build drops the parents it did not read.
  parents = new Set<NodeImpl<any>>()
  children = new Set<NodeImpl<any>>()
  listeners = new Set<() => void>()
  observedChildren = 0

  currentState() {
    switch (this.state) {
      case NodeState.uninitialized:
        return "uninitialized"
      case NodeState.stale:
        return "stale"
      case NodeState.valid:
        return "valid"
      default:
        return "removed"
    }
  }

  get canBeRemoved(): boolean {
    return !this.atom.keepAlive && this.listeners.size === 0 && this.children.size === 0 && this.state !== 0
  }

  get building(): boolean {
    return this.lifetime !== undefined && this.lifetime.reads !== undefined
  }

  // An observed node is rebuilt as soon as it goes stale, because something
  // waits for its value without reading it. The count spares walking the
  // children on every invalidation.
  get isObserved(): boolean {
    return !this.atom.lazy || this.listeners.size > 0 || this.observedChildren > 0
  }

  childObserved(delta: 1 | -1): void {
    const observed = this.isObserved
    this.observedChildren += delta
    if (observed !== this.isObserved) {
      this.observedChanged(delta)
    }
  }

  observedChanged(delta: 1 | -1): void {
    for (const parent of this.parents) {
      parent.childObserved(delta)
    }
  }

  _value: A = undefined as any
  value(): A {
    // a build can be superseded by a nested one, and that one staled again
    // before the outer read returns
    while ((this.state & NodeFlags.waitingForValue) !== 0) {
      this.build()
    }
    return this._value
  }

  build(): void {
    // a lifetime still attached to a node that needs a value belongs to a
    // build that failed, or to one that is running and is now superseded
    this.disposeLifetime()
    this.invalidatedDuringBuild = false
    const lifetime = makeLifetime(this)
    this.lifetime = lifetime
    let value: A
    let read = false
    try {
      value = this.atom.read(lifetime)
      read = true
    } finally {
      const reads = lifetime.reads!
      lifetime.reads = undefined
      if (this.lifetime === lifetime) {
        this.dropUnread(reads)
        if (!read) this.fail()
      }
    }
    if (this.lifetime === lifetime && (this.state & NodeFlags.waitingForValue) !== 0) {
      if (this.preserveInitialValueOnBuild) {
        this.preserveInitialValueOnBuild = false
        this.failed = false
        this.state = NodeState.valid
      } else {
        this.setValue(value)
      }
    }
    if (lifetime.failure !== noFailure) throw lifetime.failure
  }

  // A build that threw leaves its dependents holding, or reading, a value
  // this node no longer stands behind, so they go stale and rebuild when
  // pulled or observed. The read's error is the one reported.
  fail(): void {
    this.failed = true
    try {
      this.invalidateChildren()
    } catch {
      // an observed dependent rebuilt and met the same failure
    }
  }

  readTracked<B>(atom: Atom.Atom<B>, lifetime: Lifetime<A>): B {
    const parent = this.registry.ensureNode(atom)
    // the dependency holds even when the parent cannot produce a value, so
    // that its recovery reaches this node; a build superseded while the
    // parent builds has the edge dropped by its replacement
    if (!this.parents.has(parent)) {
      this.parents.add(parent)
      parent.children.add(this)
      if (this.isObserved) {
        parent.childObserved(1)
      }
    }
    try {
      return parent.value()
    } catch (error) {
      // the parent may have got its value and failed only to update another
      // dependent: this build still takes the value, and rethrows once it is done
      if (lifetime.reads === undefined || parent.state !== NodeState.valid) throw error
      if (lifetime.failure === noFailure) lifetime.failure = error
      return parent._value
    } finally {
      // read once the parent has answered: its commit while it is being
      // pulled is the value this build is about to receive
      if (lifetime.reads !== undefined && !lifetime.disposed) {
        lifetime.reads.add(parent)
      }
    }
  }

  dropUnread(reads: Set<NodeImpl<any>>): void {
    if (reads.size === this.parents.size) return
    const observed = this.isObserved
    for (const parent of this.parents) {
      if (reads.has(parent)) continue
      this.parents.delete(parent)
      parent.children.delete(this)
      if (observed) {
        parent.childObserved(-1)
      }
      if (parent.canBeRemoved) {
        this.registry.scheduleNodeRemoval(parent)
      }
    }
  }

  valueOption(): Option.Option<A> {
    if ((this.state & NodeFlags.initialized) === 0) {
      return Option.none()
    }
    return Option.some(this._value)
  }

  setInitialValue(value: A): void {
    if ((this.state & NodeFlags.initialized) === 0) {
      this.preserveInitialValueOnBuild = true
      this.state = NodeState.stale
      this._value = value
      if (this.listeners.size > 0) {
        this.announce()
      }
      return
    }

    this.setValue(value)
  }

  setValue(value: A): void {
    // dependents that failed along with this node get another try
    const recovered = this.failed
    this.failed = false
    const initialized = (this.state & NodeFlags.initialized) !== 0
    this.state = NodeState.valid
    if (initialized && this.atom.equals(this._value, value)) {
      if (recovered) this.invalidateChildren()
      return
    }

    this._value = value
    let failure: unknown = noFailure
    try {
      this.invalidateChildren()
    } catch (error) {
      failure = error
    }
    // the value is committed, so its listeners hear of it even when a dependent failed
    if (this.listeners.size > 0) {
      try {
        this.announce()
      } catch (error) {
        if (failure === noFailure) failure = error
      }
    }
    if (failure !== noFailure) throw failure
  }

  announce(): void {
    if (batchState.phase === BatchPhase.collect) {
      batchState.notify.add(this)
    } else {
      this.notify()
    }
  }

  invalidate(): void {
    if (this.state === NodeState.valid) {
      this.state = NodeState.stale
      try {
        this.disposeLifetime()
      } finally {
        this.propagate()
      }
    } else if (this.building && batchState.phase !== BatchPhase.collect) {
      // the running build read a parent that has changed since
      this.build()
    } else {
      this.propagate()
    }
  }

  propagate(): void {
    if (batchState.phase === BatchPhase.collect) {
      if (this.building) {
        this.invalidatedDuringBuild = true
      }
      batchState.stale.push(this)
    } else if (this.isObserved) {
      this.value()
    } else {
      this.invalidateChildren()
    }
  }

  invalidateChildren(): void {
    if (this.children.size === 0) {
      return
    }
    let failure: unknown = noFailure
    // a snapshot: a rebuild adds and drops children
    for (const child of Array.from(this.children)) {
      if (!child.affectedBy(this)) continue
      try {
        child.invalidate()
      } catch (error) {
        if (failure === noFailure) failure = error
      }
    }
    if (failure !== noFailure) throw failure
  }

  // Whether a change of the parent reaches this node: it holds the parent's
  // value, or a running build has already read it. A stale node is stale
  // already, and a build that has not read the parent yet will read the new
  // value. The exception is an observed node that is still stale: its rebuild
  // failed, and a parent that has a value again is its chance to recover.
  affectedBy(parent: NodeImpl<any>): boolean {
    if (this.state === NodeState.valid) return true
    const reads = this.lifetime?.reads
    if (reads !== undefined) return reads.has(parent)
    return this.isObserved && parent.state === NodeState.valid
  }

  notify(): void {
    if (batchState.phase === BatchPhase.commit) {
      batchState.notify.delete(this)
    }
    runAll(this.listeners, invoke)
  }

  disposeLifetime(): void {
    const lifetime = this.lifetime
    if (lifetime !== undefined) {
      this.lifetime = undefined
      lifetime.dispose()
    }
  }

  remove() {
    const observed = this.isObserved
    this.state = NodeState.removed
    this.listeners.clear()
    try {
      this.disposeLifetime()
    } finally {
      const parents = Array.from(this.parents)
      this.parents.clear()
      runAll(parents, (parent) => {
        parent.children.delete(this)
        if (observed) {
          parent.childObserved(-1)
        }
        if (parent.canBeRemoved) {
          this.registry.removeNode(parent)
        }
      })
    }
  }

  subscribe(listener: () => void): () => void {
    const observed = this.isObserved
    this.listeners.add(listener)
    if (!observed) {
      this.observedChanged(1)
    }
    return () => {
      if (this.listeners.delete(listener) && !this.isObserved) {
        this.observedChanged(-1)
      }
    }
  }
}

interface Lifetime<A> extends Atom.AtomContext {
  isFn: boolean
  readonly node: NodeImpl<A>
  // the parents read so far by the build; `undefined` once the build has returned
  reads: Set<NodeImpl<any>> | undefined
  // a failure met while reading a parent that still produced its value
  failure: unknown
  finalizers: Array<() => void> | undefined
  disposed: boolean
  readonly dispose: () => void
}

const LifetimeProto: Omit<Lifetime<any>, "node" | "finalizers" | "disposed" | "isFn" | "reads" | "failure"> = {
  get registry(): RegistryImpl {
    return (this as Lifetime<any>).node.registry
  },

  addFinalizer(this: Lifetime<any>, f: () => void): void {
    if (this.disposed) return f()
    this.finalizers ??= []
    this.finalizers.push(f)
  },

  get<A>(this: Lifetime<any>, atom: Atom.Atom<A>): A {
    if (this.disposed) {
      return this.node.registry.get(atom)
    }
    return this.node.readTracked(atom, this)
  },

  result<A, E>(this: Lifetime<any>, atom: Atom.Atom<Result.AsyncResult<A, E>>, options?: {
    readonly suspendOnWaiting?: boolean | undefined
  }): Effect.Effect<A, E> {
    if (this.disposed || this.isFn) {
      return this.resultOnce(atom, options)
    }
    const result = this.get(atom)
    if (options?.suspendOnWaiting && result.waiting) {
      return Effect.never
    }
    switch (result._tag) {
      case "Initial": {
        return Effect.never
      }
      case "Failure": {
        return Exit.failCause(result.cause)
      }
      case "Success": {
        return Effect.succeed(result.value)
      }
    }
  },

  resultOnce<A, E>(this: Lifetime<any>, atom: Atom.Atom<Result.AsyncResult<A, E>>, options?: {
    readonly suspendOnWaiting?: boolean | undefined
  }): Effect.Effect<A, E> {
    return Effect.callback<A, E>((resume) => {
      const result = this.once(atom)
      if (result._tag !== "Initial" && !(options?.suspendOnWaiting && result.waiting)) {
        return resume(Result.toExit(result) as any)
      }
      const cancel = this.node.registry.subscribe(atom, (result) => {
        if (result._tag === "Initial" || (options?.suspendOnWaiting && result.waiting)) return
        cancel()
        resume(Result.toExit(result) as any)
      }, { immediate: false })
      return Effect.sync(cancel)
    })
  },

  setResult<A, E, W>(
    this: Lifetime<any>,
    atom: Atom.Writable<Result.AsyncResult<A, E>, W>,
    value: W
  ): Effect.Effect<A, E> {
    if (this.disposed) return Effect.never
    this.node.registry.set(atom, value)
    return this.resultOnce(atom, { suspendOnWaiting: true })
  },

  some<A>(this: Lifetime<any>, atom: Atom.Atom<Option.Option<A>>): Effect.Effect<A> {
    if (this.disposed || this.isFn) {
      return this.someOnce(atom)
    }
    const result = this.get(atom)
    return result._tag === "None" ? Effect.never : Effect.succeed(result.value)
  },

  someOnce<A>(this: Lifetime<any>, atom: Atom.Atom<Option.Option<A>>): Effect.Effect<A> {
    return Effect.callback<A>((resume) => {
      const result = this.once(atom)
      if (Option.isSome(result)) {
        return resume(Effect.succeed(result.value))
      }
      const cancel = this.node.registry.subscribe(atom, (result) => {
        if (Option.isNone(result)) return
        cancel()
        resume(Effect.succeed(result.value))
      }, { immediate: false })
      return Effect.sync(cancel)
    })
  },

  once<A>(this: Lifetime<any>, atom: Atom.Atom<A>): A {
    return this.node.registry.get(atom)
  },

  self<A>(this: Lifetime<any>): Option.Option<A> {
    if (this.disposed) return Option.none()
    return this.node.valueOption() as any
  },

  refresh<A>(this: Lifetime<any>, atom: Atom.Atom<A>): void {
    if (this.disposed) return
    this.node.registry.refresh(atom)
  },

  refreshSelf(this: Lifetime<any>): void {
    if (this.disposed) return
    this.node.invalidate()
  },

  mount<A>(this: Lifetime<any>, atom: Atom.Atom<A>): void {
    if (this.disposed) return
    this.addFinalizer(this.node.registry.mount(atom))
  },

  subscribe<A>(this: Lifetime<any>, atom: Atom.Atom<A>, f: (_: A) => void, options?: {
    readonly immediate?: boolean
  }): void {
    if (this.disposed) return
    this.addFinalizer(this.node.registry.subscribe(atom, f, options))
  },

  setSelf<A>(this: Lifetime<any>, a: A): void {
    if (this.disposed) return
    this.node.setValue(a as any)
  },

  set<R, W>(this: Lifetime<any>, atom: Atom.Writable<R, W>, value: W): void {
    if (this.disposed) return
    this.node.registry.set(atom, value)
  },

  stream<A>(this: Lifetime<any>, atom: Atom.Atom<A>, options?: {
    readonly withoutInitialValue?: boolean
  }) {
    if (this.disposed) return Stream.empty
    return Stream.callback<A>((queue) =>
      Effect.sync(() => {
        this.subscribe(atom, (value) => Queue.offerUnsafe(queue, value), {
          immediate: !options?.withoutInitialValue
        })
      })
    )
  },

  streamResult<A, E>(this: Lifetime<any>, atom: Atom.Atom<Result.AsyncResult<A, E>>, options?: {
    readonly withoutInitialValue?: boolean
    readonly bufferSize?: number
  }): Stream.Stream<A, E> {
    return this.stream(atom, options).pipe(
      Stream.filter(Result.isNotInitial),
      Stream.mapEffect((result) =>
        result._tag === "Success" ? Effect.succeed(result.value) : Effect.failCause(result.cause)
      )
    )
  },

  dispose(this: Lifetime<any>): void {
    this.disposed = true
    if (this.finalizers === undefined) {
      return
    }

    const finalizers = this.finalizers
    this.finalizers = undefined
    runAll(finalizers.reverse(), invoke)
  }
}

const makeLifetime = <A>(node: NodeImpl<A>): Lifetime<A> => {
  function get<A>(atom: Atom.Atom<A>): A {
    if (get.disposed || get.isFn) {
      return node.registry.get(atom)
    }
    return node.readTracked(atom, get as any)
  }
  Object.setPrototypeOf(get, LifetimeProto)
  get.isFn = false
  get.disposed = false
  get.finalizers = undefined
  get.node = node
  get.reads = new Set<NodeImpl<any>>()
  get.failure = noFailure
  return get as any
}

class WriteContextImpl<A> implements Atom.WriteContext<A> {
  constructor(
    registry: RegistryImpl,
    node: NodeImpl<A>
  ) {
    this.registry = registry
    this.node = node
  }
  readonly registry: RegistryImpl
  readonly node: NodeImpl<A>
  get<A>(atom: Atom.Atom<A>): A {
    return this.registry.get(atom)
  }
  set<R, W>(atom: Atom.Writable<R, W>, value: W) {
    return this.registry.set(atom, value)
  }
  setSelf(value: any) {
    return this.node.setValue(value)
  }
  refreshSelf() {
    return this.node.invalidate()
  }
}

// -----------------------------------------------------------------------------
// batching
// -----------------------------------------------------------------------------

/**
 * @internal
 */
export const BatchPhase = {
  disabled: 0,
  collect: 1,
  commit: 2
} as const

/**
 * @internal
 */
export type BatchPhase = typeof BatchPhase[keyof typeof BatchPhase]

/**
 * @internal
 */
export const batchState = {
  phase: BatchPhase.disabled as BatchPhase,
  depth: 0,
  stale: [] as Array<NodeImpl<any>>,
  notify: new Set<NodeImpl<any>>()
}

/**
 * @internal
 */
export function batch(f: () => void): void {
  const previousPhase = batchState.phase
  batchState.phase = BatchPhase.collect
  batchState.depth++
  let failure: unknown = noFailure
  try {
    f()
  } catch (error) {
    failure = error
  }
  if (batchState.depth === 1) {
    // what `f` changed before it failed is committed, so it is still rebuilt and heard
    const { notify, stale } = batchState
    let i = 0
    do {
      batchState.phase = BatchPhase.collect
      for (; i < stale.length; i++) {
        try {
          batchRebuildNode(stale[i])
        } catch (error) {
          if (failure === noFailure) failure = error
        }
      }
      batchState.phase = BatchPhase.commit
      for (const node of notify) {
        try {
          node.notify()
        } catch (error) {
          if (failure === noFailure) failure = error
        }
      }
    } while (i < stale.length)
    batchState.stale = []
    notify.clear()
  }
  batchState.depth--
  batchState.phase = previousPhase
  if (failure !== noFailure) throw failure
}

function batchRebuildNode(node: NodeImpl<any>) {
  if (node.state === NodeState.valid) {
    if (!node.invalidatedDuringBuild) {
      return
    }
    node.invalidatedDuringBuild = false
    node.state = NodeState.stale
    node.disposeLifetime()
  }
  node.value()
}
