/**
 * The `OpenAiLanguageModel` module provides the OpenAI Responses API
 * implementation of Effect AI's `LanguageModel` service. It translates Effect
 * AI prompts, files, tools, structured output requests, reasoning metadata, and
 * provider options into OpenAI response requests, then converts OpenAI
 * non-streaming or streaming response results back into Effect AI response
 * content and metadata.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as AiError from "effect/ai/AiError"
import * as IdGenerator from "effect/ai/IdGenerator"
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
import * as Redactable from "effect/Redactable"
import * as Schema from "effect/Schema"
import * as AST from "effect/SchemaAST"
import * as Stream from "effect/Stream"
import type { Span } from "effect/Tracer"
import type { DeepMutable, Mutable, Simplify } from "effect/Types"
import * as Generated from "./Generated.ts"
import * as InternalUtilities from "./internal/utilities.ts"
import { OpenAiClient, OpenAiSocket } from "./OpenAiClient.ts"
import type * as OpenAiSchema from "./OpenAiSchema.ts"
import { addGenAIAnnotations } from "./OpenAiTelemetry.ts"
import type * as OpenAiTool from "./OpenAiTool.ts"

const ResponseModelIds = Generated.ModelIdsResponses.members[1]
const SharedModelIds = Generated.ModelIdsShared.members[1]

/**
 * OpenAI model identifiers supported by the Responses API language model.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Model = typeof ResponseModelIds.Encoded | typeof SharedModelIds.Encoded

/**
 * Image detail level for vision requests.
 */
type ImageDetail = "auto" | "low" | "high"

type PromptCacheBreakpoint = { readonly mode: "explicit" }

// =============================================================================
// Configuration
// =============================================================================

/**
 * Context service for OpenAI language model configuration.
 *
 * **When to use**
 *
 * Use when you need to provide OpenAI Responses API request defaults through
 * Effect context for language model operations.
 *
 * **Details**
 *
 * Config values are merged with the config object passed to `model`, `make`, or
 * `layer`, with scoped context values taking precedence.
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
        typeof OpenAiSchema.CreateResponse.Encoded,
        "input" | "tools" | "tool_choice" | "stream" | "text"
      >
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
      /**
       * Whether stored response items should be sent as item references.
       *
       * Set to `false` for OpenAI-compatible providers that support response
       * storage and `previous_response_id`, but require historical assistant
       * content to be serialized inline.
       *
       * Defaults to `true` when `store` is `true`.
       */
      readonly useItemReferences?: boolean | undefined
    }
  >
>()("@effect/ai-openai/OpenAiLanguageModel/Config") {}

// =============================================================================
// Provider Options / Metadata
// =============================================================================

declare module "effect/ai/Prompt" {
  /**
   * OpenAI-specific options for system messages.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface SystemMessageOptions extends ProviderOptions {
    /**
     * Provider-specific system message options for the OpenAI Responses API.
     */
    readonly openai?: {
      /**
       * Marks the system input text as the end of a reusable prompt prefix.
       *
       * Requires GPT-5.6 or later. OpenAI may reject requests that use this
       * option with earlier models.
       */
      readonly promptCacheBreakpoint?: PromptCacheBreakpoint | null
    } | null
  }

  /**
   * OpenAI-specific options for file prompt parts.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface FilePartOptions extends ProviderOptions {
    /**
     * Provider-specific file options for the OpenAI Responses API.
     */
    readonly openai?: {
      /**
       * The detail level of the image to be sent to the model. One of `high`, `low`, or `auto`. Defaults to `auto`.
       */
      readonly imageDetail?: ImageDetail | null
    } | null
  }

  /**
   * OpenAI-specific options for reasoning prompt parts.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface ReasoningPartOptions extends ProviderOptions {
    /**
     * Provider-specific reasoning options for the OpenAI Responses API.
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
   * OpenAI-specific options for assistant tool-call prompt parts.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface ToolCallPartOptions extends ProviderOptions {
    /**
     * Provider-specific tool-call options for the OpenAI Responses API.
     */
    readonly openai?: {
      /**
       * The ID of the item to reference.
       */
      readonly itemId?: string | null
      /**
       * The status of item.
       */
      readonly status?: typeof OpenAiSchema.MessageStatus.Encoded | null
      /**
       * The ID of the approval request.
       */
      readonly approvalRequestId?: string | null
    } | null
  }

  /**
   * OpenAI-specific options for tool-result prompt parts.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface ToolResultPartOptions extends ProviderOptions {
    /**
     * Provider-specific tool-result options for the OpenAI Responses API.
     */
    readonly openai?: {
      /**
       * The ID of the item to reference.
       */
      readonly itemId?: string | null
      /**
       * The status of item.
       */
      readonly status?: typeof OpenAiSchema.MessageStatus.Encoded | null
      /**
       * The ID of the approval request.
       */
      readonly approvalId?: string | null
    } | null
  }

  /**
   * OpenAI-specific options for text prompt parts.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface TextPartOptions extends ProviderOptions {
    /**
     * Provider-specific text options for the OpenAI Responses API.
     */
    readonly openai?: {
      /**
       * The ID of the item to reference.
       */
      readonly itemId?: string | null
      /**
       * The status of item.
       */
      readonly status?: typeof OpenAiSchema.MessageStatus.Encoded | null
      /**
       * A list of annotations that apply to the output text.
       */
      readonly annotations?: ReadonlyArray<typeof OpenAiSchema.Annotation.Encoded> | null
      /**
       * Marks the input text as the end of a reusable prompt prefix.
       *
       * Requires GPT-5.6 or later. OpenAI may reject requests that use this
       * option with earlier models.
       */
      readonly promptCacheBreakpoint?: PromptCacheBreakpoint | null
    } | null
  }
}

declare module "effect/ai/Response" {
  /**
   * OpenAI metadata attached to a complete text response part.
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
       * The status of item.
       */
      readonly status?: typeof OpenAiSchema.MessageStatus.Encoded | null
      /**
       * The text content part annotations.
       */
      readonly annotations?: ReadonlyArray<typeof OpenAiSchema.Annotation.Encoded> | null
    }
  }

  /**
   * OpenAI metadata emitted when a streamed text part starts.
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
   * OpenAI metadata emitted when a streamed text part ends.
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
      readonly annotations?: ReadonlyArray<typeof OpenAiSchema.Annotation.Encoded> | null
    } | null
  }

  /**
   * OpenAI metadata attached to a complete reasoning response part.
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
   * OpenAI metadata emitted when a streamed reasoning part starts.
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
   * OpenAI metadata emitted for a streamed reasoning delta.
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
   * OpenAI metadata emitted when a streamed reasoning part ends.
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
   * OpenAI metadata attached to tool-call response parts.
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
   * OpenAI metadata attached to document source citations.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface DocumentSourcePartMetadata extends ProviderMetadata {
    /**
     * Provider-specific citation metadata for the OpenAI Responses API.
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
   * OpenAI metadata attached to URL source citations.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface UrlSourcePartMetadata extends ProviderMetadata {
    /**
     * Provider-specific URL citation metadata for the OpenAI Responses API.
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
   * OpenAI metadata attached to finish response parts.
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
       * The service tier reported by OpenAI for the response.
       */
      readonly serviceTier?: "default" | "auto" | "flex" | "scale" | "priority" | null
      /**
       * Prompt cache diagnostics for `prompt_cache_options.comparison_response_id`.
       */
      readonly promptCacheDiagnostics?: OpenAiSchema.PromptCacheDiagnostics
    } | null
  }
}

// =============================================================================
// Language Model
// =============================================================================

/**
 * Creates an OpenAI model descriptor that can be provided with
 * `Effect.provide`.
 *
 * **When to use**
 *
 * Use when you want an OpenAI language model value that carries provider and
 * model metadata and can be supplied directly to an Effect program.
 *
 * @see {@link layer} for creating a `LanguageModel.LanguageModel` layer directly
 * @see {@link make} for constructing the language model service effectfully
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const model = (
  model: (string & {}) | Model,
  config?: Omit<typeof Config.Service, "model">
): AiModel.Model<"openai", LanguageModel.LanguageModel, OpenAiClient> =>
  AiModel.make("openai", model, layer({ model, config }))

// TODO
// /**
//  * @since 4.0.0
//  * @category constructors
//  */
// export const modelWithTokenizer = (
//   model: (string & {}) | Model,
//   config?: Omit<typeof Config.Service, "model">
// ): AiModel.Model<"openai", LanguageModel.LanguageModel | Tokenizer.Tokenizer, OpenAiClient> =>
//   AiModel.make("openai", model, layerWithTokenizer({ model, config }))

/**
 * Creates an OpenAI `LanguageModel` service from a model identifier and
 * optional request defaults.
 *
 * **When to use**
 *
 * Use to construct an OpenAI Responses API language model service backed by
 * `OpenAiClient`.
 *
 * **Details**
 *
 * The returned effect requires `OpenAiClient`. Request defaults from the
 * `config` option are merged with any `Config` service in the context, with
 * context values taking precedence. The service supports both `generateText`
 * and `streamText`.
 *
 * @see {@link layer} for providing the service as a `Layer`
 * @see {@link model} for creating a model descriptor for `Effect.provide`
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = Effect.fnUntraced(function*({ model, config: providerConfig }: {
  readonly model: (string & {}) | Model
  readonly config?: Omit<typeof Config.Service, "model"> | undefined
}): Effect.fn.Return<LanguageModel.LanguageModel, never, OpenAiClient> {
  const client = yield* OpenAiClient

  const makeConfig = Effect.gen(function*() {
    const services = yield* Effect.context<never>()
    return { model, ...providerConfig, ...Context.getOrUndefined(services, Config) }
  })

  const makeRequest = Effect.fnUntraced(
    function*<Tools extends ReadonlyArray<Tool.Any>>({ config, options, toolNameMapper }: {
      readonly config: typeof Config.Service
      readonly options: LanguageModel.ProviderOptions
      readonly toolNameMapper: Tool.NameMapper<Tools>
    }): Effect.fn.Return<typeof OpenAiSchema.CreateResponse.Encoded, AiError.AiError> {
      const include = new Set<typeof OpenAiSchema.IncludeEnum.Encoded>()
      const capabilities = getModelCapabilities(config.model as string)
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
      const {
        fileIdPrefixes: _fip,
        strictJsonSchema: _sjs,
        useItemReferences: _uir,
        ...apiConfig
      } = config
      const request: Mutable<typeof OpenAiSchema.CreateResponse.Encoded> = {
        ...apiConfig,
        input: messages,
        include: include.size > 0 ? Array.from(include) : undefined,
        text: {
          verbosity: config.text?.verbosity ?? undefined,
          format: responseFormat
        }
      }
      if (tools) request.tools = tools
      if (toolChoice) request.tool_choice = toolChoice
      if (options.previousResponseId) request.previous_response_id = options.previousResponseId
      return request
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
          stream,
          response,
          config,
          options,
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
 * Creates a layer that provides the OpenAI `LanguageModel.LanguageModel`
 * service.
 *
 * **When to use**
 *
 * Use when composing application layers and you want OpenAI to satisfy
 * `LanguageModel.LanguageModel` while supplying `OpenAiClient` from another
 * layer.
 *
 * **Details**
 *
 * The `config` option supplies request defaults for the selected model. Scoped
 * values from `withConfigOverride` are merged when each request is built and
 * take precedence over these defaults.
 *
 * @see {@link make} for constructing the language model service effectfully
 * @see {@link model} for creating a model descriptor for `Effect.provide`
 * @see {@link withConfigOverride} for scoped request configuration overrides
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer = (options: {
  readonly model: (string & {}) | Model
  readonly config?: Omit<typeof Config.Service, "model"> | undefined
}): Layer.Layer<LanguageModel.LanguageModel, never, OpenAiClient> =>
  Layer.effect(LanguageModel.LanguageModel, make(options))

/**
 * Provides scoped config overrides for OpenAI language model operations.
 *
 * **When to use**
 *
 * Use to apply OpenAI Responses API config overrides around one or more
 * language model operations without changing the defaults passed to `model`,
 * `make`, or `layer`.
 *
 * **Details**
 *
 * The override is dual, so it can be used in pipe form or as
 * `withConfigOverride(effect, overrides)`. Overrides are merged with any
 * existing `Config` service in the current context, and the override values take
 * precedence.
 *
 * @see {@link Config} for the scoped configuration service consumed by this function
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
    readonly include: Set<typeof OpenAiSchema.IncludeEnum.Encoded>
    readonly capabilities: ModelCapabilities
    readonly toolNameMapper: Tool.NameMapper<Tools>
  }): Effect.fn.Return<ReadonlyArray<typeof OpenAiSchema.InputItem.Encoded>, AiError.AiError> {
    const processedApprovalIds = new Set<string>()
    const websocketMode = Option.isSome(yield* Effect.serviceOption(OpenAiSocket))

    const hasConversation = Predicate.isNotNullish(config.conversation)
    const useItemReferences = config.store === true &&
      config.useItemReferences !== false &&
      options.incrementalFallback !== true

    // Provider-Defined Tools
    const applyPatchTool = options.tools.find((tool): tool is ReturnType<typeof OpenAiTool.ApplyPatch> =>
      Tool.isProviderDefined(tool) && tool.name === "OpenAiApplyPatch"
    )
    const codeInterpreterTool = options.tools.find((tool): tool is ReturnType<typeof OpenAiTool.CodeInterpreter> =>
      Tool.isProviderDefined(tool) && tool.name === "OpenAiCodeInterpreter"
    )
    const shellTool = options.tools.find((tool): tool is ReturnType<typeof OpenAiTool.Shell> =>
      Tool.isProviderDefined(tool) && tool.name === "OpenAiShell"
    )
    const localShellTool = options.tools.find((tool): tool is ReturnType<typeof OpenAiTool.LocalShell> =>
      Tool.isProviderDefined(tool) && tool.name === "OpenAiLocalShell"
    )
    const webSearchTool = options.tools.find((tool): tool is ReturnType<typeof OpenAiTool.WebSearch> =>
      Tool.isProviderDefined(tool) && tool.name === "OpenAiWebSearch"
    )
    const webSearchPreviewTool = options.tools.find((tool): tool is ReturnType<typeof OpenAiTool.WebSearchPreview> =>
      Tool.isProviderDefined(tool) && tool.name === "OpenAiWebSearchPreview"
    )

    // Handle Included Features
    if (Predicate.isNotUndefined(config.top_logprobs)) {
      include.add("message.output_text.logprobs")
    }
    if ((websocketMode || !useItemReferences) && capabilities.isReasoningModel) {
      include.add("reasoning.encrypted_content")
    }
    if (codeInterpreterTool) {
      include.add("code_interpreter_call.outputs")
    }
    if (webSearchTool || webSearchPreviewTool) {
      include.add("web_search_call.action.sources")
    }

    const messages: Array<typeof OpenAiSchema.InputItem.Encoded> = []
    const prompt = options.incrementalPrompt ?? options.prompt

    for (const message of prompt.content) {
      switch (message.role) {
        case "system": {
          messages.push({
            role: getSystemMessageMode(config.model as string),
            content: [{
              type: "input_text",
              text: message.content,
              ...getPromptCacheBreakpoint(message)
            }]
          })
          break
        }

        case "user": {
          const content: Array<typeof OpenAiSchema.InputContent.Encoded> = []

          for (let index = 0; index < message.content.length; index++) {
            const part = message.content[index]

            switch (part.type) {
              case "text": {
                content.push({
                  type: "input_text",
                  text: part.text,
                  ...getPromptCacheBreakpoint(part)
                })
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
          const reasoningMessages: Record<string, DeepMutable<typeof OpenAiSchema.ReasoningItem.Encoded>> = Object
            .create(null)

          const providerExecutedParts = message.content.filter((part) =>
            (part.type === "tool-call" || part.type === "tool-result") && part.providerExecuted
          )
          const unreplayableProviderItem = (name: string, id: string) =>
            AiError.make({
              module: "OpenAiLanguageModel",
              method: "prepareMessages",
              reason: new AiError.InvalidRequestError({
                description: `Cannot replay provider-executed tool item '${name}' ('${id}') losslessly`
              })
            })

          for (const part of message.content) {
            switch (part.type) {
              case "text": {
                const id = getItemId(part)

                // When in conversation mode, skip items that already exist in the
                // conversation context to avoid "Duplicate item found" errors
                if (hasConversation && Predicate.isNotNull(id)) {
                  break
                }

                if (useItemReferences && Predicate.isNotNull(id)) {
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

                  if (useItemReferences) {
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
                    const summaryParts: Array<typeof OpenAiSchema.SummaryTextContent.Encoded> = []

                    if (part.text.length > 0) {
                      summaryParts.push({ type: "summary_text", text: part.text })
                    }

                    if (Predicate.isUndefined(message)) {
                      reasoningMessages[id] = {
                        type: "reasoning",
                        id,
                        summary: summaryParts,
                        ...(Predicate.isNotNull(encryptedContent)
                          ? { encrypted_content: encryptedContent }
                          : undefined)
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

                if (useItemReferences && Predicate.isNotNull(id)) {
                  messages.push({ type: "item_reference", id })
                  break
                }

                if (part.providerExecuted) {
                  if (
                    config.store !== true && options.incrementalFallback !== true
                  ) {
                    break
                  }
                  const result = providerExecutedParts.find((candidate) =>
                    candidate.type === "tool-result" && candidate.id === part.id && candidate.name === part.name
                  )
                  if (Predicate.isUndefined(result) || result.type !== "tool-result") {
                    return yield* unreplayableProviderItem(part.name, part.id)
                  }
                  if (
                    Predicate.hasProperty(result.result, "type") &&
                    result.result.type === "execution-denied"
                  ) {
                    break
                  }

                  const itemId = getItemId(part) ?? getItemId(result) ?? part.id
                  switch (part.name) {
                    case "OpenAiWebSearch":
                    case "OpenAiWebSearchPreview": {
                      if (!Predicate.hasProperty(result.result, "status")) {
                        return yield* unreplayableProviderItem(part.name, part.id)
                      }
                      messages.push({
                        type: "web_search_call",
                        id: itemId,
                        ...(Predicate.hasProperty(result.result, "action")
                          ? { action: result.result.action }
                          : undefined),
                        status: result.result.status as string
                      })
                      break
                    }
                    case "OpenAiCodeInterpreter": {
                      if (
                        !Predicate.hasProperty(part.params, "code") ||
                        !Predicate.hasProperty(part.params, "container_id") ||
                        !Predicate.hasProperty(result.result, "status") ||
                        !Predicate.hasProperty(result.result, "outputs")
                      ) {
                        return yield* unreplayableProviderItem(part.name, part.id)
                      }
                      messages.push({
                        type: "code_interpreter_call",
                        id: itemId,
                        code: part.params.code as string | null,
                        container_id: part.params.container_id as string,
                        status: result.result.status as any,
                        outputs: result.result.outputs as any
                      })
                      break
                    }
                    case "OpenAiFileSearch": {
                      if (
                        !Predicate.hasProperty(result.result, "status") ||
                        !Predicate.hasProperty(result.result, "queries") ||
                        !Predicate.hasProperty(result.result, "results")
                      ) {
                        return yield* unreplayableProviderItem(part.name, part.id)
                      }
                      messages.push({
                        type: "file_search_call",
                        id: itemId,
                        status: result.result.status as string,
                        queries: result.result.queries as Array<string>,
                        results: result.result.results
                      })
                      break
                    }
                    case "OpenAiImageGeneration": {
                      if (!Predicate.hasProperty(result.result, "result")) {
                        return yield* unreplayableProviderItem(part.name, part.id)
                      }
                      messages.push({
                        type: "image_generation_call",
                        id: itemId,
                        result: result.result.result as string | null,
                        status: (Predicate.hasProperty(result.result, "status")
                          ? result.result.status
                          : "completed") as any
                      })
                      break
                    }
                    default: {
                      return yield* unreplayableProviderItem(part.name, part.id)
                    }
                  }
                  break
                }

                const toolName = toolNameMapper.getProviderName(part.name)

                if (Predicate.isNotUndefined(localShellTool) && toolName === "local_shell") {
                  const params = yield* Schema.decodeUnknownEffect(localShellTool.parametersSchema)(part.params).pipe(
                    Effect.mapError((error) =>
                      AiError.make({
                        module: "OpenAiLanguageModel",
                        method: "prepareMessages",
                        reason: new AiError.ToolParameterValidationError({
                          toolName: "local_shell",
                          description: error.message
                        })
                      })
                    )
                  )

                  messages.push({
                    id: id!,
                    type: "local_shell_call",
                    call_id: part.id,
                    status: status ?? "completed",
                    action: params.action
                  })

                  break
                }

                if (Predicate.isNotUndefined(shellTool) && toolName === "shell") {
                  const params = yield* Schema.decodeUnknownEffect(shellTool.parametersSchema)(part.params).pipe(
                    Effect.mapError((error) =>
                      AiError.make({
                        module: "OpenAiLanguageModel",
                        method: "prepareMessages",
                        reason: new AiError.ToolParameterValidationError({
                          toolName: "shell",
                          description: error.message
                        })
                      })
                    )
                  )

                  messages.push({
                    id: id!,
                    type: "shell_call",
                    call_id: part.id,
                    status: status ?? "completed",
                    action: params.action
                  })

                  break
                }

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

                if (useItemReferences) {
                  const id = getItemId(part) ?? part.id
                  messages.push({ type: "item_reference", id })
                } else if (
                  part.providerExecuted &&
                  (config.store === true || options.incrementalFallback === true)
                ) {
                  const call = providerExecutedParts.find((candidate) =>
                    candidate.type === "tool-call" && candidate.id === part.id && candidate.name === part.name
                  )
                  if (Predicate.isUndefined(call)) {
                    return yield* unreplayableProviderItem(part.name, part.id)
                  }
                }
              }
            }
          }

          break
        }

        case "tool": {
          for (const part of message.content) {
            if (part.type === "tool-approval-response") {
              if (processedApprovalIds.has(part.approvalId)) {
                continue
              }

              processedApprovalIds.add(part.approvalId)

              if (useItemReferences) {
                messages.push({ type: "item_reference", id: part.approvalId })
              }

              messages.push({
                type: "mcp_approval_response",
                approval_request_id: part.approvalId,
                approve: part.approved
              } as any)

              continue
            }

            // Skip execution-denied results that already have an approvalId -
            // this indicates that the part was already handled via tool-approval-response
            if (
              Predicate.hasProperty(part.result, "type") &&
              part.result.type === "execution-denied"
            ) {
              if (Predicate.isNotNullish(part.options.openai?.approvalId)) {
                continue
              }
            }

            const id = getItemId(part) ?? part.id
            const status = getStatus(part)
            const toolName = toolNameMapper.getProviderName(part.name)

            if (Predicate.isNotUndefined(applyPatchTool) && toolName === "apply_patch") {
              messages.push({
                id,
                type: "apply_patch_call_output",
                call_id: part.id,
                ...(part.result as any)
              })
              continue
            }

            if (Predicate.isNotUndefined(shellTool) && toolName === "shell") {
              messages.push({
                id,
                type: "shell_call_output",
                call_id: part.id,
                output: part.result as any,
                ...(Predicate.isNotNull(status) ? { status } : {})
              })
              continue
            }

            if (Predicate.isNotUndefined(localShellTool) && toolName === "local_shell") {
              messages.push({
                id,
                type: "local_shell_call_output",
                call_id: part.id,
                output: part.result as any,
                ...(Predicate.isNotNull(status) ? { status } : {})
              })
              continue
            }

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

type ResponseStreamEvent = typeof OpenAiSchema.ResponseStreamEvent.Type

type KnownResponseStreamEventType =
  | "response.created"
  | "response.completed"
  | "response.incomplete"
  | "response.failed"
  | "response.output_item.added"
  | "response.output_item.done"
  | "response.output_text.delta"
  | "response.output_text.annotation.added"
  | "response.reasoning_summary_part.added"
  | "response.reasoning_summary_part.done"
  | "response.reasoning_summary_text.delta"
  | "response.function_call_arguments.delta"
  | "response.function_call_arguments.done"
  | "response.code_interpreter_call_code.delta"
  | "response.code_interpreter_call_code.done"
  | "response.apply_patch_call_operation_diff.delta"
  | "response.apply_patch_call_operation_diff.done"
  | "response.image_generation_call.partial_image"
  | "error"

type KnownResponseStreamEvent = Extract<ResponseStreamEvent, { readonly type: KnownResponseStreamEventType }>

const knownResponseStreamEventTypes = new Set<KnownResponseStreamEventType>([
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

const isKnownResponseStreamEvent = (
  event: ResponseStreamEvent
): event is KnownResponseStreamEvent => knownResponseStreamEventTypes.has(event.type as KnownResponseStreamEventType)

const makeResponse = Effect.fnUntraced(
  function*<Tools extends ReadonlyArray<Tool.Any>>({
    options,
    rawResponse,
    response,
    toolNameMapper
  }: {
    readonly options: LanguageModel.ProviderOptions
    readonly rawResponse: OpenAiSchema.Response
    readonly response: HttpClientResponse.HttpClientResponse
    readonly toolNameMapper: Tool.NameMapper<Tools>
  }): Effect.fn.Return<
    Array<Response.PartEncoded>,
    AiError.AiError,
    IdGenerator.IdGenerator
  > {
    const idGenerator = yield* IdGenerator.IdGenerator

    const approvalRequests = getApprovalRequestIdMapping(options.prompt)

    const webSearchTool = options.tools.find((tool) =>
      Tool.isProviderDefined(tool) &&
      (tool.name === "OpenAiWebSearch" ||
        tool.name === "OpenAiWebSearchPreview")
    ) as Tool.AnyProviderDefined | undefined

    let hasToolCalls = false
    const parts: Array<Response.PartEncoded> = []

    const createdAt = new Date(rawResponse.created_at * 1000)
    parts.push({
      type: "response-metadata",
      id: rawResponse.id,
      modelId: rawResponse.model as string,
      timestamp: DateTime.formatIso(DateTime.fromDateUnsafe(createdAt)),
      request: buildHttpRequestDetails(response.request)
    })

    for (const part of rawResponse.output) {
      switch (part.type) {
        case "apply_patch_call": {
          const toolName = toolNameMapper.getCustomName("apply_patch")
          parts.push({
            type: "tool-call",
            id: part.call_id,
            name: toolName,
            params: { call_id: part.call_id, operation: part.operation },
            metadata: { openai: makeItemIdMetadata(part.id) }
          })
          break
        }

        case "code_interpreter_call": {
          const toolName = toolNameMapper.getCustomName("code_interpreter")
          const status = part.status ?? "completed"
          parts.push({
            type: "tool-call",
            id: part.id,
            name: toolName,
            params: { code: part.code ?? null, container_id: part.container_id },
            providerExecuted: true
          })
          parts.push({
            type: "tool-result",
            id: part.id,
            name: toolName,
            isFailure: status !== "completed",
            result: { status, outputs: part.outputs ?? null },
            providerExecuted: true
          })
          break
        }

        case "file_search_call": {
          const toolName = toolNameMapper.getCustomName("file_search")
          parts.push({
            type: "tool-call",
            id: part.id,
            name: toolName,
            params: {},
            providerExecuted: true
          })
          parts.push({
            type: "tool-result",
            id: part.id,
            name: toolName,
            isFailure: part.status !== "completed",
            result: {
              status: part.status,
              queries: part.queries,
              results: part.results ?? null
            },
            providerExecuted: true
          })
          break
        }

        case "function_call": {
          hasToolCalls = true

          const toolName = part.name

          const toolParams = yield* Effect.try({
            try: () => Tool.unsafeSecureJsonParse(part.arguments),
            catch: (cause) =>
              AiError.make({
                module: "OpenAiLanguageModel",
                method: "makeResponse",
                reason: new AiError.ToolParameterValidationError({
                  toolName,
                  description: `Faled to securely JSON parse tool parameters: ${cause}`
                })
              })
          })

          const params = yield* transformToolCallParams(options.tools, part.name, toolParams)

          parts.push({
            type: "tool-call",
            id: part.call_id,
            name: toolName,
            params,
            metadata: { openai: makeItemIdMetadata(part.id) }
          })
          break
        }

        case "image_generation_call": {
          const toolName = toolNameMapper.getCustomName("image_generation")
          const status = part.status ?? "completed"
          parts.push({
            type: "tool-call",
            id: part.id,
            name: toolName,
            params: {},
            providerExecuted: true
          })
          parts.push({
            type: "tool-result",
            id: part.id,
            name: toolName,
            isFailure: status !== "completed",
            result: status === "completed"
              ? { result: part.result }
              : { status, result: part.result }
          })
          break
        }

        case "local_shell_call": {
          const toolName = toolNameMapper.getCustomName("local_shell")
          parts.push({
            type: "tool-call",
            id: part.call_id,
            name: toolName,
            params: { action: part.action },
            metadata: { openai: makeItemIdMetadata(part.id) }
          })
          break
        }

        case "mcp_call": {
          const toolId = Predicate.isNotNullish(part.approval_request_id)
            ? (approvalRequests.get(part.approval_request_id) ?? part.id)
            : part.id

          const { toolName, params } = yield* normalizeMcpToolCall({
            toolNameMapper,
            toolParams: part.arguments,
            method: "makeResponse"
          })

          parts.push({
            type: "tool-call",
            id: toolId,
            name: toolName,
            params,
            providerExecuted: true
          })

          parts.push({
            type: "tool-result",
            id: toolId,
            name: toolName,
            isFailure: Predicate.isNotNullish(part.error),
            providerExecuted: true,
            result: {
              type: "mcp_call",
              name: part.name,
              arguments: part.arguments,
              server_label: part.server_label,
              ...(Predicate.isNotNullish(part.output) ? { output: part.output } : undefined),
              ...(Predicate.isNotNullish(part.error) ? { error: part.error } : undefined)
            },
            metadata: { openai: makeItemIdMetadata(part.id) }
          })

          break
        }

        case "mcp_list_tools": {
          // Skip
          break
        }

        case "mcp_approval_request": {
          const approvalRequestId = (part as any).approval_request_id ?? part.id
          const toolId = yield* idGenerator.generateId()

          const { toolName, params } = yield* normalizeMcpToolCall({
            toolNameMapper,
            toolParams: part.arguments,
            method: "makeResponse"
          })

          parts.push({
            type: "tool-call",
            id: toolId,
            name: toolName,
            params,
            providerExecuted: true
          })

          parts.push({
            type: "tool-approval-request",
            toolCallId: toolId,
            approvalId: approvalRequestId
          })

          break
        }

        case "message": {
          for (const contentPart of part.content) {
            switch (contentPart.type) {
              case "output_text": {
                const annotations = contentPart.annotations.length > 0
                  ? { annotations: contentPart.annotations as any }
                  : undefined

                parts.push({
                  type: "text",
                  text: contentPart.text,
                  metadata: {
                    openai: {
                      ...makeItemIdMetadata(part.id),
                      ...annotations
                    }
                  }
                })
                for (const annotation of contentPart.annotations) {
                  if (annotation.type === "container_file_citation") {
                    parts.push({
                      type: "source",
                      sourceType: "document",
                      id: yield* idGenerator.generateId(),
                      mediaType: "text/plain",
                      title: annotation.filename,
                      fileName: annotation.filename,
                      metadata: {
                        openai: {
                          type: annotation.type,
                          fileId: annotation.file_id,
                          containerId: annotation.container_id
                        }
                      }
                    })
                  }
                  if (annotation.type === "file_citation") {
                    parts.push({
                      type: "source",
                      sourceType: "document",
                      id: yield* idGenerator.generateId(),
                      mediaType: "text/plain",
                      title: annotation.filename,
                      fileName: annotation.filename,
                      metadata: {
                        openai: {
                          type: annotation.type,
                          fileId: annotation.file_id,
                          index: annotation.index
                        }
                      }
                    })
                  }
                  if (annotation.type === "file_path") {
                    parts.push({
                      type: "source",
                      sourceType: "document",
                      id: yield* idGenerator.generateId(),
                      mediaType: "application/octet-stream",
                      title: annotation.file_id,
                      fileName: annotation.file_id,
                      metadata: {
                        openai: {
                          type: annotation.type,
                          fileId: annotation.file_id,
                          index: annotation.index
                        }
                      }
                    })
                  }
                  if (annotation.type === "url_citation") {
                    parts.push({
                      type: "source",
                      sourceType: "url",
                      id: yield* idGenerator.generateId(),
                      url: annotation.url,
                      title: annotation.title,
                      metadata: {
                        openai: {
                          type: annotation.type,
                          startIndex: annotation.start_index,
                          endIndex: annotation.end_index
                        }
                      }
                    })
                  }
                }
                break
              }
              case "refusal": {
                parts.push({
                  type: "text",
                  text: "",
                  metadata: { openai: { refusal: contentPart.refusal } }
                })
                break
              }
            }
          }
          break
        }

        case "reasoning": {
          const metadata = {
            openai: {
              ...makeItemIdMetadata(part.id),
              ...makeEncryptedContentMetadata(part.encrypted_content)
            }
          }
          // If there are no summary parts, we have to add an empty one to
          // propagate the part identifier and encrypted content
          if (part.summary.length === 0) {
            parts.push({ type: "reasoning", text: "", metadata })
          } else {
            for (const summary of part.summary) {
              parts.push({ type: "reasoning", text: summary.text, metadata })
            }
          }
          break
        }

        case "shell_call": {
          const toolName = toolNameMapper.getCustomName("shell")
          parts.push({
            type: "tool-call",
            id: part.call_id,
            name: toolName,
            params: { action: part.action },
            metadata: { openai: makeItemIdMetadata(part.id) }
          })
          break
        }

        case "web_search_call": {
          const toolName = toolNameMapper.getCustomName(
            webSearchTool?.name ?? "web_search"
          )
          parts.push({
            type: "tool-call",
            id: part.id,
            name: toolName,
            params: webSearchTool?.name === "OpenAiWebSearchPreview" || Predicate.isUndefined(part.action)
              ? {}
              : { action: part.action },
            providerExecuted: true
          })
          parts.push({
            type: "tool-result",
            id: part.id,
            name: toolName,
            isFailure: part.status !== "completed",
            result: {
              ...(Predicate.isUndefined(part.action) ? undefined : { action: part.action }),
              status: part.status
            },
            providerExecuted: true
          })
          break
        }
      }
    }

    const finishReason = InternalUtilities.resolveFinishReason(
      rawResponse.incomplete_details?.reason,
      hasToolCalls
    )

    parts.push({
      type: "finish",
      reason: finishReason,
      usage: getUsage(rawResponse.usage),
      response: buildHttpResponseDetails(response),
      ...toFinishMetadata(rawResponse)
    })

    return parts
  }
)

const makeStreamResponse = Effect.fnUntraced(
  function*<Tools extends ReadonlyArray<Tool.Any>>({
    stream,
    response,
    config,
    options,
    toolNameMapper
  }: {
    readonly config: typeof Config.Service
    readonly stream: Stream.Stream<ResponseStreamEvent, AiError.AiError>
    readonly response: HttpClientResponse.HttpClientResponse
    readonly options: LanguageModel.ProviderOptions
    readonly toolNameMapper: Tool.NameMapper<Tools>
  }): Effect.fn.Return<
    Stream.Stream<Response.StreamPartEncoded, AiError.AiError>,
    AiError.AiError,
    IdGenerator.IdGenerator
  > {
    const idGenerator = yield* IdGenerator.IdGenerator
    const websocketMode = Option.isSome(yield* Effect.serviceOption(OpenAiSocket))

    const approvalRequests = getApprovalRequestIdMapping(options.prompt)
    const streamApprovalRequests = new Map<string, string>()

    let hasToolCalls = false

    // Track annotations for current message to include in text-end metadata
    const activeAnnotations: Array<typeof OpenAiSchema.Annotation.Encoded> = []

    type ReasoningSummaryPartStatus = "active" | "can-conclude" | "concluded"
    type ReasoningPart = {
      encryptedContent: string | undefined
      summaryParts: Record<number, ReasoningSummaryPartStatus>
    }

    // Track active reasoning items with state machine for proper concluding logic
    const activeReasoning: Record<string, ReasoningPart> = Object.create(null)

    const getOrCreateReasoningPart = (
      itemId: string,
      encryptedContent?: string | null
    ): ReasoningPart => {
      const activePart = activeReasoning[itemId]
      if (Predicate.isNotUndefined(activePart)) {
        if (Predicate.isNotNullish(encryptedContent)) {
          activePart.encryptedContent = encryptedContent
        }
        return activePart
      }

      const reasoningPart: ReasoningPart = {
        encryptedContent: Predicate.isNotNullish(encryptedContent) ? encryptedContent : undefined,
        summaryParts: {}
      }
      activeReasoning[itemId] = reasoningPart
      return reasoningPart
    }

    // Track active tool calls with optional provider-specific state
    const activeToolCalls: Record<number, {
      readonly id: string
      readonly name: string
      readonly functionCall?: {
        emitted: boolean
      }
      readonly applyPatch?: {
        hasDiff: boolean
        endEmitted: boolean
      }
      readonly codeInterpreter?: {
        readonly containerId: string
        hasCode: boolean
        streamedCode: string
      }
    }> = {}

    const finishCodeInterpreterCall = (
      outputIndex: number,
      code: string | null,
      parts: Array<Response.StreamPartEncoded>
    ) => {
      const toolCall = activeToolCalls[outputIndex]
      if (Predicate.isUndefined(toolCall?.codeInterpreter)) {
        return
      }
      parts.push({
        type: "tool-params-delta",
        id: toolCall.id,
        delta: toolCall.codeInterpreter.hasCode ? "\"}" : `${JSON.stringify(code)}}`
      })
      parts.push({ type: "tool-params-end", id: toolCall.id })
      parts.push({
        type: "tool-call",
        id: toolCall.id,
        name: toolCall.name,
        params: {
          code: toolCall.codeInterpreter.hasCode ? toolCall.codeInterpreter.streamedCode : code,
          container_id: toolCall.codeInterpreter.containerId
        },
        providerExecuted: true
      })
      delete activeToolCalls[outputIndex]
    }

    const webSearchTool = options.tools.find((tool) =>
      Tool.isProviderDefined(tool) &&
      (tool.name === "OpenAiWebSearch" ||
        tool.name === "OpenAiWebSearchPreview")
    ) as ReturnType<typeof OpenAiTool.WebSearch> | ReturnType<typeof OpenAiTool.WebSearchPreview> | undefined

    return stream.pipe(
      Stream.mapEffect(Effect.fnUntraced(function*(event) {
        const parts: Array<Response.StreamPartEncoded> = []

        if (!isKnownResponseStreamEvent(event)) {
          return parts
        }

        switch (event.type) {
          case "response.created": {
            const createdAt = new Date(event.response.created_at * 1000)
            parts.push({
              type: "response-metadata",
              id: event.response.id,
              modelId: event.response.model,
              timestamp: DateTime.formatIso(DateTime.fromDateUnsafe(createdAt)),
              request: buildHttpRequestDetails(response.request)
            })
            break
          }

          case "error": {
            parts.push({ type: "error", error: event })
            break
          }

          case "response.completed":
          case "response.incomplete": {
            parts.push({
              type: "finish",
              reason: InternalUtilities.resolveFinishReason(
                event.response.incomplete_details?.reason,
                hasToolCalls
              ),
              usage: getUsage(event.response.usage),
              response: buildHttpResponseDetails(response),
              ...toFinishMetadata(event.response)
            })
            break
          }

          case "response.failed": {
            if (event.response.error) {
              parts.push({ type: "error", error: event.response.error })
            }
            parts.push({
              type: "finish",
              reason: "error",
              usage: getUsage(event.response.usage),
              response: buildHttpResponseDetails(response),
              ...toFinishMetadata(event.response)
            })
            break
          }

          case "response.output_item.added": {
            switch (event.item.type) {
              case "apply_patch_call": {
                const toolId = event.item.call_id
                const toolName = toolNameMapper.getCustomName("apply_patch")
                const operation = event.item.operation
                activeToolCalls[event.output_index] = {
                  id: toolId,
                  name: toolName,
                  applyPatch: {
                    hasDiff: operation.type !== "delete_file",
                    endEmitted: operation.type === "delete_file"
                  }
                }
                parts.push({
                  type: "tool-params-start",
                  id: toolId,
                  name: toolName
                })

                if (operation.type === "delete_file") {
                  parts.push({
                    type: "tool-params-delta",
                    id: toolId,
                    delta: JSON.stringify({
                      call_id: toolId,
                      operation: operation
                    })
                  })
                  parts.push({
                    type: "tool-params-end",
                    id: toolId
                  })
                } else {
                  parts.push({
                    type: "tool-params-delta",
                    id: toolId,
                    delta: `{"call_id":"${InternalUtilities.escapeJSONDelta(toolId)}",` +
                      `"operation":{"type":"${InternalUtilities.escapeJSONDelta(operation.type)}",` +
                      `"path":"${InternalUtilities.escapeJSONDelta(operation.path)}","diff":"`
                  })
                }
                break
              }

              case "code_interpreter_call": {
                const toolName = toolNameMapper.getCustomName("code_interpreter")
                activeToolCalls[event.output_index] = {
                  id: event.item.id,
                  name: toolName,
                  codeInterpreter: { containerId: event.item.container_id, hasCode: false, streamedCode: "" }
                }
                parts.push({
                  type: "tool-params-start",
                  id: event.item.id,
                  name: toolName,
                  providerExecuted: true
                })
                parts.push({
                  type: "tool-params-delta",
                  id: event.item.id,
                  delta: `{"container_id":${JSON.stringify(event.item.container_id)},"code":`
                })
                break
              }

              case "computer_call": {
                const toolName = toolNameMapper.getCustomName("computer_use")
                activeToolCalls[event.output_index] = {
                  id: event.item.id,
                  name: toolName
                }
                parts.push({
                  type: "tool-params-start",
                  id: event.item.id,
                  name: toolName,
                  providerExecuted: true
                })
                break
              }

              case "file_search_call": {
                const toolName = toolNameMapper.getCustomName("file_search")
                parts.push({
                  type: "tool-call",
                  id: event.item.id,
                  name: toolName,
                  params: {},
                  providerExecuted: true
                })
                break
              }

              case "function_call": {
                activeToolCalls[event.output_index] = {
                  id: event.item.call_id,
                  name: event.item.name,
                  functionCall: { emitted: false }
                }
                parts.push({
                  type: "tool-params-start",
                  id: event.item.call_id,
                  name: event.item.name
                })
                break
              }

              case "image_generation_call": {
                const toolName = toolNameMapper.getCustomName("image_generation")
                parts.push({
                  type: "tool-call",
                  id: event.item.id,
                  name: toolName,
                  params: {},
                  providerExecuted: true
                })
                break
              }

              case "mcp_call":
              case "mcp_list_tools":
              case "mcp_approval_request": {
                // We emit MCP tool call / approvals on `output_item.done` to facilitate:
                // - Aliasing tool call identifiers when an approval request id exists
                // - Emit a proper tool-approval-request part for MCP approvals
                break
              }

              case "message": {
                // Clear annotations for new message
                activeAnnotations.length = 0
                parts.push({
                  type: "text-start",
                  id: event.item.id,
                  metadata: { openai: makeItemIdMetadata(event.item.id) }
                })
                break
              }

              case "reasoning": {
                const reasoningPart = getOrCreateReasoningPart(event.item.id, event.item.encrypted_content)
                if (Predicate.isUndefined(reasoningPart.summaryParts[0])) {
                  reasoningPart.summaryParts[0] = "active"
                  parts.push({
                    type: "reasoning-start",
                    id: `${event.item.id}:0`,
                    metadata: {
                      openai: {
                        ...makeItemIdMetadata(event.item.id),
                        ...makeEncryptedContentMetadata(reasoningPart.encryptedContent)
                      }
                    }
                  })
                }
                break
              }

              case "shell_call": {
                const toolName = toolNameMapper.getCustomName("shell")
                activeToolCalls[event.output_index] = {
                  id: event.item.id ?? event.item.call_id,
                  name: toolName
                }
                break
              }

              case "web_search_call": {
                const toolName = toolNameMapper.getCustomName(
                  webSearchTool?.providerName ?? "web_search"
                )
                activeToolCalls[event.output_index] = {
                  id: event.item.id,
                  name: toolName
                }
                if (webSearchTool?.name === "OpenAiWebSearch") {
                  break
                }
                parts.push({
                  type: "tool-params-start",
                  id: event.item.id,
                  name: webSearchTool?.name ?? "OpenAiWebSearch",
                  providerExecuted: true
                })
                parts.push({
                  type: "tool-params-end",
                  id: event.item.id
                })
                parts.push({
                  type: "tool-call",
                  id: event.item.id,
                  name: toolName,
                  params: {},
                  providerExecuted: true
                })
                break
              }
            }

            break
          }

          case "response.output_item.done": {
            switch (event.item.type) {
              case "apply_patch_call": {
                const toolCall = activeToolCalls[event.output_index]
                if (
                  Predicate.isNotUndefined(toolCall.applyPatch) &&
                  !toolCall.applyPatch.endEmitted &&
                  event.item.operation.type !== "delete_file"
                ) {
                  if (!toolCall.applyPatch.hasDiff) {
                    parts.push({
                      type: "tool-params-delta",
                      id: toolCall.id,
                      delta: InternalUtilities.escapeJSONDelta(event.item.operation.diff ?? "")
                    })
                  }
                  parts.push({
                    type: "tool-params-delta",
                    id: toolCall.id,
                    delta: `"}}`
                  })
                  parts.push({
                    type: "tool-params-end",
                    id: toolCall.id
                  })
                  toolCall.applyPatch.endEmitted = true
                }
                // Emit the final tool call with the complete diff when the status is completed
                if (Predicate.isNotUndefined(toolCall) && event.item.status === "completed") {
                  const toolName = toolNameMapper.getCustomName("apply_patch")
                  parts.push({
                    type: "tool-call",
                    id: toolCall.id,
                    name: toolName,
                    params: { call_id: event.item.call_id, operation: event.item.operation },
                    metadata: { openai: makeItemIdMetadata(event.item.id) }
                  })
                }
                delete activeToolCalls[event.output_index]
                break
              }

              case "code_interpreter_call": {
                finishCodeInterpreterCall(event.output_index, event.item.code ?? null, parts)
                const toolName = toolNameMapper.getCustomName("code_interpreter")
                const status = event.item.status ?? "completed"
                parts.push({
                  type: "tool-result",
                  id: event.item.id,
                  name: toolName,
                  isFailure: status !== "completed",
                  result: { status, outputs: event.item.outputs ?? null },
                  providerExecuted: true
                })
                break
              }

              case "computer_call": {
                delete activeToolCalls[event.output_index]
                const toolName = toolNameMapper.getCustomName("computer_use")
                parts.push({
                  type: "tool-params-end",
                  id: event.item.id
                })
                parts.push({
                  type: "tool-call",
                  id: event.item.id,
                  name: toolName,
                  params: {},
                  providerExecuted: true
                })
                parts.push({
                  type: "tool-result",
                  id: event.item.id,
                  name: toolName,
                  isFailure: false,
                  result: { status: event.item.status ?? "completed" }
                })
                break
              }

              case "file_search_call": {
                delete activeToolCalls[event.output_index]
                const toolName = toolNameMapper.getCustomName("file_search")
                parts.push({
                  type: "tool-result",
                  id: event.item.id,
                  name: toolName,
                  isFailure: event.item.status !== "completed",
                  result: {
                    status: event.item.status,
                    queries: event.item.queries,
                    results: event.item.results ?? null
                  },
                  providerExecuted: true
                })
                break
              }

              case "function_call": {
                const toolCall = activeToolCalls[event.output_index]
                if (Predicate.isNotUndefined(toolCall?.functionCall?.emitted) && toolCall.functionCall.emitted) {
                  delete activeToolCalls[event.output_index]
                  break
                }
                delete activeToolCalls[event.output_index]

                hasToolCalls = true

                const toolName = event.item.name
                const toolArgs = event.item.arguments

                const toolParams = yield* Effect.try({
                  try: () => Tool.unsafeSecureJsonParse(toolArgs),
                  catch: (cause) =>
                    AiError.make({
                      module: "OpenAiLanguageModel",
                      method: "makeStreamResponse",
                      reason: new AiError.ToolParameterValidationError({
                        toolName,
                        description: `Failed securely JSON parse tool parameters: ${cause}`
                      })
                    })
                })

                const params = yield* transformToolCallParams(options.tools, toolName, toolParams)

                parts.push({
                  type: "tool-params-end",
                  id: event.item.call_id
                })

                parts.push({
                  type: "tool-call",
                  id: event.item.call_id,
                  name: toolName,
                  params,
                  metadata: { openai: makeItemIdMetadata(event.item.id) }
                })

                break
              }

              case "image_generation_call": {
                const toolName = toolNameMapper.getCustomName("image_generation")
                const status = event.item.status ?? "completed"
                parts.push({
                  type: "tool-result",
                  id: event.item.id,
                  name: toolName,
                  isFailure: status !== "completed",
                  result: status === "completed"
                    ? { result: event.item.result }
                    : { status, result: event.item.result },
                  providerExecuted: true
                })
                break
              }

              case "local_shell_call": {
                const toolName = toolNameMapper.getCustomName("local_shell")
                parts.push({
                  type: "tool-call",
                  id: event.item.call_id,
                  name: toolName,
                  params: { action: event.item.action },
                  metadata: { openai: makeItemIdMetadata(event.item.id) }
                })
                break
              }

              case "mcp_call": {
                const approvalRequestId = event.item.approval_request_id

                // Track approval with our own tool call identifiers
                const toolId = Predicate.isNotNullish(approvalRequestId)
                  ? (streamApprovalRequests.get(approvalRequestId) ?? approvalRequests.get(approvalRequestId) ??
                    event.item.id)
                  : event.item.id

                const { toolName, params } = yield* normalizeMcpToolCall({
                  toolNameMapper,
                  toolParams: event.item.arguments,
                  method: "makeStreamResponse"
                })

                parts.push({
                  type: "tool-call",
                  id: toolId,
                  name: toolName,
                  params,
                  providerExecuted: true
                })

                parts.push({
                  type: "tool-result",
                  id: toolId,
                  name: toolName,
                  isFailure: Predicate.isNotNullish(event.item.error),
                  providerExecuted: true,
                  result: {
                    type: "mcp_call",
                    name: event.item.name,
                    arguments: event.item.arguments,
                    server_label: event.item.server_label,
                    ...(Predicate.isNotNullish(event.item.output) ? { output: event.item.output } : undefined),
                    ...(Predicate.isNotNullish(event.item.error) ? { error: event.item.error } : undefined)
                  },
                  metadata: { openai: makeItemIdMetadata(event.item.id) }
                })

                break
              }

              case "mcp_list_tools": {
                // Skip
                break
              }

              case "mcp_approval_request": {
                const toolId = yield* idGenerator.generateId()
                const approvalRequestId = (event.item as any).approval_request_id ?? event.item.id
                streamApprovalRequests.set(approvalRequestId, toolId)
                const { toolName, params } = yield* normalizeMcpToolCall({
                  toolNameMapper,
                  toolParams: event.item.arguments,
                  method: "makeStreamResponse"
                })
                parts.push({
                  type: "tool-call",
                  id: toolId,
                  name: toolName,
                  params,
                  providerExecuted: true
                })
                parts.push({
                  type: "tool-approval-request",
                  approvalId: approvalRequestId,
                  toolCallId: toolId
                })
                break
              }

              case "message": {
                const annotations = activeAnnotations.length > 0
                  ? { annotations: activeAnnotations.slice() }
                  : undefined
                parts.push({
                  type: "text-end",
                  id: event.item.id,
                  metadata: { openai: { ...annotations, ...makeItemIdMetadata(event.item.id) } }
                })
                break
              }

              case "reasoning": {
                const reasoningPart = getOrCreateReasoningPart(event.item.id, event.item.encrypted_content)
                for (const [summaryIndex, status] of Object.entries(reasoningPart.summaryParts)) {
                  if (status === "active" || status === "can-conclude") {
                    parts.push({
                      type: "reasoning-end",
                      id: `${event.item.id}:${summaryIndex}`,
                      metadata: {
                        openai: {
                          ...makeItemIdMetadata(event.item.id),
                          ...makeEncryptedContentMetadata(reasoningPart.encryptedContent)
                        }
                      }
                    })
                  }
                }
                delete activeReasoning[event.item.id]
                break
              }

              case "shell_call": {
                delete activeToolCalls[event.output_index]
                const toolName = toolNameMapper.getCustomName("shell")
                parts.push({
                  type: "tool-call",
                  id: event.item.id ?? event.item.call_id,
                  name: toolName,
                  params: { action: event.item.action },
                  metadata: { openai: makeItemIdMetadata(event.item.id) }
                })
                break
              }

              case "web_search_call": {
                delete activeToolCalls[event.output_index]
                const toolName = toolNameMapper.getCustomName(
                  webSearchTool?.name ?? "web_search"
                )
                if (webSearchTool?.name === "OpenAiWebSearch") {
                  parts.push({
                    type: "tool-call",
                    id: event.item.id,
                    name: toolName,
                    params: Predicate.isUndefined(event.item.action) ? {} : { action: event.item.action },
                    providerExecuted: true
                  })
                }
                parts.push({
                  type: "tool-result",
                  id: event.item.id,
                  name: toolName,
                  isFailure: event.item.status !== "completed",
                  result: {
                    ...(Predicate.isUndefined(event.item.action) ? undefined : { action: event.item.action }),
                    status: event.item.status
                  },
                  providerExecuted: true
                })
                break
              }
            }

            break
          }

          case "response.output_text.delta": {
            parts.push({
              type: "text-delta",
              id: event.item_id,
              delta: event.delta
            })
            break
          }

          case "response.output_text.annotation.added": {
            const annotation = event.annotation as typeof OpenAiSchema.Annotation.Encoded
            // Track annotation for text-end metadata
            activeAnnotations.push(annotation)
            if (annotation.type === "container_file_citation") {
              parts.push({
                type: "source",
                sourceType: "document",
                id: yield* idGenerator.generateId(),
                mediaType: "text/plain",
                title: annotation.filename,
                fileName: annotation.filename,
                metadata: {
                  openai: {
                    type: annotation.type,
                    fileId: annotation.file_id,
                    containerId: annotation.container_id
                  }
                }
              })
            } else if (annotation.type === "file_citation") {
              parts.push({
                type: "source",
                sourceType: "document",
                id: yield* idGenerator.generateId(),
                mediaType: "text/plain",
                title: annotation.filename,
                fileName: annotation.filename,
                metadata: {
                  openai: {
                    type: annotation.type,
                    fileId: annotation.file_id,
                    index: annotation.index
                  }
                }
              })
            } else if (annotation.type === "file_path") {
              parts.push({
                type: "source",
                sourceType: "document",
                id: yield* idGenerator.generateId(),
                mediaType: "application/octet-stream",
                title: annotation.file_id,
                fileName: annotation.file_id,
                metadata: {
                  openai: {
                    type: annotation.type,
                    fileId: annotation.file_id,
                    index: annotation.index
                  }
                }
              })
            } else if (annotation.type === "url_citation") {
              parts.push({
                type: "source",
                sourceType: "url",
                id: yield* idGenerator.generateId(),
                url: annotation.url,
                title: annotation.title,
                metadata: {
                  openai: {
                    type: annotation.type,
                    startIndex: annotation.start_index,
                    endIndex: annotation.end_index
                  }
                }
              })
            }
            break
          }

          case "response.function_call_arguments.delta": {
            const toolCallPart = activeToolCalls[event.output_index]
            if (Predicate.isNotUndefined(toolCallPart)) {
              parts.push({
                type: "tool-params-delta",
                id: toolCallPart.id,
                delta: event.delta
              })
            }
            break
          }

          case "response.function_call_arguments.done": {
            const toolCall = activeToolCalls[event.output_index]
            if (
              Predicate.isNotUndefined(toolCall?.functionCall) &&
              !toolCall.functionCall.emitted
            ) {
              hasToolCalls = true

              const toolParams = yield* Effect.try({
                try: () => Tool.unsafeSecureJsonParse(event.arguments),
                catch: (cause) =>
                  AiError.make({
                    module: "OpenAiLanguageModel",
                    method: "makeStreamResponse",
                    reason: new AiError.ToolParameterValidationError({
                      toolName: toolCall.name,
                      description: `Failed securely JSON parse tool parameters: ${cause}`
                    })
                  })
              })

              const params = yield* transformToolCallParams(options.tools, toolCall.name, toolParams)

              parts.push({
                type: "tool-params-end",
                id: toolCall.id
              })

              parts.push({
                type: "tool-call",
                id: toolCall.id,
                name: toolCall.name,
                params,
                metadata: { openai: makeItemIdMetadata(event.item_id) }
              })

              toolCall.functionCall.emitted = true
            }
            break
          }

          case "response.apply_patch_call_operation_diff.delta": {
            const toolCall = activeToolCalls[event.output_index]
            if (Predicate.isNotUndefined(toolCall?.applyPatch)) {
              parts.push({
                type: "tool-params-delta",
                id: toolCall.id,
                delta: InternalUtilities.escapeJSONDelta(event.delta)
              })
              toolCall.applyPatch.hasDiff = true
            }
            break
          }

          case "response.apply_patch_call_operation_diff.done": {
            const toolCall = activeToolCalls[event.output_index]
            if (Predicate.isNotUndefined(toolCall?.applyPatch) && !toolCall.applyPatch.endEmitted) {
              if (!toolCall.applyPatch.hasDiff && Predicate.isNotUndefined(event.delta)) {
                parts.push({
                  type: "tool-params-delta",
                  id: toolCall.id,
                  delta: InternalUtilities.escapeJSONDelta(event.delta)
                })
                toolCall.applyPatch.hasDiff = true
              }
              parts.push({
                type: "tool-params-delta",
                id: toolCall.id,
                delta: `"}}`
              })
              parts.push({
                type: "tool-params-end",
                id: toolCall.id
              })
              toolCall.applyPatch.endEmitted = true
            }
            break
          }

          case "response.code_interpreter_call_code.delta": {
            const toolCall = activeToolCalls[event.output_index]
            if (Predicate.isNotUndefined(toolCall?.codeInterpreter)) {
              parts.push({
                type: "tool-params-delta",
                id: toolCall.id,
                delta: (toolCall.codeInterpreter.hasCode ? "" : "\"") +
                  InternalUtilities.escapeJSONDelta(event.delta)
              })
              toolCall.codeInterpreter.hasCode = true
              toolCall.codeInterpreter.streamedCode += event.delta
            }
            break
          }

          case "response.code_interpreter_call_code.done": {
            finishCodeInterpreterCall(event.output_index, event.code, parts)
            break
          }

          case "response.image_generation_call.partial_image": {
            const toolName = toolNameMapper.getCustomName("image_generation")
            parts.push({
              type: "tool-result",
              id: event.item_id,
              name: toolName,
              isFailure: false,
              providerExecuted: false,
              result: { result: event.partial_image_b64 },
              preliminary: true
            })
            break
          }

          case "response.reasoning_summary_part.added": {
            const reasoningPart = getOrCreateReasoningPart(event.item_id)
            if (event.summary_index > 0) {
              // Conclude all can-conclude parts before starting new one
              for (const [summaryIndex, status] of Object.entries(reasoningPart.summaryParts)) {
                if (status === "can-conclude") {
                  parts.push({
                    type: "reasoning-end",
                    id: `${event.item_id}:${summaryIndex}`,
                    metadata: {
                      openai: {
                        ...makeItemIdMetadata(event.item_id),
                        ...makeEncryptedContentMetadata(reasoningPart.encryptedContent)
                      }
                    }
                  })
                  reasoningPart.summaryParts[Number(summaryIndex)] = "concluded"
                }
              }
            }

            if (Predicate.isUndefined(reasoningPart.summaryParts[event.summary_index])) {
              reasoningPart.summaryParts[event.summary_index] = "active"
              parts.push({
                type: "reasoning-start",
                id: `${event.item_id}:${event.summary_index}`,
                metadata: {
                  openai: {
                    ...makeItemIdMetadata(event.item_id),
                    ...makeEncryptedContentMetadata(reasoningPart.encryptedContent)
                  }
                }
              })
            }
            break
          }

          case "response.reasoning_summary_text.delta": {
            parts.push({
              type: "reasoning-delta",
              id: `${event.item_id}:${event.summary_index}`,
              delta: event.delta,
              metadata: { openai: makeItemIdMetadata(event.item_id) }
            })
            break
          }

          case "response.reasoning_summary_part.done": {
            const reasoningPart = getOrCreateReasoningPart(event.item_id)
            // HTTP requests using stored item references do not need encrypted
            // content, so the reasoning part can be concluded immediately.
            if (!websocketMode && config.store === true && config.useItemReferences !== false) {
              parts.push({
                type: "reasoning-end",
                id: `${event.item_id}:${event.summary_index}`,
                metadata: { openai: makeItemIdMetadata(event.item_id) }
              })
              // Mark the summary part concluded
              reasoningPart.summaryParts[event.summary_index] = "concluded"
            } else {
              // Mark the summary part as can-conclude given we still need a
              // final summary part with the encrypted content
              reasoningPart.summaryParts[event.summary_index] = "can-conclude"
            }
            break
          }
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
  request: typeof OpenAiSchema.CreateResponse.Encoded
): void => {
  addGenAIAnnotations(span, {
    system: "openai",
    operation: { name: "chat" },
    request: {
      model: request.model as string,
      temperature: request.temperature as number | undefined,
      topP: request.top_p as number | undefined,
      maxTokens: request.max_output_tokens as number | undefined
    },
    openai: {
      request: {
        responseFormat: (request.text as any)?.format?.type,
        serviceTier: request.service_tier as string | undefined
      }
    }
  })
}

const annotateResponse = (span: Span, response: OpenAiSchema.Response): void => {
  const finishReason = response.incomplete_details?.reason as string | undefined
  addGenAIAnnotations(span, {
    response: {
      id: response.id,
      model: response.model as string,
      finishReasons: Predicate.isNotUndefined(finishReason) ? [finishReason] : undefined
    },
    usage: {
      inputTokens: response.usage?.input_tokens as number | undefined,
      outputTokens: response.usage?.output_tokens as number | undefined
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

type OpenAiToolChoice = typeof OpenAiSchema.CreateResponse.Encoded["tool_choice"]

const prepareTools = Effect.fnUntraced(function*<Tools extends ReadonlyArray<Tool.Any>>({
  config,
  options,
  toolNameMapper
}: {
  readonly config: typeof Config.Service
  readonly options: LanguageModel.ProviderOptions
  readonly toolNameMapper: Tool.NameMapper<Tools>
}): Effect.fn.Return<{
  readonly tools: ReadonlyArray<typeof OpenAiSchema.Tool.Encoded> | undefined
  readonly toolChoice: OpenAiToolChoice | undefined
}, AiError.AiError> {
  // Return immediately if no tools are in the toolkit
  if (options.tools.length === 0) {
    return { tools: undefined, toolChoice: undefined }
  }

  const tools: Array<typeof OpenAiSchema.Tool.Encoded> = []
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
      const description = Tool.getDescription(tool)
      const parameters = yield* tryToolJsonSchema(tool, "prepareTools")
      tools.push({
        type: "function",
        name: tool.name,
        parameters,
        strict,
        ...(Predicate.isNotUndefined(description) ? { description } : undefined)
      })
    }

    if (Tool.isProviderDefined(tool)) {
      const openAiTool = tool as OpenAiTool.OpenAiTool
      switch (openAiTool.name) {
        case "OpenAiApplyPatch": {
          tools.push({ type: "apply_patch" })
          break
        }
        case "OpenAiCodeInterpreter": {
          const args = yield* Schema.decodeUnknownEffect(openAiTool.argsSchema)(tool.args).pipe(
            Effect.mapError((error) =>
              AiError.make({
                module: "OpenAiLanguageModel",
                method: "prepareTools",
                reason: new AiError.ToolConfigurationError({
                  toolName: openAiTool.name,
                  description: error.message
                })
              })
            )
          )
          tools.push({
            ...args,
            type: "code_interpreter"
          })
          break
        }
        case "OpenAiFileSearch": {
          const args = yield* Schema.decodeUnknownEffect(openAiTool.argsSchema)(tool.args).pipe(
            Effect.mapError((error) =>
              AiError.make({
                module: "OpenAiLanguageModel",
                method: "prepareTools",
                reason: new AiError.ToolConfigurationError({
                  toolName: openAiTool.name,
                  description: error.message
                })
              })
            )
          )
          tools.push({
            ...args,
            type: "file_search"
          })
          break
        }
        case "OpenAiShell": {
          tools.push({ type: "shell" })
          break
        }
        case "OpenAiImageGeneration": {
          const args = yield* Schema.decodeUnknownEffect(openAiTool.argsSchema)(tool.args).pipe(
            Effect.mapError((error) =>
              AiError.make({
                module: "OpenAiLanguageModel",
                method: "prepareTools",
                reason: new AiError.ToolConfigurationError({
                  toolName: openAiTool.name,
                  description: error.message
                })
              })
            )
          )
          tools.push({
            ...args,
            type: "image_generation"
          })
          break
        }
        case "OpenAiLocalShell": {
          tools.push({ type: "local_shell" })
          break
        }
        case "OpenAiMcp": {
          const args = yield* Schema.decodeUnknownEffect(openAiTool.argsSchema)(tool.args).pipe(
            Effect.mapError((error) =>
              AiError.make({
                module: "OpenAiLanguageModel",
                method: "prepareTools",
                reason: new AiError.ToolConfigurationError({
                  toolName: openAiTool.name,
                  description: error.message
                })
              })
            )
          )
          tools.push({
            ...args,
            type: "mcp"
          })
          break
        }
        case "OpenAiWebSearch": {
          const args = yield* Schema.decodeUnknownEffect(openAiTool.argsSchema)(tool.args).pipe(
            Effect.mapError((error) =>
              AiError.make({
                module: "OpenAiLanguageModel",
                method: "prepareTools",
                reason: new AiError.ToolConfigurationError({
                  toolName: openAiTool.name,
                  description: error.message
                })
              })
            )
          )
          tools.push({
            ...args,
            type: "web_search"
          })
          break
        }
        case "OpenAiWebSearchPreview": {
          const args = yield* Schema.decodeUnknownEffect(openAiTool.argsSchema)(tool.args).pipe(
            Effect.mapError((error) =>
              AiError.make({
                module: "OpenAiLanguageModel",
                method: "prepareTools",
                reason: new AiError.ToolConfigurationError({
                  toolName: openAiTool.name,
                  description: error.message
                })
              })
            )
          )
          tools.push({
            ...args,
            type: "web_search_preview"
          })
          break
        }
        default: {
          return yield* AiError.make({
            module: "OpenAiLanguageModel",
            method: "prepareTools",
            reason: new AiError.InvalidRequestError({
              description: `Unknown provider-defined tool '${tool.name}'`
            })
          })
        }
      }
    }
  }

  if (options.toolChoice === "auto" || options.toolChoice === "none" || options.toolChoice === "required") {
    toolChoice = options.toolChoice
  }

  if (typeof options.toolChoice === "object" && "tool" in options.toolChoice) {
    const toolName = toolNameMapper.getProviderName(options.toolChoice.tool)
    const providerNames = toolNameMapper.providerNames
    if (providerNames.includes(toolName)) {
      toolChoice = { type: toolName as any }
    } else {
      toolChoice = { type: "function", name: options.toolChoice.tool }
    }
  }

  return { tools, toolChoice }
})

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
): typeof OpenAiSchema.MessageStatus.Encoded | null => part.options.openai?.status ?? null
const getEncryptedContent = (
  part: Prompt.ReasoningPart
): string | null => part.options.openai?.encryptedContent ?? null

const getImageDetail = (part: Prompt.FilePart): ImageDetail => part.options.openai?.imageDetail ?? "auto"

const getPromptCacheBreakpoint = (
  input: Prompt.SystemMessage | Prompt.TextPart
) => {
  const promptCacheBreakpoint = input.options.openai?.promptCacheBreakpoint
  return Predicate.isNotNullish(promptCacheBreakpoint) ? { prompt_cache_breakpoint: promptCacheBreakpoint } : undefined
}

const makeItemIdMetadata = (itemId: string | undefined) => Predicate.isNotUndefined(itemId) ? { itemId } : {}

const makeEncryptedContentMetadata = (encryptedContent: string | null | undefined) =>
  Predicate.isNotNullish(encryptedContent) ? { encryptedContent } : undefined

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

const prepareResponseFormat = Effect.fnUntraced(function*({ config, options }: {
  readonly config: typeof Config.Service
  readonly options: LanguageModel.ProviderOptions
}): Effect.fn.Return<typeof OpenAiSchema.TextResponseFormatConfiguration.Encoded, AiError.AiError> {
  if (options.responseFormat.type === "json") {
    const name = options.responseFormat.objectName
    const schema = options.responseFormat.schema
    const jsonSchema = yield* tryJsonSchema(schema, "prepareResponseFormat")
    return {
      type: "json_schema",
      name,
      description: AST.resolveDescription(schema.ast) ?? "Response with a JSON object",
      schema: jsonSchema,
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

const getApprovalRequestIdMapping = (prompt: Prompt.Prompt): ReadonlyMap<string, string> => {
  const mapping = new Map<string, string>()

  for (const message of prompt.content) {
    if (message.role !== "assistant") {
      continue
    }

    for (const part of message.content) {
      if (part.type !== "tool-call") {
        continue
      }

      const approvalRequestId = part.options.openai?.approvalRequestId

      if (Predicate.isNotNullish(approvalRequestId)) {
        mapping.set(approvalRequestId, part.id)
      }
    }
  }

  return mapping
}

const normalizeMcpToolCall = Effect.fnUntraced(function*<Tools extends ReadonlyArray<Tool.Any>>({
  toolNameMapper,
  toolParams,
  method
}: {
  readonly toolNameMapper: Tool.NameMapper<Tools>
  readonly toolParams: unknown
  readonly method: string
}): Effect.fn.Return<{
  readonly toolName: string
  readonly params: unknown
}, AiError.AiError> {
  const toolName = toolNameMapper.getCustomName("mcp")

  if (typeof toolParams !== "string") {
    return { toolName, params: toolParams }
  }

  const params = yield* Effect.try({
    try: () => Tool.unsafeSecureJsonParse(toolParams),
    catch: (cause) =>
      AiError.make({
        module: "OpenAiLanguageModel",
        method,
        reason: new AiError.ToolParameterValidationError({
          toolName,
          description: `Failed to securely JSON parse tool parameters: ${cause}`
        })
      })
  })

  return { toolName, params }
})

const getUsage = (usage: OpenAiSchema.ResponseUsage | null | undefined): Response.Usage => {
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

  const inputTokens = usage.input_tokens
  const outputTokens = usage.output_tokens
  const cachedTokens = getUsageTokenDetail(usage.input_tokens_details, "cached_tokens") ?? 0
  const cacheWriteTokens = getUsageTokenDetail(usage.input_tokens_details, "cache_write_tokens")
  const reasoningTokens = getUsageTokenDetail(usage.output_tokens_details, "reasoning_tokens") ?? 0

  return {
    inputTokens: {
      uncached: inputTokens - cachedTokens,
      total: inputTokens,
      cacheRead: cachedTokens,
      cacheWrite: cacheWriteTokens
    },
    outputTokens: {
      total: outputTokens,
      text: outputTokens - reasoningTokens,
      reasoning: reasoningTokens
    }
  }
}

type ServiceTier = "default" | "auto" | "flex" | "scale" | "priority" | null

const toFinishMetadata = (response: OpenAiSchema.Response): {
  readonly metadata: Response.FinishPartMetadata
} | undefined => {
  let serviceTier: ServiceTier | undefined
  switch (response.service_tier) {
    case "default":
    case "auto":
    case "flex":
    case "scale":
    case "priority":
      serviceTier = response.service_tier
      break
  }

  const promptCacheDiagnostics = response.prompt_cache_diagnostics
  if (serviceTier === undefined && promptCacheDiagnostics === undefined) {
    return undefined
  }

  return {
    metadata: {
      openai: {
        ...(serviceTier === undefined ? undefined : { serviceTier }),
        ...(promptCacheDiagnostics === undefined ? undefined : { promptCacheDiagnostics })
      }
    }
  }
}

const getUsageTokenDetail = (details: unknown, key: string): number | undefined =>
  Predicate.hasProperty(details, key) && typeof details[key] === "number" ? details[key] : undefined

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
