/**
 * Schema adapters for `Channel` boundaries. The helpers encode typed channel
 * chunks before they cross an encoded boundary, decode encoded chunks before
 * application code receives them, and wrap bidirectional channels so callers
 * work with schema-typed input and output while the inner channel uses encoded
 * values.
 *
 * @since 4.0.0
 */
import type * as Arr from "./Array.ts"
import * as Channel from "./Channel.ts"
import * as Effect from "./Effect.ts"
import { dual } from "./Function.ts"
import * as Schema from "./Schema.ts"
import type * as SchemaAST from "./SchemaAST.ts"

/**
 * Creates a channel that encodes non-empty chunks of schema values into the
 * schema's encoded representation.
 *
 * **When to use**
 *
 * Use to encode typed channel input into the schema's encoded representation
 * before passing chunks to an encoded downstream boundary.
 *
 * **Details**
 *
 * Encoding failures are emitted as `SchemaError`, and any encoding services
 * required by the schema become channel requirements.
 *
 * @see {@link encodeUnknown} for encoded output chunks that should be typed as `unknown`
 * @see {@link decode} for the inverse channel that decodes encoded chunks into schema values
 *
 * @category constructors
 * @since 4.0.0
 */
export const encode = <S extends Schema.Constraint>(
  schema: S
) =>
<IE = never, Done = unknown>(): Channel.Channel<
  Arr.NonEmptyReadonlyArray<S["Encoded"]>,
  IE | Schema.SchemaError,
  Done,
  Arr.NonEmptyReadonlyArray<S["Type"]>,
  IE,
  Done,
  S["EncodingServices"]
> => {
  const encode = Schema.encodeEffect(Schema.NonEmptyArray(schema))
  return Channel.fromTransform((upstream, _scope) => Effect.succeed(Effect.flatMap(upstream, (chunk) => encode(chunk))))
}

/**
 * Creates an `encode` channel variant whose encoded output chunks are typed as
 * `unknown`.
 *
 * **When to use**
 *
 * Use when a channel boundary should encode typed input chunks while the encoded
 * output representation is intentionally untyped.
 *
 * @see {@link encode} for the variant that preserves the schema encoded type
 *
 * @category constructors
 * @since 4.0.0
 */
export const encodeUnknown: <S extends Schema.Constraint>(
  schema: S
) => <IE = never, Done = unknown>() => Channel.Channel<
  Arr.NonEmptyReadonlyArray<unknown>,
  IE | Schema.SchemaError,
  Done,
  Arr.NonEmptyReadonlyArray<S["Type"]>,
  IE,
  Done,
  S["EncodingServices"]
> = encode

/**
 * Creates a channel that decodes non-empty chunks from the schema's encoded
 * representation into schema values.
 *
 * **When to use**
 *
 * Use to validate and decode encoded channel output into typed schema values
 * before application code consumes it.
 *
 * **Details**
 *
 * Decoding failures are emitted as `SchemaError`, and any decoding services
 * required by the schema become channel requirements.
 *
 * @see {@link decodeUnknown} for boundaries where the encoded input side is intentionally untyped
 * @see {@link encode} for the inverse adapter that encodes typed schema values
 *
 * @category constructors
 * @since 4.0.0
 */
export const decode = <S extends Schema.Constraint>(
  schema: S,
  options?: SchemaAST.ParseOptions
) =>
<IE = never, Done = unknown>(): Channel.Channel<
  Arr.NonEmptyReadonlyArray<S["Type"]>,
  IE | Schema.SchemaError,
  Done,
  Arr.NonEmptyReadonlyArray<S["Encoded"]>,
  IE,
  Done,
  S["DecodingServices"]
> => {
  const decode = Schema.decodeEffect(Schema.NonEmptyArray(schema), options)
  return Channel.fromTransform((upstream, _scope) => Effect.succeed(Effect.flatMap(upstream, (chunk) => decode(chunk))))
}

/**
 * Creates a `decode` channel variant for schema-decoding channel boundaries.
 *
 * **When to use**
 *
 * Use when you need an intentionally unknown or untyped encoded input while
 * keeping only the decoded output statically typed according to the schema.
 *
 * **Details**
 *
 * The channel decodes non-empty encoded chunks into schema values, emits
 * `SchemaError` when decoding fails, and requires the schema's decoding
 * services.
 *
 * @see {@link decode} for the typed variant that preserves the schema's encoded type
 *
 * @category constructors
 * @since 4.0.0
 */
export const decodeUnknown: <S extends Schema.Constraint>(
  schema: S,
  options?: SchemaAST.ParseOptions
) => <IE = never, Done = unknown>() => Channel.Channel<
  Arr.NonEmptyReadonlyArray<S["Type"]>,
  IE | Schema.SchemaError,
  Done,
  Arr.NonEmptyReadonlyArray<unknown>,
  IE,
  Done,
  S["DecodingServices"]
> = decode

/**
 * Wraps a channel so callers work with typed input and output chunks while the
 * wrapped channel uses encoded chunks.
 *
 * **When to use**
 *
 * Use to expose typed input and output at a bidirectional channel boundary
 * while the wrapped channel continues to operate on schema-encoded chunks.
 *
 * **Details**
 *
 * Values sent into the resulting channel are encoded with `inputSchema` before
 * reaching the wrapped channel. Values emitted by the wrapped channel are
 * decoded with `outputSchema` before they are emitted downstream. Schema
 * failures are surfaced as `SchemaError`.
 *
 * @see {@link duplexUnknown} for the variant whose encoded side is intentionally untyped
 * @see {@link encode} for encoding typed chunks at one-way channel boundaries
 * @see {@link decode} for decoding encoded chunks at one-way channel boundaries
 *
 * @category combinators
 * @since 4.0.0
 */
export const duplex: {
  <In extends Schema.Constraint, Out extends Schema.Constraint>(options: {
    readonly inputSchema: In
    readonly outputSchema: Out
  }): <OutErr, OutDone, InErr, InDone, R>(
    self: Channel.Channel<
      Arr.NonEmptyReadonlyArray<Out["Encoded"]>,
      OutErr,
      OutDone,
      Arr.NonEmptyReadonlyArray<In["Encoded"]>,
      Schema.SchemaError | InErr,
      InDone,
      R
    >
  ) => Channel.Channel<
    Arr.NonEmptyReadonlyArray<Out["Type"]>,
    Schema.SchemaError | OutErr,
    OutDone,
    Arr.NonEmptyReadonlyArray<In["Type"]>,
    InErr,
    InDone,
    R | In["EncodingServices"] | Out["DecodingServices"]
  >
  <Out extends Schema.Constraint, OutErr, OutDone, In extends Schema.Constraint, InErr, InDone, R>(
    self: Channel.Channel<
      Arr.NonEmptyReadonlyArray<Out["Encoded"]>,
      OutErr,
      OutDone,
      Arr.NonEmptyReadonlyArray<In["Encoded"]>,
      Schema.SchemaError | InErr,
      InDone,
      R
    >,
    options: {
      readonly inputSchema: In
      readonly outputSchema: Out
    }
  ): Channel.Channel<
    Arr.NonEmptyReadonlyArray<Out["Type"]>,
    Schema.SchemaError | OutErr,
    OutDone,
    Arr.NonEmptyReadonlyArray<In["Type"]>,
    InErr,
    InDone,
    R | In["EncodingServices"] | Out["DecodingServices"]
  >
} = dual(2, <Out extends Schema.Constraint, OutErr, OutDone, In extends Schema.Constraint, InErr, InDone, R>(
  self: Channel.Channel<
    Arr.NonEmptyReadonlyArray<Out["Encoded"]>,
    OutErr,
    OutDone,
    Arr.NonEmptyReadonlyArray<In["Encoded"]>,
    Schema.SchemaError | InErr,
    InDone,
    R
  >,
  options: {
    readonly inputSchema: In
    readonly outputSchema: Out
  }
): Channel.Channel<
  Arr.NonEmptyReadonlyArray<Out["Type"]>,
  Schema.SchemaError | OutErr,
  OutDone,
  Arr.NonEmptyReadonlyArray<In["Type"]>,
  InErr,
  InDone,
  R | In["EncodingServices"] | Out["DecodingServices"]
> =>
  encode(options.inputSchema)<InErr, InDone>().pipe(
    Channel.pipeTo(self),
    Channel.pipeTo(decode(options.outputSchema)())
  ))

/**
 * Wraps a bidirectional channel whose encoded chunks are typed as `unknown`.
 *
 * **When to use**
 *
 * Use when you need a bidirectional channel to cross an encoded boundary whose
 * chunk types are intentionally erased, while callers send and receive
 * schema-typed chunks.
 *
 * **Details**
 *
 * The resulting channel accepts typed input chunks, encodes them with
 * `inputSchema`, decodes unknown output chunks with `outputSchema`, and
 * surfaces schema failures as `SchemaError`.
 *
 * @see {@link duplex} for the variant that preserves the schema encoded types on the wrapped channel
 *
 * @category combinators
 * @since 4.0.0
 */
export const duplexUnknown: {
  <In extends Schema.Constraint, Out extends Schema.Constraint>(options: {
    readonly inputSchema: In
    readonly outputSchema: Out
  }): <OutErr, OutDone, InErr, InDone, R>(
    self: Channel.Channel<
      Arr.NonEmptyReadonlyArray<unknown>,
      OutErr,
      OutDone,
      Arr.NonEmptyReadonlyArray<any>,
      Schema.SchemaError | InErr,
      InDone,
      R
    >
  ) => Channel.Channel<
    Arr.NonEmptyReadonlyArray<Out["Type"]>,
    Schema.SchemaError | OutErr,
    OutDone,
    Arr.NonEmptyReadonlyArray<In["Type"]>,
    InErr,
    InDone,
    R | In["EncodingServices"] | Out["DecodingServices"]
  >
  <Out extends Schema.Constraint, OutErr, OutDone, In extends Schema.Constraint, InErr, InDone, R>(
    self: Channel.Channel<
      Arr.NonEmptyReadonlyArray<unknown>,
      OutErr,
      OutDone,
      Arr.NonEmptyReadonlyArray<any>,
      Schema.SchemaError | InErr,
      InDone,
      R
    >,
    options: {
      readonly inputSchema: In
      readonly outputSchema: Out
    }
  ): Channel.Channel<
    Arr.NonEmptyReadonlyArray<Out["Type"]>,
    Schema.SchemaError | OutErr,
    OutDone,
    Arr.NonEmptyReadonlyArray<In["Type"]>,
    InErr,
    InDone,
    R | In["EncodingServices"] | Out["DecodingServices"]
  >
} = duplex
