/**
 * Exact MCP v2024-11-05 wire schemas.
 *
 * Transport topology is intentionally not represented here. This module owns
 * the dated JSON-RPC method payloads and results only.
 *
 * @internal
 */
import * as Option from "../../../Option.ts"
import * as Rpc from "../../../rpc/Rpc.ts"
import * as RpcGroup from "../../../rpc/RpcGroup.ts"
import * as Schema from "../../../Schema.ts"
import * as SchemaGetter from "../../../SchemaGetter.ts"

/**
 * @internal
 */
export const protocolVersion = "2024-11-05"

/**
 * @internal
 */
export const optional = <S extends Schema.Constraint>(
  schema: S
): Schema.decodeTo<Schema.toType<Schema.optional<S>>, Schema.optionalKey<S>> =>
  Schema.optionalKey(schema).pipe(
    Schema.decodeTo(Schema.toType(Schema.optional(schema)), {
      decode: SchemaGetter.passthrough(),
      encode: SchemaGetter.transformOptional(Option.flatMap(Option.fromUndefinedOr))
    })
  )
const JsonObject = Schema.JsonObject

/**
 * @internal
 */
export const RequestId = Schema.Union([Schema.String, Schema.Finite])
/**
 * @internal
 */
export const ProgressToken = Schema.Union([Schema.String, Schema.Finite])
/**
 * @internal
 */
export const Role = Schema.Literals(["user", "assistant"])
/**
 * @internal
 */
export const LoggingLevel = Schema.Literals([
  "debug",
  "info",
  "notice",
  "warning",
  "error",
  "critical",
  "alert",
  "emergency"
])

/**
 * @internal
 */
export const RequestMeta = Schema.Struct({
  _meta: optional(Schema.StructWithRest(
    Schema.Struct({
      progressToken: optional(ProgressToken)
    }),
    [Schema.JsonObject]
  ))
})

/**
 * @internal
 */
export const NotificationMeta = Schema.Struct({
  _meta: optional(JsonObject)
})

/**
 * @internal
 */
export const ResultMeta = Schema.Struct({
  _meta: optional(JsonObject)
})

/**
 * @internal
 */
export const PaginatedRequest = Schema.Struct({
  ...RequestMeta.fields,
  cursor: optional(Schema.String)
})

/**
 * @internal
 */
export const PaginatedResult = Schema.Struct({
  ...ResultMeta.fields,
  nextCursor: optional(Schema.String)
})

/**
 * @internal
 */
export const Implementation = Schema.Struct({
  name: Schema.String,
  version: Schema.String
})

/**
 * @internal
 */
export const ClientCapabilities = Schema.Struct({
  extensions: optional(Schema.Record(Schema.TemplateLiteral([Schema.String, "/", Schema.String]), Schema.Json)),
  experimental: optional(Schema.Record(Schema.String, JsonObject)),
  roots: optional(Schema.Struct({
    listChanged: optional(Schema.Boolean)
  })),
  sampling: optional(JsonObject)
})

/**
 * @internal
 */
export const ServerCapabilities = Schema.Struct({
  extensions: optional(Schema.Record(Schema.TemplateLiteral([Schema.String, "/", Schema.String]), Schema.Json)),
  experimental: optional(Schema.Record(Schema.String, JsonObject)),
  logging: optional(JsonObject),
  prompts: optional(Schema.Struct({
    listChanged: optional(Schema.Boolean)
  })),
  resources: optional(Schema.Struct({
    subscribe: optional(Schema.Boolean),
    listChanged: optional(Schema.Boolean)
  })),
  tools: optional(Schema.Struct({
    listChanged: optional(Schema.Boolean)
  }))
})

/**
 * @internal
 */
export const McpError = Schema.Struct({
  code: Schema.Int,
  message: Schema.String,
  data: optional(Schema.Any)
})
/**
 * @internal
 */
export type McpError = typeof McpError.Type

/**
 * @internal
 */
export const Annotation = Schema.Struct({
  audience: optional(Schema.Array(Role)),
  priority: optional(Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 })))
})

/**
 * @internal
 */
export const TextResourceContents = Schema.Struct({
  uri: Schema.String,
  mimeType: optional(Schema.String),
  text: Schema.String
})

/**
 * @internal
 */
export const BlobResourceContents = Schema.Struct({
  uri: Schema.String,
  mimeType: optional(Schema.String),
  blob: Schema.String
})

/**
 * @internal
 */
export const ResourceContents = Schema.Union([
  TextResourceContents,
  BlobResourceContents
])

/**
 * @internal
 */
export const TextContent = Schema.Struct({
  type: Schema.Literal("text"),
  text: Schema.String,
  annotations: optional(Annotation)
})

/**
 * @internal
 */
export const ImageContent = Schema.Struct({
  type: Schema.Literal("image"),
  data: Schema.String,
  mimeType: Schema.String,
  annotations: optional(Annotation)
})

/**
 * @internal
 */
export const EmbeddedResource = Schema.Struct({
  type: Schema.Literal("resource"),
  resource: ResourceContents,
  annotations: optional(Annotation)
})

/**
 * @internal
 */
export const PromptOrToolContent = Schema.Union([
  TextContent,
  ImageContent,
  EmbeddedResource
])

/**
 * @internal
 */
export const SamplingContent = Schema.Union([
  TextContent,
  ImageContent
])

/**
 * @internal
 */
export const Resource = Schema.Struct({
  uri: Schema.String,
  name: Schema.String,
  description: optional(Schema.String),
  mimeType: optional(Schema.String),
  size: optional(Schema.Finite),
  annotations: optional(Annotation)
})

/**
 * @internal
 */
export const ResourceTemplate = Schema.Struct({
  uriTemplate: Schema.String,
  name: Schema.String,
  description: optional(Schema.String),
  mimeType: optional(Schema.String),
  annotations: optional(Annotation)
})

/**
 * @internal
 */
export const PromptArgument = Schema.Struct({
  name: Schema.String,
  description: optional(Schema.String),
  required: optional(Schema.Boolean)
})

/**
 * @internal
 */
export const Prompt = Schema.Struct({
  name: Schema.String,
  description: optional(Schema.String),
  arguments: optional(Schema.Array(PromptArgument))
})

/**
 * @internal
 */
export const PromptMessage = Schema.Struct({
  role: Role,
  content: PromptOrToolContent
})

/**
 * @internal
 */
export const ToolInputSchema = Schema.Struct({
  type: Schema.Literal("object"),
  properties: optional(Schema.Record(Schema.String, JsonObject)),
  required: optional(Schema.Array(Schema.String))
})

/**
 * @internal
 */
export const Tool = Schema.Struct({
  name: Schema.String,
  description: optional(Schema.String),
  inputSchema: ToolInputSchema
})

/**
 * @internal
 */
export const ModelHint = Schema.Struct({
  name: optional(Schema.String)
})

/**
 * @internal
 */
export const ModelPreferences = Schema.Struct({
  hints: optional(Schema.Array(ModelHint)),
  costPriority: optional(Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 }))),
  speedPriority: optional(Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 }))),
  intelligencePriority: optional(Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 })))
})

/**
 * @internal
 */
export const SamplingMessage = Schema.Struct({
  role: Role,
  content: SamplingContent
})

/**
 * @internal
 */
export const ResourceReference = Schema.Struct({
  type: Schema.Literal("ref/resource"),
  uri: Schema.String
})

/**
 * @internal
 */
export const PromptReference = Schema.Struct({
  type: Schema.Literal("ref/prompt"),
  name: Schema.String
})

/**
 * @internal
 */
export const Root = Schema.Struct({
  uri: Schema.String,
  name: optional(Schema.String)
})

/**
 * @internal
 */
export const InitializeResult = Schema.Struct({
  ...ResultMeta.fields,
  protocolVersion: Schema.String,
  capabilities: ServerCapabilities,
  serverInfo: Implementation,
  instructions: optional(Schema.String)
})

/**
 * @internal
 */
export const ListResourcesResult = Schema.Struct({
  ...PaginatedResult.fields,
  resources: Schema.Array(Resource)
})

/**
 * @internal
 */
export const ListResourceTemplatesResult = Schema.Struct({
  ...PaginatedResult.fields,
  resourceTemplates: Schema.Array(ResourceTemplate)
})

/**
 * @internal
 */
export const ReadResourceResult = Schema.Struct({
  ...ResultMeta.fields,
  contents: Schema.Array(ResourceContents)
})

/**
 * @internal
 */
export const ListPromptsResult = Schema.Struct({
  ...PaginatedResult.fields,
  prompts: Schema.Array(Prompt)
})

/**
 * @internal
 */
export const GetPromptResult = Schema.Struct({
  ...ResultMeta.fields,
  description: optional(Schema.String),
  messages: Schema.Array(PromptMessage)
})

/**
 * @internal
 */
export const ListToolsResult = Schema.Struct({
  ...PaginatedResult.fields,
  tools: Schema.Array(Tool)
})

/**
 * @internal
 */
export const CallToolResult = Schema.Struct({
  ...ResultMeta.fields,
  content: Schema.Array(PromptOrToolContent),
  isError: optional(Schema.Boolean)
})

/**
 * @internal
 */
export const CreateMessageResult = Schema.Struct({
  ...ResultMeta.fields,
  role: Role,
  content: SamplingContent,
  model: Schema.String,
  stopReason: optional(Schema.String)
})

/**
 * @internal
 */
export const CompleteResult = Schema.Struct({
  ...ResultMeta.fields,
  completion: Schema.Struct({
    values: Schema.Array(Schema.String),
    total: optional(Schema.Finite),
    hasMore: optional(Schema.Boolean)
  })
})

/**
 * @internal
 */
export const ListRootsResult = Schema.Struct({
  ...ResultMeta.fields,
  roots: Schema.Array(Root)
})

/**
 * @internal
 */
export class Ping extends Rpc.make("ping", {
  success: ResultMeta,
  error: McpError,
  payload: Schema.UndefinedOr(RequestMeta)
}) {}

/**
 * @internal
 */
export class Initialize extends Rpc.make("initialize", {
  success: InitializeResult,
  error: McpError,
  payload: {
    ...RequestMeta.fields,
    protocolVersion: Schema.String,
    capabilities: ClientCapabilities,
    clientInfo: Implementation
  }
}) {}

/**
 * @internal
 */
export class Complete extends Rpc.make("completion/complete", {
  success: CompleteResult,
  error: McpError,
  payload: {
    ...RequestMeta.fields,
    ref: Schema.Union([PromptReference, ResourceReference]),
    argument: Schema.Struct({
      name: Schema.String,
      value: Schema.String
    })
  }
}) {}

/**
 * @internal
 */
export class SetLevel extends Rpc.make("logging/setLevel", {
  success: ResultMeta,
  error: McpError,
  payload: {
    ...RequestMeta.fields,
    level: LoggingLevel
  }
}) {}

/**
 * @internal
 */
export class GetPrompt extends Rpc.make("prompts/get", {
  success: GetPromptResult,
  error: McpError,
  payload: {
    ...RequestMeta.fields,
    name: Schema.String,
    arguments: optional(Schema.Record(Schema.String, Schema.String))
  }
}) {}

/**
 * @internal
 */
export class ListPrompts extends Rpc.make("prompts/list", {
  success: ListPromptsResult,
  error: McpError,
  payload: Schema.UndefinedOr(PaginatedRequest)
}) {}

/**
 * @internal
 */
export class ListResources extends Rpc.make("resources/list", {
  success: ListResourcesResult,
  error: McpError,
  payload: Schema.UndefinedOr(PaginatedRequest)
}) {}

/**
 * @internal
 */
export class ListResourceTemplates extends Rpc.make("resources/templates/list", {
  success: ListResourceTemplatesResult,
  error: McpError,
  payload: Schema.UndefinedOr(PaginatedRequest)
}) {}

/**
 * @internal
 */
export class ReadResource extends Rpc.make("resources/read", {
  success: ReadResourceResult,
  error: McpError,
  payload: {
    ...RequestMeta.fields,
    uri: Schema.String
  }
}) {}

/**
 * @internal
 */
export class Subscribe extends Rpc.make("resources/subscribe", {
  success: ResultMeta,
  error: McpError,
  payload: {
    ...RequestMeta.fields,
    uri: Schema.String
  }
}) {}

/**
 * @internal
 */
export class Unsubscribe extends Rpc.make("resources/unsubscribe", {
  success: ResultMeta,
  error: McpError,
  payload: {
    ...RequestMeta.fields,
    uri: Schema.String
  }
}) {}

/**
 * @internal
 */
export class CallTool extends Rpc.make("tools/call", {
  success: CallToolResult,
  error: McpError,
  payload: {
    ...RequestMeta.fields,
    name: Schema.String,
    arguments: optional(JsonObject)
  }
}) {}

/**
 * @internal
 */
export class ListTools extends Rpc.make("tools/list", {
  success: ListToolsResult,
  error: McpError,
  payload: Schema.UndefinedOr(PaginatedRequest)
}) {}

/**
 * @internal
 */
export class CreateMessage extends Rpc.make("sampling/createMessage", {
  success: CreateMessageResult,
  error: McpError,
  payload: {
    ...RequestMeta.fields,
    messages: Schema.Array(SamplingMessage),
    modelPreferences: optional(ModelPreferences),
    systemPrompt: optional(Schema.String),
    includeContext: optional(Schema.Literals(["none", "thisServer", "allServers"])),
    temperature: optional(Schema.Finite),
    maxTokens: Schema.Finite,
    stopSequences: optional(Schema.Array(Schema.String)),
    metadata: optional(JsonObject)
  }
}) {}

/**
 * @internal
 */
export class ListRoots extends Rpc.make("roots/list", {
  success: ListRootsResult,
  error: McpError,
  payload: Schema.UndefinedOr(RequestMeta)
}) {}

/**
 * @internal
 */
export class CancelledNotification extends Rpc.make("notifications/cancelled", {
  payload: {
    ...NotificationMeta.fields,
    requestId: RequestId,
    reason: optional(Schema.String)
  }
}) {}

/**
 * @internal
 */
export class ProgressNotification extends Rpc.make("notifications/progress", {
  payload: {
    ...NotificationMeta.fields,
    progressToken: ProgressToken,
    progress: Schema.Finite,
    total: optional(Schema.Finite)
  }
}) {}

/**
 * @internal
 */
export class InitializedNotification extends Rpc.make("notifications/initialized", {
  payload: Schema.UndefinedOr(NotificationMeta)
}) {}

/**
 * @internal
 */
export class RootsListChangedNotification extends Rpc.make("notifications/roots/list_changed", {
  payload: Schema.UndefinedOr(NotificationMeta)
}) {}

/**
 * @internal
 */
export class LoggingMessageNotification extends Rpc.make("notifications/message", {
  payload: {
    ...NotificationMeta.fields,
    level: LoggingLevel,
    logger: optional(Schema.String),
    data: Schema.Any
  }
}) {}

/**
 * @internal
 */
export class ResourceUpdatedNotification extends Rpc.make("notifications/resources/updated", {
  payload: {
    ...NotificationMeta.fields,
    uri: Schema.String
  }
}) {}

/**
 * @internal
 */
export class ResourceListChangedNotification extends Rpc.make("notifications/resources/list_changed", {
  payload: Schema.UndefinedOr(NotificationMeta)
}) {}

/**
 * @internal
 */
export class ToolListChangedNotification extends Rpc.make("notifications/tools/list_changed", {
  payload: Schema.UndefinedOr(NotificationMeta)
}) {}

/**
 * @internal
 */
export class PromptListChangedNotification extends Rpc.make("notifications/prompts/list_changed", {
  payload: Schema.UndefinedOr(NotificationMeta)
}) {}

/**
 * @internal
 */
export class ClientRequestRpcs extends RpcGroup.make(
  Ping,
  Initialize,
  Complete,
  SetLevel,
  GetPrompt,
  ListPrompts,
  ListResources,
  ListResourceTemplates,
  ReadResource,
  Subscribe,
  Unsubscribe,
  CallTool,
  ListTools
) {}

/**
 * @internal
 */
export class ClientNotificationRpcs extends RpcGroup.make(
  CancelledNotification,
  ProgressNotification,
  InitializedNotification,
  RootsListChangedNotification
) {}

/**
 * @internal
 */
export class ServerRequestRpcs extends RpcGroup.make(
  Ping,
  CreateMessage,
  ListRoots
) {}

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
  PromptListChangedNotification
) {}
