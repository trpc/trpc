import { type Array, Iterable } from "effect"
import { pipe } from "effect/Function"
import { describe, expect, it } from "tstyche"

const symA = Symbol.for("a")
const symB = Symbol.for("b")
const symC = Symbol.for("c")

describe("Iterable", () => {
  it("groupBy", () => {
    expect(Iterable.groupBy([1, 2, 3], (n) => {
      expect(n).type.toBe<number>()
      return String(n)
    })).type.toBe<Record<string, Array.NonEmptyArray<number>>>()
    expect(pipe(
      [1, 2, 3],
      Iterable.groupBy((n) => {
        expect(n).type.toBe<number>()
        return String(n)
      })
    )).type.toBe<Record<string, Array.NonEmptyArray<number>>>()
    const bySingleKey = Iterable.groupBy([1, 2, 3], () => "key" as const)
    expect(bySingleKey).type.toBe<Partial<Record<"key", Array.NonEmptyArray<number>>>>()
    expect(bySingleKey.key).type.toBe<Array.NonEmptyArray<number> | undefined>()
    // @ts-expect-error Property 'other' does not exist
    void bySingleKey.other
    const bySign = Iterable.groupBy(
      [1, 2, 3],
      (n) => n > 0 ? "positive" as const : "negative" as const
    )
    expect(bySign).type.toBe<Partial<Record<"positive" | "negative", Array.NonEmptyArray<number>>>>()
    expect(
      pipe(
        [1, 2, 3],
        Iterable.groupBy((n) => n > 0 ? "positive" as const : "negative" as const)
      )
    ).type.toBe<Partial<Record<"positive" | "negative", Array.NonEmptyArray<number>>>>()
    expect(Iterable.groupBy(["a", "b"], Symbol.for)).type.toBe<Record<symbol, Array.NonEmptyArray<string>>>()
    expect(Iterable.groupBy(["a", "b"], (s) => s === "a" ? symA : s === "b" ? symB : symC)).type.toBe<
      Partial<Record<typeof symA | typeof symB | typeof symC, Array.NonEmptyArray<string>>>
    >()
    expect(Iterable.groupBy(["a", "b"], (s) => s === "a" ? "a" as const : symA)).type.toBe<
      Partial<Record<"a" | typeof symA, Array.NonEmptyArray<string>>>
    >()
  })
})
