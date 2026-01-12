/**
 * Serializer for encoding/decoding tRPC messages on the wire.
 * Operates after transformer.serialize() and before network transmission.
 *
 * @example
 * ```ts
 * import { encode, decode } from '@msgpack/msgpack';
 * import type { Serializer } from '@trpc/client';
 *
 * export const msgpackSerializer: Serializer = {
 *   serialize: (data) => encode(data),
 *   deserialize: (data) => decode(new Uint8Array(data as ArrayBuffer)),
 * };
 * ```
 */
export interface Serializer {
  /** Encode data for transmission over the wire */
  serialize(data: unknown): string | Uint8Array;
  /** Decode data received from the wire */
  deserialize(data: string | ArrayBuffer | Uint8Array): unknown;
}

/**
 * Default JSON serializer - used when no serializer is specified.
 * This maintains backwards compatibility with existing behavior.
 */
export const jsonSerializer: Serializer = {
  serialize: (data) => JSON.stringify(data),
  deserialize: (data) => {
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
