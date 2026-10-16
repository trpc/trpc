import * as DenoPath from "@effect/platform-deno/DenoPath"
import { assert, it } from "@effect/vitest"
import { Effect, Path } from "effect"

it.layer(DenoPath.layer)("Integration", (it) => {
  it.effect("runs the demo program", () =>
    Effect.gen(function*() {
      // Access the Path service
      const path = yield* Path.Path

      // Join parts of a path to create a complete file path
      const tmpPath = path.join("tmp", "file.txt")

      assert.strictEqual(tmpPath, "tmp/file.txt")
    }))
})

it.layer(DenoPath.layerPosix)("POSIX file URLs", (it) => {
  it.effect("uses POSIX conversions", () =>
    Effect.gen(function*() {
      const path = yield* Path.Path

      assert.strictEqual(yield* path.fromFileUrl(new URL("file:///tmp/file.txt")), "/tmp/file.txt")
      assert.strictEqual((yield* path.toFileUrl("/tmp/file.txt")).href, "file:///tmp/file.txt")
    }))
})

it.layer(DenoPath.layerWin32)("Windows file URLs", (it) => {
  it.effect("uses Windows conversions", () =>
    Effect.gen(function*() {
      const path = yield* Path.Path

      assert.strictEqual(yield* path.fromFileUrl(new URL("file:///C:/Users/me/file.txt")), "C:\\Users\\me\\file.txt")
      assert.strictEqual(
        (yield* path.toFileUrl("C:\\Users\\me\\file.txt")).href,
        "file:///C:/Users/me/file.txt"
      )
    }))
})
