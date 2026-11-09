/**
 * OpenTelemetry resource service and layers.
 *
 * An OpenTelemetry resource identifies the process or service that emits spans,
 * metrics, and logs. This module stores that resource in Effect context and
 * provides layers for creating it from explicit service metadata, from
 * `OTEL_SERVICE_NAME` and `OTEL_RESOURCE_ATTRIBUTES`, or as an empty resource.
 * It also includes `configToAttributes` for turning service metadata into raw
 * OpenTelemetry attributes.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type * as OtelApi from "@opentelemetry/api"
import * as Resources from "@opentelemetry/resources"
import * as OtelSemConv from "@opentelemetry/semantic-conventions"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as Version from "effect/Version"

/**
 * Service tag for OpenTelemetry metadata attached to emitted telemetry.
 *
 * **When to use**
 *
 * Use to provide process, service, and deployment metadata that should be
 * attached to spans, metrics, and logs.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class Resource extends Context.Service<
  Resource,
  Resources.Resource
>()("@effect/opentelemetry/Resource") {}

/**
 * Creates a `Resource` layer from service metadata and additional OpenTelemetry attributes.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer = (config: {
  readonly serviceName: string
  readonly serviceVersion?: string
  readonly attributes?: OtelApi.Attributes
}) =>
  Layer.succeed(
    Resource,
    Resources.resourceFromAttributes(configToAttributes(config))
  )

const sdkAttributes = (): Record<string, string> => ({
  [OtelSemConv.ATTR_TELEMETRY_SDK_NAME]: "@effect/opentelemetry",
  [OtelSemConv.ATTR_TELEMETRY_SDK_LANGUAGE]: typeof (globalThis as any).document === "undefined"
    ? OtelSemConv.TELEMETRY_SDK_LANGUAGE_VALUE_NODEJS
    : OtelSemConv.TELEMETRY_SDK_LANGUAGE_VALUE_WEBJS,
  [OtelSemConv.ATTR_TELEMETRY_SDK_VERSION]: Version.getCurrentVersion()
})

/**
 * Converts service metadata into OpenTelemetry attributes with SDK defaults.
 *
 * **When to use**
 *
 * Use to turn explicit service metadata into a raw OpenTelemetry attribute map
 * for lower-level resource construction or merging with environment-derived
 * attributes via `layerFromEnv`.
 *
 * **Details**
 *
 * Custom attributes override `telemetry.sdk.*` defaults. Service options override
 * matching attributes. An empty `serviceVersion` is treated as absent.
 *
 * @see {@link layer} for creating a `Resource` layer from explicit metadata
 * @see {@link layerFromEnv} for merging attributes with OpenTelemetry environment variables
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const configToAttributes = (options: {
  readonly serviceName: string
  readonly serviceVersion?: string
  readonly attributes?: OtelApi.Attributes
}): Record<string, string> => {
  const attributes: Record<string, string> = {
    ...sdkAttributes(),
    ...(options.attributes ?? undefined),
    [OtelSemConv.ATTR_SERVICE_NAME]: options.serviceName
  }
  if (options.serviceVersion) {
    attributes[OtelSemConv.ATTR_SERVICE_VERSION] = options.serviceVersion
  }
  return attributes
}

/**
 * Creates a `Resource` layer from SDK defaults, then environment variables,
 * then additional attributes (later values take precedence).
 *
 * **Details**
 *
 * `OTEL_RESOURCE_ATTRIBUTES` is read with `Config.Record`, so a structured
 * config value is accepted as well as a `key=value` list. In the list, keys and
 * values are trimmed, then percent-decoded once. Entries with an empty value
 * are kept as `""`; entries without `=` or with an empty key are skipped. When
 * a key is repeated as written, the last entry wins and the earlier ones are
 * not decoded. If any remaining key or value is not valid percent-encoding,
 * the whole variable is discarded and a warning is logged.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerFromEnv = (
  additionalAttributes?:
    | OtelApi.Attributes
    | undefined
): Layer.Layer<Resource> =>
  Layer.effect(
    Resource,
    Effect.gen(function*() {
      const serviceName = yield* Config.option(Config.String("OTEL_SERVICE_NAME"))
      const attributes = yield* Config.Record(
        Schema.StringFromUriComponent,
        Schema.StringFromUriComponent,
        "OTEL_RESOURCE_ATTRIBUTES",
        { trim: true, keepEmptyValues: true }
      ).pipe(
        Config.withDefault({}),
        Effect.catch((error) => Effect.as(Effect.logWarning("Discarding OTEL_RESOURCE_ATTRIBUTES", error), {}))
      )
      return Resources.resourceFromAttributes({
        ...sdkAttributes(),
        ...attributes,
        ...(serviceName._tag === "Some" ? { [OtelSemConv.ATTR_SERVICE_NAME]: serviceName.value } : undefined),
        ...additionalAttributes
      })
    }).pipe(Effect.orDie)
  )

/**
 * Layer that provides an empty OpenTelemetry resource.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerEmpty = Layer.succeed(
  Resource,
  Resources.emptyResource()
)
