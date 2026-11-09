import { Schema } from "effect"
import { describe, expect, it } from "tstyche"

describe("Enum", () => {
  it("preserves inline string literal members", () => {
    const schema = Schema.Enum({ All: "all", Selected: "selected" })

    expect(schema.Type).type.toBe<"all" | "selected">()
  })

  it("preserves inline numeric literal members", () => {
    const schema = Schema.Enum({ All: 0, Selected: 1 })

    expect(schema.Type).type.toBe<0 | 1>()
  })

  it("preserves TypeScript enum types", () => {
    enum StringEnum {
      All = "all",
      Selected = "selected"
    }
    enum NumericEnum {
      All,
      Selected
    }

    expect(Schema.Enum(StringEnum).Type).type.toBe<StringEnum>()
    expect(Schema.Enum(NumericEnum).Type).type.toBe<NumericEnum>()
  })
})
