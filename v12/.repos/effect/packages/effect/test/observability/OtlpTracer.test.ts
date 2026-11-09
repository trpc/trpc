import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Tracer } from "effect"
import { HttpClient, HttpClientResponse } from "effect/http"
import type { HttpClientError } from "effect/http"
import { OtlpExporter, OtlpSerialization, OtlpTracer } from "effect/observability"
import * as Version from "effect/Version"

const capture = () => {
  const exports: Array<{
    scope: { name: string; version: string }
    spans: Array<{ traceId: string; links: Array<{ traceId: string }> }>
  }> = []
  const httpClient = HttpClient.makeWith(
    Effect.fnUntraced(function*(requestEffect) {
      const request = yield* requestEffect
      assert(request.body._tag === "Uint8Array")
      const body = JSON.parse(new TextDecoder().decode(request.body.body))
      exports.push(body.resourceSpans[0].scopeSpans[0])
      return HttpClientResponse.fromWeb(request, new Response())
    }),
    Effect.succeed as HttpClient.HttpClient.Preprocess<HttpClientError.HttpClientError, never>
  )
  const layer = OtlpTracer.layer({
    url: "http://localhost:4318/v1/traces",
    resource: { serviceName: "test", serviceVersion: "service-version" },
    exportInterval: "1 hour"
  }).pipe(
    Layer.provide(OtlpSerialization.layerJson),
    Layer.provide(Layer.succeed(HttpClient.HttpClient, httpClient))
  )
  return { exports, layer }
}

describe("OtlpTracer", () => {
  it.effect("uses effect as the instrumentation scope, not the service name", () => {
    const { exports, layer } = capture()
    return Effect.gen(function*() {
      yield* Effect.void.pipe(Effect.withSpan("test"))
      yield* (yield* OtlpExporter.Flusher).flush
      assert.deepStrictEqual(exports[0].scope, { name: "effect", version: Version.getCurrentVersion() })
    }).pipe(Effect.provide(layer))
  })

  it.effect("pads 64-bit trace ids in spans and links", () => {
    const { exports, layer } = capture()
    const parent = Tracer.externalSpan({ traceId: "463ac35c9f6413ad", spanId: "0020000000000001" })
    return Effect.gen(function*() {
      yield* Effect.void.pipe(Effect.withSpan("test", { parent, links: [{ span: parent, attributes: {} }] }))
      yield* (yield* OtlpExporter.Flusher).flush
      assert.strictEqual(exports[0].spans[0].traceId, "0000000000000000463ac35c9f6413ad")
      assert.strictEqual(exports[0].spans[0].links[0].traceId, "0000000000000000463ac35c9f6413ad")
    }).pipe(Effect.provide(layer))
  })
})
