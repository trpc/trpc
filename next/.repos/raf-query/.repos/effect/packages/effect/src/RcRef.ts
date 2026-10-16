/**
 * Reference-counted handles for sharing one scoped resource across many scoped
 * users. An `RcRef<A, E>` acquires the resource lazily the first time `get`
 * needs it, reuses that value while it is borrowed or kept idle, and finalizes
 * it when the final borrowing scope closes unless an idle timeout keeps it
 * available. The module also provides `invalidate` for forcing the next `get`
 * to acquire a fresh resource.
 *
 * @since 3.5.0
 */
import type * as Duration from "./Duration.ts"
import type * as Effect from "./Effect.ts"
import * as internal from "./internal/rcRef.ts"
import type { Pipeable } from "./Pipeable.ts"
import type { Scope } from "./Scope.ts"
import type * as Types from "./Types.ts"

const TypeId = "~effect/RcRef"

/**
 * A reference counted reference that manages resource lifecycle.
 *
 * **When to use**
 *
 * Use to share a scoped resource across active users with reference-counted
 * acquisition and release.
 *
 * **Details**
 *
 * An RcRef wraps a resource that can be acquired and released multiple times.
 * The resource is lazily acquired on the first call to `get` and automatically
 * released when the last reference is released.
 *
 * **Example** (Sharing a lazily acquired resource)
 *
 * ```ts import.meta.vitest
 * import { Effect, RcRef } from "effect"
 *
 * const events: Array<string> = []
 *
 * // Create an RcRef for a database connection
 * const createConnectionRef = (connectionString: string) =>
 *   RcRef.make({
 *     acquire: Effect.acquireRelease(
 *       Effect.succeed(`Connected to ${connectionString}`),
 *       (connection) => Effect.sync(() => events.push(`closed ${connection}`))
 *     )
 *   })
 *
 * // Use the RcRef in multiple operations
 * const program = Effect.gen(function*() {
 *   const connectionRef = yield* createConnectionRef("postgres://localhost")
 *
 *   // Multiple gets will share the same connection
 *   const connection1 = yield* RcRef.get(connectionRef)
 *   const connection2 = yield* RcRef.get(connectionRef)
 *
 *   return [connection1 === connection2, events] as const
 * })
 *
 * await Effect.runPromise(Effect.scoped(program)) // => [true, ["closed Connected to postgres://localhost"]]
 * ```
 *
 * @category models
 * @since 3.5.0
 */
export interface RcRef<out A, out E = never> extends Pipeable {
  readonly [TypeId]: RcRef.Variance<A, E>
}

/**
 * Namespace containing type-level members associated with `RcRef`.
 *
 * **Example** (Referencing namespace types)
 *
 * ```ts import.meta.vitest
 * import type { RcRef } from "effect"
 *
 * // Use RcRef namespace types
 * type MyRcRef = RcRef.RcRef<string, Error>
 * type MyVariance = RcRef.RcRef.Variance<string, Error>
 *
 * ```
 *
 * @since 3.5.0
 */
export declare namespace RcRef {
  /**
   * Type-level variance marker for `RcRef`.
   *
   * **When to use**
   *
   * Use to carry the value and error type parameters for `RcRef` in Effect's
   * type machinery.
   *
   * **Details**
   *
   * This interface records the covariant value and error types carried by an
   * `RcRef`. It is used by Effect's type machinery and is not normally
   * referenced directly by users.
   *
   * @category models
   * @since 3.5.0
   */
  export interface Variance<A, E> {
    readonly _A: Types.Covariant<A>
    readonly _E: Types.Covariant<E>
  }
}

/**
 * Creates an `RcRef` from an acquire effect.
 *
 * **When to use**
 *
 * Use to create a lazily acquired, reference-counted resource from an acquire
 * effect.
 *
 * **Details**
 *
 * The resource is acquired lazily on the first `get` and shared by subsequent
 * gets while it remains cached. Each `get` adds a reference to the current
 * `Scope`. When the last reference is released, the resource is closed
 * immediately by default, or after `idleTimeToLive` when that option is
 * provided.
 *
 * **Example** (Creating a reference-counted resource)
 *
 * ```ts import.meta.vitest
 * import { Effect, RcRef } from "effect"
 *
 * const events: Array<string> = []
 *
 * const program = Effect.gen(function*() {
 *   const ref = yield* RcRef.make({
 *     acquire: Effect.acquireRelease(
 *       Effect.succeed("foo"),
 *       () => Effect.sync(() => events.push("released foo"))
 *     )
 *   })
 *
 *   // will only acquire the resource once, and release it
 *   // when the scope is closed
 *   yield* RcRef.get(ref).pipe(
 *     Effect.andThen(RcRef.get(ref)),
 *     Effect.scoped
 *   )
 * })
 *
 * await Effect.runPromise(Effect.scoped(program))
 * events // => ["released foo"]
 * ```
 *
 * @category constructors
 * @since 3.5.0
 */
export const make: <A, E, R>(
  options: {
    readonly acquire: Effect.Effect<A, E, R>
    /**
     * How long to keep an idle resource after its last reference is released.
     *
     * If the resource has not been invalidated, finite durations, including `0`,
     * schedule release in a forked fiber that the scope releasing the last
     * reference does not await. An infinite duration keeps the idle resource
     * until invalidation or the RcRef's scope closes.
     *
     * If this option is omitted or the resource has been invalidated with
     * `RcRef.invalidate`, the scope releasing the last reference releases the
     * resource and awaits completion.
     */
    readonly idleTimeToLive?: Duration.Input | undefined
  }
) => Effect.Effect<RcRef<A, E>, never, R | Scope> = internal.make

/**
 * Gets the value from an `RcRef`, acquiring it first if needed.
 *
 * **When to use**
 *
 * Use to borrow the current resource within a `Scope`, acquiring it first if
 * necessary.
 *
 * **Details**
 *
 * The reference count is incremented for the current `Scope`, and a release
 * finalizer is added to that scope. When the current scope closes, the
 * reference is released; the resource is closed when the final reference is
 * released, subject to any configured idle time-to-live.
 *
 * **Example** (Sharing one acquired value)
 *
 * ```ts import.meta.vitest
 * import { Effect, RcRef } from "effect"
 *
 * const events: Array<string> = []
 *
 * const program = Effect.gen(function*() {
 *   // Create an RcRef with a resource
 *   const ref = yield* RcRef.make({
 *     acquire: Effect.acquireRelease(
 *       Effect.succeed("shared resource"),
 *       (resource) => Effect.sync(() => events.push(`released ${resource}`))
 *     )
 *   })
 *
 *   // Get the value from the RcRef
 *   const value1 = yield* RcRef.get(ref)
 *   const value2 = yield* RcRef.get(ref)
 *
 *   return [value1 === value2, events] as const
 * })
 *
 * await Effect.runPromise(Effect.scoped(program)) // => [true, ["released shared resource"]]
 * ```
 *
 * @category combinators
 * @since 3.5.0
 */
export const get: <A, E>(self: RcRef<A, E>) => Effect.Effect<A, E, Scope> = internal.get

/**
 * Invalidates the currently cached resource, if one has been acquired.
 *
 * **When to use**
 *
 * Use to force future `RcRef.get` calls to acquire a fresh resource when the
 * currently cached resource should no longer be reused.
 *
 * **Details**
 *
 * After invalidation, the next `get` acquires a fresh resource.
 *
 * **Gotchas**
 *
 * Invalidation does not revoke resources already borrowed by active scopes;
 * those remain usable until their scopes close.
 *
 * @see {@link get} for acquiring the current cached resource or the fresh resource after invalidation
 *
 * @category combinators
 * @since 3.19.6
 */
export const invalidate: <A, E>(self: RcRef<A, E>) => Effect.Effect<void> = internal.invalidate
