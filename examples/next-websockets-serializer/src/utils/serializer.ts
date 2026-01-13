import { decode, encode } from '@msgpack/msgpack';
import type { Serializer } from '@trpc/client';

/**
 * Recursively strips undefined values from objects to match JSON.stringify behavior.
 * This ensures msgpack encoding is compatible with tRPC's optional field handling,
 * since msgpack converts undefined → null, but tRPC expects undefined for missing fields.
 */
function stripUndefined<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(stripUndefined) as T;
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v !== undefined) result[k] = stripUndefined(v);
  }
  return result as T;
}

/**
 * MessagePack serializer for tRPC WebSocket connections.
 * Provides binary serialization for improved performance and smaller payloads.
 */
export const msgpackSerializer: Serializer = {
  serialize: (data) => encode(stripUndefined(data)),
  deserialize: (data) => {
    if (typeof data === 'string') {
      return JSON.parse(data);
    }
    const uint8 = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    return decode(uint8);
  },
};
