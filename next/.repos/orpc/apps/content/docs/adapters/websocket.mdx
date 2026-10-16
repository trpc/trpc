---
title: "WebSocket Adapters"
description: "Use oRPC over WebSocket for low-latency, full-duplex communication, with adapters for ws, crossws, Bun, Deno, Cloudflare, and uWebSockets."
sidebar:
  label: "WebSocket"
---

## Server Adapters

| Adapter     | Target                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `websocket` | [MDN WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket), [ws](https://github.com/websockets/ws), [Bun's WebSocket](https://bun.com/docs/runtime/http/websockets), [Deno's WebSocket](https://docs.deno.com/examples/http_server_websocket/), [Cloudflare Hibernation WebSocket](https://developers.cloudflare.com/durable-objects/best-practices/websockets/), [uWebSockets](https://github.com/uNetworking/uWebSockets.js/) |
| `crossws`   | [crossws](https://github.com/h3js/crossws)                                                                                                                                                                                                                                                                                                                                                                                                           |

<CodeGroup>

```ts ws
import { WebSocketServer } from 'ws'
import { RPCHandler } from '@orpc/server/websocket'
import { onError } from '@orpc/server'

const handler = new RPCHandler(router, {
  interceptors: [
    onError((error) => {
      console.error(error)
    }),
  ],
})

const wss = new WebSocketServer({ port: 8080 })

wss.on('connection', (ws) => {
  handler.upgrade(ws, {
    /**
     * Provide initial context if needed. The context can be an async function
     * that receives the per-call request as its first argument, and is **not**
     * related to the initial WebSocket upgrade request.
     */
    context: request => ({}),
  })
})
```

```ts crossws
import { createServer } from 'node:http'
import { experimental_RPCHandler as RPCHandler } from '@orpc/server/crossws'
import { onError } from '@orpc/server'

// any crossws adapter is supported
import crossws from 'crossws/adapters/node'

const handler = new RPCHandler(router, {
  interceptors: [
    onError((error) => {
      console.error(error)
    }),
  ],
})

const ws = crossws({
  hooks: {
    message: async (peer, message) => {
      await handler.message(peer, message, {
        /**
         * Provide initial context if needed. The context can be an async function
         * that receives the per-call request as its first argument, and is **not**
         * related to the initial WebSocket upgrade request.
         */
        context: request => ({}),
      })
    },
    close: async (peer) => {
      await handler.close(peer)
    },
  },
})

const server = createServer((req, res) => {
  res.end(`Hello World`)
}).listen(3000)

server.on('upgrade', (req, socket, head) => {
  if (req.headers.upgrade === 'websocket') {
    ws.handleUpgrade(req, socket, head)
  }
})
```

```ts Bun
import { RPCHandler } from '@orpc/server/websocket'
import { onError } from '@orpc/server'

const handler = new RPCHandler(router, {
  interceptors: [
    onError((error) => {
      console.error(error)
    }),
  ],
})

Bun.serve({
  fetch(req, server) {
    if (server.upgrade(req)) {
      return
    }
    return new Response('Upgrade failed', { status: 500 })
  },
  websocket: {
    async message(ws, message) {
      await handler.message(ws, message, {
        /**
         * Provide initial context if needed. The context can be an async function
         * that receives the per-call request as its first argument, and is **not**
         * related to the initial WebSocket upgrade request.
         */
        context: request => ({}),
      })
    },
    async close(ws) {
      await handler.close(ws)
    },
  }
})
```

```ts Deno
import { RPCHandler } from '@orpc/server/websocket'
import { onError } from '@orpc/server'

const handler = new RPCHandler(router, {
  interceptors: [
    onError((error) => {
      console.error(error)
    }),
  ],
})

Deno.serve((req) => {
  if (req.headers.get('upgrade') !== 'websocket') {
    return new Response(null, { status: 501 })
  }

  const { socket, response } = Deno.upgradeWebSocket(req)

  handler.upgrade(socket, {
    /**
     * Provide initial context if needed. The context can be an async function
     * that receives the per-call request as its first argument, and is **not**
     * related to the initial WebSocket upgrade request.
     */
    context: request => ({}),
  })

  return response
})
```

```ts Cloudflare
import { RPCHandler } from '@orpc/server/websocket'
import { onError } from '@orpc/server'

const handler = new RPCHandler(router, {
  interceptors: [
    onError((error) => {
      console.error(error)
    }),
  ],
})

export class ChatRoom extends DurableObject {
  async fetch(): Promise<Response> {
    const { '0': client, '1': server } = new WebSocketPair()

    this.ctx.acceptWebSocket(server)

    return new Response(null, {
      status: 101,
      webSocket: client,
    })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await handler.message(ws, message, {
      /**
       * Provide initial context if needed. The context can be an async function
       * that receives the per-call request as its first argument, and is **not**
       * related to the initial WebSocket upgrade request.
       */
      context: request => ({}),
    })
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await handler.close(ws)
  }
}
```

```ts uWebSockets
import { App } from 'uWebSockets.js'
import { RPCHandler } from '@orpc/server/websocket'
import { onError } from '@orpc/server'

const handler = new RPCHandler(router, {
  interceptors: [
    onError((error) => {
      console.error(error)
    }),
  ],
})

const app = App()
  .ws('/*', {
    async message(ws, message, isBinary) {
      await handler.message(ws, message, {
        /**
         * Provide initial context if needed. The context can be an async function
         * that receives the per-call request as its first argument, and is **not**
         * related to the initial WebSocket upgrade request.
         */
        context: request => ({}),
      })
    },
    async close(ws, code, message) {
      await handler.close(ws)
    },
  })
  .listen(3000, (token) => {
    if (token) {
      console.log('Listening to port 3000')
    }
  })
```

</CodeGroup>

## Client Adapters

| Adapter     | Target                                                                          |
| ----------- | ------------------------------------------------------------------------------- |
| `websocket` | [MDN WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket) |

```ts
import { RPCLink } from '@orpc/client/websocket'

const link = new RPCLink({
  connect: info => new WebSocket('ws://localhost:3000'),
  /**
   * Whether to connect immediately on initialization, instead of waiting
   * for the first call. Reduces latency for the first request.
   *
   * @default false
   */
  connectOnInit: true,

  /**
   * Optional headers to attach to each per-call request.
   * These can be accessed in the server context or via the Request Headers Plugin.
   */
  headers: () => ({})
})
```

:::info
The examples above only show how to configure the link. For examples of creating a typesafe client, see [RPC Link](/docs/rpc/link#typesafe-clients).
:::

### Auto Reconnect

The client adapter has built-in support for reconnecting when the connection is lost. You can configure reconnect behavior with the `reconnect` option when creating the link.

```ts
const link = new RPCLink({
  reconnect: {
    /**
     * Whether to automatically reconnect when the connection is lost.
     *
     * @default false
     */
    enabled: true,

    /**
     * Delay before a (re)connect attempt, in milliseconds.
     *
     * @default info => info.attempt === 1 ? 0 : 2_000
     */
    delay: info => info.attempt === 1 ? 0 : 2_000,

    /**
     * Maximum number of consecutive failed attempts before giving up.
     * When reached, calls waiting for the connection fail, and the next
     * call starts a new reconnect cycle.
     * Should greater than 1
     *
     * @default Infinity
     */
    maxAttempt: Infinity,

    /**
     * Maximum number of connection attempts over the transport's lifetime,
     * successful ones included (see `totalAttempt`).
     * When reached, calls that need a new connection fail instead of connecting.
     *
     * @default Infinity
     */
    maxTotalAttempt: Infinity,

    onClose: {
      /**
       * Whether to proactively reconnect right after the socket closes,
       * rather than waiting for the next call to trigger reconnection.
       * Reduces latency for the next request.
       *
       * @default false
       */
      enabled: false,

      /**
       * Delay before reconnecting after the socket closes, in milliseconds.
       *
       * @default 0
       */
      delay: 0
    }
  }
})
```
