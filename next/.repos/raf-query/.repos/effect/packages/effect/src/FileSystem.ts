/**
 * Defines the portable file system service for Effect programs.
 *
 * `FileSystem` is the boundary between Effect code and the host file system.
 * Platform packages provide concrete layers, while this module defines the
 * operations for reading, writing, inspecting, streaming, and watching files.
 * Operations return `Effect`, `Stream`, or `Sink` values and fail with
 * `PlatformError`. The module also includes file handles, open flags, watch
 * events, and the watch backend service.
 *
 * @since 4.0.0
 */
import * as Arr from "./Array.ts"
import * as ByteSize from "./ByteSize.ts"
import * as Cause from "./Cause.ts"
import * as Context from "./Context.ts"
import * as Effect from "./Effect.ts"
import { pipe } from "./Function.ts"
import * as Layer from "./Layer.ts"
import * as Option from "./Option.ts"
import { badArgument, type PlatformError, systemError } from "./PlatformError.ts"
import { hasProperty } from "./Predicate.ts"
import type * as Pull from "./Pull.ts"
import type { Scope } from "./Scope.ts"
import * as Sink from "./Sink.ts"
import * as Stream from "./Stream.ts"

const TypeId = "~effect/FileSystem"

/**
 * Core interface for file system operations in Effect.
 *
 * **Details**
 *
 * The FileSystem interface provides a comprehensive set of file and directory operations
 * that work cross-platform. All operations return Effect values that can be composed,
 * transformed, and executed safely with proper error handling.
 *
 * **Example** (Accessing file system operations)
 *
 * ```ts import.meta.vitest
 * import { ByteSize, Effect, FileSystem } from "effect"
 *
 * const fileSystem = FileSystem.makeNoop({
 *   exists: () => Effect.succeed(true),
 *   makeDirectory: () => Effect.void,
 *   stat: () => Effect.succeed({ size: ByteSize.bytes(22) } as FileSystem.File.Info),
 *   readFileString: () => Effect.succeed("{\"env\": \"development\"}")
 * })
 *
 * const program = Effect.gen(function*() {
 *   const fs = yield* FileSystem.FileSystem
 *
 *   // Basic file operations
 *   const exists = yield* fs.exists("./config.json")
 *   if (!exists) {
 *     yield* fs.writeFileString("./config.json", "{\"env\": \"development\"}")
 *   }
 *
 *   // Directory operations
 *   yield* fs.makeDirectory("./logs", { recursive: true })
 *
 *   // File information
 *   const stats = yield* fs.stat("./config.json")
 *   // Read the file contents
 *   const content = yield* fs.readFileString("./config.json")
 *   return { size: stats.size, content }
 * })
 *
 * const result = Effect.runSync(Effect.provideService(program, FileSystem.FileSystem, fileSystem))
 * ByteSize.toBigInt(result.size) // => 22n
 * result.content // => "{\"env\": \"development\"}"
 * ```
 *
 * @category services
 * @since 4.0.0
 */
export interface FileSystem {
  readonly [TypeId]: typeof TypeId

  /**
   * Checks whether a file can be accessed.
   * You can optionally specify the level of access to check for.
   */
  readonly access: (
    path: string,
    options?: {
      readonly ok?: boolean | undefined
      readonly readable?: boolean | undefined
      readonly writable?: boolean | undefined
    }
  ) => Effect.Effect<void, PlatformError>
  /**
   * Copy a file or directory from `fromPath` to `toPath`.
   *
   * **Details**
   *
   * Equivalent to `cp -r`.
   */
  readonly copy: (
    fromPath: string,
    toPath: string,
    options?: {
      readonly overwrite?: boolean | undefined
      readonly preserveTimestamps?: boolean | undefined
    }
  ) => Effect.Effect<void, PlatformError>
  /**
   * Copy a file from `fromPath` to `toPath`.
   */
  readonly copyFile: (
    fromPath: string,
    toPath: string
  ) => Effect.Effect<void, PlatformError>
  /**
   * Change the permissions of a file.
   */
  readonly chmod: (
    path: string,
    mode: number
  ) => Effect.Effect<void, PlatformError>
  /**
   * Change the owner and group of a file.
   */
  readonly chown: (
    path: string,
    uid: number,
    gid: number
  ) => Effect.Effect<void, PlatformError>
  /**
   * Glob a directory.
   */
  readonly glob: (
    pattern: string,
    options?: {
      readonly root?: string | undefined
      readonly exclude?: ReadonlyArray<string> | undefined
    }
  ) => Effect.Effect<Array<string>, PlatformError>
  /**
   * Checks whether a path exists.
   */
  readonly exists: (
    path: string
  ) => Effect.Effect<boolean, PlatformError>
  /**
   * Create a hard link from `fromPath` to `toPath`.
   */
  readonly link: (
    fromPath: string,
    toPath: string
  ) => Effect.Effect<void, PlatformError>
  /**
   * Create a directory at `path`. You can optionally specify the mode and
   * whether to recursively create nested directories.
   */
  readonly makeDirectory: (
    path: string,
    options?: {
      readonly recursive?: boolean | undefined
      readonly mode?: number | undefined
    }
  ) => Effect.Effect<void, PlatformError>
  /**
   * Create a temporary directory.
   *
   * **Details**
   *
   * By default the directory will be created inside the system's default
   * temporary directory, but you can specify a different location by setting
   * the `directory` option.
   *
   * You can also specify a prefix for the directory name by setting the
   * `prefix` option.
   */
  readonly makeTempDirectory: (options?: {
    readonly directory?: string | undefined
    readonly prefix?: string | undefined
  }) => Effect.Effect<string, PlatformError>
  /**
   * Create a temporary directory inside a scope.
   *
   * **Details**
   *
   * Functionally equivalent to `makeTempDirectory`, but the directory will be
   * automatically deleted when the scope is closed.
   */
  readonly makeTempDirectoryScoped: (options?: {
    readonly directory?: string | undefined
    readonly prefix?: string | undefined
  }) => Effect.Effect<string, PlatformError, Scope>
  /**
   * Create a temporary file.
   * The directory creation is functionally equivalent to `makeTempDirectory`.
   * The file name will be a randomly generated string.
   */
  readonly makeTempFile: (options?: {
    readonly directory?: string | undefined
    readonly prefix?: string | undefined
    readonly suffix?: string | undefined
  }) => Effect.Effect<string, PlatformError>
  /**
   * Create a temporary file inside a scope.
   *
   * **Details**
   *
   * Functionally equivalent to `makeTempFile`, but the file will be
   * automatically deleted when the scope is closed.
   */
  readonly makeTempFileScoped: (options?: {
    readonly directory?: string | undefined
    readonly prefix?: string | undefined
    readonly suffix?: string | undefined
  }) => Effect.Effect<string, PlatformError, Scope>
  /**
   * Open a file at `path` with the specified `options`.
   *
   * **Details**
   *
   * The file handle will be automatically closed when the scope is closed.
   */
  readonly open: (
    path: string,
    options?: {
      readonly flag?: OpenFlag | undefined
      readonly mode?: number | undefined
    }
  ) => Effect.Effect<File, PlatformError, Scope>
  /**
   * List the contents of a directory.
   *
   * **Details**
   *
   * You can recursively list the contents of nested directories by setting the
   * `recursive` option.
   */
  readonly readDirectory: (
    path: string,
    options?: {
      readonly recursive?: boolean | undefined
    }
  ) => Effect.Effect<Array<string>, PlatformError>
  /**
   * Read the contents of a file.
   */
  readonly readFile: (
    path: string
  ) => Effect.Effect<Uint8Array, PlatformError>
  /**
   * Read the contents of a file.
   */
  readonly readFileString: (
    path: string,
    encoding?: string
  ) => Effect.Effect<string, PlatformError>
  /**
   * Read the destination of a symbolic link.
   */
  readonly readLink: (
    path: string
  ) => Effect.Effect<string, PlatformError>
  /**
   * Resolve a path to its canonicalized absolute pathname.
   */
  readonly realPath: (
    path: string
  ) => Effect.Effect<string, PlatformError>
  /**
   * Remove a file or directory.
   */
  readonly remove: (
    path: string,
    options?: {
      /**
       * When `true`, you can recursively remove nested directories.
       */
      readonly recursive?: boolean | undefined
      /**
       * When `true`, exceptions will be ignored if `path` does not exist.
       */
      readonly force?: boolean | undefined
    }
  ) => Effect.Effect<void, PlatformError>
  /**
   * Rename a file or directory.
   */
  readonly rename: (
    oldPath: string,
    newPath: string
  ) => Effect.Effect<void, PlatformError>
  /**
   * Create a writable `Sink` for the specified `path`.
   */
  readonly sink: (
    path: string,
    options?: {
      readonly flag?: OpenFlag | undefined
      readonly mode?: number | undefined
    }
  ) => Sink.Sink<void, Uint8Array, never, PlatformError>
  /**
   * Get information about a file at `path`. See `File.Info` for metadata limits.
   */
  readonly stat: (
    path: string
  ) => Effect.Effect<File.Info, PlatformError>
  /**
   * Create a readable `Stream` for the specified `path`.
   *
   * **Details**
   *
   * Changing the `bufferSize` option will change the internal buffer size of
   * the stream. It defaults to `4`.
   *
   * The `chunkSize` option will change the size of the chunks emitted by the
   * stream. It defaults to 64kb.
   *
   * Changing `offset` and `bytesToRead` will change the offset and the number
   * of bytes to read from the file.
   */
  readonly stream: (
    path: string,
    options?: {
      readonly bytesToRead?: ByteSize.Input | undefined
      readonly chunkSize?: number | undefined
      readonly offset?: ByteSize.Input | undefined
    }
  ) => Stream.Stream<Uint8Array, PlatformError>
  /**
   * Create a symbolic link from `fromPath` to `toPath`.
   */
  readonly symlink: (
    fromPath: string,
    toPath: string
  ) => Effect.Effect<void, PlatformError>
  /**
   * Truncate a file to a specified length. If the `length` is not specified,
   * the file will be truncated to length `0`.
   */
  readonly truncate: (
    path: string,
    length?: number
  ) => Effect.Effect<void, PlatformError>
  /**
   * Change the file system timestamps of the file at `path`.
   */
  readonly utimes: (
    path: string,
    atime: Date | number,
    mtime: Date | number
  ) => Effect.Effect<void, PlatformError>
  /**
   * Watch a directory or file for changes.
   *
   * **Details**
   *
   * By default, only changes to the direct children of the directory are
   * reported. Set the `recursive` option to `true` to watch for changes in
   * subdirectories as well.
   */
  readonly watch: (path: string, options?: WatchOptions) => Stream.Stream<WatchEvent, PlatformError>
  /**
   * Write data to a file at `path`.
   */
  readonly writeFile: (
    path: string,
    data: Uint8Array,
    options?: {
      readonly flag?: OpenFlag | undefined
      readonly mode?: number | undefined
    }
  ) => Effect.Effect<void, PlatformError>
  /**
   * Write a string to a file at `path`.
   */
  readonly writeFileString: (
    path: string,
    data: string,
    options?: {
      readonly flag?: OpenFlag | undefined
      readonly mode?: number | undefined
    }
  ) => Effect.Effect<void, PlatformError>
}

/**
 * File open flags that determine how a file is opened and what operations are allowed.
 *
 * **Details**
 *
 * These flags correspond to standard POSIX file open modes and control the file access
 * permissions and behavior when opening files.
 *
 * - `"r"` - Read-only. File must exist.
 * - `"r+"` - Read/write. File must exist.
 * - `"w"` - Write-only. Truncates file to zero length or creates new file.
 * - `"wx"` - Like 'w' but fails if file exists.
 * - `"w+"` - Read/write. Truncates file to zero length or creates new file.
 * - `"wx+"` - Like 'w+' but fails if file exists.
 * - `"a"` - Write-only. Appends to file or creates new file.
 * - `"ax"` - Like 'a' but fails if file exists.
 * - `"a+"` - Read/write. Appends to file or creates new file.
 * - `"ax+"` - Like 'a+' but fails if file exists.
 *
 * **Example** (Opening files with flags)
 *
 * ```ts import.meta.vitest
 * import type { FileSystem } from "effect"
 *
 * const flags: ReadonlyArray<FileSystem.OpenFlag> = ["r", "w", "a", "r+"]
 * flags // => ["r", "w", "a", "r+"]
 * ```
 *
 * @category models
 * @since 4.0.0
 */
export type OpenFlag =
  | "r"
  | "r+"
  | "w"
  | "wx"
  | "w+"
  | "wx+"
  | "a"
  | "ax"
  | "a+"
  | "ax+"

/**
 * Service tag for platform file-system operations.
 *
 * **When to use**
 *
 * Use to access or provide operations for files, directories, permissions,
 * streams, and sinks through the Effect context.
 *
 * **Details**
 *
 * This key is used to provide and access the FileSystem service in the Effect context.
 *
 * **Example** (Accessing and providing FileSystem)
 *
 * ```ts import.meta.vitest
 * import { Effect, FileSystem } from "effect"
 *
 * const customFs = FileSystem.makeNoop({
 *   exists: () => Effect.succeed(true),
 *   readFileString: () => Effect.succeed("contents")
 * })
 *
 * // Access the FileSystem service
 * const program = Effect.gen(function*() {
 *   const fs = yield* FileSystem.FileSystem
 *
 *   const exists = yield* fs.exists("./data.txt")
 *   return exists ? yield* fs.readFileString("./data.txt") : undefined
 * })
 *
 * const withCustomFs = Effect.provideService(
 *   program,
 *   FileSystem.FileSystem,
 *   customFs
 * )
 * Effect.runSync(withCustomFs) // => "contents"
 * ```
 *
 * @category services
 * @since 4.0.0
 */
export const FileSystem: Context.Service<FileSystem, FileSystem> = Context.Service("effect/FileSystem")

/**
 * Creates a FileSystem implementation from a partial implementation.
 *
 * **When to use**
 *
 * Use to build a concrete `FileSystem` service from platform-specific core
 * operations while deriving the convenience methods that can be implemented
 * from them.
 *
 * **Details**
 *
 * This function takes a partial FileSystem implementation and automatically provides
 * default implementations for `exists`, `readFileString`, `stream`, `sink`, and
 * `writeFileString` methods based on the provided core methods.
 *
 * @see {@link makeNoop} for a testing stub that accepts method overrides without requiring a complete implementation
 * @see {@link layerNoop} for providing a no-op `FileSystem` as a `Layer` in tests
 *
 * @category constructors
 * @since 4.0.0
 */
export const make = (
  impl: Omit<FileSystem, typeof TypeId | "exists" | "readFileString" | "stream" | "sink" | "writeFileString">
): FileSystem =>
  FileSystem.of({
    ...impl,
    [TypeId]: TypeId,
    exists: (path) =>
      pipe(
        impl.access(path),
        Effect.as(true),
        Effect.catchTag(
          "PlatformError",
          (e) => e.reason._tag === "NotFound" ? Effect.succeed(false) : Effect.fail(e)
        )
      ),
    readFileString: (path, encoding) =>
      Effect.flatMap(impl.readFile(path), (_) =>
        Effect.try({
          try: () => new TextDecoder(encoding).decode(_),
          catch: (cause) =>
            badArgument({
              module: "FileSystem",
              method: "readFileString",
              description: "invalid encoding",
              cause
            })
        })),
    stream: Effect.fnUntraced(function*(path, options) {
      const file = yield* impl.open(path, { flag: "r" })
      const offset = options?.offset === undefined ? undefined : ByteSize.fromInputUnsafe(options.offset)
      if (offset) {
        yield* file.seek(offset, "start")
      }
      const bytesToRead = options?.bytesToRead === undefined
        ? undefined
        : ByteSize.fromInputUnsafe(options.bytesToRead)
      let totalBytesRead = BigInt(0)
      // Validate chunk sizes even for zero-byte reads.
      const chunkSize = Number(BigInt(options?.chunkSize ?? 64 * 1024))
      const readChunk = file.readAlloc(chunkSize)
      return Stream.fromPull(Effect.succeed(
        Effect.flatMap(
          Effect.suspend((): Pull.Pull<Option.Option<Uint8Array>, PlatformError> => {
            if (bytesToRead !== undefined && bytesToRead <= totalBytesRead) {
              return Cause.done()
            }
            return bytesToRead !== undefined && (bytesToRead - totalBytesRead) < chunkSize
              ? file.readAlloc(Number(bytesToRead - totalBytesRead))
              : readChunk
          }),
          Option.match({
            onNone: () => Cause.done(),
            onSome: (buf) => {
              totalBytesRead += BigInt(buf.length)
              return Effect.succeed(Arr.of(buf))
            }
          })
        )
      ))
    }, Stream.unwrap),
    sink: (path, options) =>
      pipe(
        impl.open(path, { ...options, flag: options?.flag ?? "w" }),
        Effect.map((file) => Sink.forEach((_: Uint8Array) => file.writeAll(_))),
        Sink.unwrap
      ),
    writeFileString: (path, data, options) =>
      Effect.flatMap(
        Effect.try({
          try: () => new TextEncoder().encode(data),
          catch: (cause) =>
            badArgument({
              module: "FileSystem",
              method: "writeFileString",
              description: "could not encode string",
              cause
            })
        }),
        (_) => impl.writeFile(path, _, options)
      )
  })

const notFound = (method: string, path: string) =>
  systemError({
    module: "FileSystem",
    method,
    _tag: "NotFound",
    description: "No such file or directory",
    pathOrDescriptor: path
  })

/**
 * Creates a stub `FileSystem` implementation for tests.
 *
 * **Details**
 *
 * By default, `exists` returns `false`, `remove` succeeds, many file operations
 * fail with `PlatformError` `NotFound`, and temporary-directory/file operations
 * die as not implemented. Pass method overrides to provide the behavior needed
 * by a specific test without touching the real file system.
 *
 * **Example** (Creating a no-op FileSystem)
 *
 * ```ts import.meta.vitest
 * import { Effect, FileSystem, PlatformError } from "effect"
 *
 * // Create a test filesystem that only allows reading specific files
 * const testFs = FileSystem.makeNoop({
 *   readFileString: (path) => {
 *     if (path === "test-config.json") {
 *       return Effect.succeed("{\"test\": true}")
 *     }
 *     return Effect.fail(
 *       PlatformError.systemError({
 *         _tag: "NotFound",
 *         module: "FileSystem",
 *         method: "readFileString",
 *         description: "File not found",
 *         pathOrDescriptor: path
 *       })
 *     )
 *   },
 *   exists: (path) => Effect.succeed(path === "test-config.json")
 * })
 *
 * // Use in tests
 * const program = Effect.gen(function*() {
 *   const content = yield* testFs.readFileString("test-config.json")
 *   return content
 * })
 *
 * // Test with the no-op filesystem
 * const testProgram = Effect.provideService(
 *   program,
 *   FileSystem.FileSystem,
 *   testFs
 * )
 * Effect.runSync(testProgram) // => "{\"test\": true}"
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const makeNoop = (fileSystem: Partial<FileSystem>): FileSystem =>
  FileSystem.of({
    [TypeId]: TypeId,
    access(path) {
      return Effect.fail(notFound("access", path))
    },
    chmod(path) {
      return Effect.fail(notFound("chmod", path))
    },
    chown(path) {
      return Effect.fail(notFound("chown", path))
    },
    copy(path) {
      return Effect.fail(notFound("copy", path))
    },
    copyFile(path) {
      return Effect.fail(notFound("copyFile", path))
    },
    glob(pattern) {
      return Effect.fail(notFound("glob", pattern))
    },
    exists() {
      return Effect.succeed(false)
    },
    link(path) {
      return Effect.fail(notFound("link", path))
    },
    makeDirectory() {
      return Effect.die("not implemented")
    },
    makeTempDirectory() {
      return Effect.die("not implemented")
    },
    makeTempDirectoryScoped() {
      return Effect.die("not implemented")
    },
    makeTempFile() {
      return Effect.die("not implemented")
    },
    makeTempFileScoped() {
      return Effect.die("not implemented")
    },
    open(path) {
      return Effect.fail(notFound("open", path))
    },
    readDirectory(path) {
      return Effect.fail(notFound("readDirectory", path))
    },
    readFile(path) {
      return Effect.fail(notFound("readFile", path))
    },
    readFileString(path) {
      return Effect.fail(notFound("readFileString", path))
    },
    readLink(path) {
      return Effect.fail(notFound("readLink", path))
    },
    realPath(path) {
      return Effect.fail(notFound("realPath", path))
    },
    remove() {
      return Effect.void
    },
    rename(oldPath) {
      return Effect.fail(notFound("rename", oldPath))
    },
    sink(path) {
      return Sink.fail(notFound("sink", path))
    },
    stat(path) {
      return Effect.fail(notFound("stat", path))
    },
    stream(path) {
      return Stream.fail(notFound("stream", path))
    },
    symlink(fromPath) {
      return Effect.fail(notFound("symlink", fromPath))
    },
    truncate(path) {
      return Effect.fail(notFound("truncate", path))
    },
    utimes(path) {
      return Effect.fail(notFound("utimes", path))
    },
    watch(path) {
      return Stream.fail(notFound("watch", path))
    },
    writeFile(path) {
      return Effect.fail(notFound("writeFile", path))
    },
    writeFileString(path) {
      return Effect.fail(notFound("writeFileString", path))
    },
    ...fileSystem
  })

/**
 * Creates a Layer that provides a no-op FileSystem implementation for testing.
 *
 * **Details**
 *
 * This is a convenience function that wraps `makeNoop` in a Layer, making it easy
 * to provide the test filesystem to your Effect programs.
 *
 * **Example** (Providing a no-op FileSystem layer)
 *
 * ```ts import.meta.vitest
 * import { Effect, FileSystem } from "effect"
 *
 * // Create a test layer with specific behaviors
 * const testLayer = FileSystem.layerNoop({
 *   readFileString: (path) => Effect.succeed("mocked content"),
 *   exists: () => Effect.succeed(true)
 * })
 *
 * const program = Effect.gen(function*() {
 *   const fs = yield* FileSystem.FileSystem
 *   const content = yield* fs.readFileString("any-file.txt")
 *   return content
 * })
 *
 * // Provide the test layer
 * const testProgram = Effect.provide(program, testLayer)
 * Effect.runSync(testProgram) // => "mocked content"
 * ```
 *
 * @category layers
 * @since 4.0.0
 */
export const layerNoop = (fileSystem: Partial<FileSystem>): Layer.Layer<FileSystem> =>
  Layer.succeed(FileSystem)(makeNoop(fileSystem))

/**
 * Runtime type identifier attached to `FileSystem.File` handles and used by
 * `isFile` to recognize them.
 *
 * **Details**
 *
 * This marker is part of the runtime representation of file handles. Prefer
 * `isFile` when narrowing unknown values.
 *
 * @see {@link File} for the open file handle shape that carries this marker
 * @see {@link isFile} for the public guard that checks this marker
 *
 * @category type IDs
 * @since 4.0.0
 */
export const FileTypeId = "~effect/FileSystem/File"

/**
 * Returns `true` if a value is a `File` handle by checking for the
 * `FileTypeId` marker.
 *
 * **When to use**
 *
 * Use when accepting an unknown value and you need to narrow it to a `File`
 * before calling file-handle operations.
 *
 * **Details**
 *
 * This is a structural marker check. It does not validate the marker value or
 * the shape of the file handle.
 *
 * @see {@link File} for the file-handle interface narrowed by this guard
 * @see {@link FileTypeId} for the runtime marker checked by this guard
 *
 * @category guards
 * @since 4.0.0
 */
export const isFile = (u: unknown): u is File => hasProperty(u, FileTypeId)

/**
 * Interface representing an open file handle.
 *
 * **Details**
 *
 * Provides low-level file operations including reading, writing, seeking,
 * and retrieving file information. File handles are automatically managed
 * within scoped operations to ensure proper cleanup.
 *
 * Each handle tracks its own cursor, which can differ from the POSIX file
 * offset. In append mode, writes go to the end of the file without moving the
 * cursor. Outside append mode, `truncate` clamps a cursor past the new length
 * to that length.
 *
 * **Example** (Working with file handles)
 *
 * ```ts import.meta.vitest
 * import { ByteSize, Effect, FileSystem, Option } from "effect"
 *
 * const file: FileSystem.File = {
 *   [FileSystem.FileTypeId]: FileSystem.FileTypeId,
 *   stat: Effect.succeed({ size: ByteSize.bytes(5) } as FileSystem.File.Info),
 *   seek: () => Effect.succeed(BigInt(0)),
 *   sync: Effect.void,
 *   read: (buffer) => Effect.sync(() => {
 *     buffer.set([1, 2, 3, 4, 5])
 *     return 5
 *   }),
 *   readAlloc: () => Effect.succeed(Option.none()),
 *   truncate: () => Effect.void,
 *   write: (buffer) => Effect.succeed(buffer.length),
 *   writeAll: () => Effect.void
 * }
 *
 * const program = Effect.gen(function*() {
 *   const stats = yield* file.stat
 *   const buffer = new Uint8Array(5)
 *   const bytesRead = yield* file.read(buffer)
 *   yield* file.writeAll(new TextEncoder().encode("Hello"))
 *   yield* file.sync
 *   return { size: stats.size, bytesRead, buffer: Array.from(buffer) }
 * })
 *
 * const result = Effect.runSync(program)
 * ByteSize.toBigInt(result.size) // => 5n
 * result.bytesRead // => 5
 * result.buffer // => [1, 2, 3, 4, 5]
 * ```
 *
 * @category models
 * @since 4.0.0
 */
export interface File {
  readonly [FileTypeId]: typeof FileTypeId
  /**
   * Get information about the open file. See `File.Info` for metadata limits.
   */
  readonly stat: Effect.Effect<File.Info, PlatformError>
  /**
   * Seeks before the start fail with `BadArgument` and leave the cursor unchanged.
   */
  readonly seek: (offset: bigint, from: SeekMode) => Effect.Effect<bigint, PlatformError>
  readonly sync: Effect.Effect<void, PlatformError>
  readonly read: (buffer: Uint8Array) => Effect.Effect<number, PlatformError>
  readonly readAlloc: (size: number) => Effect.Effect<Option.Option<Uint8Array>, PlatformError>
  readonly truncate: (length?: number) => Effect.Effect<void, PlatformError>
  readonly write: (buffer: Uint8Array) => Effect.Effect<number, PlatformError>
  readonly writeAll: (buffer: Uint8Array) => Effect.Effect<void, PlatformError>
}

/**
 * Namespace containing types associated with open file handles, including file
 * descriptors, entry kinds, and stat information.
 *
 * @since 4.0.0
 */
export declare namespace File {
  /**
   * Enumeration of possible file system entry types.
   *
   * **Details**
   *
   * Represents the different types of entries that can exist in a file system,
   * from regular files to special device files and symbolic links.
   *
   * @category models
   * @since 4.0.0
   */
  export type Type =
    | "File"
    | "Directory"
    | "SymbolicLink"
    | "BlockDevice"
    | "CharacterDevice"
    | "FIFO"
    | "Socket"
    | "Unknown"

  /**
   * Comprehensive file information structure.
   *
   * **Details**
   *
   * Contains metadata about a file or directory including type, timestamps,
   * permissions, and size information. This structure is returned by file
   * stat operations.
   *
   * Node and Bun preserve `size` and `blksize` exactly. Optional `number`
   * metadata is `Option.none()` when absent or outside the safe integer range.
   * Unsafe `dev` or `mode` values fail the stat operation with `BadArgument`.
   *
   * **Example** (Inspecting file information)
   *
   * ```ts import.meta.vitest
   * import { ByteSize, FileSystem, Option } from "effect"
   *
   * const info: FileSystem.File.Info = {
   *   type: "File",
   *   mtime: Option.none(),
   *   atime: Option.none(),
   *   birthtime: Option.none(),
   *   dev: 1,
   *   ino: Option.none(),
   *   mode: 0o644,
   *   nlink: Option.none(),
   *   uid: Option.none(),
   *   gid: Option.none(),
   *   rdev: Option.none(),
   *   size: ByteSize.bytes(5),
   *   blksize: Option.none(),
   *   blocks: Option.none()
   * }
   *
   * info.type // => "File"
   * ByteSize.toBigInt(info.size) // => 5n
   * info.mode.toString(8) // => "644"
   *
   * const modified = Option.match(info.mtime, {
   *   onNone: () => "unavailable",
   *   onSome: (mtime) => mtime.toISOString()
   * })
   * modified // => "unavailable"
   * info.type === "File" // => true
   * ```
   *
   * @category models
   * @since 4.0.0
   */
  export interface Info {
    readonly type: Type
    readonly mtime: Option.Option<Date>
    readonly atime: Option.Option<Date>
    readonly birthtime: Option.Option<Date>
    readonly dev: number
    readonly ino: Option.Option<number>
    readonly mode: number
    readonly nlink: Option.Option<number>
    readonly uid: Option.Option<number>
    readonly gid: Option.Option<number>
    readonly rdev: Option.Option<number>
    readonly size: ByteSize.ByteSize
    readonly blksize: Option.Option<ByteSize.ByteSize>
    readonly blocks: Option.Option<number>
  }
}

/**
 * Specifies the reference point for seeking within an open file.
 *
 * **When to use**
 *
 * Use with `File` handles when positioning the cursor before a read or write
 * and the offset must be interpreted from either the start of the file or the
 * current cursor.
 *
 * **Details**
 *
 * - `"start"` seeks from the beginning of the file.
 * - `"current"` seeks from the current cursor position.
 *
 * @see {@link File} for the open file handle API whose `seek` method consumes this mode
 *
 * @category models
 * @since 4.0.0
 */
export type SeekMode = "start" | "current"

/**
 * Options for watching files or directories.
 *
 * @category models
 * @since 4.0.0
 */
export interface WatchOptions {
  /**
   * When `true`, changes in subdirectories are also reported.
   */
  readonly recursive?: boolean | undefined
}

/**
 * Represents file system events emitted when watching files or directories.
 *
 * **When to use**
 *
 * Use when consuming file system watch streams and pattern matching on `_tag`
 * to handle created, updated, or removed paths.
 *
 * **Details**
 *
 * The union covers create, update, and remove events. Each event carries the
 * reported `path`.
 *
 * @see {@link FileSystem} for the service interface whose `watch` operation emits these events
 *
 * @category models
 * @since 4.0.0
 */
export type WatchEvent = WatchEvent.Create | WatchEvent.Update | WatchEvent.Remove

/**
 * Namespace containing the concrete event shapes emitted by `FileSystem.watch`.
 *
 * @since 4.0.0
 */
export declare namespace WatchEvent {
  /**
   * Event representing the creation of a new file or directory.
   *
   * **Details**
   *
   * This event is triggered when a new file or directory is created
   * in the watched location.
   *
   * @category models
   * @since 4.0.0
   */
  export interface Create {
    readonly _tag: "Create"
    readonly path: string
  }

  /**
   * Event representing the modification of an existing file or directory.
   *
   * **Details**
   *
   * This event is triggered when an existing file or directory is
   * modified in the watched location.
   *
   * @category models
   * @since 4.0.0
   */
  export interface Update {
    readonly _tag: "Update"
    readonly path: string
  }

  /**
   * Event representing the deletion of a file or directory.
   *
   * **Details**
   *
   * This event is triggered when a file or directory is deleted
   * from the watched location.
   *
   * @category models
   * @since 4.0.0
   */
  export interface Remove {
    readonly _tag: "Remove"
    readonly path: string
  }
}

/**
 * Service key for file system watch backend implementations.
 *
 * **Details**
 *
 * This service provides the low-level file watching capabilities that can be
 * implemented differently on various platforms (e.g., inotify on Linux,
 * FSEvents on macOS, etc.).
 *
 * **Example** (Providing a custom watch backend)
 *
 * ```ts import.meta.vitest
 * import { Effect, FileSystem, Option, Stream } from "effect"
 *
 * // Custom watch backend implementation
 * const customWatchBackend = {
 *   register: (path: string, stat: FileSystem.File.Info) => {
 *     // Implementation would depend on platform
 *     return Option.some(Stream.empty) // Placeholder implementation
 *   }
 * }
 *
 * const program = Effect.gen(function*() {
 *   const backend = yield* FileSystem.WatchBackend
 *   return Option.isSome(
 *     backend.register("./directory", { type: "Directory" } as FileSystem.File.Info)
 *   )
 * })
 *
 * const withCustomBackend = Effect.provideService(
 *   program,
 *   FileSystem.WatchBackend,
 *   customWatchBackend
 * )
 * Effect.runSync(withCustomBackend) // => true
 * ```
 *
 * @category services
 * @since 4.0.0
 */
export class WatchBackend extends Context.Service<WatchBackend, {
  readonly register: (
    path: string,
    stat: File.Info,
    options?: WatchOptions
  ) => Option.Option<Stream.Stream<WatchEvent, PlatformError>>
}>()("effect/FileSystem/WatchBackend") {}
