/**
 * The `AnthropicTelemetry` module defines Anthropic-specific telemetry
 * attributes and a helper for adding them to a tracing span. It keeps the
 * standard GenAI telemetry attributes and adds request and response metadata
 * under the `gen_ai.anthropic.*` OpenTelemetry namespaces.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Telemetry from "effect/ai/Telemetry"
import { dual } from "effect/Function"
import * as String from "effect/String"
import type { Span } from "effect/Tracer"
import type { Simplify } from "effect/Types"

/**
 * The attributes used to describe telemetry in the context of Generative
 * Artificial Intelligence (GenAI) Models requests and responses.
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
export type AnthropicTelemetryAttributes = Simplify<
  & Telemetry.GenAITelemetryAttributes
  & Telemetry.AttributesWithPrefix<RequestAttributes, "gen_ai.anthropic.request">
  & Telemetry.AttributesWithPrefix<ResponseAttributes, "gen_ai.anthropic.response">
>

/**
 * Telemetry attributes which are part of the GenAI specification and are
 * namespaced by `gen_ai.anthropic.request`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface RequestAttributes {
  /**
   * Whether extended thinking is enabled.
   */
  readonly extendedThinking?: boolean | null | undefined
  /**
   * The budget tokens for extended thinking.
   */
  readonly thinkingBudgetTokens?: number | null | undefined
}

/**
 * Telemetry attributes which are part of the GenAI specification and are
 * namespaced by `gen_ai.anthropic.response`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ResponseAttributes {
  /**
   * The stop reason from the response.
   */
  readonly stopReason?: string | null | undefined
}

/**
 * Options accepted by `addGenAIAnnotations`, combining standard GenAI telemetry attributes with optional Anthropic request and response attributes.
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export type AnthropicTelemetryAttributeOptions = Telemetry.GenAITelemetryAttributeOptions & {
  anthropic?: {
    request?: RequestAttributes | undefined
    response?: ResponseAttributes | undefined
  } | undefined
}

const addAnthropicRequestAttributes = Telemetry.addSpanAttributes("gen_ai.anthropic.request", String.camelToSnake)<
  RequestAttributes
>
const addAnthropicResponseAttributes = Telemetry.addSpanAttributes("gen_ai.anthropic.response", String.camelToSnake)<
  ResponseAttributes
>

/**
 * Applies the specified Anthropic GenAI telemetry attributes to the provided
 * `Span`.
 *
 * **When to use**
 *
 * Use to annotate an Anthropic model span with standard GenAI telemetry
 * attributes and Anthropic-specific request or response metadata.
 *
 * **Gotchas**
 *
 * This method mutates the `Span` in place.
 *
 * @stability unstable
 * @category tracing
 * @since 4.0.0
 */
export const addGenAIAnnotations: {
  (options: AnthropicTelemetryAttributeOptions): (span: Span) => void
  (span: Span, options: AnthropicTelemetryAttributeOptions): void
} = dual(2, (span: Span, options: AnthropicTelemetryAttributeOptions) => {
  Telemetry.addGenAIAnnotations(span, options)
  if (options.anthropic != null) {
    if (options.anthropic.request != null) {
      addAnthropicRequestAttributes(span, options.anthropic.request)
    }
    if (options.anthropic.response != null) {
      addAnthropicResponseAttributes(span, options.anthropic.response)
    }
  }
})
