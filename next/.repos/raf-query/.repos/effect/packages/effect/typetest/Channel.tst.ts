import { Channel, Data, type Effect, pipe, Result } from "effect"
import { describe, expect, it } from "tstyche"

class ErrorA extends Data.TaggedError("ErrorA")<{ readonly message: string }> {}
class ErrorB extends Data.TaggedError("ErrorB")<{ readonly code: number }> {}

declare const channel: Channel.Channel<number, ErrorA | ErrorB>

class RateLimit extends Data.TaggedError("RateLimit")<{ readonly retryAfter: number }> {}
class Quota extends Data.TaggedError("Quota")<{ readonly limit: number }> {}
class AiError extends Data.TaggedError("AiError")<{ readonly reason: RateLimit | Quota }> {}

declare const aiChannel: Channel.Channel<number, AiError | ErrorB>

describe("Channel.catchDefect", () => {
  it("supports data-last usage", () => {
    const result = pipe(channel, Channel.catchDefect(() => Channel.fail("recovery" as const)))
    expect(result).type.toBe<Channel.Channel<number, ErrorA | ErrorB | "recovery">>()
  })

  it("supports data-first usage", () => {
    const result = Channel.catchDefect(channel, () => Channel.succeed("recovered"))
    expect(result).type.toBe<Channel.Channel<number | string, ErrorA | ErrorB>>()
  })
})

describe("Channel.catchTag", () => {
  it("removes the handled error when orElse is omitted", () => {
    const result = pipe(channel, Channel.catchTag("ErrorA", () => Channel.succeed(1)))
    expect(result).type.toBe<Channel.Channel<number, ErrorB>>()
  })

  it("supports orElse that re-fails", () => {
    const result = pipe(
      channel,
      Channel.catchTag("ErrorA", () => Channel.succeed(1), () => Channel.fail(new ErrorB({ code: 1 })))
    )
    expect(result).type.toBe<Channel.Channel<number, ErrorB>>()
  })

  // Soundness guard for https://github.com/Effect-TS/effect-smol/issues/2142
  it("keeps unhandled errors under an explicit annotation (orElse omitted)", () => {
    // @ts-expect-error is not assignable to type 'Channel<number, never
    const _c: Channel.Channel<number, never> = pipe(channel, Channel.catchTag("ErrorA", () => Channel.succeed(1)))
    expect(_c).type.toBe<Channel.Channel<number, never>>()
  })
})

describe("Channel.catchIf", () => {
  it("removes the refined error when orElse is omitted", () => {
    const result = pipe(
      channel,
      Channel.catchIf((e): e is ErrorA => e._tag === "ErrorA", () => Channel.succeed(1))
    )
    expect(result).type.toBe<Channel.Channel<number, ErrorB>>()
  })

  // Soundness guard for https://github.com/Effect-TS/effect-smol/issues/2142
  it("keeps unhandled errors under an explicit annotation (orElse omitted)", () => {
    // @ts-expect-error is not assignable to type 'Channel<number, never
    const _c: Channel.Channel<number, never> = pipe(
      channel,
      Channel.catchIf((e): e is ErrorA => e._tag === "ErrorA", () => Channel.succeed(1))
    )
    expect(_c).type.toBe<Channel.Channel<number, never>>()
  })
})

describe("Channel.catchFilter", () => {
  it("removes the matched error when orElse is omitted", () => {
    const result = pipe(
      channel,
      Channel.catchFilter(
        (e) => (e._tag === "ErrorA" ? Result.succeed(e) : Result.fail(e)),
        () => Channel.succeed(1)
      )
    )
    expect(result).type.toBe<Channel.Channel<number, ErrorB>>()
  })

  // Soundness guard for https://github.com/Effect-TS/effect-smol/issues/2142
  it("keeps unhandled errors under an explicit annotation (orElse omitted)", () => {
    // @ts-expect-error is not assignable to type 'Channel<number, never
    const _c: Channel.Channel<number, never> = pipe(
      channel,
      Channel.catchFilter(
        (e) => (e._tag === "ErrorA" ? Result.succeed(e) : Result.fail(e)),
        () => Channel.succeed(1)
      )
    )
    expect(_c).type.toBe<Channel.Channel<number, never>>()
  })
})

describe("Channel.catchReason", () => {
  // Soundness guard for https://github.com/Effect-TS/effect-smol/issues/2142: a re-failing orElse
  // (output element type `never`) must not erase the other unhandled error tags via conditional distribution.
  it("keeps other error tags when orElse re-fails", () => {
    const result = pipe(
      aiChannel,
      Channel.catchReason(
        "AiError",
        "RateLimit",
        () => Channel.succeed(1),
        () => Channel.fail(new ErrorA({ message: "x" }))
      )
    )
    expect(result).type.toBe<Channel.Channel<number, ErrorA | ErrorB>>()
  })
})

describe("Channel.catchReasons", () => {
  it("keeps other error tags when orElse re-fails", () => {
    const result = pipe(
      aiChannel,
      Channel.catchReasons(
        "AiError",
        { RateLimit: () => Channel.succeed(1) },
        () => Channel.fail(new ErrorA({ message: "x" }))
      )
    )
    expect(result).type.toBe<Channel.Channel<number, ErrorA | ErrorB>>()
  })
})

describe("Channel.runCount", () => {
  it("returns the output count", () => {
    expect(Channel.runCount(Channel.fromIterable([1, 2, 3]))).type.toBe<Effect.Effect<number>>()
  })
})
