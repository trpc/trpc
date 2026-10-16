import { assert, describe, it } from "@effect/vitest"
import { assertTrue } from "@effect/vitest/utils"
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
import { makeMcpStdioHarness } from "../TestUtils/McpStdioHarness.ts"
import { McpConformance, type McpConformanceLayer } from "./McpConformance.ts"

const decodeTools = Schema.decodeUnknownEffect(McpSchema.ListToolsResult)
const decodeCallTool = Schema.decodeUnknownEffect(McpSchema.CallToolResult)
const decodeJsonSchema2020Tools = Schema.decodeUnknownEffect(Schema.Struct({
  tools: Schema.Array(Schema.Struct({
    name: Schema.String,
    inputSchema: Schema.JsonObject,
    outputSchema: Schema.optional(Schema.JsonObject)
  }))
}))

const callTool = (name: string, arguments_: Record<string, unknown> = {}) =>
  Effect.gen(function*() {
    const test = yield* McpConformance
    const initialized = yield* test.initialize({ server: "features" })
    yield* test.notifyInitialized(initialized)
    const response = yield* test.send(initialized, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name, arguments: arguments_ }
    })
    return yield* test.decodeResult(response).pipe(
      Effect.flatMap((message) => decodeCallTool(message.result))
    )
  })

const callToolWire = (name: string) =>
  Effect.gen(function*() {
    const test = yield* McpConformance
    const initialized = yield* test.initialize({ server: "features" })
    yield* test.notifyInitialized(initialized)
    const response = yield* test.send(initialized, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name, arguments: {} }
    })
    return yield* test.decodeResult(response)
  })

// String results are mirrored as serialized JSON only where they are also returned as structured content.
const stringResultContent = (protocol: McpProtocol.ProtocolAdapter, text: string) => [{
  type: "text" as const,
  text: protocol.protocolVersion === "2026-07-28" ? JSON.stringify(text) : text
}]

export const suite = (protocol: McpProtocol.ProtocolAdapter, layer: McpConformanceLayer) =>
  it.layer(layer)(`Mcp Conformance (${protocol.protocolVersion})`, (it) => {
    describe("Tools", () => {
      // Shared capability contract; each dated entrypoint owns its normative specification revision.
      describe("Capabilities", () => {
        it.effect("MUST advertise the tools capability when tools are registered", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const initialized = yield* test.initialize({ server: "features" })

            assert.property(initialized.message.result.capabilities, "tools")
          }))

        it.effect("MUST NOT advertise the tools capability when tools are not supported", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const initialized = yield* test.initialize()

            assert.notProperty(initialized.message.result.capabilities, "tools")
          }))
      })

      describe("Listing Tools", () => {
        it.effect(
          "SCHEMA preserves tool names and descriptions",
          () =>
            Effect.gen(function*() {
              const test = yield* McpConformance
              const initialized = yield* test.initialize({ server: "features" })
              yield* test.notifyInitialized(initialized)
              const response = yield* test.send(initialized, {
                jsonrpc: "2.0",
                id: 2,
                method: "tools/list",
                params: {}
              })
              const result = yield* test.decodeResult(response).pipe(
                Effect.flatMap((message) => decodeTools(message.result))
              )

              const tool = result.tools.find((tool) => tool.name === "TestTool")
              assert.isDefined(tool)
              assert.strictEqual(tool.description, "A test tool")
            })
        )

        it.effect(
          "MUST return each tool input schema",
          () =>
            Effect.gen(function*() {
              const test = yield* McpConformance
              const initialized = yield* test.initialize({ server: "features" })
              yield* test.notifyInitialized(initialized)
              const response = yield* test.send(initialized, {
                jsonrpc: "2.0",
                id: 2,
                method: "tools/list",
                params: {}
              })
              const result = yield* test.decodeResult(response).pipe(
                Effect.flatMap((message) => decodeTools(message.result))
              )

              assert.isTrue(result.tools.every((tool) => tool.inputSchema.type === "object"))
            })
        )

        it.effect("should list shared tools and gate modern-only tools by era", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const initialized = yield* test.initialize({ server: "features" })
            yield* test.notifyInitialized(initialized)
            const response = yield* test.send(initialized, {
              jsonrpc: "2.0",
              id: 2,
              method: "tools/list",
              params: {}
            })
            const result = yield* test.decodeResult(response).pipe(
              Effect.flatMap((message) => decodeTools(message.result))
            )
            const names = new Set(result.tools.map((tool) => tool.name))
            for (const name of ["TestTool", "StructuredTool", "LogLevelTool", "RequestMetadataTool"]) {
              assert.isTrue(names.has(name))
            }
            for (const name of ["JsonSchema2020Tool", "MrtrTool"]) {
              assert.strictEqual(names.has(name), protocol.runtime._tag === "Stateless")
            }
          }))
      })

      describe("Calling Tools", () => {
        it.effect("MUST call a registered tool with valid arguments", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const initialized = yield* test.initialize({ server: "features" })
            yield* test.notifyInitialized(initialized)
            const response = yield* test.send(initialized, {
              jsonrpc: "2.0",
              id: 2,
              method: "tools/call",
              params: {
                name: "TestTool",
                arguments: { value: "called" }
              }
            })
            const result = yield* test.decodeResult(response).pipe(
              Effect.flatMap((message) => decodeCallTool(message.result))
            )

            assert.strictEqual(result.isError, false)
            assert.deepStrictEqual(result.content, stringResultContent(protocol, "called"))
          }))

        it.effect("MUST reject an unknown tool name with a protocol error", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const before = (yield* test.observations).toolInvocations
            const initialized = yield* test.initialize({ server: "features" })
            yield* test.notifyInitialized(initialized)
            const response = yield* test.send(initialized, {
              jsonrpc: "2.0",
              id: 2,
              method: "tools/call",
              params: {
                name: "UnknownTool",
                arguments: {}
              }
            })
            const error = yield* test.decodeError(response)

            assert.strictEqual(error.error.code, McpSchema.INVALID_PARAMS_ERROR_CODE)
            assert.strictEqual((yield* test.observations).toolInvocations, before)
          }))

        it.effect("SCHEMA returns text content", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const initialized = yield* test.initialize({ server: "features" })
            yield* test.notifyInitialized(initialized)
            const response = yield* test.send(initialized, {
              jsonrpc: "2.0",
              id: 2,
              method: "tools/call",
              params: {
                name: "TestTool",
                arguments: { value: "text" }
              }
            })
            const result = yield* test.decodeResult(response).pipe(
              Effect.flatMap((message) => decodeCallTool(message.result))
            )

            assert.deepStrictEqual(result.content, stringResultContent(protocol, "text"))
          }))
        it.effect("SCHEMA returns image content", () =>
          Effect.gen(function*() {
            const result = yield* callToolWire("ImageTool")
            assert.deepStrictEqual(result.result.content, [{
              type: "image",
              data: "AQID",
              mimeType: "image/png"
            }])
          }))
        it.effect("SCHEMA returns embedded resources", () =>
          Effect.gen(function*() {
            const result = yield* callTool("EmbeddedResourceTool")
            assert.deepStrictEqual(result.content, [{
              type: "resource",
              resource: {
                uri: "file:///embedded",
                mimeType: "text/plain",
                text: "embedded"
              }
            }])
          }))
        it.effect("MUST return multiple content items in order", () =>
          Effect.gen(function*() {
            const result = yield* callTool("MultipleContentTool")
            assert.deepStrictEqual(result.content, [
              { type: "text", text: "first" },
              { type: "text", text: "second" }
            ])
          }))
        it.effect("MUST return tool execution failures with isError", () =>
          Effect.gen(function*() {
            const result = yield* callTool("ErrorTool")
            assert.strictEqual(result.isError, true)
            assert.deepStrictEqual(result.content, [{ type: "text", text: "expected failure" }])
          }))
        it.effect("MUST keep tool execution errors distinct from protocol errors", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const initialized = yield* test.initialize({ server: "features" })
            yield* test.notifyInitialized(initialized)

            const execution = yield* callTool("ErrorTool")
            const protocolResponse = yield* test.send(initialized, {
              jsonrpc: "2.0",
              id: 3,
              method: "tools/call",
              params: { name: "UnknownTool", arguments: {} }
            })
            const protocol = yield* test.decodeError(protocolResponse)

            assert.strictEqual(execution.isError, true)
            assert.strictEqual(protocol.error.code, McpSchema.INVALID_PARAMS_ERROR_CODE)
          }))

        it.effect("SHOULD not expose defects or internal error details", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const initialized = yield* test.initialize({ server: "features" })
            yield* test.notifyInitialized(initialized)
            const response = yield* test.send(initialized, {
              jsonrpc: "2.0",
              id: 2,
              method: "tools/call",
              params: { name: "DefectTool", arguments: {} }
            })
            const result = yield* test.decodeError(response)

            assert.strictEqual(result.error.code, McpSchema.INTERNAL_ERROR_CODE)
            assert.strictEqual(result.error.message, "Internal error")
            assert.notMatch(JSON.stringify(result), /private defect details/)
          }))

        it.effect.skipIf(protocol.protocolVersion === "2024-11-05")(
          "should return base64 audio content when an audio tool is called",
          () =>
            Effect.gen(function*() {
              const result = yield* callToolWire("AudioTool")
              assert.deepStrictEqual(result.result.content, [{
                type: "audio",
                data: "BAUG",
                mimeType: "audio/wav"
              }])
            })
        )

        describe.skipIf(["2024-11-05", "2025-03-26"].includes(protocol.protocolVersion))(
          "Structured content",
          () => {
            it.effect("should advertise an object output schema when a tool declares one", () =>
              Effect.gen(function*() {
                const test = yield* McpConformance
                const initialized = yield* test.initialize({ server: "features" })
                yield* test.notifyInitialized(initialized)
                const response = yield* test.send(initialized, {
                  jsonrpc: "2.0",
                  id: 2,
                  method: "tools/list",
                  params: {}
                })
                const result = yield* test.decodeResult(response).pipe(
                  Effect.flatMap((message) => decodeTools(message.result))
                )

                assert.strictEqual(
                  result.tools.find((tool) => tool.name === "StructuredTool")?.outputSchema?.type,
                  "object"
                )
              }))

            it.effect("should return a resource link when a resource-link tool is called", () =>
              Effect.gen(function*() {
                const result = yield* callTool("ResourceLinkTool")
                assert.deepStrictEqual(result.content, [{
                  type: "resource_link",
                  uri: "file:///test",
                  name: "TestResource",
                  mimeType: "text/plain"
                }])
              }))

            it.effect("should return structured content when a structured tool is called", () =>
              Effect.gen(function*() {
                const result = yield* callTool("StructuredTool")
                assert.deepStrictEqual(result.structuredContent, { value: "structured" })
              }))
          }
        )

        it.effect("distinguishes malformed requests from tool validation errors by protocol revision", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const initialized = yield* test.initialize({ server: "features" })
            yield* test.notifyInitialized(initialized)
            const before = (yield* test.observations).toolInvocations
            const request = (arguments_: unknown) =>
              test.send(initialized, {
                jsonrpc: "2.0",
                id: 2,
                method: "tools/call",
                params: { name: "TestTool", arguments: arguments_ }
              })
            const malformed = yield* request("invalid").pipe(Effect.flatMap(test.decodeError))
            assert.strictEqual(malformed.error.code, McpSchema.INVALID_PARAMS_ERROR_CODE)

            const response = yield* request({ value: 123 })
            let text: string
            if (["2024-11-05", "2025-03-26", "2025-06-18"].includes(protocol.protocolVersion)) {
              const error = yield* test.decodeError(response)
              assert.strictEqual(error.error.code, McpSchema.INVALID_PARAMS_ERROR_CODE)
              text = error.error.message
            } else {
              const result = yield* test.decodeResult(response).pipe(
                Effect.flatMap((message) => decodeCallTool(message.result))
              )
              assert.isTrue(result.isError)
              assert.isUndefined(result.structuredContent)
              assert.lengthOf(result.content, 1)
              const content = result.content[0]
              assertTrue(content.type === "text")
              text = content.text
            }
            assert.include(text, "Invalid parameters for tool 'TestTool'")
            assert.include(text, "Expected string")
            assert.notMatch(text, /AiError|ToolParameterValidationError|Toolkit|TestTool\.handle/)
            assert.strictEqual((yield* test.observations).toolInvocations, before)
          }))
      })
    })
  })

export const statelessModernSuite = (
  protocol: McpProtocol.ProtocolAdapter,
  layer: McpConformanceLayer
) =>
  it.layer(layer)(`Mcp Conformance (${protocol.protocolVersion})`, (it) => {
    describe("Tools > JSON Schema 2020-12", () => {
      // SEP-2106: https://modelcontextprotocol.io/seps/2106-json-schema-2020-12
      // https://modelcontextprotocol.io/specification/2026-07-28/server/tools#tool
      it.effect("should preserve 2020-12 keywords when listing an input schema", () =>
        Effect.gen(function*() {
          const test = yield* McpConformance
          const initialized = yield* test.initialize({ server: "features" })
          const response = yield* test.send(initialized, {
            jsonrpc: "2.0",
            id: 1,
            method: "tools/list",
            params: {}
          })
          const result = yield* test.decodeResult(response).pipe(
            Effect.flatMap((message) => decodeJsonSchema2020Tools(message.result))
          )
          const tool = result.tools.find((tool) => tool.name === "JsonSchema2020Tool")

          assert.isDefined(tool)
          assert.deepStrictEqual(tool.inputSchema, {
            $schema: "https://json-schema.org/draft/2020-12/schema",
            type: "object",
            $defs: { identifier: { type: "string" } },
            properties: { value: { $ref: "#/$defs/identifier" } },
            allOf: [{ required: ["value"] }],
            unevaluatedProperties: false
          })
        }))

      // https://modelcontextprotocol.io/specification/2026-07-28/server/tools#output-schema
      it.effect("should list a non-object output schema when the tool declares one", () =>
        Effect.gen(function*() {
          const test = yield* McpConformance
          const initialized = yield* test.initialize({ server: "features" })
          const response = yield* test.send(initialized, {
            jsonrpc: "2.0",
            id: 1,
            method: "tools/list",
            params: {}
          })
          const result = yield* test.decodeResult(response).pipe(
            Effect.flatMap((message) => decodeJsonSchema2020Tools(message.result))
          )
          const tool = result.tools.find((tool) => tool.name === "TestTool")

          assert.isDefined(tool)
          assert.deepStrictEqual(tool.outputSchema, { type: "string" })
        }))

      // https://modelcontextprotocol.io/specification/2026-07-28/server/tools#structured-content
      it.effect("should return primitive structured content when declared by the tool", () =>
        Effect.gen(function*() {
          const result = yield* callTool("TestTool", { value: "called" })

          assert.strictEqual(result.structuredContent, "called")
        }))
    })

    describe("Tools > Modern request headers", () => {
      // SEP-2243: https://modelcontextprotocol.io/seps/2243-http-standardization
      // The final 2026-07-28 specification assigns the HeaderMismatch error code.
      // https://modelcontextprotocol.io/specification/2026-07-28/basic/transports#request-metadata
      it.effect("should reject a tools/call request when its required routing name is missing", () =>
        Effect.gen(function*() {
          const test = yield* McpConformance
          const initialized = yield* test.initialize({ server: "features" })
          const before = (yield* test.observations).toolInvocations
          const response = yield* test.send(initialized, {
            jsonrpc: "2.0",
            id: 2,
            method: "tools/call",
            params: { arguments: { value: "called" } }
          })
          const error = yield* test.decodeError(response)

          assert.strictEqual(error.error.code, McpSchema.HEADER_MISMATCH_ERROR_CODE)
          assert.strictEqual((yield* test.observations).toolInvocations, before)
        }))

      it.effect("should reject a tool call when a required parameter header is missing", () =>
        Effect.gen(function*() {
          const test = yield* McpConformance
          const initialized = yield* test.initialize({ server: "features" })
          const before = (yield* test.observations).toolInvocations
          const response = yield* test.send(initialized, {
            jsonrpc: "2.0",
            id: "missing-parameter-header",
            method: "tools/call",
            params: {
              name: "HeaderTool",
              arguments: { region: "eu-central-1" }
            }
          })

          assert.strictEqual(response.status, 400)
          const error = yield* test.decodeError(response)
          assert.strictEqual(error.id, "missing-parameter-header")
          assert.strictEqual(error.error.code, McpSchema.HEADER_MISMATCH_ERROR_CODE)
          assert.strictEqual((yield* test.observations).toolInvocations, before)
        }))

      // Header extraction uses the exact JSON property path; absent parameters do not require headers.
      // https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#server-behavior-for-custom-headers
      it.effect("should accept omitted routing headers when optional parameters have prototype property names", () =>
        Effect.gen(function*() {
          const registration = Layer.effectDiscard(McpServer.McpServer.use((server) =>
            server.addTool({
              tool: new McpSchema.Tool({
                name: "OptionalRouting",
                inputSchema: {
                  type: "object",
                  properties: {
                    toString: { type: "string", "x-mcp-header": "Route" },
                    nested: {
                      type: "object",
                      properties: { constructor: { type: "string", "x-mcp-header": "Nested-Route" } }
                    }
                  }
                }
              }),
              annotations: Context.empty(),
              handle: () =>
                Effect.succeed(
                  new McpSchema.CallToolResult({
                    content: [{ type: "text", text: "called" }]
                  })
                )
            })
          ))
          const harness = yield* makeHttpHarness(registration.pipe(Layer.provideMerge(
            makeServerLayer({ name: "OptionalRouting", protocols: [protocol] })
          )))
          for (const args of [{}, { nested: {} }]) {
            const response = yield* harness.post({
              jsonrpc: "2.0",
              id: "optional-routing",
              method: "tools/call",
              params: {
                name: "OptionalRouting",
                arguments: args,
                _meta: {
                  "io.modelcontextprotocol/protocolVersion": protocol.protocolVersion,
                  "io.modelcontextprotocol/clientCapabilities": {}
                }
              }
            }, {
              "Mcp-Protocol-Version": protocol.protocolVersion,
              "Mcp-Method": "tools/call",
              "Mcp-Name": "OptionalRouting"
            })
            assert.strictEqual(response.status, 200)
            const message = Schema.decodeUnknownSync(Schema.Struct({ result: McpSchema.CallToolResult }))(
              yield* readMcpHttpResponse(response)
            )
            assert.deepStrictEqual(message.result.content, [{ type: "text", text: "called" }])
          }
        }))

      // Plain values permit interior HTAB; non-ASCII and other control characters require Base64 encoding.
      // Decoding must preserve the complete string, including a leading U+FEFF, before comparing it with the body.
      // https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#value-encoding
      // https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#server-validation
      it.effect("should validate parameter headers when values use plain or Base64 encoding", () =>
        Effect.gen(function*() {
          const test = yield* McpConformance
          const initialized = yield* test.initialize({ server: "features" })
          const cases = [
            {
              id: "integer-missing",
              arguments: { region: "eu-central-1", shard: 42 },
              headers: { "Mcp-Param-Region": "eu-central-1" },
              status: 400
            },
            {
              id: "integer-mismatch",
              arguments: { region: "eu-central-1", shard: 42 },
              headers: { "Mcp-Param-Region": "eu-central-1", "Mcp-Param-Shard": "7" },
              status: 400
            },
            {
              id: "boolean-mismatch",
              arguments: { region: "eu-central-1", dryRun: true },
              headers: { "Mcp-Param-Region": "eu-central-1", "Mcp-Param-Dry-Run": "false" },
              status: 400
            },
            {
              id: "encoded-string",
              arguments: { region: "Hello, 世界" },
              headers: { "Mcp-Param-Region": "=?base64?SGVsbG8sIOS4lueVjA==?=" },
              status: 200
            },
            {
              id: "encoded-invalid-utf8",
              arguments: { region: "\uFFFD" },
              headers: { "Mcp-Param-Region": "=?base64?/w==?=" },
              status: 400
            },
            {
              id: "encoded-replacement-character",
              arguments: { region: "\uFFFD" },
              headers: { "Mcp-Param-Region": "=?base64?77+9?=" },
              status: 200
            },
            {
              id: "encoded-leading-bom",
              arguments: { region: "\uFEFFeu-west" },
              headers: { "Mcp-Param-Region": "=?base64?77u/ZXUtd2VzdA==?=" },
              status: 200
            },
            {
              id: "encoded-leading-bom-mismatch",
              arguments: { region: "eu-west" },
              headers: { "Mcp-Param-Region": "=?base64?77u/ZXUtd2VzdA==?=" },
              status: 400
            },
            {
              id: "encoded-tab",
              arguments: { region: "eu\twest" },
              headers: { "Mcp-Param-Region": "=?base64?ZXUJd2VzdA==?=" },
              status: 200
            },
            {
              id: "plain-tab",
              arguments: { region: "eu\twest" },
              headers: { "Mcp-Param-Region": "eu\twest" },
              status: 200
            },
            {
              id: "plain-control-character",
              arguments: { region: "eu\u000bwest" },
              headers: { "Mcp-Param-Region": "eu\u000bwest" },
              status: 400
            }
          ] as const

          for (const testCase of cases) {
            yield* test.resetObservations
            const response = yield* test.send(initialized, {
              jsonrpc: "2.0",
              id: testCase.id,
              method: "tools/call",
              params: {
                name: "HeaderTool",
                arguments: testCase.arguments
              }
            }, { headers: testCase.headers })

            assert.strictEqual(response.status, testCase.status, testCase.id)
            assert.strictEqual((yield* test.observations).toolInvocations, testCase.status === 400 ? 0 : 1, testCase.id)
            if (testCase.status === 400) {
              const error = yield* test.decodeError(response)
              assert.strictEqual(error.error.code, McpSchema.HEADER_MISMATCH_ERROR_CODE)
            } else {
              yield* test.decodeResult(response)
            }
          }
        }))
    })

    describe("Tools > Modern listing", () => {
      // https://modelcontextprotocol.io/specification/2026-07-28/server/tools#listing-tools
      it.effect("should return tools in the same order when the registered inventory has not changed", () =>
        Effect.gen(function*() {
          const test = yield* McpConformance
          const initialized = yield* test.initialize({ server: "features" })
          const list = Effect.fnUntraced(function*() {
            const response = yield* test.send(initialized, {
              jsonrpc: "2.0",
              id: 20,
              method: "tools/list",
              params: {}
            })
            const result = yield* test.decodeResult(response).pipe(
              Effect.flatMap((message) => decodeTools(message.result))
            )
            return result.tools.map((tool) => tool.name)
          })

          assert.deepStrictEqual(yield* list(), yield* list())
        }))
    })
  })

export const statefulLegacySuite = (protocol: McpProtocol.ProtocolAdapter, layer: McpConformanceLayer) =>
  it.layer(layer)(`Mcp Conformance (${protocol.protocolVersion})`, (it) => {
    describe("Tools > Legacy validation", () => {
      it.effect("should reject malformed tool parameters without invoking a handler", () =>
        Effect.gen(function*() {
          const test = yield* McpConformance
          const initialized = yield* test.initialize({ server: "features" })
          yield* test.notifyInitialized(initialized)
          const before = (yield* test.observations).toolInvocations
          const response = yield* test.send(initialized, {
            jsonrpc: "2.0",
            id: 2,
            method: "tools/call",
            params: { arguments: { value: "called" } }
          })
          const error = yield* test.decodeError(response)

          assert.strictEqual(error.error.code, McpSchema.INVALID_PARAMS_ERROR_CODE)
          assert.strictEqual((yield* test.observations).toolInvocations, before)
        }))
    })

    // https://modelcontextprotocol.io/specification/2025-11-25/server/tools
    describe("Tools > Legacy notifications", () => {
      it.effect("should advertise tool list-change notifications when supported", () =>
        Effect.gen(function*() {
          const test = yield* McpConformance
          const discovered = yield* test.initialize({ server: "features" })
          assert.strictEqual(discovered.message.result.capabilities.tools?.listChanged, true)
        }))

      it.effect("should send a tool list-change notification when the advertised list changes", () =>
        Effect.gen(function*() {
          const fixture = yield* makeMcpStdioHarness(protocol)
          const makeTool = (name: string) => ({
            tool: new McpSchema.Tool({ name, inputSchema: { type: "object", properties: {} } }),
            annotations: Context.empty(),
            handle: () => Effect.succeed(new McpSchema.CallToolResult({ content: [] }))
          })
          yield* fixture.server.addTool(makeTool("baseline-list-changed-tool"))
          yield* fixture.initialize()
          yield* fixture.server.addTool(makeTool("dynamic-list-changed-tool"))
          yield* fixture.flushListChanged

          const notification = yield* fixture.awaitOutboundMethod("notifications/tools/list_changed")
          assert.strictEqual(notification.jsonrpc, "2.0")
          assert.strictEqual(notification.method, "notifications/tools/list_changed")
          assert.notProperty(notification, "id")

          const response = yield* fixture.sendRequest("tools/list", {})
          const result = yield* decodeTools(response.result)
          assert.isTrue(result.tools.some((tool) => tool.name === "dynamic-list-changed-tool"))
        }))
    })
  })
