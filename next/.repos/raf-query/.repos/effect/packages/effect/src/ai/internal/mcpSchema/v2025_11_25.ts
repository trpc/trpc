/**
 * Supported non-Task MCP v2025-11-25 wire schemas.
 *
 * This module is a dated delta from v2025-06-18. Experimental Tasks are not
 * part of the supported vocabulary for this adapter.
 *
 * @internal
 */
import * as Rpc from "../../../rpc/Rpc.ts"
import * as RpcGroup from "../../../rpc/RpcGroup.ts"
import * as Schema from "../../../Schema.ts"
import * as Previous from "./v2025_06_18.ts"

export * from "./v2025_06_18.ts"

/**
 * @internal
 */
export const protocolVersion = "2025-11-25"

const optional = Previous.optional
const JsonObject = Schema.JsonObject
const Meta = optional(JsonObject)

/**
 * @internal
 */
export const Icon = Schema.Struct({
  src: Schema.String,
  mimeType: optional(Schema.String),
  sizes: optional(Schema.Array(Schema.String)),
  theme: optional(Schema.Literals(["light", "dark"]))
})

/**
 * @internal
 */
export const Implementation = Schema.Struct({
  ...Previous.Implementation.fields,
  description: optional(Schema.String),
  websiteUrl: optional(Schema.String),
  icons: optional(Schema.Array(Icon))
})

/**
 * @internal
 */
export const ClientCapabilities = Schema.Struct({
  ...Previous.ClientCapabilities.fields,
  sampling: optional(Schema.Struct({
    context: optional(JsonObject),
    tools: optional(JsonObject)
  })),
  elicitation: optional(Schema.Struct({
    form: optional(JsonObject),
    url: optional(JsonObject)
  }))
})

/**
 * @internal
 */
export const Annotations = Schema.Struct({
  ...Previous.Annotations.fields,
  lastModified: optional(Schema.String)
})

/**
 * @internal
 */
export const Resource = Schema.Struct({
  ...Previous.Resource.fields,
  annotations: optional(Annotations),
  icons: optional(Schema.Array(Icon))
})

/**
 * @internal
 */
export const ResourceTemplate = Schema.Struct({
  ...Previous.ResourceTemplate.fields,
  annotations: optional(Annotations),
  icons: optional(Schema.Array(Icon))
})

/**
 * @internal
 */
export const Prompt = Schema.Struct({
  ...Previous.Prompt.fields,
  icons: optional(Schema.Array(Icon))
})

/**
 * @internal
 */
export const TextContent = Schema.Struct({
  ...Previous.TextContent.fields,
  annotations: optional(Annotations)
})

/**
 * @internal
 */
export const ImageContent = Schema.Struct({
  ...Previous.ImageContent.fields,
  annotations: optional(Annotations)
})

/**
 * @internal
 */
export const AudioContent = Schema.Struct({
  ...Previous.AudioContent.fields,
  annotations: optional(Annotations)
})

/**
 * @internal
 */
export const EmbeddedResource = Schema.Struct({
  ...Previous.EmbeddedResource.fields,
  annotations: optional(Annotations)
})

/**
 * @internal
 */
export const ResourceLink = Schema.Struct({
  ...Resource.fields,
  type: Schema.Literal("resource_link")
})

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
export const PromptMessage = Schema.Struct({
  role: Previous.Role,
  content: ContentBlock
})

/**
 * @internal
 */
export const Tool = Schema.Struct({
  ...Previous.Tool.fields,
  icons: optional(Schema.Array(Icon))
})

/**
 * @internal
 */
export const CallToolResult = Schema.Struct({
  ...Previous.CallToolResult.fields,
  content: Schema.Array(ContentBlock)
})

/**
 * @internal
 */
export class CallTool extends Rpc.make("tools/call", {
  success: CallToolResult,
  error: Previous.McpError,
  payload: Previous.CallTool.payloadSchema
}) {}

/**
 * @internal
 */
export const ToolUseContent = Schema.Struct({
  type: Schema.Literal("tool_use"),
  id: Schema.String,
  name: Schema.String,
  input: JsonObject,
  _meta: Meta
})

/**
 * @internal
 */
export const ToolResultContent = Schema.Struct({
  type: Schema.Literal("tool_result"),
  toolUseId: Schema.String,
  content: Schema.Array(ContentBlock),
  structuredContent: optional(JsonObject),
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
  role: Previous.Role,
  content: Schema.Union([
    SamplingMessageContentBlock,
    Schema.Array(SamplingMessageContentBlock)
  ]),
  _meta: Meta
})

/**
 * @internal
 */
export const ToolChoice = Schema.Struct({
  mode: optional(Schema.Literals(["auto", "required", "none"]))
})

/**
 * @internal
 */
export const CreateMessageResult = Schema.Struct({
  ...Previous.ResultMeta.fields,
  ...SamplingMessage.fields,
  model: Schema.String,
  stopReason: optional(Schema.String)
})

/**
 * @internal
 */
export class CreateMessage extends Rpc.make("sampling/createMessage", {
  success: CreateMessageResult,
  error: Previous.McpError,
  payload: {
    ...Previous.CreateMessage.payloadSchema.fields,
    messages: Schema.Array(SamplingMessage),
    maxTokens: Schema.Int,
    tools: optional(Schema.Array(Tool)),
    toolChoice: optional(ToolChoice)
  }
}) {}

/**
 * @internal
 */
export const Root = Schema.Struct({
  ...Previous.Root.fields,
  _meta: Meta
})

/**
 * @internal
 */
export const ListRootsResult = Schema.Struct({
  ...Previous.ResultMeta.fields,
  roots: Schema.Array(Root)
})

/**
 * @internal
 */
export class ListRoots extends Rpc.make("roots/list", {
  success: ListRootsResult,
  error: Previous.McpError,
  payload: Schema.UndefinedOr(Previous.RequestMeta)
}) {}

/**
 * @internal
 */
export const StringSchema = Schema.Struct({
  type: Schema.Literal("string"),
  title: optional(Schema.String),
  description: optional(Schema.String),
  minLength: optional(Schema.Int),
  maxLength: optional(Schema.Int),
  format: optional(Schema.Literals(["email", "uri", "date", "date-time"])),
  default: optional(Schema.String)
})

/**
 * @internal
 */
export const NumberSchema = Schema.Struct({
  type: Schema.Literals(["number", "integer"]),
  title: optional(Schema.String),
  description: optional(Schema.String),
  minimum: optional(Schema.Finite),
  maximum: optional(Schema.Finite),
  default: optional(Schema.Finite)
})

/**
 * @internal
 */
export const BooleanSchema = Schema.Struct({
  type: Schema.Literal("boolean"),
  title: optional(Schema.String),
  description: optional(Schema.String),
  default: optional(Schema.Boolean)
})

const EnumOption = Schema.Struct({
  const: Schema.String,
  title: Schema.String
})

/**
 * @internal
 */
export const UntitledSingleSelectEnumSchema = Schema.Struct({
  type: Schema.Literal("string"),
  title: optional(Schema.String),
  description: optional(Schema.String),
  enum: Schema.Array(Schema.String),
  default: optional(Schema.String)
})

/**
 * @internal
 */
export const TitledSingleSelectEnumSchema = Schema.Struct({
  type: Schema.Literal("string"),
  title: optional(Schema.String),
  description: optional(Schema.String),
  oneOf: Schema.Array(EnumOption),
  default: optional(Schema.String)
})

/**
 * @internal
 */
export const SingleSelectEnumSchema = Schema.Union([
  UntitledSingleSelectEnumSchema,
  TitledSingleSelectEnumSchema
])

/**
 * @internal
 */
export const UntitledMultiSelectEnumSchema = Schema.Struct({
  type: Schema.Literal("array"),
  title: optional(Schema.String),
  description: optional(Schema.String),
  minItems: optional(Schema.Int),
  maxItems: optional(Schema.Int),
  items: Schema.Struct({
    type: Schema.Literal("string"),
    enum: Schema.Array(Schema.String)
  }),
  default: optional(Schema.Array(Schema.String))
})

/**
 * @internal
 */
export const TitledMultiSelectEnumSchema = Schema.Struct({
  type: Schema.Literal("array"),
  title: optional(Schema.String),
  description: optional(Schema.String),
  minItems: optional(Schema.Int),
  maxItems: optional(Schema.Int),
  items: Schema.Struct({
    anyOf: Schema.Array(EnumOption)
  }),
  default: optional(Schema.Array(Schema.String))
})

/**
 * @internal
 */
export const MultiSelectEnumSchema = Schema.Union([
  UntitledMultiSelectEnumSchema,
  TitledMultiSelectEnumSchema
])

/**
 * @internal
 */
export const LegacyTitledEnumSchema = Schema.Struct({
  type: Schema.Literal("string"),
  title: optional(Schema.String),
  description: optional(Schema.String),
  enum: Schema.Array(Schema.String),
  enumNames: optional(Schema.Array(Schema.String)),
  default: optional(Schema.String)
})

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
  ...Previous.RequestMeta.fields,
  mode: optional(Schema.Literal("form")),
  message: Schema.String,
  requestedSchema: RequestedSchema
})

/**
 * @internal
 */
export const ElicitRequestURLParams = Schema.Struct({
  ...Previous.RequestMeta.fields,
  mode: Schema.Literal("url"),
  message: Schema.String,
  elicitationId: Schema.String,
  url: Schema.String
})

/**
 * @internal
 */
export const ElicitRequestParams = Schema.Union([
  ElicitRequestFormParams,
  ElicitRequestURLParams
])

/**
 * @internal
 */
export const ElicitResult = Schema.Struct({
  ...Previous.ResultMeta.fields,
  action: Schema.Literals(["accept", "decline", "cancel"]),
  content: optional(Schema.Record(
    Schema.String,
    Schema.Union([Schema.String, Schema.Finite, Schema.Boolean, Schema.Array(Schema.String)])
  ))
})

/**
 * @internal
 */
export class Elicit extends Rpc.make("elicitation/create", {
  success: ElicitResult,
  error: Previous.McpError,
  payload: ElicitRequestParams
}) {}

/**
 * @internal
 */
export class ElicitationCompleteNotification extends Rpc.make("notifications/elicitation/complete", {
  payload: {
    elicitationId: Schema.String
  }
}) {}

/**
 * @internal
 */
export const InitializeResult = Schema.Struct({
  ...Previous.InitializeResult.fields,
  serverInfo: Implementation
})

/**
 * @internal
 */
export class Initialize extends Rpc.make("initialize", {
  success: InitializeResult,
  error: Previous.McpError,
  payload: {
    ...Previous.Initialize.payloadSchema.fields,
    capabilities: ClientCapabilities,
    clientInfo: Implementation
  }
}) {}

/**
 * @internal
 */
export const ListResourcesResult = Schema.Struct({
  ...Previous.PaginatedResult.fields,
  resources: Schema.Array(Resource)
})

/**
 * @internal
 */
export const ListResourceTemplatesResult = Schema.Struct({
  ...Previous.PaginatedResult.fields,
  resourceTemplates: Schema.Array(ResourceTemplate)
})

/**
 * @internal
 */
export const ListPromptsResult = Schema.Struct({
  ...Previous.PaginatedResult.fields,
  prompts: Schema.Array(Prompt)
})

/**
 * @internal
 */
export const GetPromptResult = Schema.Struct({
  ...Previous.GetPromptResult.fields,
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
export class ListResources extends Rpc.make("resources/list", {
  success: ListResourcesResult,
  error: Previous.McpError,
  payload: Schema.UndefinedOr(Previous.PaginatedRequest)
}) {}

/**
 * @internal
 */
export class ListResourceTemplates extends Rpc.make("resources/templates/list", {
  success: ListResourceTemplatesResult,
  error: Previous.McpError,
  payload: Schema.UndefinedOr(Previous.PaginatedRequest)
}) {}

/**
 * @internal
 */
export class ListPrompts extends Rpc.make("prompts/list", {
  success: ListPromptsResult,
  error: Previous.McpError,
  payload: Schema.UndefinedOr(Previous.PaginatedRequest)
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
export class ClientRequestRpcs extends RpcGroup.make(
  Previous.Ping,
  Initialize,
  Previous.Complete,
  Previous.SetLevel,
  GetPrompt,
  ListPrompts,
  ListResources,
  ListResourceTemplates,
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
  Previous.ProgressNotification,
  Previous.InitializedNotification,
  Previous.RootsListChangedNotification
) {}

/**
 * @internal
 */
export class ServerRequestRpcs extends RpcGroup.make(
  Previous.Ping,
  CreateMessage,
  ListRoots,
  Elicit
) {}

/**
 * @internal
 */
export class ServerNotificationRpcs extends RpcGroup.make(
  Previous.CancelledNotification,
  Previous.ProgressNotification,
  Previous.LoggingMessageNotification,
  Previous.ResourceUpdatedNotification,
  Previous.ResourceListChangedNotification,
  Previous.ToolListChangedNotification,
  Previous.PromptListChangedNotification,
  ElicitationCompleteNotification
) {}
