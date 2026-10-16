import * as NodeServices from "@effect/platform-node/NodeServices"
import * as Codegen from "@effect/utils/Codegen"
import * as Glob from "@effect/utils/Glob"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as path from "node:path"

const MainLayer = Codegen.layer.pipe(Layer.provide(Glob.layer), Layer.provideMerge(NodeServices.layer))

describe("BarrelGenerator", () => {
  it.effect("discovers a barrel from an absolute pattern", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "codegen-" })
      const barrel = path.join(directory, "index.ts")
      yield* fs.writeFileString(barrel, "// @barrel\n")

      const generator = yield* Codegen.BarrelGenerator
      const files = yield* generator.discoverFiles(barrel, directory)

      assert.deepStrictEqual(files, [{ path: barrel, pattern: "*.ts", offset: 1 }])
    }).pipe(Effect.provide(MainLayer)))

  it.effect("copies module stability tags into barrel exports", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "codegen-" })
      const barrel = path.join(directory, "index.ts")
      yield* fs.writeFileString(barrel, "// @barrel\n")
      yield* fs.writeFileString(
        path.join(directory, "Experimental.ts"),
        `/**
 * Experimental module.
 *
 * @stability experimental
 * @since 3.0.0
 */
export const experimental = 1
`
      )
      yield* fs.writeFileString(
        path.join(directory, "Stable.ts"),
        `/**
 * Stable module.
 *
 * @since 1.0.0
 */
export const stable = 1
`
      )
      yield* fs.writeFileString(
        path.join(directory, "Unstable.ts"),
        `/**
 * Unstable module.
 *
 * @stability unstable
 * @since 2.0.0
 */
export const unstable = 1
`
      )

      const generator = yield* Codegen.BarrelGenerator
      yield* generator.processFile({ path: barrel, pattern: "*.ts", offset: 1 })

      assert.strictEqual(
        yield* fs.readFileString(barrel),
        `// @barrel

/**
 * @stability experimental
 * @since 3.0.0
 */
export * as Experimental from "./Experimental.ts"

/**
 * @since 1.0.0
 */
export * as Stable from "./Stable.ts"

/**
 * @stability unstable
 * @since 2.0.0
 */
export * as Unstable from "./Unstable.ts"
`
      )
    }).pipe(Effect.provide(MainLayer)))
})
