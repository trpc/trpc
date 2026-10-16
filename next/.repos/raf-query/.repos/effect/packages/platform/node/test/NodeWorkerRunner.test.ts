import * as NodeWorker from "@effect/platform-node/NodeWorker"
import { assert, describe, it } from "@effect/vitest"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import * as Worker from "effect/workers/Worker"
import { Worker as NativeWorker } from "node:worker_threads"

const fixture = new URL("./fixtures/worker-runner.ts", import.meta.url)

describe("NodeWorkerRunner", () => {
  it.live("sendUnsafe preserves reply payloads", () =>
    Effect.scoped(
      Effect.gen(function*() {
        const replies = yield* Queue.unbounded<unknown>()
        const ready = yield* Deferred.make<void>()
        const native = new NativeWorker(fixture, { execArgv: [] })
        const worker = yield* Worker.WorkerPlatform.use((platform) => platform.spawn<unknown, void>(0)).pipe(
          Effect.provide(NodeWorker.layer(() => native))
        )
        yield* worker.run((reply) => Queue.offer(replies, reply), {
          onSpawn: Deferred.succeed(ready, undefined)
        }).pipe(Effect.forkScoped)
        yield* Deferred.await(ready)

        yield* worker.send(undefined)

        assert.deepStrictEqual(yield* Queue.take(replies), { value: 42 })
      })
    ), { timeout: 20_000 })
})
