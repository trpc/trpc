---
id: wsLink
title: WebSocket Link
sidebar_label: WebSocket Link
slug: /client/links/wsLink
section: "Client Usage"
parent: "client/links"
order: 54
---

`wsLink` is a [**terminating link**](../links.md#the-terminating-link) that's used when using tRPC's WebSockets Client and Subscriptions, which you can learn more about [here](../../subscriptions.md).

## Usage

To use `wsLink`, you need to pass it a `TRPCWebSocketClient`, which you can create with `createWSClient`:

```ts title="client/index.ts"
import { createTRPCProxyClient, createWSClient, wsLink } from '@trpc/client';
import type { AppRouter } from '../server';

const wsClient = createWSClient({
  url: 'ws://localhost:3000',
});

const trpcClient = createTRPCProxyClient<AppRouter>({
  links: [wsLink<AppRouter>({ client: wsClient })],
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

## Reference

You can check out the source code for this link on [GitHub.](https://github.com/trpc/trpc/blob/v10.45.4/packages/client/src/links/wsLink.ts)
