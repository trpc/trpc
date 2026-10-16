import { assert, describe, it } from "@effect/vitest"
import * as McpProtocol from "effect/ai/McpProtocol"
import * as McpSchema from "effect/ai/McpSchema"
import * as Effect from "effect/Effect"
import * as Base64 from "effect/encoding/Base64"
import * as Schema from "effect/Schema"
import * as BaseProtocolTest from "./McpConformance/BaseProtocolTest.ts"
import * as CompletionTest from "./McpConformance/CompletionTest.ts"
import * as LoggingTest from "./McpConformance/LoggingTest.ts"
import { layer as makeMcpConformanceLayer, McpConformance } from "./McpConformance/McpConformance.ts"
import {
  MrtrInvalidStateToolName,
  MrtrSamplingToolChoiceToolName,
  MrtrSamplingToolsToolName,
  MrtrToolName
} from "./McpConformance/McpConformanceFixtures.ts"
import * as MultiRoundTripTest from "./McpConformance/MultiRoundTripTest.ts"
import * as PromptsTest from "./McpConformance/PromptsTest.ts"
import * as ResourcesTest from "./McpConformance/ResourcesTest.ts"
import * as SubscriptionsTest from "./McpConformance/SubscriptionsTest.ts"
import * as ToolsTest from "./McpConformance/ToolsTest.ts"
import * as TransportsTest from "./McpConformance/TransportsTest.ts"
import * as UtilitiesTest from "./McpConformance/UtilitiesTest.ts"
import { makeHttpHarness } from "./TestUtils/McpHttpHarness.ts"
import { readMcpHttpResponse } from "./TestUtils/McpHttpResponse.ts"
import { makeServerLayer } from "./TestUtils/McpServerLayer.ts"
import { makeMcpStdioHarness } from "./TestUtils/McpStdioHarness.ts"

const protocol = McpProtocol.v2026_07_28
const testLayer = makeMcpConformanceLayer(protocol)

const metadata = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": {},
  "io.modelcontextprotocol/clientInfo": { name: "McpConformanceClient", version: "1.0.0" }
} as const

const request = (
  id: string | number,
  method: string,
  params: Record<string, unknown> = {}
) => ({
  jsonrpc: "2.0",
  id,
  method,
  params: { ...params, _meta: metadata }
})

const headers = (method: string, name?: string): HeadersInit => ({
  "MCP-Protocol-Version": protocol.protocolVersion,
  "Mcp-Method": method,
  ...(name === undefined ? {} : { "Mcp-Name": name })
})

const decodeError = (response: Response) =>
  Effect.promise<unknown>(() => response.json()).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(Schema.Struct({
      id: Schema.NullOr(Schema.Union([Schema.String, Schema.Number])),
      error: McpSchema.McpError
    })))
  )

BaseProtocolTest.suite(protocol, testLayer)
BaseProtocolTest.statelessModernSuite(protocol, testLayer)
TransportsTest.statelessModernSuite(protocol, testLayer)
UtilitiesTest.statelessModernSuite(protocol, testLayer)
ToolsTest.suite(protocol, testLayer)
ToolsTest.statelessModernSuite(protocol, testLayer)
ResourcesTest.suite(protocol, testLayer)
PromptsTest.suite(protocol, testLayer, { additionalPromptNames: ["MrtrPrompt"] })
CompletionTest.suite(protocol, testLayer)
LoggingTest.statelessModernSuite(protocol, testLayer)
MultiRoundTripTest.suite(protocol, testLayer)
SubscriptionsTest.suite(protocol, testLayer)

it.layer(testLayer)(`Mcp Conformance (${protocol.protocolVersion})`, (it) => {
  describe("Lifecycle", () => {
    // SEP-2575: https://modelcontextprotocol.io/seps/2575-stateless-mcp
    // https://modelcontextprotocol.io/specification/2026-07-28/server/discovery
    it.effect("should discover the server when no initialization or session exists", () =>
      Effect.gen(function*() {
        const test = yield* McpConformance
        const discovered = yield* test.initialize({ server: "features" })

        assert.strictEqual(discovered.response.status, 200)
        assert.isNull(discovered.sessionId)
        assert.strictEqual(discovered.message.result.protocolVersion, protocol.protocolVersion)
        assert.strictEqual(discovered.message.result.instructions, "Follow the test server instructions.")
      }))

    // Modern extension settings are JSON objects; legacy-only scalar settings must not break discovery.
    // https://modelcontextprotocol.io/specification/2026-07-28/schema#servercapabilities
    it.effect("should advertise supported extension settings when discovering a server with legacy configuration", () =>
      Effect.gen(function*() {
        const extensions = {
          "example/settings": { enabled: true, formats: ["text/html"], nested: { value: null } },
          "example/empty": {}
        }
        const harness = yield* makeHttpHarness(makeServerLayer({
          name: "ExtensionServer",
          protocols: [protocol, McpProtocol.v2025_06_18],
          extensions: {
            ...extensions,
            "example/boolean": true,
            "example/array": [],
            "example/null": null
          }
        }))
        const response = yield* harness.post(request("discovery", "server/discover"), headers("server/discover"))
        assert.strictEqual(response.status, 200)
        const message = Schema.decodeUnknownSync(Schema.Struct({ result: Schema.JsonObject }))(
          yield* readMcpHttpResponse(response)
        )
        assert.deepStrictEqual(message.result.capabilities, { completions: {}, logging: {}, extensions })
      }))

    it.effect("should serve independent requests when no discovery or session exists", () =>
      Effect.gen(function*() {
        const test = yield* McpConformance
        const first = yield* test.post(request(1, "tools/list"), headers("tools/list"))
        const second = yield* test.post(request(2, "tools/list"), {
          ...headers("tools/list"),
          "Mcp-Session-Id": "ignored-modern-session"
        })

        assert.strictEqual(first.status, 200)
        assert.strictEqual(second.status, 200)
        assert.isNull(first.headers.get("Mcp-Session-Id"))
      }))

    it.effect("should return method not found when the removed initialize method is requested", () =>
      Effect.gen(function*() {
        const test = yield* McpConformance
        const response = yield* test.post(request(10, "initialize"), headers("initialize"))
        const message = yield* decodeError(response)

        assert.strictEqual(response.status, 404)
        assert.strictEqual(message.error.code, McpSchema.METHOD_NOT_FOUND_ERROR_CODE)
      }))

    it.effect("should accept cancellation notifications without request metadata", () =>
      Effect.gen(function*() {
        const test = yield* McpConformance
        const response = yield* test.post({
          jsonrpc: "2.0",
          method: "notifications/cancelled",
          params: { requestId: "already-complete" }
        }, headers("notifications/cancelled"))

        assert.strictEqual(response.status, 202)
        assert.strictEqual(yield* Effect.promise(() => response.text()), "")
      }))
  })

  describe("Transports", () => {
    // Required headers must produce HeaderMismatch even when body metadata is also absent.
    // https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#server-validation
    it.effect("should return HeaderMismatch when a July-only request omits headers and metadata", () =>
      Effect.gen(function*() {
        const test = yield* McpConformance
        const cases = [
          { jsonrpc: "2.0", id: "missing", method: "tools/list", params: {} },
          {
            jsonrpc: "2.0",
            id: "legacy-initialize",
            method: "initialize",
            params: {
              protocolVersion: "2025-11-25",
              capabilities: {},
              clientInfo: { name: "legacy-client", version: "1.0.0" }
            }
          }
        ]
        for (const body of cases) {
          const response = yield* test.post(body)
          assert.strictEqual(response.status, 400, body.id)
          const error = yield* decodeError(response)
          assert.strictEqual(error.id, body.id)
          assert.strictEqual(error.error.code, McpSchema.HEADER_MISMATCH_ERROR_CODE)
        }
      }))

    // Nested properties may mirror parameters; missing or mismatched headers must prevent execution.
    // https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#server-behavior-for-custom-headers
    it.effect("should validate nested mirrored parameters before executing a tool", () =>
      Effect.gen(function*() {
        const test = yield* McpConformance
        const initialized = yield* test.initialize({ server: "features" })
        for (const header of [undefined, "us", "eu", "=?base64?ZXU=?="]) {
          yield* test.resetObservations
          const response = yield* test.send(initialized, {
            jsonrpc: "2.0",
            id: "nested",
            method: "tools/call",
            params: { name: "HeaderTool", arguments: { region: "eu", routing: { region: "eu" } } }
          }, {
            headers: {
              "Mcp-Param-Region": "eu",
              ...(header === undefined ? {} : { "Mcp-Param-Nested-Region": header })
            }
          })
          if (header === undefined || header === "us") {
            assert.strictEqual((yield* test.observations).toolInvocations, 0)
            assert.strictEqual(response.status, 400)
            const error = yield* decodeError(response)
            assert.strictEqual(error.error.code, McpSchema.HEADER_MISMATCH_ERROR_CODE)
          } else {
            assert.strictEqual((yield* test.observations).toolInvocations, 1)
            assert.strictEqual(response.status, 200)
          }
        }
      }))

    // SEP-2567: https://modelcontextprotocol.io/seps/2567-remove-sessions
    it.effect("should exchange self-contained newline-delimited requests over stdio", () =>
      Effect.gen(function*() {
        const fixture = yield* makeMcpStdioHarness(protocol)
        const response = yield* fixture.sendRequest("server/discover", {})
        const result = Schema.decodeUnknownSync(Schema.Struct({
          supportedVersions: Schema.Array(Schema.String),
          capabilities: Schema.Record(Schema.String, Schema.Unknown),
          resultType: Schema.Literal("complete"),
          ttlMs: Schema.Number,
          cacheScope: Schema.Literal("private"),
          _meta: Schema.Struct({
            "io.modelcontextprotocol/serverInfo": Schema.Struct({
              name: Schema.String,
              version: Schema.String
            })
          })
        }))(response.result)

        assert.deepStrictEqual(result.supportedVersions, ["2026-07-28"])
        assert.deepStrictEqual(result.capabilities, { completions: {}, logging: {} })
        assert.strictEqual(result.ttlMs, 0)
        assert.deepStrictEqual(result._meta["io.modelcontextprotocol/serverInfo"], {
          name: "McpConformance",
          version: "1.0.0"
        })
      }))

    it.effect("should accept every required routing name when the header matches the request", () =>
      Effect.gen(function*() {
        const test = yield* McpConformance
        const cases = [
          ["tools/call", { name: "ConformanceTool", arguments: {} }, "ConformanceTool"],
          ["resources/read", { uri: "file:///conformance.txt" }, "file:///conformance.txt"],
          ["prompts/get", { name: "ConformancePrompt", arguments: {} }, "ConformancePrompt"]
        ] as const

        for (const [index, [method, params, name]] of cases.entries()) {
          const response = yield* test.post(request(index + 1, method, params), headers(method, name))
          assert.strictEqual(response.status, 200)
        }

        const encodedName = `=?base64?${Base64.encode("file:///conformance.txt")}?=`
        const encoded = yield* test.post(
          request(4, "resources/read", { uri: "file:///conformance.txt" }),
          headers("resources/read", encodedName)
        )
        assert.strictEqual(encoded.status, 200)
      }))

    // Conformance: http-header-validation
    it.effect("should treat an unmatched Base64 wrapper as a literal when routing a request", () =>
      Effect.gen(function*() {
        const test = yield* McpConformance
        const value = "=?base64?SGVsbG8="
        const response = yield* test.post(
          request(5, "tools/call", { name: "HeaderTool", arguments: { region: value } }),
          { ...headers("tools/call", "HeaderTool"), "Mcp-Param-region": value }
        )

        assert.strictEqual(response.status, 200)
      }))

    it.effect("should reject routing headers when they are missing, malformed, or mismatched", () =>
      Effect.gen(function*() {
        const test = yield* McpConformance
        const cases = [
          [request("missing", "tools/list"), { "MCP-Protocol-Version": protocol.protocolVersion }],
          [request("mismatch", "tools/list"), headers("tools/call")],
          [
            request("malformed", "resources/read", { uri: "file:///conformance.txt" }),
            headers("resources/read", "=?base64?not-valid!?=")
          ],
          [
            request("invalid-utf8", "resources/read", { uri: "\uFFFD" }),
            headers("resources/read", "=?base64?/w==?=")
          ]
        ] as const

        // SEP-2243: https://modelcontextprotocol.io/seps/2243-http-standardization
        // The final specification assigns the HeaderMismatch error code.
        // https://modelcontextprotocol.io/specification/2026-07-28/basic/transports#request-metadata
        for (const [body, requestHeaders] of cases) {
          const response = yield* test.post(body, requestHeaders)
          const error = yield* decodeError(response)
          assert.strictEqual(response.status, 400)
          assert.strictEqual(error.id, body.id)
          assert.strictEqual(error.error.code, McpSchema.HEADER_MISMATCH_ERROR_CODE)
        }
      }))

    it.effect("should reject an unsupported request version with the supported versions", () =>
      Effect.gen(function*() {
        const test = yield* McpConformance
        const body = {
          ...request(5, "tools/list"),
          params: {
            _meta: {
              ...metadata,
              "io.modelcontextprotocol/protocolVersion": "2099-01-01"
            }
          }
        }
        const response = yield* test.post(body, {
          "MCP-Protocol-Version": "2099-01-01",
          "Mcp-Method": "tools/list"
        })
        const error = yield* decodeError(response)

        assert.strictEqual(response.status, 400)
        assert.strictEqual(error.id, 5)
        assert.strictEqual(error.error.code, -32022)
        assert.deepStrictEqual(error.error.data, {
          supported: ["2026-07-28"],
          requested: "2099-01-01"
        })
      }))

    // https://modelcontextprotocol.io/specification/2026-07-28/changelog#removals
    it.effect("should return method not found when a request uses an unknown or removed method", () =>
      Effect.gen(function*() {
        const test = yield* McpConformance
        const methods = [
          "unknown/method",
          "ping",
          "logging/setLevel",
          "resources/subscribe",
          "resources/unsubscribe",
          "tasks/get"
        ] as const

        for (const [index, method] of methods.entries()) {
          const id = index + 6
          const response = yield* test.post(request(id, method), headers(method))
          const error = yield* decodeError(response)
          assert.strictEqual(response.status, 404, method)
          assert.strictEqual(error.id, id, method)
          assert.strictEqual(error.error.code, McpSchema.METHOD_NOT_FOUND_ERROR_CODE, method)
        }
      }))
  })

  describe("Request metadata", () => {
    it.effect("should return InvalidParams when required request metadata is missing", () =>
      Effect.gen(function*() {
        const test = yield* McpConformance
        const body = request(20, "tools/list")
        const cases = [
          { ...body, params: {} },
          {
            ...body,
            params: {
              _meta: {
                "io.modelcontextprotocol/clientCapabilities": {},
                "io.modelcontextprotocol/clientInfo": metadata["io.modelcontextprotocol/clientInfo"]
              }
            }
          },
          {
            ...body,
            params: {
              _meta: { "io.modelcontextprotocol/protocolVersion": protocol.protocolVersion }
            }
          }
        ]

        for (const requestBody of cases) {
          const response = yield* test.post(requestBody, headers("tools/list"))
          const error = yield* decodeError(response)
          assert.strictEqual(response.status, 400)
          assert.strictEqual(error.id, body.id)
          assert.strictEqual(error.error.code, McpSchema.INVALID_PARAMS_ERROR_CODE)
        }
      }))

    it.effect("should accept a request when optional client identity is omitted", () =>
      Effect.gen(function*() {
        const test = yield* McpConformance
        const body = request(22, "tools/list")
        const response = yield* test.post({
          ...body,
          params: {
            _meta: {
              "io.modelcontextprotocol/protocolVersion": protocol.protocolVersion,
              "io.modelcontextprotocol/clientCapabilities": {}
            }
          }
        }, headers("tools/list"))

        assert.strictEqual(response.status, 200)
      }))

    it.effect("should preserve caller metadata alongside authoritative protocol facts", () =>
      Effect.gen(function*() {
        const test = yield* McpConformance
        const discovered = yield* test.initialize({ server: "features" })
        const response = yield* test.send(discovered, {
          jsonrpc: "2.0",
          id: 8,
          method: "tools/call",
          params: {
            name: "RequestMetadataTool",
            arguments: {},
            _meta: { sentinel: "preserved" }
          }
        })
        const message = yield* test.decodeResult(response)
        const result = Schema.decodeUnknownSync(Schema.Struct({ structuredContent: Schema.String }))(message.result)
        const observed = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown))(
          JSON.parse(result.structuredContent)
        )

        assert.strictEqual(observed.sentinel, "preserved")
        assert.strictEqual(observed["io.modelcontextprotocol/protocolVersion"], protocol.protocolVersion)
        assert.deepStrictEqual(observed["io.modelcontextprotocol/clientCapabilities"], {
          elicitation: { form: {} },
          roots: {},
          sampling: {}
        })
        assert.deepStrictEqual(observed["io.modelcontextprotocol/clientInfo"], {
          name: "McpConformanceClient",
          version: "1.0.0"
        })
      }))
  })

  describe("Result envelopes", () => {
    // Conformance: sep-2164-resource-not-found
    it.effect("should include the requested URI when a resource is not found", () =>
      Effect.gen(function*() {
        const test = yield* McpConformance
        const uri = "test://nonexistent-resource-for-conformance-testing"
        const response = yield* test.post(
          request(29, "resources/read", { uri }),
          headers("resources/read", uri)
        )
        const error = yield* decodeError(response)

        assert.strictEqual(error.error.code, McpSchema.INVALID_PARAMS_ERROR_CODE)
        assert.deepStrictEqual(error.error.data, { uri })
      }))

    // SEP-2322 requires every successful result to declare its result type.
    // SEP-2549 requires cache metadata on discovery, list, and resource-read results.
    it.effect("should attach modern result and cache metadata to every cacheable operation", () =>
      Effect.gen(function*() {
        const test = yield* McpConformance
        const discovered = yield* test.initialize({ server: "features" })
        const cases = [
          ["server/discover", {}],
          ["tools/list", {}],
          ["prompts/list", {}],
          ["resources/list", {}],
          ["resources/templates/list", {}],
          ["resources/read", { uri: "file:///test" }]
        ] as const

        for (const [index, [method, params]] of cases.entries()) {
          const response = yield* test.send(discovered, {
            jsonrpc: "2.0",
            id: index + 30,
            method,
            params
          })
          assert.strictEqual(response.status, 200, method)
          const body = yield* Effect.promise<unknown>(() => response.json())
          assert.isObject(body, method)
          assert.property(body, "result", method)
          const result = Schema.decodeUnknownSync(Schema.Struct({
            resultType: Schema.Literal("complete"),
            ttlMs: Schema.Int,
            cacheScope: Schema.Literals(["public", "private"]),
            _meta: Schema.Struct({
              "io.modelcontextprotocol/serverInfo": Schema.Struct({
                name: Schema.String,
                version: Schema.String
              })
            })
          }))((body as { result: unknown }).result)

          assert.isAtLeast(result.ttlMs, 0)
          assert.deepStrictEqual(result._meta["io.modelcontextprotocol/serverInfo"], {
            name: "McpConformance",
            version: "1.0.0"
          })
        }
      }))

    // https://modelcontextprotocol.io/specification/2026-07-28/basic#results
    it.effect("should attach a complete result type and server identity to every non-cacheable operation", () =>
      Effect.gen(function*() {
        const test = yield* McpConformance
        const discovered = yield* test.initialize({ server: "features" })
        const cases = [
          ["tools/call", { name: "TestTool", arguments: { value: "called" } }],
          ["prompts/get", { name: "NoArgumentPrompt", arguments: {} }],
          [
            "completion/complete",
            {
              ref: { type: "ref/prompt", name: "TestPrompt" },
              argument: { name: "required", value: "f" }
            }
          ]
        ] as const

        for (const [index, [method, params]] of cases.entries()) {
          const response = yield* test.send(discovered, {
            jsonrpc: "2.0",
            id: index + 50,
            method,
            params
          })
          const message = yield* test.decodeResult(response)
          const result = Schema.decodeUnknownSync(Schema.Struct({
            resultType: Schema.Literal("complete"),
            _meta: Schema.Struct({
              "io.modelcontextprotocol/serverInfo": Schema.Struct({
                name: Schema.String,
                version: Schema.String
              })
            })
          }))(message.result)

          assert.deepStrictEqual(result._meta["io.modelcontextprotocol/serverInfo"], {
            name: "McpConformance",
            version: "1.0.0"
          })
        }
      }))
  })

  describe("Multi round-trip request capabilities", () => {
    // Conformance: input-required-result-tampered-state
    it.effect("should return InvalidParams when a resumed tool rejects its requestState", () =>
      Effect.gen(function*() {
        const test = yield* McpConformance
        const discovered = yield* test.initialize({ server: "features" })
        const response = yield* test.send(discovered, {
          jsonrpc: "2.0",
          id: 37,
          method: "tools/call",
          params: {
            name: MrtrInvalidStateToolName,
            arguments: {},
            inputResponses: { approval: { action: "accept", content: { approved: true } } },
            requestState: "tampered"
          }
        })
        const error = yield* decodeError(response)

        assert.strictEqual(response.status, 200)
        assert.strictEqual(error.error.code, McpSchema.INVALID_PARAMS_ERROR_CODE)
      }))

    // https://modelcontextprotocol.io/specification/2026-07-28/client/sampling#tools-in-sampling
    it.effect("should reject tool-enabled sampling when the client omits sampling.tools", () =>
      Effect.gen(function*() {
        const test = yield* McpConformance
        const discovered = yield* test.initialize({ server: "features" })
        const cases = [MrtrSamplingToolsToolName, MrtrSamplingToolChoiceToolName] as const
        for (const [index, name] of cases.entries()) {
          const response = yield* test.send(discovered, {
            jsonrpc: "2.0",
            id: index + 38,
            method: "tools/call",
            params: { name, arguments: {} }
          }, { clientCapabilities: { sampling: {} } })
          const error = yield* decodeError(response)

          assert.strictEqual(response.status, 400)
          assert.strictEqual(error.error.code, -32021)
          assert.deepStrictEqual(error.error.data, {
            requiredCapabilities: { sampling: { tools: {} } }
          })
        }
      }))

    // https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation#capabilities
    it.effect("should treat an empty elicitation capability as form support", () =>
      Effect.gen(function*() {
        const test = yield* McpConformance
        const discovered = yield* test.initialize({ server: "features" })
        const response = yield* test.send(discovered, {
          jsonrpc: "2.0",
          id: 39,
          method: "tools/call",
          params: { name: MrtrToolName, arguments: {} }
        }, {
          clientCapabilities: {
            elicitation: {},
            sampling: {},
            roots: {}
          }
        })
        const message = yield* test.decodeResult(response)
        const result = Schema.decodeUnknownSync(Schema.Struct({
          resultType: Schema.Literal("input_required"),
          inputRequests: Schema.Record(Schema.String, Schema.Unknown)
        }))(message.result)

        assert.deepStrictEqual(result.inputRequests.approval, {
          method: "elicitation/create",
          params: {
            message: "Approve the operation",
            requestedSchema: {
              type: "object",
              properties: {
                approved: { type: "boolean" },
                color: { type: "string", enum: ["red", "blue"] },
                titled: { type: "string", oneOf: [{ const: "red", title: "Red" }, { const: "blue", title: "Blue" }] },
                legacy: { type: "string", enum: ["red", "blue"], enumNames: ["Red", "Blue"] }
              },
              required: ["approved"]
            }
          }
        })
      }))

    // https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/mrtr#server-requirements-capability-validation
    it.effect("should reject input requests when the client omits their required capabilities", () =>
      Effect.gen(function*() {
        const test = yield* McpConformance
        const discovered = yield* test.initialize({ server: "features" })
        const response = yield* test.send(discovered, {
          jsonrpc: "2.0",
          id: 40,
          method: "tools/call",
          params: { name: MrtrToolName, arguments: {} }
        }, { clientCapabilities: {} })
        const error = yield* decodeError(response)

        assert.strictEqual(response.status, 400)
        assert.strictEqual(error.error.code, -32021)
        const data = Schema.decodeUnknownSync(Schema.Struct({
          requiredCapabilities: Schema.JsonObject
        }))(error.error.data)
        assert.deepStrictEqual(data, {
          requiredCapabilities: {
            elicitation: { form: {} },
            sampling: {},
            roots: {}
          }
        })
      }))
  })
})
