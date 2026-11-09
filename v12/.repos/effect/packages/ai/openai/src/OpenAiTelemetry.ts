/**
 * The `OpenAiTelemetry` module defines OpenAI-specific telemetry attributes
 * and a helper for adding them to a tracing span. It keeps the standard GenAI
 * telemetry attributes and adds service tier and system fingerprint under
 * `openai.*`.
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
export type OpenAiTelemetryAttributes = Simplify<
  & Telemetry.GenAITelemetryAttributes
  & Telemetry.AttributesWithPrefix<RequestAttributes, "openai.request">
  & Telemetry.AttributesWithPrefix<ResponseAttributes, "openai.response">
>

/**
 * OpenAI request metadata, written under `openai.request.*`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface RequestAttributes {
  /**
   * The service tier requested. May be a specific tier, `default`, or `auto`.
   */
  readonly serviceTier?: (string & {}) | WellKnownServiceTier | null | undefined
}

/**
 * Telemetry attributes which are part of the GenAI specification and are
 * namespaced by `openai.response`.
 *
 * @stability unstable
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
 * The `openai.request.service_tier` attribute has the following
 * list of well-known values.
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
export type WellKnownServiceTier = "auto" | "default"

/**
 * Options accepted by `addGenAIAnnotations`, combining standard GenAI
 * telemetry attributes with optional OpenAI request and response attributes.
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export type OpenAiTelemetryAttributeOptions = Telemetry.GenAITelemetryAttributeOptions & {
  openai?: {
    request?: RequestAttributes | undefined
    response?: ResponseAttributes | undefined
  } | undefined
}

const addOpenAiRequestAttributes = Telemetry.addSpanAttributes("openai.request", String.camelToSnake)<
  RequestAttributes
>
const addOpenAiResponseAttributes = Telemetry.addSpanAttributes("openai.response", String.camelToSnake)<
  ResponseAttributes
>

/**
 * Applies the specified OpenAI GenAI telemetry attributes to the provided
 * `Span`.
 *
 * **When to use**
 *
 * Use to annotate an existing OpenTelemetry span with standard GenAI attributes
 * plus OpenAI-specific request and response metadata.
 *
 * **Gotchas**
 *
 * Mutates the supplied `Span` in place.
 *
 * @see {@link OpenAiTelemetryAttributeOptions} for the accepted telemetry attributes
 * @see {@link Telemetry.addGenAIAnnotations} for the provider-neutral annotation helper
 *
 * @stability unstable
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
