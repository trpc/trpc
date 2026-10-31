import { assert, describe, it } from "@effect/vitest"
import * as McpProtocol from "effect/ai/McpProtocol"
import * as McpSchema from "effect/ai/McpSchema"
import * as McpServer from "effect/ai/McpServer"
import * as McpTest from "effect/ai/McpTest"
import * as Tool from "effect/ai/Tool"
import * as Toolkit from "effect/ai/Toolkit"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Queue from "effect/Queue"
import * as Scheduler from "effect/Scheduler"
import * as Schema from "effect/Schema"
import { makeHeldServerScheduler } from "./TestUtils/McpHeldScheduler.ts"

class CurrentUser extends Context.Service<CurrentUser, string>()("test/CurrentUser") {}

class Unauthorized extends Schema.Error<Unauthorized>("test/Unauthorized")({
  ...McpSchema.McpErrorBase.fields,
  _tag: Schema.tag("Unauthorized"),
  code: Schema.tag(-32001)
}) {}

// The tool depends on a user service discharged by middleware and on the
// transport built-in `McpServerClient`, so a call proves both are supplied.
const WhoAmI = Toolkit.make(
  Tool.make("WhoAmI", { success: Schema.String, dependencies: [CurrentUser, McpSchema.McpServerClient] })
)
const WhoAmIHandlers = WhoAmI.toLayer({
  WhoAmI: Effect.fnUntraced(function*() {
    const user = yield* CurrentUser
    const client = yield* McpSchema.McpServerClient
    return `${user}@${client.protocolVersion}`
  })
})

describe("McpTest", () => {
  it.effect("calls tools over a negotiated session", () =>
    Effect.gen(function*() {
      const Auth = McpServer.middleware<{ provides: CurrentUser }>()((effect) =>
        Effect.provideService(effect, CurrentUser, "alice")
      )
      const registrations = McpServer.toolkit(WhoAmI).pipe(
        Layer.provide(Auth.layer),
        Layer.provide(WhoAmIHandlers)
      )
      const client = yield* McpTest.makeClient(registrations, { protocols: [McpProtocol.v2025_11_25] })

      assert.strictEqual(client.protocolVersion, "2025-11-25")
      const tools = yield* client.listTools()
      assert.deepStrictEqual(tools.tools.map((tool) => tool.name), ["WhoAmI"])
      const result = yield* client.callTool({ name: "WhoAmI" })
      assert.deepStrictEqual(result.content, [{ type: "text", text: "alice@2025-11-25" }])
    }))

  it.effect("fails with the MCP error a middleware returns", () =>
    Effect.gen(function*() {
      const Reject = McpServer.middleware<{ provides: CurrentUser }>()(() =>
        Effect.fail(new Unauthorized({ message: "Unauthorized" }))
      )
      const registrations = McpServer.toolkit(WhoAmI).pipe(
        Layer.provide(Reject.layer),
        Layer.provide(WhoAmIHandlers)
      )
      const client = yield* McpTest.makeClient(registrations, { protocols: [McpProtocol.v2025_11_25] })

      const error = yield* Effect.flip(client.callTool({ name: "WhoAmI" }))
      assert.deepInclude(error, { code: -32001, message: "Unauthorized" })
    }))

  it.effect("delivers server notifications", () =>
    Effect.gen(function*() {
      const registrations = McpServer.resource({
        uri: "test://greeting",
        name: "greeting",
        content: Effect.succeed("hello")
      })
      const client = yield* McpTest.makeClient(registrations, { protocols: [McpProtocol.v2025_11_25] })

      yield* client.subscribe({ uri: "test://greeting" })
      yield* client.server.notifications["notifications/resources/updated"]({ uri: "test://greeting" })
      const notification = yield* Queue.take(client.notifications)
      assert.strictEqual(notification.method, "notifications/resources/updated")
      assert.deepInclude(notification.payload, { uri: "test://greeting" })
    }))

  it.effect("excludes notifications emitted before the handshake", () =>
    Effect.gen(function*() {
      const { release, scheduler } = yield* makeHeldServerScheduler
      const registrations = McpServer.resource({
        uri: "test://greeting",
        name: "greeting",
        content: Effect.succeed("hello")
      })
      const client = yield* McpTest.makeClient(registrations, { protocols: [McpProtocol.v2025_11_25] }).pipe(
        Effect.provideService(Scheduler.Scheduler, scheduler)
      )
      // Let the registration's list change reach the queue after the handshake.
      yield* release

      yield* client.subscribe({ uri: "test://greeting" })
      yield* client.server.notifications["notifications/resources/updated"]({ uri: "test://greeting" })
      const notification = yield* Queue.take(client.notifications)
      assert.strictEqual(notification.method, "notifications/resources/updated")
    }))

  it.effect("rejects server-to-client requests with method not found", () =>
    Effect.gen(function*() {
      const Roots = Toolkit.make(
        Tool.make("Roots", { success: Schema.String, dependencies: [McpSchema.McpServerClient] })
      )
      const registrations = McpServer.toolkit(Roots).pipe(
        Layer.provide(Roots.toLayer({
          Roots: Effect.fnUntraced(function*() {
            const server = yield* McpSchema.McpServerClient
            const client = yield* server.getClient
            return yield* Effect.match(client.listRoots(), {
              onSuccess: () => "listed roots",
              onFailure: (error) => {
                const cause = error._tag === "McpReverseOperationError"
                  ? error.cause as McpSchema.McpErrorBase
                  : undefined
                return `${error._tag} ${cause?.code} ${cause?.message}`
              }
            })
          }, Effect.scoped)
        }))
      )
      // Advertise roots so the server sends the request instead of rejecting
      // the operation locally.
      const client = yield* McpTest.makeClient(registrations, {
        protocols: [McpProtocol.v2025_11_25],
        clientCapabilities: new McpSchema.ClientCapabilities({ roots: {} })
      })

      const result = yield* client.callTool({ name: "Roots" })
      assert.deepStrictEqual(result.content, [{
        type: "text",
        text: "McpReverseOperationError -32601 Method not found: roots/list"
      }])
    }))
})
