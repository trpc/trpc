/**
 * Helpers for the `generate` contract tests: running the generator over files
 * written to a temporary directory or over the GitHub fixture, importing the
 * generated GitHub modules, and reading the emitted text.
 *
 * The text helpers read the output line by line with indentation and a
 * trailing comma stripped, so a test pins the emitted expression for a key
 * without pinning the surrounding layout.
 */
import type * as Config from "@effect/graphql-generator/Config"
import * as Generator from "@effect/graphql-generator/Generator"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { assert } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import { fileURLToPath, pathToFileURL } from "node:url"

export interface Generated {
  readonly result: Generator.GenerateResult
  /** Output paths relative to `cwd`, with `/` separators, sorted. */
  readonly paths: ReadonlyArray<string>
  /** The contents of the output at a `cwd`-relative path. Fails the test if it wasn't emitted. */
  readonly file: (relative: string) => string
}

const collect = Effect.fnUntraced(function*(cwd: string, config: Config.Config) {
  const path = yield* Path.Path
  const result = yield* Generator.generate(config, { cwd })
  const byPath = new Map<string, string>()
  for (const file of result.files) {
    byPath.set(path.relative(cwd, path.resolve(cwd, file.path)).split(path.sep).join("/"), file.contents)
  }
  const generated: Generated = {
    result,
    paths: Array.from(byPath.keys()).sort(),
    file: (relative) => {
      const contents = byPath.get(relative)
      assert(contents !== undefined, `expected ${relative} among ${JSON.stringify(Array.from(byPath.keys()))}`)
      return contents
    }
  }
  return generated
})

/** Writes `inputs` (cwd-relative path to contents) to a fresh temporary directory and generates there. */
export const generateIn = Effect.fnUntraced(function*(inputs: Readonly<Record<string, string>>, config: Config.Config) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const cwd = yield* fs.makeTempDirectoryScoped({ prefix: "graphql-generator-" })
  for (const [relative, body] of Object.entries(inputs)) {
    const file = path.join(cwd, relative)
    yield* fs.makeDirectory(path.dirname(file), { recursive: true })
    yield* fs.writeFileString(file, body)
  }
  return yield* collect(cwd, config)
})

/** The directory holding the GitHub schema subset and `documents/`. */
export const githubFixtureDir = fileURLToPath(new URL("../fixtures/github", import.meta.url))

/**
 * The config the GitHub snapshot set is generated with. The shared module sits
 * beside the documents so every emitted file imports its siblings with `./`.
 */
export const githubConfig: Config.Config = {
  schema: "./schema.graphql",
  documents: ["documents/*.graphql"],
  shared: "./documents/shared.graphql.ts",
  scalars: {
    DateTime: "./documents/scalars.ts#DateTime",
    URI: "./documents/scalars.ts#URI",
    GitObjectID: "./documents/scalars.ts#GitObjectID"
  }
}

export const generateGitHub = collect(githubFixtureDir, githubConfig)

const tmpRoot = fileURLToPath(new URL("../.tmp", import.meta.url))

/**
 * Writes the generated GitHub set to a fresh directory under `test/.tmp`,
 * beside a copy of the scalar codecs it imports, and returns the directory.
 * The directory is removed when the scope closes.
 */
export const writeGitHub = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const generated = yield* generateGitHub
  assertNoErrors(generated)
  yield* fs.makeDirectory(tmpRoot, { recursive: true })
  const dir = yield* fs.makeTempDirectoryScoped({ directory: tmpRoot, prefix: "github-" })
  yield* fs.copyFile(path.join(githubFixtureDir, "documents", "scalars.ts"), path.join(dir, "scalars.ts"))
  for (const relative of generated.paths) {
    yield* fs.writeFileString(path.join(dir, path.basename(relative)), generated.file(relative))
  }
  return dir
})

/** A client built from an imported GitHub module: its methods and results are untyped. */
export type UntypedClient = Readonly<Record<string, (...args: ReadonlyArray<any>) => Effect.Effect<any, unknown>>>

/**
 * Generates the GitHub set and imports `file` from it. The generated code is not
 * on disk when the tests are typechecked, so the module is untyped, and clients
 * built from it with `GraphQLClient.make<never>` are typed as
 * {@link UntypedClient}. The snapshot test typechecks the generated code itself.
 */
export const importGitHub = (file: string) =>
  writeGitHub.pipe(
    Effect.flatMap((dir) => Effect.promise((): Promise<any> => import(pathToFileURL(`${dir}/${file}`).href))),
    Effect.scoped,
    Effect.provide(NodeServices.layer)
  )

/** The directory holding `sdl/subscriptions.graphql` and its documents under `subscriptions/`. */
export const fixturesDir = fileURLToPath(new URL("../fixtures", import.meta.url))

/**
 * The config the subscriptions snapshot set is generated with: the
 * hand-written `sdl/subscriptions.graphql` schema, its documents under
 * `subscriptions/`, and the shared module beside them.
 */
export const subscriptionsConfig: Config.Config = {
  schema: "./sdl/subscriptions.graphql",
  documents: ["subscriptions/*.graphql"],
  shared: "./subscriptions/shared.graphql.ts"
}

export const generateSubscriptions = collect(fixturesDir, subscriptionsConfig)

export const warnings = (generated: Generated) =>
  generated.result.diagnostics.filter((diagnostic) => diagnostic.severity === "warning")

export const assertNoErrors = (generated: Generated): void => {
  assert.deepStrictEqual(
    generated.result.diagnostics.flatMap(({ column, line, message, path, severity }) =>
      severity === "error" ? [`${path}:${line}:${column} ${message}`] : []
    ),
    []
  )
}

const lines = (text: string): ReadonlyArray<string> => text.split("\n").map((line) => line.trim())

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const memberPattern = (key: string) => new RegExp(`^${escapeRegExp(key)}: (.*?),?$`)

/** Every expression emitted for the struct key `key`, in file order. */
export const members = (text: string, key: string): ReadonlyArray<string> => {
  const pattern = memberPattern(key)
  return lines(text).flatMap((line) => {
    const match = pattern.exec(line)
    return match === null ? [] : [match[1]!]
  })
}

const uniqueIndex = (text: string, pattern: RegExp, what: string): number => {
  const found = lines(text).flatMap((line, i) => pattern.test(line) ? [i] : [])
  assert.strictEqual(found.length, 1, `expected exactly one ${what}`)
  return found[0]!
}

/** The expression emitted for the struct key `key`, which must appear once in the file. */
export const member = (text: string, key: string): string => {
  const index = uniqueIndex(text, memberPattern(key), `member ${key}`)
  return memberPattern(key).exec(lines(text)[index]!)![1]!
}

const docAbove = (text: string, index: number): ReadonlyArray<string> => {
  const all = lines(text)
  let end = index - 1
  if (end < 0 || !all[end]!.endsWith("*/")) return []
  let start = end
  while (start >= 0 && !all[start]!.startsWith("/**")) start--
  assert(start >= 0, "unterminated JSDoc")
  if (start === end) return [all[start]!.slice(3, -2).trim()]
  end--
  return all.slice(start + 1, end + 1).map((line) => line.replace(/^\*\s?/, ""))
}

/** The JSDoc lines directly above the struct key `key`, without the comment markers. */
export const docOf = (text: string, key: string): ReadonlyArray<string> =>
  docAbove(text, uniqueIndex(text, memberPattern(key), `member ${key}`))

const declarationPattern = (name: string) =>
  new RegExp(`^export (?:const|class|type|declare namespace) ${escapeRegExp(name)}\\b`)

/** The first line declaring the export `name`. */
export const declaration = (text: string, name: string): string => {
  const line = lines(text).find((line) => declarationPattern(name).test(line))
  assert(line !== undefined, `expected a declaration of ${name}`)
  return line
}

/** Fails unless every name in `names` is first declared in the given order. */
export const assertDeclaredInOrder = (text: string, names: ReadonlyArray<string>): void => {
  const all = lines(text)
  const indexed = names.map((name) => {
    const index = all.findIndex((line) => declarationPattern(name).test(line))
    assert(index >= 0, `expected a declaration of ${name}`)
    return { name, index }
  })
  assert.deepStrictEqual(indexed.slice().sort((a, b) => a.index - b.index).map(({ name }) => name), names)
}

/** The trimmed lines of the file, for whole-line assertions. */
export const fileLines = lines

/**
 * A small hand-written schema: a mapped (`Timestamp`) and an unmapped
 * (`HTML`) custom scalar plus one no operation reaches (`Blob`), and a
 * non-null argument with a default.
 */
export const taskSchemaSdl = `
scalar Timestamp
scalar HTML
scalar Blob

type Task {
  id: ID!
  title: String!
  done: Boolean!
  estimate: Float
  due: Timestamp
  bodyHTML: HTML!
  attachment: Blob
}

type Query {
  tasks(first: Int! = 20): [Task!]!
  task(id: ID!): Task
}
`

/** The usual layout for `taskSchemaSdl` tests: schema under `schema/`, documents under `src/`. */
export const taskConfig: Config.Config = {
  schema: "./schema/app.graphql",
  documents: ["src/**/*.graphql"],
  scalars: {
    Timestamp: "./scalars.ts#Timestamp"
  }
}

/** Generates `documents` (paths under `src/`) against `taskSchemaSdl`. */
export const generateTasks = (
  documents: Readonly<Record<string, string>>,
  config: Config.Config = taskConfig
) => generateIn({ "schema/app.graphql": taskSchemaSdl, ...documents }, config)

/**
 * Writes the generated files, in their `cwd`-relative layout, to a scratch
 * directory inside the package (so `effect` resolves) and imports the module
 * at `relative`. The directory is removed when the scope closes.
 */
export const importGenerated = Effect.fnUntraced(function*(generated: Generated, relative: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const root = fileURLToPath(new URL("../.tmp", import.meta.url))
  yield* fs.makeDirectory(root, { recursive: true })
  const dir = yield* fs.makeTempDirectoryScoped({ directory: root, prefix: "import-" })
  for (const file of generated.paths) {
    const target = path.join(dir, file)
    yield* fs.makeDirectory(path.dirname(target), { recursive: true })
    yield* fs.writeFileString(target, generated.file(file))
  }
  const url = pathToFileURL(path.join(dir, relative)).href
  return yield* Effect.promise(() => import(/* @vite-ignore */ url) as Promise<Record<string, any>>)
})
