import { computeJSDocInputHash, extractJSDocsSync, loadJSDocConfig, parseJSDoc } from "@effect/jsdocs"
import { assert, describe, it } from "@effect/vitest"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import * as ts from "typescript"

interface SourceFileWithParseDiagnostics extends ts.SourceFile {
  readonly parseDiagnostics: ReadonlyArray<ts.Diagnostic>
}

const stabilityResult = (tag: string) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "jsdocs-stability-"))
  try {
    fs.mkdirSync(path.join(cwd, "src"))
    fs.writeFileSync(
      path.join(cwd, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { module: "NodeNext", moduleResolution: "NodeNext", target: "ES2022" },
        include: ["src/**/*.ts"]
      })
    )
    fs.writeFileSync(
      path.join(cwd, "package.json"),
      JSON.stringify({
        name: "@effect/sample",
        type: "module",
        exports: { ".": "./src/index.ts", "./*": "./src/*.ts" }
      })
    )
    fs.writeFileSync(
      path.join(cwd, "src/index.ts"),
      `/**
 * @stability stable
 * @since 1.0.0
 */
export * as Foo from "./Foo.ts"\n`
    )
    fs.writeFileSync(
      path.join(cwd, "src/Foo.ts"),
      `/**
 * Creates a value.
 *
 * ${tag}
 * @category constructors
 * @since 1.0.0
 */
export const makeValue = () => 1
`
    )
    const model = extractJSDocsSync({
      cwd,
      tsconfig: "tsconfig.json",
      include: ["src/**/*.ts"],
      output: ".data/jsdocs.json"
    })
    return {
      diagnostics: model.files.flatMap((file) => file.diagnostics.map((diagnostic) => diagnostic.code)),
      stability: model.apis.find((api) => api.apiFqn === "@effect/sample/Foo.makeValue")?.tags.stability
    }
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true })
  }
}

const missingStabilityDiagnostics = (files: Record<string, string>, moduleStability = "@stability stable") => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "jsdocs-require-stability-"))
  try {
    fs.mkdirSync(path.join(cwd, "src"))
    fs.writeFileSync(
      path.join(cwd, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { module: "NodeNext", moduleResolution: "NodeNext", target: "ES2022" },
        include: ["src/**/*.ts"]
      })
    )
    fs.writeFileSync(
      path.join(cwd, "package.json"),
      JSON.stringify({ name: "@effect/sample", type: "module", exports: { "./*": "./src/*.ts" } })
    )
    for (const [file, source] of Object.entries(files)) {
      fs.writeFileSync(
        path.join(cwd, "src", file),
        `/**
 * Module.
 *
 * ${moduleStability}
 * @since 1.0.0
 */
import type {} from "node:fs"

${source}`
      )
    }
    const model = extractJSDocsSync({ cwd, tsconfig: "tsconfig.json", include: ["src/**/*.ts"], output: "out.json" })
    return Object.fromEntries(
      Object.keys(files).map((file) => [
        file,
        model.files.find((modelFile) => modelFile.file === `src/${file}`)?.diagnostics.map((item) => item.message) ??
          []
      ])
    )
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true })
  }
}

const signatureParseDiagnostics = (signature: string): ReadonlyArray<string> =>
  (ts.createSourceFile(
    "signature.ts",
    signature,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  ) as SourceFileWithParseDiagnostics)
    .parseDiagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"))

describe("jsdocs", () => {
  it("parses a raw JSDoc block", () => {
    const result = parseJSDoc(`/**
 * Creates a value.
 *
 * @category constructors
 * @since 1.0.0
 */`)
    assert.strictEqual(result._tag, "Success")
    if (result._tag === "Success") {
      assert.strictEqual(result.value.description.short, "Creates a value.")
    }
  })

  it("accepts unstable declarations", () => {
    const result = parseJSDoc(`/**
 * Creates an unstable value.
 *
 * @stability unstable
 * @category constructors
 * @since 1.0.0
 */`)
    assert.strictEqual(result._tag, "Success")
  })

  it("accepts experimental declarations", () => {
    assert.deepStrictEqual(stabilityResult("@stability experimental"), {
      diagnostics: [],
      stability: "experimental"
    })
  })

  it("accepts explicit stable declarations", () => {
    assert.deepStrictEqual(stabilityResult("@stability stable"), {
      diagnostics: [],
      stability: "stable"
    })
  })

  it("rejects unknown stability values", () => {
    assert.deepStrictEqual(stabilityResult("@stability bogus").diagnostics, ["invalid-stability"])
  })

  it("requires @stability on directly importable declarations", () => {
    assert.deepStrictEqual(
      missingStabilityDiagnostics({
        "Declaration.ts": `/**
 * A value.
 *
 * @category constructors
 * @since 1.0.0
 */
export const value = 1
`,
        "Specifier.ts": `const value = 1

export {
  /**
   * A value.
   *
   * @category constructors
   * @since 1.0.0
   */
  value
}
`,
        "Namespace.ts": `/**
 * A group.
 *
 * @category models
 * @since 1.0.0
 */
export declare namespace Group {}
`,
        "Nested.ts": `/**
 * A group.
 *
 * @stability stable
 * @category models
 * @since 1.0.0
 */
export declare namespace Group {
  /**
   * Declarations inside a namespace do not require a stability tag.
   *
   * @category models
   * @since 1.0.0
   */
  export interface Item {
    /**
     * Members do not require a stability tag.
     */
    readonly id: string
  }
}
`
      }),
      {
        "Declaration.ts": ["Public JSDoc must include @stability"],
        "Specifier.ts": ["Public JSDoc must include @stability"],
        "Namespace.ts": ["Public JSDoc must include @stability"],
        "Nested.ts": []
      }
    )
  })

  it("requires @stability on module JSDoc", () => {
    assert.deepStrictEqual(missingStabilityDiagnostics({ "Module.ts": "" }, "Has no stability tag."), {
      "Module.ts": ["Module JSDoc must include @stability"]
    })
  })

  it("requires @stability on namespace re-exports", () => {
    assert.deepStrictEqual(
      missingStabilityDiagnostics({
        "Missing.ts": `/**
 * Re-exports a module.
 *
 * @category exports
 * @since 1.0.0
 */
export * as Target from "./Target.ts"
`,
        "Tagged.ts": `/**
 * Re-exports a module.
 *
 * @stability stable
 * @category exports
 * @since 1.0.0
 */
export * as Target from "./Target.ts"
`,
        "Target.ts": `/**
 * A value.
 *
 * @stability stable
 * @category constructors
 * @since 1.0.0
 */
export const value = 1
`
      }),
      {
        "Missing.ts": ["Public JSDoc must include @stability"],
        "Tagged.ts": [],
        "Target.ts": []
      }
    )
  })

  it("checks hand-maintained public index exports with the repository JSDoc config", () => {
    const config = loadJSDocConfig(path.resolve(import.meta.dirname, "../../../.."))
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "jsdocs-public-index-"))
    try {
      const packageRoot = path.join(cwd, "packages/atom/vue")
      fs.mkdirSync(path.join(packageRoot, "src"), { recursive: true })
      fs.writeFileSync(
        path.join(cwd, config.tsconfig),
        JSON.stringify({
          compilerOptions: { module: "NodeNext", moduleResolution: "NodeNext", target: "ES2022" },
          include: ["packages/**/src/**/*.ts"]
        })
      )
      fs.writeFileSync(
        path.join(packageRoot, "package.json"),
        JSON.stringify({ name: "@effect/atom-vue", type: "module", exports: { ".": "./src/index.ts" } })
      )
      fs.writeFileSync(
        path.join(packageRoot, "src/index.ts"),
        `/**
 * Public entry point.
 *
 * @stability unstable
 * @since 1.0.0
 */
import type {} from "node:fs"

/**
 * A directly importable value.
 *
 * @category constructors
 * @since 1.0.0
 */
export const value = 1
`
      )
      const model = extractJSDocsSync({ ...config, cwd })
      assert.deepStrictEqual(
        model.files.find((file) => file.file === "packages/atom/vue/src/index.ts")?.diagnostics
          .filter((diagnostic) => diagnostic.code === "missing-tag")
          .map((diagnostic) => diagnostic.message),
        ["Public JSDoc must include @stability"]
      )
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true })
    }
  })

  it("rejects duplicate stability tags", () => {
    assert.deepStrictEqual(stabilityResult("@stability unstable\n * @stability unstable").diagnostics, [
      "duplicate-tag"
    ])
  })

  it("rejects legacy unstable tags", () => {
    assert.deepStrictEqual(stabilityResult("@unstable").diagnostics, ["forbidden-tag", "missing-tag"])
  })

  it("accepts doctest metadata on TypeScript fences", () => {
    const result = parseJSDoc(`/**
 * Creates a value.
 *
 * **Example** (Creating a value)
 *
 * \`\`\`ts import.meta.vitest name="creates a value"
 * const value = 1
 * \`\`\`
 *
 * @category constructors
 * @since 1.0.0
 */`)
    assert.strictEqual(result._tag, "Success")
  })

  it("accepts practical When to use forms", () => {
    const result = parseJSDoc(`/**
 * Creates a value.
 *
 * **When to use**
 *
 * Use to create a value when construction should be explicit.
 *
 * @category constructors
 * @since 1.0.0
 */`)
    assert.strictEqual(result._tag, "Success")
    if (result._tag === "Success") {
      assert.strictEqual(
        result.value.description.whenToUse,
        "Use to create a value when construction should be explicit."
      )
    }
  })

  it("flags unsupported When to use forms", () => {
    const result = parseJSDoc(`/**
 * Creates a value.
 *
 * **When to use**
 *
 * - Creating a value when construction should be explicit.
 *
 * @category constructors
 * @since 1.0.0
 */`)
    assert.strictEqual(result._tag, "Failure")
    if (result._tag === "Failure") {
      assert.deepStrictEqual(
        result.error.diagnostics.map((diagnostic) => diagnostic.code),
        ["when-to-use-format"]
      )
    }
  })

  it("refreshes extracted docs after a source change", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "jsdocs-"))
    fs.mkdirSync(path.join(cwd, "src"), { recursive: true })
    fs.writeFileSync(
      path.join(cwd, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { module: "NodeNext", moduleResolution: "NodeNext", target: "ES2022" },
        include: ["src/**/*.ts"]
      })
    )
    fs.writeFileSync(
      path.join(cwd, "package.json"),
      JSON.stringify({
        name: "@effect/sample",
        type: "module",
        exports: { ".": "./src/index.ts", "./*": "./src/*.ts" }
      })
    )
    fs.writeFileSync(
      path.join(cwd, "src/index.ts"),
      `/**
 * @stability stable
 * @since 1.0.0
 */
export * as Foo from "./Foo.ts"\n`
    )
    fs.writeFileSync(
      path.join(cwd, "src/Foo.ts"),
      `/**
 * Creates a value.
 *
 * @stability stable
 * @category constructors
 * @since 1.0.0
 */
export const makeValue = () => 1
`
    )
    const options = {
      cwd,
      tsconfig: "tsconfig.json",
      include: ["src/**/*.ts"],
      output: ".data/jsdocs.json"
    }
    const model = extractJSDocsSync(options)
    assert.strictEqual(model.version, 3)
    assert.deepStrictEqual(model.files.map((file) => file.file), ["src/Foo.ts", "src/index.ts"])
    const index = model.files.find((file) => file.file === "src/index.ts")
    assert.deepStrictEqual(index?.diagnostics, [])
    assert.strictEqual(index?.namespaces[0]?.name, "Foo")
    assert.strictEqual(model.apis.some((api) => api.apiFqn === "@effect/sample.Foo"), true)
    assert.strictEqual(model.files[0]?.declarations[0]?.name, "makeValue")
    assert.strictEqual(model.apis[0]?.apiFqn, "@effect/sample/Foo.makeValue")
    assert.deepStrictEqual(model.apis[0]?.importGuidance, {
      style: "namespace-barrel",
      importDeclaration: "import { Foo } from \"@effect/sample\"",
      usage: "Foo.makeValue"
    })

    const sourcePath = path.join(cwd, "src/Foo.ts")
    fs.writeFileSync(sourcePath, fs.readFileSync(sourcePath, "utf8").replaceAll("makeValue", "makeUpdatedValue"))
    const updated = extractJSDocsSync(options)
    assert.strictEqual(updated.files[0]?.declarations[0]?.name, "makeUpdatedValue")
  })

  it("stores a stable input hash for cache checks", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "jsdocs-"))
    fs.mkdirSync(path.join(cwd, "src"), { recursive: true })
    fs.writeFileSync(
      path.join(cwd, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { module: "NodeNext", moduleResolution: "NodeNext", target: "ES2022" },
        include: ["src/**/*.ts"]
      })
    )
    fs.writeFileSync(
      path.join(cwd, "jsdocs.config.json"),
      JSON.stringify({
        tsconfig: "tsconfig.json",
        include: ["src/**/*.ts"],
        output: ".data/jsdocs.json"
      })
    )
    fs.writeFileSync(
      path.join(cwd, "package.json"),
      JSON.stringify({
        name: "@effect/sample",
        type: "module",
        exports: { ".": "./src/index.ts", "./*": "./src/*.ts" }
      })
    )
    fs.writeFileSync(
      path.join(cwd, "src/index.ts"),
      `/**
 * @stability stable
 * @since 1.0.0
 */
export * as Foo from "./Foo.ts"\n`
    )
    fs.writeFileSync(
      path.join(cwd, "src/Foo.ts"),
      `/**
 * Creates a value.
 *
 * @stability stable
 * @category constructors
 * @since 1.0.0
 */
export const makeValue = () => 1
`
    )
    const options = {
      cwd,
      tsconfig: "tsconfig.json",
      include: ["src/**/*.ts"],
      output: ".data/jsdocs.json"
    }
    const inputHash = computeJSDocInputHash(options)
    const model = extractJSDocsSync(options)
    assert.strictEqual(model.inputHash, inputHash)
    assert.strictEqual(computeJSDocInputHash(options), inputHash)

    fs.appendFileSync(path.join(cwd, "src/Foo.ts"), "\n")
    assert.notStrictEqual(computeJSDocInputHash(options), inputHash)
  })

  it("extracts typechecker signatures for top-level functions", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "jsdocs-"))
    fs.mkdirSync(path.join(cwd, "src"), { recursive: true })
    fs.writeFileSync(
      path.join(cwd, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { module: "NodeNext", moduleResolution: "NodeNext", target: "ES2022" },
        include: ["src/**/*.ts"]
      })
    )
    fs.writeFileSync(
      path.join(cwd, "package.json"),
      JSON.stringify({
        name: "@effect/sample",
        type: "module",
        exports: { ".": "./src/index.ts", "./*": "./src/*.ts" }
      })
    )
    fs.writeFileSync(
      path.join(cwd, "src/index.ts"),
      `/**
 * @stability stable
 * @since 1.0.0
 */
export * as Foo from "./Foo.ts"\n`
    )
    fs.writeFileSync(
      path.join(cwd, "src/External.ts"),
      `/**
 * External value type.
 *
 * @stability stable
 * @category models
 * @since 1.0.0
 */
export interface External {
  readonly value: string
}

/**
 * Makes an external value.
 *
 * @stability stable
 * @category constructors
 * @since 1.0.0
 */
export const makeExternal = (value: string): External => ({ value })
`
    )
    fs.writeFileSync(
      path.join(cwd, "src/Foo.ts"),
      `/**
 * Parses a value.
 *
 * @stability stable
 * @category parsing
 * @since 1.0.0
 */
export function parse(value: string): string
export function parse(value: number): number
export function parse(value: string | number) {
  return value
}

/**
 * Converts a value.
 *
 * @stability stable
 * @category constructors
 * @since 1.0.0
 */
export const inferred = (value: number) => String(value)

const aliased = (value: boolean) => !value

export {
  /**
   * Negates a value.
   *
   * @stability stable
   * @category constructors
   * @since 1.0.0
   */
  aliased as renamed
}

export {
  /**
   * Makes an external value.
   *
   * @stability stable
   * @category constructors
   * @since 1.0.0
   */
  makeExternal as external
} from "./External.ts"

const attempt = (value: string) => value.length

export {
  /**
   * Attempts a value.
   *
   * @stability stable
   * @category constructors
   * @since 1.0.0
   */
  attempt as try
}

/**
 * Handles many overloads.
 *
 * @stability stable
 * @category constructors
 * @since 1.0.0
 */
export function many(value: 1): 1
export function many(value: 2): 2
export function many(value: 3): 3
export function many(value: 4): 4
export function many(value: 5): 5
export function many(value: 6): 6
export function many(value: 7): 7
export function many(value: 8): 8
export function many(value: 9): 9
export function many(value: 10): 10
export function many(value: 11): 11
export function many(value: 12): 12
export function many(value: 13): 13
export function many(value: number) {
  return value
}

/**
 * Runs a value through a transform chain.
 *
 * @stability stable
 * @category constructors
 * @since 1.0.0
 */
export function pipeline<A>(a: A): A
export function pipeline<A, B>(a: A, ab: (a: A) => B): B
export function pipeline<A, B, C>(a: A, ab: (a: A) => B, bc: (b: B) => C): C
export function pipeline<A, B, C, D>(a: A, ab: (a: A) => B, bc: (b: B) => C, cd: (c: C) => D): D
export function pipeline<A, B, C, D, E>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E
): E
export function pipeline<A, B, C, D, E, F>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F
): F
export function pipeline<A, B, C, D, E, F, G>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F,
  fg: (f: F) => G
): G
export function pipeline<A, B, C, D, E, F, G, H>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F,
  fg: (f: F) => G,
  gh: (g: G) => H
): H
export function pipeline<A, B, C, D, E, F, G, H, I>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F,
  fg: (f: F) => G,
  gh: (g: G) => H,
  hi: (h: H) => I
): I
export function pipeline(...args: Array<any>) {
  return args.length === 1 ? args[0] : args.slice(1).reduce((value, f) => f(value), args[0])
}

interface Box<in out A> {}

declare namespace Box {
  export type Inner<A extends Box<any>> = A extends Box<infer T> ? T : never
}

interface Check<A> {}

interface Ctor<A extends Box<any>> {
  (value: Box.Inner<A>): A
}

/**
 * Builds a boxed constructor.
 *
 * @stability stable
 * @category constructors
 * @since 1.0.0
 */
export function boxed<A extends Box<any>>(
  ...value: readonly [Check<Box.Inner<A>>, ...Array<Check<Box.Inner<A>>>]
): Ctor<A> {
  return null as any
}

/**
 * Handles distinct overload modes.
 *
 * @stability stable
 * @category constructors
 * @since 1.0.0
 */
export function modes(body: () => string): string
export function modes(body: (value: number) => string): string
export function modes(body: (this: string) => string): string
export function modes(body: () => string, map: (value: string) => number): number
export function modes(body: () => string, map: (value: string) => number, next: (value: number) => boolean): boolean
export function modes(options: { readonly self: string }, body: (this: string) => string): string
export function modes(name: string): (body: () => string) => string
export function modes(self: string, body: () => string): string
export function modes(predicate: (value: number) => boolean, body: () => number): number
export function modes(refinement: (value: string | number) => value is string, body: () => string): string
export function modes(...args: Array<any>) {
  return args[0]
}

/**
 * Service for sample values.
 *
 * @stability stable
 * @category services
 * @since 1.0.0
 */
export class Service {
  readonly value: string
  /**
   * Runs the service.
   */
  run(input: number): string {
    return \`\${this.value}:\${input}\`
  }
}

/**
 * Default count.
 *
 * @stability stable
 * @category constants
 * @since 1.0.0
 */
export const count = 1

/**
 * Sample value type.
 *
 * @stability stable
 * @category models
 * @since 1.0.0
 */
export interface Sample {
  readonly value: string
}
`
    )
    const model = extractJSDocsSync({
      cwd,
      tsconfig: "tsconfig.json",
      include: ["src/**/*.ts"],
      output: ".data/jsdocs.json"
    })
    const signatureByName = new Map(model.apis.map((api) => [api.apiName, api.signature]))
    assert.deepStrictEqual(model.files.flatMap((file) => file.diagnostics), [])
    for (const api of model.apis) {
      if (api.signature !== null) {
        const diagnostics = signatureParseDiagnostics(api.signature)
        if (diagnostics.length > 0) {
          assert.fail(`${api.apiName}: ${diagnostics.join(", ")}`)
        }
      }
    }
    assert.strictEqual(
      signatureByName.get("parse"),
      "declare function parse(value: string): string\ndeclare function parse(value: number): number"
    )
    assert.strictEqual(signatureByName.get("inferred"), "declare function inferred(value: number): string")
    assert.strictEqual(signatureByName.get("renamed"), "declare function renamed(value: boolean): boolean")
    assert.strictEqual(
      signatureByName.get("try"),
      `declare const _try: {
  (value: string): number;
}
export { _try as try }`
    )
    assert.strictEqual(signatureByName.get("external"), "declare function external(value: string): External")
    const manyLines = signatureByName.get("many")?.split("\n")
    assert.strictEqual(manyLines?.length, 1)
    assert.strictEqual(manyLines?.[0], "declare function many(value: 1): 1")
    const pipelineLines = signatureByName.get("pipeline")?.split("\n") ?? []
    assert.strictEqual(pipelineLines.length, 6)
    assert.deepStrictEqual(pipelineLines.map((line) => line.match(/=>/g)?.length ?? 0), [0, 1, 2, 3, 4, 8])
    const boxedSignature = signatureByName.get("boxed")
    assert.strictEqual(
      boxedSignature,
      "declare const boxed: <A extends Box<any>>(value_0: Check<Box.Inner<A>>, ...value: Check<Box.Inner<A>>[]) => Ctor<A>"
    )
    const modeLines = signatureByName.get("modes")?.split("\n")
    assert.deepStrictEqual(modeLines, [
      "declare function modes(body: () => string): string",
      "declare function modes(body: (this: string) => string): string",
      "declare function modes(body: () => string, map: (value: string) => number): number",
      "declare function modes(options: { readonly self: string; }, body: (this: string) => string): string",
      "declare function modes(name: string): (body: () => string) => string",
      "declare function modes(self: string, body: () => string): string",
      "declare function modes(predicate: (value: number) => boolean, body: () => number): number",
      "declare function modes(refinement: (value: string | number) => value is string, body: () => string): string"
    ])
    assert.strictEqual(signatureByName.get("Service"), null)
    assert.strictEqual(signatureByName.get("Service.run"), null)
    assert.strictEqual(signatureByName.get("count"), null)
    assert.strictEqual(signatureByName.get("Sample"), null)
  })

  it("stores valid top-of-file module JSDoc", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "jsdocs-"))
    fs.mkdirSync(path.join(cwd, "src"), { recursive: true })
    fs.writeFileSync(
      path.join(cwd, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { module: "NodeNext", moduleResolution: "NodeNext", target: "ES2022" },
        include: ["src/**/*.ts"]
      })
    )
    fs.writeFileSync(
      path.join(cwd, "package.json"),
      JSON.stringify({
        name: "@effect/sample",
        type: "module",
        exports: { ".": "./src/index.ts", "./*": "./src/*.ts" }
      })
    )
    fs.writeFileSync(
      path.join(cwd, "src/index.ts"),
      `/**
 * @stability stable
 * @since 1.0.0
 */
export * as Foo from "./Foo.ts"\n`
    )
    fs.writeFileSync(
      path.join(cwd, "src/Foo.ts"),
      `/**
 * The Foo module provides helpers for sample values. Use {@link makeValue} to
 * create the default value.
 *
 * **Example** (Using the module)
 *
 * \`\`\`ts
 * import { Foo } from "@effect/sample"
 *
 * Foo.makeValue()
 * \`\`\`
 *
 * @see {@link makeValue}
 * @stability stable
 * @since 1.0.0
 */
import type { Buffer } from "node:buffer"

/**
 * Creates a value.
 *
 * @stability stable
 * @category constructors
 * @since 1.0.0
 */
export const makeValue = () => 1
`
    )
    const model = extractJSDocsSync({
      cwd,
      tsconfig: "tsconfig.json",
      include: ["src/**/*.ts"],
      output: ".data/jsdocs.json"
    })
    assert.strictEqual(model.files[0]?.moduleJSDoc?.raw.includes("The Foo module provides helpers"), true)
    assert.deepStrictEqual(model.files[0]?.diagnostics, [])
  })

  it("does not treat the first exported declaration JSDoc as module JSDoc", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "jsdocs-"))
    fs.mkdirSync(path.join(cwd, "src"), { recursive: true })
    fs.writeFileSync(
      path.join(cwd, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { module: "NodeNext", moduleResolution: "NodeNext", target: "ES2022" },
        include: ["src/**/*.ts"]
      })
    )
    fs.writeFileSync(
      path.join(cwd, "package.json"),
      JSON.stringify({
        name: "@effect/sample",
        type: "module",
        exports: { ".": "./src/index.ts", "./*": "./src/*.ts" }
      })
    )
    fs.writeFileSync(
      path.join(cwd, "src/index.ts"),
      `/**
 * @stability stable
 * @since 1.0.0
 */
export * as Foo from "./Foo.ts"\n`
    )
    fs.writeFileSync(
      path.join(cwd, "src/Foo.ts"),
      `/**
 * Creates a value.
 *
 * @stability stable
 * @category constructors
 * @since 1.0.0
 */
export const makeValue = () => 1
`
    )
    const model = extractJSDocsSync({
      cwd,
      tsconfig: "tsconfig.json",
      include: ["src/**/*.ts"],
      output: ".data/jsdocs.json"
    })
    assert.strictEqual(model.files[0]?.moduleJSDoc, undefined)
    assert.deepStrictEqual(model.files[0]?.diagnostics, [])
  })

  it("flags inline links that TypeScript does not bind", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "jsdocs-"))
    fs.mkdirSync(path.join(cwd, "src"), { recursive: true })
    fs.writeFileSync(
      path.join(cwd, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { module: "NodeNext", moduleResolution: "NodeNext", target: "ES2022" },
        include: ["src/**/*.ts"]
      })
    )
    fs.writeFileSync(
      path.join(cwd, "package.json"),
      JSON.stringify({
        name: "@effect/sample",
        type: "module",
        exports: { ".": "./src/index.ts", "./*": "./src/*.ts" }
      })
    )
    fs.writeFileSync(
      path.join(cwd, "src/index.ts"),
      `/**
 * @stability stable
 * @since 1.0.0
 */
export * as Foo from "./Foo.ts"\n`
    )
    fs.writeFileSync(path.join(cwd, "src/Schema.ts"), `export {}\n`)
    fs.writeFileSync(
      path.join(cwd, "src/Foo.ts"),
      `/**
 * Creates a value with the {@link Schema} module.
 *
 * @stability stable
 * @category constructors
 * @since 1.0.0
 */
export const makeValue = () => 1
`
    )
    const model = extractJSDocsSync({
      cwd,
      tsconfig: "tsconfig.json",
      include: ["src/**/*.ts"],
      output: ".data/jsdocs.json"
    })
    assert.deepStrictEqual(
      model.files[0]?.diagnostics.map((diagnostic) => diagnostic.code),
      ["unresolved-link"]
    )
    assert.deepStrictEqual(
      model.files[0]?.diagnostics.map((diagnostic) => diagnostic.message),
      ["Unresolved JSDoc inline link: {@link Schema}"]
    )
  })

  it("flags module JSDoc tag, example, and public @see diagnostics", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "jsdocs-"))
    fs.mkdirSync(path.join(cwd, "src"), { recursive: true })
    fs.writeFileSync(
      path.join(cwd, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { module: "NodeNext", moduleResolution: "NodeNext", target: "ES2022" },
        include: ["src/**/*.ts"]
      })
    )
    fs.writeFileSync(
      path.join(cwd, "package.json"),
      JSON.stringify({
        name: "@effect/sample",
        type: "module",
        exports: { ".": "./src/index.ts", "./*": "./src/*.ts" }
      })
    )
    fs.writeFileSync(
      path.join(cwd, "src/index.ts"),
      `/**
 * @stability stable
 * @since 1.0.0
 */
export * as Foo from "./Foo.ts"\n`
    )
    fs.writeFileSync(
      path.join(cwd, "src/Foo.ts"),
      `/**
 * The Foo module provides helpers.
 *
 * \`\`\`ts
 * const value = 1
 * \`\`\`
 *
 * @see {@link Hidden}
 * @stability stable
 */
import type { Buffer } from "node:buffer"

class Hidden {}

/**
 * Creates a value.
 *
 * @stability stable
 * @category constructors
 * @since 1.0.0
 */
export const makeValue = () => 1
`
    )
    const model = extractJSDocsSync({
      cwd,
      tsconfig: "tsconfig.json",
      include: ["src/**/*.ts"],
      output: ".data/jsdocs.json"
    })
    assert.deepStrictEqual(
      model.files[0]?.diagnostics.map((diagnostic) => diagnostic.code).sort(),
      ["loose-ts-fence", "missing-tag", "public-see-target"].sort()
    )
    assert.strictEqual(model.files[0]?.moduleJSDoc?.raw.includes("The Foo module provides helpers"), true)
  })

  it("flags @see links to targets without public JSDoc", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "jsdocs-"))
    fs.mkdirSync(path.join(cwd, "src"), { recursive: true })
    fs.writeFileSync(
      path.join(cwd, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { module: "NodeNext", moduleResolution: "NodeNext", target: "ES2022" },
        include: ["src/**/*.ts"]
      })
    )
    fs.writeFileSync(
      path.join(cwd, "package.json"),
      JSON.stringify({
        name: "@effect/sample",
        type: "module",
        exports: { ".": "./src/index.ts", "./*": "./src/*.ts" }
      })
    )
    fs.writeFileSync(
      path.join(cwd, "src/index.ts"),
      `/**
 * @stability stable
 * @since 1.0.0
 */
export * as Foo from "./Foo.ts"\n`
    )
    fs.writeFileSync(
      path.join(cwd, "src/Foo.ts"),
      `/**
 * A documented container.
 *
 * @stability stable
 * @category models
 * @since 1.0.0
 */
export interface Box {
  documented: string
  hidden: string
}

/**
 * Uses the hidden member.
 *
 * @see {@link Box.hidden}
 * @stability stable
 * @category constructors
 * @since 1.0.0
 */
export const useHidden = () => undefined
`
    )
    const model = extractJSDocsSync({
      cwd,
      tsconfig: "tsconfig.json",
      include: ["src/**/*.ts"],
      output: ".data/jsdocs.json"
    })
    assert.deepStrictEqual(
      model.files[0]?.diagnostics.map((diagnostic) => diagnostic.code),
      ["undocumented-see-target"]
    )
    assert.deepStrictEqual(model.files[0]?.imports?.barrel, {
      type: "namespace",
      module: "@effect/sample",
      name: "Foo"
    })
  })

  it("resolves @see links through TypeScript symbols before local-name lookup", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "jsdocs-"))
    fs.mkdirSync(path.join(cwd, "src"), { recursive: true })
    fs.writeFileSync(
      path.join(cwd, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { module: "NodeNext", moduleResolution: "NodeNext", target: "ES2022" },
        include: ["src/**/*.ts"]
      })
    )
    fs.writeFileSync(
      path.join(cwd, "package.json"),
      JSON.stringify({
        name: "@effect/sample",
        type: "module",
        exports: { ".": "./src/index.ts", "./*": "./src/*.ts" }
      })
    )
    fs.writeFileSync(
      path.join(cwd, "src/index.ts"),
      `/**
 * @stability stable
 * @since 1.0.0
 */
export * as Eq from "./Eq.ts"\n/**
 * @stability stable
 * @since 1.0.0
 */
export * as Ordering from "./Ordering.ts"\n/**
 * @stability stable
 * @since 1.0.0
 */
export * as Reducer from "./Reducer.ts"\n`
    )
    fs.writeFileSync(
      path.join(cwd, "src/Reducer.ts"),
      `/**
 * A reusable reducer.
 *
 * @stability stable
 * @category models
 * @since 1.0.0
 */
export interface Reducer {
  /**
   * Combines two values.
   */
  combine: string
}
`
    )
    fs.writeFileSync(
      path.join(cwd, "src/Ordering.ts"),
      `/**
 * Ordering reducer value.
 *
 * @stability stable
 * @category constants
 * @since 1.0.0
 */
export const Reducer = "ordering"
`
    )
    fs.writeFileSync(
      path.join(cwd, "src/Eq.ts"),
      `import * as Reducer from "./Reducer.ts"

/**
 * Creates an equivalence reducer.
 *
 * @see {@link Reducer}
 * @stability stable
 * @category constructors
 * @since 1.0.0
 */
export const makeReducer = () => Reducer
`
    )
    const model = extractJSDocsSync({
      cwd,
      tsconfig: "tsconfig.json",
      include: ["src/**/*.ts"],
      output: ".data/jsdocs.json"
    })
    const makeReducer = model.apis.find((api) => api.apiFqn === "@effect/sample/Eq.makeReducer")
    const link = makeReducer?.see[0]?.links[0]
    assert.deepStrictEqual(model.files.flatMap((file) => file.diagnostics), [])
    assert.deepStrictEqual(link?.resolution, {
      _tag: "Resolved",
      apiId: "root-declaration:type:@effect/sample/Reducer.Reducer",
      apiFqn: "@effect/sample/Reducer.Reducer"
    })
  })

  it("flags @see links to targets outside the public JSDoc API model", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "jsdocs-"))
    fs.mkdirSync(path.join(cwd, "src"), { recursive: true })
    fs.writeFileSync(
      path.join(cwd, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { module: "NodeNext", moduleResolution: "NodeNext", target: "ES2022" },
        include: ["src/**/*.ts"]
      })
    )
    fs.writeFileSync(
      path.join(cwd, "package.json"),
      JSON.stringify({
        name: "@effect/sample",
        type: "module",
        exports: { ".": "./src/index.ts", "./*": "./src/*.ts" }
      })
    )
    fs.writeFileSync(
      path.join(cwd, "src/index.ts"),
      `/**
 * @stability stable
 * @since 1.0.0
 */
export * as Foo from "./Foo.ts"\n`
    )
    fs.writeFileSync(
      path.join(cwd, "src/Foo.ts"),
      `/**
 * Private helper.
 *
 * @stability stable
 * @category models
 * @since 1.0.0
 */
class Hidden {}

/**
 * Uses a hidden helper.
 *
 * @see {@link Hidden}
 * @stability stable
 * @category constructors
 * @since 1.0.0
 */
export const useHidden = () => Hidden
`
    )
    const model = extractJSDocsSync({
      cwd,
      tsconfig: "tsconfig.json",
      include: ["src/**/*.ts"],
      output: ".data/jsdocs.json"
    })
    assert.deepStrictEqual(
      model.files[0]?.diagnostics.map((diagnostic) => diagnostic.code),
      ["public-see-target"]
    )
    assert.deepStrictEqual(
      model.files[0]?.diagnostics.map((diagnostic) => diagnostic.message),
      [
        "@see link {@link Hidden} does not resolve to a public JSDoc API. Check that the target is exported and has valid public JSDoc."
      ]
    )
  })

  it("keeps valid APIs from files with diagnostics for @see resolution", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "jsdocs-"))
    fs.mkdirSync(path.join(cwd, "src"), { recursive: true })
    fs.writeFileSync(
      path.join(cwd, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { module: "NodeNext", moduleResolution: "NodeNext", target: "ES2022" },
        include: ["src/**/*.ts"]
      })
    )
    fs.writeFileSync(
      path.join(cwd, "package.json"),
      JSON.stringify({
        name: "@effect/sample",
        type: "module",
        exports: { ".": "./src/index.ts", "./*": "./src/*.ts" }
      })
    )
    fs.writeFileSync(
      path.join(cwd, "src/index.ts"),
      `/**
 * @stability stable
 * @since 1.0.0
 */
export * as Bar from "./Bar.ts"\n/**
 * @stability stable
 * @since 1.0.0
 */
export * as Foo from "./Foo.ts"\n`
    )
    fs.writeFileSync(
      path.join(cwd, "src/Foo.ts"),
      `/**
 * Target value.
 *
 * @stability stable
 * @category constants
 * @since 1.0.0
 */
export const Target = "target"

/**
 * Broken value.
 *
 * **Example**
 *
 * \`\`\`ts
 * const value = "broken"
 * \`\`\`
 *
 * @stability stable
 * @category constants
 * @since 1.0.0
 */
export const Broken = "broken"
`
    )
    fs.writeFileSync(
      path.join(cwd, "src/Bar.ts"),
      `import * as Foo from "./Foo.ts"

/**
 * Uses the target value.
 *
 * @see {@link Foo.Target} for the target value
 * @stability stable
 * @category constants
 * @since 1.0.0
 */
export const useTarget = () => Foo.Target
`
    )
    const model = extractJSDocsSync({
      cwd,
      tsconfig: "tsconfig.json",
      include: ["src/**/*.ts"],
      output: ".data/jsdocs.json"
    })
    const foo = model.files.find((file) => file.file === "src/Foo.ts")
    const bar = model.files.find((file) => file.file === "src/Bar.ts")
    assert.deepStrictEqual(
      foo?.diagnostics.map((diagnostic) => diagnostic.code),
      ["malformed-example"]
    )
    assert.deepStrictEqual(bar?.diagnostics, [])
    assert.strictEqual(
      model.apis.some((api) => api.apiFqn === "@effect/sample/Foo.Target"),
      true
    )
  })

  it("resolves @see links to aliased export specifiers", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "jsdocs-"))
    fs.mkdirSync(path.join(cwd, "src"), { recursive: true })
    fs.writeFileSync(
      path.join(cwd, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { module: "NodeNext", moduleResolution: "NodeNext", target: "ES2022" },
        include: ["src/**/*.ts"]
      })
    )
    fs.writeFileSync(
      path.join(cwd, "package.json"),
      JSON.stringify({
        name: "@effect/sample",
        type: "module",
        exports: { ".": "./src/index.ts", "./*": "./src/*.ts" }
      })
    )
    fs.writeFileSync(
      path.join(cwd, "src/index.ts"),
      `/**
 * @stability stable
 * @since 1.0.0
 */
export * as Foo from "./Foo.ts"\n`
    )
    fs.writeFileSync(
      path.join(cwd, "src/Foo.ts"),
      `/**
 * @stability stable
 * @since 1.0.0
 */
const Array_ = "array"

export {
  /**
   * Public array helper.
   *
   * @stability stable
   * @category constructors
   * @since 1.0.0
   */
  Array_ as Array
}

/**
 * Public tuple helper.
 *
 * @see {@link Array_}
 * @see {@link Array}
 * @stability stable
 * @category constructors
 * @since 1.0.0
 */
export const Tuple = Array
`
    )
    const model = extractJSDocsSync({
      cwd,
      tsconfig: "tsconfig.json",
      include: ["src/**/*.ts"],
      output: ".data/jsdocs.json"
    })
    const tuple = model.apis.find((api) => api.apiFqn === "@effect/sample/Foo.Tuple")
    const links = tuple?.see.flatMap((tag) => tag.links) ?? []
    assert.deepStrictEqual(model.files.flatMap((file) => file.diagnostics), [])
    assert.deepStrictEqual(links.map((link) => link.resolution), [{
      _tag: "Resolved",
      apiId: "root-declaration:value:@effect/sample/Foo.Array",
      apiFqn: "@effect/sample/Foo.Array"
    }, {
      _tag: "Resolved",
      apiId: "root-declaration:value:@effect/sample/Foo.Array",
      apiFqn: "@effect/sample/Foo.Array"
    }])
  })

  it("accepts @stability unstable on module, member, and namespace docs", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "jsdocs-"))
    fs.mkdirSync(path.join(cwd, "src"), { recursive: true })
    fs.writeFileSync(
      path.join(cwd, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { module: "NodeNext", moduleResolution: "NodeNext", target: "ES2022" },
        include: ["src/**/*.ts"]
      })
    )
    fs.writeFileSync(
      path.join(cwd, "package.json"),
      JSON.stringify({
        name: "@effect/sample",
        type: "module",
        exports: { ".": "./src/index.ts", "./*": "./src/*.ts" }
      })
    )
    fs.writeFileSync(
      path.join(cwd, "src/index.ts"),
      `/**
 * @stability stable
 * @since 1.0.0
 */
export * as Foo from "./Foo.ts"\n`
    )
    fs.writeFileSync(
      path.join(cwd, "src/Imported.ts"),
      `/**
 * Imported marker.
 *
 * @stability stable
 * @category models
 * @since 1.0.0
 */
export interface Marker {
  readonly id: string
}
`
    )
    fs.writeFileSync(
      path.join(cwd, "src/Foo.ts"),
      `/**
 * Sample module.
 *
 * @stability unstable
 * @since 1.0.0
 */
import type { Marker } from "./Imported.ts"

/**
 * A boxed value.
 *
 * @stability stable
 * @category models
 * @since 1.0.0
 */
export interface Box {
  /**
   * The boxed text.
   *
   * @stability unstable
   * @since 1.0.0
   */
  readonly value: Marker["id"]

  /**
   * The stable label.
   *
   * @since 1.0.0
   */
  readonly label: string
}

/**
 * Groups boxed types.
 *
 * @stability unstable
 * @category models
 * @since 1.0.0
 */
export declare namespace Group {
  /**
   * A grouped item.
   *
   * @stability unstable
   * @category models
   * @since 1.0.0
   */
  export interface Item {
    readonly id: string
  }

  /**
   * A stable grouped item.
   *
   * @category models
   * @since 1.0.0
   */
  export interface StableItem {
    readonly id: string
  }
}

/**
 * Groups stable types.
 *
 * @stability stable
 * @category models
 * @since 1.0.0
 */
export declare namespace StableGroup {
  /**
   * A stable nested item.
   *
   * @category models
   * @since 1.0.0
   */
  export interface Item {
    readonly id: string
  }
}
`
    )
    const model = extractJSDocsSync({
      cwd,
      tsconfig: "tsconfig.json",
      include: ["src/**/*.ts"],
      output: ".data/jsdocs.json"
    })
    const foo = model.files.find((file) => file.file.endsWith("src/Foo.ts"))
    const stabilityByName = Object.fromEntries(
      model.apis
        .filter((api) => api.moduleName === "@effect/sample/Foo")
        .map((api) => [api.apiFqn, api.tags.stability])
    )

    assert.deepStrictEqual(foo?.diagnostics ?? [], [])
    assert.match(foo?.moduleJSDoc?.raw ?? "", /@stability unstable/)
    assert.deepStrictEqual(stabilityByName, {
      "@effect/sample/Foo.Box": "stable",
      "@effect/sample/Foo.Box.value": "unstable",
      "@effect/sample/Foo.Box.label": "stable",
      "@effect/sample/Foo.Group": "unstable",
      "@effect/sample/Foo.Group.Item": "unstable",
      "@effect/sample/Foo.Group.StableItem": "stable",
      "@effect/sample/Foo.StableGroup": "stable",
      "@effect/sample/Foo.StableGroup.Item": "stable"
    })
  })
})
