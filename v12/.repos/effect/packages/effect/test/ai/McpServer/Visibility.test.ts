import { assert, describe, it } from "@effect/vitest"
import * as McpProtocol from "effect/ai/McpProtocol"
import * as McpSchema from "effect/ai/McpSchema"
import * as McpServer from "effect/ai/McpServer"
import * as Tool from "effect/ai/Tool"
import * as Toolkit from "effect/ai/Toolkit"
import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as HttpRouter from "effect/http/HttpRouter"
import * as HttpServerRequest from "effect/http/HttpServerRequest"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { initializeHttpSession, makeHttpHarness } from "./TestUtils/McpHttpHarness.ts"
import { readMcpHttpResponse } from "./TestUtils/McpHttpResponse.ts"
import { type JsonRpcMessage, makeMcpStdioHarness } from "./TestUtils/McpStdioHarness.ts"

class CurrentUser extends Context.Service<CurrentUser, string>()("test/CurrentUser") {}

class CurrentTenant extends Context.Service<CurrentTenant, string>()("test/CurrentTenant") {}

class Unauthorized extends Schema.Error<Unauthorized>("test/Unauthorized")({
  ...McpSchema.McpErrorBase.fields,
  _tag: Schema.tag("Unauthorized"),
  code: Schema.tag(-32001)
}) {}

const PublicTools = Toolkit.make(Tool.make("Search", { success: Schema.String }))
const AdminTools = Toolkit.make(
  Tool.make("DeleteUser", { success: Schema.String }),
  Tool.make("ResetPassword", { success: Schema.String })
)

const names = (message: JsonRpcMessage, key: string) =>
  (message.result as Record<string, ReadonlyArray<{ readonly name: string }>>)[key].map(({ name }) => name).sort()

const AdminOnly = McpServer.visibility(() => Effect.map(CurrentUser, (user) => user === "admin"))

const makeFixture = () => {
  const state = { user: "guest", calls: [] as Array<string>, invoked: [] as Array<string> }
  const Auth = McpServer.middleware<{ provides: CurrentUser }>()((effect, options) => {
    state.calls.push(`auth ${options.method} ${options.target}`)
    return Effect.provideService(effect, CurrentUser, state.user)
  })
  const Audit = McpServer.middleware()((effect, { method }) =>
    Effect.andThen(Effect.sync(() => state.calls.push(`audit ${method}`)), effect)
  )
  return { state, Auth, Audit }
}

describe("McpServer visibility", () => {
  const makeServer = Effect.fnUntraced(function*() {
    const { Audit, Auth, state } = makeFixture()
    const registrations = Layer.mergeAll(
      McpServer.toolkit(PublicTools).pipe(
        Layer.provide(PublicTools.toLayer({ Search: () => Effect.succeed("found") }))
      ),
      McpServer.resource`test://${Schema.String}`({ name: "public-docs", content: () => Effect.succeed("public") }),
      Layer.mergeAll(
        McpServer.toolkit(AdminTools).pipe(
          Layer.provide(AdminTools.toLayer({
            DeleteUser: () => Effect.sync(() => state.invoked.push("DeleteUser")).pipe(Effect.as("deleted")),
            ResetPassword: () => Effect.sync(() => state.invoked.push("ResetPassword")).pipe(Effect.as("reset"))
          }))
        ),
        McpServer.resource({ uri: "test://secret", name: "secret", content: Effect.succeed("secret") }),
        McpServer.resource`secret://${Schema.String}`({ name: "secret-docs", content: () => Effect.succeed("secret") }),
        McpServer.prompt({
          name: "secret",
          parameters: { topic: Schema.String },
          completion: { topic: () => Effect.succeed(["a"]) },
          content: () => Effect.succeed("secret")
        })
      ).pipe(Layer.provide(Audit.combine(AdminOnly.combine(Auth)).layer))
    )
    const harness = yield* makeMcpStdioHarness(McpProtocol.v2025_11_25, [McpProtocol.v2025_11_25], registrations)
    yield* harness.initialize()
    return { harness, state }
  })

  it.effect("filters lists running only the middleware outside the visibility", () =>
    Effect.gen(function*() {
      const { harness, state } = yield* makeServer()

      assert.deepStrictEqual(names(yield* harness.sendRequest("tools/list", {}), "tools"), ["Search"])
      assert.deepStrictEqual(state.calls.splice(0), ["auth tools/list DeleteUser", "auth tools/list ResetPassword"])
      assert.deepStrictEqual(names(yield* harness.sendRequest("resources/list", {}), "resources"), [])
      assert.deepStrictEqual(
        names(yield* harness.sendRequest("resources/templates/list", {}), "resourceTemplates"),
        ["public-docs"]
      )
      assert.deepStrictEqual(names(yield* harness.sendRequest("prompts/list", {}), "prompts"), [])

      state.user = "admin"
      assert.deepStrictEqual(
        names(yield* harness.sendRequest("tools/list", {}), "tools"),
        ["DeleteUser", "ResetPassword", "Search"]
      )
      assert.deepStrictEqual(names(yield* harness.sendRequest("resources/list", {}), "resources"), ["secret"])
      assert.deepStrictEqual(
        names(yield* harness.sendRequest("resources/templates/list", {}), "resourceTemplates"),
        ["public-docs", "secret-docs"]
      )
      assert.deepStrictEqual(names(yield* harness.sendRequest("prompts/list", {}), "prompts"), ["secret"])
    }))

  it.effect("rejects requests for hidden entries as not found", () =>
    Effect.gen(function*() {
      const { harness, state } = yield* makeServer()

      const call = yield* harness.sendRequest("tools/call", { name: "DeleteUser", arguments: {} })
      assert.deepStrictEqual(call.error, { code: -32602, message: "Tool 'DeleteUser' not found" })
      assert.deepStrictEqual(state.invoked, [])
      // The visible `test://{param}` template also matches, but a hidden resource must not fall through to it.
      const read = yield* harness.sendRequest("resources/read", { uri: "test://secret" })
      assert.deepStrictEqual(read.error, { code: -32002, message: "Resource 'test://secret' not found" })
      const prompt = yield* harness.sendRequest("prompts/get", { name: "secret", arguments: { topic: "a" } })
      assert.deepStrictEqual(prompt.error, { code: -32602, message: "Prompt 'secret' not found" })
      const completion = yield* harness.sendRequest("completion/complete", {
        ref: { type: "ref/prompt", name: "secret" },
        argument: { name: "topic", value: "" }
      })
      assert.deepStrictEqual(completion.error, { code: -32602, message: "Unknown completion reference or argument" })

      state.user = "admin"
      state.calls.length = 0
      const allowed = yield* harness.sendRequest("tools/call", { name: "DeleteUser", arguments: {} })
      assert.deepStrictEqual((allowed.result as { readonly content: unknown }).content, [
        { type: "text", text: "deleted" }
      ])
      assert.deepStrictEqual(state.calls, ["auth tools/call DeleteUser", "audit tools/call"])
    }))

  it.effect("fails the whole list when middleware outside a visibility fails", () =>
    Effect.gen(function*() {
      const Reject = McpServer.middleware<{ provides: CurrentUser }>()(() =>
        Effect.fail(new Unauthorized({ message: "Unauthorized" }))
      )
      const registrations = Layer.mergeAll(
        McpServer.toolkit(PublicTools).pipe(
          Layer.provide(PublicTools.toLayer({ Search: () => Effect.succeed("found") }))
        ),
        McpServer.toolkit(AdminTools).pipe(
          Layer.provide(AdminOnly.combine(Reject).layer),
          Layer.provide(AdminTools.toLayer({
            DeleteUser: () => Effect.succeed("deleted"),
            ResetPassword: () => Effect.succeed("reset")
          }))
        )
      )
      const harness = yield* makeMcpStdioHarness(McpProtocol.v2025_11_25, [McpProtocol.v2025_11_25], registrations)
      yield* harness.initialize()

      const response = yield* harness.sendRequest("tools/list", {})

      assert.deepStrictEqual(response.error, { code: -32001, message: "Unauthorized" })
    }))

  it.effect("reads services provided by HttpRouter middleware under layerHttp", () =>
    Effect.gen(function*() {
      const HttpAuth = HttpRouter.middleware<{ provides: CurrentUser }>()((effect) =>
        Effect.flatMap(
          HttpServerRequest.HttpServerRequest,
          (request) => Effect.provideService(effect, CurrentUser, request.headers["x-user"] ?? "guest")
        )
      )
      const WhoAmI = Toolkit.make(Tool.make("WhoAmI", { success: Schema.String, dependencies: [CurrentUser] }))
      const registrations = McpServer.toolkit(WhoAmI).pipe(
        Layer.provide(AdminOnly.layer),
        Layer.provide(WhoAmI.toLayer({ WhoAmI: () => Effect.map(CurrentUser, (user) => user) }))
      )
      const harness = yield* makeHttpHarness(
        McpServer.layerHttp({
          name: "VisibilityServer",
          version: "1.0.0",
          path: "/mcp",
          protocols: [McpProtocol.v2025_11_25],
          registrations
        }).pipe(Layer.provide(HttpAuth.layer))
      )
      const headers = yield* initializeHttpSession(harness, McpProtocol.v2025_11_25)
      const send = (user: string, method: string, params: object) =>
        harness.post({ jsonrpc: "2.0", id: 1, method, params }, { ...headers, "x-user": user }).pipe(
          Effect.flatMap(readMcpHttpResponse),
          Effect.map((message) => message as JsonRpcMessage)
        )

      assert.deepStrictEqual(names(yield* send("guest", "tools/list", {}), "tools"), [])
      const hidden = yield* send("guest", "tools/call", { name: "WhoAmI", arguments: {} })
      assert.deepStrictEqual(hidden.error, { code: -32602, message: "Tool 'WhoAmI' not found" })

      assert.deepStrictEqual(names(yield* send("admin", "tools/list", {}), "tools"), ["WhoAmI"])
      const visible = yield* send("admin", "tools/call", { name: "WhoAmI", arguments: {} })
      assert.deepStrictEqual((visible.result as { readonly content: unknown }).content, [
        { type: "text", text: "admin" }
      ])
    }))

  it.effect("applies a global visibility to every registration", () =>
    Effect.gen(function*() {
      const registrations = Layer.mergeAll(
        McpServer.resource({ uri: "test://shown", name: "shown", content: Effect.succeed("shown") }),
        McpServer.resource({ uri: "test://hidden", name: "hidden", content: Effect.succeed("hidden") }),
        McpServer.visibility(({ target }) => Effect.succeed(target !== "test://hidden"), { global: true })
      )
      const harness = yield* makeMcpStdioHarness(McpProtocol.v2025_11_25, [McpProtocol.v2025_11_25], registrations)
      yield* harness.initialize()

      assert.deepStrictEqual(names(yield* harness.sendRequest("resources/list", {}), "resources"), ["shown"])
      const read = yield* harness.sendRequest("resources/read", { uri: "test://hidden" })
      assert.deepStrictEqual(read.error, { code: -32002, message: "Resource 'test://hidden' not found" })
    }))

  it.effect("re-checks visibility on input_required continuations", () =>
    Effect.gen(function*() {
      const { Auth, state } = makeFixture()
      const registrations = Layer.effectDiscard(Effect.gen(function*() {
        const server = yield* McpServer.McpServer
        yield* server.addTool({
          tool: new McpSchema.Tool({ name: "Approve", inputSchema: { type: "object" } }),
          annotations: Context.empty(),
          services: yield* Effect.context<never>(),
          handle: () =>
            Effect.succeed(
              new McpSchema.InputRequired({ inputRequests: { roots: { method: "roots/list" } }, requestState: "round" })
            )
        })
      })).pipe(Layer.provide(AdminOnly.combine(Auth).layer))
      const harness = yield* makeMcpStdioHarness(McpProtocol.v2026_07_28, [McpProtocol.v2026_07_28], registrations)
      const _meta = {
        "io.modelcontextprotocol/protocolVersion": McpProtocol.v2026_07_28.protocolVersion,
        "io.modelcontextprotocol/clientCapabilities": { roots: {} },
        "io.modelcontextprotocol/clientInfo": { name: "client", version: "1" }
      }

      state.user = "admin"
      const first = yield* harness.sendRequest("tools/call", { name: "Approve", arguments: {}, _meta })
      assert.strictEqual((first.result as { readonly resultType: string }).resultType, "input_required")

      state.user = "guest"
      const second = yield* harness.sendRequest("tools/call", {
        name: "Approve",
        arguments: {},
        requestState: "round",
        inputResponses: { roots: { roots: [] } },
        _meta
      })
      assert.deepStrictEqual(second.error, { code: -32602, message: "Tool 'Approve' not found" })
    }))

  it.effect("keeps middleware provided locally and globally outside a visibility that reads it", () =>
    Effect.gen(function*() {
      const { Auth, state } = makeFixture()
      const registrations = Layer.mergeAll(
        McpServer.toolkit(AdminTools).pipe(
          Layer.provide(Auth.layer),
          Layer.provide(AdminTools.toLayer({
            DeleteUser: () => Effect.succeed("deleted"),
            ResetPassword: () => Effect.succeed("reset")
          }))
        ),
        AdminOnly.combine(Auth).layerGlobal
      )
      const harness = yield* makeMcpStdioHarness(McpProtocol.v2025_11_25, [McpProtocol.v2025_11_25], registrations)
      yield* harness.initialize()

      assert.deepStrictEqual(names(yield* harness.sendRequest("tools/list", {}), "tools"), [])
      state.user = "admin"
      assert.deepStrictEqual(
        names(yield* harness.sendRequest("tools/list", {}), "tools"),
        ["DeleteUser", "ResetPassword"]
      )
      const call = yield* harness.sendRequest("tools/call", { name: "DeleteUser", arguments: {} })
      assert.deepStrictEqual((call.result as { readonly content: unknown }).content, [
        { type: "text", text: "deleted" }
      ])
    }))

  it.effect("runs nested visibilities from the outside in on lists", () =>
    Effect.gen(function*() {
      const state = { user: "guest", plan: "free", calls: [] as Array<string> }
      const Auth = McpServer.middleware<{ provides: CurrentUser }>()((effect) =>
        Effect.andThen(
          Effect.sync(() => state.calls.push("auth")),
          Effect.provideService(effect, CurrentUser, state.user)
        )
      )
      const SignedIn = McpServer.visibility(() =>
        Effect.map(CurrentUser, (user) => {
          state.calls.push(`signed-in ${user}`)
          return user !== "guest"
        })
      )
      const Tenant = McpServer.middleware<{ provides: CurrentTenant }>()((effect) =>
        Effect.andThen(
          Effect.sync(() => state.calls.push("tenant")),
          Effect.provideService(effect, CurrentTenant, state.plan)
        )
      )
      const Paid = McpServer.visibility(() =>
        Effect.gen(function*() {
          const user = yield* CurrentUser
          const plan = yield* CurrentTenant
          state.calls.push(`paid ${user} ${plan}`)
          return plan === "paid"
        })
      )
      const Audit = McpServer.middleware()((effect) =>
        Effect.andThen(Effect.sync(() => state.calls.push("audit")), effect)
      )
      const Billing = Toolkit.make(Tool.make("Invoice", { success: Schema.String }))
      const registrations = McpServer.toolkit(Billing).pipe(
        Layer.provide(Audit.combine(Paid.combine(Tenant.combine(SignedIn.combine(Auth)))).layer),
        Layer.provide(Billing.toLayer({ Invoice: () => Effect.succeed("invoice") }))
      )
      const harness = yield* makeMcpStdioHarness(McpProtocol.v2025_11_25, [McpProtocol.v2025_11_25], registrations)
      yield* harness.initialize()

      assert.deepStrictEqual(names(yield* harness.sendRequest("tools/list", {}), "tools"), [])
      assert.deepStrictEqual(state.calls.splice(0), ["auth", "signed-in guest"])

      state.user = "alice"
      assert.deepStrictEqual(names(yield* harness.sendRequest("tools/list", {}), "tools"), [])
      assert.deepStrictEqual(state.calls.splice(0), ["auth", "signed-in alice", "tenant", "paid alice free"])

      state.plan = "paid"
      assert.deepStrictEqual(names(yield* harness.sendRequest("tools/list", {}), "tools"), ["Invoice"])
      assert.deepStrictEqual(state.calls.splice(0), ["auth", "signed-in alice", "tenant", "paid alice paid"])
    }))

  it.effect("passes middleware outside a visibility an MCP error for hidden requests", () =>
    Effect.gen(function*() {
      const LogCode = McpServer.middleware()((effect) =>
        Effect.tapError(effect, (error) => Effect.sync(() => error.code.toFixed(0)))
      )
      const registrations = McpServer.toolkit(AdminTools).pipe(
        Layer.provide(McpServer.visibility(() => Effect.succeed(false)).combine(LogCode).layer),
        Layer.provide(AdminTools.toLayer({
          DeleteUser: () => Effect.succeed("deleted"),
          ResetPassword: () => Effect.succeed("reset")
        }))
      )
      const harness = yield* makeMcpStdioHarness(McpProtocol.v2025_11_25, [McpProtocol.v2025_11_25], registrations)
      yield* harness.initialize()

      const call = yield* harness.sendRequest("tools/call", { name: "DeleteUser", arguments: {} })

      assert.deepStrictEqual(call.error, { code: -32602, message: "Tool 'DeleteUser' not found" })
    }))

  it.effect("propagates interruption from middleware outside a visibility on lists", () =>
    Effect.gen(function*() {
      const targets: Array<string> = []
      const Interrupt = McpServer.middleware()((effect, { target }) =>
        Effect.catchCause(effect, (cause) => {
          targets.push(target)
          return Effect.failCause(Cause.combine(cause, Cause.interrupt(123)))
        })
      )
      const registrations = McpServer.toolkit(AdminTools).pipe(
        Layer.provide(McpServer.visibility(() => Effect.succeed(false)).combine(Interrupt).layer),
        Layer.provide(AdminTools.toLayer({
          DeleteUser: () => Effect.succeed("deleted"),
          ResetPassword: () => Effect.succeed("reset")
        }))
      )
      const harness = yield* makeMcpStdioHarness(McpProtocol.v2025_11_25, [McpProtocol.v2025_11_25], registrations)
      yield* harness.initialize()

      const response = yield* harness.sendRequest("tools/list", {})

      assert.isUndefined(response.result)
      assert.deepStrictEqual(targets, ["DeleteUser"])
    }))
})
