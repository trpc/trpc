import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import * as McpProtocol from "effect/ai/internal/mcpProtocol"
import * as McpProtocolRegistry from "effect/ai/internal/mcpProtocolRegistry"
import * as McpRuntime from "effect/ai/internal/mcpRuntime"
import * as McpSchema2025_06_18 from "effect/ai/internal/mcpSchema/v2025_06_18"
import type * as PublicMcpProtocol from "effect/ai/McpProtocol"
import * as McpSchema from "effect/ai/McpSchema"
import * as Rpc from "effect/rpc/Rpc"
import * as RpcGroup from "effect/rpc/RpcGroup"

const makeTestProtocol = <
  const Version extends string,
  const Discriminator extends string
>(
  protocolVersion: Version,
  discriminator: Discriminator
) => {
  const Payload = Schema.Struct({
    protocol: Schema.Literal(discriminator),
    value: Schema.String
  })
  const TestRequest = Rpc.make("test/shape", {
    payload: Payload,
    success: Schema.Struct({
      protocol: Schema.Literal(protocolVersion),
      value: Schema.String
    })
  })

  return McpProtocol.make({
    protocolVersion,
    runtime: McpRuntime.stateful({
      jsonRpc: { acceptsBatches: false },
      http: { requiresVersionHeader: true }
    }),
    clientRpcs: RpcGroup.make(TestRequest),
    clientNotificationRpcs: RpcGroup.make(),
    serverRequestRpcs: RpcGroup.make(),
    serverNotificationRpcs: RpcGroup.make(),
    toReverseClient: () => ({
      listRoots: () =>
        Effect.fail(
          new McpSchema.McpReverseOperationUnsupported({
            operation: "roots/list",
            protocolVersion: "2025-06-18",
            reason: "Synthetic test adapter"
          })
        ),
      createMessage: () =>
        Effect.fail(
          new McpSchema.McpReverseOperationUnsupported({
            operation: "sampling/createMessage",
            protocolVersion: "2025-06-18",
            reason: "Synthetic test adapter"
          })
        ),
      elicit: () =>
        Effect.fail(
          new McpSchema.McpReverseOperationUnsupported({
            operation: "elicitation/create",
            protocolVersion: "2025-06-18",
            reason: "Synthetic test adapter"
          })
        )
    }),
    projectNotification: () => Effect.succeed(undefined),
    normalizeCancellation: () => Effect.succeed({ requestId: "" })
  })
}

const request = (payload: unknown) => ({
  _tag: "Request" as const,
  id: 1,
  tag: "test/shape",
  payload,
  headers: []
})

describe("McpProtocolRegistry", () => {
  it.effect("should reject an empty declaration when runtime input bypasses the non-empty type", () =>
    Effect.gen(function*() {
      const protocols = [] as unknown as Parameters<typeof McpProtocolRegistry.make>[0]

      const error = yield* Effect.flip(McpProtocolRegistry.make(protocols))

      assert.strictEqual(error._tag, "IllegalArgumentError")
      assert.match(error.message, /at least one MCP protocol/)
    }))

  it.effect("should reject duplicate versions when distinct adapters declare the same version", () =>
    Effect.gen(function*() {
      const first = makeTestProtocol("test-a", "a")
      const second = makeTestProtocol("test-a", "other-a")

      const error = yield* Effect.flip(McpProtocolRegistry.make([first, second]))

      assert.strictEqual(error._tag, "IllegalArgumentError")
      assert.match(error.message, /Duplicate MCP protocol version: test-a/)
    }))

  it.effect("should select the matching adapter when the offered version is declared", () =>
    Effect.gen(function*() {
      const first = makeTestProtocol("test-a", "a")
      const second = makeTestProtocol("test-b", "b")
      const registry = yield* McpProtocolRegistry.make([first, second])
      const selected: typeof first | typeof second = registry.select("test-b")

      assert.strictEqual(selected, second)
    }))

  it.effect("should select the first declared adapter when the offered version is unsupported", () =>
    Effect.gen(function*() {
      const first = makeTestProtocol("test-a", "a")
      const second = makeTestProtocol("test-b", "b")
      const registry = yield* McpProtocolRegistry.make([first, second])

      assert.strictEqual(registry.select("unsupported"), first)
    }))

  it.effect("should preserve declaration order when the source array mutates after registry creation", () =>
    Effect.gen(function*() {
      const first = makeTestProtocol("test-a", "a")
      const second = makeTestProtocol("test-b", "b")
      const protocols: [PublicMcpProtocol.AnyProtocolAdapter, PublicMcpProtocol.AnyProtocolAdapter] = [
        first,
        second
      ]
      const registry = yield* McpProtocolRegistry.make(protocols)

      protocols.reverse()

      assert.strictEqual(registry.select("unsupported"), first)
      assert.strictEqual(registry.select("test-b"), second)
    }))

  it.effect("should route to only the selected namespace when protocol schemas are incompatible", () =>
    Effect.gen(function*() {
      const first = makeTestProtocol("test-a", "a")
      const second = makeTestProtocol("test-b", "b")
      const registry = yield* McpProtocolRegistry.make([first, second])
      const selected = registry.select("test-a")

      const selectedRequest = registry.routeClientRequest(
        selected,
        request({ protocol: "b", value: "wrong adapter" })
      )
      const unselectedRequest = registry.routeClientRequest(
        second,
        request({ protocol: "b", value: "other adapter" })
      )

      assert.notStrictEqual(selectedRequest.tag, unselectedRequest.tag)
      assert.notStrictEqual(selectedRequest.tag, "test/shape")

      const selectedRpc = first.clientRpcs.requests.get("test/shape")
      const unselectedRpc = second.clientRpcs.requests.get("test/shape")
      assert.isDefined(selectedRpc)
      assert.isDefined(unselectedRpc)

      const invalid = yield* Effect.exit(
        selected.payloadCodecs(selectedRpc).decode(selectedRequest.payload)
      )

      assert.strictEqual(invalid._tag, "Failure")
      const valid = yield* second.payloadCodecs(unselectedRpc).decode(unselectedRequest.payload)
      assert.deepStrictEqual(valid, {
        protocol: "b",
        value: "other adapter"
      })
    }))
})

describe("MCP v2025-06-18 schema", () => {
  it("accepts resource links in prompt messages", () => {
    const message = Schema.decodeUnknownSync(McpSchema2025_06_18.PromptMessage)({
      role: "user",
      content: {
        type: "resource_link",
        uri: "file:///example.txt",
        name: "example"
      }
    })

    assert.strictEqual(message.content.type, "resource_link")
  })

  it("omits later core annotation fields", () => {
    const annotations = Schema.decodeUnknownSync(McpSchema2025_06_18.Annotations)({
      audience: ["user"],
      lastModified: "2026-07-26"
    })
    assert.notProperty(annotations, "lastModified")
  })
})

describe("McpProtocol errors", () => {
  it("should preserve tagged unsupported errors without requiring the local class prototype", () => {
    const unsupported = {
      _tag: "McpReverseOperationUnsupported",
      operation: "roots/list",
      protocolVersion: "2025-06-18",
      reason: "Client did not advertise roots"
    }
    assert.strictEqual<unknown>(McpProtocol.reverseError("roots/list")(unsupported), unsupported)

    const cause = new Error("Transport failed")
    const wrapped = McpProtocol.reverseError("roots/list")(cause)
    assert.strictEqual(wrapped._tag, "McpReverseOperationError")
    assert.propertyVal(wrapped, "cause", cause)
  })
})
