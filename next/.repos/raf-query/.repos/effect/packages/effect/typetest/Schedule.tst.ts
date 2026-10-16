import { type Effect, hole } from "effect"
import type * as Duration from "effect/Duration"
import * as Schedule from "effect/Schedule"
import { describe, expect, it } from "tstyche"

describe("Schedule", () => {
  it("isSchedule", () => {
    const input = hole<{ a: number } | Schedule.Schedule<string, number, never, never>>()
    if (Schedule.isSchedule(input)) {
      expect(input).type.toBe<Schedule.Schedule<string, number, never, never>>()
    }
  })

  it("tap", () => {
    const self = hole<Schedule.Schedule<number, string, "error", "service">>()
    const schedule = Schedule.tap(self, (metadata) => {
      expect(metadata).type.toBe<Schedule.Metadata<number, string>>()
      return hole<Effect.Effect<void, "tapError", "tapService">>()
    })
    expect(schedule).type.toBe<Schedule.Schedule<number, string, "error" | "tapError", "service" | "tapService">>()
  })

  it("modifyDelay", () => {
    const self = hole<Schedule.Schedule<number, string, "error", "service">>()
    const schedule = Schedule.modifyDelay(self, (metadata) => {
      expect(metadata).type.toBe<Schedule.Metadata<number, string>>()
      return hole<Effect.Effect<Duration.Input, "modifyDelayError", "modifyDelayService">>()
    })
    expect(schedule).type.toBe<
      Schedule.Schedule<number, string, "error" | "modifyDelayError", "service" | "modifyDelayService">
    >()
  })

  it("addDelay", () => {
    const self = hole<Schedule.Schedule<number, string, "error", "service">>()
    const schedule = Schedule.addDelay(self, (metadata) => {
      expect(metadata).type.toBe<Schedule.Metadata<number, string>>()
      return hole<Effect.Effect<Duration.Input, "addDelayError", "addDelayService">>()
    })
    expect(schedule).type.toBe<
      Schedule.Schedule<number, string, "error" | "addDelayError", "service" | "addDelayService">
    >()
  })

  it("type extractors", () => {
    type TestSchedule = Schedule.Schedule<number, string, "error", "service">
    expect<Schedule.Output<TestSchedule>>().type.toBe<number>()
    expect<Schedule.Input<TestSchedule>>().type.toBe<string>()
    expect<Schedule.Error<TestSchedule>>().type.toBe<"error">()
    expect<Schedule.Env<TestSchedule>>().type.toBe<"service">()
  })

  it("max", () => {
    const first = hole<Schedule.Schedule<number, { readonly first: string }, "firstError", "firstService">>()
    const second = hole<Schedule.Schedule<boolean, { readonly second: number }, "secondError", "secondService">>()
    const schedule = Schedule.max([first, second])
    expect(schedule).type.toBe<
      Schedule.Schedule<
        Duration.Duration,
        { readonly first: string } & { readonly second: number },
        "firstError" | "secondError",
        "firstService" | "secondService"
      >
    >()
  })

  it("upTo", () => {
    const self = hole<Schedule.Schedule<number, string, "error", "service">>()

    expect(Schedule.upTo(self, { times: 3 })).type.toBe<Schedule.Schedule<number, string, "error", "service">>()
    expect(Schedule.upTo({ duration: "1 second" })(self)).type.toBe<
      Schedule.Schedule<number, string, "error", "service">
    >()
    expect(Schedule.upTo({})(self)).type.toBe<Schedule.Schedule<number, string, "error", "service">>()
  })

  it("while", () => {
    const self = hole<Schedule.Schedule<number | string, boolean | Date, "error", "service">>()
    const refinement = (
      metadata: Schedule.Metadata<number | string, boolean | Date>
    ): metadata is Schedule.Metadata<number, Date> => true

    expect(Schedule.while(refinement)(self)).type.toBe<Schedule.Schedule<number, Date, "error", "service">>()
    expect(Schedule.while(self, refinement)).type.toBe<Schedule.Schedule<number, Date, "error", "service">>()
  })
})
