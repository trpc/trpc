/**
 * @title Broadcasting domain events with PubSub
 *
 * Build an in-process event bus with `PubSub` and expose it as a service.
 */
import { Context, Effect, Layer, PubSub, Stream } from "effect"

export type OrderEvent =
  | { readonly _tag: "OrderPlaced"; readonly orderId: string }
  | { readonly _tag: "PaymentCaptured"; readonly orderId: string }
  | { readonly _tag: "OrderShipped"; readonly orderId: string }

export class OrderEvents extends Context.Service<OrderEvents, {
  publish(event: OrderEvent): Effect.Effect<void>
  publishAll(events: ReadonlyArray<OrderEvent>): Effect.Effect<void>
  readonly subscribe: Stream.Stream<OrderEvent>
}>()("acme/OrderEvents") {
  static readonly layer = Layer.effect(
    OrderEvents,
    Effect.gen(function*() {
      // Use PubSub.bounded to create a PubSub with backpressure support.
      // You can also use PubSub.unbounded if you don't need backpressure.
      const pubsub = yield* PubSub.bounded<OrderEvent>({
        capacity: 256,
        // Optionally add a replay buffer to let late subscribers catch up on
        // recent events after restarts.
        replay: 50
      })

      // Ensure the PubSub is properly shut down when the service is no longer
      // needed.
      yield* Effect.addFinalizer(() => PubSub.shutdown(pubsub))

      const publish = Effect.fn("OrderEvents.publish")(function*(event: OrderEvent) {
        yield* PubSub.publish(pubsub, event)
      })

      const publishAll = Effect.fn("OrderEvents.publishAll")(function*(events: ReadonlyArray<OrderEvent>) {
        yield* PubSub.publishAll(pubsub, events)
      })

      // Create a Stream that emits events published to the PubSub.
      //
      // Each subscriber will receive all events published after they subscribe,
      // and if a replay buffer is configured, they will also receive the most
      // recent events that were published before they subscribed.
      const subscribe = Stream.fromPubSub(pubsub)

      return OrderEvents.of({
        publish,
        publishAll,
        subscribe
      })
    })
  )
}
