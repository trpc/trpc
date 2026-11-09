/**
 * @title Creating and formatting DateTime values
 *
 * Parse incoming date values safely, use Clock-powered current time, and format
 * instants for API payloads or user-facing labels.
 */
import { DateTime, Effect, Option } from "effect"

Effect.gen(function*() {
  // Use DateTime.now to get the current time from Effect's Clock service.
  // Using the Clock service ensures tests can use the `TestClock` module to
  // control time.
  const now = yield* DateTime.now

  // Use DateTime.make to parse a date input, such as a user-entered string or a
  // epoch timestamp. It returns an Option depending on whether the input was
  // valid.
  const parsedOption: Option.Option<DateTime.Utc> = DateTime.make("2024-06-15T14:30:00.000Z")

  // you can then use the Option apis to unwrap the value
  Option.getOrUndefined(parsedOption)

  // Calendar/date-time math returns a new DateTime value; the original value is
  // immutable.
  const endsAt = now.pipe(DateTime.add({ hours: 2 }))

  // The DateTime.format* functions can be used to convert a DateTime value to
  // differen formats.
  yield* Effect.log("ISO string:", DateTime.formatIso(endsAt))
})
