/**
 * The `OpenRouterLanguageModel` module provides the OpenRouter implementation
 * of Effect AI's `LanguageModel` service. It translates provider-neutral
 * prompts, tools, files, structured output requests, reasoning metadata,
 * cache-control hints, and provider options into OpenRouter chat completion
 * requests, records GenAI telemetry around those calls, and converts normal or
 * streaming results back into Effect AI response content and metadata.
 *
 * @stability unstable
 * @since 4.0.0
 */
/** @effect-diagnostics preferSchemaOverJson:skip-file */
import * as AiError from "effect/ai/AiError"
import { toCodecAnthropic } from "effect/ai/AnthropicStructuredOutput"
import * as IdGenerator from "effect/ai/IdGenerator"
import * as LanguageModel from "effect/ai/LanguageModel"
import * as AiModel from "effect/ai/Model"
import { toCodecOpenAI } from "effect/ai/OpenAiStructuredOutput"
import type * as Prompt from "effect/ai/Prompt"
import type * as Response from "effect/ai/Response"
import { addGenAIAnnotations } from "effect/ai/Telemetry"
import * as Tool from "effect/ai/Tool"
import * as Arr from "effect/Array"
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
import * as Redactable from "effect/Redactable"
import type * as Schema from "effect/Schema"
import * as SchemaAST from "effect/SchemaAST"
import * as Stream from "effect/Stream"
import type { Span } from "effect/Tracer"
import type { DeepMutable, Mutable, Simplify } from "effect/Types"
import type * as Generated from "./Generated.ts"
import { ReasoningDetailsDuplicateTracker, resolveFinishReason } from "./internal/utilities.ts"
import { type ChatStreamingResponseChunkData, OpenRouterClient } from "./OpenRouterClient.ts"

// =============================================================================
// Configuration
// =============================================================================

/**
 * Context service for OpenRouter language model configuration.
 *
 * **When to use**
 *
 * Use to provide scoped OpenRouter chat completion defaults or per-operation
 * overrides for an OpenRouter language model service.
 *
 * @see {@link withConfigOverride} for scoping language model request overrides
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class Config extends Context.Service<
  Config,
  Simplify<
    & Partial<
      Omit<
        typeof Generated.ChatRequest.Encoded,
        "messages" | "response_format" | "tools" | "tool_choice" | "stream" | "stream_options"
      >
    >
    & {
      /**
       * Whether to use strict JSON schema validation for structured outputs.
       *
       * Only applies to models that support structured outputs. Defaults to
       * `true` when structured outputs are supported.
       */
      readonly strictJsonSchema?: boolean | undefined
    }
  >
>()("@effect/ai-openrouter/OpenRouterLanguageModel/Config") {}

// =============================================================================
// Provider Options / Metadata
// =============================================================================

/**
 * OpenRouter assistant reasoning detail blocks preserved for multi-turn
 * conversations.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ReasoningDetails = Exclude<typeof Generated.ChatAssistantMessage.Encoded["reasoning_details"], undefined>

/**
 * File annotations emitted on OpenRouter assistant messages and exposed in
 * finish metadata.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type FileAnnotation = Extract<
  NonNullable<typeof Generated.ChatAssistantMessage.fields.annotations.Type>[number],
  { type: "file" }
>

declare module "effect/ai/Prompt" {
  /**
   * OpenRouter-specific options for system messages.
   *
   * **Details**
   *
   * These options are used when translating system instructions into
   * OpenRouter chat messages.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface SystemMessageOptions extends ProviderOptions {
    /**
     * Provider-specific options sent to OpenRouter for the system message.
     */
    readonly openrouter?: {
      /**
       * A breakpoint which marks the end of reusable content eligible for caching.
       */
      readonly cacheControl?: typeof Generated.ChatContentCacheControl.Encoded | null
    } | null
  }

  /**
   * OpenRouter-specific options for user messages.
   *
   * **Details**
   *
   * These options are used when translating user content into OpenRouter chat
   * messages.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface UserMessageOptions extends ProviderOptions {
    /**
     * Provider-specific options sent to OpenRouter for the user message.
     */
    readonly openrouter?: {
      /**
       * A breakpoint which marks the end of reusable content eligible for caching.
       */
      readonly cacheControl?: typeof Generated.ChatContentCacheControl.Encoded | null
    } | null
  }

  /**
   * OpenRouter-specific options for assistant messages.
   *
   * **Details**
   *
   * Preserves reasoning metadata when assistant messages are replayed in later
   * OpenRouter requests.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface AssistantMessageOptions extends ProviderOptions {
    /**
     * Provider-specific options sent to OpenRouter for the assistant message.
     */
    readonly openrouter?: {
      /**
       * A breakpoint which marks the end of reusable content eligible for caching.
       */
      readonly cacheControl?: typeof Generated.ChatContentCacheControl.Encoded | null
      /**
       * Reasoning details associated with the assistant message.
       */
      readonly reasoningDetails?: ReasoningDetails | null
    } | null
  }

  /**
   * OpenRouter-specific options for tool messages.
   *
   * **Details**
   *
   * These options are used when converting tool results into OpenRouter chat
   * messages.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface ToolMessageOptions extends ProviderOptions {
    /**
     * Provider-specific options sent to OpenRouter for the tool message.
     */
    readonly openrouter?: {
      /**
       * A breakpoint which marks the end of reusable content eligible for caching.
       */
      readonly cacheControl?: typeof Generated.ChatContentCacheControl.Encoded | null
    } | null
  }

  /**
   * OpenRouter-specific options for text prompt parts.
   *
   * **When to use**
   *
   * Use when you use these options to control how text content is sent to OpenRouter.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface TextPartOptions extends ProviderOptions {
    /**
     * Provider-specific options sent to OpenRouter for the text part.
     */
    readonly openrouter?: {
      /**
       * A breakpoint which marks the end of reusable content eligible for caching.
       */
      readonly cacheControl?: typeof Generated.ChatContentCacheControl.Encoded | null
    } | null
  }

  /**
   * OpenRouter-specific options for reasoning prompt parts.
   *
   * **Details**
   *
   * Preserves provider reasoning blocks so reasoning-aware conversations can
   * continue across OpenRouter requests.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface ReasoningPartOptions extends ProviderOptions {
    /**
     * Provider-specific options sent to OpenRouter for the reasoning part.
     */
    readonly openrouter?: {
      /**
       * A breakpoint which marks the end of reusable content eligible for caching.
       */
      readonly cacheControl?: typeof Generated.ChatContentCacheControl.Encoded | null
      /**
       * Reasoning details associated with the reasoning part.
       */
      readonly reasoningDetails?: ReasoningDetails | null
    } | null
  }

  /**
   * OpenRouter-specific options for file prompt parts.
   *
   * **Details**
   *
   * Controls file naming and prompt caching for files sent to OpenRouter.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface FilePartOptions extends ProviderOptions {
    /**
     * Provider-specific options sent to OpenRouter for the file part.
     */
    readonly openrouter?: {
      /**
       * The name to give to the file. Will be prioritized over the file name
       * associated with the file part, if present.
       */
      readonly fileName?: string | null
      /**
       * A breakpoint which marks the end of reusable content eligible for caching.
       */
      readonly cacheControl?: typeof Generated.ChatContentCacheControl.Encoded | null
    } | null
  }

  /**
   * OpenRouter-specific options for tool call prompt parts.
   *
   * **Details**
   *
   * Preserves reasoning details associated with tool calls when a conversation
   * is sent back to OpenRouter.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface ToolCallPartOptions extends ProviderOptions {
    /**
     * Provider-specific options sent to OpenRouter for the tool call part.
     */
    readonly openrouter?: {
      /**
       * Reasoning details associated with the tool call part.
       */
      readonly reasoningDetails?: ReasoningDetails | null
    } | null
  }

  /**
   * OpenRouter-specific options for tool result prompt parts.
   *
   * **Details**
   *
   * Controls prompt caching for tool results sent to OpenRouter.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface ToolResultPartOptions extends ProviderOptions {
    /**
     * Provider-specific options sent to OpenRouter for the tool result part.
     */
    readonly openrouter?: {
      /**
       * A breakpoint which marks the end of reusable content eligible for caching.
       */
      readonly cacheControl?: typeof Generated.ChatContentCacheControl.Encoded | null
    } | null
  }
}

declare module "effect/ai/Response" {
  /**
   * OpenRouter metadata attached to completed reasoning response parts.
   *
   * **Details**
   *
   * Preserves provider reasoning details that can be sent back in later turns.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface ReasoningPartMetadata extends ProviderMetadata {
    /**
     * Provider-specific metadata returned for the reasoning part.
     */
    readonly openrouter?: {
      /**
       * Reasoning details emitted by the underlying provider for this part.
       */
      readonly reasoningDetails?: ReasoningDetails | null
    } | null
  }

  /**
   * OpenRouter metadata emitted when a streamed reasoning part starts.
   *
   * **Details**
   *
   * Carries the first reasoning detail chunk when OpenRouter exposes one.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface ReasoningStartPartMetadata extends ProviderMetadata {
    /**
     * Provider-specific metadata returned for the streamed reasoning start.
     */
    readonly openrouter?: {
      /**
       * Reasoning details emitted by the underlying provider for this part.
       */
      readonly reasoningDetails?: ReasoningDetails | null
    } | null
  }

  /**
   * OpenRouter metadata emitted for streamed reasoning deltas.
   *
   * **Details**
   *
   * Carries provider reasoning detail chunks as they arrive from OpenRouter.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface ReasoningDeltaPartMetadata extends ProviderMetadata {
    /**
     * Provider-specific metadata returned for the streamed reasoning delta.
     */
    readonly openrouter?: {
      /**
       * Reasoning details emitted by the underlying provider for this delta.
       */
      readonly reasoningDetails?: ReasoningDetails | null
    } | null
  }

  /**
   * OpenRouter metadata attached to tool-call response parts.
   *
   * **Details**
   *
   * Associates tool calls with provider reasoning details when the model emits
   * reasoning and tool calls together.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface ToolCallPartMetadata extends ProviderMetadata {
    /**
     * Provider-specific metadata returned for the tool call.
     */
    readonly openrouter?: {
      /**
       * Reasoning details associated with this tool call.
       */
      readonly reasoningDetails?: ReasoningDetails | null
    } | null
  }

  /**
   * OpenRouter metadata attached to URL source citations.
   *
   * **Details**
   *
   * Includes citation text and offsets returned by providers that support URL
   * annotations.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface UrlSourcePartMetadata extends ProviderMetadata {
    /**
     * Provider-specific citation metadata returned for the URL source.
     */
    readonly openrouter?: {
      /**
       * The cited source content returned by the provider.
       */
      readonly content?: string | null
      /**
       * The zero-based start index of the citation in the generated text.
       */
      readonly startIndex?: number | null
      /**
       * The zero-based end index of the citation in the generated text.
       */
      readonly endIndex?: number | null
    } | null
  }

  /**
   * OpenRouter metadata attached to finish response parts.
   *
   * **Details**
   *
   * Exposes provider response details that are not represented by the common
   * Effect AI finish part fields.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface FinishPartMetadata extends ProviderMetadata {
    /**
     * Provider-specific metadata returned when the OpenRouter response finishes.
     */
    readonly openrouter?: {
      /**
       * Provider fingerprint for the backend configuration that served the request.
       */
      readonly systemFingerprint?: string | null
      /**
       * Raw token usage reported by OpenRouter.
       */
      readonly usage?: typeof Generated.ChatUsage.Encoded | null
      /**
       * File annotations returned by the provider.
       */
      readonly annotations?: ReadonlyArray<FileAnnotation> | null
      /**
       * The OpenRouter provider that served the request, when reported.
       */
      readonly provider?: string | null
    } | null
  }
}

// =============================================================================
// Language Model
// =============================================================================

/**
 * Creates an OpenRouter model descriptor that can be provided with
 * `Effect.provide`.
 *
 * **When to use**
 *
 * Use when you want an OpenRouter language model value that carries provider
 * and model metadata and can be supplied directly to an Effect program.
 *
 * **Details**
 *
 * The returned model requires `OpenRouterClient` and provides
 * `LanguageModel.LanguageModel`.
 *
 * @see {@link layer} for creating a `LanguageModel.LanguageModel` layer directly
 * @see {@link make} for constructing the language model service effectfully
 * @see {@link withConfigOverride} for scoping OpenRouter request overrides
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const model = (
  model: string,
  config?: Omit<typeof Config.Service, "model">
): AiModel.Model<"openai", LanguageModel.LanguageModel, OpenRouterClient> =>
  AiModel.make("openai", model, layer({ model, config }))

/**
 * Creates an OpenRouter `LanguageModel` service from a model identifier and
 * optional request defaults.
 *
 * **When to use**
 *
 * Use when you need to construct a `LanguageModel` value backed by
 * `OpenRouterClient` inside an Effect.
 *
 * **Details**
 *
 * The returned effect requires `OpenRouterClient`. Request defaults from the
 * `config` option are merged with any `Config` service in the context, with
 * context values taking precedence. The service supports both `generateText`
 * and `streamText`.
 *
 * **Gotchas**
 *
 * Provider-defined tools are not supported by this provider integration;
 * requests that include them fail with an `InvalidUserInputError`.
 *
 * @see {@link layer} for providing the service as a `Layer`
 * @see {@link model} for creating a model descriptor for `Effect.provide`
 * @see {@link withConfigOverride} for scoping request defaults around operations
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = Effect.fnUntraced(function*({ model, config: providerConfig }: {
  readonly model: string
  readonly config?: Omit<typeof Config.Service, "model"> | undefined
}): Effect.fn.Return<LanguageModel.LanguageModel, never, OpenRouterClient> {
  const client = yield* OpenRouterClient
  const codecTransformer = getCodecTransformer(model)

  const makeConfig = Effect.contextWith((services: Context.Context<never>) =>
    Effect.succeed({ model, ...providerConfig, ...Context.getOrUndefined(services, Config) })
  )

  const makeRequest = Effect.fnUntraced(
    function*({ config, options }: {
      readonly config: typeof Config.Service
      readonly options: LanguageModel.ProviderOptions
    }): Effect.fn.Return<typeof Generated.ChatRequest.Encoded, AiError.AiError> {
      const messages = yield* prepareMessages({ options })
      const { tools, toolChoice } = yield* prepareTools({ options, transformer: codecTransformer })
      const responseFormat = yield* getResponseFormat({ config, options, transformer: codecTransformer })
      const { strictJsonSchema: _sjs, ...apiConfig } = config
      const request: typeof Generated.ChatRequest.Encoded = {
        ...apiConfig,
        messages,
        ...(Predicate.isNotUndefined(responseFormat) ? { response_format: responseFormat } : undefined),
        ...(Predicate.isNotUndefined(tools) ? { tools } : undefined),
        ...(Predicate.isNotUndefined(toolChoice) ? { tool_choice: toolChoice } : undefined)
      }
      return request
    }
  )

  return yield* LanguageModel.make({
    codecTransformer: toCodecOpenAI,
    generateText: Effect.fnUntraced(
      function*(options) {
        const config = yield* makeConfig
        const request = yield* makeRequest({ config, options })
        annotateRequest(options.span, request)
        const [rawResponse, response] = yield* client.createChatCompletion(request)
        annotateResponse(options.span, rawResponse)
        return yield* makeResponse({ rawResponse, response })
      }
    ),
    streamText: Effect.fnUntraced(
      function*(options) {
        const config = yield* makeConfig
        const request = yield* makeRequest({ config, options })
        annotateRequest(options.span, request)
        const [response, stream] = yield* client.createChatCompletionStream(request)
        return yield* makeStreamResponse({ response, stream })
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
 * Creates a layer for the OpenRouter language model.
 *
 * **When to use**
 *
 * Use when composing application layers and you want OpenRouter to satisfy
 * `LanguageModel.LanguageModel` while supplying `OpenRouterClient` from another
 * layer.
 *
 * @see {@link make} for constructing the language model service effectfully
 * @see {@link model} for creating a model descriptor for `Effect.provide`
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer = (options: {
  readonly model: string
  readonly config?: Omit<typeof Config.Service, "model"> | undefined
}): Layer.Layer<LanguageModel.LanguageModel, never, OpenRouterClient> =>
  Layer.effect(LanguageModel.LanguageModel, make(options))

/**
 * Provides config overrides for OpenRouter language model operations.
 *
 * **When to use**
 *
 * Use to apply OpenRouter request configuration to one effect without changing
 * the model's default configuration.
 *
 * **Details**
 *
 * The overrides are merged with any existing `Config` service for the duration
 * of the supplied effect. Fields in `overrides` take precedence over existing
 * config, and the helper supports both pipe form and
 * `withConfigOverride(effect, overrides)`.
 *
 * @see {@link Config} for available OpenRouter request configuration fields
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

const prepareMessages = Effect.fnUntraced(
  function*({ options }: {
    readonly options: LanguageModel.ProviderOptions
  }): Effect.fn.Return<ReadonlyArray<typeof Generated.ChatMessages.Encoded>, AiError.AiError> {
    const messages: Array<typeof Generated.ChatMessages.Encoded> = []

    const reasoningDetailsTracker = new ReasoningDetailsDuplicateTracker()

    for (const message of options.prompt.content) {
      switch (message.role) {
        case "system": {
          const cache_control = getCacheControl(message)

          messages.push({
            role: "system",
            content: [{
              type: "text",
              text: message.content,
              ...(Predicate.isNotNull(cache_control) ? { cache_control } : undefined)
            }]
          })

          break
        }

        case "user": {
          const content: Array<typeof Generated.ChatContentItems.Encoded> = []

          // Get the message-level cache control
          const messageCacheControl = getCacheControl(message)

          if (message.content.length === 1 && message.content[0].type === "text") {
            messages.push({
              role: "user",
              content: Predicate.isNotNull(messageCacheControl)
                ? [{ type: "text", text: message.content[0].text, cache_control: messageCacheControl }]
                : message.content[0].text
            })

            break
          }

          // Find the index of the last text part in the message content
          let lastTextPartIndex = -1
          for (let i = message.content.length - 1; i >= 0; i--) {
            if (message.content[i].type === "text") {
              lastTextPartIndex = i
              break
            }
          }

          for (let index = 0; index < message.content.length; index++) {
            const part = message.content[index]
            const isLastTextPart = part.type === "text" && index === lastTextPartIndex
            const partCacheControl = getCacheControl(part)

            switch (part.type) {
              case "text": {
                const cache_control = Predicate.isNotNull(partCacheControl)
                  ? partCacheControl
                  : isLastTextPart
                  ? messageCacheControl
                  : null

                content.push({
                  type: "text",
                  text: part.text,
                  ...(Predicate.isNotNull(cache_control) ? { cache_control } : undefined)
                })

                break
              }

              case "file": {
                if (part.mediaType.startsWith("image/")) {
                  const mediaType = part.mediaType === "image/*" ? "image/jpeg" : part.mediaType

                  content.push({
                    type: "image_url",
                    image_url: {
                      url: part.data instanceof URL
                        ? part.data.toString()
                        : part.data instanceof Uint8Array
                        ? `data:${mediaType};base64,${Base64.encode(part.data)}`
                        : part.data
                    },
                    ...(Predicate.isNotNull(partCacheControl) ? { cache_control: partCacheControl } : undefined)
                  })

                  break
                }

                if (part.mediaType.startsWith("audio/")) {
                  const format = audioFormats[part.mediaType.toLowerCase()]

                  if (Predicate.isUndefined(format)) {
                    return yield* AiError.make({
                      module: "OpenRouterLanguageModel",
                      method: "prepareMessages",
                      reason: new AiError.InvalidUserInputError({
                        description: `Detected unsupported media type for audio file: '${part.mediaType}' ` +
                          `- OpenRouter supports ${supportedAudioFormats} audio`
                      })
                    })
                  }

                  if (part.data instanceof URL) {
                    return yield* AiError.make({
                      module: "OpenRouterLanguageModel",
                      method: "prepareMessages",
                      reason: new AiError.InvalidUserInputError({
                        description: "Detected URL data for audio file - OpenRouter requires " +
                          "audio to be provided as base64-encoded data"
                      })
                    })
                  }

                  content.push({
                    type: "input_audio",
                    input_audio: {
                      data: part.data instanceof Uint8Array
                        ? Base64.encode(part.data)
                        : getBase64FromDataUrl(part.data),
                      format
                    },
                    ...(Predicate.isNotNull(partCacheControl) ? { cache_control: partCacheControl } : undefined)
                  })

                  break
                }

                const options = part.options.openrouter
                const fileName = options?.fileName ?? part.fileName ?? ""

                content.push({
                  type: "file",
                  file: {
                    filename: fileName,
                    file_data: part.data instanceof URL
                      ? part.data.toString()
                      : part.data instanceof Uint8Array
                      ? `data:${part.mediaType};base64,${Base64.encode(part.data)}`
                      : part.data
                  },
                  ...(Predicate.isNotNull(partCacheControl) ? { cache_control: partCacheControl } : undefined)
                } as any)

                break
              }
            }
          }

          messages.push({ role: "user", content })

          break
        }

        case "assistant": {
          let text = ""
          let reasoning = ""
          const toolCalls: Array<typeof Generated.ChatToolCall.Encoded> = []

          for (const part of message.content) {
            switch (part.type) {
              case "text": {
                text += part.text
                break
              }

              case "reasoning": {
                reasoning += part.text
                break
              }

              case "tool-call": {
                toolCalls.push({
                  type: "function",
                  id: part.id,
                  function: { name: part.name, arguments: JSON.stringify(part.params) }
                })
                break
              }

              default: {
                break
              }
            }
          }

          const messageReasoningDetails = message.options.openrouter?.reasoningDetails

          // Use message-level reasoning details if available, otherwise find from parts
          // Priority: message-level > first tool call > first reasoning part
          // This prevents duplicate thinking blocks when Claude makes parallel tool calls
          const candidateReasoningDetails: ReasoningDetails | null = Predicate.isNotNullish(messageReasoningDetails)
              && Array.isArray(messageReasoningDetails)
              && messageReasoningDetails.length > 0
            ? messageReasoningDetails
            : findFirstReasoningDetails(message.content)

          // Deduplicate reasoning details across all messages to prevent "Duplicate
          // item found with id" errors in multi-turn conversations.
          let reasoningDetails: ReasoningDetails | null = null
          if (Predicate.isNotNull(candidateReasoningDetails) && candidateReasoningDetails.length > 0) {
            const uniqueReasoningDetails: Mutable<ReasoningDetails> = []
            for (const detail of candidateReasoningDetails) {
              if (reasoningDetailsTracker.upsert(detail)) {
                uniqueReasoningDetails.push(detail)
              }
            }
            if (uniqueReasoningDetails.length > 0) {
              reasoningDetails = uniqueReasoningDetails
            }
          }

          messages.push({
            role: "assistant",
            content: text,
            reasoning: reasoning.length > 0 ? reasoning : null,
            ...(Predicate.isNotNull(reasoningDetails) ? { reasoning_details: reasoningDetails } : undefined),
            ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : undefined)
          })

          break
        }

        case "tool": {
          for (const part of message.content) {
            // Skip tool approval parts
            if (part.type === "tool-approval-response") {
              continue
            }

            messages.push({
              role: "tool",
              tool_call_id: part.id,
              content: typeof part.result === "string" ? part.result : JSON.stringify(part.result)
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

const makeResponse = Effect.fnUntraced(
  function*({ rawResponse, response }: {
    readonly rawResponse: Generated.SendChatCompletionRequest200
    readonly response: HttpClientResponse.HttpClientResponse
  }): Effect.fn.Return<Array<Response.PartEncoded>, AiError.AiError, IdGenerator.IdGenerator> {
    const idGenerator = yield* IdGenerator.IdGenerator

    const parts: Array<Response.PartEncoded> = []
    let hasToolCalls = false
    let hasEncryptedReasoning = false

    const createdAt = new Date(rawResponse.created * 1000)
    parts.push({
      type: "response-metadata",
      id: rawResponse.id,
      modelId: rawResponse.model,
      timestamp: DateTime.formatIso(DateTime.fromDateUnsafe(createdAt)),
      request: buildHttpRequestDetails(response.request)
    })

    const choice = rawResponse.choices[0]
    if (Predicate.isUndefined(choice)) {
      return yield* AiError.make({
        module: "OpenRouterLanguageModel",
        method: "makeResponse",
        reason: new AiError.InvalidOutputError({
          description: "Received response with empty choices"
        })
      })
    }

    const message = choice.message
    let finishReason = choice.finish_reason

    const reasoningDetails = message.reasoning_details
    if (Predicate.isNotNullish(reasoningDetails) && reasoningDetails.length > 0) {
      for (const detail of reasoningDetails) {
        switch (detail.type) {
          case "reasoning.text": {
            if (Predicate.isNotNullish(detail.text) && detail.text.length > 0) {
              parts.push({
                type: "reasoning",
                text: detail.text,
                metadata: { openrouter: { reasoningDetails: [detail] } }
              })
            }
            break
          }
          case "reasoning.summary": {
            if (detail.summary.length > 0) {
              parts.push({
                type: "reasoning",
                text: detail.summary,
                metadata: { openrouter: { reasoningDetails: [detail] } }
              })
            }
            break
          }
          case "reasoning.encrypted": {
            if (detail.data.length > 0) {
              hasEncryptedReasoning = true
              parts.push({
                type: "reasoning",
                text: "[REDACTED]",
                metadata: { openrouter: { reasoningDetails: [detail] } }
              })
            }
            break
          }
        }
      }
    } else if (Predicate.isNotNullish(message.reasoning) && message.reasoning.length > 0) {
      // message.reasoning fallback only when reasoning_details absent/empty
      parts.push({
        type: "reasoning",
        text: message.reasoning
      })
    }

    const content = message.content
    if (Predicate.isNotNullish(content)) {
      if (typeof content === "string") {
        if (content.length > 0) {
          parts.push({ type: "text", text: content })
        }
      } else {
        for (const item of content) {
          if (item.type === "text") {
            parts.push({ type: "text", text: item.text })
          }
        }
      }
    }

    const toolCalls = message.tool_calls
    if (Predicate.isNotNullish(toolCalls) && toolCalls.length > 0) {
      hasToolCalls = true
      for (let index = 0; index < toolCalls.length; index++) {
        const toolCall = toolCalls[index]
        const toolName = toolCall.function.name
        const toolParams = toolCall.function.arguments ?? "{}"
        const params = yield* Effect.try({
          try: () => Tool.unsafeSecureJsonParse(toolParams),
          catch: (cause) =>
            AiError.make({
              module: "OpenRouterLanguageModel",
              method: "makeResponse",
              reason: new AiError.ToolParameterValidationError({
                toolName,
                description: `Failed to securely JSON parse tool parameters: ${cause}`
              })
            })
        })
        parts.push({
          type: "tool-call",
          id: toolCall.id,
          name: toolName,
          params,
          // Only attach reasoning_details to the first tool call to avoid
          // duplicating thinking blocks for parallel tool calls (Claude)
          ...(index === 0 && Predicate.isNotNullish(reasoningDetails) && reasoningDetails.length > 0
            ? { metadata: { openrouter: { reasoningDetails } } }
            : undefined)
        })
      }
    }

    const images = message.images
    if (Predicate.isNotNullish(images)) {
      for (const image of images) {
        const url = image.image_url.url
        if (url.startsWith("data:")) {
          const mediaType = getMediaType(url, "image/jpeg")
          const data = getBase64FromDataUrl(url)
          parts.push({ type: "file", mediaType, data })
        } else {
          const id = yield* idGenerator.generateId()
          parts.push({ type: "source", sourceType: "url", id, url, title: "" })
        }
      }
    }

    const annotations = choice.message.annotations
    if (Predicate.isNotNullish(annotations)) {
      for (const annotation of annotations) {
        if (annotation.type === "url_citation") {
          parts.push({
            type: "source",
            sourceType: "url",
            id: annotation.url_citation.url,
            url: annotation.url_citation.url,
            title: annotation.url_citation.title ?? "",
            metadata: {
              openrouter: {
                ...(Predicate.isNotUndefined(annotation.url_citation.content)
                  ? { content: annotation.url_citation.content }
                  : undefined),
                ...(Predicate.isNotUndefined(annotation.url_citation.start_index)
                  ? { startIndex: annotation.url_citation.start_index }
                  : undefined),
                ...(Predicate.isNotUndefined(annotation.url_citation.end_index)
                  ? { endIndex: annotation.url_citation.end_index }
                  : undefined)
              }
            }
          })
        }
      }
    }

    // Extract file annotations to expose in provider metadata
    const fileAnnotations = annotations?.filter((annotation) => {
      return annotation.type === "file"
    })

    // Fix for Gemini 3 thoughtSignature: when there are tool calls with encrypted
    // reasoning (thoughtSignature), the model returns 'stop' but expects continuation.
    // Override to 'tool-calls' so the SDK knows to continue the conversation.
    if (hasEncryptedReasoning && hasToolCalls && finishReason === "stop") {
      finishReason = "tool_calls"
    }

    parts.push({
      type: "finish",
      reason: resolveFinishReason(finishReason),
      usage: getUsage(rawResponse.usage),
      response: buildHttpResponseDetails(response),
      metadata: {
        openrouter: {
          systemFingerprint: rawResponse.system_fingerprint ?? null,
          usage: rawResponse.usage ?? null,
          ...(Predicate.isNotUndefined(fileAnnotations) && fileAnnotations.length > 0
            ? { annotations: fileAnnotations }
            : undefined),
          ...(Predicate.hasProperty(rawResponse, "provider") && Predicate.isString(rawResponse.provider)
            ? { provider: rawResponse.provider }
            : undefined)
        }
      }
    })

    return parts
  }
)

const makeStreamResponse = Effect.fnUntraced(
  function*({ response, stream }: {
    readonly response: HttpClientResponse.HttpClientResponse
    readonly stream: Stream.Stream<ChatStreamingResponseChunkData, AiError.AiError>
  }): Effect.fn.Return<
    Stream.Stream<Response.StreamPartEncoded, AiError.AiError>,
    AiError.AiError,
    IdGenerator.IdGenerator
  > {
    const idGenerator = yield* IdGenerator.IdGenerator

    let textStarted = false
    let reasoningStarted = false
    let responseMetadataEmitted = false
    let reasoningDetailsAttachedToToolCall = false
    let finishReason: Response.FinishReason = "other"
    let openRouterResponseId: string | undefined = undefined
    let activeReasoningId: string | undefined = undefined
    let activeTextId: string | undefined = undefined

    let totalToolCalls = 0
    const activeToolCalls: Record<number, {
      readonly id: string
      readonly type: "function"
      readonly name: string
      params: string
    }> = {}

    // Track reasoning details to preserve for multi-turn conversations
    const accumulatedReasoningDetails: DeepMutable<ReasoningDetails> = []

    // Track file annotations to expose in provider metadata
    const accumulatedFileAnnotations: Array<FileAnnotation> = []

    const usage: DeepMutable<Response.Usage> = {
      inputTokens: {
        total: undefined,
        uncached: undefined,
        cacheRead: undefined,
        cacheWrite: undefined
      },
      outputTokens: {
        total: undefined,
        text: undefined,
        reasoning: undefined
      }
    }

    return stream.pipe(
      Stream.mapEffect(Effect.fnUntraced(function*(event) {
        const parts: Array<Response.StreamPartEncoded> = []

        if (Predicate.isNotUndefined(event.error)) {
          finishReason = "error"
          parts.push({ type: "error", error: event.error })
        }

        if (Predicate.isNotUndefined(event.id) && !responseMetadataEmitted) {
          const timestamp = yield* DateTime.now
          parts.push({
            type: "response-metadata",
            id: event.id,
            modelId: event.model,
            timestamp: DateTime.formatIso(timestamp),
            request: buildHttpRequestDetails(response.request)
          })
          responseMetadataEmitted = true
        }

        if (Predicate.isNotUndefined(event.usage)) {
          const computed = getUsage(event.usage)
          usage.inputTokens = computed.inputTokens
          usage.outputTokens = computed.outputTokens
        }

        const choice = event.choices[0]
        if (Predicate.isNotUndefined(choice)) {
          if (Predicate.isNotNullish(choice.finish_reason)) {
            finishReason = resolveFinishReason(choice.finish_reason)
          }

          const delta = choice.delta
          if (Predicate.isNullish(delta)) {
            return parts
          }

          const emitReasoning = Effect.fnUntraced(
            function*(delta: string, metadata?: Response.ReasoningDeltaPart["metadata"] | undefined) {
              if (!reasoningStarted) {
                activeReasoningId = openRouterResponseId ?? (yield* idGenerator.generateId())
                parts.push({
                  type: "reasoning-start",
                  id: activeReasoningId,
                  metadata
                })
                reasoningStarted = true
              }
              parts.push({
                type: "reasoning-delta",
                id: activeReasoningId!,
                delta,
                metadata
              })
            }
          )

          const reasoningDetails = delta.reasoning_details
          if (Predicate.isNotUndefined(reasoningDetails) && reasoningDetails.length > 0) {
            // Accumulate reasoning_details to preserve for multi-turn conversations
            // Merge consecutive reasoning.text items into a single entry
            for (const detail of reasoningDetails) {
              if (detail.type === "reasoning.text") {
                const lastDetail = accumulatedReasoningDetails[accumulatedReasoningDetails.length - 1]
                if (Predicate.isNotUndefined(lastDetail) && lastDetail.type === "reasoning.text") {
                  // Merge with the previous text detail
                  lastDetail.text = (lastDetail.text ?? "") + (detail.text ?? "")
                  lastDetail.signature = lastDetail.signature ?? detail.signature ?? null
                  lastDetail.format = lastDetail.format ?? detail.format ?? null
                } else {
                  // Start a new text detail
                  accumulatedReasoningDetails.push({ ...detail })
                }
              } else {
                // Non-text details (encrypted, summary) are pushed as-is
                accumulatedReasoningDetails.push(detail)
              }
            }

            // Emit reasoning_details in providerMetadata for each delta chunk
            // so users can accumulate them on their end before sending back
            const metadata: Response.ReasoningDeltaPart["metadata"] = {
              openrouter: {
                reasoningDetails
              }
            }
            for (const detail of reasoningDetails) {
              switch (detail.type) {
                case "reasoning.text": {
                  if (Predicate.isNotNullish(detail.text)) {
                    yield* emitReasoning(detail.text, metadata)
                  }
                  break
                }

                case "reasoning.summary": {
                  if (Predicate.isNotNullish(detail.summary)) {
                    yield* emitReasoning(detail.summary, metadata)
                  }
                  break
                }

                case "reasoning.encrypted": {
                  if (Predicate.isNotNullish(detail.data)) {
                    yield* emitReasoning("[REDACTED]", metadata)
                  }
                  break
                }
              }
            }
          } else if (Predicate.isNotNullish(delta.reasoning)) {
            yield* emitReasoning(delta.reasoning)
          }

          const content = delta.content
          if (Predicate.isNotNullish(content)) {
            // If reasoning was previously active and now we're starting text content,
            // we should end the reasoning first to maintain proper order
            if (reasoningStarted && !textStarted) {
              parts.push({
                type: "reasoning-end",
                id: activeReasoningId!,
                // Include accumulated reasoning_details so the we can update the
                // reasoning part's provider metadata with the correct signature.
                // The signature typically arrives in the last reasoning delta,
                // but reasoning-start only carries the first delta's metadata.
                metadata: accumulatedReasoningDetails.length > 0
                  ? { openrouter: { reasoningDetails: accumulatedReasoningDetails } }
                  : undefined
              })
              reasoningStarted = false
            }

            if (!textStarted) {
              activeTextId = openRouterResponseId ?? (yield* idGenerator.generateId())
              parts.push({
                type: "text-start",
                id: activeTextId
              })
              textStarted = true
            }

            parts.push({
              type: "text-delta",
              id: activeTextId!,
              delta: content
            })
          }

          const annotations = delta.annotations
          if (Predicate.isNotNullish(annotations)) {
            for (const annotation of annotations) {
              if (annotation.type === "url_citation") {
                parts.push({
                  type: "source",
                  sourceType: "url",
                  id: annotation.url_citation.url,
                  url: annotation.url_citation.url,
                  title: annotation.url_citation.title ?? "",
                  metadata: {
                    openrouter: {
                      ...(Predicate.isNotUndefined(annotation.url_citation.content)
                        ? { content: annotation.url_citation.content }
                        : undefined),
                      ...(Predicate.isNotUndefined(annotation.url_citation.start_index)
                        ? { startIndex: annotation.url_citation.start_index }
                        : undefined),
                      ...(Predicate.isNotUndefined(annotation.url_citation.end_index)
                        ? { endIndex: annotation.url_citation.end_index }
                        : undefined)
                    }
                  }
                })
              } else if (annotation.type === "file") {
                accumulatedFileAnnotations.push(annotation)
              }
            }
          }

          const toolCalls = delta.tool_calls
          if (Predicate.isNotNullish(toolCalls)) {
            for (const toolCall of toolCalls) {
              const index = toolCall.index ?? toolCalls.length - 1
              let activeToolCall = activeToolCalls[index]
              const argumentsDelta = toolCall.function?.arguments ?? ""

              // Tool call start - OpenRouter returns all information except the
              // tool call parameters in the first chunk
              if (Predicate.isUndefined(activeToolCall)) {
                if (toolCall.type !== "function") {
                  return yield* AiError.make({
                    module: "OpenRouterLanguageModel",
                    method: "makeStreamResponse",
                    reason: new AiError.InvalidOutputError({
                      description: "Received tool call delta that was not of type: 'function'"
                    })
                  })
                }

                if (Predicate.isNullish(toolCall.id)) {
                  return yield* AiError.make({
                    module: "OpenRouterLanguageModel",
                    method: "makeStreamResponse",
                    reason: new AiError.InvalidOutputError({
                      description: "Received tool call delta without a tool call identifier"
                    })
                  })
                }

                if (Predicate.isNullish(toolCall.function?.name)) {
                  return yield* AiError.make({
                    module: "OpenRouterLanguageModel",
                    method: "makeStreamResponse",
                    reason: new AiError.InvalidOutputError({
                      description: "Received tool call delta without a tool call name"
                    })
                  })
                }

                activeToolCall = {
                  id: toolCall.id,
                  type: "function",
                  name: toolCall.function.name,
                  params: argumentsDelta
                }

                activeToolCalls[index] = activeToolCall

                parts.push({
                  type: "tool-params-start",
                  id: activeToolCall.id,
                  name: activeToolCall.name
                })
              } else {
                activeToolCall.params += argumentsDelta
              }

              // Emit a tool call delta part if parameters were also sent
              if (argumentsDelta.length > 0) {
                parts.push({
                  type: "tool-params-delta",
                  id: activeToolCall.id,
                  delta: argumentsDelta
                })
              }

              // Check if the tool call is complete
              // @effect-diagnostics-next-line tryCatchInEffectGen:off
              try {
                const params = Tool.unsafeSecureJsonParse(activeToolCall.params)

                parts.push({
                  type: "tool-params-end",
                  id: activeToolCall.id
                })

                parts.push({
                  type: "tool-call",
                  id: activeToolCall.id,
                  name: activeToolCall.name,
                  params,
                  // Only attach reasoning_details to the first tool call to avoid
                  // duplicating thinking blocks for parallel tool calls (Claude)
                  metadata: reasoningDetailsAttachedToToolCall ? undefined : {
                    openrouter: { reasoningDetails: accumulatedReasoningDetails }
                  }
                })

                reasoningDetailsAttachedToToolCall = true

                // Increment the total tool calls emitted by the stream and
                // remove the active tool call
                totalToolCalls += 1
                delete activeToolCalls[toolCall.index]
              } catch {
                // Tool call incomplete, continue parsing
                continue
              }
            }
          }

          const images = delta.images
          if (Predicate.isNotNullish(images)) {
            for (const image of images) {
              parts.push({
                type: "file",
                mediaType: getMediaType(image.image_url.url, "image/jpeg"),
                data: getBase64FromDataUrl(image.image_url.url)
              })
            }
          }
        }

        // Usage is only emitted by the last part of the stream, so we need to
        // handle flushing any remaining text / reasoning / tool calls
        if (Predicate.isNotUndefined(event.usage)) {
          // Fix for Gemini 3 thoughtSignature: when there are tool calls with encrypted
          // reasoning (thoughtSignature), the model returns 'stop' but expects continuation.
          // Override to 'tool-calls' so the SDK knows to continue the conversation.
          const hasEncryptedReasoning = accumulatedReasoningDetails.some(
            (detail) => detail.type === "reasoning.encrypted" && detail.data.length > 0
          )
          if (totalToolCalls > 0 && hasEncryptedReasoning && finishReason === "stop") {
            finishReason = "tool-calls"
          }

          // Forward any unsent tool calls if finish reason is 'tool-calls'
          if (finishReason === "tool-calls") {
            for (const toolCall of Object.values(activeToolCalls)) {
              // Coerce invalid tool call parameters to an empty object
              let params: unknown
              // @effect-diagnostics-next-line tryCatchInEffectGen:off
              try {
                params = Tool.unsafeSecureJsonParse(toolCall.params)
              } catch {
                params = {}
              }

              // Only attach reasoning_details to the first tool call to avoid
              // duplicating thinking blocks for parallel tool calls (Claude)
              parts.push({
                type: "tool-call",
                id: toolCall.id,
                name: toolCall.name,
                params,
                metadata: reasoningDetailsAttachedToToolCall ? undefined : {
                  openrouter: { reasoningDetails: accumulatedReasoningDetails }
                }
              })

              reasoningDetailsAttachedToToolCall = true
            }
          }

          // End reasoning first if it was started, to maintain proper order
          if (reasoningStarted) {
            parts.push({
              type: "reasoning-end",
              id: activeReasoningId!,
              // Include accumulated reasoning_details so that we can update the
              // reasoning part's provider metadata with the correct signature,
              metadata: accumulatedReasoningDetails.length > 0
                ? { openrouter: { reasoningDetails: accumulatedReasoningDetails } }
                : undefined
            })
          }

          if (textStarted) {
            parts.push({ type: "text-end", id: activeTextId! })
          }

          const metadata: Response.FinishPart["metadata"] = {
            openrouter: {
              ...(Predicate.isNotNullish(event.system_fingerprint)
                ? { systemFingerprint: event.system_fingerprint }
                : undefined),
              ...(Predicate.isNotUndefined(event.usage) ? { usage: event.usage } : undefined),
              ...(Predicate.hasProperty(event, "provider") && Predicate.isString(event.provider)
                ? { provider: event.provider }
                : undefined),
              ...(accumulatedFileAnnotations.length > 0 ? { annotations: accumulatedFileAnnotations } : undefined)
            }
          }

          parts.push({
            type: "finish",
            reason: finishReason,
            usage,
            response: buildHttpResponseDetails(response),
            metadata
          })
        }

        return parts
      })),
      Stream.flattenIterable
    )
  }
)

// =============================================================================
// Tool Conversion
// =============================================================================

const prepareTools = Effect.fnUntraced(
  function*({ options, transformer }: {
    readonly options: LanguageModel.ProviderOptions
    readonly transformer: LanguageModel.CodecTransformer
  }): Effect.fn.Return<{
    readonly tools: ReadonlyArray<typeof Generated.ChatFunctionTool.Encoded> | undefined
    readonly toolChoice: typeof Generated.ChatToolChoice.Encoded | undefined
  }, AiError.AiError> {
    if (options.tools.length === 0) {
      return { tools: undefined, toolChoice: undefined }
    }

    const hasProviderDefinedTools = options.tools.some((tool) => Tool.isProviderDefined(tool))
    if (hasProviderDefinedTools) {
      return yield* AiError.make({
        module: "OpenRouterLanguageModel",
        method: "prepareTools",
        reason: new AiError.InvalidUserInputError({
          description: "Provider-defined tools are unsupported by the OpenRouter " +
            "provider integration at this time"
        })
      })
    }

    let tools: Array<Extract<typeof Generated.ChatFunctionTool.Encoded, { readonly type: "function" }>> = []
    let toolChoice: typeof Generated.ChatToolChoice.Encoded | undefined = undefined

    for (const tool of options.tools) {
      const description = Tool.getDescription(tool)
      const parameters = yield* tryToolJsonSchema(tool, "prepareTools", transformer)
      const strict = Tool.getStrictMode(tool) ?? null

      tools.push({
        type: "function",
        function: {
          name: tool.name,
          parameters,
          strict,
          ...(Predicate.isNotUndefined(description) ? { description } : undefined)
        }
      })
    }

    if (options.toolChoice === "none") {
      toolChoice = "none"
    } else if (options.toolChoice === "auto") {
      toolChoice = "auto"
    } else if (options.toolChoice === "required") {
      toolChoice = "required"
    } else if ("tool" in options.toolChoice) {
      toolChoice = { type: "function", function: { name: options.toolChoice.tool } }
    } else {
      const allowedTools = new Set(options.toolChoice.oneOf)
      tools = tools.filter((tool) => allowedTools.has(tool.function.name))
      toolChoice = options.toolChoice.mode === "required" ? "required" : "auto"
    }

    return { tools, toolChoice }
  }
)

// =============================================================================
// Telemetry
// =============================================================================

const annotateRequest = (
  span: Span,
  request: typeof Generated.ChatRequest.Encoded
): void => {
  addGenAIAnnotations(span, {
    system: "openrouter",
    operation: { name: "chat" },
    request: {
      model: request.model,
      temperature: request.temperature,
      topP: request.top_p,
      maxTokens: request.max_tokens,
      stopSequences: Arr.ensure(request.stop).filter(
        Predicate.isNotNullish
      )
    }
  })
}

const annotateResponse = (span: Span, response: Generated.SendChatCompletionRequest200): void => {
  addGenAIAnnotations(span, {
    response: {
      id: response.id,
      model: response.model,
      finishReasons: response.choices.map((choice) => choice.finish_reason).filter(Predicate.isNotNullish)
    },
    usage: {
      inputTokens: response.usage?.prompt_tokens,
      outputTokens: response.usage?.completion_tokens
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
    addGenAIAnnotations(span, {
      response: {
        finishReasons: [part.reason]
      },
      usage: {
        inputTokens: part.usage.inputTokens.total,
        outputTokens: part.usage.outputTokens.total
      }
    })
  }
}

// =============================================================================
// Internal Utilities
// =============================================================================

const getCacheControl = (
  part:
    | Prompt.SystemMessage
    | Prompt.UserMessage
    | Prompt.AssistantMessage
    | Prompt.ToolMessage
    | Prompt.TextPart
    | Prompt.ReasoningPart
    | Prompt.FilePart
    | Prompt.ToolResultPart
): typeof Generated.ChatContentCacheControl.Encoded | null => part.options.openrouter?.cacheControl ?? null

const findFirstReasoningDetails = (content: ReadonlyArray<Prompt.AssistantMessagePart>): ReasoningDetails | null => {
  for (const part of content) {
    // First try tool calls since they have complete accumulated reasoning details
    if (part.type === "tool-call") {
      const details = part.options.openrouter?.reasoningDetails
      if (Predicate.isNotNullish(details) && Array.isArray(details) && details.length > 0) {
        return details as ReasoningDetails
      }
    }

    // Fallback to reasoning parts which have delta reasoning details
    if (part.type === "reasoning") {
      const details = part.options.openrouter?.reasoningDetails
      if (Predicate.isNotNullish(details) && Array.isArray(details) && details.length > 0) {
        return details as ReasoningDetails
      }
    }
  }

  return null
}

const getCodecTransformer = (model: string): LanguageModel.CodecTransformer => {
  if (model.startsWith("anthropic/") || model.startsWith("claude-")) {
    return toCodecAnthropic
  }
  if (
    model.startsWith("openai/") ||
    model.startsWith("gpt-") ||
    model.startsWith("o1-") ||
    model.startsWith("o3-") ||
    model.startsWith("o4-")
  ) {
    return toCodecOpenAI
  }
  return LanguageModel.defaultCodecTransformer
}

const unsupportedSchemaError = (error: unknown, method: string): AiError.AiError =>
  AiError.make({
    module: "OpenRouterLanguageModel",
    method,
    reason: new AiError.UnsupportedSchemaError({
      description: error instanceof Error ? error.message : String(error)
    })
  })

const tryJsonSchema = <S extends Schema.Constraint>(
  schema: S,
  method: string,
  transformer: LanguageModel.CodecTransformer
) =>
  Effect.try({
    try: () => Tool.getJsonSchemaFromSchema(schema, { transformer }),
    catch: (error) => unsupportedSchemaError(error, method)
  })

const tryToolJsonSchema = <T extends Tool.Any>(tool: T, method: string, transformer: LanguageModel.CodecTransformer) =>
  Effect.try({
    try: () => Tool.getJsonSchema(tool, { transformer }),
    catch: (error) => unsupportedSchemaError(error, method)
  })

const getResponseFormat = Effect.fnUntraced(function*({ config, options, transformer }: {
  readonly config: typeof Config.Service
  readonly options: LanguageModel.ProviderOptions
  readonly transformer: LanguageModel.CodecTransformer
}): Effect.fn.Return<typeof Generated.ChatFormatJsonSchemaConfig.Encoded | undefined, AiError.AiError> {
  if (options.responseFormat.type === "json") {
    const description = SchemaAST.resolveDescription(options.responseFormat.schema.ast)
    const jsonSchema = yield* tryJsonSchema(options.responseFormat.schema, "getResponseFormat", transformer)
    return {
      type: "json_schema",
      json_schema: {
        name: options.responseFormat.objectName,
        schema: jsonSchema,
        strict: config.strictJsonSchema ?? null,
        ...(Predicate.isNotUndefined(description) ? { description } : undefined)
      }
    }
  }
  return undefined
})

/**
 * Maps audio media types to the formats supported by OpenRouter.
 *
 * @see https://openrouter.ai/docs/guides/overview/multimodal/audio
 */
const audioFormats: Record<string, string> = {
  "audio/aac": "aac",
  "audio/aiff": "aiff",
  "audio/x-aiff": "aiff",
  "audio/flac": "flac",
  "audio/x-flac": "flac",
  "audio/l16": "pcm16",
  "audio/l24": "pcm24",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/mp4": "m4a",
  "audio/mp3": "mp3",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/wave": "wav",
  "audio/x-wav": "wav"
}

const supportedAudioFormats = Array.from(new Set(Object.values(audioFormats))).join(", ")

const getMediaType = (dataUrl: string, defaultMediaType: string): string => {
  const match = dataUrl.match(/^data:([^;]+)/)
  return match ? (match[1] ?? defaultMediaType) : defaultMediaType
}

const getBase64FromDataUrl = (dataUrl: string): string => {
  const match = dataUrl.match(/^data:[^;]*;base64,(.+)$/)
  return match ? match[1]! : dataUrl
}

const getUsage = (usage: Generated.ChatUsage | undefined): Response.Usage => {
  if (Predicate.isUndefined(usage)) {
    return {
      inputTokens: { uncached: undefined, total: 0, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 0, text: undefined, reasoning: undefined }
    }
  }
  const promptTokens = usage.prompt_tokens
  const completionTokens = usage.completion_tokens
  const cacheReadTokens = usage.prompt_tokens_details?.cached_tokens ?? 0
  const cacheWriteTokens = usage.prompt_tokens_details?.cache_write_tokens ?? 0
  const reasoningTokens = usage.completion_tokens_details?.reasoning_tokens ?? 0
  // Some providers report cached or reasoning tokens separately from their parent counts.
  // Treat details exceeding the parent as disjoint to avoid negative remainders.
  // Otherwise, retain subset accounting.
  const inputTotal = cacheReadTokens > promptTokens ? promptTokens + cacheReadTokens : promptTokens
  const outputTotal = reasoningTokens > completionTokens ? completionTokens + reasoningTokens : completionTokens
  return {
    inputTokens: {
      uncached: inputTotal - cacheReadTokens,
      total: inputTotal,
      cacheRead: cacheReadTokens,
      cacheWrite: cacheWriteTokens
    },
    outputTokens: {
      total: outputTotal,
      text: outputTotal - reasoningTokens,
      reasoning: reasoningTokens
    }
  }
}
