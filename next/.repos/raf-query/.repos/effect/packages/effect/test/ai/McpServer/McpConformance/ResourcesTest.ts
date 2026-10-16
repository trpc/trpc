import { assert, describe, it } from "@effect/vitest"
import type * as McpProtocol from "effect/ai/McpProtocol"
import * as McpSchema from "effect/ai/McpSchema"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { makeMcpStdioHarness } from "../TestUtils/McpStdioHarness.ts"
import { McpConformance, type McpConformanceLayer } from "./McpConformance.ts"

const decodeResources = Schema.decodeUnknownEffect(McpSchema.ListResourcesResult)
const decodeResourceTemplates = Schema.decodeUnknownEffect(McpSchema.ListResourceTemplatesResult)
const decodeReadResource = Schema.decodeUnknownEffect(McpSchema.ReadResourceResult)
const decodeResourceUpdated = Schema.decodeUnknownEffect(McpSchema.ResourceUpdatedNotification.payloadSchema)
const makeResource = (uri: string, name: string) => ({
  resource: new McpSchema.Resource({ uri, name }),
  annotations: Context.empty(),
  handle: Effect.succeed(
    McpSchema.ReadResourceResult.make({
      contents: [{ uri, text: name }]
    })
  )
})

export const suite = (protocol: McpProtocol.ProtocolAdapter, layer: McpConformanceLayer) =>
  it.layer(layer)(`Mcp Conformance (${protocol.protocolVersion})`, (it) => {
    describe("Resources", () => {
      // Shared capability contract; each dated entrypoint owns its normative specification revision.
      describe("Capabilities", () => {
        it.effect("MUST advertise resources when resources are registered", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const initialized = yield* test.initialize({ server: "features" })

            assert.property(initialized.message.result.capabilities, "resources")
          }))

        it.effect("MUST NOT advertise resources when resources are not supported", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const initialized = yield* test.initialize()

            assert.notProperty(initialized.message.result.capabilities, "resources")
          }))
      })

      describe("Listing Resources", () => {
        it.effect("MUST list every resource visible to the initialized client", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const initialized = yield* test.initialize({ server: "features" })
            yield* test.notifyInitialized(initialized)
            const response = yield* test.send(initialized, {
              jsonrpc: "2.0",
              id: 2,
              method: "resources/list",
              params: {}
            })
            const result = yield* test.decodeResult(response).pipe(
              Effect.flatMap((message) => decodeResources(message.result))
            )

            assert.deepStrictEqual(result.resources.map((resource) => resource.uri).sort(), [
              "file:///binary",
              "file:///multiple",
              "file:///test"
            ])
          }))

        it.effect("SCHEMA preserves resource URI, name, description, and MIME type", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const initialized = yield* test.initialize({ server: "features" })
            yield* test.notifyInitialized(initialized)
            const response = yield* test.send(initialized, {
              jsonrpc: "2.0",
              id: 2,
              method: "resources/list",
              params: {}
            })
            const result = yield* test.decodeResult(response).pipe(
              Effect.flatMap((message) => decodeResources(message.result))
            )

            const resource = result.resources.find((resource) => resource.uri === "file:///test")
            assert.isDefined(resource)
            assert.deepInclude(resource, {
              uri: "file:///test",
              name: "TestResource",
              description: "A test resource",
              mimeType: "text/plain"
            })
          }))
      })

      describe("Reading Resources", () => {
        it.effect("MUST read text resource contents", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const initialized = yield* test.initialize({ server: "features" })
            yield* test.notifyInitialized(initialized)
            const response = yield* test.send(initialized, {
              jsonrpc: "2.0",
              id: 2,
              method: "resources/read",
              params: { uri: "file:///test" }
            })
            const result = yield* test.decodeResult(response).pipe(
              Effect.flatMap((message) => decodeReadResource(message.result))
            )

            assert.deepStrictEqual(result.contents, [{
              uri: "file:///test",
              mimeType: "text/plain",
              text: "test"
            }])
          }))
        it.effect("MUST read binary resource contents as base64", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const initialized = yield* test.initialize({ server: "features" })
            yield* test.notifyInitialized(initialized)
            const response = yield* test.send(initialized, {
              jsonrpc: "2.0",
              id: 2,
              method: "resources/read",
              params: { uri: "file:///binary" }
            })
            const body = yield* Effect.promise<unknown>(() => response.json())
            const message = yield* Schema.decodeUnknownEffect(Schema.Struct({
              result: Schema.Struct({
                contents: Schema.Array(Schema.Struct({
                  uri: Schema.String,
                  mimeType: Schema.String,
                  blob: Schema.String
                }))
              })
            }))(body)

            assert.deepStrictEqual(message.result.contents, [{
              uri: "file:///binary",
              mimeType: "application/octet-stream",
              blob: "AQID"
            }])
          }))
        it.effect("SCHEMA preserves the resource URI and MIME type in returned contents", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const initialized = yield* test.initialize({ server: "features" })
            yield* test.notifyInitialized(initialized)
            const response = yield* test.send(initialized, {
              jsonrpc: "2.0",
              id: 2,
              method: "resources/read",
              params: { uri: "file:///test" }
            })
            const result = yield* test.decodeResult(response).pipe(
              Effect.flatMap((message) => decodeReadResource(message.result))
            )

            assert.strictEqual(result.contents[0]?.uri, "file:///test")
            assert.strictEqual(result.contents[0]?.mimeType, "text/plain")
          }))
        it.effect("MUST return multiple resource contents in order", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const initialized = yield* test.initialize({ server: "features" })
            yield* test.notifyInitialized(initialized)
            const response = yield* test.send(initialized, {
              jsonrpc: "2.0",
              id: 2,
              method: "resources/read",
              params: { uri: "file:///multiple" }
            })
            const result = yield* test.decodeResult(response).pipe(
              Effect.flatMap((message) => decodeReadResource(message.result))
            )

            assert.deepStrictEqual(result.contents.map((content) => content.uri), [
              "file:///multiple#first",
              "file:///multiple#second"
            ])
          }))

        it.effect("should return the revision-specific error when the resource URI is unknown", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const initialized = yield* test.initialize({ server: "features" })
            yield* test.notifyInitialized(initialized)
            const response = yield* test.send(initialized, {
              jsonrpc: "2.0",
              id: 2,
              method: "resources/read",
              params: { uri: "file:///missing" }
            })
            const error = yield* test.decodeError(response)

            assert.strictEqual(
              error.error.code,
              protocol.protocolVersion === "2026-07-28" ? -32602 : -32002
            )
          }))
      })

      describe("Resource Templates", () => {
        it.effect("MUST list every registered resource template", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const initialized = yield* test.initialize({ server: "features" })
            yield* test.notifyInitialized(initialized)
            const response = yield* test.send(initialized, {
              jsonrpc: "2.0",
              id: 2,
              method: "resources/templates/list",
              params: {}
            })
            const result = yield* test.decodeResult(response).pipe(
              Effect.flatMap((message) => decodeResourceTemplates(message.result))
            )

            const template = result.resourceTemplates.find(
              (template) => template.name === "TestResourceTemplate"
            )
            assert.deepStrictEqual(
              template && {
                uriTemplate: template.uriTemplate,
                name: template.name,
                description: template.description,
                mimeType: template.mimeType
              },
              {
                uriTemplate: "file:///template/{path}",
                name: "TestResourceTemplate",
                description: "A test resource template",
                mimeType: "text/plain"
              }
            )
          }))

        it.effect("MUST match and decode a concrete resource-template URI", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const initialized = yield* test.initialize({ server: "features" })
            yield* test.notifyInitialized(initialized)
            const response = yield* test.send(initialized, {
              jsonrpc: "2.0",
              id: 2,
              method: "resources/read",
              params: { uri: "file:///template/encoded%20path" }
            })
            const result = yield* test.decodeResult(response).pipe(
              Effect.flatMap((message) => decodeReadResource(message.result))
            )

            assert.strictEqual(
              result.contents[0] && "text" in result.contents[0] ? result.contents[0].text : undefined,
              "file:///template/encoded%20path:encoded path"
            )
          }))
        it.effect("MUST not invoke the handler when template parameter decoding fails", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            yield* test.resetObservations
            const initialized = yield* test.initialize({ server: "features" })
            yield* test.notifyInitialized(initialized)
            const response = yield* test.send(initialized, {
              jsonrpc: "2.0",
              id: 2,
              method: "resources/read",
              params: { uri: "file:///numeric/not-a-number" }
            })
            const error = yield* test.decodeError(response)

            assert.strictEqual(error.error.code, McpSchema.INVALID_PARAMS_ERROR_CODE)
            assert.strictEqual((yield* test.observations).resourceTemplateInvocations, 0)
          }))
      })
    })
  })

export const statefulLegacySuite = (
  protocol: McpProtocol.ProtocolAdapter<McpProtocol.StatefulProtocolVersion>,
  layer: McpConformanceLayer
) =>
  it.layer(layer)(`Mcp Conformance (${protocol.protocolVersion})`, (it) => {
    // https://modelcontextprotocol.io/specification/2025-11-25/server/resources
    describe("Resources > Legacy notifications", () => {
      it.effect("should advertise resource list-change notifications when supported", () =>
        Effect.gen(function*() {
          const test = yield* McpConformance
          const initialized = yield* test.initialize({ server: "features" })

          assert.strictEqual(initialized.message.result.capabilities.resources?.listChanged, true)
        }))

      it.effect("should send a resource list-change notification when the advertised list changes", () =>
        Effect.gen(function*() {
          const fixture = yield* makeMcpStdioHarness(protocol)
          yield* fixture.server.addResource(
            makeResource("file:///baseline-list-changed", "baseline-list-changed-resource")
          )
          yield* fixture.initialize()
          yield* fixture.server.addResource(
            makeResource("file:///dynamic-list-changed", "dynamic-list-changed-resource")
          )
          yield* fixture.flushListChanged

          const notification = yield* fixture.awaitOutboundMethod("notifications/resources/list_changed")
          assert.strictEqual(notification.jsonrpc, "2.0")
          assert.strictEqual(notification.method, "notifications/resources/list_changed")
          assert.notProperty(notification, "id")

          const response = yield* fixture.sendRequest("resources/list", {})
          const result = yield* decodeResources(response.result)
          assert.isTrue(result.resources.some((resource) => resource.uri === "file:///dynamic-list-changed"))
        }))
    })

    describe("Resources > Legacy subscriptions", () => {
      it.effect("should deliver a resource update with its URI when the resource is subscribed", () =>
        Effect.gen(function*() {
          const fixture = yield* makeMcpStdioHarness(protocol)
          yield* fixture.server.addResource(makeResource("file:///subscription-target", "subscription-target"))
          const initialized = yield* fixture.initialize()
          const initializeResult = yield* Schema.decodeUnknownEffect(McpSchema.InitializeResult)(initialized.result)
          assert.strictEqual(initializeResult.capabilities.resources?.subscribe, true)

          const response = yield* fixture.sendRequest("resources/subscribe", {
            uri: "file:///subscription-target"
          })
          assert.notProperty(response, "error")
          assert.deepStrictEqual(response.result, {})

          yield* fixture.server.notifications["notifications/resources/updated"]({
            uri: "file:///subscription-target"
          })
          const notification = yield* fixture.awaitOutboundMethod("notifications/resources/updated")
          assert.strictEqual(notification.jsonrpc, "2.0")
          assert.strictEqual(notification.method, "notifications/resources/updated")
          assert.notProperty(notification, "id")
          const payload = yield* decodeResourceUpdated(notification.params)
          assert.strictEqual(payload.uri, "file:///subscription-target")
        }))

      it.effect("should deliver updates only for subscribed resource URIs", () =>
        Effect.gen(function*() {
          const fixture = yield* makeMcpStdioHarness(protocol)
          yield* fixture.server.addResource(makeResource("file:///subscription-target", "subscription-target"))
          yield* fixture.initialize()
          yield* fixture.sendRequest("resources/subscribe", { uri: "file:///subscription-target" })

          yield* fixture.server.notifications["notifications/resources/updated"]({ uri: "file:///not-subscribed" })
          yield* fixture.server.notifications["notifications/resources/updated"]({
            uri: "file:///subscription-target"
          })
          const notification = yield* fixture.awaitOutboundMethod("notifications/resources/updated")
          const payload = yield* decodeResourceUpdated(notification.params)
          assert.strictEqual(payload.uri, "file:///subscription-target")
        }))

      it.effect("should stop delivering updates after a resource is unsubscribed", () =>
        Effect.gen(function*() {
          const fixture = yield* makeMcpStdioHarness(protocol)
          yield* fixture.server.addResource(makeResource("file:///subscription-target", "subscription-target"))
          yield* fixture.server.addResource(makeResource("file:///subscription-sentinel", "subscription-sentinel"))
          yield* fixture.initialize()
          yield* fixture.sendRequest("resources/subscribe", { uri: "file:///subscription-target" })
          yield* fixture.sendRequest("resources/subscribe", { uri: "file:///subscription-sentinel" })

          const response = yield* fixture.sendRequest("resources/unsubscribe", {
            uri: "file:///subscription-target"
          })
          assert.notProperty(response, "error")
          assert.deepStrictEqual(response.result, {})

          yield* fixture.server.notifications["notifications/resources/updated"]({
            uri: "file:///subscription-target"
          })
          yield* fixture.server.notifications["notifications/resources/updated"]({
            uri: "file:///subscription-sentinel"
          })
          const notification = yield* fixture.awaitOutboundMethod("notifications/resources/updated")
          const payload = yield* decodeResourceUpdated(notification.params)
          assert.strictEqual(payload.uri, "file:///subscription-sentinel")
        }))
    })
  })
