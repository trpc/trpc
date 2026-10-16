/**
 * Low-level devtools client and tracer wiring over the current `Socket`.
 *
 * `DevToolsClient` speaks the devtools NDJSON protocol used by the unstable
 * devtools integration. It sends span starts, span events, span completions,
 * ping messages, and metric snapshots through a socket, then exposes tracer
 * layers that forward telemetry while preserving the current tracer's behavior.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Cause from "../Cause.ts"
import * as Context from "../Context.ts"
import * as Deferred from "../Deferred.ts"
import * as Effect from "../Effect.ts"
import * as Ndjson from "../encoding/Ndjson.ts"
import * as Fiber from "../Fiber.ts"
import * as Layer from "../Layer.ts"
import * as Metric from "../Metric.ts"
import * as Queue from "../Queue.ts"
import * as Schema from "../Schema.ts"
import type * as Scope from "../Scope.ts"
import * as Socket from "../socket/Socket.ts"
import * as Stream from "../Stream.ts"
import * as Tracer from "../Tracer.ts"
import * as DevToolsSchema from "./DevToolsSchema.ts"

const RequestSchema = Schema.toCodecJson(DevToolsSchema.Request)
const ResponseSchema = Schema.toCodecJson(DevToolsSchema.Response)

/**
 * Service for sending span and span-event telemetry to the Effect devtools
 * connection.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class DevToolsClient extends Context.Service<
  DevToolsClient,
  {
    readonly sendUnsafe: (
      _: DevToolsSchema.Span | DevToolsSchema.SpanEvent
    ) => void
  }
>()("effect/devtools/DevToolsClient") {}

const makeEffect = Effect.gen(function*() {
  const socket = yield* Socket.Socket
  const services = yield* Effect.context<never>()
  const requests = yield* Queue.unbounded<DevToolsSchema.Request>()
  const connected = yield* Deferred.make<void>()

  const offerMetricsSnapshot = Effect.sync(() => {
    Queue.offerUnsafe(requests, toMetricsSnapshot(services))
  })

  const handleResponse = (
    response: DevToolsSchema.Response
  ): Effect.Effect<void> => {
    switch (response._tag) {
      case "MetricsRequest": {
        return offerMetricsSnapshot
      }
      case "Pong": {
        return Effect.void
      }
    }
  }

  const fiber = yield* Stream.fromQueue(requests).pipe(
    Stream.pipeThroughChannel(
      Ndjson.duplexSchemaString(Socket.toChannelString(socket), {
        inputSchema: RequestSchema,
        outputSchema: ResponseSchema
      })
    ),
    Stream.onFirst(() => Deferred.completeWith(connected, Effect.void)),
    Stream.runForEach(handleResponse),
    Effect.forkDetach
  )

  yield* Effect.addFinalizer(() =>
    offerMetricsSnapshot.pipe(
      Effect.andThen(
        Effect.flatMap(Effect.fiberId, (id) => Queue.failCause(requests, Cause.interrupt(id)))
      ),
      Effect.andThen(Fiber.await(fiber))
    )
  )

  yield* Effect.suspend(() => Queue.offer(requests, { _tag: "Ping" })).pipe(
    Effect.delay("3 seconds"),
    Effect.forever,
    Effect.forkScoped
  )

  yield* Deferred.await(connected).pipe(
    Effect.timeoutOption("1 second"),
    Effect.asVoid
  )

  return DevToolsClient.of({
    sendUnsafe(request: DevToolsSchema.Span | DevToolsSchema.SpanEvent) {
      Queue.offerUnsafe(requests, request)
    }
  })
})

const toMetricsSnapshot = (
  context: Context.Context<never>
): DevToolsSchema.MetricsSnapshot => ({
  _tag: "MetricsSnapshot",
  metrics: Metric.snapshotUnsafe(context)
})

/**
 * Creates a devtools client over the current `Socket`, speaking the devtools
 * NDJSON protocol, sending periodic pings, and responding to metrics snapshot
 * requests.
 *
 * **When to use**
 *
 * Use when you already have a `Socket` and need the low-level `DevToolsClient`
 * service to exchange devtools telemetry directly.
 *
 * **Details**
 *
 * The effect requires `Scope` because it starts background fibers for the socket
 * stream and heartbeat.
 *
 * **Gotchas**
 *
 * `make` creates only the client service; tracing is installed separately.
 *
 * @see {@link layer} for providing the client as a layer
 * @see {@link makeTracer} for creating a tracer after a `DevToolsClient` is available
 * @see {@link layerTracer} for creating the client from the current `Socket` and installing the tracer as a layer
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make: Effect.Effect<
  DevToolsClient["Service"],
  never,
  Scope.Scope | Socket.Socket
> = makeEffect.pipe(
  Effect.annotateLogs({
    module: "DevTools",
    service: "Client"
  })
)

/**
 * Layer that provides `DevToolsClient` using the current `Socket`.
 *
 * **When to use**
 *
 * Use to provide the low-level `DevToolsClient` service over an existing
 * `Socket` for custom devtools integrations that send telemetry through the
 * client directly.
 *
 * **Details**
 *
 * It delegates to `make`, so it speaks the devtools NDJSON protocol over the
 * provided `Socket`, sends periodic pings, responds to metrics snapshot
 * requests, and finalizes its background fibers when the layer scope closes.
 *
 * **Gotchas**
 *
 * This layer only provides the client. It does not install the devtools tracer
 * by itself.
 *
 * @see {@link make} for constructing the client as a scoped effect instead of a layer
 * @see {@link layerTracer} for a higher-level layer that creates the client and installs the devtools tracer
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer.Layer<DevToolsClient, never, Socket.Socket> = Layer.effect(DevToolsClient, make)

const spanSnapshot = (span: Tracer.Span): DevToolsSchema.Span => ({
  _tag: "Span",
  spanId: span.spanId,
  traceId: span.traceId,
  name: span.name,
  sampled: span.sampled,
  attributes: new Map(span.attributes),
  status: span.status,
  parent: span.parent
})

const makeTracerEffect = Effect.gen(function*() {
  const client = yield* DevToolsClient
  const currentTracer = yield* Effect.tracer

  return Tracer.make({
    span(options) {
      const span = currentTracer.span(options)
      client.sendUnsafe(spanSnapshot(span))
      const oldEvent = span.event
      span.event = function(this: Tracer.Span, name, startTime, attributes) {
        client.sendUnsafe({
          _tag: "SpanEvent",
          traceId: span.traceId,
          spanId: span.spanId,
          name,
          startTime,
          attributes
        })
        return oldEvent.call(this, name, startTime, attributes)
      }

      const oldEnd = span.end
      span.end = function(this: Tracer.Span, endTime, exit) {
        oldEnd.call(this, endTime, exit)
        client.sendUnsafe(spanSnapshot(span))
      }

      return span
    },
    context: currentTracer.context
  })
})

/**
 * Creates a tracer that delegates to the current tracer while sending span
 * starts, span events, and span ends to `DevToolsClient`.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeTracer: Effect.Effect<Tracer.Tracer, never, DevToolsClient> = makeTracerEffect.pipe(
  Effect.annotateLogs({
    module: "DevTools",
    service: "Tracer"
  })
)

/**
 * Layer that creates a `DevToolsClient` from the current `Socket` and installs
 * the devtools tracer.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerTracer: Layer.Layer<never, never, Socket.Socket> = Layer.effect(Tracer.Tracer, makeTracer).pipe(
  Layer.provide(layer)
)
