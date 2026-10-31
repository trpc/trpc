import * as NodeSdk from "@effect/opentelemetry/NodeSdk"
import * as OtelLogger from "@effect/opentelemetry/OtelLogger"
import * as OtelTracer from "@effect/opentelemetry/OtelTracer"
import * as Resource from "@effect/opentelemetry/Resource"
import { assert, describe, it } from "@effect/vitest"
import * as OtelApi from "@opentelemetry/api"
import { SeverityNumber } from "@opentelemetry/api-logs"
import { AsyncHooksContextManager } from "@opentelemetry/context-async-hooks"
import { InMemoryLogRecordExporter, type LogRecordProcessor, SimpleLogRecordProcessor } from "@opentelemetry/sdk-logs"
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base"
import * as Cause from "effect/Cause"
import * as Clock from "effect/Clock"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as References from "effect/References"
import { TestClock } from "effect/testing"
import * as Tracer from "effect/Tracer"
import * as Version from "effect/Version"

describe("Logger", () => {
  const makeTestLayer = (exporter: InMemoryLogRecordExporter) =>
    NodeSdk.layer(Effect.sync(() => ({
      resource: { serviceName: "test", serviceVersion: "service-version" },
      logRecordProcessor: [new SimpleLogRecordProcessor({ exporter })]
    })))

  it.effect("adds SDK resource defaults when the resource comes only from the environment", () => {
    const exporter = new InMemoryLogRecordExporter()
    return Effect.gen(function*() {
      yield* Effect.log("test")
      const record = exporter.getFinishedLogRecords()[0]!
      assert.strictEqual(record.instrumentationScope.name, "effect")
      assert.strictEqual(record.instrumentationScope.version, Version.getCurrentVersion())
      assert.deepStrictEqual(record.resource.attributes, {
        "service.name": "env-service",
        "telemetry.sdk.name": "@effect/opentelemetry",
        "telemetry.sdk.language": "nodejs",
        "telemetry.sdk.version": Version.getCurrentVersion()
      })
    }).pipe(
      Effect.provide(NodeSdk.layer(() => ({ logRecordProcessor: [new SimpleLogRecordProcessor({ exporter })] }))),
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromEnv({ env: { OTEL_SERVICE_NAME: "env-service" } })
      )
    )
  })

  it.effect("namespaces generated attributes and lets them override annotations", () => {
    const exporter = new InMemoryLogRecordExporter()
    return Effect.gen(function*() {
      const fiber = yield* Effect.fiber
      yield* Effect.gen(function*() {
        yield* TestClock.adjust("5 millis")
        yield* Effect.logError(
          "boom",
          Cause.fail(new TypeError("cause message", { cause: new Error("nested failure") }))
        )
      }).pipe(
        Effect.withLogSpan("op"),
        Effect.annotateLogs({
          "effect.fiberId": -1,
          "effect.log_span.op": -1,
          "exception.type": "annotated type",
          "exception.message": "annotated message",
          "exception.stacktrace": "annotated stack"
        })
      )

      const attributes = exporter.getFinishedLogRecords()[0]!.attributes
      assert.strictEqual(attributes["effect.fiberId"], fiber.id)
      assert.strictEqual(attributes["effect.log_span.op"], 5)
      assert.strictEqual(attributes["exception.type"], "TypeError")
      assert.strictEqual(attributes["exception.message"], "cause message")
      assert.include(attributes["exception.stacktrace"], "nested failure")
    }).pipe(Effect.provide(makeTestLayer(exporter)))
  })

  it.effect("shuts down the logger provider after forceFlush rejects", () =>
    Effect.gen(function*() {
      let shutdowns = 0
      const processor: LogRecordProcessor = {
        onEmit() {},
        forceFlush: () => Promise.reject(new Error("flush failed")),
        shutdown: () => {
          shutdowns++
          return Promise.resolve()
        }
      }
      yield* Effect.exit(
        Effect.scoped(Layer.build(OtelLogger.layerLoggerProvider(processor)).pipe(Effect.provide(Resource.layerEmpty)))
      )
      assert.strictEqual(shutdowns, 1)
    }))

  describe("provided", () => {
    const exporter = new InMemoryLogRecordExporter()

    const TracingLayer = NodeSdk.layer(Effect.sync(() => ({
      resource: {
        serviceName: "test"
      },
      logRecordProcessor: [new SimpleLogRecordProcessor({ exporter })]
    })))

    it.effect("emits log records", () =>
      Effect.gen(function*() {
        yield* Effect.log("test").pipe(
          Effect.repeat({ times: 9 })
        )
        assert.lengthOf(exporter.getFinishedLogRecords(), 10)
        const log = exporter.getFinishedLogRecords()[0]!
        assert.isUndefined(log.spanContext)
        assert.isUndefined(log.attributes.traceId)
        assert.isUndefined(log.attributes.spanId)
      }).pipe(Effect.provide(TracingLayer)))

    it.effect("maps Effect LogLevel to OTel SeverityNumber spec values", () => {
      const severityExporter = new InMemoryLogRecordExporter()
      const SeverityLayer = NodeSdk.layer(Effect.sync(() => ({
        resource: { serviceName: "test" },
        logRecordProcessor: [new SimpleLogRecordProcessor({ exporter: severityExporter })]
      })))

      return Effect.gen(function*() {
        yield* Effect.logTrace("trace")
        yield* Effect.logDebug("debug")
        yield* Effect.logInfo("info")
        yield* Effect.logWarning("warn")
        yield* Effect.logError("error")
        yield* Effect.logFatal("fatal")

        const records = severityExporter.getFinishedLogRecords()
        const byText = Object.fromEntries(records.map((r) => [r.severityText, r.severityNumber]))

        assert.strictEqual(byText.Trace, SeverityNumber.TRACE)
        assert.strictEqual(byText.Debug, SeverityNumber.DEBUG)
        assert.strictEqual(byText.Info, SeverityNumber.INFO)
        assert.strictEqual(byText.Warn, SeverityNumber.WARN)
        assert.strictEqual(byText.Error, SeverityNumber.ERROR)
        assert.strictEqual(byText.Fatal, SeverityNumber.FATAL)
      }).pipe(
        Effect.provide(SeverityLayer.pipe(Layer.provideMerge(Layer.succeed(References.MinimumLogLevel, "Trace"))))
      )
    })

    it.effect("keeps event time separate from observed time and uses wall-clock span time", () => {
      const logExporter = new InMemoryLogRecordExporter()
      const spanExporter = new InMemorySpanExporter()
      const wallTimeNanos = 1_735_689_600_123_456_789n
      const monotonicTimeNanos = 123_456_789n
      const expectedTime: readonly [number, number] = [
        Number(wallTimeNanos / BigInt(1_000_000_000)),
        Number(wallTimeNanos % BigInt(1_000_000_000))
      ]
      const skewedClock: Clock.Clock = {
        currentTimeMillisUnsafe: () => 1,
        currentTimeMillis: Effect.succeed(1),
        currentTimeNanosUnsafe: () => wallTimeNanos,
        currentTimeNanos: Effect.succeed(wallTimeNanos),
        monotonicTimeNanosUnsafe: () => monotonicTimeNanos,
        monotonicTimeNanos: Effect.succeed(monotonicTimeNanos),
        sleep: () => Effect.void
      }

      const TracingLayer = NodeSdk.layer(Effect.sync(() => ({
        resource: {
          serviceName: "test"
        },
        spanProcessor: [new SimpleSpanProcessor(spanExporter)],
        logRecordProcessor: [new SimpleLogRecordProcessor({ exporter: logExporter })]
      })))

      return Effect.gen(function*() {
        yield* Effect.log("test").pipe(
          Effect.withSpan("parent")
        )

        const logs = logExporter.getFinishedLogRecords()
        const spans = spanExporter.getFinishedSpans()
        assert.lengthOf(logs, 1)
        assert.lengthOf(spans, 1)
        const log = logs[0]!
        const span = spans[0]!

        assert.deepStrictEqual(log.hrTime, [0, 1_000_000])
        assert.deepStrictEqual(log.hrTimeObserved, expectedTime)
        assert.deepStrictEqual(log.hrTimeObserved, span.startTime)
        assert.strictEqual(log.attributes.spanId, span.spanContext().spanId)
        assert.strictEqual(log.attributes.traceId, span.spanContext().traceId)
      }).pipe(
        Effect.provide(TracingLayer),
        Effect.provideService(Clock.Clock, skewedClock)
      )
    })

    it.effect("does not let annotations overwrite active span correlation", () => {
      const logExporter = new InMemoryLogRecordExporter()
      const spanExporter = new InMemorySpanExporter()
      const TracingLayer = NodeSdk.layer(Effect.sync(() => ({
        resource: { serviceName: "test" },
        spanProcessor: [new SimpleSpanProcessor(spanExporter)],
        logRecordProcessor: [new SimpleLogRecordProcessor({ exporter: logExporter })]
      })))

      return Effect.gen(function*() {
        yield* Effect.log("test").pipe(
          Effect.annotateLogs({ traceId: "spoof-trace", spanId: "spoof-span" }),
          Effect.withSpan("parent")
        )

        const log = logExporter.getFinishedLogRecords()[0]!
        const span = spanExporter.getFinishedSpans()[0]!
        assert.strictEqual(log.attributes.traceId, span.spanContext().traceId)
        assert.strictEqual(log.attributes.spanId, span.spanContext().spanId)
        assert.deepStrictEqual(log.spanContext, span.spanContext())
      }).pipe(Effect.provide(TracingLayer))
    })

    it.effect("correlates a log with an external parent span", () => {
      const logExporter = new InMemoryLogRecordExporter()
      const traceId = "ab".repeat(16)
      const spanId = "cd".repeat(8)

      return Effect.gen(function*() {
        yield* Effect.log("test").pipe(
          Effect.withParentSpan(Tracer.externalSpan({
            traceId,
            spanId,
            sampled: false,
            annotations: OtelTracer.OtelTraceFlags.context(0x02 as OtelApi.TraceFlags).pipe(
              Context.add(OtelTracer.OtelTraceState, OtelApi.createTraceState("vendor=value"))
            )
          }))
        )
        const log = logExporter.getFinishedLogRecords()[0]!
        assert.strictEqual(log.spanContext?.traceId, traceId)
        assert.strictEqual(log.spanContext?.spanId, spanId)
        assert.strictEqual(log.spanContext?.traceFlags, 0x02)
        assert.strictEqual(log.spanContext?.traceState?.serialize(), "vendor=value")
        assert.isTrue(log.spanContext?.isRemote)
      }).pipe(Effect.provide(makeTestLayer(logExporter)))
    })

    it("uses ambient context only when there is no Effect parent span", async () => {
      const contextManager = new AsyncHooksContextManager()
      OtelApi.context.setGlobalContextManager(contextManager.enable())
      try {
        const logExporter = new InMemoryLogRecordExporter()
        const ambientSpan: OtelApi.SpanContext = {
          traceId: "ab".repeat(16),
          spanId: "cd".repeat(8),
          traceFlags: OtelApi.TraceFlags.SAMPLED
        }
        const effectSpan = Tracer.externalSpan({ traceId: "ef".repeat(16), spanId: "12".repeat(8) })
        const active = OtelApi.trace.setSpanContext(OtelApi.ROOT_CONTEXT, ambientSpan)
        await OtelApi.context.with(active, () =>
          Effect.runPromise(
            Effect.gen(function*() {
              yield* Effect.log("ambient")
              yield* Effect.log("effect").pipe(Effect.withParentSpan(effectSpan))
              const logs = logExporter.getFinishedLogRecords()
              assert.lengthOf(logs, 2)
              assert.deepStrictEqual(logs[0]!.spanContext, ambientSpan)
              assert.isUndefined(logs[0]!.attributes.traceId)
              assert.isUndefined(logs[0]!.attributes.spanId)
              assert.strictEqual(logs[1]!.spanContext?.traceId, effectSpan.traceId)
              assert.strictEqual(logs[1]!.spanContext?.spanId, effectSpan.spanId)
            }).pipe(Effect.provide(makeTestLayer(logExporter)))
          ))
      } finally {
        OtelApi.context.disable()
        contextManager.disable()
      }
    })
  })

  describe("not provided", () => {
    const exporter = new InMemoryLogRecordExporter()

    const TracingLayer = NodeSdk.layer(Effect.sync(() => ({
      resource: {
        serviceName: "test"
      }
    })))

    it.effect("withSpan", () =>
      Effect.gen(function*() {
        yield* Effect.log("test")
        assert.lengthOf(exporter.getFinishedLogRecords(), 0)
      }).pipe(Effect.provide(TracingLayer)))
  })
})
