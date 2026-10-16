---
title: "Browser Adapter"
description: "Use oRPC for typesafe communication between browser scripts via the Message Port Adapter."
sidebar:
  label: "Browser"
---

Enable typesafe communication between browser scripts using the [Message Port Adapter](/docs/adapters/message-port).

## Between Extension Scripts

To set up communication between scripts in a browser extension (e.g. background, content, popup), configure one script to listen for connections and upgrade them, and another to initiate the connection.

:::warning
The browser extension [Message Passing API](https://developer.chrome.com/docs/extensions/develop/concepts/messaging) does not support transferring binary data, which means oRPC features like `File` and `Blob` cannot be used natively. However, you can temporarily work around this limitation by extending the [RPC Serializer](/docs/rpc/serializer) to encode binary data as `base64`.
:::

<CodeGroup>

```ts server
import { onError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/message-port'

const handler = new RPCHandler(router, {
  interceptors: [
    onError((error) => {
      console.error(error)
    }),
  ],
})

browser.runtime.onConnect.addListener((port) => {
  handler.upgrade(port, {
    /**
     * Provide initial context if needed. The context can be an async function
     * that receives the per-call request as its first argument, and is **not**
     * related to the initial upgrade request.
     */
    context: request => ({}),
  })
})
```

```ts client
import { RPCLink } from '@orpc/client/message-port'

const port = browser.runtime.connect()

const link = new RPCLink({
  port,
})
```

</CodeGroup>

:::info
The examples above only show how to configure the link. For examples of creating a typesafe client, see [RPC Link](/docs/rpc/link#typesafe-clients).
:::

## Window to Window

To enable communication between two window contexts (e.g. parent and popup), one must listen and upgrade the port, and the other must initiate the connection.

<CodeGroup>

```ts opener
import { onError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/message-port'

const handler = new RPCHandler(router, {
  interceptors: [
    onError((error) => {
      console.error(error)
    }),
  ],
})

window.addEventListener('message', (event) => {
  if (event.data instanceof MessagePort) {
    handler.upgrade(event.data, {
      /**
       * Provide initial context if needed. The context can be an async function
       * that receives the per-call request as its first argument, and is **not**
       * related to the initial upgrade request.
       */
      context: request => ({}),
    })

    event.data.start()
  }
})

window.open('/example/popup', 'popup', 'width=680,height=520')
```

```ts popup
import { RPCLink } from '@orpc/client/message-port'

const { port1: serverPort, port2: clientPort } = new MessageChannel()

window.opener.postMessage(serverPort, '*', [serverPort])

const link = new RPCLink({
  port: clientPort,
})

clientPort.start()
```

</CodeGroup>

## Advanced Relay Pattern

In some advanced cases, direct communication between scripts isn't possible. For example, a content script running in the ["MAIN" world](https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts#world-timings) cannot directly communicate with the background script using `browser.runtime` or `chrome.runtime` APIs.

To work around this, you can use a **relay pattern**: an additional content script running in the **"ISOLATED" (default) world** relays messages between the two contexts, enabling communication where direct access is restricted.

<CodeGroup>

```ts relay
window.addEventListener('message', (event) => {
  if (event.data instanceof MessagePort) {
    const port = browser.runtime.connect()

    // Relay `message` and `close/disconnect` events between the MessagePort and runtime.Port

    event.data.addEventListener('message', (event) => {
      port.postMessage(event.data)
    })

    event.data.addEventListener('close', () => {
      port.disconnect()
    })

    port.onMessage.addListener((message) => {
      event.data.postMessage(message)
    })

    port.onDisconnect.addListener(() => {
      event.data.close()
    })

    event.data.start()
  }
})
```

```ts server
import { onError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/message-port'

const handler = new RPCHandler(router, {
  interceptors: [
    onError((error) => {
      console.error(error)
    }),
  ],
})

browser.runtime.onConnect.addListener((port) => {
  handler.upgrade(port, {
    /**
     * Provide initial context if needed. The context can be an async function
     * that receives the per-call request as its first argument, and is **not**
     * related to the initial upgrade request.
     */
    context: request => ({}),
  })
})
```

```ts client
import { RPCLink } from '@orpc/client/message-port'

const { port1: serverPort, port2: clientPort } = new MessageChannel()

window.postMessage(serverPort, '*', [serverPort])

const link = new RPCLink({
  port: clientPort,
})

clientPort.start()
```

</CodeGroup>
