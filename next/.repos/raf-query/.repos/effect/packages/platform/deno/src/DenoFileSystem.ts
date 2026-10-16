/**
 * Deno implementation of Effect's `FileSystem` service.
 *
 * @since 4.0.0
 */
import { copy as denoCopy, expandGlob, walk } from "@std/fs"
import { relative } from "@std/path"
import * as ByteSize from "effect/ByteSize"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as PlatformError from "effect/PlatformError"
import * as Stream from "effect/Stream"
import { handleError } from "./internal/error.ts"

const tryPromise = <A>(
  method: string,
  pathOrDescriptor: string | number | undefined,
  evaluate: (signal: AbortSignal) => PromiseLike<A>
) =>
  Effect.tryPromise({
    try: evaluate,
    catch: handleError("FileSystem", method, pathOrDescriptor)
  })

const close = (file: Deno.FsFile, method: string, pathOrDescriptor: string | number) =>
  Effect.orDie(Effect.try({
    try: () => file.close(),
    catch: handleError("FileSystem", method, pathOrDescriptor)
  }))

const collectAsyncIterable = <A>(
  method: string,
  pathOrDescriptor: string | number | undefined,
  evaluate: () => AsyncIterable<A>
) =>
  Effect.tryPromise({
    try: async () => {
      const values = new Array<A>()
      for await (const value of evaluate()) {
        values.push(value)
      }
      return values
    },
    catch: handleError("FileSystem", method, pathOrDescriptor)
  })

const access: FileSystem.FileSystem["access"] = (path, options) => {
  if (!options?.readable && !options?.writable) {
    return Effect.asVoid(tryPromise("access", path, () => Deno.stat(path)))
  }
  return Effect.acquireUseRelease(
    tryPromise("access", path, () =>
      Deno.open(path, {
        ...(options.readable ? { read: true } : {}),
        ...(options.writable ? { write: true } : {})
      })),
    () => Effect.void,
    (file) => close(file, "access", path)
  )
}

const copy: FileSystem.FileSystem["copy"] = (fromPath, toPath, options) =>
  tryPromise("copy", fromPath, () =>
    denoCopy(fromPath, toPath, {
      overwrite: options?.overwrite ?? false,
      preserveTimestamps: options?.preserveTimestamps ?? false
    }))

const copyFile: FileSystem.FileSystem["copyFile"] = (fromPath, toPath) =>
  tryPromise("copyFile", fromPath, () => Deno.copyFile(fromPath, toPath))

const chmod: FileSystem.FileSystem["chmod"] = (path, mode) => tryPromise("chmod", path, () => Deno.chmod(path, mode))

const chown: FileSystem.FileSystem["chown"] = (path, uid, gid) =>
  tryPromise("chown", path, () => Deno.chown(path, uid, gid))

const glob: FileSystem.FileSystem["glob"] = (pattern, options) =>
  Effect.map(
    collectAsyncIterable("glob", pattern, () =>
      expandGlob(pattern, {
        root: options?.root ?? Deno.cwd(),
        exclude: options?.exclude ? [...options.exclude] : []
      })),
    (entries) => entries.map((entry) => entry.path)
  )

const link: FileSystem.FileSystem["link"] = (existingPath, newPath) =>
  tryPromise("link", existingPath, () => Deno.link(existingPath, newPath))

const makeDirectory: FileSystem.FileSystem["makeDirectory"] = (path, options) =>
  tryPromise("makeDirectory", path, () =>
    Deno.mkdir(path, {
      recursive: options?.recursive ?? false,
      ...(options?.mode === undefined ? {} : { mode: options.mode })
    }))

const makeTempDirectoryFactory = (method: string): FileSystem.FileSystem["makeTempDirectory"] => (options) =>
  tryPromise(method, options?.directory, () =>
    Deno.makeTempDir({
      ...(options?.directory === undefined ? {} : { dir: options.directory }),
      ...(options?.prefix === undefined ? {} : { prefix: options.prefix })
    }))

const makeTempDirectory = makeTempDirectoryFactory("makeTempDirectory")

const removeFactory = (method: string): FileSystem.FileSystem["remove"] => (path, options) => {
  const effect = tryPromise(method, path, () => Deno.remove(path, { recursive: options?.recursive ?? false }))
  return options?.force
    ? Effect.catchTag(
      effect,
      "PlatformError",
      (error) => error.reason._tag === "NotFound" ? Effect.void : Effect.fail(error)
    )
    : effect
}

const remove = removeFactory("remove")

const makeTempDirectoryScoped: FileSystem.FileSystem["makeTempDirectoryScoped"] = (options) =>
  Effect.acquireRelease(
    makeTempDirectoryFactory("makeTempDirectoryScoped")(options),
    (directory) => Effect.orDie(removeFactory("makeTempDirectoryScoped")(directory, { recursive: true }))
  )

const openOptions = (flag: FileSystem.OpenFlag = "r", mode?: number): Deno.OpenOptions => {
  const modeOption = mode === undefined ? {} : { mode }
  switch (flag) {
    case "r":
      return { read: true, ...modeOption }
    case "r+":
      return { read: true, write: true, ...modeOption }
    case "w":
      return { write: true, create: true, truncate: true, ...modeOption }
    case "wx":
      return { write: true, createNew: true, ...modeOption }
    case "w+":
      return { read: true, write: true, create: true, truncate: true, ...modeOption }
    case "wx+":
      return { read: true, write: true, createNew: true, ...modeOption }
    case "a":
      return { append: true, create: true, ...modeOption }
    case "ax":
      return { append: true, createNew: true, ...modeOption }
    case "a+":
      return { read: true, append: true, create: true, ...modeOption }
    case "ax+":
      return { read: true, append: true, createNew: true, ...modeOption }
  }
}

const makeFileInfo = (info: Deno.FileInfo): FileSystem.File.Info => ({
  type: info.isFile ?
    "File" :
    info.isDirectory ?
    "Directory" :
    info.isSymlink ?
    "SymbolicLink" :
    info.isBlockDevice ?
    "BlockDevice" :
    info.isCharDevice ?
    "CharacterDevice" :
    info.isFifo ?
    "FIFO" :
    info.isSocket ?
    "Socket" :
    "Unknown",
  mtime: Option.fromNullishOr(info.mtime),
  atime: Option.fromNullishOr(info.atime),
  birthtime: Option.fromNullishOr(info.birthtime),
  dev: info.dev,
  rdev: Option.fromNullishOr(info.rdev),
  ino: Option.fromNullishOr(info.ino),
  mode: info.mode ?? 0,
  nlink: Option.fromNullishOr(info.nlink),
  uid: Option.fromNullishOr(info.uid),
  gid: Option.fromNullishOr(info.gid),
  size: ByteSize.bytes(BigInt(info.size)),
  blksize: Option.map(Option.fromNullishOr(info.blksize), (size) => ByteSize.bytes(BigInt(size))),
  blocks: Option.fromNullishOr(info.blocks)
})

/** A file handle is stateful and must not be used concurrently. */
class FileImpl implements FileSystem.File {
  readonly [FileSystem.FileTypeId]: typeof FileSystem.FileTypeId = FileSystem.FileTypeId
  private readonly file: Deno.FsFile
  private readonly append: boolean
  private position = BigInt(0)
  private nativePosition: bigint | undefined = undefined

  constructor(
    file: Deno.FsFile,
    append: boolean
  ) {
    this.file = file
    this.append = append
  }

  get stat() {
    return Effect.map(
      tryPromise("stat", undefined, () => this.file.stat()),
      makeFileInfo
    )
  }

  get sync() {
    return tryPromise("sync", undefined, () => this.file.sync())
  }

  seek(offset: bigint, from: FileSystem.SeekMode) {
    return Effect.suspend(() => {
      const position = from === "start" ? offset : this.position + offset
      if (position < BigInt(0)) {
        return Effect.fail(PlatformError.badArgument({
          module: "FileSystem",
          method: "seek",
          description: "Cannot seek before the start of the file"
        }))
      }
      this.position = position
      return Effect.succeed(position)
    })
  }

  private readChunk(method: string, buffer: Uint8Array) {
    return Effect.suspend(() => {
      const position = this.position
      return Effect.map(
        tryPromise(
          method,
          undefined,
          async () => {
            if (this.nativePosition !== position) {
              this.file.seekSync(position, Deno.SeekMode.Start)
            }
            this.nativePosition = undefined
            return await this.file.read(buffer)
          }
        ),
        (bytesRead) => {
          this.position = this.nativePosition = position + BigInt(bytesRead ?? 0)
          return bytesRead ?? 0
        }
      )
    })
  }

  read(buffer: Uint8Array) {
    return this.readChunk("read", buffer)
  }

  readAlloc(size: number) {
    return Effect.suspend(() => {
      try {
        if (!Number.isInteger(size) || size < 0) {
          throw new RangeError("size must be a non-negative integer")
        }
        const buffer = new Uint8Array(size)
        return Effect.map(this.readChunk("readAlloc", buffer), (bytesRead) => {
          if (bytesRead === 0) {
            return Option.none()
          }
          return Option.some(bytesRead === size ? buffer : buffer.subarray(0, bytesRead))
        })
      } catch (cause) {
        return Effect.fail(PlatformError.badArgument({
          module: "FileSystem",
          method: "readAlloc",
          description: `Could not allocate a buffer of size ${size}`,
          cause
        }))
      }
    })
  }

  truncate(length?: number) {
    const size = BigInt(length ?? 0)
    return Effect.map(
      tryPromise("truncate", undefined, () => this.file.truncate(Number(size))),
      () => {
        if (!this.append && this.position > size) {
          this.position = size
        }
      }
    )
  }

  private writeChunk(method: string, buffer: Uint8Array) {
    return Effect.suspend(() => {
      const position = this.position
      return Effect.map(
        tryPromise(
          method,
          undefined,
          async () => {
            if (!this.append && this.nativePosition !== position) {
              this.file.seekSync(position, Deno.SeekMode.Start)
            }
            this.nativePosition = undefined
            return await this.file.write(buffer)
          }
        ),
        (bytesWritten) => {
          if (this.append) {
            this.nativePosition = undefined
          } else {
            this.position = this.nativePosition = position + BigInt(bytesWritten)
          }
          return bytesWritten
        }
      )
    })
  }

  write(buffer: Uint8Array) {
    return this.writeChunk("write", buffer)
  }

  private writeAllChunk(buffer: Uint8Array): Effect.Effect<void, PlatformError.PlatformError> {
    return Effect.flatMap(this.writeChunk("writeAll", buffer), (bytesWritten) => {
      if (bytesWritten === 0) {
        return Effect.fail(PlatformError.systemError({
          module: "FileSystem",
          method: "writeAll",
          _tag: "WriteZero",
          description: "write returned 0 bytes written"
        }))
      }
      return bytesWritten < buffer.length
        ? this.writeAllChunk(buffer.subarray(bytesWritten))
        : Effect.void
    })
  }

  writeAll(buffer: Uint8Array) {
    return buffer.length === 0 ? Effect.void : this.writeAllChunk(buffer)
  }
}

const open: FileSystem.FileSystem["open"] = (path, options) => {
  const append = options?.flag?.startsWith("a") ?? false
  return Effect.map(
    Effect.acquireRelease(
      tryPromise("open", path, () => Deno.open(path, openOptions(options?.flag, options?.mode))),
      (file) => close(file, "open", path)
    ),
    (file) => new FileImpl(file, append)
  )
}

const makeTempFileFactory = (method: string): FileSystem.FileSystem["makeTempFile"] => (options) =>
  tryPromise(method, options?.directory, () =>
    Deno.makeTempFile({
      ...(options?.directory === undefined ? {} : { dir: options.directory }),
      ...(options?.prefix === undefined ? {} : { prefix: options.prefix }),
      ...(options?.suffix === undefined ? {} : { suffix: options.suffix })
    }))

const makeTempFile = makeTempFileFactory("makeTempFile")

const makeTempFileScoped: FileSystem.FileSystem["makeTempFileScoped"] = (options) =>
  Effect.acquireRelease(
    makeTempFileFactory("makeTempFileScoped")(options),
    (file) => Effect.orDie(removeFactory("makeTempFileScoped")(file, { force: true }))
  )

const readDirectory: FileSystem.FileSystem["readDirectory"] = (path, options) => {
  if (options?.recursive) {
    return Effect.map(
      collectAsyncIterable("readDirectory", path, () => walk(path)),
      (entries) => entries.map((entry) => relative(path, entry.path)).filter(Boolean)
    )
  }
  return Effect.map(
    collectAsyncIterable("readDirectory", path, () => Deno.readDir(path)),
    (entries) => entries.map((entry) => entry.name)
  )
}

const readFile: FileSystem.FileSystem["readFile"] = (path) =>
  tryPromise("readFile", path, (signal) => Deno.readFile(path, { signal }))

const readLink: FileSystem.FileSystem["readLink"] = (path) => tryPromise("readLink", path, () => Deno.readLink(path))

const realPath: FileSystem.FileSystem["realPath"] = (path) => tryPromise("realPath", path, () => Deno.realPath(path))

const rename: FileSystem.FileSystem["rename"] = (oldPath, newPath) =>
  tryPromise("rename", oldPath, () => Deno.rename(oldPath, newPath))

const stat: FileSystem.FileSystem["stat"] = (path) =>
  Effect.map(
    tryPromise("stat", path, () => Deno.stat(path)),
    makeFileInfo
  )

const symlink: FileSystem.FileSystem["symlink"] = (target, path) =>
  tryPromise("symlink", target, () => Deno.symlink(target, path))

const truncate: FileSystem.FileSystem["truncate"] = (path, length) =>
  tryPromise("truncate", path, () => Deno.truncate(path, length))

const utimes: FileSystem.FileSystem["utimes"] = (path, atime, mtime) =>
  tryPromise("utimes", path, () => Deno.utime(path, atime, mtime))

const watchNative = (
  path: string,
  options?: FileSystem.WatchOptions
): Stream.Stream<FileSystem.WatchEvent, PlatformError.PlatformError> =>
  Stream.unwrap(
    Effect.map(
      Effect.try({
        try: () => Deno.watchFs(path, { recursive: options?.recursive ?? false }),
        catch: handleError("FileSystem", "watch", path)
      }),
      (watcher) =>
        Stream.fromAsyncIterable(watcher, handleError("FileSystem", "watch", path)).pipe(
          Stream.flatMap((event): Stream.Stream<FileSystem.WatchEvent, PlatformError.PlatformError> => {
            switch (event.kind) {
              case "create":
                return Stream.map(Stream.fromIterable(event.paths), (path) => ({ _tag: "Create" as const, path }))
              case "modify":
                return Stream.map(Stream.fromIterable(event.paths), (path) => ({ _tag: "Update" as const, path }))
              case "remove":
                return Stream.map(Stream.fromIterable(event.paths), (path) => ({ _tag: "Remove" as const, path }))
              case "rename":
                return Stream.mapEffect(Stream.fromIterable(event.paths), (path) =>
                  Effect.match(stat(path), {
                    onFailure: () => ({ _tag: "Remove" as const, path }),
                    onSuccess: () => ({ _tag: "Create" as const, path })
                  }))
              default:
                return Stream.empty
            }
          })
        )
    )
  )

const watch = (
  backend: Option.Option<FileSystem.WatchBackend["Service"]>,
  path: string,
  options?: FileSystem.WatchOptions
) =>
  stat(path).pipe(
    Effect.map((info) =>
      backend.pipe(
        Option.flatMap((backend) => backend.register(path, info, options)),
        Option.getOrElse(() => watchNative(path, options))
      )
    ),
    Stream.unwrap
  )

const writeFile: FileSystem.FileSystem["writeFile"] = (path, data, options) => {
  const flag = options?.flag ?? "w"
  if (options?.mode === undefined && (flag === "w" || flag === "wx" || flag === "a" || flag === "ax")) {
    return tryPromise("writeFile", path, (signal) =>
      Deno.writeFile(path, data, {
        append: flag.startsWith("a"),
        createNew: flag.includes("x"),
        signal
      }))
  }
  return Effect.acquireUseRelease(
    tryPromise("writeFile", path, () => Deno.open(path, openOptions(flag, options?.mode))),
    (file) =>
      new FileImpl(file, flag.startsWith("a")).writeAll(data).pipe(
        Effect.mapError((error) =>
          error.reason._tag !== "BadArgument"
            ? PlatformError.systemError({ ...error.reason, method: "writeFile", pathOrDescriptor: path })
            : error
        )
      ),
    (file) => close(file, "writeFile", path)
  )
}

const makeFileSystem = Effect.map(Effect.serviceOption(FileSystem.WatchBackend), (backend) =>
  FileSystem.make({
    access,
    chmod,
    chown,
    copy,
    copyFile,
    glob,
    link,
    makeDirectory,
    makeTempDirectory,
    makeTempDirectoryScoped,
    makeTempFile,
    makeTempFileScoped,
    open,
    readDirectory,
    readFile,
    readLink,
    realPath,
    remove,
    rename,
    stat,
    symlink,
    truncate,
    utimes,
    watch(path, options) {
      return watch(backend, path, options)
    },
    writeFile
  }))

/**
 * Provides the `FileSystem` service backed by Deno filesystem APIs.
 *
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer.Layer<FileSystem.FileSystem> = Layer.effect(FileSystem.FileSystem)(makeFileSystem)
