import { assert, describe, it } from "@effect/vitest"
import { Cause, Effect, Exit, Layer, Option, Schema } from "effect"
import { PersistedQueue } from "effect/persistence"
import { TestClock } from "effect/testing"
import { DurableQueue, Workflow, WorkflowEngine } from "effect/workflow"

const PersistedQueueLayer = PersistedQueue.layer.pipe(
  Layer.provideMerge(PersistedQueue.layerStoreMemory)
)

const pollUntilComplete = <A, E, R>(
  poll: Effect.Effect<Option.Option<Workflow.Result<A, E>>, never, R>
) =>
  Effect.gen(function*() {
    let polled = yield* poll
    for (let i = 0; i < 10 && (Option.isNone(polled) || polled.value._tag !== "Complete"); i++) {
      yield* Effect.yieldNow
      yield* Effect.sleep("10 millis").pipe(TestClock.withLive)
      polled = yield* poll
    }
    return polled
  })

describe("DurableQueue", () => {
  const SuccessQueue = DurableQueue.make({
    name: "DurableQueueTest/SuccessQueue",
    payload: {
      id: Schema.String,
      value: Schema.Number
    },
    success: Schema.Number,
    error: Schema.String,
    idempotencyKey: ({ id }) => id
  })

  const SuccessWorkflow = Workflow.make("DurableQueueTest/SuccessWorkflow", {
    payload: {
      id: Schema.String,
      value: Schema.Number
    },
    success: Schema.Number,
    error: Schema.String,
    idempotencyKey: ({ id }) => id
  })

  const SuccessLayer = Layer.mergeAll(
    SuccessWorkflow.toLayer(({ id, value }) => DurableQueue.process(SuccessQueue, { id, value })),
    DurableQueue.worker(
      SuccessQueue,
      ({ value }) => Effect.succeed(value + 1)
    )
  ).pipe(
    Layer.provideMerge(WorkflowEngine.layerMemory),
    Layer.provideMerge(PersistedQueueLayer)
  )

  it.effect("processes queued items and resumes the workflow", () =>
    Effect.gen(function*() {
      const executionId = yield* SuccessWorkflow.execute({ id: "success", value: 41 }, { discard: true })
      const polled = yield* pollUntilComplete(SuccessWorkflow.poll(executionId))

      assert(Option.isSome(polled) && polled.value._tag === "Complete" && Exit.isSuccess(polled.value.exit))
      assert.strictEqual(polled.value.exit.value, 42)
    }).pipe(Effect.provide(SuccessLayer)))

  const FailureQueue = DurableQueue.make({
    name: "DurableQueueTest/FailureQueue",
    payload: {
      id: Schema.String
    },
    success: Schema.Void,
    error: Schema.String,
    idempotencyKey: ({ id }) => id
  })

  const FailureWorkflow = Workflow.make("DurableQueueTest/FailureWorkflow", {
    payload: {
      id: Schema.String
    },
    success: Schema.Void,
    error: Schema.String,
    idempotencyKey: ({ id }) => id
  })

  const FailureLayer = Layer.mergeAll(
    FailureWorkflow.toLayer(({ id }) => DurableQueue.process(FailureQueue, { id })),
    DurableQueue.worker(
      FailureQueue,
      () => Effect.fail("boom")
    )
  ).pipe(
    Layer.provideMerge(WorkflowEngine.layerMemory),
    Layer.provideMerge(PersistedQueueLayer)
  )

  it.effect("propagates worker failures to the workflow", () =>
    Effect.gen(function*() {
      const executionId = yield* FailureWorkflow.execute({ id: "failure" }, { discard: true })
      const polled = yield* pollUntilComplete(FailureWorkflow.poll(executionId))

      assert(Option.isSome(polled) && polled.value._tag === "Complete" && Exit.isFailure(polled.value.exit))
      const failure = polled.value.exit.cause.reasons.find(Cause.isFailReason)
      assert.strictEqual(failure?.error, "boom")
    }).pipe(Effect.provide(FailureLayer)))
})
