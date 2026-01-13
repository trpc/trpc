# Next.js + tRPC WebSocket + MessagePack Serializer

This example demonstrates using **MessagePack binary serialization** with tRPC WebSocket connections for improved performance and smaller payloads.

## Features

- Next.js 15 with App Router
- tRPC WebSocket subscriptions
- MessagePack binary serialization via `experimental_serializer`
- Tailwind CSS

## How it works

The `experimental_serializer` option allows you to plug in custom serialization for WebSocket messages:

```typescript
// Server (wssDevServer.ts)
applyWSSHandler({
  wss,
  router: appRouter,
  experimental_serializer: msgpackSerializer,
});

// Client (trpc.ts)
createWSClient({
  url: WS_URL,
  experimental_serializer: msgpackSerializer,
});
```

The serializer is defined in `src/utils/serializer.ts`:

```typescript
import { decode, encode } from '@msgpack/msgpack';
import type { Serializer } from '@trpc/client';

export const msgpackSerializer: Serializer = {
  serialize: (data) => encode(data),
  deserialize: (data) => {
    if (typeof data === 'string') {
      return JSON.parse(data);
    }
    return decode(data instanceof ArrayBuffer ? new Uint8Array(data) : data);
  },
};
```

## Running the example

```bash
pnpm install
pnpm dev
```

Then open [http://localhost:3000](http://localhost:3000).

Open DevTools → Network → WS to see the binary MessagePack frames being sent over WebSocket.
