import * as NodePath from "@effect/platform-node-shared/NodePath"
import { assert, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Path from "effect/Path"

it.layer(NodePath.layerPosix)("POSIX file URLs", (it) => {
  it.effect("uses POSIX conversions", () =>
    Effect.gen(function*() {
      const path = yield* Path.Path

      assert.strictEqual(yield* path.fromFileUrl(new URL("file:///tmp/file.txt")), "/tmp/file.txt")
      assert.strictEqual((yield* path.toFileUrl("/tmp/file.txt")).href, "file:///tmp/file.txt")
    }))
})

it.layer(NodePath.layerWin32)("Windows file URLs", (it) => {
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
