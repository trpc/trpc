---
title: "Web Workers Adapter"
description: "Use oRPC for typesafe communication with Web Workers via the Message Port Adapter."
sidebar:
  label: "Web Workers"
---

[Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Worker) allow JavaScript code to run in background threads, separate from the main thread of a web page. This prevents blocking the UI while performing computationally intensive tasks. Web Workers are also supported in modern runtimes like [Bun](https://bun.com/docs/api/workers), [Deno](https://docs.deno.com/examples/web_workers/), etc.

With oRPC, you can establish typesafe communication channels between your main thread and Web Workers through the [Message Port Adapter](/docs/adapters/message-port).

## Web Worker

Configure your Web Worker to handle oRPC requests by upgrading it with a message port handler:

```ts
import { onError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/message-port'

const handler = new RPCHandler(router, {
  interceptors: [
    onError((error) => {
      console.error(error)
    }),
  ],
})

handler.upgrade(self, {
  /**
   * Provide initial context if needed. The context can be an async function
   * that receives the per-call request as its first argument, and is **not**
   * related to the initial upgrade request.
   */
  context: request => ({}),
})
```

## Main Thread

Create a link to communicate with your Web Worker:

```ts
import { RPCLink } from '@orpc/client/message-port'

export const link = new RPCLink({
  port: new Worker('some-worker.js')
})
```

<Expandable title="Using Web Workers in Vite Applications?">

You can leverage the [Vite Web Workers feature](https://vite.dev/guide/features.html#web-workers) for streamlined development:

```ts
import { RPCLink } from '@orpc/client/message-port'
import SomeWorker from './some-worker.ts?worker'

export const link = new RPCLink({
  port: new SomeWorker()
})
```

</Expandable>

:::info
The examples above only show how to configure the link. For examples of creating a typesafe client, see [RPC Link](/docs/rpc/link#typesafe-clients).
:::
