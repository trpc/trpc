import { assert, describe, it } from "@effect/vitest"
import { Effect, Exit, Fiber, Scheduler } from "effect"
import { Workflow } from "effect/workflow"
import { WorkflowInstance } from "effect/workflow/WorkflowEngine"

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
