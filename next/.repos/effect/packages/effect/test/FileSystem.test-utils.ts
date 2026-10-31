import { assert, expect, it } from "@effect/vitest"
import { Array, ByteSize, Cause, Option, Result } from "effect"
import * as Effect from "effect/Effect"
import * as Fs from "effect/FileSystem"
import * as Glob from "effect/Glob"
import type * as Layer from "effect/Layer"
import * as Stream from "effect/Stream"

export interface TestLayerOptions {
  /** Whether writable access to a directory is supported. Deno's open-based access check rejects directories. Defaults to `true`. */
  readonly accessOnDirectory?: boolean
  /** Whether a scoped temporary file removes its containing directory. Deno removes only the file. Defaults to `true`. */
  readonly tempFileScopedRemovesDirectory?: boolean
  /** Whether `open` can refuse to follow a symlink at the final path component. Defaults to `true`. */
  readonly noFollow?: boolean
}

const posix = (path: string) => path.replaceAll("\\", "/")

const runWith = <E>(layer: Layer.Layer<Fs.FileSystem, E>) => <E2, A>(self: Effect.Effect<A, E2, Fs.FileSystem>) =>
  Effect.runPromise(Effect.provide(self, layer))

export const testLayer = <E>(layer: Layer.Layer<Fs.FileSystem, E>, options: TestLayerOptions = {}) => {
  const runPromise = runWith(layer)

  it("readFile", () =>
    runPromise(Effect.gen(function*() {
      const fs = yield* Fs.FileSystem
      const data = yield* fs.readFile(`${__dirname}/fixtures/text.txt`)
      const text = new TextDecoder().decode(data)
      expect(text.trim()).toEqual("lorem ipsum dolar sit amet")
    })))

  it("makeTempDirectory", () =>
    runPromise(Effect.gen(function*() {
      const fs = yield* Fs.FileSystem
      let dir = ""
      yield* Effect.scoped(Effect.gen(function*() {
        dir = yield* fs.makeTempDirectory()
        const stat = yield* fs.stat(dir)
        expect(stat.type).toEqual("Directory")
      }))
      const stat = yield* fs.stat(dir)
      expect(stat.type).toEqual("Directory")
    })))

  it("makeTempDirectoryScoped", () =>
    runPromise(Effect.gen(function*() {
      const fs = yield* Fs.FileSystem
      let dir = ""
      yield* Effect.scoped(
        Effect.gen(function*() {
          dir = yield* fs.makeTempDirectoryScoped()
          const stat = yield* fs.stat(dir)
          expect(stat.type).toEqual("Directory")
        })
      )
      const error = yield* Effect.flip(fs.stat(dir))
      assert(error.reason._tag === "NotFound")
    })))

  it("makeTempDirectoryScoped tolerates an already removed directory", () =>
    runPromise(Effect.gen(function*() {
      const fs = yield* Fs.FileSystem
      const result = yield* Effect.scoped(Effect.gen(function*() {
        const dir = yield* fs.makeTempDirectoryScoped()
        yield* fs.remove(dir, { recursive: true })
        return "body succeeded"
      }))
      expect(result).toEqual("body succeeded")
    })))

  it("lstat does not follow symbolic links", () =>
    runPromise(Effect.scoped(Effect.gen(function*() {
      const fs = yield* Fs.FileSystem
      const directory = yield* fs.makeTempDirectoryScoped()
      const link = `${directory}/link`
      yield* fs.writeFileString(`${directory}/target`, "")
      yield* fs.symlink(`${directory}/target`, link)
      expect((yield* fs.stat(link)).type).toEqual("File")
      expect((yield* fs.lstat(link)).type).toEqual("SymbolicLink")
    }))))

  it.skipIf(options.accessOnDirectory === false)(
    "access on a writable directory",
    () =>
      runPromise(Effect.gen(function*() {
        const fs = yield* Fs.FileSystem
        yield* Effect.scoped(Effect.gen(function*() {
          const dir = yield* fs.makeTempDirectoryScoped()
          yield* fs.access(dir, { writable: true })
        }))
      }))
  )

  it("makeTempFileScoped cleans up", () =>
    runPromise(Effect.gen(function*() {
      const fs = yield* Fs.FileSystem
      yield* Effect.scoped(Effect.gen(function*() {
        const root = yield* fs.makeTempDirectoryScoped()
        let file = ""
        let dir = ""
        yield* Effect.scoped(Effect.gen(function*() {
          file = yield* fs.makeTempFileScoped({ directory: root })
          const separator = Math.max(file.lastIndexOf("/"), file.lastIndexOf("\\"))
          assert(separator > 0, "Expected temp file path to contain a directory separator")
          dir = file.slice(0, separator)
          const stat = yield* fs.stat(dir)
          expect(stat.type).toEqual("Directory")
        }))
        const fileError = yield* Effect.flip(fs.stat(file))
        assert(fileError.reason._tag === "NotFound")
        if (options.tempFileScopedRemovesDirectory !== false) {
          const directoryError = yield* Effect.flip(fs.stat(dir))
          assert(directoryError.reason._tag === "NotFound")
        }
      }))
    })))

  it("makeTempFileScoped tolerates an already removed directory", () =>
    runPromise(Effect.gen(function*() {
      const fs = yield* Fs.FileSystem
      const result = yield* Effect.scoped(Effect.gen(function*() {
        const root = yield* fs.makeTempDirectoryScoped()
        const file = yield* fs.makeTempFileScoped({ directory: root })
        const separator = Math.max(file.lastIndexOf("/"), file.lastIndexOf("\\"))
        yield* fs.remove(file.slice(0, separator), { recursive: true })
        return "body succeeded"
      }))
      expect(result).toEqual("body succeeded")
    })))

  it("truncate", () =>
    runPromise(Effect.gen(function*() {
      const fs = yield* Fs.FileSystem
      const file = yield* fs.makeTempFile()

      const text = "hello world"
      yield* fs.writeFile(file, new TextEncoder().encode(text))

      const before = yield* Effect.map(fs.readFile(file), (_) => new TextDecoder().decode(_))
      expect(before).toEqual(text)

      yield* fs.truncate(file, 5)
      const truncated = yield* Effect.map(fs.readFile(file), (_) => new TextDecoder().decode(_))
      expect(truncated).toEqual("hello")

      yield* fs.truncate(file)

      const after = yield* Effect.map(fs.readFile(file), (_) => new TextDecoder().decode(_))
      expect(after).toEqual("")
    })))

  it("writeFile with r+ overwrites without truncating", () =>
    runPromise(Effect.gen(function*() {
      const fs = yield* Fs.FileSystem
      const path = yield* fs.makeTempFile()

      yield* fs.writeFileString(path, "abcdef")
      yield* fs.writeFileString(path, "xy", { flag: "r+" })

      assert.strictEqual(yield* fs.readFileString(path), "xycdef")
    })))

  it("writeFile with empty data honors the flag", () =>
    runPromise(Effect.gen(function*() {
      const fs = yield* Fs.FileSystem
      const path = yield* fs.makeTempFile()

      yield* fs.writeFileString(path, "abc")
      yield* fs.writeFileString(path, "")
      assert.strictEqual(yield* fs.readFileString(path), "")

      yield* fs.writeFileString(path, "abc")
      yield* fs.writeFileString(path, "", { flag: "r+" })
      assert.strictEqual(yield* fs.readFileString(path), "abc")
    })))

  it("writeFile with r rejects writes", () =>
    runPromise(Effect.gen(function*() {
      const fs = yield* Fs.FileSystem
      const path = yield* fs.makeTempFile()

      const error = yield* fs.writeFileString(path, "data", { flag: "r" }).pipe(Effect.flip)

      assert(error.reason._tag !== "BadArgument")
      assert.strictEqual(error.reason.method, "writeFile")
      assert.strictEqual(error.reason.pathOrDescriptor, path)
      assert.strictEqual(yield* fs.readFileString(path), "")
    })))

  it("writeFile with a appends", () =>
    runPromise(Effect.gen(function*() {
      const fs = yield* Fs.FileSystem
      const path = yield* fs.makeTempFile()

      yield* fs.writeFileString(path, "abc")
      yield* fs.writeFileString(path, "def", { flag: "a" })

      assert.strictEqual(yield* fs.readFileString(path), "abcdef")
    })))

  it("writeFile with wx exclusively creates", () =>
    runPromise(Effect.gen(function*() {
      const fs = yield* Fs.FileSystem
      const root = yield* fs.makeTempDirectory()
      const path = `${root}/file.txt`

      yield* fs.writeFileString(path, "first", { flag: "wx" })
      yield* fs.writeFileString(path, "second", { flag: "wx" }).pipe(Effect.flip)

      assert.strictEqual(yield* fs.readFileString(path), "first")
    })))

  it("copy with overwrite false preserves an existing destination", () =>
    runPromise(Effect.gen(function*() {
      const fs = yield* Fs.FileSystem
      const root = yield* fs.makeTempDirectory()
      const source = `${root}/source.txt`
      const destination = `${root}/destination.txt`
      yield* fs.writeFileString(source, "source")
      yield* fs.writeFileString(destination, "destination")

      const result = yield* Effect.result(fs.copy(source, destination, { overwrite: false }))

      if (Result.isFailure(result)) {
        assert(result.failure.reason._tag === "AlreadyExists")
        assert.strictEqual(result.failure.reason.method, "copy")
        assert.strictEqual(result.failure.reason.pathOrDescriptor, source)
      }
      assert.strictEqual(yield* fs.readFileString(source), "source")
      assert.strictEqual(yield* fs.readFileString(destination), "destination")
    })))

  it("should track the cursor position when reading", () =>
    runPromise(Effect.gen(function*() {
      const fs = yield* Fs.FileSystem

      yield* Effect.gen(function*() {
        let text: string
        const file = yield* fs.open(`${__dirname}/fixtures/text.txt`)

        text = yield* file.readAlloc(5).pipe(
          Effect.flatMap(Effect.fromOption),
          Effect.map((_) => new TextDecoder().decode(_))
        )
        expect(text).toBe("lorem")

        yield* file.seek(BigInt(7), "current")
        text = yield* file.readAlloc(5).pipe(
          Effect.flatMap(Effect.fromOption),
          Effect.map((_) => new TextDecoder().decode(_))
        )
        expect(text).toBe("dolar")

        yield* file.seek(BigInt(1), "current")
        text = yield* file.readAlloc(8).pipe(
          Effect.flatMap(Effect.fromOption),
          Effect.map((_) => new TextDecoder().decode(_))
        )
        expect(text).toBe("sit amet")

        yield* file.seek(BigInt(0), "start")
        text = yield* file.readAlloc(11).pipe(
          Effect.flatMap(Effect.fromOption),
          Effect.map((_) => new TextDecoder().decode(_))
        )
        expect(text).toBe("lorem ipsum")

        text = yield* fs.stream(`${__dirname}/fixtures/text.txt`, {
          offset: ByteSize.bytes(6),
          bytesToRead: ByteSize.bytes(5)
        }).pipe(
          Stream.map((_) => new TextDecoder().decode(_)),
          Stream.runCollect,
          Effect.map(Array.join(""))
        )
        expect(text).toBe("ipsum")
      }).pipe(
        Effect.scoped
      )
    })))

  it.each([
    { chunkSize: 1.5, bytesToRead: undefined },
    { chunkSize: NaN, bytesToRead: undefined },
    { chunkSize: 1.5, bytesToRead: 0 },
    { chunkSize: NaN, bytesToRead: 0 }
  ])(
    "rejects stream chunkSize $chunkSize with bytesToRead $bytesToRead",
    ({ bytesToRead, chunkSize }) =>
      runPromise(Effect.gen(function*() {
        const fs = yield* Fs.FileSystem
        const chunks: Array<Uint8Array> = []
        const stream = fs.stream(`${__dirname}/fixtures/text.txt`, { bytesToRead, chunkSize })
        const exit = yield* Effect.exit(stream.pipe(
          Stream.tap((chunk) => Effect.sync(() => chunks.push(chunk))),
          Stream.runDrain
        ))

        assert.deepStrictEqual(chunks, [])
        assert.strictEqual(exit._tag, "Failure")
        if (exit._tag === "Failure") {
          assert.isTrue(Cause.hasDies(exit.cause))
          assert.isFalse(Cause.hasFails(exit.cause))
          assert.instanceOf(Cause.squash(exit.cause), RangeError)
        }
      }))
  )

  it("should return a numeric byte count when reading", () =>
    runPromise(Effect.gen(function*() {
      const fs = yield* Fs.FileSystem

      yield* Effect.gen(function*() {
        const file = yield* fs.open(`${__dirname}/fixtures/text.txt`)
        const buffer = new Uint8Array(5)

        assert.strictEqual(yield* file.read(buffer), 5)
        assert.strictEqual(new TextDecoder().decode(buffer), "lorem")
      }).pipe(Effect.scoped)
    })))

  it("should read from a backwards seek", () =>
    runPromise(Effect.gen(function*() {
      const fs = yield* Fs.FileSystem

      yield* Effect.gen(function*() {
        const file = yield* fs.open(`${__dirname}/fixtures/text.txt`)

        const first = yield* file.readAlloc(5).pipe(
          Effect.flatMap(Effect.fromOption),
          Effect.map((_) => new TextDecoder().decode(_))
        )
        expect(first).toBe("lorem")

        yield* file.seek(BigInt(-3), "current")
        const second = yield* file.readAlloc(3).pipe(
          Effect.flatMap(Effect.fromOption),
          Effect.map((_) => new TextDecoder().decode(_))
        )
        expect(second).toBe("rem")
      }).pipe(
        Effect.scoped
      )
    })))

  it.each([
    { offset: BigInt(-1), from: "start" as const },
    { offset: BigInt(-3), from: "start" as const },
    { offset: BigInt(-6), from: "current" as const },
    { offset: BigInt(-8), from: "current" as const }
  ])(
    "should reject seeks before the start of the file ($offset from $from)",
    ({ from, offset }) =>
      runPromise(Effect.gen(function*() {
        const fs = yield* Fs.FileSystem

        yield* Effect.gen(function*() {
          const file = yield* fs.open(`${__dirname}/fixtures/text.txt`)
          const buffer = new Uint8Array(5)
          assert.strictEqual(yield* file.read(buffer), 5)
          assert.strictEqual(new TextDecoder().decode(buffer), "lorem")

          const result = yield* Effect.result(file.seek(offset, from))
          expect(result).toMatchObject({
            _tag: "Failure",
            failure: {
              _tag: "PlatformError",
              reason: { _tag: "BadArgument", module: "FileSystem", method: "seek" }
            }
          })
          assert.strictEqual(yield* file.seek(BigInt(0), "current"), BigInt(5))
          assert.strictEqual(yield* file.read(buffer), 5)
          assert.strictEqual(new TextDecoder().decode(buffer), " ipsu")
          assert.strictEqual(yield* file.seek(BigInt(0), "current"), BigInt(10))

          assert.strictEqual(yield* file.seek(BigInt(-10), "current"), BigInt(0))
          assert.strictEqual(yield* file.read(buffer), 5)
          assert.strictEqual(new TextDecoder().decode(buffer), "lorem")
        }).pipe(Effect.scoped)
      }))
  )

  it.each([-1, 1.5, NaN, Infinity, Number.MAX_VALUE])(
    "readAlloc(%s) fails with BadArgument without moving the cursor",
    (size) =>
      runPromise(Effect.gen(function*() {
        const fs = yield* Fs.FileSystem

        yield* Effect.gen(function*() {
          const file = yield* fs.open(`${__dirname}/fixtures/text.txt`)
          const first = yield* file.readAlloc(6).pipe(Effect.flatMap(Effect.fromOption))
          assert.strictEqual(new TextDecoder().decode(first), "lorem ")

          const exit = yield* Effect.exit(file.readAlloc(size))
          const position = yield* file.seek(BigInt(0), "current")
          const next = yield* file.readAlloc(5).pipe(Effect.flatMap(Effect.fromOption))

          assert.strictEqual(position, BigInt(6))
          assert.strictEqual(new TextDecoder().decode(next), "ipsum")
          assert(exit._tag === "Failure")
          assert.isFalse(Cause.hasDies(exit.cause))
          const error = Cause.findErrorOption(exit.cause)
          assert(Option.isSome(error))
          assert.strictEqual(error.value._tag, "PlatformError")
          assert.strictEqual(error.value.reason._tag, "BadArgument")
          assert.strictEqual(error.value.reason.module, "FileSystem")
          assert.strictEqual(error.value.reason.method, "readAlloc")
        }).pipe(Effect.scoped)
      }))
  )

  it("readAlloc(0) returns None without moving the cursor", () =>
    runPromise(Effect.gen(function*() {
      const fs = yield* Fs.FileSystem

      yield* Effect.gen(function*() {
        const file = yield* fs.open(`${__dirname}/fixtures/text.txt`)
        const first = yield* file.readAlloc(6).pipe(Effect.flatMap(Effect.fromOption))
        assert.strictEqual(new TextDecoder().decode(first), "lorem ")

        assert.deepStrictEqual(yield* file.readAlloc(0), Option.none())
        assert.strictEqual(yield* file.seek(BigInt(0), "current"), BigInt(6))

        const next = yield* file.readAlloc(5).pipe(Effect.flatMap(Effect.fromOption))
        assert.strictEqual(new TextDecoder().decode(next), "ipsum")
      }).pipe(Effect.scoped)
    })))

  it("should read sequentially without an intervening seek", () =>
    runPromise(Effect.gen(function*() {
      const fs = yield* Fs.FileSystem

      yield* Effect.gen(function*() {
        const file = yield* fs.open(`${__dirname}/fixtures/text.txt`)

        const first = yield* file.readAlloc(5).pipe(
          Effect.flatMap(Effect.fromOption),
          Effect.map((_) => new TextDecoder().decode(_))
        )
        expect(first).toBe("lorem")

        const second = yield* file.readAlloc(6).pipe(
          Effect.flatMap(Effect.fromOption),
          Effect.map((_) => new TextDecoder().decode(_))
        )
        expect(second).toBe(" ipsum")
      }).pipe(
        Effect.scoped
      )
    })))

  it("should track the cursor position when writing", () =>
    runPromise(Effect.gen(function*() {
      const fs = yield* Fs.FileSystem

      yield* Effect.gen(function*() {
        let text: string
        const path = yield* fs.makeTempFileScoped()
        const file = yield* fs.open(path, { flag: "w+" })

        assert.strictEqual(yield* file.write(new TextEncoder().encode("lorem ipsum")), 11)
        yield* file.write(new TextEncoder().encode(" "))
        yield* file.write(new TextEncoder().encode("dolor sit amet"))
        text = yield* fs.readFileString(path)
        expect(text).toBe("lorem ipsum dolor sit amet")

        yield* file.seek(BigInt(-4), "current")
        yield* file.write(new TextEncoder().encode("hello world"))
        text = yield* fs.readFileString(path)
        expect(text).toBe("lorem ipsum dolor sit hello world")

        yield* file.seek(BigInt(6), "start")
        yield* file.write(new TextEncoder().encode("blabl"))
        text = yield* fs.readFileString(path)
        expect(text).toBe("lorem blabl dolor sit hello world")
      }).pipe(
        Effect.scoped
      )
    })))

  it("should maintain a read cursor in append mode", () =>
    runPromise(Effect.gen(function*() {
      const fs = yield* Fs.FileSystem

      yield* Effect.gen(function*() {
        let text: string
        const path = yield* fs.makeTempFileScoped()
        const file = yield* fs.open(path, { flag: "a+" })

        yield* file.write(new TextEncoder().encode("foo"))
        yield* file.seek(BigInt(0), "start")

        yield* file.write(new TextEncoder().encode("bar"))
        text = yield* fs.readFileString(path)
        expect(text).toBe("foobar")

        text = yield* file.readAlloc(3).pipe(
          Effect.flatMap(Effect.fromOption),
          Effect.map((_) => new TextDecoder().decode(_))
        )
        expect(text).toBe("foo")

        yield* file.write(new TextEncoder().encode("baz"))
        text = yield* fs.readFileString(path)
        expect(text).toBe("foobarbaz")

        text = yield* file.readAlloc(6).pipe(
          Effect.flatMap(Effect.fromOption),
          Effect.map((_) => new TextDecoder().decode(_))
        )
        expect(text).toBe("barbaz")
      }).pipe(
        Effect.scoped
      )
    })))

  it("should restore the read cursor after an append write", () =>
    runPromise(Effect.gen(function*() {
      const fs = yield* Fs.FileSystem

      yield* Effect.gen(function*() {
        const path = yield* fs.makeTempFileScoped()
        const file = yield* fs.open(path, { flag: "a+" })

        yield* file.write(new TextEncoder().encode("foo"))
        yield* file.seek(BigInt(0), "start")

        const first = yield* file.readAlloc(1).pipe(
          Effect.flatMap(Effect.fromOption),
          Effect.map((_) => new TextDecoder().decode(_))
        )
        expect(first).toBe("f")

        yield* file.write(new TextEncoder().encode("bar"))
        const second = yield* file.readAlloc(2).pipe(
          Effect.flatMap(Effect.fromOption),
          Effect.map((_) => new TextDecoder().decode(_))
        )
        expect(second).toBe("oo")
      }).pipe(
        Effect.scoped
      )
    })))

  it("should keep the current cursor if truncating doesn't affect it", () =>
    runPromise(Effect.gen(function*() {
      const fs = yield* Fs.FileSystem

      yield* Effect.gen(function*() {
        const path = yield* fs.makeTempFileScoped()
        const file = yield* fs.open(path, { flag: "w+" })

        yield* file.write(new TextEncoder().encode("lorem ipsum dolor sit amet"))
        yield* file.seek(BigInt(6), "start")
        yield* file.truncate(11)

        const cursor = yield* file.seek(BigInt(0), "current")
        assert.strictEqual(cursor, BigInt(6))
      }).pipe(
        Effect.scoped
      )
    })))

  it("should update the current cursor if truncating affects it", () =>
    runPromise(Effect.gen(function*() {
      const fs = yield* Fs.FileSystem

      yield* Effect.gen(function*() {
        const path = yield* fs.makeTempFileScoped()
        const file = yield* fs.open(path, { flag: "w+" })

        yield* file.write(new TextEncoder().encode("lorem ipsum dolor sit amet"))
        yield* file.truncate(11)

        const cursor = yield* file.seek(BigInt(0), "current")
        assert.strictEqual(cursor, BigInt(11))
      }).pipe(
        Effect.scoped
      )
    })))

  it("should read from the clamped cursor after truncating", () =>
    runPromise(Effect.gen(function*() {
      const fs = yield* Fs.FileSystem

      yield* Effect.gen(function*() {
        const path = yield* fs.makeTempFileScoped()
        const file = yield* fs.open(path, { flag: "w+" })

        yield* file.write(new TextEncoder().encode("abcdefghij"))
        yield* file.truncate(5)
        yield* fs.writeFile(path, new TextEncoder().encode("xyz"), { flag: "a" })

        const text = yield* file.readAlloc(3).pipe(
          Effect.flatMap(Effect.fromOption),
          Effect.map((_) => new TextDecoder().decode(_))
        )
        expect(text).toBe("xyz")
      }).pipe(
        Effect.scoped
      )
    })))

  it("noFollow rejects symlinks or fails explicitly when unsupported", () =>
    runPromise(
      Effect.gen(function*() {
        const fs = yield* Fs.FileSystem
        const directory = yield* fs.makeTempDirectoryScoped()
        const path = `${directory}/target`
        yield* fs.writeFileString(path, "target")
        if (options.noFollow !== false) {
          yield* fs.open(path, { noFollow: true })
          yield* fs.symlink(path, `${directory}/link`)
        }
        const result = yield* Effect.result(fs.open(
          options.noFollow === false ? path : `${directory}/link`,
          { noFollow: true }
        ))
        expect(result).toMatchObject({
          _tag: "Failure",
          failure: { reason: { _tag: options.noFollow === false ? "BadArgument" : "BadResource" } }
        })
      }).pipe(Effect.scoped)
    ))

  it("concurrent positional reads preserve the cursor", () =>
    runPromise(
      Effect.gen(function*() {
        const fs = yield* Fs.FileSystem
        const file = yield* fs.open(`${__dirname}/fixtures/text.txt`)
        yield* file.seek(BigInt(6), "start")
        const buffer = new Uint8Array(5)
        const [count, allocated] = yield* Effect.all([
          file.read(buffer, { position: BigInt(12) }),
          file.readAlloc(4, { position: BigInt(18) }).pipe(Effect.flatMap(Effect.fromOption))
        ], { concurrency: "unbounded" })
        assert.strictEqual(count, 5)
        assert.strictEqual(new TextDecoder().decode(buffer), "dolar")
        assert.strictEqual(new TextDecoder().decode(allocated), "sit ")
        const next = yield* file.readAlloc(5).pipe(Effect.flatMap(Effect.fromOption))
        assert.strictEqual(new TextDecoder().decode(next), "ipsum")
      }).pipe(Effect.scoped)
    ))

  it.each(["read", "readAlloc"] as const)(
    "%s rejects a negative position",
    (method) =>
      runPromise(
        Effect.gen(function*() {
          const fs = yield* Fs.FileSystem
          const file = yield* fs.open(`${__dirname}/fixtures/text.txt`)
          const result = yield* Effect.result(
            method === "read"
              ? Effect.asVoid(file.read(new Uint8Array(1), { position: BigInt(-1) }))
              : Effect.asVoid(file.readAlloc(1, { position: BigInt(-1) }))
          )
          expect(result).toMatchObject({
            _tag: "Failure",
            failure: { reason: { _tag: "BadArgument", method } }
          })
        }).pipe(Effect.scoped)
      )
  )

  it("makeDirectory requires parents unless recursive", () =>
    runPromise(
      Effect.gen(function*() {
        const fs = yield* Fs.FileSystem
        const root = yield* fs.makeTempDirectoryScoped()
        const directory = `${root}/a/b`
        const file = `${root}/file`

        expect(yield* Effect.flip(fs.makeDirectory(directory))).toMatchObject({
          reason: { _tag: "NotFound", method: "makeDirectory", pathOrDescriptor: directory }
        })
        yield* fs.makeDirectory(directory, { recursive: true })
        yield* fs.makeDirectory(directory, { recursive: true })
        expect(yield* Effect.flip(fs.makeDirectory(directory))).toMatchObject({
          reason: { _tag: "AlreadyExists", method: "makeDirectory", pathOrDescriptor: directory }
        })

        yield* fs.writeFileString(file, "content")
        expect(yield* Effect.flip(fs.makeDirectory(file, { recursive: true }))).toMatchObject({
          reason: { _tag: "AlreadyExists", method: "makeDirectory", pathOrDescriptor: file }
        })
      }).pipe(Effect.scoped)
    ))

  it("remove requires recursive for non-empty directories and force for missing paths", () =>
    runPromise(
      Effect.gen(function*() {
        const fs = yield* Fs.FileSystem
        const root = yield* fs.makeTempDirectoryScoped()
        const directory = `${root}/directory`
        const file = `${root}/file`
        yield* fs.makeDirectory(directory)
        yield* fs.writeFileString(`${directory}/file`, "content")
        yield* fs.writeFileString(file, "content")

        expect(yield* Effect.flip(fs.remove(directory))).toMatchObject({
          reason: { method: "remove", pathOrDescriptor: directory }
        })
        yield* fs.remove(`${directory}/`, { recursive: true })
        assert.isFalse(yield* fs.exists(directory))

        expect(yield* Effect.flip(fs.remove(directory))).toMatchObject({
          reason: { _tag: "NotFound", method: "remove", pathOrDescriptor: directory }
        })
        yield* fs.remove(directory, { force: true })

        yield* Effect.flip(fs.remove(`${file}/`))
        assert.strictEqual(yield* fs.readFileString(file), "content")
      }).pipe(Effect.scoped)
    ))

  it("copy duplicates directory trees and replaces files when overwrite is true", () =>
    runPromise(
      Effect.gen(function*() {
        const fs = yield* Fs.FileSystem
        const root = yield* fs.makeTempDirectoryScoped()
        const source = `${root}/source`
        const destination = `${root}/destination.txt`
        yield* fs.makeDirectory(`${source}/nested`, { recursive: true })
        yield* fs.writeFileString(`${source}/nested/file.txt`, "source")
        yield* fs.writeFileString(destination, "destination")

        yield* fs.copy(source, `${root}/copy/`)
        yield* fs.copy(`${source}/nested/file.txt`, destination, { overwrite: true })
        yield* fs.writeFileString(`${source}/nested/file.txt`, "changed")

        assert.strictEqual(yield* fs.readFileString(`${root}/copy/nested/file.txt`), "source")
        assert.strictEqual(yield* fs.readFileString(destination), "source")

        const missing = `${root}/missing`
        expect(yield* Effect.flip(fs.copy(missing, destination, { overwrite: true }))).toMatchObject({
          reason: { _tag: "NotFound", method: "copy", pathOrDescriptor: missing }
        })
        assert.strictEqual(yield* fs.readFileString(destination), "source")
      }).pipe(Effect.scoped)
    ))

  it("rename moves directories and replaces existing files", () =>
    runPromise(
      Effect.gen(function*() {
        const fs = yield* Fs.FileSystem
        const root = yield* fs.makeTempDirectoryScoped()
        yield* fs.makeDirectory(`${root}/source`)
        yield* fs.writeFileString(`${root}/source/file.txt`, "content")
        yield* fs.writeFileString(`${root}/existing.txt`, "existing")

        yield* fs.rename(`${root}/source/`, `${root}/moved/`)
        yield* fs.rename(`${root}/moved/file.txt`, `${root}/existing.txt`)

        assert.isFalse(yield* fs.exists(`${root}/source`))
        assert.isFalse(yield* fs.exists(`${root}/moved/file.txt`))
        assert.strictEqual(yield* fs.readFileString(`${root}/existing.txt`), "content")

        const missing = `${root}/missing`
        expect(yield* Effect.flip(fs.rename(missing, `${root}/existing.txt`))).toMatchObject({
          reason: { _tag: "NotFound", method: "rename", pathOrDescriptor: missing }
        })
        assert.strictEqual(yield* fs.readFileString(`${root}/existing.txt`), "content")
      }).pipe(Effect.scoped)
    ))

  it.each(
    [
      { flag: "r", initial: "seed", creates: false, readable: true, writable: false, expected: "seed" },
      { flag: "r+", initial: "seed", creates: false, readable: true, writable: true, expected: "xeed" },
      { flag: "w", initial: "", creates: true, readable: false, writable: true, expected: "x" },
      { flag: "wx", initial: undefined, creates: true, readable: false, writable: true, expected: "x" },
      { flag: "w+", initial: "", creates: true, readable: true, writable: true, expected: "x" },
      { flag: "wx+", initial: undefined, creates: true, readable: true, writable: true, expected: "x" },
      { flag: "a", initial: "seed", creates: true, readable: false, writable: true, expected: "seedx" },
      { flag: "ax", initial: undefined, creates: true, readable: false, writable: true, expected: "x" },
      { flag: "a+", initial: "seed", creates: true, readable: true, writable: true, expected: "seedx" },
      { flag: "ax+", initial: undefined, creates: true, readable: true, writable: true, expected: "x" }
    ] as const
  )(
    "open with the $flag flag",
    ({ creates, expected, flag, initial, readable, writable }) =>
      runPromise(
        Effect.gen(function*() {
          const fs = yield* Fs.FileSystem
          const root = yield* fs.makeTempDirectoryScoped()
          const existing = `${root}/existing`
          const missing = `${root}/missing`
          yield* fs.writeFileString(existing, "seed")

          if (initial === undefined) {
            expect(yield* Effect.flip(fs.open(existing, { flag }))).toMatchObject({
              reason: { _tag: "AlreadyExists", method: "open", pathOrDescriptor: existing }
            })
          }
          if (!creates) {
            expect(yield* Effect.flip(fs.open(missing, { flag }))).toMatchObject({
              reason: { _tag: "NotFound", method: "open", pathOrDescriptor: missing }
            })
          }

          const path = initial === undefined ? missing : existing
          const file = yield* fs.open(path, { flag })
          assert.strictEqual(yield* fs.readFileString(path), initial ?? "")

          const write = yield* Effect.result(file.writeAll(new TextEncoder().encode("x")))
          assert.strictEqual(Result.isSuccess(write), writable)
          assert.strictEqual(yield* fs.readFileString(path), expected)

          yield* file.seek(BigInt(0), "start")
          const read = yield* Effect.result(file.readAlloc(1))
          assert.strictEqual(Result.isSuccess(read), readable)
        }).pipe(Effect.scoped)
      )
  )

  it("normalizes NotFound errors for missing paths", () =>
    runPromise(
      Effect.gen(function*() {
        const fs = yield* Fs.FileSystem
        const root = yield* fs.makeTempDirectoryScoped()
        const missing = `${root}/missing`
        const destination = `${root}/destination`
        const operations: Record<string, Effect.Effect<unknown, unknown>> = {
          access: fs.access(missing),
          chmod: fs.chmod(missing, 0o600),
          chown: fs.chown(missing, 0, 0),
          copy: fs.copy(missing, destination),
          copyFile: fs.copyFile(missing, destination),
          link: fs.link(missing, destination),
          readDirectory: fs.readDirectory(missing),
          readFile: fs.readFile(missing),
          readLink: fs.readLink(missing),
          realPath: fs.realPath(missing),
          stat: fs.stat(missing),
          truncate: fs.truncate(missing)
        }

        for (const [method, operation] of Object.entries(operations)) {
          expect(yield* Effect.flip(operation)).toMatchObject({
            reason: { _tag: "NotFound", method, pathOrDescriptor: missing }
          })
        }
      }).pipe(Effect.scoped)
    ))

  it("reports BadResource when a file is used as a directory", () =>
    runPromise(
      Effect.gen(function*() {
        const fs = yield* Fs.FileSystem
        const root = yield* fs.makeTempDirectoryScoped()
        const file = `${root}/file`
        const child = `${file}/child`
        yield* fs.writeFileString(file, "content")

        expect(yield* Effect.flip(fs.readDirectory(file))).toMatchObject({
          reason: { _tag: "BadResource", method: "readDirectory", pathOrDescriptor: file }
        })
        expect(yield* Effect.flip(fs.writeFileString(child, "child"))).toMatchObject({
          reason: { _tag: "BadResource", method: "writeFile", pathOrDescriptor: child }
        })
        expect(yield* Effect.flip(fs.stat(child))).toMatchObject({
          reason: { _tag: "BadResource", method: "stat", pathOrDescriptor: child }
        })
        assert.strictEqual(yield* fs.readFileString(file), "content")
      }).pipe(Effect.scoped)
    ))

  it("zero-fills files extended by truncate or writes past the end", () =>
    runPromise(
      Effect.gen(function*() {
        const fs = yield* Fs.FileSystem
        const path = yield* fs.makeTempFileScoped()
        yield* fs.writeFileString(path, "abc")

        yield* fs.truncate(path, 4)
        assert.deepStrictEqual(yield* fs.readFile(path), new Uint8Array([97, 98, 99, 0]))

        const file = yield* fs.open(path, { flag: "r+" })
        yield* file.truncate(5)
        assert.deepStrictEqual(yield* fs.readFile(path), new Uint8Array([97, 98, 99, 0, 0]))

        yield* file.seek(BigInt(6), "start")
        yield* file.writeAll(new Uint8Array([42]))

        assert.deepStrictEqual(yield* fs.readFile(path), new Uint8Array([97, 98, 99, 0, 0, 0, 42]))
      }).pipe(Effect.scoped)
    ))

  it("scoped temporary resources honor prefixes and are removed when the scope fails", () =>
    runPromise(
      Effect.gen(function*() {
        const fs = yield* Fs.FileSystem
        const root = yield* fs.makeTempDirectoryScoped()
        let directory = ""
        let file = ""

        const error = yield* Effect.gen(function*() {
          directory = yield* fs.makeTempDirectoryScoped({ directory: root, prefix: "directory-" })
          file = yield* fs.makeTempFileScoped({ directory: root, prefix: "file-", suffix: ".txt" })
          yield* fs.writeFileString(`${directory}/file.txt`, "content")
          return yield* Effect.fail("boom")
        }).pipe(Effect.scoped, Effect.flip)

        assert.strictEqual(error, "boom")
        assert.isTrue(posix(directory).startsWith(`${posix(root)}/directory-`))
        assert.isTrue(posix(file).startsWith(`${posix(root)}/file-`))
        assert.isTrue(file.endsWith(".txt"))
        assert.isFalse(yield* fs.exists(directory))
        assert.isFalse(yield* fs.exists(file))
      }).pipe(Effect.scoped)
    ))

  it("stream emits nothing past the end and reports open failures", () =>
    runPromise(
      Effect.gen(function*() {
        const fs = yield* Fs.FileSystem
        const root = yield* fs.makeTempDirectoryScoped()
        const empty = `${root}/empty`
        const populated = `${root}/populated`
        const missing = `${root}/missing`
        yield* fs.writeFileString(empty, "")
        yield* fs.writeFileString(populated, "content")

        assert.deepStrictEqual(yield* Stream.runCollect(fs.stream(empty)), [])
        assert.deepStrictEqual(yield* Stream.runCollect(fs.stream(populated, { offset: ByteSize.bytes(20) })), [])
        expect(yield* Effect.flip(Stream.runDrain(fs.stream(missing)))).toMatchObject({
          reason: { _tag: "NotFound", method: "open", pathOrDescriptor: missing }
        })
      }).pipe(Effect.scoped)
    ))

  it("sink truncates by default and appends with the a flag", () =>
    runPromise(
      Effect.gen(function*() {
        const fs = yield* Fs.FileSystem
        const path = yield* fs.makeTempFileScoped()
        yield* fs.writeFileString(path, "old content")

        yield* Stream.run(Stream.make(new TextEncoder().encode("new")), fs.sink(path))
        assert.strictEqual(yield* fs.readFileString(path), "new")

        yield* Stream.run(Stream.make(new TextEncoder().encode(" appended")), fs.sink(path, { flag: "a" }))
        assert.strictEqual(yield* fs.readFileString(path), "new appended")
      }).pipe(Effect.scoped)
    ))

  it("link and symlink resolve to the target file", () =>
    runPromise(
      Effect.gen(function*() {
        const fs = yield* Fs.FileSystem
        const root = yield* fs.makeTempDirectoryScoped()
        const target = `${root}/target`
        const hard = `${root}/hard`
        const relative = `${root}/relative`
        const absolute = `${root}/absolute`
        const loop = `${root}/loop-a`
        yield* fs.writeFileString(target, "content")

        yield* fs.link(target, hard)
        yield* fs.writeFileString(hard, "linked")
        assert.strictEqual(yield* fs.readFileString(target), "linked")

        yield* fs.symlink("target", relative)
        yield* fs.symlink(target, absolute)
        assert.strictEqual(yield* fs.readLink(relative), "target")
        assert.strictEqual(yield* fs.readLink(absolute), target)
        assert.strictEqual(yield* fs.realPath(relative), yield* fs.realPath(target))
        assert.strictEqual(yield* fs.realPath(absolute), yield* fs.realPath(target))
        assert.strictEqual(yield* fs.readFileString(relative), "linked")

        yield* fs.symlink("loop-b", loop)
        yield* fs.symlink("loop-a", `${root}/loop-b`)
        expect(yield* Effect.flip(fs.realPath(loop))).toMatchObject({
          reason: { method: "realPath", pathOrDescriptor: loop }
        })
      }).pipe(Effect.scoped)
    ))

  it("utimes sets timestamps and copy with preserveTimestamps keeps mtime", () =>
    runPromise(
      Effect.gen(function*() {
        const fs = yield* Fs.FileSystem
        const root = yield* fs.makeTempDirectoryScoped()
        const source = `${root}/source`
        const destination = `${root}/destination`
        const atime = new Date("2001-02-03T04:05:06.000Z")
        const mtime = new Date("2002-03-04T05:06:07.000Z")
        yield* fs.writeFileString(source, "content")

        yield* fs.utimes(source, atime, mtime)
        const info = yield* fs.stat(source)
        assert.deepStrictEqual(info.atime, Option.some(atime))
        assert.deepStrictEqual(info.mtime, Option.some(mtime))

        yield* fs.copy(source, destination, { preserveTimestamps: true })
        assert.deepStrictEqual((yield* fs.stat(destination)).mtime, Option.some(mtime))
      }).pipe(Effect.scoped)
    ))

  it("glob honors exclude patterns", () =>
    runPromise(
      Effect.gen(function*() {
        const fs = yield* Fs.FileSystem
        const root = yield* fs.makeTempDirectoryScoped()
        yield* fs.makeDirectory(`${root}/src`)
        yield* fs.writeFileString(`${root}/src/index.ts`, "")
        yield* fs.writeFileString(`${root}/src/index.test.ts`, "")
        yield* fs.writeFileString(`${root}/src/readme.md`, "")

        const matches = yield* fs.glob("**/*.ts", { root, exclude: ["**/*.test.ts"] })

        assert.strictEqual(matches.length, 1)
        assert.isTrue(posix(matches[0]).endsWith("src/index.ts"))
      }).pipe(Effect.scoped)
    ))

  it("readDirectoryEntries reports the type of each entry itself", () =>
    runPromise(
      Effect.gen(function*() {
        const fs = yield* Fs.FileSystem
        const dir = yield* fs.makeTempDirectoryScoped()
        yield* fs.makeDirectory(`${dir}/directory`)
        yield* fs.writeFileString(`${dir}/file`, "")
        yield* fs.symlink(`${dir}/directory`, `${dir}/link`)
        const entries = yield* fs.readDirectoryEntries(dir)
        expect([...entries].sort((a, b) => a.name.localeCompare(b.name))).toEqual([
          { name: "directory", type: "Directory" },
          { name: "file", type: "File" },
          { name: "link", type: "SymbolicLink" }
        ])
      }).pipe(Effect.scoped)
    ))

  testGlob(layer)
}

export const testGlob = <E>(layer: Layer.Layer<Fs.FileSystem, E>) => {
  const runPromise = runWith(layer)

  const globFixture = Effect.gen(function*() {
    const fs = yield* Fs.FileSystem
    const root = yield* fs.makeTempDirectoryScoped()
    for (const directory of ["src/sub", "a", "b", ".hidden", "node_modules/pkg"]) {
      yield* fs.makeDirectory(`${root}/${directory}`, { recursive: true })
    }
    for (
      const file of [
        "README.md",
        ".env",
        "src/index.ts",
        "src/sub/deep.ts",
        "src/sub/deep.js",
        "a/x.ts",
        "b/y.ts",
        ".hidden/secret.ts",
        "node_modules/pkg/index.ts"
      ]
    ) {
      yield* fs.writeFileString(`${root}/${file}`, "")
    }
    return root
  })

  it.each<{
    readonly pattern: string
    readonly exclude?: ReadonlyArray<string>
    readonly dot?: boolean
    readonly expected: ReadonlyArray<string>
  }>([
    {
      pattern: "**/*.ts",
      expected: ["a/x.ts", "b/y.ts", "node_modules/pkg/index.ts", "src/index.ts", "src/sub/deep.ts"]
    },
    { pattern: ".*", expected: [".env", ".hidden"] },
    { pattern: "src/**", expected: ["src", "src/index.ts", "src/sub", "src/sub/deep.js", "src/sub/deep.ts"] },
    { pattern: "*/", expected: ["a", "b", "node_modules", "src"] },
    { pattern: "{a,b}/*.ts", expected: ["a/x.ts", "b/y.ts"] },
    { pattern: "src/index.ts", expected: ["src/index.ts"] },
    { pattern: "readme.*", expected: [] },
    { pattern: "**/.", expected: [] },
    { pattern: "src/index.ts/.", expected: [] },
    { pattern: "src/.", expected: ["src"] },
    {
      pattern: "**/*.ts",
      exclude: ["node_modules"],
      dot: true,
      expected: [".hidden/secret.ts", "a/x.ts", "b/y.ts", "src/index.ts", "src/sub/deep.ts"]
    },
    { pattern: "*", exclude: ["**/src/", "**/README.md/"], expected: ["README.md", "a", "b", "node_modules"] }
  ])("glob $pattern (exclude: $exclude, dot: $dot)", ({ dot, exclude, expected, pattern }) =>
    runPromise(
      Effect.gen(function*() {
        const fs = yield* Fs.FileSystem
        const root = yield* globFixture
        expect(yield* fs.glob(pattern, { root, exclude, dot })).toEqual(expected)
      }).pipe(Effect.scoped)
    ))

  it("glob returns absolute paths for an absolute pattern", () =>
    runPromise(
      Effect.gen(function*() {
        const fs = yield* Fs.FileSystem
        const root = (yield* globFixture).replaceAll("\\", "/")
        expect(yield* fs.glob(`${Glob.escape(root)}/src/**/*.ts`)).toEqual([
          `${root}/src/index.ts`,
          `${root}/src/sub/deep.ts`
        ])
      }).pipe(Effect.scoped)
    ))

  it("glob resolves .. segments against root", () =>
    runPromise(
      Effect.gen(function*() {
        const fs = yield* Fs.FileSystem
        const root = yield* globFixture
        expect(yield* fs.glob("../a/*.ts", { root: `${root}/src` })).toEqual(["../a/x.ts"])
      }).pipe(Effect.scoped)
    ))

  it("glob returns an empty array for a missing root", () =>
    runPromise(
      Effect.gen(function*() {
        const fs = yield* Fs.FileSystem
        const root = yield* fs.makeTempDirectoryScoped()
        expect(yield* fs.glob("**", { root: `${root}/missing` })).toEqual([])
      }).pipe(Effect.scoped)
    ))

  it("glob includes a dangling symlink named by a literal or wildcard", () =>
    runPromise(
      Effect.gen(function*() {
        const fs = yield* Fs.FileSystem
        const root = yield* fs.makeTempDirectoryScoped()
        yield* fs.symlink(`${root}/missing`, `${root}/dangling`)
        assert.deepStrictEqual(yield* fs.glob("dangling", { root }), ["dangling"])
        assert.deepStrictEqual(yield* fs.glob("dang*", { root }), ["dangling"])
      }).pipe(Effect.scoped)
    ))

  it("glob follows a named symlink but not through **", () =>
    runPromise(
      Effect.gen(function*() {
        const fs = yield* Fs.FileSystem
        const root = yield* fs.makeTempDirectoryScoped()
        yield* fs.makeDirectory(`${root}/target`)
        yield* fs.writeFileString(`${root}/target/file.ts`, "")
        yield* fs.symlink(`${root}/target`, `${root}/link`)
        // a link back to the root would loop if `**` followed it
        yield* fs.symlink(root, `${root}/target/loop`)
        expect(yield* fs.glob("**", { root })).toEqual(["link", "target", "target/file.ts", "target/loop"])
        expect(yield* fs.glob("link/*.ts", { root })).toEqual(["link/file.ts"])
      }).pipe(Effect.scoped)
    ))
}
