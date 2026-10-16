import { assert, describe, it } from "@effect/vitest"
import type * as McpProtocol from "effect/ai/McpProtocol"
import * as McpSchema from "effect/ai/McpSchema"
import * as McpServer from "effect/ai/McpServer"
import * as Context from "effect/Context"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { initializeHttpSession, makeHttpHarness } from "../TestUtils/McpHttpHarness.ts"
import { makeMcpSseReader, readMcpHttpResponse } from "../TestUtils/McpHttpResponse.ts"
import { makeServerLayer } from "../TestUtils/McpServerLayer.ts"
import { makeMcpStdioHarness } from "../TestUtils/McpStdioHarness.ts"
import { McpConformance, type McpConformanceLayer } from "./McpConformance.ts"

const levels = ["debug", "info", "notice", "warning", "error", "critical", "alert", "emergency"] as const
const effectLevels = {
  debug: "Debug",
  info: "Info",
  notice: "Info",
  warning: "Warn",
  error: "Error",
  critical: "Fatal",
  alert: "Fatal",
  emergency: "Fatal"
} as const

const setLevel = (level: string) =>
  Effect.gen(function*() {
    const test = yield* McpConformance
    const initialized = yield* test.initialize({ server: "features" })
    yield* test.notifyInitialized(initialized)
    const response = yield* test.send(initialized, {
      jsonrpc: "2.0",
      id: 2,
      method: "logging/setLevel",
      params: { level }
    })
    return { initialized, response, test }
  })

export const suite = (protocol: McpProtocol.ProtocolAdapter, layer: McpConformanceLayer) =>
  it.layer(layer)(`Mcp Conformance (${protocol.protocolVersion})`, (it) => {
    describe("Logging", () => {
      // Logging has the same protocol surface in the legacy specifications.
      describe("Capabilities", () => {
        it.effect("MUST advertise logging when log notifications are supported", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const initialized = yield* test.initialize({ server: "features" })
            assert.property(initialized.message.result.capabilities, "logging")
          }))
      })

      describe("Setting Log Level", () => {
        // https://modelcontextprotocol.io/specification/2024-11-05/server/utilities/logging#setting-log-level
        // https://modelcontextprotocol.io/specification/2025-03-26/server/utilities/logging#setting-log-level
        // https://modelcontextprotocol.io/specification/2025-06-18/server/utilities/logging#setting-log-level
        // https://modelcontextprotocol.io/specification/2025-11-25/server/utilities/logging#setting-log-level
        // These HTTP cases exercise the shared logging threshold contract. The 2024 adapter run checks
        // Effect compatibility through this HTTP harness, not the original 2024 HTTP+SSE transport.
        for (const level of ["debug", "emergency"] as const) {
          it.effect(`should filter background HTTP logs when the destination session selects ${level}`, () =>
            Effect.gen(function*() {
              const release = yield* Deferred.make<void>()
              const serverReady = yield* Deferred.make<McpServer.McpServer["Service"]>()
              const harness = yield* makeHttpHarness(
                Layer.effectDiscard(Effect.gen(function*() {
                  const server = yield* McpServer.McpServer
                  yield* server.addTool({
                    tool: new McpSchema.Tool({ name: "Wait", inputSchema: { type: "object" } }),
                    annotations: Context.empty(),
                    handle: () =>
                      Effect.gen(function*() {
                        yield* server.notifications["notifications/message"]({ level: "emergency", data: "ready" })
                        yield* Deferred.await(release)
                        return new McpSchema.CallToolResult({ content: [] })
                      })
                  })
                  yield* Deferred.succeed(serverReady, server)
                })).pipe(Layer.provideMerge(makeServerLayer({ name: "BackgroundLogging", protocols: [protocol] })))
              )
              const headers = yield* initializeHttpSession(harness, protocol)
              const configured = yield* harness.post({
                jsonrpc: "2.0",
                id: "set-level",
                method: "logging/setLevel",
                params: { level }
              }, headers).pipe(Effect.flatMap(readMcpHttpResponse))
              assert.deepInclude(configured, { id: "set-level", result: {} })
              const response = makeMcpSseReader(
                yield* harness.post({
                  jsonrpc: "2.0",
                  id: "wait",
                  method: "tools/call",
                  params: { name: "Wait", arguments: {} }
                }, headers)
              )
              yield* Effect.addFinalizer(() => response.cancel)
              assert.deepInclude(yield* response.take(), {
                method: "notifications/message",
                params: { level: "emergency", data: "ready" }
              })
              const server = yield* Deferred.await(serverReady)
              yield* server.notifications["notifications/message"]({ level: "debug", data: "debug-log" })
              yield* server.notifications["notifications/message"]({ level: "error", data: "error-log" })
              yield* server.notifications["notifications/message"]({ level: "emergency", data: "sentinel" })
              const messages: Array<unknown> = []
              while (true) {
                const message = yield* response.take()
                assert.strictEqual(message.method, "notifications/message")
                messages.push(message.params)
                if ((message.params as { data: string }).data === "sentinel") break
              }
              assert.deepStrictEqual(
                messages,
                level === "debug" ?
                  [
                    { level: "debug", data: "debug-log" },
                    { level: "error", data: "error-log" },
                    { level: "emergency", data: "sentinel" }
                  ] :
                  [{ level: "emergency", data: "sentinel" }]
              )
              yield* Deferred.succeed(release, undefined)
              assert.deepInclude(yield* response.take(), { id: "wait", result: { content: [] } })
              assert.deepStrictEqual(yield* response.drain(), [])
            }))
        }

        it.effect("should isolate background HTTP log levels when concurrent sessions select different thresholds", () =>
          Effect.gen(function*() {
            const release = yield* Deferred.make<void>()
            const serverReady = yield* Deferred.make<McpServer.McpServer["Service"]>()
            const harness = yield* makeHttpHarness(
              Layer.effectDiscard(Effect.gen(function*() {
                const server = yield* McpServer.McpServer
                yield* server.addTool({
                  tool: new McpSchema.Tool({ name: "Wait", inputSchema: { type: "object" } }),
                  annotations: Context.empty(),
                  handle: () =>
                    Effect.gen(function*() {
                      yield* server.notifications["notifications/message"]({ level: "emergency", data: "ready" })
                      yield* Deferred.await(release)
                      return new McpSchema.CallToolResult({ content: [] })
                    })
                })
                yield* Deferred.succeed(serverReady, server)
              })).pipe(
                Layer.provideMerge(makeServerLayer({ name: "IsolatedBackgroundLogging", protocols: [protocol] }))
              )
            )
            const responses = yield* Effect.forEach(["debug", "emergency"] as const, (level) =>
              Effect.gen(function*() {
                const headers = yield* initializeHttpSession(harness, protocol)
                const configured = yield* harness.post({
                  jsonrpc: "2.0",
                  id: "set-level",
                  method: "logging/setLevel",
                  params: { level }
                }, headers).pipe(Effect.flatMap(readMcpHttpResponse))
                assert.deepInclude(configured, { id: "set-level", result: {} })
                const response = makeMcpSseReader(
                  yield* harness.post({
                    jsonrpc: "2.0",
                    id: "wait",
                    method: "tools/call",
                    params: { name: "Wait", arguments: {} }
                  }, headers)
                )
                yield* Effect.addFinalizer(() => response.cancel)
                assert.deepInclude(yield* response.take(), {
                  method: "notifications/message",
                  params: { level: "emergency", data: "ready" }
                })
                return { level, response }
              }))
            const server = yield* Deferred.await(serverReady)
            yield* server.notifications["notifications/message"]({ level: "debug", data: "debug-log" })
            yield* server.notifications["notifications/message"]({ level: "error", data: "error-log" })
            yield* server.notifications["notifications/message"]({ level: "emergency", data: "sentinel" })
            for (const { level, response } of responses) {
              const messages: Array<unknown> = []
              while (true) {
                const message = yield* response.take()
                assert.strictEqual(message.method, "notifications/message")
                messages.push(message.params)
                if ((message.params as { data: string }).data === "sentinel") break
              }
              assert.deepStrictEqual(
                messages,
                level === "debug" ?
                  [
                    { level: "debug", data: "debug-log" },
                    { level: "error", data: "error-log" },
                    { level: "emergency", data: "sentinel" }
                  ] :
                  [{ level: "emergency", data: "sentinel" }]
              )
            }
            yield* Deferred.succeed(release, undefined)
            for (const { response } of responses) {
              assert.deepInclude(yield* response.take(), { id: "wait", result: { content: [] } })
              assert.deepStrictEqual(yield* response.drain(), [])
            }
          }))

        it.effect("MUST accept every specified log level", () =>
          Effect.forEach(levels, (level) =>
            Effect.gen(function*() {
              const { response, test } = yield* setLevel(level)
              const result = yield* test.decodeResult(response)
              assert.deepStrictEqual(result.result, {})
            }), { concurrency: 1 }))
        it.effect("MUST reject an unknown log level", () =>
          Effect.gen(function*() {
            const { response, test } = yield* setLevel("verbose")
            const error = yield* test.decodeError(response)
            assert.strictEqual(error.error.code, McpSchema.INVALID_PARAMS_ERROR_CODE)
          }))
        it.effect("SHOULD update the minimum level for subsequent operations", () =>
          Effect.gen(function*() {
            const { initialized, test } = yield* setLevel("debug")
            const response = yield* test.send(initialized, {
              jsonrpc: "2.0",
              id: 3,
              method: "tools/call",
              params: { name: "LogLevelTool", arguments: {} }
            })
            const result = yield* test.decodeResult(response).pipe(
              Effect.flatMap((message) => Schema.decodeUnknownEffect(McpSchema.CallToolResult)(message.result))
            )
            assert.deepStrictEqual(result.content, [{ type: "text", text: "Debug" }])
          }))
        it.effect("SHOULD send notifications at the selected level and higher", () =>
          Effect.gen(function*() {
            const fixture = yield* makeMcpStdioHarness(protocol)
            yield* fixture.initialize()
            const response = yield* fixture.sendRequest("logging/setLevel", { level: "warning" }, 2)
            assert.deepStrictEqual(response.result, {})

            yield* fixture.server.notifications["notifications/message"]({
              level: "warning",
              logger: "conformance",
              data: "at-threshold"
            })
            const notification = yield* fixture.awaitOutboundMethod("notifications/message")
            const payload = yield* Schema.decodeUnknownEffect(
              McpSchema.LoggingMessageNotification.payloadSchema
            )(notification.params)
            assert.deepStrictEqual(payload, {
              level: "warning",
              logger: "conformance",
              data: "at-threshold"
            })
          }))
        it.effect("MUST not send notifications below the selected level", () =>
          Effect.gen(function*() {
            const fixture = yield* makeMcpStdioHarness(protocol)
            yield* fixture.initialize()
            const response = yield* fixture.sendRequest("logging/setLevel", { level: "warning" }, 2)
            assert.deepStrictEqual(response.result, {})

            yield* fixture.server.notifications["notifications/message"]({
              level: "debug",
              logger: "conformance",
              data: "below-threshold"
            })
            yield* fixture.server.notifications["notifications/message"]({
              level: "warning",
              logger: "conformance",
              data: "allowed-sentinel"
            })
            const notification = yield* fixture.awaitOutboundMethod("notifications/message")
            assert.deepNestedInclude(notification, {
              params: {
                level: "warning",
                logger: "conformance",
                data: "allowed-sentinel"
              }
            })
          }))
      })

      describe("Log Message Notifications", () => {
        it.effect("SCHEMA preserves the log level, logger name, and data", () =>
          Effect.gen(function*() {
            const payload = yield* Schema.decodeUnknownEffect(
              McpSchema.LoggingMessageNotification.payloadSchema
            )({
              level: "warning",
              logger: "database",
              data: {
                message: "slow query",
                durationMs: 120
              }
            })

            assert.deepStrictEqual(payload, {
              level: "warning",
              logger: "database",
              data: {
                message: "slow query",
                durationMs: 120
              }
            })
          }))
        it.effect("MUST allow arbitrary JSON-compatible log data", () =>
          Effect.forEach([
            "message",
            42,
            true,
            null,
            ["one", { nested: "two" }],
            { nested: { value: 1 } }
          ], (data) =>
            Schema.decodeUnknownEffect(
              McpSchema.LoggingMessageNotification.payloadSchema
            )({
              level: "info",
              data
            }).pipe(
              Effect.map((payload) => assert.deepStrictEqual(payload.data, data))
            )))
        it.effect("MUST emit log messages as notifications without an identifier", () =>
          Effect.gen(function*() {
            const fixture = yield* makeMcpStdioHarness(protocol)
            yield* fixture.initialize()
            yield* fixture.server.notifications["notifications/message"]({
              level: "warning",
              logger: "database",
              data: { message: "slow query" }
            })

            const notification = yield* fixture.awaitOutboundMethod("notifications/message")
            assert.strictEqual(notification.jsonrpc, "2.0")
            assert.strictEqual(notification.method, "notifications/message")
            yield* Schema.decodeUnknownEffect(
              McpSchema.LoggingMessageNotification.payloadSchema
            )(notification.params)
            assert.notProperty(notification, "id")
            assert.notProperty(notification, "result")
          }))
        it.effect("SCENARIO does not corrupt the stdio protocol stream with log output", () =>
          Effect.gen(function*() {
            const fixture = yield* makeMcpStdioHarness(protocol)
            yield* fixture.initialize()
            yield* fixture.takeFrame
            yield* fixture.server.notifications["notifications/message"]({
              level: "info",
              logger: "conformance",
              data: "stdio-integrity-diagnostic"
            })
            const ping = yield* fixture.sendRequest("ping", {}, 2).pipe(Effect.forkChild)

            const notificationFrame = yield* fixture.takeFrame
            const responseFrame = yield* fixture.takeFrame
            assert.isObject(notificationFrame)
            assert.isObject(responseFrame)
            assert.deepInclude(notificationFrame, {
              method: "notifications/message"
            })
            assert.deepNestedInclude(notificationFrame, {
              "params.data": "stdio-integrity-diagnostic"
            })
            assert.deepInclude(responseFrame, { jsonrpc: "2.0", id: 2, result: {} })
            yield* Fiber.join(ping)
          }))
      })
    })
  })

export const statelessModernSuite = (
  protocol: McpProtocol.ProtocolAdapter,
  layer: McpConformanceLayer
) =>
  it.layer(layer)(`Mcp Conformance (${protocol.protocolVersion})`, (it) => {
    const callLogLevelTool = Effect.fnUntraced(function*(level?: string) {
      const test = yield* McpConformance
      const discovered = yield* test.initialize({ server: "features" })
      const response = yield* test.send(discovered, {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "LogLevelTool",
          arguments: {},
          ...(level === undefined
            ? {}
            : { _meta: { "io.modelcontextprotocol/logLevel": level } })
        }
      })
      return { response, test }
    })

    describe("Logging > Stateless modern", () => {
      // https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/logging#per-request-log-level
      for (const source of ["background", "another request"] as const) {
        it.effect(`MUST not deliver logs from ${source} on an HTTP subscription stream`, () =>
          Effect.gen(function*() {
            const serverReady = yield* Deferred.make<McpServer.McpServer["Service"]>()
            const harness = yield* makeHttpHarness(
              Layer.effectDiscard(
                Effect.gen(function*() {
                  const server = yield* McpServer.McpServer
                  yield* server.addTool({
                    tool: new McpSchema.Tool({ name: "EmitLogs", inputSchema: { type: "object" } }),
                    annotations: Context.empty(),
                    handle: () =>
                      server.notifications["notifications/message"]({ level: "error", data: "private-log" }).pipe(
                        Effect.as(new McpSchema.CallToolResult({ content: [] }))
                      )
                  })
                  yield* Deferred.succeed(serverReady, server)
                })
              ).pipe(Layer.provideMerge(makeServerLayer({ name: "LoggingConformance", protocols: [protocol] })))
            )
            const response = yield* harness.post({
              jsonrpc: "2.0",
              id: "logs-forbidden",
              method: "subscriptions/listen",
              params: {
                notifications: { toolsListChanged: true },
                _meta: {
                  "io.modelcontextprotocol/protocolVersion": protocol.protocolVersion,
                  "io.modelcontextprotocol/clientCapabilities": {}
                }
              }
            }, {
              "MCP-Protocol-Version": protocol.protocolVersion,
              "Mcp-Method": "subscriptions/listen"
            })
            const stream = makeMcpSseReader(response)
            yield* Effect.addFinalizer(() => stream.cancel)
            assert.strictEqual((yield* stream.take()).method, "notifications/subscriptions/acknowledged")
            const server = yield* Deferred.await(serverReady)
            if (source === "background") {
              yield* server.notifications["notifications/message"]({ level: "error", data: "private-log" })
            } else {
              const result = yield* harness.post({
                jsonrpc: "2.0",
                id: "originating-request",
                method: "tools/call",
                params: {
                  name: "EmitLogs",
                  arguments: {},
                  _meta: {
                    "io.modelcontextprotocol/protocolVersion": protocol.protocolVersion,
                    "io.modelcontextprotocol/clientCapabilities": {},
                    "io.modelcontextprotocol/logLevel": "warning"
                  }
                }
              }, {
                "MCP-Protocol-Version": protocol.protocolVersion,
                "Mcp-Method": "tools/call",
                "Mcp-Name": "EmitLogs"
              })
              const originatingStream = makeMcpSseReader(result)
              yield* Effect.addFinalizer(() => originatingStream.cancel)
              assert.deepInclude(yield* originatingStream.take(), {
                method: "notifications/message",
                params: { level: "error", data: "private-log" }
              })
              const completed = yield* originatingStream.take()
              assert.deepInclude(completed, { id: "originating-request" })
              assert.property(completed, "result")
              assert.deepStrictEqual(yield* originatingStream.drain(), [])
            }
            // Delivery is acknowledged before publishing the sentinel, so no timing window is needed.
            yield* server.notifications["notifications/tools/list_changed"]({})
            assert.strictEqual((yield* stream.take()).method, "notifications/tools/list_changed")
          }))
      }

      // https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/logging#capabilities
      it.effect("should advertise logging when request-scoped log filtering is supported", () =>
        Effect.gen(function*() {
          const test = yield* McpConformance
          const discovered = yield* test.initialize({ server: "features" })

          assert.property(discovered.message.result.capabilities, "logging")
        }))

      // https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/logging#log-levels
      it.effect("should apply every specified log level to the request that declares it", () =>
        Effect.forEach(levels, (level) =>
          Effect.gen(function*() {
            const { response, test } = yield* callLogLevelTool(level)
            const result = yield* test.decodeResult(response).pipe(
              Effect.flatMap((message) => Schema.decodeUnknownEffect(McpSchema.CallToolResult)(message.result))
            )
            assert.deepStrictEqual(result.content, [{ type: "text", text: JSON.stringify(effectLevels[level]) }])
          }), { concurrency: 1 }))

      // https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/logging#log-levels
      it.effect("should reject a request when its request-scoped log level is unknown", () =>
        Effect.gen(function*() {
          const { response, test } = yield* callLogLevelTool("verbose")
          const error = yield* test.decodeError(response)

          assert.strictEqual(error.error.code, McpSchema.INVALID_PARAMS_ERROR_CODE)
        }))

      // https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/logging#log-message-notifications
      it.effect("should preserve the level, logger, and JSON data when decoding a log notification", () =>
        Effect.gen(function*() {
          const payload = yield* Schema.decodeUnknownEffect(
            McpSchema.LoggingMessageNotification.payloadSchema
          )({
            level: "warning",
            logger: "database",
            data: { message: "slow query", durationMs: 120 }
          })

          assert.deepStrictEqual(payload, {
            level: "warning",
            logger: "database",
            data: { message: "slow query", durationMs: 120 }
          })
        }))
    })
  })
