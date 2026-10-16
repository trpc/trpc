import type { StandardHeaders } from '@standard-server/core'
import type { OpenAPISerializer } from '../../openapi-serializer'
import { isTypescriptObject, NullProtoObj } from '@orpc/shared'

export function serializeHeaders(
  headers: object,
  serializer: Pick<OpenAPISerializer, 'serialize'>,
): StandardHeaders {
  const result = new NullProtoObj<Record<string, string | string[]>>()

  for (const [key, value] of Object.entries(headers)) {
    /**
     * Only an actual array value represents a multi-value header (sent as multiple lines).
     * Serialization can turn non-array values into arrays (e.g. Set, Map, custom handlers),
     * and those must stay a single line, so the structure is checked before serializing.
     */
    if (Array.isArray(value)) {
      const lines: string[] = []

      for (const item of value) {
        const line = serializeHeaderValue(item, serializer)

        if (line !== undefined) {
          lines.push(line)
        }
      }

      result[key] = lines
      continue
    }

    const line = serializeHeaderValue(value, serializer)

    if (line !== undefined) {
      result[key] = line
    }
  }

  return result
}

function serializeHeaderValue(
  value: unknown,
  serializer: Pick<OpenAPISerializer, 'serialize'>,
): string | undefined {
  const serialized = serializer.serialize(value)

  if (Array.isArray(serialized)) {
    return serialized
      .filter(item => item !== undefined && item !== null)
      .map(String)
      .join(',')
  }

  if (isTypescriptObject(serialized)) {
    return Object.entries(serialized)
      .filter(([, val]) => val !== undefined && val !== null)
      .map(([key, val]) => `${String(key)},${String(val)}`)
      .join(',')
  }

  if (serialized !== undefined && serialized !== null) {
    return String(serialized)
  }

  return undefined
}
