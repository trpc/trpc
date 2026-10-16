import { assert, describe, it } from "@effect/vitest"
import * as McpCore from "effect/ai/internal/mcpCore"
import type * as McpProtocolInternal from "effect/ai/internal/mcpProtocol"
import * as McpProtocol2026 from "effect/ai/internal/mcpProtocol/v2026_07_28"
import * as McpSchema2026 from "effect/ai/internal/mcpSchema/v2026_07_28"
import * as McpProtocol from "effect/ai/McpProtocol"
import * as McpSchema from "effect/ai/McpSchema"
import * as McpServer from "effect/ai/McpServer"
import type * as Arr from "effect/Array"
import * as Clock from "effect/Clock"
import * as Context from "effect/Context"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as Predicate from "effect/Predicate"
import * as PubSub from "effect/PubSub"
import * as Queue from "effect/Queue"
import * as Rpc from "effect/rpc/Rpc"
import type * as RpcMessage from "effect/rpc/RpcMessage"
import { RequestId } from "effect/rpc/RpcMessage"
import type * as RpcSerialization from "effect/rpc/RpcSerialization"
import * as RpcServer from "effect/rpc/RpcServer"
import * as Schema from "effect/Schema"
import * as TestClock from "effect/testing/TestClock"
import { makeHttpHarness } from "../TestUtils/McpHttpHarness.ts"
import { makeMcpSseReader } from "../TestUtils/McpHttpResponse.ts"
import { makeServerLayer } from "../TestUtils/McpServerLayer.ts"
import { type JsonRpcMessage, makeMcpStdioHarness, type McpStdioHarness } from "../TestUtils/McpStdioHarness.ts"
import { McpConformance, type McpConformanceLayer } from "./McpConformance.ts"

const subscriptionIdKey = "io.modelcontextprotocol/subscriptionId"

const paramsOf = (message: JsonRpcMessage): Record<string, unknown> => {
  assert.isObject(message.params)
  return message.params as Record<string, unknown>
}

const subscriptionIdOf = (message: JsonRpcMessage): string | number => {
  const params = paramsOf(message)
  assert.isObject(params._meta)
  const subscriptionId = (params._meta as Record<string, unknown>)[subscriptionIdKey]
  if (typeof subscriptionId === "string" || typeof subscriptionId === "number") {
    return subscriptionId
  }
  return assert.fail("Expected a string or numeric subscription identifier")
}

const makeTool = (name: string) => ({
  tool: new McpSchema.Tool({ name, inputSchema: { type: "object", properties: {} } }),
  annotations: Context.empty(),
  handle: () => Effect.succeed(new McpSchema.CallToolResult({ content: [] }))
})

const makePrompt = (name: string) => ({
  prompt: new McpSchema.Prompt({ name }),
  annotations: Context.empty(),
  completions: {},
  handle: () =>
    Effect.succeed(
      new McpSchema.GetPromptResult({
        messages: [{ role: "user", content: { type: "text", text: name } }]
      })
    )
})

const makeResource = (uri: string) => ({
  resource: new McpSchema.Resource({ uri, name: uri }),
  annotations: Context.empty(),
  handle: Effect.succeed(McpSchema.ReadResourceResult.make({ contents: [] }))
})

const subscriptionRegistrations = Layer.effectDiscard(
  Effect.gen(function*() {
    const server = yield* McpServer.McpServer
    yield* server.addTool(makeTool("subscription-registration-tool"))
    yield* server.addPrompt(makePrompt("subscription-registration-prompt"))
    yield* server.addResource(makeResource("file:///subscription-registration-resource"))
  })
)

const toolOnlyRegistration = Layer.effectDiscard(
  McpServer.McpServer.use((server) => server.addTool(makeTool("tool-only-registration")))
)

const makeSubscriptionHarness = (
  protocol: McpProtocol.ProtocolAdapter,
  protocols: Arr.NonEmptyReadonlyArray<McpProtocol.ProtocolAdapter> = [protocol]
) => makeMcpStdioHarness(protocol, protocols, subscriptionRegistrations)

const listen = (
  fixture: McpStdioHarness,
  id: string | number,
  notifications: Record<string, unknown>
) =>
  fixture.flushListChanged.pipe(
    Effect.andThen(fixture.startRequest("subscriptions/listen", { notifications }, id))
  )

const assertAcknowledged = (
  message: JsonRpcMessage,
  id: string | number,
  notifications: Record<string, unknown>
) => {
  assert.strictEqual(message.method, "notifications/subscriptions/acknowledged")
  assert.notProperty(message, "id")
  assert.strictEqual(subscriptionIdOf(message), id)
  assert.deepStrictEqual(paramsOf(message).notifications, notifications)
}

const httpMetadata = (protocol: McpProtocol.ProtocolAdapter) => ({
  "io.modelcontextprotocol/protocolVersion": protocol.protocolVersion,
  "io.modelcontextprotocol/clientCapabilities": {},
  "io.modelcontextprotocol/clientInfo": { name: "subscription-http-client", version: "1.0.0" }
})

const httpListenRequest = (protocol: McpProtocol.ProtocolAdapter, id: string | number) => ({
  jsonrpc: "2.0",
  id,
  method: "subscriptions/listen",
  params: {
    notifications: { toolsListChanged: true },
    _meta: httpMetadata(protocol)
  }
})

const httpHeaders = (protocol: McpProtocol.ProtocolAdapter): HeadersInit => ({
  "MCP-Protocol-Version": protocol.protocolVersion,
  "Mcp-Method": "subscriptions/listen"
})

const makeHttpSubscriptionHarness = Effect.fnUntraced(function*(
  protocol: McpProtocol.ProtocolAdapter,
  clockLayer: Layer.Layer<never> = Layer.empty
) {
  const serverReady = yield* Deferred.make<McpServer.McpServer["Service"]>()
  const registrations = Layer.effectDiscard(
    Effect.gen(function*() {
      const server = yield* McpServer.McpServer
      yield* server.addTool(makeTool("http-subscription-baseline"))
      yield* Deferred.succeed(serverReady, server)
    })
  )
  const harness = yield* makeHttpHarness(
    registrations.pipe(
      Layer.provideMerge(makeServerLayer({
        name: "SubscriptionConformance",
        protocols: [protocol]
      })),
      Layer.provideMerge(clockLayer)
    )
  )
  return { harness, serverReady }
})

const makeTrackingClock = Effect.gen(function*() {
  const clock = yield* Clock.Clock
  let activeSleeps = 0
  const trackingClock: Clock.Clock = {
    ...clock,
    sleep: (duration) =>
      Effect.acquireUseRelease(
        Effect.sync(() => {
          activeSleeps++
        }),
        () => clock.sleep(duration),
        () =>
          Effect.sync(() => {
            activeSleeps--
          })
      )
  }
  return { layer: Layer.succeed(Clock.Clock, trackingClock), activeSleeps: () => activeSleeps }
})

export const suite = (protocol: McpProtocol.ProtocolAdapter, layer: McpConformanceLayer) =>
  it.layer(layer)(`Mcp Conformance (${protocol.protocolVersion})`, (it) => {
    describe("Subscriptions", () => {
      // SEP-2575 replaces unsolicited list-change notifications and resources/subscribe with subscriptions/listen.
      // https://modelcontextprotocol.io/seps/2575-stateless-mcp
      // https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/subscriptions
      it.effect("should advertise supported subscription capabilities when features are registered", () =>
        Effect.gen(function*() {
          const test = yield* McpConformance
          const discovered = yield* test.initialize({ server: "features" })

          assert.deepStrictEqual(discovered.message.result.capabilities.tools, { listChanged: true })
          assert.deepStrictEqual(discovered.message.result.capabilities.resources, {
            listChanged: true,
            subscribe: true
          })
          assert.deepStrictEqual(discovered.message.result.capabilities.prompts, { listChanged: true })
        }))

      it.effect("should update discovery and subscription capabilities after late registration", () =>
        Effect.gen(function*() {
          const fixture = yield* makeMcpStdioHarness(protocol)
          const before = yield* fixture.initialize()
          const beforeResult = before.result
          if (!Predicate.isObject(beforeResult)) {
            return assert.fail("Expected discovery result before late registration")
          }
          const beforeCapabilities = beforeResult.capabilities
          if (!Predicate.isObject(beforeCapabilities)) {
            return assert.fail("Expected discovery capabilities before late registration")
          }
          assert.notProperty(beforeCapabilities, "tools")

          yield* fixture.server.addTool(makeTool("late-registration"))

          const after = yield* fixture.initialize()
          const afterResult = after.result
          if (!Predicate.isObject(afterResult)) {
            return assert.fail("Expected discovery result after late registration")
          }
          const afterCapabilities = afterResult.capabilities
          if (!Predicate.isObject(afterCapabilities)) {
            return assert.fail("Expected discovery capabilities after late registration")
          }
          assert.deepStrictEqual(afterCapabilities.tools, { listChanged: true })

          const request = yield* listen(fixture, "late-registration-listener", { toolsListChanged: true })
          assertAcknowledged(
            yield* fixture.takeMessage,
            "late-registration-listener",
            { toolsListChanged: true }
          )
          yield* request.cancel("test complete")
        }))

      it.effect("should not advertise subscriptions and should reject listen when the transport cannot send notifications", () =>
        Effect.gen(function*() {
          const outbound = yield* Queue.unbounded<RpcMessage.FromServerEncoded>()
          const disconnects = yield* Queue.unbounded<number>()
          const writeRequest = yield* Deferred.make<
            (clientId: number, message: RpcMessage.FromClientEncoded) => Effect.Effect<void>
          >()
          const transport = yield* RpcServer.Protocol.make((write) =>
            Deferred.succeed(writeRequest, write).pipe(
              Effect.as({
                disconnects,
                send: (_clientId, message) => Queue.offer(outbound, message).pipe(Effect.asVoid),
                end: (_clientId) => Effect.void,
                clientIds: Effect.succeed(new Set([0])),
                initialMessage: Effect.succeedNone,
                supportsAck: false,
                supportsTransferables: false,
                supportsSpanPropagation: false,
                supportsNotifications: false,
                codecFor: Schema.toCodecJson as RpcSerialization.CodecFor
              })
            )
          )
          yield* Effect.gen(function*() {
            yield* Layer.build(
              subscriptionRegistrations.pipe(
                Layer.provideMerge(
                  McpServer.layer({
                    name: "SubscriptionConformance",
                    version: "1.0.0",
                    protocols: [protocol]
                  }).pipe(Layer.provide(Layer.succeed(RpcServer.Protocol, transport)))
                )
              )
            )
            return yield* Effect.never
          }).pipe(Effect.scoped, Effect.forkScoped)
          const send = yield* Deferred.await(writeRequest)
          const metadata = httpMetadata(protocol)

          yield* send(0, {
            _tag: "Request",
            id: 1,
            tag: "server/discover",
            payload: { _meta: metadata },
            headers: []
          })
          const discovery = yield* Queue.take(outbound)
          if (discovery._tag !== "Exit" || discovery.exit._tag !== "Success") {
            return assert.fail("Expected successful discovery response")
          }
          assert(Predicate.isObject(discovery.exit.value))
          assert(Predicate.isObject(discovery.exit.value.capabilities))
          assert.deepStrictEqual(discovery.exit.value.capabilities.tools, { listChanged: false })
          assert.deepStrictEqual(discovery.exit.value.capabilities.resources, {
            listChanged: false,
            subscribe: false
          })
          assert.deepStrictEqual(discovery.exit.value.capabilities.prompts, { listChanged: false })

          yield* send(0, {
            _tag: "Request",
            id: 2,
            tag: "subscriptions/listen",
            payload: { notifications: { toolsListChanged: true }, _meta: metadata },
            headers: []
          })
          const listenResponse = yield* Queue.take(outbound)
          if (listenResponse._tag !== "Exit" || listenResponse.exit._tag !== "Failure") {
            return assert.fail("Expected failed subscription response")
          }
          const failure = listenResponse.exit.cause.find((cause) => cause._tag === "Fail")
          assert(failure !== undefined && failure._tag === "Fail")
          assert(Predicate.isObject(failure.error))
          assert.strictEqual(failure.error.code, McpSchema.METHOD_NOT_FOUND_ERROR_CODE)
        }))

      it.effect("should buffer matching events while the subscription acknowledgment is blocked", () =>
        Effect.gen(function*() {
          const core = yield* McpCore.make
          const events = yield* PubSub.unbounded<McpProtocolInternal.CanonicalServerNotification>()
          const released = yield* Deferred.make<void>()
          const acknowledgmentStarted = yield* Deferred.make<void>()
          const releaseAcknowledgment = yield* Deferred.make<void>()
          const sent = yield* Queue.unbounded<McpProtocol.ProjectedNotification>()
          const handlers = McpProtocol2026.makeHandlers(core, undefined, {
            subscribeServerNotifications: Effect.acquireRelease(
              PubSub.subscribe(events),
              () => Deferred.succeed(released, undefined)
            ),
            sendNotification: (_protocolVersion, _clientId, notification) =>
              Effect.gen(function*() {
                if (notification.tag === McpSchema2026.SubscriptionsAcknowledgedNotification._tag) {
                  yield* Deferred.succeed(acknowledgmentStarted, undefined)
                  yield* Deferred.await(releaseAcknowledgment)
                }
                yield* Queue.offer(sent, notification)
              }),
            supportedVersions: [McpSchema2026.protocolVersion],
            serverInfo: { name: "SubscriptionConformance", version: "1.0.0" },
            registrationPresence: Effect.succeed({ tools: true, resources: false, prompts: false })
          })
          const listener = yield* handlers["subscriptions/listen"](
            { notifications: { toolsListChanged: true }, _meta: httpMetadata(protocol) },
            { client: new Rpc.ServerClient(1), requestId: RequestId("blocked-acknowledgment") }
          ).pipe(Effect.scoped, Effect.forkScoped)

          yield* Deferred.await(acknowledgmentStarted)
          yield* PubSub.publish(events, {
            notification: McpCore.ServerNotification.ToolsChanged({})
          })
          yield* Deferred.succeed(releaseAcknowledgment, undefined)

          const acknowledgment = yield* Queue.take(sent)
          const notification = yield* Queue.take(sent)
          assert.strictEqual(acknowledgment.tag, McpSchema2026.SubscriptionsAcknowledgedNotification._tag)
          assert.strictEqual(notification.tag, McpSchema2026.ToolListChangedNotification._tag)

          yield* Fiber.interrupt(listener)
          yield* Deferred.await(released)
        }))

      it.effect("should release the scoped subscription when a blocked listener is interrupted", () =>
        Effect.gen(function*() {
          const core = yield* McpCore.make
          const events = yield* PubSub.unbounded<McpProtocolInternal.CanonicalServerNotification>()
          const released = yield* Deferred.make<void>()
          const waitingForEvent = yield* Deferred.make<void>()
          const handlers = McpProtocol2026.makeHandlers(core, undefined, {
            subscribeServerNotifications: Effect.acquireRelease(
              PubSub.subscribe(events).pipe(
                Effect.map((subscription) =>
                  new Proxy(subscription, {
                    get(target, property, receiver) {
                      if (property !== "subscription") {
                        return Reflect.get(target, property, receiver)
                      }
                      return new Proxy(target.subscription, {
                        get(backing, backingProperty, backingReceiver) {
                          if (backingProperty !== "poll") {
                            return Reflect.get(backing, backingProperty, backingReceiver)
                          }
                          return () => {
                            Deferred.doneUnsafe(waitingForEvent, Effect.void)
                            return backing.poll()
                          }
                        }
                      })
                    }
                  })
                )
              ),
              () => Deferred.succeed(released, undefined)
            ),
            sendNotification: () => Effect.void,
            supportedVersions: [McpSchema2026.protocolVersion],
            serverInfo: { name: "SubscriptionConformance", version: "1.0.0" },
            registrationPresence: Effect.succeed({ tools: true, resources: false, prompts: false })
          })
          const listener = yield* handlers["subscriptions/listen"](
            { notifications: { toolsListChanged: true }, _meta: httpMetadata(protocol) },
            { client: new Rpc.ServerClient(1), requestId: RequestId("blocked-listener") }
          ).pipe(Effect.scoped, Effect.forkScoped)

          yield* Deferred.await(waitingForEvent)
          yield* Fiber.interrupt(listener)
          yield* Deferred.await(released)
        }))

      it.effect("should acknowledge with the exact identifier when it is numeric or string-valued", () =>
        Effect.gen(function*() {
          const fixture = yield* makeSubscriptionHarness(protocol)
          yield* fixture.server.addTool(makeTool("subscription-baseline"))
          yield* fixture.initialize()

          for (const id of [42, "subscription-42"] as const) {
            const notifications = { toolsListChanged: true }
            const request = yield* listen(fixture, id, notifications)
            assertAcknowledged(yield* fixture.takeMessage, id, notifications)
            yield* request.cancel("test complete")
          }
        }))

      it.effect("should deliver a change notification when its kind is requested", () =>
        Effect.gen(function*() {
          const fixture = yield* makeSubscriptionHarness(protocol)
          yield* fixture.server.addTool(makeTool("subscription-tool-baseline"))
          yield* fixture.server.addPrompt(makePrompt("subscription-prompt-baseline"))
          yield* fixture.initialize()
          const id = "filtered-subscription"
          const notifications = {
            toolsListChanged: true,
            resourcesListChanged: true
          }
          const request = yield* listen(fixture, id, notifications)
          assertAcknowledged(yield* fixture.takeMessage, id, notifications)

          yield* fixture.server.addPrompt(makePrompt("must-not-be-delivered"))
          yield* fixture.server.addTool(makeTool("must-be-delivered"))
          yield* fixture.flushListChanged

          const toolsChanged = yield* fixture.takeMessage
          assert.strictEqual(toolsChanged.method, "notifications/tools/list_changed")
          assert.strictEqual(subscriptionIdOf(toolsChanged), id)

          yield* fixture.server.addResource(makeResource("file:///list-change-sentinel"))
          yield* fixture.flushListChanged
          const resourcesChanged = yield* fixture.takeMessage
          assert.strictEqual(resourcesChanged.method, "notifications/resources/list_changed")
          assert.strictEqual(subscriptionIdOf(resourcesChanged), id)

          yield* request.cancel()
        }))

      it.effect("should deliver a resource update when its URI is subscribed", () =>
        Effect.gen(function*() {
          const fixture = yield* makeSubscriptionHarness(protocol)
          yield* fixture.initialize()
          const id = "resource-uri-subscription"
          const notifications = { resourceSubscriptions: ["file:///subscribed"] }
          const request = yield* listen(fixture, id, notifications)
          assertAcknowledged(yield* fixture.takeMessage, id, notifications)

          yield* fixture.server.notifications["notifications/resources/updated"]({ uri: "file:///other" })
          yield* fixture.server.notifications["notifications/resources/updated"]({ uri: "file:///subscribed" })
          const resourceUpdated = yield* fixture.takeMessage
          assert.strictEqual(resourceUpdated.method, "notifications/resources/updated")
          assert.strictEqual(subscriptionIdOf(resourceUpdated), id)
          assert.strictEqual(paramsOf(resourceUpdated).uri, "file:///subscribed")
          yield* request.cancel()
        }))

      it.effect("should acknowledge only the supported subset when requested filters exceed server capabilities", () =>
        Effect.gen(function*() {
          const fixture = yield* makeMcpStdioHarness(protocol, [protocol], toolOnlyRegistration)
          yield* fixture.initialize()
          const request = yield* listen(fixture, "honored-subset", {
            toolsListChanged: true,
            promptsListChanged: true
          })

          assertAcknowledged(yield* fixture.takeMessage, request.id, { toolsListChanged: true })
          yield* request.cancel()

          const unsupported = yield* listen(fixture, "unsupported-filters", {
            toolsListChanged: false,
            promptsListChanged: true
          })
          assertAcknowledged(yield* fixture.takeMessage, unsupported.id, {})
          yield* unsupported.cancel()
        }))

      it.effect("should deliver a matching event to each subscription", () =>
        Effect.gen(function*() {
          const fixture = yield* makeSubscriptionHarness(protocol)
          yield* fixture.initialize()
          const first = yield* listen(fixture, "fanout-first", { toolsListChanged: true })
          const second = yield* listen(fixture, "fanout-second", { toolsListChanged: true })
          assertAcknowledged(yield* fixture.takeMessage, first.id, { toolsListChanged: true })
          assertAcknowledged(yield* fixture.takeMessage, second.id, { toolsListChanged: true })

          yield* fixture.server.addTool(makeTool("fanout-event"))
          yield* fixture.flushListChanged
          const delivered = [yield* fixture.takeMessage, yield* fixture.takeMessage]
          assert.deepStrictEqual(
            delivered.map(subscriptionIdOf).sort(),
            [first.id, second.id].sort()
          )
          yield* first.cancel()
          yield* second.cancel()
        }))

      it.effect("should keep another subscription active when its peer is cancelled", () =>
        Effect.gen(function*() {
          const fixture = yield* makeSubscriptionHarness(protocol)
          yield* fixture.server.addTool(makeTool("concurrent-tool-baseline"))
          yield* fixture.initialize()
          const tools = yield* listen(fixture, "tools-subscription", { toolsListChanged: true })
          const resources = yield* listen(fixture, "resources-subscription", {
            resourceSubscriptions: ["file:///sentinel"]
          })
          assertAcknowledged(yield* fixture.takeMessage, tools.id, { toolsListChanged: true })
          assertAcknowledged(yield* fixture.takeMessage, resources.id, {
            resourceSubscriptions: ["file:///sentinel"]
          })

          yield* fixture.server.addTool(makeTool("concurrent-tool-event"))
          yield* fixture.flushListChanged
          const toolsChanged = yield* fixture.takeMessage
          assert.strictEqual(toolsChanged.method, "notifications/tools/list_changed")
          assert.strictEqual(subscriptionIdOf(toolsChanged), tools.id)

          yield* fixture.server.notifications["notifications/resources/updated"]({ uri: "file:///sentinel" })
          const resourceUpdated = yield* fixture.takeMessage
          assert.strictEqual(resourceUpdated.method, "notifications/resources/updated")
          assert.strictEqual(subscriptionIdOf(resourceUpdated), resources.id)

          yield* tools.cancel("only tools are no longer needed")
          yield* fixture.sendRequest("ping", {})
          yield* fixture.server.addTool(makeTool("cancelled-tools-must-not-receive"))
          yield* fixture.flushListChanged
          yield* fixture.server.notifications["notifications/resources/updated"]({ uri: "file:///sentinel" })

          const surviving = yield* fixture.takeMessage
          assert.strictEqual(surviving.method, "notifications/resources/updated")
          assert.strictEqual(subscriptionIdOf(surviving), resources.id)
          yield* resources.cancel()
        }))

      it.effect("should preserve notification metadata and own the subscription identifier", () =>
        Effect.gen(function*() {
          const fixture = yield* makeSubscriptionHarness(protocol)
          yield* fixture.initialize()
          const request = yield* listen(fixture, "authoritative-subscription", { toolsListChanged: true })
          assertAcknowledged(yield* fixture.takeMessage, request.id, { toolsListChanged: true })

          yield* fixture.server.notifications["notifications/tools/list_changed"]({
            _meta: {
              source: "metadata-sentinel",
              [subscriptionIdKey]: "untrusted-subscription"
            }
          })
          const notification = yield* fixture.takeMessage
          const params = paramsOf(notification)
          const metadata = params._meta
          assert.strictEqual(notification.method, "notifications/tools/list_changed")
          assert(Predicate.isObject(metadata))
          assert.strictEqual(metadata.source, "metadata-sentinel")
          assert.strictEqual(metadata[subscriptionIdKey], request.id)
          yield* request.cancel()
        }))

      it.effect("should deliver modern changes only when an active subscription matches", () =>
        Effect.gen(function*() {
          const fixture = yield* makeSubscriptionHarness(protocol)
          yield* fixture.initialize()
          yield* fixture.server.addTool(makeTool("unsolicited-modern-tool"))
          yield* fixture.flushListChanged

          const request = yield* listen(fixture, "prompt-sentinel", { promptsListChanged: true })
          assertAcknowledged(yield* fixture.takeMessage, request.id, { promptsListChanged: true })
          yield* fixture.server.addPrompt(makePrompt("prompt-sentinel"))
          yield* fixture.flushListChanged
          const notification = yield* fixture.takeMessage
          assert.strictEqual(notification.method, "notifications/prompts/list_changed")
          assert.strictEqual(subscriptionIdOf(notification), request.id)
          yield* request.cancel()
        }))

      it.effect("should preserve legacy notification delivery when modern and legacy adapters are configured", () =>
        Effect.gen(function*() {
          const legacy = McpProtocol.v2025_06_18
          const fixture = yield* makeSubscriptionHarness(legacy, [protocol, legacy])
          yield* fixture.server.addTool(makeTool("mixed-era-baseline"))
          yield* fixture.initialize()
          yield* fixture.sendRequest("tools/list", {})
          yield* fixture.server.addTool(makeTool("mixed-era-legacy-event"))
          yield* fixture.flushListChanged

          const notification = yield* fixture.awaitOutboundMethod("notifications/tools/list_changed")
          assert.notProperty(notification, "id")
          assert.notProperty(paramsOf(notification), "_meta")
        }))

      it.effect("should keep idle HTTP subscriptions alive with periodic SSE comments", () =>
        Effect.gen(function*() {
          const clock = yield* makeTrackingClock
          const { harness, serverReady } = yield* makeHttpSubscriptionHarness(
            protocol,
            clock.layer
          )
          yield* harness.post({
            jsonrpc: "2.0",
            id: "ready",
            method: "server/discover",
            params: { _meta: httpMetadata(protocol) }
          }, { "MCP-Protocol-Version": protocol.protocolVersion, "Mcp-Method": "server/discover" })
          yield* TestClock.adjust("1 second")
          const response = yield* harness.post(httpListenRequest(protocol, "idle-http"), httpHeaders(protocol))
          assert.match(response.headers.get("content-type") ?? "", /^text\/event-stream/)
          assert.isNotNull(response.body)
          const reader = response.body.getReader()
          yield* Effect.addFinalizer(() => Effect.promise(() => reader.cancel()))
          const read = Effect.promise(() => reader.read())
          const decoder = new TextDecoder()
          const acknowledgment = decoder.decode((yield* read).value)
          assert.isTrue(acknowledgment.startsWith("data: "))
          assertAcknowledged(JSON.parse(acknowledgment.slice(6)), "idle-http", { toolsListChanged: true })

          const next = yield* read.pipe(Effect.forkChild)
          yield* TestClock.adjust("14 seconds")
          assert.isUndefined(next.pollUnsafe())
          yield* TestClock.adjust("1 second")
          assert.isDefined(next.pollUnsafe())
          assert.strictEqual(decoder.decode((yield* Fiber.join(next)).value), ": keepalive\n\n")
          const heartbeat = yield* read.pipe(Effect.forkChild)
          yield* TestClock.adjust("15 seconds")
          assert.strictEqual(decoder.decode((yield* Fiber.join(heartbeat)).value), ": keepalive\n\n")

          const tools = yield* harness.post({
            jsonrpc: "2.0",
            id: "tools-during-subscription",
            method: "tools/list",
            params: { _meta: httpMetadata(protocol) }
          }, { "MCP-Protocol-Version": protocol.protocolVersion, "Mcp-Method": "tools/list" })
          assert.match(tools.headers.get("content-type") ?? "", /^application\/json/)
          const listed = yield* Effect.promise(() => tools.json())
          assert.strictEqual(listed.id, "tools-during-subscription")
          assert.deepStrictEqual(listed.result.tools, [
            { name: "http-subscription-baseline", inputSchema: { type: "object", properties: {} } }
          ])
          assert.strictEqual(clock.activeSleeps(), 1)

          const server = yield* Deferred.await(serverReady)
          yield* server.notifications["notifications/tools/list_changed"]({})
          const notification = decoder.decode((yield* read).value)
          assert.isTrue(notification.startsWith("data: "))
          const message = JSON.parse(notification.slice(6))
          assert.strictEqual(message.method, "notifications/tools/list_changed")
          assert.strictEqual(subscriptionIdOf(message), "idle-http")
          yield* Effect.promise(() => reader.cancel())
          assert.strictEqual(clock.activeSleeps(), 0)
          yield* TestClock.adjust("30 seconds")
          assert.deepStrictEqual(yield* read, { done: true, value: undefined })
          assert.strictEqual(clock.activeSleeps(), 0)
        }))

      it.effect("should stream acknowledgment before matching events when using HTTP", () =>
        Effect.gen(function*() {
          const { harness, serverReady } = yield* makeHttpSubscriptionHarness(protocol)
          const id = "reusable-http-subscription"

          const firstResponse = yield* harness.post(httpListenRequest(protocol, id), httpHeaders(protocol))
          const server = yield* Deferred.await(serverReady)
          const first = makeMcpSseReader(firstResponse)
          assertAcknowledged(yield* first.take(), id, { toolsListChanged: true })
          yield* server.addTool(makeTool("http-subscription-event"))
          const notification = yield* first.take()
          assert.strictEqual(notification.method, "notifications/tools/list_changed")
          assert.strictEqual(subscriptionIdOf(notification), id)
          yield* first.cancel
        }))

      it.effect("should close only the HTTP subscription stream when its pending backlog overflows", () =>
        Effect.gen(function*() {
          const clock = yield* makeTrackingClock
          const { harness, serverReady } = yield* makeHttpSubscriptionHarness(protocol, clock.layer)
          const response = yield* harness.post(
            httpListenRequest(protocol, "overflowing-http-subscription"),
            httpHeaders(protocol)
          )
          const server = yield* Deferred.await(serverReady)
          const subscription = makeMcpSseReader(response)
          assertAcknowledged(
            yield* subscription.take(),
            "overflowing-http-subscription",
            { toolsListChanged: true }
          )

          for (let index = 0; index < 1_000; index++) {
            yield* server.notifications["notifications/tools/list_changed"]({})
            yield* Effect.yieldNow
          }

          const remaining = yield* subscription.drain()
          assert.notInclude(remaining.map((message) => message.method), "notifications/cancelled")
          assert.strictEqual(clock.activeSleeps(), 0)

          const discovery = yield* harness.post({
            jsonrpc: "2.0",
            id: "server-remains-available",
            method: "server/discover",
            params: { _meta: httpMetadata(protocol) }
          }, {
            "MCP-Protocol-Version": protocol.protocolVersion,
            "Mcp-Method": "server/discover"
          })
          assert.strictEqual(discovery.status, 200)
        }))
    })
  })
