import * as Effect from "../../../Effect.ts"
import * as Base64 from "../../../encoding/Base64.ts"
import * as Match from "../../../Match.ts"
import * as Predicate from "../../../Predicate.ts"
import * as Schema from "../../../Schema.ts"
import * as Struct from "../../../Struct.ts"
import * as PublicMcpSchema from "../../McpSchema.ts"
import * as McpCore from "../mcpCore.ts"
import * as McpProtocol from "../mcpProtocol.ts"
import * as McpRuntime from "../mcpRuntime.ts"
import * as McpSchema from "../mcpSchema/v2025_06_18.ts"

// Pings can arrive before initialize and do not require a client session.
const ClientRequestRpcs = McpSchema.ClientRequestRpcs.omit("ping").middleware(
  PublicMcpSchema.McpServerClientMiddleware
).add(McpSchema.Ping)

const ClientRpcs = ClientRequestRpcs.merge(McpSchema.ClientNotificationRpcs)

const AdapterRpcs = ClientRpcs.omit("ping")
const isToolOutputSchema = (
  schema: PublicMcpSchema.ToolOutputJson | undefined
): schema is PublicMcpSchema.ToolJson => {
  if (schema?.type !== "object") {
    return false
  }

  const isPropertiesSupported = schema.properties === undefined ||
    (Predicate.isReadonlyObject(schema.properties) &&
      Object.values(schema.properties).every(Predicate.isReadonlyObject))
  const isRequiredDefined = schema.required === undefined ||
    (Array.isArray(schema.required) && schema.required.every(Predicate.isString))

  return isPropertiesSupported && isRequiredDefined
}

const profileFromInitialize = (
  initialize: typeof McpSchema.Initialize.payloadSchema.Type
): McpCore.NegotiatedProtocolProfile => ({
  protocolVersion: McpSchema.protocolVersion,
  clientCapabilities: PublicMcpSchema.ClientCapabilities.make(initialize.capabilities),
  clientInfo: PublicMcpSchema.Implementation.make(initialize.clientInfo),
  requestMetadata: initialize._meta
})

const unsupported = (
  operation: PublicMcpSchema.McpReverseOperationUnsupported["operation"],
  reason: string
) =>
  new PublicMcpSchema.McpReverseOperationUnsupported({
    operation,
    protocolVersion: McpSchema.protocolVersion,
    reason
  })

const requireCapability = (
  profile: McpCore.NegotiatedProtocolProfile,
  operation: PublicMcpSchema.McpReverseOperationUnsupported["operation"],
  capability: "roots" | "sampling" | "elicitation"
) =>
  Object.hasOwn(profile.clientCapabilities, capability) &&
    profile.clientCapabilities[capability] !== undefined
    ? Effect.void
    : Effect.fail(unsupported(operation, `Client did not advertise the ${capability} capability`))

const projectContent = Effect.fnUntraced(function*(content: PublicMcpSchema.ContentBlock) {
  return Match.value(content).pipe(
    Match.when({ type: Match.is("text", "resource_link") }, (content) => content),
    Match.when({ type: Match.is("image", "audio") }, (content) => ({
      type: content.type,
      mimeType: content.mimeType,
      data: Base64.encode(content.data),
      annotations: content.annotations,
      _meta: content._meta
    })),
    Match.when({ type: "resource" }, (content) => {
      const resource = content.resource
      if ("text" in resource) {
        return McpSchema.EmbeddedResource.make({
          type: "resource",
          resource: {
            uri: resource.uri,
            mimeType: resource.mimeType,
            _meta: resource._meta,
            text: resource.text
          },
          annotations: content.annotations,
          _meta: content._meta
        })
      }
      return McpSchema.EmbeddedResource.make({
        type: "resource",
        resource: {
          uri: resource.uri,
          mimeType: resource.mimeType,
          _meta: resource._meta,
          blob: Base64.encode(resource.blob)
        },
        annotations: content.annotations,
        _meta: content._meta
      })
    }),
    Match.exhaustive
  )
})

const projectResourceContents = (
  content: PublicMcpSchema.TextResourceContents | PublicMcpSchema.BlobResourceContents
): typeof McpSchema.ResourceContents.Type =>
  "text" in content
    ? {
      uri: content.uri,
      mimeType: content.mimeType,
      _meta: content._meta,
      text: content.text
    }
    : {
      uri: content.uri,
      mimeType: content.mimeType,
      _meta: content._meta,
      blob: Base64.encode(content.blob)
    }

const projectStructuredContent = (
  content: Schema.Json | undefined
): Schema.JsonObject | undefined => content === undefined || isJsonObject(content) ? content : undefined

const isJsonObject = (value: Schema.Json): value is Schema.JsonObject => Predicate.isReadonlyObject(value)

/**
 * @internal
 */
export const protocol = McpProtocol.make({
  protocolVersion: McpSchema.protocolVersion,
  runtime: McpRuntime.stateful({
    jsonRpc: { acceptsBatches: false },
    http: { requiresVersionHeader: true }
  }),
  clientRpcs: ClientRpcs,
  clientNotificationRpcs: McpSchema.ClientNotificationRpcs,
  serverRequestRpcs: McpSchema.ServerRequestRpcs,
  serverNotificationRpcs: McpSchema.ServerNotificationRpcs,
  handlerRpcs: AdapterRpcs,
  makeHandlers: (core, lifecycle) =>
    AdapterRpcs.of({
      initialize: (request, { client }) =>
        lifecycle.initialize(McpSchema.protocolVersion, profileFromInitialize(request), client.id).pipe(
          Effect.map((result) =>
            McpSchema.InitializeResult.make({
              protocolVersion: McpSchema.protocolVersion,
              capabilities: ({
                experimental: result.capabilities.experimental,
                extensions: result.capabilities.extensions,
                logging: result.capabilities.logging ? {} : undefined,
                completions: result.capabilities.completions ? {} : undefined,
                prompts: result.capabilities.prompts,
                resources: result.capabilities.resources,
                tools: result.capabilities.tools
              }),
              serverInfo: result.serverInfo,
              instructions: result.instructions
            })
          )
        ),
      "logging/setLevel": ({ level }, { client, headers }) =>
        lifecycle.setLogLevel(level, client.id, headers).pipe(Effect.as({})),
      "notifications/cancelled": () => Effect.void,
      "notifications/initialized": (_, { client, headers }) =>
        lifecycle.clientNotification(McpCore.ClientNotification.Initialized(), client.id, headers),
      "notifications/progress": (progress, { client, headers }) =>
        lifecycle.clientNotification(
          McpCore.ClientNotification.Progress({
            progressToken: progress.progressToken,
            progress: progress.progress,
            total: progress.total,
            message: progress.message,
            metadata: progress._meta
          }),
          client.id,
          headers
        ),
      "notifications/roots/list_changed": (_, { client, headers }) =>
        lifecycle.clientNotification(McpCore.ClientNotification.RootsChanged(), client.id, headers),
      "resources/list": (_pageRequest) =>
        PublicMcpSchema.McpServerClient.use((request) => core.resources.list(McpProtocol.profileFromClient(request)))
          .pipe(
            Effect.map((resources) => McpSchema.ListResourcesResult.make({ resources }))
          ),
      "resources/templates/list": (_pageRequest) =>
        PublicMcpSchema.McpServerClient.use((request) =>
          core.resources.listTemplates(McpProtocol.profileFromClient(request))
        ).pipe(
          Effect.map((resourceTemplates) => McpSchema.ListResourceTemplatesResult.make({ resourceTemplates }))
        ),
      "resources/read": Effect.fnUntraced(function*({ uri }) {
        const request = yield* PublicMcpSchema.McpServerClient
        const result = yield* core.resources.read(uri, McpProtocol.invocationFromClient(request)).pipe(
          Effect.mapError(McpProtocol.ProtocolError.fromFeature)
        )
        return McpSchema.ReadResourceResult.make({
          contents: result.contents.map(projectResourceContents),
          _meta: result._meta
        })
      }),
      "resources/subscribe": ({ uri }, { client, headers }) =>
        lifecycle.subscribe(uri, client.id, headers).pipe(Effect.as({})),
      "resources/unsubscribe": ({ uri }, { client, headers }) =>
        lifecycle.unsubscribe(uri, client.id, headers).pipe(Effect.as({})),
      "prompts/list": (_pageRequest) =>
        PublicMcpSchema.McpServerClient.use((request) => core.prompts.list(McpProtocol.profileFromClient(request)))
          .pipe(
            Effect.map((prompts) => McpSchema.ListPromptsResult.make({ prompts }))
          ),
      "prompts/get": Effect.fnUntraced(function*({ arguments: args, name }) {
        const request = yield* PublicMcpSchema.McpServerClient
        const outcome = yield* core.prompts.get(name, args ?? {}, McpProtocol.invocationFromClient(request)).pipe(
          Effect.mapError(McpProtocol.ProtocolError.fromFeature)
        )
        if (outcome._tag === "InputRequired") {
          return yield* McpProtocol.ProtocolError.fromFeature(
            new McpCore.UnsupportedByProtocol({
              protocolVersion: McpSchema.protocolVersion,
              feature: "prompt input requirements"
            })
          )
        }
        const result = outcome.value
        const messages = yield* Effect.forEach(result.messages, (message) =>
          projectContent(message.content).pipe(
            Effect.map((content) => ({ role: message.role, content })),
            Effect.mapError(McpProtocol.ProtocolError.fromTool)
          ))
        return McpSchema.GetPromptResult.make({
          description: result.description,
          messages,
          _meta: result._meta
        })
      }),
      "completion/complete": Effect.fnUntraced(function*(completeRequest) {
        const request = yield* PublicMcpSchema.McpServerClient
        const result = yield* core.completions.complete({
          reference: completeRequest.ref.type === "ref/prompt"
            ? {
              type: "prompt",
              name: completeRequest.ref.name,
              title: completeRequest.ref.title
            }
            : { type: "resourceTemplate", uriTemplate: completeRequest.ref.uri },
          argument: completeRequest.argument,
          context: completeRequest.context?.arguments === undefined
            ? undefined
            : { arguments: completeRequest.context.arguments },
          metadata: completeRequest._meta
        }, McpProtocol.invocationFromClient(request)).pipe(Effect.mapError(McpProtocol.ProtocolError.fromFeature))
        return McpSchema.CompleteResult.make({
          completion: {
            values: Array.from(result.values),
            total: result.total,
            hasMore: result.hasMore
          },
          _meta: result.metadata
        })
      }),
      "tools/list": Effect.fnUntraced(function*() {
        const request = yield* PublicMcpSchema.McpServerClient
        const tools = yield* core.tools.list(McpProtocol.profileFromClient(request))
        return McpSchema.ListToolsResult.make({
          tools: tools.map((tool) =>
            McpSchema.Tool.make({
              name: tool.name,
              title: tool.title,
              description: tool.description,
              inputSchema: tool.inputSchema,
              outputSchema: isToolOutputSchema(tool.outputSchema)
                ? tool.outputSchema
                : undefined,
              annotations: tool.annotations === undefined
                ? undefined
                : McpSchema.ToolAnnotations.make({
                  title: tool.annotations.title,
                  readOnlyHint: tool.annotations.readOnlyHint,
                  destructiveHint: tool.annotations.destructiveHint,
                  idempotentHint: tool.annotations.idempotentHint,
                  openWorldHint: tool.annotations.openWorldHint
                }),
              _meta: tool._meta
            })
          )
        })
      }),
      "tools/call": Effect.fnUntraced(function*(call) {
        const request = yield* PublicMcpSchema.McpServerClient
        const result = yield* core.tools.call(
          { ...call, arguments: call.arguments ?? {} },
          McpProtocol.invocationFromClient(request)
        ).pipe(
          Effect.flatMap((outcome) => McpProtocol.requireCompleteOperation(McpSchema.protocolVersion, outcome)),
          Effect.mapError(McpProtocol.ProtocolError.fromTool)
        )
        const content = yield* Effect.forEach(McpProtocol.unwrapStringStructuredContent(result), projectContent).pipe(
          Effect.mapError(McpProtocol.ProtocolError.fromTool)
        )
        const structuredContent = projectStructuredContent(result.structuredContent)
        return McpSchema.CallToolResult.make({
          content,
          structuredContent,
          isError: result.isError,
          _meta: result._meta
        })
      })
    }),
  toReverseClient: (profile, client) => ({
    listRoots: Effect.fnUntraced(function*(request) {
      yield* requireCapability(profile, "roots/list", "roots")
      const wireRequest = yield* McpProtocol.transcode(
        PublicMcpSchema.ListRoots.payloadSchema,
        McpSchema.ListRoots.payloadSchema,
        request
      ).pipe(
        Effect.mapError(() => unsupported("roots/list", "Request is not representable by this protocol"))
      )
      const { roots } = yield* client["roots/list"](wireRequest).pipe(
        Effect.mapError(McpProtocol.reverseError("roots/list"))
      )
      return new PublicMcpSchema.ListRootsResult({ roots })
    }),
    createMessage: Effect.fnUntraced(function*(request) {
      yield* requireCapability(profile, "sampling/createMessage", "sampling")
      const wireRequest = yield* McpProtocol.transcodeStrict(
        PublicMcpSchema.CreateMessage.payloadSchema,
        McpSchema.CreateMessage.payloadSchema,
        request
      ).pipe(
        Effect.mapError(() => unsupported("sampling/createMessage", "Request is not representable by this protocol"))
      )
      const result = yield* client["sampling/createMessage"](wireRequest).pipe(
        Effect.mapError(McpProtocol.reverseError("sampling/createMessage"))
      )
      return yield* McpProtocol.transcode(
        McpSchema.CreateMessage.successSchema,
        PublicMcpSchema.CreateMessage.successSchema,
        result
      ).pipe(
        Effect.mapError(() =>
          unsupported("sampling/createMessage", "Response is not representable by the canonical model")
        )
      )
    }),
    elicit: Effect.fnUntraced(function*(request) {
      yield* requireCapability(profile, "elicitation/create", "elicitation")
      const projected = request.mode === "form"
        ? Struct.omit(request, ["mode"])
        : request
      const wireRequest = yield* Schema.decodeUnknownEffect(
        McpSchema.Elicit.payloadSchema,
        { onExcessProperty: "error" }
      )(projected).pipe(
        Effect.mapError(() => unsupported("elicitation/create", "Request is not representable by this protocol"))
      )
      const result = yield* client["elicitation/create"](wireRequest).pipe(
        Effect.mapError(McpProtocol.reverseError("elicitation/create"))
      )
      return yield* McpProtocol.transcode(
        McpSchema.Elicit.successSchema,
        PublicMcpSchema.Elicit.successSchema,
        result
      ).pipe(
        Effect.mapError(() => unsupported("elicitation/create", "Response is not representable by the canonical model"))
      )
    })
  }),
  projectNotification: (notification) =>
    McpProtocol.makeNotificationProjector({
      supportsProgressMessage: true
    }, notification),
  normalizeCancellation: (payload) =>
    Schema.decodeUnknownEffect(McpSchema.CancelledNotification.payloadSchema)(payload).pipe(
      Effect.map((request) => ({
        requestId: request.requestId,
        reason: request.reason,
        metadata: request._meta
      }))
    )
})
