import { assert, describe, it } from "@effect/vitest"
import { ConfigProvider, Effect, Layer } from "effect"
import * as UserDirectories from "effect/persistence/UserDirectories"

const withEnv = (env: Record<string, string>) =>
  Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnv({ env }))

const resolve = (platform: string, env: Record<string, string>) => {
  const dirs = UserDirectories.make({ platform })
  return Effect.all({
    config: dirs.config("myapp"),
    data: dirs.data("myapp"),
    cache: dirs.cache("myapp"),
    state: dirs.state("myapp")
  }).pipe(withEnv(env))
}

const config = (platform: string, env: Record<string, string>) =>
  UserDirectories.make({ platform }).config("myapp").pipe(withEnv(env))

describe("UserDirectories", () => {
  it.effect("uses absolute XDG directories on every platform", () =>
    Effect.gen(function*() {
      assert.deepStrictEqual(
        yield* resolve("linux", {
          HOME: "/home/ada",
          XDG_CONFIG_HOME: "/xdg/config",
          XDG_DATA_HOME: "/xdg/data",
          XDG_CACHE_HOME: "/xdg/cache",
          XDG_STATE_HOME: "/xdg/state"
        }),
        {
          config: "/xdg/config/myapp",
          data: "/xdg/data/myapp",
          cache: "/xdg/cache/myapp",
          state: "/xdg/state/myapp"
        }
      )
      assert.strictEqual(
        yield* config("linux", { HOME: "/home/ada", XDG_CONFIG_HOME: "/custom\\" }),
        "/custom\\/myapp"
      )
      assert.strictEqual(
        yield* config("darwin", { HOME: "/Users/ada", XDG_CONFIG_HOME: "/custom" }),
        "/custom/myapp"
      )
      assert.strictEqual(
        yield* config("win32", {
          USERPROFILE: "C:\\Users\\ada",
          APPDATA: "C:\\AppData",
          XDG_CONFIG_HOME: "D:\\custom"
        }),
        "D:\\custom\\myapp"
      )
      assert.strictEqual(
        yield* UserDirectories.make({ platform: "win32" }).cache("myapp").pipe(
          withEnv({ USERPROFILE: "C:\\Users\\ada", LOCALAPPDATA: "C:\\Local", XDG_CACHE_HOME: "D:\\cache" })
        ),
        "D:\\cache\\myapp"
      )
    }))

  it.effect("falls back to the platform defaults", () =>
    Effect.gen(function*() {
      assert.deepStrictEqual(yield* resolve("linux", { HOME: "/home/ada", XDG_CONFIG_HOME: "relative" }), {
        config: "/home/ada/.config/myapp",
        data: "/home/ada/.local/share/myapp",
        cache: "/home/ada/.cache/myapp",
        state: "/home/ada/.local/state/myapp"
      })
      assert.deepStrictEqual(yield* resolve("darwin", { HOME: "/Users/ada" }), {
        config: "/Users/ada/Library/Application Support/myapp",
        data: "/Users/ada/Library/Application Support/myapp",
        cache: "/Users/ada/Library/Caches/myapp",
        state: "/Users/ada/Library/Application Support/myapp"
      })
      assert.deepStrictEqual(
        yield* resolve("win32", { USERPROFILE: "C:\\Users\\ada", APPDATA: "D:\\Roaming", LOCALAPPDATA: "D:\\Local" }),
        {
          config: "D:\\Roaming\\myapp",
          data: "D:\\Roaming\\myapp",
          cache: "D:\\Local\\myapp\\Cache",
          state: "D:\\Local\\myapp"
        }
      )
      assert.deepStrictEqual(
        yield* resolve("win32", { USERPROFILE: "C:\\Users\\ada", APPDATA: "relative", LOCALAPPDATA: "relative" }),
        {
          config: "C:\\Users\\ada\\AppData\\Roaming\\myapp",
          data: "C:\\Users\\ada\\AppData\\Roaming\\myapp",
          cache: "C:\\Users\\ada\\AppData\\Local\\myapp\\Cache",
          state: "C:\\Users\\ada\\AppData\\Local\\myapp"
        }
      )
    }))

  it.effect("resolves the home directory", () =>
    Effect.gen(function*() {
      const env = { HOME: "/home/ada", USERPROFILE: "C:\\Users\\ada" }
      assert.strictEqual(yield* UserDirectories.make({ platform: "win32" }).home.pipe(withEnv(env)), "C:\\Users\\ada")
      assert.strictEqual(yield* UserDirectories.make({ platform: "linux" }).home.pipe(withEnv(env)), "/home/ada")
    }))

  it.effect("fails with NotFound when no home directory is available", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(config("linux", {}))
      assert.strictEqual(error._tag, "PlatformError")
      assert.strictEqual(error.reason._tag, "NotFound")
      assert.strictEqual(error.reason.module, "UserDirectories")
    }))

  it.effect("fails with a PlatformError when the ConfigProvider fails", () =>
    Effect.gen(function*() {
      const error = yield* UserDirectories.make({ platform: "linux" }).config("myapp").pipe(
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          ConfigProvider.make(() => Effect.fail(new ConfigProvider.SourceError({ message: "unavailable" })))
        ),
        Effect.flip
      )
      assert.strictEqual(error._tag, "PlatformError")
      assert.strictEqual(error.reason._tag, "Unknown")
      assert.strictEqual(error.reason.module, "UserDirectories")
    }))

  it.effect("reads the environment on each call", () =>
    Effect.gen(function*() {
      const dirs = UserDirectories.make({ platform: "linux" })
      assert.strictEqual(yield* dirs.config("myapp").pipe(withEnv({ HOME: "/home/ada" })), "/home/ada/.config/myapp")
      assert.strictEqual(yield* dirs.config("myapp").pipe(withEnv({ HOME: "/home/bob" })), "/home/bob/.config/myapp")
    }))

  it.effect("is provided by a layer", () =>
    Effect.gen(function*() {
      const configDir = UserDirectories.UserDirectories.pipe(Effect.flatMap((dirs) => dirs.config("myapp")))
      assert.strictEqual(
        yield* configDir.pipe(Effect.provide(UserDirectories.layerPlatform("linux")), withEnv({ HOME: "/home/ada" })),
        "/home/ada/.config/myapp"
      )
      assert.strictEqual(
        yield* configDir.pipe(
          Effect.provide(Layer.succeed(UserDirectories.UserDirectories, {
            ...UserDirectories.make(),
            config: (appName) => Effect.succeed(`/tmp/${appName}`)
          }))
        ),
        "/tmp/myapp"
      )
    }))
})
