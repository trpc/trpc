import type * as Otel from "@opentelemetry/api"
import * as Inspectable from "effect/Inspectable"
import * as Rec from "effect/Record"

const bigint1e9 = BigInt(1_000_000_000)

/** @internal */
export const nanosToHrTime = (timestamp: bigint): Otel.HrTime => {
  return [Number(timestamp / bigint1e9), Number(timestamp % bigint1e9)]
}

/** @internal */
export const recordToAttributes = (record: Record<string, unknown>): Otel.Attributes => {
  const attributes: Otel.Attributes = {}
  for (const [key, value] of Object.entries(record)) {
    Rec.assignProperty(attributes, key, unknownToAttributeValue(value))
  }
  return attributes
}

/** @internal */
export const unknownToAttributeValue = (value: unknown): Otel.AttributeValue => {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value
  } else if (typeof value === "bigint") {
    return value.toString()
  }
  return Inspectable.toStringUnknown(value)
}
