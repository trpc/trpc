/**
 * Shares scoped resources across fibers.
 *
 * A `Pool<A, E>` acquires resource-backed values with a scoped effect, lets
 * fibers borrow them with `get`, can invalidate broken values, and releases all
 * acquired values when the pool scope closes. This module includes fixed-size
 * pools, pools that resize with a time-to-live policy, custom strategy pools,
 * per-item concurrency limits, and runtime state types used by pool strategies.
 *
 * @since 2.0.0
 */
import type * as Cause from "./Cause.ts"
import { Clock } from "./Clock.ts"
import * as Context from "./Context.ts"
import * as Duration from "./Duration.ts"
import * as Effect from "./Effect.ts"
import type * as Exit from "./Exit.ts"
import * as Fiber from "./Fiber.ts"
import { constant, dual, identity } from "./Function.ts"
import * as core from "./internal/core.ts"
import * as internal from "./internal/effect.ts"
import { type Pipeable, pipeArguments } from "./Pipeable.ts"
import { hasProperty } from "./Predicate.ts"
import * as Queue from "./Queue.ts"
import { UnhandledLogLevel } from "./References.ts"
import * as Scope from "./Scope.ts"
import * as Semaphore from "./Semaphore.ts"

const TypeId = "~effect/Pool"

const Acquire = Symbol()
const AcquireContext = Symbol()
const PoolClock = Symbol()

interface PoolImpl<A, E> extends Pool<A, E> {
  readonly [Acquire]: Effect.Effect<A, E, Scope.Scope>
  readonly [AcquireContext]: Context.Context<Scope.Scope>
  readonly [PoolClock]: Clock
}

/**
 * A `Pool<A, E>` is a pool of items of type `A`, each of which may be
 * associated with the acquisition and release of resources. An attempt to get
 * an item `A` from a pool may fail with an error of type `E`.
 *
 * **When to use**
 *
 * Use when you need to share a bounded set of scoped resources across fibers
 * while the pool manages acquisition, reuse, and release.
 *
 * @see {@link make} for creating a pool with size bounds
 * @see {@link makeWithTTL} for creating a pool with idle item expiration
 * @see {@link makeWithStrategy} for creating a pool with a custom strategy
 * @see {@link get} for acquiring an item from a pool
 * @see {@link invalidate} for removing a broken item from the pool
 *
 * @category models
 * @since 2.0.0
 */
export interface Pool<in out A, in out E = never> extends Pipeable {
  readonly [TypeId]: typeof TypeId
  readonly config: Config<A, E>
  readonly state: State<A, E>
}

/**
 * Normalized configuration used by a `Pool`.
 *
 * **When to use**
 *
 * Use as the normalized, read-only description of how a pool acquires, sizes,
 * shares, and resizes its items after construction.
 *
 * **Details**
 *
 * The config stores the acquire effect, size bounds, per-item concurrency,
 * target utilization, and resizing strategy used by the pool implementation.
 *
 * @see {@link Pool} for the value exposing this configuration
 * @see {@link State} for mutable runtime state instead of static configuration
 * @see {@link Strategy} for the resizing and reclamation contract stored on the config
 *
 * @category models
 * @since 4.0.0
 */
export interface Config<A, E> {
  readonly acquire: Effect.Effect<A, E, Scope.Scope>
  readonly concurrency: number
  readonly isFixed: boolean
  readonly minSize: number
  readonly maxSize: number
  readonly strategy: Strategy<A, E>
  readonly targetUtilization: number
}

/**
 * Mutable runtime state maintained by a `Pool`.
 *
 * **When to use**
 *
 * Use when you need to inspect or support the runtime state backing a `Pool`,
 * including its scope, item sets, semaphores, waiters, invalidation tracking,
 * and shutdown flag.
 *
 * **Details**
 *
 * This state is exposed for inspection and implementation support. User code
 * should prefer the high-level pool operations.
 *
 * @see {@link Pool} for the pool value exposing this state
 * @see {@link PoolItem} for the entries stored in the runtime item sets
 * @see {@link get} for acquiring items through the high-level API
 * @see {@link invalidate} for invalidating items through the high-level API
 *
 * @category models
 * @since 4.0.0
 */
export interface State<A, E> {
  readonly scope: Scope.Scope
  isShuttingDown: boolean
  usage: number
  readonly resizeSemaphore: Semaphore.Semaphore
  readonly items: Set<PoolItem<A, E>>
  availableHead: PoolItem<A, E> | undefined
  availableTail: PoolItem<A, E> | undefined
  readonly invalidated: Set<PoolItem<A, E>>
  readonly waiters: Set<(failure?: Exit.Failure<A, E>) => void>
}

/**
 * Internal record for a value managed by a `Pool`.
 *
 * **When to use**
 *
 * Use when implementing a custom pool `Strategy` that needs to inspect
 * acquired items, track reference counts, or return reclaimable items to the
 * pool.
 *
 * **Details**
 *
 * Each item stores the acquisition `Exit`, its finalizer, the current
 * reference count, when it last became idle, and whether automatic reclaiming
 * has been disabled because the item was invalidated.
 *
 * @see {@link Strategy} for the custom strategy callbacks that receive and return pool items
 * @see {@link State} for the runtime sets that store active, available, and invalidated pool items
 *
 * @category models
 * @since 4.0.0
 */
export interface PoolItem<A, E> {
  readonly exit: Exit.Exit<A, E>
  finalizer: Effect.Effect<void>
  refCount: number
  /** Clock time at which the item was acquired or its last borrower released it. */
  idleSince: number
  disableReclaim: boolean
  isAvailable: boolean
  availablePrevious: PoolItem<A, E> | undefined
  availableNext: PoolItem<A, E> | undefined
  release: (exit: Exit.Exit<any, any>) => Effect.Effect<void>
}

/**
 * Strategy used by a `Pool` to manage background resizing and item
 * reclamation.
 *
 * **When to use**
 *
 * Use when defining a custom pool lifecycle policy that needs to run background
 * work, observe acquired items, or choose items for reclamation.
 *
 * **Details**
 *
 * `run` starts any strategy-specific background work, `onAcquire` is invoked
 * when an item is acquired, and `reclaim` selects an item that can be removed
 * or replaced.
 *
 * @see {@link makeWithStrategy} for constructing a pool from a custom `Strategy`
 *
 * @category models
 * @since 4.0.0
 */
export interface Strategy<A, E> {
  readonly run: (pool: Pool<A, E>) => Effect.Effect<void>
  readonly onAcquire: (item: PoolItem<A, E>) => Effect.Effect<void>
  readonly reclaim: (pool: Pool<A, E>) => Effect.Effect<PoolItem<A, E> | undefined>
}

/**
 * Returns `true` if the specified value is a `Pool`, `false` otherwise.
 *
 * **When to use**
 *
 * Use to validate unknown values at runtime boundaries before treating them as
 * `Pool` values.
 *
 * **Details**
 *
 * This predicate narrows the input to `Pool<unknown, unknown>`.
 *
 * @category guards
 * @since 2.0.0
 */
export const isPool = (u: unknown): u is Pool<unknown, unknown> => hasProperty(u, TypeId)

/**
 * Makes a new pool of the specified fixed size.
 *
 * **When to use**
 *
 * Use when you need a fixed-size pool with no growth or shrinkage.
 *
 * **Details**
 *
 * The pool is returned in a `Scope`, which governs the lifetime of the pool.
 * When the pool is shutdown because the `Scope` is closed, the individual
 * items allocated by the pool will be released in some unspecified order.
 *
 * By setting the `concurrency` parameter, you can control the level of concurrent
 * access per pool item. By default, the number of permits is set to `1`.
 *
 * `targetUtilization` determines when to create new pool items. It is a value
 * between 0 and 1, where 1 means only create new pool items when all the existing
 * items are fully utilized.
 *
 * A `targetUtilization` of 0.5 will create new pool items when the existing items are
 * 50% utilized.
 *
 * @see {@link makeWithTTL} for pools with min/max sizes and a TTL-based shrinking policy
 * @see {@link makeWithStrategy} for pools with a custom resizing and reclamation strategy
 * @category constructors
 * @since 2.0.0
 */
export const make = <A, E, R>(options: {
  readonly acquire: Effect.Effect<A, E, R>
  readonly size: number
  readonly concurrency?: number | undefined
  readonly targetUtilization?: number | undefined
}): Effect.Effect<Pool<A, E>, never, R | Scope.Scope> =>
  makeWithStrategy({ ...options, min: options.size, max: options.size, strategy: strategyNoop })

/**
 * Creates a scoped pool with minimum and maximum sizes and a time-to-live
 * policy for shrinking unused excess items.
 *
 * **When to use**
 *
 * Use to create an elastic scoped pool that can grow up to a maximum size and
 * later reclaim unused excess items.
 *
 * **Details**
 *
 * The returned pool requires `Scope`; when that scope is closed, allocated
 * items are released in an unspecified order. `concurrency` controls how many
 * fibers may use each pool item at once and defaults to `1`.
 *
 * `targetUtilization` controls when new items are created and is clamped by the
 * pool implementation. A value of `1` waits until existing items are fully
 * utilized before creating more items.
 *
 * `timeToLiveStrategy` defaults to `"usage"`, which expires idle, unreserved
 * excess items after `timeToLive` since their last borrower released them
 * (or acquisition if never borrowed). It checks once per `timeToLive`, so
 * retirement can take up to twice that duration. `"creation"` measures from
 * item creation instead.
 *
 * **Example** (Creating a connection pool)
 *
 * ```ts import.meta.vitest
 * import { Duration, Effect, Pool } from "effect"
 *
 * interface Connection {
 *   readonly execute: (sql: string) => Effect.Effect<ReadonlyArray<string>>
 *   readonly close: Effect.Effect<void>
 * }
 *
 * const acquireDBConnection = Effect.acquireRelease(
 *   Effect.succeed({
 *     execute: (sql) => Effect.succeed([`executed: ${sql}`]),
 *     close: Effect.void
 *   } satisfies Connection),
 *   (connection) => connection.close
 * )
 *
 * const program = Effect.scoped(
 *   Effect.flatMap(
 *     Pool.makeWithTTL({
 *       acquire: acquireDBConnection,
 *       min: 10,
 *       max: 20,
 *       timeToLive: Duration.seconds(60)
 *     }),
 *     (pool) => Effect.flatMap(Pool.get(pool), (connection) => connection.execute("select 1"))
 *   )
 * )
 *
 * await Effect.runPromise(program) // => ["executed: select 1"]
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const makeWithTTL = <A, E, R>(options: {
  readonly acquire: Effect.Effect<A, E, R>
  readonly min: number
  readonly max: number
  readonly concurrency?: number | undefined
  readonly targetUtilization?: number | undefined
  readonly timeToLive: Duration.Input
  readonly timeToLiveStrategy?: "creation" | "usage" | undefined
}): Effect.Effect<Pool<A, E>, never, R | Scope.Scope> =>
  Effect.flatMap(
    options.timeToLiveStrategy === "creation" ?
      strategyCreationTTL<A, E>(options.timeToLive) :
      strategyUsageTTL<A, E>(options.timeToLive),
    (strategy) => makeWithStrategy({ ...options, strategy })
  )

/**
 * Creates a scoped pool using a custom resizing and reclamation strategy.
 *
 * **When to use**
 *
 * Use to build a pool whose item lifecycle is controlled by an explicit
 * `Strategy`, such as custom background resizing, replacement, or reclamation.
 *
 * **Details**
 *
 * The returned pool requires `Scope`; closing the scope shuts down the pool and
 * releases allocated items.
 *
 * @see {@link make} for fixed-size pools without custom resizing or reclamation
 * @see {@link makeWithTTL} for min/max pools that shrink excess items with a TTL policy
 * @see {@link Strategy} for the custom strategy contract consumed by this constructor
 *
 * @category constructors
 * @since 4.0.0
 */
export const makeWithStrategy = <A, E, R>(options: {
  readonly acquire: Effect.Effect<A, E, R>
  readonly min: number
  readonly max: number
  readonly concurrency?: number | undefined
  readonly targetUtilization?: number | undefined
  readonly strategy: Strategy<A, E>
}): Effect.Effect<Pool<A, E>, never, Scope.Scope | R> =>
  Effect.uninterruptibleMask(Effect.fnUntraced(function*(restore) {
    const services = yield* Effect.context<R | Scope.Scope>()
    const scope = Context.get(services, Scope.Scope)
    const acquire = Effect.updateContext(
      options.acquire,
      (input) => Context.merge(services, input)
    ) as Effect.Effect<A, E, Scope.Scope>
    const concurrency = options.concurrency ?? 1

    const config: Config<A, E> = {
      acquire,
      concurrency,
      isFixed: options.min === options.max,
      minSize: options.min,
      maxSize: options.max,
      strategy: options.strategy,
      targetUtilization: Math.min(Math.max(options.targetUtilization ?? 1, 0.1), 1)
    }
    const state: State<A, E> = {
      scope,
      isShuttingDown: false,
      usage: 0,
      resizeSemaphore: Semaphore.makeUnsafe(1),
      items: new Set(),
      availableHead: undefined,
      availableTail: undefined,
      invalidated: new Set(),
      waiters: new Set()
    }
    const self: PoolImpl<A, E> = {
      [TypeId]: TypeId,
      [Acquire]: options.acquire as Effect.Effect<A, E, Scope.Scope>,
      [AcquireContext]: services as Context.Context<Scope.Scope>,
      [PoolClock]: yield* Clock,
      config,
      state,
      pipe() {
        return pipeArguments(this, arguments)
      }
    }
    yield* Scope.addFinalizer(scope, shutdown(self))
    if (config.minSize > 0) {
      yield* Effect.tap(
        Effect.forkDetach(restore(resize(self)), { startImmediately: true }),
        (fiber) => Scope.addFinalizer(scope, Fiber.interrupt(fiber))
      )
    }
    if (options.strategy !== strategyNoop) {
      yield* Effect.tap(
        Effect.forkDetach(restore(options.strategy.run(self))),
        (fiber) => Scope.addFinalizer(scope, Fiber.interrupt(fiber))
      )
    }
    return self
  }))

const shutdown = Effect.fnUntraced(function*<A, E>(self: Pool<A, E>) {
  if (self.state.isShuttingDown) return
  self.state.isShuttingDown = true
  const size = self.state.items.size
  const semaphore = Semaphore.makeUnsafe(size)
  for (const item of self.state.items) {
    if (item.refCount > 0) {
      item.finalizer = Effect.tap(item.finalizer, semaphore.release(1))
      self.state.invalidated.add(item)
      yield* semaphore.take(1)
    } else {
      self.state.items.delete(item)
      removeAvailable(self, item)
      self.state.invalidated.delete(item)
      yield* item.finalizer
    }
  }
  yield* semaphore.releaseAll
  if (self.state.waiters.size > 0) {
    const waiters = Array.from(self.state.waiters)
    self.state.waiters.clear()
    for (const notify of waiters) notify()
  }
  yield* semaphore.take(size)
})

/**
 * Retrieves an item from the pool in a scoped effect.
 *
 * **When to use**
 *
 * Use to borrow a pooled resource for the lifetime of the current scope so it
 * is automatically returned when that scope closes.
 *
 * **Details**
 *
 * The returned effect waits for an available item when the pool is at capacity.
 * If acquiring a new item fails, the effect fails with the acquisition error.
 *
 * **Gotchas**
 *
 * Retrying a failed `get` can repeat the acquisition attempt.
 *
 * @see {@link invalidate} for removing an unhealthy item from future reuse
 *
 * @category getters
 * @since 2.0.0
 */
export const get = <A, E>(self: Pool<A, E>): Effect.Effect<A, E, Scope.Scope> =>
  core.withFiber((fiber) => {
    const state = self.state
    if (state.isShuttingDown) return internal.interrupt
    if (state.availableHead?.exit._tag === "Success") {
      state.usage++
      if (self.config.isFixed || targetSize(self) <= activeSize(self)) {
        return leaseItem(self, state.availableHead, fiber)
      }
      state.usage--
    }
    return getSlowWith(self, leaseItemWith)
  })

/**
 * Borrows an item while an effect runs and returns it when the effect exits.
 *
 * **When to use**
 *
 * Use when an item is needed by one effect. Unlike `Effect.scoped` with
 * {@link get}, this avoids allocating a scope and registering a finalizer.
 *
 * **Example** (Running a single operation with a pooled item)
 *
 * ```ts import.meta.vitest
 * import { Effect, Pool } from "effect"
 *
 * const program = Effect.scoped(
 *   Effect.flatMap(
 *     Pool.make({ acquire: Effect.succeed("resource"), size: 2 }),
 *     (pool) => Pool.use(pool, (item) => Effect.succeed(item.length))
 *   )
 * )
 *
 * await Effect.runPromise(program) // => 8
 * ```
 *
 * @see {@link get} for borrowing an item for the lifetime of a scope
 *
 * @category combinators
 * @since 4.0.0
 */
export const use: {
  <A, B, E2, R2>(
    f: (item: A) => Effect.Effect<B, E2, R2>
  ): <E>(self: Pool<A, E>) => Effect.Effect<B, E | E2, R2>
  <A, E, B, E2, R2>(
    self: Pool<A, E>,
    f: (item: A) => Effect.Effect<B, E2, R2>
  ): Effect.Effect<B, E | E2, R2>
} = dual(2, <A, E, B, E2, R2>(
  self: Pool<A, E>,
  f: (item: A) => Effect.Effect<B, E2, R2>
): Effect.Effect<B, E | E2, R2> =>
  core.withFiber((fiber) => {
    const state = self.state
    if (state.isShuttingDown) return internal.interrupt
    if (state.availableHead?.exit._tag === "Success") {
      state.usage++
      if (self.config.isFixed || targetSize(self) <= activeSize(self)) {
        return useItem(self, state.availableHead, f, fiber)
      }
      state.usage--
    }
    return getSlowWith(self, (self, item, fiber, restore) => useItem(self, item, f, fiber, restore))
  }))

// Count the lease and install its release in the same step.
const useItem = <A, E, B, E2, R2>(
  self: Pool<A, E>,
  item: PoolItem<A, E>,
  f: (item: A) => Effect.Effect<B, E2, R2>,
  fiber: Fiber.Fiber<unknown, unknown>,
  restore?: <AX, EX, RX>(effect: Effect.Effect<AX, EX, RX>) => Effect.Effect<AX, EX, RX>
): Effect.Effect<B, E | E2, R2> => {
  leaseItemBookkeeping(self, item)
  internal.onExitUnsafe(fiber, item.release)
  let body: Effect.Effect<B, E2, R2>
  try {
    body = f((item.exit as Exit.Success<A, E>).value)
  } catch (defect) {
    return core.exitDie(defect)
  }
  return restore !== undefined ? restore(body) : body
}

const getSlowWith = <A, E, X, R>(
  self: Pool<A, E>,
  lease: (
    self: Pool<A, E>,
    item: PoolItem<A, E>,
    fiber: Fiber.Fiber<unknown, unknown>,
    restore: <AX, EX, RX>(effect: Effect.Effect<AX, EX, RX>) => Effect.Effect<AX, EX, RX>
  ) => Effect.Effect<X, any, R>
): Effect.Effect<X, any, R> =>
  internal.uninterruptibleMask((restore) => {
    const state = self.state
    state.usage++
    const wait: Effect.Effect<X, any, R> = internal.flatMap(
      internal.onError(
        restore(waitForItem(self)),
        () =>
          internal.sync(() => {
            state.usage--
          })
      ),
      () => loop
    )
    const step: Effect.Effect<X, any, R> = core.withFiber((fiber) => {
      if (state.isShuttingDown) {
        state.usage--
        return internal.interrupt
      }
      // Replace failed slots only when the pool cannot grow.
      const item = firstHealthyAvailable(self) ??
        (targetSize(self) <= activeSize(self) ? state.availableHead : undefined)
      if (item === undefined) {
        return wait
      }
      if (item.exit._tag === "Failure") {
        removeFailedItem(self, item)
        return loop
      }
      return lease(self, item, fiber, restore)
    })
    const loop: Effect.Effect<X, any, R> = internal.suspend(() => {
      if (state.isShuttingDown) {
        state.usage--
        return internal.interrupt
      }
      return targetSize(self) > activeSize(self)
        ? internal.flatMap(
          state.resizeSemaphore.withPermitsIfAvailable(1)(
            Effect.forkIn(Effect.interruptible(resize(self)), state.scope)
          ),
          () => step
        )
        : step
    })
    return loop
  })

const leaseItemBookkeeping = <A, E>(self: Pool<A, E>, item: PoolItem<A, E>): void => {
  item.refCount++
  if (item.refCount >= self.config.concurrency) {
    removeAvailable(self, item)
  }
}

const removeFailedItem = <A, E>(self: Pool<A, E>, item: PoolItem<A, E>): void => {
  self.state.items.delete(item)
  self.state.invalidated.delete(item)
  removeAvailable(self, item)
}

const leaseItem = <A, E>(
  self: Pool<A, E>,
  item: PoolItem<A, E>,
  fiber: Fiber.Fiber<unknown, unknown>
): Effect.Effect<A, E> => {
  leaseItemBookkeeping(self, item)
  const scope = Context.getUnsafe(fiber.context, Scope.Scope)
  if (scope.state._tag === "Closed") {
    internal.onExitUnsafe(fiber, item.release)
  } else {
    internal.scopeAddFinalizerUnsafe(scope, {}, item.release)
  }
  return item.exit
}

const leaseItemWith = <A, E>(
  self: Pool<A, E>,
  item: PoolItem<A, E>,
  fiber: Fiber.Fiber<unknown, unknown>
): Effect.Effect<A, E, Scope.Scope> => leaseItem(self, item, fiber)

const releaseItem = <A, E>(self: Pool<A, E>, item: PoolItem<A, E>): Effect.Effect<void> =>
  core.withFiber((fiber) => {
    const state = self.state
    item.refCount--
    state.usage--
    if (item.refCount === 0) {
      item.idleSince = (self as PoolImpl<A, E>)[PoolClock].currentTimeMillisUnsafe()
    }
    if (state.invalidated.has(item)) {
      return invalidatePoolItem(self, item)
    }
    // Every release frees one slot, so it can admit one waiter. Reacting only
    // to the saturated-to-unsaturated transition strands the rest: several
    // leases returning at once would wake a single waiter and leave the others
    // asleep against an item that has capacity for them. `addAvailable` is
    // idempotent, so re-adding an available item is free.
    if (item.refCount < self.config.concurrency) {
      addAvailableFront(self, item)
      wakeWaiters(self, fiber, 1)
    }
    return internal.void
  })

const firstHealthyAvailable = <A, E>(self: Pool<A, E>): PoolItem<A, E> | undefined => {
  let item = self.state.availableHead
  while (item !== undefined && item.exit._tag === "Failure") item = item.availableNext
  return item
}

const waitForItem = <A, E>(self: Pool<A, E>): Effect.Effect<void, E> =>
  internal.callback((resume) => {
    const state = self.state
    if (firstHealthyAvailable(self) !== undefined || state.isShuttingDown) {
      return resume(internal.void)
    }
    const observer = (failure?: Exit.Failure<A, E>) => {
      state.waiters.delete(observer)
      resume(failure ?? internal.void)
    }
    state.waiters.add(observer)
    return internal.sync(() => {
      state.waiters.delete(observer)
    })
  })

const wakeWaiters = <A, E>(self: Pool<A, E>, fiber: Fiber.Fiber<unknown, unknown>, count: number) => {
  const waiters = self.state.waiters
  if (waiters.size === 0) return
  fiber.currentDispatcher.scheduleTask(() => {
    let remaining = count
    const toWake: Array<(failure?: Exit.Failure<A, E>) => void> = []
    for (const notify of waiters) {
      if (remaining-- <= 0) break
      toWake.push(notify)
    }
    for (let i = 0; i < toWake.length; i++) {
      toWake[i]()
    }
  }, 0)
}

const wakeAll = <A, E>(self: Pool<A, E>): Effect.Effect<void> =>
  core.withFiber((fiber) => {
    wakeWaiters(self, fiber, Number.POSITIVE_INFINITY)
    return internal.void
  })

// Reservations prevent reuse without extending the lifetime of borrowed items.
const reservations = new WeakMap<PoolItem<unknown, unknown>, number>()

/** Adds a freshly acquired item, which has no use behind it, at the back. */
const addAvailable = <A, E>(self: Pool<A, E>, item: PoolItem<A, E>): void => {
  if (item.isAvailable || reservations.has(item)) return
  item.isAvailable = true
  item.availablePrevious = self.state.availableTail
  item.availableNext = undefined
  if (self.state.availableTail !== undefined) {
    self.state.availableTail.availableNext = item
  } else {
    self.state.availableHead = item
  }
  self.state.availableTail = item
}

/**
 * Returns a released item at the front, so the next borrow gets the one used
 * most recently. Borrowers take from the front, so the list runs warmest
 * first.
 *
 * Sending it to the back instead spreads a sequence of borrows evenly over
 * every item the pool has open. For a pool of connections that means none of
 * them is ever the hot one - each borrow lands on a peer that has been sitting
 * idle, losing whatever warmth it had - and it means `timeToLive` never
 * reclaims anything, because a pool that grew for one burst keeps every item
 * equally fresh forever. Under saturation the two orders agree, since every
 * item is checked out either way.
 */
const addAvailableFront = <A, E>(self: Pool<A, E>, item: PoolItem<A, E>): void => {
  if (item.isAvailable || reservations.has(item)) return
  item.isAvailable = true
  item.availablePrevious = undefined
  item.availableNext = self.state.availableHead
  if (self.state.availableHead !== undefined) {
    self.state.availableHead.availablePrevious = item
  } else {
    self.state.availableTail = item
  }
  self.state.availableHead = item
}

const removeAvailable = <A, E>(self: Pool<A, E>, item: PoolItem<A, E>): void => {
  if (!item.isAvailable) return
  item.isAvailable = false
  if (item.availablePrevious !== undefined) {
    item.availablePrevious.availableNext = item.availableNext
  } else {
    self.state.availableHead = item.availableNext
  }
  if (item.availableNext !== undefined) {
    item.availableNext.availablePrevious = item.availablePrevious
  } else {
    self.state.availableTail = item.availablePrevious
  }
  item.availablePrevious = undefined
  item.availableNext = undefined
}

/**
 * Invalidates the specified item so the pool can remove it and reallocate the
 * item, lazily if needed.
 *
 * **When to use**
 *
 * Use to prevent a pooled item from being reused after it becomes unsuitable,
 * such as a stale connection or a resource that failed a health check.
 *
 * **Gotchas**
 *
 * The item is matched with strict equality. Passing an equivalent but different
 * object instance does nothing.
 *
 * @see {@link get} for retrieving scoped items from the pool
 *
 * @category combinators
 * @since 2.0.0
 */
export const invalidate: {
  <A>(item: A): <E>(self: Pool<A, E>) => Effect.Effect<void>
  <A, E>(self: Pool<A, E>, item: A): Effect.Effect<void>
} = dual(2, <A, E>(self: Pool<A, E>, item: A): Effect.Effect<void> =>
  Effect.suspend(() => {
    if (self.state.isShuttingDown) return Effect.void
    for (const poolItem of self.state.items) {
      if (poolItem.exit._tag === "Success" && poolItem.exit.value === item) {
        poolItem.disableReclaim = true
        return Effect.uninterruptible(invalidatePoolItem(self, poolItem))
      }
    }
    return Effect.void
  }))

/**
 * Reserves a leased item for exclusive use until the scope closes. This
 * removes the item's remaining capacity from the pool but does not wait
 * for existing leases to finish. It has no effect when per-item concurrency is
 * `1` or the pool does not contain the item.
 *
 * @see {@link get} for acquiring an item
 *
 * @category combinators
 * @since 4.0.0
 */
export const reserve: {
  <A>(item: A): <E>(self: Pool<A, E>) => Effect.Effect<void, never, Scope.Scope>
  <A, E>(self: Pool<A, E>, item: A): Effect.Effect<void, never, Scope.Scope>
} = dual(
  2,
  <A, E>(self: Pool<A, E>, item: A): Effect.Effect<void, never, Scope.Scope> =>
    Effect.asVoid(Effect.acquireRelease(
      Effect.sync(() => {
        if (self.config.concurrency === 1) return undefined
        for (const poolItem of self.state.items) {
          if (poolItem.exit._tag !== "Success" || poolItem.exit.value !== item) continue
          const existing = reservations.get(poolItem)
          if (existing === undefined) self.state.usage += self.config.concurrency - 1
          reservations.set(poolItem, (existing ?? 0) + 1)
          removeAvailable(self, poolItem)
          return poolItem
        }
        return undefined
      }),
      (poolItem) =>
        core.withFiber((fiber) => {
          if (poolItem === undefined) return internal.void
          const remaining = (reservations.get(poolItem) ?? 1) - 1
          if (remaining > 0) {
            reservations.set(poolItem, remaining)
            return internal.void
          }
          reservations.delete(poolItem)
          self.state.usage -= self.config.concurrency - 1
          if (
            !self.state.isShuttingDown &&
            self.state.items.has(poolItem) &&
            !self.state.invalidated.has(poolItem) &&
            poolItem.refCount < self.config.concurrency
          ) {
            addAvailableFront(self, poolItem)
            wakeWaiters(self, fiber, self.config.concurrency - poolItem.refCount)
          }
          return internal.void
        })
    ))
)

const invalidatePoolItem = <A, E>(self: Pool<A, E>, poolItem: PoolItem<A, E>): Effect.Effect<void> =>
  Effect.suspend(() => {
    if (!self.state.items.has(poolItem)) {
      return Effect.void
    } else if (poolItem.refCount === 0) {
      self.state.items.delete(poolItem)
      removeAvailable(self, poolItem)
      self.state.invalidated.delete(poolItem)
      return Effect.asVoid(Effect.flatMap(
        poolItem.finalizer,
        () => Effect.forkIn(Effect.interruptible(resize(self)), self.state.scope, { startImmediately: true })
      ))
    }
    self.state.invalidated.add(poolItem)
    removeAvailable(self, poolItem)
    // An invalidated item stops counting towards the pool's active size, so the
    // pool is now below target and has to top itself back up. Waiting for the
    // last lease to be returned would strand anybody already queued: the item
    // they are waiting for is never coming back.
    return Effect.asVoid(
      Effect.forkIn(Effect.interruptible(resize(self)), self.state.scope, { startImmediately: true })
    )
  })

const resize = <A, E>(self: Pool<A, E>): Effect.Effect<void> =>
  self.state.resizeSemaphore.withPermits(1)(resizeLoop(self))

const resizeLoop = <A, E>(self: Pool<A, E>): Effect.Effect<void> =>
  Effect.suspend(() => {
    const active = activeSize(self)
    const target = targetSize(self)
    if (active >= target) {
      return Effect.void
    }
    const toAcquire = target - active
    const acquireOne = self.config.strategy === strategyNoop
      ? allocate(self)
      : Effect.flatMap(
        self.config.strategy.reclaim(self),
        (item) => item ? Effect.succeed(item) : allocate(self)
      )
    if (toAcquire === 1) {
      const acquired = Effect.tap(acquireOne, wakeAll(self))
      return self.config.isFixed
        ? Effect.asVoid(acquired)
        : Effect.flatMap(acquired, (item) => item.exit._tag === "Failure" ? Effect.void : resizeLoop(self))
    }
    const acquired = acquireOne.pipe(
      Effect.replicateEffect(toAcquire, { concurrency: toAcquire }),
      Effect.tap(wakeAll(self))
    )
    return self.config.isFixed
      ? Effect.asVoid(acquired)
      : Effect.flatMap(
        acquired,
        (items) => items.some((_) => _.exit._tag === "Failure") ? Effect.void : resizeLoop(self)
      )
  })

const allocate = <A, E>(self: Pool<A, E>): Effect.Effect<PoolItem<A, E>> =>
  internal.uninterruptibleMask((restore) =>
    core.withFiber((fiber) => {
      const impl = self as PoolImpl<A, E>
      const scope = internal.scopeMakeUnsafe()
      const previousContext = fiber.context
      fiber.setContext(Context.add(impl[AcquireContext], Scope.Scope, scope))
      const use = Effect.flatMap(Effect.exit(impl[Acquire]), (exit) => {
        const item: PoolItem<A, E> = {
          exit,
          finalizer: Effect.catchCause(Scope.close(scope, exit), reportUnhandledError),
          refCount: 0,
          idleSince: impl[PoolClock].currentTimeMillisUnsafe(),
          disableReclaim: false,
          isAvailable: false,
          availablePrevious: undefined,
          availableNext: undefined,
          release: undefined as any
        }
        item.release = constant(releaseItem(self, item))
        const onAcquire = Effect.suspend(() =>
          // A borrower may have removed the item before the callback runs.
          self.state.items.has(item) ? self.config.strategy.onAcquire(item) : Effect.void
        )
        if (exit._tag === "Success") {
          self.state.items.add(item)
          addAvailable(self, item)
          return self.config.strategy === strategyNoop ? Effect.succeed(item) : Effect.as(onAcquire, item)
        }
        // Deliver a waiting borrower its own failure; otherwise retain the slot.
        const waiter = firstHealthyAvailable(self) === undefined ? self.state.waiters.values().next().value : undefined
        if (waiter !== undefined) {
          waiter(exit)
        } else {
          self.state.items.add(item)
          addAvailable(self, item)
        }
        // Do not let cleanup delay a replacement acquisition.
        return Effect.as(
          Effect.forkIn(Effect.andThen(item.finalizer, onAcquire), self.state.scope, { startImmediately: true }),
          item
        )
      })
      return internal.onExitPrimitive(
        restore(use) as Effect.Effect<PoolItem<A, E>>,
        (exit) => {
          fiber.setContext(previousContext)
          return exit._tag === "Failure" ? internal.scopeCloseUnsafe(scope, exit) : undefined
        },
        true
      )
    })
  )

const targetSize = <A, E>(self: Pool<A, E>) => {
  if (self.state.isShuttingDown) return 0
  if (self.config.isFixed) return self.config.minSize
  const utilization = self.state.usage / self.config.targetUtilization
  const target = Math.ceil(utilization / self.config.concurrency)
  return Math.min(Math.max(self.config.minSize, target), self.config.maxSize)
}

const activeSize = <A, E>(self: Pool<A, E>) => {
  return self.state.items.size - self.state.invalidated.size
}

// -----------------------------------------------------------------------------
// Strategy
// -----------------------------------------------------------------------------

const strategyNoop: Strategy<any, any> = {
  run: (_) => Effect.void,
  onAcquire: (_) => Effect.void,
  reclaim: (_) => Effect.undefined
}

const strategyCreationTTL = Effect.fnUntraced(function*<A, E>(ttl: Duration.Input) {
  const clock = yield* Clock
  const queue = yield* Queue.unbounded<PoolItem<A, E>>()
  const ttlMillis = Duration.toMillis(Duration.fromInputUnsafe(ttl))
  const creationTimes = new WeakMap<PoolItem<A, E>, number>()
  return identity<Strategy<A, E>>({
    run: (pool) => {
      const process = (item: PoolItem<A, E>): Effect.Effect<void> =>
        Effect.suspend(() => {
          if (!pool.state.items.has(item) || pool.state.invalidated.has(item)) {
            return Effect.void
          }
          const now = clock.currentTimeMillisUnsafe()
          const created = creationTimes.get(item)!
          const remaining = ttlMillis - (now - created)
          return remaining > 0
            ? Effect.delay(process(item), remaining)
            : invalidatePoolItem(pool, item)
        })
      return Queue.take(queue).pipe(
        Effect.tap(process),
        Effect.forever({ disableYield: true })
      )
    },
    onAcquire: (item) =>
      Effect.suspend(() => {
        creationTimes.set(item, clock.currentTimeMillisUnsafe())
        return Queue.offer(queue, item)
      }),
    reclaim: (_) => Effect.undefined
  })
})

const strategyUsageTTL = Effect.fnUntraced(function*<A, E>(ttl: Duration.Input) {
  const clock = yield* Clock
  const ttlMillis = Duration.toMillis(Duration.fromInputUnsafe(ttl))
  return identity<Strategy<A, E>>({
    run: (pool) => {
      const process: Effect.Effect<void> = Effect.suspend(() => {
        if (activeSize(pool) <= targetSize(pool)) return Effect.void
        const expired = clock.currentTimeMillisUnsafe() - ttlMillis
        let oldest: PoolItem<A, E> | undefined
        for (const item of pool.state.items) {
          if (item.refCount > 0 || item.idleSince > expired) continue
          if (pool.state.invalidated.has(item) || reservations.has(item)) continue
          if (oldest === undefined || item.idleSince < oldest.idleSince) oldest = item
        }
        return oldest === undefined ? Effect.void : Effect.flatMap(invalidatePoolItem(pool, oldest), () => process)
      })
      return process.pipe(
        Effect.delay(ttl),
        Effect.forever({ disableYield: true })
      )
    },
    onAcquire: (_) => Effect.void,
    reclaim: (_) => Effect.undefined
  })
})

const reportUnhandledError = <E>(cause: Cause.Cause<E>) =>
  Effect.withFiber<void>((fiber) => {
    const unhandledLogLevel = fiber.getRef(UnhandledLogLevel)
    if (unhandledLogLevel) {
      return Effect.logWithLevel(unhandledLogLevel)(
        "Unhandled error in pool finalizer",
        cause
      )
    }
    return Effect.void
  })
