/**
 * The `PartitionedSemaphore` module provides a semaphore for limiting
 * concurrency across a shared permit pool while keeping waiters grouped by
 * partition key. A `PartitionedSemaphore<K>` is useful when many independent
 * groups of work compete for the same bounded resource and each group should
 * make progress without one busy group monopolizing released permits.
 *
 * @since 4.0.0
 */
import * as Effect from "./Effect.ts"
import * as Exit from "./Exit.ts"
import { dual } from "./Function.ts"
import * as internalEffect from "./internal/effect.ts"
import * as MutableHashMap from "./MutableHashMap.ts"
import * as Option from "./Option.ts"

/**
 * Runtime type identifier used to mark values that implement
 * `PartitionedSemaphore`.
 *
 * **Details**
 *
 * This marker is part of the runtime representation of partitioned semaphore
 * values.
 *
 * @category type IDs
 * @since 4.0.0
 */
export const PartitionedTypeId: PartitionedTypeId = "~effect/PartitionedSemaphore"

/**
 * Literal type of the `PartitionedSemaphore` runtime type identifier.
 *
 * **When to use**
 *
 * Use to type fields that store the exact `PartitionedSemaphore` runtime marker.
 *
 * **Details**
 *
 * Use this type when declaring fields that must contain the exact
 * `PartitionedTypeId` marker value.
 *
 * @category type IDs
 * @since 4.0.0
 */
export type PartitionedTypeId = "~effect/PartitionedSemaphore"

/**
 * A `PartitionedSemaphore` controls access to a shared permit pool while
 * tracking waiters by partition key.
 *
 * **When to use**
 *
 * Use to coordinate shared permits across partition keys so waiting groups make
 * progress without one group monopolizing the pool.
 *
 * **Details**
 *
 * Waiting permits are distributed across partitions in round-robin order.
 *
 * @category models
 * @since 3.19.4
 */
export interface PartitionedSemaphore<in K> {
  readonly [PartitionedTypeId]: PartitionedTypeId
  readonly capacity: number
  readonly available: Effect.Effect<number>
  readonly take: (key: K, permits: number) => Effect.Effect<void>
  readonly release: (permits: number) => Effect.Effect<number>
  readonly withPermits: (
    key: K,
    permits: number
  ) => <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
  readonly withPermit: (key: K) => <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
  readonly withPermitsIfAvailable: (
    permits: number
  ) => <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<Option.Option<A>, E, R>
}

/**
 * Alias interface for a `PartitionedSemaphore` keyed by values of type `K`.
 *
 * **When to use**
 *
 * Use as an alternate exported name for a partitioned permit pool keyed by `K`.
 *
 * **Details**
 *
 * This interface does not add members beyond `PartitionedSemaphore`; it
 * provides an alternate exported name for APIs that refer to a partitioned
 * permit pool.
 *
 * @category models
 * @since 4.0.0
 */
export interface Partitioned<in K> extends PartitionedSemaphore<K> {}

/**
 * Constructs a `PartitionedSemaphore` synchronously, outside of `Effect`.
 *
 * **When to use**
 *
 * Use when you need to construct a partitioned semaphore synchronously outside
 * an `Effect` workflow.
 *
 * **Details**
 *
 * Negative permit counts are clamped to `0`. Non-finite permit counts create
 * an unbounded semaphore whose acquire and release operations complete
 * immediately.
 *
 * @see {@link make} for creating a partitioned semaphore inside `Effect`
 *
 * @category constructors
 * @since 3.19.4
 */
export const makeUnsafe = <K = unknown>(options: {
  readonly permits: number
}): PartitionedSemaphore<K> => {
  const maxPermits = Math.max(0, options.permits)

  if (!Number.isFinite(maxPermits)) {
    return {
      [PartitionedTypeId]: PartitionedTypeId,
      capacity: maxPermits,
      available: Effect.succeed(maxPermits),
      take: () => Effect.void,
      release: () => Effect.succeed(maxPermits),
      withPermits: () => (effect) => effect,
      withPermit: () => (effect) => effect,
      withPermitsIfAvailable: () => (effect) => Effect.asSome(effect)
    }
  }

  let totalPermits = maxPermits
  let waitingPermits = 0

  type Waiter = {
    permits: number
    readonly resume: () => void
  }

  const partitions = MutableHashMap.empty<K, Set<Waiter>>()
  let iterator = partitions[Symbol.iterator]()

  const releaseUnsafe = (permits: number): number => {
    while (permits > 0) {
      if (waitingPermits === 0) {
        totalPermits = Math.min(maxPermits, totalPermits + permits)
        return totalPermits
      }

      let state = iterator.next()
      if (state.done) {
        iterator = partitions[Symbol.iterator]()
        state = iterator.next()
        if (state.done) {
          return totalPermits
        }
      }

      const waiter = state.value[1].values().next().value
      if (waiter === undefined) {
        continue
      }

      waiter.permits -= 1
      waitingPermits -= 1

      if (waiter.permits === 0) {
        waiter.resume()
      }

      permits -= 1
    }

    return totalPermits
  }

  const take = (key: K, permits: number): Effect.Effect<void> => {
    if (permits <= 0) {
      return Effect.void
    }

    if (maxPermits < permits) {
      return Effect.never
    }

    return Effect.withFiber((fiber) => {
      if (totalPermits >= permits) {
        // Keep the capacity check, deduction, and interruption cleanup in one evaluation step.
        totalPermits -= permits
        internalEffect.onExitUnsafe(fiber, (exit) => {
          if (Exit.isFailure(exit)) {
            releaseUnsafe(permits)
          }
          return undefined
        })
        return Effect.void
      }

      return Effect.callback<void>((resume) => {
        if (totalPermits >= permits) {
          resume(take(key, permits))
          return
        }
        const needed = permits - totalPermits
        if (totalPermits > 0) {
          totalPermits = 0
        }
        waitingPermits += needed

        const waiters = Option.getOrElse(
          MutableHashMap.get(partitions, key),
          () => {
            const set = new Set<Waiter>()
            MutableHashMap.set(partitions, key, set)
            return set
          }
        )

        const entry: Waiter = {
          permits: needed,
          resume: () => {
            cleanup()
            resume(Effect.void)
          }
        }

        const cleanup = () => {
          if (waiters.delete(entry) && waiters.size === 0) {
            MutableHashMap.remove(partitions, key)
          }
        }

        waiters.add(entry)

        return Effect.sync(() => {
          cleanup()
          waitingPermits -= entry.permits
          releaseUnsafe(permits - entry.permits)
        })
      })
    })
  }

  const withPermits =
    (key: K, permits: number) => <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> => {
      if (permits <= 0) {
        return effect
      }

      const takePermits = take(key, permits)
      return Effect.uninterruptibleMask((restore) =>
        Effect.flatMap(
          restore(takePermits),
          () =>
            Effect.ensuring(
              restore(effect),
              Effect.sync(() => {
                releaseUnsafe(permits)
              })
            )
        )
      )
    }

  const tryTake = (permits: number): boolean => {
    if (permits <= 0) {
      return true
    }

    if (maxPermits < permits || totalPermits < permits) {
      return false
    }

    totalPermits -= permits
    return true
  }

  return {
    [PartitionedTypeId]: PartitionedTypeId,
    capacity: maxPermits,
    available: Effect.sync(() => totalPermits),
    take,
    release: (permits) => Effect.sync(() => releaseUnsafe(permits)),
    withPermits,
    withPermit: (key) => withPermits(key, 1),
    withPermitsIfAvailable:
      (permits) => <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<Option.Option<A>, E, R> => {
        if (permits <= 0) {
          return Effect.asSome(effect)
        }

        return Effect.withFiber((fiber) => {
          if (!tryTake(permits)) {
            return Effect.succeed(Option.none())
          }

          // Register cleanup before the fiber can yield to the user effect.
          internalEffect.onExitUnsafe(fiber, () => {
            releaseUnsafe(permits)
            return undefined
          })
          return Effect.asSome(effect)
        })
      }
  }
}

/**
 * Creates a `PartitionedSemaphore` inside an `Effect`.
 *
 * **When to use**
 *
 * Use when semaphore construction should stay inside an `Effect` workflow.
 *
 * **Details**
 *
 * The `permits` option sets the shared permit capacity. The resulting
 * semaphore tracks waiters by partition key and distributes released permits
 * across waiting partitions in round-robin order.
 *
 * **Gotchas**
 *
 * Negative permit counts are clamped to `0`. Non-finite permit counts create
 * an unbounded semaphore.
 *
 * @see {@link makeUnsafe} for synchronous construction
 *
 * @category constructors
 * @since 3.19.4
 */
export const make = <K = unknown>(options: {
  readonly permits: number
}): Effect.Effect<PartitionedSemaphore<K>> => Effect.sync(() => makeUnsafe<K>(options))

/**
 * Gets the current number of available permits.
 *
 * **When to use**
 *
 * Use to inspect a snapshot of how many permits are currently free.
 *
 * **Details**
 *
 * Running the returned effect reads the semaphore's current availability.
 * Taking permits decreases availability, and releasing permits can increase it
 * up to the semaphore capacity.
 *
 * **Gotchas**
 *
 * Reading availability does not reserve permits.
 *
 * @see {@link capacity} for the fixed total permit capacity
 * @see {@link release} for returning permits to the shared pool
 * @see {@link withPermitsIfAvailable} for running only when permits are immediately available
 *
 * @category combinators
 * @since 4.0.0
 */
export const available = <K>(self: PartitionedSemaphore<K>): Effect.Effect<number> => self.available

/**
 * Gets the total capacity.
 *
 * **When to use**
 *
 * Use to inspect the fixed number of permits configured for the semaphore.
 *
 * **Details**
 *
 * Capacity is stored when the semaphore is created and does not change as
 * permits are acquired or released.
 *
 * @see {@link available} for the current number of free permits
 *
 * @category getters
 * @since 4.0.0
 */
export const capacity = <K>(self: PartitionedSemaphore<K>): number => self.capacity

/**
 * Returns an effect that acquires the requested number of permits for the
 * given partition key.
 *
 * **When to use**
 *
 * Use when you need manual permit acquisition for a partition and want to
 * control acquisition and release as separate effects.
 *
 * **Details**
 *
 * If enough permits are available, the effect completes immediately. Otherwise
 * it waits until released permits are assigned to this partition.
 *
 * **Gotchas**
 *
 * Requests for more permits than the semaphore capacity never complete.
 * Requests for zero or a negative number of permits complete without acquiring
 * anything.
 *
 * @see {@link release} for manually returning permits to the shared pool
 * @see {@link withPermits} for automatic acquire and release around an effect
 * @see {@link withPermit} for acquiring exactly one permit around an effect
 *
 * @category combinators
 * @since 4.0.0
 */
export const take: {
  <K>(key: K, permits: number): (self: PartitionedSemaphore<K>) => Effect.Effect<void>
  <K>(self: PartitionedSemaphore<K>, key: K, permits: number): Effect.Effect<void>
} = dual(3, <K>(self: PartitionedSemaphore<K>, key: K, permits: number): Effect.Effect<void> => self.take(key, permits))

/**
 * Returns an effect that releases permits back to the shared pool and returns
 * the current available permit count.
 *
 * **When to use**
 *
 * Use when you need to return permits acquired with `take` in a lower-level
 * partitioned permit protocol with explicit release control.
 *
 * **Details**
 *
 * Released permits are first assigned to waiting partitions in round-robin
 * order. Only permits not needed by waiters increase the available count,
 * which is capped at the semaphore capacity.
 *
 * @see {@link take} for manual acquisition
 * @see {@link withPermits} for automatic acquire and release around an effect
 * @see {@link available} for reading the permit count without releasing
 *
 * @category combinators
 * @since 4.0.0
 */
export const release: {
  (permits: number): <K>(self: PartitionedSemaphore<K>) => Effect.Effect<number>
  <K>(self: PartitionedSemaphore<K>, permits: number): Effect.Effect<number>
} = dual(2, <K>(self: PartitionedSemaphore<K>, permits: number): Effect.Effect<number> => self.release(permits))

/**
 * Runs an effect after acquiring permits for a partition, then releases those
 * permits when the effect exits.
 *
 * **When to use**
 *
 * Use to guard weighted partitioned work with automatic permit acquisition and
 * release around an effect.
 *
 * **Details**
 *
 * Permit acquisition may wait according to `take` semantics. Once acquired,
 * the permits are released even if the wrapped effect fails or is interrupted.
 *
 * **Gotchas**
 *
 * Requests for more permits than the semaphore capacity never complete.
 * Requests for zero or a negative number of permits run the effect without
 * acquiring anything.
 *
 * @see {@link withPermit} for the single-permit variant
 * @see {@link withPermitsIfAvailable} for running only when permits are
 * immediately available
 * @see {@link take} for manual acquisition
 * @see {@link release} for manual release
 *
 * @category combinators
 * @since 4.0.0
 */
export const withPermits: {
  <K>(
    self: PartitionedSemaphore<K>,
    key: K,
    permits: number
  ): <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
  <K, A, E, R>(
    self: PartitionedSemaphore<K>,
    key: K,
    permits: number,
    effect: Effect.Effect<A, E, R>
  ): Effect.Effect<A, E, R>
} = ((...args: Array<any>) => {
  if (args.length === 3) {
    const [self, key, permits] = args
    return (effect: Effect.Effect<any, any, any>) => self.withPermits(key, permits)(effect)
  }
  const [self, key, permits, effect] = args
  return self.withPermits(key, permits)(effect)
}) as any

/**
 * Runs an effect after acquiring one permit for a partition, then releases the
 * permit when the effect exits.
 *
 * **When to use**
 *
 * Use to guard partitioned work with exactly one permit and automatic release
 * when the effect exits.
 *
 * **Details**
 *
 * This is the single-permit variant of `withPermits`. The permit is released
 * even if the wrapped effect fails or is interrupted.
 *
 * @see {@link withPermits} for acquiring a weighted number of permits
 * @see {@link withPermitsIfAvailable} for running only when permits are
 * immediately available
 * @see {@link take} for manual acquisition
 * @see {@link release} for manual release
 *
 * @category combinators
 * @since 4.0.0
 */
export const withPermit: {
  <K>(self: PartitionedSemaphore<K>, key: K): <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
  <K, A, E, R>(
    self: PartitionedSemaphore<K>,
    key: K,
    effect: Effect.Effect<A, E, R>
  ): Effect.Effect<A, E, R>
} = ((...args: Array<any>) => {
  if (args.length === 2) {
    const [self, key] = args
    return (effect: Effect.Effect<any, any, any>) => self.withPermit(key)(effect)
  }
  const [self, key, effect] = args
  return self.withPermit(key)(effect)
}) as any

/**
 * Runs an effect only when the requested permits can be acquired immediately,
 * returning the result in `Some`.
 *
 * **When to use**
 *
 * Use when guarded work should run only if the shared permit pool can provide
 * the requested permits immediately.
 *
 * **Details**
 *
 * If the permits are not available, the effect is not run and the result is
 * `None`. When permits are acquired, they are released after the wrapped
 * effect completes, fails, or is interrupted. Requests for zero or a negative
 * number of permits run the effect and return `Some`.
 *
 * @see {@link withPermits} for the keyed variant that waits until permits are
 * available for a partition
 *
 * @category combinators
 * @since 4.0.0
 */
export const withPermitsIfAvailable: {
  <K>(
    self: PartitionedSemaphore<K>,
    permits: number
  ): <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<Option.Option<A>, E, R>
  <K, A, E, R>(
    self: PartitionedSemaphore<K>,
    permits: number,
    effect: Effect.Effect<A, E, R>
  ): Effect.Effect<Option.Option<A>, E, R>
} = ((...args: Array<any>) => {
  if (args.length === 2) {
    const [self, permits] = args
    return (effect: Effect.Effect<any, any, any>) => self.withPermitsIfAvailable(permits)(effect)
  }
  const [self, permits, effect] = args
  return self.withPermitsIfAvailable(permits)(effect)
}) as any
