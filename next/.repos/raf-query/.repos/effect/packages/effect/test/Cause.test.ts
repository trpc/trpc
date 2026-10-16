import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Equal from "effect/Equal"
import * as Exit from "effect/Exit"
import { pipe } from "effect/Function"
import * as Hash from "effect/Hash"
import * as Option from "effect/Option"
import * as Result from "effect/Result"
import assert from "node:assert/strict"
import { describe, it } from "vitest"

describe("Cause", () => {
  describe("TypeId", () => {
    it("is a string constant", () => {
      assert.strictEqual(Cause.TypeId, "~effect/Cause")
    })
  })

  describe("ReasonTypeId", () => {
    it("is a string constant", () => {
      assert.strictEqual(Cause.ReasonTypeId, "~effect/Cause/Reason")
    })
  })

  describe("isCause", () => {
    it("returns true for Cause values", () => {
      assert.strictEqual(Cause.isCause(Cause.empty), true)
      assert.strictEqual(Cause.isCause(Cause.fail("error")), true)
      assert.strictEqual(Cause.isCause(Cause.die("defect")), true)
      assert.strictEqual(Cause.isCause(Cause.interrupt(1)), true)
    })

    it("returns false for non-Cause values", () => {
      assert.strictEqual(Cause.isCause(null), false)
      assert.strictEqual(Cause.isCause(undefined), false)
      assert.strictEqual(Cause.isCause("string"), false)
      assert.strictEqual(Cause.isCause(42), false)
      assert.strictEqual(Cause.isCause({}), false)
      assert.strictEqual(Cause.isCause([]), false)
    })
  })

  describe("isReason", () => {
    it("returns true for Reason values", () => {
      assert.strictEqual(Cause.isReason(Cause.makeFailReason("error")), true)
      assert.strictEqual(Cause.isReason(Cause.makeDieReason("defect")), true)
      assert.strictEqual(Cause.isReason(Cause.makeInterruptReason(1)), true)
    })

    it("returns true for reasons extracted from a cause", () => {
      const reason = Cause.fail("error").reasons[0]
      assert.strictEqual(Cause.isReason(reason), true)
    })

    it("returns false for non-Reason values", () => {
      assert.strictEqual(Cause.isReason(null), false)
      assert.strictEqual(Cause.isReason("string"), false)
      assert.strictEqual(Cause.isReason(Cause.fail("error")), false)
    })
  })

  describe("isFailReason", () => {
    it("narrows Fail reasons", () => {
      const reason = Cause.fail("error").reasons[0]
      assert.strictEqual(Cause.isFailReason(reason), true)
    })

    it("rejects Die and Interrupt reasons", () => {
      const die = Cause.die("defect").reasons[0]
      const interrupt = Cause.interrupt(1).reasons[0]
      assert.strictEqual(Cause.isFailReason(die), false)
      assert.strictEqual(Cause.isFailReason(interrupt), false)
    })
  })

  describe("isDieReason", () => {
    it("narrows Die reasons", () => {
      const reason = Cause.die("defect").reasons[0]
      assert.strictEqual(Cause.isDieReason(reason), true)
    })

    it("rejects Fail and Interrupt reasons", () => {
      const fail = Cause.fail("error").reasons[0]
      const interrupt = Cause.interrupt(1).reasons[0]
      assert.strictEqual(Cause.isDieReason(fail), false)
      assert.strictEqual(Cause.isDieReason(interrupt), false)
    })
  })

  describe("isInterruptReason", () => {
    it("narrows Interrupt reasons", () => {
      const reason = Cause.interrupt(1).reasons[0]
      assert.strictEqual(Cause.isInterruptReason(reason), true)
    })

    it("rejects Fail and Die reasons", () => {
      const fail = Cause.fail("error").reasons[0]
      const die = Cause.die("defect").reasons[0]
      assert.strictEqual(Cause.isInterruptReason(fail), false)
      assert.strictEqual(Cause.isInterruptReason(die), false)
    })
  })

  describe("empty", () => {
    it("has no reasons", () => {
      assert.strictEqual(Cause.empty.reasons.length, 0)
    })

    it("is a Cause", () => {
      assert.strictEqual(Cause.isCause(Cause.empty), true)
    })
  })

  describe("fail", () => {
    it("creates a cause with a single Fail reason", () => {
      const cause = Cause.fail("error")
      assert.strictEqual(cause.reasons.length, 1)
      assert.strictEqual(Cause.isFailReason(cause.reasons[0]), true)
    })

    it("preserves the error value", () => {
      const cause = Cause.fail("error")
      const reason = cause.reasons[0]
      if (Cause.isFailReason(reason)) {
        assert.strictEqual(reason.error, "error")
      }
    })

    it("works with various error types", () => {
      const obj = { key: "value" }
      const cause = Cause.fail(obj)
      const reason = cause.reasons[0]
      if (Cause.isFailReason(reason)) {
        assert.strictEqual(reason.error, obj)
      }
    })
  })

  describe("die", () => {
    it("creates a cause with a single Die reason", () => {
      const cause = Cause.die("defect")
      assert.strictEqual(cause.reasons.length, 1)
      assert.strictEqual(Cause.isDieReason(cause.reasons[0]), true)
    })

    it("preserves the defect value", () => {
      const cause = Cause.die("defect")
      const reason = cause.reasons[0]
      if (Cause.isDieReason(reason)) {
        assert.strictEqual(reason.defect, "defect")
      }
    })

    it("works with Error instances", () => {
      const err = new Error("boom")
      const cause = Cause.die(err)
      const reason = cause.reasons[0]
      if (Cause.isDieReason(reason)) {
        assert.strictEqual(reason.defect, err)
      }
    })
  })

  describe("interrupt", () => {
    it("creates a cause with a single Interrupt reason", () => {
      const cause = Cause.interrupt(123)
      assert.strictEqual(cause.reasons.length, 1)
      assert.strictEqual(Cause.isInterruptReason(cause.reasons[0]), true)
    })

    it("preserves the fiber ID", () => {
      const cause = Cause.interrupt(42)
      const reason = cause.reasons[0]
      if (Cause.isInterruptReason(reason)) {
        assert.strictEqual(reason.fiberId, 42)
      }
    })

    it("allows undefined fiber ID", () => {
      const cause = Cause.interrupt()
      const reason = cause.reasons[0]
      if (Cause.isInterruptReason(reason)) {
        assert.strictEqual(reason.fiberId, undefined)
      }
    })
  })

  describe("fromReasons", () => {
    it("creates a cause from an array of reasons", () => {
      const reasons = [
        Cause.makeFailReason("err1"),
        Cause.makeFailReason("err2")
      ]
      const cause = Cause.fromReasons(reasons)
      assert.strictEqual(cause.reasons.length, 2)
    })

    it("creates empty cause from empty array", () => {
      const cause = Cause.fromReasons([])
      assert.strictEqual(cause.reasons.length, 0)
    })

    it("supports mixed reason types", () => {
      const reasons = [
        Cause.makeFailReason("error"),
        Cause.makeDieReason("defect"),
        Cause.makeInterruptReason(1)
      ]
      const cause = Cause.fromReasons(reasons)
      assert.strictEqual(cause.reasons.length, 3)
    })
  })

  describe("makeFailReason", () => {
    it("creates a Fail reason with _tag and error", () => {
      const reason = Cause.makeFailReason("error")
      assert.strictEqual(reason._tag, "Fail")
      assert.strictEqual(reason.error, "error")
    })
  })

  describe("makeDieReason", () => {
    it("creates a Die reason with _tag and defect", () => {
      const reason = Cause.makeDieReason("defect")
      assert.strictEqual(reason._tag, "Die")
      assert.strictEqual(reason.defect, "defect")
    })
  })

  describe("makeInterruptReason", () => {
    it("creates an Interrupt reason with _tag and fiberId", () => {
      const reason = Cause.makeInterruptReason(42)
      assert.strictEqual(reason._tag, "Interrupt")
      assert.strictEqual(reason.fiberId, 42)
    })

    it("allows undefined fiberId", () => {
      const reason = Cause.makeInterruptReason()
      assert.strictEqual(reason._tag, "Interrupt")
      assert.strictEqual(reason.fiberId, undefined)
    })
  })

  describe("hasFails", () => {
    it("returns true when cause has Fail reasons", () => {
      assert.strictEqual(Cause.hasFails(Cause.fail("error")), true)
    })

    it("returns false when cause has no Fail reasons", () => {
      assert.strictEqual(Cause.hasFails(Cause.die("defect")), false)
      assert.strictEqual(Cause.hasFails(Cause.interrupt(1)), false)
      assert.strictEqual(Cause.hasFails(Cause.empty), false)
    })

    it("returns true for combined cause with at least one Fail", () => {
      const combined = Cause.combine(Cause.die("defect"), Cause.fail("error"))
      assert.strictEqual(Cause.hasFails(combined), true)
    })
  })

  describe("hasDies", () => {
    it("returns true when cause has Die reasons", () => {
      assert.strictEqual(Cause.hasDies(Cause.die("defect")), true)
    })

    it("returns false when cause has no Die reasons", () => {
      assert.strictEqual(Cause.hasDies(Cause.fail("error")), false)
      assert.strictEqual(Cause.hasDies(Cause.interrupt(1)), false)
      assert.strictEqual(Cause.hasDies(Cause.empty), false)
    })
  })

  describe("hasInterrupts", () => {
    it("returns true when cause has Interrupt reasons", () => {
      assert.strictEqual(Cause.hasInterrupts(Cause.interrupt(1)), true)
    })

    it("returns false when cause has no Interrupt reasons", () => {
      assert.strictEqual(Cause.hasInterrupts(Cause.fail("error")), false)
      assert.strictEqual(Cause.hasInterrupts(Cause.die("defect")), false)
      assert.strictEqual(Cause.hasInterrupts(Cause.empty), false)
    })
  })

  describe("hasInterruptsOnly", () => {
    it("returns true when all reasons are Interrupts", () => {
      assert.strictEqual(Cause.hasInterruptsOnly(Cause.interrupt(1)), true)
      const combined = Cause.combine(Cause.interrupt(1), Cause.interrupt(2))
      assert.strictEqual(Cause.hasInterruptsOnly(combined), true)
    })

    it("returns false for empty cause", () => {
      assert.strictEqual(Cause.hasInterruptsOnly(Cause.empty), false)
    })

    it("returns false when mixed with other reason types", () => {
      const combined = Cause.combine(Cause.interrupt(1), Cause.fail("error"))
      assert.strictEqual(Cause.hasInterruptsOnly(combined), false)
    })
  })

  describe("squash", () => {
    it("returns the first Fail even after an interrupt and a defect", () => {
      const cause = Cause.fromReasons([
        Cause.makeInterruptReason(1),
        Cause.makeDieReason("defect"),
        Cause.makeFailReason("first"),
        Cause.makeFailReason("second")
      ])
      assert.strictEqual(Cause.squash(cause), "first")
    })

    it("returns the first Die when there are no Fails", () => {
      const cause = Cause.fromReasons([
        Cause.makeInterruptReason(1),
        Cause.makeDieReason("first"),
        Cause.makeDieReason("second")
      ])
      assert.strictEqual(Cause.squash(cause), "first")
    })

    it("reports an interrupt-only cause", () => {
      const result = Cause.squash(Cause.interrupt(1))
      assert.ok(result instanceof Error)
      assert.strictEqual(result.message, "All fibers interrupted without error")
    })

    it("reports an empty cause", () => {
      const result = Cause.squash(Cause.empty)
      assert.ok(result instanceof Error)
      assert.strictEqual(result.message, "Empty cause")
    })
  })

  describe("findFail", () => {
    it("returns success with the first Fail reason", () => {
      const result = Cause.findFail(Cause.fail("error"))
      assert.strictEqual(Result.isSuccess(result), true)
      if (Result.isSuccess(result)) {
        assert.strictEqual(result.success.error, "error")
        assert.strictEqual(result.success._tag, "Fail")
      }
    })

    it("returns failure when no Fail reason exists", () => {
      const result = Cause.findFail(Cause.die("defect"))
      assert.strictEqual(Result.isFailure(result), true)
    })

    it("returns failure for empty cause", () => {
      const result = Cause.findFail(Cause.empty)
      assert.strictEqual(Result.isFailure(result), true)
    })
  })

  describe("findError", () => {
    it("returns success with the error value", () => {
      const result = Cause.findError(Cause.fail("error"))
      assert.strictEqual(Result.isSuccess(result), true)
      if (Result.isSuccess(result)) {
        assert.strictEqual(result.success, "error")
      }
    })

    it("returns failure when no Fail reason exists", () => {
      const result = Cause.findError(Cause.die("defect"))
      assert.strictEqual(Result.isFailure(result), true)
    })
  })

  describe("findErrorOption", () => {
    it("returns Some with the error value", () => {
      const result = Cause.findErrorOption(Cause.fail("error"))
      assert.strictEqual(Option.isSome(result), true)
      if (Option.isSome(result)) {
        assert.strictEqual(result.value, "error")
      }
    })

    it("returns None when no Fail reason exists", () => {
      assert.strictEqual(Option.isNone(Cause.findErrorOption(Cause.die("defect"))), true)
      assert.strictEqual(Option.isNone(Cause.findErrorOption(Cause.empty)), true)
    })
  })

  describe("findDie", () => {
    it("returns success with the first Die reason", () => {
      const result = Cause.findDie(Cause.die("defect"))
      assert.strictEqual(Result.isSuccess(result), true)
      if (Result.isSuccess(result)) {
        assert.strictEqual(result.success.defect, "defect")
        assert.strictEqual(result.success._tag, "Die")
      }
    })

    it("returns failure when no Die reason exists", () => {
      const result = Cause.findDie(Cause.fail("error"))
      assert.strictEqual(Result.isFailure(result), true)
    })
  })

  describe("findDefect", () => {
    it("returns success with the defect value", () => {
      const result = Cause.findDefect(Cause.die("defect"))
      assert.strictEqual(Result.isSuccess(result), true)
      if (Result.isSuccess(result)) {
        assert.strictEqual(result.success, "defect")
      }
    })

    it("returns failure when no Die reason exists", () => {
      const result = Cause.findDefect(Cause.fail("error"))
      assert.strictEqual(Result.isFailure(result), true)
    })
  })

  describe("findInterrupt", () => {
    it("returns success with the first Interrupt reason", () => {
      const result = Cause.findInterrupt(Cause.interrupt(42))
      assert.strictEqual(Result.isSuccess(result), true)
      if (Result.isSuccess(result)) {
        assert.strictEqual(result.success.fiberId, 42)
        assert.strictEqual(result.success._tag, "Interrupt")
      }
    })

    it("returns failure when no Interrupt reason exists", () => {
      const result = Cause.findInterrupt(Cause.fail("error"))
      assert.strictEqual(Result.isFailure(result), true)
    })
  })

  describe("interruptors", () => {
    it("returns a set of fiber IDs", () => {
      const cause = Cause.combine(Cause.interrupt(1), Cause.interrupt(2))
      const ids = Cause.interruptors(cause)
      assert.strictEqual(ids.has(1), true)
      assert.strictEqual(ids.has(2), true)
      assert.strictEqual(ids.size, 2)
    })

    it("returns empty set for non-interrupt causes", () => {
      assert.strictEqual(Cause.interruptors(Cause.fail("error")).size, 0)
      assert.strictEqual(Cause.interruptors(Cause.empty).size, 0)
    })

    it("excludes undefined fiber IDs from set", () => {
      const cause = Cause.interrupt()
      const ids = Cause.interruptors(cause)
      assert.strictEqual(ids.has(undefined as any), false)
    })
  })

  describe("filterInterruptors", () => {
    it("returns success with fiber ID set when interrupts exist", () => {
      const result = Cause.filterInterruptors(Cause.interrupt(1))
      assert.strictEqual(Result.isSuccess(result), true)
      if (Result.isSuccess(result)) {
        assert.strictEqual(result.success.has(1), true)
      }
    })

    it("returns failure when no interrupts exist", () => {
      const result = Cause.filterInterruptors(Cause.fail("error"))
      assert.strictEqual(Result.isFailure(result), true)
    })
  })

  describe("map", () => {
    it("transforms error values in Fail reasons (data-first)", () => {
      const cause = Cause.fail("error")
      const mapped = Cause.map(cause, (e) => e.toUpperCase())
      const reason = mapped.reasons[0]
      if (Cause.isFailReason(reason)) {
        assert.strictEqual(reason.error, "ERROR")
      }
    })

    it("works in data-last (pipeable) form", () => {
      const mapped = pipe(Cause.fail(1), Cause.map((n) => n + 1))
      const reason = mapped.reasons[0]
      if (Cause.isFailReason(reason)) {
        assert.strictEqual(reason.error, 2)
      }
    })

    it("does not affect Die reasons", () => {
      const cause = Cause.die("defect")
      const mapped = Cause.map(cause, () => "should not appear")
      assert.strictEqual(mapped.reasons.length, 1)
      assert.strictEqual(Cause.isDieReason(mapped.reasons[0]), true)
    })

    it("does not affect Interrupt reasons", () => {
      const cause = Cause.interrupt(1)
      const mapped = Cause.map(cause, () => "should not appear")
      assert.strictEqual(mapped.reasons.length, 1)
      assert.strictEqual(Cause.isInterruptReason(mapped.reasons[0]), true)
    })

    it("maps empty cause to empty cause", () => {
      const mapped = Cause.map(Cause.empty, () => "x")
      assert.strictEqual(mapped.reasons.length, 0)
    })
  })

  describe("combine", () => {
    it("preserves unequal reasons with colliding hashes while removing duplicates", () => {
      class Collision implements Equal.Equal {
        constructor(readonly value: string) {}
        [Hash.symbol](): number {
          return 0
        }
        [Equal.symbol](that: Equal.Equal): boolean {
          return that instanceof Collision && this.value === that.value
        }
      }

      const first = Cause.makeFailReason(new Collision("first"))
      const second = Cause.makeFailReason(new Collision("second"))
      const duplicate = Cause.makeFailReason(new Collision("first"))
      assert.strictEqual(Hash.hash(first), Hash.hash(second))
      assert.strictEqual(Equal.equals(first, second), false)

      const combined = Cause.combine(
        Cause.fromReasons([first, second, first]),
        Cause.fromReasons([duplicate, second])
      )
      assert.strictEqual(combined.reasons.length, 2)
      assert.strictEqual(combined.reasons[0], first)
      assert.strictEqual(combined.reasons[1], second)
      assert.strictEqual(Cause.combine(combined, Cause.fromReasons([duplicate])), combined)
    })

    it("merges two causes (data-first)", () => {
      const combined = Cause.combine(Cause.fail("a"), Cause.fail("b"))
      assert.strictEqual(combined.reasons.length, 2)
    })

    it("works in data-last (pipeable) form", () => {
      const combined = pipe(Cause.fail("a"), Cause.combine(Cause.fail("b")))
      assert.strictEqual(combined.reasons.length, 2)
    })

    it("combining with empty returns the other cause", () => {
      const cause = Cause.fail("error")
      const combined1 = Cause.combine(cause, Cause.empty)
      const combined2 = Cause.combine(Cause.empty, cause)
      assert.strictEqual(combined1.reasons.length, 1)
      assert.strictEqual(combined2.reasons.length, 1)
    })

    it("combines mixed reason types", () => {
      const combined = Cause.combine(
        Cause.fail("error"),
        Cause.combine(Cause.die("defect"), Cause.interrupt(1))
      )
      assert.strictEqual(combined.reasons.length, 3)
    })
  })

  describe("prettyErrors", () => {
    it("converts Fail with Error to array of Errors", () => {
      const cause = Cause.fail(new Error("boom"))
      const errors = Cause.prettyErrors(cause)
      assert.strictEqual(errors.length, 1)
      assert.ok(errors[0] instanceof Error)
      assert.ok(errors[0].message.includes("boom"))
    })

    it("converts Fail with string to Error", () => {
      const cause = Cause.fail("string error")
      const errors = Cause.prettyErrors(cause)
      assert.strictEqual(errors.length, 1)
      assert.ok(errors[0] instanceof Error)
    })

    it("converts Die to Error", () => {
      const cause = Cause.die("defect")
      const errors = Cause.prettyErrors(cause)
      assert.strictEqual(errors.length, 1)
      assert.ok(errors[0] instanceof Error)
    })

    it("returns InterruptError for interrupt-only cause", () => {
      const cause = Cause.interrupt(1)
      const errors = Cause.prettyErrors(cause)
      assert.strictEqual(errors.length, 1)
      assert.ok(errors[0] instanceof Error)
    })

    it("handles empty cause", () => {
      const errors = Cause.prettyErrors(Cause.empty)
      assert.ok(Array.isArray(errors))
    })

    it("restores Error.stackTraceLimit when formatting a reason throws", () => {
      const limit = Error.stackTraceLimit
      const error = new Error("boom")
      Object.defineProperty(error, "stack", {
        get() {
          throw new Error("stack getter")
        }
      })
      assert.throws(() => Cause.prettyErrors(Cause.fail(error)), /stack getter/)
      assert.strictEqual(Error.stackTraceLimit, limit)
    })
  })

  describe("pretty", () => {
    it("renders a Fail cause as a string", () => {
      const cause = Cause.fail("something went wrong")
      const rendered = Cause.pretty(cause)
      assert.strictEqual(typeof rendered, "string")
      assert.ok(rendered.includes("something went wrong"))
    })

    it("renders a Die cause as a string", () => {
      const cause = Cause.die(new Error("unexpected"))
      const rendered = Cause.pretty(cause)
      assert.strictEqual(typeof rendered, "string")
      assert.ok(rendered.includes("unexpected"))
    })

    it("returns a string for empty cause", () => {
      const rendered = Cause.pretty(Cause.empty)
      assert.strictEqual(typeof rendered, "string")
    })

    it("cuts the stack of a defect at the internal frame that called user code", async () => {
      const render = async (effect: Effect.Effect<unknown, unknown>): Promise<string> => {
        const exit = await Effect.runPromiseExit(effect)
        assert.ok(Exit.isFailure(exit))
        return Cause.pretty(exit.cause)
      }
      for (
        const effect of [
          Effect.try({ try: userCode, catch: userCode }),
          // the catcher runs outside the run loop, so it relies on the marker frame
          Effect.tryPromise({ try: () => Promise.reject(1), catch: userCode })
        ]
      ) {
        const rendered = await render(effect)
        assert.match(rendered, /at userCode /)
        assert.doesNotMatch(rendered, /~effect\/Utils\/internal/)
      }
    })

    const userCode = (): never => {
      throw new Error("boom")
    }
    const assertCleanStack = (effect: Effect.Effect<unknown, unknown>): void => {
      const exit = Effect.runSyncExit(effect)
      assert.ok(Exit.isFailure(exit))
      const rendered = Cause.pretty(exit.cause)
      assert.match(rendered, /\buserCode \(/)
      assert.doesNotMatch(rendered, /\/src\/internal\/|~effect\/Utils\/internal/)
    }

    it("does not render internal frames from match and matchCause handlers", () => {
      for (const source of [Effect.succeed(1), Effect.fail("error")]) {
        assertCleanStack(Effect.match(source, { onSuccess: userCode, onFailure: userCode }))
        assertCleanStack(Effect.matchCause(source, { onSuccess: userCode, onFailure: userCode }))
      }
    })

    it("does not render internal frames from map", () => {
      assertCleanStack(Effect.map(Effect.succeed(1), userCode))
    })
  })

  describe("annotate", () => {
    it("attaches annotations to a cause (data-first)", () => {
      const cause = Cause.fail("error")
      const annotated = Cause.annotate(cause, Context.empty())
      assert.strictEqual(Cause.isCause(annotated), true)
      assert.strictEqual(annotated.reasons.length, 1)
    })

    it("works in data-last (pipeable) form", () => {
      const annotated = pipe(Cause.fail("error"), Cause.annotate(Context.empty()))
      assert.strictEqual(Cause.isCause(annotated), true)
    })

    it("does not mutate the original cause", () => {
      const original = Cause.fail("error")
      Cause.annotate(original, Context.empty())
      assert.strictEqual(original.reasons.length, 1)
    })
  })

  describe("reasonAnnotations", () => {
    it("returns annotations from a reason", () => {
      const reason = Cause.makeFailReason("error")
      const anns = Cause.reasonAnnotations(reason)
      assert.ok(anns !== undefined)
    })
  })

  describe("annotations", () => {
    it("returns merged annotations from a cause", () => {
      const cause = Cause.fail("error")
      const anns = Cause.annotations(cause)
      assert.ok(anns !== undefined)
    })
  })

  describe("StackTrace", () => {
    it("is a Context.Service", () => {
      assert.ok(Cause.StackTrace !== undefined)
    })
  })

  describe("InterruptorStackTrace", () => {
    it("is a Context.Service", () => {
      assert.ok(Cause.InterruptorStackTrace !== undefined)
    })
  })

  describe("NoSuchElementError", () => {
    it("creates an error with _tag and message", () => {
      const error = new Cause.NoSuchElementError("not found")
      assert.strictEqual(error._tag, "NoSuchElementError")
      assert.strictEqual(error.message, "not found")
    })

    it("creates an error without message", () => {
      const error = new Cause.NoSuchElementError()
      assert.strictEqual(error._tag, "NoSuchElementError")
    })

    it("is an instance of Error", () => {
      const error = new Cause.NoSuchElementError()
      assert.ok(error instanceof Error)
    })
  })

  describe("isNoSuchElementError", () => {
    it("returns true for NoSuchElementError instances", () => {
      assert.strictEqual(Cause.isNoSuchElementError(new Cause.NoSuchElementError()), true)
    })

    it("returns false for other values", () => {
      assert.strictEqual(Cause.isNoSuchElementError("nope"), false)
      assert.strictEqual(Cause.isNoSuchElementError(new Error()), false)
      assert.strictEqual(Cause.isNoSuchElementError(null), false)
    })
  })

  describe("NoSuchElementErrorTypeId", () => {
    it("is a string constant", () => {
      assert.strictEqual(Cause.NoSuchElementErrorTypeId, "~effect/Cause/NoSuchElementError")
    })
  })

  describe("Done", () => {
    it("creates a Done signal without value", () => {
      const d = Cause.Done()
      assert.strictEqual(d._tag, "Done")
      assert.strictEqual(d.value, undefined)
    })

    it("creates a Done signal with a value", () => {
      const d = Cause.Done(42)
      assert.strictEqual(d._tag, "Done")
      assert.strictEqual(d.value, 42)
    })
  })

  describe("isDone", () => {
    it("returns true for Done values", () => {
      assert.strictEqual(Cause.isDone(Cause.Done()), true)
      assert.strictEqual(Cause.isDone(Cause.Done(42)), true)
    })

    it("returns false for other values", () => {
      assert.strictEqual(Cause.isDone("not done"), false)
      assert.strictEqual(Cause.isDone(null), false)
      assert.strictEqual(Cause.isDone(new Cause.NoSuchElementError()), false)
    })
  })

  describe("DoneTypeId", () => {
    it("is a string constant", () => {
      assert.strictEqual(Cause.DoneTypeId, "~effect/Cause/Done")
    })
  })

  describe("TimeoutError", () => {
    it("creates an error with _tag and message", () => {
      const error = new Cause.TimeoutError("timed out")
      assert.strictEqual(error._tag, "TimeoutError")
      assert.strictEqual(error.message, "timed out")
    })

    it("creates an error without message", () => {
      const error = new Cause.TimeoutError()
      assert.strictEqual(error._tag, "TimeoutError")
    })

    it("is an instance of Error", () => {
      assert.ok(new Cause.TimeoutError() instanceof Error)
    })
  })

  describe("isTimeoutError", () => {
    it("returns true for TimeoutError instances", () => {
      assert.strictEqual(Cause.isTimeoutError(new Cause.TimeoutError()), true)
    })

    it("returns false for other values", () => {
      assert.strictEqual(Cause.isTimeoutError("nope"), false)
      assert.strictEqual(Cause.isTimeoutError(new Error()), false)
    })
  })

  describe("TimeoutErrorTypeId", () => {
    it("is a string constant", () => {
      assert.strictEqual(Cause.TimeoutErrorTypeId, "~effect/Cause/TimeoutError")
    })
  })

  describe("IllegalArgumentError", () => {
    it("creates an error with _tag and message", () => {
      const error = new Cause.IllegalArgumentError("bad arg")
      assert.strictEqual(error._tag, "IllegalArgumentError")
      assert.strictEqual(error.message, "bad arg")
    })

    it("creates an error without message", () => {
      const error = new Cause.IllegalArgumentError()
      assert.strictEqual(error._tag, "IllegalArgumentError")
    })

    it("is an instance of Error", () => {
      assert.ok(new Cause.IllegalArgumentError() instanceof Error)
    })
  })

  describe("isIllegalArgumentError", () => {
    it("returns true for IllegalArgumentError instances", () => {
      assert.strictEqual(Cause.isIllegalArgumentError(new Cause.IllegalArgumentError()), true)
    })

    it("returns false for other values", () => {
      assert.strictEqual(Cause.isIllegalArgumentError("nope"), false)
      assert.strictEqual(Cause.isIllegalArgumentError(new Error()), false)
    })
  })

  describe("IllegalArgumentErrorTypeId", () => {
    it("is a string constant", () => {
      assert.strictEqual(Cause.IllegalArgumentErrorTypeId, "~effect/Cause/IllegalArgumentError")
    })
  })

  describe("ExceededCapacityError", () => {
    it("creates an error with _tag and message", () => {
      const error = new Cause.ExceededCapacityError("queue full")
      assert.strictEqual(error._tag, "ExceededCapacityError")
      assert.strictEqual(error.message, "queue full")
    })

    it("creates an error without message", () => {
      const error = new Cause.ExceededCapacityError()
      assert.strictEqual(error._tag, "ExceededCapacityError")
    })

    it("is an instance of Error", () => {
      assert.ok(new Cause.ExceededCapacityError() instanceof Error)
    })
  })

  describe("isExceededCapacityError", () => {
    it("returns true for ExceededCapacityError instances", () => {
      assert.strictEqual(Cause.isExceededCapacityError(new Cause.ExceededCapacityError()), true)
    })

    it("returns false for other values", () => {
      assert.strictEqual(Cause.isExceededCapacityError("nope"), false)
      assert.strictEqual(Cause.isExceededCapacityError(new Error()), false)
    })
  })

  describe("ExceededCapacityErrorTypeId", () => {
    it("is a string constant", () => {
      assert.strictEqual(Cause.ExceededCapacityErrorTypeId, "~effect/Cause/ExceededCapacityError")
    })
  })

  describe("UnknownError", () => {
    it("creates an error with cause and message", () => {
      const error = new Cause.UnknownError("original", "wrapper message")
      assert.strictEqual(error._tag, "UnknownError")
      assert.strictEqual(error.message, "wrapper message")
    })

    it("stores the original cause", () => {
      const original = { raw: true }
      const error = new Cause.UnknownError(original)
      assert.strictEqual(error._tag, "UnknownError")
    })

    it("is an instance of Error", () => {
      assert.ok(new Cause.UnknownError("x") instanceof Error)
    })
  })

  describe("isUnknownError", () => {
    it("returns true for UnknownError instances", () => {
      assert.strictEqual(Cause.isUnknownError(new Cause.UnknownError("x")), true)
    })

    it("returns false for other values", () => {
      assert.strictEqual(Cause.isUnknownError("nope"), false)
      assert.strictEqual(Cause.isUnknownError(new Error()), false)
    })
  })

  describe("UnknownErrorTypeId", () => {
    it("is a string constant", () => {
      assert.strictEqual(Cause.UnknownErrorTypeId, "~effect/Cause/UnknownError")
    })
  })
})
