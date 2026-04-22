import type { Encoder } from '@trpc/server/adapters/ws';

export type { Encoder };

/**
 * TS 6's DOM typings require `WebSocket.send()` binary payloads to be backed by
 * a plain `ArrayBuffer`. Custom encoders are still allowed to return any
 * `Uint8Array`, so normalize shared-buffer views before sending.
 */
export function toWebSocketSendPayload(
  data: ReturnType<Encoder['encode']>,
): string | BufferSource {
  if (typeof data === 'string') {
    return data;
  }

  return data.buffer instanceof ArrayBuffer
    ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    : Uint8Array.from(data);
}

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
