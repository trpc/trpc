import * as Schema from "effect/Schema"
import { createHash } from "node:crypto"

export const decodeJson = Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown))

export const stableJson = (value: unknown): string => {
  const visit = (input: unknown): unknown => {
    if (Array.isArray(input)) {
      return input.map(visit)
    }
    if (input !== null && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input)
          .filter(([, entry]) => entry !== undefined)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, entry]) => [key, visit(entry)])
      )
    }
    return input
  }
  return JSON.stringify(visit(value))
}

export const fingerprint = (value: unknown): string => createHash("sha256").update(stableJson(value)).digest("hex")

export const prettyJson = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`
