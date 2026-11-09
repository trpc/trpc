/**
 * Encodes and decodes newline-delimited JSON streams in Effect channels.
 *
 * NDJSON stores one complete JSON value on each line. This module has helpers
 * for byte streams, string streams, and schema-checked records, so streaming
 * code can read or write one JSON record at a time.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Arr from "../Array.ts"
import * as Cause from "../Cause.ts"
import * as Channel from "../Channel.ts"
import * as ChannelSchema from "../ChannelSchema.ts"
import * as Data from "../Data.ts"
import * as Effect from "../Effect.ts"
import { dual } from "../Function.ts"
import * as Predicate from "../Predicate.ts"
import * as Pull from "../Pull.ts"
import type * as Schema from "../Schema.ts"

const NdjsonErrorTypeId = "~effect/encoding/Ndjson/NdjsonError"

const encoder = new TextEncoder()
const utf8Decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })

/**
 * Error raised when NDJSON encoding or decoding fails.
 *
 * **Details**
 *
 * The `kind` field identifies whether the failure happened while packing or
 * unpacking, and `cause` preserves the original error.
 *
 * Decoders also set `reason` to say why a line was rejected, and
 * `unterminated` when that line is the final line of the input and has no
 * line terminator.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class NdjsonError extends Data.TaggedError("NdjsonError")<{
  readonly kind: "Pack" | "Unpack"
  readonly reason?: NdjsonErrorReason | undefined
  readonly unterminated?: boolean | undefined
  readonly cause: unknown
}> {
  /**
   * Marks this value as an NDJSON encoding or decoding error for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [NdjsonErrorTypeId] = NdjsonErrorTypeId

  /**
   * Uses the failed NDJSON operation as the public message.
   *
   * @stability unstable
   * @since 4.0.0
   */
  override get message() {
    return this.kind
  }
}

/**
 * Why a decoder rejected a line.
 *
 * **Details**
 *
 * - `InvalidJson`: the line is not valid JSON.
 * - `InvalidUtf8`: the line is not valid UTF-8 (byte decoders only).
 * - `LineTooLarge`: the line is longer than `maxLineBytes` (byte decoders only).
 *
 * @stability unstable
 * @category errors
 * @since 4.0.6
 */
export type NdjsonErrorReason = "InvalidJson" | "InvalidUtf8" | "LineTooLarge"

/**
 * Checks whether a value is an `NdjsonError`.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isNdjsonError = (u: unknown): u is NdjsonError => Predicate.hasProperty(u, NdjsonErrorTypeId)

/**
 * Creates a channel that encodes chunks of values as NDJSON strings.
 *
 * **Details**
 *
 * Each input item is `JSON.stringify`-encoded, separated by newlines, and the
 * output chunk ends with a trailing newline.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const encodeString = <IE = never, Done = unknown>(): Channel.Channel<
  Arr.NonEmptyReadonlyArray<string>,
  IE | NdjsonError,
  Done,
  Arr.NonEmptyReadonlyArray<unknown>,
  IE,
  Done
> =>
  Channel.fromTransform((upstream, _scope) =>
    Effect.succeed(Effect.flatMap(upstream, (input) => {
      try {
        return Effect.succeed(Arr.of(
          input.map((item) => {
            const output = JSON.stringify(item)
            if (output === undefined) {
              throw new TypeError("Value cannot be represented as JSON")
            }
            return output
          }).join("\n") + "\n"
        ))
      } catch (cause) {
        return Effect.fail(new NdjsonError({ kind: "Pack", cause }))
      }
    }))
  )

/**
 * Creates a channel that encodes chunks of values as UTF-8 NDJSON bytes.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const encode = <IE = never, Done = unknown>(): Channel.Channel<
  Arr.NonEmptyReadonlyArray<Uint8Array>,
  IE | NdjsonError,
  Done,
  Arr.NonEmptyReadonlyArray<unknown>,
  IE,
  Done
> => Channel.map(encodeString(), Arr.map((_) => encoder.encode(_)))

/**
 * Creates an NDJSON byte encoder channel for values of a schema.
 *
 * **Details**
 *
 * Values are first encoded with the schema and then written as UTF-8
 * newline-delimited JSON.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const encodeSchema = <S extends Schema.Constraint>(
  schema: S
) =>
<IE = never, Done = unknown>(): Channel.Channel<
  Arr.NonEmptyReadonlyArray<Uint8Array>,
  NdjsonError | Schema.SchemaError | IE,
  Done,
  Arr.NonEmptyReadonlyArray<S["Type"]>,
  IE,
  Done,
  S["EncodingServices"]
> => Channel.pipeTo(ChannelSchema.encode(schema)(), encode())

/**
 * Creates an NDJSON string encoder channel for values of a schema.
 *
 * **Details**
 *
 * Values are first encoded with the schema and then written as newline-delimited
 * JSON strings.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const encodeSchemaString = <S extends Schema.Constraint>(
  schema: S
) =>
<IE = never, Done = unknown>(): Channel.Channel<
  Arr.NonEmptyReadonlyArray<string>,
  NdjsonError | Schema.SchemaError | IE,
  Done,
  Arr.NonEmptyReadonlyArray<S["Type"]>,
  IE,
  Done,
  S["EncodingServices"]
> => Channel.pipeTo(ChannelSchema.encode(schema)(), encodeString())

// Collects the values of one input chunk into `out`. A failure stops the
// chunk, and the values collected before it are still emitted.
type DecodeStep<In> = (input: In, out: Array<unknown>) => NdjsonError | undefined

const makeDecodePull = <In, IE, Done>(
  upstream: Pull.Pull<In, IE, Done>,
  step: DecodeStep<In>,
  flush: (out: Array<unknown>) => NdjsonError | undefined
): Pull.Pull<Arr.NonEmptyReadonlyArray<unknown>, IE | NdjsonError, Done> => {
  let failure: NdjsonError | undefined
  let done: { readonly leftover: Done } | undefined

  const emit = (out: Array<unknown>, error: NdjsonError | undefined) => {
    failure = error
    if (Arr.isArrayNonEmpty(out)) return Effect.succeed(out)
    return error !== undefined ? Effect.fail(error) : undefined
  }

  const pull: Pull.Pull<Arr.NonEmptyReadonlyArray<unknown>, IE | NdjsonError, Done> = Effect.suspend(() => {
    if (failure !== undefined) return Effect.fail(failure)
    if (done !== undefined) return Cause.done(done.leftover)
    return Pull.matchEffect(upstream, {
      onSuccess: (input) => {
        const out: Array<unknown> = []
        return emit(out, step(input, out)) ?? pull
      },
      onFailure: Effect.failCause,
      onDone: (leftover): Pull.Pull<Arr.NonEmptyReadonlyArray<unknown>, NdjsonError, Done> => {
        done = { leftover }
        const out: Array<unknown> = []
        return emit(out, flush(out)) ?? Cause.done(leftover)
      }
    })
  })
  return pull
}

const parseLine = (
  line: string,
  out: Array<unknown>,
  ignoreEmptyLines: boolean,
  unterminated: boolean
): NdjsonError | undefined => {
  if (ignoreEmptyLines && /^[ \t]*$/.test(line)) return
  try {
    out.push(JSON.parse(line))
  } catch (cause) {
    return new NdjsonError({ kind: "Unpack", reason: "InvalidJson", unterminated, cause })
  }
}

const flushNothing = () => undefined

/**
 * Creates a channel that parses NDJSON string chunks into values.
 *
 * **When to use**
 *
 * Use when NDJSON input arrives as string chunks and each complete line should
 * be parsed into a JSON value.
 *
 * **Details**
 *
 * Lines may span input chunks. `\n`, `\r\n` and a bare `\r` end a line. The
 * first line that fails to parse fails the channel with
 * `reason: "InvalidJson"`, after the lines before it have been emitted.
 *
 * **Gotchas**
 *
 * Set `ignoreEmptyLines` to skip empty lines and lines containing only spaces
 * or tabs before calling `JSON.parse`; otherwise these lines fail as invalid
 * JSON.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const decodeString = <IE = never, Done = unknown>(options?: {
  readonly ignoreEmptyLines?: boolean | undefined
}): Channel.Channel<
  Arr.NonEmptyReadonlyArray<unknown>,
  IE | NdjsonError,
  Done,
  Arr.NonEmptyReadonlyArray<string>,
  IE,
  Done
> =>
  Channel.fromTransform((upstream, scope) => {
    const ignoreEmptyLines = options?.ignoreEmptyLines === true
    // splitLines only emits a line after its input has ended when that line
    // has no terminator
    let ended = false
    const input = Pull.matchEffect(upstream, {
      onSuccess: Effect.succeed,
      onFailure: Effect.failCause,
      onDone: (leftover) => {
        ended = true
        return Cause.done(leftover)
      }
    })
    return Effect.map(
      Channel.toTransform(Channel.splitLines<IE, Done>())(input, scope),
      (lines) =>
        makeDecodePull(lines, (chunk, out) => {
          for (const line of chunk) {
            const error = parseLine(line, out, ignoreEmptyLines, ended)
            if (error !== undefined) return error
          }
        }, flushNothing)
    )
  })

const LF = 0x0a
const CR = 0x0d
const emptyBytes = new Uint8Array(0)

/**
 * Creates a channel that decodes UTF-8 byte chunks and parses them as NDJSON.
 *
 * **Details**
 *
 * Lines may span input chunks. `\n`, `\r\n` and a bare `\r` end a line, and a
 * leading UTF-8 BOM is skipped. `ignoreEmptyLines` skips empty lines and lines
 * containing only spaces or tabs before JSON parsing.
 *
 * The first bad line fails the channel after the lines before it have been
 * emitted. A line that is not valid UTF-8 fails with `reason: "InvalidUtf8"`
 * and a line that is not valid JSON fails with `reason: "InvalidJson"`.
 *
 * `maxLineBytes` limits the UTF-8 bytes of a line, not counting its
 * terminator. A longer line fails with `reason: "LineTooLarge"` as soon as the
 * limit is passed, without reading the rest of the line. Lines are unbounded
 * by default.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const decode = <IE = never, Done = unknown>(options?: {
  readonly ignoreEmptyLines?: boolean | undefined
  readonly maxLineBytes?: number | undefined
}): Channel.Channel<
  Arr.NonEmptyReadonlyArray<unknown>,
  IE | NdjsonError,
  Done,
  Arr.NonEmptyReadonlyArray<Uint8Array>,
  IE,
  Done
> =>
  Channel.fromTransform((upstream, _scope) =>
    Effect.sync(() => {
      const ignoreEmptyLines = options?.ignoreEmptyLines === true
      const maxLineBytes = options?.maxLineBytes ?? Number.POSITIVE_INFINITY
      // The first decoder strips a leading BOM. `\n` and `\r` never occur
      // inside a multi-byte character, so each line is decoded on its own.
      let decoder = new TextDecoder("utf-8", { fatal: true })
      // Bytes of the current line from earlier chunks
      let pending: Array<Uint8Array> = []
      let pendingBytes = 0
      // The previous byte was `\r`, so a `\n` right after it ends nothing
      let afterCR = false

      const takeLine = (chunk: Uint8Array, start: number, end: number): Uint8Array => {
        if (pendingBytes === 0) return chunk.subarray(start, end)
        const line = new Uint8Array(pendingBytes + end - start)
        let offset = 0
        for (const bytes of pending) {
          line.set(bytes, offset)
          offset += bytes.length
        }
        line.set(chunk.subarray(start, end), offset)
        pending = []
        pendingBytes = 0
        return line
      }

      const decodeLine = (bytes: Uint8Array, out: Array<unknown>, unterminated: boolean) => {
        let line: string
        try {
          line = decoder.decode(bytes)
        } catch (cause) {
          return new NdjsonError({ kind: "Unpack", reason: "InvalidUtf8", unterminated, cause })
        }
        const firstLine = decoder !== utf8Decoder
        decoder = utf8Decoder
        // A stripped BOM alone is not an unterminated record.
        if (firstLine && unterminated && line.length === 0) return
        return parseLine(line, out, ignoreEmptyLines, unterminated)
      }

      const step: DecodeStep<Arr.NonEmptyReadonlyArray<Uint8Array>> = (chunks, out) => {
        for (const chunk of chunks) {
          let start = 0
          for (let i = 0; i < chunk.length; i++) {
            const byte = chunk[i]
            if (byte === LF || byte === CR) {
              if (byte === LF && afterCR) {
                start = i + 1
              } else {
                const error = decodeLine(takeLine(chunk, start, i), out, false)
                if (error !== undefined) return error
                start = i + 1
              }
              afterCR = byte === CR
            } else {
              afterCR = false
              if (pendingBytes + i + 1 - start > maxLineBytes) {
                return new NdjsonError({
                  kind: "Unpack",
                  reason: "LineTooLarge",
                  unterminated: false,
                  cause: new RangeError(`NDJSON line exceeds maxLineBytes of ${maxLineBytes}`)
                })
              }
            }
          }
          if (start < chunk.length) {
            // Copy, so a reused upstream buffer cannot change the line
            pending.push(chunk.slice(start))
            pendingBytes += chunk.length - start
          }
        }
      }

      const flush = (out: Array<unknown>) =>
        pendingBytes === 0 ? undefined : decodeLine(takeLine(emptyBytes, 0, 0), out, true)

      return makeDecodePull(upstream, step, flush)
    })
  )

/**
 * Creates an NDJSON byte decoder channel for values of a schema.
 *
 * **Details**
 *
 * The channel decodes UTF-8 bytes, parses each NDJSON line, and then decodes
 * each parsed value with the schema.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const decodeSchema = <S extends Schema.Constraint>(
  schema: S
) =>
<IE = never, Done = unknown>(options?: {
  readonly ignoreEmptyLines?: boolean | undefined
  readonly maxLineBytes?: number | undefined
}): Channel.Channel<
  Arr.NonEmptyReadonlyArray<S["Type"]>,
  Schema.SchemaError | NdjsonError | IE,
  Done,
  Arr.NonEmptyReadonlyArray<Uint8Array>,
  IE,
  Done,
  S["DecodingServices"]
> => Channel.pipeTo(decode(options), ChannelSchema.decodeUnknown(schema)())

/**
 * Creates an NDJSON string decoder channel for values of a schema.
 *
 * **Details**
 *
 * The channel parses each line as JSON and then decodes each parsed value with
 * the schema.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const decodeSchemaString = <S extends Schema.Constraint>(
  schema: S
) =>
<IE = never, Done = unknown>(options?: {
  readonly ignoreEmptyLines?: boolean | undefined
}): Channel.Channel<
  Arr.NonEmptyReadonlyArray<S["Type"]>,
  Schema.SchemaError | NdjsonError | IE,
  Done,
  Arr.NonEmptyReadonlyArray<string>,
  IE,
  Done,
  S["DecodingServices"]
> => Channel.pipeTo(decodeString(options), ChannelSchema.decodeUnknown(schema)())

/**
 * Wraps a bidirectional byte channel with NDJSON encoding and decoding.
 *
 * **Details**
 *
 * Outgoing values are written as UTF-8 NDJSON bytes, and incoming bytes are
 * parsed as NDJSON values.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const duplex: {
  (options?: {
    readonly ignoreEmptyLines?: boolean | undefined
    readonly maxLineBytes?: number | undefined
  }): <R, IE, OE, OutDone, InDone>(
    self: Channel.Channel<
      Arr.NonEmptyReadonlyArray<Uint8Array>,
      OE,
      OutDone,
      Arr.NonEmptyReadonlyArray<Uint8Array>,
      IE | NdjsonError,
      InDone,
      R
    >
  ) => Channel.Channel<
    Arr.NonEmptyReadonlyArray<unknown>,
    NdjsonError | OE,
    OutDone,
    Arr.NonEmptyReadonlyArray<unknown>,
    IE,
    InDone,
    R
  >
  <R, IE, OE, OutDone, InDone>(
    self: Channel.Channel<
      Arr.NonEmptyReadonlyArray<Uint8Array>,
      OE,
      OutDone,
      Arr.NonEmptyReadonlyArray<Uint8Array>,
      IE | NdjsonError,
      InDone,
      R
    >,
    options?: {
      readonly ignoreEmptyLines?: boolean | undefined
      readonly maxLineBytes?: number | undefined
    }
  ): Channel.Channel<
    Arr.NonEmptyReadonlyArray<unknown>,
    NdjsonError | OE,
    OutDone,
    Arr.NonEmptyReadonlyArray<unknown>,
    IE,
    InDone,
    R
  >
} = dual((args) => Channel.isChannel(args[0]), <R, IE, OE, OutDone, InDone>(
  self: Channel.Channel<
    Arr.NonEmptyReadonlyArray<Uint8Array>,
    OE,
    OutDone,
    Arr.NonEmptyReadonlyArray<Uint8Array>,
    IE | NdjsonError,
    InDone,
    R
  >,
  options?: {
    readonly ignoreEmptyLines?: boolean | undefined
    readonly maxLineBytes?: number | undefined
  }
): Channel.Channel<
  Arr.NonEmptyReadonlyArray<unknown>,
  NdjsonError | OE,
  OutDone,
  Arr.NonEmptyReadonlyArray<unknown>,
  IE,
  InDone,
  R
> =>
  Channel.pipeTo(
    Channel.pipeTo(encode(), self),
    decode(options)
  ))

/**
 * Wraps a bidirectional string channel with NDJSON encoding and decoding.
 *
 * **Details**
 *
 * Outgoing values are written as NDJSON strings, and incoming strings are parsed
 * as NDJSON values.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const duplexString: {
  (options?: {
    readonly ignoreEmptyLines?: boolean | undefined
  }): <R, IE, OE, OutDone, InDone>(
    self: Channel.Channel<
      Arr.NonEmptyReadonlyArray<string>,
      OE,
      OutDone,
      Arr.NonEmptyReadonlyArray<string>,
      IE | NdjsonError,
      InDone,
      R
    >
  ) => Channel.Channel<
    Arr.NonEmptyReadonlyArray<unknown>,
    NdjsonError | OE,
    OutDone,
    Arr.NonEmptyReadonlyArray<unknown>,
    IE,
    InDone,
    R
  >
  <R, IE, OE, OutDone, InDone>(
    self: Channel.Channel<
      Arr.NonEmptyReadonlyArray<string>,
      OE,
      OutDone,
      Arr.NonEmptyReadonlyArray<string>,
      IE | NdjsonError,
      InDone,
      R
    >,
    options?: {
      readonly ignoreEmptyLines?: boolean | undefined
    }
  ): Channel.Channel<
    Arr.NonEmptyReadonlyArray<unknown>,
    NdjsonError | OE,
    OutDone,
    Arr.NonEmptyReadonlyArray<unknown>,
    IE,
    InDone,
    R
  >
} = dual((args) => Channel.isChannel(args[0]), <R, IE, OE, OutDone, InDone>(
  self: Channel.Channel<
    Arr.NonEmptyReadonlyArray<string>,
    OE,
    OutDone,
    Arr.NonEmptyReadonlyArray<string>,
    IE | NdjsonError,
    InDone,
    R
  >,
  options?: {
    readonly ignoreEmptyLines?: boolean | undefined
  }
): Channel.Channel<
  Arr.NonEmptyReadonlyArray<unknown>,
  NdjsonError | OE,
  OutDone,
  Arr.NonEmptyReadonlyArray<unknown>,
  IE,
  InDone,
  R
> =>
  Channel.pipeTo(
    Channel.pipeTo(encodeString(), self),
    decodeString(options)
  ))

/**
 * Wraps a bidirectional byte channel with schema-aware NDJSON encoding and
 * decoding.
 *
 * **Details**
 *
 * Values sent to the wrapped channel are encoded with `inputSchema`; bytes
 * received from it are parsed as NDJSON and decoded with `outputSchema`.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const duplexSchema: {
  <In extends Schema.Constraint, Out extends Schema.Constraint>(
    options: {
      readonly inputSchema: In
      readonly outputSchema: Out
      readonly ignoreEmptyLines?: boolean | undefined
      readonly maxLineBytes?: number | undefined
    }
  ): <OutErr, OutDone, InErr, InDone, R>(
    self: Channel.Channel<
      Arr.NonEmptyReadonlyArray<Uint8Array>,
      OutErr,
      OutDone,
      Arr.NonEmptyReadonlyArray<Uint8Array>,
      NdjsonError | Schema.SchemaError | InErr,
      InDone,
      R
    >
  ) => Channel.Channel<
    Arr.NonEmptyReadonlyArray<Out["Type"]>,
    NdjsonError | Schema.SchemaError | OutErr,
    OutDone,
    Arr.NonEmptyReadonlyArray<In["Type"]>,
    InErr,
    InDone,
    R | In["EncodingServices"] | Out["DecodingServices"]
  >
  <Out extends Schema.Constraint, In extends Schema.Constraint, OutErr, OutDone, InErr, InDone, R>(
    self: Channel.Channel<
      Arr.NonEmptyReadonlyArray<Uint8Array>,
      OutErr,
      OutDone,
      Arr.NonEmptyReadonlyArray<Uint8Array>,
      NdjsonError | Schema.SchemaError | InErr,
      InDone,
      R
    >,
    options: {
      readonly inputSchema: In
      readonly outputSchema: Out
      readonly ignoreEmptyLines?: boolean | undefined
      readonly maxLineBytes?: number | undefined
    }
  ): Channel.Channel<
    Arr.NonEmptyReadonlyArray<Out["Type"]>,
    NdjsonError | Schema.SchemaError | OutErr,
    OutDone,
    Arr.NonEmptyReadonlyArray<In["Type"]>,
    InErr,
    InDone,
    R | In["EncodingServices"] | Out["DecodingServices"]
  >
} = dual(2, <Out extends Schema.Constraint, In extends Schema.Constraint, OutErr, OutDone, InErr, InDone, R>(
  self: Channel.Channel<
    Arr.NonEmptyReadonlyArray<Uint8Array>,
    OutErr,
    OutDone,
    Arr.NonEmptyReadonlyArray<Uint8Array>,
    NdjsonError | Schema.SchemaError | InErr,
    InDone,
    R
  >,
  options: {
    readonly inputSchema: In
    readonly outputSchema: Out
    readonly ignoreEmptyLines?: boolean | undefined
    readonly maxLineBytes?: number | undefined
  }
): Channel.Channel<
  Arr.NonEmptyReadonlyArray<Out["Type"]>,
  NdjsonError | Schema.SchemaError | OutErr,
  OutDone,
  Arr.NonEmptyReadonlyArray<In["Type"]>,
  InErr,
  InDone,
  R | In["EncodingServices"] | Out["DecodingServices"]
> => ChannelSchema.duplexUnknown(duplex(self, options), options))

/**
 * Wraps a bidirectional string channel with schema-aware NDJSON encoding and
 * decoding.
 *
 * **Details**
 *
 * Values sent to the wrapped channel are encoded with `inputSchema`; strings
 * received from it are parsed as NDJSON and decoded with `outputSchema`.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const duplexSchemaString: {
  <In extends Schema.Constraint, Out extends Schema.Constraint>(
    options: {
      readonly inputSchema: In
      readonly outputSchema: Out
      readonly ignoreEmptyLines?: boolean | undefined
    }
  ): <OutErr, OutDone, InErr, InDone, R>(
    self: Channel.Channel<
      Arr.NonEmptyReadonlyArray<string>,
      OutErr,
      OutDone,
      Arr.NonEmptyReadonlyArray<string>,
      NdjsonError | Schema.SchemaError | InErr,
      InDone,
      R
    >
  ) => Channel.Channel<
    Arr.NonEmptyReadonlyArray<Out["Type"]>,
    NdjsonError | Schema.SchemaError | OutErr,
    OutDone,
    Arr.NonEmptyReadonlyArray<In["Type"]>,
    InErr,
    InDone,
    R | In["EncodingServices"] | Out["DecodingServices"]
  >
  <Out extends Schema.Constraint, In extends Schema.Constraint, OutErr, OutDone, InErr, InDone, R>(
    self: Channel.Channel<
      Arr.NonEmptyReadonlyArray<string>,
      OutErr,
      OutDone,
      Arr.NonEmptyReadonlyArray<string>,
      NdjsonError | Schema.SchemaError | InErr,
      InDone,
      R
    >,
    options: {
      readonly inputSchema: In
      readonly outputSchema: Out
      readonly ignoreEmptyLines?: boolean | undefined
    }
  ): Channel.Channel<
    Arr.NonEmptyReadonlyArray<Out["Type"]>,
    NdjsonError | Schema.SchemaError | OutErr,
    OutDone,
    Arr.NonEmptyReadonlyArray<In["Type"]>,
    InErr,
    InDone,
    R | In["EncodingServices"] | Out["DecodingServices"]
  >
} = dual(2, <Out extends Schema.Constraint, In extends Schema.Constraint, OutErr, OutDone, InErr, InDone, R>(
  self: Channel.Channel<
    Arr.NonEmptyReadonlyArray<string>,
    OutErr,
    OutDone,
    Arr.NonEmptyReadonlyArray<string>,
    NdjsonError | Schema.SchemaError | InErr,
    InDone,
    R
  >,
  options: {
    readonly inputSchema: In
    readonly outputSchema: Out
    readonly ignoreEmptyLines?: boolean | undefined
  }
): Channel.Channel<
  Arr.NonEmptyReadonlyArray<Out["Type"]>,
  NdjsonError | Schema.SchemaError | OutErr,
  OutDone,
  Arr.NonEmptyReadonlyArray<In["Type"]>,
  InErr,
  InDone,
  R | In["EncodingServices"] | Out["DecodingServices"]
> => ChannelSchema.duplexUnknown(duplexString(self, options), options))
