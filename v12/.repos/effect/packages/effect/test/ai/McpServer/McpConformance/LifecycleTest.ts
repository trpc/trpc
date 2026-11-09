import { assert, describe, it } from "@effect/vitest"
import type * as McpProtocol from "effect/ai/McpProtocol"
import * as McpSchema from "effect/ai/McpSchema"
import * as Effect from "effect/Effect"
import { McpConformance, type McpConformanceLayer } from "./McpConformance.ts"

export const suite = (
  protocol: McpProtocol.ProtocolAdapter,
  layer: McpConformanceLayer
) =>
  it.layer(layer)(`Mcp Conformance (${protocol.protocolVersion})`, (it) => {
    describe("Lifecycle", () => {
      // Shared lifecycle behavior. Dated transport requirements stay in the
      // version entrypoints that compose this suite.
      describe("Lifecycle Phases", () => {
        describe("Initialization", () => {
          it.effect("returns configured server instructions", () =>
            Effect.gen(function*() {
              const test = yield* McpConformance
              const { message } = yield* test.initialize({ server: "features" })

              assert.strictEqual(message.result.instructions, "Follow the test server instructions.")
            }))

          it.effect("MUST reject non-ping requests before initialize", () =>
            Effect.gen(function*() {
              const test = yield* McpConformance
              const response = yield* test.post({
                jsonrpc: "2.0",
                id: 1,
                method: "tools/list",
                params: {}
              })

              assert.strictEqual(response.status, 400)
            }))

          it.effect("MUST reject initialized notifications before initialize", () =>
            Effect.gen(function*() {
              const test = yield* McpConformance
              const response = yield* test.post(test.initializedNotification)

              assert.strictEqual(response.status, 400)
            }))

          it.effect("SCHEMA requires protocolVersion, capabilities, and clientInfo", () =>
            Effect.gen(function*() {
              const test = yield* McpConformance
              const invalidParams = [
                {
                  capabilities: {},
                  clientInfo: { name: "McpConformanceClient", version: "1.0.0" }
                },
                {
                  protocolVersion: protocol.protocolVersion,
                  clientInfo: { name: "McpConformanceClient", version: "1.0.0" }
                },
                {
                  protocolVersion: protocol.protocolVersion,
                  capabilities: {}
                }
              ]

              for (const [index, params] of invalidParams.entries()) {
                const response = yield* test.post({
                  jsonrpc: "2.0",
                  id: index + 1,
                  method: "initialize",
                  params
                })
                const error = yield* test.decodeError(response)

                assert.strictEqual(error.id, index + 1)
                assert.strictEqual(error.error.code, McpSchema.INVALID_PARAMS_ERROR_CODE)
                assert.isNull(response.headers.get("Mcp-Session-Id"))
              }
            }))

          it.effect("SCHEMA returns server capabilities and implementation information", () =>
            Effect.gen(function*() {
              const test = yield* McpConformance
              const { message, response, sessionId } = yield* test.initialize()

              assert.strictEqual(response.status, 200)
              assert.strictEqual(message.id, 1)
              assert.isObject(message.result.capabilities)
              assert.deepStrictEqual(message.result.serverInfo, test.serverInfo)
              assert.isNotNull(sessionId)
              assert.match(sessionId, /^[\x21-\x7e]+$/)
            }))

          it.effect("MUST accept initialized after a successful initialize response", () =>
            Effect.gen(function*() {
              const test = yield* McpConformance
              const initialized = yield* test.initialize()
              assert.isNotNull(initialized.sessionId)

              const response = yield* test.notifyInitialized(initialized)

              assert.strictEqual(response.status, 202)
              assert.strictEqual(yield* Effect.promise(() => response.text()), "")
            }))
        })

        describe("Version Negotiation", () => {
          it.effect("MUST echo a requested version supported by the server", () =>
            Effect.gen(function*() {
              const test = yield* McpConformance
              const { message } = yield* test.initialize()

              assert.strictEqual(message.result.protocolVersion, protocol.protocolVersion)
            }))

          it.effect("SHOULD negotiate an unsupported requested version to a supported version", () =>
            Effect.gen(function*() {
              const test = yield* McpConformance
              const { message } = yield* test.initialize({
                protocolVersion: "unsupported-version"
              })

              assert.strictEqual(message.result.protocolVersion, protocol.protocolVersion)
            }))
        })

        describe("Capability Negotiation", () => {
          it.effect("SCHEMA advertises the registered prompt, resource, and tool capabilities", () =>
            Effect.gen(function*() {
              const test = yield* McpConformance
              const { message } = yield* test.initialize({ server: "features" })

              assert.deepStrictEqual(message.result.capabilities.prompts, { listChanged: true })
              assert.deepStrictEqual(message.result.capabilities.resources, {
                listChanged: true,
                subscribe: false
              })
              assert.deepStrictEqual(message.result.capabilities.tools, { listChanged: true })
            }))
        })

        describe("Operation", () => {
          it.effect("MUST continue to use the version negotiated during initialization", () =>
            Effect.gen(function*() {
              const test = yield* McpConformance
              const initialized = yield* test.initialize()
              assert.isNotNull(initialized.sessionId)

              const response = yield* test.ping(initialized)

              assert.strictEqual(response.status, 200)
              assert.strictEqual(response.headers.get("Mcp-Protocol-Version"), protocol.protocolVersion)
            }))
        })
      })
    })
  })
