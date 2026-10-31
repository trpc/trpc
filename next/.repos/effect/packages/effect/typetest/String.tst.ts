import { String } from "effect"
import { describe, expect, it } from "tstyche"

describe("String", () => {
  it("capitalize", () => {
    expect(String.capitalize).type.toBe<(<T extends string>(self: T) => Capitalize<T>)>()
    expect(String.capitalize("hello" as string)).type.toBe<Capitalize<string>>()
  })

  it("uncapitalize", () => {
    expect(String.uncapitalize).type.toBe<(<T extends string>(self: T) => Uncapitalize<T>)>()
    expect(String.uncapitalize("hello" as string)).type.toBe<Uncapitalize<string>>()
    expect(String.uncapitalize("AΣ")).type.toBe<"aΣ">()
  })
})
