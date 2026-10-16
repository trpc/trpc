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
import * as Channel from "../Channel.ts"
import * as ChannelSchema from "../ChannelSchema.ts"
import * as Data from "../Data.ts"
import * as Effect from "../Effect.ts"
import { dual, identity } from "../Function.ts"
import * as Predicate from "../Predicate.ts"
import type * as Schema from "../Schema.ts"

const NdjsonErrorTypeId = "~effect/encoding/Ndjson/NdjsonError"

const encoder = new TextEncoder()

/**
 * Error raised when NDJSON encoding or decoding fails.
 *
 * **Details**
 *
 * The `kind` field identifies whether the failure happened while packing or
 * unpacking, and `cause` preserves the original error.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class NdjsonError extends Data.TaggedError("NdjsonError")<{
  readonly kind: "Pack" | "Unpack"
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
 * Lines may span input chunks.
 *
 * **Gotchas**
 *
 * Set `ignoreEmptyLines` to skip blank lines before calling `JSON.parse`;
 * otherwise blank lines are parsed and fail as invalid JSON.
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
> => {
  const lines = Channel.splitLines<IE, Done>().pipe(
    options?.ignoreEmptyLines === true ?
      Channel.filterArray((line) => line.length > 0) :
      identity
  )
  return Channel.mapEffect(lines, (chunk) => {
    try {
      return Effect.succeed(Arr.map(chunk, (line) => JSON.parse(line)))
    } catch (cause) {
      return Effect.fail(new NdjsonError({ kind: "Unpack", cause }))
    }
  })
}

/**
 * Creates a channel that decodes UTF-8 byte chunks and parses them as NDJSON.
 *
 * **Details**
 *
 * Lines may span input chunks, and `ignoreEmptyLines` controls whether blank
 * lines are skipped before JSON parsing.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const decode = <IE = never, Done = unknown>(options?: {
  readonly ignoreEmptyLines?: boolean | undefined
}): Channel.Channel<
  Arr.NonEmptyReadonlyArray<unknown>,
  IE | NdjsonError,
  Done,
  Arr.NonEmptyReadonlyArray<Uint8Array>,
  IE,
  Done
> => {
  return Channel.pipeTo(Channel.decodeText(), decodeString(options))
}

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
