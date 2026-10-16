/**
 * Descriptions of configuration values that can be read from a
 * `ConfigProvider`. A `Config<T>` explains which keys to read, how to decode
 * and validate them, and how to combine defaults, fallbacks, nested paths, and
 * multiple settings. Configs are also Effects, so they can be yielded in
 * `Effect.gen` after a provider has been supplied.
 *
 * @since 4.0.0
 */
import type { Path, SourceError } from "./ConfigProvider.ts"
import * as ConfigProvider from "./ConfigProvider.ts"
import * as Effect from "./Effect.ts"
import * as Effectable from "./Effectable.ts"
import { dual, memoize } from "./Function.ts"
import * as InternalRecord from "./internal/record.ts"
import * as LogLevel_ from "./LogLevel.ts"
import * as Option from "./Option.ts"
import * as Predicate from "./Predicate.ts"
import * as Rec from "./Record.ts"
import * as Result from "./Result.ts"
import * as Schema from "./Schema.ts"
import * as SchemaAST from "./SchemaAST.ts"
import * as SchemaGetter from "./SchemaGetter.ts"
import * as SchemaIssue from "./SchemaIssue.ts"
import * as SchemaParser from "./SchemaParser.ts"
import * as SchemaTransformation from "./SchemaTransformation.ts"

const TypeId = "~effect/Config"

/**
 * Returns `true` if `u` is a `Config` instance.
 *
 * **When to use**
 *
 * Use when you need to distinguish a `Config` from an unknown value before
 * calling `.parse` or {@link unwrap}.
 *
 * **Example** (Checking Config values)
 *
 * ```ts import.meta.vitest
 * import { Config } from "effect"
 *
 * Config.isConfig(Config.String("HOST")) // => true
 * Config.isConfig("not a config") // => false
 * ```
 *
 * @category guards
 * @since 2.0.0
 */
export const isConfig = (u: unknown): u is Config<unknown> => Predicate.hasProperty(u, TypeId)

/**
 * Represents the error type produced when config loading or validation fails.
 *
 * **When to use**
 *
 * Use when you need to inspect config loading or validation failures.
 *
 * **Details**
 *
 * Wraps either:
 * - A `SourceError` — the provider could not read data (I/O failure).
 * - A `SchemaError` — the data was found but did not match the schema
 *   (wrong type, out of range, missing key, etc.).
 *
 * @see {@link orElse} – recover from a ConfigError
 * @see {@link withDefault} – provide a fallback when relevant input is absent
 *
 * @category errors
 * @since 4.0.0
 */
export class ConfigError {
  readonly _tag = "ConfigError"
  readonly name: string = "ConfigError"
  readonly cause: SourceError | Schema.SchemaError
  constructor(cause: SourceError | Schema.SchemaError) {
    this.cause = cause
  }
  get message() {
    return this.cause.toString()
  }
  toString() {
    return `ConfigError(${this.message})`
  }
}

/**
 * A recipe for extracting a typed value `T` from a `ConfigProvider`.
 *
 * **When to use**
 *
 * Use to describe typed configuration that can be parsed from a provider or
 * yielded inside `Effect.gen`.
 *
 * **Details**
 *
 * Key members:
 * - `parse(provider)` – runs the config against a specific provider.
 * - Yieldable – can be yielded inside `Effect.gen`, which automatically
 *   resolves the current `ConfigProvider` from the context.
 * - Pipeable – supports `.pipe(Config.map(...))` etc.
 *
 * @see {@link schema} – the main way to create a Config
 *
 * @category models
 * @since 2.0.0
 */
export interface Config<out T> extends Effect.Effect<T, ConfigError> {
  readonly [TypeId]: typeof TypeId
  readonly parse: (provider: ConfigProvider.ConfigProvider) => Effect.Effect<T, ConfigError>
}

// Result failure represents recoverable absence; Effect failure represents an
// invalid value or a source error. Keep them separate until parsing completes.
type Resolution<T> = Result.Result<T, ConfigError>

type Evaluator<T> = (
  provider: ConfigProvider.ConfigProvider,
  pathPrefix: Path
) => Effect.Effect<Resolution<T>, ConfigError>

interface ConfigImpl<out T> extends Config<T> {
  readonly evaluator: Evaluator<T>
}

const Proto = {
  ...Effectable.Prototype<Config<any>>({
    label: "Config",
    evaluate(fiber) {
      return this.parse(fiber.getRef(ConfigProvider.ConfigProvider))
    }
  }),
  [TypeId]: TypeId,
  toJSON(this: Config<unknown>) {
    return {
      _id: "Config"
    }
  }
}

function make<T>(
  evaluator: Evaluator<T>
): Config<T> {
  const self = Object.create(Proto)
  self.evaluator = evaluator
  self.parse = (provider: ConfigProvider.ConfigProvider) =>
    Effect.flatMapEager(evaluator(provider, []), Effect.fromResult)
  return self
}

const evaluateAt = <T>(
  self: Config<T>,
  provider: ConfigProvider.ConfigProvider,
  pathPrefix: Path
): Effect.Effect<Resolution<T>, ConfigError> => (self as ConfigImpl<T>).evaluator(provider, pathPrefix)

/**
 * Transforms the parsed value of a config with a pure function.
 *
 * **When to use**
 *
 * Use when you need to transform a parsed config value with a function that
 * cannot fail.
 *
 * **Example** (Uppercasing a string config)
 *
 * ```ts import.meta.vitest
 * import { Config, ConfigProvider, Effect } from "effect"
 *
 * const upper = Config.String("name").pipe(
 *   Config.map((s) => s.toUpperCase())
 * )
 *
 * const provider = ConfigProvider.fromUnknown({ name: "alice" })
 * Effect.runSync(upper.parse(provider)) // => "ALICE"
 * ```
 *
 * @see {@link mapEffect} – when the transformation can fail
 *
 * @category mapping
 * @since 2.0.0
 */
export const map: {
  <A, B>(f: (a: A) => B): (self: Config<A>) => Config<B>
  <A, B>(self: Config<A>, f: (a: A) => B): Config<B>
} = dual(2, <A, B>(self: Config<A>, f: (a: A) => B): Config<B> => {
  return make((provider, pathPrefix) => Effect.map(evaluateAt(self, provider, pathPrefix), Result.map(f)))
})

/**
 * Lets you sequence multiple configs that depend on each other or branch to
 * multiple different configs depending on the parent.
 *
 * **When to use**
 *
 * Use when you want to maintain 2 sets of env vars with different names, and switch
 * between whole sets based on a single dedicated env var. Or when you want to
 * provide a variety of environment variable names (`PORT`, `BACKEND_PORT`,
 * `API_PORT`) in order of preference for a specific configuration option, such
 * as the listening port.
 *
 * **Example** (fallback configs and branching)
 *
 * ```ts import.meta.vitest
 * import { Config, Option } from "effect"
 *
 * const EnvVar = (name: string) =>
 *   Config.Literals([
 *     ...["prod", "production", "PROD", "PRODUCTION"] as const,
 *     ...["dev", "development", "DEV", "DEVELOPMENT"] as const
 *   ], name)
 *
 * const withAbsenceFallback = <A, B>(fallback: Config.Config<A>) => (self: Config.Config<B>): Config.Config<A | B> =>
 *   Config.flatMap(
 *     Config.option(self),
 *     Option.match({
 *       onNone: () => fallback,
 *       onSome: Config.succeed<A | B>
 *     })
 *   )
 *
 * // const ENV: Config.Config<"dev" | "prod">
 * const ENV = EnvVar("ENV").pipe(
 *   withAbsenceFallback(EnvVar("NODE_ENV")),
 *   Config.map((fuzzyEnv) =>
 *     fuzzyEnv.toLowerCase().startsWith("dev") ? "dev" : "prod"),
 *   Config.withDefault('dev')
 * )
 *
 * // const hostConfig: Config.Config<string>
 * const hostConfig = ENV.pipe(
 *   Config.flatMap((env) =>
 *     env === "dev"
 *       // dev is very forgiving
 *       ? Config.NonEmptyString("DEV_HOST").pipe(
 *         Config.orElse(() => Config.NonEmptyString("HOST")),
 *         Config.orElse(() => Config.succeed("localhost"))
 *       )
 *       // prod is much stricter
 *       : Config.NonEmptyString("PROD_HOST").pipe(
 *         withAbsenceFallback(Config.NonEmptyString("HOST"))
 *       )
 *   )
 * )
 * ```
 *
 * @category mapping
 * @since 4.0.0
 */
export const flatMap: {
  <A, B>(f: (a: A) => Config<B>): (self: Config<A>) => Config<B>
  <A, B>(self: Config<A>, f: (a: A) => Config<B>): Config<B>
} = dual(2, <A, B>(self: Config<A>, f: (a: A) => Config<B>): Config<B> => {
  return make((provider, pathPrefix) =>
    Effect.flatMap(
      evaluateAt(self, provider, pathPrefix),
      Result.match({
        onSuccess: (success) => evaluateAt(f(success), provider, pathPrefix),
        onFailure: (error) => Effect.succeed(Result.fail(error))
      })
    )
  )
})

/**
 * Transforms the parsed value with a function that may fail.
 *
 * **When to use**
 *
 * Use when you need to transform a parsed config value with a function that can
 * produce a `ConfigError` (e.g. parsing a URL, checking a range).
 *
 * **Example** (Wrapping a value in an effectful transformation)
 *
 * ```ts import.meta.vitest
 * import { Config, ConfigProvider, Effect } from "effect"
 *
 * const trimmed = Config.String("name").pipe(
 *   Config.mapEffect((s) => Effect.succeed(s.trim()))
 * )
 * const provider = ConfigProvider.fromUnknown({ name: " Alice " })
 * Effect.runSync(trimmed.parse(provider)) // => "Alice"
 * ```
 *
 * @see {@link map} – when the transformation cannot fail
 *
 * @category mapping
 * @since 2.0.0
 */
export const mapEffect: {
  <A, B>(f: (a: A) => Effect.Effect<B, ConfigError>): (self: Config<A>) => Config<B>
  <A, B>(self: Config<A>, f: (a: A) => Effect.Effect<B, ConfigError>): Config<B>
} = dual(2, <A, B>(self: Config<A>, f: (a: A) => Effect.Effect<B, ConfigError>): Config<B> => {
  return make((provider, pathPrefix) =>
    Effect.flatMap(
      evaluateAt(self, provider, pathPrefix),
      (resolution): Effect.Effect<Resolution<B>, ConfigError> =>
        Result.isSuccess(resolution)
          ? Effect.mapEager(f(resolution.success), Result.succeed)
          : Effect.succeed(Result.fail(resolution.failure))
    )
  )
})

/**
 * Provides a fallback config when parsing fails with a `ConfigError`.
 *
 * **When to use**
 *
 * Use when you need to try an alternative config source after the primary one
 * fails.
 *
 * **Details**
 *
 * Unlike {@link withDefault}, this handles both semantic absence and **all**
 * `ConfigError`s. The fallback function receives the error and returns a new
 * `Config`.
 *
 * **Gotchas**
 *
 * The fallback's result replaces the original failure. If the fallback is
 * absent, an outer {@link withDefault} or {@link option} can recover it. If the
 * fallback fails, only its error propagates.
 *
 * **Example** (Trying another port before using a default)
 *
 * ```ts import.meta.vitest
 * import { Config, ConfigProvider, Effect } from "effect"
 *
 * const port = Config.Int("PORT").pipe(
 *   Config.orElse(() => Config.Int("BACKUP_PORT")),
 *   Config.withDefault(3000)
 * )
 * const provider = ConfigProvider.fromUnknown({ PORT: "invalid", BACKUP_PORT: "8080" })
 * await Effect.runPromise(port.parse(provider)) // => 8080
 *
 * const missingBackup = ConfigProvider.fromUnknown({ PORT: "invalid" })
 * await Effect.runPromise(port.parse(missingBackup)) // => 3000
 * ```
 *
 * @see {@link withDefault} – fallback only on semantic absence
 *
 * @category combinators
 * @since 2.0.0
 */
export const orElse: {
  <A2>(that: (error: ConfigError) => Config<A2>): <A>(self: Config<A>) => Config<A2 | A>
  <A, A2>(self: Config<A>, that: (error: ConfigError) => Config<A2>): Config<A | A2>
} = dual(2, <A, A2>(self: Config<A>, that: (error: ConfigError) => Config<A2>): Config<A | A2> => {
  return make<A | A2>((provider, pathPrefix) =>
    Effect.matchEffect(evaluateAt(self, provider, pathPrefix), {
      onFailure: (error) => evaluateAt(that(error), provider, pathPrefix),
      onSuccess: (resolution): Effect.Effect<Resolution<A | A2>, ConfigError> =>
        Result.isFailure(resolution)
          ? evaluateAt(that(resolution.failure), provider, pathPrefix)
          : Effect.succeed(resolution)
    })
  )
})

/**
 * Combines multiple configs into a single config that parses all of them.
 *
 * **When to use**
 *
 * Use when you need to group related configs into a tuple or named struct.
 *
 * **Details**
 *
 * Accepts a tuple (preserves positions), an iterable, or a record of configs.
 * Returns a config whose parsed value mirrors the input shape.
 *
 * A combined config is absent when any child is absent and no child fails.
 * Validation and source errors propagate even when another child is absent.
 * An outer {@link withDefault} replaces the entire absent group, while
 * {@link option} returns `None`. Apply defaults to individual children to
 * preserve the values of other children.
 *
 * Unlike a `Schema.Struct` passed to {@link schema}, `all` combines independent
 * lookups. A struct validates an existing object and fails when required fields
 * are missing; `all` can recover missing children through a group default.
 *
 * **Example** (Defaulting an incomplete config group)
 *
 * ```ts import.meta.vitest
 * import { Config, ConfigProvider, Effect } from "effect"
 *
 * const dbConfig = Config.all({
 *   host: Config.String("host"),
 *   port: Config.Number("port")
 * }).pipe(Config.withDefault({ host: "localhost", port: 5432 }))
 *
 * const provider = ConfigProvider.fromUnknown({ host: "db.internal", port: 6000 })
 * await Effect.runPromise(dbConfig.parse(provider)) // => { host: "db.internal", port: 6000 }
 *
 * const missingPort = ConfigProvider.fromUnknown({ host: "db.internal" })
 * await Effect.runPromise(dbConfig.parse(missingPort)) // => { host: "localhost", port: 5432 }
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export function all<const Arg extends Iterable<Config<any>> | Record<string, Config<any>>>(
  arg: Arg
): Config<
  [Arg] extends [ReadonlyArray<Config<any>>] ? {
      -readonly [K in keyof Arg]: [Arg[K]] extends [Config<infer A>] ? A : never
    }
    : [Arg] extends [Iterable<Config<infer A>>] ? Array<A>
    : [Arg] extends [Record<string, Config<any>>] ? {
        -readonly [K in keyof Arg]: [Arg[K]] extends [Config<infer A>] ? A : never
      }
    : never
> {
  const configs: Array<Config<any>> | Record<string, Config<any>> = globalThis.Array.isArray(arg)
    ? arg
    : Symbol.iterator in arg
    ? [...arg as any]
    : arg
  return make<any>((provider, pathPrefix) =>
    globalThis.Array.isArray(configs)
      ? Effect.mapEager(
        Effect.all(configs.map((config) => evaluateAt(config, provider, pathPrefix))),
        Result.all
      )
      : Effect.mapEager(
        Effect.all(Rec.map(configs, (config) => evaluateAt(config, provider, pathPrefix))),
        Result.all
      )
  ) as any
}

/**
 * Provides a fallback value when the config is absent.
 *
 * **When to use**
 *
 * Use when you need to make a config key optional with a sensible default.
 *
 * **Gotchas**
 *
 * Validation and source errors still propagate. For an {@link all} group, any
 * absent child causes the default to replace the entire group unless another
 * child fails. Apply defaults to individual children to preserve other values.
 *
 * A schema that successfully decodes absent input keeps its decoded value
 * instead of using the default. Schema configs first represent a missing or
 * incompatible provider shape as `undefined`; the default is used only when
 * the schema rejects that value and no relevant input was found.
 *
 * **Example** (Defaulting a missing port)
 *
 * ```ts import.meta.vitest
 * import { Config, ConfigProvider, Effect } from "effect"
 *
 * const port = Config.Number("port").pipe(Config.withDefault(3000))
 *
 * const provider = ConfigProvider.fromUnknown({})
 * Effect.runSync(port.parse(provider)) // => 3000
 * ```
 *
 * @see {@link option} – returns `Option` instead of a default value
 * @see {@link orElse} – catches all errors, not just absent input
 *
 * @category combinators
 * @since 2.0.0
 */
export const withDefault: {
  <const A2>(defaultValue: A2): <A>(self: Config<A>) => Config<A2 | A>
  <A, const A2>(self: Config<A>, defaultValue: A2): Config<A | A2>
} = dual(2, <A, const A2>(self: Config<A>, defaultValue: A2): Config<A | A2> => {
  return make<A | A2>((provider, pathPrefix) =>
    Effect.mapEager(
      evaluateAt(self, provider, pathPrefix),
      (resolution) => Result.isFailure(resolution) ? Result.succeed(defaultValue) : resolution
    )
  )
})

/**
 * Makes a config optional: returns `Some(value)` on success and `None` when the
 * config is absent.
 *
 * **When to use**
 *
 * Use when you need to handle a config key that may or may not be present.
 *
 * **Gotchas**
 *
 * Validation and source errors still propagate. For an {@link all} group, any
 * absent child produces `None` unless another child fails. Successful values
 * are always wrapped in `Some`, including `undefined` when the schema
 * explicitly accepts it. Schema configs first represent a missing or
 * incompatible provider shape as `undefined`; `None` is returned only when the
 * schema rejects that value and no relevant input was found.
 *
 * **Example** (Reading optional config)
 *
 * ```ts import.meta.vitest
 * import { Config, ConfigProvider, Effect, Option } from "effect"
 *
 * const maybePort = Config.option(Config.Number("port"))
 *
 * const provider = ConfigProvider.fromUnknown({})
 * Effect.runSync(maybePort.parse(provider)) // => Option.none()
 * ```
 *
 * @see {@link withDefault} – provide a concrete fallback value instead
 *
 * @category combinators
 * @since 2.0.0
 */
export const option = <A>(self: Config<A>): Config<Option.Option<A>> =>
  self.pipe(map(Option.some), withDefault(Option.none()))

/**
 * Extracts the successfully parsed value type from a `Config`.
 *
 * **When to use**
 *
 * Use to derive the parsed value type from an existing `Config` value when
 * declaring reusable config-driven types.
 *
 * @see {@link Config} for the config type whose parsed value is extracted
 * @see {@link Effect.Success} for extracting the success type from any `Effect`
 *
 * @category utility types
 * @since 2.5.0
 */
export type Success<T> = [T] extends [Config<infer A>] ? A : never

/**
 * Utility type that recursively replaces primitives with `Config` in a nested
 * structure.
 *
 * **When to use**
 *
 * Use when typing the input of {@link unwrap} so callers can pass either a `Config`
 *   or a record of `Config`s.
 *
 * **Details**
 *
 * `Config.Wrap<{ key: string }>` becomes `{ key: Config<string> } | Config<{ key: string }>`
 *
 * @see {@link unwrap} – construct a `Config` from a `Wrap<T>`
 *
 * @category utility types
 * @since 2.0.0
 */
export type Wrap<A> = [NonNullable<A>] extends [infer T] ? [IsPlainObject<T>] extends [true] ?
      | { readonly [K in keyof A]: Wrap<A[K]> }
      | Config<A>
  : Config<A>
  : Config<A>

type IsPlainObject<A> = [A] extends [Record<string, any>]
  ? [keyof A] extends [never] ? false : [keyof A] extends [string] ? true : false
  : false

/**
 * Constructs a `Config<T>` from a value matching `Wrap<T>`.
 *
 * **When to use**
 *
 * Use when accepting config from callers who may pass either a single `Config` or a
 *   record of individual `Config`s.
 *
 * **Details**
 *
 * If the input is already a `Config`, it is returned as-is. Otherwise, each
 * key is recursively unwrapped and combined.
 *
 * **Example** (Unwrapping a record of configs)
 *
 * ```ts import.meta.vitest
 * import { Config, ConfigProvider, Effect } from "effect"
 *
 * interface Options {
 *   key: string
 * }
 *
 * const makeConfig = (config: Config.Wrap<Options>): Config.Config<Options> =>
 *   Config.unwrap(config)
 *
 * const config = makeConfig({ key: Config.String("key") })
 * const provider = ConfigProvider.fromUnknown({ key: "value" })
 * Effect.runSync(config.parse(provider)) // => { key: "value" }
 * ```
 *
 * @see {@link Wrap} – the utility type accepted by this function
 *
 * @category converting
 * @since 2.0.0
 */
export const unwrap = <T>(wrapped: Wrap<T>): Config<T> => {
  if (isConfig(wrapped)) return wrapped
  return all(Rec.map(wrapped as Record<string, Wrap<any>>, (config) => unwrap(config))) as Config<T>
}

// -----------------------------------------------------------------------------
// schema
// -----------------------------------------------------------------------------

interface ConfigCursor {
  readonly provider: ConfigProvider.ConfigProvider
  readonly path: Path
  readonly node: ConfigProvider.Node | undefined
  readonly toString: () => string
}

const isSourceError = (u: unknown): u is ConfigProvider.SourceError => Predicate.isTagged(u, "SourceError")

const cursorToString = (): string => "<configuration>"

const loadCursor: (
  provider: ConfigProvider.ConfigProvider,
  path: Path
) => Effect.Effect<ConfigCursor> = (provider, path) =>
  provider.load(path).pipe(
    Effect.orDie,
    Effect.mapEager((node) => ({ provider, path, node, toString: cursorToString }))
  )

const loadChildCursor = (cursor: ConfigCursor, segment: string | number): Effect.Effect<ConfigCursor> =>
  loadCursor(cursor.provider, [...cursor.path, segment])

const decodeFromCursor = (
  ast: SchemaAST.AST,
  decode: (cursor: ConfigCursor) => Effect.Effect<unknown, SchemaIssue.Issue>
): SchemaAST.AST =>
  SchemaAST.decodeTo(
    SchemaAST.unknown,
    ast,
    new SchemaTransformation.Transformation(
      SchemaGetter.transformEffect((input: unknown) => decode(input as ConfigCursor)),
      SchemaGetter.passthrough()
    )
  )

const isScalarInput = (ast: SchemaAST.AST): boolean => {
  switch (ast._tag) {
    case "Union":
      return ast.types.every(isScalarInput)
    case "Objects":
    case "Arrays":
    case "Suspend":
      return false
    default:
      return true
  }
}

const hasProviderInput = (
  ast: SchemaAST.AST,
  node: ConfigProvider.Node | undefined
): boolean => {
  switch (ast._tag) {
    case "Objects":
      return node?._tag === "Record"
    case "Arrays":
      return node?._tag === "Array"
    case "Union":
      return ast.types.some((ast) => hasProviderInput(ast, node))
    case "Suspend":
      return hasProviderInput(ast.thunk(), node)
    default:
      return node?.value !== undefined
  }
}

const toConfigCursorAST = memoize((root: SchemaAST.AST): SchemaAST.AST => {
  const seen = new WeakSet<SchemaAST.AST>()
  const recur = SchemaAST.applyToSelfOrLastLinkEncoding((ast) => {
    seen.add(ast)
    switch (ast._tag) {
      case "Objects": {
        const matchesIndex = ast.indexSignatures.map((is) => SchemaParser._is(is.parameter))
        const materialize = Effect.fnUntraced(function*(cursor: ConfigCursor) {
          if (cursor.node?._tag !== "Record") {
            return undefined
          }
          const node = cursor.node
          const keys = new Set<string>()
          for (const property of ast.propertySignatures) {
            if (typeof property.name === "string") keys.add(property.name)
          }
          if (matchesIndex.length > 0) {
            for (const key of node.keys) {
              if (matchesIndex.some((matches) => matches(key))) keys.add(key)
            }
          }
          const out: Record<string, ConfigCursor> = {}
          for (const key of keys) {
            const child = yield* loadChildCursor(cursor, key)
            if (child.node !== undefined) InternalRecord.assignProperty(out, key, child)
          }
          return out
        })
        return decodeFromCursor(ast.recur(recur, (ast) => ast), materialize)
      }
      case "Arrays": {
        const materialize = Effect.fnUntraced(function*(cursor: ConfigCursor) {
          if (cursor.node?._tag !== "Array") {
            return undefined
          }
          const out: Array<ConfigCursor> = []
          for (let i = 0; i < cursor.node.length; i++) {
            out.push(yield* loadChildCursor(cursor, i))
          }
          return out
        })
        return decodeFromCursor(ast.recur(recur), materialize)
      }
      case "Union":
        for (const member of ast.types) {
          recur(member)
        }
        if (!isScalarInput(ast)) return ast.recur(recur)
        break
      case "Suspend": {
        const target = ast.thunk()
        // Force new branches so opaque encodings fail when the Config is constructed.
        if (!seen.has(target)) recur(target)
        return ast.recur(recur)
      }
      case "Declaration":
      case "Any":
        throw new globalThis.Error("Config.schema does not support opaque StringTree encodings", { cause: ast })
    }
    return decodeFromCursor(ast, (cursor) => Effect.succeed(cursor.node?.value))
  })
  return recur(root)
})

/**
 * Creates a `Config<T>` from a `Schema.Codec`.
 *
 * **When to use**
 *
 * Use when you need to read structured or schema-validated configuration.
 *
 * **Details**
 *
 * The optional `path` sets the local path segment(s) for the config lookup.
 * It is appended to the logical path prefix accumulated from outer
 * {@link nested} calls. Pass a single string for a flat key or an array for
 * nested paths.
 *
 * Convenience constructors such as `String`, `Number`, and `Boolean` delegate
 * to this API.
 *
 * The codec is converted to its canonical `StringTree` form. Its encoded shape
 * determines how provider data is loaded: scalar schemas read a co-located
 * scalar value, object schemas read declared properties and matching record
 * keys, and array schemas read indexed children. A mixed-shape union loads each
 * member according to that member's shape before applying the union's mode and
 * checks.
 *
 * At the config's lookup path, a missing node or a node that cannot provide the
 * representation required by the schema is decoded as `undefined`. Missing
 * object properties remain omitted so the schema's property semantics still
 * apply. Decoding success always wins, even when no provider input was found.
 * For example,
 * `Schema.UndefinedOr(Schema.String)` decodes to `undefined` and is not replaced
 * by {@link withDefault}. If decoding fails and no relevant representation was
 * found, the config is absent. Invalid data in a relevant representation is a
 * validation failure. Provider `SourceError`s are always failures.
 *
 * **Gotchas**
 *
 * Plain `Schema.Array` and `Schema.Record` schemas use structural provider
 * input. Use {@link Array} or {@link Record} when a flat separated string must
 * also be accepted.
 *
 * `Schema.Struct` and {@link all} describe different lookup models. An
 * existing object, even an empty one, is validated as a whole by a struct;
 * missing required fields cause a validation failure. An `all` group combines
 * independent lookups and is absent if any child is absent and none fail.
 *
 * The canonical `StringTree` encoding must expose a concrete scalar, object,
 * array, or union shape. Opaque encodings such as `Schema.Any`,
 * `Schema.Unknown`, `Schema.ObjectKeyword`, `Schema.Json`, and
 * `Schema.MutableJson` are rejected synchronously when this config is
 * constructed, including when they are nested in another schema. Suspended
 * recursive schemas remain supported when their eventual shape is concrete.
 * Declarations such as `Schema.URL` also remain supported when their canonical
 * encoding has a concrete shape. To read arbitrary JSON from one scalar value,
 * use `Schema.fromJsonString(Schema.Json)`.
 *
 * **Example** (Reading a structured config)
 *
 * ```ts import.meta.vitest
 * import { Config, ConfigProvider, Effect, Schema } from "effect"
 *
 * const DbConfig = Config.schema(
 *   Schema.Struct({
 *     host: Schema.String,
 *     port: Schema.Int
 *   }),
 *   "db"
 * )
 *
 * const provider = ConfigProvider.fromUnknown({
 *   db: { host: "localhost", port: 5432 }
 * })
 *
 * Effect.runSync(DbConfig.parse(provider)) // => { host: "localhost", port: 5432 }
 * ```
 *
 * @see {@link String} / {@link Number} / {@link Boolean} – shortcuts for
 *   single-value configs
 *
 * @category schemas
 * @since 4.0.0
 */
export function schema<T>(codec: Schema.ConstraintCodec<T, unknown>, path?: string | ConfigProvider.Path): Config<T> {
  const codecStringTree = Schema.toCodecStringTree(codec)
  const encodedAst = SchemaAST.toEncoded(codecStringTree.ast)
  const decodeCursor = SchemaParser.decodeUnknownEffect(
    Schema.make<Schema.Codec<T, ConfigCursor>>(toConfigCursorAST(codecStringTree.ast))
  )
  const localPath = typeof path === "string" ? [path] : path ?? []
  return make((provider, pathPrefix) => {
    const fullPath = [...pathPrefix, ...localPath]
    return loadCursor(provider, fullPath).pipe(
      Effect.flatMapEager((cursor) =>
        decodeCursor(cursor).pipe(
          Effect.mapEager(Result.succeed),
          Effect.catchEager((issue) => {
            const error = new ConfigError(
              new Schema.SchemaError(fullPath.length > 0 ? new SchemaIssue.Pointer(fullPath, issue) : issue)
            )
            return hasProviderInput(encodedAst, cursor.node)
              ? Effect.fail(error)
              : Effect.succeed(Result.fail(error))
          })
        )
      ),
      Effect.catchDefect((defect) => isSourceError(defect) ? Effect.fail(new ConfigError(defect)) : Effect.die(defect))
    )
  })
}

const PortSchema = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65535 }))

const LogLevelSchema = Schema.Literals(LogLevel_.values)

interface ArrayOptions {
  readonly separator?: string | undefined
}

interface RecordOptions {
  readonly separator?: string | undefined
  readonly keyValueSeparator?: string | undefined
}

const isPath = (u: unknown): u is string | Path => Predicate.isString(u) || globalThis.Array.isArray(u)

// -----------------------------------------------------------------------------
// constructors
// -----------------------------------------------------------------------------

/**
 * Creates a config that always fails with the given error.
 *
 * **When to use**
 *
 * Use when you need to re-raise a specific config error, such as inside
 * {@link orElse}.
 *
 * @category constructors
 * @since 2.0.0
 */
export function fail(err: SourceError | Schema.SchemaError): Config<never> {
  return make(() => Effect.fail(new ConfigError(err)))
}

/**
 * Creates a config that always succeeds with the given value, ignoring the
 * provider entirely.
 *
 * **When to use**
 *
 * Use when you need a hardcoded config value, such as inside {@link orElse} or
 * tests.
 *
 * **Example** (Returning a constant fallback)
 *
 * ```ts import.meta.vitest
 * import { Config, ConfigProvider, Effect } from "effect"
 *
 * const host = Config.String("HOST").pipe(
 *   Config.orElse(() => Config.succeed("localhost"))
 * )
 * const provider = ConfigProvider.fromUnknown({})
 * Effect.runSync(host.parse(provider)) // => "localhost"
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export function succeed<T>(value: T) {
  return make(() => Effect.succeed(Result.succeed(value)))
}

/**
 * Creates a config for a single string value.
 *
 * **When to use**
 *
 * Use when reading a single string env var or config key.
 *
 * **Details**
 *
 * Shortcut for `Config.schema(Schema.String, name)`.
 *
 * **Example** (Reading a string config)
 *
 * ```ts import.meta.vitest
 * import { Config, ConfigProvider, Effect } from "effect"
 *
 * const host = Config.String("HOST")
 *
 * const provider = ConfigProvider.fromUnknown({ HOST: "localhost" })
 * Effect.runSync(host.parse(provider)) // => "localhost"
 * ```
 *
 * @see {@link NonEmptyString} – rejects empty strings
 * @see {@link schema} – for more complex types
 *
 * @category constructors
 * @since 2.0.0
 */
export function String(name?: string) {
  return schema(Schema.String, name)
}

/**
 * Creates a config for a non-empty string value. Fails if the value is an
 * empty string.
 *
 * **When to use**
 *
 * Use to read a string config value that must contain at least one character.
 *
 * **Details**
 *
 * Shortcut for `Config.schema(Schema.NonEmptyString, name)`.
 *
 * @see {@link String} for allowing empty strings
 *
 * @category constructors
 * @since 3.7.0
 */
export function NonEmptyString(name?: string) {
  return schema(Schema.NonEmptyString, name)
}

/**
 * Creates a config for a numeric value (including `NaN`, `Infinity`).
 *
 * **When to use**
 *
 * Use when you need config input to accept JavaScript's full number domain,
 * including NaN and infinities, rather than reject non-finite values.
 *
 * **Details**
 *
 * Shortcut for `Config.schema(Schema.Number, name)`.
 *
 * @see {@link Finite} for rejecting `NaN` and `Infinity`
 * @see {@link Int} for accepting only integers
 *
 * @category constructors
 * @since 2.0.0
 */
export function Number(name?: string) {
  return schema(Schema.Number, name)
}

/**
 * Creates a config for a finite number (rejects `NaN` and `Infinity`).
 *
 * **When to use**
 *
 * Use to read a numeric config value that must be finite.
 *
 * **Details**
 *
 * Shortcut for `Config.schema(Schema.Finite, name)`.
 *
 * @see {@link Number} for accepting `NaN` and `Infinity`
 * @see {@link Int} for accepting only integers
 *
 * @category constructors
 * @since 4.0.0
 */
export function Finite(name?: string) {
  return schema(Schema.Finite, name)
}

/**
 * Creates a config for an integer value. Rejects floats.
 *
 * **When to use**
 *
 * Use to read a numeric config value that must be an integer.
 *
 * **Details**
 *
 * Shortcut for `Config.schema(Schema.Int, name)`.
 *
 * @see {@link Number} for accepting any number
 * @see {@link Port} for accepting only integers in `1` through `65535`
 *
 * @category constructors
 * @since 4.0.0
 */
export function Int(name?: string) {
  return schema(Schema.Int, name)
}

/**
 * Creates a config that only accepts a specific literal value.
 *
 * **When to use**
 *
 * Use to restrict a config to a single, specific literal value.
 *
 * **Details**
 *
 * Shortcut for `Config.schema(Schema.Literal(literal), name)`.
 *
 * **Example** (Restricting to a literal)
 *
 * ```ts import.meta.vitest
 * import { Config, ConfigProvider, Effect } from "effect"
 *
 * const env = Config.Literal("production", "ENV")
 * const provider = ConfigProvider.fromUnknown({ ENV: "production" })
 * Effect.runSync(env.parse(provider)) // => "production"
 * ```
 *
 * @see {@link Literals} – accepts multiple literal values
 * @category constructors
 * @since 2.0.0
 */
export function Literal<L extends SchemaAST.LiteralValue>(literal: L, name?: string) {
  return schema(Schema.Literal(literal), name)
}

/**
 * Creates a config that only accepts one of the specified literal values.
 *
 * **When to use**
 *
 * Use to restrict a config to a fixed set of allowed literal values.
 *
 * **Details**
 *
 * Shortcut for `Config.schema(Schema.Literals(literals), name)`.
 *
 * **Example** (Restricting to a set of literals)
 *
 * ```ts import.meta.vitest
 * import { Config, ConfigProvider, Effect } from "effect"
 *
 * const env = Config.Literals(["development", "production"], "ENV")
 * const provider = ConfigProvider.fromUnknown({ ENV: "development" })
 * Effect.runSync(env.parse(provider)) // => "development"
 * ```
 *
 * @see {@link Literal} for accepting one specific literal value
 *
 * @category constructors
 * @since 4.0.0
 */
export function Literals<const L extends ReadonlyArray<SchemaAST.LiteralValue>>(literals: L, name?: string) {
  return schema(Schema.Literals(literals), name)
}

/**
 * Creates a config for array values that may also be read from a separated string.
 *
 * **When to use**
 *
 * Use when you need to read either structural array input or a flat value such as
 * `"otlp,console"` from an environment variable.
 *
 * **Details**
 *
 * Pass a string or `ConfigProvider.Path` as the second argument to set the lookup
 * path. When no path is needed, pass the options object directly. The `separator`
 * defaults to `","`.
 *
 * **Example** (Reading a comma-separated array)
 *
 * ```ts import.meta.vitest
 * import { Config, ConfigProvider, Effect, Schema } from "effect"
 *
 * const config = Config.Array(Schema.String, "EXPORTERS")
 * const provider = ConfigProvider.fromEnv({ env: { EXPORTERS: "otlp,console" } })
 *
 * Effect.runSync(config.parse(provider)) // => ["otlp", "console"]
 * ```
 *
 * @see {@link Record} for key-value input from structural records or separated strings.
 * @category constructors
 * @since 4.0.0
 */
export function Array<V extends Schema.ConstraintCodec<unknown, unknown>>(
  value: V,
  options?: ArrayOptions
): Config<ReadonlyArray<V["Type"]>>
export function Array<V extends Schema.ConstraintCodec<unknown, unknown>>(
  value: V,
  path: string | Path,
  options?: ArrayOptions
): Config<ReadonlyArray<V["Type"]>>
export function Array<V extends Schema.ConstraintCodec<unknown, unknown>>(
  value: V,
  pathOrOptions?: string | Path | ArrayOptions,
  options?: ArrayOptions
) {
  const hasPath = isPath(pathOrOptions)
  const resolvedOptions = hasPath ? options : pathOrOptions
  const array = Schema.Array(value)
  const separator = resolvedOptions?.separator ?? ","
  const arrayString = Schema.String.pipe(
    Schema.decodeTo(Schema.toCodecStringTree(array), {
      decode: SchemaGetter.split(resolvedOptions),
      encode: SchemaGetter.compose(
        SchemaGetter.passthrough<ReadonlyArray<string>, Schema.StringTree>({ strict: false }),
        SchemaGetter.transform((input) => input.join(separator))
      )
    })
  )
  return schema(Schema.Union([arrayString, array]), hasPath ? pathOrOptions : undefined)
}

/**
 * Creates a config for record values that may also be read from a separated key-value string.
 *
 * **When to use**
 *
 * Use when you need to read either structural record input or a flat value such as
 * `"service.name=my-service,service.version=1.0.0"` from an environment variable.
 *
 * **Details**
 *
 * Pass a string or `ConfigProvider.Path` as the third argument to set the lookup
 * path. When no path is needed, pass the options object directly. The `separator`
 * defaults to `","` and `keyValueSeparator` defaults to `"="`.
 *
 * **Example** (Reading a comma-separated record)
 *
 * ```ts import.meta.vitest
 * import { Config, ConfigProvider, Effect, Schema } from "effect"
 *
 * const config = Config.Record(Schema.String, Schema.String, "OTEL_RESOURCE_ATTRIBUTES")
 * const provider = ConfigProvider.fromEnv({
 *   env: {
 *     OTEL_RESOURCE_ATTRIBUTES:
 *       "service.name=my-service,service.version=1.0.0,custom.attribute=value"
 *   }
 * })
 *
 * const result = Effect.runSync(config.parse(provider))
 * result["service.name"] // => "my-service"
 * result["service.version"] // => "1.0.0"
 * result["custom.attribute"] // => "value"
 * ```
 *
 * @see {@link Array} for array input from structural arrays or separated strings.
 * @category constructors
 * @since 4.0.0
 */
export function Record<
  K extends Schema.Record.Key & Schema.ConstraintCodec<unknown, unknown>,
  V extends Schema.ConstraintCodec<unknown, unknown>
>(
  key: K,
  value: V,
  options?: RecordOptions
): Config<Schema.Record.Type<K, V>>
export function Record<
  K extends Schema.Record.Key & Schema.ConstraintCodec<unknown, unknown>,
  V extends Schema.ConstraintCodec<unknown, unknown>
>(
  key: K,
  value: V,
  path: string | Path,
  options?: RecordOptions
): Config<Schema.Record.Type<K, V>>
export function Record<
  K extends Schema.Record.Key & Schema.ConstraintCodec<unknown, unknown>,
  V extends Schema.ConstraintCodec<unknown, unknown>
>(
  key: K,
  value: V,
  pathOrOptions?: string | Path | RecordOptions,
  options?: RecordOptions
) {
  const hasPath = isPath(pathOrOptions)
  const record = Schema.Record(key, value)
  const split = SchemaTransformation.splitKeyValue(hasPath ? options : pathOrOptions)
  const recordString = Schema.String.pipe(
    Schema.decodeTo(Schema.toCodecStringTree(record), {
      decode: split.decode,
      encode: SchemaGetter.compose(
        SchemaGetter.passthrough<Record<string, string>, Schema.StringTree>({ strict: false }),
        split.encode
      )
    })
  )
  return schema(Schema.Union([record, recordString]), hasPath ? pathOrOptions : undefined)
}

/**
 * Creates a config for a boolean value parsed from common string
 * representations.
 *
 * **When to use**
 *
 * Use to read boolean flags from string-like config sources.
 *
 * **Details**
 *
 * Accepted values: `true`, `false`, `yes`, `no`, `on`, `off`, `1`, `0`,
 * `y`, `n`.
 *
 * **Example** (Reading a boolean flag)
 *
 * ```ts import.meta.vitest
 * import { Config, ConfigProvider, Effect } from "effect"
 *
 * const program = Config.Boolean("FEATURE_FLAG")
 *
 * const provider = ConfigProvider.fromEnv({
 *   env: {
 *     FEATURE_FLAG: "yes"
 *   }
 * })
 *
 * Effect.runSync(
 *   program.pipe(Effect.provideService(ConfigProvider.ConfigProvider, provider))
 * ) // => true
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export function Boolean(name?: string) {
  return schema(Schema.BooleanLiterals, name)
}

/**
 * Creates a config for a `Duration` value parsed from a human-readable
 * string.
 *
 * **When to use**
 *
 * Use to read time duration settings such as timeouts, intervals, or TTLs.
 *
 * **Details**
 *
 * Shortcut for `Config.schema(Schema.DurationFromString, name)`.
 *
 * Accepts any string that `Duration.fromInput` can parse (e.g.
 * `"10 seconds"`, `"500 millis"`, `"Infinity"`, `"-Infinity"`).
 *
 * **Example** (Reading a duration)
 *
 * ```ts import.meta.vitest
 * import { Config, ConfigProvider, Duration, Effect } from "effect"
 *
 * const program = Config.Duration("DURATION").pipe(Effect.map(Duration.toMillis))
 *
 * const provider = ConfigProvider.fromEnv({
 *   env: {
 *     DURATION: "10 seconds"
 *   }
 * })
 *
 * Effect.runSync(
 *   program.pipe(Effect.provideService(ConfigProvider.ConfigProvider, provider))
 * ) // => 10000
 * ```
 *
 * @see {@link schema} for decoding configuration values with a custom codec
 *
 * @category constructors
 * @since 2.5.0
 */
export function Duration(name?: string) {
  return schema(Schema.DurationFromString, name)
}

/**
 * Creates a config for an exact, human-readable byte-size value.
 *
 * **Details**
 *
 * Decimal symbols such as `kB` use powers of 1,000, while binary symbols such
 * as `KiB` use powers of 1,024.
 *
 * @category constructors
 * @since 4.0.0
 */
export function ByteSize(name?: string) {
  return schema(Schema.ByteSize, name)
}

/**
 * Creates a config for a port number (integer in 1–65535).
 *
 * **When to use**
 *
 * Use to read network port settings that must be valid port numbers.
 *
 * **Details**
 *
 * Accepts integers from `1` through `65535`.
 *
 * **Example** (Reading a port)
 *
 * ```ts import.meta.vitest
 * import { Config, ConfigProvider, Effect } from "effect"
 *
 * const program = Config.Port("PORT")
 *
 * const provider = ConfigProvider.fromEnv({
 *   env: {
 *     PORT: "8080"
 *   }
 * })
 *
 * Effect.runSync(
 *   program.pipe(Effect.provideService(ConfigProvider.ConfigProvider, provider))
 * ) // => 8080
 * ```
 *
 * @see {@link Int} for integer config values outside the port range
 *
 * @category constructors
 * @since 3.16.0
 */
export function Port(name?: string) {
  return schema(PortSchema, name)
}

/**
 * Creates a config for a log level string.
 *
 * **When to use**
 *
 * Use to read Effect log-level settings from configuration.
 *
 * **Details**
 *
 * Accepted values: `"All"`, `"Fatal"`, `"Error"`, `"Warn"`, `"Info"`,
 * `"Debug"`, `"Trace"`, `"None"`.
 *
 * **Example** (Reading a log level)
 *
 * ```ts import.meta.vitest
 * import { Config, ConfigProvider, Effect } from "effect"
 *
 * const program = Config.LogLevel("LOG_LEVEL")
 *
 * const provider = ConfigProvider.fromEnv({
 *   env: {
 *     LOG_LEVEL: "Info"
 *   }
 * })
 *
 * Effect.runSync(
 *   program.pipe(Effect.provideService(ConfigProvider.ConfigProvider, provider))
 * ) // => "Info"
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export function LogLevel(name?: string) {
  return schema(LogLevelSchema, name)
}

/**
 * Creates a config for a redacted string value. The parsed result is wrapped
 * in a `Redacted` container that hides the value from logs and `toString`.
 *
 * **When to use**
 *
 * Use to read secret string settings that should not be exposed in logs or
 * string output.
 *
 * **Details**
 *
 * Shortcut for `Config.schema(Schema.Redacted(Schema.String), name)`.
 *
 * **Example** (Reading a secret)
 *
 * ```ts import.meta.vitest
 * import { Config, ConfigProvider, Effect } from "effect"
 *
 * const program = Config.Redacted("API_KEY").pipe(Effect.map(String))
 *
 * const provider = ConfigProvider.fromEnv({
 *   env: {
 *     API_KEY: "sk-1234567890abcdef"
 *   }
 * })
 *
 * Effect.runSync(
 *   program.pipe(Effect.provideService(ConfigProvider.ConfigProvider, provider))
 * ) // => "<redacted>"
 * ```
 *
 * @see {@link String} for non-secret string settings
 *
 * @category constructors
 * @since 2.0.0
 */
export function Redacted(name?: string) {
  return schema(Schema.Redacted(Schema.String), name)
}

/**
 * Creates a config for a `URL` value parsed from a string.
 *
 * **When to use**
 *
 * Use to read configuration values that must be valid URL strings.
 *
 * **Details**
 *
 * This is a shortcut for `Config.schema(Schema.URL, name)`.
 *
 * **Gotchas**
 *
 * Fails if the string cannot be parsed by the `URL` constructor.
 *
 * **Example** (Reading a URL)
 *
 * ```ts import.meta.vitest
 * import { Config, ConfigProvider, Effect } from "effect"
 *
 * const program = Config.URL("URL").pipe(Effect.map((url) => url.href))
 *
 * const provider = ConfigProvider.fromEnv({
 *   env: {
 *     URL: "https://example.com"
 *   }
 * })
 *
 * Effect.runSync(
 *   program.pipe(Effect.provideService(ConfigProvider.ConfigProvider, provider))
 * ) // => "https://example.com/"
 * ```
 *
 * @see {@link schema} for decoding configuration values with a custom codec
 *
 * @category constructors
 * @since 3.11.0
 */
export function URL(name?: string) {
  return schema(Schema.URL, name)
}

/**
 * Creates a config for a `Date` value parsed from a string.
 *
 * **When to use**
 *
 * Use to read date settings that must parse to valid `Date` values.
 *
 * **Details**
 *
 * Shortcut for `Config.schema(Schema.Date, name)`.
 *
 * **Gotchas**
 *
 * Fails with a `SchemaError` if the string produces an invalid `Date`.
 *
 * **Example** (Reading a date)
 *
 * ```ts import.meta.vitest
 * import { Config, ConfigProvider, Effect } from "effect"
 *
 * const createdAt = Config.Date("CREATED_AT")
 *
 * const provider = ConfigProvider.fromUnknown({ CREATED_AT: "2024-01-15" })
 * Effect.runSync(createdAt.parse(provider)).toISOString() // => "2024-01-15T00:00:00.000Z"
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export function Date(name?: string) {
  return schema(Schema.Date, name)
}

/**
 * Scopes a config under a named prefix.
 *
 * **When to use**
 *
 * Use when you need to group related config keys under a common namespace.
 *
 * **Details**
 *
 * The prefix is prepended to every key the inner config reads. With
 * `fromUnknown` this means an extra object level; with `fromEnv` it means
 * a `_`-separated prefix on env var names.
 *
 * Multiple `nested` calls compose: the outermost name becomes the
 * outermost path segment.
 *
 * **Example** (Nesting a struct config under `"database"`)
 *
 * ```ts import.meta.vitest
 * import { Config, ConfigProvider, Effect } from "effect"
 *
 * const dbConfig = Config.all({
 *   host: Config.String("host"),
 *   port: Config.Number("port")
 * }).pipe(Config.nested("database"))
 *
 * const provider = ConfigProvider.fromUnknown({
 *   database: { host: "localhost", port: "5432" }
 * })
 * Effect.runSync(dbConfig.parse(provider)) // => { host: "localhost", port: 5432 }
 * ```
 *
 * **Example** (Reading env vars with a nested prefix)
 *
 * ```ts import.meta.vitest
 * import { Config, ConfigProvider, Effect } from "effect"
 *
 * const host = Config.String("host").pipe(Config.nested("database"))
 *
 * const provider = ConfigProvider.fromEnv({
 *   env: { database_host: "localhost" }
 * })
 * Effect.runSync(host.parse(provider)) // => "localhost"
 * ```
 *
 * @see {@link all} – combine multiple configs into a struct
 * @see {@link schema} – read structured config from a schema
 *
 * @category combinators
 * @since 2.0.0
 */
export const nested: {
  (name: string): <A>(self: Config<A>) => Config<A>
  <A>(self: Config<A>, name: string): Config<A>
} = dual(
  2,
  <A>(self: Config<A>, name: string): Config<A> =>
    make((provider, pathPrefix) => evaluateAt(self, provider, [...pathPrefix, name]))
)
