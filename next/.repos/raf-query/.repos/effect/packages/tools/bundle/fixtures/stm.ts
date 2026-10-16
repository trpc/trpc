import * as Effect from "effect/Effect"
import * as TxRef from "effect/TxRef"

const program = Effect.gen(function*() {
  const ref = yield* TxRef.make(0)

  yield* Effect.forkChild(Effect.forever(
    TxRef.update(ref, (n) => n + 1).pipe(Effect.delay("100 millis"))
  ))

  yield* Effect.tx(Effect.gen(function*() {
    const value = yield* TxRef.get(ref)
    if (value < 10) {
      yield* Effect.log(`retry due to value: ${value}`)
      return yield* Effect.txRetry
    }
    yield* Effect.log(`transaction done with value: ${value}`)
  }))
})

Effect.runPromise(program).catch(console.error)
