/**
 * Defines the MCP protocol implementations that an `McpServer` can support.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type * as Effect from "../Effect.ts"
import type * as Rpc from "../rpc/Rpc.ts"
import type * as RpcClient from "../rpc/RpcClient.ts"
import type * as RpcGroup from "../rpc/RpcGroup.ts"
import type * as Schema from "../Schema.ts"
import type * as Scope from "../Scope.ts"
import { protocol as protocol2024_11_05 } from "./internal/mcpProtocol/v2024_11_05.ts"
import { protocol as protocol2025_03_26 } from "./internal/mcpProtocol/v2025_03_26.ts"
import { protocol as protocol2025_06_18 } from "./internal/mcpProtocol/v2025_06_18.ts"
import { protocol as protocol2025_11_25 } from "./internal/mcpProtocol/v2025_11_25.ts"
import { protocol as protocol2026_07_28 } from "./internal/mcpProtocol/v2026_07_28.ts"
import type * as McpSchema from "./McpSchema.ts"

/**
 * The MCP protocol versions implemented by this release.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ProtocolVersion = "2024-11-05" | "2025-03-26" | "2025-06-18" | "2025-11-25" | "2026-07-28"

/**
 * MCP protocol versions that use initialization and server-managed sessions.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type StatefulProtocolVersion = Exclude<ProtocolVersion, "2026-07-28">

/**
 * Payload codecs used by a protocol adapter.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface PayloadCodecs {
  readonly decode: (input: unknown) => Effect.Effect<unknown, Schema.SchemaError>
  readonly encode: (input: unknown) => Effect.Effect<unknown, Schema.SchemaError>
}

/**
 * A notification projected into a protocol-specific payload.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ProjectedNotification {
  readonly tag: string
  readonly payload: unknown
}

/**
 * The operations required from an RPC group after its RPC union is erased.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ErasedRpcGroup<RpcType extends Rpc.Any = Rpc.Any> {
  readonly requests: ReadonlyMap<string, RpcType>
}

/**
 * The additional operation required from the complete client RPC group.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ErasedClientRpcGroup extends ErasedRpcGroup {
  readonly prefix: (prefix: string) => RpcGroup.RpcGroup<any>
}

/**
 * Transport behavior declared by an MCP runtime descriptor.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface TransportPolicy {
  readonly jsonRpc: {
    readonly acceptsBatches: boolean
  }
  readonly http: {
    readonly requiresVersionHeader?: boolean | undefined
  }
}

/**
 * Request information decoded by a stateless MCP runtime.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface StatelessRuntimeProfile {
  readonly protocolVersion: string
  readonly clientCapabilities: Schema.JsonObject
  readonly clientInfo?: McpSchema.Implementation | undefined
  readonly requestMetadata: Schema.JsonObject
}

/**
 * Stateful lifecycle runtime declaration carried by a protocol adapter.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface StatefulRuntimeDescriptor {
  readonly _tag: "Stateful"
  readonly transport: TransportPolicy
}

/**
 * Stateless lifecycle runtime declaration carried by a protocol adapter.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface StatelessRuntimeDescriptor {
  readonly _tag: "Stateless"
  readonly transport: TransportPolicy
  readonly profileFromRequestMetadata: (
    metadata: unknown
  ) => Effect.Effect<StatelessRuntimeProfile, unknown>
}

/**
 * Lifecycle runtime declaration carried by a protocol adapter.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type RuntimeDescriptor = StatefulRuntimeDescriptor | StatelessRuntimeDescriptor

/**
 * The operational shape shared by protocol adapters.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface AnyProtocolAdapter<
  out Version extends string = string,
  HandlerRequirements = unknown,
  out Runtime extends RuntimeDescriptor = RuntimeDescriptor
> {
  readonly protocolVersion: Version
  readonly runtime: Runtime
  readonly clientRpcs: ErasedClientRpcGroup
  readonly clientNotificationRpcs: ErasedRpcGroup
  readonly serverRequestRpcs: RpcGroup.Any
  readonly serverNotificationRpcs: ErasedRpcGroup<Rpc.AnyWithProps>
  readonly payloadCodecs: (rpc: Rpc.AnyWithProps) => PayloadCodecs
  readonly installHandlers: (
    core: any,
    lifecycle: any,
    target: any
  ) => Effect.Effect<void, never, HandlerRequirements>
  readonly makeReverseClient: (
    profile: any
  ) => Effect.Effect<McpSchema.McpReverseClient, never, RpcClient.Protocol | Scope.Scope>
  readonly projectNotification: (
    notification: any
  ) => Effect.Effect<ProjectedNotification | undefined, any>
  readonly normalizeCancellation: (payload: unknown) => Effect.Effect<any, unknown>
}

/**
 * An MCP protocol adapter that can be supplied to `McpServer`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ProtocolAdapter<
  out Version extends ProtocolVersion = ProtocolVersion,
  out Runtime extends RuntimeDescriptor = RuntimeDescriptor
> extends AnyProtocolAdapter<Version, unknown, Runtime> {}

/**
 * The MCP 2026-07-28 protocol implementation.
 *
 * **Details**
 *
 * This revision uses request-scoped metadata instead of initialization and
 * protocol-level sessions.
 *
 * When the selected transport supports server notifications, discovery
 * advertises change-notification capabilities and `subscriptions/listen`
 * delivers the requested notifications over the long-lived response.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export const v2026_07_28: ProtocolAdapter<"2026-07-28", StatelessRuntimeDescriptor> = protocol2026_07_28

/**
 * The MCP 2025-11-25 protocol implementation.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export const v2025_11_25: ProtocolAdapter<"2025-11-25", StatefulRuntimeDescriptor> = protocol2025_11_25

/**
 * The MCP 2025-06-18 protocol implementation.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export const v2025_06_18: ProtocolAdapter<"2025-06-18", StatefulRuntimeDescriptor> = protocol2025_06_18

/**
 * The MCP 2025-03-26 protocol implementation.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export const v2025_03_26: ProtocolAdapter<"2025-03-26", StatefulRuntimeDescriptor> = protocol2025_03_26

/**
 * The MCP 2024-11-05 protocol implementation.
 *
 * **Details**
 *
 * It provides the dated schema and stdio behavior. When supplied to
 * `McpServer.layerHttp`, the server uses its single-endpoint Streamable HTTP
 * compatibility transport; it does not implement the historical two-endpoint
 * HTTP+SSE transport.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export const v2024_11_05: ProtocolAdapter<"2024-11-05", StatefulRuntimeDescriptor> = protocol2024_11_05
