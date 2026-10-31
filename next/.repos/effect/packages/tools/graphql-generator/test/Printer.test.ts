import type * as Ast from "@effect/graphql-generator/internal/Ast"
import { print } from "@effect/graphql-generator/internal/Printer"
import { assert, describe, it } from "@effect/vitest"
import { readdirSync, readFileSync } from "node:fs"
import { parseOrThrow, stripLoc } from "./utils/ast.ts"

const operationsDirectory = new URL("./fixtures/github/operations/", import.meta.url)

const printed = (body: string) => print(parseOrThrow(body))

describe("Printer", () => {
  it("an anonymous query collapses to the shorthand", () => {
    assert.strictEqual(printed("query { a }"), "{a}")
  })

  it("an anonymous query with variables keeps the keyword", () => {
    assert.strictEqual(printed("query ($a: Int) { f }"), "query($a:Int){f}")
  })

  it("is token-minimal: a space only where two non-punctuators would merge", () => {
    assert.strictEqual(
      printed("query Q($a: Int = 1, $b: [Int!]) @d { f(x: [1, -2], y: {}) ...F }"),
      "query Q($a:Int=1$b:[Int!])@d{f(x:[1 -2]y:{})...F}"
    )
  })

  it("prints fragment spreads, inline fragments and fragment definitions", () => {
    assert.strictEqual(
      printed("{ ...F @d ... on T { a } ... { b } } fragment F on T @e { alias: c }"),
      "{...F@d...on T{a}...{b}}fragment F on T@e{alias:c}"
    )
  })

  it("numbers keep their source text", () => {
    assert.strictEqual(printed("{ f(a: -0, b: 2E+2) }"), "{f(a:-0 b:2E+2)}")
  })

  it("strings print as regular strings with escapes and upper-case control escapes", () => {
    assert.strictEqual(
      printed("{ f(s: \"a\\\"b\\\\c\\nd\\u0001\\u007fé\") }"),
      "{f(s:\"a\\\"b\\\\c\\nd\\u0001\\u007Fé\")}"
    )
  })

  it("block strings print dedented as regular strings", () => {
    assert.strictEqual(printed("{ f(s: \"\"\"\n    multi\n      line\n    \"\"\") }"), "{f(s:\"multi\\n  line\")}")
  })

  it("descriptions on operations, variables and fragments are not printed", () => {
    assert.strictEqual(
      printed("\"docs\" query Q(\"x\" $x: Int) { a } \"f\" fragment F on T { a }"),
      "query Q($x:Int){a}fragment F on T{a}"
    )
  })

  it("prints a synthesised document of selected definitions in the order given", () => {
    const parsed = parseOrThrow("query Q { ...B ...A } fragment A on T { a } fragment B on T { b }")
    const [query, a, b] = parsed.definitions as ReadonlyArray<Ast.ExecutableDefinition>
    const document: Ast.Document = { _tag: "Document", definitions: [query!, b!, a!], loc: { start: 0, end: 0 } }
    assert.strictEqual(print(document), "query Q{...B...A}fragment B on T{b}fragment A on T{a}")
  })

  for (const file of readdirSync(operationsDirectory).filter((file) => file.endsWith(".graphql")).sort()) {
    it(`GitHub operations ${file} reparse to the same AST`, () => {
      const document = parseOrThrow(readFileSync(new URL(file, operationsDirectory), "utf8"), file)
      assert.deepStrictEqual(stripLoc(parseOrThrow(print(document))), stripLoc(document))
    })
  }
})
