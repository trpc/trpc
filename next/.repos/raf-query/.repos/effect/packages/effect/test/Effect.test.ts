import { assert, describe, it, vi } from "@effect/vitest"
import { assertExitFailure } from "@effect/vitest/utils"
import {
  Cause,
  Context,
  Data,
  Deferred,
  Duration,
  Effect,
  Effectable,
  Exit,
  Fiber,
  type Filter,
  Latch,
  Layer,
  Logger,
  type LogLevel,
  Option,
  Pool,
  Ref,
  References,
  Result,
  Schedule,
  Scheduler,
  Scope,
  TxRef
} from "effect"
import { constFalse, constTrue, pipe } from "effect/Function"
import { TestClock } from "effect/testing"
import { AsyncLocalStorage } from "node:async_hooks"
import { assertCauseFail } from "./utils/assert.ts"

class ATag extends Context.Service<ATag, "A">()("ATag") {}

const assertExitDefect = <A, E>(exit: Exit.Exit<A, E>, defect: unknown) => {
  assert.isTrue(Exit.hasDies(exit))
  const result = Exit.findDefect(exit)
  assert.isTrue(Result.isSuccess(result))
  if (Result.isSuccess(result)) {
    assert.strictEqual(result.success, defect)
  }
}

const assertUnknownError = <A>(exit: Exit.Exit<A, Cause.UnknownError>, cause: unknown, message: string) => {
  assert.isTrue(Exit.isFailure(exit))
  if (Exit.isFailure(exit)) {
    const result = Cause.findError(exit.cause)
    assert.isTrue(Result.isSuccess(result))
    if (Result.isSuccess(result)) {
      assert.isTrue(Cause.isUnknownError(result.success))
      assert.strictEqual((result.success as Error).cause, cause)
      assert.strictEqual(result.success.message, message)
    }
  }
}

describe("Effect", () => {
  describe("interruption before cleanup registration", () => {
    const interruptAfterContextChange = (changed: (context: Context.Context<never>) => boolean) => {
      let yielded = false
      const tasks: Array<() => void> = []
      const scheduler: Scheduler.Scheduler = {
        executionMode: "async",
        makeDispatcher: () => ({
          scheduleTask: (task) => {
            tasks.push(task)
          },
          flush() {}
        }),
        shouldYield(fiber) {
          if (!yielded && changed(fiber.context)) {
            yielded = true
            return true
          }
          return false
        }
      }
      return { scheduler, tasks, wasYielded: () => yielded }
    }

    it.effect("scoped closes its scope when interrupted after installing it", () =>
      Effect.gen(function*() {
        let finalized = 0
        let original: Context.Context<never> | undefined
        let observed: Context.Context<never> | undefined
        let innerScope: Scope.Scope | undefined
        const { scheduler, tasks, wasYielded } = interruptAfterContextChange((context) => {
          const scope = Context.getOrUndefined(context, Scope.Scope)
          if (original === undefined || scope === Context.getOrUndefined(original, Scope.Scope)) return false
          innerScope = scope
          return true
        })
        const child = yield* Effect.gen(function*() {
          original = yield* Effect.withFiber((fiber) => Effect.succeed(fiber.context))
          yield* Effect.scoped(Effect.addFinalizer(() =>
            Effect.sync(() => {
              finalized++
            })
          ))
        }).pipe(
          Effect.onExit(() =>
            Effect.withFiber((fiber) =>
              Effect.sync(() => {
                observed = fiber.context
              })
            )
          ),
          Effect.provideService(Scheduler.Scheduler, scheduler),
          Effect.forkChild({ startImmediately: true })
        )
        assert.isTrue(wasYielded())
        child.interruptUnsafe()
        while (tasks.length > 0) tasks.shift()!()
        yield* Fiber.await(child)
        assert.isDefined(innerScope)
        yield* Scope.addFinalizer(
          innerScope!,
          Effect.sync(() => {
            finalized++
          })
        )
        assert.strictEqual(finalized, 1)
        assert.strictEqual(observed, original)
      }))

    it.effect("provideService restores the original context if interrupted before its body", () =>
      Effect.gen(function*() {
        class Value extends Context.Service<Value, number>()("InterruptedValue") {}
        let original: Context.Context<never> | undefined
        let observed: Context.Context<never> | undefined
        const { scheduler, tasks, wasYielded } = interruptAfterContextChange((context) =>
          original !== undefined && Context.getOrUndefined(context, Value) === 2
        )
        const child = yield* Effect.gen(function*() {
          original = yield* Effect.withFiber((fiber) => Effect.succeed(fiber.context))
          yield* Effect.provideService(Effect.void, Value, 2)
        }).pipe(
          Effect.onExit(() =>
            Effect.withFiber((fiber) =>
              Effect.sync(() => {
                observed = fiber.context
              })
            )
          ),
          Effect.provideService(Value, 1),
          Effect.provideService(Scheduler.Scheduler, scheduler),
          Effect.forkChild({ startImmediately: true })
        )
        assert.isTrue(wasYielded())
        child.interruptUnsafe()
        while (tasks.length > 0) tasks.shift()!()
        yield* Fiber.await(child)
        assert.strictEqual(observed, original)
      }))

    for (const cacheKind of ["cached", "cachedInvalidateWithTTL"] as const) {
      it.effect(
        cacheKind + " never strands a second caller when the owner yields before registering cleanup",
        () =>
          Effect.gen(function*() {
            let interruptedBeforeSource = 0
            // Sweep each scheduler boundary after entering the cache. A fixed
            // step count can stop exercising the gap when the runtime adds an op.
            for (let target = 1; target <= 32; target++) {
              let armed = false
              let seen = 0
              let computed = 0
              const tasks: Array<() => void> = []
              const scheduler: Scheduler.Scheduler = {
                executionMode: "async",
                makeDispatcher: () => ({
                  scheduleTask: (task) => {
                    tasks.push(task)
                  },
                  flush() {}
                }),
                shouldYield() {
                  return armed && ++seen === target
                }
              }
              const source = Effect.sync(() => ++computed)
              const cached = cacheKind === "cached"
                ? yield* Effect.cached(source)
                : (yield* Effect.cachedInvalidateWithTTL(source, "1 minute"))[0]
              const owner = yield* Effect.gen(function*() {
                yield* Effect.sync(() => {
                  armed = true
                })
                yield* cached
              }).pipe(
                Effect.provideService(Scheduler.Scheduler, scheduler),
                Effect.forkChild({ startImmediately: true })
              )
              if (tasks.length === 0) continue // No boundary left before the source completed.
              owner.interruptUnsafe()
              while (tasks.length > 0) tasks.shift()!()
              yield* Fiber.await(owner)
              if (computed !== 0) continue
              interruptedBeforeSource++
              const waiter = yield* Effect.forkChild(cached, { startImmediately: true })
              yield* Effect.yieldNow
              const settled = waiter.pollUnsafe()
              if (settled === undefined) waiter.interruptUnsafe()
              assert.isDefined(settled, "cache waiter stuck after owner interruption at boundary " + target)
            }
            assert.isAbove(interruptedBeforeSource, 0, "the sweep never interrupted before the source")
          })
      )
    }
  })
  it("isEffect", () => {
    assert.isTrue(Effect.isEffect(Effect.succeed(0)))
    assert.isFalse(Effect.isEffect([0]))
  })

  describe("Effectable.Class", () => {
    it.effect("runs using asEffect", () =>
      Effect.gen(function*() {
        class Answer extends Effectable.Class<number> {
          asEffect() {
            return Effect.succeed(42)
          }
        }

        assert.strictEqual(yield* new Answer(), 42)
      }))

    it.effect("evaluates asEffect on every execution", () =>
      Effect.gen(function*() {
        class Answer extends Effectable.Class<number> {
          value = 1

          asEffect() {
            return Effect.succeed(this.value)
          }
        }

        const answer = new Answer()
        assert.strictEqual(yield* answer, 1)
        answer.value = 2
        assert.strictEqual(yield* answer, 2)
      }))
  })

  describe("structural compare", () => {
    it("should pass structural comparison", () => {
      assert.deepEqual(Effect.succeed(0), Effect.succeed(0))
    })
    it("should fail structural comparison", () => {
      assert.notDeepEqual(Effect.succeed(0), Effect.succeed(1))
    })
  })

  describe("tracing", () => {
    it("terminal root failure captures stack frame", () => {
      const frame: References.StackFrame = {
        name: "root frame",
        stack: () => undefined,
        parent: undefined
      }
      const failure = Exit.fail("boom")
      const exit = Effect.runForkWith(Context.make(References.CurrentStackFrame, frame))(failure).pollUnsafe()

      assert.isDefined(exit)
      assert.isTrue(Exit.isFailure(exit!))
      if (Exit.isFailure(exit!)) {
        const trace = Context.getOrUndefined(Cause.annotations(exit.cause), Cause.StackTrace)
        assert.strictEqual(trace, frame)
      }
    })

    it.effect("caught sandboxed failure captures stack frame", () =>
      Effect.gen(function*() {
        const cause = yield* Effect.failCause(Cause.die(new Error("boom"))).pipe(
          Effect.withSpan("test span"),
          Effect.sandbox,
          Effect.flip
        )
        const annotations = Cause.annotations(cause)
        const trace = Context.getUnsafe(annotations, Cause.StackTrace)
        assert.strictEqual(trace.name, "test span")
      }))

    it("failure without a current frame has no stack annotation and reuses the original exit", () => {
      const failure = Exit.fail("boom")
      const exit = Effect.runFork(failure).pollUnsafe()

      assert.strictEqual(exit, failure)
      assert.isTrue(Exit.isFailure(exit!))
      if (Exit.isFailure(exit!)) {
        assert.isUndefined(Context.getOrUndefined(Cause.annotations(exit.cause), Cause.StackTrace))
      }
    })
  })

  it("callback can branch over sync/async", async () => {
    const program = Effect.callback<number>(function(resume) {
      if (this.executionMode === "sync") {
        resume(Effect.succeed(1))
      } else {
        Promise.resolve().then(() => resume(Effect.succeed(2)))
      }
    })

    const isSync = Effect.runSync(program)
    const isAsync = await Effect.runPromise(program)

    assert.strictEqual(isSync, 1)
    assert.strictEqual(isAsync, 2)
  })

  it("runPromise", async () => {
    const result = await Effect.runPromise(Effect.succeed(1))
    assert.strictEqual(result, 1)
  })

  it("acquireUseRelease interrupt", async () => {
    let acquire = false
    let use = false
    let release = false
    const fiber = Effect.acquireUseRelease(
      Effect.sync(() => {
        acquire = true
        return 123
      }).pipe(Effect.delay(100)),
      () =>
        Effect.sync(() => {
          use = true
        }),
      (_) =>
        Effect.sync(() => {
          assert.strictEqual(_, 123)
          release = true
        })
    ).pipe(Effect.runFork)
    fiber.interruptUnsafe()
    const result = await Effect.runPromise(Fiber.await(fiber))
    assert.deepStrictEqual(result, Exit.failCause(Cause.interrupt()))
    assert.isTrue(acquire)
    assert.isFalse(use)
    assert.isTrue(release)
  })

  it.effect("acquireUseRelease runs release when use throws", () =>
    Effect.gen(function*() {
      const resource = { id: 1 }
      const defect = new Error("boom")
      let releases = 0
      let releasedResource: typeof resource | undefined
      let releaseExit: Exit.Exit<never> | undefined

      const exit = yield* Effect.acquireUseRelease(
        Effect.succeed(resource),
        (): Effect.Effect<never> => {
          throw defect
        },
        (resource, exit) =>
          Effect.sync(() => {
            releases++
            releasedResource = resource
            releaseExit = exit
          })
      ).pipe(Effect.exit)

      assertExitDefect(exit, defect)
      assert.strictEqual(releases, 1)
      assert.strictEqual(releasedResource, resource)
      assert.isDefined(releaseExit)
      assertExitDefect(releaseExit, defect)
    }))

  it("acquireUseRelease uninterruptible", async () => {
    let acquire = false
    let use = false
    let release = false
    const fiber = Effect.acquireUseRelease(
      Effect.sync(() => {
        acquire = true
        return 123
      }).pipe(Effect.delay(100)),
      (_) =>
        Effect.sync(() => {
          use = true
          return _
        }),
      (_) =>
        Effect.sync(() => {
          assert.strictEqual(_, 123)
          release = true
        })
    ).pipe(Effect.uninterruptible, Effect.runFork)
    fiber.interruptUnsafe()
    const result = await Effect.runPromise(Fiber.await(fiber))
    assert.deepStrictEqual(result, Exit.failCause(Cause.interrupt()))
    assert.isTrue(acquire)
    assert.isTrue(use)
    assert.isTrue(release)
  })

  it.effect("Context.Service", () =>
    ATag.pipe(
      Effect.tap((_) => Effect.sync(() => assert.strictEqual(_, "A"))),
      Effect.provideService(ATag, "A")
    ))

  describe("fromOption", () => {
    it.effect("from a some", () =>
      Option.some("A").pipe(
        Effect.fromOption,
        Effect.tap((_) => Effect.sync(() => assert.strictEqual(_, "A")))
      ))

    it.effect("from a none", () =>
      Option.none().pipe(
        Effect.fromOption,
        Effect.flip,
        Effect.tap((error) => Effect.sync(() => assert.ok(error instanceof Cause.NoSuchElementError)))
      ))

    it.effect("from a none with a custom error", () =>
      Effect.gen(function*() {
        const error = new Error("Missing value")
        const cause = yield* Effect.fromOption(Option.none(), () => error).pipe(Effect.flip)
        assert.strictEqual(cause, error)
      }))

    it.effect("from a none with a custom error data-last", () =>
      Effect.gen(function*() {
        const error = new Error("Missing value")
        const cause = yield* Option.none().pipe(
          Effect.fromOption(() => error),
          Effect.flip
        )
        assert.strictEqual(cause, error)
      }))
  })

  describe("transposeOption", () => {
    it.effect("transposes a none", () =>
      Effect.gen(function*() {
        const result = yield* Effect.transposeOption(Option.none())
        assert.deepStrictEqual(result, Option.none())
      }))

    it.effect("transposes a some containing a success", () =>
      Effect.gen(function*() {
        const result = yield* Effect.transposeOption(Option.some(Effect.succeed("A")))
        assert.deepStrictEqual(result, Option.some("A"))
      }))

    it.effect("transposes a some containing a failure", () =>
      Effect.gen(function*() {
        const error = yield* Effect.transposeOption(Option.some(Effect.fail("error"))).pipe(Effect.flip)
        assert.strictEqual(error, "error")
      }))
  })

  describe("fromResult", () => {
    it.effect("from a success", () =>
      Result.succeed("A").pipe(
        Effect.fromResult,
        Effect.tap((_) => Effect.sync(() => assert.strictEqual(_, "A")))
      ))

    it.effect("from a failure", () =>
      Result.fail("error").pipe(
        Effect.fromResult,
        Effect.flip,
        Effect.tap((error) => Effect.sync(() => assert.strictEqual(error, "error")))
      ))
  })

  describe("try", () => {
    it.effect("succeeds with the returned value in direct-thunk form", () =>
      Effect.gen(function*() {
        const result = yield* Effect.try(() => 1)
        assert.strictEqual(result, 1)
      }))

    it.effect("maps thrown values to UnknownError in direct-thunk form", () =>
      Effect.gen(function*() {
        const thrown = new Error("try")
        const exit = yield* Effect.try<number>(() => {
          throw thrown
        }).pipe(Effect.exit)
        assertUnknownError(exit, thrown, "An error occurred in Effect.try")
      }))

    it.effect("succeeds with the returned value", () =>
      Effect.gen(function*() {
        let catchCalled = false
        const result = yield* Effect.try({
          try: () => 1,
          catch: () => {
            catchCalled = true
            return "error" as const
          }
        })
        assert.strictEqual(result, 1)
        assert.isFalse(catchCalled)
      }))

    it.effect("maps thrown values into typed failures", () =>
      Effect.gen(function*() {
        const thrown = new Error("try")
        const mapped = { cause: thrown }
        const exit = yield* Effect.try({
          try: () => {
            throw thrown
          },
          catch: () => mapped
        }).pipe(Effect.exit)
        assertExitFailure(exit, Cause.fail(mapped))
      }))

    it.effect("turns a throwing catch mapper into a defect", () =>
      Effect.gen(function*() {
        const thrown = new Error("try")
        const defect = new Error("catch")
        const exit = yield* Effect.try({
          try: () => {
            throw thrown
          },
          catch: () => {
            throw defect
          }
        }).pipe(Effect.exit)
        assertExitDefect(exit, defect)
      }))
  })

  describe("tryPromise", () => {
    it.effect("succeeds with the resolved value in direct-thunk form", () =>
      Effect.gen(function*() {
        const result = yield* Effect.tryPromise(() => Promise.resolve(1))
        assert.strictEqual(result, 1)
      }))

    it.effect("does not allocate AbortController for zero-argument thunks", () =>
      Effect.gen(function*() {
        const originalAbortController = globalThis.AbortController
        let allocations = 0
        class TestAbortController extends originalAbortController {
          constructor() {
            allocations += 1
            super()
          }
        }

        yield* Effect.acquireUseRelease(
          Effect.sync(() => {
            globalThis.AbortController = TestAbortController
          }),
          () =>
            Effect.gen(function*() {
              const direct = yield* Effect.tryPromise(() => Promise.resolve(1))
              const options = yield* Effect.tryPromise({
                try: () => Promise.resolve(2),
                catch: () => "error" as const
              })
              assert.strictEqual(direct, 1)
              assert.strictEqual(options, 2)
              assert.strictEqual(allocations, 0)
            }),
          () =>
            Effect.sync(() => {
              globalThis.AbortController = originalAbortController
            })
        )
      }))

    it.effect("maps synchronous throws to UnknownError in direct-thunk form", () =>
      Effect.gen(function*() {
        const thrown = new Error("try")
        const exit = yield* Effect.tryPromise<number>(() => {
          throw thrown
        }).pipe(Effect.exit)
        assertUnknownError(exit, thrown, "An error occurred in Effect.tryPromise")
      }))

    it.effect("maps promise rejections to UnknownError in direct-thunk form", () =>
      Effect.gen(function*() {
        const rejected = new Error("reject")
        const exit = yield* Effect.tryPromise<number>(() => Promise.reject(rejected)).pipe(Effect.exit)
        assertUnknownError(exit, rejected, "An error occurred in Effect.tryPromise")
      }))

    it.effect("succeeds with the resolved value in options form", () =>
      Effect.gen(function*() {
        let catchCalled = false
        const result = yield* Effect.tryPromise({
          try: () => Promise.resolve(1),
          catch: () => {
            catchCalled = true
            return "error" as const
          }
        })
        assert.strictEqual(result, 1)
        assert.isFalse(catchCalled)
      }))

    it.effect("maps synchronous throws with catch in options form", () =>
      Effect.gen(function*() {
        const thrown = new Error("try")
        const mapped = { cause: thrown }
        const exit = yield* Effect.tryPromise({
          try: () => {
            throw thrown
          },
          catch: () => mapped
        }).pipe(Effect.exit)
        assertExitFailure(exit, Cause.fail(mapped))
      }))

    it.effect("maps promise rejections with catch in options form", () =>
      Effect.gen(function*() {
        const rejected = new Error("reject")
        const mapped = { cause: rejected }
        const exit = yield* Effect.tryPromise({
          try: () => Promise.reject(rejected),
          catch: () => mapped
        }).pipe(Effect.exit)
        assertExitFailure(exit, Cause.fail(mapped))
      }))

    it.effect("turns a throwing catch mapper for a synchronous throw into a defect", () =>
      Effect.gen(function*() {
        const thrown = new Error("try")
        const defect = new Error("catch")
        const exit = yield* Effect.tryPromise({
          try: () => {
            throw thrown
          },
          catch: () => {
            throw defect
          }
        }).pipe(Effect.exit)
        assertExitDefect(exit, defect)
      }))

    it.effect("turns a throwing catch mapper for a promise rejection into a defect", () =>
      Effect.gen(function*() {
        const rejected = new Error("reject")
        const defect = new Error("catch")
        const exit = yield* Effect.tryPromise({
          try: () => Promise.reject(rejected),
          catch: () => {
            throw defect
          }
        }).pipe(Effect.exit)
        assertExitDefect(exit, defect)
      }))

    it.effect("aborts the provided AbortSignal on interruption", () =>
      Effect.gen(function*() {
        let signal: AbortSignal | undefined
        const fiber = yield* Effect.tryPromise((signal_) => {
          signal = signal_
          return new Promise<never>(() => {})
        }).pipe(Effect.forkChild({ startImmediately: true }))
        yield* Fiber.interrupt(fiber)
        assert.strictEqual(signal?.aborted, true)
      }))
  })

  describe("gen", () => {
    it("gen", () =>
      Effect.gen(function*() {
        const result = yield* Effect.succeed(1)
        assert.strictEqual(result, 1)
        return result
      }).pipe(Effect.runPromise).then((_) => assert.deepStrictEqual(_, 1)))

    it("gen with context", () =>
      Effect.gen({ self: { a: 1, b: 2 } }, function*() {
        const result = yield* Effect.succeed(this.a)
        assert.strictEqual(result, 1)
        return result + this.b
      }).pipe(Effect.runPromise).then((_) => assert.deepStrictEqual(_, 3)))

    it("iterator yields the effect once, then completes with the sent value", () => {
      const effect = Effect.succeed(1)
      const iterator = effect[Symbol.iterator]()
      const yielded = iterator.next()
      const returned = iterator.next(2)
      assert.deepStrictEqual({ ...yielded }, { value: effect, done: false })
      assert.deepStrictEqual({ ...returned }, { value: 2, done: true })
      assert.deepStrictEqual({ ...iterator.next(3) }, { value: 3, done: true })
    })
  })

  describe("forEach", () => {
    it.effect("sequential", () =>
      Effect.gen(function*() {
        const results = yield* Effect.forEach([1, 2, 3], (_) => Effect.succeed(_))
        assert.deepStrictEqual(results, [1, 2, 3])
      }))

    it.effect("unbounded", () =>
      Effect.gen(function*() {
        const results = yield* Effect.forEach([1, 2, 3], (_) => Effect.succeed(_), { concurrency: "unbounded" })
        assert.deepStrictEqual(results, [1, 2, 3])
      }))

    it.effect("bounded", () =>
      Effect.gen(function*() {
        const results = yield* Effect.forEach([1, 2, 3, 4, 5], (_) => Effect.succeed(_), { concurrency: 2 })
        assert.deepStrictEqual(results, [1, 2, 3, 4, 5])
      }))

    it.effect("sequential interrupt", () =>
      Effect.gen(function*() {
        const done: Array<number> = []
        const fiber = yield* Effect.forEach([1, 2, 3, 4, 5, 6], (i) =>
          Effect.sync(() => {
            done.push(i)
            return i
          }).pipe(Effect.delay(300))).pipe(Effect.forkChild)
        yield* TestClock.adjust(800)
        yield* Fiber.interrupt(fiber)
        const result = yield* Fiber.await(fiber)
        assert.isTrue(Exit.hasInterrupts(result))
        assert.deepStrictEqual(done, [1, 2])
      }))

    it.effect("unbounded interrupt", () =>
      Effect.gen(function*() {
        const done: Array<number> = []
        const fiber = yield* Effect.forEach([1, 2, 3], (i) =>
          Effect.sync(() => {
            done.push(i)
            return i
          }).pipe(Effect.delay(150)), { concurrency: "unbounded" }).pipe(Effect.forkChild)
        yield* TestClock.adjust(50)
        yield* Fiber.interrupt(fiber)
        const result = yield* Fiber.await(fiber)
        assert.isTrue(Exit.hasInterrupts(result))
        assert.deepStrictEqual(done, [])
      }))

    it.effect("bounded interrupt", () =>
      Effect.gen(function*() {
        const done: Array<number> = []
        const fiber = yield* Effect.forEach([1, 2, 3, 4, 5, 6], (i) =>
          Effect.sync(() => {
            done.push(i)
            return i
          }).pipe(Effect.delay(200)), { concurrency: 2 }).pipe(Effect.forkChild)
        yield* TestClock.adjust(350)
        yield* Fiber.interrupt(fiber)
        const result = yield* Fiber.await(fiber)
        assert.isTrue(Exit.hasInterrupts(result))
        assert.deepStrictEqual(done, [1, 2])
      }))

    it.effect("preserves interruption when a child cleanup dies", () =>
      Effect.gen(function*() {
        const started = yield* Deferred.make<void>()
        const defect = new Error("cleanup defect")
        const fiber = yield* Effect.forEach([0, 1], (i) =>
          i === 0
            ? Deferred.succeed(started, void 0).pipe(
              Effect.andThen(Effect.callback<void>(() => Effect.die(defect)))
            )
            : Effect.never, { concurrency: 2 }).pipe(Effect.forkChild({ startImmediately: true }))

        yield* Deferred.await(started)
        yield* Fiber.interrupt(fiber)
        const exit = yield* Fiber.await(fiber)
        assert.isTrue(Exit.hasInterrupts(exit))
        assertExitDefect(exit, defect)
      }))

    it.effect("preserves a recorded sibling failure on external interruption", () =>
      Effect.gen(function*() {
        const started = yield* Deferred.make<void>()
        const cleanupStarted = yield* Deferred.make<void>()
        const releaseCleanup = yield* Deferred.make<void>()
        const fiber = yield* Effect.forEach([0, 1], (i) =>
          i === 0
            ? Deferred.succeed(started, void 0).pipe(
              Effect.andThen(Effect.never),
              Effect.onInterrupt(() =>
                Deferred.succeed(cleanupStarted, void 0).pipe(
                  Effect.andThen(Deferred.await(releaseCleanup))
                )
              )
            )
            : Deferred.await(started).pipe(Effect.andThen(Effect.fail("sibling failure"))), {
          concurrency: 2
        }).pipe(Effect.forkChild({ startImmediately: true }))

        yield* Deferred.await(cleanupStarted)
        fiber.interruptUnsafe()
        yield* Deferred.succeed(releaseCleanup, void 0)
        const exit = yield* Fiber.await(fiber)
        assert.isTrue(Exit.hasInterrupts(exit))
        assert.isTrue(Exit.isFailure(exit))
        if (Exit.isFailure(exit)) {
          assert.deepStrictEqual(Cause.findError(exit.cause), Result.succeed("sibling failure"))
        }
      }))

    it.effect("unbounded fail", () =>
      Effect.gen(function*() {
        const done: Array<number> = []
        const handle = yield* Effect.forEach([1, 2, 3, 4, 5], (i) =>
          Effect.suspend(() => {
            done.push(i)
            return i === 3 ? Effect.fail("error") : Effect.succeed(i)
          }).pipe(Effect.delay(i * 100)), {
          concurrency: "unbounded"
        }).pipe(Effect.forkChild)
        yield* TestClock.adjust(500)
        const result = yield* Fiber.await(handle)
        assert.deepStrictEqual(result, Exit.fail("error"))
        assert.deepStrictEqual(done, [1, 2, 3])
      }))

    it.effect("interrupts started workers when the mapper throws during initial pumping", () =>
      Effect.gen(function*() {
        const interruptStarted = yield* Deferred.make<void>()
        const interruptFinished = yield* Deferred.make<void>()
        const defect = new Error("mapper defect")
        const fiber = yield* Effect.forEach([0, 1], (i) => {
          if (i === 0) {
            return Effect.never.pipe(
              Effect.onInterrupt(() =>
                Deferred.succeed(interruptStarted, void 0).pipe(
                  Effect.andThen(Deferred.await(interruptFinished))
                )
              )
            )
          }
          throw defect
        }, { concurrency: 2 }).pipe(Effect.forkChild({ startImmediately: true }))

        assert.isTrue(yield* Deferred.isDone(interruptStarted))
        assert.isUndefined(fiber.pollUnsafe())
        yield* Deferred.succeed(interruptFinished, void 0)
        const exit = fiber.pollUnsafe()
        assert.isDefined(exit)
        assertExitDefect(exit!, defect)
      }))

    it.effect("preserves a sibling cleanup defect when the mapper throws", () =>
      Effect.gen(function*() {
        const mapperDefect = new Error("mapper defect")
        const cleanupDefect = new Error("cleanup defect")
        let cleanedUp = false
        const exit = yield* Effect.forEach([0, 1], (i) => {
          if (i === 0) {
            return Effect.callback<void>(() =>
              Effect.sync(() => {
                cleanedUp = true
                throw cleanupDefect
              })
            )
          }
          throw mapperDefect
        }, { concurrency: 2 }).pipe(Effect.exit)

        assert.isTrue(cleanedUp)
        assert.isTrue(Exit.isFailure(exit))
        if (Exit.isFailure(exit)) {
          assert.deepStrictEqual(
            exit.cause.reasons.filter(Cause.isDieReason).map((reason) => reason.defect),
            [mapperDefect, cleanupDefect]
          )
        }
      }))

    it.effect("interrupts started workers when observer-driven refill throws", () =>
      Effect.gen(function*() {
        const release = yield* Deferred.make<void>()
        const interruptStarted = yield* Deferred.make<void>()
        const interruptFinished = yield* Deferred.make<void>()
        const defect = new Error("refill defect")
        const fiber = yield* Effect.forEach([0, 1, 2], (i) => {
          if (i === 0) return Deferred.await(release)
          if (i === 1) {
            return Effect.never.pipe(
              Effect.onInterrupt(() =>
                Deferred.succeed(interruptStarted, void 0).pipe(
                  Effect.andThen(Deferred.await(interruptFinished))
                )
              )
            )
          }
          throw defect
        }, { concurrency: 2 }).pipe(Effect.forkChild({ startImmediately: true }))

        assert.isUndefined(fiber.pollUnsafe())
        yield* Deferred.succeed(release, void 0)
        assert.isTrue(yield* Deferred.isDone(interruptStarted))
        assert.isUndefined(fiber.pollUnsafe())
        yield* Deferred.succeed(interruptFinished, void 0)
        const exit = fiber.pollUnsafe()
        assert.isDefined(exit)
        assertExitDefect(exit!, defect)
      }))

    it.effect("length = 0", () =>
      Effect.gen(function*() {
        const results = yield* Effect.forEach([], (_) => Effect.succeed(_))
        assert.deepStrictEqual(results, [])
      }))

    it.effect("string", () =>
      Effect.gen(function*() {
        const results = yield* Effect.forEach("abc", (_) => Effect.succeed(_))
        assert.deepStrictEqual(results, ["a", "b", "c"])
      }))
  })

  describe("head", () => {
    it.effect("returns the first element", () =>
      Effect.gen(function*() {
        const result = yield* Effect.head(Effect.succeed([1, 2, 3]))
        assert.strictEqual(result, 1)
      }))

    it.effect("fails with NoSuchElementError for an empty iterable", () =>
      Effect.gen(function*() {
        const error = yield* Effect.head(Effect.succeed([] as Array<number>)).pipe(Effect.flip)
        assert.isTrue(Cause.isNoSuchElementError(error))
      }))

    it.effect("preserves the source failure", () =>
      Effect.gen(function*() {
        const source: Effect.Effect<Iterable<number>, "failure"> = Effect.fail("failure")
        const error = yield* Effect.head(source).pipe(Effect.flip)
        assert.strictEqual(error, "failure")
      }))
  })

  describe("all", () => {
    it.effect("tuple", () =>
      Effect.gen(function*() {
        const results = (yield* Effect.all([
          Effect.succeed(1),
          Effect.succeed(2),
          Effect.succeed(3)
        ])) satisfies [
          number,
          number,
          number
        ]
        assert.deepStrictEqual(results, [1, 2, 3])
      }))

    it.effect("record", () =>
      Effect.gen(function*() {
        const results = (yield* Effect.all({
          a: Effect.succeed(1),
          b: Effect.succeed("2"),
          c: Effect.succeed(true)
        })) satisfies {
          a: number
          b: string
          c: boolean
        }
        assert.deepStrictEqual(results, {
          a: 1,
          b: "2",
          c: true
        })
      }))

    it.effect("record discard", () =>
      Effect.gen(function*() {
        const results = (yield* Effect.all({
          a: Effect.succeed(1),
          b: Effect.succeed("2"),
          c: Effect.succeed(true)
        }, { discard: true })) satisfies void
        assert.deepStrictEqual(results, void 0)
      }))

    it.effect("iterable", () =>
      Effect.gen(function*() {
        const results = (yield* Effect.all(
          new Set([
            Effect.succeed(1),
            Effect.succeed(2),
            Effect.succeed(3)
          ])
        )) satisfies Array<number>
        assert.deepStrictEqual(results, [1, 2, 3])
      }))

    it.effect("tuple result mode", () =>
      Effect.gen(function*() {
        const executed: Array<number> = []
        const results = (yield* Effect.all(
          [
            Effect.sync(() => {
              executed.push(1)
              return 1
            }),
            Effect.sync(() => {
              executed.push(2)
            }).pipe(Effect.andThen(Effect.fail("boom"))),
            Effect.sync(() => {
              executed.push(3)
              return 3
            })
          ] as const,
          { mode: "result" }
        )) satisfies [
          Result.Result<number, never>,
          Result.Result<never, string>,
          Result.Result<number, never>
        ]
        assert.deepStrictEqual(executed, [1, 2, 3])
        assert.deepStrictEqual(results, [
          Result.succeed(1),
          Result.fail("boom"),
          Result.succeed(3)
        ])
      }))

    it.effect("record result mode", () =>
      Effect.gen(function*() {
        const results = (yield* Effect.all({
          a: Effect.succeed(1),
          b: Effect.fail("boom"),
          c: Effect.succeed(true)
        }, { mode: "result" })) satisfies {
          a: Result.Result<number, never>
          b: Result.Result<never, string>
          c: Result.Result<boolean, never>
        }
        assert.deepStrictEqual(results, {
          a: Result.succeed(1),
          b: Result.fail("boom"),
          c: Result.succeed(true)
        })
      }))

    it.effect("concurrency interrupts started siblings on failure", () =>
      Effect.gen(function*() {
        const started: Array<number> = []
        const interrupted: Array<number> = []
        const make = (i: number) =>
          Effect.suspend(() => {
            started.push(i)
            return Effect.sleep(500)
          }).pipe(
            Effect.as(i),
            Effect.onInterrupt(() =>
              Effect.sync(() => {
                interrupted.push(i)
              })
            )
          )
        const fiber = yield* Effect.all([
          make(1),
          Effect.fail("boom").pipe(Effect.delay(100)),
          make(3),
          make(4)
        ], { concurrency: 3 }).pipe(Effect.forkChild)
        yield* TestClock.adjust(100)
        const result = yield* Fiber.await(fiber)
        assert.deepStrictEqual(result, Exit.fail("boom"))
        assert.deepStrictEqual(started, [1, 3])
        assert.deepStrictEqual(interrupted, [1, 3])
      }))
  })

  describe("partition", () => {
    it.effect("collects only successes", () =>
      Effect.gen(function*() {
        const values = [0, 1, 2, 3, 4]
        const [passes, fails] = yield* Effect.partition(values, Effect.succeed)
        assert.deepStrictEqual(passes, values)
        assert.deepStrictEqual(fails, [])
      }))

    it.effect("collects only failures", () =>
      Effect.gen(function*() {
        const values = [0, 1, 2, 3, 4]
        const [passes, fails] = yield* Effect.partition(values, Effect.fail)
        assert.deepStrictEqual(passes, [])
        assert.deepStrictEqual(fails, values)
      }))

    it.effect("collects successes and failures", () =>
      Effect.gen(function*() {
        const values = [0, 1, 2, 3, 4, 5]
        const [passes, fails] = yield* Effect.partition(values, (n) => n % 2 === 0 ? Effect.fail(n) : Effect.succeed(n))
        assert.deepStrictEqual(passes, [1, 3, 5])
        assert.deepStrictEqual(fails, [0, 2, 4])
      }))

    it.effect("supports concurrency option", () =>
      Effect.gen(function*() {
        const values = [0, 1, 2, 3, 4, 5]
        const [passes, fails] = yield* Effect.partition(
          values,
          (n) => n % 2 === 0 ? Effect.fail(n) : Effect.succeed(n),
          { concurrency: "unbounded" }
        )
        assert.deepStrictEqual(passes, [1, 3, 5])
        assert.deepStrictEqual(fails, [0, 2, 4])
      }))
  })

  describe("reduce", () => {
    it.effect("runs sequentially from left to right and passes the index", () =>
      Effect.gen(function*() {
        const visited: Array<string> = []
        const result = yield* Effect.reduce([1, 2, 3, 4, 5], () => 0, (acc, value, index) =>
          Effect.sync(() => {
            visited.push(`${index}:${value}`)
            return acc + value
          }))

        assert.strictEqual(result, 15)
        assert.deepStrictEqual(visited, ["0:1", "1:2", "2:3", "3:4", "4:5"])
      }))

    it.effect("stops at the first failure", () =>
      Effect.gen(function*() {
        const visited: Array<number> = []
        const result = yield* pipe(
          [1, 2, 3, 4, 5],
          Effect.reduce(() => 0, (acc, value) =>
            Effect.sync(() => visited.push(value)).pipe(
              Effect.andThen(value === 3 ? Effect.fail("fail") : Effect.succeed(acc + value))
            )),
          Effect.exit
        )

        assert.deepStrictEqual(result, Exit.fail("fail"))
        assert.deepStrictEqual(visited, [1, 2, 3])
      }))

    it.effect("returns zero for an empty iterable", () =>
      Effect.gen(function*() {
        const result = yield* Effect.reduce([], () => 42, (acc, value: number) => Effect.succeed(acc + value))
        assert.strictEqual(result, 42)
      }))

    it.effect("evaluates zero lazily for each run", () =>
      Effect.gen(function*() {
        let evaluations = 0
        const reduced = Effect.reduce([1], () => {
          evaluations++
          return [] as Array<number>
        }, (acc, value) => Effect.succeed([...acc, value]))

        assert.strictEqual(evaluations, 0)
        assert.deepStrictEqual(yield* reduced, [1])
        assert.deepStrictEqual(yield* reduced, [1])
        assert.strictEqual(evaluations, 2)
      }))
  })

  describe("validate", () => {
    it.effect("collects successes when all effects succeed", () =>
      Effect.gen(function*() {
        const values = [0, 1, 2, 3, 4]
        const satisfying = yield* Effect.validate(values, Effect.succeed)
        assert.deepStrictEqual(satisfying, values)
      }))

    it.effect("accumulates all failures", () =>
      Effect.gen(function*() {
        const values = [0, 1, 2, 3, 4, 5]
        const errors = yield* Effect.validate(values, (n) => n % 2 === 0 ? Effect.fail(n) : Effect.succeed(n)).pipe(
          Effect.flip
        )
        assert.deepStrictEqual(errors, [0, 2, 4])
      }))

    it.effect("supports discard option", () =>
      Effect.gen(function*() {
        const result = yield* Effect.validate([1, 2, 3], Effect.succeed, { discard: true })
        assert.strictEqual(result, undefined)
      }))
  })

  describe("findFirst", () => {
    it.effect("returns first matching element", () =>
      Effect.gen(function*() {
        const result = yield* Effect.findFirst([1, 2, 3, 4], (n) => Effect.succeed(n > 2))
        assert.deepStrictEqual(result, Option.some(3))
      }))

    it.effect("returns none when no element matches", () =>
      Effect.gen(function*() {
        const result = yield* Effect.findFirst([1, 2, 3, 4], (n) => Effect.succeed(n > 10))
        assert.deepStrictEqual(result, Option.none())
      }))

    it.effect("short-circuits on first match", () =>
      Effect.gen(function*() {
        const seen: Array<number> = []
        const result = yield* Effect.findFirst([1, 2, 3, 4], (n) =>
          Effect.sync(() => {
            seen.push(n)
            return n > 2
          }))
        assert.deepStrictEqual(result, Option.some(3))
        assert.deepStrictEqual(seen, [1, 2, 3])
      }))
  })

  describe("findFirstFilter", () => {
    it.effect("returns first successful transformed value", () =>
      Effect.gen(function*() {
        const result = yield* Effect.findFirstFilter([1, 2, 3, 4], (n) =>
          Effect.succeed(n % 2 === 0 ? Result.succeed(`n=${n}`) : Result.failVoid))
        assert.deepStrictEqual(result, Option.some("n=2"))
      }))

    it.effect("passes index to filter", () =>
      Effect.gen(function*() {
        const result = yield* Effect.findFirstFilter([10, 11, 12], (n, i) =>
          Effect.succeed(i === 2 ? Result.succeed(`${n}:${i}`) : Result.failVoid))
        assert.deepStrictEqual(result, Option.some("12:2"))
      }))

    it.effect("returns none when filter never succeeds", () =>
      Effect.gen(function*() {
        const result = yield* Effect.findFirstFilter([1, 2, 3], () => Effect.succeed(Result.failVoid))
        assert.deepStrictEqual(result, Option.none())
      }))
  })

  describe("filter", () => {
    it.live("odd numbers", () =>
      Effect.gen(function*() {
        const results = yield* Effect.filter([1, 2, 3, 4, 5], (value) => Effect.succeed(value % 2 === 1))
        assert.deepStrictEqual(results, [1, 3, 5])
      }))

    it.live("iterable", () =>
      Effect.gen(function*() {
        const results = yield* Effect.filter(new Set([1, 2, 3, 4, 5]), (value) => Effect.succeed(value % 2 === 1))
        assert.deepStrictEqual(results, [1, 3, 5])
      }))
  })

  describe("acquireDisposable", () => {
    it.effect("releases disposables", ({ expect }) =>
      Effect.gen(function*() {
        const acquire = Effect.sync((): Disposable => ({ [Symbol.dispose]: release }))
        const release = vi.fn(() => void 0)

        yield* Effect.scoped(Effect.acquireDisposable(acquire))
        expect(release).toHaveBeenCalledTimes(1)
      }))

    it.effect("releases async disposables", ({ expect }) =>
      Effect.gen(function*() {
        const acquire = Effect.sync((): AsyncDisposable => ({ [Symbol.asyncDispose]: release }))
        const release = vi.fn(async () => void 0)

        yield* Effect.scoped(Effect.acquireDisposable(acquire))
        expect(release).toHaveBeenCalledTimes(1)
      }))
  })

  describe("acquireRelease", () => {
    it.live("releases on interrupt", () =>
      Effect.gen(function*() {
        let release = false
        const fiber = yield* Effect.acquireRelease(
          Effect.delay(Effect.succeed("foo"), 100),
          () =>
            Effect.sync(() => {
              release = true
            })
        ).pipe(
          Effect.scoped,
          Effect.forkChild({ startImmediately: true })
        )
        fiber.interruptUnsafe()
        yield* Fiber.await(fiber)
        assert.strictEqual(release, true)
      }))

    it.effect("supports release dependencies", () =>
      Effect.gen(function*() {
        let release = false
        const scope = yield* Scope.make()
        yield* Scope.provide(scope)(
          Effect.provideService(
            Effect.acquireRelease(
              Effect.succeed("foo"),
              () =>
                Effect.flatMap(Effect.service(ATag), () =>
                  Effect.sync(() => {
                    release = true
                  }))
            ),
            ATag,
            "A"
          )
        )
        yield* Scope.close(scope, Exit.void)
        assert.strictEqual(release, true)
      }))
  })

  it.effect("raceAll", () =>
    Effect.gen(function*() {
      const interrupted: Array<number> = []
      const fiber = yield* Effect.raceAll([500, 300, 200, 0, 100].map((ms) =>
        (ms === 0 ? Effect.fail("boom") : Effect.succeed(ms)).pipe(
          Effect.delay(ms),
          Effect.onInterrupt(() =>
            Effect.sync(() => {
              interrupted.push(ms)
            })
          )
        )
      )).pipe(Effect.forkChild)
      yield* TestClock.adjust("500 millis")
      const result = yield* Fiber.join(fiber)
      assert.strictEqual(result, 100)
      assert.deepStrictEqual(interrupted, [500, 300, 200])
    }))

  it.effect("raceAllFirst", () =>
    Effect.gen(function*() {
      const interrupted: Array<number> = []
      const fiber = yield* Effect.raceAllFirst([500, 300, 200, 0, 100].map((ms) =>
        (ms === 0 ? Effect.fail("boom") : Effect.succeed(ms)).pipe(
          Effect.delay(ms),
          Effect.onInterrupt(() =>
            Effect.sync(() => {
              interrupted.push(ms)
            })
          )
        )
      )).pipe(Effect.exit, Effect.forkChild)
      yield* TestClock.adjust("500 millis")
      const result = yield* Fiber.join(fiber)
      assert.deepStrictEqual(result, Exit.fail("boom"))
      // 100 doesn't start because 0 finishes the race first
      assert.deepStrictEqual(interrupted, [500, 300, 200])
    }))

  it.effect("race interrupts the loser when the other side succeeds", () =>
    Effect.gen(function*() {
      const interrupted: Array<string> = []
      const onInterrupt = (label: string) =>
        Effect.onInterrupt(() =>
          Effect.sync(() => {
            interrupted.push(label)
          })
        )
      const fiber = yield* Effect.race(
        Effect.succeed("fast").pipe(Effect.delay(100), onInterrupt("fast")),
        Effect.succeed("slow").pipe(Effect.delay(500), onInterrupt("slow"))
      ).pipe(Effect.forkChild)
      yield* TestClock.adjust("500 millis")
      const result = yield* Fiber.join(fiber)
      assert.strictEqual(result, "fast")
      assert.deepStrictEqual(interrupted, ["slow"])
    }))

  it.effect("raceFirst interrupts the loser when the other side succeeds", () =>
    Effect.gen(function*() {
      const interrupted: Array<string> = []
      const onInterrupt = (label: string) =>
        Effect.onInterrupt(() =>
          Effect.sync(() => {
            interrupted.push(label)
          })
        )
      const fiber = yield* Effect.raceFirst(
        Effect.succeed("fast").pipe(Effect.delay(100), onInterrupt("fast")),
        Effect.succeed("slow").pipe(Effect.delay(500), onInterrupt("slow"))
      ).pipe(Effect.forkChild)
      yield* TestClock.adjust("500 millis")
      const result = yield* Fiber.join(fiber)
      assert.strictEqual(result, "fast")
      assert.deepStrictEqual(interrupted, ["slow"])
    }))

  it.effect("raceFirst interrupts the loser when the other side fails", () =>
    Effect.gen(function*() {
      const interrupted: Array<string> = []
      const fiber = yield* Effect.raceFirst(
        Effect.fail("boom").pipe(Effect.delay(100)),
        Effect.succeed("slow").pipe(
          Effect.delay(500),
          Effect.onInterrupt(() =>
            Effect.sync(() => {
              interrupted.push("slow")
            })
          )
        )
      ).pipe(Effect.exit, Effect.forkChild)
      yield* TestClock.adjust("500 millis")
      const result = yield* Fiber.join(fiber)
      assert.deepStrictEqual(result, Exit.fail("boom"))
      assert.deepStrictEqual(interrupted, ["slow"])
    }))

  for (const [name, race] of [["race", Effect.race], ["raceFirst", Effect.raceFirst]] as const) {
    it.effect(`${name} interrupts a loser that settles the race while starting`, () =>
      Effect.gen(function*() {
        let interrupted = false
        const deferred = yield* Deferred.make<void>()
        yield* race(
          Deferred.await(deferred),
          Deferred.succeed(deferred, void 0).pipe(
            Effect.andThen(Effect.never),
            Effect.onInterrupt(() =>
              Effect.sync(() => {
                interrupted = true
              })
            )
          )
        )
        assert.isTrue(interrupted)
      }))

    it.effect(`${name} interrupts the loser when interrupted while starting`, () =>
      Effect.gen(function*() {
        let interrupted = false
        const fiber = yield* Effect.withFiber((parent) =>
          race(
            Effect.sync(() => parent.interruptUnsafe()).pipe(
              Effect.andThen(Effect.never),
              Effect.onInterrupt(() =>
                Effect.sync(() => {
                  interrupted = true
                })
              )
            ),
            Effect.void
          )
        ).pipe(Effect.forkChild)
        yield* Fiber.await(fiber)
        assert.isTrue(interrupted)
      }))
  }

  describe("repeat", () => {
    it.effect("is interruptible", () =>
      Effect.gen(function*() {
        const fiber = yield* Effect.void.pipe(
          Effect.forever,
          Effect.timeoutOption(50),
          Effect.forkChild
        )
        yield* TestClock.adjust(50)
        const result = yield* Fiber.join(fiber)
        assert.deepStrictEqual(result, Option.none())
      }))

    it.effect("repeat/until - repeats until a condition is true", () =>
      Effect.gen(function*() {
        let input = 10
        let output = 0
        const decrement = Effect.sync(() => --input)
        const increment = Effect.sync(() => output++)
        const result = yield* decrement.pipe(
          Effect.tap(increment),
          Effect.repeat({ until: (n) => n === 0 })
        )
        assert.strictEqual(result, 0)
        assert.strictEqual(output, 10)
      }))

    it.effect("repeat/until - repeats until an effectful condition is true", () =>
      Effect.gen(function*() {
        let input = 10
        let output = 0
        const decrement = Effect.sync(() => --input)
        const increment = Effect.sync(() => output++)
        const result = yield* decrement.pipe(
          Effect.tap(increment),
          Effect.repeat({ until: (n) => Effect.succeed(n === 0) })
        )
        assert.strictEqual(result, 0)
        assert.strictEqual(output, 10)
      }))

    it.effect("repeat/until - always evaluates at least once", () =>
      Effect.gen(function*() {
        let n = 0
        const increment = Effect.sync(() => n++)
        yield* Effect.repeat(increment, { until: constTrue })
        assert.strictEqual(n, 1)
      }))

    it.effect("repeat/while - repeats while a condition is true", () =>
      Effect.gen(function*() {
        let input = 10
        let output = 0
        const decrement = Effect.sync(() => --input)
        const increment = Effect.sync(() => output++)
        const result = yield* decrement.pipe(
          Effect.tap(increment),
          Effect.repeat({ while: (n) => n > 0 })
        )
        assert.strictEqual(result, 0)
        assert.strictEqual(output, 10)
      }))

    it.effect("repeat/while - repeats while an effectful condition is true", () =>
      Effect.gen(function*() {
        let input = 10
        let output = 0
        const decrement = Effect.sync(() => --input)
        const increment = Effect.sync(() => output++)
        const result = yield* decrement.pipe(
          Effect.tap(increment),
          Effect.repeat({ while: (n) => Effect.succeed(n > 0) })
        )
        assert.strictEqual(result, 0)
        assert.strictEqual(output, 10)
      }))

    it.effect("repeat/while - always evaluates at least once", () =>
      Effect.gen(function*() {
        let n = 0
        const increment = Effect.sync(() => n++)
        yield* Effect.repeat(increment, { while: constFalse })
        assert.strictEqual(n, 1)
      }))

    it.effect("repeat/times", () =>
      Effect.gen(function*() {
        let n = 0
        const increment = Effect.sync(() => ++n)
        const result = yield* Effect.repeat(increment, {
          times: 2
        })
        assert.strictEqual(n, 3)
        assert.strictEqual(result, 3)
      }))

    it.effect("repeat/schedule - repeats according to the specified schedule", () =>
      Effect.gen(function*() {
        let n = 0
        const increment = Effect.sync(() => ++n)
        const result = yield* Effect.repeat(increment, Schedule.recurs(3))
        assert.strictEqual(result, 3)
      }))

    it.effect("repeat/schedule - with until", () =>
      Effect.gen(function*() {
        let n = 0
        const increment = Effect.sync(() => ++n)
        const result = yield* Effect.repeat(increment, {
          schedule: Schedule.recurs(3),
          until: (n) => n === 3
        })
        assert.strictEqual(n, 3)
        assert.strictEqual(result, 3)
      }))

    it.effect("repeat/schedule - with while", () =>
      Effect.gen(function*() {
        let n = 0
        const increment = Effect.sync(() => ++n)
        const result = yield* Effect.repeat(increment, {
          schedule: Schedule.recurs(3),
          while: (n) => n < 3
        })
        assert.strictEqual(n, 3)
        assert.strictEqual(result, 3) // schedule result
      }))
  })

  describe("retry", () => {
    it.live("nothing on success", () =>
      Effect.gen(function*() {
        let count = 0
        yield* Effect.sync(() => count++).pipe(
          Effect.retry({ times: 10000 })
        )
        assert.strictEqual(count, 1)
      }))

    it.effect("retry/until - retries until a condition is true", () =>
      Effect.gen(function*() {
        let input = 10
        let output = 0
        const decrement = Effect.sync(() => --input)
        const increment = Effect.sync(() => output++)
        const result = yield* decrement.pipe(
          Effect.tap(increment),
          Effect.flip,
          Effect.retry({ until: (n) => n === 0 }),
          Effect.flip
        )
        assert.strictEqual(result, 0)
        assert.strictEqual(output, 10)
      }))

    it.effect("retry/until - retries until an effectful condition is true", () =>
      Effect.gen(function*() {
        let input = 10
        let output = 0
        const decrement = Effect.sync(() => --input)
        const increment = Effect.sync(() => output++)
        const result = yield* decrement.pipe(
          Effect.tap(increment),
          Effect.flip,
          Effect.retry({ until: (n) => Effect.succeed(n === 0) }),
          Effect.flip
        )
        assert.strictEqual(result, 0)
        assert.strictEqual(output, 10)
      }))

    it.effect("retry/until - always evaluates at least once", () =>
      Effect.gen(function*() {
        let n = 0
        const increment = Effect.failSync(() => n++)
        yield* increment.pipe(
          Effect.retry({ until: constTrue }),
          Effect.flip
        )
        assert.strictEqual(n, 1)
      }))

    it.effect("retry/while - retries while a condition is true", () =>
      Effect.gen(function*() {
        let input = 10
        let output = 0
        const decrement = Effect.sync(() => --input)
        const increment = Effect.sync(() => output++)
        const result = yield* decrement.pipe(
          Effect.tap(increment),
          Effect.flip,
          Effect.retry({ while: (n) => n > 0 }),
          Effect.flip
        )
        assert.strictEqual(result, 0)
        assert.strictEqual(output, 10)
      }))

    it.effect("retry/while - retries while an effectful condition is true", () =>
      Effect.gen(function*() {
        let input = 10
        let output = 0
        const decrement = Effect.sync(() => --input)
        const increment = Effect.sync(() => output++)
        const result = yield* decrement.pipe(
          Effect.tap(increment),
          Effect.flip,
          Effect.retry({ while: (n) => Effect.succeed(n > 0) }),
          Effect.flip
        )
        assert.strictEqual(result, 0)
        assert.strictEqual(output, 10)
      }))

    it.effect("retry/while - always evaluates at least once", () =>
      Effect.gen(function*() {
        let n = 0
        const increment = Effect.failSync(() => n++)
        yield* increment.pipe(
          Effect.retry({ while: constFalse }),
          Effect.flip
        )
        assert.strictEqual(n, 1)
      }))

    it.effect("retry/schedule - retries according to the specified schedule", () =>
      Effect.gen(function*() {
        let n = 0
        const increment = Effect.failSync(() => n++)
        yield* increment.pipe(
          Effect.retry(Schedule.recurs(3)),
          Effect.flip
        )
        assert.strictEqual(n, 4)
      }))

    it.effect("retry/schedule - with until", () =>
      Effect.gen(function*() {
        let n = 0
        const increment = Effect.failSync(() => ++n)
        yield* increment.pipe(
          Effect.retry({
            schedule: Schedule.recurs(3),
            until: (n) => n === 3
          }),
          Effect.flip
        )
        assert.strictEqual(n, 3)
      }))

    it.effect("retry/schedule - until errors", () =>
      Effect.gen(function*() {
        let n = 0
        const increment = Effect.failSync(() => ++n)
        const result = yield* increment.pipe(
          Effect.retry({
            schedule: Schedule.recurs(3),
            until: () => Effect.fail("boom")
          }),
          Effect.flip
        )
        assert.strictEqual(n, 1)
        assert.strictEqual(result, "boom")
      }))

    it.effect("retry/schedule - with while", () =>
      Effect.gen(function*() {
        let n = 0
        const increment = Effect.failSync(() => ++n)
        yield* increment.pipe(
          Effect.retry({
            schedule: Schedule.recurs(3),
            while: (n) => n < 3
          }),
          Effect.flip
        )
        assert.strictEqual(n, 3)
      }))

    it.effect("retry/schedule - while errors", () =>
      Effect.gen(function*() {
        let n = 0
        const increment = Effect.failSync(() => ++n)
        const result = yield* increment.pipe(
          Effect.retry({
            schedule: Schedule.recurs(3),
            while: () => Effect.fail("boom")
          }),
          Effect.flip
        )
        assert.strictEqual(n, 1)
        assert.strictEqual(result, "boom")
      }))

    it.effect("retry/schedule - CurrentMetadata", () =>
      Effect.gen(function*() {
        const metadata: Array<Schedule.Metadata> = []
        yield* pipe(
          Effect.gen(function*() {
            const meta = yield* Schedule.CurrentMetadata
            metadata.push(meta)
          }),
          Effect.flip,
          Effect.retry(Schedule.recurs(3)),
          Effect.flip
        )
        assert.deepStrictEqual(metadata, [
          {
            elapsed: 0,
            elapsedSincePrevious: 0,
            attempt: 0,
            input: undefined,
            output: undefined,
            now: 0,
            start: 0,
            duration: Duration.zero
          },
          {
            elapsed: 0,
            elapsedSincePrevious: 0,
            attempt: 1,
            input: undefined,
            output: 0,
            now: 0,
            start: 0,
            duration: Duration.zero
          },
          {
            elapsed: 0,
            elapsedSincePrevious: 0,
            attempt: 2,
            input: undefined,
            output: 1,
            now: 0,
            start: 0,
            duration: Duration.zero
          },
          {
            elapsed: 0,
            elapsedSincePrevious: 0,
            attempt: 3,
            input: undefined,
            output: 2,
            now: 0,
            start: 0,
            duration: Duration.zero
          }
        ])
      }))
  })

  describe("timed", () => {
    it.effect("uses monotonic time when wall time moves backward", () =>
      Effect.gen(function*() {
        yield* TestClock.setTime(1_000)
        const [duration, result] = yield* Effect.gen(function*() {
          yield* TestClock.adjust("100 millis")
          yield* TestClock.setTime(0)
          return "done"
        }).pipe(Effect.timed)

        assert.strictEqual(result, "done")
        assert.strictEqual(Duration.toMillis(duration), 100)
      }))
  })

  describe("timeoutOrElse", () => {
    const forms = ["data-first", "pipe"] as const

    for (const form of forms) {
      it.live(`${form}: factory and body follow cleanup and replay`, () =>
        Effect.gen(function*() {
          let stopped = false
          let factories = 0
          let bodies = 0
          const order: Array<string> = []
          const value = { fallback: true }
          const source = Effect.never.pipe(Effect.ensuring(Effect.sync(() => {
            stopped = true
            order.push("stopped")
          })))
          const options = {
            duration: 0,
            orElse: () => {
              factories++
              order.push(`factory:${stopped}`)
              return Effect.sync(() => {
                bodies++
                order.push(`body:${stopped}`)
                return value
              })
            }
          }
          const program = form === "data-first"
            ? Effect.timeoutOrElse(source, options)
            : source.pipe(Effect.timeoutOrElse(options))
          const before = [factories, bodies]
          const first = yield* program
          const firstStopped = stopped
          stopped = false
          const second = yield* program
          assert.deepStrictEqual({
            before,
            factories,
            bodies,
            firstStopped,
            stopped,
            identity: [first === value, second === value],
            order
          }, {
            before: [0, 0],
            factories: 2,
            bodies: 2,
            firstStopped: true,
            stopped: true,
            identity: [true, true],
            order: ["stopped", "factory:true", "body:true", "stopped", "factory:true", "body:true"]
          })
        }))
    }

    it.live("a ready source value is not confused with a zero-duration timeout", () =>
      Effect.gen(function*() {
        const value = Option.none()
        let calls = 0
        const result = yield* Effect.timeoutOrElse(Effect.succeed(value), {
          duration: 0,
          orElse: () => {
            calls++
            return Effect.succeed(Option.some("unexpected fallback"))
          }
        })
        assert.deepStrictEqual([result, calls], [value, 0])
      }))

    it.live("slow fallback cannot let the original source win after timeout", () =>
      Effect.gen(function*() {
        const sourceGate = yield* Deferred.make<void>()
        const sourceStopped = yield* Deferred.make<void>()
        const fallbackStarted = yield* Deferred.make<void>()
        const fallbackRelease = yield* Deferred.make<void>()
        const sourceCompleted = yield* Ref.make(false)
        const value = { fallback: true }
        let fallbackInterrupted = false
        const source = Deferred.await(sourceGate).pipe(
          Effect.andThen(Ref.set(sourceCompleted, true)),
          Effect.as({ source: true }),
          Effect.ensuring(Deferred.succeed(sourceStopped, undefined))
        )
        const fiber = yield* Effect.timeoutOrElse(source, {
          duration: 0,
          orElse: () =>
            Deferred.succeed(fallbackStarted, undefined).pipe(
              Effect.andThen(Deferred.await(fallbackRelease)),
              Effect.as(value),
              Effect.onInterrupt(() =>
                Effect.sync(() => {
                  fallbackInterrupted = true
                })
              )
            )
        }).pipe(Effect.forkChild)
        yield* Deferred.await(fallbackStarted)
        yield* Deferred.succeed(sourceGate, undefined)
        yield* Deferred.await(sourceStopped)
        yield* Deferred.succeed(fallbackRelease, undefined)
        const completed = yield* Ref.get(sourceCompleted)
        const result = yield* Fiber.join(fiber)
        assert.deepStrictEqual([result === value, completed, fallbackInterrupted], [true, false, false])
      }))

    class SourceService extends Context.Service<SourceService, { source: string }>()("timeout-test/SourceService") {}
    class FallbackService
      extends Context.Service<FallbackService, { fallback: string }>()("timeout-test/FallbackService")
    {}
    const Local = Context.Reference<string>("timeout-test/Local", { defaultValue: () => "default" })

    it.live("source and fallback inherit caller context", () =>
      Effect.gen(function*() {
        const sourceService = { source: "source service" }
        const fallbackService = { fallback: "fallback service" }
        const observed: Array<unknown> = []
        const result = yield* Effect.gen(function*() {
          const callerId = yield* Effect.fiberId
          const parentSpan = yield* Effect.currentSpan
          const source = Effect.gen(function*() {
            observed.push(
              (yield* SourceService) === sourceService,
              yield* Local,
              (yield* Effect.currentSpan) === parentSpan
            )
            return yield* Effect.never
          }).pipe(Effect.provideService(Local, "source-local"))
          const value = yield* Effect.timeoutOrElse(source, {
            duration: 0,
            orElse: () =>
              Effect.gen(function*() {
                const annotations = yield* References.CurrentLogAnnotations
                observed.push(
                  (yield* Effect.fiberId) === callerId,
                  yield* Local,
                  (yield* Effect.currentSpan) === parentSpan,
                  annotations["request"]
                )
                return yield* FallbackService
              })
          })
          observed.push(yield* Local, (yield* Effect.currentSpan) === parentSpan)
          return value
        }).pipe(
          Effect.provideService(SourceService, sourceService),
          Effect.provideService(FallbackService, fallbackService),
          Effect.provideService(Local, "parent-local"),
          Effect.annotateLogs({ request: "request-value" }),
          Effect.withSpan("timeout-parent")
        )
        assert.deepStrictEqual([result === fallbackService, observed], [true, [
          true,
          "source-local",
          true,
          true,
          "parent-local",
          true,
          "request-value",
          "parent-local",
          true
        ]])
      }))

    it.live("external interruption stops a pending fallback", () =>
      Effect.gen(function*() {
        const started = yield* Deferred.make<void>()
        let sourceStopped = false
        let fallbackStopped = false
        let calls = 0
        const fiber = yield* Effect.never.pipe(
          Effect.ensuring(Effect.sync(() => {
            sourceStopped = true
          })),
          Effect.timeoutOrElse({
            duration: 0,
            orElse: () => {
              calls++
              return Deferred.succeed(started, undefined).pipe(
                Effect.andThen(Effect.never),
                Effect.ensuring(Effect.sync(() => {
                  fallbackStopped = true
                }))
              )
            }
          }),
          Effect.forkChild
        )
        yield* Deferred.await(started)
        yield* Fiber.interrupt(fiber)
        const exit = yield* Fiber.await(fiber)
        assert.deepStrictEqual([Exit.hasInterrupts(exit), sourceStopped, fallbackStopped, calls], [true, true, true, 1])
      }))
  })

  describe("timeoutOption", () => {
    it.live("timeout a long computation", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Effect.sleep(60_000),
          Effect.andThen(Effect.succeed(true)),
          Effect.timeoutOption(10)
        )
        assert.deepStrictEqual(result, Option.none())
      }))
    it.live("timeout a long computation with a failure", () =>
      Effect.gen(function*() {
        const error = new Error("boom")
        const result = yield* pipe(
          Effect.sleep(5000),
          Effect.andThen(Effect.succeed(true)),
          Effect.timeoutOrElse({
            orElse: () => Effect.die(error),
            duration: 10
          }),
          Effect.sandbox,
          Effect.flip
        )
        assert.deepStrictEqual(result, Cause.die(error))
      }))
    it.effect("timeout repetition of uninterruptible effect", () =>
      Effect.gen(function*() {
        const fiber = yield* pipe(
          Effect.void,
          Effect.uninterruptible,
          Effect.forever,
          Effect.timeoutOption(10),
          Effect.forkChild
        )
        yield* TestClock.adjust(10)
        const result = yield* Fiber.join(fiber)
        assert.deepStrictEqual(result, Option.none())
      }))
    it.effect("timeout in uninterruptible region", () =>
      Effect.void.pipe(
        Effect.timeoutOption(20_000),
        Effect.uninterruptible
      ), { timeout: 1000 })
  })

  describe("timeout", () => {
    it.effect("timeout produces a useful error message", () =>
      Effect.gen(function*() {
        const duration = Duration.millis(1500)
        const fiber = yield* Effect.never.pipe(
          Effect.timeout(duration),
          Effect.flip,
          Effect.forkChild
        )
        yield* TestClock.adjust(Duration.millis(2000))
        const result = yield* Fiber.join(fiber)
        assert.include(
          result.toString(),
          "TimeoutError: Operation timed out after '1s 500ms'"
        )
      }))
    it.live("timeout a long computation", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Effect.sleep(60_000),
          Effect.andThen(Effect.succeed(true)),
          Effect.timeout(10),
          Effect.flip
        )
        assert.deepStrictEqual(
          result,
          new Cause.TimeoutError("Operation timed out after '10ms'")
        )
      }))
    it.effect("timeout interrupts the effect", () =>
      Effect.gen(function*() {
        let interrupted = false
        const fiber = yield* Effect.never.pipe(
          Effect.onInterrupt(() =>
            Effect.sync(() => {
              interrupted = true
            })
          ),
          Effect.timeout(10),
          Effect.flip,
          Effect.forkChild
        )
        yield* TestClock.adjust(10)
        const result = yield* Fiber.join(fiber)
        assert.deepStrictEqual(
          result,
          new Cause.TimeoutError("Operation timed out after '10ms'")
        )
        assert.isTrue(interrupted)
      }))
  })

  describe("interruption", () => {
    it.effect("skipped handlers drop failures and keep defects when interrupted", () =>
      Effect.gen(function*() {
        const latch = yield* Latch.make()
        const fiber = yield* latch.await.pipe(
          Effect.andThen(Effect.failCause(Cause.combine(Cause.fail("error"), Cause.die("defect")))),
          Effect.uninterruptible,
          Effect.catchCause(() => Effect.void),
          Effect.forkChild({ startImmediately: true })
        )
        fiber.interruptUnsafe(123)
        yield* latch.open
        const exit = yield* Fiber.await(fiber)
        assert.isTrue(Exit.isFailure(exit))
        if (Exit.isFailure(exit)) {
          assert.isFalse(Cause.hasFails(exit.cause))
          assert.isTrue(Cause.hasDies(exit.cause))
          assert.deepStrictEqual(Cause.interruptors(exit.cause), new Set([123]))
        }
      }))

    it.effect("uninterruptible handlers observe the interruption after skipped handlers", () =>
      Effect.gen(function*() {
        const latch = yield* Latch.make()
        let result: Exit.Exit<void> | undefined
        const fiber = yield* latch.await.pipe(
          Effect.andThen(Effect.fail("error")),
          Effect.uninterruptible,
          Effect.catch(() => Effect.void),
          Effect.interruptible,
          Effect.exit,
          Effect.map((exit) => {
            result = exit
          }),
          Effect.uninterruptible,
          Effect.forkChild({ startImmediately: true })
        )
        fiber.interruptUnsafe(123)
        yield* latch.open
        yield* Fiber.await(fiber)
        assert.isTrue(result !== undefined && Exit.isFailure(result) && Cause.hasInterruptsOnly(result.cause))
      }))

    it.effect("handlers inside an uninterruptible region recover with interruption pending", () =>
      Effect.gen(function*() {
        const latch = yield* Latch.make()
        let recovered = false
        const fiber = yield* latch.await.pipe(
          Effect.andThen(Effect.fail("error")),
          Effect.catch(() =>
            Effect.sync(() => {
              recovered = true
            })
          ),
          Effect.uninterruptible,
          Effect.forkChild({ startImmediately: true })
        )
        fiber.interruptUnsafe(123)
        yield* latch.open
        const exit = yield* Fiber.await(fiber)
        assert.isTrue(recovered)
        assert.isTrue(Exit.hasInterrupts(exit))
      }))

    it("a map callback that interrupts its own fiber skips the next map", () => {
      let ran = false
      const exit = Effect.runSyncExit(
        Effect.sync(() => 0).pipe(
          Effect.map(() => Fiber.getCurrent()!.interruptUnsafe()),
          Effect.map(() => {
            ran = true
          })
        )
      )
      assert.isFalse(ran)
      assert.isTrue(Exit.hasInterrupts(exit))
    })

    it.effect("sync forever is interruptible", () =>
      Effect.gen(function*() {
        const fiber = yield* pipe(Effect.succeed(1), Effect.forever, Effect.forkChild)
        yield* Fiber.interrupt(fiber)
        assert(Exit.hasInterrupts(fiber.pollUnsafe()!))
      }))

    it.effect("interrupt of never is interrupted with cause", () =>
      Effect.gen(function*() {
        const fiber = yield* Effect.forkChild(Effect.never)
        yield* Fiber.interrupt(fiber)
        assert(Exit.hasInterrupts(fiber.pollUnsafe()!))
      }))

    it.effect("catch + ensuring + interrupt", () =>
      Effect.gen(function*() {
        let catchFailure = false
        let ensuring = false
        const handle = yield* Effect.never.pipe(
          Effect.catchCause((_) =>
            Effect.sync(() => {
              catchFailure = true
            })
          ),
          Effect.ensuring(Effect.sync(() => {
            ensuring = true
          })),
          Effect.forkChild({ startImmediately: true })
        )
        yield* Fiber.interrupt(handle)
        assert.isFalse(catchFailure)
        assert.isTrue(ensuring)
      }))

    it.effect("run of interruptible", () =>
      Effect.gen(function*() {
        let recovered = false
        const fiber = yield* Effect.never.pipe(
          Effect.interruptible,
          Effect.exit,
          Effect.flatMap((result) =>
            Effect.sync(() => {
              recovered = result._tag === "Failure" && Cause.hasInterruptsOnly(result.cause)
            })
          ),
          Effect.uninterruptible,
          Effect.forkChild({ startImmediately: true })
        )
        yield* Fiber.interrupt(fiber)
        assert.isTrue(recovered)
      }))

    it.effect("alternating interruptibility", () =>
      Effect.gen(function*() {
        let counter = 0
        const fiber = yield* Effect.never.pipe(
          Effect.interruptible,
          Effect.exit,
          Effect.andThen(Effect.sync(() => {
            counter++
          })),
          Effect.uninterruptible,
          Effect.interruptible,
          Effect.exit,
          Effect.andThen(Effect.sync(() => {
            counter++
          })),
          Effect.uninterruptible,
          Effect.forkChild({ startImmediately: true })
        )
        yield* Fiber.interrupt(fiber)
        assert.strictEqual(counter, 2)
      }))

    it.live("acquireUseRelease use inherits interrupt status", () =>
      Effect.gen(function*() {
        let ref = false
        const fiber = yield* Effect.acquireUseRelease(
          Effect.succeed(123),
          (_) =>
            Effect.sync(() => {
              ref = true
            }).pipe(
              Effect.delay(10)
            ),
          () => Effect.void
        ).pipe(
          Effect.uninterruptible,
          Effect.forkChild({ startImmediately: true })
        )
        yield* Fiber.interrupt(fiber)
        assert.isTrue(ref)
      }))

    it.effect("acquireUseRelease release runs when use is interrupted", () =>
      Effect.gen(function*() {
        let acquired = false
        let releaseExit: Exit.Exit<never> | undefined
        const fiber = yield* Effect.acquireUseRelease(
          Effect.sync(() => {
            acquired = true
            return 123
          }),
          () => Effect.never,
          (resource, exit) =>
            Effect.sync(() => {
              assert.strictEqual(resource, 123)
              releaseExit = exit
            })
        ).pipe(Effect.forkChild({ startImmediately: true }))
        yield* Fiber.interrupt(fiber)
        assert.isTrue(acquired)
        assert.isDefined(releaseExit)
        assert.isTrue(Exit.hasInterrupts(releaseExit!))
        assert(Exit.hasInterrupts(fiber.pollUnsafe()!))
      }))

    it.live("async can be uninterruptible", () =>
      Effect.gen(function*() {
        let ref = false
        const fiber = yield* Effect.sleep(10).pipe(
          Effect.andThen(Effect.sync(() => {
            ref = true
          })),
          Effect.uninterruptible,
          Effect.forkChild({ startImmediately: true })
        )
        yield* Fiber.interrupt(fiber)
        assert.isTrue(ref)
      }))

    it.live("callback cannot resume on interrupt", () =>
      Effect.gen(function*() {
        const fiber = yield* Effect.callback<string>((resume) => {
          setTimeout(() => {
            resume(Effect.succeed("foo"))
          }, 10)
        }).pipe(
          Effect.onInterrupt(() => Effect.sleep(30)),
          Effect.forkChild({ startImmediately: true })
        )
        yield* Fiber.interrupt(fiber)
        assert.isTrue(Exit.hasInterrupts(fiber.pollUnsafe()!))
      }))

    it.live("closing scope is uninterruptible", () =>
      Effect.gen(function*() {
        let ref = false
        const child = pipe(
          Effect.sleep(10),
          Effect.andThen(Effect.sync(() => {
            ref = true
          }))
        )
        const fiber = yield* child.pipe(Effect.uninterruptible, Effect.forkChild({ startImmediately: true }))
        yield* Fiber.interrupt(fiber)
        assert.isTrue(ref)
      }))

    it.effect("AbortSignal is aborted", () =>
      Effect.gen(function*() {
        let signal: AbortSignal
        const fiber = yield* Effect.callback<void>((_cb, signal_) => {
          signal = signal_
        }).pipe(Effect.forkChild({ startImmediately: true }))
        yield* Fiber.interrupt(fiber)
        assert.strictEqual(signal!.aborted, true)
      }))

    it.effect("callback cleanup effect runs on interrupt", () =>
      Effect.gen(function*() {
        let cleanedUp = false
        const fiber = yield* Effect.callback<void>((_resume) =>
          Effect.sync(() => {
            cleanedUp = true
          })
        ).pipe(Effect.forkChild({ startImmediately: true }))
        yield* Fiber.interrupt(fiber)
        assert.isTrue(cleanedUp)
      }))

    describe("uninterruptibleMask", () => {
      it.effect("defers a pending interrupt until the masked region completes", () =>
        Effect.gen(function*() {
          const masked = yield* Latch.make()
          const resume = yield* Latch.make()
          const events: Array<string> = []

          const child = yield* Effect.uninterruptibleMask(() =>
            Effect.gen(function*() {
              yield* masked.open
              yield* resume.await
              events.push("masked region completed")
            })
          ).pipe(Effect.forkChild({ startImmediately: true }))

          yield* masked.await
          events.push("masked")

          yield* Effect.sync(() => {
            child.interruptUnsafe(123)
            events.push("interrupted")
          })
          assert.isUndefined(child.pollUnsafe())

          yield* resume.open
          events.push("resumed")
          yield* Effect.yieldNow
          yield* Effect.yieldNow

          const exit = child.pollUnsafe()
          if (exit === undefined) {
            return assert.fail("fiber did not exit after the masked region completed")
          }
          assert.isTrue(Exit.hasInterrupts(exit))
          if (exit._tag !== "Failure") {
            return assert.fail("expected interrupted fiber to exit with failure")
          }
          assert.deepStrictEqual(Cause.interruptors(exit.cause), new Set([123]))
          assert.deepStrictEqual(events, ["masked", "interrupted", "resumed", "masked region completed"])
        }))

      it.effect("delivers a pending interrupt when restore re-enables interruptibility", () =>
        Effect.gen(function*() {
          const masked = yield* Latch.make()
          const resume = yield* Latch.make()
          const events: Array<string> = []

          const child = yield* Effect.uninterruptibleMask((restore) =>
            Effect.gen(function*() {
              yield* masked.open
              yield* resume.await
              // the pending interrupt is delivered at the restore boundary, so
              // the restored effect never runs
              return yield* restore(Effect.suspend(() => {
                events.push("restored")
                return Effect.never
              }))
            })
          ).pipe(Effect.forkChild({ startImmediately: true }))

          yield* masked.await
          events.push("masked")

          yield* Effect.sync(() => {
            child.interruptUnsafe(123)
            events.push("interrupted")
          })
          assert.isUndefined(child.pollUnsafe())

          yield* resume.open
          events.push("resumed")
          yield* Effect.yieldNow
          yield* Effect.yieldNow

          const exit = child.pollUnsafe()
          if (exit === undefined) {
            return assert.fail("fiber did not exit after restore re-enabled interruptibility")
          }
          assert.isTrue(Exit.hasInterrupts(exit))
          if (exit._tag !== "Failure") {
            return assert.fail("expected interrupted fiber to exit with failure")
          }
          assert.deepStrictEqual(Cause.interruptors(exit.cause), new Set([123]))
          assert.deepStrictEqual(events, ["masked", "interrupted", "resumed"])
        }))

      it.effect("region after a restored section stays uninterruptible", () =>
        Effect.gen(function*() {
          const afterRestore = yield* Latch.make()
          const resume = yield* Latch.make()
          const events: Array<string> = []

          const child = yield* Effect.uninterruptibleMask((restore) =>
            Effect.gen(function*() {
              yield* restore(Effect.sync(() => {
                events.push("restored section completed")
              }))
              yield* afterRestore.open
              yield* resume.await
              events.push("masked region completed")
            })
          ).pipe(Effect.forkChild({ startImmediately: true }))

          yield* afterRestore.await
          events.push("after restore")

          yield* Effect.sync(() => {
            child.interruptUnsafe(123)
            events.push("interrupted")
          })
          assert.isUndefined(child.pollUnsafe())

          yield* resume.open
          events.push("resumed")
          yield* Effect.yieldNow
          yield* Effect.yieldNow

          const exit = child.pollUnsafe()
          if (exit === undefined) {
            return assert.fail("fiber did not exit after the masked region completed")
          }
          assert.isTrue(Exit.hasInterrupts(exit))
          if (exit._tag !== "Failure") {
            return assert.fail("expected interrupted fiber to exit with failure")
          }
          assert.deepStrictEqual(Cause.interruptors(exit.cause), new Set([123]))
          assert.deepStrictEqual(events, [
            "restored section completed",
            "after restore",
            "interrupted",
            "resumed",
            "masked region completed"
          ])
        }))
    })
  })

  describe("awaitAllChildren", () => {
    it.effect("completes immediately when no children are forked", () =>
      Effect.gen(function*() {
        const result = yield* Effect.succeed(1).pipe(Effect.awaitAllChildren)
        assert.strictEqual(result, 1)
      }))

    it.effect("awaits children forked by the wrapped effect", () =>
      Effect.gen(function*() {
        const latch = yield* Deferred.make<void>()
        const fiber = yield* Effect.gen(function*() {
          yield* Deferred.await(latch).pipe(Effect.forkChild)
          return 1
        }).pipe(
          Effect.awaitAllChildren,
          Effect.forkChild({ startImmediately: true })
        )
        yield* Effect.yieldNow
        assert.strictEqual(fiber.pollUnsafe(), undefined)
        yield* Deferred.succeed(latch, void 0)
        const result = yield* Fiber.join(fiber)
        assert.strictEqual(result, 1)
      }))

    it.effect("can be interrupted while awaiting children after success", () =>
      Effect.gen(function*() {
        const childStarted = yield* Deferred.make<void>()
        const childFiber = yield* Deferred.make<Fiber.Fiber<void>>()
        const releaseChild = yield* Deferred.make<void>()
        const fiber = yield* Effect.gen(function*() {
          const child = yield* Effect.gen(function*() {
            yield* Deferred.succeed(childStarted, void 0)
            yield* Deferred.await(releaseChild)
          }).pipe(Effect.forkChild({ startImmediately: true }))
          yield* Deferred.succeed(childFiber, child)
          return 1
        }).pipe(
          Effect.awaitAllChildren,
          Effect.forkChild({ startImmediately: true })
        )

        const child = yield* Deferred.await(childFiber)
        yield* Deferred.await(childStarted)
        fiber.interruptUnsafe()
        yield* Effect.yieldNow
        yield* Effect.yieldNow
        const exit = fiber.pollUnsafe()
        const childExit = child.pollUnsafe()

        yield* Deferred.succeed(releaseChild, void 0)
        yield* Fiber.await(fiber)

        assert(exit !== undefined && Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause))
        assert(childExit !== undefined && Exit.isFailure(childExit) && Cause.hasInterruptsOnly(childExit.cause))
      }))

    it.effect("can be interrupted while awaiting children after failure", () =>
      Effect.gen(function*() {
        const childStarted = yield* Deferred.make<void>()
        const childFiber = yield* Deferred.make<Fiber.Fiber<void>>()
        const releaseChild = yield* Deferred.make<void>()
        const fiber = yield* Effect.gen(function*() {
          const child = yield* Effect.gen(function*() {
            yield* Deferred.succeed(childStarted, void 0)
            yield* Deferred.await(releaseChild)
          }).pipe(Effect.forkChild({ startImmediately: true }))
          yield* Deferred.succeed(childFiber, child)
          return yield* Effect.fail("boom")
        }).pipe(
          Effect.awaitAllChildren,
          Effect.forkChild({ startImmediately: true })
        )

        const child = yield* Deferred.await(childFiber)
        yield* Deferred.await(childStarted)
        fiber.interruptUnsafe()
        yield* Effect.yieldNow
        yield* Effect.yieldNow
        const exit = fiber.pollUnsafe()
        const childExit = child.pollUnsafe()

        yield* Deferred.succeed(releaseChild, void 0)
        yield* Fiber.await(fiber)

        assert(exit !== undefined && Exit.isFailure(exit))
        assert.isTrue(Cause.hasInterrupts(exit.cause))
        assert.deepStrictEqual(Cause.findError(exit.cause), Result.succeed("boom"))
        assert(childExit !== undefined && Exit.isFailure(childExit) && Cause.hasInterruptsOnly(childExit.cause))
      }))

    it.effect("respects an enclosing uninterruptible region while awaiting children", () =>
      Effect.gen(function*() {
        const childStarted = yield* Deferred.make<void>()
        const childFiber = yield* Deferred.make<Fiber.Fiber<void>>()
        const releaseChild = yield* Deferred.make<void>()
        const fiber = yield* Effect.gen(function*() {
          const child = yield* Effect.gen(function*() {
            yield* Deferred.succeed(childStarted, void 0)
            yield* Deferred.await(releaseChild)
          }).pipe(Effect.forkChild({ startImmediately: true }))
          yield* Deferred.succeed(childFiber, child)
          return 1
        }).pipe(
          Effect.awaitAllChildren,
          Effect.uninterruptible,
          Effect.forkChild({ startImmediately: true })
        )

        const child = yield* Deferred.await(childFiber)
        yield* Deferred.await(childStarted)
        fiber.interruptUnsafe()
        yield* Effect.yieldNow
        yield* Effect.yieldNow

        assert.strictEqual(fiber.pollUnsafe(), undefined)
        assert.strictEqual(child.pollUnsafe(), undefined)

        yield* Deferred.succeed(releaseChild, void 0)
        const exit = yield* Fiber.await(fiber)

        assert(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause))
      }))

    it.effect("does not await children forked outside the wrapped effect", () =>
      Effect.gen(function*() {
        const preexisting = yield* Effect.never.pipe(Effect.forkChild({ startImmediately: true }))
        const fiber = yield* Effect.succeed(1).pipe(
          Effect.awaitAllChildren,
          Effect.forkChild({ startImmediately: true })
        )
        yield* Effect.yieldNow
        assert.deepStrictEqual(fiber.pollUnsafe(), Exit.succeed(1))
        yield* Fiber.interrupt(preexisting)
      }))

    it.effect("does not await preexisting children", () =>
      Effect.gen(function*() {
        const preexisting = yield* Effect.never.pipe(Effect.forkChild({ startImmediately: true }))
        const result = yield* Effect.succeed(1).pipe(Effect.awaitAllChildren)
        assert.strictEqual(result, 1)
        yield* Fiber.interrupt(preexisting)
      }))

    it.effect("does not await preexisting children in the same fiber", () =>
      Effect.gen(function*() {
        const preexistingLatch = yield* Deferred.make<void>()
        const scopedLatch = yield* Deferred.make<void>()
        const fiber = yield* Effect.gen(function*() {
          yield* Deferred.await(preexistingLatch).pipe(Effect.forkChild)
          return yield* Effect.gen(function*() {
            yield* Deferred.await(scopedLatch).pipe(Effect.forkChild)
            return 1
          }).pipe(Effect.awaitAllChildren)
        }).pipe(
          Effect.forkChild({ startImmediately: true })
        )
        yield* Effect.yieldNow
        assert.strictEqual(fiber.pollUnsafe(), undefined)
        yield* Deferred.succeed(scopedLatch, void 0)
        yield* Effect.yieldNow
        assert.deepStrictEqual(fiber.pollUnsafe(), Exit.succeed(1))
      }))
  })

  describe("fork", () => {
    it.effect("is interrupted with parent", () =>
      Effect.gen(function*() {
        let child = false
        let parent = false
        const fiber = yield* Effect.never.pipe(
          Effect.onInterrupt(() =>
            Effect.sync(() => {
              child = true
            })
          ),
          Effect.forkChild({ startImmediately: true }),
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() =>
            Effect.sync(() => {
              parent = true
            })
          ),
          Effect.forkChild({ startImmediately: true })
        )
        yield* Fiber.interrupt(fiber)
        assert.isTrue(child)
        assert.isTrue(parent)
      }))
  })

  describe("forkDaemon", () => {
    it.effect("is not interrupted with parent", () =>
      Effect.gen(function*() {
        let child = false
        let parent = false
        const handle = yield* Effect.never.pipe(
          Effect.onInterrupt(() =>
            Effect.sync(() => {
              child = true
            })
          ),
          Effect.forkDetach,
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() =>
            Effect.sync(() => {
              parent = true
            })
          ),
          Effect.forkChild({ startImmediately: true })
        )
        yield* Fiber.interrupt(handle)
        assert.isFalse(child)
        assert.isTrue(parent)
      }))
  })

  describe("forkIn", () => {
    it.effect("is interrupted when scope is closed", () =>
      Effect.gen(function*() {
        let interrupted = false
        const scope = yield* Scope.make()
        yield* Effect.never.pipe(
          Effect.onInterrupt(() =>
            Effect.sync(() => {
              interrupted = true
            })
          ),
          Effect.forkIn(scope, { startImmediately: true })
        )
        yield* Scope.close(scope, Exit.void)
        assert.isTrue(interrupted)
      }))
  })

  describe("forkScoped", () => {
    it.effect("is interrupted when scope is closed", () =>
      Effect.gen(function*() {
        let interrupted = false
        const scope = yield* Scope.make()
        yield* Effect.never.pipe(
          Effect.onInterrupt(() =>
            Effect.sync(() => {
              interrupted = true
            })
          ),
          Effect.forkScoped({ startImmediately: true }),
          Scope.provide(scope)
        )
        yield* Scope.close(scope, Exit.void)
        assert.isTrue(interrupted)
      }))
  })

  describe("do notation", () => {
    it.effect("works", () =>
      Effect.succeed(1).pipe(
        Effect.bindTo("a"),
        Effect.let("b", ({ a }) => a + 1),
        Effect.bind("b", ({ b }) => Effect.succeed(b.toString())),
        Effect.tap((value) =>
          Effect.sync(() => {
            assert.deepStrictEqual(value, {
              a: 1,
              b: "2"
            })
          })
        )
      ))
  })

  describe("stack safety", () => {
    it.live("recursion", () => {
      const loop: Effect.Effect<void> = Effect.void.pipe(
        Effect.flatMap((_) => loop)
      )
      return loop.pipe(
        Effect.timeoutOption(50)
      )
    })

    it("lazily nested map continuations", () => {
      const loop = (n: number): Effect.Effect<number> =>
        n === 0 ? Effect.succeed(0) : Effect.map(Effect.suspend(() => loop(n - 1)), (n) => n + 1)
      assert.strictEqual(Effect.runSync(loop(100_000)), 100_000)
    })
  })

  describe("finalization", () => {
    const ExampleError = new Error("Oh noes!")

    const throwing = (): never => {
      throw "finalizer defect"
    }

    it.effect("onExit preserves the original failure when the finalizer throws", () =>
      Effect.gen(function*() {
        const result = yield* Effect.fail("body failure").pipe(Effect.onExit(throwing), Effect.exit)
        assert.deepStrictEqual(
          result,
          Exit.failCause(Cause.combine(Cause.fail("body failure"), Cause.die("finalizer defect")))
        )
      }))

    it.effect("onExit reports a thrown finalizer on success", () =>
      Effect.gen(function*() {
        const result = yield* Effect.succeed(1).pipe(Effect.onExit(throwing), Effect.exit)
        assert.deepStrictEqual(result, Exit.die("finalizer defect"))
      }))

    it.effect("an outer onInterrupt still sees the interruption after an inner finalizer throws", () =>
      Effect.gen(function*() {
        let finalized = false
        const result = yield* Effect.interrupt.pipe(
          Effect.onExit(throwing),
          Effect.onInterrupt(() =>
            Effect.sync(() => {
              finalized = true
            })
          ),
          Effect.exit
        )
        assert.isTrue(finalized)
        assert.isTrue(Exit.isFailure(result))
        if (Exit.isFailure(result)) {
          assert.deepStrictEqual(result.cause.reasons.map((reason) => reason._tag), ["Interrupt", "Die"])
          assert.deepStrictEqual(result.cause.reasons[1], Cause.die("finalizer defect").reasons[0])
        }
      }))

    it("nested throwing finalizers do not overflow the stack", () => {
      let program: Effect.Effect<unknown> = Effect.succeed(1)
      for (let i = 0; i < 20_000; i++) {
        program = Effect.onExit(Effect.exit(program), throwing)
      }
      assert.deepStrictEqual(Effect.runSyncExit(program), Exit.die("finalizer defect"))
    })

    it.effect("fail ensuring", () =>
      Effect.gen(function*() {
        let finalized = false
        const result = yield* Effect.fail(ExampleError).pipe(
          Effect.ensuring(Effect.sync(() => {
            finalized = true
          })),
          Effect.exit
        )
        assert.deepStrictEqual(result, Exit.fail(ExampleError))
        assert.isTrue(finalized)
      }))

    it.effect("fail on error", () =>
      Effect.gen(function*() {
        let finalized = false
        const result = yield* Effect.fail(ExampleError).pipe(
          Effect.onError(() =>
            Effect.sync(() => {
              finalized = true
            })
          ),
          Effect.exit
        )
        assert.deepStrictEqual(result, Exit.fail(ExampleError))
        assert.isTrue(finalized)
      }))

    it.effect("finalizer errors merged", () =>
      Effect.gen(function*() {
        const e2 = new Error("e2")
        const e3 = new Error("e3")
        const result = yield* pipe(
          Effect.fail(ExampleError),
          Effect.ensuring(Effect.die(e2)),
          Effect.ensuring(Effect.die(e3)),
          Effect.sandbox,
          Effect.flip,
          Effect.map((cause) => cause)
        )
        assert.deepStrictEqual(
          result,
          Cause.combine(Cause.combine(Cause.fail(ExampleError), Cause.die(e2)), Cause.die(e3))
        )
      }))

    it.effect("finalizer errors reported", () =>
      Effect.gen(function*() {
        let reported: Exit.Exit<number> | undefined
        const result = yield* pipe(
          Effect.succeed(42),
          Effect.ensuring(Effect.die(ExampleError)),
          Effect.forkChild,
          Effect.flatMap((fiber) =>
            pipe(
              Fiber.await(fiber),
              Effect.flatMap((e) =>
                Effect.sync(() => {
                  reported = e
                })
              )
            )
          )
        )
        assert.isUndefined(result)
        assert.isFalse(reported !== undefined && Exit.isSuccess(reported))
      }))

    it.effect("scoped combines usage and finalizer failures", () =>
      Effect.gen(function*() {
        const result = yield* Effect.gen(function*() {
          yield* Effect.addFinalizer(() => Effect.die("finalizer failure"))
          return yield* Effect.fail("usage failure")
        }).pipe(Effect.scoped, Effect.exit)
        assert.deepStrictEqual(
          result,
          Exit.failCause(Cause.combine(Cause.fail("usage failure"), Cause.die("finalizer failure")))
        )
      }))

    it.effect("acquireUseRelease usage result", () =>
      Effect.gen(function*() {
        const result = yield* Effect.acquireUseRelease(
          Effect.void,
          () => Effect.succeed(42),
          () => Effect.void
        )
        assert.strictEqual(result, 42)
      }))

    it.effect("error in just acquisition", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Effect.acquireUseRelease(
            Effect.fail(ExampleError),
            () => Effect.void,
            () => Effect.void
          ),
          Effect.exit
        )
        assert.deepStrictEqual(result, Exit.fail(ExampleError))
      }))

    it.effect("error in just release", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Effect.acquireUseRelease(
            Effect.void,
            () => Effect.void,
            () => Effect.die(ExampleError)
          ),
          Effect.exit
        )
        assert.deepStrictEqual(result, Exit.die(ExampleError))
      }))

    it.effect("error in just usage", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Effect.acquireUseRelease(
            Effect.void,
            () => Effect.fail(ExampleError),
            () => Effect.void
          ),
          Effect.exit
        )
        assert.deepStrictEqual(result, Exit.fail(ExampleError))
      }))

    it.effect("combines usage and release failures", () =>
      Effect.gen(function*() {
        const result = yield* Effect.acquireUseRelease(
          Effect.void,
          () => Effect.fail("usage failure"),
          () => Effect.fail("release failure")
        ).pipe(Effect.exit)
        assert.deepStrictEqual(
          result,
          Exit.failCause(Cause.combine(Cause.fail("usage failure"), Cause.fail("release failure")))
        )
      }))

    it.effect("rethrown caught error in acquisition", () =>
      Effect.gen(function*() {
        const result = yield* Effect.acquireUseRelease(
          Effect.fail(ExampleError),
          () => Effect.void,
          () => Effect.void
        ).pipe(Effect.flip)
        assert.deepEqual(result, ExampleError)
      }))

    it.effect("rethrown caught error in release", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Effect.acquireUseRelease(
            Effect.void,
            () => Effect.void,
            () => Effect.die(ExampleError)
          ),
          Effect.exit
        )
        assert.deepStrictEqual(result, Exit.die(ExampleError))
      }))

    it.effect("rethrown caught error in usage", () =>
      Effect.gen(function*() {
        const result = yield* Effect.acquireUseRelease(
          Effect.void,
          () => Effect.fail(ExampleError),
          () => Effect.void
        ).pipe(Effect.exit)
        assert.deepEqual(result, Exit.fail(ExampleError))
      }))

    it.effect("onResult - ensures that a cleanup function runs when an effect fails", () =>
      Effect.gen(function*() {
        let ref = false
        yield* Effect.die("boom").pipe(
          Effect.onExit((result) =>
            Exit.hasDies(result) ?
              Effect.sync(() => {
                ref = true
              }) :
              Effect.void
          ),
          Effect.sandbox,
          Effect.ignore
        )
        assert.isTrue(ref)
      }))

    it.effect("onExit - callback observes interrupt exit when the fiber is interrupted", () =>
      Effect.gen(function*() {
        let observedInterrupt = false
        const fiber = yield* Effect.never.pipe(
          Effect.onExit((exit) =>
            Effect.sync(() => {
              observedInterrupt = Exit.hasInterrupts(exit)
            })
          ),
          Effect.forkChild({ startImmediately: true })
        )
        yield* Fiber.interrupt(fiber)
        assert.isTrue(observedInterrupt)
      }))
  })

  describe("Effect.ignore", () => {
    type IgnoreOptions = { readonly log?: boolean | LogLevel.Severity; readonly message?: string }

    const makeTestLogger = () => {
      const capturedLogs: Array<{
        readonly logLevel: LogLevel.LogLevel
        readonly cause: Cause.Cause<unknown>
        readonly message: unknown
      }> = []
      const testLogger = Logger.make<unknown, void>((options) => {
        capturedLogs.push({ logLevel: options.logLevel, cause: options.cause, message: options.message })
      })
      return { capturedLogs, testLogger }
    }

    const runIgnore = (options?: IgnoreOptions, currentLogLevel: LogLevel.Severity = "Info") =>
      Effect.gen(function*() {
        const { capturedLogs, testLogger } = makeTestLogger()
        const program = options === undefined
          ? Effect.fail("boom").pipe(Effect.ignore)
          : Effect.fail("boom").pipe(Effect.ignore(options))
        yield* program.pipe(
          Effect.provide(Logger.layer([testLogger])),
          Effect.provideService(References.MinimumLogLevel, "Trace"),
          Effect.provideService(References.CurrentLogLevel, currentLogLevel)
        )
        return capturedLogs
      })

    it.effect("does not log when log is omitted", () =>
      Effect.gen(function*() {
        const logs = yield* runIgnore()
        assert.strictEqual(logs.length, 0)
      }))

    it.effect("does not log when log is false", () =>
      Effect.gen(function*() {
        const logs = yield* runIgnore({ log: false })
        assert.strictEqual(logs.length, 0)
      }))

    it.effect("logs with the current level when log is true", () =>
      Effect.gen(function*() {
        const logs = yield* runIgnore({ log: true }, "Warn")
        assert.strictEqual(logs.length, 1)
        assert.strictEqual(logs[0].logLevel, "Warn")
        assertCauseFail(logs[0].cause, "boom")
      }))

    it.effect("logs with the provided level when log is a LogLevel", () =>
      Effect.gen(function*() {
        const logs = yield* runIgnore({ log: "Error" }, "Warn")
        assert.strictEqual(logs.length, 1)
        assert.strictEqual(logs[0].logLevel, "Error")
        assertCauseFail(logs[0].cause, "boom")
      }))

    it.effect("prepends the provided message when logging", () =>
      Effect.gen(function*() {
        const logs = yield* runIgnore({ log: true, message: "Ignoring failure" })
        assert.strictEqual(logs.length, 1)
        assert.deepStrictEqual(logs[0].message, ["Ignoring failure"])
        assertCauseFail(logs[0].cause, "boom")
      }))
  })

  describe("Effect.ignoreCause", () => {
    type IgnoreCauseOptions = { readonly log?: boolean | LogLevel.Severity; readonly message?: string }

    const makeTestLogger = () => {
      const capturedLogs: Array<{
        readonly logLevel: LogLevel.LogLevel
        readonly cause: Cause.Cause<unknown>
        readonly message: unknown
      }> = []
      const testLogger = Logger.make<unknown, void>((options) => {
        capturedLogs.push({ logLevel: options.logLevel, cause: options.cause, message: options.message })
      })
      return { capturedLogs, testLogger }
    }

    const runIgnoreCause = (options?: IgnoreCauseOptions, currentLogLevel: LogLevel.Severity = "Info") =>
      Effect.gen(function*() {
        const { capturedLogs, testLogger } = makeTestLogger()
        const program = options === undefined
          ? Effect.fail("boom").pipe(Effect.ignoreCause)
          : Effect.fail("boom").pipe(Effect.ignoreCause(options))
        yield* program.pipe(
          Effect.provide(Logger.layer([testLogger])),
          Effect.provideService(References.MinimumLogLevel, "Trace"),
          Effect.provideService(References.CurrentLogLevel, currentLogLevel)
        )
        return capturedLogs
      })

    it.effect("ignores defects", () =>
      Effect.gen(function*() {
        const exit = yield* Effect.die("boom").pipe(Effect.ignoreCause, Effect.exit)
        assert.deepStrictEqual(exit, Exit.void)
      }))

    it.effect("ignores interrupts", () =>
      Effect.gen(function*() {
        const ignored = yield* Effect.interrupt.pipe(Effect.ignoreCause, Effect.exit)
        assert.deepStrictEqual(ignored, Exit.void)
      }))

    it.effect("does not log when log is omitted", () =>
      Effect.gen(function*() {
        const logs = yield* runIgnoreCause()
        assert.strictEqual(logs.length, 0)
      }))

    it.effect("does not log when log is false", () =>
      Effect.gen(function*() {
        const logs = yield* runIgnoreCause({ log: false })
        assert.strictEqual(logs.length, 0)
      }))

    it.effect("logs with the current level when log is true", () =>
      Effect.gen(function*() {
        const logs = yield* runIgnoreCause({ log: true }, "Warn")
        assert.strictEqual(logs.length, 1)
        assert.strictEqual(logs[0].logLevel, "Warn")
        assertCauseFail(logs[0].cause, "boom")
      }))

    it.effect("logs with the provided level when log is a LogLevel", () =>
      Effect.gen(function*() {
        const logs = yield* runIgnoreCause({ log: "Error" }, "Warn")
        assert.strictEqual(logs.length, 1)
        assert.strictEqual(logs[0].logLevel, "Error")
        assertCauseFail(logs[0].cause, "boom")
      }))

    it.effect("prepends the provided message when logging", () =>
      Effect.gen(function*() {
        const logs = yield* runIgnoreCause({ log: true, message: "Ignoring cause" })
        assert.strictEqual(logs.length, 1)
        assert.deepStrictEqual(logs[0].message, ["Ignoring cause"])
        assertCauseFail(logs[0].cause, "boom")
      }))
  })

  describe("error handling", () => {
    class ErrorA extends Data.TaggedError("A") {}
    class ErrorB extends Data.TaggedError("B") {}
    class ErrorC extends Data.Error {}

    it.effect("catchTag", () =>
      Effect.gen(function*() {
        let error: ErrorA | ErrorB | ErrorC = new ErrorA()
        const effect = Effect.failSync(() => error).pipe(
          Effect.catchTag("A", (_) => Effect.succeed(1)),
          Effect.catchTag("B", (_) => Effect.succeed(2)),
          Effect.orElseSucceed(() => 3)
        )
        assert.strictEqual(yield* effect, 1)
        error = new ErrorB()
        assert.strictEqual(yield* effect, 2)
        error = new ErrorC()
        assert.strictEqual(yield* effect, 3)
      }))

    it.effect("catchTag orElse", () =>
      Effect.gen(function*() {
        let error: ErrorA | ErrorB | ErrorC = new ErrorA()
        const effect = Effect.failSync(() => error).pipe(
          Effect.catchTag(["A", "B"], (_) => Effect.succeed(1), (_) => {
            return Effect.succeed(2)
          })
        )
        assert.strictEqual(yield* effect, 1)
        error = new ErrorB()
        assert.strictEqual(yield* effect, 1)
        error = new ErrorC()
        assert.strictEqual(yield* effect, 2)
      }))

    it.effect("catchTags orElse", () =>
      Effect.gen(function*() {
        let error: ErrorA | ErrorB | ErrorC = new ErrorA()
        const effect = Effect.failSync(() => error).pipe(
          Effect.catchTags(
            {
              A: (_) => Effect.succeed(1),
              B: (_) => Effect.succeed(2)
            },
            (_) => Effect.succeed(3)
          )
        )
        assert.strictEqual(yield* effect, 1)
        error = new ErrorB()
        assert.strictEqual(yield* effect, 2)
        error = new ErrorC()
        assert.strictEqual(yield* effect, 3)
      }))

    it.effect("tapErrorTag", () =>
      Effect.gen(function*() {
        let error: ErrorA | ErrorB | ErrorC = new ErrorA()
        const tapped: Array<string> = []
        const effect = Effect.failSync(() => error).pipe(
          Effect.tapErrorTag("A", () =>
            Effect.sync(() => {
              tapped.push("A")
            })),
          Effect.tapErrorTag("B", () =>
            Effect.sync(() => {
              tapped.push("B")
            })),
          Effect.exit
        )
        assert.deepStrictEqual(yield* effect, Exit.fail(error))
        assert.deepStrictEqual(tapped, ["A"])

        tapped.length = 0
        error = new ErrorB()
        assert.deepStrictEqual(yield* effect, Exit.fail(error))
        assert.deepStrictEqual(tapped, ["B"])

        tapped.length = 0
        error = new ErrorC()
        assert.deepStrictEqual(yield* effect, Exit.fail(error))
        assert.deepStrictEqual(tapped, [])
      }))

    it.effect("catchIf with refinement", () =>
      Effect.gen(function*() {
        interface ErrorA {
          readonly _tag: "ErrorA"
        }
        interface ErrorB {
          readonly _tag: "ErrorB"
        }
        const effect: Effect.Effect<never, ErrorA | ErrorB> = Effect.fail({ _tag: "ErrorB" as const })
        const result = yield* pipe(
          effect,
          Effect.catchIf((e): e is ErrorA => e._tag === "ErrorA", Effect.succeed),
          Effect.exit
        )
        assert.deepStrictEqual(result, Exit.fail({ _tag: "ErrorB" as const }))
      }))

    it.effect("catchIf with refinement orElse", () =>
      Effect.gen(function*() {
        interface ErrorA {
          readonly _tag: "ErrorA"
        }
        interface ErrorB {
          readonly _tag: "ErrorB"
        }
        const effect: Effect.Effect<never, ErrorA | ErrorB> = Effect.fail({ _tag: "ErrorB" as const })
        const result = yield* pipe(
          effect,
          Effect.catchIf((e): e is ErrorA => e._tag === "ErrorA", Effect.succeed, (_) => {
            return Effect.succeed(1)
          })
        )
        assert.deepStrictEqual(result, 1)
      }))

    it.effect("catchNoSuchElement", () =>
      Effect.gen(function*() {
        const some = yield* Effect.fromNullishOr("value").pipe(Effect.catchNoSuchElement)
        assert.deepStrictEqual(some, Option.some("value"))

        const none = yield* Effect.fromNullishOr(null as string | null).pipe(Effect.catchNoSuchElement)
        assert.deepStrictEqual(none, Option.none())
      }))

    it.effect("catchNoSuchElement preserves other errors", () =>
      Effect.gen(function*() {
        const error = new ErrorA()
        const result = yield* Effect.fail(error).pipe(Effect.catchNoSuchElement, Effect.exit)
        assert.deepStrictEqual(result, Exit.fail(error))
      }))
  })

  describe("match", () => {
    it("preserves handler receivers and treats thrown exceptions as defects", () => {
      const options = {
        value: 42,
        onFailure(this: { value: number }) {
          return this.value
        },
        onSuccess(this: { value: number }) {
          return this.value
        }
      }
      assert.strictEqual(Effect.runSync(Effect.match(Effect.succeed(1), options)), 42)
      assert.strictEqual(Effect.runSync(Effect.match(Effect.fail("error"), options)), 42)
      assert.strictEqual(Effect.runSync(Effect.matchCause(Effect.succeed(1), options)), 42)
      assert.strictEqual(Effect.runSync(Effect.matchCause(Effect.fail("error"), options)), 42)
      const boom = new Error("boom")
      assertExitDefect(
        Effect.runSyncExit(Effect.match(Effect.succeed(1), {
          onFailure: () => 0,
          onSuccess: () => {
            throw boom
          }
        })),
        boom
      )
    })

    it("passes only the outcome to handlers", () => {
      function handler(_outcome: unknown) {
        // eslint-disable-next-line prefer-rest-params
        return arguments.length
      }
      const options = { onFailure: handler, onSuccess: handler }
      for (const source of [Effect.succeed(1), Effect.fail("error")]) {
        assert.strictEqual(Effect.runSync(Effect.match(source, options)), 1)
        assert.strictEqual(Effect.runSync(Effect.matchCause(source, options)), 1)
      }
    })

    it("passes defects through without calling onFailure", () => {
      const boom = new Error("boom")
      assertExitDefect(
        Effect.runSyncExit(Effect.match(Effect.die(boom), { onFailure: () => "handled", onSuccess: () => "ok" })),
        boom
      )
    })
  })

  describe("flatMap", () => {
    it("passes only the value to callbacks regardless of declared arity", () => {
      function callback(this: unknown, _value: number) {
        // eslint-disable-next-line prefer-rest-params
        return Effect.succeed([this, arguments.length])
      }
      assert.deepStrictEqual(Effect.runSync(Effect.flatMap(Effect.succeed(1), callback)), [undefined, 1])
    })
  })

  describe("zip", () => {
    it.effect("concurrent: false", () => {
      const executionOrder: Array<string> = []
      const task1 = Effect.succeed("a").pipe(
        Effect.delay(50),
        Effect.tap(() => Effect.sync(() => executionOrder.push("task1")))
      )
      const task2 = Effect.succeed(1).pipe(
        Effect.delay(1),
        Effect.tap(() => Effect.sync(() => executionOrder.push("task2")))
      )
      return Effect.gen(function*() {
        const fiber = yield* Effect.forkChild(Effect.zip(task1, task2))
        yield* TestClock.adjust(51)
        const result = yield* Fiber.join(fiber)
        assert.deepStrictEqual(result, ["a", 1])
        assert.deepStrictEqual(executionOrder, ["task1", "task2"])
      })
    })
    it.effect("concurrent: true", () => {
      const executionOrder: Array<string> = []
      const task1 = Effect.succeed("a").pipe(
        Effect.delay(50),
        Effect.tap(() => Effect.sync(() => executionOrder.push("task1")))
      )
      const task2 = Effect.succeed(1).pipe(
        Effect.delay(1),
        Effect.tap(() => Effect.sync(() => executionOrder.push("task2")))
      )
      return Effect.gen(function*() {
        const fiber = yield* Effect.forkChild(Effect.zip(task1, task2, { concurrent: true }))
        yield* TestClock.adjust(50)
        const result = yield* Fiber.join(fiber)
        assert.deepStrictEqual(result, ["a", 1])
        assert.deepStrictEqual(executionOrder, ["task2", "task1"])
      })
    })
    it.effect("concurrent: true interrupts the other side on failure", () => {
      const interrupted: Array<string> = []
      const task1 = Effect.never.pipe(
        Effect.onInterrupt(() => Effect.sync(() => interrupted.push("task1")))
      )
      const task2 = Effect.fail("boom").pipe(Effect.delay(10))
      return Effect.gen(function*() {
        const fiber = yield* Effect.forkChild(Effect.zip(task1, task2, { concurrent: true }))
        yield* TestClock.adjust(10)
        const result = yield* Fiber.await(fiber)
        assert.deepStrictEqual(result, Exit.fail("boom"))
        assert.deepStrictEqual(interrupted, ["task1"])
      })
    })
  })

  describe("zipWith", () => {
    it.effect("concurrent: false", () => {
      const executionOrder: Array<string> = []
      const task1 = Effect.succeed("a").pipe(
        Effect.delay(50),
        Effect.tap(() => Effect.sync(() => executionOrder.push("task1")))
      )
      const task2 = Effect.succeed(1).pipe(
        Effect.delay(1),
        Effect.tap(() => Effect.sync(() => executionOrder.push("task2")))
      )
      return Effect.gen(function*() {
        const fiber = yield* Effect.forkChild(Effect.zipWith(task1, task2, (a, b) => a + b))
        yield* TestClock.adjust(51)
        const result = yield* Fiber.join(fiber)
        assert.deepStrictEqual(result, "a1")
        assert.deepStrictEqual(executionOrder, ["task1", "task2"])
      })
    })
    it.effect("concurrent: true", () => {
      const executionOrder: Array<string> = []
      const task1 = Effect.succeed("a").pipe(
        Effect.delay(50),
        Effect.tap(() => Effect.sync(() => executionOrder.push("task1")))
      )
      const task2 = Effect.succeed(1).pipe(
        Effect.delay(1),
        Effect.tap(() => Effect.sync(() => executionOrder.push("task2")))
      )
      return Effect.gen(function*() {
        const fiber = yield* Effect.forkChild(Effect.zipWith(task1, task2, (a, b) => a + b, { concurrent: true }))
        yield* TestClock.adjust(50)
        const result = yield* Fiber.join(fiber)
        assert.deepStrictEqual(result, "a1")
        assert.deepStrictEqual(executionOrder, ["task2", "task1"])
      })
    })
    it.effect("concurrent: true interrupts the other side on failure", () => {
      const interrupted: Array<string> = []
      const task1 = Effect.fail("boom").pipe(Effect.delay(10))
      const task2 = Effect.never.pipe(
        Effect.onInterrupt(() => Effect.sync(() => interrupted.push("task2")))
      )
      return Effect.gen(function*() {
        const fiber = yield* Effect.forkChild(
          Effect.zipWith(task1, task2, (a, b) => `${a}${b}`, { concurrent: true })
        )
        yield* TestClock.adjust(10)
        const result = yield* Fiber.await(fiber)
        assert.deepStrictEqual(result, Exit.fail("boom"))
        assert.deepStrictEqual(interrupted, ["task2"])
      })
    })
  })

  describe("catchCauseFilter", () => {
    it.effect("first argument as success", () =>
      Effect.gen(function*() {
        const result = yield* Effect.catchCauseFilter(Effect.succeed(1), (_) => Result.fail(_), () => Effect.fail("e2"))
        assert.deepStrictEqual(result, 1)
      }))
    it.effect("first argument as failure and predicate return false", () =>
      Effect.gen(function*() {
        const result = yield* Effect.flip(
          Effect.catchCauseFilter(Effect.fail("e1" as const), (_) => Result.fail(_), () => Effect.fail("e2" as const))
        )
        assert.deepStrictEqual(result, "e1")
      }))
    it.effect("first argument as failure and predicate return true", () =>
      Effect.gen(function*() {
        const result = yield* Effect.flip(
          Effect.catchCauseFilter(
            Effect.fail("e1" as const),
            (e) => Result.succeed(e),
            () => Effect.fail("e2" as const)
          )
        )
        assert.deepStrictEqual(result, "e2")
      }))
  })

  describe("catchIf with predicate", () => {
    it.effect("predicate match recovers", () =>
      Effect.gen(function*() {
        const result = yield* Effect.catchIf(
          Effect.fail("e1"),
          (e) => typeof e === "string",
          (e) => Effect.succeed(`recovered: ${e}`)
        )
        assert.deepStrictEqual(result, "recovered: e1")
      }))
    it.effect("predicate no match preserves error", () =>
      Effect.gen(function*() {
        const result = yield* Effect.exit(
          Effect.catchIf(
            Effect.fail("e1" as const),
            (_e) => false,
            () => Effect.succeed("recovered")
          )
        )
        assert.deepStrictEqual(result, Exit.fail("e1"))
      }))
  })

  describe("catchCauseIf with predicate", () => {
    it.effect("predicate match recovers", () =>
      Effect.gen(function*() {
        const result = yield* Effect.catchCauseIf(
          Effect.fail("e1"),
          Cause.hasFails,
          (cause) => Effect.succeed(`recovered: ${Cause.squash(cause)}`)
        )
        assert.deepStrictEqual(result, "recovered: e1")
      }))
    it.effect("predicate no match preserves error", () =>
      Effect.gen(function*() {
        const result = yield* Effect.exit(
          Effect.catchCauseIf(
            Effect.fail("e1" as const),
            constFalse,
            () => Effect.succeed("recovered")
          )
        )
        assert.deepStrictEqual(result, Exit.fail("e1"))
      }))
  })

  describe("tapCauseIf", () => {
    it.effect("filter match taps", () =>
      Effect.gen(function*() {
        const tapped: Array<string> = []
        const result = yield* Effect.exit(
          Effect.tapCauseFilter(
            Effect.fail("e1"),
            (cause) => Result.succeed(cause),
            (cause) => Effect.sync(() => tapped.push(Cause.squash(cause) as string))
          )
        )
        assert.deepStrictEqual(tapped, ["e1"])
        assert.deepStrictEqual(result, Exit.fail("e1"))
      }))
    it.effect("filter no match skips tap", () =>
      Effect.gen(function*() {
        const tapped: Array<string> = []
        const result = yield* Effect.exit(
          Effect.tapCauseFilter(
            Effect.fail("e1"),
            (cause) => Result.fail(cause),
            () => Effect.sync(() => tapped.push("tapped"))
          )
        )
        assert.deepStrictEqual(tapped, [])
        assert.deepStrictEqual(result, Exit.fail("e1"))
      }))
    it.effect("predicate match taps", () =>
      Effect.gen(function*() {
        const tapped: Array<string> = []
        const result = yield* Effect.exit(
          Effect.tapCauseIf(
            Effect.fail("e1"),
            Cause.hasFails,
            (cause) => Effect.sync(() => tapped.push(Cause.squash(cause) as string))
          )
        )
        assert.deepStrictEqual(tapped, ["e1"])
        assert.deepStrictEqual(result, Exit.fail("e1"))
      }))
    it.effect("predicate no match skips tap", () =>
      Effect.gen(function*() {
        const tapped: Array<string> = []
        const result = yield* Effect.exit(
          Effect.tapCauseIf(
            Effect.fail("e1"),
            constFalse,
            () => Effect.sync(() => tapped.push("tapped"))
          )
        )
        assert.deepStrictEqual(tapped, [])
        assert.deepStrictEqual(result, Exit.fail("e1"))
      }))
    it.effect("success skips tap", () =>
      Effect.gen(function*() {
        const tapped: Array<string> = []
        const result = yield* Effect.tapCauseIf(
          Effect.succeed(42),
          constTrue,
          () => Effect.sync(() => tapped.push("tapped"))
        )
        assert.deepStrictEqual(tapped, [])
        assert.deepStrictEqual(result, 42)
      }))
  })

  describe("onErrorIf", () => {
    it.effect("predicate match runs finalizer", () =>
      Effect.gen(function*() {
        const finalized: Array<string> = []
        const result = yield* Effect.exit(
          Effect.onErrorIf(
            Effect.fail("e1"),
            Cause.hasFails,
            (cause) => Effect.sync(() => finalized.push(Cause.squash(cause) as string))
          )
        )
        assert.deepStrictEqual(finalized, ["e1"])
        assert.deepStrictEqual(result, Exit.fail("e1"))
      }))
    it.effect("predicate no match skips finalizer", () =>
      Effect.gen(function*() {
        const finalized: Array<string> = []
        const result = yield* Effect.exit(
          Effect.onErrorIf(
            Effect.fail("e1"),
            constFalse,
            () => Effect.sync(() => finalized.push("finalized"))
          )
        )
        assert.deepStrictEqual(finalized, [])
        assert.deepStrictEqual(result, Exit.fail("e1"))
      }))
    it.effect("filter match runs finalizer", () =>
      Effect.gen(function*() {
        const finalized: Array<string> = []
        const result = yield* Effect.exit(
          Effect.onErrorFilter(
            Effect.fail("e1"),
            Cause.findError as Filter.Filter<Cause.Cause<string>, string>,
            (error: string) => Effect.sync(() => finalized.push(error))
          )
        )
        assert.deepStrictEqual(finalized, ["e1"])
        assert.deepStrictEqual(result, Exit.fail("e1"))
      }))
    it.effect("success skips finalizer", () =>
      Effect.gen(function*() {
        const finalized: Array<string> = []
        const result = yield* Effect.onErrorIf(
          Effect.succeed(42),
          constTrue,
          () => Effect.sync(() => finalized.push("finalized"))
        )
        assert.deepStrictEqual(finalized, [])
        assert.deepStrictEqual(result, 42)
      }))
  })

  describe("onExitIf", () => {
    it.effect("predicate match on success runs finalizer", () =>
      Effect.gen(function*() {
        const finalized: Array<string> = []
        const result = yield* Effect.onExitIf(
          Effect.succeed(42),
          Exit.isSuccess,
          (exit) => {
            if (Exit.isSuccess(exit)) {
              return Effect.sync(() => finalized.push(`success:${exit.value}`))
            }
            return Effect.void
          }
        )
        assert.deepStrictEqual(finalized, ["success:42"])
        assert.deepStrictEqual(result, 42)
      }))
    it.effect("predicate no match on failure skips finalizer", () =>
      Effect.gen(function*() {
        const finalized: Array<string> = []
        const result = yield* Effect.exit(
          Effect.onExitIf(
            Effect.fail("e1"),
            Exit.isSuccess,
            () => Effect.sync(() => finalized.push("finalized"))
          )
        )
        assert.deepStrictEqual(finalized, [])
        assert.deepStrictEqual(result, Exit.fail("e1"))
      }))
    it.effect("predicate match on failure runs finalizer", () =>
      Effect.gen(function*() {
        const finalized: Array<string> = []
        const result = yield* Effect.exit(
          Effect.onExitIf(
            Effect.fail("e1"),
            Exit.isFailure,
            (exit) => {
              if (Exit.isFailure(exit)) {
                return Effect.sync(() => finalized.push(`failure:${Cause.squash(exit.cause)}`))
              }
              return Effect.void
            }
          )
        )
        assert.deepStrictEqual(finalized, ["failure:e1"])
        assert.deepStrictEqual(result, Exit.fail("e1"))
      }))
    it.effect("filter match receives pass value and exit", () =>
      Effect.gen(function*() {
        const finalized: Array<string> = []
        const result = yield* Effect.onExitFilter(
          Effect.succeed(42),
          (exit) => Exit.isSuccess(exit) ? Result.succeed(`value:${exit.value}`) : Result.fail(exit),
          (value, exit) =>
            Effect.sync(() => finalized.push(`${value}:${Exit.isSuccess(exit) ? `success:${exit.value}` : "failure"}`))
        )
        assert.deepStrictEqual(finalized, ["value:42:success:42"])
        assert.deepStrictEqual(result, 42)
      }))
  })

  describe("filter with predicate/refinement", () => {
    it.effect("predicate filters iterable", () =>
      Effect.gen(function*() {
        const result = yield* Effect.filter(
          [1, 2, 3, 4, 5],
          (n: number) => n % 2 === 0
        )
        assert.deepStrictEqual(result, [2, 4])
      }))
    it.effect("refinement narrows iterable", () =>
      Effect.gen(function*() {
        const result = yield* Effect.filter(
          [1, "a", 2, "b", 3] as Array<number | string>,
          (x): x is number => typeof x === "number"
        )
        assert.deepStrictEqual(result, [1, 2, 3])
      }))
    it.effect("Filter.Filter overload maps pass values", () =>
      Effect.gen(function*() {
        const filter: Filter.Filter<number, string, number> = (n) =>
          n % 2 === 0 ? Result.succeed(`n=${n}`) : Result.fail(n)
        const result = yield* Effect.filterMap(
          [1, 2, 3, 4],
          filter
        )
        assert.deepStrictEqual(result, ["n=2", "n=4"])
      }))
  })

  describe("catch", () => {
    it.effect("first argument as success", () =>
      Effect.gen(function*() {
        const result = yield* Effect.catch(Effect.succeed(1), () => Effect.fail("e2" as const))
        assert.deepStrictEqual(result, 1)
      }))
    it.effect("first argument as failure", () =>
      Effect.gen(function*() {
        const result = yield* Effect.flip(Effect.catch(Effect.fail("e1" as const), () => Effect.fail("e2" as const)))
        assert.deepStrictEqual(result, "e2")
      }))
  })

  describe("firstSuccessOf", () => {
    it.effect("returns the first success and does not run later effects", () =>
      Effect.gen(function*() {
        const executed: Array<string> = []
        const result = yield* Effect.firstSuccessOf([
          Effect.sync(() => executed.push("first")).pipe(
            Effect.flatMap(() => Effect.fail("e1" as const))
          ),
          Effect.sync(() => executed.push("second")).pipe(
            Effect.as("success" as const)
          ),
          Effect.sync(() => executed.push("third")).pipe(
            Effect.as("unreachable" as const)
          )
        ])

        assert.strictEqual(result, "success")
        assert.deepStrictEqual(executed, ["first", "second"])
      }))

    it.effect("fails with the last failure when all effects fail", () =>
      Effect.gen(function*() {
        const result = yield* Effect.firstSuccessOf([
          Effect.fail("e1" as const),
          Effect.fail("e2" as const),
          Effect.fail("e3" as const)
        ]).pipe(Effect.flip)

        assert.strictEqual(result, "e3")
      }))

    it.effect("defects on an empty collection", () =>
      Effect.gen(function*() {
        const result = yield* Effect.firstSuccessOf([]).pipe(Effect.sandbox, Effect.flip)
        const reason = result.reasons[0]

        assert.isTrue(Cause.isDieReason(reason))
        if (Cause.isDieReason(reason)) {
          assert.instanceOf(reason.defect, Error)
          assert.strictEqual(reason.defect.message, "Received an empty collection of effects")
        }
      }))
  })

  describe("catchCause", () => {
    it.effect("first argument as success", () =>
      Effect.gen(function*() {
        const result = yield* Effect.catchCause(Effect.succeed(1), () => Effect.fail("e2" as const))
        assert.deepStrictEqual(result, 1)
      }))
    it.effect("first argument as failure", () =>
      Effect.gen(function*() {
        const result = yield* Effect.flip(
          Effect.catchCause(Effect.fail("e1" as const), () => Effect.fail("e2" as const))
        )
        assert.deepStrictEqual(result, "e2")
      }))
  })

  describe("transaction (composable transactions)", () => {
    describe("basic behavior", () => {
      it.effect("should create transaction boundaries when no transaction is active", () =>
        Effect.gen(function*() {
          const ref1 = TxRef.makeUnsafe(0)
          const ref2 = TxRef.makeUnsafe(100)

          yield* Effect.tx(TxRef.set(ref1, 10))

          yield* Effect.tx(TxRef.set(ref2, 200))

          const val1 = yield* Effect.tx(TxRef.get(ref1))
          const val2 = yield* Effect.tx(TxRef.get(ref2))

          assert.strictEqual(val1, 10)
          assert.strictEqual(val2, 200)
        }))

      it.effect("should allow TxRef.modify outside an existing transaction", () =>
        Effect.gen(function*() {
          const ref = TxRef.makeUnsafe(0)

          const result = yield* TxRef.modify(ref, (current) => [current + 1, current + 10])
          const value = yield* Effect.tx(TxRef.get(ref))

          assert.strictEqual(result, 1)
          assert.strictEqual(value, 10)
        }))

      it.effect("should roll back nested changes when the outer transaction fails", () =>
        Effect.gen(function*() {
          const ref1 = TxRef.makeUnsafe(0)
          const ref2 = TxRef.makeUnsafe(100)

          const parentError = yield* Effect.tx(Effect.gen(function*() {
            yield* TxRef.set(ref1, 10)

            yield* Effect.tx(TxRef.set(ref2, 200))

            return yield* Effect.fail("parent failed")
          })).pipe(Effect.flip)

          const val1 = yield* Effect.tx(TxRef.get(ref1))
          const val2 = yield* Effect.tx(TxRef.get(ref2))

          assert.strictEqual(parentError, "parent failed")
          assert.strictEqual(val1, 0)
          assert.strictEqual(val2, 100)
        }))

      it.effect("should allow catching nested failures in the same transaction", () =>
        Effect.gen(function*() {
          const ref1 = TxRef.makeUnsafe(0)
          const ref2 = TxRef.makeUnsafe(100)

          yield* Effect.tx(Effect.gen(function*() {
            yield* TxRef.set(ref1, 10)

            const childResult = yield* Effect.tx(Effect.gen(function*() {
              yield* TxRef.set(ref2, 200)
              return yield* Effect.fail("child failed")
            })).pipe(Effect.result)

            yield* TxRef.set(ref1, 20)

            assert.strictEqual(Result.isFailure(childResult), true)
          }))

          const val1 = yield* Effect.tx(TxRef.get(ref1))
          const val2 = yield* Effect.tx(TxRef.get(ref2))

          assert.strictEqual(val1, 20)
          assert.strictEqual(val2, 200)
        }))
    })

    describe("transaction nesting", () => {
      it.effect("should handle multiple levels of nested composed transactions", () =>
        Effect.gen(function*() {
          const ref1 = TxRef.makeUnsafe(0)
          const ref2 = TxRef.makeUnsafe(0)
          const ref3 = TxRef.makeUnsafe(0)

          yield* Effect.tx(Effect.gen(function*() {
            yield* TxRef.set(ref1, 1)

            yield* Effect.tx(Effect.gen(function*() {
              yield* TxRef.set(ref2, 2)

              yield* Effect.tx(TxRef.set(ref3, 3))
            }))
          }))

          const val1 = yield* Effect.tx(TxRef.get(ref1))
          const val2 = yield* Effect.tx(TxRef.get(ref2))
          const val3 = yield* Effect.tx(TxRef.get(ref3))

          assert.strictEqual(val1, 1)
          assert.strictEqual(val2, 2)
          assert.strictEqual(val3, 3)
        }))
    })

    describe("transaction composition behavior", () => {
      it.effect("should compose nested tx calls into the same transaction", () =>
        Effect.gen(function*() {
          const ref1 = TxRef.makeUnsafe(0)
          const ref2 = TxRef.makeUnsafe(0)

          yield* Effect.tx(Effect.gen(function*() {
            yield* TxRef.set(ref1, 10)

            yield* Effect.tx(TxRef.set(ref2, 20))
          }))

          const val1 = yield* Effect.tx(TxRef.get(ref1))
          const val2 = yield* Effect.tx(TxRef.get(ref2))

          assert.strictEqual(val1, 10)
          assert.strictEqual(val2, 20)
        }))

      it.effect("should rollback the entire composed transaction on failure", () =>
        Effect.gen(function*() {
          const ref = TxRef.makeUnsafe(0)

          const txError = yield* Effect.tx(Effect.gen(function*() {
            yield* TxRef.set(ref, 10)

            return yield* Effect.tx(Effect.gen(function*() {
              yield* TxRef.set(ref, 20)
              return yield* Effect.fail("nested failure")
            }))
          })).pipe(Effect.flip)

          const valueAfterFailure = yield* Effect.tx(TxRef.get(ref))

          assert.strictEqual(txError, "nested failure")
          assert.strictEqual(valueAfterFailure, 0)
        }))

      it.effect("should preserve nested writes when nested failure is caught", () =>
        Effect.gen(function*() {
          const ref = TxRef.makeUnsafe(0)

          yield* Effect.tx(Effect.gen(function*() {
            yield* TxRef.set(ref, 10)

            const childError = yield* Effect.tx(Effect.gen(function*() {
              yield* TxRef.set(ref, 20)
              return yield* Effect.fail("transaction nested failure")
            })).pipe(Effect.flip)

            assert.strictEqual(childError, "transaction nested failure")
          }))

          const transactionValue = yield* Effect.tx(TxRef.get(ref))

          assert.strictEqual(transactionValue, 20)
        }))
    })

    describe("retry", () => {
      it.effect("should rerun when a read ref changed while the transaction was suspended", () =>
        Effect.gen(function*() {
          const ref = TxRef.makeUnsafe(0)
          const read = yield* Deferred.make<void>()
          const committed = yield* Deferred.make<void>()

          const transaction = yield* Effect.tx(Effect.gen(function*() {
            const value = yield* TxRef.get(ref)
            if (value === 0) {
              yield* Deferred.succeed(read, undefined)
              yield* Deferred.await(committed)
              return yield* Effect.txRetry
            }
            return value
          })).pipe(Effect.forkChild)

          yield* Deferred.await(read)
          yield* Effect.tx(TxRef.set(ref, 1))
          yield* Deferred.succeed(committed, undefined)

          const joined = yield* Fiber.join(transaction).pipe(
            Effect.timeoutOption("1 second"),
            Effect.forkChild
          )
          yield* TestClock.adjust("1 second")

          assert.deepStrictEqual(yield* Fiber.join(joined), Option.some(1))
        }))

      it.effect("commits wake the waiters of refs they write, not refs they read", () =>
        Effect.gen(function*() {
          const gate = TxRef.makeUnsafe(0)
          const other = TxRef.makeUnsafe(0)
          let runs = 0
          const waiter = yield* Effect.tx(Effect.gen(function*() {
            runs++
            const value = yield* TxRef.get(gate)
            if (value === 0) return yield* Effect.txRetry
            return value
          })).pipe(Effect.forkChild({ startImmediately: true }))

          yield* Effect.tx(Effect.gen(function*() {
            yield* TxRef.get(gate)
            yield* TxRef.set(other, 1)
          }))
          yield* Effect.repeat(Effect.yieldNow, { times: 10 })
          assert.strictEqual(runs, 1, "reading a ref should not wake its waiters")

          yield* Effect.tx(TxRef.set(gate, 0))
          yield* Effect.repeat(Effect.yieldNow, { times: 10 })
          assert.strictEqual(runs, 2, "writing the same value should wake its waiters")

          yield* Effect.tx(TxRef.set(gate, 1))
          assert.strictEqual(yield* Fiber.join(waiter), 1)
        }))

      it.effect("a write of -0 over 0 is published and wakes its waiters", () =>
        Effect.gen(function*() {
          const zero = TxRef.makeUnsafe(0)
          const negativeZero = yield* Effect.tx(Effect.gen(function*() {
            const value = yield* TxRef.get(zero)
            if (Object.is(value, 0)) return yield* Effect.txRetry
            return 1 / value
          })).pipe(Effect.forkChild({ startImmediately: true }))
          yield* Effect.tx(TxRef.set(zero, -0))

          yield* Effect.repeat(Effect.yieldNow, { times: 10 })
          assert.deepStrictEqual(negativeZero.pollUnsafe(), Exit.succeed(-Infinity), "-0 over 0 never woke its waiter")
        }))
    })
  })

  describe("Effect.fn", () => {
    it.effect("should support pipeable arguments", () => {
      const fn = Effect.fn(function*(s: string) {
        return s.length
      }, (effect, ...args) => effect.pipe(Effect.map((result) => [result, ...args])))
      return Effect.gen(function*() {
        const result = yield* fn("a")
        assert.deepStrictEqual(result, [1, "a"])
      })
    })

    it.effect("should support self with pipeable arguments", () => {
      const self = { prefix: "bound" }
      const fn = Effect.fn(
        { self },
        function*(this: typeof self, value: string) {
          return `${this.prefix}:${value}`
        },
        Effect.map((value) => value.toUpperCase())
      )
      return Effect.gen(function*() {
        const result = yield* fn("value")
        assert.strictEqual(result, "BOUND:VALUE")
      })
    })

    it("should proxy body length", () => {
      const traced = Effect.fn(function*(a: string, b: number) {
        return a.length + b
      })
      const named = Effect.fn("named")(function*(a: string, b: number, c: boolean) {
        return c ? a.length + b : b
      })
      const untraced = Effect.fnUntraced(function*(a: string, b: number) {
        return a.length + b
      }, Effect.map((n) => n))

      assert.strictEqual(traced.length, 2)
      assert.strictEqual(named.length, 3)
      assert.strictEqual(untraced.length, 2)
    })

    it.effect("should reuse the definition frame across calls", () => {
      const fn = Effect.fn("traced")(function*() {
        return (yield* References.CurrentStackFrame)!
      })
      return Effect.gen(function*() {
        const first = yield* fn()
        const second = yield* fn()
        assert.strictEqual(first.parent?.name, "traced (definition)")
        assert.include(first.parent?.stack(), "Effect.test.ts")
        assert.strictEqual(first.parent?.stack(), second.parent?.stack())
        assert.notStrictEqual(first.stack(), second.stack())
      })
    })
  })

  describe("catchReason", () => {
    class RateLimitError extends Data.TaggedError("RateLimitError")<{
      readonly retryAfter: number
    }> {}

    class QuotaExceededError extends Data.TaggedError("QuotaExceededError")<{
      readonly limit: number
    }> {}

    class AiError extends Data.TaggedError("AiError")<{
      readonly reason: RateLimitError | QuotaExceededError
    }> {}

    class OtherError extends Data.TaggedError("OtherError")<{
      readonly message: string
    }> {}

    it.effect("catches matching reason - handler succeeds", () =>
      Effect.gen(function*() {
        const result = yield* Effect.fail(
          new AiError({ reason: new RateLimitError({ retryAfter: 60 }) })
        ).pipe(
          Effect.catchReason("AiError", "RateLimitError", (r) => Effect.succeed(`retry: ${r.retryAfter}`))
        )
        assert.strictEqual(result, "retry: 60")
      }))

    it.effect("orElse", () =>
      Effect.gen(function*() {
        const result = yield* Effect.fail(
          new AiError({ reason: new QuotaExceededError({ limit: 100 }) })
        ).pipe(
          Effect.catchReason(
            "AiError",
            "RateLimitError",
            (r) => Effect.succeed(`retry: ${r.retryAfter}`),
            (_) => Effect.succeed("quota")
          )
        )
        assert.strictEqual(result, "quota")
      }))

    it.effect("catches matching reason - handler fails", () =>
      Effect.gen(function*() {
        const reason = new RateLimitError({ retryAfter: 60 })
        const error = new OtherError({ message: "handled" })
        const exit = yield* Effect.fail(new AiError({ reason })).pipe(
          Effect.catchReason("AiError", "RateLimitError", () => Effect.fail(error)),
          Effect.exit
        )
        assertExitFailure(exit, Cause.fail(error))
      }))

    it.effect("ignores non-matching reason", () =>
      Effect.gen(function*() {
        const reason = new QuotaExceededError({ limit: 100 })
        const exit = yield* Effect.fail(new AiError({ reason })).pipe(
          Effect.catchReason("AiError", "RateLimitError", () => Effect.succeed("no")),
          Effect.exit
        )
        assertExitFailure(exit, Cause.fail(new AiError({ reason })))
      }))

    it.effect("preserves the cause for a non-matching reason", () =>
      Effect.gen(function*() {
        const error = new AiError({ reason: new QuotaExceededError({ limit: 100 }) })
        const result = yield* Effect.gen(function*() {
          yield* Effect.addFinalizer(() => Effect.die("finalizer failure"))
          return yield* Effect.fail(error)
        }).pipe(
          Effect.scoped,
          Effect.catchReason("AiError", "RateLimitError", () => Effect.succeed("no")),
          Effect.exit
        )
        assert.deepStrictEqual(
          result,
          Exit.failCause(Cause.combine(Cause.fail(error), Cause.die("finalizer failure")))
        )
      }))

    it.effect("ignores non-matching parent tag", () =>
      Effect.gen(function*() {
        const error = new OtherError({ message: "test" })
        const exit = yield* (Effect.fail(error) as Effect.Effect<never, AiError | OtherError>).pipe(
          Effect.catchReason("AiError", "RateLimitError", () => Effect.succeed("no")),
          Effect.exit
        )
        assertExitFailure(exit, Cause.fail(error))
      }))
  })

  describe("catchReasons", () => {
    class RateLimitError extends Data.TaggedError("RateLimitError")<{
      readonly retryAfter: number
    }> {}

    class QuotaExceededError extends Data.TaggedError("QuotaExceededError")<{
      readonly limit: number
    }> {}

    class AiError extends Data.TaggedError("AiError")<{
      readonly reason: RateLimitError | QuotaExceededError
    }> {}

    it.effect("catches with object handlers", () =>
      Effect.gen(function*() {
        const result = yield* Effect.fail(
          new AiError({ reason: new RateLimitError({ retryAfter: 60 }) })
        ).pipe(
          Effect.catchReasons("AiError", {
            RateLimitError: (r) => Effect.succeed(`rate: ${r.retryAfter}`),
            QuotaExceededError: (r) => Effect.succeed(`quota: ${r.limit}`)
          })
        )
        assert.strictEqual(result, "rate: 60")
      }))

    it.effect("orElse", () =>
      Effect.gen(function*() {
        const result = yield* Effect.fail(
          new AiError({ reason: new RateLimitError({ retryAfter: 60 }) })
        ).pipe(
          Effect.catchReasons("AiError", {
            QuotaExceededError: (r) => Effect.succeed(`quota: ${r.limit}`)
          }, (_) => Effect.succeed("orElse"))
        )
        assert.strictEqual(result, "orElse")
      }))

    it.effect("catches second reason type", () =>
      Effect.gen(function*() {
        const result = yield* Effect.fail(
          new AiError({ reason: new QuotaExceededError({ limit: 100 }) })
        ).pipe(
          Effect.catchReasons("AiError", {
            RateLimitError: (r) => Effect.succeed(`rate: ${r.retryAfter}`),
            QuotaExceededError: (r) => Effect.succeed(`quota: ${r.limit}`)
          })
        )
        assert.strictEqual(result, "quota: 100")
      }))

    it.effect("partial handlers - unhandled passes through", () =>
      Effect.gen(function*() {
        const reason = new QuotaExceededError({ limit: 100 })
        const exit = yield* Effect.fail(new AiError({ reason })).pipe(
          Effect.catchReasons("AiError", {
            RateLimitError: () => Effect.succeed("handled")
          }),
          Effect.exit
        )
        assertExitFailure(exit, Cause.fail(new AiError({ reason })))
      }))

    it.effect("preserves the cause for an unhandled reason", () =>
      Effect.gen(function*() {
        const error = new AiError({ reason: new QuotaExceededError({ limit: 100 }) })
        const result = yield* Effect.gen(function*() {
          yield* Effect.addFinalizer(() => Effect.die("finalizer failure"))
          return yield* Effect.fail(error)
        }).pipe(
          Effect.scoped,
          Effect.catchReasons("AiError", {
            RateLimitError: () => Effect.succeed("handled")
          }),
          Effect.exit
        )
        assert.deepStrictEqual(
          result,
          Exit.failCause(Cause.combine(Cause.fail(error), Cause.die("finalizer failure")))
        )
      }))
  })

  describe("unwrapReason", () => {
    class RateLimitError extends Data.TaggedError("RateLimitError")<{
      readonly retryAfter: number
    }> {}

    class QuotaExceededError extends Data.TaggedError("QuotaExceededError")<{
      readonly limit: number
    }> {}

    class AiError extends Data.TaggedError("AiError")<{
      readonly reason: RateLimitError | QuotaExceededError
    }> {}

    class OtherError extends Data.TaggedError("OtherError")<{
      readonly message: string
    }> {}

    it.effect("extracts reason into error channel", () =>
      Effect.gen(function*() {
        const reason = new RateLimitError({ retryAfter: 60 })
        const exit = yield* Effect.fail(new AiError({ reason })).pipe(
          Effect.unwrapReason("AiError"),
          Effect.exit
        )
        assertExitFailure(exit, Cause.fail(reason))
      }))

    it.effect("extracts second reason type", () =>
      Effect.gen(function*() {
        const reason = new QuotaExceededError({ limit: 100 })
        const exit = yield* Effect.fail(new AiError({ reason })).pipe(
          Effect.unwrapReason("AiError"),
          Effect.exit
        )
        assertExitFailure(exit, Cause.fail(reason))
      }))

    it.effect("preserves other errors", () =>
      Effect.gen(function*() {
        const error = new OtherError({ message: "test" })
        const exit = yield* (Effect.fail(error) as Effect.Effect<never, AiError | OtherError>).pipe(
          Effect.unwrapReason("AiError"),
          Effect.exit
        )
        assertExitFailure(exit, Cause.fail(error))
      }))
  })

  describe("cached", () => {
    it.effect("runs the effect once for concurrent callers", () =>
      Effect.gen(function*() {
        const release = yield* Deferred.make<void>()
        let count = 0
        const cached = yield* Effect.cached(
          Effect.gen(function*() {
            count++
            yield* Deferred.await(release)
            return count
          })
        )

        const fibers = yield* Effect.forEach([1, 2, 3], () => cached.pipe(Effect.forkChild({ startImmediately: true })))
        assert.strictEqual(count, 1)

        yield* Deferred.succeed(release, void 0)
        assert.deepStrictEqual(yield* Fiber.awaitAll(fibers), [Exit.succeed(1), Exit.succeed(1), Exit.succeed(1)])
      }))

    it.effect("replays failures", () =>
      Effect.gen(function*() {
        let count = 0
        const cached = yield* Effect.cached(
          Effect.sync(() => count++).pipe(Effect.andThen(Effect.fail("boom")))
        )

        assert.deepStrictEqual(yield* Effect.exit(cached), Exit.fail("boom"))
        assert.deepStrictEqual(yield* Effect.exit(cached), Exit.fail("boom"))
        assert.strictEqual(count, 1)
      }))

    it.effect("interrupting a waiter leaves the owner running", () =>
      Effect.gen(function*() {
        const started = yield* Deferred.make<void>()
        const release = yield* Deferred.make<void>()
        const cached = yield* Effect.cached(
          Deferred.succeed(started, void 0).pipe(
            Effect.andThen(Deferred.await(release)),
            Effect.as(42)
          )
        )

        const owner = yield* cached.pipe(Effect.forkChild({ startImmediately: true }))
        yield* Deferred.await(started)
        const waiter = yield* cached.pipe(Effect.forkChild({ startImmediately: true }))
        yield* Fiber.interrupt(waiter)
        assert.isTrue(Exit.hasInterrupts(yield* Fiber.await(waiter)))

        yield* Deferred.succeed(release, void 0)
        assert.strictEqual(yield* Fiber.join(owner), 42)
        assert.strictEqual(yield* cached, 42)
      }))

    it.effect("shares a run until every caller is interrupted, then starts fresh", () =>
      Effect.gen(function*() {
        let runs = 0
        const started = yield* Deferred.make<void>()
        const finalizing = yield* Deferred.make<void>()
        const finishFinalizer = yield* Deferred.make<void>()
        const cached = yield* Effect.cached(
          Effect.suspend(() => {
            if (++runs > 1) return Effect.succeed(runs)
            return Deferred.succeed(started, void 0).pipe(
              Effect.andThen(Effect.never),
              Effect.onInterrupt(() =>
                Deferred.succeed(finalizing, void 0).pipe(Effect.andThen(Deferred.await(finishFinalizer)))
              )
            )
          })
        )

        const first = yield* cached.pipe(Effect.forkChild({ startImmediately: true }))
        yield* Deferred.await(started)
        const second = yield* cached.pipe(Effect.forkChild({ startImmediately: true }))
        yield* Fiber.interrupt(first)
        assert.isFalse(yield* Deferred.isDone(finalizing))

        // A call made while the abandoned run finalizes starts a fresh run.
        const interruptSecond = yield* Effect.forkChild(Fiber.interrupt(second), { startImmediately: true })
        yield* Deferred.await(finalizing)
        const fresh = yield* cached.pipe(Effect.forkChild({ startImmediately: true }))
        yield* Deferred.succeed(finishFinalizer, void 0)
        yield* Fiber.join(interruptSecond)
        assert.deepStrictEqual(yield* Fiber.await(fresh), Exit.succeed(2))
      }))
  })

  describe("cachedWithTTL", () => {
    it.effect("skips the ttl callback on interruption and invokes it once on the next successful run", () =>
      Effect.gen(function*() {
        let runs = 0
        const exits: Array<Exit.Exit<number>> = []
        const cached = yield* Effect.cachedWithTTL(
          Effect.suspend(() => ++runs === 1 ? Effect.interrupt : Effect.succeed(runs)),
          (exit: Exit.Exit<number>) => {
            exits.push(exit)
            return "1 minute"
          }
        )

        assert.isTrue(Exit.hasInterrupts(yield* Effect.exit(cached)))
        assert.deepStrictEqual(exits, [])
        assert.strictEqual(yield* cached, 2)
        assert.strictEqual(yield* cached, 2)
        assert.deepStrictEqual(exits, [Exit.succeed(2)])
      }))

    it.effect("selects ttl from each fresh exit without evaluating on cache hits", () =>
      Effect.gen(function*() {
        let count = 0
        const exits: Array<Exit.Exit<number>> = []
        const cached = yield* Effect.cachedWithTTL(
          Effect.sync(() => ++count),
          (exit: Exit.Exit<number>) => {
            exits.push(exit)
            return Exit.isSuccess(exit) && exit.value === 1 ? "1 second" : Duration.seconds(3)
          }
        )

        assert.strictEqual(count, 0)
        assert.deepStrictEqual(exits, [])
        assert.strictEqual(yield* cached, 1)
        yield* TestClock.adjust("999 millis")
        assert.strictEqual(yield* cached, 1)
        assert.deepStrictEqual(exits, [Exit.succeed(1)])

        yield* TestClock.adjust("1 milli")
        assert.strictEqual(yield* cached, 2)
        yield* TestClock.adjust("1 second")
        assert.strictEqual(yield* cached, 2)
        yield* TestClock.adjust("2 seconds")
        assert.strictEqual(yield* cached, 3)
        assert.deepStrictEqual(exits, [Exit.succeed(1), Exit.succeed(2), Exit.succeed(3)])
      }))

    it.effect("supports a piped callback that skips failures and caches successes", () =>
      Effect.gen(function*() {
        let count = 0
        const exits: Array<Exit.Exit<number, string>> = []
        const cached = yield* Effect.suspend(() => ++count === 1 ? Effect.fail("boom") : Effect.succeed(count)).pipe(
          Effect.cachedWithTTL((exit: Exit.Exit<number, string>) => {
            exits.push(exit)
            return Exit.isFailure(exit) ? 0 : "1 second"
          })
        )

        assert.deepStrictEqual(yield* Effect.exit(cached), Exit.fail("boom"))
        assert.strictEqual(yield* cached, 2)
        assert.strictEqual(yield* cached, 2)
        assert.deepStrictEqual(exits, [Exit.fail("boom"), Exit.succeed(2)])
        yield* TestClock.adjust("1 second")
        assert.strictEqual(yield* cached, 3)
        assert.deepStrictEqual(exits, [Exit.fail("boom"), Exit.succeed(2), Exit.succeed(3)])
      }))

    it.effect("starts ttl from value creation", () =>
      Effect.gen(function*() {
        let count = 0
        const cached = yield* Effect.cachedWithTTL(
          Effect.sleep("2 seconds").pipe(
            Effect.flatMap(() =>
              Effect.sync(() => {
                count += 1
                return count
              })
            )
          ),
          "1 second"
        )

        const firstFiber = yield* Effect.forkChild(cached)
        yield* Effect.yieldNow
        yield* TestClock.adjust("2 seconds")
        assert.strictEqual(yield* Fiber.join(firstFiber), 1)

        const secondFiber = yield* Effect.forkChild(cached)
        yield* Effect.yieldNow
        yield* TestClock.adjust("2 seconds")
        assert.strictEqual(yield* Fiber.join(secondFiber), 1)
        assert.strictEqual(count, 1)
      }))
  })

  describe("cachedInvalidateWithTTL", () => {
    it.effect("supports a piped callback that skips failures and caches successes", () =>
      Effect.gen(function*() {
        let count = 0
        const exits: Array<Exit.Exit<number, string>> = []
        const [cached] = yield* Effect.suspend(() => ++count === 1 ? Effect.fail("boom") : Effect.succeed(count)).pipe(
          Effect.cachedInvalidateWithTTL((exit: Exit.Exit<number, string>) => {
            exits.push(exit)
            return Exit.isFailure(exit) ? 0 : "1 second"
          })
        )

        assert.deepStrictEqual(yield* Effect.exit(cached), Exit.fail("boom"))
        assert.strictEqual(yield* cached, 2)
        assert.strictEqual(yield* cached, 2)
        assert.deepStrictEqual(exits, [Exit.fail("boom"), Exit.succeed(2)])
        yield* TestClock.adjust("1 second")
        assert.strictEqual(yield* cached, 3)
        assert.deepStrictEqual(exits, [Exit.fail("boom"), Exit.succeed(2), Exit.succeed(3)])
      }))
  })

  describe("updateServiceScoped", () => {
    class CurrentNumber extends Context.Service<CurrentNumber, number>()("CurrentNumber") {}

    const CurrentNumberReference = Context.Reference<number>("CurrentNumberReference", {
      defaultValue: () => 1
    })

    const CurrentValues = Context.Reference<ReadonlyArray<string>>("CurrentValues", {
      defaultValue: () => []
    })

    it.effect("skips restoration when the provider expires before scope closure", () =>
      Effect.gen(function*() {
        const result = yield* Effect.gen(function*() {
          yield* Effect.updateServiceScoped(CurrentNumber, (value) => value + 1)
          return yield* CurrentNumber
        }).pipe(Effect.provideService(CurrentNumber, 1), Effect.scoped)

        assert.strictEqual(result, 2)
        assert.deepStrictEqual(yield* Effect.serviceOption(CurrentNumber), Option.none())
      }))

    it.effect("updates a Context.Service until the scope closes", () =>
      Effect.gen(function*() {
        const before = yield* CurrentNumber
        const during = yield* Effect.scoped(
          Effect.gen(function*() {
            yield* Effect.updateServiceScoped(CurrentNumber, (value) => value + 1)
            return yield* CurrentNumber
          })
        )
        const after = yield* CurrentNumber

        assert.deepStrictEqual([before, during, after], [1, 2, 1])
      }).pipe(Effect.provideService(CurrentNumber, 1)))

    it.effect("updates a Context.Reference until the scope closes", () =>
      Effect.gen(function*() {
        const before = yield* CurrentNumberReference
        const during = yield* Effect.scoped(
          Effect.gen(function*() {
            yield* Effect.updateServiceScoped(CurrentNumberReference, (value) => value + 1)
            return yield* CurrentNumberReference
          })
        )
        const after = yield* CurrentNumberReference

        assert.deepStrictEqual([before, during, after], [1, 2, 1])
      }))

    it.effect("supports merging the current value on reset", () =>
      Effect.gen(function*() {
        const scope = Scope.makeUnsafe()
        let resetValues: ReadonlyArray<ReadonlyArray<string>> | undefined

        const result = yield* Effect.gen(function*() {
          yield* Effect.updateServiceScoped(
            CurrentValues,
            (values) => [...values, "scoped"],
            {
              reset: (original, updated, current) => {
                resetValues = [original, updated, current]
                return [...original, ...current.filter((value) => !updated.includes(value))]
              }
            }
          )
          yield* Effect.withFiber((fiber) =>
            Effect.sync(() => {
              fiber.setContext(Context.add(fiber.context, CurrentValues, ["scoped", "external"]))
            })
          )
          yield* Scope.close(scope, Exit.void)
          return yield* CurrentValues
        }).pipe(Effect.provideService(Scope.Scope, scope))

        assert.deepStrictEqual(resetValues, [[], ["scoped"], ["scoped", "external"]])
        assert.deepStrictEqual(result, ["external"])
      }))
  })

  describe("provide", () => {
    class MyNumber extends Context.Service<MyNumber, number>()("MyNumber") {}

    it.effect("subsequent calls share MemoMap", () =>
      Effect.gen(function*() {
        let buildCount = 0
        const layer = Layer.sync(MyNumber, () => {
          buildCount += 1
          return 42
        })

        // @effect-diagnostics multipleEffectProvide:off
        yield* Effect.void.pipe(
          Effect.provide(layer, { local: true }), // local always builds the layer
          Effect.provide(layer),
          Effect.provide(layer)
        )

        assert.strictEqual(buildCount, 2)
      }))
  })

  describe("AsyncLocalStorage", () => {
    const storage = new AsyncLocalStorage<string>()
    const current = () => storage.getStore() ?? "none"

    const runWithStore = <A, E>(store: string | undefined, effect: Effect.Effect<A, E>): Promise<A> =>
      store === undefined ? Effect.runPromise(effect) : storage.run(store, () => Effect.runPromise(effect))

    const observe = Effect.gen(function*() {
      const resumed = current()
      const promise = yield* Effect.promise(async () => current())
      const timer = yield* Effect.callback<string>((resume) => {
        setTimeout(() => resume(Effect.succeed(current())), 1)
      })
      yield* Effect.sleep(1)
      const afterSleep = current()
      return { resumed, promise, timer, afterSleep }
    })

    const expected = (store: string) => ({ resumed: store, promise: store, timer: store, afterSleep: store })

    for (const waiterStore of [undefined, "waiter"]) {
      const label = waiterStore === undefined ? "without a store" : "with its own store"

      describe(`waiter ${label}`, () => {
        it("Deferred.await resumes in the awaiter's context", async () => {
          const deferred = Deferred.makeUnsafe<void>()
          const waiter = runWithStore(waiterStore, Effect.andThen(Deferred.await(deferred), observe))
          const completer = await runWithStore(
            "waker",
            Effect.sleep(5).pipe(
              Effect.andThen(Deferred.succeed(deferred, undefined)),
              Effect.andThen(Effect.sync(current))
            )
          )
          assert.strictEqual(completer, "waker")
          assert.deepStrictEqual(await waiter, expected(waiterStore ?? "none"))
        })

        it("Pool.get resumes in the waiter's context", async () => {
          const scope = Scope.makeUnsafe()
          try {
            const pool = await Effect.runPromise(
              Pool.make({ acquire: Effect.succeed("conn"), size: 1 }).pipe(
                // Warm the pool before starting the holder.
                Effect.tap((pool) => Effect.scoped(Pool.get(pool))),
                Scope.provide(scope)
              )
            )
            const holderAcquired = Deferred.makeUnsafe<string>()
            const holder = runWithStore(
              "waker",
              Effect.scoped(
                Pool.get(pool).pipe(
                  Effect.andThen(Effect.sync(current)),
                  Effect.tap((store) => Deferred.succeed(holderAcquired, store)),
                  Effect.andThen(Effect.sleep(10)),
                  Effect.andThen(Effect.sync(current))
                )
              )
            )
            assert.strictEqual(await Effect.runPromise(Deferred.await(holderAcquired)), "waker")
            const waiter = runWithStore(waiterStore, Effect.andThen(Effect.scoped(Pool.get(pool)), observe))
            assert.strictEqual(await holder, "waker")
            assert.deepStrictEqual(await waiter, expected(waiterStore ?? "none"))
          } finally {
            await Effect.runPromise(Scope.close(scope, Exit.void))
          }
        })
      })
    }
  })
})
