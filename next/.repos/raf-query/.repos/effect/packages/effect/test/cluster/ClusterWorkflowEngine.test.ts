import { assert, describe, expect, it } from "@effect/vitest"
import {
  Cause,
  Context,
  DateTime,
  Duration,
  Effect,
  Exit,
  Fiber,
  Latch,
  Layer,
  Logger,
  Option,
  Result,
  Schema,
  Scope,
  Tracer
} from "effect"
import {
  ClusterError,
  ClusterSchema,
  ClusterWorkflowEngine,
  Entity,
  MessageStorage,
  RunnerHealth,
  Runners,
  RunnerStorage,
  Sharding,
  ShardingConfig,
  Snowflake
} from "effect/cluster"
import { CurrentActivationScope } from "effect/cluster/internal/entityActivation"
import { Rpc } from "effect/rpc"
import { TestClock } from "effect/testing"
import { Activity, DurableClock, DurableDeferred, Workflow } from "effect/workflow"
import {
  makeUnsafe as makeWorkflowEngineUnsafe,
  WorkflowEngine,
  WorkflowInstance
} from "effect/workflow/WorkflowEngine"

describe.concurrent("ClusterWorkflowEngine", () => {
  it.effect("does not replay for an unawaited deferred checkpoint", () =>
    Effect.gen(function*() {
      const checkpoint = DurableDeferred.make("UnawaitedCheckpoint/Checkpoint")
      const gate = DurableDeferred.make("UnawaitedCheckpoint/Gate", { success: Schema.String })
      const workflow = Workflow.make("UnawaitedCheckpoint", {
        payload: {},
        success: Schema.String,
        idempotencyKey: () => "one"
      })
      let activations = 0
      const context = yield* Layer.build(
        workflow.toLayer(Effect.fnUntraced(function*(_payload, executionId) {
          activations++
          const engine = yield* WorkflowEngine
          if (Option.isNone(yield* engine.deferredResult(checkpoint))) {
            yield* DurableDeferred.succeed(checkpoint, {
              token: DurableDeferred.tokenFromExecutionId(checkpoint, { workflow, executionId }),
              value: undefined
            })
          }
          return yield* DurableDeferred.await(gate)
        })).pipe(Layer.provideMerge(makeTestWorkflowEngine()))
      )
      yield* Effect.gen(function*() {
        const executionId = yield* workflow.execute({}, { discard: true })
        yield* pollUntil(workflow, executionId, "Suspended")
        const beforeRelease = activations
        yield* DurableDeferred.succeed(gate, {
          token: DurableDeferred.tokenFromExecutionId(gate, { workflow, executionId }),
          value: "done"
        })
        assert.deepStrictEqual(
          yield* pollUntil(workflow, executionId, "Complete"),
          new Workflow.Complete({ exit: Exit.succeed("done") })
        )
        assert.deepStrictEqual({ beforeRelease, afterRelease: activations }, { beforeRelease: 1, afterRelease: 2 })
      }).pipe(Effect.provide(context))
    }))

  it.effect("retries a deferred wake after a transient run reset failure", () =>
    Effect.gen(function*() {
      const gate = DurableDeferred.make("ResetRetry/Gate", { success: Schema.String })
      const workflow = Workflow.make("ResetRetry", {
        payload: {},
        success: Schema.String,
        idempotencyKey: () => "one"
      })
      const shared = yield* Layer.build(
        MessageStorage.layerMemory.pipe(Layer.provide(ShardingConfig.layerDefaults))
      )
      const storage = Context.get(shared, MessageStorage.MessageStorage)
      const driver = Context.get(shared, MessageStorage.MemoryDriver)
      let runRequestId: string | undefined
      let resetAttempts = 0
      const storageLayer = Layer.succeed(MessageStorage.MessageStorage, {
        ...storage,
        clearReplies: (requestId) => {
          if (String(requestId) !== runRequestId) return storage.clearReplies(requestId)
          resetAttempts++
          return resetAttempts === 1
            ? Effect.fail(new ClusterError.PersistenceError({ cause: "transient reset failure" }))
            : storage.clearReplies(requestId)
        }
      })
      const context = yield* Layer.build(
        workflow.toLayer(() => DurableDeferred.await(gate)).pipe(
          Layer.provideMerge(makeTestWorkflowEngine({ storageLayer }))
        )
      )
      yield* Effect.gen(function*() {
        const executionId = yield* workflow.execute({}, { discard: true })
        yield* pollUntil(workflow, executionId, "Suspended")
        const run = driver.journal.find((message) => message._tag === "Request" && message.tag === "run")
        assert(run?._tag === "Request")
        runRequestId = run.requestId

        const completion = yield* DurableDeferred.succeed(gate, {
          token: DurableDeferred.tokenFromExecutionId(gate, { workflow, executionId }),
          value: "signal"
        }).pipe(Effect.forkChild({ startImmediately: true }))
        yield* advanceUntil(() => resetAttempts >= 2, "deferred wake must retry the failed reset", 200, 20)
        yield* Fiber.join(completion)
        assert.deepStrictEqual(
          yield* workflow.poll(executionId),
          Option.some(new Workflow.Complete({ exit: Exit.succeed("signal") }))
        )
      }).pipe(Effect.provide(context))
    }), 20_000)

  it.effect("keeps a completed reply when an older concurrent wake resets it", () =>
    Effect.gen(function*() {
      const firstReset = yield* Latch.make()
      const allowStaleReset = yield* Latch.make()
      const staleResetFinished = yield* Latch.make()
      const allowPoll = yield* Latch.make()
      const first = DurableDeferred.make("ConcurrentResume/First", { success: Schema.String })
      const second = DurableDeferred.make("ConcurrentResume/Second", { success: Schema.String })
      const workflow = Workflow.make("ConcurrentResume", {
        payload: {},
        success: Schema.String,
        idempotencyKey: () => "one"
      })
      const shared = yield* Layer.build(
        MessageStorage.layerMemory.pipe(Layer.provide(ShardingConfig.layerDefaults))
      )
      const storage = Context.get(shared, MessageStorage.MessageStorage)
      const driver = Context.get(shared, MessageStorage.MemoryDriver)
      let runRequestId: Snowflake.Snowflake | undefined
      let runResets = 0
      const storageLayer = Layer.succeed(MessageStorage.MessageStorage, {
        ...storage,
        clearReplies: (id, options) =>
          id === runRequestId && options?.expectedReplyId !== undefined && ++runResets === 1
            ? firstReset.open.pipe(
              Effect.andThen(allowStaleReset.await),
              Effect.andThen(storage.clearReplies(id, options)),
              Effect.andThen(staleResetFinished.open),
              // Do not let the stale wake poll storage and replay before inspecting the reply.
              Effect.andThen(allowPoll.await)
            )
            : storage.clearReplies(id, options)
      })
      const context = yield* Layer.build(
        workflow.toLayer(() =>
          Effect.all([DurableDeferred.await(first), DurableDeferred.await(second)], { concurrency: "unbounded" }).pipe(
            Effect.map(([a, b]) => a + "/" + b)
          )
        ).pipe(Layer.provideMerge(makeTestWorkflowEngine({ storageLayer })))
      )
      yield* Effect.addFinalizer(() => Effect.all([allowStaleReset.open, allowPoll.open], { discard: true }))
      yield* Effect.gen(function*() {
        const executionId = yield* workflow.execute({}, { discard: true })
        yield* pollUntil(workflow, executionId, "Suspended")
        const run = driver.journal.find((message) => message._tag === "Request" && message.tag === "run")!
        runRequestId = Snowflake.Snowflake(run.requestId)
        const complete = (deferred: typeof first, value: string) =>
          DurableDeferred.succeed(deferred, {
            token: DurableDeferred.tokenFromExecutionId(deferred, { workflow, executionId }),
            value
          })
        const firstFiber = yield* complete(first, "first").pipe(Effect.forkChild({ startImmediately: true }))
        yield* advanceUntil(() => firstReset.isOpen(), "first wake must reach reset")
        yield* complete(second, "second")
        assert.deepStrictEqual(
          yield* pollUntil(workflow, executionId, "Complete"),
          new Workflow.Complete({ exit: Exit.succeed("first/second") })
        )
        yield* allowStaleReset.open
        yield* advanceUntil(() => staleResetFinished.isOpen(), "stale reset must finish")
        assert.deepStrictEqual(
          yield* workflow.poll(executionId),
          Option.some(new Workflow.Complete({ exit: Exit.succeed("first/second") }))
        )
        yield* allowPoll.open
        yield* Fiber.join(firstFiber)
      }).pipe(Effect.provide(context))
    }), 30_000)

  for (const entityMailboxCapacity of [2, 3]) {
    it.effect(
      `admits a required completion after an unrelated completion with mailbox capacity ${entityMailboxCapacity}`,
      () =>
        Effect.gen(function*() {
          const unrelatedRead = yield* Latch.make()
          const required = DurableDeferred.make("MailboxProgress/Required", { success: Schema.String })
          const unrelated = DurableDeferred.make("MailboxProgress/Unrelated", { success: Schema.String })
          const workflow = Workflow.make("MailboxProgress", {
            payload: {},
            success: Schema.String,
            idempotencyKey: () => "one"
          })
          let instance: WorkflowInstance["Service"] | undefined
          let runRequestId: Snowflake.Snowflake | undefined
          const shared = yield* Layer.build(
            MessageStorage.layerMemory.pipe(Layer.provide(ShardingConfig.layerDefaults))
          )
          const storage = Context.get(shared, MessageStorage.MessageStorage)
          const driver = Context.get(shared, MessageStorage.MemoryDriver)
          const storageLayer = Layer.succeed(MessageStorage.MessageStorage, {
            ...storage,
            repliesForUnfiltered: (requestIds) => {
              const ids = Array.from(requestIds)
              return storage.repliesForUnfiltered(ids).pipe(
                Effect.tap(() =>
                  runRequestId !== undefined && ids.includes(runRequestId) ? unrelatedRead.open : Effect.void
                )
              )
            }
          })
          const context = yield* Layer.build(
            workflow.toLayer(() =>
              Effect.gen(function*() {
                instance = yield* WorkflowInstance
                return yield* DurableDeferred.raceAll({
                  name: "mailbox-progress",
                  success: Schema.String,
                  error: Schema.Never,
                  // Keep the run active without allocating an activity RPC/mailbox slot.
                  effects: [DurableDeferred.await(required), Effect.never]
                })
              })
            ).pipe(Layer.provideMerge(makeTestWorkflowEngine({ storageLayer, config: { entityMailboxCapacity } })))
          )
          yield* Effect.gen(function*() {
            const sharding = yield* Sharding.Sharding
            const executionId = yield* workflow.execute({}, { discard: true })
            yield* advanceUntil(
              () => instance?.awaitedDeferreds.has(required.name) === true,
              "run must await the required deferred"
            )
            assert.isFalse(instance!.awaitedDeferreds.has(unrelated.name))
            const run = driver.journal.find((message) => message._tag === "Request" && message.tag === "run")!
            runRequestId = Snowflake.Snowflake(run.requestId)
            yield* DurableDeferred.succeed(unrelated, {
              token: DurableDeferred.tokenFromExecutionId(unrelated, { workflow, executionId }),
              value: "unrelated"
            })
            // Both implementations read the active run before replying or parking.
            // Wait for that read before admitting the completion needed for progress.
            yield* advanceUntil(() => unrelatedRead.isOpen(), "unrelated completion must inspect the active run")
            yield* DurableDeferred.succeed(required, {
              token: DurableDeferred.tokenFromExecutionId(required, { workflow, executionId }),
              value: "signal"
            })
            let result = yield* workflow.poll(executionId)
            for (let i = 0; i < 100 && !(Option.isSome(result) && result.value._tag === "Complete"); i++) {
              yield* TestClock.adjust(100)
              yield* sharding.pollStorage
              result = yield* workflow.poll(executionId)
            }
            const pendingDeferreds = Array.from(driver.requests.values()).filter((entry) =>
              entry.envelope._tag === "Request" && entry.envelope.tag === "deferred" && entry.replies.length === 0
            ).map((entry) => (entry.envelope as { payload: { name: string } }).payload.name)
            assert.deepStrictEqual(
              result,
              Option.some(new Workflow.Complete({ exit: Exit.succeed("signal") })),
              `required completion must progress; pending deferreds: ${pendingDeferreds.join(", ")}`
            )
          }).pipe(Effect.provide(context))
        }),
      20_000
    )
  }

  it.effect("retains a handover completion before its deferred reply is persisted", () =>
    Effect.gen(function*() {
      const gate = DurableDeferred.make("DeferredHandover/Gate", { success: Schema.String })
      const workflow = Workflow.make("DeferredHandover", {
        payload: {},
        success: Schema.String,
        idempotencyKey: () => "one"
      })
      const shared = yield* Layer.build(
        MessageStorage.layerMemory.pipe(Layer.provide(ShardingConfig.layerDefaults))
      )
      const storage = Context.get(shared, MessageStorage.MessageStorage)
      const layer = workflow.toLayer(() => DurableDeferred.await(gate)).pipe(
        Layer.provideMerge(makeTestWorkflowEngine({
          storageLayer: Layer.succeed(MessageStorage.MessageStorage, {
            ...storage,
            saveReply: (reply) =>
              reply.rpc._tag === "deferred"
                ? Effect.sleep(100).pipe(Effect.andThen(storage.saveReply(reply)))
                : storage.saveReply(reply)
          })
        }))
      )
      // Each owner has a fresh engine over the same durable storage.
      const withOwner = <A, E>(body: Effect.Effect<A, E, Layer.Success<typeof layer>>) =>
        Effect.scoped(Effect.gen(function*() {
          const context = yield* Layer.build(layer)
          return yield* Effect.provide(body, context)
        }))
      const executionId = yield* withOwner(Effect.gen(function*() {
        const id = yield* workflow.execute({}, { discard: true })
        yield* pollUntil(workflow, id, "Suspended")
        return id
      }))
      const result = yield* withOwner(Effect.gen(function*() {
        yield* DurableDeferred.succeed(gate, {
          token: DurableDeferred.tokenFromExecutionId(gate, { workflow, executionId }),
          value: "signal"
        })
        // Complete before the 5-second storage retry can hide a lost wake-up.
        const result = yield* pollUntil(workflow, executionId, "Complete")
        yield* TestClock.adjust(1000)
        return result
      }))
      assert.deepStrictEqual(result, new Workflow.Complete({ exit: Exit.succeed("signal") }))
    }), 30_000)

  for (const lifecycle of ["defect rebuild", "overlapping activations"] as const) {
    it.effect(`completes before deferred persistence across ${lifecycle}`, () =>
      Effect.gen(function*() {
        const saving = yield* Latch.make()
        const allowSave = yield* Latch.make()
        const rebuilt = yield* Latch.make()
        const allowRun = yield* Latch.make()
        const allowDefect = yield* Latch.make()
        const closing = yield* Latch.make()
        const allowClose = yield* Latch.make()
        const closed = yield* Latch.make()
        const allowRedelivery = yield* Latch.make()
        let persisted = false
        let builds = 0
        let firstBuildRuns = 0
        let deferredDeliveries = 0
        const activations: Array<Scope.Scope> = []
        const gate = DurableDeferred.make("BehaviouralLifecycle/Gate", { success: Schema.String })
        const workflow = Workflow.make("BehaviouralLifecycle", {
          payload: {},
          success: Schema.String,
          idempotencyKey: () => "one"
        })
        const shardingLayer = Layer.effect(
          Sharding.Sharding,
          Effect.map(Sharding.Sharding, (sharding) => ({
            ...sharding,
            registerEntity: (entity, handlers, options) =>
              sharding.registerEntity(
                entity,
                Effect.gen(function*() {
                  if (entity.type !== `Workflow/${workflow._tag}`) return yield* handlers
                  const build = ++builds
                  const activationOption = yield* Effect.serviceOption(CurrentActivationScope)
                  assert(Option.isSome(activationOption), "the entity manager must provide its activation")
                  const activation = activationOption.value
                  activations.push(activation)
                  assert.notStrictEqual(activation, yield* Effect.scope, "handler and activation scopes must differ")
                  // Registered before the production handlers, this marks the end of activation cleanup.
                  if (build === 1) yield* Scope.addFinalizer(activation, closed.open)
                  const built = yield* handlers
                  if (build === 1 && lifecycle === "overlapping activations") {
                    // Pause the retiring activation before its production cleanup. Its replacement
                    // records the completion first, then the old activation finishes closing.
                    yield* Scope.addFinalizer(activation, closing.open.pipe(Effect.andThen(allowClose.await)))
                  }
                  if (build === 2) yield* rebuilt.open
                  const { deferred, run } = built as unknown as {
                    run: (request: Entity.Request<any>) => Effect.Effect<any, any, any>
                    deferred: (request: Entity.Request<any>) => Effect.Effect<any, any, any>
                  }
                  return {
                    ...built,
                    run: (request: Entity.Request<any>) =>
                      Effect.suspend(() => {
                        if (build === 1 && ++firstBuildRuns === 2 && lifecycle === "defect rebuild") {
                          // Defect outside Workflow.intoResult to rebuild the real RPC server.
                          return saving.await.pipe(
                            Effect.andThen(allowDefect.await),
                            Effect.andThen(Effect.die("injected entity defect"))
                          )
                        }
                        return build === 2 ? allowRun.await.pipe(Effect.andThen(run(request))) : run(request)
                      }),
                    deferred: (request: Entity.Request<any>) =>
                      Effect.suspend(() => {
                        // A replayed completion must not repair a cache loss before the assertion.
                        if (++deferredDeliveries > 1) {
                          return allowRedelivery.await.pipe(Effect.andThen(deferred(request)))
                        }
                        return deferred(request)
                      })
                  }
                }),
                options
              )
          }))
        ).pipe(Layer.provide(Sharding.layer))
        const storageLayer = Layer.effect(
          MessageStorage.MessageStorage,
          Effect.map(
            MessageStorage.MessageStorage,
            (storage) => ({
              ...storage,
              saveReply: (reply) =>
                reply.rpc._tag === "deferred"
                  ? saving.open.pipe(
                    Effect.andThen(allowSave.await),
                    Effect.interruptible,
                    Effect.andThen(storage.saveReply(reply)),
                    Effect.tap(() =>
                      Effect.sync(() => {
                        persisted = true
                      })
                    )
                  )
                  : storage.saveReply(reply)
            })
          )
        ).pipe(Layer.provide(MessageStorage.layerMemory))
        const context = yield* Layer.build(
          workflow.toLayer(() => DurableDeferred.await(gate)).pipe(
            Layer.provideMerge(makeTestWorkflowEngine({ shardingLayer, storageLayer }))
          )
        )
        yield* Effect.addFinalizer(() =>
          Effect.all([
            allowSave.open,
            allowRun.open,
            allowDefect.open,
            allowClose.open,
            allowRedelivery.open
          ], { discard: true })
        )
        yield* Effect.gen(function*() {
          const executionId = yield* workflow.execute({}, { discard: true })
          yield* pollUntil(workflow, executionId, "Suspended")
          if (lifecycle === "overlapping activations") {
            yield* advanceUntil(() => closing.isOpen(), "old activation must start closing", 5000, 12)
            assert.strictEqual(builds, 1)
          }
          yield* DurableDeferred.succeed(gate, {
            token: DurableDeferred.tokenFromExecutionId(gate, { workflow, executionId }),
            value: "signal"
          })
          yield* advanceUntil(() => saving.isOpen(), "deferred persistence must start")
          yield* allowDefect.open
          yield* advanceUntil(() => rebuilt.isOpen(), "replacement handlers must be built")
          assert.strictEqual(builds, 2)
          if (lifecycle === "defect rebuild") {
            assert.strictEqual(activations[0], activations[1], "rebuild must retain activation identity")
            assert.isFalse(closed.isOpen(), "a handler rebuild must not close its activation")
          } else {
            assert.notStrictEqual(activations[0], activations[1], "replacement must have its own activation")
            yield* allowClose.open
            yield* advanceUntil(() => closed.isOpen(), "old activation cleanup must finish")
          }
          yield* allowRun.open
          const result = yield* pollUntil(workflow, executionId, "Complete")
          assert.deepStrictEqual(result, new Workflow.Complete({ exit: Exit.succeed("signal") }))
          assert.isFalse(allowSave.isOpen(), "workflow must complete while persistence remains gated")
          assert.isFalse(persisted, "no deferred reply may be durable before workflow completion")
          assert.isFalse(allowRedelivery.isOpen(), "redelivery must not repair a lost completion")
        }).pipe(Effect.provide(context))
      }), 30_000)
  }

  it.effect("executes, resumes, deduplicates, and polls a suspended workflow", () =>
    Effect.gen(function*() {
      const sharding = yield* Sharding.Sharding
      const driver = yield* MessageStorage.MemoryDriver
      const flags = yield* Flags

      const fiber = yield* EmailWorkflow.execute({
        id: "test-email-1",
        to: "bob@example.com"
      }).pipe(Effect.forkChild({ startImmediately: true }))

      // resume after the clock
      yield* TestClock.adjust("10 seconds")
      yield* sharding.pollStorage
      yield* TestClock.adjust(5000)
      // The storage poll may return before the resumed run finishes unwinding.
      yield* advanceUntil(() => flags.get("ensuring") === true, "suspended await must run ensuring")

      // --- the workflow is suspended at this point

      // - 1 initial request
      // - 5 attempts to send email
      // - 1 sleep activity
      // - 1 durable clock run
      // - 1 durable clock deferred set
      expect(driver.requests.size).toEqual(9)
      const executionId = driver.journal[0].address.entityId

      // normal finalizer should run even after suspension
      expect(flags.get("finalizer")).toBeTruthy()
      // but not compensation
      expect(flags.get("compensation")).toBeFalsy()
      // ensuring will run
      expect(flags.get("ensuring")).toBeTruthy()
      expect(flags.get("catchCause")).toBeFalsy()

      // --- resume the workflow using DurableDeferred.done

      const token = yield* DurableDeferred.token(EmailTrigger).pipe(
        Effect.provideService(WorkflowInstance, WorkflowInstance.initial(EmailWorkflow, executionId))
      )
      yield* DurableDeferred.done(EmailTrigger, {
        token,
        exit: Exit.succeed("done")
      })
      yield* sharding.pollStorage

      // - 1 DurableDeferred set
      expect(driver.requests.size).toEqual(10)

      // allow suspend polling to complete
      yield* TestClock.adjust(10000)
      expect(yield* Fiber.join(fiber)).toBeUndefined()

      // --- the workflow is complete

      // ensuring will run
      expect(flags.get("ensuring")).toBeTruthy()
      expect(flags.get("catchCause")).toBeFalsy()

      // test deduplication
      yield* EmailWorkflow.execute({
        id: "test-email-1",
        to: "bob@example.com"
      })
      expect(driver.requests.size).toEqual(10)

      // test poll
      expect(yield* EmailWorkflow.poll(executionId)).toEqual(Option.some(new Workflow.Complete({ exit: Exit.void })))
    }).pipe(Effect.provide(TestWorkflowLayer)))

  it.effect("interrupts a suspended workflow and runs compensation", () =>
    Effect.gen(function*() {
      const sharding = yield* Sharding.Sharding
      const driver = yield* MessageStorage.MemoryDriver
      yield* TestClock.adjust(1)

      const fiber = yield* EmailWorkflow.execute({
        id: "test-email-2",
        to: "bob@example.com"
      }).pipe(Effect.forkChild)

      yield* TestClock.adjust(1)
      yield* TestClock.adjust("10 seconds")
      yield* sharding.pollStorage
      yield* TestClock.adjust(1)

      const envelope = driver.journal[0]
      const executionId = envelope.address.entityId
      // Interrupt after the clock-backed activity completes, so the workflow is
      // suspended on EmailTrigger rather than racing the clock's completion.
      yield* advanceUntil(
        () =>
          Array.from(driver.requests.values()).some(({ envelope, replies }) =>
            envelope._tag === "Request" && envelope.tag === "activity" &&
            envelope.address.entityId === executionId &&
            (envelope.payload as { name: string }).name === "Sleep" &&
            replies.some((reply) =>
              reply._tag === "WithExit" && reply.exit._tag === "Success" &&
              (reply.exit.value as Workflow.ResultEncoded<any, any>)._tag === "Complete"
            )
          ),
        "sleep activity must complete before interruption",
        10
      )
      yield* pollUntil(EmailWorkflow, executionId, "Suspended")
      yield* EmailWorkflow.interrupt(executionId)

      // Wait for this execution's signal; concurrent cleanup can change the total request count.
      yield* advanceUntil(
        () =>
          Array.from(driver.requests.values()).some(({ envelope }) =>
            envelope._tag === "Request" && envelope.tag === "deferred" &&
            envelope.address.entityId === executionId &&
            envelope.address.entityType === `Workflow/${EmailWorkflow._tag}` &&
            (envelope.payload as { name: string }).name === "Workflow/InterruptSignal"
          ),
        "interrupt signal request must be persisted"
      )
      yield* pollUntil(EmailWorkflow, executionId, "Complete")
      // - clock cleared
      expect(driver.requests.size).toEqual(9)

      const result = driver.requests.get(envelope.requestId)!
      const reply = result.replies[0]!
      assert(
        reply._tag === "WithExit" &&
          reply.exit._tag === "Success"
      )
      const value = reply.exit.value as Workflow.ResultEncoded<any, any>
      assert(value._tag === "Complete" && value.exit._tag === "Failure")

      yield* advanceUntil(() => fiber.pollUnsafe() !== undefined, "execute waiter must observe interruption", 10)
      const exit = yield* Fiber.await(fiber)
      assert(Exit.hasInterrupts(exit))

      const flags = yield* Flags
      assert.isTrue(flags.get("compensation"))
    }).pipe(
      Effect.provide(TestWorkflowLayer)
    ))

  it.effect("Workflow.withCompensation runs compensation when the workflow fails", () =>
    Effect.gen(function*() {
      yield* TestClock.adjust(1)

      const fiber = yield* EmailWorkflow.execute({
        id: "test-email-3",
        to: "compensation"
      }).pipe(Effect.forkChild({ startImmediately: true }))

      yield* pollUntil(
        EmailWorkflow,
        yield* EmailWorkflow.executionId({ id: "test-email-3", to: "compensation" }),
        "Complete"
      )

      const error = yield* Fiber.join(fiber).pipe(
        Effect.flip
      )
      expect(error).toBeInstanceOf(SendEmailError)
      const flags = yield* Flags
      assert.isTrue(flags.get("compensation"))
    }).pipe(
      Effect.provide(TestWorkflowLayer)
    ))

  it.effect("Activity.raceAll returns the first activity and interrupts losers", () =>
    Effect.gen(function*() {
      const flags = yield* Flags
      yield* TestClock.adjust(1)

      const fiber = yield* RaceWorkflow.execute({
        id: "race-1"
      }).pipe(Effect.forkChild({ startImmediately: true }))

      // Activity timers may be registered after the caller's first clock advance.
      yield* pollUntil(RaceWorkflow, yield* RaceWorkflow.executionId({ id: "race-1" }), "Complete")

      const result = yield* Fiber.join(fiber)
      expect(result).toEqual("Activity3")

      expect(flags.get("interrupt1")).toBeTruthy()
      expect(flags.get("interrupt2")).toBeTruthy()
      expect(flags.get("interrupt3")).toBeFalsy()
    }).pipe(Effect.provide(TestWorkflowLayer)))

  it.effect("Activity.raceAll ignores a failure when another activity can succeed", () =>
    Effect.gen(function*() {
      const fiber = yield* FailureRaceWorkflow.execute({
        id: "failure-race"
      }).pipe(Effect.forkChild({ startImmediately: true }))

      yield* pollUntil(FailureRaceWorkflow, yield* FailureRaceWorkflow.executionId({ id: "failure-race" }), "Complete")

      expect(yield* Fiber.join(fiber)).toEqual("slow")
    }).pipe(Effect.provide(TestWorkflowLayer)))

  it.effect("Activity.raceAll replays the first durable activity", () =>
    Effect.gen(function*() {
      const flags = yield* Flags
      const sharding = yield* Sharding.Sharding
      yield* TestClock.adjust(1)

      const fiber = yield* DurableRaceWorkflow.execute({
        id: "race-2"
      }).pipe(Effect.forkChild)

      yield* TestClock.adjust(1)
      yield* TestClock.adjust(1000)
      yield* sharding.pollStorage
      yield* TestClock.adjust(5000)

      const token = flags.get("durable-race-token")
      assert(typeof token === "string")
      yield* DurableDeferred.done(DurableRaceGate, {
        token: DurableDeferred.Token.make(token),
        exit: Exit.void
      })
      yield* sharding.pollStorage
      yield* TestClock.adjust(5000)

      const result = yield* Fiber.join(fiber)
      expect(result).toEqual("Activity3")
    }).pipe(Effect.provide(TestWorkflowLayer)))

  it.effect("DurableDeferred.raceAll lets a deferred win while another branch is active", () =>
    Effect.gen(function*() {
      const sharding = yield* Sharding.Sharding
      const executionId = yield* MixedRaceWorkflow.executionId({ id: "mixed-race" })
      const fiber = yield* MixedRaceWorkflow.execute({ id: "mixed-race" }).pipe(
        Effect.forkChild({ startImmediately: true })
      )

      yield* TestClock.adjust(1)
      const token = DurableDeferred.tokenFromExecutionId(MixedRaceGate, {
        workflow: MixedRaceWorkflow,
        executionId
      })
      yield* DurableDeferred.succeed(MixedRaceGate, { token, value: "signal" })
      yield* sharding.pollStorage
      yield* TestClock.adjust("1 second")

      expect(yield* Fiber.join(fiber)).toEqual("signal")
    }).pipe(Effect.provide(TestWorkflowLayer)), 20_000)

  it.effect(
    "DurableDeferred.raceAll lets an active branch win while the deferred stays pending",
    () =>
      Effect.gen(function*() {
        const fiber = yield* MixedRaceWorkflow.execute({ id: "mixed-race-activity" }).pipe(
          Effect.forkChild({ startImmediately: true })
        )

        for (let i = 0; i < 4; i++) {
          yield* TestClock.adjust("1 second")
        }

        expect(yield* Fiber.join(fiber)).toEqual("activity")
      }).pipe(Effect.provide(TestWorkflowLayer)),
    20_000
  )

  it.effect(
    "DurableDeferred.raceAll replays the run when a losing deferred completes late",
    () =>
      Effect.gen(function*() {
        const flags = yield* Flags
        const sharding = yield* Sharding.Sharding
        const executionId = yield* LosingDeferredWorkflow.executionId({ id: "losing-deferred" })
        const fiber = yield* LosingDeferredWorkflow.execute({ id: "losing-deferred" }).pipe(
          Effect.forkChild({ startImmediately: true })
        )

        yield* TestClock.adjust(1)
        yield* TestClock.adjust("1 second")
        while (flags.get("losing-deferred-tail-runs") !== 1) {
          yield* TestClock.adjust("1 second")
        }

        const token = DurableDeferred.tokenFromExecutionId(LosingDeferredGate, {
          workflow: LosingDeferredWorkflow,
          executionId
        })
        yield* DurableDeferred.succeed(LosingDeferredGate, { token, value: "signal" })
        for (let i = 0; i < 4; i++) {
          yield* sharding.pollStorage
          yield* TestClock.adjust("10 seconds")
        }

        expect(yield* Fiber.join(fiber)).toEqual("activity:tail")
        // The late completion preempts the tail; the replay re-executes it.
        expect(flags.get("losing-deferred-tail-runs")).toEqual(2)
      }).pipe(Effect.provide(TestWorkflowLayer)),
    20_000
  )

  it.effect("DurableDeferred.raceAll wakes the active run by replaying it", () =>
    Effect.gen(function*() {
      const flags = yield* Flags
      const sharding = yield* Sharding.Sharding
      const executionId = yield* InPlaceWakeWorkflow.executionId({ id: "in-place-wake" })
      const fiber = yield* InPlaceWakeWorkflow.execute({ id: "in-place-wake" }).pipe(
        Effect.forkChild({ startImmediately: true })
      )

      yield* TestClock.adjust(1)
      const token = DurableDeferred.tokenFromExecutionId(InPlaceWakeGate, {
        workflow: InPlaceWakeWorkflow,
        executionId
      })
      yield* DurableDeferred.succeed(InPlaceWakeGate, { token, value: "signal" })
      yield* sharding.pollStorage
      yield* TestClock.adjust("1 second")

      expect(yield* Fiber.join(fiber)).toEqual("signal")
      // Usually the completion preempts the parked run (2 runs); under load
      // it can land before the branch parks and is read directly (1 run).
      assert([1, 2].includes(flags.get("in-place-wake-runs") as number))
    }).pipe(Effect.provide(TestWorkflowLayer)), 20_000)

  it.effect("DurableDeferred.raceAll wakes a branch wrapped in DurableDeferred.into", () =>
    Effect.gen(function*() {
      const sharding = yield* Sharding.Sharding
      const executionId = yield* IntoWrapWorkflow.executionId({ id: "into-wrap" })
      const fiber = yield* IntoWrapWorkflow.execute({ id: "into-wrap" }).pipe(
        Effect.forkChild({ startImmediately: true })
      )

      yield* TestClock.adjust(1)
      const token = DurableDeferred.tokenFromExecutionId(IntoWrapGate, {
        workflow: IntoWrapWorkflow,
        executionId
      })
      yield* DurableDeferred.succeed(IntoWrapGate, { token, value: "signal" })
      yield* sharding.pollStorage
      yield* TestClock.adjust("1 second")

      expect(yield* Fiber.join(fiber)).toEqual("signal")
    }).pipe(Effect.provide(TestWorkflowLayer)), 20_000)

  it.effect(
    "DurableDeferred.raceAll does not preempt for deferreds awaited inside activity bodies",
    () =>
      Effect.gen(function*() {
        const sharding = yield* Sharding.Sharding
        const fiber = yield* ClockCaptureWorkflow.execute({ id: "clock-capture" }).pipe(
          Effect.forkChild({ startImmediately: true })
        )

        // Only workflow-level awaits preempt; the clock inside the activity
        // does not, so the other branch wins.
        yield* TestClock.adjust(1)
        yield* TestClock.adjust(5000)
        yield* sharding.pollStorage
        yield* TestClock.adjust(1000)
        yield* TestClock.adjust("60 seconds")

        expect(yield* Fiber.join(fiber)).toEqual("slow")
      }).pipe(Effect.provide(TestWorkflowLayer)),
    20_000
  )

  it.effect(
    "DurableDeferred.raceAll lets a bare durable clock branch win while another branch is active",
    () =>
      Effect.gen(function*() {
        const sharding = yield* Sharding.Sharding
        const fiber = yield* BareClockWorkflow.execute({ id: "bare-clock" }).pipe(
          Effect.forkChild({ startImmediately: true })
        )

        yield* TestClock.adjust(1)
        for (let i = 0; i < 8; i++) {
          yield* sharding.pollStorage
          yield* TestClock.adjust("5 seconds")
        }

        expect(yield* Fiber.join(fiber)).toEqual("clock")
      }).pipe(Effect.provide(TestWorkflowLayer)),
    20_000
  )

  it.effect("DurableDeferred.raceAll runs a branch's transformations on a deferred wake", () =>
    Effect.gen(function*() {
      const sharding = yield* Sharding.Sharding
      const executionId = yield* MappedGateWorkflow.executionId({ id: "mapped-gate" })
      const fiber = yield* MappedGateWorkflow.execute({ id: "mapped-gate" }).pipe(
        Effect.forkChild({ startImmediately: true })
      )

      yield* TestClock.adjust(1)
      const token = DurableDeferred.tokenFromExecutionId(MappedGate, {
        workflow: MappedGateWorkflow,
        executionId
      })
      yield* DurableDeferred.succeed(MappedGate, { token, value: "signal" })
      yield* sharding.pollStorage
      yield* TestClock.adjust("1 second")

      expect(yield* Fiber.join(fiber)).toEqual("signal!")
    }).pipe(Effect.provide(TestWorkflowLayer)), 20_000)

  it.effect(
    "DurableDeferred.raceAll wakes a branch that ran an activity before its await",
    () =>
      Effect.gen(function*() {
        const sharding = yield* Sharding.Sharding
        const executionId = yield* PreGateWorkflow.executionId({ id: "pre-gate" })
        const fiber = yield* PreGateWorkflow.execute({ id: "pre-gate" }).pipe(
          Effect.forkChild({ startImmediately: true })
        )

        yield* TestClock.adjust(1)
        yield* TestClock.adjust(1)
        const token = DurableDeferred.tokenFromExecutionId(PreGate, {
          workflow: PreGateWorkflow,
          executionId
        })
        yield* DurableDeferred.succeed(PreGate, { token, value: "signal" })
        yield* sharding.pollStorage
        yield* TestClock.adjust("1 second")

        expect(yield* Fiber.join(fiber)).toEqual("act:signal")
      }).pipe(Effect.provide(TestWorkflowLayer)),
    20_000
  )

  it.effect("DurableDeferred.raceAll re-runs a multi-await branch once per completion", () =>
    Effect.gen(function*() {
      const flags = yield* Flags
      const branchControl = yield* TwoStepBranchControl
      const sharding = yield* Sharding.Sharding
      const executionId = yield* TwoStepWorkflow.executionId({ id: "two-step" })
      const fiber = yield* TwoStepWorkflow.execute({ id: "two-step" }).pipe(
        Effect.forkChild({ startImmediately: true })
      )

      yield* branchControl.entered.await
      const tokenA = DurableDeferred.tokenFromExecutionId(TwoStepGateA, {
        workflow: TwoStepWorkflow,
        executionId
      })
      yield* DurableDeferred.succeed(TwoStepGateA, { token: tokenA, value: "a" })
      yield* sharding.pollStorage
      yield* TestClock.adjust("1 second")
      yield* branchControl.release.open
      yield* branchControl.started.await

      // The run parks on the second gate after reading the first completion
      // directly or replaying once while the completion is committed.
      assert([1, 2].includes(flags.get("two-step-branch-runs") as number))

      const tokenB = DurableDeferred.tokenFromExecutionId(TwoStepGateB, {
        workflow: TwoStepWorkflow,
        executionId
      })
      yield* DurableDeferred.succeed(TwoStepGateB, { token: tokenB, value: "b" })
      yield* sharding.pollStorage
      yield* TestClock.adjust("1 second")

      expect(yield* Fiber.join(fiber)).toEqual("a:b")
      assert([2, 3].includes(flags.get("two-step-branch-runs") as number))
    }).pipe(Effect.provide(TestWorkflowLayer)), 20_000)

  it.effect(
    "DurableDeferred resumes a discarded execution when completion precedes the suspension commit",
    () =>
      Effect.gen(function*() {
        const savingRun = yield* Latch.make()
        const releaseRun = yield* Latch.make()
        const readBeforeCommit = yield* Latch.make()
        const savedDeferred = yield* Latch.make()
        let runRequestId: Snowflake.Snowflake | undefined
        const gate = DurableDeferred.make("DiscardedSuspension/Gate", { success: Schema.String })
        const workflow = Workflow.make("DiscardedSuspension", {
          payload: {},
          success: Schema.String,
          idempotencyKey: () => "one"
        })
        const storageLayer = Layer.effect(
          MessageStorage.MessageStorage,
          Effect.map(MessageStorage.MessageStorage, (storage) => ({
            ...storage,
            saveReply: (reply) => {
              if (reply.rpc._tag === "run" && !savingRun.isOpen()) {
                runRequestId = reply.reply.requestId
                assert(reply.reply._tag === "WithExit" && reply.reply.exit._tag === "Success")
                assert(Schema.is(Workflow.Suspended)(reply.reply.exit.value))
                return savingRun.open.pipe(
                  Effect.andThen(releaseRun.await),
                  Effect.andThen(storage.saveReply(reply))
                )
              }
              return storage.saveReply(reply).pipe(
                Effect.tap(() => reply.rpc._tag === "deferred" ? savedDeferred.open : Effect.void)
              )
            },
            repliesForUnfiltered: (requestIds) => {
              const ids = Array.from(requestIds)
              return storage.repliesForUnfiltered(ids).pipe(
                Effect.tap((replies) => {
                  if (!releaseRun.isOpen() && runRequestId !== undefined && ids.includes(runRequestId)) {
                    assert.deepStrictEqual(replies, [])
                    return readBeforeCommit.open
                  }
                  return Effect.void
                })
              )
            }
          }))
        ).pipe(Layer.provide(MessageStorage.layerMemory))
        const context = yield* Layer.build(
          workflow.toLayer(() => DurableDeferred.await(gate)).pipe(
            Layer.provideMerge(makeTestWorkflowEngine({ storageLayer }))
          )
        )
        yield* Effect.addFinalizer(() => releaseRun.open)
        yield* Effect.gen(function*() {
          // No execute waiter may retry a Suspended reply and repair the lost wake-up.
          const executionId = yield* workflow.execute({}, { discard: true })
          yield* advanceUntil(() => savingRun.isOpen(), "run must reach suspension persistence")
          yield* DurableDeferred.succeed(gate, {
            token: DurableDeferred.tokenFromExecutionId(gate, { workflow, executionId }),
            value: "signal"
          })
          // Both resume and waitForRunReply read storage. Hold the commit until
          // that read observes no reply, allowing a fixed handler to park on it.
          yield* advanceUntil(() => readBeforeCommit.isOpen(), "completion must read the uncommitted run")
          yield* releaseRun.open
          yield* advanceUntil(() => savedDeferred.isOpen(), "deferred completion must be persisted")
          const result = yield* pollUntil(workflow, executionId, "Complete")
          assert.deepStrictEqual(result, new Workflow.Complete({ exit: Exit.succeed("signal") }))
        }).pipe(Effect.provide(context))
      }),
    20_000
  )

  it.effect(
    "DurableDeferred.raceAll delivers a completion that lands while a suspension commits",
    () =>
      Effect.gen(function*() {
        const flags = yield* Flags
        const sharding = yield* Sharding.Sharding
        const executionId = yield* SlowUnwindWorkflow.executionId({ id: "slow-unwind" })
        const fiber = yield* SlowUnwindWorkflow.execute({ id: "slow-unwind" }).pipe(
          Effect.forkChild({ startImmediately: true })
        )

        // Wait until both branches have parked and the ensuring sleep has
        // started, so the completion deterministically lands during unwind.
        while (flags.get("slow-unwind-started") !== true) {
          yield* Effect.yieldNow
        }

        const token = DurableDeferred.tokenFromExecutionId(SlowUnwindGateB, {
          workflow: SlowUnwindWorkflow,
          executionId
        })
        yield* DurableDeferred.succeed(SlowUnwindGateB, { token, value: "signal-b" })
        // Finish the unwind, then the replay and its own ensuring sleep.
        for (let i = 0; i < 4; i++) {
          yield* TestClock.adjust("10 seconds")
          yield* sharding.pollStorage
        }

        expect(yield* Fiber.join(fiber)).toEqual("signal-b")
        expect(flags.get("slow-unwind-runs")).toEqual(2)
      }).pipe(Effect.provide(TestWorkflowLayer)),
    20_000
  )

  it.effect(
    "DurableDeferred.raceAll suspends when every branch is pending and resumes with the winner",
    () =>
      Effect.gen(function*() {
        const sharding = yield* Sharding.Sharding
        const executionId = yield* TwoGateWorkflow.executionId({ id: "two-gates" })
        const fiber = yield* TwoGateWorkflow.execute({ id: "two-gates" }).pipe(
          Effect.forkChild({ startImmediately: true })
        )

        // Wait for the race to suspend with both gates pending.
        yield* TestClock.adjust(1)
        let polled = yield* TwoGateWorkflow.poll(executionId)
        while (Option.isNone(polled) || polled.value._tag !== "Suspended") {
          yield* Effect.yieldNow
          polled = yield* TwoGateWorkflow.poll(executionId)
        }

        const token = DurableDeferred.tokenFromExecutionId(TwoGateB, {
          workflow: TwoGateWorkflow,
          executionId
        })
        yield* DurableDeferred.succeed(TwoGateB, { token, value: "signal-b" })
        yield* sharding.pollStorage
        yield* TestClock.adjust("5 seconds")

        expect(yield* Fiber.join(fiber)).toEqual("signal-b")
      }).pipe(Effect.provide(TestWorkflowLayer)),
    20_000
  )

  it.effect("nested workflows", () =>
    Effect.gen(function*() {
      const flags = yield* Flags
      const sharding = yield* Sharding.Sharding
      yield* TestClock.adjust(1)

      yield* ParentWorkflow.execute({
        id: "123"
      }).pipe(Effect.forkChild)
      yield* TestClock.adjust(1000)
      while (flags.get("parent-suspended") === undefined) {
        yield* Effect.yieldNow
      }

      assert.isUndefined(flags.get("parent-end"))
      assert.isUndefined(flags.get("child-end"))
      assert.isTrue(flags.get("parent-suspended"))
      const token = flags.get("child-token")
      assert(typeof token === "string")

      yield* DurableDeferred.done(ChildDeferred, {
        token: DurableDeferred.Token.make(token),
        exit: Exit.void
      })
      yield* TestClock.adjust(5000)
      yield* sharding.pollStorage
      assert.isTrue(flags.get("parent-end"))
      assert.isTrue(flags.get("child-end"))
    }).pipe(Effect.provide(TestWorkflowLayer)))

  it.effect("bounds a durable clock notification when its workflow is absent after restart", () =>
    Effect.gen(function*() {
      const clockDuration = 3000
      const registrationTimeout = 5000
      const RemovedWorkflow = Workflow.make("RemovedWorkflow", {
        payload: {},
        success: Schema.Void,
        idempotencyKey: () => "one"
      })
      const shared = yield* Layer.build(
        MessageStorage.layerMemory.pipe(Layer.provide(ShardingConfig.layerDefaults))
      )
      const driver = Context.get(shared, MessageStorage.MemoryDriver)
      const storageLayer = Layer.succeed(
        MessageStorage.MessageStorage,
        Context.get(shared, MessageStorage.MessageStorage)
      )
      const config = { entityRegistrationTimeout: registrationTimeout }
      const clock = DurableClock.make({ name: "wait", duration: clockDuration })

      const executionId = yield* Effect.gen(function*() {
        const executionId = yield* RemovedWorkflow.execute({}, { discard: true })
        yield* pollUntil(RemovedWorkflow, executionId, "Suspended")
        return executionId
      }).pipe(Effect.provide(
        RemovedWorkflow.toLayer(() =>
          DurableClock.sleep({ name: "wait", duration: clockDuration, inMemoryThreshold: Duration.zero })
        ).pipe(Layer.provideMerge(makeTestWorkflowEngine({ storageLayer, config })))
      ))
      const clockRequest = driver.journal.find((message) =>
        message._tag === "Request" && message.address.entityType === "Workflow/-/DurableClock"
      )
      assert(clockRequest !== undefined && clockRequest._tag === "Request")

      yield* Effect.gen(function*() {
        // Fire the persisted timer before the registration-start deadline.
        yield* TestClock.adjust(clockDuration)
        // This is the completion emitted by ClockEntity when the persisted timer fires.
        // Calling it directly isolates the notifyLocal registration wait from storage claims.
        const fiber = yield* DurableDeferred.done(clock.deferred, {
          token: DurableDeferred.tokenFromExecutionId(clock.deferred, {
            workflow: RemovedWorkflow,
            executionId
          }),
          exit: Exit.void
        }).pipe(Effect.forkDetach({ startImmediately: true }))
        yield* Effect.yieldNow
        assert.isUndefined(fiber.pollUnsafe())
        yield* TestClock.adjust(registrationTimeout - clockDuration)

        const exit = fiber.pollUnsafe()
        assert(exit !== undefined, "the notifyLocal registration wait must be bounded")
        const defect = Exit.findDefect(exit)
        assert(Result.isSuccess(defect) && defect.success instanceof Error)
        assert.strictEqual(defect.success.message, `Entity type 'Workflow/${RemovedWorkflow._tag}' not registered`)
      }).pipe(Effect.provide(makeTestWorkflowEngine({ storageLayer, config })))
    }))

  for (const [id, threshold] of [["number", 0], ["bigint", 0n]] as const) {
    it.effect(`DurableClock.sleep preserves an explicit ${id} zero threshold`, () => verifyZeroThreshold(id, threshold))
  }

  it.effect("parallel child workflows inside an activity suspend the parent durably", () =>
    Effect.gen(function*() {
      const sharding = yield* Sharding.Sharding
      const flags = yield* Flags
      yield* TestClock.adjust(1)

      const payload = { id: "parallel-activity", childCount: 3, concurrency: 3, sleep: 2000 }
      const executionId = yield* ParallelParentWorkflow.executionId(payload)
      const fiber = yield* ParallelParentWorkflow.execute(payload).pipe(
        Effect.forkChild({ startImmediately: true })
      )

      // the parent suspends durably once every child has been dispatched
      let suspended = false
      while (!suspended) {
        yield* Effect.yieldNow
        yield* sharding.pollStorage
        const result = yield* ParallelParentWorkflow.poll(executionId)
        suspended = Option.isSome(result) && result.value._tag === "Suspended"
      }
      assert.strictEqual(flags.get("parallel-runs-parallel-activity"), 1)
      assert.isTrue(flags.get("parallel-child-start-parallel-activity-child-0"))
      assert.isTrue(flags.get("parallel-child-start-parallel-activity-child-1"))
      assert.isTrue(flags.get("parallel-child-start-parallel-activity-child-2"))
      assert.strictEqual(flags.get("parallel-activity-runs-parallel-activity"), 1)
      assert.strictEqual(flags.get("parallel-activity-releases-parallel-activity"), 1)

      // the children complete after a single sleep window and wake the parent
      yield* TestClock.adjust(Duration.seconds(2))
      yield* sharding.pollStorage
      while (fiber.pollUnsafe() === undefined) {
        yield* Effect.yieldNow
        yield* TestClock.adjust(1)
        yield* sharding.pollStorage
      }
      assert.deepStrictEqual(fiber.pollUnsafe(), Exit.succeed(["done-0", "done-1", "done-2"]))

      // the parent replayed after suspending, and no run retried the activity body
      const parentRuns = Number(flags.get("parallel-runs-parallel-activity"))
      const activityRuns = Number(flags.get("parallel-activity-runs-parallel-activity"))
      assert.isAtLeast(parentRuns, 2)
      assert.isAtMost(activityRuns, parentRuns)
    }).pipe(Effect.provide(TestWorkflowLayer)))

  it.effect("bounded child concurrency progresses across suspended activity replays", () =>
    Effect.gen(function*() {
      const sharding = yield* Sharding.Sharding
      const flags = yield* Flags
      yield* TestClock.adjust(1)
      const payload = { id: "parallel-bounded", childCount: 5, concurrency: 2, sleep: 2000 }
      const executionId = yield* ParallelParentWorkflow.executionId(payload)
      yield* ParallelParentWorkflow.execute(payload, { discard: true })

      for (const started of [2, 4, 5]) {
        let suspended = false
        while (!suspended) {
          yield* Effect.yieldNow
          // Drive cluster retries between runs without advancing child clocks
          // while the activity is computing execution IDs.
          if (
            flags.get("parallel-activity-runs-parallel-bounded") ===
              flags.get("parallel-activity-releases-parallel-bounded")
          ) {
            yield* TestClock.adjust(1)
          }
          yield* sharding.pollStorage
          const result = yield* ParallelParentWorkflow.poll(executionId)
          suspended = Option.isSome(result) && result.value._tag === "Suspended" &&
            flags.get(`parallel-child-start-parallel-bounded-child-${started - 1}`) === true
        }
        for (let index = 0; index < 5; index++) {
          assert.strictEqual(
            flags.get(`parallel-child-start-parallel-bounded-child-${index}`),
            index < started ? true : undefined
          )
        }
        assert.strictEqual(
          flags.get("parallel-activity-releases-parallel-bounded"),
          flags.get("parallel-activity-runs-parallel-bounded")
        )
        yield* TestClock.adjust(Duration.seconds(2))
        yield* sharding.pollStorage
      }
      let result = yield* ParallelParentWorkflow.poll(executionId)
      while (Option.isNone(result) || result.value._tag !== "Complete") {
        yield* Effect.yieldNow
        yield* TestClock.adjust(1)
        yield* sharding.pollStorage
        result = yield* ParallelParentWorkflow.poll(executionId)
      }
      assert.deepStrictEqual(
        result.value,
        new Workflow.Complete({ exit: Exit.succeed(["done-0", "done-1", "done-2", "done-3", "done-4"]) })
      )
      assert.isAtMost(
        Number(flags.get("parallel-activity-runs-parallel-bounded")),
        Number(flags.get("parallel-runs-parallel-bounded"))
      )
    }).pipe(Effect.provide(TestWorkflowLayer)))

  it.effect("resumes when children complete during activity cleanup", () =>
    Effect.gen(function*() {
      const cleaningUp = yield* Latch.make()
      const release = yield* Latch.make()
      const Parent = Workflow.make("CleanupParent", {
        payload: {},
        success: Schema.Array(Schema.Number),
        idempotencyKey: () => "parent"
      })
      const Child = Workflow.make("CleanupChild", {
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
        const sharding = yield* Sharding.Sharding
        yield* TestClock.adjust(1)
        const executionId = yield* Parent.execute({}, { discard: true })
        yield* cleaningUp.await
        yield* TestClock.adjust("2 seconds")
        yield* sharding.pollStorage
        for (const index of [0, 1]) {
          const childId = yield* Child.executionId({ index })
          let childResult = yield* Child.poll(childId)
          while (Option.isNone(childResult) || childResult.value._tag !== "Complete") {
            yield* Effect.yieldNow
            yield* TestClock.adjust(1)
            yield* sharding.pollStorage
            childResult = yield* Child.poll(childId)
          }
          assert.deepStrictEqual(
            childResult.value,
            new Workflow.Complete({ exit: Exit.succeed(index) })
          )
        }
        yield* release.open
        let result = yield* Parent.poll(executionId)
        while (Option.isNone(result) || result.value._tag !== "Complete") {
          yield* Effect.yieldNow
          yield* TestClock.adjust(1)
          yield* sharding.pollStorage
          result = yield* Parent.poll(executionId)
        }
        assert.deepStrictEqual(
          result.value,
          new Workflow.Complete({ exit: Exit.succeed([0, 1]) })
        )
      }).pipe(Effect.provide(Layer.mergeAll(ParentLayer, ChildLayer).pipe(Layer.provideMerge(TestWorkflowLayer))))
    }))

  it.effect("coalesces parked child wakeups while parent cleanup is pending", () =>
    Effect.gen(function*() {
      const cleaningUp = yield* Latch.make()
      const release = yield* Latch.make()
      const indices = Array.from({ length: 64 }, (_, index) => index)
      let parked = 0
      let peak = 0
      const storageLayer = Layer.effect(
        MessageStorage.MessageStorage,
        Effect.map(
          MessageStorage.MessageStorage,
          (storage) =>
            MessageStorage.MessageStorage.of({
              ...storage,
              registerReplyHandler: (message) => {
                if (
                  message.envelope.address.entityType !== "Workflow/ManyChildrenParent" ||
                  message.envelope.tag !== "run"
                ) {
                  return storage.registerReplyHandler(message)
                }
                return Effect.suspend(() => {
                  parked++
                  peak = Math.max(peak, parked)
                  return storage.registerReplyHandler(message)
                }).pipe(Effect.ensuring(Effect.sync(() => {
                  parked--
                })))
              }
            })
        )
      ).pipe(Layer.provideMerge(MessageStorage.layerMemory))
      const Parent = Workflow.make("ManyChildrenParent", {
        payload: {},
        success: Schema.Array(Schema.Number),
        idempotencyKey: () => "parent"
      })
      const Child = Workflow.make("ManyChildrenChild", {
        payload: { index: Schema.Number },
        success: Schema.Number,
        idempotencyKey: ({ index }) => String(index)
      })
      const ParentLayer = Parent.toLayer(() =>
        Activity.make({
          name: "children",
          success: Schema.Array(Schema.Number),
          execute: Effect.forEach(indices, (index) => Child.execute({ index }), { concurrency: "unbounded" }).pipe(
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
        const sharding = yield* Sharding.Sharding
        const driver = yield* MessageStorage.MemoryDriver
        yield* TestClock.adjust(1)
        const executionId = yield* Parent.execute({}, { discard: true })
        yield* cleaningUp.await
        yield* TestClock.adjust("2 seconds")
        const wakeRequests = () =>
          driver.journal.filter((message) =>
            message._tag === "Request" &&
            message.address.entityType === "Workflow/ManyChildrenParent" && message.tag === "resume"
          )
        const allWakesHandled = () => {
          const wakes = wakeRequests()
          const replied = wakes.filter((message) =>
            message._tag === "Request" && (driver.requests.get(message.requestId)?.replies.length ?? 0) > 0
          ).length
          // Every wake must have replied or parked before releasing the parent.
          return wakes.length === indices.length && replied + parked === indices.length
        }
        while (!allWakesHandled()) {
          yield* Effect.yieldNow
          yield* TestClock.adjust(1)
          yield* sharding.pollStorage
        }
        const wakes = wakeRequests()
        const parkedBeforeRelease = parked
        yield* release.open
        let result = yield* Parent.poll(executionId)
        while (Option.isNone(result) || result.value._tag !== "Complete" || parked !== 0) { // oxlint-disable-line no-unmodified-loop-condition
          yield* Effect.yieldNow
          yield* TestClock.adjust(1)
          yield* sharding.pollStorage
          result = yield* Parent.poll(executionId)
        }
        assert.deepStrictEqual(
          result.value,
          new Workflow.Complete({ exit: Exit.succeed(indices) })
        )
        assert.strictEqual(parked, 0)
        assert.strictEqual(wakes.length, indices.length)
        // Each wake remains durable, but only one waits on this parent run.
        assert.strictEqual(parkedBeforeRelease, 1, `peak parked reply handlers: ${peak}`)
        assert.strictEqual(peak, 1)
      }).pipe(Effect.provide(
        Layer.mergeAll(ParentLayer, ChildLayer).pipe(
          Layer.provideMerge(makeTestWorkflowEngine({ config: { entityMailboxCapacity: 1000 }, storageLayer }))
        )
      ))
    }))

  for (const queuedReplay of [false, true]) {
    it.effect(`resumes a fresh entity from a legacy envelope with queued replay ${queuedReplay}`, () =>
      Effect.gen(function*() {
        const Parent = Workflow.make("ColdParent", {
          payload: {},
          success: Schema.Array(Schema.Number),
          idempotencyKey: () => "parent"
        })
        const Child = Workflow.make("ColdChild", {
          payload: { index: Schema.Number },
          success: Schema.Number,
          idempotencyKey: ({ index }) => String(index)
        })
        const gate = DurableDeferred.make("cold-child")
        const ParentLayer = Parent.toLayer(() =>
          Activity.make({
            name: "children",
            success: Schema.Array(Schema.Number),
            execute: Effect.forEach([0, 1], (index) => Child.execute({ index }), { concurrency: "unbounded" })
          })
        )
        const ChildLayer = Child.toLayer(({ index }) => DurableDeferred.await(gate).pipe(Effect.as(index)))
        const LegacyResume = Entity.make("Workflow/ColdParent", [
          Rpc.make("resume", { payload: {}, primaryKey: () => "" }).annotate(ClusterSchema.Persisted, true)
        ])
        yield* Effect.gen(function*() {
          const sharding = yield* Sharding.Sharding
          const driver = yield* MessageStorage.MemoryDriver
          const engine = yield* WorkflowEngine
          yield* TestClock.adjust(1)
          const executionId = yield* Parent.execute({}, { discard: true })
          let result = yield* Parent.poll(executionId)
          while (Option.isNone(result) || result.value._tag !== "Suspended") {
            yield* Effect.yieldNow
            yield* TestClock.adjust(1)
            yield* sharding.pollStorage
            result = yield* Parent.poll(executionId)
          }
          for (let i = 0; i < 12 && (yield* sharding.activeEntityCount) > 0; i++) {
            yield* TestClock.adjust(5000)
          }
          assert.strictEqual(yield* sharding.activeEntityCount, 0)
          if (queuedReplay) {
            const run = driver.journal.find((message) =>
              message._tag === "Request" &&
              message.address.entityType === "Workflow/ColdParent" && message.tag === "run"
            )!
            assert(run._tag === "Request")
            assert.isTrue(yield* sharding.reset(Snowflake.Snowflake(run.requestId)))
            assert.isTrue(Option.isNone(yield* Parent.poll(executionId)))
          }
          const client = yield* LegacyResume.client
          // The empty payload is the format of resume messages persisted before this fix.
          const legacyResume = yield* client(executionId).resume({}).pipe(Effect.forkChild({ startImmediately: true }))
          for (const index of [0, 1]) {
            yield* engine.deferredDone(gate, {
              workflowName: Child._tag,
              executionId: yield* Child.executionId({ index }),
              deferredName: gate.name,
              exit: Exit.void
            })
          }
          result = yield* Parent.poll(executionId)
          while (Option.isNone(result) || result.value._tag !== "Complete" || legacyResume.pollUnsafe() === undefined) {
            yield* Effect.yieldNow
            yield* TestClock.adjust(1)
            yield* sharding.pollStorage
            result = yield* Parent.poll(executionId)
          }
          assert.deepStrictEqual(
            result.value,
            new Workflow.Complete({ exit: Exit.succeed([0, 1]) })
          )
          assert.deepStrictEqual(legacyResume.pollUnsafe(), Exit.void)
        }).pipe(Effect.provide(
          Layer.mergeAll(ParentLayer, ChildLayer).pipe(
            Layer.provideMerge(makeTestWorkflowEngine({ config: { entityMessagePollInterval: "1 hour" } }))
          )
        ))
      }))
  }

  it.effect("a parent stays suspended past the activity interrupt retry budget", () =>
    Effect.gen(function*() {
      const sharding = yield* Sharding.Sharding
      const flags = yield* Flags
      yield* TestClock.adjust(1)

      const payload = { id: "parallel-long", childCount: 2, concurrency: 2, sleep: 60_000 }
      const executionId = yield* ParallelParentWorkflow.executionId(payload)
      const fiber = yield* ParallelParentWorkflow.execute(payload).pipe(
        Effect.forkChild({ startImmediately: true })
      )

      let suspended = false
      while (!suspended) {
        yield* Effect.yieldNow
        yield* sharding.pollStorage
        const result = yield* ParallelParentWorkflow.poll(executionId)
        suspended = Option.isSome(result) && result.value._tag === "Suspended"
      }

      // well past the activity interrupt retry budget the run is still suspended
      // and the activity body has not been re-executed
      yield* TestClock.adjust(Duration.seconds(50))
      yield* sharding.pollStorage
      const still = yield* ParallelParentWorkflow.poll(executionId)
      assert.isTrue(Option.isSome(still) && still.value._tag === "Suspended")
      assert.strictEqual(flags.get("parallel-activity-runs-parallel-long"), 1)
      assert.strictEqual(flags.get("parallel-activity-releases-parallel-long"), 1)
      assert.isUndefined(fiber.pollUnsafe())

      yield* TestClock.adjust(Duration.seconds(10))
      yield* sharding.pollStorage
      while (fiber.pollUnsafe() === undefined) {
        yield* Effect.yieldNow
        yield* TestClock.adjust(1)
        yield* sharding.pollStorage
      }
      assert.deepStrictEqual(fiber.pollUnsafe(), Exit.succeed(["done-0", "done-1"]))
    }).pipe(Effect.provide(TestWorkflowLayer)))

  it.effect("parallel child workflows in the workflow body all dispatch before suspending", () =>
    Effect.gen(function*() {
      const sharding = yield* Sharding.Sharding
      const flags = yield* Flags
      yield* TestClock.adjust(1)

      const payload = { id: "parallel-direct", childCount: 3 }
      const executionId = yield* ParallelDirectWorkflow.executionId(payload)
      const fiber = yield* ParallelDirectWorkflow.execute(payload).pipe(
        Effect.forkChild({ startImmediately: true })
      )

      let suspended = false
      while (!suspended) {
        yield* Effect.yieldNow
        yield* sharding.pollStorage
        const result = yield* ParallelDirectWorkflow.poll(executionId)
        suspended = Option.isSome(result) && result.value._tag === "Suspended"
      }
      assert.strictEqual(flags.get("parallel-runs-parallel-direct"), 1)
      assert.isTrue(flags.get("parallel-child-start-parallel-direct-child-0"))
      assert.isTrue(flags.get("parallel-child-start-parallel-direct-child-1"))
      assert.isTrue(flags.get("parallel-child-start-parallel-direct-child-2"))

      yield* TestClock.adjust(Duration.seconds(2))
      yield* sharding.pollStorage
      while (fiber.pollUnsafe() === undefined) {
        yield* Effect.yieldNow
        yield* TestClock.adjust(1)
        yield* sharding.pollStorage
      }
      assert.deepStrictEqual(fiber.pollUnsafe(), Exit.succeed(["done-0", "done-1", "done-2"]))
    }).pipe(Effect.provide(TestWorkflowLayer)))

  it.effect("routes fractional millisecond durable clock wakeups to the workflow shard group", () =>
    Effect.gen(function*() {
      const driver = yield* MessageStorage.MemoryDriver
      const sharding = yield* Sharding.Sharding
      const scheduled = yield* ShardedClockScheduled
      const startedAt = yield* DateTime.now

      const fiber = yield* ShardedClockWorkflow.execute({
        id: "sharded-clock"
      }).pipe(Effect.forkChild({ startImmediately: true }))

      yield* scheduled.await

      const envelope = driver.journal.find((envelope) =>
        envelope._tag === "Request" && envelope.address.entityType === "Workflow/-/DurableClock"
      )
      assert(envelope)
      assert.strictEqual(envelope.address.shardId.group, "workflow")
      const deliverAt = driver.requests.get(envelope.requestId)?.deliverAt
      assert.isNumber(deliverAt)
      assert.strictEqual(deliverAt, DateTime.toEpochMillis(startedAt) + 10001)

      yield* TestClock.adjust(10001)
      yield* sharding.pollStorage
      yield* TestClock.adjust(5000)
      yield* Fiber.join(fiber)
    }).pipe(Effect.provide(TestWorkflowLayer)))

  it.effect("routes durable deferred completions to the workflow shard group after a partial client is cached", () =>
    Effect.gen(function*() {
      const driver = yield* MessageStorage.MemoryDriver
      const engine = yield* WorkflowEngine
      const executionIdBeforeRegister = yield* ShardedDeferredWorkflow.executionId({ id: "before-register" })
      const tokenBeforeRegister = DurableDeferred.tokenFromExecutionId(ShardedDeferred, {
        workflow: ShardedDeferredWorkflow,
        executionId: executionIdBeforeRegister
      })

      // Prime the partial client cache without waiting for the unregistered workflow entity.
      const beforeRegisterDoneFiber = yield* DurableDeferred.done(ShardedDeferred, {
        token: tokenBeforeRegister,
        exit: Exit.void
      }).pipe(Effect.forkChild({ startImmediately: true }))
      yield* Effect.yieldNow
      yield* Fiber.interrupt(beforeRegisterDoneFiber)

      yield* engine.register(ShardedDeferredWorkflow, () => Effect.void)

      const executionIdAfterRegister = yield* ShardedDeferredWorkflow.executionId({ id: "after-register" })
      const tokenAfterRegister = DurableDeferred.tokenFromExecutionId(ShardedDeferred, {
        workflow: ShardedDeferredWorkflow,
        executionId: executionIdAfterRegister
      })
      const journalLength = driver.journal.length
      yield* DurableDeferred.done(ShardedDeferred, {
        token: tokenAfterRegister,
        exit: Exit.void
      })

      const envelope = driver.journal.slice(journalLength).find((envelope) =>
        envelope._tag === "Request" && envelope.address.entityType === "Workflow/ShardedDeferredWorkflow"
      )
      assert(envelope)
      assert.strictEqual(envelope.address.shardId.group, "workflow")
    }).pipe(Effect.provide(TestWorkflowEngine)))

  it.effect("warns for conflicting definitions and stays silent for the same definition", () => {
    class FirstPayload extends Schema.Class<FirstPayload>("DuplicateClassPayload")({
      organizationId: Schema.String
    }) {}
    class SecondPayload extends Schema.Class<SecondPayload>("DuplicateClassPayload")({
      deploymentId: Schema.Number
    }) {}
    const first = Workflow.make("DuplicateClassPayloadWorkflow", {
      payload: FirstPayload,
      idempotencyKey: ({ organizationId }) => organizationId
    })
    const second = Workflow.make("DuplicateClassPayloadWorkflow", {
      payload: SecondPayload,
      idempotencyKey: ({ deploymentId }) => String(deploymentId)
    })
    const warnings: Array<unknown> = []
    const logger = Logger.make<unknown, void>((options) => {
      if (options.logLevel === "Warn") {
        warnings.push(options.message)
      }
    })

    return Effect.gen(function*() {
      const engine = yield* WorkflowEngine
      yield* engine.register(first, () => Effect.void)
      yield* engine.register(first, () => Effect.void)

      assert.deepStrictEqual(warnings, [])

      yield* engine.register(second, () => Effect.void)

      const warning = warnings
        .map((message) => globalThis.Array.isArray(message) ? message.join(" ") : String(message))
        .find((message) => message.includes("DuplicateClassPayloadWorkflow"))
      assert(warning, "duplicate workflow registration must emit a warning containing its tag")
      const normalized = warning.toLowerCase()
      for (const fragment of ["organizationid", "string", "deploymentid", "number"]) {
        assert.include(normalized, fragment, `warning must identify both class payload shapes: ${warning}`)
      }
    }).pipe(Effect.provide(TestWorkflowEngine), Effect.withLogger(logger))
  })

  it.effect("does not fail when duplicate workflow payload shapes cannot be rendered", () => {
    const payloadKey = Symbol("payload")
    const first = Workflow.make("UnavailablePayloadShapeWorkflow", {
      payload: Schema.Struct({ [payloadKey]: Schema.String }),
      idempotencyKey: () => "first"
    })
    const second = Workflow.make("UnavailablePayloadShapeWorkflow", {
      payload: Schema.Struct({ [payloadKey]: Schema.Number }),
      idempotencyKey: () => "second"
    })
    const warnings: Array<unknown> = []
    const logger = Logger.make<unknown, void>((options) => {
      if (options.logLevel === "Warn") {
        warnings.push(options.message)
      }
    })

    return Effect.gen(function*() {
      const engine = yield* WorkflowEngine
      yield* engine.register(first, () => Effect.void)
      yield* engine.register(second, () => Effect.void)

      const warning = warnings
        .map((message) => globalThis.Array.isArray(message) ? message.join(" ") : String(message))
        .find((message) => message.includes("UnavailablePayloadShapeWorkflow"))
      assert(warning, "duplicate workflow registration must still warn when rendering a payload shape fails")
    }).pipe(Effect.provide(TestWorkflowEngine), Effect.withLogger(logger))
  })

  it.effect("propagates trace context to persisted workflow requests", () => {
    let callerSpan: Tracer.NativeSpan | undefined
    const tracer = Tracer.make({
      span(options) {
        const span = new Tracer.NativeSpan(options)
        if (options.name === "WorkflowEngine.deferredDone") {
          callerSpan = span
        }
        return span
      }
    })
    return Effect.gen(function*() {
      const driver = yield* MessageStorage.MemoryDriver
      const engine = yield* WorkflowEngine
      yield* engine.register(ShardedDeferredWorkflow, () => Effect.void)

      const executionId = yield* ShardedDeferredWorkflow.executionId({ id: "trace-context" })
      const token = DurableDeferred.tokenFromExecutionId(ShardedDeferred, {
        workflow: ShardedDeferredWorkflow,
        executionId
      })
      const journalLength = driver.journal.length
      yield* DurableDeferred.done(ShardedDeferred, {
        token,
        exit: Exit.void
      })

      const envelope = driver.journal.slice(journalLength).find((envelope) =>
        envelope._tag === "Request" &&
        envelope.address.entityType === "Workflow/ShardedDeferredWorkflow" &&
        envelope.tag === "deferred"
      )
      assert(envelope?._tag === "Request")
      assert(callerSpan)
      assert.strictEqual(envelope.traceId, callerSpan.traceId)
      assert.strictEqual(envelope.spanId, callerSpan.spanId)
      assert.strictEqual(envelope.sampled, callerSpan.sampled)
    }).pipe(
      Effect.provideService(Tracer.Tracer, tracer),
      Effect.provide(TestWorkflowEngine)
    )
  })

  it.effect("routes activities to the workflow shard group after a partial client is cached", () =>
    Effect.gen(function*() {
      const driver = yield* MessageStorage.MemoryDriver
      const engine = yield* WorkflowEngine
      const payload = { id: "partial-client-before-execute" }
      const executionId = yield* ShardedDeferredWorkflow.executionId(payload)
      const token = DurableDeferred.tokenFromExecutionId(ShardedDeferred, {
        workflow: ShardedDeferredWorkflow,
        executionId
      })
      // Prime the partial client cache without waiting for the unregistered workflow entity.
      const doneFiber = yield* DurableDeferred.done(ShardedDeferred, {
        token,
        exit: Exit.void
      }).pipe(Effect.forkChild({ startImmediately: true }))
      yield* Effect.yieldNow
      yield* Fiber.interrupt(doneFiber)

      yield* engine.register(ShardedDeferredWorkflow, () =>
        Activity.make({
          name: "ShardedActivity",
          execute: Effect.void
        }))

      const journalLength = driver.journal.length
      assert.strictEqual(yield* ShardedDeferredWorkflow.execute(payload), undefined)
      const envelope = driver.journal.slice(journalLength).find((envelope) =>
        envelope._tag === "Request" &&
        envelope.address.entityType === "Workflow/ShardedDeferredWorkflow" &&
        envelope.tag === "activity"
      )
      assert(envelope)
      assert.strictEqual(envelope.address.shardId.group, "workflow")
    }).pipe(Effect.provide(TestWorkflowEngine)))

  it.effect("SuspendOnFailure", () =>
    Effect.gen(function*() {
      const flags = yield* Flags
      yield* TestClock.adjust(1)

      yield* SuspendOnFailureWorkflow.execute({
        id: ""
      }).pipe(Effect.forkChild({ startImmediately: true }))

      yield* TestClock.adjust(2000)
      while (!flags.has("suspended")) {
        yield* Effect.yieldNow
      }

      assert.isTrue(flags.get("suspended"))
      assert.include(flags.get("cause"), "boom")
    }).pipe(Effect.provide(TestWorkflowLayer)))

  it.effect("catchCause activity", () =>
    Effect.gen(function*() {
      const flags = yield* Flags
      yield* TestClock.adjust(1)

      const fiber = yield* CatchWorkflow.execute({
        id: ""
      }).pipe(Effect.forkScoped)
      yield* TestClock.adjust(1)
      yield* Fiber.join(fiber)

      assert.isTrue(flags.get("catch"))
    }).pipe(Effect.provide(TestWorkflowLayer)))

  it.effect("can serialize workflow defects", () =>
    Effect.gen(function*() {
      yield* TestClock.adjust(1)

      const exit = yield* ErrorDefectWorkflow.execute({
        id: "raw-error-defect"
      }).pipe(Effect.exit)

      assert(Exit.isFailure(exit))
      const defect = Cause.findDefect(exit.cause)
      assert(Result.isSuccess(defect))
      assert(defect.success instanceof Error)
      assert.strictEqual(defect.success.message, "Batch request error: Request timed out")
    }).pipe(Effect.provide(TestWorkflowLayer)))
})

const makeTestWorkflowEngine = <Storage = MessageStorage.MemoryDriver>(options?: {
  readonly config?: Partial<ShardingConfig.ShardingConfig["Service"]> | undefined
  readonly shardingLayer?: typeof Sharding.layer | undefined
  readonly storageLayer?:
    | Layer.Layer<MessageStorage.MessageStorage | Storage, never, ShardingConfig.ShardingConfig>
    | undefined
}) =>
  ClusterWorkflowEngine.layer.pipe(
    Layer.provideMerge(options?.shardingLayer ?? Sharding.layer),
    Layer.provide(Runners.layerNoop),
    Layer.provideMerge(
      (options?.storageLayer ?? MessageStorage.layerMemory) as Layer.Layer<
        MessageStorage.MessageStorage | Storage,
        never,
        ShardingConfig.ShardingConfig
      >
    ),
    Layer.provide(RunnerStorage.layerMemory),
    Layer.provide(RunnerHealth.layerNoop),
    Layer.provide(ShardingConfig.layer({
      shardsPerGroup: 300,
      availableShardGroups: ["default", "workflow"],
      assignedShardGroups: ["default", "workflow"],
      entityMailboxCapacity: 10,
      entityTerminationTimeout: 0,
      entityMessagePollInterval: 5000,
      sendRetryInterval: 100,
      ...options?.config
    }))
  )

const pollUntil = <A extends Schema.Top, E extends Schema.Top>(
  workflow: Workflow.Workflow<any, any, A, E>,
  executionId: string,
  tag: "Suspended" | "Complete"
) =>
  Effect.gen(function*() {
    const sharding = yield* Sharding.Sharding
    let result = yield* workflow.poll(executionId)
    for (let i = 0; i < 2000 && !(Option.isSome(result) && result.value._tag === tag); i++) {
      yield* Effect.yieldNow
      yield* TestClock.adjust(1)
      yield* sharding.pollStorage
      result = yield* workflow.poll(executionId)
    }
    assert(Option.isSome(result) && result.value._tag === tag, `workflow must reach ${tag}`)
    return result.value
  })

const advanceUntil = (ready: () => boolean, message: string, step = 1, rounds = 2000) =>
  Effect.gen(function*() {
    for (let i = 0; i < rounds && !ready(); i++) yield* TestClock.adjust(step)
    assert(ready(), message)
  })

const TestWorkflowEngine = makeTestWorkflowEngine()

class SendEmailError extends Schema.Error<SendEmailError>("SendEmailError")({
  _tag: Schema.tag("SendEmailError"),
  message: Schema.String
}) {}

const EmailWorkflow = Workflow.make("EmailWorkflow", {
  payload: {
    to: Schema.String,
    id: Schema.String
  },
  error: SendEmailError,
  idempotencyKey(payload) {
    return payload.id
  }
})

class Flags extends Context.Service<Flags>()("Flags", {
  make: Effect.sync(() => new Map<string, boolean | number | string>())
}) {
  static readonly layer = Layer.effect(Flags, this.make)
}

const EmailWorkflowLayer = EmailWorkflow.toLayer(Effect.fn(function*(payload) {
  const flags = yield* Flags

  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      flags.set("finalizer", true)
    })
  )

  yield* Activity.make({
    name: "SendEmail",
    error: SendEmailError,
    execute: Effect.gen(function*() {
      const attempt = yield* Activity.CurrentAttempt

      if (attempt !== 5) {
        return yield* new SendEmailError({
          message: `Failed to send email for ${payload.id} on attempt ${attempt}`
        })
      }
    })
  }).pipe(
    EmailWorkflow.withCompensation(Effect.fnUntraced(function*() {
      flags.set("compensation", true)
    })),
    Activity.retry({ times: 5 })
  )

  if (payload.to === "compensation") {
    return yield* new SendEmailError({ message: `Compensation triggered` })
  }

  const result = yield* Activity.make({
    name: "Sleep",
    success: Schema.DateTimeUtc,
    execute: Effect.gen(function*() {
      // suspended inside Activity
      yield* DurableClock.sleep({
        name: "Some sleep",
        duration: "10 seconds",
        inMemoryThreshold: Duration.zero
      })
      return yield* DateTime.now
    })
  })
  // test serialization from Activity
  assert(DateTime.isUtc(result))

  yield* DurableDeferred.token(EmailTrigger)
  // suspended outside Activity
  yield* DurableDeferred.await(EmailTrigger).pipe(
    Effect.catchCause(() => {
      flags.set("catchCause", true)
      return Effect.void
    }),
    Effect.ensuring(Effect.sync(() => {
      flags.set("ensuring", true)
    }))
  )
})).pipe(
  Layer.provideMerge(Flags.layer)
)

const EmailTrigger = DurableDeferred.make("EmailTrigger", {
  success: Schema.String
})

const RaceWorkflow = Workflow.make("RaceWorkflow", {
  payload: {
    id: Schema.String
  },
  success: Schema.String,
  idempotencyKey: ({ id }) => id
})

const RaceWorkflowLayer = RaceWorkflow.toLayer(Effect.fnUntraced(function*() {
  const flags = yield* Flags

  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      flags.set("finalizer", true)
    })
  )

  return yield* Activity.raceAll("race", [
    Activity.make({
      name: "Activity1",
      success: Schema.String,
      error: Schema.Never,
      execute: Effect.onInterrupt(Effect.delay(Effect.succeed("Activity1"), 1000), () =>
        Effect.sync(() => {
          flags.set("interrupt1", true)
        }))
    }),
    Activity.make({
      name: "Activity2",
      success: Schema.String,
      error: Schema.Never,
      execute: Effect.onInterrupt(Effect.delay(Effect.succeed("Activity2"), 500), () =>
        Effect.sync(() => {
          flags.set("interrupt2", true)
        }))
    }),
    Activity.make({
      name: "Activity3",
      success: Schema.String,
      error: Schema.Never,
      execute: Effect.onInterrupt(Effect.delay(Effect.succeed("Activity3"), 100), () =>
        Effect.sync(() => {
          flags.set("interrupt3", true)
        }))
    })
  ])
}))

const FailureRaceWorkflow = Workflow.make("FailureRaceWorkflow", {
  payload: { id: Schema.String },
  success: Schema.String,
  error: Schema.String,
  idempotencyKey: ({ id }) => id
})

const FailureRaceWorkflowLayer = FailureRaceWorkflow.toLayer(() =>
  Activity.raceAll("failure-race", [
    Activity.make({
      name: "failure-race-fast",
      success: Schema.String,
      error: Schema.String,
      execute: Effect.fail("boom")
    }),
    Activity.make({
      name: "failure-race-slow",
      success: Schema.String,
      error: Schema.String,
      execute: Effect.sleep("1 second").pipe(Effect.as("slow"))
    })
  ])
)

const DurableRaceWorkflow = Workflow.make("DurableRaceWorkflow", {
  payload: {
    id: Schema.String
  },
  success: Schema.String,
  idempotencyKey: ({ id }) => id
})

const DurableRaceGate = DurableDeferred.make("DurableRaceGate")

const DurableRaceWorkflowLayer = DurableRaceWorkflow.toLayer(Effect.fnUntraced(function*() {
  const flags = yield* Flags

  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      flags.set("finalizer", true)
    })
  )

  const result = yield* Activity.raceAll("race", [
    Activity.make({
      name: "Activity1",
      success: Schema.String,
      error: Schema.Never,
      execute: DurableClock.sleep({
        name: "Activity1",
        duration: 50000,
        inMemoryThreshold: Duration.zero
      }).pipe(
        Effect.as("Activity1")
      )
    }),
    Activity.make({
      name: "Activity2",
      success: Schema.String,
      error: Schema.Never,
      execute: DurableClock.sleep({
        name: "Activity2",
        duration: 10000,
        inMemoryThreshold: Duration.zero
      }).pipe(
        Effect.as("Activity2")
      )
    }),
    Activity.make({
      name: "Activity3",
      success: Schema.String,
      error: Schema.Never,
      execute: DurableClock.sleep({
        name: "Activity3",
        duration: 1000,
        inMemoryThreshold: Duration.zero
      }).pipe(
        Effect.as("Activity3")
      )
    })
  ])
  flags.set("durable-race-token", yield* DurableDeferred.token(DurableRaceGate))
  yield* DurableDeferred.await(DurableRaceGate)
  return result
}))

const MixedRaceWorkflow = Workflow.make("MixedRaceWorkflow", {
  payload: { id: Schema.String },
  success: Schema.String,
  idempotencyKey: ({ id }) => id
})

const MixedRaceGate = DurableDeferred.make("MixedRaceGate", {
  success: Schema.String
})

const MixedRaceWorkflowLayer = MixedRaceWorkflow.toLayer(() =>
  DurableDeferred.raceAll({
    name: "mixed-race",
    success: Schema.String,
    error: Schema.Never,
    effects: [
      DurableDeferred.await(MixedRaceGate),
      Activity.make({
        name: "mixed-race-activity",
        success: Schema.String,
        execute: Effect.sleep("1 second").pipe(Effect.as("activity"))
      })
    ]
  })
)

const LosingDeferredWorkflow = Workflow.make("LosingDeferredWorkflow", {
  payload: { id: Schema.String },
  success: Schema.String,
  idempotencyKey: ({ id }) => id
})

const LosingDeferredGate = DurableDeferred.make("LosingDeferredGate", {
  success: Schema.String
})

const LosingDeferredWorkflowLayer = LosingDeferredWorkflow.toLayer(Effect.fnUntraced(function*() {
  const flags = yield* Flags
  const winner = yield* DurableDeferred.raceAll({
    name: "losing-deferred",
    success: Schema.String,
    error: Schema.Never,
    effects: [
      DurableDeferred.await(LosingDeferredGate),
      Activity.make({
        name: "losing-deferred-activity",
        success: Schema.String,
        execute: Effect.sleep("1 second").pipe(Effect.as("activity"))
      })
    ]
  })
  const tail = yield* Activity.make({
    name: "losing-deferred-tail",
    success: Schema.String,
    execute: Effect.suspend(() => {
      const runs = flags.get("losing-deferred-tail-runs")
      flags.set("losing-deferred-tail-runs", typeof runs === "number" ? runs + 1 : 1)
      return Effect.sleep("10 seconds").pipe(Effect.as("tail"))
    })
  })
  return `${winner}:${tail}`
}))

const InPlaceWakeWorkflow = Workflow.make("InPlaceWakeWorkflow", {
  payload: { id: Schema.String },
  success: Schema.String,
  idempotencyKey: ({ id }) => id
})

const InPlaceWakeGate = DurableDeferred.make("InPlaceWakeGate", {
  success: Schema.String
})

const InPlaceWakeWorkflowLayer = InPlaceWakeWorkflow.toLayer(Effect.fnUntraced(function*() {
  const flags = yield* Flags
  const runs = flags.get("in-place-wake-runs")
  flags.set("in-place-wake-runs", typeof runs === "number" ? runs + 1 : 1)
  return yield* DurableDeferred.raceAll({
    name: "in-place-wake",
    success: Schema.String,
    error: Schema.Never,
    effects: [
      DurableDeferred.await(InPlaceWakeGate),
      Activity.make({
        name: "in-place-wake-activity",
        success: Schema.String,
        execute: Effect.sleep("5 seconds").pipe(Effect.as("activity"))
      })
    ]
  })
}))

const IntoWrapWorkflow = Workflow.make("IntoWrapWorkflow", {
  payload: { id: Schema.String },
  success: Schema.String,
  idempotencyKey: ({ id }) => id
})

const IntoWrapGate = DurableDeferred.make("IntoWrapGate", {
  success: Schema.String
})

const IntoWrapAux = DurableDeferred.make("IntoWrapAux", {
  success: Schema.String
})

const IntoWrapWorkflowLayer = IntoWrapWorkflow.toLayer(() =>
  DurableDeferred.raceAll({
    name: "into-wrap",
    success: Schema.String,
    error: Schema.Never,
    effects: [
      DurableDeferred.into(DurableDeferred.await(IntoWrapGate), IntoWrapAux),
      Activity.make({
        name: "into-wrap-activity",
        success: Schema.String,
        execute: Effect.sleep("30 seconds").pipe(Effect.as("activity"))
      })
    ]
  })
)

const ClockCaptureWorkflow = Workflow.make("ClockCaptureWorkflow", {
  payload: { id: Schema.String },
  success: Schema.String,
  idempotencyKey: ({ id }) => id
})

const ClockCaptureWorkflowLayer = ClockCaptureWorkflow.toLayer(() =>
  Activity.raceAll("clock-capture", [
    Activity.make({
      name: "clock-capture-durable",
      success: Schema.String,
      execute: DurableClock.sleep({
        name: "clock-capture-durable",
        duration: 5000,
        inMemoryThreshold: Duration.zero
      }).pipe(Effect.as("clock"))
    }),
    Activity.make({
      name: "clock-capture-slow",
      success: Schema.String,
      execute: Effect.sleep("30 seconds").pipe(Effect.as("slow"))
    })
  ])
)

const BareClockWorkflow = Workflow.make("BareClockWorkflow", {
  payload: { id: Schema.String },
  success: Schema.String,
  idempotencyKey: ({ id }) => id
})

const BareClockWorkflowLayer = BareClockWorkflow.toLayer(() =>
  DurableDeferred.raceAll({
    name: "bare-clock",
    success: Schema.String,
    error: Schema.Never,
    effects: [
      DurableClock.sleep({
        name: "bare-clock-timer",
        duration: 5000,
        inMemoryThreshold: Duration.zero
      }).pipe(Effect.as("clock")),
      Activity.make({
        name: "bare-clock-slow",
        success: Schema.String,
        execute: Effect.sleep("30 seconds").pipe(Effect.as("slow"))
      })
    ]
  })
)

const MappedGateWorkflow = Workflow.make("MappedGateWorkflow", {
  payload: { id: Schema.String },
  success: Schema.String,
  idempotencyKey: ({ id }) => id
})

const MappedGate = DurableDeferred.make("MappedGate", {
  success: Schema.String
})

const MappedGateWorkflowLayer = MappedGateWorkflow.toLayer(() =>
  DurableDeferred.raceAll({
    name: "mapped-gate",
    success: Schema.String,
    error: Schema.Never,
    effects: [
      DurableDeferred.await(MappedGate).pipe(Effect.map((s) => `${s}!`)),
      Activity.make({
        name: "mapped-gate-slow",
        success: Schema.String,
        execute: Effect.sleep("30 seconds").pipe(Effect.as("slow"))
      })
    ]
  })
)

const PreGateWorkflow = Workflow.make("PreGateWorkflow", {
  payload: { id: Schema.String },
  success: Schema.String,
  idempotencyKey: ({ id }) => id
})

const PreGate = DurableDeferred.make("PreGate", {
  success: Schema.String
})

const PreGateWorkflowLayer = PreGateWorkflow.toLayer(() =>
  DurableDeferred.raceAll({
    name: "pre-gate",
    success: Schema.String,
    error: Schema.Never,
    effects: [
      Effect.gen(function*() {
        const a = yield* Activity.make({
          name: "pre-gate-activity",
          success: Schema.String,
          execute: Effect.succeed("act")
        })
        const s = yield* DurableDeferred.await(PreGate)
        return `${a}:${s}`
      }),
      Activity.make({
        name: "pre-gate-slow",
        success: Schema.String,
        execute: Effect.sleep("30 seconds").pipe(Effect.as("slow"))
      })
    ]
  })
)

const TwoStepWorkflow = Workflow.make("TwoStepWorkflow", {
  payload: { id: Schema.String },
  success: Schema.String,
  idempotencyKey: ({ id }) => id
})

const TwoStepGateA = DurableDeferred.make("TwoStepGateA", {
  success: Schema.String
})

const TwoStepGateB = DurableDeferred.make("TwoStepGateB", {
  success: Schema.String
})

class TwoStepBranchControl extends Context.Service<TwoStepBranchControl>()("TwoStepBranchControl", {
  make: Effect.all({
    entered: Latch.make(),
    release: Latch.make(),
    started: Latch.make()
  })
}) {
  static readonly layer = Layer.effect(TwoStepBranchControl, this.make)
}

const TwoStepWorkflowLayer = TwoStepWorkflow.toLayer(() =>
  DurableDeferred.raceAll({
    name: "two-step",
    success: Schema.String,
    error: Schema.Never,
    effects: [
      Effect.gen(function*() {
        const flags = yield* Flags
        const branchControl = yield* TwoStepBranchControl
        branchControl.entered.openUnsafe()
        yield* branchControl.release.await
        const runs = flags.get("two-step-branch-runs")
        flags.set("two-step-branch-runs", typeof runs === "number" ? runs + 1 : 1)
        branchControl.started.openUnsafe()
        const a = yield* DurableDeferred.await(TwoStepGateA)
        const b = yield* DurableDeferred.await(TwoStepGateB)
        return `${a}:${b}`
      }),
      // a live branch that holds no activity slot, so wake re-runs are
      // processed while the race stays active
      Effect.never
    ]
  })
)

const SlowUnwindWorkflow = Workflow.make("SlowUnwindWorkflow", {
  payload: { id: Schema.String },
  success: Schema.String,
  idempotencyKey: ({ id }) => id
})

const SlowUnwindGateA = DurableDeferred.make("SlowUnwindGateA", {
  success: Schema.String
})

const SlowUnwindGateB = DurableDeferred.make("SlowUnwindGateB", {
  success: Schema.String
})

const SlowUnwindWorkflowLayer = SlowUnwindWorkflow.toLayer(Effect.fnUntraced(function*() {
  const flags = yield* Flags
  const runs = flags.get("slow-unwind-runs")
  flags.set("slow-unwind-runs", typeof runs === "number" ? runs + 1 : 1)
  return yield* DurableDeferred.raceAll({
    name: "slow-unwind",
    success: Schema.String,
    error: Schema.Never,
    effects: [
      DurableDeferred.await(SlowUnwindGateA),
      DurableDeferred.await(SlowUnwindGateB)
    ]
  }).pipe(
    // slows the unwind so completions can land while a suspension commits
    Effect.ensuring(
      Effect.sync(() => flags.set("slow-unwind-started", true)).pipe(
        Effect.andThen(Effect.sleep("10 seconds"))
      )
    )
  )
}))

const TwoGateWorkflow = Workflow.make("TwoGateWorkflow", {
  payload: { id: Schema.String },
  success: Schema.String,
  idempotencyKey: ({ id }) => id
})

const TwoGateA = DurableDeferred.make("TwoGateA", {
  success: Schema.String
})

const TwoGateB = DurableDeferred.make("TwoGateB", {
  success: Schema.String
})

const TwoGateWorkflowLayer = TwoGateWorkflow.toLayer(() =>
  DurableDeferred.raceAll({
    name: "two-gates",
    success: Schema.String,
    error: Schema.Never,
    effects: [
      DurableDeferred.await(TwoGateA),
      DurableDeferred.await(TwoGateB)
    ]
  })
)

const ParentWorkflow = Workflow.make("ParentWorkflow", {
  payload: {
    id: Schema.String
  },
  idempotencyKey(payload) {
    return payload.id
  }
})

const ChildWorkflow = Workflow.make("ChildWorkflow", {
  payload: {
    id: Schema.String
  },
  idempotencyKey(payload) {
    return payload.id
  }
})

const ParentWorkflowLayer = ParentWorkflow.toLayer(Effect.fnUntraced(function*({ id }) {
  const flags = yield* Flags
  const instance = yield* WorkflowInstance
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      flags.set("parent-suspended", instance.suspended)
    })
  )
  yield* ChildWorkflow.execute({ id })
  flags.set("parent-end", true)
}))

const ChildDeferred = DurableDeferred.make("ChildDeferred")
const ChildWorkflowLayer = ChildWorkflow.toLayer(Effect.fnUntraced(function*() {
  const flags = yield* Flags
  flags.set("child-token", yield* DurableDeferred.token(ChildDeferred))
  yield* DurableDeferred.await(ChildDeferred)
  flags.set("child-end", true)
}))

const ParallelParentWorkflow = Workflow.make("ParallelParentWorkflow", {
  payload: {
    id: Schema.String,
    childCount: Schema.Number,
    concurrency: Schema.Number,
    sleep: Schema.Number
  },
  success: Schema.Array(Schema.String),
  idempotencyKey(payload) {
    return payload.id
  }
})

const ParallelDirectWorkflow = Workflow.make("ParallelDirectWorkflow", {
  payload: {
    id: Schema.String,
    childCount: Schema.Number
  },
  success: Schema.Array(Schema.String),
  idempotencyKey(payload) {
    return payload.id
  }
})

const ParallelChildWorkflow = Workflow.make("ParallelChildWorkflow", {
  payload: {
    id: Schema.String,
    index: Schema.Number,
    sleep: Schema.Number
  },
  success: Schema.String,
  idempotencyKey(payload) {
    return payload.id
  }
})

const increment = (flags: Map<string, boolean | number | string>, key: string) => {
  flags.set(key, Number(flags.get(key) ?? 0) + 1)
}

const ParallelParentWorkflowLayer = ParallelParentWorkflow.toLayer(Effect.fnUntraced(function*(payload) {
  const flags = yield* Flags
  increment(flags, `parallel-runs-${payload.id}`)
  const indices = Array.from({ length: payload.childCount }, (_, i) => i)
  return yield* Activity.make({
    name: "parallel-children",
    success: Schema.Array(Schema.String),
    error: Schema.Never,
    execute: Effect.suspend(() => {
      increment(flags, `parallel-activity-runs-${payload.id}`)
      return Effect.forEach(
        indices,
        (index) => ParallelChildWorkflow.execute({ id: `${payload.id}-child-${index}`, index, sleep: payload.sleep }),
        { concurrency: payload.concurrency }
      )
    }).pipe(Effect.ensuring(Effect.sync(() => increment(flags, `parallel-activity-releases-${payload.id}`))))
  })
}))

const ParallelDirectWorkflowLayer = ParallelDirectWorkflow.toLayer(Effect.fnUntraced(function*(payload) {
  const flags = yield* Flags
  increment(flags, `parallel-runs-${payload.id}`)
  const indices = Array.from({ length: payload.childCount }, (_, i) => i)
  return yield* Effect.forEach(
    indices,
    (index) => ParallelChildWorkflow.execute({ id: `${payload.id}-child-${index}`, index, sleep: 2000 }),
    { concurrency: "unbounded" }
  )
}))

const ParallelChildWorkflowLayer = ParallelChildWorkflow.toLayer(Effect.fnUntraced(function*(payload) {
  const flags = yield* Flags
  flags.set(`parallel-child-start-${payload.id}`, true)
  yield* DurableClock.sleep({
    name: "parallel-child",
    duration: payload.sleep,
    inMemoryThreshold: Duration.zero
  })
  return `done-${payload.index}`
}))

const ZeroThresholdWorkflow = Workflow.make("DurableClock/ZeroThreshold", {
  payload: { id: Schema.String },
  idempotencyKey: ({ id }) => id
})

const verifyZeroThreshold = Effect.fn(function*(id: string, inMemoryThreshold: 0 | 0n) {
  const instance = WorkflowInstance.initial(ZeroThresholdWorkflow, `execution/${id}`)
  const calls: Array<string> = []
  const unexpected = () => Effect.die("unexpected engine operation")
  const engine = makeWorkflowEngineUnsafe({
    register: unexpected,
    execute: unexpected,
    poll: unexpected,
    interrupt: unexpected,
    interruptUnsafe: unexpected,
    resume: unexpected,
    deferredDone: unexpected,
    activityExecute: () =>
      Effect.sync(() => {
        calls.push("activityExecute")
        return new Workflow.Complete({ exit: Exit.void })
      }),
    scheduleClock: () =>
      Effect.sync(() => {
        calls.push("scheduleClock")
      }),
    deferredResult: () =>
      Effect.sync(() => {
        calls.push("deferredResult")
        return Option.some(Exit.void)
      })
  })
  yield* DurableClock.sleep({ name: `clock/${id}`, duration: 10, inMemoryThreshold }).pipe(
    Effect.provideService(WorkflowEngine, engine),
    Effect.provideService(WorkflowInstance, instance)
  )
  assert.deepStrictEqual(calls, ["scheduleClock", "deferredResult"])
})

const ShardedClockWorkflow = Workflow.make("ShardedClockWorkflow", {
  payload: {
    id: Schema.String
  },
  idempotencyKey(payload) {
    return payload.id
  }
}).annotate(ClusterSchema.ShardGroup, () => "workflow")

class ShardedClockScheduled extends Context.Service<ShardedClockScheduled>()("ShardedClockScheduled", {
  make: Latch.make()
}) {
  static readonly layer = Layer.effect(ShardedClockScheduled, this.make)
}

const ShardedClockWorkflowLayer = ShardedClockWorkflow.toLayer(Effect.fnUntraced(function*() {
  const engine = yield* WorkflowEngine
  const instance = yield* WorkflowInstance
  const scheduled = yield* ShardedClockScheduled
  const clock = DurableClock.make({
    name: "ShardedClock",
    duration: 10000.5
  })
  yield* engine.scheduleClock(instance.workflow, {
    executionId: instance.executionId,
    clock
  })
  yield* scheduled.open
  yield* DurableDeferred.await(clock.deferred)
}))

const ShardedDeferred = DurableDeferred.make("ShardedDeferred")

const ShardedDeferredWorkflow = Workflow.make("ShardedDeferredWorkflow", {
  payload: {
    id: Schema.String
  },
  idempotencyKey(payload) {
    return payload.id
  }
}).annotate(ClusterSchema.ShardGroup, () => "workflow")

const SuspendOnFailureWorkflow = Workflow.make("SuspendOnFailureWorkflow", {
  payload: {
    id: Schema.String
  },
  idempotencyKey(payload) {
    return payload.id
  }
}).annotate(Workflow.SuspendOnFailure, true)

const SuspendOnFailureWorkflowLayer = SuspendOnFailureWorkflow.toLayer(Effect.fnUntraced(function*() {
  const flags = yield* Flags
  const instance = yield* WorkflowInstance
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      flags.set("suspended", instance.suspended)
      flags.set("cause", Cause.pretty(instance.cause!))
    })
  )
  yield* Activity.make({
    name: "fail",
    execute: Effect.die("boom")
  })
}))

const CatchWorkflow = Workflow.make("CatchWorkflow", {
  payload: {
    id: Schema.String
  },
  idempotencyKey(payload) {
    return payload.id
  }
})

const CatchWorkflowLayer = CatchWorkflow.toLayer(Effect.fnUntraced(function*() {
  const flags = yield* Flags
  yield* Activity.make({
    name: "fail",
    execute: Effect.die("boom")
  }).pipe(
    Effect.catchCause((cause) =>
      Activity.make({
        name: "log",
        execute: Effect.suspend(() => {
          flags.set("catch", true)
          return Effect.log(cause)
        })
      })
    )
  )
}))

const ErrorDefectWorkflow = Workflow.make("ErrorDefectWorkflow", {
  payload: {
    id: Schema.String
  },
  idempotencyKey(payload) {
    return payload.id
  }
})

const ErrorDefectWorkflowLayer = ErrorDefectWorkflow.toLayer(Effect.fnUntraced(function*() {
  yield* Activity.make({
    name: "raw-error-defect",
    execute: Effect.die(makeBatchRequestError())
  })
}))

const makeBatchRequestError = () => {
  const error = new Error("Batch request error: Request timed out")
  Object.defineProperty(error, "nonJson", {
    enumerable: true,
    value: 1n
  })
  return error
}

const RaceWorkflowLayers = RaceWorkflowLayer.pipe(
  Layer.merge(FailureRaceWorkflowLayer),
  Layer.merge(DurableRaceWorkflowLayer),
  Layer.merge(MixedRaceWorkflowLayer),
  Layer.merge(LosingDeferredWorkflowLayer),
  Layer.merge(InPlaceWakeWorkflowLayer),
  Layer.merge(IntoWrapWorkflowLayer),
  Layer.merge(ClockCaptureWorkflowLayer),
  Layer.merge(BareClockWorkflowLayer),
  Layer.merge(MappedGateWorkflowLayer),
  Layer.merge(TwoStepWorkflowLayer),
  Layer.merge(PreGateWorkflowLayer),
  Layer.merge(SlowUnwindWorkflowLayer),
  Layer.merge(TwoGateWorkflowLayer)
)

const TestWorkflowLayer = EmailWorkflowLayer.pipe(
  Layer.merge(RaceWorkflowLayers),
  Layer.merge(ParentWorkflowLayer),
  Layer.merge(ChildWorkflowLayer),
  Layer.merge(ParallelParentWorkflowLayer),
  Layer.merge(ParallelDirectWorkflowLayer),
  Layer.merge(ParallelChildWorkflowLayer),
  Layer.merge(ShardedClockWorkflowLayer),
  Layer.merge(SuspendOnFailureWorkflowLayer),
  Layer.merge(CatchWorkflowLayer),
  Layer.merge(ErrorDefectWorkflowLayer),
  Layer.provideMerge(Flags.layer),
  Layer.provideMerge(TwoStepBranchControl.layer),
  Layer.provideMerge(ShardedClockScheduled.layer),
  Layer.provideMerge(TestWorkflowEngine)
)
