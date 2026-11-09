import type { Effect, Exit } from "effect"
import { CircuitBreaker } from "effect/persistence"
import { describe, expect, it } from "tstyche"

declare const breaker: CircuitBreaker.CircuitBreaker
declare const call: Effect.Effect<number, "error", "Env">
declare const classified: Effect.Effect<CircuitBreaker.Outcome, never, "Classifier">

describe("CircuitBreaker", () => {
  describe("execute", () => {
    it("infers R2 = never for a plain Outcome classifier, without Scope", () => {
      const classify = (exit: Exit.Exit<number, "error">) => {
        expect(exit).type.toBe<Exit.Exit<number, "error">>()
        return CircuitBreaker.success
      }
      expect(breaker.execute(call, { key: "a", classify })).type.toBe<
        Effect.Effect<number, "error" | CircuitBreaker.CircuitBreakerError, "Env">
      >()
      expect(call.pipe(breaker.execute({ key: "a", classify }))).type.toBe<
        Effect.Effect<number, "error" | CircuitBreaker.CircuitBreakerError, "Env">
      >()
      expect(breaker.execute(call, { key: "a" })).type.toBe<
        Effect.Effect<number, "error" | CircuitBreaker.CircuitBreakerError, "Env">
      >()
    })

    it("adds R2 from an effectful classifier in both forms", () => {
      const classify = () => classified
      expect(breaker.execute(call, { key: "a", classify })).type.toBe<
        Effect.Effect<number, "error" | CircuitBreaker.CircuitBreakerError, "Env" | "Classifier">
      >()
      expect(call.pipe(breaker.execute({ key: "a", classify }))).type.toBe<
        Effect.Effect<number, "error" | CircuitBreaker.CircuitBreakerError, "Env" | "Classifier">
      >()
    })
  })
})
