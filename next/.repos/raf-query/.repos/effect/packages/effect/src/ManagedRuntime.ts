/**
 * Runs many effects against services built once from a `Layer`.
 *
 * A `ManagedRuntime` builds the services from a layer, keeps those services
 * available for repeated effect runs, and releases acquired resources when it
 * is disposed. This module includes the runtime type, a constructor, a guard,
 * and runners for connecting Effect programs to JavaScript entry points such as
 * promises, callbacks, and synchronous code.
 *
 * @since 2.0.0
 */
import type * as Context from "./Context.ts"
import * as Effect from "./Effect.ts"
import * as Exit from "./Exit.ts"
import * as Fiber from "./Fiber.ts"
import * as Layer from "./Layer.ts"
import { hasProperty } from "./Predicate.ts"
import * as Scope from "./Scope.ts"
import type { Mutable } from "./Types.ts"

const TypeId = "~effect/ManagedRuntime"

/**
 * Checks whether the provided argument is a `ManagedRuntime`.
 *
 * **When to use**
 *
 * Use to narrow an unknown value before treating it as a `ManagedRuntime`.
 *
 * **Details**
 *
 * The guard checks the internal `ManagedRuntime` marker property. It does not
 * build the layer or inspect the runtime's services.
 *
 * **Gotchas**
 *
 * Disposed runtimes still carry the marker, so this guard does not prove the
 * runtime is still usable.
 *
 * @see {@link make} for creating managed runtimes this guard recognizes
 *
 * @category guards
 * @since 3.9.0
 */
export const isManagedRuntime = (input: unknown): input is ManagedRuntime<unknown, unknown> =>
  hasProperty(input, TypeId)

/**
 * Type helpers associated with `ManagedRuntime`.
 *
 * **When to use**
 *
 * Use to reference type-level helpers for extracting managed runtime services
 * and layer errors.
 *
 * @since 3.4.0
 */
export declare namespace ManagedRuntime {
  /**
   * Extracts the services available from a `ManagedRuntime`.
   *
   * **When to use**
   *
   * Use to derive the service requirements provided by an existing
   * `ManagedRuntime` type.
   *
   * @category utility types
   * @since 3.4.0
   */
  export type Services<T extends ManagedRuntime<never, any>> = [T] extends [ManagedRuntime<infer R, infer _E>] ? R
    : never
  /**
   * Extracts the layer construction error type of a `ManagedRuntime`.
   *
   * **When to use**
   *
   * Use to derive the layer construction error type from an existing
   * `ManagedRuntime` type.
   *
   * @category utility types
   * @since 3.4.0
   */
  export type Error<T extends ManagedRuntime<never, any>> = [T] extends [ManagedRuntime<infer _R, infer E>] ? E : never
}

/**
 * A runtime built from a layer that can execute effects requiring that layer's
 * services.
 *
 * **When to use**
 *
 * Use as the reusable runtime value returned by `make` when application entry
 * points or integration code need to run many effects against the same
 * layer-built services.
 *
 * **Details**
 *
 * The runtime builds and caches its service context and owns the scope for
 * resources acquired by the layer.
 *
 * **Gotchas**
 *
 * Dispose the runtime with `dispose` or `disposeEffect` when it is no longer
 * needed.
 *
 * @see {@link make} for constructing a managed runtime from a layer
 * @see {@link Layer.build} for lower-level scoped layer construction
 *
 * @category models
 * @since 2.0.0
 */
export interface ManagedRuntime<in R, out ER> {
  readonly [TypeId]: typeof TypeId
  readonly memoMap: Layer.MemoMap
  readonly contextEffect: Effect.Effect<Context.Context<R>, ER>
  readonly context: () => Promise<Context.Context<R>>

  // internal
  readonly scope: Scope.Closeable
  // internal
  cachedContext: Context.Context<R> | undefined

  /**
   * Executes the effect using the provided Scheduler or using the global
   * Scheduler if not provided
   *
   * **When to use**
   *
   * Use to fork an effect against this runtime's services and get the running
   * fiber.
   */
  readonly runFork: <A, E>(
    self: Effect.Effect<A, E, R>,
    options?: Effect.RunOptions
  ) => Fiber.Fiber<A, E | ER>

  /**
   * Executes the effect synchronously returning the exit.
   *
   * **When to use**
   *
   * Use when invoking this effectful method at the edges of your
   * program.
   */
  readonly runSyncExit: <A, E>(effect: Effect.Effect<A, E, R>) => Exit.Exit<A, ER | E>

  /**
   * Executes the effect synchronously throwing in case of errors or async boundaries.
   *
   * **When to use**
   *
   * Use when invoking this effectful method at the edges of your
   * program.
   */
  readonly runSync: <A, E>(effect: Effect.Effect<A, E, R>) => A

  /**
   * Executes the effect asynchronously, eventually passing the exit value to
   * the specified callback.
   *
   * **When to use**
   *
   * Use when invoking this effectful method at the edges of your
   * program.
   */
  readonly runCallback: <A, E>(
    effect: Effect.Effect<A, E, R>,
    options?:
      | Effect.RunOptions & {
        readonly onExit: (exit: Exit.Exit<A, E | ER>) => void
      }
      | undefined
  ) => (interruptor?: number | undefined) => void

  /**
   * Runs the `Effect`, returning a JavaScript `Promise` that will be resolved
   * with the value of the effect once the effect has been executed, or will be
   * rejected with the first error or exception throw by the effect.
   *
   * **When to use**
   *
   * Use when invoking this effectful method at the edges of your
   * program.
   */
  readonly runPromise: <A, E>(effect: Effect.Effect<A, E, R>, options?: Effect.RunOptions) => Promise<A>

  /**
   * Runs the `Effect`, returning a JavaScript `Promise` that will be resolved
   * with the `Exit` state of the effect once the effect has been executed.
   *
   * **When to use**
   *
   * Use when invoking this effectful method at the edges of your
   * program.
   */
  readonly runPromiseExit: <A, E>(
    effect: Effect.Effect<A, E, R>,
    options?: Effect.RunOptions
  ) => Promise<Exit.Exit<A, ER | E>>

  /**
   * Dispose of the resources associated with the runtime.
   *
   * **When to use**
   *
   * Use to release this runtime's layer resources from Promise-based code.
   */
  readonly dispose: () => Promise<void>

  /**
   * Dispose of the resources associated with the runtime.
   *
   * **When to use**
   *
   * Use with the `await using` syntax to automatically dispose the runtime
   * when it goes out of scope.
   */
  readonly [Symbol.asyncDispose]: () => Promise<void>

  /**
   * Dispose of the resources associated with the runtime.
   *
   * **When to use**
   *
   * Use to release this runtime's layer resources from an `Effect` workflow.
   */
  readonly disposeEffect: Effect.Effect<void, never, never>
}

/**
 * Creates a `ManagedRuntime` from a layer.
 *
 * **When to use**
 *
 * Use to create a reusable runtime from a `Layer` for application entry points
 * or integration code that runs many effects without rebuilding services.
 *
 * **Details**
 *
 * The layer is built lazily on first use and its context is cached for
 * subsequent runs. Resources acquired by the layer are owned by the runtime and
 * are released when `dispose` or `disposeEffect` is run. `options.memoMap` can
 * be used to share layer memoization with other layer builds.
 *
 * **Gotchas**
 *
 * Dispose the runtime when it is no longer needed. A runtime cannot be reused
 * after disposal.
 *
 * **Example** (Creating a managed runtime)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Layer, ManagedRuntime } from "effect"
 *
 * const notifications: Array<string> = []
 *
 * class Notifications extends Context.Service<Notifications, {
 *   readonly notify: (message: string) => Effect.Effect<void>
 * }>()("Notifications") {
 *   static readonly layer = Layer.succeed(this)({
 *     notify: Effect.fn("Notifications.notify")((message) =>
 *       Effect.sync(() => notifications.push(message))
 *     )
 *   })
 * }
 *
 * const runtime = ManagedRuntime.make(Notifications.layer)
 *
 * const program = Effect.flatMap(
 *   Notifications,
 *   (_) => _.notify("Hello, world!")
 * ).pipe(Effect.ensuring(runtime.disposeEffect))
 *
 * await runtime.runPromise(program)
 * notifications // => ["Hello, world!"]
 * ```
 *
 * @see {@link ManagedRuntime} for the returned runtime interface
 * @see {@link Layer.MemoMap} for shared layer memoization
 * @see {@link Layer.build} for lower-level scoped layer construction
 *
 * @category constructors
 * @since 2.0.0
 */
export const make = <R, ER>(
  layer: Layer.Layer<R, ER, never>,
  options?: {
    readonly memoMap?: Layer.MemoMap | undefined
  } | undefined
): ManagedRuntime<R, ER> => {
  const memoMap = options?.memoMap ?? Layer.makeMemoMapUnsafe()
  const scope = Scope.makeUnsafe("sequential")
  const layerScope = Scope.forkUnsafe(scope, "sequential")
  const fiberScope = Scope.forkUnsafe(scope, "parallel")
  const defaultRunOptions: Effect.RunOptions = {
    onFiberStart: Fiber.runIn(fiberScope)
  }
  const mergeRunOptions = <O extends Effect.RunOptions>(options?: O): O =>
    options
      ? {
        ...options,
        onFiberStart: options.onFiberStart ?
          (fiber) => {
            defaultRunOptions.onFiberStart!(fiber)
            options.onFiberStart!(fiber)
          } :
          defaultRunOptions.onFiberStart
      }
      : defaultRunOptions as O
  let buildFiber: Fiber.Fiber<Context.Context<R>, ER> | undefined
  const contextEffect = Effect.withFiber<Context.Context<R>, ER>((fiber) => {
    if (!buildFiber) {
      buildFiber = Effect.runFork(
        Effect.tap(
          Layer.buildWithMemoMap(layer, memoMap, layerScope),
          (context) =>
            Effect.sync(() => {
              self.cachedContext = context
            })
        ),
        { ...defaultRunOptions, scheduler: fiber.cache.scheduler }
      )
    }
    return Effect.flatten(Fiber.await(buildFiber))
  })
  const self: ManagedRuntime<R, ER> = {
    [TypeId]: TypeId,
    memoMap,
    scope,
    contextEffect: contextEffect,
    cachedContext: undefined,
    context() {
      return self.cachedContext === undefined ?
        Effect.runPromise(self.contextEffect) :
        Promise.resolve(self.cachedContext)
    },
    dispose(): Promise<void> {
      return Effect.runPromise(self.disposeEffect)
    },
    [Symbol.asyncDispose](): Promise<void> {
      return self.dispose()
    },
    disposeEffect: Effect.suspend(() => {
      ;(self as Mutable<ManagedRuntime<R, ER>>).contextEffect = Effect.die("ManagedRuntime disposed")
      self.cachedContext = undefined
      return Scope.close(self.scope, Exit.void)
    }),
    runFork<A, E>(effect: Effect.Effect<A, E, R>, options?: Effect.RunOptions): Fiber.Fiber<A, E | ER> {
      return self.cachedContext === undefined ?
        Effect.runFork(provide(self, effect), mergeRunOptions(options)) :
        Effect.runForkWith(self.cachedContext)(effect, mergeRunOptions(options))
    },
    runCallback<A, E>(
      effect: Effect.Effect<A, E, R>,
      options?: Effect.RunOptions & {
        readonly onExit: (exit: Exit.Exit<A, E | ER>) => void
      }
    ): (interruptor?: number | undefined) => void {
      return self.cachedContext === undefined ?
        Effect.runCallback(provide(self, effect), mergeRunOptions(options)) :
        Effect.runCallbackWith(self.cachedContext)(effect, mergeRunOptions(options))
    },
    runSyncExit<A, E>(effect: Effect.Effect<A, E, R>): Exit.Exit<A, E | ER> {
      return self.cachedContext === undefined ?
        Effect.runSyncExit(provide(self, effect)) :
        Effect.runSyncExitWith(self.cachedContext)(effect)
    },
    runSync<A, E>(effect: Effect.Effect<A, E, R>): A {
      return self.cachedContext === undefined ?
        Effect.runSync(provide(self, effect)) :
        Effect.runSyncWith(self.cachedContext)(effect)
    },
    runPromiseExit<A, E>(effect: Effect.Effect<A, E, R>, options?: Effect.RunOptions): Promise<Exit.Exit<A, E | ER>> {
      return self.cachedContext === undefined ?
        Effect.runPromiseExit(provide(self, effect), mergeRunOptions(options)) :
        Effect.runPromiseExitWith(self.cachedContext)(effect, mergeRunOptions(options))
    },
    runPromise<A, E>(effect: Effect.Effect<A, E, R>, options?: {
      readonly signal?: AbortSignal | undefined
    }): Promise<A> {
      return self.cachedContext === undefined ?
        Effect.runPromise(provide(self, effect), mergeRunOptions(options)) :
        Effect.runPromiseWith(self.cachedContext)(effect, mergeRunOptions(options))
    }
  }
  return self
}

function provide<R, ER, A, E>(
  managed: ManagedRuntime<R, ER>,
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E | ER> {
  return Effect.flatMap(
    managed.contextEffect,
    (context) => Effect.provideContext(effect, context)
  )
}
