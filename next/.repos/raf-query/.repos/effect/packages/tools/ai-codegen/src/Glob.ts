/**
 * Glob pattern matching service.
 *
 * @since 4.0.0
 */
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as GlobLib from "glob"

/**
 * Error during glob pattern matching.
 *
 * @category errors
 * @since 4.0.0
 */
export class GlobError extends Data.TaggedError("GlobError")<{
  readonly pattern: string | ReadonlyArray<string>
  readonly cause: unknown
}> {}

/**
 * Service for glob pattern matching.
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
 * Service tag for glob pattern matching used by AI codegen tooling.
 *
 * @category services
 * @since 4.0.0
 */
export const Glob: Context.Service<Glob, Glob> = Context.Service("@effect/ai-codegen/Glob")

/**
 * Layer providing the Glob service.
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
