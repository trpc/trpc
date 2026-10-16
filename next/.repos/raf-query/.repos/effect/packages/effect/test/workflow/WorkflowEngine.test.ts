import { assert, describe, it } from "@effect/vitest"
import { Cause, Duration, Effect, Exit, Fiber, Latch, Layer, Option, Ref, Schema, Scope } from "effect"
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
