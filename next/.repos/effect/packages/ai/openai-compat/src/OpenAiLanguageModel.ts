/**
 * The `OpenAiLanguageModel` module adapts OpenAI-compatible chat completions
 * providers to Effect AI's `LanguageModel` service. It builds a model service
 * from a model id, translates prompts, files, tools, structured output schemas,
 * and provider-specific options into `OpenAiClient` requests, and maps normal
 * or streaming chat completion results back into Effect AI response content and
 * metadata.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as AiError from "effect/ai/AiError"
import * as LanguageModel from "effect/ai/LanguageModel"
import * as AiModel from "effect/ai/Model"
import { toCodecOpenAI } from "effect/ai/OpenAiStructuredOutput"
import * as Prompt from "effect/ai/Prompt"
import type * as Response from "effect/ai/Response"
import * as Tool from "effect/ai/Tool"
import * as Arr from "effect/Array"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Base64 from "effect/encoding/Base64"
import { dual } from "effect/Function"
import type * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as Layer from "effect/Layer"
import * as Predicate from "effect/Predicate"
import * as Rec from "effect/Record"
import * as Redactable from "effect/Redactable"
import * as Schema from "effect/Schema"
import * as AST from "effect/SchemaAST"
import * as Stream from "effect/Stream"
import type { Span } from "effect/Tracer"
import type { Simplify } from "effect/Types"
import * as InternalUtilities from "./internal/utilities.ts"
import {
  type Annotation,
  type ChatCompletionContentPart,
  type ChatCompletionRequestMessage,
  type ChatCompletionRequestToolCall,
  type CreateResponse,
  type CreateResponse200,
  type CreateResponse200Sse,
  type CreateResponseRequestJson,
  type InputContent,
  type MessageStatus,
  OpenAiClient,
  type TextResponseFormatConfiguration,
  type Tool as OpenAiClientTool,
  type UnknownChatCompletionEvent
} from "./OpenAiClient.ts"
import { addGenAIAnnotations } from "./OpenAiTelemetry.ts"

/**
 * Image detail level for vision requests.
 */
type ImageDetail = "auto" | "low" | "high"

// =============================================================================
// Configuration
// =============================================================================

type ConfigOptions = Simplify<
  & Partial<
    Omit<CreateResponse, "input" | "tools" | "tool_choice" | "stream" | "text" | "store" | "conversation">
  >
  & {
    /**
     * File ID prefixes used to identify file IDs in Responses API.
     * When undefined, all file data is treated as base64 content.
     *
     * Examples:
     * - OpenAI: ['file-'] for IDs like 'file-abc123'
     * - Azure OpenAI: ['assistant-'] for IDs like 'assistant-abc123'
     */
    readonly fileIdPrefixes?: ReadonlyArray<string> | undefined
    /**
     * Configuration options for a text response from the model.
     */
    readonly text?: {
      /**
       * Constrains the verbosity of the model's response. Lower values will
       * result in more concise responses, while higher values will result in
       * more verbose responses.
       *
       * Defaults to `"medium"`.
       */
      readonly verbosity?: "low" | "medium" | "high" | undefined
    } | undefined
    /**
     * Whether to use strict JSON schema validation.
     *
     * Defaults to `true`.
     */
    readonly strictJsonSchema?: boolean | undefined
  }
>
type ModelConfig = Omit<ConfigOptions, "model"> & { readonly [x: string]: unknown }

/**
 * Context service for OpenAI language model configuration.
 *
 * **When to use**
 *
 * Use as the context service for OpenAI-compatible language model request
 * configuration, especially when a scoped operation should override the defaults
 * supplied to `model`, `make`, or `layer`.
 *
 * @see {@link withConfigOverride} for scoping language model request overrides
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class Config extends Context.Service<
  Config,
  ConfigOptions & { readonly [x: string]: unknown }
>()("@effect/ai-openai-compat/OpenAiLanguageModel/Config") {}

// =============================================================================
// Provider Options / Metadata
// =============================================================================

declare module "effect/ai/Prompt" {
  /**
   * OpenAI-compatible options for file prompt parts.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface FilePartOptions extends ProviderOptions {
    /**
     * Provider-specific file options for OpenAI-compatible APIs.
     */
    readonly "openai-compat"?: {
      /**
       * The detail level of the image to be sent to the model. One of `high`, `low`, or `auto`. Defaults to `auto`.
       */
      readonly imageDetail?: ImageDetail | null
    } | null
  }

  /**
   * OpenAI-compatible options for reasoning prompt parts.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface ReasoningPartOptions extends ProviderOptions {
    /**
     * Provider-specific reasoning options for OpenAI-compatible APIs.
     */
    readonly "openai-compat"?: {
      /**
       * The ID of the item to reference.
       */
      readonly itemId?: string | null
      /**
       * The encrypted content of the reasoning item - populated when a response
       * is generated with `reasoning.encrypted_content` in the `include`
       * parameter.
       */
      readonly encryptedContent?: string | null
      /**
       * The chat message field the reasoning was returned under. Replayed
       * reasoning is sent back under the same field, defaulting to
       * `reasoning_content`.
       */
      readonly reasoningField?: "reasoning" | "reasoning_content" | null
    } | null
  }

  /**
   * OpenAI-compatible options for assistant tool-call prompt parts.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface ToolCallPartOptions extends ProviderOptions {
    /**
     * Provider-specific tool-call options for OpenAI-compatible APIs.
     */
    readonly "openai-compat"?: {
      /**
       * The ID of the item to reference.
       */
      readonly itemId?: string | null
      /**
       * The status to send for the tool-call item.
       */
      readonly status?: MessageStatus | null
      /**
       * Provider-specific extra content to echo back with the tool call.
       */
      readonly extraContent?: Schema.JsonObject | null
    } | null
  }

  /**
   * OpenAI-compatible options for tool-result prompt parts.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface ToolResultPartOptions extends ProviderOptions {
    /**
     * Provider-specific tool-result options for OpenAI-compatible APIs.
     */
    readonly "openai-compat"?: {
      /**
       * The ID of the item to reference.
       */
      readonly itemId?: string | null
      /**
       * The status to send for the tool-result item.
       */
      readonly status?: MessageStatus | null
    } | null
  }

  /**
   * OpenAI-compatible options for text prompt parts.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface TextPartOptions extends ProviderOptions {
    /**
     * Provider-specific text options for OpenAI-compatible APIs.
     */
    readonly "openai-compat"?: {
      /**
       * The ID of the item to reference.
       */
      readonly itemId?: string | null
      /**
       * The status to send for the text item.
       */
      readonly status?: MessageStatus | null
      /**
       * A list of annotations that apply to the output text.
       */
      readonly annotations?: ReadonlyArray<Annotation> | null
    } | null
  }
}

declare module "effect/ai/Response" {
  /**
   * OpenAI-compatible metadata attached to a complete text response part.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface TextPartMetadata extends ProviderMetadata {
    /**
     * Provider-specific metadata returned for the text part.
     */
    readonly "openai-compat"?: {
      /**
       * The OpenAI item ID associated with the text part.
       */
      readonly itemId?: string | null
      /**
       * If the model emits a refusal content part, the refusal explanation
       * from the model will be contained in the metadata of an empty text
       * part.
       */
      readonly refusal?: string | null
      /**
       * The status returned for the text item.
       */
      readonly status?: MessageStatus | null
      /**
       * The text content part annotations.
       */
      readonly annotations?: ReadonlyArray<Annotation> | null
    }
  }

  /**
   * OpenAI-compatible metadata emitted when a streamed text part starts.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface TextStartPartMetadata extends ProviderMetadata {
    /**
     * Provider-specific metadata returned for the streamed text start.
     */
    readonly "openai-compat"?: {
      /**
       * The OpenAI item ID associated with the streamed text part.
       */
      readonly itemId?: string | null
    } | null
  }

  /**
   * OpenAI-compatible metadata emitted when a streamed text part ends.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface TextEndPartMetadata extends ProviderMetadata {
    /**
     * Provider-specific metadata returned for the streamed text end.
     */
    readonly "openai-compat"?: {
      /**
       * The OpenAI item ID associated with the streamed text part.
       */
      readonly itemId?: string | null
      /**
       * The annotations collected for the completed streamed text part.
       */
      readonly annotations?: ReadonlyArray<Annotation> | null
    } | null
  }

  /**
   * OpenAI-compatible metadata attached to a complete reasoning response part.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface ReasoningPartMetadata extends ProviderMetadata {
    /**
     * Provider-specific metadata returned for the reasoning part.
     */
    readonly "openai-compat"?: {
      /**
       * The OpenAI item ID associated with the reasoning part.
       */
      readonly itemId?: string | null
      /**
       * Encrypted reasoning content that can be sent back in later requests.
       */
      readonly encryptedContent?: string | null
      /**
       * The chat message field the provider returned the reasoning under.
       */
      readonly reasoningField?: "reasoning" | "reasoning_content" | null
    } | null
  }

  /**
   * OpenAI-compatible metadata emitted when a streamed reasoning part starts.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface ReasoningStartPartMetadata extends ProviderMetadata {
    /**
     * Provider-specific metadata returned for the streamed reasoning start.
     */
    readonly "openai-compat"?: {
      /**
       * The OpenAI item ID associated with the reasoning part.
       */
      readonly itemId?: string | null
      /**
       * Encrypted reasoning content that can be sent back in later requests.
       */
      readonly encryptedContent?: string | null
      /**
       * The chat message field the provider returned the reasoning under.
       */
      readonly reasoningField?: "reasoning" | "reasoning_content" | null
    } | null
  }

  /**
   * OpenAI-compatible metadata emitted for a streamed reasoning delta.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface ReasoningDeltaPartMetadata extends ProviderMetadata {
    /**
     * Provider-specific metadata returned for the streamed reasoning delta.
     */
    readonly "openai-compat"?: {
      /**
       * The OpenAI item ID associated with the reasoning part.
       */
      readonly itemId?: string | null
    } | null
  }

  /**
   * OpenAI-compatible metadata emitted when a streamed reasoning part ends.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface ReasoningEndPartMetadata extends ProviderMetadata {
    /**
     * Provider-specific metadata returned for the streamed reasoning end.
     */
    readonly "openai-compat"?: {
      /**
       * The OpenAI item ID associated with the reasoning part.
       */
      readonly itemId?: string | null
      /**
       * Encrypted reasoning content that can be sent back in later requests.
       */
      readonly encryptedContent?: string
    } | null
  }

  /**
   * OpenAI-compatible metadata attached to tool-call response parts.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface ToolCallPartMetadata extends ProviderMetadata {
    /**
     * Provider-specific metadata returned for the tool call.
     */
    readonly "openai-compat"?: {
      /**
       * The OpenAI item ID associated with the tool call.
       */
      readonly itemId?: string | null
      /**
       * Provider-specific extra content returned with the tool call.
       */
      readonly extraContent?: Schema.JsonObject | null
    } | null
  }

  /**
   * OpenAI-compatible metadata attached to document source citations.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface DocumentSourcePartMetadata extends ProviderMetadata {
    /**
     * Provider-specific citation metadata for OpenAI-compatible APIs.
     */
    readonly "openai-compat"?:
      | {
        /**
         * Identifies a citation to an uploaded file.
         */
        readonly type: "file_citation"
        /**
         * The index of the file in the list of files.
         */
        readonly index: number
        /**
         * The ID of the file.
         */
        readonly fileId: string
      }
      | {
        /**
         * Identifies a citation to a generated file path.
         */
        readonly type: "file_path"
        /**
         * The index of the file in the list of files.
         */
        readonly index: number
        /**
         * The ID of the file.
         */
        readonly fileId: string
      }
      | {
        /**
         * Identifies a citation to a file inside a container.
         */
        readonly type: "container_file_citation"
        /**
         * The ID of the file.
         */
        readonly fileId: string
        /**
         * The ID of the container file.
         */
        readonly containerId: string
      }
      | null
  }

  /**
   * OpenAI-compatible metadata attached to URL source citations.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface UrlSourcePartMetadata extends ProviderMetadata {
    /**
     * Provider-specific URL citation metadata for OpenAI-compatible APIs.
     */
    readonly "openai-compat"?: {
      /**
       * Identifies a citation to a URL.
       */
      readonly type: "url_citation"
      /**
       * The index of the first character of the URL citation in the message.
       */
      readonly startIndex: number
      /**
       * The index of the last character of the URL citation in the message.
       */
      readonly endIndex: number
    } | null
  }

  /**
   * OpenAI-compatible metadata attached to finish response parts.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface FinishPartMetadata extends ProviderMetadata {
    /**
     * Provider-specific metadata returned when generation finishes.
     */
    readonly "openai-compat"?: {
      /**
       * The service tier reported by the OpenAI-compatible provider.
       */
      readonly serviceTier?: "default" | "auto" | "flex" | "scale" | "priority" | null
    } | null
  }
}

// =============================================================================
// Language Model
// =============================================================================

/**
 * Creates an OpenAI-compatible model descriptor that can be provided with `Effect.provide`.
 *
 * **When to use**
 *
 * Use when you want an OpenAI-compatible language model value that carries
 * provider and model metadata and can be supplied directly to an Effect program.
 *
 * @see {@link layer} for creating a `LanguageModel.LanguageModel` layer directly
 * @see {@link make} for constructing the language model service effectfully
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const model = (
  model: string,
  config?: ModelConfig
): AiModel.Model<"openai", LanguageModel.LanguageModel, OpenAiClient> =>
  AiModel.make("openai", model, layer({ model, config }))

// TODO
// /**
//  * @since 4.0.0
//  * @category constructors
//  */
// export const modelWithTokenizer = (
//   model: string,
//   config?: Omit<typeof Config.Service, "model">
// ): AiModel.Model<"openai", LanguageModel.LanguageModel | Tokenizer.Tokenizer, OpenAiClient> =>
//   AiModel.make("openai", model, layerWithTokenizer({ model, config }))

/**
 * Creates an OpenAI-compatible `LanguageModel` service from a model identifier and optional request defaults.
 *
 * **When to use**
 *
 * Use to construct an OpenAI-compatible chat-completions language model service
 * backed by `OpenAiClient`.
 *
 * **Details**
 *
 * The returned effect requires `OpenAiClient`. Request defaults from the
 * `config` option are merged with any `Config` service in the context, with
 * context values taking precedence. The service supports both `generateText` and
 * `streamText`.
 *
 * @see {@link layer} for providing the service as a `Layer`
 * @see {@link model} for creating a model descriptor for `AiModel.provide`
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = Effect.fnUntraced(function*({ model, config: providerConfig }: {
  readonly model: string
  readonly config?: ModelConfig | undefined
}): Effect.fn.Return<LanguageModel.LanguageModel, never, OpenAiClient> {
  const client = yield* OpenAiClient

  const makeConfig = Effect.contextWith((services: Context.Context<never>) =>
    Effect.succeed({ model, ...providerConfig, ...Context.getOrUndefined(services, Config) })
  )

  const makeRequest = Effect.fnUntraced(
    function*<Tools extends ReadonlyArray<Tool.Any>>({ config, options, toolNameMapper }: {
      readonly config: typeof Config.Service
      readonly options: LanguageModel.ProviderOptions
      readonly toolNameMapper: Tool.NameMapper<Tools>
    }): Effect.fn.Return<{
      readonly request: CreateResponseRequestJson
      readonly toolCodecs: ToolCodecs
    }, AiError.AiError> {
      const messages = yield* prepareMessages({
        config,
        options,
        toolNameMapper
      })
      const { toolChoice, toolCodecs, tools } = yield* prepareTools({
        config,
        options,
        toolNameMapper
      })
      const responseFormat = yield* prepareResponseFormat({
        config,
        options
      })
      const { fileIdPrefixes: _fip, strictJsonSchema: _sjs, ...apiConfig } = config
      const request: CreateResponse = {
        ...apiConfig,
        text: {
          verbosity: config.text?.verbosity ?? null,
          format: responseFormat
        },
        ...(tools !== undefined ? { tools } : undefined),
        ...(toolChoice !== undefined ? { tool_choice: toolChoice } : undefined)
      }
      return { request: toChatCompletionsRequest(request, messages), toolCodecs }
    }
  )

  return yield* LanguageModel.make({
    codecTransformer: toCodecOpenAI,
    generateText: Effect.fnUntraced(
      function*(options) {
        const config = yield* makeConfig
        const toolNameMapper = new Tool.NameMapper(options.tools)
        const { request, toolCodecs } = yield* makeRequest({ config, options, toolNameMapper })
        annotateRequest(options.span, request)
        const [rawResponse, response] = yield* client.createResponse(request)
        annotateResponse(options.span, rawResponse)
        return yield* makeResponse({
          options,
          rawResponse,
          response,
          toolNameMapper,
          toolCodecs
        })
      }
    ),
    streamText: Effect.fnUntraced(
      function*(options) {
        const config = yield* makeConfig
        const toolNameMapper = new Tool.NameMapper(options.tools)
        const { request, toolCodecs } = yield* makeRequest({ config, options, toolNameMapper })
        annotateRequest(options.span, request)
        const [response, stream] = yield* client.createResponseStream(request)
        return yield* makeStreamResponse({
          options,
          stream,
          response,
          toolNameMapper,
          toolCodecs
        })
      },
      (effect, options) =>
        effect.pipe(
          Stream.unwrap,
          Stream.map((response) => {
            annotateStreamResponse(options.span, response)
            return response
          })
        )
    )
  })
})

/**
 * Creates a layer for the OpenAI-compatible language model.
 *
 * **When to use**
 *
 * Use when composing application layers and you want OpenAI-compatible APIs to
 * satisfy `LanguageModel.LanguageModel` while supplying `OpenAiClient` from
 * another layer.
 *
 * @see {@link make} for constructing the language model service effectfully
 * @see {@link model} for creating an AI model descriptor
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer = (options: {
  readonly model: string
  readonly config?: ModelConfig | undefined
}): Layer.Layer<LanguageModel.LanguageModel, never, OpenAiClient> =>
  Layer.effect(LanguageModel.LanguageModel, make(options))

/**
 * Provides scoped config overrides for OpenAI-compatible language model operations.
 *
 * **When to use**
 *
 * Use to override request configuration for a single language model effect
 * without changing the defaults supplied to `model`, `make`, or `layer`.
 *
 * **Details**
 *
 * Existing `Config` values from the Effect context are merged with `overrides`,
 * and the override values take precedence.
 *
 * @see {@link Config} for the configuration shape
 *
 * @stability unstable
 * @category configuration
 * @since 4.0.0
 */
export const withConfigOverride: {
  (overrides: typeof Config.Service): <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, Exclude<R, Config>>
  <A, E, R>(self: Effect.Effect<A, E, R>, overrides: typeof Config.Service): Effect.Effect<A, E, Exclude<R, Config>>
} = dual<
  (
    overrides: typeof Config.Service
  ) => <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, Exclude<R, Config>>,
  <A, E, R>(self: Effect.Effect<A, E, R>, overrides: typeof Config.Service) => Effect.Effect<A, E, Exclude<R, Config>>
>(2, (self, overrides) =>
  Effect.flatMap(
    Effect.serviceOption(Config),
    (config) =>
      Effect.provideService(self, Config, {
        ...(config._tag === "Some" ? config.value : {}),
        ...overrides
      })
  ))

// =============================================================================
// Prompt Conversion
// =============================================================================

const getSystemMessageMode = (model: string): "system" | "developer" =>
  model.startsWith("o") ||
    model.startsWith("gpt-5") ||
    model.startsWith("codex-") ||
    model.startsWith("computer-use")
    ? "developer"
    : "system"

const prepareMessages = Effect.fnUntraced(
  function*<Tools extends ReadonlyArray<Tool.Any>>({
    config,
    options,
    toolNameMapper
  }: {
    readonly config: typeof Config.Service
    readonly options: LanguageModel.ProviderOptions
    readonly toolNameMapper: Tool.NameMapper<Tools>
  }): Effect.fn.Return<ReadonlyArray<ChatCompletionRequestMessage>, AiError.AiError> {
    const messages: Array<ChatCompletionRequestMessage> = []

    for (const message of options.prompt.content) {
      switch (message.role) {
        case "system": {
          messages.push({
            role: getSystemMessageMode(config.model!),
            content: message.content
          })
          break
        }

        case "user": {
          const content: Array<InputContent> = []

          for (let index = 0; index < message.content.length; index++) {
            const part = message.content[index]

            switch (part.type) {
              case "text": {
                content.push({ type: "input_text", text: part.text })
                break
              }

              case "file": {
                if (part.mediaType.startsWith("image/")) {
                  const detail = getImageDetail(part)
                  const mediaType = part.mediaType === "image/*" ? "image/jpeg" : part.mediaType

                  if (typeof part.data === "string" && isFileId(part.data, config)) {
                    content.push({ type: "input_image", file_id: part.data, detail })
                  } else {
                    const imageUrl = part.data instanceof URL
                      ? part.data.toString()
                      : part.data instanceof Uint8Array
                      ? `data:${mediaType};base64,${Base64.encode(part.data)}`
                      : /^(data:|https?:\/\/)/i.test(part.data)
                      ? part.data
                      : `data:${mediaType};base64,${part.data}`
                    content.push({ type: "input_image", image_url: imageUrl, detail })
                  }
                } else if (part.mediaType === "application/pdf") {
                  if (typeof part.data === "string" && isFileId(part.data, config)) {
                    content.push({ type: "input_file", file_id: part.data })
                  }

                  if (part.data instanceof URL) {
                    content.push({ type: "input_file", file_url: part.data.toString() })
                  }

                  if (part.data instanceof Uint8Array) {
                    const base64 = Base64.encode(part.data)
                    const fileName = part.fileName ?? `part-${index}.pdf`
                    const fileData = `data:application/pdf;base64,${base64}`
                    content.push({ type: "input_file", filename: fileName, file_data: fileData })
                  }
                } else {
                  return yield* AiError.make({
                    module: "OpenAiLanguageModel",
                    method: "prepareMessages",
                    reason: new AiError.InvalidRequestError({
                      description: `Detected unsupported media type for file: '${part.mediaType}'`
                    })
                  })
                }
              }
            }
          }

          messages.push({ role: "user", content: toChatMessageContent(content) })

          break
        }

        case "assistant": {
          let content: string | null = null
          let reasoning = ""
          let reasoningField: ReasoningField | undefined
          const toolCalls: Array<ChatCompletionRequestToolCall> = []

          for (const part of message.content) {
            switch (part.type) {
              case "text": {
                content = (content ?? "") + part.text
                break
              }

              case "reasoning": {
                reasoning += part.text
                reasoningField ??= part.options["openai-compat"]?.reasoningField ?? undefined
                break
              }

              case "tool-call": {
                if (part.providerExecuted) {
                  break
                }

                const extraContent = getExtraContent(part)

                toolCalls.push({
                  id: part.id,
                  type: "function",
                  function: {
                    name: toolNameMapper.getProviderName(part.name),
                    arguments: JSON.stringify(part.params)
                  },
                  ...(Predicate.isNotNull(extraContent) ? { extra_content: extraContent } : undefined)
                })
                break
              }
            }
          }

          // Text, reasoning and tool calls from one prompt message are sent as a
          // single chat message so reasoning stays attached to its tool calls
          if (content !== null || toolCalls.length > 0) {
            messages.push({
              role: "assistant",
              content,
              ...(reasoning.length > 0 ? { [reasoningField ?? "reasoning_content"]: reasoning } : undefined),
              ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : undefined)
            })
          }

          break
        }

        case "tool": {
          for (const part of message.content) {
            if (part.type === "tool-approval-response") {
              continue
            }

            messages.push({
              role: "tool",
              tool_call_id: part.id,
              content: Predicate.isNotUndefined(part.modelOutput)
                ? Prompt.toolModelOutputToText(part.modelOutput)
                : typeof part.result === "string"
                ? part.result
                : JSON.stringify(part.result)
            })
          }

          break
        }
      }
    }

    return messages
  }
)

// =============================================================================
// HTTP Details
// =============================================================================

const buildHttpResponseDetails = (
  response: HttpClientResponse.HttpClientResponse
): typeof Response.HttpResponseDetails.Type => ({
  status: response.status,
  headers: Redactable.redact(response.headers) as Record<string, string>
})

// =============================================================================
// Response Conversion
// =============================================================================

type ResponseStreamEvent = CreateResponse200Sse

const isUnknownChatCompletionEvent = (
  event: ResponseStreamEvent
): event is UnknownChatCompletionEvent =>
  typeof event !== "string" && "_tag" in event && event._tag === "UnknownChatCompletionEvent"

type ActiveToolCall = {
  readonly id: string
  name: string
  arguments: string
  extraContent: Schema.JsonObject | undefined
}

const makeResponse = Effect.fnUntraced(
  function*<Tools extends ReadonlyArray<Tool.Any>>({
    options,
    rawResponse,
    response,
    toolNameMapper,
    toolCodecs
  }: {
    readonly options: LanguageModel.ProviderOptions
    readonly rawResponse: CreateResponse200
    readonly response: HttpClientResponse.HttpClientResponse
    readonly toolNameMapper: Tool.NameMapper<Tools>
    readonly toolCodecs: ToolCodecs
  }): Effect.fn.Return<
    Array<Response.PartEncoded>,
    AiError.AiError
  > {
    let hasToolCalls = false
    const parts: Array<Response.PartEncoded> = []

    const createdAt = new Date(rawResponse.created * 1000)
    parts.push({
      type: "response-metadata",
      id: rawResponse.id,
      modelId: rawResponse.model as string,
      timestamp: DateTime.formatIso(DateTime.fromDateUnsafe(createdAt))
    })

    const choice = rawResponse.choices[0]
    const message = choice?.message

    if (message !== undefined) {
      const reasoningField = getResponseReasoningField(message)
      const reasoning = reasoningField !== undefined ? message[reasoningField] : undefined
      if (reasoningField !== undefined && Predicate.isNotNullish(reasoning) && reasoning.length > 0) {
        parts.push({ type: "reasoning", text: reasoning, metadata: { "openai-compat": { reasoningField } } })
      }

      if (
        message.content !== undefined && Predicate.isNotNull(message.content) && message.content.length > 0
      ) {
        parts.push({ type: "text", text: message.content })
      }

      if (message.tool_calls !== undefined) {
        for (const [index, toolCall] of message.tool_calls.entries()) {
          const toolId = toolCall.id ?? `${rawResponse.id}_tool_${index}`
          const toolName = toolNameMapper.getCustomName(toolCall.function?.name ?? "unknown_tool")
          const toolParamsJson = toolCall.function?.arguments ?? "{}"
          const toolParams = yield* Effect.try({
            try: () => Tool.unsafeSecureJsonParse(toolParamsJson),
            catch: (cause) =>
              AiError.make({
                module: "OpenAiLanguageModel",
                method: "makeResponse",
                reason: new AiError.ToolParameterValidationError({
                  toolName,
                  description: `Failed to securely JSON parse tool parameters: ${cause}`
                })
              })
          })
          const params = yield* transformToolCallParams(options, toolName, toolParams, toolCodecs)
          hasToolCalls = true
          parts.push({
            type: "tool-call",
            id: toolId,
            name: toolName,
            params,
            metadata: {
              "openai-compat": {
                ...makeItemIdMetadata(toolCall.id),
                ...makeExtraContentMetadata(toolCall.extra_content ?? undefined)
              }
            }
          })
        }
      }
    }

    const finishReason = InternalUtilities.resolveFinishReason(
      choice?.finish_reason,
      hasToolCalls
    )
    const serviceTier = normalizeServiceTier(rawResponse.service_tier)

    parts.push({
      type: "finish",
      reason: finishReason,
      usage: getUsage(rawResponse.usage),
      response: buildHttpResponseDetails(response),
      ...(serviceTier !== undefined && { metadata: { "openai-compat": { serviceTier } } })
    })

    return parts
  }
)

const makeStreamResponse = Effect.fnUntraced(
  function*<Tools extends ReadonlyArray<Tool.Any>>({
    options,
    stream,
    response,
    toolNameMapper,
    toolCodecs
  }: {
    readonly options: LanguageModel.ProviderOptions
    readonly stream: Stream.Stream<ResponseStreamEvent, AiError.AiError>
    readonly response: HttpClientResponse.HttpClientResponse
    readonly toolNameMapper: Tool.NameMapper<Tools>
    readonly toolCodecs: ToolCodecs
  }): Effect.fn.Return<
    Stream.Stream<Response.StreamPartEncoded, AiError.AiError>,
    AiError.AiError
  > {
    let serviceTier: string | undefined = undefined
    let usage: CreateResponse200["usage"] = undefined
    let finishReason: string | null | undefined = undefined
    let metadataEmitted = false
    let textStarted = false
    let textId = ""
    let reasoningStarted = false
    let reasoningId = ""
    let hasToolCalls = false
    const activeToolCalls: Record<number, ActiveToolCall> = {}

    return stream.pipe(
      Stream.mapEffect(Effect.fnUntraced(function*(event) {
        const parts: Array<Response.StreamPartEncoded> = []

        if (event === "[DONE]") {
          if (reasoningStarted) {
            parts.push({
              type: "reasoning-end",
              id: reasoningId,
              metadata: { "openai-compat": { ...makeItemIdMetadata(reasoningId) } }
            })
          }

          if (textStarted) {
            parts.push({
              type: "text-end",
              id: textId,
              metadata: { "openai-compat": { ...makeItemIdMetadata(textId) } }
            })
          }

          for (const toolCall of Object.values(activeToolCalls)) {
            const toolParams = toolCall.arguments.length > 0 ? toolCall.arguments : "{}"
            const parsedParams = yield* Effect.try({
              try: () => Tool.unsafeSecureJsonParse(toolParams),
              catch: (cause) =>
                AiError.make({
                  module: "OpenAiLanguageModel",
                  method: "makeStreamResponse",
                  reason: new AiError.ToolParameterValidationError({
                    toolName: toolCall.name,
                    description: `Failed to securely JSON parse tool parameters: ${cause}`
                  })
                })
            })
            const params = yield* transformToolCallParams(options, toolCall.name, parsedParams, toolCodecs)
            parts.push({ type: "tool-params-end", id: toolCall.id })
            parts.push({
              type: "tool-call",
              id: toolCall.id,
              name: toolCall.name,
              params,
              metadata: {
                "openai-compat": {
                  ...makeItemIdMetadata(toolCall.id),
                  ...makeExtraContentMetadata(toolCall.extraContent)
                }
              }
            })
            hasToolCalls = true
          }

          const normalizedServiceTier = normalizeServiceTier(serviceTier)
          parts.push({
            type: "finish",
            reason: InternalUtilities.resolveFinishReason(finishReason, hasToolCalls),
            usage: getUsage(usage),
            response: buildHttpResponseDetails(response),
            ...(normalizedServiceTier !== undefined
              ? { metadata: { "openai-compat": { serviceTier: normalizedServiceTier } } }
              : undefined)
          })
          return parts
        }

        // Keep unknown events available to direct client consumers; this layer
        // cannot translate provider-specific data into portable stream parts.
        if (isUnknownChatCompletionEvent(event)) {
          return parts
        }

        if (event.service_tier !== undefined) {
          serviceTier = event.service_tier
        }
        if (event.usage !== undefined && Predicate.isNotNull(event.usage)) {
          usage = event.usage
        }

        if (!metadataEmitted) {
          metadataEmitted = true
          textId = `${event.id}_message`
          reasoningId = `${event.id}_reasoning`
          parts.push({
            type: "response-metadata",
            id: event.id,
            modelId: event.model,
            timestamp: DateTime.formatIso(DateTime.fromDateUnsafe(new Date(event.created * 1000)))
          })
        }

        const choice = event.choices[0]
        if (Predicate.isUndefined(choice)) {
          return parts
        }

        const reasoningField = Predicate.isNotNullish(choice.delta)
          ? getResponseReasoningField(choice.delta)
          : undefined
        const reasoningDelta = reasoningField !== undefined ? choice.delta?.[reasoningField] : undefined
        if (reasoningField !== undefined && Predicate.isNotNullish(reasoningDelta) && reasoningDelta.length > 0) {
          if (!reasoningStarted) {
            reasoningStarted = true
            parts.push({
              type: "reasoning-start",
              id: reasoningId,
              metadata: { "openai-compat": { ...makeItemIdMetadata(reasoningId), reasoningField } }
            })
          }
          parts.push({ type: "reasoning-delta", id: reasoningId, delta: reasoningDelta })
        }

        if (Predicate.isNotNullish(choice.delta?.content) && choice.delta.content.length > 0) {
          if (reasoningStarted) {
            reasoningStarted = false
            parts.push({
              type: "reasoning-end",
              id: reasoningId,
              metadata: { "openai-compat": { ...makeItemIdMetadata(reasoningId) } }
            })
          }

          if (!textStarted) {
            textStarted = true
            parts.push({
              type: "text-start",
              id: textId,
              metadata: { "openai-compat": { ...makeItemIdMetadata(textId) } }
            })
          }
          parts.push({ type: "text-delta", id: textId, delta: choice.delta.content })
        }

        if (Predicate.isNotNullish(choice.delta?.tool_calls)) {
          hasToolCalls = hasToolCalls || choice.delta.tool_calls.length > 0
          choice.delta.tool_calls.forEach((deltaTool, indexInChunk) => {
            const toolIndex = deltaTool.index ?? indexInChunk
            const activeToolCall = activeToolCalls[toolIndex]
            const toolId = activeToolCall?.id ?? deltaTool.id ?? `${event.id}_tool_${toolIndex}`
            const providerToolName = deltaTool.function?.name
            const toolName = Predicate.isNotNullish(providerToolName)
              ? toolNameMapper.getCustomName(providerToolName)
              : activeToolCall?.name ?? toolNameMapper.getCustomName("unknown_tool")
            const argumentsDelta = deltaTool.function?.arguments ?? ""

            if (Predicate.isUndefined(activeToolCall)) {
              activeToolCalls[toolIndex] = {
                id: toolId,
                name: toolName,
                arguments: argumentsDelta,
                extraContent: deltaTool.extra_content ?? undefined
              }
              parts.push({ type: "tool-params-start", id: toolId, name: toolName })
            } else {
              activeToolCall.name = toolName
              activeToolCall.arguments = `${activeToolCall.arguments}${argumentsDelta}`
              if (Predicate.isNotNullish(deltaTool.extra_content)) {
                activeToolCall.extraContent = deltaTool.extra_content
              }
            }

            if (argumentsDelta.length > 0) {
              parts.push({ type: "tool-params-delta", id: toolId, delta: argumentsDelta })
            }
          })
        }

        if (choice.finish_reason !== undefined && Predicate.isNotNull(choice.finish_reason)) {
          finishReason = choice.finish_reason
        }

        return parts
      })),
      Stream.filter(Arr.isArrayNonEmpty),
      Stream.flattenArray
    )
  }
)

// =============================================================================
// Telemetry
// =============================================================================

const annotateRequest = (
  span: Span,
  request: CreateResponseRequestJson
): void => {
  addGenAIAnnotations(span, {
    provider: { name: "openai" },
    operation: { name: "chat" },
    request: {
      model: request.model as string,
      temperature: request.temperature as number | undefined,
      topP: request.top_p as number | undefined,
      maxTokens: request.max_tokens as number | undefined
    },
    openai: {
      request: {
        serviceTier: request.service_tier as string | undefined
      }
    }
  })
}

const annotateResponse = (span: Span, response: CreateResponse200): void => {
  const finishReason = response.choices[0]?.finish_reason ?? undefined
  addGenAIAnnotations(span, {
    response: {
      id: response.id,
      model: response.model as string,
      finishReasons: finishReason !== undefined ? [finishReason] : undefined
    },
    usage: {
      inputTokens: response.usage?.prompt_tokens,
      outputTokens: response.usage?.completion_tokens
    },
    openai: {
      response: {
        serviceTier: response.service_tier as string | undefined
      }
    }
  })
}

const annotateStreamResponse = (span: Span, part: Response.StreamPartEncoded) => {
  if (part.type === "response-metadata") {
    addGenAIAnnotations(span, {
      response: {
        id: part.id,
        model: part.modelId
      }
    })
  }
  if (part.type === "finish") {
    const serviceTier = (part.metadata as any)?.["openai-compat"]?.serviceTier as string | undefined
    addGenAIAnnotations(span, {
      response: {
        finishReasons: [part.reason]
      },
      usage: {
        inputTokens: part.usage.inputTokens.total,
        outputTokens: part.usage.outputTokens.total
      },
      openai: {
        response: { serviceTier }
      }
    })
  }
}

// =============================================================================
// Tool Conversion
// =============================================================================

type OpenAiToolChoice = CreateResponse["tool_choice"]

const unsupportedSchemaError = (error: unknown, method: string): AiError.AiError =>
  AiError.make({
    module: "OpenAiLanguageModel",
    method,
    reason: new AiError.UnsupportedSchemaError({
      description: error instanceof Error ? error.message : String(error)
    })
  })

const tryCodecTransform = <S extends Schema.Constraint>(schema: S, method: string) =>
  Effect.try({
    try: () => toCodecOpenAI(schema),
    catch: (error) => unsupportedSchemaError(error, method)
  })

const tryJsonSchema = <S extends Schema.Constraint>(schema: S, method: string) =>
  Effect.try({
    try: () => Tool.getJsonSchemaFromSchema(schema, { transformer: toCodecOpenAI }),
    catch: (error) => unsupportedSchemaError(error, method)
  })

const toolParametersError = (tool: Tool.Any, error: unknown, method: string): AiError.AiError =>
  unsupportedSchemaError(
    `Tool "${tool.name}" parameters: ${error instanceof Error ? error.message : String(error)}. ` +
      "For a tool without parameters, omit `parameters` or use `Tool.EmptyParams`",
    method
  )

type ToolCodec = ReturnType<typeof toCodecOpenAI>["codec"]
type ToolCodecs = ReadonlyMap<Tool.Any, ToolCodec>

const transformToolCallParams = Effect.fnUntraced(function*(
  options: LanguageModel.ProviderOptions,
  toolName: string,
  toolParams: unknown,
  toolCodecs: ToolCodecs
): Effect.fn.Return<unknown, AiError.AiError> {
  const tool = options.tools.find((tool) => tool.name === toolName)

  if (Predicate.isUndefined(tool)) {
    if (options.toolCallValidation === "deferred") {
      return toolParams
    }
    return yield* AiError.make({
      module: "OpenAiLanguageModel",
      method: "makeResponse",
      reason: new AiError.ToolNotFoundError({
        toolName,
        availableTools: options.tools.map((tool) => tool.name)
      })
    })
  }

  if (Tool.isDynamic(tool) && tool.jsonSchema !== undefined) {
    return toolParams
  }

  const codec = toolCodecs.get(tool) ?? (yield* tryCodecTransform(tool.parametersSchema, "makeResponse")).codec

  // Normalize valid parameters; leave invalid ones for Toolkit.
  return yield* (
    Schema.decodeEffect(codec)(toolParams) as Effect.Effect<unknown, Schema.SchemaError>
  ).pipe(
    Effect.flatMap((decoded) =>
      Schema.encodeUnknownEffect(tool.parametersSchema)(decoded) as Effect.Effect<unknown, Schema.SchemaError>
    ),
    Effect.orElseSucceed(() => toolParams)
  )
})

const prepareTools = Effect.fnUntraced(function*<Tools extends ReadonlyArray<Tool.Any>>({
  config,
  options,
  toolNameMapper
}: {
  readonly config: typeof Config.Service
  readonly options: LanguageModel.ProviderOptions
  readonly toolNameMapper: Tool.NameMapper<Tools>
}): Effect.fn.Return<{
  readonly tools: ReadonlyArray<OpenAiClientTool> | undefined
  readonly toolChoice: OpenAiToolChoice | undefined
  readonly toolCodecs: ToolCodecs
}, AiError.AiError> {
  const toolCodecs = new Map<Tool.Any, ToolCodec>()

  // Return immediately if no tools are in the toolkit
  if (options.tools.length === 0) {
    return { tools: undefined, toolChoice: undefined, toolCodecs }
  }

  const tools: Array<OpenAiClientTool> = []
  let toolChoice: OpenAiToolChoice | undefined = undefined

  // Filter the incoming tools down to the set of allowed tools as indicated by
  // the tool choice. This must be done here given that there is no tool name
  // in OpenAI's provider-defined tools, so there would be no way to perform
  // this filter otherwise
  let allowedTools = options.tools
  if (typeof options.toolChoice === "object" && "oneOf" in options.toolChoice) {
    const allowedToolNames = new Set(options.toolChoice.oneOf)
    allowedTools = options.tools.filter((tool) => allowedToolNames.has(tool.name))
    toolChoice = options.toolChoice.mode === "required" ? "required" : "auto"
  }

  // Convert the tools in the toolkit to the provider-defined format
  for (const tool of allowedTools) {
    if (Tool.isUserDefined(tool) || Tool.isDynamic(tool)) {
      const strict = Tool.getStrictMode(tool) ?? config.strictJsonSchema ?? true
      let parameters: ReturnType<typeof Tool.getJsonSchema>
      if (Tool.isDynamic(tool) && tool.jsonSchema !== undefined) {
        parameters = tool.jsonSchema
      } else {
        const prepared = yield* Effect.try({
          try: () => toCodecOpenAI(tool.parametersSchema),
          catch: (error) => toolParametersError(tool, error, "prepareTools")
        })
        parameters = prepared.jsonSchema
        // Reused to normalize this tool's calls in the response.
        toolCodecs.set(tool, prepared.codec)
      }
      tools.push({
        type: "function",
        name: tool.name,
        description: Tool.getDescription(tool) ?? null,
        parameters: parameters as { readonly [x: string]: Schema.Json },
        strict
      })
    }

    if (Tool.isProviderDefined(tool)) {
      tools.push({
        type: "function",
        name: tool.providerName,
        description: Tool.getDescription(tool) ?? null,
        parameters: Tool.getJsonSchema(tool) as { readonly [x: string]: Schema.Json },
        strict: config.strictJsonSchema ?? true
      })
    }
  }

  if (options.toolChoice === "auto" || options.toolChoice === "none" || options.toolChoice === "required") {
    toolChoice = options.toolChoice
  }

  if (typeof options.toolChoice === "object" && "tool" in options.toolChoice) {
    const toolName = toolNameMapper.getProviderName(options.toolChoice.tool)
    const providerNames = toolNameMapper.providerNames
    if (providerNames.includes(toolName)) {
      toolChoice = { type: "function", name: toolName }
    } else {
      toolChoice = { type: "function", name: options.toolChoice.tool }
    }
  }

  return { tools, toolChoice, toolCodecs }
})

const toChatCompletionsRequest = (
  payload: CreateResponse,
  messages: ReadonlyArray<ChatCompletionRequestMessage>
): CreateResponseRequestJson => {
  const responseFormat = toChatResponseFormat(payload.text?.format)
  const tools = payload.tools !== undefined
    ? payload.tools.map(toChatTool).filter((tool): tool is NonNullable<ReturnType<typeof toChatTool>> =>
      tool !== undefined
    )
    : []
  const toolChoice = toChatToolChoice(payload.tool_choice)

  return {
    ...extractCustomRequestProperties(payload),
    model: payload.model ?? "",
    messages: messages.length > 0 ? messages : [{ role: "user", content: "" }],
    ...(payload.temperature !== undefined ? { temperature: payload.temperature } : undefined),
    ...(payload.top_p !== undefined ? { top_p: payload.top_p } : undefined),
    ...(payload.max_output_tokens !== undefined ? { max_tokens: payload.max_output_tokens } : undefined),
    ...(payload.user !== undefined ? { user: payload.user } : undefined),
    ...(payload.seed !== undefined ? { seed: payload.seed } : undefined),
    ...(payload.parallel_tool_calls !== undefined
      ? { parallel_tool_calls: payload.parallel_tool_calls }
      : undefined),
    ...(payload.service_tier !== undefined ? { service_tier: payload.service_tier } : undefined),
    ...(payload.reasoning !== undefined ? { reasoning: payload.reasoning } : undefined),
    ...(responseFormat !== undefined ? { response_format: responseFormat } : undefined),
    ...(tools.length > 0 ? { tools } : undefined),
    ...(toolChoice !== undefined ? { tool_choice: toolChoice } : undefined)
  }
}

const createResponseKnownProperties = new Set<string>([
  "metadata",
  "top_logprobs",
  "temperature",
  "top_p",
  "user",
  "safety_identifier",
  "prompt_cache_key",
  "service_tier",
  "prompt_cache_retention",
  "previous_response_id",
  "model",
  "reasoning",
  "background",
  "max_output_tokens",
  "max_tool_calls",
  "text",
  "tools",
  "tool_choice",
  "truncation",
  "input",
  "include",
  "parallel_tool_calls",
  "store",
  "instructions",
  "stream",
  "conversation",
  "modalities",
  "seed"
])

const extractCustomRequestProperties = (payload: CreateResponse): Record<string, unknown> => {
  const customProperties: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(payload)) {
    if (!createResponseKnownProperties.has(key)) {
      Rec.assignProperty(customProperties, key, value)
    }
  }
  return customProperties
}

const toChatResponseFormat = (
  format: TextResponseFormatConfiguration | undefined
): CreateResponseRequestJson["response_format"] | undefined => {
  if (Predicate.isUndefined(format) || Predicate.isNull(format)) {
    return undefined
  }

  switch (format.type) {
    case "json_object": {
      return { type: "json_object" }
    }
    case "json_schema": {
      return {
        type: "json_schema",
        json_schema: {
          name: format.name,
          schema: format.schema,
          ...(format.description !== undefined ? { description: format.description } : undefined),
          ...(Predicate.isNotNullish(format.strict) ? { strict: format.strict } : undefined)
        }
      }
    }
    default: {
      return undefined
    }
  }
}

const toChatToolChoice = (
  toolChoice: OpenAiToolChoice
): CreateResponseRequestJson["tool_choice"] | undefined => {
  if (Predicate.isUndefined(toolChoice)) {
    return undefined
  }

  if (typeof toolChoice === "string") {
    return toolChoice
  }

  if (toolChoice.type === "allowed_tools") {
    return toolChoice.mode
  }

  if (toolChoice.type === "function") {
    return {
      type: "function",
      function: {
        name: toolChoice.name
      }
    }
  }

  const functionName = Predicate.hasProperty(toolChoice, "name") && typeof toolChoice.name === "string"
    ? toolChoice.name
    : toolChoice.type

  return {
    type: "function",
    function: {
      name: functionName
    }
  }
}

const toChatTool = (
  tool: OpenAiClientTool
): NonNullable<CreateResponseRequestJson["tools"]>[number] | undefined => {
  if (tool.type === "function") {
    return {
      type: "function",
      function: {
        name: tool.name,
        ...(tool.description !== undefined ? { description: tool.description } : undefined),
        ...(Predicate.isNotNullish(tool.parameters) ? { parameters: tool.parameters } : undefined),
        ...(Predicate.isNotNullish(tool.strict) ? { strict: tool.strict } : undefined)
      }
    }
  }

  if (tool.type === "custom") {
    return {
      type: "function",
      function: {
        name: tool.name,
        parameters: { type: "object", additionalProperties: true }
      }
    }
  }

  return undefined
}

const toChatMessageContent = (
  content: string | ReadonlyArray<InputContent>
): string | ReadonlyArray<ChatCompletionContentPart> => {
  if (typeof content === "string") {
    return content
  }

  if (content.length === 1 && content[0].type === "input_text") {
    return content[0].text
  }

  const parts: Array<ChatCompletionContentPart> = []

  for (const part of content) {
    switch (part.type) {
      case "input_text": {
        parts.push({ type: "text", text: part.text })
        break
      }
      case "input_image": {
        const imageUrl = part.image_url !== undefined
          ? part.image_url
          : part.file_id !== undefined
          ? `openai://file/${part.file_id}`
          : undefined

        if (imageUrl !== undefined && Predicate.isNotNull(imageUrl)) {
          parts.push({
            type: "image_url",
            image_url: {
              url: imageUrl,
              ...(Predicate.isNotNullish(part.detail) ? { detail: part.detail } : undefined)
            }
          })
        }
        break
      }
      case "input_file": {
        if (part.file_url !== undefined) {
          parts.push({ type: "text", text: part.file_url })
        } else if (part.file_data !== undefined) {
          parts.push({ type: "text", text: part.file_data })
        } else if (part.file_id !== undefined) {
          parts.push({ type: "text", text: `openai://file/${part.file_id}` })
        }
        break
      }
    }
  }

  if (parts.length === 0) {
    return ""
  }

  if (parts.every((part) => part.type === "text")) {
    return parts.map((part) => part.text).join("\n")
  }

  return parts
}

// =============================================================================
// Utilities
// =============================================================================

const isFileId = (data: string, config: typeof Config.Service): boolean =>
  config.fileIdPrefixes != null && config.fileIdPrefixes.some((prefix) => data.startsWith(prefix))

const getExtraContent = (
  part: Prompt.ToolCallPart
): Schema.JsonObject | null => part.options["openai-compat"]?.extraContent ?? null

/**
 * The chat message field carrying reasoning text. Providers differ: DeepSeek,
 * Kimi and GLM use `reasoning_content`, while Groq uses `reasoning` and
 * rejects `reasoning_content` on request messages.
 */
type ReasoningField = "reasoning" | "reasoning_content"

const getResponseReasoningField = (message: {
  readonly reasoning?: string | null | undefined
  readonly reasoning_content?: string | null | undefined
}): ReasoningField | undefined =>
  Predicate.isNotNullish(message.reasoning)
    ? "reasoning"
    : Predicate.isNotNullish(message.reasoning_content)
    ? "reasoning_content"
    : undefined

const getImageDetail = (part: Prompt.FilePart): ImageDetail => part.options["openai-compat"]?.imageDetail ?? "auto"

const makeItemIdMetadata = (itemId: string | undefined) => itemId !== undefined ? { itemId } : undefined

const makeExtraContentMetadata = (extraContent: Schema.JsonObject | undefined) =>
  extraContent !== undefined ? { extraContent } : undefined

const normalizeServiceTier = (
  serviceTier: string | undefined
): "default" | "auto" | "flex" | "scale" | "priority" | null | undefined => {
  switch (serviceTier) {
    case undefined:
      return undefined
    case "default":
    case "auto":
    case "flex":
    case "scale":
    case "priority":
      return serviceTier
    default:
      return null
  }
}

const prepareResponseFormat = Effect.fnUntraced(function*({ config, options }: {
  readonly config: typeof Config.Service
  readonly options: LanguageModel.ProviderOptions
}): Effect.fn.Return<TextResponseFormatConfiguration, AiError.AiError> {
  if (options.responseFormat.type === "json") {
    const name = options.responseFormat.objectName
    const schema = options.responseFormat.schema
    const jsonSchema = yield* tryJsonSchema(schema, "prepareResponseFormat")
    return {
      type: "json_schema",
      name,
      description: AST.resolveDescription(schema.ast) ?? "Response with a JSON object",
      schema: jsonSchema as any,
      strict: config.strictJsonSchema ?? true
    }
  }
  return { type: "text" }
})

const getUsage = (usage: CreateResponse200["usage"]): Response.Usage => {
  if (Predicate.isNullish(usage)) {
    return {
      inputTokens: {
        uncached: undefined,
        total: undefined,
        cacheRead: undefined,
        cacheWrite: undefined
      },
      outputTokens: {
        total: undefined,
        text: undefined,
        reasoning: undefined
      }
    }
  }

  const inputTokens = usage.prompt_tokens
  const outputTokens = usage.completion_tokens
  const cachedTokens = getUsageDetailNumber(usage.prompt_tokens_details, "cached_tokens") ?? 0
  const reasoningTokens = getUsageDetailNumber(usage.completion_tokens_details, "reasoning_tokens") ?? 0

  return {
    inputTokens: {
      uncached: inputTokens - cachedTokens,
      total: inputTokens,
      cacheRead: cachedTokens,
      cacheWrite: undefined
    },
    outputTokens: {
      total: outputTokens,
      text: outputTokens - reasoningTokens,
      reasoning: reasoningTokens
    }
  }
}

const getUsageDetailNumber = (
  details: unknown,
  field: string
): number | undefined => {
  if (typeof details !== "object" || details === null) {
    return undefined
  }

  const value = (details as Record<string, unknown>)[field]
  return typeof value === "number" ? value : undefined
}
