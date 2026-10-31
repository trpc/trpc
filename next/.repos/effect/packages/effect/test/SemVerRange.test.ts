import { describe, it } from "@effect/vitest"
import { assertFalse, assertTrue, deepStrictEqual, strictEqual, throws } from "@effect/vitest/utils"
import { Equal, Hash, Option, pipe, Result, SemVer, SemVerRange } from "effect"

const $ = SemVer.parseUnsafe
const range = SemVerRange.parseUnsafe

describe("SemVerRange", () => {
  it("parses and formats npm-style ranges", () => {
    for (
      const [input, expected] of [
        ["^1.2.3", "^1.2.3"],
        ["~1.2", "~1.2"],
        ["1.x", "1"],
        ["1.2.*", "1.2"],
        ["x", "*"],
        ["", "*"],
        ["=1.2.3", "1.2.3"],
        [">= 1.2.3  <2", ">=1.2.3 <2"],
        ["1.2.3 - 2.x", "1.2.3 - 2"],
        ["^1 ||~2.1  >2.1.5", "^1 || ~2.1 >2.1.5"],
        ["<=1.2.3-beta.1", "<=1.2.3-beta.1"]
      ] as const
    ) {
      strictEqual(SemVerRange.format(range(input)), expected)
    }
    assertTrue(Equal.equals(SemVerRange.fromInputUnsafe("^1.2"), range("^1.2")))
  })

  it("rejects invalid ranges", () => {
    for (
      const input of [
        "v1",
        "1.2.3+build",
        "1.x.3",
        "1.2-beta",
        "1.2.3 ||",
        ">=",
        "~>1.2",
        "1.2.3 - 2 >1",
        "latest"
      ]
    ) {
      assertTrue(Result.isFailure(SemVerRange.parse(input)), input)
    }
    const result = SemVerRange.parse("1.x.3")
    assertTrue(Result.isFailure(result))
    assertTrue(SemVer.isSemVerError(result.failure))
    strictEqual(
      result.failure.message,
      `Invalid SemVer range "1.x.3": a version component cannot follow a wildcard, received "1.x.3"`
    )
    throws(() => SemVerRange.fromInputUnsafe("^v1"))
  })

  it("compares ranges by normalized syntax", () => {
    assertTrue(SemVerRange.isSemVerRange(range("^1")))
    assertFalse(SemVerRange.isSemVerRange("^1"))
    assertTrue(Equal.equals(range("1.x || >=2"), range("1 || >= 2")))
    strictEqual(Hash.hash(range("1.x")), Hash.hash(range("1")))
    assertFalse(Equal.equals(range("^1"), range("1")))
    strictEqual(String(range("^1.2")), "SemVerRange(^1.2)")
    deepStrictEqual(range("^1.2").toJSON(), { _id: "SemVerRange", value: "^1.2" })
  })

  it("constructors build ranges from versions without build metadata", () => {
    const version = $("1.2.3-rc.1+build.5")
    for (
      const [built, expected] of [
        [SemVerRange.exact(version), "1.2.3-rc.1"],
        [SemVerRange.greaterThan(version), ">1.2.3-rc.1"],
        [SemVerRange.greaterThanOrEqualTo(version), ">=1.2.3-rc.1"],
        [SemVerRange.lessThan(version), "<1.2.3-rc.1"],
        [SemVerRange.lessThanOrEqualTo(version), "<=1.2.3-rc.1"],
        [SemVerRange.caret(version), "^1.2.3-rc.1"],
        [SemVerRange.tilde(version), "~1.2.3-rc.1"],
        [SemVerRange.between({ minimum: $("1.0.0"), maximum: version }), ">=1.0.0 <=1.2.3-rc.1"],
        [SemVerRange.any, "*"]
      ] as const
    ) {
      assertTrue(Equal.equals(built, range(expected)), expected)
    }
  })

  it("matches versions like npm", () => {
    const cases: ReadonlyArray<readonly [string, ReadonlyArray<string>, ReadonlyArray<string>]> = [
      ["1.2.3", ["1.2.3", "1.2.3+build"], ["1.2.4", "1.2.3-rc.1"]],
      ["*", ["0.0.0", "99.0.0"], ["1.0.0-beta"]],
      ["^1.2.3", ["1.2.3", "1.9.9"], ["1.2.2", "2.0.0-0", "1.5.0-rc.1"]],
      ["^0.2.3", ["0.2.9"], ["0.3.0"]],
      ["^0.0.3", ["0.0.3"], ["0.0.4"]],
      ["~1.2", ["1.2.0", "1.2.9"], ["1.3.0"]],
      [">1.2", ["1.3.0"], ["1.2.9"]],
      ["<=1.2", ["1.2.9"], ["1.3.0"]],
      ["<*", [], ["0.0.0"]],
      ["1.2 - 2.3", ["1.2.0", "2.3.9"], ["1.1.9", "2.4.0"]],
      [">=1.2.3 <2 || >=3", ["1.5.0", "3.1.0"], ["2.5.0"]],
      [">1.2.3-alpha.3", ["1.2.3-alpha.7", "3.4.5"], ["3.4.5-alpha.9"]],
      // Unlike node-semver, a `*` alternative keeps pre-releases admitted by another alternative
      ["* || ^1.2.3-beta.1", ["1.2.3-beta.2"], ["1.2.4-beta"]]
    ]
    for (const [input, included, excluded] of cases) {
      for (const version of included) assertTrue(SemVerRange.matches(range(input), $(version)), `${version} ${input}`)
      for (const version of excluded) assertFalse(SemVerRange.matches(range(input), $(version)), `${version} ${input}`)
    }
  })

  it("includePrerelease lets pre-releases match within bounds", () => {
    const options = { includePrerelease: true }
    assertTrue(SemVerRange.matches(range("^1.2.3"), $("1.5.0-rc.1"), options))
    assertTrue(SemVerRange.matches(range("1.x"), $("1.0.0-0"), options))
    assertFalse(SemVerRange.matches(range("^1.2.3"), $("2.0.0-0"), options))
    assertTrue(pipe(range("*"), SemVerRange.matches($("1.0.0-beta"), options)))
  })

  it("maxSatisfying / minSatisfying", () => {
    const versions = ["1.2.0", "1.4.1+a", "1.4.1+b", "2.0.0", "1.5.0-rc.1", "1.1.0"].map($)
    const caret = range("^1.2.0")
    deepStrictEqual(SemVerRange.maxSatisfying(caret, versions), Option.some(versions[1]))
    deepStrictEqual(SemVerRange.minSatisfying(caret, versions), Option.some(versions[0]))
    deepStrictEqual(
      pipe(caret, SemVerRange.maxSatisfying(versions, { includePrerelease: true })),
      Option.some(versions[4])
    )
    deepStrictEqual(SemVerRange.maxSatisfying(range("^3"), versions), Option.none())
  })

  it("accepts SemVer.Input in place of versions", () => {
    assertTrue(Equal.equals(SemVerRange.caret("1.2.3+build"), range("^1.2.3")))
    assertTrue(
      Equal.equals(
        SemVerRange.between({ minimum: "1.0.0", maximum: { major: 2, minor: 0, patch: 0 } }),
        range(">=1.0.0 <=2.0.0")
      )
    )
    assertTrue(SemVerRange.matches(range("^1.2.3"), "1.5.0"))
    assertTrue(pipe(range("^1.2.3"), SemVerRange.matches({ major: 1, minor: 5, patch: 0 })))
    deepStrictEqual(SemVerRange.maxSatisfying(range("^1.2.0"), ["1.2.0", $("1.4.1"), "2.0.0"]), Option.some($("1.4.1")))
    deepStrictEqual(SemVerRange.minSatisfying(range("^1.2.0"), ["1.4.1", "1.2.0+b"]), Option.some($("1.2.0+b")))
    throws(() => SemVerRange.caret({ major: -1, minor: 0, patch: 0 }), (error) => {
      assertTrue(SemVer.isSemVerError(error))
    })
    throws(() => SemVerRange.matches(range("*"), "1.2.3-"))
  })
})
