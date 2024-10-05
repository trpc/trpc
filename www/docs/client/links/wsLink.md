---
id: wsLink
title: WebSocket Link
sidebar_label: WebSocket Link
slug: /client/links/wsLink
---

`wsLink` is a [**terminating link**](./overview.md#the-terminating-link) that's used when using tRPC's WebSockets Client and Subscriptions, which you can learn more about [here](../../server/subscriptions.md)).

## Usage

To use `wsLink`, you need to pass it a `TRPCWebSocketClient`, which you can create with `createWSClient`:

```ts title="client/index.ts"
import { createTRPCClient, createWSClient, wsLink } from '@trpc/client';
import type { AppRouter } from '../server';

const wsClient = createWSClient({
  url: 'ws://localhost:3000',
});

const trpcClient = createTRPCClient<AppRouter>({
  links: [wsLink<AppRouter>({ client: wsClient })],
});
```

## Authentication / Connection params

[See more here](../../server/websockets.md#connection-params)

## `wsLink` / `createWSClient` Options

The `wsLink` function requires a `TRPCWebSocketClient` to be passed, which can be configured with the fields defined in `WebSocketClientOptions`:

```ts
export interface WebSocketLinkOptions {
  client: TRPCWebSocketClient;
  /**
   * Data transformer
   * @see https://trpc.io/docs/v11/data-transformers
   **/
  transformer?: DataTransformerOptions;
}

function createWSClient(opts: WebSocketClientOptions) => TRPCWebSocketClient


export interface WebSocketClientOptions {
  /**
   * The URL to connect to (can be a function that returns a URL)
   */
  url: string | (() => MaybePromise<string>);
  /**
   * Connection params that are available in `createContext()`
   * These are sent as the first message
   */
  connectionParams: string | (() => MaybePromise<string>);
  /**
   * Ponyfill which WebSocket implementation to use
   */
  WebSocket?: typeof WebSocket;
  /**
   * The number of milliseconds before a reconnect is attempted.
   * @default {@link exponentialBackoff}
   */
  retryDelayMs?: typeof exponentialBackoff;
  /**
   * Triggered when a WebSocket connection is established
   */
  onOpen?: () => void;
  /**
   * Triggered when a WebSocket connection encounters an error
   */
  onError?: (evt?: Event) => void;
  /**
   * Triggered when a WebSocket connection is closed
   */
  onClose?: (cause?: { code?: number }) => void;
  /**
   * Lazy mode will close the WebSocket automatically after a period of inactivity (no messages sent or received and no pending requests)
   */
  lazy?: {
    /**
     * Enable lazy mode
     * @default false
     */
    enabled: boolean;
    /**
     * Close the WebSocket after this many milliseconds
     * @default 0
     */
    closeMs: number;
  };
  /**
   * Send ping messages to the server and kill the connection if no pong message is returned
   */
  keepAlive?: {
    /**
     * @default false
     */
    enabled: boolean;
    /**
     * Send a ping message every this many milliseconds
     * @default 5_000
     */
    intervalMs?: number;
    /**
     * Close the WebSocket after this many milliseconds if the server does not respond
     * @default 1_000
     */
    pongTimeoutMs?: number;
  };
}
```

## Reference

You can check out the source code for this link on [GitHub.](https://github.com/trpc/trpc/blob/main/packages/client/src/links/wsLink.ts)
