# Next.js + tRPC WebSocket + MessagePack Encoder

This example demonstrates using **MessagePack binary encoding** with tRPC WebSocket connections for improved performance and smaller payloads.

## Features

- Next.js 15 with Pages Router
- tRPC WebSocket subscriptions
- MessagePack binary encoding via `experimental_encoder`
- Tailwind CSS

## How it works

The `experimental_encoder` option allows you to plug in custom encoding for WebSocket messages:

```typescript
// Server (wssDevServer.ts)
applyWSSHandler({
  wss,
  router: appRouter,
  experimental_encoder: msgpackEncoder,
});

// Client (trpc.ts)
createWSClient({
  url: WS_URL,
  experimental_encoder: msgpackEncoder,
});
```

The encoder is defined in `src/utils/encoder.ts`:

```typescript
import { decode, encode } from '@msgpack/msgpack';
import type { Encoder } from '@trpc/client';

// MessagePack converts undefined to null, but tRPC expects undefined for optional fields.
// Strip undefined values before encoding to match JSON's behavior.
function stripUndefined<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(stripUndefined) as T;
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v !== undefined) result[k] = stripUndefined(v);
  }
  return result as T;
}

export const msgpackEncoder: Encoder = {
  encode: (data) => encode(stripUndefined(data)),
  decode: (data) => {
    if (typeof data === 'string') {
      throw new Error(
        'msgpackEncoder expected binary data but received a string.',
      );
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
