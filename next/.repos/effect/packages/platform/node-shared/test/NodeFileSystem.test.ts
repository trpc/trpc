import * as NodeFileSystem from "@effect/platform-node-shared/NodeFileSystem"
import { assert, describe, it } from "@effect/vitest"
import * as ByteSize from "effect/ByteSize"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Stream from "effect/Stream"
import * as TestClock from "effect/testing/TestClock"
import * as NFS from "node:fs"
import * as Path from "node:path"
import { afterEach, beforeEach, vi } from "vitest"
import { testGlob, testLayer } from "../../../effect/test/FileSystem.test-utils.ts"

const startWatch = Effect.fnUntraced(function*<E, R>(
  fs: FileSystem.FileSystem,
  root: string,
  watch: () => Stream.Stream<FileSystem.WatchEvent, E, R>
) {
  const ready = yield* Deferred.make<void>()
  const readyName = ".watch-ready"
  const fiber = yield* watch().pipe(
    Stream.tap((event) =>
      event.path === readyName
        ? Deferred.succeed(ready, undefined)
        : Effect.void
    ),
    Stream.dropUntil((event) => event.path === readyName),
    Stream.filter((event) => event.path !== readyName),
    Stream.runHead,
    Effect.flatMap(Effect.fromOption),
    Effect.forkChild
  )
  const signalFiber = yield* Effect.sleep("10 millis").pipe(
    TestClock.withLive,
    Effect.andThen(fs.writeFileString(`${root}/${readyName}`, "")),
    Effect.forever,
    Effect.forkChild
  )
  yield* Deferred.await(ready).pipe(
    Effect.raceFirst(Fiber.join(fiber).pipe(Effect.asVoid)),
    Effect.ensuring(Fiber.interrupt(signalFiber))
  )
  return fiber
})

// A file system whose listings report every entry as `"Unknown"`, so `glob`
// learns entry types from `stat` and `readLink` alone.
const untypedLayer = Layer.effect(
  FileSystem.FileSystem,
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    return FileSystem.make({
      ...fs,
      readDirectoryEntries: (path) =>
        Effect.map(fs.readDirectory(path), (names) => names.map((name) => ({ name, type: "Unknown" as const })))
    })
  })
).pipe(Layer.provide(NodeFileSystem.layer))

describe("FileSystem without typed directory listings", { concurrent: false }, () => {
  testGlob(untypedLayer)
})

describe("FileSystem", { concurrent: false }, () => {
  testLayer(NodeFileSystem.layer, { noFollow: process.platform !== "win32" })

  it.effect("realPath resolves a directory alias to its physical target", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const root = yield* fs.realPath(yield* fs.makeTempDirectoryScoped())
      const target = Path.join(root, "target")
      const alias = Path.join(root, "alias")
      yield* fs.makeDirectory(target)
      NFS.symlinkSync(target, alias, process.platform === "win32" ? "junction" : "dir")
      assert.strictEqual(yield* fs.realPath(alias), target)
    }).pipe(
      Effect.provide(NodeFileSystem.layer)
    ))

  it.effect("writeAll accepts an empty buffer", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* fs.makeTempFileScoped()
      const file = yield* fs.open(path, { flag: "r+" })

      yield* file.writeAll(new Uint8Array(0))
    }).pipe(
      Effect.provide(NodeFileSystem.layer)
    ))

  it.effect("watch reports Create for a new file outside the current directory", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const root = yield* fs.makeTempDirectoryScoped()
      const name = "created.txt"
      const path = `${root}/${name}`
      assert.strictEqual(yield* fs.exists(name), false)

      const fiber = yield* startWatch(fs, root, () => fs.watch(root))
      yield* fs.writeFileString(path, "")

      const event = yield* Fiber.join(fiber)
      assert.strictEqual(yield* fs.exists(path), true)
      assert.deepStrictEqual(event, { _tag: "Create", path: name })
    }).pipe(
      Effect.provide(NodeFileSystem.layer)
    ))

  it.effect("watch does not report nested changes when recursive is false", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const root = yield* fs.makeTempDirectoryScoped()
      const nested = `${root}/nested`
      yield* fs.makeDirectory(nested)

      const fiber = yield* startWatch(fs, root, () => fs.watch(root, { recursive: false }))

      yield* fs.writeFileString(`${nested}/nested.txt`, "")
      yield* fs.writeFileString(`${root}/direct.txt`, "")

      const event = yield* Fiber.join(fiber)
      assert.strictEqual(event.path, "direct.txt")
    }).pipe(
      Effect.provide(NodeFileSystem.layer)
    ))

  it.effect("watch is non-recursive when options are omitted", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const root = yield* fs.makeTempDirectoryScoped()
      const nested = `${root}/nested`
      yield* fs.makeDirectory(nested)

      const fiber = yield* startWatch(fs, root, () => fs.watch(root))

      yield* fs.writeFileString(`${nested}/nested.txt`, "")
      yield* fs.writeFileString(`${root}/direct.txt`, "")

      const event = yield* Fiber.join(fiber)
      assert.strictEqual(event.path, "direct.txt")
    }).pipe(
      Effect.provide(NodeFileSystem.layer)
    ))

  it.live("watch uses a WatchBackend provided after the layer is built", () =>
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
    }).pipe(
      Effect.provide(NodeFileSystem.layer)
    ))

  it.effect("watch prefers the caller WatchBackend over the construction backend", () =>
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
      Effect.provide(NodeFileSystem.layer),
      Effect.provideService(FileSystem.WatchBackend, {
        register: () => Option.some(Stream.make({ _tag: "Create" as const, path: "from-construction" }))
      })
    ))

  it.effect("watch reports nested changes when recursive is true", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const root = yield* fs.makeTempDirectoryScoped()
      const nested = `${root}/nested`
      yield* fs.makeDirectory(nested)

      const fiber = yield* startWatch(fs, root, () => fs.watch(root, { recursive: true }))

      yield* fs.writeFileString(`${nested}/nested.txt`, "")

      const event = yield* Fiber.join(fiber)
      assert(event.path.endsWith("nested.txt"))
    }).pipe(
      Effect.provide(NodeFileSystem.layer)
    ))
})

const state = vi.hoisted(() => ({
  enabled: false,
  values: {} as Record<string, bigint>,
  positions: [] as Array<number | bigint | undefined>
}))

vi.mock("node:fs", async (importOriginal) => {
  const original = await importOriginal<typeof NFS>()
  // Match Node's number and bigint stat modes.
  const stat = (
    _pathOrFd: string | number,
    optionsOrCallback: { bigint?: boolean } | ((error: null, stats: object) => void),
    callback?: (error: null, stats: object) => void
  ) => {
    const bigint = typeof optionsOrCallback === "object" && optionsOrCallback.bigint
    const done = typeof optionsOrCallback === "function" ? optionsOrCallback : callback!
    done(null, {
      ...Object.fromEntries(Object.entries(state.values).map(([key, value]) => [key, bigint ? value : Number(value)])),
      mtime: new Date(0),
      atime: new Date(0),
      birthtime: new Date(0),
      isFile: () => true
    })
  }
  const doubles = {
    open: (_path: string, _flags: string, _mode: unknown, callback: (error: null, fd: number) => void) =>
      callback(null, 42),
    close: (_fd: number, callback: (error: null) => void) => callback(null),
    stat,
    fstat: stat,
    write: (
      _fd: number,
      _buffer: Uint8Array,
      _offset: unknown,
      _length: unknown,
      position: number | bigint | undefined,
      callback: (error: null, bytesWritten: number) => void
    ) => {
      state.positions.push(position)
      callback(null, 1)
    }
  }
  return {
    ...original,
    ...Object.fromEntries(
      Object.entries(doubles).map(([name, implementation]) => [
        name,
        (...args: Array<unknown>) =>
          Reflect.apply(state.enabled ? implementation : original[name as keyof typeof doubles], original, args)
      ])
    )
  }
})

const maxSafe = BigInt(Number.MAX_SAFE_INTEGER)
const oversized = maxSafe + 2n

describe("NodeFileSystem precision", { concurrent: false }, () => {
  afterEach(() => {
    state.enabled = false
  })
  beforeEach(() => {
    state.enabled = true
    state.positions = []
    state.values = {
      size: 4n,
      blksize: 4096n,
      dev: 1n,
      ino: 2n,
      mode: 33188n,
      nlink: 1n,
      uid: 1000n,
      gid: 1000n,
      rdev: 0n,
      blocks: 8n
    }
  })

  for (const method of ["write", "writeAll"] as const) {
    it.effect(`${method} rejects an unsafe position before writing`, () =>
      Effect.gen(function*() {
        const fs = yield* FileSystem.FileSystem
        const file = yield* fs.open("precision.bin", { flag: "r+" })
        yield* file.seek(oversized, "start")
        const error = yield* Effect.flip(file[method](new Uint8Array([1])))
        assert.strictEqual(error.reason._tag, "BadArgument")
        assert.deepStrictEqual(state.positions, [])
      }).pipe(Effect.provide(NodeFileSystem.layer)))
  }

  it.effect("writeAll stops when a partial write advances beyond the safe integer limit", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const file = yield* fs.open("precision.bin", { flag: "r+" })
      yield* file.seek(maxSafe, "start")
      const error = yield* Effect.flip(file.writeAll(new Uint8Array([1, 2])))
      assert.strictEqual(error.reason._tag, "BadArgument")
      assert.deepStrictEqual(state.positions, [Number.MAX_SAFE_INTEGER])
      assert.strictEqual(yield* file.seek(0n, "current"), maxSafe + 1n)
    }).pipe(Effect.provide(NodeFileSystem.layer)))

  for (const method of ["stat", "fstat"] as const) {
    const getInfo = Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      return yield* method === "stat" ? fs.stat("precision.bin") : (yield* fs.open("precision.bin")).stat
    })

    it.effect(`${method} preserves oversized byte counts`, () =>
      Effect.gen(function*() {
        state.values.size = oversized
        state.values.blksize = oversized
        const info = yield* getInfo
        assert.strictEqual(info.size, ByteSize.bytes(oversized))
        assert.strictEqual(Option.getOrThrow(info.blksize), ByteSize.bytes(oversized))
      }).pipe(Effect.provide(NodeFileSystem.layer)))

    it.effect(`${method} rejects unsafe mode metadata`, () =>
      Effect.gen(function*() {
        state.values.mode = maxSafe + 1n
        const error = yield* Effect.flip(getInfo)
        assert.strictEqual(error.reason._tag, "BadArgument")
      }).pipe(Effect.provide(NodeFileSystem.layer)))

    for (
      const { expected, name, value } of [
        { name: "preserves metadata above MAX_SAFE_INTEGER", value: maxSafe + 1n, expected: 9007199254740992n },
        { name: "interprets signed identifiers as unsigned 64-bit", value: -2n, expected: 18446744073709551614n }
      ]
    ) {
      it.effect(`${method} ${name}`, () =>
        Effect.gen(function*() {
          Object.assign(state.values, { dev: value, ino: value, rdev: value, nlink: value, blocks: value })
          const info = yield* getInfo
          assert.strictEqual(info.dev, expected)
          for (const field of ["ino", "rdev", "nlink"] as const) {
            assert.deepStrictEqual(info[field], Option.some(expected), field)
          }
          assert.deepStrictEqual(info.blocks, Option.some(value))
        }).pipe(Effect.provide(NodeFileSystem.layer)))
    }

    it.effect(`${method} preserves numeric ownership metadata`, () =>
      Effect.gen(function*() {
        Object.assign(state.values, { uid: 1000n, gid: 1001n })
        const info = yield* getInfo
        assert.deepStrictEqual(info.uid, Option.some(1000))
        assert.deepStrictEqual(info.gid, Option.some(1001))
      }).pipe(Effect.provide(NodeFileSystem.layer)))

    it.effect(`${method} omits missing optional metadata`, () =>
      Effect.gen(function*() {
        const fields = ["ino", "nlink", "uid", "gid", "rdev", "blocks"] as const
        for (const field of fields) {
          delete state.values[field]
        }
        const info = yield* getInfo
        for (const field of fields) {
          assert.deepStrictEqual(info[field], Option.none(), field)
        }
        assert.strictEqual(info.type, "File")
        assert.strictEqual(info.size, ByteSize.bytes(4n))
        assert.deepStrictEqual(info.mtime, Option.some(new Date(0)))
      }).pipe(Effect.provide(NodeFileSystem.layer)))
  }
})
