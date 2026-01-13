import type { Encoder } from '@trpc/server/adapters/ws';
export type { Encoder };

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
