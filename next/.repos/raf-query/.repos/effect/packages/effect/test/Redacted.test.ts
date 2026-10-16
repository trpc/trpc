import { describe, it } from "@effect/vitest"
import { assertFalse, assertTrue, strictEqual, throws } from "@effect/vitest/utils"
import { Chunk, Equal, Hash, Redacted } from "effect"

describe("Redacted", () => {
  it("chunk constructor", () => {
    const redacted = Redacted.make(Chunk.fromIterable("redacted".split("")))
    assertTrue(Equal.equals(redacted, Redacted.make(Chunk.fromIterable("redacted".split("")))))
  })

  it("value", () => {
    const redacted = Redacted.make(Chunk.fromIterable("redacted".split("")))
    const value = Redacted.value(redacted)
    assertTrue(Equal.equals(value, Chunk.fromIterable("redacted".split(""))))
  })

  it("pipe supports extracting the protected value", () => {
    const value = { asd: 123 }
    const redacted = Redacted.make(value)
    const extractedValue = redacted.pipe(Redacted.value)
    strictEqual(value, extractedValue)
  })

  it("toString returns a redacted placeholder", () => {
    const redacted = Redacted.make("redacted")
    strictEqual(`${redacted}`, "<redacted>")
  })

  it("toJSON serializes the redacted placeholder", () => {
    const redacted = Redacted.make("redacted")
    strictEqual(JSON.stringify(redacted), "\"<redacted>\"")
  })

  it("label appears in redacted output and wipe errors", () => {
    const redacted = Redacted.make("redacted", { label: "MY_LABEL" })
    strictEqual(redacted.label, "MY_LABEL")
    strictEqual(redacted.toString(), "<redacted:MY_LABEL>")
    strictEqual(JSON.stringify(redacted), `"<redacted:MY_LABEL>"`)

    assertTrue(Redacted.wipeUnsafe(redacted))
    throws(() => Redacted.value(redacted), new Error("Unable to get redacted value with label: \"MY_LABEL\""))
  })

  it("wipeUnsafe removes access to the protected value", () => {
    const redacted = Redacted.make("redacted")
    assertTrue(Redacted.wipeUnsafe(redacted))
    throws(() => Redacted.value(redacted), new Error("Unable to get redacted value"))
  })

  it("Equal compares the protected values of two Redacted values", () => {
    assertTrue(Equal.equals(Redacted.make(1), Redacted.make(1)))
    assertFalse(Equal.equals(Redacted.make(1), Redacted.make(2)))
  })

  it("Hash is derived from the protected value", () => {
    strictEqual(Hash.hash(Redacted.make(1)), Hash.hash(Redacted.make(1)))
    assertTrue(Hash.hash(Redacted.make(1)) !== Hash.hash(Redacted.make(2)))
  })
})
