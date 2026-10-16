/**
 * Exact MCP v2025-03-26 wire schemas.
 *
 * This revision is expressed as a frozen delta from the exact 2024-11-05
 * schemas. Transport envelopes (including JSON-RPC batches) are owned by the
 * transport codec rather than Effect RPC payload schemas.
 *
 * @internal
 */
import * as Rpc from "../../../rpc/Rpc.ts"
import * as RpcGroup from "../../../rpc/RpcGroup.ts"
import * as Schema from "../../../Schema.ts"
import * as Previous from "./v2024_11_05.ts"

export * from "./v2024_11_05.ts"

/**
 * @internal
 */
export const protocolVersion = "2025-03-26"

const optional = Previous.optional

/**
 * @internal
 */
export const ServerCapabilities = Schema.Struct({
  ...Previous.ServerCapabilities.fields,
  completions: optional(Schema.Struct({}))
})

/**
 * @internal
 */
export const AudioContent = Schema.Struct({
  type: Schema.Literal("audio"),
  data: Schema.String,
  mimeType: Schema.String,
  annotations: optional(Previous.Annotation)
})

/**
 * @internal
 */
export const PromptOrToolContent = Schema.Union([
  Previous.TextContent,
  Previous.ImageContent,
  AudioContent,
  Previous.EmbeddedResource
])

/**
 * @internal
 */
export const SamplingContent = Schema.Union([
  Previous.TextContent,
  Previous.ImageContent,
  AudioContent
])

/**
 * @internal
 */
export const PromptMessage = Schema.Struct({
  role: Previous.Role,
  content: PromptOrToolContent
})

/**
 * @internal
 */
export const SamplingMessage = Schema.Struct({
  role: Previous.Role,
  content: SamplingContent
})

/**
 * @internal
 */
export const ToolAnnotations = Schema.Struct({
  title: optional(Schema.String),
  readOnlyHint: optional(Schema.Boolean),
  destructiveHint: optional(Schema.Boolean),
  idempotentHint: optional(Schema.Boolean),
  openWorldHint: optional(Schema.Boolean)
})

/**
 * @internal
 */
export const Tool = Schema.Struct({
  ...Previous.Tool.fields,
  annotations: optional(ToolAnnotations)
})

/**
 * @internal
 */
export const InitializeResult = Schema.Struct({
  ...Previous.ResultMeta.fields,
  protocolVersion: Schema.String,
  capabilities: ServerCapabilities,
  serverInfo: Previous.Implementation,
  instructions: optional(Schema.String)
})

/**
 * @internal
 */
export const GetPromptResult = Schema.Struct({
  ...Previous.ResultMeta.fields,
  description: optional(Schema.String),
  messages: Schema.Array(PromptMessage)
})

/**
 * @internal
 */
export const ListToolsResult = Schema.Struct({
  ...Previous.PaginatedResult.fields,
  tools: Schema.Array(Tool)
})

/**
 * @internal
 */
export const CallToolResult = Schema.Struct({
  ...Previous.ResultMeta.fields,
  content: Schema.Array(PromptOrToolContent),
  isError: optional(Schema.Boolean)
})

/**
 * @internal
 */
export const CreateMessageResult = Schema.Struct({
  ...Previous.ResultMeta.fields,
  role: Previous.Role,
  content: SamplingContent,
  model: Schema.String,
  stopReason: optional(Schema.String)
})

/**
 * @internal
 */
export class Initialize extends Rpc.make("initialize", {
  success: InitializeResult,
  error: Previous.McpError,
  payload: {
    ...Previous.RequestMeta.fields,
    protocolVersion: Schema.String,
    capabilities: Previous.ClientCapabilities,
    clientInfo: Previous.Implementation
  }
}) {}

/**
 * @internal
 */
export class GetPrompt extends Rpc.make("prompts/get", {
  success: GetPromptResult,
  error: Previous.McpError,
  payload: {
    ...Previous.RequestMeta.fields,
    name: Schema.String,
    arguments: optional(Schema.Record(Schema.String, Schema.String))
  }
}) {}

/**
 * @internal
 */
export class ListTools extends Rpc.make("tools/list", {
  success: ListToolsResult,
  error: Previous.McpError,
  payload: Schema.UndefinedOr(Previous.PaginatedRequest)
}) {}

/**
 * @internal
 */
export class CallTool extends Rpc.make("tools/call", {
  success: CallToolResult,
  error: Previous.McpError,
  payload: {
    ...Previous.RequestMeta.fields,
    name: Schema.String,
    arguments: optional(Schema.JsonObject)
  }
}) {}

/**
 * @internal
 */
export class CreateMessage extends Rpc.make("sampling/createMessage", {
  success: CreateMessageResult,
  error: Previous.McpError,
  payload: {
    ...Previous.RequestMeta.fields,
    messages: Schema.Array(SamplingMessage),
    modelPreferences: optional(Previous.ModelPreferences),
    systemPrompt: optional(Schema.String),
    includeContext: optional(Schema.Literals(["none", "thisServer", "allServers"])),
    temperature: optional(Schema.Finite),
    maxTokens: Schema.Finite,
    stopSequences: optional(Schema.Array(Schema.String)),
    metadata: optional(Schema.JsonObject)
  }
}) {}

/**
 * @internal
 */
export class ProgressNotification extends Rpc.make("notifications/progress", {
  payload: {
    ...Previous.NotificationMeta.fields,
    progressToken: Previous.ProgressToken,
    progress: Schema.Finite,
    total: optional(Schema.Finite),
    message: optional(Schema.String)
  }
}) {}

/**
 * @internal
 */
export class ClientRequestRpcs extends RpcGroup.make(
  Previous.Ping,
  Initialize,
  Previous.Complete,
  Previous.SetLevel,
  GetPrompt,
  Previous.ListPrompts,
  Previous.ListResources,
  Previous.ListResourceTemplates,
  Previous.ReadResource,
  Previous.Subscribe,
  Previous.Unsubscribe,
  CallTool,
  ListTools
) {}

/**
 * @internal
 */
export class ClientNotificationRpcs extends RpcGroup.make(
  Previous.CancelledNotification,
  ProgressNotification,
  Previous.InitializedNotification,
  Previous.RootsListChangedNotification
) {}

/**
 * @internal
 */
export class ServerRequestRpcs extends RpcGroup.make(
  Previous.Ping,
  CreateMessage,
  Previous.ListRoots
) {}

/**
 * @internal
 */
export class ServerNotificationRpcs extends RpcGroup.make(
  Previous.CancelledNotification,
  ProgressNotification,
  Previous.LoggingMessageNotification,
  Previous.ResourceUpdatedNotification,
  Previous.ResourceListChangedNotification,
  Previous.ToolListChangedNotification,
  Previous.PromptListChangedNotification
) {}
