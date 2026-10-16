import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import { ApiDiff, type ApiDiffOptions } from "./ApiDiff.ts"

const baseRef = Flag.String("base-ref").pipe(
  Flag.withDescription("Explicit base Git ref"),
  Flag.withDefault("v3")
)

const headRef = Flag.String("head-ref").pipe(
  Flag.withDescription("Explicit head Git ref"),
  Flag.withDefault("main")
)

const output = Flag.String("output").pipe(
  Flag.withMetavar("DIRECTORY"),
  Flag.withDescription("Report output directory"),
  Flag.optional
)

const writeDoc = Flag.String("write-doc").pipe(
  Flag.withMetavar("FILE"),
  Flag.withDescription("Write the annotation-driven migration reference"),
  Flag.optional
)

const check = Flag.Boolean("check").pipe(
  Flag.withDescription("List APIs without migration annotations and fail if any remain"),
  Flag.withDefault(false)
)

const runApiDiff = Effect.fnUntraced(function*(options: {
  readonly baseRef: string
  readonly headRef: string
  readonly output: Option.Option<string>
  readonly writeDoc: Option.Option<string>
  readonly check: boolean
}) {
  const apiDiff = yield* ApiDiff
  yield* apiDiff.run(
    {
      baseRef: options.baseRef,
      headRef: options.headRef,
      output: Option.getOrUndefined(options.output),
      writeDoc: Option.getOrUndefined(options.writeDoc),
      check: options.check
    } satisfies ApiDiffOptions
  )
})

export const cli = Command.make("api-diff", {
  baseRef,
  headRef,
  output,
  writeDoc,
  check
}).pipe(
  Command.withDescription("Compare the consumer-visible TypeScript API of two repository revisions"),
  Command.withHandler(runApiDiff)
)
