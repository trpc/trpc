import * as DenoFileSystem from "@effect/platform-deno/DenoFileSystem"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Stream from "effect/Stream"
import { afterEach } from "vitest"
import { testLayer } from "../../../effect/test/FileSystem.test-utils.ts"

describe("FileSystem", () =>
  testLayer(DenoFileSystem.layer, {
    accessOnDirectory: false,
    tempFileScopedRemovesDirectory: false,
    noFollow: false
  }))

describe("stat", () => {
  it.effect("returns device and inode metadata as bigint", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* fs.makeTempFileScoped()
      const native = Deno.statSync(path)
      const info = yield* fs.stat(path)

      assert.strictEqual(info.dev, BigInt(native.dev))
      assert.deepStrictEqual(info.ino, Option.map(Option.fromNullishOr(native.ino), BigInt))
    }).pipe(Effect.provide(DenoFileSystem.layer)))
})

describe("watch", () => {
  it.effect("prefers the caller WatchBackend over the construction backend", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const root = yield* fs.makeTempDirectoryScoped()
      const callerEvent: FileSystem.WatchEvent = { _tag: "Create", path: "from-caller" }
      const event = yield* fs.watch(root).pipe(
        Stream.runHead,
        Effect.provideService(FileSystem.WatchBackend, {
          register: () => Option.some(Stream.make(callerEvent))
        })
      )
      assert.deepStrictEqual(event, Option.some(callerEvent))
    }).pipe(
      Effect.provide(DenoFileSystem.layer),
      Effect.provideService(FileSystem.WatchBackend, {
        register: () => Option.some(Stream.make({ _tag: "Create" as const, path: "from-construction" }))
      })
    ))

  it.live("uses a WatchBackend provided after the layer is built", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const root = yield* fs.makeTempDirectoryScoped()
      const backendEvent: FileSystem.WatchEvent = { _tag: "Create", path: "from-backend" }
      const event = yield* fs.watch(root).pipe(
        Stream.runHead,
        Effect.provideService(FileSystem.WatchBackend, {
          register: () => Option.some(Stream.make(backendEvent))
        }),
        Effect.timeout("1 second")
      )
      assert.deepStrictEqual(event, Option.some(backendEvent))
    }).pipe(Effect.provide(DenoFileSystem.layer)))
})

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

describe("File native I/O under interruption", { concurrent: false }, () => {
  const { read } = Deno.FsFile.prototype
  afterEach(() => {
    Deno.FsFile.prototype.read = read
  })

  it.effect("skips cancelled queued I/O but waits for an interrupted in-flight read", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* fs.makeTempFileScoped()
      yield* fs.writeFileString(path, "abcdefghij")
      const file = yield* fs.open(path, { flag: "r+" })
      const started = Promise.withResolvers<void>()
      const released = Promise.withResolvers<void>()
      let calls = 0
      Deno.FsFile.prototype.read = async function(p) {
        if (calls++ === 0) {
          started.resolve()
          await released.promise
        }
        return read.call(this, p)
      }

      const first = yield* Effect.forkChild(file.read(new Uint8Array(5), { position: BigInt(0) }))
      yield* Effect.promise(() => started.promise)
      const queued = yield* Effect.forkChild(file.write(new TextEncoder().encode("XYZ")), {
        startImmediately: true
      })
      yield* Fiber.interrupt(queued)
      yield* Fiber.interrupt(first)
      const next = yield* Effect.forkChild(
        file.readAlloc(5, { position: BigInt(5) }).pipe(Effect.flatMap(Effect.fromOption)),
        { startImmediately: true }
      )
      const readsBeforeRelease = calls
      released.resolve()
      assert.strictEqual(readsBeforeRelease, 1)
      assert.strictEqual(new TextDecoder().decode(yield* Fiber.join(next)), "fghij")
      assert.strictEqual(yield* fs.readFileString(path), "abcdefghij")
    }).pipe(Effect.provide(DenoFileSystem.layer)))
})
