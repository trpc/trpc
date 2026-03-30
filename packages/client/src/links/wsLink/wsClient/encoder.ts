import type { Encoder } from '@trpc/server/adapters/ws';

export type { Encoder };

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
