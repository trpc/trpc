---
id: ws
title: WebSocket Link
sidebar_label: WebSocket Link
slug: /links/ws
---

`wsLink` is a [**terminating link**](./overview#the-terminating-link) that's used when using tRPC's WebSockets Client and Subscriptions, which you can learn more [here.](/docs/v10/subscriptions)

## Usage

To use `wsLink`, you need to pass it a `TRPCWebSocketClient`, which you can create with `createWSClient`:

```ts title="client/index.ts"
import { createTRPCProxyClient, createWSClient, wsLink } from '@trpc/client';
import type { AppRouter } from '../server';

const wsClient = createWSClient({
  url: 'ws://localhost:3000',
});

const trpcClient = createTRPCProxyClient<AppRouter>({
  links: [wsLink<AppRouter>(wsClient)],
});
```

## `wsLink` Options

The `wsLink` function requires a `TRPCWebSocketClient` to be passed, which can be configured with the fields defined in `WebSocketClientOptions`:

```ts
export interface WebSocketLinkOptions {
  client: TRPCWebSocketClient;
}

function createWSClient(opts: WebSocketClientOptions) => TRPCWebSocketClient

export interface WebSocketClientOptions {
  url: string;
  WebSocket?: typeof WebSocket;
  retryDelayMs?: typeof retryDelay;
  onOpen?: () => void;
  onClose?: (cause?: { code?: number }) => void;
}
```
