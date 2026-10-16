import { assert, describe, it } from "@effect/vitest"
import * as McpProtocol from "effect/ai/McpProtocol"
import * as McpSchema from "effect/ai/McpSchema"
import * as Effect from "effect/Effect"
import * as BaseProtocolTest from "./McpConformance/BaseProtocolTest.ts"
import * as CompletionTest from "./McpConformance/CompletionTest.ts"
import * as LifecycleTest from "./McpConformance/LifecycleTest.ts"
import * as LoggingTest from "./McpConformance/LoggingTest.ts"
import { layer as makeMcpConformanceLayer, McpConformance } from "./McpConformance/McpConformance.ts"
import * as PromptsTest from "./McpConformance/PromptsTest.ts"
import * as ResourcesTest from "./McpConformance/ResourcesTest.ts"
import * as RootsTest from "./McpConformance/RootsTest.ts"
import * as SamplingTest from "./McpConformance/SamplingTest.ts"
import * as ToolsTest from "./McpConformance/ToolsTest.ts"
import * as TransportsTest from "./McpConformance/TransportsTest.ts"
import * as UtilitiesTest from "./McpConformance/UtilitiesTest.ts"
import { makeMcpStdioHarness } from "./TestUtils/McpStdioHarness.ts"

const protocol = McpProtocol.v2025_03_26
const testLayer = makeMcpConformanceLayer(protocol)

LifecycleTest.suite(protocol, testLayer)
BaseProtocolTest.suite(protocol, testLayer)
BaseProtocolTest.statefulLegacySuite(protocol, testLayer)
TransportsTest.suite(protocol, testLayer)
UtilitiesTest.suite(protocol, testLayer)
UtilitiesTest.statefulLegacySuite(protocol, testLayer)
LoggingTest.suite(protocol, testLayer)
CompletionTest.suite(protocol, testLayer)
ToolsTest.suite(protocol, testLayer)
ToolsTest.statefulLegacySuite(protocol, testLayer)
ResourcesTest.suite(protocol, testLayer)
ResourcesTest.statefulLegacySuite(protocol, testLayer)
PromptsTest.suite(protocol, testLayer)
PromptsTest.statefulLegacySuite(protocol, testLayer)
RootsTest.suite(protocol, testLayer)
SamplingTest.suite(protocol, testLayer)

it.layer(testLayer)(`Mcp Conformance (${protocol.protocolVersion})`, (it) => {
  describe("Transport-specific behavior", () => {
    it.effect("MUST accept operational JSON-RPC batches over stdio", () =>
      Effect.gen(function*() {
        const fixture = yield* makeMcpStdioHarness(protocol)
        yield* fixture.sendRaw({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: protocol.protocolVersion,
            capabilities: {},
            clientInfo: { name: "stdio-client", version: "1.0.0" }
          }
        })
        yield* fixture.takeFrame
        yield* fixture.sendRaw([
          { jsonrpc: "2.0", id: 2, method: "ping", params: {} },
          { jsonrpc: "2.0", id: 3, method: "ping", params: {} }
        ])

        assert.deepStrictEqual(yield* fixture.takeFrame, [
          { jsonrpc: "2.0", id: 2, result: {} },
          { jsonrpc: "2.0", id: 3, result: {} }
        ])
      }))

    it.effect("SERVER rejects initialize as part of a JSON-RPC batch", () =>
      Effect.gen(function*() {
        const test = yield* McpConformance
        const response = yield* test.post([test.initializeRequest()])

        assert.isAtLeast(response.status, 400)
        assert.isNull(response.headers.get("Mcp-Session-Id"))
      }))

    it.effect("MUST reject an empty JSON-RPC batch", () =>
      Effect.gen(function*() {
        const test = yield* McpConformance
        const response = yield* test.post([])
        const error = yield* test.decodeError(response)

        assert.strictEqual(error.id, null)
        assert.strictEqual(error.error.code, -32600)
      }))

    it.effect("MUST accept an operational mixed batch and correlate responses by id", () =>
      Effect.gen(function*() {
        const test = yield* McpConformance
        const initialized = yield* test.initialize()
        assert.isNotNull(initialized.sessionId)

        const response = yield* test.send(initialized, [
          test.pingRequest(41),
          test.initializedNotification,
          { jsonrpc: "2.0", id: 42, method: "unknown/method" }
        ], { includeProtocolVersion: false })
        const messages = yield* Effect.promise<
          ReadonlyArray<{
            readonly jsonrpc?: unknown
            readonly id?: unknown
            readonly result?: unknown
            readonly error?: { readonly code?: unknown }
          }>
        >(() => response.json())
        const success = messages.find((message) => message.id === 41)
        const failure = messages.find((message) => message.id === 42)

        assert.deepStrictEqual(success, { jsonrpc: "2.0", id: 41, result: {} })
        assert.strictEqual(failure?.error?.code, McpSchema.METHOD_NOT_FOUND_ERROR_CODE)
      }))

    it.effect("MUST return 202 with no body for an accepted notification-only batch", () =>
      Effect.gen(function*() {
        const test = yield* McpConformance
        const initialized = yield* test.initialize()
        assert.isNotNull(initialized.sessionId)

        const response = yield* test.send(initialized, [
          test.initializedNotification,
          { jsonrpc: "2.0", method: "notifications/roots/list_changed" }
        ], { includeProtocolVersion: false })

        assert.strictEqual(response.status, 202)
        assert.strictEqual(yield* Effect.promise(() => response.text()), "")
      }))

    it.effect("MUST operate without the later protocol-version header", () =>
      Effect.gen(function*() {
        const test = yield* McpConformance
        const initialized = yield* test.initialize()
        assert.isNotNull(initialized.sessionId)

        const response = yield* test.ping(initialized, {
          includeProtocolVersion: false
        })

        assert.strictEqual(response.status, 200)
      }))
  })
})
