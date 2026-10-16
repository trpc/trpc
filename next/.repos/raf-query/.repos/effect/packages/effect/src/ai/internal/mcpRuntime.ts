/**
 * Runtime descriptors for MCP protocol adapters.
 *
 * @internal
 */
import type { NonEmptyReadonlyArray } from "../../Array.ts"
import * as Cause from "../../Cause.ts"
import * as Context from "../../Context.ts"
import * as Effect from "../../Effect.ts"
import type * as Headers from "../../http/Headers.ts"
import { appendPreResponseHandlerUnsafe } from "../../http/HttpEffect.ts"
import * as HttpServerRequest from "../../http/HttpServerRequest.ts"
import * as HttpServerResponse from "../../http/HttpServerResponse.ts"
import * as Layer from "../../Layer.ts"
import type * as LogLevel from "../../LogLevel.ts"
import * as Predicate from "../../Predicate.ts"
import * as Result from "../../Result.ts"
import * as RpcGroup from "../../rpc/RpcGroup.ts"
import type * as RpcMessage from "../../rpc/RpcMessage.ts"
import type * as PublicMcpProtocol from "../McpProtocol.ts"
import * as PublicMcpSchema from "../McpSchema.ts"
import type * as McpCore from "./mcpCore.ts"
import * as McpProtocol from "./mcpProtocol.ts"
import * as McpProtocolRegistry from "./mcpProtocolRegistry.ts"
import * as McpStatefulRuntime from "./mcpStatefulRuntime.ts"

const MCP_SESSION_ID_HEADER = "mcp-session-id"
const MCP_PROTOCOL_VERSION_HEADER = "mcp-protocol-version"
const MCP_METHOD_HEADER = "mcp-method"
const MCP_NAME_HEADER = "mcp-name"
const PROTOCOL_VERSION_METADATA_KEY = "io.modelcontextprotocol/protocolVersion"
const CLIENT_CAPABILITIES_METADATA_KEY = "io.modelcontextprotocol/clientCapabilities"
const UNSUPPORTED_PROTOCOL_VERSION_ERROR_CODE = -32022

const asRecord = (input: unknown): Record<string, unknown> | undefined =>
  typeof input === "object" && input !== null ? input as Record<string, unknown> : undefined

const protocolVersionClaim = (input: unknown): { readonly present: boolean; readonly value: unknown } => {
  const metadata = asRecord(input)
  return metadata !== undefined && PROTOCOL_VERSION_METADATA_KEY in metadata
    ? { present: true, value: metadata[PROTOCOL_VERSION_METADATA_KEY] }
    : { present: false, value: undefined }
}

/**
 * @internal
 */
export const hasRequestProtocolVersion = (input: unknown): boolean =>
  protocolVersionClaim(asRecord(asRecord(input)?.params)?._meta).present

const routingNameKey = (method: string): "name" | "uri" | undefined => {
  switch (method) {
    case "tools/call":
    case "prompts/get":
      return "name"
    case "resources/read":
      return "uri"
    default:
      return undefined
  }
}

const headerMismatch = (message: string): HttpProtocolSelection => ({
  _tag: "Rejected",
  status: 400,
  error: { code: PublicMcpSchema.HEADER_MISMATCH_ERROR_CODE, message }
})

const PingRpcs = RpcGroup.make(PublicMcpSchema.Ping)

/**
 * @internal
 */
export interface RequestBinding {
  readonly initializePayload: typeof PublicMcpSchema.Initialize.payloadSchema.Type
  readonly negotiatedProfile: McpCore.NegotiatedProtocolProfile
  readonly protocol: PublicMcpProtocol.AnyProtocolAdapter
}

/**
 * @internal
 */
export interface PreparedRequest {
  readonly protocol: PublicMcpProtocol.AnyProtocolAdapter
  readonly binding?: RequestBinding | undefined
  readonly profile?: McpCore.NegotiatedProtocolProfile<string> | undefined
  readonly requestContext?: PublicMcpSchema.McpRequestContext["Service"] | undefined
}

type HttpProtocolSelection =
  | {
    readonly _tag: "Accepted"
    readonly binding: RequestBinding | undefined
    readonly protocol?: PublicMcpProtocol.AnyProtocolAdapter | undefined
  }
  | {
    readonly _tag: "Rejected"
    readonly status: 400 | 404
    readonly error?: {
      readonly code: number
      readonly message: string
      readonly data?: unknown
    } | undefined
  }

/**
 * @internal
 */
export type HttpAdmission =
  | {
    readonly _tag: "Accepted"
    readonly acknowledge: boolean
    readonly isSubscription: boolean
  }
  | {
    readonly _tag: "Rejected"
    readonly response: HttpServerResponse.HttpServerResponse
  }

/**
 * @internal
 */
export interface HandlerInstallationOptions {
  readonly core: McpCore.McpCore
  readonly subscribeServerNotifications: McpProtocol.HandlerInstallationContext["subscribeServerNotifications"]
  readonly sendNotification?: NonNullable<McpProtocol.HandlerInstallationContext["sendNotification"]>
  readonly markSubscriptionCancelled?: NonNullable<
    McpProtocol.HandlerInstallationContext["markSubscriptionCancelled"]
  >
  readonly terminateSubscription?: NonNullable<McpProtocol.HandlerInstallationContext["terminateSubscription"]>
  readonly defaultLogLevel: LogLevel.LogLevel
  readonly serverInfo: {
    readonly name: string
    readonly version: string
    readonly instructions?: string | undefined
    readonly description?: string | undefined
    readonly websiteUrl?: string | undefined
    readonly icons?: ReadonlyArray<PublicMcpSchema.Icon> | undefined
    readonly extensions?: NonNullable<PublicMcpSchema.ServerCapabilities["extensions"]> | undefined
  }
}

/**
 * @internal
 */
export const stateful = (
  transport: PublicMcpProtocol.TransportPolicy
): PublicMcpProtocol.StatefulRuntimeDescriptor => ({
  _tag: "Stateful",
  transport
})

/**
 * @internal
 */
export interface ServerRuntimeShape {
  readonly protocols: NonEmptyReadonlyArray<PublicMcpProtocol.AnyProtocolAdapter>
  readonly clientRpcs: McpProtocolRegistry.ProtocolRegistry<PublicMcpProtocol.AnyProtocolAdapter>["clientRpcs"]
  readonly selectProtocol: (offeredVersion: string) => PublicMcpProtocol.AnyProtocolAdapter
  readonly protocolForInternalTag: (tag: string) => PublicMcpProtocol.AnyProtocolAdapter
  readonly routeClientRequest: (
    protocol: PublicMcpProtocol.AnyProtocolAdapter,
    request: RpcMessage.RequestEncoded
  ) => RpcMessage.RequestEncoded
  readonly prepareRequest: (
    clientId: number,
    headers: Headers.Headers,
    request: RpcMessage.RequestEncoded
  ) => Effect.Effect<PreparedRequest, unknown>
  readonly resolveRequest: (clientId: number, headers: Headers.Headers) => RequestBinding | undefined
  readonly admitHttp: (headers: Headers.Headers, input: Result.Result<unknown, unknown>) => HttpAdmission
  readonly effectLogLevel: (
    clientId: number,
    headers: Headers.Headers,
    fallback: LogLevel.LogLevel
  ) => LogLevel.LogLevel
  readonly disconnect: (clientId: number) => void
  readonly deliveryClientIds: () => Iterable<number>
  readonly canDeliver: (
    clientId: number,
    headers: Headers.Headers,
    notification: McpCore.ServerNotification,
    fallbackLogLevel: LogLevel.LogLevel
  ) => boolean
  readonly installHandlers: (
    options: HandlerInstallationOptions
  ) => Effect.Effect<Context.Context<never>, never, unknown>
}

/**
 * @internal
 */
export class ServerRuntime extends Context.Service<ServerRuntime, ServerRuntimeShape>()(
  "effect/ai/McpRuntime/ServerRuntime"
) {}

/**
 * @internal
 */
export const selectStatefulProtocol = <Protocol extends PublicMcpProtocol.AnyProtocolAdapter>(
  protocols: ReadonlyArray<Protocol>,
  offeredVersion: unknown
): Protocol | undefined =>
  protocols.find((protocol) => protocol.runtime._tag === "Stateful" && protocol.protocolVersion === offeredVersion) ??
    protocols.find((protocol) => protocol.runtime._tag === "Stateful")

/**
 * @internal
 */
export const make = Effect.fnUntraced(function*(
  protocols: NonEmptyReadonlyArray<PublicMcpProtocol.AnyProtocolAdapter>
) {
  const statefulProtocol = protocols.find((protocol) => protocol.runtime._tag === "Stateful")
  const stateful = statefulProtocol === undefined ? undefined : McpStatefulRuntime.make()
  const protocolVersions = protocols.map((protocol) => protocol.protocolVersion)
  let statelessDescriptor: PublicMcpProtocol.StatelessRuntimeDescriptor | undefined
  let statelessProtocol: PublicMcpProtocol.AnyProtocolAdapter | undefined
  for (const protocol of protocols) {
    if (protocol.runtime._tag !== "Stateless") {
      continue
    }
    if (statelessDescriptor !== undefined) {
      return yield* new Cause.IllegalArgumentError(
        "MCP runtime supports at most one stateless protocol"
      )
    }
    statelessDescriptor = protocol.runtime
    statelessProtocol = protocol
  }
  const registry = yield* McpProtocolRegistry.make(protocols)
  const selectHttpProtocol = (headers: Headers.Headers, input: unknown): HttpProtocolSelection => {
    const protocolVersion = headers[MCP_PROTOCOL_VERSION_HEADER]
    const sessionId = headers[MCP_SESSION_ID_HEADER]
    const inputRecord = asRecord(input)
    const metadata = asRecord(asRecord(inputRecord?.params)?._meta)
    const claim = protocolVersionClaim(metadata)
    const id = inputRecord?.id
    const isInitialize = inputRecord?.jsonrpc === "2.0" && inputRecord.method === "initialize" &&
      (typeof id === "string" || typeof id === "number")
    const isCancellationNotification = inputRecord?.jsonrpc === "2.0" &&
      inputRecord.method === "notifications/cancelled" && id === undefined
    const isStatelessRequest = claim.present || ((!isInitialize || stateful === undefined) &&
      statelessProtocol !== undefined &&
      (protocolVersion === statelessProtocol.protocolVersion ||
        (stateful === undefined && inputRecord?.jsonrpc === "2.0" &&
          typeof inputRecord.method === "string" && (typeof id === "string" || typeof id === "number"))))
    if (isStatelessRequest) {
      if (protocolVersion === undefined) {
        return headerMismatch("MCP-Protocol-Version header is required")
      }
      if (!isCancellationNotification && (metadata === undefined || typeof claim.value !== "string")) {
        return {
          _tag: "Rejected",
          status: 400,
          error: {
            code: PublicMcpSchema.INVALID_PARAMS_ERROR_CODE,
            message: "Required request metadata is missing"
          }
        }
      }
      if ((!isCancellationNotification || claim.present) && claim.value !== protocolVersion) {
        return headerMismatch("MCP-Protocol-Version header does not match request metadata")
      }
      if (!isCancellationNotification && asRecord(metadata?.[CLIENT_CAPABILITIES_METADATA_KEY]) === undefined) {
        return {
          _tag: "Rejected",
          status: 400,
          error: {
            code: PublicMcpSchema.INVALID_PARAMS_ERROR_CODE,
            message: `${CLIENT_CAPABILITIES_METADATA_KEY} request metadata is required`
          }
        }
      }
      if (statelessProtocol === undefined || protocolVersion !== statelessProtocol.protocolVersion) {
        return {
          _tag: "Rejected",
          status: 400,
          error: {
            code: UNSUPPORTED_PROTOCOL_VERSION_ERROR_CODE,
            message: `Unsupported protocol version '${protocolVersion}'`,
            data: {
              supported: protocolVersions,
              requested: protocolVersion
            }
          }
        }
      }
      const method = inputRecord?.method
      if (typeof method !== "string" || headers[MCP_METHOD_HEADER] !== method) {
        return headerMismatch("Mcp-Method header does not match request method")
      }
      const nameKey = routingNameKey(method)
      if (nameKey !== undefined) {
        const name = asRecord(inputRecord?.params)?.[nameKey]
        const header = headers[MCP_NAME_HEADER]
        if (typeof name !== "string" || header === undefined || McpProtocol.decodeRoutingHeader(header) !== name) {
          return headerMismatch("Mcp-Name header does not match request parameters")
        }
      }
      return { _tag: "Accepted", binding: undefined, protocol: statelessProtocol }
    }
    const binding = sessionId === undefined ? undefined : stateful?.resolveSessionId(sessionId)
    if (sessionId !== undefined && binding === undefined) {
      return { _tag: "Rejected", status: 404 }
    }
    if (
      !isInitialize &&
      protocolVersion !== undefined &&
      !registry.protocols.some((protocol) => protocol.protocolVersion === protocolVersion)
    ) {
      return { _tag: "Rejected", status: 400 }
    }
    if (
      !isInitialize &&
      binding?.protocol.runtime.transport.http.requiresVersionHeader === true &&
      protocolVersion !== binding.protocol.protocolVersion
    ) {
      return { _tag: "Rejected", status: 400 }
    }
    return { _tag: "Accepted", binding, protocol: binding?.protocol }
  }
  return ServerRuntime.of({
    protocols: registry.protocols,
    clientRpcs: registry.clientRpcs,
    selectProtocol: registry.select,
    protocolForInternalTag: registry.protocolForInternalTag,
    routeClientRequest: registry.routeClientRequest,
    prepareRequest: Effect.fnUntraced(function*(clientId, headers, request) {
      const metadata = asRecord(request.payload)?._meta
      const claim = protocolVersionClaim(metadata)
      const requestedVersion = typeof claim.value === "string" ? claim.value : undefined
      const binding = claim.present ? undefined : stateful?.resolve(clientId, headers)
      let protocol: PublicMcpProtocol.AnyProtocolAdapter
      if (claim.present) {
        protocol = registry.protocols.find((protocol) => protocol.protocolVersion === requestedVersion) ??
          statelessProtocol ?? registry.protocols[0]
      } else if (binding !== undefined) {
        protocol = binding.protocol
      } else if (request.tag === "initialize") {
        const offeredVersion = (request.payload as any)?.protocolVersion
        const selected = selectStatefulProtocol(registry.protocols, offeredVersion)
        if (selected === undefined) {
          return yield* new McpProtocol.ProtocolError({
            code: UNSUPPORTED_PROTOCOL_VERSION_ERROR_CODE,
            message: `initialize is not supported by the configured MCP protocols (requested '${offeredVersion}')`
          })
        }
        protocol = selected
      } else if (request.tag === "ping") {
        // An unversioned ping may precede initialize, even with a stateless adapter first.
        protocol = selectStatefulProtocol(registry.protocols, undefined) ?? registry.protocols[0]
      } else {
        protocol = registry.protocols[0]
      }
      if (protocol.runtime._tag === "Stateful") {
        return { protocol, binding }
      }
      if (request.isNotification && request.tag === "notifications/cancelled") {
        return { protocol }
      }
      if (statelessDescriptor === undefined) {
        return yield* Effect.die("MCP stateless runtime invariant failed")
      }
      if (requestedVersion !== undefined && requestedVersion !== protocol.protocolVersion) {
        return yield* new McpProtocol.ProtocolError({
          code: UNSUPPORTED_PROTOCOL_VERSION_ERROR_CODE,
          message: `Unsupported protocol version '${requestedVersion}'`,
          data: { supported: protocolVersions, requested: requestedVersion }
        })
      }
      const decodedProfile = yield* statelessDescriptor.profileFromRequestMetadata(metadata)
      const profile: McpCore.NegotiatedProtocolProfile<string> = {
        protocolVersion: decodedProfile.protocolVersion,
        clientCapabilities: decodedProfile.clientCapabilities,
        clientInfo: decodedProfile.clientInfo,
        requestMetadata: decodedProfile.requestMetadata
      }
      const requestContext = PublicMcpSchema.McpRequestContext.of({
        clientId,
        protocolVersion: profile.protocolVersion,
        clientCapabilities: profile.clientCapabilities,
        clientInfo: profile.clientInfo,
        requestMetadata: profile.requestMetadata
      })
      return { protocol, profile, requestContext }
    }),
    resolveRequest: (clientId, headers) => stateful?.resolve(clientId, headers),
    admitHttp: (headers, parsed) => {
      const reject = (status: number, error?: unknown, id: string | number | null = null): HttpAdmission => ({
        _tag: "Rejected",
        response: error === undefined
          ? HttpServerResponse.empty({ status })
          : HttpServerResponse.jsonUnsafe({ jsonrpc: "2.0", id, error }, { status })
      })
      if (Result.isFailure(parsed)) {
        const version = headers[MCP_PROTOCOL_VERSION_HEADER]
        if (version !== undefined && !registry.protocols.some((protocol) => protocol.protocolVersion === version)) {
          return reject(400)
        }
        const admission = selectHttpProtocol(headers, undefined)
        return admission._tag === "Rejected" && admission.error === undefined
          ? reject(admission.status)
          : reject(200, new PublicMcpSchema.ParseError({ message: "Parse error" }))
      }
      const input = parsed.success
      if (Array.isArray(input)) {
        if (input.length === 0) {
          return reject(400, new PublicMcpSchema.InvalidRequest({ message: "Invalid Request" }))
        }
        const admission = selectHttpProtocol(headers, input)
        if (
          admission._tag === "Rejected" ||
          input.some(hasRequestProtocolVersion) ||
          input.some((message) => Predicate.hasProperty(message, "method") && message.method === "initialize") ||
          admission.binding?.protocol.runtime.transport.jsonRpc.acceptsBatches !== true
        ) {
          return reject(400)
        }
        return {
          _tag: "Accepted",
          acknowledge: !input.some((message) =>
            Predicate.hasProperty(message, "method") && Predicate.hasProperty(message, "id")
          ),
          isSubscription: false
        }
      }
      const hasId = Predicate.hasProperty(input, "id")
      const id = hasId && (typeof input.id === "string" || typeof input.id === "number") ? input.id : null
      const isJsonRpc = Predicate.hasProperty(input, "jsonrpc") && input.jsonrpc === "2.0"
      const hasValidRequestId = !hasId || typeof input.id === "string" || typeof input.id === "number"
      const isRequest = isJsonRpc && hasValidRequestId &&
        Predicate.hasProperty(input, "method") && typeof input.method === "string"
      const hasValidResponseId = hasId &&
        (typeof input.id === "string" || typeof input.id === "number" || input.id === null)
      const hasResult = Predicate.hasProperty(input, "result")
      const hasError = Predicate.hasProperty(input, "error")
      const isResponse = isJsonRpc && hasValidResponseId && hasResult !== hasError
      const admission = selectHttpProtocol(headers, input)
      if (admission._tag === "Rejected") {
        return reject(admission.status, admission.error, id)
      }
      if (!isRequest && !isResponse) {
        return reject(200, new PublicMcpSchema.InvalidRequest({ message: "Invalid Request" }), id)
      }
      const isInitialize = Predicate.hasProperty(input, "method") && input.method === "initialize"
      const hasSession = headers[MCP_SESSION_ID_HEADER] !== undefined
      if (isInitialize ? hasSession : !hasSession && admission.protocol?.runtime._tag !== "Stateless") {
        return reject(400)
      }
      if (
        isRequest && admission.protocol?.runtime._tag === "Stateless" &&
        !((admission.protocol as unknown as McpProtocol.ProtocolAdapter).handlerRpcs?.requests.has(
          input.method as string
        ) ??
          admission.protocol.clientRpcs.requests.has(input.method as string))
      ) {
        return reject(404, new PublicMcpSchema.MethodNotFound({ message: `Method not found: ${input.method}` }), id)
      }
      return {
        _tag: "Accepted",
        acknowledge: !isRequest || !hasId,
        isSubscription: Predicate.hasProperty(input, "method") && input.method === "subscriptions/listen"
      }
    },
    effectLogLevel: (clientId, headers, fallback) => stateful?.effectLogLevel(clientId, headers, fallback) ?? fallback,
    disconnect: (clientId) => stateful?.disconnect(clientId),
    deliveryClientIds: () => stateful?.initializedClientIds() ?? [],
    canDeliver: (clientId, headers, notification, fallback) =>
      stateful?.canDeliver(clientId, headers, notification, fallback) ?? true,
    installHandlers: Effect.fnUntraced(function*(options) {
      const contextMap = new Map<string, unknown>()
      const installationContext: McpProtocol.HandlerInstallationContext = {
        subscribeServerNotifications: options.subscribeServerNotifications,
        ...(options.sendNotification === undefined ? {} : { sendNotification: options.sendNotification }),
        ...(options.markSubscriptionCancelled === undefined
          ? {}
          : { markSubscriptionCancelled: options.markSubscriptionCancelled }),
        ...(options.terminateSubscription === undefined
          ? {}
          : { terminateSubscription: options.terminateSubscription }),
        supportedVersions: protocolVersions,
        serverInfo: options.serverInfo,
        registrationPresence: options.core.registrationPresence
      }
      const handlerTarget = registry.handlerTarget(contextMap, installationContext)
      for (const protocol of registry.protocols) {
        if (protocol.runtime._tag === "Stateless") {
          yield* protocol.installHandlers(options.core, undefined, handlerTarget)
          continue
        }
        if (stateful === undefined) {
          return yield* Effect.die("MCP sessionful runtime invariant failed")
        }
        yield* handlerTarget.install(protocol, PingRpcs, PingRpcs.of({ ping: () => Effect.succeed({}) }))
        const lifecycle: McpProtocol.LifecycleRuntime = {
          initialize: Effect.fnUntraced(function*(protocolVersion, profile, clientId) {
            const presence = yield* options.core.registrationPresence
            return yield* Effect.withFiber((fiber) => {
              const httpRequest = Context.getOrUndefined(fiber.context, HttpServerRequest.HttpServerRequest)
              const capabilities: McpCore.CanonicalServerCapabilities = {
                completions: true,
                logging: true,
                ...(presence.tools ? { tools: { listChanged: true } } : {}),
                ...(presence.resources
                  ? { resources: { listChanged: true, subscribe: httpRequest === undefined } }
                  : {}),
                ...(presence.prompts ? { prompts: { listChanged: true } } : {}),
                ...(options.serverInfo.extensions ? { extensions: options.serverInfo.extensions } : {})
              }
              const initializePayload = PublicMcpSchema.Initialize.payloadSchema.make({
                protocolVersion,
                capabilities: profile.clientCapabilities,
                clientInfo: profile.clientInfo!,
                _meta: profile.requestMetadata
              })
              const registration: McpStatefulRuntime.Registration = {
                initializePayload,
                negotiatedProfile: profile,
                protocol: protocol as PublicMcpProtocol.ProtocolAdapter,
                supportsResourceSubscriptions: httpRequest === undefined &&
                  capabilities.resources?.subscribe === true,
                logLevel: options.defaultLogLevel
              }
              if (httpRequest !== undefined) {
                const sessionId = crypto.randomUUID()
                stateful.registerHttp(sessionId, registration)
                appendPreResponseHandlerUnsafe(
                  httpRequest,
                  (_request, response) =>
                    Effect.succeed(HttpServerResponse.setHeaders(response, {
                      [MCP_SESSION_ID_HEADER]: sessionId,
                      [MCP_PROTOCOL_VERSION_HEADER]: protocol.protocolVersion
                    }))
                )
              } else {
                stateful.registerConnection(clientId, registration)
              }
              return Effect.succeed({
                capabilities,
                instructions: options.serverInfo.instructions,
                serverInfo: PublicMcpSchema.Implementation.make({
                  name: options.serverInfo.name,
                  version: options.serverInfo.version,
                  description: options.serverInfo.description,
                  websiteUrl: options.serverInfo.websiteUrl,
                  icons: options.serverInfo.icons
                })
              })
            })
          }),
          setLogLevel: stateful.setLogLevel,
          subscribe: stateful.subscribe,
          unsubscribe: stateful.unsubscribe,
          clientNotification: Effect.fnUntraced(function*(notification, clientId) {
            if (notification._tag === "Initialized") {
              stateful.markInitialized(clientId)
            }
          })
        }
        yield* protocol.installHandlers(options.core, lifecycle, handlerTarget)
      }
      return Context.makeUnsafe(contextMap)
    })
  })
})

/**
 * @internal
 */
export const layer = (
  protocols: NonEmptyReadonlyArray<PublicMcpProtocol.AnyProtocolAdapter>
): Layer.Layer<ServerRuntime, Cause.IllegalArgumentError> => Layer.effect(ServerRuntime)(make(protocols))
