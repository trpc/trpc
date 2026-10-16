import * as Symbol_ from "effect/Symbol"
import assert from "node:assert/strict"
import { describe, it } from "vitest"

describe("Symbol", () => {
  describe("isSymbol", () => {
    it("returns true for primitive symbols created with Symbol()", () => {
      assert.strictEqual(Symbol_.isSymbol(Symbol()), true)
    })

    it("returns true for global registry symbols created with Symbol.for()", () => {
      assert.strictEqual(Symbol_.isSymbol(Symbol.for("test")), true)
    })

    it("returns true for well-known primitive symbols", () => {
      assert.strictEqual(Symbol_.isSymbol(Symbol.iterator), true)
      assert.strictEqual(Symbol_.isSymbol(Symbol.hasInstance), true)
      assert.strictEqual(Symbol_.isSymbol(Symbol.toPrimitive), true)
    })

    it("returns false for strings", () => {
      assert.strictEqual(Symbol_.isSymbol("symbol"), false)
      assert.strictEqual(Symbol_.isSymbol(""), false)
    })

    it("returns false for numbers", () => {
      assert.strictEqual(Symbol_.isSymbol(0), false)
      assert.strictEqual(Symbol_.isSymbol(NaN), false)
    })

    it("returns false for booleans", () => {
      assert.strictEqual(Symbol_.isSymbol(true), false)
      assert.strictEqual(Symbol_.isSymbol(false), false)
    })

    it("returns false for null and undefined", () => {
      assert.strictEqual(Symbol_.isSymbol(null), false)
      assert.strictEqual(Symbol_.isSymbol(undefined), false)
    })

    it("returns false for objects and arrays", () => {
      assert.strictEqual(Symbol_.isSymbol({}), false)
      assert.strictEqual(Symbol_.isSymbol([]), false)
    })

    it("returns false for functions", () => {
      assert.strictEqual(Symbol_.isSymbol(() => {}), false)
    })
  })
})
