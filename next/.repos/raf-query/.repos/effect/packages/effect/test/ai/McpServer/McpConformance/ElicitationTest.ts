import { assert, describe, it } from "@effect/vitest"
import type * as McpProtocol from "effect/ai/McpProtocol"
import * as McpSchema from "effect/ai/McpSchema"
import * as McpServer from "effect/ai/McpServer"
import * as Tool from "effect/ai/Tool"
import * as Toolkit from "effect/ai/Toolkit"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { makeHttpHarness } from "../TestUtils/McpHttpHarness.ts"
import { makeMcpSseReader, readMcpHttpResponse } from "../TestUtils/McpHttpResponse.ts"
import { makeServerLayer } from "../TestUtils/McpServerLayer.ts"
import { McpConformance, type McpConformanceLayer } from "./McpConformance.ts"
import type { McpTestPeer } from "./McpTestPeer.ts"

const ElicitationRequest = Schema.Struct({
  message: Schema.String,
  requestedSchema: Schema.Record(Schema.String, Schema.Unknown)
})

const decodeElicitationRequest = Schema.decodeUnknownEffect(ElicitationRequest)

const request = {
  message: "Please provide your profile",
  requestedSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        title: "Name"
      },
      age: {
        type: "integer",
        minimum: 0
      },
      subscribed: {
        type: "boolean",
        default: false
      }
    },
    required: ["name"]
  }
} as const

const runElicitation = <S extends Schema.ConstraintEncoder<Record<string, unknown>, unknown>>(
  client: McpTestPeer["reverseClient"],
  protocolVersion: McpProtocol.StatefulProtocolVersion,
  schema: S
) =>
  McpServer.elicit({
    message: request.message,
    schema
  }).pipe(
    Effect.provideService(
      McpSchema.McpServerClient,
      McpSchema.McpServerClient.of({
        clientId: 1,
        protocolVersion,
        clientCapabilities: { elicitation: {} },
        clientInfo: {
          name: "McpConformancePeer",
          version: "1.0.0"
        },
        initializePayload: {
          protocolVersion,
          capabilities: { elicitation: {} },
          clientInfo: {
            name: "McpConformancePeer",
            version: "1.0.0"
          }
        },
        getClient: Effect.succeed(client)
      })
    )
  )

export const suite = (
  protocol: McpProtocol.ProtocolAdapter<McpProtocol.StatefulProtocolVersion>,
  layer: McpConformanceLayer
) =>
  it.layer(layer)(`Mcp Conformance (${protocol.protocolVersion})`, (it) => {
    describe("Elicitation", () => {
      for (const responseSession of ["missing", "unknown", "unrelated", "owner"] as const) {
        // https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#session-management
        // A reverse response must belong to the session that requested the input.
        it.effect(`MUST preserve elicitation response ownership with a ${responseSession} HTTP session`, () =>
          Effect.gen(function*() {
            const toolkit = Toolkit.make(Tool.make("Approve", {
              parameters: Tool.EmptyParams,
              success: Schema.Struct({ approved: Schema.Boolean }),
              dependencies: [McpSchema.McpServerClient]
            }))
            const registration = McpServer.toolkit(toolkit).pipe(Layer.provide(
              toolkit.toLayer({
                Approve: () =>
                  McpServer.elicit({
                    message: "Approve this operation",
                    schema: Schema.Struct({ approved: Schema.Boolean })
                  }).pipe(Effect.orDie)
              })
            ))
            const harness = yield* makeHttpHarness(registration.pipe(Layer.provideMerge(
              makeServerLayer({ name: "ElicitationSessionConformance", protocols: [protocol] })
            )))
            const initialize = Effect.fnUntraced(function*() {
              const response = yield* harness.post({
                jsonrpc: "2.0",
                id: "initialize",
                method: "initialize",
                params: {
                  protocolVersion: protocol.protocolVersion,
                  capabilities: { elicitation: {} },
                  clientInfo: { name: "approval-client", version: "1.0.0" }
                }
              })
              yield* readMcpHttpResponse(response)
              const sessionId = response.headers.get("Mcp-Session-Id")
              assert.isNotNull(sessionId)
              yield* harness.post({ jsonrpc: "2.0", method: "notifications/initialized" }, {
                "Mcp-Session-Id": sessionId,
                "Mcp-Protocol-Version": protocol.protocolVersion
              })
              return sessionId
            })
            const owner = yield* initialize()
            const other = responseSession === "unrelated" ? yield* initialize() : undefined
            const response = yield* harness.post({
              jsonrpc: "2.0",
              id: "approval-tool",
              method: "tools/call",
              params: { name: "Approve", arguments: {} }
            }, { "Mcp-Session-Id": owner, "Mcp-Protocol-Version": protocol.protocolVersion })
            const stream = makeMcpSseReader(response)
            yield* Effect.addFinalizer(() => stream.cancel)
            const reverse = yield* stream.take()
            assert.strictEqual(reverse.method, "elicitation/create")
            assert.isDefined(reverse.id)
            const sessionId = responseSession === "owner" ? owner : responseSession === "unknown" ? "unknown" : other
            const injected = yield* harness.post(
              {
                jsonrpc: "2.0",
                id: reverse.id,
                result: { action: "accept", content: { approved: true } }
              },
              sessionId === undefined ? {} : {
                "Mcp-Session-Id": sessionId,
                "Mcp-Protocol-Version": protocol.protocolVersion
              }
            )
            if (responseSession !== "owner") {
              const legitimate = yield* harness.post({
                jsonrpc: "2.0",
                id: reverse.id,
                result: { action: "accept", content: { approved: false } }
              }, { "Mcp-Session-Id": owner, "Mcp-Protocol-Version": protocol.protocolVersion })
              assert.strictEqual(legitimate.status, 202)
            }
            const completed = yield* stream.take()
            assert.strictEqual(completed.id, "approval-tool")
            const result = yield* Schema.decodeUnknownEffect(McpSchema.CallToolResult)(completed.result)
            assert.deepStrictEqual(result.content, [{
              type: "text",
              text: JSON.stringify({ approved: responseSession === "owner" })
            }])
            if (responseSession === "missing") assert.strictEqual(injected.status, 400)
            if (responseSession === "unknown") assert.strictEqual(injected.status, 404)
            if (responseSession === "owner") assert.strictEqual(injected.status, 202)
          }))
      }

      // https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation
      describe("Capabilities", () => {
        it.effect.skipIf(protocol.protocolVersion !== "2025-11-25")(
          "MUST treat an empty elicitation capability as form support",
          () =>
            Effect.gen(function*() {
              const test = yield* McpConformance
              const peer = yield* test.makePeer({
                capabilities: { elicitation: {} },
                handlers: {
                  "elicitation/create": () => Effect.succeed({ action: "accept", content: { name: "Ada" } })
                }
              })

              yield* peer.reverseClient.elicit(Schema.decodeUnknownSync(McpSchema.Elicit.payloadSchema)(request))

              assert.deepStrictEqual((yield* peer.takeRequest).payload, request)
            }).pipe(Effect.scoped)
        )

        it.effect("MUST send elicitation requests when the client advertises elicitation", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const peer = yield* test.makePeer({
              capabilities: { elicitation: {} },
              handlers: {
                "elicitation/create": () =>
                  Effect.succeed({
                    action: "accept",
                    content: { name: "Ada" }
                  })
              }
            })

            yield* peer.wireClient["elicitation/create"](request)

            assert.strictEqual((yield* peer.takeRequest).method, "elicitation/create")
          }))

        it.effect.skipIf(protocol.protocolVersion !== "2025-11-25")(
          "MUST gate form and URL modes on their independent nested capabilities",
          () =>
            Effect.gen(function*() {
              const test = yield* McpConformance
              const formOnly = yield* test.makePeer({ capabilities: { elicitation: { form: {} } } })
              const urlOnly = yield* test.makePeer({ capabilities: { elicitation: { url: {} } } })

              const formOnUrlOnly = yield* Effect.exit(urlOnly.reverseClient.elicit(request))
              const urlOnFormOnly = yield* Effect.exit(formOnly.reverseClient.elicit({
                mode: "url",
                message: "Authorize access",
                url: "https://example.com/authorize",
                elicitationId: "authorization-1"
              }))

              assert.strictEqual(formOnUrlOnly._tag, "Failure")
              assert.strictEqual(urlOnFormOnly._tag, "Failure")
              assert.deepStrictEqual(yield* formOnly.requests, [])
              assert.deepStrictEqual(yield* urlOnly.requests, [])
            })
        )
      })

      describe("Form Mode", () => {
        it.effect("MUST send the message and requested primitive form schema", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const peer = yield* test.makePeer({
              capabilities: { elicitation: {} },
              handlers: {
                "elicitation/create": () =>
                  Effect.succeed({
                    action: "accept",
                    content: { name: "Ada", age: 37, subscribed: true }
                  })
              }
            })

            const result = yield* peer.wireClient["elicitation/create"](request)
            const recorded = yield* peer.takeRequest
            const payload = yield* decodeElicitationRequest(recorded.payload)

            assert.strictEqual(payload.message, request.message)
            assert.deepStrictEqual(payload.requestedSchema, request.requestedSchema)
            assert.strictEqual(result.action, "accept")
            if (result.action === "accept") {
              assert.deepStrictEqual(result.content, {
                name: "Ada",
                age: 37,
                subscribed: true
              })
            }
          }))

        it.effect.skipIf(protocol.protocolVersion !== "2025-11-25")(
          "MUST preserve omitted and explicit form modes",
          () =>
            Effect.gen(function*() {
              const test = yield* McpConformance
              const peer = yield* test.makePeer({
                capabilities: { elicitation: { form: {} } },
                handlers: {
                  "elicitation/create": () => Effect.succeed({ action: "accept", content: { name: "Ada" } })
                }
              })

              yield* peer.reverseClient.elicit(Schema.decodeUnknownSync(McpSchema.Elicit.payloadSchema)(request))
              yield* peer.reverseClient.elicit(
                Schema.decodeUnknownSync(McpSchema.Elicit.payloadSchema)({ ...request, mode: "form" })
              )

              const requests = yield* peer.requests
              assert.deepStrictEqual(requests.map((_) => _.payload), [request, { ...request, mode: "form" }])
            }).pipe(Effect.scoped)
        )

        it.effect("MUST decode accepted content against the requested schema", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const peer = yield* test.makePeer({
              capabilities: { elicitation: {} },
              handlers: {
                "elicitation/create": () =>
                  Effect.succeed({
                    action: "accept",
                    content: { name: "Ada", age: "37" }
                  })
              }
            })

            const result = yield* runElicitation(
              peer.reverseClient,
              protocol.protocolVersion,
              Schema.Struct({
                name: Schema.String,
                age: Schema.NumberFromString
              })
            )

            assert.deepStrictEqual(result, { name: "Ada", age: 37 })
          }))

        it.effect("MUST reject schemas outside the elicitation subset before sending", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const peer = yield* test.makePeer({ capabilities: { elicitation: {} } })

            const exit = yield* Effect.exit(runElicitation(
              peer.reverseClient,
              protocol.protocolVersion,
              Schema.Struct({ nested: Schema.Struct({ value: Schema.String }) })
            ))

            assert.isTrue(Exit.isFailure(exit))
            if (Exit.isFailure(exit)) {
              assert.isTrue(Cause.hasDies(exit.cause))
            }
            assert.deepStrictEqual(yield* peer.requests, [])
          }).pipe(Effect.scoped))

        it.effect("SCENARIO returns a typed failure when the user declines", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const peer = yield* test.makePeer({
              capabilities: { elicitation: {} },
              handlers: {
                "elicitation/create": () => Effect.succeed({ action: "decline" })
              }
            })

            const error = yield* runElicitation(
              peer.reverseClient,
              protocol.protocolVersion,
              Schema.Struct({ name: Schema.String })
            ).pipe(Effect.flip)

            assert.instanceOf(error, McpSchema.ElicitationDeclined)
          }))

        it.effect("SCENARIO interrupts the operation when the user cancels", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const peer = yield* test.makePeer({
              capabilities: { elicitation: {} },
              handlers: {
                "elicitation/create": () => Effect.succeed({ action: "cancel" })
              }
            })

            const exit = yield* Effect.exit(runElicitation(
              peer.reverseClient,
              protocol.protocolVersion,
              Schema.Struct({ name: Schema.String })
            ))

            assert.isTrue(Exit.isFailure(exit))
            if (Exit.isFailure(exit)) {
              assert.isTrue(Cause.hasInterrupts(exit.cause))
            }
          }))

        it.effect("MUST reject accepted content that does not match the requested schema", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const peer = yield* test.makePeer({
              capabilities: { elicitation: {} },
              handlers: {
                "elicitation/create": () =>
                  Effect.succeed({
                    action: "accept",
                    content: { name: 123 }
                  })
              }
            })

            const exit = yield* Effect.exit(runElicitation(
              peer.reverseClient,
              protocol.protocolVersion,
              Schema.Struct({ name: Schema.String })
            ))

            assert.isTrue(Exit.isFailure(exit))
            if (Exit.isFailure(exit)) {
              assert.isTrue(Cause.hasDies(exit.cause))
            }
          }))
      })

      describe("URL Mode", () => {
        it.effect.skipIf(protocol.protocolVersion !== "2025-11-25")(
          "MUST round-trip URL elicitation",
          () =>
            Effect.gen(function*() {
              const test = yield* McpConformance
              const request = {
                mode: "url" as const,
                message: "Authorize access",
                url: "https://example.com/authorize",
                elicitationId: "authorization-1"
              }
              const peer = yield* test.makePeer({
                capabilities: { elicitation: { url: {} } },
                handlers: { "elicitation/create": () => Effect.succeed({ action: "accept" }) }
              })

              const result = yield* peer.reverseClient.elicit(
                Schema.decodeUnknownSync(McpSchema.Elicit.payloadSchema)(request)
              )

              assert.deepStrictEqual((yield* peer.takeRequest).payload, request)
              assert.strictEqual(result.action, "accept")
            }).pipe(Effect.scoped)
        )
      })
    })
  })
