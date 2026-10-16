/**
 * Builds OTLP resource metadata shared by exported telemetry.
 *
 * An OTLP resource describes the service and other attributes attached to every
 * exported log, metric, or trace. This module builds resources from explicit
 * options or OpenTelemetry environment variables and converts JavaScript values
 * into OTLP attribute values.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Config from "../Config.ts"
import * as Effect from "../Effect.ts"
import { format } from "../Formatter.ts"
import * as Schema from "../Schema.ts"

/**
 * OTLP resource metadata attached to exported logs, metrics, and traces.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Resource {
  /** Resource attributes */
  attributes: Array<KeyValue>
  /** Resource droppedAttributesCount */
  droppedAttributesCount: number
}

/**
 * Creates an OTLP resource from service metadata and additional attributes.
 *
 * **Details**
 *
 * The resource always includes `service.name`, includes `service.version` when
 * provided, and converts custom attributes into OTLP attribute values.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = (options: {
  readonly serviceName: string
  readonly serviceVersion?: string | undefined
  readonly attributes?: Record<string, unknown> | undefined
}): Resource => {
  const resourceAttributes = options.attributes
    ? entriesToAttributes(Object.entries(options.attributes))
    : []
  resourceAttributes.push({
    key: "service.name",
    value: {
      stringValue: options.serviceName
    }
  })
  if (options.serviceVersion) {
    resourceAttributes.push({
      key: "service.version",
      value: {
        stringValue: options.serviceVersion
      }
    })
  }

  return {
    attributes: resourceAttributes,
    droppedAttributesCount: 0
  }
}

/**
 * Creates an OTLP resource from explicit options and OpenTelemetry
 * configuration.
 *
 * **When to use**
 *
 * Use when resource metadata may be configured in code or by the deployment
 * environment. To let operators set the service identity, omit `serviceName`,
 * `serviceVersion`, and their matching attributes, then use
 * `OTEL_SERVICE_NAME` and `OTEL_RESOURCE_ATTRIBUTES`.
 *
 * **Details**
 *
 * Explicit `serviceName` and `serviceVersion` options take precedence over
 * matching explicit attributes. Explicit attributes take precedence over
 * environment variables. `OTEL_SERVICE_NAME` and `OTEL_SERVICE_VERSION` take
 * precedence over matching attributes in `OTEL_RESOURCE_ATTRIBUTES`. Missing
 * required configuration is converted to a defect.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const fromConfig: (
  options?: {
    readonly serviceName?: string | undefined
    readonly serviceVersion?: string | undefined
    readonly attributes?: Record<string, unknown> | undefined
  } | undefined
) => Effect.Effect<Resource> = Effect.fnUntraced(function*(options?: {
  readonly serviceName?: string | undefined
  readonly serviceVersion?: string | undefined
  readonly attributes?: Record<string, unknown> | undefined
}) {
  const env = yield* Config.Record(
    Schema.StringFromUriComponent,
    Schema.StringFromUriComponent,
    "OTEL_RESOURCE_ATTRIBUTES"
  ).pipe(Config.withDefault(undefined))

  const serviceName = options?.serviceName
    ?? options?.attributes?.["service.name"] as string | undefined
    ?? (yield* Config.schema(Schema.UndefinedOr(Schema.String), "OTEL_SERVICE_NAME"))
    ?? env?.["service.name"] as string | undefined
    ?? (yield* Config.String("OTEL_SERVICE_NAME"))

  const serviceVersion = options?.serviceVersion
    ?? options?.attributes?.["service.version"] as string | undefined
    ?? (yield* Config.schema(Schema.UndefinedOr(Schema.String), "OTEL_SERVICE_VERSION"))
    ?? env?.["service.version"] as string | undefined

  const attributes = {
    ...env,
    ...options?.attributes
  }

  delete attributes["service.name"]
  delete attributes["service.version"]

  return make({
    serviceName,
    serviceVersion,
    attributes
  })
}, Effect.orDie)

/**
 * Returns the `service.name` attribute from an OTLP resource.
 *
 * **When to use**
 *
 * Use when an OTLP resource is known to contain a string `service.name` and
 * throwing is acceptable if that invariant is broken.
 *
 * **Gotchas**
 *
 * Throws if the resource does not contain a string `service.name` attribute.
 *
 * @stability unstable
 * @category attributes
 * @since 4.0.0
 */
export const serviceNameUnsafe = (resource: Resource): string => {
  const serviceNameAttribute = resource.attributes.find(
    (attr) => attr.key === "service.name"
  )
  if (!serviceNameAttribute || !serviceNameAttribute.value.stringValue) {
    throw new Error("Resource does not contain a service name")
  }
  return serviceNameAttribute.value.stringValue
}

/**
 * Converts key/value entries into OTLP `KeyValue` attributes.
 *
 * @stability unstable
 * @category attributes
 * @since 4.0.0
 */
export const entriesToAttributes = (entries: Iterable<[string, unknown]>): Array<KeyValue> => {
  const attributes: Array<KeyValue> = []
  for (const [key, value] of entries) {
    attributes.push({
      key,
      value: unknownToAttributeValue(value)
    })
  }
  return attributes
}

/**
 * Converts an arbitrary JavaScript value into an OTLP `AnyValue`.
 *
 * **Details**
 *
 * Arrays are converted recursively, primitive values use their matching OTLP
 * fields, and unsupported values are formatted as strings.
 *
 * @stability unstable
 * @category attributes
 * @since 4.0.0
 */
export const unknownToAttributeValue = (value: unknown): AnyValue => {
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map(unknownToAttributeValue)
      }
    }
  }
  switch (typeof value) {
    case "string":
      return {
        stringValue: value
      }
    case "bigint":
      return {
        intValue: String(value)
      }
    case "number":
      return Number.isInteger(value)
        ? {
          intValue: value
        }
        : {
          doubleValue: value
        }
    case "boolean":
      return {
        boolValue: value
      }
    default:
      return {
        stringValue: format(value)
      }
  }
}

/**
 * An OTLP attribute represented as a string key and typed value.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface KeyValue {
  /** KeyValue key */
  key: string
  /** KeyValue value */
  value: AnyValue
}

/**
 * OTLP `AnyValue` payload for scalar, array, key/value-list, or byte values.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface AnyValue {
  /** AnyValue stringValue */
  stringValue?: string | null
  /** AnyValue boolValue */
  boolValue?: boolean | null
  /** AnyValue intValue */
  intValue?: string | number | null
  /** AnyValue doubleValue */
  doubleValue?: number | null
  /** AnyValue arrayValue */
  arrayValue?: ArrayValue
  /** AnyValue kvlistValue */
  kvlistValue?: KeyValueList
  /** AnyValue bytesValue */
  bytesValue?: Uint8Array
}

/**
 * OTLP array value containing nested `AnyValue` entries.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ArrayValue {
  /** ArrayValue values */
  values: Array<AnyValue>
}

/**
 * OTLP key/value-list value containing nested attributes.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface KeyValueList {
  /** KeyValueList values */
  values: Array<KeyValue>
}

/**
 * Low and high 32-bit parts of a 64-bit integer value.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface LongBits {
  low: number
  high: number
}

/**
 * Accepted runtime representations for an OTLP/protobuf fixed 64-bit value.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Fixed64 = LongBits | string | number
