import { Schema } from "effect"
import * as Workflow from "effect/workflow/Workflow"
import { describe, expect, it } from "tstyche"

describe("Workflow", () => {
  it("supports class extension", () => {
    class ClassWorkflow extends Workflow.make("ClassWorkflow", {
      payload: { value: Schema.Number },
      success: Schema.Number,
      idempotencyKey: ({ value }) => String(value)
    }) {}

    expect<typeof ClassWorkflow>().type.toBeAssignableTo<Workflow.Any>()
    expect(ClassWorkflow.payloadSchema).type.toBe<Schema.Struct<{ value: Schema.Number }>>()
  })
})
