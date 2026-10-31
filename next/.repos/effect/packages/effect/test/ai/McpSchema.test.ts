import { assert, describe, it } from "@effect/vitest"
import { Schema } from "effect"
import * as McpSchema from "effect/ai/McpSchema"

describe("McpSchema", () => {
  // Property schemas may be objects or booleans.
  // https://json-schema.org/draft/2020-12/json-schema-core#section-4.3.2
  it("should round-trip tool schemas when properties contain object or boolean schemas", () => {
    const inputSchema = {
      type: "object" as const,
      properties: { forbidden: false, anything: true, text: { type: "string" } }
    }
    assert.deepStrictEqual(
      Schema.encodeSync(McpSchema.ToolJson)(Schema.decodeUnknownSync(McpSchema.ToolJson)(inputSchema)),
      inputSchema
    )
    assert.throws(() => Schema.decodeUnknownSync(McpSchema.ToolJson)({ type: "object", properties: { invalid: null } }))
  })

  it("should preserve custom metadata when a request is decoded and encoded", () => {
    const decode = Schema.decodeUnknownSync(McpSchema.RequestMeta)
    const encode = Schema.encodeSync(McpSchema.RequestMeta)
    for (const progress of [{}, { progressToken: "progress-1" }, { progressToken: 1 }]) {
      const request = {
        _meta: { ...progress, marker: "request", custom: { values: [null, true, 42, "value"] } }
      }
      assert.deepStrictEqual(encode(decode(request)), request)
    }
  })

  it("should check the digest and size of a skill resource", () => {
    const decode = Schema.decodeUnknownSync(McpSchema.SkillResource)
    const valid = { uri: "skill://refunds/SKILL.md", digest: `sha256:${"0".repeat(64)}`, size: 0 }
    assert.doesNotThrow(() => decode(valid))
    for (
      const invalid of [{ ...valid, digest: `sha256:${"A".repeat(64)}` }, { ...valid, digest: "sha256:0" }, {
        ...valid,
        size: -1
      }]
    ) {
      assert.throws(() => decode(invalid), undefined, undefined, JSON.stringify(invalid))
    }
  })

  const decodeCreateMessage = Schema.decodeUnknownSync(McpSchema.CreateMessage.payloadSchema)

  it("allows create-message metadata to be omitted", () => {
    assert.doesNotThrow(() => decodeCreateMessage({ messages: [], maxTokens: 1 }))
  })

  it("requires create-message metadata to be an object", () => {
    assert.throws(() => decodeCreateMessage({ messages: [], maxTokens: 1, metadata: "invalid" }))
  })

  // SEP-1330: https://modelcontextprotocol.io/seps/1330-elicitation-enum-schema-improvements-and-standards
  // Conformance: elicitation-sep1330-enums
  it("should preserve every November elicitation enum form when decoding a form request", () => {
    const decoded = Schema.decodeUnknownSync(McpSchema.ElicitRequestFormParams)({
      mode: "form",
      message: "Choose values",
      requestedSchema: {
        type: "object",
        properties: {
          untitled: { type: "string", enum: ["one", "two"] },
          titled: { type: "string", oneOf: [{ const: "one", title: "One" }] },
          legacy: { type: "string", enum: ["one"], enumNames: ["One"] }
        }
      }
    })

    assert.deepStrictEqual(JSON.parse(JSON.stringify(decoded.requestedSchema.properties)), {
      untitled: { type: "string", enum: ["one", "two"] },
      titled: { type: "string", oneOf: [{ const: "one", title: "One" }] },
      legacy: { type: "string", enum: ["one"], enumNames: ["One"] }
    })
  })

  it("round-trips an implementation with icons", () => {
    const implementation = { name: "server", version: "1.0.0", icons: [{ src: "https://example.com/icon.png" }] }
    assert.deepStrictEqual(
      Schema.encodeSync(McpSchema.Implementation)(Schema.decodeUnknownSync(McpSchema.Implementation)(implementation)),
      implementation
    )
  })
})
