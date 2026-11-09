import * as Effect from "effect/Effect"
import * as PubSub from "effect/PubSub"

const program = Effect.gen(function*() {
  const pubsub = yield* PubSub.unbounded<number>()

  yield* Effect.gen(function*() {
    const subscription = yield* PubSub.subscribe(pubsub)
    while (true) {
      const element = yield* PubSub.take(subscription)
      console.log(element)
    }
  }).pipe(Effect.forkScoped({ startImmediately: true }))

  yield* PubSub.publishAll(pubsub, [1, 2])
  yield* PubSub.publishAll(pubsub, [3, 4]).pipe(Effect.delay("100 millis"), Effect.forkScoped)
  yield* PubSub.publishAll(pubsub, [5, 6, 7, 8]).pipe(Effect.delay("200 millis"), Effect.forkScoped)

  yield* Effect.sleep("500 millis")
})

Effect.runFork(Effect.scoped(program))
