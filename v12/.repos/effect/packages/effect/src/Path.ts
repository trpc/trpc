/**
 * Provides path operations through the Effect environment.
 *
 * The `Path` service works with file system paths without tying code to one
 * concrete platform module. It exposes common operations such as joining,
 * normalizing, parsing, formatting, resolving, and converting paths to or from
 * file URLs. This module includes the service interface, parsed path type,
 * service tag, runtime marker, and built-in POSIX path layer.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Context from "./Context.ts"
import * as Effect from "./Effect.ts"
import { identity } from "./Function.ts"
import * as Layer from "./Layer.ts"
import * as Option from "./Option.ts"
import { BadArgument } from "./PlatformError.ts"

/**
 * Runtime type identifier used to mark implementations of the `Path` service.
 *
 * **Details**
 *
 * The marker is the exact string stored on `Path` service implementations.
 * Most code should depend on the `Path` service instead of inspecting this
 * value directly.
 *
 * @see {@link layer} for the built-in POSIX `Path` service layer
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export const TypeId = "~effect/Path"

/**
 * Defines the service interface for platform-specific path manipulation.
 *
 * **When to use**
 *
 * Use to depend on path operations through the Effect environment instead of a
 * concrete host path module.
 *
 * **Details**
 *
 * The service exposes operations for joining, normalizing, parsing,
 * formatting, and converting file system paths. URL conversion methods return
 * `Effect`s because invalid file URLs or paths can fail with `BadArgument`.
 *
 * `resolveWithin(root, input)` resolves a relative `input` beneath `root` and
 * returns `Option.none()` when the result would leave the root or when `input`
 * has its own root (an absolute path, or a Windows drive or UNC prefix). The
 * root itself is allowed. The check is lexical: it does not follow symlinks,
 * so it is not a sandbox on its own. A relative `root` is resolved against the
 * current working directory, as with `resolve`.
 *
 * **Example** (Using path operations)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, Path } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const path = yield* Path.Path
 *
 *   return {
 *     joined: path.join("home", "user", "documents"),
 *     normalized: path.normalize("./path/../to/file.txt"),
 *     basename: path.basename("/path/to/file.txt"),
 *     dirname: path.dirname("/path/to/file.txt"),
 *     extname: path.extname("file.txt"),
 *     isAbsolute: path.isAbsolute("/absolute/path"),
 *     name: path.parse("/path/to/file.txt").name,
 *     relative: path.relative("/from/path", "/to/path"),
 *     resolved: path.resolve("/base", "relative", "path"),
 *     within: path.resolveWithin("/base", "../outside")
 *   }
 * })
 *
 * const result = Effect.runSync(Effect.provide(program, Path.layer))
 * result.joined // => "home/user/documents"
 * result.normalized // => "to/file.txt"
 * result.basename // => "file.txt"
 * result.dirname // => "/path/to"
 * result.extname // => ".txt"
 * result.isAbsolute // => true
 * result.name // => "file"
 * result.relative // => "../../to/path"
 * result.resolved // => "/base/relative/path"
 * result.within // => Option.none()
 * ```
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export interface Path {
  readonly [TypeId]: typeof TypeId
  readonly sep: string
  readonly basename: (path: string, suffix?: string) => string
  readonly dirname: (path: string) => string
  readonly extname: (path: string) => string
  readonly format: (pathObject: Partial<Path.Parsed>) => string
  readonly fromFileUrl: (url: URL) => Effect.Effect<string, BadArgument>
  readonly isAbsolute: (path: string) => boolean
  readonly join: (...paths: ReadonlyArray<string>) => string
  readonly normalize: (path: string) => string
  readonly parse: (path: string) => Path.Parsed
  readonly relative: (from: string, to: string) => string
  readonly resolve: (...pathSegments: ReadonlyArray<string>) => string
  readonly resolveWithin: (root: string, input: string) => Option.Option<string>
  readonly toFileUrl: (path: string) => Effect.Effect<URL, BadArgument>
  readonly toNamespacedPath: (path: string) => string
}

/**
 * Namespace containing types associated with the `Path` service.
 *
 * **When to use**
 *
 * Use to reference types associated with path parsing and formatting.
 *
 * **Example** (Working with parsed paths)
 *
 * ```ts import.meta.vitest
 * import { Effect, Path } from "effect"
 *
 * // Access types and utilities in the Path namespace
 * const program = Effect.gen(function*() {
 *   const path = yield* Path.Path
 *
 *   // Parse a path and get a Path.Parsed object
 *   const parsed = path.parse("/home/user/file.txt")
 *
 *   // The parsed object conforms to the Path.Parsed interface
 *   const exampleParsed = {
 *     root: "/",
 *     dir: "/home/user",
 *     base: "file.txt",
 *     ext: ".txt",
 *     name: "file"
 *   }
 *
 *   return [parsed.base, exampleParsed.base]
 * })
 *
 * Effect.runSync(Effect.provide(program, Path.layer)) // => ["file.txt", "file.txt"]
 * ```
 *
 * @stability unstable
 * @since 4.0.0
 */
export declare namespace Path {
  /**
   * Structured representation of a parsed file system path.
   *
   * **When to use**
   *
   * Use to model the object form produced by `Path.parse` and consumed by
   * `Path.format`.
   *
   * **Details**
   *
   * The fields correspond to the path root, directory, base filename,
   * extension, and filename without extension, matching the shape consumed by
   * `Path.format`.
   *
   * **Example** (Parsing and formatting paths)
   *
   * ```ts import.meta.vitest
   * import { Effect, Path } from "effect"
   *
   * const program = Effect.gen(function*() {
   *   const path = yield* Path.Path
   *
   *   // Parse a path into its components
   *   const parsed = path.parse("/home/user/documents/file.txt")
   *   // Format a path from its components
   *   const formatted = path.format({
   *     dir: "/home/user",
   *     name: "newfile",
   *     ext: ".ts"
   *   })
   *   return { dir: parsed.dir, base: parsed.base, formatted }
   * })
   *
   * const result = Effect.runSync(Effect.provide(program, Path.layer))
   * result.dir // => "/home/user/documents"
   * result.base // => "file.txt"
   * result.formatted // => "/home/user/newfile.ts"
   * ```
   *
   * @category models
   * @since 4.0.0
   */
  export interface Parsed {
    readonly root: string
    readonly dir: string
    readonly base: string
    readonly ext: string
    readonly name: string
  }
}

/**
 * Service tag for accessing the current `Path` implementation.
 *
 * **When to use**
 *
 * Use when you need path operations supplied by an effect's environment.
 *
 * **Example** (Providing a custom Path service)
 *
 * ```ts import.meta.vitest
 * import { Effect, Layer, Path } from "effect"
 *
 * // Create a custom path implementation
 * const customPath = Path.make({
 *   sep: "/",
 *   basename: (path: string, suffix?: string) => {
 *     const base = path.split("/").pop() || ""
 *     return suffix && base.endsWith(suffix)
 *       ? base.slice(0, -suffix.length)
 *       : base
 *   },
 *   dirname: (path: string) => path.split("/").slice(0, -1).join("/") || "/",
 *   extname: (path: string) => {
 *     const match = path.match(/\.[^.]*$/)
 *     return match ? match[0] : ""
 *   },
 *   format: (pathObject) => {
 *     const dir = pathObject.dir || ""
 *     const name = pathObject.name || ""
 *     const ext = pathObject.ext || ""
 *     return dir ? `${dir}/${name}${ext}` : `${name}${ext}`
 *   },
 *   fromFileUrl: (url: URL) => Effect.succeed(url.pathname),
 *   isAbsolute: (path: string) => path.startsWith("/"),
 *   join: (...paths: ReadonlyArray<string>) => paths.join("/"),
 *   normalize: (path: string) => path.replace(/\/+/g, "/"),
 *   parse: (path: string) => ({
 *     root: path.startsWith("/") ? "/" : "",
 *     dir: path.split("/").slice(0, -1).join("/") || "/",
 *     base: path.split("/").pop() || "",
 *     ext: path.match(/\.[^.]*$/)?.[0] || "",
 *     name: path.split("/").pop()?.replace(/\.[^.]*$/, "") || ""
 *   }),
 *   relative: (from: string, to: string) => to.replace(from, ""),
 *   resolve: (...pathSegments: ReadonlyArray<string>) => pathSegments.join("/"),
 *   toFileUrl: (path: string) => Effect.succeed(new URL(`file://${path}`)),
 *   toNamespacedPath: (path: string) => path
 * })
 *
 * // Provide the path service
 * const customPathLayer = Layer.succeed(Path.Path)(customPath)
 *
 * const program = Effect.gen(function*() {
 *   const path = yield* Path.Path
 *   return path.join("home", "user", "file.txt")
 * })
 *
 * // Run with custom path implementation
 * Effect.runSync(Effect.provide(program, customPathLayer)) // => "home/user/file.txt"
 * ```
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const Path: Context.Service<Path, Path> = Context.Service("effect/Path")

/**
 * Creates a `Path` service from platform path operations.
 *
 * **When to use**
 *
 * Use to build a `Path` implementation, such as a platform layer or a test
 * double, without implementing the operations that can be derived from the
 * others.
 *
 * **Details**
 *
 * Adds the `Path` type marker and derives `resolveWithin` from the provided
 * `parse`, `resolve`, `relative`, `isAbsolute`, and `sep`, so containment
 * follows the same platform rules as those operations.
 *
 * @see {@link layer} for the built-in POSIX `Path` service layer
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = (impl: Omit<Path, typeof TypeId | "resolveWithin">): Path =>
  Path.of({
    ...impl,
    [TypeId]: TypeId,
    resolveWithin(root, input) {
      if (impl.parse(input).root !== "") return Option.none()
      const base = impl.resolve(root)
      const candidate = impl.resolve(base, input)
      const relative = impl.relative(base, candidate)
      return relative === ".." || relative.startsWith(`..${impl.sep}`) || impl.isAbsolute(relative)
        ? Option.none()
        : Option.some(candidate)
    }
  })

/**
 * The following functions are adapted from the Node.js source code:
 * https://github.com/nodejs/node/blob/main/lib/internal/url.js
 *
 * The following license applies to these functions:
 * - MIT
 */

// Resolves . and .. elements in a path with directory names
function normalizeStringPosix(path: string, allowAboveRoot: boolean) {
  let res = ""
  let lastSegmentLength = 0
  let lastSlash = -1
  let dots = 0
  let code
  for (let i = 0; i <= path.length; ++i) {
    if (i < path.length) {
      code = path.charCodeAt(i)
    } else if (code === 47 /*/*/) {
      break
    } else {
      code = 47 /*/*/
    }
    if (code === 47 /*/*/) {
      if (lastSlash === i - 1 || dots === 1) {
        // NOOP
      } else if (lastSlash !== i - 1 && dots === 2) {
        if (
          res.length < 2 || lastSegmentLength !== 2 || res.charCodeAt(res.length - 1) !== 46 /*.*/ ||
          res.charCodeAt(res.length - 2) !== 46 /*.*/
        ) {
          if (res.length > 2) {
            const lastSlashIndex = res.lastIndexOf("/")
            if (lastSlashIndex !== res.length - 1) {
              if (lastSlashIndex === -1) {
                res = ""
                lastSegmentLength = 0
              } else {
                res = res.slice(0, lastSlashIndex)
                lastSegmentLength = res.length - 1 - res.lastIndexOf("/")
              }
              lastSlash = i
              dots = 0
              continue
            }
          } else if (res.length === 2 || res.length === 1) {
            res = ""
            lastSegmentLength = 0
            lastSlash = i
            dots = 0
            continue
          }
        }
        if (allowAboveRoot) {
          if (res.length > 0) {
            res += "/.."
          } else {
            res = ".."
          }
          lastSegmentLength = 2
        }
      } else {
        if (res.length > 0) {
          res += "/" + path.slice(lastSlash + 1, i)
        } else {
          res = path.slice(lastSlash + 1, i)
        }
        lastSegmentLength = i - lastSlash - 1
      }
      lastSlash = i
      dots = 0
    } else if (code === 46 /*.*/ && dots !== -1) {
      ++dots
    } else {
      dots = -1
    }
  }
  return res
}

function formatExt(ext: string | undefined) {
  if (!ext) return ""
  return ext.startsWith(".") ? ext : `.${ext}`
}

function _format(sep: string, pathObject: Partial<Path.Parsed>) {
  const dir = pathObject.dir || pathObject.root
  const base = pathObject.base || (pathObject.name || "") + formatExt(pathObject.ext)
  if (!dir) {
    return base
  }
  if (dir === pathObject.root) {
    return dir + base
  }
  return dir + sep + base
}

function fromFileUrl(url: URL): Effect.Effect<string, BadArgument> {
  if (url.protocol !== "file:") {
    return Effect.fail(
      new BadArgument({
        module: "Path",
        method: "fromFileUrl",
        description: "URL must be of scheme file"
      })
    )
  } else if (url.hostname !== "") {
    return Effect.fail(
      new BadArgument({
        module: "Path",
        method: "fromFileUrl",
        description: "Invalid file URL host"
      })
    )
  }
  const pathname = url.pathname
  for (let n = 0; n < pathname.length; n++) {
    if (pathname[n] === "%") {
      const third = pathname.codePointAt(n + 2)! | 0x20
      if (pathname[n + 1] === "2" && third === 102) {
        return Effect.fail(
          new BadArgument({
            module: "Path",
            method: "fromFileUrl",
            description: "must not include encoded / characters"
          })
        )
      }
    }
  }
  return Effect.try({
    try: () => decodeURIComponent(pathname),
    catch: (cause) =>
      new BadArgument({
        module: "Path",
        method: "fromFileUrl",
        cause
      })
  })
}

const resolve: Path["resolve"] = function resolve() {
  let resolvedPath = ""
  let resolvedAbsolute = false
  let cwd: string | undefined = undefined

  for (let i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
    let path: string
    if (i >= 0) {
      path = arguments[i]
    } else {
      const process = (globalThis as any).process
      if (
        cwd === undefined && "process" in globalThis &&
        typeof process === "object" &&
        process !== null &&
        typeof process.cwd === "function"
      ) {
        cwd = process.cwd()
      }
      path = cwd!
    }

    // Skip empty entries
    if (path.length === 0) {
      continue
    }

    resolvedPath = path + "/" + resolvedPath
    resolvedAbsolute = path.charCodeAt(0) === 47 /*/*/
  }

  // At this point the path should be resolved to a full absolute path, but
  // handle relative paths to be safe (might happen when process.cwd() fails)

  // Normalize the path
  resolvedPath = normalizeStringPosix(resolvedPath, !resolvedAbsolute)

  if (resolvedAbsolute) {
    if (resolvedPath.length > 0) {
      return "/" + resolvedPath
    } else {
      return "/"
    }
  } else if (resolvedPath.length > 0) {
    return resolvedPath
  } else {
    return "."
  }
}

const CHAR_FORWARD_SLASH = 47

function toFileUrl(filepath: string) {
  const outURL = new URL("file://")
  let resolved = resolve(filepath)
  // path.resolve strips trailing slashes so we must add them back
  const filePathLast = filepath.charCodeAt(filepath.length - 1)
  if (
    (filePathLast === CHAR_FORWARD_SLASH) &&
    resolved[resolved.length - 1] !== "/"
  ) {
    resolved += "/"
  }
  outURL.pathname = encodePathChars(resolved)
  return Effect.succeed(outURL)
}

const percentRegExp = /%/g
const backslashRegExp = /\\/g
const newlineRegExp = /\n/g
const carriageReturnRegExp = /\r/g
const tabRegExp = /\t/g

function encodePathChars(filepath: string) {
  if (filepath.includes("%")) {
    filepath = filepath.replace(percentRegExp, "%25")
  }
  if (filepath.includes("\\")) {
    filepath = filepath.replace(backslashRegExp, "%5C")
  }
  if (filepath.includes("\n")) {
    filepath = filepath.replace(newlineRegExp, "%0A")
  }
  if (filepath.includes("\r")) {
    filepath = filepath.replace(carriageReturnRegExp, "%0D")
  }
  if (filepath.includes("\t")) {
    filepath = filepath.replace(tabRegExp, "%09")
  }
  return filepath
}

const posixImpl = make({
  resolve,
  normalize(path) {
    if (path.length === 0) return "."

    const isAbsolute = path.charCodeAt(0) === 47 /*/*/
    const trailingSeparator = path.charCodeAt(path.length - 1) === 47 /*/*/

    // Normalize the path
    path = normalizeStringPosix(path, !isAbsolute)

    if (path.length === 0 && !isAbsolute) path = "."
    if (path.length > 0 && trailingSeparator) path += "/"

    if (isAbsolute) return "/" + path
    return path
  },

  isAbsolute(path) {
    return path.length > 0 && path.charCodeAt(0) === 47 /*/*/
  },

  join() {
    if (arguments.length === 0) {
      return "."
    }
    let joined
    for (let i = 0; i < arguments.length; ++i) {
      const arg = arguments[i]
      if (arg.length > 0) {
        if (joined === undefined) {
          joined = arg
        } else {
          joined += "/" + arg
        }
      }
    }
    if (joined === undefined) {
      return "."
    }
    return posixImpl.normalize(joined)
  },

  relative(from, to) {
    if (from === to) return ""

    from = posixImpl.resolve(from)
    to = posixImpl.resolve(to)

    if (from === to) return ""

    // Trim any leading backslashes
    let fromStart = 1
    for (; fromStart < from.length; ++fromStart) {
      if (from.charCodeAt(fromStart) !== 47 /*/*/) {
        break
      }
    }
    const fromEnd = from.length
    const fromLen = fromEnd - fromStart

    // Trim any leading backslashes
    let toStart = 1
    for (; toStart < to.length; ++toStart) {
      if (to.charCodeAt(toStart) !== 47 /*/*/) {
        break
      }
    }
    const toEnd = to.length
    const toLen = toEnd - toStart

    // Compare paths to find the longest common path from root
    const length = fromLen < toLen ? fromLen : toLen
    let lastCommonSep = -1
    let i = 0
    for (; i <= length; ++i) {
      if (i === length) {
        if (toLen > length) {
          if (to.charCodeAt(toStart + i) === 47 /*/*/) {
            // We get here if `from` is the exact base path for `to`.
            // For example: from='/foo/bar'; to='/foo/bar/baz'
            return to.slice(toStart + i + 1)
          } else if (i === 0) {
            // We get here if `from` is the root
            // For example: from='/'; to='/foo'
            return to.slice(toStart + i)
          }
        } else if (fromLen > length) {
          if (from.charCodeAt(fromStart + i) === 47 /*/*/) {
            // We get here if `to` is the exact base path for `from`.
            // For example: from='/foo/bar/baz'; to='/foo/bar'
            lastCommonSep = i
          } else if (i === 0) {
            // We get here if `to` is the root.
            // For example: from='/foo'; to='/'
            lastCommonSep = 0
          }
        }
        break
      }
      const fromCode = from.charCodeAt(fromStart + i)
      const toCode = to.charCodeAt(toStart + i)
      if (fromCode !== toCode) {
        break
      } else if (fromCode === 47 /*/*/) {
        lastCommonSep = i
      }
    }

    let out = ""
    // Generate the relative path based on the path difference between `to`
    // and `from`
    for (i = fromStart + lastCommonSep + 1; i <= fromEnd; ++i) {
      if (i === fromEnd || from.charCodeAt(i) === 47 /*/*/) {
        if (out.length === 0) {
          out += ".."
        } else {
          out += "/.."
        }
      }
    }

    // Lastly, append the rest of the destination (`to`) path that comes after
    // the common path parts
    if (out.length > 0) {
      return out + to.slice(toStart + lastCommonSep)
    } else {
      toStart += lastCommonSep
      if (to.charCodeAt(toStart) === 47 /*/*/) {
        ++toStart
      }
      return to.slice(toStart)
    }
  },

  dirname(path) {
    if (path.length === 0) return "."
    let code = path.charCodeAt(0)
    const hasRoot = code === 47 /*/*/
    let end = -1
    let matchedSlash = true
    for (let i = path.length - 1; i >= 1; --i) {
      code = path.charCodeAt(i)
      if (code === 47 /*/*/) {
        if (!matchedSlash) {
          end = i
          break
        }
      } else {
        // We saw the first non-path separator
        matchedSlash = false
      }
    }

    if (end === -1) return hasRoot ? "/" : "."
    if (hasRoot && end === 1) return "//"
    return path.slice(0, end)
  },

  basename(path, ext) {
    let start = 0
    let end = -1
    let matchedSlash = true
    let i

    if (ext !== undefined && ext.length > 0 && ext.length <= path.length) {
      if (ext.length === path.length && ext === path) return ""
      let extIdx = ext.length - 1
      let firstNonSlashEnd = -1
      for (i = path.length - 1; i >= 0; --i) {
        const code = path.charCodeAt(i)
        if (code === 47 /*/*/) {
          // If we reached a path separator that was not part of a set of path
          // separators at the end of the string, stop now
          if (!matchedSlash) {
            start = i + 1
            break
          }
        } else {
          if (firstNonSlashEnd === -1) {
            // We saw the first non-path separator, remember this index in case
            // we need it if the extension ends up not matching
            matchedSlash = false
            firstNonSlashEnd = i + 1
          }
          if (extIdx >= 0) {
            // Try to match the explicit extension
            if (code === ext.charCodeAt(extIdx)) {
              if (--extIdx === -1) {
                // We matched the extension, so mark this as the end of our path
                // component
                end = i
              }
            } else {
              // Extension does not match, so our result is the entire path
              // component
              extIdx = -1
              end = firstNonSlashEnd
            }
          }
        }
      }

      if (start === end) end = firstNonSlashEnd
      else if (end === -1) end = path.length
      return path.slice(start, end)
    } else {
      for (i = path.length - 1; i >= 0; --i) {
        if (path.charCodeAt(i) === 47 /*/*/) {
          // If we reached a path separator that was not part of a set of path
          // separators at the end of the string, stop now
          if (!matchedSlash) {
            start = i + 1
            break
          }
        } else if (end === -1) {
          // We saw the first non-path separator, mark this as the end of our
          // path component
          matchedSlash = false
          end = i + 1
        }
      }

      if (end === -1) return ""
      return path.slice(start, end)
    }
  },

  extname(path) {
    let startDot = -1
    let startPart = 0
    let end = -1
    let matchedSlash = true
    // Track the state of characters (if any) we see before our first dot and
    // after any path separator we find
    let preDotState = 0
    for (let i = path.length - 1; i >= 0; --i) {
      const code = path.charCodeAt(i)
      if (code === 47 /*/*/) {
        // If we reached a path separator that was not part of a set of path
        // separators at the end of the string, stop now
        if (!matchedSlash) {
          startPart = i + 1
          break
        }
        continue
      }
      if (end === -1) {
        // We saw the first non-path separator, mark this as the end of our
        // extension
        matchedSlash = false
        end = i + 1
      }
      if (code === 46 /*.*/) {
        // If this is our first dot, mark it as the start of our extension
        if (startDot === -1) {
          startDot = i
        } else if (preDotState !== 1) {
          preDotState = 1
        }
      } else if (startDot !== -1) {
        // We saw a non-dot and non-path separator before our dot, so we should
        // have a good chance at having a non-empty extension
        preDotState = -1
      }
    }

    if (
      startDot === -1 || end === -1 ||
      // We saw a non-dot character immediately before the dot
      preDotState === 0 ||
      // The (right-most) trimmed path component is exactly '..'
      preDotState === 1 && startDot === end - 1 && startDot === startPart + 1
    ) {
      return ""
    }
    return path.slice(startDot, end)
  },

  format: function format(pathObject) {
    if (pathObject === null || typeof pathObject !== "object") {
      throw new TypeError("The \"pathObject\" argument must be of type Object. Received type " + typeof pathObject)
    }
    return _format("/", pathObject)
  },

  parse(path) {
    const ret = { root: "", dir: "", base: "", ext: "", name: "" }
    if (path.length === 0) return ret
    let code = path.charCodeAt(0)
    const isAbsolute = code === 47 /*/*/
    let start
    if (isAbsolute) {
      ret.root = "/"
      start = 1
    } else {
      start = 0
    }
    let startDot = -1
    let startPart = 0
    let end = -1
    let matchedSlash = true
    let i = path.length - 1

    // Track the state of characters (if any) we see before our first dot and
    // after any path separator we find
    let preDotState = 0

    // Get non-dir info
    for (; i >= start; --i) {
      code = path.charCodeAt(i)
      if (code === 47 /*/*/) {
        // If we reached a path separator that was not part of a set of path
        // separators at the end of the string, stop now
        if (!matchedSlash) {
          startPart = i + 1
          break
        }
        continue
      }
      if (end === -1) {
        // We saw the first non-path separator, mark this as the end of our
        // extension
        matchedSlash = false
        end = i + 1
      }
      if (code === 46 /*.*/) {
        // If this is our first dot, mark it as the start of our extension
        if (startDot === -1) startDot = i
        else if (preDotState !== 1) preDotState = 1
      } else if (startDot !== -1) {
        // We saw a non-dot and non-path separator before our dot, so we should
        // have a good chance at having a non-empty extension
        preDotState = -1
      }
    }

    if (
      startDot === -1 || end === -1 ||
      // We saw a non-dot character immediately before the dot
      preDotState === 0 ||
      // The (right-most) trimmed path component is exactly '..'
      preDotState === 1 && startDot === end - 1 && startDot === startPart + 1
    ) {
      if (end !== -1) {
        if (startPart === 0 && isAbsolute) ret.base = ret.name = path.slice(1, end)
        else ret.base = ret.name = path.slice(startPart, end)
      }
    } else {
      if (startPart === 0 && isAbsolute) {
        ret.name = path.slice(1, startDot)
        ret.base = path.slice(1, end)
      } else {
        ret.name = path.slice(startPart, startDot)
        ret.base = path.slice(startPart, end)
      }
      ret.ext = path.slice(startDot, end)
    }

    if (startPart > 0) ret.dir = path.slice(0, startPart - 1)
    else if (isAbsolute) ret.dir = "/"

    return ret
  },

  sep: "/",
  fromFileUrl,
  toFileUrl,
  toNamespacedPath: identity
})

/**
 * Layer that provides the built-in POSIX `Path` implementation.
 *
 * **When to use**
 *
 * Use when you need an effect that requires the `Path` service to run with the
 * built-in POSIX path implementation.
 *
 * **Details**
 *
 * The layer provides a static service whose separator is `/` and whose
 * operations use POSIX path semantics.
 *
 * @see {@link Path} for accessing the `Path` service from an effect
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer.Layer<Path> = Layer.succeed(Path)(posixImpl)
