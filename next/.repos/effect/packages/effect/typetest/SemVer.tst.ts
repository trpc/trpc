import type { Result } from "effect"
import { SemVer } from "effect"
import { describe, expect, it } from "tstyche"

describe("SemVer", () => {
  it("Input accepts only well-formed version string literals", () => {
    expect("1.2.3").type.toBeAssignableTo<SemVer.Input>()
    expect("1.0.0-rc.1+build.5").type.toBeAssignableTo<SemVer.Input>()
    expect("1.2").type.not.toBeAssignableTo<SemVer.Input>()
    expect("v1.2.3").type.not.toBeAssignableTo<SemVer.Input>()
    expect("01.2.3").type.not.toBeAssignableTo<SemVer.Input>()
    expect("1e3.0.0").type.not.toBeAssignableTo<SemVer.Input>()
    expect("1.2.x").type.not.toBeAssignableTo<SemVer.Input>()
    expect<string>().type.not.toBeAssignableTo<SemVer.Input>()
  })

  it("Input accepts versions and components", () => {
    expect(SemVer.parseUnsafe("1.2.3")).type.toBeAssignableTo<SemVer.Input>()
    expect({ major: 1, minor: 2, patch: 3, prerelease: ["rc", 1] }).type.toBeAssignableTo<SemVer.Input>()
    expect({ major: 1, minor: 2 }).type.not.toBeAssignableTo<SemVer.Input>()
    expect(SemVer.fromInput("1.2.3")).type.toBe<Result.Result<SemVer.SemVer, SemVer.SemVerError>>()
  })
})
