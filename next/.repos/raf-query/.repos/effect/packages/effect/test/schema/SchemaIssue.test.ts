import { assert, describe, it } from "@effect/vitest"
import { Result, Schema, SchemaIssue } from "effect"
import { assertFalse, assertTrue } from "../utils/assert.ts"

describe("SchemaIssue", () => {
  const formatIssue = SchemaIssue.makeFormatterDefault()

  it("isIssue", () => {
    assertTrue(SchemaIssue.isIssue(new SchemaIssue.MissingKey(undefined)))
    assertFalse(SchemaIssue.isIssue({ "~effect/SchemaIssue/Issue": false }))
  })

  it("does not expose an actual field", () => {
    const union = Schema.Union([Schema.String, Schema.Number]).ast
    const invalidValue = new SchemaIssue.InvalidValue()
    const issues: ReadonlyArray<SchemaIssue.Issue> = [
      new SchemaIssue.InvalidType(Schema.String.ast),
      invalidValue,
      new SchemaIssue.MissingKey(undefined),
      new SchemaIssue.UnexpectedKey(Schema.String.ast),
      new SchemaIssue.Forbidden(undefined),
      new SchemaIssue.OneOf(union, [Schema.String.ast]),
      new SchemaIssue.Filter(Schema.isMinLength(1), invalidValue),
      new SchemaIssue.Encoding(Schema.String.ast, invalidValue),
      new SchemaIssue.Pointer(["value"], invalidValue),
      new SchemaIssue.Composite(Schema.String.ast, [invalidValue]),
      new SchemaIssue.AnyOf(union, [invalidValue])
    ]

    for (const issue of issues) {
      assertFalse("actual" in issue)
    }
  })

  it("preserves structural metadata", () => {
    const annotations = { message: "custom message" }
    const invalidType = new SchemaIssue.InvalidType(Schema.String.ast)
    const invalidValue = new SchemaIssue.InvalidValue(annotations)
    const unexpectedKey = new SchemaIssue.UnexpectedKey(Schema.Number.ast)
    const union = Schema.Union([Schema.String, Schema.Number]).ast
    const successes = [Schema.String.ast]
    const oneOf = new SchemaIssue.OneOf(union, successes)

    assert.strictEqual(invalidType.ast, Schema.String.ast)
    assert.strictEqual(invalidValue.annotations, annotations)
    assert.strictEqual(unexpectedKey.ast, Schema.Number.ast)
    assert.strictEqual(oneOf.ast, union)
    assert.strictEqual(oneOf.successes, successes)
  })

  it("formats leaf issues with static built-in messages", () => {
    const union = Schema.Union([Schema.String, Schema.Number]).ast
    const cases: ReadonlyArray<readonly [SchemaIssue.Leaf, string]> = [
      [new SchemaIssue.InvalidType(Schema.String.ast), "Expected string"],
      [new SchemaIssue.InvalidValue(), "Expected a valid value"],
      [new SchemaIssue.MissingKey(undefined), "Missing key"],
      [new SchemaIssue.UnexpectedKey(Schema.String.ast), "Expected no excess property"],
      [new SchemaIssue.Forbidden(undefined), "Forbidden operation"],
      [new SchemaIssue.OneOf(union, [Schema.String.ast]), "Expected exactly one member to match"]
    ]

    for (const [issue, expected] of cases) {
      assert.strictEqual(formatIssue(issue), expected)
    }
  })

  it("uses an empty AnyOf when no union candidates apply", () => {
    const result = Schema.decodeUnknownResult(Schema.Union([Schema.String, Schema.Number]))(null)

    assertTrue(Result.isFailure(result))
    assertTrue(result.failure.issue._tag === "AnyOf")
    assert.deepStrictEqual(result.failure.issue.issues, [])
  })
})
