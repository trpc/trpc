/**
 * Coordinates source parsing, validation, example checking, and Markdown generation.
 *
 * @since 0.6.0
 */

import * as NodePath from "@effect/platform-node/NodePath"
import chalk from "chalk"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as FileSystem from "effect/FileSystem"
import { pipe } from "effect/Function"
import * as Path from "effect/Path"
import * as ChildProcess from "effect/process/ChildProcess"
import * as Stream from "effect/Stream"
import * as String from "effect/String"
import * as Glob from "glob"
import * as Checker from "./Checker.ts"
import * as Configuration from "./Configuration.ts"
import * as Domain from "./Domain.ts"
import * as Parser from "./Parser.ts"
import * as Printer from "./Printer.ts"
/**
 * Find all files matching the specified `glob` pattern, optionally excluding
 * files matching the provided `exclude` patterns.
 */
const glob = (pattern: string, exclude: ReadonlyArray<string> = []) =>
  Effect.tryPromise(() =>
    Glob.glob(pattern, {
      ignore: exclude.slice(),
      withFileTypes: false
    })
  ).pipe(
    Effect.mapError(() =>
      new Domain.DocgenError({
        message: `[Core.glob] Unable to execute glob pattern '${pattern}' ` +
          `excluding files matching '${exclude}'`
      })
    ),
    Effect.orDie
  )

/** @internal */
export const runCommand = Effect.fnUntraced(function*(
  executable: string,
  args: ReadonlyArray<string>,
  shell: boolean
) {
  const handle = yield* ChildProcess.make(executable, args, { shell })
  const [stdout, stderr, exitCode] = yield* Effect.all([
    Stream.mkString(Stream.decodeText(handle.stdout)),
    Stream.mkString(Stream.decodeText(handle.stderr)),
    handle.exitCode
  ], { concurrency: "unbounded" })
  return { stdout, stderr, exitCode } as const
})

/**
 * Reads all TypeScript files in the source directory and returns an array of file objects.
 * Each file object contains the file path and its content.
 */
const readSourceFiles = Effect.gen(function*() {
  const config = yield* Configuration.Configuration
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path.pipe(Effect.provide(NodePath.layerPosix))
  const pattern = path.normalize(path.join(config.srcDir, "**", "*.ts"))
  const paths = yield* glob(pattern, config.exclude)
  yield* Effect.logInfo(chalk.bold(`${paths.length} module(s) found`))
  return yield* Effect.forEach(paths, (path) =>
    Effect.map(
      fs.readFileString(path),
      (content) => new Domain.File(path, content, false)
    ), { concurrency: "unbounded" })
})

/**
 * Writes a file to the `config.outDir` directory, taking into account the configuration and existing files.
 */
const writeFileToOutDir = (file: Domain.File) =>
  Effect.gen(function*() {
    const config = yield* Configuration.Configuration
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const process = yield* Domain.Process
    const cwd = yield* process.cwd
    const fileName = path.relative(path.join(cwd, config.outDir), file.path)

    const exists = yield* fs.exists(file.path)
    if (exists) {
      if (file.isOverwriteable) {
        yield* Effect.logDebug(`Overwriting file ${chalk.black(fileName)}...`)
        yield* fs.makeDirectory(path.dirname(file.path), { recursive: true })
        yield* fs.writeFileString(file.path, file.content)
      } else {
        yield* Effect.logDebug(
          `File ${chalk.black(fileName)} already exists, skipping creation.`
        )
      }
    } else {
      yield* fs.makeDirectory(path.dirname(file.path), { recursive: true })
      yield* fs.writeFileString(file.path, file.content)
    }
  })

const writeFilesToOutDir = (
  files: ReadonlyArray<Domain.File>
) => Effect.forEach(files, writeFileToOutDir, { discard: true })

const parseModules = (files: ReadonlyArray<Domain.File>) =>
  Parser.parseFiles(files).pipe(
    Effect.mapError((errors) =>
      new Domain.DocgenError({
        message: "[Core.parseModules] The following error(s) occurred while " +
          `parsing the TypeScript source files:\n${errors.map((errors) => errors.join("\n")).join("\n")}`
      })
    )
  )

/**
 * Runs the example files for the given modules, type-checking them before execution.
 */
const typeCheckAndRunExamples = (modules: ReadonlyArray<Domain.Module>) =>
  Effect.gen(function*() {
    const config = yield* Configuration.Configuration
    yield* cleanupExamples
    const files = yield* getExampleFiles(modules)
    const len = files.length
    if (len > 0) {
      yield* Effect.logInfo(`${len} example(s) found`)
      yield* writeExamplesToOutDir(files)
      yield* createExamplesTsConfigJson
      yield* Effect.logInfo("Typechecking examples...")
      yield* runTscOnExamples
      if (config.runExamples) {
        yield* Effect.logInfo("Running examples...")
        yield* runTsxOnExamples
      } else {
        yield* Effect.logInfo(chalk.gray("Skipping running examples"))
      }
    } else {
      yield* Effect.logInfo("No examples found.")
    }
    yield* cleanupExamples
  })

/**
 * Joins an array of strings with a "-" after dropping all empty strings.
 */
const filterJoin = (self: Array<string>) =>
  pipe(
    self,
    Array.filter(String.isNonEmpty),
    Array.join("-")
  )

/**
 * Extracts deeply nested namespaces with their corresponding namespace prefix
 * from a given namespace.
 */
const extractPrefixedNestedNamespaces = (
  doc: Domain.Namespace,
  prefix: string
): ReadonlyArray<[string, Domain.Namespace]> => {
  const newPrefix = String.isEmpty(prefix) ? doc.name : `${prefix}-${doc.name}`
  const namespaces = Array.flatMap(
    doc.namespaces,
    (namespace) => extractPrefixedNestedNamespaces(namespace, newPrefix)
  )
  return Array.prepend(namespaces, [prefix, doc])
}

/**
 * Fence metadata that excludes an example from docgen type checking.
 *
 * @category constants
 * @since 0.6.0
 */
export const SKIP_TYPE_CHECKING_FENCE_METADATA = "skip-type-checking"

/**
 * Extracts all fenced code blocks from markdown content.
 * Handles both ``` and ~~~ fences, including any metadata like language, title, and other attributes.
 *
 * @internal
 */
export const extractFencedCode = (content: string): [examples: Array<string>, warnings: Array<string>] => {
  // The regex now captures the closing fence (group 3) if present.
  // If there's no closing fence, group 3 will be undefined.
  const fenceRegex = /(?:```|~~~)(.*?)\n([\s\S]*?)(?:(```|~~~)|$)/g
  const matches = Array.fromIterable(content.matchAll(fenceRegex))

  const warnings: Array<string> = []

  // Log a warning if a code fence is not properly closed.
  for (const match of matches) {
    if (match[3] === undefined) {
      warnings.push(`Code block does not have a matching closing fence:\n${content}`)
    }
  }

  return [
    matches
      .filter((match) => {
        const meta = match[1].toLocaleLowerCase()
        const isTypeScript = meta.startsWith("ts") || meta.startsWith("typescript")
        const isSkipTypeChecking = meta.includes(SKIP_TYPE_CHECKING_FENCE_METADATA)
        return isTypeScript && !isSkipTypeChecking
      })
      .map((match) => match[2].trim()),
    warnings
  ]
}

/**
 * Generates example files for the given modules.
 */
const getExampleFiles = (modules: ReadonlyArray<Domain.Module>) =>
  Effect.gen(function*() {
    const config = yield* Configuration.Configuration
    const path = yield* Path.Path
    let warnings: Array<string> = []
    // Flattened module paths can collide, so give every emitted example a unique prefix.
    let fileIndex = 0
    const files = Array.flatMap(modules, (module) => {
      const prefix = module.path.join("-")

      const getFiles =
        (exampleId: string) =>
        (namedDoc: { readonly name: string; readonly doc: Domain.Doc }): ReadonlyArray<Domain.File> => {
          let descriptionExamples: Array<string> = []
          if (namedDoc.doc.description !== undefined) {
            const [es, ws] = extractFencedCode(namedDoc.doc.description)
            warnings = warnings.concat(ws)
            descriptionExamples = es
          }
          let exampleTagExamples: Array<string> = []
          for (const example of namedDoc.doc.examples) {
            const [es, ws] = extractFencedCode(example)
            warnings = warnings.concat(ws)
            exampleTagExamples = exampleTagExamples.concat(es)
          }
          const examples = descriptionExamples.concat(exampleTagExamples)
          return Array.map(
            examples,
            (example, i) => {
              return new Domain.File(
                path.join(
                  config.outDir,
                  "examples",
                  `${fileIndex++}-${prefix}-${exampleId}-${namedDoc.name}-${i}.ts`
                ),
                example,
                true // make the file overwritable
              )
            }
          )
        }

      const allPrefixedNamespaces = Array.flatMap(module.namespaces, (namespace) =>
        extractPrefixedNestedNamespaces(namespace, ""))

      const moduleExamples = getFiles("module")(module)
      const classExamples = Array.flatMap(module.classes, (c) =>
        Array.flatten([
          getFiles("class")(c),
          Array.flatMap(c.properties, getFiles(`${c.name}-property`)),
          Array.flatMap(
            c.methods,
            getFiles(`${c.name}-method`)
          ),
          Array.flatMap(
            c.staticMethods,
            getFiles(`${c.name}-staticmethod`)
          )
        ]))
      const allPrefixedInterfaces = [
        ...module.interfaces.map((iface) =>
          ["" as string, iface] as const
        ),
        ...Array.flatMap(allPrefixedNamespaces, ([prefix, namespace]) =>
          namespace.interfaces.map((iface) =>
            [filterJoin([prefix, namespace.name]), iface] as const
          ))
      ]
      const interfacesExamples = Array.flatMap(
        allPrefixedInterfaces,
        ([ns, doc]) => getFiles(filterJoin(["interface", ns]))(doc)
      )
      const allPrefixedTypeAliases = [
        ...module.typeAliases.map((typeAlias) => ["" as string, typeAlias] as const),
        ...Array.flatMap(allPrefixedNamespaces, ([prefix, namespace]) =>
          namespace.typeAliases.map((typeAlias) =>
            [filterJoin([prefix, namespace.name]), typeAlias] as const
          ))
      ]
      const typeAliasesExamples = Array.flatMap(
        allPrefixedTypeAliases,
        ([ns, doc]) =>
          getFiles(filterJoin(["typealias", ns]))(doc)
      )
      const constantsExamples = Array.flatMap(
        module.constants,
        getFiles("constant")
      )
      const functionsExamples = Array.flatMap(
        module.functions,
        getFiles("function")
      )
      const exportsExamples = Array.flatMap(
        module.exports,
        getFiles("export")
      )
      const namespacesExamples = Array.flatMap(
        allPrefixedNamespaces,
        ([ns, doc]) => getFiles(filterJoin(["namespace", ns]))(doc)
      )

      return Array.flatten([
        moduleExamples,
        classExamples,
        interfacesExamples,
        typeAliasesExamples,
        constantsExamples,
        functionsExamples,
        namespacesExamples,
        exportsExamples
      ])
    })

    if (warnings.length > 0) {
      yield* Effect.logWarning(warnings.join("\n"))
    }

    return files
  })

/**
 * Generates an entry point file for the given examples.
 */
const getExamplesEntryPoint = (examples: ReadonlyArray<Domain.File>) =>
  Effect.gen(function*() {
    const config = yield* Configuration.Configuration
    const path = yield* Path.Path
    const content = examples.map((example) => `import './${path.basename(example.path, ".ts")}'`)
      .join("\n")
    return new Domain.File(
      path.normalize(path.join(config.outDir, "examples", "index.ts")),
      `${content}\n`,
      true // make the file overwritable
    )
  })

/**
 * Removes the "examples" directory from the output directory specified in the configuration.
 */
const cleanupExamples = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const config = yield* Configuration.Configuration
  const path = yield* Path.Path
  const examplesDir = path.join(config.outDir, "examples")
  const exists = yield* Effect.orDie(fs.exists(examplesDir))
  if (exists) {
    yield* fs.remove(examplesDir, { recursive: true })
  }
})

/**
 * Runs tsc on the examples directory.
 */
const runTscOnExamples = Effect.gen(function*() {
  const config = yield* Configuration.Configuration
  const process = yield* Domain.Process
  const cwd = yield* process.cwd
  const path = yield* Path.Path
  const platform = yield* process.platform

  const tsconfig = path.normalize(path.join(cwd, config.outDir, "examples", "tsconfig.json"))
  const options = ["--noEmit", "--project", tsconfig]
  yield* Effect.logDebug("Running tsc on examples...")
  const result = yield* runCommand(
    platform === "win32" ? `${config.tscExecutable}.cmd` : config.tscExecutable,
    options,
    platform === "win32"
  ).pipe(Effect.mapError((error) =>
    new Domain.DocgenError({
      message: `Something went wrong while running tsc on examples:\n\n${globalThis.String(error)}`
    })
  ))
  if (result.exitCode !== 0) {
    return yield* new Domain.DocgenError({
      message: `Something went wrong while running tsc on examples:\n\n${result.stdout}`
    })
  }
})

/**
 * Runs tsc on the examples directory.
 */
const runTsxOnExamples = Effect.gen(function*() {
  const config = yield* Configuration.Configuration
  const path = yield* Path.Path
  const process = yield* Domain.Process
  const cwd = yield* process.cwd
  const platform = yield* process.platform

  const examples = path.normalize(path.join(cwd, config.outDir, "examples"))
  const tsconfig = path.join(examples, "tsconfig.json")
  const index = path.join(examples, "index.ts")
  const options = ["--tsconfig", tsconfig, index]
  yield* Effect.logDebug("Running tsx on examples...")
  const result = yield* runCommand(
    platform === "win32" ? "tsx.cmd" : "tsx",
    options,
    platform === "win32"
  ).pipe(Effect.mapError((error) =>
    new Domain.DocgenError({
      message: `Something went wrong while running tsx on examples:\n\n${globalThis.String(error)}`
    })
  ))
  if (result.exitCode !== 0) {
    return yield* new Domain.DocgenError({
      message: `Something went wrong while running tsx on examples:\n\n${result.stderr}`
    })
  }
})

const writeExamplesToOutDir = (examples: ReadonlyArray<Domain.File>) =>
  Effect.gen(function*() {
    yield* Effect.logDebug("Writing examples...")
    const entryPoint = yield* getExamplesEntryPoint(examples)
    const files = [entryPoint, ...examples]
    yield* writeFilesToOutDir(files)
  })

const createExamplesTsConfigJson = Effect.gen(function*() {
  yield* Effect.logDebug("Writing examples tsconfig...")
  const config = yield* Configuration.Configuration
  const process = yield* Domain.Process
  const cwd = yield* process.cwd
  const path = yield* Path.Path
  yield* writeFileToOutDir(
    new Domain.File(
      path.join(cwd, config.outDir, "examples", "tsconfig.json"),
      JSON.stringify({ compilerOptions: config.examplesCompilerOptions }, null, 2),
      true // make the file overwritable
    )
  )
})

const getMarkdown = (modules: ReadonlyArray<Domain.Module>) =>
  Effect.gen(function*() {
    const homepage = yield* getMarkdownHomepage
    const index = yield* getMarkdownIndex
    const yml = yield* getMarkdownConfigYML
    const moduleFiles = yield* getModuleMarkdownFiles(modules)
    return [homepage, index, yml, ...moduleFiles]
  })

const getMarkdownHomepage = Effect.gen(function*() {
  const config = yield* Configuration.Configuration
  const process = yield* Domain.Process
  const cwd = yield* process.cwd
  const path = yield* Path.Path
  return new Domain.File(
    path.join(cwd, config.outDir, "index.md"),
    String.stripMargin(
      `|---
       |title: Home
       |nav_order: 1
       |---
       |`
    ),
    false
  )
})

const getMarkdownIndex = Effect.gen(function*() {
  const config = yield* Configuration.Configuration
  const process = yield* Domain.Process
  const cwd = yield* process.cwd
  const path = yield* Path.Path
  return new Domain.File(
    path.join(cwd, config.outDir, "modules", "index.md"),
    String.stripMargin(
      `|---
       |title: Modules
       |has_children: true
       |permalink: /docs/modules
       |nav_order: 2
       |---
       |`
    ),
    false
  )
})

const resolveConfigYML = (content: string) =>
  Effect.gen(function*() {
    const config = yield* Configuration.Configuration
    return content
      .replace(/^remote_theme:.*$/m, `remote_theme: ${config.theme}`)
      .replace(
        /^search_enabled:.*$/m,
        `search_enabled: ${config.enableSearch}`
      ).replace(
        /^ {2}'\S* on GitHub':\n {4}- '.*'/m,
        `  '${config.projectName} on GitHub':\n    - '${config.projectHomepage}'`
      )
  })

const getHomepageNavigationHeader = (config: Configuration.ConfigurationShape): string => {
  const isGitHub = config.projectHomepage.toLowerCase().includes("github")
  return isGitHub ? config.projectName + " on GitHub" : "Homepage"
}

const getMarkdownConfigYML = Effect.gen(function*() {
  const config = yield* Configuration.Configuration
  const process = yield* Domain.Process
  const fs = yield* FileSystem.FileSystem
  const cwd = yield* process.cwd
  const path = yield* Path.Path
  const configPath = path.join(cwd, config.outDir, "_config.yml")
  const exists = yield* fs.exists(configPath)
  if (exists) {
    const content = yield* fs.readFileString(configPath)
    const resolved = yield* resolveConfigYML(content)
    return new Domain.File(configPath, resolved, true)
  } else {
    return new Domain.File(
      configPath,
      String.stripMargin(
        `|remote_theme: ${config.theme}
         |
         |# Enable or disable the site search
         |search_enabled: ${config.enableSearch}
         |
         |# Aux links for the upper right navigation
         |aux_links:
         |'${getHomepageNavigationHeader(config)}':
         |  - '${config.projectHomepage}'`
      ),
      false
    )
  }
})

const getModuleMarkdownOutputPath = (module: Domain.Module) => {
  return Effect.gen(function*() {
    const config = yield* Configuration.Configuration
    const path = yield* Path.Path
    return path.normalize(path.join(
      config.outDir,
      "modules",
      `${path.relative(config.srcDir, module.path.join(path.sep))}.md`
    ))
  })
}

/** @internal */
export const getModuleMarkdownFiles = (modules: ReadonlyArray<Domain.Module>) =>
  Effect.forEach(modules, (module, i) =>
    Effect.gen(function*() {
      const outputPath = yield* getModuleMarkdownOutputPath(module)
      const moduleContent = yield* Printer.printModule(module)
      const tocgen = yield* Effect.promise(() => import("@effect/markdown-toc").then((module) => module.default)).pipe(
        Effect.orDie
      )
      const toc = tocgen(moduleContent, { bullets: "-" }).content
      const frontMatter = Printer.printFrontMatter(module, i + 1)
      const content = (frontMatter + "\n\n" + moduleContent).replace(
        "<!-- toc -->",
        `---
## Exports Grouped by Category
${toc}
---`
      )

      const prettified = yield* Printer.prettify(content)
      return new Domain.File(outputPath, prettified, true)
    }))

const writeMarkdown = (files: ReadonlyArray<Domain.File>) =>
  Effect.gen(function*() {
    const config = yield* Configuration.Configuration
    const fileSystem = yield* FileSystem.FileSystem
    const path = yield* Path.Path.pipe(Effect.provide(NodePath.layerPosix))
    const pattern = path.normalize(path.join(config.outDir, "**/*.ts.md"))
    yield* Effect.logDebug(`Deleting ${chalk.black(pattern)}...`)
    const paths = yield* glob(pattern)
    yield* Effect.forEach(paths, (path) => fileSystem.remove(path, { recursive: true }), {
      concurrency: "unbounded"
    })
    return yield* writeFilesToOutDir(files)
  })

/** @internal */
export const program = Effect.gen(function*() {
  yield* Effect.logInfo("Reading modules...")
  const sourceFiles = yield* readSourceFiles
  yield* Effect.logInfo("Parsing modules...")
  const modules = yield* parseModules(sourceFiles)

  const checkFiber = yield* Effect.gen(function*() {
    yield* Effect.logInfo("Checking modules...")
    const errors = yield* Checker.checkModules(modules)
    if (errors.length > 0) {
      return yield* Effect.fail(
        new Domain.DocgenError({
          message: `The following errors occurred while checking the modules:\n\n${errors.join("\n\n")}`
        })
      )
    }
    yield* typeCheckAndRunExamples(modules)
  }).pipe(Effect.forkChild)

  const markdownFiber = yield* Effect.gen(function*() {
    yield* Effect.logInfo("Creating markdown files...")
    const outputFiles = yield* getMarkdown(modules)
    yield* Effect.logInfo("Writing markdown files...")
    yield* writeMarkdown(outputFiles)
  }).pipe(Effect.forkChild)

  yield* Fiber.joinAll([checkFiber, markdownFiber])

  yield* Effect.logInfo(chalk.bold.green("✓ Docs generation succeeded!"))
})
