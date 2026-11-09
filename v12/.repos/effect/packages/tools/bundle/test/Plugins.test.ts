import { createResolveLocalPackageImports } from "@effect/bundle/Plugins"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import type * as EffectPath from "effect/Path"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import type { Plugin } from "rollup"

type Resolved = {
  readonly id: string
  readonly external: false
}

type ResolveId = (
  this: {
    readonly resolve: (
      source: string,
      importer?: string,
      options?: { readonly skipSelf?: boolean }
    ) => Promise<Resolved | null>
  },
  source: string,
  importer?: string
) => Promise<Resolved | null>

const packageDir = fileURLToPath(new URL("../../../effect", import.meta.url))
const bundleDir = fileURLToPath(new URL("..", import.meta.url))
const pathService = path as unknown as EffectPath.Path

const getResolveId = (plugin: Plugin): ResolveId => {
  assert.strictEqual(typeof plugin.resolveId, "function")
  return plugin.resolveId as ResolveId
}

const resolved = (id: string): Resolved => ({
  id,
  external: false
})

describe("createResolveLocalPackageImports", () => {
  it("resolves directory package exports to dist index files", async () => {
    const resolveId = getResolveId(createResolveLocalPackageImports(pathService))
    const result = await resolveId.call({
      resolve: async (source) => {
        switch (source) {
          case "effect/package.json":
            return resolved(path.join(packageDir, "package.json"))
          case "effect/testing":
            return resolved(path.join(packageDir, "src", "testing", "index.ts"))
          default:
            return null
        }
      }
    }, "effect/testing")

    assert.deepStrictEqual(result, resolved(path.join(packageDir, "dist", "testing", "index.js")))
  })

  it("keeps flat package exports on flat dist files", async () => {
    const resolveId = getResolveId(createResolveLocalPackageImports(pathService))
    const result = await resolveId.call({
      resolve: async (source) => {
        switch (source) {
          case "effect/package.json":
            return resolved(path.join(packageDir, "package.json"))
          case "effect/Schema":
            return resolved(path.join(packageDir, "src", "Schema.ts"))
          default:
            return null
        }
      }
    }, "effect/Schema")

    assert.deepStrictEqual(result, resolved(path.join(packageDir, "dist", "Schema.js")))
  })
})

describe("Fixtures", () => {
  it("discovers fixtures when the module path contains spaces", async () => {
    const root = await fs.mkdtemp(path.join(bundleDir, ".fixtures-test-"))
    try {
      const directory = path.join(root, "Effect Work")
      const modulePath = path.join(directory, "src", "Fixtures.ts")
      const fixturesDir = path.join(directory, "fixtures")
      await fs.mkdir(path.dirname(modulePath), { recursive: true })
      await fs.mkdir(fixturesDir)
      await fs.copyFile(path.join(bundleDir, "src", "Fixtures.ts"), modulePath)
      await fs.writeFile(path.join(fixturesDir, "example.ts"), "")

      const { Fixtures } = await import(pathToFileURL(modulePath).href)

      assert.deepStrictEqual(await Effect.runPromise(Fixtures.make), {
        fixtures: ["example.ts"],
        fixturesDir: fixturesDir + path.sep
      })
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
