import { describe, expect, it } from "@effect/vitest"
import { Cause, Deferred, Duration, Effect, Exit, Fiber, Scope } from "effect"
import { TestClock } from "effect/testing"

describe("Scope", () => {
  describe("parallel finalization", () => {
    it.effect("executes finalizers in parallel", () =>
      Effect.gen(function*() {
        const scope = Scope.makeUnsafe("parallel")
        yield* Scope.addFinalizer(scope, Effect.sleep(Duration.seconds(1)))
        yield* Scope.addFinalizer(scope, Effect.sleep(Duration.seconds(1)))
        yield* Scope.addFinalizer(scope, Effect.sleep(Duration.seconds(1)))
        const fiber = yield* Effect.forkChild(Scope.close(scope, Exit.void), { startImmediately: true })
        expect(fiber.pollUnsafe()).toBeUndefined()
        yield* TestClock.adjust(Duration.seconds(1))
        expect(fiber.pollUnsafe()).toBeDefined()
      }))
  })

  describe("interrupted close", () => {
    for (const strategy of ["sequential", "parallel"] as const) {
      it.effect(strategy + ": completes direct close after interruption", () =>
        Effect.gen(function*() {
          const scope = Scope.makeUnsafe(strategy)
          const started = yield* Deferred.make<void>()
          const release = yield* Deferred.make<void>()
          const otherStarted = yield* Deferred.make<void>()
          const ran: Array<string> = []

          yield* Scope.addFinalizer(
            scope,
            Effect.gen(function*() {
              if (strategy === "parallel") {
                yield* Deferred.succeed(otherStarted, undefined)
                yield* Deferred.await(release)
              }
              ran.push("second")
            })
          )
          yield* Scope.addFinalizer(
            scope,
            Effect.gen(function*() {
              yield* Deferred.succeed(started, undefined)
              yield* Deferred.await(release)
              ran.push("first")
            })
          )

          const closing = yield* Effect.forkChild(Scope.close(scope, Exit.void), { startImmediately: true })
          yield* Deferred.await(started)
          if (strategy === "parallel") yield* Deferred.await(otherStarted)
          const interrupting = yield* Effect.forkChild(Fiber.interrupt(closing), { startImmediately: true })
          yield* Effect.yieldNow
          expect(interrupting.pollUnsafe()).toBeUndefined()
          yield* Deferred.succeed(release, undefined)
          yield* Fiber.join(interrupting)
          yield* Fiber.await(closing)
          yield* Scope.close(scope, Exit.void)
          if (strategy === "parallel") ran.sort()
          expect(ran).toEqual(["first", "second"])
        }))
    }

    it.effect("closeUnsafe runs finalizers when its returned effect is masked by the caller", () =>
      Effect.gen(function*() {
        const scope = Scope.makeUnsafe()
        const started = yield* Deferred.make<void>()
        const release = yield* Deferred.make<void>()
        const ran: Array<string> = []
        yield* Scope.addFinalizer(
          scope,
          Effect.sync(() => {
            ran.push("second")
          })
        )
        yield* Scope.addFinalizer(
          scope,
          Effect.gen(function*() {
            yield* Deferred.succeed(started, undefined)
            yield* Deferred.await(release)
            ran.push("first")
          })
        )

        const finalizers = Scope.closeUnsafe(scope, Exit.void)
        expect(finalizers).toBeDefined()
        if (finalizers === undefined) throw new Error("expected finalizers")
        const closing = yield* Effect.forkChild(Effect.uninterruptible(finalizers), { startImmediately: true })
        yield* Deferred.await(started)
        const interrupting = yield* Effect.forkChild(Fiber.interrupt(closing), { startImmediately: true })
        yield* Deferred.succeed(release, undefined)
        yield* Fiber.join(interrupting)
        expect(ran).toEqual(["first", "second"])
      }))
  })

  describe("finalizers that throw", () => {
    const reasons = (exit: Exit.Exit<unknown, unknown>) =>
      Exit.isSuccess(exit) ? [] : exit.cause.reasons.map((reason) =>
        Cause.isFailReason(reason)
          ? `fail:${String(reason.error)}`
          : Cause.isDieReason(reason)
          ? `die:${String(reason.defect)}`
          : "interrupt"
      )
    for (const strategy of ["sequential", "parallel"] as const) {
      it.effect(`${strategy}: continues and awaits remaining finalizers after a throw`, () =>
        Effect.gen(function*() {
          const scope = Scope.makeUnsafe(strategy)
          const log: Array<string> = []
          yield* Scope.addFinalizer(
            scope,
            Effect.gen(function*() {
              yield* Effect.yieldNow
              log.push("remaining")
            })
          )
          yield* Scope.addFinalizerExit(scope, () => {
            log.push("throwing")
            throw "release"
          })
          const exit = yield* Effect.exit(Scope.close(scope, Exit.void))
          expect(log).toEqual(["throwing", "remaining"])
          expect(reasons(exit)).toEqual(["die:release"])
        }))
    }

    it.effect("a sole throwing finalizer keeps the scoped effect's failure", () =>
      Effect.gen(function*() {
        const exit = yield* Effect.gen(function*() {
          const scope = yield* Effect.scope
          yield* Scope.addFinalizerExit(scope, () => {
            throw "release"
          })
          return yield* Effect.fail("error")
        }).pipe(Effect.scoped, Effect.exit)
        expect(reasons(exit)).toEqual(["fail:error", "die:release"])
      }))
  })

  describe("fork", () => {
    it.effect("closing a child removes it from the parent", () =>
      Effect.gen(function*() {
        const parent = Scope.makeUnsafe()
        const child = Scope.forkUnsafe(parent)
        expect(child.state._tag).toBe("Empty")
        expect(parent.state._tag).toBe("Open")
        yield* Scope.close(child, Exit.void)
        expect(parent.state._tag).toBe("Empty")
      }))

    it.effect("a throwing child finalizer does not leave the child in its parent", () =>
      Effect.gen(function*() {
        const parent = Scope.makeUnsafe()
        const child = Scope.forkUnsafe(parent)
        yield* Scope.addFinalizerExit(child, () => {
          throw new Error("boom")
        })
        const result = yield* Effect.exit(Scope.close(child, Exit.void))
        expect(Exit.isFailure(result)).toBe(true)
        expect(child.state._tag).toBe("Closed")
        expect(parent.state._tag).toBe("Empty")
      }))

    it.effect("an interrupted close does not leave the child in its parent", () =>
      Effect.gen(function*() {
        const parent = Scope.makeUnsafe()
        const child = Scope.forkUnsafe(parent)
        const entered = yield* Deferred.make<void>()
        const release = yield* Deferred.make<void>()
        yield* Scope.addFinalizer(
          child,
          Deferred.succeed(entered, void 0).pipe(Effect.andThen(Deferred.await(release)))
        )
        const fiber = yield* Effect.forkChild(Scope.close(child, Exit.void), { startImmediately: true })
        yield* Deferred.await(entered)
        const interrupting = yield* Effect.forkChild(Fiber.interrupt(fiber), { startImmediately: true })
        yield* Deferred.succeed(release, undefined)
        yield* Fiber.join(interrupting)
        expect(child.state._tag).toBe("Closed")
        expect(parent.state._tag).toBe("Empty")
      }))

    it.effect("closing the parent closes the child with the parent's exit only once", () =>
      Effect.gen(function*() {
        const parent = Scope.makeUnsafe()
        const child = Scope.forkUnsafe(parent)
        const exits: Array<Exit.Exit<unknown, unknown>> = []
        yield* Scope.addFinalizerExit(child, (exit) =>
          Effect.sync(() => {
            exits.push(exit)
          }))
        const failure = Exit.fail("parent failed")
        yield* Scope.close(parent, failure)
        yield* Scope.close(child, Exit.void)
        expect(exits).toEqual([failure])
      }))
  })
})
