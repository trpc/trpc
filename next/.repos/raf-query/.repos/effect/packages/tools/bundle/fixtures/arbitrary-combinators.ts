import * as Arbitrary from "effect/Arbitrary"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"

const integers = Arbitrary.schema(Schema.Int)

export const arbitrary = Arbitrary.all([
  integers.pipe(Arbitrary.map((value) => value + 1)),
  integers.pipe(Arbitrary.flatMap((left) => integers.pipe(Arbitrary.map((right) => [left, right] as const)))),
  integers.pipe(Arbitrary.filter((value) => value >= 0)),
  integers.pipe(Arbitrary.filterMap((value) => value === 0 ? Result.fail(value) : Result.succeed(value)))
])
