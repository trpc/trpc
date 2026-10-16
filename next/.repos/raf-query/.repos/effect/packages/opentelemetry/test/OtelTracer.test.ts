import * as NodeSdk from "@effect/opentelemetry/NodeSdk"
import * as OtelTracer from "@effect/opentelemetry/OtelTracer"
import { assert, describe, it } from "@effect/vitest"
import * as OtelApi from "@opentelemetry/api"
import { AsyncHooksContextManager } from "@opentelemetry/context-async-hooks"
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base"
import * as Cause from "effect/Cause"
import * as EffectContext from "effect/Context"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as EffectTracer from "effect/Tracer"

const TracingLayer = NodeSdk.layer(Effect.sync(() => ({
  resource: {
    serviceName: "test"
  },
  spanProcessor: [new SimpleSpanProcessor(new InMemorySpanExporter())]
})))

// needed to test context propagation
const contextManager = new AsyncHooksContextManager()
OtelApi.context.setGlobalContextManager(contextManager)

describe("Tracer", () => {
  describe("provided", () => {
    it.effect("withSpan", () =>
      Effect.gen(function*() {
        const span = yield* Effect.currentSpan
        assert.instanceOf(span, OtelTracer.OtelSpan)
      }).pipe(
        Effect.withSpan("ok"),
        Effect.provide(TracingLayer)
      ))

    it.effect("withSpan links", () =>
      Effect.gen(function*() {
        const linkedSpan = yield* Effect.makeSpanScoped("B")
        const span = yield* Effect.currentSpan.pipe(
          Effect.withSpan("A"),
          Effect.linkSpans(linkedSpan)
        )
        assert.instanceOf(span, OtelTracer.OtelSpan)
        assert.lengthOf(span.links, 1)
      }).pipe(
        Effect.provide(TracingLayer)
      ))

    it.effect("nested withSpan sets correct parent chain", () =>
      Effect.gen(function*() {
        const child = yield* Effect.currentSpan.pipe(
          Effect.withSpan("child"),
          Effect.withSpan("parent")
        )
        assert.instanceOf(child, OtelTracer.OtelSpan)
        assert.strictEqual(child.name, "child")
        assert.isDefined(child.parent)
        assert.strictEqual((child.parent.valueOrUndefined! as OtelTracer.OtelSpan).name, "parent")
      }).pipe(
        Effect.provide(TracingLayer)
      ))

    it.effect("supervisor sets context", () =>
      Effect.sync(() => {
        const context = OtelApi.context.active()
        assert.isDefined(OtelApi.trace.getSpan(context))
      }).pipe(
        Effect.withSpan("ok"),
        Effect.provide(TracingLayer)
      ))

    it.effect("supervisor sets context generator", () =>
      Effect.gen(function*() {
        yield* Effect.yieldNow
        const context = OtelApi.context.active()
        assert.isDefined(OtelApi.trace.getSpan(context))
      }).pipe(
        Effect.withSpan("ok"),
        Effect.provide(TracingLayer)
      ))

    it.effect("currentOtelSpan", () =>
      Effect.gen(function*() {
        const span = yield* Effect.currentSpan
        const otelSpan = yield* OtelTracer.currentOtelSpan
        assert.strictEqual((span as OtelTracer.OtelSpan).span, otelSpan)
      }).pipe(
        Effect.withSpan("ok"),
        Effect.provide(TracingLayer)
      ))

    it.effect.each([OtelApi.SpanStatusCode.UNSET, OtelApi.SpanStatusCode.OK])(
      "honors non-error wrapper status %s",
      (status) =>
        Effect.gen(function*() {
          const span = yield* Effect.currentSpan
          const wrapper = yield* OtelTracer.currentOtelSpan
          wrapper.setStatus({ code: status })
          wrapper.end()
          assert.strictEqual(span.status._tag, "Ended")
          if (span.status._tag === "Ended") {
            assert.strictEqual(span.status.exit._tag, "Success")
          }
        }).pipe(Effect.withSpan("repro"))
    )

    it.effect("honors an error wrapper status", () =>
      Effect.gen(function*() {
        const span = yield* Effect.currentSpan
        const wrapper = yield* OtelTracer.currentOtelSpan
        wrapper.setStatus({ code: OtelApi.SpanStatusCode.ERROR })
        wrapper.end()
        assert.strictEqual(span.status._tag, "Ended")
        if (span.status._tag === "Ended") {
          assert.strictEqual(span.status.exit._tag, "Failure")
        }
      }).pipe(Effect.withSpan("repro")))

    it.effect("preserves the sampling decision of generic external spans", () =>
      Effect.gen(function*() {
        const span = yield* Effect.currentSpan
        assert.instanceOf(span, OtelTracer.OtelSpan)
        assert.strictEqual(span.span.spanContext().traceFlags, OtelApi.TraceFlags.NONE)
      }).pipe(
        Effect.withSpan("child"),
        Effect.withParentSpan(EffectTracer.externalSpan({
          traceId: "1".repeat(32),
          spanId: "2".repeat(16),
          sampled: false
        })),
        Effect.provide(TracingLayer)
      ))

    it("preserves trace state and locality on an active OpenTelemetry parent", () => {
      const parent: OtelApi.SpanContext = {
        traceId: "1".repeat(32),
        spanId: "2".repeat(16),
        traceFlags: OtelApi.TraceFlags.SAMPLED,
        traceState: OtelApi.createTraceState("vendor=value"),
        isRemote: false
      }
      const active = OtelApi.trace.setSpanContext(OtelApi.ROOT_CONTEXT, parent)
      let receivedParent: OtelApi.SpanContext | undefined
      const tracer = {
        startSpan(_name: string, _options: unknown, context: OtelApi.Context) {
          receivedParent = OtelApi.trace.getSpanContext(context)
          return {
            spanContext: () => ({
              traceId: "3".repeat(32),
              spanId: "4".repeat(16),
              traceFlags: OtelApi.TraceFlags.SAMPLED
            })
          } as OtelApi.Span
        }
      } as OtelApi.Tracer

      const child = new OtelTracer.OtelSpan(
        { active: () => active } as OtelApi.ContextAPI,
        OtelApi.trace,
        tracer,
        {
          name: "child",
          parent: Option.none(),
          annotations: EffectContext.empty(),
          links: [],
          startTime: 0n,
          kind: "internal",
          root: false,
          sampled: true
        }
      )

      assert.instanceOf(child, OtelTracer.OtelSpan)
      assert.deepStrictEqual(
        [receivedParent?.traceState?.serialize(), receivedParent?.isRemote],
        ["vendor=value", false]
      )
    })

    it.effect("records every pretty error", () =>
      Effect.gen(function*() {
        const exporter = new InMemorySpanExporter()
        const spanProcessor = new SimpleSpanProcessor(exporter)
        const firstFailure = Cause.fail(new Error("first"))
        const secondFailure = Cause.fail(new Error("second"))
        const cause = Cause.combine(firstFailure, secondFailure)

        yield* Effect.failCause(cause).pipe(
          Effect.withSpan("error-span"),
          Effect.andThen(Effect.never), // keep the exporter alive
          Effect.provide(NodeSdk.layer(() => ({
            resource: {
              serviceName: "test"
            },
            spanProcessor: [spanProcessor]
          }))),
          Effect.forkChild({ startImmediately: true })
        )

        const spanData = exporter.getFinishedSpans()[0]
        if (spanData === undefined) {
          return yield* Effect.die("Missing span data")
        }
        const exceptionEvents = spanData.events.filter((event) => event.name === "exception")
        assert.lengthOf(exceptionEvents, 2)
        assert.strictEqual(spanData.status.message, "first")
      }))

    it.effect("renders nested error causes in the stacktrace", () =>
      Effect.gen(function*() {
        const exporter = new InMemorySpanExporter()
        const spanProcessor = new SimpleSpanProcessor(exporter)
        const error = new Error("outer failure", { cause: new Error("inner cause") })

        yield* Effect.die(error).pipe(
          Effect.withSpan("error-span"),
          Effect.andThen(Effect.never), // keep the exporter alive
          Effect.provide(NodeSdk.layer(() => ({
            resource: {
              serviceName: "test"
            },
            spanProcessor: [spanProcessor]
          }))),
          Effect.forkChild({ startImmediately: true })
        )

        const spanData = exporter.getFinishedSpans()[0]
        if (spanData === undefined) {
          return yield* Effect.die("Missing span data")
        }
        const exceptionEvent = spanData.events.find((event) => event.name === "exception")
        assert(exceptionEvent !== undefined)
        const stacktrace = exceptionEvent.attributes?.["exception.stacktrace"]
        assert.isString(stacktrace)
        assert.include(stacktrace as string, "[cause]: Error: inner cause")
      }))

    it.effect("withSpanContext", () =>
      Effect.gen(function*() {
        const effect = Effect.gen(function*() {
          const span = yield* Effect.currentParentSpan
          assert(span._tag === "Span")
          if (span.parent._tag === "None") {
            return yield* Effect.die("No parent span")
          }
          return span.parent.value
        }).pipe(Effect.withSpan("child"))

        const services = yield* Effect.context<never>()

        yield* Effect.promise(async () => {
          await OtelApi.trace.getTracer("test").startActiveSpan("otel-span", {
            root: true,
            attributes: { "root": "yes" }
          }, async (span) => {
            try {
              const parent = await effect.pipe(
                OtelTracer.withSpanContext(span.spanContext()),
                Effect.provideContext(services),
                Effect.runPromise
              )
              const { spanId, traceId } = span.spanContext()
              assert.containsSubset(parent, {
                spanId,
                traceId
              })
            } finally {
              span.end()
            }
          })
        })
      }).pipe(
        Effect.provide(TracingLayer)
      ))
  })

  describe("not provided", () => {
    it.effect("withSpan", () =>
      Effect.gen(function*() {
        const span = yield* Effect.currentSpan
        assert.notInstanceOf(span, OtelTracer.OtelSpan)
      }).pipe(
        Effect.withSpan("ok")
      ))
  })
})
