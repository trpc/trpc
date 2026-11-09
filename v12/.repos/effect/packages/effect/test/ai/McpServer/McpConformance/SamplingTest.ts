import { assert, describe, it } from "@effect/vitest"
import type * as McpProtocol from "effect/ai/McpProtocol"
import * as McpSchema from "effect/ai/McpSchema"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { McpConformance, type McpConformanceLayer } from "./McpConformance.ts"

const SamplingRequest = Schema.Struct({
  messages: Schema.Array(Schema.Struct({
    role: Schema.String,
    content: Schema.Record(Schema.String, Schema.Unknown)
  })),
  modelPreferences: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
  systemPrompt: Schema.optionalKey(Schema.String),
  includeContext: Schema.optionalKey(Schema.String),
  maxTokens: Schema.Number,
  stopSequences: Schema.optionalKey(Schema.Array(Schema.String)),
  metadata: Schema.Unknown
})

const decodeSamplingRequest = Schema.decodeUnknownEffect(SamplingRequest)
const decodeSamplingResult = Schema.decodeUnknownEffect(Schema.Struct({
  role: Schema.String,
  content: Schema.Record(Schema.String, Schema.Unknown),
  model: Schema.String,
  stopReason: Schema.optionalKey(Schema.String)
}))

const textResponse = {
  role: "assistant",
  content: { type: "text", text: "sampled" },
  model: "test-model",
  stopReason: "endTurn"
} as const

const samplingRequest = McpSchema.CreateMessage.payloadSchema.make({
  messages: [
    McpSchema.SamplingMessage.make({
      role: "user",
      content: McpSchema.TextContent.make({ text: "sample" })
    })
  ],
  maxTokens: 64,
  metadata: {}
})

const samplingRequestWithOptions = McpSchema.CreateMessage.payloadSchema.make({
  messages: [
    McpSchema.SamplingMessage.make({
      role: "user",
      content: McpSchema.TextContent.make({ text: "first" })
    }),
    McpSchema.SamplingMessage.make({
      role: "assistant",
      content: McpSchema.TextContent.make({ text: "second" })
    })
  ],
  modelPreferences: new McpSchema.ModelPreferences({
    hints: [McpSchema.ModelHint.make({ name: "test-model" })],
    costPriority: 0.2,
    speedPriority: 0.4,
    intelligencePriority: 0.8
  }),
  systemPrompt: "System",
  includeContext: "thisServer",
  maxTokens: 64,
  stopSequences: ["STOP"],
  metadata: { request: "metadata" }
})

export const suite = (protocol: McpProtocol.ProtocolAdapter, layer: McpConformanceLayer) =>
  it.layer(layer)(`Mcp Conformance (${protocol.protocolVersion})`, (it) => {
    describe("Sampling", () => {
      // Text and image sampling are shared by all three dated specifications.
      // Audio sampling was added in 2025-03-26.
      describe("Capabilities", () => {
        it.effect("MUST send sampling requests when the client advertises sampling", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const peer = yield* test.makePeer({
              capabilities: { sampling: {} },
              handlers: {
                "sampling/createMessage": () => Effect.succeed(textResponse)
              }
            })

            yield* peer.wireClient["sampling/createMessage"](samplingRequest)

            assert.strictEqual((yield* peer.takeRequest).method, "sampling/createMessage")
          }))

        it.effect.skipIf(protocol.protocolVersion !== "2025-11-25")(
          "SHOULD reject context-enabled requests before sending without sampling.context",
          () =>
            Effect.gen(function*() {
              const test = yield* McpConformance
              const peer = yield* test.makePeer({ capabilities: { sampling: {} } })
              const request = McpSchema.CreateMessage.payloadSchema.make({
                ...samplingRequest,
                includeContext: "thisServer"
              })

              const exit = yield* Effect.exit(peer.reverseClient.createMessage(request))

              assert.strictEqual(exit._tag, "Failure")
              assert.deepStrictEqual(yield* peer.requests, [])
            })
        )

        it.effect.skipIf(protocol.protocolVersion !== "2025-11-25")(
          "MUST reject every tool-enabled request shape before sending without sampling.tools",
          () =>
            Effect.gen(function*() {
              const test = yield* McpConformance
              const requests = [
                {
                  name: "tools",
                  request: {
                    messages: [{ role: "user", content: { type: "text", text: "Weather?" } }],
                    tools: [{ name: "weather", inputSchema: { type: "object" } }],
                    maxTokens: 64
                  }
                },
                {
                  name: "toolChoice",
                  request: {
                    messages: [{ role: "user", content: { type: "text", text: "Weather?" } }],
                    toolChoice: { mode: "required" },
                    maxTokens: 64
                  }
                },
                {
                  name: "tool_use content",
                  request: {
                    messages: [{
                      role: "assistant",
                      content: { type: "tool_use", id: "call-1", name: "weather", input: { city: "Zurich" } }
                    }],
                    maxTokens: 64
                  }
                },
                {
                  name: "tool_result content",
                  request: {
                    messages: [{
                      role: "user",
                      content: {
                        type: "tool_result",
                        toolUseId: "call-1",
                        content: [{ type: "text", text: "Sunny" }]
                      }
                    }],
                    maxTokens: 64
                  }
                }
              ] as const

              for (const testCase of requests) {
                const peer = yield* test.makePeer({ capabilities: { sampling: {} } })
                const request = Schema.decodeUnknownSync(McpSchema.CreateMessage.payloadSchema)(testCase.request)
                const exit = yield* Effect.exit(peer.reverseClient.createMessage(request))

                assert.strictEqual(exit._tag, "Failure", testCase.name)
                assert.deepStrictEqual(yield* peer.requests, [], testCase.name)
              }
            }).pipe(Effect.scoped)
        )

        it.effect.skipIf(protocol.protocolVersion !== "2025-11-25")(
          "MUST allow text-only content arrays without sampling.tools",
          () =>
            Effect.gen(function*() {
              const test = yield* McpConformance
              const peer = yield* test.makePeer({
                capabilities: { sampling: {} },
                handlers: {
                  "sampling/createMessage": () =>
                    Effect.succeed({
                      role: "assistant",
                      content: [{ type: "text", text: "First" }, { type: "text", text: "Second" }],
                      model: "text-model"
                    })
                }
              })

              const result = yield* peer.reverseClient.createMessage(
                Schema.decodeUnknownSync(McpSchema.CreateMessage.payloadSchema)({
                  messages: [{
                    role: "user",
                    content: [{ type: "text", text: "First" }, { type: "text", text: "Second" }]
                  }],
                  maxTokens: 64
                })
              )

              assert.strictEqual((yield* peer.requests).length, 1)
              assert.deepStrictEqual(JSON.parse(JSON.stringify(result.content)), [
                { type: "text", text: "First" },
                { type: "text", text: "Second" }
              ])
            })
        )

        it.effect.skipIf(protocol.protocolVersion !== "2025-11-25")(
          "SCENARIO rejects unexpected tool-enabled responses when sampling.tools was not advertised",
          () =>
            Effect.gen(function*() {
              const test = yield* McpConformance
              const peer = yield* test.makePeer({
                capabilities: { sampling: {} },
                handlers: {
                  "sampling/createMessage": () =>
                    Effect.succeed({
                      role: "assistant",
                      content: { type: "tool_use", id: "call-1", name: "weather", input: {} },
                      model: "tool-model",
                      stopReason: "toolUse"
                    })
                }
              })

              const exit = yield* Effect.exit(peer.reverseClient.createMessage(samplingRequest))

              assert.strictEqual(exit._tag, "Failure")
              assert.strictEqual((yield* peer.requests).length, 1)
            })
        )
      })

      describe("Creating Messages", () => {
        it.effect("MUST preserve message order and sampling request options", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const peer = yield* test.makePeer({
              capabilities: {
                sampling: protocol.protocolVersion === "2025-11-25" ? { context: {} } : {}
              },
              handlers: {
                "sampling/createMessage": () => Effect.succeed(textResponse)
              }
            })

            yield* peer.wireClient["sampling/createMessage"](samplingRequestWithOptions)
            const recorded = yield* peer.takeRequest
            const payload = yield* decodeSamplingRequest(recorded.payload)

            assert.deepStrictEqual(
              payload.messages.map((message) => ({
                role: message.role,
                text: message.content.text
              })),
              [
                { role: "user", text: "first" },
                { role: "assistant", text: "second" }
              ]
            )
            assert.strictEqual(payload.systemPrompt, "System")
            assert.deepStrictEqual(payload.modelPreferences, {
              hints: [{ name: "test-model" }],
              costPriority: 0.2,
              speedPriority: 0.4,
              intelligencePriority: 0.8
            })
            assert.strictEqual(payload.maxTokens, 64)
            assert.deepStrictEqual(payload.stopSequences, ["STOP"])
            assert.deepStrictEqual(payload.metadata, { request: "metadata" })
            assert.strictEqual(payload.includeContext, "thisServer")
          }))

        it.effect("MUST accept and decode text sampling content", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const peer = yield* test.makePeer({
              capabilities: { sampling: {} },
              handlers: {
                "sampling/createMessage": () => Effect.succeed(textResponse)
              }
            })

            const result = yield* peer.wireClient["sampling/createMessage"](samplingRequest).pipe(
              Effect.flatMap(decodeSamplingResult)
            )

            assert.strictEqual(result.role, "assistant")
            assert.strictEqual(result.model, "test-model")
            assert.strictEqual(result.stopReason, "endTurn")
            assert.deepStrictEqual(result.content, {
              type: "text",
              text: "sampled"
            })
          }))

        it.effect("MUST accept image sampling content", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const peer = yield* test.makePeer({
              capabilities: { sampling: {} },
              handlers: {
                "sampling/createMessage": () =>
                  Effect.succeed({
                    role: "assistant",
                    content: {
                      type: "image",
                      data: "AQID",
                      mimeType: "image/png"
                    },
                    model: "vision-model"
                  })
              }
            })

            const result = yield* peer.wireClient["sampling/createMessage"](samplingRequest).pipe(
              Effect.flatMap(decodeSamplingResult)
            )

            assert.deepStrictEqual(result.content, {
              type: "image",
              data: "AQID",
              mimeType: "image/png"
            })
          }))

        it.effect.skipIf(["2024-11-05"].includes(protocol.protocolVersion))(
          "MUST accept audio sampling content",
          () =>
            Effect.gen(function*() {
              const test = yield* McpConformance
              const peer = yield* test.makePeer({
                capabilities: { sampling: {} },
                handlers: {
                  "sampling/createMessage": () =>
                    Effect.succeed({
                      role: "assistant",
                      content: {
                        type: "audio",
                        data: "BAUG",
                        mimeType: "audio/wav"
                      },
                      model: "audio-model"
                    })
                }
              })

              const result = yield* peer.wireClient["sampling/createMessage"](samplingRequest).pipe(
                Effect.flatMap(decodeSamplingResult)
              )

              assert.deepStrictEqual(result.content, {
                type: "audio",
                data: "BAUG",
                mimeType: "audio/wav"
              })
            })
        )

        it.effect("MUST surface sampling errors returned by the client", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const peer = yield* test.makePeer({
              capabilities: { sampling: {} },
              handlers: {
                "sampling/createMessage": () =>
                  Effect.fail(
                    new McpSchema.InternalError({
                      message: "Sampling failed"
                    })
                  )
              }
            })

            const error = yield* peer.wireClient["sampling/createMessage"](samplingRequest).pipe(Effect.flip)

            assert.isTrue("code" in error)
            if ("code" in error) assert.strictEqual(error.code, McpSchema.INTERNAL_ERROR_CODE)
            assert.strictEqual(error.message, "Sampling failed")
          }))

        it.effect.skipIf(protocol.protocolVersion !== "2025-11-25")(
          "MUST round-trip tool-enabled sampling requests and results",
          () =>
            Effect.gen(function*() {
              const test = yield* McpConformance
              const response = {
                role: "assistant",
                content: [{
                  type: "tool_use",
                  id: "call-2",
                  name: "weather",
                  input: { city: "Geneva" }
                }],
                model: "tool-model",
                stopReason: "toolUse"
              } as const
              const peer = yield* test.makePeer({
                capabilities: { sampling: { tools: {} } },
                handlers: { "sampling/createMessage": () => Effect.succeed(response) }
              })
              const request = McpSchema.CreateMessage.payloadSchema.make({
                messages: [
                  McpSchema.SamplingMessage.make({
                    role: "assistant",
                    content: McpSchema.ToolUseContent.make({
                      id: "call-1",
                      name: "weather",
                      input: { city: "Zurich" }
                    })
                  }),
                  McpSchema.SamplingMessage.make({
                    role: "user",
                    content: McpSchema.ToolResultContent.make({
                      toolUseId: "call-1",
                      content: [McpSchema.TextContent.make({ text: "Sunny" })],
                      structuredContent: { temperature: 24 }
                    })
                  })
                ],
                tools: [{
                  name: "weather",
                  description: "Get weather",
                  inputSchema: {
                    type: "object",
                    properties: { city: { type: "string" } },
                    required: ["city"]
                  }
                }],
                toolChoice: new McpSchema.ToolChoice({ mode: "required" }),
                maxTokens: 64
              })

              const result = yield* peer.reverseClient.createMessage(request)
              const recorded = yield* peer.takeRequest

              assert.strictEqual(recorded.method, "sampling/createMessage")
              assert.deepStrictEqual(recorded.payload, {
                messages: [
                  {
                    role: "assistant",
                    content: { type: "tool_use", id: "call-1", name: "weather", input: { city: "Zurich" } }
                  },
                  {
                    role: "user",
                    content: {
                      type: "tool_result",
                      toolUseId: "call-1",
                      content: [{ type: "text", text: "Sunny" }],
                      structuredContent: { temperature: 24 }
                    }
                  }
                ],
                tools: [{
                  name: "weather",
                  description: "Get weather",
                  inputSchema: {
                    type: "object",
                    properties: { city: { type: "string" } },
                    required: ["city"]
                  }
                }],
                toolChoice: { mode: "required" },
                maxTokens: 64
              })
              assert.deepStrictEqual(JSON.parse(JSON.stringify(result)), response)
            })
        )
      })
    })
  })
