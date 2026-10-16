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
import type * as Prompt from "effect/ai/Prompt"
import type * as Response from "effect/ai/Response"
import * as Tool from "effect/ai/Tool"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Base64 from "effect/encoding/Base64"
import { dual } from "effect/Function"
import type * as HttpClientRequest from "effect/http/HttpClientRequest"
import type * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as Rec from "effect/Record"
import * as Redactable from "effect/Redactable"
import * as Schema from "effect/Schema"
import * as AST from "effect/SchemaAST"
import * as Stream from "effect/Stream"
import type { Span } from "effect/Tracer"
import type { DeepMutable, Simplify } from "effect/Types"
import * as InternalUtilities from "./internal/utilities.ts"
import {
  type Annotation,
  type ChatCompletionContentPart,
  type ChatCompletionRequestToolCall,
  type CreateResponse,
  type CreateResponse200,
  type CreateResponse200Sse,
  type CreateResponseRequestJson,
  type IncludeEnum,
  type InputContent,
  type InputItem,
  type MessageStatus,
  OpenAiClient,
  type ReasoningItem,
  type SummaryTextContent,
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
    Omit<CreateResponse, "input" | "tools" | "tool_choice" | "stream" | "text">
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
    readonly openai?: {
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
    readonly openai?: {
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
    readonly openai?: {
      /**
       * The ID of the item to reference.
       */
      readonly itemId?: string | null
      /**
       * The status to send for the tool-call item.
       */
      readonly status?: MessageStatus | null
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
    readonly openai?: {
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
    readonly openai?: {
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
    readonly openai?: {
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
    readonly openai?: {
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
    readonly openai?: {
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
    readonly openai?: {
      /**
       * The OpenAI item ID associated with the reasoning part.
       */
      readonly itemId?: string | null
      /**
       * Encrypted reasoning content that can be sent back in later requests.
       */
      readonly encryptedContent?: string | null
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
    readonly openai?: {
      /**
       * The OpenAI item ID associated with the reasoning part.
       */
      readonly itemId?: string | null
      /**
       * Encrypted reasoning content that can be sent back in later requests.
       */
      readonly encryptedContent?: string | null
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
    readonly openai?: {
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
    readonly openai?: {
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
    readonly openai?: {
      /**
       * The OpenAI item ID associated with the tool call.
       */
      readonly itemId?: string | null
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
    readonly openai?:
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
    readonly openai?: {
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
    readonly openai?: {
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
    }): Effect.fn.Return<CreateResponseRequestJson, AiError.AiError> {
      const include = new Set<IncludeEnum>()
      const capabilities = getModelCapabilities(config.model!)
      const messages = yield* prepareMessages({
        config,
        options,
        capabilities,
        include,
        toolNameMapper
      })
      const { toolChoice, tools } = yield* prepareTools({
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
        input: messages,
        include: include.size > 0 ? Array.from(include) : null,
        text: {
          verbosity: config.text?.verbosity ?? null,
          format: responseFormat
        },
        ...(tools !== undefined ? { tools } : undefined),
        ...(toolChoice !== undefined ? { tool_choice: toolChoice } : undefined)
      }
      return toChatCompletionsRequest(request)
    }
  )

  return yield* LanguageModel.make({
    codecTransformer: toCodecOpenAI,
    generateText: Effect.fnUntraced(
      function*(options) {
        const config = yield* makeConfig
        const toolNameMapper = new Tool.NameMapper(options.tools)
        const request = yield* makeRequest({ config, options, toolNameMapper })
        annotateRequest(options.span, request)
        const [rawResponse, response] = yield* client.createResponse(request)
        annotateResponse(options.span, rawResponse)
        return yield* makeResponse({
          options,
          rawResponse,
          response,
          toolNameMapper
        })
      }
    ),
    streamText: Effect.fnUntraced(
      function*(options) {
        const config = yield* makeConfig
        const toolNameMapper = new Tool.NameMapper(options.tools)
        const request = yield* makeRequest({ config, options, toolNameMapper })
        annotateRequest(options.span, request)
        const [response, stream] = yield* client.createResponseStream(request)
        return yield* makeStreamResponse({
          options,
          stream,
          response,
          toolNameMapper
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
    capabilities,
    include,
    toolNameMapper
  }: {
    readonly config: typeof Config.Service
    readonly options: LanguageModel.ProviderOptions
    readonly include: Set<IncludeEnum>
    readonly capabilities: ModelCapabilities
    readonly toolNameMapper: Tool.NameMapper<Tools>
  }): Effect.fn.Return<ReadonlyArray<InputItem>, AiError.AiError> {
    const hasConversation = Predicate.isNotNullish(config.conversation)

    // Handle Included Features
    if (config.top_logprobs !== undefined) {
      include.add("message.output_text.logprobs")
    }
    if (config.store === false && capabilities.isReasoningModel) {
      include.add("reasoning.encrypted_content")
    }

    const messages: Array<InputItem> = []

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

          messages.push({ role: "user", content })

          break
        }

        case "assistant": {
          const reasoningMessages: Record<string, DeepMutable<ReasoningItem>> = Object.create(null)

          for (const part of message.content) {
            switch (part.type) {
              case "text": {
                const id = getItemId(part)

                // When in conversation mode, skip items that already exist in the
                // conversation context to avoid "Duplicate item found" errors
                if (hasConversation && Predicate.isNotNull(id)) {
                  break
                }

                if (config.store === true && Predicate.isNotNull(id)) {
                  messages.push({ type: "item_reference", id })
                  break
                }

                messages.push({
                  id: id!,
                  type: "message",
                  role: "assistant",
                  status: part.options.openai?.status ?? "completed",
                  content: [{
                    type: "output_text",
                    text: part.text,
                    annotations: part.options.openai?.annotations ?? [],
                    logprobs: []
                  }]
                })

                break
              }

              case "reasoning": {
                const id = getItemId(part)
                const encryptedContent = getEncryptedContent(part)

                if (hasConversation && Predicate.isNotNull(id)) {
                  break
                }

                if (Predicate.isNotNull(id)) {
                  const message = reasoningMessages[id]

                  if (config.store === true) {
                    // Use item references to refer to reasoning (single reference)
                    // when the first part is encountered
                    if (Predicate.isUndefined(message)) {
                      messages.push({ type: "item_reference", id })

                      // Store unused reasoning message to mark its id as used
                      reasoningMessages[id] = {
                        type: "reasoning",
                        id,
                        summary: []
                      }
                    }
                  } else {
                    const summaryParts: Array<SummaryTextContent> = []

                    if (part.text.length > 0) {
                      summaryParts.push({ type: "summary_text", text: part.text })
                    }

                    if (Predicate.isUndefined(message)) {
                      reasoningMessages[id] = {
                        type: "reasoning",
                        id,
                        summary: summaryParts,
                        encrypted_content: encryptedContent ?? null
                      }

                      messages.push(reasoningMessages[id])
                    } else {
                      message.summary.push(...summaryParts)

                      // Update encrypted content to enable setting it in the
                      // last summary part
                      if (Predicate.isNotNull(encryptedContent)) {
                        message.encrypted_content = encryptedContent
                      }
                    }
                  }
                }

                break
              }

              case "tool-call": {
                const id = getItemId(part)
                const status = getStatus(part)

                if (hasConversation && Predicate.isNotNull(id)) {
                  break
                }

                if (config.store && Predicate.isNotNull(id)) {
                  messages.push({ type: "item_reference", id })
                  break
                }

                if (part.providerExecuted) {
                  break
                }

                const toolName = toolNameMapper.getProviderName(part.name)

                messages.push({
                  type: "function_call",
                  name: toolName,
                  call_id: part.id,
                  arguments: JSON.stringify(part.params),
                  ...(Predicate.isNotNull(id) ? { id } : {}),
                  ...(Predicate.isNotNull(status) ? { status } : {})
                })

                break
              }

              // Assistant tool-result parts are always provider executed
              case "tool-result": {
                // Skip execution denied results - these have no corresponding
                // item in OpenAI's store
                if (
                  Predicate.hasProperty(part.result, "type") &&
                  part.result.type === "execution-denied"
                ) {
                  break
                }

                if (hasConversation) {
                  break
                }

                if (config.store === true) {
                  const id = getItemId(part) ?? part.id
                  messages.push({ type: "item_reference", id })
                }
              }
            }
          }

          break
        }

        case "tool": {
          for (const part of message.content) {
            if (part.type === "tool-approval-response") {
              continue
            }

            const status = getStatus(part)

            messages.push({
              type: "function_call_output",
              call_id: part.id,
              output: typeof part.result === "string" ? part.result : JSON.stringify(part.result),
              ...(Predicate.isNotNull(status) ? { status } : {})
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

const buildHttpRequestDetails = (
  request: HttpClientRequest.HttpClientRequest
): typeof Response.HttpRequestDetails.Type => ({
  method: request.method,
  url: request.url,
  urlParams: Array.from(request.urlParams),
  hash: Option.getOrUndefined(request.hash),
  headers: Redactable.redact(request.headers) as Record<string, string>
})

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
}

const makeResponse = Effect.fnUntraced(
  function*<Tools extends ReadonlyArray<Tool.Any>>({
    options,
    rawResponse,
    response,
    toolNameMapper
  }: {
    readonly options: LanguageModel.ProviderOptions
    readonly rawResponse: CreateResponse200
    readonly response: HttpClientResponse.HttpClientResponse
    readonly toolNameMapper: Tool.NameMapper<Tools>
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
      timestamp: DateTime.formatIso(DateTime.fromDateUnsafe(createdAt)),
      request: buildHttpRequestDetails(response.request)
    })

    const choice = rawResponse.choices[0]
    const message = choice?.message

    if (message !== undefined) {
      const reasoning = message.reasoning ?? message.reasoning_content
      if (Predicate.isNotNullish(reasoning) && reasoning.length > 0) {
        parts.push({ type: "reasoning", text: reasoning })
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
          const params = yield* transformToolCallParams(options.tools, toolName, toolParams)
          hasToolCalls = true
          parts.push({
            type: "tool-call",
            id: toolId,
            name: toolName,
            params,
            metadata: { openai: { ...makeItemIdMetadata(toolCall.id) } }
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
      ...(serviceTier !== undefined && { metadata: { openai: { serviceTier } } })
    })

    return parts
  }
)

const makeStreamResponse = Effect.fnUntraced(
  function*<Tools extends ReadonlyArray<Tool.Any>>({
    options,
    stream,
    response,
    toolNameMapper
  }: {
    readonly options: LanguageModel.ProviderOptions
    readonly stream: Stream.Stream<ResponseStreamEvent, AiError.AiError>
    readonly response: HttpClientResponse.HttpClientResponse
    readonly toolNameMapper: Tool.NameMapper<Tools>
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
              metadata: { openai: { ...makeItemIdMetadata(reasoningId) } }
            })
          }

          if (textStarted) {
            parts.push({
              type: "text-end",
              id: textId,
              metadata: { openai: { ...makeItemIdMetadata(textId) } }
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
            const params = yield* transformToolCallParams(options.tools, toolCall.name, parsedParams)
            parts.push({ type: "tool-params-end", id: toolCall.id })
            parts.push({
              type: "tool-call",
              id: toolCall.id,
              name: toolCall.name,
              params,
              metadata: { openai: { ...makeItemIdMetadata(toolCall.id) } }
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
              ? { metadata: { openai: { serviceTier: normalizedServiceTier } } }
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
            timestamp: DateTime.formatIso(DateTime.fromDateUnsafe(new Date(event.created * 1000))),
            request: buildHttpRequestDetails(response.request)
          })
        }

        const choice = event.choices[0]
        if (Predicate.isUndefined(choice)) {
          return parts
        }

        const reasoningDelta = choice.delta?.reasoning ?? choice.delta?.reasoning_content
        if (Predicate.isNotNullish(reasoningDelta) && reasoningDelta.length > 0) {
          if (!reasoningStarted) {
            reasoningStarted = true
            parts.push({
              type: "reasoning-start",
              id: reasoningId,
              metadata: { openai: { ...makeItemIdMetadata(reasoningId) } }
            })
          }
          parts.push({ type: "reasoning-delta", id: reasoningId, delta: reasoningDelta })
        }

        if (choice.delta?.content !== undefined && Predicate.isNotNull(choice.delta.content)) {
          if (reasoningStarted) {
            reasoningStarted = false
            parts.push({
              type: "reasoning-end",
              id: reasoningId,
              metadata: { openai: { ...makeItemIdMetadata(reasoningId) } }
            })
          }

          if (!textStarted) {
            textStarted = true
            parts.push({
              type: "text-start",
              id: textId,
              metadata: { openai: { ...makeItemIdMetadata(textId) } }
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
                arguments: argumentsDelta
              }
              parts.push({ type: "tool-params-start", id: toolId, name: toolName })
            } else {
              activeToolCall.name = toolName
              activeToolCall.arguments = `${activeToolCall.arguments}${argumentsDelta}`
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
      Stream.flattenIterable
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
    system: "openai",
    operation: { name: "chat" },
    request: {
      model: request.model as string,
      temperature: request.temperature as number | undefined,
      topP: request.top_p as number | undefined,
      maxTokens: request.max_tokens as number | undefined
    },
    openai: {
      request: {
        responseFormat: request.response_format?.type,
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
    const serviceTier = (part.metadata as any)?.openai?.serviceTier as string | undefined
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

const tryToolJsonSchema = <T extends Tool.Any>(tool: T, method: string) =>
  Effect.try({
    try: () => Tool.getJsonSchema(tool, { transformer: toCodecOpenAI }),
    catch: (error) => unsupportedSchemaError(error, method)
  })

const transformToolCallParams = Effect.fnUntraced(function*<Tools extends ReadonlyArray<Tool.Any>>(
  tools: Tools,
  toolName: string,
  toolParams: unknown
): Effect.fn.Return<unknown, AiError.AiError> {
  const tool = tools.find((tool) => tool.name === toolName)

  if (Predicate.isUndefined(tool)) {
    return yield* AiError.make({
      module: "OpenAiLanguageModel",
      method: "makeResponse",
      reason: new AiError.ToolNotFoundError({
        toolName,
        availableTools: tools.map((tool) => tool.name)
      })
    })
  }

  if (Tool.isDynamic(tool) && tool.jsonSchema !== undefined) {
    return toolParams
  }

  const { codec } = yield* tryCodecTransform(tool.parametersSchema, "makeResponse")

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
}, AiError.AiError> {
  // Return immediately if no tools are in the toolkit
  if (options.tools.length === 0) {
    return { tools: undefined, toolChoice: undefined }
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
      const parameters = yield* tryToolJsonSchema(tool, "prepareTools")
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

  return { tools, toolChoice }
})

const toChatCompletionsRequest = (payload: CreateResponse): CreateResponseRequestJson => {
  const messages = toChatMessages(payload.input)
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

const toChatMessages = (
  input: CreateResponse["input"]
): Array<CreateResponseRequestJson["messages"][number]> => {
  if (Predicate.isUndefined(input)) {
    return []
  }

  if (typeof input === "string") {
    return [{ role: "user", content: input }]
  }

  const messages: Array<CreateResponseRequestJson["messages"][number]> = []

  for (const item of input) {
    if (Predicate.hasProperty(item, "type") && item.type === "function_call") {
      const previous = messages.at(-1)
      const toolCall = toChatToolCall(item)
      if (previous?.role === "assistant" && previous.tool_calls !== undefined) {
        messages[messages.length - 1] = {
          ...previous,
          tool_calls: [...previous.tool_calls, toolCall]
        }
      } else {
        messages.push({
          role: "assistant",
          content: null,
          tool_calls: [toolCall]
        })
      }
    } else {
      messages.push(...toChatMessagesFromItem(item))
    }
  }

  return messages
}

const toChatMessagesFromItem = (
  item: InputItem
): Array<CreateResponseRequestJson["messages"][number]> => {
  if (Predicate.hasProperty(item, "type") && item.type === "message") {
    return [{
      role: item.role,
      content: toAssistantChatMessageContent(item.content)
    }]
  }

  if (Predicate.hasProperty(item, "role")) {
    return [{
      role: item.role,
      content: toChatMessageContent(item.content)
    }]
  }

  switch (item.type) {
    case "function_call": {
      return [{
        role: "assistant",
        content: null,
        tool_calls: [toChatToolCall(item)]
      }]
    }

    case "function_call_output": {
      return [{
        role: "tool",
        tool_call_id: item.call_id,
        content: stringifyJson(item.output)
      }]
    }

    default: {
      return []
    }
  }
}

const toChatToolCall = (
  item: Extract<InputItem, { readonly type: "function_call" }>
): ChatCompletionRequestToolCall => ({
  id: item.call_id,
  type: "function",
  function: {
    name: item.name,
    arguments: item.arguments
  }
})

const toAssistantChatMessageContent = (
  content: ReadonlyArray<{
    readonly type: string
    readonly [x: string]: unknown
  }>
): string => {
  let text = ""
  for (const part of content) {
    if (part.type === "output_text" && typeof part.text === "string") {
      text += part.text
    }
    if (part.type === "refusal" && typeof part.refusal === "string") {
      text += part.refusal
    }
  }
  return text
}

const toChatMessageContent = (
  content: string | ReadonlyArray<InputContent>
): string | ReadonlyArray<ChatCompletionContentPart> => {
  if (typeof content === "string") {
    return content
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

const stringifyJson = (value: unknown): string =>
  typeof value === "string"
    ? value
    : JSON.stringify(value)

// =============================================================================
// Utilities
// =============================================================================

const isFileId = (data: string, config: typeof Config.Service): boolean =>
  config.fileIdPrefixes != null && config.fileIdPrefixes.some((prefix) => data.startsWith(prefix))

const getItemId = (
  part:
    | Prompt.TextPart
    | Prompt.ReasoningPart
    | Prompt.ToolCallPart
    | Prompt.ToolResultPart
): string | null => part.options.openai?.itemId ?? null
const getStatus = (
  part:
    | Prompt.TextPart
    | Prompt.ToolCallPart
    | Prompt.ToolResultPart
): MessageStatus | null => part.options.openai?.status ?? null
const getEncryptedContent = (
  part: Prompt.ReasoningPart
): string | null => part.options.openai?.encryptedContent ?? null

const getImageDetail = (part: Prompt.FilePart): ImageDetail => part.options.openai?.imageDetail ?? "auto"

const makeItemIdMetadata = (itemId: string | undefined) => itemId !== undefined ? { itemId } : undefined

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

interface ModelCapabilities {
  readonly isReasoningModel: boolean
  readonly systemMessageMode: "remove" | "system" | "developer"
  readonly supportsFlexProcessing: boolean
  readonly supportsPriorityProcessing: boolean
  /**
   * Allow temperature, topP, logProbs when reasoningEffort is none.
   */
  readonly supportsNonReasoningParameters: boolean
}

const getModelCapabilities = (modelId: string): ModelCapabilities => {
  const supportsFlexProcessing = modelId.startsWith("o3") ||
    modelId.startsWith("o4-mini") ||
    (modelId.startsWith("gpt-5") && !modelId.startsWith("gpt-5-chat"))

  const supportsPriorityProcessing = modelId.startsWith("gpt-4") ||
    modelId.startsWith("gpt-5-mini") ||
    (modelId.startsWith("gpt-5") &&
      !modelId.startsWith("gpt-5-nano") &&
      !modelId.startsWith("gpt-5-chat")) ||
    modelId.startsWith("o3") ||
    modelId.startsWith("o4-mini")

  // Use allowlist approach: only known reasoning models should use 'developer' role
  // This prevents issues with fine-tuned models, third-party models, and custom models
  const isReasoningModel = modelId.startsWith("o1") ||
    modelId.startsWith("o3") ||
    modelId.startsWith("o4-mini") ||
    modelId.startsWith("codex-mini") ||
    modelId.startsWith("computer-use-preview") ||
    (modelId.startsWith("gpt-5") && !modelId.startsWith("gpt-5-chat"))

  // https://platform.openai.com/docs/guides/latest-model#gpt-5-1-parameter-compatibility
  // GPT-5.1 and GPT-5.2 support temperature, topP, logProbs when reasoningEffort is none
  const supportsNonReasoningParameters = modelId.startsWith("gpt-5.1") || modelId.startsWith("gpt-5.2")

  const systemMessageMode = isReasoningModel ? "developer" : "system"

  return {
    supportsFlexProcessing,
    supportsPriorityProcessing,
    isReasoningModel,
    systemMessageMode,
    supportsNonReasoningParameters
  }
}

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
