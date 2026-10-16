import { describe, it } from "@effect/vitest"
import { assertFalse, assertTrue } from "@effect/vitest/utils"
import { MutableHashSet } from "effect"

describe("MutableHashSet", () => {
  it("isMutableHashSet distinguishes Effect mutable hash sets from native sets", () => {
    assertTrue(MutableHashSet.isMutableHashSet(MutableHashSet.make("a", "b")))
    assertFalse(MutableHashSet.isMutableHashSet(new Set(["a", "b"])))
  })
})
