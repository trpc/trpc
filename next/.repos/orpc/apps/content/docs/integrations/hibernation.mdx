---
title: "Hibernation Integration"
description: "Learn how oRPC integrates with Hibernation APIs like Cloudflare's WebSocket Hibernation so servers can sleep without dropping connections."
sidebar:
  label: "Hibernation"
---

## Installation

```package-install
npm install @orpc/hibernation@beta
```

## Setup

```ts
import { HibernationHandlerPlugin } from '@orpc/hibernation'

const handler = new RPCHandler(router, {
  plugins: [
    new HibernationHandlerPlugin(),
  ],
})
```

:::warning
When combined with the [Batch Plugin](/docs/plugins/batch), make sure procedures that return a `HibernationAsyncIteratorClass` are excluded from batching (e.g. via the batch link plugin's `filter` option), because hibernation cannot work through batched responses.
:::

## Usage

The plugin provides `HibernationAsyncIteratorClass` and `encodeHibernationRPCEvent` to help you return an [Async Iterator Object](/docs/async-iterator-object) that utilizes the Hibernation APIs.

1. Return a `HibernationAsyncIteratorClass` from your handler

   ```ts
   import { HibernationAsyncIteratorClass } from '@orpc/hibernation'

   const base = os.$context<{ ws: WebSocket }>()

   export const onMessage = base.handler(async ({ context }) => {
     return new HibernationAsyncIteratorClass<{ message: string }>((id) => {
       // Save the ID. You'll need it to send events later.
       context.ws.serializeAttachment({ id })
     })
   })
   ```

2. Send events to clients with `encodeHibernationRPCEvent`

   ```ts
   import { encodeHibernationRPCEvent } from '@orpc/hibernation'
   import * as z from 'zod'

   const base = os.$context<{ getWebSockets: () => WebSocket[] }>()

   export const sendMessage = base
     .input(z.object({ message: z.string() }))
     .handler(async ({ input, context }) => {
       const websockets = context.getWebSockets()

       for (const ws of websockets) {
         const { id } = ws.deserializeAttachment()

         // yield an event to all clients
         ws.send(await encodeHibernationRPCEvent(id, { message: input.message }, {
           // override the default RPC serializer if needed
           serializer: new RPCSerializer(),
         }))
         // return an event and stop the iterator
         ws.send(await encodeHibernationRPCEvent(id, { message: input.message }, { event: 'close' }))
         // throw an error and stop the iterator
         ws.send(await encodeHibernationRPCEvent(id, new ORPCError('INTERNAL_SERVER_ERROR'), { event: 'error' }))
       }
     })
   ```

<Expandable title="Cloudflare Durable Object Chat Room Example?">

This example shows how to build a chat room with [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/) and [WebSocket Hibernation](https://developers.cloudflare.com/durable-objects/examples/websocket-hibernation-server/). Everyone connected to the same Durable Object can exchange messages. You can try a working version in the Cloudflare Playground, see [Playgrounds](/docs/playgrounds).

<CodeGroup>

```ts title="Durable Object"
import { RPCHandler } from '@orpc/server/websocket'
import {
  encodeHibernationRPCEvent,
  HibernationAsyncIteratorClass,
  HibernationHandlerPlugin,
} from '@orpc/hibernation'
import { onError, os } from '@orpc/server'
import { DurableObject } from 'cloudflare:workers'
import * as z from 'zod'

const base = os.$context<{
  handler: RPCHandler<any>
  ws: WebSocket
  getWebsockets: () => WebSocket[]
}>()

export const router = {
  send: base.input(z.object({ message: z.string() })).handler(async ({ input, context }) => {
    const websockets = context.getWebsockets()

    for (const ws of websockets) {
      const data = ws.deserializeAttachment()
      if (typeof data !== 'object' || data === null) {
        continue
      }

      const { id } = data

      ws.send(await encodeHibernationRPCEvent(id, input.message))
    }
  }),
  onMessage: base.handler(async ({ context }) => {
    return new HibernationAsyncIteratorClass<string>((id) => {
      context.ws.serializeAttachment({ id })
    })
  }),
}

const handler = new RPCHandler(router, {
  interceptors: [
    onError((error) => {
      console.error(error)
    }),
  ],
  plugins: [
    new HibernationHandlerPlugin(),
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
      context: {
        handler,
        ws,
        getWebsockets: () => this.ctx.getWebSockets(),
      },
    })
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await handler.close(ws)
  }
}
```

```ts Client
import { RPCLink } from '@orpc/client/websocket'
import { createORPCClient } from '@orpc/client'
import type { router } from '../../worker/dos/chat-room'
import type { RouterClient } from '@orpc/server'

const websocket = new WebSocket(`${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/chat-room`)

websocket.addEventListener('error', (event) => {
  console.error(event)
})

const link = new RPCLink({
  connect: () => websocket,
})

export const chatRoomClient: RouterClient<typeof router> = createORPCClient(link)
```

```tsx Component
import { useEffect, useState } from 'react'
import { chatRoomClient } from '../lib/chat-room'

export function ChatRoom() {
  const [messages, setMessages] = useState<string[]>([])

  useEffect(() => {
    const controller = new AbortController()

    void (async () => {
      for await (const message of await chatRoomClient.onMessage(undefined, { signal: controller.signal })) {
        setMessages(messages => [...messages, message])
      }
    })()

    return () => {
      controller.abort()
    }
  }, [])

  const sendMessage = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    const form = new FormData(e.target as HTMLFormElement)
    const message = form.get('message') as string

    await chatRoomClient.send({ message })
  }

  return (
    <div>
      <h1>Chat Room</h1>
      <p>Open multiple tabs to chat together</p>
      <ul>
        {messages.map((message, index) => (
          <li key={index}>{message}</li>
        ))}
      </ul>
      <form onSubmit={sendMessage}>
        <input name="message" type="text" required defaultValue="hello" />
        <button type="submit">Send</button>
      </form>
    </div>
  )
}
```

</CodeGroup>

</Expandable>
