/**
 * Data sources used by `Config` to load raw configuration values. A
 * `ConfigProvider` reads paths from places such as environment variables,
 * JavaScript objects, `.env` contents, or directories, and returns a uniform
 * `Node` shape that config schemas can decode. The module also includes helpers
 * for composing providers, changing paths, and installing providers through
 * layers.
 *
 * @since 4.0.0
 */

import * as Arr from "./Array.ts"
import * as Context from "./Context.ts"
import * as Data from "./Data.ts"
import * as Effect from "./Effect.ts"
import * as FileSystem from "./FileSystem.ts"
import { format } from "./Formatter.ts"
import { dual } from "./Function.ts"
import { PipeInspectableProto } from "./internal/core.ts"
import * as Layer from "./Layer.ts"
import * as Path_ from "./Path.ts"
import type { Pipeable } from "./Pipeable.ts"
import type { PlatformError } from "./PlatformError.ts"
import * as Predicate from "./Predicate.ts"
import type { Scope } from "./Scope.ts"
import * as Str from "./String.ts"

/**
 * A discriminated union describing the shape of a configuration value at a
 * given path.
 *
 * **When to use**
 *
 * Use when implementing a custom `ConfigProvider` by returning raw
 * nodes from the `get` callback passed to {@link make}, or when inspecting raw
 * provider output before schema parsing.
 *
 * **Details**
 *
 * `Value` is a terminal string leaf. `Record` is an object-like container
 * whose immediate child keys are known and may carry an optional co-located
 * `value`. `Array` is an indexed container with a known `length` and may also
 * carry an optional co-located `value`.
 *
 * Provider lookups return `undefined` when no node exists at the requested
 * path. Within a node that was found, `value: undefined` has a narrower
 * structural meaning: the container exists but has no co-located scalar value.
 *
 * @see {@link makeValue} – construct a `Value` node
 * @see {@link makeRecord} – construct a `Record` node
 * @see {@link makeArray} – construct an `Array` node
 *
 * @category models
 * @since 4.0.0
 */
export type Node =
  /** A terminal string value */
  | {
    readonly _tag: "Value"
    readonly value: string
  }
  /** An object; keys are unordered */
  | {
    readonly _tag: "Record"
    readonly keys: ReadonlySet<string>
    readonly value: string | undefined
  }
  /** An array-like container; length is the number of elements */
  | {
    readonly _tag: "Array"
    readonly length: number
    readonly value: string | undefined
  }

/**
 * Creates a `Value` node representing a terminal string leaf.
 *
 * **When to use**
 *
 * Use when building nodes inside a custom `ConfigProvider`'s `get`
 * callback.
 *
 * **Details**
 *
 * The function returns a new plain object.
 *
 * **Example** (Creating a value node)
 *
 * ```ts import.meta.vitest
 * import { ConfigProvider } from "effect"
 *
 * ConfigProvider.makeValue("3000") // => { _tag: "Value", value: "3000" }
 * ```
 *
 * @see {@link makeRecord} – for object-like containers
 * @see {@link makeArray} – for array-like containers
 *
 * @category constructors
 * @since 4.0.0
 */
export function makeValue(value: string): Node {
  return { _tag: "Value", value }
}

/**
 * Creates a `Record` node representing an object-like container with known
 * child keys.
 *
 * **When to use**
 *
 * Use when you need to describe a directory or JSON object inside a custom
 * provider.
 *
 * **Details**
 *
 * The optional `value` allows a node to be both a container and a leaf at the
 * same time (for example, an env var `A=x` that also has children `A_FOO` and
 * `A_BAR`).
 *
 * **Example** (Creating a record node)
 *
 * ```ts import.meta.vitest
 * import { ConfigProvider } from "effect"
 *
 * const node = ConfigProvider.makeRecord(new Set(["host", "port"]))
 * node._tag // => "Record"
 * if (node._tag === "Record") {
 *   node.keys // => new Set(["host", "port"])
 *   node.value // => undefined
 * }
 * ```
 *
 * @see {@link makeValue} – for terminal leaves
 * @see {@link makeArray} – for array-like containers
 *
 * @category constructors
 * @since 4.0.0
 */
export function makeRecord(keys: ReadonlySet<string>, value?: string): Node {
  return { _tag: "Record", keys, value }
}

/**
 * Creates an `Array` node representing an indexed container with a known
 * length.
 *
 * **When to use**
 *
 * Use when you need to describe a JSON array or numerically indexed env vars
 * inside a custom provider.
 *
 * **Details**
 *
 * The optional `value` allows a node to be both a container and a leaf at the
 * same time.
 *
 * **Example** (Creating an array node)
 *
 * ```ts import.meta.vitest
 * import { ConfigProvider } from "effect"
 *
 * ConfigProvider.makeArray(3) // => { _tag: "Array", length: 3, value: undefined }
 * ```
 *
 * @see {@link makeValue} – for terminal leaves
 * @see {@link makeRecord} – for object-like containers
 *
 * @category constructors
 * @since 4.0.0
 */
export function makeArray(length: number, value?: string): Node {
  return { _tag: "Array", length, value }
}

/**
 * Typed error indicating that a configuration source could not be read.
 *
 * **When to use**
 *
 * Use when you need to report that a custom provider's underlying store is
 * unreachable or produced an I/O error while reading configuration data.
 *
 * **Gotchas**
 *
 * Do not use `SourceError` for "key not found". That case is represented by
 * returning `undefined` from `load`.
 *
 * **Example** (Failing with a SourceError)
 *
 * ```ts import.meta.vitest
 * import { ConfigProvider, Effect } from "effect"
 *
 * const provider = ConfigProvider.make((_path) =>
 *   Effect.fail(
 *     new ConfigProvider.SourceError({ message: "connection refused" })
 *   )
 * )
 *
 * Effect.runSync(Effect.flip(provider.load(["host"]))).message // => "connection refused"
 * ```
 *
 * @see {@link ConfigProvider} – the interface whose `load` may fail with this
 *   error
 *
 * @category errors
 * @since 4.0.0
 */
export class SourceError extends Data.TaggedError("SourceError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

/**
 * An ordered sequence of string or numeric segments that addresses a node in
 * the configuration tree. String segments name object keys; numeric segments
 * index into arrays.
 *
 * **When to use**
 *
 * Use to address raw configuration nodes when implementing or transforming a
 * `ConfigProvider`.
 *
 * **Example** (A typical config path)
 *
 * ```ts import.meta.vitest
 * import type { ConfigProvider } from "effect"
 *
 * const path: ConfigProvider.Path = ["database", "replicas", 0, "host"]
 * path.join(".") // => "database.replicas.0.host"
 * ```
 *
 * @category models
 * @since 4.0.0
 */
export type Path = ReadonlyArray<string | number>

/**
 * The core interface for loading raw configuration data.
 *
 * **When to use**
 *
 * Use to type-annotate variables that hold a provider or to implement a
 * custom provider via {@link make}.
 *
 * **Details**
 *
 * `load(path)` is the semantic lookup operation used by the `Config` module.
 * It applies provider transformations and composition before consulting the
 * underlying source. `undefined` means "not found", a `Node` means the path
 * exists, and `SourceError` means the source itself failed.
 *
 * `mapInput(f)` is the provider's path-transformation capability. Keeping this
 * capability on the provider allows source and composite providers to preserve
 * their own lookup behavior without exposing an internal representation.
 * Transformations compose in application order: `f` receives the path produced
 * by earlier transformations.
 *
 * `load` deliberately accepts only a `Path`. Path transformation is modeled by
 * returning another provider through `mapInput`, rather than by adding a
 * transformation callback to every lookup. Custom implementations therefore
 * expose lookup and transformation behavior, but no source or composition
 * state.
 *
 * @see {@link make} – construct a provider from a lookup function
 * @see {@link orElse} – compose providers with fallback
 *
 * @category services
 * @since 4.0.0
 */
export interface ConfigProvider extends Pipeable {
  /**
   * Returns a `Node` when `path` exists or `undefined` when it does not. Fails
   * with `SourceError` when the underlying source cannot be read.
   *
   * **When to use**
   *
   * Use to resolve a path through this provider's path transformations before
   * reading the backing source.
   *
   * **Details**
   *
   * Lookup absence controls provider composition, such as whether
   * {@link orElse} consults its fallback. An optional `value` inside a found
   * `Record` or `Array` node remains `undefined` because it describes the shape
   * of that node rather than the outcome of the lookup.
   */
  readonly load: (path: Path) => Effect.Effect<Node | undefined, SourceError>

  /**
   * Returns a provider that applies `f` to lookup paths after any existing path
   * transformations.
   *
   * **When to use**
   *
   * Use to implement provider-specific path transformation behavior. Most
   * callers should use the pipeable {@link mapInput} combinator.
   *
   * **Details**
   *
   * This capability is part of the provider interface so composite providers
   * can distribute transformations to their operands while preserving each
   * operand's behavior. Providers created with {@link make} implement it
   * automatically.
   */
  readonly mapInput: (f: (path: Path) => Path) => ConfigProvider
}

/**
 * Context reference for the active raw configuration provider, registered in the context with a
 * default value of `fromEnv()`. Because it is a `Context.Reference`, it is
 * available without explicit provision; `Config` schemas automatically resolve
 * it.
 *
 * **When to use**
 *
 * Use to override the active raw configuration provider for an entire program,
 * or retrieve the current provider inside an Effect.
 *
 * **Example** (Providing a custom provider)
 *
 * ```ts import.meta.vitest
 * import { ConfigProvider, Effect } from "effect"
 *
 * const provider = ConfigProvider.fromUnknown({ port: 8080 })
 *
 * const program = Effect.gen(function*() {
 *   const current = yield* ConfigProvider.ConfigProvider
 *   return current
 * }).pipe(
 *   Effect.provideService(ConfigProvider.ConfigProvider, provider)
 * )
 *
 * Effect.runSync(program) === provider // => true
 * ```
 *
 * @see {@link layer} – install a provider as a Layer
 * @see {@link layerAdd} – add a fallback provider as a Layer
 *
 * @category services
 * @since 4.0.0
 */
export const ConfigProvider: Context.Reference<ConfigProvider> = Context.Reference<ConfigProvider>(
  "effect/ConfigProvider",
  { defaultValue: () => fromEnv() }
)

const Proto = {
  ...PipeInspectableProto,
  toJSON(this: ConfigProvider) {
    return {
      _id: "ConfigProvider"
    }
  }
}

const identityPath = (path: Path): Path => path

function makeProvider(
  load: (path: Path) => Effect.Effect<Node | undefined, SourceError>,
  mapInput: (f: (path: Path) => Path) => ConfigProvider
): ConfigProvider {
  const self = Object.create(Proto)
  self.load = load
  self.mapInput = mapInput
  return self
}

function makeSource(
  get: (path: Path) => Effect.Effect<Node | undefined, SourceError>,
  transform: (path: Path) => Path
): ConfigProvider {
  return makeProvider(
    (path) => get(transform(path)),
    (f) => makeSource(get, (path) => f(transform(path)))
  )
}

function makeOrElse(first: ConfigProvider, second: ConfigProvider): ConfigProvider {
  return makeProvider(
    (path) =>
      Effect.flatMap(
        first.load(path),
        (node) => node !== undefined ? Effect.succeed(node) : second.load(path)
      ),
    (f) => makeOrElse(first.mapInput(f), second.mapInput(f))
  )
}

/**
 * Creates a `ConfigProvider` from a raw lookup function.
 *
 * **When to use**
 *
 * Use when implementing a provider backed by a custom store, such as a
 * database, remote API, or in-memory map.
 *
 * **Details**
 *
 * The `get` callback receives a `Path` and must return
 * `Effect<Node | undefined, SourceError>`. Return `undefined` when the path does
 * not exist, a `Node` when it does, and fail with `SourceError` only when the
 * source cannot be read.
 *
 * Providers created by `make` also implement the path-transformation
 * capability used by {@link mapInput}, {@link constantCase}, and
 * {@link nested}.
 *
 * **Example** (Creating a simple in-memory provider)
 *
 * ```ts import.meta.vitest
 * import { ConfigProvider, Effect } from "effect"
 *
 * const data: Record<string, string> = {
 *   host: "localhost",
 *   port: "5432"
 * }
 *
 * const provider = ConfigProvider.make((path) => {
 *   const key = path.join(".")
 *   const value = data[key]
 *   return Effect.succeed(
 *     value !== undefined ? ConfigProvider.makeValue(value) : undefined
 *   )
 * })
 *
 * Effect.runSync(provider.load(["host"])) // => ConfigProvider.makeValue("localhost")
 * ```
 *
 * @see {@link fromEnv} – pre-built provider for environment variables
 * @see {@link fromUnknown} – pre-built provider for JSON objects
 *
 * @category constructors
 * @since 4.0.0
 */
export function make(get: (path: Path) => Effect.Effect<Node | undefined, SourceError>): ConfigProvider {
  return makeSource(get, identityPath)
}

/**
 * Returns a provider that falls back to `that` when `self` returns `undefined`
 * for a path.
 *
 * **When to use**
 *
 * Use to layer multiple config sources, such as env vars plus a defaults file,
 * or provide partial overrides on top of a base config.
 *
 * **Details**
 *
 * Each provider keeps its own path transformations. If the combined provider
 * is later transformed with {@link mapInput} or {@link nested}, the
 * transformation is applied to both sides.
 *
 * **Gotchas**
 *
 * The fallback only runs when the path is not found (`undefined`). A
 * `SourceError` from `self` is not caught; it propagates immediately.
 *
 * **Example** (Falling back to a default provider)
 *
 * ```ts import.meta.vitest
 * import { ConfigProvider, Effect } from "effect"
 *
 * const envProvider = ConfigProvider.fromEnv({
 *   env: { HOST: "prod.example.com" }
 * })
 * const defaults = ConfigProvider.fromUnknown({ HOST: "localhost", PORT: "3000" })
 *
 * const combined = ConfigProvider.orElse(envProvider, defaults)
 *
 * const host = Effect.runSync(combined.load(["HOST"]))
 * const port = Effect.runSync(combined.load(["PORT"]))
 * const values = [host?.value, port?.value] // => ["prod.example.com", "3000"]
 * ```
 *
 * @see {@link layerAdd} – install a fallback provider via a Layer
 *
 * @category combinators
 * @since 2.0.0
 */
export const orElse: {
  (that: ConfigProvider): (self: ConfigProvider) => ConfigProvider
  (self: ConfigProvider, that: ConfigProvider): ConfigProvider
} = dual(
  2,
  (self: ConfigProvider, that: ConfigProvider): ConfigProvider => makeOrElse(self, that)
)

/**
 * Transforms the path segments before they reach the underlying store.
 *
 * **When to use**
 *
 * Use when you need to rename, re-case, or otherwise transform config path
 * segments before lookup.
 *
 * **Details**
 *
 * The function `f` receives the whole path produced by earlier provider
 * transformations and must return a new path. Lookup path transformations
 * compose in application order: the existing transformation runs first, then
 * `f` runs. For providers composed with {@link orElse}, the transformation is
 * applied to each operand.
 *
 * The combinator delegates transformation to the provider itself. Use
 * {@link make} for custom sources so this capability is implemented
 * automatically.
 *
 * **Example** (Uppercasing path segments)
 *
 * ```ts import.meta.vitest
 * import { ConfigProvider, Effect } from "effect"
 *
 * const provider = ConfigProvider.fromEnv({
 *   env: { APP_HOST: "localhost" }
 * })
 *
 * const upper = ConfigProvider.mapInput(provider, (path) =>
 *   path.map((seg) =>
 *     typeof seg === "string" ? seg.toUpperCase() : seg
 *   )
 * )
 *
 * const node = Effect.runSync(upper.load(["app_host"]))
 * node?.value // => "localhost"
 * ```
 *
 * @see {@link constantCase} – a preset that converts to `CONSTANT_CASE`
 * @see {@link nested} – for prepending a prefix instead of transforming
 *
 * @category combinators
 * @since 4.0.0
 */
export const mapInput: {
  (f: (path: Path) => Path): (self: ConfigProvider) => ConfigProvider
  (self: ConfigProvider, f: (path: Path) => Path): ConfigProvider
} = dual(
  2,
  (self: ConfigProvider, f: (path: Path) => Path): ConfigProvider => self.mapInput(f)
)

/**
 * Converts all string path segments to `CONSTANT_CASE` before lookup.
 *
 * **When to use**
 *
 * Use to bridge camelCase schema keys to `SCREAMING_SNAKE_CASE`
 * environment variables.
 *
 * **Details**
 *
 * Numeric segments are left unchanged. String segments use `String.configCase`
 * so numeric word groups such as `v2` are preserved for environment variable
 * names. This is a specialization of {@link mapInput}.
 *
 * **Example** (Resolving camelCase keys to env vars)
 *
 * ```ts import.meta.vitest
 * import { ConfigProvider, Effect } from "effect"
 *
 * const provider = ConfigProvider.fromEnv({
 *   env: { DATABASE_HOST: "localhost" }
 * }).pipe(ConfigProvider.constantCase)
 *
 * // path ["databaseHost"] now resolves to env var DATABASE_HOST
 * const node = Effect.runSync(provider.load(["databaseHost"]))
 * node?.value // => "localhost"
 * ```
 *
 * @see {@link mapInput} – for arbitrary path transformations
 *
 * @category combinators
 * @since 2.0.0
 */
export const constantCase: (self: ConfigProvider) => ConfigProvider = mapInput((path) =>
  path.map((seg) => typeof seg === "number" ? seg : Str.configCase(seg))
)

/**
 * Scopes a provider so that all lookups are prefixed with the given path
 * segments.
 *
 * **When to use**
 *
 * Use to namespace config under a prefix like `"app"` or `"database"`, or
 * reuse the same provider shape for multiple sub-configs.
 *
 * **Details**
 *
 * Accepts a single string or a full `Path` array. For providers composed with
 * {@link orElse}, the prefix is applied to each operand. Supports both
 * data-last and data-first calling conventions.
 *
 * **Gotchas**
 *
 * Ordering matters when composing with {@link mapInput} or
 * {@link constantCase}. Later provider transformations run after earlier ones:
 * a later `nested` becomes the outer prefix, and a later `mapInput` sees the
 * whole path produced by previous transformations.
 *
 * **Example** (Nesting under a prefix)
 *
 * ```ts import.meta.vitest
 * import { ConfigProvider, Effect } from "effect"
 *
 * const provider = ConfigProvider.fromEnv({
 *   env: { APP_HOST: "localhost", APP_PORT: "3000" }
 * })
 *
 * // Lookups for ["HOST"] now resolve to ["APP", "HOST"]
 * const scoped = ConfigProvider.nested(provider, "APP")
 * const node = Effect.runSync(scoped.load(["HOST"]))
 * node?.value // => "localhost"
 * ```
 *
 * @see {@link mapInput} – for arbitrary path transformations
 *
 * @category combinators
 * @since 2.0.0
 */
export const nested: {
  (prefix: string | Path): (self: ConfigProvider) => ConfigProvider
  (self: ConfigProvider, prefix: string | Path): ConfigProvider
} = dual(
  2,
  (self: ConfigProvider, prefix: string | Path): ConfigProvider => {
    const path = typeof prefix === "string" ? [prefix] : prefix
    return mapInput(self, (input) => [...path, ...input])
  }
)

/**
 * Provides a layer that installs a `ConfigProvider` as the active provider for
 * all downstream effects, replacing any previously installed provider.
 *
 * **When to use**
 *
 * Use to set the config source for an entire application or test suite.
 *
 * **Details**
 *
 * Accepts either a plain `ConfigProvider` or an `Effect` that produces one.
 * When given an Effect, it is evaluated once when the layer is built.
 *
 * **Example** (Reading config from a JSON object)
 *
 * ```ts import.meta.vitest
 * import { Config, ConfigProvider, Effect, Layer } from "effect"
 *
 * const TestLayer = ConfigProvider.layer(
 *   ConfigProvider.fromUnknown({ port: 8080 })
 * )
 *
 * const program = Effect.gen(function*() {
 *   const port = yield* Config.Number("port")
 *   return port
 * })
 *
 * Effect.runSync(Effect.provide(program, TestLayer)) // => 8080
 * ```
 *
 * @see {@link layerAdd} – add a provider without replacing the existing one
 *
 * @category layers
 * @since 4.0.0
 */
export const layer = <E = never, R = never>(
  self: ConfigProvider | Effect.Effect<ConfigProvider, E, R>
): Layer.Layer<never, E, Exclude<R, Scope>> =>
  Effect.isEffect(self) ? Layer.effect(ConfigProvider)(self) : Layer.succeed(ConfigProvider)(self)

/**
 * Creates a Layer that composes a new `ConfigProvider` with the currently
 * active one, rather than replacing it.
 *
 * **When to use**
 *
 * Use to add defaults that should only apply when the primary provider has no
 * value for a path, or override specific keys while keeping the rest from the
 * existing provider by setting `asPrimary: true`.
 *
 * **Details**
 *
 * By default, the new provider acts as a fallback and is consulted only when
 * the current provider returns `undefined`. Set `asPrimary: true` to make
 * the new provider the primary source, with the existing one as fallback.
 *
 * **Example** (Adding default values)
 *
 * ```ts import.meta.vitest
 * import { Config, ConfigProvider, Effect, Layer } from "effect"
 *
 * const defaults = ConfigProvider.fromUnknown({
 *   HOST: "localhost",
 *   PORT: "3000"
 * })
 *
 * // The current env provider is tried first; `defaults` is the fallback
 * const DefaultsLayer = ConfigProvider.layerAdd(defaults)
 * const BaseLayer = ConfigProvider.layer(ConfigProvider.fromUnknown({}))
 * const program = Config.String("HOST")
 *
 * const layer = Layer.provide(DefaultsLayer, BaseLayer)
 * Effect.runSync(Effect.provide(program, layer)) // => "localhost"
 * ```
 *
 * @see {@link layer} – replace the provider entirely
 * @see {@link orElse} – compose providers without layers
 *
 * @category layers
 * @since 4.0.0
 */
export const layerAdd = <E = never, R = never>(
  self: ConfigProvider | Effect.Effect<ConfigProvider, E, R>,
  options?: {
    readonly asPrimary?: boolean | undefined
  } | undefined
): Layer.Layer<never, E, Exclude<R, Scope>> =>
  Layer.effect(ConfigProvider)(
    Effect.gen(function*() {
      const current = yield* ConfigProvider
      const configProvider = Effect.isEffect(self) ? yield* self : self
      return options?.asPrimary ? orElse(configProvider, current) : orElse(current, configProvider)
    })
  )

/**
 * Creates a `ConfigProvider` backed by an in-memory JavaScript value
 * (typically a parsed JSON object).
 *
 * **When to use**
 *
 * Use when you need deterministic config from an in-memory JavaScript value,
 * such as in tests, embedded config, or parsed JSON.
 *
 * **Details**
 *
 * Path traversal follows standard JS rules: string segments index into object
 * keys, numeric segments index into arrays. Returns `undefined` for any
 * path that cannot be resolved. Never fails with `SourceError`.
 *
 * Primitive values (`number`, `boolean`, `bigint`) are stringified via
 * `String(...)`.
 *
 * Literal empty strings are treated as missing values when loaded as values by
 * default. Pass `{ preserveEmptyStrings: true }` to keep empty strings as
 * explicit values.
 *
 * **Gotchas**
 *
 * Object keys and array lengths reflect the original input shape. A leaf value
 * of `""` is treated as missing when that leaf is loaded, but the parent
 * container still reports its original keys or length.
 *
 * **Example** (Providing config from a plain object)
 *
 * ```ts import.meta.vitest
 * import { Config, ConfigProvider, Effect } from "effect"
 *
 * const provider = ConfigProvider.fromUnknown({
 *   database: {
 *     host: "localhost",
 *     port: 5432
 *   }
 * })
 *
 * const host = Config.String("host").parse(
 *   provider.pipe(ConfigProvider.nested("database"))
 * )
 *
 * Effect.runSync(host) // => "localhost"
 * ```
 *
 * @see {@link fromEnv} – for environment variables
 * @see {@link make} – for custom backing stores
 *
 * @category constructors
 * @since 4.0.0
 */
export function fromUnknown(root: unknown, options?: {
  readonly preserveEmptyStrings?: boolean | undefined
}): ConfigProvider {
  const preserveEmptyStrings = options?.preserveEmptyStrings === true
  return make((path) => Effect.succeed(nodeAtJson(root, path, preserveEmptyStrings)))
}

function nodeAtJson(root: unknown, path: Path, preserveEmptyStrings: boolean): Node | undefined {
  let cur: unknown = root

  for (const seg of path) {
    if (cur === null || cur === undefined) return undefined

    if (Array.isArray(cur)) {
      if (typeof seg !== "number" || !Number.isInteger(seg) || seg < 0 || seg >= cur.length) return undefined
      cur = cur[seg]
      continue
    }

    if (Predicate.isObject(cur)) {
      if (typeof seg !== "string") return undefined
      if (!Object.hasOwn(cur, seg)) return undefined
      cur = cur[seg]
      continue
    }

    // cannot descend
    return undefined
  }

  return describeUnknown(cur, preserveEmptyStrings)
}

function describeUnknown(u: unknown, preserveEmptyStrings: boolean): Node | undefined {
  if (u === undefined || u === null) return undefined
  if (typeof u === "string") return stringNode(u, preserveEmptyStrings)
  if (typeof u === "number" || typeof u === "boolean" || typeof u === "bigint") {
    return makeValue(String(u))
  }
  if (Array.isArray(u)) return makeArray(u.length)
  if (Predicate.isObject(u)) {
    return makeRecord(new Set(Object.keys(u)))
  }
  // unknown values
  return makeValue(format(u))
}

function stringNode(value: string, preserveEmptyStrings: boolean): Node | undefined {
  const normalized = emptyStringAsMissing(value, preserveEmptyStrings)
  return normalized === undefined ? undefined : makeValue(normalized)
}

function emptyStringAsMissing(value: string | undefined, preserveEmptyStrings: boolean): string | undefined {
  return value === "" && !preserveEmptyStrings ? undefined : value
}

/**
 * Creates a `ConfigProvider` backed by an explicit environment record.
 *
 * **When to use**
 *
 * Use when a restricted runtime cannot evaluate the automatic environment
 * detection performed by {@link fromEnv}, or whenever the environment record
 * must be supplied explicitly.
 *
 * **Details**
 *
 * `undefined` values are ignored. Path lookup and child discovery otherwise
 * use the same environment-variable semantics as {@link fromEnv}.
 *
 * Environment variable names are captured at construction time to establish
 * record keys and array lengths. The supplied record remains live for value
 * lookups, so updates to known paths are observed by later loads. Keys added
 * after construction can be loaded directly, but do not appear in captured
 * parent record keys or array lengths.
 *
 * Literal empty strings are treated as missing values by default. Pass
 * `{ preserveEmptyStrings: true }` to keep empty strings as explicit values.
 *
 * @see {@link fromEnv} – automatically reads the runtime environment
 *
 * @category constructors
 * @since 4.0.0
 */
export function fromEnvRecord(
  env: Record<string, string | undefined>,
  options?: { readonly preserveEmptyStrings?: boolean | undefined }
): ConfigProvider {
  const preserveEmptyStrings = options?.preserveEmptyStrings === true
  const trie = buildEnvTrie(env)
  return make((path) => Effect.succeed(nodeAtEnv(trie, env, path, preserveEmptyStrings)))
}

/**
 * Creates a `ConfigProvider` backed by environment variables.
 *
 * **When to use**
 *
 * Use to read configuration from `process.env`, which is the default when no
 * provider is explicitly set, or pass a custom env record for testing.
 *
 * **Details**
 *
 * Path segments are joined with `_` for direct lookup, and env var names are
 * also split on `_` to build a trie for child key discovery. This means
 * `DATABASE_HOST=localhost` is accessible at both path `["DATABASE_HOST"]`
 * and `["DATABASE", "HOST"]`. If all immediate children of a trie node have
 * purely numeric names, the node is reported as an `Array`; otherwise as a
 * `Record`.
 *
 * The default environment merges `process.env` and `import.meta.env` (when
 * available). Override by passing `{ env: { ... } }`.
 *
 * Literal empty strings are treated as missing values when loaded as values by
 * default. Pass `{ preserveEmptyStrings: true }` to keep empty strings as
 * explicit values. Child discovery still reflects the environment variable
 * names present in the source.
 *
 * Never fails with `SourceError` — all lookups are synchronous.
 *
 * **Example** (Reading from a custom env record)
 *
 * ```ts import.meta.vitest
 * import { Config, ConfigProvider, Effect } from "effect"
 *
 * const provider = ConfigProvider.fromEnv({
 *   env: {
 *     DATABASE_HOST: "localhost",
 *     DATABASE_PORT: "5432"
 *   }
 * })
 *
 * const host = Config.String("HOST").parse(
 *   provider.pipe(ConfigProvider.nested("DATABASE"))
 * )
 *
 * Effect.runSync(host) // => "localhost"
 * ```
 *
 * @see {@link fromUnknown} – for JSON objects
 * @see {@link fromEnvRecord} – for explicit records in restricted runtimes
 * @see {@link constantCase} – bridge camelCase keys to SCREAMING_SNAKE_CASE
 *
 * @category constructors
 * @since 2.0.0
 */
export function fromEnv(options?: {
  readonly env?: Record<string, string> | undefined
  readonly preserveEmptyStrings?: boolean | undefined
}): ConfigProvider {
  const env: Record<string, string | undefined> = options?.env ?? {
    ...(globalThis as {
      readonly process?: { readonly env?: Record<string, string | undefined> }
    }).process?.env,
    ...(import.meta as any)?.env
  }
  return fromEnvRecord(env, { preserveEmptyStrings: options?.preserveEmptyStrings })
}

type EnvTrieNode = {
  children?: Record<string, EnvTrieNode>
}

function buildEnvTrie(env: Record<string, string | undefined>): EnvTrieNode {
  const trie: EnvTrieNode = {}

  for (const [name, value] of Object.entries(env)) {
    if (value === undefined) continue

    // Split on "_" and keep empty segments (no special handling for "__")
    const segments = name.split("_")

    let node = trie
    for (const seg of segments) {
      const children = node.children ??= Object.create(null)
      node = children[seg] ??= {}
    }
  }

  return trie
}

function nodeAtEnv(
  trie: EnvTrieNode,
  env: Record<string, string | undefined>,
  path: Path,
  preserveEmptyStrings: boolean
): Node | undefined {
  const key = path.map(String).join("_")
  const leafValue = emptyStringAsMissing(Object.hasOwn(env, key) ? env[key] : undefined, preserveEmptyStrings)

  const trieNode = trieNodeAt(trie, path)
  const children = trieNode?.children ? Object.keys(trieNode.children) : []

  if (children.length === 0) {
    return leafValue === undefined ? undefined : makeValue(leafValue)
  }

  const allNumeric = children.every(Arr.isCanonicalArrayIndex)
  if (allNumeric) {
    const length = Math.max(...children.map((k) => parseInt(k, 10))) + 1
    return makeArray(length, leafValue)
  }

  return makeRecord(new Set(children), leafValue)
}

function trieNodeAt(root: EnvTrieNode, path: Path): EnvTrieNode | undefined {
  if (path.length === 0) return root

  // Convert path segments to strings and navigate through the trie
  let node: EnvTrieNode | undefined = root
  for (const seg of path) {
    node = node?.children?.[String(seg)]
    if (!node) return undefined
  }
  return node
}

/**
 * Creates a `ConfigProvider` by parsing the string contents of a `.env` file.
 *
 * **When to use**
 *
 * Use when you already have the `.env` contents as a string, such as contents
 * fetched from a remote store or embedded in a test.
 *
 * **Details**
 *
 * Supports `export` prefixes, single/double/backtick quoting, inline comments,
 * and escaped newlines. Variable expansion (for example, `${VAR}`) is disabled
 * by default; enable with `{ expandVariables: true }`.
 *
 * Literal empty strings are treated as missing values when loaded as values by
 * default. Pass `{ preserveEmptyStrings: true }` to keep empty strings as
 * explicit values. Child discovery still reflects the keys present in the
 * parsed `.env` source.
 *
 * Parsing is based on the `dotenv` / `dotenv-expand` algorithm.
 *
 * Internally delegates to {@link fromEnvRecord} with the parsed key-value pairs.
 *
 * **Example** (Parsing .env contents)
 *
 * ```ts import.meta.vitest
 * import { ConfigProvider, Effect } from "effect"
 *
 * const contents = `
 * HOST=localhost
 * PORT=3000
 * # this is a comment
 * `
 *
 * const provider = ConfigProvider.fromDotEnvContents(contents)
 * const port = Effect.runSync(provider.load(["PORT"]))
 * port?.value // => "3000"
 * ```
 *
 * @see {@link fromDotEnv} – loads a `.env` file from disk
 * @see {@link fromEnvRecord} – for explicit environment records
 * @see {@link fromEnv} – for raw environment variable access
 *
 * @category constructors
 * @since 4.0.0
 */
export function fromDotEnvContents(lines: string, options?: {
  readonly expandVariables?: boolean | undefined
  readonly preserveEmptyStrings?: boolean | undefined
}): ConfigProvider {
  let env = parseDotEnvContents(lines)
  if (options?.expandVariables) {
    env = dotEnvExpand(env)
  }
  return fromEnvRecord(env, { preserveEmptyStrings: options?.preserveEmptyStrings })
}

const DOT_ENV_LINE =
  /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/mg

function parseDotEnvContents(lines: string): Record<string, string> {
  const obj: Record<string, string> = Object.create(null)

  // Convert line breaks to same format
  lines = lines.replace(/\r\n?/gm, "\n")

  let match: RegExpExecArray | null
  while ((match = DOT_ENV_LINE.exec(lines)) != null) {
    const key = match[1]

    // Default undefined or null to empty string
    let value = match[2] || ""

    // Remove whitespace
    value = value.trim()

    // Check if double quoted
    const maybeQuote = value[0]

    // Remove surrounding quotes
    value = value.replace(/^(['"`])([\s\S]*)\1$/gm, "$2")

    // Expand newlines if double quoted
    if (maybeQuote === "\"") {
      value = value.replace(/\\n/g, "\n")
      value = value.replace(/\\r/g, "\r")
    }

    // Add to object
    obj[key] = value
  }

  return obj
}

function dotEnvExpand(parsed: Record<string, string>): Record<string, string> {
  const newParsed: Record<string, string> = Object.create(null)

  for (const configKey of Object.keys(parsed)) {
    // resolve escape sequences
    newParsed[configKey] = interpolate(parsed[configKey], parsed).replace(/\\\$/g, "$")
  }

  return newParsed
}

function interpolate(envValue: string, parsed: Record<string, string>): string {
  // find the last unescaped dollar sign in the
  // value so that we can evaluate it
  const lastUnescapedDollarSignIndex = searchLast(envValue, /(?!(?<=\\))\$/g)

  // If we couldn't match any unescaped dollar sign
  // let's return the string as is
  if (lastUnescapedDollarSignIndex === -1) return envValue

  // This is the right-most group of variables in the string
  const rightMostGroup = envValue.slice(lastUnescapedDollarSignIndex)

  /**
   * This finds the inner most variable/group divided
   * by variable name and default value (if present)
   * (
   *   (?!(?<=\\))\$        // only match dollar signs that are not escaped
   *   {?                   // optional opening curly brace
   *     ([\w]+)            // match the variable name
   *     (?::-([^}\\]*))?   // match an optional default value
   *   }?                   // optional closing curly brace
   * )
   */
  const matchGroup = /((?!(?<=\\))\${?([\w]+)(?::-([^}\\]*))?}?)/
  const match = rightMostGroup.match(matchGroup)

  if (match !== null) {
    const [_, group, variableName, defaultValue] = match
    const value = Object.hasOwn(parsed, variableName) && parsed[variableName] !== ""
      ? parsed[variableName]
      : defaultValue ?? ""

    return interpolate(
      envValue.replace(group, () => value),
      parsed
    )
  }

  return envValue
}

function searchLast(str: string, rgx: RegExp): number {
  const matches = Array.from(str.matchAll(rgx))
  return matches.length > 0 ? matches.slice(-1)[0].index : -1
}

/**
 * Creates a `ConfigProvider` by reading and parsing a `.env` file from the
 * file system.
 *
 * **When to use**
 *
 * Use to load environment config from a `.env` file at application startup.
 *
 * **Details**
 *
 * Requires `FileSystem` in the Effect context. Defaults to reading `".env"` in
 * the current directory; override with `{ path: "/custom/.env" }`.
 * Variable expansion (for example, `${VAR}`) is disabled by default; enable
 * with `{ expandVariables: true }`.
 *
 * Literal empty strings are treated as missing values when loaded as values by
 * default. Pass `{ preserveEmptyStrings: true }` to keep empty strings as
 * explicit values. Child discovery still reflects the keys present in the
 * parsed `.env` source.
 *
 * Returns an `Effect` that resolves to a `ConfigProvider`. Fails with a
 * `PlatformError` if the file cannot be read.
 *
 * **Example** (Loading a .env file)
 *
 * ```ts import.meta.vitest
 * import { ConfigProvider, Effect, FileSystem } from "effect"
 *
 * const fileSystem = FileSystem.makeNoop({
 *   readFileString: () => Effect.succeed("HOST=localhost")
 * })
 *
 * const program = Effect.gen(function*() {
 *   const provider = yield* ConfigProvider.fromDotEnv()
 *   return yield* provider.load(["HOST"])
 * })
 *
 * const node = await Effect.runPromise(
 *   Effect.provideService(program, FileSystem.FileSystem, fileSystem)
 * )
 * node?.value // => "localhost"
 * ```
 *
 * @see {@link fromDotEnvContents} – parse a `.env` string directly
 * @see {@link fromEnv} – read from the runtime environment
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromDotEnv: (options?: {
  readonly path?: string | undefined
  readonly expandVariables?: boolean | undefined
  readonly preserveEmptyStrings?: boolean | undefined
}) => Effect.Effect<ConfigProvider, PlatformError, FileSystem.FileSystem> = Effect.fnUntraced(
  function*(options) {
    const fs = yield* FileSystem.FileSystem
    const content = yield* fs.readFileString(options?.path ?? ".env")
    return fromDotEnvContents(content, options)
  }
)

/**
 * Creates a `ConfigProvider` that reads configuration from a directory tree
 * on disk, where each file is a leaf value and each directory is a container.
 *
 * **When to use**
 *
 * Use when you expose each config key as a file under a directory, such as
 * Kubernetes ConfigMap or Secret volume mounts.
 *
 * **Details**
 *
 * Resolution tries a regular file first and returns a `Value` node for
 * non-empty trimmed file contents. If the file read fails, it tries a directory
 * and returns a `Record` node with immediate child names as keys. If both fail
 * with `NotFound`, it returns `undefined`. Other platform failures return
 * `SourceError`.
 *
 * Requires `Path` and `FileSystem` in the Effect context. Defaults to root
 * path `/`; override with `{ rootPath: "/etc/config" }`.
 *
 * Literal empty strings are treated as missing values by default after file
 * contents are trimmed. Pass `{ preserveEmptyStrings: true }` to keep empty
 * strings as explicit values. Directory listings still reflect the file names
 * present on disk.
 *
 * **Example** (Reading config from a directory)
 *
 * ```ts import.meta.vitest
 * import { ConfigProvider, Effect, FileSystem, Path } from "effect"
 *
 * const fileSystem = FileSystem.makeNoop({
 *   readFileString: (path) =>
 *     path === "/etc/myapp/host"
 *       ? Effect.succeed("localhost")
 *       : Effect.die("unexpected path")
 * })
 *
 * const program = Effect.gen(function*() {
 *   const provider = yield* ConfigProvider.fromDir({
 *     rootPath: "/etc/myapp"
 *   })
 *   return yield* provider.load(["host"])
 * })
 *
 * const node = await Effect.runPromise(
 *   program.pipe(
 *     Effect.provide(Path.layer),
 *     Effect.provideService(FileSystem.FileSystem, fileSystem)
 *   )
 * )
 * node?.value // => "localhost"
 * ```
 *
 * @see {@link fromEnv} – for environment variables
 * @see {@link fromDotEnv} – for `.env` files
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromDir: (options?: {
  readonly rootPath?: string | undefined
  readonly preserveEmptyStrings?: boolean | undefined
}) => Effect.Effect<
  ConfigProvider,
  never,
  Path_.Path | FileSystem.FileSystem
> = Effect.fnUntraced(function*(options) {
  const platformPath = yield* Path_.Path
  const fs = yield* FileSystem.FileSystem
  const rootPath = options?.rootPath ?? "/"
  const preserveEmptyStrings = options?.preserveEmptyStrings === true

  return make((path) => {
    const fullPath = platformPath.join(rootPath, ...path.map(String))

    // Try reading as a *file*
    const asFile = fs.readFileString(fullPath).pipe(
      Effect.map((content) => stringNode(content.trim(), preserveEmptyStrings))
    )

    // If not a file, try reading as a *directory*
    const asDirectory = fs.readDirectory(fullPath).pipe(
      Effect.map((entries) => makeRecord(new Set(entries.map((entry) => platformPath.basename(entry)))))
    )

    return asFile.pipe(
      Effect.catch((fileCause) =>
        asDirectory.pipe(
          Effect.catch((dirCause) =>
            isNotFound(fileCause) && isNotFound(dirCause)
              ? Effect.succeed(undefined)
              : Effect.fail(isNotFound(fileCause) ? dirCause : fileCause)
          )
        )
      ),
      Effect.mapError((cause: PlatformError) =>
        new SourceError({
          message: `Failed to read file at ${platformPath.join(rootPath, ...path.map(String))}`,
          cause
        })
      )
    )
  })
})

const isNotFound = (cause: PlatformError) => cause.reason._tag === "NotFound"
