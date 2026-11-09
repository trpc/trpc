/**
 * Defines the `codegen` CLI command for regenerating annotated barrel files in
 * the utilities package. The command wires together the code generation and
 * globbing services, resolves the requested working directory, discovers
 * `@barrel` annotations, and rewrites matching barrel exports.
 *
 * @since 4.0.0
 */
import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as Codegen from "../Codegen.ts"
import * as Glob from "../Glob.ts"

const CodegenLayer = Layer.provideMerge(Codegen.layer, Glob.layer)

/**
 * CLI command that regenerates annotated barrel files.
 *
 * **Details**
 *
 * The command scans `cwd` for files matching `pattern`, finds `@barrel`
 * annotations, and rewrites each annotated barrel with generated exports from
 * matching modules.
 *
 * @category commands
 * @since 4.0.0
 */
export const codegen = Command.make("codegen", {
  cwd: Flag.Directory("cwd", { mustExist: true }).pipe(Flag.withDefault(".")),
  pattern: Flag.String("pattern").pipe(Flag.withDefault("src/**/index.ts"))
}, (config) =>
  Effect.gen(function*() {
    const path = yield* Path.Path
    const generator = yield* Codegen.BarrelGenerator
    const files = yield* generator.discoverFiles(config.pattern, path.resolve(config.cwd))

    yield* Effect.forEach(files, (file) => generator.processFile(file), {
      concurrency: "unbounded",
      discard: true
    })
  })).pipe(Command.provide(CodegenLayer))
