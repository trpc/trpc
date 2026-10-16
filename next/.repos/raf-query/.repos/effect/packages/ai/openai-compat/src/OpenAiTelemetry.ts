/**
 * The `OpenAiTelemetry` module defines OpenAI-compatible telemetry attributes
 * and a helper for adding them to a tracing span. It keeps the standard GenAI
 * telemetry attributes and adds request and response metadata under the
 * `gen_ai.openai.*` OpenTelemetry namespaces.
 *
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
 * @category models
 * @since 4.0.0
 */
export type OpenAiTelemetryAttributes = Simplify<
  & Telemetry.GenAITelemetryAttributes
  & Telemetry.AttributesWithPrefix<RequestAttributes, "gen_ai.openai.request">
  & Telemetry.AttributesWithPrefix<ResponseAttributes, "gen_ai.openai.response">
>

/**
 * All telemetry attributes which are part of the GenAI specification,
 * including the OpenAI-specific attributes.
 *
 * @category models
 * @since 4.0.0
 */
export type AllAttributes = Telemetry.AllAttributes & RequestAttributes & ResponseAttributes

/**
 * Telemetry attributes which are part of the GenAI specification and are
 * namespaced by `gen_ai.openai.request`.
 *
 * @category models
 * @since 4.0.0
 */
export interface RequestAttributes {
  /**
   * The response format that is requested.
   */
  readonly responseFormat?: (string & {}) | WellKnownResponseFormat | null | undefined
  /**
   * The service tier requested. May be a specific tier, `default`, or `auto`.
   */
  readonly serviceTier?: (string & {}) | WellKnownServiceTier | null | undefined
}

/**
 * Telemetry attributes which are part of the GenAI specification and are
 * namespaced by `gen_ai.openai.response`.
 *
 * @category models
 * @since 4.0.0
 */
export interface ResponseAttributes {
  /**
   * The service tier used for the response.
   */
  readonly serviceTier?: string | null | undefined
  /**
   * A fingerprint to track any eventual change in the Generative AI
   * environment.
   */
  readonly systemFingerprint?: string | null | undefined
}

/**
 * The `gen_ai.openai.request.response_format` attribute has a list of
 * well-known values.
 *
 * **Details**
 *
 * If one of them applies, then the respective value **MUST** be used;
 * otherwise, a custom value **MAY** be used.
 *
 * @category models
 * @since 4.0.0
 */
export type WellKnownResponseFormat = "json_object" | "json_schema" | "text"

/**
 * The `gen_ai.openai.request.service_tier` attribute has a list of
 * well-known values.
 *
 * **Details**
 *
 * If one of them applies, then the respective value **MUST** be used;
 * otherwise, a custom value **MAY** be used.
 *
 * @category models
 * @since 4.0.0
 */
export type WellKnownServiceTier = "auto" | "default"

/**
 * Options accepted by `addGenAIAnnotations`, combining standard GenAI telemetry
 * attributes with optional OpenAI-compatible request and response attributes.
 *
 * @category options
 * @since 4.0.0
 */
export type OpenAiTelemetryAttributeOptions = Telemetry.GenAITelemetryAttributeOptions & {
  openai?: {
    request?: RequestAttributes | undefined
    response?: ResponseAttributes | undefined
  } | undefined
}

const addOpenAiRequestAttributes = Telemetry.addSpanAttributes("gen_ai.openai.request", String.camelToSnake)<
  RequestAttributes
>
const addOpenAiResponseAttributes = Telemetry.addSpanAttributes("gen_ai.openai.response", String.camelToSnake)<
  ResponseAttributes
>

/**
 * Applies the specified OpenAI GenAI telemetry attributes to the provided
 * `Span`.
 *
 * **When to use**
 *
 * Use to annotate an OpenAI-compatible model span with standard GenAI telemetry
 * attributes and OpenAI-specific request or response metadata.
 *
 * **Details**
 *
 * Standard GenAI attributes are applied first. When OpenAI request or response
 * metadata is present, it is written under `gen_ai.openai.request.*` and
 * `gen_ai.openai.response.*` attributes.
 *
 * **Gotchas**
 *
 * Mutates the supplied `Span` in place.
 *
 * @category tracing
 * @since 4.0.0
 */
export const addGenAIAnnotations: {
  (options: OpenAiTelemetryAttributeOptions): (span: Span) => void
  (span: Span, options: OpenAiTelemetryAttributeOptions): void
} = dual(2, (span: Span, options: OpenAiTelemetryAttributeOptions) => {
  Telemetry.addGenAIAnnotations(span, options)
  if (options.openai != null) {
    if (options.openai.request != null) {
      addOpenAiRequestAttributes(span, options.openai.request)
    }
    if (options.openai.response != null) {
      addOpenAiResponseAttributes(span, options.openai.response)
    }
  }
})
