/**
 * Creates refreshable references to a single layer-built service context.
 *
 * A `LayerRef<I, E>` builds one `Layer` into a cached `Context<I>`, exposes it
 * back as a layer or scoped effect, and supports invalidation so later users can
 * acquire a fresh context.
 *
 * @since 4.0.0
 */
import * as Context from "./Context.ts"
import type * as Duration from "./Duration.ts"
import * as Effect from "./Effect.ts"
import { identity } from "./Function.ts"
import { getStackTraceLimit, setStackTraceLimit } from "./internal/stackTraceLimit.ts"
import * as Layer from "./Layer.ts"
import * as RcRef from "./RcRef.ts"
import type * as Schedule from "./Schedule.ts"
import * as Scope from "./Scope.ts"
import type { Mutable } from "./Types.ts"

const TypeId = "~effect/LayerRef"

/**
 * A refreshable reference to a single layer-built service context.
 *
 * **When to use**
 *
 * Use when you want to share one scoped layer resource across many users while
 * retaining the ability to invalidate it and rebuild it later.
 *
 * **Details**
 *
 * A `LayerRef` is the unkeyed counterpart to a layer cache: it lazily builds the
 * layer on first use, reuses the resulting context while it is borrowed or kept
 * idle, and can invalidate the cached context so the next use rebuilds it.
 *
 * @see {@link make} for constructing a `LayerRef` from a layer
 * @see {@link Service} for defining a `LayerRef` as a service class
 *
 * @category models
 * @since 4.0.0
 */
export interface LayerRef<in out I, in out E = never> {
  readonly [TypeId]: typeof TypeId

  /**
   * The underlying reference-counted cache that stores the built context.
   */
  readonly rcRef: RcRef.RcRef<Context.Context<I>, E>

  /**
   * Layer that provides the currently cached context, acquiring it if needed.
   */
  readonly get: Layer.Layer<I, E>

  /**
   * Scoped effect that retrieves the currently cached context, acquiring it if needed.
   */
  readonly contextEffect: Effect.Effect<Context.Context<I>, E, Scope.Scope>

  /**
   * Invalidates the cached context so the next use rebuilds the layer.
   */
  readonly invalidate: Effect.Effect<void>

  /**
   * Invalidates the cached context so the next use rebuilds the layer, and
   * reacquires it.
   */
  readonly refresh: Effect.Effect<void, E>
}

/**
 * Creates a `LayerRef` from a `Layer`.
 *
 * **When to use**
 *
 * Use when you have one layer-built resource that should be shared, optionally
 * kept alive while idle, and refreshed on demand.
 *
 * **Details**
 *
 * The layer is built lazily on first use unless `preload` is `true`.
 * `idleTimeToLive` keeps the context cached after it stops being used, and
 * `invalidationSchedule` can periodically invalidate it. When `preload` is
 * `true`, scheduled invalidation also reacquires the context.
 *
 * **Gotchas**
 *
 * Invalidation does not revoke contexts already borrowed by active scopes; those
 * contexts remain usable until their scopes close.
 *
 * **Example** (Sharing one layer-built service)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Layer, LayerRef } from "effect"
 *
 * class Database extends Context.Service<Database, {
 *   readonly query: Effect.Effect<string>
 * }>()("Database") {}
 *
 * const databaseLayer = Layer.succeed(Database, {
 *   query: Effect.succeed("result")
 * })
 *
 * const query = Effect.gen(function*() {
 *   const database = yield* Database
 *   return yield* database.query
 * })
 *
 * const program = Effect.scoped(
 *   Effect.gen(function*() {
 *     const ref = yield* LayerRef.make(databaseLayer, {
 *       idleTimeToLive: "5 seconds"
 *     })
 *
 *     const result = yield* Effect.provide(query, ref.get)
 *
 *     yield* ref.invalidate
 *
 *     return result
 *   })
 * )
 *
 * await Effect.runPromise(program) // => "result"
 * ```
 *
 * @see {@link Service} for defining a reusable service class around a `LayerRef`
 *
 * @category constructors
 * @since 4.0.0
 */
export const make = Effect.fnUntraced(
  function*<I, E, R, X, const Preload extends boolean = never, SE = never, SR = never>(
    layer: Layer.Layer<I, E, R>,
    options?: {
      /**
       * Duration to keep the resource alive after it is no longer used.
       */
      readonly idleTimeToLive?: Duration.Input | undefined
      /**
       * Whether to acquire the resource during creation.
       */
      readonly preload?: Preload | undefined
      /**
       * Schedule used to invalidate the cached resource. When `preload` is
       * `true`, each scheduled invalidation also reacquires the resource.
       */
      readonly invalidationSchedule?: Schedule.Schedule<X, unknown, SE, SR> | undefined
    } | undefined
  ): Effect.fn.Return<
    LayerRef<I, E>,
    [Preload] extends [true] ? E : never,
    Scope.Scope | R | SR
  > {
    const context = yield* Effect.context<never>()
    const memoMap = Layer.CurrentMemoMap.forkOrCreate(context)

    const rcRef = yield* RcRef.make({
      acquire: Effect.contextWith((_: Context.Context<Scope.Scope>) =>
        Layer.buildWithMemoMap(layer, memoMap, Context.get(_, Scope.Scope))
      ),
      idleTimeToLive: options?.idleTimeToLive
    })

    const refresh = RcRef.invalidate(rcRef).pipe(
      Effect.andThen(Effect.scoped(RcRef.get(rcRef))),
      Effect.asVoid
    )

    if (options?.preload) {
      yield* refresh as Effect.Effect<void>
    }

    if (options?.invalidationSchedule) {
      const onRefresh = options.preload ? refresh : RcRef.invalidate(rcRef)
      yield* onRefresh.pipe(
        Effect.ignoreCause,
        Effect.schedule(options.invalidationSchedule),
        Effect.forkScoped
      )
    }

    return identity<LayerRef<I, any>>({
      [TypeId]: TypeId,
      rcRef,
      get: Layer.effectContext(RcRef.get(rcRef)),
      contextEffect: RcRef.get(rcRef),
      invalidate: RcRef.invalidate(rcRef),
      refresh
    })
  }
)

/**
 * Service class shape produced by `LayerRef.Service`.
 *
 * **When to use**
 *
 * Use as the public type for classes returned by `LayerRef.Service` when an API
 * needs to accept, return, or alias the generated service class and its static
 * helpers.
 *
 * **Details**
 *
 * It combines a `Context.Service` tag for the `LayerRef` with default layers and
 * helper accessors for retrieving, using, and invalidating the cached resource.
 *
 * @see {@link Service} for creating concrete `LayerRef` service classes
 *
 * @category services
 * @since 4.0.0
 */
export interface TagClass<
  in out Self,
  in out Id extends string,
  in out I,
  in out E,
  in out R,
  in out LE,
  in out Deps extends Layer.Layer<any, any, any>
> extends Context.ServiceClass<Self, Id, LayerRef<I, E>> {
  /**
   * Default layer for the `LayerRef` service, with dependencies applied.
   */
  readonly layer: Layer.Layer<
    Self,
    (Deps extends Layer.Layer<infer _A, infer _E, infer _R> ? _E : never) | LE,
    | Exclude<R, (Deps extends Layer.Layer<infer _A, infer _E, infer _R> ? _A : never)>
    | (Deps extends Layer.Layer<infer _A, infer _E, infer _R> ? _R : never)
  >

  /**
   * Default layer for the `LayerRef` service without provided dependencies.
   */
  readonly layerNoDeps: Layer.Layer<Self, LE, R>

  /**
   * Layer that provides the currently cached context, requiring this service.
   */
  readonly get: Layer.Layer<I, E, Self>

  /**
   * Scoped effect that retrieves the currently cached context through this service.
   */
  readonly contextEffect: Effect.Effect<Context.Context<I>, E, Scope.Scope | Self>

  /**
   * Invalidates the cached context through this service.
   */
  readonly invalidate: Effect.Effect<void, never, Self>

  /**
   * Invalidates the cached context through this service, and reacquires it.
   */
  readonly refresh: Effect.Effect<void, E, Self>
}

/**
 * Creates a service class for a `LayerRef`.
 *
 * **When to use**
 *
 * Use when you want to name a shared layer reference as an application service
 * and expose static helpers for providing, retrieving, and invalidating it.
 *
 * **Details**
 *
 * The returned class is a `Context.Service` whose value is a `LayerRef`. It also
 * includes `.layer`, `.layerNoDeps`, `.get`, `.contextEffect`, and `.invalidate`
 * helpers so callers do not need to access the `LayerRef` value directly.
 *
 * **Example** (Defining a refreshable service)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Layer, LayerRef } from "effect"
 *
 * class Database extends Context.Service<Database, {
 *   readonly query: Effect.Effect<string>
 * }>()("Database") {}
 *
 * const databaseLayer = Layer.succeed(Database, {
 *   query: Effect.succeed("result")
 * })
 *
 * class DatabaseRef extends LayerRef.Service<DatabaseRef>()("DatabaseRef", {
 *   layer: databaseLayer,
 *   preload: true
 * }) {}
 *
 * const program = Effect.gen(function*() {
 *   const database = yield* Database
 *   return yield* database.query
 * }).pipe(
 *   Effect.provide(DatabaseRef.get),
 *   Effect.provide(DatabaseRef.layer)
 * )
 *
 * await Effect.runPromise(program) // => "result"
 * ```
 *
 * @see {@link make} for creating a `LayerRef` value without defining a service class
 *
 * @category services
 * @since 4.0.0
 */
export const Service = <Self>() =>
<
  const Id extends string,
  I,
  E,
  R,
  X,
  const Deps extends ReadonlyArray<Layer.Layer<any, any, any>> = [],
  const Preload extends boolean = never,
  SE = never,
  SR = never
>(
  id: Id,
  options: {
    /**
     * Layer used to build the cached context.
     */
    readonly layer: Layer.Layer<I, E, R>
    /**
     * Layers used to satisfy dependencies of the `LayerRef` service layer.
     */
    readonly dependencies?: Deps | undefined
    /**
     * Duration to keep the resource alive after it is no longer used.
     */
    readonly idleTimeToLive?: Duration.Input | undefined
    /**
     * Whether to acquire the resource during creation.
     */
    readonly preload?: Preload | undefined
    /**
     * Schedule used to invalidate the cached resource. When `preload` is
     * `true`, each scheduled invalidation also reacquires the resource.
     */
    readonly invalidationSchedule?: Schedule.Schedule<X, unknown, SE, SR> | undefined
  }
): TagClass<
  Self,
  Id,
  I,
  E,
  R | SR,
  [Preload] extends [true] ? E : never,
  Deps[number]
> => {
  const limit = getStackTraceLimit()
  let creationError: Error | undefined
  if (limit !== 0) {
    setStackTraceLimit(2)
    creationError = new globalThis.Error()
    setStackTraceLimit(limit)
  }

  function TagClass() {}
  const TagClass_ = TagClass as any as Mutable<TagClass<Self, Id, any, any, any, any, any>>
  Object.setPrototypeOf(TagClass, Object.getPrototypeOf(Context.Service<Self, any>(id)))
  TagClass.key = id
  Object.defineProperty(TagClass, "stack", {
    get() {
      return creationError?.stack
    }
  })

  TagClass_.layerNoDeps = Layer.effect(TagClass_)(
    make(options.layer, options)
  )
  TagClass_.layer = options.dependencies && options.dependencies.length > 0 ?
    Layer.provide(TagClass_.layerNoDeps, options.dependencies as any) :
    TagClass_.layerNoDeps

  TagClass_.get = Layer.unwrap(TagClass_.useSync((ref) => ref.get))
  TagClass_.contextEffect = TagClass_.use((ref) => ref.contextEffect)
  TagClass_.invalidate = TagClass_.use((ref) => ref.invalidate)
  TagClass_.refresh = TagClass_.use((ref) => ref.refresh)

  return TagClass as any
}
