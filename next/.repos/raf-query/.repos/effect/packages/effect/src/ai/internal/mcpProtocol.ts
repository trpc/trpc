import * as Data from "../../Data.ts"
import * as Effect from "../../Effect.ts"
import * as Base64 from "../../encoding/Base64.ts"
import type * as Headers from "../../http/Headers.ts"
import type * as LogLevel from "../../LogLevel.ts"
import * as Match from "../../Match.ts"
import * as Predicate from "../../Predicate.ts"
import type * as PubSub from "../../PubSub.ts"
import * as Result from "../../Result.ts"
import type * as Rpc from "../../rpc/Rpc.ts"
import * as RpcClient from "../../rpc/RpcClient.ts"
import type { RpcClientError } from "../../rpc/RpcClientError.ts"
import type * as RpcGroup from "../../rpc/RpcGroup.ts"
import type * as RpcMessage from "../../rpc/RpcMessage.ts"
import * as Schema from "../../Schema.ts"
import type * as Scope from "../../Scope.ts"
import type * as PublicMcpProtocol from "../McpProtocol.ts"
import * as PublicMcpSchema from "../McpSchema.ts"
import * as McpCore from "./mcpCore.ts"

const LEGACY_RESOURCE_NOT_FOUND_ERROR_CODE = -32002
const BASE64_SENTINEL_PREFIX = "=?base64?"
const BASE64_SENTINEL_SUFFIX = "?="
// A leading U+FEFF belongs to the header value and must survive comparison with the JSON body.
const routingHeaderDecoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })

/**
 * @internal
 */
export const mcpLogLevels: Readonly<
  Record<
    PublicMcpSchema.LoggingLevel,
    { readonly effect: LogLevel.LogLevel; readonly order: number }
  >
> = {
  debug: { effect: "Debug", order: 0 },
  info: { effect: "Info", order: 1 },
  notice: { effect: "Info", order: 2 },
  warning: { effect: "Warn", order: 3 },
  error: { effect: "Error", order: 4 },
  critical: { effect: "Fatal", order: 5 },
  alert: { effect: "Fatal", order: 6 },
  emergency: { effect: "Fatal", order: 7 }
}

/**
 * @internal
 */
export const decodeRoutingHeader = (value: string): string | undefined => {
  const startsWithSentinel = value.startsWith(BASE64_SENTINEL_PREFIX)
  const endsWithSentinel = value.endsWith(BASE64_SENTINEL_SUFFIX)
  if (!startsWithSentinel || !endsWithSentinel) {
    return /^[\t\x20-\x7e]*$/.test(value) ? value : undefined
  }
  const decoded = Base64.decode(
    value.slice(BASE64_SENTINEL_PREFIX.length, -BASE64_SENTINEL_SUFFIX.length)
  )
  if (Result.isFailure(decoded)) return undefined
  try {
    return routingHeaderDecoder.decode(decoded.success)
  } catch {
    return undefined
  }
}

/**
 * @internal
 */
export const profileFromClient = (
  request: PublicMcpSchema.McpServerClient["Service"]
): McpCore.NegotiatedProtocolProfile => ({
  protocolVersion: request.protocolVersion,
  clientCapabilities: request.clientCapabilities,
  clientInfo: request.clientInfo,
  requestMetadata: request.initializePayload._meta
})

/**
 * @internal
 */
export const invocationFromClient = (
  request: PublicMcpSchema.McpServerClient["Service"]
): McpCore.McpInvocation => ({
  clientId: request.clientId,
  protocol: profileFromClient(request),
  requestContext: PublicMcpSchema.McpRequestContext.of({
    clientId: request.clientId,
    protocolVersion: request.protocolVersion,
    clientCapabilities: request.clientCapabilities,
    clientInfo: request.clientInfo,
    requestMetadata: request.requestMetadata
  }),
  serverClient: request
})

/**
 * @internal
 */
export const invocationFromRequestContext = (
  request: PublicMcpSchema.McpRequestContext["Service"]
): McpCore.McpInvocation => ({
  clientId: request.clientId,
  protocol: {
    protocolVersion: request.protocolVersion,
    clientCapabilities: request.clientCapabilities,
    clientInfo: request.clientInfo,
    requestMetadata: request.requestMetadata
  },
  requestContext: request
})

/**
 * @internal
 */
export const requireCompleteOperation = <A>(
  protocolVersion: PublicMcpProtocol.ProtocolVersion,
  outcome: McpCore.OperationOutcome<A>
): Effect.Effect<A, McpCore.UnsupportedByProtocol> =>
  outcome._tag === "Complete"
    ? Effect.succeed(outcome.value)
    : Effect.fail(new McpCore.UnsupportedByProtocol({ protocolVersion, feature: "Client input" }))

/**
 * Unquotes an exact text mirror when the protocol drops string `structuredContent`.
 *
 * @internal
 */
export const unwrapStringStructuredContent = (
  result: PublicMcpSchema.CallToolResult
): PublicMcpSchema.CallToolResult["content"] => {
  const { content, structuredContent } = result
  if (typeof structuredContent !== "string" || content.length !== 1) return content
  const [block] = content
  return block.type === "text" && block.text === JSON.stringify(structuredContent)
    ? [{ ...block, text: structuredContent }]
    : content
}

const isSamplingToolContent = (content: unknown): boolean =>
  Predicate.isReadonlyObject(content) && (content.type === "tool_use" || content.type === "tool_result")

/**
 * @internal
 */
export const samplingRequestRequiresTools = (request: unknown): boolean => {
  if (!Predicate.isReadonlyObject(request)) return false
  if (request.tools !== undefined || request.toolChoice !== undefined) return true
  if (!Array.isArray(request.messages)) return false
  return request.messages.some((message) => {
    if (!Predicate.isReadonlyObject(message)) return false
    const content = message.content
    return Array.isArray(content) ? content.some(isSamplingToolContent) : isSamplingToolContent(content)
  })
}

// NOTE: Keep the two codec assertions below as the single documented
// existential-schema boundary. Rpc.AnyWithProps intentionally erases each
// request's payload type, while the runtime schema still performs decoding and
// encoding; do not spread this erasure into MCP domain records.

/**
 * @internal
 */
export interface LifecycleRuntime {
  readonly initialize: (
    protocolVersion: PublicMcpProtocol.ProtocolVersion,
    profile: McpCore.NegotiatedProtocolProfile,
    clientId: number
  ) => Effect.Effect<McpCore.CanonicalInitializeResult>
  readonly setLogLevel: (
    level: PublicMcpSchema.LoggingLevel,
    clientId: number,
    headers: Headers.Headers
  ) => Effect.Effect<void>
  readonly subscribe: (uri: string, clientId: number, headers: Headers.Headers) => Effect.Effect<void, ProtocolError>
  readonly unsubscribe: (uri: string, clientId: number, headers: Headers.Headers) => Effect.Effect<void, ProtocolError>
  readonly clientNotification: (
    notification: McpCore.ClientNotification,
    clientId: number,
    headers: Headers.Headers
  ) => Effect.Effect<void>
}

/**
 * @internal
 */
export class ProtocolError extends Data.TaggedError("ProtocolError")<{
  readonly code: number
  readonly message: string
  readonly data?: unknown
}> {
  static fromTool(
    error: McpCore.ToolError | McpCore.UnsupportedByProtocol
  ): ProtocolError {
    const message = Match.value(error).pipe(
      Match.tag("ToolNotFound", (error) => `Tool '${error.name}' not found`),
      Match.tag(
        "UnsupportedByProtocol",
        (error) => `${error.feature} is not supported by MCP ${error.protocolVersion}`
      ),
      Match.tags({
        InvalidToolInput: (error) => error.message,
        InvalidToolContinuation: (error) => error.message,
        ToolExecutionError: (error) => error.message
      }),
      Match.exhaustive
    )
    return new ProtocolError({
      code: error._tag === "ToolExecutionError"
        ? PublicMcpSchema.INTERNAL_ERROR_CODE
        : PublicMcpSchema.INVALID_PARAMS_ERROR_CODE,
      message
    })
  }

  static fromFeature(error: unknown): ProtocolError {
    if (Predicate.hasProperty(error, "_tag")) {
      if (error._tag === "PromptNotFound" && Predicate.hasProperty(error, "name") && Predicate.isString(error.name)) {
        return new ProtocolError({
          code: PublicMcpSchema.INVALID_PARAMS_ERROR_CODE,
          message: `Prompt '${error.name}' not found`
        })
      }
      if (error._tag === "ResourceNotFound" && Predicate.hasProperty(error, "uri") && Predicate.isString(error.uri)) {
        return new ProtocolError({
          code: LEGACY_RESOURCE_NOT_FOUND_ERROR_CODE,
          message: `Resource '${error.uri}' not found`
        })
      }
    }
    const decoded = decodeProtocolErrorFields(error)
    return Result.isSuccess(decoded)
      ? new ProtocolError(decoded.success)
      : new ProtocolError({
        code: PublicMcpSchema.INTERNAL_ERROR_CODE,
        message: "MCP feature handler failed"
      })
  }
}

const ProtocolErrorFields = Schema.Struct({
  code: Schema.Finite,
  message: Schema.String,
  data: Schema.optionalKey(Schema.Unknown)
})

const decodeProtocolErrorFields = Schema.decodeUnknownResult(ProtocolErrorFields)

const isReverseOperationUnsupported = (cause: unknown): cause is PublicMcpSchema.McpReverseOperationUnsupported =>
  Predicate.isTagged(cause, "McpReverseOperationUnsupported")

/**
 * @internal
 */
export const reverseError = (
  operation: PublicMcpSchema.McpReverseOperationError["operation"]
) =>
(cause: unknown) =>
  isReverseOperationUnsupported(cause)
    ? cause
    : new PublicMcpSchema.McpReverseOperationError({ operation, cause })

/**
 * @internal
 */
export const transcode = <
  From extends Schema.Constraint,
  To extends Schema.Constraint
>(
  from: From,
  to: To,
  input: Schema.Schema.Type<From>
) =>
  Schema.encodeEffect(from)(input).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(to))
  )

/**
 * @internal
 */
export const transcodeStrict = <
  From extends Schema.Constraint,
  To extends Schema.Constraint
>(
  from: From,
  to: To,
  input: Schema.Schema.Type<From>
) =>
  Schema.encodeEffect(from)(input).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(to, { onExcessProperty: "error" }))
  )

/**
 * @internal
 */
export const makeNotificationProjector = Effect.fn(function*(
  options: {
    readonly supportsProgressMessage: boolean
  },
  notification: McpCore.ServerNotification
) {
  return McpCore.ServerNotification.$match(notification, {
    Cancelled: (notification): PublicMcpProtocol.ProjectedNotification => ({
      tag: PublicMcpSchema.CancelledNotification._tag,
      payload: PublicMcpSchema.CancelledNotification.payloadSchema.make({
        _meta: notification.metadata,
        requestId: notification.requestId,
        reason: notification.reason
      })
    }),
    Progress: (notification): PublicMcpProtocol.ProjectedNotification => ({
      tag: PublicMcpSchema.ProgressNotification._tag,
      payload: PublicMcpSchema.ProgressNotification.payloadSchema.make({
        _meta: notification.metadata,
        progressToken: notification.progressToken,
        progress: notification.progress,
        total: notification.total,
        message: options.supportsProgressMessage ? notification.message : undefined
      })
    }),
    LoggingMessage: (notification): PublicMcpProtocol.ProjectedNotification => ({
      tag: PublicMcpSchema.LoggingMessageNotification._tag,
      payload: PublicMcpSchema.LoggingMessageNotification.payloadSchema.make({
        _meta: notification.metadata,
        level: notification.level,
        logger: notification.logger,
        data: notification.data
      })
    }),
    ResourceUpdated: (notification): PublicMcpProtocol.ProjectedNotification => ({
      tag: PublicMcpSchema.ResourceUpdatedNotification._tag,
      payload: PublicMcpSchema.ResourceUpdatedNotification.payloadSchema.make({
        _meta: notification.metadata,
        uri: notification.uri
      })
    }),
    ResourcesChanged: (notification): PublicMcpProtocol.ProjectedNotification => ({
      tag: PublicMcpSchema.ResourceListChangedNotification._tag,
      payload: PublicMcpSchema.ResourceListChangedNotification.payloadSchema.make({
        _meta: notification.metadata
      })
    }),
    ToolsChanged: (notification): PublicMcpProtocol.ProjectedNotification => ({
      tag: PublicMcpSchema.ToolListChangedNotification._tag,
      payload: PublicMcpSchema.ToolListChangedNotification.payloadSchema.make({
        _meta: notification.metadata
      })
    }),
    PromptsChanged: (notification): PublicMcpProtocol.ProjectedNotification => ({
      tag: PublicMcpSchema.PromptListChangedNotification._tag,
      payload: PublicMcpSchema.PromptListChangedNotification.payloadSchema.make({
        _meta: notification.metadata
      })
    }),
    ElicitationComplete: () => undefined
  })
})

/**
 * @internal
 */
export interface HandlerInstallationTarget {
  readonly context: HandlerInstallationContext
  readonly install: <
    Rpcs extends Rpc.Any,
    Handlers extends RpcGroup.HandlersFrom<Rpcs>
  >(
    protocol: {
      readonly protocolVersion: string
    },
    rpcs: RpcGroup.RpcGroup<Rpcs>,
    handlers: Handlers
  ) => Effect.Effect<void, never, RpcGroup.HandlersServices<Rpcs, Handlers>>
}

/**
 * @internal
 */
export interface HandlerInstallationContext {
  readonly subscribeServerNotifications: Effect.Effect<
    PubSub.Subscription<CanonicalServerNotification>,
    never,
    Scope.Scope
  >
  readonly sendNotification?: (
    protocolVersion: string,
    clientId: number,
    notification: PublicMcpProtocol.ProjectedNotification
  ) => Effect.Effect<void>
  readonly terminateSubscription?: (
    protocolVersion: string,
    clientId: number,
    requestId: RpcMessage.RequestId,
    reason: string
  ) => Effect.Effect<void>
  readonly markSubscriptionCancelled?: (
    clientId: number,
    requestId: RpcMessage.RequestId
  ) => Effect.Effect<void>
  readonly supportedVersions: ReadonlyArray<string>
  readonly serverInfo: {
    readonly name: string
    readonly version: string
    readonly instructions?: string | undefined
    readonly description?: string | undefined
    readonly websiteUrl?: string | undefined
    readonly icons?: ReadonlyArray<PublicMcpSchema.Icon> | undefined
    readonly extensions?: PublicMcpSchema.ServerCapabilities["extensions"] | undefined
  }
  readonly registrationPresence: Effect.Effect<{
    readonly tools: boolean
    readonly resources: boolean
    readonly prompts: boolean
  }>
}

/**
 * @internal
 */
export interface CanonicalServerNotification {
  readonly notification: SubscriptionServerNotification
  readonly targetClientId?: number | undefined
}

/**
 * @internal
 */
export type SubscriptionServerNotification = Extract<
  McpCore.ServerNotification,
  { readonly _tag: "ToolsChanged" | "PromptsChanged" | "ResourcesChanged" | "ResourceUpdated" }
>

/**
 * @internal
 */
export const isSubscriptionServerNotification = (
  notification: McpCore.ServerNotification
): notification is SubscriptionServerNotification => {
  switch (notification._tag) {
    case "ToolsChanged":
    case "PromptsChanged":
    case "ResourcesChanged":
    case "ResourceUpdated":
      return true
    default:
      return false
  }
}

/**
 * @internal
 */
export interface ProtocolAdapter<
  out Version extends string = string,
  out Runtime extends PublicMcpProtocol.RuntimeDescriptor = PublicMcpProtocol.RuntimeDescriptor,
  ClientRpcs extends Rpc.Any = Rpc.Any,
  ClientNotificationRpcs extends ClientRpcs = ClientRpcs,
  ServerRequestRpcs extends Rpc.Any = Rpc.Any,
  ServerNotificationRpcs extends Rpc.Any = Rpc.Any,
  HandlerRpcs extends Rpc.Any = never,
  HandlerRequirements = never
> {
  // Each adapter owns its dated RPC vocabulary, transport policy, handler
  // projection, and wire behavior.
  readonly protocolVersion: Version
  readonly runtime: Runtime
  readonly clientRpcs: RpcGroup.RpcGroup<ClientRpcs>
  readonly clientNotificationRpcs: RpcGroup.RpcGroup<ClientNotificationRpcs>
  readonly serverRequestRpcs: RpcGroup.RpcGroup<ServerRequestRpcs>
  readonly serverNotificationRpcs: RpcGroup.RpcGroup<ServerNotificationRpcs>
  readonly payloadCodecs: (rpc: Rpc.AnyWithProps) => PublicMcpProtocol.PayloadCodecs
  readonly handlerRpcs?: RpcGroup.RpcGroup<HandlerRpcs> | undefined
  readonly installHandlers: (
    core: McpCore.McpCore,
    lifecycle: LifecycleRuntime | undefined,
    target: HandlerInstallationTarget
  ) => Effect.Effect<void, never, HandlerRequirements>
  readonly makeReverseClient: (
    profile: McpCore.NegotiatedProtocolProfile
  ) => Effect.Effect<
    PublicMcpSchema.McpReverseClient,
    never,
    RpcClient.Protocol | Scope.Scope
  >
  readonly projectNotification: (
    notification: McpCore.ServerNotification
  ) => Effect.Effect<PublicMcpProtocol.ProjectedNotification | undefined, McpCore.UnsupportedByProtocol>
  readonly normalizeCancellation: (
    payload: unknown
  ) => Effect.Effect<McpCore.Cancellation, unknown>
}

type HandlerLifecycle<Runtime extends PublicMcpProtocol.RuntimeDescriptor> = Runtime extends
  PublicMcpProtocol.StatefulRuntimeDescriptor ? LifecycleRuntime : undefined

/**
 * @internal
 */
export const make = <
  const Version extends string,
  const Runtime extends PublicMcpProtocol.RuntimeDescriptor,
  ClientRpcs extends Rpc.Any,
  ClientNotificationRpcs extends ClientRpcs,
  ServerRequestRpcs extends Rpc.Any,
  ServerNotificationRpcs extends Rpc.Any,
  HandlerRpcs extends Rpc.Any = never,
  Handlers extends RpcGroup.HandlersFrom<HandlerRpcs> = RpcGroup.HandlersFrom<HandlerRpcs>
>(options: {
  readonly protocolVersion: Version
  readonly runtime: Runtime
  readonly clientRpcs: RpcGroup.RpcGroup<ClientRpcs>
  readonly clientNotificationRpcs: RpcGroup.RpcGroup<ClientNotificationRpcs>
  readonly serverRequestRpcs: RpcGroup.RpcGroup<ServerRequestRpcs>
  readonly serverNotificationRpcs: RpcGroup.RpcGroup<ServerNotificationRpcs>
  readonly handlerRpcs?: RpcGroup.RpcGroup<HandlerRpcs> | undefined
  readonly makeHandlers?:
    | ((
      core: McpCore.McpCore,
      lifecycle: HandlerLifecycle<Runtime>,
      context: HandlerInstallationContext
    ) => Handlers)
    | undefined
  readonly toReverseClient: (
    profile: McpCore.NegotiatedProtocolProfile,
    client: RpcClient.RpcClient<ServerRequestRpcs, RpcClientError>
  ) => PublicMcpSchema.McpReverseClient
  readonly projectNotification: (
    notification: McpCore.ServerNotification
  ) => Effect.Effect<PublicMcpProtocol.ProjectedNotification | undefined, McpCore.UnsupportedByProtocol>
  readonly normalizeCancellation: (
    payload: unknown
  ) => Effect.Effect<McpCore.Cancellation, unknown>
}): ProtocolAdapter<
  Version,
  Runtime,
  ClientRpcs,
  ClientNotificationRpcs,
  ServerRequestRpcs,
  ServerNotificationRpcs,
  HandlerRpcs,
  RpcGroup.HandlersServices<HandlerRpcs, Handlers>
> => {
  const payloadCodecsCache = new WeakMap<Rpc.AnyWithProps, PublicMcpProtocol.PayloadCodecs>()
  const payloadCodecs = (rpc: Rpc.AnyWithProps): PublicMcpProtocol.PayloadCodecs => {
    let codecs = payloadCodecsCache.get(rpc)
    if (codecs === undefined) {
      const schema = Schema.toCodecJson(rpc.payloadSchema)
      codecs = {
        decode: Schema.decodeUnknownEffect(schema) as PublicMcpProtocol.PayloadCodecs["decode"],
        encode: Schema.encodeUnknownEffect(schema) as PublicMcpProtocol.PayloadCodecs["encode"]
      }
      payloadCodecsCache.set(rpc, codecs)
    }
    return codecs
  }

  const installHandlers = (
    core: McpCore.McpCore,
    lifecycle: LifecycleRuntime | undefined,
    target: HandlerInstallationTarget
  ): Effect.Effect<void, never, RpcGroup.HandlersServices<HandlerRpcs, Handlers>> =>
    options.handlerRpcs === undefined || options.makeHandlers === undefined
      ? Effect.void
      : lifecycle === undefined && options.runtime._tag === "Stateful"
      ? Effect.die("MCP sessionful handler installation requires a lifecycle runtime")
      : target.install(
        options,
        options.handlerRpcs,
        options.makeHandlers(
          core,
          // TypeScript cannot narrow HandlerLifecycle<Runtime> from the generic runtime tag; the preceding guard
          // enforces the stateful lifecycle invariant.
          (options.runtime._tag === "Stateful" ? lifecycle : undefined) as HandlerLifecycle<Runtime>,
          target.context
        )
      )

  const makeReverseClient = (
    profile: McpCore.NegotiatedProtocolProfile
  ): Effect.Effect<
    PublicMcpSchema.McpReverseClient,
    never,
    RpcClient.Protocol | Scope.Scope
  > =>
    RpcClient.make(options.serverRequestRpcs, {
      spanPrefix: "McpServer/Client"
    }).pipe(
      Effect.map((client) => options.toReverseClient(profile, client))
    )

  return {
    ...options,
    payloadCodecs,
    installHandlers,
    makeReverseClient
  }
}
