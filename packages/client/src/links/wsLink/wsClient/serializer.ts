import type { Serializer } from '@trpc/server/adapters/ws';
export type { Serializer }

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
