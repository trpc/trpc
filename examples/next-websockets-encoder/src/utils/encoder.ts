import { decode, encode } from '@msgpack/msgpack';
import type { Encoder } from '@trpc/client';

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
 * MessagePack encoder for tRPC WebSocket connections.
 * Provides binary encoding for improved performance and smaller payloads.
 */
export const msgpackEncoder: Encoder = {
  encode: (data) => encode(stripUndefined(data)),
  decode: (data) => {
    if (typeof data === 'string') {
      throw new Error(
        'msgpackEncoder received string data but expected binary. ' +
          'Ensure both client and server are configured with experimental_encoder.',
      );
    }
    const uint8 = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    return decode(uint8);
  },
};
