import { assert, describe, it } from "@effect/vitest"
import { Cause, Context, Effect, Exit, Option } from "effect"
import * as Arrays from "effect/internal/arbitrary/array"
import * as Model from "effect/internal/arbitrary/model"

describe("Arbitrary shrink causes", () => {
  const wrappers: ReadonlyArray<{
    readonly name: string
    readonly wrap: (sample: Model.Sample<number>) => Model.Computation<Model.Sample<unknown> | undefined>
    readonly expected: unknown
  }> = [
    {
      name: "concatenation",
      wrap: (sample) => Model.makeSample(sample.value, Model.concatPulls([sample.shrinks!, Cause.done()])),
      expected: 1
    },
    {
      name: "retained children",
      wrap: (sample) => Model.fromRetained(Model.retain(sample)),
      expected: 1
    },
    {
      name: "filter",
      wrap: (sample) => Model.filterSample(sample, () => true)!,
      expected: 1
    },
    {
      name: "filterMap",
      wrap: (sample) => Model.filterMapSample(sample, Option.some),
      expected: 1
    },
    {
      name: "product",
      wrap: (sample) => Model.productSample([sample], (children) => children.map((child) => child.value)),
      expected: [1]
    },
    {
      name: "array",
      wrap: (sample) =>
        Arrays.sample([sample, Model.makeSample(9)], {
          fixedCount: 1,
          optionalCount: 0,
          repeatCount: 1,
          tailCount: 0,
          minimum: 1
        }),
      expected: [1, 9]
    }
  ]

  for (const { expected, name, wrap } of wrappers) {
    it.effect(`does not exhaust ${name} on Done mixed with defects and interruption`, () =>
      Effect.gen(function*() {
        const annotations = Context.make(
          Context.Service<string>("test/Arbitrary/ShrinkDiagnostic"),
          "shrink diagnostic"
        )
        const unexpected = Cause.annotate(Cause.combine(Cause.die("shrink defect"), Cause.interrupt(123)), annotations)
        const mixed = Cause.combine(Cause.fail(Cause.Done()), unexpected)
        let pulls = 0
        const source = Model.makeSample(
          2,
          Effect.suspend(() => {
            pulls++
            return pulls === 1 ? Effect.failCause(mixed) : Effect.succeed(Model.makeSample(1))
          })
        )
        const sample = (yield* Model.toEffect(wrap(source)))!
        const first = yield* Effect.exit(sample.shrinks!)

        assert.deepStrictEqual(first, Exit.failCause(unexpected))
        assert.strictEqual(pulls, 1)

        const second = yield* sample.shrinks!
        assert.strictEqual(second._tag, "Generated")
        if (second._tag === "Generated") assert.deepStrictEqual(second.value, expected)
        assert.strictEqual(pulls, 2)
      }))
  }
})
