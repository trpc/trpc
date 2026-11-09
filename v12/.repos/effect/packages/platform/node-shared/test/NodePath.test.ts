import * as NodePath from "@effect/platform-node-shared/NodePath"
import { assert, it } from "@effect/vitest"
import { assertNone, assertSome } from "@effect/vitest/utils"
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

it.layer(NodePath.layerWin32)("Windows resolveWithin", (it) => {
  it.effect("applies Windows root rules", () =>
    Effect.gen(function*() {
      const path = yield* Path.Path

      assertSome(path.resolveWithin("C:\\srv", "a\\b.txt"), "C:\\srv\\a\\b.txt")
      assertSome(path.resolveWithin("C:\\Srv", "..\\srv\\b.txt"), "C:\\srv\\b.txt")

      assertNone(path.resolveWithin("C:\\srv", "..\\srv-other\\b.txt"))
      assertNone(path.resolveWithin("C:\\srv", "C:b.txt"))
      assertNone(path.resolveWithin("C:\\srv", "\\Windows"))
      assertNone(path.resolveWithin("C:\\srv", "D:\\b.txt"))
      assertNone(path.resolveWithin("C:\\srv", "\\\\server\\share\\b.txt"))
    }))
})
