/**
 * Encoder for encoding/decoding tRPC messages on the wire.
 * Operates after transformer.serialize() and before network transmission.
 *
 * @remarks
 * Binary encoders like MessagePack may convert `undefined` to `null`.
 * To match JSON behavior, strip undefined values before encoding:
 *
 * @example
 * ```ts
 * import { encode, decode } from '@msgpack/msgpack';
 * import type { Encoder } from '@trpc/server/adapters/ws';
 *
 * // Strip undefined to match JSON.stringify behavior
 * function stripUndefined<T>(value: T): T {
 *   if (value === null || typeof value !== 'object') return value;
 *   if (Array.isArray(value)) return value.map(stripUndefined) as T;
 *   const result: Record<string, unknown> = {};
 *   for (const [k, v] of Object.entries(value)) {
 *     if (v !== undefined) result[k] = stripUndefined(v);
 *   }
 *   return result as T;
 * }
 *
 * export const msgpackEncoder: Encoder = {
 *   encode: (data) => encode(stripUndefined(data)),
 *   decode: (data) => {
 *     const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
 *     return decode(bytes as Uint8Array);
 *   },
 * };
 * ```
 */
export interface Encoder {
  /** Encode data for transmission over the wire */
  encode(data: unknown): string | Uint8Array;
  /** Decode data received from the wire */
  decode(data: string | ArrayBuffer | Uint8Array): unknown;
}

/**
 * Default JSON encoder - used when no encoder is specified.
 * This maintains backwards compatibility with existing behavior.
 */
export const jsonEncoder: Encoder = {
  encode: (data) => JSON.stringify(data),
  decode: (data) => {
    if (typeof data === 'string') {
      return JSON.parse(data);
    }
    return JSON.parse(
      new TextDecoder().decode(
        data instanceof ArrayBuffer ? new Uint8Array(data) : data,
      ),
    );
  },
};
