import { assert, describe, it } from "@effect/vitest"
import type * as McpProtocol from "effect/ai/McpProtocol"
import * as McpSchema from "effect/ai/McpSchema"
import * as McpServer from "effect/ai/McpServer"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { makeHttpHarness } from "../TestUtils/McpHttpHarness.ts"
import { readMcpHttpResponse } from "../TestUtils/McpHttpResponse.ts"
import { makeServerLayer } from "../TestUtils/McpServerLayer.ts"
import { McpConformance, type McpConformanceLayer } from "./McpConformance.ts"
import { MrtrPromptName, mrtrRequestState, MrtrStateOnlyToolName, MrtrToolName } from "./McpConformanceFixtures.ts"

const decodeInputRequired = Schema.decodeUnknownEffect(Schema.Struct({
  resultType: Schema.Literal("input_required"),
  inputRequests: Schema.Record(Schema.String, Schema.Unknown),
  requestState: Schema.String
}))

const decodeComplete = Schema.decodeUnknownEffect(Schema.Struct({
  resultType: Schema.Literal("complete"),
  content: Schema.Array(Schema.Struct({
    type: Schema.Literal("text"),
    text: Schema.String
  }))
}))

const inputResponses = {
  approval: { action: "accept", content: { approved: true } },
  sample: {
    role: "assistant",
    content: { type: "text", text: "Suggested title", _meta: {} },
    model: "fixture-model",
    _meta: {}
  },
  roots: { roots: [{ uri: "file:///workspace" }] }
} as const

export const suite = (protocol: McpProtocol.ProtocolAdapter, layer: McpConformanceLayer) =>
  it.layer(layer)(`Mcp Conformance (${protocol.protocolVersion})`, (it) => {
    // SEP-2322: https://modelcontextprotocol.io/seps/2322-MRTR
    // https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/mrtr
    describe("Multi round-trip requests", () => {
      // Follow the sampling SHOULD NOT recommendation by rejecting context requests without client support.
      // https://modelcontextprotocol.io/specification/2026-07-28/client/sampling#capabilities
      it.effect("should require context capability when sampling requests include server context", () =>
        Effect.gen(function*() {
          for (const includeContext of ["thisServer", "allServers"] as const) {
            const sample = {
              method: "sampling/createMessage",
              params: {
                messages: [{ role: "user", content: { type: "text", text: "Summarize context" } }],
                includeContext,
                maxTokens: 20
              }
            } as const
            const registration = Layer.effectDiscard(McpServer.McpServer.use((server) =>
              server.addTool({
                tool: new McpSchema.Tool({ name: "Context", inputSchema: { type: "object" } }),
                annotations: Context.empty(),
                handle: () => Effect.succeed(new McpSchema.InputRequired({ inputRequests: { sample } }))
              })
            ))
            const harness = yield* makeHttpHarness(registration.pipe(Layer.provideMerge(
              makeServerLayer({ name: "SamplingContext", protocols: [protocol] })
            )))
            for (const supported of [false, true]) {
              const response = yield* harness.post({
                jsonrpc: "2.0",
                id: supported ? "supported" : "unsupported",
                method: "tools/call",
                params: {
                  name: "Context",
                  arguments: {},
                  _meta: {
                    "io.modelcontextprotocol/protocolVersion": protocol.protocolVersion,
                    "io.modelcontextprotocol/clientCapabilities": { sampling: supported ? { context: {} } : {} }
                  }
                }
              }, {
                "Mcp-Protocol-Version": protocol.protocolVersion,
                "Mcp-Method": "tools/call",
                "Mcp-Name": "Context"
              })
              const message = yield* readMcpHttpResponse(response)
              if (supported) {
                assert.strictEqual(response.status, 200)
                const result = Schema.decodeUnknownSync(Schema.Struct({
                  result: Schema.Struct({ resultType: Schema.String, inputRequests: Schema.JsonObject })
                }))(message).result
                assert.strictEqual(result.resultType, "input_required")
                assert.deepStrictEqual(result.inputRequests, { sample })
              } else {
                assert.strictEqual(response.status, 400)
                const error = Schema.decodeUnknownSync(Schema.Struct({
                  error: Schema.Struct({ code: Schema.Number, data: Schema.JsonObject })
                }))(message).error
                assert.strictEqual(error.code, -32021)
                assert.deepStrictEqual(error.data, { requiredCapabilities: { sampling: { context: {} } } })
              }
            }
          }
        }))

      // Conformance: input-required-result-non-tool-request
      it.effect("should return input_required and then complete when prompts/get is retried with client input", () =>
        Effect.gen(function*() {
          const test = yield* McpConformance
          const initialized = yield* test.initialize({ server: "features" })
          const firstResponse = yield* test.send(initialized, {
            jsonrpc: "2.0",
            id: 30,
            method: "prompts/get",
            params: { name: MrtrPromptName, arguments: {} }
          })
          const first = yield* test.decodeResult(firstResponse).pipe(
            Effect.flatMap((message) =>
              Schema.decodeUnknownEffect(Schema.Struct({
                resultType: Schema.Literal("input_required"),
                inputRequests: Schema.Record(Schema.String, Schema.Unknown)
              }))(message.result)
            )
          )
          assert.deepStrictEqual(first.inputRequests.userContext, {
            method: "elicitation/create",
            params: {
              message: "What context should the prompt use?",
              requestedSchema: {
                type: "object",
                properties: { context: { type: "string" } },
                required: ["context"]
              }
            }
          })

          const completedResponse = yield* test.send(initialized, {
            jsonrpc: "2.0",
            id: 31,
            method: "prompts/get",
            params: {
              name: MrtrPromptName,
              arguments: {},
              inputResponses: {
                userContext: { action: "accept", content: { context: "test context" } }
              }
            }
          })
          const completed = yield* test.decodeResult(completedResponse).pipe(
            Effect.flatMap((message) =>
              Schema.decodeUnknownEffect(Schema.Struct({
                resultType: Schema.Literal("complete"),
                messages: Schema.Array(Schema.Struct({
                  role: Schema.Literal("user"),
                  content: Schema.Struct({
                    type: Schema.Literal("text"),
                    text: Schema.String
                  })
                }))
              }))(message.result)
            )
          )
          assert.deepStrictEqual(completed.messages, [{
            role: "user",
            content: { type: "text", text: "Prompt completed" }
          }])
        }))

      // https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/mrtr#server-requirements-basic-workflow
      it.effect("should reject prompt input requests when the client omits their required capabilities", () =>
        Effect.gen(function*() {
          const test = yield* McpConformance
          const initialized = yield* test.initialize({ server: "features" })
          const response = yield* test.send(initialized, {
            jsonrpc: "2.0",
            id: 32,
            method: "prompts/get",
            params: { name: MrtrPromptName, arguments: {} }
          }, { clientCapabilities: {} })
          const error = yield* test.decodeError(response)

          assert.strictEqual(response.status, 400)
          assert.strictEqual(error.error.code, -32021)
          assert.deepStrictEqual(error.error.data, {
            requiredCapabilities: { elicitation: { form: {} } }
          })
        }))

      // Elicitation choices must survive the input-required result sent to the client.
      // https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation#requested-schema
      it.effect("should return supported keyed input requests and resume when matching responses are supplied", () =>
        Effect.gen(function*() {
          const test = yield* McpConformance
          const initialized = yield* test.initialize({ server: "features" })
          const firstResponse = yield* test.send(initialized, {
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: MrtrToolName, arguments: {} }
          })
          const first = yield* test.decodeResult(firstResponse).pipe(
            Effect.flatMap((message) => decodeInputRequired(message.result))
          )

          assert.strictEqual(first.requestState, mrtrRequestState)
          assert.deepStrictEqual(first.inputRequests, {
            approval: {
              method: "elicitation/create",
              params: {
                message: "Approve the operation",
                requestedSchema: {
                  type: "object",
                  properties: {
                    approved: { type: "boolean" },
                    color: { type: "string", enum: ["red", "blue"] },
                    titled: {
                      type: "string",
                      oneOf: [{ const: "red", title: "Red" }, { const: "blue", title: "Blue" }]
                    },
                    legacy: { type: "string", enum: ["red", "blue"], enumNames: ["Red", "Blue"] }
                  },
                  required: ["approved"]
                }
              }
            },
            sample: {
              method: "sampling/createMessage",
              params: {
                messages: [{ role: "user", content: { type: "text", text: "Suggest a title" } }],
                maxTokens: 20
              }
            },
            roots: {
              method: "roots/list"
            }
          })

          const completedResponse = yield* test.send(initialized, {
            jsonrpc: "2.0",
            id: 3,
            method: "tools/call",
            params: {
              name: MrtrToolName,
              arguments: {},
              inputResponses,
              requestState: first.requestState
            }
          })
          const completed = yield* test.decodeResult(completedResponse).pipe(
            Effect.flatMap((message) => decodeComplete(message.result))
          )

          const content = completed.content[0]
          assert.isDefined(content)
          assert.deepStrictEqual(JSON.parse(content.text), {
            approval: { approved: true },
            sample: {
              role: "assistant",
              content: { type: "text", text: "Suggested title", _meta: {} },
              model: "fixture-model",
              _meta: {}
            },
            roots: { roots: [{ uri: "file:///workspace" }] }
          })
        }))

      it.effect("should return a retry state without requesting client input", () =>
        Effect.gen(function*() {
          const test = yield* McpConformance
          const initialized = yield* test.initialize({ server: "features" })
          const response = yield* test.send(initialized, {
            jsonrpc: "2.0",
            id: 2,
            method: "tools/call",
            params: { name: MrtrStateOnlyToolName, arguments: {} }
          })
          const result = yield* test.decodeResult(response).pipe(
            Effect.flatMap((message) =>
              Schema.decodeUnknownEffect(Schema.Struct({
                resultType: Schema.Literal("input_required"),
                inputRequests: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
                requestState: Schema.String
              }))(message.result)
            )
          )

          assert.strictEqual(result.requestState, mrtrRequestState)
          assert.isUndefined(result.inputRequests)
        }))

      it.effect("should remain input-required when continuation keys or request state do not match", () =>
        Effect.gen(function*() {
          const test = yield* McpConformance
          const initialized = yield* test.initialize({ server: "features" })
          const cases = [
            {
              inputResponses: { other: { action: "accept", content: { approved: true } } },
              requestState: mrtrRequestState
            },
            {
              inputResponses,
              requestState: `${mrtrRequestState}:mismatch`
            }
          ] as const

          for (const [index, continuation] of cases.entries()) {
            const response = yield* test.send(initialized, {
              jsonrpc: "2.0",
              id: index + 10,
              method: "tools/call",
              params: {
                name: MrtrToolName,
                arguments: {},
                ...continuation
              }
            })
            const result = yield* test.decodeResult(response).pipe(
              Effect.flatMap((message) => decodeInputRequired(message.result))
            )
            assert.strictEqual(result.requestState, mrtrRequestState)
          }
        }))

      // https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/mrtr#server-requirements-validation-and-security
      it.effect("should reject a continuation when its input responses or request state are malformed", () =>
        Effect.gen(function*() {
          const test = yield* McpConformance
          const initialized = yield* test.initialize({ server: "features" })
          const cases = [
            { inputResponses: { approval: "accepted" }, requestState: mrtrRequestState },
            { inputResponses, requestState: 42 }
          ] as const

          for (const [index, continuation] of cases.entries()) {
            const response = yield* test.send(initialized, {
              jsonrpc: "2.0",
              id: index + 20,
              method: "tools/call",
              params: {
                name: MrtrToolName,
                arguments: {},
                ...continuation
              }
            })
            const error = yield* test.decodeError(response)
            assert.strictEqual(error.error.code, -32602)
          }
        }))
    })
  })
