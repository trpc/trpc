/**
 * Builds and wires services for Effect applications.
 *
 * A `Layer<ROut, E, RIn>` describes how to acquire one or more services, which
 * services are required to build them, and which errors can occur during
 * acquisition. Layers can manage scoped resources, memoize shared services,
 * combine with other layers, provide services to effects or streams, and attach
 * error handling, tracing, or lifecycle hooks.
 *
 * @since 2.0.0
 */
import type { NonEmptyArray, NonEmptyReadonlyArray } from "./Array.ts"
import type * as Cause from "./Cause.ts"
import type * as Channel from "./Channel.ts"
import * as Context from "./Context.ts"
import * as Deferred from "./Deferred.ts"
import type { Effect } from "./Effect.ts"
import type * as Exit from "./Exit.ts"
import type { LazyArg } from "./Function.ts"
import { constant, constTrue, constUndefined, dual, identity } from "./Function.ts"
import * as core from "./internal/core.ts"
import * as internalEffect from "./internal/effect.ts"
import { getStackTraceLimit, setStackTraceLimit } from "./internal/stackTraceLimit.ts"
import * as internalTracer from "./internal/tracer.ts"
import { type Pipeable, pipeArguments } from "./Pipeable.ts"
import { hasProperty } from "./Predicate.ts"
import { CurrentStackFrame } from "./References.ts"
import * as Scope from "./Scope.ts"
import type * as Stream from "./Stream.ts"
import * as Tracer from "./Tracer.ts"
import type * as Types from "./Types.ts"
import type * as Unify from "./Unify.ts"

const TypeId = "~effect/Layer"

/**
 * A `Layer` describes how to build one or more services for dependency injection.
 *
 * **When to use**
 *
 * Use to model construction of application services for dependency injection,
 * especially when services have dependencies, can fail during construction, or
 * need scoped setup and release.
 *
 * **Details**
 *
 * A `Layer<ROut, E, RIn>` represents `ROut` as the services this layer
 * provides, `E` as the possible errors during layer construction, and `RIn` as
 * the services this layer requires as dependencies.
 *
 * @category models
 * @since 2.0.0
 */
export interface Layer<in ROut, out E = never, out RIn = never> extends Variance<ROut, E, RIn>, Pipeable {
  /** @internal */
  build(memoMap: MemoMap, scope: Scope.Scope): Effect<Context.Context<ROut>, E, RIn>
  [Unify.typeSymbol]?: unknown
  [Unify.unifySymbol]?: LayerUnify<this>
  [Unify.ignoreSymbol]?: LayerUnifyIgnore
}

/**
 * Type-level hook that allows `Layer` values to participate in `Unify`
 * inference.
 *
 * **Details**
 *
 * This is used by Effect's pipe and unification machinery to preserve the
 * provided services, error, and requirements of a `Layer`.
 *
 * @category models
 * @since 4.0.0
 */
export interface LayerUnify<A extends { [Unify.typeSymbol]?: any }> {
  Layer?: () => A[Unify.typeSymbol] extends Layer<any, any, any> | infer _ ? Layer<
      Success<Extract<A[Unify.typeSymbol], Any>>,
      Error<Extract<A[Unify.typeSymbol], Any>>,
      Services<Extract<A[Unify.typeSymbol], Any>>
    >
    : never
}

/**
 * Type-level marker used by `Unify` for `Layer` types that should be ignored
 * during unification.
 *
 * @category models
 * @since 4.0.0
 */
export interface LayerUnifyIgnore {}

/**
 * The variance interface for Layer type parameters.
 *
 * @category models
 * @since 2.0.0
 */
export interface Variance<in ROut, out E, out RIn> {
  readonly [TypeId]: {
    readonly _ROut: Types.Contravariant<ROut>
    readonly _E: Types.Covariant<E>
    readonly _RIn: Types.Covariant<RIn>
  }
}
/**
 * A type-level constraint for working with any `Layer` type.
 *
 * **When to use**
 *
 * Use to constrain generic parameters or layer collections to any `Layer`
 * value while preserving its provided, error, and required service types for
 * inference.
 *
 * **Details**
 *
 * This interface is used to constrain generic types to `Layer` values without
 * specifying exact type parameters.
 *
 * @see {@link Layer} for the concrete layer interface
 * @see {@link Services} for extracting required services from a layer type
 * @see {@link Error} for extracting construction errors from a layer type
 * @see {@link Success} for extracting provided services from a layer type
 *
 * @category utility types
 * @since 3.9.0
 */
export interface Any {
  readonly [TypeId]: {
    readonly _ROut: any
    readonly _E: any
    readonly _RIn: any
  }
}
/**
 * Extracts the service requirements (`RIn`) from a `Layer` type.
 *
 * **When to use**
 *
 * Use to derive the dependency requirements of a generic or inferred `Layer`
 * without restating its `RIn` type parameter.
 *
 * @see {@link Success} for extracting the services provided by the same `Layer`
 * @see {@link Error} for extracting the construction failure type from the same `Layer`
 *
 * @category utility types
 * @since 4.0.0
 */
export type Services<T extends Any> = T extends infer L
  ? L extends Layer<infer _ROut, infer _E, infer _RIn> ? _RIn : never
  : never
/**
 * Extracts the error type (`E`) from a `Layer` type.
 *
 * **When to use**
 *
 * Use to derive a layer construction error type for helper types, wrappers, or
 * APIs that preserve a layer failure channel.
 *
 * @see {@link Success} for extracting the services provided by the same `Layer`
 * @see {@link Services} for extracting the dependency requirements of the same `Layer`
 *
 * @category utility types
 * @since 2.0.0
 */
export type Error<T extends Any> = T extends Layer<infer _ROut, infer _E, infer _RIn> ? _E : never
/**
 * Extracts the service output type (`ROut`) from a `Layer` type.
 *
 * **When to use**
 *
 * Use to derive the services provided by an existing or generic `Layer` without
 * restating its `ROut` type parameter.
 *
 * @see {@link Error} for extracting the layer construction error type instead
 * @see {@link Services} for extracting the layer input service requirements instead
 *
 * @category utility types
 * @since 2.0.0
 */
export type Success<T extends Any> = T extends Layer<infer _ROut, infer _E, infer _RIn> ? _ROut : never

const MemoMapTypeId = "~effect/Layer/MemoMap"

/**
 * A `MemoMap` is used to memoize layer construction and ensure sharing of
 * layers.
 *
 * **Details**
 *
 * The `MemoMap` prevents duplicate construction of the same layer instance,
 * enabling efficient resource sharing across layer dependencies.
 *
 * **Example** (Sharing layer construction with a memo map)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Layer } from "effect"
 *
 * class Database extends Context.Service<Database, {
 *   readonly query: (sql: string) => Effect.Effect<string>
 * }>()("Database") {}
 *
 * // Create a custom MemoMap for manual layer building
 * const program = Effect.gen(function*() {
 *   const memoMap = yield* Layer.makeMemoMap
 *   const scope = yield* Effect.scope
 *
 *   const dbLayer = Layer.succeed(Database, {
 *     query: Effect.fn("Database.query")((sql: string) => Effect.succeed("result"))
 *   })
 *   const context = yield* Layer.buildWithMemoMap(dbLayer, memoMap, scope)
 *
 *   return Context.get(context, Database)
 * })
 *
 * const database = Effect.runSync(Effect.scoped(program))
 * Effect.runSync(database.query("SELECT 1")) // => "result"
 * ```
 *
 * @category models
 * @since 2.0.0
 */
export interface MemoMap {
  readonly [MemoMapTypeId]: typeof MemoMapTypeId
  readonly get: <RIn, E, ROut>(
    layer: Layer<ROut, E, RIn>,
    scope: Scope.Scope
  ) => Effect<Context.Context<ROut>, E, RIn> | undefined
  readonly getOrElseMemoize: <RIn, E, ROut>(
    layer: Layer<ROut, E, RIn>,
    scope: Scope.Scope,
    build: (memoMap: MemoMap, scope: Scope.Scope) => Effect<Context.Context<ROut>, E, RIn>
  ) => Effect<Context.Context<ROut>, E, RIn>
}

type MemoMapEntry = {
  observers: number
  readonly deferred: Deferred.Deferred<Context.Context<any>, any>
  readonly scope: Scope.Closeable
  readonly finalizer: (exit: Exit.Exit<unknown, unknown>) => Effect<void>
}

// The finalizer must not retain the caller of `getOrElseMemoize`.
const makeMemoMapEntry = (memoMap: MemoMapImpl, layer: Layer<any, any, any>): MemoMapEntry => {
  const entry: MemoMapEntry = {
    observers: 0,
    deferred: Deferred.makeUnsafe(),
    scope: Scope.makeUnsafe(),
    finalizer: (exit) =>
      internalEffect.suspend(() => {
        if (--entry.observers > 0) return internalEffect.void
        memoMap.map.delete(layer)
        return Scope.close(entry.scope, exit)
      })
  }
  return entry
}

// Count and register synchronously so interruption cannot strand an observer.
// A closed scope cannot own an entry.
const memoMapObserve = (entry: MemoMapEntry, scope: Scope.Scope): boolean => {
  if (scope.state._tag === "Closed") return false
  entry.observers++
  internalEffect.scopeAddFinalizerUnsafe(scope, {}, entry.finalizer)
  return true
}

/**
 * Returns `true` if the specified value is a `Layer`, `false` otherwise.
 *
 * **Example** (Checking whether a value is a layer)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Layer } from "effect"
 *
 * class Database extends Context.Service<Database, {
 *   readonly query: (sql: string) => Effect.Effect<string>
 * }>()("Database") {}
 *
 * const dbLayer = Layer.succeed(Database, {
 *   query: Effect.fn("Database.query")((sql: string) => Effect.succeed("result"))
 * })
 * const notALayer = { someProperty: "value" }
 *
 * Layer.isLayer(dbLayer) // => true
 * Layer.isLayer(notALayer) // => false
 * ```
 *
 * @category guards
 * @since 2.0.0
 */
export const isLayer = (u: unknown): u is Layer<unknown, unknown, unknown> => hasProperty(u, TypeId)

const LayerProto = {
  [TypeId]: {
    _ROut: identity,
    _E: identity,
    _RIn: identity
  },
  pipe() {
    return pipeArguments(this, arguments)
  }
}

const fromBuildUnsafe = <ROut, E, RIn>(
  build: (
    memoMap: MemoMap,
    scope: Scope.Scope
  ) => Effect<Context.Context<ROut>, E, RIn>
): Layer<ROut, E, RIn> => {
  const self = Object.create(LayerProto)
  self.build = build
  return self
}

/**
 * Constructs a `Layer` from a function that uses a `MemoMap` and `Scope` to
 * build the layer.
 *
 * **Details**
 *
 * The function receives a `MemoMap` for memoization and a `Scope` for resource management.
 * A child scope is created, and if the build fails, the child scope is closed.
 *
 * **Example** (Constructing a layer from a build function)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Layer } from "effect"
 *
 * class Database extends Context.Service<Database, {
 *   readonly query: (sql: string) => Effect.Effect<string>
 * }>()("Database") {}
 *
 * const databaseLayer = Layer.fromBuild(() =>
 *   Effect.sync(() =>
 *     Context.make(Database, {
 *       query: (sql: string) => Effect.succeed("result")
 *     })
 *   )
 * )
 *
 * const program = Database.use((database) => database.query("SELECT 1"))
 * Effect.runSync(Effect.provide(program, databaseLayer)) // => "result"
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromBuild = <ROut, E, RIn>(
  build: (
    memoMap: MemoMap,
    scope: Scope.Scope
  ) => Effect<Context.Context<ROut>, E, RIn>
): Layer<ROut, E, RIn> =>
  fromBuildUnsafe((memoMap: MemoMap, scope: Scope.Scope) => {
    const layerScope = Scope.forkUnsafe(scope)
    return internalEffect.onExit(
      build(memoMap, layerScope),
      (exit) => exit._tag === "Failure" ? Scope.close(layerScope, exit) : internalEffect.void
    )
  })

/**
 * Constructs a `Layer` from a function that uses a `MemoMap` and `Scope` to
 * build the layer, with automatic memoization.
 *
 * **Details**
 *
 * This is similar to `fromBuild` but provides automatic memoization of the layer construction.
 * The layer will be memoized based on the provided `MemoMap`.
 *
 * **Example** (Memoizing layer construction)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Layer } from "effect"
 *
 * class Database extends Context.Service<Database, {
 *   readonly query: (sql: string) => Effect.Effect<string>
 * }>()("Database") {}
 *
 * const databaseLayer = Layer.fromBuildMemo(() =>
 *   Effect.sync(() =>
 *     Context.make(Database, {
 *       query: (sql: string) => Effect.succeed("result")
 *     })
 *   )
 * )
 *
 * const program = Database.use((database) => database.query("SELECT 1"))
 * Effect.runSync(Effect.provide(program, databaseLayer)) // => "result"
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromBuildMemo = <ROut, E, RIn>(
  build: (
    memoMap: MemoMap,
    scope: Scope.Scope
  ) => Effect<Context.Context<ROut>, E, RIn>
): Layer<ROut, E, RIn> => {
  const self: Layer<ROut, E, RIn> = fromBuild((memoMap, scope) => memoMap.getOrElseMemoize(self, scope, build))
  return self
}

class MemoMapImpl implements MemoMap {
  get [MemoMapTypeId](): typeof MemoMapTypeId {
    return MemoMapTypeId
  }

  readonly parent: MemoMap | undefined

  constructor(parent?: MemoMap) {
    this.parent = parent
  }

  readonly map = new Map<Layer<any, any, any>, MemoMapEntry>()

  get<RIn, E, ROut>(
    layer: Layer<ROut, E, RIn>,
    scope: Scope.Scope
  ): Effect<Context.Context<ROut>, E, RIn> | undefined {
    const local = this.map.get(layer)
    if (local) {
      memoMapObserve(local, scope)
      return local.deferred.effect ?? Deferred.await(local.deferred)
    }
    return this.parent?.get(layer, scope)
  }

  getOrElseMemoize<RIn, E, ROut>(
    layer: Layer<ROut, E, RIn>,
    scope: Scope.Scope,
    build: (memoMap: MemoMap, scope: Scope.Scope) => Effect<Context.Context<ROut>, E, RIn>
  ): Effect<Context.Context<ROut>, E, RIn> {
    return internalEffect.suspend(() => {
      // Install the exit handler before publishing an entry: it must complete
      // the Deferred even if the first requester is interrupted.
      let deferred: Deferred.Deferred<Context.Context<ROut>, E> | undefined
      return internalEffect.onExitPrimitive(
        internalEffect.suspend(() => {
          const existing = this.get(layer, scope)
          if (existing) return existing
          const entry = makeMemoMapEntry(this, layer)
          // A closed scope cannot own a shared entry; build in that scope instead.
          if (!memoMapObserve(entry, scope)) return build(this, scope)
          deferred = entry.deferred
          this.map.set(layer, entry)
          return build(this, entry.scope)
        }),
        (exit) => {
          if (deferred) Deferred.doneUnsafe(deferred, exit)
        }
      )
    })
  }
}

/**
 * Constructs a `MemoMap` synchronously so it can be used to build additional layers.
 *
 * **Example** (Creating a memo map unsafely)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Layer } from "effect"
 *
 * class Database extends Context.Service<Database, {
 *   readonly query: (sql: string) => Effect.Effect<string>
 * }>()("Database") {}
 *
 * // Create a memo map for manual layer building
 * const program = Effect.gen(function*() {
 *   const memoMap = Layer.makeMemoMapUnsafe()
 *   const scope = yield* Effect.scope
 *
 *   const dbLayer = Layer.succeed(Database, {
 *     query: Effect.fn("Database.query")((sql: string) => Effect.succeed("result"))
 *   })
 *   const context = yield* Layer.buildWithMemoMap(dbLayer, memoMap, scope)
 *
 *   return Context.get(context, Database)
 * })
 *
 * const database = Effect.runSync(Effect.scoped(program))
 * Effect.runSync(database.query("SELECT 1")) // => "result"
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const makeMemoMapUnsafe = (): MemoMap => new MemoMapImpl()

/**
 * Constructs a child `MemoMap` synchronously, allowing it to reuse layers
 * already memoized in the parent while isolating any new layer allocations to
 * the child map.
 *
 * **When to use**
 *
 * Use to synchronously fork a memo map for manual layer building when child
 * builds should see parent memoized layers without writing newly built layers
 * back to the parent.
 *
 * @see {@link forkMemoMap} for allocating the child memo map inside `Effect`
 * @see {@link makeMemoMapUnsafe} for creating a root memo map without a parent
 *
 * @category constructors
 * @since 4.0.0
 */
export const forkMemoMapUnsafe = (parent: MemoMap): MemoMap => new MemoMapImpl(parent)

/**
 * Constructs a `MemoMap` effectfully so it can be used to build additional layers.
 *
 * **Example** (Creating a memo map in an effect)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Layer } from "effect"
 *
 * class Database extends Context.Service<Database, {
 *   readonly query: (sql: string) => Effect.Effect<string>
 * }>()("Database") {}
 *
 * // Create a memo map safely within an Effect
 * const program = Effect.gen(function*() {
 *   const memoMap = yield* Layer.makeMemoMap
 *   const scope = yield* Effect.scope
 *
 *   const dbLayer = Layer.succeed(Database, {
 *     query: Effect.fn("Database.query")((sql: string) => Effect.succeed("result"))
 *   })
 *   const context = yield* Layer.buildWithMemoMap(dbLayer, memoMap, scope)
 *
 *   return Context.get(context, Database)
 * })
 *
 * const database = Effect.runSync(Effect.scoped(program))
 * Effect.runSync(database.query("SELECT 1")) // => "result"
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const makeMemoMap: Effect<MemoMap> = internalEffect.sync(makeMemoMapUnsafe)

/**
 * Constructs a child `MemoMap` effectfully, allowing it to reuse layers already
 * memoized in the parent while isolating any new layer allocations to the child
 * map.
 *
 * **When to use**
 *
 * Use when a layer build should inherit already memoized layers from an
 * existing `MemoMap` while keeping newly memoized layers out of the parent map.
 *
 * @see {@link makeMemoMap} for creating a root memo map in an `Effect`
 * @see {@link forkMemoMapUnsafe} for the synchronous constructor variant
 * @see {@link buildWithMemoMap} for building layers with an explicit memo map
 *
 * @category constructors
 * @since 4.0.0
 */
export const forkMemoMap = (parent: MemoMap): Effect<MemoMap> => internalEffect.sync(() => forkMemoMapUnsafe(parent))

/**
 * Context service for the current `MemoMap` used in layer construction.
 *
 * **When to use**
 *
 * Use when building custom layer operations that need to access the current
 * memoization map from the fiber context.
 *
 * **Details**
 *
 * This service wraps a `MemoMap` as a `Context.Service`, making it available
 * for dependency injection during layer construction.
 *
 * @see {@link MemoMap} the memoization map type wrapped by this service
 *
 * @category services
 * @since 3.13.0
 */
export class CurrentMemoMap extends Context.Service<CurrentMemoMap, MemoMap>()("effect/Layer/CurrentMemoMap") {
  static forkOrCreate<Services>(self: Context.Context<Services>): MemoMap {
    const current = Context.getOrUndefined(self, CurrentMemoMap)
    return current ? forkMemoMapUnsafe(current) : makeMemoMapUnsafe()
  }
}

/**
 * Builds a layer into an `Effect` value, using the specified `MemoMap` to memoize
 * the layer construction.
 *
 * **Example** (Building layers with an explicit memo map)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Layer } from "effect"
 *
 * class Database extends Context.Service<Database, {
 *   readonly query: (sql: string) => Effect.Effect<string>
 * }>()("Database") {}
 *
 * class Logger extends Context.Service<Logger, {
 *   readonly log: (msg: string) => Effect.Effect<void>
 * }>()("Logger") {}
 *
 * const logs: Array<string> = []
 *
 * // Build layers with explicit memoization control
 * const program = Effect.gen(function*() {
 *   const memoMap = yield* Layer.makeMemoMap
 *   const scope = yield* Effect.scope
 *
 *   // Build database layer with memoization
 *   const dbLayer = Layer.succeed(Database, {
 *     query: Effect.fn("Database.query")((sql: string) => Effect.succeed("result"))
 *   })
 *   const dbContext = yield* Layer.buildWithMemoMap(dbLayer, memoMap, scope)
 *
 *   // Build logger layer with same memoization (reuses memo if same layer)
 *   const loggerLayer = Layer.succeed(Logger, {
 *     log: Effect.fn("Logger.log")((msg: string) => Effect.sync(() => logs.push(msg)))
 *   })
 *   const loggerContext = yield* Layer.buildWithMemoMap(
 *     loggerLayer,
 *     memoMap,
 *     scope
 *   )
 *
 *   return {
 *     database: Context.get(dbContext, Database),
 *     logger: Context.get(loggerContext, Logger)
 *   }
 * })
 *
 * const services = Effect.runSync(Effect.scoped(program))
 * Effect.runSync(services.logger.log("ready"))
 * logs // => ["ready"]
 * ```
 *
 * @category destructors
 * @since 2.0.0
 */
export const buildWithMemoMap: {
  (
    memoMap: MemoMap,
    scope: Scope.Scope
  ): <RIn, E, ROut>(self: Layer<ROut, E, RIn>) => Effect<Context.Context<ROut>, E, RIn>
  <RIn, E, ROut>(
    self: Layer<ROut, E, RIn>,
    memoMap: MemoMap,
    scope: Scope.Scope
  ): Effect<Context.Context<ROut>, E, RIn>
} = dual(3, <RIn, E, ROut>(
  self: Layer<ROut, E, RIn>,
  memoMap: MemoMap,
  scope: Scope.Scope
): Effect<Context.Context<ROut>, E, RIn> =>
  internalEffect.provideService(
    internalEffect.map(self.build(memoMap, scope), Context.add(CurrentMemoMap, memoMap)),
    CurrentMemoMap,
    memoMap
  ))

/**
 * Builds a layer into a scoped value.
 *
 * **Example** (Building a layer into a context)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Layer } from "effect"
 *
 * class Database extends Context.Service<Database, {
 *   readonly query: (sql: string) => Effect.Effect<string>
 * }>()("Database") {}
 *
 * // Build a layer to get its services
 * const program = Effect.gen(function*() {
 *   const dbLayer = Layer.succeed(Database, {
 *     query: Effect.fn("Database.query")((sql: string) => Effect.succeed("result"))
 *   })
 *
 *   // Build the layer into Context - automatically manages scope and memoization
 *   const context = yield* Layer.build(dbLayer)
 *
 *   // Extract the specific service from the built layer
 *   const database = Context.get(context, Database)
 *
 *   return yield* database.query("SELECT * FROM users")
 * })
 *
 * Effect.runSync(Effect.scoped(program)) // => "result"
 * ```
 *
 * @category destructors
 * @since 2.0.0
 */
export const build = <RIn, E, ROut>(
  self: Layer<ROut, E, RIn>
): Effect<Context.Context<ROut>, E, RIn | Scope.Scope> =>
  core.withFiber((fiber) =>
    buildWithMemoMap(
      self,
      CurrentMemoMap.forkOrCreate(fiber.context),
      Context.getUnsafe(fiber.context, Scope.Scope)
    )
  )

/**
 * Builds a layer using an explicit scope.
 *
 * **When to use**
 *
 * Use to control the lifetime of layer resources with a scope supplied by the
 * caller.
 *
 * **Details**
 *
 * Resources created by the layer are released when the supplied scope is
 * closed, unless a resource extends its own scope.
 *
 * **Example** (Building a layer with an explicit scope)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Layer, Scope } from "effect"
 *
 * class Database extends Context.Service<Database, {
 *   readonly query: (sql: string) => Effect.Effect<string>
 * }>()("Database") {}
 *
 * const logs: Array<string> = []
 *
 * // Build a layer with explicit scope control
 * const program = Effect.gen(function*() {
 *   const scope = yield* Effect.scope
 *
 *   const dbLayer = Layer.effect(Database, Effect.gen(function*() {
 *     logs.push("Initializing database...")
 *     yield* Scope.addFinalizer(
 *       scope,
 *       Effect.sync(() => logs.push("Database closed"))
 *     )
 *     return { query: Effect.fn("Database.query")((sql: string) => Effect.succeed(`Result: ${sql}`)) }
 *   }))
 *
 *   // Build with specific scope - resources tied to this scope
 *   const context = yield* Layer.buildWithScope(dbLayer, scope)
 *   const database = Context.get(context, Database)
 *
 *   return yield* database.query("SELECT * FROM users")
 *   // Database will be closed when scope is closed
 * })
 *
 * Effect.runSync(Effect.scoped(program)) // => "Result: SELECT * FROM users"
 * logs // => ["Initializing database...", "Database closed"]
 * ```
 *
 * @category destructors
 * @since 2.0.0
 */
export const buildWithScope: {
  (scope: Scope.Scope): <RIn, E, ROut>(self: Layer<ROut, E, RIn>) => Effect<Context.Context<ROut>, E, RIn>
  <RIn, E, ROut>(self: Layer<ROut, E, RIn>, scope: Scope.Scope): Effect<Context.Context<ROut>, E, RIn>
} = dual(2, <RIn, E, ROut>(
  self: Layer<ROut, E, RIn>,
  scope: Scope.Scope
): Effect<Context.Context<ROut>, E, RIn> =>
  core.withFiber((fiber) =>
    buildWithMemoMap(
      self,
      CurrentMemoMap.forkOrCreate(fiber.context),
      scope
    )
  ))

/**
 * Constructs a layer that provides a single service from an already available
 * value.
 *
 * **When to use**
 *
 * Use when you need a `Layer` that provides a service from an already
 * constructed implementation without effectful acquisition.
 *
 * **Example** (Creating a layer from a service implementation)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Layer } from "effect"
 *
 * class Database extends Context.Service<Database, {
 *   readonly query: (sql: string) => Effect.Effect<string>
 * }>()("Database") {}
 *
 * const DatabaseLayer = Layer.succeed(Database, {
 *   query: Effect.fn("Database.query")((sql: string) => Effect.succeed(`Query result: ${sql}`))
 * })
 * const program = Database.use((database) => database.query("SELECT 1"))
 * Effect.runSync(Effect.provide(program, DatabaseLayer)) // => "Query result: SELECT 1"
 * ```
 *
 * @see {@link sync} for constructing layers from lazy values
 *
 * @category constructors
 * @since 2.0.0
 */
export const succeed: {
  <I, S>(service: Context.Key<I, S>): (resource: S) => Layer<I>
  <I, S>(service: Context.Key<I, S>, resource: Types.NoInfer<S>): Layer<I>
} = function() {
  if (arguments.length === 1) {
    return (resource: any) => succeedContext(Context.make(arguments[0], resource))
  }
  return succeedContext(Context.make(arguments[0], arguments[1]))
} as any

/**
 * Constructs a layer that provides all services in an already available
 * `Context`.
 *
 * **When to use**
 *
 * Use when you need a `Layer` built from an existing `Context`, including when
 * you need to provide multiple services at once.
 *
 * **Details**
 *
 * This is a more general version of `succeed` that allows you to provide
 * multiple services at once through a `Context`.
 *
 * **Example** (Providing multiple services from a context)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Layer } from "effect"
 *
 * class Database extends Context.Service<Database, {
 *   readonly query: (sql: string) => Effect.Effect<string>
 * }>()("Database") {}
 *
 * class Logger extends Context.Service<Logger, {
 *   readonly log: (msg: string) => Effect.Effect<void>
 * }>()("Logger") {}
 *
 * const logs: Array<string> = []
 * const context = Context.make(Database, {
 *   query: Effect.fn("Database.query")((sql: string) => Effect.succeed("result"))
 * }).pipe(
 *   Context.add(Logger, {
 *     log: (msg: string) => Effect.sync(() => logs.push(msg))
 *   })
 * )
 *
 * const layer = Layer.succeedContext(context)
 * const program = Logger.use((logger) => logger.log("ready"))
 * Effect.runSync(Effect.provide(program, layer))
 * logs // => ["ready"]
 * ```
 *
 * @see {@link succeed} for providing a single service from a value
 *
 * @category constructors
 * @since 2.0.0
 */
export const succeedContext = <A>(context: Context.Context<A>): Layer<A> =>
  fromBuildUnsafe(constant(internalEffect.succeed(context)))

/**
 * An empty layer that provides no services, cannot fail, has no requirements,
 * and performs no construction or finalization work.
 *
 * **When to use**
 *
 * Use as the no-op branch when conditionally composing layers.
 *
 * **Example** (Disabling optional lifecycle work)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Layer, Option } from "effect"
 *
 * const Service = Context.Service<string>("Service")
 * const context = Effect.runSync(Effect.scoped(Layer.build(Layer.empty)))
 * Context.getOption(context, Service) // => Option.none()
 * ```
 *
 * @see {@link effectDiscard} for running an effect while providing no services
 *
 * @category constructors
 * @since 2.0.0
 */
export const empty: Layer<never> = succeedContext(Context.empty())

/**
 * Constructs a layer lazily that provides a single service.
 *
 * **When to use**
 *
 * Use when you need a `Layer` that provides one service whose value is created
 * synchronously, but creation should be deferred until the layer is built.
 *
 * **Details**
 *
 * This is a lazy version of `succeed` where the service value is computed
 * synchronously only when the layer is built.
 *
 * **Example** (Lazily providing a service)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Layer } from "effect"
 *
 * class Database extends Context.Service<Database, {
 *   readonly query: (sql: string) => Effect.Effect<string>
 * }>()("Database") {}
 *
 * const layer = Layer.sync(Database, () => ({
 *   query: (sql: string) => Effect.succeed(`Query: ${sql}`)
 * }))
 * const program = Database.use((database) => database.query("SELECT 1"))
 * Effect.runSync(Effect.provide(program, layer)) // => "Query: SELECT 1"
 * ```
 *
 * @see {@link succeed} for constructing layers from static values
 *
 * @category constructors
 * @since 2.0.0
 */
export const sync: {
  <I, S>(service: Context.Key<I, S>): (evaluate: LazyArg<S>) => Layer<I>
  <I, S>(service: Context.Key<I, S>, evaluate: LazyArg<Types.NoInfer<S>>): Layer<I>
} = function() {
  if (arguments.length === 1) {
    return (evaluate: LazyArg<any>) => syncContext(() => Context.make(arguments[0], evaluate()))
  }
  return syncContext(() => Context.make(arguments[0], arguments[1]()))
} as any

/**
 * Constructs a layer lazily that provides all services in a `Context`.
 *
 * **When to use**
 *
 * Use when you need a `Layer` that creates multiple services synchronously but
 * defers that work until the layer is built.
 *
 * **Details**
 *
 * This is a lazy version of `succeedContext` where the `Context` is computed
 * synchronously only when the layer is built.
 *
 * **Example** (Lazily providing a context)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Layer } from "effect"
 *
 * class Database extends Context.Service<Database, {
 *   readonly query: (sql: string) => Effect.Effect<string>
 * }>()("Database") {}
 *
 * const layer = Layer.syncContext(() =>
 *   Context.make(Database, {
 *     query: (sql: string) => Effect.succeed(`Query: ${sql}`)
 *   })
 * )
 * const program = Database.use((database) => database.query("SELECT 1"))
 * Effect.runSync(Effect.provide(program, layer)) // => "Query: SELECT 1"
 * ```
 *
 * @see {@link sync} for lazily providing a single service
 * @see {@link succeedContext} for providing an already available context
 *
 * @category constructors
 * @since 2.0.0
 */
export const syncContext = <A>(evaluate: LazyArg<Context.Context<A>>): Layer<A> =>
  fromBuildMemo(constant(internalEffect.sync(evaluate)))

/**
 * Constructs a layer from an effect that produces a single service.
 *
 * **When to use**
 *
 * Use when you need to construct a `Layer`-provided service with an `Effect`,
 * dependencies, or scoped resource acquisition.
 *
 * **Details**
 *
 * This allows you to create a `Layer` from an `Effect` that produces a service.
 * The `Effect` is executed in the scope of the layer, allowing for proper
 * resource management.
 *
 * **Example** (Creating a layer from an effect)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Layer } from "effect"
 *
 * class Database extends Context.Service<Database, {
 *   readonly query: (sql: string) => Effect.Effect<string>
 * }>()("Database") {}
 *
 * const layer = Layer.effect(Database,
 *   Effect.sync(() => ({
 *     query: (sql: string) => Effect.succeed(`Query: ${sql}`)
 *   }))
 * )
 * const program = Database.use((database) => database.query("SELECT 1"))
 * Effect.runSync(Effect.provide(program, layer)) // => "Query: SELECT 1"
 * ```
 *
 * @see {@link effectContext} for effectfully providing multiple services
 * @see {@link effectDiscard} for running construction work without providing services
 *
 * @category constructors
 * @since 2.0.0
 */
export const effect: {
  <I, S>(service: Context.Key<I, S>): <E, R>(
    effect: Effect<S, E, R>
  ) => Layer<I, E, Exclude<R, Scope.Scope>>
  <I, S, E, R>(
    service: Context.Key<I, S>,
    effect: Effect<Types.NoInfer<S>, E, R>
  ): Layer<I, E, Exclude<R, Scope.Scope>>
} = function() {
  if (arguments.length === 1) {
    return (effect: any) => effectImpl(arguments[0], effect)
  }
  return effectImpl(arguments[0], arguments[1])
} as any

const effectImpl = <I, S, E, R>(
  service: Context.Key<I, S>,
  effect: Effect<S, E, R>
): Layer<I, E, Exclude<R, Scope.Scope>> =>
  effectContext(internalEffect.map(effect, (value) => Context.make(service, value)))

/**
 * Constructs a layer from an effect that produces all services in a `Context`.
 *
 * **When to use**
 *
 * Use when you need a `Layer` that effectfully constructs a `Context` with
 * multiple services.
 *
 * **Details**
 *
 * This allows you to create a `Layer` from an effectful computation that
 * returns multiple services. The `Effect` is executed in the scope of the
 * layer.
 *
 * **Example** (Creating a layer from an effectful context)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Layer } from "effect"
 *
 * class Database extends Context.Service<
 *   Database,
 *   { readonly query: (sql: string) => Effect.Effect<string> }
 * >()("Database") {}
 *
 * const layer = Layer.effectContext(
 *   Effect.succeed(Context.make(Database, {
 *     query: (sql: string) => Effect.succeed(`Query: ${sql}`)
 *   }))
 * )
 * const program = Database.use((database) => database.query("SELECT 1"))
 * Effect.runSync(Effect.provide(program, layer)) // => "Query: SELECT 1"
 * ```
 *
 * @see {@link effect} for effectfully providing a single service
 *
 * @category constructors
 * @since 2.0.0
 */
export const effectContext = <A, E, R>(
  effect: Effect<Context.Context<A>, E, R>
): Layer<A, E, Exclude<R, Scope.Scope>> => fromBuildMemo((_, scope) => Scope.provide(effect, scope))

/**
 * Constructs a layer from an effect, discarding its value and providing no
 * services.
 *
 * **When to use**
 *
 * Use when layer construction should run an Effect for its side effects while providing no
 * services.
 *
 * **Example** (Running an effect during layer construction)
 *
 * ```ts import.meta.vitest
 * import { Effect, Layer } from "effect"
 *
 * const logs: Array<string> = []
 * const initLayer = Layer.effectDiscard(
 *   Effect.sync(() => {
 *     logs.push("Initializing application...")
 *   })
 * )
 * Effect.runSync(Effect.scoped(Layer.build(initLayer)))
 * logs // => ["Initializing application..."]
 * ```
 *
 * @see {@link empty} for a no-op layer that performs no construction work
 *
 * @category constructors
 * @since 2.0.0
 */
export const effectDiscard = <X, E, R>(effect: Effect<X, E, R>): Layer<never, E, Exclude<R, Scope.Scope>> =>
  effectContext(internalEffect.as(effect, Context.empty()))

/**
 * Constructs a layer lazily using the specified factory.
 *
 * **Details**
 *
 * The factory is evaluated only when the suspended layer is first built, and
 * the result is memoized with normal layer sharing semantics.
 *
 * **Example** (Choosing a layer lazily)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Layer } from "effect"
 *
 * class Config extends Context.Service<Config, string>()("Config") {}
 *
 * const useProd = true
 *
 * const layer = Layer.suspend(() =>
 *   useProd
 *     ? Layer.succeed(Config, "https://api.example.com")
 *     : Layer.succeed(Config, "http://localhost:3000")
 * )
 * Effect.runSync(Effect.provide(Config, layer)) // => "https://api.example.com"
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const suspend = <A, E, R>(evaluate: LazyArg<Layer<A, E, R>>): Layer<A, E, R> =>
  fromBuildMemo((memoMap, scope) => internalEffect.suspend(() => evaluate().build(memoMap, scope)))

const unwrapKey = Context.Service<Layer<any, any, any>>("effect/Layer/unwrap")

/**
 * Unwraps a `Layer` from an `Effect`, flattening the nested structure.
 *
 * **When to use**
 *
 * Use when you have an `Effect` that produces a `Layer` and you want to
 * use that layer directly.
 *
 * **Details**
 *
 * The resulting Layer will have the combined error and dependency types from
 * both the outer Effect and the inner Layer.
 *
 * **Example** (Unwrapping an effectful layer)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Layer } from "effect"
 *
 * class Database extends Context.Service<Database, {
 *   readonly query: (sql: string) => Effect.Effect<string>
 * }>()("Database") {}
 *
 * const layerEffect = Effect.succeed(
 *   Layer.succeed(Database, { query: Effect.fn("Database.query")((sql: string) => Effect.succeed("result")) })
 * )
 *
 * const unwrappedLayer = Layer.unwrap(layerEffect)
 * const program = Database.use((database) => database.query("SELECT 1"))
 * Effect.runSync(Effect.provide(program, unwrappedLayer)) // => "result"
 * ```
 *
 * @category converting
 * @since 4.0.0
 */
export const unwrap = <A, E1, R1, E, R>(
  self: Effect<Layer<A, E1, R1>, E, R>
): Layer<A, E | E1, R1 | Exclude<R, Scope.Scope>> => flatMap(effect(unwrapKey)(self), Context.get(unwrapKey))

const mergeAllEffect = <Layers extends [Layer<never, any, any>, ...Array<Layer<never, any, any>>]>(
  layers: Layers,
  memoMap: MemoMap,
  scope: Scope.Scope
): Effect<
  Context.Context<{ [k in keyof Layers]: Success<Layers[k]> }[number]>,
  { [k in keyof Layers]: Error<Layers[k]> }[number],
  { [k in keyof Layers]: Services<Layers[k]> }[number]
> => {
  const parentScope = Scope.forkUnsafe(scope, "parallel")
  return internalEffect.forEach(layers, (layer) => layer.build(memoMap, Scope.forkUnsafe(parentScope, "sequential")), {
    concurrency: layers.length
  }).pipe(
    internalEffect.map((context) => Context.mergeAll(...(context as any)))
  )
}

/**
 * Combines all the provided layers concurrently, creating a new layer with
 * merged input, error, and output types.
 *
 * **When to use**
 *
 * Use when you need to combine multiple independent layers.
 *
 * **Details**
 *
 * All layers are built concurrently, and their outputs are merged into a single layer.
 *
 * If multiple merged layers depend on the same layer value, that dependency is
 * shared by default. Reuse a named layer value when you want services to share
 * the same resource, such as one database pool.
 *
 * **Example** (Merging independent layers)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Layer } from "effect"
 *
 * class Database extends Context.Service<Database, {
 *   readonly query: (sql: string) => Effect.Effect<string>
 * }>()("Database") {}
 *
 * class Logger extends Context.Service<Logger, {
 *   readonly log: (msg: string) => Effect.Effect<void>
 * }>()("Logger") {}
 *
 * const dbLayer = Layer.succeed(Database, {
 *   query: Effect.fn("Database.query")((sql: string) => Effect.succeed("result"))
 * })
 * const logs: Array<string> = []
 * const loggerLayer = Layer.succeed(Logger, {
 *   log: Effect.fn("Logger.log")((msg: string) => Effect.sync(() => logs.push(msg)))
 * })
 *
 * const mergedLayer = Layer.mergeAll(dbLayer, loggerLayer)
 * const program = Logger.use((logger) => logger.log("ready"))
 * Effect.runSync(Effect.provide(program, mergedLayer))
 * logs // => ["ready"]
 * ```
 *
 * @see {@link merge} for merging one layer with another layer or array
 *
 * @category zipping
 * @since 2.0.0
 */
export const mergeAll = <Layers extends [Layer<never, any, any>, ...Array<Layer<never, any, any>>]>(
  ...layers: Layers
): Layer<
  Success<Layers[number]>,
  Error<Layers[number]>,
  Services<Layers[number]>
> => fromBuild((memoMap, scope) => mergeAllEffect(layers, memoMap, scope))

/**
 * Merges this layer with another layer concurrently, producing a new layer with
 * combined input, error, and output types.
 *
 * **When to use**
 *
 * Use to combine an existing `Layer` with another `Layer` or an array of
 * layers while preserving pipeline style.
 *
 * **Details**
 *
 * This is a binary version of `mergeAll` that merges exactly two layers or one
 * layer with an array of layers. The layers are built concurrently and their
 * outputs are combined.
 *
 * **Example** (Merging two layers)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Layer } from "effect"
 *
 * class Database extends Context.Service<Database, {
 *   readonly query: (sql: string) => Effect.Effect<string>
 * }>()("Database") {}
 *
 * class Logger extends Context.Service<Logger, {
 *   readonly log: (msg: string) => Effect.Effect<void>
 * }>()("Logger") {}
 *
 * const dbLayer = Layer.succeed(Database, {
 *   query: Effect.fn("Database.query")((sql: string) => Effect.succeed("result"))
 * })
 * const loggerLayer = Layer.succeed(Logger, {
 *   log: Effect.fn("Logger.log")((_msg: string) => Effect.void)
 * })
 *
 * const mergedLayer = Layer.merge(dbLayer, loggerLayer)
 * const program = Database.use((database) => database.query("SELECT 1"))
 * Effect.runSync(Effect.provide(program, mergedLayer)) // => "result"
 * ```
 *
 * @see {@link mergeAll} for merging several layers at once
 *
 * @category zipping
 * @since 2.0.0
 */
export const merge: {
  <RIn, E, ROut>(
    that: Layer<ROut, E, RIn>
  ): <RIn2, E2, ROut2>(self: Layer<ROut2, E2, RIn2>) => Layer<ROut | ROut2, E | E2, RIn | RIn2>
  <const Layers extends [Any, ...Array<Any>]>(
    that: Layers
  ): <A, E, R>(
    self: Layer<A, E, R>
  ) => Layer<
    A | Success<Layers[number]>,
    E | Error<Layers[number]>,
    | Services<Layers[number]>
    | R
  >
  <RIn2, E2, ROut2, RIn, E, ROut>(
    self: Layer<ROut2, E2, RIn2>,
    that: Layer<ROut, E, RIn>
  ): Layer<ROut | ROut2, E | E2, RIn | RIn2>
  <A, E, R, const Layers extends [Any, ...Array<Any>]>(
    self: Layer<A, E, R>,
    that: Layers
  ): Layer<
    A | Success<Layers[number]>,
    E | Error<Layers[number]>,
    | Services<Layers[number]>
    | R
  >
} = dual(2, (
  self: Layer<any, any, any>,
  that: Layer<any, any, any> | ReadonlyArray<Layer<any, any, any>>
) => mergeAll(self, ...(Array.isArray(that) ? that : [that])))

const provideWith = (
  self: Layer<any, any, any>,
  that: Layer<any, any, any> | ReadonlyArray<Layer<any, any, any>>,
  f: (
    selfContext: Context.Context<any>,
    thatContext: Context.Context<any>
  ) => Context.Context<any>
) =>
  fromBuild((memoMap, scope) =>
    internalEffect.flatMap(
      Array.isArray(that)
        ? mergeAllEffect(that as NonEmptyArray<Layer<any, any, any>>, memoMap, scope)
        : (that as Layer<any, any, any>).build(memoMap, scope),
      (context) =>
        self.build(memoMap, scope).pipe(
          internalEffect.provideContext(context),
          internalEffect.map((merged) => f(merged, context))
        )
    )
  )

/**
 * Feeds the output services of the dependency layer into the requirements of
 * this layer, returning a layer that only provides the services from this layer.
 *
 * **When to use**
 *
 * Use when you need to hide an implementation dependency layer from callers.
 *
 * **Details**
 *
 * In `serviceLayer.pipe(Layer.provide(dependencyLayer))`, the dependency layer is
 * built first and is used to satisfy the requirements of `serviceLayer`.
 *
 * **Example** (Providing layer dependencies)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Layer } from "effect"
 *
 * class Database extends Context.Service<Database, {
 *   readonly query: (sql: string) => Effect.Effect<string>
 * }>()("Database") {}
 *
 * class UserService extends Context.Service<UserService, {
 *   readonly getUser: (id: string) => Effect.Effect<{
 *     id: string
 *     name: string
 *   }>
 * }>()("UserService") {}
 *
 * class Logger extends Context.Service<Logger, {
 *   readonly log: (msg: string) => Effect.Effect<void>
 * }>()("Logger") {}
 *
 * // Create dependency layers
 * const databaseLayer = Layer.succeed(Database, {
 *   query: Effect.fn("Database.query")((sql: string) => Effect.succeed(`DB: ${sql}`))
 * })
 *
 * const logs: Array<string> = []
 * const loggerLayer = Layer.succeed(Logger, {
 *   log: Effect.fn("Logger.log")((msg: string) => Effect.sync(() => logs.push(`[LOG] ${msg}`)))
 * })
 *
 * // UserService depends on Database and Logger
 * const userServiceLayer = Layer.effect(UserService, Effect.gen(function*() {
 *   const database = yield* Database
 *   const logger = yield* Logger
 *
 *   return {
 *     getUser: Effect.fn("UserService.getUser")(function*(id: string) {
 *         yield* logger.log(`Looking up user ${id}`)
 *         const result = yield* database.query(
 *           `SELECT * FROM users WHERE id = ${id}`
 *         )
 *         return { id, name: result }
 *       })
 *   }
 * }))
 *
 * // Provide dependencies to UserService layer
 * const userServiceWithDependencies = userServiceLayer.pipe(
 *   Layer.provide(Layer.mergeAll(databaseLayer, loggerLayer))
 * )
 *
 * // Now UserService layer has no dependencies
 * const program = Effect.gen(function*() {
 *   const userService = yield* UserService
 *   return yield* userService.getUser("123")
 * }).pipe(
 *   Effect.provide(userServiceWithDependencies)
 * )
 * Effect.runSync(program) // => { id: "123", name: "DB: SELECT * FROM users WHERE id = 123" }
 * logs // => ["[LOG] Looking up user 123"]
 * ```
 *
 * @see {@link provideMerge} for retaining the dependency services
 *
 * @category providing services
 * @since 2.0.0
 */
export const provide: {
  <RIn, E, ROut>(
    that: Layer<ROut, E, RIn>
  ): <RIn2, E2, ROut2>(self: Layer<ROut2, E2, RIn2>) => Layer<ROut2, E | E2, RIn | Exclude<RIn2, ROut>>
  <const Layers extends [Any, ...Array<Any>]>(
    that: Layers
  ): <A, E, R>(
    self: Layer<A, E, R>
  ) => Layer<
    A,
    E | Error<Layers[number]>,
    | Services<Layers[number]>
    | Exclude<R, Success<Layers[number]>>
  >
  <RIn2, E2, ROut2, RIn, E, ROut>(
    self: Layer<ROut2, E2, RIn2>,
    that: Layer<ROut, E, RIn>
  ): Layer<ROut2, E | E2, RIn | Exclude<RIn2, ROut>>
  <A, E, R, const Layers extends [Any, ...Array<Any>]>(
    self: Layer<A, E, R>,
    that: Layers
  ): Layer<
    A,
    E | Error<Layers[number]>,
    | Services<Layers[number]>
    | Exclude<R, Success<Layers[number]>>
  >
} = dual(2, (
  self: Layer<any, any, any>,
  that: Layer<any, any, any> | ReadonlyArray<Layer<any, any, any>>
) => provideWith(self, that, identity))

/**
 * Feeds the output services of the dependency layer into the requirements of
 * this layer, returning a layer that provides both sets of services.
 *
 * **When to use**
 *
 * Use when you need to compose `Layer`s while keeping both the constructed
 * service and the dependency used to build it available.
 *
 * **Details**
 *
 * Prefer {@link provide} when the dependency should stay private.
 *
 * **Example** (Providing dependencies while retaining services)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Layer } from "effect"
 *
 * class Database extends Context.Service<Database, {
 *   readonly query: (sql: string) => Effect.Effect<string>
 * }>()("Database") {}
 *
 * class Logger extends Context.Service<Logger, {
 *   readonly log: (msg: string) => Effect.Effect<void>
 * }>()("Logger") {}
 *
 * class UserService extends Context.Service<UserService, {
 *   readonly getUser: (id: string) => Effect.Effect<{
 *     id: string
 *     name: string
 *   }>
 * }>()("UserService") {}
 *
 * // Create dependency layers
 * const databaseLayer = Layer.succeed(Database, {
 *   query: Effect.fn("Database.query")((sql: string) => Effect.succeed(`DB: ${sql}`))
 * })
 *
 * const logs: Array<string> = []
 * const loggerLayer = Layer.succeed(Logger, {
 *   log: Effect.fn("Logger.log")((msg: string) => Effect.sync(() => logs.push(`[LOG] ${msg}`)))
 * })
 *
 * // UserService depends on Database and Logger
 * const userServiceLayer = Layer.effect(UserService, Effect.gen(function*() {
 *   const database = yield* Database
 *   const logger = yield* Logger
 *
 *   return {
 *     getUser: Effect.fn("UserService.getUser")(function*(id: string) {
 *         yield* logger.log(`Looking up user ${id}`)
 *         const result = yield* database.query(
 *           `SELECT * FROM users WHERE id = ${id}`
 *         )
 *         return { id, name: result }
 *       })
 *   }
 * }))
 *
 * // Provide dependencies and merge all services together
 * const allServicesLayer = userServiceLayer.pipe(
 *   Layer.provideMerge(Layer.mergeAll(databaseLayer, loggerLayer))
 * )
 *
 * // Now the resulting layer provides UserService, Database, AND Logger
 * const program = Effect.gen(function*() {
 *   const userService = yield* UserService
 *   const logger = yield* Logger // Still available!
 *   const database = yield* Database // Still available!
 *
 *   const user = yield* userService.getUser("123")
 *   yield* logger.log(`Found user: ${user.name}`)
 *
 *   return user
 * }).pipe(
 *   Effect.provide(allServicesLayer)
 * )
 * Effect.runSync(program) // => { id: "123", name: "DB: SELECT * FROM users WHERE id = 123" }
 * logs // => ["[LOG] Looking up user 123", "[LOG] Found user: DB: SELECT * FROM users WHERE id = 123"]
 * ```
 *
 * @see {@link provide} for keeping dependency services private
 *
 * @category providing services
 * @since 2.0.0
 */
export const provideMerge: {
  <RIn, E, ROut>(
    that: Layer<ROut, E, RIn>
  ): <RIn2, E2, ROut2>(self: Layer<ROut2, E2, RIn2>) => Layer<ROut | ROut2, E | E2, RIn | Exclude<RIn2, ROut>>
  <const Layers extends [Any, ...Array<Any>]>(
    that: Layers
  ): <A, E, R>(
    self: Layer<A, E, R>
  ) => Layer<
    A | Success<Layers[number]>,
    E | Error<Layers[number]>,
    | Services<Layers[number]>
    | Exclude<R, Success<Layers[number]>>
  >
  <RIn2, E2, ROut2, RIn, E, ROut>(
    self: Layer<ROut2, E2, RIn2>,
    that: Layer<ROut, E, RIn>
  ): Layer<ROut | ROut2, E | E2, RIn | Exclude<RIn2, ROut>>
  <A, E, R, const Layers extends [Any, ...Array<Any>]>(
    self: Layer<A, E, R>,
    that: Layers
  ): Layer<
    A | Success<Layers[number]>,
    E | Error<Layers[number]>,
    | Services<Layers[number]>
    | Exclude<R, Success<Layers[number]>>
  >
} = dual(2, (
  self: Layer<any, any, any>,
  that: Layer<any, any, any> | ReadonlyArray<Layer<any, any, any>>
) =>
  provideWith(
    self,
    that,
    (self, that) => Context.merge(that, self)
  ))

/**
 * Constructs a layer dynamically based on the output of this layer.
 *
 * **Example** (Creating services from layer output)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Layer } from "effect"
 *
 * class Config extends Context.Service<Config, {
 *   readonly dbUrl: string
 *   readonly logLevel: string
 * }>()("Config") {}
 *
 * class Database extends Context.Service<Database, {
 *   readonly query: (sql: string) => Effect.Effect<string>
 * }>()("Database") {}
 *
 * class Logger extends Context.Service<Logger, {
 *   readonly log: (msg: string) => Effect.Effect<void>
 * }>()("Logger") {}
 *
 * const logs: Array<string> = []
 *
 * // Base config layer
 * const configLayer = Layer.succeed(Config, {
 *   dbUrl: "postgres://localhost:5432/mydb",
 *   logLevel: "debug"
 * })
 *
 * // Dynamically create services based on config
 * const dynamicServiceLayer = configLayer.pipe(
 *   Layer.flatMap((context) => {
 *     const config = Context.get(context, Config)
 *
 *     // Create database layer based on config
 *     const dbLayer = Layer.succeed(Database, {
 *       query: Effect.fn("Database.query")((sql: string) =>
 *         Effect.succeed(
 *           `Querying ${config.dbUrl}: ${sql}`
 *         ))
 *     })
 *
 *     // Create logger layer based on config
 *     const loggerLayer = Layer.succeed(Logger, {
 *       log: Effect.fn("Logger.log")((msg: string) =>
 *         config.logLevel === "debug"
 *           ? Effect.sync(() => logs.push(`[DEBUG] ${msg}`))
 *           : Effect.sync(() => logs.push(msg))
 *       )
 *     })
 *
 *     // Return combined layer
 *     return Layer.mergeAll(dbLayer, loggerLayer)
 *   })
 * )
 *
 * // Use the dynamic services
 * const program = Effect.gen(function*() {
 *   const database = yield* Database
 *   const logger = yield* Logger
 *
 *   yield* logger.log("Starting database query")
 *   const result = yield* database.query("SELECT * FROM users")
 *
 *   return result
 * }).pipe(
 *   Effect.provide(dynamicServiceLayer)
 * )
 * Effect.runSync(program) // => "Querying postgres://localhost:5432/mydb: SELECT * FROM users"
 * logs // => ["[DEBUG] Starting database query"]
 * ```
 *
 * @category sequencing
 * @since 2.0.0
 */
export const flatMap: {
  <A, A2, E2, R2>(
    f: (context: Context.Context<A>) => Layer<A2, E2, R2>
  ): <E, R>(self: Layer<A, E, R>) => Layer<A2, E2 | E, R2 | R>
  <A, E, R, A2, E2, R2>(
    self: Layer<A, E, R>,
    f: (context: Context.Context<A>) => Layer<A2, E2, R2>
  ): Layer<A2, E | E2, R | R2>
} = dual(2, <A, E, R, A2, E2, R2>(
  self: Layer<A, E, R>,
  f: (context: Context.Context<A>) => Layer<A2, E2, R2>
): Layer<A2, E | E2, R | R2> =>
  fromBuild((memoMap, scope) =>
    internalEffect.flatMap(
      self.build(memoMap, scope),
      (context) => f(context).build(memoMap, scope)
    )
  ))

/**
 * Performs the specified effect if this layer succeeds.
 *
 * **When to use**
 *
 * Use to run an effectful observation after a layer has been built
 * successfully, such as logging or metrics, without changing the services the
 * layer provides.
 *
 * **Details**
 *
 * The callback receives the services produced by this layer. Its result is
 * discarded, and the original layer output is preserved.
 *
 * @see {@link tapError} for running an effect when layer construction fails with a typed error
 * @see {@link tapCause} for running an effect when layer construction fails with any cause
 *
 * @category sequencing
 * @since 2.0.0
 */
export const tap: {
  <ROut, XR extends ROut, RIn2, E2, X>(
    f: (context: Context.Context<XR>) => Effect<X, E2, RIn2>
  ): <RIn, E>(self: Layer<ROut, E, RIn>) => Layer<ROut, E | E2, RIn | Exclude<RIn2, Scope.Scope>>
  <RIn, E, ROut, XR extends ROut, RIn2, E2, X>(
    self: Layer<ROut, E, RIn>,
    f: (context: Context.Context<XR>) => Effect<X, E2, RIn2>
  ): Layer<ROut, E | E2, RIn | Exclude<RIn2, Scope.Scope>>
} = dual(2, <RIn, E, ROut, XR extends ROut, RIn2, E2, X>(
  self: Layer<ROut, E, RIn>,
  f: (context: Context.Context<XR>) => Effect<X, E2, RIn2>
): Layer<ROut, E | E2, RIn | Exclude<RIn2, Scope.Scope>> =>
  fromBuild((memoMap, scope) =>
    internalEffect.flatMap(
      self.build(memoMap, scope),
      (context) => Scope.provide(internalEffect.as(f(context as Context.Context<XR>), context), scope)
    )
  ))

/**
 * Performs the specified effect if this layer fails.
 *
 * **When to use**
 *
 * Use to run logging, metrics, or other effects when layer construction fails
 * while preserving the original typed error.
 *
 * **Details**
 *
 * The callback receives the typed error. If the callback succeeds, the layer
 * still fails with the original error; if the callback fails, that failure is
 * added to the layer's error type.
 *
 * @see {@link tap} for running an effect when layer construction succeeds
 * @see {@link tapCause} for inspecting the full failure cause, including defects and interruption
 *
 * @category sequencing
 * @since 2.0.0
 */
export const tapError: {
  <E, _XE extends E, RIn2, E2, X>(
    f: (e: Types.NoInfer<E>) => Effect<X, E2, RIn2>
  ): <RIn, ROut>(self: Layer<ROut, E, RIn>) => Layer<ROut, E | E2, RIn | Exclude<RIn2, Scope.Scope>>
  <E, RIn2, E2, X>(
    f: (e: E) => Effect<X, E2, RIn2>
  ): <RIn, ROut, E1 extends E = E>(self: Layer<ROut, E1, RIn>) => Layer<ROut, E1 | E2, RIn | Exclude<RIn2, Scope.Scope>>
  <RIn, E, _XE extends E, ROut, RIn2, E2, X>(
    self: Layer<ROut, E, RIn>,
    f: (e: Types.NoInfer<E>) => Effect<X, E2, RIn2>
  ): Layer<ROut, E | E2, RIn | Exclude<RIn2, Scope.Scope>>
} = dual(2, <RIn, E, ROut, RIn2, E2, X>(
  self: Layer<ROut, E, RIn>,
  f: (e: E) => Effect<X, E2, RIn2>
): Layer<ROut, E | E2, RIn | Exclude<RIn2, Scope.Scope>> =>
  fromBuild((memoMap, scope) =>
    internalEffect.catch_(
      self.build(memoMap, scope),
      (error) => Scope.provide(internalEffect.andThen(f(error), internalEffect.fail(error)), scope)
    )
  ))

/**
 * Performs the specified effect when this layer fails with any cause.
 *
 * **When to use**
 *
 * Use to run diagnostics or reporting when layer construction fails and the
 * full `Cause` is needed.
 *
 * **Details**
 *
 * The callback receives the layer's `Cause`, so it can inspect typed errors,
 * defects, and interruption information. If the callback succeeds, the layer
 * fails again with the original cause; if the callback fails, that failure is
 * added to the layer's error type.
 *
 * @see {@link tapError} for observing only typed layer construction errors
 * @see {@link catchCause} for recovering from a layer construction failure by switching to another layer
 *
 * @category sequencing
 * @since 4.0.0
 */
export const tapCause: {
  <E, _XE extends E, RIn2, E2, X>(
    f: (cause: Cause.Cause<Types.NoInfer<E>>) => Effect<X, E2, RIn2>
  ): <RIn, ROut>(self: Layer<ROut, E, RIn>) => Layer<ROut, E | E2, RIn | Exclude<RIn2, Scope.Scope>>
  <E, RIn2, E2, X>(
    f: (cause: Cause.Cause<E>) => Effect<X, E2, RIn2>
  ): <RIn, ROut, E1 extends E = E>(self: Layer<ROut, E1, RIn>) => Layer<ROut, E1 | E2, RIn | Exclude<RIn2, Scope.Scope>>
  <RIn, E, _XE extends E, ROut, RIn2, E2, X>(
    self: Layer<ROut, E, RIn>,
    f: (cause: Cause.Cause<Types.NoInfer<E>>) => Effect<X, E2, RIn2>
  ): Layer<ROut, E | E2, RIn | Exclude<RIn2, Scope.Scope>>
} = dual(2, <RIn, E, ROut, RIn2, E2, X>(
  self: Layer<ROut, E, RIn>,
  f: (cause: Cause.Cause<E>) => Effect<X, E2, RIn2>
): Layer<ROut, E | E2, RIn | Exclude<RIn2, Scope.Scope>> =>
  fromBuild((memoMap, scope) =>
    internalEffect.catchCause(
      self.build(memoMap, scope),
      (cause) => Scope.provide(internalEffect.andThen(f(cause), internalEffect.failCause(cause)), scope)
    )
  ))

/**
 * Converts layer construction failures into defects, removing them from the
 * layer's error type.
 *
 * **Details**
 *
 * Use this only when failures should be treated as unrecoverable defects rather
 * than typed errors that callers can handle.
 *
 * **Example** (Converting layer failures to defects)
 *
 * ```ts import.meta.vitest
 * import { Context, Data, Effect, Exit, Layer } from "effect"
 *
 * class DatabaseError extends Data.TaggedError("DatabaseError")<{
 *   message: string
 * }> {}
 *
 * class Database extends Context.Service<Database, {
 *   readonly query: (sql: string) => Effect.Effect<string>
 * }>()("Database") {}
 *
 * // Layer that can fail during construction
 * const error = new DatabaseError({ message: "Connection failed" })
 * const flakyDatabaseLayer = Layer.effect(
 *   Database,
 *   Effect.fail(error)
 * )
 *
 * // Convert failures to fiber death - removes error from type
 * const reliableDatabaseLayer = flakyDatabaseLayer.pipe(Layer.orDie)
 *
 * // Now the layer type is Layer<Database, never, never> - no error in type
 * const program = Effect.gen(function*() {
 *   const database = yield* Database
 *   return yield* database.query("SELECT * FROM users")
 * }).pipe(
 *   Effect.provide(reliableDatabaseLayer)
 * )
 *
 * Effect.runSync(Effect.exit(program)) // => Exit.die(error)
 * ```
 *
 * @category error handling
 * @since 2.0.0
 */
export const orDie = <A, E, R>(self: Layer<A, E, R>): Layer<A, never, R> =>
  fromBuildUnsafe((memoMap, scope) => internalEffect.orDie(self.build(memoMap, scope)))

const catch_: {
  <E, RIn2, E2, ROut2>(
    onError: (error: E) => Layer<ROut2, E2, RIn2>
  ): <RIn, ROut>(self: Layer<ROut, E, RIn>) => Layer<ROut & ROut2, E2, RIn2 | RIn>
  <RIn, E, ROut, RIn2, E2, ROut2>(
    self: Layer<ROut, E, RIn>,
    onError: (error: E) => Layer<ROut2, E2, RIn2>
  ): Layer<ROut & ROut2, E2, RIn | RIn2>
} = dual(2, <RIn, E, ROut, RIn2, E2, ROut2>(
  self: Layer<ROut, E, RIn>,
  onError: (error: E) => Layer<ROut2, E2, RIn2>
): Layer<ROut & ROut2, E2, RIn | RIn2> =>
  fromBuildUnsafe((memoMap, scope) =>
    internalEffect.catch_(
      self.build(memoMap, scope),
      (e) => onError(e).build(memoMap, scope)
    ) as any
  ))

export {
  /**
   * Recovers from all typed errors by switching to another layer.
   *
   * **When to use**
   *
   * Use when every typed `Layer` construction error should use the same
   * recovery path.
   *
   * @see {@link catchTag} for recovering from specific tagged errors
   * @see {@link catchCause} for recovering with access to the full cause
   *
   * @category error handling
   * @since 4.0.0
   */
  catch_ as catch
}

/**
 * Recovers from specific tagged errors.
 *
 * **When to use**
 *
 * Use when only some tagged `Layer` construction errors should be recovered.
 *
 * **Example** (Recovering from tagged layer errors)
 *
 * ```ts import.meta.vitest
 * import { Context, Data, Effect, Layer } from "effect"
 *
 * class ConfigError extends Data.TaggedError("ConfigError") {}
 *
 * class Config extends Context.Service<Config, {
 *   readonly apiUrl: string
 * }>()("Config") {}
 *
 * const configLayer = Layer.effect(Config, Effect.fail(new ConfigError()))
 *
 * const fallbackLayer = Layer.succeed(Config, { apiUrl: "http://localhost" })
 *
 * const recovered = configLayer.pipe(
 *   Layer.catchTag("ConfigError", () => fallbackLayer)
 * )
 * const program = Config.useSync((config) => config.apiUrl)
 * Effect.runSync(Effect.provide(program, recovered)) // => "http://localhost"
 * ```
 *
 * @see {@link catchCause} for recovering with access to the full cause
 *
 * @category error handling
 * @since 4.0.0
 */
export const catchTag: {
  <const K extends Types.Tags<E> | NonEmptyReadonlyArray<Types.Tags<E>>, E, RIn2, E2, ROut2>(
    k: K,
    f: (
      e: Types.ExtractTag<Types.NoInfer<E>, K extends NonEmptyReadonlyArray<string> ? K[number] : K>
    ) => Layer<ROut2, E2, RIn2>
  ): <RIn, ROut>(
    self: Layer<ROut, E, RIn>
  ) => Layer<
    ROut & ROut2,
    E2 | Types.ExcludeTag<E, K extends NonEmptyReadonlyArray<string> ? K[number] : K>,
    RIn2 | RIn
  >
  <
    RIn,
    E,
    ROut,
    const K extends Types.Tags<E> | NonEmptyReadonlyArray<Types.Tags<E>>,
    RIn2,
    E2,
    ROut2
  >(
    self: Layer<ROut, E, RIn>,
    k: K,
    f: (e: Types.ExtractTag<E, K extends NonEmptyReadonlyArray<string> ? K[number] : K>) => Layer<ROut2, E2, RIn2>
  ): Layer<
    ROut & ROut2,
    E2 | Types.ExcludeTag<E, K extends NonEmptyReadonlyArray<string> ? K[number] : K>,
    RIn | RIn2
  >
} = dual(3, <
  RIn,
  E,
  ROut,
  const K extends Types.Tags<E> | NonEmptyReadonlyArray<Types.Tags<E>>,
  RIn2,
  E2,
  ROut2
>(
  self: Layer<ROut, E, RIn>,
  k: K,
  f: (e: Types.ExtractTag<E, K extends NonEmptyReadonlyArray<string> ? K[number] : K>) => Layer<ROut2, E2, RIn2>
): Layer<ROut & ROut2, E2 | Types.ExcludeTag<E, K extends NonEmptyReadonlyArray<string> ? K[number] : K>, RIn | RIn2> =>
  fromBuildUnsafe((memoMap, scope) =>
    internalEffect.catchTag(
      self.build(memoMap, scope),
      k,
      (error) => f(error).build(memoMap, scope)
    ) as any
  ))

/**
 * Recovers from any failure cause by switching to another layer.
 *
 * **When to use**
 *
 * Use when you need `Layer` recovery to inspect more than the typed error,
 * such as defects or interruption information.
 *
 * **Details**
 *
 * The handler receives the full `Cause` of the failed layer, including typed
 * errors, unexpected defects, and interruption information, and returns the
 * fallback layer to build instead. Finalizers for resources acquired by the
 * failed layer are still run before the fallback layer is acquired.
 *
 * **Example** (Recovering from layer failures by cause)
 *
 * ```ts import.meta.vitest
 * import { Context, Data, Effect, Layer } from "effect"
 *
 * class DatabaseError extends Data.TaggedError("DatabaseError")<{
 *   message: string
 * }> {}
 *
 * class Database extends Context.Service<Database, {
 *   readonly query: (sql: string) => Effect.Effect<string>
 * }>()("Database") {}
 *
 * const primaryDatabaseLayer = Layer.effect(Database,
 *   Effect.fail(new DatabaseError({ message: "Primary DB unreachable" }))
 * )
 *
 * const databaseWithFallback = primaryDatabaseLayer.pipe(
 *   Layer.catchCause(() => {
 *     return Layer.succeed(Database, {
 *       query: Effect.fn("Database.query")((sql: string) => Effect.succeed(`Memory: ${sql}`))
 *     })
 *   })
 * )
 *
 * const program = Effect.gen(function*() {
 *   const database = yield* Database
 *   return yield* database.query("SELECT * FROM users")
 * }).pipe(
 *   Effect.provide(databaseWithFallback)
 * )
 *
 * await Effect.runPromise(program) // => "Memory: SELECT * FROM users"
 * ```
 *
 * @see {@link catchTag} for recovering from specific tagged errors
 *
 * @category error handling
 * @since 4.0.0
 */
export const catchCause: {
  <E, RIn2, E2, ROut2>(
    onError: (cause: Cause.Cause<E>) => Layer<ROut2, E2, RIn2>
  ): <RIn, ROut>(self: Layer<ROut, E, RIn>) => Layer<ROut & ROut2, E2, RIn2 | RIn>
  <RIn, E, ROut, RIn2, E2, ROut22>(
    self: Layer<ROut, E, RIn>,
    onError: (cause: Cause.Cause<E>) => Layer<ROut22, E2, RIn2>
  ): Layer<ROut & ROut22, E2, RIn | RIn2>
} = dual(2, <RIn, E, ROut, RIn2, E2, ROut2>(
  self: Layer<ROut, E, RIn>,
  onError: (cause: Cause.Cause<E>) => Layer<ROut2, E2, RIn2>
): Layer<ROut & ROut2, E2, RIn | RIn2> =>
  fromBuildUnsafe((memoMap, scope) =>
    internalEffect.catchCause(
      self.build(memoMap, scope),
      (cause) => onError(cause).build(memoMap, scope)
    ) as any
  ))

/**
 * Updates a service in the context with a new implementation.
 *
 * **When to use**
 *
 * Use to adapt or extend a service's behavior during the creation of a
 * layer.
 *
 * **Details**
 *
 * This function modifies the existing implementation of a service in the
 * context. It retrieves the current service, applies the provided
 * transformation function `f`, and replaces the old service with the
 * transformed one.
 *
 * @category providing services
 * @since 3.13.0
 */
export const updateService: {
  <I, A>(
    service: Context.Key<I, A>,
    f: (a: Types.NoInfer<A>) => A
  ): <A1, E1, R1>(layer: Layer<A1, E1, R1>) => Layer<A1, E1, I | R1>
  <A1, E1, R1, I, A>(
    layer: Layer<A1, E1, R1>,
    service: Context.Key<I, A>,
    f: (a: Types.NoInfer<A>) => A
  ): Layer<A1, E1, I | R1>
} = dual(
  3,
  <A1, E1, R1, I, A>(
    layer: Layer<A1, E1, R1>,
    service: Context.Key<I, A>,
    f: (a: Types.NoInfer<A>) => A
  ): Layer<A1, E1, I | R1> => provide(layer, effect(service, internalEffect.map(service, f)))
)

/**
 * Creates a fresh version of this layer that will not be shared.
 *
 * **When to use**
 *
 * Use when you need two parts of an application to receive separate instances
 * of a resource, such as two independent client sessions.
 *
 * **Gotchas**
 *
 * Do not use it just to work around confusing composition. By default, sharing
 * the same layer value is usually the desired behavior.
 *
 * **Example** (Creating non-shared layer instances)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Layer, Ref } from "effect"
 *
 * class Counter extends Context.Service<Counter, {
 *   readonly id: number
 * }>()("Counter") {}
 *
 * class Left extends Context.Service<Left, {
 *   readonly counterId: number
 * }>()("Left") {}
 *
 * class Right extends Context.Service<Right, {
 *   readonly counterId: number
 * }>()("Right") {}
 *
 * const leftLayer = Layer.effect(Left, Effect.gen(function*() {
 *   const counter = yield* Counter
 *   return { counterId: counter.id }
 * }))
 *
 * const rightLayer = Layer.effect(Right, Effect.gen(function*() {
 *   const counter = yield* Counter
 *   return { counterId: counter.id }
 * }))
 *
 * const compareIds = Effect.gen(function*() {
 *   const left = yield* Left
 *   const right = yield* Right
 *   return left.counterId === right.counterId
 * })
 *
 * const program = Effect.gen(function*() {
 *   const nextId = yield* Ref.make(0)
 *
 *   const counterLayer = Layer.effect(Counter, Effect.gen(function*() {
 *     const id = yield* Ref.updateAndGet(nextId, (n) => n + 1)
 *     return { id }
 *   }))
 *
 *   const shared = Layer.merge(
 *     Layer.provide(leftLayer, counterLayer),
 *     Layer.provide(rightLayer, counterLayer)
 *   )
 *
 *   const sharedResult = yield* Effect.provide(compareIds, shared)
 *
 *   const freshCounterLayer = Layer.fresh(counterLayer)
 *   const fresh = Layer.merge(
 *     Layer.provide(leftLayer, freshCounterLayer),
 *     Layer.provide(rightLayer, freshCounterLayer)
 *   )
 *
 *   const freshResult = yield* Effect.provide(compareIds, fresh)
 *
 *   return { shared: sharedResult, fresh: freshResult }
 * })
 *
 * await Effect.runPromise(program) // => { shared: true, fresh: false }
 * ```
 *
 * @category layers
 * @since 2.0.0
 */
export const fresh = <A, E, R>(self: Layer<A, E, R>): Layer<A, E, R> =>
  fromBuildUnsafe((_, scope) => self.build(makeMemoMapUnsafe(), scope))

/**
 * Builds this layer and keeps it alive until the returned effect is interrupted.
 *
 * **When to use**
 *
 * Use when you model your entire application as a layer, such as an HTTP
 * server.
 *
 * **Details**
 *
 * When the returned effect is interrupted, the layer scope is closed and all
 * finalizers registered during layer acquisition are run.
 *
 * **Example** (Launching an application layer)
 *
 * ```ts import.meta.vitest
 * import { Context, Deferred, Effect, Fiber, Layer, Ref } from "effect"
 *
 * class HttpServer extends Context.Service<HttpServer, {
 *   readonly port: number
 * }>()("HttpServer") {}
 *
 * const program = Effect.gen(function*() {
 *   const events = yield* Ref.make<Array<string>>([])
 *   const started = yield* Deferred.make<void>()
 *
 *   const serverLayer = Layer.effect(HttpServer, Effect.gen(function*() {
 *     yield* Ref.update(events, (events) => [...events, "Starting HTTP server..."])
 *     yield* Deferred.succeed(started, undefined)
 *     return { port: 3000 }
 *   }))
 *
 *   const fiber = yield* Effect.forkChild(Layer.launch(serverLayer))
 *   yield* Deferred.await(started)
 *   yield* Fiber.interrupt(fiber)
 *   return yield* Ref.get(events)
 * })
 *
 * await Effect.runPromise(program) // => ["Starting HTTP server..."]
 * ```
 *
 * @category converting
 * @since 2.0.0
 */
export const launch = <RIn, E, ROut>(self: Layer<ROut, E, RIn>): Effect<never, E, RIn> =>
  internalEffect.scoped(internalEffect.andThen(build(self), internalEffect.never))

/**
 * A utility type for creating partial mocks of services in testing.
 *
 * **When to use**
 *
 * Use to type partial test service implementations where only exercised
 * effectful members are stubbed.
 *
 * **Details**
 *
 * This type makes `Effect`, `Stream`, and `Channel` values and functions
 * returning them optional, while keeping non-effectful properties required.
 * This allows you to provide only the methods you need to test while leaving
 * others unimplemented.
 *
 * @see {@link mock} for creating a mock layer from a partial service implementation
 *
 * @category testing
 * @since 3.17.0
 */
export type PartialEffectful<A extends object> = Types.Simplify<
  & {
    [K in keyof A as A[K] extends AnyEffectOrStream ? K : never]?: A[K]
  }
  & {
    [K in keyof A as A[K] extends AnyEffectOrStream ? never : K]: A[K]
  }
>

type AnyEffectOrStream =
  | Effect<any, any, any>
  | Stream.Stream<any, any, any>
  | Channel.Channel<any, any, any, any, any, any, any>
  | ((...args: any) => Effect<any, any, any>)
  | ((...args: any) => Stream.Stream<any, any, any>)
  | ((...args: any) => Channel.Channel<any, any, any, any, any, any, any>)

/**
 * Creates a mock layer for testing purposes. You can provide a partial
 * implementation of the service. Any missing members that are `Effect`s,
 * `Stream`s, `Channel`s, or functions returning them will fail with an
 * unimplemented defect when used.
 *
 * **Details**
 *
 * Missing members are represented by a value that can be used as an `Effect`,
 * `Stream`, `Channel`, or as a function returning an `Effect`. This lets the
 * mock preserve the shape of common service methods while still failing loudly
 * when an unimplemented member is exercised.
 *
 * **Example** (Mocking services for tests)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Layer } from "effect"
 *
 * class UserService extends Context.Service<UserService, {
 *   readonly config: { apiUrl: string }
 *   readonly getUser: (
 *     id: string
 *   ) => Effect.Effect<{ id: string; name: string }, Error>
 *   readonly deleteUser: (id: string) => Effect.Effect<void, Error>
 *   readonly updateUser: (
 *     id: string,
 *     data: object
 *   ) => Effect.Effect<{ id: string; name: string }, Error>
 * }>()("UserService") {}
 *
 * // Create a partial mock - only implement what you need for testing
 * const testUserLayer = Layer.mock(UserService, {
 *   config: { apiUrl: "https://test-api.com" }, // Required - non-Effect property
 *   getUser: (id: string) => Effect.succeed({ id, name: "Test User" }) // Mock implementation
 *   // deleteUser and updateUser are omitted - will throw UnimplementedError if called
 * })
 *
 * // Use in tests
 * const testProgram = Effect.gen(function*() {
 *   const userService = yield* UserService
 *
 *   // This works - we provided an implementation
 *   const user = yield* userService.getUser("123")
 *
 *   // This would throw - we didn't implement deleteUser
 *   // yield* userService.deleteUser("123") // UnimplementedError
 *
 *   return user.name
 * }).pipe(
 *   Effect.provide(testUserLayer)
 * )
 * Effect.runSync(testProgram) // => "Test User"
 * ```
 *
 * @category testing
 * @since 3.17.0
 */
export const mock: {
  <I, S extends object>(service: Context.Key<I, S>): (implementation: PartialEffectful<S>) => Layer<I>
  <I, S extends object>(service: Context.Key<I, S>, implementation: Types.NoInfer<PartialEffectful<S>>): Layer<I>
} = function() {
  if (arguments.length === 1) {
    return (implementation: any) => mockImpl(arguments[0], implementation)
  }
  return mockImpl(arguments[0], arguments[1])
} as any

const mockImpl = <I, S extends object>(service: Context.Key<I, S>, implementation: PartialEffectful<S>): Layer<I> =>
  succeed(service)(
    new Proxy({ ...implementation as object } as S, {
      get(target, prop, _receiver) {
        if (prop in target) {
          return target[prop as keyof S]
        }
        const prevLimit = getStackTraceLimit()
        setStackTraceLimit(2)
        const error = new Error(`${service.key}: Unimplemented method "${prop.toString()}"`)
        setStackTraceLimit(prevLimit)
        error.name = "UnimplementedError"
        return makeUnimplemented(error)
      },
      has: constTrue
    })
  )

const makeUnimplemented = (error: globalThis.Error) => {
  const dead = Object.assign(internalEffect.die(error), {
    [StreamTypeId]: StreamTypeId,
    channel: {
      [ChannelTypeId]: ChannelTypeId,
      transform: () => internalEffect.succeed(dead),
      pipe() {
        return pipeArguments(this, arguments)
      }
    },
    [ChannelTypeId]: ChannelTypeId,
    transform: () => internalEffect.succeed(dead)
  })
  function unimplemented() {
    return dead
  }
  // @effect-diagnostics-next-line floatingEffect:off
  Object.assign(unimplemented, dead)
  Object.setPrototypeOf(unimplemented, Object.getPrototypeOf(dead))
  return unimplemented
}

const StreamTypeId: Stream.TypeId = "~effect/Stream"
const ChannelTypeId: Channel.TypeId = "~effect/Channel"

// -----------------------------------------------------------------------------
// Type constraints
// -----------------------------------------------------------------------------

/**
 * Ensures that a layer's success type extends a given type `ROut`.
 *
 * **Details**
 *
 * This function provides compile-time type checking to ensure that the success
 * value of a layer conforms to a specific type constraint.
 *
 * **Example** (Constraining layer success types)
 *
 * ```ts import.meta.vitest
 * import { Context, Layer } from "effect"
 *
 * const NumberService = Context.Service<number>("Number")
 * const numberLayer = Layer.succeed(NumberService, 42)
 *
 * // Define a constraint that the success type must be a number
 * const satisfiesNumber = Layer.satisfiesSuccessType<number>()
 *
 * // This works - Layer<42, never, never> extends Layer<number, never, never>
 * const validLayer = satisfiesNumber(numberLayer)
 * ```
 *
 * @category utility types
 * @since 4.0.0
 */
export const satisfiesSuccessType =
  <ROut>() => <ROut2 extends ROut, E, RIn>(layer: Layer<ROut2, E, RIn>): Layer<ROut2, E, RIn> => layer

/**
 * Ensures that a layer's error type extends a given type `E`.
 *
 * **Details**
 *
 * This function provides compile-time type checking to ensure that the error
 * type of a layer conforms to a specific type constraint.
 *
 * **Example** (Constraining layer error types)
 *
 * ```ts import.meta.vitest
 * import { Effect, Layer } from "effect"
 *
 * const typeErrorLayer = Layer.effectDiscard(Effect.fail(new TypeError("boom")))
 *
 * // Define a constraint that the error type must be an Error
 * const satisfiesError = Layer.satisfiesErrorType<Error>()
 *
 * // This works - Layer<never, TypeError, never> extends Layer<never, Error, never>
 * const validLayer = satisfiesError(typeErrorLayer)
 * ```
 *
 * @category utility types
 * @since 4.0.0
 */
export const satisfiesErrorType =
  <E>() => <ROut, E2 extends E, RIn>(layer: Layer<ROut, E2, RIn>): Layer<ROut, E2, RIn> => layer

/**
 * Ensures that a layer's requirements type extends a given type `R`.
 *
 * **Details**
 *
 * This function provides compile-time type checking to ensure that the
 * requirements type of a layer conforms to a specific type constraint.
 *
 * **Example** (Constraining layer service requirements)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Layer } from "effect"
 *
 * const NumberService = Context.Service<number>("Number")
 * const numberLayer = Layer.effectDiscard(Effect.asVoid(NumberService))
 *
 * // Define a constraint that the service requirements must be numbers
 * const satisfiesNumber = Layer.satisfiesServicesType<number>()
 *
 * // This works - Layer<never, never, 42> extends Layer<never, never, number>
 * const validLayer = satisfiesNumber(numberLayer)
 * ```
 *
 * @category utility types
 * @since 4.0.0
 */
export const satisfiesServicesType =
  <RIn>() => <ROut, E, RIn2 extends RIn>(layer: Layer<ROut, E, RIn2>): Layer<ROut, E, RIn2> => layer

// -----------------------------------------------------------------------------
// Tracing
// -----------------------------------------------------------------------------

/**
 * Represents options that can be used to control the behavior of spans created
 * for layers.
 *
 * **When to use**
 *
 * Use to configure tracing metadata, stack trace capture, and `onEnd`
 * finalization for spans created by `Layer.span` and `Layer.withSpan` during
 * layer construction.
 *
 * **Details**
 *
 * Extends `Tracer.SpanOptions` with `onEnd`, which runs when the layer span
 * ends as the layer scope closes.
 *
 * @see {@link span} for creating a layer span
 * @see {@link withSpan} for wrapping layer construction in a span
 *
 * @category options
 * @since 4.0.0
 */
export interface SpanOptions extends Tracer.SpanOptions {
  /**
   * Runs when the span associated with the layer ends, which happens when the
   * layer scope is closed.
   */
  readonly onEnd?:
    | ((span: Tracer.Span, exit: Exit.Exit<unknown, unknown>) => Effect<void>)
    | undefined
}

/**
 * Constructs a new `Layer` which creates a span and registers it as the current
 * parent span.
 *
 * **Details**
 *
 * This allows you to create a traced scope for layer construction, making all
 * operations within the layer constructor part of the same trace span. The span
 * is automatically ended when the layer's scope is closed. If `onEnd` is
 * provided, it receives the span and the layer scope's exit value when the span
 * ends.
 *
 * **Example** (Tracing layer construction with a span)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Layer } from "effect"
 * import type { Tracer } from "effect"
 *
 * class Database extends Context.Service<Database, {
 *   readonly query: (sql: string) => Effect.Effect<string>
 * }>()("Database") {}
 *
 * const logs: Array<string> = []
 *
 * // Create a traced layer - all operations performed during construction of
 * // the `Database` service are part of the "database-init" span
 * const databaseLayer = Layer.effect(Database, Effect.gen(function*() {
 *   // These operations are traced under "database-init" span
 *   logs.push("Connecting to database")
 *   logs.push("Database connected")
 *
 *   const parentSpan = yield* Effect.currentParentSpan
 *   logs.push((parentSpan as Tracer.Span).name)
 *
 *   return {
 *     query: Effect.fn("Database.query")((sql: string) => Effect.succeed(`Result: ${sql}`))
 *   }
 * })).pipe(Layer.provide(Layer.span("database-init", {
 *   onEnd: (span, exit) =>
 *     Effect.sync(() => logs.push(`Span ${span.name} ended with: ${exit._tag}`))
 * })))
 *
 * const program = Database.use((database) => database.query("SELECT 1"))
 * Effect.runSync(Effect.provide(program, databaseLayer)) // => "Result: SELECT 1"
 * logs // => ["Connecting to database", "Database connected", "database-init", "Span database-init ended with: Success"]
 * ```
 *
 * @category tracing
 * @since 2.0.0
 */
export const span = (
  name: string,
  options?: SpanOptions
): Layer<Tracer.ParentSpan> => {
  options = internalTracer.addSpanStackTrace(options)
  return effect(
    Tracer.ParentSpan,
    options?.onEnd
      ? internalEffect.tap(
        internalEffect.makeSpanScoped(name, options),
        (span) => internalEffect.addFinalizer((exit) => options.onEnd!(span, exit))
      )
      : internalEffect.makeSpanScoped(name, options)
  )
}

/**
 * Constructs a layer that provides an existing span as the current parent span.
 *
 * **Details**
 *
 * The supplied span is made available through `Tracer.ParentSpan` for layers
 * that are built with this layer. This API does not create, end, or close the
 * span; the caller remains responsible for the span's lifetime.
 *
 * **Example** (Referencing an existing parent span)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Layer, Tracer } from "effect"
 *
 * class Database extends Context.Service<Database, {
 *   readonly spanId: string
 *   readonly query: (sql: string) => Effect.Effect<string>
 * }>()("Database") {}
 *
 * // Create a layer that uses an existing span as parent
 * const databaseLayer = Layer.effect(
 *   Database,
 *   Effect.gen(function*() {
 *     const parentSpan = yield* Effect.currentParentSpan
 *
 *     return {
 *       spanId: parentSpan.spanId,
 *       query: Effect.fn("Database.query")((sql: string) => Effect.succeed(`Result: ${sql}`))
 *     }
 *   })
 * ).pipe(Layer.provide(Layer.parentSpan(Tracer.externalSpan({
 *   spanId: "42",
 *   traceId: "000"
 * }))))
 * const program = Database.use((database) =>
 *   Effect.map(database.query("SELECT 1"), (result) => ({ spanId: database.spanId, result })))
 * Effect.runSync(Effect.provide(program, databaseLayer)) // => { spanId: "42", result: "Result: SELECT 1" }
 * ```
 *
 * @category tracing
 * @since 2.0.0
 */
export const parentSpan = (span: Tracer.AnySpan): Layer<Tracer.ParentSpan> =>
  succeedContext(Tracer.ParentSpan.context(span))

/**
 * Wraps a `Layer` with a new tracing span, making all operations in the layer
 * constructor part of the named trace span.
 *
 * **Details**
 *
 * This creates a new span for the layer's construction and execution. The span
 * is automatically ended when the layer's scope is closed. This is useful for
 * tracking the lifecycle and performance of layer initialization.
 *
 * **Example** (Wrapping a layer with a span)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Layer } from "effect"
 *
 * class Database extends Context.Service<Database, {
 *   readonly query: (sql: string) => Effect.Effect<string>
 * }>()("Database") {}
 *
 * class Logger extends Context.Service<Logger, {
 *   readonly log: (msg: string) => Effect.Effect<void>
 * }>()("Logger") {}
 *
 * const logs: Array<string> = []
 *
 * // Create layers with tracing
 * const databaseLayer = Layer.effect(Database, Effect.gen(function*() {
 *   return {
 *     query: Effect.fn("Database.query")((sql: string) => Effect.succeed(`Result: ${sql}`))
 *   }
 * })).pipe(Layer.withSpan("database-initialization", {
 *   attributes: { dbType: "postgres" }
 * }))
 *
 * const loggerLayer = Layer.succeed(Logger, {
 *   log: Effect.fn("Logger.log")((msg: string) => Effect.sync(() => logs.push(msg)))
 * }).pipe(Layer.withSpan("logger-initialization"))
 *
 * // Combine traced layers
 * const appLayer = Layer.mergeAll(databaseLayer, loggerLayer).pipe(
 *   Layer.withSpan("app-initialization", {
 *     onEnd: (span, exit) =>
 *       Effect.sync(() => logs.push(`Application initialization completed: ${exit._tag}`))
 *   })
 * )
 *
 * const program = Effect.gen(function*() {
 *   const database = yield* Database
 *   const logger = yield* Logger
 *
 *   yield* logger.log("Application ready")
 *   return yield* database.query("SELECT * FROM users")
 * }).pipe(Effect.provide(appLayer))
 * Effect.runSync(program) // => "Result: SELECT * FROM users"
 * logs // => ["Application ready", "Application initialization completed: Success"]
 * ```
 *
 * @category tracing
 * @since 2.0.0
 */
export const withSpan: {
  (
    name: string,
    options?: SpanOptions
  ): <A, E, R>(
    self: Layer<A, E, R>
  ) => Layer<A, E, Exclude<R, Tracer.ParentSpan>>
  <A, E, R>(
    self: Layer<A, E, R>,
    name: string,
    options?: SpanOptions
  ): Layer<A, E, Exclude<R, Tracer.ParentSpan>>
} = function() {
  const dataFirst = typeof arguments[0] !== "string"
  const name = dataFirst ? arguments[1] : arguments[0]
  const options = internalTracer.addSpanStackTrace(dataFirst ? arguments[2] : arguments[1]) as SpanOptions
  if (dataFirst) {
    const self = arguments[0]
    return unwrap(
      internalEffect.map(
        options?.onEnd !== undefined
          ? internalEffect.tap(
            internalEffect.makeSpanScoped(name, options),
            (span) => internalEffect.addFinalizer((exit) => options.onEnd!(span, exit))
          )
          : internalEffect.makeSpanScoped(name, options),
        (span) => withParentSpan(self, span, options)
      )
    )
  }
  return (self: Layer<any, any, any>) =>
    unwrap(
      internalEffect.map(
        options?.onEnd !== undefined
          ? internalEffect.tap(
            internalEffect.makeSpanScoped(name, options),
            (span) => internalEffect.addFinalizer((exit) => options.onEnd!(span, exit))
          )
          : internalEffect.makeSpanScoped(name, options),
        (span) => withParentSpan(self, span, options)
      )
    )
} as any

/**
 * Wraps a layer so spans created during its construction use the supplied span
 * as their parent.
 *
 * **Details**
 *
 * Use this to attach layer construction to an existing trace hierarchy. This API
 * does not create or end the supplied parent span.
 *
 * When the supplied span is a native `Span`, layer construction also receives
 * diagnostic information that helps associate failures with the layer call site.
 * External spans are only installed as the parent span and do not add this
 * diagnostic call-site information.
 *
 * **Example** (Attaching layers to an existing parent span)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Layer, Tracer } from "effect"
 *
 * class Database extends Context.Service<Database, {
 *   readonly query: (sql: string) => Effect.Effect<string>
 * }>()("Database") {}
 *
 * class Cache extends Context.Service<Cache, {
 *   readonly get: (key: string) => Effect.Effect<string | null>
 * }>()("Cache") {}
 *
 * // Create layers
 * const DatabaseLayer = Layer.effect(Database, Effect.gen(function*() {
 *   return {
 *     query: Effect.fn("Database.query")((sql: string) => Effect.succeed(`DB: ${sql}`))
 *   }
 * }))
 *
 * const CacheLayer = Layer.effect(Cache, Effect.gen(function*() {
 *   return {
 *     get: Effect.fn("Cache.get")((key: string) => Effect.succeed(`Cache: ${key}`))
 *   }
 * }))
 *
 * // Use with an existing parent span from Effect.withSpan
 * const program = Effect.withSpan("application-startup")(
 *   Effect.gen(function*() {
 *     const parentSpan = yield* Tracer.ParentSpan
 *
 *     // Both layers will be children of "application-startup" span
 *     const AppLayer = Layer.mergeAll(DatabaseLayer, CacheLayer).pipe(
 *       Layer.withParentSpan(parentSpan)
 *     )
 *
 *     const context = yield* Layer.build(AppLayer)
 *     const database = Context.get(context, Database)
 *     const cache = Context.get(context, Cache)
 *
 *     const dbResult = yield* database.query("SELECT * FROM users")
 *     const cacheResult = yield* cache.get("user:123")
 *
 *     return { dbResult, cacheResult }
 *   })
 * )
 * Effect.runSync(Effect.scoped(program)) // => { dbResult: "DB: SELECT * FROM users", cacheResult: "Cache: user:123" }
 * ```
 *
 * @category tracing
 * @since 2.0.0
 */
export const withParentSpan: {
  (
    span: Tracer.AnySpan,
    options?: Tracer.TraceOptions
  ): <A, E, R>(
    self: Layer<A, E, R>
  ) => Layer<A, E, Exclude<R, Tracer.ParentSpan>>
  <A, E, R>(
    self: Layer<A, E, R>,
    span: Tracer.AnySpan,
    options?: Tracer.TraceOptions
  ): Layer<A, E, Exclude<R, Tracer.ParentSpan>>
} = function() {
  const dataFirst = isLayer(arguments[0])
  const span: Tracer.AnySpan = dataFirst ? arguments[1] : arguments[0]
  let options = dataFirst ? arguments[2] : arguments[1]
  let provideStackFrame: <A, E, R>(self: Layer<A, E, R>) => Layer<A, E, R> = identity
  if (span._tag === "Span") {
    options = internalTracer.addSpanStackTrace(options)
    provideStackFrame = provideSpanStackFrame(span.name, options?.captureStackTrace)
  }
  const parentSpanLayer = parentSpan(span)
  if (dataFirst) {
    return provide(provideStackFrame(arguments[0]), parentSpanLayer)
  }
  return (self: Layer<any, any, any>) => provide(provideStackFrame(self), parentSpanLayer)
} as any

const provideSpanStackFrame = (name: string, stack: (() => string | undefined) | undefined) => {
  stack = typeof stack === "function" ? stack : constUndefined
  return updateService(CurrentStackFrame, (parent) => ({
    name,
    stack,
    parent
  }))
}
