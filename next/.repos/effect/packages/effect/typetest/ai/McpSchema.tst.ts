import type * as McpSchema from "effect/ai/McpSchema"
import { describe, expect, it } from "tstyche"

describe("McpSchema", () => {
  it("should accept boolean property schemas when assigning tool schemas", () => {
    expect<{
      type: "object"
      properties: { forbidden: false; anything: true; text: { type: "string" } }
    }>().type.toBeAssignableTo<McpSchema.ToolJson>()
    expect<{ type: "object"; properties: { invalid: null } }>().type.not.toBeAssignableTo<McpSchema.ToolJson>()
  })
})
