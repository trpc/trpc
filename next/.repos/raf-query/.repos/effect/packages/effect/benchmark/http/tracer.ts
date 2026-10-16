import { Effect } from "effect"
import * as Headers from "effect/http/Headers"
import * as HttpMiddleware from "effect/http/HttpMiddleware"
import * as HttpServerRequest from "effect/http/HttpServerRequest"
import * as HttpServerResponse from "effect/http/HttpServerResponse"
import * as HttpTraceContext from "effect/http/HttpTraceContext"
import * as Tracer from "effect/Tracer"
import { Bench } from "tinybench"

const bench = new Bench()

const noopTracer = Tracer.make({
  span: (options) =>
    ({
      _tag: "Span",
      spanId: "spanid0123456789",
      traceId: "traceid0123456789traceid01234567",
      sampled: true,
      name: options.name,
      parent: options.parent,
      annotations: options.annotations,
      links: options.links,
      kind: options.kind,
      status: { _tag: "Started", startTime: options.startTime },
      attributes: new Map(),
      attribute() {},
      event() {},
      end() {},
      addLinks() {}
    }) as Tracer.Span
})

const request = HttpServerRequest.fromWeb(
  new Request("http://localhost:3000/some/path?foo=bar", {
    headers: {
      "user-agent": "bench/1.0",
      "accept": "application/json",
      "accept-encoding": "gzip, br",
      "authorization": "Bearer secret",
      "cookie": "session=abc",
      "x-request-id": "12345678",
      "host": "localhost:3000"
    }
  })
)

const requestWithTraceparent = HttpServerRequest.fromWeb(
  new Request("http://localhost:3000/some/path?foo=bar", {
    headers: {
      "traceparent": "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
      "host": "localhost:3000"
    }
  })
)

const app = Effect.succeed(HttpServerResponse.text("ok"))

const tracedApp = HttpMiddleware.tracer(app).pipe(
  Effect.provideService(HttpServerRequest.HttpServerRequest, request),
  Effect.provideService(Tracer.Tracer, noopTracer)
)

const tracedAppNative = HttpMiddleware.tracer(app).pipe(
  Effect.provideService(HttpServerRequest.HttpServerRequest, request)
)

const tracedAppDisabled = HttpMiddleware.tracer(app).pipe(
  Effect.provideService(HttpServerRequest.HttpServerRequest, request),
  Effect.withTracerEnabled(false)
)

const bareApp = app.pipe(
  Effect.provideService(HttpServerRequest.HttpServerRequest, request)
)

const withSpanApp = Effect.void.pipe(
  Effect.withSpan("bench"),
  Effect.provideService(Tracer.Tracer, noopTracer)
)

const withSpanAppNoStack = Effect.void.pipe(
  Effect.withSpan("bench", undefined, { captureStackTrace: false }),
  Effect.provideService(Tracer.Tracer, noopTracer)
)

const withSpanDisabled = Effect.void.pipe(
  Effect.withSpan("bench"),
  Effect.withTracerEnabled(false)
)

bench
  .add("bare app (no middleware)", async () => {
    await Effect.runPromise(bareApp)
  })
  .add("tracer middleware (noop tracer)", async () => {
    await Effect.runPromise(tracedApp)
  })
  .add("tracer middleware (NativeSpan)", async () => {
    await Effect.runPromise(tracedAppNative)
  })
  .add("tracer middleware (tracing disabled)", async () => {
    await Effect.runPromise(tracedAppDisabled)
  })
  .add("withSpan reused (noop tracer)", async () => {
    await Effect.runPromise(withSpanApp)
  })
  .add("withSpan constructed per run (noop tracer)", async () => {
    await Effect.runPromise(
      Effect.void.pipe(
        Effect.withSpan("bench"),
        Effect.provideService(Tracer.Tracer, noopTracer)
      )
    )
  })
  .add("withSpan constructed per run, no stack capture", async () => {
    await Effect.runPromise(
      Effect.void.pipe(
        Effect.withSpan("bench", undefined, { captureStackTrace: false }),
        Effect.provideService(Tracer.Tracer, noopTracer)
      )
    )
  })
  .add("withSpan reused, no stack capture (noop tracer)", async () => {
    await Effect.runPromise(withSpanAppNoStack)
  })
  .add("withSpan reused (tracing disabled)", async () => {
    await Effect.runPromise(withSpanDisabled)
  })
  .add("fromHeaders: no trace headers", () => {
    HttpTraceContext.fromHeaders(request.headers)
  })
  .add("fromHeaders: traceparent", () => {
    HttpTraceContext.fromHeaders(requestWithTraceparent.headers)
  })
  .add("Headers.redact (7 headers, default names)", () => {
    Headers.redact(request.headers, ["authorization", "cookie", "set-cookie", "x-api-key"])
  })
  .add("Request.toURL", () => {
    HttpServerRequest.toURL(request)
  })

await bench.run()
console.table(bench.table())
