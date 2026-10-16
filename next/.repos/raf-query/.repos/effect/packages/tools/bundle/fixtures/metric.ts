import * as Effect from "effect/Effect"
import * as Metric from "effect/Metric"

const program = Effect.gen(function*() {
  yield* Effect.succeed(1).pipe(
    Effect.forkChild({ startImmediately: true })
  )
})

program.pipe(
  Metric.enableRuntimeMetrics,
  Effect.runFork
)
