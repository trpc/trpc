import { assert, describe, it } from "@effect/vitest"
import { assertDefinitions, assertDiagnostic, name, namedType, parseOrThrow, str, stripLoc } from "./utils/ast.ts"

describe("Parser: executable documents", () => {
  it("the shorthand is a query without a name", () => {
    assertDefinitions("{ a }", [{
      _tag: "OperationDefinition",
      operation: "query",
      variableDefinitions: [],
      directives: [],
      selectionSet: {
        _tag: "SelectionSet",
        selections: [{ _tag: "Field", name: name("a"), arguments: [], directives: [] }]
      }
    }])
  })

  it("locations are UTF-16 offsets into the body with an exclusive end", () => {
    const document = parseOrThrow("{ a }")
    assert.deepStrictEqual(document.loc, { start: 0, end: 5 })
    const operation = document.definitions[0]!
    assert(operation._tag === "OperationDefinition")
    assert.deepStrictEqual(operation.selectionSet.selections[0]!.loc, { start: 2, end: 3 })
  })

  it("operations and variable definitions carry descriptions (September 2025 edition)", () => {
    // Expectations are untyped until `Ast.ts` gains `description` on these nodes.
    const definitions: unknown = stripLoc(parseOrThrow("\"op doc\" query Q(\"x doc\" $x: Int) { a }")).definitions
    assert.deepStrictEqual(definitions, [{
      _tag: "OperationDefinition",
      description: str("op doc"),
      operation: "query",
      name: name("Q"),
      variableDefinitions: [{
        _tag: "VariableDefinition",
        description: str("x doc"),
        variable: { _tag: "Variable", name: name("x") },
        type: namedType("Int"),
        directives: []
      }],
      directives: [],
      selectionSet: {
        _tag: "SelectionSet",
        selections: [{ _tag: "Field", name: name("a"), arguments: [], directives: [] }]
      }
    }])
  })

  describe("diagnostics", () => {
    it("empty document", () => {
      assertDiagnostic("", { line: 1, column: 1, message: "Unexpected <EOF>." })
    })

    it("description on the query shorthand", () => {
      assertDiagnostic("\"docs\" { a }", {
        line: 1,
        column: 1,
        message: "Unexpected description, descriptions are not supported on shorthand queries."
      })
    })

    it("variable in selection position", () => {
      assertDiagnostic("{ $v }", { line: 1, column: 3, message: "Expected Name, found \"$\"." })
    })

    it("fragment named on", () => {
      assertDiagnostic("fragment on on T { a }", { line: 1, column: 10, message: "Unexpected Name \"on\"." })
    })

    it("fragment without a type condition", () => {
      assertDiagnostic("fragment F { a }", { line: 1, column: 12, message: "Expected \"on\", found \"{\"." })
    })
  })
})
