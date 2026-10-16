import { assert, describe, it } from "@effect/vitest"
import { assertTrue, deepStrictEqual, strictEqual } from "@effect/vitest/utils"
import {
  Array,
  Cause,
  Context,
  Duration,
  Effect,
  ExecutionPlan,
  Exit,
  Fiber,
  Latch,
  Layer,
  Scheduler,
  Stream
} from "effect"

describe("ExecutionPlan", () => {
  class Service extends Context.Service<Service>()("Service", {
    make: Effect.succeed({
      stream: Stream.fail("A") as Stream.Stream<number, string>
    })
  }) {
    static A = Layer.effect(this, this.make)

    static B = Layer.succeed(
      Service,
      Service.of({
        stream: Stream.fail("B")
      })
    )
    static C = Layer.succeed(
      Service,
      Service.of({
        stream: Stream.make(1, 2, 3)
      })
    )
  }

  const Plan = ExecutionPlan.make({
    provide: Service.A
  }, {
    provide: Service.B
  }, {
    provide: Service.C
  })

  const PlanPartial = ExecutionPlan.make({
    provide: Layer.succeed(
      Service,
      Service.of({
        stream: Stream.make(1, 2, 3).pipe(
          Stream.concat(Stream.fail("Partial"))
        )
      })
    )
  }, {
    provide: Service.C
  })

  describe("make", () => {
    it("rejects zero attempts", () => {
      assert.throws(
        () =>
          ExecutionPlan.make({
            provide: Context.empty(),
            attempts: 0
          }),
        /ExecutionPlan\.make: step\[0\]\.attempts must be greater than 0/
      )
    })
  })

  describe("captureRequirements", () => {
    class Policy extends Context.Service<Policy, { allow: boolean }>()("ExecutionPlan.test/Policy") {}

    const failOnce = () => {
      let attempts = 0
      return Effect.suspend(() => ++attempts === 1 ? Effect.fail("busy") : Effect.succeed("ok"))
    }

    const plan = ExecutionPlan.make({
      provide: Context.empty(),
      attempts: 2,
      while: (_: string) => Effect.map(Policy, ({ allow }) => allow)
    })

    it.effect("captures while predicate requirements", () =>
      Effect.gen(function*() {
        const captured = yield* plan.captureRequirements.pipe(Effect.provideService(Policy, { allow: true }))
        const result = yield* Effect.withExecutionPlan(failOnce(), captured)
        strictEqual(result, "ok")
      }))

    it.effect("prefers captured while predicate requirements over the ambient context", () =>
      Effect.gen(function*() {
        const captured = yield* plan.captureRequirements.pipe(Effect.provideService(Policy, { allow: true }))
        const result = yield* Effect.withExecutionPlan(failOnce(), captured).pipe(
          Effect.provideService(Policy, { allow: false })
        )
        strictEqual(result, "ok")
      }))
  })

  describe("Stream.withExecutionPlan", () => {
    it.effect("limits attempts after partial stream failures", () =>
      Effect.gen(function*() {
        let runs = 0
        const stream = Stream.fromEffect(Effect.sync(() => {
          runs++
          return 1
        })).pipe(Stream.concat(Stream.fail("boom")))
        const plan = ExecutionPlan.make({
          provide: Context.empty(),
          attempts: 3
        })
        const items = Array.empty<number>()

        const result = yield* stream.pipe(
          Stream.withExecutionPlan(plan),
          Stream.runForEach((item) =>
            Effect.sync(() => {
              items.push(item)
            })
          ),
          Effect.exit
        )

        deepStrictEqual(items, [1, 1, 1])
        deepStrictEqual(runs, 3)
        deepStrictEqual(result, Exit.fail("boom"))
      }))

    it.effect("allows interruption between retries after partial stream failures", () =>
      Effect.gen(function*() {
        let runs = 0
        const retried = yield* Latch.make()
        const stream = Stream.fromEffect(Effect.gen(function*() {
          runs++
          if (runs > 1) {
            yield* retried.open
          }
          return 1
        })).pipe(Stream.concat(Stream.fail("boom")))
        const plan = ExecutionPlan.make({
          provide: Context.empty(),
          attempts: Number.MAX_SAFE_INTEGER
        })
        const fiber = yield* stream.pipe(
          Stream.withExecutionPlan(plan),
          Stream.runDrain,
          Effect.provideService(Scheduler.PreventSchedulerYield, true),
          Effect.forkChild
        )

        yield* retried.await
        yield* Fiber.interrupt(fiber)
        const exit = yield* Fiber.await(fiber)

        assertTrue(runs > 1)
        assertTrue(Exit.hasInterrupts(exit))
      }))

    it.effect("falls back through failing layers and records stream attempt metadata", () =>
      Effect.gen(function*() {
        const stream = Stream.unwrap(Effect.map(Service, (_) => _.stream))
        const items = Array.empty<number>()
        const metadata = Array.empty<ExecutionPlan.Metadata>()
        const result = yield* stream.pipe(
          Stream.onStart(ExecutionPlan.CurrentMetadata.use((meta) => {
            metadata.push(meta)
            return Effect.void
          })),
          Stream.withExecutionPlan(Plan),
          Stream.runForEach((n) =>
            Effect.sync(() => {
              items.push(n)
            })
          ),
          Effect.exit
        )
        deepStrictEqual(items, [1, 2, 3])
        deepStrictEqual(metadata, [{
          attempt: 1,
          stepIndex: 0
        }, {
          attempt: 2,
          stepIndex: 1
        }, {
          attempt: 3,
          stepIndex: 2
        }])
        assertTrue(Exit.isSuccess(result))
      }))

    it.effect("falls back after a stream emits partial items by default", () =>
      Effect.gen(function*() {
        const stream = Stream.unwrap(Effect.map(Service, (_) => _.stream))
        const items = Array.empty<number>()
        const result = yield* stream.pipe(
          Stream.withExecutionPlan(PlanPartial),
          Stream.runForEach((n) =>
            Effect.sync(() => {
              items.push(n)
            })
          ),
          Effect.exit
        )
        deepStrictEqual(items, [1, 2, 3, 1, 2, 3])
        assertTrue(Exit.isSuccess(result))
      }))

    it.effect("fails on a partial stream when fallback is disabled", () =>
      Effect.gen(function*() {
        const stream = Stream.unwrap(Effect.map(Service, (_) => _.stream))
        const items = Array.empty<number>()
        const result = yield* stream.pipe(
          Stream.withExecutionPlan(PlanPartial, {
            preventFallbackOnPartialStream: true
          }),
          Stream.runForEach((n) =>
            Effect.sync(() => {
              items.push(n)
            })
          ),
          Effect.exit
        )
        deepStrictEqual(items, [1, 2, 3])
        deepStrictEqual(result, Exit.fail("Partial"))
      }))
  })

  describe("onEvent", () => {
    const makeCollector = () => {
      const events = Array.empty<ExecutionPlan.Event<unknown>>()
      const onEvent = (event: ExecutionPlan.Event<unknown>) =>
        Effect.sync(() => {
          events.push(event)
        })
      return { events, onEvent }
    }

    const simplify = (event: ExecutionPlan.Event<unknown>) =>
      event._tag === "AttemptFailure"
        ? {
          _tag: event._tag,
          attempt: event.attempt,
          stepAttempt: event.stepAttempt,
          stepIndex: event.stepIndex,
          error: Cause.squash(event.cause)
        }
        : {
          _tag: event._tag,
          attempt: event.attempt,
          stepAttempt: event.stepAttempt,
          stepIndex: event.stepIndex
        }

    describe("Effect.withExecutionPlan", () => {
      it.effect("emits start and success on first attempt", () =>
        Effect.gen(function*() {
          const { events, onEvent } = makeCollector()
          const result = yield* Effect.succeed(1).pipe(
            Effect.withExecutionPlan(ExecutionPlan.make({ provide: Context.empty() }), { onEvent })
          )
          strictEqual(result, 1)
          deepStrictEqual(events.map(simplify), [
            { _tag: "AttemptStart", attempt: 1, stepAttempt: 1, stepIndex: 0 },
            { _tag: "AttemptSuccess", attempt: 1, stepAttempt: 1, stepIndex: 0 }
          ])
          assertTrue(events[1]._tag === "AttemptSuccess" && Duration.isDuration(events[1].duration))
        }))

      it.effect("observer defects do not change the outcome or leave attempts unpaired", () =>
        Effect.gen(function*() {
          const events = Array.empty<string>()
          const exit = yield* Effect.succeed("source-success").pipe(
            Effect.withExecutionPlan(ExecutionPlan.make({ provide: Context.empty() }), {
              onEvent: (event) =>
                Effect.sync(() => events.push(event._tag)).pipe(
                  Effect.andThen(Effect.die("observer-defect"))
                )
            }),
            Effect.exit
          )

          deepStrictEqual(
            { exit, events },
            { exit: Exit.succeed("source-success"), events: ["AttemptStart", "AttemptSuccess"] },
            "observer defects must not affect the source outcome"
          )
        }))

      it.effect("emits an event pair per attempt within a step", () =>
        Effect.gen(function*() {
          const { events, onEvent } = makeCollector()
          let runs = 0
          const task = Effect.suspend(() => {
            runs++
            return runs < 3 ? Effect.fail(`fail-${runs}`) : Effect.succeed(runs)
          })
          const plan = ExecutionPlan.make({ provide: Context.empty(), attempts: 3 })
          const result = yield* Effect.withExecutionPlan(task, plan, { onEvent })
          strictEqual(result, 3)
          deepStrictEqual(events.map(simplify), [
            { _tag: "AttemptStart", attempt: 1, stepAttempt: 1, stepIndex: 0 },
            { _tag: "AttemptFailure", attempt: 1, stepAttempt: 1, stepIndex: 0, error: "fail-1" },
            { _tag: "AttemptStart", attempt: 2, stepAttempt: 2, stepIndex: 0 },
            { _tag: "AttemptFailure", attempt: 2, stepAttempt: 2, stepIndex: 0, error: "fail-2" },
            { _tag: "AttemptStart", attempt: 3, stepAttempt: 3, stepIndex: 0 },
            { _tag: "AttemptSuccess", attempt: 3, stepAttempt: 3, stepIndex: 0 }
          ])
        }))

      it.effect("fails over to the next step without replaying events", () =>
        Effect.gen(function*() {
          const { events, onEvent } = makeCollector()
          let runs = 0
          const task = Effect.suspend(() => {
            runs++
            return runs < 3 ? Effect.fail(`fail-${runs}`) : Effect.succeed(runs)
          })
          const plan = ExecutionPlan.make(
            { provide: Context.empty(), attempts: 2 },
            { provide: Context.empty(), attempts: 2 }
          )
          const result = yield* Effect.withExecutionPlan(task, plan, { onEvent })
          strictEqual(result, 3)
          deepStrictEqual(events.map(simplify), [
            { _tag: "AttemptStart", attempt: 1, stepAttempt: 1, stepIndex: 0 },
            { _tag: "AttemptFailure", attempt: 1, stepAttempt: 1, stepIndex: 0, error: "fail-1" },
            { _tag: "AttemptStart", attempt: 2, stepAttempt: 2, stepIndex: 0 },
            { _tag: "AttemptFailure", attempt: 2, stepAttempt: 2, stepIndex: 0, error: "fail-2" },
            { _tag: "AttemptStart", attempt: 3, stepAttempt: 1, stepIndex: 1 },
            { _tag: "AttemptSuccess", attempt: 3, stepAttempt: 1, stepIndex: 1 }
          ])
        }))

      it.effect("event attempt matches CurrentMetadata across a failover boundary", () =>
        Effect.gen(function*() {
          const { events, onEvent } = makeCollector()
          const inside = Array.empty<ExecutionPlan.Metadata>()
          let runs = 0
          const task = Effect.gen(function*() {
            yield* ExecutionPlan.CurrentMetadata.use((meta) => {
              inside.push(meta)
              return Effect.void
            })
            runs++
            return runs < 3 ? yield* Effect.fail("boom") : runs
          })
          const plan = ExecutionPlan.make(
            { provide: Context.empty(), attempts: 2 },
            { provide: Context.empty(), attempts: 2 }
          )
          const result = yield* Effect.withExecutionPlan(task, plan, { onEvent })
          strictEqual(result, 3)
          deepStrictEqual(inside, [
            { attempt: 1, stepIndex: 0 },
            { attempt: 2, stepIndex: 0 },
            { attempt: 3, stepIndex: 1 }
          ])
          deepStrictEqual(
            events.filter((event) => event._tag === "AttemptStart")
              .map((event) => ({ attempt: event.attempt, stepIndex: event.stepIndex })),
            inside
          )
        }))

      it.effect("emits AttemptFailure when a step layer fails to build", () =>
        Effect.gen(function*() {
          const { events, onEvent } = makeCollector()
          const plan = ExecutionPlan.make(
            { provide: Layer.effect(Service, Effect.fail("nope")) },
            { provide: Service.C }
          )
          const result = yield* Stream.runCollect(Stream.unwrap(Effect.map(Service, (_) => _.stream))).pipe(
            Effect.withExecutionPlan(plan, { onEvent })
          )
          deepStrictEqual(result, [1, 2, 3])
          deepStrictEqual(events.map(simplify), [
            { _tag: "AttemptStart", attempt: 1, stepAttempt: 1, stepIndex: 0 },
            { _tag: "AttemptFailure", attempt: 1, stepAttempt: 1, stepIndex: 0, error: "nope" },
            { _tag: "AttemptStart", attempt: 2, stepAttempt: 1, stepIndex: 1 },
            { _tag: "AttemptSuccess", attempt: 2, stepAttempt: 1, stepIndex: 1 }
          ])
        }))

      it.effect("emits AttemptFailure when interrupted mid-attempt", () =>
        Effect.gen(function*() {
          const { events, onEvent } = makeCollector()
          const started = yield* Latch.make()
          const task = Effect.gen(function*() {
            yield* started.open
            return yield* Effect.never
          })
          const plan = ExecutionPlan.make({ provide: Context.empty(), attempts: 2 })
          const fiber = yield* task.pipe(
            Effect.withExecutionPlan(plan, { onEvent }),
            Effect.forkChild
          )
          yield* started.await
          yield* Fiber.interrupt(fiber)
          const exit = yield* Fiber.await(fiber)
          assertTrue(Exit.hasInterrupts(exit))
          strictEqual(events.length, 2)
          deepStrictEqual(simplify(events[0]), { _tag: "AttemptStart", attempt: 1, stepAttempt: 1, stepIndex: 0 })
          const failure = events[1]
          assertTrue(failure._tag === "AttemptFailure")
          strictEqual(failure.attempt, 1)
          assertTrue(Cause.hasInterrupts(failure.cause))
        }))

      it.effect("emits AttemptFailure for defects without retrying", () =>
        Effect.gen(function*() {
          const { events, onEvent } = makeCollector()
          const plan = ExecutionPlan.make(
            { provide: Context.empty(), attempts: 2 },
            { provide: Context.empty() }
          )
          const exit = yield* Effect.die("boom").pipe(
            Effect.withExecutionPlan(plan, { onEvent }),
            Effect.exit
          )
          deepStrictEqual(exit, Exit.die("boom"))
          deepStrictEqual(events.map(simplify), [
            { _tag: "AttemptStart", attempt: 1, stepAttempt: 1, stepIndex: 0 },
            { _tag: "AttemptFailure", attempt: 1, stepAttempt: 1, stepIndex: 0, error: "boom" }
          ])
        }))
    })

    describe("Stream.withExecutionPlan", () => {
      it.effect("observer defects do not change the outcome or leave attempts unpaired", () =>
        Effect.gen(function*() {
          const events = Array.empty<string>()
          const exit = yield* Stream.succeed("source-success").pipe(
            Stream.withExecutionPlan(ExecutionPlan.make({ provide: Context.empty() }), {
              onEvent: (event) =>
                Effect.sync(() => events.push(event._tag)).pipe(
                  Effect.andThen(Effect.die("observer-defect"))
                )
            }),
            Stream.runCollect,
            Effect.exit
          )

          deepStrictEqual(
            { exit, events },
            { exit: Exit.succeed(["source-success"]), events: ["AttemptStart", "AttemptSuccess"] },
            "observer defects must not affect the source outcome"
          )
        }))

      it.effect("emits events for each step attempt", () =>
        Effect.gen(function*() {
          const { events, onEvent } = makeCollector()
          const stream = Stream.unwrap(Effect.map(Service, (_) => _.stream))
          const items = yield* stream.pipe(
            Stream.withExecutionPlan(Plan, { onEvent }),
            Stream.runCollect
          )
          deepStrictEqual(items, [1, 2, 3])
          deepStrictEqual(events.map(simplify), [
            { _tag: "AttemptStart", attempt: 1, stepAttempt: 1, stepIndex: 0 },
            { _tag: "AttemptFailure", attempt: 1, stepAttempt: 1, stepIndex: 0, error: "A" },
            { _tag: "AttemptStart", attempt: 2, stepAttempt: 1, stepIndex: 1 },
            { _tag: "AttemptFailure", attempt: 2, stepAttempt: 1, stepIndex: 1, error: "B" },
            { _tag: "AttemptStart", attempt: 3, stepAttempt: 1, stepIndex: 2 },
            { _tag: "AttemptSuccess", attempt: 3, stepAttempt: 1, stepIndex: 2 }
          ])
        }))

      it.effect("emits an event pair per attempt within a step", () =>
        Effect.gen(function*() {
          const { events, onEvent } = makeCollector()
          const stream = Stream.make(1).pipe(Stream.concat(Stream.fail("boom")))
          const plan = ExecutionPlan.make({ provide: Context.empty(), attempts: 3 })
          const result = yield* stream.pipe(
            Stream.withExecutionPlan(plan, { onEvent }),
            Stream.runDrain,
            Effect.exit
          )
          deepStrictEqual(result, Exit.fail("boom"))
          deepStrictEqual(events.map(simplify), [
            { _tag: "AttemptStart", attempt: 1, stepAttempt: 1, stepIndex: 0 },
            { _tag: "AttemptFailure", attempt: 1, stepAttempt: 1, stepIndex: 0, error: "boom" },
            { _tag: "AttemptStart", attempt: 2, stepAttempt: 2, stepIndex: 0 },
            { _tag: "AttemptFailure", attempt: 2, stepAttempt: 2, stepIndex: 0, error: "boom" },
            { _tag: "AttemptStart", attempt: 3, stepAttempt: 3, stepIndex: 0 },
            { _tag: "AttemptFailure", attempt: 3, stepAttempt: 3, stepIndex: 0, error: "boom" }
          ])
        }))

      it.effect("emits events when falling back after a partial stream", () =>
        Effect.gen(function*() {
          const { events, onEvent } = makeCollector()
          const stream = Stream.unwrap(Effect.map(Service, (_) => _.stream))
          const items = yield* stream.pipe(
            Stream.withExecutionPlan(PlanPartial, { onEvent }),
            Stream.runCollect
          )
          deepStrictEqual(items, [1, 2, 3, 1, 2, 3])
          deepStrictEqual(events.map(simplify), [
            { _tag: "AttemptStart", attempt: 1, stepAttempt: 1, stepIndex: 0 },
            { _tag: "AttemptFailure", attempt: 1, stepAttempt: 1, stepIndex: 0, error: "Partial" },
            { _tag: "AttemptStart", attempt: 2, stepAttempt: 1, stepIndex: 1 },
            { _tag: "AttemptSuccess", attempt: 2, stepAttempt: 1, stepIndex: 1 }
          ])
        }))

      it.effect("emits AttemptFailure when interrupted mid-attempt", () =>
        Effect.gen(function*() {
          const { events, onEvent } = makeCollector()
          const started = yield* Latch.make()
          const stream = Stream.fromEffect(Effect.gen(function*() {
            yield* started.open
            return yield* Effect.never
          }))
          const plan = ExecutionPlan.make({ provide: Context.empty(), attempts: 2 })
          const fiber = yield* stream.pipe(
            Stream.withExecutionPlan(plan, { onEvent }),
            Stream.runDrain,
            Effect.forkChild
          )
          yield* started.await
          yield* Fiber.interrupt(fiber)
          const exit = yield* Fiber.await(fiber)
          assertTrue(Exit.hasInterrupts(exit))
          strictEqual(events.length, 2)
          deepStrictEqual(simplify(events[0]), { _tag: "AttemptStart", attempt: 1, stepAttempt: 1, stepIndex: 0 })
          const failure = events[1]
          assertTrue(failure._tag === "AttemptFailure")
          strictEqual(failure.attempt, 1)
          assertTrue(Cause.hasInterrupts(failure.cause))
        }))

      it.effect("emits AttemptFailure for defects without retrying", () =>
        Effect.gen(function*() {
          const { events, onEvent } = makeCollector()
          const plan = ExecutionPlan.make(
            { provide: Context.empty(), attempts: 2 },
            { provide: Context.empty() }
          )
          const exit = yield* Stream.fromEffect(Effect.die("boom")).pipe(
            Stream.withExecutionPlan(plan, { onEvent }),
            Stream.runDrain,
            Effect.exit
          )
          deepStrictEqual(exit, Exit.die("boom"))
          deepStrictEqual(events.map(simplify), [
            { _tag: "AttemptStart", attempt: 1, stepAttempt: 1, stepIndex: 0 },
            { _tag: "AttemptFailure", attempt: 1, stepAttempt: 1, stepIndex: 0, error: "boom" }
          ])
        }))

      it.effect("emits events when a partial stream fails with fallback disabled", () =>
        Effect.gen(function*() {
          const { events, onEvent } = makeCollector()
          const stream = Stream.unwrap(Effect.map(Service, (_) => _.stream))
          const result = yield* stream.pipe(
            Stream.withExecutionPlan(PlanPartial, {
              preventFallbackOnPartialStream: true,
              onEvent
            }),
            Stream.runDrain,
            Effect.exit
          )
          deepStrictEqual(result, Exit.fail("Partial"))
          deepStrictEqual(events.map(simplify), [
            { _tag: "AttemptStart", attempt: 1, stepAttempt: 1, stepIndex: 0 },
            { _tag: "AttemptFailure", attempt: 1, stepAttempt: 1, stepIndex: 0, error: "Partial" }
          ])
        }))
    })
  })
})
