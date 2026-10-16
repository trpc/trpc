---
title: "Message Port Adapter"
description: "Use oRPC over the Message Port API to communicate between contexts such as iframes, web workers, and service workers."
sidebar:
  label: "Message Port"
---

## Basic Usage

Message Ports work by establishing two endpoints that can communicate with each other:

```ts Bridge
const channel = new MessageChannel()
const serverPort = channel.port1
const clientPort = channel.port2
```

```ts Server
import { RPCHandler } from '@orpc/server/message-port'
import { onError } from '@orpc/server'

const handler = new RPCHandler(router, {
  interceptors: [
    onError((error) => {
      console.error(error)
    }),
  ],
})

handler.upgrade(serverPort, {
  /**
   * Provide initial context if needed. The context can be an async function
   * that receives the per-call request as its first argument, and is **not**
   * related to the initial upgrade request.
   */
  context: request => ({}),
})

serverPort.start()
```

```ts Client
import { RPCLink } from '@orpc/client/message-port'
import { onError } from '@orpc/client'

const link = new RPCLink({
  port: clientPort,
  interceptors: [
    onError((error) => {
      console.error(error)
    }),
  ],
  /**
   * Optional headers to attach to each per-call request.
   * These can be accessed in the server context or via the Request Headers Plugin.
   */
  headers: () => ({})
})

clientPort.start()
```

:::info
The examples above only show how to configure the link. For examples of creating a typesafe client, see [RPC Link](/docs/rpc/link#typesafe-clients).
:::

## Transfer

By default, oRPC serializes request/response messages to string/binary data before sending over message port. If needed, you can define the `transfer` option to utilize full power of [MessagePort: postMessage() method](https://developer.mozilla.org/en-US/docs/Web/API/MessagePort/postMessage), such as transferring ownership of objects to the other side or support unserializable objects like `OffscreenCanvas`.

<CodeGroup>

```ts handler
const handler = new RPCHandler(router, {
  experimental_transfer: (message, port) => {
    const transfer = deepFindTransferableObjects(message) // implement your own logic
    return transfer.length ? transfer : null // only enable when needed
  }
})
```

```ts link
const link = new RPCLink({
  experimental_transfer: (message) => {
    const transfer = deepFindTransferableObjects(message) // implement your own logic
    return transfer.length ? transfer : null // only enable when needed
  }
})
```

</CodeGroup>

:::info
When `transfer` returns an array, messages are sent using [the structured clone algorithm](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm), which doesn't support all data types. If you need to support additional data types, consider customizing your [RPC Serializer](/docs/rpc/serializer).
:::
