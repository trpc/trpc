import type { Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { describe, expect, it } from "tstyche"

interface TestError {
  readonly _tag: "TestError"
}

declare const result: AsyncResult.AsyncResult<number, TestError>
declare const previous: Option.Option<AsyncResult.AsyncResult<string, never>>

describe("AsyncResult", () => {
  it("waiting call shapes", () => {
    expect(AsyncResult.waiting(result)).type.toBe<AsyncResult.AsyncResult<number, TestError>>()
    expect(AsyncResult.waiting(result, { touch: false })).type.toBe<AsyncResult.AsyncResult<number, TestError>>()
    expect(AsyncResult.waiting()(result)).type.toBe<AsyncResult.AsyncResult<number, TestError>>()
    expect(AsyncResult.waiting({ touch: false })(result)).type.toBe<AsyncResult.AsyncResult<number, TestError>>()
  })

  it("data-last replacePrevious", () => {
    expect(AsyncResult.replacePrevious(previous)(result)).type.toBe<
      AsyncResult.AsyncResult<string, TestError>
    >()
  })

  describe("builder", () => {
    it("exhaustive is only available when all cases are handled", () => {
      const complete = AsyncResult.builder(result)
        .onInitialOrWaiting(() => "loading" as const)
        .onErrorTag("TestError", (error) => {
          expect(error).type.toBe<TestError>()
          return "error" as const
        })
        .onFailure(() => "failure" as const)
        .onSuccess((value) => value)

      expect(complete.exhaustive()).type.toBe<number | "loading" | "error" | "failure">()

      const completeWithFailure = AsyncResult.builder(result)
        .onInitialOrWaiting(() => "loading" as const)
        .onFailure(() => "failure" as const)
        .onSuccess((value) => value)

      expect(completeWithFailure.exhaustive()).type.toBe<number | "loading" | "failure">()

      const missingFailure = AsyncResult.builder(result)
        .onInitialOrWaiting(() => "loading" as const)
        .onErrorTag("TestError", () => "error" as const)
        .onSuccess((value) => value)

      expect(missingFailure).type.not.toHaveProperty("exhaustive")

      const missingFailureCause = AsyncResult.builder(result)
        .onInitialOrWaiting(() => "loading" as const)
        .onErrorTag("TestError", () => "error" as const)
        .onDefect(() => "defect" as const)
        .onSuccess((value) => value)

      expect(missingFailureCause).type.not.toHaveProperty("exhaustive")

      const missingError = AsyncResult.builder(result)
        .onInitialOrWaiting(() => "loading" as const)
        .onSuccess((value) => value)

      expect(missingError).type.not.toHaveProperty("exhaustive")

      const missingInitial = AsyncResult.builder(result)
        .onErrorTag("TestError", () => "error" as const)
        .onSuccess((value) => value)

      expect(missingInitial).type.not.toHaveProperty("exhaustive")

      const missingSuccess = AsyncResult.builder(result)
        .onInitialOrWaiting(() => "loading" as const)
        .onErrorTag("TestError", () => "error" as const)

      expect(missingSuccess).type.not.toHaveProperty("exhaustive")
    })
  })
})
