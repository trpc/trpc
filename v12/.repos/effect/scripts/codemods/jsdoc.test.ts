import { assert } from "@effect/vitest"
import { applyTransform } from "jscodeshift/src/testUtils.js"
import { describe, it } from "vitest"
import transformer from "./jsdoc.ts"

const doc = "/** Repeats a value. */"

const transform = (source: string): string =>
  applyTransform(transformer, {}, { path: "Module.ts", source }, { parser: "ts" })

const countDocs = (output: string): number => output.split("Repeats a value.").length - 1

describe("jsdoc codemod", () => {
  it("leaves generic calls inside an annotated dual implementation unchanged", () => {
    const output = transform(`${doc}
export const repeat: {
  (n: number): <A>(self: A) => Array<A>
  <A>(self: A, n: number): Array<A>
} = dual(2, <A>(self: A, n: number): Array<A> => make<A, number>(self, n))
`)
    assert.include(output, "make<A, number>(self, n)")
    assert.strictEqual(countDocs(output), 3)
  })

  it("leaves generic calls inside a dual implementation with type arguments unchanged", () => {
    const output = transform(`${doc}
export const repeat = dual<
  (n: number) => <A>(self: A) => Array<A>,
  <A>(self: A, n: number) => Array<A>
>(2, <A>(self: A, n: number) => make<A, number>(self, n))
`)
    assert.include(output, "make<A, number>(self, n)")
    assert.strictEqual(countDocs(output), 3)
  })

  it.each(["dual", "Dual.dual"])(
    "leaves initializer call signatures unchanged on an annotated %s export",
    (callee) => {
      const output = transform(`${doc}
export const repeat: {
  (n: number): (self: string) => string
  (self: string, n: number): string
} = ${callee}<
  { (n: number): (self: string) => string },
  { (self: string, n: number): string }
>(2, (self: string, n: number): string => self.repeat(n))
`)
      assert.strictEqual(countDocs(output), 3)
    }
  )
})
