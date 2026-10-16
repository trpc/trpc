/**
 * Command-line entry point for generating Effect HTTP clients or HttpApi
 * definitions from an OpenAPI specification.
 *
 * The CLI reads a spec file, optionally applies JSON patches in order, selects
 * the generator layer for the requested output format, reports generation
 * warnings to stderr, and writes the generated source to stdout.
 *
 * @since 4.0.0
 */
import * as CliError from "effect/cli/CliError"
import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import type { OpenAPISpec } from "effect/http-api/OpenApi"
import type * as Schema from "effect/Schema"
import * as OpenApiGenerator from "./OpenApiGenerator.ts"
import * as OpenApiPatch from "./OpenApiPatch.ts"

const spec = Flag.FileParse("spec").pipe(
  Flag.withAlias("s"),
  Flag.withDescription("The OpenAPI spec file to generate output from")
)

const name = Flag.String("name").pipe(
  Flag.withAlias("n"),
  Flag.withDescription("The name of the generated output"),
  Flag.withDefault("Client")
)

const format = Flag.Literals("format", ["httpclient", "httpclient-type-only", "httpapi"] as const).pipe(
  Flag.withAlias("f"),
  Flag.withDescription(
    "Output format to generate: httpclient | httpclient-type-only | httpapi (default: httpclient)"
  ),
  Flag.withDefault("httpclient")
)

const patch = Flag.String("patch").pipe(
  Flag.withAlias("p"),
  Flag.withDescription(
    "JSON patch to apply to OpenAPI spec before generation. " +
      "Can be a file path (.json, .yaml, .yml) or inline JSON array. " +
      "Multiple patches are applied in order."
  ),
  Flag.between(0, Infinity)
)

const root = Command.make("openapigen", { spec, format, name, patch }).pipe(
  Command.withHandler(Effect.fnUntraced(function*({ name, spec, format, patch }) {
    let patchedSpec: Schema.Json = spec as Schema.Json

    if (patch.length > 0) {
      const parsedPatches = yield* Effect.forEach(
        patch,
        (input) =>
          OpenApiPatch.parsePatchInput(input).pipe(
            Effect.map((p) => ({ source: input, patch: p })),
            Effect.mapError((error) => new CliError.UserError({ cause: error }))
          )
      )
      patchedSpec = yield* OpenApiPatch.applyPatches(parsedPatches, patchedSpec).pipe(
        Effect.mapError((error) => new CliError.UserError({ cause: error }))
      )
    }

    const generator = yield* OpenApiGenerator.OpenApiGenerator
    const warnings: Array<OpenApiGenerator.OpenApiGeneratorWarning> = []
    const source = yield* generator.generate(patchedSpec as unknown as OpenAPISpec, {
      name,
      format,
      onWarning: (warning) => {
        warnings.push(warning)
      }
    })
    yield* Effect.forEach(
      warnings,
      (warning) => Console.error(formatWarning(warning)),
      { discard: true }
    )
    return yield* Console.log(source)
  })),
  Command.provide(({ format }) =>
    format === "httpclient-type-only"
      ? OpenApiGenerator.layerTransformerTs
      : OpenApiGenerator.layerTransformerSchema
  )
)

/**
 * Runs the OpenAPI generator command-line program.
 *
 * **Details**
 *
 * The command reads an OpenAPI specification, optionally applies JSON patches,
 * generates source code in the selected format, writes any generation warnings
 * to stderr, and prints the generated source to stdout.
 *
 * @category running
 * @since 4.0.0
 */
export const run: Effect.Effect<void, CliError.CliError, Command.Environment> = Command.run(root, {
  version: "0.0.0"
})

const formatWarning = (warning: OpenApiGenerator.OpenApiGeneratorWarning): string => {
  const context = [
    warning.method?.toUpperCase(),
    warning.path,
    warning.operationId ? `(${warning.operationId})` : undefined
  ].filter((value): value is string => value !== undefined)
  return context.length > 0
    ? `WARNING [${warning.code}] ${context.join(" ")}: ${warning.message}`
    : `WARNING [${warning.code}] ${warning.message}`
}
