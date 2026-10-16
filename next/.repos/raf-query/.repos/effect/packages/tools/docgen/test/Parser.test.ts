import * as Configuration from "@effect/docgen/Configuration"
import * as Domain from "@effect/docgen/Domain"
import * as Parser from "@effect/docgen/Parser"
import * as Printer from "@effect/docgen/Printer"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Exit, Predicate } from "effect"
import * as Path from "effect/Path"
import * as ast from "ts-morph"

let testCounter = 0

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

const print = (printables: ReadonlyArray<Printer.Printable>) => {
  return Effect.gen(function*() {
    const strings = yield* Effect.forEach(printables, (printable) => Printer.print(printable))
    return strings.join("\n")
  })
}

const isModule = (printableOr: ReadonlyArray<Printer.Printable> | Domain.Module): printableOr is Domain.Module => {
  return !Array.isArray(printableOr)
}

const expectMarkdown = Effect.fnUntraced(function*<E>(
  eff: Effect.Effect<
    ReadonlyArray<Printer.Printable> | Domain.Module,
    E,
    Parser.Source | Configuration.Configuration | Path.Path
  >,
  sourceText: string,
  expected: string,
  config?: Partial<Configuration.ConfigurationShape>
) {
  const exit = yield* Effect.exit(eff.pipe(
    Effect.flatMap((printableOr) => {
      if (isModule(printableOr)) {
        return Printer.printModule(printableOr)
      }
      return print(printableOr)
    }),
    Effect.provideService(Parser.Source, makeSource(sourceText)),
    Effect.provideService(Configuration.Configuration, { ...defaultConfig, ...config }),
    Effect.provide(Path.layer)
  ))
  assert.ok(exit._tag === "Success")
  if (exit.value !== expected) {
    console.log(exit.value)
  }
  assert.strictEqual(exit.value, expected)
})

describe("Parser", () => {
  describe("parseModule", () => {
    it.effect("should not require an example for modules when `enforceExamples` is set to true", () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseModule,
          `/**
* This is the assert module.
*
* @since 1.0.0
*/
import * as assert from 'assert'

/**
 * This is the foo export.
 *
 * @example
 * import { foo } from 'test'
 *
 * console.log(foo)
 *
 * @category category
 * @since 1.0.0
 */
export const foo = 'foo'`,
          `## test.ts overview

This is the assert module.

Since v1.0.0

<!-- toc -->

# category

## foo

This is the foo export.

**Example**

\`\`\`ts
import { foo } from 'test'

console.log(foo)
\`\`\`

**Signature**

\`\`\`ts
declare const foo: "foo"
\`\`\`

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L19)

Since v1.0.0`
        )
      }))

    it.effect("should ignore non-JSDoc comments above JSDoc comments", () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseModule,
          `/**
* This is the assert module.
*
* @since 1.0.0
*/
import * as assert from 'assert'

// This comment should be ignored

/**
 * This is the foo export.
 *
 * @example
 * import { foo } from 'test'
 *
 * console.log(foo)
 *
 * @category category
 * @since 1.0.0
 */
export const foo = 'foo'`,
          `## test.ts overview

This is the assert module.

Since v1.0.0

<!-- toc -->

# category

## foo

This is the foo export.

**Example**

\`\`\`ts
import { foo } from 'test'

console.log(foo)
\`\`\`

**Signature**

\`\`\`ts
declare const foo: "foo"
\`\`\`

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L21)

Since v1.0.0`
        )
      }))
  })

  describe("parseFunctions", () => {
    it.effect("omits internal properties from signatures", () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseFunctions,
          `/**
           * @since 1.0.0
           */
          export const myfunc: (options: {
            readonly visible?: string
            /** @internal */
            readonly internal?: boolean
          }) => void = () => {}`,
          `## myfunc

**Signature**

\`\`\`ts
declare const myfunc: (options: { readonly visible?: string; }) => void
\`\`\`

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L4)

Since v1.0.0`
        )
      }))

    it.effect(`should remove all metadata from typedcript code blocks when the theme is ${Configuration.DEFAULT_THEME}`, () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseFunctions,
          `/**
         * \`\`\`ts skip-type-checking a=1 showLineNumbers=true
         * const a: string = 1
         * \`\`\`
         *
         * @since 1.0.0
         */
         export function myfunc<A>() {}`,
          `## myfunc

\`\`\`ts
const a: string = 1
\`\`\`

**Signature**

\`\`\`ts
declare const myfunc: <A>() => void
\`\`\`

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L8)

Since v1.0.0`
        )
      }))
    it.effect("generics", () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseFunctions,
          `/**
         * This is a description containing two links to {@link foo} and {@link bar}.
         *
         * @since 1.2.0
         */
        export function myfunc<A>() {}`,
          `## myfunc

This is a description containing two links to \`foo\` and \`bar\`.

**Signature**

\`\`\`ts
declare const myfunc: <A>() => void
\`\`\`

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L6)

Since v1.2.0`
        )
      }))

    it.effect("description", () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseFunctions,
          `/**
         * This is a description containing two links to {@link foo} and {@link bar}.
         *
         * @since 1.2.0
         */
        export function myfunc() {}`,
          `## myfunc

This is a description containing two links to \`foo\` and \`bar\`.

**Signature**

\`\`\`ts
declare const myfunc: () => void
\`\`\`

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L6)

Since v1.2.0`
        )
      }))

    it.effect("throws", () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseFunctions,
          `/**
         * description...
         * @throws \`Error1\` - Description 1
         * @throws \`Error2\` - Description 2
         * @since 1.2.0
         */
        export function myfunc() {}`,
          `## myfunc

description...

**Throws**

\`Error1\` - Description 1
\`Error2\` - Description 2

**Signature**

\`\`\`ts
declare const myfunc: () => void
\`\`\`

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L7)

Since v1.2.0`
        )
      }))

    it.effect("sees", () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseFunctions,
          `/**
         * description...
         * @see \`foo\` Description 1
         * @see {@link bar} Description 2
         * @see {@link baz quux} Description 2
         * @since 1.2.0
         */
        export function myfunc() {}`,
          `## myfunc

description...

**See**

- \`foo\` Description 1
- \`bar\` Description 2
- \`quux\` Description 2

**Signature**

\`\`\`ts
declare const myfunc: () => void
\`\`\`

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L8)

Since v1.2.0`
        )
      }))

    it.effect("example without fence", () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseFunctions,
          `/**
         * description...
         * @example
         * const x = 1
         * @since 1.0.0
         */
        export function myfunc() {}`,
          `## myfunc

description...

**Example**

\`\`\`ts
const x = 1
\`\`\`

**Signature**

\`\`\`ts
declare const myfunc: () => void
\`\`\`

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L7)

Since v1.0.0`
        )
      }))

    it.effect("example with backtick fence", () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseFunctions,
          `/**
         * description...
         * @example
         * \`\`\`ts
         * const x = 1
         * \`\`\`
         * @since 1.0.0
         */
        export function myfunc() {}`,
          `## myfunc

description...

**Example**

\`\`\`ts
const x = 1
\`\`\`

**Signature**

\`\`\`ts
declare const myfunc: () => void
\`\`\`

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L9)

Since v1.0.0`
        )
      }))

    it.effect("2 examples", () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseFunctions,
          `/**
         * description...
         * @example
         * \`\`\`ts
         * const x = 1
         * \`\`\`
         * @example
         * \`\`\`ts
         * const x = 2
         * \`\`\`
         * @since 1.0.0
         */
        export function myfunc() {}`,
          `## myfunc

description...

**Example**

\`\`\`ts
const x = 1
\`\`\`

**Example**

\`\`\`ts
const x = 2
\`\`\`

**Signature**

\`\`\`ts
declare const myfunc: () => void
\`\`\`

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L13)

Since v1.0.0`
        )
      }))

    it.effect("example with metas", () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseFunctions,
          `/**
         * description...
         * @example
         * \`\`\`ts a=1
         * const x = 1
         * \`\`\`
         * @since 1.0.0
         */
        export function myfunc() {}`,
          `## myfunc

description...

**Example**

\`\`\`ts a=1
const x = 1
\`\`\`

**Signature**

\`\`\`ts
declare const myfunc: () => void
\`\`\`

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L9)

Since v1.0.0`
        )
      }))

    it.effect("example with titde fence", () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseFunctions,
          `/**
         * description...
         * @example
         * ~~~ts
         * const x = 1
         * ~~~
         * @since 1.0.0
         */
        export function myfunc() {}`,
          `## myfunc

description...

**Example**

~~~ts
const x = 1
~~~

**Signature**

\`\`\`ts
declare const myfunc: () => void
\`\`\`

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L9)

Since v1.0.0`
        )
      }))

    it.effect("should not return private function declarations", () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseFunctions,
          `/**
         * description...
         */
        function myfunc() {}`,
          ""
        )
      }))

    it.effect("should not return ignored function declarations", () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseFunctions,
          `/**
         * @ignore
         */
        export function myfunc() {}`,
          ""
        )
      }))

    it.effect("should not return ignored function declarations with overloads", () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseFunctions,
          `/**
          * @ignore
          */
          export function sum(a: number, b: number)
          export function sum(a: number, b: number): number { return a + b }`,
          ""
        )
      }))

    it.effect("should not return internal function declarations", () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseFunctions,
          `/**
          * @internal
          */
          export function sum(a: number, b: number): number { return a + b }`,
          ""
        )
      }))

    it.effect("should not return internal function declarations even with overloads", () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseFunctions,
          `/**
          * @internal
          */
          export function sum(a: number, b: number)
          export function sum(a: number, b: number): number { return a + b }`,
          ""
        )
      }))

    it.effect("should not return private const function declarations", () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseFunctions,
          `const sum = (a: number, b: number): number => a + b `,
          ""
        )
      }))

    it.effect("should not return internal const function declarations", () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseFunctions,
          `/**
          * @internal
          */
          export const sum = (a: number, b: number): number => a + b `,
          ""
        )
      }))

    it.effect("should account for nullable polymorphic return types", () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseFunctions,
          `/**
          * @since 1.0.0
          */
         export const toNullable = <A>(ma: A | null): A | null => ma`,
          `## toNullable

**Signature**

\`\`\`ts
declare const toNullable: <A>(ma: A | null) => A | null
\`\`\`

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L4)

Since v1.0.0`
        )
      }))

    it.effect("should handle a const function declaration", () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseFunctions,
          `/**
          * a description...
          * @since 1.0.0
          * @example
          * assert.deepStrictEqual(f(1, 2), { a: 1, b: 2 })
          * @example
          * assert.deepStrictEqual(f(3, 4), { a: 3, b: 4 })
          * @deprecated
          */
          export const f = (a: number, b: number): { [key: string]: number } => ({ a, b })`,
          `## ~~f~~

a description...

**Example**

\`\`\`ts
assert.deepStrictEqual(f(1, 2), { a: 1, b: 2 })
\`\`\`

**Example**

\`\`\`ts
assert.deepStrictEqual(f(3, 4), { a: 3, b: 4 })
\`\`\`

**Signature**

\`\`\`ts
declare const f: (a: number, b: number) => { [key: string]: number; }
\`\`\`

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L10)

Since v1.0.0`
        )
      }))

    it.effect("should handle a function declaration", () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseFunctions,
          `/**
        * @since 1.0.0
        */
        export function f(a: number, b: number): { [key: string]: number } { return { a, b } }`,
          `## f

**Signature**

\`\`\`ts
declare const f: (a: number, b: number) => { [key: string]: number; }
\`\`\`

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L4)

Since v1.0.0`
        )
      }))

    it.effect("should handle overloadings", () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseFunctions,
          `/**
        * a description...
        * @since 1.0.0
        * @deprecated
        */
        export function f(a: Int, b: Int): { [key: string]: number }
        export function f(a: number, b: number): { [key: string]: number }
        export function f(a: any, b: any): { [key: string]: number } { return { a, b } }`,
          `## ~~f~~

a description...

**Signature**

\`\`\`ts
declare const f: { (a: Int, b: Int): { [key: string]: number; }; (a: number, b: number): { [key: string]: number; }; }
\`\`\`

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L8)

Since v1.0.0`
        )
      }))
  })

  describe("parseConstants", () => {
    it.effect("should handle a constant value", () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseConstants,
          `/**
          * a description...
          * @since 1.0.0
          * @deprecated
          */
          export const s: string = ''`,
          `## ~~s~~

a description...

**Signature**

\`\`\`ts
declare const s: string
\`\`\`

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L6)

Since v1.0.0`
        )
      }))

    it.effect("should support constants with default type parameters", () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseConstants,
          `/**
          * @since 1.0.0
          */
          export const left: <E = never, A = never>(l: E) => string = T.left`,
          `## left

**Signature**

\`\`\`ts
declare const left: <E = never, A = never>(l: E) => string
\`\`\`

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L4)

Since v1.0.0`
        )
      }))

    it.effect("should support untyped constants", () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseConstants,
          `
      class A {}
    /**
      * @since 1.0.0
      */
      export const empty = new A()`,
          `## empty

**Signature**

\`\`\`ts
declare const empty: A
\`\`\`

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L6)

Since v1.0.0`
        )
      }))

    it.effect("should handle constants with typeof annotations", () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseConstants,
          ` const task: { a: number } = {
        a: 1
      }
      /**
      * @since 1.0.0
      */
      export const taskSeq: typeof task = {
        ...task,
        ap: (mab, ma) => () => mab().then(f => ma().then(a => f(a)))
      }`,
          `## taskSeq

**Signature**

\`\`\`ts
declare const taskSeq: { a: number; }
\`\`\`

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L7)

Since v1.0.0`
        )
      }))

    it.effect("should not include variables declared in for loops", () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseConstants,
          ` const object = { a: 1, b: 2, c: 3 };

      for (const property in object) {
        console.log(property);
      }`,
          ""
        )
      }))
  })

  describe("parseTypeAliases", () => {
    it.effect("should return a type alias", () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseTypeAliases,
          `
        type None<A> = { readonly _tag: "None" }
        type Some<A> = { readonly _tag: "Some"; readonly value: A }
        /**
          * a description...
          * @since 1.0.0
          * @deprecated
          */
          export type Option<A> = None<A> | Some<A>`,
          `## ~~Option~~ (type alias)

a description...

**Signature**

\`\`\`ts
type Option<A> = None<A> | Some<A>
\`\`\`

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L9)

Since v1.0.0`
        )
      }))
  })

  describe("parseExports", () => {
    it.effect("should return no exports if the file is empty", () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseExports,
          "",
          ""
        )
      }))

    it.effect("should return an `Export`", () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseExports,
          `
        const a = 1;
        const b = 2;
        export {
          /**
           * description_of_a
           * \`\`\`ts
           * const a: string = 1
           * \`\`\`
           *
           * @since 1.0.0
           */
          a,
          /**
           * description_of_b
           * @since 2.0.0
           */
          b
        }`,
          `## a

description_of_a
\`\`\`ts
const a: string = 1
\`\`\`

**Signature**

\`\`\`ts
declare const a: 1
\`\`\`

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L13)

Since v1.0.0
## b

description_of_b

**Signature**

\`\`\`ts
declare const b: 2
\`\`\`

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L18)

Since v2.0.0`
        )
      }))

    it.effect("should handle renamimg", () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseExports,
          `const a = 1;
        export {
          /**
            * @since 1.0.0
            */
            a as b
          }`,
          `## b

**Signature**

\`\`\`ts
declare const b: 1
\`\`\`

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L6)

Since v1.0.0`
        )
      }))

    it.effect("should handle a single re-export", () =>
      Effect.gen(function*() {
        project.createSourceFile("a.ts", `export const a = 1`)
        const sourceFile = project.createSourceFile(
          "b.ts",
          `import { a } from './a'
        const b = a
        export {
          /**
            * @since 1.0.0
            */
          b
        }`
        )
        const actual = yield* Effect.exit(Parser.parseExports.pipe(
          Effect.provideService(Parser.Source, makeSource(sourceFile)),
          Effect.provideService(Configuration.Configuration, defaultConfig)
        ))
        assert.deepStrictEqual(
          actual,
          Exit.succeed([
            new Domain.Export(
              "b",
              new Domain.Doc(
                undefined,
                ["1.0.0"],
                [],
                [],
                [],
                [],
                [],
                {
                  "since": ["1.0.0"]
                }
              ),
              "declare const b: 1",
              {
                "column": 11,
                "line": 7
              },
              false
            )
          ])
        )
      }))

    it.effect("should handle `export * from ...`", () =>
      Effect.gen(function*() {
        project.createSourceFile("example.ts", `export const a = 1`, { overwrite: true })

        const sourceFile = project.createSourceFile(
          "export-all.ts",
          `
         /**
          * @since 1.0.0
          */
         export * from './example'
        `
        )

        const actual = yield* Effect.exit(Parser.parseExports.pipe(
          Effect.provideService(Parser.Source, makeSource(sourceFile)),
          Effect.provideService(Configuration.Configuration, defaultConfig)
        ))

        assert.deepStrictEqual(
          actual,
          Exit.succeed([
            new Domain.Export(
              "'./example'",
              new Domain.Doc(
                "Re-exports all named exports from the './example' module.",
                ["1.0.0"],
                [],
                [],
                [],
                [],
                [],
                {
                  "since": ["1.0.0"]
                }
              ),
              "export * from './example'",
              {
                "column": 10,
                "line": 5
              },
              true
            )
          ])
        )
      }))

    it.effect("should handle `export * as ... from ...`", () =>
      Effect.gen(function*() {
        project.createSourceFile("example.ts", `export const a = 1`, { overwrite: true })

        const sourceFile = project.createSourceFile(
          "export-all-namespace.ts",
          `
          /**
           * @since 1.0.0
           */
          export * as example from './example'
        `
        )

        const actual = yield* Effect.exit(Parser.parseExports.pipe(
          Effect.provideService(Parser.Source, makeSource(sourceFile)),
          Effect.provideService(Configuration.Configuration, defaultConfig)
        ))

        assert.deepStrictEqual(
          actual,
          Exit.succeed([
            new Domain.Export(
              "example",
              new Domain.Doc(
                "Re-exports all named exports from the './example' module as `example`.",
                ["1.0.0"],
                [],
                [],
                [],
                [],
                [],
                {
                  "since": ["1.0.0"]
                }
              ),
              "export * as example from './example'",
              {
                "column": 11,
                "line": 5
              },
              true
            )
          ])
        )
      }))
  })

  describe("parseInterfaces", () => {
    it.effect("should return no interfaces if the file is empty", () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseInterfaces,
          "",
          ""
        )
      }))

    it.effect("should return no interfaces if there are no exported interfaces", () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseInterfaces,
          "interface A {}",
          ""
        )
      }))

    it.effect("should return an interface", () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseInterfaces,
          `/**
      * a description...
      * @since 1.0.0
      * @deprecated
      */
      export interface A {}`,
          `## ~~A~~ (interface)

a description...

**Signature**

\`\`\`ts
export interface A {}
\`\`\`

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L6)

Since v1.0.0`
        )
      }))
  })

  describe("parseNamespaces", () => {
    it.effect("should return no namespaces if the file is empty", () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseNamespaces,
          "",
          ""
        )
      }))

    it.effect("should return no namespaces if there are no exported namespaces", () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseNamespaces,
          "namespace A {}",
          ""
        )
      }))

    it.effect("should parse an empty Namespace", () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseNamespaces,
          `
      /**
       * @since 1.0.0
       */
      export namespace A {}
      `,
          `## A (namespace)

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L5)

Since v1.0.0`
        )
      }))

    describe("namespace > interfaces", () => {
      it.effect("should ignore not exported interfaces", () =>
        Effect.gen(function*() {
          yield* expectMarkdown(
            Parser.parseNamespaces,
            `
        /**
         * @since 1.0.0
         */
        export namespace A {
          interface C {}
        }
        `,
            `## A (namespace)

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L5)

Since v1.0.0`
          )
        }))

      it.effect("should parse an interface", () =>
        Effect.gen(function*() {
          yield* expectMarkdown(
            Parser.parseNamespaces,
            `
/**
 * @since 1.0.0
 */
export namespace A {
  /**
   * @since 1.0.1
   */
  export interface B {
    readonly d: boolean
  }
}
        `,
            `## A (namespace)

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L5)

Since v1.0.0

### B (interface)

**Signature**

\`\`\`ts
export interface B {
    readonly d: boolean
  }
\`\`\`

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L9)

Since v1.0.1`
          )
        }))
    })

    describe("namespace > type aliases", () => {
      it.effect("should ignore not exported type aliases", () =>
        Effect.gen(function*() {
          yield* expectMarkdown(
            Parser.parseNamespaces,
            `
        /**
         * @since 1.0.0
         */
        export namespace A {
          type C = number
        }
        `,
            `## A (namespace)

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L5)

Since v1.0.0`
          )
        }))

      it.effect("should parse a type alias", () =>
        Effect.gen(function*() {
          yield* expectMarkdown(
            Parser.parseNamespaces,
            `
        /**
         * @since 1.0.0
         */
        export namespace A {
          /**
           * @since 1.0.1
           */
          export type B = string
        }
        `,
            `## A (namespace)

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L5)

Since v1.0.0

### B (type alias)

**Signature**

\`\`\`ts
type B = string
\`\`\`

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L9)

Since v1.0.1`
          )
        }))
    })

    describe("namespace > nested namespaces", () => {
      it.effect("should ignore not exported namespaces", () =>
        Effect.gen(function*() {
          yield* expectMarkdown(
            Parser.parseNamespaces,
            `
        /**
         * @since 1.0.0
         */
        export namespace A {
          namespace B {}
        }
        `,
            `## A (namespace)

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L5)

Since v1.0.0`
          )
        }))

      it.effect("should parse a namespace", () =>
        Effect.gen(function*() {
          yield* expectMarkdown(
            Parser.parseNamespaces,
            `
        /**
         * @since 1.0.0
         */
        export namespace A {
          /**
           * @since 1.0.1
           */
          export namespace B {
            /**
             * @since 1.0.2
             */
            export type C = string
          }
        }
        `,
            `## A (namespace)

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L5)

Since v1.0.0

### B (namespace)

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L9)

Since v1.0.1

#### C (type alias)

**Signature**

\`\`\`ts
type C = string
\`\`\`

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L13)

Since v1.0.2`
          )
        }))
    })
  })

  describe("parseClasses", () => {
    it.effect("should ignore `@internal` classes", () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseClasses,
          `/** @internal */export class MyClass {}`,
          ""
        )
      }))

    it.effect("should ignore `@ignore` classes", () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseClasses,
          `
        /** @ignore */
        export class MyClass {}
        `,
          ""
        )
      }))

    it.effect("should ignore not exported classes", () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseClasses,
          `
        class MyClass {}
        `,
          ""
        )
      }))

    it.effect("should skip ignored properties", () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseClasses,
          `/**
      * @since 1.0.0
      */
      export class MyClass<A> {
        /**
         * @ignore
         */
        readonly _A!: A
      }`,
          `## MyClass (class)

**Signature**

\`\`\`ts
declare class MyClass<A>
\`\`\`

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L4)

Since v1.0.0`
        )
      }))

    it.effect("should skip the constructor body", () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseClasses,
          `/**
      * description
      * @since 1.0.0
      */
      export class C { constructor() {} }`,
          `## C (class)

description

**Signature**

\`\`\`ts
declare class C { constructor() }
\`\`\`

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L5)

Since v1.0.0`
        )
      }))

    it("should get a constructor declaration signature", () => {
      const sourceFile = project.createSourceFile(
        `test-${testCounter++}.ts`,
        `
      /**
       * @since 1.0.0
       */
      declare class A {
        constructor()
      }
    `
      )

      const constructorDeclaration = sourceFile
        .getClass("A")!
        .getConstructors()[0]

      assert.deepStrictEqual(
        Parser.getConstructorDeclarationSignature(constructorDeclaration),
        "constructor()"
      )
    })

    it.effect("should handle non-readonly properties", () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseClasses,
          `/**
      * description
      * @since 1.0.0
      */
      export class C {
        /**
         * @since 1.0.0
         */
        a: string
      }`,
          `## C (class)

description

**Signature**

\`\`\`ts
declare class C
\`\`\`

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L5)

Since v1.0.0

### a (property)

**Signature**

\`\`\`ts
a: string
\`\`\`

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L9)

Since v1.0.0`
        )
      }))

    it.effect("should return a `Class`", () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseClasses,
          `/**
      * a class description...
      * @since 1.0.0
      * @deprecated
      */
      export class Test {
        /**
         * a property...
         * @since 1.1.0
         * @deprecated
         */
        readonly a: string
        private readonly b: number
        /**
         * a static method description...
         * @since 1.1.0
         * @deprecated
         */
        static f(): void {}
        constructor(readonly value: string) { }
        /**
         * a method description...
         * @since 1.1.0
         * @deprecated
         */
        g(a: number, b: number): { [key: string]: number } {
          return { a, b }
        }
      }`,
          `## ~~Test~~ (class)

a class description...

**Signature**

\`\`\`ts
declare class Test { constructor(readonly value: string) }
\`\`\`

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L6)

Since v1.0.0

### ~~f~~ (static method)

a static method description...

**Signature**

\`\`\`ts
declare const f: () => void
\`\`\`

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L19)

Since v1.1.0

### ~~g~~ (method)

a method description...

**Signature**

\`\`\`ts
declare const g: (a: number, b: number) => { [key: string]: number; }
\`\`\`

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L26)

Since v1.1.0

### ~~a~~ (property)

a property...

**Signature**

\`\`\`ts
readonly a: string
\`\`\`

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L12)

Since v1.1.0`
        )
      }))

    it.effect("should handle method overloadings", () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseClasses,
          `/**
      * a class description...
      * @since 1.0.0
      * @deprecated
      */
      export class Test<A> {
        /**
         * a static method description...
         * @since 1.1.0
         * @deprecated
         */
        static f(x: number): number
        static f(x: string): string
        static f(x: any): any {}
        constructor(readonly value: A) { }
        /**
         * a method description...
         * @since 1.1.0
         * @deprecated
         */
        map(f: (a: number) => number): Test
        map(f: (a: string) => string): Test
        map(f: (a: any) => any): any {
          return new Test(f(this.value))
        }
      }`,
          `## ~~Test~~ (class)

a class description...

**Signature**

\`\`\`ts
declare class Test<A> { constructor(readonly value: A) }
\`\`\`

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L6)

Since v1.0.0

### ~~f~~ (static method)

a static method description...

**Signature**

\`\`\`ts
declare const f: { (x: number): number; (x: string): string; }
\`\`\`

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L14)

Since v1.1.0

### ~~map~~ (method)

a method description...

**Signature**

\`\`\`ts
declare const map: { (f: (a: number) => number): Test; (f: (a: string) => string): Test; }
\`\`\`

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L23)

Since v1.1.0`
        )
      }))

    it.effect("should ignore internal/ignored methods (#42)", () =>
      Effect.gen(function*() {
        yield* expectMarkdown(
          Parser.parseClasses,
          `/**
      * a class description...
      * @since 1.0.0
      */
      export class Test<A> {
        /**
         * @since 0.0.1
         * @internal
         **/
        private foo(): void {}
        /**
         * @since 0.0.1
         * @ignore
         **/
        private bar(): void {}
      }`,
          `## Test (class)

a class description...

**Signature**

\`\`\`ts
declare class Test<A>
\`\`\`

[Source](https://github.com/effect-ts/docgen/blob/main/src/test.ts#L5)

Since v1.0.0`
        )
      }))
  })

  describe("parseFile", () => {
    it.effect("should not parse a non-existent file", () =>
      Effect.gen(function*() {
        const file = new Domain.File("non-existent.ts", "")
        const project = new ast.Project({ useInMemoryFileSystem: true })

        assert.deepStrictEqual(
          yield* Effect.exit(
            Parser.parseFile(project)(file).pipe(
              Effect.provideService(Configuration.Configuration, defaultConfig),
              Effect.provide(Path.layer)
            )
          ),
          Exit.fail(["Unable to locate file: non-existent.ts"])
        )
      }))
  })

  describe("utils", () => {
    it("parseComment", () => {
      assert.deepStrictEqual(Parser.parseComment(""), {
        description: undefined,
        tags: {}
      })

      assert.deepStrictEqual(Parser.parseComment("/** description */"), {
        description: "description",
        tags: {}
      })

      assert.deepStrictEqual(
        Parser.parseComment("/** description\n * @since 1.0.0\n */"),
        {
          description: "description",
          tags: {
            since: ["1.0.0"]
          }
        }
      )

      assert.deepStrictEqual(
        Parser.parseComment("/** description\n * @deprecated\n */"),
        {
          description: "description",
          tags: {
            deprecated: [""]
          }
        }
      )

      assert.deepStrictEqual(
        Parser.parseComment("/** description\n * @category instance\n */"),
        {
          description: "description",
          tags: {
            category: ["instance"]
          }
        }
      )
    })
  })
})
