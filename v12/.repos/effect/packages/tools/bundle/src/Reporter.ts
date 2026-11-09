/**
 * Bundle report generation for the Effect bundle-size tooling.
 *
 * The reporter coordinates fixture discovery with the Rollup service to turn
 * measured fixture bundles into Markdown tables or visualization output. It is
 * used by the bundle CLI to compare the current workspace against a checked-out
 * base directory, to print a one-off report for selected entry files, and to
 * generate visualizations when a size change needs inspection.
 *
 * Reports compare files by basename and display gzipped Rollup output sizes in
 * decimal kilobytes. Base fixtures are bundled only when the matching file
 * exists; if a current fixture has no matching basename in the base directory it
 * is reported as unchanged. Visualization artifacts are named from entry file
 * stems in the requested output directory, so duplicate names can make the
 * output misleading.
 *
 * @since 4.0.0
 */
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import { constFalse } from "effect/Function"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import { fileURLToPath } from "node:url"
import { Fixtures } from "./Fixtures.ts"
import type { BundleStats } from "./Rollup.ts"
import { Rollup } from "./Rollup.ts"

/**
 * Error raised when generating a bundle size report or visualization fails.
 *
 * @category errors
 * @since 4.0.0
 */
export class ReporterError extends Data.TaggedError("ReporterError")<{
  readonly cause: unknown
}> {}

/**
 * Options for generating a bundle size comparison report against fixture files from a base directory.
 *
 * @category options
 * @since 4.0.0
 */
export interface ReportOptions {
  readonly baseDirectory: string
}

/**
 * Options for generating bundle visualizations for selected entry files into an output directory.
 *
 * @category options
 * @since 4.0.0
 */
export interface VisualizeOptions {
  readonly paths: ReadonlyArray<string>
  readonly outputDirectory: string
}

/**
 * Options for generating a bundle size report for an explicit list of entry files.
 *
 * @category options
 * @since 4.0.0
 */
export interface ReportSelectedOptions {
  readonly paths: ReadonlyArray<string>
}

/**
 * Options for generating a bundle size comparison report for explicit entry files against a base checkout.
 *
 * @category options
 * @since 4.0.0
 */
export interface ReportSelectedComparisonOptions {
  readonly baseDirectory: string
  readonly paths: ReadonlyArray<string>
}

/**
 * Context service for producing bundle size reports and visualizations from Rollup-generated fixture stats.
 *
 * @category services
 * @since 4.0.0
 */
export class Reporter extends Context.Service<Reporter>()(
  "@effect/bundle/Reporter",
  {
    make: Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const { fixtures, fixturesDir } = yield* Fixtures
      const rollup = yield* Rollup
      const currentDirectory = path.resolve(fileURLToPath(new URL("../../../../", import.meta.url)))

      const calculateDifference = (current: BundleStats, previous: BundleStats) => {
        const currSize = current.sizeInBytes
        const prevSize = previous.sizeInBytes
        const diff = currSize - prevSize
        const diffPct = prevSize === 0 ? 0 : (Math.abs(diff) / prevSize) * 100
        const currKb = (currSize / 1000).toFixed(2)
        const prevKb = (prevSize / 1000).toFixed(2)
        const diffKb = (Math.abs(diff) / 1000).toFixed(2)
        const filename = path.basename(current.path)
        return {
          diff,
          diffPct,
          currKb,
          prevKb,
          diffKb,
          filename
        }
      }

      const createComparisonReport = (
        entries: ReadonlyArray<{
          readonly current: BundleStats
          readonly previous: BundleStats
          readonly filename: string
        }>
      ): string => {
        const lines: Array<string> = [
          "| File Name | Current Size | Previous Size | Difference |",
          "|:----------|:------------:|:-------------:|:----------:|"
        ]
        for (const { current, previous, filename } of entries) {
          const comparison = calculateDifference(current, previous)
          const currKb = `${comparison.currKb} KB`
          const prevKb = `${comparison.prevKb} KB`
          const diffKb = `${comparison.diffKb} KB`
          const diffPct = `${comparison.diffPct.toFixed(2)}%`
          const sign = comparison.diff === 0 ? "" : comparison.diff > 0 ? "+" : "-"
          const line = `| \`${filename}\` | ${currKb} | ${prevKb} | ${sign}${diffKb} (${sign}${diffPct}) |`
          lines.push(line)
        }
        return lines.join("\n") + "\n"
      }

      const createReport = (curr: ReadonlyArray<BundleStats>, prev: ReadonlyArray<BundleStats>): string => {
        const entries: Array<{
          readonly current: BundleStats
          readonly previous: BundleStats
          readonly filename: string
        }> = []
        for (const current of curr) {
          const previous = prev.find((previous) => {
            return path.basename(previous.path) === path.basename(current.path)
          }) ?? current
          entries.push({
            current,
            previous,
            filename: path.basename(current.path)
          })
        }
        return createComparisonReport(entries)
      }

      const createSelectedReport = (stats: ReadonlyArray<BundleStats>): string => {
        const lines: Array<string> = [
          "| File Name | Current Size |",
          "|:----------|:------------:|"
        ]

        for (const current of stats) {
          const filename = `\`${path.basename(current.path)}\``
          const currKb = `${(current.sizeInBytes / 1000).toFixed(2)} KB`
          const line = `| ${filename} | ${currKb} |`
          lines.push(line)
        }

        return lines.join("\n") + "\n"
      }

      const createVisualizationReport = (paths: ReadonlyArray<string>, outputDirectory: string): string => {
        const lines: Array<string> = [
          "| File Name | Generated Bundle | Treemap | Raw Data |",
          "|:----------|:----------------|:--------|:---------|"
        ]
        for (const entryPath of paths) {
          const name = path.parse(entryPath).name
          const filename = path.relative(currentDirectory, path.resolve(entryPath))
          const minified = path.join(outputDirectory, `${name}.min.js`)
          const treemap = path.join(outputDirectory, `${name}.treemap.html`)
          const rawData = path.join(outputDirectory, `${name}.raw-data.json`)
          lines.push(`| \`${filename}\` | \`${minified}\` | \`${treemap}\` | \`${rawData}\` |`)
        }
        return lines.join("\n") + "\n"
      }

      const report = Effect.fn("Reporter.report")(
        function*(options: ReportOptions) {
          yield* Effect.logInfo(`Found ${fixtures.length} files to bundle`)

          const currentPaths = fixtures.map((fixture) => path.join(fixturesDir, fixture))
          const previousPaths = yield* Effect.filter(
            fixtures.map((fixture) => path.join(options.baseDirectory, fixture)),
            (previousPath) => fs.exists(previousPath).pipe(Effect.orElseSucceed(constFalse)),
            { concurrency: fixtures.length }
          )

          const currentStats = yield* rollup.bundleAll({ paths: currentPaths })
          const previousStats = yield* rollup.bundleAll({ paths: previousPaths })

          yield* Effect.logInfo("Bundling complete! Generating bundle size report...")

          return createReport(currentStats, previousStats)
        }
      )

      const visualize = Effect.fn("Reporter.visualize")(
        function*(options: VisualizeOptions) {
          yield* fs.makeDirectory(options.outputDirectory, { recursive: true })
          yield* rollup.bundleAll({
            paths: options.paths,
            outputDirectory: options.outputDirectory,
            visualize: true
          })
          return createVisualizationReport(options.paths, options.outputDirectory)
        }
      )

      const reportSelected = Effect.fn("Reporter.reportSelected")(
        function*(options: ReportSelectedOptions) {
          yield* Effect.logInfo(`Found ${options.paths.length} files to bundle`)
          const stats = yield* rollup.bundleAll({ paths: options.paths })
          yield* Effect.logInfo("Bundling complete! Generating bundle size report...")
          return createSelectedReport(stats)
        }
      )

      const reportSelectedComparison = Effect.fn("Reporter.reportSelectedComparison")(
        function*(options: ReportSelectedComparisonOptions) {
          yield* Effect.logInfo(`Found ${options.paths.length} files to compare`)
          const baseDirectory = path.resolve(options.baseDirectory)
          const currentPaths = options.paths.map((currentPath) => path.resolve(currentPath))
          const previousPaths = yield* Effect.forEach(
            currentPaths,
            Effect.fnUntraced(function*(currentPath) {
              const relativePath = path.relative(currentDirectory, currentPath)
              if (relativePath === "" || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
                return yield* Effect.fail(
                  new ReporterError({
                    cause: `Selected bundle entry must be inside ${currentDirectory}: ${currentPath}`
                  })
                )
              }
              const previousPath = path.join(baseDirectory, relativePath)
              yield* fs.makeDirectory(path.dirname(previousPath), { recursive: true })
              yield* fs.copy(currentPath, previousPath, { overwrite: true })
              return previousPath
            }),
            { concurrency: currentPaths.length }
          )

          const currentStats = yield* rollup.bundleAll({ paths: currentPaths })
          const previousStats = yield* rollup.bundleAll({ paths: previousPaths })

          const entries: Array<{
            readonly current: BundleStats
            readonly previous: BundleStats
            readonly filename: string
          }> = []
          for (let i = 0; i < currentStats.length; i++) {
            entries.push({
              current: currentStats[i]!,
              previous: previousStats[i]!,
              filename: path.relative(currentDirectory, currentStats[i]!.path)
            })
          }
          yield* Effect.logInfo("Bundling complete! Generating bundle size report...")
          return createComparisonReport(entries)
        }
      )

      return {
        report,
        reportSelectedComparison,
        reportSelected,
        visualize
      } as const
    })
  }
) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(Fixtures.layer),
    Layer.provide(Rollup.layer)
  )
}
