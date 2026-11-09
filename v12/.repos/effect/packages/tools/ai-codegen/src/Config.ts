/**
 * Configuration schema and types for AI provider code generation.
 *
 * @since 4.0.0
 */
import * as Data from "effect/Data"
import type * as Path from "effect/Path"
import * as Schema from "effect/Schema"

/**
 * A text replacement to apply to generated code.
 *
 * @category models
 * @since 4.0.0
 */
export class Replacement extends Schema.Class<Replacement>("Replacement")({
  from: Schema.String,
  to: Schema.String
}) {}

/**
 * Configuration for AI provider code generation.
 *
 * **Example** (Decoding a codegen configuration)
 *
 * ```ts import.meta.vitest
 * import * as Config from "@effect/ai-codegen/Config"
 * import { Schema } from "effect"
 *
 * const config = Schema.decodeUnknownSync(Config.CodegenConfig)({
 *   spec: "https://example.com/openapi.json",
 *   output: "Generated.ts",
 *   name: "MyClient"
 * })
 *
 * config.spec // => "https://example.com/openapi.json"
 * ```
 *
 * @category models
 * @since 4.0.0
 */
export class CodegenConfig extends Schema.Class<CodegenConfig>("CodegenConfig")({
  spec: Schema.String,
  output: Schema.String,
  name: Schema.optional(Schema.String),
  typeOnly: Schema.optional(Schema.Boolean),
  header: Schema.optional(Schema.String),
  patches: Schema.optional(Schema.Array(Schema.String)),
  includePaths: Schema.optional(Schema.Array(Schema.String)),
  includeSchemas: Schema.optional(Schema.Array(Schema.String)),
  collapseErrorResponses: Schema.optional(Schema.Boolean),
  replacements: Schema.optional(Schema.Array(Replacement)),
  excludeAnnotations: Schema.optional(Schema.Array(Schema.String)),
  disableAdditionalProperties: Schema.optional(Schema.Boolean)
}) {
  /**
   * Get the client name, defaulting to "Client" if not specified.
   *
   * @since 4.0.0
   */
  get clientName(): string {
    return this.name ?? "Client"
  }

  /**
   * Check if type-only generation is enabled.
   *
   * @since 4.0.0
   */
  get isTypeOnly(): boolean {
    return this.typeOnly ?? false
  }

  /**
   * Get the list of patch files/strings to apply.
   *
   * @since 4.0.0
   */
  get patchList(): ReadonlyArray<string> {
    return this.patches ?? []
  }

  /**
   * Get the list of text replacements to apply.
   *
   * @since 4.0.0
   */
  get replacementList(): ReadonlyArray<Replacement> {
    return this.replacements ?? []
  }

  /**
   * Get the header content to prepend to generated files.
   *
   * @since 4.0.0
   */
  get headerContent(): string | undefined {
    return this.header
  }

  /**
   * Get the list of annotation keys to exclude from generated code.
   *
   * @since 4.0.0
   */
  get excludeAnnotationsList(): ReadonlyArray<string> | undefined {
    return this.excludeAnnotations
  }

  /**
   * Whether to close objects with declared properties and no explicit `additionalProperties`.
   *
   * @since 4.0.0
   */
  get shouldDisableAdditionalProperties(): boolean {
    return this.disableAdditionalProperties ?? false
  }
}

/**
 * Represents the source of an OpenAPI specification.
 *
 * @category models
 * @since 4.0.0
 */
export type SpecSource = SpecSource.Url | SpecSource.File

/**
 * Namespace containing the supported OpenAPI specification source variants.
 *
 * @since 4.0.0
 */
export declare namespace SpecSource {
  /**
   * A URL-based spec source.
   *
   * @category models
   * @since 4.0.0
   */
  export interface Url {
    readonly _tag: "Url"
    readonly url: string
  }

  /**
   * A file-based spec source.
   *
   * @category models
   * @since 4.0.0
   */
  export interface File {
    readonly _tag: "File"
    readonly path: string
  }
}

/**
 * Constructors and utilities for `SpecSource`.
 *
 * **Example** (Creating spec sources)
 *
 * ```ts import.meta.vitest
 * import * as Config from "@effect/ai-codegen/Config"
 *
 * // Create a URL-based source
 * const urlSource = Config.SpecSource.Url("https://example.com/openapi.json")
 *
 * // Create a file-based source
 * const fileSource = Config.SpecSource.File("/path/to/spec.json")
 *
 * urlSource._tag // => "Url"
 * fileSource._tag // => "File"
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const SpecSource = {
  /**
   * Create a URL-based spec source.
   *
   * @since 4.0.0
   */
  Url: (url: string): SpecSource => ({ _tag: "Url", url }),

  /**
   * Create a file-based spec source.
   *
   * @since 4.0.0
   */
  File: (path: string): SpecSource => ({ _tag: "File", path }),

  /**
   * Parse a spec string into a `SpecSource`.
   * URLs (http:// or https://) become `Url`, otherwise `File`.
   *
   * @since 4.0.0
   */
  fromString: (spec: string, packagePath: string, pathService: Path.Path): SpecSource => {
    if (spec.startsWith("http://") || spec.startsWith("https://")) {
      return SpecSource.Url(spec)
    }
    return SpecSource.File(pathService.join(packagePath, spec))
  }
}

/**
 * Error when parsing a codegen configuration file fails.
 *
 * **Example** (Creating a config parse error)
 *
 * ```ts import.meta.vitest
 * import * as Config from "@effect/ai-codegen/Config"
 *
 * const error = new Config.ConfigParseError({
 *   path: "/path/to/codegen.json",
 *   cause: new Error("Invalid JSON")
 * })
 *
 * error._tag // => "ConfigParseError"
 * error.path // => "/path/to/codegen.json"
 * ```
 *
 * @category errors
 * @since 4.0.0
 */
export class ConfigParseError extends Data.TaggedError("ConfigParseError")<{
  readonly path: string
  readonly cause: unknown
}> {}

/**
 * Error when a codegen configuration file is not found.
 *
 * **Example** (Creating a config not found error)
 *
 * ```ts import.meta.vitest
 * import * as Config from "@effect/ai-codegen/Config"
 *
 * const error = new Config.ConfigNotFoundError({
 *   provider: "openai",
 *   expectedPath: "/path/to/packages/ai/openai/codegen.json"
 * })
 *
 * error._tag // => "ConfigNotFoundError"
 * error.provider // => "openai"
 * ```
 *
 * @category errors
 * @since 4.0.0
 */
export class ConfigNotFoundError extends Data.TaggedError("ConfigNotFoundError")<{
  readonly provider: string
  readonly expectedPath: string
}> {}
