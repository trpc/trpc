/**
 * @title Working with time zones
 *
 * Attach IANA zones to instants, render zoned ISO strings, and provide a
 * CurrentTimeZone service for code that should use the workspace/user zone.
 */
import { NodeRuntime } from "@effect/platform-node"
import { DateTime, Effect, Option } from "effect"

Effect.gen(function*() {
  // Use DateTime.now to get the current time from Effect's Clock service.
  const now = yield* DateTime.now

  // To attach a named IANA zone to a DateTime value
  const nowInAuckland = now.pipe(
    // Use DateTime.setZoneNamedUnsafe when you know the zone is valid.
    DateTime.setZoneNamedUnsafe("Pacific/Auckland")
  )
  yield* Effect.log("Now in Auckland:", nowInAuckland)

  // Use DateTime.setZoneNamed when you don't know the zone is valid.
  const nowInSydneyOption: Option.Option<DateTime.Zoned> = now.pipe(
    DateTime.setZoneNamed("Australia/Sydney")
  )

  yield* Effect.log("Now in Sydney:", Option.getOrUndefined(nowInSydneyOption))

  // To generate a `DateTime.Zoned` in the `DateTime.CurrentTimeZone`
  const nowInNewYork = yield* DateTime.nowInCurrentZone
  yield* Effect.log("Now in New York:", nowInNewYork)

  // If you have a date string that you know is in a particular IANA zone, you
  // can convert it to a DateTime.Zoned to ensure the instant is correct
  const dateInAuckland: DateTime.Zoned = DateTime.makeZonedUnsafe("2026-06-05", {
    timeZone: "Pacific/Auckland",
    // adjustForTimeZone will adjust the input to the given zone, otherwise it
    // will be treated as UTC.
    adjustForTimeZone: true
  })
  yield* Effect.log("Date in Auckland:", dateInAuckland)
}).pipe(
  Effect.provide(DateTime.layerCurrentZoneNamed("America/New_York")),
  NodeRuntime.runMain
)
