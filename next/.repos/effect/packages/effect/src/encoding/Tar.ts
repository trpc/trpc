/**
 * Encodes and decodes tar archives as streams in Effect channels.
 *
 * `decode` streams entry bodies from the archive input; `encode` streams them
 * back into archive bytes. Neither buffers an entire entry body.
 *
 * The decoder reads the formats produced by common tools: v7, USTAR, PAX
 * extended headers, and GNU long names and base-256 numbers. The encoder writes
 * USTAR, adding PAX extended headers for fields that do not fit or for custom
 * metadata. It does not access the file system or compress archives.
 *
 * @stability unstable
 * @since 4.0.5
 */
import * as Arr from "../Array.ts"
import * as Cause from "../Cause.ts"
import * as Channel from "../Channel.ts"
import * as Data from "../Data.ts"
import * as Effect from "../Effect.ts"
import * as Exit from "../Exit.ts"
import * as Predicate from "../Predicate.ts"
import * as Pull from "../Pull.ts"
import * as Scope from "../Scope.ts"
import * as Semaphore from "../Semaphore.ts"
import * as Stream from "../Stream.ts"
import type * as Types from "../Types.ts"

const TarErrorTypeId = "~effect/encoding/Tar/TarError"

/**
 * Error raised when a tar archive cannot be encoded or decoded.
 *
 * **Details**
 *
 * The `kind` field identifies the failure:
 *
 * - `InvalidHeader`: a header has a bad checksum, a malformed field, or a value
 *   that cannot be written.
 * - `Truncated`: the input ended inside a header or an entry body.
 * - `SizeMismatch`: an entry body produced a byte count other than its declared
 *   `size`.
 * - `Unsupported`: the archive uses a feature this module does not read, such
 *   as GNU sparse files.
 * - `BodyConsumed`: an entry body was read after the decoder had moved past it.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.5
 */
export class TarError extends Data.TaggedError("TarError")<{
  readonly kind: "InvalidHeader" | "Truncated" | "SizeMismatch" | "Unsupported" | "BodyConsumed"
  readonly message: string
}> {
  /**
   * Marks this value as a tar error for runtime guards.
   *
   * @stability unstable
   * @since 4.0.5
   */
  readonly [TarErrorTypeId] = TarErrorTypeId
}

/**
 * Checks whether a value is a `TarError`.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.5
 */
export const isTarError = (u: unknown): u is TarError => Predicate.hasProperty(u, TarErrorTypeId)

/**
 * Kind of filesystem object described by a tar entry.
 *
 * **Details**
 *
 * `Other` covers every typeflag without a dedicated kind, such as GNU volume
 * labels; the raw flag is kept in `Header.typeflag`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.5
 */
export type EntryType =
  | "File"
  | "Directory"
  | "Symlink"
  | "Hardlink"
  | "CharDevice"
  | "BlockDevice"
  | "Fifo"
  | "Other"

/**
 * Metadata of a tar entry.
 *
 * **Details**
 *
 * `path` and `linkTarget` are archive paths; hard link targets name another
 * entry of the same archive. `mode` holds the permission bits, including
 * setuid, setgid and sticky; file type bits, as in a `stat` mode, are dropped
 * when decoding and encoding. `pax` holds the PAX extended header records,
 * including those of global headers, that are not reflected in the other
 * fields, such as `SCHILY.xattr.*`, `atime` or the `comment` of `git archive`.
 * `devMajor` and `devMinor` are set for device entries only.
 *
 * @stability unstable
 * @category models
 * @since 4.0.5
 */
export interface Header {
  readonly path: string
  readonly type: EntryType
  readonly typeflag: string
  readonly size: number
  readonly mode: number
  readonly uid: number
  readonly gid: number
  readonly uname: string
  readonly gname: string
  readonly mtime: Date
  readonly linkTarget?: string | undefined
  readonly devMajor?: number | undefined
  readonly devMinor?: number | undefined
  readonly pax: Readonly<Record<string, string>>
}

/**
 * Tar entry: a header and a stream of exactly `header.size` body bytes.
 *
 * @stability unstable
 * @category models
 * @since 4.0.5
 */
export interface Entry<E = never, R = never> {
  readonly header: Header
  readonly body: Stream.Stream<Uint8Array, E, R>
}

/**
 * Options for the entry constructors.
 *
 * **Details**
 *
 * Unset fields default to mode `0o644` (`0o755` for directories, `0o777` for
 * symlinks), uid and gid `0`, empty user and group names, an mtime at the Unix
 * epoch, and no extra PAX records. The defaults make archives reproducible.
 *
 * @stability unstable
 * @category models
 * @since 4.0.5
 */
export interface EntryOptions {
  readonly mode?: number | undefined
  readonly uid?: number | undefined
  readonly gid?: number | undefined
  readonly uname?: string | undefined
  readonly gname?: string | undefined
  readonly mtime?: Date | undefined
  readonly pax?: Readonly<Record<string, string>> | undefined
}

const makeHeader = (
  path: string,
  type: "File" | "Directory" | "Symlink" | "Hardlink",
  size: number,
  options: EntryOptions | undefined,
  linkTarget?: string
): Header => ({
  path,
  type,
  typeflag: typeflags[type],
  size,
  mode: options?.mode ?? (type === "Directory" ? 0o755 : type === "Symlink" ? 0o777 : 0o644),
  uid: options?.uid ?? 0,
  gid: options?.gid ?? 0,
  uname: options?.uname ?? "",
  gname: options?.gname ?? "",
  mtime: options?.mtime ?? new Date(0),
  ...(linkTarget === undefined || linkTarget === "" ? undefined : { linkTarget }),
  pax: options?.pax ?? {}
})

/**
 * Creates a regular file entry from in-memory content.
 *
 * **Details**
 *
 * String content is encoded as UTF-8, and `size` is the byte length of the
 * content.
 *
 * @see {@link fileStream} for content that is streamed instead of held in memory
 * @see {@link encode} for writing entries to an archive
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.5
 */
export const file = (path: string, content: string | Uint8Array, options?: EntryOptions): Entry => {
  const bytes = typeof content === "string" ? textEncoder.encode(content) : content
  const header = makeHeader(path, "File", bytes.length, options)
  if (bytes.length === 0) return { header, body: Stream.empty }
  const body = Stream.succeed(bytes)
  inMemoryBodies.set(body, bytes)
  return { header, body }
}

// Key by body identity so replacing an entry body bypasses the encode fast path.
const inMemoryBodies = new WeakMap<Stream.Stream<Uint8Array, unknown, unknown>, Uint8Array>()

/**
 * Creates a regular file entry whose content is streamed from `body`.
 *
 * **When to use**
 *
 * Use when the content is too large to hold in memory, or is read from a file
 * or another stream, and its byte length is known up front.
 *
 * **Details**
 *
 * The defaults match `file`: mode `0o644`, uid and gid `0`, and an mtime at the
 * Unix epoch. `body` is not run until the entry is encoded.
 *
 * **Gotchas**
 *
 * `size` must be the exact byte length of `body`: `encode` fails with a
 * `SizeMismatch` `TarError` when the body produces fewer or more bytes.
 *
 * @see {@link file} for in-memory content
 * @see {@link encode} for writing entries to an archive
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.5
 */
export const fileStream = <E = never, R = never>(
  path: string,
  size: number,
  body: Stream.Stream<Uint8Array, E, R>,
  options?: EntryOptions
): Entry<E, R> => ({
  header: makeHeader(path, "File", size, options),
  body
})

/**
 * Creates a directory entry.
 *
 * **Details**
 *
 * A trailing `/` is added to a non-empty `path` when missing, as tar tools
 * expect for directories.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.5
 */
export const directory = (path: string, options?: EntryOptions): Entry => ({
  // An empty path stays empty, so that `encode` rejects it
  header: makeHeader(path === "" || path.endsWith("/") ? path : `${path}/`, "Directory", 0, options),
  body: Stream.empty
})

/**
 * Creates a symbolic link entry pointing at `target`.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.5
 */
export const symlink = (path: string, target: string, options?: EntryOptions): Entry => ({
  header: makeHeader(path, "Symlink", 0, options, target),
  body: Stream.empty
})

/**
 * Creates a hard link entry pointing at another entry of the archive.
 *
 * **Details**
 *
 * `target` is the archive path of an entry written earlier in the same
 * archive.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.5
 */
export const hardlink = (path: string, target: string, options?: EntryOptions): Entry => ({
  header: makeHeader(path, "Hardlink", 0, options, target),
  body: Stream.empty
})

/**
 * Creates a channel that decodes tar archive bytes into entries.
 *
 * **Details**
 *
 * Each output chunk holds one entry, and each entry body streams exactly
 * `header.size` bytes straight from the input. Pulling the next entry skips
 * whatever is left of the current body, like Go's `tar.Reader`. The decoder
 * reads v7, USTAR, PAX extended headers (applying `path`, `linkpath`, `size`,
 * `uid`, `gid`, `uname`, `gname` and `mtime`), GNU long names and links, and
 * base-256 numbers. The records of a PAX global header apply to every entry
 * that follows, except `path`, `linkpath` and `size`, which describe a single
 * entry. Anything after the end-of-archive marker is ignored.
 *
 * **Gotchas**
 *
 * - Read each body before pulling the next entry: a body read afterwards fails
 *   with a `BodyConsumed` `TarError`. Operators that pull ahead, such as
 *   `Stream.buffer`, therefore can't sit between `decode` and the body reads.
 * - Read bodies while the entry stream runs, for example in `Stream.mapEffect`:
 *   once it has ended, as after `Stream.runCollect`, `Stream.runHead` or
 *   `Stream.take`, every body fails with a `BodyConsumed` `TarError`.
 * - A body reads the entry's bytes once: running it again continues where the
 *   previous run stopped.
 * - Directories, links, devices and FIFOs have no body, and their `size` is
 *   reported as `0`.
 * - Paths and link targets are returned as written in the archive, so they can
 *   be absolute or contain `..`, and a symlink entry can redirect a later entry
 *   outside the target directory. Validate both before writing entries to disk.
 * - Names that are not valid UTF-8 are decoded with replacement characters.
 * - PAX extended headers and GNU long names of more than 1 MiB fail with an
 *   `InvalidHeader` `TarError`.
 * - The channel completes only when its input ends: input after the
 *   end-of-archive marker is read and discarded, so that the upstream done
 *   value can be passed on.
 * - GNU sparse entries fail with an `Unsupported` `TarError`.
 *
 * @see {@link encode} for the inverse operation
 *
 * @stability unstable
 * @category decoding
 * @since 4.0.5
 */
export const decode = <IE = never, Done = unknown>(): Channel.Channel<
  Arr.NonEmptyReadonlyArray<Entry<TarError | IE>>,
  TarError | IE,
  Done,
  Arr.NonEmptyReadonlyArray<Uint8Array>,
  IE,
  Done
> =>
  Channel.fromTransform((upstream, scope) =>
    Effect.suspend(() => {
      const decoder = new Decoder()
      let done: { readonly value: Done } | undefined
      let pulls = 0

      const pullUpstream = upstream.pipe(
        Effect.map((chunks) => {
          pulls++
          for (const chunk of chunks) decoder.push(chunk)
        }),
        Pull.catchDone((value) => {
          pulls++
          done = { value: value as Done }
          decoder.end()
          return Effect.void
        })
      )

      // Serialize entry and body pulls; reuse input pulled while waiting for the lock.
      const lock = Semaphore.makeUnsafe(1)
      const pullInput = (seen: number) =>
        lock.withPermit(Effect.suspend(() => pulls === seen ? pullUpstream : Effect.void))

      const run = <A, D>(f: () => A | undefined | typeof NeedInput, end: () => D): Pull.Pull<A, TarError | IE, D> =>
        Effect.suspend(function loop(): Pull.Pull<A, TarError | IE, D> {
          const seen = pulls
          let result: A | undefined | typeof NeedInput
          try {
            result = f()
          } catch (error) {
            return isTarError(error) ? Effect.fail(error) : Effect.die(error)
          }
          if (result === NeedInput) return Effect.flatMap(pullInput(seen), loop)
          return result === undefined ? Cause.done(end()) : Effect.succeed(result)
        })

      const body = (id: number): Stream.Stream<Uint8Array, TarError | IE> =>
        Stream.fromPull(Effect.succeed(run(() => decoder.read(id), () => undefined)))

      const next = run(() => {
        const header = decoder.next()
        return header === NeedInput || header === undefined
          ? header
          : Arr.of({ header, body: body(decoder.generation) })
      }, () => done!.value)

      return Effect.as(Scope.addFinalizer(scope, Effect.sync(() => decoder.close())), next)
    })
  )

/**
 * Creates a channel that encodes entries into tar archive bytes.
 *
 * **Details**
 *
 * Each entry is written as a USTAR header, with the path split into the USTAR
 * prefix and name fields when it is longer than 100 bytes. A PAX extended
 * header is added only for what USTAR cannot hold: a long or non-ASCII path,
 * link target, user or group name, a size of 8 GiB or more, a uid or gid above
 * `2097151`, an mtime outside the USTAR range, or custom `pax` records. The
 * archive ends with two zero blocks.
 *
 * Headers, padding and body chunks below 16 KiB are gathered into output chunks
 * of up to 64 KiB, and larger body chunks pass through without copying, so
 * bodies stream without being held in memory. Output is handed out before
 * waiting for more entries, but up to 64 KiB of it can be held while a body is
 * pulled.
 *
 * **Gotchas**
 *
 * - A body that produces any byte count other than `header.size` fails with a
 *   `SizeMismatch` `TarError`, so the size must be known before the body is
 *   written.
 * - `header.pax` may contain custom metadata such as `SCHILY.xattr.*`. Keys
 *   `path`, `linkpath`, `size`, `uid`, `gid`, `uname`, `gname` and `mtime` must
 *   be set through the corresponding header fields. These keys and
 *   `GNU.sparse.*` records fail with an `InvalidHeader` `TarError`.
 * - A `File` entry whose path ends with `/` fails with an `InvalidHeader`
 *   `TarError`, because other tools read it as a directory.
 * - Entries other than `File` and `Other` must have `size` 0, and `devMajor`
 *   and `devMinor` must not exceed `2097151`; otherwise encoding fails with an
 *   `InvalidHeader` `TarError`.
 * - mtime is rounded down to whole seconds.
 * - `typeflag` is only written for `Other` entries; every other type writes its
 *   standard flag.
 *
 * @see {@link decode} for the inverse operation
 * @see {@link file} for building entries from in-memory content
 * @see {@link fileStream} for building entries from streamed content
 *
 * @stability unstable
 * @category encoding
 * @since 4.0.5
 */
export const encode = <IE = never, Done = unknown, In extends Entry<any, any> = Entry>(): Channel.Channel<
  Arr.NonEmptyReadonlyArray<Uint8Array>,
  TarError | IE | (In extends Entry<infer E, any> ? E : never),
  Done,
  Arr.NonEmptyReadonlyArray<In>,
  IE,
  Done,
  In extends Entry<any, infer R> ? R : never
> => {
  // Distribute over entry unions to infer body errors and services.
  type E = In extends Entry<infer E, any> ? E : never
  type R = In extends Entry<any, infer R> ? R : never
  return Channel.fromTransform((upstream: Pull.Pull<Arr.NonEmptyReadonlyArray<In>, IE, Done>, scope) =>
    Effect.sync(() => {
      const encoder = new Encoder()
      let entries: ReadonlyArray<Entry<E, R>> = []
      let index = 0
      let done: { readonly value: Done } | undefined
      let body: Pull.Pull<Arr.NonEmptyReadonlyArray<Uint8Array>, E, void, R> | undefined
      let bodyScope: Scope.Closeable | undefined

      const write = (f: () => void): Effect.Effect<void, TarError> => {
        try {
          f()
        } catch (error) {
          return isTarError(error) ? Effect.fail(error) : Effect.die(error)
        }
        return Effect.void
      }

      return Effect.gen(function*() {
        while (true) {
          if (encoder.buffered >= SLAB_SIZE) return encoder.flush()
          if (body !== undefined) {
            const chunks = yield* Pull.catchDone(body, () => Effect.undefined)
            if (chunks !== undefined) {
              yield* write(() => {
                for (const chunk of chunks) encoder.body(chunk)
              })
              continue
            }
            body = undefined
            yield* Scope.close(bodyScope!, Exit.void)
            yield* write(() => encoder.end())
            continue
          }
          if (index < entries.length) {
            const entry = entries[index++]
            // Directories, links and in-memory files have nothing to stream
            const bytes = entry.body === Stream.empty ? emptyBody : inMemoryBodies.get(entry.body)
            yield* write(() => {
              encoder.begin(entry.header)
              if (bytes !== undefined) {
                encoder.body(bytes)
                encoder.end()
              }
            })
            if (bytes !== undefined) continue
            bodyScope = Scope.forkUnsafe(scope)
            body = yield* Channel.toPullScoped(entry.body.channel, bodyScope)
            continue
          }
          if (encoder.buffered > 0) return encoder.flush()
          if (done !== undefined) return yield* Cause.done(done.value)
          const next = yield* Pull.catchDone(upstream, (value) => {
            done = { value: value as Done }
            encoder.finish()
            return Effect.undefined
          })
          if (next !== undefined) {
            entries = next
            index = 0
          }
        }
      })
    })
  )
}

const invalidHeader = (message: string) => new TarError({ kind: "InvalidHeader", message })

const truncated = (at: number) =>
  new TarError({ kind: "Truncated", message: `unexpected end of tar archive at byte ${at}` })

const unsupported = (message: string) => new TarError({ kind: "Unsupported", message })

const sizeMismatch = (header: Header, written: number) =>
  new TarError({
    kind: "SizeMismatch",
    message: `body of ${JSON.stringify(header.path)} has ${
      written > header.size ? "at least" : "only"
    } ${written} bytes, but its size is ${header.size}`
  })

const BLOCK = 512
const PERMISSION_BITS = 0o7777

const padding = (size: number): number => (BLOCK - (size % BLOCK)) % BLOCK

const isZeroBlock = (block: Uint8Array): boolean => {
  for (let i = 0; i < BLOCK; i++) {
    if (block[i] !== 0) return false
  }
  return true
}

const sumBlock = (block: Uint8Array): number => {
  // Four sums let the loop run faster than one
  let a = 0
  let b = 0
  let c = 0
  let d = 0
  for (let i = 0; i < BLOCK; i += 4) {
    a += block[i]
    b += block[i + 1]
    c += block[i + 2]
    d += block[i + 3]
  }
  return a + b + c + d
}

const USTAR_MAGIC = [0x75, 0x73, 0x74, 0x61, 0x72, 0x00] // "ustar\0"
const GNU_MAGIC = [0x75, 0x73, 0x74, 0x61, 0x72, 0x20, 0x20, 0x00] // "ustar  \0"
const STAR_TRAILER = [0x74, 0x61, 0x72, 0x00] // "tar\0"
const USTAR_MAGIC_VERSION = new Uint8Array([0x75, 0x73, 0x74, 0x61, 0x72, 0x00, 0x30, 0x30]) // "ustar\0" "00"

const hasBytes = (block: Uint8Array, offset: number, bytes: ReadonlyArray<number>): boolean => {
  for (let i = 0; i < bytes.length; i++) {
    if (block[offset + i] !== bytes[i]) return false
  }
  return true
}

const typeflags: Record<Exclude<EntryType, "Other">, string> = {
  File: "0",
  Hardlink: "1",
  Symlink: "2",
  CharDevice: "3",
  BlockDevice: "4",
  Directory: "5",
  Fifo: "6"
}

const types: Record<string, EntryType> = {
  ...Object.fromEntries(Object.entries(typeflags).map(([type, typeflag]) => [typeflag, type])),
  // Contiguous files
  "7": "File"
}

const typeOf = (typeflag: string, path: string): EntryType => {
  // Legacy archives mark directories with a trailing slash only
  if (typeflag === "\0") return path.endsWith("/") ? "Directory" : "File"
  return types[typeflag] ?? "Other"
}

const typeflagOf = (header: Header): string => header.type === "Other" ? header.typeflag : typeflags[header.type]

// Entries of these types never carry body bytes, whatever their size field says
const isHeaderOnly = (type: EntryType): boolean => type !== "File" && type !== "Other"

const textEncoder = new TextEncoder()
// Keeps a leading byte order mark as part of the decoded field
const textDecoder = new TextDecoder("utf-8", { ignoreBOM: true })

const isAscii = (s: string): boolean => {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c === 0 || c >= 0x80) return false
  }
  return true
}

// Keeps the ASCII characters of a value that is also stored in a PAX record
const toAscii = (s: string): string => {
  let out = ""
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c > 0 && c < 0x80) out += s[i]
  }
  return out
}

const fits = (value: string, length: number): boolean => value.length <= length && isAscii(value)

const paxStringKeys = new Set(["path", "linkpath", "uname", "gname"])
const paxHeaderKeys = new Set(["path", "linkpath", "size", "uid", "gid", "uname", "gname", "mtime"])

const noPax: Readonly<Record<string, string>> = Object.freeze({})

// Parses records of the form "<length> <key>=<value>\n", where the length counts
// the bytes of the whole record
const parsePax = (data: Uint8Array): Map<string, string> => {
  const records = new Map<string, string>()
  let offset = 0
  while (offset < data.length) {
    let space = offset
    while (space < data.length && space - offset < 16 && data[space] !== 0x20) space++
    const lengthField = String.fromCharCode.apply(null, data.subarray(offset, space) as unknown as Array<number>)
    const length = /^\d+$/.test(lengthField) ? Number(lengthField) : Number.NaN
    const end = offset + length
    if (!(length >= 5) || end > data.length || data[space] !== 0x20 || space + 1 >= end || data[end - 1] !== 0x0a) {
      throw invalidHeader("malformed PAX record")
    }
    const record = data.subarray(space + 1, end - 1)
    const equals = record.indexOf(0x3d)
    if (equals <= 0) {
      throw invalidHeader("malformed PAX record")
    }
    const key = textDecoder.decode(record.subarray(0, equals))
    const value = textDecoder.decode(record.subarray(equals + 1))
    if (key.includes("\0") || (paxStringKeys.has(key) && value.includes("\0"))) {
      throw invalidHeader(`invalid PAX record ${key}`)
    }
    records.set(key, value)
    offset = end
  }
  return records
}

const paxInteger = (key: string, value: string): number => {
  const n = /^\d+$/.test(value) ? Number(value) : Number.NaN
  if (!Number.isSafeInteger(n)) {
    throw invalidHeader(`invalid PAX ${key} ${JSON.stringify(value)}`)
  }
  return n
}

// Parses a PAX time of decimal seconds into milliseconds, rounded down. The
// digits are added up separately, because `Number(value) * 1000` is inexact.
const paxMillis = (value: string): number => {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value)
  if (match === null) {
    throw invalidHeader(`invalid PAX mtime ${JSON.stringify(value)}`)
  }
  const [, sign, seconds, fraction = ""] = match
  const millis = Number(seconds) * 1000 + Number(fraction.slice(0, 3).padEnd(3, "0"))
  if (sign === "") return millis
  // A negative time with digits below a millisecond rounds down past them
  return -millis - (/[1-9]/.test(fraction.slice(3)) ? 1 : 0)
}

// Applies the records that override header fields and returns the rest. An
// empty value keeps the field from the header block.
const applyPax = (header: RawHeader, records: Map<string, string>): Record<string, string> => {
  const rest: Record<string, string> = {}
  for (const [key, value] of records) {
    if (key.startsWith("GNU.sparse.")) {
      throw unsupported("GNU sparse files are not supported")
    }
    if (!paxHeaderKeys.has(key)) {
      // Defined rather than assigned, so that a `__proto__` key stays a record
      Object.defineProperty(rest, key, { value, enumerable: true, writable: true, configurable: true })
      continue
    }
    if (value === "") continue
    switch (key) {
      case "path":
        header.path = value
        break
      case "linkpath":
        header.linkTarget = value
        break
      case "uname":
      case "gname":
        header[key] = value
        break
      case "uid":
      case "gid":
      case "size":
        header[key] = paxInteger(key, value)
        break
      case "mtime":
        header.mtimeMillis = paxMillis(value)
    }
  }
  return rest
}

const paxRecord = (key: string, value: string): Uint8Array => {
  const rest = textEncoder.encode(` ${key}=${value}\n`)
  // The length counts its own digits
  const length = rest.length + String(rest.length + String(rest.length).length).length
  const out = new Uint8Array(length)
  writeString(out, 0, length, String(length))
  out.set(rest, length - rest.length)
  return out
}

const paxHeaderName = (path: string): string => {
  const trimmed = path.replace(/\/+$/, "")
  const i = trimmed.lastIndexOf("/")
  const name = i === -1 ? `PaxHeaders.0/${trimmed}` : `${trimmed.slice(0, i)}/PaxHeaders.0/${trimmed.slice(i + 1)}`
  return toAscii(name).slice(0, 100)
}

const readString = (block: Uint8Array, offset: number, length: number): string => {
  let end = offset
  let ascii = true
  const limit = offset + length
  while (end < limit && block[end] !== 0) {
    if (block[end] >= 0x80) ascii = false
    end++
  }
  if (end === offset) return ""
  if (!ascii || end - offset > 256) return textDecoder.decode(block.subarray(offset, end))
  // Most header strings are short ASCII, which is cheaper to build directly
  return String.fromCharCode.apply(null, block.subarray(offset, end) as unknown as Array<number>)
}

const readOctal = (block: Uint8Array, offset: number, length: number): number => {
  let start = offset
  let end = offset + length
  while (start < end && (block[start] === 0 || block[start] === 0x20)) start++
  while (end > start && (block[end - 1] === 0 || block[end - 1] === 0x20)) end--
  let value = 0
  for (let i = start; i < end; i++) {
    const c = block[i]
    if (c < 0x30 || c > 0x37) {
      throw invalidHeader(`invalid octal number in the header field at offset ${offset}`)
    }
    value = value * 8 + (c - 0x30)
  }
  return value
}

// GNU base-256: the high bit of the first byte is set, and the next bit is the
// sign of a two's complement big-endian number
const readNumber = (block: Uint8Array, offset: number, length: number): number => {
  if ((block[offset] & 0x80) === 0) return readOctal(block, offset, length)
  const negative = (block[offset] & 0x40) !== 0
  // Negative numbers are read as the bitwise inverse of their magnitude minus one
  let value = 0
  for (let i = 0; i < length; i++) {
    let c = block[offset + i]
    if (negative) c ^= 0xff
    if (i === 0) c &= 0x7f
    value = value * 256 + c
    if (value > Number.MAX_SAFE_INTEGER) {
      throw invalidHeader(`base-256 number in the header field at offset ${offset} is out of range`)
    }
  }
  return negative ? -value - 1 : value
}

const readUnsigned = (block: Uint8Array, offset: number, length: number, field: string): number => {
  const value = readNumber(block, offset, length)
  if (value < 0) {
    throw invalidHeader(`negative ${field}`)
  }
  return value
}

// The checksum is the sum of the block bytes with the checksum field counted as
// spaces. Some old tar writers summed signed bytes, which is accepted too.
const verifyChecksum = (block: Uint8Array): boolean => {
  const stored = readOctal(block, 148, 8)
  let unsigned = sumBlock(block) + 8 * 0x20
  for (let i = 148; i < 156; i++) unsigned -= block[i]
  if (stored === unsigned) return true
  let high = 0
  for (let i = 0; i < BLOCK; i++) {
    if (block[i] > 0x7f && (i < 148 || i >= 156)) high++
  }
  return stored === unsigned - 0x100 * high
}

interface RawHeader {
  readonly typeflag: string
  path: string
  linkTarget: string
  size: number
  readonly mode: number
  uid: number
  gid: number
  uname: string
  gname: string
  mtimeMillis: number
  devMajor: number
  devMinor: number
}

const parseHeader = (block: Uint8Array): RawHeader => {
  if (!verifyChecksum(block)) {
    throw invalidHeader("header checksum mismatch")
  }
  const isUstar = hasBytes(block, 257, USTAR_MAGIC)
  const isGnu = !isUstar && hasBytes(block, 257, GNU_MAGIC)
  const header: RawHeader = {
    typeflag: String.fromCharCode(block[156]),
    path: readString(block, 0, 100),
    linkTarget: readString(block, 157, 100),
    size: readUnsigned(block, 124, 12, "size"),
    mode: readUnsigned(block, 100, 8, "mode"),
    uid: readUnsigned(block, 108, 8, "uid"),
    gid: readUnsigned(block, 116, 8, "gid"),
    mtimeMillis: readNumber(block, 136, 12) * 1000,
    uname: "",
    gname: "",
    devMajor: 0,
    devMinor: 0
  }
  if (!isUstar && !isGnu) return header
  header.uname = readString(block, 265, 32)
  header.gname = readString(block, 297, 32)
  header.devMajor = readUnsigned(block, 329, 8, "devMajor")
  header.devMinor = readUnsigned(block, 337, 8, "devMinor")
  if (isUstar) {
    // star archives end the block with "tar\0" and keep times after a shorter prefix
    const prefix = hasBytes(block, 508, STAR_TRAILER) ? readString(block, 345, 131) : readString(block, 345, 155)
    if (prefix.length > 0) header.path = `${prefix}/${header.path}`
  }
  return header
}

const MAX_OCTAL_7 = 0o7777777 // 8-byte numeric fields
const MAX_OCTAL_11 = 0o77777777777 // 12-byte numeric fields

const writeString = (block: Uint8Array, offset: number, length: number, value: string): void => {
  const n = Math.min(value.length, length)
  for (let i = 0; i < n; i++) block[offset + i] = value.charCodeAt(i)
}

// Writes `length - 1` zero-padded octal digits; the value must fit
const writeOctal = (block: Uint8Array, offset: number, length: number, value: number): void => {
  let i = offset + length - 2
  // Bit operations are faster, but only cover 32 bits
  for (; value > 0x3fffffff && i >= offset; i--) {
    block[i] = 0x30 + (value % 8)
    value = Math.floor(value / 8)
  }
  for (; i >= offset; i--) {
    block[i] = 0x30 + (value & 7)
    value >>>= 3
  }
}

// Split at the last slash that fits the 155-byte USTAR prefix.
const splitPath = (path: string): readonly [prefix: string, name: string] | undefined => {
  if (path.length <= 100 || !isAscii(path)) return undefined
  let length = path.length
  if (length > 156) length = 156
  else if (path[length - 1] === "/") length--
  const i = path.lastIndexOf("/", length - 1)
  if (i <= 0 || path.length - i - 1 > 100) return undefined
  return [path.slice(0, i), path.slice(i + 1)]
}

interface UstarFields {
  readonly name: string
  readonly prefix: string
  readonly typeflag: string
  readonly size: number
  readonly mode: number
  readonly uid: number
  readonly gid: number
  readonly mtime: number
  readonly linkname: string
  readonly uname: string
  readonly gname: string
  readonly devMajor: number
  readonly devMinor: number
}

const paxHeaderFields: UstarFields = {
  name: "",
  prefix: "",
  typeflag: "x",
  size: 0,
  mode: 0o644,
  uid: 0,
  gid: 0,
  mtime: 0,
  linkname: "",
  uname: "",
  gname: "",
  devMajor: 0,
  devMinor: 0
}

const writeUstarBlock = (block: Uint8Array, fields: UstarFields): void => {
  writeString(block, 0, 100, fields.name)
  writeOctal(block, 100, 8, fields.mode)
  writeOctal(block, 108, 8, fields.uid)
  writeOctal(block, 116, 8, fields.gid)
  writeOctal(block, 124, 12, fields.size)
  writeOctal(block, 136, 12, fields.mtime)
  block[156] = fields.typeflag.charCodeAt(0)
  writeString(block, 157, 100, fields.linkname)
  block.set(USTAR_MAGIC_VERSION, 257)
  writeString(block, 265, 32, fields.uname)
  writeString(block, 297, 32, fields.gname)
  writeOctal(block, 329, 8, fields.devMajor)
  writeOctal(block, 337, 8, fields.devMinor)
  writeString(block, 345, 155, fields.prefix)
  block.fill(0x20, 148, 156)
  // Six digits, a NUL and the space left from the fill
  writeOctal(block, 148, 7, sumBlock(block))
  block[154] = 0
}

const checkNumber = (field: string, value: number | undefined, max: number): number => {
  const n = value ?? 0
  if (!Number.isSafeInteger(n) || n < 0 || n > max) {
    throw invalidHeader(`invalid ${field} ${n}`)
  }
  return n
}

const checkNoNul = (field: string, value: string): string => {
  if (value.includes("\0")) {
    throw invalidHeader(`${field} must not contain NUL characters`)
  }
  return value
}

// Writes the header blocks of an entry, with a PAX header first when needed, into
// zeroed memory from `alloc`. Throws before allocating when the header is invalid.
const encodeHeader = (header: Header, alloc: (size: number) => Uint8Array): void => {
  const path = checkNoNul("path", header.path)
  if (path === "") {
    throw invalidHeader("path must not be empty")
  }
  // GNU tar and node-tar read such an entry as a directory
  if (header.type === "File" && path.endsWith("/")) {
    throw invalidHeader(`File entry ${JSON.stringify(path)} must not end with "/"`)
  }
  const typeflag = typeflagOf(header)
  if (typeflag.length !== 1 || typeflag.charCodeAt(0) >= 0x80 || "xgLKS".includes(typeflag)) {
    throw invalidHeader(`invalid typeflag ${JSON.stringify(typeflag)}`)
  }
  const size = checkNumber("size", header.size, Number.MAX_SAFE_INTEGER)
  if (size > 0 && isHeaderOnly(header.type)) {
    throw invalidHeader(`${header.type} entry ${JSON.stringify(path)} must have size 0`)
  }
  const mode = checkNumber("mode", header.mode, Number.MAX_SAFE_INTEGER) & PERMISSION_BITS
  const uid = checkNumber("uid", header.uid, Number.MAX_SAFE_INTEGER)
  const gid = checkNumber("gid", header.gid, Number.MAX_SAFE_INTEGER)
  const devMajor = checkNumber("devMajor", header.devMajor, MAX_OCTAL_7)
  const devMinor = checkNumber("devMinor", header.devMinor, MAX_OCTAL_7)
  const millis = header.mtime.getTime()
  if (Number.isNaN(millis)) {
    throw invalidHeader("mtime must be a valid date")
  }
  const mtime = Math.floor(millis / 1000)

  // Records of the PAX header, created when one is needed. Their keys are
  // unique, as custom records cannot use the keys of header fields.
  let pax: Array<readonly [key: string, value: string]> | undefined
  for (const key of Object.keys(header.pax)) {
    if (key.startsWith("GNU.sparse.")) {
      throw invalidHeader(`PAX record ${JSON.stringify(key)} is not supported`)
    }
    if (paxHeaderKeys.has(key)) {
      throw invalidHeader(`PAX record ${JSON.stringify(key)} must be set through its header field`)
    }
    if (key === "" || key.includes("=") || key.includes("\0")) {
      throw invalidHeader(`invalid PAX record ${JSON.stringify(key)}`)
    }
    pax ??= []
    pax.push([key, header.pax[key]])
  }

  // PAX holds overflow values; USTAR keeps truncated ASCII strings or zero.
  const split = splitPath(path)
  const linkTarget = checkNoNul("linkTarget", header.linkTarget ?? "")
  const uname = checkNoNul("uname", header.uname)
  const gname = checkNoNul("gname", header.gname)
  const pathFits = split !== undefined || fits(path, 100)
  const linkTargetFits = fits(linkTarget, 100)
  const unameFits = fits(uname, 32)
  const gnameFits = fits(gname, 32)
  if (!pathFits) (pax ??= []).push(["path", path])
  if (!linkTargetFits) (pax ??= []).push(["linkpath", linkTarget])
  if (!unameFits) (pax ??= []).push(["uname", uname])
  if (!gnameFits) (pax ??= []).push(["gname", gname])
  if (size > MAX_OCTAL_11) (pax ??= []).push(["size", String(size)])
  if (uid > MAX_OCTAL_7) (pax ??= []).push(["uid", String(uid)])
  if (gid > MAX_OCTAL_7) (pax ??= []).push(["gid", String(gid)])
  if (mtime < 0 || mtime > MAX_OCTAL_11) (pax ??= []).push(["mtime", String(mtime)])

  const ustar: UstarFields = {
    name: split !== undefined ? split[1] : pathFits ? path : toAscii(path).slice(0, 100),
    prefix: split !== undefined ? split[0] : "",
    typeflag,
    size: size > MAX_OCTAL_11 ? 0 : size,
    mode,
    uid: uid > MAX_OCTAL_7 ? 0 : uid,
    gid: gid > MAX_OCTAL_7 ? 0 : gid,
    mtime: mtime < 0 || mtime > MAX_OCTAL_11 ? 0 : mtime,
    linkname: linkTargetFits ? linkTarget : toAscii(linkTarget).slice(0, 100),
    uname: unameFits ? uname : toAscii(uname).slice(0, 32),
    gname: gnameFits ? gname : toAscii(gname).slice(0, 32),
    devMajor,
    devMinor
  }

  if (pax === undefined) {
    writeUstarBlock(alloc(BLOCK), ustar)
    return
  }
  const records = pax.sort(([a], [b]) => a < b ? -1 : 1).map(([key, value]) => paxRecord(key, value))
  let dataLength = 0
  for (const record of records) dataLength += record.length
  const paxBlocks = 1 + Math.ceil(dataLength / BLOCK)
  const out = alloc(BLOCK * (paxBlocks + 1))
  writeUstarBlock(out, { ...paxHeaderFields, name: paxHeaderName(path), size: dataLength })
  let offset = BLOCK
  for (const record of records) {
    out.set(record, offset)
    offset += record.length
  }
  writeUstarBlock(out.subarray(BLOCK * paxBlocks), ustar)
}

const MAX_META_SIZE = 1024 * 1024 // PAX and GNU long name data
const MAX_DATE_MILLIS = 8.64e15 // the range of `Date`

// A queue of byte chunks that hands out views without copying where possible.
// Consumed chunks are released right away.
class ByteQueue {
  private chunks: Array<Uint8Array | undefined> = []
  private head = 0
  private offset = 0
  length = 0
  consumed = 0

  push(chunk: Uint8Array): void {
    if (chunk.length === 0) return
    this.chunks.push(chunk)
    this.length += chunk.length
  }

  takeSome(max: number): Uint8Array {
    const chunk = this.chunks[this.head]!
    const available = chunk.length - this.offset
    if (max < available) {
      const out = chunk.subarray(this.offset, this.offset + max)
      this.offset += max
      this.length -= max
      this.consumed += max
      return out
    }
    const out = this.offset === 0 ? chunk : chunk.subarray(this.offset)
    this.chunks[this.head++] = undefined
    this.length -= available
    this.consumed += available
    this.offset = 0
    if (this.head === this.chunks.length) {
      this.chunks = []
      this.head = 0
    } else if (this.head >= 1024) {
      this.chunks = this.chunks.slice(this.head)
      this.head = 0
    }
    return out
  }

  // Takes exactly `n` bytes; the queue must hold at least `n`
  take(n: number): Uint8Array {
    if (n === 0) return new Uint8Array(0)
    const first = this.takeSome(n)
    if (first.length === n) return first
    const out = new Uint8Array(n)
    out.set(first)
    let filled = first.length
    while (filled < n) {
      const part = this.takeSome(n - filled)
      out.set(part, filled)
      filled += part.length
    }
    return out
  }

  clear(): void {
    this.chunks = []
    this.head = 0
    this.offset = 0
    this.length = 0
  }
}

// Returned by the decoder when the buffered input is not enough to continue
const NeedInput: unique symbol = Symbol("effect/encoding/Tar/NeedInput")

// `next` skips unread body bytes; `read` consumes the current body.
// Both preserve progress across `NeedInput` retries.
class Decoder {
  private readonly queue = new ByteQueue()
  private ended = false
  private finished = false
  private closed = false
  // Incremented whenever the current body is invalidated
  generation = 0
  private remaining = 0
  private pad = 0
  // Bytes to discard before the next header
  private skip = 0
  private zeroBlock = false
  // Archive offset of the last header block read, for error messages
  private at = 0
  // An extended header whose data is still to be read
  private meta: RawHeader | undefined
  private pax: Map<string, string> | undefined
  // Records of the PAX global headers read so far
  private global: Map<string, string> | undefined
  private longName = ""
  private longLink = ""

  push(chunk: Uint8Array): void {
    if (!this.finished) this.queue.push(chunk)
  }

  end(): void {
    this.ended = true
  }

  close(): void {
    this.closed = true
    this.generation++
    this.queue.clear()
  }

  // Returns the next entry header, or `undefined` once the archive and the
  // input have ended. Input after the end of the archive is discarded.
  next(): Header | undefined | typeof NeedInput {
    try {
      return this.advance()
    } catch (error) {
      // Header errors are thrown where the archive offset is not known
      if (isTarError(error) && (error.kind === "InvalidHeader" || error.kind === "Unsupported")) {
        throw new TarError({ kind: error.kind, message: `${error.message} (header at byte ${this.at})` })
      }
      throw error
    }
  }

  private advance(): Header | undefined | typeof NeedInput {
    this.generation++
    this.skip += this.remaining + this.pad
    this.remaining = 0
    this.pad = 0
    const queue = this.queue
    while (true) {
      if (this.finished) return this.finish()
      while (this.skip > 0) {
        if (queue.length === 0) return this.needInput()
        this.skip -= queue.takeSome(this.skip).length
      }
      if (this.meta !== undefined) {
        const { size, typeflag } = this.meta
        const total = size + padding(size)
        if (queue.length < total) return this.needInput()
        const data = queue.take(total).subarray(0, size)
        this.meta = undefined
        if (typeflag === "x") this.pax = parsePax(data)
        else if (typeflag === "g") this.addGlobal(parsePax(data))
        else if (typeflag === "L") this.longName = readString(data, 0, size)
        else this.longLink = readString(data, 0, size)
        continue
      }
      if (queue.length < BLOCK) {
        if (queue.length === 0 && this.ended) return this.finish()
        return this.needInput()
      }
      this.at = queue.consumed
      const block = queue.take(BLOCK)
      if (isZeroBlock(block)) {
        if (this.zeroBlock) return this.finish()
        this.zeroBlock = true
        continue
      }
      if (this.zeroBlock) {
        throw invalidHeader("non-zero block after an end-of-archive block")
      }
      const raw = parseHeader(block)
      switch (raw.typeflag) {
        case "x":
        case "g":
        case "L":
        case "K": {
          if (raw.size > MAX_META_SIZE) {
            throw invalidHeader(`extended header of ${raw.size} bytes exceeds the limit`)
          }
          this.meta = raw
          continue
        }
        case "S": {
          throw unsupported("GNU sparse files are not supported")
        }
      }
      const header = this.toHeader(raw)
      this.remaining = header.size
      this.pad = padding(header.size)
      return header
    }
  }

  // Returns the buffered body bytes of the entry from generation `id`, or
  // `undefined` once the whole body has been read
  read(id: number): Arr.NonEmptyArray<Uint8Array> | undefined | typeof NeedInput {
    if (id !== this.generation) {
      throw new TarError({
        kind: "BodyConsumed",
        message: this.closed ?
          "tar entry body read after the archive stream ended" :
          "tar entry body read after moving to the next entry"
      })
    }
    if (this.remaining === 0) return undefined
    if (this.queue.length === 0) return this.needInput()
    const chunks = Arr.of(this.queue.takeSome(this.remaining))
    this.remaining -= chunks[0].length
    while (this.remaining > 0 && this.queue.length > 0) {
      const chunk = this.queue.takeSome(this.remaining)
      this.remaining -= chunk.length
      chunks.push(chunk)
    }
    return chunks
  }

  private needInput(): typeof NeedInput {
    if (this.ended) throw truncated(this.queue.consumed + this.queue.length)
    return NeedInput
  }

  private finish(): undefined | typeof NeedInput {
    // An extended header must be followed by the entry it describes
    if (!this.finished && (this.pax !== undefined || this.longName !== "" || this.longLink !== "")) {
      throw truncated(this.queue.consumed)
    }
    this.finished = true
    this.queue.clear()
    return this.ended ? undefined : NeedInput
  }

  // Global records apply to every entry that follows, except the ones that only
  // describe a single entry, and an empty value removes a record
  private addGlobal(records: Map<string, string>): void {
    for (const [key, value] of records) {
      if (key === "path" || key === "linkpath" || key === "size") continue
      if (value !== "") (this.global ??= new Map()).set(key, value)
      else this.global?.delete(key)
    }
    if (this.global?.size === 0) this.global = undefined
  }

  private toHeader(raw: RawHeader): Header {
    // The records of the entry's own extended header override global ones
    const records = this.global === undefined
      ? this.pax
      : this.pax === undefined
      ? this.global
      : new Map([...this.global, ...this.pax])
    const rest = records === undefined ? noPax : applyPax(raw, records)
    // Empty GNU long names are ignored, as in Go
    if (this.longName !== "") raw.path = this.longName
    if (this.longLink !== "") raw.linkTarget = this.longLink
    this.pax = undefined
    this.longName = ""
    this.longLink = ""
    if (!(Math.abs(raw.mtimeMillis) <= MAX_DATE_MILLIS)) {
      throw invalidHeader("mtime is out of range")
    }
    const type = typeOf(raw.typeflag, raw.path)
    const header: Types.Mutable<Header> = {
      path: raw.path,
      type,
      typeflag: raw.typeflag,
      size: isHeaderOnly(type) ? 0 : raw.size,
      mode: raw.mode & PERMISSION_BITS,
      uid: raw.uid,
      gid: raw.gid,
      uname: raw.uname,
      gname: raw.gname,
      mtime: new Date(raw.mtimeMillis),
      pax: rest
    }
    if (raw.linkTarget !== "") header.linkTarget = raw.linkTarget
    if (type === "CharDevice" || type === "BlockDevice") {
      header.devMajor = raw.devMajor
      header.devMinor = raw.devMinor
    }
    return header
  }
}

const SLAB_SIZE = 64 * 1024

const emptyBody = new Uint8Array(0)

// Bodies below this size are copied next to their header instead of being
// handed out as chunks of their own
const COPY_LIMIT = 16 * 1024

// Pack headers, padding and small body chunks into slabs; pass large chunks
// through without copying. Flushed slab regions are never overwritten.
class Encoder {
  private slab = new Uint8Array(0)
  // Start of the bytes in `slab` that have not been flushed, and their end
  private start = 0
  private offset = 0
  private chunks: Array<Uint8Array> = []
  buffered = 0
  // The entry whose body is being written, and the body bytes written so far
  private header: Header | undefined
  private written = 0

  begin(header: Header): void {
    encodeHeader(header, this.alloc)
    this.header = header
    this.written = 0
  }

  body(chunk: Uint8Array): void {
    const header = this.header!
    this.written += chunk.length
    if (this.written > header.size) {
      throw sizeMismatch(header, this.written)
    }
    if (chunk.length < COPY_LIMIT) {
      // `reserve` can start a new slab, so it must run before `slab` is read
      const offset = this.reserve(chunk.length)
      this.slab.set(chunk, offset)
      return
    }
    this.cut()
    this.chunks.push(chunk)
    this.buffered += chunk.length
  }

  end(): void {
    const header = this.header!
    this.header = undefined
    if (this.written !== header.size) {
      throw sizeMismatch(header, this.written)
    }
    this.reserve(padding(header.size))
  }

  finish(): void {
    this.reserve(BLOCK * 2)
  }

  flush(): Arr.NonEmptyArray<Uint8Array> {
    this.cut()
    const chunks = this.chunks as Arr.NonEmptyArray<Uint8Array>
    this.chunks = []
    this.buffered = 0
    return chunks
  }

  // Ends the current run of slab bytes as a chunk
  private cut(): void {
    if (this.offset > this.start) {
      this.chunks.push(this.slab.subarray(this.start, this.offset))
      this.start = this.offset
    }
  }

  // Returns `size` zeroed bytes of the output
  private alloc = (size: number): Uint8Array => {
    const offset = this.reserve(size)
    return this.slab.subarray(offset, offset + size)
  }

  // Reserves `size` zeroed bytes of the output in `slab`, and returns their offset
  private reserve(size: number): number {
    if (this.offset + size > this.slab.length) {
      this.cut()
      this.slab = new Uint8Array(Math.max(SLAB_SIZE, size))
      this.start = 0
      this.offset = 0
    }
    const offset = this.offset
    this.offset += size
    this.buffered += size
    return offset
  }
}
