import { cli } from "@effect/api-diff"
import { ApiDiff } from "@effect/api-diff/ApiDiff"
import type { ApiEntity, ApiSnapshot } from "@effect/api-diff/Model"
import { Worktrees } from "@effect/api-diff/Worktrees"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { assert, it } from "@effect/vitest"
import * as Command from "effect/cli/Command"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"

const snapshot = (ref: string, sha: string, entities: ReadonlyArray<ApiEntity> = []): ApiSnapshot => ({
  version: 1,
  compiler: { name: "typescript", version: "fixture" },
  ref,
  sha,
  packages: [],
  entrypoints: [],
  entities,
  diagnostics: []
})

const WorktreesTest = Layer.succeed(
  Worktrees,
  Worktrees.of({
    resolveRef: (_repoRoot, ref) => Effect.succeed(ref.repeat(40).slice(0, 40)),
    prepareSnapshot: (options) => Effect.succeed(snapshot(options.ref, options.sha))
  })
)

const MainLayer = ApiDiff.layerNoDependencies.pipe(
  Layer.provide(WorktreesTest),
  Layer.provideMerge(NodeServices.layer)
)

const removed: ApiEntity = {
  id: "effect/Effect#removed#value",
  packageName: "effect",
  module: "effect/Effect",
  path: ["removed"],
  bucket: "value",
  declarationKind: "variable",
  importRoutes: [{ module: "effect/Effect", path: ["removed"] }],
  declarations: [{ kind: "variable", name: "removed", type: { kind: "primitive", name: "string" } }],
  displaySignature: "declare const removed: string",
  fingerprint: "removed",
  documentation: { stability: "stable" },
  source: { file: "Effect.d.ts", line: 1, column: 1 }
}

const CheckLayer = ApiDiff.layerNoDependencies.pipe(
  Layer.provide(Layer.succeed(
    Worktrees,
    Worktrees.of({
      resolveRef: (_repoRoot, ref) => Effect.succeed(ref.repeat(40).slice(0, 40)),
      prepareSnapshot: (options) =>
        Effect.succeed(snapshot(options.ref, options.sha, options.name === "base" ? [removed] : []))
    })
  )),
  Layer.provideMerge(NodeServices.layer)
)

it.effect("compares refs without a migration map", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "api-diff-cli-" })
    const output = path.join(root, "output")

    yield* Command.runWith(cli, { version: "0.0.0" })([
      "--base-ref",
      "a",
      "--head-ref",
      "b",
      "--output",
      output
    ])

    const diff = JSON.parse(yield* fs.readFileString(path.join(output, "diff.json")))
    assert.deepStrictEqual(diff.base, { ref: "a", sha: "a".repeat(40) })
    assert.deepStrictEqual(diff.head, { ref: "b", sha: "b".repeat(40) })
  }).pipe(Effect.provide(MainLayer)))

it.effect("writes the migration document with default refs", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "api-diff-cli-" })
    const document = path.join(root, "v3-to-v4.md")
    yield* fs.writeFileString(document, "# Existing\n\n## Import Map\n\nKeep this map.\n\n## API Renames\n")

    yield* Command.runWith(cli, { version: "0.0.0" })([
      "--write-doc",
      document
    ])

    const source = yield* fs.readFileString(document)
    assert(source.includes(`Base: \`v3\` (\`${"v3".repeat(40).slice(0, 40)}\`)`))
    assert(source.includes(`Head: \`main\` (\`${"origin/main".repeat(40).slice(0, 40)}\`)`))
    assert(source.includes("## Import Map\n\nKeep this map."))
    assert(source.includes("## API Reference"))
  }).pipe(Effect.provide(MainLayer)))

it.effect("fails check mode when guidance is missing", () =>
  Effect.gen(function*() {
    const result = yield* Effect.exit(Command.runWith(cli, { version: "0.0.0" })(["--check"]))

    assert(Exit.isFailure(result))
  }).pipe(Effect.provide(CheckLayer)))
