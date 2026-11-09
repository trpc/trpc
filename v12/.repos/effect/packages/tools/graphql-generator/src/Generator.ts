/**
 * Generates typed GraphQL modules and diagnostics without writing to disk.
 * The CLI uses {@link generate} to write, check or watch the output.
 *
 * @since 4.0.0
 */
import type * as Effect from "effect/Effect"
import type * as FileSystem from "effect/FileSystem"
import type * as Path from "effect/Path"
import type { PlatformError } from "effect/PlatformError"
import type { Config } from "./Config.ts"
import * as Generate from "./internal/Generate.ts"

/**
 * A generated file: an absolute path and the full contents to write there.
 *
 * @stability experimental
 * @category models
 * @since 4.0.0
 */
export interface GeneratedFile {
  readonly path: string
  readonly contents: string
}

/**
 * A problem found while generating.
 *
 * - `path` is relative to the `cwd` passed to {@link generate}, with `/`
 *   separators.
 * - `line` and `column` are 1-based. They, and `codeFrame`, are `undefined`
 *   for diagnostics about the run as a whole, such as the unmapped-scalars
 *   warning, which is reported against the schema file.
 * - Any `"error"` means the output must not be written. Warnings don't stop
 *   generation.
 *
 * @stability experimental
 * @category models
 * @since 4.0.0
 */
export interface Diagnostic {
  readonly severity: "error" | "warning"
  readonly path: string
  readonly line: number | undefined
  readonly column: number | undefined
  readonly message: string
  readonly codeFrame: string | undefined
}

/**
 * The result of {@link generate}. `files` and `deletes` are empty when
 * `diagnostics` holds an error.
 *
 * `deletes` lists stale `*.graphql.ts` and `*.gql.ts` files by absolute path.
 * A file qualifies only under a `documents` glob root, with a generator
 * header naming a missing sibling source, and when absent from `files`.
 * Shared modules and files without a matching document header are excluded.
 *
 * @stability experimental
 * @category models
 * @since 4.0.0
 */
export interface GenerateResult {
  readonly files: ReadonlyArray<GeneratedFile>
  readonly deletes: ReadonlyArray<string>
  readonly diagnostics: ReadonlyArray<Diagnostic>
}

/**
 * The config cannot be used with this schema, e.g. a `scalars` key that
 * isn't a custom scalar or a built-in `Int`, `Float` or `ID`, or an absolute
 * `documents` pattern.
 *
 * @stability experimental
 * @category errors
 * @since 4.0.0
 */
export { ConfigError } from "./internal/Generate.ts"

/**
 * Generates the `.graphql.ts` module for every document file and the shared
 * module, in memory.
 *
 * **Details**
 *
 * - Relative paths in the config, and the `documents` globs, resolve against
 *   `options.cwd`, which is normally the config file's directory.
 * - `foo.graphql` generates `foo.graphql.ts` next to it, and `foo.gql`
 *   generates `foo.gql.ts`.
 * - The shared module goes to `config.shared`, or next to the schema as
 *   `<schema name>.graphql.ts`, and holds only the scalars, enums, input
 *   objects and possible `__typename` unions the operations reach. A `shared`
 *   path equal to the schema, a document or a document's output is an error
 *   diagnostic.
 * - Entries under a glob root that can't be read, such as dangling symlinks,
 *   are skipped.
 * - Custom scalars named `DateTime` and `URI` default to
 *   `Schema.DateTimeUtcFromString` and `Schema.String`. Configured `scalars`
 *   override these defaults. Other unmapped custom scalars decode as
 *   `Schema.Json`, and one warning lists every one the operations reach.
 * - A selection on an interface or union decodes as a `Schema.Union`
 *   discriminated by `__typename`, which is added to the document. Types the
 *   selection doesn't name, including ones the server adds later, fall into
 *   a last member built with `GraphQL.otherTypename`.
 * - `@skip` / `@include` with a variable condition make the fields they cover
 *   optional keys; literal conditions are folded.
 * - Input objects on a cycle, such as filters with `and` / `or`, are
 *   `Schema.Codec` consts annotated with written-out Type and Encoded
 *   interfaces, and reference the cycle through `Schema.suspend`.
 *
 * @stability experimental
 * @category generation
 * @since 4.0.0
 */
export const generate: (
  config: Config,
  options: { readonly cwd: string }
) => Effect.Effect<GenerateResult, Generate.ConfigError | PlatformError, FileSystem.FileSystem | Path.Path> = (
  config,
  options
) => Generate.generate(config, { cwd: options.cwd })
