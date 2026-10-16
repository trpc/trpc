import * as NodeSdk from "@effect/opentelemetry/NodeSdk"
import * as OtelLogger from "@effect/opentelemetry/OtelLogger"
import * as Resource from "@effect/opentelemetry/Resource"
import { assert, describe, it } from "@effect/vitest"
import { SeverityNumber } from "@opentelemetry/api-logs"
import { InMemoryLogRecordExporter, type LogRecordProcessor, SimpleLogRecordProcessor } from "@opentelemetry/sdk-logs"
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base"
import * as Clock from "effect/Clock"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as References from "effect/References"

describe("Logger", () => {
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

    it.effect("uses wall-clock timestamps and keeps them aligned with spans", () => {
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

        assert.deepStrictEqual(log.hrTime, expectedTime)
        assert.deepStrictEqual(log.hrTimeObserved, expectedTime)
        assert.deepStrictEqual(log.hrTime, span.startTime)
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
      }).pipe(Effect.provide(TracingLayer))
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
