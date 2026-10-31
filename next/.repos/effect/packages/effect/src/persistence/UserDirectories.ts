/**
 * Well-known directories for an application's persisted data.
 *
 * `UserDirectories` resolves where an application should keep its
 * configuration, data, cache and state, following the conventions of the host
 * platform. The resolved directories are what `KeyValueStore.layerFileSystem`
 * expects.
 *
 * **Example** (Backing a key-value store with the config directory)
 *
 * ```ts import.meta.vitest
 * import { Effect, Layer } from "effect"
 * import { KeyValueStore, UserDirectories } from "effect/persistence"
 *
 * const StoreLive = Layer.unwrap(
 *   Effect.gen(function*() {
 *     const dirs = yield* UserDirectories.UserDirectories
 *     return KeyValueStore.layerFileSystem(yield* dirs.config("myapp"))
 *   })
 * ).pipe(Layer.provide(UserDirectories.layer))
 * ```
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Config from "../Config.ts"
import * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import * as Layer from "../Layer.ts"
import * as PlatformError from "../PlatformError.ts"

/**
 * Identifies a `UserDirectories` service.
 *
 * @stability unstable
 * @category type ids
 * @since 4.0.0
 */
export const TypeId: TypeId = "~effect/persistence/UserDirectories"

/**
 * Type of the `UserDirectories` type id.
 *
 * @stability unstable
 * @category type ids
 * @since 4.0.0
 */
export type TypeId = "~effect/persistence/UserDirectories"

/**
 * Resolves the directories where an application keeps its files.
 *
 * **Details**
 *
 * An absolute `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME` or
 * `XDG_STATE_HOME` is used on every platform, with the application name
 * appended. A relative one is ignored. Otherwise the native location is used:
 *
 * | kind   | Windows                                | macOS                          | other            |
 * | ------ | -------------------------------------- | ------------------------------ | ---------------- |
 * | config | `%APPDATA%`                            | `~/Library/Application Support` | `~/.config`      |
 * | data   | `%APPDATA%`                            | `~/Library/Application Support` | `~/.local/share` |
 * | cache  | `%LOCALAPPDATA%`, then `\Cache` suffix | `~/Library/Caches`             | `~/.cache`       |
 * | state  | `%LOCALAPPDATA%`                       | `~/Library/Application Support` | `~/.local/state` |
 *
 * `APPDATA` and `LOCALAPPDATA` are used when absolute and otherwise replaced
 * by `%USERPROFILE%\AppData\Roaming` and `%USERPROFILE%\AppData\Local`.
 *
 * **Gotchas**
 *
 * `config` and `data` resolve to the same directory on Windows and macOS, and
 * `state` joins them on macOS. That is the native convention. Keep each kind
 * in its own subdirectory when the same application uses more than one, since
 * `KeyValueStore.layerFileSystem` clears a directory recursively.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface UserDirectories {
  readonly [TypeId]: TypeId
  /**
   * The current user's home directory.
   */
  readonly home: Effect.Effect<string, PlatformError.PlatformError>
  /**
   * Where `appName` keeps its settings.
   */
  readonly config: (appName: string) => Effect.Effect<string, PlatformError.PlatformError>
  /**
   * Where `appName` keeps data it cannot regenerate.
   */
  readonly data: (appName: string) => Effect.Effect<string, PlatformError.PlatformError>
  /**
   * Where `appName` keeps data it can regenerate.
   */
  readonly cache: (appName: string) => Effect.Effect<string, PlatformError.PlatformError>
  /**
   * Where `appName` keeps logs, history and other state that is not user data.
   */
  readonly state: (appName: string) => Effect.Effect<string, PlatformError.PlatformError>
}

/**
 * Service tag for the user directory resolver.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const UserDirectories: Context.Service<UserDirectories, UserDirectories> = Context.Service<UserDirectories>(
  TypeId
)

type Kind = "config" | "data" | "cache" | "state"

type Environment = {
  readonly home: string | undefined
  readonly xdg: string | undefined
  readonly appData: string | undefined
}

const isAbsolute = (platform: string, path: string): boolean =>
  platform === "win32" ? /^([a-zA-Z]:)?[\\/]/.test(path) : path.startsWith("/")

const join = (platform: string, base: string, ...segments: ReadonlyArray<string>): string =>
  platform === "win32"
    ? [base.replace(/[\\/]+$/, ""), ...segments].join("\\")
    : [base.replace(/\/+$/, ""), ...segments].join("/")

const xdgVariable: Record<Kind, string> = {
  config: "XDG_CONFIG_HOME",
  data: "XDG_DATA_HOME",
  cache: "XDG_CACHE_HOME",
  state: "XDG_STATE_HOME"
}

const windowsBase = (kind: Kind, env: Environment): string | undefined => {
  if (env.appData !== undefined && isAbsolute("win32", env.appData)) {
    return env.appData
  }
  if (env.home === undefined) {
    return undefined
  }
  return join("win32", env.home, "AppData", kind === "config" || kind === "data" ? "Roaming" : "Local")
}

const posixBase = (platform: string, kind: Kind, home: string): string => {
  if (platform === "darwin") {
    return join(platform, home, "Library", kind === "cache" ? "Caches" : "Application Support")
  }
  switch (kind) {
    case "config":
      return join(platform, home, ".config")
    case "data":
      return join(platform, home, ".local", "share")
    case "cache":
      return join(platform, home, ".cache")
    case "state":
      return join(platform, home, ".local", "state")
  }
}

const resolve = (platform: string, kind: Kind, appName: string, env: Environment): string | undefined => {
  if (env.xdg !== undefined && isAbsolute(platform, env.xdg)) {
    return join(platform, env.xdg, appName)
  }
  if (platform === "win32") {
    const base = windowsBase(kind, env)
    if (base === undefined) {
      return undefined
    }
    return kind === "cache" ? join(platform, base, appName, "Cache") : join(platform, base, appName)
  }
  if (env.home === undefined) {
    return undefined
  }
  return join(platform, posixBase(platform, kind, env.home), appName)
}

/**
 * Creates a resolver that reads the environment from the current
 * `ConfigProvider` on every call, using the conventions of `platform`, which
 * defaults to the host platform.
 *
 * **Example** (Resolving for another platform)
 *
 * ```ts import.meta.vitest
 * import { ConfigProvider, Effect } from "effect"
 * import { UserDirectories } from "effect/persistence"
 *
 * const dirs = UserDirectories.make({ platform: "darwin" })
 *
 * const program = dirs.cache("myapp").pipe(
 *   Effect.provideService(
 *     ConfigProvider.ConfigProvider,
 *     ConfigProvider.fromEnv({ env: { HOME: "/Users/ada" } })
 *   )
 * )
 *
 * await Effect.runPromise(program) // => "/Users/ada/Library/Caches/myapp"
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = (options?: {
  readonly platform?: string | undefined
}): UserDirectories => {
  const platform = options?.platform ?? (globalThis as any).process?.platform ?? "linux"
  const homeVariable = platform === "win32" ? "USERPROFILE" : "HOME"
  const optionalString = (name: string) => Config.String(name).pipe(Config.withDefault(undefined))
  const read = <A>(method: string, config: Config.Config<A>): Effect.Effect<A, PlatformError.PlatformError> =>
    Effect.mapError(config, (cause) =>
      PlatformError.systemError({
        _tag: "Unknown",
        module: "UserDirectories",
        method,
        description: "Failed to read the environment",
        cause
      }))
  const notFound = (method: string) =>
    PlatformError.systemError({
      _tag: "NotFound",
      module: "UserDirectories",
      method,
      description: `${homeVariable} is not set`
    })
  const directory = (kind: Kind) => {
    const environment = Config.all({
      home: optionalString(homeVariable),
      xdg: optionalString(xdgVariable[kind]),
      appData: optionalString(kind === "config" || kind === "data" ? "APPDATA" : "LOCALAPPDATA")
    })
    return (appName: string) =>
      Effect.flatMap(read(kind, environment), (env) => {
        const resolved = resolve(platform, kind, appName, env)
        return resolved === undefined ? Effect.fail(notFound(kind)) : Effect.succeed(resolved)
      })
  }
  return {
    [TypeId]: TypeId,
    home: Effect.flatMap(
      read("home", optionalString(homeVariable)),
      (home) => home === undefined ? Effect.fail(notFound("home")) : Effect.succeed(home)
    ),
    config: directory("config"),
    data: directory("data"),
    cache: directory("cache"),
    state: directory("state")
  }
}

/**
 * Layer that resolves directories for the host platform.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer.Layer<UserDirectories> = Layer.sync(UserDirectories, () => make())

/**
 * Layer that resolves directories for the given platform, such as `"win32"`,
 * `"darwin"` or `"linux"`.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerPlatform = (platform: string): Layer.Layer<UserDirectories> =>
  Layer.sync(UserDirectories, () => make({ platform }))
