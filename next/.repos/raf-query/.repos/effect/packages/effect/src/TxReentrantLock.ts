/**
 * Coordinates shared access inside transactions with read and write locks.
 *
 * A `TxReentrantLock` lets many fibers hold read locks at the same time, or one
 * fiber hold a write lock for exclusive access. Lock ownership is tracked by
 * fiber, so a fiber that already holds the lock can acquire it again and later
 * release each acquisition. Attempts that cannot proceed retry transactionally
 * until the lock becomes available. This module includes manual, scoped, and
 * wrapper-style operations for read and write locking.
 *
 * @since 4.0.0
 */
import * as Effect from "./Effect.ts"
import * as HashMap from "./HashMap.ts"
import type { Inspectable } from "./Inspectable.ts"
import { NodeInspectSymbol, toJson } from "./Inspectable.ts"
import * as Option from "./Option.ts"
import type { Pipeable } from "./Pipeable.ts"
import { pipeArguments } from "./Pipeable.ts"
import { hasProperty } from "./Predicate.ts"
import type * as Scope from "./Scope.ts"
import * as TxRef from "./TxRef.ts"

const TypeId = "~effect/TxReentrantLock"

/**
 * @category models
 * @since 4.0.0
 */
interface LockState {
  readonly readers: HashMap.HashMap<number, number>
  readonly writer: Option.Option<readonly [fiberId: number, count: number]>
}

const emptyState: LockState = {
  readers: HashMap.empty<number, number>(),
  writer: Option.none()
}

/**
 * A TxReentrantLock provides a transactional read/write lock with reentrant semantics.
 * Multiple readers can hold the lock concurrently, or a single writer can hold exclusive
 * access. A fiber holding the write lock may acquire additional read/write locks (reentrancy).
 *
 * **Example** (Using read and write locks)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxReentrantLock } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const lock = yield* TxReentrantLock.make()
 *
 *   // Multiple readers can proceed concurrently
 *   const read = yield* TxReentrantLock.withReadLock(lock, Effect.succeed("reading"))
 *
 *   // Writer gets exclusive access
 *   const write = yield* TxReentrantLock.withWriteLock(lock, Effect.succeed("writing"))
 *   return [read, write]
 * })
 *
 * await Effect.runPromise(program) // => ["reading", "writing"]
 * ```
 *
 * @category models
 * @since 4.0.0
 */
export interface TxReentrantLock extends Inspectable, Pipeable {
  readonly [TypeId]: typeof TypeId
  /** @internal */
  readonly stateRef: TxRef.TxRef<LockState>
}

const TxReentrantLockProto: Omit<TxReentrantLock, typeof TypeId | "stateRef"> = {
  [NodeInspectSymbol](this: TxReentrantLock) {
    return toJson(this)
  },
  toJSON(this: TxReentrantLock) {
    return { _id: "TxReentrantLock" }
  },
  toString() {
    return "TxReentrantLock"
  },
  pipe() {
    return pipeArguments(this, arguments)
  }
}

// =============================================================================
// Constructors
// =============================================================================

/**
 * Creates a new TxReentrantLock.
 *
 * **Example** (Creating a reentrant lock)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxReentrantLock } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const lock = yield* TxReentrantLock.make()
 *   return yield* TxReentrantLock.locked(lock)
 * })
 *
 * await Effect.runPromise(program) // => false
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const make = (): Effect.Effect<TxReentrantLock> =>
  Effect.gen(function*() {
    const stateRef = yield* TxRef.make<LockState>(emptyState)
    const self = Object.create(TxReentrantLockProto)
    self[TypeId] = TypeId
    self.stateRef = stateRef
    return self
  }).pipe(Effect.tx)

// =============================================================================
// Mutations
// =============================================================================

/**
 * Acquires a read lock. Blocks if another fiber holds the write lock.
 * If the current fiber already holds the write lock, the read lock is granted (reentrancy).
 * Returns the current number of read locks held by this fiber.
 *
 * **Example** (Acquiring a read lock)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxReentrantLock } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const lock = yield* TxReentrantLock.make()
 *   const count = yield* TxReentrantLock.acquireRead(lock)
 *   yield* TxReentrantLock.releaseRead(lock)
 *   return count
 * })
 *
 * await Effect.runPromise(program) // => 1
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const acquireRead = (self: TxReentrantLock): Effect.Effect<number> =>
  Effect.withFiber((fiber) =>
    Effect.gen(function*() {
      const state = yield* TxRef.get(self.stateRef)
      const fiberId = fiber.id

      // If another fiber holds the write lock, retry
      if (Option.isSome(state.writer) && state.writer.value[0] !== fiberId) {
        return yield* Effect.txRetry
      }

      // Grant read lock
      const currentCount = Option.getOrElse(HashMap.get(state.readers, fiberId), () => 0)
      const newCount = currentCount + 1
      yield* TxRef.set(self.stateRef, {
        ...state,
        readers: HashMap.set(state.readers, fiberId, newCount)
      })
      return newCount
    }).pipe(Effect.tx)
  )

/**
 * Acquires the write lock for the current fiber.
 *
 * **When to use**
 *
 * Use to enter an exclusive section manually when `withWriteLock` is not the
 * right shape.
 *
 * **Details**
 *
 * Blocks if any other fiber holds a read or write lock. If the current fiber
 * already holds the write lock, the count is incremented. If the current fiber
 * holds a read lock, the write lock is granted as an upgrade.
 *
 * Returns the current number of write locks held by this fiber.
 *
 * **Example** (Acquiring a write lock)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxReentrantLock } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const lock = yield* TxReentrantLock.make()
 *   const count = yield* TxReentrantLock.acquireWrite(lock)
 *   yield* TxReentrantLock.releaseWrite(lock)
 *   return count
 * })
 *
 * await Effect.runPromise(program) // => 1
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const acquireWrite = (self: TxReentrantLock): Effect.Effect<number> =>
  Effect.withFiber((fiber) =>
    Effect.gen(function*() {
      const state = yield* TxRef.get(self.stateRef)
      const fiberId = fiber.id

      // If another fiber holds the write lock, retry
      if (Option.isSome(state.writer) && state.writer.value[0] !== fiberId) {
        return yield* Effect.txRetry
      }

      // If other fibers hold read locks, retry
      for (const [readerId] of state.readers) {
        if (readerId !== fiberId && Option.getOrElse(HashMap.get(state.readers, readerId), () => 0) > 0) {
          return yield* Effect.txRetry
        }
      }

      // Grant write lock
      if (Option.isSome(state.writer)) {
        // Reentrant: increment write count
        const newCount = state.writer.value[1] + 1
        yield* TxRef.set(self.stateRef, {
          ...state,
          writer: Option.some([fiberId, newCount] as const)
        })
        return newCount
      }

      // First write lock acquisition
      yield* TxRef.set(self.stateRef, {
        ...state,
        writer: Option.some([fiberId, 1] as const)
      })
      return 1
    }).pipe(Effect.tx)
  )

/**
 * Releases one read lock held by the current fiber.
 *
 * **When to use**
 *
 * Use to leave a manually acquired read lock.
 *
 * **Details**
 *
 * Returns the remaining number of read locks held by this fiber.
 *
 * **Example** (Releasing a read lock)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxReentrantLock } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const lock = yield* TxReentrantLock.make()
 *   yield* TxReentrantLock.acquireRead(lock)
 *   return yield* TxReentrantLock.releaseRead(lock)
 * })
 *
 * await Effect.runPromise(program) // => 0
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
const releaseReadFor = (self: TxReentrantLock, fiberId: number): Effect.Effect<number> =>
  Effect.gen(function*() {
    const state = yield* TxRef.get(self.stateRef)
    const currentCount = Option.getOrElse(HashMap.get(state.readers, fiberId), () => 0)

    if (currentCount <= 0) return 0

    const newCount = currentCount - 1
    const newReaders = newCount === 0
      ? HashMap.remove(state.readers, fiberId)
      : HashMap.set(state.readers, fiberId, newCount)

    yield* TxRef.set(self.stateRef, { ...state, readers: newReaders })
    return newCount
  }).pipe(Effect.tx)

/**
 * Releases one read lock held by the current fiber.
 *
 * **When to use**
 *
 * Use to leave a manually acquired read lock.
 *
 * **Details**
 *
 * Returns the remaining number of read locks held by this fiber.
 *
 * @category mutations
 * @since 2.0.0
 */
export const releaseRead = (self: TxReentrantLock): Effect.Effect<number> =>
  Effect.withFiber((fiber) => releaseReadFor(self, fiber.id))

/**
 * Releases one write lock held by the current fiber.
 *
 * **When to use**
 *
 * Use to leave a manually acquired write lock.
 *
 * **Details**
 *
 * Returns the remaining number of write locks held by this fiber.
 *
 * **Example** (Releasing a write lock)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxReentrantLock } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const lock = yield* TxReentrantLock.make()
 *   yield* TxReentrantLock.acquireWrite(lock)
 *   return yield* TxReentrantLock.releaseWrite(lock)
 * })
 *
 * await Effect.runPromise(program) // => 0
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
const releaseWriteFor = (self: TxReentrantLock, fiberId: number): Effect.Effect<number> =>
  Effect.gen(function*() {
    const state = yield* TxRef.get(self.stateRef)

    if (Option.isNone(state.writer) || state.writer.value[0] !== fiberId) return 0

    const newCount = state.writer.value[1] - 1
    const newWriter = newCount <= 0
      ? Option.none<readonly [number, number]>()
      : Option.some([fiberId, newCount] as const)

    yield* TxRef.set(self.stateRef, { ...state, writer: newWriter })
    return newCount
  }).pipe(Effect.tx)

/**
 * Releases one write lock held by the current fiber.
 *
 * **When to use**
 *
 * Use to leave a manually acquired write lock.
 *
 * **Details**
 *
 * Returns the remaining number of write locks held by this fiber.
 *
 * @category mutations
 * @since 2.0.0
 */
export const releaseWrite = (self: TxReentrantLock): Effect.Effect<number> =>
  Effect.withFiber((fiber) => releaseWriteFor(self, fiber.id))

/**
 * Acquires a read lock for the duration of the scope.
 * The lock is automatically released when the scope closes.
 *
 * **Example** (Holding a scoped read lock)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxReentrantLock } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const lock = yield* TxReentrantLock.make()
 *
 *   const held = yield* Effect.scoped(
 *     Effect.gen(function*() {
 *       yield* TxReentrantLock.readLock(lock)
 *       // read lock is held for the duration of the scope
 *       return yield* TxReentrantLock.readLocks(lock)
 *     })
 *   )
 *   // read lock is released
 *   return [held, yield* TxReentrantLock.readLocks(lock)]
 * })
 *
 * await Effect.runPromise(program) // => [1, 0]
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const readLock = (self: TxReentrantLock): Effect.Effect<number, never, Scope.Scope> =>
  Effect.withFiber((fiber) =>
    Effect.acquireRelease(
      acquireRead(self),
      () => releaseReadFor(self, fiber.id)
    )
  )

/**
 * Acquires a write lock for the duration of the scope.
 * The lock is automatically released when the scope closes.
 *
 * **Example** (Holding a scoped write lock)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxReentrantLock } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const lock = yield* TxReentrantLock.make()
 *
 *   const held = yield* Effect.scoped(
 *     Effect.gen(function*() {
 *       yield* TxReentrantLock.writeLock(lock)
 *       // write lock is held for the duration of the scope
 *       return yield* TxReentrantLock.writeLocks(lock)
 *     })
 *   )
 *   // write lock is released
 *   return [held, yield* TxReentrantLock.writeLocks(lock)]
 * })
 *
 * await Effect.runPromise(program) // => [1, 0]
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const writeLock = (self: TxReentrantLock): Effect.Effect<number, never, Scope.Scope> =>
  Effect.withFiber((fiber) =>
    Effect.acquireRelease(
      acquireWrite(self),
      () => releaseWriteFor(self, fiber.id)
    )
  )

/**
 * Runs the provided effect while holding a read lock. The lock is automatically
 * released after the effect completes, fails, or is interrupted.
 *
 * **Example** (Running an effect with a read lock)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxReentrantLock } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const lock = yield* TxReentrantLock.make()
 *   return yield* TxReentrantLock.withReadLock(
 *     lock,
 *     Effect.succeed("read data")
 *   )
 * })
 *
 * await Effect.runPromise(program) // => "read data"
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const withReadLock: {
  <A, E, R>(effect: Effect.Effect<A, E, R>): (self: TxReentrantLock) => Effect.Effect<A, E, R>
  <A, E, R>(self: TxReentrantLock, effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R>
} = ((...args: Array<any>) => {
  if (args.length === 1) {
    const [effect] = args
    return (self: TxReentrantLock) =>
      Effect.acquireUseRelease(
        acquireRead(self),
        () => effect,
        () => releaseRead(self)
      )
  }
  const [self, effect] = args
  return Effect.acquireUseRelease(
    acquireRead(self),
    () => effect,
    () => releaseRead(self)
  )
}) as any

/**
 * Runs the provided effect while holding a write lock. The lock is automatically
 * released after the effect completes, fails, or is interrupted.
 *
 * **Example** (Running an effect with a write lock)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxReentrantLock } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const lock = yield* TxReentrantLock.make()
 *   return yield* TxReentrantLock.withWriteLock(
 *     lock,
 *     Effect.succeed("wrote data")
 *   )
 * })
 *
 * await Effect.runPromise(program) // => "wrote data"
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const withWriteLock: {
  <A, E, R>(effect: Effect.Effect<A, E, R>): (self: TxReentrantLock) => Effect.Effect<A, E, R>
  <A, E, R>(self: TxReentrantLock, effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R>
} = ((...args: Array<any>) => {
  if (args.length === 1) {
    const [effect] = args
    return (self: TxReentrantLock) =>
      Effect.acquireUseRelease(
        acquireWrite(self),
        () => effect,
        () => releaseWrite(self)
      )
  }
  const [self, effect] = args
  return Effect.acquireUseRelease(
    acquireWrite(self),
    () => effect,
    () => releaseWrite(self)
  )
}) as any

/**
 * Runs an effect while holding a write lock.
 *
 * **When to use**
 *
 * Use when you need to run an effect with exclusive write access through a
 * `TxReentrantLock` and prefer the concise lock helper.
 *
 * **Example** (Running an effect with exclusive access)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxReentrantLock } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const lock = yield* TxReentrantLock.make()
 *   return yield* TxReentrantLock.withLock(
 *     lock,
 *     Effect.succeed("exclusive operation")
 *   )
 * })
 *
 * await Effect.runPromise(program) // => "exclusive operation"
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const withLock: {
  <A, E, R>(effect: Effect.Effect<A, E, R>): (self: TxReentrantLock) => Effect.Effect<A, E, R>
  <A, E, R>(self: TxReentrantLock, effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R>
} = withWriteLock

// =============================================================================
// Getters
// =============================================================================

/**
 * Returns the total number of read locks held across all fibers.
 *
 * **Example** (Counting read locks)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxReentrantLock } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const lock = yield* TxReentrantLock.make()
 *   yield* TxReentrantLock.acquireRead(lock)
 *   const count = yield* TxReentrantLock.readLocks(lock)
 *   yield* TxReentrantLock.releaseRead(lock)
 *   return count
 * })
 *
 * await Effect.runPromise(program) // => 1
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export const readLocks = (self: TxReentrantLock): Effect.Effect<number> =>
  Effect.gen(function*() {
    const state = yield* TxRef.get(self.stateRef)
    let total = 0
    for (const [, count] of state.readers) {
      total += count
    }
    return total
  })

/**
 * Returns the number of write locks held (0 or the reentrant count).
 *
 * **Example** (Counting write locks)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxReentrantLock } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const lock = yield* TxReentrantLock.make()
 *   return yield* TxReentrantLock.writeLocks(lock)
 * })
 *
 * await Effect.runPromise(program) // => 0
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export const writeLocks = (self: TxReentrantLock): Effect.Effect<number> =>
  Effect.gen(function*() {
    const state = yield* TxRef.get(self.stateRef)
    return Option.isSome(state.writer) ? state.writer.value[1] : 0
  })

/**
 * Checks whether the lock is held by any fiber (read or write).
 *
 * **Example** (Checking whether a lock is held)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxReentrantLock } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const lock = yield* TxReentrantLock.make()
 *   return yield* TxReentrantLock.locked(lock)
 * })
 *
 * await Effect.runPromise(program) // => false
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export const locked = (self: TxReentrantLock): Effect.Effect<boolean> =>
  Effect.gen(function*() {
    const state = yield* TxRef.get(self.stateRef)
    return HashMap.size(state.readers) > 0 || Option.isSome(state.writer)
  })

/**
 * Checks whether any fiber holds a read lock.
 *
 * **Example** (Checking whether a read lock is held)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxReentrantLock } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const lock = yield* TxReentrantLock.make()
 *   return yield* TxReentrantLock.readLocked(lock)
 * })
 *
 * await Effect.runPromise(program) // => false
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export const readLocked = (self: TxReentrantLock): Effect.Effect<boolean> =>
  Effect.gen(function*() {
    const state = yield* TxRef.get(self.stateRef)
    return HashMap.size(state.readers) > 0
  })

/**
 * Checks whether any fiber holds a write lock.
 *
 * **Example** (Checking whether a write lock is held)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxReentrantLock } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const lock = yield* TxReentrantLock.make()
 *   return yield* TxReentrantLock.writeLocked(lock)
 * })
 *
 * await Effect.runPromise(program) // => false
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export const writeLocked = (self: TxReentrantLock): Effect.Effect<boolean> =>
  Effect.gen(function*() {
    const state = yield* TxRef.get(self.stateRef)
    return Option.isSome(state.writer)
  })

// =============================================================================
// Guards
// =============================================================================

/**
 * Checks whether the given value is a TxReentrantLock.
 *
 * **Example** (Checking for TxReentrantLock values)
 *
 * ```ts import.meta.vitest
 * import { TxReentrantLock } from "effect"
 *
 * const someValue: unknown = {}
 *
 * TxReentrantLock.isTxReentrantLock(someValue) // => false
 * ```
 *
 * @category guards
 * @since 4.0.0
 */
export const isTxReentrantLock = (u: unknown): u is TxReentrantLock => hasProperty(u, TypeId)
