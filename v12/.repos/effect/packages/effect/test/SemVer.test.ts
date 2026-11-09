import { describe, it } from "@effect/vitest"
import { assertFalse, assertTrue, deepStrictEqual, strictEqual, throws } from "@effect/vitest/utils"
import { Array, Equal, Hash, Option, pipe, Result, SemVer } from "effect"

const $ = SemVer.parseUnsafe
const fmt = SemVer.format

describe("SemVer", () => {
  it("parses and formats SemVer 2.0.0 strings", () => {
    for (
      const input of [
        "0.0.0",
        "10.20.30",
        "1.0.0-alpha.1",
        "1.0.0-x-y-z.--",
        "1.0.0-0a",
        "1.0.0-beta+exp.sha.5114f85",
        "1.0.0+21AF26D3----117B344092BD",
        `${Number.MAX_SAFE_INTEGER}.0.0`
      ]
    ) {
      strictEqual(fmt($(input)), input)
    }
    const version = $("1.2.3-rc.10.0a+001.exp")
    deepStrictEqual([version.major, version.minor, version.patch], [1, 2, 3])
    deepStrictEqual(version.prerelease, ["rc", 10, "0a"])
    deepStrictEqual(version.build, ["001", "exp"])
  })

  it("rejects strings outside the SemVer 2.0.0 grammar", () => {
    for (
      const input of [
        "",
        "1.2",
        "1.2.3.4",
        "v1.2.3",
        " 1.2.3",
        "01.2.3",
        "1.2.3-",
        "1.2.3-01",
        "1.2.3-a..b",
        "1.2.3+a+b",
        "1.2.x",
        `${Number.MAX_SAFE_INTEGER + 1}.0.0`
      ]
    ) {
      assertTrue(Result.isFailure(SemVer.parse(input)), input)
    }
    const result = SemVer.parse("1.02.3")
    assertTrue(Result.isFailure(result))
    assertTrue(SemVer.isSemVerError(result.failure))
    strictEqual(result.failure.input, "1.02.3")
    strictEqual(
      result.failure.message,
      `Invalid SemVer "1.02.3": minor must be a non-negative integer without leading zeros, received "02"`
    )
    throws(() => $("1.2"))
  })

  it("make validates and normalizes components", () => {
    const version = SemVer.make({ major: 1, minor: 0, patch: 0, prerelease: ["beta", "2"], build: ["001"] })
    deepStrictEqual(version.prerelease, ["beta", 2])
    assertTrue(Equal.equals(version, $("1.0.0-beta.2+001")))
    strictEqual(fmt(SemVer.make({ ...version, patch: 1, prerelease: [] })), "1.0.1+001")
    for (
      const components of [
        { major: -1, minor: 0, patch: 0 },
        { major: 1.5, minor: 0, patch: 0 },
        { major: 0, minor: 0, patch: Number.MAX_SAFE_INTEGER + 1 },
        { major: 0, minor: 0, patch: 0, prerelease: ["01"] },
        { major: 0, minor: 0, patch: 0, prerelease: ["a.b"] },
        { major: 0, minor: 0, patch: 0, build: [""] }
      ]
    ) {
      throws(() => SemVer.make(components), (error) => {
        assertTrue(SemVer.isSemVerError(error))
      })
    }
  })

  it("fromInput accepts versions, strings, and components", () => {
    const version = $("1.2.3-rc.1")
    strictEqual(SemVer.fromInputUnsafe(version), version)
    assertTrue(Equal.equals(SemVer.fromInputUnsafe("1.2.3-rc.1"), version))
    assertTrue(Equal.equals(SemVer.fromInputUnsafe({ major: 1, minor: 2, patch: 3, prerelease: ["rc", 1] }), version))
    assertTrue(Result.isFailure(SemVer.fromInput({ major: -1, minor: 0, patch: 0 })))
    throws(() => SemVer.fromInputUnsafe("1.2.3-"))
  })

  it("guards", () => {
    assertTrue(SemVer.isSemVer($("1.2.3")))
    assertFalse(SemVer.isSemVer({ major: 1, minor: 2, patch: 3, prerelease: [], build: [] }))
    assertTrue(SemVer.isPrerelease($("1.2.3-0")))
    assertFalse(SemVer.isPrerelease($("1.2.3+build")))
    assertTrue(SemVer.hasBuild($("1.2.3+build")))
    assertFalse(SemVer.hasBuild($("1.2.3-0")))
    assertTrue(SemVer.isInitialDevelopment($("0.9.9")))
    assertFalse(SemVer.isInitialDevelopment($("1.0.0-rc.1")))
  })

  it("Order follows spec precedence and ignores build metadata", () => {
    // SemVer 2.0.0 §11 example chain, extended with numeric comparisons
    const chain = [
      "1.0.0-alpha",
      "1.0.0-alpha.1",
      "1.0.0-alpha.beta",
      "1.0.0-beta",
      "1.0.0-beta.2",
      "1.0.0-beta.11",
      "1.0.0-rc.1",
      "1.0.0",
      "1.0.1",
      "1.1.0",
      "2.0.0",
      "10.0.0"
    ].map($)
    deepStrictEqual(Array.sort(Array.reverse(chain), SemVer.Order), chain)
    strictEqual(SemVer.Order($("1.0.0-10"), $("1.0.0-0a")), -1)
    strictEqual(SemVer.Order($("1.0.0-Z"), $("1.0.0-a")), -1)
    strictEqual(SemVer.Order($("1.0.0+a"), $("1.0.0+b")), 0)
    assertTrue(pipe($("2.0.0-rc.1"), SemVer.isGreaterThan($("1.0.0"))))
    strictEqual(fmt(SemVer.clamp($("3.0.0"), { minimum: $("1.0.0"), maximum: $("2.0.0") })), "2.0.0")
  })

  it("equality and hashing include build metadata", () => {
    assertTrue(Equal.equals($("1.0.0-rc.1+a"), $("1.0.0-rc.1+a")))
    strictEqual(Hash.hash($("1.0.0-rc.1+a")), Hash.hash($("1.0.0-rc.1+a")))
    assertFalse(Equal.equals($("1.0.0+a"), $("1.0.0+b")))
    assertFalse(Equal.equals($("1.0.0+a"), $("1.0.0")))
  })

  it("formats for display", () => {
    const version = $("1.2.3-rc.1+build")
    strictEqual(String(version), "SemVer(1.2.3-rc.1+build)")
    deepStrictEqual(version.toJSON(), { _id: "SemVer", value: "1.2.3-rc.1+build" })
  })

  it("withPrerelease / withBuild / release", () => {
    strictEqual(fmt(SemVer.withPrerelease($("1.2.3+b"), ["rc", "1"])), "1.2.3-rc.1+b")
    strictEqual(fmt(pipe($("1.2.3-a+b"), SemVer.withBuild([]))), "1.2.3-a")
    strictEqual(fmt(SemVer.release($("1.2.3-rc.1+b"))), "1.2.3")
    throws(() => SemVer.withPrerelease($("1.2.3"), ["01"]))
    throws(() => SemVer.withBuild($("1.2.3"), ["a.b"]))
  })

  it("bump follows npm semantics", () => {
    const cases: ReadonlyArray<readonly [string, SemVer.ReleaseType, string | undefined, string]> = [
      ["1.2.3+b", "major", undefined, "2.0.0"],
      ["2.0.0-rc.1", "major", undefined, "2.0.0"],
      ["2.1.0-rc.1", "major", undefined, "3.0.0"],
      ["1.2.0-a", "minor", undefined, "1.2.0"],
      ["1.2.3-a", "minor", undefined, "1.3.0"],
      ["1.2.3-a+b", "patch", undefined, "1.2.3"],
      ["1.2.3+b", "patch", undefined, "1.2.4"],
      ["1.2.3", "premajor", undefined, "2.0.0-0"],
      ["1.2.3-a", "preminor", "rc", "1.3.0-rc.0"],
      ["1.2.3", "prepatch", "alpha", "1.2.4-alpha.0"],
      ["1.2.3", "prerelease", undefined, "1.2.4-0"],
      ["1.2.4-alpha.0+b", "prerelease", undefined, "1.2.4-alpha.1"],
      ["1.2.4-alpha", "prerelease", "alpha", "1.2.4-alpha.0"],
      ["1.2.4-alpha.1.beta", "prerelease", undefined, "1.2.4-alpha.2.beta"],
      ["1.2.4-alpha.3", "prerelease", "beta", "1.2.4-beta.0"]
    ]
    for (const [input, releaseType, identifier, expected] of cases) {
      strictEqual(fmt(SemVer.bump($(input), releaseType, identifier)), expected, `${input} ${releaseType}`)
    }
    strictEqual(fmt(pipe($("1.2.3"), SemVer.bumpMinor)), "1.3.0")
    strictEqual(fmt(pipe($("1.2.3"), SemVer.bumpPrerelease("rc"))), "1.2.4-rc.0")
    throws(() => SemVer.bumpMajor($(`${Number.MAX_SAFE_INTEGER}.0.0`)))
    throws(() => SemVer.bumpPrerelease($("1.2.3"), "a.b"))
  })

  it("difference classifies the bump between two versions", () => {
    // Selected from node-semver's `diff` test table (test/functions/diff.js at 7.8.5)
    const cases: ReadonlyArray<readonly [string, string, SemVer.ReleaseType | null]> = [
      ["0.2.3", "1.2.3", "major"],
      ["2.0.0-pre", "1.2.3", "premajor"],
      ["1.0.1", "1.1.0-pre", "preminor"],
      ["1.2.3", "1.2.4", "patch"],
      ["0.0.1", "0.0.1-pre", "patch"],
      ["1.1.0", "1.1.0-pre", "minor"],
      ["1.1.0-pre-1", "1.1.0-pre-2", "prerelease"],
      ["1.0.0-1", "1.0.0", "major"],
      ["1.0.0-1", "1.0.1-1", "prepatch"],
      ["1.2.3+a", "1.2.3+b", null]
    ]
    for (const [self, that, expected] of cases) {
      deepStrictEqual(SemVer.difference($(self), $(that)), Option.fromNullOr(expected), `${self} vs ${that}`)
    }
  })
})
