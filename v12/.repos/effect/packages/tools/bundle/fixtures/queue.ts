import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"

const program = Effect.gen(function*() {
  const queue = yield* Queue.make<number>()

  yield* Effect.gen(function*() {
    yield* Queue.takeN(queue, 3)
  }).pipe(Effect.forever, Effect.forkScoped)

  yield* Queue.offerAll(queue, [1, 2])
  yield* Queue.offerAll(queue, [3, 4]).pipe(Effect.delay("100 millis"), Effect.forkScoped)
  yield* Queue.offerAll(queue, [5, 6, 7, 8]).pipe(Effect.delay("200 millis"), Effect.forkScoped)

  yield* Effect.sleep("500 millis")
})

Effect.runFork(Effect.scoped(program))
