/**
 * MCP v2026-07-28 wire projections.
 *
 * @internal
 */
import * as Deferred from "../../../Deferred.ts"
import * as Effect from "../../../Effect.ts"
import * as Base64 from "../../../encoding/Base64.ts"
import { appendPreResponseHandlerUnsafe } from "../../../http/HttpEffect.ts"
import * as HttpServerRequest from "../../../http/HttpServerRequest.ts"
import * as HttpServerResponse from "../../../http/HttpServerResponse.ts"
import * as Match from "../../../Match.ts"
import * as Option from "../../../Option.ts"
import * as Predicate from "../../../Predicate.ts"
import * as PubSub from "../../../PubSub.ts"
import * as Queue from "../../../Queue.ts"
import * as Record from "../../../Record.ts"
import type * as Rpc from "../../../rpc/Rpc.ts"
import type * as RpcMessage from "../../../rpc/RpcMessage.ts"
import * as Schema from "../../../Schema.ts"
import * as Scope from "../../../Scope.ts"
import type * as Types from "../../../Types.ts"
import type * as PublicMcpProtocol from "../../McpProtocol.ts"
import * as PublicMcpSchema from "../../McpSchema.ts"
import * as McpCore from "../mcpCore.ts"
import * as McpProtocol from "../mcpProtocol.ts"
import * as McpSchema from "../mcpSchema/v2026_07_28.ts"

const InputResponses = Schema.Record(Schema.String, Schema.JsonObject)
const decodeRequestMetadata = Schema.decodeUnknownEffect(McpSchema.RequestMetaObject)
const decodeCancellation = Schema.decodeUnknownEffect(McpSchema.CancelledNotification.payloadSchema)
const isJson = Schema.is(Schema.Json)
const encodeImplementation = Schema.encodeEffect(McpSchema.Implementation)
const MAX_PENDING_SUBSCRIPTION_NOTIFICATIONS = 64

type ObjectWithUndefined = Readonly<Record<string, unknown>>

const omitUndefined = (value: ObjectWithUndefined): Record<string, unknown> => {
  const result: Record<string, unknown> = {}
  for (const key in value) {
    if (value[key] !== undefined) {
      result[key] = value[key]
    }
  }
  return result
}

const parameterHeaderMatches = (header: string | undefined, argument: unknown): boolean => {
  if (Predicate.isNullish(argument)) {
    return header === undefined
  }
  if (header === undefined) {
    return false
  }
  const decoded = McpProtocol.decodeRoutingHeader(header)
  if (decoded === undefined) {
    return false
  }
  return Match.value(argument).pipe(
    Match.when(Match.string, (argument) => decoded === argument),
    Match.when(Match.boolean, (argument) => decoded === String(argument)),
    Match.when(
      Match.number,
      (argument) => Number.isSafeInteger(argument) && decoded.trim().length > 0 && Number(decoded) === argument
    ),
    Match.orElse(() => false)
  )
}

/**
 * @internal
 */
export interface StatelessRequestProfile {
  readonly protocolVersion: typeof McpSchema.protocolVersion
  readonly clientCapabilities: typeof McpSchema.ClientCapabilities.Type
  readonly clientInfo?: typeof McpSchema.Implementation.Type | undefined
  readonly requestMetadata: typeof McpSchema.RequestMetaObject.Type
}

/**
 * @internal
 */
export const profileFromRequestMetadata = Effect.fnUntraced(function*(metadata: unknown) {
  const requestMetadata = yield* decodeRequestMetadata(metadata)
  return {
    protocolVersion: McpSchema.protocolVersion,
    clientCapabilities: requestMetadata["io.modelcontextprotocol/clientCapabilities"],
    clientInfo: requestMetadata["io.modelcontextprotocol/clientInfo"],
    requestMetadata
  } satisfies StatelessRequestProfile
})

const resultMetadata = (
  value: ObjectWithUndefined,
  serverInfo: Schema.JsonObject
): Schema.JsonObject => {
  const metadata: unknown = value._meta
  return {
    ...(Predicate.isReadonlyObject(metadata) ? metadata : {}),
    "io.modelcontextprotocol/serverInfo": serverInfo
  }
}

const projectInputRequired = (
  outcome: McpCore.InputRequiredFields,
  serverInfo: Schema.JsonObject
) =>
  omitUndefined({
    _meta: { "io.modelcontextprotocol/serverInfo": serverInfo },
    resultType: "input_required",
    inputRequests: outcome.inputRequests,
    requestState: outcome.requestState
  })

const decodeCallToolOutcome = Schema.decodeUnknownEffect(Schema.Union([
  McpSchema.CallToolResult,
  McpSchema.InputRequiredResult
]))

/**
 * @internal
 */
export const projectCallToolOutcome = Effect.fnUntraced(function*(
  outcome: McpCore.OperationOutcome<ObjectWithUndefined>,
  serverInfo: typeof McpSchema.Implementation.Type
) {
  const encodedServerInfo = yield* encodeImplementation(serverInfo)
  if (outcome._tag === "Complete") {
    return yield* decodeCallToolOutcome({
      ...omitUndefined(outcome.value),
      _meta: resultMetadata(outcome.value, encodedServerInfo),
      resultType: "complete"
    })
  }
  return yield* decodeCallToolOutcome(projectInputRequired(outcome, encodedServerInfo))
})

const requiredCapabilitiesForInputRequests = (
  inputRequests: McpCore.InputRequiredFields["inputRequests"],
  capabilities: McpCore.NegotiatedProtocolProfile["clientCapabilities"]
): Record<string, Schema.JsonObject> => {
  const required: Record<string, Types.Mutable<Schema.JsonObject>> = {}
  for (const request of Object.values(inputRequests ?? {})) {
    Match.value(request).pipe(
      Match.when({ method: "roots/list" }, () => {
        if (capabilities.roots === undefined) required.roots = {}
      }),
      Match.when({ method: "sampling/createMessage" }, (request) => {
        const sampling = required.sampling ?? {}
        if (McpProtocol.samplingRequestRequiresTools(request.params) && capabilities.sampling?.tools === undefined) {
          sampling.tools = {}
        }
        if (
          (request.params.includeContext === "thisServer" || request.params.includeContext === "allServers") &&
          capabilities.sampling?.context === undefined
        ) {
          sampling.context = {}
        }
        if (capabilities.sampling === undefined || Object.keys(sampling).length > 0) required.sampling = sampling
      }),
      Match.when({ method: "elicitation/create" }, (request) => {
        const mode = request.params.mode === "url" ? "url" : "form"
        const elicitation = capabilities.elicitation
        const supportsMode = elicitation !== undefined && (mode === "url"
          ? elicitation.url !== undefined
          : elicitation.form !== undefined || Object.keys(elicitation).length === 0)
        if (!supportsMode) (required.elicitation ??= {})[mode] = {}
      }),
      Match.exhaustive
    )
  }
  return required
}

const projectResourceContents = (
  resource: PublicMcpSchema.TextResourceContents | PublicMcpSchema.BlobResourceContents
) =>
  omitUndefined({
    uri: resource.uri,
    mimeType: resource.mimeType,
    _meta: resource._meta,
    ...("text" in resource ? { text: resource.text } : { blob: Base64.encode(resource.blob) })
  })

const projectContent = Match.type<PublicMcpSchema.ContentBlock>().pipe(
  Match.when({ type: Match.is("text", "resource_link") }, (content) => content),
  Match.when({ type: Match.is("image", "audio") }, (content) =>
    omitUndefined({
      type: content.type,
      mimeType: content.mimeType,
      data: Base64.encode(content.data),
      annotations: content.annotations,
      _meta: content._meta
    })),
  Match.when({ type: "resource" }, (content) =>
    omitUndefined({
      type: "resource",
      resource: projectResourceContents(content.resource),
      annotations: content.annotations,
      _meta: content._meta
    })),
  Match.exhaustive
)

const projectResource = (resource: PublicMcpSchema.Resource) => McpSchema.Resource.make(resource)
const projectResourceTemplate = (resourceTemplate: PublicMcpSchema.ResourceTemplate) =>
  McpSchema.ResourceTemplate.make(resourceTemplate)

const projectPrompt = (prompt: PublicMcpSchema.Prompt) =>
  McpProtocol.transcode(PublicMcpSchema.Prompt, McpSchema.Prompt, prompt)

const projectTool = (tool: PublicMcpSchema.Tool) => McpProtocol.transcode(PublicMcpSchema.Tool, McpSchema.Tool, tool)

const privateStaleCache = {
  ttlMs: 0,
  cacheScope: "private"
} satisfies { readonly ttlMs: number; readonly cacheScope: "private" }

const projectCompleteResult = Effect.fnUntraced(function*(
  value: ObjectWithUndefined,
  serverInfo: typeof McpSchema.Implementation.Type
) {
  const encodedServerInfo = yield* encodeImplementation(serverInfo)
  return {
    ...omitUndefined(value),
    _meta: resultMetadata(value, encodedServerInfo),
    resultType: "complete"
  }
})

type ProtocolError =
  | McpCore.ResourceNotFound
  | McpCore.PromptNotFound
  | McpCore.ToolError
  | McpCore.UnsupportedByProtocol
  | McpProtocol.ProtocolError
  | PublicMcpSchema.McpError
  | Schema.SchemaError

const matchedProtocolError = Match.type<ProtocolError>().pipe(
  Match.tag("ResourceNotFound", (error) =>
    new McpProtocol.ProtocolError({
      code: McpSchema.INVALID_PARAMS,
      message: `Resource '${error.uri}' not found`,
      data: { uri: error.uri }
    })),
  Match.tag(
    "ToolNotFound",
    "InvalidToolInput",
    "InvalidToolContinuation",
    "ToolExecutionError",
    "UnsupportedByProtocol",
    McpProtocol.ProtocolError.fromTool
  ),
  Match.orElse(McpProtocol.ProtocolError.fromFeature)
)

const projectError = (error: ProtocolError): McpSchema.McpError => {
  const protocolError = matchedProtocolError(error)
  return McpSchema.McpError.make({
    code: protocolError.code,
    message: protocolError.message,
    ...(isJson(protocolError.data) ? { data: protocolError.data } : {})
  })
}

const failWithHttpStatus = Effect.fnUntraced(function*(status: number, error: McpProtocol.ProtocolError) {
  const request = yield* Effect.serviceOption(HttpServerRequest.HttpServerRequest)
  if (Option.isSome(request)) {
    appendPreResponseHandlerUnsafe(
      request.value,
      (_request, response) => Effect.succeed(HttpServerResponse.setStatus(response, status))
    )
  }
  return yield* error
})

/**
 * @internal
 */
export const normalizeCancellation = (payload: unknown) =>
  decodeCancellation(payload).pipe(
    Effect.map((request) => ({
      requestId: request.requestId,
      reason: request.reason,
      metadata: request._meta
    }))
  )

const unsupported = (
  operation: PublicMcpSchema.McpReverseOperationUnsupported["operation"]
): PublicMcpSchema.McpReverseOperationUnsupported =>
  new PublicMcpSchema.McpReverseOperationUnsupported({
    operation,
    protocolVersion: McpSchema.protocolVersion,
    reason: "MCP 2026-07-28 carries server input requests in multi round-trip results"
  })

/**
 * @internal
 */
export const handlerRpcs = McpSchema.ClientRequestRpcs.merge(McpSchema.ClientNotificationRpcs)

/**
 * @internal
 */
export const makeHandlers = (
  core: McpCore.McpCore,
  _lifecycle: McpProtocol.LifecycleRuntime | undefined,
  context: McpProtocol.HandlerInstallationContext
) => {
  const decodeInputResponses = Schema.decodeUnknownEffect(InputResponses)
  const decodeDiscoverResult = Schema.decodeUnknownEffect(McpSchema.DiscoverResult)
  const decodeListResourcesResult = Schema.decodeUnknownEffect(McpSchema.ListResourcesResult)
  const decodeListResourceTemplatesResult = Schema.decodeUnknownEffect(McpSchema.ListResourceTemplatesResult)
  const decodeReadResourceResult = Schema.decodeUnknownEffect(McpSchema.ReadResourceResult)
  const decodeListPromptsResult = Schema.decodeUnknownEffect(McpSchema.ListPromptsResult)
  const decodeGetPromptResult = Schema.decodeUnknownEffect(McpSchema.GetPromptResult)
  const decodePromptOutcome = Schema.decodeUnknownEffect(Schema.Union([
    McpSchema.GetPromptResult,
    McpSchema.InputRequiredResult
  ]))
  const decodeCompleteResult = Schema.decodeUnknownEffect(McpSchema.CompleteResult)
  const decodeListToolsResult = Schema.decodeUnknownEffect(McpSchema.ListToolsResult)
  const sendNotification = context.sendNotification
  const supportsSubscriptions = sendNotification !== undefined
  // Older adapters accept arbitrary JSON; this binding requires extension settings objects.
  const extensions = context.serverInfo.extensions === undefined ? undefined : Record.filter(
    context.serverInfo.extensions,
    (value): value is Schema.JsonObject => Predicate.isReadonlyObject(value)
  )
  const getDiscovery = Effect.map(context.registrationPresence, (presence) => {
    const capabilities: Types.Mutable<typeof McpSchema.ServerCapabilities.Type> = { completions: {}, logging: {} }
    if (extensions !== undefined) capabilities.extensions = extensions
    if (presence.tools) capabilities.tools = { listChanged: supportsSubscriptions }
    if (presence.resources) {
      capabilities.resources = { listChanged: supportsSubscriptions, subscribe: supportsSubscriptions }
    }
    if (presence.prompts) capabilities.prompts = { listChanged: supportsSubscriptions }
    return { supportedVersions: context.supportedVersions, capabilities, serverInfo: context.serverInfo }
  })
  const getInvocation = PublicMcpSchema.McpRequestContext.useSync(
    McpProtocol.invocationFromRequestContext
  )
  const getInputInvocation = Effect.fnUntraced(function*(
    request: Pick<typeof McpSchema.CallTool.payloadSchema.Type, "inputResponses" | "requestState">
  ) {
    const context = yield* PublicMcpSchema.McpRequestContext
    const inputResponses = request.inputResponses === undefined
      ? undefined
      // The RPC payload already validated the dated response union; this decode only erases it into canonical JSON.
      : yield* decodeInputResponses(request.inputResponses).pipe(Effect.orDie)
    return McpProtocol.invocationFromRequestContext(PublicMcpSchema.McpRequestContext.of({
      ...context,
      inputResponses,
      requestState: request.requestState
    }))
  })
  const validateInputRequestCapabilities = Effect.fnUntraced(function*(
    inputRequired: McpCore.InputRequiredFields,
    capabilities: McpCore.NegotiatedProtocolProfile["clientCapabilities"]
  ) {
    const requiredCapabilities = requiredCapabilitiesForInputRequests(inputRequired.inputRequests, capabilities)
    if (Object.keys(requiredCapabilities).length === 0) {
      return
    }
    return yield* failWithHttpStatus(
      400,
      new McpProtocol.ProtocolError({
        code: McpSchema.MISSING_REQUIRED_CLIENT_CAPABILITY,
        message: "The request requires client capabilities that were not declared",
        data: { requiredCapabilities }
      })
    )
  })
  return ({
    "subscriptions/listen": Effect.fnUntraced(function*(
      request: typeof McpSchema.SubscriptionsListen.payloadSchema.Type,
      { client, requestId }: { readonly client: Rpc.ServerClient; readonly requestId: RpcMessage.RequestId }
    ) {
      if (sendNotification === undefined) {
        return yield* new McpProtocol.ProtocolError({
          code: McpSchema.METHOD_NOT_FOUND,
          message: "Method not found: subscriptions/listen"
        })
      }
      const presence = yield* context.registrationPresence
      const eventsScope = yield* Scope.fork(yield* Effect.scope)
      const events = yield* Scope.provide(context.subscribeServerNotifications, eventsScope)
      const honored = {
        ...(presence.tools && request.notifications.toolsListChanged === true
          ? { toolsListChanged: true }
          : {}),
        ...(presence.prompts && request.notifications.promptsListChanged === true
          ? { promptsListChanged: true }
          : {}),
        ...(presence.resources && request.notifications.resourcesListChanged === true
          ? { resourcesListChanged: true }
          : {}),
        ...(presence.resources && request.notifications.resourceSubscriptions !== undefined
          ? { resourceSubscriptions: request.notifications.resourceSubscriptions }
          : {})
      }
      const subscriptionMetadata = { "io.modelcontextprotocol/subscriptionId": requestId }
      const resourceSubscriptions = new Set(honored.resourceSubscriptions)
      const pending = yield* Queue.dropping<PublicMcpProtocol.ProjectedNotification>(
        MAX_PENDING_SUBSCRIPTION_NOTIFICATIONS
      )
      const overflowed = yield* Deferred.make<void>()
      yield* Effect.gen(function*() {
        while (true) {
          const event = yield* PubSub.take(events)
          if (event.targetClientId !== undefined && event.targetClientId !== client.id) {
            continue
          }
          const notification = event.notification
          const rpc: Rpc.AnyWithProps | undefined = Match.value(notification).pipe(
            Match.tags({
              ToolsChanged: () => honored.toolsListChanged === true ? McpSchema.ToolListChangedNotification : undefined,
              PromptsChanged: () =>
                honored.promptsListChanged === true ? McpSchema.PromptListChangedNotification : undefined,
              ResourcesChanged: () =>
                honored.resourcesListChanged === true ? McpSchema.ResourceListChangedNotification : undefined,
              ResourceUpdated: (notification) =>
                resourceSubscriptions.has(notification.uri) ? McpSchema.ResourceUpdatedNotification : undefined
            }),
            Match.exhaustive
          )
          if (rpc === undefined) {
            continue
          }
          const projected = {
            tag: rpc._tag,
            payload: rpc.payloadSchema.make({
              _meta: { ...notification.metadata, ...subscriptionMetadata },
              ...(notification._tag === "ResourceUpdated" ? { uri: notification.uri } : {})
            })
          }
          if (!(yield* Queue.offer(pending, projected))) {
            break
          }
        }
      }).pipe(
        // Release the upstream listener on overflow even while transport writes remain blocked.
        Scope.use(eventsScope),
        Effect.andThen(Effect.suspend(() => context.markSubscriptionCancelled?.(client.id, requestId) ?? Effect.void)),
        Effect.andThen(Deferred.succeed(overflowed, undefined)),
        Effect.forkScoped
      )
      yield* sendNotification(McpSchema.protocolVersion, client.id, {
        tag: McpSchema.SubscriptionsAcknowledgedNotification._tag,
        payload: McpSchema.SubscriptionsAcknowledgedNotification.payloadSchema.make({
          _meta: subscriptionMetadata,
          notifications: honored
        })
      })
      const deliver = Effect.forever(
        Queue.take(pending).pipe(
          Effect.flatMap((notification) => sendNotification(McpSchema.protocolVersion, client.id, notification))
        )
      )
      yield* Effect.race(deliver, Deferred.await(overflowed))
      yield* context.terminateSubscription?.(
        McpSchema.protocolVersion,
        client.id,
        requestId,
        "Pending notification limit exceeded"
      ) ?? Effect.void
      const encodedServerInfo = yield* encodeImplementation(context.serverInfo)
      return McpSchema.SubscriptionsListenResult.make({
        _meta: {
          ...subscriptionMetadata,
          "io.modelcontextprotocol/serverInfo": encodedServerInfo
        },
        resultType: "complete"
      })
    }, Effect.mapError(projectError)),
    "server/discover": Effect.fnUntraced(function*(
      _request: typeof McpSchema.Discover.payloadSchema.Type
    ) {
      const discovery = yield* getDiscovery
      const result = yield* projectCompleteResult({
        ...privateStaleCache,
        supportedVersions: Array.from(discovery.supportedVersions),
        capabilities: discovery.capabilities,
        instructions: context.serverInfo.instructions
      }, context.serverInfo)
      return yield* decodeDiscoverResult(result)
    }, Effect.mapError(projectError)),
    "resources/list": Effect.fnUntraced(function*(
      _request: typeof McpSchema.ListResources.payloadSchema.Type
    ) {
      const invocation = yield* getInvocation
      const resources = yield* core.resources.list(invocation.protocol)
      const result = yield* projectCompleteResult({
        ...privateStaleCache,
        resources: resources.map(projectResource)
      }, context.serverInfo)
      return yield* decodeListResourcesResult(result)
    }, Effect.mapError(projectError)),
    "resources/templates/list": Effect.fnUntraced(function*(
      _request: typeof McpSchema.ListResourceTemplates.payloadSchema.Type
    ) {
      const invocation = yield* getInvocation
      const resourceTemplates = yield* core.resources.listTemplates(invocation.protocol)
      const result = yield* projectCompleteResult({
        ...privateStaleCache,
        resourceTemplates: resourceTemplates.map(projectResourceTemplate)
      }, context.serverInfo)
      return yield* decodeListResourceTemplatesResult(result)
    }, Effect.mapError(projectError)),
    "resources/read": Effect.fnUntraced(function*(request: typeof McpSchema.ReadResource.payloadSchema.Type) {
      const invocation = yield* getInputInvocation(request)
      const read = yield* core.resources.read(request.uri, invocation)
      const contents = read.contents.map(projectResourceContents)
      const result = yield* projectCompleteResult({
        ...privateStaleCache,
        contents,
        _meta: read._meta
      }, context.serverInfo)
      return yield* decodeReadResourceResult(result)
    }, Effect.mapError(projectError)),
    "prompts/list": Effect.fnUntraced(function*(
      _request: typeof McpSchema.ListPrompts.payloadSchema.Type
    ) {
      const presence = yield* context.registrationPresence
      if (!presence.prompts) {
        return yield* failWithHttpStatus(
          404,
          new McpProtocol.ProtocolError({
            code: PublicMcpSchema.METHOD_NOT_FOUND_ERROR_CODE,
            message: "Method not found"
          })
        )
      }
      const invocation = yield* getInvocation
      const prompts = yield* core.prompts.list(invocation.protocol)
      const projectedPrompts = yield* Effect.forEach(prompts, projectPrompt)
      const result = yield* projectCompleteResult({
        ...privateStaleCache,
        prompts: projectedPrompts
      }, context.serverInfo)
      return yield* decodeListPromptsResult(result)
    }, Effect.mapError(projectError)),
    "prompts/get": Effect.fnUntraced(function*(request: typeof McpSchema.GetPrompt.payloadSchema.Type) {
      const invocation = yield* getInputInvocation(request)
      const outcome = yield* core.prompts.get(request.name, request.arguments ?? {}, invocation)
      if (outcome._tag === "InputRequired") {
        yield* validateInputRequestCapabilities(outcome, invocation.protocol.clientCapabilities)
        const encodedServerInfo = yield* encodeImplementation(context.serverInfo)
        return yield* decodePromptOutcome(projectInputRequired(outcome, encodedServerInfo))
      }
      const prompt = outcome.value
      const messages = prompt.messages.map((message) => ({
        role: message.role,
        content: projectContent(message.content)
      }))
      const result = yield* projectCompleteResult({
        description: prompt.description,
        messages,
        _meta: prompt._meta
      }, context.serverInfo)
      return yield* decodeGetPromptResult(result)
    }, Effect.mapError(projectError)),
    "completion/complete": Effect.fnUntraced(function*(
      request: typeof McpSchema.Complete.payloadSchema.Type
    ) {
      const invocation = yield* getInvocation
      const completion = yield* core.completions.complete({
        reference: request.ref.type === "ref/prompt"
          ? { type: "prompt", name: request.ref.name, title: request.ref.title }
          : { type: "resourceTemplate", uriTemplate: request.ref.uri },
        argument: request.argument,
        context: request.context?.arguments === undefined
          ? undefined
          : { arguments: request.context.arguments },
        metadata: request._meta
      }, invocation)
      const result = yield* projectCompleteResult({
        completion: omitUndefined({
          values: Array.from(completion.values),
          total: completion.total,
          hasMore: completion.hasMore
        }),
        _meta: completion.metadata
      }, context.serverInfo)
      return yield* decodeCompleteResult(result)
    }, Effect.mapError(projectError)),
    "tools/list": Effect.fnUntraced(function*(
      _request: typeof McpSchema.ListTools.payloadSchema.Type
    ) {
      const invocation = yield* getInvocation
      const tools = yield* core.tools.list(invocation.protocol)
      const projectedTools = yield* Effect.forEach(tools, projectTool)
      const result = yield* projectCompleteResult({
        ...privateStaleCache,
        tools: projectedTools
      }, context.serverInfo)
      return yield* decodeListToolsResult(result)
    }, Effect.mapError(projectError)),
    "tools/call": Effect.fnUntraced(function*(request: typeof McpSchema.CallTool.payloadSchema.Type) {
      const invocation = yield* getInputInvocation(request)
      const tool = (yield* core.tools.list(invocation.protocol)).find((tool) => tool.name === request.name)
      const httpRequest = yield* Effect.serviceOption(HttpServerRequest.HttpServerRequest)

      if (tool !== undefined && Option.isSome(httpRequest)) {
        const pending: Array<{ readonly schema: unknown; readonly argument: unknown; readonly path: string }> = [
          { schema: tool.inputSchema, argument: request.arguments, path: "" }
        ]
        // Only properties paths may mirror headers; composition, arrays, and references do not qualify.
        while (pending.length > 0) {
          const { schema, argument, path } = pending.pop()!
          if (!Predicate.isReadonlyObject(schema)) continue
          const annotation = schema["x-mcp-header"]
          if (typeof annotation === "string") {
            const headerName = `mcp-param-${annotation.toLowerCase()}`
            if (!parameterHeaderMatches(httpRequest.value.headers[headerName], argument)) {
              return yield* failWithHttpStatus(
                400,
                new McpProtocol.ProtocolError({
                  code: PublicMcpSchema.HEADER_MISMATCH_ERROR_CODE,
                  message: `${headerName} does not match argument '${path}'`
                })
              )
            }
          }
          if (Predicate.isReadonlyObject(schema.properties)) {
            for (const [name, property] of Object.entries(schema.properties)) {
              pending.push({
                schema: property,
                argument: Predicate.isReadonlyObject(argument) && Object.hasOwn(argument, name)
                  ? argument[name]
                  : undefined,
                path: path === "" ? name : `${path}.${name}`
              })
            }
          }
        }
      }

      const outcome = yield* core.tools.call({ name: request.name, arguments: request.arguments ?? {} }, invocation)
        .pipe(
          Effect.catchTag(
            ["ToolExecutionError", "InvalidToolInput"],
            (error) =>
              Effect.succeed(McpCore.OperationOutcome.Complete(PublicMcpSchema.CallToolResult.make({
                content: [PublicMcpSchema.TextContent.make({ type: "text", text: error.message })],
                isError: true
              })))
          )
        )
      if (outcome._tag === "InputRequired") {
        yield* validateInputRequestCapabilities(outcome, invocation.protocol.clientCapabilities)
        return yield* projectCallToolOutcome(outcome, context.serverInfo)
      }
      const toolResult = outcome.value
      const content = toolResult.content.map(projectContent)
      return yield* projectCallToolOutcome(
        McpCore.OperationOutcome.Complete({
          content,
          structuredContent: toolResult.structuredContent,
          isError: toolResult.isError,
          _meta: toolResult._meta
        }),
        context.serverInfo
      )
    }, Effect.mapError(projectError)),
    "notifications/cancelled": Effect.fnUntraced(function*(
      _request: typeof McpSchema.CancelledNotification.payloadSchema.Type
    ) {
      return yield* Effect.void
    })
  })
}

const runtime = {
  _tag: "Stateless",
  transport: {
    jsonRpc: { acceptsBatches: false },
    http: {}
  },
  profileFromRequestMetadata
} as const

/**
 * @internal
 */
export const protocol = McpProtocol.make({
  protocolVersion: McpSchema.protocolVersion,
  runtime,
  clientRpcs: McpSchema.ClientRpcs,
  clientNotificationRpcs: McpSchema.ClientNotificationRpcs,
  serverRequestRpcs: McpSchema.ServerRequestRpcs,
  serverNotificationRpcs: McpSchema.ServerNotificationRpcs,
  handlerRpcs,
  makeHandlers,
  toReverseClient: () => ({
    listRoots: () => Effect.fail(unsupported("roots/list")),
    createMessage: () => Effect.fail(unsupported("sampling/createMessage")),
    elicit: () => Effect.fail(unsupported("elicitation/create"))
  }),
  projectNotification: (notification) =>
    McpProtocol.isSubscriptionServerNotification(notification)
      // @effect-diagnostics-next-line effectSucceedWithVoid:off the projector requires the value `undefined`
      ? Effect.succeed(undefined)
      : McpProtocol.makeNotificationProjector({
        supportsProgressMessage: true
      }, notification),
  normalizeCancellation
})
