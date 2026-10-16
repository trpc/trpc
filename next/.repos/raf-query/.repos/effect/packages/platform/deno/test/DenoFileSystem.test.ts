import * as DenoFileSystem from "@effect/platform-deno/DenoFileSystem"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import { testLayer } from "../../../effect/test/FileSystem.test-utils.ts"

describe("FileSystem", () =>
  testLayer(DenoFileSystem.layer, {
    accessOnDirectory: false,
    tempFileScopedRemovesDirectory: false
  }))

describe("truncate", () => {
  it.effect.each([1.5, NaN])(
    "rejects length %s at the call site without changing the file",
    (length) =>
      Effect.gen(function*() {
        const fs = yield* FileSystem.FileSystem
        const path = yield* fs.makeTempFileScoped()
        yield* fs.writeFileString(path, "contents")
        const file = yield* fs.open(path, { flag: "r+" })
        yield* file.seek(BigInt(4), "start")
        let threwAtCall = false

        yield* Effect.exit(Effect.suspend(() => {
          try {
            return file.truncate(length)
          } catch (error) {
            threwAtCall = error instanceof RangeError
            return Effect.die(error)
          }
        }))

        assert.deepStrictEqual({
          threwAtCall,
          content: yield* fs.readFileString(path),
          position: yield* file.seek(BigInt(0), "current")
        }, {
          threwAtCall: true,
          content: "contents",
          position: BigInt(4)
        })
      }).pipe(Effect.provide(DenoFileSystem.layer))
  )
})

describe.skipIf(Deno.build.os === "windows")("writeFile", () => {
  it.effect("applies the mode when creating a file", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const directory = yield* fs.makeTempDirectoryScoped()
      const path = `${directory}/created`

      yield* fs.writeFileString(path, "content", { mode: 0o600 })

      assert.strictEqual((yield* fs.stat(path)).mode & 0o777, 0o600)
    }).pipe(Effect.provide(DenoFileSystem.layer)))

  it.effect("preserves the mode of an existing file", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* fs.makeTempFileScoped()
      yield* fs.chmod(path, 0o640)

      yield* fs.writeFileString(path, "content", { mode: 0o600 })

      assert.strictEqual((yield* fs.stat(path)).mode & 0o777, 0o640)
    }).pipe(Effect.provide(DenoFileSystem.layer)))
})
