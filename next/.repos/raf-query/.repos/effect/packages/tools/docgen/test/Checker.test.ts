import * as Checker from "@effect/docgen/Checker"
import * as Configuration from "@effect/docgen/Configuration"
import * as Parser from "@effect/docgen/Parser"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Predicate } from "effect"
import * as Path from "effect/Path"
import * as ast from "ts-morph"

const project = new ast.Project({
  compilerOptions: { strict: true },
  useInMemoryFileSystem: true
})

const defaultConfig: Configuration.ConfigurationShape = {
  projectName: "docgen",
  projectHomepage: "https://github.com/effect-ts/docgen",
  srcLink: "https://github.com/effect-ts/docgen/blob/main/src/",
  srcDir: "src",
  outDir: "docs",
  theme: "mikearnaldi/just-the-docs",
  enableSearch: true,
  enforceDescriptions: false,
  enforceExamples: false,
  enforceVersion: true,
  runExamples: false,
  tscExecutable: "tsc",
  exclude: [],
  parseCompilerOptions: {},
  examplesCompilerOptions: {}
}

const makeSourcefile = (source: string | ast.SourceFile) => {
  if (Predicate.isString(source)) {
    const filename = `test.ts`
    const existing = project.getSourceFile(filename)
    if (existing) {
      project.removeSourceFile(existing)
    }
    return project.createSourceFile(filename, source)
  }
  return source
}

const makeSource = (source: string | ast.SourceFile) => {
  const sourceFile = makeSourcefile(source)
  const filename = sourceFile.getBaseName()
  return Parser.Source.of({
    path: [filename],
    sourceFile
  })
}

const expectFailure = <A>(
  config: Partial<Configuration.ConfigurationShape>,
  sourceText: string,
  parser: Effect.Effect<A, never, Parser.Source | Configuration.Configuration | Path.Path>,
  checker: (a: A) => Effect.Effect<Array<string>, never, Configuration.Configuration | Parser.Source>,
  failure: ReadonlyArray<string>
) => {
  return Effect.gen(function*() {
    const actual = yield* Effect.exit(parser.pipe(
      Effect.flatMap(checker),
      Effect.provideService(Parser.Source, makeSource(sourceText)),
      Effect.provideService(Configuration.Configuration, { ...defaultConfig, ...config }),
      Effect.provide(Path.layer)
    ))
    assert.ok(actual._tag === "Success")
    assert.deepStrictEqual(actual.value, failure)
  })
}

describe("Checker", () => {
  describe("checkFunctions", () => {
    it.effect("should raise an error if `@since` tag is missing", () =>
      expectFailure(
        {},
        `
/** @since 1.0.0 */
export function a() {}

/** description */
export function b() {}
        `,
        Parser.parseFunctions,
        Checker.checkFunctions,
        [
          "Missing `@since` tag in file /test.ts:\n" +
          "\n" +
          "  4 |\n" +
          "  5 | /** description */\n" +
          "> 6 | export function b() {}\n" +
          "    |  ^\n" +
          "  7 |         "
        ]
      ))
  })

  describe("checkExports", () => {
    it.effect("should raise an error if `@since` tag is missing", () =>
      expectFailure(
        {},
        "export { a }",
        Parser.parseExports,
        Checker.checkExports,
        [
          "Missing `@since` tag in file /test.ts:\n" +
          "\n" +
          "> 1 | export { a }\n" +
          "    |           ^"
        ]
      ))
  })

  describe("checkNamespaces", () => {
    it.effect("should raise an error if `@since` tag is missing", () =>
      expectFailure(
        {},
        "export namespace A {}",
        Parser.parseNamespaces,
        Checker.checkNamespaces,
        [
          "Missing `@since` tag in file /test.ts:\n" +
          "\n" +
          "> 1 | export namespace A {}\n" +
          "    |  ^"
        ]
      ))

    it.effect("should raise an error if `@since` tag is missing on a nested interface", () =>
      expectFailure(
        {},
        `
      /**
       * @since 1.0.0
       */
      export namespace A {
        export interface B {}
      }
      `,
        Parser.parseNamespaces,
        Checker.checkNamespaces,
        [
          "Missing `@since` tag in file /test.ts:\n" +
          "\n" +
          "  4 |        */\n" +
          "  5 |       export namespace A {\n" +
          "> 6 |         export interface B {}\n" +
          "    |          ^\n" +
          "  7 |       }\n" +
          "  8 |       "
        ]
      ))

    it.effect("should raise an error if `@since` tag is missing on a nested type alias", () =>
      expectFailure(
        {},
        `
      /**
       * @since 1.0.0
       */
      export namespace A {
        export type B = string
      }
      `,
        Parser.parseNamespaces,
        Checker.checkNamespaces,
        [
          "Missing `@since` tag in file /test.ts:\n" +
          "\n" +
          "  4 |        */\n" +
          "  5 |       export namespace A {\n" +
          "> 6 |         export type B = string\n" +
          "    |          ^\n" +
          "  7 |       }\n" +
          "  8 |       "
        ]
      ))

    it.effect("should raise an error if `@since` tag is missing on a nested namespace", () =>
      expectFailure(
        {},
        `
      /**
       * @since 1.0.0
       */
      export namespace A {
        export namespace B {}
      }
      `,
        Parser.parseNamespaces,
        Checker.checkNamespaces,
        [
          "Missing `@since` tag in file /test.ts:\n" +
          "\n" +
          "  4 |        */\n" +
          "  5 |       export namespace A {\n" +
          "> 6 |         export namespace B {}\n" +
          "    |          ^\n" +
          "  7 |       }\n" +
          "  8 |       "
        ]
      ))
  })

  describe("checkClasses", () => {
    it.effect("should raise an error if `@since` tag is missing", () =>
      expectFailure(
        {},
        `export class MyClass {}`,
        Parser.parseClasses,
        Checker.checkClasses,
        [
          "Missing `@since` tag in file /test.ts:\n" +
          "\n" +
          "> 1 | export class MyClass {}\n" +
          "    |  ^"
        ]
      ))
  })
})
