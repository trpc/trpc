/**
 * Bridges Effect tracing into OpenTelemetry by installing an Effect `Tracer`
 * that creates OpenTelemetry spans, records attributes, events, links, errors,
 * and status, and keeps OpenTelemetry context active while traced effects run.
 * Use this module when an application already has an OpenTelemetry
 * `TracerProvider`, or when the Node and Web SDK layers should expose Effect
 * spans to OTLP, console, or other OpenTelemetry-compatible exporters.
 *
 * The layer constructors wire Effect's tracer service to either the global
 * OpenTelemetry tracer provider or an explicitly provided `OtelTracer`. This
 * module does not create exporters or span processors by itself, so spans are
 * exported only when the provider has been configured by the application or by
 * the Node/Web SDK layers. Parentage is taken from Effect spans first and can
 * also attach to the active OpenTelemetry context, while `makeExternalSpan` and
 * `withSpanContext` are the entry points for continuing an incoming remote
 * trace. Preserve `traceFlags` and `traceState` when building external spans;
 * otherwise sampling defaults to sampled and trace state cannot be propagated.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Otel from "@opentelemetry/api"
import * as OtelSemConv from "@opentelemetry/semantic-conventions"
import * as Cause from "effect/Cause"
import type * as Clock from "effect/Clock"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import { constTrue, dual } from "effect/Function"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as Tracer from "effect/Tracer"
import { nanosToHrTime, recordToAttributes, unknownToAttributeValue } from "./internal/attributes.ts"
import { Resource } from "./Resource.ts"

// =============================================================================
// Service Definitions
// =============================================================================

/**
 * Context service containing the OpenTelemetry `Tracer` used to create spans for Effect tracing.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class OtelTracer extends Context.Service<
  OtelTracer,
  Otel.Tracer
>()("@effect/opentelemetry/Tracer") {}

/**
 * Context service containing the OpenTelemetry `TracerProvider` used to obtain tracers.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class OtelTracerProvider extends Context.Service<
  OtelTracerProvider,
  Otel.TracerProvider
>()("@effect/opentelemetry/Tracer/OtelTracerProvider") {}

/**
 * Context service containing OpenTelemetry trace flags used when constructing external span contexts.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class OtelTraceFlags extends Context.Service<
  OtelTraceFlags,
  Otel.TraceFlags
>()("@effect/opentelemetry/Tracer/OtelTraceFlags") {}

/**
 * Context service containing OpenTelemetry trace state used when constructing external span contexts.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class OtelTraceState extends Context.Service<
  OtelTraceState,
  Otel.TraceState
>()("@effect/opentelemetry/Tracer/OtelTraceState") {}

// =============================================================================
// Constructors
// =============================================================================

/**
 * Creates an Effect `Tracer` implementation backed by the configured OpenTelemetry tracer.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make: Effect.Effect<Tracer.Tracer, never, OtelTracer> = Effect.map(
  Effect.service(OtelTracer),
  (tracer) =>
    Tracer.make({
      span(options) {
        return new OtelSpan(
          Otel.context,
          Otel.trace,
          tracer,
          options
        )
      },
      context(primitive, fiber) {
        const currentSpan = fiber.cache.span

        if (currentSpan === undefined) {
          return primitive["~effect/Effect/evaluate"](fiber)
        }

        return Otel.context.with(
          populateContext(Otel.context.active(), currentSpan),
          () => primitive["~effect/Effect/evaluate"](fiber)
        )
      }
    })
)

/**
 * Creates an Effect external span from an OpenTelemetry span context, preserving trace flags and trace state when provided.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeExternalSpan = (options: {
  readonly traceId: string
  readonly spanId: string
  readonly traceFlags?: number | undefined
  readonly traceState?: string | Otel.TraceState | undefined
}): Tracer.ExternalSpan => {
  let annotations = Context.empty()
  if (options.traceFlags !== undefined) {
    annotations = Context.add(annotations, OtelTraceFlags, options.traceFlags)
  }

  if (typeof options.traceState === "string") {
    try {
      annotations = Context.add(annotations, OtelTraceState, Otel.createTraceState(options.traceState))
    } catch {
      //
    }
  } else if (options.traceState) {
    annotations = Context.add(annotations, OtelTraceState, options.traceState)
  }

  return {
    _tag: "ExternalSpan",
    traceId: options.traceId,
    spanId: options.spanId,
    sampled: Predicate.isNotUndefined(options.traceFlags) ? isSampled(options.traceFlags) : true,
    annotations
  }
}

// =============================================================================
// Layers
// =============================================================================

/**
 * Layer that provides the current global OpenTelemetry tracer provider.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerGlobalProvider: Layer.Layer<OtelTracerProvider> = Layer.sync(
  OtelTracerProvider,
  () => Otel.trace.getTracerProvider()
)

/**
 * Layer that creates an OpenTelemetry tracer from the provided tracer provider and resource metadata.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerTracer: Layer.Layer<OtelTracer, never, OtelTracerProvider | Resource> = Layer.effect(
  OtelTracer,
  Effect.gen(function*() {
    const resource = yield* Resource
    const provider = yield* OtelTracerProvider
    return provider.getTracer(
      resource.attributes[OtelSemConv.ATTR_SERVICE_NAME] as string,
      resource.attributes[OtelSemConv.ATTR_SERVICE_VERSION] as string
    )
  })
)

/**
 * Layer that creates an OpenTelemetry tracer from the global tracer provider and the current resource.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerGlobalTracer: Layer.Layer<OtelTracer, never, Resource> = layerTracer.pipe(
  Layer.provide(layerGlobalProvider)
)

/**
 * Layer that installs an Effect tracer backed by the global OpenTelemetry tracer provider.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerGlobal: Layer.Layer<OtelTracer, never, Resource> = Layer.effect(Tracer.Tracer, make).pipe(
  Layer.provideMerge(layerGlobalTracer)
)

/**
 * Layer that installs the Effect tracer using an `OtelTracer` already provided in the environment.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerWithoutOtelTracer: Layer.Layer<never, never, OtelTracer> = Layer.effect(Tracer.Tracer, make)

/**
 * Layer that creates an OpenTelemetry tracer from a provider and resource, then installs it as the Effect tracer.
 *
 * **When to use**
 *
 * Use when you already provide an `OtelTracerProvider` and a `Resource`, and
 * want Effect spans backed by a tracer derived from them.
 *
 * @see {@link layerTracer} for creating only the OpenTelemetry tracer service
 * @see {@link layerGlobal} for installing the Effect tracer from the global provider
 * @see {@link layerWithoutOtelTracer} for installing an already-provided `OtelTracer`
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer.Layer<OtelTracer, never, OtelTracerProvider | Resource> = layerWithoutOtelTracer.pipe(
  Layer.provideMerge(layerTracer)
)

// =============================================================================
// Utilities / Combinators
// =============================================================================

const bigint1e6 = BigInt(1_000_000)
const bigint1e9 = BigInt(1_000_000_000)

/**
 * Gets the current OpenTelemetry span.
 *
 * **Details**
 *
 * This accessor works with both the official OpenTelemetry API, such as
 * `Tracer.layer` and `NodeSdk.layer`, and the lightweight OTLP module, such as
 * `OtlpTracer.layer`. When using OTLP, the returned span is a wrapper that
 * conforms to the OpenTelemetry `Span` interface.
 *
 * @stability unstable
 * @category accessors
 * @since 4.0.0
 */
export const currentOtelSpan: Effect.Effect<Otel.Span, Cause.NoSuchElementError> = Effect.clockWith((clock) =>
  Effect.map(Effect.currentSpan, (span) =>
    OtelSpanTypeId in span
      ? (span as OtelSpan).span
      : makeOtelSpan(span, clock))
)

const makeOtelSpan = (span: Tracer.Span, clock: Clock.Clock): Otel.Span => {
  const spanContext: Otel.SpanContext = {
    traceId: span.traceId,
    spanId: span.spanId,
    traceFlags: span.sampled ? Otel.TraceFlags.SAMPLED : Otel.TraceFlags.NONE,
    isRemote: false
  }

  let exit = Exit.void

  const self: Otel.Span = {
    spanContext: () => spanContext,
    setAttribute(key, value) {
      span.attribute(key, value)
      return self
    },
    setAttributes(attributes) {
      for (const [key, value] of Object.entries(attributes)) {
        span.attribute(key, value)
      }
      return self
    },
    addEvent(name) {
      let attributes: Otel.Attributes | undefined = undefined
      let startTime: Otel.TimeInput | undefined = undefined
      if (arguments.length === 3) {
        attributes = arguments[1]
        startTime = arguments[2]
      } else {
        startTime = arguments[1]
      }
      span.event(name, convertOtelTimeInput(startTime, clock), attributes)
      return self
    },
    addLink(link) {
      span.addLinks([{
        span: makeExternalSpan(link.context),
        attributes: link.attributes ?? {}
      }])
      return self
    },
    addLinks(links) {
      span.addLinks(links.map((link) => ({
        span: makeExternalSpan(link.context),
        attributes: link.attributes ?? {}
      })))
      return self
    },
    setStatus(status) {
      exit = status.code === Otel.SpanStatusCode.ERROR
        ? Exit.die(status.message ?? "Unknown error")
        : Exit.void
      return self
    },
    updateName: () => self,
    end(endTime) {
      const time = convertOtelTimeInput(endTime, clock)
      span.end(time, exit)
      return self
    },
    isRecording: constTrue,
    recordException(exception, timeInput) {
      const time = convertOtelTimeInput(timeInput, clock)
      const cause = Cause.fail(exception)
      const error = Cause.prettyErrors(cause, {
        includeCauseInStack: true
      })[0]
      span.event(error.message, time, {
        "exception.type": error.name,
        "exception.message": error.message,
        "exception.stacktrace": error.stack ?? ""
      })
    }
  }
  return self
}

const convertOtelTimeInput = (input: Otel.TimeInput | undefined, clock: Clock.Clock): bigint => {
  if (input === undefined) {
    return clock.currentTimeNanosUnsafe()
  } else if (typeof input === "number") {
    return BigInt(Math.round(input * 1_000_000))
  } else if (input instanceof Date) {
    return BigInt(input.getTime()) * bigint1e6
  }
  const [seconds, nanos] = input
  return BigInt(seconds) * bigint1e9 + BigInt(nanos)
}

/**
 * Sets an effect's parent span from the given OpenTelemetry `SpanContext`.
 *
 * **When to use**
 *
 * Use when you need an effect to continue a trace from a parent span context
 * produced by OpenTelemetry instrumentation outside Effect.
 *
 * @stability unstable
 * @category propagation
 * @since 4.0.0
 */
export const withSpanContext: {
  (
    spanContext: Otel.SpanContext
  ): <A, E, R>(
    self: Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E, Exclude<R, Tracer.ParentSpan>>
  <A, E, R>(
    self: Effect.Effect<A, E, R>,
    spanContext: Otel.SpanContext
  ): Effect.Effect<A, E, Exclude<R, Tracer.ParentSpan>>
} = dual(2, <A, E, R>(
  self: Effect.Effect<A, E, R>,
  spanContext: Otel.SpanContext
) => Effect.withParentSpan(self, makeExternalSpan(spanContext)))

// =============================================================================
// Internals
// =============================================================================

const OtelSpanTypeId = "~@effect/opentelemetry/OtelTracer/OtelSpan"

const kindMap = {
  "internal": Otel.SpanKind.INTERNAL,
  "client": Otel.SpanKind.CLIENT,
  "server": Otel.SpanKind.SERVER,
  "producer": Otel.SpanKind.PRODUCER,
  "consumer": Otel.SpanKind.CONSUMER
}

/** @internal */
export class OtelSpan implements Tracer.Span {
  readonly [OtelSpanTypeId]: typeof OtelSpanTypeId
  readonly _tag = "Span"

  readonly name: string
  readonly kind: Tracer.SpanKind
  readonly annotations: Context.Context<never>
  readonly links: Array<Tracer.SpanLink>
  readonly span: Otel.Span
  readonly spanId: string
  readonly traceId: string
  readonly attributes = new Map<string, unknown>()
  readonly sampled: boolean
  readonly parent: Option.Option<Tracer.AnySpan>
  status: Tracer.SpanStatus

  constructor(
    contextApi: Otel.ContextAPI,
    traceApi: Otel.TraceAPI,
    tracer: Otel.Tracer,
    options: Parameters<Tracer.Tracer["span"]>[0]
  ) {
    this[OtelSpanTypeId] = OtelSpanTypeId
    this.name = options.name
    this.annotations = options.annotations
    this.links = options.links
    this.kind = options.kind
    const active = contextApi.active()
    this.parent = options.root !== true
      ? Option.orElse(options.parent, () => getOtelParent(traceApi, active, options.annotations))
      : options.parent
    this.span = tracer.startSpan(
      options.name,
      {
        startTime: nanosToHrTime(options.startTime),
        links: options.links.length > 0
          ? options.links.map((link) => ({
            context: makeSpanContext(link.span),
            attributes: recordToAttributes(link.attributes)
          }))
          : undefined as any,
        kind: kindMap[this.kind]
      },
      Option.isSome(this.parent) ?
        populateContext(active, this.parent.value, options.annotations) :
        Otel.trace.deleteSpan(active)
    )
    const spanContext = this.span.spanContext()
    this.spanId = spanContext.spanId
    this.traceId = spanContext.traceId
    this.status = {
      _tag: "Started",
      startTime: options.startTime
    }
    this.sampled = isSampled(spanContext.traceFlags)
  }

  attribute(key: string, value: unknown) {
    this.span.setAttribute(key, unknownToAttributeValue(value))
    this.attributes.set(key, value)
  }

  addLinks(links: ReadonlyArray<Tracer.SpanLink>): void {
    // oxlint-disable-next-line no-restricted-syntax
    this.links.push(...links)
    this.span.addLinks(links.map((link) => ({
      context: makeSpanContext(link.span),
      attributes: recordToAttributes(link.attributes)
    })))
  }

  end(endTime: bigint, exit: Exit.Exit<unknown, unknown>) {
    const hrTime = nanosToHrTime(endTime)
    this.status = {
      _tag: "Ended",
      endTime,
      exit,
      startTime: this.status.startTime
    }

    if (exit._tag === "Success") {
      this.span.setStatus({ code: Otel.SpanStatusCode.OK })
    } else {
      if (Cause.hasInterruptsOnly(exit.cause)) {
        this.span.setStatus({
          code: Otel.SpanStatusCode.OK,
          message: Cause.pretty(exit.cause)
        })
        this.span.setAttribute("span.label", "⚠︎ Interrupted")
        this.span.setAttribute("status.interrupted", true)
      } else {
        const errors = Cause.prettyErrors(exit.cause, {
          includeCauseInStack: true
        })
        if (errors.length > 0) {
          for (const error of errors) {
            this.span.recordException(error, hrTime)
          }
          this.span.setStatus({
            code: Otel.SpanStatusCode.ERROR,
            message: errors[0].message
          })
        } else {
          // empty cause means no error
          this.span.setStatus({ code: Otel.SpanStatusCode.OK })
        }
      }
    }
    this.span.end(hrTime)
  }

  event(name: string, startTime: bigint, attributes?: Record<string, unknown>) {
    this.span.addEvent(
      name,
      attributes ? recordToAttributes(attributes) : undefined,
      nanosToHrTime(startTime)
    )
  }
}

const isSampled = (traceFlags: Otel.TraceFlags): boolean =>
  (traceFlags & Otel.TraceFlags.SAMPLED) === Otel.TraceFlags.SAMPLED

class OtelParentSpanContext extends Context.Service<
  OtelParentSpanContext,
  Otel.SpanContext
>()("@effect/opentelemetry/Tracer/OtelParentSpanContext") {}

const getOtelParent = (
  tracer: Otel.TraceAPI,
  context: Otel.Context,
  annotations: Context.Context<never>
): Option.Option<Tracer.AnySpan> => {
  const otelParent = tracer.getSpanContext(context)
  if (!otelParent) return Option.none()
  return Option.some(Tracer.externalSpan({
    spanId: otelParent.spanId,
    traceId: otelParent.traceId,
    sampled: isSampled(otelParent.traceFlags),
    annotations: Context.add(annotations, OtelParentSpanContext, otelParent)
  }))
}

const makeSpanContext = (
  span: Tracer.AnySpan,
  annotations?: Context.Context<never>
): Otel.SpanContext => {
  const otelParent = Context.getOrUndefined(span.annotations, OtelParentSpanContext)
  if (otelParent !== undefined) {
    if (annotations === undefined) return otelParent
    const traceFlags = extractTraceService(span, annotations, OtelTraceFlags)
    const traceState = extractTraceService(span, annotations, OtelTraceState)
    return {
      ...otelParent,
      traceFlags: traceFlags ?? otelParent.traceFlags,
      traceState: traceState ?? otelParent.traceState!
    }
  }
  const traceFlags = makeTraceFlags(span, annotations)
  const traceState = makeTraceState(span, annotations)!
  return ({
    spanId: span.spanId,
    traceId: span.traceId,
    isRemote: span._tag === "ExternalSpan",
    traceFlags,
    traceState
  })
}

const makeTraceFlags = (
  span: Tracer.AnySpan,
  annotations: Context.Context<never> | undefined
): Otel.TraceFlags => {
  let traceFlags: Otel.TraceFlags | undefined
  if (Predicate.isNotUndefined(annotations)) {
    traceFlags = extractTraceService(span, annotations, OtelTraceFlags)
    if (Predicate.isUndefined(traceFlags)) {
      traceFlags = Context.getOrUndefined(span.annotations, OtelTraceFlags)
    }
  }
  return traceFlags ?? (span.sampled ? Otel.TraceFlags.SAMPLED : Otel.TraceFlags.NONE)
}

const makeTraceState = (
  span: Tracer.AnySpan,
  annotations: Context.Context<never> | undefined
): Otel.TraceState | undefined => {
  let traceState: Otel.TraceState | undefined
  if (Predicate.isNotUndefined(annotations)) {
    traceState = extractTraceService(span, annotations, OtelTraceState)
    if (Predicate.isUndefined(traceState)) {
      traceState = Context.getOrUndefined(span.annotations, OtelTraceState)
    }
  }
  return traceState
}

const extractTraceService = <I, S>(
  parent: Tracer.AnySpan,
  annotations: Context.Context<never>,
  service: Context.Service<I, S>
) => {
  const instance = Context.getOrUndefined(annotations, service)
  if (Predicate.isNotUndefined(instance)) {
    return instance
  }
  return Context.getOrUndefined(parent.annotations, service)
}

const populateContext = (
  context: Otel.Context,
  span: Tracer.AnySpan,
  annotations?: Context.Context<never> | undefined
): Otel.Context =>
  span instanceof OtelSpan ?
    Otel.trace.setSpan(context, span.span) :
    Otel.trace.setSpanContext(context, makeSpanContext(span, annotations))
