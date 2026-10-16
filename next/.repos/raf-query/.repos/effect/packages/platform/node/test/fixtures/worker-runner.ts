import * as NodeWorkerRunner from "@effect/platform-node/NodeWorkerRunner"
import * as Effect from "effect/Effect"
import * as WorkerRunner from "effect/workers/WorkerRunner"

await Effect.runPromise(
  Effect.gen(function*() {
    const platform = yield* WorkerRunner.WorkerRunnerPlatform
    const runner = yield* platform.start<{ readonly value: number }>()
    yield* runner.run((portId) =>
      Effect.sync(() => {
        runner.sendUnsafe(portId, { value: 42 })
      })
    )
  }).pipe(Effect.provide(NodeWorkerRunner.layer))
)
