import { assert, describe, it } from "@effect/vitest"
import { Schema } from "effect"
import * as McpSchema from "effect/ai/McpSchema"

describe("McpSchema", () => {
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
