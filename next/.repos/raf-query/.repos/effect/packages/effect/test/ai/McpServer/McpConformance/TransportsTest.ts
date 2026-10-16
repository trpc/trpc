import { assert, describe, it } from "@effect/vitest"
import type * as McpProtocol from "effect/ai/McpProtocol"
import * as McpSchema from "effect/ai/McpSchema"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import { MCP_ENDPOINT } from "../TestUtils/McpHttpHarness.ts"
import { makeMcpStdioHarness } from "../TestUtils/McpStdioHarness.ts"
import { McpConformance, type McpConformanceLayer } from "./McpConformance.ts"

const jsonRequest = (method: string, body?: unknown, headers?: HeadersInit) => {
  const requestHeaders = new Headers({
    accept: "application/json, text/event-stream",
    "content-type": "application/json"
  })
  new Headers(headers).forEach((value, name) => requestHeaders.set(name, value))
  return new Request(MCP_ENDPOINT, {
    method,
    headers: requestHeaders,
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  })
}

const httpTransportSuiteName = (protocol: McpProtocol.ProtocolAdapter) =>
  protocol.protocolVersion === "2024-11-05"
    ? "Single-endpoint HTTP compatibility extension"
    : "Streamable HTTP"

export const suite = (protocol: McpProtocol.ProtocolAdapter, layer: McpConformanceLayer) =>
  it.layer(layer)(`Mcp Conformance (${protocol.protocolVersion})`, (it) => {
    describe("Transports", () => {
      // https://modelcontextprotocol.io/specification/2024-11-05/basic/transports
      // https://modelcontextprotocol.io/specification/2025-03-26/basic/transports
      // https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
      describe("stdio", () => {
        it.effect("MUST exchange compact UTF-8 newline-delimited JSON-RPC records", () =>
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
            const frame = yield* fixture.takeRawStdout
            assert.strictEqual(frame.endsWith("\n"), true)
            assert.strictEqual(frame.slice(0, -1).includes("\n"), false)
            const message = JSON.parse(frame)
            assert.deepInclude(message, { jsonrpc: "2.0", id: 1 })
            assert.property(message, "result")
          }))

        it.effect("SCENARIO parses UTF-8 JSON-RPC records split across input chunks", () =>
          Effect.gen(function*() {
            const fixture = yield* makeMcpStdioHarness(protocol)
            const bytes = new TextEncoder().encode(`${
              JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "initialize",
                params: {
                  protocolVersion: protocol.protocolVersion,
                  capabilities: {},
                  clientInfo: { name: "stdio-🧪", version: "1.0.0" }
                }
              })
            }\n`)
            const splitAt = bytes.indexOf(0xf0) + 2

            yield* fixture.sendChunk(bytes.slice(0, splitAt))
            yield* fixture.sendChunk(bytes.slice(splitAt))

            assert.deepInclude(yield* fixture.takeFrame, {
              jsonrpc: "2.0",
              id: 1
            })
          }))

        it.effect("SCENARIO processes consecutive stdio messages independently", () =>
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
            yield* fixture.sendRaw({ jsonrpc: "2.0", id: 2, method: "ping", params: {} })
            yield* fixture.sendRaw({ jsonrpc: "2.0", id: 3, method: "ping", params: {} })
            assert.deepStrictEqual(yield* fixture.takeFrame, {
              jsonrpc: "2.0",
              id: 2,
              result: {}
            })
            assert.deepStrictEqual(yield* fixture.takeFrame, {
              jsonrpc: "2.0",
              id: 3,
              result: {}
            })
          }))

        it.effect.skipIf(["2025-03-26"].includes(protocol.protocolVersion))(
          "MUST reject JSON-RPC batches over stdio",
          () =>
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
              assert.deepStrictEqual(yield* fixture.takeFrame, {
                jsonrpc: "2.0",
                id: null,
                error: {
                  code: McpSchema.INVALID_REQUEST_ERROR_CODE,
                  message: "JSON-RPC batches are not supported"
                }
              })
            })
        )

        it.effect("MUST shut down when the client closes stdin", () =>
          Effect.gen(function*() {
            const fixture = yield* makeMcpStdioHarness(protocol)
            yield* fixture.close
            const exit = yield* Fiber.await(fixture.serverFiber)
            assert.isTrue(
              Exit.isSuccess(exit) ||
                (Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause))
            )
          }))
      })

      describe(httpTransportSuiteName(protocol), () => {
        describe("Sending Messages to the Server", () => {
          it.effect.skipIf(["2024-11-05", "2025-03-26"].includes(protocol.protocolVersion))(
            "MUST reject JSON-RPC batches",
            () =>
              Effect.gen(function*() {
                const test = yield* McpConformance
                const response = yield* test.post([test.initializeRequest()])

                assert.isAtLeast(response.status, 400)
              })
          )

          it.effect("MUST accept JSON-RPC requests through POST on the MCP endpoint", () =>
            Effect.gen(function*() {
              const test = yield* McpConformance
              const response = yield* test.post(test.initializeRequest())

              assert.strictEqual(response.status, 200)
            }))

          it.effect("MUST accept JSON-RPC notifications through POST on the MCP endpoint", () =>
            Effect.gen(function*() {
              const test = yield* McpConformance
              const initialized = yield* test.initialize()
              const response = yield* test.notifyInitialized(initialized)

              assert.strictEqual(response.status, 202)
              assert.strictEqual(yield* Effect.promise(() => response.text()), "")
            }))

          it.effect("MUST accept JSON-RPC responses through POST on the MCP endpoint", () =>
            Effect.gen(function*() {
              const test = yield* McpConformance
              const initialized = yield* test.initialize()
              const response = yield* test.send(initialized, {
                jsonrpc: "2.0",
                id: 99,
                result: {}
              })

              assert.strictEqual(response.status, 202)
              assert.strictEqual(yield* Effect.promise(() => response.text()), "")
            }))

          it.effect.skipIf(["2024-11-05", "2025-03-26"].includes(protocol.protocolVersion))(
            "MUST require the negotiated protocol-version header after initialization",
            () =>
              Effect.gen(function*() {
                const test = yield* McpConformance
                const initialized = yield* test.initialize()
                assert.isNotNull(initialized.sessionId)

                const missing = yield* test.ping(initialized, { includeProtocolVersion: false })
                const mismatched = yield* test.ping(initialized, {
                  id: 3,
                  protocolVersion: protocol.protocolVersion === "2025-11-25" ? "2025-06-18" : "2025-03-26"
                })

                assert.isAtLeast(missing.status, 400)
                assert.isAtLeast(mismatched.status, 400)
              })
          )

          it.effect("MUST require the application/json content type for POST requests", () =>
            Effect.gen(function*() {
              const test = yield* McpConformance
              const accepted = yield* test.request(jsonRequest("POST", test.initializeRequest(), {
                "content-type": "Application/JSON; charset=utf-8"
              }))
              assert.strictEqual(accepted.status, 200)

              for (const contentType of ["text/plain", "application/json-malicious", ""]) {
                const response = yield* test.request(jsonRequest("POST", test.initializeRequest(), {
                  "content-type": contentType
                }))
                assert.strictEqual(response.status, 415)
              }
            }))

          it.effect("MUST require clients to accept application/json and text/event-stream", () =>
            Effect.gen(function*() {
              const test = yield* McpConformance
              const accepted = yield* test.request(jsonRequest("POST", test.initializeRequest(), {
                accept: " Text/Event-Stream; q=0.9, Application/JSON "
              }))
              assert.strictEqual(accepted.status, 200)

              for (
                const accept of [
                  "application/json",
                  "text/event-stream",
                  "*/*",
                  "application/json, text/event-stream; q=0",
                  "application/json, text/event-stream; q=bogus",
                  "application/json, text/event-stream; q=2",
                  "application/json, text/event-stream; q=-1",
                  "application/json-malicious, text/event-stream",
                  ""
                ]
              ) {
                const response = yield* test.request(jsonRequest("POST", test.initializeRequest(), { accept }))
                assert.strictEqual(response.status, 406)
              }
            }))

          it.effect("MUST return application/json for a single JSON-RPC response", () =>
            Effect.gen(function*() {
              const test = yield* McpConformance
              const response = yield* test.post(test.initializeRequest())

              assert.match(response.headers.get("content-type") ?? "", /^application\/json\b/)
            }))
          it.effect("MUST return an empty 202 response for accepted notifications and responses", () =>
            Effect.gen(function*() {
              const test = yield* McpConformance
              const initialized = yield* test.initialize()
              const notification = yield* test.notifyInitialized(initialized)
              const response = yield* test.send(initialized, {
                jsonrpc: "2.0",
                id: 99,
                result: {}
              })

              assert.strictEqual(notification.status, 202)
              assert.strictEqual(yield* Effect.promise(() => notification.text()), "")
              assert.strictEqual(response.status, 202)
              assert.strictEqual(yield* Effect.promise(() => response.text()), "")
            }))

          it.effect("MUST reject unsupported HTTP methods with method not allowed", () =>
            Effect.gen(function*() {
              const test = yield* McpConformance
              for (const method of ["PUT", "PATCH", "HEAD"] as const) {
                const response = yield* test.request(jsonRequest(method))
                assert.strictEqual(response.status, 405)
              }
            }))
        })

        describe("Listening for Messages from the Server", () => {
          it.effect("MUST return method not allowed when GET SSE is not offered", () =>
            Effect.gen(function*() {
              const test = yield* McpConformance
              const response = yield* test.request(jsonRequest("GET"))
              assert.strictEqual(response.status, 405)
              assert.strictEqual(response.headers.get("allow"), "POST")
            }))
        })

        describe("Session Management", () => {
          it.effect("SCENARIO returns an MCP session identifier during initialization", () =>
            Effect.gen(function*() {
              const test = yield* McpConformance
              const initialized = yield* test.initialize()

              assert.isNotNull(initialized.sessionId)
            }))
          it.effect("SCENARIO uses distinct UUIDv4 session identifiers", () =>
            Effect.gen(function*() {
              const test = yield* McpConformance
              const first = yield* test.initialize()
              const second = yield* test.initialize({ id: 2 })
              assert.match(
                first.sessionId ?? "",
                /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
              )
              assert.match(
                second.sessionId ?? "",
                /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
              )
              assert.notStrictEqual(first.sessionId, second.sessionId)
            }))
          it.effect("MUST require the returned session identifier on subsequent HTTP requests", () =>
            Effect.gen(function*() {
              const test = yield* McpConformance
              yield* test.initialize()
              const response = yield* test.request(jsonRequest("POST", test.pingRequest(), {
                "Mcp-Protocol-Version": protocol.protocolVersion
              }))
              assert.strictEqual(response.status, 400)
            }))
          it.effect("MUST reject an unknown session identifier with not found", () =>
            Effect.gen(function*() {
              const test = yield* McpConformance
              const response = yield* test.request(jsonRequest("POST", test.pingRequest(), {
                "Mcp-Protocol-Version": protocol.protocolVersion,
                "Mcp-Session-Id": "unknown-session"
              }))

              assert.strictEqual(response.status, 404)
            }))
          it.effect("SCENARIO declines client session termination without invalidating the session", () =>
            Effect.gen(function*() {
              const test = yield* McpConformance
              const initialized = yield* test.initialize()
              assert.isNotNull(initialized.sessionId)
              const response = yield* test.request(jsonRequest("DELETE", undefined, {
                "Mcp-Protocol-Version": protocol.protocolVersion,
                "Mcp-Session-Id": initialized.sessionId
              }))
              assert.strictEqual(response.status, 405)
              assert.strictEqual(response.headers.get("allow"), "POST")
              assert.strictEqual((yield* test.ping(initialized)).status, 200)
            }))
          it.effect("MUST reject initialize requests carrying a session identifier", () =>
            Effect.gen(function*() {
              const test = yield* McpConformance
              const initialized = yield* test.initialize()
              const repeated = yield* test.send(initialized, test.initializeRequest({ id: 2 }))
              assert.strictEqual(repeated.status, 400)
              const unknown = yield* test.request(jsonRequest("POST", test.initializeRequest({ id: 3 }), {
                "Mcp-Session-Id": "unknown-session"
              }))
              assert.strictEqual(unknown.status, 404)
            }))
          it.effect("SCENARIO keeps two distinct POST sessions live", () =>
            Effect.gen(function*() {
              const test = yield* McpConformance
              const first = yield* test.initialize()
              const second = yield* test.initialize({ id: 2 })
              assert.strictEqual((yield* test.ping(first, { id: 3 })).status, 200)
              assert.strictEqual((yield* test.ping(second, { id: 4 })).status, 200)
            }))
        })

        describe.skipIf(["2024-11-05", "2025-03-26"].includes(protocol.protocolVersion))(
          "Protocol Version Header",
          () => {
            it.effect("MUST apply the revision-specific protocol header requirement", () =>
              Effect.gen(function*() {
                const test = yield* McpConformance
                const initialized = yield* test.initialize()
                const response = yield* test.ping(initialized, {
                  includeProtocolVersion: false
                })
                assert.strictEqual(response.status, 400)
              }))
            it.effect("MUST accept the negotiated protocol version", () =>
              Effect.gen(function*() {
                const test = yield* McpConformance
                const initialized = yield* test.initialize()
                const response = yield* test.ping(initialized, {
                  includeProtocolVersion: true,
                  protocolVersion: protocol.protocolVersion
                })
                assert.strictEqual(response.status, 200)
              }))
            it.effect("MUST reject an unsupported protocol version with bad request", () =>
              Effect.gen(function*() {
                const test = yield* McpConformance
                const initialized = yield* test.initialize()
                const response = yield* test.ping(initialized, {
                  includeProtocolVersion: true,
                  protocolVersion: "2099-01-01"
                })
                assert.strictEqual(response.status, 400)
              }))
            it.effect("SCENARIO replays the selected protocol version on HTTP responses", () =>
              Effect.gen(function*() {
                const test = yield* McpConformance
                const initialized = yield* test.initialize()
                assert.strictEqual(
                  initialized.response.headers.get("Mcp-Protocol-Version"),
                  protocol.protocolVersion
                )
                const response = yield* test.ping(initialized, { includeProtocolVersion: true })
                assert.strictEqual(response.headers.get("Mcp-Protocol-Version"), protocol.protocolVersion)
              }))
          }
        )

        describe("Security", () => {
          it.effect("MUST validate the Origin header before every MCP route", () =>
            Effect.gen(function*() {
              const test = yield* McpConformance
              assert.strictEqual((yield* test.post(test.initializeRequest())).status, 200)
              assert.strictEqual(
                (yield* test.request(jsonRequest("POST", test.initializeRequest({ id: 2 }), {
                  origin: "https://allowed.example"
                }))).status,
                200
              )
              for (const method of ["POST", "GET", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const) {
                const response = yield* test.request(jsonRequest(
                  method,
                  method === "POST" ? test.initializeRequest({ id: 3 }) : undefined,
                  { origin: "https://attacker.example" }
                ))
                assert.strictEqual(response.status, 403)
              }
            }))
        })
      })
    })
  })

export const statelessModernSuite = (
  protocol: McpProtocol.ProtocolAdapter,
  layer: McpConformanceLayer
) =>
  it.layer(layer)(`Mcp Conformance (${protocol.protocolVersion})`, (it) => {
    const metadata = {
      "io.modelcontextprotocol/protocolVersion": protocol.protocolVersion,
      "io.modelcontextprotocol/clientCapabilities": {},
      "io.modelcontextprotocol/clientInfo": { name: "transport-client", version: "1.0.0" }
    }
    const request = (id: string | number, method = "server/discover") => ({
      jsonrpc: "2.0",
      id,
      method,
      params: { _meta: metadata }
    })
    const headers = (method = "server/discover"): HeadersInit => ({
      "MCP-Protocol-Version": protocol.protocolVersion,
      "Mcp-Method": method
    })

    describe("Transports > Stateless modern", () => {
      // https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/stdio
      it.effect("should exchange one compact newline-delimited JSON-RPC message per stdio line", () =>
        Effect.gen(function*() {
          const fixture = yield* makeMcpStdioHarness(protocol)
          const response = yield* fixture.sendRequest("server/discover", {}, 1).pipe(Effect.forkChild)
          const frame = yield* fixture.takeRawStdout

          assert.strictEqual(frame.endsWith("\n"), true)
          assert.strictEqual(frame.slice(0, -1).includes("\n"), false)
          assert.deepInclude(JSON.parse(frame), { jsonrpc: "2.0", id: 1 })
          yield* Fiber.join(response)
        }))

      // https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/stdio
      it.effect("should reconstruct a UTF-8 stdio message when its bytes arrive in separate chunks", () =>
        Effect.gen(function*() {
          const fixture = yield* makeMcpStdioHarness(protocol)
          const bytes = new TextEncoder().encode(`${JSON.stringify(request("stdio-🧪"))}\n`)
          const splitAt = bytes.indexOf(0xf0) + 2

          yield* fixture.sendChunk(bytes.slice(0, splitAt))
          yield* fixture.sendChunk(bytes.slice(splitAt))

          assert.deepInclude(yield* fixture.takeFrame, { jsonrpc: "2.0", id: "stdio-🧪" })
        }))

      // https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/stdio
      it.effect("should process consecutive stateless stdio requests independently", () =>
        Effect.gen(function*() {
          const fixture = yield* makeMcpStdioHarness(protocol)
          yield* fixture.sendRaw(request(2))
          yield* fixture.sendRaw(request(3))

          assert.deepInclude(yield* fixture.takeFrame, { jsonrpc: "2.0", id: 2 })
          assert.deepInclude(yield* fixture.takeFrame, { jsonrpc: "2.0", id: 3 })
        }))

      // https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/stdio
      it.effect("should shut down the stdio server when the client closes stdin", () =>
        Effect.gen(function*() {
          const fixture = yield* makeMcpStdioHarness(protocol)
          yield* fixture.close
          const exit = yield* Fiber.await(fixture.serverFiber)

          assert.isTrue(Exit.isSuccess(exit) || (Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)))
        }))

      // MethodNotFound also covers unadvertised capabilities, and modern HTTP maps it to 404.
      // https://modelcontextprotocol.io/specification/2026-07-28/schema#methodnotfounderror
      // https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#protocol-version-header
      it.effect("should return HTTP 404 when a request needs an unavailable server capability", () =>
        Effect.gen(function*() {
          const test = yield* McpConformance
          const discovered = yield* test.initialize()
          assert.isUndefined(discovered.message.result.capabilities.prompts)

          const response = yield* test.post(request("unavailable", "prompts/list"), headers("prompts/list"))
          const error = yield* test.decodeError(response)
          assert.strictEqual(error.id, "unavailable")
          assert.strictEqual(error.error.code, McpSchema.METHOD_NOT_FOUND_ERROR_CODE)
          assert.strictEqual(response.status, 404)
        }))

      // https://modelcontextprotocol.io/specification/2026-07-28/basic/transports#sending-messages-to-the-server
      it.effect("should require application/json content and both supported response media types for HTTP POST", () =>
        Effect.gen(function*() {
          const test = yield* McpConformance
          const body = request(4)
          const accepted = yield* test.request(jsonRequest("POST", body, {
            ...headers(),
            "content-type": "Application/JSON; charset=utf-8",
            accept: "Text/Event-Stream, Application/JSON"
          }))
          assert.strictEqual(accepted.status, 200)

          for (const contentType of ["text/plain", "application/json-malicious", ""]) {
            const response = yield* test.request(jsonRequest("POST", body, {
              ...headers(),
              "content-type": contentType
            }))
            assert.strictEqual(response.status, 415)
          }
          for (const accept of ["application/json", "text/event-stream", "*/*", ""]) {
            const response = yield* test.request(jsonRequest("POST", body, { ...headers(), accept }))
            assert.strictEqual(response.status, 406)
          }
        }))

      // https://modelcontextprotocol.io/specification/2026-07-28/basic/transports#sending-messages-to-the-server
      it.effect("should return application/json when an HTTP request has one JSON-RPC response", () =>
        Effect.gen(function*() {
          const test = yield* McpConformance
          const response = yield* test.request(jsonRequest("POST", request(5), headers()))

          assert.strictEqual(response.status, 200)
          assert.match(response.headers.get("content-type") ?? "", /^application\/json\b/)
        }))

      // https://modelcontextprotocol.io/specification/2026-07-28/basic/transports#listening-for-messages-from-the-server
      it.effect("should reject GET and unsupported HTTP methods when only POST is available", () =>
        Effect.gen(function*() {
          const test = yield* McpConformance
          for (const method of ["GET", "PUT", "PATCH", "HEAD"] as const) {
            const response = yield* test.request(jsonRequest(method))
            assert.strictEqual(response.status, 405)
            assert.strictEqual(response.headers.get("allow"), "POST")
          }
        }))

      // https://modelcontextprotocol.io/specification/2026-07-28/basic/transports#security-warning
      it.effect("should reject every MCP HTTP route when its Origin is not explicitly allowed", () =>
        Effect.gen(function*() {
          const test = yield* McpConformance
          for (const method of ["POST", "GET", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const) {
            const response = yield* test.request(jsonRequest(
              method,
              method === "POST" ? request(6) : undefined,
              { ...headers(), origin: "https://attacker.example" }
            ))
            assert.strictEqual(response.status, 403)
          }
        }))
    })
  })
