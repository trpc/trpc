import { assert, describe, it } from "@effect/vitest"
import type * as McpProtocol from "effect/ai/McpProtocol"
import * as McpSchema from "effect/ai/McpSchema"
import * as McpServer from "effect/ai/McpServer"
import * as Context from "effect/Context"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import { initializeHttpSession, makeHttpHarness } from "../TestUtils/McpHttpHarness.ts"
import { makeMcpSseReader } from "../TestUtils/McpHttpResponse.ts"
import { makeServerLayer } from "../TestUtils/McpServerLayer.ts"
import { makeMcpStdioHarness } from "../TestUtils/McpStdioHarness.ts"
import { McpConformance, type McpConformanceLayer } from "./McpConformance.ts"

export const suite = (protocol: McpProtocol.ProtocolAdapter, layer: McpConformanceLayer) =>
  it.layer(layer)(`Mcp Conformance (${protocol.protocolVersion})`, (it) => {
    describe("Utilities", () => {
      describe("Ping", () => {
        // https://modelcontextprotocol.io/specification/2025-06-18/basic/utilities/ping
        it.effect("MUST respond to a client ping with an empty result", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const initialized = yield* test.initialize()
            yield* test.notifyInitialized(initialized)

            const response = yield* test.ping(initialized, { id: 42 })
            const message = yield* test.decodeResult(response)

            assert.strictEqual(response.status, 200)
            assert.strictEqual(message.id, 42)
            assert.deepStrictEqual(message.result, {})
          }))
      })

      describe("Cancellation", () => {
        // https://modelcontextprotocol.io/specification/2025-06-18/basic/utilities/cancellation
        it.effect("MUST not send a response to a cancellation notification", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const initialized = yield* test.initialize()
            yield* test.notifyInitialized(initialized)

            const response = yield* test.send(initialized, {
              jsonrpc: "2.0",
              method: "notifications/cancelled",
              params: {
                requestId: "unknown-request",
                reason: "No longer needed"
              }
            })

            assert.strictEqual(response.status, 202)
            assert.strictEqual(yield* Effect.promise(() => response.text()), "")
          }))
        it.effect("SHOULD stop work and suppress the response after cancellation", () =>
          Effect.gen(function*() {
            const entered = yield* Deferred.make<void>()
            const release = yield* Deferred.make<void>()
            const interrupted = yield* Deferred.make<void>()
            yield* Effect.addFinalizer(() => Deferred.succeed(release, void 0))
            const fixture = yield* makeMcpStdioHarness(protocol)
            const cancelledRequestId = "cancelled-tool-call"
            const pingRequestId = "post-cancellation-ping"

            yield* fixture.server.addTool({
              tool: new McpSchema.Tool({
                name: "GatedTool",
                inputSchema: { type: "object", properties: {} }
              }),
              annotations: Context.empty(),
              handle: () =>
                Deferred.succeed(entered, void 0).pipe(
                  Effect.andThen(Deferred.await(release)),
                  Effect.onInterrupt(() => Deferred.succeed(interrupted, void 0)),
                  Effect.as(
                    new McpSchema.CallToolResult({
                      content: [{ type: "text", text: "released" }]
                    })
                  )
                )
            })

            yield* fixture.initialize()
            yield* fixture.sendRaw({
              jsonrpc: "2.0",
              id: cancelledRequestId,
              method: "tools/call",
              params: { name: "GatedTool", arguments: {} }
            })
            yield* Deferred.await(entered)
            yield* fixture.sendNotification("notifications/cancelled", {
              requestId: cancelledRequestId,
              reason: "No longer needed"
            })
            yield* Deferred.await(interrupted)
            yield* fixture.sendRaw({
              jsonrpc: "2.0",
              id: pingRequestId,
              method: "ping"
            })

            while (true) {
              const message = yield* fixture.takeMessage
              assert.notStrictEqual(message.id, cancelledRequestId)
              if (message.id === pingRequestId) {
                assert.deepStrictEqual(message.result, {})
                break
              }
            }
          }))
        it.effect("SHOULD ignore cancellation for an unknown request identifier", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const initialized = yield* test.initialize()
            yield* test.notifyInitialized(initialized)

            const response = yield* test.send(initialized, {
              jsonrpc: "2.0",
              method: "notifications/cancelled",
              params: { requestId: 999 }
            })

            assert.strictEqual(response.status, 202)
            assert.strictEqual(yield* Effect.promise(() => response.text()), "")
          }))
        it.effect("SHOULD allow a later request to reuse an unknown cancelled identifier", () =>
          Effect.gen(function*() {
            const fixture = yield* makeMcpStdioHarness(protocol)
            yield* fixture.initialize()
            yield* fixture.sendNotification("notifications/cancelled", {
              requestId: "reused-id"
            })

            const reused = yield* fixture.sendRequest("ping", undefined, "reused-id").pipe(Effect.forkChild)
            yield* Effect.yieldNow
            const control = yield* fixture.sendRequest("ping", undefined, "control-id")
            assert.deepStrictEqual(control.result, {})
            yield* Effect.yieldNow

            const reusedExit = reused.pollUnsafe()
            assert(reusedExit !== undefined && Exit.isSuccess(reusedExit))
            assert.deepStrictEqual(reusedExit.value.result, {})
          }))
        it.effect("SHOULD ignore cancellation for an already completed request identifier", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const initialized = yield* test.initialize()
            yield* test.notifyInitialized(initialized)
            yield* test.ping(initialized, { id: 11 })

            const response = yield* test.send(initialized, {
              jsonrpc: "2.0",
              method: "notifications/cancelled",
              params: { requestId: 11 }
            })

            assert.strictEqual(response.status, 202)
            assert.strictEqual(yield* Effect.promise(() => response.text()), "")
          }))
      })

      describe("Progress", () => {
        // https://modelcontextprotocol.io/specification/2025-06-18/basic/utilities/progress
        // NOTE: Smoke test only. The client capability accepts this one-way notification,
        // but McpServer does not expose an observer for its decoded payload.
        it.effect("MUST accept string progress tokens", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const initialized = yield* test.initialize()
            yield* test.notifyInitialized(initialized)

            const response = yield* test.send(initialized, {
              jsonrpc: "2.0",
              method: "notifications/progress",
              params: {
                progressToken: "task-1",
                progress: 1
              }
            })

            assert.strictEqual(response.status, 202)
            assert.strictEqual(yield* Effect.promise(() => response.text()), "")
          }))
        // NOTE: Smoke test only. The client capability accepts this one-way notification,
        // but McpServer does not expose an observer for its decoded payload.
        it.effect("MUST accept numeric progress tokens", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const initialized = yield* test.initialize()
            yield* test.notifyInitialized(initialized)

            const response = yield* test.send(initialized, {
              jsonrpc: "2.0",
              method: "notifications/progress",
              params: {
                progressToken: 12,
                progress: 1
              }
            })

            assert.strictEqual(response.status, 202)
            assert.strictEqual(yield* Effect.promise(() => response.text()), "")
          }))
        // NOTE: Smoke test only. The client capability accepts this one-way notification,
        // but McpServer does not expose an observer for its decoded payload.
        it.effect("SCHEMA accepts the optional total", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const initialized = yield* test.initialize()
            yield* test.notifyInitialized(initialized)

            const response = yield* test.send(initialized, {
              jsonrpc: "2.0",
              method: "notifications/progress",
              params: {
                progressToken: "task-with-total",
                progress: 1,
                total: 2
              }
            })

            assert.strictEqual(response.status, 202)
            assert.strictEqual(yield* Effect.promise(() => response.text()), "")
          }))
      })
    })
  })

export const statelessModernSuite = (
  protocol: McpProtocol.ProtocolAdapter,
  layer: McpConformanceLayer
) =>
  it.layer(layer)(`Mcp Conformance (${protocol.protocolVersion})`, (it) => {
    describe("Utilities > Stateless modern", () => {
      describe("Cancellation", () => {
        // https://modelcontextprotocol.io/specification/2026-07-28/basic/utilities/cancellation
        it.effect("should send no response when a cancellation notification is received", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const discovered = yield* test.initialize()
            const response = yield* test.send(discovered, {
              jsonrpc: "2.0",
              method: "notifications/cancelled",
              params: { requestId: "unknown-request", reason: "No longer needed" }
            })

            assert.strictEqual(response.status, 202)
            assert.strictEqual(yield* Effect.promise(() => response.text()), "")
          }))

        // https://modelcontextprotocol.io/specification/2026-07-28/basic/utilities/cancellation
        it.effect("should interrupt work and suppress its response when an active request is cancelled", () =>
          Effect.gen(function*() {
            const entered = yield* Deferred.make<void>()
            const release = yield* Deferred.make<void>()
            const interrupted = yield* Deferred.make<void>()
            yield* Effect.addFinalizer(() => Deferred.succeed(release, void 0))
            const fixture = yield* makeMcpStdioHarness(protocol)
            const cancelledRequestId = "cancelled-tool-call"

            yield* fixture.server.addTool({
              tool: new McpSchema.Tool({
                name: "ModernGatedTool",
                inputSchema: { type: "object", properties: {} }
              }),
              annotations: Context.empty(),
              handle: () =>
                Deferred.succeed(entered, void 0).pipe(
                  Effect.andThen(Deferred.await(release)),
                  Effect.onInterrupt(() => Deferred.succeed(interrupted, void 0)),
                  Effect.as(new McpSchema.CallToolResult({ content: [{ type: "text", text: "released" }] }))
                )
            })

            yield* fixture.initialize()
            yield* fixture.startRequest("tools/call", {
              name: "ModernGatedTool",
              arguments: {}
            }, cancelledRequestId)
            yield* Deferred.await(entered)
            yield* fixture.sendNotification("notifications/cancelled", {
              requestId: cancelledRequestId,
              reason: "No longer needed"
            })
            yield* Deferred.await(interrupted)

            const control = yield* fixture.sendRequest("server/discover", {}, "post-cancellation-discover")
            assert.strictEqual(control.id, "post-cancellation-discover")
          }))

        // https://modelcontextprotocol.io/specification/2026-07-28/basic/utilities/cancellation
        it.effect("should allow a later request to reuse an identifier cancelled before it was active", () =>
          Effect.gen(function*() {
            const fixture = yield* makeMcpStdioHarness(protocol)
            yield* fixture.initialize()
            yield* fixture.sendNotification("notifications/cancelled", { requestId: "reused-id" })

            const reused = yield* fixture.sendRequest("server/discover", {}, "reused-id")
            assert.strictEqual(reused.id, "reused-id")
            assert.property(reused, "result")
          }))
      })
    })
  })

export const statefulLegacySuite = (protocol: McpProtocol.ProtocolAdapter, layer: McpConformanceLayer) =>
  it.layer(layer, { excludeTestServices: true })(`Mcp Conformance (${protocol.protocolVersion})`, (it) => {
    if (protocol.runtime.transport.jsonRpc.acceptsBatches) {
      describe("Utilities > Cancellation > STDIO", () => {
        // Cancellation recipients SHOULD stop work and not send the cancelled request's response.
        // Batch-capable transports must still deliver the remaining requests' responses.
        // https://modelcontextprotocol.io/specification/2025-03-26/basic/utilities/cancellation#behavior-requirements
        // https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#stdio
        it.effect("should preserve the remaining batch result when a sibling STDIO request is cancelled", () =>
          Effect.gen(function*() {
            const entered = yield* Deferred.make<void>()
            const interrupted = yield* Deferred.make<void>()
            const fixture = yield* makeMcpStdioHarness(protocol)
            yield* fixture.server.addTool({
              tool: new McpSchema.Tool({ name: "Wait", inputSchema: { type: "object" } }),
              annotations: Context.empty(),
              handle: () =>
                Deferred.succeed(entered, void 0).pipe(
                  Effect.andThen(Effect.never),
                  Effect.onInterrupt(() => Deferred.succeed(interrupted, void 0))
                )
            })
            yield* fixture.initialize()
            yield* fixture.takeFrame
            yield* fixture.sendRaw([
              { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "Wait" } },
              { jsonrpc: "2.0", id: "1", method: "ping" }
            ])
            yield* Deferred.await(entered)
            yield* fixture.sendNotification("notifications/cancelled", { requestId: 1 })
            yield* Deferred.await(interrupted)
            const response = yield* fixture.takeFrame.pipe(Effect.timeout("1 second"))
            assert.deepStrictEqual([response].flat(), [{ jsonrpc: "2.0", id: "1", result: {} }])
          }))
      })
    }
    describe("Utilities > Cancellation > HTTP", () => {
      const serverLayer = makeServerLayer({ name: "HttpCancellation", protocols: [protocol] })
      // https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/cancellation
      it.effect("should cancel only the owning request when HTTP sessions reuse a request ID", () =>
        Effect.gen(function*() {
          const interrupted = yield* Deferred.make<void>()
          const otherInterrupted = yield* Deferred.make<void>()
          const releaseOther = yield* Deferred.make<void>()
          const registration = Layer.effectDiscard(Effect.gen(function*() {
            const server = yield* McpServer.McpServer
            for (const name of ["Wait", "Keep"] as const) {
              yield* server.addTool({
                tool: new McpSchema.Tool({ name, inputSchema: { type: "object" } }),
                annotations: Context.empty(),
                handle: () =>
                  server.notifications["notifications/message"]({ level: "error", data: name }).pipe(
                    Effect.andThen(name === "Wait" ? Effect.never : Deferred.await(releaseOther)),
                    Effect.onInterrupt(() =>
                      Deferred.succeed(name === "Wait" ? interrupted : otherInterrupted, void 0)
                    ),
                    Effect.as(new McpSchema.CallToolResult({ content: [{ type: "text", text: "kept" }] }))
                  )
              })
            }
          }))
          const harness = yield* makeHttpHarness(registration.pipe(Layer.provideMerge(serverLayer)))
          const otherHeaders = yield* initializeHttpSession(harness, protocol)
          const otherResponse = yield* harness.post({
            jsonrpc: "2.0",
            id: "wait",
            method: "tools/call",
            params: { name: "Keep", arguments: {} }
          }, otherHeaders)
          const otherStream = makeMcpSseReader(otherResponse)
          yield* Effect.addFinalizer(() => otherStream.cancel)
          assert.strictEqual((yield* otherStream.take()).method, "notifications/message")
          const headers = yield* initializeHttpSession(harness, protocol)
          const response = yield* harness.post({
            jsonrpc: "2.0",
            id: "wait",
            method: "tools/call",
            params: { name: "Wait", arguments: {} }
          }, headers)
          const stream = makeMcpSseReader(response)
          yield* Effect.addFinalizer(() => stream.cancel)
          assert.strictEqual((yield* stream.take()).method, "notifications/message")
          const cancelled = yield* harness.post({
            jsonrpc: "2.0",
            method: "notifications/cancelled",
            params: { requestId: "wait" }
          }, headers)
          assert.strictEqual(cancelled.status, 202)
          yield* Deferred.await(interrupted).pipe(Effect.timeout("1 second"))
          assert.deepStrictEqual(yield* stream.drain().pipe(Effect.timeout("1 second")), [])
          yield* Deferred.succeed(releaseOther, void 0)
          assert.deepStrictEqual(yield* otherStream.drain().pipe(Effect.timeout("1 second")), [{
            jsonrpc: "2.0",
            id: "wait",
            result: { content: [{ type: "text", text: "kept" }] }
          }])
          assert.isFalse(yield* Deferred.isDone(otherInterrupted))
        }))

      it.effect("should close without a reply when a tool is cancelled before emitting HTTP output", () =>
        Effect.gen(function*() {
          const entered = yield* Deferred.make<void>()
          const interrupted = yield* Deferred.make<void>()
          const registration = Layer.effectDiscard(McpServer.McpServer.use((server) =>
            server.addTool({
              tool: new McpSchema.Tool({ name: "Wait", inputSchema: { type: "object" } }),
              annotations: Context.empty(),
              handle: () =>
                Deferred.succeed(entered, void 0).pipe(
                  Effect.andThen(Effect.never),
                  Effect.onInterrupt(() => Deferred.succeed(interrupted, void 0))
                )
            })
          ))
          const harness = yield* makeHttpHarness(registration.pipe(Layer.provideMerge(serverLayer)))
          const headers = yield* initializeHttpSession(harness, protocol)
          const pending = yield* harness.post({
            jsonrpc: "2.0",
            id: "wait",
            method: "tools/call",
            params: { name: "Wait", arguments: {} }
          }, headers).pipe(Effect.forkChild)
          yield* Deferred.await(entered)
          const cancelled = yield* harness.post({
            jsonrpc: "2.0",
            method: "notifications/cancelled",
            params: { requestId: "wait" }
          }, headers)
          assert.strictEqual(cancelled.status, 202)
          yield* Deferred.await(interrupted).pipe(Effect.timeout("1 second"))
          const response = yield* Fiber.join(pending).pipe(Effect.timeout("1 second"))
          assert.strictEqual(yield* Effect.promise(() => response.text()), "")
        }))

      if (protocol.runtime.transport.jsonRpc.acceptsBatches) {
        // https://modelcontextprotocol.io/specification/2025-03-26/basic/utilities/cancellation
        // https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#sending-messages-to-the-server
        for (const cancelled of ["one", "all"] as const) {
          it.effect(`should omit cancelled replies and preserve remaining results when cancellation affects ${cancelled} of the batch requests`, () =>
            Effect.gen(function*() {
              const release = yield* Deferred.make<void>()
              const interrupted = yield* Deferred.make<void>()
              const otherInterrupted = yield* Deferred.make<void>()
              const registration = Layer.effectDiscard(Effect.gen(function*() {
                const server = yield* McpServer.McpServer
                for (const name of ["Cancel", "Keep"] as const) {
                  yield* server.addTool({
                    tool: new McpSchema.Tool({ name, inputSchema: { type: "object" } }),
                    annotations: Context.empty(),
                    handle: () =>
                      server.notifications["notifications/message"]({ level: "error", data: name }).pipe(
                        Effect.andThen(name === "Cancel" ? Effect.never : Deferred.await(release)),
                        Effect.onInterrupt(() =>
                          Deferred.succeed(name === "Cancel" ? interrupted : otherInterrupted, void 0)
                        ),
                        Effect.as(new McpSchema.CallToolResult({ content: [{ type: "text", text: name }] }))
                      )
                  })
                }
              }))
              const harness = yield* makeHttpHarness(registration.pipe(Layer.provideMerge(
                makeServerLayer({ name: "BatchCancellation", protocols: [protocol] })
              )))
              const headers = yield* initializeHttpSession(harness, protocol)
              const response = yield* harness.post(
                ["Cancel", "Keep"].map((name) => ({
                  jsonrpc: "2.0",
                  id: name === "Cancel" ? 1 : "1",
                  method: "tools/call",
                  params: { name, arguments: {} }
                })),
                headers
              )
              const stream = makeMcpSseReader(response)
              yield* Effect.addFinalizer(() => stream.cancel)
              assert.strictEqual((yield* stream.take()).method, "notifications/message")
              assert.strictEqual((yield* stream.take()).method, "notifications/message")
              yield* harness.post(
                { jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 1 } },
                headers
              )
              yield* Deferred.await(interrupted).pipe(Effect.timeout("1 second"))
              assert.isFalse(yield* Deferred.isDone(otherInterrupted))
              if (cancelled === "all") {
                yield* harness.post(
                  { jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: "1" } },
                  headers
                )
                yield* Deferred.await(otherInterrupted).pipe(Effect.timeout("1 second"))
              } else {
                yield* Deferred.succeed(release, void 0)
              }
              const messages = yield* stream.drain().pipe(Effect.timeout("1 second"))
              assert.deepStrictEqual(
                messages.flat(),
                cancelled === "all" ? [] : [{
                  jsonrpc: "2.0",
                  id: "1",
                  result: { content: [{ type: "text", text: "Keep" }] }
                }]
              )
              assert.strictEqual(yield* Deferred.isDone(otherInterrupted), cancelled === "all")
            }))
        }
      }
    })
  })
