import { hole } from "effect"
import { McpProtocol, McpSchema, McpServer, Tool, Toolkit } from "effect/ai"
import type * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as HttpClient from "effect/http/HttpClient"
import type * as HttpRouter from "effect/http/HttpRouter"
import * as Layer from "effect/Layer"
import * as Rpc from "effect/rpc/Rpc"
import * as RpcGroup from "effect/rpc/RpcGroup"
import * as Schema from "effect/Schema"
import type * as Scope from "effect/Scope"
import type * as Stdio from "effect/Stdio"
import { describe, expect, it } from "tstyche"
// Cross-project imports cannot use .ts with rewriteRelativeImportExtensions (TS2878).
// oxlint-disable-next-line effect/no-js-extension-imports
import * as McpProtocolInternal from "../../src/ai/internal/mcpProtocol.js"

const serverOptions = {
  name: "TestServer",
  version: "1.0.0",
  protocols: [McpProtocol.v2025_11_25]
} as const

type Requires<S> = McpServer.McpRequest<"Requires", S>

describe("McpServer", () => {
  it("should expose protocol-neutral request facts without a session service", () => {
    expect(McpSchema.McpRequestContext.useSync((context) => context.protocolVersion)).type.toBe<
      Effect.Effect<string, never, McpSchema.McpRequestContext>
    >()
    expect(McpSchema.McpRequestContext.useSync((context) => context.clientInfo)).type.toBe<
      Effect.Effect<McpSchema.Implementation | undefined, never, McpSchema.McpRequestContext>
    >()
    expect(McpServer.clientCapabilities).type.toBe<
      Effect.Effect<McpSchema.ClientCapabilities, never, McpSchema.McpRequestContext>
    >()
  })

  it("should accept scalar tool output schemas while keeping inputs object-rooted", () => {
    expect(McpSchema.Tool.make).type.toBeCallableWith({
      name: "scalar-output",
      inputSchema: { type: "object" },
      outputSchema: { type: "string" }
    })
    expect({ type: "string" } as const).type.not.toBeAssignableTo<McpSchema.ToolJson>()
  })

  it("should accept JSON-valued structured sampling results", () => {
    expect(McpSchema.ToolResultContent.make).type.toBeCallableWith({
      toolUseId: "call-1",
      content: [],
      structuredContent: ["sunny", null, 24]
    })
  })

  describe("protocol configuration", () => {
    it("should restrict request-scoped HTTP to stateless protocols without session options", () => {
      const options = {
        name: "TestServer",
        version: "1.0.0",
        path: "/mcp",
        protocols: [McpProtocol.v2026_07_28]
      } as const

      expect(McpServer.layerHttpRequestScoped).type.toBeCallableWith(options)
      expect(McpServer.layerHttpRequestScoped).type.not.toBeCallableWith({
        ...options,
        protocols: [McpProtocol.v2025_11_25] as const
      })
      expect(McpServer.layerHttpRequestScoped).type.not.toBeCallableWith({
        ...options,
        protocols: [McpProtocol.v2026_07_28, McpProtocol.v2025_11_25] as const
      })
      expect(McpServer.layerHttpRequestScoped).type.not.toBeCallableWith({
        ...options,
        allowSubscriptions: true
      })
      expect(McpServer.layerHttpRequestScoped).type.not.toBeCallableWith({
        ...options,
        allowSessionTermination: true
      })
    })

    it("should accept a non-empty protocol declaration when constructing any server", () => {
      expect(McpServer.run).type.toBeCallableWith(serverOptions)
      expect(McpServer.layer).type.toBeCallableWith(serverOptions)
      expect(McpServer.layerStdio).type.toBeCallableWith(serverOptions)
      expect(McpServer.layerHttp).type.toBeCallableWith({
        ...serverOptions,
        path: "/mcp",
        allowedOrigins: ["https://mcp.example"]
      })
    })

    it("should require a protocol declaration when constructing a server", () => {
      expect(McpServer.layer).type.not.toBeCallableWith({
        name: "TestServer",
        version: "1.0.0"
      })
    })

    it("should reject an empty protocol declaration when constructing a server", () => {
      expect(McpServer.layer).type.not.toBeCallableWith({
        name: "TestServer",
        version: "1.0.0",
        protocols: [] as const
      })
    })

    it("should reject version strings when protocol adapter values are required", () => {
      expect(McpServer.layer).type.not.toBeCallableWith({
        name: "TestServer",
        version: "1.0.0",
        protocols: ["2025-06-18"] as const
      })
    })

    it("should require client notification RPCs to be included in the complete client RPC group", () => {
      const Request = Rpc.make("request", {
        payload: Schema.Struct({}),
        success: Schema.Struct({})
      })
      const Notification = Rpc.make("notification", {
        payload: Schema.Struct({}),
        success: Schema.Struct({})
      })

      expect(McpProtocolInternal.make).type.not.toBeCallableWith({
        protocolVersion: "test",
        clientRpcs: RpcGroup.make(Request),
        clientNotificationRpcs: RpcGroup.make(Notification),
        serverRequestRpcs: RpcGroup.make(),
        serverNotificationRpcs: RpcGroup.make()
      })
    })

    it("should expose every historical protocol adapter", () => {
      expect<McpProtocol.ProtocolVersion>().type.toBe<
        "2024-11-05" | "2025-03-26" | "2025-06-18" | "2025-11-25" | "2026-07-28"
      >()
    })

    it("should expose each historical protocol through the structural adapter interface", () => {
      expect(McpProtocol.v2024_11_05).type.toBeAssignableTo<McpProtocol.ProtocolAdapter<"2024-11-05">>()
      expect(McpProtocol.v2025_03_26).type.toBeAssignableTo<McpProtocol.ProtocolAdapter<"2025-03-26">>()
      expect(McpProtocol.v2025_06_18).type.toBeAssignableTo<McpProtocol.ProtocolAdapter<"2025-06-18">>()
      expect(McpProtocol.v2025_11_25).type.toBeAssignableTo<McpProtocol.ProtocolAdapter<"2025-11-25">>()
      expect(McpProtocol.v2026_07_28).type.toBeAssignableTo<McpProtocol.ProtocolAdapter<"2026-07-28">>()
      expect(McpProtocol.v2025_06_18.runtime).type.toBe<McpProtocol.StatefulRuntimeDescriptor>()
      expect(McpProtocol.v2026_07_28.runtime).type.toBe<McpProtocol.StatelessRuntimeDescriptor>()

      const protocols: readonly [McpProtocol.ProtocolAdapter, ...Array<McpProtocol.ProtocolAdapter>] = [
        McpProtocol.v2024_11_05,
        McpProtocol.v2025_03_26,
        McpProtocol.v2025_06_18,
        McpProtocol.v2025_11_25,
        McpProtocol.v2026_07_28
      ]

      expect(protocols[0].protocolVersion).type.toBe<McpProtocol.ProtocolVersion>()
      expect(protocols[0].runtime).type.toBe<McpProtocol.RuntimeDescriptor>()
      expect(protocols[0].runtime.transport).type.toBe<McpProtocol.TransportPolicy>()
      expect(protocols[0].clientRpcs.requests).type.toBeAssignableTo<ReadonlyMap<string, Rpc.Any>>()
    })

    it("should preserve the decoded tool JSON Schema shape", () => {
      expect<Schema.Schema.Type<typeof McpSchema.ToolJson>>().type.toBe<McpSchema.ToolJson>()
    })

    it("should expose invalid protocol declarations as typed constructor failures", () => {
      const run = McpServer.run(serverOptions)
      const layer = McpServer.layer(serverOptions)

      expect<Effect.Error<typeof run>>().type.toBe<Cause.IllegalArgumentError>()
      expect<Layer.Error<typeof layer>>().type.toBe<Cause.IllegalArgumentError>()
    })
  })

  it("should make declared toolkit dependencies request-level in both registration APIs", () => {
    const toolkit = Toolkit.make(Tool.make("http", { dependencies: [HttpClient.HttpClient] }))
    const registered = McpServer.registerToolkit(toolkit)
    const layer = McpServer.toolkit(toolkit)
    type Requirements = McpServer.McpServer | Tool.HandlersFor<typeof toolkit.tools> | Requires<HttpClient.HttpClient>

    expect<Effect.Services<typeof registered>>().type.toBe<Requirements>()
    expect<Layer.Services<typeof layer>>().type.toBe<Requirements>()
  })

  it("should keep toolkit schema services registration-time unless a tool declares them", () => {
    class IdCodec extends Context.Service<IdCodec, { readonly n: number }>()("IdCodec") {}
    class TagEncoder extends Context.Service<TagEncoder, { readonly n: number }>()("TagEncoder") {}
    const Id = hole<Schema.Codec<string, string, IdCodec, never>>()
    const Tag = hole<Schema.Codec<string, string, never, TagEncoder>>()
    const plain = Toolkit.make(Tool.make("plain", { parameters: Schema.Struct({ id: Id }), success: Tag }))
    const declared = Toolkit.make(Tool.make("declared", {
      parameters: Schema.Struct({ id: Id }),
      success: Schema.String,
      dependencies: [IdCodec, McpSchema.McpRequestContext]
    }))
    const plainLayer = McpServer.toolkit(plain)
    const declaredLayer = McpServer.toolkit(declared)

    expect<Layer.Services<typeof plainLayer>>().type.toBe<
      McpServer.McpServer | Tool.HandlersFor<typeof plain.tools> | IdCodec | TagEncoder
    >()
    expect<Layer.Services<typeof declaredLayer>>().type.toBe<
      McpServer.McpServer | Tool.HandlersFor<typeof declared.tools> | Requires<IdCodec>
    >()
  })

  describe("resource templates", () => {
    class Lookup extends Context.Service<Lookup, { readonly values: Array<string> }>()("Lookup") {}
    class IdCodec extends Context.Service<IdCodec, { readonly n: number }>()("IdCodec") {}
    class TagEncoder extends Context.Service<TagEncoder, { readonly n: number }>()("TagEncoder") {}

    it("should require template decoding services in both APIs", () => {
      const UserId = hole<Schema.Codec<string, string, IdCodec, never>>()
      const options = {
        name: "by-id",
        content: (_uri: string, id: string) => Effect.succeed(id)
      }
      const registered = McpServer.registerResource`user://${McpSchema.param("id", UserId)}`(options)
      const layer = McpServer.resource`user://${McpSchema.param("id", UserId)}`(options)

      expect<Effect.Services<typeof registered>>().type.toBe<IdCodec | McpServer.McpServer>()
      expect<Layer.Services<typeof layer>>().type.toBe<IdCodec | McpServer.McpServer>()
    })

    it("should require template completion encoding services in both APIs", () => {
      const Tag = hole<Schema.Codec<string, string, never, TagEncoder>>()
      const options = {
        name: "by-tag",
        completion: { tag: (input: string) => Effect.succeed([input]) },
        content: (_uri: string, tag: string) => Effect.succeed(tag)
      }
      const registered = McpServer.registerResource`tag://${McpSchema.param("tag", Tag)}`(options)
      const layer = McpServer.resource`tag://${McpSchema.param("tag", Tag)}`(options)

      expect<Effect.Services<typeof registered>>().type.toBe<TagEncoder | McpServer.McpServer>()
      expect<Layer.Services<typeof layer>>().type.toBe<TagEncoder | McpServer.McpServer>()
    })

    it("should make services used by one-argument completion handlers request-level in both APIs", () => {
      const registered = McpServer.registerResource`file://${Schema.String}`({
        name: "lookup",
        completion: { param0: (_input) => Effect.map(Lookup, (lookup) => lookup.values) },
        content: (_uri, path) => Effect.succeed(path)
      })
      const layer = McpServer.resource`file://${Schema.String}`({
        name: "lookup",
        completion: { param0: (_input) => Effect.map(Lookup, (lookup) => lookup.values) },
        content: (_uri, path) => Effect.succeed(path)
      })

      expect<Effect.Services<typeof registered>>().type.toBe<Requires<Lookup> | McpServer.McpServer>()
      expect<Layer.Services<typeof layer>>().type.toBe<Requires<Lookup> | McpServer.McpServer>()
    })

    it("should make services used by two-argument completion handlers request-level in both APIs", () => {
      const registered = McpServer.registerResource`file://${Schema.String}`({
        name: "lookup",
        completion: { param0: (_input, _context) => Effect.map(Lookup, (lookup) => lookup.values) },
        content: (_uri, path) => Effect.succeed(path)
      })
      const layer = McpServer.resource`file://${Schema.String}`({
        name: "lookup",
        completion: { param0: (_input, _context) => Effect.map(Lookup, (lookup) => lookup.values) },
        content: (_uri, path) => Effect.succeed(path)
      })

      expect<Effect.Services<typeof registered>>().type.toBe<Requires<Lookup> | McpServer.McpServer>()
      expect<Layer.Services<typeof layer>>().type.toBe<Requires<Lookup> | McpServer.McpServer>()
    })
  })

  describe("prompts", () => {
    class Lookup extends Context.Service<Lookup, { readonly values: Array<string> }>()("Lookup") {}
    const name = () => Effect.map(Lookup, (lookup) => lookup.values)

    it("should require prompt completion encoding services in both APIs", () => {
      class TagEncoder extends Context.Service<TagEncoder, { readonly n: number }>()("TagEncoder") {}
      const Tag = hole<Schema.Codec<string, string, never, TagEncoder>>()
      const options = {
        name: "tagged",
        parameters: { tag: Tag },
        completion: { tag: (input: string) => Effect.succeed([input]) },
        content: ({ tag }: { readonly tag: string }) => Effect.succeed(tag)
      }
      const registered = McpServer.registerPrompt(options)
      const layer = McpServer.prompt(options)

      expect<Effect.Services<typeof registered>>().type.toBe<TagEncoder | McpServer.McpServer>()
      expect<Layer.Services<typeof layer>>().type.toBe<TagEncoder | McpServer.McpServer>()
    })

    it("should make services used by completion handlers request-level", () => {
      const options = {
        name: "lookup",
        parameters: { name: Schema.String },
        completion: { name },
        content: () => Effect.succeed("content")
      }
      const registered = McpServer.registerPrompt(options)
      const layer = McpServer.prompt(options)

      expect<Effect.Services<typeof registered>>().type.toBe<Requires<Lookup> | McpServer.McpServer>()
      expect<Layer.Services<typeof layer>>().type.toBe<Requires<Lookup> | McpServer.McpServer>()
    })

    it("should make services used by optional completion handlers request-level", () => {
      const completion: { readonly name?: typeof name } = { name }
      const options = {
        name: "lookup",
        parameters: { name: Schema.String },
        completion,
        content: () => Effect.succeed("content")
      }
      const registered = McpServer.registerPrompt(options)
      const layer = McpServer.prompt(options)

      expect<Effect.Services<typeof registered>>().type.toBe<Requires<Lookup> | McpServer.McpServer>()
      expect<Layer.Services<typeof layer>>().type.toBe<Requires<Lookup> | McpServer.McpServer>()
    })
  })

  describe("request context", () => {
    it("should not claim that stateless handlers receive the legacy client service", () => {
      const layer = McpServer.resource({
        uri: "file:///legacy-client.txt",
        name: "legacy-client",
        content: McpSchema.McpServerClient.useSync((client) => client.clientInfo.name)
      })
      expect<Layer.Services<typeof layer>>().type.toBe<McpServer.McpServer | Requires<McpSchema.McpServerClient>>()
    })

    it("should expose multi-round-trip input through the request context", () => {
      expect(McpSchema.McpRequestContext.useSync((context) => context.inputResponses)).type.toBe<
        Effect.Effect<
          Readonly<Record<string, McpSchema.McpInputResponse>> | undefined,
          never,
          McpSchema.McpRequestContext
        >
      >()
      expect(McpSchema.McpRequestContext.useSync((context) => context.requestState)).type.toBe<
        Effect.Effect<string | undefined, never, McpSchema.McpRequestContext>
      >()
      expect(
        new McpSchema.InputRequired({
          inputRequests: {
            approval: { method: "elicitation/create", params: { message: "Approve" } }
          }
        })
      ).type.toBe<McpSchema.InputRequired>()
      expect(
        new McpSchema.InputRequired({
          requestState: "retry-after-1s"
        })
      ).type.toBe<McpSchema.InputRequired>()
      expect(McpSchema.InputRequired).type.not.toBeConstructableWith({})
    })

    it("should expose the selected protocol version when a handler reads its client", () => {
      expect(McpSchema.McpServerClient.useSync((client) => client.protocolVersion)).type.toBe<
        Effect.Effect<McpProtocol.StatefulProtocolVersion, never, McpSchema.McpServerClient>
      >()
    })

    it("should expose initialization data and the generated reverse RPC client", () => {
      expect(McpSchema.McpServerClient.useSync((client) => client.initializePayload.capabilities)).type.toBe<
        Effect.Effect<McpSchema.ClientCapabilities, never, McpSchema.McpServerClient>
      >()
      expect(McpSchema.McpServerClient.useSync((client) => client.initializePayload.clientInfo)).type.toBe<
        Effect.Effect<McpSchema.Implementation, never, McpSchema.McpServerClient>
      >()
      expect(McpSchema.McpServerClient.use((client) => client.getClient)).type.toBeAssignableTo<
        Effect.Effect<object, never, McpSchema.McpServerClient | Scope.Scope>
      >()
    })
  })

  describe("request-level dependencies", () => {
    class CurrentUser extends Context.Service<CurrentUser, { readonly id: string }>()("CurrentUser") {}

    const UserToolkit = Toolkit.make(Tool.make("WhoAmI", { success: Schema.String, dependencies: [CurrentUser] }))
    type UserHandlers = Tool.HandlersFor<typeof UserToolkit.tools>
    const UserTools = McpServer.toolkit(UserToolkit)
    const Auth = McpServer.middleware<{ provides: CurrentUser }>()((effect) =>
      Effect.provideService(effect, CurrentUser, { id: "alice" })
    )

    it("should discharge request markers only through MCP middleware", () => {
      const withMiddleware = UserTools.pipe(Layer.provide(Auth.layer))
      const withService = UserTools.pipe(Layer.provide(Layer.succeed(CurrentUser, { id: "alice" })))

      expect<Layer.Services<typeof withMiddleware>>().type.toBe<McpServer.McpServer | UserHandlers>()
      expect<Layer.Services<typeof withService>>().type.toBe<
        McpServer.McpServer | UserHandlers | Requires<CurrentUser>
      >()
    })

    it("should leave per-call middleware dependencies as request markers until discharged", () => {
      const Audit = McpServer.middleware()((effect) => Effect.andThen(CurrentUser, effect))

      expect(Audit.layer).type.toBe<Layer.Layer<never, never, Requires<CurrentUser>>>()
      expect(Audit.combine(Auth).layer).type.toBe<Layer.Layer<Requires<CurrentUser>>>()
    })

    it("should reject middleware failures that are not MCP errors", () => {
      expect(McpServer.middleware()).type.not.toBeCallableWith(() => Effect.fail("boom"))
    })

    it("should pass middleware one target for list requests too", () => {
      expect<"tools/list" | "resources/list" | "resources/templates/list" | "prompts/list">().type
        .toBeAssignableTo<McpServer.MiddlewareOptions["method"]>()
      expect<McpServer.MiddlewareOptions["target"]>().type.toBe<string>()
    })

    describe("visibility", () => {
      const AdminOnly = McpServer.visibility(() => Effect.map(CurrentUser, (user) => user.id === "admin"))

      it("should leave services read by the check as request markers until discharged", () => {
        const gated = UserTools.pipe(Layer.provide(AdminOnly.combine(Auth).layer))

        expect(AdminOnly.layer).type.toBe<Layer.Layer<never, never, Requires<CurrentUser>>>()
        expect(AdminOnly.combine(Auth).layer).type.toBe<Layer.Layer<Requires<CurrentUser>>>()
        expect<Layer.Services<typeof gated>>().type.toBe<McpServer.McpServer | UserHandlers>()
      })

      it("should accept per-target checks in function and Effect forms", () => {
        expect(McpServer.visibility).type.toBeCallableWith(
          (options: McpServer.MiddlewareOptions) => Effect.succeed(options.target !== "DeleteUser")
        )
        expect(McpServer.visibility).type.toBeCallableWith(
          Effect.succeed(({ target }: { readonly target: string }) => Effect.succeed(target !== "DeleteUser"))
        )
        expect(McpServer.visibility(() => Effect.succeed(true), { global: true })).type.toBe<
          Layer.Layer<never, never, McpServer.McpServer>
        >()
      })

      it("should reject checks that do not return booleans or fail with non-MCP errors", () => {
        expect(McpServer.visibility).type.not.toBeCallableWith(() => Effect.succeed("visible"))
        expect(McpServer.visibility).type.not.toBeCallableWith(() => Effect.fail("boom"))
      })
    })

    it("should leave undischarged markers on stdio and convert them on HTTP", () => {
      const stdio = McpServer.layerStdio({ ...serverOptions, registrations: UserTools })
      const http = McpServer.layerHttp({ ...serverOptions, path: "/mcp", registrations: UserTools })

      expect<Layer.Services<typeof stdio>>().type.toBe<Stdio.Stdio | UserHandlers | Requires<CurrentUser>>()
      expect<Layer.Services<typeof http>>().type.toBe<
        HttpRouter.HttpRouter | UserHandlers | HttpRouter.Request<"Requires", CurrentUser>
      >()
    })

    it("should leave visibility markers on stdio, convert them on HTTP, and discharge them from outer middleware", () => {
      const AdminOnly = McpServer.visibility(() => Effect.map(CurrentUser, (user) => user.id === "admin"))
      const gated = McpServer.resource({ uri: "file:///admin.txt", name: "admin", content: Effect.succeed("admin") })
        .pipe(Layer.provide(AdminOnly.layer))
      const stdio = McpServer.layerStdio({ ...serverOptions, registrations: gated })
      const http = McpServer.layerHttp({ ...serverOptions, path: "/mcp", registrations: gated })
      const authenticated = gated.pipe(Layer.provide(Auth.layerGlobal))

      expect<Layer.Services<typeof stdio>>().type.toBe<Stdio.Stdio | Requires<CurrentUser>>()
      expect<Layer.Services<typeof http>>().type.toBe<
        HttpRouter.HttpRouter | HttpRouter.Request<"Requires", CurrentUser>
      >()
      expect<Layer.Services<typeof authenticated>>().type.toBe<McpServer.McpServer>()
    })
  })
})
