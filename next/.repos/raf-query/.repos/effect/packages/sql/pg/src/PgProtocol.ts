/**
 * Wire codec for the PostgreSQL frontend/backend protocol, version 3.0.
 *
 * The module encodes frontend messages and decodes backend messages. Every
 * function is pure: bytes in, bytes or plain data out. Nothing here opens a
 * socket, negotiates TLS, or tracks session state, and nothing here decodes
 * column values - `DataRow` fields stay raw bytes for `PgTypes` to interpret.
 *
 * Typed messages are a type byte, an `int32` length that counts itself but not
 * the type byte, and a payload. Integers are big-endian and strings are
 * NUL-terminated UTF-8 unless they are explicitly length-prefixed.
 *
 * Encoded frames and decoded byte fields are views into pooled buffers that
 * are written once and never rewritten. They stay valid for as long as they
 * are held, but holding one keeps its whole pool buffer alive, so copy
 * anything that has to outlive the message it came from.
 *
 * @since 4.0.0
 */
import * as Data from "effect/Data"
import * as Result from "effect/Result"

/**
 * Default `maxMessageSize` for `makeParser`: 16 MiB.
 *
 * @category constants
 * @since 4.0.0
 */
export const defaultMaxMessageSize = 16 * 1024 * 1024

/** Where a parser stops growing its buffer pool. */
const maxBufferSize = 64 * 1024

/**
 * An incremental decoder for the post-startup backend message stream.
 *
 * @category models
 * @since 4.0.0
 */
export interface Parser<A = Uint8Array | null> {
  /**
   * Reads each `DataRow` field, for a parser built with one. A result's
   * columns are only known from its `RowDescription`, which arrives on the
   * same stream, so this is settable: replace it when the columns change.
   */
  readField: FieldReader<A> | undefined

  /**
   * Decodes a chunk and returns every complete message. A partial message is
   * retained for the next call. Parse and field-reader errors are terminal and
   * discard messages decoded earlier in the same call.
   *
   * **Details**
   *
   * `DataRow`, `CopyData`, and `Unknown` payloads are views into an internal
   * buffer. Copy a payload that must outlive the current row, otherwise its
   * entire buffer remains in memory.
   */
  readonly push: (chunk: Uint8Array) => ReadonlyArray<BackendMessage<A>>

  /**
   * Decodes a chunk and passes each complete message to `onMessage`
   * immediately. This lets a `RowDescription` update `readField` before a
   * `DataRow` later in the same chunk is decoded. The failure and
   * buffer-lifetime rules match `push`, except messages
   * delivered before a failure are not discarded.
   */
  readonly pushEach: (chunk: Uint8Array, onMessage: (message: BackendMessage<A>) => void) => void
}

/**
 * Creates a `Parser`.
 *
 * **Details**
 *
 * Special pre-startup replies have no type byte. Use `decodeSslResponse` for
 * those replies.
 *
 * @category constructors
 * @since 4.0.0
 */
export const makeParser = <A = Uint8Array | null>(options?: {
  readonly maxMessageSize?: number | undefined
  /**
   * Reads each `DataRow` field as it is parsed, so a client that decodes its
   * columns never needs a view per column. Without one every field is handed
   * out as a view, which is the default.
   */
  readonly readField?: FieldReader<A> | undefined
}): Parser<A> => {
  const maxMessageSize = options?.maxMessageSize ?? defaultMaxMessageSize
  const reader = new Reader()
  let bufferSize = 8192
  let buffer = new Uint8Array(bufferSize)
  let store = buffer.buffer
  let start = 0
  let end = 0
  let failed = false

  // Bytes already handed to the caller are never overwritten, so a full buffer
  // is replaced rather than compacted in place. That lets `DataRow` fields be
  // views instead of copies, which is the difference between one allocation per
  // buffer and one per column.
  //
  // Every refill therefore allocates, so the pool doubles up to
  // `maxBufferSize`: a busy connection spreads the allocation over more
  // messages while a low-volume one stays small. A single oversized message
  // grows its buffer beyond the pool without raising the pool itself.
  const append = (chunk: Uint8Array): void => {
    if (end + chunk.length > buffer.length) {
      const pending = end - start
      if (bufferSize < maxBufferSize) bufferSize *= 2
      let capacity = bufferSize
      while (capacity < pending + chunk.length) capacity *= 2
      const next = new Uint8Array(capacity)
      next.set(buffer.subarray(start, end))
      buffer = next
      store = next.buffer
      start = 0
      end = pending
    }
    buffer.set(chunk, end)
    end += chunk.length
  }

  const parser: Parser<A> = {
    readField: options?.readField,
    push(chunk) {
      const messages: Array<BackendMessage<A>> = []
      parser.pushEach(chunk, (message) => {
        messages.push(message)
      })
      return messages
    },
    pushEach(chunk, onMessage) {
      if (failed) {
        throw new ParseError({ message: "Parser cannot be reused after a failure" })
      }
      try {
        append(chunk)
        while (end - start >= 5) {
          const length = (buffer[start + 1] << 24) | (buffer[start + 2] << 16) | (buffer[start + 3] << 8) |
            buffer[start + 4]
          if (length < 4) {
            throw new ParseError({ message: `Invalid message length: ${length}` })
          }
          if (length > maxMessageSize) {
            throw new ParseError({
              message: `Message length ${length} exceeds maxMessageSize ${maxMessageSize}`
            })
          }
          if (end - start < length + 1) break
          const type = buffer[start]
          const body = start + 5
          const limit = start + 1 + length
          start = limit
          if (type === BackendType.DataRow) {
            // `buffer` always starts at byte 0 of `store`, so offsets index both.
            onMessage(decodeDataRow<A>(buffer, store, 0, body, limit, parser.readField))
          } else {
            reader.reset(buffer, body, limit)
            const message = decodeBackend(type, reader)
            if (reader.offset !== limit) {
              throw new ParseError({ message: `Message has ${limit - reader.offset} trailing byte(s)` })
            }
            onMessage(message as BackendMessage<A>)
          }
        }
      } catch (error) {
        failed = true
        throw error
      }
    }
  }
  return parser
}

// -----------------------------------------------------------------------------
// frontend messages
// -----------------------------------------------------------------------------

/**
 * Prepares a named or unnamed statement.
 *
 * @category models
 * @since 4.0.0
 */
export interface Parse {
  readonly _tag: "Parse"
  readonly name: string
  readonly query: string
  readonly parameterTypes: ReadonlyArray<number>
}

/**
 * Binds parameter values to a prepared statement and creates a portal.
 * Parameters and results use the binary format.
 *
 * @category models
 * @since 4.0.0
 */
export interface Bind {
  readonly _tag: "Bind"
  readonly portal: string
  readonly statement: string
  readonly parameters: ReadonlyArray<Uint8Array | null>
}

/**
 * Runs a portal, optionally limiting the number of rows returned.
 *
 * @category models
 * @since 4.0.0
 */
export interface Execute {
  readonly _tag: "Execute"
  readonly portal: string
  readonly maxRows: number
}

/**
 * Which kind of object a `Describe` or `Close` message names.
 *
 * @category models
 * @since 4.0.0
 */
export type DescribeTarget = "statement" | "portal"

/**
 * Asks for the parameter and row shape of a statement or portal.
 *
 * @category models
 * @since 4.0.0
 */
export interface Describe {
  readonly _tag: "Describe"
  readonly target: DescribeTarget
  readonly name: string
}

/**
 * Drops a prepared statement or portal.
 *
 * @category models
 * @since 4.0.0
 */
export interface Close {
  readonly _tag: "Close"
  readonly target: DescribeTarget
  readonly name: string
}

/**
 * Closes the current transaction block and requests a `ReadyForQuery`.
 *
 * @category models
 * @since 4.0.0
 */
export interface Sync {
  readonly _tag: "Sync"
}

/**
 * Asks the backend to deliver buffered output without ending the transaction.
 *
 * @category models
 * @since 4.0.0
 */
export interface Flush {
  readonly _tag: "Flush"
}

/**
 * Ends the session.
 *
 * @category models
 * @since 4.0.0
 */
export interface Terminate {
  readonly _tag: "Terminate"
}

/**
 * Answers a cleartext or MD5 password request.
 *
 * @category models
 * @since 4.0.0
 */
export interface PasswordMessage {
  readonly _tag: "PasswordMessage"
  readonly password: string
}

/**
 * Selects a SASL mechanism and carries its opaque initial response.
 *
 * @category models
 * @since 4.0.0
 */
export interface SASLInitialResponse {
  readonly _tag: "SASLInitialResponse"
  readonly mechanism: string
  readonly initialResponse: Uint8Array | null
}

/**
 * Carries an opaque SASL continuation payload.
 *
 * @category models
 * @since 4.0.0
 */
export interface SASLResponse {
  readonly _tag: "SASLResponse"
  readonly data: Uint8Array
}

/**
 * Any message the client sends after startup.
 *
 * @category models
 * @since 4.0.0
 */
export type FrontendMessage =
  | Parse
  | Bind
  | Execute
  | Describe
  | Close
  | Sync
  | Flush
  | Terminate
  | PasswordMessage
  | SASLInitialResponse
  | SASLResponse

/**
 * Error produced when bytes cannot be interpreted as a protocol message.
 *
 * @category errors
 * @since 4.0.0
 */
export class ParseError extends Data.TaggedError("PgProtocolParseError")<{
  readonly message: string
}> {}

/**
 * Error returned when a frontend message cannot be encoded.
 *
 * @category errors
 * @since 4.0.0
 */
export class EncodeError extends Data.TaggedError("PgProtocolEncodeError")<{
  readonly message: string
}> {}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder("utf-8", { fatal: true })

/**
 * Above this length `TextEncoder.encodeInto` beats a per-character loop, below
 * it the call overhead dominates. Measured on V8: the loop runs at about a
 * nanosecond per character and `encodeInto` costs about 50 ns whatever the
 * length, so the crossover is around 50 characters.
 */
const asciiEncodeLimit = 48

/**
 * A view over part of a cached backing store. Slicing runs once per column of
 * every row, and both obvious spellings are slower than this one: `subarray`
 * consults the constructor's `Symbol.species` before it can allocate, and
 * reading `.buffer` off a typed array is an accessor call rather than a field
 * load. Callers hold the store and the array's byte offset instead.
 */
const view = (store: ArrayBufferLike, offset: number, length: number): Uint8Array =>
  new Uint8Array(store, offset, length)

/** Up to this many bytes a copy loop beats `Uint8Array.prototype.set`. */
const smallCopyLimit = 8

/**
 * Writes messages back to back into a pooled buffer and hands out a view of
 * each one, so encoding a message costs no allocation of its own. Bytes below
 * `start` have already been handed out and are never rewritten; when the pool
 * runs out it is replaced rather than reused.
 */
class Writer {
  readonly poolSize: number
  bytes: Uint8Array
  view: DataView
  /** Where the message currently being written begins. */
  start = 0
  offset = 0
  /** Set by `sqlNull`, read and cleared by the `makeBindEncoder` loop. */
  isNull = false

  constructor(poolSize: number) {
    this.poolSize = poolSize
    this.bytes = new Uint8Array(poolSize)
    this.view = new DataView(this.bytes.buffer)
  }

  reserve(size: number): void {
    if (this.offset + size <= this.bytes.length) return
    const pending = this.offset - this.start
    let capacity = this.poolSize
    while (capacity < pending + size) capacity *= 2
    const next = new Uint8Array(capacity)
    next.set(this.bytes.subarray(this.start, this.offset))
    this.bytes = next
    this.view = new DataView(next.buffer)
    this.start = 0
    this.offset = pending
  }

  /** Starts a message, dropping anything a failed write left behind. */
  begin(): void {
    this.start = this.offset
  }

  uint8(value: number): void {
    this.reserve(1)
    this.bytes[this.offset++] = value
  }

  int16(value: number): void {
    this.reserve(2)
    const bytes = this.bytes
    const offset = this.offset
    bytes[offset] = value >>> 8
    bytes[offset + 1] = value
    this.offset = offset + 2
  }

  int32(value: number): void {
    this.reserve(4)
    this.setInt32(this.offset, value)
    this.offset += 4
  }

  setInt32(offset: number, value: number): void {
    const bytes = this.bytes
    bytes[offset] = value >>> 24
    bytes[offset + 1] = value >>> 16
    bytes[offset + 2] = value >>> 8
    bytes[offset + 3] = value
  }

  float32(value: number): void {
    this.reserve(4)
    this.view.setFloat32(this.offset, value)
    this.offset += 4
  }

  float64(value: number): void {
    this.reserve(8)
    this.view.setFloat64(this.offset, value)
    this.offset += 8
  }

  bigInt64(value: bigint): void {
    this.reserve(8)
    this.view.setBigInt64(this.offset, value)
    this.offset += 8
  }

  raw(value: Uint8Array): void {
    const length = value.length
    this.reserve(length)
    const bytes = this.bytes
    const offset = this.offset
    if (length <= smallCopyLimit) {
      for (let index = 0; index < length; index++) bytes[offset + index] = value[index]
    } else {
      bytes.set(value, offset)
    }
    this.offset = offset + length
  }

  sqlNull(): void {
    this.isNull = true
  }

  beginLength(): number {
    // Relative to `start`, because a later write may move the message to a new
    // pool buffer, which rebases `start` and `offset` but not the distance
    // between them.
    const token = this.offset - this.start
    this.int32(0)
    return token
  }

  endLength(token: number): void {
    this.setInt32(this.start + token, this.offset - this.start - token - 4)
  }

  utf8(value: string, nul = false): void {
    const length = value.length
    if (length <= asciiEncodeLimit) {
      this.reserve(length + (nul ? 1 : 0))
      const bytes = this.bytes
      const start = this.offset
      let i = 0
      for (; i < length; i++) {
        const code = value.charCodeAt(i)
        if (code > 0x7f) break
        bytes[start + i] = code
      }
      if (i === length) {
        const offset = start + length
        if (nul) bytes[offset] = 0
        this.offset = offset + (nul ? 1 : 0)
        return
      }
    }
    // UTF-8 takes at most three bytes per UTF-16 code unit, and four for the
    // two units of a surrogate pair, so this covers any string.
    this.reserve(length * 3 + (nul ? 1 : 0))
    this.offset += textEncoder.encodeInto(value, this.bytes.subarray(this.offset)).written
    if (nul) this.bytes[this.offset++] = 0
  }

  cString(value: string): void {
    this.utf8(value, true)
  }

  finish(): Uint8Array {
    const value = view(this.bytes.buffer, this.bytes.byteOffset + this.start, this.offset - this.start)
    if (this.bytes.length > this.poolSize) {
      // An oversized message grew the pool; do not keep the rest of it around.
      this.bytes = new Uint8Array(this.poolSize)
      this.view = new DataView(this.bytes.buffer)
      this.start = 0
      this.offset = 0
    } else {
      this.start = this.offset
    }
    return value
  }
}

const emptyBytes = new Uint8Array(0)

/**
 * A cursor over a message payload. The parser reuses one instance pointed at a
 * window of its own buffer, so decoding a message allocates nothing beyond the
 * message itself.
 */
class Reader {
  bytes: Uint8Array = emptyBytes
  /** The backing store of `bytes` and its offset into it, resolved per message. */
  store: ArrayBufferLike = emptyBytes.buffer
  base = 0
  offset = 0
  limit = 0

  reset(bytes: Uint8Array, offset: number, limit: number): void {
    this.bytes = bytes
    this.store = bytes.buffer
    this.base = bytes.byteOffset
    this.offset = offset
    this.limit = limit
  }

  require(size: number): void {
    if (size < 0) {
      throw new ParseError({ message: `Invalid read of ${size} byte(s)` })
    }
    if (this.offset + size > this.limit) {
      throw new ParseError({ message: `Truncated message: expected ${size} more byte(s)` })
    }
  }

  uint8(): number {
    this.require(1)
    return this.bytes[this.offset++]
  }

  int16(): number {
    this.require(2)
    const bytes = this.bytes
    const offset = this.offset
    this.offset = offset + 2
    return ((bytes[offset] << 8) | bytes[offset + 1]) << 16 >> 16
  }

  int32(): number {
    this.require(4)
    const bytes = this.bytes
    const offset = this.offset
    this.offset = offset + 4
    return (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]
  }

  uint32(): number {
    return this.int32() >>> 0
  }

  raw(size: number): Uint8Array {
    this.require(size)
    const value = view(this.store, this.base + this.offset, size)
    this.offset += size
    return value
  }

  rest(): Uint8Array {
    return this.raw(this.limit - this.offset)
  }

  cString(): string {
    const end = this.bytes.indexOf(0, this.offset)
    if (end === -1 || end >= this.limit) {
      throw new ParseError({ message: "Unterminated string" })
    }
    const value = decodeUtf8(this.bytes, this.offset, end - this.offset)
    this.offset = end + 1
    return value
  }
}

/** Below this length a per-character loop beats `TextDecoder.decode`. */
const asciiDecodeLimit = 10

/**
 * Node's own UTF-8 decoder; see the note on its `PgTypes` counterpart. A
 * result containing a replacement character goes to the strict decoder, so
 * invalid bytes still fail exactly as they did.
 */
const utf8Slice: ((this: Uint8Array, start: number, end: number) => string) | undefined = (globalThis as any).Buffer
  ?.prototype?.utf8Slice

const decodeUtf8 = (bytes: Uint8Array, offset: number, size: number): string => {
  if (size <= asciiDecodeLimit) {
    let text = ""
    let index = 0
    for (; index < size; index++) {
      const code = bytes[offset + index]
      if (code > 0x7f) break
      text += String.fromCharCode(code)
    }
    if (index === size) return text
  }
  if (utf8Slice !== undefined) {
    const text = utf8Slice.call(bytes, offset, offset + size)
    if (text.indexOf("\ufffd") === -1) return text
  }
  try {
    return textDecoder.decode(view(bytes.buffer, bytes.byteOffset + offset, size))
  } catch {
    throw new ParseError({ message: "Invalid UTF-8 in message" })
  }
}

const sharedWriter = new Writer(8192)

/**
 * Opens a typed message and leaves room for its length. Paired with `end`,
 * which backfills it. A pair rather than a `write` callback, because a
 * callback allocates a closure over the caller's options on every message.
 */
const begin = (type: number): Writer => {
  const writer = sharedWriter
  writer.begin()
  writer.reserve(5)
  const bytes = writer.bytes
  const offset = writer.offset
  bytes[offset] = type
  writer.offset = offset + 5
  return writer
}

const end = (): Uint8Array => {
  // Relative to `start`, because writing may have moved the message to a new
  // pool buffer. The length counts itself but not the type byte.
  sharedWriter.setInt32(sharedWriter.start + 1, sharedWriter.offset - sharedWriter.start - 1)
  return sharedWriter.finish()
}

const empty = (type: number): Uint8Array => {
  const writer = begin(type)
  writer.setInt32(writer.start + 1, 4)
  return writer.finish()
}

const targetByte = (target: DescribeTarget): number => target === "statement" ? 0x53 : 0x50

const requireInt16Count = (count: number, name: string): number => {
  if (count > 0x7fff) throw new EncodeError({ message: `${name} count exceeds 32767: ${count}` })
  return count
}

const encodeResult = <A>(evaluate: () => A): Result.Result<A, EncodeError> => {
  try {
    return Result.succeed(evaluate())
  } catch (error) {
    if (error instanceof EncodeError) return Result.fail(error)
    throw error
  }
}

/**
 * Encodes a `Parse` message, returning `EncodeError` when its parameter count
 * is outside the signed int16 wire range.
 *
 * @category encoding
 * @since 4.0.0
 */
const encodeParseUnsafe = (options: Omit<Parse, "_tag">): Uint8Array => {
  const writer = begin(0x50)
  writer.cString(options.name)
  writer.cString(options.query)
  const parameterTypes = options.parameterTypes
  const count = requireInt16Count(parameterTypes.length, "Parse parameter type")
  writer.reserve(2 + count * 4)
  const bytes = writer.bytes
  let offset = writer.offset
  bytes[offset] = count >>> 8
  bytes[offset + 1] = count
  offset += 2
  for (let index = 0; index < count; index++) {
    const oid = parameterTypes[index]
    bytes[offset] = oid >>> 24
    bytes[offset + 1] = oid >>> 16
    bytes[offset + 2] = oid >>> 8
    bytes[offset + 3] = oid
    offset += 4
  }
  writer.offset = offset
  return end()
}

/**
 * Encodes a `Parse` message.
 *
 * @category encoding
 * @since 4.0.0
 */
export const encodeParse = (options: Omit<Parse, "_tag">): Result.Result<Uint8Array, EncodeError> =>
  encodeResult(() => encodeParseUnsafe(options))

/**
 * Encodes a `Bind` message using the binary format code for parameters and
 * results, returning `EncodeError` when its parameter count is outside the
 * signed int16 wire range.
 *
 * @category encoding
 * @since 4.0.0
 */
const encodeBindUnsafe = (options: Omit<Bind, "_tag">): Uint8Array => {
  const writer = begin(0x42)
  writer.cString(options.portal)
  writer.cString(options.statement)
  const parameters = options.parameters
  const count = requireInt16Count(parameters.length, "Bind parameter")
  // Sizing the rest of the frame up front turns every remaining write into a
  // plain store: one bounds check for the message instead of one per field.
  let size = 10 + count * 4
  for (let index = 0; index < count; index++) {
    const parameter = parameters[index]
    if (parameter !== null) size += parameter.length
  }
  writer.reserve(size)
  const bytes = writer.bytes
  let offset = writer.offset
  // One parameter format code, binary, for every parameter.
  bytes[offset] = 0
  bytes[offset + 1] = 1
  bytes[offset + 2] = 0
  bytes[offset + 3] = 1
  bytes[offset + 4] = count >>> 8
  bytes[offset + 5] = count
  offset += 6
  for (let index = 0; index < count; index++) {
    const parameter = parameters[index]
    if (parameter === null) {
      bytes[offset] = 0xff
      bytes[offset + 1] = 0xff
      bytes[offset + 2] = 0xff
      bytes[offset + 3] = 0xff
      offset += 4
    } else {
      const length = parameter.length
      bytes[offset] = length >>> 24
      bytes[offset + 1] = length >>> 16
      bytes[offset + 2] = length >>> 8
      bytes[offset + 3] = length
      offset += 4
      if (length <= smallCopyLimit) {
        for (let byte = 0; byte < length; byte++) bytes[offset + byte] = parameter[byte]
      } else {
        bytes.set(parameter, offset)
      }
      offset += length
    }
  }
  // One result format code, binary, for every column.
  bytes[offset] = 0
  bytes[offset + 1] = 1
  bytes[offset + 2] = 0
  bytes[offset + 3] = 1
  writer.offset = offset + 4
  return end()
}

/**
 * Encodes a `Bind` message.
 *
 * @category encoding
 * @since 4.0.0
 */
export const encodeBind = (options: Omit<Bind, "_tag">): Result.Result<Uint8Array, EncodeError> =>
  encodeResult(() => encodeBindUnsafe(options))

/**
 * A sink for writing parameter bytes into a `Bind` frame. The frame reserves
 * and backfills each parameter length. `PgTypes.writeParameter` supports
 * OID-typed values.
 *
 * @category models
 * @since 4.0.0
 */
export interface ValueSink {
  readonly uint8: (value: number) => void
  readonly int16: (value: number) => void
  readonly int32: (value: number) => void
  readonly float32: (value: number) => void
  readonly float64: (value: number) => void
  readonly bigInt64: (value: bigint) => void
  readonly raw: (value: Uint8Array) => void
  readonly utf8: (value: string) => void
  /** Writes SQL NULL. The value must write nothing else. */
  readonly sqlNull: () => void
  /**
   * Leaves room for an int32 length and returns a token for `endLength`, so a
   * value that contains other values can frame them without knowing their
   * sizes up front. Tokens nest, and must be closed in the order they were
   * opened.
   */
  readonly beginLength: () => number
  /** Backfills the length of everything written since its `beginLength`. */
  readonly endLength: (token: number) => void
}

const valueWriterUnsafe = Symbol.for("@effect/sql-pg/PgProtocol/ValueWriter/unsafe")

/**
 * Creates a `Bind` encoder that writes parameters directly into the frame.
 *
 * **Details**
 *
 * `textFormat` identifies parameters encoded as text. All other parameters
 * use the binary format.
 *
 * **Example** (Encoding a `Bind` message)
 *
 * ```ts
 * import { PgProtocol, PgTypes } from "@effect/sql-pg"
 *
 * const encodeBind = PgProtocol.makeBindEncoder(PgTypes.writeParameter, PgTypes.isTextFormat)
 * const frame = encodeBind({ portal: "", statement: "s1", parameters: [PgTypes.int4(1)] })
 * ```
 *
 * @category encoding
 * @since 4.0.0
 */
export const makeBindEncoder = <A, E = never>(
  writeParameter: (sink: ValueSink, value: A) => Result.Result<void, E>,
  textFormat?: (value: A) => boolean
) =>
(options: {
  readonly portal: string
  readonly statement: string
  readonly parameters: ReadonlyArray<A>
}): Result.Result<Uint8Array, EncodeError | E> => {
  try {
    const writer = begin(0x42)
    writer.cString(options.portal)
    writer.cString(options.statement)
    const parameters = options.parameters
    const count = requireInt16Count(parameters.length, "Bind parameter")
    let textCount = 0
    if (textFormat !== undefined) {
      for (let index = 0; index < count; index++) {
        if (textFormat(parameters[index])) textCount++
      }
    }
    if (textCount === 0 || textCount === count) {
      // One format code covering every parameter: binary, or all-text.
      const code = textCount === 0 ? 1 : 0
      writer.reserve(6)
      const header = writer.bytes
      const headerOffset = writer.offset
      header[headerOffset] = 0
      header[headerOffset + 1] = 1
      header[headerOffset + 2] = 0
      header[headerOffset + 3] = code
      header[headerOffset + 4] = count >>> 8
      header[headerOffset + 5] = count
      writer.offset = headerOffset + 6
    } else {
      writer.int16(count)
      for (let index = 0; index < count; index++) {
        writer.int16(textFormat!(parameters[index]) ? 0 : 1)
      }
      writer.int16(count)
    }
    const writeUnsafe = (writeParameter as any)[valueWriterUnsafe] as
      | ((sink: ValueSink, value: A) => void)
      | undefined
    for (let index = 0; index < count; index++) {
      const token = writer.beginLength()
      writer.isNull = false
      if (writeUnsafe === undefined) {
        const written = writeParameter(writer, parameters[index])
        if (Result.isFailure(written)) return Result.fail(written.failure)
      } else {
        writeUnsafe(writer, parameters[index])
      }
      if (writer.isNull) {
        writer.isNull = false
        writer.offset = writer.start + token
        writer.int32(-1)
      } else {
        writer.endLength(token)
      }
    }
    writer.reserve(4)
    const trailer = writer.bytes
    const trailerOffset = writer.offset
    trailer[trailerOffset] = 0
    trailer[trailerOffset + 1] = 1
    trailer[trailerOffset + 2] = 0
    trailer[trailerOffset + 3] = 1
    writer.offset = trailerOffset + 4
    return Result.succeed(end())
  } catch (error) {
    if (error instanceof EncodeError) return Result.fail(error)
    throw error
  }
}

/**
 * Encodes an `Execute` message.
 *
 * @category encoding
 * @since 4.0.0
 */
export const encodeExecute = (options: Omit<Execute, "_tag">): Uint8Array => {
  const writer = begin(0x45)
  writer.cString(options.portal)
  writer.int32(options.maxRows)
  return end()
}

/**
 * Encodes a `Describe` message.
 *
 * @category encoding
 * @since 4.0.0
 */
export const encodeDescribe = (options: Omit<Describe, "_tag">): Uint8Array => {
  const writer = begin(0x44)
  writer.uint8(targetByte(options.target))
  writer.cString(options.name)
  return end()
}

/**
 * Encodes a `Close` message.
 *
 * @category encoding
 * @since 4.0.0
 */
export const encodeClose = (options: Omit<Close, "_tag">): Uint8Array => {
  const writer = begin(0x43)
  writer.uint8(targetByte(options.target))
  writer.cString(options.name)
  return end()
}

/**
 * Encodes a `Sync` message.
 *
 * @category encoding
 * @since 4.0.0
 */
export const encodeSync = (): Uint8Array => empty(0x53)

/**
 * Encodes a `Flush` message.
 *
 * @category encoding
 * @since 4.0.0
 */
export const encodeFlush = (): Uint8Array => empty(0x48)

/**
 * Encodes a `Terminate` message.
 *
 * @category encoding
 * @since 4.0.0
 */
export const encodeTerminate = (): Uint8Array => empty(0x58)

/**
 * Encodes a `PasswordMessage`. The password is sent verbatim, so MD5 hashing
 * belongs to the caller - see `PgAuth.md5Password`.
 *
 * @category encoding
 * @since 4.0.0
 */
export const encodePasswordMessage = (options: Omit<PasswordMessage, "_tag">): Uint8Array => {
  const writer = begin(0x70)
  writer.cString(options.password)
  return end()
}

/**
 * Encodes a `SASLInitialResponse` message.
 *
 * @category encoding
 * @since 4.0.0
 */
export const encodeSASLInitialResponse = (options: Omit<SASLInitialResponse, "_tag">): Uint8Array => {
  const writer = begin(0x70)
  writer.cString(options.mechanism)
  if (options.initialResponse === null) {
    writer.int32(-1)
  } else {
    writer.int32(options.initialResponse.length)
    writer.raw(options.initialResponse)
  }
  return end()
}

/**
 * Encodes a `SASLResponse` message.
 *
 * @category encoding
 * @since 4.0.0
 */
export const encodeSASLResponse = (options: Omit<SASLResponse, "_tag">): Uint8Array => {
  const writer = begin(0x70)
  writer.raw(options.data)
  return end()
}

/**
 * Encodes any frontend message.
 *
 * @category encoding
 * @since 4.0.0
 */
export const encode = (message: FrontendMessage): Result.Result<Uint8Array, EncodeError> => {
  switch (message._tag) {
    case "Parse":
      return encodeParse(message)
    case "Bind":
      return encodeBind(message)
    case "Execute":
      return Result.succeed(encodeExecute(message))
    case "Describe":
      return Result.succeed(encodeDescribe(message))
    case "Close":
      return Result.succeed(encodeClose(message))
    case "Sync":
      return Result.succeed(encodeSync())
    case "Flush":
      return Result.succeed(encodeFlush())
    case "Terminate":
      return Result.succeed(encodeTerminate())
    case "PasswordMessage":
      return Result.succeed(encodePasswordMessage(message))
    case "SASLInitialResponse":
      return Result.succeed(encodeSASLInitialResponse(message))
    case "SASLResponse":
      return Result.succeed(encodeSASLResponse(message))
  }
}

// -----------------------------------------------------------------------------
// special messages
// -----------------------------------------------------------------------------

const PROTOCOL_VERSION_3_0 = 196608
const SSL_REQUEST_CODE = 80877103
const CANCEL_REQUEST_CODE = 80877102

/**
 * Startup parameters. `user` is required; any other run-time parameter the
 * server accepts may be passed alongside it.
 *
 * @category models
 * @since 4.0.0
 */
export interface StartupParameters {
  readonly [key: string]: string | undefined
  readonly user: string
  readonly database?: string | undefined
  readonly application_name?: string | undefined
}

/**
 * Encodes an `SSLRequest`. It has no type byte and is only valid before
 * startup.
 *
 * @category encoding
 * @since 4.0.0
 */
export const encodeSslRequest = (): Uint8Array => {
  sharedWriter.begin()
  sharedWriter.int32(8)
  sharedWriter.int32(SSL_REQUEST_CODE)
  return sharedWriter.finish()
}

/**
 * Decodes the single byte the server sends in reply to an `SSLRequest`. `"S"`
 * means the server will speak TLS, `"N"` means it will not.
 *
 * @category decoding
 * @since 4.0.0
 */
export const decodeSslResponse = (byte: number): Result.Result<"S" | "N", ParseError> =>
  byte === 0x53
    ? Result.succeed("S")
    : byte === 0x4e
    ? Result.succeed("N")
    : Result.fail(new ParseError({ message: `Invalid SSLRequest response byte: ${byte}` }))

/**
 * Encodes a `StartupMessage` for protocol 3.0. It has no type byte.
 * `client_encoding` defaults to `UTF8` because this codec always writes UTF-8.
 *
 * @category encoding
 * @since 4.0.0
 */
export const encodeStartupMessage = (parameters: StartupParameters): Uint8Array => {
  const writer = sharedWriter
  writer.begin()
  writer.int32(0)
  writer.int32(PROTOCOL_VERSION_3_0)
  for (const [key, value] of Object.entries(parameters)) {
    if (value === undefined) continue
    writer.cString(key)
    writer.cString(value)
  }
  if (parameters.client_encoding === undefined) {
    writer.cString("client_encoding")
    writer.cString("UTF8")
  }
  writer.uint8(0)
  writer.setInt32(writer.start, writer.offset - writer.start)
  return writer.finish()
}

/**
 * Encodes a `CancelRequest`. It has no type byte and is sent on a separate
 * connection, using the `pid` and `secret` from `BackendKeyData`.
 *
 * @category encoding
 * @since 4.0.0
 */
export const encodeCancelRequest = (options: {
  readonly pid: number
  readonly secret: number
}): Uint8Array => {
  const writer = sharedWriter
  writer.begin()
  writer.int32(16)
  writer.int32(CANCEL_REQUEST_CODE)
  writer.int32(options.pid)
  writer.int32(options.secret)
  return writer.finish()
}

// -----------------------------------------------------------------------------
// backend messages
// -----------------------------------------------------------------------------

/**
 * Authentication succeeded.
 *
 * @category models
 * @since 4.0.0
 */
export interface AuthenticationOk {
  readonly _tag: "AuthenticationOk"
}

/**
 * The server wants the password in the clear.
 *
 * @category models
 * @since 4.0.0
 */
export interface AuthenticationCleartextPassword {
  readonly _tag: "AuthenticationCleartextPassword"
}

/**
 * The server wants an MD5-hashed password, salted with these four bytes.
 *
 * @category models
 * @since 4.0.0
 */
export interface AuthenticationMD5Password {
  readonly _tag: "AuthenticationMD5Password"
  readonly salt: Uint8Array
}

/**
 * The server offers these SASL mechanisms.
 *
 * @category models
 * @since 4.0.0
 */
export interface AuthenticationSASL {
  readonly _tag: "AuthenticationSASL"
  readonly mechanisms: ReadonlyArray<string>
}

/**
 * An opaque SASL challenge.
 *
 * @category models
 * @since 4.0.0
 */
export interface AuthenticationSASLContinue {
  readonly _tag: "AuthenticationSASLContinue"
  readonly data: Uint8Array
}

/**
 * The opaque final SASL payload, carrying the server signature.
 *
 * @category models
 * @since 4.0.0
 */
export interface AuthenticationSASLFinal {
  readonly _tag: "AuthenticationSASLFinal"
  readonly data: Uint8Array
}

/**
 * An authentication request this codec does not model, such as GSSAPI or
 * SSPI. The `method` is the raw sub-type integer.
 *
 * @category models
 * @since 4.0.0
 */
export interface AuthenticationUnsupported {
  readonly _tag: "AuthenticationUnsupported"
  readonly method: number
  readonly payload: Uint8Array
}

/**
 * Reports a run-time parameter value, at startup or whenever it changes.
 *
 * @category models
 * @since 4.0.0
 */
export interface ParameterStatus {
  readonly _tag: "ParameterStatus"
  readonly name: string
  readonly value: string
}

/**
 * The identity a `CancelRequest` needs.
 *
 * @category models
 * @since 4.0.0
 */
export interface BackendKeyData {
  readonly _tag: "BackendKeyData"
  readonly pid: number
  readonly secret: number
}

/**
 * Transaction status: idle, in a transaction block, or in a failed
 * transaction block.
 *
 * @category models
 * @since 4.0.0
 */
export type TransactionStatus = "I" | "T" | "E"

/**
 * The backend is ready for a new query cycle.
 *
 * @category models
 * @since 4.0.0
 */
export interface ReadyForQuery {
  readonly _tag: "ReadyForQuery"
  readonly status: TransactionStatus
}

/**
 * One column of a `RowDescription`.
 *
 * @category models
 * @since 4.0.0
 */
export interface FieldDescription {
  readonly name: string
  readonly tableOid: number
  readonly columnAttributeNumber: number
  readonly dataTypeOid: number
  readonly dataTypeSize: number
  readonly typeModifier: number
  readonly format: number
}

/**
 * Describes the columns a portal will return.
 *
 * @category models
 * @since 4.0.0
 */
export interface RowDescription {
  readonly _tag: "RowDescription"
  readonly fields: ReadonlyArray<FieldDescription>
}

/**
 * One result row. Values stay raw bytes; `null` is SQL NULL. Decoding them
 * requires the OIDs from the matching `RowDescription`.
 *
 * @category models
 * @since 4.0.0
 */
export interface DataRow<out A = Uint8Array | null> {
  readonly _tag: "DataRow"
  readonly values: ReadonlyArray<A>
}

/**
 * Reads one `DataRow` field from the parser buffer.
 *
 * **Details**
 *
 * `size` is `-1` for SQL `NULL`, and `column` is the field index. Only bytes
 * from `offset` through `offset + size` belong to the field. A thrown error
 * permanently fails the parser.
 *
 * @category models
 * @since 4.0.0
 */
export type FieldReader<A> = (bytes: Uint8Array, offset: number, size: number, column: number) => A

/**
 * A command finished, reporting its tag such as `SELECT 3`.
 *
 * @category models
 * @since 4.0.0
 */
export interface CommandComplete {
  readonly _tag: "CommandComplete"
  readonly commandTag: string
}

/**
 * The query string was empty.
 *
 * @category models
 * @since 4.0.0
 */
export interface EmptyQueryResponse {
  readonly _tag: "EmptyQueryResponse"
}

/**
 * The statement or portal returns no rows.
 *
 * @category models
 * @since 4.0.0
 */
export interface NoData {
  readonly _tag: "NoData"
}

/**
 * A `Parse` succeeded.
 *
 * @category models
 * @since 4.0.0
 */
export interface ParseComplete {
  readonly _tag: "ParseComplete"
}

/**
 * A `Bind` succeeded.
 *
 * @category models
 * @since 4.0.0
 */
export interface BindComplete {
  readonly _tag: "BindComplete"
}

/**
 * A `Close` succeeded.
 *
 * @category models
 * @since 4.0.0
 */
export interface CloseComplete {
  readonly _tag: "CloseComplete"
}

/**
 * An `Execute` stopped at its row limit; the portal can be executed again.
 *
 * @category models
 * @since 4.0.0
 */
export interface PortalSuspended {
  readonly _tag: "PortalSuspended"
}

/**
 * The parameter OIDs of a described statement.
 *
 * @category models
 * @since 4.0.0
 */
export interface ParameterDescription {
  readonly _tag: "ParameterDescription"
  readonly parameterTypes: ReadonlyArray<number>
}

/**
 * The fields of an `ErrorResponse` or `NoticeResponse`. Unrecognised field
 * codes are kept under their raw single-character key.
 *
 * @category models
 * @since 4.0.0
 */
export interface ErrorFields {
  readonly [key: string]: string | undefined
  readonly severity?: string | undefined
  readonly severityUnlocalized?: string | undefined
  readonly code?: string | undefined
  readonly message?: string | undefined
  readonly detail?: string | undefined
  readonly hint?: string | undefined
  readonly position?: string | undefined
  readonly internalPosition?: string | undefined
  readonly internalQuery?: string | undefined
  readonly where?: string | undefined
  readonly schema?: string | undefined
  readonly table?: string | undefined
  readonly column?: string | undefined
  readonly dataType?: string | undefined
  readonly constraint?: string | undefined
  readonly file?: string | undefined
  readonly line?: string | undefined
  readonly routine?: string | undefined
}

/**
 * An error. `code` is the SQLSTATE.
 *
 * @category models
 * @since 4.0.0
 */
export interface ErrorResponse {
  readonly _tag: "ErrorResponse"
  readonly fields: ErrorFields
}

/**
 * A warning or notice. Same field set as `ErrorResponse`.
 *
 * @category models
 * @since 4.0.0
 */
export interface NoticeResponse {
  readonly _tag: "NoticeResponse"
  readonly fields: ErrorFields
}

/**
 * A `LISTEN`/`NOTIFY` message.
 *
 * @category models
 * @since 4.0.0
 */
export interface NotificationResponse {
  readonly _tag: "NotificationResponse"
  readonly pid: number
  readonly channel: string
  readonly payload: string
}

/**
 * The server speaks an older minor protocol version, or did not recognise
 * some startup options.
 *
 * @category models
 * @since 4.0.0
 */
export interface NegotiateProtocolVersion {
  readonly _tag: "NegotiateProtocolVersion"
  readonly minorVersion: number
  readonly unrecognizedOptions: ReadonlyArray<string>
}

/**
 * The server is ready to receive `COPY` data.
 *
 * @category models
 * @since 4.0.0
 */
export interface CopyInResponse {
  readonly _tag: "CopyInResponse"
  readonly format: number
  readonly columnFormats: ReadonlyArray<number>
}

/**
 * The server is about to send `COPY` data.
 *
 * @category models
 * @since 4.0.0
 */
export interface CopyOutResponse {
  readonly _tag: "CopyOutResponse"
  readonly format: number
  readonly columnFormats: ReadonlyArray<number>
}

/**
 * The connection entered bidirectional `COPY` mode, as used by replication.
 *
 * @category models
 * @since 4.0.0
 */
export interface CopyBothResponse {
  readonly _tag: "CopyBothResponse"
  readonly format: number
  readonly columnFormats: ReadonlyArray<number>
}

/**
 * A chunk of `COPY` data.
 *
 * @category models
 * @since 4.0.0
 */
export interface CopyData {
  readonly _tag: "CopyData"
  readonly data: Uint8Array
}

/**
 * The `COPY` stream ended.
 *
 * @category models
 * @since 4.0.0
 */
export interface CopyDone {
  readonly _tag: "CopyDone"
}

/**
 * A message whose type byte this codec does not know. The payload excludes
 * the type byte and the length prefix.
 *
 * @category models
 * @since 4.0.0
 */
export interface Unknown {
  readonly _tag: "Unknown"
  readonly type: number
  readonly payload: Uint8Array
}

/**
 * Any message the server sends after startup.
 *
 * @category models
 * @since 4.0.0
 */
export type BackendMessage<A = Uint8Array | null> =
  | AuthenticationOk
  | AuthenticationCleartextPassword
  | AuthenticationMD5Password
  | AuthenticationSASL
  | AuthenticationSASLContinue
  | AuthenticationSASLFinal
  | AuthenticationUnsupported
  | ParameterStatus
  | BackendKeyData
  | ReadyForQuery
  | RowDescription
  | DataRow<A>
  | CommandComplete
  | EmptyQueryResponse
  | NoData
  | ParseComplete
  | BindComplete
  | CloseComplete
  | PortalSuspended
  | ParameterDescription
  | ErrorResponse
  | NoticeResponse
  | NotificationResponse
  | NegotiateProtocolVersion
  | CopyInResponse
  | CopyOutResponse
  | CopyBothResponse
  | CopyData
  | CopyDone
  | Unknown

const BackendType = {
  NotificationResponse: 0x41, // A
  CommandComplete: 0x43, // C
  DataRow: 0x44, // D
  ErrorResponse: 0x45, // E
  CopyInResponse: 0x47, // G
  CopyOutResponse: 0x48, // H
  EmptyQueryResponse: 0x49, // I
  BackendKeyData: 0x4b, // K
  NoticeResponse: 0x4e, // N
  Authentication: 0x52, // R
  ParameterStatus: 0x53, // S
  RowDescription: 0x54, // T
  CopyBothResponse: 0x57, // W
  ReadyForQuery: 0x5a, // Z
  CopyDone: 0x63, // c
  CopyData: 0x64, // d
  NoData: 0x6e, // n
  PortalSuspended: 0x73, // s
  ParameterDescription: 0x74, // t
  NegotiateProtocolVersion: 0x76, // v
  ParseComplete: 0x31, // 1
  BindComplete: 0x32, // 2
  CloseComplete: 0x33 // 3
} as const

const errorFieldNames: Record<string, string> = {
  S: "severity",
  V: "severityUnlocalized",
  C: "code",
  M: "message",
  D: "detail",
  H: "hint",
  P: "position",
  p: "internalPosition",
  q: "internalQuery",
  W: "where",
  s: "schema",
  t: "table",
  c: "column",
  d: "dataType",
  n: "constraint",
  F: "file",
  L: "line",
  R: "routine"
}

const decodeAuthentication = (reader: Reader): BackendMessage => {
  const method = reader.int32()
  switch (method) {
    case 0:
      return { _tag: "AuthenticationOk" }
    case 3:
      return { _tag: "AuthenticationCleartextPassword" }
    case 5:
      return { _tag: "AuthenticationMD5Password", salt: reader.raw(4) }
    case 10: {
      const mechanisms: Array<string> = []
      for (;;) {
        const mechanism = reader.cString()
        if (mechanism === "") break
        mechanisms.push(mechanism)
      }
      return { _tag: "AuthenticationSASL", mechanisms }
    }
    case 11:
      return { _tag: "AuthenticationSASLContinue", data: reader.rest() }
    case 12:
      return { _tag: "AuthenticationSASLFinal", data: reader.rest() }
    default:
      return { _tag: "AuthenticationUnsupported", method, payload: reader.rest() }
  }
}

const decodeErrorFields = (reader: Reader): ErrorFields => {
  const fields: Record<string, string> = {}
  for (;;) {
    const code = reader.uint8()
    if (code === 0) break
    const key = String.fromCharCode(code)
    fields[errorFieldNames[key] ?? key] = reader.cString()
  }
  return fields
}

const requireNonNegativeCount = (count: number, name: string): number => {
  if (count < 0) {
    throw new ParseError({ message: `Invalid ${name} count: ${count}` })
  }
  return count
}

const decodeCopyResponse = (
  reader: Reader
): { readonly format: number; readonly columnFormats: ReadonlyArray<number> } => {
  const format = reader.uint8()
  const count = requireNonNegativeCount(reader.int16(), "COPY column")
  const columnFormats: Array<number> = new Array(count)
  for (let i = 0; i < count; i++) {
    columnFormats[i] = reader.int16()
  }
  return { format, columnFormats }
}

// The one message that arrives per result row, so it reads the frame directly
// instead of going through `Reader`. Callers have already checked that the
// whole frame is buffered, which turns every field read into one bounds check
// against `limit`.
const decodeDataRow = <A>(
  bytes: Uint8Array,
  store: ArrayBufferLike,
  base: number,
  offset: number,
  limit: number,
  readField: FieldReader<A> | undefined
): DataRow<A> => {
  if (offset + 2 > limit) {
    throw new ParseError({ message: "Truncated message: expected 2 more byte(s)" })
  }
  const count = ((bytes[offset] << 8) | bytes[offset + 1]) << 16 >> 16
  if (count < 0) {
    throw new ParseError({ message: `Invalid DataRow field count: ${count}` })
  }
  const values: Array<any> = new Array(count)
  let position = offset + 2
  for (let i = 0; i < count; i++) {
    if (position + 4 > limit) {
      throw new ParseError({ message: "Truncated message: expected 4 more byte(s)" })
    }
    const size = (bytes[position] << 24) | (bytes[position + 1] << 16) | (bytes[position + 2] << 8) |
      bytes[position + 3]
    position += 4
    if (size < 0) {
      if (size < -1) {
        throw new ParseError({ message: `Invalid DataRow field length: ${size}` })
      }
      values[i] = readField === undefined ? null : readField(bytes, position, -1, i)
      continue
    }
    const next = position + size
    if (next > limit) {
      throw new ParseError({ message: `Truncated message: expected ${size} more byte(s)` })
    }
    values[i] = readField === undefined
      ? view(store, base + position, size)
      : readField(bytes, position, size, i)
    position = next
  }
  if (position !== limit) {
    throw new ParseError({ message: `DataRow has ${limit - position} trailing byte(s)` })
  }
  return { _tag: "DataRow", values }
}

const decodeBackend = (type: number, reader: Reader): BackendMessage => {
  switch (type) {
    case BackendType.Authentication:
      return decodeAuthentication(reader)
    case BackendType.ParameterStatus:
      return { _tag: "ParameterStatus", name: reader.cString(), value: reader.cString() }
    case BackendType.BackendKeyData:
      return { _tag: "BackendKeyData", pid: reader.int32(), secret: reader.int32() }
    case BackendType.ReadyForQuery: {
      const status = String.fromCharCode(reader.uint8())
      if (status !== "I" && status !== "T" && status !== "E") {
        throw new ParseError({ message: `Invalid ReadyForQuery status: ${status}` })
      }
      return { _tag: "ReadyForQuery", status }
    }
    case BackendType.RowDescription: {
      const count = requireNonNegativeCount(reader.int16(), "RowDescription field")
      const fields: Array<FieldDescription> = new Array(count)
      for (let i = 0; i < count; i++) {
        fields[i] = {
          name: reader.cString(),
          tableOid: reader.uint32(),
          columnAttributeNumber: reader.int16(),
          dataTypeOid: reader.uint32(),
          dataTypeSize: reader.int16(),
          typeModifier: reader.int32(),
          format: reader.int16()
        }
      }
      return { _tag: "RowDescription", fields }
    }
    case BackendType.DataRow:
      return decodeDataRow(reader.bytes, reader.store, reader.base, reader.offset, reader.limit, undefined)
    case BackendType.CommandComplete:
      return { _tag: "CommandComplete", commandTag: reader.cString() }
    case BackendType.EmptyQueryResponse:
      return { _tag: "EmptyQueryResponse" }
    case BackendType.NoData:
      return { _tag: "NoData" }
    case BackendType.ParseComplete:
      return { _tag: "ParseComplete" }
    case BackendType.BindComplete:
      return { _tag: "BindComplete" }
    case BackendType.CloseComplete:
      return { _tag: "CloseComplete" }
    case BackendType.PortalSuspended:
      return { _tag: "PortalSuspended" }
    case BackendType.ParameterDescription: {
      const count = requireNonNegativeCount(reader.int16(), "ParameterDescription parameter")
      const parameterTypes: Array<number> = new Array(count)
      for (let i = 0; i < count; i++) {
        parameterTypes[i] = reader.uint32()
      }
      return { _tag: "ParameterDescription", parameterTypes }
    }
    case BackendType.ErrorResponse:
      return { _tag: "ErrorResponse", fields: decodeErrorFields(reader) }
    case BackendType.NoticeResponse:
      return { _tag: "NoticeResponse", fields: decodeErrorFields(reader) }
    case BackendType.NotificationResponse:
      return {
        _tag: "NotificationResponse",
        pid: reader.int32(),
        channel: reader.cString(),
        payload: reader.cString()
      }
    case BackendType.NegotiateProtocolVersion: {
      const minorVersion = reader.int32()
      const count = requireNonNegativeCount(reader.int32(), "NegotiateProtocolVersion option")
      const unrecognizedOptions: Array<string> = new Array(count)
      for (let i = 0; i < count; i++) {
        unrecognizedOptions[i] = reader.cString()
      }
      return { _tag: "NegotiateProtocolVersion", minorVersion, unrecognizedOptions }
    }
    case BackendType.CopyInResponse:
      return { _tag: "CopyInResponse", ...decodeCopyResponse(reader) }
    case BackendType.CopyOutResponse:
      return { _tag: "CopyOutResponse", ...decodeCopyResponse(reader) }
    case BackendType.CopyBothResponse:
      return { _tag: "CopyBothResponse", ...decodeCopyResponse(reader) }
    case BackendType.CopyData:
      return { _tag: "CopyData", data: reader.rest() }
    case BackendType.CopyDone:
      return { _tag: "CopyDone" }
    default:
      return { _tag: "Unknown", type, payload: reader.rest() }
  }
}
