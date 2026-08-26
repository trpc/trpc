/**
 * Encoder for WebSocket wire format.
 * Encodes outgoing messages and decodes incoming messages.
 *
 * @example
 * ```ts
 * const customEncoder: Encoder = {
 *   encode: (data) => myFormat.stringify(data),
 *   decode: (data) => myFormat.parse(data),
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
    if (typeof data !== 'string') {
      throw new Error(
        'jsonEncoder received binary data. JSON uses text frames. ' +
          'Use a binary encoder for binary data.',
      );
    }
    return JSON.parse(data);
  },
};
