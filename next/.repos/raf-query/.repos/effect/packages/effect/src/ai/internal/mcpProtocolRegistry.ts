import type { NonEmptyReadonlyArray } from "../../Array.ts"
import * as Cause from "../../Cause.ts"
import * as Effect from "../../Effect.ts"
import type * as Rpc from "../../rpc/Rpc.ts"
import type * as RpcGroup from "../../rpc/RpcGroup.ts"
import type * as RpcMessage from "../../rpc/RpcMessage.ts"
import type * as McpProtocol from "../McpProtocol.ts"
import type * as McpProtocolInternal from "./mcpProtocol.ts"

type AnyRpcGroup = RpcGroup.RpcGroup<any>

const prefix = (protocol: {
  readonly protocolVersion: string
}): string => `@effect/mcp/${encodeURIComponent(protocol.protocolVersion)}/`

/**
 * @internal
 */
export interface ProtocolRegistry<
  Protocol extends McpProtocol.AnyProtocolAdapter = McpProtocol.AnyProtocolAdapter
> {
  readonly protocols: NonEmptyReadonlyArray<Protocol>
  readonly clientRpcs: AnyRpcGroup
  readonly select: (offeredVersion: string) => Protocol
  readonly protocolForInternalTag: (tag: string) => Protocol
  readonly routeClientRequest: (
    protocol: Protocol,
    request: RpcMessage.RequestEncoded
  ) => RpcMessage.RequestEncoded
  readonly handlerTarget: (
    contextMap: Map<string, unknown>,
    context: McpProtocolInternal.HandlerInstallationContext
  ) => McpProtocolInternal.HandlerInstallationTarget
}

// NOTE: Protocol selection and request namespacing happen before an adapter's
// payload codec decodes the request. Canonical McpSchema value reuse must not
// introduce a shared permissive decode-first path.
/**
 * @internal
 */
export const make = Effect.fnUntraced(function*<
  const Protocols extends NonEmptyReadonlyArray<McpProtocol.AnyProtocolAdapter>
>(
  protocols: Protocols
) {
  type Protocol = Protocols[number]

  if (protocols.length === 0) {
    return yield* new Cause.IllegalArgumentError(
      "MCP protocol declaration must contain at least one MCP protocol"
    )
  }

  const snapshot = Object.freeze(Array.from(protocols)) as NonEmptyReadonlyArray<Protocol>
  const byVersion = new Map<string, Protocol>()
  for (const protocol of snapshot) {
    if (byVersion.has(protocol.protocolVersion)) {
      return yield* new Cause.IllegalArgumentError(
        `Duplicate MCP protocol version: ${protocol.protocolVersion}`
      )
    }
    byVersion.set(protocol.protocolVersion, protocol)
  }
  let clientRpcs = snapshot[0].clientRpcs.prefix(prefix(snapshot[0]))
  for (let i = 1; i < snapshot.length; i++) {
    clientRpcs = clientRpcs.merge(snapshot[i].clientRpcs.prefix(prefix(snapshot[i])))
  }

  return {
    protocols: snapshot,
    clientRpcs,
    select: (offeredVersion: string) => byVersion.get(offeredVersion) ?? snapshot[0],
    protocolForInternalTag: (tag: string) =>
      snapshot.find((protocol) => tag.startsWith(prefix(protocol))) ?? snapshot[0],
    routeClientRequest: (
      protocol: Protocol,
      request: RpcMessage.RequestEncoded
    ) => ({
      ...request,
      tag: `${prefix(protocol)}${request.tag}`
    }),
    handlerTarget: (contextMap, context): McpProtocolInternal.HandlerInstallationTarget => ({
      context,
      install: Effect.fnUntraced(function*<
        Rpcs extends Rpc.Any,
        Handlers extends RpcGroup.HandlersFrom<Rpcs>
      >(
        protocol: {
          readonly protocolVersion: string
        },
        rpcs: RpcGroup.RpcGroup<Rpcs>,
        handlers: Handlers
      ) {
        const handlerContext = yield* rpcs.toHandlers(handlers)
        for (const rpcDefinition of rpcs.requests.values()) {
          const namespacedRpc = clientRpcs.requests.get(
            `${prefix(protocol)}${rpcDefinition._tag}`
          )
          const handler = handlerContext.mapUnsafe.get(rpcDefinition.key)
          if (namespacedRpc === undefined || handler === undefined) {
            return yield* Effect.die(
              `MCP handler registration invariant failed for ${protocol.protocolVersion}/${rpcDefinition._tag}`
            )
          }
          contextMap.set(namespacedRpc.key, handler)
        }
      })
    })
  } satisfies ProtocolRegistry<Protocol>
})
