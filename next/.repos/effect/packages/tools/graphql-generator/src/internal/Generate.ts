/**
 * The body of `Generator.generate`, plus the parsed-input cache watch mode
 * passes to it.
 *
 * @internal
 */
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import type { PlatformError } from "effect/PlatformError"
import * as Result from "effect/Result"
import type { Config } from "../Config.ts"
import type { Diagnostic, GenerateResult } from "../Generator.ts"
import type * as Ast from "./Ast.ts"
import { type Diagnostic as InternalDiagnostic, make, type Source } from "./Diagnostic.ts"
import * as Emitter from "./Emitter.ts"
import * as Glob from "./Glob.ts"
import * as IntrospectionReader from "./IntrospectionReader.ts"
import { parse } from "./Parser.ts"
import type * as SchemaModel from "./SchemaModel.ts"
import * as SdlReader from "./SdlReader.ts"
import * as Validate from "./Validate.ts"

/**
 * Parsed inputs that {@link generate} reuses across calls in watch mode. The
 * schema and each document are parsed again only when their path or contents
 * change; files are still read on every call.
 */
export interface Cache {
  schema: {
    readonly source: Source
    readonly result: Result.Result<SchemaModel.Schema, InternalDiagnostic>
  } | undefined
  documents: Map<string, ParsedDocument>
}

interface ParsedDocument {
  readonly source: Source
  readonly file: Emitter.DocumentFile | undefined
  readonly diagnostics: ReadonlyArray<InternalDiagnostic>
}

export const makeCache = (): Cache => ({ schema: undefined, documents: new Map() })

const sameSource = (a: Source, b: Source): boolean => a.path === b.path && a.body === b.body

export class ConfigError extends Data.TaggedError("ConfigError")<{
  readonly message: string
}> {}

export const generate: (
  config: Config,
  options: { readonly cwd: string; readonly cache?: Cache | undefined }
) => Effect.Effect<GenerateResult, ConfigError | PlatformError, FileSystem.FileSystem | Path.Path> = Effect.fnUntraced(
  function*(config, options) {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const cwd = path.resolve(options.cwd)
    const display = (absolute: string): string => path.relative(cwd, absolute).split(path.sep).join("/")
    const importExtension = config.importExtension ?? ".ts"
    const failed = (diagnostics: ReadonlyArray<Diagnostic>): GenerateResult => ({ files: [], deletes: [], diagnostics })
    const cache = options.cache ?? makeCache()

    // Schema
    const schemaPath = path.resolve(cwd, config.schema)
    const schemaSource: Source = { path: display(schemaPath), body: yield* fs.readFileString(schemaPath) }
    if (cache.schema === undefined || !sameSource(cache.schema.source, schemaSource)) {
      cache.schema = { source: schemaSource, result: readSchema(schemaSource) }
    }
    const schemaResult = cache.schema.result
    if (Result.isFailure(schemaResult)) return failed([toPublic(schemaResult.failure)])
    const schema = schemaResult.success

    // Output locations and scalar mappings
    const sharedPath = config.shared === undefined
      ? schemaPath.replace(/\.(?:graphql|gql|json)$/, "") + ".graphql.ts"
      : path.resolve(cwd, config.shared)
    // A `.ts`, `.js` or missing extension becomes `importExtension`; any other extension is kept.
    const importSpecifier = (from: string, to: string): string => {
      const relative = path.relative(path.dirname(from), to).split(path.sep).join("/")
      const specifier = relative.startsWith(".") ? relative : `./${relative}`
      const extension = path.extname(specifier)
      return extension === "" || extension === ".ts" || extension === ".js"
        ? specifier.slice(0, specifier.length - extension.length) + importExtension
        : specifier
    }
    const scalars = yield* resolveScalars(
      config,
      schema,
      (module) =>
        module.startsWith("./") || module.startsWith("../") || path.isAbsolute(module)
          ? importSpecifier(sharedPath, path.resolve(cwd, module))
          : module
    )

    // Documents
    const entries = yield* listFiles(fs, path, cwd, config.documents)
    const documentPaths = uniqueSorted(
      entries.filter((entry) => entry.glob.matches(entry.relative) && entry.absolute !== schemaPath)
    )
    const files: Array<Emitter.DocumentFile> = []
    const diagnostics: Array<InternalDiagnostic> = []
    const documents = new Map<string, ParsedDocument>()
    for (const documentPath of documentPaths) {
      const source: Source = { path: display(documentPath), body: yield* fs.readFileString(documentPath) }
      const cached = cache.documents.get(documentPath)
      const parsed = cached !== undefined && sameSource(cached.source, source)
        ? cached
        : parseDocument(path, documentPath, source)
      documents.set(documentPath, parsed)
      diagnostics.push(...parsed.diagnostics)
      if (parsed.file !== undefined) files.push(parsed.file)
    }
    cache.documents = documents
    if (diagnostics.length > 0) return failed(diagnostics.map(toPublic))
    const sharedClash = (source: Source, what: string): GenerateResult =>
      failed([toPublic(make(
        source,
        0,
        `The shared module path "${display(sharedPath)}" is also ${what}; choose a different shared path.`
      ))])
    const overwritten = sharedPath === schemaPath ? schemaSource : documents.get(sharedPath)?.source
    if (overwritten !== undefined) return sharedClash(overwritten, "an input file")
    const collision = files.find((file) => file.outputPath === sharedPath)
    if (collision !== undefined) return sharedClash(collision.source, "a document output")
    const validation = Validate.validate(schema, files)
    if (validation.length > 0) return failed(validation.map(toPublic))

    // Emit
    const output = Emitter.emit({
      schema,
      files,
      sharedPath,
      scalars,
      importSpecifier
    })
    if (output.errors.length > 0) return failed(output.errors.map(toPublic))
    // Only document headers name a source; shared modules are never stale outputs.
    const outputs = new Set(output.files.map((file) => file.path))
    const deletes = yield* Effect.filter(
      uniqueSorted(
        entries.filter((entry) => /\.(?:graphql|gql)\.ts$/.test(entry.absolute) && !outputs.has(entry.absolute))
      ),
      Effect.fnUntraced(function*(absolute) {
        const source = absolute.slice(0, -".ts".length)
        if (yield* fs.exists(source)) return false
        return (yield* fs.readFileString(absolute)).split(/\r?\n/, 1)[0] === Emitter.header(path.basename(source))
      })
    )
    return {
      files: output.files,
      deletes,
      diagnostics: output.unmappedScalars.length === 0 ? [] : [{
        severity: "warning",
        path: schemaSource.path,
        line: undefined,
        column: undefined,
        message: `Custom scalars without a mapping decode as Schema.Json: ${
          output.unmappedScalars.join(", ")
        }. Map each one to a codec with \`scalars\` in the config.`,
        codeFrame: undefined
      }]
    }
  }
)

/** Parses one document and keeps only its executable definitions. */
const parseDocument = (path: Path.Path, documentPath: string, source: Source): ParsedDocument => {
  const parsed = parse(source)
  if (Result.isFailure(parsed)) return { source, file: undefined, diagnostics: [parsed.failure] }
  const executable: Array<Ast.Definition> = []
  const diagnostics: Array<InternalDiagnostic> = []
  for (const definition of parsed.success.definitions) {
    if (definition._tag === "OperationDefinition" || definition._tag === "FragmentDefinition") {
      executable.push(definition)
    } else {
      const name = "name" in definition ? `"${definition.name.value}"` : "schema"
      diagnostics.push(make(source, definition.loc.start, `The ${name} definition is not executable.`))
    }
  }
  return {
    source,
    file: {
      source,
      document: { ...parsed.success, definitions: executable },
      outputPath: `${documentPath}.ts`,
      sourceName: path.basename(documentPath)
    },
    diagnostics
  }
}

const toPublic = (diagnostic: InternalDiagnostic): Diagnostic => ({
  severity: "error",
  path: diagnostic.path,
  line: diagnostic.line,
  column: diagnostic.column,
  message: diagnostic.message,
  codeFrame: diagnostic.codeFrame
})

const readSchema = (source: Source): Result.Result<SchemaModel.Schema, InternalDiagnostic> => {
  if (source.path.endsWith(".json")) return IntrospectionReader.read(source)
  const document = parse(source)
  return Result.isFailure(document) ? Result.fail(document.failure) : SdlReader.read(source, document.success)
}

const identifier = /^[A-Za-z_$][A-Za-z0-9_$]*$/

/** Checks each `scalars` entry against the schema and works out the shared module's import specifier. */
const resolveScalars = (
  config: Config,
  schema: SchemaModel.Schema,
  specifierFor: (module: string) => string
): Effect.Effect<ReadonlyMap<string, Emitter.ScalarMapping>, ConfigError> => {
  const scalars = new Map<string, Emitter.ScalarMapping>()
  for (const [name, specifier] of Object.entries(config.scalars ?? {})) {
    const fail = (problem: string) => Effect.fail(new ConfigError({ message: `scalars.${name}: ${problem}` }))
    const type = schema.types.get(name)
    if (type === undefined) return fail(`the schema has no type named "${name}".`)
    if (type._tag !== "ScalarType") return fail(`"${name}" is not a scalar, so it can't be mapped to a codec.`)
    if (name === "String" || name === "Boolean") return fail(`the built-in ${name} can't be overridden.`)
    const hash = specifier.lastIndexOf("#")
    const module = specifier.slice(0, hash)
    const exportName = specifier.slice(hash + 1)
    if (module === "" || !identifier.test(exportName)) {
      return fail(`expected "<module>#<export>" with an identifier after the #, got "${specifier}".`)
    }
    scalars.set(name, { specifier: specifierFor(module), exportName })
  }
  return Effect.succeed(scalars)
}

interface FileEntry {
  readonly absolute: string
  /** The `/`-separated path from the config file. */
  readonly relative: string
  readonly glob: Glob.Glob
}

/**
 * Every file under the `documents` glob roots, once per glob whose root holds
 * it, skipping `node_modules` and dot-directories. Entries that can't be
 * stat'ed, such as dangling symlinks, are skipped, and a directory symlinked
 * inside itself is walked once. An absolute pattern is a `ConfigError`.
 */
const listFiles = Effect.fnUntraced(function*(
  fs: FileSystem.FileSystem,
  path: Path.Path,
  cwd: string,
  patterns: ReadonlyArray<string>
) {
  const entries: Array<FileEntry> = []
  /** The real paths of the directories being walked, to stop at symlink loops. */
  const ancestors = new Set<string>()
  const walk = (glob: Glob.Glob, directory: string, relative: string): Effect.Effect<void, PlatformError> =>
    Effect.gen(function*() {
      const real = yield* fs.realPath(directory)
      if (ancestors.has(real)) return
      ancestors.add(real)
      for (const entry of (yield* fs.readDirectory(directory)).sort()) {
        if (Glob.isSkipped(entry)) continue
        const absolute = path.join(directory, entry)
        const entryRelative = relative === "" ? entry : `${relative}/${entry}`
        const info = yield* fs.stat(absolute).pipe(Effect.orElseSucceed(() => undefined))
        if (info?.type === "Directory") yield* walk(glob, absolute, entryRelative)
        else if (info?.type === "File") entries.push({ absolute, relative: entryRelative, glob })
      }
      ancestors.delete(real)
    })
  for (const pattern of patterns) {
    if (path.isAbsolute(pattern)) {
      return yield* new ConfigError({
        message: `documents: "${pattern}" is an absolute path; write patterns relative to the config file.`
      })
    }
    const glob = Glob.make(pattern)
    const directory = path.join(cwd, glob.root)
    if (!glob.skipped && (yield* fs.exists(directory))) yield* walk(glob, directory, glob.root)
  }
  return entries
})

const uniqueSorted = (entries: ReadonlyArray<FileEntry>): Array<string> =>
  Array.from(new Set(entries.map((entry) => entry.absolute))).sort()
