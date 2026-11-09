import * as NodeSdk from "@effect/opentelemetry/NodeSdk"
import * as OtelTracer from "@effect/opentelemetry/OtelTracer"
import * as Resource from "@effect/opentelemetry/Resource"
import { assert, describe, it } from "@effect/vitest"
import * as OtelApi from "@opentelemetry/api"
import { AsyncHooksContextManager } from "@opentelemetry/context-async-hooks"
import { InMemorySpanExporter, SimpleSpanProcessor, type SpanExporter } from "@opentelemetry/sdk-trace-base"
import * as Cause from "effect/Cause"
import * as EffectContext from "effect/Context"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as HttpRouter from "effect/http/HttpRouter"
import * as HttpServerResponse from "effect/http/HttpServerResponse"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as EffectTracer from "effect/Tracer"
import * as Version from "effect/Version"

const TracingLayer = OtelTracer.layer.pipe(
  Layer.provide(NodeSdk.layerTracerProvider([new SimpleSpanProcessor(new InMemorySpanExporter())])),
  Layer.provide(Resource.layerEmpty)
)

// needed to test context propagation
const contextManager = new AsyncHooksContextManager()
OtelApi.context.setGlobalContextManager(contextManager.enable())

describe("Tracer", () => {
  it.effect("uses the shared Effect version as the tracer instrumentation scope", () => {
    const exporter = new InMemorySpanExporter()
    const layer = NodeSdk.layer(Effect.sync(() => ({
      resource: { serviceName: "test", serviceVersion: "service-version" },
      spanProcessor: [new SimpleSpanProcessor(exporter)]
    })))
    return Effect.gen(function*() {
      yield* Effect.void.pipe(Effect.withSpan("test"))
      const scope = exporter.getFinishedSpans()[0]!.instrumentationScope
      assert.strictEqual(scope.name, "effect")
      assert.strictEqual(scope.version, Version.getCurrentVersion())
    }).pipe(Effect.provide(layer))
  })

  it("exports the HTTP server span when disposed right after the response", async () => {
    const exported: Array<string> = []
    const exporter: SpanExporter = {
      export: (spans, done) => {
        exported.push(...spans.map((span) => span.name))
        done({ code: 0 })
      },
      shutdown: () => Promise.resolve()
    }
    const { dispose, handler } = HttpRouter.toWebHandler(
      HttpRouter.add("GET", "/", Effect.succeed(HttpServerResponse.text("ok"))).pipe(
        Layer.provideMerge(NodeSdk.layer(() => ({
          resource: { serviceName: "test" },
          spanProcessor: new SimpleSpanProcessor(exporter)
        })))
      ),
      { disableLogger: true }
    )

    const response = await handler(new Request("http://localhost/"))
    assert.strictEqual(await response.text(), "ok")
    await dispose()

    assert.deepStrictEqual(exported, ["GET"])
  })

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

    it.effect("inherits an OpenTelemetry span started inside an Effect span", () =>
      Effect.gen(function*() {
        const services = yield* Effect.context<never>()
        const tracer = yield* OtelTracer.OtelTracer
        yield* Effect.promise(() =>
          tracer.startActiveSpan("otel-parent", async (parent) => {
            try {
              const child = await Effect.runPromise(Effect.currentSpan.pipe(
                Effect.withSpan("child"),
                Effect.provideContext(services)
              ))

              assert.strictEqual(child.traceId, parent.spanContext().traceId)
              assert.strictEqual(Option.getOrThrow(child.parent).spanId, parent.spanContext().spanId)
            } finally {
              parent.end()
            }
          })
        ).pipe(Effect.withSpan("outer"))
      }).pipe(Effect.provide(TracingLayer)))

    it.effect("does not inherit an ambient Effect span when re-entering from JavaScript", () =>
      Effect.gen(function*() {
        const services = yield* Effect.context<never>()
        yield* Effect.gen(function*() {
          const outer = yield* Effect.currentSpan
          const child = yield* Effect.promise(() =>
            Effect.runPromise(Effect.currentSpan.pipe(
              Effect.withSpan("child"),
              Effect.provideContext(services)
            ))
          )

          assert.isTrue(Option.isNone(child.parent))
          assert.notStrictEqual(child.traceId, outer.traceId)
        }).pipe(Effect.withSpan("outer"))
      }).pipe(Effect.provide(TracingLayer)))

    it.effect("a propagation-disabled Effect span is not a parent", () =>
      Effect.gen(function*() {
        const child = yield* Effect.currentSpan.pipe(
          Effect.withSpan("child"),
          Effect.withSpan("disabled", { annotations: EffectTracer.DisablePropagation.context(true) })
        )

        assert.isTrue(Option.isNone(child.parent))
      }).pipe(Effect.provide(TracingLayer)))

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

    it("preserves identity, trace state and locality on an active OpenTelemetry parent", () => {
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
          assert.strictEqual(OtelApi.trace.getSpan(context), OtelApi.trace.getSpan(active))
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

    it.effect.each([OtelApi.TraceFlags.SAMPLED, OtelApi.TraceFlags.NONE])(
      "inherits getter-based OpenTelemetry parent ids with trace flags %s",
      (traceFlags) =>
        Effect.gen(function*() {
          class GetterSpanContext implements OtelApi.SpanContext {
            get traceId() {
              return "1".repeat(32)
            }
            get spanId() {
              return "2".repeat(16)
            }
            get traceFlags() {
              return OtelApi.TraceFlags.SAMPLED
            }
          }
          const parent = new GetterSpanContext()
          const active = OtelApi.trace.setSpanContext(OtelApi.ROOT_CONTEXT, parent)
          const services = yield* Effect.context<never>()
          const child = yield* Effect.promise(() =>
            OtelApi.context.with(active, () =>
              Effect.runPromise(Effect.currentSpan.pipe(
                Effect.withSpan("child", {
                  annotations: traceFlags === OtelApi.TraceFlags.NONE
                    ? OtelTracer.OtelTraceFlags.context(traceFlags)
                    : EffectContext.empty()
                }),
                Effect.provideContext(services)
              )))
          )
          assert.strictEqual(child.traceId, parent.traceId)
          assert.strictEqual(Option.getOrThrow(child.parent).spanId, parent.spanId)
          assert.strictEqual((child as OtelTracer.OtelSpan).span.spanContext().traceFlags, traceFlags)
        }).pipe(Effect.provide(TracingLayer))
    )

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

    it.effect("leaves interruption Unset with effect.fiber.interrupted", () => {
      const exporter = new InMemorySpanExporter()
      return Effect.gen(function*() {
        const span = yield* Effect.makeSpan("test")
        span.end(span.status.startTime + 1n, Exit.interrupt())
        const spans = exporter.getFinishedSpans()
        assert.lengthOf(spans, 1)
        assert.deepStrictEqual(spans[0].status, { code: OtelApi.SpanStatusCode.UNSET })
        assert.deepStrictEqual(spans[0].events, [])
        assert.deepStrictEqual(spans[0].attributes, { "effect.fiber.interrupted": true })
      }).pipe(Effect.provide(NodeSdk.layer(() => ({
        resource: { serviceName: "test" },
        spanProcessor: [new SimpleSpanProcessor(exporter)]
      }))))
    })
    it.effect("exports homogeneous primitive arrays as array attributes", () =>
      Effect.gen(function*() {
        const exporter = new InMemorySpanExporter()
        const spanProcessor = new SimpleSpanProcessor(exporter)

        yield* Effect.void.pipe(
          Effect.withSpan("array-span", {
            attributes: {
              strings: ["a", "b"],
              numbers: [1, 2],
              booleans: [true, false],
              mixed: [1, "a"]
            }
          }),
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
        assert.deepStrictEqual(spanData.attributes.strings, ["a", "b"])
        assert.deepStrictEqual(spanData.attributes.numbers, [1, 2])
        assert.deepStrictEqual(spanData.attributes.booleans, [true, false])
        assert.isString(spanData.attributes.mixed)
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
