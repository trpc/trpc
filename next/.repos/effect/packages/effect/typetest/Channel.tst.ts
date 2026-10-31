import { Channel, Data, type Effect, pipe, type PubSub, Result } from "effect"
import { describe, expect, it } from "tstyche"

class ErrorA extends Data.TaggedError("ErrorA")<{ readonly message: string }> {}
class ErrorB extends Data.TaggedError("ErrorB")<{ readonly code: number }> {}

declare const channel: Channel.Channel<number, ErrorA | ErrorB>
declare const pubsub: PubSub.PubSub<number>
interface Dependency {
  readonly Dependency: unique symbol
}
declare const pubsubChannel: Channel.Channel<number, ErrorA | ErrorB, void, unknown, unknown, unknown, Dependency>

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

  it("supports unknown refinement input in data-first usage", () => {
    const result = Channel.catchIf(
      channel,
      (e: unknown): e is ErrorA => e instanceof ErrorA,
      () => Channel.succeed(1)
    )
    expect(result).type.toBe<Channel.Channel<number, ErrorB>>()
  })

  it("supports unknown refinement input in data-last usage", () => {
    const result = pipe(
      channel,
      Channel.catchIf((e: unknown): e is ErrorA => e instanceof ErrorA, () => Channel.succeed(1))
    )
    expect(result).type.toBe<Channel.Channel<number, ErrorB>>()
  })

  it("does not widen to unknown with unrelated refinement in data-first usage", () => {
    const result = Channel.catchIf(
      channel,
      (e: unknown): e is { _tag: "Whatever" } => (e as { _tag: string })._tag === "Whatever",
      (e) => {
        expect(e).type.toBe<ErrorA | ErrorB>()
        return Channel.succeed("recovered" as const)
      }
    )
    expect(result).type.toBe<Channel.Channel<number | "recovered", ErrorA | ErrorB>>()
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

interface Config {
  readonly _: unique symbol
}
interface Db {
  readonly _: unique symbol
}
declare const dbChannel: Channel.Channel<number, never, void, number, never, void, Db>
declare const serviceFreeChannel: Channel.Channel<number, never, void, number, never, void>
declare const parseWithConfig: (s: string) => Effect.Effect<number, never, Config>

describe("Channel.mapInput", () => {
  it("adds mapper requirements and preserves channel requirements in data-last usage", () => {
    const serviceFreeResult = pipe(serviceFreeChannel, Channel.mapInput(parseWithConfig))
    expect(serviceFreeResult).type.toBe<Channel.Channel<number, never, void, string, never, void, Config>>()

    const result = pipe(dbChannel, Channel.mapInput(parseWithConfig))
    expect(result).type.toBe<Channel.Channel<number, never, void, string, never, void, Db | Config>>()
  })

  it("adds mapper requirements and preserves channel requirements in data-first usage", () => {
    const serviceFreeResult = Channel.mapInput(serviceFreeChannel, parseWithConfig)
    expect(serviceFreeResult).type.toBe<Channel.Channel<number, never, void, string, never, void, Config>>()

    const result = Channel.mapInput(dbChannel, parseWithConfig)
    expect(result).type.toBe<Channel.Channel<number, never, void, string, never, void, Db | Config>>()
  })
})

describe("Channel.runIntoPubSub", () => {
  it("preserves the channel error and environment in both overloads", () => {
    expect(Channel.runIntoPubSub(pubsubChannel, pubsub)).type.toBe<Effect.Effect<void, ErrorA | ErrorB, Dependency>>()
    expect(pipe(pubsubChannel, Channel.runIntoPubSub(pubsub))).type.toBe<
      Effect.Effect<void, ErrorA | ErrorB, Dependency>
    >()
  })
})
