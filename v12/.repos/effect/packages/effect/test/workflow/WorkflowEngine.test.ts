import { assert, describe, it } from "@effect/vitest"
import {
  Cause,
  Deferred,
  Duration,
  Effect,
  Exit,
  Fiber,
  Latch,
  Layer,
  Option,
  Ref,
  Schedule,
  Schema,
  Scope
} from "effect"
import { TestClock } from "effect/testing"
import { Activity, DurableClock, DurableDeferred, Workflow, WorkflowEngine } from "effect/workflow"

describe("deferred self-completion", () => {
  for (const failure of [false, true]) {
    it.live(failure ? "failure" : "success", () =>
      Effect.gen(function*() {
        const signal = DurableDeferred.make("signal", { success: Schema.String, error: Schema.String })
        const read = yield* Latch.make()
        const cleanup = yield* Latch.make()
        const release = yield* Latch.make()
        const events: Array<string> = []
        let runs = 0
        const workflow = Workflow.make("SelfCompletion", {
          payload: {},
          success: Schema.String,
          error: Schema.String,
          idempotencyKey: () => "one"
        })
        const layer = workflow.toLayer(() =>
          Effect.gen(function*() {
            const run = ++runs
            events.push(`start-${run}`)
            const engine = yield* WorkflowEngine.WorkflowEngine
            return yield* DurableDeferred.raceAll({
              name: "race",
              success: Schema.String,
              error: Schema.String,
              effects: [
                DurableDeferred.await(signal),
                read.await.pipe(
                  Effect.andThen(Effect.yieldNow),
                  Effect.andThen(failure ? Effect.fail("boom") : Effect.succeed("ok")),
                  DurableDeferred.into(signal),
                  // Successful completion must preempt this producer and replay the run.
                  Effect.andThen(Effect.never),
                  Effect.onInterrupt(() =>
                    run === 1
                      ? Effect.gen(function*() {
                        events.push("cleanup-start")
                        yield* cleanup.open
                        yield* release.await
                        events.push("cleanup-end")
                      })
                      : Effect.void
                  )
                )
              ]
            }).pipe(
              Effect.provideService(WorkflowEngine.WorkflowEngine, {
                ...engine,
                deferredResult: (deferred) =>
                  engine.deferredResult(deferred).pipe(
                    Effect.tap(() => deferred.name === signal.name ? read.open : Effect.void)
                  )
              }),
              Effect.ensuring(Effect.sync(() => events.push(`end-${run}`)))
            )
          })
        ).pipe(Layer.provideMerge(WorkflowEngine.layerMemory))

        yield* Effect.gen(function*() {
          const execution = yield* workflow.execute({}).pipe(Effect.exit, Effect.forkChild({ startImmediately: true }))
          if (!failure) {
            yield* cleanup.await
            for (let i = 0; i < 20; i++) yield* Effect.yieldNow
            assert.deepStrictEqual(events, ["start-1", "cleanup-start"], "replay must wait for cleanup")
            yield* release.open
          }
          const result = yield* Fiber.join(execution)
          if (failure) {
            assert.ok(Exit.isFailure(result))
            assert.strictEqual(result.cause.reasons.length, 1)
            const reason = result.cause.reasons[0]
            assert.ok(Cause.isFailReason(reason))
            assert.strictEqual(reason.error, "boom")
          } else {
            assert.deepStrictEqual(result, Exit.succeed("ok"))
            assert.deepStrictEqual(events, ["start-1", "cleanup-start", "cleanup-end", "end-1", "start-2", "end-2"])
          }
        }).pipe(Effect.provide(layer))
      }), 5_000)
  }
})

describe("WorkflowEngine", () => {
  const IncrementWorkflow = Workflow.make("WorkflowEngine/IncrementWorkflow", {
    payload: { value: Schema.Number },
    success: Schema.Number,
    idempotencyKey: ({ value }) => String(value)
  })

  const IncrementWorkflowLayer = IncrementWorkflow.toLayer(({ value }) => Effect.succeed(value + 1))

  class ClassWorkflow extends Workflow.make("WorkflowEngine/ClassWorkflow", {
    payload: { value: Schema.Number },
    success: Schema.Number,
    idempotencyKey: ({ value }) => String(value)
  }) {}

  const ClassWorkflowLayer = ClassWorkflow.toLayer(({ value }) => Effect.succeed(value + 1))

  const DeferredRaceWorkflow = Workflow.make("WorkflowEngine/DeferredRaceWorkflow", {
    payload: { id: Schema.String },
    success: Schema.String,
    idempotencyKey: ({ id }) => id
  })

  const DeferredRaceGate = DurableDeferred.make("WorkflowEngine/DeferredRaceGate", {
    success: Schema.String
  })

  let deferredRaceRuns = 0
  const DeferredRaceWorkflowLayer = DeferredRaceWorkflow.toLayer(() =>
    Effect.suspend(() => {
      deferredRaceRuns++
      return DurableDeferred.raceAll({
        name: "memory-deferred-race",
        success: Schema.String,
        error: Schema.Never,
        effects: [
          DurableDeferred.await(DeferredRaceGate),
          Effect.sleep("10 seconds").pipe(Effect.as("activity"))
        ]
      })
    })
  )

  it.effect("layer executes and polls workflows", () =>
    Effect.gen(function*() {
      const executionId = yield* IncrementWorkflow.execute({ value: 1 }, { discard: true })
      const result = yield* IncrementWorkflow.execute({ value: 1 })
      const polled = yield* IncrementWorkflow.poll(executionId)

      assert.strictEqual(result, 2)
      assert(Option.isSome(polled) && polled.value._tag === "Complete" && Exit.isSuccess(polled.value.exit))
      assert.strictEqual(polled.value.exit.value, 2)
    }).pipe(
      Effect.provide(IncrementWorkflowLayer.pipe(
        Layer.provideMerge(WorkflowEngine.layerMemory)
      ))
    ))

  for (
    const { childCount, concurrency, waves } of [
      { childCount: 3, concurrency: "unbounded" as const, waves: [3] },
      { childCount: 5, concurrency: 2, waves: [2, 4, 5] }
    ]
  ) {
    it.effect(`layerMemory replays suspended activity fan-out with concurrency ${concurrency}`, () =>
      Effect.gen(function*() {
        const Parent = Workflow.make("WorkflowEngine/FanOutParent", {
          payload: {},
          success: Schema.Array(Schema.Number),
          idempotencyKey: () => "parent"
        })
        const Child = Workflow.make("WorkflowEngine/FanOutChild", {
          payload: { index: Schema.Number },
          success: Schema.Number,
          idempotencyKey: ({ index }) => String(index)
        })
        const started = new Set<number>()
        let parentRuns = 0
        let activityRuns = 0
        let released = 0
        const ParentLayer = Parent.toLayer(() =>
          Effect.suspend(() => {
            parentRuns++
            return Activity.make({
              name: "fan-out",
              success: Schema.Array(Schema.Number),
              execute: Effect.suspend(() => {
                activityRuns++
                return Effect.forEach(
                  Array.from({ length: childCount }, (_, index) => index),
                  (index) => Child.execute({ index }),
                  { concurrency }
                )
              }).pipe(Effect.ensuring(Effect.sync(() => {
                released++
              })))
            })
          })
        )
        const ChildLayer = Child.toLayer(Effect.fnUntraced(function*({ index }) {
          started.add(index)
          yield* DurableClock.sleep({ name: "child", duration: "2 seconds", inMemoryThreshold: Duration.zero })
          return index
        }))
        yield* Effect.gen(function*() {
          const executionId = yield* Parent.execute({}, { discard: true })
          // Execution-ID digests use real promises, so wait for state rather than clock ticks.
          for (const expected of waves) {
            let result = yield* Parent.poll(executionId)
            while (Option.isNone(result) || result.value._tag !== "Suspended" || started.size !== expected) {
              yield* Effect.yieldNow
              result = yield* Parent.poll(executionId)
            }
            assert.deepStrictEqual([...started].sort(), Array.from({ length: expected }, (_, index) => index))
            assert.strictEqual(released, activityRuns)
            assert.isAtMost(activityRuns, parentRuns)
            if (expected === waves[0]) assert.strictEqual(parentRuns, 1)
            yield* TestClock.adjust("2 seconds")
          }
          let result = yield* Parent.poll(executionId)
          while (Option.isNone(result) || result.value._tag !== "Complete") {
            yield* Effect.yieldNow
            result = yield* Parent.poll(executionId)
          }
          assert.deepStrictEqual(
            result.value,
            new Workflow.Complete({ exit: Exit.succeed(Array.from({ length: childCount }, (_, index) => index)) })
          )
          assert.isAtLeast(parentRuns, waves.length + 1)
          assert.isAtMost(activityRuns, parentRuns)
        }).pipe(
          Effect.provide(Layer.mergeAll(ParentLayer, ChildLayer).pipe(Layer.provideMerge(WorkflowEngine.layerMemory)))
        )
      }))
  }

  it.effect("layerMemory reruns an activity interrupted by replay preemption", () =>
    Effect.gen(function*() {
      const Probe = Workflow.make("WorkflowEngine/PreemptedActivity", {
        payload: { id: Schema.String },
        success: Schema.String,
        idempotencyKey: ({ id }) => id
      })
      let executions = 0
      let writes = 0
      const writing = yield* Deferred.make<void>()
      const written = yield* Deferred.make<void>()
      const layer = Probe.toLayer(Effect.fnUntraced(function*() {
        executions++
        if (executions === 2) {
          // Advance once the clock result is stored, but before its wake-up preempts this replay.
          const engine = yield* WorkflowEngine.WorkflowEngine
          const room = DurableDeferred.make("DurableClock/room")
          while (Option.isNone(yield* engine.deferredResult(room))) yield* Effect.yieldNow
        }
        yield* DurableClock.sleep({ name: "room", duration: "5 seconds", inMemoryThreshold: 0 })
        yield* Activity.make({
          name: "write",
          execute: Effect.gen(function*() {
            writes++
            yield* Deferred.succeed(writing, undefined)
            yield* Deferred.await(written)
          })
        })
        return "ended"
      })).pipe(Layer.provideMerge(WorkflowEngine.layerMemory))

      yield* Effect.gen(function*() {
        const executionId = yield* Probe.execute({ id: "probe" }, { discard: true })
        let polled = yield* Probe.poll(executionId)
        while (Option.isNone(polled) || polled.value._tag !== "Suspended") {
          yield* Effect.yieldNow
          polled = yield* Probe.poll(executionId)
        }
        // Start a replay as the clock comes due; its delayed wake-up interrupts the activity.
        yield* Probe.resume(executionId)
        yield* TestClock.adjust("5 seconds")
        yield* Deferred.await(writing)
        // The workflow fiber increments executions.
        // eslint-disable-next-line no-unmodified-loop-condition
        while (executions < 3) yield* Effect.yieldNow
        yield* Deferred.succeed(written, undefined)
        polled = yield* Probe.poll(executionId)
        while (Option.isNone(polled) || polled.value._tag !== "Complete") {
          yield* Effect.yieldNow
          polled = yield* Probe.poll(executionId)
        }
        assert.deepStrictEqual(polled.value.exit, Exit.succeed("ended"))
        assert.strictEqual(executions, 3)
        assert.strictEqual(writes, 2)
      }).pipe(Effect.provide(layer))
    }))

  it.effect("layerMemory resumes when children complete during activity cleanup", () =>
    Effect.gen(function*() {
      const cleaningUp = yield* Latch.make()
      const release = yield* Latch.make()
      const Parent = Workflow.make("WorkflowEngine/CleanupParent", {
        payload: {},
        success: Schema.Array(Schema.Number),
        idempotencyKey: () => "parent"
      })
      const Child = Workflow.make("WorkflowEngine/CleanupChild", {
        payload: { index: Schema.Number },
        success: Schema.Number,
        idempotencyKey: ({ index }) => String(index)
      })
      const ParentLayer = Parent.toLayer(() =>
        Activity.make({
          name: "children",
          success: Schema.Array(Schema.Number),
          execute: Effect.forEach([0, 1], (index) => Child.execute({ index }), { concurrency: "unbounded" }).pipe(
            Effect.ensuring(Effect.andThen(cleaningUp.open, release.await))
          )
        })
      )
      const ChildLayer = Child.toLayer(({ index }) =>
        DurableClock.sleep({ name: "wait", duration: "2 seconds", inMemoryThreshold: Duration.zero }).pipe(
          Effect.as(index)
        )
      )
      yield* Effect.gen(function*() {
        const executionId = yield* Parent.execute({}, { discard: true })
        yield* cleaningUp.await
        yield* TestClock.adjust("2 seconds")
        yield* release.open
        let result = yield* Parent.poll(executionId)
        while (Option.isNone(result) || result.value._tag !== "Complete") {
          yield* Effect.yieldNow
          result = yield* Parent.poll(executionId)
        }
        assert.deepStrictEqual(
          result.value,
          new Workflow.Complete({ exit: Exit.succeed([0, 1]) })
        )
      }).pipe(
        Effect.provide(Layer.mergeAll(ParentLayer, ChildLayer).pipe(Layer.provideMerge(WorkflowEngine.layerMemory)))
      )
    }))

  it.effect("layerMemory keeps a failure-suspended workflow parked when a discarded child completes", () =>
    Effect.gen(function*() {
      let failures = 0
      const ChildGate = DurableDeferred.make("WorkflowEngine/FailureParkedChildGate")
      const Parent = Workflow.make("WorkflowEngine/FailureParked", {
        payload: {},
        idempotencyKey: () => "parent"
      }).annotate(Workflow.SuspendOnFailure, true)
      const Child = Workflow.make("WorkflowEngine/FailureParkedChild", {
        payload: {},
        idempotencyKey: () => "child"
      })
      const ParentLayer = Parent.toLayer(Effect.fnUntraced(function*() {
        yield* Child.execute({}, { discard: true })
        yield* Activity.make({
          name: "fail",
          execute: Effect.suspend(() => {
            failures++
            return Effect.die("boom")
          })
        })
      }))
      const ChildLayer = Child.toLayer(() => DurableDeferred.await(ChildGate))
      yield* Effect.gen(function*() {
        const executionId = yield* Parent.execute({}, { discard: true })
        const childId = yield* Child.executionId({})
        let result = yield* Parent.poll(executionId)
        while (Option.isNone(result) || result.value._tag !== "Suspended") {
          yield* Effect.yieldNow
          result = yield* Parent.poll(executionId)
        }

        yield* DurableDeferred.succeed(ChildGate, {
          token: DurableDeferred.tokenFromExecutionId(ChildGate, { workflow: Child, executionId: childId }),
          value: void 0
        })
        let child = yield* Child.poll(childId)
        while (Option.isNone(child) || child.value._tag !== "Complete") {
          yield* Effect.yieldNow
          child = yield* Child.poll(childId)
        }
        assert.deepStrictEqual(child.value, new Workflow.Complete({ exit: Exit.void }))
        for (let i = 0; i < 100; i++) yield* Effect.yieldNow
        assert.strictEqual(failures, 1, "only an explicit resume may replay the failed activity")

        yield* Parent.resume(executionId)
        // eslint-disable-next-line no-unmodified-loop-condition
        while (failures < 2) yield* Effect.yieldNow
        assert.strictEqual(failures, 2)
      }).pipe(
        Effect.provide(Layer.mergeAll(ParentLayer, ChildLayer).pipe(Layer.provideMerge(WorkflowEngine.layerMemory)))
      )
    }))

  it.effect("layerMemory wakes a parent when its failure-suspended child is resumed", () =>
    Effect.gen(function*() {
      let attempts = 0
      const Parent = Workflow.make("WorkflowEngine/InheritedCauseParent", {
        payload: {},
        success: Schema.Number,
        idempotencyKey: () => "parent"
      })
      const Child = Workflow.make("WorkflowEngine/InheritedCauseChild", {
        payload: {},
        success: Schema.Number,
        idempotencyKey: () => "child"
      }).annotate(Workflow.SuspendOnFailure, true)
      // Await from an activity, so its own result must not inherit the failure.
      const ParentLayer = Parent.toLayer(() =>
        Activity.make({ name: "child", success: Schema.Number, execute: Child.execute({}) })
      )
      const ChildLayer = Child.toLayer(() =>
        Activity.make({
          name: "flaky",
          success: Schema.Number,
          execute: Effect.suspend(() => ++attempts === 1 ? Effect.die("boom") : Effect.succeed(attempts))
        })
      )
      yield* Effect.gen(function*() {
        const executionId = yield* Parent.execute({}, { discard: true })
        let result = yield* Parent.poll(executionId)
        while (Option.isNone(result) || result.value._tag !== "Suspended") {
          yield* Effect.yieldNow
          result = yield* Parent.poll(executionId)
        }

        // The parent carries the child's cause but did not fail itself.
        yield* Child.resume(yield* Child.executionId({}))
        while (Option.isNone(result) || result.value._tag !== "Complete") {
          yield* Effect.yieldNow
          result = yield* Parent.poll(executionId)
        }
        assert.deepStrictEqual(result.value, new Workflow.Complete({ exit: Exit.succeed(2) }))
      }).pipe(
        Effect.provide(Layer.mergeAll(ParentLayer, ChildLayer).pipe(Layer.provideMerge(WorkflowEngine.layerMemory)))
      )
    }))

  it.effect("layerMemory keeps an explicit resume queued behind an automatic wake", () =>
    Effect.gen(function*() {
      let failures = 0
      const cleaningUp = yield* Latch.make()
      const release = yield* Latch.make()
      const Gate = DurableDeferred.make("WorkflowEngine/QueuedWakeGate")
      const Failing = Workflow.make("WorkflowEngine/QueuedWake", {
        payload: {},
        idempotencyKey: () => "failing"
      }).annotate(Workflow.SuspendOnFailure, true)
      const FailingLayer = Failing.toLayer(() =>
        Activity.make({
          name: "fail",
          execute: Effect.suspend(() => {
            failures++
            return Effect.die("boom")
          })
        }).pipe(Effect.ensuring(Effect.andThen(cleaningUp.open, release.await)))
      )
      yield* Effect.gen(function*() {
        const executionId = yield* Failing.execute({}, { discard: true })
        yield* cleaningUp.await
        // The run is still cleaning up, so both wakes wait for it to finish.
        yield* DurableDeferred.succeed(Gate, {
          token: DurableDeferred.tokenFromExecutionId(Gate, { workflow: Failing, executionId }),
          value: void 0
        })
        yield* Failing.resume(executionId)
        yield* release.open
        // eslint-disable-next-line no-unmodified-loop-condition
        while (failures < 2) yield* Effect.yieldNow
        assert.strictEqual(failures, 2, "the explicit resume must replay the failed activity")
      }).pipe(Effect.provide(FailingLayer.pipe(Layer.provideMerge(WorkflowEngine.layerMemory))))
    }))

  it.effect("layerMemory does not interrupt a detached child with its parent", () =>
    Effect.gen(function*() {
      const ParentGate = DurableDeferred.make("WorkflowEngine/DetachedParentGate")
      const ChildGate = DurableDeferred.make("WorkflowEngine/DetachedChildGate")
      const Parent = Workflow.make("WorkflowEngine/DetachedParent", {
        payload: {},
        idempotencyKey: () => "parent"
      })
      const Child = Workflow.make("WorkflowEngine/DetachedChild", {
        payload: {},
        idempotencyKey: () => "child"
      })
      const ParentLayer = Parent.toLayer(Effect.fnUntraced(function*() {
        yield* Child.execute({}, { discard: true, detached: true })
        yield* DurableDeferred.await(ParentGate)
      }))
      const ChildLayer = Child.toLayer(() => DurableDeferred.await(ChildGate))
      yield* Effect.gen(function*() {
        const executionId = yield* Parent.execute({}, { discard: true })
        let result = yield* Parent.poll(executionId)
        while (Option.isNone(result) || result.value._tag !== "Suspended") {
          yield* Effect.yieldNow
          result = yield* Parent.poll(executionId)
        }
        yield* Parent.interrupt(executionId)
        while (Option.isNone(result) || result.value._tag !== "Complete") {
          yield* Effect.yieldNow
          result = yield* Parent.poll(executionId)
        }

        const childId = yield* Child.executionId({})
        yield* DurableDeferred.succeed(ChildGate, {
          token: DurableDeferred.tokenFromExecutionId(ChildGate, { workflow: Child, executionId: childId }),
          value: void 0
        })
        let child = yield* Child.poll(childId)
        while (Option.isNone(child) || child.value._tag !== "Complete") {
          yield* Effect.yieldNow
          child = yield* Child.poll(childId)
        }
        assert.deepStrictEqual(child.value, new Workflow.Complete({ exit: Exit.void }))
      }).pipe(
        Effect.provide(Layer.mergeAll(ParentLayer, ChildLayer).pipe(Layer.provideMerge(WorkflowEngine.layerMemory)))
      )
    }))

  for (const recover of [false, true]) {
    it.effect(
      `layerMemory ${
        recover ? "lets a parent recover from" : "fails a parent with a defect for"
      } an interrupted child without interrupting its sibling`,
      () =>
        Effect.gen(function*() {
          const Gate = DurableDeferred.make("WorkflowEngine/InterruptedChildGate")
          const Parent = Workflow.make(`WorkflowEngine/InterruptedChildParent/${recover}`, {
            payload: {},
            idempotencyKey: () => "parent"
          })
          const Child = Workflow.make(`WorkflowEngine/InterruptedChild/${recover}`, {
            payload: { id: Schema.String },
            idempotencyKey: ({ id }) => id
          })
          const ParentLayer = Parent.toLayer(Effect.fnUntraced(function*() {
            yield* Child.execute({ id: "sibling" }, { discard: true })
            const child = Child.execute({ id: "child" })
            yield* recover ? Effect.exit(child) : child
          }))
          const ChildLayer = Child.toLayer(() => DurableDeferred.await(Gate))
          const pollUntil = Effect.fnUntraced(function*(
            workflow: typeof Parent | typeof Child,
            executionId: string,
            tag: "Suspended" | "Complete"
          ) {
            let result = yield* workflow.poll(executionId)
            for (let i = 0; i < 1000 && !(Option.isSome(result) && result.value._tag === tag); i++) {
              yield* Effect.yieldNow
              result = yield* workflow.poll(executionId)
            }
            assert(Option.isSome(result) && result.value._tag === tag, `workflow must reach ${tag}`)
            return result.value
          })
          yield* Effect.gen(function*() {
            const parentId = yield* Parent.execute({}, { discard: true })
            const childId = yield* Child.executionId({ id: "child" })
            const siblingId = yield* Child.executionId({ id: "sibling" })
            yield* pollUntil(Parent, parentId, "Suspended")
            yield* Child.interrupt(childId)
            const parent = yield* pollUntil(Parent, parentId, "Complete")
            assert(parent._tag === "Complete")
            if (recover) {
              assert.deepStrictEqual(parent.exit, Exit.void)
            } else {
              assert(Exit.hasDies(parent.exit) && !Exit.hasInterrupts(parent.exit))
            }
            yield* pollUntil(Child, siblingId, "Suspended")
          }).pipe(
            Effect.provide(
              Layer.mergeAll(ParentLayer, ChildLayer).pipe(Layer.provideMerge(WorkflowEngine.layerMemory))
            )
          )
        })
    )
  }

  for (const mode of ["failure", "interruption"] as const) {
    it.effect(`layerMemory releases a pending child registration on ${mode}`, () =>
      Effect.gen(function*() {
        const computingId = yield* Latch.make()
        const started = new Set<number>()
        const Parent = Workflow.make(`WorkflowEngine/PendingParent/${mode}`, {
          payload: {},
          success: Schema.Array(Schema.Number),
          idempotencyKey: () => "parent"
        })
        const Child = Workflow.make(`WorkflowEngine/PendingChild/${mode}`, {
          payload: { index: Schema.Number },
          success: Schema.Number,
          idempotencyKey: ({ index }) => {
            if (index === 1) {
              if (mode === "failure") throw new Error("cannot compute the execution id")
              computingId.openUnsafe()
            }
            return String(index)
          }
        })
        const ParentLayer = Parent.toLayer(() =>
          Activity.make({
            name: "children",
            success: Schema.Array(Schema.Number),
            execute: Effect.forEach([0, 1], (index) => {
              const execute = Child.execute({ index })
              if (index === 0) return execute
              return mode === "failure"
                ? Effect.catchDefect(execute, () => Effect.succeed(-1))
                : Effect.raceFirst(execute, Effect.as(computingId.await, -1))
            }, { concurrency: "unbounded" })
          })
        )
        const ChildLayer = Child.toLayer(Effect.fnUntraced(function*({ index }) {
          started.add(index)
          yield* DurableClock.sleep({ name: "wait", duration: "2 seconds", inMemoryThreshold: Duration.zero })
          return index
        }))
        yield* Effect.gen(function*() {
          const executionId = yield* Parent.execute({}, { discard: true })
          let result = yield* Parent.poll(executionId)
          while (Option.isNone(result) || result.value._tag !== "Suspended") {
            yield* Effect.yieldNow
            result = yield* Parent.poll(executionId)
          }
          assert.deepStrictEqual([...started], [0])
          yield* TestClock.adjust("2 seconds")
          result = yield* Parent.poll(executionId)
          while (Option.isNone(result) || result.value._tag !== "Complete") {
            yield* Effect.yieldNow
            result = yield* Parent.poll(executionId)
          }
          assert.deepStrictEqual(
            result.value,
            new Workflow.Complete({ exit: Exit.succeed([0, -1]) })
          )
        }).pipe(
          Effect.provide(Layer.mergeAll(ParentLayer, ChildLayer).pipe(Layer.provideMerge(WorkflowEngine.layerMemory)))
        )
      }))
  }

  it.effect("discard returns the deterministic execution ID", () =>
    Effect.gen(function*() {
      const executionId = yield* IncrementWorkflow.executionId({ value: 1 })
      const discardedExecutionId = yield* IncrementWorkflow.execute({ value: 1 }, { discard: true })

      assert.strictEqual(discardedExecutionId, executionId)
    }).pipe(
      Effect.provide(IncrementWorkflowLayer.pipe(
        Layer.provideMerge(WorkflowEngine.layerMemory)
      ))
    ))

  it.effect("distinguishes workflow tags and idempotency keys at string boundaries", () =>
    Effect.gen(function*() {
      const makeWorkflow = (tag: string) =>
        Workflow.make(tag, {
          payload: { key: Schema.String, value: Schema.Number },
          idempotencyKey: ({ key }) => key
        })

      for (
        const [leftTag, leftKey, rightTag, rightKey] of [
          ["Order", "Pay-42", "Order-Pay", "42"],
          ["Order", "Pay:42", "Order:Pay", "42"],
          ["", "-", "-", ""],
          ["A\"", "B\\", "A\"-B", "\\"]
        ]
      ) {
        const left = makeWorkflow(leftTag)
        const right = makeWorkflow(rightTag)
        const leftId = yield* left.executionId({ key: leftKey, value: 1 })
        const rightId = yield* right.executionId({ key: rightKey, value: 1 })

        assert.notStrictEqual(leftId, rightId)
        assert.strictEqual(yield* left.executionId({ key: leftKey, value: 1 }), leftId)
        assert.strictEqual(yield* left.executionId({ key: leftKey, value: 2 }), leftId)
      }
    }))

  it.effect("supports class extension", () =>
    Effect.gen(function*() {
      const result = yield* ClassWorkflow.execute({ value: 1 })

      assert.strictEqual(ClassWorkflow._tag, "WorkflowEngine/ClassWorkflow")
      assert.strictEqual(result, 2)
    }).pipe(
      Effect.provide(ClassWorkflowLayer.pipe(
        Layer.provideMerge(WorkflowEngine.layerMemory)
      ))
    ))

  it.effect("layerMemory wakes an active workflow when a durable deferred completes", () =>
    Effect.gen(function*() {
      const payload = { id: "memory-deferred-race" }
      const executionId = yield* DeferredRaceWorkflow.executionId(payload)
      const fiber = yield* DeferredRaceWorkflow.execute(payload).pipe(
        Effect.forkChild({ startImmediately: true })
      )

      // Park the deferred branch before completing it.
      yield* TestClock.adjust(1)
      yield* TestClock.adjust(1)
      const token = DurableDeferred.tokenFromExecutionId(DeferredRaceGate, {
        workflow: DeferredRaceWorkflow,
        executionId
      })
      yield* DurableDeferred.succeed(DeferredRaceGate, { token, value: "signal" })
      // Require the wake to settle before the sleeper.
      let polled = yield* DeferredRaceWorkflow.poll(executionId)
      while (Option.isNone(polled) || polled.value._tag !== "Complete") {
        yield* Effect.yieldNow
        polled = yield* DeferredRaceWorkflow.poll(executionId)
      }

      // Let the caller's suspended-retry loop pick up a replayed result.
      yield* TestClock.adjust("1 second")
      assert.strictEqual(yield* Fiber.join(fiber), "signal")
      // Usually the completion preempts the parked run (2 runs); under load
      // it can land before the branch parks and is read directly (1 run).
      assert(deferredRaceRuns === 1 || deferredRaceRuns === 2)
    }).pipe(
      Effect.provide(DeferredRaceWorkflowLayer.pipe(
        Layer.provideMerge(WorkflowEngine.layerMemory)
      ))
    ))

  it.effect("layerMemory wakes a suspended caller when its workflow completes", () =>
    Effect.gen(function*() {
      const retrying = yield* Latch.make()
      const gate = DurableDeferred.make("WorkflowEngine/CompletionWakeGate", { success: Schema.String })
      const workflow = Workflow.make("WorkflowEngine/CompletionWake", {
        payload: {},
        success: Schema.String,
        idempotencyKey: () => "one",
        // The retry stays the fallback, but is too slow to deliver within the test.
        suspendedRetrySchedule: Schedule.spaced("1 hour").pipe(Schedule.tap(() => retrying.open))
      })
      yield* Effect.gen(function*() {
        const executionId = yield* workflow.executionId({})
        const fiber = yield* workflow.execute({}).pipe(Effect.forkChild({ startImmediately: true }))
        for (let i = 0; i < 1000 && !retrying.isOpen(); i++) yield* TestClock.adjust(1)
        assert(retrying.isOpen(), "caller must wait on its retry schedule")
        yield* DurableDeferred.succeed(gate, {
          token: DurableDeferred.tokenFromExecutionId(gate, { workflow, executionId }),
          value: "done"
        })
        let polled = yield* workflow.poll(executionId)
        for (let i = 0; i < 1000 && !(Option.isSome(polled) && polled.value._tag === "Complete"); i++) {
          yield* Effect.yieldNow
          polled = yield* workflow.poll(executionId)
        }
        assert(Option.isSome(polled) && polled.value._tag === "Complete", "workflow must complete")
        for (let i = 0; i < 1000 && fiber.pollUnsafe() === undefined; i++) yield* TestClock.adjust(1)
        assert(fiber.pollUnsafe() !== undefined, "completion must wake the caller")
        assert.strictEqual(yield* Fiber.join(fiber), "done")
      }).pipe(
        Effect.provide(
          workflow.toLayer(() => DurableDeferred.await(gate)).pipe(Layer.provideMerge(WorkflowEngine.layerMemory))
        )
      )
    }))

  it.effect("layerMemory does not spend a retry when a replay suspends again", () =>
    Effect.gen(function*() {
      const retrying = yield* Latch.make()
      let runs = 0
      const first = DurableDeferred.make("WorkflowEngine/ResuspendFirst", { success: Schema.String })
      const second = DurableDeferred.make("WorkflowEngine/ResuspendSecond", { success: Schema.String })
      const workflow = Workflow.make("WorkflowEngine/Resuspend", {
        payload: {},
        success: Schema.String,
        idempotencyKey: () => "one",
        // A single retry: only completion can deliver the result.
        suspendedRetrySchedule: Schedule.spaced("1 hour").pipe(
          Schedule.upTo({ times: 1 }),
          Schedule.tap(() => retrying.open)
        )
      })
      const complete = (deferred: typeof first, executionId: string, value: string) =>
        DurableDeferred.succeed(deferred, {
          token: DurableDeferred.tokenFromExecutionId(deferred, { workflow, executionId }),
          value
        })
      yield* Effect.gen(function*() {
        const executionId = yield* workflow.executionId({})
        const fiber = yield* workflow.execute({}).pipe(Effect.forkChild({ startImmediately: true }))
        for (let i = 0; i < 1000 && !retrying.isOpen(); i++) yield* TestClock.adjust(1)
        assert(retrying.isOpen(), "caller must wait on its retry schedule")
        yield* complete(first, executionId, "first")
        const replayed = () => runs === 2
        let polled = yield* workflow.poll(executionId)
        for (let i = 0; i < 1000 && !(replayed() && Option.isSome(polled)); i++) {
          yield* Effect.yieldNow
          polled = yield* workflow.poll(executionId)
        }
        assert(replayed() && Option.isSome(polled) && polled.value._tag === "Suspended", "replay must suspend again")
        yield* complete(second, executionId, "second")
        for (let i = 0; i < 1000 && fiber.pollUnsafe() === undefined; i++) yield* TestClock.adjust(1)
        assert(fiber.pollUnsafe() !== undefined, "completion must wake the caller")
        assert.strictEqual(yield* Fiber.join(fiber), "first/second")
      }).pipe(
        Effect.provide(
          workflow.toLayer(() =>
            Effect.gen(function*() {
              runs++
              const a = yield* DurableDeferred.await(first)
              const b = yield* DurableDeferred.await(second)
              return `${a}/${b}`
            })
          ).pipe(Layer.provideMerge(WorkflowEngine.layerMemory))
        )
      )
    }))

  it.effect("layerMemory does not wake a caller from a run that died before a resume", () =>
    Effect.gen(function*() {
      const retrying = yield* Latch.make()
      let runs = 0
      const gate = DurableDeferred.make("WorkflowEngine/DiedGate", { success: Schema.String })
      const workflow = Workflow.make("WorkflowEngine/Died", {
        payload: {},
        success: Schema.String,
        idempotencyKey: () => "one",
        // A single retry: only completion can deliver the result.
        suspendedRetrySchedule: Schedule.spaced("1 hour").pipe(
          Schedule.upTo({ times: 1 }),
          Schedule.tap(() => retrying.open)
        )
      }).annotate(Workflow.CaptureDefects, false)
      yield* Effect.gen(function*() {
        const executionId = yield* workflow.executionId({})
        assert(Exit.isFailure(yield* Effect.exit(workflow.execute({}))), "first run must die")
        yield* workflow.resume(executionId)
        const fiber = yield* workflow.execute({}).pipe(Effect.forkChild({ startImmediately: true }))
        for (let i = 0; i < 1000 && !retrying.isOpen(); i++) yield* TestClock.adjust(1)
        assert(retrying.isOpen(), "caller must wait on its retry schedule")
        assert.isUndefined(fiber.pollUnsafe(), "the died run must not wake the caller")
        yield* DurableDeferred.succeed(gate, {
          token: DurableDeferred.tokenFromExecutionId(gate, { workflow, executionId }),
          value: "done"
        })
        for (let i = 0; i < 1000 && fiber.pollUnsafe() === undefined; i++) yield* TestClock.adjust(1)
        assert(fiber.pollUnsafe() !== undefined, "completion must wake the caller")
        assert.strictEqual(yield* Fiber.join(fiber), "done")
      }).pipe(
        Effect.provide(
          workflow.toLayer(() => Effect.suspend(() => ++runs === 1 ? Effect.die("boom") : DurableDeferred.await(gate)))
            .pipe(Layer.provideMerge(WorkflowEngine.layerMemory))
        )
      )
    }))

  it.effect("layerMemory propagates interruption when the engine is shut down", () =>
    Effect.gen(function*() {
      const Stuck = Workflow.make("WorkflowEngine/ShutdownWorkflow", {
        payload: { id: Schema.String },
        idempotencyKey: ({ id }) => id
      })
      const layer = Stuck.toLayer(() => Effect.never).pipe(
        Layer.provideMerge(WorkflowEngine.layerMemory)
      )
      const scope = yield* Scope.make()
      const context = yield* Scope.provide(Layer.build(layer), scope)
      const fiber = yield* Stuck.execute({ id: "one" }).pipe(
        Effect.provideContext(context),
        Effect.forkChild({ startImmediately: true })
      )
      yield* Effect.yieldNow
      yield* Effect.yieldNow

      // Shutting down must interrupt the caller, not report a suspension.
      yield* Scope.close(scope, Exit.void)
      const exit = yield* Fiber.await(fiber)
      assert(Exit.hasInterrupts(exit))
    }))

  it.effect("layerMemory runs compensations when the engine is shut down", () =>
    Effect.gen(function*() {
      const ready = Latch.makeUnsafe()
      const compensated: Array<string> = []
      const Stuck = Workflow.make("WorkflowEngine/ShutdownCompensation", {
        payload: { id: Schema.String },
        idempotencyKey: ({ id }) => id
      })
      const layer = Stuck.toLayer(() =>
        Effect.gen(function*() {
          yield* Effect.succeed("a").pipe(
            Stuck.withCompensation((value) => Effect.sync(() => compensated.push(value)))
          )
          ready.openUnsafe()
          return yield* Effect.never
        })
      ).pipe(
        Layer.provideMerge(WorkflowEngine.layerMemory)
      )
      const scope = yield* Scope.make()
      const context = yield* Scope.provide(Layer.build(layer), scope)
      const fiber = yield* Stuck.execute({ id: "one" }).pipe(
        Effect.provideContext(context),
        Effect.forkChild({ startImmediately: true })
      )
      yield* ready.await

      yield* Scope.close(scope, Exit.void)
      const exit = yield* Fiber.await(fiber)

      assert(Exit.hasInterrupts(exit))
      assert.deepStrictEqual(compensated, ["a"])
    }))

  it.effect("layerMemory compensates a completed activity only once after replay", () =>
    Effect.gen(function*() {
      const gate = DurableDeferred.make("WorkflowEngine/CompensationReplay/Gate", { error: Schema.String })
      const events: Array<string> = []
      let runs = 0
      const Order = Workflow.make("WorkflowEngine/CompensationReplay", {
        payload: { id: Schema.String },
        error: Schema.String,
        idempotencyKey: ({ id }) => id
      })
      const layer = Order.toLayer(() =>
        Effect.gen(function*() {
          runs++
          yield* Activity.make({
            name: "charge",
            success: Schema.String,
            execute: Effect.sync(() => {
              events.push("charge")
              return "ch_1"
            })
          }).pipe(
            Order.withCompensation((id) => Effect.sync(() => events.push(`refund ${id}`)))
          )
          yield* DurableDeferred.await(gate)
        })
      ).pipe(Layer.provideMerge(WorkflowEngine.layerMemory))

      yield* Effect.gen(function*() {
        const executionId = yield* Order.execute({ id: "one" }, { discard: true })
        let result = yield* Order.poll(executionId)
        while (Option.isNone(result) || result.value._tag !== "Suspended") {
          yield* Effect.yieldNow
          result = yield* Order.poll(executionId)
        }
        assert.deepStrictEqual(events, ["charge"])

        yield* Order.resume(executionId)
        result = yield* Order.poll(executionId)
        while (Option.isNone(result) || result.value._tag !== "Suspended") {
          yield* Effect.yieldNow
          result = yield* Order.poll(executionId)
        }
        assert.strictEqual(runs, 2)
        assert.deepStrictEqual(events, ["charge"])

        const token = DurableDeferred.tokenFromExecutionId(gate, { workflow: Order, executionId })
        yield* DurableDeferred.fail(gate, { token, error: "rejected" })
        while (Option.isNone(result) || result.value._tag !== "Complete") {
          yield* Effect.yieldNow
          result = yield* Order.poll(executionId)
        }

        assert(Exit.isFailure(result.value.exit))
        assert.strictEqual(result.value.exit.cause.reasons.length, 1)
        const reason = result.value.exit.cause.reasons[0]
        assert(Cause.isFailReason(reason))
        assert.strictEqual(reason.error, "rejected")
        assert.strictEqual(runs, 3)
        assert.deepStrictEqual(events, ["charge", "refund ch_1"])
      }).pipe(Effect.provide(layer))
    }))

  it.effect("layerMemory closes finalizers registered before suspension", () =>
    Effect.gen(function*() {
      const gate = DurableDeferred.make("WorkflowEngine/SuspendedScope/Gate")
      const finalized: Array<number> = []
      let runs = 0
      const Suspends = Workflow.make("WorkflowEngine/SuspendedScope", {
        payload: { id: Schema.String },
        idempotencyKey: ({ id }) => id
      })
      const layer = Suspends.toLayer(() =>
        Effect.gen(function*() {
          const run = ++runs
          yield* Workflow.addFinalizer(() => Effect.sync(() => finalized.push(run)))
          yield* DurableDeferred.await(gate)
        })
      ).pipe(Layer.provideMerge(WorkflowEngine.layerMemory))

      yield* Effect.gen(function*() {
        const payload = { id: "one" }
        const executionId = yield* Suspends.execute(payload, { discard: true })
        let result = yield* Suspends.poll(executionId)
        while (Option.isNone(result) || result.value._tag !== "Suspended") {
          yield* Effect.yieldNow
          result = yield* Suspends.poll(executionId)
        }

        const token = DurableDeferred.tokenFromExecutionId(gate, { workflow: Suspends, executionId })
        yield* DurableDeferred.succeed(gate, { token, value: void 0 })
        yield* Suspends.execute(payload)

        assert.deepStrictEqual(finalized, [2, 1])
      }).pipe(Effect.provide(layer))
    }))

  it.effect("layerMemory closes every suspended run scope when a finalizer dies", () =>
    Effect.gen(function*() {
      const gate = DurableDeferred.make("WorkflowEngine/SuspendedScopeDefect/Gate")
      const finalized: Array<number> = []
      let runs = 0
      const Suspends = Workflow.make("WorkflowEngine/SuspendedScopeDefect", {
        payload: {},
        idempotencyKey: () => "one"
      })
      const layer = Suspends.toLayer(() =>
        Effect.gen(function*() {
          const run = ++runs
          yield* Workflow.addFinalizer(() =>
            Effect.gen(function*() {
              finalized.push(run)
              if (run === 2) return yield* Effect.die("finalizer defect")
            })
          )
          yield* DurableDeferred.await(gate)
        })
      ).pipe(Layer.provideMerge(WorkflowEngine.layerMemory))

      yield* Effect.gen(function*() {
        const executionId = yield* Suspends.execute({}, { discard: true })
        let result = yield* Suspends.poll(executionId)
        while (Option.isNone(result) || result.value._tag !== "Suspended") {
          yield* Effect.yieldNow
          result = yield* Suspends.poll(executionId)
        }

        yield* Suspends.resume(executionId)
        result = yield* Suspends.poll(executionId)
        while (Option.isNone(result) || result.value._tag !== "Suspended") {
          yield* Effect.yieldNow
          result = yield* Suspends.poll(executionId)
        }
        assert.strictEqual(runs, 2)

        const token = DurableDeferred.tokenFromExecutionId(gate, { workflow: Suspends, executionId })
        yield* DurableDeferred.succeed(gate, { token, value: void 0 })
        let exit = yield* Effect.exit(Suspends.poll(executionId))
        while (Exit.isSuccess(exit) && (Option.isNone(exit.value) || exit.value.value._tag !== "Complete")) {
          yield* Effect.yieldNow
          exit = yield* Effect.exit(Suspends.poll(executionId))
        }

        assert.strictEqual(runs, 3)
        assert(Exit.hasDies(exit))
        assert.deepStrictEqual(finalized, [3, 2, 1])
      }).pipe(Effect.provide(layer))
    }))

  it.effect("layerMemory hides deposited interrupts from body finalizers", () =>
    Effect.gen(function*() {
      const gate = DurableDeferred.make("WorkflowEngine/InterruptBodyFinalizer/Gate")
      const observed = yield* Ref.make<ReadonlyArray<boolean>>([])
      const Suspends = Workflow.make("WorkflowEngine/InterruptBodyFinalizer", {
        payload: { id: Schema.String },
        idempotencyKey: ({ id }) => id
      })
      const layer = Suspends.toLayer(Effect.fnUntraced(function*() {
        const instance = yield* WorkflowEngine.WorkflowInstance
        return yield* DurableDeferred.await(gate).pipe(
          Effect.onExit(() => Ref.update(observed, (values) => [...values, instance.interrupted]))
        )
      })).pipe(Layer.provideMerge(WorkflowEngine.layerMemory))

      yield* Effect.gen(function*() {
        const payload = { id: "one" }
        const executionId = yield* Suspends.execute(payload, { discard: true })
        let result = yield* Suspends.poll(executionId)
        while (Option.isNone(result) || result.value._tag !== "Suspended") {
          yield* Effect.yieldNow
          result = yield* Suspends.poll(executionId)
        }

        yield* Suspends.interrupt(executionId)
        while (Option.isNone(result) || result.value._tag !== "Complete") {
          yield* Effect.yieldNow
          result = yield* Suspends.poll(executionId)
        }

        assert.deepStrictEqual(yield* Ref.get(observed), [false, false])
      }).pipe(Effect.provide(layer))
    }))

  it.effect("layerMemory exposes deposited interrupts to workflow finalizers", () =>
    Effect.gen(function*() {
      const gate = DurableDeferred.make("WorkflowEngine/InterruptWorkflowFinalizer/Gate")
      const observed = yield* Ref.make<ReadonlyArray<boolean>>([])
      const runs = yield* Ref.make(0)
      const Suspends = Workflow.make("WorkflowEngine/InterruptWorkflowFinalizer", {
        payload: { id: Schema.String },
        idempotencyKey: ({ id }) => id
      })
      const layer = Suspends.toLayer(Effect.fnUntraced(function*() {
        const run = yield* Ref.getAndUpdate(runs, (run) => run + 1)
        const instance = yield* WorkflowEngine.WorkflowInstance
        if (run === 1) {
          yield* Workflow.addFinalizer(() => Ref.update(observed, (values) => [...values, instance.interrupted]))
        }
        return yield* DurableDeferred.await(gate)
      })).pipe(Layer.provideMerge(WorkflowEngine.layerMemory))

      yield* Effect.gen(function*() {
        const payload = { id: "one" }
        const executionId = yield* Suspends.execute(payload, { discard: true })
        let result = yield* Suspends.poll(executionId)
        while (Option.isNone(result) || result.value._tag !== "Suspended") {
          yield* Effect.yieldNow
          result = yield* Suspends.poll(executionId)
        }

        yield* Suspends.interrupt(executionId)
        while (Option.isNone(result) || result.value._tag !== "Complete") {
          yield* Effect.yieldNow
          result = yield* Suspends.poll(executionId)
        }

        assert.deepStrictEqual(yield* Ref.get(observed), [true])
      }).pipe(Effect.provide(layer))
    }))

  for (const lastStep of [true, false]) {
    it.effect(
      `layerMemory applies safe interruption during ${
        lastStep ? "the last activity" : "an activity before another step"
      } only on suspension`,
      () =>
        Effect.gen(function*() {
          const started = yield* Latch.make()
          const release = yield* Latch.make()
          const events: Array<string> = []
          const Running = Workflow.make(`WorkflowEngine/InterruptRunningActivity/${lastStep}`, {
            payload: {},
            success: Schema.String,
            idempotencyKey: () => "one"
          })
          const layer = Running.toLayer(Effect.fnUntraced(function*() {
            yield* Activity.make({
              name: "running",
              execute: started.open.pipe(Effect.andThen(release.await))
            }).pipe(Running.withCompensation(() => Effect.sync(() => events.push("compensated"))))
            if (!lastStep) {
              yield* Activity.make({ name: "next", execute: Effect.sync(() => events.push("next")) })
            }
            return "done"
          })).pipe(Layer.provideMerge(WorkflowEngine.layerMemory))

          yield* Effect.gen(function*() {
            const executionId = yield* Running.execute({}, { discard: true })
            yield* started.await
            yield* Running.interrupt(executionId)
            yield* release.open
            let result = yield* Running.poll(executionId)
            while (Option.isNone(result) || result.value._tag !== "Complete") {
              yield* Effect.yieldNow
              result = yield* Running.poll(executionId)
            }

            // Safe interruption takes effect at the next suspension, not at normal completion.
            assert.deepStrictEqual(
              { interrupted: Exit.hasInterrupts(result.value.exit), events },
              lastStep ? { interrupted: false, events: [] } : { interrupted: true, events: ["compensated"] }
            )
            if (lastStep) assert.deepStrictEqual(result.value.exit, Exit.succeed("done"))
          }).pipe(Effect.provide(layer))
        })
    )
  }

  for (const state of ["running", "suspended"] as const) {
    it.effect(`layerMemory interruptUnsafe completes a ${state} workflow without an external wake`, () =>
      Effect.gen(function*() {
        const started = yield* Deferred.make<void>()
        const gate = DurableDeferred.make("WorkflowEngine/InterruptUnsafeNoWake/Gate")
        const workflow = Workflow.make("WorkflowEngine/InterruptUnsafeNoWake", {
          payload: {},
          idempotencyKey: () => "one"
        })
        const layer = workflow.toLayer(() =>
          state === "running"
            ? Activity.make({
              name: "blocked",
              execute: Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never))
            })
            : DurableDeferred.await(gate)
        ).pipe(Layer.provideMerge(WorkflowEngine.layerMemory))

        yield* Effect.gen(function*() {
          const engine = yield* WorkflowEngine.WorkflowEngine
          const executionId = yield* workflow.execute({}, { discard: true })
          if (state === "running") {
            yield* Deferred.await(started)
          } else {
            let result = yield* workflow.poll(executionId)
            for (let i = 0; i < 1000 && !(Option.isSome(result) && result.value._tag === "Suspended"); i++) {
              yield* Effect.yieldNow
              result = yield* workflow.poll(executionId)
            }
            assert(Option.isSome(result) && result.value._tag === "Suspended", "workflow must suspend first")
          }

          yield* engine.interruptUnsafe(workflow, executionId)
          // Do not complete the gate or explicitly resume: interruption must supply its own wake.
          let result = yield* workflow.poll(executionId)
          for (let i = 0; i < 1000 && !(Option.isSome(result) && result.value._tag === "Complete"); i++) {
            yield* Effect.yieldNow
            result = yield* workflow.poll(executionId)
          }
          assert(Option.isSome(result) && result.value._tag === "Complete", "interruption must complete the workflow")
          assert(Exit.hasInterrupts(result.value.exit))
        }).pipe(Effect.provide(layer))
      }))
  }

  it.effect("layerMemory preserves interruptUnsafe across a suspended replay", () =>
    Effect.gen(function*() {
      const gate = DurableDeferred.make("WorkflowEngine/InterruptUnsafeReplay/Gate")
      const Suspends = Workflow.make("WorkflowEngine/InterruptUnsafeReplay", {
        payload: { id: Schema.String },
        idempotencyKey: ({ id }) => id
      })
      const layer = Suspends.toLayer(() => DurableDeferred.await(gate)).pipe(
        Layer.provideMerge(WorkflowEngine.layerMemory)
      )

      yield* Effect.gen(function*() {
        const engine = yield* WorkflowEngine.WorkflowEngine
        const payload = { id: "one" }
        const executionId = yield* Suspends.execute(payload, { discard: true })
        let result = yield* Suspends.poll(executionId)
        while (Option.isNone(result) || result.value._tag !== "Suspended") {
          yield* Effect.yieldNow
          result = yield* Suspends.poll(executionId)
        }

        yield* engine.interruptUnsafe(Suspends, executionId)
        const token = DurableDeferred.tokenFromExecutionId(gate, { workflow: Suspends, executionId })
        yield* DurableDeferred.succeed(gate, { token, value: void 0 })
        while (Option.isNone(result) || result.value._tag !== "Complete") {
          yield* Effect.yieldNow
          result = yield* Suspends.poll(executionId)
        }

        assert(Option.isSome(result) && result.value._tag === "Complete")
        assert(Exit.hasInterrupts(result.value.exit))
      }).pipe(Effect.provide(layer))
    }))
})
