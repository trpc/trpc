/**
 * Exports Effect tracing spans over OTLP/HTTP.
 *
 * This module creates a `Tracer.Tracer` backed by the shared OTLP batch
 * exporter, so spans created by Effect tracing APIs can be sent to an
 * OpenTelemetry Collector, vendor endpoint, or local collector. Exported spans
 * include identifiers, parent links, attributes, events, timing, kind, and
 * status information. Use the constructor directly or install it through the
 * provided layer.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Cause from "../Cause.ts"
import * as Config from "../Config.ts"
import type * as Context from "../Context.ts"
import * as Duration from "../Duration.ts"
import * as Effect from "../Effect.ts"
import * as Hex from "../encoding/Hex.ts"
import type * as Exit from "../Exit.ts"
import { flow } from "../Function.ts"
import type * as Headers from "../http/Headers.ts"
import type * as HttpClient from "../http/HttpClient.ts"
import * as Layer from "../Layer.ts"
import * as Option from "../Option.ts"
import type * as Scope from "../Scope.ts"
import * as Tracer from "../Tracer.ts"
import type { ExtractTag } from "../Types.ts"
import * as OtlpEnv from "./internal/otlpEnv.ts"
import * as Exporter from "./OtlpExporter.ts"
import type { KeyValue, Resource } from "./OtlpResource.ts"
import { entriesToAttributes } from "./OtlpResource.ts"
import * as OtlpResource from "./OtlpResource.ts"
import { OtlpSerialization } from "./OtlpSerialization.ts"

/**
 * Creates a `Tracer` that exports ended sampled spans to an OTLP traces endpoint.
 *
 * **Details**
 *
 * Spans are batched using the configured interval and batch size, serialized
 * with `OtlpSerialization`, and flushed when the surrounding `Scope` closes.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make: (
  options: {
    readonly url: string
    readonly resource?: {
      readonly serviceName?: string | undefined
      readonly serviceVersion?: string | undefined
      readonly attributes?: Record<string, unknown>
    } | undefined
    readonly headers?: Headers.Input | undefined
    readonly exportInterval?: Duration.Input | undefined
    readonly maxBatchSize?: number | undefined
    readonly context?: (<X>(primitive: Tracer.EffectPrimitive<X>, span: Tracer.AnySpan) => X) | undefined
    readonly shutdownTimeout?: Duration.Input | undefined
  }
) => Effect.Effect<
  Tracer.Tracer,
  never,
  Exporter.Flusher | OtlpSerialization | HttpClient.HttpClient | Scope.Scope
> = Effect.fnUntraced(function*(options) {
  const otelResource = yield* OtlpResource.fromConfig(options.resource)
  const serialization = yield* OtlpSerialization
  const scope: Scope = {
    name: OtlpResource.serviceNameUnsafe(otelResource)
  }

  const exporter = yield* Exporter.make({
    label: "OtlpTracer",
    url: options.url,
    headers: options.headers,
    exportInterval: options.exportInterval ?? Duration.seconds(5),
    maxBatchSize: options.maxBatchSize ?? 1000,
    body(spans) {
      const data: TraceData = {
        resourceSpans: [{
          resource: otelResource,
          scopeSpans: [{
            scope,
            spans
          }]
        }]
      }
      return [serialization.traces(data), Effect.void]
    },
    shutdownTimeout: options.shutdownTimeout ?? Duration.seconds(3)
  })

  function exportFn(span: SpanImpl) {
    if (!span.sampled) return
    exporter.push(makeOtlpSpan(span))
  }

  return Tracer.make({
    span(options) {
      return new SpanImpl(options, exportFn)
    },
    context: options.context ?
      function(primitive, fiber) {
        if (fiber.cache.span === undefined) {
          return primitive["~effect/Effect/evaluate"](fiber)
        }
        return options.context!(primitive, fiber.cache.span)
      } :
      undefined
  })
})

/**
 * Provides `Tracer.Tracer` using the OTLP tracer created by `make`.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer: (options: {
  readonly url: string
  readonly resource?: {
    readonly serviceName?: string | undefined
    readonly serviceVersion?: string | undefined
    readonly attributes?: Record<string, unknown>
  } | undefined
  readonly headers?: Headers.Input | undefined
  readonly exportInterval?: Duration.Input | undefined
  readonly maxBatchSize?: number | undefined
  readonly context?: (<X>(primitive: Tracer.EffectPrimitive<X>, span: Tracer.AnySpan) => X) | undefined
  readonly shutdownTimeout?: Duration.Input | undefined
}) => Layer.Layer<Exporter.Flusher, never, OtlpSerialization | HttpClient.HttpClient> = flow(
  make,
  Layer.effect(Tracer.Tracer),
  Layer.provideMerge(Exporter.layerFlusher)
)

/**
 * Creates an OTLP traces layer from OpenTelemetry configuration.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerFromConfig = (options?: {
  readonly resource?: {
    readonly serviceName?: string | undefined
    readonly serviceVersion?: string | undefined
    readonly attributes?: Record<string, unknown>
  } | undefined
  readonly headers?: Headers.Input | undefined
  readonly context?: (<X>(primitive: Tracer.EffectPrimitive<X>, span: Tracer.AnySpan) => X) | undefined
}): Layer.Layer<Exporter.Flusher, never, HttpClient.HttpClient | OtlpSerialization> =>
  Effect.gen(function*() {
    const { disabled, endpoint, exporters } = yield* Config.all({
      disabled: Config.Boolean("OTEL_SDK_DISABLED").pipe(Config.withDefault(false)),
      endpoint: OtlpEnv.endpoint("TRACES"),
      exporters: OtlpEnv.exporters("TRACES")
    })

    if (disabled || !endpoint || !exporters.includes("otlp")) {
      return Exporter.layerFlusher
    }

    const { baseTimeout, tracesTimeout, exportTimeout, scheduleDelay, maxBatchSize } = yield* Config.all({
      baseTimeout: Config.option(Config.Int("OTEL_EXPORTER_OTLP_TIMEOUT")),
      tracesTimeout: Config.option(Config.Int("OTEL_EXPORTER_OTLP_TRACES_TIMEOUT")),
      exportTimeout: Config.option(Config.Int("OTEL_BSP_EXPORT_TIMEOUT")),
      scheduleDelay: Config.option(
        Config.Int("OTEL_BSP_SCHEDULE_DELAY").pipe(
          Config.map(Duration.millis)
        )
      ),
      maxBatchSize: Config.option(Config.Int("OTEL_BSP_MAX_EXPORT_BATCH_SIZE"))
    })

    const shutdownTimeout = Option.firstSomeOf([tracesTimeout, baseTimeout, exportTimeout]).pipe(
      Option.map((_) => Duration.millis(_))
    )

    return layer({
      url: endpoint.toString(),
      resource: options?.resource,
      headers: options?.headers ?? (yield* OtlpEnv.headers("TRACES")),
      exportInterval: Option.getOrUndefined(scheduleDelay),
      maxBatchSize: Option.getOrUndefined(maxBatchSize),
      context: options?.context,
      shutdownTimeout: Option.getOrUndefined(shutdownTimeout)
    })
  }).pipe(Effect.orDie, Layer.unwrap)

// internal

class SpanImpl implements Tracer.Span {
  readonly _tag = "Span"
  readonly name: string
  readonly parent: Option.Option<Tracer.AnySpan>
  readonly annotations: Context.Context<never>
  readonly links: Array<Tracer.SpanLink>
  readonly kind: Tracer.SpanKind
  readonly sampled: boolean
  readonly export: (span: SpanImpl) => void
  status: Tracer.SpanStatus
  _traceId: string | undefined = undefined
  _spanId: string | undefined = undefined
  _attributes: Map<string, unknown> | undefined = undefined
  _events: Array<[name: string, startTime: bigint, attributes: Record<string, unknown> | undefined]> | undefined =
    undefined

  constructor(
    options: {
      readonly name: string
      readonly parent: Option.Option<Tracer.AnySpan>
      readonly annotations: Context.Context<never>
      readonly links: Array<Tracer.SpanLink>
      readonly startTime: bigint
      readonly kind: Tracer.SpanKind
      readonly sampled: boolean
    },
    exportFn: (span: SpanImpl) => void
  ) {
    this.name = options.name
    this.parent = options.parent
    this.annotations = options.annotations
    this.links = options.links
    this.kind = options.kind
    this.sampled = options.sampled
    this.export = exportFn
    this.status = {
      _tag: "Started",
      startTime: options.startTime
    }
  }

  get traceId(): string {
    return this._traceId ??= Option.isSome(this.parent) ? this.parent.value.traceId : Hex.random(32)
  }

  get spanId(): string {
    return this._spanId ??= Hex.random(16)
  }

  get attributes(): Map<string, unknown> {
    return this._attributes ??= new Map()
  }

  get events(): Array<[name: string, startTime: bigint, attributes: Record<string, unknown> | undefined]> {
    return this._events ??= []
  }

  end(endTime: bigint, exit: Exit.Exit<unknown, unknown>): void {
    this.status = {
      _tag: "Ended",
      startTime: this.status.startTime,
      endTime,
      exit
    }
    this.export(this)
  }

  attribute(key: string, value: unknown): void {
    this.attributes.set(key, value)
  }

  event(name: string, startTime: bigint, attributes?: Record<string, unknown>): void {
    this.events.push([name, startTime, attributes])
  }

  addLinks(links: ReadonlyArray<Tracer.SpanLink>): void {
    // oxlint-disable-next-line no-restricted-syntax
    this.links.push(...links)
  }
}

const makeOtlpSpan = (self: SpanImpl): OtlpSpan => {
  const status = self.status as ExtractTag<Tracer.SpanStatus, "Ended">
  const attributes = self._attributes === undefined ? [] : entriesToAttributes(self._attributes)
  const events: Array<Event> = []
  if (self._events !== undefined) {
    for (let i = 0; i < self._events.length; i++) {
      const [name, startTime, attributes] = self._events[i]
      events.push({
        name,
        timeUnixNano: String(startTime),
        attributes: attributes
          ? entriesToAttributes(Object.entries(attributes))
          : [],
        droppedAttributesCount: 0
      })
    }
  }
  let otelStatus: Status

  if (status.exit._tag === "Success") {
    otelStatus = { code: StatusCode.Ok }
  } else if (Cause.hasInterruptsOnly(status.exit.cause)) {
    otelStatus = {
      code: StatusCode.Ok,
      message: "Interrupted"
    }
    attributes.push({
      key: "span.label",
      value: { stringValue: "⚠︎ Interrupted" }
    }, {
      key: "status.interrupted",
      value: { boolValue: true }
    })
  } else {
    const errors = Cause.prettyErrors(status.exit.cause, {
      includeCauseInStack: true
    })
    otelStatus = {
      code: StatusCode.Error
    }
    if (errors.length > 0) {
      otelStatus.message = errors[0].message
      for (const error of errors) {
        events.push({
          name: "exception",
          timeUnixNano: String(status.endTime),
          droppedAttributesCount: 0,
          attributes: [
            {
              "key": "exception.type",
              "value": {
                "stringValue": error.name
              }
            },
            {
              "key": "exception.message",
              "value": {
                "stringValue": error.message
              }
            },
            {
              "key": "exception.stacktrace",
              "value": {
                "stringValue": error.stack ?? "No stack trace available"
              }
            }
          ]
        })
      }
    }
  }

  const links: Array<Link> = []
  for (let i = 0; i < self.links.length; i++) {
    const link = self.links[i]
    links.push({
      traceId: link.span.traceId,
      spanId: link.span.spanId,
      attributes: entriesToAttributes(Object.entries(link.attributes)),
      droppedAttributesCount: 0
    })
  }

  return {
    traceId: self.traceId,
    spanId: self.spanId,
    parentSpanId: Option.isSome(self.parent) ? self.parent.value.spanId : undefined,
    name: self.name,
    kind: SpanKind[self.kind],
    startTimeUnixNano: String(status.startTime),
    endTimeUnixNano: String(status.endTime),
    attributes,
    droppedAttributesCount: 0,
    events,
    droppedEventsCount: 0,
    status: otelStatus,
    links,
    droppedLinksCount: 0
  }
}

/**
 * Root OTLP traces payload containing spans grouped by resource.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface TraceData {
  readonly resourceSpans: Array<ResourceSpan>
}

/**
 * Group of OTLP scope spans associated with a single resource.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ResourceSpan {
  readonly resource: Resource
  readonly scopeSpans: Array<ScopeSpan>
  readonly schemaUrl?: string | undefined
}

/**
 * Group of OTLP spans emitted by a single instrumentation scope.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ScopeSpan {
  readonly scope: Scope
  readonly spans: Array<OtlpSpan>
  readonly schemaUrl?: string | undefined
}

interface Scope {
  readonly name: string
}

interface OtlpSpan {
  readonly traceId: string
  readonly spanId: string
  readonly parentSpanId: string | undefined
  readonly name: string
  readonly kind: number
  readonly startTimeUnixNano: string
  readonly endTimeUnixNano: string
  readonly attributes: Array<KeyValue>
  readonly droppedAttributesCount: number
  readonly events: Array<Event>
  readonly droppedEventsCount: number
  readonly status: Status
  readonly links: Array<Link>
  readonly droppedLinksCount: number
}

interface Event {
  readonly attributes: Array<KeyValue>
  readonly name: string
  readonly timeUnixNano: string
  readonly droppedAttributesCount: number
}

interface Link {
  readonly attributes: Array<KeyValue>
  readonly spanId: string
  readonly traceId: string
  readonly droppedAttributesCount: number
}

interface Status {
  readonly code: StatusCode
  message?: string
}

const StatusCode = {
  Unset: 0,
  Ok: 1,
  Error: 2
} as const

type StatusCode = typeof StatusCode[keyof typeof StatusCode]

const SpanKind = {
  unspecified: 0,
  internal: 1,
  server: 2,
  client: 3,
  producer: 4,
  consumer: 5
} as const
