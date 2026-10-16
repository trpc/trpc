/**
 * The `OpenAiSchema` module defines the request, response, streaming, and
 * embedding schemas used by the handwritten OpenAI client. These schemas are
 * the transport boundary for JSON sent to and decoded from the Responses and
 * embeddings endpoints.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Effect from "effect/Effect"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import * as SchemaTransformation from "effect/SchemaTransformation"

const UnknownRecord = Schema.Record(Schema.String, Schema.Unknown)

const JsonObject = Schema.Record(Schema.String, Schema.Unknown)

const MessageRole = Schema.Literals(["system", "developer", "user", "assistant"])

const ImageDetail = Schema.Literals(["low", "high", "auto"])

const PromptCacheBreakpoint = Schema.Struct({
  mode: Schema.Literal("explicit")
})

/**
 * Schema for optional `include` values supported by the local handwritten
 * Responses client schema.
 *
 * **Details**
 *
 * These values request additional response fields such as image URLs, encrypted
 * reasoning content, output logprobs, code interpreter outputs, or web search
 * sources. This schema enumerates the include values supported by this client
 * path.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const IncludeEnum = Schema.Literals([
  "message.input_image.image_url",
  "reasoning.encrypted_content",
  "message.output_text.logprobs",
  "code_interpreter_call.outputs",
  "web_search_call.action.sources"
])

/**
 * Type of optional `include` values accepted by OpenAI Responses requests.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type IncludeEnum = typeof IncludeEnum.Type

/**
 * Schema for lifecycle statuses shared by messages, reasoning items, and tool calls.
 *
 * **Details**
 *
 * Accepted values are `"in_progress"`, `"completed"`, and `"incomplete"`.
 * This item-level status is used by message, reasoning, and tool-call shapes.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const MessageStatus = Schema.Literals(["in_progress", "completed", "incomplete"])

/**
 * Lifecycle status shared by messages, reasoning items, and tool calls.
 *
 * **Details**
 *
 * Accepted values are `"in_progress"`, `"completed"`, and `"incomplete"`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type MessageStatus = typeof MessageStatus.Type

const InputTextContent = Schema.Struct({
  type: Schema.Literal("input_text"),
  text: Schema.String,
  prompt_cache_breakpoint: Schema.optional(PromptCacheBreakpoint)
})

const InputImageContent = Schema.Struct({
  type: Schema.Literal("input_image"),
  image_url: Schema.optionalKey(Schema.NullOr(Schema.String)),
  file_id: Schema.optionalKey(Schema.NullOr(Schema.String)),
  detail: Schema.optionalKey(Schema.NullOr(ImageDetail))
})

const InputFileContent = Schema.Struct({
  type: Schema.Literal("input_file"),
  file_id: Schema.optionalKey(Schema.NullOr(Schema.String)),
  filename: Schema.optionalKey(Schema.String),
  file_url: Schema.optionalKey(Schema.String),
  file_data: Schema.optionalKey(Schema.String)
})

/**
 * Schema for content blocks accepted in OpenAI Responses input messages.
 *
 * **Details**
 *
 * Accepted block variants are `input_text`, `input_image`, and `input_file`.
 *
 * @see {@link InputItem} for request input item shapes that can contain these content blocks
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const InputContent = Schema.Union([
  InputTextContent,
  InputImageContent,
  InputFileContent
])

/**
 * Content block accepted in OpenAI Responses input messages.
 *
 * **Details**
 *
 * Accepted block variants are `input_text`, `input_image`, and `input_file`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type InputContent = typeof InputContent.Type

/**
 * Schema for a text block containing a model-provided reasoning summary.
 *
 * **Details**
 *
 * The decoded shape is `type: "summary_text"` plus `text` containing the
 * reasoning summary text.
 *
 * @see {@link ReasoningItem} for reasoning output items that contain summary text blocks
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const SummaryTextContent = Schema.Struct({
  type: Schema.Literal("summary_text"),
  text: Schema.String
})

/**
 * Text content block used for model-provided reasoning summaries.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type SummaryTextContent = typeof SummaryTextContent.Type

const ReasoningTextContent = Schema.Struct({
  type: Schema.Literal("reasoning_text"),
  text: Schema.String
})

const RefusalContent = Schema.Struct({
  type: Schema.Literal("refusal"),
  refusal: Schema.String
})

const TextContent = Schema.Struct({
  type: Schema.Literal("text"),
  text: Schema.String
})

const ComputerScreenshotContent = Schema.Struct({
  type: Schema.Literal("computer_screenshot"),
  image_url: Schema.NullOr(Schema.String),
  file_id: Schema.NullOr(Schema.String)
})

const FileCitationAnnotation = Schema.Struct({
  type: Schema.Literal("file_citation"),
  file_id: Schema.String,
  index: Schema.Int,
  filename: Schema.String
})

const UrlCitationAnnotation = Schema.Struct({
  type: Schema.Literal("url_citation"),
  url: Schema.String,
  start_index: Schema.Int,
  end_index: Schema.Int,
  title: Schema.String
})

const ContainerFileCitationAnnotation = Schema.Struct({
  type: Schema.Literal("container_file_citation"),
  container_id: Schema.String,
  file_id: Schema.String,
  start_index: Schema.Int,
  end_index: Schema.Int,
  filename: Schema.String
})

const FilePathAnnotation = Schema.Struct({
  type: Schema.Literal("file_path"),
  file_id: Schema.String,
  index: Schema.Int
})

/**
 * Schema for citation and file-path annotations attached to output text content.
 *
 * **Details**
 *
 * Accepts annotation objects discriminated by `type`: `file_citation`,
 * `url_citation`, `container_file_citation`, or `file_path`.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Annotation = Schema.Union([
  FileCitationAnnotation,
  UrlCitationAnnotation,
  ContainerFileCitationAnnotation,
  FilePathAnnotation
])

/**
 * Citation or file-path annotation attached to output text content.
 *
 * **Details**
 *
 * Accepted annotation variants are `file_citation`, `url_citation`,
 * `container_file_citation`, and `file_path`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Annotation = typeof Annotation.Type

const OutputTextContent = Schema.Struct({
  type: Schema.Literal("output_text"),
  text: Schema.String,
  annotations: Schema.Array(Annotation),
  logprobs: Schema.optionalKey(Schema.Array(Schema.Unknown))
})

const OutputMessageContent = Schema.Union([
  InputTextContent,
  OutputTextContent,
  TextContent,
  SummaryTextContent,
  ReasoningTextContent,
  RefusalContent,
  InputImageContent,
  ComputerScreenshotContent,
  InputFileContent
])

const OutputMessage = Schema.Struct({
  id: Schema.String,
  type: Schema.Literal("message"),
  role: Schema.Literal("assistant"),
  content: Schema.Array(OutputMessageContent),
  status: MessageStatus
})

/**
 * Schema for a reasoning output item containing encrypted content, summaries, and optional reasoning text.
 *
 * **When to use**
 *
 * Use when decoding or encoding OpenAI Responses reasoning items that may be
 * carried into later request input.
 *
 * **Details**
 *
 * Reasoning items represent model reasoning content. `summary` is required,
 * while `content` and `status` are optional.
 *
 * **Gotchas**
 *
 * `encrypted_content` is populated only when `reasoning.encrypted_content` is
 * requested through `include`.
 *
 * @see {@link InputItem} for request input items that can carry reasoning items
 * @see {@link IncludeEnum} for requesting encrypted reasoning content
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ReasoningItem = Schema.Struct({
  type: Schema.Literal("reasoning"),
  id: Schema.String,
  encrypted_content: Schema.optionalKey(Schema.NullOr(Schema.String)),
  summary: Schema.Array(SummaryTextContent),
  content: Schema.optionalKey(Schema.Array(ReasoningTextContent)),
  status: Schema.optionalKey(MessageStatus)
})

/**
 * Reasoning output item containing encrypted content, summaries, and optional reasoning text.
 *
 * **When to use**
 *
 * Use when typing OpenAI Responses reasoning items that may be carried into
 * later request input.
 *
 * **Details**
 *
 * Reasoning items represent model reasoning content. `summary` is required,
 * while `content` and `status` are optional.
 *
 * **Gotchas**
 *
 * `encrypted_content` is populated only when `reasoning.encrypted_content` is
 * requested through `include`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ReasoningItem = typeof ReasoningItem.Type

const FunctionCall = Schema.Struct({
  id: Schema.optionalKey(Schema.String),
  type: Schema.Literal("function_call"),
  call_id: Schema.String,
  name: Schema.String,
  arguments: Schema.String,
  status: Schema.optionalKey(MessageStatus)
})

const FunctionCallOutput = Schema.Struct({
  id: Schema.optionalKey(Schema.NullOr(Schema.String)),
  type: Schema.Literal("function_call_output"),
  call_id: Schema.String,
  output: Schema.Union([
    Schema.String,
    Schema.Array(InputContent)
  ]),
  status: Schema.optionalKey(Schema.NullOr(MessageStatus))
})

const ItemReference = Schema.Struct({
  type: Schema.Literal("item_reference"),
  id: Schema.String
})

const LocalShellCall = Schema.Struct({
  id: Schema.optionalKey(Schema.String),
  type: Schema.Literal("local_shell_call"),
  call_id: Schema.String,
  action: Schema.Unknown,
  status: Schema.optionalKey(MessageStatus)
})

const LocalShellCallOutput = Schema.Struct({
  id: Schema.optionalKey(Schema.String),
  type: Schema.Literal("local_shell_call_output"),
  call_id: Schema.String,
  output: Schema.Unknown,
  status: Schema.optionalKey(MessageStatus)
})

const ShellCall = Schema.Struct({
  id: Schema.optionalKey(Schema.String),
  type: Schema.Literal("shell_call"),
  call_id: Schema.String,
  action: Schema.Unknown,
  status: Schema.optionalKey(MessageStatus)
})

const ShellCallOutput = Schema.Struct({
  id: Schema.optionalKey(Schema.String),
  type: Schema.Literal("shell_call_output"),
  call_id: Schema.String,
  output: Schema.Unknown,
  status: Schema.optionalKey(MessageStatus)
})

const ApplyPatchCallOutput = Schema.Struct({
  id: Schema.optionalKey(Schema.String),
  type: Schema.Literal("apply_patch_call_output"),
  call_id: Schema.String,
  status: Schema.optionalKey(MessageStatus),
  output: Schema.optionalKey(Schema.Unknown)
})

const McpApprovalResponse = Schema.Struct({
  type: Schema.Literal("mcp_approval_response"),
  approval_request_id: Schema.String,
  approve: Schema.Boolean
})

const RequestMessageItem = Schema.Struct({
  type: Schema.optionalKey(Schema.Literal("message")),
  role: MessageRole,
  status: Schema.optionalKey(MessageStatus),
  content: Schema.Union([
    Schema.String,
    Schema.Array(InputContent)
  ])
})

const InputCodeInterpreterCall = Schema.Struct({
  id: Schema.String,
  type: Schema.Literal("code_interpreter_call"),
  code: Schema.optionalKey(Schema.NullOr(Schema.String)),
  container_id: Schema.String,
  outputs: Schema.optionalKey(Schema.NullOr(Schema.Array(Schema.Unknown))),
  status: Schema.optionalKey(
    Schema.Literals(["in_progress", "completed", "incomplete", "interpreting", "failed"])
  )
})

const InputFileSearchCall = Schema.Struct({
  id: Schema.String,
  type: Schema.Literal("file_search_call"),
  status: Schema.optionalKey(Schema.String),
  queries: Schema.optionalKey(Schema.Array(Schema.String)),
  results: Schema.optionalKey(Schema.NullOr(Schema.Unknown))
})

const InputImageGenerationCall = Schema.Struct({
  id: Schema.String,
  type: Schema.Literal("image_generation_call"),
  result: Schema.optionalKey(Schema.NullOr(Schema.String)),
  status: Schema.optionalKey(Schema.Literals(["in_progress", "completed", "generating", "failed"]))
})

const InputWebSearchCall = Schema.Struct({
  id: Schema.String,
  type: Schema.Literal("web_search_call"),
  action: Schema.optionalKey(Schema.Unknown),
  status: Schema.optionalKey(Schema.String)
})

/**
 * Schema for item shapes accepted by an OpenAI Responses request `input` field.
 *
 * **When to use**
 *
 * Use when validating structured `CreateResponse.input` array items.
 *
 * **Details**
 *
 * Accepted item families include request/output messages, function call and
 * function call output, reasoning items, item references, shell and local shell
 * calls and outputs, apply-patch output, and MCP approval responses.
 *
 * @see {@link CreateResponse} for the request schema that consumes input items
 * @see {@link InputContent} for content blocks inside message items
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const InputItem = Schema.Union([
  RequestMessageItem,
  OutputMessage,
  FunctionCall,
  FunctionCallOutput,
  ReasoningItem,
  ItemReference,
  LocalShellCall,
  LocalShellCallOutput,
  ShellCall,
  ShellCallOutput,
  ApplyPatchCallOutput,
  McpApprovalResponse,
  InputCodeInterpreterCall,
  InputFileSearchCall,
  InputImageGenerationCall,
  InputWebSearchCall
])

/**
 * Item shape accepted by an OpenAI Responses request `input` field.
 *
 * **When to use**
 *
 * Use when typing structured `CreateResponse.input` array items.
 *
 * **Details**
 *
 * Accepted item families include request/output messages, function call and
 * function call output, reasoning items, item references, shell and local shell
 * calls and outputs, apply-patch output, and MCP approval responses.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type InputItem = typeof InputItem.Type

const FunctionTool = Schema.Struct({
  type: Schema.Literal("function"),
  name: Schema.String,
  description: Schema.optionalKey(Schema.NullOr(Schema.String)),
  parameters: Schema.optionalKey(Schema.NullOr(JsonObject)),
  strict: Schema.optionalKey(Schema.NullOr(Schema.Boolean))
})

const CustomTool = Schema.Struct({
  type: Schema.Literal("custom"),
  name: Schema.String,
  description: Schema.optionalKey(Schema.String),
  format: Schema.optionalKey(Schema.Unknown)
})

const ProviderDefinedTool = Schema.StructWithRest(
  Schema.Struct({
    type: Schema.Literals([
      "apply_patch",
      "code_interpreter",
      "file_search",
      "image_generation",
      "local_shell",
      "mcp",
      "shell",
      "web_search",
      "web_search_preview"
    ])
  }),
  [UnknownRecord]
)

/**
 * Schema for tool definitions that can be supplied to an OpenAI Responses request.
 *
 * **When to use**
 *
 * Use when validating or encoding the `tools` array for a Responses request,
 * including provider-defined tool records with provider-specific fields.
 *
 * **Details**
 *
 * Accepted variants are function tools, custom tools, and provider-defined
 * OpenAI tools. Provider-defined `type` literals include `apply_patch`,
 * `code_interpreter`, `file_search`, `image_generation`, `local_shell`, `mcp`,
 * `shell`, `web_search`, and `web_search_preview`.
 *
 * **Gotchas**
 *
 * Provider-defined tools use `Schema.StructWithRest`, so this schema checks the
 * provider tool `type` and permits additional provider fields rather than fully
 * validating every provider-specific tool payload.
 *
 * @see {@link ToolChoice} for selecting whether and which tools the model may call
 * @see {@link CreateResponse} for the request schema that consumes tools
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Tool = Schema.Union([
  FunctionTool,
  CustomTool,
  ProviderDefinedTool
])

/**
 * Tool definition that can be supplied to an OpenAI Responses request.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Tool = typeof Tool.Type

/**
 * Schema for selecting whether and which tools the model may call in a Responses request.
 *
 * **When to use**
 *
 * Use when validating or encoding the `tool_choice` field that constrains model
 * tool use separately from the tool definitions themselves.
 *
 * **Details**
 *
 * Accepted forms are `"none"`, `"auto"`, `"required"`, an allowed-tools set,
 * a named function or custom tool, or a provider-defined tool choice.
 *
 * @see {@link Tool} for tool definitions referenced by tool choices
 * @see {@link CreateResponse} for the request schema that consumes `tool_choice`
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ToolChoice = Schema.Union([
  Schema.Literals(["none", "auto", "required"]),
  Schema.Struct({
    type: Schema.Literal("allowed_tools"),
    mode: Schema.Literals(["auto", "required"]),
    tools: Schema.Array(JsonObject)
  }),
  Schema.Struct({
    type: Schema.Literal("function"),
    name: Schema.String
  }),
  Schema.Struct({
    type: Schema.Literal("custom"),
    name: Schema.String
  }),
  Schema.StructWithRest(
    Schema.Struct({
      type: Schema.Literals([
        "apply_patch",
        "code_interpreter",
        "file_search",
        "image_generation",
        "local_shell",
        "mcp",
        "shell",
        "web_search",
        "web_search_preview"
      ])
    }),
    [UnknownRecord]
  )
])

/**
 * Tool selection mode or named tool choice for a Responses request.
 *
 * **Details**
 *
 * Accepted forms are `"none"`, `"auto"`, `"required"`, an allowed-tools set,
 * a named function or custom tool, or a provider-defined tool choice.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ToolChoice = typeof ToolChoice.Type

/**
 * Schema for text output format configuration, including plain text, JSON object, and JSON Schema responses.
 *
 * **When to use**
 *
 * Use when validating or encoding the `text.format` setting for a Responses
 * request, especially when choosing structured JSON Schema output.
 *
 * **Details**
 *
 * Accepted variants are `text`, `json_schema`, and `json_object`.
 *
 * **Gotchas**
 *
 * `json_object` is the older JSON mode. Prefer `json_schema` for models that
 * support it.
 *
 * @see {@link CreateResponse} for the request schema that consumes text format configuration
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const TextResponseFormatConfiguration = Schema.Union([
  Schema.Struct({ type: Schema.Literal("text") }),
  Schema.Struct({
    type: Schema.Literal("json_schema"),
    description: Schema.optionalKey(Schema.String),
    name: Schema.String,
    schema: JsonObject,
    strict: Schema.optionalKey(Schema.NullOr(Schema.Boolean))
  }),
  Schema.Struct({ type: Schema.Literal("json_object") })
])

/**
 * Text output format configuration for plain text, JSON object, or JSON Schema responses.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type TextResponseFormatConfiguration = typeof TextResponseFormatConfiguration.Type

/**
 * Schema for request options used to create an OpenAI Responses API response.
 *
 * **When to use**
 *
 * Use to validate or encode payloads sent to the OpenAI Responses API.
 *
 * **Details**
 *
 * Validates the Responses API request payload, including input content, model
 * selection, instructions, reasoning options, text output format, tools,
 * `tool_choice`, streaming, storage, response continuation, sampling options,
 * prompt caching, and optional response fields requested through `include`.
 *
 * **Gotchas**
 *
 * When `stream` is `true`, the API returns stream events instead of a single
 * response object.
 *
 * @see {@link Response} for decoded non-streaming response objects
 * @see {@link ResponseStreamEvent} for decoded streaming event objects
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const CreateResponse = Schema.Struct({
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  top_logprobs: Schema.optional(Schema.Int),
  temperature: Schema.optional(Schema.Finite),
  top_p: Schema.optional(Schema.Finite),
  user: Schema.optional(Schema.String),
  prompt_cache_key: Schema.optional(Schema.String),
  prompt_cache_options: Schema.optional(Schema.Struct({
    mode: Schema.optional(Schema.Literals(["implicit", "explicit"])),
    ttl: Schema.optional(Schema.Literal("30m")),
    comparison_response_id: Schema.optional(Schema.NullOr(Schema.String))
  })),
  service_tier: Schema.optional(Schema.String),
  previous_response_id: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
  reasoning: Schema.optional(Schema.Struct({
    effort: Schema.optional(Schema.Literals(["none", "minimal", "low", "medium", "high", "xhigh", "max"])),

    summary: Schema.optional(Schema.Literals(["auto", "concise", "detailed"])),
    generate_summary: Schema.optional(Schema.Literals(["auto", "concise", "detailed"]))
  })),
  background: Schema.optional(Schema.Boolean),
  max_output_tokens: Schema.optional(Schema.Int),
  max_tool_calls: Schema.optional(Schema.Int),
  text: Schema.optional(
    Schema.Struct({
      format: Schema.optional(TextResponseFormatConfiguration),
      verbosity: Schema.optional(Schema.Literals(["low", "medium", "high"]))
    })
  ),
  tools: Schema.optional(Schema.Array(Tool)),
  tool_choice: Schema.optional(ToolChoice),
  truncation: Schema.optional(Schema.Literals(["auto", "disabled"])),
  input: Schema.optional(
    Schema.Union([
      Schema.String,
      Schema.Array(InputItem)
    ])
  ),
  include: Schema.optional(Schema.Array(IncludeEnum)),
  store: Schema.optional(Schema.Boolean),
  instructions: Schema.optional(Schema.String),
  stream: Schema.optional(Schema.Boolean),
  conversation: Schema.optional(Schema.String),
  modalities: Schema.optional(Schema.Array(Schema.Literals(["text", "audio"]))),
  seed: Schema.optional(Schema.Int)
})

/**
 * Request options used to create an OpenAI Responses API response.
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export type CreateResponse = typeof CreateResponse.Type

/**
 * Schema for token accounting reported on OpenAI Responses API response objects.
 *
 * **Details**
 *
 * The required counters are `input_tokens`, `output_tokens`, and
 * `total_tokens`. Provider-specific token detail objects are preserved through
 * `input_tokens_details`, `output_tokens_details`, and additional fields.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ResponseUsage = Schema.StructWithRest(
  Schema.Struct({
    input_tokens: Schema.Int,
    output_tokens: Schema.Int,
    total_tokens: Schema.Int,
    input_tokens_details: Schema.optionalKey(Schema.Unknown),
    output_tokens_details: Schema.optionalKey(Schema.Unknown)
  }),
  [UnknownRecord]
)

/**
 * Token accounting reported on OpenAI Responses API response objects.
 *
 * **Details**
 *
 * Includes total input, output, and combined token counts, with provider-specific
 * token detail fields preserved when present.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ResponseUsage = typeof ResponseUsage.Type

const ApplyPatchOperation = Schema.Struct({
  type: Schema.String,
  path: Schema.String,
  diff: Schema.optionalKey(Schema.String)
})

const ApplyPatchCall = Schema.Struct({
  id: Schema.String,
  type: Schema.Literal("apply_patch_call"),
  call_id: Schema.String,
  operation: ApplyPatchOperation,
  status: Schema.optionalKey(MessageStatus)
})

const CodeInterpreterCall = Schema.Struct({
  id: Schema.String,
  type: Schema.Literal("code_interpreter_call"),
  code: Schema.optionalKey(Schema.NullOr(Schema.String)),
  container_id: Schema.String,
  outputs: Schema.optionalKey(Schema.NullOr(Schema.Array(Schema.Unknown))),
  status: Schema.optionalKey(
    Schema.Literals(["in_progress", "completed", "incomplete", "interpreting", "failed"])
  )
})

const ComputerCall = Schema.Struct({
  id: Schema.String,
  type: Schema.Literal("computer_call"),
  status: Schema.optionalKey(MessageStatus)
})

const FileSearchCall = Schema.Struct({
  id: Schema.String,
  type: Schema.Literal("file_search_call"),
  status: Schema.optionalKey(Schema.String),
  queries: Schema.optionalKey(Schema.Array(Schema.String)),
  results: Schema.optionalKey(Schema.NullOr(Schema.Unknown))
})

const ImageGenerationCall = Schema.Struct({
  id: Schema.String,
  type: Schema.Literal("image_generation_call"),
  result: Schema.optionalKey(Schema.NullOr(Schema.String)),
  status: Schema.optionalKey(Schema.Literals(["in_progress", "completed", "generating", "failed"]))
})

const McpCall = Schema.Struct({
  id: Schema.String,
  type: Schema.Literal("mcp_call"),
  approval_request_id: Schema.optionalKey(Schema.NullOr(Schema.String)),
  name: Schema.String,
  arguments: Schema.Unknown,
  output: Schema.optionalKey(Schema.Unknown),
  error: Schema.optionalKey(Schema.Unknown),
  server_label: Schema.optionalKey(Schema.NullOr(Schema.String))
})

const McpListTools = Schema.Struct({
  id: Schema.String,
  type: Schema.Literal("mcp_list_tools")
})

const McpApprovalRequest = Schema.Struct({
  id: Schema.String,
  type: Schema.Literal("mcp_approval_request"),
  approval_request_id: Schema.optionalKey(Schema.String),
  name: Schema.String,
  arguments: Schema.Unknown
})

const WebSearchCall = Schema.Struct({
  id: Schema.String,
  type: Schema.Literal("web_search_call"),
  action: Schema.optionalKey(Schema.Unknown),
  status: Schema.optionalKey(Schema.String)
})

const OutputItem = Schema.Union([
  ApplyPatchCall,
  CodeInterpreterCall,
  ComputerCall,
  FileSearchCall,
  FunctionCall,
  ImageGenerationCall,
  LocalShellCall,
  McpCall,
  McpListTools,
  McpApprovalRequest,
  OutputMessage,
  ReasoningItem,
  ShellCall,
  WebSearchCall
])

const ResponseError = Schema.Struct({
  code: Schema.String,
  message: Schema.String
})

/**
 * Schema for prompt cache diagnostics comparing two responses.
 *
 * **Details**
 *
 * Cache misses report a reason and token estimates, separate from response usage.
 *
 * @category schemas
 * @since 4.0.0
 */
export const PromptCacheDiagnostics = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("cache_miss"),
    reason: Schema.Literals([
      "model_changed",
      "prompt_cache_key_changed",
      "tools_changed",
      "text_format_changed",
      "reasoning_effort_changed",
      "verbosity_changed",
      "context_compacted",
      "input_changed",
      "service_tier_changed"
    ]),
    cache_missed_tokens: Schema.Int,
    comparison_reusable_tokens: Schema.optionalKey(Schema.Int)
  }),
  Schema.Struct({ type: Schema.Literal("cache_hit") }),
  Schema.Struct({ type: Schema.Literal("comparison_response_not_found") }),
  Schema.Struct({ type: Schema.Literal("unavailable") })
])

/**
 * Prompt cache comparison result reported by the OpenAI Responses API.
 *
 * @category models
 * @since 4.0.0
 */
export type PromptCacheDiagnostics = typeof PromptCacheDiagnostics.Type

/**
 * Schema for an OpenAI Responses API response object.
 *
 * **When to use**
 *
 * Use to decode non-streaming OpenAI Responses API responses.
 *
 * **Details**
 *
 * Response objects include the response id, model, creation time, output items,
 * optional token usage, optional incomplete details, optional service tier, and
 * optional prompt cache diagnostics.
 *
 * @see {@link CreateResponse} for the request schema that creates responses
 * @see {@link ResponseUsage} for token accounting on responses
 * @see {@link ResponseStreamEvent} for streaming response events
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Response = Schema.Struct({
  id: Schema.String,
  object: Schema.optionalKey(Schema.Literal("response")),
  model: Schema.String,
  created_at: Schema.Int,
  output: Schema.Array(OutputItem).pipe(
    Schema.withDecodingDefault(Effect.succeed([]))
  ),
  usage: Schema.optionalKey(Schema.NullOr(ResponseUsage)),
  error: Schema.optionalKey(Schema.NullOr(ResponseError)),
  incomplete_details: Schema.optionalKey(
    Schema.NullOr(
      Schema.Struct({
        reason: Schema.optionalKey(Schema.Literals(["max_output_tokens", "content_filter"]))
      })
    )
  ),
  service_tier: Schema.optionalKey(Schema.String),
  prompt_cache_diagnostics: Schema.optionalKey(PromptCacheDiagnostics)
})

/**
 * OpenAI Responses API response object.
 *
 * **When to use**
 *
 * Use when typing non-streaming OpenAI Responses API responses.
 *
 * **Details**
 *
 * Response objects include metadata, output items, optional token usage, and
 * optional incomplete details.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Response = typeof Response.Type

const ResponseCreatedEvent = Schema.Struct({
  type: Schema.Literal("response.created"),
  response: Response,
  sequence_number: Schema.optionalKey(Schema.Int)
})

const ResponseCompletedEvent = Schema.Struct({
  type: Schema.Literal("response.completed"),
  response: Response,
  sequence_number: Schema.optionalKey(Schema.Int)
})

const ResponseIncompleteEvent = Schema.Struct({
  type: Schema.Literal("response.incomplete"),
  response: Response,
  sequence_number: Schema.optionalKey(Schema.Int)
})

const ResponseFailedEvent = Schema.Struct({
  type: Schema.Literal("response.failed"),
  response: Response,
  sequence_number: Schema.optionalKey(Schema.Int)
})

const ResponseOutputItemAddedEvent = Schema.Struct({
  type: Schema.Literal("response.output_item.added"),
  output_index: Schema.Int,
  sequence_number: Schema.optionalKey(Schema.Int),
  item: OutputItem
})

const ResponseOutputItemDoneEvent = Schema.Struct({
  type: Schema.Literal("response.output_item.done"),
  output_index: Schema.Int,
  sequence_number: Schema.optionalKey(Schema.Int),
  item: OutputItem
})

const ResponseOutputTextDeltaEvent = Schema.Struct({
  type: Schema.Literal("response.output_text.delta"),
  item_id: Schema.String,
  output_index: Schema.Int,
  content_index: Schema.Int,
  delta: Schema.String,
  sequence_number: Schema.optionalKey(Schema.Int),
  logprobs: Schema.optionalKey(Schema.Array(Schema.Unknown))
})

const ResponseOutputTextAnnotationAddedEvent = Schema.Struct({
  type: Schema.Literal("response.output_text.annotation.added"),
  item_id: Schema.String,
  output_index: Schema.Int,
  content_index: Schema.Int,
  annotation_index: Schema.Int,
  sequence_number: Schema.optionalKey(Schema.Int),
  annotation: Annotation
})

const ResponseReasoningSummaryPartAddedEvent = Schema.Struct({
  type: Schema.Literal("response.reasoning_summary_part.added"),
  item_id: Schema.String,
  output_index: Schema.Int,
  summary_index: Schema.Int,
  sequence_number: Schema.optionalKey(Schema.Int),
  part: SummaryTextContent
})

const ResponseReasoningSummaryPartDoneEvent = Schema.Struct({
  type: Schema.Literal("response.reasoning_summary_part.done"),
  item_id: Schema.String,
  output_index: Schema.Int,
  summary_index: Schema.Int,
  sequence_number: Schema.optionalKey(Schema.Int),
  part: SummaryTextContent
})

const ResponseReasoningSummaryTextDeltaEvent = Schema.Struct({
  type: Schema.Literal("response.reasoning_summary_text.delta"),
  item_id: Schema.String,
  output_index: Schema.Int,
  summary_index: Schema.Int,
  delta: Schema.String,
  sequence_number: Schema.optionalKey(Schema.Int)
})

const ResponseFunctionCallArgumentsDeltaEvent = Schema.Struct({
  type: Schema.Literal("response.function_call_arguments.delta"),
  item_id: Schema.String,
  output_index: Schema.Int,
  sequence_number: Schema.optionalKey(Schema.Int),
  delta: Schema.String
})

const ResponseFunctionCallArgumentsDoneEvent = Schema.Struct({
  type: Schema.Literal("response.function_call_arguments.done"),
  item_id: Schema.String,
  output_index: Schema.Int,
  sequence_number: Schema.optionalKey(Schema.Int),
  arguments: Schema.String
})

const ResponseCodeInterpreterCallCodeDeltaEvent = Schema.Struct({
  type: Schema.Literal("response.code_interpreter_call_code.delta"),
  item_id: Schema.String,
  output_index: Schema.Int,
  sequence_number: Schema.optionalKey(Schema.Int),
  delta: Schema.String
})

const ResponseCodeInterpreterCallCodeDoneEvent = Schema.Struct({
  type: Schema.Literal("response.code_interpreter_call_code.done"),
  item_id: Schema.String,
  output_index: Schema.Int,
  sequence_number: Schema.optionalKey(Schema.Int),
  code: Schema.String
})

const ResponseApplyPatchCallOperationDiffDeltaEvent = Schema.Struct({
  type: Schema.Literal("response.apply_patch_call_operation_diff.delta"),
  item_id: Schema.String,
  output_index: Schema.Int,
  sequence_number: Schema.optionalKey(Schema.Int),
  delta: Schema.String
})

const ResponseApplyPatchCallOperationDiffDoneEvent = Schema.Struct({
  type: Schema.Literal("response.apply_patch_call_operation_diff.done"),
  item_id: Schema.String,
  output_index: Schema.Int,
  sequence_number: Schema.optionalKey(Schema.Int),
  delta: Schema.optionalKey(Schema.String)
})

const ResponseImageGenerationCallPartialImageEvent = Schema.Struct({
  type: Schema.Literal("response.image_generation_call.partial_image"),
  item_id: Schema.String,
  output_index: Schema.Int,
  sequence_number: Schema.optionalKey(Schema.Int),
  partial_image_b64: Schema.String
})

const ResponseErrorEvent = Schema.Struct({
  type: Schema.Literal("error"),
  code: Schema.NullOr(Schema.String),
  message: Schema.String,
  param: Schema.NullOr(Schema.String),
  sequence_number: Schema.optionalKey(Schema.Int),
  status: Schema.optionalKey(Schema.Int)
})

// OpenAI can nest stream error details under `error`.
const NestedResponseErrorEvent = Schema.Struct({
  type: Schema.Literal("error"),
  error: Schema.Struct({
    code: Schema.NullOr(Schema.String),
    message: Schema.String,
    param: Schema.NullOr(Schema.String)
  }),
  sequence_number: Schema.optionalKey(Schema.Int),
  status: Schema.optionalKey(Schema.Int)
}).pipe(
  Schema.decodeTo(
    ResponseErrorEvent,
    SchemaTransformation.transform({
      decode: ({ error, ...rest }) => ({ ...rest, ...error }),
      encode: ({ code, message, param, ...rest }) => ({ ...rest, error: { code, message, param } })
    })
  )
)

const knownResponseStreamEventTypes = new Set([
  "response.created",
  "response.completed",
  "response.incomplete",
  "response.failed",
  "response.output_item.added",
  "response.output_item.done",
  "response.output_text.delta",
  "response.output_text.annotation.added",
  "response.reasoning_summary_part.added",
  "response.reasoning_summary_part.done",
  "response.reasoning_summary_text.delta",
  "response.function_call_arguments.delta",
  "response.function_call_arguments.done",
  "response.code_interpreter_call_code.delta",
  "response.code_interpreter_call_code.done",
  "response.apply_patch_call_operation_diff.delta",
  "response.apply_patch_call_operation_diff.done",
  "response.image_generation_call.partial_image",
  "error"
])

/**
 * Fallback event shape for future or provider-specific response stream events.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type UnknownResponseStreamEvent = {
  readonly type: string
  readonly [key: string]: unknown
}

const UnknownResponseStreamEvent = Schema.declare<UnknownResponseStreamEvent>(
  (value): value is UnknownResponseStreamEvent =>
    Predicate.hasProperty(value, "type") &&
    typeof value.type === "string" &&
    !knownResponseStreamEventTypes.has(value.type),
  {
    identifier: "UnknownResponseStreamEvent",
    description: "Fallback for unknown future stream events"
  }
)

/**
 * Schema for server-sent event shapes emitted by OpenAI Responses API streams.
 *
 * **When to use**
 *
 * Use to decode events from a streaming OpenAI Responses API request.
 *
 * **Details**
 *
 * Known event variants include response lifecycle events, output item events,
 * text and reasoning deltas, tool-call deltas, partial image events, and error
 * events.
 *
 * **Gotchas**
 *
 * Future event types decode through the fallback only when their `type` is not
 * one of the known event types. Malformed known events still fail to decode.
 *
 * @see {@link Response} for complete response objects carried by lifecycle events
 * @see {@link UnknownResponseStreamEvent} for the fallback shape for future event types
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ResponseStreamEvent = Schema.Union([
  ResponseCreatedEvent,
  ResponseCompletedEvent,
  ResponseIncompleteEvent,
  ResponseFailedEvent,
  ResponseOutputItemAddedEvent,
  ResponseOutputItemDoneEvent,
  ResponseOutputTextDeltaEvent,
  ResponseOutputTextAnnotationAddedEvent,
  ResponseReasoningSummaryPartAddedEvent,
  ResponseReasoningSummaryPartDoneEvent,
  ResponseReasoningSummaryTextDeltaEvent,
  ResponseFunctionCallArgumentsDeltaEvent,
  ResponseFunctionCallArgumentsDoneEvent,
  ResponseCodeInterpreterCallCodeDeltaEvent,
  ResponseCodeInterpreterCallCodeDoneEvent,
  ResponseApplyPatchCallOperationDiffDeltaEvent,
  ResponseApplyPatchCallOperationDiffDoneEvent,
  ResponseImageGenerationCallPartialImageEvent,
  ResponseErrorEvent,
  NestedResponseErrorEvent,
  UnknownResponseStreamEvent
])

/**
 * Server-sent event shape emitted by OpenAI Responses API streams.
 *
 * **When to use**
 *
 * Use when typing events from a streaming OpenAI Responses API request.
 *
 * **Details**
 *
 * Includes known response stream events plus a fallback shape for unknown future
 * event types.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ResponseStreamEvent = typeof ResponseStreamEvent.Type

/**
 * Schema for one embedding item returned by the OpenAI embeddings API.
 *
 * **When to use**
 *
 * Use when validating individual embedding entries at the OpenAI client boundary
 * before assuming the embedding payload is a numeric vector.
 *
 * **Details**
 *
 * An embedding item contains its `index`, optional `object` marker, and an
 * `embedding` represented either as a numeric vector or as a string.
 *
 * **Gotchas**
 *
 * Callers that need numeric vectors must account for string embeddings, such as
 * base64-encoded embeddings returned for string encoding formats.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Embedding = Schema.Struct({
  embedding: Schema.Union([
    Schema.Array(Schema.Finite),
    Schema.String
  ]),
  index: Schema.Int,
  object: Schema.optionalKey(Schema.String)
})

/**
 * One embedding item returned by the OpenAI embeddings API.
 *
 * **Details**
 *
 * Contains the item index and embedding payload. The embedding payload may be a
 * numeric vector or a string.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Embedding = typeof Embedding.Type

/**
 * Schema for the request payload sent to the OpenAI embeddings endpoint.
 *
 * **When to use**
 *
 * Use when validating or encoding embeddings requests before sending them to
 * OpenAI, while leaving model-specific limits to the provider.
 *
 * **Details**
 *
 * Requires `input` and `model`. `input` may be a string, an array of strings,
 * a token array, or an array of token arrays. Optional fields configure the
 * embedding encoding format, requested dimensions, and user identifier.
 *
 * **Gotchas**
 *
 * This schema validates the transport shape, but OpenAI still enforces
 * provider-side constraints such as non-empty input, integer token ids, input
 * size limits, positive dimensions, and model-specific dimension support.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const CreateEmbeddingRequest = Schema.Struct({
  input: Schema.Union([
    Schema.String,
    Schema.Array(Schema.String),
    Schema.Array(Schema.Int),
    Schema.Array(Schema.Array(Schema.Int))
  ]),
  model: Schema.String,
  encoding_format: Schema.optionalKey(Schema.Literals(["float", "base64"])),
  dimensions: Schema.optionalKey(Schema.Int),
  user: Schema.optionalKey(Schema.String)
})

/**
 * Request payload sent to the OpenAI embeddings endpoint.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type CreateEmbeddingRequest = typeof CreateEmbeddingRequest.Type

/**
 * Schema for a successful response payload returned by the OpenAI embeddings endpoint.
 *
 * **When to use**
 *
 * Use when you need to validate embeddings responses at an OpenAI client
 * boundary before trusting item shapes, especially when numeric and string
 * embeddings are both allowed.
 *
 * **Details**
 *
 * The response contains an array of `Embedding` items, the model name, an
 * optional `object: "list"` marker, and optional token usage counts for prompt
 * and total tokens.
 *
 * **Gotchas**
 *
 * Each `Embedding` may contain either a numeric vector or a string embedding.
 * Callers that require numeric vectors must account for string embeddings.
 *
 * @see {@link CreateEmbeddingRequest} for the request schema sent to the embeddings endpoint
 * @see {@link Embedding} for individual embedding items in the response
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const CreateEmbeddingResponse = Schema.Struct({
  data: Schema.Array(Embedding),
  model: Schema.String,
  object: Schema.optionalKey(Schema.Literal("list")),
  usage: Schema.optionalKey(
    Schema.Struct({
      prompt_tokens: Schema.Int,
      total_tokens: Schema.Int
    })
  )
})

/**
 * Successful response payload returned by the OpenAI embeddings endpoint.
 *
 * **When to use**
 *
 * Use when typing successful OpenAI embeddings responses.
 *
 * **Details**
 *
 * Contains embedding items, the model name, optional list marker, and optional
 * token usage counts.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type CreateEmbeddingResponse = typeof CreateEmbeddingResponse.Type
