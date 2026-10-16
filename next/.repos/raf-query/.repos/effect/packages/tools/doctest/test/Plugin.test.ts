import * as Doctest from "@effect/doctest/Plugin"
import * as Protocol from "@effect/doctest/Protocol"
import { assert, describe, it } from "@effect/vitest"
import { rejects } from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createRequire, SourceMap } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join, relative } from "node:path"
import { compileFunction } from "node:vm"
import type { JsonTestResults } from "vitest/node"

describe("Plugin", () => {
  it("executes Markdown, MDX and JSDoc snippets through Vitest", () => {
    const output = mkdtempSync(join(tmpdir(), "effect-doctest-report-"))
    try {
      const reportFile = join(output, "report.json")
      const result = spawnSync("node", [
        join(dirname(createRequire(import.meta.url).resolve("vitest/package.json")), "vitest.mjs"),
        "run",
        "--config",
        "vitest.config.ts",
        "--reporter=default",
        "--reporter=json",
        "--outputFile.json",
        reportFile
      ], {
        cwd: join(import.meta.dirname, "fixtures/markdown"),
        encoding: "utf8",
        timeout: 30_000
      })
      assert.strictEqual(result.status, 0, `${result.error ?? ""}\n${result.stdout}\n${result.stderr}`)
      const report: JsonTestResults = JSON.parse(readFileSync(reportFile, "utf8"))
      assert.deepStrictEqual(
        report.testResults.flatMap((file) => file.assertionResults.map((test) => [test.fullName, test.status])).sort(),
        [
          ["assertion-comments", "passed"],
          ["dynamic-import", "passed"],
          ["javascript", "passed"],
          ["static-import", "passed"],
          ["typed-jsdoc", "passed"],
          ["typed-mdx", "passed"]
        ]
      )
    } finally {
      rmSync(output, { recursive: true, force: true })
    }
  }, 40_000)

  it("configures the doctest runner by default", () => {
    const config = Doctest.plugin().config
    if (typeof config !== "function") return assert.fail("expected config hook")

    assert.deepStrictEqual(config.call({} as never, {}, {} as never), {
      test: { runner: "@effect/doctest/Runner" }
    })
  })

  it("preserves a configured runner", () => {
    const config = Doctest.plugin().config
    if (typeof config !== "function") return assert.fail("expected config hook")

    assert.isUndefined(config.call({} as never, { test: { runner: "./custom-runner.ts" } }, {} as never))
  })

  it("preserves statement boundaries after inline assertions", async () => {
    const root = mkdtempSync(join(tmpdir(), "effect-doctest-plugin-"))
    const file = join(root, "example.ts")
    writeFileSync(
      file,
      [
        "/**",
        " * ```ts import.meta.vitest name=asserted",
        " * const result = 1; // => 1",
        " * [1, 2].forEach(record)",
        " * ```",
        " */"
      ].join("\n")
    )

    try {
      const plugin = Doctest.plugin()
      const resolveId = plugin.resolveId
      const load = plugin.load
      if (typeof resolveId !== "function" || typeof load !== "function") {
        return assert.fail("expected function plugin hooks")
      }
      const context = { addWatchFile() {} } as never
      const id = Protocol.collectorId(file, "test")
      const resolved = await resolveId.call(context, id, undefined, {} as never)
      if (typeof resolved !== "string") return assert.fail("expected resolved collector ID")
      const source = await load.call(context, resolved, {} as never)
      if (typeof source !== "string") return assert.fail("expected collector source")

      assert.match(source, /import \{ test \} from "@effect\/doctest\/Runtime"/)
      assert.match(source, /test\("asserted", \(\) => import\([^)]*\)\)/)

      const snippetId = Protocol.snippetId(file, 0, "test")
      const resolvedSnippet = await resolveId.call(context, snippetId, undefined, {} as never)
      if (typeof resolvedSnippet !== "string") return assert.fail("expected resolved snippet ID")
      const snippet = await load.call(context, resolvedSnippet, {} as never)
      if (typeof snippet !== "string") return assert.fail("expected snippet source")
      assert.match(snippet, /const result = 1;\n__effect_doctest_assert_0\(result, 1\)/)
      assert.match(snippet, /assertEquals as __effect_doctest_assert_0/)

      const values: Array<number> = []
      compileFunction(snippet.slice(0, snippet.lastIndexOf("\n\nimport ")), ["__effect_doctest_assert_0", "record"])(
        (actual: unknown, expected: unknown) => assert.deepStrictEqual(actual, expected),
        (value: number) => values.push(value)
      )
      assert.deepStrictEqual(values, [1, 2])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("lowers TypeScript without changing the snippet identity and maps to the document line", async () => {
    const root = mkdtempSync(join(tmpdir(), "effect-doctest-markdown-"))
    try {
      const file = join(root, "example.md")
      writeFileSync(file, "# Example\n\n```ts import.meta.vitest\nconst local: number = 42\nrecord(local)\n```\n")
      const plugin = Doctest.plugin()
      const resolveId = plugin.resolveId
      const load = plugin.load
      if (typeof resolveId !== "function" || typeof load !== "function") {
        return assert.fail("expected function plugin hooks")
      }
      const context = { addWatchFile() {} } as never
      const collector = Protocol.resolvedId("collector", { file, version: "test" })
      await load.call(context, collector, {} as never)
      const resolved = await resolveId.call(context, Protocol.snippetId(file, 0, "test"), undefined, {} as never)
      assert.strictEqual(resolved, Protocol.resolvedId("snippet", { file, index: 0, version: "test" }))
      if (typeof resolved !== "string") return assert.fail("expected string ID")
      const output = await load.call(context, resolved, {} as never)
      if (output === null || typeof output !== "object") return assert.fail("expected compiled snippet")
      const values: Array<unknown> = []
      compileFunction(output.code, ["record"])((value: unknown) => values.push(value))
      assert.deepStrictEqual(values, [42])
      if (output.map === null || output.map === undefined || typeof output.map === "string") {
        return assert.fail("expected source map")
      }
      assert.deepStrictEqual(output.map.sources, [file])
      const line = output.code.split("\n").findIndex((line) => line.includes("record(local)"))
      const mapping = new SourceMap({
        version: 3,
        file,
        sourceRoot: "",
        sources: output.map.sources?.map((source) => source ?? "") ?? [],
        sourcesContent: output.map.sourcesContent?.map((source) => source ?? "") ?? [],
        names: output.map.names ?? [],
        mappings: output.map.mappings
      }).findEntry(line, 0)
      assert.deepInclude(mapping, { originalSource: file, originalLine: 4 })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("leaves normal TypeScript snippets for Vite to compile once", async () => {
    const root = mkdtempSync(join(tmpdir(), "effect-doctest-typescript-"))
    try {
      const file = join(root, "example.ts")
      writeFileSync(file, "/**\n * ```ts import.meta.vitest\n * const local: number = 42\n * ```\n */\n")
      const load = Doctest.plugin().load
      if (typeof load !== "function") return assert.fail("expected load hook")
      const output = await load.call(
        { addWatchFile() {} } as never,
        Protocol.resolvedId("snippet", { file, index: 0, version: "test" }),
        {} as never
      )
      assert.strictEqual(output, "const local: number = 42")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("reports invalid TypeScript using the document filename and line", async () => {
    const root = mkdtempSync(join(tmpdir(), "effect-doctest-invalid-"))
    try {
      const file = join(root, "example.md")
      writeFileSync(file, "# Example\n\n```ts import.meta.vitest\nconst local: = 42\n```\n")
      const load = Doctest.plugin().load
      if (typeof load !== "function") return assert.fail("expected load hook")
      await rejects(
        Promise.resolve(load.call(
          { addWatchFile() {} } as never,
          Protocol.resolvedId("snippet", { file, index: 0, version: "test" }),
          {} as never
        )),
        (error: unknown) => {
          assert.include(String(error), `${relative(process.cwd(), file)}:4:14`)
          return true
        }
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
