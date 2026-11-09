/**
 * Rollup-backed bundling and size measurement for the Effect bundle-size tools.
 *
 * This module provides the service used by the bundle CLI and reporter to turn
 * fixture or selected TypeScript entrypoints into ESM Rollup output, optionally
 * write a minified artifact, and return the gzipped byte count used in
 * bundle-size comparisons.
 *
 * Bundles are generated in memory so the emitted code can be streamed to both
 * gzip measurement and optional file output. Only Rollup `chunk` outputs are
 * included; assets are ignored, and when Rollup creates multiple chunks (for
 * example because of dynamic imports or shared chunks) their code is streamed
 * together for measurement. The optional output file is named from the
 * entrypoint stem, so it is best treated as an inspection artifact rather than
 * a complete Rollup output directory.
 *
 * @since 4.0.0
 */
import * as NodeStream from "@effect/platform-node/NodeStream"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as Stream from "effect/Stream"
import { createGzip } from "node:zlib"
import type { RollupOptions } from "rollup"
import { rollup } from "rollup"
import { createPlugins, type VisualizationOutput } from "./Plugins.ts"

/**
 * Error raised when Rollup bundling, output generation, or bundle size measurement fails.
 *
 * @category errors
 * @since 4.0.0
 */
export class RollupError extends Data.TaggedError("RollupError")<{
  readonly cause: unknown
}> {}

/**
 * Bundle size statistics for an entry file, including its path and gzipped size in bytes.
 *
 * @category models
 * @since 4.0.0
 */
export class BundleStats extends Data.TaggedClass("BundleStats")<{
  readonly path: string
  readonly sizeInBytes: number
}> {}

/**
 * Options for bundling one entry file, optionally writing a minified output and generating a visualization.
 *
 * @category options
 * @since 4.0.0
 */
export interface BundleOptions {
  readonly path: string
  readonly visualize?: boolean | undefined
  readonly outputDirectory?: string | undefined
}

/**
 * Options for bundling multiple entry files with shared visualization and output-directory settings.
 *
 * @category options
 * @since 4.0.0
 */
export interface BundleAllOptions {
  readonly paths: ReadonlyArray<string>
  readonly visualize?: boolean | undefined
  readonly outputDirectory?: string | undefined
}

/**
 * Context service for bundling entry files with Rollup and measuring their gzipped output size.
 *
 * @category services
 * @since 4.0.0
 */
export class Rollup extends Context.Service<Rollup>()(
  "@effect/bundle/Rollup",
  {
    make: Effect.gen(function*() {
      const pathService = yield* Path.Path
      const fs = yield* FileSystem.FileSystem

      const createVisualizationOutputs = (options: BundleOptions): ReadonlyArray<VisualizationOutput> => {
        if (!options.visualize || !options.outputDirectory) {
          return []
        }
        const name = pathService.parse(options.path).name
        return [
          {
            filename: pathService.join(options.outputDirectory, `${name}.treemap.html`),
            template: "treemap",
            title: `${name} bundle treemap`
          },
          {
            filename: pathService.join(options.outputDirectory, `${name}.raw-data.json`),
            template: "raw-data",
            title: `${name} bundle raw data`
          }
        ]
      }

      const getRollupOptions = (options: BundleOptions): RollupOptions => ({
        input: options.path,
        output: {
          format: "esm"
        },
        plugins: createPlugins(pathService, {
          visualize: options.visualize,
          visualizations: createVisualizationOutputs(options)
        }),
        onwarn: (warning, next) => {
          if (warning.code === "THIS_IS_UNDEFINED") return
          next(warning)
        }
      })

      const bundle = Effect.fn("Rollup.bundle")(
        function*(options: BundleOptions) {
          const bundle = yield* Effect.acquireRelease(
            Effect.tryPromise({
              try: () => rollup(getRollupOptions(options)),
              catch: (cause) => new RollupError({ cause })
            }),
            (bundle) => Effect.promise(() => bundle.close())
          )
          const { output } = yield* Effect.tryPromise({
            try: () => bundle.generate({ format: "esm" }),
            catch: (cause) => new RollupError({ cause })
          })

          const stream = yield* Stream.fromIterable(output).pipe(
            Stream.filter((output) => output.type === "chunk"),
            Stream.map((chunk) => chunk.code),
            Stream.encodeText,
            Stream.broadcast({ capacity: 8, replay: 8 })
          )

          const writeOutput = options.outputDirectory
            ? stream.pipe(
              Stream.run(fs.sink(pathService.join(
                options.outputDirectory,
                `${pathService.parse(options.path).name}.min.js`
              ))),
              Effect.mapError((cause) => new RollupError({ cause }))
            )
            : Effect.void

          const [, sizeInBytes] = yield* Effect.all([
            writeOutput,
            stream.pipe(
              NodeStream.pipeThroughDuplex({
                evaluate: () => createGzip({ level: 9 }),
                onError: (cause) => new RollupError({ cause })
              }),
              Stream.runFold(
                () => 0,
                (totalBytes, chunkBytes) => chunkBytes.length + totalBytes
              )
            )
          ], { concurrency: 2 })

          yield* Effect.log(`Bundled ${options.path}`).pipe(
            Effect.annotateLogs({ size: `${(sizeInBytes / 1000).toFixed(2)} kB` })
          )

          return new BundleStats({ path: options.path, sizeInBytes })
        },
        Effect.scoped
      )

      const bundleAll = Effect.fn("Rollup.bundleAll")(
        function*(options: BundleAllOptions) {
          return yield* Effect.forEach(
            options.paths,
            (path) => bundle({ path, visualize: options.visualize, outputDirectory: options.outputDirectory }),
            // Rollup retains a module graph for each active bundle, so unbounded
            // concurrency can exhaust the Node.js heap on CI runners.
            { concurrency: 4 }
          )
        }
      )

      return {
        bundle,
        bundleAll
      } as const
    })
  }
) {
  static readonly layer = Layer.effect(this, this.make)
}
