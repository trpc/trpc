import { assert, describe, it } from "@effect/vitest"
import { ByteSize, Effect, Exit, FileSystem, Latch, Option, PlatformError } from "effect"

const info = (type: FileSystem.File.Type): FileSystem.File.Info => ({
  type,
  mtime: Option.none(),
  atime: Option.none(),
  birthtime: Option.none(),
  dev: 0n,
  ino: Option.none(),
  mode: 0,
  nlink: Option.none(),
  uid: Option.none(),
  gid: Option.none(),
  rdev: Option.none(),
  size: ByteSize.bytes(0),
  blksize: Option.none(),
  blocks: Option.none()
})

const failure = (_tag: PlatformError.SystemErrorTag, method: string, path: string) =>
  PlatformError.systemError({ _tag, module: "FileSystem", method, pathOrDescriptor: path })

// Each directory holds the file `x.ts`. Listings report every entry as
// `"Unknown"`, so `glob` learns entry types from `stat` and `readLink`.
const makeFileSystem = (overrides: {
  readonly directories?: Record<string, ReadonlyArray<string>>
  readonly readDirectory?: (path: string) => Effect.Effect<Array<string>, PlatformError.PlatformError> | undefined
  readonly stat?: (path: string) => Effect.Effect<FileSystem.File.Info, PlatformError.PlatformError> | undefined
  readonly readLink?: (path: string) => Effect.Effect<string, PlatformError.PlatformError>
}) => {
  const directories = overrides.directories ?? { ".": ["a"], "a": ["x.ts"] }
  const readDirectory = (path: string) =>
    overrides.readDirectory?.(path) ??
      (path in directories
        ? Effect.succeed([...directories[path]])
        : Effect.fail(failure("NotFound", "readDirectory", path)))
  return FileSystem.make({
    ...FileSystem.makeNoop({}),
    readDirectory,
    readDirectoryEntries: (path) =>
      Effect.map(readDirectory(path), (names) => names.map((name) => ({ name, type: "Unknown" as const }))),
    stat: (path) =>
      overrides.stat?.(path) ??
        (path in directories
          ? Effect.succeed(info("Directory"))
          : path.endsWith("/x.ts") && path.slice(0, -5) in directories
          ? Effect.succeed(info("File"))
          : Effect.fail(failure("NotFound", "stat", path))),
    // Node and Deno report EINVAL as "Unknown" for a path that is not a link
    readLink: overrides.readLink ?? ((path) => Effect.fail(failure("Unknown", "readLink", path)))
  })
}

// `secret` and `src` are named by literal pattern segments below, and `open`
// is only reached through wildcards
const permissionTree = {
  ".": ["open", "secret", "src"],
  "open": ["x.ts"],
  "secret": ["x.ts"],
  "src": ["x.ts"]
}

// More subdirectories than `glob` walks in forked fibers (16), so the rest are
// walked inline by the fiber that listed them
const wide = Array.from({ length: 64 }, (_, i) => `d${String(i).padStart(2, "0")}`)
const wideTree = Object.fromEntries([[".", wide], ...wide.map((name) => [name, ["x.ts"]])])

// Holds the forked reads `d00` to `d15` until `d63` is being read inline. A
// serial walk never reaches `d63`, so `d00` stops waiting after 200 millis.
const pendingInline = (d00: Effect.Effect<never, PlatformError.PlatformError>) => {
  const inline = Latch.makeUnsafe()
  return makeFileSystem({
    directories: wideTree,
    readDirectory: (path) => {
      const index = wide.indexOf(path)
      return index === 63
        ? Effect.andThen(Latch.open(inline), Effect.never)
        : index === 0
        ? Effect.andThen(Effect.timeoutOption(Latch.await(inline), "200 millis"), d00)
        : index > 0 && index < 16
        ? Effect.andThen(Latch.await(inline), Effect.succeed(["x.ts"]))
        : undefined
    }
  })
}

describe("FileSystem", () => {
  describe("derived glob", () => {
    it.effect("traverses directories whose readLink reports that they are not links", () =>
      Effect.gen(function*() {
        const fs = makeFileSystem({})
        assert.deepStrictEqual(yield* fs.glob("**"), ["a", "a/x.ts"])
      }))

    it.effect.each([".", "../*", "/x"])(
      "fails when probing %s fails unexpectedly",
      (pattern) =>
        Effect.gen(function*() {
          const error = failure("Unknown", "stat", pattern)
          const fs = makeFileSystem({
            stat: (path) => [".", "..", "/"].includes(path) ? Effect.fail(error) : undefined
          })
          assert.deepStrictEqual(yield* Effect.exit(fs.glob(pattern)), Exit.fail(error))
        })
    )

    it.effect("fails when readLink fails unexpectedly", () =>
      Effect.gen(function*() {
        const error = failure("Busy", "readLink", "a")
        const fs = makeFileSystem({ readLink: () => Effect.fail(error) })
        assert.deepStrictEqual(yield* Effect.exit(fs.glob("**")), Exit.fail(error))
      }))

    it.effect("propagates defects from probing stat", () =>
      Effect.gen(function*() {
        const fs = makeFileSystem({ stat: (path) => path === "." ? Effect.die("boom") : undefined })
        assert.isTrue(Exit.hasDies(yield* Effect.exit(fs.glob("."))))
      }))

    it.effect.each<{ readonly pattern: string; readonly root?: string }>([
      { pattern: "**", root: "secret" },
      { pattern: "secret/**" },
      { pattern: "secret/*.ts" }
    ])(
      "fails when a directory named by $pattern (root: $root) cannot be read",
      ({ pattern, root }) =>
        Effect.gen(function*() {
          const error = failure("PermissionDenied", "readDirectory", "secret")
          const fs = makeFileSystem({
            directories: permissionTree,
            readDirectory: (path) => path === "secret" ? Effect.fail(error) : undefined
          })
          assert.deepStrictEqual(yield* Effect.exit(fs.glob(pattern, { root })), Exit.fail(error))
        })
    )

    it.effect("fails when stat denies access to a leading literal", () =>
      Effect.gen(function*() {
        const error = failure("PermissionDenied", "stat", "a")
        const fs = makeFileSystem({
          stat: (path) => path === "a" ? Effect.fail(error) : undefined
        })
        assert.deepStrictEqual(yield* Effect.exit(fs.glob("a/*.ts")), Exit.fail(error))
      }))

    it.effect("returns an empty array when the root is a file", () =>
      Effect.gen(function*() {
        const fs = makeFileSystem({
          readDirectory: (path) =>
            path === "a/x.ts" ? Effect.fail(failure("BadResource", "readDirectory", path)) : undefined
        })
        assert.deepStrictEqual(yield* fs.glob("**", { root: "a/x.ts" }), [])
      }))

    it.effect("reads a literal prefix whose parent cannot be listed", () =>
      Effect.gen(function*() {
        const fs = makeFileSystem({
          directories: permissionTree,
          readDirectory: (path) =>
            path === "." ? Effect.fail(failure("PermissionDenied", "readDirectory", path)) : undefined
        })
        assert.deepStrictEqual(yield* fs.glob("src/*.ts"), ["src/x.ts"])
      }))

    it.effect("skips unreadable directories reached through wildcards and missing literal prefixes", () =>
      Effect.gen(function*() {
        const fs = makeFileSystem({
          directories: permissionTree,
          readDirectory: (path) =>
            path === "secret" ? Effect.fail(failure("PermissionDenied", "readDirectory", path)) : undefined
        })
        assert.deepStrictEqual(yield* fs.glob("*/x.ts"), ["open/x.ts", "src/x.ts"])
        assert.deepStrictEqual(yield* fs.glob("missing/**"), [])
      }))

    it.live("fails when a directory read fails while another read is still pending", () =>
      Effect.gen(function*() {
        const error = failure("Busy", "readDirectory", "d00")
        const fs = pendingInline(Effect.fail(error))
        assert.deepStrictEqual(yield* Effect.exit(Effect.timeout(fs.glob("**"), "1 second")), Exit.fail(error))
      }))

    it.live("is interrupted when a directory read is interrupted while another read is still pending", () =>
      Effect.gen(function*() {
        const fs = pendingInline(Effect.interrupt)
        assert.isTrue(Exit.hasInterrupts(yield* Effect.exit(Effect.timeout(fs.glob("**"), "1 second"))))
      }))

    it.live("fails with an inline read error while forked reads are still pending", () =>
      Effect.gen(function*() {
        const error = failure("Busy", "readDirectory", "d16")
        // `d16` is read inline and fails once the forked reads `d00` to `d15`
        // have all started. Those never finish.
        const forked = Latch.makeUnsafe()
        let started = 0
        const fs = makeFileSystem({
          directories: wideTree,
          readDirectory: (path) =>
            path === "d16"
              ? Effect.andThen(Latch.await(forked), Effect.fail(error))
              : path === "."
              ? undefined
              : Effect.andThen(
                Effect.sync(() => {
                  if (++started === 16) {
                    Latch.openUnsafe(forked)
                  }
                }),
                Effect.never
              )
        })
        assert.deepStrictEqual(yield* Effect.exit(Effect.timeout(fs.glob("**"), "1 second")), Exit.fail(error))
      }))

    it.effect("propagates defects from readLink", () =>
      Effect.gen(function*() {
        const fs = makeFileSystem({ readLink: () => Effect.die("boom") })
        assert.isTrue(Exit.hasDies(yield* Effect.exit(fs.glob("**"))))
      }))
  })
})
