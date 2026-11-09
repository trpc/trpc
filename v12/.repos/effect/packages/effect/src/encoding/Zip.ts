/**
 * Encodes and decodes zip archives as streams in Effect channels.
 *
 * `encode` writes each entry as it arrives and adds the central directory once
 * the input ends; `decode` reads entries in archive order from their local
 * headers. `decode` never buffers an entire entry body, and `encode` only
 * collects deflated bodies with a `size` of at most 64 KiB.
 *
 * Entries are stored or compressed with deflate, the methods every zip tool
 * reads. Compression uses the runtime's `CompressionStream("deflate-raw")`;
 * decompression is implemented here, so that `decode` can find the end of
 * entries whose sizes follow their data. ZIP64 fields are written when sizes,
 * offsets or the entry count need them, and read from local headers and data
 * descriptors.
 * Encryption, other compression methods and archives split across files are
 * not supported.
 *
 * This module is experimental and may receive breaking changes in patch
 * releases.
 *
 * @stability experimental
 * @since 4.0.6
 */
import * as Arr from "../Array.ts"
import * as Cause from "../Cause.ts"
import * as Channel from "../Channel.ts"
import * as Data from "../Data.ts"
import * as Effect from "../Effect.ts"
import * as Exit from "../Exit.ts"
import { ByteQueue, InflateError, InflateMemory, Inflater, NeedInput } from "../internal/inflate.ts"
import * as Predicate from "../Predicate.ts"
import * as Pull from "../Pull.ts"
import * as Scope from "../Scope.ts"
import * as Semaphore from "../Semaphore.ts"
import * as Stream from "../Stream.ts"

const ZipErrorTypeId = "~effect/encoding/Zip/ZipError"

/**
 * Error raised when a zip archive cannot be encoded or decoded.
 *
 * **Details**
 *
 * The `kind` field identifies the failure:
 *
 * - `InvalidHeader`: a header has an unknown signature or a malformed field, or
 *   an entry has a value that cannot be written.
 * - `InvalidData`: the compressed data of an entry is corrupt.
 * - `Truncated`: the input ended inside an entry or before the central
 *   directory.
 * - `Checksum`: the data of an entry does not match its CRC-32.
 * - `SizeMismatch`: an entry body produced a byte count other than its declared
 *   `size`, or the data of an entry does not match the sizes in the archive.
 * - `Unsupported`: the archive uses a feature this module does not read, such
 *   as encryption or a compression method other than store and deflate.
 * - `BodyConsumed`: an entry body was read after the decoder had moved past it.
 *
 * @stability experimental
 * @category errors
 * @since 4.0.6
 */
export class ZipError extends Data.TaggedError("ZipError")<{
  readonly kind:
    | "InvalidHeader"
    | "InvalidData"
    | "Truncated"
    | "Checksum"
    | "SizeMismatch"
    | "Unsupported"
    | "BodyConsumed"
  readonly message: string
}> {
  /**
   * Marks this value as a zip error for runtime guards.
   *
   * @stability experimental
   * @since 4.0.6
   */
  readonly [ZipErrorTypeId] = ZipErrorTypeId
}

/**
 * Checks whether a value is a `ZipError`.
 *
 * @stability experimental
 * @category guards
 * @since 4.0.6
 */
export const isZipError = (u: unknown): u is ZipError => Predicate.hasProperty(u, ZipErrorTypeId)

/**
 * Kind of object described by a zip entry.
 *
 * @stability experimental
 * @category models
 * @since 4.0.6
 */
export type EntryType = "File" | "Directory"

/**
 * Compression method of a zip entry.
 *
 * @stability experimental
 * @category models
 * @since 4.0.6
 */
export type Method = "Store" | "Deflate"

/**
 * Metadata of a zip entry.
 *
 * **Details**
 *
 * `path` is the archive path, with `/` separators; directory paths end with
 * `/`. `size` is the uncompressed byte length when it is known before the body:
 * decoded entries whose sizes follow their data have no `size`. `mode` holds
 * Unix permission bits and is written to the central directory, which `decode`
 * does not read, so decoded headers have no `mode`. `mtime` has a resolution of
 * one second when the archive has an extended timestamp and two seconds
 * otherwise.
 *
 * @stability experimental
 * @category models
 * @since 4.0.6
 */
export interface Header {
  readonly path: string
  readonly type: EntryType
  readonly method: Method
  readonly mtime: Date
  readonly size?: number | undefined
  readonly mode?: number | undefined
}

/**
 * Zip entry: a header and a stream of the uncompressed body bytes.
 *
 * **Details**
 *
 * `decode` returns these, and `fileStream` builds them. `encode` writes the
 * sizes and CRC-32 of a streamed body in a data descriptor after the data.
 *
 * @see {@link ContentEntry} for entries whose content is held in memory
 *
 * @stability experimental
 * @category models
 * @since 4.0.6
 */
export interface Entry<E = never, R = never> {
  readonly header: Header
  readonly body: Stream.Stream<Uint8Array, E, R>
  readonly content?: undefined
}

/**
 * Zip entry whose uncompressed content is held in memory.
 *
 * **Details**
 *
 * `file` and `directory` build these. Because the content is known before the
 * entry is written, `encode` puts its sizes and CRC-32 in the local header and
 * writes no data descriptor, which every zip reader accepts. `content` and
 * `body` exclude each other, so an entry whose body is replaced must drop
 * `content`.
 *
 * @see {@link Entry} for entries whose content is streamed
 *
 * @stability experimental
 * @category models
 * @since 4.0.6
 */
export interface ContentEntry {
  readonly header: Header
  readonly content: Uint8Array
  readonly body?: undefined
}

/**
 * Options for the entry constructors.
 *
 * **Details**
 *
 * Unset fields default to an mtime of 1980-01-01T00:00:00Z, the earliest time
 * a zip header can hold, and mode `0o644` (`0o755` for directories). The
 * defaults make archives reproducible.
 *
 * @stability experimental
 * @category models
 * @since 4.0.6
 */
export interface EntryOptions {
  readonly mtime?: Date | undefined
  readonly mode?: number | undefined
}

/**
 * Options for file entries.
 *
 * **Details**
 *
 * `method` defaults to `"Deflate"`. Use `"Store"` for content that is already
 * compressed, such as images or archives.
 *
 * @stability experimental
 * @category models
 * @since 4.0.6
 */
export interface FileOptions extends EntryOptions {
  readonly method?: Method | undefined
}

/**
 * Options for file entries whose content is streamed.
 *
 * **Details**
 *
 * `size` is the exact byte length of the body. It is required for `Store`,
 * because streaming readers can only find the end of stored data from its
 * size, and optional for `Deflate`, where it is checked against the body.
 *
 * @stability experimental
 * @category models
 * @since 4.0.6
 */
export type FileStreamOptions =
  & EntryOptions
  & (
    | { readonly method?: "Deflate" | undefined; readonly size?: number | undefined }
    | { readonly method: "Store"; readonly size: number }
  )

const MIN_MTIME = Date.UTC(1980, 0, 1)

const makeHeader = (
  path: string,
  type: EntryType,
  method: Method,
  options: EntryOptions | undefined,
  size: number | undefined
): Header => ({
  path,
  type,
  method,
  mtime: options?.mtime ?? new Date(MIN_MTIME),
  mode: options?.mode ?? (type === "Directory" ? 0o755 : 0o644),
  ...(size === undefined ? undefined : { size })
})

/**
 * Creates a file entry from in-memory content.
 *
 * **Details**
 *
 * String content is encoded as UTF-8, and `size` is the byte length of the
 * content. Because the content is known up front, its sizes and CRC-32 are
 * written in the local header, which every zip reader accepts.
 *
 * @see {@link fileStream} for content that is streamed instead of held in memory
 * @see {@link encode} for writing entries to an archive
 *
 * @stability experimental
 * @category constructors
 * @since 4.0.6
 */
export const file = (path: string, content: string | Uint8Array, options?: FileOptions): ContentEntry => {
  const bytes = typeof content === "string" ? textEncoder.encode(content) : content
  return { header: makeHeader(path, "File", options?.method ?? "Deflate", options, bytes.length), content: bytes }
}

/**
 * Creates a file entry whose content is streamed from `body`.
 *
 * **When to use**
 *
 * Use when the content is too large to hold in memory, or is read from a file
 * or another stream.
 *
 * **Details**
 *
 * `body` is not run until the entry is encoded. Its sizes and CRC-32 are
 * written in a data descriptor after the data.
 *
 * **Gotchas**
 *
 * - A stored entry without `size` fails with an `InvalidHeader` `ZipError`.
 * - When `size` is set, `encode` fails with a `SizeMismatch` `ZipError` if the
 *   body produces fewer or more bytes.
 * - Non-empty stored entries are followed by a data descriptor, which some
 *   streaming readers mishandle. Java's `ZipInputStream` rejects them, and
 *   libarchive reading from a pipe (as `bsdtar` does) ends them at the first
 *   bytes that look like a descriptor, so content can cut the entry short and
 *   add entries. Use `Deflate` or an in-memory `file` for untrusted content
 *   and for those readers.
 *
 * @see {@link file} for in-memory content
 * @see {@link encode} for writing entries to an archive
 *
 * @stability experimental
 * @category constructors
 * @since 4.0.6
 */
export const fileStream = <E = never, R = never>(
  path: string,
  body: Stream.Stream<Uint8Array, E, R>,
  options?: FileStreamOptions
): Entry<E, R> => ({
  header: makeHeader(path, "File", options?.method ?? "Deflate", options, options?.size),
  body
})

/**
 * Creates a directory entry.
 *
 * **Details**
 *
 * A trailing `/` is added to a non-empty `path` when missing, as zip tools
 * expect for directories.
 *
 * @stability experimental
 * @category constructors
 * @since 4.0.6
 */
export const directory = (path: string, options?: EntryOptions): ContentEntry => ({
  // An empty path stays empty, so that `encode` rejects it
  header: makeHeader(path === "" || path.endsWith("/") ? path : `${path}/`, "Directory", "Store", options, 0),
  content: emptyBody
})

/**
 * Creates a channel that decodes zip archive bytes into entries.
 *
 * **Details**
 *
 * Entries are read in archive order from their local headers, so archives can
 * be decoded as they arrive, for example from an HTTP response. Each output
 * chunk holds one entry, and each body streams the uncompressed bytes of the
 * entry. Pulling the next entry skips whatever is left of the current body.
 * Stored and deflated entries are read, including ZIP64 sizes and deflated
 * entries whose sizes follow their data in a data descriptor. Every body is
 * checked against its CRC-32 and sizes. Reading stops at the central directory.
 *
 * Paths use the UTF-8 flag when set, and otherwise the first Info-ZIP Unicode
 * path field when it matches the name, as Info-ZIP and 7-Zip do; other paths
 * are read as UTF-8 when valid and as CP437 otherwise. Times are read from the
 * extended timestamp field when present, and otherwise from the DOS time and
 * date, which have no time zone and are read as UTC.
 *
 * **Gotchas**
 *
 * - Read each body before pulling the next entry: a body read afterwards fails
 *   with a `BodyConsumed` `ZipError`. Operators that pull ahead, such as
 *   `Stream.buffer`, therefore can't sit between `decode` and the body reads.
 * - Read bodies while the entry stream runs, for example in `Stream.mapEffect`:
 *   once it has ended, as after `Stream.runCollect`, `Stream.runHead` or
 *   `Stream.take`, every body fails with a `BodyConsumed` `ZipError`.
 * - A body reads the entry's bytes once: running it again continues where the
 *   previous run stopped.
 * - The central directory is not read, so `mode`, comments and entries that
 *   only the central directory lists are not reported. Tools that read the
 *   central directory can see other entries and paths, for example in
 *   archives updated by appending.
 * - Archives that do not start with an entry or a central directory, such as
 *   self-extracting archives, fail with an `InvalidHeader` `ZipError`.
 * - Stored entries whose sizes only follow their data fail with an
 *   `Unsupported` `ZipError`. Python's `zipfile` writes them for stored
 *   entries on unseekable output, and Info-ZIP's `zip` for empty files when
 *   writing to a pipe. Searching for their end would let the content of an
 *   entry forge the entries after it.
 * - A body that grows past its `size` fails with a `SizeMismatch` `ZipError`
 *   before the extra bytes are emitted, so `size` can be checked before reading.
 * - Deflated data can expand about a thousand times, and pulling the next
 *   entry inflates the rest of the current body to find its end. To bound the
 *   work on untrusted archives, check `size`, count the bytes of bodies
 *   without one, and end the stream at an entry that is too large rather than
 *   skip it.
 * - Every `ZipError` ends the archive: later entry and body reads fail with
 *   the same error.
 * - The channel completes only when its input ends: input after the central
 *   directory is read and discarded, so that the upstream done value can be
 *   passed on.
 * - Paths are returned as written in the archive: they can be absolute,
 *   contain `..`, drive letters, control characters or backslashes, which some
 *   tools read as separators, and can repeat. Validate them before writing
 *   entries to disk; `encode` rejects absolute paths, drive letters and
 *   backslashes. Paths with a NUL character, which other tools take as the end
 *   of the name, fail with an `InvalidHeader` `ZipError`.
 *
 * @see {@link encode} for the inverse operation
 *
 * @stability experimental
 * @category decoding
 * @since 4.0.6
 */
export const decode = <IE = never, Done = unknown>(): Channel.Channel<
  Arr.NonEmptyReadonlyArray<Entry<ZipError | IE>>,
  ZipError | IE,
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

      const run = <A, D>(f: () => A | undefined | typeof NeedInput, end: () => D): Pull.Pull<A, ZipError | IE, D> =>
        Effect.suspend(function loop(): Pull.Pull<A, ZipError | IE, D> {
          const seen = pulls
          let result: A | undefined | typeof NeedInput
          try {
            result = f()
          } catch (error) {
            return isZipError(error) ? Effect.fail(error) : Effect.die(error)
          }
          if (result === NeedInput) return Effect.flatMap(pullInput(seen), loop)
          return result === undefined ? Cause.done(end()) : Effect.succeed(result)
        })

      const body = (id: number): Stream.Stream<Uint8Array, ZipError | IE> =>
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
 * Creates a channel that encodes entries into zip archive bytes.
 *
 * **Details**
 *
 * Each entry is written as soon as it arrives: a local header, the stored or
 * deflated body and, for entries with a streamed `body`, a data descriptor
 * with the CRC-32 and sizes. A `ContentEntry` has them in its local header.
 * The central directory is written once the input ends. Paths are written as
 * UTF-8, with the UTF-8 flag set when they are not ASCII. `mtime`
 * is written both as a DOS time in UTC, which keeps two-second resolution and
 * covers 1980 to 2107, and as an extended timestamp in whole seconds when it
 * falls between 1970 and 2038. ZIP64 fields are added when a size, an offset
 * or the entry count does not fit the classic fields, and to the local header
 * of a deflated entry streamed without a `size` or with one near 4 GiB, so
 * that readers know the width of the sizes after its data.
 *
 * Headers and body chunks below 16 KiB are gathered into output chunks of
 * about 64 KiB, and larger body chunks pass through without copying. Output is
 * handed out before waiting for more entries, but up to 64 KiB of it can be
 * held while a body is pulled. Each body chunk of a streamed `Deflate` entry is
 * a separate compressor job, so larger chunks compress faster. A `Deflate`
 * body with a `size` of at most 64 KiB is instead collected and compressed in
 * one job, and still gets a data descriptor; omit `size` to stream it.
 *
 * **Gotchas**
 *
 * - Deflated entries need `CompressionStream("deflate-raw")`. On a runtime
 *   without it, encoding a deflated entry dies with the runtime's error, as
 *   it does when the compressor fails: check for the API or use `Store`.
 * - Deflated bytes come from the runtime's `CompressionStream`, so they can
 *   differ between runtimes. Archives of stored entries are byte-identical
 *   everywhere.
 * - A body that produces a byte count other than a set `header.size`, or any
 *   bytes for a directory, fails with a `SizeMismatch` `ZipError`.
 * - Directories are always stored, whatever their `method`.
 * - Empty paths, paths starting with `/` or a drive letter such as `C:`, paths
 *   containing `\` or NUL, `File` paths ending with `/`, `Directory` paths not
 *   ending with `/`, and invalid modes, sizes or times fail with an
 *   `InvalidHeader` `ZipError`. Other paths are written as given, including
 *   `..` segments, so validate untrusted paths before encoding them.
 *
 * **Example** (Writing and reading an archive)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 * import { Zip } from "effect/encoding"
 *
 * const archive = Stream.make(
 *   Zip.directory("docs"),
 *   Zip.file("docs/readme.txt", "Hello, zip!")
 * ).pipe(Stream.pipeThroughChannel(Zip.encode()))
 *
 * const listing = archive.pipe(
 *   Stream.pipeThroughChannel(Zip.decode()),
 *   Stream.mapEffect((entry) =>
 *     Stream.mkString(Stream.decodeText(entry.body)).pipe(
 *       Effect.map((text) => `${entry.header.path} ${JSON.stringify(text)}`)
 *     )
 *   ),
 *   Stream.runCollect
 * )
 * await Effect.runPromise(listing) // => ['docs/ ""', 'docs/readme.txt "Hello, zip!"']
 * ```
 *
 * @see {@link decode} for the inverse operation
 * @see {@link file} for building entries from in-memory content
 * @see {@link fileStream} for building entries from streamed content
 *
 * @stability experimental
 * @category encoding
 * @since 4.0.6
 */
export const encode = <
  IE = never,
  Done = unknown,
  In extends Entry<any, any> | ContentEntry = Entry | ContentEntry
>(): Channel.Channel<
  Arr.NonEmptyReadonlyArray<Uint8Array>,
  ZipError | IE | (In extends Entry<infer E, any> ? E : never),
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
      const writer = new Writer()
      let entries: ReadonlyArray<Entry<E, R> | ContentEntry> = []
      let index = 0
      let done: { readonly value: Done } | undefined
      let body: Pull.Pull<Arr.NonEmptyReadonlyArray<Uint8Array>, E | ZipError, void, R> | undefined
      let bodyScope: Scope.Closeable | undefined
      // In-memory entries are deflated ahead of the one being written, so the
      // deflates overlap
      let deflates: Array<Deflating | undefined> = []

      const startDeflates = (from: number): void => {
        for (let i = from; i < Math.min(entries.length, from + DEFLATE_AHEAD); i++) {
          if (deflates[i] !== undefined) continue
          const { content, header } = entries[i]
          if (header.type !== "File" || header.method !== "Deflate" || content === undefined) continue
          if (i > from && content.length > DEFLATE_AHEAD_SIZE) continue
          const deflating: Deflating = { promise: deflateBytes(content), data: undefined }
          // Failures surface when the entry is written; deflates left behind by
          // a failed encode finish on their own
          deflating.promise.then((data) => {
            deflating.data = data
          }, () => {})
          deflates[i] = deflating
        }
      }

      const write = (f: () => void): Effect.Effect<void, ZipError> => {
        try {
          f()
        } catch (error) {
          return isZipError(error) ? Effect.fail(error) : Effect.die(error)
        }
        return Effect.void
      }

      return Effect.gen(function*() {
        while (true) {
          if (writer.buffered >= SLAB_SIZE) return writer.flush()
          if (body !== undefined) {
            const chunks = yield* Pull.catchDone(body, () => Effect.undefined)
            if (chunks !== undefined) {
              yield* write(() => writer.data(chunks))
              continue
            }
            body = undefined
            yield* Scope.close(bodyScope!, Exit.void)
            yield* write(() => writer.end())
            continue
          }
          if (index < entries.length) {
            const entry = entries[index++]
            const { header } = entry
            yield* write(() => validate(header))
            const compress = header.type === "File" && header.method === "Deflate"
            if (entry.content !== undefined) {
              const bytes = entry.content
              let data = bytes
              if (compress) {
                startDeflates(index - 1)
                const deflating = deflates[index - 1]!
                deflates[index - 1] = undefined
                data = deflating.data ?? (yield* Effect.promise(() => deflating.promise))
              }
              yield* write(() => writer.entry(header, bytes, data))
              continue
            }
            yield* write(() => writer.begin(header))
            if (compress && header.size !== undefined && header.size <= DEFLATE_AHEAD_SIZE) {
              // A small body costs less to deflate in one piece than as a stream
              const size = header.size
              const chunks: Array<Uint8Array> = []
              let length = 0
              yield* Stream.runForEachArray(entry.body, (array) =>
                write(() => {
                  for (const chunk of array) {
                    chunks.push(chunk)
                    length += chunk.length
                  }
                  if (length > size) throw sizeMismatch(header.path, length, size)
                  writer.update(array)
                }))
              const data = yield* Effect.promise(() => deflateBytes(concat(chunks, length)))
              yield* write(() => {
                writer.data([data])
                writer.end()
              })
              continue
            }
            const raw = Stream.mapArray(entry.body, (chunks) => {
              writer.update(chunks)
              return chunks
            })
            bodyScope = Scope.forkUnsafe(scope)
            body = yield* Channel.toPullScoped((compress ? deflate(raw) : raw).channel, bodyScope)
            continue
          }
          if (writer.buffered > 0) return writer.flush()
          if (done !== undefined) return yield* Cause.done(done.value)
          const next = yield* Pull.catchDone(upstream, (value) => {
            done = { value: value as Done }
            return Effect.undefined
          })
          if (next === undefined) {
            writer.finish()
            continue
          }
          entries = next
          index = 0
          deflates = []
        }
      })
    })
  )
}

// Compressor failures, including a runtime without `deflate-raw`, are defects
const deflate = <E, R>(input: Stream.Stream<Uint8Array, E, R>): Stream.Stream<Uint8Array, E, R> =>
  Stream.unwrap(Effect.map(
    Effect.sync(() => new CompressionStream("deflate-raw")),
    (compressor) => {
      const writer = compressor.writable.getWriter()
      const feed = Stream.runForEach(
        input,
        (chunk) => Effect.promise(() => writer.write(compressible(chunk)))
      ).pipe(
        Effect.andThen(Effect.promise(() => writer.close())),
        Effect.onError(() =>
          Effect.sync(() => {
            writer.abort().catch(() => {})
          })
        )
      )
      const output = Stream.orDie(Stream.fromReadableStream({
        evaluate: () => compressor.readable,
        onError: (cause) => cause
      }))
      return Stream.merge(output, Stream.fromEffectDrain(feed))
    }
  ))

// CompressionStream rejects views of a SharedArrayBuffer
const compressible = (bytes: Uint8Array): Uint8Array<ArrayBuffer> =>
  bytes.buffer instanceof ArrayBuffer ? bytes as Uint8Array<ArrayBuffer> : bytes.slice()

// How many in-memory entries are deflated at once, and the largest one that
// is deflated before its turn
const DEFLATE_AHEAD = 16
const DEFLATE_AHEAD_SIZE = 64 * 1024

// A deflate started ahead, with its data once it is done
interface Deflating {
  readonly promise: Promise<Uint8Array>
  data: Uint8Array | undefined
}

// One promise per in-memory entry costs less than a stream
const deflateBytes = async (bytes: Uint8Array): Promise<Uint8Array> => {
  const compressor = new CompressionStream("deflate-raw")
  const writer = compressor.writable.getWriter()
  // A failed write errors the readable, so the reads report it
  if (bytes.length > 0) writer.write(compressible(bytes)).catch(() => {})
  writer.close().catch(() => {})
  const reader = compressor.readable.getReader()
  const chunks: Array<Uint8Array> = []
  let length = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    length += value.length
  }
  return concat(chunks, length)
}

const concat = (chunks: ReadonlyArray<Uint8Array>, length: number): Uint8Array => {
  if (chunks.length === 1) return chunks[0]
  const out = new Uint8Array(length)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.length
  }
  return out
}

const invalidHeader = (message: string) => new ZipError({ kind: "InvalidHeader", message })

const invalidData = (message: string) => new ZipError({ kind: "InvalidData", message })

const truncated = (at: number) =>
  new ZipError({ kind: "Truncated", message: `unexpected end of zip archive at byte ${at}` })

const unsupported = (message: string) => new ZipError({ kind: "Unsupported", message })

const sizeMismatch = (path: string, actual: number, expected: number) =>
  new ZipError({
    kind: "SizeMismatch",
    message: `body of ${JSON.stringify(path)} has ${
      actual > expected ? "at least" : "only"
    } ${actual} bytes, but its size is ${expected}`
  })

const LOCAL = 0x04034b50
const CENTRAL = 0x02014b50
const DESCRIPTOR = 0x08074b50
const END = 0x06054b50
const END64 = 0x06064b50
const LOCATOR64 = 0x07064b50

const FLAG_ENCRYPTED = 0x0001
const FLAG_DESCRIPTOR = 0x0008
const FLAG_STRONG_ENCRYPTION = 0x0040
const FLAG_UTF8 = 0x0800

const EXTRA_ZIP64 = 0x0001
const EXTRA_TIMESTAMP = 0x5455
const EXTRA_UNICODE_PATH = 0x7075

const VERSION = 20
const VERSION_ZIP64 = 45
const CREATOR_UNIX = 3

const MAX16 = 0xffff
const MAX32 = 0xffffffff

const S_IFDIR = 0o040000
const S_IFREG = 0o100000
const DOS_DIRECTORY = 0x10

const textEncoder = new TextEncoder()
// Paths keep a leading byte order mark, as other zip tools do
const textDecoder = new TextDecoder("utf-8", { ignoreBOM: true })
const strictTextDecoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })

const emptyBody = new Uint8Array(0)

// May exceed 2^53 - 1; callers check or compare
const readUint64 = (view: DataView, at: number): number =>
  view.getUint32(at, true) + view.getUint32(at + 4, true) * 0x100000000

const getUint64 = (view: DataView, at: number): number => {
  const value = readUint64(view, at)
  if (!Number.isSafeInteger(value)) throw invalidHeader("a 64-bit field exceeds 2^53 - 1")
  return value
}

const setUint64 = (view: DataView, at: number, value: number): void => {
  view.setUint32(at, value % 0x100000000, true)
  view.setUint32(at + 4, Math.floor(value / 0x100000000), true)
}

// DOS times have two-second resolution and cover 1980 to 2107
const toDos = (mtime: Date): { readonly time: number; readonly date: number } => {
  const millis = mtime.getTime()
  if (millis < MIN_MTIME) return { time: 0, date: (1 << 5) | 1 }
  const date = new Date(millis)
  const year = date.getUTCFullYear()
  if (year > 2107) return { time: (23 << 11) | (59 << 5) | 29, date: (127 << 9) | (12 << 5) | 31 }
  return {
    time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | (date.getUTCSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate()
  }
}

const fromDos = (time: number, date: number): number =>
  Date.UTC(
    (date >> 9) + 1980,
    ((date >> 5) & 0xf) - 1,
    date & 0x1f,
    time >> 11,
    (time >> 5) & 0x3f,
    (time & 0x1f) * 2
  )

const CP437 = "ÇüéâäàåçêëèïîìÄÅ" +
  "ÉæÆôöòûùÿÖÜ¢£¥₧ƒ" +
  "áíóúñÑªº¿⌐¬½¼¡«»" +
  "░▒▓│┤╡╢╖╕╣║╗╝╜╛┐" +
  "└┴┬├─┼╞╟╚╔╩╦╠═╬╧" +
  "╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀" +
  "αßΓπΣσµτΦΘΩδ∞φε∩" +
  "≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ "

const decodeName = (bytes: Uint8Array, utf8: boolean): string => {
  if (utf8) return textDecoder.decode(bytes)
  try {
    return strictTextDecoder.decode(bytes)
  } catch {
    let name = ""
    for (let i = 0; i < bytes.length; i++) {
      name += bytes[i] < 0x80 ? String.fromCharCode(bytes[i]) : CP437[bytes[i] - 0x80]
    }
    return name
  }
}

// CRC-32 (IEEE) lookup tables for sixteen bytes at a time
const CRC_TABLE = (() => {
  const table = new Int32Array(16 * 256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  for (let n = 0; n < 256; n++) {
    let c = table[n]
    for (let k = 1; k < 16; k++) {
      c = table[c & 0xff] ^ (c >>> 8)
      table[k * 256 + n] = c
    }
  }
  return table
})()

const littleEndian = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1

const crc32 = (crc: number, bytes: Uint8Array): number => {
  const t = CRC_TABLE
  let c = ~crc
  let i = 0
  const length = bytes.length
  // Reading whole words is faster than combining bytes, but needs aligned,
  // little-endian words
  if (littleEndian && length >= 64) {
    for (; ((bytes.byteOffset + i) & 3) !== 0; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
    const count = ((length - i) >>> 4) << 2
    const words = new Int32Array(bytes.buffer, bytes.byteOffset + i, count)
    for (let j = 0; j < count; j += 4) {
      const a = c ^ words[j]
      const b = words[j + 1]
      const d = words[j + 2]
      const e = words[j + 3]
      c = t[3840 + (a & 0xff)] ^ t[3584 + ((a >>> 8) & 0xff)] ^ t[3328 + ((a >>> 16) & 0xff)] ^
        t[3072 + (a >>> 24)] ^ t[2816 + (b & 0xff)] ^ t[2560 + ((b >>> 8) & 0xff)] ^
        t[2304 + ((b >>> 16) & 0xff)] ^ t[2048 + (b >>> 24)] ^ t[1792 + (d & 0xff)] ^
        t[1536 + ((d >>> 8) & 0xff)] ^ t[1280 + ((d >>> 16) & 0xff)] ^ t[1024 + (d >>> 24)] ^
        t[768 + (e & 0xff)] ^ t[512 + ((e >>> 8) & 0xff)] ^ t[256 + ((e >>> 16) & 0xff)] ^ t[e >>> 24]
    }
    i += count * 4
  }
  for (; i + 16 <= length; i += 16) {
    const a = c ^ (bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24))
    c = t[3840 + (a & 0xff)] ^ t[3584 + ((a >>> 8) & 0xff)] ^ t[3328 + ((a >>> 16) & 0xff)] ^
      t[3072 + (a >>> 24)] ^ t[2816 + bytes[i + 4]] ^ t[2560 + bytes[i + 5]] ^ t[2304 + bytes[i + 6]] ^
      t[2048 + bytes[i + 7]] ^ t[1792 + bytes[i + 8]] ^ t[1536 + bytes[i + 9]] ^ t[1280 + bytes[i + 10]] ^
      t[1024 + bytes[i + 11]] ^ t[768 + bytes[i + 12]] ^ t[512 + bytes[i + 13]] ^ t[256 + bytes[i + 14]] ^
      t[bytes[i + 15]]
  }
  for (; i < length; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return ~c >>> 0
}

const validate = (header: Header): void => {
  const { method, mode, mtime, path, size, type } = header
  if (path === "") throw invalidHeader("path is empty")
  const quoted = JSON.stringify(path)
  if (path.startsWith("/")) throw invalidHeader(`path ${quoted} is absolute`)
  // The zip format forbids these, and libarchive reads them as separators and roots
  if (path.includes("\\")) throw invalidHeader(`path ${quoted} contains a backslash`)
  if (/^[A-Za-z]:/.test(path)) throw invalidHeader(`path ${quoted} starts with a drive letter`)
  if (path.includes("\0")) throw invalidHeader(`path ${quoted} contains a NUL character`)
  if (type === "File") {
    if (path.endsWith("/")) throw invalidHeader(`file path ${quoted} ends with "/"`)
    if (method !== "Store" && method !== "Deflate") throw invalidHeader(`unknown method for ${quoted}`)
  } else if (type === "Directory") {
    if (!path.endsWith("/")) throw invalidHeader(`directory path ${quoted} does not end with "/"`)
    if (size !== undefined && size !== 0) throw invalidHeader(`directory ${quoted} has a size`)
  } else {
    throw invalidHeader(`unknown entry type for ${quoted}`)
  }
  if (size !== undefined && !(Number.isSafeInteger(size) && size >= 0)) {
    throw invalidHeader(`size of ${quoted} is not a non-negative safe integer`)
  }
  if (mode !== undefined && !(Number.isInteger(mode) && mode >= 0 && mode <= 0o7777)) {
    throw invalidHeader(`mode of ${quoted} is not a permission mode`)
  }
  if (Number.isNaN(mtime.getTime())) {
    throw invalidHeader(`mtime of ${quoted} is not a valid date`)
  }
}

interface EntryRecord {
  readonly name: Uint8Array
  readonly flags: number
  readonly method: number
  readonly time: number
  readonly date: number
  readonly seconds: number | undefined
  readonly external: number
  readonly offset: number
  // Whether the local header has ZIP64 sizes, which then also follow the data
  zip64: boolean
  crc: number
  compressedSize: number
  size: number
}

// An entry whose data is being written; `record` counts its bytes
interface Streaming {
  readonly header: Header
  readonly record: EntryRecord
  readonly descriptor: boolean
}

const timestampLength = (record: EntryRecord): number => record.seconds === undefined ? 0 : 9

const writeTimestamp = (bytes: Uint8Array, view: DataView, at: number, record: EntryRecord): void => {
  if (record.seconds === undefined) return
  view.setUint16(at, EXTRA_TIMESTAMP, true)
  view.setUint16(at + 2, 5, true)
  bytes[at + 4] = 1
  view.setUint32(at + 5, record.seconds, true)
}

const localHeader = (record: EntryRecord): Uint8Array => {
  const { zip64 } = record
  const extraLength = (zip64 ? 20 : 0) + timestampLength(record)
  const bytes = new Uint8Array(30 + record.name.length + extraLength)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, LOCAL, true)
  view.setUint16(4, zip64 ? VERSION_ZIP64 : VERSION, true)
  view.setUint16(6, record.flags, true)
  view.setUint16(8, record.method, true)
  view.setUint16(10, record.time, true)
  view.setUint16(12, record.date, true)
  view.setUint32(14, record.crc, true)
  view.setUint32(18, zip64 ? MAX32 : record.compressedSize, true)
  view.setUint32(22, zip64 ? MAX32 : record.size, true)
  view.setUint16(26, record.name.length, true)
  view.setUint16(28, extraLength, true)
  bytes.set(record.name, 30)
  let at = 30 + record.name.length
  if (zip64) {
    view.setUint16(at, EXTRA_ZIP64, true)
    view.setUint16(at + 2, 16, true)
    setUint64(view, at + 4, record.size)
    setUint64(view, at + 12, record.compressedSize)
    at += 20
  }
  writeTimestamp(bytes, view, at, record)
  return bytes
}

const dataDescriptor = (record: EntryRecord): Uint8Array => {
  const wide = record.zip64
  const bytes = new Uint8Array(wide ? 24 : 16)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, DESCRIPTOR, true)
  view.setUint32(4, record.crc, true)
  if (wide) {
    setUint64(view, 8, record.compressedSize)
    setUint64(view, 16, record.size)
  } else {
    view.setUint32(8, record.compressedSize, true)
    view.setUint32(12, record.size, true)
  }
  return bytes
}

const centralHeader = (record: EntryRecord): Uint8Array => {
  // ZIP64 holds only the fields that overflow, in this order
  const wide: Array<number> = []
  if (record.size >= MAX32) wide.push(record.size)
  if (record.compressedSize >= MAX32) wide.push(record.compressedSize)
  if (record.offset >= MAX32) wide.push(record.offset)
  const zip64Length = wide.length === 0 ? 0 : 4 + 8 * wide.length
  const extraLength = zip64Length + timestampLength(record)
  const version = wide.length === 0 && !record.zip64 ? VERSION : VERSION_ZIP64
  const bytes = new Uint8Array(46 + record.name.length + extraLength)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, CENTRAL, true)
  view.setUint16(4, (CREATOR_UNIX << 8) | version, true)
  view.setUint16(6, version, true)
  view.setUint16(8, record.flags, true)
  view.setUint16(10, record.method, true)
  view.setUint16(12, record.time, true)
  view.setUint16(14, record.date, true)
  view.setUint32(16, record.crc, true)
  view.setUint32(20, Math.min(record.compressedSize, MAX32), true)
  view.setUint32(24, Math.min(record.size, MAX32), true)
  view.setUint16(28, record.name.length, true)
  view.setUint16(30, extraLength, true)
  view.setUint32(38, record.external, true)
  view.setUint32(42, Math.min(record.offset, MAX32), true)
  bytes.set(record.name, 46)
  let at = 46 + record.name.length
  if (wide.length > 0) {
    view.setUint16(at, EXTRA_ZIP64, true)
    view.setUint16(at + 2, 8 * wide.length, true)
    for (let i = 0; i < wide.length; i++) setUint64(view, at + 4 + 8 * i, wide[i])
    at += zip64Length
  }
  writeTimestamp(bytes, view, at, record)
  return bytes
}

const SLAB_SIZE = 64 * 1024

// Room for deflate to grow data that does not compress, when choosing ZIP64
const DEFLATE_HEADROOM = 16 * 1024 * 1024

// Chunks below this size are copied together instead of being handed out alone
const COPY_LIMIT = 16 * 1024

class Writer {
  private chunks: Array<Uint8Array> = []
  buffered = 0
  private offset = 0
  private readonly records: Array<EntryRecord> = []
  private current: Streaming | undefined

  // Hands out the buffered output, joining runs of small chunks; needs `buffered > 0`
  flush(): Arr.NonEmptyArray<Uint8Array> {
    const out: Array<Uint8Array> = []
    let run: Array<Uint8Array> = []
    let runLength = 0
    const join = () => {
      if (run.length === 1) {
        out.push(run[0])
      } else if (run.length > 1) {
        const joined = new Uint8Array(runLength)
        let at = 0
        for (const chunk of run) {
          joined.set(chunk, at)
          at += chunk.length
        }
        out.push(joined)
      }
      run = []
      runLength = 0
    }
    for (const chunk of this.chunks) {
      if (chunk.length >= COPY_LIMIT) {
        join()
        out.push(chunk)
      } else {
        run.push(chunk)
        runLength += chunk.length
      }
    }
    join()
    this.chunks = []
    this.buffered = 0
    return out as Arr.NonEmptyArray<Uint8Array>
  }

  private push(bytes: Uint8Array): void {
    if (bytes.length === 0) return
    this.chunks.push(bytes)
    this.offset += bytes.length
    this.buffered += bytes.length
  }

  private record(header: Header, flags: number): EntryRecord {
    const name = textEncoder.encode(header.path)
    if (name.length > MAX16) throw invalidHeader(`path ${JSON.stringify(header.path)} is longer than 65535 bytes`)
    const { date, time } = toDos(header.mtime)
    const seconds = Math.floor(header.mtime.getTime() / 1000)
    const directory = header.type === "Directory"
    const mode = header.mode ?? (directory ? 0o755 : 0o644)
    return {
      name,
      // The UTF-8 byte length equals the string length only for ASCII
      flags: name.length === header.path.length ? flags : flags | FLAG_UTF8,
      method: header.type === "File" && header.method === "Deflate" ? 8 : 0,
      time,
      date,
      seconds: seconds >= 0 && seconds <= 0x7fffffff ? seconds : undefined,
      external: (((directory ? S_IFDIR : S_IFREG) | mode) * 0x10000 + (directory ? DOS_DIRECTORY : 0)) >>> 0,
      offset: this.offset,
      zip64: false,
      crc: 0,
      compressedSize: 0,
      size: 0
    }
  }

  // Writes an entry whose content is known, with its sizes in the local header
  entry(header: Header, content: Uint8Array, data: Uint8Array): void {
    const size = header.type === "Directory" ? 0 : header.size
    if (size !== undefined && size !== content.length) throw sizeMismatch(header.path, content.length, size)
    const record = this.record(header, 0)
    record.crc = crc32(0, content)
    record.size = content.length
    record.compressedSize = data.length
    record.zip64 = record.size >= MAX32 || record.compressedSize >= MAX32
    this.push(localHeader(record))
    if (data.length > 0) this.push(data)
    this.records.push(record)
  }

  // Starts an entry whose sizes and CRC-32 follow its data
  begin(header: Header): void {
    const directory = header.type === "Directory"
    const stored = directory || header.method === "Store"
    const size = directory ? 0 : header.size
    if (stored && size === undefined) {
      throw invalidHeader(`stored file ${JSON.stringify(header.path)} is streamed without a size`)
    }
    // An empty stored entry needs no descriptor: readers would take its zero
    // sizes for missing ones
    const descriptor = !(stored && size === 0)
    const record = this.record(header, descriptor ? FLAG_DESCRIPTOR : 0)
    // Streaming readers find the end of stored data from its size
    if (stored) {
      record.size = size!
      record.compressedSize = size!
    }
    // The local header fixes the width of the sizes after the data, so declare
    // ZIP64 whenever they could reach 4 GiB
    record.zip64 = size === undefined || size >= (stored ? MAX32 : MAX32 - DEFLATE_HEADROOM)
    this.push(localHeader(record))
    record.size = 0
    record.compressedSize = 0
    this.current = { header, record, descriptor }
  }

  // Accounts for uncompressed body bytes
  update(chunks: ReadonlyArray<Uint8Array>): void {
    const { record } = this.current!
    for (const chunk of chunks) {
      record.crc = crc32(record.crc, chunk)
      record.size += chunk.length
    }
  }

  // Writes stored or compressed body bytes
  data(chunks: ReadonlyArray<Uint8Array>): void {
    const { header, record } = this.current!
    for (const chunk of chunks) {
      this.push(chunk)
      record.compressedSize += chunk.length
    }
    const size = header.type === "Directory" ? 0 : header.size
    if (size !== undefined && record.size > size) throw sizeMismatch(header.path, record.size, size)
    if (!record.zip64 && record.compressedSize >= MAX32) {
      throw new ZipError({
        kind: "SizeMismatch",
        message: `compressed data of ${JSON.stringify(header.path)} reached 4 GiB, ` +
          `but its local header has no ZIP64 sizes`
      })
    }
  }

  end(): void {
    const { descriptor, header, record } = this.current!
    this.current = undefined
    if (header.size !== undefined && record.size !== header.size) {
      throw sizeMismatch(header.path, record.size, header.size)
    }
    if (descriptor) this.push(dataDescriptor(record))
    this.records.push(record)
  }

  finish(): void {
    const start = this.offset
    for (const record of this.records) this.push(centralHeader(record))
    const size = this.offset - start
    const count = this.records.length
    if (count >= MAX16 || size >= MAX32 || start >= MAX32) {
      const end64 = new Uint8Array(56)
      const view = new DataView(end64.buffer)
      view.setUint32(0, END64, true)
      setUint64(view, 4, 44)
      view.setUint16(12, (CREATOR_UNIX << 8) | VERSION_ZIP64, true)
      view.setUint16(14, VERSION_ZIP64, true)
      setUint64(view, 24, count)
      setUint64(view, 32, count)
      setUint64(view, 40, size)
      setUint64(view, 48, start)
      const locator = new Uint8Array(20)
      const locatorView = new DataView(locator.buffer)
      locatorView.setUint32(0, LOCATOR64, true)
      setUint64(locatorView, 8, this.offset)
      locatorView.setUint32(16, 1, true)
      this.push(end64)
      this.push(locator)
    }
    const end = new Uint8Array(22)
    const view = new DataView(end.buffer)
    view.setUint32(0, END, true)
    view.setUint16(8, Math.min(count, MAX16), true)
    view.setUint16(10, Math.min(count, MAX16), true)
    view.setUint32(12, Math.min(size, MAX32), true)
    view.setUint32(16, Math.min(start, MAX32), true)
    this.push(end)
  }
}

interface Current {
  readonly header: Header
  readonly inflater: Inflater | undefined
  readonly descriptor: boolean
  readonly zip64: boolean
  // The values of the local header; sizes are unknown when they follow the data
  readonly crc: number
  readonly compressedSize: number | undefined
  readonly size: number | undefined
  // Queue position where the data starts
  readonly start: number
  remaining: number
  dataDone: boolean
  actualCrc: number
  actualSize: number
  actualCompressedSize: number
}

// `next` skips the rest of the current body; `read` consumes it. Both preserve
// progress across `NeedInput` retries.
class Decoder {
  private readonly queue = new ByteQueue()
  private ended = false
  private finished = false
  private closed = false
  // Incremented whenever the current body is invalidated
  generation = 0
  private current: Current | undefined
  private inflateMemory: InflateMemory | undefined
  // The error that ended the archive, repeated by every later call
  private failure: ZipError | undefined

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

  // Returns the next entry header, or `undefined` once the entries and the
  // input have ended. Input after the entries is discarded.
  next(): Header | undefined | typeof NeedInput {
    this.generation++
    return this.guard(() => this.advance())
  }

  private guard<A>(f: () => A): A {
    if (this.failure !== undefined) throw this.failure
    try {
      return f()
    } catch (error) {
      if (isZipError(error)) this.failure = error
      throw error
    }
  }

  private advance(): Header | undefined | typeof NeedInput {
    while (this.current !== undefined) {
      if (this.readCurrent() === NeedInput) return NeedInput
    }
    if (this.finished) return this.finish()
    const queue = this.queue
    if (queue.length < 4) return this.needInput()
    const at = queue.consumed
    const head = queue.peek(Math.min(queue.length, 30))
    const view = new DataView(head.buffer)
    const signature = view.getUint32(0, true)
    if (signature === CENTRAL || signature === END || signature === END64) return this.finish()
    if (signature !== LOCAL) {
      throw invalidHeader(`unexpected signature 0x${signature.toString(16).padStart(8, "0")} at byte ${at}`)
    }
    if (head.length < 30) return this.needInput()
    const length = 30 + view.getUint16(26, true) + view.getUint16(28, true)
    if (queue.length < length) return this.needInput()
    try {
      this.current = this.parseLocal(queue.take(length))
    } catch (error) {
      if (isZipError(error)) {
        throw new ZipError({ kind: error.kind, message: `${error.message} (header at byte ${at})` })
      }
      throw error
    }
    return this.current.header
  }

  // Returns the buffered body bytes of the entry from generation `id`, or
  // `undefined` once the whole body has been read and checked
  read(id: number): Arr.NonEmptyArray<Uint8Array> | undefined | typeof NeedInput {
    if (id !== this.generation) {
      throw new ZipError({
        kind: "BodyConsumed",
        message: this.closed ?
          "zip entry body read after the archive stream ended" :
          "zip entry body read after moving to the next entry"
      })
    }
    return this.guard(() => this.readCurrent())
  }

  private readCurrent(): Arr.NonEmptyArray<Uint8Array> | undefined | typeof NeedInput {
    const current = this.current
    if (current === undefined) return undefined
    const queue = this.queue
    if (!current.dataDone) {
      if (current.inflater === undefined) {
        if (current.remaining > 0) {
          if (queue.length === 0) return this.needInput()
          const chunks: Array<Uint8Array> = []
          while (current.remaining > 0 && queue.length > 0) {
            const chunk = queue.takeSome(current.remaining)
            current.remaining -= chunk.length
            current.actualCrc = crc32(current.actualCrc, chunk)
            current.actualSize += chunk.length
            chunks.push(chunk)
          }
          current.actualCompressedSize = current.actualSize
          return chunks as Arr.NonEmptyArray<Uint8Array>
        }
      } else {
        let chunk: Uint8Array | undefined | typeof NeedInput
        try {
          chunk = current.inflater.pull()
        } catch (error) {
          throw error instanceof InflateError ? invalidData(error.message) : error
        }
        if (chunk === NeedInput) return this.needInput()
        if (chunk !== undefined) {
          current.actualSize += chunk.length
          // Fail before handing out bytes past the reported size, so that
          // consumers can limit what a small compressed entry inflates to
          const { path, size } = current.header
          if (size !== undefined && current.actualSize > size) throw sizeMismatch(path, current.actualSize, size)
          current.actualCrc = crc32(current.actualCrc, chunk)
          return [chunk]
        }
        current.actualCompressedSize = queue.consumed - current.start
      }
      current.dataDone = true
    }
    if (current.descriptor) {
      const descriptor = this.descriptor(current)
      if (descriptor === NeedInput) return NeedInput
      this.check(current, descriptor.crc, descriptor.compressedSize, descriptor.size)
    } else {
      this.check(current, current.crc, current.compressedSize!, current.size!)
    }
    this.current = undefined
    return undefined
  }

  private check(current: Current, crc: number, compressedSize: number, size: number): void {
    if (current.actualCrc === crc && current.actualCompressedSize === compressedSize && current.actualSize === size) {
      return
    }
    const path = JSON.stringify(current.header.path)
    if (current.actualCrc !== crc) {
      throw new ZipError({
        kind: "Checksum",
        message: `CRC-32 of ${path} is ${hex(current.actualCrc)}, but the archive records ${hex(crc)}`
      })
    }
    throw new ZipError({
      kind: "SizeMismatch",
      message: `${path} has ${current.actualSize} bytes (${current.actualCompressedSize} compressed), ` +
        `but the archive records ${size} (${compressedSize} compressed)`
    })
  }

  // Reads a data descriptor, whose signature is optional and whose sizes are
  // 4 bytes unless the local header has a ZIP64 field. Writers that widen the
  // sizes only on overflow are handled by matching each layout against the
  // data read; among several matches, one followed by a header signature wins.
  private descriptor(
    current: Current
  ): { readonly crc: number; readonly compressedSize: number; readonly size: number } | typeof NeedInput {
    const queue = this.queue
    if (queue.length < DESCRIPTOR_PEEK && !this.ended) return NeedInput
    const bytes = queue.peek(Math.min(queue.length, DESCRIPTOR_PEEK))
    const view = new DataView(bytes.buffer)
    const candidates: Array<{ length: number; crc: number; compressedSize: number; size: number }> = []
    const offsets = bytes.length >= 4 && view.getUint32(0, true) === DESCRIPTOR ? [4, 0] : [0]
    for (const offset of offsets) {
      for (const wide of current.zip64 ? [true, false] : [false, true]) {
        const length = offset + (wide ? 20 : 12)
        if (length > bytes.length) continue
        candidates.push({
          length,
          crc: view.getUint32(offset, true),
          compressedSize: wide ? readUint64(view, offset + 4) : view.getUint32(offset + 4, true),
          size: wide ? readUint64(view, offset + 12) : view.getUint32(offset + 8, true)
        })
      }
    }
    const matches = candidates.filter((candidate) =>
      candidate.crc === current.actualCrc && candidate.compressedSize === current.actualCompressedSize &&
      candidate.size === current.actualSize
    )
    const match =
      matches.find((candidate) =>
        candidate.length + 4 <= bytes.length && isHeaderSignature(view.getUint32(candidate.length, true))
      ) ?? matches[0]
    if (match !== undefined) {
      queue.skip(match.length)
      return match
    }
    // A complete archive has at least an end record after the descriptor
    if (candidates.length === 0 || (this.ended && bytes.length < DESCRIPTOR_PEEK)) {
      throw truncated(queue.consumed + queue.length)
    }
    queue.skip(candidates[0].length)
    return candidates[0]
  }

  private parseLocal(bytes: Uint8Array): Current {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length)
    const flags = view.getUint16(6, true)
    const method = view.getUint16(8, true)
    const crc = view.getUint32(14, true)
    let compressedSize = view.getUint32(18, true)
    let size = view.getUint32(22, true)
    const time = view.getUint16(10, true)
    const date = view.getUint16(12, true)
    const nameLength = view.getUint16(26, true)
    const rawName = bytes.subarray(30, 30 + nameLength)
    const utf8 = (flags & FLAG_UTF8) !== 0
    let path = decodeName(rawName, utf8)
    // As in Info-ZIP and 7-Zip, only the first Unicode path field is read, and
    // only without the UTF-8 flag
    let readUnicodePath = !utf8
    let seconds: number | undefined
    let zip64 = false
    let at = 30 + nameLength
    while (at + 4 <= bytes.length) {
      const id = view.getUint16(at, true)
      const start = at + 4
      const end = start + view.getUint16(at + 2, true)
      if (end > bytes.length) throw invalidHeader("extra field overflows the header")
      if (id === EXTRA_ZIP64) {
        zip64 = true
        let field = start
        if (size === MAX32 && field + 8 <= end) {
          size = getUint64(view, field)
          field += 8
        }
        if (compressedSize === MAX32 && field + 8 <= end) {
          compressedSize = getUint64(view, field)
        }
      } else if (id === EXTRA_TIMESTAMP && end - start >= 5 && (bytes[start] & 1) !== 0) {
        // Info-ZIP writes times before 1970 as negative numbers, and others
        // write times after 2038 as unsigned ones; the DOS date tells them apart
        const value = view.getUint32(start + 1, true)
        seconds = value >= 0x80000000 && (date >> 9) + 1980 < 2038 ? value - 0x100000000 : value
      } else if (id === EXTRA_UNICODE_PATH && readUnicodePath) {
        readUnicodePath = false
        if (end - start >= 5 && bytes[start] === 1 && view.getUint32(start + 1, true) === crc32(0, rawName)) {
          path = textDecoder.decode(bytes.subarray(start + 5, end))
        }
      }
      at = end
    }
    const quoted = JSON.stringify(path)
    // Other tools end the name at a NUL character, or reject it
    if (path.includes("\0")) throw invalidHeader(`path ${quoted} contains a NUL character`)
    if ((flags & (FLAG_ENCRYPTED | FLAG_STRONG_ENCRYPTION)) !== 0) throw unsupported(`entry ${quoted} is encrypted`)
    if (method !== 0 && method !== 8) throw unsupported(`entry ${quoted} uses compression method ${method}`)
    const descriptor = (flags & FLAG_DESCRIPTOR) !== 0
    // Writers that put sizes after the data usually leave zeros here
    const known = !descriptor || compressedSize !== 0 || size !== 0
    // Searching for the descriptor of stored data would let its content forge
    // the entries after it
    if (method === 0 && !known) throw unsupported(`stored entry ${quoted} has no size before its data`)
    if (method === 0 && compressedSize !== size) {
      throw invalidHeader(`stored entry ${quoted} has different sizes`)
    }
    const header: Header = {
      path,
      type: path.endsWith("/") ? "Directory" : "File",
      method: method === 8 ? "Deflate" : "Store",
      mtime: new Date(seconds === undefined ? fromDos(time, date) : seconds * 1000),
      ...(known && (method === 0 || !descriptor) ? { size } : undefined)
    }
    return {
      header,
      inflater: method === 8
        ? new Inflater(this.queue, this.inflateMemory ??= new InflateMemory())
        : undefined,
      descriptor,
      zip64,
      crc,
      compressedSize: known ? compressedSize : undefined,
      size: known ? size : undefined,
      start: this.queue.consumed,
      remaining: method === 0 ? compressedSize : 0,
      dataDone: false,
      actualCrc: 0,
      actualSize: 0,
      actualCompressedSize: 0
    }
  }

  private needInput(): typeof NeedInput {
    if (this.ended) throw truncated(this.queue.consumed + this.queue.length)
    return NeedInput
  }

  private finish(): undefined | typeof NeedInput {
    this.finished = true
    this.queue.clear()
    return this.ended ? undefined : NeedInput
  }
}

const hex = (n: number): string => `0x${n.toString(16).padStart(8, "0")}`

// A ZIP64 data descriptor with its signature, and the signature after it
const DESCRIPTOR_PEEK = 28

const isHeaderSignature = (signature: number): boolean =>
  signature === LOCAL || signature === CENTRAL || signature === END || signature === END64
