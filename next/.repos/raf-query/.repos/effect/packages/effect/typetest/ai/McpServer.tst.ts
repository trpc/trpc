import { McpProtocol, McpSchema, McpServer } from "effect/ai"
import * as McpProtocolInternal from "effect/ai/internal/mcpProtocol"
import type * as Cause from "effect/Cause"
import type * as Effect from "effect/Effect"
import type * as Layer from "effect/Layer"
import * as Rpc from "effect/rpc/Rpc"
import * as RpcGroup from "effect/rpc/RpcGroup"
import * as Schema from "effect/Schema"
import type * as Scope from "effect/Scope"
import { describe, expect, it } from "tstyche"

const serverOptions = {
  name: "TestServer",
  version: "1.0.0",
  protocols: [McpProtocol.v2025_11_25]
} as const

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

  describe("request context", () => {
    it("should not claim that stateless handlers receive the legacy client service", () => {
      const layer = McpServer.resource({
        uri: "file:///legacy-client.txt",
        name: "legacy-client",
        content: McpSchema.McpServerClient.useSync((client) => client.clientInfo.name)
      })
      expect<Layer.Services<typeof layer>>().type.toBe<McpSchema.McpServerClient>()
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
})
