---
title: "Request Limit Plugin"
description: "Restrict the size of incoming request bodies with RequestLimitHandlerPlugin to protect your server from oversized payloads."
sidebar:
  label: "Request Limit"
---

## Setup

Use `RequestLimitHandlerPlugin` to limit the size of incoming request bodies.

```ts
import { RequestLimitHandlerPlugin } from '@orpc/server/plugins'

const handler = new RPCHandler(router, {
  plugins: [
    new RequestLimitHandlerPlugin({
      /**
       * The maximum allowed request body size in bytes.
       */
      maxBodySize: 1024 * 1024, // 1MB
    }),
  ],
})
```

:::info
The `handler` can be any supported oRPC handler, such as [RPCHandler](/docs/rpc/handler), [OpenAPIHandler](/docs/openapi/handler), or a custom one.
:::

:::info
When used with [Request Compression](/docs/plugins/request-compression), `maxBodySize` applies to the **decompressed** payload size, not the compressed wire size.
:::

## Peer Adapters

This plugin does not apply to peer-based adapters such as [WebSocket](/docs/adapters/websocket) and [Message Port](/docs/adapters/message-port). Each message reaches the handler fully loaded in memory, so there is no body left to limit. Instead, limit each message at the transport, and the total bytes per connection per minute, since a single call can span many messages (for example, an [AsyncIteratorObject](/docs/async-iterator-object) input). With Bun:

```ts
const MAX_BYTES_PER_MINUTE = 10 * 1024 * 1024 // 10MB
const usage = new WeakMap<object, { bytes: number, resetAt: number }>()

Bun.serve({
  websocket: {
    maxPayloadLength: 1024 * 1024, // 1MB per message, larger messages close the connection
    async message(ws, message) {
      let entry = usage.get(ws)
      if (!entry || Date.now() >= entry.resetAt) {
        usage.set(ws, entry = { bytes: 0, resetAt: Date.now() + 60_000 })
      }

      entry.bytes += Buffer.byteLength(message)

      if (entry.bytes > MAX_BYTES_PER_MINUTE) {
        ws.close(1008, 'Too much data per minute')
        return
      }

      await handler.message(ws, message)
    },
    async close(ws) {
      await handler.close(ws)
    },
  },
})
```

Other WebSocket servers have an equivalent per-message option, such as `maxPayload` in [ws](https://github.com/websockets/ws/blob/master/doc/ws.md#new-websocketserveroptions-callback).

## Learn More

For implementation details, see the [source code](https://github.com/middleapi/orpc/blob/main/packages/server/src/plugins/request-limit.ts).
