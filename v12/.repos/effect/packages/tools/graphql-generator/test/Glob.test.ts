import * as Glob from "@effect/graphql-generator/internal/Glob"
import { assert, describe, it } from "@effect/vitest"

const assertMatches = (pattern: string, matching: ReadonlyArray<string>, notMatching: ReadonlyArray<string>) => {
  const glob = Glob.make(pattern)
  for (const path of matching) assert.isTrue(glob.matches(path), `${pattern} should match ${path}`)
  for (const path of notMatching) assert.isFalse(glob.matches(path), `${pattern} should not match ${path}`)
}

describe("Glob", () => {
  it("* matches within one path segment", () => {
    assertMatches("src/*.graphql", ["src/a.graphql"], ["src/a/b.graphql", "a.graphql", "src/a.gql"])
  })

  it("** matches any number of segments, including none", () => {
    assertMatches(
      "src/**/*.graphql",
      ["src/a.graphql", "src/x/a.graphql", "src/x/y/z/a.graphql"],
      ["a.graphql", "lib/a.graphql", "src/a.graphql.ts"]
    )
  })

  it("{a,b} matches either alternative", () => {
    assertMatches("{src,lib}/*.graphql", ["src/a.graphql", "lib/a.graphql"], ["app/a.graphql"])
  })

  it("an unmatched { is a literal character", () => {
    assertMatches("src/{q,r.graphql", ["src/{q,r.graphql"], ["src/q.graphql", "src/r.graphql"])
  })

  it("root is the leading segments before the first wildcard", () => {
    assert.strictEqual(Glob.make("src/app/**/*.graphql").root, "src/app")
    assert.strictEqual(Glob.make("./src/*.graphql").root, "src")
    assert.strictEqual(Glob.make("**/*.graphql").root, "")
  })
})
