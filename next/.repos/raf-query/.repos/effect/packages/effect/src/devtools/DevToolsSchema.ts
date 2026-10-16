/**
 * Defines the experimental wire schema used by the Effect devtools protocol.
 *
 * The module contains the serialized message shapes exchanged between devtools
 * clients and servers: span snapshots, span events, metric snapshots,
 * heartbeats, and request/response unions. Use these schemas at protocol
 * boundaries to encode, decode, or validate custom transports that need to
 * interoperate with the built-in unstable devtools client and server.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Exit from "../Exit.ts"
import { identity } from "../Function.ts"
import type * as Option from "../Option.ts"
import * as Schema from "../Schema.ts"
import * as SchemaTransformation from "../SchemaTransformation.ts"

/**
 * Schema for a span status representing a span that has started but not yet
 * ended.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const SpanStatusStarted = Schema.Struct({
  _tag: Schema.tag("Started"),
  startTime: Schema.BigInt
})

/**
 * Type of a span status representing a span that has started but not yet ended.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export type SpanStatusStarted = Schema.Schema.Type<typeof SpanStatusStarted>

/**
 * Schema for a span status representing an ended span, including start time,
 * end time, and encoded exit status. Encoding drops success values with
 * `Exit.asVoid`.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const SpanStatusEnded = Schema.Struct({
  _tag: Schema.tag("Ended"),
  startTime: Schema.BigInt,
  endTime: Schema.BigInt,
  exit: Schema.Exit(Schema.Void, Schema.Defect({ includeStack: true }), Schema.Defect({ includeStack: true })).pipe(
    Schema.decodeTo(
      Schema.Exit(Schema.Unknown, Schema.Unknown, Schema.Unknown),
      SchemaTransformation.transform({
        decode: identity,
        encode: Exit.asVoid
      })
    )
  )
})

/**
 * Type of a span status representing an ended span with start time, end time,
 * and exit status.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export type SpanStatusEnded = Schema.Schema.Type<typeof SpanStatusEnded>

/**
 * Schema for devtools span status, either started or ended.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const SpanStatus = Schema.Union([SpanStatusStarted, SpanStatusEnded])

/**
 * Type of a devtools span status, either started or ended.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export type SpanStatus = Schema.Schema.Type<typeof SpanStatus>

/**
 * Serialized parent span context for a span created outside the current
 * devtools span tree.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export interface ExternalSpan {
  readonly _tag: "ExternalSpan"
  readonly spanId: string
  readonly traceId: string
  readonly sampled: boolean
}

/**
 * Schema for an external parent span context containing span id, trace id, and
 * sampling flag.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ExternalSpan: Schema.Codec<ExternalSpan> = Schema.Struct({
  _tag: Schema.tag("ExternalSpan"),
  spanId: Schema.String,
  traceId: Schema.String,
  sampled: Schema.Boolean
})

/**
 * Telemetry payload for an Effect span sent to devtools, including identity,
 * attributes, status, sampling flag, and optional parent span.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export interface Span {
  readonly _tag: "Span"
  readonly spanId: string
  readonly traceId: string
  readonly name: string
  readonly sampled: boolean
  readonly attributes: ReadonlyMap<string, unknown>
  readonly status: SpanStatus
  readonly parent: Option.Option<ParentSpan>
}

/**
 * Schema for an Effect span telemetry payload sent to devtools.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Span: Schema.Codec<Span> = Schema.Struct({
  _tag: Schema.tag("Span"),
  spanId: Schema.String,
  traceId: Schema.String,
  name: Schema.String,
  sampled: Schema.Boolean,
  attributes: Schema.ReadonlyMap(Schema.String, Schema.Any),
  status: SpanStatus,
  parent: Schema.Option(Schema.suspend(() => ParentSpan))
})

/**
 * Schema for a named event emitted by a span, including trace id, span id,
 * start time, and optional attributes.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const SpanEvent = Schema.Struct({
  _tag: Schema.tag("SpanEvent"),
  traceId: Schema.String,
  spanId: Schema.String,
  name: Schema.String,
  startTime: Schema.BigInt,
  attributes: Schema.UndefinedOr(Schema.Record(Schema.String, Schema.Any))
})

/**
 * Type of a named event emitted by a span and sent to devtools.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export type SpanEvent = Schema.Schema.Type<typeof SpanEvent>

/**
 * Type of a span parent, represented either by a devtools `Span` payload or an
 * `ExternalSpan` context.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export type ParentSpan = Span | ExternalSpan

/**
 * Schema for a span parent, either a full devtools `Span` payload or an
 * `ExternalSpan` context.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ParentSpan = Schema.Union([Span, ExternalSpan])

/**
 * Schema for the devtools heartbeat request sent by the client.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Ping = Schema.Struct({
  _tag: Schema.tag("Ping")
})

/**
 * Type of the devtools heartbeat request sent by the client.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export type Ping = Schema.Schema.Type<typeof Ping>

/**
 * Schema for the devtools heartbeat response.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Pong = Schema.Struct({
  _tag: Schema.tag("Pong")
})

/**
 * Type of the devtools heartbeat response.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export type Pong = Schema.Schema.Type<typeof Pong>

/**
 * Schema for a devtools request asking the client to send a metrics snapshot.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const MetricsRequest = Schema.Struct({
  _tag: Schema.tag("MetricsRequest")
})

/**
 * Type of a devtools request asking the client to send a metrics snapshot.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export type MetricsRequest = Schema.Schema.Type<typeof MetricsRequest>

/**
 * Schema for a metric label key/value pair in a devtools metrics snapshot.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const MetricLabel = Schema.Struct({
  key: Schema.String,
  value: Schema.String
})

/**
 * Type of a metric label key/value pair in a devtools metrics snapshot.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export type MetricLabel = Schema.Schema.Type<typeof MetricLabel>

const metric = <Type extends string, State extends Schema.Constraint>(type: Type, state: State) =>
  Schema.Struct({
    id: Schema.String,
    type: Schema.tag(type),
    description: Schema.UndefinedOr(Schema.String),
    attributes: Schema.UndefinedOr(Schema.Record(Schema.String, Schema.String)),
    state
  })

/**
 * Schema for a counter metric snapshot, including the count and whether updates
 * are incremental.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Counter = metric(
  "Counter",
  Schema.Struct({
    count: Schema.Union([Schema.Number, Schema.BigInt]),
    incremental: Schema.Boolean
  })
)

/**
 * Type of a devtools counter metric snapshot.
 *
 * **Details**
 *
 * The state contains the current count and whether the counter reports
 * incremental updates.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export type Counter = Schema.Schema.Type<typeof Counter>

/**
 * Schema for a devtools frequency metric snapshot.
 *
 * **Details**
 *
 * The metric state records occurrence counts by string key.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Frequency = metric(
  "Frequency",
  Schema.Struct({
    occurrences: Schema.ReadonlyMap(Schema.String, Schema.Natural)
  })
)

/**
 * Type of a devtools frequency metric snapshot.
 *
 * **Details**
 *
 * The state maps observed string values to occurrence counts.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export type Frequency = Schema.Schema.Type<typeof Frequency>

/**
 * Schema for a devtools gauge metric snapshot.
 *
 * **Details**
 *
 * The metric state contains the current numeric or bigint value.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Gauge = metric(
  "Gauge",
  Schema.Struct({
    value: Schema.Union([Schema.Number, Schema.BigInt])
  })
)

/**
 * Type of a devtools gauge metric snapshot.
 *
 * **Details**
 *
 * The state contains the current numeric or bigint value.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export type Gauge = Schema.Schema.Type<typeof Gauge>

/**
 * Schema for a devtools histogram metric snapshot.
 *
 * **Details**
 *
 * The metric state includes bucket counts plus the total count, minimum,
 * maximum, and sum.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Histogram = metric(
  "Histogram",
  Schema.Struct({
    buckets: Schema.Array(Schema.Tuple([Schema.Number, Schema.Natural])),
    count: Schema.Natural,
    min: Schema.Number,
    max: Schema.Number,
    sum: Schema.Number
  })
)

/**
 * Type of a devtools histogram metric snapshot.
 *
 * **Details**
 *
 * The state includes bucket counts plus the total count, minimum, maximum, and
 * sum.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export type Histogram = Schema.Schema.Type<typeof Histogram>

/**
 * Schema for a devtools summary metric snapshot.
 *
 * **Details**
 *
 * The metric state contains quantile values plus the total count, minimum,
 * maximum, and sum.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Summary = metric(
  "Summary",
  Schema.Struct({
    quantiles: Schema.Array(
      Schema.Tuple([
        Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
        Schema.UndefinedOr(Schema.Number)
      ])
    ),
    count: Schema.Natural,
    min: Schema.Number,
    max: Schema.Number,
    sum: Schema.Number
  })
)

/**
 * Type of a devtools summary metric snapshot.
 *
 * **Details**
 *
 * The state contains quantile values plus the total count, minimum, maximum,
 * and sum.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export type Summary = Schema.Schema.Type<typeof Summary>

/**
 * Schema for any devtools metric snapshot.
 *
 * **Details**
 *
 * Accepted metric kinds are counters, frequencies, gauges, histograms, and
 * summaries.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Metric = Schema.Union([Counter, Frequency, Gauge, Histogram, Summary])

/**
 * Type of any devtools metric snapshot.
 *
 * **Details**
 *
 * The union covers counters, frequencies, gauges, histograms, and summaries.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export type Metric = Schema.Schema.Type<typeof Metric>

/**
 * Schema for a devtools protocol message containing the current metric
 * snapshots.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const MetricsSnapshot = Schema.Struct({
  _tag: Schema.tag("MetricsSnapshot"),
  metrics: Schema.Array(Metric)
})

/**
 * Type of a devtools protocol message containing the current metric snapshots.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export type MetricsSnapshot = Schema.Schema.Type<typeof MetricsSnapshot>

/**
 * Schema for devtools protocol requests accepted by the server.
 *
 * **Details**
 *
 * Requests include heartbeat pings, spans, span events, and metric snapshots.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Request = Schema.Union([Ping, Span, SpanEvent, MetricsSnapshot])

/**
 * Type of devtools protocol requests accepted by the server.
 *
 * **Details**
 *
 * Requests include heartbeat pings, spans, span events, and metric snapshots.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export type Request = Schema.Schema.Type<typeof Request>

/**
 * Namespace containing helper types for devtools protocol requests.
 *
 * @stability unstable
 * @since 4.0.0
 */
export declare namespace Request {
  /**
   * Devtools request messages excluding heartbeat pings.
   *
   * **Details**
   *
   * `DevToolsServer` handles `Ping` internally and exposes only these requests
   * to client handlers.
   *
   * @stability unstable
   * @since 4.0.0
   */
  export type WithoutPing = Exclude<Request, { readonly _tag: "Ping" }>
}

/**
 * Schema for devtools protocol responses sent by the server.
 *
 * **Details**
 *
 * Responses include heartbeat pongs and requests for metric snapshots.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Response = Schema.Union([Pong, MetricsRequest])

/**
 * Type of devtools protocol responses sent by the server.
 *
 * **Details**
 *
 * Responses include heartbeat pongs and requests for metric snapshots.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export type Response = Schema.Schema.Type<typeof Response>

/**
 * Namespace containing helper types for devtools protocol responses.
 *
 * @stability unstable
 * @since 4.0.0
 */
export declare namespace Response {
  /**
   * Devtools response messages excluding heartbeat pongs.
   *
   * **Details**
   *
   * `DevToolsServer` sends `Pong` internally and accepts only these responses
   * from client handlers.
   *
   * @stability unstable
   * @since 4.0.0
   */
  export type WithoutPong = Exclude<Response, { readonly _tag: "Pong" }>
}
