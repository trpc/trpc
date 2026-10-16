/**
 * Node-backed provider for Effect's `Path` service.
 *
 * This module turns Node's `node:path` and `node:url` APIs into `Path` layers.
 * `layer` uses the host platform path implementation, while `layerPosix` and
 * `layerWin32` provide fixed POSIX and Windows variants. All three layers also
 * include helpers for converting between file paths and file URLs.
 *
 * @since 4.0.0
 */
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { Path, TypeId } from "effect/Path"
import { BadArgument } from "effect/PlatformError"
import * as NodePath from "node:path"
import * as NodeUrl from "node:url"

const fileUrlOps = (windows: boolean | undefined) => ({
  fromFileUrl: (url: URL): Effect.Effect<string, BadArgument> =>
    Effect.try({
      try: () => NodeUrl.fileURLToPath(url, { windows }),
      catch: (cause) =>
        new BadArgument({
          module: "Path",
          method: "fromFileUrl",
          cause
        })
    }),
  toFileUrl: (path: string): Effect.Effect<URL, BadArgument> =>
    Effect.try({
      try: () => NodeUrl.pathToFileURL(path, { windows }),
      catch: (cause) =>
        new BadArgument({
          module: "Path",
          method: "toFileUrl",
          cause
        })
    })
})

/**
 * Provides the `Path` service using Node's POSIX path implementation plus
 * file URL conversion helpers.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerPosix: Layer.Layer<Path> = Layer.succeed(Path)({
  [TypeId]: TypeId,
  ...NodePath.posix,
  ...fileUrlOps(false)
})

/**
 * Provides the `Path` service using Node's Windows path implementation plus
 * file URL conversion helpers.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerWin32: Layer.Layer<Path> = Layer.succeed(Path)({
  [TypeId]: TypeId,
  ...NodePath.win32,
  ...fileUrlOps(true)
})

/**
 * Provides the default `Path` service using the host platform's Node path
 * implementation plus file URL conversion helpers.
 *
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer.Layer<Path> = Layer.succeed(Path)({
  [TypeId]: TypeId,
  ...NodePath,
  ...fileUrlOps(undefined)
})
