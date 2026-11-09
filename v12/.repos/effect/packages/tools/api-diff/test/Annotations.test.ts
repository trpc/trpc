import { loadAnnotations } from "@effect/api-diff/Annotations"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"

describe("migration annotations", () => {
  it.effect("loads and merges YAML files", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "api-diff-annotations-" })
      yield* fs.writeFileString(
        path.join(root, "Effect.yaml"),
        [
          "effect/Effect#async:",
          "  replacement: Effect.callback",
          "  note: Rename the callback constructor.",
          "  example: Effect.callback((resume) => resume(Effect.void))",
          ""
        ].join("\n")
      )
      yield* fs.writeFileString(
        path.join(root, "Stream.yaml"),
        [
          "effect/Stream#async:",
          "  replacement: Stream.callback",
          "  note: Rename the stream constructor.",
          ""
        ].join("\n")
      )

      const annotations = yield* loadAnnotations(root)

      assert.deepStrictEqual([...annotations], [
        ["effect/Effect#async", {
          replacement: "Effect.callback",
          note: "Rename the callback constructor.",
          example: "Effect.callback((resume) => resume(Effect.void))"
        }],
        ["effect/Stream#async", {
          replacement: "Stream.callback",
          note: "Rename the stream constructor."
        }]
      ])
    }).pipe(Effect.provide(NodeServices.layer)))

  it.effect("treats a missing directory as no annotations", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "api-diff-annotations-" })

      const annotations = yield* loadAnnotations(path.join(root, "missing"))

      assert.strictEqual(annotations.size, 0)
    }).pipe(Effect.provide(NodeServices.layer)))
})
