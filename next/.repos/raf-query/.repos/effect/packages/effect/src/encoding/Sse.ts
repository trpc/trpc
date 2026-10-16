/**
 * Parses and renders Server-Sent Events text streams.
 *
 * Server-Sent Events, or SSE, are the text format used by `EventSource` for
 * one-way server-to-client updates. This module includes parsers, encoders,
 * channel helpers, and schema-based helpers for the `id`, `event`, and `data`
 * fields of each event.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type { NonEmptyReadonlyArray } from "../Array.ts"
import * as Arr from "../Array.ts"
import * as Cause from "../Cause.ts"
import * as Channel from "../Channel.ts"
import * as ChannelSchema from "../ChannelSchema.ts"
import * as Data from "../Data.ts"
import * as Duration from "../Duration.ts"
import * as Effect from "../Effect.ts"
import { hasProperty } from "../Predicate.ts"
import * as Pull from "../Pull.ts"
import * as Result from "../Result.ts"
import * as Schema from "../Schema.ts"
import type * as SchemaAST from "../SchemaAST.ts"
import * as SchemaTransformation from "../SchemaTransformation.ts"

const SseErrorTypeId = "~effect/encoding/Sse/SseError"

/**
 * Error reason raised when pending Server-Sent Events state exceeds the
 * configured maximum size.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class EventTooLarge extends Data.TaggedError("EventTooLarge")<{
  readonly maxEventSize: number
}> {
  override get message() {
    return `Pending SSE event exceeded the maximum size of ${this.maxEventSize}`
  }
}

/**
 * Union of Server-Sent Events decoding error reasons.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export type SseErrorReason = EventTooLarge

/**
 * Error raised when decoding a Server-Sent Events stream fails.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class SseError extends Data.TaggedError("SseError")<{
  readonly reason: SseErrorReason
}> {
  /**
   * Marks this value as an SSE decoding error.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [SseErrorTypeId] = SseErrorTypeId

  /**
   * Delegates the public message to the underlying SSE error reason.
   *
   * @stability unstable
   * @since 4.0.0
   */
  override get message() {
    return this.reason.message
  }
}

/**
 * Options for decoding Server-Sent Events streams.
 *
 * @stability unstable
 * @category decoding
 * @since 4.0.0
 */
export interface DecodeOptions {
  /**
   * Maximum number of string code units retained for a pending event. The default is 10 MiB.
   */
  readonly maxEventSize?: number | undefined
}

const defaultMaxEventSize = 10 * 1024 * 1024

/**
 * Creates a channel that parses Server-Sent Events text chunks into `Event` values.
 *
 * **Details**
 *
 * SSE `retry` directives are emitted as `Retry` failures so callers can
 * reconnect with the requested delay.
 *
 * @stability unstable
 * @category decoding
 * @since 4.0.0
 */
export const decode = <IE, Done>(options?: DecodeOptions): Channel.Channel<
  NonEmptyReadonlyArray<Event>,
  IE | Retry | SseError,
  Done,
  NonEmptyReadonlyArray<string>,
  IE,
  Done
> =>
  Channel.fromTransform((upstream, _scope) =>
    Effect.sync(() => {
      let buffer: Array<Event> = []
      let retry: Retry | undefined
      const parser = makeParser((event) => {
        if (event._tag === "Retry") {
          retry = event
        } else {
          buffer.push(event)
        }
      }, options)

      const pump = Effect.flatMap(upstream, (arr) => {
        for (let i = 0; i < arr.length; i++) {
          const error = parser.feed(arr[i])
          if (error !== undefined) {
            return Effect.fail(error)
          }
        }
        return Effect.void
      })

      return Effect.suspend(function loop(): Pull.Pull<NonEmptyReadonlyArray<Event>, IE | Retry | SseError, Done> {
        if (Arr.isArrayNonEmpty(buffer)) {
          const out = buffer
          buffer = []
          return Effect.succeed(out)
        } else if (retry) {
          return Effect.fail(retry)
        }
        return Effect.flatMap(pump, loop)
      })
    })
  )

/**
 * A constraint for schemas that can decode SSE events.
 *
 * @stability unstable
 * @category decoding
 * @since 4.0.0
 */
export interface EventCodec extends
  Schema.ConstraintCodec<
    any,
    {
      readonly id?: string | undefined
      readonly event?: string | undefined
      readonly data: string
    },
    unknown,
    unknown
  >
{}

/**
 * Creates an SSE decoder channel that decodes each parsed event with a schema.
 *
 * **Details**
 *
 * The schema receives `{ event, data, id? }`, with string `data`. Absent IDs are
 * omitted, even with default options: use `Schema.optional(Schema.String)`, not
 * `Schema.UndefinedOr(Schema.String)`, to accept events without an ID.
 *
 * With `onExcessProperty: "error"`, declare `event` (default: `"message"`) and
 * `id` if the stream carries IDs, including inherited IDs.
 *
 * @stability unstable
 * @category decoding
 * @since 4.0.0
 */
export const decodeSchema = <
  S extends EventCodec,
  IE,
  Done
>(
  schema: S,
  options?: DecodeOptions,
  parseOptions?: SchemaAST.ParseOptions
): Channel.Channel<
  NonEmptyReadonlyArray<S["Type"]>,
  IE | Retry | SseError | Schema.SchemaError,
  Done,
  NonEmptyReadonlyArray<string>,
  IE,
  Done,
  S["DecodingServices"]
> =>
  Channel.pipeTo(
    decode<IE, Done>(options),
    ChannelSchema.decode(
      Event.pipe(
        Schema.decodeTo(schema, transformEvent)
      ),
      parseOptions
    )()
  )

/**
 * Creates an SSE decoder channel that JSON-decodes each event `data` field with a schema.
 *
 * **Details**
 *
 * The output preserves the SSE `event` name and optional `id` while replacing
 * `data` with the decoded value.
 *
 * @stability unstable
 * @category decoding
 * @since 4.0.0
 */
export const decodeDataSchema = <Type, DecodingServices, IE, Done>(
  schema: Schema.ConstraintDecoder<Type, DecodingServices>,
  options?: DecodeOptions
): Channel.Channel<
  NonEmptyReadonlyArray<{
    readonly event: string
    readonly id: string | undefined
    readonly data: Type
  }>,
  IE | Retry | SseError | Schema.SchemaError,
  Done,
  NonEmptyReadonlyArray<string>,
  IE,
  Done,
  DecodingServices
> => {
  const eventSchema = Schema.Struct({
    ...EventEncoded.fields,
    data: Schema.fromJsonString(schema)
  })
  return Channel.pipeTo(
    decode<IE, Done>(options),
    Channel.map(
      ChannelSchema.decode(eventSchema)(),
      Arr.map((event) => ({ ...event, id: event.id }))
    )
  )
}

/**
 * Creates a stateful Server-Sent Events parser.
 *
 * **Details**
 *
 * Call `feed` with text chunks to parse `Event` and `Retry` values through the
 * callback, and call `reset` to clear any buffered event state. `feed` returns
 * an `SseError` if the pending event exceeds `maxEventSize`.
 *
 * @stability unstable
 * @category decoding
 * @since 4.0.0
 */
export function makeParser(onParse: (event: AnyEvent) => void, options?: DecodeOptions): Parser {
  const maxEventSize = options?.maxEventSize ?? defaultMaxEventSize

  // Processing state
  let isFirstChunk: boolean
  let buffer: string
  let startingPosition: number
  let startingFieldLength: number
  let discardTrailingNewline: boolean

  // Event state
  let lastEventId: string | undefined
  let eventName: string | undefined
  let data: string

  reset()
  return { feed, reset }

  function reset(): void {
    isFirstChunk = true
    buffer = ""
    startingPosition = 0
    startingFieldLength = -1
    discardTrailingNewline = false

    lastEventId = undefined
    eventName = undefined
    data = ""
  }

  function feed(chunk: string): SseError | undefined {
    buffer = buffer ? buffer + chunk : chunk

    // Strip any UTF-8 byte order mark (BOM) at the start of the stream.
    // Note that we do not strip any non - UTF8 BOM, as eventsource streams are
    // always decoded as UTF8 as per the specification.
    if (isFirstChunk && buffer.startsWith(BOM)) {
      buffer = buffer.slice(BOM.length)
    }

    isFirstChunk = false

    // Set up chunk-specific processing state
    const length = buffer.length
    let position = 0

    // Read the current buffer byte by byte
    while (position < length) {
      // EventSource allows for carriage return + line feed, which means we
      // need to ignore a linefeed character if the previous character was a
      // carriage return
      // @todo refactor to reduce nesting, consider checking previous byte?
      // @todo but consider multiple chunks etc
      if (discardTrailingNewline) {
        if (buffer[position] === "\n") {
          ++position
        }
        discardTrailingNewline = false
      }

      let lineLength = -1
      let fieldLength = startingFieldLength
      let character: string

      for (let index = position + startingPosition; lineLength < 0 && index < length; ++index) {
        character = buffer[index]
        if (character === ":" && fieldLength < 0) {
          fieldLength = index - position
        } else if (character === "\r") {
          discardTrailingNewline = true
          lineLength = index - position
        } else if (character === "\n") {
          lineLength = index - position
        }
      }

      if (lineLength < 0) {
        startingPosition = length - position
        startingFieldLength = fieldLength
        break
      } else {
        startingPosition = 0
        startingFieldLength = -1
      }

      parseEventStreamLine(buffer, position, fieldLength, lineLength)

      position += lineLength + 1
    }

    if (position === length) {
      // If we consumed the entire buffer to read the event, reset the buffer
      buffer = ""
    } else if (position > 0) {
      // If there are bytes left to process, set the buffer to the unprocessed
      // portion of the buffer only
      buffer = buffer.slice(position)
    }

    if (buffer.length + data.length > maxEventSize) {
      const error = new SseError({ reason: new EventTooLarge({ maxEventSize }) })
      reset()
      return error
    }
  }

  function parseEventStreamLine(
    lineBuffer: string,
    index: number,
    fieldLength: number,
    lineLength: number
  ) {
    if (lineLength === 0) {
      // We reached the last line of this event
      if (data.length > 0) {
        onParse({
          _tag: "Event",
          id: lastEventId,
          event: eventName || "message",
          data: data.slice(0, -1) // remove trailing newline
        })
        data = ""
      }
      eventName = undefined
      return
    }

    const noValue = fieldLength < 0
    const field = lineBuffer.slice(index, index + (noValue ? lineLength : fieldLength))
    let step = 0

    if (noValue) {
      step = lineLength
    } else if (lineBuffer[index + fieldLength + 1] === " ") {
      step = fieldLength + 2
    } else {
      step = fieldLength + 1
    }

    const position = index + step
    const valueLength = lineLength - step
    const value = lineBuffer.slice(position, position + valueLength).toString()

    if (field === "data") {
      data += value ? `${value}\n` : "\n"
    } else if (field === "event") {
      eventName = value
    } else if (field === "id" && !value.includes("\u0000")) {
      lastEventId = value
    } else if (field === "retry" && /^\d+$/.test(value)) {
      const retry = parseInt(value, 10)
      onParse(new Retry({ duration: Duration.millis(retry), lastEventId }))
    }
  }
}

const BOM = "\uFEFF"

/**
 * Stateful Server-Sent Events parser returned by `makeParser`.
 *
 * **Details**
 *
 * `feed` accepts additional text chunks and returns an `SseError` when the
 * configured pending event size is exceeded. `reset` clears buffered parser
 * state.
 *
 * @stability unstable
 * @category decoding
 * @since 4.0.0
 */
export interface Parser {
  feed(chunk: string): SseError | undefined
  reset(): void
}

/**
 * Creates a channel that encodes `Event` values as Server-Sent Events text.
 *
 * **Details**
 *
 * If the upstream channel fails with `Retry`, the retry directive is written and
 * the encoder completes.
 *
 * @stability unstable
 * @category encoding
 * @since 4.0.0
 */
export const encode = <IE, Done>(): Channel.Channel<
  NonEmptyReadonlyArray<string>,
  IE,
  void,
  NonEmptyReadonlyArray<Event>,
  IE | Retry,
  Done
> =>
  Channel.fromTransform((upstream, _scope) =>
    Effect.sync(() => {
      let done = false
      const pull = upstream.pipe(
        Effect.map(Arr.map(encoder.write)),
        Effect.catchFilter(Retry.filter as any, (retry: any) => {
          done = true
          return Effect.succeed(Arr.of(encoder.write(retry)))
        }),
        Pull.catchDone(() => Cause.done())
      ) as Pull.Pull<Arr.NonEmptyReadonlyArray<string>, IE>
      return Effect.suspend(() => done ? Cause.done() : pull)
    })
  )

/**
 * Creates an SSE encoder channel for values accepted by a schema.
 *
 * **Details**
 *
 * Values are schema-encoded to the untagged SSE event shape, transformed to
 * `Event`, and then written as Server-Sent Events text.
 *
 * @stability unstable
 * @category encoding
 * @since 4.0.0
 */
export const encodeSchema = <
  S extends EventCodec,
  IE,
  Done
>(schema: S): Channel.Channel<
  NonEmptyReadonlyArray<string>,
  IE | Schema.SchemaError,
  void,
  NonEmptyReadonlyArray<S["Type"]>,
  IE | Retry,
  Done,
  S["EncodingServices"]
> =>
  ChannelSchema.encode(Event.pipe(
    Schema.decodeTo(schema, transformEvent)
  ))<IE | Retry, Done>().pipe(
    Channel.pipeTo(encode())
  )

/**
 * Encoder capable of rendering an `Event` or `Retry` value as Server-Sent
 * Events text.
 *
 * @stability unstable
 * @category encoding
 * @since 4.0.0
 */
export interface Encoder {
  write(event: AnyEvent): string
}

/**
 * Tagged model for a Server-Sent Events message containing the event name, optional event ID, and string data payload.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Event {
  readonly _tag: "Event"
  readonly event: string
  readonly id: string | undefined
  readonly data: string
}

/**
 * Schema for the untagged Server-Sent Events payload shape containing an optional `id`, `event`, and string `data` fields.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export const EventEncoded: Schema.Struct<{
  readonly id: Schema.optional<Schema.String>
  readonly event: Schema.String
  readonly data: Schema.String
}> = Schema.Struct({
  id: Schema.optional(Schema.String),
  event: Schema.String,
  data: Schema.String
})

/**
 * Schema for the tagged Server-Sent Events message model that adds `_tag: "Event"` to the event name, optional event ID, and string data payload.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export const Event: Schema.Struct<{
  readonly _tag: Schema.tag<"Event">
  readonly id: Schema.UndefinedOr<Schema.String>
  readonly event: Schema.String
  readonly data: Schema.String
}> = Schema.Struct({
  _tag: Schema.tag("Event"),
  id: Schema.UndefinedOr(Schema.String),
  event: Schema.String,
  data: Schema.String
})

/**
 * Schema for transforming untagged SSE event payloads into tagged `Event`
 * models.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export const transformEvent = SchemaTransformation.transform<{
  readonly id?: string | undefined
  readonly event?: string | undefined
  readonly data: string
}, {
  readonly _tag: "Event"
  readonly id: string | undefined
  readonly event: string
  readonly data: string
}>({
  decode: (event) =>
    event.id === undefined
      ? { event: event.event, data: event.data }
      : { id: event.id, event: event.event, data: event.data },
  encode: (event) => ({
    _tag: "Event",
    id: event.id,
    event: event.event ?? "message",
    data: event.data
  })
})

/**
 * Untagged Server-Sent Events payload shape containing the event name, optional event ID, and string data payload.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface EventEncoded {
  readonly event: string
  readonly id?: string | undefined
  readonly data: string
}

const RetryTypeId = "~effect/encoding/Sse/Retry" as const

/**
 * Represents a Server-Sent Events retry directive.
 *
 * **Details**
 *
 * Decoders surface this value as a failure to request reconnection after
 * `duration`; encoders serialize an upstream `Retry` failure as a `retry:` line.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export class Retry extends Data.TaggedClass("Retry")<{
  readonly duration: Duration.Duration
  readonly lastEventId: string | undefined
}> {
  /**
   * Marks this value as an SSE retry directive for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [RetryTypeId]: typeof RetryTypeId = RetryTypeId
  /**
   * Returns `true` when the value is an SSE retry directive.
   *
   * @stability unstable
   * @since 4.0.0
   */
  static is(u: unknown): u is Retry {
    return hasProperty(u, RetryTypeId)
  }
  /**
   * Separates SSE retry directives from regular event values.
   *
   * @stability unstable
   * @since 4.0.0
   */
  static filter<A>(u: A): Result.Result<Retry, Exclude<A, Retry>> {
    return Retry.is(u) ? Result.succeed(u) : Result.fail(u as any)
  }
}

/**
 * Union of SSE values that can be rendered by an `Encoder`: regular events and
 * retry directives.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type AnyEvent = Event | Retry

/**
 * Default Server-Sent Events encoder.
 *
 * **Details**
 *
 * It renders `Event` values as `id`, `event`, and `data` lines and renders
 * `Retry` values as `retry:` directives.
 *
 * @stability unstable
 * @category encoding
 * @since 4.0.0
 */
export const encoder: Encoder = {
  write(event: AnyEvent): string {
    switch (event._tag) {
      case "Event": {
        let data = ""
        if (event.id !== undefined) {
          data += `id: ${event.id}\n`
        }
        if (event.event !== "message") {
          data += `event: ${event.event}\n`
        }
        data += `data: ${event.data.replace(/\n/g, "\ndata: ")}\n`
        return data + "\n"
      }
      case "Retry": {
        return `retry: ${Duration.toMillis(event.duration)}\n\n`
      }
    }
  }
}
