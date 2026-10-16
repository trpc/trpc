/**
 * Path service layers backed by the Deno Standard Library.
 *
 * **Example** (Using Deno path operations)
 *
 * ```ts import.meta.vitest
 * import { Effect, Path } from "effect"
 * import { DenoPath } from "@effect/platform-deno"
 *
 * const program = Effect.gen(function*() {
 *   const path = yield* Path.Path
 *   return path.extname("file.txt")
 * }).pipe(Effect.provide(DenoPath.layer))
 *
 * Effect.runSync(program) // => ".txt"
 * ```
 *
 * @since 4.0.0
 */

import * as DenoPath from "@std/path"
import * as DenoPathPosix from "@std/path/posix"
import * as DenoPathWin from "@std/path/windows"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as PlatformError from "effect/PlatformError"

const fileUrlOps = (impl: {
  readonly fromFileUrl: typeof DenoPath.fromFileUrl
  readonly toFileUrl: typeof DenoPath.toFileUrl
}) => ({
  fromFileUrl: (url: URL): Effect.Effect<string, PlatformError.BadArgument> =>
    Effect.try({
      try: () => impl.fromFileUrl(url),
      catch: (cause) =>
        new PlatformError.BadArgument({
          module: "Path",
          method: "fromFileUrl",
          cause
        })
    }),
  toFileUrl: (path: string): Effect.Effect<URL, PlatformError.BadArgument> =>
    Effect.try({
      try: (): URL => impl.toFileUrl(path),
      catch: (cause): PlatformError.BadArgument =>
        new PlatformError.BadArgument({
          module: "Path",
          method: "toFileUrl",
          cause
        })
    })
})

/**
 * A {@linkplain Layer.Layer | layer} that provides POSIX path operations.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerPosix: Layer.Layer<Path.Path> = Layer.succeed(Path.Path)(
  Path.Path.of({
    [Path.TypeId]: Path.TypeId,
    ...DenoPathPosix,
    sep: DenoPathPosix.SEPARATOR,
    ...fileUrlOps(DenoPathPosix)
  })
)

/**
 * A {@linkplain Layer.Layer | layer} that provides Windows path operations.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerWin32: Layer.Layer<Path.Path> = Layer.succeed(
  Path.Path
)(
  Path.Path.of({
    [Path.TypeId]: Path.TypeId,
    ...DenoPathWin,
    sep: DenoPathWin.SEPARATOR,
    ...fileUrlOps(DenoPathWin)
  })
)

/**
 * A {@linkplain Layer.Layer | layer} that provides OS-agnostic path operations.
 *
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer.Layer<Path.Path> = Layer.succeed(
  Path.Path
)(
  Path.Path.of({
    [Path.TypeId]: Path.TypeId,
    ...DenoPath,
    sep: DenoPath.SEPARATOR,
    ...fileUrlOps(DenoPath)
  })
)
