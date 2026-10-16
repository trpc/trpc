/**
 * OTLP Protobuf encoding for traces, metrics, and logs.
 *
 * Implements the protobuf wire format according to:
 * https://github.com/open-telemetry/opentelemetry-proto
 */

import type { AnyValue, KeyValue, Resource } from "../OtlpResource.ts"
import type { ResourceSpan, ScopeSpan, TraceData } from "../OtlpTracer.ts"
import * as Proto from "./protobuf.ts"

// Common types (opentelemetry.proto.common.v1)

/**
 * Encodes an AnyValue message.
 *
 * message AnyValue {
 *   oneof value {
 *     string string_value = 1;
 *     bool bool_value = 2;
 *     int64 int_value = 3;
 *     double double_value = 4;
 *     ArrayValue array_value = 5;
 *     KeyValueList kvlist_value = 6;
 *     bytes bytes_value = 7;
 *   }
 * }
 *
 * @internal
 */
export const encodeAnyValue = (value: AnyValue): Uint8Array => {
  if (value.stringValue !== undefined && value.stringValue !== null) {
    return Proto.stringField(1, value.stringValue)
  }
  if (value.boolValue !== undefined && value.boolValue !== null) {
    return Proto.boolField(2, value.boolValue)
  }
  if (value.intValue !== undefined && value.intValue !== null) {
    return Proto.varintField(3, BigInt(value.intValue))
  }
  if (value.doubleValue !== undefined && value.doubleValue !== null) {
    return Proto.doubleField(4, value.doubleValue)
  }
  if (value.arrayValue !== undefined) {
    return Proto.messageField(5, encodeArrayValue(value.arrayValue))
  }
  if (value.kvlistValue !== undefined) {
    return Proto.messageField(6, encodeKeyValueList(value.kvlistValue))
  }
  if (value.bytesValue !== undefined) {
    return Proto.lengthDelimitedField(7, value.bytesValue)
  }
  return new Uint8Array(0)
}

/**
 * Encodes an ArrayValue message.
 *
 * message ArrayValue {
 *   repeated AnyValue values = 1;
 * }
 *
 * @internal
 */
export const encodeArrayValue = (value: { values: ReadonlyArray<AnyValue> }): Uint8Array =>
  Proto.repeatedField(1, value.values, encodeAnyValue)

/**
 * Encodes a KeyValueList message.
 *
 * message KeyValueList {
 *   repeated KeyValue values = 1;
 * }
 *
 * @internal
 */
export const encodeKeyValueList = (value: { values: ReadonlyArray<KeyValue> }): Uint8Array =>
  Proto.repeatedField(1, value.values, encodeKeyValue)

/**
 * Encodes a KeyValue message.
 *
 * message KeyValue {
 *   string key = 1;
 *   AnyValue value = 2;
 * }
 *
 * @internal
 */
export const encodeKeyValue = (kv: KeyValue): Uint8Array =>
  Proto.concat(
    Proto.stringField(1, kv.key),
    Proto.messageField(2, encodeAnyValue(kv.value))
  )

/**
 * Encodes an InstrumentationScope message.
 *
 * message InstrumentationScope {
 *   string name = 1;
 *   string version = 2;
 *   repeated KeyValue attributes = 3;
 *   uint32 dropped_attributes_count = 4;
 * }
 *
 * @internal
 */
export const encodeInstrumentationScope = (scope: {
  readonly name: string
  readonly version?: string
  readonly attributes?: ReadonlyArray<KeyValue>
  readonly droppedAttributesCount?: number
}): Uint8Array =>
  Proto.concat(
    Proto.stringField(1, scope.name),
    Proto.optionalStringField(2, scope.version),
    scope.attributes ? Proto.repeatedField(3, scope.attributes, encodeKeyValue) : new Uint8Array(0),
    scope.droppedAttributesCount ? Proto.varintField(4, scope.droppedAttributesCount) : new Uint8Array(0)
  )

// Resource types (opentelemetry.proto.resource.v1)

/**
 * Encodes a Resource message.
 *
 * message Resource {
 *   repeated KeyValue attributes = 1;
 *   uint32 dropped_attributes_count = 2;
 * }
 *
 * @internal
 */
export const encodeResource = (resource: Resource): Uint8Array =>
  Proto.concat(
    Proto.repeatedField(1, resource.attributes, encodeKeyValue),
    resource.droppedAttributesCount > 0
      ? Proto.varintField(2, resource.droppedAttributesCount)
      : new Uint8Array(0)
  )

/**
 * Encodes a Status message.
 *
 * message Status {
 *   string message = 2;
 *   StatusCode code = 3;
 * }
 *
 * @internal
 */
export const encodeStatus = (status: {
  readonly code: number
  readonly message?: string
}): Uint8Array =>
  Proto.concat(
    Proto.optionalStringField(2, status.message),
    Proto.varintField(3, status.code)
  )

/**
 * Encodes an Event message.
 *
 * message Event {
 *   fixed64 time_unix_nano = 1;
 *   string name = 2;
 *   repeated KeyValue attributes = 3;
 *   uint32 dropped_attributes_count = 4;
 * }
 *
 * @internal
 */
export const encodeEvent = (event: {
  readonly timeUnixNano: string
  readonly name: string
  readonly attributes: ReadonlyArray<KeyValue>
  readonly droppedAttributesCount: number
}): Uint8Array =>
  Proto.concat(
    Proto.fixed64Field(1, BigInt(event.timeUnixNano)),
    Proto.stringField(2, event.name),
    Proto.repeatedField(3, event.attributes, encodeKeyValue),
    event.droppedAttributesCount > 0
      ? Proto.varintField(4, event.droppedAttributesCount)
      : new Uint8Array(0)
  )

/**
 * Encodes a Link message.
 *
 * message Link {
 *   bytes trace_id = 1;
 *   bytes span_id = 2;
 *   string trace_state = 3;
 *   repeated KeyValue attributes = 4;
 *   uint32 dropped_attributes_count = 5;
 *   fixed32 flags = 6;
 * }
 *
 * @internal
 */
export const encodeLink = (link: {
  readonly traceId: string
  readonly spanId: string
  readonly traceState?: string
  readonly attributes: ReadonlyArray<KeyValue>
  readonly droppedAttributesCount: number
  readonly flags?: number
}): Uint8Array =>
  Proto.concat(
    Proto.bytesFieldFromHex(1, link.traceId),
    Proto.bytesFieldFromHex(2, link.spanId),
    Proto.optionalStringField(3, link.traceState),
    Proto.repeatedField(4, link.attributes, encodeKeyValue),
    link.droppedAttributesCount > 0
      ? Proto.varintField(5, link.droppedAttributesCount)
      : new Uint8Array(0),
    link.flags !== undefined ? Proto.fixed32Field(6, link.flags) : new Uint8Array(0)
  )

/**
 * Encodes a Span message.
 *
 * message Span {
 *   bytes trace_id = 1;
 *   bytes span_id = 2;
 *   string trace_state = 3;
 *   bytes parent_span_id = 4;
 *   string name = 5;
 *   SpanKind kind = 6;
 *   fixed64 start_time_unix_nano = 7;
 *   fixed64 end_time_unix_nano = 8;
 *   repeated KeyValue attributes = 9;
 *   uint32 dropped_attributes_count = 10;
 *   repeated Event events = 11;
 *   uint32 dropped_events_count = 12;
 *   repeated Link links = 13;
 *   uint32 dropped_links_count = 14;
 *   Status status = 15;
 *   fixed32 flags = 16;
 * }
 *
 * @internal
 */
export const encodeSpan = (span: {
  readonly traceId: string
  readonly spanId: string
  readonly traceState?: string
  readonly parentSpanId?: string | undefined
  readonly name: string
  readonly kind: number
  readonly startTimeUnixNano: string
  readonly endTimeUnixNano: string
  readonly attributes: ReadonlyArray<KeyValue>
  readonly droppedAttributesCount: number
  readonly events: ReadonlyArray<{
    readonly timeUnixNano: string
    readonly name: string
    readonly attributes: ReadonlyArray<KeyValue>
    readonly droppedAttributesCount: number
  }>
  readonly droppedEventsCount: number
  readonly links: ReadonlyArray<{
    readonly traceId: string
    readonly spanId: string
    readonly traceState?: string
    readonly attributes: ReadonlyArray<KeyValue>
    readonly droppedAttributesCount: number
    readonly flags?: number
  }>
  readonly droppedLinksCount: number
  readonly status: {
    readonly code: number
    readonly message?: string
  }
  readonly flags?: number
}): Uint8Array =>
  Proto.concat(
    Proto.bytesFieldFromHex(1, span.traceId),
    Proto.bytesFieldFromHex(2, span.spanId),
    Proto.optionalStringField(3, span.traceState),
    span.parentSpanId !== undefined
      ? Proto.bytesFieldFromHex(4, span.parentSpanId)
      : new Uint8Array(0),
    Proto.stringField(5, span.name),
    Proto.varintField(6, span.kind),
    Proto.fixed64Field(7, BigInt(span.startTimeUnixNano)),
    Proto.fixed64Field(8, BigInt(span.endTimeUnixNano)),
    Proto.repeatedField(9, span.attributes, encodeKeyValue),
    span.droppedAttributesCount > 0
      ? Proto.varintField(10, span.droppedAttributesCount)
      : new Uint8Array(0),
    Proto.repeatedField(11, span.events, encodeEvent),
    span.droppedEventsCount > 0
      ? Proto.varintField(12, span.droppedEventsCount)
      : new Uint8Array(0),
    Proto.repeatedField(13, span.links, encodeLink),
    span.droppedLinksCount > 0
      ? Proto.varintField(14, span.droppedLinksCount)
      : new Uint8Array(0),
    Proto.messageField(15, encodeStatus(span.status)),
    span.flags !== undefined ? Proto.fixed32Field(16, span.flags) : new Uint8Array(0)
  )

/**
 * Encodes a ScopeSpans message.
 *
 * message ScopeSpans {
 *   InstrumentationScope scope = 1;
 *   repeated Span spans = 2;
 *   string schema_url = 3;
 * }
 *
 * @internal
 */
export const encodeScopeSpans = (scopeSpans: ScopeSpan): Uint8Array =>
  Proto.concat(
    Proto.messageField(1, encodeInstrumentationScope(scopeSpans.scope)),
    Proto.repeatedField(2, scopeSpans.spans, encodeSpan),
    Proto.optionalStringField(3, scopeSpans.schemaUrl)
  )

/**
 * Encodes a ResourceSpans message.
 *
 * message ResourceSpans {
 *   Resource resource = 1;
 *   repeated ScopeSpans scope_spans = 2;
 *   string schema_url = 3;
 * }
 *
 * @internal
 */
export const encodeResourceSpans = (resourceSpans: ResourceSpan): Uint8Array =>
  Proto.concat(
    Proto.messageField(1, encodeResource(resourceSpans.resource)),
    Proto.repeatedField(2, resourceSpans.scopeSpans, encodeScopeSpans),
    Proto.optionalStringField(3, resourceSpans.schemaUrl)
  )

/**
 * Encodes a TracesData message (top-level export request).
 *
 * message TracesData {
 *   repeated ResourceSpans resource_spans = 1;
 * }
 *
 * @internal
 */
export const encodeTracesData = (tracesData: TraceData): Uint8Array =>
  Proto.repeatedField(1, tracesData.resourceSpans, encodeResourceSpans)

/**
 * Encodes a NumberDataPoint message.
 *
 * message NumberDataPoint {
 *   repeated KeyValue attributes = 7;
 *   fixed64 start_time_unix_nano = 2;
 *   fixed64 time_unix_nano = 3;
 *   oneof value {
 *     double as_double = 4;
 *     sfixed64 as_int = 6;
 *   }
 *   repeated Exemplar exemplars = 5;
 *   uint32 flags = 8;
 * }
 *
 * @internal
 */
export const encodeNumberDataPoint = (point: {
  readonly attributes: ReadonlyArray<KeyValue>
  readonly startTimeUnixNano: string
  readonly timeUnixNano: string
  readonly asDouble?: number | undefined
  readonly asInt?: string | number | bigint | undefined
  readonly flags?: number | undefined
}): Uint8Array =>
  Proto.concat(
    Proto.fixed64Field(2, BigInt(point.startTimeUnixNano)),
    Proto.fixed64Field(3, BigInt(point.timeUnixNano)),
    point.asDouble !== undefined
      ? Proto.doubleField(4, point.asDouble)
      : new Uint8Array(0),
    point.asInt !== undefined
      ? Proto.fixed64Field(6, BigInt(point.asInt))
      : new Uint8Array(0),
    Proto.repeatedField(7, point.attributes, encodeKeyValue),
    point.flags !== undefined ? Proto.varintField(8, point.flags) : new Uint8Array(0)
  )

/**
 * Encodes a HistogramDataPoint message.
 *
 * message HistogramDataPoint {
 *   repeated KeyValue attributes = 9;
 *   fixed64 start_time_unix_nano = 2;
 *   fixed64 time_unix_nano = 3;
 *   fixed64 count = 4;
 *   optional double sum = 5;
 *   repeated fixed64 bucket_counts = 6;
 *   repeated double explicit_bounds = 7;
 *   optional double min = 11;
 *   optional double max = 12;
 *   uint32 flags = 10;
 * }
 *
 * @internal
 */
export const encodeHistogramDataPoint = (point: {
  readonly attributes: ReadonlyArray<KeyValue>
  readonly startTimeUnixNano: string
  readonly timeUnixNano: string
  readonly count: string | number | bigint
  readonly sum?: number | undefined
  readonly bucketCounts: ReadonlyArray<string | number | bigint>
  readonly explicitBounds: ReadonlyArray<number>
  readonly min?: number | undefined
  readonly max?: number | undefined
  readonly flags?: number | undefined
}): Uint8Array => {
  // Pack bucket counts as repeated fixed64
  const bucketCountsEncoded = Proto.concat(
    ...point.bucketCounts.map((count) => Proto.fixed64Field(6, BigInt(count)))
  )
  // Pack explicit bounds as repeated double
  const explicitBoundsEncoded = Proto.concat(
    ...point.explicitBounds.map((bound) => Proto.doubleField(7, bound))
  )
  return Proto.concat(
    Proto.fixed64Field(2, BigInt(point.startTimeUnixNano)),
    Proto.fixed64Field(3, BigInt(point.timeUnixNano)),
    Proto.fixed64Field(4, BigInt(point.count)),
    point.sum !== undefined ? Proto.doubleField(5, point.sum) : new Uint8Array(0),
    bucketCountsEncoded,
    explicitBoundsEncoded,
    Proto.repeatedField(9, point.attributes, encodeKeyValue),
    point.flags !== undefined ? Proto.varintField(10, point.flags) : new Uint8Array(0),
    point.min !== undefined ? Proto.doubleField(11, point.min) : new Uint8Array(0),
    point.max !== undefined ? Proto.doubleField(12, point.max) : new Uint8Array(0)
  )
}

/**
 * Encodes a Gauge message.
 *
 * message Gauge {
 *   repeated NumberDataPoint data_points = 1;
 * }
 *
 * @internal
 */
export const encodeGauge = (gauge: {
  readonly dataPoints: ReadonlyArray<Parameters<typeof encodeNumberDataPoint>[0]>
}): Uint8Array => Proto.repeatedField(1, gauge.dataPoints, encodeNumberDataPoint)

/**
 * Encodes a Sum message.
 *
 * message Sum {
 *   repeated NumberDataPoint data_points = 1;
 *   AggregationTemporality aggregation_temporality = 2;
 *   bool is_monotonic = 3;
 * }
 *
 * @internal
 */
export const encodeSum = (sum: {
  readonly dataPoints: ReadonlyArray<Parameters<typeof encodeNumberDataPoint>[0]>
  readonly aggregationTemporality: number
  readonly isMonotonic: boolean
}): Uint8Array =>
  Proto.concat(
    Proto.repeatedField(1, sum.dataPoints, encodeNumberDataPoint),
    Proto.varintField(2, sum.aggregationTemporality),
    Proto.boolField(3, sum.isMonotonic)
  )

/**
 * Encodes a Histogram message.
 *
 * message Histogram {
 *   repeated HistogramDataPoint data_points = 1;
 *   AggregationTemporality aggregation_temporality = 2;
 * }
 *
 * @internal
 */
export const encodeHistogram = (histogram: {
  readonly dataPoints: ReadonlyArray<Parameters<typeof encodeHistogramDataPoint>[0]>
  readonly aggregationTemporality: number
}): Uint8Array =>
  Proto.concat(
    Proto.repeatedField(1, histogram.dataPoints, encodeHistogramDataPoint),
    Proto.varintField(2, histogram.aggregationTemporality)
  )

/**
 * Encodes a Metric message.
 *
 * message Metric {
 *   string name = 1;
 *   string description = 2;
 *   string unit = 3;
 *   oneof data {
 *     Gauge gauge = 5;
 *     Sum sum = 7;
 *     Histogram histogram = 9;
 *     ExponentialHistogram exponential_histogram = 10;
 *     Summary summary = 11;
 *   }
 * }
 *
 * @internal
 */
export const encodeMetric = (metric: {
  readonly name: string
  readonly description?: string | undefined
  readonly unit?: string | undefined
  readonly gauge?: Parameters<typeof encodeGauge>[0] | undefined
  readonly sum?: Parameters<typeof encodeSum>[0] | undefined
  readonly histogram?: Parameters<typeof encodeHistogram>[0] | undefined
}): Uint8Array =>
  Proto.concat(
    Proto.stringField(1, metric.name),
    Proto.optionalStringField(2, metric.description),
    Proto.optionalStringField(3, metric.unit),
    metric.gauge !== undefined
      ? Proto.messageField(5, encodeGauge(metric.gauge))
      : new Uint8Array(0),
    metric.sum !== undefined
      ? Proto.messageField(7, encodeSum(metric.sum))
      : new Uint8Array(0),
    metric.histogram !== undefined
      ? Proto.messageField(9, encodeHistogram(metric.histogram))
      : new Uint8Array(0)
  )

/**
 * Encodes a ScopeMetrics message.
 *
 * message ScopeMetrics {
 *   InstrumentationScope scope = 1;
 *   repeated Metric metrics = 2;
 *   string schema_url = 3;
 * }
 *
 * @internal
 */
export const encodeScopeMetrics = (scopeMetrics: {
  readonly scope: { readonly name: string; readonly version?: string }
  readonly metrics: ReadonlyArray<Parameters<typeof encodeMetric>[0]>
  readonly schemaUrl?: string
}): Uint8Array =>
  Proto.concat(
    Proto.messageField(1, encodeInstrumentationScope(scopeMetrics.scope)),
    Proto.repeatedField(2, scopeMetrics.metrics, encodeMetric),
    Proto.optionalStringField(3, scopeMetrics.schemaUrl)
  )

/**
 * Encodes a ResourceMetrics message.
 *
 * message ResourceMetrics {
 *   Resource resource = 1;
 *   repeated ScopeMetrics scope_metrics = 2;
 *   string schema_url = 3;
 * }
 *
 * @internal
 */
export const encodeResourceMetrics = (resourceMetrics: {
  readonly resource: Resource
  readonly scopeMetrics: ReadonlyArray<Parameters<typeof encodeScopeMetrics>[0]>
  readonly schemaUrl?: string
}): Uint8Array =>
  Proto.concat(
    Proto.messageField(1, encodeResource(resourceMetrics.resource)),
    Proto.repeatedField(2, resourceMetrics.scopeMetrics, encodeScopeMetrics),
    Proto.optionalStringField(3, resourceMetrics.schemaUrl)
  )

/**
 * Encodes a MetricsData message (top-level export request).
 *
 * message MetricsData {
 *   repeated ResourceMetrics resource_metrics = 1;
 * }
 *
 * @internal
 */
export const encodeMetricsData = (metricsData: {
  readonly resourceMetrics: ReadonlyArray<Parameters<typeof encodeResourceMetrics>[0]>
}): Uint8Array => Proto.repeatedField(1, metricsData.resourceMetrics, encodeResourceMetrics)

/**
 * Encodes a LogRecord message.
 *
 * message LogRecord {
 *   fixed64 time_unix_nano = 1;
 *   fixed64 observed_time_unix_nano = 11;
 *   SeverityNumber severity_number = 2;
 *   string severity_text = 3;
 *   AnyValue body = 5;
 *   repeated KeyValue attributes = 6;
 *   uint32 dropped_attributes_count = 7;
 *   fixed32 flags = 8;
 *   bytes trace_id = 9;
 *   bytes span_id = 10;
 * }
 *
 * @internal
 */
export const encodeLogRecord = (record: {
  readonly timeUnixNano: string
  readonly observedTimeUnixNano?: string | undefined
  readonly severityNumber?: number | undefined
  readonly severityText?: string | undefined
  readonly body?: AnyValue | undefined
  readonly attributes: ReadonlyArray<KeyValue>
  readonly droppedAttributesCount?: number | undefined
  readonly flags?: number | undefined
  readonly traceId?: string | undefined
  readonly spanId?: string | undefined
}): Uint8Array =>
  Proto.concat(
    Proto.fixed64Field(1, BigInt(record.timeUnixNano)),
    record.severityNumber !== undefined
      ? Proto.varintField(2, record.severityNumber)
      : new Uint8Array(0),
    Proto.optionalStringField(3, record.severityText),
    record.body !== undefined
      ? Proto.messageField(5, encodeAnyValue(record.body))
      : new Uint8Array(0),
    Proto.repeatedField(6, record.attributes, encodeKeyValue),
    record.droppedAttributesCount !== undefined && record.droppedAttributesCount > 0
      ? Proto.varintField(7, record.droppedAttributesCount)
      : new Uint8Array(0),
    record.flags !== undefined ? Proto.fixed32Field(8, record.flags) : new Uint8Array(0),
    record.traceId !== undefined && record.traceId !== ""
      ? Proto.bytesFieldFromHex(9, record.traceId)
      : new Uint8Array(0),
    record.spanId !== undefined && record.spanId !== ""
      ? Proto.bytesFieldFromHex(10, record.spanId)
      : new Uint8Array(0),
    record.observedTimeUnixNano !== undefined
      ? Proto.fixed64Field(11, BigInt(record.observedTimeUnixNano))
      : new Uint8Array(0)
  )

/**
 * Encodes a ScopeLogs message.
 *
 * message ScopeLogs {
 *   InstrumentationScope scope = 1;
 *   repeated LogRecord log_records = 2;
 *   string schema_url = 3;
 * }
 *
 * @internal
 */
export const encodeScopeLogs = (scopeLogs: {
  readonly scope: { readonly name: string; readonly version?: string }
  readonly logRecords: ReadonlyArray<Parameters<typeof encodeLogRecord>[0]>
  readonly schemaUrl?: string
}): Uint8Array =>
  Proto.concat(
    Proto.messageField(1, encodeInstrumentationScope(scopeLogs.scope)),
    Proto.repeatedField(2, scopeLogs.logRecords, encodeLogRecord),
    Proto.optionalStringField(3, scopeLogs.schemaUrl)
  )

/**
 * Encodes a ResourceLogs message.
 *
 * message ResourceLogs {
 *   Resource resource = 1;
 *   repeated ScopeLogs scope_logs = 2;
 *   string schema_url = 3;
 * }
 *
 * @internal
 */
export const encodeResourceLogs = (resourceLogs: {
  readonly resource: Resource
  readonly scopeLogs: ReadonlyArray<Parameters<typeof encodeScopeLogs>[0]>
  readonly schemaUrl?: string
}): Uint8Array =>
  Proto.concat(
    Proto.messageField(1, encodeResource(resourceLogs.resource)),
    Proto.repeatedField(2, resourceLogs.scopeLogs, encodeScopeLogs),
    Proto.optionalStringField(3, resourceLogs.schemaUrl)
  )

/**
 * Encodes a LogsData message (top-level export request).
 *
 * message LogsData {
 *   repeated ResourceLogs resource_logs = 1;
 * }
 *
 * @internal
 */
export const encodeLogsData = (logsData: {
  readonly resourceLogs: ReadonlyArray<Parameters<typeof encodeResourceLogs>[0]>
}): Uint8Array => Proto.repeatedField(1, logsData.resourceLogs, encodeResourceLogs)
