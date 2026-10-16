/**
 * Adds OpenTelemetry GenAI attributes to Effect AI spans.
 *
 * This module models the `gen_ai.*` attributes used by language model and
 * embedding providers. It includes attribute types, helpers for writing
 * non-null attributes onto existing spans, and a `CurrentSpanTransformer`
 * service for adding custom span annotations from provider options and response
 * parts.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Context from "../Context.ts"
import { dual } from "../Function.ts"
import * as Predicate from "../Predicate.ts"
import * as String from "../String.ts"
import type * as Struct from "../Struct.ts"
import type { Span } from "../Tracer.ts"
import type { ProviderOptions } from "./LanguageModel.ts"
import type * as Response from "./Response.ts"

/**
 * The attributes used to describe telemetry in the context of Generative
 * Artificial Intelligence (GenAI) models requests and responses.
 *
 * **Details**
 *
 * These attributes follow the OpenTelemetry generative AI semantic
 * conventions:
 * https://opentelemetry.io/docs/specs/semconv/attributes-registry/gen-ai/
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type GenAITelemetryAttributes = Struct.Simplify<
  & AttributesWithPrefix<BaseAttributes, "gen_ai">
  & AttributesWithPrefix<OperationAttributes, "gen_ai.operation">
  & AttributesWithPrefix<TokenAttributes, "gen_ai.token">
  & AttributesWithPrefix<UsageAttributes, "gen_ai.usage">
  & AttributesWithPrefix<RequestAttributes, "gen_ai.request">
  & AttributesWithPrefix<ResponseAttributes, "gen_ai.response">
>

/**
 * All telemetry attributes which are part of the GenAI specification.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type AllAttributes =
  & BaseAttributes
  & OperationAttributes
  & TokenAttributes
  & UsageAttributes
  & RequestAttributes
  & ResponseAttributes

/**
 * Telemetry attributes which are part of the GenAI specification and are
 * namespaced by `gen_ai`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface BaseAttributes {
  /**
   * The Generative AI product as identified by the client or server
   * instrumentation.
   */
  readonly system?: (string & {}) | WellKnownSystem | null | undefined
}

/**
 * Telemetry attributes which are part of the GenAI specification and are
 * namespaced by `gen_ai.operation`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface OperationAttributes {
  readonly name?: (string & {}) | WellKnownOperationName | null | undefined
}

/**
 * Telemetry attributes which are part of the GenAI specification and are
 * namespaced by `gen_ai.token`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface TokenAttributes {
  readonly type?: string | null | undefined
}

/**
 * Telemetry attributes which are part of the GenAI specification and are
 * namespaced by `gen_ai.usage`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface UsageAttributes {
  readonly inputTokens?: number | null | undefined
  readonly outputTokens?: number | null | undefined
}

/**
 * Telemetry attributes which are part of the GenAI specification and are
 * namespaced by `gen_ai.request`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface RequestAttributes {
  /**
   * The name of the GenAI model a request is being made to.
   */
  readonly model?: string | null | undefined
  /**
   * The temperature setting for the GenAI request.
   */
  readonly temperature?: number | null | undefined
  /**
   * The temperature setting for the GenAI request.
   */
  readonly topK?: number | null | undefined
  /**
   * The top_k sampling setting for the GenAI request.
   */
  readonly topP?: number | null | undefined
  /**
   * The top_p sampling setting for the GenAI request.
   */
  readonly maxTokens?: number | null | undefined
  /**
   * The encoding formats requested in an embeddings operation, if specified.
   */
  readonly encodingFormats?: ReadonlyArray<string> | null | undefined
  /**
   * List of sequences that the model will use to stop generating further
   * tokens.
   */
  readonly stopSequences?: ReadonlyArray<string> | null | undefined
  /**
   * The frequency penalty setting for the GenAI request.
   */
  readonly frequencyPenalty?: number | null | undefined
  /**
   * The presence penalty setting for the GenAI request.
   */
  readonly presencePenalty?: number | null | undefined
  /**
   * The seed setting for the GenAI request. Requests with same seed value
   * are more likely to return same result.
   */
  readonly seed?: number | null | undefined
}

/**
 * Telemetry attributes which are part of the GenAI specification and are
 * namespaced by `gen_ai.response`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ResponseAttributes {
  /**
   * The unique identifier for the completion.
   */
  readonly id?: string | null | undefined
  /**
   * The name of the model that generated the response.
   */
  readonly model?: string | null | undefined
  /**
   * Array of reasons the model stopped generating tokens, corresponding to
   * each generation received.
   */
  readonly finishReasons?: ReadonlyArray<string> | null | undefined
}

/**
 * The `gen_ai.operation.name` attribute has the following list of well-known
 * values.
 *
 * **Details**
 *
 * If one of them applies, then the respective value **MUST** be used;
 * otherwise, a custom value **MAY** be used.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type WellKnownOperationName = "chat" | "embeddings" | "text_completion"

/**
 * The `gen_ai.system` attribute has the following list of well-known values.
 *
 * **Details**
 *
 * If one of them applies, then the respective value **MUST** be used;
 * otherwise, a custom value **MAY** be used.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type WellKnownSystem =
  | "anthropic"
  | "aws.bedrock"
  | "az.ai.inference"
  | "az.ai.openai"
  | "cohere"
  | "deepseek"
  | "gemini"
  | "groq"
  | "ibm.watsonx.ai"
  | "mistral_ai"
  | "openai"
  | "perplexity"
  | "vertex_ai"
  | "xai"

/**
 * Utility type for prefixing attribute names with a namespace.
 *
 * **Details**
 *
 * Transforms attribute keys by adding a prefix and formatting them according to
 * OpenTelemetry conventions (camelCase to snake_case).
 *
 * **Example** (Prefixing telemetry attributes)
 *
 * ```ts import.meta.vitest
 * import type { Telemetry } from "effect/ai"
 *
 * type RequestAttrs = {
 *   modelName: string
 *   maxTokens: number
 * }
 *
 * type PrefixedAttrs = Telemetry.AttributesWithPrefix<
 *   RequestAttrs,
 *   "gen_ai.request"
 * >
 * // Results in: {
 * //   "gen_ai.request.model_name": string
 * //   "gen_ai.request.max_tokens": number
 * // }
 * const attributes: PrefixedAttrs = {
 *   "gen_ai.request.model_name": "gpt-4",
 *   "gen_ai.request.max_tokens": 1000
 * }
 * Object.keys(attributes) // => ["gen_ai.request.model_name", "gen_ai.request.max_tokens"]
 * ```
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type AttributesWithPrefix<Attributes extends Record<string, any>, Prefix extends string> = {
  [Name in keyof Attributes as `${Prefix}.${FormatAttributeName<Name>}`]: Attributes[Name]
}

/**
 * Utility type for converting camelCase names to snake_case format.
 *
 * **Details**
 *
 * This type recursively transforms string literal types from camelCase to
 * snake_case, which is the standard format for OpenTelemetry attributes.
 *
 * **Example** (Formatting attribute names)
 *
 * ```ts import.meta.vitest
 * import type { Telemetry } from "effect/ai"
 *
 * type Formatted1 = Telemetry.FormatAttributeName<"modelName"> // "model_name"
 * type Formatted2 = Telemetry.FormatAttributeName<"maxTokens"> // "max_tokens"
 * type Formatted3 = Telemetry.FormatAttributeName<"temperature"> // "temperature"
 *
 * const formatted: [Formatted1, Formatted2, Formatted3] = [
 *   "model_name",
 *   "max_tokens",
 *   "temperature"
 * ]
 * formatted // => ["model_name", "max_tokens", "temperature"]
 * ```
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type FormatAttributeName<T extends string | number | symbol> = T extends string ?
  T extends `${infer First}${infer Rest}`
    ? `${First extends Uppercase<First> ? "_" : ""}${Lowercase<First>}${FormatAttributeName<Rest>}`
  : T :
  never

/**
 * Creates a reusable span-attribute writer for a key prefix and key
 * transformer.
 *
 * **Details**
 *
 * The returned function mutates the supplied span by adding each non-nullish
 * attribute as `${prefix}.${transformedKey}`.
 *
 * **Example** (Adding prefixed span attributes)
 *
 * ```ts import.meta.vitest
 * import { Context, Option, String, Tracer } from "effect"
 * import { Telemetry } from "effect/ai"
 *
 * const addCustomAttributes = Telemetry.addSpanAttributes(
 *   "custom.ai",
 *   String.camelToSnake
 * )
 *
 * const span = new Tracer.NativeSpan({
 *   name: "request",
 *   parent: Option.none(),
 *   annotations: Context.empty(),
 *   links: [],
 *   startTime: 0n,
 *   kind: "internal",
 *   sampled: true
 * })
 *
 * addCustomAttributes(span, {
 *   modelName: "gpt-4",
 *   maxTokens: 1000
 * })
 *
 * Array.from(span.attributes.keys()) // => ["custom.ai.model_name", "custom.ai.max_tokens"]
 * ```
 *
 * @stability unstable
 * @category annotations
 * @since 4.0.0
 */
export const addSpanAttributes = (
  /**
   * The prefix to add to all attribute keys.
   */
  keyPrefix: string,
  /**
   * Function to transform attribute keys (e.g., camelCase to snake_case).
   */
  transformKey: (key: string) => string
) =>
<Attributes extends Record<string, any>>(
  /**
   * The OpenTelemetry span to add attributes to.
   */
  span: Span,
  /**
   * The attributes to add to the span.
   */
  attributes: Attributes
): void => {
  for (const [key, value] of Object.entries(attributes)) {
    if (Predicate.isNotNullish(value)) {
      span.attribute(`${keyPrefix}.${transformKey(key)}`, value)
    }
  }
}

const addSpanBaseAttributes = addSpanAttributes("gen_ai", String.camelToSnake)<BaseAttributes>
const addSpanOperationAttributes = addSpanAttributes("gen_ai.operation", String.camelToSnake)<OperationAttributes>
const addSpanRequestAttributes = addSpanAttributes("gen_ai.request", String.camelToSnake)<RequestAttributes>
const addSpanResponseAttributes = addSpanAttributes("gen_ai.response", String.camelToSnake)<ResponseAttributes>
const addSpanTokenAttributes = addSpanAttributes("gen_ai.token", String.camelToSnake)<TokenAttributes>
const addSpanUsageAttributes = addSpanAttributes("gen_ai.usage", String.camelToSnake)<UsageAttributes>

/**
 * Configuration options for GenAI telemetry attributes.
 *
 * **Details**
 *
 * Combines base attributes with optional grouped attributes for comprehensive
 * telemetry coverage of AI operations.
 *
 * **Example** (Configuring GenAI telemetry attributes)
 *
 * ```ts import.meta.vitest
 * import type { Telemetry } from "effect/ai"
 *
 * const telemetryOptions: Telemetry.GenAITelemetryAttributeOptions = {
 *   system: "openai",
 *   operation: {
 *     name: "chat"
 *   },
 *   request: {
 *     model: "gpt-4-turbo",
 *     temperature: 0.7,
 *     maxTokens: 2000
 *   },
 *   response: {
 *     id: "chatcmpl-123",
 *     model: "gpt-4-turbo-2024-04-09",
 *     finishReasons: ["stop"]
 *   },
 *   usage: {
 *     inputTokens: 50,
 *     outputTokens: 25
 *   }
 * }
 *
 * const result = [telemetryOptions.system, telemetryOptions.usage?.inputTokens] // => ["openai", 50]
 * ```
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export type GenAITelemetryAttributeOptions = BaseAttributes & {
  /**
   * Operation-specific attributes (e.g., operation name).
   */
  readonly operation?: OperationAttributes | undefined
  /**
   * Request-specific attributes (e.g., model parameters).
   */
  readonly request?: RequestAttributes | undefined
  /**
   * Response-specific attributes (e.g., response metadata).
   */
  readonly response?: ResponseAttributes | undefined
  /**
   * Token-specific attributes.
   */
  readonly token?: TokenAttributes | undefined
  /**
   * Usage statistics attributes (e.g., token counts).
   */
  readonly usage?: UsageAttributes | undefined
}

/**
 * Applies GenAI telemetry attributes to an OpenTelemetry span.
 *
 * **When to use**
 *
 * Use when you need to write GenAI request, response, token, or usage
 * attributes onto an existing OpenTelemetry span.
 *
 * **Details**
 *
 * This function adds standardized GenAI attributes to a span following
 * OpenTelemetry semantic conventions.
 *
 * **Gotchas**
 *
 * This function mutates the provided span in-place.
 *
 * **Example** (Adding GenAI telemetry annotations)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * import { Telemetry } from "effect/ai"
 *
 * const directUsage = Effect.gen(function*() {
 *   const span = yield* Effect.currentSpan
 *
 *   Telemetry.addGenAIAnnotations(span, {
 *     system: "openai",
 *     request: { model: "gpt-4", temperature: 0.7 },
 *     usage: { inputTokens: 100, outputTokens: 50 }
 *   })
 *   return (span as { attributes: ReadonlyMap<string, unknown> }).attributes.size
 * })
 *
 * await Effect.runPromise(Effect.withSpan(directUsage, "example")) // => 5
 * ```
 *
 * @stability unstable
 * @category annotations
 * @since 4.0.0
 */
export const addGenAIAnnotations: {
  (options: GenAITelemetryAttributeOptions): (span: Span) => void
  (span: Span, options: GenAITelemetryAttributeOptions): void
} = dual(2, (span: Span, options: GenAITelemetryAttributeOptions) => {
  addSpanBaseAttributes(span, { system: options.system })
  if (Predicate.isNotNullish(options.operation)) addSpanOperationAttributes(span, options.operation)
  if (Predicate.isNotNullish(options.request)) addSpanRequestAttributes(span, options.request)
  if (Predicate.isNotNullish(options.response)) addSpanResponseAttributes(span, options.response)
  if (Predicate.isNotNullish(options.token)) addSpanTokenAttributes(span, options.token)
  if (Predicate.isNotNullish(options.usage)) addSpanUsageAttributes(span, options.usage)
})

/**
 * A function that can transform OpenTelemetry spans based on AI operation data.
 *
 * **Details**
 *
 * Span transformers receive the complete request/response context from AI operations
 * and can add custom telemetry attributes, metrics, or other observability data.
 *
 * **Example** (Transforming AI spans)
 *
 * ```ts import.meta.vitest
 * import type { Telemetry } from "effect/ai"
 *
 * const customTransformer: Telemetry.SpanTransformer = ({ response, span }) => {
 *   // Add custom attributes based on the response
 *   const textParts = response.filter((part) => part.type === "text")
 *   const totalTextLength = textParts.reduce(
 *     (sum, part) => sum + (part.type === "text" ? part.text.length : 0),
 *     0
 *   )
 *   span.attribute("total_text_length", totalTextLength)
 * }
 *
 * typeof customTransformer // => "function"
 * ```
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface SpanTransformer {
  (
    options: ProviderOptions & {
      /**
       * Array of response parts generated by the AI model.
       */
      readonly response: ReadonlyArray<Response.AllParts<any>>
    }
  ): void
}

/**
 * Service tag for providing a `SpanTransformer` to large language model
 * operations.
 *
 * **When to use**
 *
 * Use to retrieve or provide the current `SpanTransformer` through context for
 * language model span annotation.
 *
 * @see {@link SpanTransformer} for the transformer contract provided by this service
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class CurrentSpanTransformer extends Context.Service<CurrentSpanTransformer, SpanTransformer>()(
  "effect/ai/Telemetry/CurrentSpanTransformer"
) {}
