/**
 * Limits how many effects can use a shared resource at the same time.
 *
 * A `Semaphore` owns a number of permits. Work can run only after acquiring the
 * permits it needs, and those permits are returned when the work finishes. This
 * module includes constructors, automatic wrappers that acquire and release
 * permits around an effect, manual permit operations, a non-waiting variant for
 * work that should only run immediately, and resizing support for an existing
 * semaphore.
 *
 * @since 4.0.0
 */
import type * as Effect from "./Effect.ts"
import type { Fiber } from "./Fiber.ts"
import { dual } from "./Function.ts"
import * as core from "./internal/core.ts"
import * as internal from "./internal/effect.ts"
import type * as Option from "./Option.ts"

/**
 * A counting semaphore that coordinates concurrent access with permits.
 *
 * **When to use**
 *
 * Use to coordinate concurrent effects that need bounded access to a shared
 * resource.
 *
 * **Details**
 *
 * Effects can acquire permits, wait until enough permits are available,
 * release permits, or run with permits that are automatically released when
 * the effect exits.
 *
 * **Example** (Controlling concurrent access)
 *
 * ```ts import.meta.vitest
 * import { Effect, Semaphore } from "effect"
 *
 * // Create and use a semaphore for controlling concurrent access
 * const program = Effect.gen(function*() {
 *   const semaphore = yield* Semaphore.make(2)
 *
 *   return yield* semaphore.withPermits(1)(
 *     Effect.succeed("Resource accessed")
 *   )
 * })
 *
 * await Effect.runPromise(program) // => "Resource accessed"
 * ```
 *
 * @see {@link make} for creating a semaphore inside Effect code
 * @see {@link makeUnsafe} for creating a semaphore synchronously
 *
 * @category models
 * @since 4.0.0
 */
export interface Semaphore {
  /**
   * Adjusts the number of permits available in the semaphore.
   *
   * **When to use**
   *
   * Use to change the total permit count of an existing semaphore.
   */
  resize(this: Semaphore, permits: number): Effect.Effect<void>

  /**
   * Runs an effect with the given number of permits and releases the permits
   * when the effect completes.
   *
   * **When to use**
   *
   * Use to run an effect while holding a specified number of semaphore permits.
   *
   * **Details**
   *
   * This function acquires the specified number of permits before executing
   * the provided effect. Once the effect finishes, the permits are released.
   * If insufficient permits are available, the function will wait until they
   * are released by other tasks.
   */
  withPermits(this: Semaphore, permits: number): <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>

  /**
   * Runs an effect with the given number of permits and releases the permits
   * when the effect completes.
   *
   * **When to use**
   *
   * Use to run an effect while holding exactly one semaphore permit.
   *
   * **Details**
   *
   * This function acquires the specified number of permits before executing
   * the provided effect. Once the effect finishes, the permits are released.
   * If insufficient permits are available, the function will wait until they
   * are released by other tasks.
   */
  withPermit<A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E, R>

  /**
   * Runs an effect only if the specified number of permits are immediately
   * available.
   *
   * **When to use**
   *
   * Use when guarded work should run only if the requested permits are
   * immediately available.
   *
   * **Details**
   *
   * This function attempts to acquire the specified number of permits. If they
   * are available, it runs the effect and releases the permits after the effect
   * completes. If permits are not available, the effect does not execute, and
   * the result is `Option.none`.
   */
  withPermitsIfAvailable(
    this: Semaphore,
    permits: number
  ): <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<Option.Option<A>, E, R>

  /**
   * Acquires the specified number of permits and returns the acquired permit
   * count, suspending the task if they are not yet available. Pending `take`
   * calls are scanned in registration order, but a request is served only when
   * enough permits are available, so a smaller later request may overtake a
   * larger earlier request.
   *
   * **When to use**
   *
   * Use to manually acquire permits for lower-level coordination protocols.
   */
  take(this: Semaphore, permits: number): Effect.Effect<number>

  /**
   * Acquires the specified number of permits only if they are immediately
   * available.
   *
   * **When to use**
   *
   * Use to manually acquire permits without waiting, paired with `release`.
   */
  takeIfAvailable(this: Semaphore, permits: number): Effect.Effect<boolean>

  /**
   * Releases the specified number of permits and returns the resulting
   * available permits.
   *
   * **When to use**
   *
   * Use to manually return permits acquired by a lower-level coordination
   * protocol.
   */
  release(this: Semaphore, permits: number): Effect.Effect<number>

  /**
   * Releases all permits held by this semaphore and returns the resulting available permits.
   *
   * **When to use**
   *
   * Use to return every currently taken permit to the semaphore at once.
   *
   * **Gotchas**
   *
   * This does not stop effects already running with `withPermit` or `withPermits`.
   * Their permits become available immediately, but those effects still release
   * their permits when they finish. The resulting available count can then
   * exceed the semaphore's configured number of permits.
   */
  readonly releaseAll: Effect.Effect<number>
}

/**
 * Creates a `Semaphore` synchronously with the specified total
 * number of permits.
 *
 * **When to use**
 *
 * Use to construct a semaphore synchronously when an immediate value is
 * required outside an Effect workflow.
 *
 * **Example** (Creating an unsafe semaphore)
 *
 * ```ts import.meta.vitest
 * import { Effect, Semaphore } from "effect"
 *
 * const semaphore = Semaphore.makeUnsafe(3)
 *
 * const task = (id: number) =>
 *   semaphore.withPermits(1)(
 *     Effect.gen(function*() {
 *       yield* Effect.yieldNow
 *       return id
 *     })
 *   )
 *
 * // Only 3 tasks can run concurrently
 * const program = Effect.all([
 *   task(1),
 *   task(2),
 *   task(3),
 *   task(4),
 *   task(5)
 * ], { concurrency: "unbounded" })
 *
 * await Effect.runPromise(program) // => [1, 2, 3, 4, 5]
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const makeUnsafe = (permits: number): Semaphore => new SemaphoreImpl(permits)

const waitForPermits = <A, E, R>(
  self: SemaphoreImpl,
  n: number,
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> =>
  internal.callback((resume) => {
    if (self.free >= n) return resume(effect)
    const observer = () => {
      if (self.free < n) return
      self.waiters.delete(observer)
      resume(effect)
    }
    self.waiters.add(observer)
    return internal.sync(() => {
      self.waiters.delete(observer)
    })
  })

class SemaphoreImpl implements Semaphore {
  public waiters = new Set<() => void>()
  public taken = 0
  public permits: number

  constructor(permits: number) {
    this.permits = permits
  }

  get free() {
    return this.permits - this.taken
  }

  take(n: number): Effect.Effect<number> {
    const take: Effect.Effect<number> = internal.suspend(() => {
      if (this.free < n) {
        return waitForPermits(this, n, take)
      }
      this.taken += n
      return internal.succeed(n)
    })
    return take
  }

  takeIfAvailable(n: number): Effect.Effect<boolean> {
    return internal.suspend(() => {
      if (this.free < n) return internal.succeed(false)
      this.taken += n
      return internal.succeed(true)
    })
  }

  releaseUnsafe(fiber: Fiber<any, any>, n: number): number {
    this.taken -= n
    if (this.waiters.size > 0) {
      fiber.currentDispatcher.scheduleTask(() => {
        for (const observer of this.waiters) {
          if (this.free <= 0) break
          observer()
        }
      }, 0)
    }
    return this.free
  }

  resize(permits: number) {
    return core.withFiber((fiber) => {
      this.permits = permits
      if (this.free < 0) return internal.void
      this.releaseUnsafe(fiber, 0)
      return internal.void
    })
  }

  release(n: number): Effect.Effect<number> {
    return core.withFiber((fiber) => internal.succeed(this.releaseUnsafe(fiber, n)))
  }

  get releaseAll(): Effect.Effect<number> {
    return core.withFiber((fiber) => internal.succeed(this.releaseUnsafe(fiber, this.taken)))
  }

  withPermits(n: number) {
    return <A, E, R>(self: Effect.Effect<A, E, R>) =>
      internal.uninterruptibleMask((restore) => {
        const acquire: Effect.Effect<A, E, R> = internal.suspend(() => {
          if (this.free < n) {
            const wait = waitForPermits(this, n, internal.void)
            return internal.flatMap(restore(wait), () => acquire)
          }
          this.taken += n
          return internal.onExitPrimitive(
            restore(self),
            () => {
              this.releaseUnsafe(internal.getCurrentFiber()!, n)
              return undefined
            },
            true
          )
        })
        return acquire
      })
  }

  readonly withPermit = this.withPermits(1)

  withPermitsIfAvailable(n: number) {
    return <A, E, R>(self: Effect.Effect<A, E, R>) =>
      internal.uninterruptibleMask((restore) => {
        if (this.free < n) return internal.succeedNone
        this.taken += n
        return internal.onExitPrimitive(restore(internal.asSome(self)), () => {
          this.releaseUnsafe(internal.getCurrentFiber()!, n)
          return undefined
        }, true)
      })
  }
}

/**
 * Creates a `Semaphore` initialized with the specified total number of permits.
 *
 * **When to use**
 *
 * Use to create a semaphore inside Effect code for bounding concurrency with
 * automatic or manual permit management.
 *
 * **Example** (Creating a semaphore)
 *
 * ```ts import.meta.vitest
 * import { Effect, Semaphore } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const semaphore = yield* Semaphore.make(2)
 *
 *   const task = (id: number) =>
 *     semaphore.withPermits(1)(
 *       Effect.gen(function*() {
 *         yield* Effect.yieldNow
 *         return id
 *       })
 *     )
 *
 *   // Run 4 tasks, but only 2 can run concurrently
 *   return yield* Effect.all([task(1), task(2), task(3), task(4)])
 * })
 *
 * await Effect.runPromise(program) // => [1, 2, 3, 4]
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const make = (permits: number): Effect.Effect<Semaphore> => internal.sync(() => new SemaphoreImpl(permits))

/**
 * Sets the total number of permits managed by the semaphore.
 *
 * **When to use**
 *
 * Use to change the concurrency limit of an existing semaphore while keeping
 * current acquisitions in place.
 *
 * **Details**
 *
 * Existing acquisitions remain taken after resizing. If the new total is less
 * than the currently taken permit count, new acquisitions wait until enough
 * permits are released.
 *
 * @see {@link make} for creating a semaphore with an initial permit count
 * @see {@link release} for returning permits without changing semaphore capacity
 *
 * @category combinators
 * @since 4.0.0
 */
export const resize: {
  (permits: number): (self: Semaphore) => Effect.Effect<void>
  (self: Semaphore, permits: number): Effect.Effect<void>
} = dual(2, (self: Semaphore, permits: number) => self.resize(permits))

/**
 * Runs an effect with the given number of permits and releases the permits when
 * the effect completes.
 *
 * **When to use**
 *
 * Use to run an effect while holding a specified number of semaphore permits
 * for the duration of that effect.
 *
 * **Details**
 *
 * The effect waits until enough permits are available. Acquired permits are
 * released when the wrapped effect exits.
 *
 * @see {@link withPermit} for acquiring exactly one permit
 * @see {@link withPermitsIfAvailable} for running only when permits are immediately available
 * @see {@link take} for manually acquiring permits
 * @see {@link release} for manually returning permits
 *
 * @category combinators
 * @since 4.0.0
 */
export const withPermits: {
  (self: Semaphore, permits: number): <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
  <A, E, R>(self: Semaphore, permits: number, effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R>
} = ((self: Semaphore, permits: number, effect?: Effect.Effect<any, any, any>) => {
  const withPermits = self.withPermits(permits)
  return effect ? withPermits(effect) : withPermits
}) as any

/**
 * Runs an effect with a single permit and releases the permit when the effect
 * completes.
 *
 * **When to use**
 *
 * Use to guard an effect with exactly one semaphore permit while automatically
 * releasing that permit when the effect exits.
 *
 * @see {@link withPermits} for acquiring more than one permit
 * @see {@link withPermitsIfAvailable} for running only when permits are immediately available
 * @see {@link take} for manually acquiring permits
 * @see {@link release} for manually returning permits
 *
 * @category combinators
 * @since 4.0.0
 */
export const withPermit: {
  (self: Semaphore): <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
  <A, E, R>(self: Semaphore, effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R>
} = ((self: Semaphore, effect?: Effect.Effect<any, any, any>) => {
  if (!effect) return self.withPermit
  return self.withPermit(effect)
}) as any

/**
 * Runs an effect only if the specified number of permits are immediately
 * available.
 *
 * **When to use**
 *
 * Use when guarded work should run only if the requested permits are
 * immediately available.
 *
 * **Details**
 *
 * When the permits are unavailable, the effect is not run and the result is
 * `Option.none`. When permits are available, the effect is run, its result is
 * wrapped in `Option.some`, and the acquired permits are released when the
 * effect exits.
 *
 * @see {@link withPermits} for the variant that waits until permits are available
 *
 * @category combinators
 * @since 4.0.0
 */
export const withPermitsIfAvailable: {
  (self: Semaphore, permits: number): <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<Option.Option<A>, E, R>
  <A, E, R>(
    self: Semaphore,
    permits: number,
    effect: Effect.Effect<A, E, R>
  ): Effect.Effect<Option.Option<A>, E, R>
} = ((self: Semaphore, permits: number, effect?: Effect.Effect<any, any, any>) => {
  const withPermits = self.withPermitsIfAvailable(permits)
  return effect ? withPermits(effect) : withPermits
}) as any

/**
 * Acquires the specified number of permits and returns the acquired permit
 * count.
 *
 * **When to use**
 *
 * Use when you need manual permit acquisition for a lower-level protocol with
 * explicit acquisition and release control.
 *
 * **Details**
 *
 * The effect waits until enough permits are available.
 *
 * @see {@link withPermit} for automatically acquiring and releasing one permit around an effect
 * @see {@link withPermits} for automatically acquiring and releasing multiple permits around an effect
 * @see {@link takeIfAvailable} for manually acquiring permits without waiting
 * @see {@link release} for returning manually acquired permits
 *
 * @category combinators
 * @since 4.0.0
 */
export const take: {
  (permits: number): (self: Semaphore) => Effect.Effect<number>
  (self: Semaphore, permits: number): Effect.Effect<number>
} = dual(2, (self: Semaphore, permits: number) => self.take(permits))

/**
 * Acquires the specified number of permits only if they are immediately
 * available.
 *
 * **When to use**
 *
 * Use when you need fail-fast manual permit acquisition for a lower-level
 * protocol with explicit acquisition and release control.
 *
 * **Details**
 *
 * If enough permits are available, they are acquired and the effect returns
 * `true`. Otherwise, the effect returns `false` immediately without acquiring
 * any permits.
 *
 * @see {@link take} for the variant that waits until permits are available
 * @see {@link release} for returning manually acquired permits
 * @see {@link withPermitsIfAvailable} for automatic acquisition and release around an effect
 *
 * @category combinators
 * @since 4.0.0
 */
export const takeIfAvailable: {
  (permits: number): (self: Semaphore) => Effect.Effect<boolean>
  (self: Semaphore, permits: number): Effect.Effect<boolean>
} = dual(2, (self: Semaphore, permits: number) => self.takeIfAvailable(permits))

/**
 * Releases the specified number of permits and returns the resulting available
 * permits.
 *
 * **When to use**
 *
 * Use when you need to return permits acquired with `take` in a lower-level
 * permit protocol with explicit release control.
 *
 * **Details**
 *
 * Running the effect releases the requested permits, wakes waiting acquirers
 * when permits become available, and returns the current available permit
 * count.
 *
 * **Gotchas**
 *
 * Manual `take` / `release` usage must keep permit counts balanced. Prefer
 * `withPermit` or `withPermits` when the acquisition can be scoped to one
 * effect.
 *
 * @see {@link take} for manually acquiring permits
 * @see {@link releaseAll} for returning every currently taken permit
 * @see {@link withPermits} for automatic acquire and release around an effect
 *
 * @category combinators
 * @since 4.0.0
 */
export const release: {
  (permits: number): (self: Semaphore) => Effect.Effect<number>
  (self: Semaphore, permits: number): Effect.Effect<number>
} = dual(2, (self: Semaphore, permits: number) => self.release(permits))

/**
 * Releases all permits held by this semaphore and returns the resulting
 * available permits.
 *
 * **When to use**
 *
 * Use to return every currently taken permit to a semaphore at once, typically
 * during cleanup of manual `take` / `release` protocols.
 *
 * **Gotchas**
 *
 * This does not stop effects already running with `withPermit` or `withPermits`.
 * Their permits become available immediately, but those effects still release
 * their permits when they finish. The resulting available count can then
 * exceed the semaphore's configured number of permits.
 *
 * @see {@link release} for releasing a known permit count
 * @see {@link withPermits} for automatic acquire and release around an effect
 *
 * @category combinators
 * @since 4.0.0
 */
export const releaseAll = (self: Semaphore): Effect.Effect<number> => self.releaseAll
