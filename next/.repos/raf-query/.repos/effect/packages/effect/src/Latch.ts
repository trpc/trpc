/**
 * Reusable synchronization primitives for coordinating fibers. A `Latch` is
 * either open or closed: when it is closed, `await` and `whenOpen` suspend
 * until the latch opens or the current waiters are released. The module
 * includes effectful and synchronous constructors plus helpers to open, release,
 * close, wait, and gate effects behind the latch.
 *
 * @since 4.0.0
 */
import type * as Effect from "./Effect.ts"
import * as internal from "./internal/effect.ts"

/**
 * A reusable coordination primitive that lets fibers wait until they are
 * released by the latch.
 *
 * **When to use**
 *
 * Use to coordinate fibers that must wait for an explicit open or release
 * signal before continuing.
 *
 * **Details**
 *
 * A closed latch causes `await` and `whenOpen` to suspend. `open` opens the
 * latch and releases current and future waiters, `release` releases only
 * current waiters without opening it, and `close` makes future waiters suspend
 * again.
 *
 * **Example** (Coordinating fibers with a latch)
 *
 * ```ts import.meta.vitest
 * import { Effect, Fiber, Latch } from "effect"
 *
 * // Create and use a latch for coordination between fibers
 * const program = Effect.gen(function*() {
 *   const latch = yield* Latch.make()
 *   const waiter = yield* Effect.forkChild(latch.await.pipe(Effect.as("opened")))
 *   yield* latch.open
 *   return yield* Fiber.join(waiter)
 * })
 *
 * await Effect.runPromise(program) // => "opened"
 * ```
 *
 * @see {@link make} for creating a latch inside Effect code
 * @see {@link open} for releasing current and future waiters
 * @see {@link release} for releasing only the current waiters
 *
 * @category models
 * @since 4.0.0
 */
export interface Latch {
  /**
   * Opens the latch, releasing all fibers waiting on it.
   *
   * **When to use**
   *
   * Use to let current and future waiters continue.
   */
  readonly open: Effect.Effect<boolean>

  /**
   * Opens the latch synchronously, releasing all fibers waiting on it.
   *
   * **When to use**
   *
   * Use when synchronous code must open the latch immediately.
   */
  openUnsafe(this: Latch): boolean

  /**
   * Releases all fibers currently waiting on the latch without opening it.
   *
   * **When to use**
   *
   * Use to let current waiters continue while future waiters still suspend.
   */
  readonly release: Effect.Effect<boolean>

  /**
   * Waits for the latch to be opened or released.
   *
   * **When to use**
   *
   * Use to suspend until the latch allows the current fiber to continue.
   */
  readonly await: Effect.Effect<void>

  /**
   * Closes the latch so future waiters suspend again.
   *
   * **When to use**
   *
   * Use to re-enable waiting after a latch has been opened.
   */
  readonly close: Effect.Effect<boolean>

  /**
   * Closes the latch synchronously so future waiters suspend again.
   *
   * **When to use**
   *
   * Use when synchronous code must close the latch immediately.
   */
  closeUnsafe(this: Latch): boolean

  /**
   * Runs the given effect only after the latch allows waiting fibers to
   * continue.
   *
   * **When to use**
   *
   * Use to gate an effect behind the latch signal.
   */
  whenOpen<A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E, R>

  /**
   * Checks whether the latch is currently open or closed.
   *
   * **When to use**
   *
   * Use to check the state of the latch without suspending or changing its state.
   */
  isOpen(this: Latch): boolean
}

/**
 * Creates a `Latch` synchronously, outside of `Effect`.
 *
 * **When to use**
 *
 * Use when you need to allocate a `Latch` synchronously outside an Effect
 * workflow.
 *
 * **Details**
 *
 * The latch starts closed by default; pass `true` to create it open.
 *
 * **Example** (Creating a latch unsafely)
 *
 * ```ts import.meta.vitest
 * import { Effect, Fiber, Latch } from "effect"
 *
 * const latch = Latch.makeUnsafe(false)
 * const waiter = latch.await.pipe(Effect.as("opened"))
 *
 * const program = Effect.gen(function*() {
 *   const fiber = yield* Effect.forkChild(waiter)
 *   yield* latch.open
 *   return yield* Fiber.join(fiber)
 * })
 *
 * await Effect.runPromise(program) // => "opened"
 * ```
 *
 * @see {@link make} for creating a latch inside Effect code
 *
 * @category constructors
 * @since 4.0.0
 */
export const makeUnsafe: (open?: boolean | undefined) => Latch = internal.makeLatchUnsafe

/**
 * Creates a `Latch` inside `Effect`.
 *
 * **When to use**
 *
 * Use to create a latch for coordinating fibers inside Effect code.
 *
 * **Details**
 *
 * The latch starts closed by default; pass `true` to create it open.
 *
 * **Example** (Creating a latch)
 *
 * ```ts import.meta.vitest
 * import { Effect, Fiber, Latch } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const latch = yield* Latch.make(false)
 *   const waiter = latch.await.pipe(Effect.as("opened"))
 *
 *   const fiber = yield* Effect.forkChild(waiter)
 *   yield* latch.open
 *   return yield* Fiber.join(fiber)
 * })
 *
 * await Effect.runPromise(program) // => "opened"
 * ```
 *
 * @see {@link makeUnsafe} for synchronous allocation outside Effect code
 *
 * @category constructors
 * @since 4.0.0
 */
export const make: (open?: boolean | undefined) => Effect.Effect<Latch> = internal.makeLatch

/**
 * Opens the latch and releases fibers waiting on it.
 *
 * **When to use**
 *
 * Use to open a latch and release all fibers that are waiting on it.
 *
 * **Details**
 *
 * The returned effect succeeds with `true` when this call changed the latch
 * from closed to open, or `false` if it was already open.
 *
 * @see {@link openUnsafe} for a synchronous variant
 * @see {@link release} to release waiting fibers without opening the latch
 *
 * @category combinators
 * @since 4.0.0
 */
export const open = (self: Latch): Effect.Effect<boolean> => self.open

/**
 * Opens the latch synchronously and releases fibers waiting on it.
 *
 * **When to use**
 *
 * Use when you need synchronous code to open a latch immediately and release
 * the fibers waiting on it.
 *
 * **Details**
 *
 * Returns `true` when this call changed the latch from closed to open, or
 * `false` if it was already open. This unsafe variant performs the state
 * change immediately instead of returning an `Effect`.
 *
 * @see {@link open} for the effectful variant
 * @see {@link release} to release waiting fibers without opening the latch
 * @see {@link closeUnsafe} for the synchronous inverse operation
 *
 * @category unsafe
 * @since 4.0.0
 */
export const openUnsafe = (self: Latch): boolean => self.openUnsafe()

/**
 * Releases the fibers currently waiting on a closed latch without opening it.
 *
 * **When to use**
 *
 * Use to let the fibers currently waiting on a latch proceed while keeping the
 * latch closed for future waiters.
 *
 * **Details**
 *
 * The returned effect succeeds with `true` when release was requested while
 * the latch was closed, or `false` if the latch was already open. Future
 * waiters still suspend until the latch is opened or released again.
 *
 * @see {@link open} for opening the latch for current and future waiters
 *
 * @category combinators
 * @since 4.0.0
 */
export const release = (self: Latch): Effect.Effect<boolean> => self.release

const _await = (self: Latch): Effect.Effect<void> => self.await

export {
  /**
   * Waits for the latch to be opened.
   *
   * **When to use**
   *
   * Use to suspend the current fiber until the latch is opened or the current
   * set of waiters is released.
   *
   * **Details**
   *
   * Awaiting an already open latch completes immediately. Awaiting a closed
   * latch suspends until `open` or `release` resumes the waiters.
   *
   * **Gotchas**
   *
   * `release` can resume current waiters without opening the latch, so later
   * waiters may still suspend.
   *
   * @see {@link open} for opening the latch for current and future waiters
   * @see {@link release} for resuming current waiters without opening the latch
   * @see {@link whenOpen} for waiting before running another effect
   *
   * @category getters
   * @since 4.0.0
   */
  _await as await
}

/**
 * Closes the latch so future `await` and `whenOpen` calls suspend.
 *
 * **When to use**
 *
 * Use to re-enable waiting on a latch after it was opened, so later `await`
 * and `whenOpen` calls suspend again.
 *
 * **Details**
 *
 * The returned effect succeeds with `true` when this call changed the latch
 * from open to closed, or `false` if it was already closed.
 *
 * @see {@link closeUnsafe} for a synchronous variant
 * @see {@link open} for opening the latch for current and future waiters
 *
 * @category combinators
 * @since 4.0.0
 */
export const close = (self: Latch): Effect.Effect<boolean> => self.close

/**
 * Closes the latch synchronously so future `await` and `whenOpen` calls
 * suspend.
 *
 * **When to use**
 *
 * Use to close a latch synchronously when the state change must happen outside
 * an `Effect`.
 *
 * **Details**
 *
 * Returns `true` when this call changed the latch from open to closed, or
 * `false` if it was already closed. This unsafe variant performs the state
 * change immediately instead of returning an `Effect`.
 *
 * @see {@link close} for the effectful variant
 * @see {@link openUnsafe} to synchronously open the latch and release waiting
 * fibers
 *
 * @category unsafe
 * @since 4.0.0
 */
export const closeUnsafe = (self: Latch): boolean => self.closeUnsafe()

/**
 * Waits on the latch, then runs the provided effect.
 *
 * **When to use**
 *
 * Use to gate another effect so it starts only after the latch is opened or
 * the current waiters are released.
 *
 * **Details**
 *
 * If the latch is open, the effect runs immediately. If it is closed, the
 * returned effect suspends until the latch is opened or the current waiters are
 * released. The provided effect's success, failure, and requirements are
 * preserved.
 *
 * @see `await` for waiting without running another effect
 * @see {@link open} for opening the latch for current and future waiters
 * @see {@link release} for resuming current waiters without opening the latch
 *
 * @category combinators
 * @since 4.0.0
 */
export const whenOpen: {
  (self: Latch): <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
  <A, E, R>(self: Latch, effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R>
} = ((...args: Array<any>) => {
  if (args.length === 1) {
    const [self] = args
    return (effect: Effect.Effect<any, any, any>) => self.whenOpen(effect)
  }
  const [self, effect] = args
  return self.whenOpen(effect)
}) as any

/**
 * Checks whether the latch is currently open or closed.
 *
 * **When to use**
 *
 * Use to check the state of the latch without suspending or changing its state.
 *
 * @category predicates
 * @since 4.0.0
 */
export const isOpen = (self: Latch): boolean => self.isOpen()
