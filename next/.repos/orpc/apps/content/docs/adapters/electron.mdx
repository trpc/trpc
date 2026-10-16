---
title: "Electron Adapter"
description: "Use oRPC for typesafe communication between Electron processes via the Message Port Adapter."
sidebar:
  label: "Electron"
---

Establish typesafe communication between processes in [Electron](https://www.electronjs.org/) using the [Message Port Adapter](/docs/adapters/message-port). Before you start, we recommend reading the [MessagePorts in Electron](https://www.electronjs.org/docs/latest/tutorial/message-ports) guide.

## Main Process

Listen for a port sent from the renderer, then upgrade it:

```ts
import { onError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/message-port'
import { app, ipcMain } from 'electron'

const handler = new RPCHandler(router, {
  interceptors: [
    onError((error) => {
      console.error(error)
    }),
  ],
})

app.whenReady().then(() => {
  ipcMain.on('start-orpc-server', async (event) => {
    const [serverPort] = event.ports

    handler.upgrade(serverPort, {
      /**
       * Provide initial context if needed. The context can be an async function
       * that receives the per-call request as its first argument, and is **not**
       * related to the initial upgrade request.
       */
      context: request => ({}),
    })

    serverPort.start()
  })
})
```

:::info
Channel `start-orpc-server` is arbitrary. You can use any name that fits your needs.
:::

## Preload Process

Receive the port from the renderer and forward it to the main process:

```ts
import { ipcRenderer } from 'electron'

window.addEventListener('message', (event) => {
  if (event.data === 'start-orpc-client') {
    const [serverPort] = event.ports

    ipcRenderer.postMessage('start-orpc-server', null, [serverPort])
  }
})
```

## Renderer Process

Create a `MessageChannel`, send one port to the preload script, and use the other to initialize the client link:

```ts
import { RPCLink } from '@orpc/client/message-port'

const { port1: clientPort, port2: serverPort } = new MessageChannel()

window.postMessage('start-orpc-client', '*', [serverPort])

const link = new RPCLink({
  port: clientPort,
})

clientPort.start()
```

:::info
The examples above only show how to configure the link. For examples of creating a typesafe client, see [RPC Link](/docs/rpc/link#typesafe-clients).
:::
