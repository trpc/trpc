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
import * as Arr from "effect/Array"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Rec from "effect/Record"

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

/**
 * Converts resource configuration into OpenTelemetry attributes, adding service name, optional service version, and telemetry SDK metadata.
 *
 * **When to use**
 *
 * Use to turn explicit service metadata into a raw OpenTelemetry attribute map
 * for lower-level resource construction or merging with environment-derived
 * attributes via `layerFromEnv`.
 *
 * **Details**
 *
 * The returned record copies `attributes` first, then sets `service.name`,
 * `telemetry.sdk.name`, and `telemetry.sdk.language`. `service.version` is
 * included only when `serviceVersion` is provided.
 *
 * **Gotchas**
 *
 * Custom values for `service.name` and `telemetry.sdk.*` are overwritten by this
 * helper. An empty `serviceVersion` is treated as absent.
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
    ...(options.attributes ?? undefined),
    [OtelSemConv.ATTR_SERVICE_NAME]: options.serviceName,
    [OtelSemConv.ATTR_TELEMETRY_SDK_NAME]: "@effect/opentelemetry",
    [OtelSemConv.ATTR_TELEMETRY_SDK_LANGUAGE]: typeof (globalThis as any).document === "undefined"
      ? OtelSemConv.TELEMETRY_SDK_LANGUAGE_VALUE_NODEJS
      : OtelSemConv.TELEMETRY_SDK_LANGUAGE_VALUE_WEBJS
  }
  if (options.serviceVersion) {
    attributes[OtelSemConv.ATTR_SERVICE_VERSION] = options.serviceVersion
  }
  return attributes
}

/**
 * Creates a `Resource` layer from OpenTelemetry environment variables, optionally merging additional attributes.
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
      const attributes = yield* Config.String("OTEL_RESOURCE_ATTRIBUTES").pipe(
        Config.withDefault(""),
        Config.map((s) => {
          const attrs = s.split(",")
          return Arr.reduce(attrs, {} as OtelApi.Attributes, (acc, attr) => {
            const parts = attr.split("=")
            if (parts.length !== 2) {
              return acc
            }
            Rec.assignProperty(acc, parts[0].trim(), parts[1].trim())
            return acc
          })
        })
      )
      if (serviceName._tag === "Some") {
        attributes[OtelSemConv.ATTR_SERVICE_NAME] = serviceName.value
      }
      return Resources.resourceFromAttributes({
        ...attributes,
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
