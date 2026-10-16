/**
 * @title Consuming and transforming streams
 *
 * How to transform and consume streams using operators like `map`, `flatMap`, `filter`, `mapEffect`, and various `run*` methods.
 */
import { Effect, Sink, Stream } from "effect"

interface Order {
  readonly id: string
  readonly customerId: string
  readonly status: "paid" | "refunded"
  readonly subtotalCents: number
  readonly shippingCents: number
  readonly country: "US" | "CA" | "NZ"
}

interface NormalizedOrder extends Order {
  readonly totalCents: number
}

interface EnrichedOrder extends NormalizedOrder {
  readonly taxCents: number
  readonly grandTotalCents: number
  readonly priority: "normal" | "high"
}

// Start with structured order events from an in-memory source.
export const orderEvents = Stream.succeed<Order>({
  id: "ord_1001",
  customerId: "cus_1",
  status: "paid",
  subtotalCents: 4_500,
  shippingCents: 500,
  country: "US"
})

// Use `Stream.map` for pure per-element transforms.
export const normalizedOrders = orderEvents.pipe(
  Stream.map((order): NormalizedOrder => ({
    ...order,
    totalCents: order.subtotalCents + order.shippingCents
  }))
)

// `Stream.filter` lets you exclude elements that don't match a predicate.
export const paidOrders = normalizedOrders.pipe(
  Stream.filter((order) => order.status === "paid")
)

// Use `Stream.flatMap` to transform each element into a stream, and flatten the
// results.
export const allOrders = Stream.make("US", "CA", "NZ").pipe(
  Stream.flatMap(
    (country) =>
      Stream.range(1, 50).pipe(
        Stream.map((i): Order => ({
          id: `ord_${country}_${i}`,
          customerId: `cus_${i}`,
          status: i % 10 === 0 ? "refunded" : "paid",
          subtotalCents: Math.round(Math.random() * 100_000),
          shippingCents: Math.round(Math.random() * 10_000),
          country
        }))
      ),
    // Optionally control the concurrency of the flatMap with the second argument.
    { concurrency: 2 }
  )
)

const enrichOrder = Effect.fn(function*(order: NormalizedOrder): Effect.fn.Return<EnrichedOrder> {
  // Simulate effectful enrichment (for example, tax/risk lookup).
  yield* Effect.sleep("5 millis")

  const taxRate = order.country === "US" ? 0.08 : 0.13
  const taxCents = Math.round(order.totalCents * taxRate)

  return {
    ...order,
    taxCents,
    grandTotalCents: order.totalCents + taxCents,
    priority: order.totalCents >= 20_000 ? "high" : "normal"
  }
})

// `Stream.mapEffect` performs effectful per-element transforms with concurrency control.
export const enrichedPaidOrders = paidOrders.pipe(
  Stream.mapEffect(enrichOrder, { concurrency: 4 })
)

// `runCollect` gathers all stream outputs into an immutable array.
export const collectedOrders = Stream.runCollect(enrichedPaidOrders)

// `runDrain` runs the stream for its effects, ignoring all outputs.
export const drained = Stream.runDrain(enrichedPaidOrders)

// `runForEach` executes an effectful consumer for every element.
export const logOrders = enrichedPaidOrders.pipe(
  Stream.runForEach((order) => Effect.logInfo(`Order ${order.id} total=$${(order.grandTotalCents / 100).toFixed(2)}`))
)

// `runFold` reduces the stream to one accumulated value.
export const totalRevenueCents = enrichedPaidOrders.pipe(
  Stream.runFold(() => 0, (acc: number, order) => acc + order.grandTotalCents)
)

// `run` lets you consume a stream through any Sink.
export const totalRevenueViaSink = enrichedPaidOrders.pipe(
  Stream.map((order) => order.grandTotalCents),
  Stream.run(Sink.sum)
)

// `runHead` and `runLast` capture edge elements as Option values.
export const firstLargeOrder = enrichedPaidOrders.pipe(
  Stream.filter((order) => order.priority === "high"),
  Stream.runHead
)

export const lastLargeOrder = enrichedPaidOrders.pipe(
  Stream.filter((order) => order.priority === "high"),
  Stream.runLast
)

// Windowing-style operators help shape what downstream consumers see.
export const firstTwoOrders = enrichedPaidOrders.pipe(
  Stream.take(2),
  Stream.runCollect
)

export const afterWarmupOrder = enrichedPaidOrders.pipe(
  Stream.drop(1),
  Stream.runCollect
)

export const untilLargeOrder = enrichedPaidOrders.pipe(
  Stream.takeWhile((order) => order.priority === "normal"),
  Stream.runCollect
)
