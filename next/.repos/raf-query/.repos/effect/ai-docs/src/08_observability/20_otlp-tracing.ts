/**
 * @title Setting up tracing with Otlp modules
 *
 * Configure Otlp tracing + log export with a reusable observability layer.
 */
import { NodeRuntime } from "@effect/platform-node"
import { Context, Effect, Layer } from "effect"
import { FetchHttpClient } from "effect/http"
import { OtlpLogger, OtlpSerialization, OtlpTracer } from "effect/observability"

// Configure OTLP span export.
export const OtlpTracingLayer = OtlpTracer.layer({
  url: "http://localhost:4318/v1/traces",
  resource: {
    serviceName: "checkout-api",
    serviceVersion: "1.0.0",
    attributes: {
      "deployment.environment": "staging"
    }
  }
})

// Configure OTLP log export.
export const OtlpLoggingLayer = OtlpLogger.layer({
  url: "http://localhost:4318/v1/logs",
  resource: {
    serviceName: "checkout-api",
    serviceVersion: "1.0.0"
  }
})

// Reusable app-wide observability layer.
//
// - OtlpTracer/OtlpLogger require an OTLP serializer and an HttpClient.
// - FetchHttpClient.layer provides the HttpClient used by the exporter.
export const ObservabilityLayer = Layer.merge(OtlpTracingLayer, OtlpLoggingLayer).pipe(
  Layer.provide(OtlpSerialization.layerJson),
  Layer.provide(FetchHttpClient.layer)
)

export class Checkout extends Context.Service<Checkout, {
  processCheckout(orderId: string): Effect.Effect<void>
}>()("acme/Checkout") {
  static readonly layer = Layer.effect(
    Checkout,
    Effect.gen(function*() {
      yield* Effect.logInfo("setting up checkout service")

      return Checkout.of({
        processCheckout: Effect.fn("Checkout.processCheckout")(function*(orderId: string) {
          yield* Effect.logInfo("starting checkout", { orderId })

          yield* Effect.sleep("50 millis").pipe(
            Effect.withSpan("checkout.charge-card"),
            Effect.annotateSpans({
              "checkout.order_id": orderId,
              "checkout.provider": "acme-pay"
            })
          )

          yield* Effect.sleep("20 millis").pipe(
            Effect.withSpan("checkout.persist-order")
          )

          yield* Effect.logInfo("checkout completed", { orderId })
        })
      })
    })
  )
}

// Example usage of the Checkout service.
const CheckoutTest = Layer.effectDiscard(
  Effect.gen(function*() {
    const checkout = yield* Checkout
    yield* checkout.processCheckout("ord_123")
  }).pipe(
    Effect.withSpan("checkout-test-run")
  )
).pipe(
  // You can also attach spans to Layers
  Layer.withSpan("checkout-test"),
  Layer.provide(Checkout.layer)
)

const Main = CheckoutTest.pipe(
  // Provide the observability layer at the very end, so that all spans created
  // by the app are exported.
  Layer.provide(ObservabilityLayer)
)

// Launch the app
Layer.launch(Main).pipe(
  NodeRuntime.runMain
)
