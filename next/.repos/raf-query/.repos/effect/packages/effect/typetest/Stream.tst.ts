import {
  type Cause,
  Data,
  type Effect,
  type ExecutionPlan,
  pipe,
  type PubSub,
  type Queue,
  Result,
  type Scope,
  Stream
} from "effect"
import { describe, expect, it } from "tstyche"

class ErrorA extends Data.TaggedError("ErrorA")<{
  readonly message: string
}> {}

class ErrorB extends Data.TaggedError("ErrorB")<{
  readonly code: number
}> {}

declare const stream: Stream.Stream<string, ErrorA | ErrorB, "dep-1">
declare const predicate: (error: ErrorA | ErrorB) => boolean

class RateLimit extends Data.TaggedError("RateLimit")<{ readonly retryAfter: number }> {}
class Quota extends Data.TaggedError("Quota")<{ readonly limit: number }> {}
class AiError extends Data.TaggedError("AiError")<{ readonly reason: RateLimit | Quota }> {}

declare const aiStream: Stream.Stream<string, AiError | ErrorB, "dep-1">

declare const pubsub: PubSub.PubSub<string>
declare const recordStream: Stream.Stream<{ readonly key: string; readonly keep: boolean }, ErrorA, "dep-1">
declare const numberStream: Stream.Stream<number, ErrorB, "dep-2">

describe("Stream utility types", () => {
  it("distributes over unions and ignores non-stream members", () => {
    type Input = Stream.Stream<string, ErrorA, "dep-1"> | Stream.Stream<number, ErrorB, "dep-2"> | number
    expect<Stream.Success<Input>>().type.toBe<string | number>()
    expect<Stream.Error<Input>>().type.toBe<ErrorA | ErrorB>()
    expect<Stream.Services<Input>>().type.toBe<"dep-1" | "dep-2">()
  })
})

describe("Stream.runIntoPubSub", () => {
  it("preserves errors and services in data-first usage", () => {
    expect(Stream.runIntoPubSub(stream, pubsub)).type.toBe<Effect.Effect<void, ErrorA | ErrorB, "dep-1">>()
  })
})

describe("Stream.let", () => {
  it("replaces an existing field type in data-first usage", () => {
    const result = Stream.let(recordStream, "key", (record) => record.key.length)
    expect(result).type.toBe<Stream.Stream<{ readonly keep: boolean; key: number }, ErrorA, "dep-1">>()
  })
})

describe("Stream.bind", () => {
  it("replaces an existing field and combines channels in data-first usage", () => {
    const result = Stream.bind(recordStream, "key", () => numberStream)
    expect(result).type.toBe<
      Stream.Stream<{ readonly keep: boolean; key: number }, ErrorA | ErrorB, "dep-1" | "dep-2">
    >()
  })
})

describe("Stream.catchDefect", () => {
  it("supports data-last usage", () => {
    const result = pipe(stream, Stream.catchDefect(() => Stream.fail("recovery" as const)))
    expect(result).type.toBe<Stream.Stream<string, ErrorA | ErrorB | "recovery", "dep-1">>()
  })

  it("supports data-first usage", () => {
    const result = Stream.catchDefect(stream, () => Stream.succeed(1))
    expect(result).type.toBe<Stream.Stream<string | number, ErrorA | ErrorB, "dep-1">>()
  })
})

describe("Stream.catchIf", () => {
  it("supports refinement in data-last usage", () => {
    const result = pipe(
      stream,
      Stream.catchIf(
        (error): error is ErrorA => error._tag === "ErrorA",
        (error) => {
          expect(error).type.toBe<ErrorA>()
          return Stream.succeed("recovered")
        }
      )
    )
    expect(result).type.toBe<Stream.Stream<string, ErrorB, "dep-1">>()
  })

  it("supports refinement with orElse", () => {
    const result = pipe(
      stream,
      Stream.catchIf(
        (error): error is ErrorA => error._tag === "ErrorA",
        () => Stream.succeed(1),
        (error) => {
          expect(error).type.toBe<ErrorB>()
          return Stream.succeed(2)
        }
      )
    )
    expect(result).type.toBe<Stream.Stream<string | number, never, "dep-1">>()
  })

  it("supports predicate in data-first usage", () => {
    const result = Stream.catchIf(
      stream,
      predicate,
      (error) => {
        expect(error).type.toBe<ErrorA | ErrorB>()
        return Stream.succeed(0)
      }
    )
    expect(result).type.toBe<Stream.Stream<string | number, ErrorA | ErrorB, "dep-1">>()
  })

  // Soundness guard for https://github.com/Effect-TS/effect-smol/issues/2142
  it("keeps unhandled errors under an explicit annotation (orElse omitted)", () => {
    // @ts-expect-error is not assignable to type 'Stream<string, never, "dep-1">'
    const _s: Stream.Stream<string, never, "dep-1"> = pipe(
      stream,
      Stream.catchIf((error): error is ErrorA => error._tag === "ErrorA", () => Stream.succeed("ok"))
    )
    expect(_s).type.toBe<Stream.Stream<string, never, "dep-1">>()
  })
})

describe("Stream.catchFilter", () => {
  it("removes the matched error when orElse is omitted", () => {
    const result = pipe(
      stream,
      Stream.catchFilter(
        (error) => (error._tag === "ErrorA" ? Result.succeed(error) : Result.fail(error)),
        () => Stream.succeed("ok")
      )
    )
    expect(result).type.toBe<Stream.Stream<string, ErrorB, "dep-1">>()
  })

  it("keeps unhandled errors under an explicit annotation (orElse omitted)", () => {
    // @ts-expect-error is not assignable to type 'Stream<string, never, "dep-1">'
    const _s: Stream.Stream<string, never, "dep-1"> = pipe(
      stream,
      Stream.catchFilter(
        (error) => (error._tag === "ErrorA" ? Result.succeed(error) : Result.fail(error)),
        () => Stream.succeed("ok")
      )
    )
    expect(_s).type.toBe<Stream.Stream<string, never, "dep-1">>()
  })
})

describe("Stream.catchTag", () => {
  it("removes the handled error when orElse is omitted", () => {
    const result = pipe(stream, Stream.catchTag("ErrorA", () => Stream.succeed("ok")))
    expect(result).type.toBe<Stream.Stream<string, ErrorB, "dep-1">>()
  })

  it("supports orElse that re-fails", () => {
    const result = pipe(
      stream,
      Stream.catchTag("ErrorA", () => Stream.succeed("ok"), () => Stream.fail(new ErrorB({ code: 1 })))
    )
    expect(result).type.toBe<Stream.Stream<string, ErrorB, "dep-1">>()
  })

  // Soundness guard for https://github.com/Effect-TS/effect-smol/issues/2142
  it("keeps unhandled errors under an explicit annotation (orElse omitted)", () => {
    // @ts-expect-error is not assignable to type 'Stream<string, never, "dep-1">'
    const _s: Stream.Stream<string, never, "dep-1"> = pipe(
      stream,
      Stream.catchTag("ErrorA", () => Stream.succeed("ok"))
    )
    expect(_s).type.toBe<Stream.Stream<string, never, "dep-1">>()
  })
})

describe("Stream.catchTags", () => {
  const handlers = {
    ErrorA: (_error: ErrorA) => Stream.succeed("ok"),
    UnknownTag: () => Stream.succeed("unexpected")
  }

  it("rejects extra handler keys in data-first usage", () => {
    // @ts-expect-error UnknownTag
    Stream.catchTags(stream, handlers)
  })

  it("removes handled errors when orElse is omitted", () => {
    const result = pipe(stream, Stream.catchTags({ ErrorA: () => Stream.succeed("ok") }))
    expect(result).type.toBe<Stream.Stream<string, ErrorB, "dep-1">>()
  })

  it("keeps unhandled errors under an explicit annotation (orElse omitted)", () => {
    // @ts-expect-error is not assignable to type 'Stream<string, never, "dep-1">'
    const _s: Stream.Stream<string, never, "dep-1"> = pipe(
      stream,
      Stream.catchTags({ ErrorA: () => Stream.succeed("ok") })
    )
    expect(_s).type.toBe<Stream.Stream<string, never, "dep-1">>()
  })

  it("keeps the orElse error type when orElse re-fails", () => {
    const result = pipe(
      stream,
      Stream.catchTags(
        { ErrorA: () => Stream.succeed("ok") },
        (error) => {
          expect(error).type.toBe<ErrorB>()
          return Stream.fail(new RateLimit({ retryAfter: 1 }))
        }
      )
    )
    expect(result).type.toBe<Stream.Stream<string, RateLimit, "dep-1">>()
  })
})

describe("Stream.catchReason", () => {
  it("keeps other error tags when orElse re-fails", () => {
    const result = pipe(
      aiStream,
      Stream.catchReason(
        "AiError",
        "RateLimit",
        () => Stream.succeed("ok"),
        () => Stream.fail(new ErrorA({ message: "x" }))
      )
    )
    expect(result).type.toBe<Stream.Stream<string, ErrorA | ErrorB, "dep-1">>()
  })
})

describe("Stream.catchReasons", () => {
  it("keeps other error tags when orElse re-fails", () => {
    const result = pipe(
      aiStream,
      Stream.catchReasons(
        "AiError",
        { RateLimit: () => Stream.succeed("ok") },
        () => Stream.fail(new ErrorA({ message: "x" }))
      )
    )
    expect(result).type.toBe<Stream.Stream<string, ErrorA | ErrorB, "dep-1">>()
  })
})

describe("Stream.toQueue", () => {
  it("supports data-last usage", () => {
    const result = pipe(stream, Stream.toQueue({ capacity: 16 }))
    expect(result).type.toBe<
      Effect.Effect<Queue.Dequeue<string, ErrorA | ErrorB | Cause.Done>, never, "dep-1" | Scope.Scope>
    >()
  })

  it("supports data-first usage", () => {
    const result = Stream.toQueue(stream, { capacity: "unbounded" })
    expect(result).type.toBe<
      Effect.Effect<Queue.Dequeue<string, ErrorA | ErrorB | Cause.Done>, never, "dep-1" | Scope.Scope>
    >()
  })
})

describe("Stream.withExecutionPlan", () => {
  const plan = null as unknown as ExecutionPlan.ExecutionPlan<{
    provides: "provided"
    input: string
    error: "plan-error"
    requirements: "plan-dep"
  }>
  const self = null as unknown as Stream.Stream<number, string, "provided" | "other-dep">

  it("data-first adds handler requirements to R", () => {
    const result = Stream.withExecutionPlan(self, plan, {
      onEvent: (event) => {
        expect(event).type.toBe<ExecutionPlan.Event<string>>()
        return null as unknown as Effect.Effect<void, never, "handler-dep">
      }
    })
    expect(result).type.toBe<Stream.Stream<number, string, "plan-dep" | "other-dep" | "handler-dep">>()
  })

  it("data-last adds handler requirements to R", () => {
    const result = pipe(
      self,
      Stream.withExecutionPlan(plan, {
        onEvent: (event) => {
          expect(event).type.toBe<ExecutionPlan.Event<string>>()
          return null as unknown as Effect.Effect<void, never, "handler-dep">
        }
      })
    )
    expect(result).type.toBe<Stream.Stream<number, string, "plan-dep" | "other-dep" | "handler-dep">>()
  })

  it("without options the requirements are unchanged", () => {
    const result = Stream.withExecutionPlan(self, plan)
    expect(result).type.toBe<Stream.Stream<number, string, "plan-dep" | "other-dep">>()
  })
})
