---
title: "Worker Threads Adapter"
description: "Use oRPC for typesafe communication between Node.js Worker Threads via the Message Port Adapter."
sidebar:
  label: "Worker Threads"
---

Use [Node.js Worker Threads](https://nodejs.org/api/worker_threads.html) with oRPC for typesafe inter-thread communication via the [Message Port Adapter](/docs/adapters/message-port).

## Worker Thread

Listen for a `MessagePort` sent from the main thread and upgrade it:

```ts
import { parentPort } from 'node:worker_threads'
import { onError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/message-port'

const handler = new RPCHandler(router, {
  interceptors: [
    onError((error) => {
      console.error(error)
    }),
  ],
})

parentPort?.on('message', (message) => {
  if (message instanceof MessagePort) {
    handler.upgrade(message, {
      /**
       * Provide initial context if needed. The context can be an async function
       * that receives the per-call request as its first argument, and is **not**
       * related to the initial upgrade request.
       */
      context: request => ({}),
    })

    message.start()
  }
})
```

## Main Thread

Create a `MessageChannel`, send one port to the worker thread, and use the other to initialize the client link:

```ts
import { MessageChannel, Worker } from 'node:worker_threads'
import { RPCLink } from '@orpc/client/message-port'

const { port1: clientPort, port2: serverPort } = new MessageChannel()

const worker = new Worker(new URL('./some-worker.js', import.meta.url))

worker.postMessage(serverPort, [serverPort])

const link = new RPCLink({
  port: clientPort
})

clientPort.start()
```

:::info
The examples above only show how to configure the link. For examples of creating a typesafe client, see [RPC Link](/docs/rpc/link#typesafe-clients).
:::
