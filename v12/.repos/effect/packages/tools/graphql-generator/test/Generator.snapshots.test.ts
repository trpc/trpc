/**
 * The hand-written subscriptions set is pinned byte for byte by snapshot files
 * under `test/generated/`, which `pnpm check` typechecks and the
 * `Generator.runtime*` tests import. Run with `-u` to update them after an
 * intended output change.
 *
 * The GitHub set is generated during the tests instead of being committed:
 * here it is written to a scratch directory and typechecked with `tsc`.
 */
import * as NodeServices from "@effect/platform-node/NodeServices"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import * as Stream from "effect/Stream"
import { fileURLToPath } from "node:url"
import { generateSubscriptions, writeGitHub } from "./utils/generator.ts"

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url))

describe("Generator snapshots", () => {
  it.effect("subscriptions", (ctx) =>
    Effect.gen(function*() {
      const files = ["messages.graphql.ts", "rooms.graphql.ts", "shared.graphql.ts"]
      const generated = yield* generateSubscriptions
      assert.deepStrictEqual(generated.result.diagnostics, [])
      assert.deepStrictEqual(generated.paths, files.map((name) => `subscriptions/${name}`))
      for (const name of files) {
        yield* Effect.promise(() =>
          ctx.expect(generated.file(`subscriptions/${name}`)).toMatchFileSnapshot(`./generated/subscriptions/${name}`)
        )
      }
    }).pipe(Effect.provide(NodeServices.layer)))

  it.effect("the generated GitHub set typechecks", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const dir = yield* writeGitHub
      yield* fs.writeFileString(
        path.join(dir, "tsconfig.json"),
        JSON.stringify({
          extends: path.join(repoRoot, "tsconfig.base.json"),
          compilerOptions: {
            noEmit: true,
            composite: false,
            declaration: false,
            declarationMap: false,
            rootDir: ".",
            types: ["node"]
          },
          include: ["*.ts"]
        })
      )
      const handle = yield* ChildProcess.make("node", [
        path.join(repoRoot, "node_modules/typescript/bin/tsc"),
        "-p",
        dir,
        "--pretty",
        "false"
      ])
      const [exitCode, output] = yield* Effect.all(
        [handle.exitCode, Stream.mkString(Stream.decodeText(handle.stdout))],
        {
          concurrency: "unbounded"
        }
      )
      assert.strictEqual(output, "")
      assert.strictEqual(exitCode, ChildProcessSpawner.ExitCode(0))
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)), 60_000)
})
