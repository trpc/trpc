/**
 * MCP v2026-07-28 wire schemas.
 *
 * @internal
 */
import * as Rpc from "../../../rpc/Rpc.ts"
import * as RpcGroup from "../../../rpc/RpcGroup.ts"
import * as Schema from "../../../Schema.ts"
import * as Previous from "./v2025_11_25.ts"

export * from "./v2025_11_25.ts"

/**
 * @internal
 */
export const protocolVersion = "2026-07-28"

const optional = Previous.optional
const Meta = optional(Schema.JsonObject)

/**
 * @internal
 */
export const RequestId = Schema.Union([Schema.String, Schema.Int])
/**
 * @internal
 */
export const ProgressToken = RequestId
/**
 * @internal
 */
export const Role = Previous.Role
/**
 * @internal
 */
export const LoggingLevel = Previous.LoggingLevel
/**
 * @internal
 */
export const Implementation = Previous.Implementation

/**
 * @internal
 */
export const ClientCapabilities = Schema.StructWithRest(
  Schema.Struct({
    experimental: optional(Schema.Record(Schema.String, Schema.JsonObject)),
    roots: optional(Schema.Struct({})),
    sampling: optional(Schema.Struct({
      context: optional(Schema.JsonObject),
      tools: optional(Schema.JsonObject)
    })),
    elicitation: optional(Schema.Struct({
      form: optional(Schema.JsonObject),
      url: optional(Schema.JsonObject)
    })),
    extensions: optional(Schema.Record(Schema.String, Schema.JsonObject))
  }),
  [Schema.JsonObject]
)

/**
 * @internal
 */
export const ServerCapabilities = Schema.StructWithRest(
  Schema.Struct({
    experimental: optional(Schema.Record(Schema.String, Schema.JsonObject)),
    logging: optional(Schema.JsonObject),
    completions: optional(Schema.JsonObject),
    prompts: optional(Schema.Struct({ listChanged: optional(Schema.Boolean) })),
    resources: optional(Schema.Struct({
      subscribe: optional(Schema.Boolean),
      listChanged: optional(Schema.Boolean)
    })),
    tools: optional(Schema.Struct({ listChanged: optional(Schema.Boolean) })),
    extensions: optional(Schema.Record(Schema.String, Schema.JsonObject))
  }),
  [Schema.JsonObject]
)

/**
 * @internal
 */
export const RequestMetaObject = Schema.StructWithRest(
  Schema.Struct({
    progressToken: optional(ProgressToken),
    "io.modelcontextprotocol/protocolVersion": Schema.String,
    "io.modelcontextprotocol/clientInfo": optional(Implementation),
    "io.modelcontextprotocol/clientCapabilities": ClientCapabilities,
    "io.modelcontextprotocol/logLevel": optional(LoggingLevel)
  }),
  [Schema.JsonObject]
)

/**
 * @internal
 */
export const RequestParams = Schema.Struct({ _meta: RequestMetaObject })

/**
 * @internal
 */
export const NotificationMetaObject = Schema.StructWithRest(
  Schema.Struct({
    "io.modelcontextprotocol/subscriptionId": optional(RequestId)
  }),
  [Schema.JsonObject]
)
/**
 * @internal
 */
export const NotificationParams = Schema.Struct({ _meta: optional(NotificationMetaObject) })

/**
 * @internal
 */
export const ResultMetaObject = Schema.StructWithRest(
  Schema.Struct({
    "io.modelcontextprotocol/serverInfo": Implementation
  }),
  [Schema.JsonObject]
)
/**
 * @internal
 */
export const ResultMeta = {
  _meta: ResultMetaObject,
  resultType: Schema.Literal("complete")
}
/**
 * @internal
 */
export const McpError = Schema.Struct({
  code: Schema.Int,
  message: Schema.String,
  data: optional(Schema.Json)
})
/**
 * @internal
 */
export type McpError = typeof McpError.Type

/**
 * @internal
 */
export const METHOD_NOT_FOUND = -32601
/**
 * @internal
 */
export const INVALID_PARAMS = -32602
/**
 * @internal
 */
export const MISSING_REQUIRED_CLIENT_CAPABILITY = -32021

/**
 * @internal
 */
export const Annotations = Previous.Annotations

/**
 * @internal
 */
export const Resource = Schema.Struct({
  ...Previous.Resource.fields,
  size: optional(Schema.Int),
  annotations: optional(Annotations)
})

/**
 * @internal
 */
export const ResourceTemplate = Previous.ResourceTemplate
/**
 * @internal
 */
export const ResourceContents = Previous.ResourceContents
/**
 * @internal
 */
export const TextContent = Previous.TextContent
/**
 * @internal
 */
export const ImageContent = Previous.ImageContent
/**
 * @internal
 */
export const AudioContent = Previous.AudioContent
/**
 * @internal
 */
export const ResourceLink = Schema.Struct({ ...Resource.fields, type: Schema.Literal("resource_link") })
/**
 * @internal
 */
export const EmbeddedResource = Previous.EmbeddedResource
/**
 * @internal
 */
export const ContentBlock = Schema.Union([
  TextContent,
  ImageContent,
  AudioContent,
  ResourceLink,
  EmbeddedResource
])

/**
 * @internal
 */
export const Prompt = Previous.Prompt
/**
 * @internal
 */
export const PromptMessage = Schema.Struct({ role: Role, content: ContentBlock })

const ToolInputSchema = Schema.StructWithRest(
  Schema.Struct({
    $schema: optional(Schema.String),
    type: Schema.Literal("object")
  }),
  [Schema.JsonObject]
)
const ToolOutputSchema = Schema.StructWithRest(
  Schema.Struct({ $schema: optional(Schema.String) }),
  [Schema.JsonObject]
)
/**
 * @internal
 */
export const ToolAnnotations = Previous.ToolAnnotations
/**
 * @internal
 */
export const Tool = Schema.Struct({
  ...Previous.Tool.fields,
  inputSchema: ToolInputSchema,
  outputSchema: optional(ToolOutputSchema),
  annotations: optional(ToolAnnotations)
})

/**
 * @internal
 */
export const ToolUseContent = Previous.ToolUseContent
/**
 * @internal
 */
export const ToolResultContent = Schema.Struct({
  type: Schema.Literal("tool_result"),
  toolUseId: Schema.String,
  content: Schema.Array(ContentBlock),
  structuredContent: optional(Schema.Json),
  isError: optional(Schema.Boolean),
  _meta: Meta
})
/**
 * @internal
 */
export const SamplingMessageContentBlock = Schema.Union([
  TextContent,
  ImageContent,
  AudioContent,
  ToolUseContent,
  ToolResultContent
])
/**
 * @internal
 */
export const SamplingMessage = Schema.Struct({
  role: Role,
  content: Schema.Union([SamplingMessageContentBlock, Schema.Array(SamplingMessageContentBlock)]),
  _meta: Meta
})
/**
 * @internal
 */
export const ModelHint = Schema.StructWithRest(
  Schema.Struct({ name: optional(Schema.String) }),
  [Schema.JsonObject]
)
const ModelPriority = Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 }))
/**
 * @internal
 */
export const ModelPreferences = Schema.Struct({
  ...Previous.ModelPreferences.fields,
  hints: optional(Schema.Array(ModelHint)),
  costPriority: optional(ModelPriority),
  speedPriority: optional(ModelPriority),
  intelligencePriority: optional(ModelPriority)
})
/**
 * @internal
 */
export const ToolChoice = Previous.ToolChoice

/**
 * @internal
 */
export const CreateMessageRequest = Schema.Struct({
  method: Schema.Literal("sampling/createMessage"),
  params: Schema.Struct({
    messages: Schema.Array(SamplingMessage),
    modelPreferences: optional(ModelPreferences),
    systemPrompt: optional(Schema.String),
    includeContext: optional(Schema.Literals(["none", "thisServer", "allServers"])),
    temperature: optional(Schema.Finite),
    maxTokens: Schema.Int,
    stopSequences: optional(Schema.Array(Schema.String)),
    metadata: optional(Schema.JsonObject),
    tools: optional(Schema.Array(Tool)),
    toolChoice: optional(ToolChoice)
  })
})
/**
 * @internal
 */
export const CreateMessageResult = Schema.Struct({
  ...SamplingMessage.fields,
  model: Schema.String,
  stopReason: optional(Schema.String)
})

/**
 * @internal
 */
export const Root = Previous.Root
/**
 * @internal
 */
export const ListRootsRequest = Schema.Struct({
  method: Schema.Literal("roots/list"),
  params: optional(Schema.Struct({ _meta: Meta }))
})
/**
 * @internal
 */
export const ListRootsResult = Schema.Struct({ roots: Schema.Array(Root) })

/**
 * @internal
 */
export const StringSchema = Previous.StringSchema
/**
 * @internal
 */
export const NumberSchema = Previous.NumberSchema
/**
 * @internal
 */
export const BooleanSchema = Previous.BooleanSchema
/**
 * @internal
 */
export const SingleSelectEnumSchema = Previous.SingleSelectEnumSchema
/**
 * @internal
 */
export const MultiSelectEnumSchema = Previous.MultiSelectEnumSchema
/**
 * @internal
 */
export const LegacyTitledEnumSchema = Previous.LegacyTitledEnumSchema
/**
 * @internal
 */
export const EnumSchema = Schema.Union([
  LegacyTitledEnumSchema,
  SingleSelectEnumSchema,
  MultiSelectEnumSchema
])
/**
 * @internal
 */
export const PrimitiveSchemaDefinition = Schema.Union([
  EnumSchema,
  StringSchema,
  NumberSchema,
  BooleanSchema
])
/**
 * @internal
 */
export const RequestedSchema = Schema.Struct({
  $schema: optional(Schema.String),
  type: Schema.Literal("object"),
  properties: Schema.Record(Schema.String, PrimitiveSchemaDefinition),
  required: optional(Schema.Array(Schema.String))
})
/**
 * @internal
 */
export const ElicitRequestFormParams = Schema.Struct({
  mode: optional(Schema.Literal("form")),
  message: Schema.String,
  requestedSchema: RequestedSchema
})
/**
 * @internal
 */
export const ElicitRequestURLParams = Schema.Struct({
  mode: Schema.Literal("url"),
  message: Schema.String,
  url: Schema.String
})
/**
 * @internal
 */
export const ElicitRequestParams = Schema.Union([ElicitRequestFormParams, ElicitRequestURLParams])
/**
 * @internal
 */
export const ElicitRequest = Schema.Struct({
  method: Schema.Literal("elicitation/create"),
  params: ElicitRequestParams
})
/**
 * @internal
 */
export const ElicitResult = Schema.Struct({
  action: Schema.Literals(["accept", "decline", "cancel"]),
  content: optional(Schema.Record(
    Schema.String,
    Schema.Union([Schema.String, Schema.Finite, Schema.Boolean, Schema.Array(Schema.String)])
  ))
})

/**
 * @internal
 */
export const InputRequest = Schema.Union([CreateMessageRequest, ListRootsRequest, ElicitRequest])
/**
 * @internal
 */
export const InputResponse = Schema.Union([CreateMessageResult, ListRootsResult, ElicitResult])
/**
 * @internal
 */
export const InputRequests = Schema.Record(Schema.String, InputRequest)
/**
 * @internal
 */
export const InputResponses = Schema.Record(Schema.String, InputResponse)
const InputRequiredResultMeta = {
  _meta: ResultMetaObject,
  resultType: Schema.Literal("input_required")
}
/**
 * @internal
 */
export const InputRequiredResult = Schema.Union([
  Schema.StructWithRest(
    Schema.Struct({
      ...InputRequiredResultMeta,
      inputRequests: InputRequests,
      requestState: optional(Schema.String)
    }),
    [Schema.JsonObject]
  ),
  Schema.StructWithRest(
    Schema.Struct({
      ...InputRequiredResultMeta,
      inputRequests: optional(InputRequests),
      requestState: Schema.String
    }),
    [Schema.JsonObject]
  )
])
/**
 * @internal
 */
export const InputResponseRequestParams = {
  ...RequestParams.fields,
  inputResponses: optional(InputResponses),
  requestState: optional(Schema.String)
}

/**
 * @internal
 */
export const CacheableResult = {
  ...ResultMeta,
  ttlMs: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  cacheScope: Schema.Literals(["public", "private"])
}
/**
 * @internal
 */
export const PaginatedRequestParams = {
  ...RequestParams.fields,
  cursor: optional(Schema.String)
}
/**
 * @internal
 */
export const PaginatedResult = {
  ...ResultMeta,
  nextCursor: optional(Schema.String)
}

/**
 * @internal
 */
export const DiscoverResult = Schema.StructWithRest(
  Schema.Struct({
    ...CacheableResult,
    supportedVersions: Schema.Array(Schema.String),
    capabilities: ServerCapabilities,
    instructions: optional(Schema.String)
  }),
  [Schema.JsonObject]
)
/**
 * @internal
 */
export class Discover extends Rpc.make("server/discover", {
  success: DiscoverResult,
  error: McpError,
  payload: RequestParams
}) {}

/**
 * @internal
 */
export const ListResourcesResult = Schema.StructWithRest(
  Schema.Struct({
    ...PaginatedResult,
    ...CacheableResult,
    resources: Schema.Array(Resource)
  }),
  [Schema.JsonObject]
)
/**
 * @internal
 */
export class ListResources extends Rpc.make("resources/list", {
  success: ListResourcesResult,
  error: McpError,
  payload: PaginatedRequestParams
}) {}

/**
 * @internal
 */
export const ListResourceTemplatesResult = Schema.StructWithRest(
  Schema.Struct({
    ...PaginatedResult,
    ...CacheableResult,
    resourceTemplates: Schema.Array(ResourceTemplate)
  }),
  [Schema.JsonObject]
)
/**
 * @internal
 */
export class ListResourceTemplates extends Rpc.make("resources/templates/list", {
  success: ListResourceTemplatesResult,
  error: McpError,
  payload: PaginatedRequestParams
}) {}

/**
 * @internal
 */
export const ReadResourceResult = Schema.StructWithRest(
  Schema.Struct({
    ...CacheableResult,
    contents: Schema.Array(ResourceContents)
  }),
  [Schema.JsonObject]
)
/**
 * @internal
 */
export class ReadResource extends Rpc.make("resources/read", {
  success: Schema.Union([ReadResourceResult, InputRequiredResult]),
  error: McpError,
  payload: { ...InputResponseRequestParams, uri: Schema.String }
}) {}

/**
 * @internal
 */
export const ListPromptsResult = Schema.StructWithRest(
  Schema.Struct({
    ...PaginatedResult,
    ...CacheableResult,
    prompts: Schema.Array(Prompt)
  }),
  [Schema.JsonObject]
)
/**
 * @internal
 */
export class ListPrompts extends Rpc.make("prompts/list", {
  success: ListPromptsResult,
  error: McpError,
  payload: PaginatedRequestParams
}) {}

/**
 * @internal
 */
export const GetPromptResult = Schema.StructWithRest(
  Schema.Struct({
    ...ResultMeta,
    description: optional(Schema.String),
    messages: Schema.Array(PromptMessage)
  }),
  [Schema.JsonObject]
)
/**
 * @internal
 */
export class GetPrompt extends Rpc.make("prompts/get", {
  success: Schema.Union([GetPromptResult, InputRequiredResult]),
  error: McpError,
  payload: {
    ...InputResponseRequestParams,
    name: Schema.String,
    arguments: optional(Schema.Record(Schema.String, Schema.String))
  }
}) {}

/**
 * @internal
 */
export const ListToolsResult = Schema.StructWithRest(
  Schema.Struct({
    ...PaginatedResult,
    ...CacheableResult,
    tools: Schema.Array(Tool)
  }),
  [Schema.JsonObject]
)
/**
 * @internal
 */
export class ListTools extends Rpc.make("tools/list", {
  success: ListToolsResult,
  error: McpError,
  payload: PaginatedRequestParams
}) {}

/**
 * @internal
 */
export const CallToolResult = Schema.StructWithRest(
  Schema.Struct({
    ...ResultMeta,
    content: Schema.Array(ContentBlock),
    structuredContent: optional(Schema.Json),
    isError: optional(Schema.Boolean)
  }),
  [Schema.JsonObject]
)
/**
 * @internal
 */
export class CallTool extends Rpc.make("tools/call", {
  success: Schema.Union([CallToolResult, InputRequiredResult]),
  error: McpError,
  payload: {
    ...InputResponseRequestParams,
    name: Schema.String,
    arguments: optional(Schema.JsonObject)
  }
}) {}

/**
 * @internal
 */
export const PromptReference = Previous.PromptReference
/**
 * @internal
 */
export const ResourceTemplateReference = Previous.ResourceTemplateReference
/**
 * @internal
 */
export const CompleteResult = Schema.StructWithRest(
  Schema.Struct({
    ...ResultMeta,
    completion: Schema.Struct({
      values: Schema.Array(Schema.String).check(Schema.isMaxLength(100)),
      total: optional(Schema.Int),
      hasMore: optional(Schema.Boolean)
    })
  }),
  [Schema.JsonObject]
)
/**
 * @internal
 */
export class Complete extends Rpc.make("completion/complete", {
  success: CompleteResult,
  error: McpError,
  payload: {
    ...RequestParams.fields,
    ref: Schema.Union([PromptReference, ResourceTemplateReference]),
    argument: Schema.Struct({ name: Schema.String, value: Schema.String }),
    context: optional(Schema.Struct({
      arguments: optional(Schema.Record(Schema.String, Schema.String))
    }))
  }
}) {}

/**
 * @internal
 */
export const SubscriptionFilter = Schema.Struct({
  toolsListChanged: optional(Schema.Boolean),
  promptsListChanged: optional(Schema.Boolean),
  resourcesListChanged: optional(Schema.Boolean),
  resourceSubscriptions: optional(Schema.Array(Schema.String))
})
/**
 * @internal
 */
export const SubscriptionsListenResultMetaObject = Schema.StructWithRest(
  Schema.Struct({
    "io.modelcontextprotocol/serverInfo": Implementation,
    "io.modelcontextprotocol/subscriptionId": RequestId
  }),
  [Schema.JsonObject]
)
/**
 * @internal
 */
export const SubscriptionsListenResult = Schema.StructWithRest(
  Schema.Struct({
    _meta: SubscriptionsListenResultMetaObject,
    resultType: Schema.Literal("complete")
  }),
  [Schema.JsonObject]
)
/**
 * @internal
 */
export class SubscriptionsListen extends Rpc.make("subscriptions/listen", {
  success: SubscriptionsListenResult,
  error: McpError,
  payload: { ...RequestParams.fields, notifications: SubscriptionFilter }
}) {}

/**
 * @internal
 */
export class CancelledNotification extends Rpc.make("notifications/cancelled", {
  payload: {
    ...NotificationParams.fields,
    requestId: RequestId,
    reason: optional(Schema.String)
  }
}) {}
/**
 * @internal
 */
export class ProgressNotification extends Rpc.make("notifications/progress", {
  payload: {
    ...NotificationParams.fields,
    progressToken: ProgressToken,
    progress: Schema.Finite,
    total: optional(Schema.Finite),
    message: optional(Schema.String)
  }
}) {}
/**
 * @internal
 */
export class LoggingMessageNotification extends Rpc.make("notifications/message", {
  payload: {
    ...NotificationParams.fields,
    level: LoggingLevel,
    logger: optional(Schema.String),
    data: Schema.Json
  }
}) {}
/**
 * @internal
 */
export class ResourceUpdatedNotification extends Rpc.make("notifications/resources/updated", {
  payload: { ...NotificationParams.fields, uri: Schema.String }
}) {}
/**
 * @internal
 */
export class ResourceListChangedNotification extends Rpc.make("notifications/resources/list_changed", {
  payload: Schema.UndefinedOr(NotificationParams)
}) {}
/**
 * @internal
 */
export class ToolListChangedNotification extends Rpc.make("notifications/tools/list_changed", {
  payload: Schema.UndefinedOr(NotificationParams)
}) {}
/**
 * @internal
 */
export class PromptListChangedNotification extends Rpc.make("notifications/prompts/list_changed", {
  payload: Schema.UndefinedOr(NotificationParams)
}) {}
/**
 * @internal
 */
export class SubscriptionsAcknowledgedNotification extends Rpc.make(
  "notifications/subscriptions/acknowledged",
  { payload: { ...NotificationParams.fields, notifications: SubscriptionFilter } }
) {}

/**
 * @internal
 */
export class ClientRequestRpcs extends RpcGroup.make(
  Discover,
  Complete,
  GetPrompt,
  ListPrompts,
  ListResources,
  ListResourceTemplates,
  ReadResource,
  SubscriptionsListen,
  CallTool,
  ListTools
) {}

/**
 * @internal
 */
export class ClientNotificationRpcs extends RpcGroup.make(CancelledNotification) {}
/**
 * @internal
 */
export class ClientRpcs extends ClientRequestRpcs.merge(ClientNotificationRpcs) {}

// In v2026-07-28 these requests are embedded in InputRequiredResult rather than
// being sent as independent JSON-RPC requests.
/**
 * @internal
 */
export class ServerRequestRpcs extends RpcGroup.make() {}

/**
 * @internal
 */
export class ServerNotificationRpcs extends RpcGroup.make(
  CancelledNotification,
  ProgressNotification,
  LoggingMessageNotification,
  ResourceUpdatedNotification,
  ResourceListChangedNotification,
  ToolListChangedNotification,
  PromptListChangedNotification,
  SubscriptionsAcknowledgedNotification
) {}
