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
import * as Schema from "effect/Schema"
import { makeMcpStdioHarness } from "./TestUtils/McpStdioHarness.ts"

class CurrentUser extends Context.Service<CurrentUser, string>()("test/CurrentUser") {}

class Unauthorized extends Schema.Error<Unauthorized>("test/Unauthorized")({
  ...McpSchema.McpErrorBase.fields,
  _tag: Schema.tag("Unauthorized"),
  code: Schema.tag(-32001)
}) {}

const WhoAmI = Toolkit.make(Tool.make("WhoAmI", { success: Schema.String, dependencies: [CurrentUser] }))
const WhoAmIHandlers = WhoAmI.toLayer({ WhoAmI: () => Effect.map(CurrentUser, (user) => user) })

describe("McpServer request-level dependencies", () => {
  it.effect("provides declared dependencies from middleware over registration-time values", () =>
    Effect.gen(function*() {
      const Auth = McpServer.middleware<{ provides: CurrentUser }>()((effect) =>
        Effect.provideService(effect, CurrentUser, "request")
      )
      const registrations = McpServer.toolkit(WhoAmI).pipe(
        Layer.provide(Auth.layer),
        Layer.provide(WhoAmIHandlers),
        Layer.provide(Layer.succeed(CurrentUser, "registration"))
      )
      const client = yield* McpTest.makeClient(registrations, { protocols: [McpProtocol.v2025_11_25] })

      const result = yield* client.callTool({ name: "WhoAmI", arguments: {} })

      assert.deepStrictEqual(result.content, [{ type: "text", text: "request" }])
    }))

  it.effect("sends middleware failures as JSON-RPC errors", () =>
    Effect.gen(function*() {
      const Reject = McpServer.middleware<{ provides: CurrentUser }>()(() =>
        Effect.fail(new Unauthorized({ message: "Unauthorized" }))
      )
      const registrations = McpServer.toolkit(WhoAmI).pipe(
        Layer.provide(Reject.layer),
        Layer.provide(WhoAmIHandlers)
      )
      const harness = yield* makeMcpStdioHarness(McpProtocol.v2025_11_25, [McpProtocol.v2025_11_25], registrations)
      yield* harness.initialize()

      const response = yield* harness.sendRequest("tools/call", { name: "WhoAmI", arguments: {} })

      assert.deepStrictEqual(response.error, { code: -32001, message: "Unauthorized" })
    }))

  it.effect("fails calls when a visibility reads a service from middleware provided inside it", () =>
    Effect.gen(function*() {
      const Auth = McpServer.middleware<{ provides: CurrentUser }>()((effect) =>
        Effect.provideService(effect, CurrentUser, "admin")
      )
      const AdminOnly = McpServer.visibility(() => Effect.map(CurrentUser, (user) => user === "admin"))
      const Search = Toolkit.make(Tool.make("Search", { success: Schema.String }))
      // The types reject this order: the visibility's `CurrentUser` stays an unmet request requirement.
      const registrations = McpServer.toolkit(Search).pipe(
        Layer.provide(Auth.layer),
        Layer.provide(AdminOnly.layer),
        Layer.provide(Search.toLayer({ Search: () => Effect.succeed("found") }))
      ) as Layer.Layer<never, never, McpServer.McpServer>
      const harness = yield* makeMcpStdioHarness(McpProtocol.v2025_11_25, [McpProtocol.v2025_11_25], registrations)
      yield* harness.initialize()

      const response = yield* harness.sendRequest("tools/call", { name: "Search", arguments: {} })

      assert.deepStrictEqual(response.error, { code: -32603, message: "Internal error" })
    }))

  it.effect("installs only its own middleware globally", () =>
    Effect.gen(function*() {
      const calls: Array<string> = []
      const record = (name: string) => (effect: Effect.Effect<McpServer.MiddlewareSuccess, McpSchema.McpErrorBase>) =>
        Effect.andThen(Effect.sync(() => calls.push(name)), effect)
      const Local = McpServer.middleware()(record("local"))
      const Global = McpServer.middleware()(record("global"), { global: true })
      // Local is provided around the global middleware, but must only run for the registration it is provided to.
      const registrations = Layer.mergeAll(
        Layer.mergeAll(
          McpServer.resource({ uri: "test://local", name: "local", content: Effect.succeed("local") }),
          Global
        ).pipe(Layer.provide(Local.layer)),
        McpServer.resource({ uri: "test://other", name: "other", content: Effect.succeed("other") })
      )
      const client = yield* McpTest.makeClient(registrations, { protocols: [McpProtocol.v2025_11_25] })

      yield* client.readResource({ uri: "test://local" })
      const localCalls = calls.splice(0)
      yield* client.readResource({ uri: "test://other" })
      const otherCalls = calls.splice(0)

      assert.deepStrictEqual(localCalls, ["global", "local"])
      assert.deepStrictEqual(otherCalls, ["global"])
    }))

  it.effect("runs middleware provided both locally and globally once", () =>
    Effect.gen(function*() {
      let calls = 0
      const Count = McpServer.middleware()((effect) => Effect.andThen(Effect.sync(() => calls++), effect))
      const registrations = Layer.mergeAll(
        McpServer.resource({ uri: "test://counted", name: "counted", content: Effect.succeed("counted") }),
        Count.layerGlobal
      ).pipe(Layer.provide(Count.layer))
      const client = yield* McpTest.makeClient(registrations, { protocols: [McpProtocol.v2025_11_25] })

      yield* client.readResource({ uri: "test://counted" })

      assert.strictEqual(calls, 1)
    }))
})
