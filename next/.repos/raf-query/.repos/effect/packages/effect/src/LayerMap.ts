/**
 * Caches scoped services selected by key and built from layers.
 *
 * A `LayerMap<K, I, E>` turns a key into a cached service `Context<I>` and
 * exposes that context as either a `Layer` or a scoped effect. Entries can be
 * invalidated explicitly or released after they sit unused. This is useful for
 * keyed resource families such as tenant clients, regional connections, or
 * environment-specific services.
 *
 * @since 3.14.0
 */
import * as Context from "./Context.ts"
import * as Duration from "./Duration.ts"
import * as Effect from "./Effect.ts"
import { identity } from "./Function.ts"
import { getStackTraceLimit, setStackTraceLimit } from "./internal/stackTraceLimit.ts"
import * as Layer from "./Layer.ts"
import type * as Option from "./Option.ts"
import * as RcMap from "./RcMap.ts"
import * as Scope from "./Scope.ts"
import type { Mutable, NoExcessProperties } from "./Types.ts"

const TypeId = "~effect/LayerMap"

type IdleTimeToLiveInput<K> = Duration.Input | ((key: K) => Duration.Input)

/**
 * A scoped, keyed map of layer-built service contexts.
 *
 * **Details**
 *
 * A `LayerMap` builds resources for a key on demand, exposes them as a `Layer`
 * or scoped `Context`, and can invalidate cached resources for a key.
 *
 * **Example** (Managing keyed layers)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Layer, LayerMap } from "effect"
 *
 * // Define a service key
 * const DatabaseService = Context.Service<{
 *   readonly query: (sql: string) => Effect.Effect<string>
 * }>("Database")
 *
 * // Create a LayerMap that provides different database configurations
 * const createDatabaseLayerMap = LayerMap.make((env: string) =>
 *   Layer.succeed(DatabaseService)({
 *     query: Effect.fn("DatabaseService.query")((sql) => Effect.succeed(`${env}: ${sql}`))
 *   })
 * )
 *
 * // Use the LayerMap
 * const program = Effect.gen(function*() {
 *   const layerMap = yield* createDatabaseLayerMap
 *
 *   // Get a layer for a specific environment
 *   const development = yield* Effect.provide(
 *     DatabaseService.use((database) => database.query("SELECT 1")),
 *     layerMap.get("development")
 *   )
 *
 *   // Get context directly
 *   const productionContext = yield* layerMap.contextEffect("production")
 *   const production = yield* Context.get(productionContext, DatabaseService).query("SELECT 1")
 *
 *   // Invalidate a cached layer
 *   yield* layerMap.invalidate("development")
 *
 *   return { development, production }
 * })
 *
 * await Effect.runPromise(Effect.scoped(program)) // => { development: "development: SELECT 1", production: "production: SELECT 1" }
 * ```
 *
 * @category models
 * @since 3.14.0
 */
export interface LayerMap<in out K, in out I, in out E = never> {
  readonly [TypeId]: typeof TypeId

  /**
   * The internal RcMap that stores the resources.
   */
  readonly rcMap: RcMap.RcMap<K, Context.Context<I>, E>

  /**
   * Retrieves a Layer for the resources associated with the key.
   */
  get(key: K): Layer.Layer<I, E>

  /**
   * Retrieves the context associated with the key.
   */
  contextEffect(key: K): Effect.Effect<Context.Context<I>, E, Scope.Scope>

  /**
   * Retains and returns the context for a key only when it is currently cached.
   *
   * **Details**
   *
   * `Option.none` means no entry is currently cached or the `LayerMap` is closed;
   * no layer is built for a missing key. An existing in-flight entry is awaited.
   *
   * @since 4.0.0
   */
  contextEffectOption(key: K): Effect.Effect<Option.Option<Context.Context<I>>, E, Scope.Scope>

  /**
   * Invalidates the resource associated with the key.
   */
  invalidate(key: K): Effect.Effect<void>
}

/**
 * Creates a `LayerMap` that dynamically provides resources based on a key.
 *
 * **Example** (Creating a layer map)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Layer, LayerMap } from "effect"
 *
 * // Define a service key
 * const DatabaseService = Context.Service<{
 *   readonly query: (sql: string) => Effect.Effect<string>
 * }>("Database")
 *
 * // Create a LayerMap that provides different database configurations
 * const program = Effect.gen(function*() {
 *   const layerMap = yield* LayerMap.make(
 *     (env: string) =>
 *       Layer.succeed(DatabaseService)({
 *         query: Effect.fn("DatabaseService.query")((sql) => Effect.succeed(`${env}: ${sql}`))
 *       }),
 *     { idleTimeToLive: "5 seconds" }
 *   )
 *
 *   // Get a layer for a specific environment
 *   const devLayer = layerMap.get("development")
 *
 *   // Use the layer to provide the service
 *   return yield* Effect.provide(
 *     Effect.gen(function*() {
 *       const db = yield* DatabaseService
 *       return yield* db.query("SELECT * FROM users")
 *     }),
 *     devLayer
 *   )
 * })
 *
 * await Effect.runPromise(Effect.scoped(program)) // => "development: SELECT * FROM users"
 * ```
 *
 * @category constructors
 * @since 3.14.0
 */
export const make: <
  K,
  L extends Layer.Layer<any, any, any>,
  PreloadKeys extends Iterable<K> | undefined = undefined
>(
  lookup: (key: K) => L,
  options?: {
    readonly idleTimeToLive?: IdleTimeToLiveInput<K> | undefined
    /**
     * Preloaded entries are retained only for their idle TTL. Keys whose idle
     * TTL is zero are not preloaded (including when no TTL is specified).
     */
    readonly preloadKeys?: PreloadKeys
  } | undefined
) => Effect.Effect<
  LayerMap<K, Layer.Success<L>, Layer.Error<L>>,
  PreloadKeys extends undefined ? never : Layer.Error<L>,
  Scope.Scope | Layer.Services<L>
> = Effect.fnUntraced(function*<I, K, EL, RL>(
  lookup: (key: K) => Layer.Layer<I, EL, RL>,
  options?: {
    readonly idleTimeToLive?: IdleTimeToLiveInput<K> | undefined
    readonly preloadKeys?: Iterable<K> | undefined
  } | undefined
) {
  const context = yield* Effect.context<never>()
  const memoMap = Layer.CurrentMemoMap.forkOrCreate(context)

  const rcMap = yield* RcMap.make({
    lookup: (key: K) =>
      Effect.contextWith((_: Context.Context<Scope.Scope>) =>
        Layer.buildWithMemoMap(lookup(key), memoMap, Context.get(_, Scope.Scope))
      ),
    idleTimeToLive: options?.idleTimeToLive
  })

  if (options?.preloadKeys) {
    for (const key of options.preloadKeys) {
      if (!Duration.isZero(rcMap.idleTimeToLive(key))) {
        yield* Effect.scoped(RcMap.get(rcMap, key))
      }
    }
  }

  return identity<LayerMap<K, I, any>>({
    [TypeId]: TypeId,
    rcMap,
    get: (key) => Layer.effectContext(RcMap.get(rcMap, key)),
    contextEffect: (key) => RcMap.get(rcMap, key),
    contextEffectOption: (key) => RcMap.getOption(rcMap, key),
    invalidate: (key) => RcMap.invalidate(rcMap, key)
  })
})

/**
 * Creates a `LayerMap` from a record of predefined layers.
 *
 * **Details**
 *
 * The record keys become the keys accepted by the returned `LayerMap`, and the
 * record values are the layers built for those keys.
 *
 * **Example** (Creating a layer map from a record)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Layer, LayerMap } from "effect"
 *
 * // Define a service key
 * const Database = Context.Service<{
 *   readonly query: (sql: string) => Effect.Effect<string>
 * }>("Database")
 *
 * // Create predefined layers
 * const layers = {
 *   development: Layer.succeed(Database)({
 *     query: Effect.fn("DevDatabase.query")((sql) => Effect.succeed(`DEV: ${sql}`))
 *   }),
 *   production: Layer.succeed(Database)({
 *     query: Effect.fn("ProdDatabase.query")((sql) => Effect.succeed(`PROD: ${sql}`))
 *   })
 * } as const
 *
 * // Create a LayerMap from the record
 * const program = Effect.gen(function*() {
 *   const layerMap = yield* LayerMap.fromRecord(layers, {
 *     idleTimeToLive: "10 seconds"
 *   })
 *
 *   const development = yield* Effect.provide(
 *     Database.use((database) => database.query("SELECT 1")),
 *     layerMap.get("development")
 *   )
 *   const production = yield* Effect.provide(
 *     Database.use((database) => database.query("SELECT 1")),
 *     layerMap.get("production")
 *   )
 *
 *   return { development, production }
 * })
 *
 * await Effect.runPromise(Effect.scoped(program)) // => { development: "DEV: SELECT 1", production: "PROD: SELECT 1" }
 * ```
 *
 * @category constructors
 * @since 3.14.0
 */
export const fromRecord = <
  const Layers extends Record<string, Layer.Layer<any, any, any>>,
  const Preload extends boolean = false
>(
  layers: Layers,
  options?: {
    readonly idleTimeToLive?: IdleTimeToLiveInput<keyof Layers> | undefined
    /**
     * Preloaded entries are retained only for their idle TTL. Keys whose idle
     * TTL is zero are not preloaded (including when no TTL is specified).
     */
    readonly preload?: Preload | undefined
  } | undefined
): Effect.Effect<
  LayerMap<
    keyof Layers,
    Layer.Success<Layers[keyof Layers]>,
    Layer.Error<Layers[keyof Layers]>
  >,
  Preload extends true ? Layer.Error<Layers[keyof Layers]> : never,
  Scope.Scope | (Layers[keyof Layers] extends Layer.Layer<infer _A, infer _E, infer _R> ? _R : never)
> =>
  make((key: keyof Layers) => layers[key], {
    ...options,
    preloadKeys: options?.preload ? Object.keys(layers) : undefined
  }) as any

/**
 * Service class shape produced by `LayerMap.Service`.
 *
 * **When to use**
 *
 * Use as the public type for classes returned by `LayerMap.Service` when an API
 * needs to accept, return, or alias the generated service class and its static
 * helpers.
 *
 * **Details**
 *
 * It combines a `Context.Service` tag for the `LayerMap` with default layers
 * and helper accessors for retrieving, using, and invalidating keyed resources.
 *
 * @see {@link Service} for creating concrete `LayerMap` service classes
 *
 * @category services
 * @since 3.14.0
 */
export interface TagClass<
  in out Self,
  in out Id extends string,
  in out K,
  in out I,
  in out E,
  in out R,
  in out LE,
  in out Deps extends Layer.Layer<any, any, any>
> extends Context.ServiceClass<Self, Id, LayerMap<K, I, E>> {
  /**
   * A default layer for the `LayerMap` service.
   */
  readonly layer: Layer.Layer<
    Self,
    (Deps extends Layer.Layer<infer _A, infer _E, infer _R> ? _E : never) | LE,
    | Exclude<R, (Deps extends Layer.Layer<infer _A, infer _E, infer _R> ? _A : never)>
    | (Deps extends Layer.Layer<infer _A, infer _E, infer _R> ? _R : never)
  >

  /**
   * A default layer for the `LayerMap` service without the dependencies provided.
   */
  readonly layerNoDeps: Layer.Layer<Self, LE, R>

  /**
   * Retrieves a Layer for the resources associated with the key.
   */
  readonly get: (key: K) => Layer.Layer<I, E, Self>

  /**
   * Retrieves the context associated with the key.
   */
  readonly contextEffect: (key: K) => Effect.Effect<Context.Context<I>, E, Scope.Scope | Self>

  /**
   * Retains and returns the context for a key only when it is currently cached.
   *
   * **Details**
   *
   * `Option.none` means no entry is currently cached or the `LayerMap` is closed;
   * no layer is built for a missing key. An existing in-flight entry is awaited.
   *
   * @since 4.0.0
   */
  readonly contextEffectOption: (
    key: K
  ) => Effect.Effect<Option.Option<Context.Context<I>>, E, Scope.Scope | Self>

  /**
   * Invalidates the resource associated with the key.
   */
  readonly invalidate: (key: K) => Effect.Effect<void, never, Self>
}

/**
 * Create a `LayerMap` service that provides a dynamic set of resources based on
 * a key.
 *
 * **Example** (Defining a layer map service)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Layer, LayerMap } from "effect"
 *
 * // Define a service key
 * const Greeter = Context.Service<{
 *   readonly greet: Effect.Effect<string>
 * }>("Greeter")
 *
 * // Create a service that wraps a LayerMap
 * class GreeterMap extends LayerMap.Service<GreeterMap>()("GreeterMap", {
 *   // Define the lookup function for the layer map
 *   lookup: (name: string) =>
 *     Layer.succeed(Greeter)({
 *       greet: Effect.succeed(`Hello, ${name}!`)
 *     }),
 *
 *   // If a layer is not used for a certain amount of time, it can be removed
 *   idleTimeToLive: "5 seconds"
 * }) {}
 *
 * // Usage
 * const program = Effect.gen(function*() {
 *   // Access and use the Greeter service
 *   const greeter = yield* Greeter
 *   return yield* greeter.greet
 * }).pipe(
 *   // Use the GreeterMap service to provide a variant of the Greeter service
 *   Effect.provide(GreeterMap.get("John"))
 * ).pipe(
 *   // Provide the GreeterMap layer
 *   Effect.provide(GreeterMap.layer)
 * )
 *
 * await Effect.runPromise(program) // => "Hello, John!"
 * ```
 *
 * @category services
 * @since 3.14.0
 */
export const Service = <Self>() =>
<
  const Id extends string,
  const Options extends
    | NoExcessProperties<{
      readonly lookup: (key: any) => Layer.Layer<any, any, any>
      readonly dependencies?: ReadonlyArray<Layer.Layer<any, any, any>> | undefined
      readonly idleTimeToLive?: IdleTimeToLiveInput<any> | undefined
      /**
       * Preloaded entries are retained only for their idle TTL. Keys whose idle
       * TTL is zero are not preloaded (including when no TTL is specified).
       */
      readonly preloadKeys?:
        | Iterable<Options extends { readonly lookup: (key: infer K) => any } ? K : never>
        | undefined
    }, Options>
    | NoExcessProperties<{
      readonly layers: Record<string, Layer.Layer<any, any, any>>
      readonly dependencies?: ReadonlyArray<Layer.Layer<any, any, any>> | undefined
      readonly idleTimeToLive?: IdleTimeToLiveInput<any> | undefined
      /**
       * Preloaded entries are retained only for their idle TTL. Keys whose idle
       * TTL is zero are not preloaded (including when no TTL is specified).
       */
      readonly preload?: boolean | undefined
    }, Options>
>(
  id: Id,
  options: Options
): TagClass<
  Self,
  Id,
  Options extends { readonly lookup: (key: infer K) => any } ? K
    : Options extends { readonly layers: infer Layers } ? keyof Layers
    : never,
  Service.Success<Options>,
  Service.Error<Options>,
  Service.Services<Options>,
  Options extends { readonly preload: true } ? Service.Error<Options>
    : Options extends { readonly preloadKeys: Iterable<any> } ? Service.Error<Options>
    : never,
  Options extends { readonly dependencies: ReadonlyArray<Layer.Layer<any, any, any>> } ? Options["dependencies"][number]
    : never
> => {
  const limit = getStackTraceLimit()
  let creationError: Error | undefined
  if (limit !== 0) {
    setStackTraceLimit(2)
    creationError = new globalThis.Error()
    setStackTraceLimit(limit)
  }

  function TagClass() {}
  const TagClass_ = TagClass as any as Mutable<TagClass<Self, Id, string, any, any, any, any, any>>
  Object.setPrototypeOf(TagClass, Object.getPrototypeOf(Context.Service<Self, any>(id)))
  TagClass.key = id
  Object.defineProperty(TagClass, "stack", {
    get() {
      return creationError?.stack
    }
  })

  TagClass_.layerNoDeps = Layer.effect(TagClass_)(
    "lookup" in options
      ? make(options.lookup, options)
      : fromRecord(options.layers as any, options) as any
  )
  TagClass_.layer = options.dependencies && options.dependencies.length > 0 ?
    Layer.provide(TagClass_.layerNoDeps, options.dependencies as any) :
    TagClass_.layerNoDeps

  TagClass_.get = (key: string) => Layer.unwrap(Effect.map(TagClass_, (layerMap) => layerMap.get(key)))
  TagClass_.contextEffect = (key: string) => Effect.flatMap(TagClass_, (layerMap) => layerMap.contextEffect(key))
  TagClass_.contextEffectOption = (key: string) =>
    Effect.flatMap(TagClass_, (layerMap) => layerMap.contextEffectOption(key))
  TagClass_.invalidate = (key: string) => Effect.flatMap(TagClass_, (layerMap) => layerMap.invalidate(key))

  return TagClass as any
}

/**
 * Type helpers for values created with `LayerMap.Service`.
 *
 * @since 3.14.0
 */
export declare namespace Service {
  /**
   * Extracts the key type accepted by a `LayerMap.Service` definition.
   *
   * @category utility types
   * @since 3.14.0
   */
  export type Key<Options> = Options extends { readonly lookup: (key: infer K) => any } ? K
    : Options extends { readonly layers: infer Layers } ? keyof Layers
    : never

  /**
   * Extracts the layer type produced by a `LayerMap.Service` definition.
   *
   * @category utility types
   * @since 3.14.0
   */
  export type Layers<Options> = Options extends { readonly lookup: (key: infer _K) => infer Layers } ? Layers
    : Options extends { readonly layers: infer Layers } ? Layers[keyof Layers]
    : never

  /**
   * Extracts the services provided by the layers in a `LayerMap.Service`
   * definition.
   *
   * @category utility types
   * @since 3.14.0
   */
  export type Success<Options> = Layers<Options> extends Layer.Layer<infer _A, infer _E, infer _R> ? _A : never

  /**
   * Extracts the error type of the layers in a `LayerMap.Service` definition.
   *
   * @category utility types
   * @since 3.14.0
   */
  export type Error<Options> = Layers<Options> extends Layer.Layer<infer _A, infer _E, infer _R> ? _E : never

  /**
   * Extracts the service requirements of the layers in a `LayerMap.Service`
   * definition.
   *
   * @category utility types
   * @since 4.0.0
   */
  export type Services<Options> = Layers<Options> extends Layer.Layer<infer _A, infer _E, infer _R> ? _R : never
}
