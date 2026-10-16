/**
 * Defines the low-level tracing model used by Effect.
 *
 * A span records the lifetime of an operation, including its name, parent,
 * attributes, links, annotations, sampling decision, kind, and completion
 * status. The module also defines the tracer service, parent-span context,
 * external span support, trace propagation settings, and the default in-memory
 * span implementation.
 *
 * @since 2.0.0
 */
import * as Context from "./Context.ts"
import * as Hex from "./encoding/Hex.ts"
import type * as Exit from "./Exit.ts"
import type { Fiber } from "./Fiber.ts"
import { constFalse, type LazyArg } from "./Function.ts"
import type * as core from "./internal/core.ts"
import type { LogLevel } from "./LogLevel.ts"
import * as Option from "./Option.ts"

/**
 * A tracing backend used by Effect to create spans. Custom tracers implement
 * `span` to allocate a span from the supplied name, parent, annotations,
 * links, start time, kind, root flag, and sampling decision.
 *
 * @category services
 * @since 2.0.0
 */
export interface Tracer {
  span(this: Tracer, options: {
    readonly name: string
    readonly parent: Option.Option<AnySpan>
    readonly annotations: Context.Context<never>
    readonly links: Array<SpanLink>
    readonly startTime: bigint
    readonly kind: SpanKind
    readonly root: boolean
    readonly sampled: boolean
  }): Span
  readonly context?:
    | (<X>(primitive: EffectPrimitive<X>, fiber: Fiber<any, any>) => X)
    | undefined
}

const evaluate = "~effect/Effect/evaluate" satisfies core.evaluate

/**
 * A low-level Effect primitive that can be evaluated by a tracer-specific
 * context for the current fiber.
 *
 * @category models
 * @since 4.0.0
 */
export interface EffectPrimitive<X> {
  [evaluate](this: EffectPrimitive<X>, fiber: Fiber<any, any>): X
}

/**
 * Lifecycle state of a span, where `Started` records the start time and
 * `Ended` records the start time, end time, and exit value with which the span
 * completed.
 *
 * **Example** (Creating span statuses)
 *
 * ```ts import.meta.vitest
 * import { Exit } from "effect"
 * import type { Tracer } from "effect"
 *
 * const startTime = 1_000_000_000n
 * const endTime = 1_500_000_000n
 *
 * const startedStatus: Tracer.SpanStatus = {
 *   _tag: "Started",
 *   startTime
 * }
 *
 * const endedStatus: Tracer.SpanStatus = {
 *   _tag: "Ended",
 *   startTime,
 *   endTime,
 *   exit: Exit.succeed("result")
 * }
 *
 * startedStatus._tag // => "Started"
 * endedStatus.endTime - endedStatus.startTime // => 500_000_000n
 * ```
 *
 * @category models
 * @since 2.0.0
 */
export type SpanStatus = {
  _tag: "Started"
  startTime: bigint
} | {
  _tag: "Ended"
  startTime: bigint
  endTime: bigint
  exit: Exit.Exit<unknown, unknown>
}

/**
 * A span value that can participate in tracing, either an Effect-managed
 * `Span` or an `ExternalSpan` propagated from another tracing system.
 *
 * **Example** (Accepting any span)
 *
 * ```ts import.meta.vitest
 * import { Effect, Tracer } from "effect"
 *
 * // Function that accepts any span type
 * const getSpanIds = (span: Tracer.AnySpan) => Effect.succeed([span.spanId, span.traceId])
 *
 * // Works with both Span and ExternalSpan
 * const externalSpan = Tracer.externalSpan({
 *   spanId: "span-123",
 *   traceId: "trace-456"
 * })
 *
 * await Effect.runPromise(getSpanIds(externalSpan)) // => ["span-123", "trace-456"]
 * ```
 *
 * @category models
 * @since 2.0.0
 */
export type AnySpan = Span | ExternalSpan

/**
 * Defines the string key for the parent-span context service.
 *
 * **When to use**
 *
 * Use when you need the raw context key for parent span lookup in lower-level
 * tracing code.
 *
 * **Example** (Reading the parent span key)
 *
 * ```ts import.meta.vitest
 * import { Tracer } from "effect"
 *
 * // The key used to identify parent spans in the context
 * Tracer.ParentSpanKey // => "effect/Tracer/ParentSpan"
 * ```
 *
 * @category constants
 * @since 4.0.0
 */
export const ParentSpanKey = "effect/Tracer/ParentSpan"

/**
 * Context service containing the `Span` or `ExternalSpan` to use as the parent
 * of newly-created child spans.
 *
 * **Example** (Accessing the parent span)
 *
 * ```ts import.meta.vitest
 * import { Effect, Tracer } from "effect"
 *
 * // Access the parent span from the context
 * const program = Effect.gen(function*() {
 *   const parentSpan = yield* Effect.service(Tracer.ParentSpan)
 *   return parentSpan.spanId
 * })
 *
 * const parent = Tracer.externalSpan({ spanId: "span-123", traceId: "trace-456" })
 * await Effect.runPromise(Effect.provideService(program, Tracer.ParentSpan, parent)) // => "span-123"
 * ```
 *
 * @category services
 * @since 2.0.0
 */
export class ParentSpan extends Context.Service<ParentSpan, AnySpan>()(ParentSpanKey, { fiberCached: true }) {}

/**
 * Represents a span created outside Effect's tracer, carrying trace and span
 * identifiers, sampling state, and annotations so it can be used as a parent or
 * link in Effect tracing.
 *
 * **Example** (Creating an external span value)
 *
 * ```ts import.meta.vitest
 * import { Context } from "effect"
 * import type { Tracer } from "effect"
 *
 * // Create an external span from another tracing system
 * const externalSpan: Tracer.ExternalSpan = {
 *   _tag: "ExternalSpan",
 *   spanId: "span-abc-123",
 *   traceId: "trace-xyz-789",
 *   sampled: true,
 *   annotations: Context.empty()
 * }
 *
 * externalSpan.spanId // => "span-abc-123"
 * ```
 *
 * @category models
 * @since 2.0.0
 */
export interface ExternalSpan {
  readonly _tag: "ExternalSpan"
  readonly spanId: string
  readonly traceId: string
  readonly sampled: boolean
  readonly annotations: Context.Context<never>
}

/**
 * Options accepted by span-creating APIs, combining span metadata such as
 * attributes, links, parent/root selection, kind, sampling, and trace level
 * with stack trace capture settings.
 *
 * **Example** (Configuring span options)
 *
 * ```ts import.meta.vitest
 * import { Effect, Tracer } from "effect"
 *
 * // Create an effect with span options
 * const options: Tracer.SpanOptions = {
 *   attributes: { "user.id": "123", "operation": "data-processing" },
 *   kind: "internal",
 *   root: false,
 *   captureStackTrace: true
 * }
 *
 * const program = Effect.succeed("Hello World").pipe(
 *   Effect.withSpan("my-operation", options)
 * )
 *
 * const spans: Array<Tracer.NativeSpan> = []
 * const tracer = Tracer.make({
 *   span(options) {
 *     const span = new Tracer.NativeSpan(options)
 *     spans.push(span)
 *     return span
 *   }
 * })
 * const value = await Effect.runPromise(Effect.provideService(program, Tracer.Tracer, tracer)) // => "Hello World"
 *
 * spans[0]?.attributes.get("user.id") // => "123"
 * spans[0]?.status._tag // => "Ended"
 * ```
 *
 * @category options
 * @since 3.1.0
 */
export interface SpanOptions extends SpanOptionsNoTrace, TraceOptions {}

/**
 * Span creation options that do not control stack trace capture, including
 * attributes, links, parent or root selection, annotations, span kind,
 * sampling, and the trace level used for filtering.
 *
 * @category options
 * @since 4.0.0
 */
export interface SpanOptionsNoTrace {
  readonly attributes?: Record<string, unknown> | undefined
  readonly links?: ReadonlyArray<SpanLink> | undefined
  readonly parent?: AnySpan | undefined
  readonly root?: boolean | undefined
  readonly annotations?: Context.Context<never> | undefined
  readonly kind?: SpanKind | undefined
  readonly sampled?: boolean | undefined
  readonly level?: LogLevel | undefined
}

/**
 * Options that control stack trace capture for tracing wrappers.
 * `captureStackTrace` can disable capture or provide a lazy stack string.
 *
 * @category options
 * @since 4.0.0
 */
export interface TraceOptions {
  readonly captureStackTrace?: boolean | LazyArg<string | undefined> | undefined
}

/**
 * OpenTelemetry-style role describing the kind of operation represented by a
 * span: internal work, server handling, client calls, producing, or consuming.
 *
 * **Example** (Configuring span kinds)
 *
 * ```ts import.meta.vitest
 * import { Effect, Tracer } from "effect"
 *
 * // Different span kinds for different operations
 * const program = Effect.succeed("handled").pipe(
 *   Effect.withSpan("handle-request", {
 *     kind: "server" as Tracer.SpanKind
 *   })
 * )
 *
 * const spans: Array<Tracer.NativeSpan> = []
 * const tracer = Tracer.make({
 *   span(options) {
 *     const span = new Tracer.NativeSpan(options)
 *     spans.push(span)
 *     return span
 *   }
 * })
 * const value = await Effect.runPromise(Effect.provideService(program, Tracer.Tracer, tracer)) // => "handled"
 *
 * spans[0]?.kind // => "server"
 * ```
 *
 * @category models
 * @since 3.1.0
 */
export type SpanKind = "internal" | "server" | "client" | "producer" | "consumer"

/**
 * A span created by an Effect tracer. It carries trace identity, parent,
 * annotations, attributes, links, sampling and kind information, lifecycle
 * status, and methods to end the span or add attributes, events, and links.
 *
 * **Example** (Working with spans)
 *
 * ```ts import.meta.vitest
 * import { Context, Exit, Option } from "effect"
 * import type { Tracer } from "effect"
 *
 * const attributes = new Map<string, unknown>()
 * const links: Array<Tracer.SpanLink> = []
 * const events: Array<[name: string, startTime: bigint, attributes: Record<string, unknown>]> = []
 * let status: Tracer.SpanStatus = {
 *   _tag: "Started",
 *   startTime: 1_000_000_000n
 * }
 *
 * const span: Tracer.Span = {
 *   _tag: "Span",
 *   name: "load-user",
 *   spanId: "span-1",
 *   traceId: "trace-1",
 *   parent: Option.none(),
 *   annotations: Context.empty(),
 *   get status() {
 *     return status
 *   },
 *   attributes,
 *   links,
 *   sampled: true,
 *   kind: "internal",
 *   end(endTime, exit) {
 *     status = { _tag: "Ended", startTime: status.startTime, endTime, exit }
 *   },
 *   attribute(key, value) {
 *     attributes.set(key, value)
 *   },
 *   event(name, startTime, eventAttributes = {}) {
 *     events.push([name, startTime, eventAttributes])
 *   },
 *   addLinks(newLinks) {
 *     links.push(...newLinks)
 *   }
 * }
 *
 * span.attribute("user.id", "123")
 * span.event("loaded", 1_250_000_000n, { "cache.hit": true })
 * span.end(1_500_000_000n, Exit.succeed("user"))
 *
 * span.name // => "load-user"
 * span.attributes.get("user.id") // => "123"
 * span.status._tag // => "Ended"
 * events // => [["loaded", 1_250_000_000n, { "cache.hit": true }]]
 * ```
 *
 * @category models
 * @since 2.0.0
 */
export interface Span {
  readonly _tag: "Span"
  readonly name: string
  readonly spanId: string
  readonly traceId: string
  readonly parent: Option.Option<AnySpan>
  readonly annotations: Context.Context<never>
  readonly status: SpanStatus
  readonly attributes: ReadonlyMap<string, unknown>
  readonly links: ReadonlyArray<SpanLink>
  readonly sampled: boolean
  readonly kind: SpanKind
  end(endTime: bigint, exit: Exit.Exit<unknown, unknown>): void
  attribute(key: string, value: unknown): void
  event(name: string, startTime: bigint, attributes?: Record<string, unknown>): void
  addLinks(links: ReadonlyArray<SpanLink>): void
}

/**
 * A relationship from one span to another span, with attributes describing the
 * relationship.
 *
 * **Example** (Linking spans)
 *
 * ```ts import.meta.vitest
 * import { Effect, Tracer } from "effect"
 *
 * // Create a span link to connect spans
 * const externalSpan = Tracer.externalSpan({
 *   spanId: "external-span-123",
 *   traceId: "trace-456"
 * })
 *
 * const link: Tracer.SpanLink = {
 *   span: externalSpan,
 *   attributes: { "link.type": "follows-from", "service": "external-api" }
 * }
 *
 * const program = Effect.succeed("result").pipe(
 *   Effect.withSpan("linked-operation", { links: [link] })
 * )
 *
 * const spans: Array<Tracer.NativeSpan> = []
 * const tracer = Tracer.make({
 *   span(options) {
 *     const span = new Tracer.NativeSpan(options)
 *     spans.push(span)
 *     return span
 *   }
 * })
 * const value = await Effect.runPromise(Effect.provideService(program, Tracer.Tracer, tracer)) // => "result"
 *
 * spans[0]?.links[0]?.span.spanId // => "external-span-123"
 * spans[0]?.links[0]?.attributes["link.type"] // => "follows-from"
 * ```
 *
 * @category models
 * @since 2.0.0
 */
export interface SpanLink {
  readonly span: AnySpan
  readonly attributes: Readonly<Record<string, unknown>>
}

/**
 * Creates a `Tracer` value from a tracer implementation object.
 *
 * **When to use**
 *
 * Use to create a custom tracing backend value that Effect can use when
 * creating spans.
 *
 * **Details**
 *
 * `make` returns the supplied implementation object unchanged. The object must
 * satisfy the `Tracer` contract, including a `span` method that returns a
 * `Span`.
 *
 * @see {@link Span} for the span values returned by tracer implementations
 *
 * @category constructors
 * @since 2.0.0
 */
export const make = (options: Tracer): Tracer => options

/**
 * Creates an `ExternalSpan` from trace and span identifiers, defaulting
 * `sampled` to `true` and annotations to an empty context when they are not
 * provided.
 *
 * **Example** (Creating an external span)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, Tracer } from "effect"
 *
 * // Create an external span from another tracing system
 * const span = Tracer.externalSpan({
 *   spanId: "span-abc-123",
 *   traceId: "trace-xyz-789",
 *   sampled: true
 * })
 *
 * // Use the external span as a parent
 * const program = Effect.succeed("Hello").pipe(
 *   Effect.withSpan("child-operation", { parent: span })
 * )
 *
 * const spans: Array<Tracer.NativeSpan> = []
 * const tracer = Tracer.make({
 *   span(options) {
 *     const span = new Tracer.NativeSpan(options)
 *     spans.push(span)
 *     return span
 *   }
 * })
 * const value = await Effect.runPromise(Effect.provideService(program, Tracer.Tracer, tracer))
 *
 * value // => "Hello"
 * spans.map((span) => Option.getOrUndefined(span.parent)?.spanId) // => ["span-abc-123"]
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const externalSpan = (
  options: {
    readonly spanId: string
    readonly traceId: string
    readonly sampled?: boolean | undefined
    readonly annotations?: Context.Context<never> | undefined
  }
): ExternalSpan => ({
  _tag: "ExternalSpan",
  spanId: options.spanId,
  traceId: options.traceId,
  sampled: options.sampled ?? true,
  annotations: options.annotations ?? Context.empty()
})

/**
 * Context reference for disabling trace propagation.
 *
 * **When to use**
 *
 * Use to prevent spans in a scope from propagating tracing context.
 *
 * **Details**
 *
 * When enabled on fiber or span annotations, new spans are created as
 * non-propagating no-op spans and disabled spans are skipped when deriving a
 * parent span.
 *
 * **Example** (Disabling span propagation)
 *
 * ```ts import.meta.vitest
 * import { Effect, Tracer } from "effect"
 *
 * // Disable span propagation for a specific effect
 * const program = Tracer.DisablePropagation.pipe(
 *   Effect.provideService(Tracer.DisablePropagation, true)
 * )
 *
 * await Effect.runPromise(program) // => true
 * ```
 *
 * @category services
 * @since 3.12.0
 */
export const DisablePropagation = Context.Reference<boolean>(
  "effect/Tracer/DisablePropagation",
  { defaultValue: constFalse }
)

/**
 * Context reference for controlling the current trace level for dynamic filtering.
 *
 * **When to use**
 *
 * Use to set the default trace level for spans in a scope when span options do
 * not provide `level`.
 *
 * **Details**
 *
 * The default value is `"Info"`. Span creation uses `options.level ??
 * CurrentTraceLevel` before applying `MinimumTraceLevel`.
 *
 * @see {@link MinimumTraceLevel} for the threshold that decides whether spans at that level are sampled
 *
 * @category services
 * @since 4.0.0
 */
export const CurrentTraceLevel: Context.Reference<LogLevel> = Context.Reference<LogLevel>(
  "effect/Tracer/CurrentTraceLevel",
  { defaultValue: () => "Info" }
)

/**
 * Context reference for setting the minimum trace level threshold. Spans and their
 * descendants below this level will have their sampling decision forced to
 * false, preventing them from being exported.
 *
 * **When to use**
 *
 * Use to set the trace-level threshold that controls whether spans are sampled
 * by default.
 *
 * **Details**
 *
 * The default value is `"All"`. Span creation compares the span level from
 * `options.level ?? CurrentTraceLevel` against this threshold.
 *
 * **Gotchas**
 *
 * Explicit `options.sampled` bypasses threshold computation.
 *
 * @see {@link CurrentTraceLevel} for the default span level used when options do not specify one
 *
 * @category services
 * @since 4.0.0
 */
export const MinimumTraceLevel = Context.Reference<
  LogLevel
>("effect/Tracer/MinimumTraceLevel", { defaultValue: () => "All" })

/**
 * Defines the string key for the active tracer context reference.
 *
 * **When to use**
 *
 * Use when you need the raw context key for active tracer lookup in lower-level
 * tracing code.
 *
 * @category constants
 * @since 4.0.0
 */
export const TracerKey = "effect/Tracer"

/**
 * Context reference for the active tracer service. By default it uses the
 * native tracer, which creates `NativeSpan` instances.
 *
 * **Example** (Accessing the current tracer)
 *
 * ```ts import.meta.vitest
 * import { Effect, Tracer } from "effect"
 *
 * // Access the current tracer from the context
 * const program = Effect.gen(function*() {
 *   const tracer = yield* Effect.service(Tracer.Tracer)
 *   // Or use the built-in tracer effect
 *   const tracerFromAccessor = yield* Effect.tracer
 *   return tracer === tracerFromAccessor
 * })
 *
 * await Effect.runPromise(program) // => true
 * ```
 *
 * @category services
 * @since 2.0.0
 */
export const Tracer: Context.Reference<Tracer> = Context.Reference<Tracer>(TracerKey, {
  fiberCached: true,
  defaultValue: () => nativeTracer
})

/**
 * The default `Tracer` implementation backing the `Tracer` reference. It
 * creates in-memory `NativeSpan` instances and does not export them anywhere.
 *
 * **Details**
 *
 * Runtime code can compare the active tracer against `nativeTracer` to detect
 * that no tracing backend is installed and skip work that only a backend could
 * observe, such as recording span attributes.
 *
 * @category references
 * @since 4.0.0
 */
export const nativeTracer: Tracer = make({
  span: (options) => new NativeSpan(options)
})

/**
 * Default in-memory `Span` implementation used by the native tracer. It
 * generates span and trace identifiers, stores attributes, events, and links,
 * and records `Started` or `Ended` status.
 *
 * **Details**
 *
 * The constructor initializes the span with `Started` status. Trace and span
 * identifiers, the attribute map, and the event list are created lazily on
 * first access, so spans that are never inspected allocate as little as
 * possible. Attributes, events, links, and status are mutated through `Span`
 * methods.
 *
 * @see {@link Span} for the interface implemented by native spans
 *
 * @category models
 * @since 4.0.0
 */
export class NativeSpan implements Span {
  readonly _tag = "Span"
  readonly sampled: boolean

  readonly name: string
  readonly parent: Option.Option<AnySpan>
  readonly annotations: Context.Context<never>
  readonly links: Array<SpanLink>
  readonly startTime: bigint
  readonly kind: SpanKind

  status: SpanStatus
  _traceId: string | undefined = undefined
  _spanId: string | undefined = undefined
  _attributes: Map<string, unknown> | undefined = undefined
  _events: Array<[name: string, startTime: bigint, attributes: Record<string, unknown>]> | undefined = undefined

  constructor(options: {
    readonly name: string
    readonly parent: Option.Option<AnySpan>
    readonly annotations: Context.Context<never>
    readonly links: Array<SpanLink>
    readonly startTime: bigint
    readonly kind: SpanKind
    readonly sampled: boolean
  }) {
    this.name = options.name
    this.parent = options.parent
    this.annotations = options.annotations
    this.links = options.links
    this.startTime = options.startTime
    this.kind = options.kind
    this.sampled = options.sampled
    this.status = {
      _tag: "Started",
      startTime: options.startTime
    }
  }

  get traceId(): string {
    return this._traceId ??= Option.getOrUndefined(this.parent)?.traceId ?? Hex.random(32)
  }

  get spanId(): string {
    return this._spanId ??= Hex.random(16)
  }

  get attributes(): Map<string, unknown> {
    return this._attributes ??= new Map()
  }

  get events(): Array<[name: string, startTime: bigint, attributes: Record<string, unknown>]> {
    return this._events ??= []
  }

  end(endTime: bigint, exit: Exit.Exit<unknown, unknown>): void {
    this.status = {
      _tag: "Ended",
      endTime,
      exit,
      startTime: this.status.startTime
    }
  }

  attribute(key: string, value: unknown): void {
    this.attributes.set(key, value)
  }

  event(name: string, startTime: bigint, attributes?: Record<string, unknown>): void {
    this.events.push([name, startTime, attributes ?? {}])
  }

  addLinks(links: ReadonlyArray<SpanLink>): void {
    // oxlint-disable-next-line no-restricted-syntax
    this.links.push(...links)
  }
}
