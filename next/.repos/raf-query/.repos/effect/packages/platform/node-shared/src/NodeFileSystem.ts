/**
 * Shared Node-compatible implementation of Effect's `FileSystem` service.
 *
 * This module adapts Node's `node:fs`, `node:os`, and `node:path` APIs into a
 * `FileSystem` layer for Effect programs running on Node-compatible runtimes.
 * Platform packages use it to provide file and directory I/O, permissions,
 * links, metadata, temporary files and directories, and file watching through
 * the shared `FileSystem` service.
 *
 * @since 4.0.0
 */
import * as BI from "effect/BigInt"
import * as ByteSize from "effect/ByteSize"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import { effectify } from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import { pipe } from "effect/Function"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Error from "effect/PlatformError"
import * as Queue from "effect/Queue"
import * as Stream from "effect/Stream"
import * as Crypto from "node:crypto"
import * as NFS from "node:fs"
import * as OS from "node:os"
import * as Path from "node:path"
import { handleErrnoException } from "./internal/utils.ts"

const handleBadArgument = (method: string) => (err: unknown) =>
  Error.badArgument({
    module: "FileSystem",
    method,
    description: (err as Error).message ?? String(err)
  })

const bigintToNumber = (value: bigint, field: string): number => {
  const number = Number(value)
  if (!Number.isSafeInteger(number)) {
    throw new RangeError(`${field} exceeds the safe integer range: ${value}`)
  }
  return number
}

const bigintToNumberOption = (value: bigint | undefined): Option.Option<number> =>
  Option.flatMap(Option.fromNullishOr(value), BI.toNumber)

// fs.write ignores bigint positions.
const positionToNumber = (position: bigint, method: string) =>
  Effect.try({
    try: () => bigintToNumber(position, "position"),
    catch: handleBadArgument(method)
  })

// == access

const access = ((): FileSystem.FileSystem["access"] => {
  const nodeAccess = effectify(
    NFS.access,
    handleErrnoException("FileSystem", "access"),
    handleBadArgument("access")
  )
  return (path, options) => {
    let mode = NFS.constants.F_OK
    if (options?.readable) {
      mode |= NFS.constants.R_OK
    }
    if (options?.writable) {
      mode |= NFS.constants.W_OK
    }
    return nodeAccess(path, mode)
  }
})()

// == copy

const copy = ((): FileSystem.FileSystem["copy"] => {
  const nodeCp = effectify(
    NFS.cp,
    handleErrnoException("FileSystem", "copy"),
    handleBadArgument("copy")
  )
  return (fromPath, toPath, options) =>
    nodeCp(fromPath, toPath, {
      force: options?.overwrite ?? false,
      preserveTimestamps: options?.preserveTimestamps ?? false,
      recursive: true
    })
})()

// == copyFile

const copyFile = (() => {
  const nodeCopyFile = effectify(
    NFS.copyFile,
    handleErrnoException("FileSystem", "copyFile"),
    handleBadArgument("copyFile")
  )
  return (fromPath: string, toPath: string) => nodeCopyFile(fromPath, toPath)
})()

// == chmod

const chmod = (() => {
  const nodeChmod = effectify(
    NFS.chmod,
    handleErrnoException("FileSystem", "chmod"),
    handleBadArgument("chmod")
  )
  return (path: string, mode: number) => nodeChmod(path, mode)
})()

// == chown

const chown = (() => {
  const nodeChown = effectify(
    NFS.chown,
    handleErrnoException("FileSystem", "chown"),
    handleBadArgument("chown")
  )
  return (path: string, uid: number, gid: number) => nodeChown(path, uid, gid)
})()

// == glob

const glob = ((): FileSystem.FileSystem["glob"] => {
  const nodeGlob = effectify(
    NFS.glob,
    handleErrnoException("FileSystem", "glob"),
    handleBadArgument("glob")
  )
  return (pattern: string, options) =>
    nodeGlob(pattern, {
      cwd: options?.root,
      exclude: options?.exclude
    })
})()

// == link

const link = (() => {
  const nodeLink = effectify(
    NFS.link,
    handleErrnoException("FileSystem", "link"),
    handleBadArgument("link")
  )
  return (existingPath: string, newPath: string) => nodeLink(existingPath, newPath)
})()

// == makeDirectory

const makeDirectory = ((): FileSystem.FileSystem["makeDirectory"] => {
  const nodeMkdir = effectify(
    NFS.mkdir,
    handleErrnoException("FileSystem", "makeDirectory"),
    handleBadArgument("makeDirectory")
  )
  return (path, options) =>
    nodeMkdir(path, {
      recursive: options?.recursive ?? false,
      mode: options?.mode
    })
})()

// == makeTempDirectory

const makeTempDirectoryFactory = (method: string): FileSystem.FileSystem["makeTempDirectory"] => {
  const nodeMkdtemp = effectify(
    NFS.mkdtemp,
    handleErrnoException("FileSystem", method),
    handleBadArgument(method)
  )
  return (options) =>
    Effect.suspend(() => {
      const prefix = options?.prefix ?? ""
      const directory = typeof options?.directory === "string"
        ? Path.join(options.directory, ".")
        : OS.tmpdir()

      return nodeMkdtemp(prefix ? Path.join(directory, prefix) : directory + "/")
    })
}
const makeTempDirectory = makeTempDirectoryFactory("makeTempDirectory")

// == remove

const removeFactory = (method: string): FileSystem.FileSystem["remove"] => {
  const nodeRm = effectify(
    NFS.rm,
    handleErrnoException("FileSystem", method),
    handleBadArgument(method)
  )
  return (path, options) =>
    nodeRm(
      path,
      { recursive: options?.recursive ?? false, force: options?.force ?? false }
    )
}
const remove = removeFactory("remove")

// == makeTempDirectoryScoped

const makeTempDirectoryScoped = ((): FileSystem.FileSystem["makeTempDirectoryScoped"] => {
  const makeDirectory = makeTempDirectoryFactory("makeTempDirectoryScoped")
  const removeDirectory = removeFactory("makeTempDirectoryScoped")
  return (options) =>
    Effect.acquireRelease(
      makeDirectory(options),
      (directory) => Effect.orDie(removeDirectory(directory, { recursive: true }))
    )
})()

// == open

const openFactory = (method: string): FileSystem.FileSystem["open"] => {
  const nodeOpen = effectify(
    NFS.open,
    handleErrnoException("FileSystem", method),
    handleBadArgument(method)
  )
  const nodeClose = effectify(
    NFS.close,
    handleErrnoException("FileSystem", method),
    handleBadArgument(method)
  )

  return (path, options) =>
    pipe(
      Effect.acquireRelease(
        nodeOpen(path, options?.flag ?? "r", options?.mode),
        (fd) => Effect.orDie(nodeClose(fd))
      ),
      Effect.map((fd) => makeFile(fd, options?.flag?.startsWith("a") ?? false))
    )
}
const open = openFactory("open")

const makeFile = (() => {
  const nodeReadFactory = (method: string) =>
    effectify(
      NFS.read,
      handleErrnoException("FileSystem", method),
      handleBadArgument(method)
    )
  const nodeRead = nodeReadFactory("read")
  const nodeReadAlloc = nodeReadFactory("readAlloc")
  const nodeStat = effectify(
    NFS.fstat,
    handleErrnoException("FileSystem", "stat"),
    handleBadArgument("stat")
  )
  const nodeTruncate = effectify(
    NFS.ftruncate,
    handleErrnoException("FileSystem", "truncate"),
    handleBadArgument("truncate")
  )

  const nodeSync = effectify(
    NFS.fsync,
    handleErrnoException("FileSystem", "sync"),
    handleBadArgument("sync")
  )

  const nodeWriteFactory = (method: string) =>
    effectify(
      NFS.write,
      handleErrnoException("FileSystem", method),
      handleBadArgument(method)
    )
  const nodeWrite = nodeWriteFactory("write")
  const nodeWriteAll = nodeWriteFactory("writeAll")

  class FileImpl implements FileSystem.File {
    readonly [FileSystem.FileTypeId]: typeof FileSystem.FileTypeId
    readonly fd: number
    private readonly append: boolean

    private position: bigint = BigInt(0)

    constructor(
      fd: number,
      append: boolean
    ) {
      this[FileSystem.FileTypeId] = FileSystem.FileTypeId
      this.fd = fd
      this.append = append
    }

    get stat() {
      return Effect.flatMap(nodeStat(this.fd, { bigint: true }), makeFileInfo)
    }

    get sync() {
      return nodeSync(this.fd)
    }

    seek(offset: bigint, from: FileSystem.SeekMode) {
      return Effect.suspend(() => {
        const position = from === "start" ? offset : this.position + offset
        if (position < BigInt(0)) {
          return Effect.fail(Error.badArgument({
            module: "FileSystem",
            method: "seek",
            description: "Cannot seek before the start of the file"
          }))
        }
        this.position = position
        return Effect.succeed(position)
      })
    }

    read(buffer: Uint8Array) {
      return Effect.suspend(() => {
        const position = this.position
        return Effect.map(
          nodeRead(this.fd, { buffer, position }),
          (bytesRead) => {
            this.position = position + BigInt(bytesRead)
            return bytesRead
          }
        )
      })
    }

    readAlloc(size: number) {
      return Effect.suspend(() => {
        try {
          if (!Number.isInteger(size) || size < 0) {
            throw new RangeError("size must be a non-negative integer")
          }
          const buffer = Buffer.allocUnsafeSlow(size)
          const position = this.position
          return Effect.map(
            nodeReadAlloc(this.fd, { buffer, position }),
            (bytesRead): Option.Option<Buffer> => {
              if (bytesRead === 0) {
                return Option.none()
              }

              this.position = position + BigInt(bytesRead)
              if (bytesRead === size) {
                return Option.some(buffer)
              }

              const dst = Buffer.allocUnsafeSlow(bytesRead)
              buffer.copy(dst, 0, 0, bytesRead)
              return Option.some(dst)
            }
          )
        } catch (cause) {
          return Effect.fail(handleBadArgument("readAlloc")(cause))
        }
      })
    }

    truncate(length?: number) {
      return Effect.map(nodeTruncate(this.fd, length || undefined), () => {
        if (!this.append) {
          const len = BigInt(length ?? 0)
          if (this.position > len) {
            this.position = len
          }
        }
      })
    }

    write(buffer: Uint8Array) {
      return Effect.suspend(() => {
        const position = this.position
        return Effect.flatMap(
          this.append ? Effect.succeed(undefined) : positionToNumber(position, "write"),
          (nodePosition) =>
            Effect.map(
              nodeWrite(this.fd, buffer, undefined, undefined, nodePosition),
              (bytesWritten) => {
                if (!this.append) {
                  this.position = position + BigInt(bytesWritten)
                }
                return bytesWritten
              }
            )
        )
      })
    }

    private writeAllChunk(buffer: Uint8Array): Effect.Effect<void, Error.PlatformError> {
      return Effect.suspend(() => {
        const position = this.position
        return Effect.flatMap(
          this.append ? Effect.succeed(undefined) : positionToNumber(position, "writeAll"),
          (nodePosition) =>
            Effect.flatMap(
              nodeWriteAll(this.fd, buffer, undefined, undefined, nodePosition),
              (bytesWritten) => {
                if (bytesWritten === 0) {
                  return Effect.fail(
                    Error.systemError({
                      module: "FileSystem",
                      method: "writeAll",
                      _tag: "WriteZero",
                      pathOrDescriptor: this.fd,
                      description: "write returned 0 bytes written"
                    })
                  )
                }

                if (!this.append) {
                  this.position = position + BigInt(bytesWritten)
                }

                return bytesWritten < buffer.length ? this.writeAllChunk(buffer.subarray(bytesWritten)) : Effect.void
              }
            )
        )
      })
    }

    writeAll(buffer: Uint8Array) {
      return buffer.length === 0 ? Effect.void : this.writeAllChunk(buffer)
    }
  }

  return (fd: number, append: boolean): FileSystem.File => new FileImpl(fd, append)
})()

// == makeTempFile

const makeTempFileFactory = (method: string): FileSystem.FileSystem["makeTempFile"] => {
  const makeDirectory = makeTempDirectoryFactory(method)
  return Effect.fnUntraced(function*(options) {
    const directory = yield* makeDirectory(options)
    const random = Crypto.randomBytes(6).toString("hex")
    const name = Path.join(directory, options?.suffix ? `${random}${options.suffix}` : random)
    yield* writeFile(name, new Uint8Array(0))
    return name
  })
}
const makeTempFile = makeTempFileFactory("makeTempFile")

// == makeTempFileScoped

const makeTempFileScoped = ((): FileSystem.FileSystem["makeTempFileScoped"] => {
  const makeFile = makeTempFileFactory("makeTempFileScoped")
  const removeDirectory = removeFactory("makeTempFileScoped")
  return (options) =>
    Effect.acquireRelease(
      makeFile(options),
      (file) => Effect.orDie(removeDirectory(Path.dirname(file), { recursive: true }))
    )
})()

// == readDirectory

const readDirectory: FileSystem.FileSystem["readDirectory"] = (path, options) =>
  Effect.tryPromise({
    try: () => NFS.promises.readdir(path, options),
    catch: (err) => handleErrnoException("FileSystem", "readDirectory")(err as any, [path])
  })

// == readFile

const readFile = (path: string) =>
  Effect.callback<Uint8Array, Error.PlatformError>((resume, signal) => {
    try {
      NFS.readFile(path, { signal }, (err, data) => {
        if (err) {
          resume(Effect.fail(handleErrnoException("FileSystem", "readFile")(err, [path])))
        } else {
          resume(Effect.succeed(data))
        }
      })
    } catch (err) {
      resume(Effect.fail(handleBadArgument("readFile")(err)))
    }
  })

// == readLink

const readLink = (() => {
  const nodeReadLink = effectify(
    NFS.readlink,
    handleErrnoException("FileSystem", "readLink"),
    handleBadArgument("readLink")
  )
  return (path: string) => nodeReadLink(path)
})()

// == realPath

const realPath = (() => {
  const nodeRealPath = effectify(
    NFS.realpath,
    handleErrnoException("FileSystem", "realPath"),
    handleBadArgument("realPath")
  )
  return (path: string) => nodeRealPath(path)
})()

// == rename

const rename = (() => {
  const nodeRename = effectify(
    NFS.rename,
    handleErrnoException("FileSystem", "rename"),
    handleBadArgument("rename")
  )
  return (oldPath: string, newPath: string) => nodeRename(oldPath, newPath)
})()

// == stat

const makeFileInfo = (stat: NFS.BigIntStats): Effect.Effect<FileSystem.File.Info, Error.PlatformError> =>
  Effect.try({
    try: (): FileSystem.File.Info => ({
      type: stat.isFile() ?
        "File" :
        stat.isDirectory() ?
        "Directory" :
        stat.isSymbolicLink() ?
        "SymbolicLink" :
        stat.isBlockDevice() ?
        "BlockDevice" :
        stat.isCharacterDevice() ?
        "CharacterDevice" :
        stat.isFIFO() ?
        "FIFO" :
        stat.isSocket() ?
        "Socket" :
        "Unknown",
      mtime: Option.fromNullishOr(stat.mtime),
      atime: Option.fromNullishOr(stat.atime),
      birthtime: Option.fromNullishOr(stat.birthtime),
      dev: bigintToNumber(stat.dev, "dev"),
      rdev: bigintToNumberOption(stat.rdev),
      ino: bigintToNumberOption(stat.ino),
      mode: bigintToNumber(stat.mode, "mode"),
      nlink: bigintToNumberOption(stat.nlink),
      uid: bigintToNumberOption(stat.uid),
      gid: bigintToNumberOption(stat.gid),
      size: ByteSize.bytes(stat.size),
      blksize: stat.blksize !== undefined ? Option.some(ByteSize.bytes(stat.blksize)) : Option.none(),
      blocks: bigintToNumberOption(stat.blocks)
    }),
    catch: handleBadArgument("stat")
  })
const stat = (() => {
  const nodeStat = effectify(
    NFS.stat,
    handleErrnoException("FileSystem", "stat"),
    handleBadArgument("stat")
  )
  return (path: string) => Effect.flatMap(nodeStat(path, { bigint: true }), makeFileInfo)
})()

// == symlink

const symlink = (() => {
  const nodeSymlink = effectify(
    NFS.symlink,
    handleErrnoException("FileSystem", "symlink"),
    handleBadArgument("symlink")
  )
  return (target: string, path: string) => nodeSymlink(target, path)
})()

// == truncate

const truncate = (() => {
  const nodeTruncate = effectify(
    NFS.truncate,
    handleErrnoException("FileSystem", "truncate"),
    handleBadArgument("truncate")
  )
  return (path: string, length?: number) => nodeTruncate(path, length)
})()

// == utimes

const utimes = (() => {
  const nodeUtimes = effectify(
    NFS.utimes,
    handleErrnoException("FileSystem", "utime"),
    handleBadArgument("utime")
  )
  return (path: string, atime: number | Date, mtime: number | Date) => nodeUtimes(path, atime, mtime)
})()

// == watch

const watchNode = (path: string, info: FileSystem.File.Info, options?: FileSystem.WatchOptions) =>
  Stream.callback<FileSystem.WatchEvent, Error.PlatformError>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const directory = info.type === "Directory" ? path : Path.dirname(path)
        const watcher = NFS.watch(path, {
          recursive: options?.recursive ?? false
        }, (event, path) => {
          if (!path) return
          switch (event) {
            case "rename": {
              Effect.runFork(Effect.matchEffect(stat(Path.resolve(directory, path)), {
                onSuccess: (_) => Queue.offer(queue, { _tag: "Create", path }),
                onFailure: (_) => Queue.offer(queue, { _tag: "Remove", path })
              }))
              return
            }
            case "change": {
              Queue.offerUnsafe(queue, { _tag: "Update", path })
              return
            }
          }
        })
        watcher.on("error", (error) => {
          Queue.failCauseUnsafe(
            queue,
            Cause.fail(
              Error.systemError({
                module: "FileSystem",
                _tag: "Unknown",
                method: "watch",
                pathOrDescriptor: path,
                cause: error
              })
            )
          )
        })
        watcher.on("close", () => {
          Queue.endUnsafe(queue)
        })
        return watcher
      }),
      (watcher) => Effect.sync(() => watcher.close())
    )
  )

const watch = (
  backend: Option.Option<FileSystem.WatchBackend["Service"]>,
  path: string,
  options?: FileSystem.WatchOptions
) =>
  stat(path).pipe(
    Effect.map((stat) =>
      backend.pipe(
        Option.flatMap((_) => _.register(path, stat, options)),
        Option.getOrElse(() => watchNode(path, stat, options))
      )
    ),
    Stream.unwrap
  )

// == writeFile

const writeFile: FileSystem.FileSystem["writeFile"] = (path, data, options) =>
  Effect.callback<void, Error.PlatformError>((resume, signal) => {
    try {
      NFS.writeFile(path, data, {
        signal,
        flag: options?.flag,
        mode: options?.mode
      }, (err) => {
        if (err) {
          resume(Effect.fail(handleErrnoException("FileSystem", "writeFile")(err, [path])))
        } else {
          resume(Effect.void)
        }
      })
    } catch (err) {
      resume(Effect.fail(handleBadArgument("writeFile")(err)))
    }
  })

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
 * Provides the `FileSystem` service backed by Node filesystem APIs, including
 * file operations, directory operations, links, metadata, and file watching.
 *
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer.Layer<FileSystem.FileSystem> = Layer.effect(FileSystem.FileSystem)(makeFileSystem)
