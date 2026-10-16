/**
 * Defines a shared data model for AI model output.
 *
 * Responses are represented as typed parts so different providers can expose
 * text, reasoning, tool calls, files, sources, metadata, finish information, and
 * errors through one shape. The same model is used for complete responses and
 * streaming responses, where start, delta, and end parts describe content as it
 * arrives. This module also carries provider metadata and schemas used by tools
 * that need to validate response parts.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type * as DateTime from "../DateTime.ts"
import * as Effect from "../Effect.ts"
import { identity } from "../Function.ts"
import * as Predicate from "../Predicate.ts"
import * as Schema from "../Schema.ts"
import * as SchemaTransformation from "../SchemaTransformation.ts"
import * as AiError from "./AiError.ts"
import * as Tool from "./Tool.ts"
import type * as Toolkit from "./Toolkit.ts"

const PartTypeId = "~effect/ai/Response/Part" as const

// =============================================================================
// All Parts
// =============================================================================

/**
 * Type guard to check if a value is a Response Part.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isPart = (u: unknown): u is AnyPart => Predicate.hasProperty(u, PartTypeId)

/**
 * Union type representing all possible response content parts.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type AnyPart =
  | TextPart
  | TextStartPart
  | TextDeltaPart
  | TextEndPart
  | ReasoningPart
  | ReasoningStartPart
  | ReasoningDeltaPart
  | ReasoningEndPart
  | ToolParamsStartPart
  | ToolParamsDeltaPart
  | ToolParamsEndPart
  | ToolCallPart<any, any>
  | ToolResultPart<any, any, any>
  | ToolApprovalRequestPart
  | FilePart
  | DocumentSourcePart
  | UrlSourcePart
  | ResponseMetadataPart
  | FinishPart
  | ErrorPart

/**
 * Encoded representation of all possible response content parts for serialization.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type AnyPartEncoded =
  | TextPartEncoded
  | TextStartPartEncoded
  | TextDeltaPartEncoded
  | TextEndPartEncoded
  | ReasoningPartEncoded
  | ReasoningStartPartEncoded
  | ReasoningDeltaPartEncoded
  | ReasoningEndPartEncoded
  | ToolParamsStartPartEncoded
  | ToolParamsDeltaPartEncoded
  | ToolParamsEndPartEncoded
  | ToolCallPartEncoded
  | ToolResultPartEncoded
  | ToolApprovalRequestPartEncoded
  | FilePartEncoded
  | DocumentSourcePartEncoded
  | UrlSourcePartEncoded
  | ResponseMetadataPartEncoded
  | FinishPartEncoded
  | ErrorPartEncoded

/**
 * Union type for all response parts with tool-specific typing.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type AllParts<Tools extends Record<string, Tool.Any>> =
  | TextPart
  | TextStartPart
  | TextDeltaPart
  | TextEndPart
  | ReasoningPart
  | ReasoningStartPart
  | ReasoningDeltaPart
  | ReasoningEndPart
  | ToolParamsStartPart
  | ToolParamsDeltaPart
  | ToolParamsEndPart
  | ToolCallParts<Tools>
  | ToolResultParts<Tools>
  | ToolApprovalRequestPart
  | FilePart
  | DocumentSourcePart
  | UrlSourcePart
  | ResponseMetadataPart
  | FinishPart
  | ErrorPart

/**
 * Encoded representation of all response parts for serialization.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type AllPartsEncoded =
  | TextPartEncoded
  | TextStartPartEncoded
  | TextDeltaPartEncoded
  | TextEndPartEncoded
  | ReasoningPartEncoded
  | ReasoningStartPartEncoded
  | ReasoningDeltaPartEncoded
  | ReasoningEndPartEncoded
  | ToolParamsStartPartEncoded
  | ToolParamsDeltaPartEncoded
  | ToolParamsEndPartEncoded
  | ToolCallPartEncoded
  | ToolResultPartEncoded
  | ToolApprovalRequestPartEncoded
  | FilePartEncoded
  | DocumentSourcePartEncoded
  | UrlSourcePartEncoded
  | ResponseMetadataPartEncoded
  | FinishPartEncoded
  | ErrorPartEncoded

// Tools are immutable, so response schemas can share their per-tool parts.
const toolPartSchemaCache = new WeakMap<Tool.Any, {
  readonly toolCall: Schema.Top
  readonly toolResult: Schema.Top
}>()

const toolPartSchemas = (tool: Tool.Any) => {
  let parts = toolPartSchemaCache.get(tool)
  if (parts === undefined) {
    parts = {
      toolCall: ToolCallPart(tool.name, tool.parametersSchema),
      toolResult: ToolResultPart(tool.name, tool.successSchema, Tool.failureResultSchema(tool))
    }
    toolPartSchemaCache.set(tool, parts)
  }
  return parts
}

/**
 * Creates a Schema for all response parts based on a toolkit.
 *
 * **Details**
 *
 * Generates a schema that includes all possible response parts, with tool call
 * and tool result parts dynamically created based on the provided toolkit.
 *
 * **Example** (Building a response parts schema)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { Response, Tool, Toolkit } from "effect/ai"
 *
 * const myToolkit = Toolkit.make(
 *   Tool.make("GetWeather", {
 *     parameters: Schema.Struct({ city: Schema.String }),
 *     success: Schema.Struct({ temperature: Schema.Number })
 *   })
 * )
 *
 * const allPartsSchema = Response.AllParts(myToolkit)
 * Schema.isSchema(allPartsSchema) // => true
 * ```
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const AllParts = <T extends Toolkit.Any | Toolkit.WithHandler<any>>(
  toolkit: T
): Schema.Codec<
  AllParts<T extends Toolkit.Any ? Toolkit.Tools<T> : Toolkit.WithHandlerTools<T>>,
  AllPartsEncoded,
  Tool.ResultDecodingServices<Toolkit.Tools<T>[keyof Toolkit.Tools<T>]>,
  Tool.ResultEncodingServices<Toolkit.Tools<T>[keyof Toolkit.Tools<T>]>
> => {
  const toolCalls: Array<Schema.Top> = []
  const toolResults: Array<Schema.Top> = []
  for (const tool of Object.values(toolkit.tools as Record<string, Tool.Any>)) {
    const parts = toolPartSchemas(tool)
    toolCalls.push(parts.toolCall)
    toolResults.push(parts.toolResult)
  }
  return Schema.Union([
    TextPart,
    TextStartPart,
    TextDeltaPart,
    TextEndPart,
    ReasoningPart,
    ReasoningStartPart,
    ReasoningDeltaPart,
    ReasoningEndPart,
    ToolParamsStartPart,
    ToolParamsDeltaPart,
    ToolParamsEndPart,
    ToolApprovalRequestPart,
    FilePart,
    DocumentSourcePart,
    UrlSourcePart,
    ResponseMetadataPart,
    FinishPart,
    ErrorPart,
    ...toolCalls,
    ...toolResults
  ]) as any
}

// =============================================================================
// Parts
// =============================================================================

/**
 * A type for representing non-streaming response parts with tool-specific
 * typing.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Part<
  Tools extends Record<string, Tool.Any>,
  ParametersMode extends ToolParametersMode = "decoded"
> =
  | TextPart
  | ReasoningPart
  | ToolCallParts<Tools, ParametersMode>
  | ToolResultParts<Tools>
  | ToolApprovalRequestPart
  | FilePart
  | DocumentSourcePart
  | UrlSourcePart
  | ResponseMetadataPart
  | FinishPart

/**
 * Encoded representation of non-streaming response parts for serialization.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type PartEncoded =
  | TextPartEncoded
  | ReasoningPartEncoded
  | ReasoningDeltaPartEncoded
  | ReasoningEndPartEncoded
  | ToolCallPartEncoded
  | ToolResultPartEncoded
  | ToolApprovalRequestPartEncoded
  | FilePartEncoded
  | DocumentSourcePartEncoded
  | UrlSourcePartEncoded
  | ResponseMetadataPartEncoded
  | FinishPartEncoded

/**
 * Creates a Schema for non-streaming response parts based on a toolkit.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Part = <T extends Toolkit.Any | Toolkit.WithHandler<any>>(
  toolkit: T
): Schema.Codec<
  Part<T extends Toolkit.Any ? Toolkit.Tools<T> : Toolkit.WithHandlerTools<T>>,
  PartEncoded,
  Tool.ResultDecodingServices<Toolkit.Tools<T>[keyof Toolkit.Tools<T>]>,
  Tool.ResultEncodingServices<Toolkit.Tools<T>[keyof Toolkit.Tools<T>]>
> => {
  const toolCalls: Array<Schema.Top> = []
  const toolResults: Array<Schema.Top> = []
  for (const tool of Object.values(toolkit.tools as Record<string, Tool.Any>)) {
    const parts = toolPartSchemas(tool)
    toolCalls.push(parts.toolCall)
    toolResults.push(parts.toolResult)
  }
  return Schema.Union([
    TextPart,
    ReasoningPart,
    ToolApprovalRequestPart,
    FilePart,
    DocumentSourcePart,
    UrlSourcePart,
    ResponseMetadataPart,
    FinishPart,
    ...toolCalls,
    ...toolResults
  ]) as any
}

// =============================================================================
// Stream Parts
// =============================================================================

/**
 * A type for representing streaming response parts with tool-specific typing.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type StreamPart<
  Tools extends Record<string, Tool.Any>,
  ParametersMode extends ToolParametersMode = "decoded"
> =
  | TextStartPart
  | TextDeltaPart
  | TextEndPart
  | ReasoningStartPart
  | ReasoningDeltaPart
  | ReasoningEndPart
  | ToolParamsStartPart
  | ToolParamsDeltaPart
  | ToolParamsEndPart
  | ToolCallParts<Tools, ParametersMode>
  | ToolResultParts<Tools>
  | ToolApprovalRequestPart
  | FilePart
  | DocumentSourcePart
  | UrlSourcePart
  | ResponseMetadataPart
  | FinishPart
  | ErrorPart

/**
 * Encoded representation of streaming response parts for serialization.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type StreamPartEncoded =
  | TextStartPartEncoded
  | TextDeltaPartEncoded
  | TextEndPartEncoded
  | ReasoningStartPartEncoded
  | ReasoningDeltaPartEncoded
  | ReasoningEndPartEncoded
  | ToolParamsStartPartEncoded
  | ToolParamsDeltaPartEncoded
  | ToolParamsEndPartEncoded
  | ToolCallPartEncoded
  | ToolResultPartEncoded
  | ToolApprovalRequestPartEncoded
  | FilePartEncoded
  | DocumentSourcePartEncoded
  | UrlSourcePartEncoded
  | ResponseMetadataPartEncoded
  | FinishPartEncoded
  | ErrorPartEncoded

/**
 * Creates a Schema for streaming response parts based on a toolkit.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const StreamPart = <T extends Toolkit.Any | Toolkit.WithHandler<any>>(
  toolkit: T
): Schema.Codec<
  StreamPart<T extends Toolkit.Any ? Toolkit.Tools<T> : Toolkit.WithHandlerTools<T>>,
  StreamPartEncoded,
  Tool.ResultDecodingServices<Toolkit.Tools<T>[keyof Toolkit.Tools<T>]>,
  Tool.ResultEncodingServices<Toolkit.Tools<T>[keyof Toolkit.Tools<T>]>
> => {
  const toolCalls: Array<Schema.Top> = []
  const toolResults: Array<Schema.Top> = []
  for (const tool of Object.values(toolkit.tools as Record<string, Tool.Any>)) {
    const parts = toolPartSchemas(tool)
    toolCalls.push(parts.toolCall)
    toolResults.push(parts.toolResult)
  }
  return Schema.Union([
    TextStartPart,
    TextDeltaPart,
    TextEndPart,
    ReasoningStartPart,
    ReasoningDeltaPart,
    ReasoningEndPart,
    ToolParamsStartPart,
    ToolParamsDeltaPart,
    ToolParamsEndPart,
    ToolApprovalRequestPart,
    FilePart,
    DocumentSourcePart,
    UrlSourcePart,
    ResponseMetadataPart,
    FinishPart,
    ErrorPart,
    ...toolCalls,
    ...toolResults
  ]) as any
}

// =============================================================================
// utility types
// =============================================================================

/**
 * Utility type that extracts tool call parts from a set of tools.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type ToolCallParts<
  Tools extends Record<string, Tool.Any>,
  ParametersMode extends ToolParametersMode = "decoded"
> = ToolCallPartForName<Tools, ParametersMode, keyof Tools>

/**
 * Controls whether tool parameters are decoded, encoded, or opaque.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type ToolParametersMode = "decoded" | "encoded" | "opaque"

type ToolCallPartForName<
  Tools extends Record<string, Tool.Any>,
  ParametersMode extends ToolParametersMode,
  Name extends keyof Tools
> = Name extends string ? ToolCallPart<
    Name,
    ParametersMode extends "encoded" ? Tool.ParametersEncoded<Tools[Name]>
      : ParametersMode extends "opaque" ? unknown
      : Tool.Parameters<Tools[Name]>
  >
  : never

/**
 * Utility type that extracts tool result parts from a set of tools.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type ToolResultParts<Tools extends Record<string, Tool.Any>> = ToolResultPartForName<Tools, keyof Tools>

type ToolResultPartForName<
  Tools extends Record<string, Tool.Any>,
  Name extends keyof Tools
> = Name extends string ? ToolResultPart<Name, Tool.Success<Tools[Name]>, Tool.FailureResult<Tools[Name]>> : never

// =============================================================================
// Base Part
// =============================================================================

/**
 * Schema for provider-specific metadata attached to response parts,
 * represented as a record from provider-specific keys to JSON values or `null`.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ProviderMetadata: Schema.$Record<
  Schema.String,
  Schema.NullOr<Schema.Codec<Schema.Json>>
> = Schema.Record(Schema.String, Schema.NullOr(Schema.Json))

/**
 * Type of provider-specific metadata attached to response parts, keyed by
 * provider-specific names with JSON or `null` values.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ProviderMetadata = typeof ProviderMetadata.Type

/**
 * Base interface for all response content parts, including the type identifier
 * and optional metadata.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface BasePart<Type extends string, Metadata extends ProviderMetadata> {
  readonly [PartTypeId]: typeof PartTypeId
  /**
   * The type of this response part.
   */
  readonly type: Type
  /**
   * Optional provider-specific metadata for this part.
   */
  readonly metadata: Metadata
}

/**
 * Base interface for encoded response content parts.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface BasePartEncoded<Type extends string, Metadata extends ProviderMetadata> {
  /**
   * The type of this response part.
   */
  readonly type: Type
  /**
   * Optional provider-specific metadata for this part.
   */
  readonly metadata?: Metadata | undefined
}

const BasePart = Schema.Struct({
  [PartTypeId]: Schema.tag(PartTypeId).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed(PartTypeId), { encodingStrategy: "omit" })
  ),
  metadata: ProviderMetadata.pipe(
    Schema.withDecodingDefault(Effect.succeed({}))
  )
})

/**
 * Creates a new response content part of the specified type.
 *
 * **Example** (Creating response content parts)
 *
 * ```ts import.meta.vitest
 * import { Response } from "effect/ai"
 *
 * const textPart = Response.makePart("text", {
 *   text: "Hello, world!"
 * })
 *
 * const toolCallPart = Response.makePart("tool-call", {
 *   id: "call_123",
 *   name: "get_weather",
 *   params: { city: "San Francisco" },
 *   providerExecuted: false
 * })
 *
 * const result = [textPart.type, toolCallPart.name] // => ["text", "get_weather"]
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makePart = <const Type extends AnyPart["type"]>(
  /**
   * The type of part to create.
   */
  type: Type,
  /**
   * Parameters specific to the part type being created.
   */
  params: Omit<Extract<AnyPart, { type: Type }>, typeof PartTypeId | "type" | "metadata"> & {
    /**
     * Optional provider-specific metadata for this part.
     */
    readonly metadata?: Extract<AnyPart, { type: Type }>["metadata"] | undefined
  }
): Extract<AnyPart, { type: Type }> => (({
  ...params,
  [PartTypeId]: PartTypeId,
  type,
  metadata: params.metadata ?? {}
}) as any)

/**
 * A utility type for specifying the parameters required to construct a
 * specific response part.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type ConstructorParams<Part extends AnyPart> =
  & Omit<Part, typeof PartTypeId | "type" | "sourceType" | "metadata">
  & {
    /**
     * Optional provider-specific metadata for this part.
     */
    readonly metadata?: Part["metadata"] | undefined
  }

// =============================================================================
// Text Part
// =============================================================================

/**
 * Response part representing plain text content.
 *
 * **Example** (Creating a text part)
 *
 * ```ts import.meta.vitest
 * import { Response } from "effect/ai"
 *
 * const textPart: Response.TextPart = Response.makePart("text", {
 *   text: "The answer to your question is 42."
 * })
 * textPart.text // => "The answer to your question is 42."
 * ```
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface TextPart extends BasePart<"text", TextPartMetadata> {
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
export interface TextPartEncoded extends BasePartEncoded<"text", TextPartMetadata> {
  /**
   * The text content.
   */
  readonly text: string
}

/**
 * Represents provider-specific metadata that can be associated with a
 * `TextPart` through module augmentation.
 *
 * @stability unstable
 * @category configuration
 * @since 4.0.0
 */
export interface TextPartMetadata extends ProviderMetadata {}

/**
 * Schema for validation and encoding of text parts.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const TextPart: Schema.Struct<{
  readonly type: Schema.tag<"text">
  readonly text: Schema.String
  readonly "~effect/ai/Response/Part": Schema.withDecodingDefaultKey<Schema.tag<"~effect/ai/Response/Part">>
  readonly metadata: Schema.withDecodingDefault<
    Schema.$Record<Schema.String, Schema.Codec<Schema.Json>>
  >
}> = Schema.Struct({
  ...BasePart.fields,
  type: Schema.tag("text"),
  text: Schema.String
}).annotate({ identifier: "TextPart" }) satisfies Schema.Codec<TextPart, TextPartEncoded>

// =============================================================================
// Text Start Part
// =============================================================================

/**
 * Response part indicating the start of streaming text content with a unique
 * text chunk identifier.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface TextStartPart extends BasePart<"text-start", TextStartPartMetadata> {
  /**
   * Unique identifier for this text chunk.
   */
  readonly id: string
}

/**
 * Encoded representation of text start parts for serialization.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface TextStartPartEncoded extends BasePartEncoded<"text-start", TextStartPartMetadata> {
  /**
   * Unique identifier for this text chunk.
   */
  readonly id: string
}

/**
 * Represents provider-specific metadata that can be associated with a
 * `TextStartPart` through module augmentation.
 *
 * @stability unstable
 * @category configuration
 * @since 4.0.0
 */
export interface TextStartPartMetadata extends ProviderMetadata {}

/**
 * Schema for validation and encoding of text start parts.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const TextStartPart: Schema.Struct<{
  readonly type: Schema.tag<"text-start">
  readonly id: Schema.String
  readonly "~effect/ai/Response/Part": Schema.withDecodingDefaultKey<Schema.tag<"~effect/ai/Response/Part">>
  readonly metadata: Schema.withDecodingDefault<
    Schema.$Record<Schema.String, Schema.Codec<Schema.Json>>
  >
}> = Schema.Struct({
  ...BasePart.fields,
  type: Schema.tag("text-start"),
  id: Schema.String
}).annotate({ identifier: "TextStartPart" }) satisfies Schema.Codec<TextStartPart, TextStartPartEncoded>

// =============================================================================
// Text Delta Part
// =============================================================================

/**
 * Response part containing incremental text content to be added to the existing
 * text chunk with the same unique identifier.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface TextDeltaPart extends BasePart<"text-delta", TextDeltaPartMetadata> {
  /**
   * Unique identifier matching the corresponding text chunk.
   */
  readonly id: string
  /**
   * The incremental text content to add.
   */
  readonly delta: string
}

/**
 * Encoded representation of text delta parts for serialization.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface TextDeltaPartEncoded extends BasePartEncoded<"text-delta", TextDeltaPartMetadata> {
  /**
   * Unique identifier matching the corresponding text chunk.
   */
  readonly id: string
  /**
   * The incremental text content to add.
   */
  readonly delta: string
}

/**
 * Represents provider-specific metadata that can be associated with a
 * `TextDeltaPart` through module augmentation.
 *
 * @stability unstable
 * @category configuration
 * @since 4.0.0
 */
export interface TextDeltaPartMetadata extends ProviderMetadata {}

/**
 * Schema for validation and encoding of text delta parts.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const TextDeltaPart: Schema.Struct<{
  readonly type: Schema.tag<"text-delta">
  readonly id: Schema.String
  readonly delta: Schema.String
  readonly "~effect/ai/Response/Part": Schema.withDecodingDefaultKey<Schema.tag<"~effect/ai/Response/Part">>
  readonly metadata: Schema.withDecodingDefault<
    Schema.$Record<Schema.String, Schema.Codec<Schema.Json>>
  >
}> = Schema.Struct({
  ...BasePart.fields,
  type: Schema.tag("text-delta"),
  id: Schema.String,
  delta: Schema.String
}).annotate({ identifier: "TextDeltaPart" }) satisfies Schema.Codec<TextDeltaPart, TextDeltaPartEncoded>

// =============================================================================
// Text End Part
// =============================================================================

/**
 * Response part indicating the completion of a streaming text chunk.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface TextEndPart extends BasePart<"text-end", TextEndPartMetadata> {
  /**
   * Unique identifier matching the corresponding text chunk.
   */
  readonly id: string
}

/**
 * Encoded representation of text end parts for serialization.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface TextEndPartEncoded extends BasePartEncoded<"text-end", TextEndPartMetadata> {
  /**
   * Unique identifier matching the corresponding text chunk.
   */
  readonly id: string
}

/**
 * Represents provider-specific metadata that can be associated with a
 * `TextEndPart` through module augmentation.
 *
 * @stability unstable
 * @category configuration
 * @since 4.0.0
 */
export interface TextEndPartMetadata extends ProviderMetadata {}

/**
 * Schema for validation and encoding of text end parts.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const TextEndPart: Schema.Struct<{
  readonly type: Schema.tag<"text-end">
  readonly id: Schema.String
  readonly "~effect/ai/Response/Part": Schema.withDecodingDefaultKey<Schema.tag<"~effect/ai/Response/Part">>
  readonly metadata: Schema.withDecodingDefault<
    Schema.$Record<Schema.String, Schema.Codec<Schema.Json>>
  >
}> = Schema.Struct({
  ...BasePart.fields,
  type: Schema.tag("text-end"),
  id: Schema.String
}).annotate({ identifier: "TextEndPart" }) satisfies Schema.Codec<TextEndPart, TextEndPartEncoded>

// =============================================================================
// Reasoning Part
// =============================================================================

/**
 * Response part carrying provider-supplied reasoning text, such as an exposed
 * reasoning summary or explanation. Do not assume it contains hidden
 * chain-of-thought.
 *
 * **Example** (Creating a reasoning part)
 *
 * ```ts import.meta.vitest
 * import { Response } from "effect/ai"
 *
 * const reasoningPart: Response.ReasoningPart = Response.makePart("reasoning", {
 *   text:
 *     "Let me think step by step: First I need to analyze the user's question..."
 * })
 * reasoningPart.type // => "reasoning"
 * ```
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ReasoningPart extends BasePart<"reasoning", ReasoningPartMetadata> {
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
export interface ReasoningPartEncoded extends BasePartEncoded<"reasoning", ReasoningPartMetadata> {
  /**
   * The reasoning or thought process text.
   */
  readonly text: string
}

/**
 * Represents provider-specific metadata that can be associated with a
 * `ReasoningPart` through module augmentation.
 *
 * @stability unstable
 * @category configuration
 * @since 4.0.0
 */
export interface ReasoningPartMetadata extends ProviderMetadata {}

/**
 * Schema for validation and encoding of reasoning parts.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ReasoningPart: Schema.Struct<{
  readonly type: Schema.tag<"reasoning">
  readonly text: Schema.String
  readonly "~effect/ai/Response/Part": Schema.withDecodingDefaultKey<Schema.tag<"~effect/ai/Response/Part">>
  readonly metadata: Schema.withDecodingDefault<
    Schema.$Record<Schema.String, Schema.Codec<Schema.Json>>
  >
}> = Schema.Struct({
  ...BasePart.fields,
  type: Schema.tag("reasoning"),
  text: Schema.String
}).annotate({ identifier: "ReasoningPart" }) satisfies Schema.Codec<ReasoningPart, ReasoningPartEncoded>

// =============================================================================
// Reasoning Start Part
// =============================================================================

/**
 * Response part indicating the start of streaming reasoning content with a
 * unique reasoning chunk identifier.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ReasoningStartPart extends BasePart<"reasoning-start", ReasoningStartPartMetadata> {
  /**
   * Unique identifier for this reasoning chunk.
   */
  readonly id: string
}

/**
 * Encoded representation of reasoning start parts for serialization.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ReasoningStartPartEncoded extends BasePartEncoded<"reasoning-start", ReasoningStartPartMetadata> {
  /**
   * Unique identifier for this reasoning stream.
   */
  readonly id: string
}

/**
 * Represents provider-specific metadata that can be associated with a
 * `ReasoningStartPart` through module augmentation.
 *
 * @stability unstable
 * @category configuration
 * @since 4.0.0
 */
export interface ReasoningStartPartMetadata extends ProviderMetadata {}

/**
 * Schema for validation and encoding of reasoning start parts.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ReasoningStartPart: Schema.Struct<{
  readonly type: Schema.tag<"reasoning-start">
  readonly id: Schema.String
  readonly "~effect/ai/Response/Part": Schema.withDecodingDefaultKey<Schema.tag<"~effect/ai/Response/Part">>
  readonly metadata: Schema.withDecodingDefault<
    Schema.$Record<Schema.String, Schema.Codec<Schema.Json>>
  >
}> = Schema.Struct({
  ...BasePart.fields,
  type: Schema.tag("reasoning-start"),
  id: Schema.String
}).annotate({ identifier: "ReasoningStartPart" }) satisfies Schema.Codec<ReasoningStartPart, ReasoningStartPartEncoded>

// =============================================================================
// Reasoning Delta Part
// =============================================================================

/**
 * Response part containing incremental reasoning content to be added to the
 * existing chunk of reasoning text with the same unique identifier.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ReasoningDeltaPart extends BasePart<"reasoning-delta", ReasoningDeltaPartMetadata> {
  /**
   * Unique identifier matching the corresponding reasoning chunk.
   */
  readonly id: string
  /**
   * The incremental reasoning content to add.
   */
  readonly delta: string
}

/**
 * Encoded representation of reasoning delta parts for serialization.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ReasoningDeltaPartEncoded extends BasePartEncoded<"reasoning-delta", ReasoningDeltaPartMetadata> {
  /**
   * Unique identifier matching the corresponding reasoning chunk.
   */
  readonly id: string
  /**
   * The incremental reasoning content to add.
   */
  readonly delta: string
}

/**
 * Represents provider-specific metadata that can be associated with a
 * `ReasoningDeltaPart` through module augmentation.
 *
 * @stability unstable
 * @category configuration
 * @since 4.0.0
 */
export interface ReasoningDeltaPartMetadata extends ProviderMetadata {}

/**
 * Schema for validation and encoding of reasoning delta parts.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ReasoningDeltaPart: Schema.Struct<{
  readonly type: Schema.tag<"reasoning-delta">
  readonly id: Schema.String
  readonly delta: Schema.String
  readonly "~effect/ai/Response/Part": Schema.withDecodingDefaultKey<Schema.tag<"~effect/ai/Response/Part">>
  readonly metadata: Schema.withDecodingDefault<
    Schema.$Record<Schema.String, Schema.Codec<Schema.Json>>
  >
}> = Schema.Struct({
  ...BasePart.fields,
  type: Schema.tag("reasoning-delta"),
  id: Schema.String,
  delta: Schema.String
}).annotate({ identifier: "ReasoningDeltaPart" }) satisfies Schema.Codec<ReasoningDeltaPart, ReasoningDeltaPartEncoded>

// =============================================================================
// Reasoning End Part
// =============================================================================

/**
 * Response part indicating the completion of a streaming reasoning chunk.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ReasoningEndPart extends BasePart<"reasoning-end", ReasoningEndPartMetadata> {
  /**
   * Unique identifier matching the corresponding reasoning chunk.
   */
  readonly id: string
}

/**
 * Encoded representation of reasoning end parts for serialization.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ReasoningEndPartEncoded extends BasePartEncoded<"reasoning-end", ReasoningEndPartMetadata> {
  /**
   * Unique identifier matching the corresponding reasoning chunk.
   */
  readonly id: string
}

/**
 * Represents provider-specific metadata that can be associated with a
 * `ReasoningEndPart` through module augmentation.
 *
 * @stability unstable
 * @category configuration
 * @since 4.0.0
 */
export interface ReasoningEndPartMetadata extends ProviderMetadata {}

/**
 * Schema for validation and encoding of reasoning end parts.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ReasoningEndPart: Schema.Struct<{
  readonly type: Schema.tag<"reasoning-end">
  readonly id: Schema.String
  readonly "~effect/ai/Response/Part": Schema.withDecodingDefaultKey<Schema.tag<"~effect/ai/Response/Part">>
  readonly metadata: Schema.withDecodingDefault<
    Schema.$Record<Schema.String, Schema.Codec<Schema.Json>>
  >
}> = Schema.Struct({
  ...BasePart.fields,
  type: Schema.tag("reasoning-end"),
  id: Schema.String
}).annotate({ identifier: "ReasoningEndPart" }) satisfies Schema.Codec<ReasoningEndPart, ReasoningEndPartEncoded>

// =============================================================================
// Tool Params Start Part
// =============================================================================

/**
 * Response part indicating the start of streaming tool parameters.
 *
 * **Details**
 *
 * Marks the beginning of tool parameter streaming with metadata about the tool
 * call.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ToolParamsStartPart extends BasePart<"tool-params-start", ToolParamsStartPartMetadata> {
  /**
   * Unique identifier for this tool parameter chunk.
   */
  readonly id: string
  /**
   * Name of the tool being called, which corresponds to the name of the tool
   * in the `Toolkit` included with the request.
   */
  readonly name: string
  /**
   * Whether the tool was executed by the provider (true) or framework (false).
   */
  readonly providerExecuted: boolean
}

/**
 * Encoded representation of tool params start parts for serialization.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ToolParamsStartPartEncoded extends BasePartEncoded<"tool-params-start", ToolParamsStartPartMetadata> {
  /**
   * Unique identifier for this tool parameter chunk.
   */
  readonly id: string
  /**
   * Name of the tool being called, which corresponds to the name of the tool
   * in the `Toolkit` included with the request.
   */
  readonly name: string
  /**
   * Whether the tool was executed by the provider (true) or framework (false).
   */
  readonly providerExecuted?: boolean
}

/**
 * Represents provider-specific metadata that can be associated with a
 * `ToolParamsStartPart` through module augmentation.
 *
 * @stability unstable
 * @category configuration
 * @since 4.0.0
 */
export interface ToolParamsStartPartMetadata extends ProviderMetadata {}

/**
 * Schema for validation and encoding of tool params start parts.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ToolParamsStartPart: Schema.Struct<{
  readonly type: Schema.tag<"tool-params-start">
  readonly id: Schema.String
  readonly name: Schema.String
  readonly providerExecuted: Schema.withDecodingDefaultKey<Schema.Boolean>
  readonly "~effect/ai/Response/Part": Schema.withDecodingDefaultKey<Schema.tag<"~effect/ai/Response/Part">>
  readonly metadata: Schema.withDecodingDefault<
    Schema.$Record<Schema.String, Schema.Codec<Schema.Json>>
  >
}> = Schema.Struct({
  ...BasePart.fields,
  type: Schema.tag("tool-params-start"),
  id: Schema.String,
  name: Schema.String,
  providerExecuted: Schema.Boolean.pipe(Schema.withDecodingDefaultKey(Effect.succeed(false)))
}).annotate({ identifier: "ToolParamsStartPart" }) satisfies Schema.Codec<
  ToolParamsStartPart,
  ToolParamsStartPartEncoded
>

// =============================================================================
// Tool Params Delta Part
// =============================================================================

/**
 * Response part containing incremental tool parameter content.
 *
 * **Details**
 *
 * Represents a chunk of tool parameters being streamed, containing the
 * incremental JSON content that forms the tool parameters.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ToolParamsDeltaPart extends BasePart<"tool-params-delta", ToolParamsDeltaPartMetadata> {
  /**
   * Unique identifier matching the corresponding tool parameter chunk.
   */
  readonly id: string
  /**
   * The incremental parameter content (typically JSON fragment) to add.
   */
  readonly delta: string
}

/**
 * Encoded representation of tool params delta parts for serialization.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ToolParamsDeltaPartEncoded extends BasePartEncoded<"tool-params-delta", ToolParamsDeltaPartMetadata> {
  /**
   * Unique identifier matching the corresponding tool parameter chunk.
   */
  readonly id: string
  /**
   * The incremental parameter content (typically JSON fragment) to add.
   */
  readonly delta: string
}

/**
 * Represents provider-specific metadata that can be associated with a
 * `ToolParamsDeltaPart` through module augmentation.
 *
 * @stability unstable
 * @category configuration
 * @since 4.0.0
 */
export interface ToolParamsDeltaPartMetadata extends ProviderMetadata {}

/**
 * Schema for validation and encoding of tool params delta parts.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ToolParamsDeltaPart: Schema.Struct<{
  readonly type: Schema.tag<"tool-params-delta">
  readonly id: Schema.String
  readonly delta: Schema.String
  readonly "~effect/ai/Response/Part": Schema.withDecodingDefaultKey<Schema.tag<"~effect/ai/Response/Part">>
  readonly metadata: Schema.withDecodingDefault<
    Schema.$Record<Schema.String, Schema.Codec<Schema.Json>>
  >
}> = Schema.Struct({
  ...BasePart.fields,
  type: Schema.tag("tool-params-delta"),
  id: Schema.String,
  delta: Schema.String
}).annotate({ identifier: "ToolParamsDeltaPart" }) satisfies Schema.Codec<
  ToolParamsDeltaPart,
  ToolParamsDeltaPartEncoded
>

// =============================================================================
// Tool Params End Part
// =============================================================================

/**
 * Response part indicating the end of streaming tool parameters.
 *
 * **Details**
 *
 * Marks the completion of a tool parameter stream, indicating that all
 * parameter data has been sent and the tool call is ready to be executed.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ToolParamsEndPart extends BasePart<"tool-params-end", ToolParamsEndPartMetadata> {
  /**
   * Unique identifier matching the corresponding tool parameter chunk.
   */
  readonly id: string
}

/**
 * Encoded representation of tool params end parts for serialization.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ToolParamsEndPartEncoded extends BasePartEncoded<"tool-params-end", ToolParamsEndPartMetadata> {
  /**
   * Unique identifier matching the corresponding tool parameter stream.
   */
  readonly id: string
}

/**
 * Represents provider-specific metadata that can be associated with a
 * `ToolParamsEndPart` through module augmentation.
 *
 * @stability unstable
 * @category configuration
 * @since 4.0.0
 */
export interface ToolParamsEndPartMetadata extends ProviderMetadata {}

/**
 * Schema for validation and encoding of tool params end parts.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ToolParamsEndPart: Schema.Struct<{
  readonly type: Schema.tag<"tool-params-end">
  readonly id: Schema.String
  readonly "~effect/ai/Response/Part": Schema.withDecodingDefaultKey<Schema.tag<"~effect/ai/Response/Part">>
  readonly metadata: Schema.withDecodingDefault<
    Schema.$Record<Schema.String, Schema.Codec<Schema.Json>>
  >
}> = Schema.Struct({
  ...BasePart.fields,
  type: Schema.tag("tool-params-end"),
  id: Schema.String
}).annotate({ identifier: "ToolParamsEndPart" }) satisfies Schema.Codec<ToolParamsEndPart, ToolParamsEndPartEncoded>

// =============================================================================
// Tool Call Part
// =============================================================================

/**
 * Response part representing a tool call request.
 *
 * **Example** (Creating a tool call part)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { Response } from "effect/ai"
 *
 * const weatherParams = Schema.Struct({
 *   city: Schema.String,
 *   units: Schema.optional(Schema.Literals(["celsius", "fahrenheit"]))
 * })
 *
 * const toolCallPart: Response.ToolCallPart<
 *   "get_weather",
 *   {
 *     readonly city: string
 *     readonly units?: "celsius" | "fahrenheit"
 *   }
 * > = Response.makePart("tool-call", {
 *   id: "call_123",
 *   name: "get_weather",
 *   params: { city: "San Francisco", units: "celsius" },
 *   providerExecuted: false
 * })
 * const result = [toolCallPart.name, toolCallPart.params.city] // => ["get_weather", "San Francisco"]
 * ```
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ToolCallPart<Name extends string, Params> extends BasePart<"tool-call", ToolCallPartMetadata> {
  /**
   * Unique identifier for this tool call.
   */
  readonly id: string
  /**
   * Name of the tool being called, which corresponds to the name of the tool
   * in the `Toolkit` included with the request.
   */
  readonly name: Name
  /**
   * Parameters to pass to the tool.
   */
  readonly params: Params
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
export interface ToolCallPartEncoded extends BasePartEncoded<"tool-call", ToolCallPartMetadata> {
  /**
   * Unique identifier for this tool call.
   */
  readonly id: string
  /**
   * Name of the tool being called, which corresponds to the name of the tool
   * in the `Toolkit` included with the request.
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
 * Represents provider-specific metadata that can be associated with a
 * `ToolCallPart` through module augmentation.
 *
 * @stability unstable
 * @category configuration
 * @since 4.0.0
 */
export interface ToolCallPartMetadata extends ProviderMetadata {}

/**
 * Creates a Schema for tool call parts with specific tool name and parameters.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ToolCallPart: <const Name extends string, Params extends Schema.Constraint>(
  name: Name,
  params: Params
) => Schema.Struct<
  {
    readonly type: Schema.Literal<"tool-call">
    readonly id: Schema.String
    readonly name: Schema.Literal<Name>
    readonly params: Params
    readonly providerExecuted: Schema.withDecodingDefaultKey<Schema.Boolean>
    readonly "~effect/ai/Response/Part": Schema.withDecodingDefaultKey<Schema.tag<"~effect/ai/Response/Part">>
    readonly metadata: Schema.withDecodingDefault<
      Schema.$Record<Schema.String, Schema.Codec<Schema.Json>>
    >
  }
> = <const Name extends string, Params extends Schema.Constraint>(
  name: Name,
  params: Params
) =>
  Schema.Struct({
    ...BasePart.fields,
    type: Schema.Literal("tool-call"),
    id: Schema.String,
    name: Schema.Literal(name),
    params,
    providerExecuted: Schema.Boolean.pipe(Schema.withDecodingDefaultKey(Effect.succeed(false)))
  }).annotate({ identifier: "ToolCallPart" }) as any

/**
 * Constructs a new tool call part.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const toolCallPart = <const Name extends string, Params>(
  params: ConstructorParams<ToolCallPart<Name, Params>>
): ToolCallPart<Name, Params> => makePart("tool-call", params)

// =============================================================================
// Tool Call Result Part
// =============================================================================

/**
 * The base fields of a tool result part.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface BaseToolResult<Name extends string> extends BasePart<"tool-result", ToolResultPartMetadata> {
  /**
   * Unique identifier matching the original tool call.
   */
  readonly id: string
  /**
   * Name of the tool being called, which corresponds to the name of the tool
   * in the `Toolkit` included with the request.
   */
  readonly name: Name
  /**
   * The encoded result for serialization purposes.
   */
  readonly encodedResult: unknown
  /**
   * Whether the tool was executed by the provider (true) or framework (false).
   */
  readonly providerExecuted: boolean
  /**
   * Whether this is a preliminary (intermediate) result.
   *
   * **Details**
   *
   * Preliminary results represent progress updates during streaming tool
   * execution. Only the final result (where `preliminary` is `false` or
   * `undefined`) should be used as the authoritative output.
   *
   * **Gotchas**
   *
   * Only applicable for framework-executed tools during streaming.
   */
  readonly preliminary: boolean
}

/**
 * Represents a successful tool call result.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ToolResultSuccess<Name extends string, Success> extends BaseToolResult<Name> {
  /**
   * The decoded success returned by the tool execution.
   */
  readonly result: Success
  /**
   * Whether or not the result of executing the tool call handler was an error.
   */
  readonly isFailure: false
}

/**
 * Represents a failed tool call result.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ToolResultFailure<Name extends string, Failure> extends BaseToolResult<Name> {
  /**
   * The decoded failure returned by the tool execution.
   */
  readonly result: Failure
  /**
   * Whether or not the result of executing the tool call handler was an error.
   */
  readonly isFailure: true
}

/**
 * Response part representing the result of a tool call.
 *
 * **Example** (Creating a tool result part)
 *
 * ```ts import.meta.vitest
 * import { Response } from "effect/ai"
 *
 * interface WeatherData {
 *   temperature: number
 *   condition: string
 *   humidity: number
 * }
 *
 * const toolResultPart: Response.ToolResultPart<
 *   "get_weather",
 *   WeatherData,
 *   never
 * > = Response.toolResultPart({
 *   id: "call_123",
 *   name: "get_weather",
 *   isFailure: false,
 *   result: {
 *     temperature: 22,
 *     condition: "sunny",
 *     humidity: 65
 *   },
 *   encodedResult: {
 *     temperature: 22,
 *     condition: "sunny",
 *     humidity: 65
 *   },
 *   providerExecuted: false,
 *   preliminary: false
 * })
 * const result = [toolResultPart.name, toolResultPart.result.temperature] // => ["get_weather", 22]
 * ```
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ToolResultPart<Name extends string, Success, Failure> =
  | ToolResultSuccess<Name, Success>
  | ToolResultFailure<Name, Failure>

/**
 * Encoded representation of tool result parts for serialization.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ToolResultPartEncoded extends BasePartEncoded<"tool-result", ToolResultPartMetadata> {
  /**
   * Unique identifier matching the original tool call.
   */
  readonly id: string
  /**
   * Name of the tool being called, which corresponds to the name of the tool
   * in the `Toolkit` included with the request.
   */
  readonly name: string
  /**
   * The result returned by the tool execution.
   */
  readonly result: unknown
  /**
   * Whether or not the result of executing the tool call handler was an error.
   */
  readonly isFailure: boolean
  /**
   * Whether the tool was executed by the provider (true) or framework (false).
   */
  readonly providerExecuted?: boolean | undefined
  /**
   * Whether this is a preliminary (intermediate) result.
   *
   * **Gotchas**
   *
   * Only applicable for framework-executed tools during streaming.
   */
  readonly preliminary?: boolean | undefined
}

/**
 * Represents provider-specific metadata that can be associated with a
 * `ToolResultPart` through module augmentation.
 *
 * @stability unstable
 * @category configuration
 * @since 4.0.0
 */
export interface ToolResultPartMetadata extends ProviderMetadata {}

/**
 * Creates a Schema for tool result parts with specific tool name and result type.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ToolResultPart = <
  const Name extends string,
  Success extends Schema.Constraint,
  Failure extends Schema.Constraint
>(
  name: Name,
  success: Success,
  failure: Failure
): Schema.Codec<
  ToolResultPart<Name, Success["Type"], Failure["Type"]>,
  ToolResultPartEncoded,
  Success["DecodingServices"] | Failure["DecodingServices"],
  Success["EncodingServices"] | Failure["EncodingServices"]
> => {
  const makeSchema = (result: Schema.Constraint, isFailure: boolean) => {
    const encodedResult = Schema.toEncoded(result)
    const Common = {
      id: Schema.String,
      type: Schema.Literal("tool-result"),
      isFailure: Schema.Literal(isFailure),
      name: Schema.Literal(name)
    }
    const Decoded = Schema.Struct({
      ...Common,
      [PartTypeId]: Schema.Literal(PartTypeId),
      result,
      providerExecuted: Schema.Boolean,
      metadata: ProviderMetadata,
      encodedResult,
      preliminary: Schema.Boolean
    })
    const Encoded = Schema.Struct({
      ...Common,
      result: encodedResult,
      providerExecuted: Schema.optional(Schema.Boolean),
      metadata: Schema.optional(ProviderMetadata),
      preliminary: Schema.optional(Schema.Boolean)
    })
    return Decoded.pipe(Schema.encodeTo(
      Encoded,
      SchemaTransformation.transform({
        decode: (encoded) => ({
          ...encoded,
          [PartTypeId]: PartTypeId,
          providerExecuted: encoded.providerExecuted ?? false,
          metadata: encoded.metadata ?? {},
          encodedResult: encoded.result,
          preliminary: encoded.preliminary ?? false
        }),
        encode: identity
      })
    ))
  }
  return Schema.Union([makeSchema(success, false), makeSchema(failure, true)]).annotate({
    identifier: `ToolResultPart(${name})`
  })
}

/**
 * Constructs a new tool result part.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const toolResultPart = <const Params extends ConstructorParams<ToolResultPart<string, unknown, unknown>>>(
  params: Params
): Params extends {
  readonly name: infer Name extends string
  readonly isFailure: false
  readonly result: infer Success
} ? ToolResultPart<Name, Success, never>
  : Params extends {
    readonly name: infer Name extends string
    readonly isFailure: true
    readonly result: infer Failure
  } ? ToolResultPart<Name, never, Failure>
  : never => makePart("tool-result", params) as any

// =============================================================================
// Tool Approval Request Part
// =============================================================================

/**
 * Response part representing a tool approval request.
 *
 * **Details**
 *
 * Emitted when a tool requires user approval before execution. The framework
 * checks the tool's `needsApproval` property and emits this part instead of
 * executing the tool when approval is required.
 *
 * **Example** (Creating an approval request part)
 *
 * ```ts import.meta.vitest
 * import { Response } from "effect/ai"
 *
 * const approvalRequest: Response.ToolApprovalRequestPart = Response.makePart(
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
export interface ToolApprovalRequestPart extends BasePart<"tool-approval-request", ToolApprovalRequestPartMetadata> {
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
  extends BasePartEncoded<"tool-approval-request", ToolApprovalRequestPartMetadata>
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
 * Represents provider-specific metadata that can be associated with a
 * `ToolApprovalRequestPart` through module augmentation.
 *
 * @stability unstable
 * @category configuration
 * @since 4.0.0
 */
export interface ToolApprovalRequestPartMetadata extends ProviderMetadata {}

/**
 * Schema for validation and encoding of tool approval request parts.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ToolApprovalRequestPart: Schema.Struct<{
  readonly type: Schema.tag<"tool-approval-request">
  readonly approvalId: Schema.String
  readonly toolCallId: Schema.String
  readonly "~effect/ai/Response/Part": Schema.withDecodingDefaultKey<Schema.tag<"~effect/ai/Response/Part">>
  readonly metadata: Schema.withDecodingDefault<
    Schema.$Record<Schema.String, Schema.Codec<Schema.Json>>
  >
}> = Schema.Struct({
  ...BasePart.fields,
  type: Schema.tag("tool-approval-request"),
  approvalId: Schema.String,
  toolCallId: Schema.String
}).annotate({ identifier: "ToolApprovalRequestPart" }) satisfies Schema.Codec<
  ToolApprovalRequestPart,
  ToolApprovalRequestPartEncoded
>

/**
 * Constructs a new tool approval request part.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const toolApprovalRequestPart = (
  params: ConstructorParams<ToolApprovalRequestPart>
): ToolApprovalRequestPart => makePart("tool-approval-request", params as any)

// =============================================================================
// File Part
// =============================================================================

/**
 * Response part representing a file attachment.
 *
 * **Details**
 *
 * Supports various file types including images, documents, and binary data.
 *
 * **Example** (Creating a file part)
 *
 * ```ts import.meta.vitest
 * import { Response } from "effect/ai"
 *
 * const imagePart: Response.FilePart = Response.makePart("file", {
 *   mediaType: "image/jpeg",
 *   data: new Uint8Array([1, 2, 3])
 * })
 * const result = [imagePart.mediaType, imagePart.data] // => ["image/jpeg", new Uint8Array([1, 2, 3])]
 * ```
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface FilePart extends BasePart<"file", FilePartMetadata> {
  /**
   * MIME type of the file (e.g., "image/jpeg", "application/pdf").
   */
  readonly mediaType: string
  /**
   * File data as a byte array.
   */
  readonly data: Uint8Array
}

/**
 * Encoded representation of file parts for serialization.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface FilePartEncoded extends BasePartEncoded<"file", FilePartMetadata> {
  /**
   * MIME type of the file (e.g., "image/jpeg", "application/pdf").
   */
  readonly mediaType: string
  /**
   * File data as a base64 string.
   */
  readonly data: string
}

/**
 * Represents provider-specific metadata that can be associated with a
 * `FilePart` through module augmentation.
 *
 * @stability unstable
 * @category configuration
 * @since 4.0.0
 */
export interface FilePartMetadata extends ProviderMetadata {}

/**
 * Schema for validation and encoding of file parts.
 *
 * **Details**
 *
 * Decoded `data` is a `Uint8Array`; encoded `data` is a base64 string through
 * `Schema.Uint8ArrayFromBase64`.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const FilePart: Schema.Struct<{
  readonly type: Schema.tag<"file">
  readonly mediaType: Schema.String
  readonly data: Schema.Uint8ArrayFromBase64
  readonly "~effect/ai/Response/Part": Schema.withDecodingDefaultKey<Schema.tag<"~effect/ai/Response/Part">>
  readonly metadata: Schema.withDecodingDefault<
    Schema.$Record<Schema.String, Schema.Codec<Schema.Json>>
  >
}> = Schema.Struct({
  ...BasePart.fields,
  type: Schema.tag("file"),
  mediaType: Schema.String,
  data: Schema.Uint8ArrayFromBase64
}).annotate({ identifier: "FilePart" }) satisfies Schema.Codec<FilePart, FilePartEncoded>

// =============================================================================
// Document Source Part
// =============================================================================

/**
 * Response part representing a document source reference used in generating the
 * response.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface DocumentSourcePart extends BasePart<"source", DocumentSourcePartMetadata> {
  /**
   * Type discriminator for document sources.
   */
  readonly sourceType: "document"
  /**
   * Unique identifier for the document.
   */
  readonly id: string
  /**
   * MIME type of the document.
   */
  readonly mediaType: string
  /**
   * Display title of the document.
   */
  readonly title: string
  /**
   * Optional filename of the document.
   */
  readonly fileName?: string
}

/**
 * Encoded representation of document source parts for serialization.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface DocumentSourcePartEncoded extends BasePartEncoded<"source", DocumentSourcePartMetadata> {
  /**
   * Type discriminator for document sources.
   */
  readonly sourceType: "document"
  /**
   * Unique identifier for the document.
   */
  readonly id: string
  /**
   * MIME type of the document.
   */
  readonly mediaType: string
  /**
   * Display title of the document.
   */
  readonly title: string
  /**
   * Optional filename of the document.
   */
  readonly fileName?: string
}

/**
 * Represents provider-specific metadata that can be associated with a
 * `DocumentSourcePart` through module augmentation.
 *
 * @stability unstable
 * @category configuration
 * @since 4.0.0
 */
export interface DocumentSourcePartMetadata extends ProviderMetadata {}

/**
 * Schema for validation and encoding of document source parts.
 *
 * **When to use**
 *
 * Use to validate or encode document source references returned as response
 * content parts.
 *
 * **Details**
 *
 * Validates `type: "source"`, `sourceType: "document"`, required `id`,
 * `mediaType`, and `title`, optional `fileName`, and the metadata fields
 * inherited from response parts.
 *
 * @see {@link UrlSourcePart} for URL source references
 * @see {@link DocumentSourcePartEncoded} for the encoded document source representation
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const DocumentSourcePart: Schema.Struct<{
  readonly type: Schema.tag<"source">
  readonly sourceType: Schema.tag<"document">
  readonly id: Schema.String
  readonly mediaType: Schema.String
  readonly title: Schema.String
  readonly fileName: Schema.optionalKey<Schema.String>
  readonly "~effect/ai/Response/Part": Schema.withDecodingDefaultKey<Schema.tag<"~effect/ai/Response/Part">>
  readonly metadata: Schema.withDecodingDefault<
    Schema.$Record<Schema.String, Schema.Codec<Schema.Json>>
  >
}> = Schema.Struct({
  ...BasePart.fields,
  type: Schema.tag("source"),
  sourceType: Schema.tag("document"),
  id: Schema.String,
  mediaType: Schema.String,
  title: Schema.String,
  fileName: Schema.optionalKey(Schema.String)
}).annotate({ identifier: "DocumentSourcePart" }) satisfies Schema.Codec<DocumentSourcePart, DocumentSourcePartEncoded>

// =============================================================================
// Url Source Part
// =============================================================================

/**
 * Response part representing a URL source reference used in generating the
 * response.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface UrlSourcePart extends BasePart<"source", UrlSourcePartMetadata> {
  /**
   * Type discriminator for URL sources.
   */
  readonly sourceType: "url"
  /**
   * Unique identifier for the URL.
   */
  readonly id: string
  /**
   * The URL that was referenced.
   */
  readonly url: URL
  /**
   * Display title of the URL content.
   */
  readonly title: string
}

/**
 * Encoded representation of URL source parts for serialization.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface UrlSourcePartEncoded extends BasePartEncoded<"source", UrlSourcePartMetadata> {
  /**
   * Type discriminator for URL sources.
   */
  readonly sourceType: "url"
  /**
   * Unique identifier for the URL.
   */
  readonly id: string
  /**
   * The URL that was referenced as a string.
   */
  readonly url: string
  /**
   * Display title of the URL content.
   */
  readonly title: string
}

/**
 * Represents provider-specific metadata that can be associated with a
 * `UrlSourcePart` through module augmentation.
 *
 * @stability unstable
 * @category configuration
 * @since 4.0.0
 */
export interface UrlSourcePartMetadata extends ProviderMetadata {}

/**
 * Schema for validation and encoding of url source parts.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const UrlSourcePart: Schema.Struct<{
  readonly type: Schema.tag<"source">
  readonly sourceType: Schema.tag<"url">
  readonly id: Schema.String
  readonly url: Schema.URLFromString
  readonly title: Schema.String
  readonly "~effect/ai/Response/Part": Schema.withDecodingDefaultKey<Schema.tag<"~effect/ai/Response/Part">>
  readonly metadata: Schema.withDecodingDefault<
    Schema.$Record<Schema.String, Schema.Codec<Schema.Json>>
  >
}> = Schema.Struct({
  ...BasePart.fields,
  type: Schema.tag("source"),
  sourceType: Schema.tag("url"),
  id: Schema.String,
  url: Schema.URLFromString,
  title: Schema.String
}).annotate({ identifier: "UrlSourcePart" }) satisfies Schema.Codec<UrlSourcePart, UrlSourcePartEncoded>

// =============================================================================
// HTTP Details
// =============================================================================

/**
 * Alias of {@link AiError.HttpRequestDetails}.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const HttpRequestDetails = AiError.HttpRequestDetails

/**
 * Alias of {@link AiError.HttpResponseDetails}.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const HttpResponseDetails = AiError.HttpResponseDetails

// =============================================================================
// Response Metadata Part
// =============================================================================

/**
 * Response part containing metadata about the large language model response.
 *
 * **Example** (Creating a metadata part)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 * import { Response } from "effect/ai"
 *
 * const metadataPart: Response.ResponseMetadataPart = Response.makePart(
 *   "response-metadata",
 *   {
 *     id: "resp_123",
 *     modelId: "gpt-4",
 *     timestamp: DateTime.makeUnsafe("2024-01-01T00:00:00Z"),
 *     request: undefined
 *   }
 * )
 * const result = [metadataPart.id, metadataPart.modelId] // => ["resp_123", "gpt-4"]
 * ```
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ResponseMetadataPart extends BasePart<"response-metadata", ResponseMetadataPartMetadata> {
  /**
   * Optional unique identifier for this specific response.
   */
  readonly id?: string | undefined
  /**
   * Optional identifier of the AI model that generated the response.
   */
  readonly modelId?: string | undefined
  /**
   * Optional timestamp when the response was generated.
   */
  readonly timestamp?: DateTime.Utc | undefined
  /**
   * Optional HTTP request details for the request made to the AI provider.
   */
  readonly request?: typeof HttpRequestDetails.Type | undefined
}

/**
 * Encoded representation of response metadata parts for serialization.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ResponseMetadataPartEncoded
  extends BasePartEncoded<"response-metadata", ResponseMetadataPartMetadata>
{
  /**
   * Optional unique identifier for this specific response.
   */
  readonly id?: string | undefined
  /**
   * Optional identifier of the AI model that generated the response.
   */
  readonly modelId?: string | undefined
  /**
   * Optional timestamp when the response was generated.
   */
  readonly timestamp?: string | undefined
  /**
   * Optional HTTP request details for the request made to the AI provider.
   */
  readonly request?: typeof HttpRequestDetails.Encoded | undefined
}

/**
 * Represents provider-specific metadata that can be associated with a
 * `ResponseMetadataPart` through module augmentation.
 *
 * @stability unstable
 * @category configuration
 * @since 4.0.0
 */
export interface ResponseMetadataPartMetadata extends ProviderMetadata {}

/**
 * Schema for validation and encoding of response metadata parts.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ResponseMetadataPart: Schema.Struct<{
  readonly type: Schema.tag<"response-metadata">
  readonly id: Schema.optional<Schema.String>
  readonly modelId: Schema.optional<Schema.String>
  readonly timestamp: Schema.optional<Schema.DateTimeUtcFromString>
  readonly request: Schema.optional<typeof HttpRequestDetails>
  readonly "~effect/ai/Response/Part": Schema.withDecodingDefaultKey<Schema.tag<"~effect/ai/Response/Part">>
  readonly metadata: Schema.withDecodingDefault<
    Schema.$Record<Schema.String, Schema.Codec<Schema.Json>>
  >
}> = Schema.Struct({
  ...BasePart.fields,
  type: Schema.tag("response-metadata"),
  id: Schema.optional(Schema.String),
  modelId: Schema.optional(Schema.String),
  timestamp: Schema.optional(Schema.DateTimeUtcFromString),
  request: Schema.optional(HttpRequestDetails)
}).annotate({ identifier: "ResponseMetadataPart" }) satisfies Schema.Codec<
  ResponseMetadataPart,
  ResponseMetadataPartEncoded
>

// =============================================================================
// Finish Part
// =============================================================================

/**
 * Represents the reason why a model finished generation of a response.
 *
 * **Details**
 *
 * Possible finish reasons:
 * - `"stop"`: The model generated a stop sequence.
 * - `"length"`: The model exceeded its token budget.
 * - `"content-filter"`: The model generated content which violated a content filter.
 * - `"tool-calls"`: The model triggered a tool call.
 * - `"error"`: The model encountered an error.
 * - `"pause"`: The model requested to pause execution.
 * - `"other"`: The model stopped for a reason not supported by this protocol.
 * - `"unknown"`: The model did not specify a finish reason.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export const FinishReason: Schema.Literals<[
  "stop",
  "length",
  "content-filter",
  "tool-calls",
  "error",
  "pause",
  "other",
  "unknown"
]> = Schema.Literals([
  "stop",
  "length",
  "content-filter",
  "tool-calls",
  "error",
  "pause",
  "other",
  "unknown"
])

/**
 * Type of the reason why a model stopped generating a response.
 *
 * **Details**
 *
 * Values include normal stops, token-limit stops, content filtering,
 * tool-call pauses, provider errors, and unknown provider-specific finish
 * reasons.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type FinishReason = typeof FinishReason.Type

/**
 * Represents usage information for a request to a large language model provider.
 *
 * **Details**
 *
 * If the model provider returns additional usage information than what is
 * specified here, you can generally find that information under the provider
 * metadata of the finish part of the response.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export class Usage extends Schema.Class<Usage>("effect/ai/AiResponse/Usage")({
  /**
   * Information about input (i.e. prompt) token utilization.
   */
  inputTokens: Schema.Struct({
    /**
     * The number of non-cached input (i.e. prompt) tokens used.
     */
    uncached: Schema.optional(Schema.Int),
    /**
     * The total of number of input (i.e. prompt) tokens used.
     */
    total: Schema.optional(Schema.Int),
    /**
     * The number of cached input (i.e. prompt) tokens read.
     */
    cacheRead: Schema.optional(Schema.Int),
    /**
     * The number of cached input (i.e. prompt) tokens written.
     */
    cacheWrite: Schema.optional(Schema.Int)
  }),
  /**
   * Information about the output (i.e. response) tokens used.
   */
  outputTokens: Schema.Struct({
    /**
     * The total of number of output (i.e. response) tokens used.
     */
    total: Schema.optional(Schema.Int),
    /**
     * The number of text tokens used.
     */
    text: Schema.optional(Schema.Int),
    /**
     * The number of reasoning tokens used.
     */
    reasoning: Schema.optional(Schema.Int)
  })
}) {}

/**
 * Response part indicating the completion of a response generation.
 *
 * **Example** (Creating a finish part)
 *
 * ```ts import.meta.vitest
 * import { Response } from "effect/ai"
 *
 * const finishPart: Response.FinishPart = Response.makePart("finish", {
 *   reason: "stop",
 *   usage: new Response.Usage({
 *     inputTokens: {
 *       uncached: undefined,
 *       total: 50,
 *       cacheRead: undefined,
 *       cacheWrite: undefined
 *     },
 *     outputTokens: {
 *       total: 25,
 *       text: undefined,
 *       reasoning: undefined
 *     }
 *   }),
 *   response: undefined
 * })
 * const result = [finishPart.reason, finishPart.usage.inputTokens.total] // => ["stop", 50]
 * ```
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface FinishPart extends BasePart<"finish", FinishPartMetadata> {
  /**
   * The reason why the model finished generating the response.
   */
  readonly reason: FinishReason
  /**
   * Token usage statistics for the request.
   */
  readonly usage: Usage
  /**
   * Optional HTTP response details from the AI provider.
   */
  readonly response?: typeof HttpResponseDetails.Type | undefined
}

/**
 * Encoded representation of finish parts for serialization.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface FinishPartEncoded extends BasePartEncoded<"finish", FinishPartMetadata> {
  /**
   * The reason why the model finished generating the response.
   */
  readonly reason: typeof FinishReason.Encoded
  /**
   * Token usage statistics for the request.
   */
  readonly usage: typeof Usage.Encoded
  /**
   * Optional HTTP response details from the AI provider.
   */
  readonly response?: typeof HttpResponseDetails.Encoded | undefined
}

/**
 * Represents provider-specific metadata that can be associated with a
 * `FinishPart` through module augmentation.
 *
 * @stability unstable
 * @category configuration
 * @since 4.0.0
 */
export interface FinishPartMetadata extends ProviderMetadata {}

/**
 * Schema for finish response parts.
 *
 * **Details**
 *
 * Validates `type: "finish"`, `reason` through `FinishReason`, `usage`
 * through `Usage`, and optional provider HTTP response details.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const FinishPart: Schema.Struct<{
  readonly type: Schema.tag<"finish">
  readonly reason: Schema.Literals<[
    "stop",
    "length",
    "content-filter",
    "tool-calls",
    "error",
    "pause",
    "other",
    "unknown"
  ]>
  readonly usage: typeof Usage
  readonly response: Schema.optional<typeof HttpResponseDetails>
  readonly "~effect/ai/Response/Part": Schema.withDecodingDefaultKey<Schema.tag<"~effect/ai/Response/Part">>
  readonly metadata: Schema.withDecodingDefault<
    Schema.$Record<Schema.String, Schema.Codec<Schema.Json>>
  >
}> = Schema.Struct({
  ...BasePart.fields,
  type: Schema.tag("finish"),
  reason: FinishReason,
  usage: Usage,
  response: Schema.optional(HttpResponseDetails)
}).annotate({ identifier: "FinishPart" }) satisfies Schema.Codec<FinishPart, FinishPartEncoded>

// =============================================================================
// Error Part
// =============================================================================

/**
 * Response part indicating that an error occurred generating the response.
 *
 * **Example** (Creating an error part)
 *
 * ```ts import.meta.vitest
 * import { Response } from "effect/ai"
 *
 * const errorPart: Response.ErrorPart = Response.makePart("error", {
 *   error: new Error("boom")
 * })
 * const result = [errorPart.type, errorPart.error instanceof Error] // => ["error", true]
 * ```
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ErrorPart extends BasePart<"error", ErrorPartMetadata> {
  readonly error: unknown
}

/**
 * Encoded representation of error parts for serialization.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ErrorPartEncoded extends BasePartEncoded<"error", ErrorPartMetadata> {
  readonly error: unknown
}

/**
 * Represents provider-specific metadata that can be associated with a
 * `ErrorPart` through module augmentation.
 *
 * @stability unstable
 * @category configuration
 * @since 4.0.0
 */
export interface ErrorPartMetadata extends ProviderMetadata {}

/**
 * Schema for validation and encoding of error parts.
 *
 * **Details**
 *
 * Validates and encodes error parts with `type: "error"` and an `error` payload
 * kept as `unknown`.
 *
 * **Gotchas**
 *
 * The decoded `error` value is not guaranteed to be an `Error`; narrow it before
 * reading `Error`-specific fields.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ErrorPart: Schema.Struct<{
  readonly type: Schema.tag<"error">
  readonly error: Schema.Unknown
  readonly "~effect/ai/Response/Part": Schema.withDecodingDefaultKey<Schema.tag<"~effect/ai/Response/Part">>
  readonly metadata: Schema.withDecodingDefault<
    Schema.$Record<Schema.String, Schema.Codec<Schema.Json>>
  >
}> = Schema.Struct({
  ...BasePart.fields,
  type: Schema.tag("error"),
  error: Schema.Unknown
}).annotate({ identifier: "ErrorPart" }) satisfies Schema.Codec<ErrorPart, ErrorPartEncoded>
