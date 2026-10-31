import { describe, it } from "@effect/vitest"
import { assertNone, strictEqual } from "@effect/vitest/utils"
import { Effect, Option, Tracer } from "effect"
import { Headers, HttpTraceContext } from "effect/http"

const traceId = "80f198ee56343ba864fe8b2a57d3eff7"
const spanId = "e457b5a2e4d86bd1"

const assertSampled = (headers: Record<string, string>, sampled: boolean) => {
  const span = Option.getOrThrow(HttpTraceContext.fromHeaders(Headers.fromInput(headers)))
  strictEqual(span.traceId, traceId)
  strictEqual(span.spanId, spanId)
  strictEqual(span.sampled, sampled)
}

describe("HttpTraceContext", () => {
  describe("fromHeaders", () => {
    it("accepts single-header B3 debug sampling", () => {
      assertSampled({ b3: `${traceId}-${spanId}-d` }, true)
    })

    it("accepts legacy X-B3-Sampled: true", () => {
      assertSampled({ "X-B3-TraceId": traceId, "X-B3-SpanId": spanId, "X-B3-Sampled": "true" }, true)
    })

    it("lets X-B3-Flags debug override X-B3-Sampled: 0", () => {
      assertSampled({
        "X-B3-TraceId": traceId,
        "X-B3-SpanId": spanId,
        "X-B3-Sampled": "0",
        "X-B3-Flags": "1"
      }, true)
    })

    it.each([
      { b3: `${traceId.slice(16)}-${spanId}-1` },
      { "X-B3-TraceId": traceId.slice(16), "X-B3-SpanId": spanId }
    ])("accepts a 64-bit B3 trace-id: %j", (headers) => {
      const span = Option.getOrThrow(HttpTraceContext.fromHeaders(Headers.fromInput(headers)))
      strictEqual(span.traceId, traceId.slice(16))
      strictEqual(span.spanId, spanId)
    })

    it.each([
      { b3: `<script>-${spanId}-1` },
      { b3: `${traceId}-${spanId.slice(0, -1)}g-1` },
      { b3: `${traceId.slice(0, -1)}-${spanId}-1` },
      { b3: `${traceId}-${spanId.slice(0, -1)}-1` },
      { b3: `${traceId.toUpperCase()}-${spanId}-1` },
      { b3: `${traceId}-${spanId.toUpperCase()}-1` },
      { "X-B3-TraceId": "<script>", "X-B3-SpanId": spanId },
      { "X-B3-TraceId": traceId, "X-B3-SpanId": `${spanId.slice(0, -1)}g` },
      { "X-B3-TraceId": traceId.slice(0, -1), "X-B3-SpanId": spanId },
      { "X-B3-TraceId": traceId, "X-B3-SpanId": spanId.slice(0, -1) },
      { "X-B3-TraceId": traceId.toUpperCase(), "X-B3-SpanId": spanId },
      { "X-B3-TraceId": traceId, "X-B3-SpanId": spanId.toUpperCase() }
    ])("rejects invalid B3 identifiers: %j", (headers) => {
      assertNone(HttpTraceContext.fromHeaders(Headers.fromInput(headers)))
    })

    it.each([
      `00-${traceId.toUpperCase()}-${spanId}-01`,
      `00-${traceId}-${spanId.toUpperCase()}-01`
    ])("rejects uppercase W3C identifiers: %s", (traceparent) => {
      assertNone(HttpTraceContext.fromHeaders(Headers.fromInput({ traceparent })))
    })

    it("reads the sampled bit from W3C trace flags", () => {
      assertSampled({ traceparent: `00-${traceId}-${spanId}-02` }, false)
      assertSampled({ traceparent: `00-${traceId}-${spanId}-ff` }, true)
    })

    it.each(["1", "001", "0g", "FF"])("rejects malformed W3C trace flags: %j", (flags) => {
      assertNone(HttpTraceContext.fromHeaders(Headers.fromInput({ traceparent: `00-${traceId}-${spanId}-${flags}` })))
    })

    it("rejects an all-zero W3C trace-id", () => {
      strictEqual(
        Option.isNone(HttpTraceContext.fromHeaders(Headers.fromInput({
          traceparent: `00-${"0".repeat(32)}-${spanId}-01`
        }))),
        true
      )
    })

    it("rejects an all-zero W3C parent-id", () => {
      strictEqual(
        Option.isNone(HttpTraceContext.fromHeaders(Headers.fromInput({
          traceparent: `00-${traceId}-${"0".repeat(16)}-01`
        }))),
        true
      )
    })
  })

  describe("toHeaders", () => {
    it.effect("pads a 64-bit trace-id in traceparent and keeps it in b3", () =>
      Effect.gen(function*() {
        const span = yield* Effect.makeSpan("test", {
          parent: Tracer.externalSpan({ traceId: "463ac35c9f6413ad", spanId })
        })
        const headers = HttpTraceContext.toHeaders(span)
        strictEqual(headers.traceparent, `00-0000000000000000463ac35c9f6413ad-${span.spanId}-01`)
        strictEqual(headers.b3, `463ac35c9f6413ad-${span.spanId}-1-${spanId}`)
        strictEqual(span.traceId, "463ac35c9f6413ad")
      }))
  })
})
