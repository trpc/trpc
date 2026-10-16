/**
 * Defines prompts sent to AI language models.
 *
 * A prompt is an ordered list of messages. Messages can use roles such as
 * system, user, assistant, and tool, and their content can be split into typed
 * parts such as text, files, reasoning, tool calls, tool results, and approval
 * messages. This module helps build prompts, combine them, and convert raw
 * input or response parts into the shared prompt shape.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Arr from "../Array.ts"
import * as Effect from "../Effect.ts"
import * as Base64 from "../encoding/Base64.ts"
import { dual } from "../Function.ts"
import { type Pipeable, pipeArguments } from "../Pipeable.ts"
import * as Predicate from "../Predicate.ts"
import * as Schema from "../Schema.ts"
import * as SchemaIssue from "../SchemaIssue.ts"
import * as SchemaParser from "../SchemaParser.ts"
import * as SchemaTransformation from "../SchemaTransformation.ts"
import type * as Response from "./Response.ts"

// =============================================================================
// Options
// =============================================================================

/**
 * Schema for provider-specific options that can be attached to content parts
 * and messages.
 *
 * **Details**
 *
 * Provider-specific options are keyed by provider-specific names, and each
 * value is JSON or `null`.
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export const ProviderOptions: Schema.$Record<
  Schema.String,
  Schema.NullOr<Schema.Codec<Schema.Json>>
> = Schema.Record(Schema.String, Schema.NullOr(Schema.Json))

/**
 * Type of provider-specific options that can be attached to prompt messages
 * and content parts.
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export type ProviderOptions = typeof ProviderOptions.Type

// =============================================================================
// Base Part
// =============================================================================

const PartTypeId = "~effect/ai/Prompt/Part" as const

/**
 * Type guard to check if a value is a Part.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isPart = (u: unknown): u is Part => Predicate.hasProperty(u, PartTypeId)

/**
 * Union type representing all possible content parts within messages.
 *
 * **Details**
 *
 * Parts are the building blocks of message content, supporting text, files,
 * reasoning, tool calls, tool results, tool approval responses, and tool
 * approval requests.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Part =
  | TextPart
  | ReasoningPart
  | FilePart
  | ToolCallPart
  | ToolResultPart
  | ToolApprovalResponsePart
  | ToolApprovalRequestPart

/**
 * Encoded representation of a Part.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type PartEncoded =
  | TextPartEncoded
  | ReasoningPartEncoded
  | FilePartEncoded
  | ToolCallPartEncoded
  | ToolResultPartEncoded
  | ToolApprovalResponsePartEncoded
  | ToolApprovalRequestPartEncoded

/**
 * Base interface for all content parts.
 *
 * **Details**
 *
 * It provides the common structure shared by all content parts, including the
 * part type and provider options.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface BasePart<Type extends string, Options extends ProviderOptions> {
  readonly [PartTypeId]: typeof PartTypeId
  /**
   * The type of this content part.
   */
  readonly type: Type
  /**
   * Provider-specific options for this part.
   */
  readonly options: Options
}

/**
 * Base interface for encoded content parts.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface BasePartEncoded<Type extends string, Options extends ProviderOptions> {
  /**
   * The type of this content part.
   */
  readonly type: Type
  /**
   * Provider-specific options for this part.
   */
  readonly options?: Options | undefined
}

const BasePart = Schema.Struct({
  [PartTypeId]: Schema.Literal(PartTypeId).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed(PartTypeId), { encodingStrategy: "omit" })
  ),
  options: ProviderOptions.pipe(Schema.withDecodingDefault(Effect.succeed({})))
})

/**
 * Creates a new content part of the specified type.
 *
 * **Example** (Creating content parts)
 *
 * ```ts import.meta.vitest
 * import { Prompt } from "effect/ai"
 *
 * const textPart = Prompt.makePart("text", {
 *   text: "Hello, world!"
 * })
 *
 * const filePart = Prompt.makePart("file", {
 *   mediaType: "image/png",
 *   fileName: "screenshot.png",
 *   data: new Uint8Array([1, 2, 3])
 * })
 *
 * const result = [textPart.type, filePart.type] // => ["text", "file"]
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makePart = <const Type extends Part["type"]>(
  /**
   * The type of part to create.
   */
  type: Type,
  /**
   * Parameters specific to the part type being created.
   */
  params: Omit<Extract<Part, { type: Type }>, typeof PartTypeId | "type" | "options"> & {
    /**
     * Optional provider-specific options for this part.
     */
    readonly options?: Extract<Part, { type: Type }>["options"] | undefined
  }
): Extract<Part, { type: Type }> => (({
  ...params,
  [PartTypeId]: PartTypeId,
  type,
  options: params.options ?? {}
}) as any)

/**
 * A utility type for specifying the parameters required to construct a
 * specific part of a prompt.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type PartConstructorParams<P extends Part> = Omit<P, typeof PartTypeId | "type" | "options"> & {
  /**
   * Optional provider-specific options for this part.
   */
  readonly options?: Part["options"] | undefined
}

// =============================================================================
// Text Part
// =============================================================================

/**
 * Content part representing plain text.
 *
 * **Details**
 *
 * Text parts are the basic content type used for textual information in
 * messages.
 *
 * **Example** (Creating text parts)
 *
 * ```ts import.meta.vitest
 * import { Prompt } from "effect/ai"
 *
 * const textPart: Prompt.TextPart = Prompt.makePart("text", {
 *   text: "Hello, how can I help you today?"
 * })
 * textPart.text // => "Hello, how can I help you today?"
 * ```
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface TextPart extends BasePart<"text", TextPartOptions> {
  /**
   * The text content.
   */
  readonly text: string
}

/**
 * Encoded representation of text parts for serialization.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface TextPartEncoded extends BasePartEncoded<"text", TextPartOptions> {
  /**
   * The text content.
   */
  readonly text: string
}

/**
 * Represents provider-specific options that can be associated with a
 * `TextPart` through module augmentation.
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export interface TextPartOptions extends ProviderOptions {}

/**
 * Schema for validation and encoding of text parts.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const TextPart: Schema.Struct<
  {
    readonly type: Schema.Literal<"text">
    readonly text: Schema.String
    readonly "~effect/ai/Prompt/Part": Schema.withDecodingDefaultKey<Schema.Literal<"~effect/ai/Prompt/Part">>
    readonly options: Schema.withDecodingDefault<
      Schema.$Record<
        Schema.String,
        Schema.NullOr<Schema.Codec<Schema.Json>>
      >
    >
  }
> = Schema.Struct({
  ...BasePart.fields,
  type: Schema.Literal("text"),
  text: Schema.String
}).annotate({ identifier: "TextPart" })

/**
 * Constructs a new text part.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const textPart = (params: PartConstructorParams<TextPart>): TextPart => makePart("text", params as any)

// =============================================================================
// Reasoning Part
// =============================================================================

/**
 * Content part carrying reasoning text in an assistant message, such as a
 * provider-supplied reasoning summary or explanation.
 *
 * **Example** (Creating reasoning parts)
 *
 * ```ts import.meta.vitest
 * import { Prompt } from "effect/ai"
 *
 * const reasoningPart: Prompt.ReasoningPart = Prompt.makePart("reasoning", {
 *   text:
 *     "Summary: the response compares the requested options by price and availability."
 * })
 * reasoningPart.type // => "reasoning"
 * ```
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ReasoningPart extends BasePart<"reasoning", ReasoningPartOptions> {
  /**
   * The reasoning or thought process text.
   */
  readonly text: string
}

/**
 * Encoded representation of reasoning parts for serialization.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ReasoningPartEncoded extends BasePartEncoded<"reasoning", ReasoningPartOptions> {
  /**
   * The reasoning or thought process text.
   */
  readonly text: string
}

/**
 * Represents provider-specific options that can be associated with a
 * `ReasoningPart` through module augmentation.
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export interface ReasoningPartOptions extends ProviderOptions {}

/**
 * Schema for validation and encoding of reasoning parts.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ReasoningPart: Schema.Struct<{
  readonly type: Schema.Literal<"reasoning">
  readonly text: Schema.String
  readonly "~effect/ai/Prompt/Part": Schema.withDecodingDefaultKey<Schema.Literal<"~effect/ai/Prompt/Part">>
  readonly options: Schema.withDecodingDefault<
    Schema.$Record<
      Schema.String,
      Schema.NullOr<Schema.Codec<Schema.Json>>
    >
  >
}> = Schema.Struct({
  ...BasePart.fields,
  type: Schema.Literal("reasoning"),
  text: Schema.String
}).annotate({ identifier: "ReasoningPart" })

/**
 * Constructs a new reasoning part.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const reasoningPart = (params: PartConstructorParams<ReasoningPart>): ReasoningPart =>
  makePart("reasoning", params as any)

// =============================================================================
// File Part
// =============================================================================

/**
 * Content part representing a file attachment.
 *
 * **Details**
 *
 * Files can be provided as base64 data strings, byte arrays, or URLs, and can
 * represent images, documents, or other binary data.
 *
 * **Example** (Creating file parts)
 *
 * ```ts import.meta.vitest
 * import { Prompt } from "effect/ai"
 *
 * const imagePart: Prompt.FilePart = Prompt.makePart("file", {
 *   mediaType: "image/jpeg",
 *   fileName: "photo.jpg",
 *   data: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ..."
 * })
 *
 * const documentPart: Prompt.FilePart = Prompt.makePart("file", {
 *   mediaType: "application/pdf",
 *   fileName: "report.pdf",
 *   data: new Uint8Array([1, 2, 3])
 * })
 *
 * const result = [imagePart.mediaType, documentPart.fileName] // => ["image/jpeg", "report.pdf"]
 * ```
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface FilePart extends BasePart<"file", FilePartOptions> {
  /**
   * MIME type of the file (e.g., "image/jpeg", "application/pdf").
   */
  readonly mediaType: string
  /**
   * Optional filename for the file.
   */
  readonly fileName?: string | undefined
  /**
   * File data as base64 string of data, a byte array, or a URL.
   */
  readonly data: string | Uint8Array | URL
}

/**
 * Encoded representation of file parts for serialization.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface FilePartEncoded extends BasePartEncoded<"file", FilePartOptions> {
  /**
   * MIME type of the file (e.g., "image/jpeg", "application/pdf").
   */
  readonly mediaType: string
  /**
   * Optional filename for the file.
   */
  readonly fileName?: string | undefined
  /**
   * File data as base64 string of data, a byte array, or a URL.
   */
  readonly data: string | Uint8Array | URL
}

/**
 * Represents provider-specific options that can be associated with a
 * `FilePart` through module augmentation.
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export interface FilePartOptions extends ProviderOptions {}

/**
 * Schema for validation and encoding of file parts.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const FilePart: Schema.Struct<{
  readonly type: Schema.Literal<"file">
  readonly mediaType: Schema.String
  readonly fileName: Schema.optional<Schema.String>
  readonly data: Schema.Union<readonly [Schema.String, Schema.Uint8Array, Schema.URL]>
  readonly "~effect/ai/Prompt/Part": Schema.withDecodingDefaultKey<Schema.Literal<"~effect/ai/Prompt/Part">>
  readonly options: Schema.withDecodingDefault<
    Schema.$Record<
      Schema.String,
      Schema.NullOr<Schema.Codec<Schema.Json>>
    >
  >
}> = Schema.Struct({
  ...BasePart.fields,
  type: Schema.Literal("file"),
  mediaType: Schema.String,
  fileName: Schema.optional(Schema.String),
  data: Schema.Union([Schema.String, Schema.Uint8Array, Schema.URL])
}).annotate({ identifier: "FilePart" })

/**
 * Constructs a `FilePart` for prompt file attachments.
 *
 * **When to use**
 *
 * Use to create the file-attachment part of a prompt from typed file part
 * parameters.
 *
 * @see {@link makePart} for the generic part constructor
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const filePart = (params: PartConstructorParams<FilePart>): FilePart => makePart("file", params as any)

// =============================================================================
// Tool Call Part
// =============================================================================

/**
 * Content part representing a tool call request.
 *
 * **Example** (Creating tool call parts)
 *
 * ```ts import.meta.vitest
 * import { Prompt } from "effect/ai"
 *
 * const toolCallPart: Prompt.ToolCallPart = Prompt.makePart("tool-call", {
 *   id: "call_123",
 *   name: "get_weather",
 *   params: { city: "San Francisco", units: "celsius" },
 *   providerExecuted: false
 * })
 * toolCallPart.name // => "get_weather"
 * ```
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ToolCallPart extends BasePart<"tool-call", ToolCallPartOptions> {
  /**
   * Unique identifier for this tool call.
   */
  readonly id: string
  /**
   * Name of the tool to invoke.
   */
  readonly name: string
  /**
   * Parameters to pass to the tool.
   */
  readonly params: unknown
  /**
   * Whether the tool was executed by the provider (true) or framework (false).
   */
  readonly providerExecuted: boolean
}

/**
 * Encoded representation of tool call parts for serialization.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ToolCallPartEncoded extends BasePartEncoded<"tool-call", ToolCallPartOptions> {
  /**
   * Unique identifier for this tool call.
   */
  readonly id: string
  /**
   * Name of the tool to invoke.
   */
  readonly name: string
  /**
   * Parameters to pass to the tool.
   */
  readonly params: unknown
  /**
   * Whether the tool was executed by the provider (true) or framework (false).
   */
  readonly providerExecuted?: boolean | undefined
}

/**
 * Represents provider-specific options that can be associated with a
 * `ToolCallPart` through module augmentation.
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export interface ToolCallPartOptions extends ProviderOptions {}

/**
 * Schema for validation and encoding of tool call parts.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ToolCallPart: Schema.Struct<{
  readonly type: Schema.Literal<"tool-call">
  readonly id: Schema.String
  readonly name: Schema.String
  readonly params: Schema.Unknown
  readonly providerExecuted: Schema.withDecodingDefault<Schema.Boolean>
  readonly "~effect/ai/Prompt/Part": Schema.withDecodingDefaultKey<Schema.Literal<"~effect/ai/Prompt/Part">>
  readonly options: Schema.withDecodingDefault<
    Schema.$Record<
      Schema.String,
      Schema.NullOr<Schema.Codec<Schema.Json>>
    >
  >
}> = Schema.Struct({
  ...BasePart.fields,
  type: Schema.Literal("tool-call"),
  id: Schema.String,
  name: Schema.String,
  params: Schema.Unknown,
  providerExecuted: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false)))
}).annotate({ identifier: "ToolCallPart" })

/**
 * Constructs a new tool call part.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const toolCallPart = (params: PartConstructorParams<ToolCallPart>): ToolCallPart =>
  makePart("tool-call", params as any)

// =============================================================================
// Tool Result Part
// =============================================================================

/**
 * Content part representing the result of a tool call.
 *
 * **Example** (Creating tool result parts)
 *
 * ```ts import.meta.vitest
 * import { Prompt } from "effect/ai"
 *
 * const toolResultPart: Prompt.ToolResultPart = Prompt.makePart("tool-result", {
 *   id: "call_123",
 *   name: "get_weather",
 *   isFailure: false,
 *   result: {
 *     temperature: 22,
 *     condition: "sunny",
 *     humidity: 65
 *   },
 *   providerExecuted: false
 * })
 * const result = [toolResultPart.name, toolResultPart.isFailure] // => ["get_weather", false]
 * ```
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ToolResultPart extends BasePart<"tool-result", ToolResultPartOptions> {
  /**
   * Unique identifier matching the original tool call.
   */
  readonly id: string
  /**
   * Name of the tool that was executed.
   */
  readonly name: string
  /**
   * Whether or not the result of executing the tool call handler was an error.
   */
  readonly isFailure: boolean
  /**
   * The result returned by the tool execution.
   */
  readonly result: unknown
  /**
   * Whether the tool was executed by the provider (true) or framework (false).
   */
  readonly providerExecuted: boolean
}

/**
 * Encoded representation of tool result parts for serialization.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ToolResultPartEncoded extends BasePartEncoded<"tool-result", ToolResultPartOptions> {
  /**
   * Unique identifier matching the original tool call.
   */
  readonly id: string
  /**
   * Name of the tool that was executed.
   */
  readonly name: string
  /**
   * Whether or not the result of executing the tool call handler was an error.
   */
  readonly isFailure: boolean
  /**
   * The result returned by the tool execution.
   */
  readonly result: unknown
  /**
   * Whether the tool was executed by the provider (true) or framework (false).
   */
  readonly providerExecuted?: boolean | undefined
}

/**
 * Represents provider-specific options that can be associated with a
 * `ToolResultPart` through module augmentation.
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export interface ToolResultPartOptions extends ProviderOptions {}

/**
 * Schema for validation and encoding of tool result parts.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ToolResultPart: Schema.Struct<{
  readonly type: Schema.Literal<"tool-result">
  readonly id: Schema.String
  readonly name: Schema.String
  readonly isFailure: Schema.Boolean
  readonly result: Schema.Unknown
  readonly providerExecuted: Schema.withDecodingDefault<Schema.Boolean>
  readonly "~effect/ai/Prompt/Part": Schema.withDecodingDefaultKey<Schema.Literal<"~effect/ai/Prompt/Part">>
  readonly options: Schema.withDecodingDefault<
    Schema.$Record<
      Schema.String,
      Schema.NullOr<Schema.Codec<Schema.Json>>
    >
  >
}> = Schema.Struct({
  ...BasePart.fields,
  type: Schema.Literal("tool-result"),
  id: Schema.String,
  name: Schema.String,
  isFailure: Schema.Boolean,
  result: Schema.Unknown,
  providerExecuted: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false)))
}).annotate({ identifier: "ToolResultPart" })

/**
 * Constructs a new tool result part.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const toolResultPart = (params: PartConstructorParams<ToolResultPart>): ToolResultPart =>
  makePart("tool-result", params as any)

// =============================================================================
// Tool Approval Response Part
// =============================================================================

/**
 * Content part representing a user's response to a tool approval request.
 *
 * **When to use**
 *
 * Use when tool messages must approve or deny tool execution for tools with the
 * `needsApproval` property set.
 *
 * **Example** (Creating tool approval responses)
 *
 * ```ts import.meta.vitest
 * import { Prompt } from "effect/ai"
 *
 * const approvalResponse: Prompt.ToolApprovalResponsePart = Prompt.makePart(
 *   "tool-approval-response",
 *   {
 *     approvalId: "approval_123",
 *     approved: true
 *   }
 * )
 *
 * const denialResponse: Prompt.ToolApprovalResponsePart = Prompt.makePart(
 *   "tool-approval-response",
 *   {
 *     approvalId: "approval_456",
 *     approved: false,
 *     reason: "Operation not allowed"
 *   }
 * )
 *
 * const result = [approvalResponse.approved, denialResponse.approved] // => [true, false]
 * ```
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ToolApprovalResponsePart extends BasePart<"tool-approval-response", ToolApprovalResponsePartOptions> {
  /**
   * References the original approval request.
   */
  readonly approvalId: string
  /**
   * User's decision to approve or deny the tool execution.
   */
  readonly approved: boolean
  /**
   * Optional justification for the decision.
   */
  readonly reason?: string | undefined
}

/**
 * Encoded representation of tool approval response parts for serialization.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ToolApprovalResponsePartEncoded
  extends BasePartEncoded<"tool-approval-response", ToolApprovalResponsePartOptions>
{
  /**
   * References the original approval request.
   */
  readonly approvalId: string
  /**
   * User's decision to approve or deny the tool execution.
   */
  readonly approved: boolean
  /**
   * Optional justification for the decision.
   */
  readonly reason?: string | undefined
}

/**
 * Represents provider-specific options that can be associated with a
 * `ToolApprovalResponsePart` through module augmentation.
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export interface ToolApprovalResponsePartOptions extends ProviderOptions {}

/**
 * Schema for validation and encoding of tool approval response parts.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ToolApprovalResponsePart: Schema.Struct<{
  readonly type: Schema.Literal<"tool-approval-response">
  readonly approvalId: Schema.String
  readonly approved: Schema.Boolean
  readonly reason: Schema.optional<Schema.String>
  readonly "~effect/ai/Prompt/Part": Schema.withDecodingDefaultKey<Schema.Literal<"~effect/ai/Prompt/Part">>
  readonly options: Schema.withDecodingDefault<
    Schema.$Record<
      Schema.String,
      Schema.NullOr<Schema.Codec<Schema.Json>>
    >
  >
}> = Schema.Struct({
  ...BasePart.fields,
  type: Schema.Literal("tool-approval-response"),
  approvalId: Schema.String,
  approved: Schema.Boolean,
  reason: Schema.optional(Schema.String)
}).annotate({ identifier: "ToolApprovalResponsePart" })

/**
 * Constructs a new tool approval response part.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const toolApprovalResponsePart = (
  params: PartConstructorParams<ToolApprovalResponsePart>
): ToolApprovalResponsePart => makePart("tool-approval-response", params as any)

// =============================================================================
// Tool Approval Request Part
// =============================================================================

/**
 * Content part representing a tool approval request from the framework.
 *
 * **Details**
 *
 * Tool approval request parts are stored in assistant messages when a tool
 * requires user approval before execution. The user responds with a
 * `ToolApprovalResponsePart` in a tool message.
 *
 * **Example** (Creating tool approval requests)
 *
 * ```ts import.meta.vitest
 * import { Prompt } from "effect/ai"
 *
 * const approvalRequest: Prompt.ToolApprovalRequestPart = Prompt.makePart(
 *   "tool-approval-request",
 *   {
 *     approvalId: "approval_123",
 *     toolCallId: "call_456"
 *   }
 * )
 * const result = [approvalRequest.approvalId, approvalRequest.toolCallId] // => ["approval_123", "call_456"]
 * ```
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ToolApprovalRequestPart extends BasePart<"tool-approval-request", ToolApprovalRequestPartOptions> {
  /**
   * Unique identifier for this approval flow.
   */
  readonly approvalId: string
  /**
   * The tool call ID requiring approval.
   */
  readonly toolCallId: string
}

/**
 * Encoded representation of tool approval request parts for serialization.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ToolApprovalRequestPartEncoded
  extends BasePartEncoded<"tool-approval-request", ToolApprovalRequestPartOptions>
{
  /**
   * Unique identifier for this approval flow.
   */
  readonly approvalId: string
  /**
   * The tool call ID requiring approval.
   */
  readonly toolCallId: string
}

/**
 * Represents provider-specific options that can be associated with a
 * `ToolApprovalRequestPart` through module augmentation.
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export interface ToolApprovalRequestPartOptions extends ProviderOptions {}

/**
 * Schema for validation and encoding of tool approval request parts.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ToolApprovalRequestPart: Schema.Struct<{
  readonly type: Schema.Literal<"tool-approval-request">
  readonly approvalId: Schema.String
  readonly toolCallId: Schema.String
  readonly "~effect/ai/Prompt/Part": Schema.withDecodingDefaultKey<Schema.Literal<"~effect/ai/Prompt/Part">>
  readonly options: Schema.withDecodingDefault<
    Schema.$Record<
      Schema.String,
      Schema.NullOr<Schema.Codec<Schema.Json>>
    >
  >
}> = Schema.Struct({
  ...BasePart.fields,
  type: Schema.Literal("tool-approval-request"),
  approvalId: Schema.String,
  toolCallId: Schema.String
}).annotate({ identifier: "ToolApprovalRequestPart" })

/**
 * Constructs a new tool approval request part.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const toolApprovalRequestPart = (
  params: PartConstructorParams<ToolApprovalRequestPart>
): ToolApprovalRequestPart => makePart("tool-approval-request", params as any)

/**
 * Schema for validation and encoding of content parts.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Part: Schema.Union<
  readonly [
    typeof TextPart,
    typeof ReasoningPart,
    typeof FilePart,
    typeof ToolCallPart,
    typeof ToolResultPart,
    typeof ToolApprovalResponsePart,
    typeof ToolApprovalRequestPart
  ]
> = Schema.Union([
  TextPart,
  ReasoningPart,
  FilePart,
  ToolCallPart,
  ToolResultPart,
  ToolApprovalResponsePart,
  ToolApprovalRequestPart
])

// =============================================================================
// Base Message
// =============================================================================

const MessageTypeId = "~effect/ai/Prompt/Message" as const

/**
 * Type guard to check if a value is a Message.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isMessage = (u: unknown): u is Message => Predicate.hasProperty(u, MessageTypeId)

/**
 * Base interface for all message types.
 *
 * **Details**
 *
 * It provides the common structure shared by all messages, including the role
 * and provider options.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface BaseMessage<Role extends string, Options extends ProviderOptions> {
  readonly [MessageTypeId]: typeof MessageTypeId
  /**
   * The role of the message participant.
   */
  readonly role: Role
  /**
   * Provider-specific options for this message.
   */
  readonly options: Options
}

/**
 * Base interface for encoded message types.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface BaseMessageEncoded<Role extends string, Options extends ProviderOptions> {
  /**
   * The role of the message participant.
   */
  readonly role: Role
  /**
   * Provider-specific options for this message.
   */
  readonly options?: Options | undefined
}

const BaseMessage = Schema.Struct({
  [MessageTypeId]: Schema.Literal(MessageTypeId).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed(MessageTypeId), { encodingStrategy: "omit" })
  ),
  options: ProviderOptions.pipe(Schema.withDecodingDefault(Effect.succeed({})))
})

/**
 * Creates a new message with the specified role.
 *
 * **Example** (Creating messages)
 *
 * ```ts import.meta.vitest
 * import { Prompt } from "effect/ai"
 *
 * const textPart = Prompt.makePart("text", {
 *   text: "Hello, world!"
 * })
 *
 * const userMessage = Prompt.makeMessage("user", {
 *   content: [textPart]
 * })
 * const result = [userMessage.role, userMessage.content.length] // => ["user", 1]
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeMessage = <const Role extends Message["role"]>(
  role: Role,
  params: Omit<Extract<Message, { role: Role }>, typeof MessageTypeId | "role" | "options"> & {
    readonly options?: Extract<Message, { role: Role }>["options"] | undefined
  }
): Extract<Message, { role: Role }> => (({
  ...params,
  [MessageTypeId]: MessageTypeId,
  role,
  options: params.options ?? {}
}) as any)

/**
 * A utility type for specifying the parameters required to construct a
 * specific message for a prompt.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type MessageConstructorParams<M extends Message> = Omit<M, typeof MessageTypeId | "role" | "options"> & {
  /**
   * Optional provider-specific options for this message.
   */
  readonly options?: M["options"] | undefined
}

/**
 * Schema that decodes a string into content containing a single `TextPart` and,
 * when encoding, emits the `text` value of the first part.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ContentFromString: Schema.decodeTo<
  Schema.NonEmptyArray<
    Schema.toType<
      Schema.Struct<{
        readonly type: Schema.Literal<"text">
        readonly text: Schema.String
        readonly "~effect/ai/Prompt/Part": Schema.withDecodingDefaultKey<Schema.Literal<"~effect/ai/Prompt/Part">>
        readonly options: Schema.withDecodingDefault<
          Schema.$Record<
            Schema.String,
            Schema.NullOr<Schema.Codec<Schema.Json>>
          >
        >
      }>
    >
  >,
  Schema.String
> = Schema.String.pipe(
  Schema.decodeTo(
    Schema.NonEmptyArray(Schema.toType(TextPart)),
    SchemaTransformation.transform({
      decode: (text) => Arr.of(makePart("text", { text })) as Arr.NonEmptyReadonlyArray<TextPart>,
      encode: (content) => content[0].text
    })
  )
)

// =============================================================================
// System Message
// =============================================================================

/**
 * Message representing system instructions or context.
 *
 * **Example** (Creating system messages)
 *
 * ```ts import.meta.vitest
 * import { Prompt } from "effect/ai"
 *
 * const systemMessage: Prompt.SystemMessage = Prompt.makeMessage("system", {
 *   content: "You are a helpful assistant specialized in mathematics. " +
 *     "Always show your work step by step."
 * })
 * systemMessage.role // => "system"
 * ```
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface SystemMessage extends BaseMessage<"system", SystemMessageOptions> {
  /**
   * The system instruction or context as plain text.
   */
  readonly content: string
}

/**
 * Encoded representation of system messages for serialization.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface SystemMessageEncoded extends BaseMessageEncoded<"system", SystemMessageOptions> {
  /**
   * The system instruction or context as plain text.
   */
  readonly content: string
}

/**
 * Represents provider-specific options that can be associated with a
 * `SystemMessage` through module augmentation.
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export interface SystemMessageOptions extends ProviderOptions {}

/**
 * Schema for validation and encoding of system messages.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const SystemMessage: Schema.Struct<{
  readonly role: Schema.Literal<"system">
  readonly content: Schema.String
  readonly "~effect/ai/Prompt/Message": Schema.withDecodingDefaultKey<Schema.Literal<"~effect/ai/Prompt/Message">>
  readonly options: Schema.withDecodingDefault<
    Schema.$Record<
      Schema.String,
      Schema.NullOr<Schema.Codec<Schema.Json>>
    >
  >
}> = Schema.Struct({
  ...BaseMessage.fields,
  role: Schema.Literal("system"),
  content: Schema.String
}).annotate({ identifier: "SystemMessage" })

/**
 * Constructs a new system message.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const systemMessage = (params: MessageConstructorParams<SystemMessage>): SystemMessage =>
  makeMessage("system", params)

// =============================================================================
// User Message
// =============================================================================

/**
 * Message representing user input or questions.
 *
 * **Example** (Creating user messages)
 *
 * ```ts import.meta.vitest
 * import { Prompt } from "effect/ai"
 *
 * const textUserMessage: Prompt.UserMessage = Prompt.makeMessage("user", {
 *   content: [
 *     Prompt.makePart("text", {
 *       text: "Can you analyze this image for me?"
 *     })
 *   ]
 * })
 *
 * const multimodalUserMessage: Prompt.UserMessage = Prompt.makeMessage("user", {
 *   content: [
 *     Prompt.makePart("text", {
 *       text: "What do you see in this image?"
 *     }),
 *     Prompt.makePart("file", {
 *       mediaType: "image/jpeg",
 *       fileName: "vacation.jpg",
 *       data: "data:image/jpeg;base64,..."
 *     })
 *   ]
 * })
 *
 * const result = [textUserMessage.content.length, multimodalUserMessage.content.length] // => [1, 2]
 * ```
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface UserMessage extends BaseMessage<"user", UserMessageOptions> {
  /**
   * Array of content parts that make up the user's message.
   */
  readonly content: ReadonlyArray<UserMessagePart>
}

/**
 * Union type of content parts allowed in user messages.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type UserMessagePart = TextPart | FilePart

/**
 * Encoded representation of user messages for serialization.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface UserMessageEncoded extends BaseMessageEncoded<"user", UserMessageOptions> {
  /**
   * Array of content parts that make up the user's message.
   */
  readonly content: string | ReadonlyArray<UserMessagePartEncoded>
}

/**
 * Union type of encoded content parts for user messages.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type UserMessagePartEncoded = TextPartEncoded | FilePartEncoded

/**
 * Schema for validation and encoding of user message content parts.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const UserMessagePart: Schema.Union<readonly [typeof TextPart, typeof FilePart]> = Schema.Union([
  TextPart,
  FilePart
])

/**
 * Represents provider-specific options that can be associated with a
 * `UserMessage` through module augmentation.
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export interface UserMessageOptions extends ProviderOptions {}

/**
 * Schema for validation and encoding of user messages.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const UserMessage: Schema.Struct<{
  readonly role: Schema.Literal<"user">
  readonly content: Schema.Union<
    readonly [
      Schema.decodeTo<
        Schema.NonEmptyArray<
          Schema.toType<
            Schema.Struct<{
              readonly type: Schema.Literal<"text">
              readonly text: Schema.String
              readonly "~effect/ai/Prompt/Part": Schema.withDecodingDefaultKey<Schema.Literal<"~effect/ai/Prompt/Part">>
              readonly options: Schema.withDecodingDefault<
                Schema.$Record<
                  Schema.String,
                  Schema.NullOr<Schema.Codec<Schema.Json>>
                >
              >
            }>
          >
        >,
        Schema.String,
        never,
        never
      >,
      Schema.$Array<
        Schema.Union<
          readonly [
            Schema.Struct<{
              readonly type: Schema.Literal<"text">
              readonly text: Schema.String
              readonly "~effect/ai/Prompt/Part": Schema.withDecodingDefaultKey<Schema.Literal<"~effect/ai/Prompt/Part">>
              readonly options: Schema.withDecodingDefault<
                Schema.$Record<
                  Schema.String,
                  Schema.NullOr<Schema.Codec<Schema.Json>>
                >
              >
            }>,
            Schema.Struct<{
              readonly type: Schema.Literal<"file">
              readonly mediaType: Schema.String
              readonly fileName: Schema.optional<Schema.String>
              readonly data: Schema.Union<readonly [Schema.String, Schema.Uint8Array, Schema.URL]>
              readonly "~effect/ai/Prompt/Part": Schema.withDecodingDefaultKey<Schema.Literal<"~effect/ai/Prompt/Part">>
              readonly options: Schema.withDecodingDefault<
                Schema.$Record<
                  Schema.String,
                  Schema.NullOr<Schema.Codec<Schema.Json>>
                >
              >
            }>
          ]
        >
      >
    ]
  >
  readonly "~effect/ai/Prompt/Message": Schema.withDecodingDefaultKey<Schema.Literal<"~effect/ai/Prompt/Message">>
  readonly options: Schema.withDecodingDefault<
    Schema.$Record<
      Schema.String,
      Schema.NullOr<Schema.Codec<Schema.Json>>
    >
  >
}> = Schema.Struct({
  ...BaseMessage.fields,
  role: Schema.Literal("user"),
  content: Schema.Union([
    ContentFromString.check(
      Schema.makeFilter((content) => content.length === 1 && Object.keys(content[0].options).length === 0)
    ),
    Schema.Array(Schema.Union([TextPart, FilePart]))
  ])
}).annotate({ identifier: "UserMessage" })

/**
 * Constructs a new user message.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const userMessage = (params: MessageConstructorParams<UserMessage>): UserMessage => makeMessage("user", params)

// =============================================================================
// Assistant Message
// =============================================================================

/**
 * Message representing large language model assistant responses.
 *
 * **Example** (Creating assistant messages)
 *
 * ```ts import.meta.vitest
 * import { Prompt } from "effect/ai"
 *
 * const assistantMessage: Prompt.AssistantMessage = Prompt.makeMessage(
 *   "assistant",
 *   {
 *     content: [
 *       Prompt.makePart("text", {
 *         text:
 *           "I can check the current weather for San Francisco."
 *       }),
 *       Prompt.makePart("tool-call", {
 *         id: "call_123",
 *         name: "get_weather",
 *         params: { city: "San Francisco" },
 *         providerExecuted: false
 *       }),
 *       Prompt.makePart("tool-result", {
 *         id: "call_123",
 *         name: "get_weather",
 *         isFailure: false,
 *         result: {
 *           temperature: 72,
 *           condition: "sunny"
 *         },
 *         providerExecuted: true
 *       }),
 *       Prompt.makePart("text", {
 *         text: "The weather in San Francisco is currently 72°F and sunny."
 *       })
 *     ]
 *   }
 * )
 * assistantMessage.content.map((part) => part.type) // => ["text", "tool-call", "tool-result", "text"]
 * ```
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface AssistantMessage extends BaseMessage<"assistant", AssistantMessageOptions> {
  /**
   * Array of content parts that make up the assistant's response.
   */
  readonly content: ReadonlyArray<AssistantMessagePart>
}

/**
 * Union type of content parts allowed in assistant messages.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type AssistantMessagePart =
  | TextPart
  | FilePart
  | ReasoningPart
  | ToolCallPart
  | ToolResultPart
  | ToolApprovalRequestPart

/**
 * Encoded representation of assistant messages for serialization.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface AssistantMessageEncoded extends BaseMessageEncoded<"assistant", AssistantMessageOptions> {
  readonly content: string | ReadonlyArray<AssistantMessagePartEncoded>
}

/**
 * Union type of encoded content parts for assistant messages.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type AssistantMessagePartEncoded =
  | TextPartEncoded
  | FilePartEncoded
  | ReasoningPartEncoded
  | ToolCallPartEncoded
  | ToolResultPartEncoded
  | ToolApprovalRequestPartEncoded

/**
 * Schema for validation and encoding of assistant message content parts.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const AssistantMessagePart: Schema.Union<
  readonly [
    typeof TextPart,
    typeof FilePart,
    typeof ReasoningPart,
    typeof ToolCallPart,
    typeof ToolResultPart,
    typeof ToolApprovalRequestPart
  ]
> = Schema.Union([
  TextPart,
  FilePart,
  ReasoningPart,
  ToolCallPart,
  ToolResultPart,
  ToolApprovalRequestPart
])

/**
 * Represents provider-specific options that can be associated with a
 * `AssistantMessage` through module augmentation.
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export interface AssistantMessageOptions extends ProviderOptions {}

/**
 * Schema for validation and encoding of assistant messages.
 *
 * **Details**
 *
 * Assistant content can be a string decoded through `ContentFromString` or an
 * array of text, file, reasoning, tool-call, tool-result, and
 * tool-approval-request parts.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const AssistantMessage: Schema.Struct<{
  readonly role: Schema.Literal<"assistant">
  readonly content: Schema.Union<
    readonly [
      Schema.decodeTo<
        Schema.NonEmptyArray<
          Schema.toType<
            Schema.Struct<{
              readonly type: Schema.Literal<"text">
              readonly text: Schema.String
              readonly "~effect/ai/Prompt/Part": Schema.withDecodingDefaultKey<Schema.Literal<"~effect/ai/Prompt/Part">>
              readonly options: Schema.withDecodingDefault<
                Schema.$Record<
                  Schema.String,
                  Schema.NullOr<Schema.Codec<Schema.Json>>
                >
              >
            }>
          >
        >,
        Schema.String,
        never,
        never
      >,
      Schema.$Array<
        Schema.Union<
          readonly [
            typeof TextPart,
            typeof FilePart,
            typeof ReasoningPart,
            typeof ToolCallPart,
            typeof ToolResultPart,
            typeof ToolApprovalRequestPart
          ]
        >
      >
    ]
  >
  readonly "~effect/ai/Prompt/Message": Schema.withDecodingDefaultKey<Schema.Literal<"~effect/ai/Prompt/Message">>
  readonly options: Schema.withDecodingDefault<
    Schema.$Record<
      Schema.String,
      Schema.NullOr<Schema.Codec<Schema.Json>>
    >
  >
}> = Schema.Struct({
  ...BaseMessage.fields,
  role: Schema.Literal("assistant"),
  content: Schema.Union([
    ContentFromString.check(
      Schema.makeFilter((content) => content.length === 1 && Object.keys(content[0].options).length === 0)
    ),
    Schema.Array(Schema.Union([
      TextPart,
      FilePart,
      ReasoningPart,
      ToolCallPart,
      ToolResultPart,
      ToolApprovalRequestPart
    ]))
  ])
}).annotate({ identifier: "AssistantMessage" })

/**
 * Constructs a new assistant message.
 *
 * **When to use**
 *
 * Use to add assistant-role prompt history or model responses.
 *
 * **Details**
 *
 * This is the role-specific wrapper around `makeMessage("assistant", params)`.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const assistantMessage = (params: MessageConstructorParams<AssistantMessage>): AssistantMessage =>
  makeMessage("assistant", params)

// =============================================================================
// Tool Message
// =============================================================================

/**
 * Message carrying tool-side content, including tool execution results and
 * responses to tool approval requests.
 *
 * **Example** (Creating tool messages)
 *
 * ```ts import.meta.vitest
 * import { Prompt } from "effect/ai"
 *
 * const toolMessage: Prompt.ToolMessage = Prompt.makeMessage("tool", {
 *   content: [
 *     Prompt.makePart("tool-result", {
 *       id: "call_123",
 *       name: "search_web",
 *       isFailure: false,
 *       result: {
 *         query: "TypeScript best practices",
 *         results: [
 *           { title: "TypeScript Handbook", url: "https://..." },
 *           { title: "Effective TypeScript", url: "https://..." }
 *         ]
 *       },
 *       providerExecuted: false
 *     })
 *   ]
 * })
 * const result = [toolMessage.role, toolMessage.content[0].type] // => ["tool", "tool-result"]
 * ```
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ToolMessage extends BaseMessage<"tool", ToolMessageOptions> {
  /**
   * Array of tool result parts.
   */
  readonly content: ReadonlyArray<ToolMessagePart>
}

/**
 * Union type of content parts allowed in tool messages.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ToolMessagePart = ToolResultPart | ToolApprovalResponsePart

/**
 * Encoded representation of tool messages for serialization.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ToolMessageEncoded extends BaseMessageEncoded<"tool", ToolMessageOptions> {
  /**
   * Array of tool result parts.
   */
  readonly content: ReadonlyArray<ToolMessagePartEncoded>
}

/**
 * Union type of encoded content parts for tool messages.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ToolMessagePartEncoded = ToolResultPartEncoded | ToolApprovalResponsePartEncoded

/**
 * Schema for validation and encoding of tool message content parts.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ToolMessagePart: Schema.Union<
  readonly [typeof ToolResultPart, typeof ToolApprovalResponsePart]
> = Schema.Union([
  ToolResultPart,
  ToolApprovalResponsePart
])

/**
 * Represents provider-specific options that can be associated with a
 * `ToolMessage` through module augmentation.
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export interface ToolMessageOptions extends ProviderOptions {}

/**
 * Schema for validation and encoding of tool messages.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ToolMessage: Schema.Struct<{
  readonly role: Schema.Literal<"tool">
  readonly content: Schema.$Array<
    Schema.Union<readonly [typeof ToolResultPart, typeof ToolApprovalResponsePart]>
  >
  readonly "~effect/ai/Prompt/Message": Schema.withDecodingDefaultKey<Schema.Literal<"~effect/ai/Prompt/Message">>
  readonly options: Schema.withDecodingDefault<
    Schema.$Record<
      Schema.String,
      Schema.NullOr<Schema.Codec<Schema.Json>>
    >
  >
}> = Schema.Struct({
  ...BaseMessage.fields,
  role: Schema.Literal("tool"),
  content: Schema.Array(Schema.Union([ToolResultPart, ToolApprovalResponsePart]))
}).annotate({ identifier: "ToolMessage" })

/**
 * Constructs a new tool message.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const toolMessage = (params: MessageConstructorParams<ToolMessage>): ToolMessage => makeMessage("tool", params)

// =============================================================================
// Message
// =============================================================================

/**
 * A type representing all possible message types in a conversation.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Message =
  | SystemMessage
  | UserMessage
  | AssistantMessage
  | ToolMessage

/**
 * A type representing all possible encoded message types for serialization.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type MessageEncoded =
  | SystemMessageEncoded
  | UserMessageEncoded
  | AssistantMessageEncoded
  | ToolMessageEncoded

/**
 * Schema for validation and encoding of messages.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Message: Schema.Codec<Message, MessageEncoded> = Schema.Union([
  SystemMessage,
  UserMessage,
  AssistantMessage,
  ToolMessage
])

// =============================================================================
// Prompt
// =============================================================================

const TypeId = "~effect/ai/Prompt" as const

/**
 * Type guard to check if a value is a Prompt.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isPrompt = (u: unknown): u is Prompt => Predicate.hasProperty(u, TypeId)

/**
 * A Prompt contains a sequence of messages that form the context of a
 * conversation with a large language model.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Prompt extends Pipeable {
  readonly [TypeId]: typeof TypeId
  /**
   * Array of messages that make up the conversation.
   */
  readonly content: ReadonlyArray<Message>
}

/**
 * Encoded representation of prompts for serialization.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface PromptEncoded {
  /**
   * Array of messages that make up the conversation.
   */
  readonly content: ReadonlyArray<MessageEncoded>
}

const $Prompt = Schema.declare((u) => isPrompt(u), { identifier: "Prompt" })

// TODO: is the type annotation necessary?
// TODO: shoudn't the name be `PromptFrom...`?
// TODO: is the explicit encoding necessary? maybe use the default JSON serializer?
/**
 * Schema for AI prompt instances.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Prompt: Schema.Codec<Prompt, PromptEncoded> = Schema.Struct({
  content: Schema.Array(Schema.toEncoded(Message))
}).pipe(
  Schema.decodeTo(
    $Prompt,
    SchemaTransformation.transformEffect({
      decode: (input, options) =>
        Effect.mapBothEager(
          SchemaParser.decodeEffect(Schema.Array(Message))(input.content),
          {
            onSuccess: makePrompt,
            onFailure: () =>
              new SchemaIssue.InvalidValue(
                { message: "Invalid Prompt messages" },
                input.content,
                options
              )
          }
        ),
      encode: (prompt, options) =>
        Effect.mapBothEager(
          SchemaParser.encodeEffect(Schema.Array(Message))(prompt.content),
          {
            onSuccess: (messages) => ({ content: messages }),
            onFailure: () =>
              new SchemaIssue.InvalidValue(
                { message: "Invalid Prompt messages" },
                prompt.content,
                options
              )
          }
        )
    })
  )
)

/**
 * Raw input accepted by `make`: a string, an iterable of encoded messages, or
 * an existing `Prompt`.
 *
 * **Example** (Accepting raw prompt input)
 *
 * ```ts import.meta.vitest
 * import { Prompt } from "effect/ai"
 *
 * // String input - creates a user message
 * const stringInput: Prompt.RawInput = "Hello, world!"
 *
 * // Message array input
 * const messagesInput: Prompt.RawInput = [
 *   { role: "system", content: "You are helpful." },
 *   { role: "user", content: [{ type: "text", text: "Hi!" }] }
 * ]
 *
 * const promptInput: Prompt.RawInput = Prompt.empty
 *
 * const result = [typeof stringInput, Array.isArray(messagesInput), promptInput.content.length] // => ["string", true, 0]
 * ```
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type RawInput =
  | string
  | Iterable<MessageEncoded>
  | Prompt

const Proto = {
  [TypeId]: TypeId,
  pipe() {
    return pipeArguments(this, arguments)
  }
}

const makePrompt = (content: ReadonlyArray<Message>): Prompt =>
  Object.assign(Object.create(Proto), {
    content
  })

const decodeMessagesSync = Schema.decodeSync(Schema.Array(Message))

/**
 * An empty prompt with no messages.
 *
 * **Example** (Creating an empty prompt)
 *
 * ```ts import.meta.vitest
 * import { Prompt } from "effect/ai"
 *
 * const emptyPrompt = Prompt.empty
 * emptyPrompt.content // => []
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const empty: Prompt = makePrompt([])

/**
 * Creates a `Prompt` from an input.
 *
 * **Details**
 *
 * This is the primary constructor for creating prompts, supporting multiple
 * input formats for convenience and flexibility.
 *
 * **Example** (Creating prompts from inputs)
 *
 * ```ts import.meta.vitest
 * import { Prompt } from "effect/ai"
 *
 * // From string - creates a user message
 * const textPrompt = Prompt.make("Hello, how are you?")
 *
 * // From messages array
 * const structuredPrompt = Prompt.make([
 *   { role: "system", content: "You are a helpful assistant." },
 *   { role: "user", content: [{ type: "text", text: "Hi!" }] }
 * ])
 *
 * const copiedPrompt = Prompt.make(Prompt.empty)
 *
 * const result = [textPrompt.content[0].role, structuredPrompt.content.length, copiedPrompt.content.length] // => ["user", 2, 0]
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = (input: RawInput): Prompt => {
  if (typeof input === "string") {
    const part = makePart("text", { text: input })
    const message = makeMessage("user", { content: [part] })
    return makePrompt([message])
  }

  if (Predicate.isIterable(input)) {
    return makePrompt(decodeMessagesSync(Arr.fromIterable(input), {
      errors: "all"
    }))
  }

  return input
}

/**
 * Creates a Prompt from an array of messages.
 *
 * **Example** (Creating prompts from messages)
 *
 * ```ts import.meta.vitest
 * import { Prompt } from "effect/ai"
 *
 * const messages: ReadonlyArray<Prompt.Message> = [
 *   Prompt.makeMessage("system", {
 *     content: "You are a coding assistant."
 *   }),
 *   Prompt.makeMessage("user", {
 *     content: [Prompt.makePart("text", { text: "Help me with TypeScript" })]
 *   })
 * ]
 *
 * const prompt = Prompt.fromMessages(messages)
 * prompt.content.length // => 2
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const fromMessages = (messages: ReadonlyArray<Message>): Prompt => makePrompt(messages)

const mergeOptions = (left: ProviderOptions, right: ProviderOptions): ProviderOptions => {
  const result: Record<string, ProviderOptions[string]> = { ...left }
  for (const [provider, metadata] of Object.entries(right)) {
    const previous = result[provider]
    result[provider] = Predicate.isObject(previous) && Predicate.isObject(metadata)
      ? Object.assign({}, previous, metadata)
      : metadata
  }
  return result
}

/**
 * Creates a `Prompt` from response parts by folding completed text and
 * reasoning streams into assistant parts, preserving provider metadata as
 * prompt options, placing tool calls and approval requests in an assistant
 * message, and placing non-preliminary tool results in a tool message using
 * their encoded results.
 *
 * **Example** (Creating prompts from response parts)
 *
 * ```ts import.meta.vitest
 * import { Prompt, Response } from "effect/ai"
 *
 * const responseParts: ReadonlyArray<Response.AnyPart> = [
 *   Response.makePart("text", {
 *     text: "Hello there!"
 *   }),
 *   Response.makePart("tool-call", {
 *     id: "call_1",
 *     name: "get_time",
 *     params: {},
 *     providerExecuted: false
 *   }),
 *   Response.makePart("tool-result", {
 *     id: "call_1",
 *     name: "get_time",
 *     isFailure: false,
 *     result: "10:30 AM",
 *     encodedResult: "10:30 AM",
 *     providerExecuted: false,
 *     preliminary: false
 *   })
 * ]
 *
 * const prompt = Prompt.fromResponseParts(responseParts)
 * // Creates an assistant message with the response content
 * prompt.content.map((message) => message.role) // => ["assistant", "tool"]
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const fromResponseParts = (parts: ReadonlyArray<Response.AnyPart>): Prompt => {
  if (parts.length === 0) {
    return empty
  }

  const assistantParts: Array<AssistantMessagePart> = []
  const toolParts: Array<ToolMessagePart> = []

  const activeTextDeltas = new Map<string, { text: string; options: ProviderOptions }>()
  const activeReasoningDeltas = new Map<string, { text: string; options: ProviderOptions }>()

  for (const part of parts) {
    switch (part.type) {
      // Text Parts
      case "text": {
        assistantParts.push(makePart("text", { text: part.text, options: part.metadata }))
        break
      }

      // Text Parts (streaming)
      case "text-start": {
        activeTextDeltas.set(part.id, { text: "", options: part.metadata })
        break
      }
      case "text-delta": {
        if (activeTextDeltas.has(part.id)) {
          const active = activeTextDeltas.get(part.id)!
          active.text += part.delta
          active.options = mergeOptions(active.options, part.metadata)
        }
        break
      }
      case "text-end": {
        if (activeTextDeltas.has(part.id)) {
          const active = activeTextDeltas.get(part.id)!
          active.options = mergeOptions(active.options, part.metadata)
          assistantParts.push(makePart("text", active))
        }
        break
      }

      // Reasoning Parts
      case "reasoning": {
        assistantParts.push(makePart("reasoning", { text: part.text, options: part.metadata }))
        break
      }

      // Reasoning Parts (streaming)
      case "reasoning-start": {
        activeReasoningDeltas.set(part.id, { text: "", options: part.metadata })
        break
      }
      case "reasoning-delta": {
        if (activeReasoningDeltas.has(part.id)) {
          const active = activeReasoningDeltas.get(part.id)!
          active.text += part.delta
          active.options = mergeOptions(active.options, part.metadata)
        }
        break
      }
      case "reasoning-end": {
        if (activeReasoningDeltas.has(part.id)) {
          const active = activeReasoningDeltas.get(part.id)!
          active.options = mergeOptions(active.options, part.metadata)
          assistantParts.push(makePart("reasoning", active))
        }
        break
      }

      // File Parts
      case "file": {
        assistantParts.push(makePart("file", {
          data: Base64.encode(part.data),
          mediaType: part.mediaType,
          options: part.metadata
        }))
        break
      }

      // Tool Call Parts
      case "tool-call": {
        assistantParts.push(makePart("tool-call", {
          id: part.id,
          name: part.name,
          params: part.params,
          providerExecuted: part.providerExecuted ?? false,
          options: part.metadata
        }))
        break
      }

      // Tool Result Parts (skip preliminary results)
      case "tool-result": {
        if (part.preliminary !== true) {
          const target = part.providerExecuted === true ? assistantParts : toolParts
          target.push(makePart("tool-result", {
            id: part.id,
            name: part.name,
            isFailure: part.isFailure,
            result: part.encodedResult,
            providerExecuted: part.providerExecuted ?? false,
            options: part.metadata
          }))
        }
        break
      }

      // Tool Approval Request Parts
      case "tool-approval-request": {
        assistantParts.push(makePart("tool-approval-request", {
          approvalId: part.approvalId,
          toolCallId: part.toolCallId
        }))
        break
      }
    }
  }

  if (assistantParts.length === 0 && toolParts.length === 0) {
    return empty
  }

  const messages: Array<Message> = []

  if (assistantParts.length > 0) {
    messages.push(makeMessage("assistant", { content: assistantParts }))
  }

  if (toolParts.length > 0) {
    messages.push(makeMessage("tool", { content: toolParts }))
  }

  return makePrompt(messages)
}

// =============================================================================
// Merging Prompts
// =============================================================================

/**
 * Concatenates a prompt with additional raw input by concatenating messages.
 *
 * **Details**
 *
 * The returned prompt contains all messages from the original prompt followed
 * by the provided raw input, preserving message order.
 *
 * **Example** (Concatenating prompts)
 *
 * ```ts import.meta.vitest
 * import { Prompt } from "effect/ai"
 *
 * const systemPrompt = Prompt.make([{
 *   role: "system",
 *   content: "You are a helpful assistant."
 * }])
 *
 * const merged = Prompt.concat(systemPrompt, "Hello, world!")
 * merged.content.map((message) => message.role) // => ["system", "user"]
 * ```
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const concat: {
  (input: RawInput): (self: Prompt) => Prompt
  (self: Prompt, input: RawInput): Prompt
} = dual(2, (self: Prompt, input: RawInput): Prompt => {
  const other = make(input)
  if (self.content.length === 0) {
    return other
  }
  if (other.content.length === 0) {
    return self
  }
  return fromMessages([...self.content, ...other.content])
})

// =============================================================================
// Manipulating Prompts
// =============================================================================

/**
 * Creates a new prompt from the specified prompt with the system message set
 * to the specified text content.
 *
 * **Gotchas**
 *
 * This method removes and replaces any previous system message from the
 * prompt.
 *
 * **Example** (Replacing system instructions)
 *
 * ```ts import.meta.vitest
 * import { Prompt } from "effect/ai"
 *
 * const systemPrompt = Prompt.make([{
 *   role: "system",
 *   content: "You are a helpful assistant."
 * }])
 *
 * const userPrompt = Prompt.make("Hello, world!")
 *
 * const prompt = Prompt.concat(systemPrompt, userPrompt)
 *
 * const replaced = Prompt.setSystem(
 *   prompt,
 *   "You are an expert in programming"
 * )
 * replaced.content[0].content // => "You are an expert in programming"
 * ```
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const setSystem: {
  (content: string): (self: Prompt) => Prompt
  (self: Prompt, content: string): Prompt
} = dual(2, (self: Prompt, content: string): Prompt => {
  const messages: Array<Message> = [makeMessage("system", { content })]
  for (const message of self.content) {
    if (message.role !== "system") {
      messages.push(message)
    }
  }
  return makePrompt(messages)
})

/**
 * Creates a new prompt with a leading system message. If the prompt already has
 * a system message, the new message uses the provided content prepended to the
 * first existing system message's content; the original messages remain after
 * it.
 *
 * **Example** (Prepending system instructions)
 *
 * ```ts import.meta.vitest
 * import { Prompt } from "effect/ai"
 *
 * const systemPrompt = Prompt.make([{
 *   role: "system",
 *   content: "You are an expert in programming."
 * }])
 *
 * const userPrompt = Prompt.make("Hello, world!")
 *
 * const prompt = Prompt.concat(systemPrompt, userPrompt)
 *
 * const replaced = Prompt.prependSystem(
 *   prompt,
 *   "You are a helpful assistant. "
 * )
 * // result content: "You are a helpful assistant. You are an expert in programming."
 * replaced.content[0].content // => "You are a helpful assistant. You are an expert in programming."
 * ```
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const prependSystem: {
  (content: string): (self: Prompt) => Prompt
  (self: Prompt, content: string): Prompt
} = dual(2, (self: Prompt, content: string): Prompt => {
  let system: SystemMessage | undefined = undefined
  for (const message of self.content) {
    if (message.role === "system") {
      system = makeMessage("system", {
        content: content + message.content
      })
      break
    }
  }
  if (Predicate.isUndefined(system)) {
    system = makeMessage("system", { content })
  }
  return makePrompt([system, ...self.content])
})

/**
 * Creates a new prompt with a leading system message. If the prompt already has
 * a system message, the new message uses the provided content appended to the
 * first existing system message's content; the original messages remain after
 * it.
 *
 * **Example** (Appending system instructions)
 *
 * ```ts import.meta.vitest
 * import { Prompt } from "effect/ai"
 *
 * const systemPrompt = Prompt.make([{
 *   role: "system",
 *   content: "You are an expert in programming."
 * }])
 *
 * const userPrompt = Prompt.make("Hello, world!")
 *
 * const prompt = Prompt.concat(systemPrompt, userPrompt)
 *
 * const replaced = Prompt.appendSystem(
 *   prompt,
 *   " You are a helpful assistant."
 * )
 * // result content: "You are an expert in programming. You are a helpful assistant."
 * replaced.content[0].content // => "You are an expert in programming. You are a helpful assistant."
 * ```
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const appendSystem: {
  (content: string): (self: Prompt) => Prompt
  (self: Prompt, content: string): Prompt
} = dual(2, (self: Prompt, content: string): Prompt => {
  let system: SystemMessage | undefined = undefined
  for (const message of self.content) {
    if (message.role === "system") {
      system = makeMessage("system", {
        content: message.content + content
      })
      break
    }
  }
  if (Predicate.isUndefined(system)) {
    system = makeMessage("system", { content })
  }
  return makePrompt([system, ...self.content])
})
