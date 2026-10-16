/**
 * Stores a current value together with the scope that owns it.
 *
 * A `ScopedRef<A>` is useful for resource-backed values such as clients,
 * connections, subscriptions, or handles. Replacing the value acquires the
 * replacement in a new scope and releases the resources owned by the previous
 * value. Reads can be effectful or synchronous, and updates are synchronized so
 * only one replacement happens at a time.
 *
 * @since 2.0.0
 */
import * as Effect from "./Effect.ts"
import * as Exit from "./Exit.ts"
import { dual, type LazyArg } from "./Function.ts"
import { PipeInspectableProto } from "./internal/core.ts"
import type { Pipeable } from "./Pipeable.ts"
import * as Scope from "./Scope.ts"
import * as Synchronized from "./SynchronizedRef.ts"

const TypeId = "~effect/ScopedRef"

/**
 * A `ScopedRef` is a reference whose value is associated with resources,
 * which must be released properly. You can both get the current value of any
 * `ScopedRef`, as well as set it to a new value (which may require new
 * resources). The reference itself takes care of properly releasing resources
 * for the old value whenever a new value is obtained.
 *
 * **When to use**
 *
 * Use when an application needs to keep a current resource-backed value and
 * later replace it with another acquired value while ensuring the previous
 * value is released.
 *
 * @category models
 * @since 2.0.0
 */
export interface ScopedRef<in out A> extends Pipeable {
  readonly [TypeId]: typeof TypeId
  readonly backing: Synchronized.SynchronizedRef<readonly [Scope.Closeable, A]>
}

const Proto = {
  ...PipeInspectableProto,
  [TypeId]: TypeId,
  toJSON(this: ScopedRef<any>) {
    return {
      _id: "ScopedRef",
      value: this.backing.backing.ref.current[1]
    }
  }
}

interface ScopedRefImpl<A> extends ScopedRef<A> {
  // Keep every generation at the ref's creation slot in the owner's finalizer order.
  readonly scope: Scope.Scope
}

const makeUnsafe = <A>(
  scope: Scope.Scope,
  generation: Scope.Closeable,
  value: A
): ScopedRefImpl<A> => {
  const self = Object.create(Proto)
  self.scope = scope
  self.backing = Synchronized.makeUnsafe([generation, value] as const)
  return self
}

const isClosed = (scope: Scope.Scope): boolean => scope.state._tag === "Closed"

/**
 * Creates a new `ScopedRef` from an effect that acquires the initial value.
 *
 * **When to use**
 *
 * Use when creating a `ScopedRef` whose initial value requires acquiring
 * resources that must be released.
 *
 * @see {@link make} for creating a `ScopedRef` from a value that does not require resource acquisition
 * @category constructors
 * @since 2.0.0
 */
export const fromAcquire: <A, E, R>(
  acquire: Effect.Effect<A, E, R>
) => Effect.Effect<ScopedRef<A>, E, Scope.Scope | R> = Effect.fnUntraced(function*<A, E, R>(
  acquire: Effect.Effect<A, E, R>
) {
  const scope = Scope.forkUnsafe(yield* Effect.scope)
  const generation = Scope.forkUnsafe(scope)
  const value = yield* acquire.pipe(
    Scope.provide(generation),
    Effect.tapCause((cause) => Scope.close(scope, Exit.failCause(cause)))
  )
  if (isClosed(generation)) return yield* Effect.interrupt
  return makeUnsafe(scope, generation, value)
}, Effect.uninterruptible)

/**
 * Retrieves the current value of the scoped reference synchronously.
 *
 * **When to use**
 *
 * Use when you need immediate synchronous access to the current `ScopedRef`
 * value and can guarantee that reading outside the `Effect` API is safe.
 *
 * @see {@link get} for Effect-wrapped access in Effect programs
 *
 * @category getters
 * @since 4.0.0
 */
export const getUnsafe = <A>(self: ScopedRef<A>): A => self.backing.backing.ref.current[1]

/**
 * Retrieves the current value of the scoped reference effectfully.
 *
 * **When to use**
 *
 * Use to read the value currently stored in a `ScopedRef` inside an `Effect`
 * workflow.
 *
 * @see {@link getUnsafe} for reading the current value synchronously when an unsafe read is acceptable
 *
 * @category getters
 * @since 2.0.0
 */
export const get = <A>(self: ScopedRef<A>): Effect.Effect<A> => Effect.sync(() => getUnsafe(self))

/**
 * Creates a new `ScopedRef` from the specified value.
 *
 * **When to use**
 *
 * Use to create a `ScopedRef` when the initial value is already available or
 * can be produced without acquiring resources.
 *
 * **Details**
 *
 * The `evaluate` function runs when the returned effect runs. The returned
 * effect requires a `Scope`, and the reference closes the currently stored
 * value's scope when that outer scope closes.
 *
 * **Gotchas**
 *
 * Do not use `make` for an initial value whose creation acquires resources; use
 * `fromAcquire` so acquisition and finalization are tracked.
 *
 * @see {@link fromAcquire} for creating a `ScopedRef` from an effect that acquires the initial value
 * @see {@link set} for replacing the current value with a newly acquired value
 *
 * @category constructors
 * @since 2.0.0
 */
export const make = <A>(evaluate: LazyArg<A>): Effect.Effect<ScopedRef<A>, never, Scope.Scope> =>
  fromAcquire(Effect.sync(evaluate))

/**
 * Sets the value of this reference to a newly acquired scoped value, releasing
 * any resources associated with the old value.
 *
 * **When to use**
 *
 * Use to replace the current value of an existing `ScopedRef` with a newly
 * acquired scoped value while releasing resources for the previous value.
 *
 * **Details**
 *
 * This method will not return until either the reference is successfully
 * changed to the new value, with old resources released, or until the attempt
 * to acquire a new value fails.
 *
 * @category mutations
 * @since 2.0.0
 */
export const set: {
  <A, R, E>(acquire: Effect.Effect<A, E, R>): (self: ScopedRef<A>) => Effect.Effect<void, E, Exclude<R, Scope.Scope>>
  <A, R, E>(self: ScopedRef<A>, acquire: Effect.Effect<A, E, R>): Effect.Effect<void, E, Exclude<R, Scope.Scope>>
} = dual(
  2,
  Effect.fnUntraced(
    function*<A, R, E>(
      self: ScopedRef<A>,
      acquire: Effect.Effect<A, E, R>
    ) {
      const generation = Scope.forkUnsafe((self as ScopedRefImpl<A>).scope)
      const value = yield* acquire.pipe(
        Scope.provide(generation),
        Effect.tapCause((cause) => Scope.close(generation, Exit.failCause(cause)))
      )
      yield* Scope.close(self.backing.backing.ref.current[0], Exit.void).pipe(
        Effect.tapCause((cause) => Scope.close(generation, Exit.failCause(cause)))
      )
      if (isClosed(generation)) return yield* Effect.interrupt
      self.backing.backing.ref.current = [generation, value]
    },
    Effect.uninterruptible,
    (effect, self) => self.backing.semaphore.withPermit(effect)
  )
)
