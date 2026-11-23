/**
 * Encodes the messages a WebSocket server sends and decodes the ones it
 * gets. The client's `experimental_encoder` must match.
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
  /** Encodes a message to send. */
  encode(data: unknown): string | Uint8Array<ArrayBuffer>;
  /** Decodes a received message. */
  decode(data: string | ArrayBuffer | Uint8Array): unknown;
}

/**
 * The default encoder: JSON in text frames.
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
