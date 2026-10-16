/**
 * Controls how long resources stay open.
 *
 * A scope is a lifetime boundary. Code can register cleanup effects on it, and
 * closing the scope runs those cleanups with the `Exit` value that ended the
 * work. Most application code uses higher-level APIs such as `Effect.scoped`
 * and `Layer`, while this module is useful when code needs to create, provide,
 * fork, close, or inspect scopes directly.
 *
 * @since 2.0.0
 */

import type * as Context from "./Context.ts"
import type { Effect } from "./Effect.ts"
import type { Exit } from "./Exit.ts"
import * as effect from "./internal/effect.ts"

const TypeId = effect.ScopeTypeId
const CloseableTypeId = effect.ScopeCloseableTypeId

/**
 * A `Scope` represents a context where resources can be acquired and
 * automatically cleaned up when the scope is closed. Scopes can use
 * either sequential or parallel finalization strategies.
 *
 * **Example** (Managing scoped resources)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit, Scope } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const scope = yield* Scope.make("sequential")
 *
 *   const initial = [scope.strategy, scope.state._tag]
 *   yield* Scope.close(scope, Exit.void)
 *   return [initial, scope.state._tag]
 * })
 *
 * Effect.runSync(program) // => [["sequential", "Empty"], "Closed"]
 * ```
 *
 * @category services
 * @since 2.0.0
 */
export interface Scope {
  readonly [TypeId]: typeof TypeId
  readonly strategy: "sequential" | "parallel"
  readonly parent: Scope | undefined
  state: State.Open | State.Closed | State.Empty
}
/**
 * A `Closeable` scope extends the base `Scope` interface with the ability
 * to be closed, executing all registered finalizers.
 *
 * **Example** (Closing a scope)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit, Scope } from "effect"
 *
 * const cleanups: Array<string> = []
 * const program = Effect.gen(function*() {
 *   const scope = yield* Scope.make()
 *   yield* Scope.addFinalizer(scope, Effect.sync(() => cleanups.push("Cleanup!")))
 *   yield* Scope.close(scope, Exit.void)
 * })
 *
 * Effect.runSync(program)
 * cleanups // => ["Cleanup!"]
 * ```
 *
 * @category models
 * @since 2.0.0
 */
export interface Closeable extends Scope {
  readonly [CloseableTypeId]: typeof CloseableTypeId
}

/**
 * Scope states: `Empty` has no finalizers, `Open` has at least one, and
 * `Closed` holds the exit value.
 *
 * **Example** (Checking scope states)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit, Scope } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const scope = yield* Scope.make()
 *   const before = scope.state._tag
 *   yield* Scope.close(scope, Exit.void)
 *   return [before, scope.state._tag]
 * })
 *
 * Effect.runSync(program) // => ["Empty", "Closed"]
 * ```
 *
 * @since 4.0.0
 */
export declare namespace State {
  /**
   * Represents an open scope with no finalizers currently registered.
   *
   * **Details**
   *
   * Adding a finalizer moves it to `Open`; removing the last one returns it
   * to `Empty`.
   *
   * **Example** (Inspecting an empty scope state)
   *
   * ```ts import.meta.vitest
   * import { Scope } from "effect"
   *
   * const scope = Scope.makeUnsafe()
   *
   * scope.state._tag // => "Empty"
   * ```
   *
   * @category models
   * @since 4.0.0
   */
  export type Empty = {
    readonly _tag: "Empty"
  }
  /**
   * Represents an open scope state where finalizers can be added and
   * the scope is still accepting new resources.
   *
   * **Details**
   *
   * Stores one finalizer inline and allocates the `finalizers` map when a
   * second is added.
   *
   * **Example** (Inspecting an open scope state)
   *
   * ```ts import.meta.vitest
   * import { Effect, Scope } from "effect"
   *
   * const scope = Scope.makeUnsafe()
   *
   * Effect.runSync(Scope.addFinalizer(scope, Effect.void))
   * const state = scope.state
   * if (state._tag !== "Open") throw new Error("unexpected state")
   *
   * state._tag // => "Open"
   * state.finalizer !== undefined // => true
   * ```
   *
   * @category models
   * @since 4.0.0
   */
  export type Open = {
    readonly _tag: "Open"
    finalizerKey: {} | undefined
    finalizer: ((exit: Exit<any, any>) => Effect<void>) | undefined
    finalizers: Map<{}, (exit: Exit<any, any>) => Effect<void>> | undefined
  }
  /**
   * Represents a closed scope state where finalizers have been executed
   * and the scope is no longer accepting new resources.
   *
   * **Example** (Inspecting a closed scope state)
   *
   * ```ts import.meta.vitest
   * import { Effect, Exit, Scope } from "effect"
   *
   * const program = Effect.gen(function*() {
   *   const scope = yield* Scope.make()
   *
   *   yield* Scope.close(scope, Exit.succeed("Done"))
   *   if (scope.state._tag === "Closed") {
   *     return scope.state.exit
   *   }
   *   return Exit.die("unexpected state")
   * })
   *
   * Effect.runSync(program) // => Exit.succeed("Done")
   * ```
   *
   * @category models
   * @since 4.0.0
   */
  export type Closed = {
    readonly _tag: "Closed"
    readonly exit: Exit<any, any>
  }
}

/**
 * Service tag for the active resource lifetime.
 *
 * **When to use**
 *
 * Use to access the active lifetime when registering finalizers or sharing
 * resources with the surrounding scope.
 *
 * **Example** (Accessing the scope service)
 *
 * ```ts import.meta.vitest
 * import { Effect, Scope } from "effect"
 *
 * const cleanups: Array<string> = []
 * const program = Effect.gen(function*() {
 *   const scope = yield* Scope.Scope
 *   yield* Scope.addFinalizer(scope, Effect.sync(() => cleanups.push("Cleanup")))
 * })
 *
 * Effect.runSync(Effect.scoped(program))
 * cleanups // => ["Cleanup"]
 * ```
 *
 * @category services
 * @since 2.0.0
 */
export const Scope: Context.Service<Scope, Scope> = effect.scopeTag

/**
 * Creates a new `Scope` with the specified finalizer strategy.
 *
 * **Example** (Creating a scope)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit, Scope } from "effect"
 *
 * const cleanups: Array<string> = []
 * const program = Effect.gen(function*() {
 *   const scope = yield* Scope.make("sequential")
 *   yield* Scope.addFinalizer(scope, Effect.sync(() => cleanups.push("Cleanup 1")))
 *   yield* Scope.addFinalizer(scope, Effect.sync(() => cleanups.push("Cleanup 2")))
 *   yield* Scope.close(scope, Exit.void)
 * })
 *
 * Effect.runSync(program)
 * cleanups // => ["Cleanup 2", "Cleanup 1"]
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const make: (finalizerStrategy?: "sequential" | "parallel") => Effect<Closeable> = effect.scopeMake

/**
 * Creates a new `Scope` synchronously without wrapping it in an `Effect`.
 * This is useful when you need a scope immediately but should be used with caution
 * as it doesn't provide the same safety guarantees as the `Effect`-wrapped version.
 *
 * **When to use**
 *
 * Use when a scope must be allocated synchronously and the caller will close it
 * manually.
 *
 * **Example** (Creating a scope synchronously)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit, Scope } from "effect"
 *
 * const scope = Scope.makeUnsafe("sequential")
 * const cleanups: Array<string> = []
 * const program = Effect.gen(function*() {
 *   yield* Scope.addFinalizer(scope, Effect.sync(() => cleanups.push("Cleanup")))
 *   yield* Scope.close(scope, Exit.void)
 * })
 *
 * Effect.runSync(program)
 * cleanups // => ["Cleanup"]
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const makeUnsafe: (finalizerStrategy?: "sequential" | "parallel") => Closeable = effect.scopeMakeUnsafe

/**
 * Provides a concrete `Scope` to an effect.
 *
 * **When to use**
 *
 * Use to run an effect that requires `Scope` with a scope managed by the
 * caller.
 *
 * **Details**
 *
 * Providing the scope removes the `Scope` requirement from the effect context.
 *
 * **Example** (Providing a scope)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit, Scope } from "effect"
 *
 * const events: Array<string> = []
 * const program = Effect.gen(function*() {
 *   const scope = yield* Scope.Scope
 *   yield* Scope.addFinalizer(scope, Effect.sync(() => events.push("cleanup")))
 *   events.push("working")
 * })
 *
 * const withScope = Effect.gen(function*() {
 *   const scope = yield* Scope.make()
 *   yield* Scope.provide(scope)(program)
 *   yield* Scope.close(scope, Exit.void)
 * })
 *
 * Effect.runSync(withScope)
 * events // => ["working", "cleanup"]
 * ```
 *
 * @category combinators
 * @since 4.0.0
 */
export const provide: {
  (value: Scope): <A, E, R>(self: Effect<A, E, R>) => Effect<A, E, Exclude<R, Scope>>
  <A, E, R>(self: Effect<A, E, R>, value: Scope): Effect<A, E, Exclude<R, Scope>>
} = effect.provideScope

/**
 * Registers an exit-aware finalizer on a scope.
 *
 * **When to use**
 *
 * Use when cleanup needs to know whether the scope closed with success,
 * failure, or interruption.
 *
 * **Details**
 *
 * If the scope is open, the finalizer runs when the scope closes and receives
 * the scope's exit value. If the scope is already closed, the finalizer runs
 * immediately with the stored exit value.
 *
 * **Example** (Adding an exit-aware finalizer)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit, Scope } from "effect"
 *
 * const exits: Array<Exit.Exit<unknown, unknown>> = []
 * const withResource = Effect.gen(function*() {
 *   const scope = yield* Scope.make()
 *   yield* Scope.addFinalizerExit(scope, (exit) => Effect.sync(() => exits.push(exit)))
 *   yield* Scope.close(scope, Exit.void)
 * })
 *
 * Effect.runSync(withResource)
 * exits // => [Exit.void]
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const addFinalizerExit: (scope: Scope, finalizer: (exit: Exit<any, any>) => Effect<unknown>) => Effect<void> =
  effect.scopeAddFinalizerExit

/**
 * Registers a finalizer effect on a scope.
 *
 * **Details**
 *
 * If the scope is open, the finalizer runs when the scope closes, regardless of
 * whether the scope closes successfully or with an error. If the scope is
 * already closed, the finalizer runs immediately.
 *
 * **Example** (Adding finalizers)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit, Scope } from "effect"
 *
 * const events: Array<string> = []
 * const program = Effect.gen(function*() {
 *   const scope = yield* Scope.make()
 *   yield* Scope.addFinalizer(scope, Effect.sync(() => events.push("cleanup 1")))
 *   yield* Scope.addFinalizer(scope, Effect.sync(() => events.push("cleanup 2")))
 *   yield* Scope.addFinalizer(scope, Effect.sync(() => events.push("cleanup 3")))
 *   events.push("work")
 *   yield* Scope.close(scope, Exit.void)
 * })
 *
 * Effect.runSync(program)
 * events // => ["work", "cleanup 3", "cleanup 2", "cleanup 1"]
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const addFinalizer: (scope: Scope, finalizer: Effect<unknown>) => Effect<void> = effect.scopeAddFinalizer

/**
 * Creates a closeable child scope registered with a parent scope.
 *
 * **Details**
 *
 * Closing the parent closes the child with the same exit value, and closing the
 * child detaches it from the parent. The optional finalizer strategy configures
 * the child scope and defaults to `"sequential"` when omitted.
 *
 * **Example** (Creating a child scope)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit, Scope } from "effect"
 *
 * const cleanups: Array<string> = []
 * const nestedScopes = Effect.gen(function*() {
 *   const parentScope = yield* Scope.make("sequential")
 *   yield* Scope.addFinalizer(parentScope, Effect.sync(() => cleanups.push("parent")))
 *   const childScope = yield* Scope.fork(parentScope, "parallel")
 *   yield* Scope.addFinalizer(childScope, Effect.sync(() => cleanups.push("child")))
 *   yield* Scope.close(childScope, Exit.void)
 *   yield* Scope.close(parentScope, Exit.void)
 * })
 *
 * Effect.runSync(nestedScopes)
 * cleanups // => ["child", "parent"]
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const fork: (
  scope: Scope,
  finalizerStrategy?: "sequential" | "parallel"
) => Effect<Closeable> = effect.scopeFork

/**
 * Creates a closeable child scope synchronously and registers it with a parent scope.
 *
 * **When to use**
 *
 * Use when a child scope must be created synchronously and the caller controls
 * both parent and child scope lifetimes.
 *
 * **Details**
 *
 * Closing the parent closes the child with the same exit value, and closing the
 * child detaches it from the parent. The optional finalizer strategy configures
 * the child scope and defaults to `"sequential"` when omitted.
 *
 * **Example** (Creating a child scope synchronously)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit, Scope } from "effect"
 *
 * const cleanups: Array<string> = []
 * const program = Effect.gen(function*() {
 *   const parentScope = Scope.makeUnsafe("sequential")
 *   const childScope = Scope.forkUnsafe(parentScope, "parallel")
 *   yield* Scope.addFinalizer(parentScope, Effect.sync(() => cleanups.push("parent")))
 *   yield* Scope.addFinalizer(childScope, Effect.sync(() => cleanups.push("child")))
 *   yield* Scope.close(childScope, Exit.void)
 *   yield* Scope.close(parentScope, Exit.void)
 * })
 *
 * Effect.runSync(program)
 * cleanups // => ["child", "parent"]
 * ```
 *
 * @category combinators
 * @since 4.0.0
 */
export const forkUnsafe: (scope: Scope, finalizerStrategy?: "sequential" | "parallel") => Closeable =
  effect.scopeForkUnsafe

/**
 * Closes a scope and runs its registered finalizers.
 *
 * **When to use**
 *
 * Use to close a scope manually with a specific exit value.
 *
 * **Details**
 *
 * Finalizers run in the scope's configured order and receive the supplied
 * `Exit`.
 * By default, finalizers run uninterruptibly, so interrupting the closing fiber
 * waits for them to finish; a finalizer can explicitly restore interruptibility.
 *
 * **Example** (Running scope finalizers)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit, Scope } from "effect"
 *
 * const events: Array<string> = []
 * const resourceManagement = Effect.gen(function*() {
 *   const scope = yield* Scope.make("sequential")
 *   yield* Scope.addFinalizer(scope, Effect.sync(() => events.push("database")))
 *   yield* Scope.addFinalizer(scope, Effect.sync(() => events.push("file")))
 *   yield* Scope.addFinalizer(scope, Effect.sync(() => events.push("memory")))
 *   events.push("work")
 *   yield* Scope.close(scope, Exit.succeed("Success!"))
 * })
 *
 * Effect.runSync(resourceManagement)
 * events // => ["work", "memory", "file", "database"]
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const close: <A, E>(self: Closeable, exit: Exit<A, E>) => Effect<void> = effect.scopeClose

/**
 * Closes a scope unsafely with the provided exit value.
 *
 * **When to use**
 *
 * Use when implementing lower-level scope machinery that must transition a
 * scope to `Closed` immediately and can run the returned finalizer effect when
 * one is produced.
 *
 * **Details**
 *
 * Returns an effect that runs registered finalizers, or `undefined` when the
 * scope was already closed or no finalizers need to run.
 *
 * **Gotchas**
 *
 * Ignoring the returned effect skips registered finalizers. The caller must
 * run the returned effect uninterruptibly: the scope is already closed, so
 * interruption during finalization can permanently skip remaining finalizers.
 *
 * @see {@link close} for the usual effectful close operation that always returns an `Effect`
 *
 * @category unsafe
 * @since 4.0.0
 */
export const closeUnsafe: <A, E>(self: Closeable, exit_: Exit<A, E>) => Effect<void, never, never> | undefined =
  effect.scopeCloseUnsafe

/**
 * Runs an effect with the provided closeable scope in its context and closes
 * that scope when the effect exits.
 *
 * **When to use**
 *
 * Use when you already have a `Closeable` scope and want to run an effect that
 * requires `Scope` while automatically closing that scope when the effect exits.
 *
 * **Details**
 *
 * The scope is closed with the same exit value as the effect, so registered
 * finalizers can observe whether the effect succeeded, failed, or was
 * interrupted.
 *
 * @see `provide` for providing a scope without closing it automatically
 * @see `Effect.scoped` for creating and closing a fresh scope around a workflow
 *
 * @category combinators
 * @since 2.0.0
 */
export const use: {
  (scope: Closeable): <A, E, R>(self: Effect<A, E, R>) => Effect<A, E, Exclude<R, Scope>>
  <A, E, R>(self: Effect<A, E, R>, scope: Closeable): Effect<A, E, Exclude<R, Scope>>
} = effect.scopeUse
