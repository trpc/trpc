import { assert, describe, it } from "@effect/vitest"
import { Effect, Exit, Fiber, Scheduler } from "effect"
import { Activity, Workflow } from "effect/workflow"
import { WorkflowInstance } from "effect/workflow/WorkflowEngine"

// Execution ids and activity idempotency keys are persisted, so they must stay
// byte-for-byte stable. Expected values are the first 16 bytes of SHA-256 in hex,
// computed with node:crypto.
describe("persisted ids", () => {
  it.effect("keep their SHA-256 derived values", () =>
    Effect.gen(function*() {
      const workflow = Workflow.make("Order", {
        payload: {},
        idempotencyKey: () => "42"
      })
      const executionId = yield* workflow.executionId({})
      assert.strictEqual(executionId, "0f62355133496e612090fb5d4307a4d2")

      const instance = WorkflowInstance.initial(workflow, executionId)
      assert.strictEqual(
        yield* Activity.idempotencyKey("charge").pipe(Effect.provideService(WorkflowInstance, instance)),
        "c250939b26740218d8122b4cf6a3d2e1"
      )
      assert.strictEqual(
        yield* Activity.idempotencyKey("charge", { includeAttempt: true }).pipe(
          Effect.provideService(WorkflowInstance, instance),
          Effect.provideService(Activity.CurrentAttempt, 3)
        ),
        "26241ff2cf66bbddd1be618b7ccdf48f"
      )
    }))
})

describe("Workflow.wrapActivityResult", () => {
  it.effect("releases acquisition interrupted before the body starts", () =>
    Effect.gen(function*() {
      const workflow = Workflow.make("ActivityInterruption", {
        payload: {},
        idempotencyKey: () => "activity-interruption"
      })
      const instance = WorkflowInstance.initial(workflow, "acquisition")
      const scheduler = new class extends Scheduler.MixedScheduler {
        yielded = false
        override shouldYield(fiber: Fiber.Fiber<unknown, unknown>): boolean {
          if (this.yielded || instance.activityState.count !== 1) return super.shouldYield(fiber)
          this.yielded = true
          return true
        }
      }()
      let entered = false
      const fiber = yield* Workflow.wrapActivityResult(
        Effect.sync(() => {
          entered = true
        }),
        () => false
      ).pipe(
        Effect.provideService(WorkflowInstance, instance),
        Effect.provideService(Scheduler.Scheduler, scheduler),
        Effect.forkChild({ startImmediately: true })
      )
      assert.isTrue(scheduler.yielded)
      yield* Fiber.interrupt(fiber)
      assert.isTrue(Exit.hasInterrupts(yield* Fiber.await(fiber)))
      assert.isFalse(entered)
      assert.strictEqual(instance.activityState.count, 0)
      yield* instance.activityState.latch.await
    }))
})
