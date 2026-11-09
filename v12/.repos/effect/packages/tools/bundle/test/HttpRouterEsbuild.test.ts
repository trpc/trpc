import * as babel from "@babel/core"
import { assert, describe, it } from "@effect/vitest"
import * as esbuild from "esbuild"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { fileURLToPath } from "node:url"

const packageDir = fileURLToPath(new URL("..", import.meta.url))
const effectSrcDir = fileURLToPath(new URL("../../../effect/src/", import.meta.url))

// The published build runs babel with annotate-pure-calls over the compiler
// output. Bundlers rely on those annotations to drop unused module-scope
// calls, so the same step is reproduced here for every effect source module.
// Without it esbuild shakes source differently from the published package.
const annotatePureCalls: esbuild.Plugin = {
  name: "annotate-pure-calls",
  setup(build) {
    build.onLoad({ filter: /\.ts$/ }, async (args) => {
      if (!args.path.startsWith(effectSrcDir)) {
        return undefined
      }
      const source = await fs.readFile(args.path, "utf8")
      const transpiled = await esbuild.transform(source, {
        loader: "ts",
        format: "esm",
        target: "es2022",
        sourcefile: args.path,
        tsconfigRaw: { compilerOptions: { verbatimModuleSyntax: true } }
      })
      const annotated = await babel.transformAsync(transpiled.code, {
        babelrc: false,
        configFile: false,
        compact: false,
        cwd: packageDir,
        filename: args.path,
        plugins: ["annotate-pure-calls"]
      })
      return { contents: annotated!.code!, loader: "js" }
    })
  }
}

// Bundles a fixture the way wrangler does (esbuild, worker conditions) and
// returns the effect source modules that made it into the output. Only the
// output entry of the metafile lists retained modules; `metafile.inputs` is
// the whole import graph, tree-shaken or not.
const bundledEffectModules = async (fixture: string): Promise<ReadonlyArray<string>> => {
  const result = await esbuild.build({
    entryPoints: [path.join(packageDir, "fixtures", fixture)],
    bundle: true,
    write: false,
    metafile: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    conditions: ["workerd", "worker", "browser"],
    logLevel: "silent",
    absWorkingDir: packageDir,
    plugins: [annotatePureCalls]
  })
  const [output] = Object.values(result.metafile.outputs)
  return Object.keys(output.inputs)
    .map((input) => path.relative(effectSrcDir, path.resolve(packageDir, input)))
    .filter((module) => !module.startsWith(".."))
    .sort()
}

describe("http-router fixture bundled with esbuild", () => {
  // esbuild transpiles and Babel annotates every reachable Effect source module.
  // Under full-suite Bun CI load this can exceed Vitest's 5s default.
  it("does not include any Schema module", { timeout: 20_000 }, async () => {
    const modules = await bundledEffectModules("http-router.ts")
    assert.include(modules, "http/HttpRouter.ts")
    assert.include(modules, "http/HttpServerRespondable.ts")
    const schemaModules = modules.filter((module) =>
      /^(?:Schema[A-Za-z]*\.ts|schema\/|internal\/schema\/)/.test(module)
    )
    assert.deepStrictEqual(schemaModules, [], `Schema modules reached the router bundle: ${schemaModules.join(", ")}`)
  })
})
