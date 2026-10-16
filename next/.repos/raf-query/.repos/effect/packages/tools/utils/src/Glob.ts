/**
 * Provides the glob service used by tooling commands to discover files from
 * glob patterns while keeping filesystem matching inside Effect.
 *
 * The service wraps the `glob` package and converts matching failures into
 * `GlobError` values so command implementations can compose file discovery
 * with other typed Effect workflows.
 *
 * @since 4.0.0
 */
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as GlobLib from "glob"

/**
 * Error raised when glob pattern matching fails.
 *
 * @category errors
 * @since 4.0.0
 */
export class GlobError extends Data.TaggedError("GlobError")<{
  readonly pattern: string | ReadonlyArray<string>
  readonly cause: unknown
}> {}

/**
 * Service interface for matching filesystem paths with glob patterns.
 *
 * @category services
 * @since 4.0.0
 */
export interface Glob {
  readonly glob: (
    pattern: string | ReadonlyArray<string>,
    options?: GlobLib.GlobOptions
  ) => Effect.Effect<Array<string>, GlobError>
}

/**
 * Service tag for filesystem glob pattern matching.
 *
 * @category services
 * @since 4.0.0
 */
export const Glob: Context.Service<Glob, Glob> = Context.Service("@effect/utils/Glob")

/**
 * Layer that provides the `Glob` service using the `glob` package and maps matching failures to `GlobError`.
 *
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer.Layer<Glob> = Layer.succeed(Glob, {
  glob: (pattern, options) =>
    Effect.tryPromise({
      try: () => GlobLib.glob(pattern as string | Array<string>, options ?? {}) as Promise<Array<string>>,
      catch: (cause) => new GlobError({ pattern, cause })
    })
})
